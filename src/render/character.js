// Procedural chibi characters, drawn in tile units with the origin at the
// feet. A small rig (2-bone IK arms and legs, a torso that leans around the
// hips, whole-body roll, airborne height, squash) is posed by keyframed clips
// (see ./anims.js): every attack runs anticipation → strike → follow-through
// and its strike frame lands exactly on the ability's hit frame. Four facings
// (left mirrors right); the front/back views project the side-view pose with
// foreshortening so punches come at the camera and blades sweep across.
import { shade } from '../core/math.js';
import { samplePose, STAND, GUARD, restPose, blendPose } from './anims.js';
import { drawHead, drawHair, drawHat } from './charart.js';

const TAU = Math.PI * 2;
const OUTLINE = 'rgba(30,20,20,0.85)';

function circ(g, x, y, r, fill, stroke, lw = 0.04) {
  g.beginPath(); g.arc(x, y, Math.max(0.001, r), 0, TAU);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function rrect(g, x, y, w, h, r, fill, stroke, lw = 0.04) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function limb(g, x0, y0, x1, y1, w, col, outline) {
  g.lineCap = 'round';
  if (outline) { g.strokeStyle = outline; g.lineWidth = w + 0.07; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}
/** Two-segment limb (upper + lower) with rounded joints; `col2` colours the lower half. */
function limb2(g, ax, ay, jx, jy, ex, ey, w, col, outline, col2) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (outline) {
    g.strokeStyle = outline; g.lineWidth = w + 0.07;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(jx, jy); g.lineTo(ex, ey); g.stroke();
  }
  g.lineWidth = w;
  if (col2 && col2 !== col) {
    g.strokeStyle = col; g.beginPath(); g.moveTo(ax, ay); g.lineTo(jx, jy); g.stroke();
    g.strokeStyle = col2; g.beginPath(); g.moveTo(jx, jy); g.lineTo(ex, ey); g.stroke();
  } else {
    g.strokeStyle = col; g.beginPath(); g.moveTo(ax, ay); g.lineTo(jx, jy); g.lineTo(ex, ey); g.stroke();
  }
}
// ---------------------------------------------------------------- body primitives
const OLW = 0.07; // outline stroke (half of it shows outside every part)
const dk = (col, amt) => (col && col[0] === '#' ? shade(col, amt) : col);
const mix2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
/** Outer hull of two circles: a tapered capsule from (x0, y0, r0) to (x1, y1, r1). */
function capsulePath(g, x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  if (d < Math.abs(r0 - r1) + 1e-4) {
    const [x, y, r] = r0 > r1 ? [x0, y0, r0] : [x1, y1, r1];
    g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    return;
  }
  const a = Math.atan2(dy, dx);
  const th = Math.acos(Math.max(-1, Math.min(1, (r0 - r1) / d)));
  g.moveTo(x0 + Math.cos(a + th) * r0, y0 + Math.sin(a + th) * r0);
  g.arc(x0, y0, r0, a + th, a - th + TAU);
  g.lineTo(x1 + Math.cos(a - th) * r1, y1 + Math.sin(a - th) * r1);
  g.arc(x1, y1, r1, a - th, a + th);
  g.closePath();
}
/**
 * Outlined, cel-shaded limb through the joints `pts` (radii `rs`): the dark
 * outline is stroked first and the fill covers its inner half, so the joints
 * merge cleanly; the shadow tone sits on the side facing away from the light.
 */
function drawLimb(g, pts, rs, col, shadeCol, sd) {
  g.beginPath();
  for (let i = 0; i < pts.length - 1; i++) capsulePath(g, pts[i][0], pts[i][1], rs[i], pts[i + 1][0], pts[i + 1][1], rs[i + 1]);
  g.lineJoin = 'round';
  g.lineWidth = OLW; g.strokeStyle = OUTLINE; g.stroke();
  g.fillStyle = col; g.fill();
  if (!shadeCol || !sd) return;
  g.save(); g.clip();
  g.beginPath();
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d, ny = dx / d;
    if (nx * sd[0] + ny * sd[1] < 0) { nx = -nx; ny = -ny; }
    capsulePath(g, x0 + nx * rs[i] * 0.72, y0 + ny * rs[i] * 0.72, rs[i] * 0.78, x1 + nx * rs[i + 1] * 0.72, y1 + ny * rs[i + 1] * 0.72, rs[i + 1] * 0.78);
  }
  g.fillStyle = shadeCol; g.fill();
  g.restore();
}
/** Chibi torso silhouette: squared shoulders, a nipped waist, hips. */
function torsoPath(g, W, top, bottom, side) {
  const ws = W / 2, ww = W * (side ? 0.44 : 0.4), wh = W * (side ? 0.47 : 0.45);
  const waistY = top + (bottom - top) * 0.6;
  const fx = side ? 0.025 : 0; // the chest leads a little in profile
  g.beginPath();
  g.moveTo(-ws + 0.07, top);
  g.lineTo(ws - 0.07 + fx, top);
  g.quadraticCurveTo(ws + fx + 0.01, top, ws + fx, top + 0.09);
  g.quadraticCurveTo(ws + fx - 0.015, waistY - 0.1, ww, waistY);
  g.quadraticCurveTo(wh + 0.015, bottom - 0.06, wh, bottom);
  g.lineTo(-wh, bottom);
  g.quadraticCurveTo(-wh - 0.015, bottom - 0.06, -ww, waistY);
  g.quadraticCurveTo(-ws + 0.015, waistY - 0.1, -ws, top + 0.09);
  g.quadraticCurveTo(-ws - 0.01, top, -ws + 0.07, top);
  g.closePath();
}

/** Star path (no text glyphs): `n` points, inner radius ratio `k`. */
export function starPath(g, x, y, r, n = 5, k = 0.45, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * k : r;
    const a = rot + (i / (n * 2)) * TAU;
    if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/** '#rgb' / '#rrggbb' / 'rgb(a)(...)' → 'rgba(r,g,b,a)'. */
export function rgba(col, a) {
  if (!col) return `rgba(255,255,255,${a})`;
  if (col[0] === '#') {
    let h = col.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = col.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map((s) => parseFloat(s)); return `rgba(${p[0] | 0},${p[1] | 0},${p[2] | 0},${a * (p[3] ?? 1)})`; }
  return col;
}
/** Rough perceived brightness 0..1 of a colour string. */
export function brightness(col) {
  if (!col) return 1;
  let r = 255, gg = 255, b = 255;
  if (col[0] === '#') {
    let h = col.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16); r = (n >> 16) & 255; gg = (n >> 8) & 255; b = n & 255;
  } else {
    const m = col.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map((s) => parseFloat(s)); r = p[0]; gg = p[1]; b = p[2]; }
  }
  return (r * 0.299 + gg * 0.587 + b * 0.114) / 255;
}

/** facing angle → 'down' | 'up' | 'right' | 'left' */
export function dir4(angle) {
  const a = ((angle % TAU) + TAU) % TAU;
  if (a > Math.PI * 0.25 && a <= Math.PI * 0.75) return 'down';
  if (a > Math.PI * 0.75 && a <= Math.PI * 1.25) return 'left';
  if (a > Math.PI * 1.25 && a <= Math.PI * 1.75) return 'up';
  return 'right';
}

// ---------------------------------------------------------------- rig math
/**
 * 2-bone IK from root (ax, ay) toward target; returns [jointX, jointY, endX, endY].
 * `bend` in [-1, 1] picks the side of the joint (and 0 means straight).
 * `stretch` lets rubber limbs reach past their length.
 */
function ik(ax, ay, tx, ty, l1, l2, bend, stretch) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const max = (l1 + l2) * 0.999;
  if (d > max && !stretch) { dx *= max / d; dy *= max / d; d = max; }
  if (d < 1e-4) { d = 1e-4; dx = 1e-4; }
  const ex = ax + dx, ey = ay + dy;
  if (d >= max) {
    // fully extended (or stretched): joint halfway along the line
    return [ax + dx * 0.5, ay + dy * 0.5, ex, ey];
  }
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(c < -1 ? -1 : c > 1 ? 1 : c) * bend;
  const base = Math.atan2(dy, dx);
  return [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1, ex, ey];
}
const toXY = (h) => (Array.isArray(h) ? h : [Math.cos(h.a) * h.r, Math.sin(h.a) * h.r]);

/**
 * Pose a character: returns joint positions in the body's local frame
 * (after the left/right mirror, before airborne height/roll).
 */
