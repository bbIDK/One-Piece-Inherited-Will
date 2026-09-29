// Signature techniques for named villains (NPC-only unless learned).
import { registerAbilities } from '../game/abilities.js';

registerAbilities([
  // ------------------------------------------------------------ East Blue
  { id: 'morgan_axe', name: 'Axe-Hand Cleave', anim: 'heavy', windup: 0.55, recover: 0.5, cd: 4, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'line', range: 3.4, width: 1.3, damage: 22, knockback: 7, stun: 0.6, heavy: true, guardBreak: true, slashing: true, shake: 0.3 }, vfx: 'beam', color: '#cfd8dc' }] },
  { id: 'morgan_sweep', name: 'Axe Sweep', anim: 'slash', windup: 0.45, recover: 0.4, cd: 6, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'circle', range: 2.6, damage: 16, knockback: 6, stun: 0.4, slashing: true }, vfx: 'ring' }] },
  { id: 'alvida_mace', name: 'Iron Mace', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 3.5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.6, offset: 0.3, damage: 16, knockback: 8, stun: 0.6, heavy: true, guardBreak: true } }] },
  { id: 'buggy_ball', name: 'Special Muggy Ball', anim: 'shoot', windup: 0.7, recover: 0.4, cd: 9, cost: { stamina: 10 }, say: 'Special Muggy Ball!',
    steps: [{ proj: { speed: 11, range: 12, radius: 0.5, damage: 10, sprite: 'cannonball', size: 1.6, explode: { range: 2.4, damage: 30 } } }] },
  { id: 'buggy_knives', name: 'Chop-Chop Knives', anim: 'shoot', windup: 0.3, recover: 0.3, cd: 5, cost: { stamina: 8 },
    steps: [{ proj: { speed: 16, range: 10, radius: 0.25, damage: 8, count: 3, spread: 0.35, sprite: 'iceshard', color: '#eceff1', slashing: true } }] },
  { id: 'cabaji_fire', name: 'Acrobat Fire Breath', anim: 'cast', windup: 0.45, recover: 0.4, cd: 7, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 3, arc: 0.8, offset: 0.2, damage: 12, knockback: 2, stun: 0.3, element: 'fire', status: { burn: 2 } }, vfx: 'ring', color: '#ff7043' }] },
  { id: 'cabaji_dash', name: 'Unicycle Charge', anim: 'thrust', windup: 0.35, recover: 0.4, cd: 5, cost: { stamina: 8 },
    steps: [{ dash: { dist: 7, time: 0.3, hit: { damage: 14, knockback: 5, stun: 0.4, slashing: true } } }] },
  // (Kuro and Jango: the East Blue's third story — a hard fight for a new pirate, not a wall)
  { id: 'kuro_stealth', name: 'Stealth Foot', anim: 'slash', windup: 0.7, recover: 0.7, cd: 12, cost: { stamina: 12 }, say: 'Nuki Ashi...',
    steps: [0, 0.18, 0.36, 0.54, 0.72].map((t, i) => ({ at: 0.7 + t, angleOffset: (i % 2 ? 1 : -1) * (0.4 + i * 0.3), dash: { dist: 4, time: 0.15, iframes: 0.15, hit: { damage: 6, knockback: 2, stun: 0.25, slashing: true } } })) },
  { id: 'kuro_claws', name: 'Cat\'s Claws', anim: 'slash', windup: 0.3, recover: 0.35, cd: 3.5, cost: { stamina: 6 },
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 1.8, offset: 0.2, damage: 10, knockback: 2, stun: 0.25, slashing: true, status: { bleed: 2 } }, vfx: 'slash' }] },
  { id: 'jango_chakram', name: 'Chakram Throw', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 5, cost: { stamina: 6 },
    steps: [{ proj: { speed: 13, range: 8, radius: 0.3, damage: 7, sprite: 'orb', color: '#b0bec5', pierce: true } }] },
  { id: 'jango_hypnosis', name: 'One, Two, Jango!', anim: 'cast', windup: 0.9, recover: 0.4, cd: 16, cost: { stamina: 8 }, say: 'One... Two... JANGO!',
    steps: [{ hit: { shape: 'circle', range: 3.5, damage: 2, stun: 1.4, knockback: 0, unblockable: true }, vfx: 'ring', color: '#e1bee7' }] },
  { id: 'krieg_mh5', name: 'MH5 Poison Gas Bomb', anim: 'shoot', windup: 0.9, recover: 0.5, cd: 16, cost: { stamina: 10 }, say: 'MH5!',
    steps: [{ zone: { range: 3.8, duration: 5, interval: 0.5, damage: 6, element: 'poison', status: { poison: 3 }, color: '#8e24aa', atTarget: true, kind: 'field' } }] },
  { id: 'krieg_spears', name: 'Wootz Spear Barrage', anim: 'shoot', windup: 0.5, recover: 0.4, cd: 6, cost: { stamina: 8 },
    steps: [{ proj: { speed: 17, range: 12, radius: 0.3, damage: 11, count: 5, spread: 0.7, sprite: 'iceshard', color: '#90a4ae', knockback: 2 } }] },
  { id: 'krieg_cape', name: 'Great Battle Spear', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 7, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'line', range: 3.2, width: 1.2, damage: 22, knockback: 8, stun: 0.6, heavy: true, guardBreak: true, element: 'explosion' }, vfx: 'beam', color: '#ffab40' }] },
  { id: 'arlong_darts', name: 'Shark on Darts', anim: 'thrust', windup: 0.55, recover: 0.5, cd: 7, cost: { stamina: 10 }, say: 'Shark on Darts!',
    steps: [{ dash: { dist: 10, time: 0.35, iframes: 0.2, hit: { damage: 24, knockback: 7, stun: 0.6, heavy: true, guardBreak: true } } }] },
  { id: 'arlong_kiribachi', name: 'Kiribachi Saw', anim: 'slash', windup: 0.5, recover: 0.4, cd: 5, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.6, arc: 2.2, offset: 0.3, damage: 20, knockback: 4, stun: 0.4, slashing: true, status: { bleed: 4 } }, vfx: 'slash', color: '#b0bec5' }] },
  { id: 'arlong_bite', name: 'Shark Tooth', anim: 'grab', windup: 0.35, recover: 0.4, cd: 4, cost: { stamina: 6 },
    steps: [{ hit: { shape: 'arc', range: 1.5, arc: 1.2, offset: 0.2, damage: 18, knockback: 1, stun: 0.8, status: { bleed: 3 } } }] },
  { id: 'hatchan_six', name: 'Six Sword Style', anim: 'slash', windup: 0.45, recover: 0.4, cd: 5, cost: { stamina: 8 }, say: 'Rokutoryu!',
    steps: [{ hit: { shape: 'circle', range: 2.4, damage: 6, knockback: 2, stun: 0.2, slashing: true, duration: 0.6, interval: 0.1 }, vfx: 'ring' }] },
  { id: 'chew_watergun', name: 'Water Gun', anim: 'shoot', windup: 0.4, recover: 0.3, cd: 3, cost: { stamina: 6 },
    steps: [{ proj: { speed: 22, range: 13, radius: 0.3, damage: 13, sprite: 'waterdrop', size: 2, element: 'water', knockback: 3, status: { wet: 5 } } }] },
  { id: 'smoker_jitte', name: 'Seastone Jitte', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 3, cost: { stamina: 6 },
    steps: [{ hit: { shape: 'arc', range: 1.9, arc: 1.0, offset: 0.2, damage: 16, knockback: 4, stun: 0.6, status: { seastone: 4 }, haki: true } }] },
]);

