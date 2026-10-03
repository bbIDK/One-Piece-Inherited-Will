// Projectiles in 3D, by their sprite: a Fire Fist is a boiling ball of
// cel-shaded flame dragging a long tongue of fire; a rubber punch is a real
// fist on the end of a stretched arm reaching back to its owner; ice shards
// are crystals with frost streaming off them; bullets are tracers; flying
// slashes are crescents of light; orbs glow and leave a fading trail. Each
// projectile remembers where it has been (a few frames of positions, in a
// pooled record) for its trail. Cannonballs keep their iron-ball mesh.
import { col, hash, TAU } from './kit.js';
import { SK } from './sprites.js';
import { RK, RM } from './ribbons.js';
import { SF } from './surfaces.js';
import { VK } from './volumes.js';
import { OK, putAlong } from './solids.js';
import { bolt } from './shapes.js';

const H = 18; // positions remembered
const WHITE = col('#ffffff');
const HOT = col('#fff3c4');

class Rec {
  constructor() { this.frame = 0; this.hist = new Float32Array(H * 3); this.n = 0; this.head = 0; }
  reset() { this.n = 0; this.head = 0; }
  /** Remember a position (world tiles x, y and height h). */
  push(x, y, h) {
    const o = this.head * 3;
    this.hist[o] = x; this.hist[o + 1] = y; this.hist[o + 2] = h;
    this.head = (this.head + 1) % H;
    if (this.n < H) this.n++;
  }
  /** The i-th position back (0 = the newest). */
  back(i, out) {
    const j = ((this.head - 1 - i) % H + H) % H, o = j * 3;
    out[0] = this.hist[o]; out[1] = this.hist[o + 1]; out[2] = this.hist[o + 2];
    return out;
  }
}
const P = new Float32Array(3);

export class Projectiles {
  constructor(v) { this.v = v; this.recs = new Map(); this.pool = []; this.frame = 0; this._sweep = (r, p) => { if (r.frame !== this.frame) { r.reset(); this.pool.push(r); this.recs.delete(p); } }; }

  /** Is this projectile drawn here (not as a plain mesh)? */
  owns(pr) { return this.v.on && pr.sprite !== 'cannonball'; }

  clear() { this.recs.forEach((r) => { r.reset(); this.pool.push(r); }); this.recs.clear(); }

  update(game) {
    const v = this.v, view = v.view;
    this.frame++;
    const list = game.combat?.projectiles;
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const pr = list[i];
        if (pr.delay > 0 || pr.sprite === 'cannonball') continue;
        let r = this.recs.get(pr);
        if (!r) { r = this.pool.pop() || new Rec(); this.recs.set(pr, r); }
        r.frame = this.frame;
        const y3 = view.projY ? view.projY(pr) : view.ground(pr.x, pr.y + 0.5) + 1.15;
        r.push(pr.x, pr.y + 0.5, y3);
        try { draw(v, pr, r, y3); } catch (e) { if (!this.warned) { this.warned = true; console.warn('vfx projectile', pr.sprite, e); } }
      }
    }
    this.recs.forEach(this._sweep);
  }
}

/** A trail back through where it's been: `n` points, half-width hw at the head tapering to tail × hw. */
function trail(v, r, kind, c, alpha, c2, w, hw, tail = 0.05, n = 10, minLen = 0) {
  const m = Math.min(n, r.n);
  if (m < 2) return;
  const R = v.ribbons, wd = v.world;
  R.start(kind, RM.FACE, c, alpha, c2, w);
  let len = 0, px = 0, pz = 0, py = 0;
  for (let i = 0; i < m; i++) {
    r.back(i, P);
    const X = wd.dx(v.ox, P[0]), Z = P[1] - v.oy;
    if (i) len += Math.hypot(X - px, P[2] - py, Z - pz);
    px = X; py = P[2]; pz = Z;
    const q = i / (m - 1);
    R.point(X, P[2], Z, hw * (1 - q * (1 - tail)), 1 - q * 0.6);
  }
  if (len >= minLen) R.finish();
}

