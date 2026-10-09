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
// from the top-left, a dark ink outline (#2b1d14) plus a soft inner highlight,
// and a faint light halo outside the outline so dark shapes still read on the
// dark HUD. Everything is authored on a 64-unit grid and scaled to the size.
//  - Items resolve by id (ITEM_MAP) → name keywords (NAME_RULES, content packs
//    included) → type/kind/look; unknown things get a pouch (canvas.dataset.fallback).
//  - Techniques are medallions: a badge tinted by fruit / style / haki with a
//    motif (SK.*) chosen by id (SKILL_MAP) → name keywords → the ability's emoji
//    hint (only as a hint, never drawn) → style → element → anim.
//  - UI icons (UI.*) use bolder outlines and drop fine detail at ≤ 48 px; the
//    *_slot icons are flat silhouettes meant to be shown at low opacity.
// canvas.dataset.icon names the drawer used (handy in tests and contact sheets:
// node tools/icons-sheet.mjs, or node tools/shot.mjs icons).
/* global DOMMatrix */
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
// Icons are small and drawn with many canvas-to-canvas copies, then read back
// by toDataURL(): CPU-backed canvases are much faster for that than GPU ones
// (especially under software GL).
const CTX = { willReadFrequently: true };
const cache = new Map();
const scratch = {};
function scr(name, px) {
  let s = scratch[name];
  if (!s) s = scratch[name] = document.createElement('canvas');
  if (s.width !== px) { s.width = px; s.height = px; }
  const t = s.getContext('2d', CTX);
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
  const g = c.getContext('2d', CTX);
  const k = px / U;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const olPx = Math.min(2.1, Math.max(1, 0.7 + size * 0.0145));
  return { c, g, k, px, size, res, small: size <= 28, ol: olPx * U / size, rimPx: Math.min(1.5, Math.max(0.65, size * 0.019)) * res, post: [] };
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
  // `color` may be a CanvasGradient: then o.base (a hex colour) drives the derived tones
  const base = typeof color === 'string' ? color : o.base || '#888888';
  const ol = (o.ol ?? I.ol) / s;
  if (ol > 0) { g.lineWidth = ol * 2; g.strokeStyle = o.line || OUT; g.stroke(p); }
  const sd = o.flat ? 0 : o.sd ?? 2.6, hd = o.flat ? 0 : o.hd ?? 2;
  g.save();
  g.clip(p, rule);
  if (sd > 0) {
    g.fillStyle = o.sh || dk(base, o.shT ?? 0.32);
    g.fill(p, rule);
    const [dx, dy] = lvec(I, -sd, -sd);
    g.translate(dx, dy);
  }
  g.fillStyle = color;
  g.fill(p, rule);
  g.restore();
  if (hd > 0) hilite(I, p, o.hi || lt(base, o.hiT ?? 0.45), hd, o.hiA ?? 0.85, o.inset ?? 0.9, rule);
  if (o.gloss) gloss(I, ...o.gloss);
  return p;
}
/** Linear / radial gradients in grid units (current transform). */
function lg(I, x0, y0, x1, y1, stops) { const gr = I.g.createLinearGradient(x0, y0, x1, y1); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; }
function rg(I, x, y, r, stops, x0 = x, y0 = y, r0 = 0) { const gr = I.g.createRadialGradient(x0, y0, r0, x, y, r); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; }
/** Draw after the silhouette rim: glows (behind = true, no outline) and sparkles on top. */
function after(I, fn, behind = false) { I.post.push([fn, behind, I.g.getTransform()]); }
function sparkle(I, x, y, r, col = '#ffffff', a = 1) {
  const fn = () => alpha(I, a, () => { fl(I, star(x, y, 4, r, r * 0.26), col); fl(I, circle(x, y, r * 0.22), '#ffffff'); });
  I.inBadge ? fn() : after(I, fn);
}
function glow(I, path, col, a = 0.45) { const fn = () => alpha(I, a, () => fl(I, path, col)); I.inBadge ? fn() : after(I, fn, true); }
function hilite(I, p, color, hd, a, inset, rule) {
  const s = scr('hl', I.px), t = s.getContext('2d', CTX);
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
/** Erase (punch a hole). */
function cut(I, path) { const g = I.g; g.save(); g.globalCompositeOperation = 'destination-out'; g.fill(P(path)); g.restore(); }
/** Run fn with the grid rotated by r (radians) / scaled by s about (ox, oy). */
function tf(I, { r = 0, s = 1, sx, sy, x = 0, y = 0, ox = 32, oy = 32 } = {}, fn) {
  const g = I.g; g.save();
  g.translate(ox + x, oy + y); g.rotate(r); g.scale(sx ?? s, sy ?? s); g.translate(-ox, -oy);
  fn(); g.restore();
}
function alpha(I, a, fn) { const g = I.g; g.save(); g.globalAlpha *= a; fn(); g.restore(); }

/**
 * Silhouette rim: thickens the outer ink contour so shapes separate from any
 * background, plus a faint light halo beyond it so dark shapes still read on
 * the dark HUD (on parchment the halo is practically invisible).
 */
const HALO = '#fff4dc', HALO_A = 0.5;
function rim(I, rpx = I.rimPx, hpx = 0) {
  if (rpx <= 0) return;
  const s = scr('rim', I.px), t = s.getContext('2d', CTX);
  t.drawImage(I.c, 0, 0);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = OUT; t.fillRect(0, 0, I.px, I.px);
  let h = null;
  if (hpx > 0) {
    h = scr('halo', I.px); const u = h.getContext('2d', CTX);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; u.drawImage(s, Math.cos(a) * (rpx + hpx), Math.sin(a) * (rpx + hpx)); }
    u.globalCompositeOperation = 'source-in'; u.fillStyle = HALO; u.fillRect(0, 0, I.px, I.px);
  }
  const g = I.g;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-over';
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.drawImage(s, Math.cos(a) * rpx, Math.sin(a) * rpx); }
  if (h) { g.globalAlpha = HALO_A; g.drawImage(h, 0, 0); }
  g.restore();
}

function render(key, size, draw, opts = {}) {
  size = Math.max(8, Math.round(size || 48));
  const ck = key + '@' + size;
  let c = cache.get(ck);
  if (c) return c;
  const I = mk(size);
  if (opts.bold) { I.ol *= opts.bold; I.rimPx *= opts.bold; I.small = I.small || size <= 48; }
  try {
    draw(I);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[icons] failed to draw', key, e);
    I.g.setTransform(1, 0, 0, 1, 0, 0); I.g.clearRect(0, 0, I.px, I.px);
    I.g.setTransform(I.k, 0, 0, I.k, 0, 0);
    I.post = [];
    D.pouch(I, {});
  }
  if (opts.rim !== false) rim(I, opts.rimPx ?? I.rimPx, opts.halo === false ? 0 : Math.max(0.7, size * 0.014) * I.res);
  for (const [fn, behind, m] of I.post) {
    const g = I.g; g.save(); g.setTransform(m);
    if (behind) g.globalCompositeOperation = 'destination-over';
    try { fn(); } catch (e) { /* decoration only */ }
    g.restore();
  }
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
  if (o.crest) part(I, 'M32 24 C26 18 20 10 18 2 C24 6 29 12 32 18 C35 12 40 6 46 2 C44 10 38 18 32 24 Z', C.gold, { sd: 1, hd: 0.8 });
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
  glow(I, ellipse(32, 30, 29, 14), '#fff3b0', 0.45);
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

// ------------------------------------------------------------ shape helpers
function heartP(cx, cy, s) {
  return `M${cx} ${cy + 0.9 * s} C${cx - 0.2 * s} ${cy + 0.6 * s} ${cx - s} ${cy + 0.12 * s} ${cx - s} ${cy - 0.35 * s} C${cx - s} ${cy - 0.8 * s} ${cx - 0.42 * s} ${cy - 0.98 * s} ${cx} ${cy - 0.52 * s} C${cx + 0.42 * s} ${cy - 0.98 * s} ${cx + s} ${cy - 0.8 * s} ${cx + s} ${cy - 0.35 * s} C${cx + s} ${cy + 0.12 * s} ${cx + 0.2 * s} ${cy + 0.6 * s} ${cx} ${cy + 0.9 * s} Z`;
}
/** Wax seal: a wobbly disc. */
function sealP(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * TAU, rr = r * (1 + 0.09 * Math.sin(a * 7 + 1)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return poly(pts);
}
/** Tapered stroke along points (widths w0 → w1) as a filled outline path. */
function taper(pts, w0, w1, pow = 1) {
  const L = [], R = [], n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const [x, y] = pts[i], [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(n, i + 1)];
    let dx = bx - ax, dy = by - ay; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const w = (typeof w0 === 'function' ? w0(i / n) : w0 + (w1 - w0) * Math.pow(i / n, pow)) / 2;
    L.push([x - dy * w, y + dx * w]); R.push([x + dy * w, y - dx * w]);
  }
  return poly(L.concat(R.reverse()));
}
/** Compass needle inside a glass globe. */
function needle(I, x, y, r, rot = -0.45) {
  tf(I, { r: rot, ox: x, oy: y }, () => {
    part(I, poly([[x - r * 0.74, y], [x, y - r * 0.17], [x, y + r * 0.17]]), '#eef2f4', { sd: 0, hd: 0, ol: I.ol * 0.6 });
    part(I, poly([[x + r * 0.74, y], [x, y - r * 0.17], [x, y + r * 0.17]]), '#d23b32', { sd: 0, hd: 0, ol: I.ol * 0.6 });
  });
  fl(I, circle(x, y, Math.max(1, r * 0.11)), OUT);
}
function globe(I, x, y, r, rot) {
  part(I, circle(x, y, r), '#d6eef4', { sd: r * 0.14, shT: 0.2, hd: 0 });
  clip(I, circle(x, y, r), () => fl(I, ellipse(x + r * 0.2, y + r * 1.05, r * 1.2, r * 0.55), '#b4d8e4'));
  needle(I, x, y, r, rot);
  gloss(I, x - r * 0.4, y - r * 0.42, r * 0.3, r * 0.17, 0.9, -0.7);
  if (!I.small) ln(I, arcPath(x, y, r * 0.78, Math.PI * 1.02, Math.PI * 1.42), '#ffffff', Math.max(0.9, r * 0.09), { a: 0.75 });
}
/** Sakura blossom (five notched petals). */
function sakura(I, x, y, r, col, rot = 0, o = {}) {
  const petal = 'M0 0 C-6 -4 -8.5 -10 -5 -15 C-3.4 -16.5 -1.4 -16.2 0 -14 C1.4 -16.2 3.4 -16.5 5 -15 C8.5 -10 6 -4 0 0 Z';
  const ps = []; for (let i = 0; i < 5; i++) ps.push(xf(petal, { ox: 0, oy: 0, x, y, r: rot + i / 5 * TAU, s: r / 16 }));
  part(I, union(...ps), col, { sd: r * 0.12, hd: r * 0.08, ol: o.ol });
  if (!I.small && r > 8) for (let i = 0; i < 5; i++) { const a = rot + i / 5 * TAU - Math.PI / 2; ln(I, `M${x} ${y} L${x + Math.cos(a) * r * 0.42} ${y + Math.sin(a) * r * 0.42}`, dk(col, 0.35), Math.max(0.8, r * 0.06)); fl(I, circle(x + Math.cos(a) * r * 0.44, y + Math.sin(a) * r * 0.44, Math.max(0.7, r * 0.06)), '#f7d34a'); }
  fl(I, circle(x, y, r * 0.16), dk(col, 0.4));
}

// ------------------------------------------------------------ fruit & veg
D.coconut = (I) => {
  const sh = '#7a4a28';
  const whole = ellipse(25, 28, 17, 16.5, -0.3);
  part(I, whole, sh, { sd: 3.4, hd: 2 });
  if (!I.small) clip(I, whole, () => {
    for (const d of ['M9 27 C15 22 22 24 26 32', 'M12 17 C19 16 26 20 30 29', 'M21 12 C28 12 34 17 37 26', 'M13 37 C19 34 26 36 30 42']) ln(I, d, dk(sh, 0.4), 1.1, { a: 0.75 });
  });
  for (const [x, y] of [[16.5, 23], [21.5, 19.5], [21.5, 25.5]]) fl(I, circle(x, y, 1.7), '#3b2414');
  const half = 'M28 42 C28 51.5 35 58 44 58 C53 58 60 51.5 60 42 Z';
  part(I, half, sh, { sd: 2.6, hd: 1.4 });
  if (!I.small) clip(I, half, () => { for (const x of [36, 44, 52]) ln(I, `M${x} 43 C${x - 1} 49 ${x} 54 ${x + 1} 58`, dk(sh, 0.4), 1, { a: 0.7 }); });
  part(I, ellipse(44, 42, 16, 5.4), '#f8f4ea', { sd: 1.4, shT: 0.15, hd: 0.8 });
  fl(I, ellipse(44.6, 42.6, 11.6, 3.3), '#e1ece8');
  gloss(I, 40, 41.6, 3.6, 0.9, 0.7, 0);
};
D.banana = (I) => {
  const b = 'M9 19 C8 41 36 57 58 38 C57.5 35.5 55.5 35.2 53.5 36.4 C38 45 19 36 14.5 18.5 Z';
  const cols = ['#e9b923', '#f2c52e', '#f7d443'];
  [0.42, 0.14, -0.16].forEach((r, i) => {
    const p = xf(b, { ox: 11.5, oy: 17, r, x: i * 1.5 - 1.5, y: i * 2 - 2 });
    part(I, p, cols[i], { sd: 2.2, hd: 1.4 });
    if (!I.small) clip(I, p, () => ln(I, xf('M12 22 C15 38 32 48 50 42', { ox: 11.5, oy: 17, r, x: i * 1.5 - 1.5, y: i * 2 - 2 }), dk(cols[i], 0.28), 1, { a: 0.7 }));
    fl(I, xf(ellipse(56.5, 37.2, 2, 1.6), { ox: 11.5, oy: 17, r, x: i * 1.5 - 1.5, y: i * 2 - 2 }), '#4a3219');
  });
  part(I, rrect(7, 11, 8, 9, 2.5), '#7a6a2a', { sd: 1, hd: 0.6 });
};
D.mango = (I) => {
  const m = 'M31 14 C43 11 55 20 55.5 33 C56 47 45 58 31 57 C19 56 9.5 48 10 37 C10.5 26 19 16 31 14 Z';
  const base = lg(I, 50, 14, 14, 54, [[0, '#e0452f'], [0.42, '#f59a1f'], [0.78, '#f2c53a'], [1, '#9dbb3a']]);
  const shade = lg(I, 50, 14, 14, 54, [[0, '#a8321f'], [0.42, '#c0701a'], [0.78, '#c2952a'], [1, '#6f8a2a']]);
  part(I, m, base, { base: '#f59a1f', sh: shade, hi: '#ffe2a8', sd: 3.8, hd: 2.4, gloss: [21, 27, 3, 5.5, 0.55, 0.5] });
  if (!I.small) for (const [x, y] of [[40, 40], [34, 47], [45, 30], [25, 44]]) fl(I, circle(x, y, 0.8), '#fff3c8', { a: 0.7 });
  tube(I, 'M33 15 C33 11 34 8 36.5 5.5', '#6b4a2a', 2.2);
  part(I, 'M35.5 8.5 C40 2.5 50 2 56 6 C51 11.5 42 12.5 35.5 8.5 Z', C.leaf, { sd: 1.4, hd: 1 });
  if (!I.small) ln(I, 'M38 8 C42 6.5 47 6 52 6.3', dk(C.leaf, 0.35), 1);
};
D.apple = (I, o = {}) => {
  const col = o.color || '#d9362c';
  const a = 'M32 21 C37 15 49 14 54 23 C59 33 55 47 47 55 C43 59 37 59 32 56 C27 59 21 59 17 55 C9 47 5 33 10 23 C15 14 27 15 32 21 Z';
  part(I, a, col, { sd: 3.8, hd: 2.4, gloss: [20.5, 28, 2.8, 5.6, 0.6, 0.35] });
  tube(I, 'M32 22 C31.5 16 32.5 11 35.5 7', '#6b4a2a', 2.4);
  part(I, 'M35 12 C38 5 47 3 53 6 C50 12 42 15 35 12 Z', C.leaf, { sd: 1.4, hd: 1 });
  if (!I.small) ln(I, 'M37 11 C41 9 45 7.5 50 6.5', dk(C.leaf, 0.35), 1);
};
D.cherry = (I) => {
  tube(I, 'M36 9 C30 16 25 26 22 38', '#5f8a2e', 2.2);
  tube(I, 'M36 9 C39 19 42 29 43.5 40', '#5f8a2e', 2.2);
  part(I, 'M36 10 C40 3 50 1 57 4 C53 10 44 13 36 10 Z', C.leaf, { sd: 1.4, hd: 1 });
  if (!I.small) ln(I, 'M39 8.5 C44 6 49 4.8 54 4.6', dk(C.leaf, 0.35), 1);
  part(I, circle(21, 45, 11.5), '#c81f2c', { sd: 3, hd: 2, gloss: [16.5, 40.5, 2.4, 3.6, 0.7, 0.5] });
  part(I, circle(44, 47, 11.5), '#b3162a', { sd: 3, hd: 2, gloss: [39.5, 42.5, 2.4, 3.6, 0.7, 0.5] });
  fl(I, ellipse(22.2, 34.6, 1.6, 1), '#5a0d14'); fl(I, ellipse(43.6, 36.6, 1.6, 1), '#5a0d14');
};
D.mushroom = (I, o = {}) => {
  const col = o.color || '#d23a2e';
  part(I, 'M25 34 C24 42 21 50 23 56 C25 59 39 59 41 56 C43 50 40 42 39 34 Z', '#f1e7d0', { sd: 2.4, shT: 0.2, hd: 1.4 });
  const cap = 'M7 36 C6 21 17 9 32 9 C47 9 58 21 57 36 C50 40 14 40 7 36 Z';
  part(I, cap, col, { sd: 3, hd: 2.2 });
  clip(I, cap, () => { for (const [x, y, r] of [[20, 20, 4.2], [34, 15, 3.6], [45, 24, 4.4], [27, 30, 3], [13, 31, 2.6], [51, 34, 2.4]]) part(I, ellipse(x, y, r, r * 0.8), '#fbf6ea', { sd: 0.6, shT: 0.15, hd: 0, ol: I.ol * 0.5 }); });
  part(I, 'M9 36 C18 40.5 46 40.5 55 36 C52 42.5 12 42.5 9 36 Z', '#e8d9b8', { sd: 0.8, hd: 0, ol: I.ol * 0.7 });
};

// ------------------------------------------------------ dishes & sweets
D.pizza = (I) => {
  tf(I, { r: -0.35, s: 0.9, y: 1 }, () => {
    const slice = 'M32 60 L9 17 C20 8 44 8 55 17 Z';
    part(I, slice, '#f2c14e', { sd: 2.6, hd: 1.6 });
    clip(I, slice, () => fl(I, 'M9 17 C20 8 44 8 55 17 L55 23 C44 15 20 15 9 23 Z', '#d9482f'));
    part(I, 'M15.5 29 C15 35 14 39 16 41.5 C18 43.5 20.5 40.5 19.5 35 L18.4 29 Z', '#f2c14e', { sd: 0.8, hd: 0.5, ol: I.ol * 0.8 });
    tube(I, 'M9 16 C20 6.5 44 6.5 55 16', '#d99a4e', 7);
    for (const [x, y, r] of [[25, 24, 4.4], [39, 24.5, 4.2], [31, 36.5, 4], [32.5, 48.5, 3]]) part(I, circle(x, y, r), '#c23a2c', { sd: 1, hd: 0.8, ol: I.ol * 0.7 });
    if (!I.small) for (const [x, y] of [[33, 29], [22, 32], [40, 36], [28, 44]]) fl(I, ellipse(x, y, 1.7, 0.9, 0.6), '#4f9a3a');
  });
};
D.doughnut = (I, o = {}) => {
  const dough = new Path2D(); dough.addPath(ellipse(32, 36, 26, 20)); dough.addPath(ellipse(32, 33.5, 8, 5.2));
  part(I, dough, '#d99450', { rule: 'evenodd', sd: 3, hd: 1.6 });
  const pts = [];
  for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, r = 21.5 + Math.sin(a * 7 + 0.6) * 1.2 + (Math.sin(a) > 0.2 ? Math.max(0, Math.sin(a * 6 + 1)) * 2.4 : 0); pts.push([32 + Math.cos(a) * r, 33 + Math.sin(a) * r * 0.74]); }
  const fr = poly(pts); fr.addPath(ellipse(32, 33.2, 10.4, 6.8));
  part(I, fr, o.color || '#f27bb0', { rule: 'evenodd', sd: 1.6, hd: 1.6, ol: I.ol * 0.8 });
  if (!I.small) {
    const cols = ['#ffffff', '#f6d02a', '#5bc0eb', '#8cc152', '#ffffff'];
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.3, r = 14.5 + (i % 3) * 1.8, x = 32 + Math.cos(a) * r, y = 33 + Math.sin(a) * r * 0.74; fl(I, xf(rrect(x - 1.9, y - 0.65, 3.8, 1.3, 0.65), { ox: x, oy: y, r: i * 1.3 }), cols[i % 5]); }
  }
  clip(I, ellipse(32, 33.5, 8, 5.2), () => fl(I, ellipse(32, 30, 9.5, 5.4), '#9b5e2b'));
};
D.chocolate = (I) => {
  tf(I, { r: -0.5, s: 0.88 }, () => {
    part(I, rrect(14, 8, 36, 44, 3), '#6b3a22', { sd: 2, hd: 1.4, hi: '#a8683f' });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) part(I, rrect(17 + c * 15.5, 11 + r * 12.5, 14, 10.5, 1.8), '#7a4428', { sd: 1.4, hd: 1.2, ol: I.ol * 0.55, hi: '#b0724a' });
    const wr = 'M11 36 L15 33.5 L19 36 L23 33.5 L27 36 L31 33.5 L35 36 L39 33.5 L43 36 L47 33.5 L51 36 L53 36 L53 58 L11 58 Z';
    part(I, wr, '#c8372d', { sd: 2, hd: 1.4 });
    clip(I, wr, () => { fl(I, rrect(8, 31, 48, 7.5, 0), '#e8c35a'); if (!I.small) { fl(I, rrect(8, 46, 48, 3.6, 0), '#e8c35a', { a: 0.9 }); } });
  });
};
D.cake = (I, o = {}) => {
  const sponge = o.color || '#f3cf7a';
  const front = 'M6 34 L58 24 L58 44 L6 54 Z';
  part(I, front, sponge, { sd: 2.4, hd: 0 });
  clip(I, front, () => {
    fl(I, 'M0 39 L64 26.7 L64 30.4 L0 42.7 Z', '#fbf3e4');
    fl(I, 'M0 46 L64 33.7 L64 36.4 L0 48.7 Z', o.jam || '#d9404f');
    if (!I.small) for (const [x, y] of [[16, 49], [30, 45], [44, 43], [22, 38.5], [50, 36]]) fl(I, circle(x, y, 0.8), dk(sponge, 0.2));
  });
  part(I, 'M6 34 L38 15 C45.5 15 53.5 18.5 58 24 Z', '#fbf3e4', { sd: 1.2, shT: 0.12, hd: 1 });
  part(I, 'M22 28 C20 24 24 20.5 28 22 C31 18.5 36 21 34.5 25 C36.5 28 33.5 31 28.5 30 C25.5 32 21 31 22 28 Z', '#ffffff', { sd: 1, shT: 0.12, hd: 0.6 });
  part(I, 'M40 19 C36 13 40 7 45 8 C50 9 52 15 47 20 C45 22 42 22 40 19 Z', '#e0303a', { sd: 1.2, hd: 0.8 });
  if (!I.small) for (const [x, y] of [[44, 12], [47, 15], [43, 17], [48, 11]]) fl(I, ellipse(x, y, 0.55, 0.85), '#ffe08a');
  part(I, 'M41 9 L43.5 4.5 L46 8.5 L50 6.5 L47.5 10.5 Z', C.leaf, { sd: 0.5, hd: 0, ol: I.ol * 0.7 });
};
D.iceCream = (I, o = {}) => {
  const cone = 'M18.5 35 L32 61 L45.5 35 Z';
  part(I, cone, '#d9a15a', { sd: 1.8, hd: 1.2 });
  if (!I.small) clip(I, cone, () => { for (let i = -3; i <= 3; i++) { ln(I, `M${26 + i * 6} 30 L${38 + i * 6} 62`, dk('#d9a15a', 0.35), 1); ln(I, `M${38 + i * 6} 30 L${26 + i * 6} 62`, dk('#d9a15a', 0.35), 1); } });
  const s1 = 'M16 37 C12 36 12 30 15 28 C14 20 22 16 28 20 C32 16 42 17 45 23 C51 24 52 32 48 36 C46 40 42 38 40 41 C38 43 35 40 32 41 C28 42 26 39 23 40 C19 41 17 39 16 37 Z';
  part(I, s1, o.scoop || '#f6e7c1', { sd: 2.4, shT: 0.2, hd: 1.6 });
  part(I, circle(32, 18.5, 10.5), o.scoop2 || '#f48fb1', { sd: 2.4, hd: 1.6 });
  tube(I, 'M33 8 C34 4.5 37 2.5 40 2.5', '#6b4a2a', 1.4, { flat: true });
  part(I, circle(32.5, 8.5, 3.6), '#d9253a', { sd: 0.8, hd: 0.5, gloss: [31.4, 7.4, 0.9, 0.6, 0.9] });
};
D.sherbet = (I, o = {}) => {
  const col = o.color || '#f06a8a';
  part(I, ellipse(32, 58, 13, 3.4), '#cfe6ee', { sd: 0.8, hd: 0.6 });
  part(I, rrect(29.5, 45, 5, 13, 2), '#cfe6ee', { sd: 0.8, hd: 0.6 });
  part(I, circle(23, 32, 10), col, { sd: 2.2, hd: 1.4 });
  part(I, circle(41, 32, 10), lt(col, 0.15), { sd: 2.2, hd: 1.4 });
  part(I, circle(32, 24.5, 10), col, { sd: 2.2, hd: 1.4 });
  const bowl = 'M9 34 H55 C55 43 45 49 32 49 C19 49 9 43 9 34 Z';
  part(I, bowl, '#d7ecf1', { sd: 1.8, shT: 0.2, hd: 1.2 });
  gloss(I, 17, 39, 1.4, 3.4, 0.8, 0.5);
  part(I, 'M33 17 C29 11 33 4 39 5 C45 6 46 13 41 18 C38 20 35 20 33 17 Z', '#e0303a', { sd: 1.2, hd: 0.8 });
  if (!I.small) for (const [x, y] of [[37, 10], [40, 13], [36, 15], [41, 9]]) fl(I, ellipse(x, y, 0.6, 0.9), '#ffe08a');
  part(I, 'M33 6 L36 2 L38 5.5 L42 3.5 L40 7.5 Z', C.leaf, { sd: 0.5, hd: 0, ol: I.ol * 0.7 });
};
D.dango = (I, o = {}) => {
  tf(I, { r: 0.6 }, () => {
    tube(I, 'M32 63 L32 3', '#d9b26f', 2.6);
    const cols = o.colors || ['#f4a3bf', '#f8f4e8', '#8cc152'];
    [[32, 16], [32, 32.5], [32, 49]].forEach(([x, y], i) => part(I, circle(x, y, 8.8), cols[i], { sd: 2, shT: 0.22, hd: 1.4, gloss: [x - 3, y - 3.4, 1.8, 1.1, 0.7] }));
  });
};
D.skewer = (I) => {
  tf(I, { r: 0.55 }, () => {
    tube(I, 'M32 63 L32 2', '#d9b26f', 2.4);
    part(I, poly([[32, 5], [43.5, 22.5], [20.5, 22.5]]), '#8e8378', { sd: 1.6, hd: 1.2 });
    if (!I.small) for (const [x, y] of [[29, 15], [35, 17], [31, 19.5], [37, 20.5], [26, 20.5]]) fl(I, circle(x, y, 0.6), '#4a4038');
    part(I, ellipse(32, 33, 11, 7.5), '#f0dfb8', { sd: 1.8, shT: 0.2, hd: 1.2 });
    if (!I.small) ln(I, ellipse(32, 33, 7.4, 4.8), '#d9c08a', 1, { a: 0.8 });
    part(I, circle(32, 49, 8.5), '#c98b4a', { sd: 2, hd: 1.4 });
  });
};
D.takoyaki = (I) => {
  part(I, 'M5 37 C5 31 59 31 59 37 L59 42 H5 Z', '#b8955a', { sd: 1, hd: 0.6 });
  for (const [x, y] of [[18, 30], [32, 29], [46, 30], [25, 37], [39, 37]]) {
    part(I, circle(x, y, 8.4), '#d98b3e', { sd: 2, hd: 1.2 });
    part(I, ellipse(x - 0.5, y - 3, 6.2, 4), '#6a3518', { sd: 0.8, hd: 0.6, ol: 0, hi: '#9a5a2e' });
    if (!I.small) { ln(I, `M${x - 5} ${y - 3} q2.5 -2 5 0 t5 0`, '#fbf6ea', 1.2); fl(I, circle(x + 2, y - 5, 0.8), '#6fae3c'); fl(I, circle(x - 3, y - 1.4, 0.7), '#6fae3c'); }
  }
  const front = 'M3 40 H61 L54.5 53 C52.5 56 49.5 57 46 57 H18 C14.5 57 11.5 56 9.5 53 Z';
  part(I, front, '#e3c890', { sd: 2.2, hd: 1.2 });
  if (!I.small) clip(I, front, () => { for (let x = 7; x < 60; x += 5) ln(I, `M${x} 40 L${x - 1} 57`, dk('#e3c890', 0.18), 0.9, { a: 0.7 }); });
  tube(I, 'M46 29 L58 8', '#e9d3a0', 1.6, { flat: true });
};
D.buns = (I) => {
  const st = 'M5 38 H59 V50 C59 55 50 58 32 58 C14 58 5 55 5 50 Z';
  part(I, st, '#c9a064', { sd: 2.2, hd: 1.2 });
  if (!I.small) clip(I, st, () => { ln(I, 'M4 44.5 C14 47.5 50 47.5 60 44.5', dk('#c9a064', 0.35), 1.2); ln(I, 'M4 51 C14 54 50 54 60 51', dk('#c9a064', 0.35), 1.2); });
  part(I, ellipse(32, 38, 27, 7), '#b08a52', { sd: 0.8, hd: 0.6 });
  fl(I, ellipse(32, 38.4, 23.5, 5.2), '#6e5230');
  for (const [x, y] of [[20, 33], [44, 33], [32, 27]]) {
    const b = `M${x - 11} ${y + 6} C${x - 12} ${y - 4} ${x - 6} ${y - 9} ${x} ${y - 9} C${x + 6} ${y - 9} ${x + 12} ${y - 4} ${x + 11} ${y + 6} C${x + 6} ${y + 8} ${x - 6} ${y + 8} ${x - 11} ${y + 6} Z`;
    part(I, b, '#fbf6ec', { sd: 2, shT: 0.18, hd: 1.2 });
    if (!I.small) ln(I, `M${x - 3.4} ${y - 6.4} C${x - 1.4} ${y - 4.2} ${x + 1.4} ${y - 4.2} ${x + 3.4} ${y - 6.4} M${x} ${y - 8.6} L${x} ${y - 5}`, '#d9cdb4', 1);
    fl(I, circle(x, y - 1, 1.3), '#e0567a');
  }
};
D.bread = (I) => {
  tf(I, { r: -0.3 }, () => {
    part(I, 'M6 38 C5 27 17 19 32 19 C47 19 59 27 58 38 C57 46 47 50 32 50 C17 50 7 46 6 38 Z', '#d4893a', { sd: 3.2, hd: 2 });
    for (const x of [20, 32, 44]) part(I, ellipse(x, 30, 3, 8, 0.5), '#f2c77e', { sd: 0, hd: 0, ol: I.ol * 0.6 });
    if (!I.small) for (const [x, y] of [[14, 36], [26, 43], [40, 42], [50, 36]]) fl(I, ellipse(x, y, 1, 0.6), '#fbe3b0');
  });
};

