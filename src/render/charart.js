// Head art for the character renderer: faces, eyes, expressions, hair and
// hats, cel-shaded in a One Piece / anime style.
//
// Called by ./character.js with the context already posed: upper-body frame
// in tile units, tilted with the head and MIRRORED for left-facing
// characters (so 'left' and 'right' are both drawn as a profile facing +x).
//
//   drawHead(g, look, hy, r, d, pose, t, P)
//     hy: head centre y, r: head radius (0.3), d: 'down' | 'up' | 'left' | 'right',
//     pose: state ('hurt' | 'knocked' | …), flash, ghost, moving, walk, and an
//     optional blink (true/false forces the eyes shut/open, for previews);
//     t: time (blinks, sway, Nika's flames);
//     P: sampled rig pose (P.face: null | 'fierce' | 'shout').
//   drawHair(g, style, col, hy, r, d, nikaT)   both hair layers, standalone
//     (used by the knocked-down pose, whose face is a plain circle).
//   drawHat(g, hat, hy, r, d, look)            the hat alone.
//
// Everything is drawn in "head units": the context is moved to the head
// centre and scaled by r, so every shape is a Path2D built once per
// style/view and reused by every character on screen. Light comes from the
// top-left (also for mirrored profiles); shading is one flat shadow tone
// (the fill is repeated nudged toward the light and clipped to the shape).
// At in-game sizes whole heads are also cached as small bitmaps (see
// cachedHead), so a crowd of NPCs costs one drawImage per head.
//
// Layers inside drawHead (front view):
//   hat tails → fins → BACK hair (the mass behind the head, long hair behind
//   the shoulders) → ears → face (+ the fringe's shadow) → eyes, nose, mouth →
//   FRONT hair (fringe, side locks, sideburns, knots) → animal ears and
//   antennae growing through it → brows (over the fringe, anime style) →
//   third eye, long nose, eyewear → hat.
// A hat that covers the head clips both hair layers at its band, so the
// fringe peeks out under the brim and tall hair never pokes through.
//
// Optional look fields (sensible defaults when absent):
//   eyeShape: 'round' | 'sharp' | 'soft' | 'fish'  (default from look.seed; fish-men: 'fish')
//   goggles: true → sunglasses over the eyes (the 'goggles' HAT is the pair on the forehead)
//   nose: 'long' (Usopp) | 'red' (Buggy); kind: 'Saw Shark' → saw nose, 'Panda' → eye patches
//   race 'skypiean' → little antennae
import { mixHex } from '../core/math.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const OUTLINE = 'rgba(30,20,20,0.85)';
const INK = '#2a1a1e';
const LW = 0.04;       // silhouette outline in tiles (the body uses 0.035–0.04)
const LW_IN = 0.02;    // inner lines in tiles

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
const PALS = new Map();
function hairPal(col) {
  const key = 'h' + col;
  let p = PALS.get(key);
  if (p) return p;
  const h = hex(col, '#2d2d2d'), L = lum(h);
  const base = L < 0.16 ? mixHex(h, '#474c69', 0.3) : h;
  p = {
    base,
    shadow: L > 0.78 ? mixHex(h, '#9796c2', 0.36) : mixHex(base, '#22122c', L < 0.16 ? 0.52 : 0.34),
    light: L < 0.3 ? mixHex(base, '#b9cdee', 0.5) : mixHex(base, '#ffffff', L > 0.78 ? 0.9 : 0.55),
    line: mixHex(base, '#120a12', L < 0.16 ? 0.62 : 0.5),
    brow: L > 0.62 ? mixHex(h, '#5b4a46', 0.6) : L < 0.16 ? '#1d1418' : mixHex(base, '#140c10', 0.5),
  };
  p.deep = mixHex(p.shadow, '#120a14', 0.25);
  PALS.set(key, p);
  return p;
}
/** Tones for a hat colour: dk (shadow), mid, lt / lt2 (lighter), band. */
function hatPal(col) {
  const key = 'k' + col;
  let p = PALS.get(key);
  if (p) return p;
  const h = hex(col, '#888888');
  p = { base: h, dk: mixHex(h, '#000000', 0.32), lt: mixHex(h, '#ffffff', 0.22), lt2: mixHex(h, '#ffffff', 0.55),
    mid: mixHex(h, '#000000', 0.12), band: mixHex(h, '#1a1010', 0.6) };
  PALS.set(key, p);
  return p;
}
function skinPal(col) {
  const key = 's' + col;
  let p = PALS.get(key);
  if (p) return p;
  const h = hex(col, '#f1c9a0'), L = lum(h);
  p = {
    base: h,
    shadow: L > 0.3 ? mixHex(h, '#a23f45', 0.22) : mixHex(h, '#12060c', 0.34),
    line: mixHex(h, '#3a1418', 0.6),
    light: mixHex(h, '#ffffff', 0.42),
    muzzle: mixHex(h, '#ffffff', L > 0.85 ? 0.0 : 0.5),
    inner: mixHex(h, '#f48fb1', 0.55),
    blush: mixHex(h, '#ff5a6e', 0.32),
  };
  p.deep = mixHex(p.shadow, '#000000', 0.22);
  p.innerDk = mixHex(p.inner, '#000000', 0.2);
  PALS.set(key, p);
  return p;
}
function tint(col, other, k) {
  const key = 't' + col + other + k;
  let p = PALS.get(key);
  if (!p) { p = mixHex(hex(col, '#888888'), hex(other, '#888888'), k); PALS.set(key, p); }
  return p;
}

// ------------------------------------------------------------ path builder
// Shapes are written as SVG path data in head units (head radius 1, y down)
// and turned into Path2D lazily, so this module can be imported anywhere.
const RD = (v) => Math.round(v * 1000) / 1000;
class PB {
  constructor() { this.s = ''; this.x = 0; this.y = 0; }
  M(x, y) { this.s += ` M${RD(x)} ${RD(y)}`; this.x = x; this.y = y; return this; }
  L(x, y) { this.s += ` L${RD(x)} ${RD(y)}`; this.x = x; this.y = y; return this; }
  Q(cx, cy, x, y) { this.s += ` Q${RD(cx)} ${RD(cy)} ${RD(x)} ${RD(y)}`; this.x = x; this.y = y; return this; }
  C(a, b, c, d, x, y) { this.s += ` C${RD(a)} ${RD(b)} ${RD(c)} ${RD(d)} ${RD(x)} ${RD(y)}`; this.x = x; this.y = y; return this; }
  /** Quadratic to (x, y) whose control is pushed `b` × length to the right of travel (screen space). */
  q(x, y, b = 0.1) {
    const mx = (this.x + x) / 2 - (y - this.y) * b, my = (this.y + y) / 2 + (x - this.x) * b;
    return this.Q(mx, my, x, y);
  }
  /** Chain of q() through points [x, y, bend?]. */
  zz(pts, b = 0.1) { for (const p of pts) this.q(p[0], p[1], p[2] ?? b); return this; }
  /** Elliptical arc (degrees, either direction) as cubics; the pen must be at the a0 point. */
  arc(cx, cy, rx, ry, a0, a1) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90));
    for (let i = 0; i < n; i++) {
      const b0 = (a0 + (a1 - a0) * i / n) * DEG, b1 = (a0 + (a1 - a0) * (i + 1) / n) * DEG;
      const k = 4 / 3 * Math.tan((b1 - b0) / 4);
      const x0 = Math.cos(b0), y0 = Math.sin(b0), x3 = Math.cos(b1), y3 = Math.sin(b1);
      this.C(cx + (x0 - k * y0) * rx, cy + (y0 + k * x0) * ry, cx + (x3 + k * y3) * rx, cy + (y3 - k * x3) * ry, cx + x3 * rx, cy + y3 * ry);
    }
    return this;
  }
  /** Scalloped arc (curls): n bumps from a0 to a1 (degrees); the pen must be at the a0 point. */
  bumps(cx, cy, r, a0, a1, n, k = 0.14) {
    for (let i = 0; i < n; i++) {
      const am = (a0 + (a1 - a0) * (i + 0.5) / n) * DEG, ae = (a0 + (a1 - a0) * (i + 1) / n) * DEG;
      this.Q(cx + Math.cos(am) * r * (1 + k), cy + Math.sin(am) * r * (1 + k), cx + Math.cos(ae) * r, cy + Math.sin(ae) * r);
    }
    return this;
  }
  ell(cx, cy, rx, ry) { this.M(cx + rx, cy); return this.arc(cx, cy, rx, ry, 0, 360).Z(); }
  Z() { this.s += ' Z'; return this; }
}
const pb = () => new PB();
const at = (cx, cy, r, a) => [cx + Math.cos(a * DEG) * r, cy + Math.sin(a * DEG) * r];
/** Alternating valley/tip points along an arc (degrees): 2n+1 points, valleys first and last. */
function spikePts(cx, cy, r0, r1, a0, a1, n, lean = 0) {
  const out = [];
  for (let i = 0; i <= 2 * n; i++) {
    const a = a0 + (a1 - a0) * i / (2 * n) + (i % 2 ? lean : 0);
    out.push(at(cx, cy, i % 2 ? r1 : r0, a));
  }
  return out;
}
/** Mirror a list of points across x = 0 and reverse it (for symmetric outlines). */
const mirror = (pts) => pts.map((p) => [-p[0], p[1], p[2]]).reverse();

const P2 = new Map();
function path(d) {
  if (typeof d !== 'string') return d;
  let p = P2.get(d);
  if (!p) { p = new Path2D(d); P2.set(d, p); }
  return p;
}
/** Cached ellipse Path2D (one or more ellipses: pass 4 numbers per ellipse). */
const ELL = new Map();
function EL(...a) {
  const key = a.join(',');
  let p = ELL.get(key);
  if (!p) { const b = pb(); for (let i = 0; i < a.length; i += 4) b.ell(a[i], a[i + 1], a[i + 2], a[i + 3]); p = new Path2D(b.s); ELL.set(key, p); }
  return p;
}
/** Path data mirrored across x = 0 (numbers come in "x y" pairs). */
const MIR = new Map();
function mirrorD(d) {
  let m = MIR.get(d);
  if (!m) { m = d.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => `${-x} ${y}`); MIR.set(d, m); }
  return m;
}

// ------------------------------------------------------------ head shapes
const FACE_F = pb().M(-1, 0).arc(0, 0, 1, 1, 180, 360).C(1, 0.44, 0.8, 0.8, 0.3, 0.97).Q(0, 1.06, -0.3, 0.97).C(-0.8, 0.8, -1, 0.44, -1, 0).Z().s;
const FACE_S = pb().M(0, -1).C(0.55, -1, 0.94, -0.62, 0.97, -0.12).Q(0.99, 0.08, 1.04, 0.2).L(1.13, 0.34).Q(1.07, 0.41, 0.97, 0.42)
  .Q(1.0, 0.5, 0.96, 0.58).Q(0.94, 0.7, 0.9, 0.8).Q(0.86, 0.95, 0.66, 0.96).Q(0.2, 0.94, -0.25, 0.86).Q(-0.62, 0.8, -0.83, 0.56)
  .arc(0, 0, 1, 1, 146, 270).Z().s;
const EAR_F = { both: 'M-0.93 0.02 C-1.2 -0.06 -1.24 0.42 -0.95 0.4 Z M0.93 0.02 C1.2 -0.06 1.24 0.42 0.95 0.4 Z',
  inner: 'M-0.99 0.12 Q-1.11 0.2 -1.0 0.31 M0.99 0.12 Q1.11 0.2 1.0 0.31' };
const EAR_S = { p: 'M0.02 0.06 C-0.12 -0.02 -0.27 0.1 -0.23 0.27 C-0.2 0.4 -0.06 0.45 0.02 0.36 Z', i: 'M-0.03 0.14 C-0.13 0.13 -0.16 0.26 -0.08 0.3' };

// ------------------------------------------------------------ hairstyles
// Each style gives, per view (F front, S profile facing +x, B back), a list
// of BACK parts (drawn before the face) and FRONT parts (after it). A part:
//   d: path data; tone: 'base' | 'shadow' (hair behind the head) | 'stubble' | 'tie' | 'cord';
//   shine: [cx, cy, r, a0, a1, n] highlight band (upper-left of the part);
//   strands: open path data for strand lines; shade: an extra shadow shape;
//   sway: [px, py, amp, speed, runLift]; at: [x, y, rotation] placement;
//   fringe: its shadow falls on the forehead; minor: flat below the top level
//   of detail; noInk: no outline.
// meta: top (hair top y in F, for crowns/halos), w (half-width at the band
// line, for headbands/goggles), hatK (hats grow to fit big hair).
const TIE = '#c8372d';
const STYLES = {};
const META = {
  short: { top: -1.16, w: 1.15, hatK: 1 }, spiky: { top: -1.5, w: 1.18, hatK: 1.03 }, long: { top: -1.18, w: 1.16, hatK: 1 },
  ponytail: { top: -1.16, w: 1.12, hatK: 1 }, buzz: { top: -1.1, w: 1.08, hatK: 0.97 }, curly: { top: -1.36, w: 1.24, hatK: 1.08 },
  afro: { top: -2.05, w: 1.5, hatK: 1.34 }, topknot: { top: -1.56, w: 1.1, hatK: 1 }, mohawk: { top: -2.18, w: 1.08, hatK: 0.98 },
  bald: { top: -1.0, w: 1.02, hatK: 0.95 }, bun: { top: -1.62, w: 1.12, hatK: 1 }, pompadour: { top: -1.9, w: 1.1, hatK: 1.03 },
  nika: { top: -1.7, w: 1.2, hatK: 1.05 },
};
const ALIAS = { straight: 'long', braid: 'ponytail', bob: 'short', crew: 'buzz', shaved: 'buzz', dreads: 'curly', wavy: 'curly', twintails: 'ponytail', odango: 'bun', quiff: 'pompadour' };
function styleId(s) {
  if (s && META[s]) return s;
  if (s && ALIAS[s]) return ALIAS[s];
  return 'short';
}

// shared pieces ------------------------------------------------------------
/** Front cap: sideburns to y=sb, a dome of radius V, and a fringe through `fringe` (right → left). */
function capF(V, sb, fringe, bend = 0.07, cy = -0.04) {
  const b = pb().M(-1.07, sb).q(-V, cy, -0.06).arc(0, cy, V, V - 0.01, 180, 360).q(1.07, sb, -0.06).L(0.93, -0.02);
  b.zz(fringe, bend).L(-0.93, -0.02).Z();
  return b.s;
}
/** Profile hair edge below the cap: nape → behind the ear → over it → sideburn → temple. */
function sideEdgeS(b, nape, sbY = 0.3) {
  b.zz(nape, 0.05).C(-0.38, 0.26, -0.3, 0.06, -0.2, -0.04).Q(0.0, -0.14, 0.16, -0.04).L(0.24, sbY).L(0.36, -0.08);
  return b;
}
const FRINGE_S = [[0.5, -0.42], [0.64, -0.22], [0.74, -0.46], [0.88, -0.24], [0.92, -0.44]];
/** Profile cap (fringe → crown → back → nape → ear → sideburn), used by most styles. */
function capS(backC, nape, fringe = FRINGE_S, sbY = 0.3) {
  const b = pb().M(1.02, -0.24).Q(1.14, -0.5, 1.04, -0.72).C(0.92, -1.02, 0.56, -1.16, 0.14, -1.16);
  backC(b);
  sideEdgeS(b, nape, sbY).zz(fringe, 0.06).L(1.02, -0.24).Z();
  return b.s;
}
const NAPE_S = [[-0.84, 0.34], [-0.72, 0.56], [-0.6, 0.34], [-0.46, 0.46]];
const backRound = (b) => b.C(-0.46, -1.16, -1.13, -0.86, -1.15, -0.22).C(-1.16, 0.1, -1.06, 0.36, -0.94, 0.52);
/** Back view cap with a pointed nape edge. */
function capB(V, nape, sy = 0.3, cy = -0.04) {
  return pb().M(-1.08, sy).q(-V, cy, -0.06).arc(0, cy, V, V - 0.01, 180, 360).q(1.08, sy, -0.06).zz(nape, 0.06).L(-1.08, sy).Z().s;
}
const NAPE_B = [[0.92, 0.46], [0.8, 0.3], [0.64, 0.6], [0.48, 0.4], [0.3, 0.64], [0.12, 0.42], [-0.06, 0.66], [-0.24, 0.42], [-0.42, 0.62], [-0.58, 0.4], [-0.76, 0.56], [-0.9, 0.34]];
const SHINE_F = [0, -0.06, 0.8, 200, 262, 4];
const SHINE_S = [-0.1, -0.12, 0.8, 204, 266, 4];
const SHINE_B = [0, -0.06, 0.8, 202, 262, 4];
const CROWN_STRAND = 'M-0.5 -0.86 Q-0.2 -0.7 -0.02 -0.44';
/** Slicked skull cap (buzz / topknot / mohawk sides): hairline at y=hl in front. */
function slickF(V, hl) {
  return pb().M(-1.0, 0.12).q(-V, -0.06, -0.04).arc(0, -0.06, V, V - 0.02, 180, 360).q(1.0, 0.12, -0.04).L(0.94, 0.02)
    .C(0.9, -0.3, 0.72, hl + 0.04, 0.48, hl + 0.02).Q(0.2, hl + 0.04, 0, hl - 0.06).Q(-0.2, hl + 0.04, -0.48, hl + 0.02)
    .C(-0.72, hl + 0.04, -0.9, -0.3, -0.94, 0.02).Z().s;
}
function slickS(V, hlx = 0.9) {
  return pb().M(hlx, -0.5).C(hlx - 0.12, -0.96, 0.42, -V + 0.02, 0.08, -V + 0.02).C(-0.52, -V + 0.02, -V, -0.8, -V, -0.16)
    .C(-V, 0.16, -1.0, 0.36, -0.88, 0.5).C(-0.6, 0.44, -0.4, 0.24, -0.24, -0.02).Q(0.0, -0.12, 0.14, -0.02)
    .L(0.2, 0.16).L(0.3, -0.12).C(0.46, -0.36, 0.7, -0.48, hlx, -0.5).Z().s;
}
function slickB(V, ny = 0.58) {
  return pb().M(-1.0, 0.36).q(-V, -0.06, -0.05).arc(0, -0.06, V, V - 0.02, 180, 360).q(1.0, 0.36, -0.05).Q(0.5, ny, 0, ny).Q(-0.5, ny, -1.0, 0.36).Z().s;
}

