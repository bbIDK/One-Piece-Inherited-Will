// 3D ships: a curved planked hull with bulwarks, deck planking, a raised
// quarterdeck (helm) and forecastle on bigger ships, cannons in gunports,
// figureheads (the Going Merry's ram, the Thousand Sunny's lion, the Marine
// gull), paddle wheels, masts with tops and a crow's nest, yards that brace
// to the wind, billowing sails, rigging and the masthead flag. The main sail
// and the flag show the owner's colours: the player's Jolly Roger once they
// found a crew, the Marine gull for Marines, pirate flags for pirates.
//
// From the helm of your own ship in first person, everything above the deck
// (masts, yards, sails, rigging, flag) turns see-through so you can steer.
//
// Local frame: bow along +x, beam along z, y up; the waterline is y = 0.
import * as THREE from 'three';
import { canvasTexture } from './materials.js';
import { drawJollyRoger, drawMarineEmblem } from '../render/ship.js';
import { Mesher, box, cyl, cone, torus, tube, C, shade } from './props/kit.js';
import { vcMat, U } from './props/mats.js';
import { swellAt } from './swell.js';
import { shipDims, helmPoint, hbAt, topAt, xAt, floorAt, shipRock, shipBob, smallProfile, wheelSpec } from '../world/hull.js';
import { bigHull, bigInterior, bigTreasure, bigMastPlan, bigSailPlan, bigMastGeometry, bigRigging, bigPalette, wheelParts, noSprit } from './bigship.js';

// a coated ship's bubble (see the coating, below): a soap film, its colours
// running with the angle you see it at, bright at its rim — from either side
const COAT_GEO = new THREE.SphereGeometry(1, 40, 24);
COAT_GEO.userData.shared = true;
let coatMat = null;
function coatMaterial() {
  if (coatMat) return coatMat;
  coatMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mvPosition.xyz;
        vP = position;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float f = 1.0 - abs(dot(n, v));
        float rim = pow(f, 2.2);
        // (thin-film bands drifting over it, as on a soap bubble)
        float film = f * 1.4 + vP.y * 0.9 + sin(vP.x * 3.0 + uTime * 0.4) * 0.12 + uTime * 0.04;
        vec3 irid = 0.55 + 0.45 * cos(6.2831 * (film + vec3(0.0, 0.33, 0.67)));
        vec3 col = mix(vec3(0.84, 0.95, 1.0), irid, 0.55);
        float spec = pow(max(0.0, dot(n, normalize(vec3(-0.35, 0.6, 0.72)))), 48.0) * (gl_FrontFacing ? 1.0 : 0.3);
        col += spec * 1.4;
        gl_FragColor = vec4(col, clamp(0.06 + rim * 0.7 + spec, 0.0, 0.92));
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  coatMat.uniforms.uTime = U.time;
  return coatMat;
}
import { WakeTrail } from './wake3d.js';

export { shipDims, helmPoint };

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- dimensions
// (the hull's shape is shared with the game: see world/hull.js)

// ---------------------------------------------------------------- palette
function palette(def) {
  const H = C(def.color || '#8d5b33');
  const warship = def.sail === 'marine';
  const light = H.getHSL({}).l > 0.8;
  return {
    hull: H,
    cap: warship ? C('#1b4f72') : shade(H, -0.45),
    bulwark: warship ? C('#f5f6fa') : light ? shade(H, -0.05) : shade(H, 0.12),
    wale: warship ? C('#1b4f72') : def.figurehead === 'ram' ? C('#f2efe6') : def.figurehead === 'lion' ? C('#e8c26b') : shade(H, -0.55),
    plank: warship ? C('#e9edf1') : H,
    plank2: warship ? C('#dfe4ea') : shade(H, -0.08),
    bottom: def.seastone ? C('#5b6770') : warship ? C('#5b6770') : shade(H, -0.3),
    deck: def.figurehead === 'lion' ? C('#6fb34a') : def.seastone && !warship ? C('#cfd8dc') : warship ? C('#c9b28f') : shade(H, 0.2),
    trim: warship ? C('#1b4f72') : def.length >= 8 ? C('#d4ac0d') : shade(H, -0.4),
    wood: C('#6d4c33'),
    dark: C('#2b1d14'),
  };
}

// ---------------------------------------------------------------- hull
const hullCache = new Map();

