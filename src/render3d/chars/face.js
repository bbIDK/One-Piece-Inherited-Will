// Anime faces for the 3D heads: eyes (with catch-lights), brows, mouth and
// race details painted on a small canvas that is wrapped on the front of the
// head as a decal. The canvas is a front view in head units (head radius 1,
// y down, the viewer's left = the character's right), matching the 2D art
// of render/charart.js so faces read the same in both views.
//
// One texture per (face features + expression), shared by every character
// with the same face, cached with a small LRU; only the few expressions a
// character is actually showing are ever painted.
import * as THREE from 'three';
import { mixHex } from '../../core/math.js';
import { charGradient } from './mats.js';

export const FACE_W = 192, FACE_H = 160;
export const FACE_S = 96;            // canvas px per head radius
export const FACE_Y0 = 0.62;         // head-unit y (up) at the top edge of the canvas
export const FACE_Y1 = -1.05;        // … and at the bottom edge

const TAU = Math.PI * 2;
const INK = '#2a1a1e';

// ------------------------------------------------------------------ colour
function hex(col, fb) {
  if (typeof col !== 'string') return fb;
  if (col[0] === '#') return col.length === 4 || col.length === 7 ? col : col.length > 7 ? col.slice(0, 7) : fb;
  const m = col.match(/rgba?\(([^)]+)\)/);
  if (!m) return fb;
  return '#' + m[1].split(',').slice(0, 3).map((v) => Math.max(0, Math.min(255, parseFloat(v) | 0)).toString(16).padStart(2, '0')).join('');
}
function lum(h) {
  const s = h.length === 4 ? h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h.slice(1, 7);
  const n = parseInt(s, 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}
function browCol(hairCol) {
  const h = hex(hairCol, '#2d2d2d'), L = lum(h);
  const base = L < 0.16 ? mixHex(h, '#474c69', 0.3) : h;
  return L > 0.62 ? mixHex(h, '#5b4a46', 0.6) : L < 0.16 ? '#1d1418' : mixHex(base, '#140c10', 0.5);
}
function skinTones(col) {
  const h = hex(col, '#f1c9a0'), L = lum(h);
  return {
    base: h,
    line: mixHex(h, '#3a1418', 0.6),
    muzzle: mixHex(h, '#ffffff', L > 0.85 ? 0.0 : 0.5),
    blush: mixHex(h, '#ff5a6e', 0.32),
    shadow: L > 0.3 ? mixHex(h, '#a23f45', 0.22) : mixHex(h, '#12060c', 0.34),
  };
}

// ------------------------------------------------------------------ shapes (head units, y down)
const P2 = new Map();
const pp = (d) => { let p = P2.get(d); if (!p) { p = new Path2D(d); P2.set(d, p); } return p; };
const EYE = {
  white: 'M-0.18 -0.01 C-0.16 -0.25 0.13 -0.27 0.19 -0.07 C0.22 0.12 0.12 0.26 0 0.26 C-0.12 0.26 -0.19 0.14 -0.18 -0.01 Z',
  lash: 'M-0.22 0.03 C-0.2 -0.3 0.16 -0.34 0.23 -0.08 L0.3 -0.12 L0.22 0.01 C0.14 -0.2 -0.13 -0.21 -0.2 0.05 Z',
  lower: 'M0.02 0.26 Q0.14 0.24 0.19 0.12',
  fWhite: 'M-0.19 0.06 L0.2 -0.12 C0.22 0.1 0.12 0.24 0 0.24 C-0.12 0.24 -0.19 0.16 -0.19 0.06 Z',
  fLash: 'M-0.23 0.03 L0.22 -0.2 L0.3 -0.2 L0.21 -0.09 L-0.19 0.1 Z',
  blink: 'M-0.2 0.06 Q0 0.2 0.21 0.03 L0.27 0',
  hurt: 'M0.18 -0.12 L-0.12 0.06 L0.18 0.24',
  fishWhite: 'M0.2 0.06 C0.2 -0.07 0.11 -0.15 0 -0.15 C-0.11 -0.15 -0.2 -0.07 -0.2 0.06 C-0.2 0.18 -0.11 0.27 0 0.27 C0.11 0.27 0.2 0.18 0.2 0.06 Z',
  fishLash: 'M-0.22 0.02 C-0.2 -0.22 0.2 -0.24 0.23 0.0 L0.18 0.02 C0.14 -0.16 -0.14 -0.16 -0.18 0.04 Z',
};
let SPIRAL = null;
function spiral() {
  if (!SPIRAL) {
    let s = '';
    for (let i = 0; i <= 26; i++) { const a = i * 0.62, rr = 0.02 + i * 0.0075; const x = Math.cos(a) * rr, y = 0.06 + Math.sin(a) * rr * 1.1; s += `${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)} `; }
    SPIRAL = s;
  }
  return SPIRAL;
}
const BROWS = {
  fierce: 'M0.17 -0.1 Q0.38 -0.2 0.62 -0.31 M-0.17 -0.1 Q-0.38 -0.2 -0.62 -0.31',
  worried: 'M0.2 -0.3 Q0.42 -0.3 0.6 -0.16 M-0.2 -0.3 Q-0.42 -0.3 -0.6 -0.16',
  neutral: 'M0.2 -0.19 Q0.4 -0.3 0.6 -0.22 M-0.2 -0.19 Q-0.4 -0.3 -0.6 -0.22',
};
const MOUTH_COL = '#5c1c20', TONGUE = '#e0626a', TEETH = '#ffffff';
const MOUTHS = {
  fierce: 'M-0.14 0.66 Q0 0.58 0.14 0.66', ko: 'M-0.16 0.62 Q-0.08 0.54 0 0.62 Q0.08 0.7 0.16 0.62',
  animal: 'M-0.16 0.56 Q-0.08 0.66 0 0.54 Q0.08 0.66 0.16 0.56', smile: 'M-0.12 0.61 Q0 0.67 0.12 0.6', flat: 'M-0.11 0.62 L0.11 0.62',
  grin: ['M-0.46 0.46 Q0 0.58 0.46 0.46 Q0.36 0.95 0 0.95 Q-0.36 0.95 -0.46 0.46 Z', 'M-0.5 0.4 L0.5 0.4 L0.5 0.56 Q0 0.72 -0.5 0.56 Z', [0, 0.93, 0.24, 0.11]],
  shout: ['M-0.25 0.5 Q0 0.45 0.25 0.5 Q0.3 0.92 0 0.94 Q-0.3 0.92 -0.25 0.5 Z', 'M-0.3 0.4 L0.3 0.4 L0.3 0.55 Q0 0.6 -0.3 0.55 Z', [0, 0.92, 0.17, 0.1]],
  grimace: ['M-0.3 0.55 Q0 0.5 0.3 0.55 L0.26 0.74 Q0 0.7 -0.26 0.74 Z', 'M-0.4 0.4 L0.4 0.4 L0.4 0.9 L-0.4 0.9 Z', null, 'M-0.28 0.64 L0.28 0.64 M-0.12 0.54 L-0.12 0.72 M0.06 0.53 L0.06 0.72'],
};
const SHARP = new Map();
function sharpTeeth(kind) {
  let s = SHARP.get(kind);
  if (s) return s;
  const [x0, x1, y0, h] = kind === 'grin' ? [-0.46, 0.46, 0.46, 0.13] : kind === 'shout' ? [-0.26, 0.26, 0.48, 0.1] : [-0.3, 0.3, 0.53, 0.1];
  const n = kind === 'grin' ? 7 : 4;
  let d = `M${x0} ${y0 - 0.1}`;
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; d += ` L${x.toFixed(3)} ${(y0 + (i === 0 || i === n ? 0 : 0.02)).toFixed(3)}`; if (i < n) d += ` L${(x + (x1 - x0) / n / 2).toFixed(3)} ${(y0 + h).toFixed(3)}`; }
  d += ` L${x1} ${y0 - 0.1} Z`;
  const yb = kind === 'grin' ? 0.9 : kind === 'shout' ? 0.9 : 0.74;
  d += ` M${(x0 * 0.7).toFixed(3)} ${(yb + 0.1).toFixed(3)}`;
  for (let i = 0; i <= n - 1; i++) { const x = x0 * 0.7 + (x1 - x0) * 0.7 * i / (n - 1); d += ` L${x.toFixed(3)} ${yb.toFixed(3)}`; if (i < n - 1) d += ` L${(x + (x1 - x0) * 0.7 / (n - 1) / 2).toFixed(3)} ${(yb - h * 0.9).toFixed(3)}`; }
  d += ` L${(x1 * 0.7).toFixed(3)} ${(yb + 0.1).toFixed(3)} Z`;
  SHARP.set(kind, d);
  return d;
}
const SCAR = { F: 'M-0.52 -0.12 L-0.3 0.5', Fx: 'M-0.52 0.02 L-0.38 -0.02 M-0.46 0.24 L-0.32 0.2' };
const PANDA = 'M0.14 0.02 C0.2 -0.2 0.58 -0.22 0.68 0.12 C0.76 0.4 0.62 0.58 0.44 0.52 C0.24 0.46 0.1 0.26 0.14 0.02 Z M-0.14 0.02 C-0.2 -0.2 -0.58 -0.22 -0.68 0.12 C-0.76 0.4 -0.62 0.58 -0.44 0.52 C-0.24 0.46 -0.1 0.26 -0.14 0.02 Z';
const THIRD = 'M0 -0.28 Q0.11 -0.12 0 0.04 Q-0.11 -0.12 0 -0.28 Z';
const GILLS = 'M0.74 0.44 Q0.68 0.52 0.72 0.6 M0.68 0.54 Q0.62 0.62 0.66 0.7 M-0.74 0.44 Q-0.68 0.52 -0.72 0.6 M-0.68 0.54 Q-0.62 0.62 -0.66 0.7';
const NOSE_HINT = 'M0.03 0.35 Q0.08 0.42 0.02 0.45';
const NOSE_ANIMAL = 'M-0.11 0.35 Q0 0.3 0.11 0.35 Q0.07 0.45 0 0.47 Q-0.07 0.45 -0.11 0.35 Z';
const SHADES = {
  lens: 'M0.14 0.02 L0.64 0.0 Q0.66 0.28 0.46 0.34 Q0.2 0.36 0.14 0.02 Z M-0.14 0.02 L-0.64 0.0 Q-0.66 0.28 -0.46 0.34 Q-0.2 0.36 -0.14 0.02 Z',
  glint: 'M-0.5 0.04 L-0.4 0.04 L-0.48 0.24 L-0.58 0.24 Z M0.3 0.04 L0.4 0.04 L0.32 0.24 L0.22 0.24 Z', bridge: 'M-0.14 0.06 Q0 0.02 0.14 0.06',
};