// ---------------------------------------------------------------- drinks
D.wine = (I, o = {}) => {
  const glass = o.glass || '#2f4a36', wine = o.wine || '#8e1b2a';
  part(I, 'M19 5 H28 V17 C28 21 34 23 34 31 V56 C34 58.5 32 60 30 60 H17 C15 60 13 58.5 13 56 V31 C13 23 19 21 19 17 Z', glass, { sd: 2.4, hd: 1.6, hi: lt(glass, 0.4) });
  gloss(I, 17, 33, 1.3, 6, 0.45, 0);
  part(I, rrect(13, 37, 21, 13, 1), '#efe3c4', { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 });
  if (!I.small) part(I, ellipse(23.5, 43.5, 4.6, 3.2), wine, { sd: 0, hd: 0, ol: 0 });
  part(I, rrect(18, 3, 11, 10, 1.5), wine, { sd: 0.8, hd: 0.6 });
  part(I, ellipse(50, 59.5, 9, 2.4), '#d7ecf1', { sd: 0.4, hd: 0, ol: I.ol * 0.8 });
  tube(I, 'M50 45 V59', '#d7ecf1', 2, { flat: true });
  const bowl = 'M39 24 H61 C61 36 57 45 50 45 C43 45 39 36 39 24 Z';
  part(I, bowl, '#e3f1f4', { sd: 1.2, shT: 0.15, hd: 0 });
  clip(I, bowl, () => part(I, rrect(36, 32, 28, 16, 0), wine, { sd: 1.4, hd: 0.8, ol: 0 }));
  gloss(I, 43, 29.5, 1.1, 3.6, 0.8, 0.2);
};
D.whisky = (I) => {
  part(I, 'M21 5 H31 V13 C31 16 37 17 37 22 V55 C37 58 35 60 32 60 H20 C17 60 15 58 15 55 V22 C15 17 21 16 21 13 Z', '#c7771f', { sd: 2.6, hd: 1.6 });
  gloss(I, 19, 31, 1.3, 7, 0.5, 0);
  part(I, rrect(15, 32, 22, 15, 1), '#2b2631', { sd: 0.6, hd: 0.4, ol: I.ol * 0.7 });
  if (!I.small) { ln(I, rrect(17, 34, 18, 11, 0.5), '#e0b24a', 0.9); fl(I, circle(26, 39.5, 2.4), '#e0b24a'); }
  part(I, rrect(20, 2, 12, 7, 2), '#8a5a30', { sd: 0.8, hd: 0.6 });
  const t = 'M39 34 H61 L59 58 C59 59.5 58 60 56.5 60 H43.5 C42 60 41 59.5 41 58 Z';
  part(I, t, '#e3f1f4', { sd: 1.2, shT: 0.15, hd: 0 });
  clip(I, t, () => { part(I, rrect(36, 46, 28, 16, 0), '#d08a2a', { sd: 1.2, hd: 0.6, ol: 0 }); part(I, xf(rrect(44, 40, 10, 10, 2), { r: 0.3, ox: 49, oy: 45 }), '#f4fbfd', { sd: 1, shT: 0.15, hd: 0.6, ol: I.ol * 0.6 }); });
  gloss(I, 43, 40, 1, 5, 0.8, 0);
};
D.mug = (I, o = {}) => {
  const wood = o.color || '#a8703f';
  tube(I, 'M44 27 C57 27 58 46 44 47', wood, 5);
  const body = rrect(11, 22, 35, 37, 4);
  part(I, body, wood, { sd: 2.6, hd: 1.8 });
  clip(I, body, () => {
    if (!I.small) for (const x of [19, 27, 35]) ln(I, `M${x} 22 V60`, dk(wood, 0.35), 1.1, { a: 0.8 });
    for (const y of [27, 50]) part(I, rrect(8, y, 42, 4.5, 0), '#7c868d', { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 });
  });
  part(I, union(circle(14.5, 22, 5.5), circle(22, 18.5, 6.5), circle(31, 18, 6.5), circle(39.5, 20, 6), circle(43.5, 23.5, 4.5), rrect(9.5, 20, 37, 7, 3)), '#fbf3dc', { sd: 1.6, shT: 0.18, hd: 1 });
  part(I, 'M12 25 C12 30 10 33 12 35 C14 37 16 34 15.5 29 Z', '#fbf3dc', { sd: 0.6, hd: 0, ol: I.ol * 0.7 });
};
D.teacup = (I, o = {}) => {
  part(I, ellipse(32, 52, 27, 7), '#f4f1ea', { sd: 1.8, shT: 0.18, hd: 1 });
  if (!I.small) ln(I, ellipse(32, 52, 22, 5.2), '#5a86b8', 1, { a: 0.8 });
  tube(I, 'M50 33 C60 31 60 44 49 45', '#f4f1ea', 3.4);
  const cup = 'M11 29 H53 C53 42 44 50 32 50 C20 50 11 42 11 29 Z';
  part(I, cup, '#f7f4ec', { sd: 2.6, shT: 0.2, hd: 1.4 });
  clip(I, cup, () => fl(I, 'M8 36 C20 40 44 40 56 36 L56 39.5 C44 43.5 20 43.5 8 39.5 Z', o.band || '#5a86b8'));
  part(I, ellipse(32, 29, 21, 4.6), dk('#f7f4ec', 0.15), { sd: 0, hd: 0 });
  fl(I, ellipse(32, 29.6, 18.5, 3.4), o.tea || '#b5652a');
  if (!I.small) gloss(I, 26, 29, 4, 0.9, 0.5, 0);
  for (const [x, h] of [[24, 0], [33, -3], [42, 0]]) ln(I, `M${x} ${22 + h} c-4 -4 4 -7 0 -12`, '#ffffff', 2.2, { a: 0.8 });
};
/** Water: a blue gourd flask. */
D.drop = (I, o = {}) => {
  const col = o.color || '#7cc3ea';
  part(I, union(circle(32, 20, 9.5), circle(32, 42, 16.5), rrect(27, 20, 10, 16, 3)), col, { sd: 3, hd: 2, gloss: [25.5, 37, 2.6, 5, 0.6, 0.3] });
  if (!I.small) gloss(I, 29, 16, 1.5, 2.6, 0.7, 0.3);
  part(I, rrect(28, 5, 8, 7, 2), '#b27a45', { sd: 0.8, hd: 0.6 });
  tube(I, 'M23.5 29.5 C28 31.5 36 31.5 40.5 29.5', '#c8372d', 2.4);
  tube(I, 'M39 31 C43 36 43 42 41 46', '#c8372d', 1.8);
  if (!I.small) part(I, 'M32 37 C35 41 37 44 37 47 C37 50 34.8 52 32 52 C29.2 52 27 50 27 47 C27 44 29 41 32 37 Z', '#ffffff', { flat: true, ol: I.ol * 0.55 });
};
D.bottle = (I, o = {}) => {
  const b = 'M25 9 H39 V16 C39 20 46 22 46 29 V54 C46 57.5 43.5 60 40 60 H24 C20.5 60 18 57.5 18 54 V29 C18 22 25 20 25 16 Z';
  part(I, b, '#dcebee', { sd: 1.6, shT: 0.2, hd: 0 });
  clip(I, b, () => { part(I, rrect(10, 26, 44, 40, 0), o.liquid || '#f7f4ec', { sd: 2.6, hd: 1.4, ol: 0 }); part(I, rrect(10, 36, 44, 12, 0), o.label || '#5a86b8', { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 }); });
  gloss(I, 22, 33, 1.3, 5.5, 0.6, 0);
  part(I, rrect(23.5, 4, 17, 7, 2), o.cap || '#c8372d', { sd: 0.8, hd: 0.6 });
};
D.fish = (I, o = {}) => {
  const col = o.color || '#5b8fb5';
  tf(I, { r: -0.35 }, () => {
    part(I, 'M44 29 L58 16 C60 22 60 26 57 32 C60 38 60 42 58 48 L44 35 Z', dk(col, 0.1), { sd: 1.4, hd: 1 });
    const body = 'M5 32 C12 20 30 16 44 24 C47 26 49 29 49 32 C49 35 47 38 44 40 C30 48 12 44 5 32 Z';
    part(I, body, col, { sd: 3, hd: 2 });
    clip(I, body, () => { fl(I, 'M4 33 C14 40 30 43 50 34 L50 50 L4 50 Z', '#e9eef0'); if (!I.small) for (let x = 20; x < 44; x += 5) ln(I, `M${x} 24 q3 4 0 8`, dk(col, 0.3), 0.9, { a: 0.6 }); });
    part(I, 'M22 20 C26 13 34 12 38 16 C34 19 28 21 22 20 Z', dk(col, 0.1), { sd: 0.8, hd: 0.6, ol: I.ol * 0.8 });
    fl(I, circle(12.5, 30, 2.3), '#ffffff'); fl(I, circle(12.8, 30, 1.25), OUT);
    ln(I, 'M17.5 25 C19.5 29 19.5 34 17.5 38', dk(col, 0.4), 1.2);
    if (o.trunk) {
      // the Elephant Honmaguro: a floppy ear and a trunk curling down from the snout
      part(I, 'M18 24 C14 18 22 14 27 19 C27 24 23 28 18 24 Z', '#8c8f98', { sd: 1, hd: 0.8, ol: I.ol * 0.8 });
      tube(I, 'M6 33 C2 38 3 45 8 46', '#8c8f98', 3.4);
    }
  });
};

// -------------------------------------------------------------- medicine
/** Open jar of salve / tar / powder. o.color contents. */
D.jar = (I, o = {}) => {
  const clay = o.clay || '#e3d6bb';
  const pot = 'M17 24 C11 31 11 49 17 55 C21 59 43 59 47 55 C53 49 53 31 47 24 Z';
  part(I, pot, clay, { sd: 3, shT: 0.25, hd: 2 });
  clip(I, pot, () => part(I, rrect(8, 34, 48, 10, 0), o.band || '#5a86b8', { sd: 1, hd: 0.6, ol: I.ol * 0.7 }));
  part(I, rrect(15, 18, 34, 9, 3.5), lt(clay, 0.1), { sd: 1.2, shT: 0.2, hd: 0.8 });
  part(I, ellipse(32, 19.5, 15.5, 4.2), dk(clay, 0.35), { sd: 0, hd: 0 });
  part(I, 'M18.5 20 C20 14 26 11 32 12 C38 11 44 14 45.5 20 C40 22.5 24 22.5 18.5 20 Z', o.color || '#6fae3c', { sd: 1.2, hd: 1, ol: I.ol * 0.7 });
  tube(I, 'M37 15 L51 3', C.woodL, 2.4);
};
D.dandelion = (I) => {
  tube(I, 'M31 60 C30 50 32 42 32 34', '#5f8a2e', 2.6);
  part(I, 'M30 58 C24 54 18 48 16 40 L20 42 L19 37 L23 41 L24 36 L27 44 C29 50 31 54 30 58 Z', C.leaf, { sd: 1, hd: 0.8 });
  part(I, 'M33 58 C38 54 44 49 47 42 L43 44 L45 39 L40 43 L40 38 L36 45 C34 50 33 54 33 58 Z', dk(C.leaf, 0.1), { sd: 1, hd: 0.8 });
  glow(I, circle(32, 21, 19), '#fff6c8', 0.55);
  part(I, circle(32, 21, 13.5), '#f7f4ea', { sd: 1.6, shT: 0.12, hd: 1, ol: I.ol * 0.8 });
  if (!I.small) for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; ln(I, `M${32 + Math.cos(a) * 3} ${21 + Math.sin(a) * 3} L${32 + Math.cos(a) * 11.4} ${21 + Math.sin(a) * 11.4}`, '#cfc8b4', 0.8); fl(I, circle(32 + Math.cos(a) * 11.8, 21 + Math.sin(a) * 11.8, 1.1), '#ffffff'); }
  part(I, circle(32, 21, 3.2), '#e0c25a', { sd: 0.6, hd: 0.4, ol: I.ol * 0.6 });
  for (const [x, y] of [[52, 10], [56, 20]]) { ln(I, `M${x} ${y} l3 3`, '#8a8270', 0.9); fl(I, circle(x, y, 2), '#ffffff'); }
};

// ------------------------------------------------------- spare weapons
D.spear = (I, o = {}) => {
  tf(I, { r: DIAG, s: 0.95 }, () => {
    tube(I, 'M-4 32 H50', o.shaft || C.wood, 3.8);
    part(I, rrect(-7, 29.5, 6, 5, 1.5), '#6c7780', { sd: 0.6, hd: 0.4 });
    const head = 'M48 32 C52 27 60 27 70 32 C60 37 52 37 48 32 Z';
    part(I, head, o.head || '#d4dde4', { sd: 1.2, hd: 0.8 });
    clip(I, head, () => fl(I, 'M48 32 H72 V40 H48 Z', lt(o.head || '#d4dde4', 0.4), { a: 0.9 }));
    part(I, rrect(45, 29, 5, 6, 1.4), C.brass, { sd: 0.6, hd: 0.4 });
    if (o.tassel !== false) part(I, 'M45 33 C41 36 37 41 37 45 L41 43 L41 47.5 L44 42 C45.5 39 46 36 46 33 Z', '#c8372d', { sd: 0.8, hd: 0.5 });
  });
};
D.dagger = (I, o = {}) => {
  tf(I, { r: DIAG }, () => {
    const blade = 'M28 28.5 L54 30.5 L62 32 L54 33.5 L28 35.5 Z';
    part(I, blade, '#dfe7ee', { sd: 1.2, hd: 0.8 });
    clip(I, blade, () => fl(I, 'M28 32 L62 32 L62 38 L28 38 Z', '#f4f8fb', { a: 0.8 }));
    part(I, rrect(24, 22, 5, 20, 2), C.brass, { sd: 0.8, hd: 0.6 });
    part(I, rrect(8, 28.5, 17, 7, 2.5), o.wrap || '#5a3d2b', { sd: 1, hd: 0.7 });
    part(I, circle(7, 32, 4), C.brass, { sd: 0.8, hd: 0.5 });
  });
};

// ------------------------------------------------------------ navigation
/** Log Pose: glass globe(s) with a needle on a leather wrist strap. */
D.logPose = (I, o = {}) => {
  const leather = '#7a4a2a', brass = '#d6a23e';
  const strap = new Path2D(); strap.addPath(ellipse(32, 48, 26, 10.5)); strap.addPath(ellipse(32, 47.2, 20, 6.2));
  part(I, strap, leather, { rule: 'evenodd', sd: 1.8, hd: 1.2 });
  if (!I.small) ln(I, ellipse(32, 47.6, 23, 8.4), lt(leather, 0.35), 0.9, { dash: [2, 1.8], a: 0.9 });
  if (o.three) {
    [[16, 29, 9.6, -0.3], [48, 29, 9.6, -0.7], [32, 24, 11, -0.5]].forEach(([x, y, r, a]) => globe(I, x, y, r, a));
    part(I, rrect(5.5, 35, 53, 10, 4.5), brass, { sd: 1.6, hd: 1.2 });
    if (!I.small) for (const x of [16, 32, 48]) part(I, circle(x, 40, 1.6), dk(brass, 0.3), { flat: true, ol: 0 });
  } else {
    globe(I, 32, 23.5, 17, -0.45);
    part(I, 'M15 39 C15 47 49 47 49 39 L47 34 H17 Z', brass, { sd: 1.6, hd: 1.2 });
  }
};
/** Eternal Pose: hourglass stand, glass globe between two wooden discs. */
D.eternalPose = (I, o = {}) => {
  const wood = o.wood || '#8a5a30';
  part(I, rrect(11, 47, 42, 9, 2.5), wood, { sd: 1.6, hd: 1 });
  part(I, ellipse(32, 47, 21, 4.8), lt(wood, 0.18), { sd: 0.8, hd: 0.6 });
  if (!I.small) part(I, rrect(23, 49.5, 18, 4.6, 1), '#efe3c4', { flat: true, ol: I.ol * 0.6 });
  for (const x of [14.5, 49.5]) tube(I, `M${x} 14 V47`, lt(wood, 0.08), 3.4);
  globe(I, 32, 30.5, 13.5, -0.8);
  part(I, rrect(11, 8, 42, 8, 2.5), wood, { sd: 1.4, hd: 1 });
  part(I, ellipse(32, 8.5, 21, 4.4), lt(wood, 0.22), { sd: 0.6, hd: 0.5 });
};
/** Vivre Card: a torn scrap of white paper. */
D.vivre = (I, o = {}) => {
  tf(I, { r: -0.2 }, () => {
    const p = 'M15 10 L20 8.5 L24 10.5 L29 8 L33 10 L38 8.5 L42 10.5 L47 9 L49 13 L47.5 18 L50 23 L48 29 L50.5 35 L48.5 41 L50 47 L48 52 L43 53.5 L38 52 L33 54 L28 52.5 L23 54 L18 52.5 L14 53 L15.5 47 L13.5 41 L15.5 35 L13.5 29 L15.5 23 L13.5 17 Z';
    part(I, p, '#fbf8f0', { sd: 2.4, shT: 0.14, hd: 1.2 });
    if (!I.small) { ln(I, 'M20 21 C24 18.5 28 23 32 20 C35 18 38 21 42 19', '#a79f8e', 1.3, { a: 0.85 }); ln(I, 'M21 28 C25 26 28 29 32 27', '#a79f8e', 1.2, { a: 0.7 }); }
    part(I, 'M41 53.5 L48 52 L50 47 C46 46 42 49 41 53.5 Z', '#e2dccb', { sd: 0.5, hd: 0, ol: I.ol * 0.6 });
    if (o.burn) part(I, 'M47 9 L49 13 L47.5 18 L50 23 C44 24 40 19 41 14 C42 11 44 10 47 9 Z', '#6b4a3a', { sd: 0.6, hd: 0, ol: I.ol * 0.6 });
  });
};
/** Den Den Mushi: snail with a receiver on its shell. */
D.denDen = (I) => {
  const body = '#b9d27e', shell = '#b5773a';
  part(I, 'M6 50 C6 45 10 42 16 42 H52 C58 42 61 46 60 51 C59 55 55 57 50 57 H14 C9 57 6 55 6 50 Z', body, { sd: 2, hd: 1.4 });
  tube(I, 'M13 27 C11 21 9.5 17 8.5 13', body, 3); tube(I, 'M19.5 26 C19.5 20 20.5 16 22.5 12', body, 3);
  part(I, 'M7 49 C4 40 6 28 14 25 C20 23 25 28 25 36 L24 46 Z', body, { sd: 2, hd: 1.4 });
  for (const [x, y] of [[8.5, 12], [22.5, 11]]) { part(I, circle(x, y, 3.7), '#f7f4ec', { sd: 0.6, hd: 0.4 }); fl(I, circle(x + 0.8, y + 0.7, 1.7), OUT); }
  if (!I.small) ln(I, 'M8 38.5 C11 41 14.5 41 17 38.5', dk(body, 0.5), 1.3);
  part(I, circle(41, 32, 15), shell, { sd: 2.8, hd: 1.8 });
  ln(I, spiral(41, 32, 12, 1.7, 0.4), dk(shell, 0.42), 1.6);
  ln(I, 'M54 19 c3 1 1 3 3 4 c3 1 0 3 2 5 c2 2 -1 3 0 5', OUT, 1.3);
  tube(I, 'M29.5 15 C32 9 48 9 51 15', '#ece6d6', 4.2);
  part(I, ellipse(28.5, 16.5, 4.8, 3.4, 0.45), '#ece6d6', { sd: 1, shT: 0.25, hd: 0.8 });
  part(I, ellipse(52, 16.5, 4.8, 3.4, -0.45), '#ece6d6', { sd: 1, shT: 0.25, hd: 0.8 });
};
/** Seastone handcuffs: two cuffs and a short chain. */
D.cuffs = (I, o = {}) => {
  const m = o.color || '#6f8e92';
  const ring = (cx, cy, rx, ry, rot) => { const p = new Path2D(); p.addPath(ellipse(cx, cy, rx, ry, rot)); p.addPath(ellipse(cx, cy, rx * 0.64, ry * 0.6, rot)); return p; };
  for (const [x, y, r] of [[29.5, 31.5, 0.9], [34.5, 27.5, -0.6]]) part(I, ring(x, y, 4.6, 2.8, r), '#8c969e', { rule: 'evenodd', sd: 0.6, hd: 0.4, ol: I.ol * 0.8 });
  part(I, ring(19, 42, 14.5, 12.5, 0.35), m, { rule: 'evenodd', sd: 2.2, hd: 1.4 });
  part(I, xf(rrect(22, 29, 9, 7, 1.6), { r: 0.35, ox: 26, oy: 32 }), dk(m, 0.12), { sd: 0.8, hd: 0.6 });
  part(I, ring(46, 21, 13, 11, -0.45), m, { rule: 'evenodd', sd: 2.2, hd: 1.4 });
  part(I, xf(rrect(34, 24, 8, 6.5, 1.6), { r: -0.45, ox: 38, oy: 27 }), dk(m, 0.12), { sd: 0.8, hd: 0.6 });
  if (!I.small) for (const [x, y] of [[26, 32.5], [38, 27]]) fl(I, circle(x, y, 1), OUT);
};
/** South Bird: round bird that always faces south (beak down). */
D.bird = (I, o = {}) => {
  const col = o.color || '#c8743a';
  part(I, 'M44 42 L61 49 L59 38 Z', dk(col, 0.15), { sd: 0.8, hd: 0.6 });
  const body = ellipse(35, 37, 18, 15.5);
  part(I, body, col, { sd: 3, hd: 2 });
  clip(I, body, () => fl(I, ellipse(29, 44, 13.5, 10.5), '#f3dfb5'));
  part(I, 'M34 31 C44 28.5 53 34 52.5 43 C46 45 38 43 34 38.5 Z', dk(col, 0.12), { sd: 1, hd: 0.8 });
  tube(I, 'M29 52 V58 M38 52.5 V58', '#e39a3a', 1.8, { flat: true });
  part(I, circle(22, 23, 11.5), col, { sd: 2.2, hd: 1.6 });
  part(I, 'M21.5 11.5 C23 6 28 5 31 8.5 C27.5 9 25.5 10.5 24.5 13 Z', dk(col, 0.1), { sd: 0.6, hd: 0.4 });
  part(I, 'M14 25.5 L7.5 36 L18 29.5 Z', '#f2a33a', { sd: 0.8, hd: 0.5 });
  part(I, circle(19, 20.5, 3.4), '#ffffff', { flat: true, ol: I.ol * 0.6 });
  fl(I, circle(18.6, 21.4, 1.8), OUT);
};

