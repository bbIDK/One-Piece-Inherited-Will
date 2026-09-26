// The effects layer in the 3D view (first / third person): the same shapes,
// particles and numbers as the top-down view, projected through the 3D
// camera by the projection shim game.view3d.proj (r.project, r.scaleAt,
// r.firstPerson, r.yaw). game/fx.js hands over here when r.is3d.
//
// Shapes are drawn by the ordinary 2D drawers (render/fxshapes.js) under a
// transform that places them in the world:
//   billboards  - upright, facing the camera, scaled by their depth (stars,
//                 glints, pillars, clouds, falling meteors, afterimages...)
//   planes      - lying in a horizontal plane at their height (weapon smears,
//                 scorch marks, cracks, vortices): the local tangent map of
//                 the ground plane, so they get true perspective
//   polylines   - rings, telegraphs, zones and domes are rebuilt from
//                 projected points, so big ones around the camera still work
//   two points  - beams, bolts, cut lines and strings project both ends
// Anything closer than about a metre to the camera is skipped (in first
// person that is the player's own body: effects centred on it would fill the
// screen); instead, first person gets screen-space extras: a light swing
// smear for the player's own attacks, an aura tint at the screen edges and a
// flash on the side a hit came from.
import { drawShapeLayer, hasLayer } from './fxshapes.js';
import { rgba } from './character.js';
import { actionClip, stanceFor, gunKind } from './anims.js';
import { actorVisuals } from './combatfx.js';

const TAU = Math.PI * 2;
const CULL = -9000;
const MAX_SC = 380; // px per metre; more means closer than ~1.2 m to the camera
const MIN_SC = 1.0;
const easeOut = (k) => 1 - (1 - k) ** 3;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ projection helpers
/** Upright billboard at a world point: screen position, px per metre, screen "up". */
function bill(r, x, y, h) {
  const a = r.project(x, y, h);
  if (a[0] < CULL) return null;
  const b = r.project(x, y, h + 1);
  if (b[0] < CULL) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const sc = Math.hypot(dx, dy);
  if (!(sc > MIN_SC) || sc > MAX_SC) return null;
  return { x: a[0], y: a[1], sc, ux: dx / sc, uy: dy / sc };
}
function setBill(g, r, B, k = 1) {
  const d = r.dpr, s = B.sc * d * k;
  g.setTransform(-B.uy * s, B.ux * s, -B.ux * s, -B.uy * s, B.x * d, B.y * d);
}
/** Local tangent map of the horizontal plane at height h (local +x east, +y south). */
function plane(r, x, y, h) {
  const e = 0.35;
  const p0 = r.project(x, y, h);
  if (p0[0] < CULL) return null;
  const pz = r.project(x, y, h + 1);
  if (pz[0] < CULL) return null;
  const sc = Math.hypot(pz[0] - p0[0], pz[1] - p0[1]);
  if (!(sc > MIN_SC) || sc > MAX_SC) return null;
  const px = r.project(x + e, y, h), py = r.project(x, y + e, h);
  if (px[0] < CULL || py[0] < CULL) return null;
  return { x: p0[0], y: p0[1], sc, a: (px[0] - p0[0]) / e, b: (px[1] - p0[1]) / e, c: (py[0] - p0[0]) / e, d: (py[1] - p0[1]) / e };
}
function setPlane(g, r, J, ky = 1) {
  const d = r.dpr;
  g.setTransform(J.a * d, J.b * d, J.c * d * ky, J.d * d * ky, J.x * d, J.y * d);
}
/** Screen angle of a horizontal world direction at a point. */
function screenAngle(r, x, y, h, ang, B) {
  const q = r.project(x + Math.cos(ang) * 0.5, y + Math.sin(ang) * 0.5, h);
  if (q[0] < CULL || !B) return ang;
  return Math.atan2(q[1] - B.y, q[0] - B.x);
}
/** The visible part of a world segment (both ends in front of the camera and not too close). */
function clipSeg(r, x0, y0, h0, x1, y1, h1) {
  const at = (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, h0 + (h1 - h0) * u];
  const ok = (u) => { const [x, y, h] = at(u); return !!bill(r, x, y, h); };
  let u0 = 0, u1 = 1;
  if (!ok(0)) {
    let f = -1;
    for (let i = 1; i <= 10; i++) if (ok(i / 10)) { f = i / 10; break; }
    if (f < 0) return null;
    let lo = f - 0.1, hi = f;
    for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
    u0 = hi;
  }
  if (!ok(1)) {
    let f = -1;
    for (let i = 9; i >= 0; i--) { const u = i / 10; if (u > u0 && ok(u)) { f = u; break; } }
    if (f < 0) return null;
    let lo = f, hi = Math.min(1, f + 0.1);
    for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    u1 = lo;
  }
  if (u1 <= u0) return null;
  const A = at(u0), Bw = at(u1);
  return { A: bill(r, A[0], A[1], A[2]), B: bill(r, Bw[0], Bw[1], Bw[2]), u0, u1 };
}
/** Project a closed or open ring of world points; returns runs of visible screen points [x, y, sc]. */
function ringRuns(r, pts) {
  const runs = [];
  let cur = null;
  for (const [x, y, h] of pts) {
    const B = bill(r, x, y, h);
    if (!B) { cur = null; continue; }
    if (!cur) { cur = []; runs.push(cur); }
    cur.push([B.x, B.y, B.sc]);
  }
  return runs;
}
function circlePts(x, y, R, h, n = 40, a0 = 0, a1 = TAU, wob) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const th = a0 + (a1 - a0) * (i / n);
    const rr = wob ? R * (1 + wob(th)) : R;
    pts.push([x + Math.cos(th) * rr, y + Math.sin(th) * rr, h]);
  }
  return pts;
}
/**
 * Stroke runs with a width in world units: short chunks, each as wide as the
 * perspective makes it there (butt caps, so additive strokes don't bead).
 */
