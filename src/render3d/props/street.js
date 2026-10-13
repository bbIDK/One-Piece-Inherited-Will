// Common small props, instanced per 32 m cell like the vegetation: barrels,
// crates, haystacks, benches, fences, mooring bollards, graves, bones, anchors,
// cannons, mushrooms, crystals, pillars, ruins, tents, totems, training
// dummies, market stalls, wells, beached boats, street lamps, paper lanterns,
// signposts and skulls. Lamps, lanterns and crystals glow at night through
// the shared material's glow channel (so they stay instanced).
import * as THREE from 'three';
import { Mesher, box, cbox, cyl, cone, lathe, torus, extrude, slab, ribbon, C, shade, hash, rng, KIT } from './kit.js';
import { instanced, local } from './instancer.js';
import { registerPropBuilder } from '../registry.js';

const GEO = new Map();
/** A cached merged model: fn(k) fills a Mesher. */
export function model(key, fn) {
  let g = GEO.get(key);
  if (!g) {
    const k = new Mesher(); fn(k); g = k.build();
    // the far variant (no outlines) for distant cells
    KIT.noOutline = true;
    try { const f = new Mesher(); fn(f); g.userData.far = f.build(); } finally { KIT.noOutline = false; }
    GEO.set(key, g);
  }
  return g;
}

/** One instanced part with the object's own yaw and scale. */
export function simple(o, ctx, key, geo, opts = {}) {
  const part = { key, geo, tinted: !!opts.color, color: opts.color ? C(opts.color).clone() : null, castShadow: opts.castShadow !== false, local: opts.local };
  const yaw = opts.yaw ?? (opts.randomYaw ? hash(o.x, o.y) * Math.PI * 2 : 0);
  return instanced(o, ctx, [part, ...(opts.more || [])], { yaw, scale: opts.scale ?? (o.s || 1), y: opts.y });
}

/**
 * The ground under the lowest of a prop's feet (points [x, z] in its own
 * frame, turned and scaled as its model is): stood at that height, none of
 * its legs hangs in the air on a slope (the others run on into the ground).
 */
export function footY(o, ctx, feet, yaw = 0, s = o.s || 1) {
  if (!ctx?.ground) return undefined;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  let lo = ctx.ground(o.x, o.y);
  for (const [lx, lz] of feet) lo = Math.min(lo, ctx.ground(o.x + (lx * c + lz * sn) * s, o.y + (-lx * sn + lz * c) * s));
  return lo;
}
/** The corners (and middle) of a square post's foot, `h` its half-width, at (x, z). */
export const postFeet = (x, z, h) => [[x, z], [x - h, z - h], [x + h, z - h], [x - h, z + h], [x + h, z + h]];

const jitterYaw = (o, amt = 0.25) => (hash(o.x, o.y, 5) - 0.5) * amt;

// ------------------------------------------------------------------ models
const WOOD = '#8d6e4a', DARK_WOOD = '#5d4037', IRON = '#2d3436';

const barrel = () => model('barrel', (k) => {
  // a cask: 16 staves bellied out to the middle (each its own shade of oak),
  // their ends standing proud of the lid as the chime, two pairs of riveted
  // iron hoops, a planked lid with its bung
  const P = [[0.255, 0], [0.29, 0.09], [0.318, 0.22], [0.33, 0.4], [0.318, 0.58], [0.29, 0.71], [0.255, 0.8]];
  const OAK = ['#8d5b33', '#9d6a3e', '#94613a', '#a2703f', '#885733', '#99673c'];
  k.add(lathe(P, 16), { split: true, color: (p, n, i) => OAK[(Math.floor(i / (P.length - 1) / 6) * 7) % OAK.length], tint: 1, outline: 0.02 });
  // (the chime: the staves' ends a lip above and below the heads)
  for (const [y, r] of [[0.8, 0.255], [0, 0.255]]) k.add(cyl(r, r, 0.03, 16, true), { at: [0, y - 0.015, 0], color: '#6d4526', tint: 1 });
  // hoops: a pair near each end, rivets round them
  for (const [y, r] of [[0.075, 0.287], [0.135, 0.302], [0.665, 0.302], [0.725, 0.287]]) {
    k.add(cyl(r + 0.008, r + 0.008, 0.035, 16, true), { at: [0, y, 0], color: '#3d3d42' });
    for (let a = 0; a < 6; a++) {
      const t = (a / 6) * Math.PI * 2 + y * 9;
      k.add(box(0.016, 0.016, 0.016), { at: [Math.cos(t) * (r + 0.012), y + 0.009, Math.sin(t) * (r + 0.012)], color: '#5b5b63' });
    }
  }
  // the head, sunk a little inside the chime: three planks and the bung
  for (const [x, w] of [[-0.15, 0.13], [0, 0.17], [0.15, 0.13]]) {
    const d = Math.sqrt(Math.max(0, 0.245 ** 2 - x * x)) * 2 - 0.02;
    k.add(box(w - 0.006, 0.02, d), { at: [x, 0.775, 0], color: x ? '#7a4d2b' : '#6d4526', tint: 1 });
  }
  k.add(cyl(0.03, 0.03, 0.03, 8), { at: [0.07, 0.785, 0.05], color: '#4a2e18' });
});

