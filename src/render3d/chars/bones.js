// The character skeleton: bone names, parents and body dimensions shared by
// the geometry builder (bind pose) and the rig (per-frame pose).
//
// Local frames (the model faces +X, +Y up, +Z is the character's RIGHT):
//   hips, chest   origin at the hip pivot (pelvis centre at hip height)
//   head          origin at the top of the neck; head centre at (0, hc, 0)
//   uarm*, farm*, thigh*, shin*   limbs hang along -Y from their joint
//   hand*         origin at the wrist, fingers along -Y, back of the hand +X
//   foot*         origin at the ankle, toes along +X
//   fist/palm/finger*   hand shapes, children of hand* (hidden by scale 0)
//   k1..k4*, j1..j4*, tb*, tc*   articulated fingers (the first-person hands):
//                 knuckle and middle joint of index…little finger, thumb base
//                 and tip; each segment hangs along -Y from its joint, and
//                 bends toward the palm (-X) about its Z axis
//   coatTail, wing*, tail, hairTail, sheath, hilts, backWpn: attachments
//   skirt0..skirt5 a skirt's panels, hung round the waist from the front (0)
//                 toward the right; each swings out about its own
//                 horizontal axis to clear the legs (model.js skirtPanels);
//   skirtK0..5    and a long skirt's lower panels, bending from them at the knee
import * as THREE from 'three';

export const BONES = [
  'hips', 'chest', 'head',
  'uarmR', 'farmR', 'handR', 'fistR', 'palmR', 'fingerR',
  'uarmL', 'farmL', 'handL', 'fistL', 'palmL', 'fingerL',
  'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL',
  'coatTail', 'tail', 'wingR', 'wingL', 'hairTail', 'sheath', 'hilts', 'backWpn',
  ...['R', 'L'].flatMap((H) => ['k1', 'k2', 'k3', 'k4', 'j1', 'j2', 'j3', 'j4', 'tb', 'tc'].map((n) => n + H)),
  'skirt0', 'skirt1', 'skirt2', 'skirt3', 'skirt4', 'skirt5',
  'skirtK0', 'skirtK1', 'skirtK2', 'skirtK3', 'skirtK4', 'skirtK5',
];
export const SKIRT_N = 6;
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const PARENT = {
  fistR: 'handR', palmR: 'handR', fingerR: 'handR', fistL: 'handL', palmL: 'handL', fingerL: 'handL',
  coatTail: 'chest', wingR: 'chest', wingL: 'chest', backWpn: 'chest', tail: 'hips', sheath: 'hips', hilts: 'hips', hairTail: 'head',
};
for (let i = 0; i < SKIRT_N; i++) { PARENT['skirt' + i] = 'hips'; PARENT['skirtK' + i] = 'skirt' + i; }
for (const H of ['R', 'L']) {
  for (let i = 1; i <= 4; i++) { PARENT['k' + i + H] = 'hand' + H; PARENT['j' + i + H] = 'k' + i + H; }
  PARENT['tb' + H] = 'hand' + H; PARENT['tc' + H] = 'tb' + H;
}

