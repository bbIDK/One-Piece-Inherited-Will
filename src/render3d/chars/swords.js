// Every sword its own model, built from its own look: a katana's blade with
// its hamon (Kitetsu's blue flames, Shusui's black steel, Enma's dark blade
// in its red haze), its wrap with the diamond windows of the ray skin
// (Wado's white hilt, Kitetsu's red), its guard (round, flower, cross,
// Enma's chrysanthemum, Kikoku's fur trim) and collar; a pirate's cutlass
// with its brass D-guard; a Marine's saber; a wooden bokken; Law's long
// nodachi; Yoru, Mihawk's great black cross-hilted blade, worn on the back.
//
// Laid out along +X from the grip (the fist closes round x = 0), the edge
// toward -Y — the side a downward cut leads with (rig.js turns the blade
// about +Z as the pose's wF grows, so a cut from overhead sweeps -Y first) —
// and the flat facing ±Z; a curved blade bows toward its back (+Y), the
// edge on the outside of the curve. Colours follow the item icons
// (render/icons.js) and the anime: Wado's white hilt and saya, Kitetsu's
// red saya, Shusui's black blade and black saya with pink blossoms, Enma's
// lilac with gold flowers, Shigure's green and white saya, Kikoku's black
// saya with white crosses. build.js hangs the saya at the hip from the same
// looks (and Yoru on the back).
import { Builder, Prim, M, mul, between, THREE } from './geom.js';

const STEEL = { blade: '#c3cdd6', edge: '#f1f5f8', back: '#7f8c98', ridge: '#a3afba' };
const DEFAULT = {
  shape: 'katana', len: 0.84, hilt: 0.24, sori: 0.032, ...STEEL, hamon: null, hamonStyle: 'wave',
  wrap: '#2d2a32', diamond: '#b8a07a', tsuba: '#d4ac0d', tsubaShape: 'round', habaki: '#c9a24e', kashira: '#3a3530',
  saya: '#2c3e50', fit: '#c9a24e',
};

