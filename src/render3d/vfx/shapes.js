// Every fx shape type (see render/fxshapes.js for the 2D drawers and
// render/combatfx.js for who spawns what) as 3D. Each handler reads the
// shape's own fields — the same ones the 2D drawer uses — and lays down
// sprites, ribbons, surfaces, shells, tubes and solids for this frame.
// The anime language throughout: a white-hot core inside a coloured rim,
// crisp edges, a fast attack and a slower fade, and a bit of everything
// flung outward on the heavy moments (shock rings, speed lines, debris).
// The rules (colours by element, timing, erosion, budgets) are written down
// in docs/VFX.md: a handler that breaks them is the one that's wrong.
//
// Heights: a shape's `z` is metres over the ground at its spot (as in the
// 2D overlay). Directions: `angle` is atan2(dy, dx) on the ground plane,
// and the 3D view maps world x → x, world y → z.
import { col, luma, hash, easeOut, clamp01, TAU } from './kit.js';
import { SK } from './sprites.js';
import { RK, RM } from './ribbons.js';
import { SF, ZK } from './surfaces.js';
import { VK, TK } from './volumes.js';
import { OK, putAlong } from './solids.js';

const WHITE = col('#ffffff');
const PI = Math.PI;

// scratch (no garbage a frame)
const A = new Float32Array(3), B = new Float32Array(3), Cc = new Float32Array(3), D = new Float32Array(3);
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v; }
function cross3(o, a, b) { const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]; o[0] = x; o[1] = y; o[2] = z; return o; }
/** Two unit vectors at right angles to unit d. */
function perp(d, p1, p2) {
  if (Math.abs(d[1]) < 0.95) { p1[0] = 0; p1[1] = 1; p1[2] = 0; } else { p1[0] = 1; p1[1] = 0; p1[2] = 0; }
  cross3(p2, d, p1); norm3(p2);
  cross3(p1, p2, d); norm3(p1);
}

export const SHAPES = {};

// ------------------------------------------------------------------ impacts
/**
 * The hit star: an inked spiky burst with a white-hot heart and a glow the
 * bloom catches, a shock ring flung out across the line of the blow, and
 * speed lines bursting outward round it.
 */
SHAPES.impact = {
  draw(v, s, k, a) {
    const z = s.z ?? 0.7;
    if (v.onSelf(s, z)) return;
    const grow = k < 0.25 ? easeOut(k / 0.25) : 1;
    const fade = (k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7) * a;
    if (fade <= 0.01) return;
    const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + z;
    const R = s.size * (0.5 + 0.8 * grow);
    const c = col(s.color || '#ffffff'), c2 = col(s.core || '#ffffff');
    // (the glow first: the inked star sits on top of it)
    const pull = v.pull;
    v.sprites.vel(v.sprites.put(SK.GLOW, X, Y, Z, R * 1.6, c, fade * 0.35 * (1 - k), c2, 1, 0, s.seed, k), 0, 0, 0, pull);
    const i = v.sprites.put(SK.BURST, X, Y, Z, R * 1.2, c, fade, c2, 0.55, (s.angle || 0) + s.seed, s.seed, k);
    v.sprites.vel(i, s.spikes || 9, 0, 0, pull);
    // the blow's line: the ring stands across it
    const ang = s.angle || 0;
    D[0] = Math.cos(ang); D[1] = 0; D[2] = Math.sin(ang);
    perp(D, A, B);
    const ek = easeOut(Math.min(1, k * 1.4));
    const rr = s.size * (0.35 + 1.5 * ek);
    v.planeRing(X + D[0] * 0.08, Y, Z + D[2] * 0.08, A[0], A[1], A[2], B[0], B[1], B[2], rr, s.size * 0.09 * (1 - k), c, fade * 0.9, c2, 0.6, 0.8, s.seed, k, 36);
    // speed lines bursting out, leaning the way the blow drives
    const n = s.lines ?? 5;
    for (let j = 0; j < n; j++) {
      const th = hash(s.seed + j * 17) * TAU;
      const lean = 0.25 + 0.5 * hash(s.seed + j * 5);
      Cc[0] = A[0] * Math.cos(th) + B[0] * Math.sin(th) + D[0] * lean;
      Cc[1] = A[1] * Math.cos(th) + B[1] * Math.sin(th) + D[1] * lean;
      Cc[2] = A[2] * Math.cos(th) + B[2] * Math.sin(th) + D[2] * lean;
      norm3(Cc);
      const r0 = R * (0.75 + 0.6 * k), r1 = R * (1.6 + 1.1 * hash(s.seed + j) + k * 1.1);
      const hw = Math.max(0.012, s.size * 0.05) * (1 - k * 0.6);
      v.ribbons.start(RK.LINE, RM.FACE, c, fade, c2, 0.7)
        .point(X + Cc[0] * r0, Y + Cc[1] * r0, Z + Cc[2] * r0, hw)
        .point(X + Cc[0] * (r0 + r1) * 0.5, Y + Cc[1] * (r0 + r1) * 0.5, Z + Cc[2] * (r0 + r1) * 0.5, hw * 0.8)
        .point(X + Cc[0] * r1, Y + Cc[1] * r1, Z + Cc[2] * r1, 0.002)
        .finish();
    }
  },
};

/** A four-point glint (crits, parries, muzzle flashes, light) with a soft glow behind it. */
SHAPES.flare = {
  draw(v, s, k, a) {
    const z = s.z ?? 0.7;
    if (v.onSelf(s, z)) return;
    const grow = k < 0.2 ? easeOut(k / 0.2) : 1;
    const fade = (1 - k) * a;
    const R = s.size * (0.4 + 0.6 * grow);
    const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + z;
    const c = col(s.color || '#fff59d');
    v.sprites.vel(v.sprites.put(SK.STAR, X, Y, Z, R * 1.25, c, fade, WHITE, 1, s.rot ?? (0.2 + k * 0.6), s.seed, k), 0, 0, 0, v.pull);
    v.sprites.vel(v.sprites.put(SK.GLOW, X, Y, Z, R * 0.6, c, fade * 0.4, WHITE, 1, 0, s.seed, k), 0, 0, 0, v.pull);
  },
};

/** Cracked air (Gura Gura): shattered-glass lines hanging in space, facing you, and a ripple of the air round them. */
SHAPES.aircrack = {
  draw(v, s, k, a) {
    const z = s.z ?? 0.8;
    if (v.onSelf(s, z)) return;
    const grow = easeOut(Math.min(1, k / 0.12));
    const fade = (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) * a;
    const R = s.size * grow * 1.1;
    if (R < 0.02) return;
    const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + z;
    const c = col(s.color || '#e0f7fa');
    const r = v.cr, u = v.cu;
    const n = s.n || 9;
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU + (hash(s.seed + i) - 0.5) * 0.5;
      const L = R * (0.6 + 0.5 * hash(s.seed + i * 3));
      v.ribbons.start(RK.LINE, RM.FACE, c, fade, WHITE, 0.6);
      v.ribbons.point(X, Y, Z, 0.035);
      for (let j = 1; j <= 3; j++) {
        const rr = (L * j) / 3, o = (hash(s.seed + i * 7 + j) - 0.5) * 0.5;
        const cs = Math.cos(th + o) * rr, sn = Math.sin(th + o) * rr;
        v.ribbons.point(X + r[0] * cs + u[0] * sn, Y + r[1] * cs + u[1] * sn, Z + r[2] * cs + u[2] * sn, 0.032 * (1.1 - j * 0.25));
      }
      v.ribbons.finish();
      // the shard edges between the radial cracks
      const th2 = th + TAU / n, r2 = L * 0.55;
      const c1 = Math.cos(th) * r2, s1 = Math.sin(th) * r2, c3 = Math.cos(th2) * r2 * 0.95, s3 = Math.sin(th2) * r2 * 0.95;
      v.ribbons.start(RK.LINE, RM.FACE, c, fade * 0.85, WHITE, 0.6)
        .point(X + r[0] * c1 + u[0] * s1, Y + r[1] * c1 + u[1] * s1, Z + r[2] * c1 + u[2] * s1, 0.022)
        .point(X + r[0] * c3 + u[0] * s3, Y + r[1] * c3 + u[1] * s3, Z + r[2] * c3 + u[2] * s3, 0.022)
        .finish();
    }
    v.sprites.put(SK.GLOW, X, Y, Z, R * 0.35, c, fade * 0.35, WHITE, 1, 0, s.seed, k);
    if (s.size > 1) v.shells.put(VK.BUBBLE, X, Y, Z, R * (0.7 + 0.5 * k), 0, 1, 0, 1, c, fade * 0.25, WHITE, 0.4, k, s.seed);
  },
};

/** Three parallel claw rakes across a spot, in the plane facing the blow. */
SHAPES.claw = {
  draw(v, s, k, a) {
    const z = s.z ?? 0.75;
    if (v.onSelf(s, z)) return;
    const reveal = easeOut(Math.min(1, k / 0.25));
    const fade = (k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6) * a;
    const ang = s.angle || 0, L = (s.size || 1) * 1.1;
    D[0] = Math.cos(ang); D[1] = 0; D[2] = Math.sin(ang);
    // across the blow, raked down at a slant
    const tl = s.tilt ?? 0.9;
    const ax = -D[2], az = D[0];
    const dirX = ax * Math.cos(tl), dirY = -Math.sin(tl), dirZ = az * Math.cos(tl);
    const n2x = ax * Math.sin(tl), n2y = Math.cos(tl), n2z = az * Math.sin(tl);
    const X = v.lx(s.x) - D[0] * 0.3, Z = v.lz(s.y) - D[2] * 0.3, Y = v.groundOf(s) + z;
    const c = col(s.color || '#ffffff');
    const n = s.n || 3;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * L * 0.22;
      const hw = 0.06 * (1 - Math.abs(off) / L);
      v.ribbons.start(RK.LINE, RM.FACE, c, fade, WHITE, 1);
      for (let j = 0; j <= 6; j++) {
        const t = (j / 6) * reveal, along = -L / 2 + L * t, bow = Math.sin(t * PI) * 0.08 * L;
        const px = X + dirX * along + n2x * (off + bow), py = Y + dirY * along + n2y * (off + bow), pz = Z + dirZ * along + n2z * (off + bow);
        v.ribbons.point(px, py, pz, hw * Math.sin(Math.min(1, (j + 0.5) / 6) * PI * 0.9 + 0.15));
      }
      v.ribbons.finish();
    }
  },
};