function solveRig(look, P, d, side, back) {
  const legLen = look.legs || 1;
  const armLen = look.arms || 1;
  const bulk = look.bulk || 1;
  const front = d === 'down';
  const lean = side ? P.l : 0;
  // in the front/back views "forward" becomes depth: a dip plus a small shift
  const fwd = side ? P.b[0] : 0;
  const hipY0 = -0.42 * legLen - 0.05;
  const hip = { x: fwd, y: hipY0 + P.b[1] + (side ? 0 : Math.abs(P.l) * 0.06 + (front ? P.b[0] * 0.25 : -P.b[0] * 0.25)) };
  const cosL = Math.cos(lean), sinL = Math.sin(lean);
  // upper body frame: rotate around the hip
  const U = (x, y) => { const ry = y - hipY0; return [hip.x + x * cosL - ry * sinL, hip.y + x * sinL + ry * cosL]; };
  const shoulderY = hipY0 - 0.42 * bulk;
  const headY = shoulderY - 0.31 - (look.neck || 0);
  const out = { hip, lean, shoulderY, headY, hipY0, U };
  const L1 = 0.215 * armLen, L2 = 0.215 * armLen;
  const T1 = 0.245 * legLen, T2 = 0.245 * legLen;
  const stretch = !!P.stretch;
  const project = (u, v, inward) => {
    if (side) return [u, v];
    if (front) return [inward * u * 0.34, v * 0.92 + u * 0.26];
    return [inward * u * 0.3, v * 0.92 - u * 0.24];
  };
  const depth = (u, L) => (side ? 1 : front ? 1 + 0.55 * Math.max(0, u) / L : 1 - 0.28 * Math.max(0, u) / L);
  // --- arms
  const arm = (hand, bend, sx, inward) => {
    const [hx, hy] = toXY(hand);
    const tx = hx * armLen, ty = hy * armLen;
    const [jx, jy, ex, ey] = ik(0, 0, tx, ty, L1, L2, bend, stretch);
    const [pjx, pjy] = project(jx, jy, inward);
    const [pex, pey] = project(ex, ey, inward);
    // elbows flare outward in the front/back views
    const flare = side ? 0 : Math.abs(jx - ex * 0.5) * 0.35 + Math.abs(jy - ey * 0.5) * 0.25;
    const sy = shoulderY + 0.08;
    const s0 = U(sx, sy);
    const j = U(sx + pjx - inward * flare, sy + pjy);
    const e = U(sx + pex, sy + pey);
    return { s: s0, j, e, u: ex, v: ey, scale: depth(ex, L1 + L2), raised: ey < -0.15 };
  };
  const shx = side ? 0.03 : 0.27 * bulk;
  out.armF = arm(P.hF, P.eF, side ? 0.05 : shx, -1);
  out.armB = arm(P.hB, P.eB, side ? -0.05 : -shx, 1);
  // --- legs (feet targets relative to the ground under the hip)
  const leg = (foot, hx0, inward) => {
    const [fx, fy] = foot;
    const root = [hip.x + hx0, hip.y];
    const u = fx * legLen, v = fy * legLen;
    let tx, ty;
    if (side) { tx = hip.x + u; ty = v - 0.02; }
    else {
      tx = hip.x + hx0 + inward * u * 0.08;
      ty = v - 0.02 + (front ? u * 0.3 : -u * 0.22);
    }
    const [kx, ky, ex, ey] = ik(root[0], root[1], tx, ty, T1, T2, side ? -1 : -inward * 0.35, false);
    return { h: root, k: [kx, ky], e: [ex, ey], u, v, scale: depth(u, T1 + T2) };
  };
  const spread = side ? 0 : 0.11 * bulk;
  out.legF = leg(P.fF, side ? 0.02 : spread, -1);
  out.legB = leg(P.fB, side ? -0.02 : -spread, 1);
  out.head = U(0, headY);
  out.neck = U(0, shoulderY);
  out.bladeLen = 0.95;
  return out;
}

/** Blade direction in the local frame for a side-plane angle `a` (upper-body frame). */
function bladeDir(a, side, back, lean, inward) {
  if (side) return [Math.cos(a + lean), Math.sin(a + lean)];
  const u = Math.cos(a), v = Math.sin(a);
  const x = inward * u * 0.8, y = v * 0.9 + (back ? -u * 0.35 : u * 0.35);
  const l = Math.hypot(x, y);
  const m = Math.max(0.62, l) / (l || 1);
  return [x * m, y * m];
}

// ---------------------------------------------------------------- weapons
function drawSword(g, x, y, dx, dy, len = 0.95, o = {}) {
  const a = Math.atan2(dy, dx);
  const lenK = Math.hypot(dx, dy);
  g.save();
  g.translate(x, y); g.rotate(a); g.scale(Math.max(0.35, Math.min(1, lenK)), 1);
  // handle
  g.fillStyle = o.hilt || '#2d2a32'; g.fillRect(-0.12, -0.035, 0.2, 0.07);
  g.strokeStyle = '#b8a07a'; g.lineWidth = 0.015; g.beginPath();
  for (let k = 0; k < 4; k++) { g.moveTo(-0.11 + k * 0.05, -0.035); g.lineTo(-0.085 + k * 0.05, 0.035); }
  g.stroke();
  // guard
  g.fillStyle = o.guard || '#d4ac0d'; g.beginPath(); g.ellipse(0.09, 0, 0.025, 0.07, 0, 0, TAU); g.fill();
  // blade (slight curve)
  const L = len;
  g.fillStyle = o.color || '#e4ecf1'; g.strokeStyle = o.edge || '#7f8c8d'; g.lineWidth = 0.018;
  g.beginPath(); g.moveTo(0.1, -0.03); g.quadraticCurveTo(0.1 + L * 0.5, -0.05, 0.1 + L, -0.012);
  g.lineTo(0.1 + L * 0.93, 0.03); g.quadraticCurveTo(0.1 + L * 0.5, 0.015, 0.1, 0.03); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.012;
  g.beginPath(); g.moveTo(0.14, -0.018); g.quadraticCurveTo(0.1 + L * 0.5, -0.036, 0.1 + L * 0.96, -0.012); g.stroke();
  if (o.haki) {
    // Armament-coated blade: black with a violet sheen
    g.fillStyle = 'rgba(20,14,30,0.82)';
    g.beginPath(); g.moveTo(0.1, -0.03); g.quadraticCurveTo(0.1 + L * 0.5, -0.05, 0.1 + L, -0.012);
    g.lineTo(0.1 + L * 0.93, 0.03); g.quadraticCurveTo(0.1 + L * 0.5, 0.015, 0.1, 0.03); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(179,136,255,0.8)'; g.lineWidth = 0.01;
    g.beginPath(); g.moveTo(0.16, -0.02); g.quadraticCurveTo(0.1 + L * 0.5, -0.036, 0.1 + L * 0.94, -0.012); g.stroke();
  }
  g.restore();
}
function drawEnergyBlade(g, x, y, dx, dy, len, color, t) {
  const a = Math.atan2(dy, dx);
  g.save(); g.translate(x, y); g.rotate(a);
  g.globalCompositeOperation = 'lighter';
  const flick = 0.85 + 0.15 * Math.sin((t || 0) * 40);
  const gr = g.createLinearGradient(0, 0, len + 0.15, 0);
  gr.addColorStop(0, rgba(color, 0.15)); gr.addColorStop(0.35, rgba(color, 0.55 * flick)); gr.addColorStop(1, rgba(color, 0.85));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0.04, -0.11); g.quadraticCurveTo(len * 0.6, -0.1, len + 0.16, 0); g.quadraticCurveTo(len * 0.6, 0.1, 0.04, 0.11); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0.05, -0.03); g.quadraticCurveTo(len * 0.6, -0.028, len + 0.09, 0); g.quadraticCurveTo(len * 0.6, 0.028, 0.05, 0.03); g.closePath(); g.fill();
  g.restore();
}
function drawAxe(g, x, y, dx, dy) {
  const a = Math.atan2(dy, dx);
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#6d4c41'; g.strokeStyle = OUTLINE; g.lineWidth = 0.025;
  g.beginPath(); g.roundRect(-0.25, -0.035, 1.1, 0.07, 0.03); g.fill(); g.stroke();
  // double crescent head
  g.fillStyle = '#cfd8dc'; g.strokeStyle = '#546e7a';
  for (const sy of [-1, 1]) {
    g.beginPath(); g.moveTo(0.62, sy * 0.03); g.quadraticCurveTo(0.6, sy * 0.28, 0.72, sy * 0.4);
    g.quadraticCurveTo(0.86, sy * 0.22, 0.92, sy * 0.36); g.quadraticCurveTo(0.95, sy * 0.12, 0.84, sy * 0.03); g.closePath(); g.fill(); g.stroke();
  }
  g.fillStyle = '#90a4ae'; g.fillRect(0.6, -0.05, 0.26, 0.1);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.014;
  g.beginPath(); g.moveTo(0.74, -0.38); g.quadraticCurveTo(0.88, -0.24, 0.9, -0.34); g.moveTo(0.74, 0.38); g.quadraticCurveTo(0.88, 0.24, 0.9, 0.34); g.stroke();
  g.restore();
}
function drawStaff(g, x, y, dx, dy) {
  const a = Math.atan2(dy, dx);
  g.save(); g.translate(x, y); g.rotate(a);
  g.strokeStyle = OUTLINE; g.lineWidth = 0.08; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-0.3, 0); g.lineTo(0.72, 0); g.stroke();
  g.strokeStyle = '#4fc3f7'; g.lineWidth = 0.05; g.stroke();
  g.strokeStyle = '#e1f5fe'; g.lineWidth = 0.015; g.beginPath(); g.moveTo(-0.28, -0.01); g.lineTo(0.7, -0.01); g.stroke();
  circ(g, 0.74, 0, 0.07, '#0288d1', OUTLINE, 0.025);
  circ(g, 0.2, 0, 0.045, '#0288d1', null);
  circ(g, -0.3, 0, 0.055, '#0288d1', OUTLINE, 0.02);
  g.restore();
}
function drawGun(g, x, y, dx, dy, kind) {
  const a = Math.atan2(dy, dx);
  g.save(); g.translate(x, y); g.rotate(a);
  if (kind === 'sling') {
    g.strokeStyle = '#6d4c41'; g.lineWidth = 0.05; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-0.02, 0); g.lineTo(0.14, 0); g.moveTo(0.14, 0); g.lineTo(0.28, -0.1); g.moveTo(0.14, 0); g.lineTo(0.28, 0.1); g.stroke();
    g.strokeStyle = '#ffcc80'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(0.28, -0.1); g.lineTo(0.08, 0); g.lineTo(0.28, 0.1); g.stroke();
  } else {
    g.fillStyle = '#2d3436'; g.fillRect(0.02, -0.04, 0.34, 0.07);
    g.fillStyle = '#636e72'; g.fillRect(0.02, -0.04, 0.34, 0.02);
    g.fillStyle = '#8d5b33'; g.beginPath(); g.moveTo(0.06, 0.02); g.lineTo(-0.02, 0.14); g.lineTo(0.06, 0.16); g.lineTo(0.12, 0.03); g.closePath(); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------- hands & feet
/**
 * Hands, drawn along the forearm direction: a squared fist with knuckles and
 * a thumb, an open palm with fingers, a pointing finger (Shigan) or a claw.
 */
function drawHand(g, x, y, r, col, shape, dirx, diry, extra) {
  const a = Math.atan2(diry, dirx);
  const sh = dk(col, -0.2);
  g.save(); g.translate(x, y); g.rotate(a);
  g.lineJoin = 'round'; g.lineCap = 'round';
  if (shape === 'palm') {
    // open hand: palm + four fingers + thumb
    g.beginPath();
    g.ellipse(0.01, 0, r * 0.78, r * 1.05, 0, 0, TAU);
    for (let f = 0; f < 4; f++) { const fy = (f - 1.5) * r * 0.46; g.moveTo(r * 0.5, fy); g.roundRect(r * 0.35, fy - r * 0.2, r * 1.05 - Math.abs(f - 1.5) * r * 0.16, r * 0.4, r * 0.2); }
    g.moveTo(-r * 0.05 + r * 0.42 * Math.cos(-0.7), -r * 1.02 + r * 0.42 * Math.sin(-0.7)); g.ellipse(-r * 0.05, -r * 1.02, r * 0.42, r * 0.22, -0.7, 0, TAU);
    g.lineWidth = OLW * 0.8; g.strokeStyle = OUTLINE; g.stroke();
    g.fillStyle = col; g.fill();
    g.strokeStyle = sh; g.lineWidth = 0.012;
    g.beginPath(); for (let f = 1; f < 4; f++) { const fy = (f - 2) * r * 0.46; g.moveTo(r * 0.45, fy); g.lineTo(r * 1.1, fy); } g.stroke();
    g.restore();
    return;
  }
  // fist: a rounded block with a thumb wrapped over the front
  const w = r * 1.05, h = r * 1.0;
  g.beginPath();
  g.roundRect(-w * 0.95, -h, w * 1.9, h * 2, r * 0.55);
  if (shape === 'finger') { g.moveTo(w * 0.7, -h * 0.55); g.roundRect(w * 0.6, -h * 0.62, r * 1.6, r * 0.5, r * 0.25); }
  g.lineWidth = OLW * 0.8; g.strokeStyle = OUTLINE; g.stroke();
  g.fillStyle = col; g.fill();
  // cel shade on the lower half, knuckle creases, thumb
  g.save(); g.clip();
  g.fillStyle = sh; g.fillRect(-w, h * 0.25, w * 2.2, h);
  g.restore();
  g.strokeStyle = dk(col, -0.35); g.lineWidth = 0.013;
  g.beginPath();
  for (let k = -1; k <= 1; k++) { g.moveTo(w * 0.55, k * h * 0.42 - h * 0.18); g.lineTo(w * 0.85, k * h * 0.42 - h * 0.18); }
  g.stroke();
  g.fillStyle = col; g.strokeStyle = OUTLINE; g.lineWidth = 0.02;
  g.beginPath(); g.ellipse(w * 0.15, h * 0.55, r * 0.5, r * 0.26, 0.15, 0, TAU); g.fill(); g.stroke();
  if (shape === 'claw') {
    g.strokeStyle = extra || '#fafafa'; g.lineWidth = 0.028;
    for (let k = -1; k <= 1; k++) {
      const yy = k * h * 0.55;
      g.beginPath(); g.moveTo(w * 0.8, yy); g.quadraticCurveTo(w * 1.7, yy - r * 0.15, w * 2.05, yy + r * 0.45); g.stroke();
    }
  }
  g.restore();
}

/** Boots (or sandals) at the end of a shin; `a` rotates the foot to point forward. */
function drawFoot(g, L, side, which, look, col, bare, scale) {
  const dx = L.e[0] - L.k[0], dy = L.e[1] - L.k[1];
  const a = side ? Math.atan2(dy, dx) - Math.PI / 2 : 0;
  const sandals = look.sandals ?? ((look.seed || 0) % 4 === 0);
  g.save(); g.translate(L.e[0], L.e[1]); g.rotate(side ? a : 0);
  g.scale(scale, scale);
  g.lineJoin = 'round';
  const skin = look.skin || '#f1c9a0';
  const x0 = side ? -0.06 : -0.095, x1 = side ? 0.19 : 0.095;
  if (sandals || bare) {
    // bare foot on a thin sole with two straps
    g.beginPath(); g.roundRect(x0, -0.055, x1 - x0, 0.085, 0.04);
    g.lineWidth = OLW * 0.8; g.strokeStyle = OUTLINE; g.stroke(); g.fillStyle = bare ? col : skin; g.fill();
    if (!bare) {
      g.fillStyle = '#6d4c41'; g.fillRect(x0 - 0.005, 0.02, x1 - x0 + 0.01, 0.028);
      g.strokeStyle = col; g.lineWidth = 0.025;
      g.beginPath(); g.moveTo(x0 + 0.05, -0.05); g.lineTo(x0 + 0.08, 0.02); g.moveTo(x1 - 0.07, -0.05); g.lineTo(x1 - 0.1, 0.02); g.stroke();
    }
  } else {
    // boot: rounded toe, darker sole
    g.beginPath();
    g.moveTo(x0, -0.07); g.lineTo(x1 - 0.06, -0.06);
    g.quadraticCurveTo(x1 + 0.005, -0.055, x1, 0.0); g.lineTo(x1, 0.035); g.lineTo(x0, 0.035); g.closePath();
    g.lineWidth = OLW * 0.8; g.strokeStyle = OUTLINE; g.stroke(); g.fillStyle = col; g.fill();
    g.fillStyle = dk(col, -0.35); g.fillRect(x0, 0.012, x1 - x0, 0.023);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + 0.02, -0.055, (x1 - x0) * 0.5, 0.018);
  }
  g.restore();
  void which;
}

