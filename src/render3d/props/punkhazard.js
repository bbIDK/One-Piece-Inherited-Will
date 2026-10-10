// Punk Hazard's set pieces (data/islands/newWorld.js), as the anime draws the
// island after the Admirals' ten-day duel — cut in two along one sharp line:
//  * the Burning Lands: red volcanoes, lava running down their flanks into
//    the sea, smoke pouring from their craters, fires burning everywhere on
//    the scorched ground (`phvolcano`, `phflames`);
//  * the Frozen Lands: jagged peaks of ice and snow (`phicepeaks`) round
//    Caesar Clown's research facility — grey-blue domes in tiers, tall
//    smokestacks, pipes between them, snow lying on top (`phlab`, its
//    footprint world/objects.js PHLAB).
import * as THREE from 'three';
import { Mesher } from './kit.js';
import { meshOf, animate, bindCtx, glowMat, vcMat } from './mats.js';
import { model } from './street.js';
import { registerPropBuilder } from '../registry.js';
import { PHLAB } from '../../world/objects.js';

const reg = (kind, fn) => registerPropBuilder(kind, (o, ctx) => { bindCtx(ctx); return fn(o, ctx); });
export const hashN = (i, s) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const col = (c) => new THREE.Color(c);

/**
 * A mound round the vertical axis: `surf(a, s)` → [x, y, z] for the angle
 * `a` round it and `s` (0..1) up its rings `ss`; `seg` facets round. (The
 * volcanoes, the ice peaks, Mt. Fuji, the rock under a castle.)
 */