export function hullGeometry(def) {
  const key = `${def.length}|${def.beam}|${def.color}|${def.figurehead}|${def.cannons}|${def.paddle}|${def.sail}|${def.seastone}|${def.masts}`;
  let g = hullCache.get(key);
  if (g) return g;
  const d = shipDims(def);
  if (d.big) {
    // the One Piece-scale ships are built like the real thing (see bigship.js)
    g = bigHull(def, d).build(true);
    hullCache.set(key, g);
    return g;
  }
  const P = palette(def);
  const k = new Mesher();
  const N = 22;
  // ---- the planked shell: rings of profile points from the rail to the keel
  // (its shape is shared with the game, which keeps people out of it: hull.js smallProfile)
  const prof = (t) => smallProfile(d, t);
  const band = [P.cap, P.bulwark, P.wale, P.plank, P.plank2, P.plank, P.bottom, shade(P.bottom, -0.1), P.bottom];
  const NP = 10;
  const pos = [], idx = [], triCol = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = xAt(d, t), hb = Math.max(0.0, hbAt(t, d.B));
    const pr = prof(t);
    for (const s of [1, -1]) for (const [w, y] of pr) pos.push(x, y, s * w * hb);
  }
  const vid = (i, s, j) => (i * 2 + s) * NP + j;
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < 2; s++) {
      for (let j = 0; j < NP - 1; j++) {
        const a = vid(i, s, j), b = vid(i + 1, s, j), c = vid(i, s, j + 1), dd = vid(i + 1, s, j + 1);
        if (s === 0) idx.push(a, c, b, b, c, dd); else idx.push(a, b, c, b, dd, c);
        const col = band[j];
        triCol.push(col, col);
      }
    }
  }
  // the stern transom
  for (let j = 0; j < NP - 1; j++) {
    const A = vid(0, 1, j), Bv = vid(0, 0, j), Cv = vid(0, 1, j + 1), Dv = vid(0, 0, j + 1);
    idx.push(A, Cv, Bv, Bv, Cv, Dv);
    const col = j < 2 ? P.cap : j < 6 ? shade(P.hull, -0.12) : P.bottom;
    triCol.push(col, col);
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex(idx);
  shell.computeVertexNormals();
  k.add(shell, { split: true, color: (p, n, i) => triCol[Math.floor(i / 3)], outline: 0.045 });

  // ---- bulwark inside, rail cap and deck planking
  const inset = d.open ? 0.06 : 0.09;
  const strip = (pts, col, flip = false) => {
    // pts: [[a0, b0], [a1, b1], ...] pairs of points along the hull → a quad strip
    const sp = [], si = [];
    pts.forEach(([a, b]) => sp.push(...a, ...b));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, e = a + 3;
      if (flip) si.push(a, c, b, b, c, e); else si.push(a, b, c, b, e, c);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(si);
    sg.computeVertexNormals();
    k.add(sg, { color: col });
  };
  for (const s of [1, -1]) {
    const inner = [], cap = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, x = xAt(d, t), hb = hbAt(t, d.B);
      if (hb < 0.12) continue;
      const top = topAt(d, t);
      const zi = s * Math.max(0.02, 0.965 * hb - inset);
      inner.push([[x, top - 0.02, zi], [x, floorAt(d, t) - 0.01, s * Math.max(0.02, 0.995 * hb - inset)]]);
      cap.push([[x, top, s * 0.965 * hb], [x, top - 0.02, zi]]);
    }
    strip(inner, shade(P.bulwark, -0.1), s > 0);
    strip(cap, P.cap, s > 0);
  }
  // deck planks: a grid across the beam, alternate planks a touch darker
  const deckRegion = (t0, t1, yFn) => {
    const M = Math.max(4, Math.round(d.B / 0.24));
    const R = Math.max(2, Math.round((t1 - t0) * N));
    const dp = [], di = [], dc = [];
    for (let i = 0; i <= R; i++) {
      const t = t0 + (t1 - t0) * i / R, x = xAt(d, t);
      const w = Math.max(0.01, 0.995 * hbAt(t, d.B) - inset);
      for (let m = 0; m <= M; m++) dp.push(x, yFn(t), -w + 2 * w * m / M);
    }
    for (let i = 0; i < R; i++) {
      for (let m = 0; m < M; m++) {
        const a = i * (M + 1) + m, b = a + 1, c = a + M + 1, e = c + 1;
        di.push(a, b, c, b, e, c);
        const col = m % 2 ? shade(P.deck, -0.06) : P.deck;
        dc.push(col, col);
      }
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    dg.setIndex(di);
    dg.computeVertexNormals();
    k.add(dg, { split: true, color: (p, n, i) => dc[Math.floor(i / 3)] });
  };
  deckRegion(d.castle ? d.tq : 0.02, d.fore ? d.tf : 0.97, () => d.deckY);
  if (d.castle) deckRegion(0.0, d.tq + 0.012, () => d.yq);
  if (d.fore) deckRegion(d.tf - 0.012, 0.975, () => d.yf);

  // ---- quarterdeck front wall, rail, stairs; forecastle wall
  if (d.castle) {
    const xq = xAt(d, d.tq), w = 0.995 * hbAt(d.tq, d.B) - inset;
    k.add(box(0.12, d.hq, w * 2), { at: [xq + 0.06, d.deckY, 0], color: shade(P.bulwark, -0.05), outline: 0.02 });
    k.add(box(0.06, 1.45, 0.75), { at: [xq + 0.13, d.deckY, 0], color: P.dark });
    for (const s of [-1, 1]) k.add(box(0.06, 0.35, 0.3), { at: [xq + 0.13, d.deckY + d.hq * 0.45, s * w * 0.55], color: '#2d4150', glow: '#ffc766' });
    // rail with balusters along the front edge
    k.add(box(0.08, 0.06, w * 2), { at: [xq + 0.04, d.yq + 0.72, 0], color: P.cap });
    for (let z = -w + 0.15; z < w; z += 0.26) k.add(cyl(0.03, 0.035, 0.72, 5, true), { at: [xq + 0.04, d.yq, z], color: shade(P.bulwark, 0.1) });
    // stairs up on the starboard side
    const steps = 4;
    for (let i = 0; i < steps; i++) k.add(box(0.28, 0.07, 0.6), { at: [xq + 0.25 + (steps - i) * 0.26, d.deckY + (i + 1) * d.hq / (steps + 1), w - 0.4], color: P.wood });
    // stern windows and a trim band
    const x0 = -d.L / 2 - 0.004, wt = hbAt(0, d.B) * 0.965;
    for (let i = -1; i <= 1; i++) k.add(box(0.05, 0.36, 0.28), { at: [x0, d.deckY + d.hq * 0.3, i * wt * 0.55], color: '#2d4150', glow: '#ffc766' });
    k.add(box(0.05, 0.08, wt * 2), { at: [x0, d.deckY + d.hq * 0.3 + 0.44, 0], color: P.trim });
    // side windows in the stern castle
    for (const s of [-1, 1]) for (const t of [0.06, 0.16]) k.add(box(0.26, 0.26, 0.05), { at: [xAt(d, t), d.deckY + 0.1, s * (hbAt(t, d.B) * 0.975 + 0.012)], color: '#2d4150', glow: '#ffc766' });
    // stern lanterns
    for (const s of [-1, 1]) {
      const lx = -d.L / 2 + 0.2, lz = s * (hbAt(0.02, d.B) * 0.9 - 0.1), ly = topAt(d, 0.02);
      k.add(cyl(0.03, 0.03, 0.5, 4), { at: [lx, ly, lz], color: P.dark });
      k.add(cyl(0.11, 0.13, 0.26, 6), { at: [lx, ly + 0.5, lz], color: '#fff3c4', glow: '#ffcf70', flicker: 0.2 });
      k.add(cone(0.15, 0.14, 6), { at: [lx, ly + 0.76, lz], color: P.dark });
    }
  }
  if (d.fore) {
    const xf = xAt(d, d.tf), w = 0.995 * hbAt(d.tf, d.B) - inset;
    k.add(box(0.12, d.hf, w * 2), { at: [xf - 0.06, d.deckY, 0], color: shade(P.bulwark, -0.05), outline: 0.02 });
    k.add(box(0.08, 0.06, w * 2), { at: [xf - 0.04, d.yf + 0.62, 0], color: P.cap });
    for (let z = -w + 0.15; z < w; z += 0.26) k.add(cyl(0.03, 0.035, 0.62, 5, true), { at: [xf - 0.04, d.yf, z], color: shade(P.bulwark, 0.1) });
  }

  // ---- the helm (a wheel on a post; the rowboat just has oars)
  if (!d.open) {
    // (the post: the wheel on it turns as she's steered — wheelGeometry, ShipView)
    const wx = d.wheelU + 0.1, fy = floorAt(d, (wx + d.L / 2) / d.L);
    k.add(box(0.14, 0.82, 0.14), { at: [wx, fy, 0], color: P.wood, outline: 0.015 });
  } else if (d.row) {
    // a rowboat: the rower's thwart amidships, a bench in the stern and a
    // thwart in the bow, knees under the seats, and a rowlock on each gunwale
    // (the oars themselves swing in them: see ShipView)
    const r = d.row, seatY = d.deckY + r.seatH;
    const thwart = (t, w) => {
      const hb = hbAt(t, d.B) * 0.97 - 0.06;
      k.add(box(w, 0.05, hb * 2), { at: [xAt(d, t), seatY - 0.05, 0], color: shade(P.deck, 0.06), outline: 0.01 });
      for (const s of [-1, 1]) k.add(box(w * 0.7, r.seatH - 0.05, 0.05), { at: [xAt(d, t), d.deckY, s * (hb - 0.06)], color: P.wood });
    };
    thwart(r.seatT, 0.26);
    thwart(0.8, 0.2);
    // the stern bench, round the transom
    k.add(box(0.36, 0.05, hbAt(0.1, d.B) * 1.8), { at: [xAt(d, 0.1), seatY - 0.08, 0], color: shade(P.deck, 0.06), outline: 0.01 });
    k.add(box(0.05, r.seatH - 0.08, hbAt(0.1, d.B) * 1.5), { at: [xAt(d, 0.1) + 0.14, d.deckY, 0], color: P.wood });
    for (const s of [-1, 1]) {
      // the rowlock: a pad on the gunwale and the crutch the loom turns in
      k.add(box(0.14, 0.04, 0.08), { at: [r.lockU, r.lockH - 0.08, s * r.lockV], color: shade(P.hull, -0.3) });
      k.add(cyl(0.012, 0.012, 0.08, 4), { at: [r.lockU, r.lockH - 0.05, s * r.lockV], color: '#6b6b6b' });
      k.add(torus(0.035, 0.009, 4, 8, Math.PI), { at: [r.lockU, r.lockH + 0.035, s * r.lockV], rot: [0, 0, Math.PI], color: '#6b6b6b' });
    }
    // a coil of line and the painter at the bow, a bailer in the bilge
    k.add(torus(0.1, 0.03, 4, 10), { at: [xAt(d, 0.88), d.deckY + 0.03, 0.08], rot: [Math.PI / 2, 0, 0], color: '#c8b89a' });
    k.add(cyl(0.07, 0.06, 0.1, 7), { at: [xAt(d, 0.3), d.deckY, -0.18], color: '#7d6a55' });
  } else {
    // thwarts and resting oars
    for (const t of [0.35, 0.65]) k.add(box(0.26, 0.05, hbAt(t, d.B) * 1.85), { at: [xAt(d, t), d.deckY + 0.26, 0], color: P.wood, outline: 0.01 });
    for (const s of [-1, 1]) {
      k.save(); k.translate(xAt(d, 0.5), topAt(d, 0.5) + 0.02, s * (d.B / 2 + 0.05)); k.rotateY(s * 0.12); k.rotateZ(Math.PI / 2 - 0.05);
      k.add(cyl(0.025, 0.025, 2.0, 5), { at: [0, -1.0, 0], color: '#b08850' });
      k.add(box(0.05, 0.5, 0.16), { at: [0, -1.25, 0], color: '#b08850' });
      k.restore();
    }
  }

  // ---- deck clutter: a hatch, barrels and crates
  if (!d.open) {
    const hx = xAt(d, 0.5);
    k.add(box(0.8, 0.12, 0.8), { at: [hx - 0.45, d.deckY, 0], color: shade(P.deck, -0.25), outline: 0.015 });
    k.add(box(0.62, 0.02, 0.62), { at: [hx - 0.45, d.deckY + 0.12, 0], color: P.dark });
    if (d.L >= 4.4) {
      for (const [dx, dz] of [[0.35, 0.5], [0.62, 0.62]]) k.add(cyl(0.2, 0.2, 0.5, 8), { at: [hx + dx, d.deckY, (dz - 0.05) * d.B / 2], color: '#8d5b33', outline: 0.015 });
      k.add(box(0.45, 0.4, 0.45), { at: [hx + 0.4, d.deckY, -d.B * 0.28], color: '#b08850', outline: 0.015 });
    }
  }

  // ---- cannons in gunports
  const nC = Math.min(10, Math.ceil(Math.min(20, def.cannons || 0) / 2));
  if (nC > 0) {
    const t0 = (d.castle ? d.tq : 0.12) + 0.06, t1 = (d.fore ? d.tf : 0.8) - 0.06;
    const r = 0.05 + d.B * 0.012;
    for (let i = 0; i < nC; i++) {
      const t = nC === 1 ? (t0 + t1) / 2 : t0 + (t1 - t0) * i / (nC - 1);
      const x = xAt(d, t), hb = hbAt(t, d.B);
      for (const s of [-1, 1]) {
        const y = d.deckY + 0.26;
        k.add(box(0.34, 0.3, 0.05), { at: [x, y - 0.15, s * (0.985 * hb + 0.01)], color: '#1a1a1a' });
        k.add(cyl(r * 0.85, r, 0.75, 7), { at: [x, y, s * (hb - 0.5)], rot: [s * Math.PI / 2, 0, 0], color: '#2d3436', outline: 0.012 });
        k.add(box(0.3, 0.16, 0.36), { at: [x, d.deckY, s * (hb - 0.45)], color: P.wood });
        if (d.L >= 8) {
          // a lower gun deck
          k.add(box(0.3, 0.26, 0.05), { at: [x + 0.2, d.deckY - 0.58, s * (hb + 0.012)], color: '#1a1a1a' });
          k.add(cyl(r * 0.8, r * 0.9, 0.3, 6), { at: [x + 0.2, d.deckY - 0.45, s * (hb - 0.12)], rot: [s * Math.PI / 2, 0, 0], color: '#2d3436' });
        }
      }
    }
  }

  // ---- rudder, bowsprit, anchor
  if (!d.open) {
    k.add(box(0.34, d.deckY + d.D * 0.8, 0.08), { at: [-d.L / 2 - 0.1, -d.D * 0.8, 0], color: shade(P.hull, -0.35), outline: 0.015 });
    const ft = topAt(d, 0.98);
    if (!noSprit(def.figurehead)) {
      k.save(); k.translate(d.L / 2 - 0.35, ft - 0.1, 0); k.rotateZ(-Math.PI / 2 + 0.33);
      k.add(cyl(0.05, 0.09, d.L * 0.3, 6), { color: P.wood, outline: 0.015 });
      k.restore();
    }
    for (const s of [-1, 1]) {
      const ax = d.L / 2 - d.L * 0.12, az = s * (hbAt(0.88, d.B) + 0.03);
      k.add(cyl(0.025, 0.025, 0.6, 4), { at: [ax, ft - 0.95, az], color: '#4a4a4a' });
      k.add(torus(0.13, 0.025, 4, 8, Math.PI), { at: [ax, ft - 0.95, az], rot: [0, 0, Math.PI], color: '#4a4a4a' });
    }
  }

  // ---- paddle-wheel housings (the wheels themselves turn: see ShipView)
  if (def.paddle) {
    const px = xAt(d, 0.34), R = 0.75;
    for (const s of [-1, 1]) {
      const hb = hbAt(0.34, d.B);
      k.save(); k.translate(px, d.deckY - 0.1, s * (hb + 0.2)); k.rotateZ(Math.PI / 2); k.rotateX(Math.PI / 2);
      k.add(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.44, 12, 1, true, 0, Math.PI), { color: P.cap, double: true });
      k.restore();
    }
  }

  figurehead(k, def, d, P);
  g = k.build(true);
  hullCache.set(key, g);
  return g;
}