function strokeRuns(g, r, runs, width, color, alpha) {
  const d = r.dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = color; g.lineCap = 'butt'; g.lineJoin = 'round'; g.globalAlpha = alpha;
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i += 5) {
      const j1 = Math.min(run.length - 1, i + 5);
      let sc = 0;
      for (let j = i; j <= j1; j++) sc += run[j][2];
      g.lineWidth = Math.max(0.6, width * (sc / (j1 - i + 1)) * d);
      g.beginPath(); g.moveTo(run[i][0] * d, run[i][1] * d);
      for (let j = i + 1; j <= j1; j++) g.lineTo(run[j][0] * d, run[j][1] * d);
      g.stroke();
    }
  }
}
function fillRuns(g, r, runs, color, alpha) {
  const d = r.dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = color; g.globalAlpha = alpha;
  for (const run of runs) {
    if (run.length < 3) continue;
    g.beginPath(); g.moveTo(run[0][0] * d, run[0][1] * d);
    for (let i = 1; i < run.length; i++) g.lineTo(run[i][0] * d, run[i][1] * d);
    g.closePath(); g.fill();
  }
}
const onScreen = (r, B, m) => B.x > -m && B.y > -m && B.x < r.cw + m && B.y < r.ch + m;

// ------------------------------------------------------------------ shapes
// default anchor heights for drawers that lift themselves by s.z
const LIFT = { impact: 0.7, flare: 0.7, aircrack: 0.8, claw: 0.75, cube: 0.8, cloud: 5 };
// upright billboards (anchored on the ground unless listed in LIFT)
const BILL = new Set(['impact', 'flare', 'aircrack', 'claw', 'cube', 'cloud', 'meteor', 'pieces', 'spikes', 'arms', 'barrier', 'gatling', 'streaks', 'ghost']);
// ground drawers that squash circles into ellipses for the top-down look
const SQUASH = { decal: 0.6, scorch: 0.6, crack: 0.7, pillar: 0.62, vortex: 0.62 };

function copy(s, o) { return Object.assign({}, s, o); }

