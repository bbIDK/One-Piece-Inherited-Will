// Visual effects engine: particles, damage numbers and callouts, shapes
// (weapon smears, impact stars, rings, beams, lightning, telegraphs, zone
// visuals, afterimages...), screen shake with a directional kick, hit-stop,
// slow motion, focus lines and anime impact frames.
//
// Shape drawers live in render/fxshapes.js; the combat "visual language"
// (what a hit, a parry or each technique spawns) lives in render/combatfx.js.
import { TAU } from '../core/math.js';
import { drawShapeLayer, hasLayer } from '../render/fxshapes.js';
import { starPath } from '../render/character.js';
import * as CFX from '../render/combatfx.js';
import { drawShapes3d, drawParticles3d, textPlace3d, drawFirstPerson } from '../render/fx3d.js';

const NUMERIC = /^[+-]?\d[\d,.]*$/;
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c || typeof document === 'undefined') return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  // a white-hot centre
  const g2 = g.createRadialGradient(32, 32, 0, 32, 32, 12);
  g2.addColorStop(0, 'rgba(255,255,255,0.9)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = g2; g.fillRect(0, 0, 64, 64);
  if (glowCache.size > 64) glowCache.clear();
  glowCache.set(color, c);
  return c;
}

/** A manga sound word: black ink outline, white rim, a bright gradient fill, popping in. */
function drawSfx(g, t, sx, sy, fz, dpr) {
  const age = t.age, k = age / t.max;
  const pop = age < 0.08 ? 2.1 - (age / 0.08) * 1.1 : 1 + (age - 0.08) * 0.22;
  const px = Math.round(t.size * Math.max(fz, 30) * 1.25 * pop);
  if (px < 6) return;
  const c = Math.cos(t.rot), s = Math.sin(t.rot);
  const jit = age < 0.14 ? (Math.random() - 0.5) * px * 0.08 : 0;
  g.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, (sx + jit) * dpr, sy * dpr);
  g.globalAlpha = k > 0.72 ? Math.max(0, (1 - k) / 0.28) : 1;
  g.font = `${px}px Bangers, Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = px * 0.3; g.strokeStyle = '#140c0c'; g.strokeText(t.str, 0, 0);
  g.lineWidth = px * 0.12; g.strokeStyle = '#ffffff'; g.strokeText(t.str, 0, 0);
  const gr = g.createLinearGradient(0, -px * 0.5, 0, px * 0.5);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, t.color); gr.addColorStop(1, t.color);
  g.fillStyle = gr; g.fillText(t.str, 0, 0);
  g.textBaseline = 'alphabetic';
}

export class FX {
  constructor(game) {
    this.game = game;
    this.parts = [];
    this.texts = [];
    this.ripples = []; // new rings on the water, picked up by the 3D view
    this.shapes = []; // rings, smears, beams, bolts, telegraphs, zones, afterimages...
    this.trauma = 0;
    this.hitstop = 0;
    this.impact = 0; // impact-frame flash timer
    this.impactColor = null;
    this.flash = 0;
    this.flashColor = null;
    this.maxParts = 600;
    this.maxShapes = 260;
    this.time = 0;
    this.kickX = 0; this.kickY = 0; // directional camera kick (css px)
    this.slow = null;
    this.focusT = 0; this.focusMax = 0.2; this.focusX = 0; this.focusY = 0;
    this.nums = new Map(); // live damage number per target (combines rapid hits)
    this._slowOwned = false;
    this._cam = null;
  }

  // ------------------------------------------------------------------ feel
  /** Random screen shake; with an angle it also kicks the camera that way. */
  shake(amount, angle) {
    this.trauma = Math.min(1.2, this.trauma + amount);
    if (angle !== undefined) this.kick(angle, amount * 14);
  }
  /** Jolt the camera `px` css pixels toward `angle` (springs back quickly). */
  kick(angle, px) {
    this.kickX += Math.cos(angle) * px;
    this.kickY += Math.sin(angle) * px * 0.75;
    const m = Math.hypot(this.kickX, this.kickY);
    if (m > 16) { this.kickX *= 16 / m; this.kickY *= 16 / m; }
  }
  stop(t) { this.hitstop = Math.max(this.hitstop, t); }
  impactFrame(t = 0.08, color = null) { this.impact = Math.max(this.impact, t); this.impactColor = color; }
  flashScreen(t = 0.1, color = null) { this.flash = Math.max(this.flash, t); this.flashColor = color; }
  /** Slow the whole simulation to `scale` for `t` seconds (ramps back to normal). */
  slowmo(t = 0.3, scale = 0.35) {
    if (this.slow && this.slow.t > t && this.slow.scale <= scale) return;
    this.slow = { t, max: t, scale };
  }
  /** Anime focus lines converging on a world point. */
  focus(x, y, t = 0.18) { this.focusX = x; this.focusY = y; this.focusT = Math.max(this.focusT, t); this.focusMax = Math.max(0.05, this.focusT); }

  /**
   * Height hidden in a y offset. The top-down view draws "north" and "up" the
   * same way, so plenty of callers write y - 1.5 for "over the head". In the
   * 3D view that would be 1.5 m to the north: when an actor stands right
   * below such a spot, the offset is handed back as height instead.
   */
  lift3d(x, y, always) {
    const g = this.game;
    if ((this._cfx && !always) || !g.view3d || !g.view3d.active || !g.actors) return 0;
    const w = g.world;
    let best = 0, bd = 0.45;
    for (const a of g.actors) {
      if (!a.alive) continue;
      const dy = a.y - y;
      if (dy < 0.45 || dy > 2.8) continue;
      const dx = Math.abs(w ? w.dx(x, a.x) : a.x - x);
      if (dx < bd) { bd = dx; best = dy; }
    }
    return best;
  }

  // ------------------------------------------------------------------ particles
  particle(p) {
    if (!this._inBurst) { const l = this.lift3d(p.x, p.y); if (l) { p.y += l; p.z = (p.z ?? 0.5) + l; } }
    if (this.parts.length >= this.maxParts) this.parts.shift();
    p.life = p.life ?? 0.6;
    p.max = p.life;
    p.z = p.z ?? 0.5;
    p.vz = p.vz ?? 0;
    p.g = p.g ?? 0;
    p.drag = p.drag ?? 2;
    p.size = p.size ?? 0.12;
    p.grow = p.grow ?? 0;
    p.vx = p.vx ?? 0; p.vy = p.vy ?? 0;
    if (p.add === undefined) p.add = p.kind === 'spark' || p.kind === 'fire' || p.kind === 'ember' || p.kind === 'glow' || p.kind === 'star';
    this.parts.push(p);
    return p;
  }

  burst(x, y, n, o = {}) {
    const lift = this.lift3d(x, y);
    if (lift) { y += lift; o = { ...o, z: (o.z ?? 0.6) + lift }; }
    this._inBurst = true;
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? Math.random() * TAU) + (o.spread !== undefined ? (Math.random() - 0.5) * o.spread : 0);
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.8);
      this.particle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7,
        z: (o.z ?? 0.6) + (o.zJitter ? (Math.random() - 0.5) * o.zJitter : 0), vz: o.vz !== undefined ? o.vz * (0.5 + Math.random()) : Math.random() * 3,
        g: o.g ?? 9, life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.8), size: (o.size ?? 0.1) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color || '#fff',
        kind: o.kind || 'spark', drag: o.drag ?? 3, grow: o.grow ?? 0, add: o.add, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
      });
    }
    this._inBurst = false;
  }

  // ------------------------------------------------------------------ text
  /**
   * Floating text. Numbers pop and drift; words are callouts ("PARRY!",
   * technique names): identical callouts on the same spot are merged and
   * texts stack upward instead of piling on top of each other.
   */
  text(x, y, str, color = '#fff', size = 0.42, o = {}) {
    str = String(str);
    const lift = this.lift3d(x, y, true); // (words always float over someone)
    if (lift) y += lift;
    const num = NUMERIC.test(str);
    if (!num) {
      for (const t of this.texts) {
        if (t.str === str && Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1 && t.age < 0.4) { t.life = t.max; t.pop = 0; return t; }
      }
    }
    let bump = 0;
    for (const t of this.texts) if (!t.dmg && Math.abs(t.x - x) < 1.2 && Math.abs(t.y - y) < 0.6 && t.age < 0.3) bump++;
    const life = o.life ?? (num ? 0.8 : 0.95);
    const t = {
      x: x + (Math.random() - 0.5) * (num ? 0.5 : 0.15), y, z: 1.6 + bump * 0.34 + lift, str, color, size, life, max: life, vz: num ? 2.4 : 2.0,
      crit: o.crit, pop: 0, age: 0, kind: num ? 'num' : 'call',
    };
    this.texts.push(t);
    if (this.texts.length > 48) this.texts.shift();
    return t;
  }
  /**
   * A manga sound word at a hit ("DON!", "ZUBAN!", "GOOO!"): big, tilted,
   * inked, popping in and hanging a moment. Rate-limited so fights stay readable.
   */
  sfx(x, y, str, color = '#ffd54f', size = 0.7, o = {}) {
    const now = this.time;
    if (now - (this._sfxT ?? -9) < (o.gap ?? 0.28)) return null;
    this._sfxT = now;
    const life = o.life ?? 0.75;
    const t = { x: x + (Math.random() - 0.5) * 0.4, y, z: (o.z ?? 1.25) + Math.random() * 0.3, str, color, size, life, max: life, vz: 0.35, pop: 0, age: 0, kind: 'sfx', rot: (Math.random() - 0.5) * 0.5 };
    this.texts.push(t);
    if (this.texts.length > 48) this.texts.shift();
    return t;
  }
  /** Callout text over a spot (merged when repeated). */
  callout(x, y, str, color = '#fff', size = 0.4, o = {}) { return this.text(x, y, str, color, size, { life: 0.9, ...o }); }

  /** Damage number over a target; rapid hits on the same target add up. */
  damage(tgt, n, o = {}) {
    if (!(n > 0)) return null;
    const cur = this.nums.get(tgt);
    if (cur && cur.life > 0 && this.time - cur.last < 0.42 && !!cur.blocked === !!o.blocked && this.texts.includes(cur)) {
      cur.value += n; cur.str = String(Math.round(cur.value)); cur.last = this.time; cur.pop = 0; cur.life = cur.max; cur.hits++;
      if (o.crit) { cur.crit = true; cur.color = o.color || '#ffd740'; }
      cur.size = this.numSize(cur.value, cur.crit);
      return cur;
    }
    const life = o.blocked ? 0.6 : 0.95;
    const col = o.color || (o.blocked ? '#b0bec5' : o.crit ? '#ffd740' : o.toPlayer ? '#ff5252' : '#ffffff');
    const scale = (tgt.look && tgt.look.scale) || 1;
    const t = {
      x: tgt.x, y: tgt.y, ox: (Math.random() - 0.5) * 0.35, oy: 1.25 * scale, follow: tgt, z: 0.35, vz: 1.6, vx: (Math.random() - 0.5) * 0.6,
      str: String(Math.round(n)), value: n, color: col, size: this.numSize(n, o.crit), life, max: life, pop: 0, age: 0, last: this.time,
      dmg: true, crit: !!o.crit, blocked: !!o.blocked, hits: 1, kind: 'num',
    };
    this.texts.push(t);
    this.nums.set(tgt, t);
    if (this.texts.length > 48) this.texts.shift();
    return t;
  }
  numSize(v, crit) { return 0.4 * (1 + Math.min(0.5, Math.log10(Math.max(1, v)) / 6)) * (crit ? 1.2 : 1); }

  // ------------------------------------------------------------------ shapes
  /** Generic shape: fx.add('crescent', { x, y, ...options, life }). */
  add(type, o = {}) {
    const life = o.life ?? 0.3;
    const s = { seed: Math.random() * 1000, ...o, type, life, max: life, age: 0 };
    if (this.shapes.length >= this.maxShapes) {
      // drop the oldest short-lived effect (never persistent ones like zones)
      const i = this.shapes.findIndex((x) => !x.until && !x.zone && x.type !== 'tele');
      this.shapes.splice(i >= 0 ? i : 0, 1);
    }
    this.shapes.push(s);
    return s;
  }
  ring(x, y, r0, r1, color, life = 0.4, width = 0.15, o = {}) { return this.add('ring', { x, y, r0, r1, color, life, width, ...o }); }
  /** A ring spreading on the water's surface at (x, y) (drawn by the 3D view: render3d/ripples3d.js). */
  ripple(x, y, size = 1, strength = 1) { this.ripples.push({ x, y, size, strength }); if (this.ripples.length > 40) this.ripples.shift(); }
  slash(x, y, angle, radius, arc, color = '#fff', life = 0.18, width = 0.25) { return this.add('slash', { x, y, angle, radius, arc, color, life, width }); }
  beam(x, y, angle, length, width, color, life = 0.25, core = '#fff', o = {}) { return this.add('beam', { x, y, angle, length, width, color, core, life, ...o }); }
  bolt(x0, y0, x1, y1, color = '#fff176', life = 0.2, width = 0.08, o = {}) { return this.add('bolt', { x: x0, y: y0, x0, y0, x1, y1, color, life, width, ...o }); }
  telegraph(x, y, shape, o) { return this.add('tele', { x, y, shape, ...o, life: o.life }); }
  crack(x, y, r, life = 2) { return this.add('crack', { x, y, r, life, seed: Math.random() * 100 }); }
  decal(x, y, r, color, life = 3) { return this.add('decal', { x, y, r, color, life }); }

  // ------------------------------------------------------------------ combat recipes (see render/combatfx.js)
  // (these place heights with z themselves: no y-offset guessing for the 3D view inside them)
  cfx(fn) { const was = this._cfx; this._cfx = true; try { return fn(); } finally { this._cfx = was; } }
  hit(att, tgt, h, info) { return this.cfx(() => CFX.hitFeedback(this, att, tgt, h, info)); }
  parry(tgt, att, ang) { return this.cfx(() => CFX.parryFx(this, tgt, att, ang)); }
  guardBreak(tgt, att, ang) { return this.cfx(() => CFX.guardBreakFx(this, tgt, att, ang)); }
  tech(actor, step, action, kind, extra) { return this.cfx(() => CFX.techFx(this, actor, step, action, kind, extra)); }
  zone(zone, spec, actor, action) { return this.cfx(() => CFX.zoneFx(this, zone, spec, actor, action)); }
  explosion(x, y, e, owner) { return this.cfx(() => CFX.explosionFx(this, x, y, e, owner)); }
  projTrail(p, t) { return this.cfx(() => CFX.projTrailFx(this, p, t)); }
  conqueror(actor, c) { return this.cfx(() => CFX.conquerorFx(this, actor, c)); }
  afterimage(actor, o) { return this.cfx(() => CFX.afterimage(this, actor, o)); }

  // ------------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    this.hookCamera();
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.impact = Math.max(0, this.impact - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.focusT = Math.max(0, this.focusT - dt);
    const kd = Math.exp(-dt * 16);
    this.kickX *= kd; this.kickY *= kd;
    if (Math.abs(this.kickX) < 0.05) this.kickX = 0;
    if (Math.abs(this.kickY) < 0.05) this.kickY = 0;
    this.updateSlow(dt);
    // effects crawl during hit-stop and slow motion (the freeze reads as impact)
    const sdt = dt * (this.hitstop > 0 ? 0.3 : 1) * (this._slowOwned ? this.game.slowmo || 1 : 1);
    const w = this.game.world;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= sdt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * sdt);
      p.vx *= k; p.vy *= k;
      p.x = w ? w.wx(p.x + p.vx * sdt) : p.x + p.vx * sdt;
      p.y += p.vy * sdt;
      p.vz -= p.g * sdt;
      p.z += p.vz * sdt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.size = Math.max(0.005, p.size + p.grow * sdt);
      if (p.vr) p.rot = (p.rot || 0) + p.vr * sdt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.age += dt; t.pop += dt;
      if (t.dmg && t.follow && t.follow.alive !== false && this.time - t.last < 0.42) {
        t.x = t.follow.x + t.ox; t.y = t.follow.y; t.z += 0.25 * dt;
      } else if (t.dmg) {
        t.vz -= 3.5 * dt; t.z += Math.max(t.vz, 0.3) * dt; t.x += (t.vx || 0) * dt;
      } else {
        t.vz -= 5 * dt; t.z += Math.max(t.vz, 0.2) * dt;
      }
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        if (t.follow && this.nums.get(t.follow) === t) this.nums.delete(t.follow);
      }
    }
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (s.delay > 0) {
        s.delay -= sdt;
        if (s.delay > 0) continue;
        if (s.onStart) { s.onStart(s); s.onStart = null; }
      }
      if (s.follow) { const f = s.follow; if (f.alive !== false) { s.x = f.x + (s.ox || 0); s.y = f.y + (s.oy || 0); } }
      s.age += sdt;
      if (s.endT !== undefined) { s.endT -= sdt; if (s.endT <= 0) this.shapes.splice(i, 1); continue; }
      if ((s.until && !s.until(s)) || (s.zone && !(s.zone.t > 0))) { s.endT = 0.35; continue; }
      s.life -= sdt;
      if (s.life <= 0) this.shapes.splice(i, 1);
    }
    for (const [tgt, t] of this.nums) if (t.life <= 0 || !tgt.alive) this.nums.delete(tgt);
    this.trackMotion(dt);
  }

  updateSlow(dt) {
    const g = this.game;
    if (this.slow) {
      this.slow.t -= dt;
      const k = 1 - Math.max(0, this.slow.t) / this.slow.max;
      const s = this.slow.scale;
      g.slowmo = k < 0.55 ? s : s + (1 - s) * ((k - 0.55) / 0.45);
      this._slowOwned = true;
      if (this.slow.t <= 0) { this.slow = null; g.slowmo = 1; this._slowOwned = false; }
    }
  }

  /** Afterimages, sprint dust, knockback skids and landing puffs for actors near the camera. */
  trackMotion(dt) {
    const g = this.game, p = g.player;
    if (!p || !g.actors || !g.world) return;
    const w = g.world;
    for (const a of g.actors) {
      if (!a.alive || a.hidden || a.onShip) continue;
      if (Math.abs(w.dx(p.x, a.x)) > 28 || Math.abs(a.y - p.y) > 18) continue;
      this._cfx = true;
      try { CFX.motion(this, a, dt); } finally { this._cfx = false; }
    }
  }

  /**
   * Directional kick: the renderer's camera shake offsets are read through
   * accessors that add the kick on top of the random trauma shake.
   */
  hookCamera() {
    const cam = this.game.renderer && this.game.renderer.cam;
    if (!cam || cam === this._cam) return;
    this._cam = cam;
    const fx = this;
    try {
      let sx = cam.shakeX || 0, sy = cam.shakeY || 0;
      Object.defineProperty(cam, 'shakeX', { configurable: true, enumerable: true, get() { return sx + fx.kickX; }, set(v) { sx = v; } });
      Object.defineProperty(cam, 'shakeY', { configurable: true, enumerable: true, get() { return sy + fx.kickY; }, set(v) { sy = v; } });
    } catch { /* no directional kick then */ }
  }

  // ------------------------------------------------------------------ drawing
  shapeCtx(r) {
    const w = this.game.world;
    const c = { t: this.time, fx: this, s: null, rel: (x, y) => [w.dx(c.s.x, x), y - c.s.y] };
    return c;
  }

  drawShapes(g, r, layer) {
    const w = this.game.world;
    const z = r.cam.zoom, dpr = r.dpr;
    const c = this.shapeCtx(r);
    for (const s of this.shapes) {
      if (s.delay > 0 || !hasLayer(s.type, layer)) continue;
      const [sx, sy] = r.toScreen(w, s.x, s.y);
      const m = (s.type === 'beam' ? (s.length || 0) : s.type === 'bolt' || s.type === 'cutline' || s.type === 'strings' ? 20 : (s.r || s.radius || s.size || 2) + 3) * z + 80;
      if (sx < -m || sy < -m - 6 * z || sx > r.cw + m || sy > r.ch + m) continue;
      g.save();
      g.setTransform(dpr * z, 0, 0, dpr * z, sx * dpr, sy * dpr);
      c.s = s;
      const k = s.max > 0 ? Math.min(1, Math.max(0, 1 - s.life / s.max)) : 0;
      try { drawShapeLayer(g, s, layer, k, 1, c); } catch (e) { s.life = 0; if (!this._warned) { this._warned = true; console.warn('fx shape', s.type, e); } }
      g.restore();
    }
  }

  /** Ground-level shapes (drawn before entities). */
  drawGround(g, r) {
    this.drawShapes(g, r, 'ground');
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Air-level effects (after entities). In the 3D view: everything, projected (see render/fx3d.js). */
  draw(g, r) {
    if (r.is3d) {
      drawShapes3d(this, g, r);
      const part = (gg, p, vx, vy) => this.drawPart(gg, p, vx, vy);
      drawParticles3d(this, g, r, false, part);
      g.globalCompositeOperation = 'lighter';
      drawParticles3d(this, g, r, true, part);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      this.drawTexts(g, r, (t) => textPlace3d(r, t));
      g.globalAlpha = 1;
      drawFirstPerson(this, g, r);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    this.drawShapes(g, r, 'air');
    this.drawParticles(g, r, false);
    g.globalCompositeOperation = 'lighter';
    this.drawParticles(g, r, true);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    this.drawTexts(g, r);
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawParticles(g, r, additive) {
    const w = this.game.world;
    const z = r.cam.zoom, dpr = r.dpr;
    for (const p of this.parts) {
      if (!!p.add !== additive) continue;
      const [sx, sy] = r.toScreen(w, p.x, p.y);
      if (sx < -60 || sy < -140 || sx > r.cw + 60 || sy > r.ch + 60) continue;
      g.setTransform(dpr * z, 0, 0, dpr * z, sx * dpr, (sy - p.z * z) * dpr);
      this.drawPart(g, p, p.vx, p.vy - p.vz * 0.6);
    }
  }

  /** One particle at the current transform (tile units); (vx, vy) its on-screen velocity. */
  drawPart(g, p, vx, vy) {
    const a = Math.min(1, (p.life / p.max) * 1.6);
    g.globalAlpha = a * (p.alpha ?? 1);
    const sz = p.size;
    switch (p.kind) {
      case 'spark':
      case 'line': {
        const sp = Math.hypot(vx, vy) || 1;
        const L = Math.min(0.7, sp * 0.04 + sz * 0.5);
        g.strokeStyle = p.color; g.lineWidth = Math.max(0.018, sz * 0.5); g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-vx / sp * L, -vy / sp * L); g.stroke();
        break;
      }
      case 'smoke':
        g.globalAlpha *= 0.7;
        g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, sz, 0, TAU); g.fill(); break;
      case 'dust':
        g.globalAlpha *= 0.5;
        g.fillStyle = p.color; g.beginPath(); g.ellipse(0, 0, sz, sz * 0.7, 0, 0, TAU); g.fill(); break;
      case 'fire': {
        const spr = glowSprite(p.color);
        const rr = sz * (0.6 + 0.6 * a) * 1.8;
        if (spr) g.drawImage(spr, -rr, -rr, rr * 2, rr * 2);
        else { g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, sz * (0.5 + a * 0.5), 0, TAU); g.fill(); }
        break;
      }
      case 'glow': {
        const spr = glowSprite(p.color);
        if (spr) g.drawImage(spr, -sz, -sz, sz * 2, sz * 2);
        break;
      }
      case 'ember':
        g.globalAlpha *= 0.6 + 0.4 * Math.sin(p.life * 40 + p.x * 10);
        g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, sz * 0.5, 0, TAU); g.fill(); break;
      case 'petal':
      case 'leaf':
        g.fillStyle = p.color; g.rotate(p.rot || p.life * 6); g.beginPath(); g.ellipse(0, 0, sz, sz * 0.5, 0, 0, TAU); g.fill(); break;
      case 'star':
        g.fillStyle = p.color; starPath(g, 0, 0, sz * 1.2, p.points || 4, 0.4, p.rot || 0); g.fill(); break;
      case 'bubble':
        g.strokeStyle = p.color; g.lineWidth = 0.03; g.beginPath(); g.arc(0, 0, sz, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(-sz * 0.35, -sz * 0.35, sz * 0.25, 0, TAU); g.fill(); break;
      case 'shard':
        g.fillStyle = p.color; g.rotate(p.rot || 0);
        g.beginPath(); g.moveTo(sz, 0); g.lineTo(-sz * 0.6, -sz * 0.4); g.lineTo(-sz * 0.3, sz * 0.45); g.closePath(); g.fill(); break;
      case 'drop': {
        g.rotate(Math.atan2(vy, vx));
        g.fillStyle = p.color; g.beginPath(); g.moveTo(sz * 1.6, 0); g.quadraticCurveTo(0, -sz, -sz * 0.4, 0); g.quadraticCurveTo(0, sz, sz * 1.6, 0); g.fill();
        break;
      }
      case 'sand':
        g.fillStyle = p.color; g.fillRect(-sz / 2, -sz / 2, sz, sz); break;
      case 'ring':
        g.strokeStyle = p.color; g.lineWidth = 0.03; g.beginPath(); g.ellipse(0, 0, sz, sz * 0.62, 0, 0, TAU); g.stroke(); break;
      default:
        g.fillStyle = p.color; g.fillRect(-sz / 2, -sz / 2, sz, sz);
    }
  }

  drawTexts(g, r, place) {
    const w = this.game.world;
    const z = r.cam.zoom, dpr = r.dpr;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    for (const t of this.texts) {
      let sx, sy, fz = Math.min(z, 44);
      if (place) {
        const q = place(t);
        if (!q) continue;
        [sx, sy, fz] = q;
      } else {
        [sx, sy] = r.toScreen(w, t.x, t.y);
        sy -= (t.dmg ? t.oy + t.z : t.z) * z;
      }
      if (t.kind === 'sfx') { drawSfx(g, t, sx, sy, fz, dpr); continue; }
      const fade = t.dmg ? Math.min(1, t.life / (t.max * 0.4)) : Math.min(1, (t.life / t.max) * 2.4);
      const pk = Math.min(1, t.pop / 0.13);
      const pop = 1 + (t.dmg ? 0.6 : 0.3) * (1 - pk) * (1 - pk);
      g.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
      g.globalAlpha = fade;
      const px = Math.round(t.size * fz * pop * (t.crit && !t.dmg ? 1.35 : 1));
      if (px < 4) continue;
      if (t.crit && t.dmg) {
        // a gold burst behind critical numbers
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fade * 0.55 * (0.6 + 0.4 * (1 - pk));
        g.fillStyle = '#ff9100';
        starPath(g, 0, -px * 0.35, px * 0.95, 8, 0.45, t.age * 1.5); g.fill();
        g.restore();
      }
      g.font = `${px}px Bangers, Impact, sans-serif`;
      const combo = t.dmg && t.hits >= 3;
      const wd = combo ? g.measureText(t.str).width : 0;
      g.lineWidth = Math.max(2, px * 0.17);
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(t.str, 0, 0);
      g.fillStyle = t.color;
      g.fillText(t.str, 0, 0);
      if (combo) {
        // multi-hit counter beside the combined number
        const sp = Math.round(px * 0.5);
        const x0 = wd / 2 + px * 0.08;
        g.font = `${sp}px Bangers, Impact, sans-serif`;
        g.lineWidth = Math.max(2, sp * 0.2);
        g.textAlign = 'left';
        g.strokeText('x' + t.hits, x0, -px * 0.02);
        g.fillStyle = '#ffe082';
        g.fillText('x' + t.hits, x0, -px * 0.02);
        g.textAlign = 'center';
      }
    }
  }

  /** Screen-space post effects (impact frames, flashes, slow-mo vignette, focus lines). */
  drawScreen(g, r) {
    const W = r.canvas.width, H = r.canvas.height;
    const fp = this.focusT > 0 ? (r.is3d ? r.project(this.focusX, this.focusY, 0.9) : r.toScreen(this.game.world, this.focusX, this.focusY - 0.8)) : null;
    if (fp && fp[0] > -9000) {
      const [fx, fy] = fp;
      const k = this.focusT / this.focusMax;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = Math.min(1, k * 1.6) * 0.8;
      g.fillStyle = '#ffffff';
      const cx = fx * r.dpr, cy = fy * r.dpr;
      const R = Math.hypot(W, H);
      const inner = Math.min(W, H) * (0.22 + 0.1 * (1 - k));
      g.beginPath();
      const n = 48;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ((i * 7919) % 13) * 0.01;
        const wdt = 0.006 + ((i * 104729) % 7) * 0.0025;
        const r0 = inner * (0.9 + ((i * 31) % 5) * 0.08);
        g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        g.lineTo(cx + Math.cos(a + wdt) * r0, cy + Math.sin(a + wdt) * r0);
        g.lineTo(cx + Math.cos(a + wdt * 2) * R, cy + Math.sin(a + wdt * 2) * R);
      }
      g.fill();
      g.globalAlpha = 1;
    }
    if (this.slow && this._slowOwned) {
      const k = Math.min(1, this.slow.t / Math.max(0.01, this.slow.max) * 1.5);
      g.setTransform(1, 0, 0, 1, 0, 0);
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(10,10,30,${0.45 * k})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    if (this.impact > 0 && !(r.is3d && this.game.view3d?.post)) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'difference';
      g.fillStyle = this.impactColor || '#ffffff';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const c = this.flashColor;
      g.fillStyle = c ? c : '#ffffff';
      g.globalAlpha = Math.min(1, this.flash * 2);
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
  }

  /** Clear everything (used by test harnesses). */
  reset() {
    this.parts.length = 0; this.texts.length = 0; this.shapes.length = 0; this.nums.clear();
    this.trauma = 0; this.hitstop = 0; this.impact = 0; this.flash = 0; this.focusT = 0; this.kickX = 0; this.kickY = 0;
    if (this.slow) { this.slow = null; this.game.slowmo = 1; this._slowOwned = false; }
  }
}