// ------------------------------------------------------------------ smears
/**
 * Weapon / limb smears: a crescent swept through the air round the striker —
 * the head sweeping from one side to the other, the tail chasing it, white
 * at the leading rim. It lies in a tilted plane (a diagonal cut reads from
 * any side), and is cupped like the cone a blade really sweeps.
 */
function smear(v, s, k, a) {
  const dir = s.dir || 1;
  const arc = s.arc || 1.6;
  const reveal = s.reveal ?? 0.28;
  const headK = reveal > 0 ? Math.min(1, k / reveal) : 1;
  const tailK = clamp01((k - reveal * 0.6) / (1 - reveal * 0.6));
  const head = -dir * arc / 2 + dir * arc * easeOut(headK);
  const tail = -dir * arc / 2 + dir * arc * tailK * tailK;
  if (Math.abs(head - tail) < 0.02) return;
  const fade = (1 - Math.pow(k, 2.2)) * a;
  if (fade < 0.01) return;
  const tilt = s.tilt ?? 0.72;
  // (the 2D heights are a top-down view's: blades and fists sweep at chest
  // height on a 3D body, low leg sweeps stay low)
  const z = (s.z ?? 0.6) + (tilt < 0.66 ? 0.05 : 0.42);
  // (bolder than the 2D band: a quarter to nearly half the radius across, like an anime slash)
  const R = s.radius || 1, W = Math.min(R * 0.45, Math.max((s.width || 0.2) * 2.6, R * 0.24));
  const ang = s.angle || 0;
  const fx = Math.cos(ang), fz = Math.sin(ang);
  // the plane of the sweep: its "side" axis rolled up out of the ground plane
  const roll = s.roll ?? (tilt >= 1 ? 1.25 : tilt < 0.66 ? 0.12 * dir : 0.45 * dir);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const sx = -fz * cr, sy = sr, sz = fx * cr;
  // its normal, turned upward: the inner edge rises along it, so the smear is
  // a shallow cone (a lampshade round the striker) that shows its face to a
  // camera above and behind as well as from the side
  cross3(N3, setv(F3, fx, 0, fz), setv(S3, sx, sy, sz));
  if (N3[1] < 0) { N3[0] = -N3[0]; N3[1] = -N3[1]; N3[2] = -N3[2]; }
  const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + z;
  const S = v.surf;
  const U = 22, V = 4;
  if (!S.room((U + 1) * V, U * (V - 1) * 2)) return;
  const c = col(s.color || '#ffffff'), c2 = col(s.core || '#ffffff');
  // (your own swing in first person sweeps right through the view: a little lighter)
  const own = v.fp && v.onSelf(s, 1);
  S.style(SF.SMEAR, c, fade * (own ? 0.75 : 1), c2, s.add === false ? 0.1 : 0.5, k, s.seed);
  const v0 = S.nv;
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    const th = tail + (head - tail) * u;
    const wv = W * Math.pow(u, 0.7) * (1 - 0.35 * Math.pow(u, 10));
    const ct = Math.cos(th), st = Math.sin(th);
    const ox = fx * ct + sx * st, oy = sy * st, oz = fz * ct + sz * st;
    for (let j = 0; j < V; j++) {
      const vv = SMEAR_V[j];
      const r = R - vv * wv;
      const cup = vv * (0.55 + 0.45 * vv) * wv * 0.95;
      S.vert(X + ox * r + N3[0] * cup, Y + oy * r + N3[1] * cup, Z + oz * r + N3[2] * cup, u, vv);
    }
  }
  // (rows of V along each u: lay the grid as V columns × U+1 rows)
  S.grid(v0, V, U + 1);
  // the leading edge again as a line facing the camera, so the cut reads
  // from any side (seen edge-on, the band itself is only a sliver)
  const R0 = v.ribbons;
  R0.start(RK.LINE, RM.FACE, c, fade * (own ? 0.6 : 0.95), c2, s.add === false ? 0.2 : 0.85);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, th = tail + (head - tail) * u;
    const ct = Math.cos(th), st = Math.sin(th);
    R0.point(X + (fx * ct + sx * st) * R, Y + sy * st * R, Z + (fz * ct + sz * st) * R, Math.max(0.012, W * 0.1) * Math.pow(u, 0.8) * (1 - 0.6 * Math.pow(u, 12)));
  }
  R0.finish();
}
const N3 = new Float32Array(3), F3 = new Float32Array(3), S3 = new Float32Array(3);
// rows across a smear: the glow outside its rim, the rim, the middle, the inner edge
const SMEAR_V = [-0.35, 0, 0.5, 1];
function setv(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
SHAPES.crescent = { draw: smear };
SHAPES.slash = { draw(v, s, k, a) { smear(v, s, k, a); } };

/** A clean cut line appearing along a path (iai dashes: "the enemy falls behind you"); low ones gash the ground. */
SHAPES.cutline = {
  draw(v, s, k, a) {
    const w = v.world;
    const dx = w.dx(s.x, s.x1), dy = s.y1 - s.y, L = Math.hypot(dx, dy);
    if (L < 0.05) return;
    const reveal = easeOut(Math.min(1, k / 0.18));
    const fade = (k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65) * a;
    const z = s.z ?? 0.7, off = s.off || 0;
    const nx = -dy / L, ny = dx / L;
    const x0 = s.x + nx * off - dx * 0.15, y0 = s.y + ny * off - dy * 0.15;
    const span = reveal * 1.3;
    const c = col(s.color || '#e3f2fd');
    const ground = z < 0.15;
    const n = Math.max(2, Math.min(24, Math.ceil(L * span * 1.5)));
    const hw = (ground ? 0.13 : 0.065) * (1 - k * 0.5);
    for (let pass = 0; pass < (ground ? 2 : 1); pass++) {
      // (a gash in the ground: a glowing furrow, and a dark slit down it)
      if (pass) v.ribbons.start(RK.CRACK, RM.FLAT, col('#1f1410'), fade, c, 0);
      else v.ribbons.start(RK.LINE, ground ? RM.FLAT : RM.FACE, c, fade, WHITE, 1);
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * span;
        const px = x0 + dx * t, py = y0 + dy * t;
        const taper = Math.min(1, Math.min(i, n - i) / 2 + 0.25);
        v.ribbons.point(v.lx(px), v.ground(px, py) + z + (ground ? 0.03 + pass * 0.01 : 0), v.lz(py), hw * taper * (pass ? 0.45 : 1));
      }
      v.ribbons.finish();
    }
    if (!ground) {
      // a thin dark slit along the middle of a gash in the air reads as a real cut
      v.sprites.put(SK.GLOW, v.lx(x0 + dx * span), v.ground(x0 + dx * span, y0 + dy * span) + z, v.lz(y0 + dy * span), 0.22, c, fade * (1 - reveal * 0.6), WHITE, 1);
    }
  },
};

/** Speed lines streaming behind a moving actor. */
SHAPES.streaks = {
  draw(v, s, k, a) {
    const fade = a * (1 - k) * 0.75;
    if (fade < 0.02) return;
    const ang = s.angle || 0, bx = -Math.cos(ang), bz = -Math.sin(ang);
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.ground(s.x, s.y);
    const c = col(s.color || '#ffffff');
    const t = Math.floor(v.time * 30);
    for (let i = 0; i < 7; i++) {
      const h = 0.25 + hash(s.seed + i) * 1.35, side = (hash(s.seed + i * 9) - 0.5) * 0.9;
      const x0 = 0.35 + hash(s.seed + i * 3 + t) * 0.4, x1 = x0 + 0.6 + hash(s.seed + i * 5) * 1.0;
      const px = X - bz * side, pz = Z + bx * side;
      if (v.fp && v.player === s.follow) continue;
      v.ribbons.start(RK.SPEED, RM.FACE, c, fade, c, 0.2)
        .point(px + bx * x0, G + h, pz + bz * x0, 0.018)
        .point(px + bx * x1, G + h, pz + bz * x1, 0.01)
        .finish();
    }
  },
};

// ------------------------------------------------------------------ rings
/**
 * Rings. Round ones (flat ≥ 0.75) are air rings round a fist or a muzzle:
 * a crisp ring facing you with a faint shock bubble. Flatter ones are
 * shockwaves along the ground: a band running over the ground and a wall of
 * pushed air standing up off it.
 */
SHAPES.ring = {
  draw(v, s, k, a) {
    const e = s.ease === 'lin' ? k : 1 - (1 - k) * (1 - k);
    const rad = s.r0 + (s.r1 - s.r0) * e;
    if (rad <= 0.01) return;
    const alpha = (1 - k) * a;
    if (alpha < 0.01) return;
    const c = col(s.color || '#ffffff');
    const dark = luma(c) < 0.06;
    // (a dark ring can't add light: it's inked on, whatever it asked for)
    const w = dark ? 0 : s.add ? 0.65 : 0.35;
    const core = s.noCore ? 0 : dark ? 0 : 0.75;
    const c2 = dark ? c : WHITE;
    const width = Math.max(0.03, (s.width || 0.15) * (1 - k * 0.6));
    if ((s.flat ?? 0.62) >= 0.75) {
      const z = s.z ?? 0.4;
      if (v.onSelf(s, z)) return;
      const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + z;
      const size = rad / 0.8 + width;
      const i = v.sprites.put(SK.RING, X, Y, Z, size, c, alpha, c2, w, 0, s.seed, k);
      v.sprites.vel(i, Math.min(0.5, width / size * 1.4), (s.wobble || 0) * (1 - k), s.lobes || 9, core);
      if (rad > 0.25 && !dark && !v.low) v.shells.put(VK.BUBBLE, X, Y, Z, rad * 0.92, 0, 1, 0, 1, c, alpha * 0.35, WHITE, 0.4, k, s.seed);
      return;
    }
    const R1 = Math.max(s.r0, s.r1) * (1 + (s.wobble || 0)) + width;
    const patch = v.patch(s, s.x, s.y, R1);
    // (the low setting keeps the band and drops the wall)
    const wh = v.low ? 0 : dark ? Math.min(1.2, 0.3 + width * 2.5) : Math.min(0.9, 0.12 + width * 2.4) * (1 - k * 0.4);
    v.groundRing(patch, s.x, s.y, rad, width * 0.5, c, alpha, c2, w, core, wh, dark ? 0.5 : 0.55, (s.wobble || 0) * (1 - k), s.lobes || 9, v.time * 40, s.seed, k);
    if (s.fill) {
      const fc = col(s.fill === true ? s.color : s.fill);
      v.decal(patch, s.x, s.y, rad, 0, SF.FILL, fc, alpha * 0.22, fc, w * 0.5, k, s.seed, 0, 0, 0, 6);
    }
  },
};