export function moundGeo(surf, ss, seg) {
  const pos = [], idx = [];
  for (const s of ss) {
    for (let i = 0; i <= seg; i++) {
      const p = surf(((i % seg) / seg) * Math.PI * 2, s, i % seg);
      pos.push(p[0], p[1], p[2]);
    }
  }
  const N = seg + 1;
  for (let j = 0; j < ss.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * N + i, b = a + N;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A strip `w(s)` wide laid along `path(s)` → [x, y, z] (s 0..1, `n` steps), level across. */
export function stripGeo(path, w, n) {
  const pos = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n, p = path(s), q = path(Math.min(1, s + 1 / n)), r = path(Math.max(0, s - 1 / n));
    let tx = q[0] - r[0], tz = q[2] - r[2];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    const h = w(s);
    pos.push(p[0] - tz * h, p[1], p[2] + tx * h, p[0] + tz * h, p[1], p[2] - tx * h);
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Puffs of smoke rising from (0, y0, 0) of `at` — `n` of them, `rise` metres, drifting downwind (animated with `root`, the prop). */
export function smoke(root, { n = 10, y0 = 0, rise = 60, r0 = 4, r1 = 16, drift = 20, speed = 0.05, color = '#5b5654', spread = 2 } = {}, at = root) {
  const k = new Mesher();
  k.add(new THREE.IcosahedronGeometry(1, 1), { color });
  const geo = k.build();
  const mat = vcMat({ transparent: true, opacity: 0.78 });
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false; m.receiveShadow = false;
    puffs.push(m);
    at.add(m);
  }
  animate(root, (t) => {
    for (let i = 0; i < n; i++) {
      const ph = (t * speed + i / n) % 1, m = puffs[i];
      const r = (r0 + (r1 - r0) * Math.sqrt(ph)) * (ph > 0.82 ? (1 - ph) / 0.18 : 1);
      m.position.set(ph * drift + Math.sin(i * 2.3 + t * 0.3) * spread, y0 + ph * rise, Math.cos(i * 1.7) * spread * (0.5 + ph));
      m.scale.set(r, r * 0.8, r);
    }
  });
}

// ------------------------------------------------------------ the burning mountain
const ROCK_LO = col('#5a2519'), ROCK_MID = col('#963a20'), ROCK_HI = col('#c4552c'), RIM = col('#3a1a12'), ASHC = col('#55443c');

/** A volcano's surface (sunk `sink` metres at its foot). */
function volcanoSurf(R, H, rTop, seed, sink) {
  return (a, s) => {
    if (s > 1) {
      // (the crater: down inside the rim)
      const c = s - 1, r = rTop * (1 - c * 0.85), y = H - c * Math.min(10, H * 0.14);
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    }
    const jag = 1 + 0.07 * Math.sin(a * 5 + seed) + 0.05 * Math.sin(a * 11 + seed * 2 + s * 4) + 0.03 * Math.sin(a * 23 - s * 7 + seed) - 0.06 * Math.abs(Math.sin(a * 9 + seed * 0.5)) ** 8;
    const r = (rTop + (R - rTop) * (1 - Math.max(0, s))) * jag * (s < 0 ? 1 - s : 1);
    const y = s < 0 ? s * sink * 16 : H * s ** 1.45 * (1 + 0.04 * Math.sin(a * 3 + seed));
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
}

reg('phvolcano', (o, ctx) => {
  const R = o.r || 40, H = o.h || 80, rTop = R * (o.rTop || 0.2), seed = o.seed ?? (o.x * 0.013) % 6;
  const big = R > 25;
  // (the foot sunk to the lowest ground round it)
  const g0 = ctx.ground(o.x, o.y);
  let gmin = g0;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; gmin = Math.min(gmin, ctx.ground(o.x + Math.cos(a) * R, o.y + Math.sin(a) * R)); }
  const sink = g0 - gmin + 2;
  const surf = volcanoSurf(R, H, rTop, seed, sink);
  const root = new THREE.Group();
  root.name = 'phvolcano';
  const geo = model(`phvolcano:${Math.round(R)}:${Math.round(H)}:${Math.round(seed * 10)}:${Math.round(sink)}`, (k) => {
    const tmp = new THREE.Color();
    const ss = [-0.06, 0, 0.06, 0.13, 0.21, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.88, 0.95, 1, 1.15, 1.45, 1.8, 2];
    k.add(moundGeo(surf, ss, big ? 44 : 26), {
      color: (p, n) => {
        const h = Math.max(0, p.y / H);
        if (h > 0.97 || (h > 0.86 && n.y > 0.6)) return RIM;
        tmp.copy(ROCK_LO).lerp(ROCK_MID, Math.min(1, h * 1.6)).lerp(ROCK_HI, Math.max(0, (h - 0.45) * 1.4));
        // (ash streaked down the gullies, darker where the slope faces down)
        const st = Math.sin(Math.atan2(p.z, p.x) * 13 + seed * 3 + h * 2);
        if (st > 0.82) tmp.lerp(ASHC, 0.55);
        return tmp.multiplyScalar(0.9 + 0.2 * Math.max(0, n.y));
      },
      outline: big ? 0.5 : 0.25,
    });
    // boulders of black rock about its foot
    for (let i = 0; i < (big ? 14 : 6); i++) {
      const a = hashN(i, seed) * Math.PI * 2, d = R * (0.95 + hashN(i, seed + 1) * 0.25), r = (big ? 3 : 1.6) * (0.6 + hashN(i, seed + 2));
      k.add(new THREE.DodecahedronGeometry(r, 0), { at: [Math.cos(a) * d, -sink * 0.3, Math.sin(a) * d], rot: [hashN(i, 3), hashN(i, 4) * 3, 0], color: RIM, flat: true, outline: 0.08 });
    }
  });
  root.add(meshOf(geo));
  // lava: running from the rim down the flanks (bright day and night), a pool glowing in the crater
  const lava = new Mesher(), core = new Mesher();
  const flows = o.flows ?? (big ? 5 : 2);
  for (let f = 0; f < flows; f++) {
    const a0 = (f / flows) * Math.PI * 2 + hashN(f, seed) * 0.9;
    const path = (s) => {
      const t = 0.985 - s * 1.0, a = a0 + 0.13 * Math.sin(s * 8 + f) + 0.05 * Math.sin(s * 21);
      const p = surf(a, t), l = Math.hypot(p[0], p[2]) || 1;
      return [p[0] + (p[0] / l) * 0.5, p[1] + 0.35, p[2] + (p[2] / l) * 0.5];
    };
    const wk = R / 40;
    lava.add(stripGeo(path, (s) => (1.3 + s * 3.2 * (0.6 + hashN(f, 9))) * wk, 40), { color: '#ff5414' });
    core.add(stripGeo((s) => { const p = path(s); return [p[0], p[1] + 0.12, p[2]]; }, (s) => (0.45 + s * 1.2) * wk, 40), { color: '#ffd34a' });
  }
  const lm = new THREE.Mesh(lava.build(false), glowMat('#ff5a1a', { side: THREE.DoubleSide }));
  const cm = new THREE.Mesh(core.build(false), glowMat('#ffcf4a', { side: THREE.DoubleSide }));
  lm.castShadow = cm.castShadow = false;
  root.add(lm, cm);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(rTop * 0.42, 20), glowMat('#ff7a1e'));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = H - Math.min(10, H * 0.14) + 0.4;
  root.add(pool);
  // flames licking up out of the crater
  const fl = new THREE.Group();
  for (let i = 0; i < (big ? 7 : 3); i++) {
    const a = (i / 7) * Math.PI * 2, r = rTop * 0.3 * hashN(i, 2);
    const h = (big ? 12 : 5) * (0.6 + hashN(i, 5) * 0.8);
    const c = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h, 7), glowMat(i % 2 ? '#ff8a1e' : '#ffb43a'));
    c.position.set(Math.cos(a) * r, pool.position.y + h / 2, Math.sin(a) * r);
    fl.add(c);
  }
  root.add(fl);
  animate(root, (t) => { fl.children.forEach((c, i) => { c.scale.y = 0.75 + 0.35 * Math.abs(Math.sin(t * (3 + i) + i)); }); });
  // smoke pouring out of the crater, blown off to the east
  smoke(root, big ? { n: 14, y0: H - 2, rise: H * 1.3, r0: rTop * 0.5, r1: rTop * 1.6, drift: H * 0.8, speed: 0.035, color: '#4a4442', spread: rTop * 0.3 }
    : { n: 6, y0: H - 1, rise: H * 2.2, r0: rTop * 0.6, r1: rTop * 2.2, drift: H, speed: 0.05, color: '#6a625e', spread: rTop * 0.3 });
  root.userData.founded = true;
  return root;
});

