// The 3D effects layer. The fx engine (game/fx.js) keeps the state of every
// effect — shapes (smears, impact stars, rings, beams, lightning, domes,
// zones...) and particles — in plain lists; every frame this layer reads them
// and draws each as real 3D, through a handful of batches (one draw call
// each, whatever is going on):
//   sprites   camera-facing quads: particles and glows (sprites.js)
//   ribbons   polylines facing the camera or lying on the ground (ribbons.js)
//   surfaces  smears, shockwave bands and walls, ground decals (surfaces.js)
//   shells    spheres: shock bubbles, fireballs, domes, orbs (volumes.js)
//   tubes     beams, pillars, funnels (volumes.js)
//   solids    ice crystals, shards, rocks, fists (solids.js)
// and afterimages, real copies of the 3D bodies (ghosts.js).
// How each shape type maps onto them is in shapes.js, particles in
// particles.js, projectiles in projectiles.js.
//
// The 2D overlay (render/fx3d.js) asks claims(shape) / claimsPart(particle)
// and leaves out whatever is drawn here; anything not converted is still
// drawn the old way, and so are the floating numbers and sound words.
// Nothing here allocates per frame: the batches are preallocated, per-shape
// records (cached ground heights) come from a pool.
import * as THREE from 'three';
import { SHARED, noiseTexture, col, TAU } from './kit.js';
import { Sprites } from './sprites.js';
import { Ribbons } from './ribbons.js';
import { Surfaces, HeightPatch, SF } from './surfaces.js';
import { Shells, Tubes } from './volumes.js';
import { Solids } from './solids.js';
import { SHAPES } from './shapes.js';
import { drawParticles } from './particles.js';
import { Projectiles } from './projectiles.js';
import { Ghosts } from './ghosts.js';
import { prof } from '../../core/prof.js';
import { deckLift } from '../../world/hull.js';

const _m = new THREE.Matrix4();

/** Per-shape memory: the ground under it, anything worked out once. */
class Rec {
  constructor() { this.frame = 0; this.patch = null; this.gx = NaN; this.gy = NaN; this.g = 0; this.data = null; this.n = 0; }
  reset() { this.gx = NaN; this.gy = NaN; this.n = 0; if (this.patch) { this.patch.world = null; } this.data = null; }
}

export class VFX {
  constructor(view) {
    this.view = view;
    SHARED.uNoise.value = noiseTexture();
    this.group = new THREE.Group();
    this.group.name = 'vfx';
    this.sprites = new Sprites();
    this.ribbons = new Ribbons();
    this.surf = new Surfaces();
    this.shells = new Shells();
    this.tubes = new Tubes();
    this.solids = new Solids();
    for (const m of [this.surf.mesh, this.shells.mesh, this.tubes.mesh, this.sprites.mesh, this.ribbons.mesh]) this.group.add(m);
    for (const b of this.solids.all) this.group.add(b.mesh);
    view.scene.add(this.group);
    this.proj = new Projectiles(this);
    this.ghosts = new Ghosts(this);
    this.on = false;
    this.frame = 0;
    this.recs = new Map();
    this.pool = [];
    // (made once: forEach with it allocates nothing)
    this._sweep = (r, s) => {
      if (r.frame === this.frame) return;
      r.reset();
      this.pool.push(r);
      this.recs.delete(s);
    };
    this.broken = Object.create(null);
    this.low = false;
    this.world = null; this.ox = 0; this.oy = 0; this.time = 0;
    this.fp = false; this.player = null;
    // the decks of ships nearby, by half-metre cell, this frame (see ground)
    const DN = 256;
    this.dk = { x: new Int32Array(DN), y: new Int32Array(DN), f: new Int32Array(DN), h: new Float32Array(DN) };
    this.shipsNear = false;
    // the camera: position, right, up, forward (world, this frame)
    this.cp = new Float32Array(3); this.cr = new Float32Array(3); this.cu = new Float32Array(3); this.cf = new Float32Array(3);
  }

  setQuality(q) { this.low = q === 'low'; }

  // ------------------------------------------------------------------ what the 2D overlay leaves out
  /** Is this shape drawn here (for this 2D layer)? */
  claims(s, layer) {
    if (!this.on) return false;
    if (s.type === 'ghost') return this.ghosts.has(s);
    const h = SHAPES[s.type];
    if (!h || this.broken[s.type]) return false;
    return h.claims ? h.claims(s, layer) : true;
  }
  /** Is this particle drawn here? (all of them) */
  claimsPart() { return this.on; }

