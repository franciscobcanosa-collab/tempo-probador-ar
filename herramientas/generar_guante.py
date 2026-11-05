"""Generador del guante Tempo esculpido (campo de distancia + marching cubes).
Salida: models/tempo-glove.bin (geometría) y models/tempo-glove.json (descriptor, costuras, ojales, logos, anillos).
Unidades: 1 = largo de la palma (muñeca -> nudillo del dedo medio). Y hacia los dedos, Z+ hacia el dorso, X+ lado del pulgar."""
import json, sys, time
import numpy as np
from skimage import measure
import fast_simplification, xatlas

P = dict(
    voxel=0.0115,
    cuff_y0=-0.50, cuff_y1=0.28, cuff_r0=0.425, cuff_r1=0.49, cuff_zs=0.82,
)

# ---------------- primitivas SDF (vectorizadas) ----------------
def length(v): return np.sqrt((v * v).sum(-1))
def sd_ellipsoid(p, c, r):
    q = (p - c) / r
    k0 = length(q); k1 = length(q / r)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)
def sd_capsule(p, a, b, r):
    pa = p - a; ba = np.asarray(b) - np.asarray(a)
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return length(pa - h[..., None] * ba) - r
def sd_capsule_tapered(p, a, b, ra, rb):
    pa = p - a; ba = np.asarray(b) - np.asarray(a)
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return length(pa - h[..., None] * ba) - (ra + (rb - ra) * h)
def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)
def smax(a, b, k): return -smin(-a, -b, k)

def cuff_sd(p):
    q = p.copy(); q[..., 2] = q[..., 2] / P['cuff_zs']
    y0, y1, r0, r1 = P['cuff_y0'], P['cuff_y1'], P['cuff_r0'], P['cuff_r1']
    t = np.clip((q[..., 1] - y0) / (y1 - y0), 0, 1)
    r = r0 + (r1 - r0) * (t * t * (3 - 2 * t)) - 0.015 * np.exp(-((q[..., 1] - (y0 + 0.12)) ** 2) / 0.01)
    radial = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - r
    cap = np.maximum(y0 - q[..., 1], q[..., 1] - (y1 + 0.3))
    return np.maximum(radial, cap) * 0.85

def fist_sd(p):
    # proporciones de un guante de 16 oz: ~1,3 palmas de ancho y ~1,15 de profundidad en el puño
    d = sd_ellipsoid(p, np.array([0.0, 1.02, -0.06]), np.array([0.64, 0.64, 0.55]))
    top = sd_ellipsoid(p, np.array([0.0, 1.33, -0.13]), np.array([0.58, 0.46, 0.46]))                  # cabeza acolchada, redondeada
    front = sd_capsule(p, np.array([-0.24, 1.00, -0.36]), np.array([0.24, 1.00, -0.36]), 0.31)          # dedos doblados (frente)
    back = sd_ellipsoid(p, np.array([0.0, 0.68, 0.05]), np.array([0.56, 0.66, 0.42]))                   # dorso, liso hasta la muñeca
    d = smin(d, top, 0.22); d = smin(d, front, 0.26); d = smin(d, back, 0.24)
    pocket = sd_ellipsoid(p, np.array([0.0, 0.56, -0.64]), np.array([0.34, 0.22, 0.14]))               # leve concavidad de la palma
    d = smax(d, -pocket, 0.14)
    return d

def thumb_sd(p, s=1.0):
    a = np.array([0.37 * s, 0.46, -0.17]); b = np.array([0.545 * s, 0.76, -0.33]); c = np.array([0.47 * s, 1.04, -0.51]); e = np.array([0.355 * s, 1.15, -0.57])
    t1 = sd_capsule_tapered(p, a, b, 0.16, 0.16)
    t2 = sd_capsule_tapered(p, b, c, 0.16, 0.14)
    t3 = sd_capsule_tapered(p, c, e, 0.14, 0.12)
    return smin(smin(t1, t2, 0.06), t3, 0.05)

def groove(d_base, region, depth=0.016, k=0.006):
    """Surco: quita material dentro de 'region' (<0) pero solo hasta 'depth' bajo la superficie."""
    g = np.maximum(region, -d_base - depth)
    return smax(d_base, -g, k)