// ------------------------------------------------------------------ expression
/** What the face shows this frame (same rules as the 2D heads). */
export function expression(look, pose, P, t) {
  const st = pose && pose.state;
  if (st === 'knocked' || st === 'dead') return { eyes: 'ko', mouth: 'ko', brow: 'worried', small: false };
  if (st === 'hurt') return { eyes: 'hurt', mouth: 'grimace', brow: 'worried', small: false };
  const face = P && P.face;
  const fierce = face === 'fierce' || face === 'shout';
  const s = (((look.seed || 0) * 0.6180339) % 1) * 0.9 + 0.1;
  const blink = !fierce && ((t * 0.29 + s - 0.29) % 1 + 1) % 1 < 0.035;
  let mouth = face === 'shout' ? 'shout' : fierce ? 'fierce' : look.grin || look.nika ? 'grin' : 'neutral';
  if (mouth === 'neutral') mouth = look.muzzle || look.race === 'mink' ? 'animal' : look.mouth || ((look.seed || 0) % 2 ? 'smile' : 'flat');
  return { eyes: blink ? 'blink' : fierce ? 'fierce' : 'open', mouth, brow: fierce ? 'fierce' : 'neutral', small: face === 'shout' };
}
const EYE_SHAPES = ['round', 'round', 'sharp', 'soft'];
function eyeShapeOf(look) {
  if (look.eyeShape) return look.eyeShape;
  if (look.race === 'fishman') return 'fish';
  if (look.race === 'mink') return 'round';
  return EYE_SHAPES[(look.seed || 0) % 4];
}