function drawShape3d(fx, g, r, s, layer, k, c) {
  const t = s.type;
  const fp = r.firstPerson;
  // --- rings, telegraphs, zones, domes: rebuilt from projected points
  if (t === 'ring') { if (layer === 'air') ring3d(g, r, s, k, c); return; }
  if (t === 'tele') { if (layer === 'ground') tele3d(g, r, s, k, c); return; }
  if (t === 'dome') { dome3d(g, r, s, layer, c); return; }
  if (t === 'zone') { zone3d(fx, g, r, s, layer, k, c); return; }
  // --- two-point shapes
  if (t === 'beam') { if (layer === 'air') beam3d(g, r, s, k, c); return; }
  if (t === 'bolt' || t === 'cutline' || t === 'strings') { if (layer === 'air') seg3d(g, r, s, k, c); return; }
  // --- ground marks and funnels lying on the ground
  if (layer === 'ground') {
    if (t === 'ghost' || !hasLayer(t, 'ground')) return; // afterimages are drawn upright (air pass)
    const J = plane(r, s.x, s.y, 0.03);
    if (!J || !onScreen(r, J, J.sc * ((s.r || s.length || 2) + 1) + 60)) return;
    setPlane(g, r, J, SQUASH[t] ? 1 / SQUASH[t] : 1);
    drawShapeLayer(g, s, layer, k, 1, c);
    return;
  }
  // --- weapon smears: arcs in a horizontal plane at their height
  if (t === 'crescent' || t === 'slash') {
    const h = s.z ?? 0.6;
    const J = plane(r, s.x, s.y, h);
    if (!J || !onScreen(r, J, J.sc * (s.radius + 1) + 40)) return;
    setPlane(g, r, J);
    drawShapeLayer(g, copy(s, { z: 0, tilt: 1 }), layer, k, 1, c);
    return;
  }
  // --- pillars and funnels: upright from the ground
  if (t === 'pillar' || t === 'vortex') {
    const B = bill(r, s.x, s.y, 0);
    if (!B || !onScreen(r, B, B.sc * ((s.h || s.r * 2 || 4) + 2) + 40)) return;
    setBill(g, r, B);
    drawShapeLayer(g, s, layer, k, 1, c);
    return;
  }
  if (!BILL.has(t)) return;
  const h = LIFT[t] !== undefined ? (s.z ?? LIFT[t]) : 0;
  // in first person, a billboard on the player's own spot would sit inside the camera
  if (fp && fx.game.player && t !== 'meteor' && t !== 'cloud') {
    const p = fx.game.player, w = fx.game.world;
    if (Math.hypot(w.dx(p.x, s.x), s.y - p.y) < 0.6 && h < 2.5) return;
  }
  const B = bill(r, s.x, s.y, h);
  if (!B || !onScreen(r, B, B.sc * 3 + 60)) return;
  setBill(g, r, B);
  let v = s;
  if (LIFT[t] !== undefined) v = copy(s, { z: 0 });
  if (t === 'claw' || t === 'streaks') v = copy(v, { angle: screenAngle(r, s.x, s.y, h, s.angle || 0, B) });
  else if (t === 'gatling' || t === 'barrier') {
    const f = s.follow ? s.follow.facing : s.angle || 0;
    v = copy(s, { follow: null, angle: screenAngle(r, s.x, s.y, 0.8, f, B) });
  } else if (t === 'ghost' && s.pose) {
    // afterimages turn with the camera like the character sprites do
    v = copy(s, { pose: { ...s.pose, facing: (s.pose.facing || 0) - (r.yaw || 0) - Math.PI / 2 } });
  }
  drawShapeLayer(g, v, t === 'ghost' ? 'ground' : 'air', k, 1, c);
}

function ring3d(g, r, s, k, c) {
  const e = s.ease === 'lin' ? k : 1 - (1 - k) * (1 - k);
  const rad = s.r0 + (s.r1 - s.r0) * e;
  if (rad <= 0.01) return;
  const alpha = (1 - k);
  // rounder rings are air rings (around a fist, a muzzle): upright, facing the camera
  if ((s.flat ?? 0.62) >= 0.75) {
    const B = bill(r, s.x, s.y, s.z ?? 0.4);
    if (!B || !onScreen(r, B, B.sc * rad + 40)) return;
    setBill(g, r, B);
    drawShapeLayer(g, copy(s, { z: 0 }), 'air', k, 1, c);
    return;
  }
  // flatter ones are shockwaves: rebuilt on the ground from projected points
  const h = Math.min(s.z ?? 0.4, 0.12);
  const n = Math.max(16, Math.min(56, Math.round(rad * 10)));
  const wob = s.wobble ? (th) => s.wobble * (1 - k) * Math.sin(th * (s.lobes || 9) + c.t * 40) : null;
  const runs = ringRuns(r, circlePts(s.x, s.y, rad, h, n, 0, TAU, wob));
  if (!runs.length) return;
  g.globalCompositeOperation = s.add ? 'lighter' : 'source-over';
  if (s.fill && runs.length === 1 && runs[0].length > n) fillRuns(g, r, runs, s.fill === true ? s.color : s.fill, alpha * 0.22);
  strokeRuns(g, r, runs, s.width * (1 - k * 0.6), s.color, alpha);
  if (!s.noCore) strokeRuns(g, r, runs, s.width * 0.3 * (1 - k), '#ffffff', alpha * 0.7);
}