// ------------------------------------------------------------------ frames
// One Piece's people come in every shape: Luffy lean and wiry, Zoro broad,
// Sanji long and slim, Franky a wall of shoulders on short legs, round
// bellies, beanpoles, squat bruisers. A frame scales the build:
//   h height · leg share of it · sh shoulders · ch chest depth · wa waist ·
//   hp hips · arm / fa (forearm) / th (thigh) / ca (calf) thickness · neck ·
//   head size · belly (0..1) · mus the muscle it usually carries
const F1 = { h: 1, leg: 1, sh: 1, ch: 1, wa: 1, hp: 1, arm: 1, fa: 1, th: 1, ca: 1, neck: 1, head: 1, belly: 0, mus: null };
export const FRAME = {
  average: F1,
  lean: { ...F1, h: 0.97, sh: 0.97, ch: 0.96, wa: 0.88, hp: 0.95, arm: 0.94, fa: 0.96, th: 0.93, ca: 0.96, neck: 0.95, head: 1.04, mus: 0.75 },
  athletic: { ...F1, h: 1.03, sh: 1.13, ch: 1.12, wa: 0.97, arm: 1.12, fa: 1.1, th: 1.08, ca: 1.05, neck: 1.14, head: 0.98, mus: 1.0 },
  slim: { ...F1, h: 1.04, leg: 1.07, sh: 0.97, ch: 0.94, wa: 0.85, hp: 0.93, arm: 0.88, fa: 0.9, th: 0.9, ca: 0.92, neck: 0.94, head: 0.97, mus: 0.45 },
  brawny: { ...F1, h: 1.2, leg: 0.88, sh: 1.5, ch: 1.42, wa: 1.12, hp: 1.04, arm: 1.55, fa: 1.95, th: 1.18, ca: 1.12, neck: 1.4, head: 0.86, mus: 1.2 },
  heavy: { ...F1, h: 1.03, leg: 0.93, sh: 1.2, ch: 1.28, wa: 1.5, hp: 1.3, arm: 1.3, fa: 1.2, th: 1.35, ca: 1.25, neck: 1.32, head: 1.03, belly: 1, mus: 0.3 },
  lanky: { ...F1, h: 1.08, leg: 1.1, sh: 0.9, ch: 0.88, wa: 0.84, hp: 0.9, arm: 0.8, fa: 0.84, th: 0.8, ca: 0.84, neck: 0.88, head: 1.0, mus: 0.28 },
  stocky: { ...F1, h: 0.87, leg: 0.84, sh: 1.2, ch: 1.2, wa: 1.14, hp: 1.1, arm: 1.25, fa: 1.28, th: 1.25, ca: 1.2, neck: 1.28, head: 1.08, belly: 0.3, mus: 0.8 },
  // women
  curvy: { ...F1, h: 1.01, leg: 1.05, sh: 0.98, wa: 0.84, hp: 1.12, th: 1.05, head: 0.98, mus: 0.2 },
  petite: { ...F1, h: 0.9, leg: 0.98, sh: 0.92, ch: 0.92, wa: 0.9, hp: 0.94, arm: 0.9, fa: 0.9, th: 0.9, ca: 0.9, neck: 0.92, head: 1.06, mus: 0.15 },
};
export const FRAMES_M = ['average', 'lean', 'athletic', 'slim', 'brawny', 'heavy', 'lanky', 'stocky'];
export const FRAMES_F = ['average', 'slim', 'curvy', 'athletic', 'petite', 'heavy'];
export const FRAME_NAMES = { average: 'Average', lean: 'Lean', athletic: 'Athletic', slim: 'Slim', brawny: 'Brawny', heavy: 'Heavy', lanky: 'Lanky', stocky: 'Stocky', curvy: 'Curvy', petite: 'Petite' };
/** A look's frame id (one that suits its build). */
export function frameId(look) {
  const set = look.fem ? FRAMES_F : FRAMES_M;
  return set.includes(look.frame) ? look.frame : 'average';
}
/** A look's frame (the scales). */
export function frameOf(look) { return FRAME[frameId(look)] || F1; }

/**
 * Body dimensions (metres at scale 1) from a look's proportions. The 2D rig
 * poses (render/anims.js) are in 2D-art units: kA / kL convert hand and foot
 * targets to these arms and legs.
 */
export function dims(look) {
  // proportions of the anime-game look: about seven heads tall, long legs,
  // broad shoulders over a narrow waist
  const fem = !!look.fem;
  const F = frameOf(look);
  const Lg = (look.legs || 1) * (fem ? 1.03 : 1) * F.leg * F.h, Am = (look.arms || 1) * (fem ? 0.97 : 1) * Math.sqrt(F.h), Bk = look.bulk || 1;
  const T1 = 0.48 * Lg, T2 = 0.465 * Lg, hA = 0.075;
  const hip0 = (T1 + T2) * 0.985 + hA;
  const chestLen = (0.52 + (Bk - 1) * 0.1) * (fem ? 0.95 : 1) * F.h / Math.sqrt(F.leg);
  const headR = 0.13 * (1 + (Bk - 1) * 0.18) * F.head;
  const A1 = 0.3 * Am * Math.sqrt(F.h), A2 = 0.27 * Am * Math.sqrt(F.h);
  const neck = (0.075 + (look.neck || 0) * 0.6) * (F.neck > 1.2 ? 0.85 : 1);
  return {
    Lg, Am, Bk, T1, T2, hA, hip0, chestLen, headR, A1, A2, neck, fem, F,
    hc: headR * 0.84,               // head centre above the neck top
    hx: headR * 0.28,               // … and in front of it (the neck meets the skull at the nape, behind the jaw)
    hipW: (fem ? 0.094 : 0.085) * Bk * (0.6 + 0.4 * F.hp), // hip joints either side of the pelvis
    // the outside of the hips (the tops of the thighs): where a scabbard or a holster hangs
    hipOut: (fem ? 0.094 : 0.085) * Bk * (0.6 + 0.4 * F.hp) + (fem ? 0.09 : 0.088) * F.th * Bk,
    shY: chestLen - 0.07,           // shoulder joints below the top of the chest
    shW: (fem ? 0.155 * Bk + 0.004 : 0.194 * Bk + 0.006) * F.sh,
    depth: 0.64,                    // torso depth / width
    kA: (A1 + A2) / 0.43,           // 2D hand target → metres (2D arm length 0.43)
    kL: (T1 + T2) / 0.49,           // 2D foot target → metres (2D leg length 0.49)
    kHip: hip0 / (0.42 * Lg + 0.05),// 2D hip drop → metres
  };
}

