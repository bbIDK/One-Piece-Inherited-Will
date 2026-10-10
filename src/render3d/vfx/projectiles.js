// Projectiles in 3D, by their sprite: a Fire Fist is a boiling ball of
// cel-shaded flame dragging a long tongue of fire; a thrown sun is a sun;
// ice shards are crystals with frost streaming off them; bullets are
// tracers; flying slashes are crescents of light; orbs glow and leave a
// fading trail. Each projectile remembers where it has been (a few frames of
// positions, in a pooled record) for its trail. Cannonballs keep their
// iron-ball mesh. A stretching punch (Gomu Gomu) has no body here at all:
// the arm on the character's rig is the punch, and it gets only speed lines
// whipping along that arm.
import { col, hash, luma, easeOut, TAU } from './kit.js';
import { SK } from './sprites.js';
import { RK, RM } from './ribbons.js';
import { SF } from './surfaces.js';
import { VK } from './volumes.js';
import { OK, putAlong } from './solids.js';
import { bolt, crown, cloud } from './shapes.js';

const H = 18; // positions remembered
const WHITE = col('#ffffff');
const INK = col('#2a1630');
const HOT = col('#fff3c4');
const DARK_RED = col('#c62828');

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

const LAND = 8, LF = 8; // landings remembered, floats each (x, y, h, dx, dz, t0, size, seed)
const LAND_LIFE = 0.32;

export class Projectiles {
  constructor(v) {
    this.v = v; this.recs = new Map(); this.pool = []; this.frame = 0;
    // a stretching punch that connected leaves its landing here (drawn a moment after it's gone)
    this.land = new Float32Array(LAND * LF).fill(-1e9); this.landI = 0;
    this._sweep = (r, p) => {
      if (r.frame === this.frame) return;
      if (p.stretch && p.hit && p.hit.size > 0 && r.n) this.landing(p, r);
      r.reset(); this.pool.push(r); this.recs.delete(p);
    };
  }

  /**
   * A great fireball being raised overhead (Entei and its like: chars3d.js
   * sets a._sunCharge while the charge lasts) — the same sun that's then
   * hurled, swelling as it gathers.
   */
  chargeSuns(game) {
    const v = this.v;
    this._rec = this._rec || new Rec();
    for (const a of game.actors || []) {
      const c = a._sunCharge;
      // (stale once two frames have gone by without the charge being set
      // again — counted in frames, not ms, so a slow frame doesn't drop it)
      if (!c || ++c.seen > 2) continue;
      sun(v, this._rec, c.X, c.Y, c.Z, c.R, 1, 0, SUN_FC, ((a.seed || 1) * 97) | 0, v.time);
      // (heat shimmering up off it, embers rising)
      v.sprites.put(SK.GLOW, c.X, c.Y, c.Z, c.R * 3.2, SUN_FC, 0.18, SUN_CORE, 1, 0, 7, 0);
    }
  }

  /**
   * Partisan forming: a fan of ice spears hanging in the air round the
   * caster's shoulders, points forward, growing out of nothing as the
   * charge builds (chars3d.js sets a._spearCharge) — then thrown.
   */
  chargeSpears(game) {
    const v = this.v;
    for (const a of game.actors || []) {
      const c = a._spearCharge;
      if (!c || ++c.seen > 2) continue;
      const n = c.n, S = c.S, ic = col(c.color || '#e1f5fe'), lx = -c.dz, lz = c.dx;
      for (let i = 0; i < n; i++) {
        // (staggered: each spear grows in a beat after the one before)
        const g = Math.max(0, Math.min(1, c.k * 1.6 - i * (0.6 / n)));
        if (g <= 0) continue;
        const u = n > 1 ? i / (n - 1) * 2 - 1 : 0, ring = 1.6 + 0.3 * Math.abs(u);
        const X = c.X + lx * u * ring * S - c.dx * 0.35 * S, Z = c.Z + lz * u * ring * S - c.dz * 0.35 * S;
        const Y = c.Y + (0.9 - 0.8 * u * u) * S + Math.sin(v.time * 3 + i) * 0.04;
        const L = 2.3 * S * (0.4 + 0.6 * g);
        putAlong(v.solids.shards, X - c.dx * L * 0.35, Y, Z - c.dz * L * 0.35, c.dx, 0, c.dz, L * 0.75, 0.08 * S, 0, ic, OK.ICE, 1 - g, i, 0.1);
        putAlong(v.solids.crystals, X + c.dx * L * 0.12, Y, Z + c.dz * L * 0.12, c.dx, 0, c.dz, 0.75 * S * g, 0.24 * S, 0, ic, OK.ICE, 1 - g, i, 0.2);
        v.sprites.put(SK.STAR, X + c.dx * L * 0.4, Y, Z + c.dz * L * 0.4, 0.12 * S, WHITE, 0.6 * g, WHITE, 1, v.time * 4 + i, i, 0);
      }
    }
  }

