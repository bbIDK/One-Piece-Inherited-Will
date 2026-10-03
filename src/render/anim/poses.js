// The pose library (see docs/ANIMATION.md): the standing pose every key
// starts from, the fighting stances, and the named partial poses and hand
// spots new clips are built from, so the same lunge or the same cocked fist
// reads the same in every move.
//
// A pose P is a small bag of numbers (the full list: render/anims.js). All
// positions are in the 2D rig's units — an arm is 0.43 long, a leg 0.49 —
// side view, facing right: x forward, y down.

export const STAND = { b: [0, 0], l: 0, r: 0, z: 0, sp: 0, ht: 0, hF: [0.05, 0.4], hB: [-0.03, 0.4], eF: 1, eB: 1, fF: [0.05, 0], fB: [-0.05, 0], wF: null, wB: null, m: 0.15, hand: 'fist', handB: 'fist', face: null, stretch: false, tw: 0, hp: 0, ls: 0, hy: 0, hr: 0, zF: 0, zB: 0, zfF: 0, zfB: 0, wt: 0, sm: 0, smF: 0, smB: 0, smfF: 0, smfB: 0 };
// a fighter's guard: knees bent, the lead shoulder turned in, fists up by the chin
export const GUARD = { ...STAND, b: [0, 0.045], l: 0.09, ht: 0.04, hF: [0.2, -0.01], hB: [0.12, 0.04], fF: [0.17, 0], fB: [-0.14, 0], tw: 0.08, hp: 0.04 };
// Fish-Man Karate: a deep, wide horse stance, the hands open
export const PALMS = { ...GUARD, hF: [0.25, -0.01], hB: [0.1, 0.12], hand: 'palm', handB: 'palm', b: [0, 0.09], l: 0.05, fF: [0.21, 0], fB: [-0.17, 0], zfF: 0.03, zfB: 0.03, tw: 0.12 };
export const SWORD = { ...STAND, b: [0, 0.045], l: 0.06, hF: [0.2, 0.12], hB: [0.13, 0.15], wF: -0.75, fF: [0.19, 0], fB: [-0.14, 0], tw: 0.06 };
export const SWORD2 = { ...SWORD, hF: [0.22, 0.1], hB: [0.1, 0.12], wF: -0.55, wB: -1.05 };
export const GUN = { ...STAND, hF: [0.26, 0.16], wF: 0.35, hB: [0.0, 0.34], fF: [0.12, 0], fB: [-0.1, 0] };
export const HEAVYW = { ...SWORD, hF: [0.16, 0.14], hB: [0.1, 0.17], wF: -1.1 };
export const STAFF = { ...SWORD, wF: -1.2 };
// Black Leg: hands in the pockets, weight on the back foot
export const POCKETS = { ...STAND, b: [0, 0.03], l: -0.05, ht: -0.03, hF: [-0.02, 0.33], hB: [-0.08, 0.32], eF: -1, eB: -1, fF: [0.17, 0], fB: [-0.13, 0], tw: 0.1 };
// Okama Kenpo: a ballet fifth position, arms spread
export const BALLET = { ...GUARD, b: [0, 0.02], l: 0.02, ht: -0.06, hF: [0.3, -0.12], hB: [-0.26, -0.1], zF: 0.06, zB: 0.06, hand: 'palm', handB: 'palm', fF: [0.08, 0], fB: [-0.1, 0], tw: 0, hp: 0 };
// Electro, Ryusoken: hunched forward like a beast about to spring, claws out
export const CLAWS = { ...GUARD, hand: 'claw', handB: 'claw', b: [0, 0.07], l: 0.16, ht: -0.04, hF: [0.25, -0.05], hB: [0.13, 0.03], zF: 0.04, zB: 0.04 };
// Rokushiki: upright and side-on, one finger cocked, the other hand at the small of the back
export const FINGER = { ...GUARD, b: [0, 0.025], l: 0.03, ht: 0, hF: [0.2, 0.02], hB: [-0.1, 0.27], zB: -0.04, hand: 'finger', fF: [0.15, 0], fB: [-0.12, 0], tw: 0.18, hp: 0.06 };