// ---------------------------------------------------------------- trails
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}
function smoothPts(pts, sub = 3) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) out.push(catmull(p0, p1, p2, p3, k / sub));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Weapon/limb smears: re-sample the clip a few moments in the past and fill
 * the swept area — a tapered crescent for blades (gradient from a white
 * leading edge to nothing), a tapered ribbon plus speed lines for fists and
 * feet. Only drawn during the swing itself, never the wind-back.
 */
function drawTrails(g, look, pose, rig, d, side, back) {
  const A = pose.anim;
  if (!A || A.t <= 0.005) return;
  if (A.t < (A.trailFrom ?? 0) - 0.005 || A.t > (A.trailTo ?? 99)) return;
  const N = 7, dt = A.trailDt || 0.015;
  const tMin = Math.max(0, (A.trailFrom ?? 0) - 0.02);
  const samples = [];
  for (let k = 0; k < N; k++) {
    const t = A.t - k * dt;
    if (t < tMin) break;
    const P = k === 0 ? pose.P : samplePose(A, t, pose);
    const rg = k === 0 ? rig : solveRig(look, P, d, side, back);
    rg.P = P;
    samples.push(rg);
  }
  if (samples.length < 3) return;
  const col = pose.fx?.trail || pose.fx?.color || '#ffffff';
  const armed = pose.armed;
  const wk = pose.weapon?.kind;
  const moved = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const effs = [];
  const bladed = armed && (wk === 'sword' || wk === 'axe' || wk === 'staff');
  if (bladed || pose.blade) {
    const tip = (rg, which) => {
      const arm = which === 'F' ? rg.armF : rg.armB;
      const a = which === 'F' ? rg.P.wF : rg.P.wB;
      if (a === undefined || a === null) return null;
      const [dx, dy] = bladeDir(a, side, back, rg.lean, which === 'F' ? -1 : 1);
      const L = wk === 'axe' && bladed ? 0.95 : wk === 'staff' && bladed ? 0.78 : pose.bladeLen || 0.95;
      return [[arm.e[0] + dx * L * 0.3, arm.e[1] + dy * L * 0.3], [arm.e[0] + dx * (L + 0.12), arm.e[1] + dy * (L + 0.12)]];
    };
    for (const which of ['F', 'B']) {
      if (which === 'B' && !(bladed && pose.weapon?.count >= 2) && !pose.bladeB) continue;
      const pts = samples.map((rg) => tip(rg, which));
      if (pts.some((p) => !p)) continue;
      if (moved(pts[0][1], pts[pts.length - 1][1]) < 0.22) continue;
      effs.push({ blade: true, pts });
    }
  }
  if (!effs.length) {
    const limbs = A.limb === 'fF' || A.limb === 'fB' ? [['legF', 'e'], ['legB', 'e'], ['armF', 'e']] : [['armF', 'e'], ['armB', 'e'], ['legF', 'e'], ['legB', 'e']];
    for (const [name, key] of limbs) {
      const pts = samples.map((rg) => rg[name][key]);
      if (moved(pts[0], pts[pts.length - 1]) < 0.2) continue;
      effs.push({ blade: false, pts, foot: name.startsWith('leg'), scale: samples[0][name].scale || 1 });
      if (effs.length >= 2) break;
    }
  }
  if (!effs.length) return;
  g.save();
  const additive = !!pose.fx?.additive;
  g.globalCompositeOperation = additive ? 'lighter' : 'source-over';
  g.lineJoin = 'round';
  for (const e of effs) {
    if (e.blade) {
      const tips = smoothPts(e.pts.map((p) => p[1]));
      const bases = smoothPts(e.pts.map((p) => p[0]));
      const n = tips.length;
      // crescent: the inner edge closes onto the blade tip toward the tail
      const inner = bases.map((b, i) => mix2(b, tips[i], Math.pow(i / (n - 1), 0.75) * 0.9));
      const gr = g.createLinearGradient(tips[0][0], tips[0][1], tips[n - 1][0], tips[n - 1][1]);
      gr.addColorStop(0, rgba('#ffffff', 0.92));
      gr.addColorStop(0.18, rgba(col, 0.75));
      gr.addColorStop(0.65, rgba(col, 0.28));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(tips[0][0], tips[0][1]);
      for (let i = 1; i < n; i++) g.lineTo(tips[i][0], tips[i][1]);
      for (let i = n - 1; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1]);
      g.closePath(); g.fill();
      // bright leading edge that fades along the arc
      g.lineCap = 'round';
      for (let i = 0; i < n - 1; i++) {
        const u = i / (n - 1);
        g.globalAlpha = 0.95 * (1 - u) * (1 - u);
        g.strokeStyle = '#ffffff'; g.lineWidth = 0.045 * (1 - u * 0.7);
        g.beginPath(); g.moveTo(tips[i][0], tips[i][1]); g.lineTo(tips[i + 1][0], tips[i + 1][1]); g.stroke();
      }
      g.globalAlpha = 1;
    } else {
      const pts = smoothPts(e.pts, 2);
      const n = pts.length;
      const r0 = (e.foot ? 0.1 : 0.085) * (look.bulk || 1) * e.scale;
      const L = [], R = [];
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
        const ang = Math.atan2(q[1] - o[1], q[0] - o[0]) + Math.PI / 2;
        const w = r0 * (1 - i / n) * 1.1;
        L.push([p[0] + Math.cos(ang) * w, p[1] + Math.sin(ang) * w]);
        R.push([p[0] - Math.cos(ang) * w, p[1] - Math.sin(ang) * w]);
      }
      const gr = g.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
      gr.addColorStop(0, rgba('#ffffff', 0.75)); gr.addColorStop(0.3, rgba(col, 0.45)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(L[0][0], L[0][1]);
      for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
      for (let i = n - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
      g.closePath(); g.fill();
      // speed lines trailing the fist/foot
      const [hx, hy] = pts[0], [tx, ty] = pts[n - 1];
      const dx = hx - tx, dy = hy - ty, l = Math.hypot(dx, dy) || 1;
      g.strokeStyle = rgba(col, 0.7); g.lineWidth = 0.018; g.lineCap = 'round';
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        const ox = -dy / l * k * r0 * 1.4, oy = dx / l * k * r0 * 1.4;
        const s0 = r0 * 1.5, s1 = r0 * 1.5 + l * (0.7 + 0.25 * (k & 1));
        g.moveTo(hx - dx / l * s0 + ox, hy - dy / l * s0 + oy);
        g.lineTo(hx - dx / l * s1 + ox, hy - dy / l * s1 + oy);
      }
      g.stroke();
    }
  }
  g.restore();
}