def glove_sd(p, with_thumb=True):
    d = smin(fist_sd(p), cuff_sd(p), 0.26)
    # surcos de costura: paneles laterales, unión con el puño del guante y línea de nudillos
    y = p[..., 1]; x = p[..., 0]
    w = 0.010
    side = np.minimum(np.abs(x - 0.47), np.abs(x + 0.47)) - w
    side = np.maximum(side, 0.36 - y)
    d = groove(d, side)
    ring = np.maximum(np.abs(y - P['cuff_y1']) - w, -(p[..., 2] + 2))                       # anillo completo
    d = groove(d, ring)
    if with_thumb:
        d = smin(d, thumb_sd(p, 1.0), 0.07)
    # ribete del borde del puño
    q = p.copy(); q[..., 2] = q[..., 2] / P['cuff_zs']
    rr = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2)
    torus = np.sqrt((rr - (P['cuff_r0'] - 0.005)) ** 2 + (q[..., 1] - (P['cuff_y0'] + 0.02)) ** 2) - 0.048
    d = smin(d, torus * 0.85, 0.02)
    # abrir el puño por abajo (para ver el forro)
    inner = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - (P['cuff_r0'] - 0.055)
    hole = np.maximum(inner, P['cuff_y0'] + 0.20 - y)
    hole = np.maximum(inner, -(y - (P['cuff_y0'] - 0.2)))
    hole = np.maximum(hole, y - (P['cuff_y0'] + 0.22))
    d = smax(d, -hole, 0.02)
    return d

# ---------------- utilidades de superficie ----------------
def sdf_points(pts, **kw): return glove_sd(np.asarray(pts, dtype=np.float64), **kw)
def grad(pts, eps=1e-3, **kw):
    pts = np.asarray(pts, dtype=np.float64); g = np.zeros_like(pts)
    for i in range(3):
        e = np.zeros(3); e[i] = eps
        g[:, i] = sdf_points(pts + e, **kw) - sdf_points(pts - e, **kw)
    n = g / np.maximum(length(g)[:, None], 1e-9); return n
def raycast(origins, dirs, tmax=3.0, **kw):
    """Avanza desde 'origins' en 'dirs' hasta tocar la superficie (sphere tracing)."""
    o = np.asarray(origins, float); dv = np.asarray(dirs, float); dv = dv / length(dv)[:, None]
    t = np.zeros(len(o)); hit = np.zeros(len(o), bool)
    for _ in range(300):
        p = o + dv * t[:, None]; d = sdf_points(p, **kw)
        hit |= d < 1e-4
        t = np.where(hit, t, t + np.maximum(d * 0.8, 2e-4))
        if hit.all() or (t > tmax).all(): break
    p = o + dv * t[:, None]
    return p, grad(p, **kw), hit

def ao_bake(v, n):
    ao = np.ones(len(v)); w = 1.0
    for i in range(1, 7):
        h = 0.035 * i
        d = sdf_points(v + n * h)
        ao -= w * np.clip(h - d, 0, None) * 2.2
        w *= 0.6
    return np.clip(ao, 0.25, 1.0)

