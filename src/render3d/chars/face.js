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
import { charGradient, celShading } from './mats.js';

export const FACE_S = 96;            // canvas px per head radius
export const FACE_TOP = 0.5;         // head-unit y (up) at the top edge of the canvas
export const FACE_BOTTOM = -1.25;    // … and at the bottom edge (below the chin)
export const FACE_ANCHOR = 0.05;     // head-unit y of the painting's y = 0 (eyes at EYE_Y → -0.06)
/**
 * The painting's y of the eyes' centres: in their sockets under the brow,
 * level with the root of the nose, so in profile the eye sits above the nose
 * and its tip comes out well below the lower lid (as on a real head).
 */
export const EYE_Y = 0.11;
// (the brows, scars, shades and patches round the eyes were laid out for eyes
// at 0.17 and go with them)
const EYE_LIFT = EYE_Y - 0.17;
const eyeScale = (look) => (look.fem ? 1.14 : 1.1); // (big, clear eyes: the anime look)
export const FACE_W = 192, FACE_H = Math.round((FACE_TOP - FACE_BOTTOM) * FACE_S);

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
// men: thick, straight and low over the eyes; women: thin and arched
const BROWS_M = {
  fierce: 'M0.14 -0.08 Q0.36 -0.17 0.64 -0.27 M-0.14 -0.08 Q-0.36 -0.17 -0.64 -0.27',
  worried: 'M0.18 -0.27 Q0.42 -0.27 0.62 -0.14 M-0.18 -0.27 Q-0.42 -0.27 -0.62 -0.14',
  neutral: 'M0.16 -0.16 Q0.4 -0.24 0.64 -0.19 M-0.16 -0.16 Q-0.4 -0.24 -0.64 -0.19',
  stern: 'M0.14 -0.11 Q0.38 -0.21 0.64 -0.24 M-0.14 -0.11 Q-0.38 -0.21 -0.64 -0.24',
};
const BROWS_F = {
  fierce: 'M0.19 -0.14 Q0.4 -0.25 0.6 -0.33 M-0.19 -0.14 Q-0.4 -0.25 -0.6 -0.33',
  worried: 'M0.21 -0.33 Q0.42 -0.35 0.58 -0.22 M-0.21 -0.33 Q-0.42 -0.35 -0.58 -0.22',
  neutral: 'M0.21 -0.24 Q0.4 -0.37 0.59 -0.28 M-0.21 -0.24 Q-0.4 -0.37 -0.59 -0.28',
  stern: 'M0.19 -0.18 Q0.4 -0.29 0.6 -0.32 M-0.19 -0.18 Q-0.4 -0.29 -0.6 -0.32',
};
const MOUTH_COL = '#5c1c20', TONGUE = '#e0626a', TEETH = '#ffffff';
const MOUTHS = {
  fierce: 'M-0.14 0.66 Q0 0.58 0.14 0.66', ko: 'M-0.16 0.62 Q-0.08 0.54 0 0.62 Q0.08 0.7 0.16 0.62',
  animal: 'M-0.16 0.56 Q-0.08 0.66 0 0.54 Q0.08 0.66 0.16 0.56', smile: 'M-0.16 0.6 Q0 0.69 0.16 0.59', flat: 'M-0.14 0.62 Q0 0.64 0.14 0.61',
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
const SCAR = {
  F: 'M-0.52 -0.12 L-0.3 0.5', Fx: 'M-0.52 0.02 L-0.38 -0.02 M-0.46 0.24 L-0.32 0.2',
  // a curved cut under the character's left eye, stitched (Luffy's)
  C: 'M0.26 0.44 Q0.4 0.5 0.54 0.42', Cx: 'M0.32 0.41 L0.3 0.51 M0.4 0.43 L0.4 0.53 M0.48 0.41 L0.5 0.5',
};
const PANDA = 'M0.14 0.02 C0.2 -0.2 0.58 -0.22 0.68 0.12 C0.76 0.4 0.62 0.58 0.44 0.52 C0.24 0.46 0.1 0.26 0.14 0.02 Z M-0.14 0.02 C-0.2 -0.2 -0.58 -0.22 -0.68 0.12 C-0.76 0.4 -0.62 0.58 -0.44 0.52 C-0.24 0.46 -0.1 0.26 -0.14 0.02 Z';
const THIRD = 'M0 -0.28 Q0.11 -0.12 0 0.04 Q-0.11 -0.12 0 -0.28 Z';
const GILLS = 'M0.74 0.44 Q0.68 0.52 0.72 0.6 M0.68 0.54 Q0.62 0.62 0.66 0.7 M-0.74 0.44 Q-0.68 0.52 -0.72 0.6 M-0.68 0.54 Q-0.62 0.62 -0.66 0.7';
const NOSE_HINT = 'M0.03 0.39 Q0.08 0.46 0.02 0.49';
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
  return { eyes: blink ? 'blink' : fierce ? 'fierce' : 'open', mouth, brow: fierce ? 'fierce' : look.frown ? 'stern' : 'neutral', small: face === 'shout' };
}
// Eye styles, in each eye's own frame (+x toward the temple, y down). w/h
// scale the eye, tilt turns it (negative lifts the outer corner), iris sizes
// the iris, lid is the weight of the upper line, drop how far the upper lid
// hangs over the iris, flick/lashes add feminine lashes, lower draws part of
// the lower lash line, hl is the number of catch-lights.
export const EYE_STYLES = {
  // men: smaller irises, a heavy upper line, no lash flicks
  bold: { w: 1.0, h: 0.84, tilt: 0.02, iris: 0.84, lid: 0.085, drop: 0.12, flick: 0, lashes: 0, lower: 0.3, hl: 1 },
  sharp: { w: 1.1, h: 0.64, tilt: -0.15, iris: 0.78, lid: 0.09, drop: 0.24, flick: 0, lashes: 0, lower: 0.5, hl: 1 },
  narrow: { w: 1.08, h: 0.4, tilt: -0.05, iris: 0.72, lid: 0.085, drop: 0.46, flick: 0, lashes: 0, lower: 0.65, hl: 0 },
  beady: { w: 0.84, h: 0.8, tilt: 0, iris: 0.36, lid: 0.07, drop: 0.04, flick: 0, lashes: 0, lower: 0, hl: 0, beady: true },
  tired: { w: 1.02, h: 0.62, tilt: 0.1, iris: 0.82, lid: 0.095, drop: 0.42, flick: 0, lashes: 0, lower: 0.45, hl: 1, bags: true },
  // women: bigger irises, lashes flicking out at the corners
  bright: { w: 1.02, h: 0.94, tilt: 0, iris: 1.0, lid: 0.085, drop: 0.04, flick: 1, lashes: 2, lower: 1, hl: 2 },
  soft: { w: 1.04, h: 0.86, tilt: 0.1, iris: 0.96, lid: 0.08, drop: 0.1, flick: 0.8, lashes: 2, lower: 1, hl: 2 },
  cool: { w: 1.12, h: 0.64, tilt: -0.12, iris: 0.86, lid: 0.085, drop: 0.22, flick: 1.1, lashes: 3, lower: 0.7, hl: 2 },
  cat: { w: 1.08, h: 0.8, tilt: -0.22, iris: 0.92, lid: 0.085, drop: 0.06, flick: 1.4, lashes: 2, lower: 0.85, hl: 2 },
  // Fish-Men
  fish: { w: 1.0, h: 0.84, tilt: 0, iris: 0.55, lid: 0.07, drop: 0, flick: 0, lashes: 0, lower: 0, hl: 1, round: true },
};
export const EYES_M = ['bold', 'sharp', 'narrow', 'beady', 'tired'];
export const EYES_F = ['bright', 'soft', 'cool', 'cat'];
export const EYE_NAMES = { bold: 'Bold', sharp: 'Sharp', narrow: 'Narrow', beady: 'Beady', tired: 'Heavy-lidded', bright: 'Bright', soft: 'Gentle', cool: 'Cool', cat: 'Cat-eye', fish: 'Fish' };
const LEGACY_EYES = { round: ['bold', 'bright'], sharp: ['sharp', 'cool'], soft: ['bold', 'soft'] };
/** The eye style a look shows (always one that suits its build). */
export function eyeShapeOf(look) {
  const fem = !!look.fem;
  const e = look.eyeShape;
  if (e === 'fish' || (!e && look.race === 'fishman')) return 'fish';
  const set = fem ? EYES_F : EYES_M;
  if (e && set.includes(e)) return e;
  if (e && LEGACY_EYES[e]) return LEGACY_EYES[e][fem ? 1 : 0];
  // switching build keeps the character of the eyes
  const SWAP = { bold: 'bright', sharp: 'cool', narrow: 'cool', beady: 'bright', tired: 'soft', bright: 'bold', soft: 'bold', cool: 'sharp', cat: 'sharp' };
  if (e && SWAP[e] && set.includes(SWAP[e])) return SWAP[e];
  const seed = look.seed || 0;
  if (look.race === 'mink') return fem ? 'bright' : 'bold';
  return fem ? EYES_F[seed % 4] : ['bold', 'bold', 'sharp', 'sharp', 'narrow', 'tired'][seed % 6];
}

