// Procedural icons for items, techniques and UI (no emoji, no image files).
// API (stable — the UI depends on it):
//   itemIcon(idOrDef, size = 48)     → HTMLCanvasElement (cached per id + size)
//   skillIcon(abilityDef, size = 48) → HTMLCanvasElement (cached per id + size)
//   uiIcon(name, size = 32)          → HTMLCanvasElement (cached per name + size)
//   iconURL(canvas)                  → data: URL (cached) for CSS backgrounds
//
// Canvases are drawn at 2× (or the device pixel ratio, max 3×) with
// style.width/height = size px, so they stay crisp on HiDPI screens. A data URL
// from iconURL() has that same 2× resolution: pair it with
// `background-size: <size>px` (or `contain`). A cached canvas is a single DOM
// node — to show one icon in two places use iconURL() or copy the canvas.
//
// Look: bold silhouettes on a transparent background, 2–3 tone cel shading lit
// from the top-left, a dark ink outline (#2b1d14) plus a soft inner highlight.
// Everything is authored on a 64-unit grid and scaled to the requested size.
// Items resolve by id → name keywords → type/kind; unknown things get a pouch.
import { ITEMS } from '../data/items.js';
import { FRUITS } from '../data/fruits.js';

const TAU = Math.PI * 2;
const OUT = '#2b1d14';
const U = 64;

// ============================================================== colour utils
const colCache = new Map();
function rgba(c) {
  let v = colCache.get(c);
  if (v) return v;
  let r = 0, g = 0, b = 0, a = 1;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length <= 4) h = h.split('').map((x) => x + x).join('');
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const m = c.match(/[\d.]+/g) || [0, 0, 0];
    r = +m[0]; g = +m[1]; b = +m[2]; if (m.length > 3) a = +m[3];
  }
  v = [r, g, b, a];
  colCache.set(c, v);
  return v;
}
const css = (r, g, b, a = 1) => (a >= 1 ? `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.max(0, a).toFixed(3)})`);
function mix(c1, c2, t) {
  const A = rgba(c1), B = rgba(c2);
  return css(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3]);
}
const dk = (c, t = 0.3) => mix(c, '#1c0f1c', t);
const lt = (c, t = 0.4) => mix(c, '#fffaea', t);
const fade = (c, a) => { const A = rgba(c); return css(A[0], A[1], A[2], a); };
const lum = (c) => { const A = rgba(c); return (0.299 * A[0] + 0.587 * A[1] + 0.114 * A[2]) / 255; };
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Shared material colours
const C = {
  wood: '#9c6a3c', woodD: '#6e4526', woodL: '#c89560', bone: '#f1e6cb', steel: '#d4dde4', iron: '#6c7780',
  gold: '#f0bf45', brass: '#d6a23e', silver: '#cfd6dc', paper: '#f6ead0', leather: '#8e5a30', skin: '#f2c596',
  white: '#f7f4ec', black: '#35303a', red: '#c8372d', navy: '#223f66', green: '#4f9a3a', leaf: '#5aa33f',
  cloth: '#c0392b', glass: '#d7ecf1', sea: '#2f7fc0', purple: '#7a4fa8', pink: '#ef8fb5',
};

// ================================================================ paths
const PC = new Map();
const P = (d) => {
  if (typeof d !== 'string') return d;
  let p = PC.get(d);
  if (!p) { p = new Path2D(d); PC.set(d, p); }
  return p;
};
function circle(x, y, r) { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; }
function ellipse(x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, TAU); return p; }
function rrect(x, y, w, h, r = 0) {
  const p = new Path2D();
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}
function poly(pts, close = true) {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  if (close) p.closePath();
  return p;
}
function union(...ps) { const p = new Path2D(); for (const q of ps) p.addPath(P(q)); return p; }
/** Copy of a path moved/rotated/scaled about (ox, oy). */
function xf(d, { x = 0, y = 0, r = 0, s = 1, sx, sy, ox = 32, oy = 32 } = {}) {
  const m = new DOMMatrix().translate(ox + x, oy + y).rotate(r * 180 / Math.PI).scale(sx ?? s, sy ?? s).translate(-ox, -oy);
  const p = new Path2D(); p.addPath(P(d), m); return p;
}
function star(cx, cy, n, r1, r2, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return poly(pts);
}
function spiral(cx, cy, r, turns = 1.6, rot = 0, dir = 1) {
  const p = new Path2D(), n = Math.ceil(turns * 26);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = rot + dir * t * turns * TAU, rr = r * (0.12 + 0.88 * t);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? p.lineTo(x, y) : p.moveTo(x, y);
  }
  return p;
}
function arcPath(cx, cy, r, a0, a1, ccw = false) { const p = new Path2D(); p.arc(cx, cy, r, a0, a1, ccw); return p; }

// ============================================================ rendering core
const cache = new Map();
const scratch = {};
function scr(name, px) {
  let s = scratch[name];
  if (!s) s = scratch[name] = document.createElement('canvas');
  if (s.width !== px) { s.width = px; s.height = px; }
  const t = s.getContext('2d');
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
  t.clearRect(0, 0, px, px);
  return s;
}

function mk(size) {
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
  const res = Math.max(2, Math.min(3, Math.ceil(dpr)));
  const px = Math.max(8, Math.round(size * res));
  const c = document.createElement('canvas');
  c.width = c.height = px;
  c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d');
  const k = px / U;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const olPx = Math.min(2.1, Math.max(1, 0.7 + size * 0.0145));
  return { c, g, k, px, size, res, small: size <= 28, ol: olPx * U / size, rimPx: Math.min(1.5, Math.max(0.65, size * 0.019)) * res };
}

/** Local (uniform) scale of the current transform relative to the icon grid. */
function lsc(I) { const m = I.g.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) / I.k; }
/** A screen-space vector (grid units) expressed in the current local coordinates. */
function lvec(I, x, y) {
  const m = I.g.getTransform(), det = m.a * m.d - m.b * m.c, px = x * I.k, py = y * I.k;
  return [(m.d * px - m.c * py) / det, (-m.b * px + m.a * py) / det];
}

/**
 * A shaded, outlined shape: ink outline, base colour, shadow crescent on the
 * bottom-right, soft highlight band inside the top-left edge.
 *  o.sd shadow depth, o.hd highlight depth (grid units), o.sh / o.hi explicit
 *  tones, o.ol outline width (0 = none), o.flat no shading, o.gloss [x,y,rx,ry,a].
 */
function part(I, path, color, o = {}) {
  const g = I.g, p = P(path), rule = o.rule || 'nonzero', s = lsc(I);
  const ol = (o.ol ?? I.ol) / s;
  if (ol > 0) { g.lineWidth = ol * 2; g.strokeStyle = o.line || OUT; g.stroke(p); }
  const sd = o.flat ? 0 : o.sd ?? 2.6, hd = o.flat ? 0 : o.hd ?? 2;
  g.save();
  g.clip(p, rule);
  if (sd > 0) {
    g.fillStyle = o.sh || dk(color, o.shT ?? 0.32);
    g.fill(p, rule);
    const [dx, dy] = lvec(I, -sd, -sd);
    g.translate(dx, dy);
  }
  g.fillStyle = color;
  g.fill(p, rule);
  g.restore();
  if (hd > 0) hilite(I, p, o.hi || lt(color, o.hiT ?? 0.45), hd, o.hiA ?? 0.85, o.inset ?? 0.9, rule);
  if (o.gloss) gloss(I, ...o.gloss);
  return p;
}
function hilite(I, p, color, hd, a, inset, rule) {
  const s = scr('hl', I.px), t = s.getContext('2d');
  t.setTransform(I.g.getTransform());
  t.fillStyle = color;
  const [ix, iy] = lvec(I, inset, inset), [hx, hy] = lvec(I, inset + hd, inset + hd);
  t.save(); t.translate(ix, iy); t.fill(p, rule); t.restore();
  t.globalCompositeOperation = 'destination-out';
  t.save(); t.translate(hx, hy); t.fill(p, rule); t.restore();
  t.globalCompositeOperation = 'destination-in';
  t.fill(p, rule);
  const g = I.g;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a; g.drawImage(s, 0, 0); g.restore();
}
function gloss(I, x, y, rx, ry, a = 0.75, rot = -0.6) {
  const g = I.g; g.save(); g.globalAlpha = a; g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); g.restore();
}
/** Outlined thick stroke (handles, stems, ropes, chains) with a lit top edge. */
function tube(I, path, color, w, o = {}) {
  const g = I.g, p = P(path), s = lsc(I), ol = (o.ol ?? I.ol) / s;
  g.save();
  g.lineCap = o.cap || 'round'; g.lineJoin = 'round';
  if (ol > 0) { g.strokeStyle = o.line || OUT; g.lineWidth = w + ol * 2; g.stroke(p); }
  g.strokeStyle = color; g.lineWidth = w; g.stroke(p);
  if (!o.flat && w > 1.6) {
    let [dx, dy] = lvec(I, w * 0.2, w * 0.2);
    g.save(); g.translate(dx, dy); g.globalAlpha = 0.9; g.strokeStyle = o.sh || dk(color, 0.3); g.lineWidth = w * 0.32; g.stroke(p); g.restore();
    [dx, dy] = lvec(I, -w * 0.2, -w * 0.2);
    g.save(); g.translate(dx, dy); g.globalAlpha = 0.85; g.strokeStyle = o.hi || lt(color, 0.5); g.lineWidth = w * 0.26; g.stroke(p); g.restore();
  }
  g.restore();
}
/** Plain stroke (details, texture, motion lines). */
function ln(I, path, color, w, o = {}) {
  const g = I.g; g.save();
  g.lineCap = o.cap || 'round'; g.lineJoin = 'round';
  g.strokeStyle = color; g.lineWidth = w;
  if (o.a != null) g.globalAlpha = o.a;
  if (o.dash) g.setLineDash(o.dash);
  g.stroke(P(path)); g.restore();
}
/** Flat fill, no outline. */
function fl(I, path, color, o = {}) {
  const g = I.g; g.save();
  if (o.a != null) g.globalAlpha = o.a;
  g.fillStyle = color; g.fill(P(path), o.rule || 'nonzero'); g.restore();
}
function clip(I, path, fn) { const g = I.g; g.save(); g.clip(P(path)); fn(); g.restore(); }
/** Run fn with the grid rotated by r (radians) / scaled by s about (ox, oy). */
function tf(I, { r = 0, s = 1, sx, sy, x = 0, y = 0, ox = 32, oy = 32 } = {}, fn) {
  const g = I.g; g.save();
  g.translate(ox + x, oy + y); g.rotate(r); g.scale(sx ?? s, sy ?? s); g.translate(-ox, -oy);
  fn(); g.restore();
}
function alpha(I, a, fn) { const g = I.g; g.save(); g.globalAlpha *= a; fn(); g.restore(); }

/** Silhouette rim: thickens the outer contour so shapes separate from any background. */
function rim(I, rpx = I.rimPx) {
  if (rpx <= 0) return;
  const s = scr('rim', I.px), t = s.getContext('2d');
  t.drawImage(I.c, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = OUT; t.fillRect(0, 0, I.px, I.px);
  const g = I.g;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-over';
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.drawImage(s, Math.cos(a) * rpx, Math.sin(a) * rpx); }
  g.restore();
}

function render(key, size, draw, opts = {}) {
  size = Math.max(8, Math.round(size || 48));
  const ck = key + '@' + size;
  let c = cache.get(ck);
  if (c) return c;
  const I = mk(size);
  try {
    draw(I);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[icons] failed to draw', key, e);
    I.g.setTransform(1, 0, 0, 1, 0, 0); I.g.clearRect(0, 0, I.px, I.px);
    I.g.setTransform(I.k, 0, 0, I.k, 0, 0);
    D.pouch(I, {});
  }
  if (opts.rim !== false) rim(I, opts.rimPx ?? I.rimPx);
  c = I.c;
  if (opts.tag) c.dataset.icon = opts.tag;
  if (opts.fallback) c.dataset.fallback = '1';
  cache.set(ck, c);
  return c;
}

// ============================================================ item drawers
// Each drawer: (I, o) where o carries colours / variants and the item def.
const D = {};

// ------------------------------------------------------------------ food
D.meat = (I) => {
  tube(I, 'M11 53 L53 11', C.bone, 7);
  part(I, union(circle(8, 51.5, 4.6), circle(12.5, 56, 4.6)), C.bone, { sd: 1.6, hd: 1.2 });
  part(I, union(circle(51.5, 8, 4.6), circle(56, 12.5, 4.6)), C.bone, { sd: 1.6, hd: 1.2 });
  const m = 'M18 47 C10 40 12 27 20 20 C27 13 39 11 45 17 C51 23 49 35 42 42 C35 49 25 53 18 47 Z';
  part(I, m, '#bb5a2c', { sd: 4, hd: 2.4, gloss: [26, 23, 5, 2.4, 0.55] });
  if (!I.small) clip(I, m, () => { ln(I, 'M22 40 C27 38 32 34 35 29', dk('#bb5a2c', 0.4), 1.6, { a: 0.6 }); ln(I, 'M29 44 C33 42 37 39 40 35', dk('#bb5a2c', 0.4), 1.4, { a: 0.5 }); });
};

D.riceBall = (I) => {
  const r = 'M32 8 C38 8 42 14 47 22 C53 32 58 40 57 47 C56 54 50 56 44 56 L20 56 C14 56 8 54 7 47 C6 40 11 32 17 22 C22 14 26 8 32 8 Z';
  part(I, r, '#fbf7ec', { sd: 3, shT: 0.2, hd: 2 });
  clip(I, r, () => part(I, rrect(20.5, 36, 23, 24, 1.5), '#27352c', { sd: 1.6, hd: 1.4, hiT: 0.3 }));
  if (!I.small) for (const [x, y] of [[27, 20], [36, 25], [22, 30], [42, 33]]) fl(I, ellipse(x, y, 1.6, 0.9, 0.5), '#d9d2c2');
};