// ------------------------------------------------------------------ beams & lightning
const BEAM_CORE = { fire: '#fff3c4', light: '#ffffff', energy: '#ffffff', ice: '#ffffff', water: '#e1f5fe', wind: '#ffffff', gravity: '#ede7f6', quake: '#ffffff' };
/**
 * Beams: a tube of light from the caster along the aim — a soft outer glow
 * round a white-hot core, energy streaming down it — with a flare where it
 * leaves and a glow where it ends. Fire roils, darkness swallows light,
 * lightning crackles in jagged strands, strings fan out.
 */
SHAPES.beam = {
  draw(v, s, k, a) {
    const ext = easeOut(Math.min(1, k * 6));
    const L = (s.length || 0) * ext;
    if (L < 0.05) return;
    const fade = Math.min(1, (1 - k) * 1.6) * a;
    const z = s.z ?? 0.7;
    const style = s.style || 'energy';
    const flick = 0.82 + 0.18 * Math.sin(v.time * 55 + s.seed);
    const wd = (s.width || 0.6) * flick * (1 - k * 0.45);
    const ex = s.x + Math.cos(s.angle) * L, ey = s.y + Math.sin(s.angle) * L;
    const X0 = v.lx(s.x), Z0 = v.lz(s.y), Y0 = v.groundOf(s) + z;
    const X1 = v.lx(ex), Z1 = v.lz(ey), Y1 = v.ground(ex, ey) + z;
    D[0] = X1 - X0; D[1] = Y1 - Y0; D[2] = Z1 - Z0;
    const L3 = Math.hypot(D[0], D[1], D[2]);
    norm3(D);
    const c = col(s.color || '#ffffff'), c2 = col(s.core || BEAM_CORE[style] || '#ffffff');
    // (in first person your own beam starts at your chest: begin it a little way out)
    const st = v.fp && v.onSelf(s, z) ? Math.min(1.4, L3 * 0.5) : 0;
    const bx = X0 + D[0] * st, by = Y0 + D[1] * st, bz = Z0 + D[2] * st, BL = L3 - st;
    if (style === 'lightning') {
      perp(D, A, B);
      for (let i = 0; i < 3; i++) bolt(v, bx, by, bz, X1, Y1, Z1, wd * (i ? 0.22 : 0.32), wd * (i ? 0.55 : 0.8), s.seed + i * 31 + Math.floor(v.time * 25), c, fade, i ? 0 : 2);
      v.tubes.put(TK.BEAM, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.5, wd * 0.5, c, fade * 0.18, c2, 1, k, s.seed);
    } else if (style === 'string') {
      perp(D, A, B);
      if (!(c[0] > 0.5 && c[0] > c[2] * 1.6)) {
        for (let i = 0; i < 5; i++) {
          const sp = (i / 4 - 0.5) * wd;
          v.ribbons.start(RK.THIN, RM.FACE, c, fade, WHITE, 0.6)
            .point(bx + A[0] * sp * 0.3, by + A[1] * sp * 0.3, bz + A[2] * sp * 0.3, 0.014)
            .point(X1 + A[0] * sp, Y1 + A[1] * sp, Z1 + A[2] * sp, 0.012)
            .finish();
        }
        return;
      }
      // Overheat: a rope of strings heated red-hot, three strands twisting
      // round a glowing core, pinched at the ends, shedding embers
      v.tubes.put(TK.BEAM, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.2, wd * 0.26, c, fade * 0.85, ROPE_HOT, 0.8, k, s.seed);
      const n = Math.max(8, Math.min(40, Math.round(BL * 4)));
      for (let j = 0; j < 3; j++) {
        v.ribbons.start(RK.LINE, RM.FACE, c, fade, ROPE_HOT, 0.6);
        for (let i = 0; i <= n; i++) {
          const t = i / n, ph = (j * TAU) / 3 + t * BL * 4.5 - v.time * 14;
          const rr = wd * 0.3 * (0.45 + 0.55 * Math.sin(t * PI)), ca = Math.cos(ph) * rr, sa = Math.sin(ph) * rr;
          v.ribbons.point(bx + D[0] * BL * t + A[0] * ca + B[0] * sa, by + D[1] * BL * t + A[1] * ca + B[1] * sa, bz + D[2] * BL * t + A[2] * ca + B[2] * sa, wd * 0.09);
        }
        v.ribbons.finish();
      }
      for (let i = 0; i < 8; i++) {
        const t = hash(s.seed + i * 3 + Math.floor(v.time * 12)), up = ((v.time * 2 + hash(s.seed + i)) % 1) * 0.4;
        v.sprites.put(SK.EMBER, bx + D[0] * BL * t, by + D[1] * BL * t + up, bz + D[2] * BL * t, 0.035, ROPE_EMBER, fade, WHITE, 1, 0, s.seed + i, 0);
      }
    } else if (style === 'fire') {
      v.tubes.put(TK.FIRE, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.45, wd * 0.95, c, fade, c2, 0.6, k, s.seed);
      v.tubes.put(TK.BEAM, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.18, wd * 0.3, c2, fade * 0.9, c2, 1, k, s.seed + 3);
    } else if (style === 'dark') {
      v.tubes.put(TK.DARK, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.5, wd * 0.6, col('#12001c'), fade, col('#b388ff'), 0, k, s.seed);
    } else if (style === 'sand' || style === 'mochi') {
      v.tubes.put(TK.FUNNEL, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.45, wd * 0.6, c, fade, col(style === 'sand' ? '#fff3c4' : '#ffffff'), 0, k, s.seed);
    } else {
      v.tubes.put(TK.BEAM, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.62, wd * 0.72, c, fade * 0.8, c2, 0.6, k, s.seed);
      v.tubes.put(TK.BEAM, bx, by, bz, D[0], D[1], D[2], BL, wd * 0.2, wd * 0.24, c2, fade, c2, 0.9, k, s.seed + 5);
      if (style === 'quake') {
        perp(D, A, B);
        const n = Math.max(3, Math.round(L3 / 1.2));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const px = bx + D[0] * BL * t, py = by + D[1] * BL * t, pz = bz + D[2] * BL * t;
          v.planeRing(px, py, pz, A[0], A[1], A[2], B[0], B[1], B[2], wd * (0.7 + 0.3 * Math.sin(v.time * 30 + i)), 0.035, WHITE, fade * 0.8, WHITE, 1, 0.8, s.seed + i, k, 20);
        }
      }
    }
    if (!st) {
      v.sprites.put(SK.STAR, X0 + D[0] * 0.15, Y0 + D[1] * 0.15, Z0 + D[2] * 0.15, wd * 1.8, c, fade, WHITE, 1, v.time * 3, s.seed, k);
      v.sprites.put(SK.GLOW, X0, Y0, Z0, wd * 1.4, c, fade * 0.7, c2, 1, 0, s.seed, k);
    }
    v.sprites.put(SK.GLOW, X1, Y1, Z1, wd * 1.2, c, fade * 0.8, c2, 1, 0, s.seed, k);
  },
};

/**
 * One jagged lightning strand from (x0,y0,z0) to (x1,y1,z1) (local 3D),
 * zig-zagging in both directions across its line; `branches` forks off it.
 */
function bolt(v, x0, y0, z0, x1, y1, z1, hw, amp, seed, c, alpha, branches, c2 = WHITE) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
  if (L < 0.05) return;
  Cc[0] = dx / L; Cc[1] = dy / L; Cc[2] = dz / L;
  perp(Cc, A, B);
  const n = Math.max(5, Math.min(40, Math.ceil(L * 2.4)));
  const R = v.ribbons;
  // black lightning (Conqueror's Haki) can't add light: it's inked on, crackling
  // down its middle in the king's own colour (given as c2; red if none is)
  const black = luma(c) < 0.05;
  if (black && c2 === WHITE) c2 = HAKI_RED;
  const w = black ? 0 : 1;
  R.start(RK.GLOW, RM.FACE, c, alpha, c2, w);
  let bi = 0;
  const bt = BT;
  bt[0] = 0.3 + hash(seed + 1) * 0.2; bt[1] = 0.55 + hash(seed + 2) * 0.25; bt[2] = 0.75 + hash(seed + 3) * 0.15;
  for (let i = 0; i <= n; i++) {
    const t = i / n, env = Math.sin(t * PI);
    const j1 = (hash(seed + i * 7.3) - 0.5) * 2 * amp * env, j2 = (hash(seed + i * 3.7 + 11) - 0.5) * 2 * amp * env;
    const px = x0 + dx * t + A[0] * j1 + B[0] * j2, py = y0 + dy * t + A[1] * j1 + B[1] * j2, pz = z0 + dz * t + A[2] * j1 + B[2] * j2;
    R.point(px, py, pz, hw * (0.75 + 0.25 * env));
    // (forks are drawn after this strand: remember where)
    if (bi < branches && t >= bt[bi]) { FORK[bi * 3] = px; FORK[bi * 3 + 1] = py; FORK[bi * 3 + 2] = pz; bi++; }
  }
  R.finish();
  for (let b = 0; b < bi; b++) {
    const ba = hash(seed + b * 3) * TAU, bl = (0.35 + hash(seed + b * 5) * 0.6) * Math.min(2.5, L * 0.35);
    const fx = FORK[b * 3], fy = FORK[b * 3 + 1], fz = FORK[b * 3 + 2];
    const ex = fx + (Cc[0] * 0.6 + A[0] * Math.cos(ba) + B[0] * Math.sin(ba)) * bl, ey = fy + (Cc[1] * 0.6 + A[1] * Math.cos(ba) + B[1] * Math.sin(ba)) * bl, ez = fz + (Cc[2] * 0.6 + A[2] * Math.cos(ba) + B[2] * Math.sin(ba)) * bl;
    R.start(RK.GLOW, RM.FACE, c, alpha * 0.85, c2, w);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, j = (hash(seed + b * 13 + i * 5.1) - 0.5) * bl * 0.35 * Math.sin(t * PI);
      R.point(fx + (ex - fx) * t + A[0] * j, fy + (ey - fy) * t + B[1] * j, fz + (ez - fz) * t + A[2] * j, hw * 0.6 * (1 - t * 0.7));
    }
    R.finish();
  }
}
const FORK = new Float32Array(9), BT = new Float32Array(3);
const ROPE_HOT = col('#ffe0b2'), ROPE_EMBER = col('#ffab40');

