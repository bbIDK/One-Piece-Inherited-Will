// Buildings falling to pieces (game/destruction.js): when one comes down its
// model goes and in its place its pieces — wall panels, roof slabs, beams,
// broken masonry, in its own colours — break apart where they stood and
// tumble, thrown from the blow that did it, bouncing and settling on the
// ground round its plot, with a heap of rubble where it stood. A blow that
// doesn't bring it down knocks a few bits off where it lands. The rubble
// stays until the building is put back up (it sinks away as it is).
//
// All of it is one InstancedMesh of boxes (instance colours), simulated here:
// gravity, the ground under each piece, a bounce, friction, rest.
import * as THREE from 'three';
import { vcMat } from './props/mats.js';
import { bw, bangle } from '../world/bframe.js';

const MAX = 3200;
let ICE_MAT = null, SPIKE_MAT = null;
const G = 18;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a, b) => a + Math.random() * (b - a);

/** A unit box with white vertex colours and `tint` 1 (the instance colour takes it: props/mats.js). */
function boxGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3).fill(1);
  // (each face a touch darker or lighter, so a piece reads as a solid lump, not a flat patch)
  const nrm = g.attributes.normal.array;
  for (let i = 0; i < n; i++) { const k = 0.82 + 0.18 * nrm[i * 3 + 1] + 0.06 * nrm[i * 3]; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  return g;
}

export class Debris {
  constructor(parent, view) {
    this.view = view;
    this.mesh = new THREE.InstancedMesh(boxGeo(), vcMat({ inst: 'c' }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'debris';
    parent.add(this.mesh);
    this.list = [];
    this.rev = -1;
    this.world = null;
  }

  clear() {
    this.list.length = 0; this.mesh.count = 0;
    for (const g of this.shells?.values() || []) g.removeFromParent();
    this.shells?.clear();
  }

  /**
   * A building frozen solid (game/destruction.js freeze): a shell of clear
   * blue ice over the whole of it, icicles hanging off its eaves and spikes
   * of ice standing out of its walls. Off again (thawed), or burst apart
   * (shatter): the shell flies to pieces of ice.
   */
  iceShell(b, on, shatter) {
    this.shells ||= new Map();
    const old = this.shells.get(b);
    if (old) { old.removeFromParent(); this.shells.delete(b); }
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    const H = Math.max(3, this.view.builtHeight?.(b) || 2.6 + Math.max(1, (b.hgt || 2) - 1) * 2.6);
    if (on) {
      ICE_MAT ||= new THREE.MeshPhongMaterial({ color: 0xbfe9ff, emissive: 0x2a6f9a, emissiveIntensity: 0.35, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.55, depthWrite: false });
      SPIKE_MAT ||= new THREE.MeshPhongMaterial({ color: 0xe1f5fe, emissive: 0x4fa3d1, emissiveIntensity: 0.3, shininess: 80, transparent: true, opacity: 0.85 });
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.5, H + 0.6, fd + 0.5), ICE_MAT);
      box.position.set(0, (H + 0.6) / 2 - 0.1, -fd / 2);
      box.renderOrder = 3;
      g.add(box);
      const cone = new THREE.ConeGeometry(0.22, 1, 5);
      const n = Math.round(10 + fw * fd * 0.4);
      for (let i = 0; i < n; i++) {
        const sp = new THREE.Mesh(cone, SPIKE_MAT);
        const side = Math.floor(Math.random() * 5), u = Math.random();
        const L = rnd(0.6, 1.8);
        if (side === 4) { sp.position.set((u - 0.5) * fw, H + 0.4 + L / 2, -Math.random() * fd); }
        else if (side < 2) { sp.position.set((u - 0.5) * fw, rnd(0.3, H), side ? -fd - 0.25 - L * 0.3 : 0.25 + L * 0.3); sp.rotation.x = side ? -1.2 : 1.2; }
        else { sp.position.set(side === 2 ? -fw / 2 - 0.25 - L * 0.3 : fw / 2 + 0.25 + L * 0.3, rnd(0.3, H), -u * fd); sp.rotation.z = side === 2 ? 1.2 : -1.2; }
        sp.rotation.y += rnd(-0.4, 0.4);
        sp.scale.set(rnd(0.7, 1.4), L, rnd(0.7, 1.4));
        g.add(sp);
      }
      g.userData.b = b;
      this.mesh.parent.add(g);
      this.shells.set(b, g);
      return;
    }
    if (shatter) {
      // (the shell in pieces, flung out from the house)
      const base = this.view.ground(b.x, b.y), q = { x: b.x, y: b.y };
      const n = Math.round(30 + fw * fd);
      for (let i = 0; i < n; i++) {
        const sz = rnd(0.25, 0.8);
        const p = this.piece(b, base, rnd(-fw / 2, fw / 2), rnd(0.2, H), -rnd(0, fd), sz, sz * rnd(0.4, 1), sz * rnd(0.5, 1), Math.random() < 0.5 ? '#bfe9ff' : '#e1f5fe', { chip: true, life: 6 });
        this.throwFrom(p, q.x, q.y, 9);
        p.vh += 2;
      }
    }
  }