// ---------------------------------------------------- documents & paper
/** Poneglyph rubbing: red sheet of glyph blocks on two rollers. */
D.rubbing = (I) => {
  const red = '#b3261e';
  const sheet = rrect(12, 13, 40, 38, 0.5);
  part(I, sheet, red, { sd: 2, hd: 1.2 });
  clip(I, sheet, () => {
    const n = I.small ? 3 : 4, step = 32 / n;
    let k = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = 16 + c * step, y = 17 + r * (30 / n), w = step - 2.6, h = 30 / n - 2.4, q = hash('pg' + k++);
      fl(I, rrect(x, y, w, h, 1), dk(red, 0.55));
      if (!I.small) {
        if (q & 1) fl(I, rrect(x + 1 + (q >> 3 & 3), y + 1, 1.3, h - 2, 0.4), lt(red, 0.25));
        if (q & 2) fl(I, rrect(x + 1, y + 1.4 + (q >> 5 & 1) * 1.4, w - 2, 1.2, 0.4), lt(red, 0.25));
        if (q & 4) fl(I, circle(x + w - 2, y + h - 2, 0.9), lt(red, 0.25));
      }
    }
  });
  for (const y of [12, 52]) {
    part(I, rrect(9, y - 3.2, 46, 6.4, 3.2), '#5a3a22', { sd: 1, hd: 0.8 });
    for (const x of [8, 56]) part(I, circle(x, y, 3.2), '#8a6a44', { sd: 0.6, hd: 0.5 });
  }
};
/** Rolled-edge chart: treasure map (path + X) or a sea chart (grid + compass). */
D.map = (I, o = {}) => {
  const paper = '#ead6a6';
  const sheet = 'M12 12 C20 14 28 10 36 12 C44 14 48 11 52 12 V51 C44 49 40 53 32 51 C24 49 18 53 12 51 Z';
  part(I, sheet, paper, { sd: 2.2, hd: 1.4 });
  clip(I, sheet, () => {
    if (o.chart) {
      if (!I.small) { for (let x = 17; x < 52; x += 7) ln(I, `M${x} 8 V56`, dk(paper, 0.22), 0.8, { a: 0.7 }); for (let y = 18; y < 52; y += 7) ln(I, `M8 ${y} H56`, dk(paper, 0.22), 0.8, { a: 0.7 }); }
      part(I, 'M16 24 C20 18 28 19 30 25 C31 31 24 35 19 32 C16 30 15 27 16 24 Z', '#9cc07a', { sd: 0.8, hd: 0.6, ol: I.ol * 0.6 });
      part(I, 'M33 38 C37 33 46 34 46 40 C46 46 38 47 35 44 Z', '#9cc07a', { sd: 0.8, hd: 0.6, ol: I.ol * 0.6 });
      part(I, star(42, 22, 4, 7, 2), '#c8372d', { sd: 0.6, hd: 0, ol: I.ol * 0.6 });
      if (!I.small) ln(I, 'M22 44 L28 38 L36 30', '#2f5f96', 1.2, { dash: [2, 1.8] });
    } else {
      part(I, 'M16 21 C22 15 34 16 40 22 C46 28 44 38 36 42 C28 46 18 43 16 35 C14 29 12 25 16 21 Z', '#a9c77e', { sd: 1, hd: 0.8, ol: I.ol * 0.6 });
      if (!I.small) for (const [x, y] of [[22, 26], [27, 31], [24, 36]]) part(I, poly([[x, y - 3], [x + 2.6, y + 1.2], [x - 2.6, y + 1.2]]), '#6f9a4f', { flat: true, ol: 0 });
      ln(I, 'M18 46 C22 40 28 42 30 35 C31.5 30 34 28 36.5 25.5', '#8a3a2a', 1.5, { dash: [2.2, 2] });
      tube(I, 'M34.5 20 L41.5 27 M41.5 20 L34.5 27', '#d23b32', 2.4, { ol: I.ol * 0.6 });
    }
  });
  for (const x of [12, 52]) { part(I, rrect(x - 3.5, 9, 7, 45, 3.5), lt(paper, 0.1), { sd: 1.2, hd: 1 }); fl(I, ellipse(x, 9.5, 2.4, 1.2), dk(paper, 0.35)); }
};
/** Skeleton key (gold) or a heavy iron key with a chain. */
D.key = (I, o = {}) => {
  const metal = o.big ? '#8c969e' : C.gold;
  if (o.big) for (const [x, y, r] of [[9, 47, 0.7], [13, 53, -0.8], [18, 58, 0.7]]) { const l = new Path2D(); l.addPath(ellipse(x, y, 4, 2.6, r)); l.addPath(ellipse(x, y, 2.2, 1.1, r)); part(I, l, '#6c7780', { rule: 'evenodd', sd: 0.6, hd: 0.4, ol: I.ol * 0.8 }); }
  tf(I, { r: -0.78 }, () => {
    part(I, rrect(21, 29, 36, 6, 2), metal, { sd: 1.2, hd: 0.8 });
    part(I, 'M44 34 H57 V44 H53 V39 H49 V43.5 H44 Z', metal, { sd: 1.2, hd: 0.8 });
    const bow = new Path2D(); bow.addPath(o.big ? rrect(3, 22, 20, 20, 5) : union(circle(14, 26, 5.6), circle(14, 38, 5.6), circle(8, 32, 5.6), circle(18, 32, 6))); bow.addPath(circle(o.big ? 13 : 13.5, 32, o.big ? 4.6 : 3.4));
    part(I, bow, metal, { rule: 'evenodd', sd: 1.6, hd: 1.2 });
    part(I, rrect(21, 27.5, 3.4, 9, 1), dk(metal, 0.15), { sd: 0.6, hd: 0.4 });
  });
};
/** Envelope with a wax seal (a heart for invitations). */
D.envelope = (I, o = {}) => {
  const paper = o.color || '#f4ecd8';
  const b = rrect(6, 16, 52, 36, 3);
  part(I, b, paper, { sd: 2.4, shT: 0.18, hd: 1.4 });
  clip(I, b, () => ln(I, 'M6 52 L27 33 M58 52 L37 33', dk(paper, 0.2), 1.2));
  part(I, 'M6.5 17.5 L32 38 L57.5 17.5 C57 16.5 56 16 55 16 H9 C8 16 7 16.5 6.5 17.5 Z', dk(paper, 0.06), { sd: 1.2, shT: 0.15, hd: 0.8 });
  if (o.heart) part(I, heartP(32, 37.5, 7.4), '#e0487a', { sd: 1.2, hd: 0.8, gloss: [29, 34, 1.6, 1, 0.7] });
  else part(I, sealP(32, 37.5, 6.6), '#c8372d', { sd: 1.2, hd: 0.8 });
  if (!o.heart && !I.small) ln(I, circle(32, 37.5, 3.6), dk('#c8372d', 0.35), 1);
};
const BOOK_COLS = ['#8e2f2a', '#2f5f8f', '#3f7a3a', '#6b3f8a', '#8a5a2a', '#2a5a5a'];
/** Closed book with a bookmark ribbon (a comic gets a loud cover). */
D.book = (I, o = {}) => {
  const col = o.color || BOOK_COLS[hash(o.id || 'b') % BOOK_COLS.length];
  part(I, 'M18 11 H50 C51.5 11 53 12.5 53 14 V53 C53 54.5 51.5 56 50 56 H18 Z', '#f3ead3', { sd: 1.2, shT: 0.18, hd: 0 });
  if (!I.small) for (let x = 49.2; x < 53; x += 1.5) ln(I, `M${x} 12.5 V54.5`, '#d9ceb4', 0.6);
  if (o.ribbon !== false) tube(I, 'M40 50 V61', '#c8372d', 3, { cap: 'butt' });
  const cover = rrect(11, 8, 39, 46, 3);
  part(I, cover, o.comic ? '#f2c230' : col, { sd: 2.6, hd: 1.8 });
  part(I, rrect(11, 8, 7, 46, 3), dk(o.comic ? '#e0572a' : col, 0.22), { sd: 1, hd: 0.8 });
  if (o.comic) {
    part(I, star(34, 30, 9, 14, 8), '#e0572a', { sd: 1, hd: 0.8, ol: I.ol * 0.7 });
    if (!I.small) part(I, star(34, 30, 5, 6.5, 3), '#ffffff', { flat: true, ol: I.ol * 0.5 });
  } else {
    if (!I.small) for (const [x, y] of [[20, 11], [47, 11], [20, 51], [47, 51]]) part(I, circle(x, y, 1.6), C.gold, { flat: true, ol: I.ol * 0.5 });
    part(I, poly([[34, 21], [41, 31], [34, 41], [27, 31]]), C.gold, { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 });
    if (!I.small) ln(I, rrect(22, 14, 24, 34, 1.5), lt(col, 0.3), 0.9, { a: 0.8 });
  }
};
D.notebook = (I) => {
  const pad = rrect(12, 10, 36, 47, 2);
  part(I, pad, '#f7f4ec', { sd: 2.4, shT: 0.15, hd: 1.2 });
  clip(I, pad, () => {
    for (let y = 21; y < 56; y += 5) ln(I, `M12 ${y} H48`, '#9cc0e0', 0.9);
    ln(I, 'M19 10 V58', '#e07a7a', 0.9);
    if (!I.small) { ln(I, 'M23 24 C27 21.5 30 26 34 22.5', OUT, 1.1, { a: 0.6 }); ln(I, circle(33, 37, 5), OUT, 1, { a: 0.6 }); ln(I, 'M24 42 L33 37 L42 30', OUT, 1, { a: 0.6 }); }
  });
  for (let x = 16; x < 46; x += 5) tube(I, `M${x} 13 C${x} 7 ${x + 2.5} 7 ${x + 2.5} 11`, '#7c868d', 1.6);
  tf(I, { r: -0.78, ox: 46, oy: 46 }, () => {
    part(I, rrect(28, 42.5, 26, 6, 1), '#f2c230', { sd: 1, hd: 0.7 });
    part(I, poly([[54, 42.5], [61, 45.5], [54, 48.5]]), '#efd9b0', { sd: 0.5, hd: 0.3 });
    fl(I, poly([[59, 44.6], [61, 45.5], [59, 46.4]]), OUT);
    part(I, rrect(24, 42.5, 5, 6, 1), '#f08aa0', { sd: 0.6, hd: 0.4 });
  });
};
D.ticket = (I, o = {}) => {
  const col = o.color || '#2f8a86';
  tf(I, { r: -0.28 }, () => {
    const t = new Path2D();
    t.moveTo(8, 18); t.lineTo(56, 18); t.lineTo(56, 27); t.arc(56, 32, 5, -Math.PI / 2, Math.PI / 2, true); t.lineTo(56, 46); t.lineTo(8, 46); t.lineTo(8, 37); t.arc(8, 32, 5, Math.PI / 2, -Math.PI / 2, true); t.closePath();
    part(I, t, '#f3e6c4', { sd: 2, shT: 0.18, hd: 1.2 });
    clip(I, t, () => { fl(I, rrect(8, 18, 34, 28, 0), col); ln(I, 'M42 18 V46', OUT, 1.1, { dash: [2, 2] }); });
    part(I, star(25, 32, 5, 7.5, 3.2), '#f3e6c4', { sd: 0.8, hd: 0.5, ol: I.ol * 0.7 });
    if (!I.small) { ln(I, 'M46 26 H52 M46 31 H51 M46 36 H52', dk('#f3e6c4', 0.4), 1.2); }
  });
};
/** A loose page (o.wet: water-stained, running ink). */
D.page = (I, o = {}) => {
  const paper = o.wet ? '#dfe7e2' : '#f4ecd8';
  tf(I, { r: 0.12 }, () => {
    const p = o.wet ? 'M14 8 H42 L52 18 V52 C48 55 45 52 41 55 C37 58 34 54 30 56 C26 58 22 55 18 57 L14 55 Z' : 'M14 8 H42 L52 18 V56 H14 Z';
    part(I, p, paper, { sd: 2.2, shT: 0.15, hd: 1.2 });
    clip(I, p, () => {
      for (let y = 24; y < 52; y += 5) ln(I, `M19 ${y} H${y % 2 ? 44 : 47}`, o.wet ? '#6f8fa8' : '#8a7a64', 1.3, { a: o.wet ? 0.55 : 0.75 });
      if (o.wet) { for (const [x, y, r] of [[36, 36, 7], [22, 46, 5], [42, 24, 4]]) fl(I, circle(x, y, r), '#8fb8c8', { a: 0.35 }); if (!I.small) for (const x of [24, 33, 44]) ln(I, `M${x} 26 V${36 + (x % 7)}`, '#6f8fa8', 1, { a: 0.5 }); }
    });
    part(I, 'M42 8 V18 H52 Z', dk(paper, 0.12), { sd: 0.6, hd: 0.4 });
  });
};
/** Wanted poster (or a theatre playbill). */
D.poster = (I, o = {}) => {
  const paper = o.play ? '#f1d6e2' : '#ecd8a6';
  const p = 'M12 8 L14 6.5 H50 L52 8.5 V56 L50 57.5 H14 L12 56 Z';
  part(I, p, paper, { sd: 2.4, hd: 1.4 });
  fl(I, rrect(17, 11, 30, 6, 1.2), o.play ? '#8e2a5a' : '#3a2a1c');
  part(I, rrect(17, 20, 30, 22, 1), o.play ? '#f7e8ee' : '#d9c28e', { sd: 1, hd: 0, ol: I.ol * 0.6 });
  clip(I, rrect(17, 20, 30, 22, 1), () => {
    const sil = o.play ? '#8e2a5a' : '#6b5438';
    fl(I, circle(32, 29, 5.6), sil);
    fl(I, 'M20 44 C20 36 26 34 32 34 C38 34 44 36 44 44 Z', sil);
    if (o.play) fl(I, 'M25.5 28 C25 21 39 21 38.5 28 C37 25 27 25 25.5 28 Z', '#e0b24a');
  });
  fl(I, rrect(19, 45, 26, 3.4, 1.2), o.play ? '#8e2a5a' : '#3a2a1c');
  if (!I.small) fl(I, rrect(23, 50, 18, 2.6, 1), o.play ? '#8e2a5a' : '#3a2a1c', { a: 0.75 });
  if (o.play) part(I, star(47, 12, 5, 5, 2.2), '#e0b24a', { sd: 0.5, hd: 0.3, ol: I.ol * 0.6 });
  for (const x of [15.5, 48.5]) part(I, circle(x, 10.5, 1.8), '#8a8f96', { flat: true, ol: I.ol * 0.5 });
};
/** Rolled scroll tied with a ribbon (o.seal adds a wax seal). */
D.scroll = (I, o = {}) => {
  const paper = o.color || '#efe0bb';
  tf(I, { r: -0.62 }, () => {
    for (const x of [5.5, 58.5]) part(I, rrect(x - 3, 27, 6, 10, 2.5), '#6e4526', { sd: 0.8, hd: 0.6 });
    const body = rrect(8, 22, 48, 20, 5);
    part(I, body, paper, { sd: 2.4, hd: 1.6 });
    part(I, ellipse(55, 32, 4.2, 10), lt(paper, 0.1), { sd: 0.8, hd: 0.5 });
    if (!I.small) ln(I, spiral(55, 32, 3.4, 1.2, 0), dk(paper, 0.35), 0.9);
    part(I, rrect(27, 21, 7, 22, 1), o.ribbon || '#c8372d', { sd: 0.8, hd: 0.6 });
    if (o.seal) part(I, sealP(30.5, 42, 5.4), o.seal, { sd: 1, hd: 0.7 });
  });
};
D.dice = (I) => {
  tf(I, { r: 0.35, ox: 45, oy: 19 }, () => {
    part(I, rrect(35, 9, 20, 20, 4), '#c8372d', { sd: 1.6, hd: 1.2 });
    for (const [x, y] of [[40, 14], [45, 19], [50, 24]]) fl(I, circle(x, y, 1.8), '#fbf8f0');
  });
  const top = [[26, 22], [45, 31], [26, 40], [7, 31]], L = [[7, 31], [26, 40], [26, 60], [7, 51]], R = [[26, 40], [45, 31], [45, 51], [26, 60]];
  part(I, union(poly(top), poly(L), poly(R)), '#f4f1ea', { sd: 0, hd: 0 });
  fl(I, poly(L), '#e2dccf'); fl(I, poly(R), '#c9c0b0'); fl(I, poly(top), '#fbf8f0');
  ln(I, 'M7 31 L26 40 L45 31 M26 40 V60', '#a89f8c', 1);
  const face = (A, B, Dd, u, v, r, col) => { const x = A[0] + u * (B[0] - A[0]) + v * (Dd[0] - A[0]), y = A[1] + u * (B[1] - A[1]) + v * (Dd[1] - A[1]); fl(I, ellipse(x, y, r, r * 0.72, Math.atan2(B[1] - A[1], B[0] - A[0])), col); };
  face(top[3], top[0], top[2], 0.5, 0.5, 3, '#c8372d');
  for (const [u, v] of [[0.28, 0.3], [0.72, 0.7]]) face(L[0], L[1], L[3], u, v, 2, OUT);
  for (const [u, v] of [[0.26, 0.25], [0.74, 0.25], [0.5, 0.5], [0.26, 0.75], [0.74, 0.75]]) face(R[0], R[1], R[3], u, v, 1.9, OUT);
};
D.tag = (I, o = {}) => {
  const col = o.color || '#e0b24a';
  tube(I, 'M15 29 C8 22 9 11 18 8', '#c8372d', 1.8);
  tf(I, { r: -0.35 }, () => {
    const t = new Path2D(); t.addPath(P('M22 16 H50 C52 16 54 18 54 20 V48 C54 50 52 52 50 52 H22 L12 34 Z')); t.addPath(circle(20.5, 34, 2.8));
    part(I, t, col, { rule: 'evenodd', sd: 2, hd: 1.4 });
    if (o.rabbit) fl(I, union(ellipse(38, 39, 6.4, 5.4), ellipse(34.6, 28, 1.9, 6, -0.25), ellipse(41.4, 28, 1.9, 6, 0.25)), dk(col, 0.42));
    else if (!I.small) ln(I, rrect(27, 22, 22, 24, 2), dk(col, 0.3), 1.1);
  });
};
D.horn = (I, o = {}) => {
  const ivory = o.color || '#efe4c8';
  const pts = bez([8, 52], [14, 30], [32, 14], [54, 13], 18);
  tube(I, 'M13 42 C20 54 40 50 46 26', '#8a5a30', 1.8);
  part(I, taper(pts, 3, 17, 1.6), ivory, { sd: 2, hd: 1.4 });
  for (const t of [0.4, 0.72]) { const i = Math.round(t * 18), [x, y] = pts[i], [x2, y2] = pts[i + 1], a = Math.atan2(y2 - y, x2 - x), w = (3 + 14 * Math.pow(t, 1.6)) / 2 + 0.8; tube(I, `M${x - Math.sin(a) * w} ${y + Math.cos(a) * w} L${x + Math.sin(a) * w} ${y - Math.cos(a) * w}`, C.gold, 2.4, { ol: I.ol * 0.7 }); }
  part(I, ellipse(54, 13.2, 3.6, 8.6, 0.05), dk(ivory, 0.5), { sd: 0, hd: 0, ol: I.ol * 0.8 });
  part(I, rrect(5, 49, 6, 6, 1.5), C.gold, { sd: 0.6, hd: 0.4 });
};
/** Flag on a pole: o.emblem 'skull' | 'sun', o.tattered. */
D.flag = (I, o = {}) => {
  tube(I, 'M12 61 V7', '#7a4a2a', 3.6);
  part(I, circle(12, 5.5, 3.2), C.gold, { sd: 0.6, hd: 0.4 });
  const cloth = o.tattered ? 'M14 9 C24 5 34 13 45 9 L50 8 L47 14 L53 16 L49 21 L55 25 L50 29 L53 35 C45 36 41 40 33 38 L30 42 L26 37 C22 36 18 36 14 38 Z'
    : 'M14 9 C24 5 34 13 45 9 C49 7.5 53 7 58 8 L58 38 C51 36 45 40 35 40 C25 40 21 35 14 38 Z';
  const col = o.color || '#2b2631';
  part(I, cloth, col, { sd: 2.4, hd: 1.6, hi: lt(col, 0.3) });
  if (o.tattered) cut(I, ellipse(46, 27, 2.6, 2));
  if (o.emblem === 'sun') {
    const sx = o.tattered ? 32 : 35, sy = 23;
    part(I, star(sx, sy, 10, 11, 7.6), '#d23b32', { sd: 0.8, hd: 0.5, ol: I.ol * 0.7 });
    part(I, circle(sx, sy, 5.8), '#e8503a', { sd: 0.8, hd: 0.6, ol: I.ol * 0.6 });
  } else skull(I, o.tattered ? 31 : 35, 21, 5.6);
};
D.umbrella = (I, o = {}) => {
  const col = o.color || '#5b3f8a';
  tf(I, { r: -0.3 }, () => {
    tube(I, 'M32 28 V55 C32 61 24 61 24 56', '#3a2a1c', 2.6);
    const can = 'M5 30 C7 16 19 8 32 8 C45 8 57 16 59 30 C55 27 50 27 46 30 C42 27 36 27 32 30 C28 27 22 27 18 30 C14 27 9 27 5 30 Z';
    part(I, can, col, { sd: 2.6, hd: 1.8, hi: lt(col, 0.4) });
    clip(I, can, () => { fl(I, 'M32 8 L18 31 H32 Z', lt(col, 0.14)); fl(I, 'M32 8 L46 31 H62 V8 Z', dk(col, 0.1)); ln(I, 'M32 8 L18 30 M32 8 L32 30 M32 8 L46 30', dk(col, 0.4), 1); });
    tube(I, 'M32 8 V3.5', '#3a2a1c', 2);
    if (o.bolt) part(I, 'M27 11 L22 21 L27 21 L24 28 L33 17 L28 17 L31 11 Z', '#f6d94a', { sd: 0.6, hd: 0.4, ol: I.ol * 0.7 });
  });
};

// ------------------------------------------------------------- treasure
/** Treasure chest (o.iron: a steel strongbox with a padlock). */
D.chest = (I, o = {}) => {
  const wood = o.iron ? '#7a8791' : '#9c6a3c', band = o.iron ? '#4b545b' : C.gold;
  const shape = union(rrect(8, 30, 48, 26, 3), 'M8 31 V23 C8 14 18 10 32 10 C46 10 56 14 56 23 V31 Z');
  if (!o.iron) for (const [x, y] of [[20, 29], [26, 28], [40, 28.5]]) part(I, ellipse(x, y, 4.6, 2.2), C.gold, { sd: 0.5, hd: 0.3, ol: I.ol * 0.7 });
  part(I, rrect(8, 30, 48, 26, 3), wood, { sd: 2.6, hd: 1.6 });
  part(I, 'M8 30 V23 C8 14 18 10 32 10 C46 10 56 14 56 23 V30 Z', lt(wood, 0.08), { sd: 2, hd: 1.6 });
  clip(I, shape, () => {
    if (!I.small && !o.iron) for (const y of [20, 42, 49]) ln(I, `M8 ${y} H56`, dk(wood, 0.35), 1, { a: 0.8 });
    for (const x of [16, 48]) part(I, rrect(x - 3, 8, 6, 50, 0.5), band, { sd: 0.8, hd: 0.6, ol: I.ol * 0.7 });
  });
  part(I, rrect(6.5, 27.5, 51, 5, 1.5), band, { sd: 0.8, hd: 0.6 });
  if (o.iron) {
    if (!I.small) for (const [x, y] of [[12, 36], [12, 51], [52, 36], [52, 51], [24, 14], [40, 14]]) part(I, circle(x, y, 1.3), lt(wood, 0.35), { flat: true, ol: I.ol * 0.5 });
    tube(I, 'M27.5 38 V33 C27.5 27.5 36.5 27.5 36.5 33 V38', '#9aa4ab', 2.4);
    part(I, rrect(25, 37, 14, 12, 2), '#d6a23e', { sd: 1, hd: 0.8 });
    fl(I, circle(32, 42, 1.6), OUT); fl(I, rrect(31.3, 42, 1.4, 4, 0.5), OUT);
  } else {
    part(I, rrect(27, 26, 10, 12, 2), band, { sd: 1, hd: 0.8 });
    fl(I, circle(32, 30.5, 1.5), OUT); fl(I, poly([[31, 31], [33, 31], [33.6, 35], [30.4, 35]]), OUT);
  }
};
D.bell = (I, o = {}) => {
  const gold = o.color || '#e7b53c';
  tube(I, 'M26 11 C26 3.5 38 3.5 38 11', gold, 3);
  const b = 'M32 9 C22 9 17 16 17 27 C17 37 15 43 9 48 H55 C49 43 47 37 47 27 C47 16 42 9 32 9 Z';
  part(I, b, gold, { sd: 3.2, hd: 2.2 });
  clip(I, b, () => {
    ln(I, 'M15 21 C24 24.5 40 24.5 49 21', dk(gold, 0.35), 1.4); ln(I, 'M13 40 C24 43.5 40 43.5 51 40', dk(gold, 0.35), 1.4);
    if (!I.small) for (const x of [22, 32, 42]) ln(I, spiral(x, 32, 3.6, 1.4, x), dk(gold, 0.35), 1);
  });
  part(I, rrect(7, 46, 50, 7, 3.5), dk(gold, 0.06), { sd: 1.2, hd: 1 });
  part(I, circle(32, 56.5, 4), dk(gold, 0.15), { sd: 0.8, hd: 0.6 });
};
D.statue = (I, o = {}) => {
  const gold = o.color || '#e7b53c';
  part(I, rrect(11, 50, 42, 9, 2), dk(gold, 0.22), { sd: 1.4, hd: 1 });
  part(I, rrect(15, 45, 34, 6.5, 2), dk(gold, 0.1), { sd: 1, hd: 0.8 });
  part(I, 'M18 46 C16 36 20 28 32 27 C44 28 48 36 46 46 Z', gold, { sd: 2.6, hd: 1.8 });
  part(I, 'M20 41 C24 36 40 36 44 41 C40 44 24 44 20 41 Z', dk(gold, 0.08), { sd: 1, hd: 0.8 });
  part(I, 'M22.5 15 L25.5 5 L29 10 L32 3.5 L35 10 L38.5 5 L41.5 15 Z', gold, { sd: 1, hd: 0.8 });
  part(I, circle(32, 19, 8.2), gold, { sd: 1.8, hd: 1.4 });
  if (!I.small) { ln(I, 'M28 19 H30.5 M33.5 19 H36', dk(gold, 0.5), 1.2); ln(I, 'M30 23 C31.3 24 32.7 24 34 23', dk(gold, 0.5), 1); }
  gloss(I, 27, 15.5, 2, 1.2, 0.8);
  sparkle(I, 48, 12, 4.5);
};
/** Mermaid pearl in an open clam shell. */
D.pearl = (I) => {
  const shell = '#f0b9a3';
  const up = 'M8 38 C8 18 20 8 32 8 C44 8 56 18 56 38 C50 35 43 34 32 34 C21 34 14 35 8 38 Z';
  part(I, up, shell, { sd: 2, hd: 1.4 });
  if (!I.small) clip(I, up, () => { for (let i = -3; i <= 3; i++) ln(I, `M32 36 L${32 + i * 8} 6`, dk(shell, 0.28), 1.1, { a: 0.8 }); });
  part(I, 'M5 40 C8 52 20 58 32 58 C44 58 56 52 59 40 C52 44 42 46 32 46 C22 46 12 44 5 40 Z', lt(shell, 0.08), { sd: 2, hd: 1.2 });
  glow(I, circle(32, 38, 15.5), '#fff6fb', 0.5);
  part(I, circle(32, 38, 11.5), '#f7f2fa', { sd: 2.4, sh: '#d9cfe6', hd: 1.4, gloss: [28, 34, 3, 2, 0.95, -0.6] });
  if (!I.small) ln(I, arcPath(32, 38, 8.6, 0.2, 1.4), '#f6c6de', 1.4, { a: 0.8 });
};
D.coins = (I, o = {}) => {
  const gold = o.color || C.gold;
  for (let i = 0; i < 5; i++) { const y = 52 - i * 5.2; part(I, rrect(7, y - 3, 28, 6, 3), dk(gold, 0.12), { sd: 0.8, hd: 0.6, ol: I.ol * 0.8 }); part(I, ellipse(21, y - 3, 14, 3.6), gold, { sd: 0.8, hd: 0.5, ol: I.ol * 0.8 }); }
  part(I, ellipse(45, 36, 13, 14), dk(gold, 0.15), { sd: 0.8, hd: 0.6 });
  part(I, ellipse(44, 36, 12, 14), gold, { sd: 2.2, hd: 1.6 });
  if (!I.small) ln(I, ellipse(44, 36, 8.6, 10.4), dk(gold, 0.3), 1.2);
  part(I, star(44, 36.5, 5, 6, 2.8), lt(gold, 0.25), { sd: 0.6, hd: 0.4, ol: I.ol * 0.6 });
  part(I, ellipse(46, 55, 11, 3.6), gold, { sd: 0.8, hd: 0.6, ol: I.ol * 0.8 });
  sparkle(I, 55, 21, 4);
};
D.jewels = (I) => {
  gem(I, 20, 24, 11, '#2f78d6');
  gem(I, 45, 26, 10, '#2fae66');
  gem(I, 13, 48, 6.5, '#8e4fd1');
  gem(I, 52, 47, 6.5, '#f0a52a');
  gem(I, 32, 41, 14, '#d7263d');
  sparkle(I, 54, 11, 4.5);
};
D.ingot = (I, o = {}) => {
  const m = o.color || '#b8c7d4';
  const bar = (front, top, col) => { part(I, poly(front), col, { sd: 1.6, hd: 1 }); part(I, poly(top), lt(col, 0.25), { sd: 0.6, hd: 0.6 }); };
  bar([[22, 34], [58, 34], [53, 22], [27, 22]], [[27, 22], [53, 22], [50, 15], [30, 15]], dk(m, 0.06));
  bar([[6, 56], [46, 56], [40, 40], [12, 40]], [[12, 40], [40, 40], [37, 32], [15, 32]], m);
  if (!I.small) part(I, rrect(20, 45, 12, 6, 1), dk(m, 0.12), { flat: true, ol: I.ol * 0.5 });
  sparkle(I, 42, 33, 3.6);
};
D.violin = (I) => {
  tube(I, 'M6 57 L58 13', '#6e4526', 1.8);
  ln(I, 'M8 58.5 L59 15.5', '#f1ead8', 1);
  tf(I, { r: 0.62 }, () => {
    tube(I, 'M32 7 V26', '#2b2631', 4);
    part(I, circle(32, 6, 3.4), '#9a4a18', { sd: 0.6, hd: 0.4 });
    const body = union(ellipse(32, 31, 10.5, 8.5), ellipse(32, 46.5, 13, 11), rrect(26, 32, 12, 10, 3));
    part(I, body, '#b5571d', { sd: 2.6, hd: 1.8 });
    part(I, rrect(29.6, 13, 4.8, 26, 2), '#2b2631', { sd: 0.6, hd: 0.4 });
    if (!I.small) { ln(I, 'M25.5 40 c-1.6 2 1.6 4 0 6 M38.5 40 c1.6 2 -1.6 4 0 6', OUT, 1.1); for (const x of [30.8, 32, 33.2]) ln(I, `M${x} 13 V53`, '#f1ead8', 0.5); }
    part(I, rrect(27, 45, 10, 2, 0.6), '#e9d3a0', { flat: true, ol: I.ol * 0.5 });
    part(I, 'M29 49 H35 L34 57 H30 Z', '#2b2631', { sd: 0.4, hd: 0.3 });
  });
};
D.perfume = (I) => {
  const liquid = '#c77dd8';
  tube(I, 'M42 31 C50 29 54 35 55 41', '#e0b24a', 1.4, { flat: true });
  part(I, ellipse(55.5, 46, 5.2, 6.5), '#e0487a', { sd: 1, hd: 0.8 });
  const b = 'M18 30 C12 36 12 50 20 56 C24 59 40 59 44 56 C52 50 52 36 46 30 Z';
  part(I, b, '#eadcf2', { sd: 1.4, shT: 0.15, hd: 0 });
  clip(I, b, () => part(I, rrect(8, 38, 48, 24, 0), liquid, { sd: 2.2, hd: 1.2, ol: 0 }));
  gloss(I, 21, 40, 1.6, 5, 0.75, 0.3);
  part(I, rrect(25, 22, 14, 9, 2), '#e0b24a', { sd: 1, hd: 0.8 });
  part(I, 'M32 5 C36 9 38.5 13 38.5 16.5 C38.5 20.5 35.5 23 32 23 C28.5 23 25.5 20.5 25.5 16.5 C25.5 13 28 9 32 5 Z', lt(liquid, 0.45), { sd: 1.4, hd: 1, gloss: [29.5, 13, 1.2, 2.4, 0.9, 0.3] });
};
D.feather = (I, o = {}) => {
  const col = o.color || '#2aa198', tip = o.tip || '#f0bf45';
  tf(I, { r: 0.75 }, () => {
    const vane = 'M32 4 C42 12 44 26 42 40 C41 46 37 51 32 53 C27 51 23 46 22 40 C20 26 22 12 32 4 Z';
    part(I, vane, col, { sd: 2, hd: 1.4, hi: lt(col, 0.45) });
    clip(I, vane, () => {
      fl(I, 'M16 0 H48 V17 C40 20 24 20 16 17 Z', tip);
      if (!I.small) for (let y = 12; y < 50; y += 4) { ln(I, `M32 ${y + 4} L${22 + (y % 8 ? 1 : 0)} ${y}`, dk(col, 0.3), 0.8, { a: 0.7 }); ln(I, `M32 ${y + 4} L${42 - (y % 8 ? 1 : 0)} ${y}`, dk(col, 0.3), 0.8, { a: 0.7 }); }
    });
    tube(I, 'M32 62 V6', '#f4efe0', 1.8);
  });
};
D.blossom = (I) => {
  sakura(I, 26, 29, 18, '#f7a8c4', 0.15);
  sakura(I, 48, 48, 10.5, '#f48fb1', -0.35);
  part(I, xf('M0 0 C-3 -3 -4 -7 -2.4 -10 L0 -8.6 L2.4 -10 C4 -7 3 -3 0 0 Z', { ox: 0, oy: 0, x: 52, y: 20, r: 0.9, s: 0.9 }), '#f7a8c4', { sd: 0.6, hd: 0.4 });
};
D.flower = (I, o = {}) => {
  const col = o.color || '#e0303a';
  part(I, 'M34 40 C42 46 52 48 60 44 C54 38 44 36 34 40 Z', C.leaf, { sd: 1, hd: 0.8 });
  part(I, 'M28 42 C22 50 14 54 5 52 C9 45 18 41 28 42 Z', dk(C.leaf, 0.08), { sd: 1, hd: 0.8 });
  const petal = 'M0 0 C-10 -4 -13 -14 -8.5 -19.5 C-4.5 -23.5 4.5 -23.5 8.5 -19.5 C13 -14 10 -4 0 0 Z';
  const ps = []; for (let i = 0; i < 5; i++) ps.push(xf(petal, { ox: 0, oy: 0, x: 31, y: 30, r: 0.3 + i / 5 * TAU, s: 1.05 }));
  part(I, union(...ps), col, { sd: 2.4, hd: 1.6 });
  if (!I.small) for (let i = 0; i < 5; i++) { const a = 0.3 + i / 5 * TAU - Math.PI / 2; ln(I, `M${31 + Math.cos(a) * 5} ${30 + Math.sin(a) * 5} L${31 + Math.cos(a) * 14} ${30 + Math.sin(a) * 14}`, dk(col, 0.3), 1, { a: 0.7 }); }
  fl(I, circle(31, 30, 5.5), dk(col, 0.5));
  tube(I, 'M31 30 C35 24 40 19 45 15', '#f3d27a', 1.8, { flat: true });
  for (const [x, y] of [[45.5, 14], [43, 13], [47, 16.5]]) part(I, circle(x, y, 1.6), '#f6c431', { flat: true, ol: I.ol * 0.5 });
};

// ------------------------------------------------------------- materials
D.sack = (I, o = {}) => {
  const burlap = '#c9a870';
  const s = 'M18 24 C10 32 8 46 12 54 C16 59 48 59 52 54 C56 46 54 32 46 24 Z';
  part(I, s, burlap, { sd: 3.4, hd: 2 });
  if (!I.small) clip(I, s, () => { for (let y = 30; y < 58; y += 4) ln(I, `M8 ${y} H56`, dk(burlap, 0.18), 0.8, { a: 0.7 }); for (let x = 12; x < 56; x += 4) ln(I, `M${x} 24 V60`, dk(burlap, 0.15), 0.7, { a: 0.6 }); });
  part(I, 'M20 25 C18 20 20 16 24 17 L40 17 C44 16 46 20 44 25 Z', lt(burlap, 0.1), { sd: 1.4, hd: 1 });
  part(I, ellipse(32, 17, 11, 3.8), dk(burlap, 0.45), { flat: true, ol: I.ol * 0.7 });
  part(I, 'M22.5 17 C24 11 28 8 32 8 C36 8 40 11 41.5 17 C36 19 28 19 22.5 17 Z', o.content || '#f7f5ef', { sd: 1.2, shT: 0.12, hd: 0.8 });
  tube(I, 'M19 25 C27 28 37 28 45 25', '#8a5a30', 2.2);
};
D.wood = (I, o = {}) => {
  const bark = o.adam ? '#4f3322' : '#8a5a30', core = o.adam ? '#e6a547' : '#e8c890';
  const log = (x, y, r) => tf(I, { r: -0.42, ox: x, oy: y }, () => {
    part(I, rrect(x, y - r, 40, r * 2, r * 0.7), bark, { sd: 2, hd: 1.4, hi: lt(bark, 0.35) });
    if (!I.small) clip(I, rrect(x, y - r, 40, r * 2, r * 0.7), () => { for (const dy of [-0.45, 0.1, 0.55]) ln(I, `M${x + 6} ${y + dy * r} H${x + 38}`, dk(bark, 0.35), 1, { a: 0.8 }); });
    part(I, ellipse(x, y, r * 0.62, r), core, { sd: 1, hd: 0.8, ol: I.ol * 0.9 });
    ln(I, ellipse(x, y, r * 0.38, r * 0.62), dk(core, 0.25), 1);
    if (!I.small) ln(I, ellipse(x, y, r * 0.16, r * 0.28), dk(core, 0.3), 0.9);
  });
  log(18, 26, 9);
  log(11, 44, 10.5);
  if (o.adam) { sparkle(I, 52, 13, 4.5, '#fff3c0'); sparkle(I, 56, 34, 3.2, '#fff3c0'); }
};
D.rock = (I, o = {}) => {
  const col = o.color || '#8d8a85';
  const outer = poly([[9, 42], [14, 25], [26, 13], [42, 12], [55, 24], [57, 40], [46, 55], [22, 56]]);
  part(I, outer, col, { sd: 3, hd: 1.4 });
  clip(I, outer, () => {
    fl(I, poly([[9, 25], [26, 11], [43, 10], [37, 26], [22, 30]]), lt(col, 0.3));
    fl(I, poly([[37, 26], [43, 10], [58, 23], [58, 40], [43, 39]]), lt(col, 0.1));
    fl(I, poly([[43, 39], [58, 40], [47, 57], [34, 50]]), dk(col, 0.15));
    ln(I, 'M22 30 L37 26 L43 39 L34 50 M37 26 L43 11 M43 39 L57 40', dk(col, 0.35), 1);
    if (o.speckle && !I.small) for (let i = 0; i < 12; i++) { const q = hash('sp' + i); fl(I, circle(14 + (q % 38), 16 + ((q >> 6) % 36), 0.9), lt(col, 0.45), { a: 0.8 }); }
  });
  if (o.sheen) { ln(I, 'M20 22 L30 16', '#ffffff', 1.6, { a: 0.7 }); sparkle(I, 47, 17, 3.6, o.sheen); }
};
D.herbs = (I, o = {}) => {
  const tips = [[12, 18], [22, 9], [34, 7], [45, 12], [53, 22]];
  const cols = ['#4f9a3a', '#5aa33f', '#3f8a34', '#6fb24a', '#4a9038'];
  tips.forEach(([x, y], i) => {
    tube(I, `M31 58 Q${(31 + x) / 2 + (x - 31) * 0.1} ${(58 + y) / 2} ${x} ${y}`, '#5f7f2e', 1.6, { flat: true });
    for (let t = 0.35; t < 1.01; t += 0.22) {
      const px = 31 + (x - 31) * t, py = 58 + (y - 58) * t, a = Math.atan2(y - 58, x - 31), side = (Math.round(t * 10) % 2 ? 1 : -1);
      part(I, ellipse(px + Math.cos(a + side * 1.2) * 3.4, py + Math.sin(a + side * 1.2) * 3.4, 4.6, 2.3, a + side * 0.9), cols[i], { sd: 0.8, hd: 0.6, ol: I.ol * 0.8 });
    }
  });
  part(I, rrect(25, 44, 13, 5.5, 2), '#c9a870', { sd: 0.8, hd: 0.6 });
};
/** Dial: a spiral sky-island shell tinted by type, with its effect at the mouth. */
D.shell = (I, o = {}) => {
  const col = o.color || '#d9c1a0';
  part(I, ellipse(45, 19, 9.5, 7.5, -0.6), lt(col, 0.1), { sd: 1.4, hd: 1 });
  part(I, ellipse(51.5, 11.5, 5.4, 4.2, -0.6), lt(col, 0.2), { sd: 0.8, hd: 0.6 });
  part(I, circle(54, 8.5, 3), '#f4f1ea', { sd: 0.6, hd: 0.4 });
  const body = 'M8 40 C8 26 20 17 33 18 C45 19 52 28 51 39 C50 50 40 57 29 57 C18 57 8 51 8 40 Z';
  part(I, body, col, { sd: 3, hd: 2 });
  clip(I, body, () => { ln(I, 'M20 20 C32 22 44 30 50 44', dk(col, 0.3), 1.4); if (!I.small) ln(I, 'M30 18 C40 22 48 30 51 36', dk(col, 0.25), 1.1, { a: 0.8 }); });
  part(I, ellipse(22, 44, 10.5, 7.8, -0.6), '#f7e7d6', { sd: 1, hd: 0.6 });
  fl(I, ellipse(22.8, 44.8, 7, 4.8, -0.6), dk(col, 0.62));
  const fx = o.fx;
  if (!fx) return;
  if (fx === 'flame') { part(I, 'M14 50 C8 46 6 38 10 32 C11 38 14 40 16 40 C15 35 18 31 22 29 C21 35 25 38 24 44 C23 48 19 51 14 50 Z', '#ffc93c', { sd: 1, hd: 0.8, ol: I.ol * 0.8 }); if (!I.small) fl(I, 'M15 48 C12 46 12 42 14 40 C15 43 17 43 18 42 C19 44 18.5 47 15 48 Z', '#fff3c4'); }
  else if (fx === 'breath') for (const [d, w] of [['M20 44 C12 44 8 48 6 54', 2.6], ['M24 48 C18 52 16 56 17 60', 2], ['M17 40 C11 38 6 40 3 44', 1.8]]) tube(I, d, '#eaf7fb', w, { ol: I.ol * 0.7, flat: true });
  else if (fx === 'flash') { part(I, star(15, 51, 8, 11, 4.6), '#fff1a0', { sd: 0.6, hd: 0.4, ol: I.ol * 0.7 }); }
  else if (fx === 'impact') part(I, star(15, 51, 7, 10, 5), '#f6c431', { sd: 0.8, hd: 0.5, ol: I.ol * 0.7 });
  else if (fx === 'reject') { part(I, star(15, 51, 9, 11, 5.4), '#b58ce0', { sd: 0.8, hd: 0.5, ol: I.ol * 0.7 }); fl(I, circle(15, 51, 3), '#fff6ff'); }
  else if (fx === 'water') part(I, 'M14 42 C17 46 19 49 19 52 C19 55 16.8 57 14 57 C11.2 57 9 55 9 52 C9 49 11 46 14 42 Z', '#6cc3ef', { sd: 1, hd: 0.8, ol: I.ol * 0.8 });
};
// ------------------------------------------------------ extra keepsakes
D.watermelon = (I) => {
  tf(I, { r: -0.25 }, () => {
    const w = 'M6 26 H58 C58 44 46 56 32 56 C18 56 6 44 6 26 Z';
    part(I, w, '#3f8a34', { sd: 2.4, hd: 1.4 });
    part(I, 'M10 26 H54 C54 41 44 51 32 51 C20 51 10 41 10 26 Z', '#f4f1d8', { sd: 0, hd: 0, ol: I.ol * 0.5 });
    part(I, 'M12.5 26 H51.5 C51.5 39 43 48.5 32 48.5 C21 48.5 12.5 39 12.5 26 Z', '#e0404a', { sd: 1.6, hd: 1.2, ol: 0 });
    for (const [x, y] of [[22, 33], [32, 38], [42, 33], [27, 42], [37, 42], [32, 30]]) fl(I, ellipse(x, y, 1.1, 1.8), '#2b1d14');
  });
};
D.carrot = (I) => {
  for (const [d, c] of [['M34 18 C30 10 30 4 34 2 C36 8 36 13 36 18 Z', C.leaf], ['M36 18 C38 10 44 6 48 8 C44 12 40 15 38 19 Z', '#4f9a3a'], ['M33 19 C28 12 22 11 18 13 C23 16 28 18 32 21 Z', '#6fb24a']]) part(I, d, c, { sd: 0.8, hd: 0.6 });
  const b = 'M22 22 C28 16 42 16 44 24 C46 30 34 44 16 58 C14 60 12 58 13 56 C20 44 20 28 22 22 Z';
  part(I, b, '#f0842a', { sd: 2.4, hd: 1.6 });
  if (!I.small) clip(I, b, () => { for (const [x, y] of [[30, 30], [26, 38], [22, 46]]) ln(I, `M${x - 6} ${y - 2} L${x + 2} ${y + 2}`, dk('#f0842a', 0.3), 1.2); });
};
D.pineapple = (I) => {
  for (const [r, c] of [[-0.5, '#4f9a3a'], [0.5, '#4f9a3a'], [0, C.leaf]]) part(I, xf('M32 22 C28 16 28 8 32 2 C36 8 36 16 32 22 Z', { r, ox: 32, oy: 22 }), c, { sd: 0.8, hd: 0.6 });
  const b = ellipse(32, 40, 15, 19);
  part(I, b, '#e8a82c', { sd: 3, hd: 2 });
  clip(I, b, () => { for (let i = -4; i <= 4; i++) { ln(I, `M${16 + i * 7} 20 L${40 + i * 7} 62`, dk('#e8a82c', 0.35), 1.2); ln(I, `M${48 + i * 7} 20 L${24 + i * 7} 62`, dk('#e8a82c', 0.35), 1.2); } });
};
D.candy = (I) => {
  tube(I, 'M32 36 L22 62', '#f4f1ea', 3.2);
  part(I, circle(34, 24, 18), '#f27bb0', { sd: 2.4, hd: 1.6 });
  ln(I, spiral(34, 24, 15, 2.2, 0.5), '#ffffff', 3.4);
  gloss(I, 27, 16, 4, 2.2, 0.6);
};
D.chefHat = (I) => {
  part(I, union(circle(20, 24, 10), circle(32, 17, 12), circle(44, 24, 10), rrect(16, 22, 32, 14, 3)), '#fbf8f0', { sd: 2.4, shT: 0.15, hd: 1.4 });
  part(I, rrect(16, 34, 32, 16, 3), '#f1ede2', { sd: 1.8, shT: 0.15, hd: 1 });
  if (!I.small) for (const x of [24, 32, 40]) ln(I, `M${x} 36 V48`, '#d9d2c2', 1.2);
};
D.bubbleHelm = (I) => {
  part(I, circle(32, 30, 23), rg(I, 32, 30, 24, [[0, '#f4fbff'], [0.75, '#d4ecf7'], [1, '#a9d2e6']], 26, 22, 2), { base: '#d4ecf7', sd: 0, hd: 1.6, hi: '#ffffff' });
  gloss(I, 22, 18, 7, 3.4, 0.85, -0.6); gloss(I, 44, 42, 3, 1.4, 0.5, -0.6);
  part(I, 'M12 48 C18 56 46 56 52 48 L52 54 C46 61 18 61 12 54 Z', '#c9d1d8', { sd: 1.2, hd: 1 });
};
D.eyepatch = (I) => {
  tube(I, 'M6 22 C22 16 42 16 58 24', '#2b2631', 2.6);
  part(I, 'M20 26 C26 22 38 22 42 28 C44 36 38 44 31 44 C24 44 18 36 20 26 Z', '#2b2631', { sd: 1.8, hd: 1.4, hi: '#6b6478' });
  if (!I.small) skull(I, 31, 31, 3.8, '#f4f1ea', false);
};
D.photo = (I) => {
  tf(I, { r: -0.14 }, () => {
    part(I, rrect(10, 12, 44, 40, 1.5), '#f7f4ec', { sd: 2, shT: 0.15, hd: 1.2 });
    part(I, rrect(14, 16, 36, 27, 0.5), '#9fc4d8', { sd: 0, hd: 0, ol: I.ol * 0.5 });
    clip(I, rrect(14, 16, 36, 27, 0.5), () => { fl(I, 'M14 36 C22 30 30 34 36 30 C42 26 46 30 50 28 V44 H14 Z', '#6f9a4f'); part(I, circle(40, 23, 3.4), '#f6d24a', { flat: true, ol: 0 }); });
  });
};
D.chalice = (I, o = {}) => {
  const m = o.metal || '#d6dde2';
  part(I, ellipse(32, 56, 14, 4), dk(m, 0.1), { sd: 0.8, hd: 0.6 });
  part(I, 'M29 38 H35 L36 54 H28 Z', m, { sd: 1, hd: 0.8 });
  part(I, 'M12 12 H52 C52 28 44 38 32 38 C20 38 12 28 12 12 Z', m, { sd: 2.6, hd: 1.8 });
  part(I, ellipse(32, 12, 20, 4.4), dk(m, 0.4), { sd: 0, hd: 0 });
  gem(I, 32, 25, 4.6, '#d7263d', { ol: I.ol * 0.7 });
};
D.rope = (I) => {
  const c = '#c9a060';
  for (const [r, a] of [[24, 1], [17.5, 0.95], [11, 0.9]]) { const p = new Path2D(); p.addPath(ellipse(32, 36, r, r * 0.72)); p.addPath(ellipse(32, 36, r - 5, (r - 5) * 0.72)); part(I, p, lt(c, (1 - a) * 2), { rule: 'evenodd', sd: 1.2, hd: 0.8 }); }
  if (!I.small) for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; ln(I, `M${32 + Math.cos(a) * 19.5} ${36 + Math.sin(a) * 14} L${32 + Math.cos(a + 0.12) * 23} ${36 + Math.sin(a + 0.12) * 16.6}`, dk(c, 0.35), 1); }
  tube(I, 'M54 36 C58 44 56 52 50 58', c, 4);
};