// short -------------------------------------------------------------------
const FRINGE_SHORT = [[0.84, -0.44], [0.7, -0.24], [0.54, -0.56], [0.36, -0.26], [0.18, -0.58], [-0.02, -0.25], [-0.2, -0.57], [-0.4, -0.27], [-0.58, -0.53], [-0.78, -0.25], [-0.88, -0.44]];
const STRANDS_SHORT = 'M0.54 -0.56 Q0.5 -0.78 0.38 -0.92 M0.18 -0.58 Q0.16 -0.82 0.06 -0.98 M-0.2 -0.57 Q-0.2 -0.8 -0.28 -0.95 M-0.58 -0.53 Q-0.56 -0.72 -0.66 -0.84';
const backShortF = pb().M(-1.1, -0.2).arc(0, -0.04, 1.12, 1.1, 188, 352).q(1.12, 0.38, -0.05)
  .zz([[1.0, 0.3], [1.02, 0.56], [0.86, 0.44], [0.7, 0.5]], 0.05).L(0.6, 0.3).L(-0.6, 0.3).L(-0.7, 0.5)
  .zz([[-0.86, 0.44], [-1.02, 0.56], [-1.0, 0.3], [-1.12, 0.38]], 0.05).q(-1.1, -0.2, -0.05).Z().s;
STYLES.short = {
  F: { back: [{ d: backShortF, tone: 'shadow' }], front: [{ d: capF(1.13, 0.3, FRINGE_SHORT), shine: SHINE_F, strands: STRANDS_SHORT, fringe: true }] },
  S: { back: [], front: [{ d: capS(backRound, NAPE_S), shine: SHINE_S, strands: 'M0.74 -0.46 Q0.5 -0.8 0.1 -0.96 M0.5 -0.42 Q0.2 -0.66 -0.2 -0.8 M-0.6 0.34 Q-0.8 0 -0.84 -0.4 M-0.84 0.34 Q-1.0 0.0 -1.0 -0.3', fringe: true }] },
  B: { back: [], front: [{ d: capB(1.13, NAPE_B), shine: SHINE_B, strands: CROWN_STRAND + ' M0.64 0.6 Q0.7 0.2 0.8 -0.1 M0.3 0.64 Q0.3 0.2 0.4 -0.2 M-0.06 0.66 Q-0.1 0.3 -0.1 0.0 M-0.42 0.62 Q-0.5 0.2 -0.6 -0.1' }] },
};

// spiky -------------------------------------------------------------------
const FRINGE_SPIKY = [[0.84, -0.5], [0.68, -0.2], [0.5, -0.6], [0.3, -0.2], [0.12, -0.62], [-0.1, -0.21], [-0.3, -0.62], [-0.52, -0.22], [-0.7, -0.56], [-0.88, -0.24], [-0.9, -0.46]];
const capSpikyF = (() => {
  const b = pb().M(-1.1, 0.36).q(-1.12, -0.04, -0.05).zz(spikePts(0, -0.06, 1.1, 1.46, 184, 356, 5, -3), 0.05).q(1.1, 0.36, -0.05).L(0.93, -0.02);
  return b.zz(FRINGE_SPIKY, 0.07).L(-0.93, -0.02).Z().s;
})();
const backSpikyF = pb().M(-1.02, -0.3).L(1.02, -0.3).zz([[1.42, -0.04], [1.1, 0.06], [1.36, 0.42], [1.0, 0.34], [1.08, 0.68], [0.7, 0.46]], 0.04)
  .L(-0.7, 0.46).zz(mirror([[1.02, -0.3], [1.42, -0.04], [1.1, 0.06], [1.36, 0.42], [1.0, 0.34], [1.08, 0.68]]), 0.04).Z().s;
const capSpikyS = (() => {
  const b = pb().M(1.02, -0.24).Q(1.16, -0.52, 1.06, -0.7);
  b.zz([[1.3, -0.92], [0.82, -0.98], [0.88, -1.4], [0.4, -1.12], [0.18, -1.58], [-0.08, -1.14], [-0.56, -1.48], [-0.66, -0.96], [-1.24, -1.04],
    [-1.04, -0.58], [-1.5, -0.44], [-1.1, -0.14], [-1.42, 0.2], [-1.0, 0.24], [-1.08, 0.6], [-0.74, 0.4], [-0.64, 0.62], [-0.48, 0.4]], 0.04);
  b.C(-0.38, 0.24, -0.3, 0.06, -0.2, -0.04).Q(0.0, -0.14, 0.16, -0.04).L(0.26, 0.34).L(0.36, -0.08);
  return b.zz([[0.5, -0.46], [0.66, -0.2], [0.76, -0.5], [0.9, -0.22], [0.94, -0.46]], 0.06).L(1.02, -0.24).Z().s;
})();
const capSpikyB = (() => {
  const s0 = at(0, -0.08, 1.1, 150);
  const b = pb().M(s0[0], s0[1]).zz(spikePts(0, -0.08, 1.1, 1.46, 150, 390, 8, -7), 0.04);
  return b.zz([[0.8, 0.68], [0.66, 0.44], [0.48, 0.72], [0.3, 0.46], [0.12, 0.74], [-0.06, 0.46], [-0.24, 0.72], [-0.42, 0.46], [-0.6, 0.7], [-0.76, 0.44], [s0[0], s0[1]]], 0.04).Z().s;
})();
STYLES.spiky = {
  F: { back: [{ d: backSpikyF, tone: 'shadow' }], front: [{ d: capSpikyF, shine: [0, -0.06, 0.82, 200, 262, 4], strands: 'M0.5 -0.6 Q0.5 -0.9 0.56 -1.1 M0.12 -0.62 Q0.1 -0.95 0.02 -1.2 M-0.3 -0.62 Q-0.34 -0.9 -0.5 -1.08 M-0.7 -0.56 Q-0.8 -0.7 -1.0 -0.8', fringe: true }] },
  S: { back: [], front: [{ d: capSpikyS, shine: SHINE_S, strands: 'M0.76 -0.5 Q0.5 -0.84 0.18 -1.0 M0.5 -0.46 Q0.2 -0.7 -0.3 -0.86 M-0.2 -0.6 Q-0.6 -0.66 -1.0 -0.5 M-0.64 0.3 Q-0.8 0 -0.9 -0.2', fringe: true }] },
  B: { back: [], front: [{ d: capSpikyB, shine: SHINE_B, strands: CROWN_STRAND + ' M0.48 0.7 Q0.5 0.3 0.6 0.0 M0.12 0.72 Q0.1 0.3 0.12 0.0 M-0.24 0.7 Q-0.3 0.3 -0.4 0.0 M-0.6 0.66 Q-0.7 0.3 -0.8 0.1' }] },
};

// long --------------------------------------------------------------------
const backLongF = pb().M(-1.11, -0.3).arc(0, -0.06, 1.14, 1.12, 192, 348).C(1.24, 0.2, 1.3, 0.85, 1.27, 1.32)
  .zz([[1.15, 1.52], [1.05, 1.3], [0.93, 1.48], [0.84, 1.18]], 0.05).C(0.8, 1.0, 0.7, 0.92, 0.5, 0.88).L(-0.5, 0.88)
  .C(-0.7, 0.92, -0.8, 1.0, -0.84, 1.18).zz([[-0.93, 1.48], [-1.05, 1.3], [-1.15, 1.52], [-1.27, 1.32]], 0.05)
  .C(-1.3, 0.85, -1.24, 0.2, -1.11, -0.3).Z().s;
const FRINGE_LONG = [[0.8, -0.36], [0.64, -0.24], [0.48, -0.52], [0.3, -0.26], [0.13, -0.54], [-0.06, -0.26], [-0.24, -0.54], [-0.44, -0.27], [-0.62, -0.5], [-0.8, -0.26], [-0.86, -0.38]];
const capLongF = pb().M(-0.92, -0.06).C(-0.98, 0.3, -0.95, 0.8, -0.8, 1.1).zz([[-0.9, 1.4], [-0.98, 1.18], [-1.08, 1.42], [-1.15, 1.12]], 0.06)
  .C(-1.24, 0.7, -1.22, 0.2, -1.14, -0.06).arc(0, -0.06, 1.14, 1.12, 180, 360).C(1.22, 0.2, 1.24, 0.7, 1.15, 1.12)
  .zz([[1.08, 1.42], [0.98, 1.18], [0.9, 1.4], [0.8, 1.1]], 0.06).C(0.95, 0.8, 0.98, 0.3, 0.92, -0.06)
  .zz(FRINGE_LONG, 0.06).L(-0.92, -0.06).Z().s;
const capLongS = (() => {
  const b = pb().M(1.02, -0.24).Q(1.14, -0.5, 1.04, -0.72).C(0.92, -1.02, 0.56, -1.16, 0.14, -1.16)
    .C(-0.5, -1.16, -1.16, -0.84, -1.18, -0.12).C(-1.2, 0.5, -1.14, 1.1, -1.06, 1.6)
    .zz([[-0.94, 1.38], [-0.82, 1.64], [-0.68, 1.38], [-0.54, 1.6], [-0.42, 1.3]], 0.05)
    .C(-0.3, 1.06, -0.04, 0.86, 0.2, 0.62).C(0.32, 0.4, 0.32, 0.1, 0.36, -0.08);
  return b.zz(FRINGE_S, 0.06).L(1.02, -0.24).Z().s;
})();
const capLongB = pb().M(-1.14, -0.1).arc(0, -0.08, 1.15, 1.13, 181, 359).C(1.22, 0.5, 1.26, 1.1, 1.2, 1.55)
  .zz([[1.04, 1.36], [0.9, 1.62], [0.72, 1.4], [0.54, 1.66], [0.36, 1.42], [0.18, 1.68], [0, 1.44], [-0.18, 1.68], [-0.36, 1.42], [-0.54, 1.66], [-0.72, 1.4], [-0.9, 1.62], [-1.04, 1.36], [-1.2, 1.55]], 0.05)
  .C(-1.26, 1.1, -1.22, 0.5, -1.14, -0.1).Z().s;
STYLES.long = {
  F: { back: [{ d: backLongF, tone: 'shadow', strands: 'M1.1 0.3 Q1.16 0.8 1.1 1.3 M-1.1 0.3 Q-1.16 0.8 -1.1 1.3', sway: [0, -0.3, 0.018, 1.6, 0] }],
    front: [{ d: capLongF, shine: [0, -0.06, 0.82, 198, 262, 4], strands: 'M0.48 -0.52 Q0.44 -0.8 0.3 -0.96 M0.13 -0.54 Q0.1 -0.84 0.0 -1.0 M-0.24 -0.54 Q-0.26 -0.8 -0.36 -0.94 M1.06 0.2 Q1.1 0.7 1.0 1.2 M-1.06 0.2 Q-1.1 0.7 -1.0 1.2', fringe: true }] },
  S: { back: [], front: [{ d: capLongS, shine: SHINE_S, strands: 'M0.74 -0.46 Q0.5 -0.8 0.1 -0.96 M-0.6 -0.2 Q-0.8 0.6 -0.72 1.3 M-0.3 0.1 Q-0.5 0.7 -0.5 1.2 M0.1 0.2 Q-0.1 0.6 -0.2 0.9', fringe: true }] },
  B: { back: [], front: [{ d: capLongB, shine: SHINE_B, strands: CROWN_STRAND + ' M0.8 0.2 Q0.86 0.8 0.72 1.36 M0.36 0.1 Q0.4 0.8 0.36 1.4 M-0.1 0.1 Q-0.1 0.8 0 1.4 M-0.5 0.2 Q-0.56 0.8 -0.54 1.4 M-0.9 0.2 Q-0.96 0.8 -0.9 1.4' }] },
};

// ponytail ----------------------------------------------------------------
const FRINGE_PONY = [[0.8, -0.42], [0.62, -0.25], [0.46, -0.56], [0.22, -0.27], [0.06, -0.58], [-0.2, -0.3], [-0.36, -0.58], [-0.6, -0.3], [-0.74, -0.52], [-0.88, -0.3]];
const capPonyF = pb().M(-1.0, 0.2).q(-1.11, -0.06, -0.06).arc(0, -0.06, 1.11, 1.1, 180, 360).q(1.0, 0.2, -0.06).L(0.92, -0.04)
  .zz(FRINGE_PONY, 0.08).L(-0.92, -0.04).Z().s;
const tailPonyF = pb().M(0.3, -0.98).C(0.95, -1.42, 1.72, -0.9, 1.6, 0.1).q(1.3, 1.02, -0.06).q(1.22, 0.1, -0.08).C(1.2, -0.42, 0.92, -0.62, 0.48, -0.64).Z().s;
const capPonyS = pb().M(1.02, -0.26).Q(1.12, -0.52, 1.02, -0.72).C(0.9, -1.0, 0.54, -1.13, 0.12, -1.13).C(-0.46, -1.13, -0.98, -0.9, -1.1, -0.5)
  .C(-1.12, -0.2, -1.02, 0.1, -0.84, 0.3).C(-0.6, 0.26, -0.36, 0.1, -0.22, -0.04).Q(0.0, -0.14, 0.16, -0.04).L(0.22, 0.2).L(0.34, -0.1)
  .zz([[0.5, -0.42], [0.64, -0.24], [0.74, -0.48], [0.88, -0.26], [0.92, -0.46]], 0.06).L(1.02, -0.26).Z().s;
const tailPonyS = pb().M(-0.86, -0.78).C(-1.5, -0.92, -1.78, -0.3, -1.64, 0.42).q(-1.36, 1.16, -0.05).q(-1.3, 0.44, -0.08).C(-1.24, -0.12, -1.1, -0.4, -0.86, -0.44).Z().s;
const capPonyB = pb().M(-1.04, 0.3).q(-1.11, -0.06, -0.06).arc(0, -0.06, 1.11, 1.1, 180, 360).q(1.04, 0.3, -0.06)
  .zz([[0.8, 0.46], [0.62, 0.44], [0.46, 0.56], [0.3, 0.5], [0.12, 0.6], [-0.06, 0.52], [-0.26, 0.6], [-0.44, 0.5], [-0.62, 0.56], [-0.8, 0.44], [-1.04, 0.3]], 0.05).Z().s;
const tailPonyB = pb().M(-0.16, -0.36).C(-0.36, 0.1, -0.32, 0.7, -0.18, 1.2).q(0.0, 1.44, -0.1).q(0.18, 1.2, -0.1).C(0.32, 0.7, 0.36, 0.1, 0.16, -0.36).Z().s;
const PULLED_B = 'M-0.8 0.36 Q-0.62 -0.06 -0.14 -0.32 M0.72 0.42 Q0.5 0.0 0.12 -0.3 M-0.22 0.5 Q-0.14 0.1 -0.04 -0.26 M-0.96 -0.3 Q-0.6 -0.44 -0.16 -0.36 M0.6 -0.72 Q0.3 -0.5 0.14 -0.4';
STYLES.ponytail = {
  F: { back: [{ d: tailPonyF, tone: 'shadow', sway: [0.55, -0.8, 0.06, 2.1, 0], strands: 'M0.6 -0.9 Q1.3 -0.9 1.4 0.2' }],
    front: [{ d: capPonyF, shine: [0, -0.06, 0.8, 200, 262, 4], strands: 'M0.46 -0.56 Q0.44 -0.84 0.3 -1.0 M0.06 -0.58 Q0.04 -0.86 -0.06 -1.04 M-0.36 -0.58 Q-0.4 -0.8 -0.5 -0.92', fringe: true }] },
  S: { back: [], front: [{ d: tailPonyS, minor: true, sway: [-0.95, -0.62, 0.07, 2.1, 0.35], strands: 'M-1.0 -0.6 Q-1.5 -0.3 -1.46 0.7 M-1.2 -0.6 Q-1.6 -0.2 -1.5 0.4' },
    { d: capPonyS, shine: SHINE_S, strands: 'M0.74 -0.48 Q0.4 -0.8 -0.2 -0.84 M0.5 -0.42 Q0.2 -0.62 -0.4 -0.66 M0.2 -0.1 Q-0.3 -0.3 -0.7 -0.5 M-0.5 0.2 Q-0.8 0 -0.9 -0.4', fringe: true },
    { d: pb().ell(0, 0, 0.12, 0.2).s, tone: 'tie', at: [-0.99, -0.61, 0.35] }] },
  B: { back: [], front: [{ d: capPonyB, shine: SHINE_B, strands: PULLED_B }, { d: tailPonyB, minor: true, sway: [0, -0.32, 0.06, 2.1, 0], shine: [0, 0.3, 0.5, 250, 290, 2], strands: 'M-0.08 -0.2 Q-0.14 0.5 -0.06 1.2 M0.08 -0.2 Q0.14 0.5 0.06 1.2' },
    { d: pb().ell(0, 0, 0.2, 0.11).s, tone: 'tie', at: [0, -0.32, 0] }] },
};

