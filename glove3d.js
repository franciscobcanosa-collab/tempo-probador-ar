/* Tempo · motor 3D del guante (módulo ES)
   - Guante procedural de alta resolución con cuero PBR (grano, rugosidad, oclusión), costuras con puntadas,
     ojales metálicos, cordón, logo dorado metálico y forro interior.
   - Iluminación tomada del video de la cámara (reflejos y color del lugar), estimación de la luz principal,
     sombra de contacto y grano de cámara para que el render se mezcle con la imagen real.
   - Soporte para modelos escaneados (.glb): si CONFIG.models[x].glb tiene una ruta, se usa ese modelo. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { THREE };

let CFG = null;
const TEX = {};
const GRAIN = { uTime: { value: 0 }, uGrain: { value: 0.0 } };
const MATS = new Set();
let ENV_INT = 1;
export function setEnvIntensity(v){ ENV_INT = v; MATS.forEach(m => m.envMapIntensity = v * (m.userData.envMult || 1)); }

/* ===================== Utilidades ===================== */
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ===================== Texturas procedurales ===================== */
function valueNoise(size, cells, rand) {           // ruido de valor periódico (tileable)
  const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rand();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * cells, v = y / size * cells, x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
    const c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
    out[y * size + x] = lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  }
  return out;
}
function makeLeatherTextures(size = 512) {
  const rand = rng(7), cells = 44;
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) { pts[i * 2] = rand(); pts[i * 2 + 1] = rand(); }
  const cellH = new Float32Array(cells * cells); for (let i = 0; i < cellH.length; i++) cellH[i] = 0.65 + 0.35 * rand();
  const crease = valueNoise(size, 24, rng(17));
  const fine = valueNoise(size, 64, rng(3)), mid = valueNoise(size, 12, rng(11)), low = valueNoise(size, 4, rng(5));
  const H = new Float32Array(size * size), E = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size * cells, v = y / size * cells, cx = Math.floor(u), cy = Math.floor(v);
    let f1 = 9, f2 = 9, own = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gy = cy + dy, ix = (gx % cells + cells) % cells, iy = (gy % cells + cells) % cells;
      const px = gx + pts[(iy * cells + ix) * 2], py = gy + pts[(iy * cells + ix) * 2 + 1];
      const d = Math.hypot(u - px, v - py);
      if (d < f1) { f2 = f1; f1 = d; own = iy * cells + ix; } else if (d < f2) f2 = d;
    }
    const edge = sstep(0.0, 0.5, f2 - f1);                  // surcos suaves entre poros
    const dome = 1 - Math.min(1, f1 * f1 * 0.7);
    const i = y * size + x;
    const cr = Math.abs(crease[i] - 0.5) * 2;               // arrugas finas e irregulares
    H[i] = (edge * 0.55 + dome * 0.25) * cellH[own] + fine[i] * 0.12 + (mid[i] - 0.5) * 0.14 - 0.10 * (1 - sstep(0.0, 0.12, cr));
    E[i] = edge;
  }
  const nrm = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4), col = new Uint8Array(size * size * 4);
  const strength = 2.1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const hl = H[y * size + (x - 1 + size) % size], hr = H[y * size + (x + 1) % size];
    const hu = H[((y - 1 + size) % size) * size + x], hd = H[((y + 1) % size) * size + x];
    let nx = (hl - hr) * strength, ny = (hu - hd) * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    nrm[i * 4] = (nx * 0.5 + 0.5) * 255; nrm[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; nrm[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; nrm[i * 4 + 3] = 255;
    const r = 0.46 + 0.16 * (1 - E[i]) + 0.10 * (low[i] - 0.5);
    rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = Math.max(0, Math.min(1, r)) * 255; rough[i * 4 + 3] = 255;
    const c = 0.90 + 0.08 * E[i] + 0.05 * (low[i] - 0.5) + 0.02 * (fine[i] - 0.5);
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = Math.max(0, Math.min(1, c)) * 255; col[i * 4 + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t;
  };
  return { normal: mk(nrm, false), rough: mk(rough, false), color: mk(col, true) };
}
function makeFabricTextures() {                    // tejido para cordón y forro
  const size = 128, n = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = Math.sin((x + y) / size * Math.PI * 2 * 12), b = Math.sin((x - y) / size * Math.PI * 2 * 12);
    const h = (y % 16 < 8 ? a : b);
    const nx = h * 0.35, ny = -h * 0.35, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * size + x) * 4;
    n[i] = (nx / l * 0.5 + 0.5) * 255; n[i + 1] = (ny / l * 0.5 + 0.5) * 255; n[i + 2] = (nz / l * 0.5 + 0.5) * 255; n[i + 3] = 255;
  }
  const t = new THREE.DataTexture(n, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  return { normal: t };
}
function makeLogoTextures() {
  const W = 1024, H = 320, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '400 190px "Archivo Black", "Arial Black", sans-serif';
  if (g.letterSpacing !== undefined) g.letterSpacing = '26px';
  g.fillText('TEMPO', W / 2, H / 2 - 14);
  g.fillRect(200, H - 52, W - 400, 12);
  const alpha = new THREE.CanvasTexture(c); alpha.colorSpace = THREE.NoColorSpace; alpha.anisotropy = 8;
  // relieve del estampado (bump) a partir del mismo dibujo
  const d = g.getImageData(0, 0, W, H).data, nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const ng = nc.getContext('2d'), out = ng.createImageData(W, H);
  const at = (x, y) => d[((Math.min(H - 1, Math.max(0, y))) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (at(x - 2, y) - at(x + 2, y)) * 1.5, ny = (at(x, y - 2) - at(x, y + 2)) * 1.5, l = Math.hypot(nx, ny, 1), i = (y * W + x) * 4;
    out.data[i] = (nx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const normal = new THREE.CanvasTexture(nc); normal.colorSpace = THREE.NoColorSpace;
  return { alpha, normal };
}
function makeShadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ===================== Grano de cámara en los materiales ===================== */
function addGrain(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GRAIN.uTime; sh.uniforms.uGrain = GRAIN.uGrain;
    sh.fragmentShader = 'uniform float uTime;\nuniform float uGrain;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  float gn = fract(sin(dot(gl_FragCoord.xy + vec2(uTime*61.0, uTime*17.0), vec2(12.9898,78.233))) * 43758.5453);\n  gl_FragColor.rgb += (gn - 0.5) * uGrain;');
  };
  mat.customProgramCacheKey = () => 'grain';
  mat.envMapIntensity = ENV_INT * (mat.userData.envMult || 1); MATS.add(mat);
  return mat;
}

/* ===================== Preparación ===================== */
export async function prepare(config) {
  CFG = config;
  try { await Promise.race([document.fonts.load('400 100px "Archivo Black"'), new Promise(r => setTimeout(r, 1500))]); } catch (_) { }
  TEX.leather = makeLeatherTextures(512);
  TEX.fabric = makeFabricTextures();
  TEX.logo = makeLogoTextures();
  TEX.shadow = makeShadowTexture();
  return true;
}

/* ===================== Perfil del guante ===================== */
export const G = { Y0: -0.52, YK: 1.05, Y1: 1.85, N: 2.35, PIV: 0.35 };
function gloveProfile(y) {
  const t = sstep(0.0, 0.92, y), c = 0.04 * sstep(G.Y0, 0.1, y);
  let rx = lerp(0.40 + c, 0.62, t), rzB = lerp(0.33 + c, 0.50, t), rzF = lerp(0.33 + c, 0.45, t);
  rzF *= 1 - 0.22 * Math.exp(-((y - 0.62) * (y - 0.62)) / 0.05);
  rx *= 1 + 0.035 * Math.exp(-((y - 1.15) * (y - 1.15)) / 0.03);      // relleno de los nudillos
  rzB *= 1 + 0.05 * Math.exp(-((y - 1.15) * (y - 1.15)) / 0.04);
  let zc = 0.02 * t;
  if (y > G.YK) { const u = (y - G.YK) / (G.Y1 - G.YK), f = Math.sqrt(Math.max(0, 1 - u * u)); rx *= f; rzB *= f; rzF *= f; zc -= 0.22 * u * u; }
  return { rx, rzB, rzF, zc };
}
function ringXZ(pr, th, off = 0) {
  const n = G.N, c = Math.cos(th), s = Math.sin(th);
  const x = (pr.rx + off) * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const rz = (s >= 0 ? pr.rzB : pr.rzF) + off;
  return [x, pr.zc + rz * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}
function surfPoint(y, th, off = 0) { const [x, z] = ringXZ(gloveProfile(y), th, off); return new THREE.Vector3(x, y, z); }
function surfNormal(y, th) {
  const e = 1e-3, p = surfPoint(y, th), pt = surfPoint(y, th + e).sub(p), py = surfPoint(Math.min(G.Y1 - 2e-3, y + e), th).sub(p);
  const n = new THREE.Vector3().crossVectors(pt, py).normalize();
  const radial = new THREE.Vector3(p.x, 0, p.z - gloveProfile(y).zc);
  if (n.dot(radial) < 0) n.negate();
  return n;
}
function surfZ(y, x, side) {
  const pr = gloveProfile(y), a = Math.min(0.999, Math.abs(x) / pr.rx), r = side > 0 ? pr.rzB : pr.rzF;
  return pr.zc + side * r * Math.pow(1 - Math.pow(a, G.N), 1 / G.N);
}
function thumbCurve(sign) {
  return new THREE.CatmullRomCurve3([[0.28, 0.40, -0.08], [0.47, 0.70, -0.24], [0.40, 0.95, -0.36], [0.30, 1.10, -0.40]].map(p => new THREE.Vector3(sign * p[0], p[1], p[2])));
}

/* Surcos de costura (desplazamiento hacia adentro) */
function grooveAt(y, th) {
  let g = 0; const w2 = 0.018 * 0.018;
  const back = Math.max(0, Math.sin(th));
  if (back > 0.25 && y > 0.9) g = Math.max(g, Math.exp(-((y - 1.16) ** 2) / w2) * sstep(0.25, 0.5, back));     // nudillos
  if (y > 0.36) {                                                                                             // costura lateral
    const pr = gloveProfile(y), r = Math.max(0.05, pr.rx);
    const d0 = Math.abs(Math.atan2(Math.sin(th), Math.cos(th))) * r, d1 = Math.abs(Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI))) * r;
    g = Math.max(g, Math.exp(-(Math.min(d0, d1) ** 2) / w2) * sstep(0.36, 0.5, y));
  }
  g = Math.max(g, Math.exp(-((y - 0.30) ** 2) / w2));                                                         // unión puño-cuerpo
  return g;
}