/**
 * A crown of flame round a ball of fire: tongues licking out all round its
 * edge as the camera sees it (n of them, about R out from the centre).
 */
function crown(v, X, Y, Z, R, c, c2, alpha, seed, t, n, k = 0.15) {
  const cr = v.cr, cu = v.cu;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.sin(t * 1.7 + i * 1.7) * 0.12 + hash(seed + i) * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rr = R * (0.86 + 0.08 * hash(seed + i * 3));
    const sz = R * (0.32 + 0.16 * hash(seed + i * 5)) * (0.85 + 0.15 * Math.sin(t * 9 + i * 2.3));
    v.sprites.put(SK.FIRE, X + (cr[0] * ca + cu[0] * sa) * rr, Y + (cr[1] * ca + cu[1] * sa) * rr, Z + (cr[2] * ca + cu[2] * sa) * rr,
      sz, i % 3 ? c : DEEP_FIRE, alpha, c2, 0.5, a - PI / 2, seed + i * 7, k);
  }
}
const DEEP_FIRE = col('#ff5a12');
const HAKI_RED = col('#ff1744');
export { bolt, crown };

/** Lightning between two points (or out of the sky): jagged strands, forks, a flash where it strikes. */
SHAPES.bolt = {
  draw(v, s, k, a) {
    const fade = (1 - k) * a;
    if (fade < 0.01) return;
    const z0 = s.z0 ?? 0.8, z1 = s.z1 ?? 0.8;
    const w = v.world;
    const x1 = s.x + w.dx(s.x, s.x1);
    const X0 = v.lx(s.x), Z0 = v.lz(s.y), Y0 = v.groundOf(s) + z0;
    const X1 = v.lx(x1), Z1 = v.lz(s.y1), Y1 = v.ground(s.x1, s.y1) + z1;
    const c = col(s.color || '#fff176');
    const wd = s.width || 0.08;
    const seed = s.seed + Math.floor(v.time * 30);
    const L = Math.hypot(X1 - X0, Y1 - Y0, Z1 - Z0);
    const amp = Math.min(0.35 + (s.amp || 0), L * 0.2) * (L > 4 ? 1.6 : 1);
    // (`core`: what crackles down a black bolt's middle — a Conqueror's own colour)
    bolt(v, X0, Y0, Z0, X1, Y1, Z1, Math.max(0.05, wd * 2.4), amp, seed, c, fade, s.branches === 0 ? 0 : Math.min(3, s.branches || 2), s.core ? col(s.core) : WHITE);
    // a flash where it strikes the ground (or the target): small and brief
    v.sprites.put(SK.GLOW, X1, Y1, Z1, Math.min(0.8, Math.max(0.35, wd * 6)), c, fade * 0.7, WHITE, 1, 0, s.seed, k);
    if (z1 < 0.5 && L > 3) {
      const patch = v.patch(s, s.x1, s.y1, 1.5);
      v.decal(patch, s.x1, s.y1, 1.2, 0, SF.GLOW, c, fade * 0.5, WHITE, 0.7, k, s.seed, 0, 0, 0, 4);
    }
  },
};

/**
 * Two Conqueror's clashing (combatfx.js clashFx): from each king a strand of
 * black lightning cored in their colour drives at the other's, meeting in a
 * crackle that re-forks every few frames, and a rift of black lightning
 * splits the sky above the clash — up out of sight, its middle flickering
 * between the two colours. Holds while the clash lasts, then tears away.
 */
SHAPES.clash = {
  draw(v, s, k, a) {
    const fade = (k < 0.8 ? Math.min(1, k * 12) : (1 - k) / 0.2) * a;
    if (fade < 0.01) return;
    const w = v.world, G = v.groundOf(s);
    const X = v.lx(s.x), Z = v.lz(s.y), Y = G + 1.15;
    const cA = col(s.colA || '#ff1a3c'), cB = col(s.colB || '#a64dff'), K = INK_BLACK;
    const t = Math.floor(v.time * 22);
    const AX = v.lx(s.x + w.dx(s.x, s.ax)), AZ = v.lz(s.ay), BX = v.lx(s.x + w.dx(s.x, s.bx)), BZ = v.lz(s.by);
    for (let i = 0; i < 3; i++) {
      const j = (hash(s.seed + t * 3 + i) - 0.5) * 0.6, jy = (hash(s.seed + t * 5 + i) - 0.5) * 0.5;
      bolt(v, AX, Y - 0.1, AZ, X + j, Y + jy, Z - j, 0.14 - i * 0.03, 0.5, s.seed + t * 7 + i, K, fade, 1, cA);
      bolt(v, BX, Y - 0.1, BZ, X - j, Y - jy, Z + j, 0.14 - i * 0.03, 0.5, s.seed + t * 11 + i, K, fade, 1, cB);
    }
    // the rift splitting the sky
    const H = 30 * easeOut(Math.min(1, k * 4));
    const sway = (hash(s.seed + t) - 0.5) * 2.4;
    bolt(v, X, Y, Z, X + sway, Y + H, Z - sway * 0.5, 0.85, 3, s.seed + t * 13, K, fade, 3, t % 2 ? cA : cB);
    bolt(v, X, Y + 0.5, Z, X - sway * 0.7, Y + H * 0.8, Z + sway, 0.45, 2.2, s.seed + t * 17, K, fade * 0.9, 2, t % 2 ? cB : cA);
    bolt(v, X, Y + 1, Z, X + sway * 1.4, Y + H * 0.55, Z + sway * 0.8, 0.3, 1.6, s.seed + t * 19, K, fade * 0.85, 2, cA);
    // where the two meet: each colour's glow, under the ink
    v.sprites.put(SK.GLOW, X, Y, Z, 2.6, cA, fade * 0.5, WHITE, 1, 0, s.seed, k);
    v.sprites.put(SK.GLOW, X, Y + 0.1, Z, 2.0, cB, fade * 0.5, WHITE, 1, 0, s.seed + 1, k);
    const patch = v.patch(s, s.x, s.y, 3);
    v.decal(patch, s.x, s.y, 2.6, 0, SF.GLOW, t % 2 ? cA : cB, fade * 0.35, WHITE, 0.6, k, s.seed, 0, 0, 0, 4);
  },
};
const INK_BLACK = col('#000000');

/** Strings from a point to another (Parasite, Overheat, puppet strings): thin, taut, catching the light. */
SHAPES.strings = {
  draw(v, s, k, a) {
    const fade = (1 - k) * a;
    const w = v.world, n = s.n || 5;
    const x1 = s.x + w.dx(s.x, s.x1);
    const X0 = v.lx(s.x), Z0 = v.lz(s.y), Y0 = v.groundOf(s) + 1.0;
    const X1 = v.lx(x1), Z1 = v.lz(s.y1), Y1 = v.ground(s.x1, s.y1) + 0.8;
    const c = col(s.color || '#f8bbd0');
    const dx = X1 - X0, dz = Z1 - Z0, L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L;
    for (let i = 0; i < n; i++) {
      const sp = n > 1 ? (i / (n - 1) - 0.5) * 0.3 : 0;
      v.ribbons.start(RK.THIN, RM.FACE, c, fade, WHITE, 0.5);
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, sag = Math.sin(t * PI) * (0.1 + Math.sin(v.time * 6 + i) * 0.08);
        const spread = sp * (0.3 + 0.7 * t);
        v.ribbons.point(X0 + dx * t + px * spread, Y0 + (Y1 - Y0) * t + sag, Z0 + dz * t + pz * spread, 0.012);
      }
      v.ribbons.finish();
    }
  },
};