  /** Raigo gathering: a thundercloud swelling high over the caster, ever darker and wider. */
  chargeStorms(game) {
    const v = this.v;
    for (const a of game.actors || []) {
      const c = a._stormCharge;
      if (!c || ++c.seen > 2) continue;
      const k = c.k, R = 1.5 + 7.5 * k * k;
      cloud(v, c.X, c.Y + 6 + 4 * k, c.Z, R, STORM_C, Math.min(1, 0.3 + k), ((a.seed || 1) * 31) | 0);
    }
  }

  landing(p, r) {
    r.back(0, P);
    const L = this.land, o = (this.landI++ % LAND) * LF, sp = Math.hypot(p.vx, p.vy) || 1;
    L[o] = P[0]; L[o + 1] = P[1]; L[o + 2] = P[2]; L[o + 3] = p.vx / sp; L[o + 4] = p.vy / sp;
    L[o + 5] = this.v.time; L[o + 6] = p.size || 1; L[o + 7] = (hash(P[0] * 3.1 + P[1] * 7.7) * 100) | 0;
  }

  /** Is this projectile drawn here (not as a plain mesh)? */
  owns(pr) { return this.v.on && pr.sprite !== 'cannonball'; }

  clear() { this.recs.forEach((r) => { r.reset(); this.pool.push(r); }); this.recs.clear(); this.land.fill(-1e9); }

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
        // first person: your own shot leaves from your chest, inside the
        // camera — it swells to its full size and fades in as it gets away
        // from you (a thrown sun doesn't swallow the screen)
        let sc = 1, fin = 1;
        if (v.fp && pr.owner === v.player) {
          const d = Math.hypot(v.world.dx(v.ox, pr.x) - v.cp[0], y3 - v.cp[1], pr.y + 0.5 - v.oy - v.cp[2]);
          fin = Math.min(1, (d - 0.6) / 1.4);
          if (fin <= 0) continue;
          sc = Math.min(1, Math.max(0.12, ((d - 0.45) * 0.7) / reach(pr)));
        }
        const s0 = v.sprites.n, r0 = v.ribbons.nv, f0 = v.surf.nv, h0 = v.shells.n, t0 = v.tubes.n, b0 = v.solids.blocks.n, d0 = v.solids.shards.n;
        try { draw(v, pr, r, y3, sc); } catch (e) { if (!this.warned) { this.warned = true; console.warn('vfx projectile', pr.sprite, e); } }
        if (fin < 1) {
          v.sprites.fade(s0, fin); v.ribbons.fade(r0, fin); v.surf.fade(f0, fin); v.shells.fade(h0, fin); v.tubes.fade(t0, fin);
          v.solids.blocks.fade(b0, fin); v.solids.shards.fade(d0, fin);
        }
      }
    }
    this.recs.forEach(this._sweep);
    this.chargeSuns(game);
    this.chargeSpears(game);
    this.chargeStorms(game);
    const L = this.land;
    for (let i = 0; i < LAND; i++) {
      const o = i * LF, age = v.time - L[o + 5];
      if (age >= 0 && age < LAND_LIFE) rubberLanding(v, L[o], L[o + 1], L[o + 2], L[o + 3], L[o + 4], age / LAND_LIFE, L[o + 6], L[o + 7]);
    }
  }
}

/**
 * Where a rubber punch lands: a DON — an inked star punched out big and
 * fast round a white-hot heart, a rubbery shock ring wobbling out across
 * the blow, and speed lines rushing in on the line of the punch.
 */