// buzz --------------------------------------------------------------------
STYLES.buzz = {
  F: { back: [], front: [{ d: slickF(1.07, -0.54), shine: [0, -0.05, 0.78, 205, 255, 3], strands: 'M0.48 -0.52 L0.44 -0.62 M0.24 -0.52 L0.22 -0.63 M0 -0.6 L0 -0.7 M-0.24 -0.52 L-0.22 -0.63 M-0.48 -0.52 L-0.44 -0.62', fringe: true, off: 0.08 }] },
  S: { back: [], front: [{ d: slickS(1.08), shine: [-0.1, -0.1, 0.78, 205, 262, 3], off: 0.08, fringe: true }] },
  B: { back: [], front: [{ d: slickB(1.07), shine: [0, -0.05, 0.78, 205, 255, 3], strands: 'M-0.6 0.48 L-0.58 0.38 M-0.3 0.55 L-0.29 0.45 M0 0.57 L0 0.47 M0.3 0.55 L0.29 0.45 M0.6 0.48 L0.58 0.38', off: 0.08 }] },
};

// curly -------------------------------------------------------------------
const backCurlyF = (() => { const s = at(0, -0.12, 1.22, 150); return pb().M(s[0], s[1]).bumps(0, -0.12, 1.22, 150, 390, 12, 0.15).L(0.6, 0.55).L(-0.6, 0.55).Z().s; })();
const capCurlyF = (() => {
  const b = pb().M(-1.02, 0.28).q(-1.13, -0.12, -0.05);
  const s = at(0, -0.1, 1.14, 186); b.L(s[0], s[1]).bumps(0, -0.1, 1.14, 186, 354, 8, 0.11).q(1.02, 0.28, -0.05).L(0.92, -0.04);
  return b.q(0.72, -0.4, -0.6).zz([[0.38, -0.44], [0.02, -0.42], [-0.34, -0.44], [-0.72, -0.4]], -0.8).q(-0.92, -0.04, -0.6).Z().s;
})();
const CURLS = 'M0.42 -0.66 q0.08 -0.12 0.2 -0.02 M-0.18 -0.84 q0.08 -0.12 0.2 -0.02 M-0.7 -0.62 q0.08 -0.12 0.2 -0.02 M0.12 -1.0 q0.08 -0.12 0.18 -0.02 M0.74 -0.7 q0.08 -0.12 0.18 -0.02 M-0.5 -1.0 q0.08 -0.12 0.18 -0.02';
const capCurlyS = (() => {
  const b = pb().M(1.0, -0.2).q(0.93, -0.67, -0.5).bumps(-0.06, -0.1, 1.14, 330, 150, 9, 0.13);
  b.zz([[-0.8, 0.62], [-0.52, 0.5]], -0.7).C(-0.4, 0.3, -0.3, 0.06, -0.2, -0.04).Q(0.0, -0.14, 0.16, -0.04).q(0.28, 0.3, -0.5).q(0.38, -0.06, -0.3);
  return b.zz([[0.6, -0.36], [0.82, -0.36]], -0.7).q(1.0, -0.2, -0.6).Z().s;
})();
const capCurlyB = (() => {
  const s = at(0, -0.1, 1.2, 160);
  return pb().M(s[0], s[1]).bumps(0, -0.1, 1.2, 160, 380, 11, 0.15).zz([[0.84, 0.62], [0.5, 0.7], [0.16, 0.72], [-0.18, 0.72], [-0.52, 0.7], [-0.86, 0.62], [s[0], s[1]]], -0.7).Z().s;
})();
STYLES.curly = {
  F: { back: [{ d: backCurlyF, tone: 'shadow' }], front: [{ d: capCurlyF, shine: [0, -0.1, 0.8, 204, 262, 4], strands: CURLS, fringe: true }] },
  S: { back: [], front: [{ d: capCurlyS, shine: SHINE_S, strands: 'M0.34 -0.74 q0.08 -0.12 0.2 -0.02 M-0.36 -0.84 q0.08 -0.12 0.2 -0.02 M-0.86 -0.34 q0.08 -0.12 0.2 -0.02 M-0.66 0.24 q0.08 -0.12 0.18 -0.02 M0.0 -0.4 q0.08 -0.12 0.18 -0.02', fringe: true }] },
  B: { back: [], front: [{ d: capCurlyB, shine: SHINE_B, strands: CURLS + ' M-0.5 0.3 q0.08 -0.12 0.2 -0.02 M0.3 0.3 q0.08 -0.12 0.2 -0.02 M-0.1 0.0 q0.08 -0.12 0.2 -0.02' }] },
};

// afro --------------------------------------------------------------------
const AFRO_BUMPS = 'M-1.0 -0.86 q0.1 -0.14 0.22 -0.02 M-0.4 -1.36 q0.1 -0.14 0.22 -0.02 M0.34 -1.28 q0.1 -0.14 0.22 -0.02 M0.86 -0.66 q0.1 -0.14 0.22 -0.02 M-1.26 -0.16 q0.1 -0.14 0.22 -0.02 M0.02 -0.9 q0.1 -0.14 0.22 -0.02 M-0.62 -0.5 q0.1 -0.14 0.22 -0.02 M1.1 -1.1 q0.1 -0.14 0.22 -0.02';
const backAfroF = pb().M(1.52, -0.5).bumps(0, -0.5, 1.52, 0, 360, 18, 0.09).Z().s;
const capAfroF = pb().M(-1.52, -0.5).bumps(0, -0.5, 1.52, 180, 360, 9, 0.09).q(0.98, -0.12, 0.1)
  .zz([[0.66, -0.4], [0.3, -0.46], [-0.06, -0.46], [-0.42, -0.44], [-0.76, -0.36], [-0.98, -0.12]], -0.7).q(-1.52, -0.5, 0.1).Z().s;
const capAfroS = (() => {
  const b = pb().M(0.86, -0.36).q(1.11, -0.99, -0.4).bumps(-0.28, -0.48, 1.48, 340, 150, 12, 0.09);
  return b.zz([[-1.32, 0.56], [-1.0, 0.64], [-0.66, 0.58]], -0.6).C(-0.4, 0.5, -0.1, 0.44, 0.28, 0.46).q(0.42, -0.06, -0.4)
    .zz([[0.62, -0.3], [0.86, -0.36]], -0.6).Z().s;
})();
const capAfroB = pb().M(1.52, -0.45).bumps(0, -0.45, 1.52, 0, 360, 18, 0.09).Z().s;
STYLES.afro = {
  F: { back: [{ d: backAfroF, tone: 'shadow', strands: AFRO_BUMPS }], front: [{ d: capAfroF, shine: [0, -0.5, 1.02, 200, 258, 4], strands: AFRO_BUMPS, fringe: true, off: 0.16 }] },
  S: { back: [], front: [{ d: capAfroS, shine: [-0.28, -0.5, 1.0, 204, 262, 4], strands: AFRO_BUMPS, fringe: true, off: 0.16 }] },
  B: { back: [], front: [{ d: capAfroB, shine: [0, -0.45, 1.02, 200, 258, 4], strands: AFRO_BUMPS, off: 0.16 }] },
};

// topknot -----------------------------------------------------------------
// hair pulled up into a samurai knot: widow's peak, loose temple locks and a brush-like tuft
const capKnotF = pb().M(-1.0, 0.24).q(-1.1, -0.08, -0.05).arc(0, -0.06, 1.1, 1.08, 180, 360).q(1.0, 0.24, -0.05).L(0.92, -0.02)
  .zz([[0.9, -0.3], [0.78, -0.1]], 0.08).C(0.72, -0.42, 0.5, -0.56, 0.3, -0.56).Q(0.12, -0.56, 0, -0.68).Q(-0.12, -0.56, -0.3, -0.56)
  .C(-0.5, -0.56, -0.72, -0.42, -0.78, -0.1).zz([[-0.9, -0.3], [-0.92, -0.02]], 0.08).Z().s;
const tuftF = pb().M(-0.14, -1.02).C(-0.2, -1.18, -0.3, -1.32, -0.27, -1.46).L(-0.16, -1.4).L(-0.1, -1.6).L(0, -1.45).L(0.1, -1.62).L(0.16, -1.42)
  .L(0.28, -1.48).C(0.3, -1.32, 0.2, -1.18, 0.14, -1.02).Q(0, -0.98, -0.14, -1.02).Z().s;
const tuftS = pb().M(-0.36, -1.0).C(-0.38, -1.22, -0.2, -1.3, 0.1, -1.3).L(0.42, -1.36).L(0.64, -1.46).L(0.52, -1.26).L(0.7, -1.2).L(0.44, -1.12)
  .C(0.2, -1.1, 0.0, -1.08, -0.06, -0.98).Z().s;
const capKnotS = pb().M(0.9, -0.5).C(0.78, -0.96, 0.42, -1.1, 0.08, -1.1).C(-0.52, -1.1, -1.1, -0.8, -1.1, -0.16)
  .C(-1.1, 0.14, -1.0, 0.34, -0.86, 0.46).C(-0.6, 0.42, -0.4, 0.24, -0.24, -0.02).Q(0.0, -0.12, 0.14, -0.02)
  .L(0.24, 0.3).L(0.32, -0.08).zz([[0.44, -0.3], [0.54, -0.12]], 0.08).C(0.62, -0.36, 0.76, -0.46, 0.9, -0.5).Z().s;
const capKnotB = pb().M(-1.02, 0.3).q(-1.1, -0.06, -0.05).arc(0, -0.06, 1.1, 1.08, 180, 360).q(1.02, 0.3, -0.05)
  .zz([[0.78, 0.42], [0.6, 0.4], [0.4, 0.5], [0.16, 0.46], [0, 0.6], [-0.16, 0.46], [-0.4, 0.5], [-0.6, 0.4], [-0.78, 0.42], [-1.02, 0.3]], 0.05).Z().s;
const KNOT_TIE = { d: pb().ell(0, 0, 0.19, 0.065).s, tone: 'cord', at: [0, -1.06, 0] };
// seen from behind the tail of the knot points away: just the knot
const knotB = pb().M(-0.17, -1.02).C(-0.24, -1.18, -0.14, -1.3, 0, -1.3).C(0.14, -1.3, 0.24, -1.18, 0.17, -1.02).Q(0, -0.98, -0.17, -1.02).Z().s;
STYLES.topknot = {
  F: { back: [], front: [{ d: capKnotF, shine: [0, -0.06, 0.8, 204, 258, 3], strands: 'M-0.62 -0.46 Q-0.56 -0.84 -0.16 -1.02 M0.3 -0.58 Q0.36 -0.86 0.12 -1.02 M0.86 -0.2 Q0.8 -0.56 0.62 -0.74', fringe: true },
    { d: tuftF, minor: true, shine: [0, -1.25, 0.2, 225, 250, 1], strands: 'M-0.06 -1.08 L-0.1 -1.5 M0.08 -1.08 L0.1 -1.52' }, KNOT_TIE] },
  S: { back: [], front: [{ d: capKnotS, shine: [-0.1, -0.1, 0.8, 205, 262, 3], strands: 'M0.78 -0.52 Q0.4 -0.9 -0.12 -1.0 M-0.84 0.2 Q-0.9 -0.5 -0.44 -0.94', fringe: true },
    { d: tuftS, minor: true, shine: [0.1, -1.2, 0.14, 230, 260, 1], strands: 'M-0.1 -1.12 Q0.2 -1.22 0.5 -1.3' }, { ...KNOT_TIE, d: pb().ell(0, 0, 0.07, 0.15).s, at: [-0.2, -1.1, -0.4] }] },
  B: { back: [], front: [{ d: capKnotB, shine: SHINE_B, strands: 'M-0.74 0.3 Q-0.8 -0.46 -0.16 -1.0 M0.5 0.42 Q0.6 -0.2 0.12 -1.0' },
    { d: knotB, minor: true, shine: [0, -1.16, 0.12, 225, 250, 1] }, { ...KNOT_TIE, at: [0, -1.04, 0] }] },
};

// mohawk ------------------------------------------------------------------
const crestF = pb().M(-0.26, -0.86).C(-0.34, -1.2, -0.34, -1.5, -0.3, -1.62)
  .zz([[-0.46, -1.74], [-0.2, -1.82], [-0.32, -2.06], [-0.04, -1.96], [0.04, -2.2], [0.2, -1.92], [0.42, -2.0], [0.3, -1.66], [0.46, -1.6]], 0.05)
  .C(0.36, -1.4, 0.34, -1.1, 0.26, -0.86).Q(0, -0.8, -0.26, -0.86).Z().s;
const crestS = pb().M(0.7, -0.72).zz([[0.92, -1.08], [0.56, -1.14], [0.68, -1.66], [0.24, -1.3], [0.22, -1.96], [-0.16, -1.36], [-0.32, -2.0], [-0.56, -1.3], [-0.92, -1.74], [-0.9, -1.1], [-1.28, -1.24], [-1.02, -0.72]], 0.05)
  .C(-0.8, -1.0, 0.3, -1.1, 0.7, -0.72).Z().s;
STYLES.mohawk = {
  F: { back: [], front: [{ d: slickF(1.05, -0.5), tone: 'stubble', noInk: true }, { d: crestF, shine: [0, -1.4, 0.36, 215, 265, 2], strands: 'M-0.1 -0.9 Q-0.14 -1.4 -0.2 -1.8 M0.12 -0.9 Q0.14 -1.5 0.2 -1.9' }] },
  S: { back: [], front: [{ d: slickS(1.06), tone: 'stubble', noInk: true }, { d: crestS, shine: [-0.1, -1.1, 0.7, 225, 280, 3], strands: 'M0.6 -0.84 Q0.4 -1.2 0.3 -1.5 M0.1 -1.0 Q-0.1 -1.4 -0.2 -1.7 M-0.5 -0.96 Q-0.7 -1.3 -0.8 -1.5' }] },
  B: { back: [], front: [{ d: slickB(1.05), tone: 'stubble', noInk: true }, { d: crestF, shine: [0, -1.4, 0.36, 215, 265, 2], strands: 'M-0.1 -0.9 Q-0.14 -1.4 -0.2 -1.8 M0.12 -0.9 Q0.14 -1.5 0.2 -1.9' }] },
};

// bald --------------------------------------------------------------------
STYLES.bald = { F: { back: [], front: [] }, S: { back: [], front: [] }, B: { back: [], front: [] } };

// bun ---------------------------------------------------------------------
const bunBall = pb().ell(0, 0, 0.44, 0.42).s;
const BUN_STRANDS = 'M-0.3 -0.1 Q-0.1 -0.34 0.28 -0.2 M-0.34 0.1 Q0 -0.16 0.34 0.04 M-0.2 0.28 Q0.1 0.12 0.3 0.24';
STYLES.bun = {
  F: { back: [{ d: bunBall, minor: true, at: [0, -1.18, 0], shine: [0, 0, 0.3, 205, 260, 2], strands: BUN_STRANDS }],
    front: [{ d: capPonyF, shine: [0, -0.06, 0.8, 200, 262, 4], strands: 'M0.46 -0.56 Q0.44 -0.84 0.3 -1.0 M0.06 -0.58 Q0.04 -0.86 -0.06 -1.04 M-0.36 -0.58 Q-0.4 -0.8 -0.5 -0.92', fringe: true }] },
  S: { back: [], front: [{ d: capPonyS, shine: SHINE_S, strands: 'M0.74 -0.48 Q0.4 -0.8 -0.2 -0.84 M0.5 -0.42 Q0.2 -0.62 -0.4 -0.66', fringe: true },
    { d: bunBall, minor: true, at: [-0.8, -0.84, 0], shine: [0, 0, 0.3, 205, 260, 2], strands: BUN_STRANDS }] },
  B: { back: [], front: [{ d: capPonyB, shine: SHINE_B, strands: PULLED_B }, { d: pb().ell(0, 0, 0.46, 0.44).s, minor: true, at: [0, -0.56, 0], shine: [0, 0, 0.32, 205, 260, 2], strands: BUN_STRANDS }] },
};