  /** The colours a building is made of: its walls, its roof, timber, stone. */
  palette(b) {
    // (burnt: everything blackened, the timber charred)
    if (b.charred) return { wall: '#3e3530', roof: '#2a2220', wood: '#1f1a17', dark: '#151110', stone: '#4a4644', plaster: '#5a524c' };
    const wall = b.wall || '#d7ccc8', roof = b.roof || '#8d4f3a';
    return { wall, roof, wood: '#6d4c41', dark: '#4e342e', stone: '#9e9e9e', plaster: '#efebe9' };
  }

  add(o) {
    if (this.list.length >= MAX) {
      // (full: the oldest chips go first, then the oldest of anything)
      let i = this.list.findIndex((p) => p.chip);
      if (i < 0) i = 0;
      this.list.splice(i, 1);
    }
    this.list.push(o);
    return o;
  }

  /** A piece of b at its own (lx, ly up, lz) in the building's frame, size (sx, sy, sz). */
  piece(b, base, lx, ly, lz, sx, sy, sz, col, o = {}) {
    const p = bw(b, lx, lz);
    const a = bangle(b);
    return this.add({
      b, x: p.x, y: p.y, h: base + ly, sx, sy, sz, col,
      vx: 0, vy: 0, vh: 0, rx: 0, ry: -a + rnd(-0.05, 0.05), rz: 0, wx: 0, wy: 0, wz: 0,
      t: -(o.delay || 0), rest: false, chip: !!o.chip, life: o.life || 0, grow: o.grow || 0, sink: 0,
    });
  }

  /** Give piece p its throw: away from (x, y), `k` hard, upward a little, spinning. */
  throwFrom(p, x, y, k) {
    const w = this.world;
    const dx = w.dx(x, p.x), dy = p.y - y, d = Math.hypot(dx, dy) || 1;
    const push = k * rnd(0.4, 1.1) / (1 + d * 0.08);
    p.vx = (dx / d) * push + rnd(-1.2, 1.2);
    p.vy = (dy / d) * push + rnd(-1.2, 1.2);
    p.vh = rnd(0.5, 3) + push * 0.35;
    p.wx = rnd(-5, 5); p.wy = rnd(-3, 3); p.wz = rnd(-5, 5);
  }