/** Below decks and inside the cabins of a big ship (shared per ship type), or null: { main, overhead (the undersides of the decks over the rooms) }. */
const insideCache = new Map();
export function interiorGeometry(def) {
  const d = shipDims(def);
  if (!d.big) return null;
  const key = `${def.length}|${def.beam}|${def.color}|${def.cannons}|${def.sail}|${def.masts}`;
  let g = insideCache.get(key);
  if (!g) {
    const m = bigInterior(def, d), t = bigTreasure(def, d);
    g = { main: m.k.build(false), overhead: m.overhead.build(false), chest: t ? t.k.build(false) : null, chestAt: t?.at || null };
    insideCache.set(key, g);
  }
  return g;
}

function figurehead(k, def, d, P) {
  const tip = [d.L / 2, topAt(d, 1), 0];
  const s = Math.max(0.7, d.B / 2.4);
  if (def.figurehead === 'ram') {
    // the Going Merry: a round white sheep's head with curled horns
    k.add(cyl(0.12 * s, 0.16 * s, 0.6 * s, 7), { at: [tip[0] - 0.12, tip[1] - 0.25, 0], rot: [0, 0, -0.5], color: '#f5f6fa', outline: 0.02 });
    const hc = [tip[0] + 0.28 * s, tip[1] + 0.42 * s, 0];
    k.add(new THREE.SphereGeometry(0.36 * s, 12, 9), { at: hc, scale: [1.15, 1, 1], color: '#f7f5ef', outline: 0.03 });
    k.add(new THREE.SphereGeometry(0.22 * s, 10, 7), { at: [hc[0] + 0.3 * s, hc[1] - 0.1 * s, 0], scale: [1, 0.85, 1.05], color: '#efe8da', outline: 0.02 });
    for (const z of [-1, 1]) {
      k.add(new THREE.SphereGeometry(0.06 * s, 6, 4), { at: [hc[0] + 0.22 * s, hc[1] + 0.12 * s, z * 0.2 * s], color: '#1d1d1d' });
      k.add(new THREE.SphereGeometry(0.035 * s, 5, 3), { at: [hc[0] + 0.47 * s, hc[1] - 0.08 * s, z * 0.07 * s], color: '#5a4a3a' });
      // spiral horn curling down the side of the head
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = i / 24 * Math.PI * 2.4 + Math.PI * 0.5;
        const r = 0.24 * s * (1 - i / 24 * 0.72);
        pts.push(new THREE.Vector3(hc[0] - 0.1 * s + Math.cos(a) * r, hc[1] + 0.05 * s + Math.sin(a) * r, z * (0.3 * s + i / 24 * 0.12 * s)));
      }
      k.add(tube(new THREE.CatmullRomCurve3(pts), 24, 0.065 * s, 6), { color: '#c8955a', outline: 0.015 });
    }
  } else if (def.figurehead === 'lion') {
    // the Thousand Sunny: a sunflower-maned lion
    const hc = [tip[0] + 0.3 * s, tip[1] + 0.55 * s, 0];
    k.add(cyl(0.14 * s, 0.2 * s, 0.7 * s, 7), { at: [tip[0] - 0.15, tip[1] - 0.25, 0], rot: [0, 0, -0.45], color: '#e8c26b' });
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      k.save(); k.translate(hc[0] - 0.08 * s, hc[1], 0); k.rotateX(a);
      k.add(cone(0.17 * s, 0.42 * s, 6), { at: [0, 0.38 * s, 0], color: i % 2 ? '#f39c12' : '#e67e22', outline: 0.015 });
      k.restore();
    }
    k.add(new THREE.SphereGeometry(0.44 * s, 12, 9), { at: hc, scale: [0.75, 1, 1], color: '#fdd663', outline: 0.03 });
    for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.07 * s, 6, 4), { at: [hc[0] + 0.3 * s, hc[1] + 0.12 * s, z * 0.17 * s], color: '#1d1d1d' });
    k.add(new THREE.SphereGeometry(0.09 * s, 6, 4), { at: [hc[0] + 0.34 * s, hc[1] - 0.05 * s, 0], color: '#8d5524' });
    k.add(torus(0.12 * s, 0.022 * s, 4, 10, Math.PI), { at: [hc[0] + 0.32 * s, hc[1] - 0.14 * s, 0], rot: [0, Math.PI / 2, Math.PI], color: '#5a3a22' });
  } else if (def.figurehead === 'seagull') {
    // the Marine gull
    const hc = [tip[0] + 0.2 * s, tip[1] + 0.3 * s, 0];
    k.add(new THREE.SphereGeometry(0.3 * s, 10, 8), { at: hc, color: '#f5f6fa', outline: 0.025 });
    k.add(cone(0.1 * s, 0.42 * s, 6), { at: [hc[0] + 0.22 * s, hc[1] - 0.04 * s, 0], rot: [0, 0, -Math.PI / 2], color: '#f5a623', outline: 0.015 });
    for (const z of [-1, 1]) k.add(new THREE.SphereGeometry(0.05 * s, 6, 4), { at: [hc[0] + 0.14 * s, hc[1] + 0.1 * s, z * 0.2 * s], color: '#1d1d1d' });
    k.add(new THREE.CylinderGeometry(0.2 * s, 0.26 * s, 0.1 * s, 10), { at: [hc[0] - 0.02, hc[1] + 0.3 * s, 0], color: '#1b4f72' });
  } else if (!d.open) {
    // a carved scroll at the stem head
    k.add(torus(0.14, 0.05, 5, 10, Math.PI * 1.5), { at: [tip[0] + 0.02, tip[1] + 0.05, 0], rot: [0, 0, 0], color: P.trim, outline: 0.012 });
  }
}

// ---------------------------------------------------------------- rig
const rigCache = new Map();

/** Mast positions (x), heights and sail plan. */
function mastPlan(def, d) {
  const out = [];
  const n = d.masts;
  for (let m = 0; m < n; m++) {
    const x = n === 1 ? 0.05 * d.L : d.L * (0.28 - m * (0.56 / Math.max(1, n - 1)));
    const main = m === (n > 1 ? 1 : 0) || n === 1;
    const h = d.mastH * (n === 1 ? 1 : main ? 1 : m === 0 ? 0.9 : 0.8);
    const base = floorAt(d, (x + d.L / 2) / d.L);
    out.push({ x, h, base, main, m });
  }
  return out;
}

/** The tip of the bowsprit (or the stem head for ships without one). */
function bowTip(def, d) {
  const ft = topAt(d, 0.98);
  if (noSprit(def.figurehead) || d.open) return [d.L / 2 - 0.05, topAt(d, 1) + 0.15];
  return [d.L / 2 - 0.35 + 0.946 * 0.3 * d.L, ft - 0.1 + 0.324 * 0.3 * d.L];
}