// pompadour ---------------------------------------------------------------
const capPompF = pb().M(-1.0, 0.18).q(-1.06, -0.1, -0.04).C(-1.08, -0.4, -1.02, -0.6, -0.9, -0.72).C(-1.14, -1.2, -0.86, -1.86, -0.1, -1.94)
  .C(0.62, -2.0, 1.12, -1.6, 1.02, -1.08).C(0.98, -0.86, 0.9, -0.76, 0.9, -0.7).C(1.0, -0.6, 1.08, -0.4, 1.06, -0.1).q(1.0, 0.18, -0.04).L(0.93, 0.0)
  .C(0.88, -0.34, 0.66, -0.5, 0.42, -0.5).Q(0.16, -0.46, 0.02, -0.56).Q(-0.16, -0.46, -0.42, -0.5).C(-0.66, -0.5, -0.88, -0.34, -0.93, 0.0).Z().s;
const capPompS = pb().M(0.8, -0.48).Q(1.1, -0.58, 1.34, -0.82).C(1.62, -1.08, 1.42, -1.58, 0.9, -1.64).C(0.36, -1.72, -0.5, -1.5, -0.94, -0.94)
  .C(-1.14, -0.6, -1.14, 0.0, -1.02, 0.3).C(-0.96, 0.44, -0.9, 0.5, -0.82, 0.54).C(-0.56, 0.44, -0.36, 0.22, -0.22, -0.02).Q(0.0, -0.12, 0.14, -0.02)
  .L(0.22, 0.24).L(0.32, -0.1).C(0.44, -0.36, 0.62, -0.46, 0.8, -0.48).Z().s;
const capPompB = pb().M(-1.0, 0.36).q(-1.1, -0.06, -0.05).C(-1.12, -0.6, -1.06, -1.0, -0.84, -1.26).C(-0.56, -1.62, 0.36, -1.7, 0.78, -1.34)
  .C(1.06, -1.08, 1.12, -0.6, 1.1, -0.06).q(1.0, 0.36, -0.05).Q(0.5, 0.6, 0, 0.6).Q(-0.5, 0.6, -1.0, 0.36).Z().s;
STYLES.pompadour = {
  F: { back: [], front: [{ d: capPompF, shine: [0, -1.1, 0.62, 200, 262, 4], shade: 'M-0.84 -0.64 C-0.6 -0.9 0.62 -0.92 0.9 -0.7 C0.6 -0.78 -0.6 -0.78 -0.84 -0.64 Z', strands: 'M-0.6 -0.66 C-0.7 -1.2 -0.3 -1.64 0.2 -1.76 M-0.2 -0.74 C-0.3 -1.1 0 -1.46 0.5 -1.56 M0.3 -0.74 C0.3 -1.0 0.5 -1.16 0.8 -1.24 M-0.8 -0.1 Q-0.84 -0.5 -0.9 -0.7 M0.8 -0.1 Q0.84 -0.5 0.9 -0.7', fringe: true }] },
  S: { back: [], front: [{ d: capPompS, shine: [0.2, -0.8, 0.72, 205, 265, 4], strands: 'M1.28 -0.8 C1.0 -0.9 0.9 -1.1 1.1 -1.3 M0.6 -0.6 C0.4 -1.0 0.2 -1.3 -0.3 -1.3 M0.2 -0.4 C-0.1 -0.7 -0.5 -0.8 -0.8 -0.7', fringe: true }] },
  B: { back: [], front: [{ d: capPompB, shine: [0, -0.5, 0.9, 205, 258, 4], strands: 'M-0.9 0.1 Q-0.84 -0.7 -0.34 -1.2 M0.9 0.1 Q0.84 -0.7 0.34 -1.22 M-0.6 -1.18 Q0 -0.98 0.62 -1.2 M-0.2 0.5 Q-0.3 -0.2 -0.1 -0.9' }] },
};

// Nika (Gear 5): white hair billowing like flame (spiky cap + animated tongues)
STYLES.nika = { F: STYLES.spiky.F, S: STYLES.spiky.S, B: STYLES.spiky.B };
function nikaFlames(v, t) {
  // wavy tongues of white fire rising from the head, flickering (drawn behind the spiky cap)
  const b = pb();
  const n = 7, x0 = v === 'S' ? -1.15 : -1.0, x1 = v === 'S' ? 0.75 : 1.0;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, x = x0 + (x1 - x0) * u;
    const base = -Math.sqrt(Math.max(0, 1.1 * 1.1 - x * x)) * 0.9 + 0.1;
    const h = 0.55 + 0.35 * Math.sin(Math.PI * u) + 0.12 * Math.sin(t * 9 + k * 1.9);
    const lean = (v === 'S' ? -0.35 : (x * 0.25)) + 0.1 * Math.sin(t * 6 + k * 2.3);
    const w = 0.2;
    const tx = x + lean, ty = base - h;
    b.M(x - w, base).C(x - w * 1.1, base - h * 0.45, tx - w * 0.9 + lean * 0.3, ty + h * 0.4, tx, ty)
      .C(tx + w * 0.3, ty + h * 0.3, x + w * 1.2, base - h * 0.5, x + w, base).Z();
  }
  return b.s;
}

// --------------------------------------------------------------- drawing
/** Drawing context for one head: px = head radius in device pixels, sx = -1 when mirrored. */
function headCtx(px, sx, r, v) {
  return { px, lod: px < 7 ? 0 : px < 19 ? 1 : 2, sx, lw: LW / r, lwIn: LW_IN / r, r0: r, view: v };
}
/** Enter head units (origin at the head centre, radius 1) on the caller's transform. */
function begin(g, hy, r, v) {
  g.save();
  const m = g.getTransform();
  const C = headCtx(Math.hypot(m.a, m.b) * r, m.a * m.d - m.b * m.c < 0 ? -1 : 1, r, v);
  g.translate(0, hy);
  g.scale(r, r);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return C;
}
/** Cel fill: shadow tone, then the base nudged toward the light (top-left on screen). */
function cel(g, p, base, shadow, C, off = 0.12) {
  if (C.lod === 0 || !shadow) { g.fillStyle = base; g.fill(p); return; }
  g.fillStyle = shadow; g.fill(p);
  g.save(); g.clip(p); g.translate(-off * C.sx, -off); g.fillStyle = base; g.fill(p); g.restore();
}
function ink(g, p, C, w) { g.lineWidth = w || C.lw; g.strokeStyle = OUTLINE; g.stroke(p); }

/** The shine band of a part, cached on the part for each mirroring. */
function shineOf(pt, sx) {
  const k = sx < 0 ? 'shM' : 'shP';
  return pt[k] || (pt[k] = shinePath(pt.shine, sx));
}
/** The anime "angel ring": short leaves across the upper-left of the hair, aligned with the strands. */
function shinePath(s, sx) {
  let p;
  const [cx, cy, r, a0, a1, n] = s;
  const b = pb();
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const a = (a0 + (a1 - a0) * k) * DEG;
    const len = r * (0.2 + 0.16 * Math.sin(Math.PI * (0.25 + k * 0.5))) * (n <= 2 ? 1.1 : 1);
    const w = r * 0.075;
    const ux = Math.cos(a), uy = Math.sin(a);     // radial (along the strands)
    const x = cx + ux * r, y = cy + uy * r;
    const tx = -uy, ty = ux;                      // across
    b.M(x - ux * len * 0.5, y - uy * len * 0.5).Q(x + tx * w, y + ty * w, x + ux * len * 0.5, y + uy * len * 0.5).Q(x - tx * w, y - ty * w, x - ux * len * 0.5, y - uy * len * 0.5).Z();
  }
  // mirrored profiles: move the band to the screen's upper-left
  p = new Path2D();
  p.addPath(new Path2D(b.s), sx < 0 ? new DOMMatrix([-1, 0, 0, 1, 2 * cx, 0]) : undefined);
  return p;
}

/** Sway of a hanging part (ponytail, long hair): idle drift plus a bounce while walking. */
function swayAngle(sw, H) {
  const [, , amp, spd, lift] = sw;
  let a = amp * Math.sin(H.t * spd + H.seed);
  if (H.moving) a += amp * 1.6 * Math.sin((H.walk || 0) * 1.0) + lift;
  return a;
}
/** Draw hair parts (one layer). H: { pal, t, seed, moving, walk, stubble, swayA? }. */
function drawParts(g, parts, C, H) {
  for (const pt of parts) {
    const p = pt.p || (pt.p = path(pt.d));
    g.save();
    if (pt.at) { g.translate(pt.at[0], pt.at[1]); if (pt.at[2]) g.rotate(pt.at[2]); }
    if (pt.sway) {
      const a = H.swayA ?? swayAngle(pt.sway, H);
      g.translate(pt.sway[0], pt.sway[1]); g.rotate(a); g.translate(-pt.sway[0], -pt.sway[1]);
    }
    const pal = H.pal;
    if (pt.tone === 'tie' || pt.tone === 'cord') {
      g.fillStyle = pt.tone === 'tie' ? TIE : '#f4f1ea'; g.fill(p); ink(g, p, C, C.lw * 0.7);
      g.restore();
      continue;
    }
    const base = pt.tone === 'shadow' ? pal.shadow : pt.tone === 'stubble' ? H.stubble : pal.base;
    const shadow = pt.tone === 'shadow' ? pal.deep : pt.tone === 'stubble' ? null : pal.shadow;
    if (C.lod === 0 || ((pt.tone === 'shadow' || pt.minor) && C.lod < 2) || pt.tone === 'stubble') { g.fillStyle = base; g.fill(p); }
    else {
      g.fillStyle = shadow || base; g.fill(p);
      g.save(); g.clip(p);
      if (shadow) { const o = pt.off ?? 0.13; g.translate(-o * C.sx, -o); g.fillStyle = base; g.fill(p); g.translate(o * C.sx, o); }
      if (pt.shade) { g.fillStyle = pal.shadow; g.fill(path(pt.shade)); }
      if (pt.shine && pt.tone !== 'shadow') { g.fillStyle = pal.light; g.fill(shineOf(pt, C.sx)); }
      if (pt.strands && C.lod === 2) { g.lineWidth = C.lwIn; g.strokeStyle = pt.tone === 'shadow' ? pal.line : pal.shadow; g.stroke(pt.sp || (pt.sp = path(pt.strands))); }
      g.restore();
    }
    if (!pt.noInk) ink(g, p, C);
    g.restore();
  }
}

function viewOf(d) { return d === 'up' ? 'B' : d === 'left' || d === 'right' ? 'S' : 'F'; }

// ----------------------------------------------------------------- hats
// info: cover (clips the hair above y = clip), and the drawing per view.
// Every hat is drawn in head units; k scales it up for big hair.
const HAT_COVER = {
  straw: -0.74, captain: -0.8, tricorne: -0.74, cowboy: -0.74, marine: -0.62, pinkhat: -0.68, tophat: -0.68, topHat: -0.68,
  beanie: -0.5, bandana: -0.46, cap: -0.6,
};
function hatKind(hat, look) {
  if (!hat) return null;
  if (hat === 'horns' && !(look && look.hatColor)) return 'helm';
  if (HATS[hat]) return hat;
  return 'cap';
}
const hatKy = (k) => 1 + (k - 1) * 0.5;
function hatClip(kind) {
  if (!kind) return null;
  if (kind === 'helm') return -0.5;
  return HAT_COVER[kind] ?? null;
}

const pp = path;
function part(g, C, d, base, shadow, off = 0.1, w, minor) {
  const p = pp(d);
  cel(g, p, base, minor && C.lod < 2 ? null : shadow, C, off);
  ink(g, p, C, w);
  return p;
}
function line(g, C, d, col, w) { g.lineWidth = (w || LW_IN) / C.r0; g.strokeStyle = col; g.stroke(pp(d)); }

// Colours matched to the item icons (src/render/icons.js).
const STRAW = '#f0cd62', STRAW_D = '#c9a23f', BAND_RED = '#c8372d', GOLD = '#e0b24a';
const MEMO = new Map();
/** Path data built once per key (parametrised shapes). */
function memo(key, fn) {
  let d = MEMO.get(key);
  if (d === undefined) { d = fn(); MEMO.set(key, d); }
  return d;
}