/** Bowl with a stew/soup; o.soup colour, o.bowl colour, o.top 'fish' | 'noodles' | 'mochi' | 'bone' | 'veg'. */
D.bowl = (I, o = {}) => {
  const bowl = o.bowl || '#3e6f9f', soup = o.soup || '#e08a3c';
  part(I, rrect(23, 50, 18, 7, 2), dk(bowl, 0.15), { sd: 1.4, hd: 1 });
  if (o.top === 'noodles') { tube(I, 'M36 27 L56 8', '#d9b26f', 2.6); tube(I, 'M39 28 L60 13', '#d9b26f', 2.6); }
  const body = 'M7 29 H57 C57 44 46 54 32 54 C18 54 7 44 7 29 Z';
  part(I, body, bowl, { sd: 3.2, hd: 2 });
  if (!I.small) clip(I, body, () => ln(I, 'M8 36 C20 41 44 41 56 36', lt(bowl, 0.5), 2.2, { a: 0.8 }));
  part(I, ellipse(32, 29, 25, 6.2), dk(bowl, 0.35), { sd: 0, hd: 0 });
  part(I, ellipse(32, 29.6, 21.5, 4.6), soup, { ol: I.ol * 0.6, sd: 1.4, hd: 1.2 });
  if (o.top === 'fish') part(I, 'M39 28 C41 23 44 19 48 17 L46 12 L55 15 L52 21 L49 20 C46 23 44 26 43.5 29 Z', '#e0a052', { sd: 1.4, hd: 1 });
  if (o.top === 'noodles') for (const x of [18, 24, 30, 36]) ln(I, `M${x} 29 c2 -2 4 2 6 0`, lt(soup, 0.5), 1.5);
  if (o.top === 'mochi') { part(I, ellipse(26, 28.5, 5, 2.6), '#fbf7ec', { sd: 1, hd: 0.8 }); part(I, ellipse(38, 29.5, 4.5, 2.3), '#fbf7ec', { sd: 1, hd: 0.8 }); }
  if (o.top === 'bone') { tube(I, 'M34 29 L50 12', C.bone, 4.5); part(I, union(circle(49, 10, 3.2), circle(52.5, 13.5, 3.2)), C.bone, { sd: 1, hd: 0.8 }); part(I, ellipse(31, 29, 8, 3.2), '#a6512b', { sd: 1, hd: 0.8 }); }
  if (o.top === 'veg') { part(I, circle(24, 28.5, 3), '#f08a2c', { sd: 1, hd: 0.8 }); part(I, circle(38, 29, 2.8), '#6fae3c', { sd: 1, hd: 0.8 }); part(I, circle(31, 27.6, 2.6), '#d44a3a', { sd: 1, hd: 0.8 }); }
  if (!o.noSteam) for (const [x, h] of [[20, 0], [30, -3], [40 + (o.top === 'fish' ? -12 : 0), 0]]) ln(I, `M${x} ${22 + h} c-4 -4 4 -7 0 -12`, '#ffffff', 2.4, { a: 0.8 });
};

D.orange = (I, o = {}) => {
  const col = o.color || '#f28e1c';
  part(I, circle(32, 37, 19.5), col, { sd: 3.6, hd: 2.4, gloss: [24, 28, 4.5, 2.4, 0.55] });
  if (!I.small) for (const [x, y] of [[40, 44], [36, 50], [44, 36], [27, 46]]) fl(I, circle(x, y, 0.8), dk(col, 0.3), { a: 0.7 });
  part(I, circle(32, 18.5, 2.6), '#5c7a2a', { sd: 0.8, hd: 0 });
  part(I, 'M33 18 C36 10 44 7 53 9 C50 16 42 20 33 18 Z', C.leaf, { sd: 1.6, hd: 1.2 });
  ln(I, 'M35 16.5 C40 14 45 12 50 10.5', dk(C.leaf, 0.35), 1.1);
};

D.steak = (I) => {
  const fat = 'M9 31 C9 19 20 10 33 10 C47 10 57 19 57 31 C57 45 46 55 32 55 C19 55 9 44 9 31 Z';
  const meat = 'M14 31 C14 21 23 15.5 33 15.5 C44 15.5 52 22 52 31 C52 42 44 50 32 50 C21 50 14 41 14 31 Z';
  part(I, fat, '#f1dbb2', { sd: 3, hd: 2 });
  part(I, meat, '#b8442f', { sd: 3, hd: 2, ol: I.ol * 0.7 });
  clip(I, meat, () => {
    ln(I, 'M18 26 C24 30 28 24 34 28 C40 32 44 26 50 29', '#f3d9b4', 1.6, { a: 0.9 });
    if (!I.small) ln(I, 'M20 40 C26 37 30 42 36 39', '#f3d9b4', 1.3, { a: 0.8 });
    for (const x of [18, 28, 38, 48]) ln(I, `M${x} 50 L${x + 12} 14`, '#4a1f16', 2.4, { a: 0.55 });
  });
  part(I, circle(24, 33, 4.2), C.bone, { sd: 1.2, hd: 0.8, ol: I.ol * 0.7 });
};

D.plate = (I, o = {}) => {
  part(I, ellipse(32, 42, 29, 13.5), '#f4f1ea', { sd: 2.6, shT: 0.2, hd: 1.6 });
  fl(I, ellipse(32, 41.5, 21, 8.6), '#e6e1d6');
  ln(I, ellipse(32, 42, 25.5, 11.2), '#5a86b8', 1.2, { a: 0.9 });
  if (o.food === 'platter') {
    part(I, ellipse(24, 37, 9, 5.5), '#b8562f', { sd: 1.6, hd: 1.2 });
    part(I, 'M30 38 C31 30 44 28 46 36 C44 42 34 43 30 38 Z', '#f2ce6b', { sd: 1.6, hd: 1.2 });
    part(I, circle(40, 43, 3.6), '#d44a3a', { sd: 1, hd: 0.8 });
    part(I, 'M18 42 C20 38 26 38 28 42 C25 45 21 45 18 42 Z', '#6fae3c', { sd: 1, hd: 0.8 });
  } else {
    const fish = 'M13 38 C19 29 35 28 43 34 L53 27 L51.5 41 L43 37 C35 44 19 45 13 38 Z';
    part(I, fish, '#d9793a', { sd: 2.2, hd: 1.6, gloss: [22, 34, 3.6, 1.6, 0.5] });
    clip(I, fish, () => { for (const x of [24, 30, 36]) ln(I, `M${x} 31 L${x - 4} 43`, '#7a3418', 1.6, { a: 0.55 }); });
    fl(I, circle(18.5, 36, 1.4), OUT);
    part(I, 'M40 44 C40 40 48 40 48 44 Z', '#f6dc4a', { sd: 0.8, hd: 0.6 });
    part(I, 'M44 26 C47 20 53 19 56 21 C54 25 49 27 44 26 Z', C.leaf, { sd: 1, hd: 0.8 });
  }
};

/** Tokkuri sake bottle with a cup. o.band colour. */
D.sake = (I, o = {}) => {
  const b = 'M27 7 H37 V13 C37 18 46 23 46 37 C46 49 40 56 32 56 C24 56 18 49 18 37 C18 23 27 18 27 13 Z';
  part(I, b, '#efe7d2', { sd: 3, shT: 0.22, hd: 2 });
  clip(I, b, () => { part(I, rrect(14, 30, 36, 9, 0), o.band || '#2f5f8f', { sd: 1.4, hd: 1, ol: I.ol * 0.7 }); });
  if (!I.small) part(I, circle(32, 34.5, 2.6), '#efe7d2', { sd: 0.6, hd: 0, ol: I.ol * 0.5 });
  part(I, ellipse(32, 7.5, 6.6, 2.3), '#efe7d2', { sd: 0.8, hd: 0 });
  const cup = 'M43 45 H59 C59 51 56 57 51 57 C46 57 43 51 43 45 Z';
  part(I, cup, '#efe7d2', { sd: 1.8, shT: 0.22, hd: 1.2 });
  clip(I, cup, () => fl(I, rrect(42, 50, 18, 3, 0), o.band || '#2f5f8f'));
  part(I, ellipse(51, 45, 8, 2.2), '#c9b88f', { sd: 0, hd: 0 });
};

/** Wooden barrel. o.hoop colour, o.label 'cola' | 'ale' | null. */
D.barrel = (I, o = {}) => {
  const body = 'M15 11 C23 8 41 8 49 11 C54 21 54 45 49 55 C41 58 23 58 15 55 C10 45 10 21 15 11 Z';
  const wood = o.wood || '#a8693a';
  part(I, body, wood, { sd: 3.4, hd: 2.2 });
  clip(I, body, () => {
    for (const d of ['M24 9 C21 24 21 42 24 57', 'M32 8 V58', 'M40 9 C43 24 43 42 40 57']) ln(I, d, dk(wood, 0.45), 1.2, { a: 0.7 });
    for (const y of [17, 45]) part(I, `M8 ${y} C22 ${y + 3} 42 ${y + 3} 56 ${y} L56 ${y + 5} C42 ${y + 8} 22 ${y + 8} 8 ${y + 5} Z`, o.hoop || '#5b6770', { sd: 1.2, hd: 1, ol: I.ol * 0.8 });
  });
  part(I, ellipse(32, 11, 16.5, 3.8), lt(wood, 0.12), { sd: 1, hd: 0.8 });
  if (o.label === 'cola') {
    part(I, circle(32, 33, 7.5), '#d4302b', { sd: 1.4, hd: 1 });
    ln(I, 'M26 34 C29 30 33 37 38 31', '#ffffff', 1.8);
    for (const [x, y, r] of [[27, 5, 2.2], [34, 3.5, 1.6], [39, 6, 1.9]]) part(I, circle(x, y, r), '#e9d9c2', { sd: 0.5, hd: 0, ol: I.ol * 0.6 });
  } else if (o.label === 'ale') {
    part(I, 'M15 11 C14 4 22 3 26 5 C29 1 37 1 40 5 C45 2 51 5 49 11 C41 14 23 14 15 11 Z', '#fbf3dc', { sd: 1.4, hd: 1 });
  }
};

D.bandage = (I) => {
  part(I, poly([[20, 38], [54, 42], [50.5, 47], [55, 52], [20, 49]]), '#f3efe4', { sd: 1.8, shT: 0.2, hd: 1.2 });
  if (!I.small) ln(I, 'M28 43.5 L48 45.5', '#cfc6b2', 1.1, { dash: [2.2, 2] });
  part(I, rrect(38, 41.5, 7, 7, 1), '#d23b32', { sd: 0, hd: 0, ol: 0 });
  fl(I, rrect(40.4, 42.7, 2.2, 4.6, 0.5), '#ffffff'); fl(I, rrect(39.2, 43.9, 4.6, 2.2, 0.5), '#ffffff');
  part(I, circle(24, 27, 15), '#f6f2e8', { sd: 3, shT: 0.22, hd: 2 });
  ln(I, spiral(24, 27, 11.5, 1.6, 0.6), '#d4ccb8', 1.3);
  part(I, circle(24, 27, 4.2), '#cdbfa2', { sd: 1, hd: 0, ol: I.ol * 0.7 });
};

/** Glass flask. o.liquid colour, o.shape 'round' | 'tall'. */
D.vial = (I, o = {}) => {
  const liquid = o.liquid || '#5bbf6a';
  const f = o.shape === 'tall' ? 'M24 12 H40 V47 C40 53 36.5 57 32 57 C27.5 57 24 53 24 47 Z'
    : 'M27 12 H37 V23 C46 26 52 33 52 41 C52 51 43 58 32 58 C21 58 12 51 12 41 C12 33 18 26 27 23 Z';
  part(I, f, '#dcebee', { sd: 1.6, shT: 0.2, hd: 0 });
  clip(I, f, () => {
    part(I, rrect(6, o.shape === 'tall' ? 30 : 35, 52, 30, 0), liquid, { sd: 2.6, hd: 0, ol: 0 });
    fl(I, ellipse(32, o.shape === 'tall' ? 30 : 35, 22, 2.2), lt(liquid, 0.4));
    if (!I.small) for (const [x, y, r] of [[26, 45, 1.6], [36, 50, 1.2], [30, 41, 1]]) fl(I, circle(x, y, r), lt(liquid, 0.55));
  });
  gloss(I, o.shape === 'tall' ? 28 : 19, o.shape === 'tall' ? 30 : 38, 1.8, o.shape === 'tall' ? 9 : 6, 0.7, o.shape === 'tall' ? 0 : 0.35);
  part(I, rrect(25, 4.5, 14, 9, 2), '#b27a45', { sd: 1.4, hd: 1 });
  part(I, rrect(26, 11.5, 12, 3, 1), lt('#dcebee', 0.2), { sd: 0, hd: 0, ol: I.ol * 0.7 });
};

D.pill = (I, o = {}) => {
  const col = o.color || '#f6d02a';
  part(I, circle(30, 35, 18), col, { sd: 3.6, hd: 2.4, gloss: [22, 26, 5.5, 3, 0.7] });
  clip(I, circle(30, 35, 18), () => ln(I, 'M11 37 C20 45 40 45 49 37', dk(col, 0.4), 2, { a: 0.8 }));
  if (o.engrave && !I.small) ln(I, star(30, 28, 5, 4, 1.8), dk(col, 0.45), 1.1);
  part(I, star(50, 13, 4, 8, 2.2), '#ffffff', { sd: 0, hd: 0, ol: I.ol * 0.8 });
};

D.syringe = (I, o = {}) => {
  const liquid = o.liquid || '#e0578d';
  tf(I, { r: -Math.PI / 4 }, () => {
    part(I, rrect(5, 30, 15, 4, 1), '#b8c3cc', { sd: 0.8, hd: 0.6 });
    part(I, rrect(2, 23.5, 4.5, 17, 1.5), '#8d99a3', { sd: 1, hd: 0.8 });
    tube(I, 'M50 32 H63', '#c7d0d8', 1.6, { flat: true });
    part(I, rrect(45, 28.5, 6, 7, 1.2), '#9aa6b0', { sd: 1, hd: 0.8 });
    const barrel = rrect(19, 24.5, 27, 15, 3);
    part(I, barrel, '#e3eff3', { sd: 1.4, shT: 0.2, hd: 0 });
    clip(I, barrel, () => { part(I, rrect(25, 24, 22, 16, 0), liquid, { sd: 2, hd: 1.4, ol: I.ol * 0.6 }); if (!I.small) for (const x of [28, 33, 38, 43]) ln(I, `M${x} 25 V29`, '#ffffff', 1, { a: 0.9 }); });
    gloss(I, 30, 27.5, 9, 1.2, 0.6, 0);
    part(I, rrect(17, 21.5, 4, 21, 1.5), '#a7b3bd', { sd: 1, hd: 0.8 });
  });
};