// ------------------------------------------------------------ fires on the scorched ground
/** A patch of fire: tongues of flame, tall and short, flickering (`o.r` metres across). */
reg('phflames', (o) => {
  const R = o.r || 4, seed = (o.x * 0.31 + o.y * 0.17) % 50;
  const outer = new Mesher(), inner = new Mesher(), bed = new Mesher();
  const n = 5 + Math.floor(R);
  for (let i = 0; i < n; i++) {
    const a = hashN(i, seed) * Math.PI * 2, d = R * Math.sqrt(hashN(i, seed + 1)), h = (2.4 + hashN(i, seed + 2) * 4.6) * (1 - d / R * 0.45);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    outer.add(new THREE.ConeGeometry(h * 0.3, h, 6), { at: [x, h / 2 - 0.1, z], rot: [0, a, (hashN(i, 7) - 0.5) * 0.3] });
    inner.add(new THREE.ConeGeometry(h * 0.16, h * 0.62, 6), { at: [x, h * 0.31, z] });
    bed.add(new THREE.DodecahedronGeometry(0.5 + hashN(i, 9) * 0.6, 0), { at: [x, 0, z], color: '#2a1712', flat: true });
  }
  const root = new THREE.Group();
  root.name = 'phflames';
  const om = new THREE.Mesh(outer.build(false), glowMat('#ff6a1e', { opacity: 0.92 }));
  const im = new THREE.Mesh(inner.build(false), glowMat('#ffd04a'));
  om.castShadow = im.castShadow = false;
  root.add(meshOf(bed.build(false)), om, im);
  animate(root, (t) => {
    om.scale.set(1 + 0.08 * Math.sin(t * 7 + seed), 0.82 + 0.28 * Math.abs(Math.sin(t * 4.3 + seed)), 1 + 0.08 * Math.cos(t * 6 + seed));
    im.scale.y = 0.8 + 0.3 * Math.abs(Math.sin(t * 5.7 + seed * 2));
  });
  return root;
});

