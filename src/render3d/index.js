// The 3D view (first or third person). The simulation still runs on the 2D
// tile plane; this renders it in 3D around a floating origin at the player:
// terrain chunks, the ocean, sky and weather light, world objects (3D models
// where one is registered, sprites otherwise), characters, ships and
// projectiles. The existing 2D overlay canvas stays on top for effects,
// weather and damage numbers, projected through the 3D camera.
import * as THREE from 'three';
import './fog.js'; // the atmospheric fog shader chunks (before any material compiles)
import { Post } from './post.js';
import { TerrainManager } from './terrain3d.js';
import { Water } from './water3d.js';
import { Sky } from './sky3d.js';
import { CameraRig } from './camera3d.js';
import { SpriteForest, ActorSprite, propSprite, projectileMesh, tintSprites } from './billboards.js';
import { ShipView } from './ships3d.js';
import { buildBuilding, setNightWindows } from './buildings3d.js';
import { PROP_BUILDERS, VIEWS, FRAME_HOOKS, registerPropBuilder } from './registry.js';
import './props3d.js';
import './chars3d.js';

registerPropBuilder('building', (o, ctx) => buildBuilding(o, ctx));

const ACTOR_RANGE = 75;
const SHIP_RANGE = 520;

const _ray1 = new THREE.Vector3(), _ray2 = new THREE.Vector3();