// ------------------------------------------------------------------ columns, domes, barriers, funnels, clouds
/** Pillars: light, fire, lightning, darkness, ice, water — rising out of a glow on the ground. */
SHAPES.pillar = {
  draw(v, s, k, a) {
    const grow = easeOut(Math.min(1, k / 0.15));
    const fade = Math.min(1, (1 - k) * 3) * a;
    if (fade < 0.01) return;
    const H = (s.h || 4) * grow, R = s.r * (0.6 + 0.4 * grow) * (1 - k * 0.3);
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    const c = col(s.color || '#ffffff'), c2 = col(s.core || '#ffffff');
    const kind = s.kind || 'light';
    if (kind === 'fire') {
      v.tubes.put(TK.FIRE, X, G - 0.1, Z, 0, 1, 0, H, R * 1.25, R * 0.55, c, fade, c2, 0.6, k, s.seed);
      v.tubes.put(TK.PILLAR, X, G, Z, 0, 1, 0, H * 0.8, R * 0.45, R * 0.2, c2, fade * 0.8, c2, 1, k, s.seed + 2);
    } else if (kind === 'dark') {
      v.tubes.put(TK.DARK, X, G - 0.1, Z, 0, 1, 0, H, R * 1.1, R * 0.7, c, fade, col(s.core || '#b388ff'), 0, k, s.seed);
    } else if (kind === 'lightning') {
      // a strike out of the sky: a bundle of jagged bolts re-forking every
      // few frames round a thin hot core, not a column of light (readable,
      // not a white-out); a shock ring racing out over the ground
      const t = Math.floor(v.time * 20);
      for (let i = 0; i < 5; i++) {
        const th = hash(s.seed + i * 3 + t) * TAU, rr = R * (0.1 + 0.6 * hash(s.seed + i + t));
        const th2 = th + (hash(s.seed + i * 7 + t) - 0.5) * 1.6, rr2 = R * 0.35 * hash(s.seed + i * 11 + t);
        bolt(v, X + Math.cos(th) * rr, G + H, Z + Math.sin(th) * rr, X + Math.cos(th2) * rr2, G + 0.05, Z + Math.sin(th2) * rr2,
          i ? 0.1 : 0.2, R * 0.55, s.seed + i * 17 + t, c, fade * (i ? 0.8 : 1), i < 2 ? 2 : 1);
      }
      v.tubes.put(TK.BEAM, X, G, Z, 0, 1, 0, H, R * 0.07, R * 0.05, c2, fade * 0.5, c2, 0.8, k, s.seed + 7);
      if (k < 0.7) {
        const rk = easeOut(k / 0.7), patch = v.patch(s, s.x, s.y, R * 3);
        v.groundRing(patch, s.x, s.y, R * (0.4 + 2.4 * rk), 0.04 + 0.12 * (1 - rk), c, fade * (1 - rk), WHITE, 1, 0.8, v.low ? 0 : 0.5 * (1 - rk), 0.5, 0, 9, 0, s.seed, rk);
      }
    } else {
      v.tubes.put(TK.PILLAR, X, G - 0.1, Z, 0, 1, 0, H, R * 1.35, R * 1.0, c, fade * 0.4, c2, 0.6, k, s.seed);
      v.tubes.put(TK.PILLAR, X, G - 0.1, Z, 0, 1, 0, H * 1.05, R * 0.34, R * 0.24, c2, fade * 0.85, c2, 0.85, k, s.seed + 7);
    }
    // the ground lit up round its foot (a strike of lightning only briefly
    // and tightly: the bolts are the thing to see, not a wash of light)
    const lt = kind === 'lightning', gr = lt ? R * 1.3 : R * 2.2;
    const patch = v.patch(s, s.x, s.y, gr);
    v.decal(patch, s.x, s.y, gr, 0, SF.GLOW, kind === 'dark' ? col('#4a148c') : c, fade * (kind === 'dark' ? 0.5 : lt ? 0.4 * (1 - k) : 0.75), c2, kind === 'dark' ? 0.3 : lt ? 0.6 : 1, k, s.seed, 0, 0, 0, 4);
  },
};

/** Domes (Room, Birdcage, frost domes): a hemisphere of light, lines over it, a bright ring where it meets the ground. */
SHAPES.dome = {
  draw(v, s, k, a) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.35));
    const R = s.r * grow;
    if (R < 0.05) return;
    if (s.kind === 'room') { room(v, s, R, a); return; }
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    const c = col(s.color || '#ffffff');
    const hk = (s.hk ?? 0.55) * 1.6;
    v.shells.put(VK.DOME, X, G, Z, R, 0, 1, 0, 1, c, a, WHITE, 0.35, s.kind === 'cage' ? 1 : 0, s.seed, hk);
    const patch = v.patch(s, s.x, s.y, R + 0.3);
    v.groundRing(patch, s.x, s.y, R, 0.07, c, a * 0.85, WHITE, 1, 0.6, 0, 0, 0, 9, 0, s.seed, 0);
  },
};

/**
 * The Room (Ope Ope): a translucent pale-blue dome where it was cast, a thin
 * bright rim round its skin and where it meets the ground, lines over it, a
 * faint square grid on its floor and a scan ring sweeping out across it.
 * Drawn for a 'dome' or a 'zone' of kind 'room', wherever the shape is
 * (a zone stays where it was put).
 */
function room(v, s, R, a) {
  const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
  const c = col(s.color || '#81d4fa');
  // (lines and rim a pale ice blue, the skin tinting what's inside rather than lighting it up)
  v.shells.put(VK.DOME, X, G, Z, R, 0, 1, 0, 1, c, a, ROOM_LINE, 0.2, 0, s.seed, (s.hk ?? 0.55) * 1.6);
  const patch = v.patch(s, s.x, s.y, R + 0.3);
  v.decal(patch, s.x, s.y, R, 0, SF.ZONE, c, a, WHITE, 0.3, 0, s.seed, ZK.room, 0, 0, 10);
  v.groundRing(patch, s.x, s.y, R, 0.07, c, a * 0.85, WHITE, 1, 0.6, 0, 0, 0, 9, 0, s.seed, 0);
  const ph = (v.time * 0.5) % 1;
  v.groundRing(patch, s.x, s.y, R * ph, 0.035, c, a * 0.45 * (1 - ph), WHITE, 1, 0.5, 0, 0, 0, 9, 0, s.seed, 0);
}

/** A hex-celled barrier wall curving round the front of an actor (Bari Bari). */
SHAPES.barrier = {
  draw(v, s, k, a) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.2));
    if (grow < 0.02) return;
    const f = s.follow ? s.follow.facing : s.angle || 0;
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    const c = col(s.color || '#b3e5fc');
    const S = v.surf, cols = 9, rows = 5;
    if (!S.room(cols * rows, (cols - 1) * (rows - 1) * 2)) return;
    S.style(SF.PANEL, c, a * 0.9, WHITE, 0.85, k, s.seed);
    const v0 = S.nv, Rc = 0.85, span = 0.8 * grow, H = 1.75 * grow;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = (i / (cols - 1)) * 2 - 1, vv = j / (rows - 1);
        const th = f + u * span;
        S.vert(X + Math.cos(th) * Rc, G + 0.05 + vv * H, Z + Math.sin(th) * Rc, u, vv);
      }
    }
    S.grid(v0, cols, rows);
  },
};

/** Swirls: a black hole, a sand tornado, a cyclone, a whirlpool — arms on the ground, a funnel spinning up off it. */
SHAPES.vortex = {
  draw(v, s, k, a) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.3));
    const R = s.r * grow;
    if (R < 0.05) return;
    const spin = v.time * (s.spin || 4);
    const dark = s.kind === 'dark';
    const c = col(dark ? '#7e57c2' : s.color || '#ffffff'), c2 = col(dark ? '#1a0033' : s.color2 || '#ffffff');
    const patch = v.patch(s, s.x, s.y, R);
    v.decal(patch, s.x, s.y, R, 0, SF.SWIRL, c, a, c2, dark ? 0.2 : 0.5, k, s.seed, dark ? -1 : 0, s.arms || 5, spin, 8);
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    if (dark) {
      // a sphere of nothing at its heart, purple light round its rim
      v.shells.put(VK.DARK, X, G + 0.35 * R, Z, R * 0.32, 0, 1, 0, 1, c, a, col('#b388ff'), 0, k, s.seed);
      return;
    }
    if (s.kind !== 'sand' && s.kind !== 'wind' && s.kind !== 'smoke' && s.kind !== 'water') return;
    const H = (s.h || s.r * 1.6) * grow;
    const add = s.kind === 'wind' || s.kind === 'water' ? 0.4 : 0;
    v.tubes.put(TK.FUNNEL, X, G - 0.05, Z, 0, 1, 0, H, R * 0.22, R, c, a * 0.9, c2, add, k, s.seed);
    v.tubes.put(TK.FUNNEL, X, G - 0.05, Z, 0, 1, 0, H * 0.85, R * 0.12, R * 0.7, c2, a * (add ? 0.45 : 0.7), c, add, k, s.seed + 0.37);
  },
};

/** A storm cloud hanging over a spot: heavy cel-shaded billows, lightning flickering inside. */
SHAPES.cloud = {
  draw(v, s, k, a) {
    const grow = easeOut(Math.min(1, (s.age || 0) / 0.4));
    const R = s.r * grow;
    if (R < 0.05) return;
    // (high over its spot and wide, whatever height it asked for: a storm, not a rock in the air)
    const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + Math.max(8.5, s.z ?? 5);
    cloud(v, X, Y, Z, Math.max(3, R * 1.4), col(s.color || '#37474f'), a, s.seed, s.flicker === false ? null : col(s.glow || '#fff59d'));
  },
};
/**
 * A storm cloud (thunder zones, El Thor, Raigo): a wide, flat, dark mass of
 * soft billows high up, roiling slowly, darker underneath, lightning
 * flickering inside it and now and then crackling out of its underside.
 */
function cloud(v, X, Y, Z, R, c, a, seed, flash = STORM_FLASH) {
  const t = v.time;
  for (let i = 0; i < 18; i++) {
    const th = hash(seed + i * 3.7) * TAU + t * 0.05 * (i % 2 ? 1 : -1);
    const rr = R * Math.sqrt(hash(seed + i * 5.3)) * 0.92;
    const x = X + Math.cos(th) * rr, z = Z + Math.sin(th) * rr;
    const y = Y + (hash(seed + i * 7.1) - 0.5) * R * 0.16 + Math.sin(t * 0.9 + i * 1.3) * R * 0.03;
    v.sprites.put(SK.SMOKE, x, y, z, R * (0.3 + 0.2 * hash(seed + i * 2.9)), i < 7 ? STORM_LOW : c, a, c, 0, t * 0.12 * ((i % 3) - 1) + i, seed + i, 0.1);
  }
  v.sprites.put(SK.SMOKE, X, Y + R * 0.08, Z, R * 0.6, c, a, c, 0, t * 0.05, seed + 31, 0.08);
  if (!flash) return;
  // lightning inside it: a billow lit from within, now here, now there
  const f = Math.floor(t * 9);
  for (let j = 0; j < 3; j++) {
    if (hash(seed + j * 13 + f) < 0.55) continue;
    const th = hash(seed + j * 17 + f) * TAU, rr = R * 0.6 * hash(seed + j * 19 + f);
    const x = X + Math.cos(th) * rr, z = Z + Math.sin(th) * rr;
    v.sprites.put(SK.GLOW, x, Y - R * 0.05, z, R * 0.4, flash, a * 0.6, WHITE, 1, 0, seed + j, 0);
    if (!j) bolt(v, x, Y - R * 0.1, z, x + (hash(seed + f) - 0.5) * R * 0.8, Y - R * 0.5, z + (hash(seed + f * 3) - 0.5) * R * 0.8, 0.05, R * 0.1, seed + f, flash, a * 0.9, 1);
  }
}
const STORM_LOW = col('#263238'), STORM_FLASH = col('#e1f5fe');
export { cloud };