/* ===================== Geometría del cuerpo ===================== */
function buildBody() {
  const SEG = 128, rings = [];
  for (let i = 0; i <= 80; i++) rings.push(G.Y0 + (G.YK - G.Y0) * i / 80);
  for (let i = 1; i < 40; i++) rings.push(G.YK + (G.Y1 - G.YK) * Math.sin((i / 40) * Math.PI / 2));
  const C = SEG + 1, R = rings.length;
  const pos = new Float32Array((R * C + C) * 3), uv = new Float32Array((R * C + C) * 2), groove = new Float32Array(R * C + C);
  let k = 0;
  for (let r = 0; r < R; r++) { const y = rings[r], pr = gloveProfile(y);
    for (let j = 0; j < C; j++) { const th = j / SEG * Math.PI * 2, [x, z] = ringXZ(pr, th);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = j / SEG * 3.4; uv[k * 2 + 1] = y; groove[k] = grooveAt(y, th); k++; } }
  const prT = gloveProfile(G.Y1 - 1e-4);
  for (let j = 0; j < C; j++) { pos[k * 3] = 0; pos[k * 3 + 1] = G.Y1; pos[k * 3 + 2] = prT.zc; uv[k * 2] = j / SEG * 3.4; uv[k * 2 + 1] = G.Y1; k++; }
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < SEG; j++) { const a = r * C + j, b = a + 1, c = a + C, d = c + 1; idx.push(a, d, b, a, c, d); }
  const top = R * C;
  for (let j = 0; j < SEG; j++) { const a = (R - 1) * C + j; idx.push(a, top + j, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); fixSeams(g, R, C);
  // desplazar los surcos hacia adentro
  const n = g.attributes.normal.array;
  for (let i = 0; i < R * C; i++) { const d = 0.014 * groove[i]; pos[i * 3] -= n[i * 3] * d; pos[i * 3 + 1] -= n[i * 3 + 1] * d; pos[i * 3 + 2] -= n[i * 3 + 2] * d; }
  g.attributes.position.needsUpdate = true; g.computeVertexNormals(); fixSeams(g, R, C);
  g.userData = { R, C, groove };
  return g;
}
function fixSeams(g, R, C) {
  const n = g.attributes.normal.array;
  for (let r = 0; r < R; r++) { const a = (r * C) * 3, b = (r * C + C - 1) * 3;
    for (let q = 0; q < 3; q++) { const m = (n[a + q] + n[b + q]) / 2; n[a + q] = n[b + q] = m; } }
  const top = R * C; let sx = 0, sy = 0, sz = 0; for (let j = 0; j < C; j++) { sx += n[(top + j) * 3]; sy += n[(top + j) * 3 + 1]; sz += n[(top + j) * 3 + 2]; }
  const l = Math.hypot(sx, sy, sz) || 1; for (let j = 0; j < C; j++) { n[(top + j) * 3] = sx / l; n[(top + j) * 3 + 1] = sy / l; n[(top + j) * 3 + 2] = sz / l; }
  g.attributes.normal.needsUpdate = true;
}
/* Oclusión ambiental aproximada por vértice (una versión por lado del pulgar) */
function bodyAO(g, sign) {
  const p = g.attributes.position.array, { groove } = g.userData, count = p.length / 3, col = new Float32Array(count * 3);
  const samples = thumbCurve(sign).getSpacedPoints(60);
  for (let i = 0; i < count; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
    let ao = 1 - 0.38 * (groove[i] || 0);
    let dm = 9; for (const s of samples) { const d = (s.x - x) ** 2 + (s.y - y) ** 2 + (s.z - z) ** 2; if (d < dm) dm = d; }
    const dt = Math.max(0, Math.sqrt(dm) - 0.14); ao *= 1 - 0.45 * Math.exp(-(dt * dt) / 0.0035);
    if (z < 0) ao *= 1 - 0.12 * sstep(1.05, 1.5, y) * sstep(0, -0.3, z);                // bajo la curva de los dedos
    if (z < 0) ao *= 1 - 0.10 * Math.exp(-((y - 0.62) ** 2) / 0.05);                     // hueco de la palma
    ao *= 1 - 0.18 * sstep(G.Y0 + 0.12, G.Y0, y);                                       // borde del puño
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  return col;
}
function buildThumb(sign) {
  const curve = thumbCurve(sign), STEPS = 70, SEG = 40, TIP = 14, frames = curve.computeFrenetFrames(STEPS, false);
  const rings = [];
  for (let i = 0; i <= STEPS; i++) { const t = i / STEPS; rings.push({ c: curve.getPointAt(t), n: frames.normals[i], b: frames.binormals[i], t: frames.tangents[i], r: lerp(0.15, 0.125, t) * (1 + 0.05 * Math.sin(t * Math.PI)) }); }
  const last = rings[rings.length - 1];
  for (let k = 1; k <= TIP; k++) { const ph = k / TIP * Math.PI / 2; rings.push({ c: last.c.clone().addScaledVector(last.t, last.r * Math.sin(ph)), n: last.n, b: last.b, t: last.t, r: last.r * Math.cos(ph) + 1e-4 }); }
  const C = SEG + 1, pos = [], uv = [], col = [], idx = [];
  rings.forEach((rg, ri) => { for (let j = 0; j < C; j++) { const a = j / SEG * Math.PI * 2;
    const v = rg.c.clone().addScaledVector(rg.n, Math.cos(a) * rg.r).addScaledVector(rg.b, Math.sin(a) * rg.r);
    pos.push(v.x, v.y, v.z); uv.push(j / SEG * 0.9, ri / rings.length * 0.9);
    const base = sstep(0.0, 0.18, ri / STEPS); col.push(lerp(0.55, 1, base), lerp(0.55, 1, base), lerp(0.55, 1, base)); } });
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < SEG; j++) { const a = r * C + j, b = a + 1, c = a + C, d = c + 1; idx.push(a, d, c, a, b, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function loftBand(yA, yB, off, steps = 10, SEG = 128) {
  const C = SEG + 1, pos = [], uv = [], idx = [];
  for (let i = 0; i <= steps; i++) { const y = yA + (yB - yA) * i / steps, pr = gloveProfile(y);
    for (let j = 0; j < C; j++) { const [x, z] = ringXZ(pr, j / SEG * Math.PI * 2, off); pos.push(x, y, z); uv.push(j / SEG * 3.4, y); } }
  for (let r = 0; r < steps; r++) for (let j = 0; j < SEG; j++) { const a = r * C + j, b = a + 1, c = a + C, d = c + 1; idx.push(a, d, b, a, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function ringTube(y, off, r) {
  const pr = gloveProfile(y), pts = [];
  for (let j = 0; j < 96; j++) { const [x, z] = ringXZ(pr, j / 96 * Math.PI * 2, off); pts.push(new THREE.Vector3(x, y, z)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, r, 12, true);
}
function curvedDecal(w, h, yc, side, lift = 0.008) {
  const g = new THREE.PlaneGeometry(w, h, 32, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) * side, y = p.getY(i) + yc; p.setXYZ(i, x, y, surfZ(y, x, side) + side * lift); }
  g.computeVertexNormals(); return g;
}

/* Puntadas: cápsulas pequeñas instanciadas a lo largo de una línea sobre la superficie */
function stitchLine(list, pts, spacing = 0.032) {
  let acc = spacing / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], seg = a.p.distanceTo(b.p);
    while (acc < seg) { const t = acc / seg; list.push({ p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), d: b.p.clone().sub(a.p).normalize() }); acc += spacing; }
    acc -= seg;
  }
}
function stitchMesh(list, mat) {
  const geo = new THREE.CapsuleGeometry(0.0048, 0.017, 3, 6);
  const m = new THREE.InstancedMesh(geo, mat, list.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((s, i) => { q.setFromUnitVectors(up, s.d); M.compose(s.p.clone().addScaledVector(s.n, 0.0015), q, new THREE.Vector3(1, 1, 1)); m.setMatrixAt(i, M); });
  m.instanceMatrix.needsUpdate = true; return m;
}
const sp = (y, th, off = 0.0) => ({ p: surfPoint(y, th, off), n: surfNormal(y, th) });

/* ===================== Guante procedural ===================== */
function proceduralGlove(modelKey) {
  const model = CFG.models[modelKey], L = TEX.leather;
  const leather = addGrain(new THREE.MeshPhysicalMaterial({ color: '#ECE6DA', map: L.color, normalMap: L.normal, normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: L.rough, roughness: 1, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.42, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color('#fff6e8'), vertexColors: true }));
  const trim = addGrain(new THREE.MeshPhysicalMaterial({ color: '#CFC6B6', map: L.color, normalMap: L.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: L.rough, roughness: 1, clearcoat: 0.2 }));
  const thread = addGrain(new THREE.MeshStandardMaterial({ color: '#E6DFD2', roughness: 0.85, normalMap: TEX.fabric.normal }));
  const lace = addGrain(new THREE.MeshStandardMaterial({ color: '#F4EFE6', roughness: 0.9, normalMap: TEX.fabric.normal, normalScale: new THREE.Vector2(0.8, 0.8) }));
  const metal = new THREE.MeshStandardMaterial({ color: '#C9C4BA', metalness: 1, roughness: 0.32 }); metal.userData.envMult = 2.2; addGrain(metal);
  const lining = addGrain(new THREE.MeshStandardMaterial({ color: '#1C1C1E', roughness: 0.95, normalMap: TEX.fabric.normal, side: THREE.BackSide }));
  const tongue = addGrain(new THREE.MeshPhysicalMaterial({ color: '#BDB4A5', map: L.color, normalMap: L.normal, roughnessMap: L.rough, roughness: 1 }));
  const foil = new THREE.MeshPhysicalMaterial({ color: '#C9A24A', metalness: 1, roughness: 0.28, alphaMap: TEX.logo.alpha, normalMap: TEX.logo.normal,
    transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); foil.userData.envMult = 2.8; addGrain(foil);
  [L.color, L.normal, L.rough].forEach(t => t.repeat.set(1.9, 1.9));

  const root = new THREE.Group();
  const body = buildBody(); const basePos = body.attributes.position.array.slice();
  const aoPos = bodyAO(body, 1), aoNeg = bodyAO(body, -1);
  body.setAttribute('color', new THREE.BufferAttribute(aoPos.slice(), 3));
  root.add(new THREE.Mesh(body, leather));
  const upper = new THREE.Group(); root.add(upper);

  // pulgar + tira que lo une al cuerpo
  const thumbs = {};
  for (const s of [1, -1]) {
    const tg = new THREE.Group(); tg.add(new THREE.Mesh(buildThumb(s), leather));
    const c = thumbCurve(s), a = c.getPointAt(0.86), yb = 1.26, xb = s * 0.26, b = new THREE.Vector3(xb, yb, surfZ(yb, xb, -1) + 0.01);
    const strap = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.02, -0.04)), b]), 24, 0.032, 10, false);
    tg.add(new THREE.Mesh(strap, trim)); tg.visible = s > 0; upper.add(tg); thumbs[s] = tg;
  }
  // logo dorado
  const logo = new THREE.Mesh(curvedDecal(0.62, 0.19, 0.92, 1), foil); upper.add(logo);
  // costuras con puntadas
  const upperStitches = [], lowerStitches = [];
  for (const dy of [-0.034, 0.034]) { const pts = []; for (let i = 0; i <= 60; i++) { const th = 0.35 + (Math.PI - 0.7) * i / 60; pts.push(sp(1.16 + dy, th)); } stitchLine(upperStitches, pts); }
  for (const base of [0, Math.PI]) for (const sd of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 70; i++) { const y = 0.38 + (1.78 - 0.38) * Math.sin(i / 70 * Math.PI / 2); const r = Math.max(0.08, gloveProfile(y).rx); pts.push(sp(y, base + sd * 0.034 / r)); }
    stitchLine(upperStitches, pts);
  }
  for (const y of [0.30 - 0.034, 0.30 + 0.034, G.Y0 + 0.09]) { const pts = []; for (let i = 0; i <= 160; i++) pts.push(sp(y, i / 160 * Math.PI * 2)); stitchLine(lowerStitches, pts); }
  upper.add(stitchMesh(upperStitches, thread));
  root.add(stitchMesh(lowerStitches, thread));
  // terminaciones del puño: ribete y forro interior
  root.add(new THREE.Mesh(ringTube(G.Y0 + 0.02, 0.0, 0.05), trim));
  root.add(new THREE.Mesh(loftBand(G.Y0 - 0.03, G.Y0 + 0.4, -0.035, 8), lining));
  const logos = [logo];
  if (model.cierre === 'cordones') {
    const ys = []; for (let i = 0; i < 6; i++) ys.push(-0.40 + i * 0.12);
    root.add(new THREE.Mesh(curvedDecal(0.15, 0.70, -0.10, -1, 0.002), tongue));
    const eye = (x, y) => { const n = new THREE.Vector3(0, 0, -1), p = new THREE.Vector3(x, y, surfZ(y, x, -1)); const t = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0075, 10, 24), metal); t.position.copy(p).addScaledVector(n, 0.004); t.lookAt(p.clone().addScaledVector(n, 1)); root.add(t); return p; };
    const L2 = ys.map(y => eye(-0.11, y)), R2 = ys.map(y => eye(0.11, y));
    const lacePath = (seq) => { const pts = []; for (let i = 0; i < seq.length; i++) { const p = seq[i];
        pts.push(p.clone().add(new THREE.Vector3(0, 0, 0.004)));                              // entra en el ojal
        if (i < seq.length - 1) { const q = seq[i + 1], m = p.clone().lerp(q, 0.5); m.z = surfZ(m.y, m.x, -1) - 0.02 - (i % 2) * 0.008; pts.push(m); } }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seq.length * 24, 0.0125, 10, false); };
    root.add(new THREE.Mesh(lacePath(L2.map((p, i) => i % 2 ? R2[i] : p)), lace));
    root.add(new THREE.Mesh(lacePath(R2.map((p, i) => i % 2 ? L2[i] : p)), lace));
    const cl = new THREE.Mesh(curvedDecal(0.42, 0.13, -0.18, 1), (() => { const f = foil.clone(); f.userData.envMult = 2.8; return addGrain(f); })()); root.add(cl); logos.push(cl);
  } else {
    const yA = -0.36, yB = 0.0;
    root.add(new THREE.Mesh(loftBand(yA, yB, 0.022, 10), trim));
    root.add(new THREE.Mesh(ringTube(yA, 0.022, 0.014), trim)); root.add(new THREE.Mesh(ringTube(yB, 0.022, 0.014), trim));
    const bs = []; for (const y of [yA + 0.03, yB - 0.03]) { const pts = []; for (let i = 0; i <= 160; i++) pts.push(sp(y, i / 160 * Math.PI * 2, 0.022)); stitchLine(bs, pts); }
    root.add(stitchMesh(bs, thread));
    const sl = new THREE.Mesh(curvedDecal(0.40, 0.12, -0.18, 1, 0.032), (() => { const f = foil.clone(); f.userData.envMult = 2.8; return addGrain(f); })()); root.add(sl); logos.push(sl);
  }

  let lastK = 1, side = 1;
  const R = body.userData.R, C = body.userData.C;
  return {
    root, isGLB: false,
    setColor(key) {
      const c = CFG.colors[key];
      leather.color.set(c.leather); trim.color.set(c.trim); thread.color.set(c.thread || c.trim); lace.color.set(c.lace); tongue.color.set(c.trim);
      for (const l of logos) l.material.color.set(c.logo);
      const dark = key === 'negro';
      leather.clearcoat = dark ? 0.12 : 0.3; leather.sheen = dark ? 0.2 : 0.25; leather.userData.envMult = dark ? 0.55 : 1; leather.envMapIntensity = ENV_INT * leather.userData.envMult; leather.normalScale.set(dark ? 0.6 : 0.45, dark ? 0.6 : 0.45);
      metal.color.set(dark ? '#8E8A84' : '#C9C4BA');
    },
    setThumbSide(s) { if (s === side) return; side = s; thumbs[1].visible = s > 0; thumbs[-1].visible = s < 0; body.attributes.color.array.set(s > 0 ? aoPos : aoNeg); body.attributes.color.needsUpdate = true; },
    setOpenness(k) {                                      // 0.74 puño cerrado … 1.14 mano abierta
      if (Math.abs(k - lastK) < 0.01) return; lastK = k;
      const a = body.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) { const y = basePos[i]; a[i] = y > G.PIV ? G.PIV + (y - G.PIV) * k : y; }
      body.attributes.position.needsUpdate = true; body.computeVertexNormals(); fixSeams(body, R, C);
      upper.position.y = G.PIV * (1 - k); upper.scale.y = k;
    }
  };
}