/** The part of a look the face texture depends on. */
export function faceKey(look) {
  const hairCol = look.furWhite ? '#fafafa' : look.nika ? '#ffffff' : look.hairColor;
  const skin = look.furWhite ? '#fafafa' : (look.fur && look.furFace ? look.fur : look.skin);
  return `${eyeShapeOf(look)}|${look.eyeColor}|${hairCol}|${skin}|${look.furWhite ? 1 : 0}${look.muzzle ? 1 : 0}${look.race === 'mink' ? 1 : 0}`
    + `${look.gills ? 1 : 0}${look.grin || look.nika ? 1 : 0}${look.sharpTeeth ? 1 : 0}${look.thirdEye ? 1 : 0}${look.scarEye ? 1 : 0}${look.goggles === true ? 1 : 0}`
    + `|${look.kind === 'Panda' ? 'P' : ''}|${look.nose || (look.kind === 'Saw Shark' ? 'saw' : '')}`;
}

// ------------------------------------------------------------------ painting
function drawEyes(g, look, X) {
  const shape = eyeShapeOf(look);
  const white = !!look.furWhite;
  const iris = white ? '#ff1744' : hex(look.eyeColor, '#2d2226');
  const lt = mixHex(iris, '#ffffff', white ? 0.55 : 0.38);
  const pupil = white ? '#ff8a80' : mixHex(iris, '#000000', 0.7);
  const E = EYE;
  const ey = 0.17;
  const closed = X.eyes === 'blink' || X.eyes === 'hurt' || X.eyes === 'ko';
  const fierce = X.eyes === 'fierce';
  const fish = shape === 'fish' && !fierce;
  for (let n = 0; n < 2; n++) {
    const x = n ? 0.39 : -0.39;
    g.save();
    g.translate(x, ey);
    const flip = x < 0 ? -1 : 1;
    if (flip < 0) g.scale(-1, 1);
    if (shape === 'sharp') { g.rotate(-0.12); g.scale(1.06, 0.8); } else if (shape === 'soft') { g.rotate(0.1); g.scale(1, 0.92); }
    if (closed) {
      g.lineWidth = X.eyes === 'ko' ? 0.05 : 0.075; g.strokeStyle = look.kind === 'Panda' ? '#f4f1ea' : INK;
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (X.eyes === 'ko') { g.scale(flip, 1); g.stroke(pp(spiral())); } else g.stroke(pp(X.eyes === 'blink' ? E.blink : E.hurt));
      g.restore();
      continue;
    }
    g.fillStyle = '#ffffff'; g.fill(pp(fish ? E.fishWhite : fierce ? E.fWhite : E.white));
    const ir = fish ? 0.55 : X.small ? 0.72 : fierce ? 0.85 : 1;
    const ix = -0.01, iy = fierce ? 0.08 : 0.05;
    g.fillStyle = iris; g.beginPath(); g.ellipse(ix, iy, 0.125 * ir, 0.19 * ir, 0, 0, TAU); g.fill();
    g.fillStyle = lt; g.beginPath(); g.ellipse(ix, iy + 0.1 * ir, 0.085 * ir, 0.07 * ir, 0, 0, TAU); g.fill();
    g.fillStyle = pupil; g.beginPath(); g.ellipse(ix, iy + 0.015, 0.062 * ir, 0.105 * ir, 0, 0, TAU); g.fill();
    g.fillStyle = INK; g.fill(pp(fish ? E.fishLash : fierce ? E.fLash : E.lash));
    if (!fierce) { g.lineWidth = 0.028; g.strokeStyle = INK; g.stroke(pp(E.lower)); }
    g.restore();
    // catch-lights on the upper-left (not mirrored)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(x - 0.06, ey + (fierce ? 0.04 : -0.03), 0.055 * (fish ? 0.8 : 1), 0, TAU); g.fill();
    g.beginPath(); g.arc(x + 0.055, ey + 0.14, 0.028, 0, TAU); g.fill();
  }
  if (look.scarEye) {
    g.lineWidth = 0.06; g.strokeStyle = '#9b3a36'; g.stroke(pp(SCAR.F));
    g.lineWidth = 0.03; g.stroke(pp(SCAR.Fx));
  }
}
function drawMouth(g, look, X) {
  const kind = X.mouth;
  if (look.muzzle) { g.save(); g.translate(0, 0.05); }
  if (typeof MOUTHS[kind] === 'string') {
    g.lineWidth = 0.05; g.strokeStyle = MOUTH_COL; g.lineCap = 'round'; g.stroke(pp(MOUTHS[kind]));
  } else {
    const [d, teeth, tongue, lines] = MOUTHS[kind];
    const mp = pp(d);
    g.fillStyle = MOUTH_COL; g.fill(mp);
    g.save(); g.clip(mp);
    if (tongue) { g.fillStyle = TONGUE; g.beginPath(); g.ellipse(tongue[0], tongue[1], tongue[2], tongue[3], 0, 0, TAU); g.fill(); }
    g.fillStyle = TEETH; g.fill(pp(look.sharpTeeth ? sharpTeeth(kind) : teeth));
    if (lines) { g.lineWidth = 0.025; g.strokeStyle = 'rgba(90,40,40,0.8)'; g.stroke(pp(lines)); }
    g.restore();
    g.lineWidth = 0.035; g.strokeStyle = MOUTH_COL; g.stroke(mp);
  }
  if (look.muzzle) g.restore();
}