/** Element glow around a striking hand or foot (charge + impact). */
function drawHandFx(g, x, y, r, fx, t, k) {
  if (!fx || !fx.elem || k <= 0) return;
  const e = fx.elem;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const col = fx.color || '#ffffff';
  if (e === 'fire' || e === 'magma' || e === 'bluefire') {
    const cols = e === 'magma' ? ['#bf360c', '#ff6f00', '#ffab40'] : e === 'bluefire' ? ['#00838f', '#4dd0e1', '#e0f7fa'] : ['#ff5722', '#ff9800', '#ffeb3b'];
    g.globalAlpha = 0.35 * k; g.fillStyle = cols[0];
    g.beginPath(); g.arc(x, y, r * 2.1, 0, TAU); g.fill();
    for (let i = 0; i < 6; i++) {
      const ph = (t * 4.5 + i * 0.17) % 1;
      const ox = Math.sin(i * 2.3 + t * 9) * r * 0.7;
      const fy = y - ph * r * 3.6;
      const fr = r * (1.25 - ph) * (0.8 + 0.3 * Math.sin(i + t * 20));
      g.globalAlpha = (1 - ph) * 0.8 * k;
      g.fillStyle = cols[1 + (i % 2)];
      g.beginPath(); g.moveTo(x + ox - fr, fy + fr * 0.4); g.quadraticCurveTo(x + ox, fy - fr * 2.2, x + ox + fr, fy + fr * 0.4); g.arc(x + ox, fy + fr * 0.4, fr, 0, Math.PI); g.fill();
    }
    if (e === 'magma') {
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.85 * k;
      g.fillStyle = '#3e2723'; g.beginPath(); g.arc(x, y, r * 1.05, 0, TAU); g.fill();
      g.strokeStyle = '#ffab40'; g.lineWidth = 0.02; g.beginPath();
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + t; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.stroke();
    }
  } else if (e === 'lightning') {
    g.globalAlpha = 0.3 * k; g.fillStyle = '#fff59d'; g.beginPath(); g.arc(x, y, r * 2.2, 0, TAU); g.fill();
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a0 = (Math.floor(t * 24) * 1.7 + i * 1.6) % TAU;
      g.globalAlpha = 0.95 * k; g.strokeStyle = i % 2 ? '#fff59d' : '#ffffff'; g.lineWidth = i % 2 ? 0.03 : 0.018;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 1; s <= 3; s++) g.lineTo(x + Math.cos(a0 + Math.sin(s * 5 + i) * 0.8) * r * (0.9 + s * 0.7), y + Math.sin(a0 + Math.cos(s * 3 + i) * 0.8) * r * (0.9 + s * 0.7));
      g.stroke();
    }
  } else if (e === 'ice' || e === 'snow') {
    g.globalAlpha = 0.3 * k; g.fillStyle = '#b3e5fc'; g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
    g.globalAlpha = 0.9 * k; g.fillStyle = '#e1f5fe';
    for (let i = 0; i < 5; i++) {
      const a = t * 1.5 + i * TAU / 5, d = r * 1.6;
      g.save(); g.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); g.rotate(a);
      g.beginPath(); g.moveTo(r * 0.7, 0); g.lineTo(0, -r * 0.22); g.lineTo(-r * 0.4, 0); g.lineTo(0, r * 0.22); g.closePath(); g.fill();
      g.restore();
    }
  } else if (e === 'water') {
    g.strokeStyle = '#b3e5fc'; g.lineWidth = 0.022;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 3 + i * 0.5) % 1;
      g.globalAlpha = 0.85 * k * (1 - ph);
      g.beginPath(); g.ellipse(x, y, r * (1.1 + ph * 1.6), r * (0.8 + ph * 1.1), 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 0.5 * k; g.fillStyle = '#4fc3f7'; g.beginPath(); g.arc(x, y, r * 1.3, 0, TAU); g.fill();
  } else if (e === 'dark' || e === 'haki') {
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5; i++) {
      const a = t * 6 + i * TAU / 5;
      g.globalAlpha = 0.55 * k; g.fillStyle = e === 'haki' ? '#12001c' : '#311b92';
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, r * 0.75, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = e === 'haki' ? '#ff1744' : '#b388ff'; g.lineWidth = 0.02; g.globalAlpha = 0.8 * k;
    const a0 = Math.floor(t * 18) * 2.1;
    g.beginPath(); g.moveTo(x + Math.cos(a0) * r * 2, y + Math.sin(a0) * r * 2); g.lineTo(x + Math.cos(a0 + 0.6) * r * 0.9, y + Math.sin(a0 + 0.6) * r * 0.9); g.lineTo(x + Math.cos(a0 + 1.2) * r * 1.9, y + Math.sin(a0 + 1.2) * r * 1.9); g.stroke();
  } else if (e === 'light') {
    g.globalAlpha = 0.5 * k; g.fillStyle = '#fff9c4'; g.beginPath(); g.arc(x, y, r * 2.2, 0, TAU); g.fill();
    g.globalAlpha = 0.95 * k; g.fillStyle = '#ffffff';
    starPath(g, x, y, r * 2.6, 4, 0.18, t * 2); g.fill();
  } else if (e === 'poison') {
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) {
      const ph = (t * 2 + i * 0.25) % 1;
      g.globalAlpha = 0.8 * k * (1 - ph); g.fillStyle = i % 2 ? '#8e24aa' : '#aed581';
      g.beginPath(); g.arc(x + Math.sin(i * 2 + t * 3) * r, y + ph * r * 2.5, r * 0.45 * (1 - ph * 0.5), 0, TAU); g.fill();
    }
  } else if (e === 'sand') {
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#e1c16e';
    for (let i = 0; i < 10; i++) {
      const a = t * 7 + i * 0.63, d = r * (1 + (i % 3) * 0.5);
      g.globalAlpha = 0.8 * k; g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 0.03, 0.03);
    }
  } else if (e === 'smoke' || e === 'gas') {
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 4; i++) {
      const ph = (t * 1.8 + i * 0.25) % 1;
      g.globalAlpha = 0.6 * k * (1 - ph); g.fillStyle = e === 'gas' ? '#b2dfdb' : '#eceff1';
      g.beginPath(); g.arc(x + Math.sin(i * 1.7) * r * 0.8, y - ph * r * 2, r * (0.7 + ph), 0, TAU); g.fill();
    }
  } else {
    g.fillStyle = col; g.globalAlpha = 0.35 * k;
    g.beginPath(); g.arc(x, y, r * 2, 0, TAU); g.fill();
  }
  g.restore();
}