/* ===================== Guante esculpido (malla generada fuera de línea) ===================== */
let SCULPT = null;
function loadSculpt() {
  if (!SCULPT) SCULPT = (async () => {
    const base = (CFG.sculptPath || 'models/tempo-glove');
    const [meta, buf] = await Promise.all([fetch(base + '.json').then(r => { if (!r.ok) throw new Error('json'); return r.json(); }),
                                           fetch(base + '.bin').then(r => { if (!r.ok) throw new Error('bin'); return r.arrayBuffer(); })]);
    const nv = meta.counts.v, nf = meta.counts.f; let o = 0;
    const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const nrm = new Int16Array(buf, o, nv * 3); o += nv * 6;
    const uv = new Float32Array(buf.slice(o, o + nv * 8)); o += nv * 8;
    const ao = new Uint8Array(buf, o, nv); o += nv + meta.aoPad;
    const idx = new Uint32Array(buf.slice(o, o + nf * 12));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    const nf32 = new Float32Array(nv * 3); for (let i = 0; i < nv * 3; i++) nf32[i] = nrm[i] / 32767;
    g.setAttribute('normal', new THREE.BufferAttribute(nf32, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const col = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { const a = ao[i] / 255; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return { meta, geo: g };
  })();
  return SCULPT;
}
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function gridDecal(d, lift = 0.008) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) {
    const q = d.pts[j * d.nx + i]; pos.push(q[0] + q[3] * lift, q[1] + q[4] * lift, q[2] + q[5] * lift);
    uv.push(d.side > 0 ? i / (d.nx - 1) : 1 - i / (d.nx - 1), j / (d.ny - 1));
  }
  for (let j = 0; j < d.ny - 1; j++) for (let i = 0; i < d.nx - 1; i++) {
    const a = j * d.nx + i, b = a + 1, c = a + d.nx, e = c + 1;
    if (d.side > 0) idx.push(a, b, e, a, e, c); else idx.push(a, e, b, a, c, e);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
async function sculptedGlove(modelKey) {
  const { meta, geo } = await loadSculpt();
  const model = CFG.models[modelKey], L = TEX.leather;
  const rep = 1.9 * meta.uvScale;
  const tx = [L.color.clone(), L.normal.clone(), L.rough.clone()]; tx.forEach(t => { t.repeat.set(rep, rep); t.needsUpdate = true; });
  const leather = addGrain(new THREE.MeshPhysicalMaterial({ color: '#ECE6DA', map: tx[0], normalMap: tx[1], normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: tx[2], roughness: 1, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.42, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color('#fff6e8'), vertexColors: true }));
  const trim = addGrain(new THREE.MeshPhysicalMaterial({ color: '#CFC6B6', map: L.color, normalMap: L.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughnessMap: L.rough, roughness: 1, clearcoat: 0.2 }));
  const thread = addGrain(new THREE.MeshStandardMaterial({ color: '#E6DFD2', roughness: 0.85, normalMap: TEX.fabric.normal }));
  const lace = addGrain(new THREE.MeshStandardMaterial({ color: '#F4EFE6', roughness: 0.9, normalMap: TEX.fabric.normal, normalScale: new THREE.Vector2(0.8, 0.8) }));
  const metal = new THREE.MeshStandardMaterial({ color: '#C9C4BA', metalness: 1, roughness: 0.32 }); metal.userData.envMult = 2.2; addGrain(metal);
  const tongue = addGrain(new THREE.MeshPhysicalMaterial({ color: '#BDB4A5', map: L.color, normalMap: L.normal, roughnessMap: L.rough, roughness: 1 }));
  const mkFoil = () => { const f = new THREE.MeshPhysicalMaterial({ color: '#C9A24A', metalness: 1, roughness: 0.28, alphaMap: TEX.logo.alpha, normalMap: TEX.logo.normal,
    transparent: true, alphaTest: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }); f.userData.envMult = 2.8; return addGrain(f); };

  const root = new THREE.Group(), mirror = new THREE.Group(); root.add(mirror);
  const body = geo.clone(); const basePos = body.attributes.position.array.slice();
  mirror.add(new THREE.Mesh(body, leather));
  const upper = new THREE.Group(), lower = new THREE.Group(); mirror.add(upper, lower);
  // los logos van fuera del espejado (el cuerpo es simétrico) para que el texto se lea bien con las dos manos
  const upperN = new THREE.Group(), lowerN = new THREE.Group(); root.add(upperN, lowerN);
  const PIV = meta.pivot;
  // costuras
  const up = [], lo = [];
  for (const line of meta.seams) {
    const pts = line.map(q => ({ p: V3(q), n: V3(q.slice(3)) }));
    const target = pts.length && pts.reduce((a, q) => a + q.p.y, 0) / pts.length > PIV + 0.1 ? up : lo;
    stitchLine(target, pts.concat(line.length > 150 && Math.abs(line[0][1] - line[line.length - 1][1]) < 0.02 ? [pts[0]] : []));
  }
  upper.add(stitchMesh(up, thread)); lower.add(stitchMesh(lo, thread));
  // logos
  const logos = [];
  const logo = new THREE.Mesh(gridDecal(meta.decals.logo), mkFoil()); upperN.add(logo); logos.push(logo);
  if (model.cierre === 'cordones') {
    lower.add(new THREE.Mesh(gridDecal(meta.decals.tongue, 0.003), tongue));
    const eyes = meta.eyelets.map(q => ({ p: V3(q), n: V3(q.slice(3)) }));
    for (const e of eyes) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0075, 10, 24), metal); t.position.copy(e.p).addScaledVector(e.n, 0.004); t.lookAt(e.p.clone().addScaledVector(e.n, 1)); lower.add(t); }
    const Ls = eyes.filter(e => e.p.x < 0).sort((a, b) => a.p.y - b.p.y), Rs = eyes.filter(e => e.p.x > 0).sort((a, b) => a.p.y - b.p.y);
    const lacePath = (seq) => { const pts = [];
      for (let i = 0; i < seq.length; i++) { const e = seq[i]; pts.push(e.p.clone().addScaledVector(e.n, -0.004));
        if (i < seq.length - 1) { const f = seq[i + 1], m = e.p.clone().lerp(f.p, 0.5), n = e.n.clone().lerp(f.n, 0.5).normalize(); pts.push(m.addScaledVector(n, 0.02 + (i % 2) * 0.008)); } }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), seq.length * 24, 0.0125, 10, false); };
    lower.add(new THREE.Mesh(lacePath(Ls.map((e, i) => i % 2 ? Rs[i] : e)), lace));
    lower.add(new THREE.Mesh(lacePath(Rs.map((e, i) => i % 2 ? Ls[i] : e)), lace));
    const cl = new THREE.Mesh(gridDecal(meta.decals.cuffLogo), mkFoil()); lowerN.add(cl); logos.push(cl);
  } else {
    const rings = meta.strapRings, C = rings[0].length, off = 0.022, pos = [], uv = [], idx = [];
    rings.forEach((ring, r) => { for (let j = 0; j <= C; j++) { const q = ring[j % C]; pos.push(q[0] + q[3] * off, q[1] + q[4] * off, q[2] + q[5] * off); uv.push(j / C * 3.4, q[1]); } });
    for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < C; j++) { const a = r * (C + 1) + j, b = a + 1, c = a + C + 1, d = c + 1; idx.push(a, d, b, a, c, d); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(idx); sg.computeVertexNormals();
    // asegurar normales hacia afuera
    const n0 = new THREE.Vector3().fromBufferAttribute(sg.attributes.normal, 0), q0 = rings[0][0];
    if (n0.dot(new THREE.Vector3(q0[3], q0[4], q0[5])) < 0) { const ix = sg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } sg.computeVertexNormals(); }
    lower.add(new THREE.Mesh(sg, trim));
    const edge = (ring, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring.map(q => new THREE.Vector3(q[0] + q[3] * off, q[1] + q[4] * off, q[2] + q[5] * off)), true), 200, r, 8, true), trim);
    lower.add(edge(rings[0], 0.014)); lower.add(edge(rings[rings.length - 1], 0.014));
    const bs = []; for (const ring of [rings[1], rings[rings.length - 2]]) { const pts = ring.map(q => ({ p: new THREE.Vector3(q[0] + q[3] * (off + 0.002), q[1] + q[4] * (off + 0.002), q[2] + q[5] * (off + 0.002)), n: V3(q.slice(3)) })); stitchLine(bs, pts.concat([pts[0]])); }
    lower.add(stitchMesh(bs, thread));
    const sl = new THREE.Mesh(gridDecal(meta.decals.cuffLogo, 0.034), mkFoil()); lowerN.add(sl); logos.push(sl);
  }
  let lastK = 1;
  return {
    root, isGLB: false, sculpt: true,
    setColor(key) {
      const c = CFG.colors[key], dark = key === 'negro';
      leather.color.set(c.leather); trim.color.set(c.trim); thread.color.set(c.thread || c.trim); lace.color.set(c.lace); tongue.color.set(c.trim);
      for (const l of logos) l.material.color.set(c.logo);
      leather.clearcoat = dark ? 0.12 : 0.3; leather.sheen = dark ? 0.2 : 0.25; leather.userData.envMult = dark ? 0.55 : 1; leather.envMapIntensity = ENV_INT * leather.userData.envMult;
      leather.normalScale.set(dark ? 0.6 : 0.45, dark ? 0.6 : 0.45); metal.color.set(dark ? '#8E8A84' : '#C9C4BA');
    },
    setThumbSide(s) { mirror.scale.x = s >= 0 ? 1 : -1; },
    setOpenness(k) {                      // el guante esculpido ya tiene forma de puño: solo se estira un poco con la mano abierta
      k = Math.min(1.10, Math.max(0.94, 0.94 + (k - 0.74) * 0.4));
      if (Math.abs(k - lastK) < 0.008) return; lastK = k;
      const a = body.attributes.position.array;
      for (let i = 1; i < a.length; i += 3) { const y = basePos[i]; a[i] = y > PIV ? PIV + (y - PIV) * k : y; }
      body.attributes.position.needsUpdate = true;
      upper.position.y = upperN.position.y = PIV * (1 - k); upper.scale.y = upperN.scale.y = k;
    }
  };
}