  /** Building b brought down by a blow from (x, y). */
  fall(b, x, y, power, delay = 0) {
    const view = this.view;
    // (its holes come down with it)
    if (b._holes) { this.list = this.list.filter((p) => !(p.b === b && p.hole)); b._holes = null; }
    const base = view.ground(b.x, b.y);
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    const H = Math.max(3, view.builtHeight?.(b) || 2.6 + Math.max(1, (b.hgt || 2) - 1) * 2.6);
    const P = this.palette(b);
    const k = Math.min(16, 3 + Math.sqrt(power) * 0.18);
    const n = Math.round(Math.min(150, Math.max(36, fw * fd * H / 5)));
    const walls = Math.round(n * 0.45), roofs = Math.round(n * 0.22), beams = Math.round(n * 0.13), bits = n - walls - roofs - beams;
    const made = [];
    // wall panels, round the shell where the walls stood
    for (let i = 0; i < walls; i++) {
      const side = Math.floor(Math.random() * 4), u = Math.random();
      let lx, lz;
      if (side === 0) { lx = (u - 0.5) * fw; lz = 0; } else if (side === 1) { lx = (u - 0.5) * fw; lz = -fd; } else if (side === 2) { lx = -fw / 2; lz = -u * fd; } else { lx = fw / 2; lz = -u * fd; }
      const along = side < 2;
      const w0 = rnd(0.7, 1.6), h0 = rnd(0.6, 1.3), t0 = rnd(0.16, 0.28);
      made.push(this.piece(b, base, lx, rnd(0.3, H * 0.8), lz, along ? w0 : t0, h0, along ? t0 : w0, Math.random() < 0.82 ? P.wall : Math.random() < 0.5 ? P.wood : P.plaster, { delay: delay + rnd(0, 0.25) }));
    }
    // roof slabs, from the top
    for (let i = 0; i < roofs; i++) made.push(this.piece(b, base, rnd(-fw / 2, fw / 2), H * rnd(0.82, 1), -rnd(0, fd), rnd(0.9, 1.8), rnd(0.1, 0.18), rnd(0.7, 1.4), Math.random() < 0.85 ? P.roof : P.dark, { delay: delay + rnd(0.05, 0.35) }));
    // beams and posts
    for (let i = 0; i < beams; i++) made.push(this.piece(b, base, rnd(-fw / 2, fw / 2), rnd(0.5, H * 0.9), -rnd(0, fd), 0.16, 0.16, rnd(1.4, 3), P.wood, { delay: delay + rnd(0, 0.3) }));
    // broken masonry and splinters, all through it
    for (let i = 0; i < bits; i++) { const s = rnd(0.2, 0.5); made.push(this.piece(b, base, rnd(-fw / 2, fw / 2), rnd(0.2, H * 0.7), -rnd(0, fd), s, s * rnd(0.6, 1), s, Math.random() < 0.6 ? P.wall : P.stone, { delay: delay + rnd(0, 0.2) })); }
    for (const p of made) {
      this.throwFrom(p, x, y, k);
      // (the top falls in on itself as much as it's thrown: a building collapses, it doesn't explode)
      if (p.h - base > H * 0.5) { p.vx *= 0.6; p.vy *= 0.6; }
    }
    // the heap of rubble left on its plot, rising out of the dust as the rest comes down
    const heap = Math.round(Math.min(60, fw * fd * 0.5));
    for (let i = 0; i < heap; i++) {
      const u = rnd(-0.5, 0.5), v = rnd(0, 1), edge = 1 - Math.max(Math.abs(u) * 2, Math.abs(v - 0.5) * 2);
      const s = rnd(0.6, 1.5);
      const sy = s * rnd(0.3, 0.7);
      // (a low mound on the ground it stood on, never stacked up in the air: lift is its height above the ground)
      const lift = sy * 0.35 + Math.max(0, edge) * Math.min(1.1, H * 0.1) * rnd(0.4, 1);
      const p = this.piece(b, base, u * fw * 0.95, 0, -v * fd, s, sy, s * rnd(0.6, 1.1), Math.random() < 0.5 ? P.wall : Math.random() < 0.5 ? P.roof : P.wood, { delay: delay + 0.35 + rnd(0, 0.5), grow: 0.6 });
      p.h = view.ground(p.x, p.y) + lift; p.lift = lift;
      p.rest = true; p.rx = rnd(-0.35, 0.35); p.rz = rnd(-0.35, 0.35); p.ry += rnd(-1, 1);
    }
  }