const crate = () => model('crate', (k) => {
  // a slatted shipping crate: three planks a side between a corner frame, a
  // diagonal brace on each face, nail heads, planked lid
  const s = 0.74, h = 0.74, e = 0.075, dark = '#6e4f2a', PL = ['#b8894f', '#a97c46', '#c2945a'];
  k.add(box(s - 0.06, h - 0.06, s - 0.06), { at: [0, 0.03, 0], color: '#5a3f22' });
  const ph = (h - 2 * e) / 3;
  for (const [fx, fz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    k.save(); k.translate(fx * (s / 2 - 0.02), 0, fz * (s / 2 - 0.02)); k.rotateY(ry);
    for (let i = 0; i < 3; i++) k.add(box(s - 2 * e, ph - 0.012, 0.03), { at: [0, e + i * ph + 0.006, 0], color: PL[(i + (fx ? 1 : 0)) % 3], tint: 1, outline: 0.012 });
    k.restore();
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.add(box(e, h, e), { at: [x * (s / 2 - e / 2), 0, z * (s / 2 - e / 2)], color: dark, outline: 0.012 });
  for (const y of [0, h - e]) {
    for (const z of [-1, 1]) k.add(box(s - 2 * e, e, e), { at: [0, y, z * (s / 2 - e / 2)], color: dark });
    for (const x of [-1, 1]) k.add(box(e, e, s - 2 * e), { at: [x * (s / 2 - e / 2), y, 0], color: dark });
  }
  const iw = s - 2 * e, ih = h - 2 * e, diag = Math.hypot(iw, ih), ang = Math.atan2(iw, ih);
  for (const [fx, fz, ry] of [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]]) {
    k.save(); k.translate(fx * (s / 2 + 0.005), h / 2, fz * (s / 2 + 0.005)); k.rotateY(ry);
    k.save(); k.rotateZ(ang); k.add(cbox(0.07, diag, 0.03), { color: dark, outline: 0.01 }); k.restore();
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(cbox(0.018, 0.018, 0.012), { at: [x * (s / 2 - e / 2), y * (h / 2 - e / 2), 0.04], color: '#3a3a3e' });
    k.restore();
  }
  for (let i = 0; i < 4; i++) k.add(box(iw / 4 - 0.01, 0.025, iw), { at: [-iw / 2 + (i + 0.5) * iw / 4, h - 0.05, 0], color: PL[i % 3], tint: 1 });
});

const haystack = () => model('haystack', (k) => {
  // a shaggy rick of hay: three overlapping thatch skirts with ragged hems,
  // a twisted rope band, a topknot, loose wisps round the foot
  const R = rng(3), HAY = ['#d8b13a', '#c99f22', '#e2c055', '#bf9420'];
  const skirt = (rT, rB, y, hh, seed) => {
    const g = cyl(rT, rB, hh, 22, true, 2), p = g.attributes.position, r2 = rng(seed);
    for (let i = 0; i < p.count; i++) {
      const y0 = p.getY(i);
      if (y0 < 0.001) { const f = 1 + (i % 2 ? 0.07 : -0.02) + (r2() - 0.5) * 0.05; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); p.setY(i, (i % 2 ? -0.07 : 0) - r2() * 0.04); }
    }
    g.computeVertexNormals();
    k.add(g, { at: [0, y, 0], split: true, color: (pp, n, i) => HAY[Math.floor(i / 3) % 4], double: true, backShade: 0.55, outline: 0.025 });
  };
  k.add(lathe([[0.62, 0], [0.64, 0.25], [0.54, 0.5], [0.36, 0.76], [0.13, 0.98], [0.02, 1.02]], 14), { color: '#8f6f18' });
  skirt(0.56, 0.76, 0.06, 0.4, 1); skirt(0.4, 0.68, 0.4, 0.36, 2); skirt(0.14, 0.5, 0.7, 0.32, 3);
  k.add(torus(0.5, 0.03, 4, 18), { at: [0, 0.5, 0], rot: [Math.PI / 2, 0, 0], color: '#8a6a3c' });
  k.add(cone(0.12, 0.28, 6), { at: [0, 0.98, 0], color: '#e2c055', outline: 0.015 });
  k.add(torus(0.09, 0.02, 4, 8), { at: [0, 1.04, 0], rot: [Math.PI / 2, 0, 0], color: '#8a6a3c' });
  for (let i = 0; i < 14; i++) {
    const a = R() * Math.PI * 2, rr = 0.66 + R() * 0.12;
    k.add(cbox(0.012, 0.3 + R() * 0.15, 0.02), { at: [Math.cos(a) * rr, 0.08, Math.sin(a) * rr], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2], color: HAY[i % 4] });
  }
});

const bench = () => model('bench', (k) => {
  k.add(box(1.5, 0.07, 0.2), { at: [0, 0.45, 0.1], color: WOOD, outline: 0.012 });
  k.add(box(1.5, 0.07, 0.2), { at: [0, 0.45, -0.12], color: shade(WOOD, -0.06), outline: 0.012 });
  for (const y of [0.62, 0.8]) k.add(box(1.5, 0.12, 0.05), { at: [0, y, -0.25], rot: [-0.12, 0, 0], color: WOOD, outline: 0.012 });
  for (const x of [-0.62, 0.62]) {
    for (const z of [0.15, -0.18]) k.add(box(0.07, 0.45, 0.07), { at: [x, 0, z], color: DARK_WOOD });
    k.add(box(0.07, 0.55, 0.06), { at: [x, 0.45, -0.25], rot: [-0.12, 0, 0], color: DARK_WOOD });
  }
});

const fence = () => model('fence', (k) => {
  for (const x of [-0.45, -0.15, 0.15, 0.45]) {
    k.add(box(0.08, 0.72, 0.06), { at: [x, 0, 0], color: WOOD, outline: 0.012 });
    k.add(cone(0.058, 0.12, 4), { at: [x, 0.72, 0], rot: [0, Math.PI / 4, 0], color: WOOD });
  }
  for (const y of [0.24, 0.5]) k.add(box(1.04, 0.07, 0.04), { at: [0, y, 0.05], color: shade(WOOD, -0.12) });
});

const mooring = () => model('mooring', (k) => {
  k.add(cyl(0.13, 0.15, 0.62, 8), { color: DARK_WOOD, outline: 0.015 });
  k.add(cyl(0.18, 0.16, 0.08, 8), { at: [0, 0.62, 0], color: '#4e342e' });
  k.add(torus(0.17, 0.04, 5, 12), { at: [0, 0.3, 0], rot: [Math.PI / 2, 0, 0], color: '#c8b89a' });
  k.add(torus(0.165, 0.035, 5, 12), { at: [0, 0.39, 0], rot: [Math.PI / 2 + 0.15, 0, 0], color: '#d6c7a8' });
});

const grave = () => model('grave', (k) => {
  const s = new THREE.Shape();
  s.moveTo(-0.32, 0); s.lineTo(0.32, 0); s.lineTo(0.32, 0.72); s.absarc(0, 0.72, 0.32, 0, Math.PI, false); s.closePath();
  k.add(extrude(s, 0.16, 0.015, 8), { at: [0, -0.1, -0.1], color: '#a3adb0', tint: 1, outline: 0.02 });
  k.add(box(0.06, 0.42, 0.02), { at: [0, 0.48, -0.005], color: '#6f7a7d' });
  k.add(box(0.26, 0.06, 0.02), { at: [0, 0.72, -0.005], color: '#6f7a7d' });
  k.add(new THREE.SphereGeometry(0.45, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), { at: [0, -0.05, 0.42], scale: [0.8, 0.28, 1.05], color: '#6d5a45' });
  for (let i = 0; i < 3; i++) k.add(new THREE.IcosahedronGeometry(0.06, 0), { at: [-0.12 + i * 0.12, 0.1, 0.2], color: ['#e84a7f', '#ffffff', '#ffd54f'][i] });
});