/** The part of a look the face texture depends on. */
export function faceKey(look) {
  const hairCol = look.furWhite ? '#fafafa' : look.nika ? '#ffffff' : look.hairColor;
  const skin = look.furWhite ? '#fafafa' : (look.fur && look.furFace ? look.fur : look.skin);
  return `${eyeShapeOf(look)}|${look.eyeColor}|${hairCol}|${skin}|${look.fem ? 'F' : 'M'}|${look.furWhite ? 1 : 0}${look.muzzle ? 1 : 0}${look.race === 'mink' ? 1 : 0}`
    + `${look.gills ? 1 : 0}${look.grin || look.nika ? 1 : 0}${look.sharpTeeth ? 1 : 0}${look.thirdEye ? 1 : 0}${look.scarEye ? 1 : 0}${look.scarCheek ? 1 : 0}${look.goggles === true ? 1 : 0}`
    + `|${look.kind === 'Panda' ? 'P' : ''}|${look.nose || (look.kind === 'Saw Shark' ? 'saw' : '')}|${look.fem ? 'F' : ''}`;
}

// ------------------------------------------------------------------ painting
/** The white of an eye for a style (a Path2D in the eye's frame). */
const WHITES = new Map();
function eyeWhite(st, key) {
  let p = WHITES.get(key);
  if (p) return p;
  const w = st.w, h = st.h;
  const ix = -0.19 * w, iy = 0.02, ox = 0.2 * w, oy = -0.04;
  const top = (-0.26 + st.drop * 0.52) * h - 0.02, bot = 0.26 * h;
  p = new Path2D();
  p.moveTo(ix, iy);
  p.bezierCurveTo(ix + 0.03 * w, top, ox - 0.08 * w, top - 0.015, ox, oy);
  p.bezierCurveTo(ox + 0.02 * w, oy + 0.2 * h, 0.12 * w, bot, 0, bot);
  p.bezierCurveTo(-0.12 * w, bot, ix - 0.01 * w, iy + 0.14 * h, ix, iy);
  p.closePath();
  const lid = new Path2D();
  lid.moveTo(ix - 0.015, iy + 0.01);
  lid.bezierCurveTo(ix + 0.03 * w, top, ox - 0.08 * w, top - 0.015, ox + 0.01, oy);
  const lower = new Path2D();
  const f = st.lower;
  // along the bottom curve from the outer corner, `lower` of the way
  lower.moveTo(ox, oy + 0.02);
  lower.bezierCurveTo(ox + 0.02 * w, oy + 0.2 * h * f, 0.12 * w + (1 - f) * 0.08, bot - (1 - f) * 0.1, (1 - f) * 0.12 * w, bot);
  const r = { white: p, lid, lower, ix, iy, ox, oy, top, bot };
  WHITES.set(key, r);
  return r;
}