def main(out_prefix):
    t0 = time.time(); vx = P['voxel']
    xs = np.arange(-0.86, 0.86 + vx, vx); ys = np.arange(-0.78, 1.98 + vx, vx); zs = np.arange(-0.98, 0.72 + vx, vx)
    print('grilla', len(xs), len(ys), len(zs))
    vol = np.empty((len(xs), len(ys), len(zs)), np.float32)
    Y, Z = np.meshgrid(ys, zs, indexing='ij')
    for i, x in enumerate(xs):                       # por cortes para ahorrar memoria
        pts = np.stack([np.full_like(Y, x), Y, Z], -1)
        vol[i] = glove_sd(pts)
    verts, faces, _, _ = measure.marching_cubes(vol, 0.0, spacing=(vx, vx, vx))
    verts += np.array([xs[0], ys[0], zs[0]])
    # orientar caras hacia afuera comparando con el gradiente del campo
    cen = verts[faces].mean(1); fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
    sample = np.random.default_rng(0).choice(len(faces), 4000, replace=False)
    if (np.einsum('ij,ij->i', fn[sample], grad(cen[sample])) < 0).mean() > 0.5: faces = faces[:, ::-1]
    print('marching cubes', len(verts), len(faces), f'{time.time()-t0:.1f}s')
    v2, f2 = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int64), target_reduction=1 - 70000 / len(faces))
    print('simplificado', len(v2), len(f2))
    # proyectar vértices a la superficie exacta y normales desde el campo
    v2 = v2.astype(np.float64); n2 = grad(v2)
    for _ in range(2): v2 = v2 - n2 * sdf_points(v2)[:, None]; n2 = grad(v2)
    ao = ao_bake(v2, n2)
    # desenvolver UV
    vmap, idx, uvs = xatlas.parametrize(v2.astype(np.float32), f2.astype(np.uint32))
    V = v2[vmap].astype(np.float32); N = n2[vmap].astype(np.float32); A = ao[vmap]; F = idx.astype(np.uint32)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    if (np.einsum('ij,ij->i', fn, N[F[:, 0]]) < 0).mean() > 0.5: F = F[:, ::-1].copy()
    print('caras hacia afuera:', round(float((np.einsum('ij,ij->i', np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), N[F[:, 0]]) > 0).mean()) * 100, 1), '%')
    # escala UV para que el grano tenga tamaño físico uniforme
    area3 = np.linalg.norm(np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]]), axis=1).sum() / 2
    e1 = uvs[F[:, 1]] - uvs[F[:, 0]]; e2 = uvs[F[:, 2]] - uvs[F[:, 0]]
    areaUV = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum() / 2
    uvscale = float(np.sqrt(area3 / areaUV))
    print('uv', len(V), 'escala', round(uvscale, 3), f'{time.time()-t0:.1f}s')

    # ---------- detalles colocados sobre la superficie ----------
    def plane_seam(xc, offs):
        """Línea de costura en el plano x = xc (de la unión con el puño, por arriba, hasta la palma)."""
        lines = []
        for off in offs:
            ang = np.linspace(np.radians(-75), np.radians(200), 260)
            c = np.array([xc + off, 0.95, -0.05])
            # ángulo 0 = hacia el dorso (+z), 90 = hacia arriba, 180 = hacia la palma (-z)
            dirs = np.stack([np.zeros_like(ang), np.sin(ang), np.cos(ang)], -1)
            o = c + dirs * 1.6
            p, n, hit = raycast(o, -dirs, with_thumb=False)
            keep = hit & (p[:, 1] > P['cuff_y1'] + 0.05)
            lines.append(np.concatenate([p[keep], n[keep]], 1).round(5).tolist())
        return lines
    def ring_seam(y, off=0.0, count=200, with_thumb=False):
        ang = np.linspace(0, 2 * np.pi, count, endpoint=False)
        dirs = np.stack([np.cos(ang), np.zeros_like(ang), np.sin(ang)], -1)
        o = np.array([0, y, 0]) + dirs * 1.5
        p, n, hit = raycast(o, -dirs, with_thumb=with_thumb)
        p = p + n * off
        return np.concatenate([p, n], 1).round(5).tolist()
    seams = []
    for s in (1, -1):
        seams += plane_seam(0.47 * s, (-0.03, 0.03))
    seams += [ring_seam(P['cuff_y1'] - 0.03), ring_seam(P['cuff_y1'] + 0.03, with_thumb=False), ring_seam(P['cuff_y0'] + 0.10)]
    # rejilla para calcos (logo): proyección desde el frente correspondiente
    def decal_grid(cx, cy, w, h, side, nx=33, ny=9):
        gx, gy = np.meshgrid(np.linspace(cx - w / 2, cx + w / 2, nx), np.linspace(cy - h / 2, cy + h / 2, ny))
        o = np.stack([gx.ravel(), gy.ravel(), np.full(gx.size, 1.5 * side)], -1)
        p, n, hit = raycast(o, np.tile([0, 0, -side], (len(o), 1)))
        return dict(nx=nx, ny=ny, w=w, h=h, side=side, pts=np.concatenate([p, n], 1).round(5).tolist())
    decals = dict(logo=decal_grid(0.0, 0.97, 0.66, 0.20, 1), cuffLogo=decal_grid(0.0, -0.13, 0.42, 0.13, 1), tongue=decal_grid(0.0, -0.11, 0.15, 0.58, -1, 9, 19))
    # ojales (lado de la palma del puño)
    eyes = []
    for y in np.linspace(-0.36, 0.14, 5):
        for x in (-0.11, 0.11):
            p, n, hit = raycast(np.array([[x, y, -1.5]]), np.array([[0, 0, 1.0]]))
            eyes.append(np.concatenate([p[0], n[0]]).round(5).tolist())
    # anillos para la faja de abrojo
    strap = [ring_seam(y, 0.0, 160) for y in np.linspace(-0.32, 0.02, 9)]

    meta = dict(version=1, units='palma', uvScale=uvscale, pivot=0.40, cuffY0=P['cuff_y0'], cuffY1=P['cuff_y1'],
                counts=dict(v=len(V), f=len(F)), seams=seams, decals=decals, eyelets=eyes, strapRings=strap)
    # binario: posiciones f32, normales i16, uv f32, ao u8, índices u32
    with open(out_prefix + '.bin', 'wb') as fh:
        fh.write(V.tobytes()); fh.write((N * 32767).astype(np.int16).tobytes()); fh.write(uvs.astype(np.float32).tobytes())
        fh.write((A * 255).astype(np.uint8).tobytes())
        pad = (4 - (len(A) % 4)) % 4; fh.write(b'\0' * pad); meta['aoPad'] = pad
        fh.write(F.tobytes())
    with open(out_prefix + '.json', 'w') as fh: json.dump(meta, fh)
    print('listo', f'{time.time()-t0:.1f}s', 'bin MB', round((V.nbytes + N.nbytes / 2 + uvs.nbytes + A.size + F.nbytes) / 1e6, 2))

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/tempo-probador/models/tempo-glove')
