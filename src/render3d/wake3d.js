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
 * A trail of foam: points dropped behind the source as it goes — every
 * `every` seconds, and more often through a turn (each `turn` radians it
 * comes round) — each living `life` seconds; the ribbon runs from them up
 * to the source itself, wherever it is this frame (so it never lags behind
 * the stern, or jumps on as a point drops). update() is given this frame's
 * source ({ x, y, h: heading, sp: speed }, or null when nothing's under way
 * to leave one) and `shape(q, age)`, which says how wide (half-width, m) and
 * how bright (0..1) the trail is at a point of that age (0..1).
 *
 * Laid along the track itself (each cross-section square to the way the
 * source went, not the way it was pointing — a ship swinging round skids
 * her stern out), drawn in toward the inside of a turn so its edges never
 * fold back over each other there, and its foam texture runs along the
 * distance travelled (it stays where it was churned, however she turns: no
 * smear).
 */
export class WakeTrail {
  constructor({ n = 36, life = 4.2, every = 0.11, y = 0.04, grain = 0.3, drift = 0.17, turn = 0.05, fadeIn = 0.8 } = {}) {
    this.n = n; this.life = life; this.every = every; this.y = y; this.grain = grain; this.drift = drift; this.turn = turn; this.fadeIn = fadeIn;
    this.pts = []; // { x, y, h (heading), t, sp, s (distance along the track) }
    this.rows = n + 1; // (and the source itself, ahead of them)
    const m = this.rows * WK;
    this.pos = new Float32Array(m * 3);
    this.col = new Float32Array(m * 4);
    this.uv = new Float32Array(m * 2);
    this.k = new Float32Array(this.rows * 4); // per row: normal x, y; curvature; distance
    const idx = [];
    for (let i = 0; i < this.rows - 1; i++) {
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
    this.head = { x: 0, y: 0, h: 0, t: 0, sp: 0, s: 0 };
  }

  update(src, time, ox, oy, w, shape) {
    const P = this.pts;
    // drop a point at the source every so often while under way (and every bit of a turn)
    if (src) {
      const q = P[0];
      const dh = q ? Math.abs(Math.atan2(Math.sin(src.h - q.h), Math.cos(src.h - q.h))) : 0;
      if (!q || time - this.lastT > this.every || (dh > this.turn && time - this.lastT > 1 / 40)) {
        const d = q ? Math.hypot(w.dx(q.x, src.x), src.y - q.y) : 0;
        // (a long way from the last one — a ship set down somewhere new: a fresh trail)
        if (q && d > 60) P.length = 0;
        this.lastT = time;
        P.unshift({ x: src.x, y: src.y, h: src.h, t: time, sp: src.sp, s: P[0] ? P[0].s + d : 0 });
        if (P.length > this.n) P.length = this.n;
      }
    }
    while (P.length && time - P[P.length - 1].t > this.life) P.pop();
    const g = this.mesh.geometry;
    // the rows: the source as it is now, then the points it left
    let rows = P;
    if (src && P.length) {
      const H = this.head, q = P[0];
      H.x = src.x; H.y = src.y; H.h = src.h; H.t = time; H.sp = src.sp; H.s = q.s + Math.hypot(w.dx(q.x, src.x), src.y - q.y);
      rows = this._rows || (this._rows = []);
      rows.length = 0; rows.push(H); for (const p of P) rows.push(p);
    }
    const n = rows.length;
    if (n < 2) { g.setDrawRange(0, 0); return; }
    // which way the track runs at each row (from the older side to the newer), and how sharply it bends there
    const K = this.k;
    for (let i = 0; i < n; i++) {
      const a = rows[Math.max(0, i - 1)], b = rows[Math.min(n - 1, i + 1)];
      let tx = w.dx(b.x, a.x), ty = a.y - b.y, l = Math.hypot(tx, ty);
      if (l < 1e-4) { tx = Math.cos(rows[i].h); ty = Math.sin(rows[i].h); l = 1; }
      K[i * 4] = -ty / l; K[i * 4 + 1] = tx / l; K[i * 4 + 2] = 0;
    }
    for (let i = 1; i < n - 1; i++) {
      const a = rows[i - 1], b = rows[i], c = rows[i + 1];
      const x1 = w.dx(c.x, b.x), y1 = b.y - c.y, x2 = w.dx(b.x, a.x), y2 = a.y - b.y;
      const l1 = Math.hypot(x1, y1), l2 = Math.hypot(x2, y2);
      if (l1 < 1e-3 || l2 < 1e-3) continue;
      // (+: bending toward the +normal side — that side's the inside of the turn)
      const bend = Math.atan2((x1 * y2 - y1 * x2), (x1 * x2 + y1 * y2));
      K[i * 4 + 2] = bend / ((l1 + l2) / 2);
    }
    // (a touch of smoothing along it: one sharp kink doesn't pinch the ribbon)
    let prev = K[2];
    for (let i = 1; i < n - 1; i++) { const cur = K[i * 4 + 2]; K[i * 4 + 2] = (prev + cur * 2 + K[(i + 1) * 4 + 2]) / 4; prev = cur; }
    const sHead = rows[0].s, vBase = Math.floor(rows[n - 1].s * this.drift);
    for (let i = 0; i < n; i++) {
      const q = rows[i];
      const [half, bright] = shape(q, (time - q.t) / this.life);
      // (fading in just behind the source, not starting in a hard edge)
      const run = sHead - q.s, fade = bright * (run <= 0 ? 0 : run >= this.fadeIn ? 1 : (run / this.fadeIn) * (run / this.fadeIn) * (3 - 2 * run / this.fadeIn));
      const px = K[i * 4], py = K[i * 4 + 1], kap = K[i * 4 + 2];
      // (no wider on the inside of a turn than the turn is tight: there the edges would cross)
      const inner = Math.abs(kap) > 1e-4 ? 0.85 / Math.abs(kap) : 1e9;
      const cx = w.dx(ox, q.x), cz = q.y - oy;
      for (let j = 0; j < WK; j++) {
        const o = i * WK + j;
        let off = ACROSS[j] * half;
        if (off * kap > 0 && Math.abs(off) > inner) off = Math.sign(off) * inner;
        // the foam stays where it was churned (texture fixed to the water, spreading sideways)
        this.uv[o * 2] = (ACROSS[j] * half) * this.grain;
        this.uv[o * 2 + 1] = q.s * this.drift - vBase;
        this.pos[o * 3] = cx + px * off;
        // (lying on the swell, not cutting through it)
        this.pos[o * 3 + 1] = this.y + swellAt(q.x + px * off, q.y + py * off);
        this.pos[o * 3 + 2] = cz + py * off;
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
