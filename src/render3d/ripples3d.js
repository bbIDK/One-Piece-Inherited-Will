// Rings on the water: spreading from a swimmer's strokes, round your legs as
// you wade, and bigger where someone jumps in or leaps out. The game asks for
// them with game.fx.ripple(x, y, size); each is a flat soft ring on the
// surface that widens and fades, a few of them one after another for a big
// splash. All in one instanced mesh.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { SEA_Y } from './height.js';

const MAX = 96;

function ringTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.9, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Ripples {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: ringTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.count = 0;
    this.mesh.name = 'ripples';
    scene.add(this.mesh);
    this.list = [];
    this.m4 = new THREE.Matrix4();
  }

  update(ctx, env, dt) {
    const g = ctx.game, v = g?.view3d, w = ctx.world;
    if (!v || !w) return;
    // new rings: a big splash sends out two or three, one after another
    const q = g.fx?.ripples;
    if (q && q.length) {
      for (const r of q) {
        const n = r.size > 1.2 ? 3 : r.size > 0.9 ? 2 : 1;
        for (let i = 0; i < n; i++) this.list.push({ x: r.x, y: r.y, t: -i * 0.16, life: 0.9 + r.size * 0.5, r0: 0.15 * r.size, r1: (1.1 + i * 0.5) * r.size, a: (r.strength ?? 1) * (0.55 - i * 0.12) });
      }
      q.length = 0;
      if (this.list.length > MAX) this.list.splice(0, this.list.length - MAX);
    }
    let n = 0;
    const m4 = this.m4, e = m4.elements, col = this.mesh.instanceColor.array;
    const under = v.isUnder;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      r.t += dt;
      if (r.t >= r.life) { this.list.splice(i, 1); continue; }
      if (r.t < 0 || under) continue;
      const k = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)); // fast, then slowing
      const fade = r.a * (1 - k) * Math.min(1, r.t / 0.06) * (0.6 + 0.4 * (env.daylight ?? 1));
      m4.identity();
      e[0] = rad * 2; e[10] = rad * 2;
      e[12] = w.dx(v.ox, r.x); e[13] = SEA_Y + 0.03; e[14] = r.y - v.oy;
      this.mesh.setMatrixAt(n, m4);
      col[n * 3] = fade; col[n * 3 + 1] = fade; col[n * 3 + 2] = fade;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
}

let ripples = null;
registerFrameHook((env, ctx, dt) => {
  if (!ripples) ripples = new Ripples(ctx.scene);
  ripples.update(ctx, env, dt || 1 / 60);
}, 'ripples');