// --------------------------------------------------------------- swords
// Blades are authored horizontally (hilt left, tip right) and turned -45°.
const DIAG = -Math.PI / 4;
const SWORD = {
  steel: { blade: '#dfe7ee', wrap: '#5a3d2b', diamond: '#b89868', tsuba: '#8a7a64', habaki: '#c9a24e' },
  wazamono: { blade: '#e4ecf2', wrap: '#2c3b5c', diamond: '#e9e1c8', tsuba: '#c9a04a', habaki: '#d8b04f' },
  ryo: { blade: '#e6eef3', wrap: '#23605e', diamond: '#e9e1c8', tsuba: '#c9a04a', habaki: '#d8b04f' },
  o: { blade: '#eef3f7', wrap: '#4a2a5e', diamond: '#f0d58a', tsuba: '#e2b64a', habaki: '#e8c35a' },
  saijo: { blade: '#3a3542', wrap: '#2a2530', diamond: '#e2b64a', tsuba: '#e2b64a', habaki: '#e8c35a' },
};
function swordPalette(o) {
  const g = (o.def?.grade || '').toLowerCase();
  if (/saijo/.test(g)) return SWORD.saijo;
  if (/^o wazamono|^ō/.test(g)) return SWORD.o;
  if (/ryo/.test(g)) return SWORD.ryo;
  if (/wazamono/.test(g)) return SWORD.wazamono;
  return SWORD.steel;
}
/** Katana. o: blade, wrap, diamond, tsuba, habaki, tsubaShape 'round'|'flower'|'square', hamon 'wave', aura, rust, wood, bolt */
D.katana = (I, o = {}) => {
  const p = { ...swordPalette(o), ...o };
  tf(I, { r: DIAG, s: 0.93 }, () => {
    if (p.aura) alpha(I, 0.45, () => { ln(I, 'M26 32 L66 29', p.aura, 11); ln(I, 'M26 32 L68 28.5', p.aura, 7); });
    const blade = 'M25 29.4 L70 27.3 C67.5 31 64 33.8 58 34.3 L25 34.9 Z';
    if (!p.wood) {
      part(I, blade, p.blade, { sd: 1.6, hd: 1, shT: 0.35 });
      clip(I, blade, () => {
        fl(I, 'M25 33.4 L58 32.8 C63 32.4 67 30.5 70 27.3 L72 36 L25 36 Z', p.edge || lt(p.blade, 0.6), { a: 0.9 });
        if (p.hamon === 'wave') ln(I, 'M26 33 q3 -2 6 0 t6 0 t6 0 t6 0 t6 0 t6 -0.5', p.hamonColor || '#c0302a', 1.4);
        if (!I.small) ln(I, 'M27 30.9 L60 29.4', dk(p.blade, 0.35), 0.9, { a: 0.7 });
        if (p.rust) for (const [x, y, r] of [[34, 31, 1.6], [44, 32.5, 1.2], [51, 30.6, 1.4], [39, 33.6, 0.9]]) fl(I, circle(x, y, r), '#8a4b24', { a: 0.75 });
        if (p.bolt) ln(I, 'M28 32 L33 30 L37 33 L42 30 L47 33 L52 30 L57 32', '#fff38a', 1.3);
      });
      part(I, rrect(23, 28.8, 3.8, 6.6, 0.8), p.habaki, { sd: 0.8, hd: 0.5 });
    } else {
      part(I, 'M22 29.4 L67 28 C68.5 28.4 69.5 30 69 31.6 C67 33.6 64 34.4 60 34.5 L22 34.9 Z', C.woodL, { sd: 1.6, hd: 1 });
    }
    const handle = rrect(-2, 28.5, 22, 7, 2.6);
    part(I, handle, p.wrap, { sd: 1.4, hd: 1 });
    if (!I.small) clip(I, handle, () => { for (let x = -1; x < 19; x += 4.2) fl(I, poly([[x, 32], [x + 2.1, 29.7], [x + 4.2, 32], [x + 2.1, 34.3]]), p.diamond); });
    part(I, rrect(-5, 28.3, 4, 7.4, 1.6), p.habaki, { sd: 0.8, hd: 0.5 });
    const ts = p.tsubaShape === 'flower' ? union(circle(21, 26.5, 3), circle(21, 32, 3.4), circle(21, 37.5, 3))
      : p.tsubaShape === 'square' ? rrect(19, 24, 4.2, 16, 1) : ellipse(21, 32, 2.4, 8.3);
    part(I, ts, p.tsuba, { sd: 1, hd: 0.7 });
  });
};
D.cutlass = (I, o = {}) => {
  const guard = o.guard || C.brass;
  tf(I, { r: DIAG + 0.05 }, () => {
    const blade = o.saber ? 'M22 29.5 L62 28.8 C64 29 66 30.5 67 32 C64 33.6 61 34.4 58 34.6 L22 34.8 Z'
      : 'M22 29.4 C36 29 50 27 60 24 C63 23.5 66 25 67 27.5 C64 32 58 37 50 38.5 C40 39.5 30 36 22 35.4 Z';
    part(I, blade, o.blade || '#dbe3ea', { sd: 1.6, hd: 1 });
    clip(I, blade, () => fl(I, o.saber ? 'M22 33.4 L58 33 L68 32 L68 36 L22 36 Z' : 'M22 34 C32 35.5 44 37 52 36.5 C58 35 64 31 68 27 L68 40 L22 40 Z', '#f4f8fb', { a: 0.9 }));
    tube(I, 'M20 24.5 C10 23 3 25 2.5 29', guard, 2.2);
    part(I, rrect(2, 28.6, 16, 6.8, 2.6), o.wrap || '#3b2a22', { sd: 1.2, hd: 0.8 });
    part(I, 'M17 21 C22 22 24 26 24 32 C24 38 22 42 17 43 C19 38 19.5 26 17 21 Z', guard, { sd: 1.4, hd: 1 });
    part(I, circle(1.5, 32, 3.1), guard, { sd: 0.8, hd: 0.5 });
  });
};
D.yoru = (I) => {
  tf(I, { r: DIAG, s: 0.93 }, () => {
    const blade = 'M27 27.6 L62 27.4 C65 27.6 68.5 30 70 32 C68.5 34 65 36.4 62 36.6 L27 36.4 Z';
    part(I, blade, '#34303c', { sd: 1.6, hd: 1.4, hi: '#8a8298' });
    clip(I, blade, () => { fl(I, 'M27 34.6 L62 34.6 L70 32 L71 38 L27 38 Z', '#6b6478', { a: 0.9 }); ln(I, 'M29 32 L62 32', '#1e1a24', 1, { a: 0.8 }); });
    part(I, rrect(-3, 29, 22, 6, 2.4), '#2b2631', { sd: 1.2, hd: 1, hi: '#6b6478' });
    if (!I.small) for (const x of [2, 7, 12]) fl(I, rrect(x, 29.2, 1.6, 5.6, 0.6), '#d6a23e');
    const cross = 'M20 30 C21 24 21.5 18 20 12 C23.5 14 25.5 14 28 12 C26.5 18 27 24 28 30 L28 34 C27 40 26.5 46 28 52 C25.5 50 23.5 50 20 52 C21.5 46 21 40 20 34 Z';
    part(I, cross, '#e0b24a', { sd: 1.4, hd: 1 });
    part(I, circle(24, 32, 3.4), '#3aa37a', { sd: 1, hd: 0.8, gloss: [23, 31, 1.1, 0.7, 0.9] });
    part(I, circle(-4, 32, 3), '#e0b24a', { sd: 0.8, hd: 0.5 });
  });
};

