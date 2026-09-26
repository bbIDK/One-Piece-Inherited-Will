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
//   coatTail, wing*, tail, hairTail, sheath, hilts, backWpn: attachments
export const BONES = [
  'hips', 'chest', 'head',
  'uarmR', 'farmR', 'handR', 'fistR', 'palmR', 'fingerR',
  'uarmL', 'farmL', 'handL', 'fistL', 'palmL', 'fingerL',
  'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL',
  'coatTail', 'tail', 'wingR', 'wingL', 'hairTail', 'sheath', 'hilts', 'backWpn',
];
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const PARENT = {
  fistR: 'handR', palmR: 'handR', fingerR: 'handR', fistL: 'handL', palmL: 'handL', fingerL: 'handL',
  coatTail: 'chest', wingR: 'chest', wingL: 'chest', backWpn: 'chest', tail: 'hips', sheath: 'hips', hilts: 'hips', hairTail: 'head',
};

/**
 * Body dimensions (metres at scale 1) from a look's proportions. The 2D rig
 * poses (render/anims.js) are in 2D-art units: kA / kL convert hand and foot
 * targets to these arms and legs.
 */
export function dims(look) {
  const Lg = look.legs || 1, Am = look.arms || 1, Bk = look.bulk || 1;
  const T1 = 0.45 * Lg, T2 = 0.43 * Lg, hA = 0.075;
  const hip0 = (T1 + T2) * 0.985 + hA;
  const chestLen = 0.46 + (Bk - 1) * 0.1;
  const headR = 0.176 * (1 + (Bk - 1) * 0.22);
  const A1 = 0.285 * Am, A2 = 0.255 * Am;
  const neck = 0.055 + (look.neck || 0) * 0.6;
  return {
    Lg, Am, Bk, T1, T2, hA, hip0, chestLen, headR, A1, A2, neck,
    hc: headR * 0.84,               // head centre above the neck top
    hipW: 0.085 * Bk,               // hip joints either side of the pelvis
    shY: chestLen - 0.07,           // shoulder joints below the top of the chest
    shW: 0.168 * Bk + 0.006,
    depth: 0.64,                    // torso depth / width
    kA: (A1 + A2) / 0.43,           // 2D hand target → metres (2D arm length 0.43)
    kL: (T1 + T2) / 0.49,           // 2D foot target → metres (2D leg length 0.49)
    kHip: hip0 / (0.42 * Lg + 0.05),// 2D hip drop → metres
  };
}