const bones = () => model('bones', (k) => {
  const W = '#ecf0f1';
  k.save(); k.translate(-0.1, 0.07, 0); k.rotateY(0.6); k.rotateZ(Math.PI / 2);
  k.add(cyl(0.045, 0.05, 0.9, 6), { at: [0, -0.45, 0], color: W, outline: 0.012 });
  for (const y of [-0.45, 0.45]) for (const z of [-0.05, 0.05]) k.add(new THREE.SphereGeometry(0.075, 6, 4), { at: [0, y, z], color: W });
  k.restore();
  k.add(new THREE.SphereGeometry(0.2, 9, 7), { at: [0.35, 0.17, 0.28], scale: [1, 0.9, 1.1], color: W, outline: 0.015 });
  for (const z of [-0.08, 0.08]) k.add(new THREE.SphereGeometry(0.055, 5, 4), { at: [0.52, 0.2, 0.28 + z], scale: [0.5, 1, 1], color: '#2d3436' });
  k.add(box(0.12, 0.08, 0.18), { at: [0.48, 0.02, 0.28], color: W });
  for (let i = 0; i < 3; i++) k.add(torus(0.22, 0.025, 4, 8, Math.PI * 0.8), { at: [-0.45, 0.02, -0.25 + i * 0.12], rot: [0, 0, 0.3], color: W });
});

const anchor = () => model('anchor', (k) => {
  const iron = '#5d6d7e';
  k.save(); k.rotateZ(0.2); k.rotateX(0.1);
  k.add(cyl(0.1, 0.1, 2.3, 8), { at: [0, -0.35, 0], color: iron, outline: 0.02 });
  k.add(cyl(0.07, 0.07, 1.3, 6), { at: [0, 1.62, -0.65], rot: [Math.PI / 2, 0, 0], color: iron, outline: 0.015 });
  k.add(torus(0.2, 0.055, 6, 12), { at: [0, 2.12, 0], color: iron, outline: 0.015 });
  const arc = Math.PI * 0.8;
  k.add(torus(0.7, 0.1, 6, 14, arc), { at: [0, 0.35, 0], rot: [0, 0, Math.PI + (Math.PI - arc) / 2], color: iron, outline: 0.02 });
  for (const s of [-1, 1]) {
    const a = Math.PI + (Math.PI - arc) / 2 + (s > 0 ? arc : 0);
    k.add(cone(0.2, 0.42, 4), { at: [Math.cos(a) * 0.7, 0.35 + Math.sin(a) * 0.7, 0], rot: [0, 0, s * -0.6], scale: [1, 1, 0.4], color: iron, outline: 0.015 });
  }
  k.restore();
});

const cannon = () => model('cannon', (k) => {
  k.add(box(0.6, 0.3, 1.0), { at: [0, 0.14, -0.05], color: DARK_WOOD, outline: 0.015 });
  for (const s of [-1, 1]) k.add(box(0.08, 0.28, 0.8), { at: [s * 0.26, 0.44, -0.05], color: '#4e342e' });
  for (const x of [-0.36, 0.36]) for (const z of [-0.38, 0.3]) k.add(cyl(0.2, 0.2, 0.08, 10), { at: [x, 0.2, z], rot: [0, 0, Math.PI / 2], color: '#3e2723', outline: 0.012 });
  k.save(); k.translate(0, 0.55, -0.4); k.rotateX(Math.PI / 2 - 0.22);
  k.add(lathe([[0.16, 0], [0.17, 0.12], [0.15, 0.3], [0.12, 0.95], [0.14, 1.0], [0.14, 1.08], [0.1, 1.1]], 10), { color: IRON, outline: 0.018 });
  k.add(new THREE.SphereGeometry(0.1, 6, 4), { at: [0, -0.04, 0], color: IRON });
  k.restore();
  k.add(cyl(0.05, 0.05, 0.62, 5), { at: [0.31, 0.55, -0.1], rot: [0, 0, Math.PI / 2], color: IRON });
});

const mushroom = () => model('mushroom', (k) => {
  k.add(lathe([[0.16, 0], [0.13, 0.3], [0.12, 0.7], [0.15, 0.9]], 10), { color: '#efebe9', outline: 0.015 });
  k.add(new THREE.SphereGeometry(0.66, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), { at: [0, 0.86, 0], scale: [1, 0.62, 1], color: '#e53935', tint: 1, outline: 0.03 });
  k.add(new THREE.CircleGeometry(0.64, 14), { at: [0, 0.86, 0], rot: [Math.PI / 2, 0, 0], color: '#f5e6d3' });
  const R = rng(2);
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2, th = 0.35 + R() * 0.8;
    k.add(new THREE.SphereGeometry(0.08 + R() * 0.04, 6, 4), { at: [Math.sin(th) * Math.cos(a) * 0.63, 0.86 + Math.cos(th) * 0.41, Math.sin(th) * Math.sin(a) * 0.63], scale: [1, 0.45, 1], color: '#ffffff' });
  }
});

const crystal = () => model('crystal', (k) => {
  const R = rng(8);
  const pts = [[0, 0, 0, 1.8, 0.28], [0.45, 0, 0.15, 1.1, 0.2, 0.35], [-0.35, 0, 0.25, 1.3, 0.22, -0.3], [0.1, 0, -0.4, 0.9, 0.18, 0.25], [-0.2, 0, -0.25, 0.7, 0.15, -0.4]];
  for (const [x, y, z, h, r, tilt = 0] of pts) {
    k.save(); k.translate(x, y - 0.15, z); k.rotateY(R() * 3); k.rotateZ(tilt); k.rotateX(tilt * 0.5);
    k.add(cyl(r, r * 1.05, h, 6), { flat: true, color: '#80deea', glow: '#4dd0e1', outline: 0.02, outlineColor: '#00363a' });
    k.add(cone(r, h * 0.38, 6), { at: [0, h, 0], flat: true, color: '#b2ebf2', glow: '#80deea', outline: 0.02, outlineColor: '#00363a' });
    k.restore();
  }
});