/** Energy gathering during a technique's wind-up (drawn in body space). */
function drawCharge(g, pose, rig, t, headY, bulk) {
  const c = pose.charge;
  if (!c || !(c.k > 0)) return;
  const k = Math.min(1, c.k);
  const col = c.color || '#ffffff';
  const hand = c.at === 'hB' ? rig.armB.e : rig.armF.e;
  g.save();
  switch (c.kind) {
    case 'sun': {
      // a second sun growing above the raised hand (Entei)
      const cx = hand[0], cy = Math.min(hand[1], headY) - 0.35 - k * 0.6, R = 0.12 + k * 0.62;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35; g.fillStyle = '#ff6d00'; g.beginPath(); g.arc(cx, cy, R * 1.6, 0, TAU); g.fill();
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + t * 1.5, fl = 1.25 + 0.25 * Math.sin(t * 13 + i * 2);
        g.globalAlpha = 0.6; g.fillStyle = i % 2 ? '#ffab00' : '#ff3d00';
        g.beginPath(); g.moveTo(cx + Math.cos(a - 0.25) * R * 0.9, cy + Math.sin(a - 0.25) * R * 0.9); g.lineTo(cx + Math.cos(a) * R * fl, cy + Math.sin(a) * R * fl); g.lineTo(cx + Math.cos(a + 0.25) * R * 0.9, cy + Math.sin(a + 0.25) * R * 0.9); g.fill();
      }
      g.globalAlpha = 0.95; g.fillStyle = '#ff9100'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      g.fillStyle = '#ffe57f'; g.beginPath(); g.arc(cx, cy, R * 0.62, 0, TAU); g.fill();
      break;
    }
    case 'oni': {
      // Oni aura: dark red flames and a demon's horns behind the swordsman
      g.globalAlpha = 0.5 * k;
      g.fillStyle = 'rgba(120,0,0,0.9)';
      g.beginPath(); g.moveTo(-0.5 * bulk, 0);
      for (let i = 0; i <= 8; i++) { const x = -0.5 * bulk + i / 8 * bulk; g.quadraticCurveTo(x - 0.05, headY * 0.6, x, headY - 0.3 - (i % 2 ? 0.1 : 0.32 + 0.08 * Math.sin(t * 14 + i))); }
      g.lineTo(0.5 * bulk, 0); g.closePath(); g.fill();
      g.globalAlpha = 0.8 * k; g.fillStyle = '#1a0000';
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 0.12, headY - 0.22); g.quadraticCurveTo(sx * 0.42, headY - 0.5, sx * 0.3, headY - 0.78); g.lineTo(sx * 0.22, headY - 0.3); g.closePath(); g.fill(); }
      g.globalCompositeOperation = 'lighter'; g.fillStyle = '#ff1744';
      for (const sx of [-0.1, 0.1]) { g.globalAlpha = k * (0.6 + 0.4 * Math.sin(t * 20)); g.beginPath(); g.arc(sx + 0.05, headY, 0.03, 0, TAU); g.fill(); }
      break;
    }
    case 'bolt': {
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const seed = Math.floor(t * 20) + i * 7;
        g.globalAlpha = 0.9 * k; g.strokeStyle = i ? col : '#ffffff'; g.lineWidth = i ? 0.03 : 0.018;
        g.beginPath();
        let x = Math.sin(seed * 1.3) * 0.35 * bulk, y = headY + 0.1;
        g.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += Math.sin(seed * 2.1 + s * 3.7) * 0.16; y += 0.16; g.lineTo(x, y); }
        g.stroke();
      }
      break;
    }
    case 'dark': {
      g.globalAlpha = 0.65 * k;
      for (let i = 0; i < 6; i++) {
        const a = -t * 5 + i * TAU / 6, d = 0.3 * (1 - (t * 1.5 + i / 6) % 1) + 0.08;
        g.fillStyle = i % 2 ? '#1a0033' : '#4a148c';
        g.beginPath(); g.arc(hand[0] + Math.cos(a) * d, hand[1] + Math.sin(a) * d * 0.8, 0.07, 0, TAU); g.fill();
      }
      g.fillStyle = '#000'; g.beginPath(); g.arc(hand[0], hand[1], 0.06 + 0.1 * k, 0, TAU); g.fill();
      break;
    }
    default: {
      // gather: streaks converging on the hand + a growing orb
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const ph = (t * 2.6 + i / 7) % 1;
        const a = i * 2.39 + Math.floor(t * 2.6 + i / 7) * 1.3;
        const d0 = 0.75 * (1 - ph) + 0.1, d1 = d0 + 0.18;
        g.globalAlpha = 0.8 * k * ph; g.strokeStyle = col; g.lineWidth = 0.022;
        g.beginPath(); g.moveTo(hand[0] + Math.cos(a) * d0, hand[1] + Math.sin(a) * d0); g.lineTo(hand[0] + Math.cos(a) * d1, hand[1] + Math.sin(a) * d1); g.stroke();
      }
      const R = 0.05 + (c.size || 0.22) * k;
      g.globalAlpha = 0.35 * k; g.fillStyle = col; g.beginPath(); g.arc(hand[0], hand[1], R * 1.8, 0, TAU); g.fill();
      g.globalAlpha = 0.9 * k; g.beginPath(); g.arc(hand[0], hand[1], R, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(hand[0], hand[1], R * 0.5, 0, TAU); g.fill();
    }
  }
  g.restore();
}

/** Flickering flame silhouette around the body (Haki, transformations). */
function drawAura(g, color, t, headY, bulk, bright) {
  const h = -headY + 0.45;
  g.save();
  if (bright) g.globalCompositeOperation = 'lighter';
  for (let layer = 0; layer < 2; layer++) {
    const sc = layer ? 0.82 : 1.12;
    g.globalAlpha *= layer ? 1.25 : 0.7;
    g.fillStyle = color;
    g.beginPath();
    const w = 0.56 * bulk * sc;
    g.moveTo(-w, 0.02);
    for (let k = 0; k <= 10; k++) {
      const x = -w + (k / 10) * 2 * w;
      const env = Math.sin((k / 10) * Math.PI);
      const tip = (k % 2 ? 0.1 : 0.3 + 0.12 * Math.sin(t * 13 + k * 1.7 + layer)) * sc;
      g.quadraticCurveTo(x - 0.06, -h * (0.5 + 0.3 * env) * sc, x, -(h * (0.55 + 0.45 * env)) * sc - tip);
    }
    g.lineTo(w, 0.02); g.closePath(); g.fill();
    g.globalAlpha /= layer ? 1.25 : 0.7;
  }
  g.restore();
}

// ---------------------------------------------------------------- main entry
/**
 * Draw a character.
 * look: appearance (see data/races.js makeLook)
 * pose: { facing, walk, moving, time, state, alpha, aura, auraBright, swimming, flash,
 *         anim: { keys, t, ... } (see anims.js), blend: { P, k }, stanceP,
 *         weapon: { kind, count, gun }, armed, armament, armLegs,
 *         fx: { color, trail, elem, limb, k, additive, claw }, blade/bladeB/bladeLen,
 *         legFx, charge: { kind, color, k, at }, flurry, combat, sprint, block,
 *         dodge, dodgeDir, getUp, launch, hurtK, z, roll, squash, toon, bounce,
 *         knockT, ghost, noShadow, noTrails }
 */
