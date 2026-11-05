# Modelos escaneados del guante (opcional)

Poné acá el escaneo 3D del guante real en formato **.glb** y la app lo usa en lugar del guante generado por código.

1. Escaneá el guante con una app de escaneo 3D para celular (por ejemplo Polycam, KIRI Engine o Luma AI). Revisá qué incluye la versión gratuita de cada una.
   - Buena luz pareja, sin sol directo ni flash.
   - Guante apoyado sobre un soporte, con el puño cerrado y la apertura del puño hacia abajo.
   - Dá dos o tres vueltas completas a distintas alturas.
2. Exportá en **.glb** y dejá el archivo en esta carpeta, por ejemplo `models/elite-blanco.glb`. Conviene que pese menos de 10 MB.
3. En `index.html`, dentro de `CONFIG.models`, agregá la ruta al modelo:

```js
elite: { name:'Tempo Elite', ..., glb: { blanco:'models/elite-blanco.glb', negro:'models/elite-negro.glb' } },
```

Si hay un solo archivo para todos los colores: `glb: 'models/elite.glb'`.

4. Si el guante aparece girado o corrido, ajustá `CONFIG.glbFit`:
   - `up`: eje que apunta hacia los dedos en el archivo (`'y'`, `'z'` o `'x'`).
   - `back`: `'z'` si el dorso mira hacia +Z, o `'-z'` si mira al revés.
   - `thumb`: `1` si en el archivo el pulgar está del lado +X, `-1` si está del lado −X.
   - `length`: largo total del guante medido en "palmas" (largo de la palma, de la muñeca al nudillo del dedo medio). Valor por defecto: 2.37.
   - `wrist`: a qué altura del guante queda la muñeca, de 0 (abajo del puño) a 1 (punta). Valor por defecto: 0.22.