  // ------------------------------------------------------------------ the frame
  update(game, dt) {
    const fx = game.fx, w = game.world, v = this.view;
    if (!fx || !w || !game.player || !v.active) { this.hide(); return; }
    const t0 = performance.now();
    this.on = true;
    this.frame++;
    this.world = w; this.ox = v.ox; this.oy = v.oy;
    this.time = fx.time;
    this.fp = v.rig.mode === 'first';
    this.player = game.player;
    this.game = game;
    const cam = v.rig.camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    this.cr[0] = e[0]; this.cr[1] = e[1]; this.cr[2] = e[2];
    this.cu[0] = e[4]; this.cu[1] = e[5]; this.cu[2] = e[6];
    this.cf[0] = -e[8]; this.cf[1] = -e[9]; this.cf[2] = -e[10];
    this.cp[0] = e[12]; this.cp[1] = e[13]; this.cp[2] = e[14];
    // ships about: effects on their decks sit on the decks, not down at the sea
    this.shipsNear = false;
    const ships = game.ships, p = game.player;
    if (ships && game.deckAt) {
      for (let i = 0; i < ships.length; i++) {
        const sh = ships[i];
        if (sh.sunk || !sh.def) continue;
        const dx = w.dx(p.x, sh.x), dy = sh.y - p.y, R = 70 + sh.def.length;
        if (dx * dx + dy * dy < R * R) { this.shipsNear = true; break; }
      }
    }
    // shared uniforms: the clock (kept small, for precision), the sun in view and world space
    SHARED.uTime.value = fx.time % 600;
    const sky = v.sky;
    if (sky) {
      SHARED.uSunW.value.copy(sky.sunDir);
      _m.copy(cam.matrixWorldInverse);
      SHARED.uSunV.value.copy(sky.sunDir).transformDirection(_m);
      const day = game.env?.daylight ?? 1;
      SHARED.uSunCol.value.copy(sky.sunCol).multiplyScalar(0.35 + 0.75 * day);
      const amb = game.env?.ambient || [1, 1, 1];
      SHARED.uAmb.value.setRGB(amb[0] * 0.62, amb[1] * 0.64, amb[2] * 0.72);
    }
    // the near fade (first person: nothing within about a metre of the eye —
    // your own hands, a shot just leaving them) and the flash cap (docs/VFX.md)
    SHARED.uNearA.value = this.fp ? 0.75 : 0.25;
    SHARED.uNearB.value = this.fp ? 1.3 : 0.8;
    SHARED.uFlashMax.value = this.fp ? 0.45 : 0.9;
    // how far hit flashes are pulled toward the camera (third person: past your own back)
    this.pull = this.fp ? 0.6 : 2.6;

    // (once there's a body to copy: the afterimage shaders compile now, not at the first dash)
    if (!this.ghostsWarm) {
      const pv = v.actorViews.get(game.player);
      if (pv && pv.model) {
        this.ghostsWarm = true;
        this.ghosts.warm(pv);
        try { if (v.parallelCompile) v.compileAsync(this.ghosts.group); else v.renderer.compile(this.ghosts.group, cam, v.scene); } catch { /* (compiled when first drawn) */ }
        this.ghosts.unwarm();
      }
    }
    this.sprites.begin(); this.ribbons.begin(); this.surf.begin(); this.shells.begin(); this.tubes.begin(); this.solids.begin();
    this.ghosts.begin();
    const shapes = fx.shapes;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      if (s.delay > 0) continue;
      if (s.type === 'ghost') {
        const k = s.max > 0 ? Math.min(1, Math.max(0, 1 - s.life / s.max)) : 0;
        try { this.ghosts.draw(s, k, 1); } catch (err) { if (!this.ghostWarned) { this.ghostWarned = true; console.warn('vfx afterimage', err); } }
        continue;
      }
      const h = SHAPES[s.type];
      if (!h || this.broken[s.type]) continue;
      const k = s.max > 0 ? Math.min(1, Math.max(0, 1 - s.life / s.max)) : 0;
      const a = s.endT !== undefined ? Math.max(0, s.endT / 0.35) : 1;
      try { h.draw(this, s, k, a); } catch (err) { this.broken[s.type] = true; console.warn('vfx shape', s.type, err); }
    }
    let t1 = performance.now();
    prof('r.vfx.shapes', t0);
    try { drawParticles(this, fx.parts); } catch (err) { console.warn('vfx particles', err); this.on = false; }
    prof('r.vfx.parts', t1); t1 = performance.now();
    try { this.proj.update(game, dt); } catch (err) { console.warn('vfx projectiles', err); }
    this.sprites.end(); this.ribbons.end(); this.surf.end(); this.shells.end(); this.tubes.end(); this.solids.end();
    this.ghosts.end();
    this.sweep();
    prof('r.vfx.end', t1);
    prof('r.vfx', t0);
  }

  /**
   * Shader warm-up (Renderer3D.warmUp): the renderer only compiles what's
   * visible, and the batches are hidden while empty — so show them all for
   * the moment the compile is set off (and an afterimage of the player, if
   * there is one to copy), then put them back.
   */
  warmBegin() {
    const kids = this.group.children, was = this._warm || (this._warm = []);
    was.length = 0;
    for (let i = 0; i < kids.length; i++) { was.push(kids[i].visible); kids[i].visible = true; }
    const p = this.game?.player || this.view.game?.player;
    const view = p && this.view.actorViews.get(p);
    if (view) this.ghosts.warm(view);
  }
  warmEnd() {
    const kids = this.group.children, was = this._warm || [];
    for (let i = 0; i < kids.length && i < was.length; i++) kids[i].visible = was[i];
    this.ghosts.unwarm();
  }

  hide() {
    this.on = false;
    for (const m of this.group.children) m.visible = false;
    this.proj.clear();
    this.ghosts.clear();
    this.ghosts.group.visible = true; // (its children are what come and go)
  }

  /** Forget everything (a new world). */
  clear() {
    for (const r of this.recs.values()) { r.reset(); this.pool.push(r); }
    this.recs.clear();
    this.proj.clear();
    this.ghosts.clear();
  }

  // ------------------------------------------------------------------ per-shape records
  rec(s) {
    let r = this.recs.get(s);
    if (!r) { r = this.pool.pop() || new Rec(); this.recs.set(s, r); }
    r.frame = this.frame;
    return r;
  }
  sweep() { this.recs.forEach(this._sweep); }
  /** The ground heights round a shape (cached while it stays put). */
  patch(s, x, y, R) {
    const r = this.rec(s);
    if (!r.patch) r.patch = new HeightPatch(9);
    return r.patch.at(this, x, y, Math.max(0.5, R));
  }
  /** The ground height under a shape's spot (cached while it stays put). */
  groundOf(s, x = s.x, y = s.y) {
    const r = this.rec(s);
    if (r.gx !== x || r.gy !== y) { r.gx = x; r.gy = y; r.g = this.view.ground(x, y); }
    return r.g;
  }

  // ------------------------------------------------------------------ coordinates
  /** World tiles → this frame's 3D space (x east, z south, y up). */
  lx(x) { return this.world.dx(this.ox, x); }
  lz(y) { return y - this.oy; }
  /** What effects stand on at (x, y): a ship's deck where there is one (rocking with her), else the ground. */
  ground(x, y) {
    if (this.shipsNear) {
      const h = this.deckH(x, y);
      if (h === h) return h;
    }
    return this.view.ground(x, y);
  }
  /** The deck height under (x, y), or NaN — looked up once a frame per half-metre cell. */
  deckH(x, y) {
    const D = this.dk, cx = Math.floor(x * 2), cy = Math.floor(y * 2);
    const i = ((cx * 73856093) ^ (cy * 19349663)) & 255;
    if (D.f[i] === this.frame && D.x[i] === cx && D.y[i] === cy) return D.h[i];
    const g = this.game, dk = g.deckAt(x, y, 0);
    const h = dk ? deckLift(dk, g.env?.time || 0) : NaN;
    D.f[i] = this.frame; D.x[i] = cx; D.y[i] = cy; D.h[i] = h;
    return h;
  }
  /** First person: is a shape at (s.x, s.y), h high, on the player's own body? */
  onSelf(s, h = 1) {
    if (!this.fp || h > 2.5) return false;
    const p = this.player;
    return Math.abs(this.world.dx(p.x, s.x)) < 0.6 && Math.abs(s.y - p.y) < 0.6 && Math.hypot(this.world.dx(p.x, s.x), s.y - p.y) < 0.6;
  }

  // ------------------------------------------------------------------ builders shared by the shapes
  /**
   * A band round a ring lying on the ground (heights from a patch), and
   * optionally a wall standing up off it: ring radius R, half-width hw,
   * wall height wh. A wobble (amplitude, lobes, phase) bends the radius.
   */
  groundRing(patch, x, y, R, hw, c, alpha, c2, w, core = 0.7, wh = 0, wallAlpha = 0.6, wobA = 0, lobes = 9, phase = 0, seed = 0, k = 0) {
    const S = this.surf;
    const n = Math.max(24, Math.min(72, Math.round(R * 9)));
    const wall = wh > 0;
    if (!S.room((n + 1) * (wall ? 4 : 2), n * (wall ? 4 : 2))) return;
    const X = this.lx(x), Z = this.lz(y);
    const lean = 1 + 0.12 * wh / Math.max(R, 0.3);
    // the ring once round: the ground under it (one sample a step: the band is narrow), its points
    const P = this._ring || (this._ring = new Float32Array(73 * 4));
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * TAU, cs = Math.cos(th), sn = Math.sin(th);
      const rr = wobA ? R * (1 + wobA * Math.sin(th * lobes + phase)) : R;
      P[i * 4] = cs; P[i * 4 + 1] = sn; P[i * 4 + 2] = rr; P[i * 4 + 3] = patch.get(cs * rr, sn * rr);
    }
    S.style(SF.BAND, c, alpha, c2, w, k, seed);
    const v0 = S.nv;
    for (let i = 0; i <= n; i++) {
      const cs = P[i * 4], sn = P[i * 4 + 1], rr = P[i * 4 + 2], gy = P[i * 4 + 3] + 0.05;
      S.vert(X + cs * (rr - hw), gy, Z + sn * (rr - hw), i / n, -1, core);
      S.vert(X + cs * (rr + hw), gy, Z + sn * (rr + hw), i / n, 1, core);
    }
    S.grid(v0, 2, n + 1);
    if (wall) {
      S.style(SF.WALL, c, alpha * wallAlpha, c2, w, k, seed);
      const v1 = S.nv;
      for (let i = 0; i <= n; i++) {
        const cs = P[i * 4], sn = P[i * 4 + 1], rr = P[i * 4 + 2], gy = P[i * 4 + 3];
        // (leaning outward a little as it rises: a wave front, not a fence)
        S.vert(X + cs * rr, gy + 0.02, Z + sn * rr, i / n, 0, core);
        S.vert(X + cs * rr * lean, gy + wh, Z + sn * rr * lean, i / n, 1, core);
      }
      S.grid(v1, 2, n + 1);
    }
  }

  /**
   * A ring band in a plane through (X, Y, Z) (3D, already local) spanned by
   * unit vectors a and b: radius R, half-width hw.
   */
  planeRing(X, Y, Z, ax, ay, az, bx, by, bz, R, hw, c, alpha, c2, w, core = 0.7, seed = 0, k = 0, n = 40, a0 = 0, a1 = TAU) {
    const S = this.surf;
    if (!S.room((n + 1) * 2, n * 2)) return;
    S.style(SF.BAND, c, alpha, c2, w, k, seed);
    const v0 = S.nv;
    for (let i = 0; i <= n; i++) {
      const th = a0 + (a1 - a0) * (i / n), cs = Math.cos(th), sn = Math.sin(th);
      for (let j = 0; j < 2; j++) {
        const r = R + (j ? hw : -hw);
        S.vert(X + (ax * cs + bx * sn) * r, Y + (ay * cs + by * sn) * r, Z + (az * cs + bz * sn) * r, i / n, j ? 1 : -1, core);
      }
    }
    S.grid(v0, 2, n + 1);
  }

  /**
   * A square of ground (2R across, turned by `ang`), following the ground,
   * painted by surface kind `kind`; its own coordinates run −1..1 (scaled by
   * sx, sy). e1, e2 are passed through to the shader.
   */
  decal(patch, x, y, R, ang, kind, c, alpha, c2, w, k, seed, prm = 0, e1 = 0, e2 = 0, cells = 8, lift = 0.04) {
    const S = this.surf, n = cells + 1;
    if (!S.room(n * n, cells * cells * 2)) return;
    const X = this.lx(x), Z = this.lz(y), ca = Math.cos(ang), sa = Math.sin(ang);
    S.style(kind, c, alpha, c2, w, k, seed, prm);
    const v0 = S.nv;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (i / cells) * 2 - 1, v = (j / cells) * 2 - 1;
        const dx = (u * ca - v * sa) * R, dy = (u * sa + v * ca) * R;
        S.vert(X + dx, patch.get(dx, dy) + lift, Z + dy, u, v, e1, e2);
      }
    }
    S.grid(v0, n, n);
  }
}

export { col };