/** Paint a face into a canvas context (already sized FACE_W × FACE_H). */
export function paintFace(g, look, X) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, FACE_W, FACE_H);
  g.setTransform(FACE_S, 0, 0, FACE_S, FACE_W / 2, FACE_Y0 * FACE_S);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const white = !!look.furWhite;
  const skin = skinTones(white ? '#fafafa' : hex(look.fur && look.furFace ? look.fur : look.skin, '#f1c9a0'));
  const brow = white ? '#b0a6a2' : browCol(look.nika ? '#ffffff' : look.hairColor);
  if (look.kind === 'Panda') { g.fillStyle = '#2b2b2b'; g.fill(pp(PANDA)); }
  if (look.muzzle) {
    g.fillStyle = skin.muzzle; g.beginPath(); g.ellipse(0, 0.56, 0.36, 0.27, 0, 0, TAU); g.fill();
    g.fillStyle = '#2d2226'; g.fill(pp(NOSE_ANIMAL));
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(-0.04, 0.35, 0.03, 0.02, 0, 0, TAU); g.fill();
  }
  if (look.gills) { g.lineWidth = 0.035; g.strokeStyle = skin.line; g.stroke(pp(GILLS)); }
  drawEyes(g, look, X);
  if ((look.grin || look.nika) && X.mouth === 'grin') {
    g.fillStyle = skin.blush; g.globalAlpha = 0.5;
    g.beginPath(); g.ellipse(-0.66, 0.46, 0.14, 0.07, 0, 0, TAU); g.ellipse(0.66, 0.46, 0.14, 0.07, 0, 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  if (!look.nose && look.kind !== 'Saw Shark' && look.race !== 'mink' && !look.muzzle) { g.lineWidth = 0.04; g.strokeStyle = skin.line; g.stroke(pp(NOSE_HINT)); }
  drawMouth(g, look, X);
  g.lineWidth = 0.075; g.strokeStyle = brow; g.stroke(pp(BROWS[X.brow] || BROWS.neutral));
  if (look.thirdEye) {
    g.fillStyle = '#ffffff'; g.fill(pp(THIRD)); g.lineWidth = 0.025; g.strokeStyle = INK; g.stroke(pp(THIRD));
    g.fillStyle = hex(look.eyeColor, '#8e44ad'); g.beginPath(); g.ellipse(0, -0.11, 0.06, 0.1, 0, 0, TAU); g.fill();
    g.fillStyle = '#1a1020'; g.beginPath(); g.ellipse(0, -0.1, 0.028, 0.05, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-0.02, -0.15, 0.025, 0, TAU); g.fill();
  }
  if (look.goggles === true) {
    g.fillStyle = '#241f2c'; g.fill(pp(SHADES.lens));
    g.lineWidth = 0.03; g.strokeStyle = '#15121a'; g.stroke(pp(SHADES.lens));
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill(pp(SHADES.glint));
    g.lineWidth = 0.06; g.strokeStyle = '#15121a'; g.stroke(pp(SHADES.bridge));
  }
}

// ------------------------------------------------------------------ texture cache
const CACHE = new Map(); // key → { tex, mat, refs, t }
const MAX = 150;
let tick = 0;
/**
 * The shared face material for a look + expression. Call release(key) when
 * a character stops using it (unused entries are evicted, oldest first).
 */
export function faceMaterial(look, X) {
  const key = `${faceKey(look)}~${X.eyes}${X.mouth}${X.brow}${X.small ? 1 : 0}`;
  let e = CACHE.get(key);
  if (!e) {
    const c = document.createElement('canvas');
    c.width = FACE_W; c.height = FACE_H;
    paintFace(c.getContext('2d'), look, X);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: charGradient(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    e = { key, tex, mat, refs: 1, t: ++tick };
    CACHE.set(key, e);
    if (CACHE.size > MAX) evict();
    return e;
  }
  e.refs++;
  e.t = ++tick;
  return e;
}
export function releaseFace(e) { if (e) e.refs = Math.max(0, e.refs - 1); }
function evict() {
  const idle = [...CACHE.values()].filter((e) => e.refs <= 0).sort((a, b) => a.t - b.t);
  for (let i = 0; i < idle.length && CACHE.size > MAX * 0.8; i++) {
    const e = idle[i];
    CACHE.delete(e.key);
    e.tex.dispose(); e.mat.dispose();
  }
}
export function faceCacheSize() { return CACHE.size; }