// ------------------------------------------------------------------ spikes & solids
const SPIKE = { ice: OK.ICE, sand: OK.SAND, rock: OK.ROCK };
/**
 * Spikes rising out of the ground (ice, sand blades, rock): real faceted
 * crystals, each bursting up on its own delay, leaning outward, crumbling
 * away at the end. Ice frosts the ground under them.
 */
SHAPES.spikes = {
  draw(v, s, k, a) {
    const pts = s.pts;
    if (!pts || !pts.length) return;
    const age = s.age || 0;
    const fade = Math.min(1, (1 - k) * 3) * a;
    const dissolve = clamp01(1 - fade);
    const kind = SPIKE[s.kind] ?? OK.ROCK;
    const c = col(s.color || (s.kind === 'ice' ? '#b3e5fc' : s.kind === 'sand' ? '#d7b56d' : '#8d6e63'));
    const sq = s.sq || 1;
    const r = v.rec(s);
    // (the spread of the points, for the frost under them, and the ground
    // under each: worked out once)
    if (!(r.n > 0) || !r.data || r.data.length !== pts.length) {
      let mx = 0;
      r.data = new Float32Array(pts.length);
      for (let i = 0; i < pts.length; i++) {
        mx = Math.max(mx, Math.hypot(pts[i].dx, pts[i].dy / sq));
        r.data[i] = v.ground(s.x + pts[i].dx, s.y + pts[i].dy / sq);
      }
      r.n = mx + 0.6;
    }
    const batch = kind === OK.ROCK ? v.solids.rocks : v.solids.crystals;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = age - (p.delay || 0);
      if (t < 0) continue;
      const grow = easeOut(Math.min(1, t / 0.12));
      // (a burst: overshooting a touch before it settles)
      const pop = grow * (1 + 0.12 * Math.sin(Math.min(1, t / 0.22) * PI));
      const dx = p.dx, dy = p.dy / sq;
      const wx = s.x + dx, wy = s.y + dy;
      const h = p.h * 1.6 * pop, wd = (p.w || 0.15) * 1.35;
      const rl = Math.hypot(dx, dy) || 1;
      const lean = 0.18 + Math.abs(p.lean || 0) * 0.8;
      const ldx = (dx / rl) * lean + (hash(s.seed + i * 3) - 0.5) * 0.25, ldz = (dy / rl) * lean + (hash(s.seed + i * 5) - 0.5) * 0.25;
      const G = r.data[i] - 0.12;
      putAlong(batch, v.lx(wx), G, v.lz(wy), ldx, 1, ldz, h, wd, hash(s.seed + i) * TAU, c, kind, dissolve, hash(s.seed + i * 7) * 10, kind === OK.ICE ? 0.08 : 0);
    }
    if (s.kind === 'ice' && !v.low) {
      const patch = v.patch(s, s.x, s.y, r.n);
      v.decal(patch, s.x, s.y, r.n, 0, SF.FROST, col('#e1f5fe'), fade * Math.min(1, age / 0.2) * 0.9, WHITE, 0.3, k, s.seed, 0, 0, 0, 8, 0.03);
    }
  },
};

/** Something falling from the sky (meteors, magma fists, giant hands): trailing fire, then a flash where it lands. */
SHAPES.meteor = {
  draw(v, s, k, a) {
    const fall = s.fall || 0.35;
    const age = (s.age || 0) - (s.delay0 || 0);
    if (age < 0) return;
    const t = Math.min(1, age / fall);
    const R = s.size || 1;
    const glow = col(s.glow || '#ff9100');
    const G = v.groundOf(s);
    const X = v.lx(s.x), Z = v.lz(s.y);
    if (t >= 1) {
      const f = 1 - Math.min(1, (age - fall) / 0.35);
      if (f <= 0) return;
      const patch = v.patch(s, s.x, s.y, R * 2);
      v.decal(patch, s.x, s.y, R * 2, 0, SF.GLOW, glow, f * a * 0.8, WHITE, 0.8, k, s.seed, 0, 0, 0, 5);
      v.sprites.put(SK.FLASH, X, G + R * 0.4, Z, R * 1.4 * (1.25 - f * 0.25), glow, f * f * a * 0.7, WHITE, 0.8, 0, s.seed, k);
      return;
    }
    // coming in at a slant from the drift side
    const da = hash(s.seed) * TAU, drift = (s.drift || 1.5) * (1 - t);
    const hz = (s.h || 9) * (1 - t * t);
    const px = X + Math.cos(da) * drift, pz = Z + Math.sin(da) * drift, py = G + hz + R * 0.6;
    // which way it's going: down and toward its spot
    D[0] = -Math.cos(da) * (s.drift || 1.5) / fall; D[1] = -2 * (s.h || 9) * t / fall - 1; D[2] = -Math.sin(da) * (s.drift || 1.5) / fall;
    norm3(D);
    const kind = s.kind || 'rock';
    if (kind === 'mochi') v.shells.put(VK.GOO, px, py, pz, R, D[0], D[1], D[2], 1.15, col('#fff8e1'), a, col('#bcaaa4'), 0, k, s.seed);
    else if (kind === 'hand') putAlong(v.solids.blocks, px, py, pz, -D[0], -D[1], -D[2], R * 1.6, R * 1.6, s.seed, col(s.color || '#f1c9a0'), OK.SKIN, 0, s.seed, 0);
    else if (kind === 'fist') putAlong(v.solids.blocks, px, py, pz, D[0], D[1], D[2], R * 1.8, R * 1.8, s.seed, col(s.color || '#bf360c'), OK.MAGMA, 0, s.seed, 1);
    else putAlong(v.solids.rocks, px, py, pz, D[0], D[1], D[2], R * 1.1, R * 1.2, v.time * 2 + s.seed, col(s.color || '#5d4037'), OK.MAGMA, 0, s.seed, 1);
    // a fiery trail back up its path
    if (kind !== 'hand') {
      v.ribbons.start(kind === 'mochi' ? RK.SMOKE : RK.FIRE, RM.FACE, glow, a, col('#fff3c4'), 0.6);
      for (let i = 0; i <= 5; i++) {
        const q = i / 5, back = q * Math.min(R * 6, 2 + hz * 0.5);
        v.ribbons.point(px - D[0] * back, py - D[1] * back, pz - D[2] * back, R * (0.95 - q * 0.7));
      }
      v.ribbons.finish();
      v.sprites.put(SK.GLOW, px, py, pz, R * 2, glow, a * 0.6, WHITE, 1, 0, s.seed, k);
    }
  },
};

/** The Ope Ope cube: a real rotating wireframe cube of light (a heart floating in it for Mes). */
SHAPES.cube = {
  draw(v, s, k, a) {
    const z = s.z ?? 0.8;
    if (v.onSelf(s, z)) return;
    const grow = easeOut(Math.min(1, k / 0.2));
    const fade = (1 - k * k) * a;
    const R = s.size * grow;
    if (R < 0.01) return;
    const X = v.lx(s.x), Z = v.lz(s.y), Y = v.groundOf(s) + z;
    const rot = (s.rot || 0) + v.time * (s.spin ?? 2);
    const cy = Math.cos(rot), sy = Math.sin(rot), cx = Math.cos(0.5), sx = Math.sin(0.5);
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? 1 : -1, y = i & 2 ? 1 : -1, zz = i & 4 ? 1 : -1;
      const X1 = x * cy - zz * sy, Z1 = x * sy + zz * cy;
      const Y1 = y * cx - Z1 * sx, Z2 = y * sx + Z1 * cx;
      CUBE[i * 3] = X + X1 * R; CUBE[i * 3 + 1] = Y + Y1 * R; CUBE[i * 3 + 2] = Z + Z2 * R;
    }
    const c = col(s.color || '#81d4fa');
    for (let e = 0; e < 12; e++) {
      const p = EDGES[e * 2], q = EDGES[e * 2 + 1];
      v.ribbons.start(RK.LINE, RM.FACE, c, fade, WHITE, 1)
        .point(CUBE[p * 3], CUBE[p * 3 + 1], CUBE[p * 3 + 2], 0.022)
        .point(CUBE[q * 3], CUBE[q * 3 + 1], CUBE[q * 3 + 2], 0.022)
        .finish();
    }
    v.sprites.put(SK.GLOW, X, Y, Z, R * 1.2, c, fade * 0.3, WHITE, 1, 0, s.seed, k);
    if (s.heart) v.sprites.put(SK.HEART, X, Y, Z, R * 0.5, col('#ff5252'), fade, WHITE, 0.2, 0, s.seed, k);
  },
};
const CUBE = new Float32Array(24);
const EDGES = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7];

// ------------------------------------------------------------------ on the ground
/** Enemy wind-up telegraphs: the true hit area on the ground, filling as the blow comes, its edge pulsing. */
SHAPES.tele = {
  draw(v, s, k, a) {
    const c = col(s.color || 'rgba(255,60,60,1)');
    if (s.shape === 'circle') {
      const patch = v.patch(s, s.x, s.y, s.r);
      v.decal(patch, s.x, s.y, s.r, 0, SF.TELE, c, a, c, 0.08, k, s.seed, 0, 0, s.r, 10);
    } else if (s.shape === 'arc') {
      const patch = v.patch(s, s.x, s.y, s.r);
      v.decal(patch, s.x, s.y, s.r, s.angle, SF.TELE, c, a, c, 0.08, k, s.seed, 1, s.arc / 2, s.r, 10);
    } else if (s.shape === 'line') {
      // a strip from the caster along the aim
      const L = s.length || 1, W = (s.width || 1) / 2, ca = Math.cos(s.angle), sa = Math.sin(s.angle);
      const mx = s.x + ca * L / 2, my = s.y + sa * L / 2;
      const patch = v.patch(s, mx, my, L / 2 + W);
      const S = v.surf, nu = Math.max(2, Math.min(24, Math.ceil(L / 0.8))), nv = 3;
      if (!S.room((nu + 1) * nv, nu * (nv - 1) * 2)) return;
      S.style(SF.TELE, c, a, c, 0.08, k, s.seed, 2);
      const v0 = S.nv, X = v.lx(mx), Z = v.lz(my);
      for (let i = 0; i <= nu; i++) {
        for (let j = 0; j < nv; j++) {
          const u = i / nu, q = (j / (nv - 1)) * 2 - 1;
          const ox = ca * (u - 0.5) * L - sa * q * W, oy = sa * (u - 0.5) * L + ca * q * W;
          S.vert(X + ox, patch.get(ox, oy) + 0.05, Z + oy, u, q, W, L);
        }
      }
      S.grid(v0, nv, nu + 1);
    }
  },
};