const pillar = (broken) => model('pillar:' + broken, (k) => {
  const stone = '#bdc3c7';
  k.add(box(0.95, 0.25, 0.95), { color: '#95a5a6', outline: 0.02 });
  k.add(box(0.8, 0.14, 0.8), { at: [0, 0.25, 0], color: '#a8b3b5' });
  const H = broken ? 1.3 : 2.5;
  k.add(cyl(0.3, 0.33, H, 12), { at: [0, 0.38, 0], split: true, color: (p, n, i) => (i < 72 ? (Math.floor(i / 6) % 2 ? stone : '#d4d9db') : stone), tint: 1, outline: 0.02 });
  if (broken) {
    const R = rng(4);
    for (let i = 0; i < 4; i++) k.add(new THREE.IcosahedronGeometry(0.16, 0), { at: [(R() - 0.5) * 0.3, 0.38 + H, (R() - 0.5) * 0.3], flat: true, color: stone, tint: 1 });
    k.save(); k.translate(0.9, 0.3, 0.2); k.rotateZ(Math.PI / 2 - 0.1); k.rotateY(0.4);
    k.add(cyl(0.3, 0.3, 0.9, 12), { at: [0, -0.45, 0], color: stone, tint: 1, outline: 0.02 });
    k.restore();
  } else {
    k.add(lathe([[0.3, 0], [0.42, 0.14], [0.46, 0.18]], 12), { at: [0, 0.38 + H, 0], color: stone, tint: 1 });
    k.add(box(1.0, 0.2, 1.0), { at: [0, 0.56 + H, 0], color: '#95a5a6', outline: 0.02 });
  }
});

const ruins = (v) => model('ruins:' + v, (k) => {
  const R = rng(11 + v * 3);
  const stone = '#a1887f', dark = '#8d6e63';
  const segs = 3 + (v % 2);
  for (let i = 0; i < segs; i++) {
    const h = 0.5 + R() * 1.4;
    k.add(box(0.6, h, 0.5), { at: [-0.9 + i * 0.6, -0.2, 0], color: i % 2 ? stone : shade(stone, -0.06), tint: 1, outline: 0.025 });
    k.add(box(0.45, 0.12, 0.5), { at: [-0.9 + i * 0.6 + (R() - 0.5) * 0.1, h - 0.2, 0], rot: [0, 0, (R() - 0.5) * 0.5], color: dark, tint: 1 });
  }
  // an arch opening in the middle piece and fallen blocks
  for (let i = 0; i < 5; i++) {
    k.add(new THREE.IcosahedronGeometry(0.18 + R() * 0.2, 0), { at: [(R() - 0.5) * 2.6, 0.05, 0.4 + R() * 0.8], rot: [R() * 3, R() * 3, 0], flat: true, color: stone, tint: 1, outline: 0.015 });
  }
  if (v % 3 === 0) {
    k.save(); k.translate(0.2, 0.28, 0.9); k.rotateZ(Math.PI / 2); k.rotateX(0.5);
    k.add(cyl(0.26, 0.26, 1.6, 10), { at: [0, -0.8, 0], color: '#bcaaa4', tint: 1, outline: 0.02 });
    k.restore();
  }
});

const tent = () => model('tent', (k) => {
  const hw = 1.15, h = 1.6, d = 2.1;
  const ang = Math.atan2(h, hw), sl = Math.hypot(hw, h);
  for (const s of [-1, 1]) {
    // a sloped canvas panel from the ridge down to the ground
    k.save(); k.translate(s * hw / 2, h / 2, 0); k.rotateZ(s * (Math.PI / 2 - ang));
    k.add(cbox(0.05, sl + 0.08, d), { color: '#ffffff', tint: 1, outline: 0.025 });
    k.restore();
  }
  // back wall and the doorway
  k.add(slab([[-hw, 0], [hw, 0], [0, h]], 0.04), { at: [0, 0, -d / 2 + 0.02], color: '#f0f0f0', tint: 1 });
  k.add(slab([[-hw * 0.45, 0], [hw * 0.45, 0], [0, h * 0.62]], 0.02), { at: [0, 0, d / 2 - 0.02], color: '#2b1d14' });
  for (const s of [-1, 1]) k.add(slab([[s * hw, 0], [s * hw * 0.45, 0], [0, h * 0.62], [0, h]], 0.03), { at: [0, 0, d / 2 - 0.01], color: '#e8e8e8', tint: 1 });
  for (const z of [-d / 2, d / 2]) k.add(cyl(0.035, 0.035, h + 0.25, 5), { at: [0, 0, z], color: DARK_WOOD });
  for (const s of [-1, 1]) for (const z of [-d / 2 - 0.3, d / 2 + 0.3]) k.add(cyl(0.02, 0.03, 0.25, 4), { at: [s * (hw + 0.25), 0, z], color: DARK_WOOD });
});

const totem = () => model('totem', (k) => {
  k.add(box(0.5, 3.0, 0.5), { color: '#8d6e63', outline: 0.025 });
  const cols = ['#27ae60', '#f39c12', '#c0392b'];
  for (let i = 0; i < 3; i++) {
    const y = 0.2 + i * 0.85;
    k.add(box(0.66, 0.72, 0.62), { at: [0, y, 0], color: cols[i], outline: 0.02 });
    for (const s of [-1, 1]) {
      k.add(box(0.14, 0.12, 0.04), { at: [s * 0.14, y + 0.44, 0.31], color: '#fdfefe' });
      k.add(box(0.07, 0.08, 0.05), { at: [s * 0.14, y + 0.46, 0.33], color: '#2d3436' });
    }
    k.add(box(0.34, 0.07, 0.04), { at: [0, y + 0.16, 0.31], color: '#2d3436' });
    if (i === 2) k.add(cone(0.12, 0.35, 4), { at: [0, y + 0.3, 0.36], rot: [Math.PI / 2, 0, 0], color: '#f1c40f' });
  }
  for (const s of [-1, 1]) k.add(slab([[0, 0], [0.75, 0.25], [0.8, -0.1], [0, -0.25]], 0.08), { at: [s * 0.3, 2.45, 0], scale: [s, 1, 1], color: '#6d4c41', outline: 0.015 });
  k.add(cone(0.4, 0.4, 4), { at: [0, 3.0, 0], rot: [0, Math.PI / 4, 0], color: '#6d4c41', outline: 0.02 });
});

