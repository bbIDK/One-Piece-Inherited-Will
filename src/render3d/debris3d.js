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

  clear() { this.list.length = 0; this.mesh.count = 0; }

  /** The colours a building is made of: its walls, its roof, timber, stone. */
  palette(b) {
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
  chip(b, x, y, n) {
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
    for (let i = 0; i < n; i++) {
      const sz = rnd(0.12, 0.35);
      const p = this.piece(b, base, lx + rnd(-0.4, 0.4), rnd(0.4, Math.min(H * 0.6, 3)), lz + rnd(-0.2, 0.2), sz, sz * rnd(0.5, 1), sz, Math.random() < 0.7 ? P.wall : P.wood, { chip: true, life: 25 });
      this.throwFrom(p, x, y, 5);
    }
  }

  /** b standing again: its rubble sinks away. */
  restore(b) {
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
        else if (e.kind === 'chip') this.chip(e.b, e.x, e.y, e.n);
        else if (e.kind === 'restore') this.restore(e.b);
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