// ----------------------------------------------------------- devil fruit
// Shape per fruit id (curated for the famous ones, hashed for the rest).
const FRUIT_SHAPE = {
  gomu: 'round', mera: 'round', ope: 'heart', hie: 'pear', goro: 'melon', yami: 'heart', gura: 'round', pika: 'gourd', magu: 'pear',
  suna: 'banana', moku: 'grape', hana: 'grape', bara: 'melon', ito: 'grape', mochi: 'gourd', horo: 'heart', kage: 'melon', doku: 'grape',
  hito: 'pear', neko_leopard: 'banana', tori_phoenix: 'pear', uo_seiryu: 'banana', nikyu: 'heart', bari: 'round', supa: 'gourd',
};
const FRUIT_SHAPES = ['round', 'pear', 'grape', 'banana', 'gourd', 'melon', 'heart'];
const FRUIT_BODY = {
  round: [() => ellipse(32, 38, 21, 20), [32, 18.5]],
  melon: [() => ellipse(32, 39, 24.5, 17.5), [32, 21.8]],
  pear: [() => 'M32 15 C38 15 41 20 42 27 C50 32 54 40 52 48 C50 55 42 59 32 59 C22 59 14 55 12 48 C10 40 14 32 22 27 C23 20 26 15 32 15 Z', [32, 15.5]],
  heart: [() => 'M32 59 C22 51 9 43 9 31 C9 22 15 17 22 17 C26 17 30 19 32 22 C34 19 38 17 42 17 C49 17 55 22 55 31 C55 43 42 51 32 59 Z', [32, 21]],
  gourd: [() => union(circle(32, 25, 11.5), circle(32, 44, 16), rrect(26, 25, 12, 14, 4)), [32, 14]],
  banana: [() => taper(bez([15, 25], [15, 47], [38, 58], [57, 43], 22), (t) => 9 + 13 * Math.sin(Math.PI * Math.min(1, t * 1.1)) - (t > 0.9 ? (t - 0.9) * 40 : 0)), [15, 22]],
};
function swirls(I, path, box, col, rr, seed) {
  const dark = lum(col) < 0.32;
  const sw = dark ? lt(col, 0.42) : dk(col, 0.45), hi = dark ? dk(col, 0.5) : lt(col, 0.55), [x0, y0, x1, y1] = box;
  const w = I.small ? 2.3 : 1.9, step = rr * 2.1;
  clip(I, path, () => {
    let k = 0;
    for (let y = y0; y <= y1; y += step * 0.86) for (let x = x0 + ((Math.round((y - y0) / (step * 0.86)) % 2) ? step / 2 : 0); x <= x1; x += step) {
      const q = hash(seed + ':' + k++), jx = ((q & 15) / 15 - 0.5) * rr * 0.45, jy = (((q >> 4) & 15) / 15 - 0.5) * rr * 0.45, rot = ((q >> 8) & 63) / 63 * TAU, dir = q & 4096 ? 1 : -1;
      const sp = spiral(x + jx, y + jy, rr, I.small ? 1.2 : 1.45, rot, dir);
      if (!I.small) ln(I, xf(sp, { x: -0.6, y: -0.6 }), hi, w * 0.5, { a: 0.75 });
      ln(I, sp, sw, w);
    }
  });
}
D.fruit = (I, o = {}) => {
  const id = o.fruit || '', f = FRUITS[id] || {};
  let col = o.color || f.color || '#8e5bd1';
  if (lum(col) > 0.84) col = mix(col, '#9fb2c6', 0.24);
  const shape = o.shape || FRUIT_SHAPE[id] || FRUIT_SHAPES[hash(id || 'x') % FRUIT_SHAPES.length];
  const rr = I.small ? 7.6 : 6.6;
  const stem = (x, y, leaf = 17) => {
    part(I, `M${x - 1} ${y + 1} C${x - leaf * 0.35} ${y - 5} ${x - leaf * 0.8} ${y - 5} ${x - leaf} ${y - 1} C${x - leaf * 0.75} ${y + 3} ${x - leaf * 0.35} ${y + 3.5} ${x - 1} ${y + 1} Z`, C.leaf, { sd: 1.2, hd: 0.9 });
    if (!I.small) ln(I, `M${x - 3} ${y} C${x - leaf * 0.4} ${y - 2} ${x - leaf * 0.62} ${y - 2.4} ${x - leaf * 0.86} ${y - 1}`, dk(C.leaf, 0.35), 0.9);
    tube(I, `M${x} ${y + 2} C${x} ${y - 4} ${x + 2} ${y - 8} ${x + 6} ${y - 8.5} C${x + 10} ${y - 9} ${x + 11} ${y - 5} ${x + 8} ${y - 4} C${x + 6} ${y - 3.5} ${x + 5.5} ${y - 5.5} ${x + 7} ${y - 6}`, '#3f6d2a', 2.6);
  };
  if (shape === 'grape') {
    const balls = [[17, 27], [27.5, 26], [38, 26], [48, 27], [22, 37.5], [32.5, 37], [43, 37.5], [27, 47.5], [38, 47.5], [32.5, 56.5]];
    const r = 7.6, all = union(...balls.map(([x, y]) => circle(x, y, r)));
    balls.forEach(([x, y], i) => part(I, circle(x, y, r), i % 3 === 1 ? dk(col, 0.05) : col, { sd: 2.2, hd: 0 }));
    swirls(I, all, [8, 18, 56, 62], col, rr * 0.8, id || 'grape');
    balls.forEach(([x, y]) => { hilite(I, circle(x, y, r), lt(col, 0.55), 1.4, 0.7, 0.8, 'nonzero'); if (!I.small) gloss(I, x - 2.8, y - 3, 1.5, 0.9, 0.55); });
    stem(32, 19.5);
    return;
  }
  const [mkBody, [sx, sy]] = FRUIT_BODY[shape] || FRUIT_BODY.round;
  const body = P(mkBody());
  part(I, body, col, { sd: 3.6, hd: 2.2 });
  swirls(I, body, [6, 14, 58, 60], col, rr, id || 'fruit');
  hilite(I, body, lt(col, 0.6), 2, 0.7, 0.9, 'nonzero');
  const gl = { round: [23, 27], melon: [20, 30], pear: [24, 33], heart: [18, 27], gourd: [27, 20], banana: [18, 33] }[shape] || [24, 28];
  gloss(I, gl[0], gl[1], 4, 2.2, 0.6);
  stem(sx, sy, shape === 'banana' ? 11 : 17);
};

D.crate = (I, o = {}) => {
  const w = o.color || '#b07a45';
  const front = poly([[8, 27], [40, 27], [40, 58], [8, 58]]), top = poly([[8, 27], [22, 14], [55, 14], [40, 27]]), side = poly([[40, 27], [55, 14], [55, 45], [40, 58]]);
  part(I, union(front, top, side), w, { sd: 0, hd: 0 });
  fl(I, top, lt(w, 0.25)); fl(I, side, dk(w, 0.2)); fl(I, front, w);
  clip(I, front, () => { part(I, 'M8 52 L34 27 H40 V31 L14 58 H8 Z', dk(w, 0.1), { sd: 0.6, hd: 0.5, ol: I.ol * 0.6 }); for (const y of [37.5, 47.5]) ln(I, `M8 ${y} H40`, dk(w, 0.4), 1); });
  ln(I, 'M8 27 H40 L55 14 M40 27 V58', dk(w, 0.45), 1.2);
  if (!I.small) for (const [x, y] of [[11, 30], [37, 30], [11, 55], [37, 55]]) fl(I, circle(x, y, 1), OUT);
};

// ================================================================ resolver
/** id → [drawer, opts] for notable items. */
const ITEM_MAP = {
  meat: ['meat'], water_flask: ['bottle', { liquid: '#8fd0f2' }], rice_ball: ['riceBall'], fish_stew: ['bowl', { top: 'fish' }], tangerine: ['orange'],
  elephant_tuna: ['fish', { color: '#35557a', trunk: true }], fighting_fish_horn: ['horn', { color: '#f1e6cc' }],
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
  yubashiri: ['katana', { wrap: '#1d1b20', diamond: '#c9a24e', tsuba: '#c2a24f', tsubaShape: 'flower', habaki: '#c9a24e' }],
  shigure: ['katana', { wrap: '#2f6b4f', diamond: '#d6dfd3', tsuba: '#3d8a5f', tsubaShape: 'flower' }],
  sandai_kitetsu: ['katana', { wrap: '#9c2a1f', diamond: '#3a1a18', tsuba: '#d8ad46', tsubaShape: 'flower', hamon: 'wave', hamonColor: '#3d6fd1', habaki: '#c9a24e' }],
  wado_ichimonji: ['katana', { wrap: '#f4f1ea', diamond: '#b9c3cc', tsuba: '#e2b64a', habaki: '#e8c35a' }],
  shusui: ['katana', { blade: '#3a3542', edge: '#8a8298', wrap: '#7a1f24', diamond: '#1f1a22', tsuba: '#d8a93f', tsubaShape: 'flower' }],
  enma: ['katana', { blade: '#5a2a33', edge: '#e0584f', wrap: '#4a2a63', diamond: '#a58bc9', tsuba: '#d8ad46', tsubaShape: 'flower', aura: '#c0283a', habaki: '#b8963e' }],
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
  // keepsakes whose names would mislead the keyword rules
  sea_prism_charm: ['amulet', { cage: true, metal: C.brass, gem: '#6fd3c8' }], nw_tea_invitation: ['envelope', { heart: true, color: '#f7e6ee' }],
  sb_hibiscus_tea: ['teacup', { tea: '#b3123f', band: '#d9485f' }], seastone: ['rock', { color: '#5f8187', speckle: true, sheen: '#bfe9ef' }],
  amber_lead: ['rock', { color: '#ece6d6', sheen: '#fff6d8' }], seastone_cuffs: ['cuffs'], p2_salt: ['sack', { content: '#fbfbf7' }],
  gold_coins: ['coins'], golden_statue: ['statue'], shandora_gold: ['bell'], jewels: ['jewels'], pearl: ['pearl'],
  south_bird: ['bird'], wb_rocks_flag: ['flag', { tattered: true }], p1_sun_flag: ['flag', { emblem: 'sun' }],
  nw_raijin_umbrella: ['umbrella', { bolt: true, color: '#3f3a78' }], wb_cindry_poster: ['poster', { play: true }],
  wb_rabbit_tag: ['tag', { rabbit: true, color: '#d9c7a0' }], p1_noland_page: ['scroll', { seal: '#8a5a30' }],
  p1_giant_ale: ['barrel', { label: 'ale', hoop: '#6b5a3a', wood: '#8e5a30' }], elbaf_mead: ['mug', { color: '#8e5a30' }],
  wb_toroa_red: ['wine'], p1_yuba_water: ['drop'], nb_sora_comic: ['book', { comic: true }],
};

/** Name keyword rules, first match wins: [regex, drawer, opts | (name, def, id) => opts, types?]. */
const NAME_RULES = [
  [/invitation|\bletter\b|envelope/, 'envelope', (n) => ({ heart: /tea|love|party|invitation/.test(n) })],
  // ---- fruit & food
  [/watermelon|\bmelon/, 'watermelon'], [/carrot/, 'carrot'], [/pineapple/, 'pineapple'], [/lollipop|candy|sweets?\b|toffee/, 'candy'],
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
  [/\bale\b|beer|mead|cider|lager|stout|tankard/, 'mug'], [/\btea\b|coffee|cocoa/, 'teacup', (n) => ({ tea: /hibiscus|rose|berry/.test(n) ? '#b3123f' : /coffee|cocoa/.test(n) ? '#4a2a1a' : undefined })],
  [/\bwater\b|\bdew\b/, 'drop', {}, ['food', 'medicine']], [/milk|juice|lemonade|soda/, 'bottle', (n) => ({ liquid: /milk/.test(n) ? '#f7f4ec' : '#f29a2e' })],
  [/platter|course|feast|banquet|meal|dish|plate|bento|lunch|dinner|cuisine|sushi|sashimi/, 'plate', (n) => ({ food: /platter|bento|feast|banquet/.test(n) ? 'platter' : undefined }), ['food']],
  [/\bfish|salmon|tuna|\beel\b|mackerel|sardine|squid|shrimp|prawn|crab|lobster|shark/, 'fish', {}, ['food', 'material']],
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
  [/bubble/, 'bubbleHelm', {}, ['hat']], [/chef|toque/, 'chefHat', {}, ['hat']], [/kabuto|samurai/, 'hornHelm', { horns: false, crest: true, metal: '#3a3540', trim: '#c8372d' }, ['hat']],
  [/eye ?patch/, 'eyepatch'],
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
  [/log ?pose/, 'logPose', (n) => ({ three: /three|new world|3/.test(n) })], [/eternal pose/, 'eternalPose'], [/vivre/, 'vivre', (n) => ({ burn: /burn|dying|fading/.test(n) })],
  [/den ?den|transponder|snail/, 'denDen'], [/handcuff|shackle|\bcuffs\b|manacle/, 'cuffs'], [/poneglyph|rubbing/, 'rubbing'],
  [/treasure map/, 'map'], [/\bchart\b|\bmaps?\b|atlas/, 'map', { chart: true }], [/\bkeys?\b/, 'key', (n) => ({ big: /loki|chain|giant|prison|vault/.test(n) })],
  [/letter|invitation|envelope|\bnote from|message/, 'envelope', (n) => ({ heart: /tea|love|party|invitation/.test(n) })],
  [/comic|manga/, 'book', { comic: true }], [/book|primer|novel|diary|journal|manual|log of|logbook|almanac|encyclop|tome/, 'book'],
  [/notes|notebook|sketch/, 'notebook'], [/ticket|\bpass\b|boarding/, 'ticket'], [/\bpage\b|leaflet|flyer|sheet/, 'page', (n) => ({ wet: /water|soak|wet/.test(n) })],
  [/poster|playbill|wanted|bill\b/, 'poster', (n) => ({ play: /play|theat|concert|show|signed/.test(n) })],
  [/scroll|survey|register|permit|decree|\blog\b|promise|orders|edict|charter|record|document|deed|certificate|contract|papers|report/, 'scroll', (n) => ({ seal: /sealed|government|permit|holy|royal/.test(n) ? '#c8372d' : undefined })],
  [/photo|portrait|picture|snapshot/, 'photo'], [/chalice|goblet|grail|\bcup\b/, 'chalice', (n) => ({ metal: metalOf(n) === C.gold ? '#f0bf45' : '#d6dde2' })],
  [/\brope\b|cord\b|twine|hawser/, 'rope'], [/\biron\b|\bsteel\b|\bplates?\b/, 'ingot', { color: '#9aa6af' }, ['material']],
  [/\bdice\b|\bdie\b/, 'dice'], [/\btag\b|label/, 'tag', (n) => ({ rabbit: /rabbit|bunny/.test(n) })], [/\bhorn\b|bugle/, 'horn'], [/flag|banner|jolly roger|pennant/, 'flag', (n) => ({ emblem: /sun/.test(n) ? 'sun' : 'skull', tattered: /scrap|torn|tatter|\brag/.test(n) })],
  [/umbrella|parasol/, 'umbrella', (n) => ({ bolt: /raijin|thunder|lightning|storm/.test(n) })], [/bird|gull|parrot|coo\b/, 'bird'],
  [/strongbox|lockbox|\bsafe\b|coffer/, 'chest', { iron: true }], [/chest|\bcrate\b|\bbox\b/, 'chest', {}, ['treasure', 'key']],
  [/\bbell\b|shandora/, 'bell'], [/statue|idol|figurine|effigy/, 'statue'], [/pearl/, 'pearl'],
  [/coin|doubloon|berr(y|ies)|belly|money|\bgold\b/, 'coins', {}, ['treasure', 'key', 'material']],
  [/jewel|\bgems?\b|diamond|ruby|sapphire|emerald|topaz/, 'jewels'], [/ingot|\bmetal\b|bullion|wapometal|\bbar of/, 'ingot'],
  [/violin|fiddle|guitar|lute|instrument|\bdrum\b|flute|harp/, 'violin'], [/perfume|fragrance|scent|cologne/, 'perfume'],
  [/feather|plume/, 'feather'], [/sakura|cherry blossom/, 'blossom'], [/hibiscus|flower|blossom|\brose\b|\blily\b|orchid/, 'flower'],
  [/\bsalt\b|sugar|spice|pepper|flour|grain/, 'sack'], [/\bwood|timber|\blogs?\b|lumber|plank/, 'wood', (n) => ({ adam: /adam/.test(n) })],
  [/seastone|kairoseki/, 'rock', { color: '#5f8187', speckle: true, sheen: '#bfe9ef' }], [/\bstone|\brock|\bore\b|crystal|\blead\b|amber|mineral/, 'rock', (n) => ({ color: /amber|lead|white/.test(n) ? '#e9e6dc' : undefined })],
  [/herb|\bleaf|leaves|moss|\broot|grass|seaweed/, 'herbs'], [/powder|dust/, 'jar', { color: '#f3c6d6' }],
];

const HAT_LOOK = { straw: 'strawHat', bandana: 'bandana', tricorne: 'tricorne', captain: 'captainHat', cowboy: 'cowboyHat', marine: 'marineCap', pinkhat: 'topHat', goggles: 'goggles', headband: 'headband', horns: 'hornHelm', beanie: 'beanie', crown: 'crownHat', halo: 'halo', bubble: 'bubbleHelm', chef: 'chefHat' };
const KIND_DEFAULT = { sword: 'katana', gun: 'flintlock', staff: 'staff', axe: 'axe' };
const DIAL_FX = [[/impact/, 'impact'], [/reject/, 'reject'], [/flame|fire|heat/, 'flame'], [/breath|wind|air|jet/, 'breath'], [/flash|lamp|light/, 'flash'], [/water|aqua/, 'water']];
const DIAL_COLORS = [
  [/impact/, '#e3a857'], [/reject/, '#5b3f8a'], [/flame|fire|heat/, '#e8643a'], [/breath|wind|air|jet/, '#9fd9e3'], [/flash|lamp|light/, '#f6d94a'],
  [/eisen|iron/, '#8c9aa6'], [/tone|sound|music/, '#8fd18a'], [/milky|cloud/, '#f4f1ea'], [/water|aqua/, '#4fb3e8'], [/axe|blade/, '#b0bec5'],
];

function typeDefault(d, id) {
  const t = d?.type;
  if (t === 'weapon') return { fn: KIND_DEFAULT[d.kind] || 'katana', o: {} };
  if (t === 'hat') return d.look?.hat && HAT_LOOK[d.look.hat] ? { fn: HAT_LOOK[d.look.hat], o: { color: d.look.hatColor } } : { fn: 'tricorne', o: {}, fallback: true };
  if (t === 'coat') return { fn: 'coat', o: { color: d.look?.coat, trim: false } };
  if (t === 'dial') { const n = (d.name || id || '').toLowerCase(); return { fn: 'shell', o: { color: (DIAL_COLORS.find(([re]) => re.test(n)) || [0, '#d9c1a0'])[1], fx: (DIAL_FX.find(([re]) => re.test(n)) || [0, null])[1] } }; }
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
  if (d?.type === 'dial') return typeDefault(d, id);
  const name = `${d?.name || ''} ${id || ''}`.toLowerCase().replace(/_/g, ' ');
  for (const [re, fn, o, types] of NAME_RULES) {
    if (!re.test(name) || (types && d?.type && !types.includes(d.type))) continue;
    return { fn, o: typeof o === 'function' ? o(name, d, id) : o || {} };
  }
  return typeDefault(d, id);
}

// ================================================================= skills
// Techniques are drawn as a medallion: a tinted badge (colour of the fruit /
// style / haki) with a bold motif on top, so they read as "abilities" next to
// items and stay visible on both the parchment panels and the dark hotbar.
const SK = {};
const SKIN = '#f2c596';

function crescentP(cx, cy, r, a0, a1, w, w0 = 0.7) {
  const pts = [], n = 22;
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return taper(pts, (t) => w0 + w * Math.pow(Math.sin(Math.PI * t), 0.85));
}
function flameP(cx, by, s = 1) {
  return xf('M32 58 C18 58 12 48 14 38 C15 32 19 28 20 21 C24 25 25.5 30 25.5 34 C27.5 27 30.5 19 30 7 C38 13 44 23 44 31.5 C46 29.5 47 26.5 46.5 23 C52 29.5 54 38 52 46 C50 54 42 58 32 58 Z', { ox: 32, oy: 58, x: cx - 32, y: by - 58, s });
}
function flame(I, cx, by, s, cols = ['#e8452c', '#f7931e', '#ffe066']) {
  part(I, flameP(cx, by, s), cols[0], { sd: 2 * s, hd: 1.4 * s, ol: I.ol });
  part(I, flameP(cx, by - 1.5 * s, s * 0.66), cols[1], { sd: 1.2 * s, hd: 0, ol: 0 });
  fl(I, flameP(cx, by - 2.5 * s, s * 0.36), cols[2]);
}
const BOLT = 'M37 3 L15 35 H28.5 L21 61 L49 25 H35.5 L45 3 Z';
function bolt(I, o = {}) { part(I, xf(BOLT, o), o.c || '#ffe14a', { sd: 1.4, hd: 1.2, hi: '#fffbe0' }); }
function speed(I, pts, col = '#ffffff', w = 2, a = 0.85) { for (const [x1, y1, x2, y2] of pts) ln(I, `M${x1} ${y1} L${x2} ${y2}`, col, w, { a }); }
function fistShape(I, c, shiny) {
  const hi = shiny ? '#b9a8e0' : undefined;
  part(I, rrect(23.5, 44, 16, 13, 4), dk(c, 0.1), { sd: 1.4, hd: 1, hi });
  part(I, rrect(17, 22, 29.5, 26, 8.5), c, { sd: 2.4, hd: 1.4, hi });
  [[17.3, 15.5], [24.6, 14], [31.9, 14], [39.2, 15.5]].forEach(([x, y]) => { part(I, rrect(x, y, 7.5, 17, 3.7), c, { sd: 1.4, hd: 1.2, hi }); if (shiny) gloss(I, x + 2.6, y + 4.5, 1.1, 2.6, 0.75, 0); });
  part(I, 'M13.5 35 C13.5 30 18 28.5 24 30 L36 32.5 C40 33.5 40.5 39 36.5 40 L21 41.5 C16.5 42 13.5 39.5 13.5 35 Z', c, { sd: 1.4, hd: 1, hi });
  if (shiny) { gloss(I, 20, 34, 2.6, 1, 0.7, -0.1); gloss(I, 27, 50, 1.2, 2.4, 0.6, 0); }
}
function palmShape(I, c) {
  part(I, rrect(24, 44, 16, 14, 4), dk(c, 0.1), { sd: 1.4, hd: 1 });
  part(I, xf(rrect(7, 27, 8, 19, 4), { r: -0.65, ox: 14, oy: 42 }), c, { sd: 1.4, hd: 1 });
  [[17.5, 11, 20], [25, 7, 23], [32.5, 8, 22], [40, 12, 19]].forEach(([x, y, h]) => part(I, rrect(x, y, 7, h, 3.5), c, { sd: 1.4, hd: 1.2 }));
  part(I, rrect(17, 25, 30, 24, 9), c, { sd: 2.4, hd: 1.4 });
  if (!I.small) ln(I, 'M22 36 C27 40 35 40 41 35', dk(c, 0.3), 1.2, { a: 0.7 });
}
/** Extended leg with a pointed dress shoe, authored pointing right (+x). */
function legShape(I, pants, shoe, sole = '#6b4226') {
  part(I, 'M-8 23 H33 L34 41 H-8 Z', pants, { sd: 2.2, hd: 1.4, hi: lt(pants, 0.45) });
  if (!I.small) ln(I, 'M-6 31.5 H30', dk(pants, 0.3), 1, { a: 0.7 });
  part(I, rrect(29.5, 22, 6.5, 20, 2.2), dk(pants, 0.18), { sd: 0.8, hd: 0.8, hi: lt(pants, 0.35) });
  part(I, rrect(34, 38.5, 29, 4.4, 2.2), sole, { sd: 0.8, hd: 0.5 });
  part(I, 'M35 24 C40 22.5 44 24 46.5 28 L56 30.5 C61.5 31.5 63.5 35.5 61.5 38.5 C60.5 40 58 40.5 55 40.5 H35 Z', shoe, { sd: 1.6, hd: 1.3, hi: lt(shoe, 0.55), gloss: [52, 32.5, 3.6, 1.2, 0.55, 0.2] });
}
function burst(I, x, y, r1, r2, col, n = 9) { part(I, star(x, y, n, r1, r2, 0.2), col, { sd: r1 * 0.08, hd: r1 * 0.06, hi: '#ffffff', ol: I.ol * 0.85 }); }
function rings(I, x, y, r0, n, col, a0 = -1.1, a1 = 1.1, w = 2.4) { for (let i = 0; i < n; i++) ln(I, arcPath(x, y, r0 + i * 6, a0, a1), col, w - i * 0.3, { a: 1 - i * 0.18 }); }
function cloudP(x, y, s = 1) { return union(circle(x - 9 * s, y + 2 * s, 7.5 * s), circle(x, y - 3 * s, 10 * s), circle(x + 10 * s, y + 1 * s, 8 * s), rrect(x - 16 * s, y + 1 * s, 33 * s, 9 * s, 4.5 * s)); }
function dropP(x, y, s = 1) { return `M${x} ${y - 9 * s} C${x + 4 * s} ${y - 3.5 * s} ${x + 6.5 * s} ${y} ${x + 6.5 * s} ${y + 3 * s} C${x + 6.5 * s} ${y + 7 * s} ${x + 3.4 * s} ${y + 9.5 * s} ${x} ${y + 9.5 * s} C${x - 3.4 * s} ${y + 9.5 * s} ${x - 6.5 * s} ${y + 7 * s} ${x - 6.5 * s} ${y + 3 * s} C${x - 6.5 * s} ${y} ${x - 4 * s} ${y - 3.5 * s} ${x} ${y - 9 * s} Z`; }
function eyeShape(I, x, y, w, col = '#f7f4ec', iris = '#3aa37a') {
  const e = `M${x - w} ${y} C${x - w * 0.5} ${y - w * 0.62} ${x + w * 0.5} ${y - w * 0.62} ${x + w} ${y} C${x + w * 0.5} ${y + w * 0.62} ${x - w * 0.5} ${y + w * 0.62} ${x - w} ${y} Z`;
  part(I, e, col, { sd: w * 0.1, hd: 0 });
  clip(I, e, () => { part(I, circle(x, y, w * 0.42), iris, { sd: w * 0.06, hd: w * 0.05, ol: I.ol * 0.6 }); fl(I, circle(x, y, w * 0.2), OUT); fl(I, circle(x - w * 0.14, y - w * 0.14, w * 0.09), '#ffffff'); });
}
function ghostP(x, y, s = 1) { return `M${x - 11 * s} ${y + 12 * s} L${x - 11 * s} ${y} C${x - 11 * s} ${y - 8 * s} ${x - 6 * s} ${y - 13 * s} ${x} ${y - 13 * s} C${x + 6 * s} ${y - 13 * s} ${x + 11 * s} ${y - 8 * s} ${x + 11 * s} ${y} L${x + 11 * s} ${y + 12 * s} L${x + 6.5 * s} ${y + 8 * s} L${x + 2.2 * s} ${y + 12 * s} L${x - 2.2 * s} ${y + 8 * s} L${x - 6.5 * s} ${y + 12 * s} Z`; }
function bat(I, x, y, s, col) {
  part(I, xf('M32 30 C28 26 22 24 14 24 C16 27 16 30 14 33 C18 32 21 34 22 37 C25 34 28 34 30 36 L32 40 L34 36 C36 34 39 34 42 37 C43 34 46 32 50 33 C48 30 48 27 50 24 C42 24 36 26 32 30 Z', { ox: 32, oy: 32, x: x - 32, y: y - 32, s }), col, { sd: 1, hd: 0.8, hi: lt(col, 0.45) });
  fl(I, circle(x - 1.4 * s, y - 0.6 * s, 0.9 * s), '#ff5a5a'); fl(I, circle(x + 1.4 * s, y - 0.6 * s, 0.9 * s), '#ff5a5a');
}
function birdP(x, y, s = 1) {
  return xf('M32 36 C26 30 16 26 5 27 C12 30 16 34 18 38 C12 38 8 40 6 43 C14 42 22 42 28 42 L24 52 L32 46 L40 52 L36 42 C42 42 50 42 58 43 C56 40 52 38 46 38 C48 34 52 30 59 27 C48 26 38 30 32 36 Z', { ox: 32, oy: 38, x: x - 32, y: y - 38, s });
}
function dragonHead(I, col, o = {}) {
  const horn = o.horn || '#f3e6c4';
  part(I, 'M44 17 C47 9 53 5 61 5 C57 9 53 14 51 20 Z', horn, { sd: 0.8, hd: 0.6 });
  part(I, 'M36 17 C37 10 41 6 47 4 C45 9 43 14 43 19 Z', horn, { sd: 0.8, hd: 0.6 });
  part(I, 'M52 22 L62 22 L56 27 L63 30 L55 33 L61 38 L52 38 Z', dk(col, 0.25), { sd: 0.8, hd: 0.6 });
  part(I, 'M12 40 C18 42 26 44 34 44 C39 44 43 46 45 50 C39 53 30 53 22 51 C16 49 13 45 12 40 Z', dk(col, 0.12), { sd: 1.2, hd: 0.8 });
  for (const x of [18, 24, 30]) fl(I, poly([[x, 42.5], [x + 3, 42.8], [x + 1.4, 46]]), '#f7f4ec');
  part(I, 'M6 33 C10 28 18 26 26 26 C32 21 39 17 47 17 C54 17 58 22 57 29 C56.5 34 53 37.5 48 39 L40 40 C34 41.5 26 41 20 39.5 L12 38 C8 37 6 35.5 6 33 Z', col, { sd: 2.2, hd: 1.6, hi: lt(col, 0.5) });
  for (const x of [13, 19, 25]) fl(I, poly([[x, 38.5], [x + 3, 38.8], [x + 1.6, 35.6]]), '#f7f4ec');
  fl(I, ellipse(41, 26, 3.2, 2.1, -0.25), '#fff36b'); fl(I, ellipse(41.4, 26.1, 1, 1.9, -0.2), OUT);
  if (!I.small) { ln(I, 'M9 31 C4 34 3 40 6 45', lt(col, 0.45), 1.3); ln(I, 'M13 28 C14 24 18 22 22 22', dk(col, 0.35), 1.1); fl(I, circle(10, 31.5, 1.1), dk(col, 0.5)); }
}

