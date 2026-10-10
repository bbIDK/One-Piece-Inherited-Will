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
      const p = this.piece(b, base, u * fw * 0.95, Math.max(0.1, edge * H * 0.28 * rnd(0.5, 1)), -v * fd, s, s * rnd(0.3, 0.7), s * rnd(0.6, 1.1), Math.random() < 0.5 ? P.wall : Math.random() < 0.5 ? P.roof : P.wood, { delay: delay + 0.35 + rnd(0, 0.5), grow: 0.6 });
      p.rest = true; p.rx = rnd(-0.5, 0.5); p.rz = rnd(-0.5, 0.5); p.ry += rnd(-1, 1);
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
    const R = 0.28 + 0.55 * H0.k;
    const th = 0.08, dark = '#1a120c';
    const sz = (w, h) => (along ? [w, h, th] : [th, h, w]);
    H0.parts = [];
    // the breach: a few overlapping dark slabs, a ragged outline not a square
    for (let i = 0; i < 4; i++) {
      const w = R * rnd(0.9, 1.5), h = R * rnd(0.8, 1.3), ox = rnd(-0.25, 0.25) * R, oy = rnd(-0.25, 0.25) * R;
      const [sx, sy, sz2] = sz(w, h);
      const p = this.piece(b, base, lx + (along ? ox : 0), hy + oy, lz + (along ? 0 : ox), sx, sy, sz2, dark, { life: 0 });
      p.rest = true; p.hole = true; p.rx = 0; p.rz = rnd(-0.4, 0.4);
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

  /** b standing again: its rubble sinks away. */
  restore(b) {
    b._holes = null;
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
            if (Math.hypot(p.vx, p.vy) < 0.3) p.rest = true;
          }
        }
      }
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
