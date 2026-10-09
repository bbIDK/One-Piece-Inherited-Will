// The wind made visible out at sea: now and then a faint white line streams
// past a few metres over the water, drawn out along the way the wind is
// blowing and wavering a little as it goes — the streaks a cartoon draws for
// a breeze. Only a few at a time (two or three, fewer on 'low'), only over
// open water, only with some wind to show, never indoors, below decks or
// under the sea. They tell you at a glance which way it's blowing, and how
// hard (stronger wind: faster, longer streaks).
//
// Each line traces a fixed wavering path through the air (its wiggle is set
// by the distance along it, not by time, so the shape doesn't squirm): its
// head runs on down the wind, its tail following a set length behind, fading
// in at its head and out along its tail. The ribbons are built on the CPU
// each frame (a few hundred vertices), turned to face the camera, in one
// draw call.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';

const MAXL = 4; // lines at most
const SEG = 30; // points along each
const NV = MAXL * SEG * 2;
const _t = new THREE.Vector3(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

const VS = /* glsl */`
  attribute float aA;
  varying float vA;
  varying float vSide;
  attribute float aSide;
  void main() {
    vA = aA; vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FS = /* glsl */`
  uniform vec3 uCol;
  varying float vA;
  varying float vSide;
  void main() {
    // (soft across its width: a wisp, not a hard stroke)
    float edge = 1.0 - vSide * vSide;
    gl_FragColor = vec4(uCol, vA * edge);
  }
`;

class WindLines {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(NV * 3);
    this.alpha = new Float32Array(NV);
    const side = new Float32Array(NV), idx = [];
    for (let l = 0; l < MAXL; l++) {
      for (let i = 0; i < SEG; i++) {
        const k = (l * SEG + i) * 2;
        side[k] = -1; side[k + 1] = 1;
        if (i < SEG - 1) idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.uniforms = { uCol: { value: new THREE.Color(1, 1, 1) } };
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'wind-lines';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.lines = [];
    this.nextT = 0.5;
  }

  /** Is (x, y) open sea, clear of land for a little way round? */
  openSea(w, x, y) {
    for (const [dx, dy] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) {
      const px = w.wx(x + dx), py = y + dy;
      if (!w.isLiquid?.(px, py) || w.isOverlay?.(px, py)) return false;
    }
    return true;
  }

  update(env, ctx, dt) {
    const game = ctx.game, v = game?.view3d, w = ctx.world, cam = ctx.camera;
    if (!v || !w || !cam) return;
    const p = game.player, lv = p?.deck?.lvl;
    const inside = !!v.isUnder || lv === 'cabin' || lv === 'captain' || lv === 'forecastle' || lv === 'hold' || w.zone !== 0 || !!(p && w.interiorAt?.(p.x, p.y));
    const ws = env.windStrength || 0;
    const want = inside || ws < 0.15 ? 0 : v.quality === 'low' ? 2 : 3;
    const wa = env.windAngle || 0, wdx = Math.cos(wa), wdy = Math.sin(wa);
    const cx = v.ox + cam.position.x, cy = v.oy + cam.position.z;
    // ---- a new one now and then, out over the water round you (ahead of the camera, upwind, so it streams past)
    this.nextT -= dt;
    if (this.nextT <= 0 && this.lines.length < want) {
      this.nextT = 0.8 + Math.random() * 1.8;
      cam.getWorldDirection(_v);
      const fx = _v.x, fy = _v.z, fl = Math.hypot(fx, fy) || 1;
      for (let tries = 0; tries < 6; tries++) {
        const r = 14 + Math.random() * 42, a = Math.atan2(fy / fl, fx / fl) + (Math.random() - 0.5) * 1.8;
        const x = cx + Math.cos(a) * r - wdx * 10, y = cy + Math.sin(a) * r - wdy * 10;
        if (!this.openSea(w, x, y)) continue;
        const U = 5 + 9 * Math.min(1.4, ws);
        this.lines.push({
          x, y, h: 1.6 + Math.random() * 4.5, age: 0, life: 3.2 + Math.random() * 2.2,
          a: wa + (Math.random() - 0.5) * 0.25, U: U * (0.85 + Math.random() * 0.3),
          len: (10 + 8 * Math.min(1.4, ws)) * (0.8 + Math.random() * 0.5),
          amp: 0.35 + Math.random() * 0.5, wave: 7 + Math.random() * 6, ph: Math.random() * 6.28, ph2: Math.random() * 6.28,
        });
        break;
      }
    }
    // ---- age them; drop the spent ones (and all of them, indoors or in a calm)
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const L = this.lines[i];
      L.age += dt;
      if (L.age > L.life || (want === 0 && L.age > 0)) {
        if (want === 0) L.life = Math.min(L.life, L.age + 0.6);
        if (L.age > L.life) this.lines.splice(i, 1);
      }
    }
    // ---- the colour: white, lit as the air is (dim at night)
    const amb = env.ambient ? (env.ambient[0] + env.ambient[1] + env.ambient[2]) / 3 : 1;
    const light = Math.min(1, 0.25 + amb * 0.8);
    this.uniforms.uCol.value.setRGB(0.97 * light, 0.98 * light, light);
    // ---- the ribbons
    const P = this.pos, A = this.alpha;
    A.fill(0);
    const camP = cam.position;
    for (let l = 0; l < this.lines.length && l < MAXL; l++) {
      const L = this.lines[l];
      const dX = Math.cos(L.a), dY = Math.sin(L.a), nX = -dY, nY = dX;
      const head = L.U * L.age;
      const lifeK = Math.min(1, L.age / 0.7) * Math.min(1, (L.life - L.age) / 1.3);
      const pts = [];
      for (let i = 0; i < SEG; i++) {
        const u = i / (SEG - 1);
        const d = Math.max(0, head - u * L.len);
        // (a fixed wavering path in the air: across the wind, and a little up and down)
        const lat = Math.sin(d / L.wave * 6.283 + L.ph) * L.amp;
        const up = Math.sin(d / (L.wave * 1.6) * 6.283 + L.ph2) * L.amp * 0.35;
        const wx = L.x + dX * d + nX * lat, wy = L.y + dY * d + nY * lat;
        pts.push([w.dx(v.ox, wx), L.h + up, wy - v.oy]);
      }
      for (let i = 0; i < SEG; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(SEG - 1, i + 1)], c = pts[i];
        _t.set(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        _p.set(c[0], c[1], c[2]);
        _v.subVectors(_p, camP);
        const dist = _v.length();
        _s.crossVectors(_t, _v).normalize();
        // (thin, and a little wider far off so it doesn't break up into dots)
        const half = 0.07 + dist * 0.0055;
        const k = (l * SEG + i) * 2;
        P[k * 3] = c[0] - _s.x * half; P[k * 3 + 1] = c[1] - _s.y * half; P[k * 3 + 2] = c[2] - _s.z * half;
        P[k * 3 + 3] = c[0] + _s.x * half; P[k * 3 + 4] = c[1] + _s.y * half; P[k * 3 + 5] = c[2] + _s.z * half;
        const u = i / (SEG - 1);
        // (bright at its head, thinning out along its tail; gone where it hasn't reached yet)
        const along = Math.min(1, u / 0.12) * Math.pow(1 - u, 1.4) * (head - u * L.len > 0 ? 1 : 0);
        const far = 1 - Math.min(1, Math.max(0, (dist - 55) / 30));
        const al = 0.55 * along * lifeK * far;
        A[k] = al; A[k + 1] = al;
      }
    }
    this.mesh.visible = this.lines.length > 0;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.aA.needsUpdate = true;
  }
}

let lines = null;
registerFrameHook((env, ctx, dt) => {
  if (!lines) lines = new WindLines(ctx.scene);
  lines.update(env, ctx, dt || 1 / 60);
}, 'windlines');