// ---- motifs: SK.name(I, o) draws inside the badge, o.c main colour
SK.fist = (I, o) => {
  if (o.burst) burst(I, 46, 18, 13, 6.5, o.burst);
  if (o.lines !== false) speed(I, [[6, 44, 16, 38], [4, 36, 13, 31], [9, 52, 18, 45]], o.line || '#ffffff', 2.2);
  tf(I, { r: o.r ?? -0.3, s: o.s ?? 0.86, x: o.x ?? 2, y: o.y ?? 1 }, () => fistShape(I, o.c || SKIN, o.c === BLACKFIST));
  if (o.fx) SK.fx(I, o.fx);
};
SK.fx = (I, fx) => {
  if (fx === 'fire') { flame(I, 16, 56, 0.42); flame(I, 50, 58, 0.34); }
  else if (fx === 'bolt') { bolt(I, { s: 0.42, ox: 32, oy: 32, x: 16, y: -14 }); bolt(I, { s: 0.3, ox: 32, oy: 32, x: -18, y: 14, r: 0.4 }); }
  else if (fx === 'water') for (const [x, y, s] of [[50, 14, 0.55], [54, 30, 0.4], [12, 16, 0.45]]) part(I, dropP(x, y, s), '#7fd3f7', { sd: 0.8, hd: 0.6 });
  else if (fx === 'poison') for (const [x, y, s] of [[20, 58, 0.45], [44, 58, 0.38], [52, 46, 0.3]]) part(I, dropP(x, y, s), '#b35ad6', { sd: 0.8, hd: 0.6 });
  else if (fx === 'cracks') crackLines(I, 48, 16, 12, '#e8f7ff');
  else if (fx === 'mochi') { for (const [x, y, s] of [[18, 56, 0.5], [30, 60, 0.4], [44, 56, 0.45]]) part(I, dropP(x, y, s), '#fbf6ea', { sd: 0.8, shT: 0.2, hd: 0.6 }); }
  else if (fx === 'smoke') for (const [x, y, r] of [[14, 52, 6], [8, 44, 4.6], [52, 50, 5]]) part(I, circle(x, y, r), '#eef2f4', { sd: 1, hd: 0.8 });
};
function crackLines(I, x, y, r, col) {
  const d = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3, a2 = a + 0.35, r2 = r * (0.55 + (i % 2) * 0.2); d.push(`M${x} ${y} L${x + Math.cos(a) * r2} ${y + Math.sin(a) * r2} L${x + Math.cos(a2) * r} ${y + Math.sin(a2) * r}`); }
  ln(I, d.join(' '), OUT, 3.4); ln(I, d.join(' '), col, 1.6);
}
SK.stretch = (I, o) => {
  const c = o.c || SKIN;
  speed(I, [[10, 30, 22, 24], [12, 44, 30, 38]], '#ffffff', 2);
  tube(I, 'M-2 66 C10 52 22 44 34 36', c, 8.5);
  tf(I, { r: -0.5, s: 0.62, x: 12, y: -10 }, () => fistShape(I, c));
  if (o.burst) burst(I, 52, 12, 9, 4.6, o.burst);
};
SK.multi = (I, o) => {
  const c = o.c || SKIN;
  speed(I, [[4, 30, 14, 26], [4, 42, 16, 38], [8, 54, 18, 48]], '#ffffff', 2);
  for (const [x, y, s, r] of [[-12, -12, 0.46, -0.7], [8, -14, 0.46, -0.3], [-12, 10, 0.46, -0.6], [10, 8, 0.56, -0.4]]) tf(I, { r, s, x, y }, () => fistShape(I, c));
};
SK.palm = (I, o) => {
  if (o.rings) rings(I, 32, 30, 22, 3, o.ring || '#ffffff', -2.3, -0.8, 2.6);
  if (o.burst) burst(I, 32, 14, 12, 6, o.burst);
  tf(I, { s: o.s ?? 0.82, y: 4 }, () => palmShape(I, o.c || SKIN));
  if (o.two) tf(I, { s: 0.7, x: 12, y: 8, r: 0.2 }, () => palmShape(I, o.c || SKIN));
};
SK.palms = (I, o) => {
  if (o.burst) burst(I, 32, 12, 13, 6.5, o.burst);
  tf(I, { s: 0.62, x: -10, y: 8, r: -0.25 }, () => palmShape(I, o.c || SKIN));
  tf(I, { s: 0.62, x: 10, y: 8, r: 0.25 }, () => palmShape(I, o.c || SKIN));
};
SK.kick = (I, o) => {
  if (o.burst) burst(I, 50, 17, 11, 5.5, o.burst);
  if (o.arc !== false) part(I, xf(crescentP(28, 46, 27, -2.3, -0.45, 7.5), { ox: 32, oy: 32, r: o.r || 0 }), fade(o.line || '#ffffff', 0.8), { sd: 0, hd: 0, ol: I.ol * 0.6 });
  if (o.fx === 'fire') { flame(I, 16, 50, 0.4, o.flame); flame(I, 30, 60, 0.36, o.flame); flame(I, 44, 30, 0.34, o.flame); }
  tf(I, { r: (o.r || 0) - 0.62, s: (o.s ?? 1) * 0.8, x: o.x ?? -1, y: o.y ?? 1 }, () => legShape(I, o.c || '#4a5068', o.shoe || '#1f1b22', o.sole));
};
SK.swords = (I, o) => {
  const n = o.n || 1, pal = o.pal || [{}, { wrap: '#1f1a22', blade: '#dfe6ec' }, { wrap: '#f4f1ea', tsuba: '#e2b64a' }];
  if (o.arc !== false) { part(I, crescentP(32, 36, 23, -2.7, -0.3, 6.2), o.arcCol || '#eaf6ff', { sd: 0.8, hd: 0.6, ol: I.ol * 0.8 }); }
  const angles = n === 1 ? [0] : n === 2 ? [0, Math.PI / 2] : [0, Math.PI / 2, Math.PI / 4];
  angles.forEach((r, i) => tf(I, { r, s: n === 3 && i === 2 ? 0.66 : 0.74, y: n === 3 && i === 2 ? -8 : 0 }, () => D.katana(I, { ...SWORD.wazamono, ...(pal[i] || {}) })));
};
SK.slash = (I, o) => {
  const c = o.c || '#eaf6ff', n = o.n || 1;
  const sets = { 1: [[36, 38, 24, -2.8, -0.35, 9]], 2: [[30, 40, 22, -2.6, -0.5, 7.5], [34, 40, 22, -2.6, -0.5, 7.5, 1]], 3: [[26, 44, 20, -2.4, -0.7, 6], [32, 38, 20, -2.4, -0.7, 6], [38, 32, 20, -2.4, -0.7, 6]] }[Math.min(3, n)];
  for (const [x, y, r, a0, a1, w, flip] of sets) {
    const p = crescentP(x, y, r, a0, a1, w);
    part(I, flip ? xf(p, { sx: -1, ox: 32 }) : p, c, { sd: 1, hd: 0.8, hi: '#ffffff', ol: I.ol * 0.85 });
  }
  if (o.burst) burst(I, 32, 32, 8, 4, o.burst, 8);
};
SK.claw = (I, o) => {
  const c = o.c || '#ffffff';
  for (let i = -1; i <= 1; i++) part(I, taper(bez([46 + i * 9, 8 + i * 7], [40 + i * 9, 20 + i * 7], [28 + i * 9, 34 + i * 7], [14 + i * 9, 48 + i * 7], 16), (t) => 0.8 + 6 * Math.pow(Math.sin(Math.PI * t), 0.8)), c, { sd: 0.9, hd: 0.7, hi: '#ffffff', ol: I.ol * 0.85 });
  if (o.hand) tf(I, { s: 0.46, x: 14, y: -15, r: 0.5 }, () => clawHand(I, o.hand));
};
function clawHand(I, c) {
  for (const [x, r] of [[20, -0.35], [28, -0.1], [36, 0.12], [44, 0.35]]) part(I, xf('M0 0 C-3 -6 -2 -14 3 -18 C1 -12 3 -6 5 -2 Z', { ox: 0, oy: 0, x, y: 22, r }), '#f3e6c4', { sd: 0.6, hd: 0.4 });
  part(I, rrect(16, 20, 32, 22, 9), c, { sd: 2, hd: 1.4 });
  part(I, rrect(24, 40, 16, 16, 4), dk(c, 0.1), { sd: 1.4, hd: 1 });
}
SK.airblade = (I, o) => {
  const c = o.c || '#dff4ff';
  speed(I, [[4, 24, 16, 24], [2, 34, 12, 34], [6, 44, 18, 44]], c, 2, 0.8);
  part(I, crescentP(20, 34, 30, -0.95, 0.95, 11, 0.8), c, { sd: 1.4, hd: 1, hi: '#ffffff' });
  if (o.n === 2) part(I, crescentP(8, 34, 26, -0.8, 0.8, 7, 0.8), c, { sd: 1, hd: 0.8, hi: '#ffffff' });
};
SK.dash = (I, o) => {
  const c = o.c || '#ffffff';
  speed(I, [[6, 22, 26, 22], [4, 32, 30, 32], [8, 42, 26, 42]], c, 2.4);
  for (const x of [30, 42]) part(I, `M${x} 16 L${x + 14} 32 L${x} 48 L${x - 5} 48 L${x + 8} 32 L${x - 5} 16 Z`, o.c2 || c, { sd: 1, hd: 0.8 });
};
SK.finger = (I, o) => {
  const c = o.c || SKIN;
  if (o.burst) burst(I, 50, 16, 11, 5.5, o.burst);
  speed(I, [[6, 50, 14, 42], [4, 40, 10, 34]], '#ffffff', 2);
  tf(I, { r: -0.78, s: 0.8, x: 2, y: 4 }, () => {
    part(I, rrect(23.5, 44, 16, 13, 4), dk(c, 0.1), { sd: 1.4, hd: 1 });
    part(I, rrect(17, 24, 29.5, 24, 8.5), c, { sd: 2.4, hd: 1.4 });
    part(I, rrect(24.6, 2, 7.5, 28, 3.7), c, { sd: 1.4, hd: 1.2 });
    for (const x of [31.9, 39.2]) part(I, rrect(x, 18, 7.5, 13, 3.7), c, { sd: 1.4, hd: 1.2 });
    part(I, 'M13.5 35 C13.5 30 18 28.5 24 30 L36 32.5 C40 33.5 40.5 39 36.5 40 L21 41.5 C16.5 42 13.5 39.5 13.5 35 Z', c, { sd: 1.4, hd: 1 });
  });
};
SK.wave = (I, o) => {
  const c = o.c || '#4fb3e8';
  const w = 'M3 52 C8 40 16 30 28 26 C40 22 52 26 55 36 C57 43 52 48 46 47 C41 46 40 40 44 37 C40 33 33 34 29 39 C24 46 26 54 30 58 H3 Z';
  part(I, w, c, { sd: 2.4, hd: 1.8, hi: '#e8f8ff' });
  clip(I, w, () => { ln(I, 'M8 50 C12 42 18 36 26 33', lt(c, 0.5), 1.6, { a: 0.8 }); });
  for (const [x, y, r] of [[56, 30, 2.4], [58, 22, 1.6], [52, 20, 1.3]]) part(I, circle(x, y, r), '#e8f8ff', { flat: true, ol: I.ol * 0.6 });
  if (o.fx) SK.fx(I, o.fx);
};
SK.drops = (I, o) => {
  speed(I, [[6, 26, 18, 30], [4, 38, 16, 40], [8, 50, 20, 50]], '#ffffff', 2);
  for (const [x, y, s] of [[30, 24, 1], [46, 36, 0.8], [30, 46, 0.7], [48, 18, 0.55]]) part(I, xf(dropP(x, y, s), { ox: x, oy: y, r: 1.3 }), o.c || '#7fd3f7', { sd: 1.2, hd: 1, hi: '#ffffff' });
};
SK.rings = (I, o) => {
  const c = o.c || '#ffffff';
  for (let i = 0; i < 3; i++) { const p = new Path2D(); p.addPath(circle(32, 32, 9 + i * 7.5)); p.addPath(circle(32, 32, 6.4 + i * 7.5)); part(I, p, c, { rule: 'evenodd', sd: 0, hd: 0, ol: I.ol * 0.7 }); }
  if (o.center) part(I, circle(32, 32, 5), o.center, { sd: 1, hd: 0.8 });
};
SK.bolt = (I, o) => { if (o.glow !== false) glow(I, circle(32, 32, 22), o.c || '#fff36b', 0.35); bolt(I, { c: o.c, s: o.s ?? 0.9 }); if (o.two) bolt(I, { c: o.c, s: 0.45, ox: 32, oy: 32, x: -16, y: 8, r: 0.3 }); };
SK.cloud = (I, o) => {
  if (o.bolt) bolt(I, { s: 0.62, ox: 32, oy: 32, x: 0, y: 12 });
  if (o.rain) for (const x of [20, 30, 40]) ln(I, `M${x} 40 L${x - 3} 50`, '#9fd9f5', 2.2);
  part(I, cloudP(32, 26, 1.05), o.c || '#e9eef3', { sd: 2, hd: 1.4 });
};
SK.tornado = (I, o) => {
  const c = o.c || '#e7f3f8';
  const rows = [[32, 14, 22, 5], [31, 23, 18, 4.4], [33, 31, 14, 3.8], [31, 39, 10, 3.2], [33, 46, 7, 2.6], [32, 52, 4, 2]];
  for (const [x, y, rx, ry] of rows.reverse()) part(I, ellipse(x, y, rx, ry), c, { sd: 1, hd: 0.8 });
  if (!I.small) for (const [x, y, rx] of [[32, 14, 22], [31, 23, 18], [33, 31, 14]]) ln(I, arcPath(x, y, rx * 0.7, 0.3, 2.6), dk(c, 0.25), 1, { a: 0.7 });
  if (o.sword) tf(I, { s: 0.5, r: 0.2, x: 12, y: 10 }, () => D.katana(I, {}));
};
SK.flame = (I, o) => {
  const cols = o.cols || ['#e8452c', '#f7931e', '#ffe066'];
  glow(I, circle(32, 36, 23), cols[1], 0.3);
  flame(I, 32, 58, o.s ?? 0.95, cols);
  if (o.pillar) for (const x of [14, 50]) flame(I, x, 58, 0.45, cols);
};
SK.fireballs = (I, o) => {
  const cols = o.cols || ['#e8452c', '#f7931e', '#ffe066'];
  for (const [x, y, s] of [[18, 44, 0.3], [44, 48, 0.32], [30, 30, 0.36], [50, 24, 0.28], [16, 22, 0.24]]) { part(I, circle(x, y + 4 * s, 11 * s), cols[1], { sd: 1, hd: 0.8, ol: I.ol * 0.8 }); flame(I, x, y + 12 * s, s, cols); }
};
SK.sun = (I, o) => {
  const c = o.c || '#ffd23f';
  glow(I, circle(32, 32, 24), c, 0.4);
  part(I, star(32, 32, 12, 24, 15, 0.1), o.ray || lt(c, 0.2), { sd: 1, hd: 0.8, ol: I.ol * 0.8 });
  part(I, circle(32, 32, 13), c, { sd: 2.2, hd: 1.6, hi: '#ffffff' });
  if (o.face) { fl(I, circle(27, 30, 1.6), OUT); fl(I, circle(37, 30, 1.6), OUT); ln(I, 'M26 35 C29 39 35 39 38 35', OUT, 1.6); }
};
SK.moon = (I, o) => {
  const c = o.c || '#fff1b0';
  if (o.full) { glow(I, circle(32, 30, 22), c, 0.35); part(I, circle(32, 30, 16), c, { sd: 2, hd: 1.4, hi: '#ffffff' }); if (!I.small) for (const [x, y, r] of [[26, 26, 3], [36, 34, 2.4], [37, 23, 1.6]]) fl(I, circle(x, y, r), dk(c, 0.12)); }
  else part(I, crescentP(32, 31, 15, 0.9, 0.9 + TAU * 0.7, 12, 0.5), c, { sd: 1.6, hd: 1.2, hi: '#ffffff' });
  if (o.bolt) { bolt(I, { s: 0.36, ox: 32, oy: 32, x: 15, y: 15 }); bolt(I, { s: 0.3, ox: 32, oy: 32, x: -16, y: 16, r: 0.3 }); }
};
/** Stepping on air: a shoe kicking off a puff of cloud (Geppo, Sky Walk). */
SK.airstep = (I, o) => {
  for (const r of [13, 19]) ln(I, arcPath(30, 50, r, Math.PI * 1.08, Math.PI * 1.92), '#ffffff', 2, { a: 0.75 });
  part(I, cloudP(30, 50, 0.72), '#ffffff', { sd: 1.2, shT: 0.2, hd: 0.8 });
  tf(I, { r: -1.1, s: 0.62, x: 4, y: -12 }, () => legShape(I, o.c || '#4a5068', '#1f1b22'));
  if (o.moon) part(I, crescentP(46, 18, 7, 0.9, 0.9 + TAU * 0.7, 5.5, 0.4), '#fff1b0', { sd: 0.8, hd: 0.6 });
};
SK.ice = (I, o) => {
  const c = o.c || '#bfefff';
  glow(I, circle(32, 34, 22), '#e8fbff', 0.35);
  const shard = (x, y, h, w, r) => part(I, xf(poly([[x, y - h], [x + w, y - h + w], [x + w, y], [x, y + w * 0.5], [x - w, y], [x - w, y - h + w]]), { ox: x, oy: y, r }), c, { sd: w * 0.35, hd: w * 0.25, hi: '#ffffff' });
  shard(20, 52, 22, 5, -0.5); shard(44, 52, 22, 5, 0.5); shard(32, 54, 34, 7, 0);
  if (o.flake) { for (let i = 0; i < 3; i++) ln(I, `M${32 + Math.cos(i * Math.PI / 3) * 12} ${20 + Math.sin(i * Math.PI / 3) * 12} L${32 - Math.cos(i * Math.PI / 3) * 12} ${20 - Math.sin(i * Math.PI / 3) * 12}`, '#ffffff', 2.4); }
};
SK.iceCube = (I, o) => {
  const c = o.c || '#bfefff';
  const top = [[32, 12], [52, 22], [32, 32], [12, 22]], L = [[12, 22], [32, 32], [32, 56], [12, 46]], R = [[32, 32], [52, 22], [52, 46], [32, 56]];
  part(I, union(poly(top), poly(L), poly(R)), c, { sd: 0, hd: 0 });
  fl(I, poly(L), dk(c, 0.08)); fl(I, poly(R), dk(c, 0.2)); fl(I, poly(top), lt(c, 0.4));
  ln(I, 'M12 22 L32 32 L52 22 M32 32 V56', '#ffffff', 1.2, { a: 0.8 });
  fl(I, 'M28 36 C26 40 26 46 30 50 C33 46 33 40 31 36 Z', dk(c, 0.35), { a: 0.7 });
  gloss(I, 18, 30, 1.6, 5, 0.8, 0.5);
};
SK.beam = (I, o) => {
  const c = o.c || '#fff36b';
  glow(I, rrect(4, 20, 58, 24, 12), c, 0.35);
  part(I, 'M10 32 L60 22 V42 Z', lt(c, 0.25), { sd: 1, hd: 0.8, ol: I.ol * 0.8 });
  part(I, 'M14 32 L60 28 V36 Z', '#ffffff', { flat: true, ol: 0 });
  burst(I, 14, 32, 11, 5, c, 8);
};
SK.lightOrbs = (I, o) => {
  const c = o.c || '#fff36b';
  for (const [x, y, r] of [[20, 20, 7], [42, 16, 5.5], [36, 38, 8.5], [16, 44, 5.5], [50, 48, 5]]) { glow(I, circle(x, y, r * 1.6), c, 0.35); part(I, circle(x, y, r), lt(c, 0.3), { sd: r * 0.2, hd: r * 0.15, hi: '#ffffff' }); speed(I, [[x - r * 0.4, y - r * 0.9, x - r * 1.8, y - r * 2.4]], c, 1.6, 0.7); }
};
SK.mirror = (I, o) => {
  const oct = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; oct.push([32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20]); }
  part(I, poly(oct), o.c || '#e0b24a', { sd: 2, hd: 1.4 });
  const inner = []; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; inner.push([32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15]); }
  part(I, poly(inner), '#dff4ff', { sd: 1, hd: 0, ol: I.ol * 0.7 });
  gloss(I, 26, 26, 5, 2, 0.9, -0.7);
  if (o.light) sparkle(I, 44, 18, 6, '#fff6b0');
};
SK.magma = (I, o) => {
  glow(I, circle(32, 32, 22), '#ff6a2a', 0.35);
  tf(I, { r: -0.3, s: 0.86, x: 2, y: 1 }, () => {
    fistShape(I, '#5a2a1e');
    ln(I, 'M20 20 L24 28 L22 36 M30 16 L33 26 L30 32 L34 40 M38 20 L42 30 M20 44 L28 42 L36 46', '#ff8a2a', 2.2);
    ln(I, 'M20 20 L24 28 L22 36 M30 16 L33 26 L30 32 L34 40 M38 20 L42 30 M20 44 L28 42 L36 46', '#ffe066', 0.9);
  });
  for (const [x, y, s] of [[14, 56, 0.4], [48, 58, 0.34]]) part(I, dropP(x, y, s), '#ff7a2a', { sd: 0.8, hd: 0.6 });
  if (o.lines !== false) speed(I, [[4, 40, 12, 36], [6, 50, 14, 44]], '#ffd29a', 2);
};
SK.meteor = (I, o) => {
  const c = o.c || '#8a5a3a', tail = o.tail || ['#e8452c', '#f7931e', '#ffe066'];
  const tp = taper(bez([60, 2], [50, 12], [40, 22], [30, 31], 14), 2, 24);
  fl(I, tp, lg(I, 58, 4, 30, 31, [[0, fade(tail[0], 0)], [0.45, fade(tail[0], 0.85)], [1, tail[1]]]));
  fl(I, taper(bez([58, 5], [48, 14], [40, 22], [32, 30], 14), 1, 13), lg(I, 58, 5, 32, 30, [[0, fade(tail[2], 0)], [1, tail[2]]]));
  part(I, circle(26, 38, 14), c, { sd: 2.6, hd: 1.8 });
  if (!I.small) for (const [x, y, r] of [[22, 34, 3], [30, 42, 2.4], [20, 44, 1.8]]) fl(I, circle(x, y, r), dk(c, 0.3));
  if (o.two) { part(I, circle(50, 50, 6), c, { sd: 1.2, hd: 0.8 }); }
};
SK.vortex = (I, o) => {
  const c = o.c || '#7a4fc8';
  part(I, circle(32, 32, 22), '#1a1024', { sd: 0, hd: 0 });
  for (let i = 0; i < 3; i++) ln(I, spiral(32, 32, 20, 1.3, i * TAU / 3, 1), c, 3 - i * 0.4, { a: 0.9 });
  fl(I, circle(32, 32, 5), '#05020a');
  if (o.ring) { part(I, xf(crescentP(32, 32, 26, 0.2, 2.9, 3.4), { sy: 0.4, oy: 32 }), '#c9a0ff', { sd: 0.6, hd: 0.4, ol: I.ol * 0.7 }); }
  if (o.hand) tf(I, { s: 0.5, x: 14, y: 12, r: 0.5 }, () => clawHand(I, '#2a1f33'));
};
SK.cracks = (I, o) => {
  const c = o.c || '#dff4ff';
  part(I, circle(32, 32, 20), c, { sd: 2.4, hd: 1.6, hi: '#ffffff' });
  clip(I, circle(32, 32, 20), () => crackLines(I, 32, 32, 24, dk(c, 0.1)));
  crackLines(I, 32, 32, 26, '#ffffff');
};
SK.room = (I, o) => {
  const c = o.c || '#7fc8f8';
  part(I, circle(32, 34, 23), fade(c, 0.35), { sd: 0, hd: 0, ol: I.ol * 0.8 });
  ln(I, circle(32, 34, 18.5), '#ffffff', 1.6, { dash: [3, 2.4] });
  part(I, xf(ellipse(32, 50, 23, 6), {}), fade(c, 0.5), { sd: 0, hd: 0, ol: I.ol * 0.6 });
  if (o.cube) part(I, rrect(24, 26, 16, 16, 2), '#eaf6ff', { sd: 1.2, hd: 1 });
  else for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ln(I, `M${32 + Math.cos(a) * 14} ${34 + Math.sin(a) * 14} L${32 + Math.cos(a) * 22} ${34 + Math.sin(a) * 22}`, '#ffffff', 2); }
};
SK.swap = (I, o) => {
  const c = o.c || '#dff4ff';
  const arrow = (flip) => { const p = xf('M12 30 C12 18 22 12 34 14 L34 8 L46 18 L34 28 L34 22 C26 20 20 24 20 30 Z', flip ? { r: Math.PI } : {}); part(I, p, c, { sd: 1.2, hd: 1 }); };
  arrow(false); arrow(true);
};
SK.heartCube = (I, o) => {
  const c = o.c || '#bfe4ff';
  const top = [[32, 14], [50, 23], [32, 32], [14, 23]], L = [[14, 23], [32, 32], [32, 54], [14, 45]], R = [[32, 32], [50, 23], [50, 45], [32, 54]];
  part(I, union(poly(top), poly(L), poly(R)), fade(c, 0.6), { sd: 0, hd: 0 });
  part(I, heartP(32, 36, 9), '#e0304a', { sd: 1.4, hd: 1, gloss: [28.5, 32, 1.6, 1, 0.8] });
  fl(I, poly(top), fade('#ffffff', 0.35)); fl(I, poly(R), fade(c, 0.35));
  ln(I, 'M14 23 L32 32 L50 23 M32 32 V54', '#ffffff', 1.1, { a: 0.8 });
};
SK.glove = (I, o) => {
  const c = o.c || '#f4f1ea';
  speed(I, [[6, 48, 16, 40], [4, 38, 12, 32]], '#ffffff', 2);
  ln(I, 'M8 58 L22 44', '#ffffff', 2, { dash: [2.4, 2.4] });
  tf(I, { r: -0.5, s: 0.72, x: 6, y: -4 }, () => { fistShape(I, c); part(I, rrect(21, 50, 22, 8, 3), '#d23b32', { sd: 1, hd: 0.8 }); });
  if (o.multi) for (const [x, y, r] of [[48, 48, 5], [14, 18, 4]]) part(I, circle(x, y, r), c, { sd: 1, hd: 0.8 });
};
SK.bomb = (I, o) => {
  part(I, circle(30, 38, 17), o.c || '#2f2a38', { sd: 2.6, hd: 2, hi: '#8a86a0', gloss: [23, 30, 4, 2.4, 0.5] });
  part(I, rrect(35, 16, 10, 8, 2), '#8a8f96', { sd: 0.8, hd: 0.6 });
  tube(I, 'M40 17 C42 10 48 8 52 10', '#c9a870', 1.8, { flat: true });
  burst(I, 53, 9, 6.5, 3, '#ffd23f', 7);
};
SK.explosion = (I, o) => {
  burst(I, 32, 32, 25, 14, o.c || '#f7931e', 11);
  burst(I, 32, 32, 15, 8, o.c2 || '#ffe066', 9);
  if (o.smoke) for (const [x, y, r] of [[14, 50, 6], [50, 50, 5]]) part(I, circle(x, y, r), '#d6d0c8', { sd: 1, hd: 0.8 });
};
SK.flower = (I, o) => {
  if (o.arms) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2; tf(I, { r: a + Math.PI / 2, ox: 32, oy: 32 }, () => { tube(I, 'M32 32 L32 14', SKIN, 5.4); part(I, ellipse(32, 11, 4.2, 5), SKIN, { sd: 0.8, hd: 0.6 }); }); }
    sakura(I, 32, 32, 12, o.c || '#f7a8c4', 0.3);
    return;
  }
  if (o.cross) for (const r of [-0.7, 0.7]) tf(I, { r }, () => { tube(I, 'M32 58 L32 12', SKIN, 6); part(I, ellipse(32, 9, 5, 5.6), SKIN, { sd: 0.8, hd: 0.6 }); });
  sakura(I, 32, 32, o.cross ? 11 : 18, o.c || '#f7a8c4', 0.3);
};
SK.strings = (I, o) => {
  const c = o.c || '#f4f1ea';
  const cols = o.five ? ['#e8453c', '#f7931e', '#ffe14a', '#5ec46a', '#5aa9f0'] : [c, c, c, c, c];
  if (o.hand) tf(I, { s: 0.5, x: 0, y: -16, r: Math.PI }, () => palmShape(I, SKIN));
  [[14, 60], [22, 60], [32, 60], [42, 60], [50, 60]].forEach(([x, y], i) => { const d = `M${22 + i * 5} 20 C${22 + i * 5} 34 ${x} 42 ${x} ${y}`; ln(I, d, OUT, 3.2); ln(I, d, cols[i], 1.6); });
  if (o.hot) glow(I, rrect(10, 18, 44, 44, 12), '#ff5a3a', 0.3);
};
SK.cage = (I, o) => {
  const c = o.c || '#f4f1ea';
  const d = []; for (let i = -3; i <= 3; i++) d.push(`M${32 + i * 7} 58 C${32 + i * 7.5} 30 ${32 + i * 3} 14 32 8`);
  const s = d.join(' ') + ' M8 58 H56 M12 40 C22 36 42 36 52 40 M18 24 C26 21 38 21 46 24';
  ln(I, s, OUT, 3.2); ln(I, s, c, 1.6);
};
SK.mochi = (I, o) => {
  const c = o.c || '#fbf6ea';
  if (o.trident) { tube(I, 'M32 62 V20', '#e9dcc0', 4); part(I, 'M20 8 C20 18 24 22 32 22 C40 22 44 18 44 8 L40 14 C38 18 36 18 34.5 16 L32 4 L29.5 16 C28 18 26 18 24 14 Z', c, { sd: 1.4, hd: 1 }); return; }
  const b = 'M10 40 C8 28 18 16 32 16 C46 16 56 28 54 40 C53 46 50 48 48 46 L47 54 C46 58 42 58 42 54 L41 48 C38 50 30 50 26 48 L24 56 C23 60 19 60 19 56 L18 47 C14 48 11 45 10 40 Z';
  part(I, b, c, { sd: 2.6, shT: 0.18, hd: 1.6 });
  if (o.fists) for (const [x, y] of [[20, 30], [42, 28]]) tf(I, { s: 0.36, x: x - 32, y: y - 32, r: -0.3 }, () => fistShape(I, c));
};
SK.ghost = (I, o) => {
  const c = o.c || '#f6eef8';
  const g = (x, y, s) => { part(I, ghostP(x, y, s), c, { sd: 1.6 * s, shT: 0.2, hd: 1.2 * s }); fl(I, ellipse(x - 3.6 * s, y - 2 * s, 1.8 * s, 2.6 * s), OUT); fl(I, ellipse(x + 3.6 * s, y - 2 * s, 1.8 * s, 2.6 * s), OUT); part(I, ellipse(x, y + 4 * s, 2 * s, 3 * s), '#e0487a', { flat: true, ol: I.ol * 0.5 }); };
  if (o.many) { g(20, 38, 0.7); g(44, 40, 0.62); g(32, 22, 0.66); } else g(32, 32, 1.35);
};
SK.bats = (I, o) => { for (const [x, y, s] of [[32, 26, 1.1], [16, 42, 0.7], [48, 44, 0.75]]) bat(I, x, y, s, o.c || '#2f2a38'); };
SK.figure = (I, o) => {
  const c = o.c || '#2a2530';
  if (o.aura) glow(I, ellipse(32, 36, 22, 26), o.aura, 0.5);
  const f = union(circle(32, 16, 7.5), 'M18 58 C17 44 20 30 32 27 C44 30 47 44 46 58 Z');
  part(I, f, c, { sd: 2, hd: 1.4, hi: lt(c, 0.4) });
  if (o.eyes) { fl(I, ellipse(29, 16, 1.4, 2), o.eyes); fl(I, ellipse(35, 16, 1.4, 2), o.eyes); }
  if (o.steam) for (const [x, y, r] of [[14, 20, 5], [50, 18, 5.5], [48, 40, 4.5], [14, 42, 4.2]]) part(I, circle(x, y, r), '#fbe3ea', { sd: 0.8, hd: 0.6 });
};
SK.skull = (I, o) => { if (o.aura) glow(I, circle(32, 32, 24), o.aura, 0.45); skull(I, 32, 30, 14, o.c || '#f4f1ea', o.bones !== false); };
SK.snake = (I, o) => {
  const c = o.c || '#9c5ad0';
  part(I, taper(bez([6, 60], [18, 40], [8, 28], [26, 22], 16), 13, 9), c, { sd: 2, hd: 1.4 });
  part(I, 'M20 14 C28 8 42 8 52 16 C56 19 56 24 52 26 L40 28 C36 32 28 34 22 30 C16 26 15 18 20 14 Z', c, { sd: 2, hd: 1.4 });
  part(I, 'M40 26 L52 26 L48 32 L38 31 Z', '#f4f1ea', { sd: 0.6, hd: 0.4 });
  for (const x of [42, 48]) fl(I, poly([[x, 26], [x + 2, 26], [x + 1, 30]]), '#ffffff');
  fl(I, ellipse(34, 17, 2.4, 1.7, 0.2), '#ffe066'); fl(I, ellipse(34.3, 17, 0.8, 1.4, 0.2), OUT);
};
SK.hex = (I, o) => {
  const c = o.c || '#8fd8ff';
  const h = (x, y, r) => { const p = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return poly(p); };
  glow(I, circle(32, 32, 24), c, 0.35);
  part(I, h(32, 32, 22), fade(c, 0.55), { sd: 0, hd: 0 });
  for (const [x, y] of [[32, 32], [32, 18.5], [32, 45.5], [20.3, 25.2], [43.7, 25.2], [20.3, 38.8], [43.7, 38.8]]) ln(I, h(x, y, 7.4), '#ffffff', 1.3, { a: 0.9 });
  gloss(I, 24, 22, 5, 2, 0.7, -0.6);
  if (o.burst) burst(I, 50, 14, 10, 5, o.burst);
};
SK.eye = (I, o) => {
  if (o.ripples !== false) for (let i = 0; i < 3; i++) ln(I, ellipse(32, 32, 14 + i * 5.5, 8 + i * 5.5), o.ripple || '#dff8ff', 2 - i * 0.4, { a: 0.9 - i * 0.22 });
  eyeShape(I, 32, 32, 13, o.c || '#f7f4ec', o.iris || '#e0303a');
  if (o.dashed) ln(I, 'M8 32 C16 20 48 20 56 32 C48 44 16 44 8 32 Z', '#ffffff', 1.4, { dash: [2.4, 2.4] });
};
SK.sparkles = (I, o) => {
  const c = o.c || '#ffe9f2';
  part(I, 'M8 44 C20 38 30 40 40 34 C48 29 52 22 56 16 L58 20 C54 28 48 36 40 40 C30 46 20 44 8 50 Z', c, { sd: 1, hd: 0.8 });
  for (const [x, y, r] of [[24, 24, 7], [44, 44, 5.5], [14, 30, 4]]) part(I, star(x, y, 4, r, r * 0.3), '#ffffff', { flat: true, ol: I.ol * 0.7 });
};
SK.mace = (I, o) => {
  tube(I, 'M14 56 L34 32', '#8a5a30', 4.4);
  part(I, star(40, 24, 8, 17, 11), o.c || '#9aa6af', { sd: 1.6, hd: 1.2 });
  part(I, circle(40, 24, 11), o.c || '#9aa6af', { sd: 2, hd: 1.4, gloss: [36, 20, 2.6, 1.5, 0.7] });
};
SK.candle = (I, o) => {
  const c = o.c || '#fbf3dc';
  if (o.arrows) { for (const [x, y] of [[18, 38], [30, 28], [42, 18]]) tf(I, { r: -0.78, ox: x, oy: y }, () => { part(I, rrect(x - 14, y - 2, 22, 4, 1.5), c, { sd: 0.8, hd: 0.6 }); part(I, poly([[x + 8, y - 5], [x + 16, y], [x + 8, y + 5]]), c, { sd: 0.6, hd: 0.4 }); }); return; }
  part(I, 'M22 24 H42 V56 C42 58 40 60 38 60 H26 C24 60 22 58 22 56 Z', c, { sd: 2.2, shT: 0.2, hd: 1.4 });
  part(I, 'M21 24 C21 20 43 20 43 24 L43 30 C41 34 39 30 38 33 C37 38 34 38 33 33 C32 30 29 30 28 34 C27 37 24 36 24 32 C23 29 21 30 21 27 Z', lt(c, 0.2), { sd: 1, hd: 0.8, shT: 0.15 });
  tube(I, 'M32 22 V16', OUT, 1.4, { flat: true });
  flame(I, 32, 17, 0.26);
  if (o.lock) { const r = new Path2D(); r.addPath(ellipse(32, 44, 18, 8)); r.addPath(ellipse(32, 44, 12, 4.5)); part(I, r, '#e9dcc0', { rule: 'evenodd', sd: 1, hd: 0.8 }); }
};
SK.bladeFlower = (I, o) => {
  const c = o.c || '#dfe7ee';
  for (let i = 0; i < 8; i++) part(I, xf('M32 32 L28 12 C30 6 34 6 36 12 Z', { r: i / 8 * TAU + 0.2 }), c, { sd: 0.8, hd: 0.6, hi: '#ffffff' });
  part(I, circle(32, 32, 6), '#8a949b', { sd: 1, hd: 0.8 });
};
SK.shield = (I, o) => {
  const c = o.c || '#aab5bd';
  const s = 'M32 8 C40 12 48 13 54 12 C55 30 50 48 32 58 C14 48 9 30 10 12 C16 13 24 12 32 8 Z';
  part(I, s, c, { sd: 2.6, hd: 1.8 });
  clip(I, s, () => { fl(I, 'M32 0 V64 H64 V0 Z', dk(c, 0.08), { a: 0.6 }); });
  if (!I.small) for (const [x, y] of [[16, 16], [48, 16], [32, 12], [20, 40], [44, 40]]) part(I, circle(x, y, 1.6), lt(c, 0.4), { flat: true, ol: I.ol * 0.5 });
  if (o.emblem) o.emblem(I);
};
SK.paper = (I, o) => {
  part(I, 'M18 10 C26 14 34 8 44 12 C42 22 48 30 44 40 C40 50 46 54 42 58 C32 54 26 60 16 56 C20 46 14 38 18 28 C22 20 14 16 18 10 Z', o.c || '#fbf8f0', { sd: 2, shT: 0.15, hd: 1.2 });
  speed(I, [[48, 20, 58, 24], [50, 34, 60, 34], [48, 48, 58, 44]], '#ffffff', 1.8);
};
SK.paw = (I, o) => {
  const c = o.c || '#f4b8c8';
  if (o.bubble) { glow(I, circle(32, 34, 26), '#dff4ff', 0.45); part(I, circle(32, 34, 23), fade('#dff4ff', 0.45), { sd: 0, hd: 0, ol: I.ol * 0.8 }); gloss(I, 22, 22, 5, 2.4, 0.8, -0.6); }
  part(I, 'M32 30 C42 30 48 38 47 46 C46 52 40 54 32 53 C24 54 18 52 17 46 C16 38 22 30 32 30 Z', c, { sd: 1.8, hd: 1.2 });
  for (const [x, y, r] of [[16, 28, 5], [24, 19, 5.4], [40, 19, 5.4], [48, 28, 5]]) part(I, ellipse(x, y, r * 0.85, r), c, { sd: 1, hd: 0.8 });
  if (o.push) rings(I, 30, 36, 26, 2, '#ffffff', -0.9, 0.9, 2.4);
  if (o.arrow) { part(I, 'M44 60 C54 56 58 48 58 38 L62 40 L56 30 L50 38 L54 38 C54 46 50 52 42 56 Z', '#ffffff', { sd: 0.6, hd: 0.4, ol: I.ol * 0.8 }); }
};
SK.masks = (I, o) => {
  const mk = (x, y, r, col, sad) => {
    part(I, xf('M16 14 C22 10 42 10 48 14 C52 26 50 42 40 52 C36 56 28 56 24 52 C14 42 12 26 16 14 Z', { ox: 32, oy: 32, x: x - 32, y: y - 32, r, s: 0.62 }), col, { sd: 1.4, hd: 1 });
    tf(I, { ox: x, oy: y, r }, () => { fl(I, ellipse(x - 5, y - 4, 2.4, 1.6), OUT); fl(I, ellipse(x + 5, y - 4, 2.4, 1.6), OUT); ln(I, sad ? `M${x - 5} ${y + 7} C${x - 2} ${y + 4} ${x + 2} ${y + 4} ${x + 5} ${y + 7}` : `M${x - 5} ${y + 4} C${x - 2} ${y + 8} ${x + 2} ${y + 8} ${x + 5} ${y + 4}`, OUT, 1.4); });
  };
  mk(40, 28, 0.3, '#f4f1ea', true);
  mk(24, 34, -0.3, o.c || '#f7c96a', false);
};
SK.gravity = (I, o) => {
  const c = o.c || '#d8c8ff';
  for (const x of [18, 32, 46]) part(I, `M${x - 4} 8 H${x + 4} V${x === 32 ? 30 : 24} H${x + 9} L${x} ${x === 32 ? 44 : 38} L${x - 9} ${x === 32 ? 30 : 24} H${x - 4} Z`, c, { sd: 1, hd: 0.8 });
  part(I, 'M6 50 C18 46 46 46 58 50 L58 56 H6 Z', '#8a7a6a', { sd: 1, hd: 0.8 });
  ln(I, 'M20 48 L24 53 L22 56 M40 48 L37 52 L40 56 M32 47 L33 52', OUT, 1.2);
};
SK.antler = (I, o) => {
  const c = o.c || '#b8864a';
  for (const f of [1, -1]) {
    const t = (x) => 32 + (x - 32) * f;
    tube(I, `M${t(28)} 40 C${t(24)} 30 ${t(18)} 22 ${t(12)} 10`, c, 4.2);
    tube(I, `M${t(23)} 28 C${t(28)} 22 ${t(30)} 16 ${t(29)} 10`, c, 3.4);
    tube(I, `M${t(17)} 19 C${t(11)} 18 ${t(7)} 20 ${t(5)} 24`, c, 3);
  }
  if (o.hat) { part(I, 'M18 46 C18 36 24 30 32 30 C40 30 46 36 46 46 Z', '#e0485a', { sd: 1.6, hd: 1.2 }); part(I, ellipse(32, 46, 18, 5), '#e0485a', { sd: 1, hd: 0.8 }); tube(I, 'M26 38 L38 38 M32 32 V44', '#ffffff', 2.4, { flat: true }); }
  if (o.muscle) tf(I, { s: 0.55, y: 14 }, () => fistShape(I, '#b8864a'));
};
SK.leopard = (I, o) => {
  const c = o.c || '#e8a33c';
  part(I, union(ellipse(18, 18, 6, 7, -0.4), ellipse(46, 18, 6, 7, 0.4)), c, { sd: 1, hd: 0.8 });
  part(I, 'M32 16 C44 16 52 24 52 34 C52 46 42 54 32 54 C22 54 12 46 12 34 C12 24 20 16 32 16 Z', c, { sd: 2.4, hd: 1.6 });
  if (!I.small) for (const [x, y] of [[22, 24], [42, 24], [16, 36], [48, 36], [32, 20], [26, 46], [38, 46]]) fl(I, circle(x, y, 1.8), '#5a3a1a');
  part(I, 'M24 42 C26 38 38 38 40 42 C40 48 24 48 24 42 Z', '#fbeed6', { sd: 0.6, hd: 0.4 });
  fl(I, poly([[29, 40], [35, 40], [32, 43]]), '#3a2418');
  for (const x of [24, 40]) { fl(I, ellipse(x, 32, 3.2, 2.4, x < 32 ? 0.3 : -0.3), '#ffe066'); fl(I, ellipse(x, 32, 0.9, 2.1), OUT); }
};
SK.bird = (I, o) => {
  const cols = o.cols || ['#3ab8e0', '#7fe0f0', '#e8fbff'];
  if (o.fire) glow(I, ellipse(32, 38, 26, 14), cols[1], 0.22);
  part(I, birdP(32, 36, 1.05), cols[0], { sd: 2, hd: 1.4, hi: cols[2] });
  if (!I.small) clip(I, birdP(32, 36, 1.05), () => { for (const x of [12, 20, 44, 52]) ln(I, `M${x} 30 L${x + (x < 32 ? 4 : -4)} 40`, cols[1], 1.4, { a: 0.8 }); });
  part(I, 'M28 26 C28 20 36 20 36 26 C36 32 28 32 28 26 Z', cols[0], { sd: 0.8, hd: 0.6, hi: cols[2] });
  fl(I, poly([[35, 25], [40, 26.5], [35, 28]]), '#ffd23f');
  if (o.flameTail) for (const x of [26, 32, 38]) flame(I, x, 60, 0.18, [cols[0], cols[1], cols[2]]);
};
SK.dragon = (I, o) => {
  const c = o.c || '#3a7fd6';
  if (o.breath) { part(I, 'M4 36 C12 30 16 24 20 20 L24 38 C18 44 10 44 4 36 Z', '#f7931e', { sd: 1, hd: 0.8 }); fl(I, 'M8 36 C14 32 17 28 20 25 L22 36 C17 40 12 40 8 36 Z', '#ffe066'); }
  tf(I, { s: 0.9, x: o.breath ? 6 : 2, y: 2 }, () => dragonHead(I, c));
  if (o.bolt) bolt(I, { s: 0.4, ox: 32, oy: 32, x: -14, y: -14 });
};
SK.cog = (I, o) => {
  const c = o.c || '#e8766a';
  const g = new Path2D(); g.addPath(star(30, 36, 9, 19, 14, 0)); g.addPath(circle(30, 36, 6));
  part(I, g, c, { rule: 'evenodd', sd: 2, hd: 1.4 });
  for (const [x, y, r] of [[46, 16, 6], [52, 24, 4.5], [40, 10, 4], [54, 12, 3.4]]) part(I, circle(x, y, r), '#f8e4ea', { sd: 0.8, hd: 0.6 });
};
SK.spring = (I, o) => {
  const coil = 'M18 58 C46 57 46 52 18 51 C8 50 46 46 18 45 C8 44 46 40 18 39';
  ln(I, coil, OUT, 4.4); ln(I, coil, '#c9d1d8', 2.4);
  tf(I, { r: -0.2, s: 0.66, x: 4, y: -12 }, () => fistShape(I, o.c || '#3a1f24'));
};
SK.crosshair = (I, o) => {
  const c = o.c || '#ff5a4a';
  const r = new Path2D(); r.addPath(circle(32, 32, 20)); r.addPath(circle(32, 32, 16));
  part(I, r, c, { rule: 'evenodd', sd: 0.6, hd: 0.4 });
  for (const [x1, y1, x2, y2] of [[32, 6, 32, 22], [32, 42, 32, 58], [6, 32, 22, 32], [42, 32, 58, 32]]) tube(I, `M${x1} ${y1} L${x2} ${y2}`, c, 3, { flat: true });
  part(I, circle(32, 32, 3.4), c, { sd: 0.6, hd: 0.4 });
};
SK.pellet = (I, o) => {
  const c = o.c || '#c9d1d8';
  if (o.many) { for (const [x, y, s] of [[20, 44, 0.6], [42, 20, 0.7], [44, 44, 0.55], [22, 20, 0.5]]) { part(I, star(x, y, 5, 8 * s, 3.6 * s), o.cols ? o.cols[(x + y) % o.cols.length] : c, { sd: 0.6, hd: 0.4 }); } sparkle(I, 32, 32, 6, '#fff6b0'); return; }
  part(I, taper([[6, 54], [14, 46], [22, 38], [30, 30]], 1, 12), fade('#ffffff', 0.85), { flat: true, ol: 0 });
  if (o.star) part(I, star(38, 24, 5, 13, 6), c, { sd: 1.2, hd: 1 });
  else part(I, circle(38, 24, 10), c, { sd: 1.8, hd: 1.4, gloss: [34.5, 20.5, 2.4, 1.4, 0.8] });
};
SK.chili = (I) => {
  part(I, 'M20 16 C30 18 44 26 50 40 C54 50 50 58 44 54 C40 44 30 32 16 24 C12 22 14 15 20 16 Z', '#d9253a', { sd: 2, hd: 1.4, gloss: [26, 21, 3, 1.4, 0.6, 0.5] });
  part(I, 'M20 16 C16 12 14 10 12 6 L16 5 C18 9 21 12 24 15 Z', '#4f9a3a', { sd: 0.6, hd: 0.4 });
  part(I, 'M16 18 C14 14 18 12 22 14 C22 17 20 20 16 18 Z', '#4f9a3a', { sd: 0.6, hd: 0.4 });
  for (const [x, y] of [[44, 18], [52, 26]]) flame(I, x, y + 6, 0.18);
};
SK.sprout = (I) => {
  tube(I, 'M32 58 C32 46 30 36 32 26', '#4f9a3a', 3.4);
  part(I, 'M32 34 C24 26 12 26 6 32 C12 40 24 40 32 34 Z', '#5aa33f', { sd: 1.4, hd: 1 });
  part(I, 'M32 28 C38 18 50 16 58 20 C54 30 42 34 32 28 Z', '#6fb24a', { sd: 1.4, hd: 1 });
  part(I, 'M32 26 C28 18 30 10 36 6 C40 12 38 22 32 26 Z', '#4f9a3a', { sd: 1.2, hd: 0.8 });
  part(I, ellipse(32, 58, 12, 3.4), '#8a5a30', { sd: 0.6, hd: 0.4 });
};
SK.swan = (I, o) => {
  const c = o.c || '#fbf8f0';
  part(I, 'M14 52 C10 40 18 32 28 34 C24 28 22 18 28 12 C34 6 44 10 44 18 L48 20 L44 22 C42 26 36 26 34 22 C32 18 34 16 36 18 C38 14 34 12 32 14 C28 18 30 28 36 34 C44 40 46 50 40 56 C32 60 20 60 14 52 Z', c, { sd: 2, shT: 0.18, hd: 1.4 });
  fl(I, poly([[44, 18], [50, 20], [44, 22]]), '#f28c2a');
  fl(I, circle(39.5, 16.5, 1.3), OUT);
  if (o.spin) for (const r of [26, 20]) ln(I, arcPath(32, 36, r, 0.3, 2.6), '#ffffff', 2, { a: 0.7 });
  if (o.dash) speed(I, [[50, 34, 60, 34], [48, 44, 58, 44], [50, 52, 60, 54]], '#ffffff', 2);
};
SK.wink = (I, o) => {
  part(I, circle(26, 32, 17), o.c || '#f7d7a8', { sd: 2, hd: 1.4 });
  eyeShape(I, 21, 28, 5.4, '#ffffff', '#3a6ab8');
  ln(I, 'M27 29 C29 26 33 26 35 29', OUT, 1.8);
  ln(I, 'M20 38 C23 41 28 41 31 38', OUT, 1.6);
  part(I, heartP(50, 22, 7), '#e0487a', { sd: 1, hd: 0.8 });
  speed(I, [[42, 30, 36, 34], [44, 38, 40, 44]], '#ffffff', 1.8);
};
SK.crown = (I, o) => {
  if (o.bolts) for (const [x, y, r, s] of [[-15, -8, -0.45, 0.62], [16, -6, 0.5, 0.58]]) { part(I, xf(BOLT, { s, ox: 32, oy: 32, x, y, r }), '#1a0a12', { sd: 0, hd: 0, line: '#ff4a5a', ol: I.ol * 0.9 }); ln(I, xf(BOLT, { s, ox: 32, oy: 32, x, y, r }), '#ff4a5a', 0.8, { a: 0.9 }); }
  const c = 'M12 44 L9 20 L21 30 L27 13 L32 26 L37 13 L43 30 L55 20 L52 44 Z';
  part(I, c, o.c || '#f0bf45', { sd: 2, hd: 1.4 });
  part(I, rrect(11, 41, 42, 8, 2), dk(o.c || '#f0bf45', 0.08), { sd: 1.2, hd: 0.8 });
  for (const [x, cc] of [[22, '#d7263d'], [32, '#2f78d6'], [42, '#d7263d']]) gem(I, x, 45, 3, cc, { ol: I.ol * 0.6 });
};
SK.heal = (I, o) => {
  const c = o.c || '#5ed17a';
  glow(I, circle(32, 32, 22), c, 0.4);
  part(I, 'M26 10 H38 V26 H54 V38 H38 V54 H26 V38 H10 V26 H26 Z', c, { sd: 1.8, hd: 1.4, hi: '#ffffff' });
  if (o.flame) for (const x of [14, 50]) flame(I, x, 58, 0.3, o.flame);
};
SK.drill = (I, o) => {
  const c = o.c || '#c9d1d8';
  const d = 'M58 32 L14 18 C8 22 6 28 6 32 C6 36 8 42 14 46 Z';
  part(I, d, c, { sd: 2, hd: 1.4 });
  clip(I, d, () => { for (let x = 4; x < 50; x += 7) ln(I, `M${x} 16 C${x + 5} 26 ${x - 3} 38 ${x + 2} 48`, dk(c, 0.35), 1.6); });
  speed(I, [[4, 14, 12, 18], [4, 50, 12, 46]], '#ffffff', 2);
};
SK.axe = (I, o) => tf(I, { s: 0.86, r: 0.1 }, () => (o.big ? D.battleAxe(I, {}) : D.axe(I, {})));
SK.staff = (I, o) => { if (o.cloud) part(I, cloudP(40, 20, 0.62), '#eef3f7', { sd: 1.2, hd: 1 }); tf(I, { s: 0.86 }, () => D.climaTact(I, { orb: o.orb })); };
SK.oni = (I, o) => {
  if (o.swords) {
    for (const [r, x] of [[-1.35, -6], [-0.2, 0], [0.95, 6]]) tf(I, { r, s: 0.78, x, y: -3 }, () => D.katana(I, {}));
    tf(I, { s: 0.66, y: 9 }, () => SK.oni(I, { c: o.c }));
    return;
  }
  const c = o.c || '#c8372d';
  part(I, union('M16 22 L12 6 L24 16 Z', 'M48 22 L52 6 L40 16 Z'), '#f3e6c4', { sd: 0.8, hd: 0.6 });
  part(I, 'M32 12 C46 12 52 24 50 36 C48 48 40 56 32 56 C24 56 16 48 14 36 C12 24 18 12 32 12 Z', c, { sd: 2.4, hd: 1.6 });
  for (const f of [1, -1]) fl(I, xf('M20 28 L29 32 L20 34 Z', { sx: f, ox: 32 }), '#ffe066');
  part(I, 'M22 42 C26 48 38 48 42 42 L40 46 C36 50 28 50 24 46 Z', '#f7f4ec', { flat: true, ol: I.ol * 0.7 });
  for (const f of [1, -1]) fl(I, xf(poly([[24, 43], [27, 43], [25.5, 49]]), { sx: f, ox: 32 }), '#f7f4ec');
};
SK.net = (I, o) => {
  const c = o.c || '#e9dcc0';
  const d = []; for (let i = -2; i <= 2; i++) { d.push(`M${14 + (i + 2) * 9} 10 C${16 + (i + 2) * 8} 30 ${12 + (i + 2) * 10} 44 ${10 + (i + 2) * 11} 58`); d.push(`M8 ${16 + (i + 2) * 10} C24 ${14 + (i + 2) * 10} 40 ${18 + (i + 2) * 10} 56 ${14 + (i + 2) * 10}`); }
  ln(I, d.join(' '), OUT, 3); ln(I, d.join(' '), c, 1.4);
};
SK.knives = (I, o) => { for (const [x, y, r] of [[-12, -8, -0.1], [2, 2, 0], [-6, 14, 0.1]]) tf(I, { s: 0.55, x, y, r }, () => D.dagger(I, {})); speed(I, [[4, 20, 14, 20], [2, 36, 12, 36], [6, 50, 14, 50]], '#ffffff', 2); };
SK.bullets = (I, o) => {
  for (const [x, y] of [[40, 18], [50, 33], [38, 47]]) {
    part(I, taper([[x - 34, y], [x - 12, y]], 0.6, 7), fade('#ffffff', 0.8), { flat: true, ol: 0 });
    part(I, `M${x - 12} ${y - 4.5} H${x + 2} C${x + 8} ${y - 4.5} ${x + 11} ${y - 1.5} ${x + 12} ${y} C${x + 11} ${y + 1.5} ${x + 8} ${y + 4.5} ${x + 2} ${y + 4.5} H${x - 12} Z`, '#d6a23e', { sd: 1, hd: 0.8 });
    fl(I, rrect(x - 12, y - 4.5, 4, 9, 1), dk('#d6a23e', 0.3));
  }
};
SK.cannonball = (I, o) => {
  part(I, taper(bez([4, 56], [12, 50], [20, 44], [28, 38], 10), 2, 18), fade('#ffffff', 0.8), { flat: true, ol: 0 });
  part(I, circle(38, 28, 15), o.c || '#3a3540', { sd: 2.6, hd: 2, hi: '#8a86a0', gloss: [32, 22, 3.4, 2, 0.6] });
};
SK.chakram = (I, o) => {
  const r = new Path2D(); r.addPath(star(32, 32, 8, 22, 17, 0.2)); r.addPath(circle(32, 32, 11));
  part(I, r, o.c || '#dfe7ee', { rule: 'evenodd', sd: 1.6, hd: 1.2 });
  for (const rr of [26, 20]) ln(I, arcPath(32, 32, rr, 2.4, 3.6), '#ffffff', 2, { a: 0.7 });
};
SK.pendulum = (I) => {
  tube(I, 'M32 4 V36', '#e9dcc0', 1.6, { flat: true });
  part(I, circle(32, 44, 13), '#e0b24a', { sd: 1.6, hd: 1.2 });
  ln(I, spiral(32, 44, 10, 2, 0), '#6b3f8a', 1.6);
  for (const r of [22, 17]) ln(I, arcPath(32, 4, r * 2, 1.2, 1.94), '#ffffff', 1.8, { a: 0.6 });
};
SK.summon = (I, o) => { for (const [x, y, s] of [[20, 40, 0.5], [44, 40, 0.5], [32, 30, 0.6]]) tf(I, { s, x: x - 32, y: y - 32 + 4 }, () => SK.figure(I, { c: o.c || '#5a5f6a' })); };
SK.shadowFigure = (I, o) => SK.figure(I, { c: '#1f1a26', aura: '#8a6ad6', eyes: '#ff5a5a' });
SK.steal = (I, o) => {
  tf(I, { s: 0.72, x: -11, y: 9 }, () => SK.figure(I, { c: '#1f1a26', eyes: '#ff5a5a' }));
  tf(I, { r: -0.75, ox: 38, oy: 30, x: 2, y: -2 }, () => {
    for (const f of [1, -1]) {
      part(I, xf('M36 29 L62 25.5 C64 26.5 63.5 29.5 61 30.5 L36 32 Z', { sy: f, oy: 30.5 }), '#e4ecf2', { sd: 0.8, hd: 0.6 });
      const r = new Path2D(); r.addPath(ellipse(25, 30.5 + 6 * f, 8, 5.4)); r.addPath(ellipse(25, 30.5 + 6 * f, 4.6, 2.6));
      part(I, r, '#d23b32', { rule: 'evenodd', sd: 1, hd: 0.8 });
      tube(I, `M31 ${30.5 + 3.4 * f} L37 ${30.5 + 1 * f}`, '#d23b32', 3.2);
    }
    part(I, circle(37, 30.5, 2.2), '#8a949b', { sd: 0.4, hd: 0.3 });
  });
};
SK.dryCracks = (I, o) => {
  const c = o.c || '#c9a060';
  part(I, 'M4 34 C18 30 46 30 60 34 L60 58 H4 Z', c, { sd: 1.6, hd: 1.2 });
  clip(I, 'M4 34 C18 30 46 30 60 34 L60 58 H4 Z', () => ln(I, 'M10 36 L16 44 L12 52 M16 44 L26 46 L30 54 M26 46 L34 38 L44 42 L48 52 M44 42 L54 38', dk(c, 0.5), 1.8));
  tf(I, { s: 0.52, x: 0, y: -14, r: Math.PI }, () => palmShape(I, '#d9b26f'));
};
SK.spikes = (I, o) => {
  const c = o.c || '#d9b26f';
  for (const [x, h, w] of [[16, 30, 7], [30, 42, 9], [46, 34, 8]]) part(I, poly([[x - w, 58], [x, 58 - h], [x + w, 58]]), c, { sd: 1.4, hd: 1 });
  part(I, 'M4 56 C16 52 48 52 60 56 V60 H4 Z', dk(c, 0.1), { sd: 0.6, hd: 0.4 });
};
SK.smoke = (I, o) => {
  const c = o.c || '#eef2f4';
  part(I, union(circle(20, 38, 11), circle(34, 30, 13), circle(46, 40, 10), circle(30, 44, 11), circle(14, 24, 6)), c, { sd: 2.2, hd: 1.4 });
  if (o.fist) tf(I, { r: -0.3, s: 0.56, x: 10, y: -8 }, () => fistShape(I, c));
  if (o.snake) SK.snake(I, { c });
};
SK.rocket = (I, o) => {
  const c = o.c || SKIN;
  tube(I, 'M4 60 C14 40 26 30 44 22', c, 6); tube(I, 'M60 60 C50 40 38 30 44 22', c, 6);
  tf(I, { s: 0.36, x: 12, y: -14, r: -0.3 }, () => palmShape(I, c));
  speed(I, [[20, 56, 26, 46], [30, 58, 34, 50], [40, 58, 42, 50]], '#ffffff', 2);
};
SK.drums = (I, o) => {
  ln(I, circle(32, 32, 19), OUT, 4.4); ln(I, circle(32, 32, 19), '#e0b24a', 2.4);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - Math.PI / 2, x = 32 + Math.cos(a) * 19, y = 32 + Math.sin(a) * 19; part(I, circle(x, y, 5.2), '#c8372d', { sd: 0.8, hd: 0.6 }); if (!I.small) ln(I, spiral(x, y, 3.2, 1, a), '#f6d24a', 1); }
  bolt(I, { s: 0.55 });
};
SK.impact = (I, o) => { burst(I, 32, 32, 25, 13, o.c || '#ffd23f', 12); if (o.skull) skull(I, 32, 30, 9, '#c9d1d8', false); };

