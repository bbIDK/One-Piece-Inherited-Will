// The Game: owns the world, entities and subsystems and runs the main loop.
import { FX } from './fx.js';
import { Combat } from './combat.js';
import { Env, currentAt } from './env.js';
import { Ship } from './ship.js';
import { regionAt, REGION, REGION_INFO, isCalmBelt } from '../world/constants.js';
import { clamp, lerp, TAU } from '../core/math.js';
import { PlayerController } from './playerController.js';
import { Spawner } from './spawner.js';

export class Game {
  constructor({ renderer, input, ui, audio, world }) {
    this.renderer = renderer;
    renderer.game = this;
    this.input = input;
    this.ui = ui;
    this.audio = audio;
    this.surface = world;
    this.world = world;
    this.zones = new Map();
    this.env = new Env();
    this.fx = new FX(this);
    this.combat = new Combat(this);
    this.actors = [];
    this.ships = [];
    this.areaZones = [];
    this.player = null;
    this.time = 0;
    this.paused = false;
    this.menuOpen = false;
    this.hintsShown = new Set();
    this.logLines = [];
    this.currentIsland = null;
    this.lastIslandName = null;
    this.spawner = new Spawner(this);
    this.cur = { x: 0, y: 0, steer: 0 };
    this.hooks = {}; // event name → [fn]
    this.state = null; // save-state object (character, world flags...) set by the lineage layer
    this.camZoomFoot = 46;
    this.camZoomSea = 24;
    this.zoomBias = 1;
    this.slowmo = 1;
  }

  on(ev, fn) { (this.hooks[ev] = this.hooks[ev] || []).push(fn); }
  emit(ev, ...args) { for (const fn of this.hooks[ev] || []) fn(...args); }

  setPlayer(actor) {
    this.player = actor;
    actor.game = this;
    actor.isPlayer = true;
    actor.faction = 'player';
    actor.controller = new PlayerController(this);
    if (!this.actors.includes(actor)) this.actors.push(actor);
  }

  addActor(a) { a.game = this; this.actors.push(a); return a; }
  removeActor(a) { a.alive = false; }
  addShip(opts) { const s = new Ship(opts); s.game = this; this.ships.push(s); return s; }
  addZone(z) { z.t0 = z.t; z.acc = z.interval; this.areaZones.push(z); }

  focus() {
    const p = this.player;
    if (!p) return { x: this.renderer.cam.x, y: this.renderer.cam.y };
    return p;
  }

  actorsNear(x, y, r) {
    const out = [];
    const w = this.world;
    const r2 = r * r;
    for (const a of this.actors) {
      if (!a.alive || a.world && a.world !== w) continue;
      if (w.dist2(x, y, a.x, a.y) <= r2) out.push(a);
    }
    return out;
  }

  isCalmAt(x, y) { return this.world.zone === 0 && isCalmBelt(regionAt(x, y)); }
  currentAt(x, y) { return currentAt(this.world, x, y, this.cur); }
  inFogRegion(x, y) {
    const f = this.fogRegions || [];
    for (const r of f) if (this.world.distance(x, y, r.x, r.y) < r.r) return r.density;
    return 0;
  }