const HAT_STRAW = {
  brimF: pb().ell(0, -0.74, 1.62, 0.37).s,
  crownF: pb().M(-0.9, -0.74).C(-0.96, -1.16, -0.64, -1.5, 0, -1.5).C(0.64, -1.5, 0.96, -1.16, 0.9, -0.74).arc(0, -0.74, 0.9, 0.2, 0, 180).Z().s,
  bandF: 'M-1 -0.98 Q0 -0.86 1 -0.98 L1 -0.4 L-1 -0.4 Z',
  bandLine: 'M-1 -0.98 Q0 -0.86 1 -0.98',
  bandShade: 'M-1 -0.4 L1 -0.4 L1 0 L-1 0 Z',
  weaveF: 'M-1.22 -0.56 Q0 -0.3 1.22 -0.56 M-1.44 -0.66 Q0 -0.3 1.44 -0.66',
  brimS: pb().ell(-0.04, -0.76, 1.6, 0.16).s,
  crownS: pb().M(-0.84, -0.76).C(-0.9, -1.2, -0.56, -1.5, 0, -1.5).C(0.56, -1.5, 0.9, -1.2, 0.84, -0.76).arc(0, -0.76, 0.84, 0.1, 0, 180).Z().s,
};
const CAPTAIN = {
  plumeS: 'M-0.46 -1.36 C-1.0 -2.02 -1.62 -2.12 -2.02 -1.96 C-1.72 -1.62 -1.12 -1.3 -0.7 -1.14 Z',
  plumeF: 'M0.52 -1.34 C0.9 -2.02 1.5 -2.26 1.96 -2.1 C1.72 -1.74 1.2 -1.36 0.74 -1.12 Z',
  crownS: 'M-0.8 -0.8 C-0.86 -1.44 -0.48 -1.84 0 -1.84 C0.48 -1.84 0.86 -1.44 0.8 -0.8 Z',
  crownF: 'M-0.86 -0.8 C-0.9 -1.46 -0.5 -1.86 0 -1.86 C0.5 -1.86 0.9 -1.46 0.86 -0.8 Z',
  brimS: 'M-1.72 -1.02 Q-1.5 -0.7 -0.2 -0.68 Q1.3 -0.7 1.62 -0.98 Q1.3 -0.84 -0.1 -0.84 Q-1.4 -0.86 -1.72 -1.02 Z',
  brimF: 'M-1.74 -1.04 Q-1.52 -0.46 0 -0.44 Q1.52 -0.46 1.74 -1.04 Q1.32 -0.8 0 -0.84 Q-1.32 -0.8 -1.74 -1.04 Z',
  trimS: 'M-1.72 -1.02 Q-1.5 -0.7 -0.2 -0.68 Q1.3 -0.7 1.62 -0.98',
  trimF: 'M-1.74 -1.04 Q-1.52 -0.46 0 -0.44 Q1.52 -0.46 1.74 -1.04',
};
const HATS = {
  straw(g, C, v, H) {
    const s = HAT_STRAW;
    const brim = v === 'S' ? s.brimS : s.brimF, crown = v === 'S' ? s.crownS : s.crownF;
    const bp = part(g, C, brim, STRAW, STRAW_D, 0.12);
    if (C.lod === 2) { g.save(); g.clip(bp); line(g, C, s.weaveF, 'rgba(150,110,40,0.55)'); g.restore(); }
    const cp = part(g, C, crown, '#f5d777', STRAW_D, 0.14);
    g.save(); g.clip(cp);
    g.fillStyle = BAND_RED; g.fill(pp(s.bandF));
    if (C.lod) { g.fillStyle = '#8f231c'; g.translate(0.1 * C.sx, 0.06); g.fill(pp(s.bandShade)); }
    g.restore();
    ink(g, pp(s.bandLine), C, C.lw * 0.6);
    ink(g, cp, C);
  },
  captain(g, C, v, H) {
    const k = hatPal(H.hatColor || '#2c2831'), side = v === 'S', c = CAPTAIN;
    part(g, C, side ? c.plumeS : v === 'B' ? mirrorD(c.plumeF) : c.plumeF, '#c8372d', '#8f231c', 0.1, 0, true);
    part(g, C, side ? c.crownS : c.crownF, k.base, k.dk, 0.14);
    const bp = part(g, C, side ? c.brimS : c.brimF, k.base, k.dk, 0.1, 0, true);
    g.save(); g.clip(bp); g.lineWidth = 0.1; g.strokeStyle = GOLD; g.stroke(pp(side ? c.trimS : c.trimF)); g.restore();
    ink(g, bp, C);
    if (v === 'F') skull(g, C);
  },
  tricorne(g, C, v, H) {
    const k = hatPal(H.hatColor || '#302b35');
    if (v === 'S') {
      part(g, C, 'M-0.72 -0.84 C-0.62 -1.5 0.5 -1.62 0.72 -0.84 Z', k.base, k.dk, 0.14, 0, true);
      const bp = part(g, C, 'M1.28 -0.72 C0.8 -0.76 0.42 -1.2 0.0 -1.26 C-0.52 -1.3 -0.92 -0.9 -1.4 -0.6 C-0.9 -0.5 0.42 -0.48 1.28 -0.72 Z', k.base, k.dk, 0.1);
      g.save(); g.clip(bp); g.lineWidth = 0.12; g.strokeStyle = GOLD; g.stroke(pp('M1.28 -0.72 C0.8 -0.76 0.42 -1.2 0.0 -1.26 C-0.52 -1.3 -0.92 -0.9 -1.4 -0.6')); g.restore();
      ink(g, bp, C);
      return;
    }
    part(g, C, 'M-0.76 -0.9 C-0.72 -1.46 -0.36 -1.64 0 -1.64 C0.36 -1.64 0.72 -1.46 0.76 -0.9 Z', k.base, k.dk, 0.14, 0, true);
    const brim = 'M-1.56 -0.8 C-1.26 -0.72 -0.92 -1.06 -0.52 -1.2 C-0.26 -1.28 0.26 -1.28 0.52 -1.2 C0.92 -1.06 1.26 -0.72 1.56 -0.8 C1.2 -0.52 0.6 -0.5 0 -0.3 C-0.6 -0.5 -1.2 -0.52 -1.56 -0.8 Z';
    const bp = part(g, C, brim, k.base, k.dk, 0.1);
    g.save(); g.clip(bp); g.lineWidth = 0.12; g.strokeStyle = GOLD; g.stroke(pp('M-1.56 -0.8 C-1.26 -0.72 -0.92 -1.06 -0.52 -1.2 C-0.26 -1.28 0.26 -1.28 0.52 -1.2 C0.92 -1.06 1.26 -0.72 1.56 -0.8')); g.restore();
    ink(g, bp, C);
    if (v === 'F') { const b = EL(0, -0.5, 0.1, 0.1); g.fillStyle = GOLD; g.fill(b); ink(g, b, C, C.lw * 0.6); }
  },
  cowboy(g, C, v, H) {
    const k = hatPal(H.hatColor || '#9a6a3f'), side = v === 'S';
    const crown = side ? 'M-0.74 -0.78 C-0.82 -1.36 -0.5 -1.72 0 -1.68 C0.36 -1.66 0.56 -1.58 0.72 -1.42 C0.8 -1.2 0.78 -0.96 0.74 -0.78 Z'
      : 'M-0.8 -0.74 C-0.86 -1.26 -0.7 -1.72 -0.35 -1.72 C-0.15 -1.72 -0.1 -1.58 0 -1.58 C0.1 -1.58 0.15 -1.72 0.35 -1.72 C0.7 -1.72 0.86 -1.26 0.8 -0.74 Z';
    const cp = part(g, C, crown, k.base, k.dk, 0.14);
    g.save(); g.clip(cp); g.fillStyle = k.band; g.fill(pp('M-1 -1.0 Q0 -0.9 1 -1.0 L1 -0.5 L-1 -0.5 Z')); g.restore();
    ink(g, cp, C);
    if (C.lod === 2 && !side) line(g, C, 'M0 -1.56 Q-0.04 -1.3 0.02 -1.06', k.dk);
    const brim = side ? 'M-1.62 -0.94 Q-1.3 -0.66 0 -0.66 Q1.3 -0.66 1.64 -0.88 Q1.36 -0.8 0 -0.84 Q-1.2 -0.82 -1.62 -0.94 Z'
      : 'M-1.8 -1.04 C-1.62 -0.72 -1.1 -0.62 -0.8 -0.7 C-0.4 -0.8 0.4 -0.8 0.8 -0.7 C1.1 -0.62 1.62 -0.72 1.8 -1.04 C1.82 -0.6 1.2 -0.34 0 -0.36 C-1.2 -0.34 -1.82 -0.6 -1.8 -1.04 Z';
    part(g, C, brim, k.mid, k.dk, 0.1);
  },
  marine(g, C, v, H) {
    const white = '#f6f5f0', shadow = '#c9cfdc', navy = '#27466e';
    if (v !== 'F') {
      const flap = v === 'S' ? 'M-0.6 -0.56 L-1.14 -0.5 C-1.2 -0.1 -1.18 0.2 -1.12 0.46 L-0.7 0.42 C-0.66 0.1 -0.62 -0.2 -0.6 -0.56 Z'
        : 'M-1.08 -0.5 L1.08 -0.5 C1.1 -0.14 1.1 0.14 1.04 0.4 Q0.78 0.54 0.52 0.46 Q0.26 0.56 0 0.48 Q-0.26 0.56 -0.52 0.46 Q-0.78 0.54 -1.04 0.4 C-1.1 0.14 -1.1 -0.14 -1.08 -0.5 Z';
      const fp = part(g, C, flap, white, shadow, 0.1);
      if (C.lod === 2) { g.save(); g.clip(fp); line(g, C, v === 'S' ? 'M-0.9 -0.4 L-0.92 0.4' : 'M-0.52 -0.4 L-0.52 0.44 M0 -0.4 L0 0.46 M0.52 -0.4 L0.52 0.44', shadow); g.restore(); }
    }
    part(g, C, 'M-1.1 -0.62 C-1.16 -1.1 -0.8 -1.42 0 -1.42 C0.8 -1.42 1.16 -1.1 1.1 -0.62 Z', white, shadow, 0.14);
    part(g, C, 'M-1.12 -0.66 Q0 -0.76 1.12 -0.66 L1.1 -0.44 Q0 -0.54 -1.1 -0.44 Z', navy, '#1b3354', 0.06, 0, true);
    if (v === 'F') {
      part(g, C, 'M-0.74 -0.46 Q0 -0.56 0.74 -0.46 Q0.5 -0.24 0 -0.22 Q-0.5 -0.24 -0.74 -0.46 Z', '#1d1a20', null);
      if (C.lod) { g.lineWidth = 0.07; g.strokeStyle = '#2f5f96'; g.stroke(pp('M-0.26 -1.04 Q-0.13 -1.16 0 -1.02 Q0.13 -1.16 0.26 -1.04')); }
    } else if (v === 'S') {
      part(g, C, 'M0.7 -0.5 Q1.1 -0.52 1.3 -0.4 Q1.0 -0.34 0.66 -0.4 Z', '#1d1a20', null);
    }
  },
  pinkhat(g, C, v, H) { topHat(g, C, v, H.hatColor || '#f190b7', v === 'F'); },
  tophat(g, C, v, H) { topHat(g, C, v, H.hatColor || '#2b2631', false); },
  topHat(g, C, v, H) { topHat(g, C, v, H.hatColor || '#2b2631', false); },
  beanie(g, C, v, H) {
    const k = hatPal(H.hatColor || '#e74c3c');
    const dome = v === 'S' ? 'M-1.12 -0.4 C-1.2 -1.0 -0.72 -1.36 0 -1.34 C0.62 -1.32 1.02 -0.96 1.0 -0.46 Z' : 'M-1.12 -0.44 C-1.18 -1.0 -0.75 -1.36 0 -1.36 C0.75 -1.36 1.18 -1.0 1.12 -0.44 Z';
    part(g, C, dome, k.base, k.dk, 0.14);
    const fold = v === 'S' ? 'M-1.16 -0.62 Q-0.1 -0.76 1.04 -0.64 L1.02 -0.38 Q-0.1 -0.5 -1.14 -0.36 Z' : 'M-1.16 -0.62 Q0 -0.74 1.16 -0.62 L1.14 -0.36 Q0 -0.46 -1.14 -0.36 Z';
    const fp = part(g, C, fold, k.mid, k.dk, 0.06, 0, true);
    if (C.lod === 2) { g.save(); g.clip(fp); line(g, C, 'M-0.8 -0.7 L-0.8 -0.36 M-0.4 -0.72 L-0.4 -0.38 M0 -0.74 L0 -0.4 M0.4 -0.72 L0.4 -0.38 M0.8 -0.7 L0.8 -0.36', k.dk); g.restore(); }
    if ((H.seed || 0) % 3 !== 0) part(g, C, EL(v === 'S' ? -0.06 : 0, -1.44, 0.26, 0.24), k.lt2, k.lt, 0.08, 0, true);
  },
  bandana(g, C, v, H) {
    const k = hatPal(H.hatColor || '#2f5f96');
    if (v === 'S') {
      tails(g, C, H, -1.08, -0.36, k, 1);
      const cp = part(g, C, 'M0.98 -0.36 C1.04 -0.92 0.62 -1.24 0.04 -1.26 C-0.62 -1.26 -1.16 -0.9 -1.16 -0.24 Q-0.1 -0.42 0.98 -0.36 Z', k.base, k.dk, 0.14);
      if (!H.hatColor && C.lod) { g.save(); g.clip(cp); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(pp(dots())); g.restore(); ink(g, cp, C); }
      part(g, C, EL(-1.1, -0.36, 0.16, 0.14), k.dk, null);
      return;
    }
    const cp = part(g, C, 'M-1.14 -0.26 C-1.2 -0.9 -0.8 -1.28 0 -1.28 C0.8 -1.28 1.2 -0.9 1.14 -0.26 Q0 -0.52 -1.14 -0.26 Z', k.base, k.dk, 0.14);
    if (!H.hatColor && C.lod) { g.save(); g.clip(cp); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(pp(dots())); g.restore(); ink(g, cp, C); }
    part(g, C, 'M-1.14 -0.26 Q0 -0.52 1.14 -0.26 L1.16 -0.42 Q0 -0.68 -1.16 -0.42 Z', k.dk, null);
    if (v === 'B') { tails(g, C, H, 0, -0.36, k, 0); part(g, C, EL(0, -0.38, 0.17, 0.14), k.dk, null); }
  },
  headband(g, C, v, H) {
    const k = hatPal(H.hatColor || '#2e2a31'), w = H.w;
    if (v === 'S') {
      tails(g, C, H, -w + 0.02, -0.52, k, 1);
      part(g, C, memo('hbS' + w, () => `M1.0 -0.66 Q-0.1 -0.72 ${-w} -0.64 L${-w + 0.02} -0.4 Q-0.1 -0.48 0.98 -0.42 Z`), k.base, k.dk, 0.05);
      part(g, C, EL(-w + 0.04, -0.52, 0.14, 0.13), k.lt, k.dk, 0.04, 0, true);
      return;
    }
    part(g, C, memo('hbF' + w, () => `M${-w} -0.64 Q0 -0.8 ${w} -0.64 L${w - 0.01} -0.4 Q0 -0.56 ${-w + 0.01} -0.4 Z`), k.base, k.dk, 0.05);
    if (v === 'B') { tails(g, C, H, 0, -0.5, k, 0); part(g, C, EL(0, -0.52, 0.15, 0.13), k.lt, k.dk, 0.04, 0, true); }
  },
  goggles(g, C, v, H) {
    const lens = H.hatColor || '#f0a53a', lk = hatPal(lens), frame = '#c9a04a', strap = '#6b4a32', w = H.w;
    if (v === 'S') {
      part(g, C, memo('ggS' + w, () => `M0.9 -0.7 Q-0.1 -0.78 ${-w} -0.66 L${-w + 0.02} -0.5 Q-0.1 -0.6 0.9 -0.54 Z`), strap, '#4a3222', 0.04, 0, true);
      part(g, C, EL(0.8, -0.62, 0.15, 0.28), frame, '#9b7a30', 0.05, 0, true);
      part(g, C, EL(0.84, -0.62, 0.08, 0.19), lk.base, lk.dk, 0.04, 0, true);
      return;
    }
    part(g, C, memo('ggF' + w, () => `M${-w} -0.74 Q0 -0.9 ${w} -0.74 L${w - 0.01} -0.56 Q0 -0.72 ${-w + 0.01} -0.56 Z`), strap, '#4a3222', 0.04, 0, true);
    if (v === 'B') { part(g, C, 'M-0.14 -0.8 L0.14 -0.8 L0.14 -0.56 L-0.14 -0.56 Z', frame, '#9b7a30', 0.03, 0, true); return; }
    part(g, C, EL(-0.37, -0.66, 0.28, 0.26, 0.37, -0.66, 0.28, 0.26), frame, '#9b7a30', 0.05, 0, true);
    part(g, C, EL(-0.37, -0.66, 0.19, 0.17, 0.37, -0.66, 0.19, 0.17), lk.base, lk.dk, 0.06, 0, true);
    if (C.lod) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(EL(-0.44, -0.73, 0.06, 0.04, 0.3, -0.73, 0.06, 0.04)); }
    g.lineWidth = 0.08; g.strokeStyle = frame; g.stroke(pp('M-0.1 -0.68 Q0 -0.74 0.1 -0.68'));
  },
  horns(g, C, v, H) { horns(g, C, v, H.hatColor || '#efe4c8'); },
  helm(g, C, v, H) {
    const metal = '#aab5bd', mdk = '#6f7c86', trim = '#8a6a44';
    horns(g, C, v, '#efe4c8', true);
    const dome = v === 'S' ? 'M-1.12 -0.38 C-1.18 -1.0 -0.74 -1.36 0 -1.36 C0.7 -1.36 1.08 -1.0 1.02 -0.46 Z' : 'M-1.14 -0.4 C-1.18 -1.0 -0.76 -1.38 0 -1.38 C0.76 -1.38 1.18 -1.0 1.14 -0.4 Z';
    const dp = part(g, C, dome, metal, mdk, 0.14);
    if (v !== 'S') { g.save(); g.clip(dp); g.fillStyle = trim; g.fill(pp('M-0.1 -1.5 L0.1 -1.5 L0.1 -0.4 L-0.1 -0.4 Z')); g.restore(); ink(g, dp, C); }
    part(g, C, v === 'S' ? 'M-1.16 -0.56 Q-0.1 -0.68 1.04 -0.6 L1.02 -0.38 Q-0.1 -0.46 -1.14 -0.34 Z' : 'M-1.16 -0.58 Q0 -0.7 1.16 -0.58 L1.14 -0.38 Q0 -0.5 -1.14 -0.38 Z', trim, '#5e4630', 0.05, 0, true);
  },
  crown(g, C, v, H) {
    const k = hatPal(H.hatColor || '#ffd54f');
    const by = H.top + 0.34, w = v === 'S' ? 0.56 : 0.62;
    part(g, C, memo('cr' + by + w, () => `M${-w} ${by} L${-w - 0.1} ${by - 0.62} L${-w * 0.55} ${by - 0.3} L0 ${by - 0.74} L${w * 0.55} ${by - 0.3} L${w + 0.1} ${by - 0.62} L${w} ${by} Q0 ${by + 0.12} ${-w} ${by} Z`), k.base, k.dk, 0.08);
    if (C.lod) {
      g.fillStyle = '#e53935'; g.fill(EL(0, by - 0.1, 0.09, 0.08));
      g.fillStyle = '#42a5f5'; g.fill(EL(-w * 0.62, by - 0.08, 0.06, 0.06, w * 0.62, by - 0.08, 0.06, 0.06));
    }
  },
  halo(g, C, v, H) {
    const col = H.hatColor || '#ffe082', side = v === 'S';
    g.save(); g.translate(0, H.top - 0.36 + (H.haloY ?? Math.sin(H.t * 2.2) * 0.04));
    const e = EL(0, 0, side ? 0.56 : 0.74, side ? 0.13 : 0.2);
    g.lineWidth = 0.22; g.strokeStyle = OUTLINE; g.stroke(e);
    g.lineWidth = 0.13; g.strokeStyle = col; g.stroke(e);
    if (C.lod) { g.lineWidth = 0.04; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke(pp('M-0.5 -0.12 Q-0.2 -0.2 0.2 -0.2')); }
    g.restore();
  },
  bubble(g, C, v, H) {
    const R = 1.72 * H.hatK, cy = -0.2 - (H.hatK - 1) * 0.6;
    const b = EL(0, cy, R, R);
    g.fillStyle = 'rgba(200,235,255,0.2)'; g.fill(b);
    g.lineWidth = 0.08; g.strokeStyle = 'rgba(225,245,255,0.85)'; g.stroke(b);
    if (C.lod) {
      g.lineWidth = 0.1; g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.stroke(pp(memo('bb' + R, () => pb().M(-R * 0.72, cy - R * 0.34).Q(-R * 0.62, cy - R * 0.72, -R * 0.2, cy - R * 0.86).s)));
      g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(EL(R * 0.5, cy - R * 0.5, 0.1, 0.07));
    }
  },
  antlers(g, C, v, H) {
    const d = v === 'S' ? 'M0.1 -0.9 L-0.2 -1.7 M-0.08 -1.36 L-0.5 -1.5 M-0.14 -1.56 L0.1 -1.96'
      : 'M-0.45 -0.9 L-1.0 -1.8 M-0.74 -1.36 L-1.3 -1.34 M-0.92 -1.66 L-0.76 -2.08 M0.45 -0.9 L1.0 -1.8 M0.74 -1.36 L1.3 -1.34 M0.92 -1.66 L0.76 -2.08';
    const p = pp(d);
    g.lineWidth = 0.34; g.strokeStyle = OUTLINE; g.stroke(p);
    g.lineWidth = 0.22; g.strokeStyle = H.hatColor || '#8d6e63'; g.stroke(p);
  },
  cap(g, C, v, H) {
    const k = hatPal(H.hatColor || '#5d6d7e');
    part(g, C, v === 'S' ? 'M-1.12 -0.5 C-1.16 -1.06 -0.7 -1.32 0 -1.32 C0.66 -1.32 1.02 -1.0 1.0 -0.54 Z' : 'M-1.12 -0.54 C-1.16 -1.06 -0.76 -1.34 0 -1.34 C0.76 -1.34 1.16 -1.06 1.12 -0.54 Z', k.base, k.dk, 0.14);
    if (v === 'S') part(g, C, 'M0.8 -0.6 Q1.3 -0.62 1.5 -0.48 Q1.1 -0.4 0.76 -0.46 Z', k.dk, null);
    else if (v === 'F') part(g, C, 'M-0.86 -0.56 Q0 -0.66 0.86 -0.56 Q0.6 -0.3 0 -0.28 Q-0.6 -0.3 -0.86 -0.56 Z', k.dk, null);
  },
};
/** Hats that sit behind the head in the front view (knot tails). */
const HAT_BEHIND = {
  bandana(g, C, v, H) { if (v === 'F') tails(g, C, H, 0.92, -0.42, hatPal(H.hatColor || '#2f5f96'), 1); },
  headband(g, C, v, H) { if (v === 'F') tails(g, C, H, H.w - 0.1, -0.52, hatPal(H.hatColor || '#2e2a31'), 1); },
};
const TAILS = {
  side: ['M0 0 Q0.34 0.1 0.6 0.46 L0.44 0.44 L0.52 0.66 Q0.18 0.3 0 0.12 Z', 'M0 0.04 Q0.22 0.3 0.28 0.7 L0.16 0.62 L0.14 0.8 Q0.06 0.4 -0.04 0.14 Z'],
  down: ['M-0.04 0 Q-0.28 0.3 -0.24 0.68 L-0.1 0.6 L-0.04 0.76 Q0.06 0.3 0.06 0 Z', 'M0.02 0 Q0.3 0.34 0.28 0.66 L0.14 0.6 L0.1 0.76 Q0.04 0.3 -0.04 0.02 Z'],
};
function tailAngle(H) { return Math.sin(H.t * 3.1 + H.seed) * 0.08 + (H.moving ? 0.1 * Math.sin((H.walk || 0) * 2) - 0.12 : 0); }
function tails(g, C, H, x, y, k, dir) {
  // two cloth tails from a knot, fluttering (and streaming back while running)
  const f = H.tailA ?? tailAngle(H);
  g.save(); g.translate(x, y);
  if (dir && C.view === 'S') g.scale(-1, 1);
  g.rotate(dir ? 0.32 + f : f);
  const T = dir ? TAILS.side : TAILS.down;
  part(g, C, T[0], k.base, k.dk, 0.05, 0, true);
  part(g, C, T[1], k.mid, k.dk, 0.05, 0, true);
  g.restore();
}
let DOTS = null;
function dots() {
  if (!DOTS) { const b = pb(); for (const [x, y] of [[-0.5, -1.0], [0, -1.12], [0.5, -1.0], [-0.8, -0.66], [-0.28, -0.76], [0.28, -0.76], [0.8, -0.66], [0, -0.46]]) b.ell(x, y, 0.07, 0.06); DOTS = b.s; }
  return DOTS;
}
function skull(g, C) {
  g.fillStyle = '#f4f1ea';
  g.fill(EL(0, -1.3, 0.24, 0.216, 0, -1.132, 0.132, 0.096));
  if (C.lod) { g.fillStyle = '#1d1a20'; g.fill(EL(-0.086, -1.3, 0.053, 0.058, 0.086, -1.3, 0.053, 0.058)); }
}
function topHat(g, C, v, col, cross) {
  const k = hatPal(col), side = v === 'S';
  const sy = side ? 0.12 : 0.26;
  part(g, C, EL(0, -0.68, side ? 1.2 : 1.28, sy), k.mid, k.dk, 0.08, 0, true);
  const crown = memo('th' + sy, () => pb().M(-0.82, -0.68).C(-0.86, -1.2, -0.84, -1.7, -0.72, -2.0).C(-0.3, -2.1, 0.3, -2.1, 0.72, -2.0).C(0.84, -1.7, 0.86, -1.2, 0.82, -0.68)
    .arc(0, -0.68, 0.82, sy * 0.66, 0, 180).Z().s);
  const cp = part(g, C, crown, k.base, k.dk, 0.14);
  g.save(); g.clip(cp); g.fillStyle = k.dk; g.fill(pp('M-1 -1.0 Q0 -0.9 1 -1.0 L1 -0.4 L-1 -0.4 Z')); g.restore();
  ink(g, cp, C);
  part(g, C, EL(0, -2.0, 0.72, 0.14), k.lt, null);
  if (cross) {
    const x = pp('M-0.3 -1.66 L0.3 -1.18 M0.3 -1.66 L-0.3 -1.18');
    g.lineWidth = 0.22; g.strokeStyle = OUTLINE; g.stroke(x);
    g.lineWidth = 0.14; g.strokeStyle = '#ffffff'; g.stroke(x);
  }
}
const HORN = {
  helm: 'M-0.84 -0.72 C-1.3 -0.9 -1.5 -1.3 -1.36 -1.86 C-1.12 -1.5 -0.9 -1.3 -0.56 -1.1 Z',
  wild: 'M-0.5 -0.86 C-0.78 -1.12 -1.06 -1.5 -0.98 -1.96 C-0.8 -1.62 -0.54 -1.38 -0.2 -1.06 Z',
  helmS: 'M0.2 -1.0 C0.0 -1.4 -0.2 -1.7 -0.66 -1.9 C-0.46 -1.5 -0.3 -1.22 -0.2 -0.96 Z',
  wildS: 'M0.3 -0.94 C0.2 -1.36 -0.02 -1.66 -0.4 -1.9 C-0.3 -1.5 -0.14 -1.2 -0.06 -0.92 Z',
  rings: 'M-0.62 -1.18 L-0.38 -1.24 M-0.8 -1.5 L-0.62 -1.54 M0.62 -1.18 L0.38 -1.24 M0.8 -1.5 L0.62 -1.54',
};
function horns(g, C, v, col, helm) {
  const k = hatPal(col);
  if (v === 'S') { part(g, C, helm ? HORN.helmS : HORN.wildS, k.base, k.dk, 0.08); return; }
  const L = helm ? HORN.helm : HORN.wild;
  part(g, C, L, k.base, k.dk, 0.08);
  part(g, C, mirrorD(L), k.base, k.dk, 0.08);
  if (C.lod === 2 && !helm) line(g, C, HORN.rings, k.dk);
}