/** The looks, by item id (and a few blades only their owners carry: Law's Kikoku). */
export const SWORD_LOOKS = {
  // ---- the plain ones
  wooden_sword: { shape: 'bokken', len: 0.82, blade: '#b88a55', edge: '#cfa572', back: '#93693d', ridge: '#a67b49', wrap: '#5d3b20', diamond: '#8a6440', tsuba: '#2b2523', saya: null },
  rusty_katana: { blade: '#a39a8d', edge: '#cbc4b8', back: '#776f65', ridge: '#91887c', rust: '#8a4b24', wrap: '#4d3a2c', diamond: '#8a7a64', tsuba: '#5e5045', habaki: '#8a6a44', saya: '#3b2d23', fit: '#6b5a4a', hamonStyle: 'straight' },
  cutlass: { shape: 'cutlass', len: 0.7, hilt: 0.19, wrap: '#3b2a22', guard: '#c9a24e', saya: '#4a3326', fit: '#c9a24e' },
  marine_saber: { shape: 'saber', len: 0.8, hilt: 0.17, wrap: '#f1ece0', guard: '#e2b64a', saya: '#1e252c', fit: '#e2b64a' },
  fine_katana: { wrap: '#2c3b5c', diamond: '#e9e1c8', tsuba: '#c9a04a', habaki: '#d8b04f', kashira: '#c9a04a', saya: '#1a1f2b', fit: '#c9a04a' },
  wano_katana: { len: 0.88, wrap: '#3d2b5a', diamond: '#e9e1c8', tsuba: '#c9a04a', tsubaShape: 'flower', habaki: '#d8b04f', kashira: '#c9a04a', saya: '#4a1c1c', fit: '#c9a04a', hamonStyle: 'midare' },
  // ---- the named blades
  yubashiri: { len: 0.86, wrap: '#1d1b20', diamond: '#c9a24e', tsuba: '#c2a24f', tsubaShape: 'cross', habaki: '#c9a24e', kashira: '#c9a24e', saya: '#141217', fit: '#c9a24e', bands: [0.14, 0.5, 0.86], hamonStyle: 'midare' },
  sandai_kitetsu: { wrap: '#9c2a1f', diamond: '#3a1a18', tsuba: '#d8ad46', tsubaShape: 'cross', habaki: '#c9a24e', kashira: '#d8ad46', saya: '#a8231c', fit: '#d8ad46', hamon: '#3d6fd1', hamonStyle: 'flame' },
  shigure: { wrap: '#2f6b4f', diamond: '#d6dfd3', tsuba: '#3d8a5f', tsubaShape: 'flower', habaki: '#b8bec4', kashira: '#3d8a5f', saya: '#2f7a55', saya2: '#eef0ea', fit: '#b8bec4', dots: '#2f7a55', hamonStyle: 'wave' },
  wado_ichimonji: { wrap: '#f4f1ea', diamond: '#d4d9de', tsuba: '#e2b64a', habaki: '#e8c35a', kashira: '#e2b64a', saya: '#f1eee6', fit: '#e2b64a', hamonStyle: 'straight' },
  shusui: { len: 0.9, blade: '#2b2731', edge: '#5d566a', back: '#1b1820', ridge: '#24202a', wrap: '#7a1f24', diamond: '#1f1a22', tsuba: '#d8a93f', tsubaShape: 'flower', habaki: '#d8a93f', kashira: '#d8a93f', saya: '#18151b', fit: '#d8a93f', blossoms: '#f2a7c3', hamonStyle: 'midare' },
  enma: { len: 1.0, sori: 0.05, blade: '#3a2230', edge: '#8e3a48', back: '#25151f', ridge: '#30192a', hamon: '#e0584f', hamonStyle: 'flame', wrap: '#4a2a63', diamond: '#a58bc9', tsuba: '#d8ad46', tsubaShape: 'kiku', habaki: '#b8963e', kashira: '#d8ad46', saya: '#6a4a8c', fit: '#d8ad46', flowers: '#e2b64a', aura: '#c0283a' },
  yoru: { shape: 'yoru', len: 1.2, hilt: 0.34, onBack: true, blade: '#2e2a35', edge: '#6b6478', ridge: '#221f28', hamonStyle: 'straight', saya: null },
  nb_shibireru: { blade: '#e8dfa0', edge: '#fffbe0', back: '#b7ad6a', ridge: '#d4ca88', hamon: '#fff38a', hamonStyle: 'bolt', wrap: '#2b2b33', diamond: '#f2d33a', tsuba: '#f2d33a', habaki: '#c9a24e', saya: '#2b2b33', fit: '#f2d33a', bands: [0.2, 0.45, 0.7], aura: '#fff59d' },
  p2_funkfreed: { shape: 'saber', len: 0.86, hilt: 0.17, blade: '#c9d0d6', wrap: '#8d8f9a', guard: '#9aa3ad', saya: '#5c6170', fit: '#9aa3ad' },
  kikoku: { shape: 'nodachi', len: 1.15, hilt: 0.32, wrap: '#5a3b82', diamond: '#8f72b8', rings: '#f4f1ea', kashira: '#e8c23a', tsuba: '#2a2530', tsubaShape: 'fur', fur: '#f4f1ea', habaki: '#c9a24e', saya: '#151318', fit: '#c9a24e', crosses: '#f4f1ea', rope: '#c62828', hamonStyle: 'midare' },
};
// (a blade with no id — a summons, an old save — by the hand it's in: as they always were)
const SLOT = [
  { saya: '#ecf0f1' },
  { wrap: '#1b2631', saya: '#2c3e50' },
  { wrap: '#fafafa', tsuba: '#b71c1c', saya: '#c0392b' },
];
const LOOKS = new Map();
/** The full look of sword `id` (worn in hand `slot` when it has none). */
export function swordLook(id, slot = 0) {
  const key = id || `#${slot}`;
  let L = LOOKS.get(key);
  if (!L) {
    L = { ...DEFAULT, ...(SWORD_LOOKS[id] || SLOT[slot] || SLOT[0]) };
    if (L.shape === 'cutlass' || L.shape === 'saber') L.sori = L.shape === 'cutlass' ? 0.075 : 0.035;
    if (SWORD_LOOKS[id]?.sori) L.sori = SWORD_LOOKS[id].sori;
    LOOKS.set(key, L);
  }
  return L;
}