  log(text, color = '#fff') {
    this.logLines.push({ text, color, t: this.time });
    if (this.logLines.length > 60) this.logLines.shift();
    this.ui?.log(text, color);
  }
  hint(key, text) {
    if (this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.ui?.hint(text);
  }

  // --- events from combat ----------------------------------------------------------
  onDamage(target, att, n) {
    if (target.isPlayer) { this.ui?.onPlayerHurt(n); this.emit('playerHurt', att, n); }
    if (att && att.isPlayer) this.emit('playerHit', target, n);
    if (target.isPlayer || (att && att.isPlayer)) { this.combatT = 6; }
  }
  onKnockOut(actor, att) {
    this.emit('knockout', actor, att);
  }
  onPlayerParry(att) { this.emit('parry', att); }
  onShipSunk(ship) { this.emit('shipSunk', ship); }

  // --- world transitions --------------------------------------------------------------
  setWorld(world) {
    this.world = world;
    this.renderer.terrain.setWorld({
      width: world.width, height: world.height, world: world.data, dist: world.dist,
      map: world.map.data, mapW: world.map.w, mapH: world.map.h, fog: world.fog, fogW: world.fogW, fogH: world.fogH,
    });
    this.fx.parts.length = 0;
    this.fx.shapes.length = 0;
    this.combat.hitboxes.length = 0;
    this.combat.projectiles.length = 0;
    this.areaZones.length = 0;
  }

  // --- main loop ------------------------------------------------------------------------
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    this.ui?.update(dt);
    if (this.paused || !this.player) { this.input.endFrame(); return; }
    this.time += dt;
    this.env.update(dt, this);
    this.fx.update(dt);
    let simDt = dt * this.slowmo;
    if (this.fx.hitstop > 0) { this.fx.hitstop -= dt; simDt *= 0.08; }
    this.combatT = Math.max(0, (this.combatT || 0) - dt);
    this.player.inCombat = this.combatT > 0;

    // actors
    const p = this.player;
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a.alive) { this.actors.splice(i, 1); continue; }
      if (a !== p && this.world.dist2(a.x, a.y, p.x, p.y) > 70 * 70 && !a.persistent) continue;
      a.update(simDt, this);
    }
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      if (!s.alive) { this.ships.splice(i, 1); continue; }
      s.update(simDt, this);
    }
    this.combat.update(simDt);
    this.updateZones(simDt);
    this.spawner.update(dt);
    this.updateLocation();
    this.emit('tick', dt);
    this.updateCamera(dt);
    // explore
    this.world.reveal(p.x, p.y, p.mode === 'sail' ? 30 : 20);
    if (this.world.fogDirty && Math.floor(this.time * 2) !== this.lastFogPush) {
      this.lastFogPush = Math.floor(this.time * 2);
      this.world.fogDirty = false;
      this.renderer.terrain.updateFog(this.world.fog);
    }
    this.input.endFrame();
  }

  updateZones(dt) {
    for (let i = this.areaZones.length - 1; i >= 0; i--) {
      const z = this.areaZones[i];
      z.t -= dt;
      z.acc += dt;
      const near = this.actorsNear(z.x, z.y, z.r + 1);
      for (const a of near) {
        if (!this.combat.canHit(z.owner, a, {})) continue;
        const d = this.world.distance(z.x, z.y, a.x, a.y);
        if (d > z.r) continue;
        if (z.slow) a.zoneSlow = z.slow, a.zoneSlowT = 0.2;
        if (z.pull) {
          const dx = this.world.dx(a.x, z.x), dy = z.y - a.y, dd = Math.hypot(dx, dy) || 1;
          a.knock(dx / dd * z.pull * dt * 3, dy / dd * z.pull * dt * 3);
        }
      }
      if (z.acc >= z.interval && z.damage > 0) {
        z.acc = 0;
        this.combat.hitbox({ owner: z.owner, x: z.x, y: z.y - 0.4, shape: 'circle', range: z.r, damage: z.damage, element: z.element, status: z.status, knockback: z.kind === 'meteor' ? 6 : 0.5, stun: z.kind === 'thunder' ? 0.5 : 0.1, duration: 0.05, radial: true, heavy: z.kind === 'meteor', hitShips: z.kind === 'meteor' || z.kind === 'thunder' });
        this.zoneFx(z, true);
      }
      this.zoneFx(z, false, dt);
      if (z.t <= 0) this.areaZones.splice(i, 1);
    }
    for (const a of this.actors) {
      if (a.zoneSlowT) { a.zoneSlowT -= dt; if (a.zoneSlowT <= 0) { a.zoneSlowT = 0; a.zoneSlow = 0; } }
    }
  }

  zoneFx(z, pulse, dt = 0) {
    const fx = this.fx;
    if (z.kind === 'thunder' && pulse) {
      fx.bolt(z.x + (Math.random() - 0.5), z.y - 9, z.x, z.y, '#fff176', 0.25, 0.1);
      fx.ring(z.x, z.y, 0.2, z.r, '#fff176', 0.3, 0.2);
      this.env.lightning = Math.max(this.env.lightning, 0.4);
      this.audio?.sfx('thunder_small');
    } else if (z.kind === 'meteor' && pulse) {
      fx.burst(z.x, z.y, 30, { color: ['#ff7043', '#ffca28', '#5d4037'], speed: 8, vz: 6, g: 10, life: 0.8, kind: 'fire', size: 0.3 });
      fx.ring(z.x, z.y, 0.3, z.r, '#ff7043', 0.4, 0.3);
      fx.crack(z.x, z.y, z.r);
      fx.shake(0.6);
      this.audio?.sfx('explosion');
    } else if (Math.random() < dt * 25) {
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * z.r;
      const kind = z.kind === 'storm' || z.kind === 'field' || z.kind === 'dark' ? 'smoke' : z.kind === 'ice' ? 'star' : 'spark';
      fx.particle({ x: z.x + Math.cos(a) * rr, y: z.y + Math.sin(a) * rr * 0.7, z: 0.2, vx: z.kind === 'storm' ? -Math.sin(a) * 3 : 0, vy: z.kind === 'storm' ? Math.cos(a) * 3 : 0, vz: 1, g: 0, life: 0.7, size: kind === 'smoke' ? 0.35 : 0.1, grow: 0.3, color: z.color, kind });
    }
  }

  updateLocation() {
    const p = this.player;
    const isl = this.world.islandAt(p.x, p.y) || this.world.nearestIsland(p.x, p.y, this.world.zone === 0 ? 25 : 12);
    if (isl !== this.currentIsland) {
      this.currentIsland = isl;
      if (isl && isl.name && isl.name !== this.lastIslandName) {
        this.lastIslandName = isl.name;
        this.emit('enterIsland', isl);
      }
    }
    const reg = this.world.zone === 0 ? regionAt(p.x, p.y) : null;
    if (reg !== this.lastRegion) {
      const prev = this.lastRegion;
      this.lastRegion = reg;
      if (reg && prev !== undefined) this.emit('enterRegion', reg, prev);
    }
  }

  updateCamera(dt) {
    const cam = this.renderer.cam;
    const p = this.player;
    const sailing = p.mode === 'sail';
    const target = (sailing ? this.camZoomSea * (p.ship ? clamp(6 / p.ship.def.length, 0.75, 1.2) : 1) : this.camZoomFoot) * this.zoomBias;
    if (this.input.mouse.wheel && !this.env.mapMode) this.zoomBias = clamp(this.zoomBias * (this.input.mouse.wheel > 0 ? 0.9 : 1.1), 0.45, 1.6);
    cam.zoom += (target - cam.zoom) * Math.min(1, dt * 3);
    // look ahead a little toward the mouse / heading
    let lx = 0, ly = 0;
    if (sailing && p.ship) { lx = Math.cos(p.ship.heading) * p.ship.speed * 0.25; ly = Math.sin(p.ship.heading) * p.ship.speed * 0.25; }
    const tx = p.x + lx, ty = p.y - 0.6 + ly;
    const k = Math.min(1, dt * (sailing ? 4 : 8));
    const dx = this.world.dx(cam.x, tx);
    cam.x = this.world.wx(cam.x + dx * k);
    cam.y += (ty - cam.y) * k;
    const tr = this.fx.trauma;
    const sh = tr * tr * 14;
    cam.shakeX = (Math.random() - 0.5) * sh;
    cam.shakeY = (Math.random() - 0.5) * sh;
  }

  snapCamera() {
    const cam = this.renderer.cam;
    cam.x = this.player.x; cam.y = this.player.y - 0.6;
    cam.zoom = (this.player.mode === 'sail' ? this.camZoomSea : this.camZoomFoot) * this.zoomBias;
  }

  // --- rendering ---------------------------------------------------------------------
  render() {
    // the game is drawn in 3D (first or third person); the world chart has its own renderer
    if (!this.player || this.ui?.mapOpen || !this.view3d) return;
    this.render3d();
  }

  /** First/third-person frame: the 3D view, then effects and weather on the overlay. */
  render3d() {
    const v = this.view3d, r = this.renderer;
    v.render(this);
    const g = r.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, r.canvas.width, r.canvas.height);
    const proj = v.proj;
    try { this.fx.draw(g, proj); } catch (e) { /* effects that don't project yet */ }
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawWeather(g, r);
    try { this.fx.drawScreen(g, proj); } catch (e) { /* ignore */ }
    const root = r.root;
    const want = this.fx.impact > 0 ? 'invert(1) grayscale(1) contrast(1.6)' : '';
    if (root.style.filter !== want) root.style.filter = want;
    this.ui?.render(this);
  }

  drawWeather(g, r) {
    const env = this.env;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const W = r.canvas.width, H = r.canvas.height;
    const zk = this.world.zone;
    if (zk === 2) {
      // 10,000 m under the sea: blue light, slow bubbles, light shafts
      g.fillStyle = 'rgba(0,70,130,0.16)'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 4; k++) {
        const x = ((k * 431 + env.time * 12) % (W + 400)) - 200;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 120 * r.dpr, 0); g.lineTo(x - 80 * r.dpr, H); g.lineTo(x - 180 * r.dpr, H); g.fill();
      }
      g.strokeStyle = 'rgba(220,245,255,0.5)'; g.lineWidth = 1.2 * r.dpr;
      for (let i = 0; i < 40; i++) {
        const x = (i * 173.3 + Math.sin(env.time + i) * 20) % W;
        const y = H - ((i * 97.1 + env.time * (30 + (i % 5) * 12)) % (H + 40));
        g.beginPath(); g.arc(x, y, (2 + (i % 3)) * r.dpr, 0, TAU); g.stroke();
      }
    } else if (zk === 3) {
      const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(10,0,0,0.75)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    } else if (zk === 1) {
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,250,235,0.12)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    if (env.rain > 0.05 && !zk) {
      g.strokeStyle = `rgba(200,220,255,${0.25 + env.rain * 0.35})`;
      g.lineWidth = 1.2 * r.dpr;
      g.beginPath();
      const n = Math.floor(env.rain * 260);
      const t = env.time;
      for (let i = 0; i < n; i++) {
        const x = ((i * 97.13 + t * 900 * (0.8 + (i % 5) * 0.1)) % (W + 200)) - 100;
        const y = ((i * 57.7 + t * 1400) % (H + 100)) - 50;
        g.moveTo(x, y); g.lineTo(x - 8 * r.dpr - env.windX * 6, y + 22 * r.dpr);
      }
      g.stroke();
    }
    if (env.snow > 0.05 && zk !== 2 && zk !== 1) {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      const n = Math.floor(env.snow * 200);
      const t = env.time;
      for (let i = 0; i < n; i++) {
        const x = ((i * 131.7 + t * 40 * (1 + (i % 3)) + Math.sin(t + i) * 30) % (W + 40)) - 20;
        const y = ((i * 71.3 + t * 70 * (1 + (i % 4) * 0.3)) % (H + 40)) - 20;
        g.beginPath(); g.arc(x, y, (1.2 + (i % 3)) * r.dpr, 0, TAU); g.fill();
      }
    }
    if (env.fog > 0.05) {
      const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.max(W, H) * 0.7);
      grd.addColorStop(0, `rgba(210,215,225,${env.fog * 0.15})`);
      grd.addColorStop(1, `rgba(200,205,215,${env.fog * 0.85})`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    if (env.lightning > 0.5) { g.fillStyle = `rgba(255,255,255,${(env.lightning - 0.5) * 0.5})`; g.fillRect(0, 0, W, H); }
    // low-health vignette
    const p = this.player;
    if (p && p.d && p.hp / p.d.maxHp < 0.3 && p.state === 'idle') {
      const k = 1 - p.hp / p.d.maxHp / 0.3;
      const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.65);
      grd.addColorStop(0, 'rgba(120,0,0,0)');
      grd.addColorStop(1, `rgba(140,0,0,${0.25 + k * 0.3 + Math.sin(env.time * 6) * 0.05})`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
  }

  regionName(x, y) {
    if (this.world.zone !== 0) return this.world.name || 'Unknown';
    return REGION_INFO[regionAt(x, y)]?.name || 'Open Sea';
  }
}

export { REGION, lerp };