export function drawCharacter(g, look, pose) {
  const s = look.scale || 1;
  const t = pose.time || 0;
  // body spin (pirouettes, spinning slashes) cycles the facing through all views
  let P = pose.P;
  if (!P) {
    P = pose.anim ? samplePose(pose.anim, pose.anim.t, pose) : restPose(pose, look);
    if (pose.blend && pose.blend.P) P = blendPose(pose.blend.P, P, pose.blend.k);
    pose.P = P;
  }
  const facing = (pose.facing || 0) + (P.sp || 0) * TAU * (Math.cos(pose.facing || 0) < 0 ? -1 : 1);
  const d = dir4(facing);
  const flip = d === 'left';
  const side = d === 'left' || d === 'right';
  const back = d === 'up';
  const ghost = !!pose.ghost;
  const skin = look.skin || '#f1c9a0';
  const top = look.top || '#d63031';
  const bottom = look.bottom || '#2d3436';
  const hair = look.hairColor || '#2d2d2d';
  const bulk = look.bulk || 1;
  const z = (pose.z || 0) + (P.z || 0);

  g.save();
  if (pose.alpha !== undefined) g.globalAlpha *= pose.alpha;

  // shadow stays on the ground and shrinks while airborne
  if (!pose.swimming && !pose.noShadow && !ghost) {
    const k = 1 / (1 + z * 1.2);
    g.fillStyle = `rgba(0,0,0,${0.25 * k})`;
    g.beginPath(); g.ellipse(0, 0, 0.36 * s * bulk * k, 0.13 * s * k, 0, 0, TAU); g.fill();
  }

  if (pose.state === 'knocked' || pose.state === 'dead') {
    drawLying(g, look, pose, s);
    g.restore();
    return;
  }

  if (pose.squash) g.scale(1 / Math.sqrt(pose.squash), pose.squash);
  if (pose.toon) { const w = Math.sin(t * 9) * 0.05; g.scale(1 + w, 1 - w); }
  g.translate(0, -z * s);
  g.scale(flip ? -s : s, s);
  const roll = (P.r || 0) + (pose.roll || 0);
  if (roll) { g.translate(0, -0.72); g.rotate(roll); g.translate(0, 0.72); }

  const rig = solveRig(look, P, d, side, back);
  pose.rig = rig;
  const { hip, lean } = rig;
  const hipY = rig.hipY0;
  const shoulderY = rig.shoulderY;
  const headY = rig.headY;
  const headR = 0.32;
  const armLen = look.arms || 1;

  if (pose.swimming) {
    g.translate(0, 0.45 * (look.legs || 1) + 0.2);
    g.beginPath(); g.rect(-2, -4, 4, 3.62); g.clip();
  }

  // aura (haki / transformations): a flickering flame-shaped silhouette
  if (pose.aura && !ghost) {
    g.save();
    g.globalAlpha *= 0.34 + 0.12 * Math.sin(t * 10);
    drawAura(g, pose.aura, t, headY, bulk, pose.auraBright ?? brightness(pose.aura) > 0.45);
    g.restore();
  }
  if (pose.charge && pose.charge.kind === 'oni' && !ghost) drawCharge(g, pose, rig, t, headY, bulk);

  // --- upper-body frame helper
  const upper = (fn) => { g.save(); g.translate(hip.x, hip.y); g.rotate(lean); g.translate(0, -hipY); fn(); g.restore(); };

  // --- back layer: wings, tail, back flame, cape
  const drawWings = () => {
    if (look.wings === 'sky') {
      g.fillStyle = '#ffffff'; g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 0.1, shoulderY + 0.05);
        g.quadraticCurveTo(sx * 0.55, shoulderY - 0.35 + Math.sin(t * 3) * 0.03, sx * 0.45, shoulderY + 0.25);
        g.quadraticCurveTo(sx * 0.3, shoulderY + 0.2, sx * 0.1, shoulderY + 0.2);
        g.closePath(); g.fill(); g.stroke();
      }
    } else if (look.wings === 'lunar') {
      g.fillStyle = '#1e1e24'; g.strokeStyle = '#000'; g.lineWidth = 0.03;
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(sx * 0.1, shoulderY);
        g.quadraticCurveTo(sx * 0.9, shoulderY - 0.7 + Math.sin(t * 2.5) * 0.05, sx * 0.85, shoulderY + 0.35);
        g.lineTo(sx * 0.6, shoulderY + 0.15); g.lineTo(sx * 0.5, shoulderY + 0.4); g.lineTo(sx * 0.3, shoulderY + 0.2);
        g.closePath(); g.fill(); g.stroke();
      }
    } else if (look.wings === 'phoenix') {
      // blue flame wings with golden tips
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const flap = Math.sin(t * 6 + k) * 0.08;
          g.fillStyle = ['rgba(77,208,225,0.55)', 'rgba(128,222,234,0.5)', 'rgba(255,241,118,0.45)'][k];
          g.beginPath();
          g.moveTo(sx * 0.08, shoulderY + 0.05);
          g.quadraticCurveTo(sx * (0.7 + k * 0.12), shoulderY - 0.75 - k * 0.1 + flap, sx * (1.05 - k * 0.12), shoulderY - 0.2 + flap);
          g.quadraticCurveTo(sx * (0.7 - k * 0.1), shoulderY + 0.05, sx * (0.9 - k * 0.2), shoulderY + 0.35);
          g.quadraticCurveTo(sx * 0.4, shoulderY + 0.2, sx * 0.08, shoulderY + 0.25);
          g.closePath(); g.fill();
        }
      }
      g.restore();
    }
  };
  const drawBackFlame = () => {
    if (!look.backFlame) return;
    for (let k = 0; k < 4; k++) {
      const ph = (t * 3 + k * 0.25) % 1;
      g.fillStyle = ['#ff6b35', '#f7931e', '#ffd23f', '#ff6b35'][k];
      g.beginPath();
      const bx = (k - 1.5) * 0.08;
      g.moveTo(bx - 0.12, shoulderY + 0.1);
      g.quadraticCurveTo(bx + Math.sin(t * 8 + k) * 0.1, shoulderY - 0.45 - ph * 0.3, bx + 0.12, shoulderY + 0.1);
      g.fill();
    }
  };
  const drawDrums = () => {
    // Enel's Amaru: a ring of thunder drums
    if (!look.drums) return;
    g.save();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + (k / 5) * Math.PI;
      const x = Math.cos(a) * 0.62, y = shoulderY - 0.05 + Math.sin(a) * 0.5;
      rrect(g, x - 0.09, y - 0.07, 0.18, 0.14, 0.05, '#ffb300', OUTLINE, 0.025);
      circ(g, x, y, 0.045, '#6d4c41');
    }
    g.strokeStyle = '#ffca28'; g.lineWidth = 0.035;
    g.beginPath(); g.arc(0, shoulderY - 0.05, 0.62, Math.PI, 0); g.stroke();
    g.restore();
  };
  const drawTail = () => {
    if (!look.tail) return;
    g.strokeStyle = look.fur || hair; g.lineWidth = look.tail === 'fluffy' ? 0.2 : 0.1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, hipY + 0.05);
    g.quadraticCurveTo(-0.45, hipY + 0.1 + Math.sin(t * 4) * 0.08, -0.5, hipY - 0.35);
    g.stroke();
    if (look.spots) {
      g.fillStyle = '#4e342e';
      for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(-0.14 * k, hipY + 0.08 - k * 0.03, 0.025, 0, TAU); g.fill(); }
    }
  };
  const drawCape = () => {
    if (!look.coat) return;
    const c = look.coat;
    g.fillStyle = c; g.strokeStyle = OUTLINE; g.lineWidth = 0.035;
    const sway = pose.moving ? Math.sin((pose.walk || 0) * 0.5) * 0.06 : 0;
    const flow = side ? -Math.max(0, lean) * 0.3 - (pose.sprint ? 0.12 : 0) : 0;
    g.beginPath();
    g.moveTo(-0.28 * bulk, shoulderY);
    g.lineTo(0.28 * bulk, shoulderY);
    g.lineTo(0.36 * bulk + sway + flow, hipY + 0.35);
    g.lineTo(-0.36 * bulk + sway + flow * 1.3, hipY + 0.35);
    g.closePath(); g.fill(); g.stroke();
    if (look.coatText && back && !ghost) {
      g.fillStyle = '#1b4f72'; g.font = 'bold 0.16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(look.coatText, sway * 0.5, (shoulderY + hipY) / 2 + 0.08);
    }
  };
  if (look.dragonForm && !ghost) drawDragonCoil(g, look, t, shoulderY, hipY);
  if (look.asura && !ghost) drawAsura(g, t, shoulderY, headY);
  if (!back) upper(() => { drawDrums(); drawBackFlame(); drawWings(); drawTail(); if (look.coat) drawCape(); });

  // weapon kinds
  const wpn = pose.weapon || (look.weapon ? { kind: look.weapon, count: look.swords || 1 } : (look.swords ? { kind: 'sword', count: look.swords } : null));
  const armed = !!(pose.armed && wpn);
  const skinArm = look.sleeve || skin;
  const hakiCol = '#1c1a24';
  const handCol = pose.armament ? hakiCol : (look.hand || skin);
  const foreCol = pose.armament ? hakiCol : skinArm;

  // light from the front-top: shadow tones sit on the far side of every part
  const sd = side ? [-0.55, 0.84] : back ? [-0.7, 0.7] : [0.7, 0.7];
  const farDim = (which) => (which === 'B' && side ? -0.12 : 0);

  // --- arms: tapered, outlined and cel-shaded, with a short sleeve cap
  const drawArm = (arm, which) => {
    const dim = farDim(which);
    const upperCol = dk(skinArm, dim), foreC = dk(foreCol, dim);
    const w = 0.064 * bulk * (which === 'F' ? 1.05 : 1);
    const rs = [w, w * 0.84, w * 0.72];
    if (ghost) { drawLimb(g, [arm.s, arm.j, arm.e], rs, upperCol, null, null); return; }
    if (foreC === upperCol) drawLimb(g, [arm.s, arm.j, arm.e], rs, upperCol, dk(upperCol, -0.18), sd);
    else {
      drawLimb(g, [arm.j, arm.e], [rs[1], rs[2]], foreC, dk(foreC, -0.18), sd);
      drawLimb(g, [arm.s, arm.j], [rs[0], rs[1]], upperCol, dk(upperCol, -0.18), sd);
    }
    if (armLen > 1.2) {
      // the Longarm Tribe's two elbows
      const j2 = mix2(arm.j, arm.e, 0.5);
      circ(g, arm.j[0], arm.j[1], rs[1] * 1.12, upperCol, OUTLINE, 0.03);
      circ(g, j2[0], j2[1], rs[2] * 1.12, foreC, OUTLINE, 0.03);
    }
    if (!look.sleeve && !look.noSleeves) {
      const m = mix2(arm.s, arm.j, 0.42);
      const tc = dk(top, dim);
      drawLimb(g, [arm.s, m], [w * 1.3, w * 1.14], tc, dk(tc, -0.2), sd);
    }
    if (pose.armament) {
      g.strokeStyle = 'rgba(179,136,255,0.6)'; g.lineWidth = 0.016; g.lineCap = 'round';
      const a0 = mix2(arm.j, arm.e, 0.2), a1 = mix2(arm.j, arm.e, 0.8);
      g.beginPath(); g.moveTo(a0[0], a0[1] - w * 0.35); g.lineTo(a1[0], a1[1] - w * 0.3); g.stroke();
    }
  };
  const handShape = (which) => (which === 'F' ? P.hand || 'fist' : P.handB || 'fist');
  const limbFxOn = (which) => { const l = pose.fx?.limb; return l === 'both' || l === (which === 'F' ? 'hF' : 'hB'); };
  const drawHandAt = (arm, which) => {
    const r = 0.088 * bulk * arm.scale;
    const dx = arm.e[0] - arm.j[0], dy = arm.e[1] - arm.j[1];
    const hc = dk(handCol, farDim(which));
    drawHand(g, arm.e[0], arm.e[1], r, hc, handShape(which), dx, dy, pose.fx?.claw);
    if (pose.armament && !ghost) { g.fillStyle = 'rgba(180,140,255,0.55)'; g.beginPath(); g.arc(arm.e[0] - r * 0.3, arm.e[1] - r * 0.4, r * 0.28, 0, TAU); g.fill(); }
    if (!ghost && pose.fx?.elem && limbFxOn(which)) drawHandFx(g, arm.e[0], arm.e[1], r, pose.fx, t, pose.fx.k ?? 1);
  };
  const drawWeaponIn = (arm, which) => {
    if (!armed) return;
    const kind = wpn.kind;
    const a = which === 'F' ? P.wF : P.wB;
    if (which === 'B' && kind === 'sword' && (wpn.count || 1) < 2) return;
    if (which === 'B' && kind !== 'sword') return;
    let dx, dy;
    if (a === undefined || a === null) { const fx = arm.e[0] - arm.j[0], fy = arm.e[1] - arm.j[1], l = Math.hypot(fx, fy) || 1; dx = fx / l; dy = fy / l; }
    else [dx, dy] = bladeDir(a, side, back, lean, which === 'F' ? -1 : 1);
    if (kind === 'sword') drawSword(g, arm.e[0], arm.e[1], dx, dy, 0.95, which === 'B' ? { hilt: '#1b2631', color: '#dfe6e9', haki: pose.armament } : { haki: pose.armament });
    else if (kind === 'axe') drawAxe(g, arm.e[0], arm.e[1], dx, dy);
    else if (kind === 'staff') drawStaff(g, arm.e[0], arm.e[1], dx, dy);
    else if (kind === 'gun') drawGun(g, arm.e[0], arm.e[1], dx, dy, wpn.gun);
  };
  const drawBlade = (arm, which) => {
    // fruit/energy blades (Ice Saber, Ama no Murakumo...)
    const col = which === 'F' ? pose.blade : pose.bladeB;
    if (!col) return;
    const a = which === 'F' ? P.wF : P.wB;
    let dx, dy;
    if (a === undefined || a === null) { const fx = arm.e[0] - arm.j[0], fy = arm.e[1] - arm.j[1], l = Math.hypot(fx, fy) || 1; dx = fx / l; dy = fy / l; }
    else [dx, dy] = bladeDir(a, side, back, lean, which === 'F' ? -1 : 1);
    drawEnergyBlade(g, arm.e[0], arm.e[1], dx, dy, pose.bladeLen || 0.95, col, t);
  };
  const drawArmFull = (arm, which) => { drawArm(arm, which); drawWeaponIn(arm, which); drawBlade(arm, which); drawHandAt(arm, which); };

  // legs: trousers with cuffs, boots or sandals
  const legW = 0.078 * bulk;
  const shoeCol = look.shoes || '#3b2a1a';
  const drawLeg = (L, which) => {
    const dim = farDim(which);
    const col = dk(bottom, dim);
    const striking = pose.fx?.limb === (which === 'F' ? 'fF' : 'fB');
    const legSkin = pose.legFx && (striking || pose.legFxAll) ? pose.legFx : pose.armLegs ? hakiCol : null;
    const rs = [legW, legW * 0.86, legW * 0.72];
    if (ghost) {
      drawLimb(g, [L.h, L.k, L.e], rs, col, null, null);
      drawFoot(g, L, side, which, look, col, true, L.scale);
      return;
    }
    if (legSkin) {
      drawLimb(g, [L.k, L.e], [rs[1], rs[2]], legSkin, dk(legSkin, -0.2), sd);
      drawLimb(g, [L.h, L.k], [rs[0], rs[1]], col, dk(col, -0.2), sd);
    } else {
      drawLimb(g, [L.h, L.k, L.e], rs, col, dk(col, -0.2), sd);
      const c0 = mix2(L.k, L.e, 0.7), c1 = mix2(L.k, L.e, 0.9);
      drawLimb(g, [c0, c1], [rs[2] * 1.14, rs[2] * 1.1], dk(col, -0.25), null, null);
    }
    drawFoot(g, L, side, which, look, pose.armLegs ? hakiCol : dk(shoeCol, dim * 1.5), false, L.scale);
    if (!ghost && pose.fx?.elem && striking) drawHandFx(g, L.e[0], L.e[1], 0.1, pose.fx, t, pose.fx.k ?? 1);
  };

  const armFForward = !side && !back && rig.armF.u > 0.18;
  const armBForward = !side && !back && rig.armB.u > 0.18;
  const legFForward = !side && !back && rig.legF.u > 0.2;

  if (side) {
    drawArmFull(rig.armB, 'B');
    drawLeg(rig.legB, 'B'); drawLeg(rig.legF, 'F');
  } else if (back) {
    drawLeg(rig.legB, 'B'); drawLeg(rig.legF, 'F');
    // arms reaching forward are hidden behind the body
    if (!rig.armF.raised) drawArmFull(rig.armF, 'F');
    if (!rig.armB.raised) drawArmFull(rig.armB, 'B');
  } else {
    drawLeg(rig.legB, 'B'); if (!legFForward) drawLeg(rig.legF, 'F');
  }

  // --- torso (upper-body frame): shaped silhouette, cel shade, collar, belt
  const torsoW = (side ? 0.4 : 0.46) * bulk;
  const tTop = shoulderY - 0.02, tBot = hipY + 0.035;
  upper(() => {
    torsoPath(g, torsoW, tTop, tBot, side);
    g.lineJoin = 'round'; g.lineWidth = OLW; g.strokeStyle = OUTLINE; g.stroke();
    g.fillStyle = top; g.fill();
    if (!ghost) {
      g.save(); g.clip();
      // trousers show below the belt
      g.fillStyle = bottom; g.fillRect(-torsoW, hipY - 0.05, torsoW * 2, 0.25);
      if (look.vest) {
        g.fillStyle = look.vest;
        if (side) g.fillRect(-torsoW / 2 - 0.02, tTop, torsoW * 0.55, hipY - tTop - 0.05);
        else { g.fillRect(-torsoW / 2 - 0.02, tTop, 0.13, hipY - tTop - 0.05); g.fillRect(torsoW / 2 - 0.11, tTop, 0.13, hipY - tTop - 0.05); }
      }
      if (look.openShirt && !back) {
        g.fillStyle = skin;
        g.beginPath();
        if (side) { g.moveTo(torsoW * 0.3, tTop); g.lineTo(torsoW * 0.6, tTop); g.lineTo(torsoW * 0.6, hipY - 0.06); g.lineTo(torsoW * 0.38, hipY - 0.06); }
        else { g.moveTo(-0.08, tTop); g.lineTo(0.08, tTop); g.lineTo(0.035, hipY - 0.06); g.lineTo(-0.035, hipY - 0.06); }
        g.fill();
        if (look.scar && !side) { g.strokeStyle = '#b0413e'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.08, shoulderY + 0.1); g.lineTo(0.08, shoulderY + 0.25); g.stroke(); }
      } else if (!back && !side) {
        // collar
        g.fillStyle = skin; g.beginPath(); g.moveTo(-0.07, tTop - 0.01); g.quadraticCurveTo(0, tTop + 0.09, 0.07, tTop - 0.01); g.fill();
        g.strokeStyle = dk(top, -0.35); g.lineWidth = 0.018; g.beginPath(); g.moveTo(-0.08, tTop); g.quadraticCurveTo(0, tTop + 0.1, 0.08, tTop); g.stroke();
      }
      if (look.spots) {
        g.fillStyle = 'rgba(78,52,46,0.8)';
        for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(-torsoW / 2 + 0.08 + (k % 3) * 0.14, shoulderY + 0.1 + Math.floor(k / 3) * 0.16, 0.03, 0, TAU); g.fill(); }
      }
      // cel shade on the far side of the body
      g.fillStyle = 'rgba(20,10,30,0.2)';
      g.beginPath();
      if (side) { g.moveTo(-torsoW, tTop - 0.1); g.lineTo(-torsoW * 0.1, tTop - 0.1); g.quadraticCurveTo(-torsoW * 0.3, (tTop + tBot) / 2, -torsoW * 0.08, tBot + 0.1); g.lineTo(-torsoW, tBot + 0.1); }
      else if (back) g.rect(-torsoW, tTop - 0.1, torsoW * 0.62, tBot - tTop + 0.2);
      else { g.moveTo(torsoW * 0.22, tTop - 0.1); g.quadraticCurveTo(torsoW * 0.08, (tTop + tBot) / 2, torsoW * 0.26, tBot + 0.1); g.lineTo(torsoW, tBot + 0.1); g.lineTo(torsoW, tTop - 0.1); }
      g.fill();
      // shirt hem fold over the belt
      g.strokeStyle = dk(top, -0.3); g.lineWidth = 0.016;
      g.beginPath(); g.moveTo(-torsoW / 2, hipY - 0.11); g.quadraticCurveTo(0, hipY - 0.085, torsoW / 2, hipY - 0.11); g.stroke();
      g.restore();
    }
    // belt / sash
    const bw = torsoW * 0.94;
    g.fillStyle = look.belt || dk(bottom, -0.32); g.strokeStyle = OUTLINE; g.lineWidth = 0.025;
    g.beginPath(); g.rect(-bw / 2, hipY - 0.1, bw, 0.06); g.fill(); if (!ghost) g.stroke();
    if (!ghost) {
      if (!side && !back) { g.fillStyle = '#ffd54f'; g.beginPath(); g.rect(-0.035, hipY - 0.105, 0.07, 0.07); g.fill(); g.stroke(); }
      else if (side) {
        g.fillStyle = look.belt || dk(bottom, -0.32);
        g.beginPath(); g.moveTo(-bw / 2, hipY - 0.07); g.quadraticCurveTo(-bw / 2 - 0.12, hipY - 0.02, -bw / 2 - 0.08, hipY + 0.1); g.lineTo(-bw / 2 - 0.02, hipY - 0.04); g.closePath(); g.fill(); g.stroke();
      }
    }
    if (look.gills && !ghost) {
      g.strokeStyle = shade(skin, -0.35); g.lineWidth = 0.02;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-0.12 + k * 0.03, shoulderY + 0.02); g.lineTo(-0.08 + k * 0.03, shoulderY + 0.1); g.stroke(); }
    }
    if (back) { drawDrums(); drawCape(); drawTail(); drawWings(); drawBackFlame(); }
    // sheathed weapons
    if (wpn && !armed && !ghost) {
      if (wpn.kind === 'sword') {
        for (let k = 0; k < Math.min(wpn.count || 1, 3); k++) {
          g.save();
          g.translate(side ? -0.12 : 0.18 - k * 0.05, hipY - 0.02);
          g.rotate(side ? 2.3 - k * 0.12 : 2.6 - k * 0.15);
          g.fillStyle = ['#ecf0f1', '#2c3e50', '#c0392b'][k] || '#2c3e50';
          g.fillRect(-0.02, 0, 0.05, 0.62);
          g.fillStyle = '#f1c40f'; g.fillRect(-0.05, 0.0, 0.11, 0.03);
          g.restore();
        }
      } else if (wpn.kind === 'axe' || wpn.kind === 'staff') {
        g.save(); g.translate(side ? -0.1 : 0.05, shoulderY + 0.1); g.rotate(side ? -2.2 : -1.9);
        if (wpn.kind === 'axe') drawAxe(g, 0, 0, 1, 0); else drawStaff(g, 0, 0, 1, 0);
        g.restore();
      } else if (wpn.kind === 'gun' && !back) {
        g.save(); g.translate(side ? -0.08 : 0.2, hipY - 0.02); g.rotate(1.9); drawGun(g, 0, 0, 1, 0, wpn.gun); g.restore();
      }
    }
  });

  // --- arms in front
  if (side) {
    drawArmFull(rig.armF, 'F');
  } else if (back) {
    if (rig.armF.raised) drawArmFull(rig.armF, 'F');
    if (rig.armB.raised) drawArmFull(rig.armB, 'B');
  } else {
    if (!armBForward) drawArmFull(rig.armB, 'B');
    if (!armFForward) drawArmFull(rig.armF, 'F');
  }

  // neck (longer for the snake-neck look)
  upper(() => drawLimb(g, [[0, shoulderY + 0.04], [0, headY + headR * 0.55]], [0.075, 0.068], skin, ghost ? null : dk(skin, -0.2), ghost ? null : sd));

  // --- head (with its own small tilt)
  upper(() => {
    g.save();
    const tilt = (P.ht || 0) + (pose.state === 'hurt' ? -0.25 : 0);
    if (tilt) { g.translate(0, headY + headR); g.rotate(tilt); g.translate(0, -headY - headR); }
    drawHead(g, look, headY, headR, d, pose, t, P);
    // Santoryu: the third blade in the mouth
    if (armed && wpn.kind === 'sword' && (wpn.count || 0) >= 3 && !back) {
      const m = P.m ?? 0.15;
      const mx = side ? headR * 0.45 : 0, my = headY + headR * 0.45;
      const [dx, dy] = side ? [Math.cos(m), Math.sin(m)] : [0.8, 0.35];
      drawSword(g, mx - dx * 0.1, my - dy * 0.1, dx, dy, 0.8, { hilt: '#fafafa', guard: '#b71c1c', haki: pose.armament });
    }
    g.restore();
  });

  // arms/legs reaching toward the camera go on top
  if (!side && !back) {
    if (legFForward) drawLeg(rig.legF, 'F');
    if (armBForward) drawArmFull(rig.armB, 'B');
    if (armFForward) drawArmFull(rig.armF, 'F');
  }

  // smears, flurries and charge-ups on top of everything
  if (!ghost) {
    if (pose.anim && !pose.noTrails) drawTrails(g, look, pose, rig, d, side, back);
    if (pose.flurry) drawFlurry(g, look, pose, rig, side, t);
    if (pose.charge && pose.charge.kind !== 'oni') drawCharge(g, pose, rig, t, headY, bulk);
  }

  g.restore();
}