function drawEyes(g, look, X) {
  const id = eyeShapeOf(look);
  const base = EYE_STYLES[id] || EYE_STYLES.bold;
  const white = !!look.furWhite;
  const iris = white ? '#ff1744' : hex(look.eyeColor, '#2d2226');
  const lt = mixHex(iris, '#ffffff', white ? 0.55 : 0.24);
  const pupil = white ? '#ff8a80' : mixHex(iris, '#000000', 0.7);
  const ey = EYE_Y;
  const closed = X.eyes === 'blink' || X.eyes === 'hurt' || X.eyes === 'ko';
  const fierce = X.eyes === 'fierce';
  // expressions reshape the style: fierce narrows and angles the eyes
  const st = fierce ? { ...base, tilt: base.tilt - 0.18, drop: Math.min(0.5, base.drop + 0.16), iris: base.iris * 0.85, h: base.h * 0.9 } : base;
  const key = id + (fierce ? 'F' : '');
  const E = eyeWhite(st, key);
  const ES = eyeScale(look);
  for (let n = 0; n < 2; n++) {
    const x = n ? 0.39 : -0.39;
    g.save();
    g.translate(x, ey);
    g.scale(ES, ES);
    if (x < 0) g.scale(-1, 1);
    g.rotate(st.tilt);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (closed) {
      g.lineWidth = X.eyes === 'ko' ? 0.05 : 0.075; g.strokeStyle = look.kind === 'Panda' ? '#f4f1ea' : INK;
      if (X.eyes === 'ko') { g.rotate(-st.tilt); g.scale(x < 0 ? -1 : 1, 1); g.stroke(pp(spiral())); } else g.stroke(pp(X.eyes === 'blink' ? EYE.blink : EYE.hurt));
      g.restore();
      continue;
    }
    g.fillStyle = '#ffffff'; g.fill(E.white);
    g.save();
    g.clip(E.white);
    // (the iris fills most of the eye, dark, so the eyes read from across a street)
    const ir = st.iris * (X.small ? 0.8 : 1) * 1.18;
    const ix = -0.01, iy = 0.05 + st.drop * 0.08;
    if (st.beady) {
      g.fillStyle = '#16100f'; g.beginPath(); g.ellipse(0, 0.05, 0.05, 0.065, 0, 0, TAU); g.fill();
    } else {
      const rx = 0.125 * ir * Math.min(1.08, st.w), ry = (st.round ? 0.125 : 0.19) * ir;
      g.fillStyle = iris; g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, TAU); g.fill();
      g.fillStyle = lt; g.beginPath(); g.ellipse(ix, iy + ry * 0.52, rx * 0.68, ry * 0.36, 0, 0, TAU); g.fill();
      g.fillStyle = pupil; g.beginPath(); g.ellipse(ix, iy + 0.012, rx * 0.5, ry * 0.55, 0, 0, TAU); g.fill();
      // the lid's shadow across the top of the eye
      g.fillStyle = 'rgba(40,20,30,0.28)'; g.beginPath(); g.ellipse(0, E.top - 0.02, 0.3, 0.09, 0, 0, TAU); g.fill();
    }
    g.restore();
    // upper lid: one heavy line (men) or a lashed line with a flick (women)
    g.strokeStyle = INK;
    g.lineWidth = st.lid; g.stroke(E.lid);
    if (st.flick) {
      const f = st.flick;
      g.fillStyle = INK; g.beginPath();
      g.moveTo(E.ox - 0.06, E.oy - 0.035); g.quadraticCurveTo(E.ox + 0.05 * f, E.oy - 0.06 * f, E.ox + 0.1 * f, E.oy - 0.1 * f);
      g.quadraticCurveTo(E.ox + 0.06 * f, E.oy + 0.0, E.ox + 0.01, E.oy + 0.03); g.closePath(); g.fill();
      g.lineWidth = 0.022;
      for (let k = 0; k < st.lashes; k++) {
        const t = 0.35 + k * 0.2, lx = E.ix + (E.ox - E.ix) * (0.45 + k * 0.18), ly = E.top * (1 - t * 0.4) + 0.01;
        g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 0.05, ly - 0.07 - k * 0.01); g.stroke();
      }
    } else {
      // the heavy upper line runs on a little past the outer corner, straight
      g.lineWidth = st.lid * 0.8;
      g.beginPath(); g.moveTo(E.ox - 0.03, E.oy - 0.01); g.lineTo(E.ox + 0.045, E.oy + 0.012); g.stroke();
    }
    if (st.lower > 0) { g.lineWidth = 0.026; g.stroke(E.lower); }
    if (st.bags) { g.lineWidth = 0.022; g.strokeStyle = 'rgba(60,30,30,0.7)'; g.beginPath(); g.moveTo(-0.08, E.bot + 0.07); g.quadraticCurveTo(0.04, E.bot + 0.11, 0.15, E.bot + 0.04); g.stroke(); }
    g.restore();
    // catch-lights on the upper-left (not mirrored)
    if (!st.beady && st.hl > 0) {
      g.fillStyle = '#ffffff';
      const cy = ey + 0.02 + st.drop * 0.1 + (fierce ? 0.03 : -0.02);
      g.beginPath(); g.arc(x - 0.06 * ES, ey + (cy - ey) * ES, (st.hl > 1 ? 0.056 : 0.045) * (id === 'fish' ? 0.8 : 1), 0, TAU); g.fill();
      if (st.hl > 1) { g.beginPath(); g.arc(x + 0.055 * ES, ey + 0.14 * ES, 0.028, 0, TAU); g.fill(); }
    } else if (st.beady) {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 0.015, ey + 0.03, 0.016, 0, TAU); g.fill();
    }
  }
  g.save(); g.translate(0, EYE_LIFT);
  if (look.scarEye) {
    g.lineWidth = 0.06; g.strokeStyle = '#9b3a36'; g.stroke(pp(SCAR.F));
    g.lineWidth = 0.03; g.stroke(pp(SCAR.Fx));
  }
  if (look.scarCheek) {
    g.lineWidth = 0.035; g.strokeStyle = '#8a3a34'; g.stroke(pp(SCAR.C));
    g.lineWidth = 0.022; g.stroke(pp(SCAR.Cx));
  }
  g.restore();
}