function rubberLanding(v, x, y, Y, dx, dz, k, s, seed) {
  const X = v.world.dx(v.ox, x), Z = y - v.oy, fade = 1 - k;
  const pop = easeOut(Math.min(1, k / 0.2));
  const R = 0.75 * s * (0.55 + 0.6 * pop);
  v.sprites.vel(v.sprites.put(SK.GLOW, X, Y, Z, R * 1.5, LAND_WARM, fade * 0.35, WHITE, 1, 0, seed, k), 0, 0, 0, v.pull);
  v.sprites.vel(v.sprites.put(SK.BURST, X, Y, Z, R * 1.15, LAND_CREAM, fade, WHITE, 0.55, seed, seed, k), 11, 0, 0, v.pull);
  const j = v.sprites.put(SK.RING, X, Y, Z, (0.35 + 1.7 * easeOut(k)) * s, WHITE, fade * 0.9, WHITE, 0.6, 0, seed, k);
  v.sprites.vel(j, 0.04 + 0.12 * fade, 0.14 * fade, 7, 0.8);
  const lx = -dz, lz = dx, bx = X - dx * 0.4, bz = Z - dz * 0.4;
  for (let n = 0; n < 8; n++) {
    const th = (n / 8) * TAU + hash(seed + n) * 0.5, ca = Math.cos(th), sa = Math.sin(th);
    const r1 = (1.9 - 1.1 * k) * s, r0 = r1 * (0.45 + 0.15 * hash(seed + n * 3));
    v.ribbons.start(RK.SPEED, RM.FACE, WHITE, fade * 0.85, WHITE, 0.4)
      .point(bx + lx * ca * r1, Y + sa * r1, bz + lz * ca * r1, 0.03 * s)
      .point(bx + lx * ca * r0, Y + sa * r0, bz + lz * ca * r0, 0.004)
      .finish();
  }
}
const LAND_WARM = col('#ffe0b2'), LAND_CREAM = col('#fff3e0');

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

/** About how far a projectile's look reaches from its centre (m). */
function reach(pr) {
  const s = pr.size || 1;
  switch (pr.sprite) {
    case 'fireball': case 'firefist': return s >= 3 ? 0.8 * s : 0.7 * s;
    case 'airslash': case 'sandblade': return 0.9 * s;
    case 'bird': return 2.1 * Math.max(0.55, pr.radius || 0.5) * s;
    case 'thunder': return 0.5 * s;
    default: return Math.max(0.3, 0.45 * s);
  }
}