// ----------------------------------------------------------------- guns
D.flintlock = (I, o = {}) => {
  const metal = o.metal || '#7c8891', wood = o.wood || '#8a5530';
  tf(I, { r: -0.26, y: 2 }, () => {
    part(I, rrect(18, 19.5, 43, 6.4, 2.2), metal, { sd: 1.4, hd: 1 });
    part(I, rrect(58.5, 18.4, 4.6, 8.6, 1.4), C.brass, { sd: 0.8, hd: 0.6 });
    part(I, 'M22 24 H50 C52.5 24 53.5 26 53 28 C52.6 29.6 51.5 30.4 49.5 30.4 H30 Z', wood, { sd: 1.2, hd: 0.9 });
    const grip = 'M12 19.5 C17 19 22 19.5 27.5 21 L30 29 C25 32 22 38 20.5 45 L20 50 C18.5 55.5 11.5 57 8.5 53 C6.5 51 7 48.5 8 46 C10.5 38 12 29 12 19.5 Z';
    part(I, grip, wood, { sd: 2, hd: 1.4 });
    part(I, 'M8 46 C7 48.5 6.5 51 8.5 53 C11.5 56.5 18.5 55.5 20 50.5 C15.5 51 11 49.5 8 46 Z', C.brass, { sd: 0.8, hd: 0.5 });
    part(I, rrect(44, 19, 3, 12, 1), C.brass, { sd: 0.6, hd: 0.4 });
    part(I, rrect(17, 23.5, 12, 6, 2), '#a3aeb6', { sd: 0.8, hd: 0.6 });
    part(I, 'M18.5 24 C15.5 19.5 16.5 13.5 21 12.5 L23.5 15 C21 16.5 21 20 22.5 23.5 Z', '#5d6870', { sd: 0.8, hd: 0.5 });
    tube(I, 'M28.5 30.5 C28.5 37.5 36 39 38.5 31', C.brass, 1.8, { flat: true });
    ln(I, 'M32 30.5 C31.5 33.5 32.5 35 33.5 35.5', OUT, 1.4);
  });
};
D.rifle = (I, o = {}) => {
  const wood = o.wood || '#8a5530', metal = o.metal || '#6f7a83';
  tf(I, { r: DIAG }, () => {
    if (o.bayonet) part(I, 'M60 27.4 L71 28.4 L60 30.2 Z', '#dfe7ee', { sd: 0.6, hd: 0.4 });
    part(I, rrect(26, 26, 38, 3.8, 1.4), metal, { sd: 1, hd: 0.7 });
    part(I, rrect(26, 29, 30, 5.6, 2), wood, { sd: 1.2, hd: 0.8 });
    part(I, 'M-3 30.5 C-3 27 1 25 5 25 L20 27.5 L29 28.5 V35.5 L20 35.5 L6 39.5 C0 41 -3 38 -3 34.5 Z', wood, { sd: 1.6, hd: 1.2 });
    for (const x of [38, 50]) part(I, rrect(x, 25.4, 2.6, 9.8, 0.8), C.brass, { sd: 0.5, hd: 0.3 });
    part(I, rrect(20, 26, 8, 5, 1.5), '#9aa6af', { sd: 0.6, hd: 0.4 });
    tube(I, 'M20 35 C20 40 26 41 28 36', C.brass, 1.6, { flat: true });
  });
};
D.slingshot = (I, o = {}) => {
  const wood = o.wood || C.wood;
  tf(I, { r: 0.28 }, () => {
    tube(I, 'M32 58 L32 38', wood, 7);
    tube(I, 'M32 40 C24 36 19.5 28 18.5 13', wood, 5.5);
    tube(I, 'M32 40 C40 36 44.5 28 45.5 13', wood, 5.5);
    part(I, rrect(28.2, 46, 7.6, 10, 2), '#6b3f25', { sd: 1, hd: 0.7 });
    ln(I, 'M18.5 14 L32 27 L45.5 14', OUT, 2.8);
    ln(I, 'M18.5 14 L32 27 L45.5 14', '#b8744a', 1.6);
    part(I, ellipse(32, 27, 5.4, 3.8), '#6b3f25', { sd: 0.8, hd: 0.6 });
    part(I, circle(32, 26, 2.4), '#9aa6af', { sd: 0.5, hd: 0.3 });
  });
};
D.kabuto = (I, o = {}) => {
  const col = o.color || '#4f7d3a', trim = o.trim || C.brass;
  tf(I, { r: 0.6 }, () => {
    tube(I, 'M32 66 L32 34', col, 5.6);
    part(I, rrect(28.5, 50, 7, 8, 1.6), trim, { sd: 0.6, hd: 0.4 });
    const arms = 'M32 39 C21 37 14.5 28 14.5 16 C14.5 11 16 7 18.5 3.5 C20 9 21 16 24.5 22 C26.5 25.5 29 27 32 27 C35 27 37.5 25.5 39.5 22 C43 16 44 9 45.5 3.5 C48 7 49.5 11 49.5 16 C49.5 28 43 37 32 39 Z';
    part(I, arms, col, { sd: 2, hd: 1.4 });
    ln(I, 'M18.8 6 L32 21 L45.2 6', OUT, 2.4); ln(I, 'M18.8 6 L32 21 L45.2 6', '#e6d2a8', 1.2);
    part(I, circle(32, 33, 5.2), trim, { sd: 1, hd: 0.8 });
    part(I, circle(32, 33, 2.3), o.gem || '#e0663a', { sd: 0.5, hd: 0, ol: I.ol * 0.6 });
  });
};
D.bow = (I, o = {}) => {
  const col = o.color || '#5f8f3a';
  tf(I, { r: DIAG }, () => {
    ln(I, 'M20 6 L20 58', '#e8dcc0', 1.1);
    tube(I, 'M20 6 C33 12 38 22 38 32 C38 42 33 52 20 58', col, 4.2);
    if (o.snake) { part(I, ellipse(19, 5, 4, 2.6, -0.4), col, { sd: 0.8, hd: 0.5 }); fl(I, circle(18, 4, 0.9), '#f6dc4a'); }
    tube(I, 'M6 32 H56', C.woodL, 2, { flat: true });
    part(I, 'M55 29 L63 32 L55 35 Z', '#cfd6dc', { sd: 0.6, hd: 0.4 });
    part(I, 'M4 32 L10 27 H14 L9 32 L14 37 H10 Z', '#e25b4a', { sd: 0.6, hd: 0.4 });
  });
};
D.cannon = (I) => {
  part(I, 'M10 22 C10 16 16 14 22 16 L54 26 C58 27 60 31 58 35 C57 38 54 39 51 38 L18 32 C13 31 10 27 10 22 Z', '#3f444c', { sd: 2, hd: 1.4 });
  part(I, ellipse(57, 32, 3.4, 5.4, -0.2), '#23262c', { sd: 0, hd: 0 });
  part(I, circle(26, 42, 11), C.wood, { sd: 2, hd: 1.4 });
  part(I, circle(26, 42, 3.4), C.brass, { sd: 0.6, hd: 0.4 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ln(I, `M${26 + Math.cos(a) * 4} ${42 + Math.sin(a) * 4} L${26 + Math.cos(a) * 9.5} ${42 + Math.sin(a) * 9.5}`, C.woodD, 1.6); }
};

// --------------------------------------------------------------- staffs
D.staff = (I, o = {}) => {
  const col = o.color || C.wood;
  tube(I, 'M9 55 L55 9', col, 5.4);
  tube(I, 'M8 56 L13.5 50.5', o.cap || '#8f9aa3', 6.2);
  tube(I, 'M50.5 13.5 L56 8', o.cap || '#8f9aa3', 6.2);
  tube(I, 'M27 37 L37 27', o.grip || '#b3382c', 6.4);
  if (!I.small) for (const t of [0.25, 0.5, 0.75]) { const x = 27 + t * 10, y = 37 - t * 10; ln(I, `M${x - 2.4} ${y - 2.4} L${x + 2.4} ${y + 2.4}`, dk(o.grip || '#b3382c', 0.4), 1); }
};
D.climaTact = (I, o = {}) => {
  const bar = o.color || '#3d7fc9', joint = o.joint || '#f2efe6', knob = o.knob || C.gold;
  tube(I, 'M11 53 L24 40', bar, 5.2); tube(I, 'M27 37 L37 27', bar, 5.2); tube(I, 'M40 24 L53 11', bar, 5.2);
  part(I, circle(25.5, 38.5, 3.8), joint, { sd: 0.8, hd: 0.6 }); part(I, circle(38.5, 25.5, 3.8), joint, { sd: 0.8, hd: 0.6 });
  part(I, circle(9, 55, 4.8), knob, { sd: 1, hd: 0.8 });
  if (o.orb) {
    part(I, circle(54, 10, 7.5), o.orb, { sd: 1.4, hd: 1, gloss: [51.5, 7.5, 2.2, 1.2, 0.85] });
    part(I, 'M22 6 L30 5 L25 12 L31 12 L19 24 L23 15 L17 15 Z', '#ffe36b', { sd: 0.8, hd: 0.5 });
  } else {
    part(I, circle(55, 9, 4.8), knob, { sd: 1, hd: 0.8 });
    part(I, 'M12 22 C10 16 16 12 21 15 C23 10 31 10 33 16 C38 15 41 20 38 24 C36 26 14 26 12 22 Z', '#eef3f7', { sd: 1.4, shT: 0.2, hd: 1 });
  }
};

// ----------------------------------------------------------------- axes
D.axe = (I, o = {}) => {
  const head = o.head || '#cfd8df', handle = o.handle || C.wood;
  tube(I, 'M17 59 C22 44 31 25 40 7', handle, 5);
  const blade = 'M36 11 C30 6 21 5 13 9 C12 17 14 26 19 32 C24 28 30 24 38 22 Z';
  part(I, blade, head, { sd: 1.8, hd: 1.2 });
  clip(I, blade, () => fl(I, 'M13 9 C12 17 14 26 19 32 L15 34 L8 8 Z', '#f4f8fb', { a: 0.95 }));
  part(I, 'M34 10.5 L43 13 L40 23.5 L32 21.5 Z', dk(head, 0.25), { sd: 1, hd: 0.8 });
  part(I, circle(38, 17, 1.6), C.brass, { sd: 0, hd: 0, ol: I.ol * 0.5 });
};
D.battleAxe = (I, o = {}) => {
  const head = o.head || '#c8d2da', handle = o.handle || '#6e4526', trim = o.trim || C.gold;
  tf(I, { r: 0.42, s: 0.84, y: 3 }, () => {
    tube(I, 'M32 64 L32 6', handle, 5.8);
    const L = 'M28 12 C22 7 13 6 6 9 C4 16 4 26 6 33 C13 36 22 35 28 30 Z';
    const R = 'M36 12 C42 7 51 6 58 9 C60 16 60 26 58 33 C51 36 42 35 36 30 Z';
    for (const b of [L, R]) { part(I, b, head, { sd: 1.8, hd: 1.2 }); }
    clip(I, L, () => fl(I, 'M6 9 C4 16 4 26 6 33 L2 34 L2 8 Z', '#f4f8fb', { a: 0.95 }));
    clip(I, R, () => fl(I, 'M58 9 C60 16 60 26 58 33 L63 34 L63 8 Z', dk(head, 0.12)));
    part(I, rrect(26.5, 8, 11, 26, 2.5), trim, { sd: 1, hd: 0.8 });
    if (!I.small) for (const y of [13, 21, 29]) part(I, circle(32, y, 1.3), dk(trim, 0.3), { sd: 0, hd: 0, ol: 0 });
    part(I, rrect(28.5, 55, 7, 7, 2), trim, { sd: 0.6, hd: 0.4 });
  });
};
D.axeHand = (I) => {
  const blade = 'M34 9 C27 3 16 3 8 8 C7 17 10 27 16 33 C21 28 28 24 37 22 Z';
  const bracer = 'M30 20 L44 12 L60 44 C61 50 56 56 50 56 C46 56 44 54 42 51 Z';
  part(I, bracer, '#6d7880', { sd: 2.2, hd: 1.4 });
  clip(I, bracer, () => { for (const d of ['M33 26 L47 18', 'M40 40 L54 32']) ln(I, d, '#3f474e', 2.2, { a: 0.8 }); });
  if (!I.small) for (const [x, y] of [[41, 23], [47, 34], [52, 45]]) part(I, circle(x, y, 1.6), '#c3ccd3', { sd: 0, hd: 0, ol: I.ol * 0.6 });
  part(I, blade, '#cfd8df', { sd: 1.8, hd: 1.2 });
  clip(I, blade, () => fl(I, 'M8 8 C7 17 10 27 16 33 L12 35 L4 6 Z', '#f4f8fb', { a: 0.95 }));
  part(I, 'M32 8 L41 11 L38 23 L29 20.5 Z', '#8e99a2', { sd: 1, hd: 0.8 });
};
D.mallet = (I, o = {}) => {
  tube(I, 'M14 58 L40 20', o.handle || C.woodL, 4.6);
  tf(I, { r: 0.6, ox: 42, oy: 16 }, () => {
    part(I, rrect(26, 8, 32, 17, 4), o.head || '#a8703f', { sd: 2, hd: 1.4 });
    for (const x of [28, 52]) part(I, rrect(x, 7, 4, 19, 1.2), o.band || '#5b6770', { sd: 0.8, hd: 0.6 });
  });
};

// ------------------------------------------------------------ emblems
function skull(I, x, y, r, col = '#f4f1ea', bones = true) {
  if (bones) {
    tube(I, `M${x - r * 1.45} ${y - r * 0.45} L${x + r * 1.45} ${y + r * 1.5}`, col, r * 0.46, { flat: true });
    tube(I, `M${x + r * 1.45} ${y - r * 0.45} L${x - r * 1.45} ${y + r * 1.5}`, col, r * 0.46, { flat: true });
  }
  part(I, union(circle(x, y, r), rrect(x - r * 0.55, y + r * 0.35, r * 1.1, r * 0.85, r * 0.28)), col, { sd: r * 0.22, hd: r * 0.16 });
  fl(I, circle(x - r * 0.38, y + r * 0.08, r * 0.27), OUT); fl(I, circle(x + r * 0.38, y + r * 0.08, r * 0.27), OUT);
  fl(I, poly([[x, y + r * 0.42], [x - r * 0.13, y + r * 0.62], [x + r * 0.13, y + r * 0.62]]), OUT);
}
function gull(I, x, y, w, col, o = {}) {
  const d = `M${x - w} ${y + w * 0.12} C${x - w * 0.62} ${y - w * 0.5} ${x - w * 0.22} ${y - w * 0.42} ${x} ${y + w * 0.12} C${x + w * 0.22} ${y - w * 0.42} ${x + w * 0.62} ${y - w * 0.5} ${x + w} ${y + w * 0.12} C${x + w * 0.55} ${y - w * 0.12} ${x + w * 0.25} ${y + w * 0.05} ${x} ${y + w * 0.55} C${x - w * 0.25} ${y + w * 0.05} ${x - w * 0.55} ${y - w * 0.12} ${x - w} ${y + w * 0.12} Z`;
  part(I, d, col, { sd: w * 0.08, hd: w * 0.06, ol: o.ol ?? I.ol * 0.6 });
}
/** Brilliant-cut gem seen from the side, crown up. */
function gem(I, x, y, r, col, o = {}) {
  const p = poly([[x - r, y - r * 0.2], [x - r * 0.55, y - r * 0.78], [x + r * 0.55, y - r * 0.78], [x + r, y - r * 0.2], [x, y + r * 0.95]]);
  part(I, p, col, { sd: r * 0.3, hd: r * 0.2, ol: o.ol });
  if (r > 4 && !I.small) {
    const f = lt(col, 0.55);
    ln(I, `M${x - r} ${y - r * 0.2} H${x + r} M${x - r * 0.55} ${y - r * 0.78} L${x - r * 0.3} ${y - r * 0.2} L${x} ${y + r * 0.95} L${x + r * 0.3} ${y - r * 0.2} L${x + r * 0.55} ${y - r * 0.78}`, f, Math.max(0.7, r * 0.09), { a: 0.75 });
  }
  gloss(I, x - r * 0.35, y - r * 0.45, r * 0.22, r * 0.14, 0.9, 0);
}
const GEM_RULES = [
  [/ruby|red|blood|flame|fire|crimson|garnet/, '#d7263d'], [/sapphire|blue|sea\b|ocean|aqua|water|azure/, '#2f78d6'],
  [/emerald|green|jade|leaf|forest/, '#2fae66'], [/amethyst|purple|violet/, '#8e4fd1'], [/topaz|amber|gold|sun|yellow/, '#f0a52a'],
  [/pearl|white|moon|shell/, '#f3efe6'], [/diamond|crystal|ice|clear|glass/, '#bfefff'], [/kairoseki|seastone/, '#5f8a8f'],
  [/onyx|black|shadow|dark|obsidian/, '#3a3440'], [/pink|rose|love|heart|coral/, '#f06aa0'],
];
function gemOf(name, id, fallback = true) {
  for (const [re, c] of GEM_RULES) if (re.test(name)) return c;
  return fallback ? ['#d7263d', '#2f78d6', '#2fae66', '#8e4fd1', '#f0a52a'][hash(id || name) % 5] : null;
}
function metalOf(name) {
  if (/silver|steel|iron|platinum|kairoseki|seastone/.test(name)) return '#c9d1d8';
  if (/bronze|copper|brass/.test(name)) return '#c47f3f';
  if (/bone|ivory/.test(name)) return C.bone;
  if (/wood/.test(name)) return C.woodL;
  return C.gold;
}
/** Points along a cubic bezier. */
function bez(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}

// ----------------------------------------------------------------- hats
D.strawHat = (I, o = {}) => {
  const straw = o.color || '#f0cd62', band = o.band || '#c8372d';
  const brim = ellipse(32, 41, 29.5, 11);
  part(I, brim, straw, { sd: 2.4, hd: 1.6 });
  if (!I.small) clip(I, brim, () => { for (const r of [0.62, 0.84]) ln(I, ellipse(32, 41, 29.5 * r + 2, 11 * r + 1), dk(straw, 0.3), 1, { a: 0.5 }); });
  const crown = 'M16 41 C15 27 22 17.5 32 17.5 C42 17.5 49 27 48 41 C42 44.5 22 44.5 16 41 Z';
  part(I, crown, lt(straw, 0.12), { sd: 3, hd: 2 });
  clip(I, crown, () => part(I, 'M12 32.5 C22 36.5 42 36.5 52 32.5 L52 48 L12 48 Z', band, { sd: 1.4, hd: 1, ol: I.ol * 0.8 }));
  if (!I.small) clip(I, crown, () => { for (const x of [22, 28, 36, 42]) ln(I, `M${x} 18 C${x + (x - 32) * 0.1} 24 ${x + (x - 32) * 0.1} 28 ${x + (x - 32) * 0.18} 33`, dk(straw, 0.25), 0.9, { a: 0.45 }); });
};
D.tricorne = (I, o = {}) => {
  const col = o.color || '#302b35', trim = o.trim || '#e0b24a';
  part(I, 'M20 27 C22 18 26.5 13 32 13 C37.5 13 42 18 44 27 Z', dk(col, 0.1), { sd: 1.6, hd: 1.2, hi: lt(col, 0.3) });
  const brim = 'M3 29 C10 32 16 28 22 22 C26 18.5 29 17 32 17 C35 17 38 18.5 42 22 C48 28 54 32 61 29 C58 38 52 44 44 45 C40 45.5 36 46.5 32 50 C28 46.5 24 45.5 20 45 C12 44 6 38 3 29 Z';
  part(I, brim, col, { sd: 2.6, hd: 1.8, hi: lt(col, 0.35) });
  clip(I, brim, () => ln(I, 'M3 29 C10 32 16 28 22 22 C26 18.5 29 17 32 17 C35 17 38 18.5 42 22 C48 28 54 32 61 29', trim, 3.4));
  if (!I.small) ln(I, 'M14 38 C22 36 28 37 32 41 C36 37 42 36 50 38', lt(col, 0.18), 1.2, { a: 0.8 });
  part(I, circle(32, 40, 3), trim, { sd: 0.6, hd: 0.5 });
};
D.captainHat = (I, o = {}) => {
  const col = o.color || '#2c2831', trim = o.trim || '#e0b24a';
  part(I, 'M43 22 C47 11 55 5 62 6 C61 13 55 21 47 26 Z', o.plume || '#c8372d', { sd: 1.4, hd: 1 });
  if (!I.small) ln(I, 'M46 23 C50 16 55 10 60 7.5', lt(o.plume || '#c8372d', 0.4), 1, { a: 0.8 });
  part(I, 'M17 34 C16 20 23 10.5 32 10.5 C41 10.5 48 20 47 34 Z', col, { sd: 2.4, hd: 1.8, hi: lt(col, 0.35) });
  const brim = 'M3 38 C10 30 20 28 32 28 C44 28 54 30 61 38 C56 46 44 44 32 48.5 C20 44 8 46 3 38 Z';
  part(I, brim, col, { sd: 2.4, hd: 1.8, hi: lt(col, 0.35) });
  clip(I, brim, () => ln(I, brim, trim, 3.2));
  skull(I, 32, 19, 5.4);
};
D.cowboyHat = (I, o = {}) => {
  const col = o.color || '#9a6a3f';
  const crown = 'M18 37 C16.5 26 18.5 14 24.5 12.5 C27.5 12 29 16.5 32 16.5 C35 16.5 36.5 12 39.5 12.5 C45.5 14 47.5 26 46 37 C40 40.5 24 40.5 18 37 Z';
  part(I, crown, lt(col, 0.08), { sd: 2.6, hd: 2 });
  clip(I, crown, () => part(I, 'M12 29.5 C24 33 40 33 52 29.5 L52 44 L12 44 Z', o.band || dk(col, 0.55), { sd: 1, hd: 0.8, ol: I.ol * 0.8 }));
  if (!I.small) ln(I, 'M32 17 C31 21 31.5 25 32.5 29', dk(col, 0.35), 1.2, { a: 0.8 });
  part(I, 'M3 33 C5 28 12 30 17 33.5 C24 38 40 38 47 33.5 C52 30 59 28 61 33 C62 42 49 49 32 49 C15 49 2 42 3 33 Z', col, { sd: 2.4, hd: 1.8 });
};
D.fedora = (I, o = {}) => {
  const col = o.color || '#39424c';
  const crown = 'M16 39 C15 28 17 18 22.5 15 C26 13 29 17 32 17 C35 17 38 13 41.5 15 C47 18 49 28 48 39 C42 42 22 42 16 39 Z';
  part(I, crown, col, { sd: 2.6, hd: 2, hi: lt(col, 0.35) });
  clip(I, crown, () => part(I, 'M12 31 C24 34 40 34 52 31 L52 44 L12 44 Z', o.band || '#1d1a20', { sd: 1, hd: 0.6, ol: I.ol * 0.8 }));
  if (!I.small) ln(I, 'M32 18 C30.5 22 31 26 32 30', dk(col, 0.4), 1.2, { a: 0.8 });
  part(I, 'M4 40 C8 34 17 35 22 36.5 C28 38 36 38 42 36.5 C47 35 56 34 60 40 C58 46 46 49 32 49 C18 49 6 46 4 40 Z', dk(col, 0.08), { sd: 2.2, hd: 1.6, hi: lt(col, 0.3) });
};
D.marineCap = (I, o = {}) => {
  const crown = o.color || '#f6f5f0', band = o.band || '#27466e';
  const top = 'M6 22 C6 14 20 10 32 10 C44 10 58 14 58 22 C58 27 50 32 46 34 L18 34 C14 32 6 27 6 22 Z';
  part(I, top, crown, { sd: 2.6, shT: 0.2, hd: 2 });
  part(I, 'M15 31 C24 33.5 40 33.5 49 31 L49 41 C40 43.5 24 43.5 15 41 Z', band, { sd: 1.4, hd: 1 });
  part(I, 'M14 40.5 C22 44.5 42 44.5 50 40.5 C49 48 42 52 32 52 C22 52 15 48 14 40.5 Z', o.visor || '#1d1a20', { sd: 1.6, hd: 1.2, hi: '#6b6478' });
  if (o.emblem !== false) gull(I, 32, 22.5, 8, '#2f5f96');
};
D.topHat = (I, o = {}) => {
  const col = o.color || '#f190b7';
  part(I, ellipse(32, 48, 24, 7.5), dk(col, 0.08), { sd: 1.8, hd: 1.2 });
  const crown = 'M16.5 47 C15.5 36 16 22 18.5 13 C24 10 40 10 45.5 13 C48 22 48.5 36 47.5 47 C41.5 50.5 22.5 50.5 16.5 47 Z';
  part(I, crown, col, { sd: 3, hd: 2 });
  clip(I, crown, () => part(I, 'M12 39 C22 42 42 42 52 39 L52 52 L12 52 Z', o.band || dk(col, 0.25), { sd: 1, hd: 0.8, ol: I.ol * 0.8 }));
  if (o.cross !== false) { tube(I, 'M26.5 20 L37.5 31', '#ffffff', 3.4, { ol: I.ol * 0.8, flat: true }); tube(I, 'M37.5 20 L26.5 31', '#ffffff', 3.4, { ol: I.ol * 0.8, flat: true }); }
  part(I, ellipse(32, 12.4, 13.4, 3), lt(col, 0.18), { sd: 0.8, hd: 0.6 });
};
D.goggles = (I, o = {}) => {
  const lens = o.lens || '#f0a53a', frame = o.frame || '#c9a04a', strap = o.strap || '#6b4a32';
  tube(I, 'M5 40 C3 25 17 18 32 18 C47 18 61 25 59 40', strap, 5.5);
  for (const x of [19.5, 44.5]) {
    part(I, circle(x, 38, 12), frame, { sd: 1.6, hd: 1.2 });
    part(I, circle(x, 38, 8), lens, { sd: 2, hd: 1.4, ol: I.ol * 0.8, gloss: [x - 3, 34.5, 2.6, 1.5, 0.85] });
  }
  tube(I, 'M30 37 C31 34.5 33 34.5 34 37', frame, 3.2);
};
D.glasses = (I, o = {}) => {
  const lens = o.lens || '#3a3440', frame = o.frame || '#2b2631';
  tube(I, 'M8 30 L4 26 M56 30 L60 26', frame, 2.2);
  for (const x of [20, 44]) part(I, ellipse(x, 34, 11, 8), lens, { sd: 1.6, hd: 1.2, hi: '#8fb3d9', gloss: [x - 4, 31, 2.8, 1.3, 0.8] });
  tube(I, 'M30 32 C31 30 33 30 34 32', frame, 2.4);
};
D.bandana = (I, o = {}) => {
  const col = o.color || '#2f5f96';
  part(I, 'M11 42 L3 53 L10.5 52 L12 58.5 L18 45 Z', dk(col, 0.12), { sd: 1.2, hd: 0.8 });
  const cap = 'M9 43 C8 26 18 13 32 13 C46 13 56 26 55 43 C44 38.5 20 38.5 9 43 Z';
  part(I, cap, col, { sd: 3, hd: 2 });
  if (o.dots !== false && !I.small) clip(I, cap, () => { for (const [x, y] of [[23, 21], [32, 17.5], [41, 21], [18, 30], [27, 27], [37, 27], [46, 30], [24, 35], [40, 35], [32, 33]]) fl(I, circle(x, y, 1.5), '#ffffff', { a: 0.85 }); });
  part(I, 'M8 42 C20 37 44 37 56 42 L55 48 C44 43.5 20 43.5 9 48 Z', dk(col, 0.18), { sd: 1, hd: 0.8 });
  part(I, circle(12.5, 45, 4.4), dk(col, 0.08), { sd: 1, hd: 0.8 });
};
D.headband = (I, o = {}) => {
  const col = o.color || '#2e2a31';
  const ring = new Path2D(); ring.addPath(ellipse(32, 36, 26, 13)); ring.addPath(ellipse(32, 32, 21.5, 8.2));
  part(I, ring, col, { rule: 'evenodd', sd: 2.2, hd: 1.4, hi: lt(col, 0.4) });
  part(I, 'M51 41 L63 52 L58.5 55.5 L48.5 44.5 Z', col, { sd: 1.2, hd: 0.8, hi: lt(col, 0.4) });
  part(I, 'M49 43 L53 60 L47.5 60.5 L45.5 45.5 Z', dk(col, 0.1), { sd: 1.2, hd: 0.8, hi: lt(col, 0.4) });
  part(I, ellipse(49.5, 42, 5.2, 4.2, 0.4), col, { sd: 1, hd: 0.8, hi: lt(col, 0.4) });
  if (o.emblem) { part(I, circle(32, 45, 4.6), '#f4f1ea', { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 }); part(I, circle(32, 45, 2.4), o.emblem, { sd: 0, hd: 0, ol: 0 }); }
};
D.hornHelm = (I, o = {}) => {
  const metal = o.metal || '#aab5bd', horn = o.horn || '#efe4c8', trim = o.trim || '#8a6a44';
  if (o.horns !== false) {
    part(I, 'M18 31 C9 29 3.5 19 6 6 C9 14 14 19.5 22 21.5 Z', horn, { sd: 1.6, hd: 1.2 });
    part(I, 'M46 31 C55 29 60.5 19 58 6 C55 14 50 19.5 42 21.5 Z', horn, { sd: 1.6, hd: 1.2 });
  }
  part(I, 'M13 43 C13 26 21 15 32 15 C43 15 51 26 51 43 Z', metal, { sd: 2.8, hd: 2 });
  part(I, rrect(29.3, 14.5, 5.4, 27, 2), trim, { sd: 0.8, hd: 0.6 });
  part(I, 'M11 38.5 C22 41.5 42 41.5 53 38.5 L53 46 C42 49 22 49 11 46 Z', trim, { sd: 1.2, hd: 1 });
  if (!I.small) for (const x of [16, 24, 40, 48]) part(I, circle(x, 43.5, 1.3), lt(trim, 0.5), { sd: 0, hd: 0, ol: 0 });
  part(I, 'M29.5 46 H34.5 L33.6 55 H30.4 Z', metal, { sd: 0.8, hd: 0.5 });
};
D.mask = (I, o = {}) => {
  const col = o.color || '#2a2630', trim = o.trim || '#e0b24a';
  if (o.eye) {
    part(I, 'M50 24 C53 13 58 7 63 4 C62.5 12 58 21 52 27 Z', o.feather || '#f06aa0', { sd: 1.2, hd: 0.8 });
    const m = 'M4 28 C10 21 20 21 26 25.5 C29 27.5 35 27.5 38 25.5 C44 21 54 21 60 28 C58.5 38.5 50 44 42 42 C37 40.5 34.5 37 32 37 C29.5 37 27 40.5 22 42 C14 44 5.5 38.5 4 28 Z';
    part(I, m, col, { sd: 2, hd: 1.4, hi: lt(col, 0.35) });
    clip(I, m, () => ln(I, m, trim, 2.8));
    fl(I, ellipse(18, 31.5, 6.2, 3.8, 0.15), OUT); fl(I, ellipse(46, 31.5, 6.2, 3.8, -0.15), OUT);
    tube(I, 'M32 44 L32 60', C.woodL, 2.4);
  } else {
    const f = 'M14 12 C20 6 44 6 50 12 C55 24 53 42 42 53 C38 57 26 57 22 53 C11 42 9 24 14 12 Z';
    part(I, f, col, { sd: 2.6, hd: 2, hi: lt(col, 0.4) });
    for (const [x, r] of [[23, 0.2], [41, -0.2]]) { part(I, ellipse(x, 29, 6.4, 4.2, r), '#f4f1ea', { sd: 0, hd: 0, ol: I.ol * 0.6 }); fl(I, ellipse(x, 29.6, 4.2, 2.5, r), OUT); }
    if (!I.small) { ln(I, 'M32 11 V22', '#f4f1ea', 2); ln(I, 'M26 45 C30 47 34 47 38 45', '#f4f1ea', 1.6); }
  }
};
D.crownHat = (I, o = {}) => {
  const gold = o.color || C.gold;
  const c = 'M9 46 L6 18 L19 30 L25 12 L32 26 L39 12 L45 30 L58 18 L55 46 Z';
  part(I, c, gold, { sd: 2.4, hd: 1.8 });
  part(I, rrect(8, 42, 48, 9, 2), dk(gold, 0.08), { sd: 1.4, hd: 1 });
  for (const [x, cc] of [[20, '#d7263d'], [32, '#2f78d6'], [44, '#2fae66']]) gem(I, x, 46.5, 3.2, cc, { ol: I.ol * 0.6 });
  for (const [x, y] of [[6, 18], [25, 12], [39, 12], [58, 18]]) part(I, circle(x, y, 2.6), '#f3efe6', { sd: 0.5, hd: 0.3 });
};
D.beanie = (I, o = {}) => {
  const col = o.color || '#c8372d';
  part(I, circle(32, 12, 5.5), '#f4f1ea', { sd: 1, hd: 0.8 });
  part(I, 'M11 44 C10 27 19 15 32 15 C45 15 54 27 53 44 Z', col, { sd: 2.8, hd: 2 });
  if (!I.small) clip(I, 'M11 44 C10 27 19 15 32 15 C45 15 54 27 53 44 Z', () => { for (const x of [20, 26, 32, 38, 44]) ln(I, `M${x} 16 C${x + (x - 32) * 0.2} 28 ${x + (x - 32) * 0.3} 36 ${x + (x - 32) * 0.3} 44`, dk(col, 0.25), 1.2, { a: 0.6 }); });
  part(I, rrect(9, 40, 46, 11, 4), dk(col, 0.1), { sd: 1.4, hd: 1 });
};
D.halo = (I) => {
  const r = new Path2D(); r.addPath(ellipse(32, 30, 24, 10)); r.addPath(ellipse(32, 30, 17, 5.6));
  alpha(I, 0.35, () => fl(I, ellipse(32, 30, 29, 14), '#fff3b0'));
  part(I, r, '#ffe27a', { rule: 'evenodd', sd: 1.4, hd: 1 });
};

// ---------------------------------------------------------------- coats
D.marineCoat = (I, o = {}) => {
  const col = o.color || '#f6f4ee', stripe = o.stripe || '#25324b';
  part(I, 'M11 15 C7.5 26 6 40 6.5 54 L14 55 C14 43 15 31 17.5 21 Z', dk(col, 0.1), { sd: 1.6, shT: 0.2, hd: 1 });
  part(I, 'M53 15 C56.5 26 58 40 57.5 54 L50 55 C50 43 49 31 46.5 21 Z', dk(col, 0.1), { sd: 1.6, shT: 0.2, hd: 1 });
  const body = 'M17 11 C22 9 27 9.5 32 9.5 C37 9.5 42 9 47 11 L52 17 C53.5 30 54 44 53.5 59 C46 60.5 39 61 32 61 C25 61 18 60.5 10.5 59 C10 44 10.5 30 12 17 Z';
  part(I, body, col, { sd: 3, shT: 0.22, hd: 2 });
  clip(I, body, () => {
    part(I, 'M4 19.5 C20 22.5 44 22.5 60 19.5 L60 30 C44 33 20 33 4 30 Z', stripe, { sd: 1.2, hd: 0.8, ol: I.ol * 0.7 });
    if (!I.small) { for (const x of [21, 29, 37]) fl(I, rrect(x, 23, 5.6, 5.4, 0.8), lt(stripe, 0.18)); ln(I, 'M32 33 V61', dk(col, 0.22), 1.2, { a: 0.8 }); }
  });
  part(I, 'M20 11.5 C25 14.5 39 14.5 44 11.5 L42.5 5.5 C37.5 7.5 26.5 7.5 21.5 5.5 Z', dk(col, 0.06), { sd: 1, shT: 0.2, hd: 0.8 });
  for (const [x, r] of [[13.5, -0.4], [50.5, 0.4]]) {
    part(I, ellipse(x, 14, 7, 3.8, r), C.gold, { sd: 1, hd: 0.8 });
    if (!I.small) for (let i = -2; i <= 2; i++) ln(I, `M${x + i * 2.3} ${16.2 + (x < 32 ? -i : i) * 0.7} v4`, C.gold, 1.4);
  }
};
/** Front-view long coat. o.color, o.trim (false = none), o.fur, o.feather, o.stripes, o.inner */
D.coat = (I, o = {}) => {
  const col = o.color || '#223f66', trim = o.trim === undefined ? C.gold : o.trim, inner = o.inner || '#f1ebdc';
  const sl = dk(col, 0.1);
  if (!o.vest) {
    part(I, 'M13 15 L5 45 L13.5 48 L19 27 Z', sl, { sd: 1.6, hd: 1, hi: lt(col, 0.35) });
    part(I, 'M51 15 L59 45 L50.5 48 L45 27 Z', sl, { sd: 1.6, hd: 1, hi: lt(col, 0.35) });
  }
  const body = 'M20 9 L27 7 L32 14 L37 7 L44 9 L52 14 C54 28 54.5 44 53 58 H11 C9.5 44 10 28 12 14 Z';
  part(I, body, col, { sd: 3, hd: 2, hi: lt(col, 0.35) });
  clip(I, body, () => {
    if (o.stripes && !I.small) for (let x = 14; x < 54; x += 4.5) ln(I, `M${x} 8 L${x + (x - 32) * 0.05} 60`, lt(col, 0.3), 0.8, { a: 0.8 });
    if (o.quilted && !I.small) for (let i = -6; i <= 6; i++) { ln(I, `M${10 + i * 7} 8 L${40 + i * 7} 60`, dk(col, 0.3), 0.9, { a: 0.7 }); ln(I, `M${54 - i * 7} 8 L${24 - i * 7} 60`, dk(col, 0.3), 0.9, { a: 0.7 }); }
    if (o.laces && !I.small) for (const y of [24, 31, 38, 45]) ln(I, `M28 ${y} L36 ${y + 4} M36 ${y} L28 ${y + 4}`, o.laces, 1.1);
    fl(I, 'M31.2 16 H32.8 V60 H31.2 Z', dk(col, 0.45));
    if (trim) { ln(I, 'M32 17 V60', trim, 1.6); fl(I, rrect(8, 54, 48, 6, 0), trim); }
  });
  part(I, 'M27 7 L32 14 L37 7 L35.5 24 H28.5 Z', inner, { sd: 1, shT: 0.2, hd: 0.6 });
  part(I, 'M27 7 L21.5 10 L25.5 27 L31.5 17 Z', lt(col, 0.1), { sd: 1, hd: 0.8, hi: lt(col, 0.4) });
  part(I, 'M37 7 L42.5 10 L38.5 27 L32.5 17 Z', lt(col, 0.1), { sd: 1, hd: 0.8, hi: lt(col, 0.4) });
  if (trim) { ln(I, 'M27 7.5 L21.8 10.3 L25.5 26', trim, 1.3); ln(I, 'M37 7.5 L42.2 10.3 L38.5 26', trim, 1.3); }
  if (trim && !I.small) for (const y of [31, 38, 45]) { part(I, circle(28.2, y, 1.5), trim, { sd: 0, hd: 0, ol: I.ol * 0.5 }); part(I, circle(35.8, y, 1.5), trim, { sd: 0, hd: 0, ol: I.ol * 0.5 }); }
  if (o.fur) {
    const f = o.fur === true ? lt(col, 0.35) : o.fur;
    part(I, union(circle(15, 12, 6), circle(22, 9.5, 6), circle(28.5, 11, 5), circle(35.5, 11, 5), circle(42, 9.5, 6), circle(49, 12, 6), circle(12, 18, 5), circle(52, 18, 5)), f, { sd: 1.6, hd: 1.2 });
  }
  if (o.feather) {
    const f = o.feather;
    const scal = [];
    for (let i = 0; i < 9; i++) scal.push(ellipse(12 + i * 5, 11 + Math.abs(i - 4) * 0.8, 3.6, 6, (i - 4) * 0.12));
    for (const [x, y] of [[9, 18], [55, 18], [8, 25], [56, 25]]) scal.push(ellipse(x, y, 3.6, 6, 0));
    part(I, union(...scal), f, { sd: 1.4, hd: 1, hi: lt(f, 0.4) });
  }
};
D.cloak = (I, o = {}) => {
  const col = o.color || '#b71c1c', short = !!o.short;
  const bottom = short ? 48 : 57;
  const body = `M22 10 C26 8 38 8 42 10 L46 16 C52 28 56 ${bottom - 12} 59 ${bottom} C49 ${bottom + 3} 15 ${bottom + 3} 5 ${bottom} C8 ${bottom - 12} 12 28 18 16 Z`;
  part(I, body, col, { sd: 3, hd: 2, hi: lt(col, 0.4) });
  clip(I, body, () => {
    fl(I, `M29 16 L26 ${bottom + 4} H38 L35 16 Z`, dk(col, 0.45));
    if (!I.small) for (const d of [`M24 20 L16 ${bottom}`, `M40 20 L48 ${bottom}`]) ln(I, d, dk(col, 0.3), 1.3, { a: 0.8 });
    if (o.trim) fl(I, rrect(0, bottom - 4, 64, 8, 0), o.trim);
  });
  part(I, 'M17 15 C21 6.5 43 6.5 47 15 C42 19 22 19 17 15 Z', dk(col, 0.15), { sd: 1.2, hd: 0.9, hi: lt(col, 0.35) });
  part(I, circle(32, 16.5, 3.6), o.clasp || C.gold, { sd: 0.8, hd: 0.6 });
  if (o.crest) { part(I, circle(32, bottom - 18, 6), o.crest, { sd: 1, hd: 0.8 }); }
};
D.armor = (I, o = {}) => {
  const metal = o.color || '#aab5bd';
  if (o.samurai) {
    part(I, 'M4 20 C8 14 14 12 20 13 L22 30 C16 31 9 29 5 26 Z', dk(metal, 0.1), { sd: 1.4, hd: 1 });
    part(I, 'M60 20 C56 14 50 12 44 13 L42 30 C48 31 55 29 59 26 Z', dk(metal, 0.1), { sd: 1.4, hd: 1 });
    const b = 'M18 10 H46 L48 34 C48 36 46 37 44 37 H20 C18 37 16 36 16 34 Z';
    part(I, b, metal, { sd: 2.4, hd: 1.6 });
    for (const [y, w] of [[37, 36], [44, 38], [51, 40]]) part(I, rrect(32 - w / 2, y, w, 7.5, 2), metal, { sd: 1.2, hd: 0.8 });
    if (!I.small) { clip(I, b, () => { for (const y of [17, 24, 31]) ln(I, `M16 ${y} H48`, dk(metal, 0.4), 1.2); }); for (const x of [22, 32, 42]) ln(I, `M${x} 37 V58`, o.lace || C.gold, 1.2, { a: 0.9 }); }
    part(I, circle(32, 22, 4), o.lace || C.gold, { sd: 0.6, hd: 0.5 });
    return;
  }
  const b = 'M16 10 L26 8 C28 12.5 36 12.5 38 8 L48 10 L55 18 L50 30 L52 52 C44 58.5 20 58.5 12 52 L14 30 L9 18 Z';
  part(I, b, metal, { sd: 3, hd: 2 });
  if (o.mail) {
    if (!I.small) clip(I, b, () => { for (let y = 12; y < 60; y += 4) for (let x = 8 + ((y / 4) % 2) * 2.5; x < 58; x += 5) ln(I, ellipse(x, y, 2.2, 1.7), dk(metal, 0.35), 0.8, { a: 0.8 }); });
    part(I, 'M24 8 C27 14 37 14 40 8 L38 5 C35 9 29 9 26 5 Z', dk(metal, 0.2), { sd: 0.8, hd: 0.5 });
    return;
  }
  clip(I, b, () => { ln(I, 'M32 13 V57', lt(metal, 0.5), 2.2); ln(I, 'M13 31 C22 35 42 35 51 31', dk(metal, 0.3), 1.6); ln(I, 'M14 42 C22 46 42 46 50 42', dk(metal, 0.3), 1.6); });
  if (!I.small) for (const [x, y] of [[19, 16], [45, 16], [18, 50], [46, 50]]) part(I, circle(x, y, 1.5), C.brass, { sd: 0, hd: 0, ol: I.ol * 0.5 });
};

// ---------------------------------------------------------- accessories
D.ring = (I, o = {}) => {
  const metal = o.metal || C.gold;
  const band = new Path2D(); band.addPath(ellipse(32, 42, 18.5, 14)); band.addPath(ellipse(32, 43.5, 12.5, 8.8));
  part(I, band, metal, { rule: 'evenodd', sd: 2.4, hd: 1.6 });
  if (o.signet || !o.gem) {
    part(I, ellipse(32, 27, 12.5, 8), dk(metal, 0.12), { sd: 1.6, hd: 1.2 });
    part(I, ellipse(32, 25.5, 10.5, 6.2), metal, { sd: 1, hd: 0.8 });
    if (o.signet) part(I, 'M25 28 L24 21.5 L28.5 25 L32 20 L35.5 25 L40 21.5 L39 28 Z', dk(metal, 0.35), { sd: 0, hd: 0, ol: 0 });
    else if (!I.small) ln(I, ellipse(32, 25.5, 6, 3.4), dk(metal, 0.3), 1.1);
    return;
  }
  part(I, 'M23.5 31 L27 25 H37 L40.5 31 L36 34 H28 Z', metal, { sd: 1.2, hd: 0.8 });
  gem(I, 32, 20, 10, o.gem);
};
D.earrings = (I, o = {}) => {
  const metal = o.metal || C.gold;
  if (o.three) {
    for (const [x, y] of [[17, 18], [32, 24], [47, 18]]) {
      tube(I, `M${x} ${y - 12} C${x + 5} ${y - 12} ${x + 5} ${y - 4} ${x} ${y - 2}`, metal, 1.8, { flat: true });
      part(I, `M${x} ${y - 2} C${x + 6} ${y + 6} ${x + 7} ${y + 12} ${x + 5} ${y + 16} C${x + 3} ${y + 20} ${x - 3} ${y + 20} ${x - 5} ${y + 16} C${x - 7} ${y + 12} ${x - 6} ${y + 6} ${x} ${y - 2} Z`, metal, { sd: 1.6, hd: 1.2, gloss: [x - 2, y + 9, 1.5, 3, 0.8, 0] });
    }
    return;
  }
  for (const [x, y] of [[20, 22], [44, 28]]) {
    tube(I, `M${x} ${y - 14} C${x + 6} ${y - 14} ${x + 6} ${y - 5} ${x} ${y - 3}`, metal, 1.8, { flat: true });
    if (o.pearl) { part(I, circle(x, y + 5, 7.5), '#f3efe6', { sd: 1.8, shT: 0.25, hd: 1.2, gloss: [x - 2.5, y + 2.5, 2, 1.3, 0.9] }); part(I, rrect(x - 2.2, y - 4, 4.4, 3.5, 1), metal, { sd: 0.5, hd: 0.3 }); }
    else { const h = new Path2D(); h.addPath(circle(x, y + 7, 9)); h.addPath(circle(x, y + 7, 6)); part(I, h, metal, { rule: 'evenodd', sd: 1.2, hd: 0.8 }); gem(I, x, y + 16, 3.4, o.gem || '#d7263d', { ol: I.ol * 0.6 }); }
  }
};
D.necklace = (I, o = {}) => {
  const metal = o.metal || C.gold;
  const pts = bez([7, 7], [8, 32], [20, 45], [32, 45.5], 9).concat(bez([32, 45.5], [44, 45], [56, 32], [57, 7], 9).slice(1));
  ln(I, poly(pts, false), OUT, 3.6); ln(I, poly(pts, false), metal, 1.8);
  if (o.pearl) for (const [x, y] of pts.slice(1, -1)) part(I, circle(x, y, 3.1), '#f5f1e8', { sd: 0.9, shT: 0.25, hd: 0.6, ol: I.ol * 0.7 });
  else if (!I.small) for (const [x, y] of pts.slice(1, -1)) part(I, circle(x, y, 2), o.bead || metal, { sd: 0.5, hd: 0.3, ol: I.ol * 0.6 });
  if (o.pearl) { part(I, circle(32, 52, 7), '#f5f1e8', { sd: 1.8, shT: 0.25, hd: 1.2, gloss: [29.5, 49.5, 2, 1.3, 0.9] }); return; }
  if (o.shell) { part(I, 'M32 45 C24 46 21 52 24 58 C28 61 36 61 40 58 C43 52 40 46 32 45 Z', '#f3c6b0', { sd: 1.4, hd: 1 }); if (!I.small) for (const d of ['M32 47 V59', 'M28 48 L26 58', 'M36 48 L38 58']) ln(I, d, dk('#f3c6b0', 0.35), 1); }
  else { part(I, rrect(29.5, 43, 5, 4, 1), metal, { sd: 0.5, hd: 0.3 }); gem(I, 32, 52, 7, o.gem || '#2f78d6'); }
};
D.bracelet = (I, o = {}) => {
  const metal = o.metal || C.gold;
  const b = new Path2D(); b.addPath(ellipse(32, 35, 26, 16)); b.addPath(ellipse(32, 31.5, 18.5, 9.5));
  part(I, b, metal, { rule: 'evenodd', sd: 2.6, hd: 1.8 });
  const pts = bez([10, 40], [18, 50], [46, 50], [54, 40], 4);
  if (o.shells) { pts.forEach(([x, y], i) => part(I, `M${x} ${y - 5} C${x + 5} ${y - 4} ${x + 5} ${y + 3} ${x} ${y + 5} C${x - 5} ${y + 3} ${x - 5} ${y - 4} ${x} ${y - 5} Z`, i % 2 ? '#f6d2c0' : '#f3efe6', { sd: 1, hd: 0.7, ol: I.ol * 0.7 })); return; }
  pts.forEach(([x, y], i) => (i % 2 ? part(I, circle(x, y, 2), lt(metal, 0.3), { sd: 0.4, hd: 0.3, ol: I.ol * 0.6 }) : gem(I, x, y, 3.6, o.gem || '#2fae66', { ol: I.ol * 0.6 })));
};
D.bracer = (I, o = {}) => {
  const col = o.color || '#8a5a33';
  const b = 'M14 14 C22 10 42 10 50 14 L54 50 C44 56 20 56 10 50 Z';
  part(I, b, col, { sd: 3, hd: 2 });
  clip(I, b, () => { part(I, 'M8 12 H56 V19 C44 15 20 15 8 19 Z', dk(col, 0.2), { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 }); part(I, 'M8 46 C20 51 44 51 56 46 V58 H8 Z', dk(col, 0.2), { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 }); });
  if (!I.small) for (const y of [22, 29, 36, 43]) { ln(I, `M26 ${y} L38 ${y + 5} M38 ${y} L26 ${y + 5}`, o.lace || '#e9d8b0', 1.3); }
  for (const [x, y] of [[26, 22], [38, 22], [26, 46], [38, 46]]) part(I, circle(x, y, 1.4), C.brass, { sd: 0, hd: 0, ol: I.ol * 0.5 });
};
/** Wide cloth wrap (haramaki, sash): o.color, o.knot */
D.sash = (I, o = {}) => {
  const col = o.color || '#3f8f3a';
  const back = 'M6 24 C10 16 54 16 58 24 L58 30 C50 23 14 23 6 30 Z';
  part(I, back, dk(col, 0.3), { sd: 0.8, hd: 0.5 });
  const front = 'M6 26 C14 34 50 34 58 26 L58 42 C50 50 14 50 6 42 Z';
  part(I, front, col, { sd: 2.6, hd: 1.8 });
  if (o.knot) {
    part(I, 'M42 40 L50 58 L44 60 L38 44 Z', dk(col, 0.08), { sd: 1, hd: 0.8 });
    part(I, 'M44 40 L58 55 L53 59 L40 45 Z', col, { sd: 1, hd: 0.8 });
    part(I, ellipse(42, 40, 6, 5, 0.3), col, { sd: 1.2, hd: 1 });
  } else if (!I.small) clip(I, front, () => { for (let x = 8; x < 58; x += 5) ln(I, `M${x} 28 V48`, dk(col, 0.25), 1, { a: 0.7 }); });
};
/** Fist wrapped in cloth strips. */
D.wraps = (I, o = {}) => {
  const cloth = o.color || '#f1ebdc';
  part(I, 'M44 44 C52 46 58 52 60 60', cloth, { sd: 0, hd: 0, ol: 0 });
  tube(I, 'M42 46 C50 48 56 52 59 60', cloth, 4, { flat: true });
  const f = 'M14 28 C14 20 20 17 26 19 C28 15 34 14 37 17 C40 14 46 15 47 20 C51 20 53 24 52 29 L52 40 C52 50 45 55 36 55 L28 55 C19 55 14 49 14 40 Z';
  part(I, f, cloth, { sd: 3, shT: 0.22, hd: 2 });
  clip(I, f, () => { for (let i = 0; i < 8; i++) ln(I, `M10 ${18 + i * 6} L56 ${10 + i * 6}`, dk(cloth, 0.2), 1.2, { a: 0.8 }); });
  if (!I.small) for (const d of ['M26 19 L27 29', 'M37 17 L37.5 28', 'M47 20 L46.5 29']) ln(I, d, dk(cloth, 0.3), 1.2);
  part(I, 'M14 34 C19 30 28 31 33 34 C34 36.5 32 38.5 29.5 38.5 L20 39 C17 39 15 37 14 34 Z', lt(cloth, 0.1), { sd: 1, shT: 0.2, hd: 0.8 });
};
D.belt = (I, o = {}) => {
  const leather = o.color || '#7a4a2a', metal = o.metal || C.gold;
  const strap = 'M3 27 C18 23.5 46 23.5 61 27 L61 39 C46 35.5 18 35.5 3 39 Z';
  part(I, strap, leather, { sd: 1.8, hd: 1.2 });
  if (!I.small) { ln(I, 'M4 29.5 C18 26 46 26 60 29.5', lt(leather, 0.35), 0.9, { dash: [2, 1.6] }); for (const x of [46, 51, 56]) fl(I, circle(x, 32 - (x - 32) * 0.02, 1.2), OUT); }
  const bk = new Path2D(); bk.addPath(rrect(20, 18.5, 18, 27, 4)); bk.addPath(rrect(24.5, 23, 9, 18, 2));
  part(I, bk, metal, { rule: 'evenodd', sd: 1.6, hd: 1.2 });
  tube(I, 'M24.5 31.5 H38', '#c9d1d8', 2.2, { flat: true });
};
D.glove = (I, o = {}) => {
  const col = o.color || '#8e5a30';
  if (o.boxing) {
    const g = 'M15 32 C12 18 21 9 34 9 C47 9 55 18 53 32 C52 42 47 48 40 50 L40 55 H20 L20 48 C16.5 44 15.5 38 15 32 Z';
    part(I, g, col, { sd: 3, hd: 2, gloss: [26, 17, 5, 2.6, 0.55] });
    part(I, 'M15 32 C13 26 16 21 21 22 C25 23 26 29 24 34 C22 38 17 38 15 32 Z', dk(col, 0.05), { sd: 1.4, hd: 1 });
    part(I, rrect(17, 49, 26, 11, 3), '#f4f1ea', { sd: 1.4, shT: 0.2, hd: 1 });
    if (!I.small) ln(I, 'M26 50 L34 58 M34 50 L26 58', '#c8372d', 1.2);
    return;
  }
  const h = 'M19 58 L19 37 C15 33 11 29 13 25 C15 22 19 24 22 28 L22 14 C22 10 27 10 27 14 L27 26 L28 9.5 C28 5.5 33 5.5 33 9.5 L33 26 L34 11.5 C34 7.5 39 7.5 39 11.5 L39 27 L41 17 C41 13 46 13 46 17 L45 36 C45 44 43 50 43 58 Z';
  part(I, h, col, { sd: 2.6, hd: 1.8 });
  if (!I.small) for (const d of ['M27 26 V33', 'M33 26 V33', 'M39 27 L38.5 33']) ln(I, d, dk(col, 0.35), 1.1);
  part(I, rrect(17, 50, 28, 10, 2.5), o.cuff || dk(col, 0.25), { sd: 1.2, hd: 0.8 });
};
D.charm = (I, o = {}) => {
  const col = o.color || '#c8372d', gold = C.gold;
  tube(I, 'M28 14 C23 3 41 3 36 14', gold, 2.2, { flat: true });
  const b = 'M18 21 C18 15 24 12.5 32 12.5 C40 12.5 46 15 46 21 L46 52 C46 56 44 58 40 58 H24 C20 58 18 56 18 52 Z';
  part(I, b, col, { sd: 2.6, hd: 1.8 });
  clip(I, b, () => { if (!I.small) for (let i = -3; i <= 3; i++) { ln(I, `M${18 + i * 8} 12 L${46 + i * 8} 60`, lt(col, 0.25), 0.8, { a: 0.6 }); ln(I, `M${46 - i * 8} 12 L${18 - i * 8} 60`, lt(col, 0.25), 0.8, { a: 0.6 }); } });
  part(I, rrect(26, 22, 12, 26, 2), gold, { sd: 1, hd: 0.8 });
  if (!I.small) for (const y of [28, 34, 40]) ln(I, `M29 ${y} H35`, dk(gold, 0.4), 1.2);
  part(I, circle(32, 14, 3), gold, { sd: 0.6, hd: 0.4 });
};
D.amulet = (I, o = {}) => {
  const metal = o.metal || C.gold;
  ln(I, 'M12 4 C15 18 24 25 32 27 C40 25 49 18 52 4', OUT, 3.2); ln(I, 'M12 4 C15 18 24 25 32 27 C40 25 49 18 52 4', o.cord || '#8e5a30', 1.8);
  if (o.cage) {
    part(I, 'M32 24 C41 26 46 34 45 43 C44 51 38 57 32 59 C26 57 20 51 19 43 C18 34 23 26 32 24 Z', o.gem || '#6fd3c8', { sd: 2.4, hd: 1.6, gloss: [27, 34, 2.6, 4, 0.7, 0.3] });
    for (const d of ['M32 24 C38 32 39 50 32 59', 'M32 24 C26 32 25 50 32 59', 'M19 42 C26 45 38 45 45 42']) tube(I, d, metal, 1.8, { flat: true });
    part(I, circle(32, 24, 3), metal, { sd: 0.5, hd: 0.3 });
    return;
  }
  part(I, 'M32 25 C42 25 48 33 48 41 C48 50 40 58 32 60 C24 58 16 50 16 41 C16 33 22 25 32 25 Z', metal, { sd: 2, hd: 1.4 });
  gem(I, 32, 42, 9, o.gem || '#2f78d6');
};
D.medal = (I, o = {}) => {
  part(I, 'M20 4 H30 L36 28 H28 Z', o.marine ? '#f6f5f0' : '#2f5f96', { sd: 1, hd: 0.8 });
  part(I, 'M44 4 H34 L28 28 H36 Z', o.marine ? '#2f5f96' : '#c8372d', { sd: 1, hd: 0.8 });
  part(I, circle(32, 40, 15), o.metal || C.gold, { sd: 2.4, hd: 1.6 });
  if (o.marine) { part(I, circle(32, 40, 10), '#f6f5f0', { sd: 1, shT: 0.2, hd: 0.6, ol: I.ol * 0.7 }); gull(I, 32, 40, 7, '#2f5f96'); }
  else part(I, star(32, 40.5, 5, 9, 4), lt(o.metal || C.gold, 0.25), { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 });
};

// ------------------------------------------------------------ generic bag
D.pouch = (I, o = {}) => {
  const col = o.color || '#9a6433';
  const b = 'M20 24 C12 30 9 40 12 48 C15 55 24 58 32 58 C40 58 49 55 52 48 C55 40 52 30 44 24 Z';
  part(I, b, col, { sd: 3.6, hd: 2.2 });
  if (!I.small) clip(I, b, () => ln(I, 'M22 40 C28 44 36 44 42 40', dk(col, 0.4), 1.4, { a: 0.7 }));
  part(I, 'M22 25 C20 18 23 11 28 13 C30 9 34 9 36 13 C41 11 44 18 42 25 Z', lt(col, 0.1), { sd: 1.8, hd: 1.4 });
  tube(I, 'M19 25.5 C27 28 37 28 45 25.5', '#d9b26f', 3);
  tube(I, 'M44 26 C49 29 50 35 47 38', '#d9b26f', 2.2);
};

// ================================================================ resolver
/** id → [drawer, opts] for notable items. */
const ITEM_MAP = {
  meat: ['meat'], rice_ball: ['riceBall'], fish_stew: ['bowl', { top: 'fish' }], tangerine: ['orange'],
  sea_king_steak: ['steak'], baratie_course: ['plate'], sake: ['sake'], cola: ['barrel', { label: 'cola', hoop: '#c23b2e' }],
  p2_cola_barrel: ['barrel', { label: 'cola', hoop: '#c23b2e' }],
  bandage: ['bandage'], antidote: ['vial'], rumble_ball: ['pill'], tension_hormone: ['syringe'],
  nb_germa_antidote: ['syringe', { liquid: '#4fb3c9' }], p1_gold_ball: ['pill', { color: '#f0bf45', engrave: true }],
  sb_moqueca_stew: ['bowl', { soup: '#e2572f', top: 'veg', bowl: '#a4552c' }], p2_attack_cuisine: ['bowl', { soup: '#c9763a', top: 'bone', bowl: '#5a3b2a' }],
  oshiruko: ['bowl', { soup: '#6b2a2a', top: 'mochi', bowl: '#2d2b2f' }], sb_curry_udon: ['bowl', { soup: '#d99a2b', top: 'noodles', bowl: '#8e2f2a' }],
  p2_gourmet_platter: ['plate', { food: 'platter' }], wano_sake: ['sake', { band: '#b23a2e' }],
  // swords
  wooden_sword: ['katana', { wood: true, wrap: '#6e4526', diamond: '#a7784a', tsuba: '#3d3530', habaki: '#6e4526' }],
  rusty_katana: ['katana', { rust: true, blade: '#b7ada0', wrap: '#4d3a2c', tsuba: '#6b5a4a', habaki: '#8a6a44' }],
  cutlass: ['cutlass'], marine_saber: ['cutlass', { saber: true, wrap: '#f1ece0', guard: C.gold }],
  fine_katana: ['katana', { wrap: '#2c3b5c', tsuba: '#c9a04a' }],
  yubashiri: ['katana', { wrap: '#8a2e2a', diamond: '#f0e2c0', tsuba: '#b8bec4', habaki: '#c9a24e' }],
  shigure: ['katana', { wrap: '#2a2a33', diamond: '#b9c3cc', tsuba: '#8e9aa3', tsubaShape: 'square' }],
  sandai_kitetsu: ['katana', { wrap: '#b3261e', diamond: '#3a1a18', tsuba: '#4a3a33', hamon: 'wave', habaki: '#c9a24e' }],
  wado_ichimonji: ['katana', { wrap: '#f4f1ea', diamond: '#b9c3cc', tsuba: '#e2b64a', habaki: '#e8c35a' }],
  shusui: ['katana', { blade: '#3a3542', edge: '#8a8298', wrap: '#7a1f24', diamond: '#1f1a22', tsuba: '#d8a93f', tsubaShape: 'flower' }],
  enma: ['katana', { blade: '#5a2a33', edge: '#e0584f', wrap: '#3a1f3f', diamond: '#b7303a', tsuba: '#2b2229', aura: '#c0283a', habaki: '#b8963e' }],
  yoru: ['yoru'],
  wano_katana: ['katana', { wrap: '#3d2b5a', diamond: '#e9e1c8', tsuba: '#c9a04a' }],
  nb_shibireru: ['katana', { blade: '#f1e7a2', edge: '#fffbe0', wrap: '#2b2b33', diamond: '#f2d33a', tsuba: '#f2d33a', bolt: true }],
  p2_funkfreed: ['cutlass', { saber: true, blade: '#c9d0d6', wrap: '#8d8f9a', guard: '#9aa3ad' }],
  // guns
  slingshot: ['slingshot'], flintlock: ['flintlock'], marine_rifle: ['rifle', { bayonet: true, wood: '#7a4a2a' }],
  kabuto: ['kabuto'], kuro_kabuto: ['kabuto', { color: '#2f2b33', trim: '#c23b2e', gem: '#f2d33a' }],
  sb_scrap_flintlock: ['flintlock', { metal: '#8a6a55', wood: '#6b5040' }], p2_kuja_bow: ['bow', { snake: true }],
  // staffs & axes
  bo_staff: ['staff'], clima_tact: ['climaTact'], sorcery_clima_tact: ['climaTact', { color: '#2a3d7a', joint: '#cfd8e8', knob: '#9aa6b8', orb: '#7fd3f0' }],
  woodsman_axe: ['axe'], giant_axe: ['battleAxe'], morgan_axe: ['axeHand'], elbaf_axe: ['battleAxe', { head: '#b9c4cc', trim: '#c9a04a', handle: '#5a3a22' }],
  p2_shipwright_mallet: ['mallet'],
  // hats & coats
  straw_hat: ['strawHat'], bandana: ['bandana'], tricorne: ['tricorne'], captain_hat: ['captainHat'], cowboy_hat: ['cowboyHat'],
  marine_cap: ['marineCap'], pink_hat: ['topHat'], goggles: ['goggles'], headband: ['headband'], horned_helm: ['hornHelm', { horns: true }],
  elbaf_helm: ['hornHelm', { horns: true, metal: '#c9b27a', trim: '#7a4a2a' }], p2_carnival_mask: ['mask', { eye: true, color: '#8e24aa' }],
  marine_coat: ['marineCoat'], captain_coat: ['coat', { color: '#1f3566' }], red_cloak: ['cloak', { color: '#b71c1c' }],
  nb_corazon_coat: ['coat', { color: '#2b2630', feather: '#2b2630', trim: false, inner: '#f06aa0' }], p1_royal_cape: ['cloak', { color: '#f4f1ea', trim: C.gold, crest: '#c8372d' }],
};

/** Name keyword rules, first match wins: [regex, drawer, opts | (name, def, id) => opts, types?]. */
const NAME_RULES = [
  // ---- fruit & food
  [/coconut/, 'coconut'], [/\bapples?\b/, 'apple'], [/banana/, 'banana'], [/cherr(y|ies)/, 'cherry'], [/mango/, 'mango'],
  [/mushroom|fungus|shroom|truffle/, 'mushroom'], [/tangerine|orange|mikan|citrus|lemon|lime/, 'orange', (n) => ({ color: /lemon/.test(n) ? '#f2d33a' : /lime/.test(n) ? '#8cc63f' : undefined })],
  [/rice ?ball|onigiri/, 'riceBall'], [/steak/, 'steak'], [/\bmeat|drumstick|\bham\b|jerky/, 'meat'],
  [/pizza/, 'pizza'], [/dough?nut/, 'doughnut'], [/chocolat|cocoa bar|fudge/, 'chocolate'], [/cake|pastry|tart\b|\bpie\b|pudding|cookie|muffin/, 'cake'],
  [/ice ?cream|gelato/, 'iceCream'], [/sherbet|sorbet|shaved ice|parfait|sundae/, 'sherbet'],
  [/dango/, 'dango'], [/\boden|skewer|kebab|yakitori|kushi/, 'skewer'], [/takoyaki|octopus balls?/, 'takoyaki'],
  [/\bbuns?\b|dumpling|\bbao\b|manju|gyoza/, 'buns'], [/bread|loaf|biscuit|cracker|baguette|toast/, 'bread'],
  [/cola/, 'barrel', { label: 'cola', hoop: '#c23b2e' }], [/barrel|cask|keg/, 'barrel', { label: 'ale' }],
  [/stew|soup|curry|udon|ramen|noodle|broth|oshiruko|porridge|chowder|hot ?pot|\bnabe|gumbo|moqueca/, 'bowl', (n) => ({ top: /noodle|udon|ramen|soba/.test(n) ? 'noodles' : /fish|chowder|sea/.test(n) ? 'fish' : 'veg' })],
  [/\bsake\b/, 'sake'], [/\bwine|toroa|claret|bordeaux|champagne/, 'wine'], [/whisk|brandy|\brum\b|grog|\bgin\b|liquor|bourbon|vodka/, 'whisky'],
  [/\bale\b|beer|mead|cider|lager|stout|tankard/, 'mug'], [/\btea\b|coffee|cocoa/, 'teacup'],
  [/water|dew\b/, 'drop'], [/milk|juice|lemonade|soda/, 'bottle', (n) => ({ liquid: /milk/.test(n) ? '#f7f4ec' : '#f29a2e' })],
  [/platter|course|feast|banquet|meal|dish|plate|bento|lunch|dinner|cuisine/, 'plate', (n) => ({ food: /platter|bento|feast|banquet/.test(n) ? 'platter' : undefined })],
  [/\bfish|salmon|tuna|\beel\b|mackerel|sardine/, 'fish', {}, ['food', 'material']],
  // ---- medicine
  [/bandage|gauze|splint/, 'bandage'], [/syringe|injection|hormone|serum|vaccine/, 'syringe'],
  [/rumble|\bpill|tablet|capsule/, 'pill'], [/golden ball/, 'pill', { color: '#f0bf45', engrave: true }],
  [/salve|ointment|balm|poultice|coating|\btar\b|paste/, 'jar', (n) => ({ color: /tar\b|coating/.test(n) ? '#3a3440' : '#6fae3c' })],
  [/dandelion/, 'dandelion'],
  [/antidote|potion|elixir|tonic|remedy|medicine|draught|vial|flask/, 'vial', (n) => ({ liquid: /germa|blue/.test(n) ? '#4fb3c9' : undefined })],
  // ---- weapons
  [/\bbow\b|longbow|crossbow/, 'bow', {}, ['weapon']], [/cannon|bazooka|mortar/, 'cannon', {}, ['weapon']],
  [/mallet|hammer|\bclub\b|\bmace\b|\bbat\b|kanabo|cudgel/, 'mallet', {}, ['weapon']],
  [/rifle|musket|carbine/, 'rifle', {}, ['weapon']], [/slingshot|kabuto/, 'slingshot', {}, ['weapon']],
  [/pistol|flintlock|revolver|\bgun\b|blunderbuss/, 'flintlock', {}, ['weapon']],
  [/spear|lance|trident|halberd|naginata|glaive|\bpike\b|polearm|bisento|jitte/, 'spear', {}, ['weapon']],
  [/dagger|knife|kunai|dirk|stiletto/, 'dagger', {}, ['weapon']],
  [/cutlass|sab(er|re)|scimitar|rapier|falchion/, 'cutlass', (n) => ({ saber: /sab|rapier/.test(n) }), ['weapon']],
  [/\baxe\b|hatchet|tomahawk/, 'axe', {}, ['weapon']], [/staff|\brod\b|cane|stick|\bpole\b|clima/, 'staff', {}, ['weapon']],
  [/katana|sword|blade|tachi|wakizashi|nodachi|kitetsu/, 'katana', {}, ['weapon']],
  // ---- hats & masks
  [/mask/, 'mask', (n, d) => ({ color: d?.look?.hatColor, eye: /carnival|masquerade|domino/.test(n) }), ['hat', 'accessory', 'key', 'treasure']],
  [/fedora|trilby|bowler|gangster/, 'fedora', (n, d) => ({ color: d?.look?.hatColor })],
  [/crown|tiara|diadem/, 'crownHat', {}, ['hat', 'treasure', 'accessory']], [/halo/, 'halo', {}, ['hat']],
  [/helm|helmet/, 'hornHelm', (n) => ({ horns: /horn|elba|viking|giant/.test(n) }), ['hat']],
  [/goggle/, 'goggles'], [/glasses|spectacle|monocle|sunglass|shades/, 'glasses'],
  [/armband|headband|hachimaki|\bband\b|sweatband/, 'headband', (n, d) => ({ color: d?.look?.hatColor, emblem: /champion/.test(n) ? '#c8372d' : undefined }), ['hat', 'accessory']],
  [/bandana|kerchief|headscarf|\bscarf/, 'bandana', (n, d) => ({ color: d?.look?.hatColor })],
  [/straw hat/, 'strawHat'], [/top hat/, 'topHat', (n, d) => ({ color: d?.look?.hatColor })], [/tricorn/, 'tricorne', (n, d) => ({ color: d?.look?.hatColor })],
  [/cowboy|stetson|sombrero/, 'cowboyHat', (n, d) => ({ color: d?.look?.hatColor })], [/beanie|woolly|knit cap/, 'beanie', (n, d) => ({ color: d?.look?.hatColor })],
  // ---- coats
  [/cape|cloak|mantle|shawl|poncho/, 'cloak', (n, d) => ({ color: d?.look?.coat, short: /mantle|shawl|poncho/.test(n), trim: /royal|king|queen/.test(n) ? C.gold : undefined }), ['coat']],
  [/\bfur\b|pelt|hide coat/, 'coat', (n, d) => ({ color: d?.look?.coat, fur: true, trim: false }), ['coat']],
  [/feather/, 'coat', (n, d) => ({ color: d?.look?.coat, feather: /pink|flamingo/.test(n) ? '#f48fb1' : d?.look?.coat || '#2b2630', trim: false }), ['coat']],
  [/chain ?(shirt|mail)|\bmail\b|hauberk/, 'armor', (n, d) => ({ mail: true, color: d?.look?.coat }), ['coat']],
  [/samurai|lacquer|lamellar|\bo-?yoroi/, 'armor', (n, d) => ({ samurai: true, color: d?.look?.coat || '#8e1b16' }), ['coat']],
  [/armou?r|breastplate|cuirass|plate\b/, 'armor', (n, d) => ({ color: d?.look?.coat }), ['coat']],
  [/vest|waistcoat|jerkin|doublet|tabard/, 'coat', (n, d) => ({ color: d?.look?.coat, vest: true, trim: false, quilted: /padded|quilt/.test(n), laces: /jerkin|leather/.test(n) ? '#e9d8b0' : undefined }), ['coat']],
  [/pinstripe|\bsuit\b|tuxedo/, 'coat', (n, d) => ({ color: d?.look?.coat, stripes: true, trim: false }), ['coat']],
  // ---- accessories
  [/ear ?rings?|ear ?studs?/, 'earrings', (n, d, id) => ({ three: /three|3/.test(n), pearl: /pearl/.test(n), metal: metalOf(n), gem: gemOf(n, id) })],
  [/\brings?\b|signet/, 'ring', (n, d, id) => ({ metal: metalOf(n), gem: gemOf(n, id, false), signet: /signet|seal|king/.test(n) }), ['accessory', 'treasure']],
  [/necklace|pendant|locket|choker|beads|\bchain\b/, 'necklace', (n, d, id) => ({ pearl: /pearl/.test(n), shell: /shell|sea/.test(n), metal: metalOf(n), gem: gemOf(n, id) }), ['accessory', 'treasure']],
  [/bracer|vambrace|arm ?guard/, 'bracer'], [/haramaki|belly ?band|waistband/, 'sash'], [/\bsash\b|\bobi\b|cummerbund/, 'sash', (n) => ({ knot: true, color: /red/.test(n) ? '#c0392b' : undefined })],
  [/wraps|tape\b/, 'wraps', {}, ['accessory', 'weapon']],
  [/bracelet|bangle|armlet|wristband|anklet|\bcuff\b/, 'bracelet', (n, d, id) => ({ shells: /shell/.test(n), metal: metalOf(n), gem: gemOf(n, id) }), ['accessory', 'treasure']],
  [/\bbelt\b|girdle/, 'belt'], [/glove|gauntlet|mitt|knuckle/, 'glove', (n) => ({ boxing: /box/.test(n), color: /box/.test(n) ? '#c8372d' : undefined }), ['accessory', 'weapon']],
  [/charm|omamori|talisman|token|lucky/, 'charm', (n, d, id) => ({ color: /wood/.test(n) || /wooden/.test(d?.desc || '') ? '#a8703f' : gemOf(n, id) }), ['accessory', 'treasure', 'key']],
  [/amulet|medallion|sea.?glass|prism/, 'amulet', (n, d, id) => ({ metal: /glass|prism/.test(n) ? C.brass : metalOf(n), gem: /glass|prism/.test(n) ? '#6fd3c8' : gemOf(n, id), cage: /glass|prism|cage/.test(n) })],
  [/brooch|badge|medal|\bpin\b|emblem|honou?r/, 'medal', (n) => ({ metal: metalOf(n), marine: /marine|honou?r|navy/.test(n) }), ['accessory', 'treasure', 'key']],
  // ---- navigation, documents & keepsakes
  [/log ?pose/, 'logPose', (n) => ({ three: /three|new world|3/.test(n) })], [/eternal pose/, 'eternalPose'], [/vivre/, 'vivre'],
  [/den ?den|transponder|snail/, 'denDen'], [/handcuff|shackle|\bcuffs\b|manacle/, 'cuffs'], [/poneglyph|rubbing/, 'rubbing'],
  [/treasure map/, 'map'], [/\bchart\b|\bmaps?\b|atlas/, 'map', { chart: true }], [/\bkeys?\b/, 'key', (n) => ({ big: /loki|chain|giant|prison|vault/.test(n) })],
  [/letter|invitation|envelope|\bnote from|message/, 'envelope', (n) => ({ heart: /tea|love|party|invitation/.test(n) })],
  [/comic|manga/, 'book', { comic: true }], [/book|primer|novel|diary|journal|manual|log of|logbook|almanac|encyclop|tome/, 'book'],
  [/notes|notebook|sketch/, 'notebook'], [/ticket|\bpass\b|boarding/, 'ticket'], [/\bpage\b|leaflet|flyer|sheet/, 'page', (n) => ({ wet: /water|soak|wet/.test(n) })],
  [/poster|playbill|wanted|bill\b/, 'poster'],
  [/scroll|survey|register|permit|decree|\blog\b|promise|orders|edict|charter|record|document|deed|certificate|contract|papers|report/, 'scroll', (n) => ({ seal: /sealed|government|permit|holy|royal/.test(n) ? '#c8372d' : undefined })],
  [/\bdice\b|\bdie\b/, 'dice'], [/\btag\b|label/, 'tag'], [/\bhorn\b|bugle/, 'horn'], [/flag|banner|jolly roger|pennant/, 'flag', (n) => ({ emblem: /sun/.test(n) ? 'sun' : 'skull' })],
  [/umbrella|parasol/, 'umbrella'], [/bird|gull|parrot|coo\b/, 'bird'],
  [/strongbox|lockbox|\bsafe\b|coffer/, 'chest', { iron: true }], [/chest|\bcrate\b|\bbox\b/, 'chest', {}, ['treasure', 'key']],
  [/\bbell\b|shandora/, 'bell'], [/statue|idol|figurine|effigy/, 'statue'], [/pearl/, 'pearl'],
  [/coin|doubloon|berr(y|ies)|belly|money|\bgold\b/, 'coins', {}, ['treasure', 'key', 'material']],
  [/jewel|\bgems?\b|diamond|ruby|sapphire|emerald|topaz/, 'jewels'], [/ingot|\bmetal\b|bullion|wapometal|\bbar of/, 'ingot'],
  [/violin|fiddle|guitar|lute|instrument|\bdrum\b|flute|harp/, 'violin'], [/perfume|fragrance|scent|cologne/, 'perfume'],
  [/feather|plume/, 'feather'], [/sakura|cherry blossom/, 'blossom'], [/hibiscus|flower|blossom|\brose\b|\blily\b|orchid/, 'flower'],
  [/\bsalt\b|sugar|spice|pepper|flour|grain/, 'sack'], [/\bwood|timber|\blogs?\b|lumber|plank/, 'wood', (n) => ({ adam: /adam/.test(n) })],
  [/seastone|kairoseki/, 'rock', { color: '#5f8187' }], [/\bstone|\brock|\bore\b|crystal|\blead\b|amber|mineral/, 'rock', (n) => ({ color: /amber|lead|white/.test(n) ? '#e9e6dc' : undefined })],
  [/herb|\bleaf|leaves|moss|\broot|grass|seaweed/, 'herbs'], [/powder|dust/, 'jar', { color: '#f3c6d6' }],
];

const HAT_LOOK = { straw: 'strawHat', bandana: 'bandana', tricorne: 'tricorne', captain: 'captainHat', cowboy: 'cowboyHat', marine: 'marineCap', pinkhat: 'topHat', goggles: 'goggles', headband: 'headband', horns: 'hornHelm', beanie: 'beanie', crown: 'crownHat', halo: 'halo', bubble: 'halo' };
const KIND_DEFAULT = { sword: 'katana', gun: 'flintlock', staff: 'staff', axe: 'axe' };
const DIAL_COLORS = [
  [/impact/, '#e3a857'], [/reject/, '#5b3f8a'], [/flame|fire|heat/, '#e8643a'], [/breath|wind|air|jet/, '#9fd9e3'], [/flash|lamp|light/, '#f6d94a'],
  [/eisen|iron/, '#8c9aa6'], [/tone|sound|music/, '#8fd18a'], [/milky|cloud/, '#f4f1ea'], [/water|aqua/, '#4fb3e8'], [/axe|blade/, '#b0bec5'],
];

function typeDefault(d, id) {
  const t = d?.type;
  if (t === 'weapon') return { fn: KIND_DEFAULT[d.kind] || 'katana', o: {} };
  if (t === 'hat') return d.look?.hat && HAT_LOOK[d.look.hat] ? { fn: HAT_LOOK[d.look.hat], o: { color: d.look.hatColor } } : { fn: 'tricorne', o: {}, fallback: true };
  if (t === 'coat') return { fn: 'coat', o: { color: d.look?.coat, trim: false } };
  if (t === 'dial') { const n = (d.name || id || '').toLowerCase(); return { fn: 'shell', o: { color: (DIAL_COLORS.find(([re]) => re.test(n)) || [0, '#d9c1a0'])[1] } }; }
  if (t === 'pose') return { fn: 'eternalPose', o: {} };
  if (t === 'fruit') return { fn: 'fruit', o: { fruit: d.fruit } };
  const generic = { food: 'bread', medicine: 'vial', accessory: 'amulet', key: 'key', treasure: 'chest', material: 'crate' }[t];
  if (generic) return { fn: generic, o: {}, fallback: true };
  return { fn: 'pouch', o: {}, fallback: true };
}

let defIds = new WeakMap(), defCount = -1;
function idOfDef(d) {
  if (!d) return null;
  if (d.id) return d.id;
  const n = Object.keys(ITEMS).length;
  if (n !== defCount) { defIds = new WeakMap(); for (const [k, v] of Object.entries(ITEMS)) defIds.set(v, k); defCount = n; }
  return defIds.get(d) || null;
}

function resolveItem(id, d) {
  if (id && ITEM_MAP[id]) return { fn: ITEM_MAP[id][0], o: ITEM_MAP[id][1] || {} };
  if (d?.type === 'fruit' || d?.fruit || /^fruit_/.test(id || '')) return { fn: 'fruit', o: { fruit: d?.fruit || (id || '').replace(/^fruit_/, '') } };
  const name = `${d?.name || ''} ${id || ''}`.toLowerCase().replace(/_/g, ' ');
  for (const [re, fn, o, types] of NAME_RULES) {
    if (!re.test(name) || (types && d?.type && !types.includes(d.type))) continue;
    return { fn, o: typeof o === 'function' ? o(name, d, id) : o || {} };
  }
  if (d?.type === 'dial') return typeDefault(d, id);
  return typeDefault(d, id);
}

// ================================================================== exports
export function itemIcon(idOrDef, size = 48) {
  const isStr = typeof idOrDef === 'string';
  const d = isStr ? ITEMS[idOrDef] : idOrDef;
  const id = isStr ? idOrDef : idOfDef(d);
  const key = 'item:' + (id || `${d?.type || '?'}/${d?.name || '?'}`);
  const hit = cache.get(key + '@' + Math.max(8, Math.round(size || 48)));
  if (hit) return hit;
  const r = resolveItem(id, d);
  return render(key, size, (I) => (D[r.fn] || D.pouch)(I, { ...r.o, def: d, id }), { tag: r.fn, fallback: r.fallback });
}

export function skillIcon(def, size = 48) {
  return render('skill:' + (def?.id || def?.name || '?'), size, (I) => {
    part(I, circle(32, 32, 28), '#37474f', { sd: 3, hd: 2 });
  });
}

export function uiIcon(name, size = 32) {
  return render('ui:' + name, size, (I) => {
    part(I, circle(32, 32, 26), '#8e5a30', { sd: 3, hd: 2 });
  });
}

const urls = new WeakMap();
export function iconURL(canvas) {
  if (!canvas) return '';
  if (!urls.has(canvas)) urls.set(canvas, canvas.toDataURL('image/png'));
  return urls.get(canvas);
}