/** Style colours (badge) and default motif per fighting style. */
const STYLE_SK = {
  brawler: ['#a8582e', ['fist']], ittoryu: ['#3a6a9a', ['swords', { n: 1 }]], nitoryu: ['#2e5a86', ['swords', { n: 2 }]], santoryu: ['#2f7a4a', ['swords', { n: 3 }]],
  black_leg: ['#5a6f96', ['kick']], fishman_karate: ['#1f78a0', ['fist', { fx: 'water' }]], rokushiki: ['#4a4f5c', ['finger', { burst: '#ffd23f' }]],
  sniper: ['#7a6a2a', ['pellet', { star: true, c: '#c9d1d8' }]], okama_kenpo: ['#c04a8a', ['swan']], electro: ['#3a5a9a', ['fist', { fx: 'bolt' }]],
  hasshoken: ['#8a4a2a', ['palm', { rings: true }]], weather_science: ['#2f62a8', ['staff', { cloud: true }]], elbaf: ['#7a5230', ['axe', { big: true }]],
  ryusoken: ['#2a7a6a', ['claw', { hand: '#8fd0b0' }]],
};
const FRUIT_BADGE = {
  gomu: '#b8433f', gura: '#3d7f93', ope: '#2f6fa0', bara: '#c0563a', bomu: '#c0762a', hana: '#b9507e', ito: '#b04a78', mochi: '#9a7a4a', horo: '#7a4f96',
  kage: '#5a6f86', doku: '#6d2a86', noro: '#2f8a92', bari: '#3f7fae', suke: '#6d7f8c', sube: '#b0607a', doru: '#a08050', supa: '#5f6f7c', nikyu: '#6f6a86',
  mane: '#b03f6e', zushi: '#5b4a9a', hito: '#b86a82', neko_leopard: '#b8782a', tori_phoenix: '#223a66', uo_seiryu: '#1f2c52', mera: '#c24a26', hie: '#3a86b8',
  goro: '#3c3f86', suna: '#a8843e', moku: '#6f7f8a', pika: '#b8901e', magu: '#8a2a18', yami: '#4a2a86',
};
const HAKI_BADGE = { armament: '#5a3f86', observation: '#1f7a86', conqueror: '#8a1c2a' };
const ELEM_BADGE = { fire: '#c24a26', ice: '#3a86b8', snow: '#3a86b8', lightning: '#3c3f86', water: '#1f78a0', poison: '#6d2a86', gas: '#6d2a86', sand: '#a8843e', smoke: '#6f7f8a', light: '#b8901e', magma: '#8a2a18', dark: '#4a2a86', explosion: '#c0762a', quake: '#3d7f93', haki: '#8a1c2a' };
const ANIM_BADGE = { slash: '#4a5a6a', punch: '#8a4a2a', kick: '#5a6f96', shoot: '#6a5a3a', thrust: '#5a5a66', heavy: '#7a3a2a', grab: '#6a4a5a', cast: '#4a4a7a', block: '#4a6a7a' };
const FIRE = ['#e8452c', '#f7931e', '#ffe066'], BLUEFIRE = ['#3ab8ec', '#8fe8ff', '#e8fcff'], WHITE = '#f4f7fa', BLACKFIST = '#2a2530';

