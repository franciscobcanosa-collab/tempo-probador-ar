"""Convierte el escaneo 3D de un guante real al formato del probador (models/tempo-scan.bin + .json).

Escaneo usado: "Boxing Glove 3D-scan by CreativeTools" (CreativeTools, CC BY-SA 4.0)
https://sketchfab.com/3d-models/boxing-glove-3d-scan-by-creativetools-c46261e951c34455bba5f1cc6dbea076
Copia pública en el dataset Objaverse (Allen AI), que se descarga sin iniciar sesión.

Uso:
    pip install numpy scipy trimesh fast-simplification xatlas
    python3 herramientas/procesar_escaneo.py models/tempo-scan [archivo.glb | URL]

El escaneo viene en milímetros, parado sobre el puño (Y hacia arriba), con el pulgar hacia -X
y el abrojo (dorso) hacia -Z. El probador usa: Y hacia los dedos, +Z dorso, +X pulgar, y la
unidad "palma" (el guante mide 2,35 de alto, con el borde del puño en y = -0,5).
"""
import io, json, sys, time, urllib.request
import numpy as np
import trimesh, fast_simplification, xatlas
from scipy import ndimage

URL = ('https://huggingface.co/datasets/allenai/objaverse/resolve/main/'
       'glbs/000-053/c46261e951c34455bba5f1cc6dbea076.glb')
CREDIT = dict(title='Boxing Glove 3D-scan by CreativeTools', author='CreativeTools (https://sketchfab.com/creativetools)',
              license='CC BY-SA 4.0', licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',
              source='https://sketchfab.com/3d-models/boxing-glove-3d-scan-by-creativetools-c46261e951c34455bba5f1cc6dbea076',
              changes='Simplificado, reorientado, escalado, con UV y sombreado de oclusión; materiales y logo agregados por el probador.')
HEIGHT = 2.35          # alto total del guante en unidades "palma"
CUFF_BOTTOM = -0.50    # borde del puño
TARGET_FACES = 60000
THUMB_NEG = True       # en el escaneo de CreativeTools el pulgar está en -X y el abrojo en -Z


def load(src):
    t0 = time.time()
    if src.startswith('http'):
        print('descargando', src)
        data = urllib.request.urlopen(src, timeout=600).read()
        scene = trimesh.load(io.BytesIO(data), file_type='glb', force='scene')
    else:
        scene = trimesh.load(src, force='scene')
    m = scene.to_geometry() if hasattr(scene, 'to_geometry') else scene.dump(concatenate=True)
    print('cargado', len(m.vertices), 'vértices', len(m.faces), 'caras', f'{time.time()-t0:.1f}s')
    # el archivo de Sketchfab trae la misma malla repetida 4 veces: unir vértices y quitar caras repetidas
    m.merge_vertices(digits_vertex=4)
    key = np.sort(m.faces, axis=1)
    _, keep = np.unique(key, axis=0, return_index=True)
    m = trimesh.Trimesh(m.vertices, m.faces[np.sort(keep)], process=True)
    m.remove_unreferenced_vertices()
    print('sin repetidos', len(m.vertices), 'vértices', len(m.faces), 'caras')
    return m


def orient(m):
    v = m.vertices.copy()
    ext = v.max(0) - v.min(0)
    print('medidas originales (mm)', ext.round(1))
    if np.argmax(ext) != 1:
        raise SystemExit('Se esperaba el escaneo parado sobre el puño (Y hacia arriba).')
    y0, y1 = v[:, 1].min(), v[:, 1].max(); H = y1 - y0
    # pulgar: el lado con más volumen a media altura de la parte acolchada
    cuff = (v[:, 1] > y0 + 0.08 * H) & (v[:, 1] < y0 + 0.25 * H)
    cx, cz = v[cuff, 0].mean(), v[cuff, 2].mean()
    thumb_neg = THUMB_NEG   # comprobado mirando el escaneo desde los cuatro lados
    # girar 180° alrededor de Y (no espeja): pulgar a +X y abrojo a +Z
    if thumb_neg:
        v[:, 0] = -(v[:, 0] - cx); v[:, 2] = -(v[:, 2] - cz)
    else:
        v[:, 0] = v[:, 0] - cx; v[:, 2] = v[:, 2] - cz
    s = HEIGHT / H
    v[:, 1] = (v[:, 1] - y0) * s + CUFF_BOTTOM; v[:, 0] *= s; v[:, 2] *= s
    print('escala', round(s, 6), 'unidades por mm; pulgar estaba en', '-X' if thumb_neg else '+X')
    return trimesh.Trimesh(v, m.faces, process=False), s


def sdf_grid(m, pitch):
    vg = m.voxelized(pitch).fill()
    occ = np.pad(vg.matrix, 6)            # margen vacío alrededor para que el campo sea positivo afuera
    din = ndimage.distance_transform_edt(occ) * pitch
    dout = ndimage.distance_transform_edt(~occ) * pitch
    sd = (dout - din).astype(np.float32)
    origin = vg.transform[:3, 3] - 6 * pitch
    return sd, origin


def sample(sd, origin, pitch, p):
    idx = ((p - origin) / pitch).T
    return ndimage.map_coordinates(sd, idx, order=1, mode='constant', cval=1.0)