function draw(v, pr, r, Y) {
  const X = v.world.dx(v.ox, pr.x), Z = pr.y + 0.5 - v.oy;
  const s = pr.size || 1, t = pr.t || 0;
  // first person: your own shot leaves from your chest, inside the camera —
  // it comes into view as it gets away from you (solids crumble in)
  let fin = 1;
  if (v.fp && pr.owner === v.player) {
    const d = Math.hypot(X - v.cp[0], Y - v.cp[1], Z - v.cp[2]);
    fin = Math.min(1, Math.max(0, (d - 1.1) / 1.2));
    if (fin <= 0) return;
  }
  const sp = Math.hypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / sp, dz = pr.vy / sp;
  const c = col(pr.color || '#ffffff');
  const seed = (hash(pr.range * 7.1 + pr.radius * 13.3 + (pr.damage || 0)) * 100) | 0;
  switch (pr.sprite) {
    case 'fireball':
    case 'firefist': {
      const fist = pr.sprite === 'firefist';
      const big = s >= 3;
      const R = big ? 0.55 * s : (fist ? 0.42 : 0.34) * s;
      const fc = col('#ff7a1a');
      v.shells.put(VK.FIRE, X, Y, Z, R, dx, 0, dz, fist ? 1.7 : 1.3, fc, fin, HOT, 0.6, 0, seed);
      if (big) v.shells.put(VK.FIRE, X, Y, Z, R * 1.35, dx, 0, dz, 1.15, col('#ff4400'), 0.7 * fin, HOT, 0.8, 0.3, seed + 3);
      v.sprites.put(SK.GLOW, X, Y, Z, R * 2.2, fc, 0.55 * fin, HOT, 1, 0, seed, 0);
      trail(v, r, RK.FIRE, fc, fin, HOT, 0.6, R * 0.95, 0.15, big ? 16 : 12);
      break;
    }
    case 'magmafist': {
      const R = 0.38 * s;
      putAlong(v.solids.blocks, X, Y, Z, dx, 0, dz, R * 1.8, R * 1.8, t * 3, col('#4e342e'), OK.MAGMA, 1 - fin, seed, 1);
      v.sprites.put(SK.GLOW, X, Y, Z, R * 2.4, col('#ff6f00'), 0.6, HOT, 1, 0, seed, 0);
      trail(v, r, RK.FIRE, col('#ff5722'), 1, HOT, 0.5, R * 1.1, 0.1, 12);
      break;
    }
    case 'gomufist':
    case 'barafist': {
      const o = pr.stretch;
      const look = (o && o.look) || {};
      const skin = col(pr.sprite === 'barafist' ? (pr.color && pr.color !== '#ffccbc' ? pr.color : '#f1c9a0') : look.skin || '#f1c9a0');
      const dark = o && o.armament;
      const R = 0.24 * s;
      putAlong(v.solids.blocks, X, Y, Z, dx, 0, dz, R * 1.7, R * 1.7, 0, dark ? col('#1c1a24') : skin, OK.SKIN, 1 - fin, seed, dark ? 0.05 : 0);
      if (o && o.alive !== false && pr.sprite === 'gomufist') {
        // the arm, stretched back to the shoulder it came from, a little slack in it
        const ox = v.world.dx(v.ox, o.x), oz = o.y - v.oy;
        const sc = (o.look && o.look.scale) || 1;
        const oy = v.ground(o.x, o.y) + (o.z || 0) + 1.3 * sc;
        const sx = ox + dx * 0.25, sz = oz + dz * 0.25;
        const sleeve = col(dark ? '#1c1a24' : look.sleeve || look.skin || '#f1c9a0');
        const wd = Math.min(0.13 * s, 0.09 + 0.02 * s);
        v.ribbons.start(RK.TUBE, RM.FACE, sleeve, 1, col('#2a1a18'), 0);
        for (let i = 0; i <= 10; i++) {
          const q = i / 10, sag = Math.sin(q * Math.PI) * (0.1 + Math.sin(t * 30) * 0.04);
          v.ribbons.point(X + (sx - X) * q - dx * R * 0.6 * (1 - q), Y + (oy - Y) * q - sag, Z + (sz - Z) * q - dz * R * 0.6 * (1 - q), wd);
        }
        v.ribbons.finish();
      } else trail(v, r, RK.SPEED, WHITE, 0.7, WHITE, 0.3, R * 0.5, 0.1, 6);
      if (sp > 10) speedLines(v, X, Y, Z, dx, dz, R, seed, t);
      break;
    }
    case 'iceshard': {
      const ic = col(pr.color || '#b3e5fc');
      putAlong(v.solids.shards, X, Y, Z, dx, 0, dz, 0.5 * s, 0.22 * s, t * 8, ic, OK.ICE, 1 - fin, seed, 0.15);
      v.sprites.put(SK.STAR, X + dx * 0.3 * s, Y, Z + dz * 0.3 * s, 0.25 * s, ic, 0.7, WHITE, 1, t * 6, seed, 0);
      trail(v, r, RK.SMOKE, col('#e1f5fe'), 0.7, WHITE, 0, 0.16 * s, 0.3, 8);
      break;
    }
    case 'airslash':
    case 'sandblade': {
      const sand = pr.sprite === 'sandblade';
      const sc = col(pr.color || (sand ? '#e1c16e' : '#e3f2fd'));
      flyingCrescent(v, X, Y, Z, dx, dz, 0.9 * s, 0.38 * s, sc, sand, seed);
      if (sand) for (let i = 0; i < 6; i++) {
        const ph = (t * 4 + i / 6) % 1, off = (hash(seed + i) - 0.5) * 0.9 * s;
        v.sprites.put(SK.SPECK, X - dx * ph * 1.2 - dz * off, Y + (hash(seed + i * 3) - 0.5) * 0.6 * s, Z - dz * ph * 1.2 + dx * off, 0.03, sc, 1 - ph, sc, 0);
      } else trail(v, r, RK.SPEED, sc, 0.45, WHITE, 0.6, 0.2 * s, 0.4, 6);
      break;
    }
    case 'bullet': {
      const j = v.sprites.put(SK.STREAK, X, Y, Z, 0.035, col('#ffd54f'), 1, WHITE, 1, 0, seed, 0);
      v.sprites.vel(j, dx, 0, dz, Math.min(1.6, 0.3 + sp * 0.05));
      v.sprites.put(SK.GLOW, X, Y, Z, 0.12, col('#ffe082'), 0.8, WHITE, 1, 0, seed, 0);
      break;
    }
    case 'thunder': {
      const lc = col('#fff176');
      if (s >= 2) {
        // Sango: a dragon of lightning — strands writhing back along its path from a blazing head
        const m = Math.min(r.n, 14);
        if (m >= 3) {
          r.back(m - 1, P);
          const tx = v.world.dx(v.ox, P[0]), tz = P[1] - v.oy;
          for (let i = 0; i < 3; i++) bolt(v, X, Y, Z, tx, P[2] + (i - 1) * 0.2 * s, tz, 0.12 * s * (1 - i * 0.25), 0.3 * s, seed + i * 17 + Math.floor(t * 20), lc, 1, 1);
        }
        v.sprites.put(SK.GLOW, X, Y, Z, 0.4 * s, lc, 0.7, WHITE, 1, 0, seed, 0);
      } else {
        const fl = Math.floor(t * 20);
        for (let i = 0; i < 4; i++) {
          const a = hash(seed + i * 3 + fl) * TAU, e = (hash(seed + i * 5 + fl) - 0.5) * 2;
          bolt(v, X, Y, Z, X + Math.cos(a) * 0.5 * s, Y + e * 0.4 * s, Z + Math.sin(a) * 0.5 * s, 0.05, 0.12, seed + i + fl, lc, 1, 0);
        }
        v.sprites.put(SK.GLOW, X, Y, Z, 0.35 * s, lc, 0.75, WHITE, 1, 0, seed, 0);
        trail(v, r, RK.GLOW, lc, 0.6, WHITE, 1, 0.12 * s, 0.1, 8);
      }
      break;
    }
    case 'lightorb': {
      const lc = col('#fff59d');
      v.shells.put(VK.ORB, X, Y, Z, 0.16 * s, dx, 0, dz, 1.6, lc, 1, WHITE, 1, 0, seed);
      v.sprites.put(SK.GLOW, X, Y, Z, 0.55 * s, lc, 0.9, WHITE, 1, 0, seed, 0);
      trail(v, r, RK.GLOW, lc, 0.9, WHITE, 1, 0.1 * s, 0.05, 14);
      break;
    }
    case 'darkorb': {
      v.shells.put(VK.DARK, X, Y, Z, 0.4 * s, 0, 1, 0, 1, col('#311b92'), 1, col('#b388ff'), 0, 0, seed);
      trail(v, r, RK.SMOKE, col('#1a0033'), 0.8, col('#7e57c2'), 0, 0.3 * s, 0.2, 10);
      break;
    }
    case 'waterdrop': {
      const wc = col(pr.color || '#4fc3f7');
      v.shells.put(VK.WATER, X, Y, Z, 0.16 * s, dx, 0, dz, 1.5, wc, 1, WHITE, 0, 0, seed);
      trail(v, r, RK.SMOKE, col('#b3e5fc'), 0.6, WHITE, 0, 0.1 * s, 0.2, 8);
      break;
    }
    case 'bomb': {
      v.shells.put(VK.GOO, X, Y, Z, 0.25 * s, 0, 1, 0, 1, col('#263238'), 1, col('#0d0f12'), 0, 0, seed);
      const f = Math.sin(t * 30) > 0;
      v.sprites.put(SK.EMBER, X + 0.12 * s, Y + 0.38 * s, Z, 0.08, col(f ? '#ffeb3b' : '#ff7043'), 1, WHITE, 1, 0, seed, 0);
      v.sprites.put(SK.GLOW, X + 0.12 * s, Y + 0.38 * s, Z, 0.16, col('#ffab40'), 0.7, WHITE, 1, 0, seed, 0);
      break;
    }
    case 'star': {
      const sc = col(pr.color || '#ffeb3b');
      v.sprites.put(SK.STAR, X, Y, Z, 0.32 * s, sc, 1, WHITE, 0.8, t * 12, seed, 0);
      trail(v, r, RK.GLOW, sc, 0.5, WHITE, 1, 0.08 * s, 0.1, 8);
      break;
    }
    case 'petal': {
      const pc = col('#f48fb1');
      for (let i = 0; i < 4; i++) v.sprites.put(SK.PETAL, X + Math.cos(i * 1.57 + t * 5) * 0.12, Y + Math.sin(i * 1.57 + t * 5) * 0.12, Z, 0.13, pc, 1, pc, 0, i * 1.57 + t * 5, seed, 0);
      break;
    }
    case 'paw': {
      const wob = 1 + 0.05 * Math.sin(t * 14);
      v.shells.put(VK.WATER, X, Y, Z, 0.36 * s * wob, 0, 1, 0, 1, col('#ffffff'), 0.7, WHITE, 0, 0, seed);
      for (let i = 0; i < 3; i++) v.shells.put(VK.WATER, X + (i - 1) * 0.22 * s * -dz, Y + 0.35 * s, Z + (i - 1) * 0.22 * s * dx, 0.11 * s, 0, 1, 0, 1, col('#ffffff'), 0.7, WHITE, 0, 0, seed + i);
      break;
    }
    case 'smokefist':
    case 'smokesnake': {
      const m = Math.min(r.n, 10);
      for (let i = m - 1; i >= 0; i--) {
        r.back(i, P);
        const q = i / Math.max(1, m - 1);
        v.sprites.put(SK.SMOKE, v.world.dx(v.ox, P[0]), P[2], P[1] - v.oy, (0.42 - q * 0.22) * s, col('#eceff1'), 1 - q * 0.6, WHITE, 0, i, seed + i, q * 0.4);
      }
      break;
    }
    case 'poison':
    case 'hydra': {
      const pc = col('#7b1fa2');
      v.shells.put(VK.GOO, X, Y, Z, (pr.sprite === 'hydra' ? 0.32 : 0.36) * s, dx, 0, dz, 1.3, pc, 1, col('#2a0a36'), 0, 0, seed);
      trail(v, r, RK.TUBE, col('#6a1b9a'), 0.9, col('#2a0a36'), 0, 0.15 * s, 0.3, 10);
      break;
    }
    case 'mochi': {
      v.shells.put(VK.GOO, X, Y, Z, 0.42 * s, dx, 0, dz, 1.2, col('#fff8e1'), 1, col('#bcaaa4'), 0, 0, seed);
      break;
    }
    case 'shockwave': {
      const sc = col(pr.color || '#e0f7fa');
      for (let i = 0; i < 4; i++) {
        const ph = (t * 3 + i * 0.25) % 1;
        const rr = (0.4 + i * 0.12) * s, back = i * 0.22 * s;
        v.planeRing(X - dx * back, Y, Z - dz * back, 0, 1, 0, -dz, 0, dx, rr, 0.05 * Math.max(1, s * 0.8), i ? sc : WHITE, (1 - i * 0.2) * (0.6 + 0.4 * Math.sin(ph * Math.PI)), WHITE, 1, 0.6, seed + i, 0, 28);
      }
      break;
    }
    case 'string': {
      const sc = col(pr.color || '#f8bbd0');
      for (let i = -1; i <= 1; i++) {
        v.ribbons.start(RK.THIN, RM.FACE, sc, 1, WHITE, 0.5)
          .point(X - dx * 1.4 - dz * i * 0.07, Y + i * 0.05, Z - dz * 1.4 + dx * i * 0.07, 0.012)
          .point(X + dx * 0.3, Y, Z + dz * 0.3, 0.01)
          .finish();
      }
      break;
    }
    case 'ghost': {
      const gc = col(pr.color || '#e1bee7');
      v.shells.put(VK.ORB, X, Y + Math.sin(t * 8) * 0.05, Z, 0.28 * s, 0, 1, 0, 1.25, gc, 0.85, WHITE, 0.4, 0, seed);
      trail(v, r, RK.SMOKE, gc, 0.5, WHITE, 0, 0.18 * s, 0.1, 8);
      break;
    }
    case 'bat': {
      const bc = col('#1c1b22');
      const flap = Math.sin(t * 28) * 0.6;
      for (let i = -1; i <= 1; i += 2) v.sprites.put(SK.PETAL, X - dz * i * 0.18 * s, Y + flap * 0.1, Z + dx * i * 0.18 * s, 0.2 * s, bc, 1, bc, 0, i * (0.6 + flap), seed, 0);
      break;
    }
    case 'bird': {
      const bc = col(pr.color || '#b3e5fc');
      const flap = Math.sin(t * 20) * 0.5;
      v.shells.put(VK.ORB, X, Y, Z, 0.16 * s, dx, 0, dz, 2.2, bc, 1, WHITE, 0.8, 0, seed);
      for (let i = -1; i <= 1; i += 2) {
        v.ribbons.start(RK.GLOW, RM.FACE, bc, 0.9, WHITE, 1)
          .point(X, Y, Z, 0.08 * s)
          .point(X - dx * 0.25 * s - dz * i * 0.35 * s, Y + flap * 0.3 * s, Z - dz * 0.25 * s + dx * i * 0.35 * s, 0.06 * s)
          .point(X - dx * 0.55 * s - dz * i * 0.6 * s, Y + flap * 0.55 * s, Z - dz * 0.55 * s + dx * i * 0.6 * s, 0.01)
          .finish();
      }
      trail(v, r, RK.GLOW, bc, 0.6, WHITE, 1, 0.12 * s, 0.1, 10);
      break;
    }
    default: {
      // an orb: a glowing ball, a halo, a fading trail
      const R = Math.max(0.12, Math.min(0.7, (pr.radius || 0.3) * 0.7)) * Math.min(2.5, s);
      v.shells.put(VK.ORB, X, Y, Z, R, dx, 0, dz, 1.15, c, 1, WHITE, 0.6, 0, seed);
      v.sprites.put(SK.GLOW, X, Y, Z, R * 2.2, c, 0.55, c, 1, 0, seed, 0);
      trail(v, r, RK.GLOW, c, 0.75, WHITE, 1, R * 0.7, 0.05, 10);
    }
  }
}