/** Curated motif per technique id: [motif, opts]. */
const SKILL_MAP = {
  // Gomu
  gomu_pistol: ['stretch', { burst: '#ffd23f' }], gomu_gatling: ['multi'], gomu_rocket: ['rocket'], gomu_bazooka: ['palms', { burst: '#ffd23f' }],
  gomu_gear2: ['cog'], gomu_gear3: ['fist', { s: 1.08, x: 0, y: 2, burst: '#ffd23f', lines: false }], gomu_gear4: ['spring'], gomu_gear5: ['sun', { c: '#fbf8f0', ray: '#ffffff', face: true }],
  gomu_whip: ['kick', { r: 0.4, x: 2, y: -2 }], gomu_gear3_on: ['fist', { s: 1.08, x: 0, y: 2, lines: false }], gomu_awaken: ['sun', { c: '#fbf8f0', ray: '#ffffff', face: true }],
  // (the Gears: Jet, Gigant, Boundman — and Gear Fifth's Dawn)
  gomu_jet_pistol: ['stretch', { burst: '#ff8a80' }], gomu_jet_gatling: ['multi', { burst: '#ff8a80' }], gomu_jet_rocket: ['rocket'], gomu_jet_bazooka: ['palms', { burst: '#ff8a80' }], gomu_jet_spear: ['kick', { burst: '#ff8a80' }], gomu_jet_whip: ['kick', { r: 0.4, x: 2, y: -2, burst: '#ff8a80' }],
  gomu_gigant_pistol: ['fist', { s: 1.12, x: 0, y: 2, burst: '#ffd23f', lines: false }], gomu_elephant_gatling: ['multi', { burst: '#ffd23f' }], gomu_gigant_axe: ['kick', { r: 1.2, x: 2, y: 2, burst: '#ffd23f' }], gomu_gigant_bazooka: ['palms', { burst: '#ffd23f' }], gomu_gigant_balloon: ['impact', { c: '#f4c08a' }], gomu_gigant_stamp: ['kick', { burst: '#ffd23f' }],
  gomu_kong_gun: ['fist', { c: BLACKFIST, burst: '#e53935', line: '#ff8a80' }], gomu_kong_organ: ['multi', { burst: '#e53935' }], gomu_rhino_schneider: ['kick', { c: BLACKFIST, burst: '#e53935' }], gomu_culverin: ['stretch', { burst: '#e53935' }], gomu_king_kong_gun: ['fist', { c: BLACKFIST, s: 1.12, x: 0, y: 2, burst: '#e53935', lines: false }], gomu_leo_bazooka: ['palms', { burst: '#e53935' }],
  gomu_dawn_pistol: ['stretch', { burst: '#ffffff' }], gomu_dawn_gatling: ['multi', { burst: '#ffffff' }], gomu_dawn_rocket: ['rocket'], gomu_kaminari: ['bolt', { two: true }], gomu_bajrang_gun: ['sun', { c: '#fbf8f0', ray: '#ffffff' }], gomu_dawn_whip: ['kick', { r: 0.4, x: 2, y: -2, burst: '#ffffff' }],
  ope_puncture_wille: ['beam', { c: '#81d4fa' }], mera_jujika: ['flame', { pillar: true }], mera_shiranui: ['fireballs'], hie_partisan: ['ice', { flake: true }], gura_kabutowari: ['fist', { fx: 'cracks' }], ito_nami_shiraito: ['strings', { five: true }],
  // Gura
  gura_punch: ['fist', { fx: 'cracks' }], gura_kaishin: ['cracks'], gura_wave: ['wave', { c: '#9fd9ef', fx: 'cracks' }], gura_tsunami: ['wave', { c: '#4fb3e8', fx: 'cracks' }],
  // Ope
  ope_room: ['room'], ope_shambles: ['swap'], ope_amputate: ['swords', { n: 1, arcCol: '#bfe4ff' }], ope_mes: ['heartCube'], ope_counter: ['palm', { burst: '#ffe14a', rings: true, ring: '#ffe14a' }], ope_gamma: ['beam', { c: '#b8f36b' }],
  // Bara / Bomu / Hana / Ito
  bara_cannon: ['glove'], bara_festival: ['glove', { multi: true }], bara_escape: ['glove', { multi: true }],
  bomu_kick: ['kick', { burst: '#ffd23f' }], bomu_nose: ['bomb'], bomu_breeze: ['explosion', { smoke: true }],
  hana_clutch: ['flower', { cross: true }], hana_mil: ['flower', { arms: true }], hana_gigante: ['palm', { s: 0.98 }],
  ito_overheat: ['strings', { c: '#ff8a6a', hot: true }], ito_parasite: ['strings', { hand: true }], ito_fivecolor: ['strings', { five: true }], ito_birdcage: ['cage'],
  // Mochi / Horo / Kage / Doku / Noro / Bari
  mochi_tsuki: ['fist', { c: '#f7f0e0', fx: 'mochi' }], mochi_zangiri: ['mochi', { trident: true }], mochi_chikara: ['fist', { c: '#f7f0e0', s: 1.05, x: 0, y: 3, burst: '#fff3c0', lines: false, fx: 'mochi' }],
  horo_negative: ['ghost'], horo_mini: ['ghost', { many: true }],
  kage_brickbat: ['bats'], kage_steal: ['steal'], kage_doppelman: ['shadowFigure'],
  doku_fist: ['fist', { c: '#9c5ad0', fx: 'poison' }], doku_hydra: ['snake'], doku_venom: ['oni', { c: '#8e3ab8' }],
  noro_beam: ['beam', { c: '#9ff0ff' }], noro_mirror: ['mirror', { c: '#9ff0ff' }],
  bari_barrier: ['hex'], bari_crash: ['hex', { burst: '#ffd23f' }],
  // Suke / Sube / Doru / Supa / Nikyu / Mane / Zushi
  suke_vanish: ['eye', { dashed: true, ripples: false, iris: '#6d7f8c' }], sube_slide: ['sparkles'], sube_mace: ['mace'],
  doru_arrow: ['candle', { arrows: true }], doru_lock: ['candle', { lock: true }], doru_armor: ['shield', { c: '#fbf3dc' }],
  supa_sparkling: ['bladeFlower'], supa_spider: ['shield', { c: '#c9d1d8' }],
  nikyu_paw: ['paw'], nikyu_repel: ['paw', { push: true }], nikyu_travel: ['paw', { arrow: true }], nikyu_ursus: ['paw', { bubble: true }],
  mane_disguise: ['masks'], mane_memoir: ['masks', { c: '#f4a3bf' }],
  zushi_press: ['gravity'], zushi_blade: ['claw', { c: '#d8c8ff' }], zushi_meteor: ['meteor'],
  // Zoans
  hito_heavy: ['antler', { muscle: true }], hito_horn: ['antler', { hat: true }], hito_monster: ['antler', { c: '#8a5a30' }],
  neko_hybrid: ['leopard'], neko_claw: ['claw', { c: '#ffe8c0' }], neko_pounce: ['dash', { c: '#ffe8c0', c2: '#e8a33c' }],
  phoenix_flame: ['heal', { c: '#4dd0e1', flame: BLUEFIRE }], phoenix_fly: ['bird', { cols: BLUEFIRE, fire: true }], phoenix_brand: ['kick', { fx: 'fire', flame: BLUEFIRE, c: '#e8d9a8', shoe: '#6b4a2a' }], phoenix_rebirth: ['bird', { cols: BLUEFIRE, fire: true, flameTail: true }],
  seiryu_bolo: ['dragon', { breath: true }], seiryu_kaifu: ['airblade', { n: 2 }], seiryu_raimei: ['bolt', { two: true }], seiryu_form: ['dragon'],
  // Logias
  mera_hiken: ['fist', { c: '#f7931e', fx: 'fire', line: '#ffe066' }], mera_hidaruma: ['fireballs'], mera_enkai: ['flame', { pillar: true }], mera_entei: ['sun', { c: '#f7931e', ray: '#e8452c' }],
  hie_saber: ['swords', { n: 1, pal: [{ blade: '#bfefff', edge: '#ffffff', wrap: '#6fb8d8', tsuba: '#bfefff', habaki: '#e8fbff', diamond: '#e8fbff' }], arcCol: '#bfefff' }],
  hie_pheasant: ['bird', { cols: ['#8fd8f8', '#c8f0ff', '#ffffff'] }], hie_ageand: ['ice', { flake: true }], hie_time: ['iceCube'],
  goro_vari: ['bolt'], goro_sango: ['bolt', { two: true }], goro_elthor: ['cloud', { bolt: true, c: '#b8c0d8' }], goro_amaru: ['drums'], goro_raigo: ['cloud', { bolt: true, c: '#5a5f7a' }],
  suna_barjan: ['airblade', { c: '#e8c77a' }], suna_sables: ['tornado', { c: '#e8c77a' }], suna_spada: ['spikes'], suna_dry: ['dryCracks'],
  moku_blow: ['smoke', { fist: true }], moku_snake: ['smoke', { snake: true }], moku_out: ['smoke'], moku_launcher: ['dash', { c: '#eef2f4', c2: '#dfe6ea' }],
  pika_yasakani: ['lightOrbs'], pika_yata: ['mirror', { light: true }], pika_murakumo: ['swords', { n: 1, pal: [{ blade: '#fff6b0', edge: '#ffffff', wrap: '#e0b24a', tsuba: '#fff6b0', habaki: '#fffbe0', diamond: '#fffbe0' }], arcCol: '#fff6b0' }], pika_amaterasu: ['beam'],
  magu_daifunka: ['magma'], magu_meigo: ['magma'], magu_ryusei: ['meteor', { c: '#5a2a1e', two: true }],
  yami_kurouzu: ['vortex', { hand: true }], yami_blackhole: ['vortex', { ring: true }], yami_nullify: ['claw', { c: '#c9a0ff', hand: '#2a1f33' }], yami_liberation: ['explosion', { c: '#6a3ab8', c2: '#1a1024' }],
  // (the newer fruit techniques)
  gomu_stamp: ['kick', { burst: '#ffd23f' }], gomu_spear: ['kick', { r: 0.2, burst: '#ffd23f' }], gomu_bell: ['impact', { c: '#f4c08a' }], gomu_mogura_pistol: ['fist', { fx: 'cracks', burst: '#ffffff' }],
  gura_bubble: ['cracks'], gura_tilt: ['wave', { c: '#9fd9ef', fx: 'cracks' }],
  bara_knives: ['knives'], bara_senbei: ['glove', { multi: true }], bara_muggy: ['bomb'],
  bomu_fist: ['fist', { fx: 'cracks', burst: '#ff9100' }], bomu_stomp: ['explosion', { smoke: true }],
  hana_spank: ['flower', { arms: true }], hana_strangle: ['flower', { cross: true }], hana_ojos: ['eye', { iris: '#f48fb1' }], hana_cuerpo: ['flower'], hana_demonio: ['oni', { c: '#ad1457' }],
  ito_tamaito: ['strings', { hand: true }], ito_fulbright: ['strings', { five: true }],
  mochi_buto: ['mochi', { trident: true }], mochi_kaku: ['fist', { c: '#f7f0e0', fx: 'mochi' }], mochi_shirotsuki: ['mochi'],
  horo_ghostrap: ['ghost', { many: true }], horo_spirit: ['ghost'],
  kage_blackbox: ['vortex', { ring: true }], kage_kakumei: ['shadowFigure'], kage_asgard: ['oni', { c: '#2a1838' }],
  doku_fugu: ['skull', { aura: '#b35ad6' }], doku_gumo: ['smoke', { c: '#b35ad6' }], doku_chloro: ['skull', { aura: '#b35ad6' }], doku_venom_demon: ['oni', { c: '#8e3ab8' }],
  noro_reflect: ['mirror', { c: '#9ff0ff' }], noro_barrage: ['multi', { burst: '#9ff0ff' }],
  bari_pistol: ['hex', { burst: '#ffd23f' }], bari_bulldog: ['hex'],
  suke_strike: ['fist', { c: '#d8dee2' }], suke_phantom: ['dash', { c: '#eef2f4', c2: '#d8dee2' }],
  sube_skin: ['sparkles'], sube_spin: ['tornado', { c: '#f8bbd0' }],
  doru_ken: ['candle', { arrows: true }], doru_mori: ['drill', { c: '#fbf3dc' }], doru_wall: ['shield', { c: '#fbf3dc' }], doru_service: ['candle'],
  supa_claw: ['claw', { c: '#c9d1d8' }], supa_atomic: ['bladeFlower'], supa_spiral: ['drill', { c: '#c9d1d8' }],
  nikyu_tsuppari: ['paw', { push: true }], nikyu_hop: ['paw', { arrow: true }],
  mane_montage: ['masks', { c: '#f4a3bf' }],
  zushi_pull: ['gravity'], zushi_lift: ['meteor', { c: '#6d4c41' }],
  hito_arm: ['antler', { muscle: true }], hito_walk: ['antler'], hito_jump: ['antler', { hat: true }], hito_brain: ['eye', { iris: '#8a5a30' }],
  neko_shigan: ['claw', { c: '#ffe8c0' }], neko_rokuogan: ['palms', { burst: '#ffffff' }],
  phoenix_pyreapple: ['kick', { fx: 'fire', flame: BLUEFIRE, c: '#e8d9a8', shoe: '#6b4a2a' }], phoenix_talon: ['claw', { c: '#4dd0e1' }],
  seiryu_kamaitachi: ['airblade', { n: 2 }], seiryu_tatsumaki: ['tornado', { c: '#e3f2fd' }], seiryu_ragnaraku: ['bolt', { two: true }],
  mera_kagero: ['flame'], mera_kyokaen: ['flame', { pillar: true }],
  hie_icetime: ['iceCube'],
  goro_kari: ['cloud', { bolt: true, c: '#b8c0d8' }], goro_raiju: ['bolt', { two: true }], goro_jamboule: ['lightOrbs'],
  suna_girasole: ['tornado', { c: '#e8c77a' }], suna_pesado: ['airblade', { c: '#e8c77a' }],
  moku_vine: ['smoke', { snake: true }], pika_flash: ['sun', { c: '#fff6b0', ray: '#ffe066' }], magu_bakuretsu: ['magma'],
  yami_abyss: ['vortex', { ring: true }],
  // Styles
  brawl_heavy: ['fist', { burst: '#ffd23f', s: 0.95 }], brawl_tackle: ['dash', { c: '#ffe8c0', c2: '#f2c596' }], brawl_knee: ['kick', { c: '#6b4a32', shoe: '#3a2a1c' }], brawl_headbutt: ['impact', { skull: true }],
  itto_heavy: ['slash', { n: 1 }], itto_iai: ['swords', { n: 1, arc: false }], itto_pound: ['airblade'], itto_whirl: ['tornado', { sword: true }],
  nito_heavy: ['slash', { n: 2 }], nito_taka: ['wave', { c: '#dff4ff' }], nito_nigiri: ['slash', { n: 2 }],
  santo_heavy: ['slash', { n: 3 }], santo_onigiri: ['slash', { n: 3 }], santo_108: ['bird', { cols: ['#bfe4ff', '#e8f6ff', '#ffffff'] }], santo_sanzen: ['bladeFlower', { c: '#eaf2f7' }], santo_asura: ['oni', { swords: true, c: '#5a2a3a' }],
  bleg_heavy: ['kick', { burst: '#ffd23f' }], bleg_party: ['kick', { r: 0.4, x: 2, y: -2 }], bleg_antimanner: ['kick', { r: -0.5, x: 0, y: 4 }], bleg_concasse: ['kick', { r: 1.2, x: 2, y: 2, burst: '#ffd23f' }],
  bleg_diable: ['kick', { fx: 'fire' }], bleg_skywalk: ['airstep'],
  fmk_heavy: ['fist', { fx: 'water', burst: '#7fd3f7' }], fmk_uchimizu: ['drops'], fmk_arabesque: ['palm', { rings: true, ring: '#9fe0ff' }], fmk_5000: ['fist', { burst: '#9fe0ff', fx: 'water', s: 1 }], fmk_vagabond: ['drill', { c: '#7fd3f7' }],
  roku_3: ['kick', { c: '#3a3540' }], roku_soru: ['dash'], roku_geppo: ['airstep', { c: '#3a3540', moon: true }], roku_tekkai: ['shield'], roku_rankyaku: ['airblade'], roku_kamie: ['paper'], roku_rokuogan: ['palms', { burst: '#ffffff' }],
  snipe_heavy: ['crosshair'], snipe_explode: ['bomb'], snipe_tabasco: ['chili'], snipe_firebird: ['bird', { cols: FIRE, fire: true }], snipe_popgreen: ['sprout'], snipe_kabuto: ['pellet', { many: true, cols: ['#ffd23f', '#ff7a5a', '#8fd8ff'] }],
  okama_pirouette: ['swan', { spin: true }], okama_swan_dash: ['swan', { dash: true }], okama_hell_wink: ['wink'], okama_heavy: ['kick', { c: '#f4a3bf', shoe: '#c04a8a' }],
  elec_heavy: ['claw', { c: '#fff36b' }], elec_discharge: ['bolt', { two: true }], elec_garchu: ['bolt', { s: 0.8 }], elec_sulong: ['moon', { c: '#fff6d0', bolt: true, full: true }],
  hassho_heavy: ['palm', { rings: true, burst: '#ffd23f' }], hassho_bushin: ['rings'], hassho_drill: ['drill'],
  clima_heavy: ['fireballs'], clima_thunderbolt: ['cloud', { bolt: true }], clima_cyclone: ['tornado'], clima_mirage: ['sun', { c: '#ffe7a0', ray: '#ffd23f' }], clima_zeus: ['cloud', { bolt: true, c: '#b8c0d8' }],
  elbaf_heavy: ['axe', { big: true }], elbaf_hakoku: ['swords', { n: 1, arcCol: '#ffe7a0' }],
  ryu_heavy: ['dragon'], ryu_claw: ['claw', { hand: '#8fd0b0' }], ryu_hiken: ['fist', { c: '#f7931e', fx: 'fire', line: '#ffe066' }],
  // Haki (and the HUD toggles)
  haki_emission: ['fist', { c: BLACKFIST, burst: '#b58ce0', line: '#d8c8ff' }], haki_ryuo: ['fist', { c: BLACKFIST, fx: 'cracks', line: '#d8c8ff' }],
  haki_futuresight: ['eye', { iris: '#e0303a' }], haki_conqueror: ['crown', { bolts: true }], haki_infusion: ['fist', { c: BLACKFIST, fx: 'bolt', line: '#ff8a9a' }],
  toggle_armament: ['fist', { c: BLACKFIST, lines: false, s: 1, x: 0, y: 2, aura: true }], toggle_observation: ['eye', { iris: '#e0303a' }],
};
/** Keyword rules on the technique name (NPC moves, future techniques). */
const SKILL_RULES = [
  [/conqueror|haoshoku/, 'crown', { bolts: true }], [/future sight|observation|kenbunshoku/, 'eye', {}], [/armament|busoshoku|hardened|ryuo/, 'fist', { c: BLACKFIST, line: '#d8c8ff' }],
  [/meteor|noah|ryusei/, 'meteor', {}], [/black hole|vortex|kurouzu/, 'vortex', { ring: true }], [/birdcage|cage|fulbright/, 'cage', {}],
  [/thread|string|tamaito|parasite|voodoo|flail/, 'strings', {}], [/\bnet\b/, 'net', {}], [/chakram|ring blade/, 'chakram', {}], [/hypno|jango/, 'pendulum', {}],
  [/soldiers|homies|zombie|summon|call the|gifters/, 'summon', {}], [/shadow|doppel|ikasumi|camouflage/, 'shadowFigure', {}],
  [/ghost|hollow/, 'ghost', { many: true }], [/\bbats?\b/, 'bats', {}], [/snake|serpent|orochi|hydra|coil/, 'snake', {}], [/dragon|ryu\b|seiryu|kaido/, 'dragon', {}],
  [/phoenix|bird|feather|wing|pheasant|ikaros/, 'bird', {}], [/leopard|jaguar|lion|tiger|wolf|fang|beast/, 'claw', {}], [/claw|scratch/, 'claw', {}],
  [/paw|pad ho/, 'paw', {}], [/thunder|lightning|raigo|raitei|volt|dengeki|thor|henry|electr/, 'bolt', {}], [/cloud/, 'cloud', {}],
  [/tornado|cyclone|tatsumaki|whirlwind|storm|gale/, 'tornado', {}], [/fire|flame|blaze|burn|hi-?daruma|hiken|kaen|karyu|heat|tempura|shishi no hi/, 'flame', {}],
  [/ice|frost|freez|blizzard|fubuki|yuki|snow|niflheim|kamakura|hyoga/, 'ice', {}], [/magma|lava/, 'magma', {}], [/laser|beam|maser|light/, 'beam', {}],
  [/water|wave|tide|umi|splash|juice/, 'wave', {}], [/poison|venom|toxic|gas|plague|ooze/, 'skull', { aura: '#b35ad6' }], [/bomb|explo|grenade|mine|sneeze|jirai/, 'bomb', {}],
  [/cannon ?ball|cannons?|bazooka|bero/, 'cannonball', {}], [/gun|rifle|pistol|volley|shot|bullet|round|machine/, 'bullets', {}], [/arrow|bow\b|yabusame/, 'airblade', { c: '#f3e6c4' }],
  [/knife|knives|kunai|dagger|needle/, 'knives', {}], [/spear|lance|javelin|trident|halberd|glaive|jitte|bisento/, 'drill', {}], [/axe/, 'axe', {}],
  [/mace|club|hammer|bat\b|mallet|pan\b|bamboo/, 'mace', {}], [/drill|screw|spin/, 'drill', {}], [/sword|blade|slash|cut|cleave|giri|kiri|saw|scalpel|punisher|pretzel/, 'slash', {}],
  [/shield|guard|steel|tekkai|armou?r|cape/, 'shield', {}], [/quake|stomp|press|crush|earth|ground|mountain/, 'gravity', {}], [/sand|desert|dune/, 'airblade', { c: '#e8c77a' }],
  [/kick|heel|foot|leg|stamp|knee/, 'kick', {}], [/palm|hasshoken|shockwave|buddha/, 'palm', { rings: true }], [/punch|fist|jab|puncher|lariat|knuckle|elbow/, 'fist', {}],
  [/charge|dash|rush|tackle|dive|lunge|pounce|hopper|spurt/, 'dash', {}], [/bite|jaw|munch|tooth|teeth|shark/, 'claw', { c: '#ffffff' }],
  [/heal|life return|mend|cure/, 'heal', {}], [/haki/, 'crown', { bolts: true }],
];
/** Emoji hint on the ability (data-side) → motif. Only used as a hint, never drawn. */
const EMOJI_SK = {
  '🔥': ['flame'], '⚡': ['bolt'], '💥': ['impact'], '🚀': ['dash'], '☀': ['sun'], '🌋': ['flame', { pillar: true }], '🗡': ['swords', { n: 1 }], '💣': ['bomb'], '🌬': ['airblade'],
  '✋': ['palm'], '🌑': ['vortex'], '👹': ['oni'], '🛡': ['shield'], '🐉': ['dragon'], '🌩': ['cloud', { bolt: true }], '🌪': ['tornado'], '🌀': ['airblade'], '👊': ['fist'],
  '🎈': ['glove'], '🌊': ['wave'], '💙': ['heal', { c: '#4dd0e1' }], '🎭': ['masks'], '💪': ['fist'], '🐍': ['snake'], '🪞': ['mirror'], '🧱': ['hex'], '🔨': ['mace'],
  '🐾': ['paw'], '☄': ['meteor'], '🐦': ['bird'], '👺': ['oni'], '🌙': ['moon'], '☁': ['cloud'], '🌫': ['smoke'], '🦵': ['kick'], '👑': ['crown', { bolts: true }],
  '🔫': ['bullets'], '✊': ['fist'], '🌐': ['cracks'], '🔵': ['room'], '❄': ['ice', { flake: true }], '🧊': ['iceCube'], '✨': ['lightOrbs'], '⚫': ['vortex', { ring: true }],
  '💧': ['drops'], '💨': ['dash'], '📄': ['paper'], '🌶': ['chili'], '🌿': ['sprout'], '🦩': ['swan', { dash: true }], '🩰': ['swan', { spin: true }], '😉': ['wink'],
  '🌕': ['moon', { full: true }], '🦏': ['drill'], '🔮': ['eye'], '🐯': ['claw'], '🐆': ['leopard'], '🦌': ['antler'], '🕊': ['bird'], '♾': ['heal'], '🐲': ['dragon'],
  '🕸': ['cage'], '🧵': ['strings'], '👻': ['ghost'], '🦇': ['bats'], '☠': ['skull'], '🐌': ['beam'], '👁': ['eye'], '🕯': ['candle'], '🔒': ['candle', { lock: true }],
  '🗿': ['shield'], '✴': ['bladeFlower'], '🕷': ['shield'], '✈': ['paw', { arrow: true }], '💭': ['masks'], '⬇': ['gravity'], '🍡': ['mochi'], '🔱': ['mochi', { trident: true }],
  '🌸': ['flower'], '🌺': ['flower', { arms: true }], '🖐': ['strings', { five: true }], '🤡': ['glove'], '🎪': ['glove', { multi: true }], '👃': ['bomb'], '♨': ['cog'], '🦴': ['fist'],
  '🔀': ['swap'], '☢': ['beam'], '🏜': ['dryCracks'], '⚔': ['swords', { n: 2 }], '🕳': ['vortex'], '🐂': ['dash'], '🦁': ['swords', { n: 1, arc: false }], '🍙': ['slash', { n: 2 }],
  '🌍': ['bladeFlower'], '🍽': ['kick'], '🎆': ['fireballs'], '🎇': ['pellet', { many: true }], '💢': ['fist', { fx: 'cracks' }], '🦶': ['kick'], '💫': ['ghost', { many: true }],
};
const ANIM_SK = { punch: ['fist'], kick: ['kick'], slash: ['slash'], thrust: ['dash'], heavy: ['impact'], shoot: ['bullets'], grab: ['claw'], cast: ['lightOrbs'], block: ['shield'] };
const ELEM_SK = { fire: ['flame'], ice: ['ice'], snow: ['ice', { flake: true }], lightning: ['bolt'], water: ['wave'], poison: ['skull', { aura: '#b35ad6' }], gas: ['skull', { aura: '#b35ad6' }], sand: ['tornado', { c: '#e8c77a' }], smoke: ['smoke'], light: ['beam'], magma: ['magma'], dark: ['vortex'], explosion: ['explosion'], quake: ['cracks'] };

