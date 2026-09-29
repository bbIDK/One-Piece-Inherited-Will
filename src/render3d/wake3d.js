// Wakes: trails of foam on the water behind whatever moves through it — a
// ship's stern (two bright arms of churned water with paler foam between),
// a swimmer's shoulders (a faint, narrow V). Positions are kept in world
// tiles; the ribbon is rebuilt each frame around the moving origin.
import * as THREE from 'three';
import { swellAt } from './swell.js';

let FOAM = null;
/** Churned-water foam: marbled veins of white over thinner patches, swirled (tiles both ways). */
function foamTexture() {
  if (FOAM) return FOAM;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // gradient noise that repeats every P lattice cells across the tile
  const lat = new Map();
  const grad = (P, i, j) => {
    const k = P * 4096 + (((j % P) + P) % P) * P + (((i % P) + P) % P);
    let v = lat.get(k);
    if (!v) { const a = r() * Math.PI * 2; v = [Math.cos(a), Math.sin(a)]; lat.set(k, v); }
    return v;
  };
  const q = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const noise = (x, y, P) => {
    const fx = x / S * P, fy = y / S * P, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const d = (gi, gj, dx, dy) => { const gg = grad(P, gi, gj); return gg[0] * dx + gg[1] * dy; };
    const a = d(i, j, u, v), b = d(i + 1, j, u - 1, v), c2 = d(i, j + 1, u, v - 1), e = d(i + 1, j + 1, u - 1, v - 1);
    const su = q(u), top = a + (b - a) * su;
    return top + (c2 + (e - c2) * su - top) * q(v);
  };
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // swirl the coordinates so the veins curl
      const wx = x + noise(x, y, 4) * 14, wy = y + noise(x + 40, y + 17, 4) * 14;
      let ridged = 0, fbm = 0, amp = 0.55, tot = 0;
      for (const P of [4, 8, 16, 32]) { const n = 1 - Math.abs(noise(wx, wy, P) * 1.6); ridged += amp * n * n; tot += amp; amp *= 0.55; }
      ridged /= tot;
      amp = 0.6; tot = 0;
      for (const P of [4, 8, 16]) { fbm += amp * noise(x, y, P); tot += amp; amp *= 0.5; }
      fbm = fbm / tot * 1.5 + 0.5;
      const fine = noise(x, y, 16) * 0.6 + noise(x, y, 32) * 0.4;
      const veins = sst(0.58, 0.86, ridged), body = sst(0.5, 0.9, fbm) * sst(-0.1, 0.35, fine);
      const a = Math.min(1, veins * (0.35 + 0.65 * sst(0.3, 0.7, fbm)) + body * 0.45);
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  FOAM = new THREE.CanvasTexture(c);
  FOAM.wrapS = FOAM.wrapT = THREE.RepeatWrapping;
  FOAM.anisotropy = 8;
  return FOAM;
}
// across the trail: faded outer edge, a bright churned arm, paler water between
const ACROSS = [-1, -0.62, -0.22, 0.22, 0.62, 1], ALPHA = [0, 1, 0.45, 0.45, 1, 0];
const WK = ACROSS.length;

/**
 * A trail of foam: `n` points dropped every `every` seconds, each living
 * `life` seconds. update() is given this frame's source ({ x, y, h: heading,
 * sp: speed }, or null when nothing's under way to leave one) and `shape(q,
 * age)`, which says how wide (half-width, m) and how bright (0..1) the trail
 * is at a point of that age (0..1).
 */
export class WakeTrail {
  constructor({ n = 36, life = 4.2, every = 0.11, y = 0.04, grain = 0.3, drift = 0.17 } = {}) {
    this.n = n; this.life = life; this.every = every; this.y = y; this.grain = grain; this.drift = drift;
    this.pts = []; // { x, y, h (heading), t, sp }
    const m = n * WK;
    this.pos = new Float32Array(m * 3);
    this.col = new Float32Array(m * 4);
    this.uv = new Float32Array(m * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < WK - 1; k++) {
        const a = i * WK + k, b = a + 1, c = a + WK, d = b + WK;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: foamTexture(), vertexColors: true, transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.lastT = -1;
  }

  update(src, time, ox, oy, w, shape) {
    // drop a point at the source every so often while under way
    if (src && time - this.lastT > this.every) {
      this.lastT = time;
      this.pts.unshift({ x: src.x, y: src.y, h: src.h, t: time, sp: src.sp });
      if (this.pts.length > this.n) this.pts.length = this.n;
    }
    while (this.pts.length && time - this.pts[this.pts.length - 1].t > this.life) this.pts.pop();
    const n = this.pts.length;
    const g = this.mesh.geometry;
    if (n < 2) { g.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const q = this.pts[i];
      const [half, bright] = shape(q, (time - q.t) / this.life);
      const fade = bright * (i === 0 ? 0 : 1);
      const px = -Math.sin(q.h), py = Math.cos(q.h);
      const cx = w.dx(ox, q.x), cz = q.y - oy;
      for (let j = 0; j < WK; j++) {
        const o = i * WK + j;
        // the foam stays where it was churned (texture fixed to the water, spreading sideways)
        this.uv[o * 2] = (ACROSS[j] * half) * this.grain;
        this.uv[o * 2 + 1] = (q.x * Math.cos(q.h) + q.y * Math.sin(q.h)) * this.drift;
        this.pos[o * 3] = cx + px * half * ACROSS[j];
        // (lying on the swell, not cutting through it)
        this.pos[o * 3 + 1] = this.y + swellAt(q.x + px * half * ACROSS[j], q.y + py * half * ACROSS[j]);
        this.pos[o * 3 + 2] = cz + py * half * ACROSS[j];
        this.col[o * 4] = 0.95; this.col[o * 4 + 1] = 0.98; this.col[o * 4 + 2] = 1; this.col[o * 4 + 3] = ALPHA[j] * fade;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * (WK - 1) * 6);
  }

  clear() { this.pts.length = 0; this.mesh.geometry.setDrawRange(0, 0); }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}