function tele3d(g, r, s, k, c) {
  const col = s.color || 'rgba(255,60,60,1)';
  const pulse = 0.5 + 0.5 * Math.sin(c.t * 22);
  const h = 0.04;
  let outline, inner;
  if (s.shape === 'circle') {
    outline = circlePts(s.x, s.y, s.r, h, 40);
    inner = circlePts(s.x, s.y, s.r * easeOut(k), h, 32);
  } else if (s.shape === 'arc') {
    const a0 = s.angle - s.arc / 2, a1 = s.angle + s.arc / 2;
    outline = [[s.x, s.y, h], ...circlePts(s.x, s.y, s.r, h, 24, a0, a1), [s.x, s.y, h]];
    inner = [[s.x, s.y, h], ...circlePts(s.x, s.y, s.r * easeOut(k), h, 18, a0, a1), [s.x, s.y, h]];
  } else if (s.shape === 'line') {
    const ca = Math.cos(s.angle), sa = Math.sin(s.angle), hw = s.width / 2;
    const rect = (L) => {
      const pts = [];
      const n = Math.max(2, Math.ceil(L / 1.5));
      for (let i = 0; i <= n; i++) { const u = (i / n) * L; pts.push([s.x + ca * u + sa * hw, s.y + sa * u - ca * hw, h]); }
      for (let i = n; i >= 0; i--) { const u = (i / n) * L; pts.push([s.x + ca * u - sa * hw, s.y + sa * u + ca * hw, h]); }
      pts.push(pts[0]);
      return pts;
    };
    outline = rect(s.length); inner = rect(s.length * easeOut(k));
  } else return;
  const R1 = ringRuns(r, outline), R2 = ringRuns(r, inner);
  if (!R1.length) return;
  fillRuns(g, r, R1, col, 0.1 + 0.12 * k);
  fillRuns(g, r, R2, col, 0.3 + 0.35 * k);
  strokeRuns(g, r, R1, 0.05 + 0.04 * k, col, 0.55 + 0.4 * pulse * k);
}

function dome3d(g, r, s, layer, c) {
  const grow = easeOut(Math.min(1, (s.age || 0) / 0.35));
  const R = s.r * grow;
  if (R < 0.05) return;
  const col = s.color || '#ffffff';
  if (layer === 'ground') {
    const runs = ringRuns(r, circlePts(s.x, s.y, R, 0.04, 48));
    if (runs.length === 1 && runs[0].length > 40) fillRuns(g, r, runs, col, 0.1);
    strokeRuns(g, r, runs, 0.06, col, 0.7);
    return;
  }
  const H = R * (s.hk ?? 0.55) * 1.6;
  g.globalCompositeOperation = 'lighter';
  // meridians (Birdcage strings, or the Room's lines) and a few parallels
  const nM = s.kind === 'cage' ? 16 : 10;
  for (let i = 0; i < nM; i++) {
    const th = (i / nM) * TAU + (s.kind === 'room' ? c.t * 0.15 : 0);
    const pts = [];
    for (let j = 0; j <= 10; j++) {
      const ph = (j / 10) * (Math.PI / 2);
      pts.push([s.x + Math.cos(th) * Math.cos(ph) * R, s.y + Math.sin(th) * Math.cos(ph) * R, Math.sin(ph) * H]);
    }
    strokeRuns(g, r, ringRuns(r, pts), s.kind === 'cage' ? 0.03 : 0.025, col, s.kind === 'cage' ? 0.75 : 0.35);
  }
  for (const f of [0.35, 0.7]) {
    const rr = R * Math.cos(f * Math.PI / 2), hh = Math.sin(f * Math.PI / 2) * H;
    strokeRuns(g, r, ringRuns(r, circlePts(s.x, s.y, rr, hh, 36)), 0.025, col, 0.3);
  }
  g.globalCompositeOperation = 'source-over';
}

