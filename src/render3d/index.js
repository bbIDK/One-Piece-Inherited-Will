// The 3D view (first or third person). The simulation still runs on the 2D
// tile plane; this renders it in 3D around a floating origin at the player:
// terrain chunks, the ocean, sky and weather light, world objects (3D models
// where one is registered, sprites otherwise), characters, ships and
// projectiles. The existing 2D overlay canvas stays on top for effects,
// weather and damage numbers, projected through the 3D camera.
import { prof } from '../core/prof.js';
import * as THREE from 'three';
import { FOG } from './fog.js'; // the atmospheric fog shader chunks (before any material compiles)
import './lighting.js'; // cheaper point lights and shadow filtering (also shader chunks)
import { Post } from './post.js';
import { TerrainManager , CTIME } from './terrain3d.js';
import { waterLevel } from './height.js';
import { Water } from './water3d.js';
import { Sky } from './sky3d.js';
import { CameraRig } from './camera3d.js';
import { SpriteForest, ActorSprite, propSprite, projectileMesh, tintSprites } from './billboards.js';
import { ShipView } from './ships3d.js';
import { shipBob, pitchRise } from '../world/hull.js';
import { Ship } from '../game/ship.js';
import { buildBuilding, setNightWindows } from './buildings3d.js';
import { FarBuildings } from './farbuildings.js';
import { COLLIDE } from '../world/objects.js';
import { PROP_BUILDERS, VIEWS, FRAME_HOOKS, registerPropBuilder } from './registry.js';
import { setPartVisible } from './props/instancer.js';
import { instancerStats } from './props3d.js';
import './chars3d.js';

registerPropBuilder('building', (o, ctx) => buildBuilding(o, ctx));

const RES_STEPS = [1, 0.88, 0.77, 0.67, 0.58]; // automatic resolution: shares of the full pixel ratio
// (people are only moved within ~70 m of the player, and are a few pixels
// tall beyond: they aren't drawn out to the render distance)
const ACTOR_RANGE = 75;
const PROP_BUDGET_MS = 4; // building props per frame (beyond the nearest)
// The render distance (Settings) counts in 32 m chunks, like the terrain's.
// At sea you see half as far again (islands are the view there), up to 32
// chunks: the sea's own depth map reaches about a kilometre.
const CHUNK_M = 32;
const SEA_MUL = 1.5, SEA_MAX = 32;
const NEAR_SCAN = 140; // m: the ring of props rescanned every few steps (the rest, every FAR_STEP)
const FAR_STEP = 24; // m walked between full rescans out to the render distance
const REBASE = 600; // m from the props' origin before everything is placed afresh round the player
// buildings get their full model within MODEL_IN (m), and give it up again
// beyond MODEL_OUT; farther out they're drawn as simple blocks (farbuildings.js)
const MODEL_IN = 100, MODEL_OUT = 116;

const _ray1 = new THREE.Vector3(), _ray2 = new THREE.Vector3();

// props the third-person camera may end up inside (see clearCameraProps)
const CAM_CLEAR = { tree: 1, bush: 1, rock: 1, mushroom: 1, crystal: 1, cactus: 1, haystack: 1, tent: 1, stall: 1, statue: 1, totem: 1 };
const _box = new THREE.Box3();
/** A prop's rough extent: radius round its foot, height, and where its foot is. */
function propExtent(v) {
  const u = v.userData;
  if (u.camExt !== undefined) return u.camExt;
  let r = 0, top = 0;
  if (u.parts) {
    const sc = u.scale || 1;
    for (const p of u.parts) {
      const g = p.geo;
      if (!g) continue;
      const bb = g.boundingBox || (g.computeBoundingBox(), g.boundingBox);
      const ls = p.local ? p.local.getMaxScaleOnAxis() : 1;
      const lx = p.local ? Math.hypot(p.local.elements[12], p.local.elements[14]) : 0;
      r = Math.max(r, (Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * ls + lx) * sc);
      top = Math.max(top, (bb.max.y * ls + (p.local ? p.local.elements[13] : 0)) * sc);
    }
    u.camExt = r > 0 ? { r, top, get y() { return u.y || 0; } } : null;
  } else {
    _box.setFromObject(v);
    if (_box.isEmpty()) return (u.camExt = null);
    const px = v.position.x, pz = v.position.z;
    r = Math.max(px - _box.min.x, _box.max.x - px, pz - _box.min.z, _box.max.z - pz);
    const base = v.position.y;
    top = _box.max.y - base;
    u.camExt = { r, top, get y() { return v.position.y; } };
  }
  return u.camExt;
}
/** Hide or show a built prop (every part of an instanced one). */
function showProp(v, on) {
  const u = v.userData;
  if (u.parts) {
    u.camHidden = !on;
    for (const p of u.parts) {
      if (!on && !p.hidden) { setPartVisible(u, p, false); p.camHid = true; }
      else if (on && p.camHid) { p.camHid = false; setPartVisible(u, p, true); }
    }
  } else v.visible = on;
}
const _ndc = new THREE.Vector2(), _caster = new THREE.Raycaster();
const _clearSea = new THREE.Color(0.06, 0.34, 0.42);