  /** A few bits knocked off b where a blow landed near (x, y). */
  /**
   * A hole knocked in b's wall where a blow landed: a ragged dark breach
   * (the room behind it in shadow) ringed with splintered boards and broken
   * plaster sticking out. Another blow near it makes it bigger; a building
   * that comes down takes its holes with it. `k`: how big, 0..1+.
   */
  hole(b, base, lx, lz, hy, k, P) {
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    // (which wall: the one the point's nearest)
    const dF = Math.abs(lz), dB = Math.abs(lz + fd), dL = Math.abs(lx + fw / 2), dR = Math.abs(lx - fw / 2);
    const m = Math.min(dF, dB, dL, dR), side = m === dF ? 'F' : m === dB ? 'B' : m === dL ? 'L' : 'R';
    const along = side === 'F' || side === 'B';
    const out = side === 'F' ? 1 : side === 'B' ? -1 : side === 'R' ? 1 : -1;
    // (on the wall's face, and a little out from it, never round its corner)
    if (along) { lx = Math.max(-fw / 2 + 0.5, Math.min(fw / 2 - 0.5, lx)); lz = side === 'F' ? 0.03 : -fd - 0.03; }
    else { lz = Math.max(-fd + 0.5, Math.min(-0.5, lz)); lx = (fw / 2 + 0.03) * out; }
    b._holes ||= [];
    let H0 = b._holes.find((o) => Math.abs(o.lx - lx) + Math.abs(o.lz - lz) + Math.abs(o.hy - hy) < 1.1);
    if (H0) { H0.k = Math.min(2.2, H0.k + k * 0.6); const old = new Set(H0.parts); this.list = this.list.filter((p) => !old.has(p)); }
    else b._holes.push(H0 = { lx, lz, hy, k: Math.min(2, k) });
    const R = 0.35 + 0.7 * H0.k;
    const th = 0.08, dark = '#24170f', inner = '#4a3426';
    const sz = (w, h) => (along ? [w, h, th] : [th, h, w]);
    H0.parts = [];
    // the breach: overlapping slabs, a ragged outline not a square — the broken
    // edge of the wall's thickness lighter round it, the dark of the room in the middle
    for (let i = 0; i < 7; i++) {
      const core = i >= 3;
      const f = core ? 0.75 : 1;
      const w = R * rnd(0.9, 1.5) * f, h = R * rnd(0.8, 1.3) * f, ox = rnd(-0.3, 0.3) * R, oy = rnd(-0.3, 0.3) * R;
      const [sx, sy, sz2] = sz(w, h);
      const off = core ? out * 0.02 : 0;
      const p = this.piece(b, base, lx + (along ? ox : off), hy + oy, lz + (along ? off : ox), sx, sy, sz2, core ? dark : inner, { life: 0 });
      p.rest = true; p.hole = true; p.rx = 0; p.rz = rnd(-0.6, 0.6);
      H0.parts.push(p);
    }
    // broken laths and a snapped beam across it, inside
    for (let i = 0; i < 2 + Math.round(H0.k); i++) {
      const len = R * rnd(1.2, 2);
      const [sx, sy, sz2] = sz(len, 0.08);
      const p = this.piece(b, base, lx + (along ? rnd(-0.3, 0.3) * R : out * 0.04), hy + rnd(-0.5, 0.5) * R, lz + (along ? out * 0.04 : rnd(-0.3, 0.3) * R), sx, sy, sz2, P.wood, { life: 0 });
      p.rest = true; p.hole = true; p.rx = 0; p.rz = rnd(-0.9, 0.9);
      H0.parts.push(p);
    }
    // splintered boards and broken plaster round its edge, bent out toward the blow
    const n = 6 + Math.round(H0.k * 5);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), r = R * rnd(0.75, 1.0);
      const ex = Math.cos(t) * r, ey = Math.sin(t) * r * 0.85;
      const len = rnd(0.18, 0.4) * (0.7 + H0.k * 0.4), wd = rnd(0.06, 0.12);
      const [sx, sy, sz2] = sz(Math.random() < 0.5 ? len : wd, Math.random() < 0.5 ? wd : len);
      const p = this.piece(b, base, lx + (along ? ex : out * 0.05), hy + ey, lz + (along ? out * 0.05 : ex), sx, sy, sz2, Math.random() < 0.55 ? P.wall : P.wood, { life: 0 });
      p.rest = true; p.hole = true;
      p.rx = rnd(-0.6, 0.6); p.rz = rnd(-0.8, 0.8);
      H0.parts.push(p);
    }
  }

  chip(b, x, y, n, k = 0.4, hy = null) {
    const view = this.view, w = this.world;
    const base = view.ground(b.x, b.y);
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    const H = 2.6 + Math.max(1, (b.hgt || 2) - 1) * 2.6;
    const P = this.palette(b);
    // (the point of its walls nearest the blow, in its frame)
    const a = bangle(b), dx = w.dx(b.x, x), dy = y - b.y;
    // world → frame for the four turns (see bframe.bw)
    const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    let lx = dx * c - dy * s, lz = dx * s + dy * c;
    lx = Math.max(-fw / 2, Math.min(fw / 2, lx)); lz = Math.max(-fd, Math.min(0, lz));
    // where it struck: a fist's height, or — a bigger blow — anywhere up the lower wall
    const at = hy ?? Math.min(H * 0.7, k > 0.5 ? rnd(0.9, 2.4) : rnd(1.0, 1.6));
    this.hole(b, base, lx, lz, at, k, P);
    for (let i = 0; i < n; i++) {
      const sz = rnd(0.12, 0.35);
      const p = this.piece(b, base, lx + rnd(-0.4, 0.4), at + rnd(-0.4, 0.4), lz + rnd(-0.2, 0.2), sz, sz * rnd(0.5, 1), sz, Math.random() < 0.7 ? P.wall : P.wood, { chip: true, life: 25 });
      this.throwFrom(p, x, y, 5);
    }
  }

  /**
   * A building giving way by stages (game/destruction.js strike): at the first,
   * a corner of its roof breaks up and slides off, a wall caves in; at the
   * second, more of the roof goes, the walls open up on every side, and the
   * whole of it leans — one more good blow and it's down.
   */
  stage(b, st, x, y) {
    if (b.ruined) return;
    const view = this.view, w = this.world;
    const base = view.ground(b.x, b.y);
    const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
    const H = Math.max(3, view.builtHeight?.(b) || 2.6 + Math.max(1, (b.hgt || 2) - 1) * 2.6);
    const P = this.palette(b);
    // (which end of it: the one nearest the blow)
    const a = bangle(b), c = Math.round(Math.cos(a)), sn = Math.round(Math.sin(a));
    const dx = w.dx(b.x, x), dy = y - b.y;
    const near = Math.sign(dx * c - dy * sn) || 1;
    // roof slabs and rafters breaking off that end and sliding to the ground
    const nr = st === 1 ? 10 : 18;
    for (let i = 0; i < nr; i++) {
      const lx = near * rnd(0, fw / 2), lz = -rnd(0, fd);
      const roof = Math.random() < 0.7;
      const p = roof
        ? this.piece(b, base, lx, H * rnd(0.8, 1.02), lz, rnd(0.9, 1.9), rnd(0.1, 0.18), rnd(0.7, 1.4), Math.random() < 0.85 ? P.roof : P.dark, { delay: rnd(0, 0.4), life: 0 })
        : this.piece(b, base, lx, H * rnd(0.7, 0.95), lz, 0.16, 0.16, rnd(1.2, 2.6), P.wood, { delay: rnd(0, 0.4) });
      p.vx = rnd(-1, 1) + near * c * rnd(1, 3); p.vy = rnd(-1, 1) - near * sn * rnd(1, 3); p.vh = rnd(0.5, 2.5);
      p.wx = rnd(-3, 3); p.wy = rnd(-2, 2); p.wz = rnd(-3, 3);
    }
    // a breach in its roof on that side: the tiles gone, snapped rafters sticking up out of it
    for (let i = 0; i < (st === 1 ? 4 : 8); i++) {
      const lx = near * rnd(0.1, fw / 2 - 0.3), lz = -rnd(0.4, fd - 0.4);
      const p = this.piece(b, base, lx, H * rnd(0.86, 0.97), lz, rnd(0.8, 1.4), 0.12, rnd(0.7, 1.2), '#24170f', { life: 0 });
      p.rest = true; p.hole = true; p.rx = rnd(-0.5, 0.5); p.rz = rnd(-0.5, 0.5);
      (b._holes ||= []).push({ lx, lz, hy: H, k: 0, parts: [p] });
    }
    for (let i = 0; i < (st === 1 ? 4 : 8); i++) {
      const lx = near * rnd(0.2, fw / 2 - 0.2), lz = -rnd(0.3, fd - 0.3);
      const p = this.piece(b, base, lx, H * rnd(0.9, 1.05), lz, 0.14, rnd(1.2, 2.2), 0.14, P.wood, { life: 0 });
      p.rest = true; p.hole = true; p.rx = rnd(-0.8, 0.8); p.rz = rnd(-0.8, 0.8);
      (b._holes ||= []).push({ lx, lz, hy: H, k: 0, parts: [p] });
    }
    // walls caving in: big ragged breaches on several sides, high and low
    const holes = st === 1 ? 2 : 4;
    for (let i = 0; i < holes; i++) {
      const side = Math.floor(Math.random() * 4), u = rnd(0.2, 0.8);
      const lx = side === 2 ? -fw / 2 : side === 3 ? fw / 2 : (u - 0.5) * fw, lz = side === 0 ? 0 : side === 1 ? -fd : -u * fd;
      this.hole(b, base, lx, lz, rnd(1, Math.max(1.2, H * 0.75)), rnd(0.9, 1.6) + st * 0.2, P);
    }
    // masonry and plaster raining off it
    for (let i = 0; i < 14 * st; i++) {
      const s0 = rnd(0.25, 0.6);
      const p = this.piece(b, base, rnd(-fw / 2, fw / 2), rnd(1, H * 0.9), -rnd(0, fd), s0, s0 * rnd(0.5, 1), s0, Math.random() < 0.6 ? P.wall : P.plaster, { chip: true, life: 40, delay: rnd(0, 0.5) });
      this.throwFrom(p, b.x, b.y, 3);
    }
    // (the last stage: it leans away from the blows)
    const lean = st >= 2 ? 0.075 : 0.03;
    (this.leaning ||= new Map()).set(b, { x: rnd(-1, 1) * lean * 0.6, z: near * lean });
  }

  /**
   * One of the town's loose things smashed (game/destruction.js smash): a tree
   * snapped — its trunk in logs, its crown in green clumps — or a stall, lamp,
   * well or fountain broken into its timber and stone, thrown from the blow.
   * `lite`: one of a great many at once (an island levelled): fewer pieces.
   */
  smash(o, x, y, power, delay = 0, lite = false) {
    const view = this.view, w = this.world;
    const base = view.ground(o.x, o.y), s = o.s || 1;
    const k = Math.min(12, 3 + Math.sqrt(power) * 0.15);
    const add = (lx, ly, lz, sx, sy, sz, col, life = 0) => {
      const p = this.add({ b: o, x: w.wx(o.x + lx), y: o.y + lz, h: base + ly, sx, sy, sz, col, vx: 0, vy: 0, vh: 0, rx: 0, ry: rnd(0, 6.28), rz: 0, wx: 0, wy: 0, wz: 0, t: -delay, rest: false, chip: !!life, life, grow: 0, sink: 0 });
      this.throwFrom(p, x, y, k);
      return p;
    };
    const L = lite ? 0.45 : 1;
    if (o.kind === 'tree' || o.kind === 'bush' || o.kind === 'cactus') {
      const tree = o.kind === 'tree';
      const H = tree ? 4.5 * s : o.kind === 'cactus' ? 2.4 * s : 0.9 * s;
      const sub = o.sub || '';
      const leaf = /snow/.test(sub) ? ['#e3f2fd', '#4f7a5a'] : /sakura|blossom/.test(sub) ? ['#f8bbd0', '#f48fb1'] : /dead|spooky/.test(sub) ? ['#5d4037', '#4e342e'] : /pine/.test(sub) ? ['#2e6b3a', '#245a30'] : /palm|jungle/.test(sub) ? ['#4caf50', '#2e7d32'] : ['#5aa64a', '#3d8a3a'];
      const bark = /palm/.test(sub) ? '#a1887f' : o.kind === 'cactus' ? '#558b2f' : '#6d4c41';
      if (tree || o.kind === 'cactus') {
        // the trunk, in two or three logs (the lowest snapped off at the stump, the stump left standing)
        const st = this.add({ b: o, x: o.x, y: o.y, h: base + 0.25, sx: 0.4 * s, sy: 0.5, sz: 0.4 * s, col: bark, vx: 0, vy: 0, vh: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, t: 0, rest: true, chip: false, life: 0, grow: 0, sink: 0 });
        st.lift = 0.25;
        const nl = tree ? 3 : 2;
        for (let i = 0; i < nl; i++) { const p = add(0, 0.6 + (i + 0.5) * (H * 0.55) / nl, 0, 0.32 * s, (H * 0.55) / nl, 0.32 * s, bark); p.rx = rnd(-0.3, 0.3); }
      }
      // its crown, in clumps
      const nc = Math.round((tree ? 9 : 4) * L);
      for (let i = 0; i < nc; i++) { const c0 = rnd(0.5, 1.1) * s * (tree ? 1 : 0.6); add(rnd(-1, 1) * s, H * rnd(0.6, 1), rnd(-1, 1) * s, c0, c0 * rnd(0.6, 0.9), c0, Math.random() < 0.6 ? leaf[0] : leaf[1], 30); }
      return;
    }
    // everything else: its timber, its stone, its cloth (stall awnings, tents)
    const stone = /fountain|well|statue|totem|rock|crystal|cannon|mooring/.test(o.kind);
    const cloth = /stall|tent|flag/.test(o.kind);
    const big = /fountain|statue|windmill|waterwheel|tent|well/.test(o.kind);
    const R = (big ? 1.4 : 0.6) * s, Hh = (big ? 2.4 : 1.2) * s;
    const n = Math.round((big ? 22 : 8) * L);
    const cols = stone ? ['#b0aaa4', '#9e9890', '#8a847c', '#c8c2ba'] : ['#8d6e63', '#6d4c41', '#a1887f', '#5d4037'];
    for (let i = 0; i < n; i++) {
      const sz = rnd(0.15, big ? 0.6 : 0.35) * s;
      const slab = Math.random() < 0.4;
      const col = cloth && Math.random() < 0.35 ? (o.color || o.awning || (Math.random() < 0.5 ? '#c62828' : '#f5f5f5')) : cols[Math.floor(Math.random() * cols.length)];
      add(rnd(-R, R), rnd(0.1, Hh), rnd(-R, R), slab ? sz * 2.2 : sz, slab ? sz * 0.35 : sz * rnd(0.6, 1), slab ? sz * 1.4 : sz, col);
    }
    // (a fountain or well broken open spills its water)
    if (/fountain|well/.test(o.kind)) for (let i = 0; i < 6 * L; i++) add(rnd(-R, R) * 0.6, 0.3, rnd(-R, R) * 0.6, rnd(0.3, 0.6), 0.05, rnd(0.3, 0.6), '#64b5f6', 12);
  }

  /** b standing again: its rubble sinks away. */
  restore(b) {
    b._holes = null;
    this.leaning?.delete(b);
    const v = this.view.built?.get(b);
    if (v) { v.rotation.x = 0; v.rotation.z = 0; }
    for (const p of this.list) if (p.b === b) { p.sink = 1; p.rest = true; }
  }

  update(dt, world, O) {
    if (world !== this.world) { this.clear(); this.world = world; this.rev = world?.ruinRev ?? 0; this.seen = 0; }
    if (!world) return;
    // what's happened to the town since last frame
    const ev = world.ruinEvents;
    if (ev && world.ruinRev !== this.rev) {
      this.rev = world.ruinRev;
      for (const e of ev) {
        if (e.kind === 'fall') this.fall(e.b, e.x, e.y, e.power, e.delay || 0);
        else if (e.kind === 'chip') this.chip(e.b, e.x, e.y, e.n, e.k, e.hy);
        else if (e.kind === 'restore') this.restore(e.b);
        else if (e.kind === 'stage') this.stage(e.b, e.stage, e.x, e.y);
        else if (e.kind === 'smash') this.smash(e.b, e.x, e.y, e.power, e.delay || 0, e.lite);
        else if (e.kind === 'ice') this.iceShell(e.b, e.on, e.shatter);
        else if (e.kind === 'fixture') this.view.dropFixture?.(e.o);
        this.view.ruinProp?.(e);
      }
      ev.length = 0;
    }
    const view = this.view, L = this.list;
    let n = 0, moving = L.length !== this.drawn;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.sink > 0) { p.h -= dt * 0.8; p.sink -= dt * 0.4; if (p.sink <= 0) { L.splice(i, 1); continue; } }
      else if (p.chip && p.t > p.life) { p.sink = 1; }
      if (p.sink > 0 || (p.grow && p.t < p.grow + 0.1) || (p.t < 0.05 && p.t > -0.05)) moving = true;
      if (p.t >= 0 && !p.rest) {
        moving = true;
        p.vh -= G * dt;
        p.x = world.wx(p.x + p.vx * dt); p.y += p.vy * dt; p.h += p.vh * dt;
        p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        const g = view.ground(p.x, p.y) + Math.min(p.sx, p.sy, p.sz) * 0.5;
        if (p.h < g) {
          p.h = g;
          if (p.vh < -2.5) { p.vh *= -0.28; p.vx *= 0.55; p.vy *= 0.55; p.wx *= 0.5; p.wy *= 0.5; p.wz *= 0.5; }
          else {
            p.vh = 0; p.vx *= 0.7; p.vy *= 0.7;
            // (lying down on its flattest side as it comes to rest)
            p.rx *= 0.8; p.rz *= 0.8; p.wx = p.wy = p.wz = 0;
            if (Math.hypot(p.vx, p.vy) < 0.3) { p.rest = true; p.lift = p.h - view.ground(p.x, p.y); }
          }
        }
      }
    }
    // the ground under the rubble moves (a quake's tilt healing, a crater filling): what lies on it
    // goes with it, a slice of it each frame — never left hanging in the air or buried
    if (L.length) {
      const m = Math.min(L.length, 160);
      for (let k = 0; k < m; k++) {
        const p = L[(this.snapI = ((this.snapI || 0) + 1) % L.length)];
        if (!p || !p.rest || p.hole || p.sink > 0 || p.lift === undefined) continue;
        const h = view.ground(p.x, p.y) + p.lift;
        if (Math.abs(h - p.h) > 0.03) { p.h = h; moving = true; }
      }
    }
    // a building on its last legs leans (its model tipped a little off true)
    if (this.leaning?.size) for (const [b, Ln] of this.leaning) {
      if (b.ruined || !b.stage) { this.leaning.delete(b); const v = view.built?.get(b); if (v) { v.rotation.x = 0; v.rotation.z = 0; } continue; }
      const v = view.built?.get(b);
      if (v) { v.rotation.x = Ln.x; v.rotation.z = Ln.z; }
    }
    // (the ice round a frozen house, set where it stands)
    if (this.shells?.size) for (const [b, g] of this.shells) { g.position.set(world.dx(O.x, b.x), view.ground(b.x, b.y), b.y - O.y); g.rotation.y = bangle(b); }
    // draw them (relative to the props' origin, as everything in that group is) — only when
    // something's moved: a settled heap of rubble is left as it was drawn
    if (!moving && O.x === this.ox && O.y === this.oy) return;
    this.ox = O.x; this.oy = O.y; this.drawn = L.length;
    const M = this.mesh, cols = M.instanceColor.array;
    for (const p of L) {
      if (n >= MAX) break;
      if (p.t < 0 && p.grow) continue; // (the heap: not yet)
      const gk = p.grow ? Math.min(1, p.t / p.grow) : 1;
      _p.set(world.dx(O.x, p.x), p.h, p.y - O.y);
      _q.setFromEuler(_e.set(p.rx, p.ry, p.rz));
      _s.set(p.sx * gk, p.sy * gk, p.sz * gk);
      _m.compose(_p, _q, _s);
      M.setMatrixAt(n, _m);
      _c.set(p.col);
      cols[n * 3] = _c.r; cols[n * 3 + 1] = _c.g; cols[n * 3 + 2] = _c.b;
      n++;
    }
    M.count = n;
    M.instanceMatrix.needsUpdate = true;
    M.instanceColor.needsUpdate = true;
  }
}