let tintCanvas = null;
/**
 * Draw a character washed toward a flat colour (the white hit flash): the
 * body is rendered once into a scratch canvas, tinted there, then composited.
 * Much cheaper than a context filter on every stroke.
 */
export function drawCharacterTinted(g, look, pose, color = '#ffffff', amount = 1) {
  if (typeof document === 'undefined' || !g.getTransform) { drawCharacter(g, look, pose); return; }
  const m = g.getTransform();
  const px = Math.hypot(m.a, m.b) || 1;
  const s = (look.scale || 1) * (look.legs > 1 ? 1.3 : 1);
  const W = Math.ceil(4.4 * s * px), H = Math.ceil(4.6 * s * px);
  if (W * H > 4e6) { drawCharacter(g, look, pose); return; }
  if (!tintCanvas) tintCanvas = document.createElement('canvas');
  if (tintCanvas.width < W || tintCanvas.height < H) { tintCanvas.width = Math.max(W, tintCanvas.width); tintCanvas.height = Math.max(H, tintCanvas.height); }
  const c = tintCanvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  c.clearRect(0, 0, W, H);
  const ox = W / 2, oy = H - 0.8 * s * px;
  c.setTransform(px, 0, 0, px, ox, oy);
  drawCharacter(c, look, pose);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = Math.max(0, Math.min(1, amount));
  c.fillStyle = color; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(tintCanvas, 0, 0, W, H, m.e - ox, m.f - oy, W, H);
  g.restore();
}