export class Renderer3D {
  constructor(root, r2d, game) {
    this.root = root;
    this.r2d = r2d;
    this.game = game;
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    root.insertBefore(canvas, r2d.canvas);
    this.canvas = canvas;
    // (with post-processing on, the screen's own multisampling would be wasted work: FXAA
    // smooths the edges; so the context only has it when starting on the fast setting)
    this.msaa = game?.settings?.quality === 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.msaa, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // count a whole frame (scene + post passes) in renderer.info, reset in draw()
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.sky = new Sky(this.scene);
    this.water = new Water(this.scene, this.renderer);
    this.terrain = new TerrainManager(this.scene);
    this.rig = new CameraRig(canvas, game);
    this.props = new THREE.Group();
    this.props.name = 'props';
    this.scene.add(this.props);
    this.forest = new SpriteForest(this.props);
    this.built = new Map();
    this.animProps = new Map(); // built props with a per-frame userData.update
    this.retiring = new Map(); // building models waiting for their far block to be drawn before they go
    this.ents = new THREE.Group();
    this.scene.add(this.ents);
    this.actorViews = new Map();
    this.shipViews = new Map();
    this.projViews = new Map();
    this.active = false;
    this.world = null;
    this.propOrigin = null; // where the props are placed from (moved on only now and then: see rebase)
    this.scan = null; // where and when the props were last looked over (see updateProps)
    this.propT = 0;
    this.frame = 0;
    this.lastT = performance.now();
    this.ox = 0; this.oy = 0;
    this.quality = 'high';
    this.resScale = 1; // automatic resolution (see adapt)
    this.viewChunks = 12; // the render distance (set from the settings: see setRenderDistance)
    this.ctx = {
      THREE, scene: this.scene, game,
      ground: (x, y) => this.ground(x, y),
      terrain: (x, y) => this.terrain.terrainAt(x, y),
      landDrawn: (x, y) => this.terrain.landDrawn(x, y),
    };
    this.buildingsFar = new FarBuildings(this.props, this.ctx);
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
    this.terrain.setReach(this.viewChunks, this.seaChunks());
    this.parallelCompile = !!this.renderer.extensions.has('KHR_parallel_shader_compile');
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'low' ? 1 : 1.75) * this.resScale;
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
    // post-processing (ink outlines, grading, bloom, FXAA) on 'high'; on 'low', straight to
    // the screen, or through FXAA alone if the screen has no multisampling of its own
    const want = q !== 'low' ? 'full' : this.msaa ? null : 'lite';
    if (this.post && this.post.kind !== want) { this.post.dispose(); this.post = null; }
    if (want && !this.post) {
      try { this.post = new Post(this.renderer, this.scene, this.rig.camera, { lite: want === 'lite' }); } catch (e) { console.warn('post-processing unavailable', e); this.post = null; }
    }
    this.resize();
  }

  /**
   * The render distance, in 32 m chunks (Settings → Render distance): the
   * land, towns, trees, props and ships are all drawn out to it, and the fog
   * closes in completely there, so nothing is seen to pop in or out.
   */
  setRenderDistance(n) {
    n = Math.max(2, Math.round(n) || 12);
    if (n === this.viewChunks) return;
    this.viewChunks = n;
    this.terrain.setReach(n, this.seaChunks());
    this.propsDirty = true;
  }

  /** Debug (the perf scenarios): what's drawn and what's still to build. */
  viewStats() {
    let models = 0;
    for (const [o, v] of this.built) if (v && o.kind === 'building') models++;
    return {
      chunks: this.terrain.live.size, built: this.built.size, models, queued: (this.propQueue?.length || 0) + (this.farQueue?.length || 0),
      far: this.buildingsFar.stats(), inst: instancerStats(),
    };
  }

  /** The render distance at sea, in chunks: half as far again. */
  seaChunks() { return Math.min(SEA_MAX, Math.max(this.viewChunks, Math.round(this.viewChunks * SEA_MUL))); }

  /** How far out (m) the world is drawn: on foot, or at sea (not past the short fixed fogs of the sea bed and the prison). */
  viewDist(sailing) {
    const d = (sailing ? this.seaChunks() : this.viewChunks) * CHUNK_M, zone = this.world?.zone;
    return zone === 2 ? Math.min(d, 192) : zone === 3 ? Math.min(d, 128) : d;
  }

  /**
   * Automatic resolution: once a second, look at how the frames went. When
   * they're slower than ~48 a second and it's the drawing that's slow (the
   * game's own code leaves plenty of each frame to spare), draw fewer pixels,
   * a step at a time; when they've been smooth for a while, step back up
   * (waiting longer each time a step up turned out too much). A step down
   * that doesn't make the frames any faster (the browser holding the frame
   * rate down, say, to save battery) is taken back, and not tried again for
   * a good while.
   * frameMs: time since the last frame; jsMs: the game's own work in it.
   */
  adapt(frameMs, jsMs) {
    const A = this.res || (this.res = { i: 0, sum: 0, js: 0, n: 0, good: 0, hold: 0, noDown: 0, fails: 0, upAt: -1e9, before: 0 });
    if (this.game.settings?.autoRes === false || !this.active) {
      if (A.i) { A.i = 0; this.setResScale(1); }
      A.sum = A.js = A.n = 0;
      return;
    }
    if (frameMs > 250) return; // (a stall or a hidden tab, not the steady frame rate)
    A.sum += frameMs; A.js += jsMs; A.n++;
    if (A.sum < 1000) return;
    const avg = A.sum / A.n, js = A.js / A.n, now = performance.now();
    A.sum = A.js = A.n = 0;
    A.hold = Math.max(0, A.hold - 1); // (seconds before stepping up is allowed)
    A.noDown = Math.max(0, A.noDown - 1); // (…and down)
    if (A.before) {
      // the second after a step down: did it help?
      const helped = avg < A.before * 0.93;
      A.before = 0;
      if (!helped) { A.i--; A.noDown = 120; A.good = 0; this.setResScale(RES_STEPS[A.i]); return; }
    }
    if (avg > 21 && js < avg * 0.7 && A.i < RES_STEPS.length - 1 && !A.noDown) {
      if (now - A.upAt < 12000) A.fails = Math.min(4, A.fails + 1);
      A.i++; A.good = 0; A.hold = 15 << A.fails; A.before = avg;
      this.setResScale(RES_STEPS[A.i]);
      return;
    }
    A.good = avg < 18 ? A.good + 1 : 0;
    if (A.i > 0 && A.good >= 5 && !A.hold) {
      A.i--; A.good = 0; A.upAt = now;
      this.setResScale(RES_STEPS[A.i]);
    }
  }

  setResScale(s) {
    if (s === this.resScale) return;
    this.resScale = s;
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
    for (const v of this.built.values()) if (v) { this.detach(v); disposeTree(v); }
    this.built.clear();
    this.animProps.clear();
    this.retiring.clear();
    this.buildingsFar.clear();
    this.propQueue = null;
    this.farQueue = null;
    this.scan = null;
    for (const v of this.actorViews.values()) { this.detach(v.root || v.mesh); v.dispose?.(); }
    this.actorViews.clear();
    for (const v of this.shipViews.values()) { this.detach(v.root); v.dispose?.(); }
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
    if (this.frame === 4) this.warmUp();
    const p = game.player;
    const env = game.env;
    this.ox = p.x; this.oy = p.y;
    const ox = p.x, oy = p.y;
    const sailing = p.mode === 'sail';
    let t0 = performance.now();
    this.rig.update(dt, game, (x, y) => this.ground(x, y));
    const cam = this.rig.camera;
    const camYaw3 = -(this.rig.yaw + Math.PI / 2);
    prof('r.camera', t0); t0 = performance.now();

    this.terrain.setSailing(sailing);
    this.sky.maxFar = this.terrain.extent;
    this.sky.update(env, w, sailing);
    this.sky.mesh.position.copy(cam.position);
    this.water.update(ox, oy, env, this.sky.sunDir, this.sky.sunCol, this.sky.horizon, this.sky.top);
    // (no sea inside the hull you're aboard: from her hold you'd see it across the room)
    const hs = p.deck?.ship || (sailing ? p.ship : null);
    this.water.setHull(hs && !hs.sunk ? { x: w.dx(ox, hs.x), z: hs.y - oy, h: hs.heading, L: hs.def.length, B: hs.def.beam } : null);
    this.underwater(env, -cam.position.y);
    prof('r.sky+water', t0); t0 = performance.now();
    // the floor of the open sea (far from any land) is only drawn for a swimmer
    this.terrain.setSeaFloor(p.inWater || this.isUnder ? (p.gills ? 4 : 3) : 0);
    this.terrain.update(ox, oy);
    prof('r.terrain', t0); t0 = performance.now();
    CTIME.value = env.time;
    // the shadow camera follows the player
    const gh = this.ground(ox, oy);
    this.sky.sun.target.position.set(0, gh, 0);
    this.sky.sun.position.y += gh;

    this.updateProps(game, ox, oy, env, sailing);
    this.props.position.set(this.propOrigin ? w.dx(ox, this.propOrigin.x) : 0, 0, this.propOrigin ? this.propOrigin.y - oy : 0);
    this.forest.aim(camYaw3);
    prof('r.props', t0); t0 = performance.now();
    this.tickProps(env, dt);
    t0 = performance.now();
    this.updateEntities(game, ox, oy, env, camYaw3);
    prof('r.entities', t0); t0 = performance.now();
    this.updateViewmodel(game, env);
    prof('r.viewmodel', t0); t0 = performance.now();

    const amb = env.ambient || [1, 1, 1];
    tintSprites(Math.min(1, amb[0] * 1.05), Math.min(1, amb[1] * 1.05), Math.min(1, amb[2] * 1.05));
    setNightWindows(Math.max(0, 0.9 - env.daylight));
    // effects layer scale: pixels per metre at arm's length in front of the camera
    const f = this.r2d.ch / (2 * Math.tan(cam.fov * Math.PI / 360));
    this.proj.cam.zoom = f / 7;
    if (this.post) this.post.setImpact(game.fx && game.fx.impact > 0 ? 1 : 0, game.fx?.impactColor);
    this.clearCameraProps();
    prof('r.misc', t0); t0 = performance.now();
    this.draw(cam);
    prof('r.draw', t0);
  }

  /**
   * Third person: a tree, bush or rock the camera has swung into is hidden
   * while it's there — seen from inside, its outline shell would black out
   * the whole screen.
   */
  clearCameraProps() {
    const hidden = this.camHidden || (this.camHidden = new Map());
    const want = new Set();
    const w = this.world;
    if (this.rig.mode === 'third' && w?.objects) {
      const cp = this.rig.camera.getWorldPosition(_ray1);
      const cx = w.wx((this.ox || 0) + cp.x), cy = (this.oy || 0) + cp.z, ch = cp.y;
      for (const o of w.objects.near(cx, cy, 8)) {
        if (!CAM_CLEAR[o.kind]) continue;
        const v = this.built.get(o);
        if (!v) continue;
        const e = propExtent(v);
        if (!e) continue;
        const dx = w.dx(o.x, cx), dy = cy - o.y;
        if (dx * dx + dy * dy < (e.r + 0.4) ** 2 && ch > e.y - 0.6 && ch < e.y + e.top + 0.4) want.add(v);
      }
    }
    for (const v of hidden.keys()) if (!want.has(v)) { showProp(v, true); hidden.delete(v); }
    for (const v of want) if (!hidden.has(v)) { showProp(v, false); hidden.set(v, true); }
  }

  /**
   * Title-screen flyover: a camera slowly circling high over (cx, cy) with no
   * player, in the same world, sky and sea as the game.
   */
  renderAttract(game, cx, cy, t, islandR = 80) {
    const w = game.world;
    if (w !== this.world) this.setWorld(w);
    const now = performance.now();
    this.lastT = now;
    this.frame++;
    if (this.frame === 4) this.warmUp();
    const env = game.env;
    // A slow orbit out over the water, at one height clear of every hill on
    // the way round (no bobbing up and down with the ground below), always
    // looking in across the island a little ahead of where it's going.
    const A = this.attractPath && this.attractPath.cx === cx && this.attractPath.cy === cy ? this.attractPath : null;
    if (!A) {
      const R = Math.max(95, islandR * 1.3);
      let top = 0;
      for (let k = 0; k < 72; k++) {
        const q = (k / 72) * Math.PI * 2;
        for (const f of [0.55, 0.8, 1]) top = Math.max(top, this.ground(w.wx(cx + Math.cos(q) * R * f), cy + Math.sin(q) * R * f));
      }
      this.attractPath = { cx, cy, R, H: Math.max(0, top) + 26, gc: Math.max(0, this.ground(cx, cy)) };
      return this.renderAttract(game, cx, cy, t, islandR);
    }
    const a = t * 0.028;
    const R = A.R * (1 + 0.06 * Math.sin(t * 0.05));
    const ox = w.wx(cx + Math.cos(a) * R), oy = cy + Math.sin(a) * R;
    this.ox = ox; this.oy = oy;
    // where it looks: past the island's centre, a little ahead along the orbit
    const la = a + 0.55;
    const lx = cx + Math.cos(la) * R * 0.22, ly = cy + Math.sin(la) * R * 0.22;
    const ldx = w.dx(ox, lx), ldy = ly - oy;
    const yaw = Math.atan2(ldy, ldx);
    this.rig.yaw = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const camYaw3 = -(yaw + Math.PI / 2);
    const cam = this.rig.camera;
    const gh = Math.max(0, this.ground(ox, oy));
    const camH = A.H + Math.sin(t * 0.07) * 2.5;
    cam.position.set(0, camH, 0);
    const dist = Math.hypot(ldx, ldy);
    const pitch = Math.atan2(A.gc + 4 - camH, dist);
    cam.rotation.set(0, 0, 0);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = camYaw3;
    cam.rotation.x = Math.max(-0.42, Math.min(-0.08, pitch));
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
    this.updateProps(game, ox, oy, env, true);
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
      const t0 = performance.now();
      try { fn(env, this.ctx, dt); } catch (e) { if (!fn.warned) { fn.warned = true; console.warn('3D frame hook failed', e); } }
      prof('h.' + (fn.label || 'hook'), t0);
    }
  }

  /**
   * Under the surface (depth = metres the camera is below sea level): the sea
   * closes in blue-green (darker and nearer the deeper you go), the sky is
   * gone and the surface becomes a bright rippling ceiling.
   */
  underwater(env, depth) {
    const on = depth > 0.06 && this.world?.zone === 0;
    this.water.uniforms.uUnder.value = on ? 1 : 0;
    this.sky.mesh.visible = !on;
    this.isUnder = on;
    // Fish-Men and merfolk see far and clearly under the sea; for anyone else
    // it closes in, darker and murkier the deeper they go
    const clear = !!this.game?.player?.gills;
    this.post?.setInkFar(on ? (clear ? 48 : 14) : 160);
    if (!on) {
      if (this.wasUnder) { this.renderer.setClearColor(0x000000, 1); this.wasUnder = false; }
      return;
    }
    this.wasUnder = true;
    const k = Math.min(1, depth / 45) * (clear ? 0.45 : 1);
    const day = (clear ? 0.45 : 0.22) + (clear ? 0.55 : 0.78) * (env.daylight ?? 1);
    const col = (this._uc || (this._uc = new THREE.Color())).setRGB(0.02 + 0.03 * (1 - k), 0.07 + 0.22 * (1 - k), 0.14 + 0.24 * (1 - k));
    if (clear) col.lerp(_clearSea, 0.25);
    col.multiplyScalar(day);
    const fog = this.sky.fog;
    fog.color.copy(col);
    fog.near = 0.5;
    fog.far = clear ? 90 - k * 24 : 34 - k * 14;
    FOG.fogDensity2.value = clear ? 0.024 + k * 0.012 : 0.062 + k * 0.036;
    FOG.fogHeightK.value = 0.0001;
    FOG.fogBase.value = 0;
    FOG.fogSunColor.value.copy(col);
    this.renderer.setClearColor(col, 1);
  }

  /** The view ray in world terms: from (x, y, height h) along (dx, dy, dh), unit length. */
  aimRay() {
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const p = cam.getWorldPosition(_ray1), d = cam.getWorldDirection(_ray2);
    return { x: (this.ox || 0) + p.x, y: (this.oy || 0) + p.z, h: p.y, dx: d.x, dy: d.z, dh: d.y };
  }

  /**
   * The ray the player points with: through the crosshair, or through the
   * cursor while the mouse is free (third person without shift lock).
   */
  pointerRay(game) {
    const free = !this.rig.locked && (this.rig.lockFailed || this.rig.freeMouse) && !game.input?.touch?.on;
    if (!free) return this.aimRay();
    const cam = this.rig.camera, m = game.input.mouse;
    cam.updateMatrixWorld();
    _ndc.set(m.x / window.innerWidth * 2 - 1, -(m.y / window.innerHeight * 2 - 1));
    _caster.setFromCamera(_ndc, cam);
    const o = _caster.ray.origin, d = _caster.ray.direction;
    return { x: (this.ox || 0) + o.x, y: (this.oy || 0) + o.z, h: o.y, dx: d.x, dy: d.z, dh: d.y };
  }

  /**
   * Does the ray pass through this actor's figure (a standing capsule where
   * the model is drawn)? The distance along the ray and how close it came.
   */
  rayHitsActor(ray, a) {
    const w = this.world, v = this.actorViews.get(a);
    const s = a.look?.scale || 1;
    const base = v ? v.root.position.y : this.ground(a.x, a.y) + (a.z || 0);
    const top = base + 1.95 * s, r = 0.42 * s + 0.12;
    const ox = w ? w.dx(ray.x, a.x) : a.x - ray.x, oy = a.y - ray.y;
    let t0 = 0, t1 = 14;
    if (Math.abs(ray.dh) > 1e-5) {
      let ta = (base - ray.h) / ray.dh, tb = (top - ray.h) / ray.dh;
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    } else if (ray.h < base || ray.h > top) return null;
    if (t1 < t0) return null;
    const hh = ray.dx * ray.dx + ray.dy * ray.dy;
    let t = hh > 1e-8 ? (ox * ray.dx + oy * ray.dy) / hh : t0;
    t = Math.min(t1, Math.max(t0, t));
    const miss = Math.hypot(ox - ray.dx * t, oy - ray.dy * t);
    return miss <= r ? { t, miss: miss / r } : null;
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

  /**
   * Static world objects out to the render distance: 3D models where
   * registered, sprites otherwise. The ring round the player is looked over
   * every few steps; the whole of it only every FAR_STEP metres (and when the
   * render distance changes), since that means going through thousands.
   */
  updateProps(game, ox, oy, env, sailing) {
    const w = this.world;
    if (!w.objects) return;
    const O = this.propOrigin;
    if (!O || Math.abs(w.dx(O.x, ox)) > REBASE || Math.abs(oy - O.y) > REBASE) this.rebase(ox, oy);
    this.propT -= 1 / 60;
    const D = this.viewDist(sailing), S = this.scan;
    const full = !S || S.D !== D || Math.hypot(w.dx(S.fx, ox), oy - S.fy) >= FAR_STEP;
    if (full || !(Math.hypot(w.dx(S.x, ox), oy - S.y) < 7 && this.propT > 0 && S.day === env.day && !this.propsDirty)) {
      const t0 = performance.now();
      this.scanProps(ox, oy, env, D, full);
      prof(full ? 'b.scan-far' : 'b.scan', t0);
    }
    this.buildQueued(ox, oy);
  }

  /**
   * Place everything built afresh from a new origin at (ox, oy). Props sit
   * relative to this origin (so the thousands of them needn't be moved as the
   * player walks: the whole group is), and it only moves on when the player
   * has gone a long way from it.
   */
  rebase(ox, oy) {
    const w = this.world;
    this.propOrigin = { x: ox, y: oy };
    for (const [o, v] of this.built) if (v) v.position.set(w.dx(ox, o.x), v.position.y, o.y - oy);
    this.buildingsFar.place(this.propOrigin);
    this.propsDirty = true; // (and the sprites with them, at once)
  }

  /**
   * Which objects are in range: models to keep or queue, sprites for the
   * rest. `full` goes out to the render distance D (and FAR_STEP beyond, so
   * nothing inside it is missing before the next full look); otherwise only
   * the ring near the player is looked over.
   */
  scanProps(ox, oy, env, D, full) {
    const w = this.world, O = this.propOrigin, bf = this.buildingsFar;
    this.propT = 0.6;
    this.propsDirty = false;
    const R = D + FAR_STEP + 8;
    const RK = R + 16; // (what's built stays a little further out, so walking back and forth doesn't rebuild it)
    const RN = Math.min(R, NEAR_SCAN);
    const r = full ? RK : RN;
    if (full) this.scan = { x: ox, y: oy, day: env.day, D, fx: ox, fy: oy };
    else Object.assign(this.scan, { x: ox, y: oy, day: env.day });
    const objs = w.objects.query(ox - r, oy - r, ox + r, oy + r);
    const items = [];
    const keep = full ? new Set() : null;
    const near = [], far = full ? [] : null;
    if (full) {
      bf.begin();
      // landmarks seen from far off (a whale the size of a hill): in view from much further
      for (const o of w.farObjects || []) {
        if (o.hidden || !PROP_BUILDERS.has(o.kind)) continue;
        const dx = w.dx(ox, o.x), dy = o.y - oy;
        const d2 = dx * dx + dy * dy, lim = Math.min(o.far, R + 80);
        if (d2 > lim * lim) continue;
        if (this.built.get(o) === undefined) near.push([o, Math.min(d2, 23 * 23)]);
        else keep.add(o);
      }
    }
    const sprites = Math.min(80, RN);
    for (const o of objs) {
      if (o.far || o.hidden) continue;
      const dx = w.dx(ox, o.x), dy = o.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      if (PROP_BUILDERS.has(o.kind)) {
        const v = this.built.get(o);
        if (o.kind === 'building') {
          // a block in its cell's far mesh out to the render distance; the
          // full model only near (built in the next frames: see buildQueued)
          if (full) bf.add(o, d2 <= R * R);
          if (v === undefined) { if (d2 <= MODEL_IN * MODEL_IN) near.push([o, d2]); continue; }
          if (v && d2 > MODEL_OUT * MODEL_OUT) { this.retire(o, v); continue; }
          if (v && this.retiring.has(o)) { this.retiring.delete(o); if (v.parent) bf.show(o, false); }
          keep?.add(o);
          continue;
        }
        if (v === undefined) {
          if (d2 <= R * R) (d2 <= RN * RN || !far ? near : far).push([o, d2]);
          continue;
        }
        keep?.add(o);
        if (v) continue;
      }
      // sprites only nearby (they're flat; far away the fog hides them)
      if (d2 > sprites * sprites && (o.kind !== 'tree' || d2 > RN * RN)) continue;
      const s = propSprite(o, w.id, env.day);
      if (s) items.push({ o, sprite: s, rx: w.dx(O.x, o.x), rz: o.y - O.y, h: this.terrain.terrainAt(o.x, o.y) });
    }
    if (full) {
      for (const [o, v] of this.built) if (!keep.has(o) && !this.retiring.has(o)) this.dropProp(o, v);
      bf.end();
    }
    // farthest first, so the nearest pops off the end
    near.sort((a, b) => b[1] - a[1]);
    this.propQueue = near;
    if (far) { far.sort((a, b) => b[1] - a[1]); this.farQueue = far; }
    const t0 = performance.now();
    this.forest.rebuild(items);
    prof('b.forest', t0);
  }

  /**
   * The height a prop stands at: a building on the ground at its front door
   * (its foundation reaches down to hide any slope); anything smaller on the
   * lowest ground round its foot, sunk a little into a slope rather than
   * floating off its low side.
   */
  propY(o) {
    if (o.kind === 'building') return this.ground(o.x, o.y);
    const c = COLLIDE[o.kind];
    const r = (Array.isArray(c) ? Math.hypot(c[0], c[1]) : c || 0) * (o.s || 1);
    return this.terrain.restAt(o.x, o.y, r);
  }

  /** A building's model goes (it's out of range now), once its far block has been drawn in its place. */
  retire(o, v) {
    if (this.retiring.has(o)) return;
    this.buildingsFar.add(o, true);
    this.buildingsFar.show(o, true);
    this.retiring.set(o, v);
  }

  /** Take a built prop out of the scene and forget it. */
  dropProp(o, v) {
    if (v) { this.detach(v); disposeTree(v); }
    this.built.delete(o);
    this.animProps.delete(o);
    this.retiring.delete(o);
    if (o.kind === 'building') this.buildingsFar.show(o, true);
  }

  /**
   * Build the queued models, nearest first, a few milliseconds' worth a frame:
   * a harbour town coming over the horizon is dozens of buildings, and built
   * all at once they'd freeze the game for a moment. Anything close by is
   * built straight away. The towns' far blocks come first: they're quick, and
   * they stand in for each building until its model is up.
   */
  buildQueued(ox, oy) {
    const t0 = performance.now(), end = t0 + (this.propBudget ?? PROP_BUDGET_MS);
    this.buildingsFar.update(ox, oy, end);
    for (const [o, v] of this.retiring) if (this.buildingsFar.drawn(o)) this.dropProp(o, v);
    prof('b.far', t0);
    for (const q of [this.propQueue, this.farQueue]) {
      while (q && q.length) {
        const [o, d2] = q[q.length - 1];
        if (d2 > 24 * 24 && performance.now() > end) return;
        if (d2 > 24 * 24 && !this.terrain.landDrawn(o.x, o.y)) break; // (its ground first: see TerrainView.buildMissing)
        q.pop();
        this.buildProp(o);
      }
    }
  }

  buildProp(o) {
    if (this.built.has(o) || o.hidden) return;
    const w = this.world, O = this.propOrigin;
    const builder = PROP_BUILDERS.get(o.kind);
    const t1 = performance.now();
    let v;
    try { v = builder(o, this.ctx) || null; } catch (e) { v = null; console.warn('3D builder failed for', o.kind, e); }
    prof('b.' + o.kind, t1);
    this.built.set(o, v);
    if (!v) { this.propsDirty = true; return; } // (drawn as a sprite from the next pass)
    v.position.set(w.dx(O.x, o.x), v.userData.noGround ? 0 : this.propY(o), o.y - O.y);
    // (a building's far block gives way once its model is in the scene)
    if (o.kind === 'building') v.addEventListener('added', () => { if (!this.retiring.has(o)) this.buildingsFar.show(o, false); });
    this.attach(v, this.props);
    if (v.userData.update) this.animProps.set(o, v);
  }

  /**
   * Put a newly built object into the scene once its shaders are ready. The
   * first time a new kind of material is drawn, the GPU compiles its shaders
   * and that frame stalls (on some machines for a good part of a second: the
   * first ship with painted sails, the first Sea King...). Where the browser
   * can compile in the background (KHR_parallel_shader_compile), that's done
   * first, and the object joins the scene a frame or two later; already
   * compiled materials cost nothing extra.
   */
  attach(obj, parent) {
    if (!(obj.isMesh || obj.children.length)) { parent.add(obj); return; }
    const u = obj.userData;
    const join = () => {
      if (u.pendingAdd !== parent) return; // (dropped again before it was ready)
      u.pendingAdd = null;
      parent.add(obj);
    };
    u.pendingAdd = parent;
    if (this.parallelCompile) {
      this.compileAsync(obj).then(join);
      return;
    }
    // without it: set any new shaders compiling now (the GPU works on them
    // while the game goes on; the stall only comes at the first draw) and
    // bring the object in a moment later
    const n = this.renderer.info.programs.length;
    try { this.renderer.compile(obj, this.rig.camera, this.scene); } catch (e) { /* (it's drawn regardless) */ }
    if (this.renderer.info.programs.length === n) join();
    else setTimeout(join, 150);
  }

  /**
   * Shader warm-up, a moment after the view starts (behind the title screen).
   * The GPU compiles a material's shaders the first time it's drawn, and that
   * frame stalls, on some machines for a good part of a second. So everything
   * already in the scene is compiled now (the ground cover, sea bed, rain,
   * lamps..., much of it unseen until you walk into a forest or dive or it
   * rains), and a few ships built out of sight for it, then let go.
   */
  warmUp() {
    const zoo = new THREE.Group();
    for (const o of [{ type: 'sloop' }, { type: 'carrack' }, { type: 'war_galleon', faction: 'marine' }]) {
      try {
        const s = new Ship({ ...o, x: 0, y: 0 });
        zoo.add(((VIEWS.ship ? VIEWS.ship(s, this.ctx) : null) || new ShipView(s)).root);
      } catch (e) { /* (only a warm-up) */ }
    }
    // (the ships' materials aren't disposed: that would drop the compiled shaders again)
    try {
      if (this.parallelCompile) {
        this.compileAsync(this.scene, null);
        this.compileAsync(zoo);
      } else {
        this.renderer.compile(this.scene, this.rig.camera);
        this.renderer.compile(zoo, this.rig.camera, this.scene);
      }
    } catch (e) { console.warn('shader warm-up failed', e); }
  }

  /**
   * Compile an object's shaders without blocking (KHR_parallel_shader_compile)
   * and resolve once they're ready. (three's own compileAsync never settles if
   * one of the materials is disposed while it waits — an actor's view swapped
   * for a nearer/farther one, say — and whatever was waiting on it would never
   * be added to the scene: people you could talk to but not see. This one
   * shrugs that off, and gives up waiting after a couple of seconds.)
   */
  compileAsync(obj, target = this.scene) {
    let mats;
    try { mats = this.renderer.compile(obj, this.rig.camera, target || obj); } catch (e) { return Promise.resolve(); }
    const props = this.renderer.properties, t0 = performance.now();
    return new Promise((resolve) => {
      const check = () => {
        try {
          for (const m of mats) {
            const prog = props.get(m).currentProgram;
            if (!prog || prog.isReady()) mats.delete(m);
          }
        } catch (e) { mats.clear(); }
        if (!mats.size || performance.now() - t0 > 2500) resolve();
        else setTimeout(check, 16);
      };
      check();
    });
  }

  /** Take an object back out of the scene (or out of the queue for it). */
  detach(obj) {
    if (!obj) return;
    obj.userData.pendingAdd = null;
    obj.removeFromParent();
  }

  updateEntities(game, ox, oy, env, camYaw3) {
    const w = this.world;
    const p = game.player;
    const seen = new Set();
    // characters
    const near = [];
    for (const a of game.actors) {
      if (!a.alive || a.hidden) continue;
      // (in first person too: your own body is drawn — below the neck — see chars3d ownBody)
      if (a.onShip && a !== p) continue;
      const dx = w.dx(ox, a.x), dy = a.y - oy;
      const d2 = dx * dx + dy * dy;
      // (a character already shown stays a little further out: no rebuilding at the edge)
      if (d2 > ACTOR_RANGE * ACTOR_RANGE && (d2 > (ACTOR_RANGE + 10) ** 2 || !this.actorViews.has(a))) continue;
      near.push([a, dx, dy, d2]);
    }
    near.sort((a, b) => a[3] - b[3]);
    let i = 0, made = 0;
    for (const [a, dx, dy, d2] of near) {
      seen.add(a);
      let v = this.actorViews.get(a);
      if (!v) {
        // new characters: nearest first, and beyond arm's reach only a couple a
        // frame (a crowd coming into range would otherwise be one long stall)
        if (made >= 2 && d2 > 15 * 15) continue;
        made++;
        const t0 = performance.now();
        v = VIEWS.actor ? VIEWS.actor(a, this.ctx, { dist: Math.sqrt(d2) }) : null;
        prof('b.actor', t0);
        if (!v) v = new ActorSpriteView(a);
        this.actorViews.set(a, v);
        this.attach(v.root, this.ents);
      } else if (v.stale?.()) {
        this.detach(v.root); v.dispose?.();
        v = VIEWS.actor ? VIEWS.actor(a, this.ctx, { dist: Math.sqrt(d2) }) || new ActorSpriteView(a) : new ActorSpriteView(a);
        this.actorViews.set(a, v);
        this.attach(v.root, this.ents);
      }
      let gh;
      if (a.deck) gh = a.deck.h + shipBob(a.deck.ship, env.time) + pitchRise(a.deck.ship, (a.deck.t - 0.5) * a.deck.ship.def.length);
      else if (a.flying) gh = Math.max(0, this.ground(a.x, a.y));
      else if (a.seaCreature) gh = Math.max(-(a.depth || 0), this.terrain.terrainAt(a.x, a.y) + 0.35);
      else if (a.inWater) {
        // afloat with the head out, stretched out along the surface when swimming,
        // or deeper when diving (and standing on the bottom in the shallows)
        const flat = (a.moving || a.under || a.gills) && !(a.fruit && !a.gills);
        gh = waterLevel(this.game.world, a.x, a.y) - (a.depth || 0) - (flat ? 0.95 : 1.3) * (a.look?.scale || 1);
        // (a Devil Fruit user fighting to keep their head up bobs and splutters)
        if (a.fruit && !a.gills && !a.sinking) gh += Math.sin(env.time * 5.5 + a.x * 3) * 0.09;
        gh = Math.max(gh, this.terrain.terrainAt(a.x, a.y));
      } else if (a.wading) gh = this.ground(a.x, a.y) - a.wading; // (feet on the bottom of the shallows)
      else gh = this.ground(a.x, a.y);
      v.root.position.set(dx, gh + (a.z || 0), dy);
      v.update(a, env, this.ctx, { camYaw3, redraw: i < 18 || (this.frame + i) % 3 === 0 });
      i++;
    }
    for (const [a, v] of this.actorViews) {
      if (seen.has(a)) continue;
      this.detach(v.root); v.dispose?.();
      this.actorViews.delete(a);
    }
    // ships, out to the render distance (they're big: a hull's end comes into view before its middle)
    const seenS = new Set();
    const SR = this.viewDist(!p || p.mode === 'sail') + 30;
    for (const s of game.ships) {
      const dx = w.dx(ox, s.x), dy = s.y - oy;
      const d2 = dx * dx + dy * dy;
      if (!s.alive || (d2 > SR * SR && (d2 > (SR + 40) ** 2 || !this.shipViews.has(s)))) continue;
      seenS.add(s);
      let v = this.shipViews.get(s);
      if (v && v.stale?.()) { this.detach(v.root); v.dispose?.(); v = null; }
      if (!v) {
        const t0 = performance.now();
        v = (VIEWS.ship ? VIEWS.ship(s, this.ctx) : null) || new ShipView(s);
        prof('b.ship', t0);
        this.shipViews.set(s, v);
        this.attach(v.root, this.ents);
      }
      v.update(env, dx, dy, env.windAngle, this.ctx);
    }
    for (const [s, v] of this.shipViews) {
      if (seenS.has(s)) continue;
      this.detach(v.root); v.dispose?.();
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
      // (a ship's cannonball arcs from her gunport down into the sea at the end of its range)
      let y3;
      if (pr.arc) { const f = Math.min(1, (pr.traveled || 0) / (pr.range || 1)); y3 = pr.arc.h0 * (1 - f) + pr.arc.apex * 4 * f * (1 - f) - f * 0.2; }
      else y3 = Math.max(0.2, this.terrain.terrainAt(pr.x, pr.y + 0.5)) + h + (pr.z || 0);
      m.position.set(w.dx(ox, pr.x), y3, pr.y + 0.5 - oy);
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