function zone3d(fx, g, r, s, layer, k, c) {
  const R = s.r * easeOut(Math.min(1, (s.age || 0) / 0.3));
  if (R < 0.05) return;
  const col = s.color || '#ffffff';
  const zA = s.endT !== undefined ? Math.max(0, s.endT / 0.35) : 1;
  if (layer === 'ground') {
    const n = Math.max(24, Math.min(64, Math.round(R * 8)));
    const runs = ringRuns(r, circlePts(s.x, s.y, R, 0.04, n));
    if (!runs.length) return;
    const whole = runs.length === 1 && runs[0].length > n;
    const fillCol = s.kind === 'dark' ? '#12001c' : s.kind === 'ice' ? '#e1f5fe' : col;
    if (whole) fillRuns(g, r, runs, fillCol, (s.kind === 'dark' ? 0.45 : 0.18) * zA);
    strokeRuns(g, r, runs, 0.06, s.kind === 'dark' ? '#7e57c2' : col, 0.55 * zA);
    if (s.kind === 'gravity' || s.kind === 'dark' || s.kind === 'storm') {
      // rings rippling inward
      for (let i = 0; i < 3; i++) {
        const ph = (c.t * 0.9 + i / 3) % 1;
        strokeRuns(g, r, ringRuns(r, circlePts(s.x, s.y, R * (1 - ph), 0.04, 32)), 0.04, s.kind === 'dark' ? '#b388ff' : col, 0.45 * ph * zA);
      }
    }
    return;
  }
  // air: the kind's upright visuals over the centre (a storm cloud, a funnel, the cage)
  if (s.kind === 'cage') { dome3d(g, r, { ...s, r: R, age: 9, hk: 0.6 }, 'air', c); return; }
  if (s.kind === 'thunder') {
    const B = bill(r, s.x, s.y, 4.5 + R * 0.3);
    if (!B) return;
    setBill(g, r, B);
    drawShapeLayer(g, { ...s, type: 'cloud', r: Math.max(1.4, R * 0.9), z: 0, color: '#37474f' }, 'air', 0, 1, c);
    return;
  }
  if (s.kind === 'storm' || s.kind === 'arms' || s.kind === 'gravity' || s.kind === 'field') {
    if (r.firstPerson) {
      const p = fx.game.player, w = fx.game.world;
      if (p && Math.hypot(w.dx(p.x, s.x), s.y - p.y) < 1.2) return;
    }
    const B = bill(r, s.x, s.y, 0);
    if (!B) return;
    setBill(g, r, B);
    drawShapeLayer(g, s, 'air', k, 1, c);
  }
}

function beam3d(g, r, s, k, c) {
  const ext = easeOut(Math.min(1, k * 6));
  const L = (s.length || 0) * ext;
  if (L < 0.05) return;
  const h = s.z ?? 0.7;
  const x1 = s.x + Math.cos(s.angle) * L, y1 = s.y + Math.sin(s.angle) * L;
  const seg = clipSeg(r, s.x, s.y, h, x1, y1, h);
  if (!seg || !seg.A || !seg.B) return;
  const A = seg.A, B = seg.B;
  const sc = (A.sc + B.sc) / 2;
  const Ls = Math.hypot(B.x - A.x, B.y - A.y);
  const d = r.dpr;
  g.setTransform(sc * d, 0, 0, sc * d, A.x * d, A.y * d);
  drawShapeLayer(g, copy(s, { z: 0, angle: Math.atan2(B.y - A.y, B.x - A.x), length: (Ls / sc) / Math.max(0.01, ext) }), 'air', k, 1, c);
}

function seg3d(g, r, s, k, c) {
  let x0 = s.x, y0 = s.y, h0, h1;
  const x1 = s.x1, y1 = s.y1;
  if (s.type === 'bolt') { h0 = s.z0 ?? 0.8; h1 = s.z1 ?? 0.8; }
  else if (s.type === 'cutline') { h0 = h1 = s.z ?? 0.7; }
  else { h0 = 1.0; h1 = 0.8; }
  const w = c.fx.game.world;
  const X1 = x0 + w.dx(x0, x1);
  const seg = clipSeg(r, x0, y0, h0, X1, y1, h1);
  if (!seg || !seg.A || !seg.B) return;
  const A = seg.A, B = seg.B;
  const sc = (A.sc + B.sc) / 2;
  const d = r.dpr;
  g.setTransform(sc * d, 0, 0, sc * d, A.x * d, A.y * d);
  const rel = [(B.x - A.x) / sc, (B.y - A.y) / sc];
  const c2 = { ...c, rel: () => rel };
  if (s.type === 'strings') {
    // the drawer lifts its ends by 1.0 and 0.8 itself
    const rel2 = [rel[0], rel[1] + 0.2];
    drawShapeLayer(g, s, 'air', k, 1, { ...c, rel: () => rel2 });
    return;
  }
  drawShapeLayer(g, copy(s, { z: 0, z0: 0, z1: 0 }), 'air', k, 1, c2);
}