def main(out_prefix, src):
    t0 = time.time()
    m = load(src)
    m, s = orient(m)
    trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=-0.53, iterations=3)   # quita ruido del escáner sin perder pliegues
    v2, f2 = fast_simplification.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int64),
                                          target_reduction=max(0.0, 1 - TARGET_FACES / len(m.faces)))
    g = trimesh.Trimesh(v2, f2, process=True)
    g.remove_unreferenced_vertices(); g.fix_normals()
    print('simplificado', len(g.vertices), len(g.faces), f'{time.time()-t0:.1f}s')
    V0 = g.vertices.astype(np.float64); N0 = g.vertex_normals.astype(np.float64)
    # oclusión ambiental desde un campo de distancias
    pitch = 0.012
    sd, origin = sdf_grid(g, pitch)
    ao = np.ones(len(V0)); w = 1.0
    for i in range(1, 7):
        h = 0.035 * i
        d = sample(sd, origin, pitch, V0 + N0 * h)
        ao -= w * np.clip(h - d, 0, None) * 2.2; w *= 0.6
    ao = np.clip(ao, 0.25, 1.0)
    bottom = (V0[:, 1] < CUFF_BOTTOM + 0.02) & (N0[:, 1] < -0.6)      # tapa del puño: se ve como la abertura
    ao[bottom] = 0.12
    print('oclusión lista', f'{time.time()-t0:.1f}s')
    # UV
    vmap, idx, uvs = xatlas.parametrize(V0.astype(np.float32), g.faces.astype(np.uint32))
    V = V0[vmap].astype(np.float32); N = N0[vmap].astype(np.float32); A = ao[vmap]; F = idx.astype(np.uint32)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    if (np.einsum('ij,ij->i', fn, N[F[:, 0]]) < 0).mean() > 0.5: F = F[:, ::-1].copy()
    area3 = np.linalg.norm(fn, axis=1).sum() / 2
    e1 = uvs[F[:, 1]] - uvs[F[:, 0]]; e2 = uvs[F[:, 2]] - uvs[F[:, 0]]
    uvscale = float(np.sqrt(area3 / (np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum() / 2)))
    print('uv', len(V), 'escala', round(uvscale, 3), f'{time.time()-t0:.1f}s')

    # calcos (logo): rejilla proyectada sobre la superficie desde el dorso
    TV = V0[g.faces]; E1 = TV[:, 1] - TV[:, 0]; E2 = TV[:, 2] - TV[:, 0]; NF = N0[g.faces]
    def raycast(o, d):
        """Intersección exacta rayo-triángulo (Möller-Trumbore); devuelve el primer impacto y la normal suavizada."""
        P = o.copy(); Nn = np.tile(-d[0], (len(o), 1)); hit = np.zeros(len(o), bool)
        for r in range(len(o)):
            pv = np.cross(d[r], E2); det = (E1 * pv).sum(1); ok = np.abs(det) > 1e-12
            inv = np.where(ok, 1 / np.where(ok, det, 1), 0); tv = o[r] - TV[:, 0]
            u = (tv * pv).sum(1) * inv; qv = np.cross(tv, E1); v = (qv * d[r]).sum(1) * inv; t = (E2 * qv).sum(1) * inv
            good = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
            if good.any():
                k = np.where(good)[0][np.argmin(t[good])]; hit[r] = True
                P[r] = o[r] + d[r] * t[k]; n = NF[k, 0] * (1 - u[k] - v[k]) + NF[k, 1] * u[k] + NF[k, 2] * v[k]; Nn[r] = n / np.linalg.norm(n)
        return P, Nn, hit
    def decal_grid(cx, cy, w, h, side=1, nx=33, ny=9):
        gx, gy = np.meshgrid(np.linspace(cx - w / 2, cx + w / 2, nx), np.linspace(cy - h / 2, cy + h / 2, ny))
        o = np.stack([gx.ravel(), gy.ravel(), np.full(gx.size, 1.2 * side)], -1)
        d = np.tile([0, 0, -side], (len(o), 1)).astype(float)
        P, Nn, got = raycast(o, d)
        if not got.all():   # rellenar huecos con el vecino
            j = np.argmin(np.linalg.norm(o[~got, None, :2] - o[None, got, :2], axis=2), axis=1)
            P[~got] = P[got][j]; Nn[~got] = Nn[got][j]
        return dict(nx=nx, ny=ny, w=w, h=h, side=side, pts=np.concatenate([P, Nn], 1).round(5).tolist())
    # zona plana del dorso, arriba del abrojo, y sobre la faja de abrojo
    yb = lambda mm: mm * s + CUFF_BOTTOM
    decals = dict(logo=decal_grid(0.0, yb(175), 0.60, 0.18), cuffLogo=decal_grid(0.0, yb(48), 0.40, 0.12))
    meta = dict(version=1, units='palma', scan=CREDIT, uvScale=uvscale, pivot=0.40, cuffY0=CUFF_BOTTOM, cuffY1=yb(88),
                counts=dict(v=len(V), f=len(F)), seams=[], decals=decals, eyelets=[], strapRings=[])
    with open(out_prefix + '.bin', 'wb') as fh:
        fh.write(V.tobytes()); fh.write((N * 32767).astype(np.int16).tobytes()); fh.write(uvs.astype(np.float32).tobytes())
        fh.write((A * 255).astype(np.uint8).tobytes())
        pad = (4 - (len(A) % 4)) % 4; fh.write(b'\0' * pad); meta['aoPad'] = pad
        fh.write(F.tobytes())
    with open(out_prefix + '.json', 'w') as fh: json.dump(meta, fh)
    ext = V.max(0) - V.min(0)
    print('listo', f'{time.time()-t0:.1f}s', 'medidas', ext.round(3), 'y', V[:, 1].min().round(3), V[:, 1].max().round(3))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'models/tempo-scan', sys.argv[2] if len(sys.argv) > 2 else URL)