/* ===================== Modelo escaneado (.glb) ===================== */
const glbCache = new Map();
function loadGLB(url) {
  if (!glbCache.has(url)) glbCache.set(url, new Promise((res, rej) => new GLTFLoader().load(url, g => res(g.scene), undefined, rej)));
  return glbCache.get(url).then(s => s.clone(true));
}
async function glbGlove(modelKey) {
  const spec = CFG.models[modelKey].glb, fit = Object.assign({ up: 'y', back: 'z', thumb: 1, length: 2.37, wrist: 0.22 }, CFG.glbFit || {}, CFG.models[modelKey].glbFit || {});
  const urlFor = (color) => typeof spec === 'string' ? spec : (spec[color] || Object.values(spec)[0]);
  const root = new THREE.Group(), holder = new THREE.Group(); root.add(holder);
  let current = null, currentUrl = null, side = 1;
  async function show(color) {
    const url = urlFor(color); if (url === currentUrl) return; currentUrl = url;
    const scene = await loadGLB(url);
    scene.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => addGrain(m.clone())) : addGrain(o.material.clone()); } });
    const box = new THREE.Box3().setFromObject(scene), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const wrap = new THREE.Group(); wrap.add(scene);
    if (fit.up === 'z') wrap.rotation.x = -Math.PI / 2; else if (fit.up === 'x') wrap.rotation.z = Math.PI / 2;
    const h = fit.up === 'z' ? size.z : fit.up === 'x' ? size.x : size.y, s = fit.length / h;
    scene.position.sub(center); wrap.scale.setScalar(s);
    const inner = new THREE.Group(); inner.add(wrap); inner.position.y = fit.length * (0.5 - fit.wrist);
    if (fit.back === '-z') inner.rotation.y = Math.PI;
    if (current) holder.remove(current); current = inner; holder.add(inner); applySide();
  }
  function applySide() { holder.scale.x = side * fit.thumb >= 0 ? 1 : -1; }
  await show(Object.keys(CFG.colors)[0]);
  return { root, isGLB: true, setColor(c) { show(c); }, setThumbSide(s) { side = s; applySide(); }, setOpenness() { } };
}