/** Rest offsets of the attachment bones from their parents (the skeleton is built with these). */
export function restOffsets(d) {
  const R = {
    hairTail: [d.hx, d.hc, 0], tail: [-0.13 * d.Bk, -0.06, 0],
    wingR: [-0.11 * d.Bk, d.chestLen * 0.8, 0.05], wingL: [-0.11 * d.Bk, d.chestLen * 0.8, -0.05],
  };
  // the skirt's panels hang from the waist, just inside the hips; a long
  // skirt's lower panels bend from them at the height of the knee
  const [Dp, Wp] = skirtWaist(d);
  const L = skirtShape(d, true), f = L.hK / -L.yb;
  for (let i = 0; i < SKIRT_N; i++) {
    const a = (i / SKIRT_N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    R['skirt' + i] = [c * Dp, 0, s * Wp];
    R['skirtK' + i] = [c * (L.Dh - Dp) * f, -L.hK, s * (L.Wh - Wp) * f];
  }
  return R;
}
/** Where a skirt's panels hang from: the waist's half depth and half width. */
export function skirtWaist(d) { const Wp = d.hipOut * 0.92; return [Wp * 0.78, Wp]; }
/**
 * A skirt's hang: its hem's depth below the waist (yb, negative), the hem's
 * half depth and half width (however broad the frame, it clears the hips and
 * thighs), and how far below the waist the knee is (where a long one bends).
 */
export function skirtShape(d, long) {
  const F = d.F, fw = Math.max(1, F.hp * 0.55 + F.th * 0.45);
  return { yb: long ? -0.88 * d.Lg : -0.34, Wh: (long ? 0.3 : 0.225) * d.Bk * fw, Dh: (long ? 0.3 : 0.2) * d.Bk * fw, hK: 0.07 + d.T1, long };
}

/**
 * The rest (bind) pose: where every bone sits, in model space, in the layout
 * the geometry is built in — standing straight, the arms and legs hanging
 * down from their joints, nothing turned. Parts are stored where they sit in
 * this pose (geom.js Builder), and the skeleton's inverse bind matrices undo
 * it, so a vertex can follow two bones across a joint. (Finger joints are
 * placed by the hand builder: see build.js hands.)
 */
export function bindPose(d) {
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const m = new Array(BONES.length);
  const y0 = d.hip0;
  m[B.hips] = T(0, y0, 0);
  m[B.chest] = T(0, y0, 0);
  m[B.head] = T(0, y0 + d.chestLen + d.neck, 0);
  for (const [s, H] of [[1, 'R'], [-1, 'L']]) {
    const ys = y0 + d.shY, z = s * d.shW;
    m[B['uarm' + H]] = T(0, ys, z);
    m[B['farm' + H]] = T(0, ys - d.A1, z);
    m[B['hand' + H]] = T(0, ys - d.A1 - d.A2, z);
    for (const n of ['fist', 'palm', 'finger', 'k1', 'k2', 'k3', 'k4', 'j1', 'j2', 'j3', 'j4', 'tb', 'tc']) m[B[n + H]] = m[B['hand' + H]].clone();
    const yh = y0 - 0.07, zl = s * d.hipW;
    m[B['thigh' + H]] = T(0, yh, zl);
    m[B['shin' + H]] = T(0, yh - d.T1, zl);
    m[B['foot' + H]] = T(0, yh - d.T1 - d.T2, zl);
  }
  const R = restOffsets(d);
  const child = (n, parent, off = [0, 0, 0]) => { m[B[n]] = m[B[parent]].clone().multiply(T(off[0], off[1], off[2])); };
  child('coatTail', 'chest'); child('backWpn', 'chest'); child('sheath', 'hips'); child('hilts', 'hips');
  child('tail', 'hips', R.tail); child('wingR', 'chest', R.wingR); child('wingL', 'chest', R.wingL);
  child('hairTail', 'head', R.hairTail);
  for (let i = 0; i < SKIRT_N; i++) { child('skirt' + i, 'hips', R['skirt' + i]); child('skirtK' + i, 'skirt' + i, R['skirtK' + i]); }
  return m;
}