// ------------------------------------------------------------ the frozen peaks
const ICE = col('#9ccbe6'), ICE_HI = col('#d6ecf8'), SNOW = col('#f4f9fd');

/** Peaks of ice and snow, `o.peaks` [[x, z, radius, height]…] about its foot: jagged, faceted, white-capped. */
reg('phicepeaks', (o) => {
  const peaks = o.peaks || [[0, 0, 20, 50]];
  const seed = (o.x * 0.07) % 10;
  const key = `phicepeaks:${peaks.map((p) => p.map(Math.round).join(',')).join(';')}:${Math.round(seed)}`;
  const geo = model(key, (k) => {
    const tmp = new THREE.Color();
    peaks.forEach(([px, pz, R, H], q) => {
      const sd = seed + q * 3.1;
      const surf = (a, s, i) => {
        // (each course turned a little and its corners pushed in and out: shards, not a cone)
        const tw = s * 0.9 + sd;
        const aa = a + tw * 0.4;
        const jag = 1 + 0.32 * (hashN(i + Math.round(s * 10) * 7, sd) - 0.5);
        const r = (s < 0 ? R * 1.1 : R * (1 - s) ** 1.15) * jag;
        const y = s < 0 ? -4 : H * s * (s > 0.97 ? 1 : 1 + 0.06 * Math.sin(a * 3 + sd));
        return [px + Math.cos(aa) * r, y, pz + Math.sin(aa) * r];
      };
      k.add(moundGeo(surf, [-0.05, 0, 0.2, 0.4, 0.58, 0.74, 0.88, 1], 7), {
        color: (p, n) => (n.y > 0.5 ? SNOW : tmp.copy(ICE).lerp(ICE_HI, Math.max(0, n.x * 0.5 + n.z * 0.5 + 0.3)).lerp(SNOW, Math.max(0, (p.y / H - 0.75) * 2))),
        flat: true, outline: 0.3,
      });
      // shards of ice standing round its foot
      for (let i = 0; i < 6; i++) {
        const a = hashN(i, sd) * Math.PI * 2, d = R * (0.9 + hashN(i, sd + 1) * 0.4), h = R * (0.25 + hashN(i, sd + 2) * 0.35);
        k.add(new THREE.ConeGeometry(h * 0.22, h, 5), { at: [px + Math.cos(a) * d, h * 0.4, pz + Math.sin(a) * d], rot: [(hashN(i, 4) - 0.5) * 0.7, a, (hashN(i, 5) - 0.5) * 0.7], color: (p, n) => (n.y > 0.6 ? SNOW : ICE_HI), flat: true, outline: 0.08 });
      }
    });
  });
  const m = meshOf(geo);
  const root = new THREE.Group();
  root.name = 'phicepeaks';
  root.add(m);
  root.userData.founded = true;
  return root;
});

// ------------------------------------------------------------ Caesar's facility
const WALL = col('#9fb1c2'), WALL_DK = col('#6f8191'), DOME = col('#c3d1de'), RIB = col('#7f90a0'), BAND = col('#2d3b4a'), STACK = col('#8a97a3'), RED = col('#b8352a'), WHITE = col('#eef2f5');