/** Speed lines streaking back past a fast punch. */
function speedLines(v, X, Y, Z, dx, dz, R, seed, t) {
  const f = Math.floor(t * 30);
  for (let i = 0; i < 4; i++) {
    const a = hash(seed + i * 7 + f) * TAU, rr = R * (1.1 + hash(seed + i) * 0.6);
    const ox = -dz * Math.cos(a) * rr, oy = Math.sin(a) * rr, oz = dx * Math.cos(a) * rr;
    const L = 0.5 + hash(seed + i * 3 + f) * 0.6;
    v.ribbons.start(RK.SPEED, RM.FACE, WHITE, 0.8, WHITE, 0.3)
      .point(X + ox - dx * 0.2, Y + oy, Z + oz - dz * 0.2, 0.02)
      .point(X + ox - dx * (0.2 + L), Y + oy, Z + oz - dz * (0.2 + L), 0.008)
      .finish();
  }
}

/** A flying slash: a crescent of light standing across its path, bowed forward. */
function flyingCrescent(v, X, Y, Z, dx, dz, R, W, c, sand, seed) {
  const S = v.surf, U = 16, V = 3;
  if (!S.room((U + 1) * V, U * (V - 1) * 2)) return;
  S.style(SF.SMEAR, c, 1, WHITE, sand ? 0.1 : 0.9, 0, seed);
  const v0 = S.nv;
  // the arc's centre sits behind it; it sweeps from below-left to above-right, tilted
  const tilt = 0.5;
  const sx = -dz * Math.cos(tilt), sy = Math.sin(tilt), sz = dx * Math.cos(tilt);
  const cx = X - dx * R * 0.6, cz = Z - dz * R * 0.6;
  for (let i = 0; i <= U; i++) {
    const u = i / U, th = (u - 0.5) * 2.3;
    const wv = W * Math.sin(u * Math.PI) ** 0.6;
    const ct = Math.cos(th), st = Math.sin(th);
    for (let j = 0; j < V; j++) {
      const q = j / (V - 1), rr = R - q * wv;
      S.vert(cx + (dx * ct + sx * st) * rr, Y + sy * st * rr, cz + (dz * ct + sz * st) * rr, 0.35 + u * 0.65, q);
    }
  }
  S.grid(v0, V, U + 1);
}