// ------------------------------------------------------------------ faces
// Eyes are drawn for the viewer's RIGHT eye around (0, 0); the left eye is
// the same path mirrored. Catch-lights are placed separately so both sit on
// the upper-left (the light).
const EYE = {
  white: 'M-0.18 -0.01 C-0.16 -0.25 0.13 -0.27 0.19 -0.07 C0.22 0.12 0.12 0.26 0 0.26 C-0.12 0.26 -0.19 0.14 -0.18 -0.01 Z',
  lash: 'M-0.22 0.03 C-0.2 -0.3 0.16 -0.34 0.23 -0.08 L0.3 -0.12 L0.22 0.01 C0.14 -0.2 -0.13 -0.21 -0.2 0.05 Z',
  lower: 'M0.02 0.26 Q0.14 0.24 0.19 0.12',
  fWhite: 'M-0.19 0.06 L0.2 -0.12 C0.22 0.1 0.12 0.24 0 0.24 C-0.12 0.24 -0.19 0.16 -0.19 0.06 Z',
  fLash: 'M-0.23 0.03 L0.22 -0.2 L0.3 -0.2 L0.21 -0.09 L-0.19 0.1 Z',
  blink: 'M-0.2 0.06 Q0 0.2 0.21 0.03 L0.27 0',
  hurt: 'M0.18 -0.12 L-0.12 0.06 L0.18 0.24',
  // fish-man: round, bulging, small pupils
  fishWhite: pb().ell(0, 0.06, 0.2, 0.21).s,
  fishLash: 'M-0.22 0.02 C-0.2 -0.22 0.2 -0.24 0.23 0.0 L0.18 0.02 C0.14 -0.16 -0.14 -0.16 -0.18 0.04 Z',
};
const EYE_S = {
  white: 'M-0.1 -0.02 C-0.08 -0.24 0.08 -0.26 0.12 -0.08 C0.15 0.1 0.1 0.24 0.02 0.25 C-0.07 0.25 -0.11 0.14 -0.1 -0.02 Z',
  lash: 'M0.14 -0.06 C0.1 -0.31 -0.1 -0.31 -0.12 -0.02 L-0.19 -0.07 L-0.12 0.05 C-0.08 -0.2 0.08 -0.21 0.14 -0.06 Z',
  fWhite: 'M-0.1 -0.14 L0.13 0.0 C0.15 0.12 0.1 0.24 0.02 0.24 C-0.07 0.24 -0.11 0.12 -0.1 -0.14 Z',
  fLash: 'M-0.12 -0.2 L0.16 -0.04 L0.12 0.03 L-0.1 -0.1 L-0.19 -0.12 Z',
  blink: 'M-0.18 0.02 L-0.12 0.06 Q0 0.16 0.13 0.06',
  hurt: 'M-0.08 -0.12 L0.12 0.06 L-0.08 0.22',
  fishWhite: pb().ell(0.01, 0.06, 0.12, 0.2).s,
  fishLash: 'M-0.13 0.02 C-0.12 -0.2 0.12 -0.2 0.14 0.0 L0.1 0.02 C0.08 -0.14 -0.08 -0.14 -0.1 0.04 Z',
};
let SPIRAL = null;
function spiral() {
  if (!SPIRAL) {
    const b = pb();
    for (let i = 0; i <= 26; i++) { const a = i * 0.62, rr = 0.02 + i * 0.0075; const x = Math.cos(a) * rr, y = 0.06 + Math.sin(a) * rr * 1.1; if (i) b.L(x, y); else b.M(x, y); }
    SPIRAL = b.s;
  }
  return SPIRAL;
}

function expression(look, pose, P, t) {
  const st = pose && pose.state;
  if (st === 'knocked' || st === 'dead') return { eyes: 'ko', mouth: 'ko', brow: 'worried' };
  if (st === 'hurt') return { eyes: 'hurt', mouth: 'grimace', brow: 'worried' };
  const face = P && P.face;
  const fierce = face === 'fierce' || face === 'shout';
  const s = (((look.seed || 0) * 0.6180339) % 1) * 0.9 + 0.1;
  // blink ~every 3.4 s for ~0.12 s; never at t = 1 (the still portraits)
  const blink = pose && typeof pose.blink === 'boolean' ? pose.blink : !fierce && ((t * 0.29 + s - 0.29) % 1 + 1) % 1 < 0.035;
  return {
    eyes: blink ? 'blink' : fierce ? 'fierce' : 'open',
    mouth: face === 'shout' ? 'shout' : fierce ? 'fierce' : look.grin || look.nika ? 'grin' : 'neutral',
    brow: fierce ? 'fierce' : 'neutral',
    small: face === 'shout',
  };
}
const EYE_SHAPES = ['round', 'round', 'sharp', 'soft'];
function eyeShapeOf(look) {
  if (look.eyeShape) return look.eyeShape;
  if (look.race === 'fishman') return 'fish';
  if (look.race === 'mink') return 'round';
  return EYE_SHAPES[(look.seed || 0) % 4];
}

const EYEPAL = new Map();
function eyePal(iris, white) {
  const key = iris + (white ? 'w' : '');
  let p = EYEPAL.get(key);
  if (!p) {
    p = white ? { iris: '#ff1744', lt: mixHex('#ff1744', '#ffffff', 0.55), pupil: '#ff8a80' }
      : { iris, lt: mixHex(iris, '#ffffff', 0.38), pupil: mixHex(iris, '#000000', 0.7) };
    EYEPAL.set(key, p);
  }
  return p;
}
const SCAR = { F: 'M-0.52 -0.12 L-0.3 0.5', Fx: 'M-0.52 0.02 L-0.38 -0.02 M-0.46 0.24 L-0.32 0.2', S: 'M0.54 -0.12 L0.76 0.5', Sx: 'M0.54 0.02 L0.68 -0.02 M0.6 0.24 L0.74 0.2' };

/** Both eyes (front) or one (profile). The iris needs no clip: the lash covers what pokes above the lid. */
function drawEyes(g, C, v, look, X) {
  const shape = eyeShapeOf(look);
  const ep = eyePal(hex(look.eyeColor, '#2d2226'), look.furWhite);
  const side = v === 'S';
  const E = side ? EYE_S : EYE;
  const ey = 0.17;
  const closed = X.eyes === 'blink' || X.eyes === 'hurt' || X.eyes === 'ko';
  const fierce = X.eyes === 'fierce';
  const fish = shape === 'fish' && !fierce;
  for (let n = side ? 1 : 0; n < 2; n++) {
    const x = side ? 0.66 : n ? 0.39 : -0.39;
    g.save();
    g.translate(x, ey);
    const flip = !side && x < 0 ? -1 : 1;
    if (flip < 0) g.scale(-1, 1);
    if (shape === 'sharp') { g.rotate(-0.12); g.scale(1.06, 0.8); }
    else if (shape === 'soft') { g.rotate(0.1); g.scale(1, 0.92); }
    if (closed) {
      g.lineWidth = X.eyes === 'ko' ? 0.045 : 0.075; g.strokeStyle = look.kind === 'Panda' && !side ? '#f4f1ea' : INK;
      if (X.eyes === 'ko') { g.scale(flip, 1); g.stroke(pp(spiral())); }
      else g.stroke(pp(X.eyes === 'blink' ? E.blink : E.hurt));
      g.restore();
      continue;
    }
    g.fillStyle = '#ffffff'; g.fill(pp(fish ? E.fishWhite : fierce ? E.fWhite : E.white));
    const ir = fish ? 0.55 : X.small ? 0.72 : fierce ? 0.85 : 1;
    const ix = side ? 0.04 : -0.01, iy = fierce ? 0.08 : 0.05;
    g.fillStyle = ep.iris;
    g.beginPath(); g.ellipse(ix, iy, (side ? 0.075 : 0.125) * ir, 0.19 * ir, 0, 0, TAU); g.fill();
    if (C.lod) {
      if (C.lod === 2) { g.fillStyle = ep.lt; g.beginPath(); g.ellipse(ix, iy + 0.1 * ir, (side ? 0.05 : 0.085) * ir, 0.07 * ir, 0, 0, TAU); g.fill(); }
      g.fillStyle = ep.pupil; g.beginPath(); g.ellipse(ix + (side ? 0.015 : 0), iy + 0.015, (side ? 0.036 : 0.062) * ir, 0.105 * ir, 0, 0, TAU); g.fill();
    }
    g.fillStyle = INK;
    g.fill(pp(fish ? E.fishLash : fierce ? E.fLash : E.lash));
    if (C.lod === 2 && !side && !fierce) { g.lineWidth = 0.028; g.strokeStyle = INK; g.stroke(pp(E.lower)); }
    g.restore();
    // catch-lights on the upper-left (screen), not mirrored
    if (C.lod) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(side ? x + 0.04 - 0.035 * C.sx : x - 0.06, ey + (fierce ? 0.04 : -0.03), 0.052 * (fish ? 0.8 : 1), 0, TAU); g.fill();
      if (C.lod === 2 && !side) { g.beginPath(); g.arc(x + 0.055, ey + 0.14, 0.026, 0, TAU); g.fill(); }
    }
  }
  if (look.scarEye) {
    g.lineWidth = 0.06; g.strokeStyle = '#9b3a36'; g.stroke(pp(side ? SCAR.S : SCAR.F));
    if (C.lod === 2) { g.lineWidth = 0.03; g.stroke(pp(side ? SCAR.Sx : SCAR.Fx)); }
  }
}

const BROWS = {
  S: { fierce: 'M0.5 -0.3 Q0.66 -0.26 0.88 -0.12', worried: 'M0.5 -0.16 Q0.66 -0.28 0.86 -0.3', neutral: 'M0.5 -0.2 Q0.66 -0.29 0.86 -0.22' },
  F: { fierce: 'M0.17 -0.1 Q0.38 -0.2 0.62 -0.31 M-0.17 -0.1 Q-0.38 -0.2 -0.62 -0.31', worried: 'M0.2 -0.3 Q0.42 -0.3 0.6 -0.16 M-0.2 -0.3 Q-0.42 -0.3 -0.6 -0.16',
    neutral: 'M0.2 -0.19 Q0.4 -0.3 0.6 -0.22 M-0.2 -0.19 Q-0.4 -0.3 -0.6 -0.22' },
};
function drawBrows(g, C, v, X, pal) {
  g.lineWidth = C.lod ? 0.075 : 0.09; g.strokeStyle = pal.brow;
  g.stroke(pp(BROWS[v === 'S' ? 'S' : 'F'][X.brow] || BROWS.F.neutral));
}