/** All shapes, ground layer first (the 3D view has no separate underlay pass). */
export function drawShapes3d(fx, g, r) {
  const c = fx.shapeCtx(r);
  for (const layer of ['ground', 'air']) {
    for (const s of fx.shapes) {
      if (s.delay > 0) continue;
      const k = s.max > 0 ? Math.min(1, Math.max(0, 1 - s.life / s.max)) : 0;
      c.s = s;
      g.save();
      try { drawShape3d(fx, g, r, s, layer, k, c); } catch (e) { s.life = 0; if (!fx._warned3) { fx._warned3 = true; console.warn('fx3d shape', s.type, e); } }
      g.restore();
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------ particles & numbers
/** Particles as depth-scaled billboards; velocity streaks follow the projected motion. */
export function drawParticles3d(fx, g, r, additive, drawPart) {
  const d = r.dpr;
  for (const p of fx.parts) {
    if (!!p.add !== additive) continue;
    const B = bill(r, p.x, p.y, p.z);
    if (!B || !onScreen(r, B, 60)) continue;
    let vx = 0, vy = 0;
    if (p.kind === 'spark' || p.kind === 'line' || p.kind === 'drop') {
      const q = r.project(p.x + p.vx * 0.05, p.y + p.vy * 0.05, p.z + p.vz * 0.05);
      if (q[0] > CULL) { vx = (q[0] - B.x) / (0.05 * B.sc); vy = (q[1] - B.y) / (0.05 * B.sc); }
    }
    g.setTransform(B.sc * d, 0, 0, B.sc * d, B.x * d, B.y * d);
    drawPart(g, p, vx, vy);
  }
}

/** Where a floating text sits on screen: [x, y, px-per-metre for its font]. */
export function textPlace3d(r, t) {
  const h = t.dmg ? t.oy + t.z : t.z;
  const a = r.project(t.x, t.y, h);
  if (a[0] < CULL) return null;
  const b = r.project(t.x, t.y, h + 1);
  if (b[0] < CULL) return null;
  const sc = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (sc > MAX_SC * 1.5) return null;
  // near numbers don't blow up, far ones stay readable
  return [a[0], a[1], Math.max(26, Math.min(56, sc * 0.55))];
}

// ------------------------------------------------------------------ first person
const SMEAR = {
  // straight strikes: a streak from the striking side toward the crosshair
  jab: 'straight', cross: 'straight', shigan: 'straight', shigan2: 'straight', pistol: 'straight', thrust: 'straight', palm: 'straight', palm2: 'straight',
  palm_double: 'straight', stab: 'straight', staff_jab: 'straight', dual_stab: 'straight', rocket: 'straight', headbutt: 'straight', knee: 'straight',
  flying_kick: 'straight', charge: 'straight', bazooka: 'straight', grab: 'straight', grab2: 'straight', point: 'straight',
  // sweeping arcs across the view
  hook: 'across', haymaker: 'across', claw: 'down', claw2: 'up', claw_x: 'down', chop: 'down', chop2: 'up', slash: 'down', slash2: 'up', slash3: 'across',
  cleave: 'down', iai: 'across', dual1: 'down', dual2: 'down', dual3: 'up', dualx: 'down', tora: 'down', bladespin: 'across', axe: 'down', axe2: 'up',
  staff: 'down', staff2: 'up', rise_slash: 'rise', uppercut: 'rise', rise_kick: 'rise', axe_slam: 'slam', axe_kick: 'slam', stomp: 'slam', slam: 'slam',
  // kicks sweep low
  kick: 'low', kick_high: 'across', kick_low: 'low', kick_spin: 'low', sweep: 'low', mouton: 'low', ballet_kick: 'low', pirouette: 'low', jete: 'low',
  arabesque: 'low', handstand: 'low',
  gatling: 'flurry', shoot: 'shot', aim: 'shot', flick: 'shot', throw: 'straight',
};
function smearPath(kind, side, sweep) {
  // quadratic curves in normalised screen space (0..1 of width / height), tail → head
  const q = (x0, y0, cx, cy, x1, y1) => (u) => {
    const v = 1 - u;
    return [v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1];
  };
  const m = side; // +1 right hand / foot, -1 left
  switch (kind) {
    case 'straight': return q(0.5 + m * 0.24, 1.02, 0.5 + m * 0.1, 0.74, 0.5, 0.53);
    case 'rise': return q(0.56, 1.02, 0.7, 0.55, 0.47, 0.16);
    case 'slam': return q(0.45, 0.06, 0.66, 0.44, 0.5, 0.98);
    case 'low': return sweep >= 0 ? q(0.97, 0.92, 0.5, 0.6, 0.03, 0.88) : q(0.03, 0.92, 0.5, 0.6, 0.97, 0.88);
    case 'up': return q(0.18, 0.84, 0.32, 0.3, 0.84, 0.22);
    case 'down': return q(0.82, 0.18, 0.68, 0.72, 0.18, 0.8);
    default: return (m * (sweep || 1)) >= 0 ? q(0.9, 0.5, 0.5, 0.8, 0.1, 0.56) : q(0.1, 0.5, 0.5, 0.8, 0.9, 0.56);
  }
}
function clipOfPlayer(p, act) {
  if (!act.clip) {
    const wpn = p.weapon ? { kind: p.weapon.kind, count: p.weapon.count || 1, gun: gunKind(p.weapon) } : null;
    act.clip = actionClip(act.def, p, stanceFor(p.style, wpn));
  }
  return act.clip;
}

/** A light screen-space smear for the player's own swing (first person only). */
function swingSmear(fx, g, r, p) {
  const act = p.action;
  if (!act || !act.def || p.state !== 'idle') return;
  const def = act.def;
  const src = def.source || '';
  const melee = def.m1Chain || src.startsWith('style') || (def.steps || []).some((s) => s.hit && !s.proj);
  if (!melee) return;
  const clip = clipOfPlayer(p, act);
  const kind = SMEAR[clip.name];
  if (!kind) return;
  const t = act.t;
  const t0 = clip.trailFrom, t1 = Math.max(t0 + 0.05, clip.trailTo);
  if (t < t0 || t > t1 + 0.12) return;
  const vis = actorVisuals(p, act, clip) || {};
  const heavy = (def.steps || []).some((st) => (st.hit && st.hit.heavy) || (st.dash && st.dash.hit && st.dash.hit.heavy));
  const blade = clip.weapon === 'sword' || clip.weapon === 'axe' || clip.weapon === 'staff';
  const col = vis.blade || (vis.fx && vis.fx.color) || (blade ? '#e3f2fd' : '#ffffff');
  const W = r.cw * r.dpr, H = r.ch * r.dpr;
  const side = (clip.limb === 'hB' || clip.limb === 'fB' || clip.limb === 'wB') ? -1 : 1;
  const fade = t > t1 ? 1 - (t - t1) / 0.12 : 1;
  const u = clamp01((t - t0) / (t1 - t0));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'lighter';
  if (kind === 'flurry' || (clip.flurry && t >= clip.flurry.t0 && t <= clip.flurry.t1)) {
    // a few quick jabs converging on the crosshair
    const n = 3;
    for (let i = 0; i < n; i++) {
      const ph = (t * 11 + i / n) % 1;
      const seed = Math.floor(t * 11 + i / n) * 7 + i;
      const sx = 0.5 + (((seed * 0.618) % 1) - 0.5) * 0.5, sy = 0.95;
      const ex = 0.5 + (((seed * 0.377) % 1) - 0.5) * 0.16, ey = 0.5 + (((seed * 0.271) % 1) - 0.5) * 0.12;
      const k2 = Math.sin(ph * Math.PI);
      g.globalAlpha = 0.45 * k2 * fade; g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = H * 0.012;
      g.beginPath(); g.moveTo((sx + (ex - sx) * ph * 0.5) * W, (sy + (ey - sy) * ph * 0.5) * H); g.lineTo((sx + (ex - sx) * ph) * W, (sy + (ey - sy) * ph) * H); g.stroke();
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return;
  }
  if (kind === 'shot') {
    if (t < (def.windup ?? 0.1) || t > (def.windup ?? 0.1) + 0.08) return;
    const k2 = 1 - (t - (def.windup ?? 0.1)) / 0.08;
    const x = 0.62 * W, y = 0.8 * H;
    g.globalAlpha = 0.8 * k2; g.fillStyle = '#fff59d';
    g.beginPath(); g.arc(x, y, H * 0.03 * (1 + (1 - k2)), 0, TAU); g.fill();
    g.globalAlpha = 0.5 * k2; g.strokeStyle = '#ffe082'; g.lineWidth = H * 0.006;
    g.beginPath(); g.moveTo(x, y); g.lineTo(0.5 * W, 0.5 * H); g.stroke();
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return;
  }
  const P = smearPath(kind, side, clip.sweep || 1);
  const head = easeOut(u), tail = kind === 'straight' ? Math.max(0, head - 0.55) : clamp01((u - 0.2) / 0.8) ** 2;
  if (head - tail < 0.02) return;
  const wMax = H * (kind === 'straight' ? 0.026 : blade ? 0.042 : 0.032) * (heavy ? 1.35 : 1);
  const N = 22;
  const outer = [], inner = [], mid = [];
  for (let i = 0; i <= N; i++) {
    const v = tail + (head - tail) * (i / N);
    const [x, y] = P(v);
    const [x2, y2] = P(Math.min(1, v + 0.01));
    const [x0, y0] = P(Math.max(0, v - 0.01));
    const dx = (x2 - x0) * W, dy = (y2 - y0) * H, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const qq = i / N;
    const wd = wMax * Math.pow(qq, 0.75) * (1 - 0.35 * Math.pow(qq, 8));
    outer.push([x * W + nx * wd * 0.5, y * H + ny * wd * 0.5]);
    inner.push([x * W - nx * wd * 0.5, y * H - ny * wd * 0.5]);
    mid.push([x * W + nx * wd * 0.22, y * H + ny * wd * 0.22]);
  }
  const a = Math.min(1, 0.8 + (heavy ? 0.15 : 0)) * fade;
  // body: the style colour fading in from the tail (drawn normally so it reads on bright skies too)
  g.globalCompositeOperation = 'source-over';
  const gr = g.createLinearGradient(outer[0][0], outer[0][1], outer[N][0], outer[N][1]);
  gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.55, rgba(col, 0.35 * a)); gr.addColorStop(1, rgba(col, 0.75 * a));
  g.globalAlpha = 1; g.fillStyle = gr;
  g.beginPath(); g.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i <= N; i++) g.lineTo(outer[i][0], outer[i][1]);
  for (let i = N; i >= 0; i--) g.lineTo(inner[i][0], inner[i][1]);
  g.closePath(); g.fill();
  // a thin darker rim on the outside edge, and a white-hot core toward the head
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = rgba(col === '#ffffff' ? '#90a4ae' : col, 1); g.lineWidth = Math.max(1, H * 0.0025);
  g.globalAlpha = 0.45 * a;
  g.beginPath(); for (let i = Math.floor(N * 0.3); i <= N; i++) { if (i === Math.floor(N * 0.3)) g.moveTo(outer[i][0], outer[i][1]); else g.lineTo(outer[i][0], outer[i][1]); } g.stroke();
  g.strokeStyle = '#ffffff';
  for (let i = Math.floor(N * 0.4); i < N; i++) {
    const qq = i / N;
    g.globalAlpha = a * qq * qq;
    g.lineWidth = Math.max(1, wMax * 0.28 * qq);
    g.beginPath(); g.moveTo(mid[i][0], mid[i][1]); g.lineTo(mid[i + 1][0], mid[i + 1][1]); g.stroke();
  }
  // speed lines behind a straight strike
  if (kind === 'straight' && u < 1) {
    g.lineWidth = Math.max(1, H * 0.003); g.globalAlpha = 0.5 * a;
    const [hx, hy] = P(head);
    g.beginPath();
    for (let i = -1; i <= 1; i++) { g.moveTo(hx * W + i * H * 0.022, hy * H + H * 0.06); g.lineTo(hx * W + i * H * 0.034, hy * H + H * 0.15); }
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}

/** Edge vignettes: the player's aura, and a flash on the side a hit came from. */
function edges(fx, g, r, p) {
  const W = r.cw * r.dpr, H = r.ch * r.dpr;
  const aura = (p.buffs || []).find((b) => b.aura)?.aura || (p.conquerorInfused ? 'rgba(20,0,20,0.9)' : null);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (aura) {
    const pulse = 0.14 + 0.05 * Math.sin(fx.time * 7);
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.55);
    gr.addColorStop(0, rgba(aura, 0)); gr.addColorStop(1, rgba(aura, pulse * 2.2));
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  const hf = p.hitFx;
  const since = hf ? fx.game.env.time - hf.t0 : 9;
  if (hf && since >= 0 && since < 0.35) {
    // the hit came from the opposite of its knockback: place the flash on that side of the view
    const from = (hf.ang ?? 0) + Math.PI;
    const rel = from - (r.yaw || 0);
    const cx = W / 2 + Math.sin(rel) * W * 0.55, cy = H / 2 - Math.cos(rel) * H * 0.55;
    const k = (1 - since / 0.35) * Math.min(1, 0.5 + (hf.w || 0.5));
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
    gr.addColorStop(0, `rgba(255,40,30,${0.42 * k})`); gr.addColorStop(1, 'rgba(255,40,30,0)');
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
}

/** Screen-space extras that only make sense from behind the player's eyes. */
export function drawFirstPerson(fx, g, r) {
  const p = fx.game.player;
  if (!p || !r.firstPerson || p.mode === 'sail') return;
  try {
    edges(fx, g, r, p);
    swingSmear(fx, g, r, p);
  } catch (e) { if (!fx._warnedFp) { fx._warnedFp = true; console.warn('fx3d first person', e); } }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