/** How far a look's painted eyes reach (head units, y up): the top of the lid, the iris's middle and the lower lid. */
export function eyeSpan(look) {
  const st = EYE_STYLES[eyeShapeOf(look)] || EYE_STYLES.bold, ES = eyeScale(look);
  const top = (-0.26 + st.drop * 0.52) * st.h - 0.02, bot = 0.26 * st.h;
  return { top: FACE_ANCHOR - (EYE_Y + top * ES), iris: FACE_ANCHOR - (EYE_Y + (0.05 + st.drop * 0.08) * ES), bottom: FACE_ANCHOR - (EYE_Y + bot * ES) };
}
function drawMouth(g, look, X) {
  const kind = X.mouth;
  // (under the nose, a lip's height below its tip)
  g.save(); g.translate(0, 0.095);
  if (look.muzzle) { g.save(); g.translate(0, 0.015); }
  if (typeof MOUTHS[kind] === 'string') {
    g.lineWidth = look.fem ? 0.058 : 0.05; g.strokeStyle = look.fem && (kind === 'smile' || kind === 'flat') ? '#b8405a' : MOUTH_COL; g.lineCap = 'round'; g.stroke(pp(MOUTHS[kind]));
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
  g.restore();
}

/** Paint a face into a canvas context (already sized FACE_W × FACE_H). */
export function paintFace(g, look, X) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, FACE_W, FACE_H);
  g.setTransform(FACE_S, 0, 0, FACE_S, FACE_W / 2, (FACE_TOP - FACE_ANCHOR) * FACE_S);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const white = !!look.furWhite;
  const skin = skinTones(white ? '#fafafa' : hex(look.fur && look.furFace ? look.fur : look.skin, '#f1c9a0'));
  const brow = white ? '#b0a6a2' : browCol(look.nika ? '#ffffff' : look.hairColor);
  if (look.kind === 'Panda') { g.save(); g.translate(0, EYE_LIFT); g.fillStyle = '#2b2b2b'; g.fill(pp(PANDA)); g.restore(); }
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
  // (the nose is sculpted on the head; the line down its shadowed side reads it from any distance)
  if (!look.muzzle && look.race !== 'mink') { g.lineWidth = 0.032; g.strokeStyle = skin.line; g.globalAlpha = 0.75; g.stroke(pp(NOSE_HINT)); g.globalAlpha = 1; }
  drawMouth(g, look, X);
  const BR = look.fem ? BROWS_F : BROWS_M;
  g.save(); g.translate(0, EYE_LIFT);
  g.lineWidth = look.fem ? 0.062 : 0.1; g.strokeStyle = brow; g.stroke(pp(BR[X.brow] || BR.neutral));
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
  g.restore();
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
    mat.onBeforeCompile = celShading;
    mat.customProgramCacheKey = () => 'op-char-face-1';
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