registerAbilities([
  // --------------------------------------------------------------- dials
  // Sky Island shells (items with `ability`): usable by anyone who carries one.
  { id: 'dial_impact', name: 'Impact Dial', anim: 'thrust', windup: 0.2, recover: 0.5, cd: 10, cost: { stamina: 8 }, say: 'Impact!',
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.1, offset: 0.2, damage: 42, knockback: 11, stun: 0.9, heavy: true, guardBreak: true, shake: 0.45, impactFrame: 0.06 }, self: { hurt: 0.07 }, vfx: 'ring', color: '#fff59d' }] },
  { id: 'dial_reject', name: 'Reject Dial', anim: 'thrust', windup: 0.35, recover: 0.8, cd: 40, cost: { stamina: 20 }, say: 'Reject!',
    steps: [{ hit: { shape: 'arc', range: 1.7, arc: 1.0, offset: 0.2, damage: 160, knockback: 16, stun: 1.6, heavy: true, guardBreak: true, unblockable: true, shake: 1, impactFrame: 0.14 }, self: { hurt: 0.3 }, vfx: 'ring', color: '#ffffff' }] },
  { id: 'dial_flame', name: 'Flame Dial', anim: 'cast', windup: 0.25, recover: 0.35, cd: 8, cost: { stamina: 6 },
    steps: [0, 0.12, 0.24].map((t) => ({ at: 0.25 + t, hit: { shape: 'arc', range: 3.2, arc: 0.7, offset: 0.3, damage: 7, knockback: 1.5, stun: 0.2, element: 'fire', status: { burn: 2 } }, vfx: 'ring', color: '#ff7043' })) },
  { id: 'dial_breath', name: 'Breath Dial', anim: 'cast', windup: 0.15, recover: 0.3, cd: 6, cost: { stamina: 4 },
    steps: [{ hit: { shape: 'arc', range: 3.6, arc: 1.0, offset: 0.3, damage: 2, knockback: 12, stun: 0.3 }, vfx: 'ring', color: '#e0f7fa' }] },
  { id: 'dial_flash', name: 'Flash Dial', anim: 'cast', windup: 0.2, recover: 0.3, cd: 14, cost: { stamina: 4 },
    steps: [{ hit: { shape: 'circle', range: 4.5, damage: 1, knockback: 0, stun: 1.6, unblockable: true, element: 'light' }, fx: { flash: 0.8 }, vfx: 'ring', color: '#fffde7' }] },

  // --------------------------------------------------------- World Government
  { id: 'kuma_laser', name: 'Mouth Laser', anim: 'cast', windup: 0.9, recover: 0.5, cd: 6, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'line', range: 13, width: 0.7, damage: 30, knockback: 5, stun: 0.5, element: 'light', heavy: true, hitShips: true, shake: 0.4 }, vfx: 'beam', color: '#fff59d' }] },
  { id: 'kuma_paw_npc', name: 'Paw Cannon', anim: 'thrust', windup: 0.6, recover: 0.5, cd: 9, cost: { stamina: 10 }, say: 'Pad Ho...',
    steps: [{ proj: { speed: 16, range: 14, radius: 0.7, damage: 28, sprite: 'paw', size: 1.8, knockback: 10, heavy: true, pierce: true, color: '#ffffff' } }] },
]);
