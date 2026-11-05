"""Ubica el diseño de Tempo sobre la malla del escaneo: emblema del dorso, placa TEMPO del puño,
emblema lateral, y ojales y lengüeta para el modelo de cordones.

Se usa desde procesar_escaneo.py, o solo para recalcular sobre el modelo ya procesado:
    python3 herramientas/detalles_escaneo.py models/tempo-scan
Ejes del modelo: Y hacia los dedos, +Z dorso, +X pulgar. Unidad "palma" (alto 2,35).
"""
import json, sys
import numpy as np


def raycaster(V, N, F):
    TV = V[F]; E1 = TV[:, 1] - TV[:, 0]; E2 = TV[:, 2] - TV[:, 0]; NF = N[F]
    def cast(o, d):
        """Primer impacto exacto rayo-triángulo (Möller-Trumbore) y normal suavizada."""
        P = o.copy(); Nn = np.tile(-d, (len(o), 1)); hit = np.zeros(len(o), bool)
        pv = np.cross(d, E2); det = (E1 * pv).sum(1); ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
        for r in range(len(o)):
            tv = o[r] - TV[:, 0]
            u = (tv * pv).sum(1) * inv; qv = np.cross(tv, E1); v = (qv * d).sum(1) * inv; t = (E2 * qv).sum(1) * inv
            good = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
            if good.any():
                k = np.where(good)[0][np.argmin(t[good])]; hit[r] = True
                P[r] = o[r] + d * t[k]; n = NF[k, 0] * (1 - u[k] - v[k]) + NF[k, 1] * u[k] + NF[k, 2] * v[k]
                Nn[r] = n / np.linalg.norm(n)
        return P, Nn, hit
    return cast


def details(V, N, F):
    V = np.asarray(V, float); N = np.asarray(N, float); F = np.asarray(F)
    cast = raycaster(V, N, F)

    def grid(center, u, v, d, w, h, nx, ny):
        """Rejilla proyectada sobre la superficie: columnas a lo largo de u, filas a lo largo de v."""
        center, u, v, d = (np.array(a, float) for a in (center, u, v, d))
        a, b = np.meshgrid(np.linspace(-w / 2, w / 2, nx), np.linspace(-h / 2, h / 2, ny))
        o = center[None] + a.reshape(-1, 1) * u + b.reshape(-1, 1) * v - d * 2.0
        P, Nn, got = cast(o, d)
        if not got.all():
            j = np.argmin(np.linalg.norm(o[~got, None] - o[None, got], axis=2), axis=1)
            P[~got] = P[got][j]; Nn[~got] = Nn[got][j]
        # suavizar un poco las normales de la rejilla para que el calco no copie cada arruga
        Ng = Nn.reshape(ny, nx, 3).copy()
        for _ in range(2):
            Ng[1:-1, 1:-1] = (Ng[1:-1, 1:-1] * 2 + Ng[:-2, 1:-1] + Ng[2:, 1:-1] + Ng[1:-1, :-2] + Ng[1:-1, 2:]) / 6
        Ng /= np.linalg.norm(Ng, axis=2, keepdims=True)
        return dict(nx=nx, ny=ny, w=w, h=h, pts=np.concatenate([P, Ng.reshape(-1, 3)], 1).round(5).tolist())

    X, Z = [1, 0, 0], [0, 0, 1]
    # lado del meñique (−X) a la altura del acolchado: centro en profundidad
    band = np.abs(V[:, 1] - 1.30) < 0.05
    side_x = V[band, 0].min(); near = band & (V[:, 0] < side_x + 0.08)
    side_z = float(np.median(V[near, 2]))
    # frente del puño del lado de la palma (−Z): centro en x
    cuffb = (V[:, 1] > -0.30) & (V[:, 1] < 0.10)
    zmin = V[cuffb, 2].min(); palm = cuffb & (V[:, 2] < zmin + 0.10)
    palm_x = float((V[palm, 0].min() + V[palm, 0].max()) / 2)

    decals = dict(
        # emblema (laureles y reloj de arena) en la parte lisa del acolchado del dorso
        emblem=grid([-0.10, 1.38, 0], X, [0, 1, 0], [0, 0, -1], 0.60, 0.60, 27, 27),
        # placa TEMPO sobre la faja del puño (dorso)
        plaque=grid([-0.08, 0.075, 0], X, [0, 1, 0], [0, 0, -1], 0.48, 0.185, 25, 11),
        # emblema chico en el costado del meñique, mirado desde afuera (−X): la derecha es +Z
        side=grid([0, 1.30, side_z], Z, [0, 1, 0], X, 0.30, 0.30, 15, 15),
        # lengüeta bajo los cordones, del lado de la palma, mirada desde afuera (−Z): la derecha es −X
        tongue=grid([palm_x, -0.12, 0], [-1, 0, 0], [0, 1, 0], Z, 0.17, 0.58, 9, 21),
    )
    eyes = []
    for y in np.linspace(-0.38, 0.12, 5):
        for dx in (-0.105, 0.105):
            P, Nn, hit = cast(np.array([[palm_x + dx, y, -2.0]]), np.array([0, 0, 1.0]))
            eyes.append(np.concatenate([P[0], Nn[0]]).round(5).tolist())
    info = dict(side_x=round(float(side_x), 3), side_z=round(side_z, 3), palm_x=round(palm_x, 3))
    return decals, eyes, info


def load_model(prefix):
    meta = json.load(open(prefix + '.json')); buf = open(prefix + '.bin', 'rb').read()
    nv, nf = meta['counts']['v'], meta['counts']['f']
    V = np.frombuffer(buf, np.float32, nv * 3).reshape(-1, 3)
    N = np.frombuffer(buf, np.int16, nv * 3, nv * 12).reshape(-1, 3) / 32767
    o = nv * 12 + nv * 6 + nv * 8 + nv + meta['aoPad']
    F = np.frombuffer(buf, np.uint32, nf * 3, o).reshape(-1, 3)
    return meta, V, N, F


if __name__ == '__main__':
    prefix = sys.argv[1] if len(sys.argv) > 1 else 'models/tempo-scan'
    meta, V, N, F = load_model(prefix)
    decals, eyes, info = details(V, N, F)
    meta['decals'] = decals; meta['eyelets'] = eyes; meta['design'] = 'tempo-1'
    json.dump(meta, open(prefix + '.json', 'w'))
    print('detalles listos', info)