/** Ground cracks radiating from a point: dark fissures with a pale lip; the big ones heave up chunks of earth. */
SHAPES.crack = {
  draw(v, s, k, a) {
    const alpha = Math.min(1, (1 - k) * 2.5) * a;
    if (alpha < 0.01) return;
    const r = v.rec(s);
    const n = s.n || 7;
    // the fissures, worked out once: points (x, y in world tiles, h ground) and their count per line
    if (!r.data) {
      // jagged: each fissure zig-zags out in short kinks, some fork
      const d = [];
      const jag = (x0, y0, ang, len, segs, sd) => {
        const line = [x0, y0, v.ground(x0, y0)];
        let px = x0, py = y0;
        for (let j = 1; j <= segs; j++) {
          const a2 = ang + (hash(sd + j * 13) - 0.5) * 1.1;
          const st = (len / segs) * (0.7 + 0.6 * hash(sd + j * 7));
          px += Math.cos(a2) * st; py += Math.sin(a2) * st;
          line.push(px, py, v.ground(px, py));
        }
        return line;
      };
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + s.seed + (hash(s.seed + i) - 0.5) * 0.5;
        const len = s.r * (0.65 + 0.55 * hash(s.seed * 3 + i));
        const line = jag(s.x, s.y, ang, len, 7, s.seed + i * 31);
        d.push(line);
        if (hash(s.seed + i * 5) > 0.4) {
          const j = 3 + Math.floor(hash(s.seed + i * 17) * 3);
          const b = ang + (hash(s.seed + i * 9) > 0.5 ? 0.75 : -0.75);
          d.push(jag(line[j * 3], line[j * 3 + 1], b, len * 0.38, 3, s.seed + i * 47));
        }
      }
      r.data = d;
    }
    const dark = col('#1a110b'), lip = col('#e6d6bc');
    const big = s.r >= 1.1;
    const hw0 = Math.min(0.16, 0.05 + s.r * 0.04);
    for (let i = 0; i < r.data.length; i++) {
      const L = r.data[i], m = L.length / 3;
      const branch = i > 0 && r.data[i - 1].length > L.length + 6;
      v.ribbons.start(RK.CRACK, RM.FLAT, dark, alpha * 0.95, lip, 0);
      for (let j = 0; j < m; j++) {
        const q = j / (m - 1);
        v.ribbons.point(v.lx(L[j * 3]), L[j * 3 + 2] + 0.035, v.lz(L[j * 3 + 1]), hw0 * (branch ? 0.6 : 1) * (1 - q * 0.85));
      }
      v.ribbons.finish();
    }
    if (big && !v.low) {
      // chunks of earth heaved up along the fissures
      const nr = Math.min(10, Math.round(s.r * 3));
      const earth = col('#7a6552');
      const sink = clamp01((k - 0.55) / 0.45);
      for (let i = 0; i < nr; i++) {
        const L = r.data[i % r.data.length];
        const j = 1 + (i % 3);
        if (L.length < (j + 1) * 3) continue;
        const px = L[j * 3], py = L[j * 3 + 1];
        const sz = (0.13 + 0.17 * hash(s.seed + i * 11)) * Math.max(0.7, Math.min(1.6, s.r * 0.6)) * Math.min(1, k * 14);
        putAlong(v.solids.rocks, v.lx(px), L[j * 3 + 2] + sz * (0.2 - sink * 0.9), v.lz(py), hash(s.seed + i) - 0.5, 1, hash(s.seed + i * 2) - 0.5, sz * 1.3, sz, hash(s.seed + i * 3) * TAU, earth, OK.ROCK, sink * 0.8, i, 0);
      }
    }
  },
};

/** A soft-edged stain on the ground (scuffs, puddles, blood, frost). */
SHAPES.decal = {
  draw(v, s, k, a) {
    const al = Math.min(1, (1 - k) * 2) * 0.6 * a;
    if (al < 0.01) return;
    const c = col(s.color || '#000000');
    const patch = v.patch(s, s.x, s.y, s.r);
    v.decal(patch, s.x, s.y, s.r, 0, SF.STAIN, c, al * (c[3] ?? 1), c, 0, k, s.seed, 0, 0, 0, 6);
  },
};

/** A burn: soot, and veins of embers glowing in it that cool off. */
SHAPES.scorch = {
  draw(v, s, k, a) {
    const al = Math.min(1, (1 - k) * 2) * a;
    if (al < 0.01) return;
    const patch = v.patch(s, s.x, s.y, s.r);
    v.decal(patch, s.x, s.y, s.r, s.seed, SF.SCORCH, col(s.color || 'rgba(30,18,12,1)'), al, col(s.rim || '#ff6f00'), 0, k, s.seed, 0, 0, 0, 7);
  },
};

/** Knockback skid marks: two scuffed furrows along the slide. */
SHAPES.skid = {
  draw(v, s, k, a) {
    const al = (1 - k) * 0.6 * a;
    if (al < 0.01) return;
    const c = col(s.color || 'rgba(60,45,30,1)'), lip = col('#a1887f');
    const ca = Math.cos(s.angle), sa = Math.sin(s.angle), L = s.length || 1;
    for (let q = 0; q < 2; q++) {
      const off = SKID[q];
      v.ribbons.start(RK.CRACK, RM.FLAT, c, al, lip, 0);
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, px = s.x - ca * L * t - sa * off * (1 + 0.4 * t), py = s.y - sa * L * t + ca * off * (1 + 0.4 * t);
        v.ribbons.point(v.lx(px), v.ground(px, py) + 0.03, v.lz(py), 0.06 * (1 - t * 0.5));
      }
      v.ribbons.finish();
    }
  },
};
const SKID = [-0.14, 0.14];

// ------------------------------------------------------------------ zones
const DARKNESS = col('#311b92');
const SCORCH_COL = col('rgba(30,18,12,1)'), BOLT_EMBER = col('#ffd54f');
const ROOM_LINE = col('#e1f5fe');
const ZONE_COL = { dark: ['#7e57c2', '#12001c'], ice: ['#e1f5fe', '#ffffff'], storm: ['#e1c16e', '#fff3c4'], gravity: ['#b39ddb', '#ede7f6'] };
/**
 * Area techniques: the floor of the area (a black hole's arms, gravity
 * rippling in, frost, a field of drifting blotches) and what stands over it
 * (a storm cloud, a sand storm, the Birdcage, rain of gravity, arms
 * sprouting all over it).
 */
SHAPES.zone = {
  draw(v, s, k, a) {
    const R = s.r * easeOut(Math.min(1, (s.age || 0) / 0.3));
    if (R < 0.05) return;
    const kind = s.kind || 'field';
    if (kind === 'room') { room(v, s, R, a); return; }
    const zc = ZONE_COL[kind];
    const c = col(zc ? zc[0] : s.color || '#ffffff'), c2 = col(zc ? zc[1] : s.color || '#ffffff');
    const patch = v.patch(s, s.x, s.y, s.r);
    const zk = ZK[kind] ?? 0;
    const spin = v.time * (kind === 'dark' ? -3 : 5);
    v.decal(patch, s.x, s.y, R, 0, SF.ZONE, c, a, c2, kind === 'dark' ? 0.2 : 0.4, k, s.seed, zk, kind === 'dark' ? 6 : 5, spin, 10);
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    if (kind === 'thunder') {
      cloud(v, X, G + 9 + R * 0.2, Z, Math.max(3.2, R * 1.5), col('#37474f'), a, s.seed);
      // the scorched crater where it struck, cooling
      v.decal(patch, s.x, s.y, Math.min(R * 0.55, 2.5), s.seed, SF.SCORCH, SCORCH_COL, a * 0.9, BOLT_EMBER, 0, Math.min(1, (s.age || 0) / 2.5), s.seed, 0, 0, 0, 7);
    }
    else if (kind === 'storm') {
      v.tubes.put(TK.FUNNEL, X, G - 0.05, Z, 0, 1, 0, R * 1.3, R * 0.25, R, c, a * 0.75, c2, 0, k, s.seed);
    } else if (kind === 'cage') {
      v.shells.put(VK.DOME, X, G, Z, R, 0, 1, 0, 1, col(s.color || '#f8bbd0'), a, WHITE, 0.35, 1, s.seed, 0.96);
    } else if (kind === 'dark') {
      // darkness welling up out of the pool
      for (let i = 0; i < 7; i++) {
        const ph = (v.time * 0.55 + hash(s.seed + i)) % 1, cyc = Math.floor(v.time * 0.55 + hash(s.seed + i));
        const th = hash(s.seed + i * 7 + cyc) * TAU, rr = Math.sqrt(hash(s.seed + i * 11 + cyc)) * R * 0.75;
        v.sprites.put(SK.SMOKE, X + Math.cos(th) * rr, G + 0.1 + ph * 1.1, Z + Math.sin(th) * rr, 0.25 + 0.35 * ph, DARKNESS, a * Math.sin(ph * PI) * 0.9, DARKNESS, 0, ph * 2, s.seed + i, 0.15 + ph * 0.6);
      }
    } else if (kind === 'gravity') {
      // the air pressing down: lines falling through the area
      for (let i = 0; i < 10; i++) {
        const th = hash(s.seed + i) * TAU, rr = Math.sqrt(hash(s.seed + i * 3)) * R * 0.9;
        const ph = (v.time * 1.6 + hash(s.seed + i * 7)) % 1;
        const x = X + Math.cos(th) * rr, z = Z + Math.sin(th) * rr, top = G + 3.2 * (1 - ph);
        v.ribbons.start(RK.SPEED, RM.FACE, c2, a * 0.8, c2, 0.5).point(x, top + 0.7, z, 0.02).point(x, top, z, 0.014).finish();
      }
    } else if (kind === 'arms') {
      // arms sprouting all over the area (laid out as the 2D drawer lays them out)
      const r = v.rec(s);
      if (!r.data) {
        const pts = [], n = Math.max(3, Math.round(s.r * 3));
        for (let i = 0; i < n; i++) {
          const th = (i / n) * TAU + hash(s.seed + i), rr = s.r * (0.3 + 0.6 * hash(s.seed + i * 3));
          pts.push({ dx: Math.cos(th) * rr, dy: Math.sin(th) * rr, L: 0.9, ang: th, delay: i * 0.03, seed: i });
        }
        r.data = pts;
      }
      arms(v, s, r.data, R > 2, a, 1);
    } else if (kind === 'field') {
      for (let i = 0; i < 5; i++) {
        const ph = (v.time * 0.8 + hash(s.seed + i)) % 1;
        const cyc = Math.floor(v.time * 0.8 + hash(s.seed + i));
        const x = X + (hash(s.seed + i * 7 + cyc) - 0.5) * R * 1.4, z = Z + (hash(s.seed + i * 11 + cyc) - 0.5) * R * 1.4;
        v.sprites.put(SK.BUBBLE, x, G + 0.05 + ph * 0.3, z, 0.06 + ph * 0.12, col(s.color || '#aed581'), a * (1 - ph) * 0.8, WHITE, 0.3, 0, s.seed + i, ph);
      }
    }
  },
};