const dummy = () => model('dummy', (k) => {
  // a straw training dummy: post and crossbar, rope-bound arms of straw,
  // a stuffed burlap body with a painted target, a sack head with stitched eyes
  const POST = '#6d4c33', SACK = '#c9b083', STRAW = '#d8b13a', ROPE = '#7d5f3a', RED = '#b8352a';
  k.add(cyl(0.06, 0.07, 1.95, 7), { color: POST, outline: 0.012 });
  k.add(cyl(0.18, 0.22, 0.14, 8), { color: POST, outline: 0.012 });
  k.save(); k.translate(0, 1.36, 0); k.rotateZ(Math.PI / 2);
  k.add(cyl(0.045, 0.045, 1.1, 6), { at: [0, -0.55, 0], color: POST, outline: 0.01 });
  for (const s of [-1, 1]) {
    k.add(cyl(0.075, 0.09, 0.32, 8), { at: [0, s > 0 ? 0.2 : -0.52, 0], color: STRAW, outline: 0.012 });
    for (const t of [0.24, 0.42]) k.add(torus(0.085, 0.016, 4, 8), { at: [0, s > 0 ? t : -t, 0], rot: [Math.PI / 2, 0, 0], color: ROPE });
    for (let i = 0; i < 5; i++) k.add(cbox(0.01, 0.12, 0.012), { at: [Math.cos(i) * 0.05, s * 0.6, Math.sin(i) * 0.05], rot: [Math.sin(i) * 0.5, 0, Math.cos(i) * 0.5], color: STRAW });
  }
  k.restore();
  k.add(lathe([[0.16, 0], [0.27, 0.08], [0.31, 0.3], [0.3, 0.52], [0.25, 0.66], [0.12, 0.72]], 12), { at: [0, 0.78, 0], scale: [1, 1, 0.8], color: SACK, outline: 0.02 });
  for (const y of [0.83, 1.47]) k.add(torus(y < 1 ? 0.2 : 0.17, 0.022, 4, 12), { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.8, 1], color: ROPE });
  for (const [r, c] of [[0.17, '#f2ead8'], [0.12, RED], [0.065, '#f2ead8'], [0.03, RED]]) k.add(new THREE.CircleGeometry(r, 14), { at: [0, 1.1, 0.25 + (0.17 - r) * 0.04], color: c });
  k.add(new THREE.SphereGeometry(0.2, 10, 8), { at: [0, 1.72, 0], scale: [1, 1.08, 0.92], color: SACK, outline: 0.018 });
  k.add(lathe([[0.07, 0], [0.1, 0.06], [0.06, 0.12], [0.001, 0.13]], 7), { at: [0, 1.9, 0], color: SACK });
  k.add(torus(0.07, 0.016, 4, 8), { at: [0, 1.91, 0], rot: [Math.PI / 2, 0, 0], color: ROPE });
  for (const s of [-1, 1]) for (const r of [0.6, -0.6]) k.add(cbox(0.07, 0.014, 0.01), { at: [s * 0.075, 1.75, 0.185], rot: [0, 0, r], color: '#2b1d14' });
  for (let i = -2; i <= 2; i++) k.add(cbox(0.012, 0.04, 0.01), { at: [i * 0.03, 1.64, 0.18], color: '#2b1d14' });
  k.add(cbox(0.14, 0.01, 0.01), { at: [0, 1.64, 0.182], color: '#2b1d14' });
});