const MOUTH_COL = '#5c1c20', TONGUE = '#e0626a', TEETH = '#ffffff';
const MOUTHS = {
  S: {
    fierce: 'M0.94 0.6 Q0.86 0.56 0.76 0.62', neutral: 'M0.94 0.58 Q0.86 0.62 0.78 0.6', ko: 'M0.94 0.58 Q0.86 0.62 0.78 0.6',
    grin: ['M0.98 0.49 L0.62 0.55 Q0.72 0.8 0.94 0.8 Z', 'M0.62 0.55 L1 0.48 L1 0.6 L0.66 0.62 Z', [0.86, 0.78, 0.14, 0.07]],
    shout: ['M0.98 0.5 L0.7 0.52 Q0.7 0.88 0.92 0.88 Z', 'M0.7 0.52 L1 0.49 L1 0.57 L0.7 0.58 Z', [0.86, 0.86, 0.14, 0.08]],
    grimace: ['M0.98 0.52 L0.72 0.56 L0.94 0.72 Z', 'M0.7 0.5 L1 0.5 L1 0.8 L0.7 0.8 Z', null, 'M0.76 0.62 L0.95 0.62'],
    sharp: 'M0.6 0.54 L1 0.47 L1 0.56 L0.92 0.64 L0.86 0.56 L0.8 0.64 L0.74 0.56 L0.68 0.63 Z',
  },
  F: {
    fierce: 'M-0.14 0.66 Q0 0.58 0.14 0.66', ko: 'M-0.16 0.62 Q-0.08 0.54 0 0.62 Q0.08 0.7 0.16 0.62',
    animal: 'M-0.16 0.56 Q-0.08 0.66 0 0.54 Q0.08 0.66 0.16 0.56', smile: 'M-0.12 0.61 Q0 0.67 0.12 0.6', flat: 'M-0.11 0.62 L0.11 0.62',
    grin: ['M-0.46 0.46 Q0 0.58 0.46 0.46 Q0.36 0.95 0 0.95 Q-0.36 0.95 -0.46 0.46 Z', 'M-0.5 0.4 L0.5 0.4 L0.5 0.56 Q0 0.72 -0.5 0.56 Z', [0, 0.93, 0.24, 0.11]],
    shout: ['M-0.25 0.5 Q0 0.45 0.25 0.5 Q0.3 0.92 0 0.94 Q-0.3 0.92 -0.25 0.5 Z', 'M-0.3 0.4 L0.3 0.4 L0.3 0.55 Q0 0.6 -0.3 0.55 Z', [0, 0.92, 0.17, 0.1]],
    grimace: ['M-0.3 0.55 Q0 0.5 0.3 0.55 L0.26 0.74 Q0 0.7 -0.26 0.74 Z', 'M-0.4 0.4 L0.4 0.4 L0.4 0.9 L-0.4 0.9 Z', null, 'M-0.28 0.64 L0.28 0.64 M-0.12 0.54 L-0.12 0.72 M0.06 0.53 L0.06 0.72'],
  },
};
function drawMouth(g, C, v, look, X) {
  const side = v === 'S', M = MOUTHS[side ? 'S' : 'F'];
  const kind = X.mouth;
  if (look.muzzle) { g.save(); g.translate(0, 0.05); }
  if (kind === 'neutral' || kind === 'fierce' || kind === 'ko') {
    const d = side ? M[kind] : kind !== 'neutral' ? M[kind] : look.muzzle || look.race === 'mink' ? M.animal : (look.seed || 0) % 2 ? M.smile : M.flat;
    g.lineWidth = 0.05; g.strokeStyle = MOUTH_COL; g.stroke(pp(d));
  } else {
    const [d, teeth, tongue, lines] = M[kind];
    const mp = pp(d);
    g.fillStyle = MOUTH_COL; g.fill(mp);
    if (C.lod) {
      g.save(); g.clip(mp);
      if (tongue) { g.fillStyle = TONGUE; g.fill(EL(...tongue)); }
      g.fillStyle = TEETH; g.fill(pp(look.sharpTeeth ? side ? M.sharp : sharpTeeth(kind) : teeth));
      if (lines) { g.lineWidth = 0.025; g.strokeStyle = 'rgba(90,40,40,0.8)'; g.stroke(pp(lines)); }
      g.restore();
    }
    g.lineWidth = 0.035; g.strokeStyle = MOUTH_COL; g.stroke(mp);
  }
  if (look.muzzle) g.restore();
}
const SHARP = new Map();
function sharpTeeth(kind) {
  let s = SHARP.get(kind);
  if (s) return s;
  const [x0, x1, y0, h] = kind === 'grin' ? [-0.46, 0.46, 0.46, 0.13] : kind === 'shout' ? [-0.26, 0.26, 0.48, 0.1] : [-0.3, 0.3, 0.53, 0.1];
  const n = kind === 'grin' ? 7 : 4;
  const b = pb().M(x0, y0 - 0.1);
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; b.L(x, y0 + (i === 0 || i === n ? 0 : 0.02)); if (i < n) b.L(x + (x1 - x0) / n / 2, y0 + h); }
  b.L(x1, y0 - 0.1).Z();
  // lower fangs
  const yb = kind === 'grin' ? 0.9 : kind === 'shout' ? 0.9 : 0.74;
  b.M(x0 * 0.7, yb + 0.1);
  for (let i = 0; i <= n - 1; i++) { const x = x0 * 0.7 + (x1 - x0) * 0.7 * i / (n - 1); b.L(x, yb); if (i < n - 1) b.L(x + (x1 - x0) * 0.7 / (n - 1) / 2, yb - h * 0.9); }
  b.L(x1 * 0.7, yb + 0.1).Z();
  s = b.s; SHARP.set(kind, s);
  return s;
}

// --------------------------------------------------------- race features
// Mink ears sit on top of the hair: filled shapes, outlined only along the rim
// (no line across the base, which blends into the fur-coloured hair).
const MINK_EARS = {
  pointy: { o: 'M-0.96 -0.5 L-1.02 -1.34 Q-0.64 -1.12 -0.24 -0.96 Z', rim: 'M-0.96 -0.5 L-1.02 -1.34 Q-0.64 -1.12 -0.24 -0.96', i: 'M-0.84 -0.64 L-0.9 -1.14 Q-0.66 -1.02 -0.46 -0.9 Z' },
  round: { o: pb().ell(-0.74, -0.86, 0.32, 0.3).s, rim: (() => { const a = at(-0.74, -0.86, 0.32, 125); return pb().M(-0.74 + (a[0] + 0.74), -0.86 + (a[1] + 0.86) * 0.3 / 0.32).arc(-0.74, -0.86, 0.32, 0.3, 125, 395).s; })(), i: pb().ell(-0.74, -0.88, 0.18, 0.17).s },
  long: { o: 'M-0.64 -0.8 C-0.8 -1.4 -0.78 -2.0 -0.52 -2.1 C-0.28 -2.0 -0.2 -1.4 -0.3 -0.84 Z', rim: 'M-0.64 -0.8 C-0.8 -1.4 -0.78 -2.0 -0.52 -2.1 C-0.28 -2.0 -0.2 -1.4 -0.3 -0.84', i: 'M-0.56 -0.96 C-0.66 -1.4 -0.64 -1.86 -0.52 -1.94 C-0.4 -1.86 -0.36 -1.4 -0.4 -0.96 Z' },
};
/** Where head-top features (animal ears, antennae) sit: lifted and spread on voluminous hair. */
function topLift(style) {
  if (style !== 'afro' && style !== 'curly' && style !== 'spiky' && style !== 'nika') return [1, 0];
  const m = META[style];
  return [m.w / 1.15, Math.min(0, (m.top + 1.16) * 0.55)];
}
function minkEars(g, C, v, look, furCol, style) {
  const fp = skinPal(furCol);
  const panda = look.kind === 'Panda';
  const col = panda ? '#2b2b2b' : furCol, inner = panda ? '#2b2b2b' : fp.inner;
  const E = MINK_EARS[look.ears] || MINK_EARS.pointy;
  const [kx, dy] = topLift(style);
  const one = (dx, flipX, far) => {
    g.save(); g.translate(dx, dy); g.scale(flipX ? -kx : kx, 1);
    const p = pp(E.o);
    cel(g, p, far ? fp.shadow : col, C.lod < 2 ? null : far ? fp.deep : fp.shadow, C, 0.1);
    if (v !== 'B' && C.lod) { g.fillStyle = far ? fp.innerDk : inner; g.fill(pp(E.i)); }
    ink(g, pp(E.rim), C);
    g.restore();
  };
  if (v === 'S') { one(0.62, false, true); one(0.9, false, false); }
  else { one(0, false, false); one(0, true, false); }
}
const ANTENNA = { S: 'M0.2 -0.9 Q0.3 -1.3 0.5 -1.44 M-0.06 -0.94 Q0.0 -1.34 0.16 -1.5', F: 'M-0.24 -0.92 Q-0.34 -1.3 -0.46 -1.46 M0.24 -0.92 Q0.34 -1.3 0.46 -1.46' };
function antennae(g, C, v, skinP, style) {
  const [kx, dy] = topLift(style);
  g.save(); g.translate(0, dy); g.scale(kx, 1);
  const d = pp(v === 'S' ? ANTENNA.S : ANTENNA.F);
  g.lineWidth = 0.13; g.strokeStyle = OUTLINE; g.stroke(d);
  g.lineWidth = 0.06; g.strokeStyle = skinP.shadow; g.stroke(d);
  part(g, C, v === 'S' ? EL(0.5, -1.44, 0.09, 0.09, 0.16, -1.5, 0.09, 0.09) : EL(-0.46, -1.46, 0.09, 0.09, 0.46, -1.46, 0.09, 0.09), skinP.base, skinP.shadow, 0.04, 0, true);
  g.restore();
}
const FIN = { S: 'M0.3 -0.92 C0.1 -1.36 -0.3 -1.62 -0.7 -1.8 C-0.62 -1.36 -0.7 -1.02 -0.92 -0.72 Z', F: 'M-0.18 -0.88 Q-0.12 -1.4 0.04 -1.76 Q0.22 -1.36 0.18 -0.88 Z', rays: 'M0.0 -0.94 Q-0.3 -1.3 -0.56 -1.6 M-0.4 -0.84 Q-0.56 -1.2 -0.66 -1.4' };
function fin(g, C, v, skinP, style) {
  const dy = topLift(style)[1];
  if (dy) { g.save(); g.translate(0, dy); }
  const p = part(g, C, v === 'S' ? FIN.S : FIN.F, skinP.shadow, skinP.deep, 0.08, 0, true);
  if (C.lod === 2 && v === 'S') { g.save(); g.clip(p); line(g, C, FIN.rays, skinP.line); g.restore(); }
  if (dy) g.restore();
}
const GILLS = { S: 'M0.3 0.5 Q0.24 0.6 0.3 0.7 M0.2 0.52 Q0.14 0.62 0.2 0.74 M0.1 0.56 Q0.04 0.66 0.1 0.78',
  F: 'M0.74 0.44 Q0.68 0.52 0.72 0.6 M0.68 0.54 Q0.62 0.62 0.66 0.7 M-0.74 0.44 Q-0.68 0.52 -0.72 0.6 M-0.68 0.54 Q-0.62 0.62 -0.66 0.7' };
function gills(g, C, v, skinP) { g.lineWidth = 0.035; g.strokeStyle = skinP.line; g.stroke(pp(v === 'S' ? GILLS.S : GILLS.F)); }
const SNOUT_S = 'M0.6 0.24 C0.9 0.16 1.2 0.24 1.22 0.42 C1.24 0.62 1.02 0.74 0.8 0.76 C0.64 0.72 0.58 0.5 0.6 0.24 Z';
const NOSE_ANIMAL = 'M-0.11 0.35 Q0 0.3 0.11 0.35 Q0.07 0.45 0 0.47 Q-0.07 0.45 -0.11 0.35 Z';
function muzzle(g, C, v, look, skinP) {
  if (v === 'S') {
    part(g, C, SNOUT_S, skinP.muzzle, skinP.shadow, 0.06, 0, true);
    part(g, C, EL(1.16, 0.3, 0.09, 0.07), '#2d2226', null, 0, C.lw * 0.5);
    return;
  }
  g.fillStyle = skinP.muzzle; g.fill(EL(0, 0.56, 0.36, 0.27));
  part(g, C, NOSE_ANIMAL, '#2d2226', null, 0, C.lw * 0.5);
  if (C.lod) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill(EL(-0.04, 0.35, 0.03, 0.02)); }
}
const NOSES = {
  longS: 'M0.96 0.2 L1.95 0.2 Q2.04 0.27 1.95 0.34 L0.96 0.42 Z', long: 'M-0.07 0.26 L0.56 0.44 Q0.66 0.5 0.56 0.58 L-0.03 0.48 Z',
  saw: 'M-0.05 0.26 L0.64 0.38 Q0.72 0.43 0.64 0.48 L-0.02 0.42 Z',
  sawTeethS: 'M1.1 0.2 L1.16 0.12 L1.22 0.2 M1.34 0.2 L1.4 0.12 L1.46 0.2 M1.58 0.2 L1.64 0.12 L1.7 0.2 M1.1 0.41 L1.16 0.48 L1.22 0.4 M1.34 0.39 L1.4 0.46 L1.46 0.38 M1.58 0.37 L1.64 0.44 L1.7 0.36',
  sawTeeth: 'M0.1 0.29 L0.16 0.22 L0.22 0.31 M0.3 0.32 L0.36 0.25 L0.42 0.34 M0.5 0.36 L0.56 0.29 L0.6 0.37 M0.12 0.44 L0.17 0.5 L0.23 0.45 M0.32 0.46 L0.37 0.52 L0.43 0.47',
  hint: 'M0.03 0.35 Q0.08 0.42 0.02 0.45',
};
function noseF(g, C, look, skinP, v) {
  const side = v === 'S';
  if (look.nose === 'red') {
    const x = side ? 1.12 : 0, y = side ? 0.33 : 0.4;
    part(g, C, EL(x, y, 0.15, 0.15), '#e53935', '#a61d1d', 0.05);
    if (C.lod) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(EL(x - 0.05, y - 0.05, 0.04, 0.03)); }
    return;
  }
  if (look.nose === 'long' || look.kind === 'Saw Shark') {
    const saw = look.kind === 'Saw Shark';
    part(g, C, side ? NOSES.longS : saw ? NOSES.saw : NOSES.long, saw ? '#9fb0bf' : skinP.base, saw ? '#6d8193' : skinP.shadow, 0.05);
    if (saw && C.lod) { g.fillStyle = '#f4f1ea'; g.fill(pp(side ? NOSES.sawTeethS : NOSES.sawTeeth)); }
    return;
  }
  if (!side && C.lod && look.race !== 'mink') { g.lineWidth = 0.04; g.strokeStyle = skinP.line; g.stroke(pp(NOSES.hint)); }
}
const SHADES = {
  lensS: 'M0.52 0.02 L0.84 0.02 Q0.86 0.26 0.7 0.3 Q0.54 0.3 0.52 0.02 Z', armS: 'M0.58 0.08 L0.0 0.14', glintS: 'M0.62 0.06 L0.7 0.06 L0.64 0.2 L0.58 0.2 Z',
  lens: 'M0.14 0.02 L0.64 0.0 Q0.66 0.28 0.46 0.34 Q0.2 0.36 0.14 0.02 Z M-0.14 0.02 L-0.64 0.0 Q-0.66 0.28 -0.46 0.34 Q-0.2 0.36 -0.14 0.02 Z',
  glint: 'M-0.5 0.04 L-0.4 0.04 L-0.48 0.24 L-0.58 0.24 Z M0.3 0.04 L0.4 0.04 L0.32 0.24 L0.22 0.24 Z', bridge: 'M-0.14 0.06 Q0 0.02 0.14 0.06',
};
function eyewear(g, C, v) {
  const lens = '#241f2c', frame = '#15121a', side = v === 'S';
  if (side) { g.lineWidth = 0.05; g.strokeStyle = frame; g.stroke(pp(SHADES.armS)); }
  part(g, C, side ? SHADES.lensS : SHADES.lens, lens, null, 0, C.lw * 0.8);
  if (C.lod) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill(pp(side ? SHADES.glintS : SHADES.glint)); }
  if (!side) { g.lineWidth = 0.06; g.strokeStyle = frame; g.stroke(pp(SHADES.bridge)); }
}
// panda eye patches: slanted teardrops around the eyes
const PANDA = 'M0.14 0.02 C0.2 -0.2 0.58 -0.22 0.68 0.12 C0.76 0.4 0.62 0.58 0.44 0.52 C0.24 0.46 0.1 0.26 0.14 0.02 Z M-0.14 0.02 C-0.2 -0.2 -0.58 -0.22 -0.68 0.12 C-0.76 0.4 -0.62 0.58 -0.44 0.52 C-0.24 0.46 -0.1 0.26 -0.14 0.02 Z';
const THIRD = { F: 'M0 -0.28 Q0.11 -0.12 0 0.04 Q-0.11 -0.12 0 -0.28 Z', S: 'M0.86 -0.28 Q0.91 -0.12 0.86 0.04 Q0.81 -0.12 0.86 -0.28 Z' };
function thirdEye(g, C, v, look) {
  const side = v === 'S', x = side ? 0.86 : 0, w = side ? 0.05 : 0.11;
  part(g, C, side ? THIRD.S : THIRD.F, '#ffffff', null, 0, C.lw * 0.6);
  if (C.lod) {
    g.fillStyle = hex(look.eyeColor, '#8e44ad'); g.beginPath(); g.ellipse(x, -0.11, w * 0.55, 0.1, 0, 0, TAU); g.fill();
    g.fillStyle = '#1a1020'; g.beginPath(); g.ellipse(x, -0.1, w * 0.25, 0.05, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 0.02, -0.15, 0.025, 0, TAU); g.fill();
  }
}