function draw(v, pr, r, Y, sc) {
  const X = v.world.dx(v.ox, pr.x), Z = pr.y + 0.5 - v.oy;
  const s = (pr.size || 1) * sc, t = pr.t || 0;
  const sp = Math.hypot(pr.vx, pr.vy) || 1;
  const dx = pr.vx / sp, dz = pr.vy / sp;
  const c = col(pr.color || '#ffffff');
  const seed = (hash(pr.range * 7.1 + pr.radius * 13.3 + (pr.damage || 0)) * 100) | 0;
  switch (pr.sprite) {
    case 'fireball':
    case 'firefist': {
      const fist = pr.sprite === 'firefist';
      const fc = col('#ff7a1a');
      if ((pr.size || 1) >= 3) { sun(v, r, X, Y, Z, 0.55 * s, dx, dz, fc, seed, t); break; }
      const R = (fist ? 0.42 : 0.34) * s;
      v.shells.put(VK.FIRE, X, Y, Z, R, dx, 0, dz, fist ? 1.7 : 1.3, fc, 1, HOT, 0.6, 0, seed);
      v.sprites.put(SK.GLOW, X, Y, Z, R * 2.2, fc, 0.55, HOT, 1, 0, seed, 0);
      trail(v, r, RK.FIRE, fc, 1, HOT, 0.6, R * 0.95, 0.15, 12);
      break;
    }
    case 'firefly': {
      // Hotarubi: a firefly of green fire — a small soft lime light that
      // bobs and flickers as it drifts, a faint tail, no flame on it yet
      // (it only bursts into fire when Hidaruma sets them off)
      const gc = col(pr.color || '#aeea00'), R = 0.16 * s;
      const fl = 0.75 + 0.25 * Math.sin(t * 23 + seed), bob = Math.sin(t * 5 + seed) * 0.12;
      v.sprites.put(SK.GLOW, X, Y + bob, Z, R * 3.4, gc, 0.5 * fl, col('#f4ff81'), 1, 0, seed, 0);
      v.sprites.put(SK.GLOW, X, Y + bob, Z, R * 1.1, col('#f4ff81'), fl, WHITE, 1, 0, seed + 1, 0);
      trail(v, r, RK.SMOKE, gc, 0.35, gc, 0, R * 0.5, 0.2, 6);
      break;
    }
    case 'magmafist': {
      const R = 0.38 * s;
      putAlong(v.solids.blocks, X, Y, Z, dx, 0, dz, R * 1.8, R * 1.8, t * 3, col('#4e342e'), OK.MAGMA, 0, seed, 1);
      v.sprites.put(SK.GLOW, X, Y, Z, R * 2.4, col('#ff6f00'), 0.6, HOT, 1, 0, seed, 0);
      trail(v, r, RK.FIRE, col('#ff5722'), 1, HOT, 0.5, R * 1.1, 0.1, 12);
      break;
    }
    case 'gomufist':
    case 'barafist': {
      const o = pr.stretch;
      // a stretching punch: the arm reaching out is the character's own (its
      // rig); here only the rubbery whip of speed lines along it
      if (o) { rubberLines(v, o, X, Y, Z, dx, dz, s, seed, t); break; }
      // a hand flying on its own (Bara Bara): the thrower's own fist, cut off
      // clean at the wrist with the cuff of their sleeve still round it,
      // knuckles first, wobbling a little in the air — and, while it's away,
      // missing from the end of their arm (chars3d.js bodyParts)
      const ow = pr.owner, L = ow?.look || {};
      if (ow && pr.sprite === 'barafist') ow._baraHand = performance.now() / 1000;
      const R = 0.3 * s * (L.scale || 1);
      const skin = col(L.skin || (pr.color && pr.color !== '#ffccbc' ? pr.color : '#f1c9a0'));
      const sleeve = col(L.coat || L.top || '#e53935');
      const roll = Math.sin(t * 9 + seed) * 0.35;
      putAlong(v.solids.fists, X, Y, Z, dx, 0, dz, R, R, roll, skin, OK.SKIN, 0, seed, 0);
      putAlong(v.solids.cuffs, X, Y, Z, dx, 0, dz, R, R, roll, sleeve, OK.PLAIN, 0, seed, 0);
      trail(v, r, RK.SPEED, WHITE, 0.85, WHITE, 0.4, R * 0.8, 0.12, 8);
      speedLines(v, X, Y, Z, dx, dz, R, seed, t);
      break;
    }
    case 'knife': {
      // a thrown knife (Buggy's, flung from a cut-off hand): steel, point
      // first, spinning a little on its long axis, a bright glint along the edge
      const kc = col(pr.color || '#cfd8dc');
      putAlong(v.solids.knives, X, Y, Z, dx, 0, dz, 0.42 * s, 0.42 * s, t * 14 + seed, kc, OK.PLAIN, 0, seed, 0);
      v.sprites.put(SK.STAR, X + dx * 0.35 * s, Y, Z + dz * 0.35 * s, 0.14 * s, WHITE, 0.8, WHITE, 1, t * 10, seed, 0);
      trail(v, r, RK.SPEED, WHITE, 0.55, WHITE, 0.3, 0.05 * s, 0.1, 6);
      break;
    }
    case 'icespear': {
      // Ice Block: Partisan — a partisan of ice: a long shaft, a broad pointed head, two
      // curled hooks either side of its foot (as Aokiji's are drawn), a frost trail
      const ic = col(pr.color || '#e1f5fe'), L = 1.6 * s, nx = -dz, nz = dx;
      putAlong(v.solids.shards, X - dx * L * 0.35, Y, Z - dz * L * 0.35, dx, 0, dz, L * 0.75, 0.06 * s, 0, ic, OK.ICE, 0, seed, 0.1);
      putAlong(v.solids.crystals, X + dx * L * 0.12, Y, Z + dz * L * 0.12, dx, 0, dz, 0.55 * s, 0.17 * s, 0, ic, OK.ICE, 0, seed, 0.2);
      for (const sd of [1, -1]) {
        putAlong(v.solids.shards, X - dx * 0.12 * s + nx * sd * 0.16 * s, Y + 0.04 * s, Z - dz * 0.12 * s + nz * sd * 0.16 * s, -dx * 0.6 + nx * sd, 0.4, -dz * 0.6 + nz * sd, 0.32 * s, 0.06 * s, sd, ic, OK.ICE, 0, seed + sd, 0.1);
      }
      trail(v, r, RK.SMOKE, col('#e1f5fe'), 0.55, WHITE, 0, 0.12 * s, 0.35, 8);
      break;
    }
    case 'iceshard': {
      const ic = col(pr.color || '#b3e5fc');
      putAlong(v.solids.shards, X, Y, Z, dx, 0, dz, 0.5 * s, 0.22 * s, t * 8, ic, OK.ICE, 0, seed, 0.15);
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
      v.sprites.put(SK.GLOW, X, Y, Z, 0.07, col('#ffe082'), 0.8, WHITE, 1, 0, seed, 0);
      break;
    }
    case 'thunder': {
      const lc = col('#fff176');
      if ((pr.size || 1) >= 2) {
        // Sango: a dragon of lightning — a serpent body of light writhing
        // back along its path, strands crackling round it, a blazing head
        // with forked jaws reaching ahead
        const m = Math.min(r.n, 16), lx = -dz, lz = dx, fl = Math.floor(t * 20);
        if (m >= 3) {
          const Rb = v.ribbons;
          Rb.start(RK.GLOW, RM.FACE, lc, 0.95, WHITE, 1);
          for (let i = 0; i < m; i++) {
            r.back(i, P);
            const q = i / (m - 1), ph = i * 0.8 - t * 16, wv = Math.sin(ph) * 0.3 * s * q;
            Rb.point(v.world.dx(v.ox, P[0]) + lx * wv, P[2] + Math.cos(ph) * 0.15 * s * q, P[1] - v.oy + lz * wv, 0.3 * s * (1 - 0.7 * q));
          }
          Rb.finish();
          r.back(m - 1, P);
          const tx = v.world.dx(v.ox, P[0]), tz = P[1] - v.oy;
          for (let i = 0; i < 3; i++) bolt(v, X, Y, Z, tx, P[2] + (i - 1) * 0.2 * s, tz, 0.06 * s * (1 - i * 0.25), 0.35 * s, seed + i * 17 + fl, lc, 0.9, 1);
        }
        for (let j = -1; j <= 1; j += 2) {
          bolt(v, X, Y, Z, X + dx * 0.6 * s + lx * j * 0.22 * s, Y + j * 0.12 * s, Z + dz * 0.6 * s + lz * j * 0.22 * s, 0.05 * s, 0.08 * s, seed + 40 + j + fl, lc, 1, 0);
        }
        v.sprites.put(SK.GLOW, X, Y, Z, 0.45 * s, lc, 0.7, WHITE, 1, 0, seed, 0);
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
      // (a black one — Haki — is inked on, red at its heart, rather than adding light)
      const dark = luma(sc) < 0.05, rc = dark ? DARK_RED : WHITE;
      for (let i = 0; i < 4; i++) {
        const ph = (t * 3 + i * 0.25) % 1;
        const rr = (0.4 + i * 0.12) * s, back = i * 0.22 * s;
        v.planeRing(X - dx * back, Y, Z - dz * back, 0, 1, 0, -dz, 0, dx, rr, 0.05 * Math.max(1, s * 0.8), i || dark ? sc : WHITE, (1 - i * 0.2) * (0.6 + 0.4 * Math.sin(ph * Math.PI)), rc, dark ? 0.1 : 1, 0.6, seed + i, 0, 28);
      }
      break;
    }
    case 'string': {
      const sc = col(pr.color || '#f8bbd0');
      // (strings fanned from the fingertips: back to the hand that threw them,
      // if it's near — Parasite's strings stay tied to their puppeteer)
      const o = pr.owner, hx = o ? v.world.dx(v.ox, o.x) : X - dx * 1.4, hz = o ? o.y + 0.5 - v.oy : Z - dz * 1.4;
      const far = Math.hypot(hx - X, hz - Z) > 14;
      const bx = far ? X - dx * 1.4 : hx, bz = far ? Z - dz * 1.4 : hz, by = far ? Y : Y + 0.05;
      const n = pr.status?.puppet ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const f = i - (n - 1) / 2;
        const sag = 0.06 + 0.03 * Math.sin(t * 9 + i);
        v.ribbons.start(RK.THIN, RM.FACE, sc, 1, WHITE, 0.6)
          .point(bx - dz * f * 0.05, by + f * 0.03, bz + dx * f * 0.05, 0.014)
          .point((bx + X) / 2 - dz * f * 0.12, (by + Y) / 2 - sag, (bz + Z) / 2 + dx * f * 0.12, 0.012)
          .point(X + dx * 0.2 - dz * f * 0.08, Y + f * 0.04, Z + dz * 0.2 + dx * f * 0.08, 0.01)
          .finish();
      }
      v.sprites.put(SK.GLOW, X, Y, Z, 0.35 * s, sc, 0.5, WHITE, 1, 0, seed, 0);
      break;
    }
    case 'ghost': {
      // a Hollow: a pale teardrop with a sad little face toward you, stubby
      // arms, a wisp of a tail curling away behind it as it drifts and bobs
      const gc = col(pr.color || '#e1bee7');
      const R = 0.42 * s, bob = Math.sin(t * 5 + seed) * 0.08 * s, sway = Math.sin(t * 3.3 + seed) * 0.12;
      const gy = Y + 0.25 * s + bob;
      v.shells.put(VK.ORB, X, gy, Z, R, 0, 1, 0, 1.35, gc, 0.8, WHITE, 0.55, 0, seed);
      v.sprites.put(SK.GLOW, X, gy, Z, R * 2.6, gc, 0.35, WHITE, 0.6, 0, seed, 0);
      // the tail: smaller and fainter puffs trailing back and down, swaying
      for (let i = 1; i <= 4; i++) {
        const k = i / 4, sw = Math.sin(t * 6 - i * 0.9 + seed) * 0.12 * s * k;
        v.shells.put(VK.ORB, X - dx * R * 1.1 * i * 0.7 - dz * sw, gy - R * (0.55 + 0.25 * k), Z - dz * R * 1.1 * i * 0.7 + dx * sw, R * (0.62 - 0.12 * i), 0, 1, 0, 1, gc, 0.65 * (1 - k * 0.6), WHITE, 0.4, 0, seed + i);
      }
      // the face, on the side you see: two droopy eyes and a wailing mouth
      const fx = -v.cf[0], fz = -v.cf[2], fl = Math.hypot(fx, fz) || 1;
      const nx = fx / fl, nz = fz / fl, rx = -nz, rz = nx;
      const face = (u, w, size, a) => v.sprites.put(SK.DOT, X + nx * R * 0.92 + rx * u * R, gy + w * R, Z + nz * R * 0.92 + rz * u * R, size * R, INK, a, INK, 0, 0, seed, 0);
      face(-0.3, 0.18, 0.32, 0.9); face(0.3, 0.18, 0.32, 0.9);
      face(0, -0.22, 0.26 + 0.06 * Math.sin(t * 7), 0.75);
      // stubby arms out to the sides, waving
      for (const sd of [-1, 1]) v.sprites.put(SK.PETAL, X + rx * sd * R * 1.05, gy - R * 0.1 + Math.sin(t * 8 + sd) * 0.04, Z + rz * sd * R * 1.05, R * 0.55, gc, 0.8, WHITE, 0.3, sd * (0.9 + sway), seed, 0);
      trail(v, r, RK.SMOKE, gc, 0.35, WHITE, 0, 0.22 * s, 0.1, 8);
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
      // (bigger than what it hits with: a bird you can see coming)
      const R = Math.max(0.55, pr.radius || 0.5) * 1.3 * s;
      if (pr.element === 'ice') iceBird(v, r, X, Y, Z, R, dx, dz, bc, seed, t);
      else fireBird(v, r, X, Y, Z, R, dx, dz, bc, seed, t);
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

/**
 * A thrown sun (Entei): a great ball of fire rolling slowly (big boiling
 * bumps would read as shards at this size), a crown of flame tongues licking
 * out all round its edge as seen, a heat glow, a broad wake of fire.
 */
function sun(v, r, X, Y, Z, R, dx, dz, fc, seed, t) {
  // (its heart a deep gold rather than white: a sun, not a flash)
  v.shells.put(VK.FIRE, X, Y, Z, R, dx, 0, dz, 1.1, fc, 1, SUN_CORE, 0.55, 0.12, seed, 0.35);
  v.shells.put(VK.FIRE, X, Y, Z, R * 1.12, dx, 0, dz, 1.12, col('#ff4400'), 0.75, SUN_CORE, 0.6, 0.35, seed + 3, 0.5);
  crown(v, X, Y, Z, R, fc, SUN_CORE, 1, seed, t, 14);
  v.sprites.put(SK.GLOW, X, Y, Z, R * 1.7, fc, 0.28, SUN_CORE, 1, 0, seed, 0);
  trail(v, r, RK.FIRE, fc, 1, HOT, 0.6, R * 0.9, 0.2, 16);
}
const SUN_CORE = col('#ffd04a'), SUN_FC = col('#ff7a1a'), STORM_C = col('#37474f');

/**
 * Pheasant Beak: a great bird of ice — a crystal body and beak, wings of
 * long ice feathers beating, a train of tail feathers, frost mist streaming
 * off it, glints. R is about half its wingspan over 1.6.
 */
function iceBird(v, r, X, Y, Z, R, dx, dz, c, seed, t) {
  const S = v.solids.shards, lx = -dz, lz = dx;
  const flap = Math.sin(t * 13 + seed) * 0.45;
  const HALF = Math.PI / 2;
  // body and head
  putAlong(S, X, Y, Z, dx, 0.04, dz, 0.8 * R, 1.15 * R, HALF, c, OK.ICE, 0, seed, 0.2);
  putAlong(S, X + dx * 0.95 * R, Y + 0.1 * R, Z + dz * 0.95 * R, dx, -0.12, dz, 0.36 * R, 0.62 * R, 0, c, OK.ICE, 0, seed + 1, 0.3);
  // wings: four feathers a side, swept back, beating
  for (let sd = -1; sd <= 1; sd += 2) {
    const rx = X + lx * sd * 0.12 * R + dx * 0.15 * R, ry = Y + 0.12 * R, rz = Z + lz * sd * 0.12 * R + dz * 0.15 * R;
    for (let i = 0; i < 4; i++) {
      const b = 0.22 + i * 0.3, ph = flap * (1 + i * 0.12) - i * 0.05;
      const cb = Math.cos(b), sb = Math.sin(b), cp = Math.cos(ph), spp = Math.sin(ph);
      const ex = cb * cp * lx * sd - sb * dx, ey = cb * spp, ez = cb * cp * lz * sd - sb * dz;
      const L = R * (0.95 - i * 0.13);
      putAlong(S, rx + ex * L, ry + ey * L, rz + ez * L, ex, ey, ez, L, 0.85 * R, HALF, c, OK.ICE, 0, seed + 3 + i + sd * 5, 0.15);
    }
  }
  // the tail: long feathers trailing, fanned a little
  for (let j = -1; j <= 1; j++) {
    const ex = -dx + lx * j * 0.2, ez = -dz + lz * j * 0.2, L = R * (0.95 - Math.abs(j) * 0.2);
    putAlong(S, X - dx * 0.7 * R + ex * L, Y - 0.05 * R, Z - dz * 0.7 * R + ez * L, ex, 0.06, ez, L, 0.7 * R, HALF, c, OK.ICE, 0, seed + 20 + j, 0.15);
  }
  const fr = col('#e1f5fe');
  v.sprites.put(SK.GLOW, X, Y, Z, R * 1.3, c, 0.3, WHITE, 0.6, 0, seed, 0);
  v.sprites.put(SK.STAR, X + dx * 1.2 * R, Y + 0.1 * R, Z + dz * 1.2 * R, 0.3 * R, c, 0.85, WHITE, 1, t * 5, seed, 0);
  trail(v, r, RK.SMOKE, fr, 0.75, WHITE, 0, 0.55 * R, 0.4, 12);
  const f = Math.floor(t * 24);
  for (let i = 0; i < 6; i++) {
    const ph = (t * 3 + i / 6) % 1, sd = i % 2 ? 1 : -1, off = (0.4 + hash(seed + i + f) * 1.1) * R * sd;
    v.sprites.put(SK.SPECK, X - dx * ph * 2.5 * R + lx * off, Y + (hash(seed + i * 3) - 0.3) * 0.6 * R - ph * 0.3, Z - dz * ph * 2.5 * R + lz * off, 0.035, fr, 1 - ph, WHITE, 0.4, f + i, seed + i, 0);
  }
}

/** A bird of fire: a burning body, wings of flame beating, a wake of fire. */
function fireBird(v, r, X, Y, Z, R, dx, dz, c, seed, t) {
  const lx = -dz, lz = dx;
  const flap = Math.sin(t * 13 + seed) * 0.5;
  v.shells.put(VK.FIRE, X, Y, Z, 0.32 * R, dx, 0, dz, 2.2, c, 1, HOT, 0.6, 0, seed);
  for (let sd = -1; sd <= 1; sd += 2) {
    const p1 = flap, p2 = flap * 1.35;
    const c1 = Math.cos(p1), s1 = Math.sin(p1), c2 = Math.cos(p2), s2 = Math.sin(p2);
    v.ribbons.start(RK.FIRE, RM.FACE, c, 1, HOT, 0.6)
      .point(X + lx * sd * 0.1 * R, Y + 0.05 * R, Z + lz * sd * 0.1 * R, 0.3 * R)
      .point(X + (lx * sd * c1) * 0.8 * R - dx * 0.25 * R, Y + s1 * 0.8 * R, Z + (lz * sd * c1) * 0.8 * R - dz * 0.25 * R, 0.24 * R)
      .point(X + (lx * sd * c2) * 1.6 * R - dx * 0.7 * R, Y + s2 * 1.6 * R, Z + (lz * sd * c2) * 1.6 * R - dz * 0.7 * R, 0.05 * R)
      .finish();
  }
  v.sprites.put(SK.GLOW, X, Y, Z, R * 1.4, c, 0.4, HOT, 1, 0, seed, 0);
  trail(v, r, RK.FIRE, c, 1, HOT, 0.6, 0.35 * R, 0.1, 12);
}

/**
 * A rubber punch's whip: speed lines running back along the stretched arm
 * from the fist to the shoulder, wavering as the rubber does, and a faint
 * smear of motion down its length. (The arm itself is the character's.)
 */
function rubberLines(v, o, X, Y, Z, dx, dz, s, seed, t) {
  if (o.alive === false) return;
  const sc = (o.look && o.look.scale) || 1;
  const sx = v.world.dx(v.ox, o.x) + dx * 0.25, sz = o.y - v.oy + dz * 0.25;
  // (from the shoulder the arm leaves, as its model has it: index.js fistY)
  const ov = v.view.actorViews && v.view.actorViews.get(o);
  const sy = ov && ov.shoulderY != null ? ov.shoulderY : v.ground(o.x, o.y) + (o.z || 0) + 1.3 * sc;
  const ax = X - sx, ay = Y - sy, az = Z - sz, L = Math.hypot(ax, ay, az);
  if (L < 0.6) return;
  const lx = -dz, lz = dx, f = Math.floor(t * 30);
  // the smear: a soft band of motion down the arm, brightest toward the fist
  v.ribbons.start(RK.SPEED, RM.FACE, WHITE, 0.32, WHITE, 0.2)
    .point(sx + ax * 0.15, sy + ay * 0.15, sz + az * 0.15, 0.05 * s)
    .point(X - dx * 0.15, Y, Z - dz * 0.15, 0.2 * s)
    .finish();
  for (let i = 0; i < 6; i++) {
    const th = hash(seed + i * 7 + f) * TAU, rr = (0.16 + 0.12 * hash(seed + i)) * s;
    const ox = lx * Math.cos(th) * rr, oy = Math.sin(th) * rr, oz = lz * Math.cos(th) * rr;
    const q0 = 0.08 + 0.12 * hash(seed + i * 3 + f), q1 = Math.min(0.95, q0 + 0.35 + 0.45 * hash(seed + i * 5 + f));
    const wob = Math.sin(t * 40 + i * 1.7) * 0.05 * s;
    v.ribbons.start(RK.SPEED, RM.FACE, WHITE, 0.75, WHITE, 0.35)
      .point(X - ax * q0 + ox, Y - ay * q0 + oy, Z - az * q0 + oz, 0.018 * s)
      .point(X - ax * (q0 + q1) * 0.5 + ox + lx * wob, Y - ay * (q0 + q1) * 0.5 + oy + wob, Z - az * (q0 + q1) * 0.5 + oz + lz * wob, 0.014 * s)
      .point(X - ax * q1 + ox, Y - ay * q1 + oy, Z - az * q1 + oz, 0.003)
      .finish();
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