export async function createGlove(modelKey, colorKey) {
  let g;
  if (CFG.models[modelKey].glb) g = await glbGlove(modelKey).catch(e => { console.warn('No se pudo cargar el .glb', e); return null; });
  if (!g && CFG.sculpt !== false) g = await sculptedGlove(modelKey).catch(e => { console.warn('No se pudo cargar el guante esculpido', e); return null; });
  if (!g) g = proceduralGlove(modelKey);
  g.setColor(colorKey); return g;
}

/* ===================== Render, luces y entorno ===================== */
export function makeRenderer(canvas, { preserve = false } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: preserve });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  return r;
}
function lights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x2a2420, 0.35); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-0.6, 1, 1.2); scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xffd9a0, 0.5); rim.position.set(1, 0.4, -0.8); scene.add(rim);
  return { hemi, key, rim };
}
export function createStudio(renderer) {               // escena para visor 3D y miniaturas
  const scene = new THREE.Scene(); const L = lights(scene);
  L.key.intensity = 2.4; L.key.color.set('#fff3e2'); L.key.position.set(-0.9, 1.1, 0.9); L.hemi.intensity = 0.15; L.rim.intensity = 1.1;
  renderer.toneMappingExposure = 0.92;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture; pm.dispose();
  return { scene, lights: L };
}
export function createARStage(renderer) {
  const scene = new THREE.Scene(); const L = lights(scene);
  const pm = new THREE.PMREMGenerator(renderer);
  let envRT = pm.fromScene(new RoomEnvironment(renderer), 0.04); scene.environment = envRT.texture;
  const envCanvas = document.createElement('canvas'); envCanvas.width = 256; envCanvas.height = 128;
  const ectx = envCanvas.getContext('2d');
  const envTex = new THREE.CanvasTexture(envCanvas); envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TEX.shadow, transparent: true, depthWrite: false, opacity: 0.42 }));
  L.key.intensity = 2.0; L.hemi.intensity = 0.15; setEnvIntensity(0.4); renderer.toneMappingExposure = 0.9;
  shadow.visible = false; scene.add(shadow);
  let lastEnv = 0;
  return {
    scene, lights: L, shadow,
    /* Entorno a partir del video: el guante refleja y toma el color del lugar real */
    updateEnv(video, mirror, now) {
      if (now - lastEnv < 1500 || !video.videoWidth) return; lastEnv = now;
      ectx.save(); if ('filter' in ectx) ectx.filter = 'blur(5px) saturate(0.9)';
      if (mirror) { ectx.translate(256, 0); ectx.scale(-1, 1); }
      ectx.drawImage(video, 0, 0, 256, 128); ectx.restore();
      // el video solo muestra lo que está adelante: oscurecer "piso" y costados para conservar el volumen
      const gr = ectx.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.7)');
      ectx.fillStyle = gr; ectx.fillRect(0, 0, 256, 128);
      const gs = ectx.createLinearGradient(0, 0, 256, 0); gs.addColorStop(0, 'rgba(0,0,0,0.35)'); gs.addColorStop(0.3, 'rgba(0,0,0,0)'); gs.addColorStop(0.7, 'rgba(0,0,0,0)'); gs.addColorStop(1, 'rgba(0,0,0,0.35)');
      ectx.fillStyle = gs; ectx.fillRect(0, 0, 256, 128);
      envTex.needsUpdate = true;
      const next = pm.fromEquirectangular(envTex); scene.environment = next.texture; envRT.dispose(); envRT = next;
    },
    /* Luz principal estimada desde el brillo y el color del cuadro */
    updateLights(st) {
      if (!st) return;
      const b = Math.min(1.4, Math.max(0.25, st.lum / 120));
      const dir = new THREE.Vector3(st.dx * 2.2, st.dy * 2.2 + 0.6, 1).normalize();
      L.key.position.copy(dir); L.key.intensity = lerp(L.key.intensity, 1.1 + 1.5 * b, 0.2);
      const m = Math.max(st.r, st.g, st.b, 1); L.key.color.setRGB(lerp(1, st.r / m, 0.35), lerp(1, st.g / m, 0.35), lerp(1, st.b / m, 0.35));
      L.hemi.intensity = lerp(L.hemi.intensity, 0.08 + 0.15 * b, 0.2);
      setEnvIntensity(lerp(ENV_INT, 0.25 + 0.3 * b, 0.2));
      renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, Math.min(1.05, Math.max(0.78, 0.78 + b * 0.16)), 0.15);
      GRAIN.uGrain.value = Math.min(0.06, Math.max(0.012, 0.012 + (110 - st.lum) / 2200));
      this.lightDir = dir;
    },
    /* Sombra suave detrás del guante, opuesta a la luz */
    updateShadow(center, upVec, scale, visible) {
      shadow.visible = visible; if (!visible) return;
      const d = this.lightDir || new THREE.Vector3(0, 0.5, 1);
      shadow.position.set(center.x - d.x * scale * 0.12, center.y - d.y * scale * 0.12 - scale * 0.04, center.z - 600);
      shadow.scale.set(scale * 1.55, scale * 2.7, 1);
      shadow.rotation.z = Math.atan2(upVec.y, upVec.x) - Math.PI / 2;
    }
  };
}
export function tick(now) { GRAIN.uTime.value = (now / 1000) % 100; }
export function setGrain(v) { GRAIN.uGrain.value = v; }

