// Life on the open sea that you see from the deck: a pod of dolphins that
// comes racing in to ride your bow wave when you're making good speed,
// leaping clear of the water one after another alongside the hull; and out
// in the distance a great whale surfacing — the long blue back rolling up
// through the swell, the blow of its spout, and the tail flukes lifting high
// as it dives again. All of it for the look of the sea: nothing to fight.
import * as THREE from 'three';
import { registerFrameHook } from './registry.js';
import { toon, addOutline } from './materials.js';
import { swellAt } from './swell.js';

const TAU = Math.PI * 2;
const SPH = new THREE.SphereGeometry(1, 16, 10);
const CONE = new THREE.ConeGeometry(1, 1, 8);

function part(geo, mat, s, p, parent, outline = 0.03, r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

/** A dolphin about 2.4 m long, nose along +x. */
function makeDolphin(mats) {
  const g = new THREE.Group();
  part(SPH, mats.dGrey, [1.1, 0.34, 0.32], [0, 0, 0], g, 0.03);
  part(SPH, mats.dBelly, [0.95, 0.22, 0.26], [0.05, -0.12, 0], g, 0);
  part(SPH, mats.dGrey, [0.32, 0.09, 0.09], [1.2, -0.06, 0], g, 0.02); // the beak
  part(SPH, mats.dDark, [0.05, 0.05, 0.04], [0.85, 0.06, 0.2], g, 0); part(SPH, mats.dDark, [0.05, 0.05, 0.04], [0.85, 0.06, -0.2], g, 0);
  part(CONE, mats.dGrey, [0.16, 0.38, 0.05], [-0.05, 0.42, 0], g, 0.02, [0, 0, 0.5]); // dorsal fin
  for (const s of [-1, 1]) part(SPH, mats.dGrey, [0.26, 0.05, 0.12], [0.35, -0.2, s * 0.3], g, 0.02, [s * 0.5, 0, -0.3]);
  // the tail flukes
  const tail = new THREE.Group();
  tail.position.set(-1.05, 0, 0);
  g.add(tail);
  part(SPH, mats.dGrey, [0.4, 0.14, 0.13], [-0.1, 0, 0], tail, 0.02);
  part(SPH, mats.dGrey, [0.16, 0.04, 0.42], [-0.45, 0, 0], tail, 0.02);
  g.userData.tail = tail;
  return g;
}

/** A great whale about 24 m long, nose along +x: blue back, pleated pale throat, long flippers, wide flukes. */
function makeWhale(mats) {
  const g = new THREE.Group();
  part(SPH, mats.wBlue, [12, 3.2, 3.4], [0, 0, 0], g, 0.15);
  part(SPH, mats.wBlue, [5, 2.6, 3.0], [7.5, -0.2, 0], g, 0.12); // the broad head
  part(SPH, mats.wBelly, [9, 1.6, 2.6], [3, -1.9, 0], g, 0);
  for (let i = 0; i < 6; i++) part(SPH, mats.wGroove, [8, 0.06, 0.06], [3.5, -2.3, -1.6 + i * 0.64], g, 0); // throat pleats
  for (const s of [-1, 1]) {
    part(SPH, mats.wDark, [0.28, 0.28, 0.2], [9.2, 0.3, s * 2.55], g, 0);
    part(SPH, mats.wBlue, [3.2, 0.25, 0.9], [4, -1.8, s * 3.1], g, 0.08, [s * 0.4, s * 0.5, -0.3]);
  }
  part(CONE, mats.wBlue, [0.8, 1.4, 0.3], [-5, 3.0, 0], g, 0.06, [0, 0, 0.6]); // the small dorsal fin
  const tail = new THREE.Group();
  tail.position.set(-11, 0, 0);
  g.add(tail);
  part(SPH, mats.wBlue, [5, 1.4, 1.5], [-2.5, 0, 0], tail, 0.1);
  for (const s of [-1, 1]) part(SPH, mats.wBlue, [2.0, 0.35, 3.6], [-6.5, 0, s * 2.8], tail, 0.08, [0, s * 0.45, 0]);
  g.userData.tail = tail;
  return g;
}

class SeaSurface {
  constructor(scene) {
    this.scene = scene;
    this.mats = {
      dGrey: toon('#7d93a8'), dBelly: toon('#e8eef2'), dDark: toon('#1a2228'),
      wBlue: toon('#3f5f86'), wBelly: toon('#d6dde3'), wGroove: toon('#9aa6b0'), wDark: toon('#141a20'),
    };
    this.pod = null; this.whale = null;
    this.podT = 25; this.whaleT = 40;
  }

  clearPod() { if (this.pod) { for (const d of this.pod.ds) d.g.removeFromParent(); this.pod = null; } }
  clearWhale() { if (this.whale) { this.whale.g.removeFromParent(); this.whale = null; } }

  update(ctx, env, dt) {
    const game = ctx.game, v = game.view3d, w = ctx.world, p = game.player;
    if (!w || !v || !p || w.zone !== 0) { this.clearPod(); this.clearWhale(); return; }
    const ox = v.ox, oy = v.oy, t = env.time;
    const s = p.mode === 'sail' && p.ship && !p.ship.sunk ? p.ship : p.deck?.ship || null;
    const open = (x, y) => w.isLiquid(x, y) && !w.isOverlay(x, y) && (w.sd ? w.sd(x, y) < -25 : true);
    const calm = (env.storm || 0) < 0.5;
    // ---- the dolphins: in to ride the bow wave of a ship making way
    this.podT -= dt;
    if (!this.pod && s && Math.abs(s.speed) > 2.5 && calm && this.podT <= 0 && open(s.x, s.y)) {
      this.podT = 50 + Math.random() * 60;
      if (Math.random() < 0.6) {
        const n = 3 + Math.floor(Math.random() * 3), ds = [];
        for (let i = 0; i < n; i++) {
          const g = makeDolphin(this.mats);
          g.scale.setScalar(0.9 + Math.random() * 0.25);
          this.scene.add(g);
          ds.push({ g, side: i % 2 ? 1 : -1, u: 0.25 + Math.random() * 0.3, v: 1.5 + Math.random() * 2.5, ph: Math.random() * TAU, per: 1.9 + Math.random() * 0.6 });
        }
        this.pod = { ds, ship: s, t: 0, life: 30 + Math.random() * 15 };
      }
    }
    if (this.pod) {
      const P = this.pod, sh = P.ship;
      P.t += dt;
      // (they stay while she's making way; when she slows, or after a while, they drop astern and are gone)
      const leaving = P.t > P.life || sh !== s || Math.abs(sh.speed) < 1.5;
      if (leaving) P.fall = (P.fall || 0) + dt * 8;
      if ((P.fall || 0) > 40) this.clearPod();
      else {
        const c = Math.cos(sh.heading), sn = Math.sin(sh.heading), L = sh.def.length || 12, B = sh.def.beam || 4;
        for (const d of P.ds) {
          const u = d.u * L - (P.fall || 0), vv = d.side * (B * 0.5 + d.v);
          const x = sh.x + c * u - sn * vv, y = sh.y + sn * u + c * vv;
          // the leap: under, then up out of the water in an arc and back in
          const ph = ((t + d.ph) % d.per) / d.per, leap = ph < 0.45 ? Math.sin((ph / 0.45) * Math.PI) : 0;
          const h = swellAt(x, y) + (leap ? leap * 1.6 - 0.2 : -0.7 - Math.sin(t * 2 + d.ph) * 0.1);
          d.g.position.set(w.dx(ox, x), h, y - oy);
          d.g.rotation.set(0, -sh.heading, leap ? Math.cos((ph / 0.45) * Math.PI) * 0.7 : 0);
          d.g.userData.tail.rotation.z = Math.sin(t * 10 + d.ph) * 0.35;
          // a splash as it goes in, and as it comes out
          if (leap && !d.up) { d.up = true; game.fx.burst(x, y, 6, { color: ['#ffffff', '#e1f5fe'], speed: 1.5, vz: 3, g: 10, life: 0.5, size: 0.12 }); }
          if (!leap && d.up) { d.up = false; game.fx.burst(x, y, 8, { color: ['#ffffff', '#e1f5fe'], speed: 2, vz: 3.5, g: 10, life: 0.6, size: 0.14 }); }
        }
      }
    }
    // ---- a whale, out in the distance
    this.whaleT -= dt;
    if (!this.whale && this.whaleT <= 0 && (s || p.inWater) && calm) {
      this.whaleT = 80 + Math.random() * 90;
      const a = Math.random() * TAU, R = 70 + Math.random() * 60;
      const x = w.wx(p.x + Math.cos(a) * R), y = p.y + Math.sin(a) * R;
      if (open(x, y) && Math.random() < 0.65) {
        const g = makeWhale(this.mats);
        g.scale.setScalar(0.75 + Math.random() * 0.4);
        this.scene.add(g);
        this.whale = { g, x, y, hd: Math.random() * TAU, t: 0, spouts: [2.5, 7.5] };
      }
    }
    if (this.whale) {
      const W = this.whale;
      W.t += dt;
      const T = W.t;
      // rise (0-2 s), roll along the surface blowing (to 13 s), dive with the flukes up (13-18 s)
      const up = Math.min(1, T / 2), dive = Math.max(0, Math.min(1, (T - 13) / 4));
      W.x = w.wx(W.x + Math.cos(W.hd) * 2.2 * dt); W.y += Math.sin(W.hd) * 2.2 * dt;
      const sc = W.g.scale.x;
      const y0 = swellAt(W.x, W.y) - 3.6 * sc + up * 2.2 * sc + Math.sin(T * 0.6) * 0.3 - dive * dive * 10 * sc;
      W.g.position.set(w.dx(ox, W.x), y0, W.y - oy);
      W.g.rotation.set(0, -W.hd, -dive * 0.55 + Math.sin(T * 0.6) * 0.03);
      W.g.userData.tail.rotation.z = dive > 0 ? -dive * 1.4 : Math.sin(T * 0.8) * 0.12;
      for (let i = W.spouts.length - 1; i >= 0; i--) {
        if (T < W.spouts[i]) continue;
        W.spouts.splice(i, 1);
        // the blow: a tall white plume from the blowhole, drifting down
        const hx = W.x + Math.cos(W.hd) * 7 * sc, hy = W.y + Math.sin(W.hd) * 7 * sc;
        game.fx.burst(hx, hy, 70, { color: ['#ffffff', '#ffffff', '#e1f5fe'], speed: 1.6, vz: 14, g: 7, life: 2.2, size: 0.8, kind: 'smoke', grow: 1.6, z: 1 });
        if (w.distance(p.x, p.y, W.x, W.y) < 110) game.audio?.sfx('splash_big', { x: hx, y: hy });
      }
      if (T > 18 || w.distance(p.x, p.y, W.x, W.y) > 220) this.clearWhale();
    }
  }
}

let surf = null;
registerFrameHook((env, ctx, dt) => {
  if (!surf) { surf = new SeaSurface(ctx.scene); if (ctx.game?.view3d) ctx.game.view3d.seaSurface = surf; }
  surf.update(ctx, env, Math.min(0.1, dt || 1 / 60));
}, 'seasurface');