// ------------------------------------------------------------------ blade
const HAKI = { blade: '#15121b', edge: '#5b4590', back: '#0b0a0f', ridge: '#1d1826', hamon: null };
const tri = (x) => 1 - 4 * Math.abs(x - Math.floor(x + 0.5));
/** The hamon line: how far up the blade from the edge it runs at u (0 at the collar, 1 at the point), in widths. */
function hamonDepth(style, u) {
  let k;
  if (style === 'straight') k = 0.3;
  else if (style === 'flame') k = 0.24 + 0.24 * Math.pow(Math.max(0, Math.sin(u * Math.PI * 9 + 0.6)), 3);
  else if (style === 'midare') k = 0.31 + 0.07 * Math.sin(u * 31 + 1) + 0.05 * Math.sin(u * 73);
  else if (style === 'bolt') k = 0.3 + 0.12 * tri(u * 7);
  else if (style === 'bevel') k = 0.2;
  else if (style === 'none') return 0;
  else k = 0.31 + 0.08 * Math.sin(u * Math.PI * 2 * 5.5);
  // (the boshi: the line eases round into the point)
  return u > 0.88 ? k + (0.34 - k) * (u - 0.88) / 0.12 : k;
}

/**
 * A blade along +X from x0, `L` long, `w` wide at the collar (tapering to
 * `taper` of that, a cutlass's belly swelling it on the way), `t` thick,
 * bowing `sori` toward its back at the point. Its cross-section: from the
 * edge (-Y) up each flat — the bright edge zone to the hamon line (a band of
 * colour along it when `hamon` is set), the blade, the ridge (shinogi) and
 * the darker ridge face up to the back. Crisp lines: each colour change has
 * its own pair of vertices.
 */