// ------------------------------------------------------------------ blasts
/**
 * An explosion's body (3D only: the 2D view has no drawer for it): a ball of
 * fire swelling out fast and boiling away, with a shock bubble racing out
 * past it.
 */
SHAPES.blast = {
  draw(v, s, k, a) {
    const R = s.r || 1.5;
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    const grow = easeOut(Math.min(1, k / 0.35));
    const c = col(s.color || '#ff9100'), c2 = col(s.core || '#fff3c4');
    const rr = R * (0.35 + 0.45 * grow);
    // (it rises a little as it burns out; a big one boils in gentler bumps —
    // big ones read as shards — and licks flame out round its edge)
    const Y = G + rr * 0.55 + k * R * 0.3;
    v.shells.put(VK.FIRE, X, Y, Z, rr, 0, 1, 0, 1.15, c, a * (1 - k * 0.3), c2, 0.55, 0.15 + k * 0.85, s.seed, Math.max(0.4, Math.min(1, 2.4 / R)));
    if (R > 2 && k < 0.75) crown(v, X, Y, Z, rr * 0.95, c, c2, a * (1 - k / 0.75), s.seed, v.time, 12, 0.15 + k);
    const sk = Math.min(1, k * 2.2);
    if (sk < 1) v.shells.put(VK.BUBBLE, X, G + 0.2, Z, R * (0.4 + 1.1 * easeOut(sk)), 0, 1, 0, 1, c, a * (1 - sk) * 0.6, WHITE, 0.4, sk, s.seed);
  },
};

// ------------------------------------------------------------------ bodies
/**
 * Gatling: fists hammering all over a cone in front of the actor — real
 * fists on blurred, stretched arms, a burst where each one lands.
 */
SHAPES.gatling = {
  draw(v, s, k, a) {
    const f = s.follow;
    const ang = f ? f.facing : s.angle || 0;
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    const sc = (f && f.look && f.look.scale) || 1;
    const skin = col(s.dark ? '#1c1a24' : s.skin || '#f1c9a0');
    const ink = col('#3a2a24');
    const t = v.time;
    const sx = X + Math.cos(ang) * 0.25 * sc, sy = G + 1.25 * sc, sz = Z + Math.sin(ang) * 0.25 * sc;
    for (let i = 0; i < 9; i++) {
      const ph = (t * 7 + i / 9) % 1;
      const seed = Math.floor(t * 7 + i / 9) * 13 + i;
      const pop = Math.sin(ph * PI);
      const d = (0.8 + hash(seed) * (s.range || 2.6)) * (0.55 + 0.45 * pop);
      const th = ang + (hash(seed + 3) - 0.5) * (s.arc || 0.9);
      const ct = Math.cos(th), st = Math.sin(th);
      const px = X + ct * d, pz = Z + st * d, py = G + (1.05 + (hash(seed + 7) - 0.5) * 0.6) * sc;
      const R = 0.15 * (0.75 + pop * 0.4) * sc;
      // the arm, a blur back to the shoulder
      v.ribbons.start(RK.TUBE, RM.FACE, skin, a * 0.55 * pop, ink, 0)
        .point(sx, sy, sz, 0.06 * sc).point(px - ct * R, py, pz - st * R, 0.075 * sc).finish();
      putAlong(v.solids.blocks, px, py, pz, ct, 0, st, R * 2, R * 2, seed, skin, OK.SKIN, 0, seed, 0);
      // speed lines streaming off it
      v.ribbons.start(RK.SPEED, RM.FACE, WHITE, a * 0.75 * pop, WHITE, 0.4)
        .point(px - ct * R * 1.2, py + R * 0.5, pz - st * R * 1.2, 0.02)
        .point(px - ct * (R + 0.55 * pop), py + R * 0.5, pz - st * (R + 0.55 * pop), 0.01).finish();
      if (ph > 0.45 && ph < 0.62) {
        const j = v.sprites.put(SK.BURST, px + ct * R, py, pz + st * R, 0.3 * sc, col('#fff8e1'), a, WHITE, 0.6, seed, seed, (ph - 0.45) / 0.17);
        v.sprites.vel(j, 7, 0, 0, 0);
      }
    }
  },
};

/** Bara Bara Festival: the body in pieces, orbiting and pummelling. */
SHAPES.pieces = {
  draw(v, s, k, a) {
    const fade = a * Math.min(1, (1 - k) * 4);
    if (fade < 0.05) return;
    const X = v.lx(s.x), Z = v.lz(s.y), G = v.groundOf(s);
    const R = s.r || 2.4, t = v.time;
    const skin = col(s.skin || '#f1c9a0'), top = col(s.top || '#e53935'), bottom = col(s.bottom || '#1565c0');
    for (let i = 0; i < 10; i++) {
      const th = t * (2.5 + (i % 3)) + i * 2.39;
      const r = R * (0.35 + 0.65 * hash(s.seed + i));
      const px = X + Math.cos(th) * r, pz = Z + Math.sin(th) * r, py = G + 0.7 + Math.sin(t * 7 + i) * 0.3 + hash(s.seed + i * 3) * 0.6;
      const kind = i % 3, sz = kind ? 0.22 : 0.16;
      putAlong(v.solids.blocks, px, py, pz, Math.cos(th * 2), Math.sin(th * 1.3), Math.sin(th * 2), sz * (kind ? 1.6 : 1), sz, th, kind === 0 ? skin : kind === 1 ? top : bottom, OK.SKIN, 1 - fade, i, 0);
    }
  },
};

/**
 * Sprouting arms (Hana Hana): arms burst up out of the ground in a puff of
 * petals, reach and clutch — sleeved, with hands, standing in the world.
 */
SHAPES.arms = {
  draw(v, s, k, a) {
    if (!s.pts) return;
    const fade = Math.min(1, (1 - k) * 4) * a;
    if (fade < 0.02) return;
    arms(v, s, s.pts, s.big, fade, s.sq || 1);
  },
};
function arms(v, s, pts, big, fade, sq) {
  const age = s.age || 0;
  const skin = col(s.skin || '#f1c9a0'), sleeve = col(s.sleeve || '#7e57c2'), petal = col(s.petal || '#f48fb1');
  const ink = col('#2a1a1e');
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const t = age - (p.delay || 0);
    if (t < 0) continue;
    const grow = easeOut(Math.min(1, t / 0.16));
    const clutch = Math.min(1, Math.max(0, (t - 0.16) / 0.12));
    const wx = s.x + p.dx, wy = s.y + p.dy / sq;
    const X = v.lx(wx), Z = v.lz(wy), G = v.ground(wx, wy);
    const L = p.L * grow * (big ? 2.4 : 1.25);
    const ca = Math.cos(p.ang), sa = Math.sin(p.ang);
    // the hand: up, leaning out the way the arm reaches
    const hx = X + ca * L * 0.4, hz = Z + sa * L * 0.4, hy = G + L * 0.85;
    const ew = big ? 0.2 : 0.075;
    v.ribbons.start(RK.TUBE, RM.FACE, sleeve, fade, ink, 0);
    for (let j = 0; j <= 4; j++) {
      const q = j / 4, bend = Math.sin(q * PI) * L * 0.12;
      v.ribbons.point(X + (hx - X) * q - ca * bend, G - 0.05 + (hy - G + 0.05) * q, Z + (hz - Z) * q - sa * bend, ew * (1 - q * 0.25));
    }
    v.ribbons.finish();
    const hr = (big ? 0.34 : 0.12) * (1 - clutch * 0.2);
    putAlong(v.solids.blocks, hx, hy + hr * 0.4, hz, ca * 0.3, 1, sa * 0.3, hr * 2, hr * 2, p.ang, skin, OK.SKIN, 0, i, 0);
    // petals bursting round its root
    if (t < 0.5) {
      for (let j = 0; j < 5; j++) {
        const th = (j / 5) * TAU + (p.seed || 0), r = 0.1 + t * 0.6;
        v.sprites.put(SK.PETAL, X + Math.cos(th) * r, G + 0.05 + t * 0.4, Z + Math.sin(th) * r, big ? 0.16 : 0.08, petal, fade * (1 - t * 2), petal, 0, th, j, t);
      }
    }
  }
}