/** Gatling-style flurries: a fan of fists (or feet) blurring in front of the body. */
function drawFlurry(g, look, pose, rig, side, t) {
  const f = pose.flurry;
  const n = f.n || 7;
  const col = pose.armament ? '#1c1a24' : (look.hand || look.skin || '#f1c9a0');
  const sleeve = look.sleeve || look.skin || '#f1c9a0';
  const sx = rig.armF.s[0], sy = rig.armF.s[1];
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const ph = (t * (f.rate || 9) + k / n) % 1;
    const ext = Math.sin(ph * Math.PI);
    const reach = (f.reach || 0.9) * (0.45 + 0.55 * ext);
    const spread = ((k * 0.618) % 1 - 0.5) * (f.spread || 0.9);
    const ex = side ? sx + reach : sx + spread * 0.6;
    const ey = side ? sy - 0.05 + spread * 0.55 : sy + reach * 0.45 + spread * 0.2;
    g.globalAlpha = 0.3 + 0.5 * ext;
    if (f.stretch) limb(g, sx, sy, ex, ey, 0.09, sleeve, null);
    // motion streak behind each fist
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.05;
    g.beginPath(); g.moveTo(ex, ey); g.lineTo(side ? ex - 0.25 * ext : ex, side ? ey : ey - 0.2 * ext); g.stroke();
    if (f.legs) rrect(g, ex - 0.1, ey - 0.05, 0.2, 0.1, 0.05, look.shoes || '#3b2a1a', OUTLINE, 0.02);
    else circ(g, ex, ey, 0.09 * (side ? 1 : 1.2), col, OUTLINE, 0.025);
  }
  g.restore();
}

function drawDragonCoil(g, look, t, shoulderY, hipY) {
  // a serpentine azure dragon coiling behind the body
  g.save();
  g.lineCap = 'round';
  const pts = [];
  for (let k = 0; k <= 14; k++) {
    const u = k / 14;
    pts.push([Math.sin(u * 5 + t * 1.5) * 0.7 * (1 - u * 0.4), shoulderY - 0.9 + u * 1.3 + Math.cos(u * 4 + t) * 0.15]);
  }
  for (const [w, col] of [[0.38, '#0d47a1'], [0.3, '#42a5f5'], [0.08, '#bbdefb']]) {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.stroke();
  }
  const [hx, hy] = pts[0];
  circ(g, hx, hy, 0.24, '#42a5f5', OUTLINE, 0.03);
  g.fillStyle = '#fff59d'; g.beginPath(); g.arc(hx + 0.08, hy - 0.05, 0.05, 0, TAU); g.fill();
  g.strokeStyle = '#fff8e1'; g.lineWidth = 0.04;
  g.beginPath(); g.moveTo(hx - 0.05, hy - 0.2); g.lineTo(hx - 0.2, hy - 0.45); g.moveTo(hx + 0.05, hy - 0.2); g.lineTo(hx + 0.12, hy - 0.47); g.stroke();
  void hipY; void look;
  g.restore();
}

function drawAsura(g, t, shoulderY, headY) {
  // Kyutoryu: a ghostly three-headed, six-armed spirit behind the swordsman
  g.save();
  g.globalAlpha *= 0.45 + 0.1 * Math.sin(t * 5);
  g.fillStyle = 'rgba(30,30,30,0.9)';
  for (const sx of [-1, 1]) {
    circ(g, sx * 0.42, headY - 0.05, 0.22, 'rgba(30,30,30,0.9)', null);
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = 'rgba(30,30,30,0.9)'; g.lineWidth = 0.1; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx * 0.2, shoulderY + 0.1); g.lineTo(sx * (0.7 + k * 0.05), shoulderY - 0.2 + k * 0.25); g.stroke();
      g.strokeStyle = 'rgba(220,230,235,0.8)'; g.lineWidth = 0.035;
      g.beginPath(); g.moveTo(sx * (0.7 + k * 0.05), shoulderY - 0.2 + k * 0.25); g.lineTo(sx * (1.3 + k * 0.05), shoulderY - 0.45 + k * 0.3); g.stroke();
    }
  }
  g.fillStyle = '#ff1744';
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 0.46, headY - 0.08, 0.03, 0, TAU); g.fill(); }
  g.restore();
}

/** Knocked out: fall over (with a bounce) and lie on the back, dazed. */
function drawLying(g, look, pose, s) {
  const kt = pose.knockT ?? 1;
  const fall = Math.min(1, kt / 0.28);
  const bounce = kt > 0.28 && kt < 0.5 ? Math.sin((kt - 0.28) / 0.22 * Math.PI) * 0.12 : 0;
  const k = fall * fall;
  g.save();
  g.scale(s, s);
  g.translate(0, -bounce);
  g.rotate(-Math.PI / 2 * 0.92 * k);
  g.translate(0.55 * k, -0.1 * k);
  const skin = look.skin || '#f1c9a0';
  rrect(g, -0.25, -0.75, 0.5, 0.55, 0.12, look.top || '#d63031', OUTLINE);
  limb(g, -0.1, -0.2, -0.12, 0.25, 0.15, look.bottom || '#2d3436', OUTLINE);
  limb(g, 0.1, -0.2, 0.14, 0.25, 0.15, look.bottom || '#2d3436', OUTLINE);
  limb(g, -0.22, -0.68, -0.42 + k * 0.1, -0.35, 0.11, look.sleeve || skin, OUTLINE);
  limb(g, 0.22, -0.68, 0.44 - k * 0.1, -0.4, 0.11, look.sleeve || skin, OUTLINE);
  circ(g, 0, -1.0, 0.3, look.furWhite ? '#fafafa' : skin, OUTLINE);
  drawHair(g, look.hair || 'short', look.hairColor || '#2d2d2d', -1.0, 0.3, 'down', null);
  g.strokeStyle = '#222'; g.lineWidth = 0.03;
  for (const ex of [-0.1, 0.1]) { g.beginPath(); g.moveTo(ex - 0.04, -1.02); g.lineTo(ex + 0.04, -0.96); g.moveTo(ex + 0.04, -1.02); g.lineTo(ex - 0.04, -0.96); g.stroke(); }
  g.restore();
  if (pose.state === 'knocked' && pose.time !== undefined && fall >= 1 && !pose.ghost) {
    // dazed: drawn stars circling the head
    for (let i = 0; i < 3; i++) {
      const a = pose.time * 4 + i * TAU / 3;
      const x = Math.cos(a) * 0.4 * s - 0.6 * s, y = -0.55 * s + Math.sin(a) * 0.15;
      g.fillStyle = '#ffd54f'; g.strokeStyle = 'rgba(80,50,0,0.8)'; g.lineWidth = 0.02;
      starPath(g, x, y, 0.11 * (0.8 + 0.2 * Math.sin(a * 2)), 5, 0.45, a);
      g.fill(); g.stroke();
    }
  }
}

export { STAND, GUARD, solveRig };