function blade(b, o, cols, rust) {
  const { x0, L, w, t, sori = 0.03, taper = 0.72, belly = 0, tipLen = 0.06 } = o;
  const style = o.style || 'wave', band = cols.hamon ? 0.07 : 0;
  const N = style === 'flame' || style === 'bolt' || style === 'midare' ? 44 : 26;
  const P = [], C = [], I = [];
  const stopsAt = (u) => {
    const ww = w * (1 - (1 - taper) * u) * (1 + belly * Math.sin(Math.PI * Math.min(1, u * 1.1))), h = ww / 2;
    const c = sori * u * u, tt = (t / 2) * (1 - 0.35 * u);
    const yE = c - h, yB = c + h, yS = c + h - ww * 0.32;
    const zAt = (y) => (y <= yS ? tt * (y - yE) / (yS - yE) : tt * (1 - 0.45 * (y - yS) / (yB - yS)));
    const yH = yE + ww * hamonDepth(style, u);
    const S = [[yE, 0, cols.edge]];
    if (yH > yE + 1e-5) {
      S.push([yH, zAt(yH), cols.edge]);
      if (band) { const y2 = Math.min(yS - 1e-4, yH + ww * band); S.push([yH, zAt(yH), cols.hamon], [y2, zAt(y2), cols.hamon], [y2, zAt(y2), cols.blade]); } else S.push([yH, zAt(yH), cols.blade]);
    } else S.push([yE, 0, cols.blade]);
    S.push([yS, tt, cols.blade], [yS, tt, cols.ridge], [yB - ww * 0.06, tt * 0.5, cols.ridge], [yB - ww * 0.06, tt * 0.5, cols.back], [yB, 0, cols.back]);
    return S;
  };
  const NS = stopsAt(0).length;
  const rustAt = (i, s) => rust && ((i * 7 + s * 3) % 11 === 0 || (i * 5 + s) % 13 === 0);
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = x0 + u * L, S = stopsAt(u);
    for (const sz of [1, -1]) for (let s = 0; s < NS; s++) { P.push(x, S[s][0], sz * S[s][1]); C.push(rustAt(i, s) && s > 0 && s < NS - 1 ? rust : S[s][2]); }
  }
  const row = NS * 2;
  for (let i = 0; i < N; i++) {
    for (let f = 0; f < 2; f++) {
      for (let s = 0; s < NS - 1; s++) {
        const a = i * row + f * NS + s, bb = a + row, c = a + 1, d = bb + 1;
        // (outward: the stops climb from the edge to the back)
        if (f === 0) I.push(a, bb, c, bb, d, c); else I.push(a, c, bb, bb, c, d);
      }
    }
  }
  // the point: each flat's last section to its own tip vertex
  const cEnd = sori, hEnd = (w * taper) / 2;
  for (let f = 0; f < 2; f++) {
    const tip = P.length / 3;
    P.push(x0 + L + tipLen, cEnd + hEnd * 0.45, 0); C.push(cols.edge);
    for (let s = 0; s < NS - 1; s++) {
      const a = N * row + f * NS + s;
      if (f === 0) I.push(a, tip, a + 1); else I.push(a, a + 1, tip);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  let n = 0;
  b.add(g, M(), () => C[n++]);
  return w;
}

// ------------------------------------------------------------------ hilts
/** A katana's handle from x1 (the pommel end) to x2 (the guard): the wrap, the ray-skin diamonds on both flats, the collar and the pommel cap. */
function tsuka(b, L, x1, x2) {
  b.add(Prim.cyl(10), between([x1, 0, 0], [x2, 0, 0], 0.0185, 0.0155), L.wrap);
  const n = Math.max(3, Math.round((x2 - x1 - 0.03) / 0.034)), step = (x2 - x1 - 0.03) / n;
  for (let i = 0; i < n; i++) {
    const x = x1 + 0.016 + (i + 0.5) * step;
    for (const sz of [1, -1]) b.add(Prim.box(), mul(M(x, 0, sz * 0.0156, 0, 0, 0, [step / 0.027, 1, 1]), M(0, 0, 0, 0, 0, Math.PI / 4, [0.0072, 0.0072, 0.0012])), L.diamond);
  }
  if (L.rings) for (const x of [x1 + (x2 - x1) * 0.3, x1 + (x2 - x1) * 0.62]) b.add(Prim.cyl(10), between([x - 0.007, 0, 0], [x + 0.007, 0, 0], 0.0195, 0.0165), L.rings);
  b.add(Prim.cyl(10), between([x2 - 0.012, 0, 0], [x2, 0, 0], 0.0196, 0.0166), L.fit);
  b.add(Prim.cyl(10), between([x1 - 0.01, 0, 0], [x1, 0, 0], 0.0194, 0.0164), L.kashira);
  b.add(Prim.sphere(10, 5), M(x1 - 0.01, 0, 0, 0, 0, 0, [0.006, 0.0194, 0.0164]), L.kashira);
}
/** The guard, from x2 for 11 mm along the blade: its shape in the plane across it. */
function tsuba(b, L, x2) {
  const a = [x2, 0, 0], e = [x2 + 0.011, 0, 0];
  const lobes = (k, r0, rl, off) => { for (let i = 0; i < k; i++) { const an = off + (i / k) * Math.PI * 2, y = Math.cos(an) * r0, z = Math.sin(an) * r0; b.add(Prim.cyl(10), between([x2, y, z], [x2 + 0.011, y, z], rl, rl), L.tsuba); } };
  switch (L.tsubaShape) {
    case 'flower': b.add(Prim.cyl(14), between(a, e, 0.03, 0.03), L.tsuba); lobes(4, 0.026, 0.02, Math.PI / 4); break;
    case 'cross': b.add(Prim.cyl(14), between(a, e, 0.027, 0.027), L.tsuba); lobes(4, 0.03, 0.019, 0); break;
    case 'kiku': b.add(Prim.cyl(14), between(a, e, 0.031, 0.031), L.tsuba); lobes(5, 0.027, 0.019, Math.PI / 2); break;
    case 'fur':
      b.add(Prim.cyl(14), between(a, e, 0.05, 0.033), L.tsuba);
      b.add(Prim.torus(0.42, 6, 16), M(x2 + 0.0055, 0, 0, 0, Math.PI / 2, 0, [0.031, 0.048, 0.03]), L.fur);
      break;
    default: b.add(Prim.cyl(16), between(a, e, 0.046, 0.04), L.tsuba);
  }
}
/** A knuckle-bow hilt (cutlass, saber): the grip, its wire bands, the pommel, a shell or cup and the D-guard round the knuckles. */
function bowHilt(b, L, x1, x2, shell) {
  b.add(Prim.cyl(10), between([x1, 0, 0], [x2, 0, 0], 0.016, 0.014), L.wrap);
  for (let i = 0; i < 3; i++) { const x = x1 + 0.025 + i * ((x2 - x1 - 0.05) / 2); b.add(Prim.torus(0.22, 4, 12), M(x, 0, 0, 0, Math.PI / 2, 0, [0.0148, 0.0168, 0.012]), L.guard); }
  b.add(Prim.sphere(8, 6), M(x1 - 0.008, 0, 0, 0, 0, 0, [0.014, 0.018, 0.016]), L.guard);
  b.add(Prim.sphere(12, 6), M(x2 + 0.004, -0.01, 0, 0, 0, 0, [0.009, shell, shell * 0.85]), L.guard);
  // the bow: out of the shell's rim on the edge side, back round the knuckles, in to the pommel
  let last = null;
  for (let i = 0; i <= 8; i++) {
    const s = i / 8, x = x2 + 0.002 - s * (x2 - x1 + 0.012), y = -(0.016 + (shell - 0.012) * Math.pow(Math.cos(s * Math.PI / 2), 0.6));
    if (last) b.add(Prim.cyl(6), between(last, [x, y, 0], 0.0052, 0.0052), L.guard);
    last = [x, y, 0];
  }
  // (and a short curled quillon on the back)
  b.add(Prim.cyl(6), between([x2 + 0.002, 0.01, 0], [x2 - 0.01, 0.045, 0], 0.0052, 0.0052), L.guard);
  b.add(Prim.sphere(6, 4), M(x2 - 0.011, 0.048, 0, 0, 0, 0, 0.008), L.guard);
}

// ------------------------------------------------------------------ swords
function build(b, L, haki) {
  const cols = haki ? { ...L, ...HAKI } : L;
  const rust = !haki && L.rust;
  switch (L.shape) {
    case 'cutlass': {
      bowHilt(b, L, -0.105, 0.075, 0.05);
      blade(b, { x0: 0.07, L: L.len, w: 0.04, t: 0.008, sori: L.sori, taper: 0.95, belly: 0.28, tipLen: 0.07, style: 'bevel' }, cols, rust);
      break;
    }
    case 'saber': {
      bowHilt(b, L, -0.09, 0.075, 0.038);
      blade(b, { x0: 0.07, L: L.len, w: 0.029, t: 0.007, sori: L.sori, taper: 0.7, tipLen: 0.06, style: 'bevel' }, cols, rust);
      break;
    }
    case 'bokken': {
      // (one piece of oak: a wrap on the grip, a plain guard)
      tsuka(b, { ...L, fit: L.blade, kashira: L.back }, -0.14, 0.1);
      b.add(Prim.cyl(14), between([0.1, 0, 0], [0.11, 0, 0], 0.04, 0.036), L.tsuba);
      blade(b, { x0: 0.095, L: L.len, w: 0.036, t: 0.024, sori: 0.028, taper: 0.82, tipLen: 0.035, style: 'none' }, cols, false);
      break;
    }
    case 'yoru': {
      const x2 = 0.1, x1 = 0.1 - L.hilt, gold = '#e0b24a';
      b.add(Prim.cyl(10), between([x1, 0, 0], [x2, 0, 0], 0.02, 0.018), '#2b2631');
      for (const k of [0.15, 0.45, 0.75]) { const x = x1 + (x2 - x1) * k; b.add(Prim.cyl(10), between([x - 0.008, 0, 0], [x + 0.008, 0, 0], 0.0215, 0.0195), '#d6a23e'); }
      b.add(Prim.sphere(10, 8), M(x1 - 0.022, 0, 0, 0, 0, 0, [0.028, 0.028, 0.026]), gold);
      // the cross guard: arms out along the blade's plane, flaring at their ends (a cross pattée), canted a little toward the blade
      for (const s of [1, -1]) {
        b.add(Prim.rbox(0.4), M(x2 + 0.016, s * 0.075, 0, 0, 0, -s * 0.12, [0.016, 0.07, 0.014]), gold);
        b.add(Prim.rbox(0.4), M(x2 + 0.034, s * 0.148, 0, 0, 0, -s * 0.12, [0.028, 0.013, 0.018]), gold);
      }
      b.add(Prim.rbox(0.4), M(x2 + 0.014, 0, 0, 0, 0, 0, [0.032, 0.036, 0.021]), gold);
      for (const s of [1, -1]) b.add(Prim.sphere(8, 6), M(x2 + 0.014, 0, s * 0.02, 0, 0, 0, [0.016, 0.016, 0.008]), '#3aa37a');
      blade(b, { x0: x2 + 0.03, L: L.len, w: 0.07, t: 0.015, sori: 0.04, taper: 0.8, tipLen: 0.1, style: 'straight' }, haki ? cols : { ...cols, back: '#16131a' }, false);
      break;
    }
    default: {
      // katana and nodachi
      const x2 = 0.1, x1 = 0.1 - L.hilt;
      tsuka(b, L, x1, x2);
      tsuba(b, L, x2);
      const w = L.shape === 'nodachi' ? 0.036 : 0.034;
      b.add(Prim.rbox(0.3), M(x2 + 0.022, 0.001, 0, 0, 0, 0, [0.011, w / 2 + 0.0035, 0.0082]), L.habaki);
      blade(b, { x0: x2 + 0.018, L: L.len, w, t: 0.009, sori: L.sori, taper: 0.7, tipLen: 0.06, style: L.hamonStyle }, cols, rust);
    }
  }
}

const GEOS = new Map();
/** Sword `id`'s geometry (in hand `slot` when it has none; black and violet under Armament Haki). */
export function swordGeo(id, slot = 0, haki = false) {
  const key = `${id || '#' + slot}:${haki ? 1 : 0}`;
  let g = GEOS.get(key);
  if (!g) {
    const b = new Builder();
    build(b, swordLook(id, slot), haki);
    g = b.buildStatic();
    g.userData.shared = true;
    GEOS.set(key, g);
  }
  return g;
}

/** Where along +X the blade runs (for an aura round it): [from, to]. */
export function bladeSpan(id, slot = 0) {
  const L = swordLook(id, slot);
  const x0 = L.shape === 'cutlass' || L.shape === 'saber' ? 0.07 : L.shape === 'yoru' ? 0.13 : 0.118;
  return [x0, x0 + L.len + 0.05];
}

const _c = new THREE.Color();
/**
 * Add a built (static, vertex-coloured) geometry to a skinned Builder `add`
 * (build.js's) on `bone` under matrix `m` — a sword worn on the body.
 */
export function addBuilt(add, g, m, bone) {
  const col = g.attributes.color;
  let n = 0;
  add(g, m, () => _c.fromArray(col.array, (n++) * 3), bone);
}
