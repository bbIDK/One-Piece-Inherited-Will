// Night lights. From dusk, the street lamps, paper lanterns and campfires of a
// town throw warm pools of light on the ground around them, and the nearest
// few shine for real — on walls, faces and the street — through a handful of
// point lights that follow the camera from lamp to lamp. Indoors, the room's
// own lamp lights the room. Flames flicker; the pools breathe with them.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { bw } from '../world/bframe.js';

const KINDS = {
  lamp: { h: 2.62, r: 6.5, col: [1, 0.72, 0.4], power: 1 },
  lantern: { h: 1.6, r: 4.6, col: [1, 0.55, 0.32], power: 0.75 },
  campfire: { h: 0.55, r: 6.5, col: [1, 0.58, 0.26], power: 1.1, fire: true },
};
const NLIGHTS = 4, MAX_POOLS = 160;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function poolTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.62)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class LampLight {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: poolTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.pools = new THREE.InstancedMesh(geo, mat, MAX_POOLS);
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_POOLS * 3), 3);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 1;
    this.pools.count = 0;
    scene.add(this.pools);
    // (always in the scene, dark by day, so the shaders never need rebuilding)
    this.lights = [];
    for (let i = 0; i < NLIGHTS; i++) {
      const L = new THREE.PointLight(0xffb060, 0, 10, 2);
      L.castShadow = false;
      scene.add(L);
      this.lights.push(L);
    }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.col = new THREE.Color();
    this.near = []; this.t = 0;
  }

  update(ctx, env, dt) {
    const game = ctx.game, v = game.view3d, w = ctx.world;
    if (!w || !v) return;
    // lamps are lit from dusk to dawn (and in the gloom of a storm)
    const night = clamp01((0.78 - (env.daylight ?? 1)) / 0.45 + (env.storm || 0) * 0.35);
    if (night <= 0.01 || !w.objects) {
      if (this.pools.count) { this.pools.count = 0; for (const L of this.lights) L.intensity = 0; }
      return;
    }
    const ox = v.ox, oy = v.oy, cam = ctx.camera;
    // the lamps around (looked up a few times a second)
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.4;
      this.near = w.objects.near(ox, oy, 75, (o) => !!KINDS[o.kind]);
    }
    const t = env.time;
    const cands = [];
    let n = 0;
    for (const o of this.near) {
      const K = KINDS[o.kind];
      const dx = w.dx(ox, o.x), dz = o.y - oy;
      const gh = ctx.ground(o.x, o.y);
      const fl = K.fire ? 0.82 + 0.18 * Math.sin(t * 13 + o.x) * Math.sin(t * 7.3 + o.y) : 0.95 + 0.05 * Math.sin(t * 9 + o.x * 3);
      const k = night * fl * K.power;
      if (n < MAX_POOLS) {
        const r = K.r * (o.s || 1);
        this.p.set(dx, gh + 0.05, dz);
        this.s.set(r * 2, 1, r * 2);
        this.m4.compose(this.p, this.q, this.s);
        this.pools.setMatrixAt(n, this.m4);
        this.col.setRGB(K.col[0] * k * 0.3, K.col[1] * k * 0.3, K.col[2] * k * 0.3);
        this.pools.setColorAt(n, this.col);
        n++;
      }
      const cd = (dx - cam.position.x) ** 2 + (dz - cam.position.z) ** 2;
      cands.push({ d: cd, x: dx, y: gh + K.h * (o.s || 1), z: dz, k, col: K.col, range: K.r * 1.6 });
    }
    this.pools.count = n;
    this.pools.instanceMatrix.needsUpdate = true;
    if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
    // the lanterns aboard the ships about (stern lanterns, the ones by the cabin
    // doors, and below decks while you're down there): the nearest light the deck
    for (const sv of v.shipViews?.values?.() || []) {
      for (const mesh of [sv.hull, sv.inside?.visible ? sv.inside : null]) {
        const L = mesh?.geometry?.userData?.lamps;
        if (!L || !mesh.parent) continue;
        for (let i = 0; i < L.length; i += 3) {
          const q = this.p.set(L[i], L[i + 1], L[i + 2]);
          mesh.localToWorld(q);
          const cd = (q.x - cam.position.x) ** 2 + (q.y - cam.position.y) ** 2 + (q.z - cam.position.z) ** 2;
          if (cd > 60 * 60) continue;
          const fl = 0.9 + 0.1 * Math.sin(t * 9 + i * 1.7) * Math.sin(t * 5.3 + i);
          cands.push({ d: cd, x: q.x, y: q.y, z: q.z, k: night * fl * 0.8, col: [1, 0.6, 0.32], range: 7.5 });
        }
      }
    }
    // indoors: the room's own lamp
    const p = game.player;
    const room = p && w.interiorAt ? w.roomOf(p) : null;
    if (room) {
      const floor = v.terrain?.hf?.floorY ? v.terrain.hf.floorY(room) : ctx.ground(p.x, p.y);
      const fd = room.fd || 3;
      const c = bw(room, 0, -fd / 2);
      cands.push({ d: -1, x: w.dx(ox, c.x), y: floor + 2.1, z: c.y - oy, k: (0.35 + night * 0.65) * 0.5, col: [1, 0.8, 0.56], range: 6 });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < NLIGHTS; i++) {
      const L = this.lights[i], c = cands[i];
      if (!c) { L.intensity = 0; continue; }
      L.position.set(c.x, c.y, c.z);
      L.color.setRGB(c.col[0], c.col[1], c.col[2]);
      L.distance = c.range;
      L.intensity = 5 * c.k;
    }
  }
}

let lights = null;
registerFrameHook((env, ctx, dt) => {
  if (!lights) { lights = new LampLight(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.lampLight = lights; }
  lights.update(ctx, env, dt || 1 / 60);
}, 'lamplight');