// ------------------------------------------------------------------ main
function hairCtx(look, style, hairCol, skinCol, t, pose, C) {
  const pal = hairPal(hairCol);
  return {
    pal, t: t || 0, seed: ((look && look.seed) || 0) * 0.37, moving: !!(pose && pose.moving), walk: pose && pose.walk,
    stubble: style === 'mohawk' ? tint(hex(skinCol, '#f1c9a0'), pal.shadow, 0.13) : null, sx: C.sx,
  };
}
function withClip(g, y, fn) {
  if (y === null || y === undefined) { fn(); return; }
  g.save(); g.beginPath(); g.rect(-12, y, 24, 24); g.clip(); fn(); g.restore();
}
function hatCtx(look, style, t, pose) {
  const m = META[style] || META.short;
  return { hatColor: look && look.hatColor, seed: (look && look.seed) || 0, t: t || 0, top: m.top, w: m.w, hatK: m.hatK, moving: !!(pose && pose.moving), walk: pose && pose.walk, tailA: undefined, haloY: undefined };
}
/** Draw a hat (already in head units); k scales it around the band for big hair. */
function hatLayer(g, C, kind, v, H, behind) {
  const fn = behind ? HAT_BEHIND[kind] : HATS[kind];
  if (!fn) return;
  const k = kind === 'crown' || kind === 'halo' || kind === 'bubble' ? 1 : H.hatK;
  if (k !== 1) { g.save(); g.translate(0, -0.2); g.scale(k, hatKy(k)); g.translate(0, 0.2); }
  fn(g, C, v, H);
  if (k !== 1) g.restore();
}
/** The fringe part of a style/view (its shadow falls on the forehead), looked up once. */
function fringeOf(S) {
  if (S.fr === undefined) { const f = S.front.find((p) => p.fringe); S.fr = f ? path(f.d) : null; }
  return S.fr;
}
const FUR_TUFTS = { S: 'M-0.3 0.84 L-0.46 1.02 L-0.14 0.9 L-0.1 1.06 L0.1 0.92 Z', F: 'M-0.86 0.5 L-1.08 0.66 L-0.84 0.66 L-0.94 0.84 L-0.66 0.78 Z M0.86 0.5 L1.08 0.66 L0.84 0.66 L0.94 0.84 L0.66 0.78 Z' };
const BALD_SHINE = { S: 'M-0.3 -0.8 Q0.0 -0.95 0.34 -0.88', F: 'M-0.62 -0.52 Q-0.5 -0.8 -0.18 -0.9', B: 'M-0.62 -0.5 Q-0.52 -0.8 -0.2 -0.9' };

// Heads are cached as small bitmaps at in-game sizes: dozens of characters are
// drawn every frame and a head is ~30 path fills/strokes. The key covers
// everything the art depends on (look, view, mirroring, expression, the
// quantised sway), so a cached head matches a live one; bigger heads
// (portraits, the creation preview, the wanted poster) are drawn live.
// Debug: globalThis.CHARART_NOCACHE = true draws every head live.
const CACHE_MAX_PX = 40;     // head radius in device pixels
const CACHE_SIZE = 600;      // bitmaps kept (least recently used go first)
const HEADS = new Map();
const q = (v, step) => Math.round(v / step) * step;

/** Everything that decides what a head looks like this frame. */
function headState(look, v, pose, P, t, sx) {
  const style = look.nika ? 'nika' : styleId(look.hair);
  const S = STYLES[style][v];
  const kind = hatKind(look.hat, look);
  const clipY = hatClip(kind);
  const H = {
    pal: null, t: t || 0, seed: (look.seed || 0) * 0.37, moving: !!pose.moving, walk: pose.walk, stubble: null, sx,
    swayA: undefined, tailA: undefined, haloY: undefined,
  };
  if (S.sw === undefined) { const sp = S.back.concat(S.front).find((pt) => pt.sway); S.sw = sp ? sp.sway : null; }
  if (S.sw) H.swayA = q(swayAngle(S.sw, H), 0.02);
  if (kind === 'bandana' || kind === 'headband') H.tailA = q(tailAngle(H), 0.04);
  const HT = kind ? hatCtx(look, style, t, pose) : null;
  if (HT) { HT.tailA = H.tailA; if (kind === 'halo') HT.haloY = q(Math.sin(HT.t * 2.2) * 0.04, 0.02); }
  return { style, S, kind, HT, clip: clipY === null ? null : -0.2 + (clipY + 0.2) * hatKy(HT.hatK), H, X: expression(look, pose, P, t || 0), ghost: !!pose.ghost };
}
function lookKey(look) {
  return `${look.race}|${look.skin}|${look.hair}|${look.hairColor}|${look.hat}|${look.hatColor}|${look.eyeColor}|${look.seed}|${look.eyeShape}|${look.ears}|${look.fur}|`
    + `${look.furFace ? 1 : 0}${look.furWhite ? 1 : 0}${look.muzzle ? 1 : 0}${look.fin ? 1 : 0}${look.grin ? 1 : 0}${look.sharpTeeth ? 1 : 0}${look.thirdEye ? 1 : 0}${look.scarEye ? 1 : 0}${look.gills ? 1 : 0}|${look.kind}|${look.nose}|${look.goggles}`;
}
/** Generous bounds of a head in head units: [x0, y0, x1, y1]. */
function headBounds(look, st, v) {
  const m = META[st.style] || META.short;
  let x0 = -1.4, x1 = 1.4, y0 = Math.min(-1.35, m.top - 0.2), y1 = 1.2;
  const st2 = st.style;
  if (st2 === 'long') y1 = 1.85;
  if (st2 === 'ponytail') { y1 = v === 'F' ? 1.35 : 1.7; if (v === 'F') x1 = 1.95; if (v === 'S') x0 = -2.0; }
  if (st2 === 'afro') { x0 = -1.8; x1 = 1.8; if (v === 'S') x0 = -1.95; }
  if (st2 === 'spiky' || st2 === 'nika') { x0 = -1.65; x1 = 1.65; }
  if (st2 === 'curly') { x0 = -1.5; x1 = 1.5; }
  if (st2 === 'pompadour' && v === 'S') x1 = 1.75;
  if (look.ears) y0 = Math.min(y0, look.ears === 'long' ? -2.3 : -1.5);
  if (look.fin) y0 = Math.min(y0, -1.95);
  if (look.race === 'skypiean') y0 = Math.min(y0, -1.7);
  if (v === 'S' && (look.nose === 'long' || look.kind === 'Saw Shark')) x1 = 2.2;
  if (st.kind) {
    const k = st.HT.hatK, ky = hatKy(k);
    const hb = { straw: [1.75, -1.62], captain: [2.15, -2.4], tricorne: [1.7, -1.75], cowboy: [1.95, -1.85], marine: [1.4, -1.5], pinkhat: [1.4, -2.2],
      tophat: [1.4, -2.2], topHat: [1.4, -2.2], beanie: [1.3, -1.75], bandana: [1.85, -1.4], headband: [2.0, -0.9], goggles: [1.3, -1.0], horns: [1.2, -2.05],
      helm: [1.6, -1.95], antlers: [1.45, -2.2], cap: [1.6, -1.45] }[st.kind];
    if (hb) { x0 = Math.min(x0, -hb[0] * k); x1 = Math.max(x1, hb[0] * k); y0 = Math.min(y0, -0.2 + (hb[1] + 0.2) * ky); }
    if (st.kind === 'crown') y0 = Math.min(y0, m.top - 0.55);
    if (st.kind === 'halo') y0 = Math.min(y0, m.top - 0.7);
    if (st.kind === 'bubble') { const R = 1.72 * k + 0.12; x0 = Math.min(x0, -R); x1 = Math.max(x1, R); y0 = Math.min(y0, -0.2 - (k - 1) * 0.6 - R); y1 = Math.max(y1, -0.2 + R); }
    if (st.kind === 'marine' && v !== 'F') y1 = Math.max(y1, 1.2);
  }
  return [x0 - 0.1, y0 - 0.1, x1 + 0.1, y1 + 0.1];
}
function cachedHead(look, v, pose, st, px, sx, r) {
  // 1/12-octave size buckets, rendered at or above the needed size (only ever scaled down a little)
  const b = Math.ceil(Math.log2(px) * 12);
  const X = st.X, H = st.H;
  const key = `${lookKey(look)}~${v}${sx}~${X.eyes}${X.mouth}${X.brow}${X.small ? 1 : 0}${st.ghost ? 1 : 0}~${b}~${H.swayA}~${H.tailA}~${st.HT ? st.HT.haloY : ''}`;
  let e = HEADS.get(key);
  if (e) { HEADS.delete(key); HEADS.set(key, e); return e; }
  const pxb = Math.pow(2, b / 12);
  const [x0, y0, x1, y1] = headBounds(look, st, v);
  const W = Math.ceil((x1 - x0) * pxb) + 2, Ht = Math.ceil((y1 - y0) * pxb) + 2;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, Ht) : Object.assign(document.createElement('canvas'), { width: W, height: Ht });
  const cg = c.getContext('2d');
  if (!cg) return null;
  cg.setTransform(pxb, 0, 0, pxb, (1 - x0 * pxb), (1 - y0 * pxb));
  cg.lineJoin = 'round'; cg.lineCap = 'round';
  renderHead(cg, look, v, pose, st, headCtx(pxb, sx, r, v));
  e = { c, x: x0 - 1 / pxb, y: y0 - 1 / pxb, w: W / pxb, h: Ht / pxb };
  HEADS.set(key, e);
  if (HEADS.size > CACHE_SIZE) { let n = 64; for (const k of HEADS.keys()) { HEADS.delete(k); if (--n <= 0) break; } }
  return e;
}

export function drawHead(g, look, hy, r, d, pose, t, P) {
  pose = pose || {};
  const v = viewOf(d);
  const m = g.getTransform();
  const px = Math.hypot(m.a, m.b) * r, sx = m.a * m.d - m.b * m.c < 0 ? -1 : 1;
  const st = headState(look, v, pose, P, t, sx);
  if (px <= CACHE_MAX_PX && px > 0.5 && !look.nika && !pose.flash && !globalThis.CHARART_NOCACHE) {
    const e = cachedHead(look, v, pose, st, px, sx, r);
    if (e) { g.drawImage(e.c, e.x * r, hy + e.y * r, e.w * r, e.h * r); return; }
  }
  const C = begin(g, hy, r, v);
  renderHead(g, look, v, pose, st, C);
  g.restore();
}

/** Draw a head in head units on an already-posed context. */
function renderHead(g, look, v, pose, st, C) {
  const { style, S, kind, HT, clip, H, X, ghost } = st;
  const white = !!look.furWhite;
  const skinCol = white ? '#fafafa' : hex(look.fur && look.furFace ? look.fur : look.skin, '#f1c9a0');
  const hairCol = white ? '#fafafa' : hex(look.nika ? '#ffffff' : look.hairColor, '#2d2d2d');
  const skinP = skinPal(skinCol);
  H.pal = hairPal(hairCol);
  if (style === 'mohawk') H.stubble = tint(skinCol, H.pal.shadow, 0.13);

  // 1. behind the head: hat tails, animal ears, fins, antennae, back hair
  if (kind) hatLayer(g, C, kind, v, HT, true);
  withClip(g, clip, () => {
    if (look.fin && look.kind !== 'Octopus') fin(g, C, v, skinP, style);
    if (style === 'nika') drawParts(g, [{ d: new Path2D(nikaFlames(v, H.t)), off: 0.08 }], C, H);
    drawParts(g, S.back, C, H);
  });
  // 2. ears (behind the face in front/back views)
  if (!look.ears && v !== 'S') {
    part(g, C, EAR_F.both, skinP.base, skinP.shadow, 0.06, 0, true);
    if (C.lod === 2 && v === 'F') { g.lineWidth = C.lwIn; g.strokeStyle = skinP.line; g.stroke(pp(EAR_F.inner)); }
  }
  // 3. face: shadow tone, lit tone nudged toward the light and the fringe's shadow on the forehead, in one clip
  const face = P2face(v);
  if (look.furFace && look.ears && v !== 'B' && C.lod) part(g, C, v === 'S' ? FUR_TUFTS.S : FUR_TUFTS.F, skinP.base, skinP.shadow, 0.05, 0, true);
  const fr = v !== 'B' && !ghost ? fringeOf(S) : null;
  if (C.lod) {
    g.fillStyle = skinP.shadow; g.fill(face);
    g.save(); g.clip(face);
    g.translate(-0.11 * C.sx, -0.11); g.fillStyle = skinP.base; g.fill(face);
    if (fr) { g.translate(0.14 * C.sx, 0.21); g.fillStyle = skinP.shadow; g.fill(fr); }
    g.restore();
  } else { g.fillStyle = skinP.base; g.fill(face); }
  ink(g, face, C);
  if (v === 'S' && !look.ears) {
    part(g, C, EAR_S.p, skinP.base, skinP.shadow, 0.05, C.lw * 0.8, true);
    if (C.lod === 2) { g.lineWidth = C.lwIn; g.strokeStyle = skinP.line; g.stroke(pp(EAR_S.i)); }
  }
  if (style === 'bald' && C.lod && (v === 'B' || !ghost)) { g.lineWidth = 0.09; g.strokeStyle = skinP.light; g.stroke(pp(BALD_SHINE[v])); }
  // 4. face details
  if (v !== 'B' && !ghost) {
    if (look.kind === 'Panda' && v === 'F') { g.fillStyle = '#2b2b2b'; g.fill(pp(PANDA)); }
    if (look.muzzle) muzzle(g, C, v, look, skinP);
    if (look.gills && C.lod) gills(g, C, v, skinP);
    drawEyes(g, C, v, look, X);
    if (look.grin && X.mouth === 'grin' && C.lod === 2 && v === 'F') { g.fillStyle = skinP.blush; g.globalAlpha *= 0.5; g.fill(EL(-0.66, 0.46, 0.14, 0.07, 0.66, 0.46, 0.14, 0.07)); g.globalAlpha /= 0.5; }
    if (!look.nose && look.kind !== 'Saw Shark') noseF(g, C, look, skinP, v);
    drawMouth(g, C, v, look, X);
  }
  // 5. front hair, then what grows through it (animal ears, antennae)
  withClip(g, clip, () => {
    drawParts(g, S.front, C, H);
    if (look.ears) minkEars(g, C, v, look, white ? '#fafafa' : hex(look.fur || look.hairColor, skinCol), style);
    if (look.race === 'skypiean' && !ghost) antennae(g, C, v, skinP, style);
  });
  // 6. over the fringe: brows, third eye, long noses, eyewear
  if (v !== 'B' && !ghost) {
    drawBrows(g, C, v, X, H.pal);
    if (look.thirdEye) thirdEye(g, C, v, look);
    if (look.nose || look.kind === 'Saw Shark') noseF(g, C, look, skinP, v);
    if (look.goggles === true) eyewear(g, C, v);
  }
  // 7. hat
  if (kind) hatLayer(g, C, kind, v, HT, false);
  if (pose.flash && !ghost) {
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill(face);
    for (const pt of S.front) { g.save(); if (pt.at) { g.translate(pt.at[0], pt.at[1]); if (pt.at[2]) g.rotate(pt.at[2]); } g.fill(pt.p || path(pt.d)); g.restore(); }
  }
}
function P2face(v) { return path(v === 'S' ? FACE_S : FACE_F); }

export function drawHair(g, style, col, hy, r, d, nikaT) {
  const nika = nikaT !== null && nikaT !== undefined;
  const s = nika ? 'nika' : styleId(style);
  if (s === 'bald') return;
  const v = viewOf(d);
  const S = STYLES[s][v];
  const C = begin(g, hy, r, v);
  const H = hairCtx(null, s, nika ? '#ffffff' : hex(col, '#2d2d2d'), '#f1c9a0', nika ? nikaT : 0, null, C);
  // the caller has already drawn the face (a circle of radius r): keep the back layer outside it
  g.save(); g.beginPath(); g.rect(-9, -9, 18, 18); g.arc(0, 0, 1, 0, TAU, true); g.clip();
  if (nika) drawParts(g, [{ d: new Path2D(nikaFlames(v, nikaT)), off: 0.08 }], C, H);
  drawParts(g, S.back, C, H);
  g.restore();
  drawParts(g, S.front, C, H);
  g.restore();
}

export function drawHat(g, hat, hy, r, d, look) {
  const kind = hatKind(hat, look);
  if (!kind) return;
  const v = viewOf(d);
  const C = begin(g, hy, r, v);
  const HT = hatCtx(look || {}, styleId(look && look.hair), 0, null);
  hatLayer(g, C, kind, v, HT, true);
  hatLayer(g, C, kind, v, HT, false);
  g.restore();
}