function sailPlan(def, d, mast) {
  const sails = [];
  const rig = def.sail || 'square';
  const top = mast.h;
  if (rig === 'fore') {
    sails.push({ type: 'gaff', x: mast.x, y0: mast.base + 0.9, y1: top * 0.94, len: d.L * 0.4 });
    { const [tx, ty] = bowTip(def, d); sails.push({ type: 'jib', x: mast.x, y1: top * 0.9, tipX: tx, tipY: ty }); }
    return sails;
  }
  const w1 = d.B * (mast.main ? 1.6 : 1.4);
  if (d.L >= 6.8) {
    const yA = top * 0.56, yB = top * 0.88;
    sails.push({ type: 'square', x: mast.x, w: w1, y1: yA, y0: Math.max(mast.base + 1.6, yA - top * 0.36), emblem: mast.main });
    sails.push({ type: 'square', x: mast.x, w: w1 * 0.78, y1: yB, y0: yA + 0.18 });
  } else {
    const y1 = top * 0.86;
    sails.push({ type: 'square', x: mast.x, w: d.open ? d.B * 1.5 : w1, y1, y0: Math.max(mast.base + (d.open ? 1.0 : 1.4), y1 - top * 0.58), emblem: mast.main });
  }
  // (no bowsprit with a figurehead: so no jib either — the foremast carries its square sails alone)
  if (mast.m === 0 && d.masts > 1 && !d.open && !noSprit(def.figurehead)) { const [tx, ty] = bowTip(def, d); sails.push({ type: 'jib', x: mast.x, y1: top * 0.72, tipX: tx, tipY: ty }); }
  return sails;
}

/** Static masts, tops and crow's nest (one merged mesh). */
function mastGeometry(def, d, plan) {
  const key = `${def.length}|${def.beam}|${def.masts}|${def.sail}`;
  let g = rigCache.get(key);
  if (g) return g;
  const k = new Mesher();
  const wood = '#5d4037';
  for (const m of plan) {
    const r = 0.05 + d.L * 0.011;
    k.add(cyl(r * 0.55, r, m.h - m.base + 0.3, 8), { at: [m.x, m.base - 0.3, 0], color: wood, outline: 0.015 });
    k.add(new THREE.SphereGeometry(r * 0.8, 6, 4), { at: [m.x, m.h + 0.05, 0], color: '#d4ac0d' });
    if (d.L >= 6.8) {
      // a top (platform) on each mast
      k.add(box(0.7, 0.07, 0.9), { at: [m.x, m.h * 0.56 + 0.1, 0], color: shade(wood, 0.1), outline: 0.012 });
    }
    if (m.main && d.L >= 5.5) {
      // crow's nest
      const y = m.h * 0.8;
      k.add(cyl(0.42, 0.34, 0.5, 10, true), { at: [m.x, y, 0], color: '#8d6e4a', double: true, outline: 0.015 });
      k.add(cyl(0.34, 0.34, 0.05, 10), { at: [m.x, y, 0], color: '#6d4c33' });
      k.add(torus(0.42, 0.03, 4, 12), { at: [m.x, y + 0.5, 0], rot: [Math.PI / 2, 0, 0], color: '#5d4037' });
    }
    // mast hoops of rope
    for (let y = m.base + 1.2; y < m.h * 0.5; y += 0.9) k.add(torus(r * 1.05, 0.02, 3, 8), { at: [m.x, y, 0], rot: [Math.PI / 2, 0, 0], color: '#c8b89a' });
  }
  g = k.build(true);
  rigCache.set(key, g);
  return g;
}

/** The big ships' masts, tops and bowsprit (cached per ship type). */
function bigRigGeometry(def, d, plan) {
  const key = `big|${def.length}|${def.beam}|${def.masts}|${noSprit(def.figurehead) ? 'ns' : ''}`;
  let g = rigCache.get(key);
  if (!g) { g = bigMastGeometry(def, d, plan); rigCache.set(key, g); }
  return g;
}