function skillElement(def) {
  let el = def?.element || null;
  if (!el && def?.steps) { try { JSON.stringify(def.steps, (k, v) => { if (!el && k === 'element' && typeof v === 'string') el = v; return v; }); } catch (e) { /* ignore */ } }
  return el;
}
function resolveSkill(def) {
  const id = def?.id || '', src = def?.source || '', [kind, key = ''] = src.split(':');
  const name = (def?.name || id).toLowerCase(), el = skillElement(def);
  let badge = ELEM_BADGE[el] || ANIM_BADGE[def?.anim] || '#4a4a6a';
  if (kind === 'style' && STYLE_SK[key]) badge = STYLE_SK[key][0];
  if (kind === 'fruit') badge = FRUIT_BADGE[key] || FRUITS[key]?.color || badge;
  const haki = def?.hakiType || (kind === 'haki' ? key : null);
  if (haki && HAKI_BADGE[haki]) badge = HAKI_BADGE[haki];
  // (an awakened move, or any made from another, looks like the one it was made from)
  let m = SKILL_MAP[id] || (def?.base ? SKILL_MAP[def.base] : undefined);
  if (!m && haki) m = SKILL_MAP['toggle_' + haki] || SKILL_MAP.haki_conqueror;
  if (!m && kind === 'style' && /^strike$/i.test(def?.name || '')) m = STYLE_SK[key]?.[1];
  if (!m) { const r = SKILL_RULES.find(([re]) => re.test(name)); if (r) m = [r[1], r[2]]; }
  if (!m && def?.icon && EMOJI_SK[def.icon.replace(/️/g, '')]) m = EMOJI_SK[def.icon.replace(/️/g, '')];
  if (!m && kind === 'style' && STYLE_SK[key]) m = STYLE_SK[key][1];
  if (!m && el && ELEM_SK[el]) m = ELEM_SK[el];
  if (!m) m = ANIM_SK[def?.anim] || ['impact'];
  return { motif: m[0], o: m[1] || {}, badge, haki };
}
function badgeTone(c) {
  const L = lum(c);
  if (L > 0.55) return mix(c, '#241a2a', Math.min(0.6, (L - 0.42) / (L - 0.08)));
  if (L < 0.16) return mix(c, '#8a7fa0', 0.3);
  return c;
}
const WIN = 27;
function skillBadge(I, col) {
  const c = badgeTone(col);
  part(I, circle(32, 32, 30), dk(c, 0.35), { sd: 0, hd: 0 });
  fl(I, circle(32, 32, WIN + 0.5), rg(I, 32, 32, 29, [[0, lt(c, 0.3)], [0.55, c], [1, dk(c, 0.3)]], 22, 20, 1));
  return c;
}
function skillFrame(I, c) {
  const ring = new Path2D(); ring.addPath(circle(32, 32, 30)); ring.addPath(circle(32, 32, WIN));
  part(I, ring, dk(c, 0.3), { rule: 'evenodd', sd: 1.2, hd: 1.1, hi: lt(c, 0.35), sh: dk(c, 0.55), ol: I.ol });
}

// ==================================================================== UI
// Menu, HUD and shop-sign icons. They are shown small (14–34 px), so they use
// bolder outlines, few details and strong silhouettes.
const UI = {};
const SLOT = '#5b4330';
/** Empty equipment slot: flat silhouette (the UI shows it at ~32 % opacity). */
function slotGhost(I, path, rule) {
  part(I, path, SLOT, { sd: 0, hd: 0, ol: I.ol * 0.8, line: '#3a2a1c', rule });
}
function questionP() {
  const p = new Path2D();
  p.addPath(P('M21 22 C21 12 28 7 33 7 C41 7 46 12 46 19 C46 26 41 29 37.5 31.5 C35.5 33 35 34.5 35 37.5 V40 H27.5 V36.5 C27.5 31.5 29.5 29 33 26.5 C36 24.5 38 23 38 19.5 C38 16.5 36 14.5 33 14.5 C30 14.5 28.5 16.5 28.5 22 Z'));
  p.addPath(circle(31.3, 49, 5.4));
  return p;
}
function exclaimP(x = 32, y = 0, s = 1) {
  const p = new Path2D();
  p.addPath(xf(rrect(27.5, 8, 9, 30, 4.5), { ox: 32, oy: 32, x: x - 32, y, s }));
  p.addPath(xf(circle(32, 48, 5.4), { ox: 32, oy: 32, x: x - 32, y, s }));
  return p;
}
function cogP(x, y, r1, r2, teeth, hole) {
  const pts = [];
  for (let i = 0; i < teeth * 4; i++) { const a = (i / (teeth * 4)) * TAU, r = i % 4 < 2 ? r1 : r2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  const p = poly(pts); if (hole) p.addPath(circle(x, y, hole)); return p;
}
function person(I, x, y, s, shirt, skin = SKIN, hair = '#3a2a1c') {
  part(I, `M${x - 12 * s} ${y + 22 * s} C${x - 12 * s} ${y + 10 * s} ${x - 7 * s} ${y + 5 * s} ${x} ${y + 5 * s} C${x + 7 * s} ${y + 5 * s} ${x + 12 * s} ${y + 10 * s} ${x + 12 * s} ${y + 22 * s} Z`, shirt, { sd: 2 * s, hd: 1.4 * s });
  part(I, circle(x, y - 3 * s, 7.4 * s), skin, { sd: 1.4 * s, hd: 1 * s });
  part(I, `M${x - 7.6 * s} ${y - 3 * s} C${x - 8 * s} ${y - 10 * s} ${x - 4 * s} ${y - 11.4 * s} ${x} ${y - 11.4 * s} C${x + 4 * s} ${y - 11.4 * s} ${x + 8 * s} ${y - 10 * s} ${x + 7.6 * s} ${y - 3 * s} C${x + 5 * s} ${y - 6.5 * s} ${x - 5 * s} ${y - 6.5 * s} ${x - 7.6 * s} ${y - 3 * s} Z`, hair, { sd: 0.8 * s, hd: 0.6 * s, hi: lt(hair, 0.4) });
}

UI.inventory = (I) => {
  const lea = '#8e5a30';
  tube(I, 'M16 26 C16 8 48 8 48 26', dk(lea, 0.15), 4.2);
  const bag = rrect(8, 22, 48, 36, 7);
  part(I, bag, lea, { sd: 3, hd: 2 });
  if (!I.small) clip(I, bag, () => ln(I, rrect(11, 25, 42, 30, 5), dk(lea, 0.3), 1, { dash: [2, 1.8] }));
  part(I, 'M8 29 C8 24 12 20 18 20 H46 C52 20 56 24 56 29 V38 C50 41 40 42.5 32 42.5 C24 42.5 14 41 8 38 Z', lt(lea, 0.12), { sd: 1.8, hd: 1.4 });
  part(I, rrect(26.5, 36, 11, 11, 2.5), C.gold, { sd: 1, hd: 0.8 });
  fl(I, rrect(30, 39.5, 4, 4, 1), dk(C.gold, 0.45));
};
UI.character = (I) => {
  part(I, 'M8 60 C8 45 17 37 32 37 C47 37 56 45 56 60 Z', '#2f5f96', { sd: 2.4, hd: 1.6 });
  if (!I.small) ln(I, 'M20 44 L22 60 M44 44 L42 60', '#e0b24a', 1.6);
  part(I, 'M25 37.5 L32 49 L39 37.5 Z', SKIN, { sd: 0.8, hd: 0.5, ol: I.ol * 0.8 });
  part(I, rrect(27, 30, 10, 9, 3), dk(SKIN, 0.08), { sd: 0.8, hd: 0.5 });
  part(I, circle(32, 23, 12.5), SKIN, { sd: 2, hd: 1.4 });
  part(I, 'M19.5 23 C18 12 25 8.5 32 8.5 C39 8.5 46 12 44.5 23 C42 17 38 15.5 36 18 C34 15 30 15 28 18 C26 15.5 22 17 19.5 23 Z', '#2b2226', { sd: 1, hd: 0.8, hi: '#5a4a52' });
  if (!I.small) { fl(I, ellipse(27.5, 25, 1.4, 2), OUT); fl(I, ellipse(36.5, 25, 1.4, 2), OUT); ln(I, 'M28 30 C30.5 32 33.5 32 36 30', OUT, 1.3); }
};
UI.skills = (I) => {
  speed(I, [[5, 44, 16, 37], [3, 34, 13, 29], [9, 53, 19, 45]], '#fff4dc', 3.2, 1);
  speed(I, [[5, 44, 16, 37], [3, 34, 13, 29], [9, 53, 19, 45]], '#c8372d', 1.6, 1);
  tf(I, { r: -0.3, s: 0.95, x: 3, y: 1 }, () => fistShape(I, SKIN));
};
UI.journal = (I) => D.book(I, { color: '#7a3f22' });
UI.crew = (I) => {
  person(I, 15, 30, 0.72, '#2f5f96', SKIN, '#e0b24a');
  person(I, 49, 30, 0.72, '#3f8a44', SKIN, '#2b2226');
  person(I, 32, 30, 0.95, '#e0a932', SKIN, '#2b2226');
};
UI.menu = (I) => {
  const wood = '#8e5a30';
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; tube(I, `M${32 + Math.cos(a) * 8} ${32 + Math.sin(a) * 8} L${32 + Math.cos(a) * 28} ${32 + Math.sin(a) * 28}`, wood, 4.2); }
  const rim = new Path2D(); rim.addPath(circle(32, 32, 21)); rim.addPath(circle(32, 32, 15.5));
  part(I, rim, lt(wood, 0.08), { rule: 'evenodd', sd: 1.6, hd: 1.2 });
  part(I, circle(32, 32, 7.5), C.gold, { sd: 1.2, hd: 1 });
};
UI.help = (I) => {
  part(I, circle(32, 31, 27), '#2f6fb0', { sd: 2.6, hd: 1.8 });
  tf(I, { s: 0.78, y: 1 }, () => part(I, questionP(), '#fbf8f0', { sd: 1.2, shT: 0.15, hd: 0.8 }));
};
UI.settings = (I) => {
  part(I, cogP(32, 32, 28, 20, 8, 8.5), '#9aa6b0', { rule: 'evenodd', sd: 2.4, hd: 1.8 });
  if (!I.small) ln(I, circle(32, 32, 14), dk('#9aa6b0', 0.3), 1.4, { a: 0.8 });
};
UI.save = (I) => UI.anchor(I, true);
UI.check = (I) => {
  tube(I, 'M10 34 L25 49 L54 15', '#fbf1e0', 12, { flat: true });
  tube(I, 'M10 34 L25 49 L54 15', '#3f9a4a', 7.5, { ol: 0, hi: '#9fe0a6' });
};
UI.close = (I) => {
  tube(I, 'M14 14 L50 50 M50 14 L14 50', '#fbf1e0', 12, { flat: true });
  tube(I, 'M14 14 L50 50 M50 14 L14 50', '#c8372d', 7.5, { ol: 0, hi: '#f28a80' });
};
UI.quest = (I) => {
  tube(I, 'M10 8 H54', '#7a4a2a', 3.4);
  const b = 'M14 9 H50 V52 L32 44 L14 52 Z';
  part(I, b, '#f0bf45', { sd: 2.4, hd: 1.6 });
  tf(I, { s: 0.62, y: -4 }, () => part(I, exclaimP(), '#8a2a1e', { flat: true, ol: I.ol * 0.6 }));
};
UI.quests = (I) => UI.quest(I);
// the waypoints of quests — the compass, the chart and the markers over the
// world all use these: the main story's objective a gold diamond with a red
// star, a side quest's a smaller sky-blue one with a "!"
UI.wp_main = (I) => {
  part(I, 'M32 2 L60 32 L32 62 L4 32 Z', '#f7b928', { sd: 3.2, hd: 2.4 });
  part(I, star(32, 33.5, 5, 15.5, 6.6), '#c0281e', { sd: 1.4, hd: 0.9, ol: I.ol * 0.75 });
};
UI.wp_side = (I) => {
  part(I, 'M32 6 L56 32 L32 58 L8 32 Z', '#84cdef', { sd: 2.8, hd: 2.2 });
  tf(I, { s: 0.6, y: 0.5 }, () => part(I, exclaimP(), '#133a61', { flat: true, ol: I.ol * 0.55 }));
};
UI.reputation = (I) => {
  const g = '#e0b24a';
  tube(I, 'M32 10 V54', dk(g, 0.1), 3.6);
  tube(I, 'M8 16 H56', g, 3.4);
  part(I, rrect(20, 52, 24, 6, 2.5), dk(g, 0.12), { sd: 1, hd: 0.8 });
  part(I, circle(32, 10, 3.6), g, { sd: 0.8, hd: 0.6 });
  for (const x of [13, 51]) {
    ln(I, `M${x} 17 L${x - 8} 38 M${x} 17 L${x + 8} 38`, OUT, 2.2); ln(I, `M${x} 17 L${x - 8} 38 M${x} 17 L${x + 8} 38`, '#c9a24e', 1);
    part(I, `M${x - 11} 37 H${x + 11} C${x + 10} 44 ${x + 5} 47 ${x} 47 C${x - 5} 47 ${x - 10} 44 ${x - 11} 37 Z`, g, { sd: 1.4, hd: 1 });
  }
};
UI.berries = (I) => {
  const g = C.gold;
  part(I, circle(32, 32, 26), g, { sd: 3, hd: 2.2 });
  ln(I, circle(32, 32, 19.5), dk(g, 0.35), 2);
  part(I, star(32, 32, 5, 12, 5.4), lt(g, 0.28), { sd: 1, hd: 0.8, ol: I.ol * 0.75 });
  gloss(I, 22, 19, 4.2, 2, 0.7, -0.6);
};
UI.bounty = (I) => D.poster(I, {});
UI.lives = (I) => {
  D.vivre(I, {});
  part(I, heartP(40, 42, 8), '#e0304a', { sd: 1.2, hd: 1, gloss: [36.5, 38, 1.6, 1, 0.8] });
};
UI.jolly_roger = (I) => D.flag(I, {});
UI.map = (I) => D.map(I, { chart: true });
/** Camera view switch: an eye. */
UI.view = (I) => {
  part(I, 'M4 32 C14 15 50 15 60 32 C50 49 14 49 4 32 Z', '#fbf8f0', { sd: 2, shT: 0.15, hd: 1.4 });
  part(I, circle(32, 32, 12), '#2f6fb0', { sd: 1.4, hd: 1 });
  fl(I, circle(32, 32, 5.5), '#10202e');
  fl(I, circle(28, 28, 2.6), '#ffffff');
};
/** Full screen: four corner brackets. */
UI.fullscreen = (I) => {
  for (const [x, y, sx, sy] of [[8, 8, 1, 1], [56, 8, -1, 1], [8, 56, 1, -1], [56, 56, -1, -1]]) {
    tube(I, `M${x} ${y + sy * 16} L${x} ${y} L${x + sx * 16} ${y}`, '#fbf1e0', 9, { flat: true });
  }
};
UI.log_pose = (I) => D.logPose(I, {});
UI.ship = (I) => {
  part(I, 'M4 50 C10 46 16 50 22 47 C28 44 34 49 40 46 C46 43 52 48 60 45 V60 H4 Z', '#3f86c8', { sd: 1.6, hd: 1.2, hi: '#a8d8f5' });
  tube(I, 'M31 8 V44', '#5a3a22', 2.6);
  part(I, 'M34 10 C46 14 52 24 50 36 H34 Z', '#fbf6ea', { sd: 1.8, shT: 0.18, hd: 1.2 });
  part(I, 'M28 14 C20 18 14 26 14 36 H28 Z', '#f1e7d0', { sd: 1.6, shT: 0.18, hd: 1 });
  part(I, 'M32 6 L42 8 L32 11 Z', '#c8372d', { sd: 0.5, hd: 0.3, ol: I.ol * 0.7 });
  part(I, 'M6 40 H58 L52 50 C44 53 20 53 12 50 Z', '#8e5a30', { sd: 2, hd: 1.4 });
  if (!I.small) for (const x of [20, 30, 40]) fl(I, circle(x, 45, 1.6), dk('#8e5a30', 0.5));
};
/** Training hall: crossed wooden practice swords with a tasselled cord. */
UI.trainer = (I) => {
  const bokken = () => {
    part(I, 'M12 49 L46 15 C48.5 12.5 52 11.5 54 12 C54.5 14 53.5 17.5 51 20 L17 54 Z', '#c8955a', { sd: 1.6, hd: 1.2 });
    part(I, 'M8.5 49.5 L16 42 L22 48 L14.5 55.5 C13 57 10.5 57 9 55.5 L8.5 55 C7 53.5 7 51 8.5 49.5 Z', '#5a3222', { sd: 1, hd: 0.8 });
    part(I, xf(ellipse(19.5, 44.5, 6.2, 2.2), { r: Math.PI / 4, ox: 19.5, oy: 44.5 }), '#3a2418', { sd: 0.6, hd: 0.4 });
  };
  bokken();
  tf(I, { sx: -1, ox: 32 }, bokken);
  tube(I, 'M32 32 C28 38 27 44 29 50', '#c8372d', 2.2);
  part(I, 'M26 49 H32 L33.5 58 H24.5 Z', '#c8372d', { sd: 0.8, hd: 0.6 });
  part(I, circle(32, 32, 3.4), '#e0b24a', { sd: 0.6, hd: 0.4 });
};
UI.haki = (I) => {
  glow(I, circle(32, 32, 28), '#b58ce0', 0.55);
  for (const [x, y, r] of [[10, 18, 0.3], [54, 20, -0.4]]) part(I, xf(BOLT, { s: 0.3, ox: 32, oy: 32, x: x - 32, y: y - 32, r }), '#2a1f33', { sd: 0, hd: 0, line: '#b58ce0' });
  tf(I, { r: -0.15, s: 1, y: 2 }, () => fistShape(I, BLACKFIST, true));
};
UI.marine = (I) => {
  part(I, circle(32, 32, 27), '#f7f5ee', { sd: 2.2, shT: 0.15, hd: 1.4 });
  ln(I, circle(32, 32, 22), '#2f5f96', 2.6);
  gull(I, 32, 30, 15, '#2f5f96', { ol: I.ol * 0.8 });
};
UI.doctor = (I) => {
  part(I, 'M24 8 H40 V24 H56 V40 H40 V56 H24 V40 H8 V24 H24 Z', '#d23b32', { sd: 2.4, hd: 1.8, hi: '#f5998f' });
};
UI.shipwright = (I) => {
  tube(I, 'M16 58 L38 26', '#b07a45', 5.4);
  tf(I, { r: 0.6, ox: 42, oy: 20 }, () => {
    part(I, 'M30 12 H48 C52 12 54 15 54 18 V24 H30 Z', '#8c969e', { sd: 1.6, hd: 1.2 });
    part(I, 'M30 12 C24 12 18 14 14 19 L18 21 C22 18 26 18 30 19 Z', '#8c969e', { sd: 1, hd: 0.8 });
  });
};
UI.bar = (I) => D.mug(I, {});
UI.library = (I) => {
  const book = (y, x0, w, col) => { part(I, rrect(x0, y, w, 12, 2.5), col, { sd: 1.6, hd: 1.2 }); part(I, rrect(x0 + w - 5, y + 1.5, 4, 9, 1), '#f3ead3', { flat: true, ol: I.ol * 0.6 }); fl(I, rrect(x0 + 5, y + 4.5, w - 14, 3, 1), C.gold); };
  book(46, 8, 46, '#2f5f8f');
  book(33, 12, 42, '#8e2f2a');
  book(20, 9, 44, '#3f7a3a');
  tf(I, { r: -0.25, ox: 32, oy: 12 }, () => book(6, 14, 36, '#6b3f8a'));
};
UI.shop = (I) => {
  const col = '#b88a4a';
  const b = 'M18 26 C8 34 7 48 12 54 C16 59 48 59 52 54 C57 48 56 34 46 26 Z';
  part(I, b, col, { sd: 3.2, hd: 2 });
  part(I, 'M21 27 C18 20 21 13 26 15 C28 11 36 11 38 15 C43 13 46 20 43 27 Z', lt(col, 0.1), { sd: 1.6, hd: 1.2 });
  tube(I, 'M18 27 C26 30 38 30 46 27', '#8e2f2a', 3);
  part(I, circle(32, 44, 9), C.gold, { sd: 1.4, hd: 1 });
  part(I, star(32, 44, 5, 5, 2.3), lt(C.gold, 0.3), { flat: true, ol: I.ol * 0.6 });
  for (const [x, y] of [[50, 58], [56, 54]]) part(I, ellipse(x, y, 5, 2.2), C.gold, { sd: 0.6, hd: 0.4 });
};
UI.inn = (I) => {
  part(I, rrect(6, 14, 8, 44, 2), '#8e5a30', { sd: 1.4, hd: 1 });
  part(I, rrect(50, 30, 8, 28, 2), '#8e5a30', { sd: 1.4, hd: 1 });
  part(I, rrect(8, 36, 48, 12, 3), '#f4f1ea', { sd: 1.6, shT: 0.15, hd: 1 });
  part(I, 'M26 34 H56 V48 H22 C22 42 23 37 26 34 Z', '#c8372d', { sd: 1.8, hd: 1.2 });
  part(I, ellipse(20, 32, 7, 4.6, -0.15), '#fbf8f0', { sd: 1, shT: 0.15, hd: 0.8 });
  part(I, rrect(8, 47, 48, 6, 2), '#6e4526', { sd: 1, hd: 0.8 });
};
UI.sword = (I) => tf(I, { s: 0.94, x: 1, y: 1 }, () => D.cutlass(I, { blade: '#e4ecf2', wrap: '#5a3d2b' }));
UI.weapon = UI.sword;
UI.gun = (I) => D.flintlock(I, {});
UI.staff = (I) => D.staff(I, {});
UI.axe = (I) => D.axe(I, {});
UI.food = (I) => D.meat(I, {});
UI.medicine = (I) => D.vial(I, {});
UI.fruit = (I) => D.fruit(I, { fruit: 'gomu', color: '#8e5bd1', shape: 'round' });
UI.key = (I) => D.key(I, {});
UI.dial = (I) => D.shell(I, { color: '#e3a857' });
UI.material = (I) => D.wood(I, {});
UI.pose = (I) => D.eternalPose(I, {});
UI.hat = (I) => D.strawHat(I, {});
UI.coat = (I) => D.coat(I, { color: '#1f3566' });
UI.accessory = (I) => D.ring(I, { gem: '#d7263d', metal: C.gold });
UI.treasure = (I) => D.chest(I, {});
UI.scroll = (I) => D.scroll(I, {});
UI.weapon_slot = (I) => slotGhost(I, 'M17 50 L44 17 C47 13.5 51 11.5 55 11 C54.5 15 52.5 19 49 22 L22 55 Z M10 43 L24 57 L20.5 60.5 L6.5 46.5 Z M6 58 L13 51 L16.5 54.5 L9.5 61.5 Z');
UI.head_slot = (I) => slotGhost(I, union(ellipse(32, 42, 28, 10), 'M15 42 C14 28 21 18 32 18 C43 18 50 28 49 42 Z'));
UI.body_slot = (I) => slotGhost(I, 'M20 9 L27 7 L32 14 L37 7 L44 9 L57 18 L51 30 L46 27 L47 58 H17 L18 27 L13 30 L7 18 Z');
UI.accessory_slot = (I) => { const r = new Path2D(); r.addPath(ellipse(32, 40, 18, 14)); r.addPath(ellipse(32, 41.5, 11.5, 8.4)); slotGhost(I, r, 'evenodd'); slotGhost(I, poly([[22, 27], [26, 18], [38, 18], [42, 27], [32, 34]])); };
UI.offhand_slot = (I) => slotGhost(I, 'M32 7 C40 11 48 12 54 11 C55 30 50 47 32 58 C14 47 9 30 10 11 C16 12 24 11 32 7 Z');
UI.lock = (I) => {
  tube(I, 'M21 30 V21 C21 8 43 8 43 21 V30', '#9aa4ab', 5.5);
  part(I, rrect(12, 28, 40, 30, 6), '#e0b24a', { sd: 2.4, hd: 1.6 });
  fl(I, circle(32, 40, 4), OUT); fl(I, poly([[30, 41], [34, 41], [35, 50], [29, 50]]), OUT);
};
UI.warning = (I) => {
  part(I, 'M32 5 C34 5 35.5 6 36.5 8 L60 51 C61.5 54 59.5 57 56.5 57 H7.5 C4.5 57 2.5 54 4 51 L27.5 8 C28.5 6 30 5 32 5 Z', '#f2c230', { sd: 2.4, hd: 1.8 });
  tf(I, { s: 0.6, y: 6 }, () => part(I, exclaimP(), '#3a2a1c', { flat: true, ol: 0 }));
};
UI.info = (I) => { part(I, circle(32, 32, 27), '#2f6fb0', { sd: 2.6, hd: 1.8 }); tf(I, { s: 0.62, r: Math.PI, y: -1 }, () => part(I, exclaimP(), '#fbf8f0', { flat: true, ol: I.ol * 0.6 })); };
UI.plus = (I) => tube(I, 'M32 10 V54 M10 32 H54', '#3f9a4a', 10, { hi: '#9fe0a6' });
UI.minus = (I) => tube(I, 'M10 32 H54', '#c8372d', 10, { hi: '#f28a80' });
UI.heart = (I) => part(I, heartP(32, 34, 25), '#e0304a', { sd: 3, hd: 2, gloss: [20, 22, 4.4, 2.6, 0.8, -0.6] });
UI.star = (I) => part(I, star(32, 34, 5, 27, 12), C.gold, { sd: 2.6, hd: 1.8 });
UI.sound = (I) => {
  part(I, 'M8 24 H18 L32 12 V52 L18 40 H8 Z', '#8c969e', { sd: 1.8, hd: 1.4 });
  for (const [r, w] of [[10, 3.6], [18, 3.2]]) tube(I, xf(arcPath(32, 32, r, -0.8, 0.8), {}), '#3f86c8', w, { flat: true });
};
UI.mute = (I) => { part(I, 'M8 24 H18 L32 12 V52 L18 40 H8 Z', '#8c969e', { sd: 1.8, hd: 1.4 }); tube(I, 'M40 24 L56 40 M56 24 L40 40', '#c8372d', 4.6, { flat: true }); };
UI.news = (I) => {
  tf(I, { r: -0.12 }, () => {
    part(I, rrect(8, 12, 48, 40, 2), '#f4ecd8', { sd: 2.2, shT: 0.15, hd: 1.2 });
    fl(I, rrect(12, 16, 40, 6, 1), '#3a2a1c');
    part(I, rrect(12, 26, 18, 14, 1), '#c9d6e0', { flat: true, ol: I.ol * 0.5 });
    gull(I, 21, 33, 6, '#2f5f96', { ol: I.ol * 0.5 });
    for (const y of [27, 32, 37, 44]) fl(I, rrect(y === 44 ? 12 : 33, y, y === 44 ? 40 : 19, 2.4, 1), '#8a7a64');
  });
};
UI.legacy = (I) => { D.strawHat(I, {}); sparkle(I, 52, 14, 6, '#fff3c0'); };
UI.stats = (I) => { for (const [x, h, c] of [[10, 18, '#3f86c8'], [26, 32, '#3f9a4a'], [42, 44, '#e0b24a']]) part(I, rrect(x, 56 - h, 12, h, 2), c, { sd: 1.6, hd: 1.2 }); tube(I, 'M6 58 H58', '#6e4526', 3); };
UI.combat = (I) => { tf(I, { s: 0.9 }, () => { D.katana(I, {}); tf(I, { sx: -1, ox: 32 }, () => D.katana(I, {})); }); };
/** Dodge (Q): a double chevron dashing off, speed lines behind it. */
UI.dodge = (I) => {
  speed(I, [[4, 22, 16, 22], [2, 32, 14, 32], [4, 42, 16, 42]], '#fff4dc', 3.4, 1);
  speed(I, [[4, 22, 16, 22], [2, 32, 14, 32], [4, 42, 16, 42]], '#3d8fd1', 1.7, 1);
  const chev = (x) => `M${x} 12 L${x + 12} 12 L${x + 30} 32 L${x + 12} 52 L${x} 52 L${x + 18} 32 Z`;
  part(I, chev(18), '#7cc8f2', { sd: 2.2, hd: 1.6 });
  part(I, chev(32), '#b8e4fa', { sd: 2.2, hd: 1.6 });
};
/** Block (F): a round-topped shield with a gold rim and boss. */
UI.guard = (I) => {
  const shield = 'M32 5 C40 9.5 48 10.5 55 9.5 C56 30 50 47 32 59 C14 47 8 30 9 9.5 C16 10.5 24 9.5 32 5 Z';
  part(I, shield, '#e0b24a', { sd: 2.4, hd: 1.6 });
  part(I, xf(shield, { s: 0.78, oy: 31 }), '#4f79a6', { sd: 2.4, hd: 1.6, ol: I.ol * 0.7 });
  part(I, circle(32, 29, 6), '#f2d27a', { sd: 1.4, hd: 1, ol: I.ol * 0.7 });
};
UI.drop = (I) => part(I, dropP(32, 36, 2.4), '#4fb3e8', { sd: 3, hd: 2, gloss: [26, 34, 3, 5, 0.7, 0.3] });
UI.dream = (I) => { part(I, cloudP(32, 36, 1.35), '#f4f1ea', { sd: 2.4, shT: 0.15, hd: 1.4 }); part(I, star(44, 16, 5, 10, 4.5), C.gold, { sd: 1, hd: 0.8 }); };
UI.clock = (I) => { part(I, circle(32, 32, 26), '#f4ecd8', { sd: 2.4, shT: 0.15, hd: 1.4 }); ln(I, circle(32, 32, 22), '#8e5a30', 2.4); tube(I, 'M32 32 V16 M32 32 L42 38', OUT, 3, { flat: true }); fl(I, circle(32, 32, 2.6), '#c8372d'); };
UI.sun = (I) => { part(I, star(32, 32, 12, 28, 18, 0.1), '#f7c948', { sd: 1.2, hd: 1 }); part(I, circle(32, 32, 15), '#ffd23f', { sd: 2.2, hd: 1.6 }); };
UI.moon = (I) => part(I, crescentP(32, 32, 20, 0.9, 0.9 + TAU * 0.7, 16, 0.5), '#f6e7a8', { sd: 2, hd: 1.4 });
UI.anchor = (I, gold) => {
  const c = gold === true ? '#d6a23e' : '#6c7780';
  const r = new Path2D(); r.addPath(circle(32, 11, 6)); r.addPath(circle(32, 11, 2.6));
  part(I, r, c, { rule: 'evenodd', sd: 0.8, hd: 0.6 });
  tube(I, 'M32 17 V54 M20 24 H44', c, 5);
  tube(I, 'M10 38 C12 50 22 56 32 56 C42 56 52 50 54 38', c, 5);
  for (const x of [10, 54]) part(I, poly([[x - 5, 40], [x, 31], [x + 5, 40]]), c, { sd: 0.8, hd: 0.6 });
};
UI.compass = (I) => { part(I, circle(32, 32, 27), '#e0b24a', { sd: 2.4, hd: 1.6 }); part(I, circle(32, 32, 22), '#f4ecd8', { sd: 1.4, shT: 0.15, hd: 0 }); part(I, star(32, 32, 4, 19, 5), '#8e2f2a', { sd: 1, hd: 0.8, ol: I.ol * 0.7 }); fl(I, circle(32, 32, 2.4), C.gold); };

// ================================================================== exports
export function itemIcon(idOrDef, size = 48) {
  const isStr = typeof idOrDef === 'string';
  const d = isStr ? ITEMS[idOrDef] : idOrDef;
  const id = isStr ? idOrDef : idOfDef(d);
  const key = 'item:' + (id || `${d?.type || '?'}/${d?.name || '?'}`);
  const hit = cache.get(key + '@' + Math.max(8, Math.round(size || 48)));
  if (hit) return hit;
  const r = resolveItem(id, d);
  const fn = D[r.fn] ? r.fn : 'pouch';
  return render(key, size, (I) => D[fn](I, { ...r.o, def: d, id }), { tag: fn, fallback: r.fallback || fn !== r.fn });
}

export function skillIcon(def, size = 48) {
  const key = 'skill:' + (def?.id || def?.name || '?');
  const hit = cache.get(key + '@' + Math.max(8, Math.round(size || 48)));
  if (hit) return hit;
  const r = resolveSkill(def);
  return render(key, size, (I) => {
    const c = skillBadge(I, r.badge);
    clip(I, circle(32, 32, WIN + 0.4), () => {
      if (r.o.aura) fl(I, circle(32, 34, 22), rg(I, 32, 34, 24, [[0, fade(r.o.aura === true ? '#c9a0ff' : r.o.aura, 0.8)], [1, fade(r.o.aura === true ? '#c9a0ff' : r.o.aura, 0)]]));
      I.inBadge = true;
      (SK[r.motif] || SK.impact)(I, r.o);
      I.inBadge = false;
    });
    skillFrame(I, c);
    // (awakened: a gold rim)
    if (def?.awakened) { const ring = new Path2D(); ring.addPath(circle(32, 32, 30.5)); ring.addPath(circle(32, 32, 27.6)); part(I, ring, '#f2c14e', { rule: 'evenodd', sd: 0.6, hd: 0.8, hi: '#fff3c4', sh: '#9a6b12', ol: I.ol }); }
  }, { tag: r.motif, halo: false });
}

export function uiIcon(name, size = 32) {
  const fn = UI[name];
  return render('ui:' + name, size, (I) => (fn || UI.compass)(I), { tag: fn ? name : 'compass', fallback: !fn, bold: 1.2 });
}

const urls = new WeakMap();
export function iconURL(canvas) {
  if (!canvas) return '';
  if (!urls.has(canvas)) urls.set(canvas, canvas.toDataURL('image/png'));
  return urls.get(canvas);
}