/* Miniatura estática para las tarjetas */
let thumbCtx = null;
export async function renderThumb(modelKey, colorKey, target) {
  if (!thumbCtx) {
    const c = document.createElement('canvas'); c.width = c.height = 192;
    const r = makeRenderer(c, { preserve: true }); r.setPixelRatio(1); r.setSize(192, 192, false);
    const st = createStudio(r); const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(0, 0.5, 6); cam.lookAt(0, 0.5, 0);
    thumbCtx = { c, r, st, cam, cache: new Map() };
  }
  const { c, r, st, cam, cache } = thumbCtx, key = modelKey + '|' + colorKey;
  if (!cache.has(key)) {
    const g = await createGlove(modelKey, colorKey); g.setOpenness(0.85); g.root.rotation.set(-0.1, 0.75, 0); g.root.position.y = -0.2;
    const pg = GRAIN.uGrain.value; setGrain(0); setEnvIntensity(0.9); st.scene.add(g.root); r.render(st.scene, cam); st.scene.remove(g.root); setGrain(pg);
    const img = document.createElement('canvas'); img.width = img.height = 192; img.getContext('2d').drawImage(c, 0, 0); cache.set(key, img);
  }
  const ctx = target.getContext('2d'); ctx.clearRect(0, 0, target.width, target.height); ctx.drawImage(cache.get(key), 0, 0, target.width, target.height);
}