const stall = () => model('stall', (k) => {
  // the counter: a plank front over a frame, a cloth over its top
  k.add(box(1.8, 0.85, 0.7), { at: [0, 0, 0.1], color: WOOD, outline: 0.02 });
  for (let x = -0.75; x < 0.8; x += 0.3) k.add(box(0.025, 0.78, 0.02), { at: [x, 0.04, 0.455], color: shade(WOOD, -0.25) });
  k.add(box(1.9, 0.06, 0.8), { at: [0, 0.85, 0.1], color: shade(WOOD, 0.15), outline: 0.012 });
  k.add(box(1.92, 0.24, 0.012), { at: [0, 0.66, 0.505], color: '#f3ead3', tint: 1 });
  // four posts up to the awning's underside (never through it), a rail across the back
  const under = (z) => 2.12 - (z - 0.08) * Math.tan(0.3) - 0.03;
  for (const x of [-0.85, 0.85]) {
    k.add(cyl(0.04, 0.045, under(0.42), 6), { at: [x, 0, 0.42], color: DARK_WOOD, outline: 0.01 });
    k.add(cyl(0.04, 0.045, under(-0.3), 6), { at: [x, 0, -0.3], color: DARK_WOOD, outline: 0.01 });
  }
  k.add(box(1.74, 0.06, 0.05), { at: [0, 1.55, -0.3], color: DARK_WOOD });
  // a shelf of jars behind
  k.add(box(1.5, 0.05, 0.25), { at: [0, 1.05, -0.3], color: shade(WOOD, 0.1) });
  for (let i = 0; i < 6; i++) k.add(cyl(0.06, 0.07, 0.17, 7), { at: [-0.62 + i * 0.25, 1.1, -0.3], color: ['#c0392b', '#d68910', '#27ae60', '#8e44ad', '#2980b9', '#f1c40f'][i] });
  // baskets of fruit on the counter, a crate at the end
  const cols = ['#e67e22', '#f1c40f', '#c0392b', '#27ae60', '#8e44ad'];
  for (let b = 0; b < 3; b++) {
    const bx = -0.62 + b * 0.5;
    k.add(cyl(0.2, 0.16, 0.12, 9), { at: [bx, 0.91, 0.15], color: '#a5793f', outline: 0.008 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(new THREE.SphereGeometry(0.065, 7, 5), { at: [bx + Math.cos(a) * 0.1, 1.04 + (i % 2) * 0.03, 0.15 + Math.sin(a) * 0.1], color: cols[(b * 2 + (i % 2)) % 5] }); }
    k.add(new THREE.SphereGeometry(0.065, 7, 5), { at: [bx, 1.09, 0.15], color: cols[(b * 2 + 1) % 5] });
  }
  k.add(box(0.36, 0.26, 0.32), { at: [0.62, 0.91, 0.05], color: '#b08850', outline: 0.01 });
  // striped awning: coloured (tinted) and white stripes, scalloped at the front
  const n = 6, w = 2.0;
  for (let i = 0; i < n; i++) {
    k.add(box(w / n + 0.005, 0.04, 1.15), { at: [-w / 2 + (i + 0.5) * w / n, 2.12, 0.08], rot: [0.3, 0, 0], color: '#ffffff', tint: i % 2 ? 0 : 1 });
    k.add(new THREE.CircleGeometry(w / n / 2, 8, Math.PI, Math.PI), { at: [-w / 2 + (i + 0.5) * w / n, 1.96, 0.645], rot: [-0.3, 0, 0], color: '#ffffff', tint: i % 2 ? 0 : 1, double: true, backShade: 0.85 });
  }
});

const well = () => model('well', (k) => {
  const stone = '#8e8a82';
  k.add(cyl(0.78, 0.8, 0.75, 14, true), { split: true, color: (p, n, i) => (Math.floor(i / 6) % 2 ? stone : shade(stone, -0.1)), outline: 0.02 });
  k.add(cyl(0.58, 0.58, 0.75, 14, true), { color: shade(stone, -0.35), double: true, backShade: 1 });
  k.add(new THREE.RingGeometry(0.56, 0.82, 14), { at: [0, 0.76, 0], rot: [-Math.PI / 2, 0, 0], color: '#a39d92' });
  k.add(new THREE.CircleGeometry(0.58, 14), { at: [0, 0.3, 0], rot: [-Math.PI / 2, 0, 0], color: '#26465b' });
  for (const s of [-1, 1]) k.add(box(0.12, 1.75, 0.12), { at: [s * 0.7, 0.2, 0], color: '#6d4c33', outline: 0.012 });
  k.add(cyl(0.06, 0.06, 1.3, 6), { at: [0.65, 1.55, 0], rot: [0, 0, Math.PI / 2], color: '#5d4037' });
  k.add(cyl(0.01, 0.01, 0.78, 3), { at: [0, 0.77, 0], color: '#c8b89a' });
  // the bucket: a solid wooden pail (closed, with its iron bands and handle)
  k.add(cyl(0.13, 0.1, 0.22, 10), { at: [0, 0.55, 0], color: '#8d6e4a', outline: 0.01 });
  for (const y of [0.58, 0.72]) k.add(cyl(0.128 - (0.72 - y) * 0.14, 0.128 - (0.72 - y) * 0.14, 0.025, 10), { at: [0, y, 0], scale: [1.04, 1, 1.04], color: '#4a4a4a' });
  k.add(torus(0.12, 0.008, 3, 10, Math.PI), { at: [0, 0.77, 0], color: '#4a4a4a' });
  for (const s of [-1, 1]) {
    k.save(); k.translate(0, 2.35, 0); k.rotateX(s * 0.72);
    k.add(box(1.8, 0.07, 0.72), { at: [0, 0, s * 0.36], color: '#9c4a2a', outline: 0.02 });
    k.restore();
  }
});

const lamp = () => model('lamp', (k) => {
  k.add(cyl(0.15, 0.2, 0.32, 8), { color: IRON, outline: 0.015 });
  k.add(cyl(0.045, 0.06, 2.3, 6), { at: [0, 0.3, 0], color: IRON, outline: 0.012 });
  k.add(torus(0.08, 0.02, 4, 8), { at: [0, 1.2, 0], rot: [Math.PI / 2, 0, 0], color: IRON });
  k.add(cyl(0.12, 0.08, 0.08, 6), { at: [0, 2.58, 0], color: IRON });
  k.add(cyl(0.2, 0.14, 0.42, 6), { at: [0, 2.64, 0], color: '#fff6d8', glow: '#ffc85c', flicker: 0.08 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(box(0.025, 0.42, 0.025), { at: [Math.cos(a) * 0.18, 2.64, Math.sin(a) * 0.18], color: IRON }); }
  k.add(cone(0.28, 0.24, 6), { at: [0, 3.05, 0], color: IRON, outline: 0.012 });
  k.add(new THREE.SphereGeometry(0.045, 5, 4), { at: [0, 3.31, 0], color: IRON });
});

const lantern = () => model('lantern', (k) => {
  k.add(box(0.11, 2.1, 0.11), { color: '#4e342e', outline: 0.012 });
  k.add(box(0.55, 0.07, 0.07), { at: [0.24, 2.0, 0], color: '#4e342e' });
  k.add(cyl(0.008, 0.008, 0.18, 3), { at: [0.45, 1.84, 0], color: IRON });
  k.add(new THREE.SphereGeometry(0.22, 10, 8), { at: [0.45, 1.6, 0], scale: [1, 1.3, 1], color: '#e74c3c', glow: '#ff7043', flicker: 0.3, outline: 0.012 });
  for (const y of [1.34, 1.86]) k.add(cyl(0.12, 0.12, 0.05, 8), { at: [0.45, y - 0.02, 0], color: '#2d3436' });
  for (let y = 1.42; y < 1.8; y += 0.1) k.add(torus(0.218 * Math.sqrt(Math.max(0.05, 1 - ((y - 1.6) / 0.29) ** 2)), 0.006, 3, 10), { at: [0.45, y, 0], rot: [Math.PI / 2, 0, 0], color: '#9e2a20' });
  k.add(box(0.3, 0.15, 0.3), { at: [0, 0, 0], color: '#6d5a45' });
});

const sign = () => model('sign', (k) => {
  k.add(box(0.1, 1.35, 0.1), { color: '#6d4c33', outline: 0.012 });
  k.add(box(1.15, 0.5, 0.07), { at: [0, 1.0, 0.07], color: '#c8a878', outline: 0.018 });
  k.add(box(1.2, 0.06, 0.08), { at: [0, 1.5, 0.07], color: '#5a3a22' });
  for (const [w, y] of [[0.8, 1.32], [0.62, 1.17]]) k.add(box(w, 0.04, 0.01), { at: [0, y, 0.11], color: '#3b2a1a' });
});

const skull = () => model('skull', (k) => {
  // a big bleached skull: domed cranium, heavy brow, sunk sockets, cheekbones,
  // an inverted-heart nose hole, a row of teeth over a dropped jaw
  const W = '#ece6d6', S = '#d6ceb8', D = '#231c18';
  k.add(new THREE.SphereGeometry(0.82, 16, 12), { at: [0, 0.95, -0.08], scale: [0.95, 0.9, 1.05], color: W, outline: 0.035 });
  k.add(new THREE.SphereGeometry(0.6, 12, 8), { at: [0, 0.55, 0.28], scale: [1.02, 0.75, 0.85], color: W, outline: 0.03 });
  k.add(new THREE.SphereGeometry(0.5, 12, 6), { at: [0, 0.98, 0.5], scale: [1.05, 0.26, 0.6], color: S, outline: 0.02 });
  for (const s of [-1, 1]) {
    k.add(new THREE.SphereGeometry(0.24, 10, 8), { at: [s * 0.3, 0.74, 0.74], scale: [1, 0.95, 0.4], color: D });
    k.add(new THREE.SphereGeometry(0.2, 8, 6), { at: [s * 0.52, 0.5, 0.48], scale: [0.7, 0.55, 1], color: S, outline: 0.015 });
  }
  k.add(slab([[-0.11, 0.18], [0, 0], [0.11, 0.18], [0.06, 0.24], [0, 0.2], [-0.06, 0.24]], 0.06), { at: [0, 0.38, 0.87], color: D });
  k.add(box(0.72, 0.18, 0.42), { at: [0, 0.18, 0.42], color: W, outline: 0.02 });
  for (let i = -3; i <= 3; i++) k.add(box(0.085, 0.14, 0.05), { at: [i * 0.095, 0.16, 0.64 - Math.abs(i) * 0.012], color: i % 2 ? '#f6f1e3' : '#efe8d6', outline: 0.006 });
  k.add(box(0.68, 0.03, 0.04), { at: [0, 0.15, 0.62], color: D });
  k.save(); k.translate(0, 0.1, 0.18); k.rotateX(0.18);
  k.add(box(0.66, 0.14, 0.52), { at: [0, -0.12, 0.08], color: S, outline: 0.02 });
  for (let i = -3; i <= 3; i++) k.add(box(0.08, 0.1, 0.045), { at: [i * 0.09, 0.0, 0.33 - Math.abs(i) * 0.012], color: '#efe8d6' });
  k.restore();
  for (const [x, y, z, r] of [[0.2, 1.42, 0.35, 0.3], [-0.35, 1.25, 0.5, 0.2]]) k.add(cbox(0.012, r, 0.015), { at: [x, y, z], rot: [0.6, 0.4, 0.5], color: '#9c9480' });
});

// a wooden flower box under a front window: soil, leaves and blooms
const planter = () => model('planter', (k) => {
  k.add(box(1.0, 0.36, 0.34), { color: WOOD, tint: 1, outline: 0.015 });
  for (const x of [-0.46, 0.46]) k.add(box(0.06, 0.4, 0.38), { at: [x, 0, 0], color: DARK_WOOD });
  k.add(box(0.92, 0.04, 0.28), { at: [0, 0.34, 0], color: '#4e342e' });
  const R = rng(17);
  for (let i = 0; i < 9; i++) {
    const x = -0.4 + i * 0.1 + (R() - 0.5) * 0.04, z = (R() - 0.5) * 0.16;
    k.add(new THREE.IcosahedronGeometry(0.1 + R() * 0.04, 0), { at: [x, 0.42 + R() * 0.06, z], flat: true, color: R() < 0.5 ? '#43a047' : '#2e7d32' });
    if (i % 2 === 0) k.add(new THREE.IcosahedronGeometry(0.055, 0), { at: [x, 0.54 + R() * 0.06, z + 0.04], color: ['#e84a7f', '#ffd54f', '#ffffff', '#ff7043', '#ba68c8'][Math.floor(R() * 5)] });
  }
});

// a heap of grain sacks, tied at the neck
const sacks = () => model('sacks', (k) => {
  // a heap of burlap grain sacks: fat, slumped bags with a gathered, tied
  // neck and a flared tuft, a stencilled band; one lies across the others
  const S = ['#c8b48a', '#bba67b', '#d2c096'], T = '#6d4c33';
  const one = (x, y, z, ry, lie, c) => {
    k.save(); k.translate(x, y, z); k.rotateY(ry); if (lie) { k.rotateZ(Math.PI / 2 - 0.08); k.translate(0, -0.3, 0); }
    k.add(lathe([[0.001, 0], [0.24, 0.01], [0.31, 0.08], [0.33, 0.22], [0.31, 0.36], [0.25, 0.46], [0.14, 0.53], [0.075, 0.57], [0.07, 0.6]], 12), { scale: [1, 1, 0.78], color: S[c], tint: 1, outline: 0.018 });
    k.add(lathe([[0.065, 0.6], [0.1, 0.66], [0.13, 0.7], [0.1, 0.715], [0.001, 0.72]], 8), { split: true, color: (p, n, i) => (i % 2 ? S[c] : shade(S[c], -0.12)) });
    k.add(torus(0.075, 0.022, 4, 10), { at: [0, 0.595, 0], rot: [Math.PI / 2, 0, 0], color: T });
    k.add(cyl(0.327, 0.327, 0.07, 12, true), { at: [0, 0.2, 0], scale: [1.005, 1, 0.79], color: '#8a3b2b', double: true });
    k.restore();
  };
  one(-0.27, 0, 0.02, 0.3, false, 0); one(0.3, 0, -0.06, -0.5, false, 1); one(0.0, 0.42, 0.26, 1.35, true, 2);
});

// a rack of weapons outside an armoury: spears and swords in a frame
const weaponRack = () => model('weaponrack', (k) => {
  for (const x of [-0.6, 0.6]) k.add(box(0.08, 1.3, 0.08), { at: [x, 0, 0], color: DARK_WOOD, outline: 0.012 });
  for (const y of [0.2, 1.05]) k.add(box(1.28, 0.07, 0.12), { at: [0, y, 0], color: WOOD, outline: 0.012 });
  const steel = '#b0bec5';
  for (let i = 0; i < 5; i++) {
    const x = -0.44 + i * 0.22, spear = i % 2 === 0;
    k.save(); k.translate(x, 0.12, 0.03); k.rotateZ((i - 2) * 0.03);
    if (spear) {
      k.add(cyl(0.02, 0.02, 1.55, 5), { color: '#6d4c41' });
      k.add(cone(0.045, 0.2, 4), { at: [0, 1.55, 0], color: steel, outline: 0.01 });
    } else {
      k.add(box(0.05, 0.9, 0.012), { at: [0, 0.32, 0], color: steel, outline: 0.008 });
      k.add(box(0.16, 0.03, 0.04), { at: [0, 1.22, 0], color: '#5d4037' });
      k.add(cyl(0.022, 0.022, 0.22, 6), { at: [0, 1.24, 0], color: '#3e2723' });
    }
    k.restore();
  }
});

// a sandwich-board sign at a tavern's or a shop's door
const signboard = () => model('signboard', (k) => {
  // an A-frame: the two boards hinged together at the top, splayed apart at the feet
  const top = 0.86, len = 0.88;
  for (const s of [-1, 1]) {
    k.save(); k.translate(0, top, 0); k.rotateX(-s * 0.2);
    k.add(box(0.6, len, 0.04), { at: [0, -len, s * 0.02], color: WOOD, outline: 0.012 });
    k.add(box(0.5, 0.5, 0.012), { at: [0, -0.62, s * 0.045], color: '#2f3640' });
    for (const y of [-0.24, -0.36, -0.48]) k.add(box(0.36 - (y < -0.4 ? 0.1 : 0), 0.03, 0.006), { at: [0, y, s * 0.053], color: '#f5f0e1' });
    k.restore();
  }
  k.add(box(0.64, 0.05, 0.08), { at: [0, top - 0.02, 0], color: shade(WOOD, -0.2) });
});

const tint = (o, pal) => pal[(o.v || 0) % pal.length];

// ------------------------------------------------------------------ builders
const reg = (kind, fn) => registerPropBuilder(kind, fn);

reg('barrel', (o, ctx) => simple(o, ctx, 'barrel', barrel(), { randomYaw: true, color: tint(o, ['#ffffff', '#e8d9c8', '#f3e3cf', '#d9c6b0']) }));
reg('crate', (o, ctx) => simple(o, ctx, 'crate', crate(), { yaw: jitterYaw(o, 0.8), color: tint(o, ['#ffffff', '#efe2c8', '#e0cfae', '#f6ead4']) }));
reg('haystack', (o, ctx) => simple(o, ctx, 'haystack', haystack(), { randomYaw: true }));
reg('bench', (o, ctx) => simple(o, ctx, 'bench', bench(), { yaw: jitterYaw(o, 0.1) }));
reg('fence', (o, ctx) => simple(o, ctx, 'fence', fence(), { yaw: 0 }));
reg('mooring', (o, ctx) => simple(o, ctx, 'mooring', mooring(), { randomYaw: true }));
reg('grave', (o, ctx) => simple(o, ctx, 'grave', grave(), { yaw: jitterYaw(o, 0.25), color: tint(o, ['#ffffff', '#e6e9ea', '#d5dadb', '#f2f2ee']) }));
reg('bones', (o, ctx) => simple(o, ctx, 'bones', bones(), { randomYaw: true }));
reg('anchor', (o, ctx) => simple(o, ctx, 'anchor', anchor(), { randomYaw: true }));
reg('cannon', (o, ctx) => simple(o, ctx, 'cannon', cannon(), { yaw: jitterYaw(o, 1.2) }));
reg('mushroom', (o, ctx) => simple(o, ctx, 'mushroom', mushroom(), { randomYaw: true, color: tint(o, ['#e53935', '#8e44ad', '#e67e22', '#d81b60']), scale: (o.s || 1) * (0.9 + hash(o.x, o.y) * 0.5) }));
reg('crystal', (o, ctx) => simple(o, ctx, 'crystal', crystal(), { randomYaw: true }));
reg('pillar', (o, ctx) => { const broken = hash(o.x, o.y, 9) < 0.35 ? 1 : 0; return simple(o, ctx, 'pillar:' + broken, pillar(broken), { yaw: 0, color: '#ffffff' }); });
reg('ruins', (o, ctx) => { const v = Math.floor(hash(o.x, o.y, 2) * 3); return simple(o, ctx, 'ruins:' + v, ruins(v), { yaw: o.yaw ?? hash(o.x, o.y) * Math.PI * 2, color: ['#ffffff', '#e8e0d8', '#d8cfc6'][v] }); });
reg('tent', (o, ctx) => simple(o, ctx, 'tent', tent(), { yaw: o.yaw ?? jitterYaw(o, 0.5), color: tint(o, ['#e8d5b5', '#c0392b', '#2e86c1']) }));
reg('totem', (o, ctx) => simple(o, ctx, 'totem', totem(), { yaw: 0 }));
reg('dummy', (o, ctx) => simple(o, ctx, 'dummy', dummy(), { yaw: jitterYaw(o, 0.6) }));
reg('well', (o, ctx) => simple(o, ctx, 'well', well(), { yaw: 0 }));
reg('lamp', (o, ctx) => simple(o, ctx, 'lamp', lamp(), { yaw: 0 }));
reg('lantern', (o, ctx) => simple(o, ctx, 'lantern', lantern(), { yaw: hash(o.x, o.y) < 0.5 ? 0 : Math.PI }));
reg('planter', (o, ctx) => simple(o, ctx, 'planter', planter(), { yaw: o.yaw ?? 0 }));
reg('sacks', (o, ctx) => simple(o, ctx, 'sacks', sacks(), { randomYaw: true }));
reg('weaponrack', (o, ctx) => simple(o, ctx, 'weaponrack', weaponRack(), { yaw: o.yaw ?? 0 }));
reg('signboard', (o, ctx) => simple(o, ctx, 'signboard', signboard(), { yaw: (o.yaw ?? 0) + jitterYaw(o, 0.4) }));
reg('skull', (o, ctx) => simple(o, ctx, 'skull', skull(), { yaw: jitterYaw(o, 0.6) }));

// market stalls turn to face the town plaza (as placed: see towngen; its collider turns with it)
reg('stall', (o, ctx) => {
  let yaw = o.yaw ?? 0;
  const w = ctx?.world;
  if (o.yaw === undefined && w?.islands) {
    let best = 1e9;
    for (const isl of w.islands) {
      for (const t of isl.towns || []) {
        const d = w.dist2(o.x, o.y, t.plaza.x, t.plaza.y);
        if (d < best && d < 30 * 30) { best = d; yaw = Math.atan2(w.dx(o.x, t.plaza.x), t.plaza.y - o.y); }
      }
    }
  }
  return simple(o, ctx, 'stall', stall(), { yaw, color: tint(o, ['#e74c3c', '#3498db', '#27ae60', '#f39c12', '#9b59b6', '#16a085']) });
});

export { barrel, crate, lamp, sign as signModel, local };

/** Every model above by name, for tools/propsheet.mjs. */
export const STREET_MODELS = {
  barrel, crate, haystack, bench, fence, mooring, grave, bones, anchor, cannon, mushroom, crystal,
  pillar: () => pillar(0), pillarBroken: () => pillar(1), ruins: () => ruins(0), tent, totem, dummy, stall, well,
  lamp, lantern, sign, skull, planter, sacks, weaponRack, signboard,
};