reg('phlab', () => {
  const geo = model('phlab', (k) => {
    const snowCap = (base) => (p, n) => (n.y > 0.8 ? WHITE : base);
    for (const [x, z, r, h] of PHLAB.domes) {
      const seg = Math.max(16, Math.round(r * 2.4));
      k.add(new THREE.CylinderGeometry(r + 0.8, r + 1.2, 1.4, seg), { at: [x, 0.3, z], color: WALL_DK, outline: 0.1 });
      k.add(new THREE.CylinderGeometry(r, r, h, seg), { at: [x, h / 2 + 1, z], color: WALL, outline: 0.15 });
      // (a band of windows, lit at night)
      k.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 1.1, seg, 1, true), { at: [x, h * 0.62 + 1, z], color: BAND, glow: '#ffd27a' });
      // ribs up its wall
      const nr = Math.round(r * 0.9);
      for (let i = 0; i < nr; i++) {
        const a = (i / nr) * Math.PI * 2;
        k.add(new THREE.BoxGeometry(0.7, h, 0.5), { at: [x + Math.cos(a) * (r + 0.2), h / 2 + 1, z + Math.sin(a) * (r + 0.2)], rot: [0, -a, 0], color: RIB });
      }
      let top = h + 1, rr = r;
      // (the big ones in tiers)
      if (r >= 9) {
        const r2 = r * 0.72, h2 = h * 0.5;
        k.add(new THREE.CylinderGeometry(r2 + 0.6, r2 + 0.6, 0.8, seg), { at: [x, top + 0.4, z], color: WALL_DK, outline: 0.1 });
        k.add(new THREE.CylinderGeometry(r2, r2, h2, seg), { at: [x, top + h2 / 2, z], color: WALL, outline: 0.12 });
        k.add(new THREE.CylinderGeometry(r2 + 0.06, r2 + 0.06, 0.9, seg, 1, true), { at: [x, top + h2 * 0.55, z], color: BAND, glow: '#ffd27a' });
        top += h2; rr = r2;
      }
      k.add(new THREE.SphereGeometry(rr, seg, 8, 0, Math.PI * 2, 0, Math.PI / 2), { at: [x, top, z], scale: [1, 0.62, 1], color: snowCap(DOME), outline: 0.15 });
      // (a lantern-turret on the top)
      k.add(new THREE.CylinderGeometry(rr * 0.16, rr * 0.2, rr * 0.25, 10), { at: [x, top + rr * 0.62 + rr * 0.1, z], color: WALL_DK, outline: 0.06 });
    }
    // the smokestacks: tall, banded red and white near the top
    for (const [x, z, r, h] of PHLAB.stacks) {
      k.add(new THREE.CylinderGeometry(r * 0.85, r * 1.15, h, 14), { at: [x, h / 2, z], color: STACK, outline: 0.12 });
      for (let b = 0; b < 3; b++) k.add(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * 0.04, 14), { at: [x, h * (0.78 + b * 0.07), z], color: b % 2 ? WHITE : RED });
      k.add(new THREE.CylinderGeometry(r * 1.05, r * 0.9, 1.2, 14), { at: [x, h + 0.6, z], color: BAND, outline: 0.08 });
    }
    // pipes between the domes and up the stacks
    const [mx, mz] = PHLAB.domes[0];
    for (const [x, z] of [...PHLAB.domes.slice(1), ...PHLAB.stacks].map((d) => [d[0], d[1]])) {
      const dx = x - mx, dz = z - mz, L = Math.hypot(dx, dz);
      k.add(new THREE.CylinderGeometry(0.9, 0.9, L, 8), { at: [mx + dx / 2, 4.2, mz + dz / 2], rot: [Math.PI / 2, Math.atan2(dx, dz), 0], color: RIB, outline: 0.06 });
    }
  });
  const root = new THREE.Group();
  root.name = 'phlab';
  root.add(meshOf(geo));
  // (smoke from the two tallest stacks)
  for (const [x, z, r, h] of PHLAB.stacks.slice(0, 2)) {
    const g = new THREE.Group();
    g.position.set(x, h + 1, z);
    smoke(root, { n: 7, y0: 0, rise: 40, r0: r * 0.9, r1: r * 4, drift: 25, speed: 0.06, color: '#c9ccd0', spread: 1 }, g);
    root.add(g);
  }
  root.userData.founded = true;
  return root;
});