// ---------------------------------------------------------------- textures
function sailTexture(kind, jr, sailColor) {
  const { ctx: g, tex } = canvasTexture(256, 256);
  const bg = kind === 'marine' ? '#f5f6fa' : sailColor || '#efe6cf';
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(80,60,40,0.22)'; g.lineWidth = 3;
  for (let x = 32; x < 256; x += 42) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.strokeStyle = 'rgba(80,60,40,0.35)'; g.lineWidth = 5;
  g.strokeRect(2, 2, 252, 252);
  if (kind === 'marine') {
    g.setTransform(140, 0, 0, 140, 128, 150);
    drawMarineEmblem(g, 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1b4f72'; g.font = 'bold 40px Nunito, "Trebuchet MS", sans-serif'; g.textAlign = 'center';
    g.fillText('MARINE', 128, 70);
  } else if (jr) {
    // (painted on the canvas as the flag is, in the flag's own colour: the skull dark on the sail, its eyes the sail showing through)
    g.setTransform(150, 0, 0, 150, 128, 132);
    drawJollyRoger(g, { ...jr, color: jr.bg || '#141414' }, 1, bg);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  tex.needsUpdate = true;
  return tex;
}

function flagTexture(kind, jr) {
  const { ctx: g, tex } = canvasTexture(128, 96);
  const bg = kind === 'marine' ? '#f5f6fa' : jr?.bg || '#141414';
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 96);
  g.setTransform(70, 0, 0, 70, 64, 50);
  if (kind === 'marine') drawMarineEmblem(g, 1); else if (jr) drawJollyRoger(g, jr, 1, bg);
  tex.needsUpdate = true;
  return tex;
}

/** A subdivided triangle (a, b, c) for fore-and-aft sails. */
function triGeometry(a, b, c, n = 5) {
  const pos = [], uv = [], idx = [];
  const row = [];
  for (let i = 0; i <= n; i++) {
    row.push(pos.length / 3);
    for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n, w = 1 - u - v;
      pos.push(a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const p = row[i] + j, q = row[i + 1] + j;
      idx.push(p, q, p + 1);
      if (j < n - i - 1) idx.push(q, q + 1, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A ship's wheel (shared per ship shape), about its hub, its axle fore and
 * aft (x): it turns about x as she's steered (ShipView). Spoke i stands i/8
 * of the way round from the top, toward starboard — where the helmsman's
 * hands hold it (hull.js wheelSpec, chars3d.js).
 */
function wheelGeometry(def, d) {
  const P = d.big ? bigPalette(def) : null, key = d.big ? `wheel|big|${P.trim.getHexString()}` : 'wheel|small';
  let g = rigCache.get(key);
  if (g) return g;
  const k = new Mesher();
  if (d.big) wheelParts(k, P, wheelSpec(d).R);
  else {
    const R = wheelSpec(d).R;
    k.save(); k.rotateY(Math.PI / 2);
    k.add(torus(R, 0.03, 5, 18), { color: '#7b5230', outline: 0.008 });
    for (let i = 0; i < 8; i++) k.add(box(0.035, R + 0.16, 0.035), { rot: [0, 0, i / 8 * Math.PI * 2], color: '#7b5230' });
    k.add(cyl(0.07, 0.07, 0.08, 8), { at: [0, 0, -0.04], rot: [Math.PI / 2, 0, 0], color: '#d4ac0d' });
    k.restore();
  }
  g = k.build(true);
  rigCache.set(key, g);
  return g;
}

/**
 * An oar (shared per rowboat type): built along +z from the grip, through
 * the rowlock at the origin, out to the blade — square to the stroke (its
 * flat faces fore and aft) until it's turned about the loom to feather.
 */
function oarGeometry(d) {
  const r = d.row, key = `oar|${r.inboard}|${r.outboard}`;
  let g = rigCache.get(key);
  if (g) return g;
  const k = new Mesher();
  k.add(cyl(0.02, 0.024, r.inboard + r.outboard - 0.42, 6), { at: [0, 0, -r.inboard], rot: [Math.PI / 2, 0, 0], color: '#b58a55', outline: 0.008 });
  k.add(cyl(0.028, 0.028, 0.16, 6), { at: [0, 0, -r.inboard], rot: [Math.PI / 2, 0, 0], color: '#6d4c33' }); // the grip
  k.add(box(0.02, 0.15, 0.46), { at: [0, -0.075, r.outboard - 0.23], color: '#c9a06a', outline: 0.008 }); // the blade
  k.add(cyl(0.03, 0.03, 0.05, 6), { at: [0, 0, -0.025], rot: [Math.PI / 2, 0, 0], color: '#4e4e4e' }); // the collar at the rowlock
  g = k.build(true);
  rigCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- the view
const REST_OAR = { a: -1.15, b: 0.12, f: 1 }; // (trailing aft alongside, blades out of the water)
const SOLID = () => vcMat();
const GHOST = () => vcMat({ transparent: true, opacity: 0.15, depthWrite: false });

// ---------------------------------------------------------------- stand-in crew
// Plain figures for a ship's company at a distance: whoever has the helm (at
// the oars, in a rowboat) and a couple of hands on deck, dressed for the ship.
const CREW_DRESS = {
  marine: { top: '#f5f6fa', bottom: '#1b4f72', hat: '#f5f6fa' },
  pirate: { top: '#37474f', bottom: '#4e342e', hat: '#b71c1c' },
  merchant: { top: '#8d6e63', bottom: '#5d4037', hat: '#6d4c41' },
  fishing: { top: '#607d8b', bottom: '#37474f', hat: '#e0b040' },
};
const CREW_SKIN = ['#f1c9a0', '#d7a47a', '#a1704f', '#e8b48a', '#8d5a3c'];
function standInCrew(s, d) {
  const k = new Mesher();
  const kind = s.traffic?.kind || 'merchant';
  const D = CREW_DRESS[kind] || CREW_DRESS.merchant;
  const seed = Math.abs(Math.round((s.seed || 0) * 97)) || 0;
  // (clear of the masts and the hatch)
  const clear = (t) => {
    for (let n = 0; n < 12; n++) {
      const u = xAt(d, t);
      if (d.mastU.every((mu) => Math.abs(u - mu) > d.mastR + 0.7) && !(d.hatchT !== undefined && Math.abs(t - d.hatchT) < 0.05)) return t;
      t += 0.035;
    }
    return t;
  };
  const figure = (t, v, face, i, seated = false) => {
    const u = xAt(d, t), y = floorAt(d, t, v);
    const skin = CREW_SKIN[(seed + i * 3) % CREW_SKIN.length];
    k.save(); k.translate(u, y, v); k.rotateY(face);
    if (seated) {
      // on the thwart at the oars, facing aft
      const sh = d.row?.seatH ?? 0.3;
      k.add(box(0.5, 0.14, 0.34), { at: [0.2, sh + 0.08, 0], color: D.bottom });
      k.add(box(0.14, sh + 0.1, 0.3), { at: [0.45, (sh + 0.1) / 2, 0], color: D.bottom });
      k.add(box(0.26, 0.58, 0.42), { at: [0, sh + 0.45, 0], color: D.top, outline: 0.02 });
      k.add(box(0.44, 0.1, 0.1), { at: [0.22, sh + 0.55, 0.2], color: D.top });
      k.add(box(0.44, 0.1, 0.1), { at: [0.22, sh + 0.55, -0.2], color: D.top });
      k.add(new THREE.SphereGeometry(0.13, 7, 5), { at: [0, sh + 0.9, 0], color: skin });
      k.add(box(0.28, 0.07, 0.28), { at: [0, sh + 1.02, 0], color: D.hat });
    } else {
      for (const z of [-0.1, 0.1]) k.add(box(0.15, 0.84, 0.15), { at: [0, 0.42, z], color: D.bottom });
      k.add(box(0.26, 0.6, 0.44), { at: [0, 1.14, 0], color: D.top, outline: 0.02 });
      for (const z of [-0.28, 0.28]) k.add(box(0.12, 0.58, 0.12), { at: [0.02, 1.12, z], color: D.top });
      k.add(new THREE.SphereGeometry(0.13, 7, 5), { at: [0, 1.6, 0], color: skin });
      k.add(box(0.3, 0.08, 0.3), { at: [0, 1.73, 0], color: D.hat });
    }
    k.restore();
  };
  if (d.row) figure(d.row.seatT, 0, Math.PI, 0, true);
  else {
    // at the wheel, facing forward; then the hands at their stations
    const hp = helmPoint(s.def);
    figure(Math.min(0.97, (hp.x - 0.35 + d.L / 2) / d.L), 0, 0, 0);
    const hands = d.L > 9 ? 2 : 1;
    const B = d.B;
    const at = [[0.4, 0.26], [0.62, -0.28]];
    for (let i = 0; i < hands; i++) figure(clear(at[i][0]), at[i][1] * B, (i % 2 ? -1 : 1) * 1.2, i + 1);
  }
  const m = new THREE.Mesh(k.build(false), SOLID());
  m.castShadow = true;
  m.name = 'standInCrew';
  return m;
}

/** Is this the Going Merry (the caravel Kaya gives you: there's only her)? */
export const isMerry = (s) => /going merry/i.test(s?.name || '');

/**
 * Sails that move like cloth: each vertex weighted by how free it is (0 where
 * it's bound — to the yard, the mast, its corners), and in the vertex shader
 * ripples run across it with the wind and gusts breathe its belly in and out
 * (`U`: the ship's clock, how hard the wind works the cloth, the gust; set
 * in ShipView.update; `axis` the way the sail bellies).
 */
function clothify(mesh, U, tri) {
  const g = mesh.geometry, uv = g.attributes.uv, n = uv.count, w = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    // (a square sail is lashed along its yard and sheeted at its foot's
    // corners — its foot works most; a gaff sail and a jib are bound along
    // their edges)
    w[i * 2] = tri ? 27 * u * v * Math.max(0, 1 - u - v) : 4 * u * (1 - u) * (1 - v * v);
    w[i * 2 + 1] = u;
  }
  g.setAttribute('aCloth', new THREE.BufferAttribute(w, 2));
  // (how fast u runs across the cloth, in metres: the ripples' slope, to
  // shade them, from the first triangle — u is linear over the sail)
  const P = g.attributes.position, ix = g.index ? [0, 1, 2].map((k) => g.index.getX(k)) : [0, 1, 2];
  const p0 = new THREE.Vector3().fromBufferAttribute(P, ix[0]), e1 = new THREE.Vector3().fromBufferAttribute(P, ix[1]).sub(p0), e2 = new THREE.Vector3().fromBufferAttribute(P, ix[2]).sub(p0);
  const du1 = uv.getX(ix[1]) - uv.getX(ix[0]), du2 = uv.getX(ix[2]) - uv.getX(ix[0]);
  const a11 = e1.dot(e1), a12 = e1.dot(e2), a22 = e2.dot(e2), det = a11 * a22 - a12 * a12 || 1;
  const gu = e1.clone().multiplyScalar((du1 * a22 - du2 * a12) / det).add(e2.clone().multiplyScalar((du2 * a11 - du1 * a12) / det));
  const mat = mesh.material, base = THREE.Material.prototype.onBeforeCompile;
  mat.onBeforeCompile = function (sh, r) {
    base?.call(this, sh, r);
    Object.assign(sh.uniforms, { uClothT: U.t, uClothAmp: U.amp, uClothGust: U.gust, uClothAxis: { value: tri ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0) }, uClothDu: { value: gu } });
    // two travelling ripples down the cloth; the normal tipped by their slope,
    // and the folds they make shaded in bands (the toon light alone, in two
    // tones, would hardly show them) running across the sail as it works
    sh.vertexShader = 'attribute vec2 aCloth;\nuniform float uClothT;\nuniform float uClothAmp;\nuniform float uClothGust;\nuniform vec3 uClothAxis;\nuniform vec3 uClothDu;\nvarying float vClothFold;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float clA = uClothT * 4.6 - aCloth.y * 7.0 + position.y * 0.35, clB = uClothT * 7.3 - aCloth.y * 12.0 - position.y * 0.6;
      float clWave = sin(clA) * 0.6 + sin(clB) * 0.4, clH = uClothAmp * aCloth.x;
      {
        float across = cos(clA) * -4.2 + cos(clB) * -4.8;
        vClothFold = clH * across * length(uClothDu);
        vec3 slope = clH * (across * uClothDu + vec3(0.0, cos(clA) * 0.21 - cos(clB) * 0.24, 0.0));
        slope -= uClothAxis * dot(slope, uClothAxis);
        objectNormal = normalize(objectNormal - dot(objectNormal, uClothAxis) * slope * 1.6);
      }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += uClothAxis * (dot(transformed, uClothAxis) * (uClothGust - 1.0) + clWave * clH);`);
    sh.fragmentShader = 'varying float vClothFold;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - 0.13 * smoothstep(0.04, 0.16, vClothFold) + 0.05 * smoothstep(0.06, 0.18, -vClothFold);`);
  };
  mat.customProgramCacheKey = () => 'sailcloth';
}

/**
 * Her build as she's drawn: her class, painted as her owner chose (hull
 * colour, figurehead — see ui/shipDesigner.js); and a caravel carries the
 * Going Merry's ram's head only if she's the Merry (any other has a carved
 * scroll at her stem).
 */
export function paintedDef(s) {
  let def = s.def;
  const P = s.paint;
  if (P && def.sail !== 'marine' && !def.special) def = { ...def, ...(P.color ? { color: P.color } : {}), ...(P.figurehead ? { figurehead: P.figurehead } : {}) };
  if (def.figurehead === 'ram' && !isMerry(s)) def = { ...def, figurehead: 'scroll' };
  return def;
}

export class ShipView {
  constructor(s) {
    this.ship = s;
    const def = paintedDef(s);
    const d = shipDims(def);
    this.d = d;
    const root = new THREE.Group();
    root.name = 'ship:' + (s.type || '');
    // hull (shared per ship type)
    const hull = new THREE.Mesh(hullGeometry(def), SOLID());
    hull.castShadow = true; hull.receiveShadow = true;
    root.add(hull);
    this.hull = hull;
    // below decks and in the cabins (only drawn when the camera's close by)
    const ig = interiorGeometry(def);
    if (ig) {
      this.inside = new THREE.Mesh(ig.main, SOLID());
      // (the decks over the rooms keep the sun out: their undersides and the linings cast the shadows)
      this.inside.receiveShadow = true;
      this.inside.castShadow = true;
      this.inside.visible = false;
      // (those undersides take none: the sun never reaches them, and the shadow of the
      // wheel, say, on the deck above isn't to show through onto the cabin's ceiling)
      this.overhead = new THREE.Mesh(ig.overhead, SOLID());
      this.overhead.receiveShadow = false;
      this.overhead.castShadow = true;
      this.inside.add(this.overhead);
      // (the treasure chest in her hold: her own, so it can go once it's emptied)
      if (ig.chest) {
        this.chest = new THREE.Mesh(ig.chest, SOLID());
        this.chest.receiveShadow = true;
        this.chestAt = ig.chestAt;
        this.inside.add(this.chest);
      }
      root.add(this.inside);
    }
    // masts (a rowboat has none)
    const plan = d.big ? bigMastPlan(d) : mastPlan(def, d);
    this.rig = new THREE.Mesh(d.big ? bigRigGeometry(def, d, plan) : mastGeometry(def, d, plan), SOLID());
    this.rig.castShadow = true;
    this.rig.visible = plan.length > 0;
    root.add(this.rig);
    // yards + sails per mast (they brace to the wind around the mast)
    const kind = this.flagKind();
    const sailCol = kind === 'marine' || def.sail === 'marine' ? '#f5f6fa' : s.paint?.sail || s.sailColor || '#efe6cf';
    this.sails = [];
    this.braces = [];
    this.ownMats = [];
    this.cloth = { t: { value: 0 }, amp: { value: 0 }, gust: { value: 1 } };
    const own = (m) => { this.ownMats.push(m); return m; };
    this.ghostables = [];
    const boxes = [];
    const yardK = new Mesher();
    for (const m of plan) {
      const grp = new THREE.Group();
      grp.position.set(m.x, 0, 0);
      root.add(grp);
      this.braces.push(grp);
      const yk = new Mesher();
      for (const sp of (d.big ? bigSailPlan(def, d, m) : sailPlan(def, d, m))) {
        // (the room each sail takes, bellied out — from its mast, turning with
        // the yards as they brace round: a third-person camera keeps out of it;
        // a gaff sail is there furled or set)
        if (sp.type === 'square') boxes.push({ m: m.x, u0: -0.4, u1: 1.1, h0: sp.y0, h1: sp.y1 + 0.2, v: sp.w * 0.5 + 0.1, braced: true });
        else if (sp.type === 'gaff') boxes.push({ m: m.x, u0: -sp.len - 0.2, u1: 0.4, h0: sp.y0, h1: sp.y1, v: 0.6, braced: true, always: true });
        else if (sp.type === 'jib') boxes.push({ m: m.x, u0: 0, u1: sp.tipX - m.x, h0: Math.min(sp.tipY, sp.y1 - 1), h1: sp.y1, v: 0.6 });
        if (sp.type === 'square') {
          const sw = sp.w, sh = sp.y1 - sp.y0, yr = sp.yardR || 0.05;
          yk.add(cyl(yr * 0.7, yr, sw * 1.08, 6), { at: [0.1 + (d.big ? m.r * 1.2 + yr : 0), sp.y1 + 0.04, -sw * 0.54], rot: [Math.PI / 2, 0, 0], color: '#5d4037' });
          const geo = new THREE.PlaneGeometry(sw, sh, 10, 7);
          geo.rotateY(Math.PI / 2);
          const tex = sp.emblem && kind !== 'none' ? sailTexture(kind, s.jr, sailCol) : null;
          const mat = own(new THREE.MeshToonMaterial({ color: tex ? 0xffffff : sailCol, map: tex, side: THREE.DoubleSide }));
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(0.16 + (d.big ? m.r * 1.2 + (sp.yardR || 0) * 2 : 0), sp.y0 + sh / 2, 0);
          mesh.castShadow = true;
          mesh.userData.base = geo.attributes.position.array.slice();
          grp.add(mesh);
          clothify(mesh, this.cloth, false);
          this.sails.push({ mesh, sw, sh, kind: 'square' });
        } else if (sp.type === 'gaff') {
          const a = [0.12, sp.y0, 0], b = [0.12, sp.y1, 0], c = [-sp.len, sp.y0 + 0.05, 0];
          yk.add(cyl(0.035, 0.045, sp.len, 6), { at: [0.1, sp.y0 - 0.05, 0], rot: [0, 0, Math.PI / 2], color: '#5d4037' });
          const geo = triGeometry(a, b, c, 5);
          const mat = own(new THREE.MeshToonMaterial({ color: sailCol, side: THREE.DoubleSide }));
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.userData.base = geo.attributes.position.array.slice();
          grp.add(mesh);
          clothify(mesh, this.cloth, true);
          this.sails.push({ mesh, kind: 'fore', len: sp.len, y0: sp.y0, y1: sp.y1 });
        } else if (sp.type === 'jib') {
          // the jib is fixed to the hull (not braced)
          const a = sp.head ? [sp.head[0], sp.head[1], 0] : [m.x + 0.05, sp.y1, 0], b = [sp.tipX, sp.tipY, 0];
          const c = sp.clew ? [sp.clew[0], sp.clew[1], 0] : [m.x + 0.1, floorAt(d, (m.x + d.L / 2) / d.L) + 1.1, 0];
          const geo = triGeometry(a, b, c, 4);
          const mat = own(new THREE.MeshToonMaterial({ color: sailCol, side: THREE.DoubleSide }));
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          mesh.userData.base = geo.attributes.position.array.slice();
          root.add(mesh);
          clothify(mesh, this.cloth, true);
          this.sails.push({ mesh, kind: 'jib' });
        }
      }
      const ym = new THREE.Mesh(yk.build(false), SOLID());
      grp.add(ym);
      this.ghostables.push(ym);
    }
    void yardK;
    s.sailBoxes = boxes;
    // rigging lines
    this.lines = d.big ? this.lineSet(bigRigging(d, plan, def)) : this.rigging(def, d, plan);
    root.add(this.lines);
    // paddle wheels
    if (def.paddle) {
      const pk = new Mesher();
      // (on a big hull the wheels are bigger, and turn half in the water under their housings)
      const R = d.big ? 0.72 * d.B / 3.2 : 0.72;
      const k = R / 0.72, pw = 0.4 * k;
      pk.add(cyl(0.12 * k, 0.12 * k, pw, 8), { at: [0, 0, -pw / 2], rot: [Math.PI / 2, 0, 0], color: '#5d4037' });
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2, dx = -Math.sin(a), dy = Math.cos(a);
        for (const sz of [-1, 1]) pk.add(box(0.05 * k, R, 0.04 * k), { at: [0, 0, sz * pw * 0.42], rot: [0, 0, a], color: '#6d4c33' });
        pk.add(box(0.06 * k, 0.4 * k, pw * 0.95), { at: [dx * (R - 0.36 * k), dy * (R - 0.36 * k), 0], rot: [0, 0, a], color: '#8d6e4a', outline: 0.01 });
      }
      for (const sz of [-1, 1]) pk.add(torus(R, 0.035 * k, 4, 16), { at: [0, 0, sz * pw * 0.42], color: '#5d4037' });
      const geo = pk.build(false);
      this.paddles = [];
      const pt = 0.34, py = d.big ? R * 0.55 : d.deckY - 0.1;
      const pz = d.big ? hbAt(pt, d.B) * 0.985 + pw / 2 + 0.12 : hbAt(pt, d.B) + 0.2;
      const hk = new Mesher();
      for (const s2 of [-1, 1]) {
        const pm = new THREE.Mesh(geo, SOLID());
        pm.position.set(xAt(d, pt), py, s2 * pz);
        root.add(pm);
        this.paddles.push(pm);
        // the housing over the top of the wheel, against the hull
        if (d.big) {
          hk.save(); hk.translate(xAt(d, pt), py, s2 * pz); hk.rotateX(Math.PI / 2);
          hk.add(new THREE.CylinderGeometry(R + 0.15 * k, R + 0.15 * k, pw + 0.2, 16, 1, true, Math.PI / 2, Math.PI), { color: '#b07d48', double: true, outline: 0.015 });
          hk.restore();
        }
      }
      if (d.big) { const hm = new THREE.Mesh(hk.build(false), SOLID()); hm.castShadow = true; root.add(hm); }
    }
    // a rowboat's oars, swinging in their rowlocks with each stroke
    if (d.row) {
      this.oars = [];
      const r = d.row, og = oarGeometry(d);
      for (const side of [-1, 1]) {
        const m = new THREE.Mesh(og, SOLID());
        m.castShadow = true;
        m.position.set(r.lockU, r.lockH, side * r.lockV);
        m.rotation.order = 'YXZ';
        root.add(m);
        this.oars.push({ mesh: m, side });
      }
    }
    // the wheel, on its post: it turns as she's steered (and back as the helm comes amidships)
    const ws = wheelSpec(d);
    if (ws) {
      this.wheel = new THREE.Mesh(wheelGeometry(def, d), SOLID());
      this.wheel.castShadow = true;
      this.wheel.position.set(ws.u, ws.hub, 0);
      root.add(this.wheel);
    }
    // the masthead flag
    if (kind !== 'none' && plan.length) {
      const fs = d.big ? d.L / 11 : 1;
      const fg = new THREE.PlaneGeometry(1.1 * fs, 0.75 * fs, 5, 1);
      fg.translate(0.55 * fs, 0, 0);
      const fmat = own(new THREE.MeshToonMaterial({ map: flagTexture(kind, s.jr), side: THREE.DoubleSide }));
      const flag = new THREE.Mesh(fg, fmat);
      const mm = plan.find((p) => p.main) || plan[0];
      const mx = mm.x + (d.big ? mm.r * 1.7 : 0);
      flag.position.set(mx, mm.h + 0.35 * fs, 0);
      flag.userData.base = fg.attributes.position.array.slice();
      root.add(flag);
      this.flag = flag;
      if (d.big) {
        // the ensign, flying from the flagstaff at the taffrail
        const eg = fg.clone();
        const ens = new THREE.Mesh(eg, fmat);
        ens.position.set(-d.L / 2 + 0.5 - 3.4 * Math.sin(0.18) - 0.1, topAt(d, 0.01) + 3.4 * Math.cos(0.18) - 0.75 * fs * 0.5, 0);
        ens.userData.base = eg.attributes.position.array.slice();
        root.add(ens);
        this.ensign = ens;
      }
      const pole = new Mesher();
      pole.add(cyl(0.015 * fs, 0.02 * fs, 0.55 * fs, 4), { at: [mx, mm.h, 0], color: '#3e2723' });
      const pm = new THREE.Mesh(pole.build(false), SOLID());
      root.add(pm);
      this.ghostables.push(pm);
    }
    // her coating, for the dive to Fish-Man Island: a bubble round all of
    // her, masts and keel and all, blown the way Sabaody's coaters do it —
    // shimmering like the archipelago's soap bubbles, seen from on deck as
    // well as from outside
    if (s.coated) {
      const mh = Math.max(d.mastH || 0, 3);
      const bubble = new THREE.Mesh(COAT_GEO, coatMaterial());
      bubble.scale.set(d.L * 0.62 + 1, mh * 0.62 + 1.5, d.B * 0.5 + mh * 0.33 + 1);
      bubble.position.y = mh * 0.38;
      bubble.renderOrder = 3;
      root.add(bubble);
    }
    // hands on deck, seen from afar: a ship's real crew are only aboard (and
    // only drawn) within a stone's throw of you — past that she'd sail on with
    // nobody at her wheel (see update)
    if (s.traffic) root.add(this.standIns = standInCrew(s, d));
    this.root = root;
    this.kindKey = kind + ':' + JSON.stringify(s.jr || null) + ':' + !!s.coated + ':' + JSON.stringify(s.paint || null);
  }

  lineSet(pts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x3a2a1e, transparent: true, opacity: 0.85, fog: true });
    this.lineMat = mat;
    return new THREE.LineSegments(g, mat);
  }

  rigging(def, d, plan) {
    const pts = [];
    const L = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (const m of plan) {
      const t = (m.x + d.L / 2) / d.L;
      const hb = hbAt(t, d.B);
      const rail = topAt(d, t);
      // shrouds to both rails
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) L([m.x, m.h * 0.74, 0], [m.x - 0.15 - i * 0.2, rail, s * hb * 0.95]);
      // ratlines between the shrouds
      for (const s of [-1, 1]) for (let y = rail + 0.4; y < m.h * 0.62; y += 0.4) {
        const f = (m.h * 0.74 - y) / (m.h * 0.74 - rail);
        L([m.x - 0.15 * f, y, s * hb * 0.95 * f], [m.x - 0.75 * f, y, s * hb * 0.95 * f]);
      }
    }
    // stays: fore-and-aft between the mastheads, to the bow and to the stern
    for (let i = 0; i < plan.length; i++) {
      const m = plan[i];
      if (i === 0) { const [tx, ty] = bowTip(def, d); L([m.x, m.h, 0], [tx, ty, 0]); }
      else L([m.x, m.h * 0.95, 0], [plan[i - 1].x, plan[i - 1].h * 0.6, 0]);
      if (i === plan.length - 1) for (const s of [-1, 1]) L([m.x, m.h * 0.9, 0], [-d.L / 2 + 0.25, topAt(d, 0.02), s * hbAt(0.02, d.B) * 0.8]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x3a2a1e, transparent: true, opacity: 0.85, fog: true });
    this.lineMat = mat;
    return new THREE.LineSegments(g, mat);
  }

  flagKind() {
    const s = this.ship;
    if (s.def.sail === 'marine' || s.faction === 'marine' || (s.owner === 'player' && s.game?.state?.char?.faction === 'marine')) return 'marine';
    if (s.jr) return 'jr';
    return 'none';
  }

  /** True when the colours changed (e.g. the player founded a crew) and the view must be rebuilt. */
  stale() { return this.kindKey !== this.flagKind() + ':' + JSON.stringify(this.ship.jr || null) + ':' + !!this.ship.coated + ':' + JSON.stringify(this.ship.paint || null); }

  setGhost(on) {
    this.ghost = on;
    this.rig.material = on ? GHOST() : SOLID();
    this.rig.renderOrder = on ? 2 : 0;
    this.rig.castShadow = !on;
    for (const m of this.ghostables) { m.material = on ? GHOST() : SOLID(); m.renderOrder = on ? 2 : 0; }
    for (const sl of this.sails) {
      const mt = sl.mesh.material;
      mt.transparent = on; mt.opacity = on ? 0.16 : 1; mt.depthWrite = !on; mt.needsUpdate = true;
      sl.mesh.renderOrder = on ? 2 : 0;
      sl.mesh.castShadow = !on;
    }
    this.lines.material.opacity = on ? 0.18 : 0.85;
    this.lines.renderOrder = on ? 2 : 0;
    if (this.flag) {
      const mt = this.flag.material;
      mt.transparent = on; mt.opacity = on ? 0.3 : 1; mt.depthWrite = !on; mt.needsUpdate = true;
      this.flag.renderOrder = on ? 2 : 0;
      if (this.ensign) this.ensign.renderOrder = on ? 2 : 0;
    }
  }

  update(env, rx, rz, windAngle, ctx) {
    const s = this.ship;
    const r = this.root;
    // the foam trail on the water (a sibling of the ship, not riding it)
    // (its track handed to the sea, which draws the wake into its own surface:
    // the ribbon itself isn't shown — see water3d.js wakes)
    if (!this.wake) { this.wake = new WakeTrail({ n: 96, turn: 0.09, fadeIn: 1.2 }); this.wake.keepTrack = true; this.wake.mesh.visible = false; }
    if (r.parent && this.wake.mesh.parent !== r.parent) r.parent.add(this.wake.mesh);
    const v3 = ctx?.game?.view3d;
    if (v3 && ctx.world) {
      // from the stern while she's under way, spreading behind her
      const L = s.def.length, B = s.def.beam, sp = Math.abs(s.speed || 0);
      const src = !s.sunk && sp > 0.8 ? { x: s.x - Math.cos(s.heading) * L * 0.46, y: s.y - Math.sin(s.heading) * L * 0.46, h: s.heading, sp } : null;
      this.wake.update(src, env.time, v3.ox, v3.oy, ctx.world, (q, age) => {
        const k = Math.min(1, q.sp / 6), S = Math.max(0.3, Math.min(1, L / 18));
        // (a small boat's wake: narrow, spreading little and fading quickly — sized to her)
        return [B * 0.42 + age * (1.6 + L * 0.25) * (0.5 + k) * S, Math.pow(1 - age, 1.6 + (1 - S) * 1.5) * (0.35 + 0.65 * k) * (0.55 + 0.45 * S)];
      });
      // spray thrown up and out at her bow as she drives through the sea — the
      // faster she goes and the rougher it is, the more and the higher (near
      // the eye only: it's small)
      const fx = ctx.game.fx, dt = Math.min(0.25, Math.max(0, env.time - (this.sprayAt ?? env.time)));
      this.sprayAt = env.time;
      if (fx && !s.sunk && !s.lvl && sp > 1.5 && Math.hypot(ctx.world.dx(v3.ox, s.x), s.y - v3.oy) < 110) {
        const k = Math.min(1.4, (sp - 1.5) / 7), rough = env.storm || 0;
        // (as big as she is: a rowboat throws up a few fine drops, a galleon sheets of it)
        const S = Math.max(0.28, Math.min(1, L / 18)), Sv = Math.sqrt(S), small = !!s.def.oarsOnly || L < 8;
        // (water thrown up off her sides as she shoulders through it, all along her forward half)
        this.sideT = (this.sideT ?? Math.random()) - dt * (1.5 + k * 4) * (small ? 0.35 : 1);
        if (this.sideT <= 0) {
          this.sideT = 0.08 + Math.random() * 0.12;
          const c = Math.cos(s.heading), sn = Math.sin(s.heading), t = 0.55 + Math.random() * 0.35;
          const u = (t - 0.5) * L, out = hbAt(t, B) + 0.25, side = Math.random() < 0.5 ? -1 : 1;
          const bx = s.x + c * u - sn * side * out, by = s.y + sn * u + c * side * out;
          fx.burst(bx, by, Math.max(1, Math.round((2 + k * 4) * S)), { world: true, base: swellAt(bx, by) + 0.05, carry: [c * (s.speed || 0) * 0.6, sn * (s.speed || 0) * 0.6], sink: true, angle: s.heading + side * (Math.PI / 2 + 0.25), spread: 0.5, speed: (1.2 + k * 1.8) * Sv, z: 0.05, zJitter: 0.1 * S, vz: (1.4 + k * 1.8) * Sv, g: 9.8, life: (0.5 + k * 0.25) * Sv, size: (0.08 + k * 0.05) * S, color: ['#ffffff', '#eaf6ff', '#cfeaf8'], kind: 'drop', drag: 0.8 });
        }
        this.sprayT = (this.sprayT ?? Math.random()) - dt * (0.8 + k * 2.2 + rough * 2.5);
        if (this.sprayT <= 0) {
          this.sprayT = 0.18 + Math.random() * 0.3;
          const c = Math.cos(s.heading), sn = Math.sin(s.heading);
          // where her bow cuts the sea: just outside her planking at the
          // waterline (never over her deck), thrown up and out to either
          // side, carried on with her at first and falling astern of her as
          // it flies — clear of her side all the way, gone back into the sea
          const t = 0.9, u = (t - 0.5) * L, out = hbAt(t, B) + 0.35 + B * 0.02;
          const vx = c * (s.speed || 0) * 0.8, vy = sn * (s.speed || 0) * 0.8;
          for (const side of [-1, 1]) {
            const bx = s.x + c * u - sn * side * out, by = s.y + sn * u + c * side * out;
            fx.burst(bx, by, Math.max(1, Math.round((3 + k * 6 + rough * 6) * S)), { world: true, base: swellAt(bx, by) + 0.12 * S, carry: [vx, vy], sink: true, angle: s.heading + side * (Math.PI / 2 - 0.3), spread: 0.7, speed: (2.2 + k * 2.6 + rough * 2) * Sv, z: 0.12 * S, zJitter: 0.16 * S, vz: (2.2 + k * 2.6 + rough * 2.4) * Sv, g: 9.8, life: (0.65 + k * 0.3) * Sv, size: (0.1 + k * 0.07) * S, color: ['#ffffff', '#f1f8ff', '#d6efff'], kind: 'drop', drag: 0.7 });
          }
        }
      }
    }
    // from the helm of your own ship in first person the rig is see-through,
    // so you can steer (in third person you see her whole, from outside)
    const own = ctx?.game?.player?.ship === s && ctx.game.player.mode === 'sail' && ctx.mode !== 'third';
    if (own !== this.ghost) this.setGhost(own);
    // how fast she's swinging round (her wake and bow wave curve with it: water3d.js hullFoam)
    const dth = env.time - (this.hT ?? env.time);
    if (dth > 0 && dth < 0.5) {
      const r = Math.atan2(Math.sin(s.heading - this.hPrev), Math.cos(s.heading - this.hPrev)) / dth;
      this.yawSm += (r - this.yawSm) * (1 - Math.exp(-dth / 0.12));
    } else if (!(dth > 0)) this.yawSm = this.yawSm || 0;
    else this.yawSm = 0;
    this.hPrev = s.heading; this.hT = env.time;
    // the wheel, turned as far as her helm is over (game/ship.js steer)
    if (this.wheel) this.wheel.rotation.x = s.wheel || 0;
    // the oars, as the rower has them (see game/ship.js updateOars)
    if (this.oars) {
      const st = s.oars;
      for (const o of this.oars) {
        const q = st ? st[o.side > 0 ? 1 : 0] : REST_OAR;
        o.mesh.rotation.set(q.b, o.side > 0 ? q.a : Math.PI - q.a, q.f * Math.PI / 2);
      }
    }
    // (the stand-in hands: while her real crew aren't aboard to be seen — not
    // yet brought aboard, or too far off to be drawn; none once they're beaten)
    if (this.standIns) {
      const tr = s.traffic;
      let show = !s.sunk && !tr?.raided;
      if (tr?.crew) {
        const on = tr.crew.filter((a) => a.alive && a.deck?.ship === s);
        show = !s.sunk && on.length > 0 && !on.some((a) => v3?.actorViews?.has(a));
      }
      this.standIns.visible = show;
    }
    const t = env.time + (s.seed || 0);
    const sinking = s.sunk ? Math.min(1, s.sinkT / 4) : 0;
    // (riding the swell: shipBob, the same for the game — those aboard stand on her as she's drawn)
    r.position.set(rx, shipBob(s, env.time) - sinking * 3, rz);
    // (riding up or down Reverse Mountain, the bow points up or down the slope;
    // those aboard ride the same roll and pitch: hull.js shipLift)
    const [roll, pitch] = shipRock(s, env.time);
    r.rotation.set(roll, -s.heading, pitch, 'YXZ');
    // (her insides only from close by: aboard, or alongside)
    if (this.inside) {
      const cam = ctx?.camera;
      this.inside.visible = !!cam && cam.position.distanceTo(r.position) < this.d.L * 0.6 + 12;
      // (its shadows — the decks overhead darkening the rooms — only while you're in one)
      const pl = ctx?.game?.player;
      this.inside.castShadow = this.overhead.castShadow = !!(pl?.deck?.room && pl.deck.ship === s);
      // plundered: the emptied chest sinks away into the hold's shadows, shrinking as it goes
      // (your own ships carry no treasure chest: it's an NPC ship's plunder — see game/traffic.js)
      if (this.chest && (s.owner === 'player' || s.faction === 'player')) this.chest.visible = false;
      else if (this.chest) {
        const gone = s.chestGone !== undefined ? Math.min(1, ((ctx?.game?.time ?? 0) - s.chestGone) / 0.7) : 0;
        if (gone !== this.chestK) {
          this.chestK = gone;
          const k = 1 - gone * gone, [u, y, v] = this.chestAt;
          this.chest.visible = k > 0.02;
          // (scaled about its own foot, not the ship's middle)
          this.chest.scale.setScalar(Math.max(0.001, k));
          this.chest.position.set(u * (1 - k), y * (1 - k) - gone * 0.3, v * (1 - k));
        }
      }
    }
    // yards brace round to the wind; sails fill
    const relA = (windAngle || 0) - s.heading;
    const brace = Math.max(-0.5, Math.min(0.5, Math.sin(relA) * 0.45));
    for (const b of this.braces) b.rotation.y = -brace;
    s.brace = brace;
    const rel = Math.cos(relA);
    const set = s.sailSet ?? 0.5;
    const billow = (0.15 + set * 0.45) * (0.6 + 0.4 * Math.max(0, rel));
    const side = Math.sin(relA) >= 0 ? 1 : -1;
    // the cloth working in the wind: harder the stronger it blows and the more
    // she's set, flogging when she heads up into it; a gust now and then
    // filling her out, the ripples running quicker in a breeze
    {
      const wind = Math.min(2, Math.max(0, env.windStrength ?? 1)), now = env.time || 0, U = this.cloth;
      U.t.value = (now * (0.75 + wind * 0.35)) % 3600;
      U.amp.value = s.sunk ? 0 : (0.04 + 0.09 * wind) * (0.35 + set) * (1 + Math.max(0, -rel) * 2.2) * Math.max(0.6, this.d.B / 6);
      U.gust.value = 1 + 0.08 * wind * Math.sin(now * 1.3 + this.d.L) * Math.sin(now * 0.47);
    }
    // (a sail's shape only changes with the wind and how far it's set: reshaped
    // and sent to the GPU again only then)
    for (const sl of this.sails) {
      sl.mesh.visible = set > 0.05 || sl.kind === 'fore';
      const a = sl.mesh.geometry.attributes.position;
      const base = sl.mesh.userData.base;
      if (sl.kind === 'square') {
        sl.mesh.scale.y = 0.35 + set * 0.65;
        if (Math.abs((sl.shaped ?? -9) - billow) < 0.002) continue;
        sl.shaped = billow;
        for (let i = 0; i < a.count; i++) {
          const z = base[i * 3 + 2], y = base[i * 3 + 1];
          const k = 1 - (z / (sl.sw / 2)) ** 2;
          const kv = 1 - (y / (sl.sh / 2)) ** 2 * 0.5;
          a.array[i * 3] = base[i * 3] + billow * k * kv;
        }
        sl.mesh.geometry.computeVertexNormals();
      } else {
        // fore-and-aft sails belly out to leeward
        const amt = (0.1 + set * 0.35) * side * (sl.kind === 'jib' ? 0.6 : 1);
        if (sl.kind === 'fore') sl.mesh.scale.y = 1;
        if (Math.abs((sl.shaped ?? -9) - amt) < 0.002) continue;
        sl.shaped = amt;
        const uv = sl.mesh.geometry.attributes.uv.array;
        for (let i = 0; i < a.count; i++) {
          const uu = uv[i * 2], vv = uv[i * 2 + 1], w = Math.max(0, 1 - uu - vv);
          a.array[i * 3 + 2] = base[i * 3 + 2] + amt * 27 * uu * vv * w * 0.8;
        }
        sl.mesh.geometry.computeVertexNormals();
      }
      a.needsUpdate = true;
    }
    // (far off, the flags wave at a lower rate)
    this.frame = (this.frame || 0) + 1;
    if (this.flag && (rx * rx + rz * rz < 120 * 120 || this.frame % 4 === 0)) {
      const a = this.flag.geometry.attributes.position, base = this.flag.userData.base;
      for (let i = 0; i < a.count; i++) {
        const x = base[i * 3];
        a.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 7 + x * 4) * 0.09 * x;
      }
      a.needsUpdate = true;
      this.flag.rotation.y = (s.heading - (windAngle || 0)) + Math.PI;
      if (this.ensign) {
        const e = this.ensign.geometry.attributes.position, eb = this.ensign.userData.base;
        for (let i = 0; i < e.count; i++) e.array[i * 3 + 2] = eb[i * 3 + 2] + Math.sin(t * 6 + eb[i * 3] * 3) * 0.12 * eb[i * 3];
        e.needsUpdate = true;
        this.ensign.rotation.y = this.flag.rotation.y;
      }
    }
    if (this.paddles) {
      const spin = (s.speed || 0) * 1.4 + (s.rowing ? 2 : 0);
      this.spin = (this.spin || 0) + spin * 0.016;
      for (const p of this.paddles) p.rotation.z = -this.spin;
    }
  }

  dispose() {
    this.wake?.dispose();
    this.root.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
    for (const m of this.ownMats) { m.map?.dispose(); m.dispose(); }
    this.lineMat?.dispose();
  }
}