/** Combat stances by name (a style's resting fighting pose). */
export const STANCES = { guard: GUARD, palms: PALMS, sword: SWORD, sword2: SWORD2, gun: GUN, heavyw: HEAVYW, staff: STAFF, legs: POCKETS, ballet: BALLET, claw: CLAWS, finger: FINGER, stand: STAND };
/** Stances that hold the weapon out (the weapon is drawn, not sheathed). */
export const STANCE_ARMED = { sword: 'sword', sword2: 'sword', gun: 'gun', heavyw: 'axe', staff: 'staff' };
const STYLE_STANCE = {
  brawler: 'guard', ittoryu: 'sword', nitoryu: 'sword2', santoryu: 'sword2', black_leg: 'legs', fishman_karate: 'palms', rokushiki: 'finger',
  okama_kenpo: 'ballet', electro: 'claw', hasshoken: 'guard', weather_science: 'staff', elbaf: 'heavyw', ryusoken: 'claw', sniper: 'gun',
};
/** A style's fighting stance, falling back to fists when its weapon is missing. */
export function stanceFor(style, weapon) {
  let s = STYLE_STANCE[style] || 'guard';
  const need = STANCE_ARMED[s];
  if (need && (!weapon || weapon.kind !== need)) s = 'guard';
  if (s === 'sword2' && (weapon.count || 1) < 2) s = 'sword';
  return s;
}
/** 'sling' for slingshots (Usopp's Kabuto…), else a firearm. */
export function gunKind(weapon) {
  if (!weapon || weapon.kind !== 'gun') return undefined;
  const ids = weapon.ids || [];
  return ids.some((id) => /sling|kabuto/.test(id)) ? 'sling' : weapon.gun;
}

// ------------------------------------------------------------------ hand spots
// Where a hand goes for the common jobs (from its shoulder; F is the lead,
// right, hand). A clip says `hF: HAND.chin` rather than a fresh pair of
// numbers, and every move's guard sits at the same chin.
export const HAND = {
  chin: [0.2, -0.01], chinB: [0.12, 0.04], // the guard: lead fist, rear fist
  hip: [-0.04, 0.3], // drawn back to the hip (a karate chamber)
  cocked: [-0.14, 0.04], // pulled back by the ribs for a straight blow
  ear: [-0.1, -0.15], // cocked high by the ear (an overhand, a hammer fist)
  out: [0.47, -0.05], // a straight blow at full reach, a little over shoulder height
  palmOut: [0.48, -0.03], // a palm strike's reach (the wrist bent back)
  low: [0.24, 0.3], // reaching down in front (to the ground, a knee)
  sky: { a: -1.55, r: 0.43 }, // straight up over the head
  back: [-0.3, 0.12], // flung back behind for balance
  smallBack: [-0.1, 0.27], // at the small of the back (Rokushiki's resting hand)
  pocket: [-0.02, 0.33], // in the trouser pocket (Black Leg)
};

// ------------------------------------------------------------------ partial poses
// Bodies and legs for the common beats; spread them into a key and add the
// arms. (`b` the hips: forward, down; `fF` / `fB` the feet from under the hips.)
export const BODY = {
  // stepping in behind a blow: the lead foot forward, the back heel up
  lunge: { b: [0.14, 0.05], fF: [0.29, 0], fB: [-0.17, -0.03] },
  // all the way in: a long lunge, the back leg straight
  deepLunge: { b: [0.23, 0.08], fF: [0.37, 0], fB: [-0.23, -0.05] },
  // loaded on the back leg (the coil before a straight blow)
  sitBack: { b: [-0.06, 0.08], fF: [0.24, 0], fB: [-0.18, 0] },
  // crouched to spring
  crouch: { b: [0, 0.15], l: 0.22, fF: [0.2, 0], fB: [-0.16, 0] },
  // down on one knee
  kneel: { b: [0, 0.26], l: 0.4, fF: [0.3, 0], fB: [-0.26, -0.02] },
  // feet wide and planted (bracing, a big release)
  planted: { b: [0, 0.08], fF: [0.22, 0], fB: [-0.21, 0], zfF: 0.04, zfB: 0.04 },
  // up on the toes, the body tall (a release upward)
  tall: { b: [0, -0.03], fF: [0.12, 0], fB: [-0.12, -0.02] },
};

/** A key built from the library: parts merged left to right, then the clip's own fields. */
export const pose = (...parts) => Object.assign({}, ...parts);