export class Renderer3D {
  constructor(root, r2d, game) {
    this.root = root;
    this.r2d = r2d;
    this.game = game;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    root.insertBefore(canvas, r2d.canvas);
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // count a whole frame (scene + post passes) in renderer.info, reset in draw()
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene);
    this.terrain = new TerrainManager(this.scene);
    this.rig = new CameraRig(canvas, game);
    this.props = new THREE.Group();
    this.props.name = 'props';
    this.scene.add(this.props);
    this.forest = new SpriteForest(this.props);
    this.built = new Map();
    this.animProps = new Map(); // built props with a per-frame userData.update
    this.ents = new THREE.Group();
    this.scene.add(this.ents);
    this.actorViews = new Map();
    this.shipViews = new Map();
    this.projViews = new Map();
    this.active = false;
    this.world = null;
    this.propOrigin = null;
    this.propT = 0;
    this.frame = 0;
    this.lastT = performance.now();
    this.ox = 0; this.oy = 0;
    this.quality = 'high';
    this.ctx = {
      THREE, scene: this.scene, game,
      ground: (x, y) => this.ground(x, y),
      terrain: (x, y) => this.terrain.terrainAt(x, y),
    };
    Object.defineProperty(this.ctx, 'camera', { get: () => this.rig.camera });
    Object.defineProperty(this.ctx, 'world', { get: () => this.world });
    Object.defineProperty(this.ctx, 'yaw', { get: () => this.rig.yaw });
    Object.defineProperty(this.ctx, 'mode', { get: () => this.rig.mode });
    // a projection shim so the 2D effects layer can draw on top of the 3D view
    const self = this;
    this.proj = {
      get dpr() { return r2d.dpr; },
      get cw() { return r2d.cw; },
      get ch() { return r2d.ch; },
      get canvas() { return r2d.canvas; },
      cam: { x: 0, y: 0, zoom: 40, shakeX: 0, shakeY: 0 },
      toScreen: (w, x, y) => self.project(x, y, 0.9),
      toWorld: (w, sx, sy) => self.aimWorld(sx, sy),
      viewRect: () => r2d.viewRect(),
      is3d: true,
      project: (x, y, h) => self.project(x, y, h),
      /** Pixels per metre at a world point (h metres above ground); 0 when behind the camera. */
      scaleAt: (x, y, h = 0.9) => self.scaleAt(x, y, h),
      /** True in first person (the player's own body isn't drawn). */
      get firstPerson() { return self.rig.mode === 'first'; },
      get yaw() { return self.rig.yaw; },
      get pitch() { return self.rig.pitch; },
    };
    this.setQuality(this.quality);
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.rig.resize(window.innerWidth, window.innerHeight);
    this.post?.setSize();
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sky.sun.castShadow = q !== 'low';
    this.terrain.setDetail?.(q);
    this.water.setDetail?.(q);
    // post-processing (ink outlines, grading, bloom, FXAA) on 'high' only
    if (q === 'low' && this.post) { this.post.dispose(); this.post = null; }
    if (q !== 'low' && !this.post) {
      try { this.post = new Post(this.renderer, this.scene, this.rig.camera); } catch (e) { console.warn('post-processing unavailable', e); this.post = null; }
    }
    this.resize();
  }

  /** Draw the frame: through the post-processing chain when it's on. */
  draw(cam) {
    this.renderer.info.reset();
    if (this.post) {
      try { this.post.render(cam); return; } catch (e) { console.warn('post-processing failed; drawing directly', e); this.post.dispose(); this.post = null; }
    }
    this.renderer.render(this.scene, cam);
  }

  setActive(on) {
    this.active = !!on;
    this.canvas.style.display = on ? 'block' : 'none';
    this.r2d.glCanvas.style.display = on ? 'none' : 'block';
    if (!on) this.rig.releaseLock();
  }

  setMode(mode) { this.rig.mode = mode === 'third' ? 'third' : 'first'; }

  setWorld(world) {
    this.world = world;
    this.terrain.setWorld(world);
    this.water.setWorld(world);
    this.forest.clear();
    for (const v of this.built.values()) if (v) { this.props.remove(v); disposeTree(v); }
    this.built.clear();
    this.animProps.clear();
    for (const v of this.actorViews.values()) { this.ents.remove(v.root || v.mesh); v.dispose?.(); }
    this.actorViews.clear();
    for (const v of this.shipViews.values()) { this.ents.remove(v.root); v.dispose?.(); }
    this.shipViews.clear();
    for (const m of this.projViews.values()) this.ents.remove(m);
    this.projViews.clear();
    this.propOrigin = null;
  }

  ground(x, y) { return this.terrain.groundAt(x, y); }

  /** World point → CSS pixels (h metres above the ground). Off-screen when behind the camera. */
  project(x, y, h = 0) {
    const w = this.world;
    const v = new THREE.Vector3(w ? w.dx(this.ox, x) : x - this.ox, this.ground(x, y) + h, y - this.oy);
    v.project(this.rig.camera);
    if (v.z > 1 || v.z < -1) return [-99999, -99999];
    return [(v.x + 1) / 2 * this.r2d.cw, (1 - v.y) / 2 * this.r2d.ch];
  }

  /** Pixels per metre at a point: the projected size of a 1 m vertical step there. */
  scaleAt(x, y, h = 0.9) {
    const a = this.project(x, y, h), b = this.project(x, y, h + 1);
    if (a[0] < -9999 || b[0] < -9999) return 0;
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  }

  /** Where the player is aiming, in world tiles (the crosshair, or the free mouse). */
  aimWorld(sx, sy) {
    const g = this.game;
    if (!g.player) return [0, 0];
    const free = sx !== undefined && !this.rig.locked && (this.rig.lockFailed || this.rig.freeMouse);
    const [x, y] = this.rig.aimPoint(g, (x, y) => this.ground(x, y), free ? sx : undefined, free ? sy : undefined);
    // the simulation aims along the 2D "chest line" (y - 0.5), so shift the ground point to match
    return [x, y - 0.5];
  }

  render(game) {
    const w = game.world;
    if (w !== this.world) this.setWorld(w);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.frame++;
    const p = game.player;
    const env = game.env;
    this.ox = p.x; this.oy = p.y;
    const ox = p.x, oy = p.y;
    const sailing = p.mode === 'sail';
    this.rig.update(dt, game, (x, y) => this.ground(x, y));
    const cam = this.rig.camera;
    const camYaw3 = -(this.rig.yaw + Math.PI / 2);

    this.terrain.setSailing(sailing);
    this.sky.maxFar = this.terrain.extent;
    this.sky.update(env, w, sailing);
    this.sky.mesh.position.copy(cam.position);
    this.water.update(ox, oy, env, this.sky.sunDir, this.sky.sunCol, this.sky.horizon, this.sky.top);
    this.terrain.update(ox, oy);
    // the shadow camera follows the player
    const gh = this.ground(ox, oy);
    this.sky.sun.target.position.set(0, gh, 0);
    this.sky.sun.position.y += gh;

    this.updateProps(game, ox, oy, env, sailing);
    this.props.position.set(this.propOrigin ? w.dx(ox, this.propOrigin.x) : 0, 0, this.propOrigin ? this.propOrigin.y - oy : 0);
    this.forest.aim(camYaw3);
    this.tickProps(env, dt);
    this.updateEntities(game, ox, oy, env, camYaw3);
    this.updateViewmodel(game, env);

    const amb = env.ambient || [1, 1, 1];
    tintSprites(Math.min(1, amb[0] * 1.05), Math.min(1, amb[1] * 1.05), Math.min(1, amb[2] * 1.05));
    setNightWindows(Math.max(0, 0.9 - env.daylight));
    // effects layer scale: pixels per metre at arm's length in front of the camera
    const f = this.r2d.ch / (2 * Math.tan(cam.fov * Math.PI / 360));
    this.proj.cam.zoom = f / 7;
    if (this.post) this.post.setImpact(game.fx && game.fx.impact > 0 ? 1 : 0, game.fx?.impactColor);
    this.draw(cam);
  }

  /**
   * Title-screen flyover: a camera slowly circling high over (cx, cy) with no
   * player, in the same world, sky and sea as the game.
   */
  renderAttract(game, cx, cy, t) {
    const w = game.world;
    if (w !== this.world) this.setWorld(w);
    const now = performance.now();
    this.lastT = now;
    this.frame++;
    const env = game.env;
    const a = t * 0.035;
    const R = this.attractR || 120;
    const ox = w.wx(cx + Math.cos(a) * R), oy = cy + Math.sin(a) * R;
    this.ox = ox; this.oy = oy;
    // look across the island, past its centre
    const yaw = a + Math.PI - 0.35;
    this.rig.yaw = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const camYaw3 = -(yaw + Math.PI / 2);
    const cam = this.rig.camera;
    const gh = Math.max(0, this.ground(ox, oy));
    cam.position.set(0, gh + 30, 0);
    cam.rotation.set(-0.2, camYaw3, 0);
    if (Math.abs(cam.fov - 70) > 0.01) { cam.fov = 70; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.terrain.setSailing(true);
    this.sky.maxFar = this.terrain.extent;
    this.sky.update(env, w, true);
    this.sky.mesh.position.copy(cam.position);
    this.water.update(ox, oy, env, this.sky.sunDir, this.sky.sunCol, this.sky.horizon, this.sky.top);
    this.terrain.update(ox, oy);
    this.sky.sun.target.position.set(0, gh, 0);
    this.sky.sun.position.y += gh;
    this.updateProps(game, ox, oy, env, false, 190);
    this.props.position.set(this.propOrigin ? w.dx(ox, this.propOrigin.x) : 0, 0, this.propOrigin ? this.propOrigin.y - oy : 0);
    this.forest.aim(camYaw3);
    this.tickProps(env, 1 / 60);
    this.updateEntities(game, ox, oy, env, camYaw3);
    if (this.vm) this.vm.root.visible = false;
    const amb = env.ambient || [1, 1, 1];
    tintSprites(Math.min(1, amb[0] * 1.05), Math.min(1, amb[1] * 1.05), Math.min(1, amb[2] * 1.05));
    setNightWindows(Math.max(0, 0.9 - env.daylight));
    this.draw(cam);
  }

  /** Every frame: animated props (userData.update) and plug-in frame hooks. */
  tickProps(env, dt) {
    for (const [o, v] of this.animProps) {
      try { v.userData.update(o, env, this.ctx); } catch (e) { this.animProps.delete(o); console.warn('3D prop update failed for', o.kind, e); }
    }
    for (const fn of FRAME_HOOKS) {
      try { fn(env, this.ctx, dt); } catch (e) { if (!fn.warned) { fn.warned = true; console.warn('3D frame hook failed', e); } }
    }
  }

  /** The view ray in world terms: from (x, y, height h) along (dx, dy, dh), unit length. */
  aimRay() {
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const p = cam.getWorldPosition(_ray1), d = cam.getWorldDirection(_ray2);
    return { x: (this.ox || 0) + p.x, y: (this.oy || 0) + p.z, h: p.y, dx: d.x, dy: d.z, dh: d.y };
  }

  /** First-person arms and weapon (a plug-in; see registry.js). */
  updateViewmodel(game, env) {
    const want = this.rig.mode === 'first' && VIEWS.viewmodel && game.player && game.player.mode !== 'sail';
    if (want && !this.vm) {
      try { this.vm = VIEWS.viewmodel(this.ctx); } catch (e) { console.warn('viewmodel failed', e); this.vm = null; }
      if (this.vm) {
        if (!this.rig.camera.parent) this.scene.add(this.rig.camera);
        this.rig.camera.add(this.vm.root);
      }
    }
    if (this.vm) {
      this.vm.root.visible = !!want;
      if (want) this.vm.update(game.player, env, this.ctx);
    }
  }

  /** Static world objects near the player: 3D models where registered, sprites otherwise. */
  updateProps(game, ox, oy, env, sailing, radius) {
    const w = this.world;
    if (!w.objects) return;
    this.propT -= 1 / 60;
    const moved = this.propOrigin ? Math.hypot(w.dx(this.propOrigin.x, ox), oy - this.propOrigin.y) : Infinity;
    if (moved < 7 && this.propT > 0 && this.propOrigin?.day === env.day && !this.propsDirty) return;
    this.propT = 0.6;
    this.propsDirty = false;
    this.propOrigin = { x: ox, y: oy, day: env.day };
    const R = radius || (sailing ? 150 : 95);
    const objs = w.objects.query(ox - R, oy - R, ox + R, oy + R);
    const items = [];
    const keep = new Set();
    for (const o of objs) {
      const dx = w.dx(ox, o.x), dy = o.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      if (o.hidden) continue;
      const builder = PROP_BUILDERS.get(o.kind);
      if (builder) {
        let v = this.built.get(o);
        if (v === undefined) {
          try { v = builder(o, this.ctx) || null; } catch (e) { v = null; console.warn('3D builder failed for', o.kind, e); }
          this.built.set(o, v);
          if (v) this.props.add(v);
          if (v?.userData.update) this.animProps.set(o, v);
        }
        if (v) {
          keep.add(o);
          v.position.set(dx, v.userData.noGround ? 0 : this.ground(o.x, o.y), dy);
          continue;
        }
      }
      // sprites only nearby (they're flat; far away the fog hides them)
      if (d2 > 80 * 80 && o.kind !== 'tree') continue;
      const s = propSprite(o, w.id, env.day);
      if (s) items.push({ o, sprite: s, rx: dx, rz: dy, h: this.terrain.terrainAt(o.x, o.y) });
    }
    for (const [o, v] of this.built) {
      if (keep.has(o)) continue;
      if (v) { this.props.remove(v); disposeTree(v); }
      this.built.delete(o);
      this.animProps.delete(o);
    }
    this.forest.rebuild(items);
  }

  updateEntities(game, ox, oy, env, camYaw3) {
    const w = this.world;
    const p = game.player;
    const seen = new Set();
    // characters
    const near = [];
    for (const a of game.actors) {
      if (!a.alive || a.hidden) continue;
      if (a === p && this.rig.mode === 'first') continue;
      if (a.onShip && a !== p) continue;
      const dx = w.dx(ox, a.x), dy = a.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 > ACTOR_RANGE * ACTOR_RANGE) continue;
      near.push([a, dx, dy, d2]);
    }
    near.sort((a, b) => a[3] - b[3]);
    let i = 0;
    for (const [a, dx, dy] of near) {
      seen.add(a);
      let v = this.actorViews.get(a);
      if (!v) {
        v = VIEWS.actor ? VIEWS.actor(a, this.ctx) : null;
        if (!v) v = new ActorSpriteView(a);
        this.actorViews.set(a, v);
        this.ents.add(v.root);
      } else if (v.stale?.()) {
        this.ents.remove(v.root); v.dispose?.();
        v = VIEWS.actor ? VIEWS.actor(a, this.ctx) || new ActorSpriteView(a) : new ActorSpriteView(a);
        this.actorViews.set(a, v);
        this.ents.add(v.root);
      }
      const gh = a.inWater ? -0.9 : this.ground(a.x, a.y);
      v.root.position.set(dx, gh + (a.z || 0), dy);
      v.update(a, env, this.ctx, { camYaw3, redraw: i < 18 || (this.frame + i) % 3 === 0 });
      i++;
    }
    for (const [a, v] of this.actorViews) {
      if (seen.has(a)) continue;
      this.ents.remove(v.root); v.dispose?.();
      this.actorViews.delete(a);
    }
    // ships
    const seenS = new Set();
    for (const s of game.ships) {
      const dx = w.dx(ox, s.x), dy = s.y - oy;
      if (dx * dx + dy * dy > SHIP_RANGE * SHIP_RANGE || !s.alive) continue;
      seenS.add(s);
      let v = this.shipViews.get(s);
      if (v && v.stale?.()) { this.ents.remove(v.root); v.dispose?.(); v = null; }
      if (!v) {
        v = (VIEWS.ship ? VIEWS.ship(s, this.ctx) : null) || new ShipView(s);
        this.shipViews.set(s, v);
        this.ents.add(v.root);
      }
      v.update(env, dx, dy, env.windAngle, this.ctx);
    }
    for (const [s, v] of this.shipViews) {
      if (seenS.has(s)) continue;
      this.ents.remove(v.root); v.dispose?.();
      this.shipViews.delete(s);
    }
    // projectiles
    const seenP = new Set();
    for (const pr of game.combat.projectiles) {
      if (pr.delay > 0) continue;
      seenP.add(pr);
      let m = this.projViews.get(pr);
      if (!m) { m = projectileMesh(pr); this.projViews.set(pr, m); this.ents.add(m); }
      const h = pr.sprite === 'cannonball' ? 1.3 : 1.15;
      // projectiles fly on the 2D "chest line" (y - 0.5): their ground point is y + 0.5
      m.position.set(w.dx(ox, pr.x), Math.max(0.2, this.terrain.terrainAt(pr.x, pr.y + 0.5)) + h + (pr.z || 0), pr.y + 0.5 - oy);
    }
    for (const [pr, m] of this.projViews) {
      if (seenP.has(pr)) continue;
      this.ents.remove(m); m.geometry.dispose(); m.material.dispose();
      this.projViews.delete(pr);
    }
  }
}

/** The fallback character view: an upright sprite of the 2D anime art. */
class ActorSpriteView {
  constructor(a) {
    this.sprite = new ActorSprite(a);
    this.root = this.sprite.mesh;
  }
  update(a, env, ctx, { camYaw3, redraw }) {
    this.root.rotation.set(0, camYaw3, 0);
    if (redraw) this.sprite.draw(a, env, ctx.yaw);
  }
  dispose() { this.sprite.dispose(); }
}

function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry && !x.geometry.userData?.shared) x.geometry.dispose();
  });
}

export { THREE };
