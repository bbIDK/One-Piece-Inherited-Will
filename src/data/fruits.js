// Devil Fruits. Eating one grants its powers and takes away your ability to
// swim — the sea itself rejects you. Eating a second one kills you.
// When a user dies, their fruit is reborn inside an ordinary fruit somewhere
// in the world (canon), which the game tracks as a rumour.
//
// Techniques unlock with fruit mastery (0-100). Mastery grows by fighting
// worthy opponents with the fruit and by training — not by farming.
import { registerAbilities } from '../game/abilities.js';

const T = (mastery, a) => ({ ...a, mastery });

export const FRUITS = {
  // ------------------------------------------------------------- PARAMECIA
  gomu: {
    name: 'Gomu Gomu no Mi', en: 'Gum-Gum Fruit', type: 'Paramecia', rarity: 'mythical', color: '#e57373', weight: 0.6,
    desc: 'Turns the body into rubber. Or so the World Government would have you believe...',
    passive: { rubber: true }, stretch: true,
    techniques: [
      T(0, { id: 'gomu_pistol', name: 'Gum-Gum Pistol', icon: '👊', anim: 'punch', windup: 0.12, recover: 0.25, cd: 2.5, say: 'Gomu Gomu no... Pistol!', steps: [{ proj: { speed: 26, range: 8, radius: 0.35, damage: 16, sprite: 'gomufist', stretch: true, knockback: 5, stun: 0.3 } }] }),
      T(10, { id: 'gomu_gatling', name: 'Gum-Gum Gatling', icon: '🔫', anim: 'punch', windup: 0.2, recover: 0.3, cd: 6, say: 'Gomu Gomu no... Gatling!', steps: [{ hit: { shape: 'arc', range: 3.2, arc: 0.9, offset: 0.3, damage: 5, knockback: 0.8, stun: 0.15, duration: 0.9, interval: 0.08 }, vfx: 'fist' }] }),
      T(20, { id: 'gomu_rocket', name: 'Gum-Gum Rocket', icon: '🚀', anim: 'thrust', windup: 0.15, recover: 0.2, cd: 4, desc: 'Launch yourself like a slingshot.', steps: [{ dash: { dist: 9, time: 0.3, iframes: 0.25, air: true, hit: { damage: 14, knockback: 6, stun: 0.4 } } }] }),
      T(30, { id: 'gomu_bazooka', name: 'Gum-Gum Bazooka', icon: '💥', anim: 'heavy', windup: 0.35, recover: 0.35, cd: 8, say: 'Gomu Gomu no... BAZOOKA!', steps: [{ hit: { shape: 'arc', range: 2.4, arc: 1.2, offset: 0.4, damage: 36, knockback: 14, stun: 0.8, heavy: true, guardBreak: true, impactFrame: true, hitShips: true } }] }),
      T(45, { id: 'gomu_gear2', name: 'Gear Second', icon: '♨', anim: 'kneel', windup: 0.4, recover: 0.1, cd: 35, say: 'Gear... Second!', desc: 'Pump blood at high speed: faster and stronger, at a cost.',
        steps: [{ fx: { burst: 20, color: '#ffcdd2', kind: 'smoke' } }, { at: 0.4, buff: { id: 'gear2', name: 'Gear Second', dur: 16, mods: { speedMul: 1.35, damage: 1.35, atkSpeed: 1.3 }, aura: 'rgba(255,138,128,0.7)', steam: true, look: { skin: '#f4a39c' }, after: { id: 'gear2_spent', name: 'Spent', dur: 8, mods: { speedMul: 0.85, atkSpeed: 0.85 } } } }] }),
      T(60, { id: 'gomu_gear3', name: 'Gear Third: Gigant Pistol', icon: '🦴', anim: 'pistol', windup: 0.7, recover: 0.5, cd: 18, say: 'Gear Third... Gigant Pistol!', steps: [{ proj: { speed: 16, range: 10, radius: 1.6, damage: 80, sprite: 'gomufist', size: 4, stretch: true, pierce: true, knockback: 14, stun: 1, heavy: true, hitShips: true, shipDamage: 200 } }] }),
      T(80, { id: 'gomu_gear4', name: 'Gear Fourth: Boundman', icon: '🎈', anim: 'cast', windup: 0.8, recover: 0.2, cd: 90, cost: { haki: 40 }, requiresHaki: 'armament', say: 'Gear... FOURTH!', desc: 'Inflate your Haki-hardened muscles. Enormous power for a short time.',
        steps: [{ fx: { ring: 3, color: '#b71c1c', impact: 0.1 } }, { at: 0.8, buff: { id: 'gear4', name: 'Boundman', dur: 20, mods: { damage: 2.2, defMul: 0.6, speedMul: 1.2 }, aura: 'rgba(183,28,28,0.9)', forceArmament: true, look: { bulk: 1.45, boundman: true }, drain: { haki: 1.5 } } }] }),
      T(100, { id: 'gomu_gear5', name: 'Gear Fifth', icon: '☀', anim: 'cast', windup: 1.0, recover: 0.2, cd: 180, cost: { haki: 60 }, requiresHaki: 'conqueror', say: '...Drums of Liberation.', desc: 'The fruit\'s true name is Hito Hito no Mi, Model: Nika. The warrior of liberation, bringer of joy.',
        steps: [{ fx: { ring: 6, color: '#ffffff', flash: 0.6, impact: 0.2, text: 'SUN GOD NIKA' } }, { at: 1.0, buff: { id: 'gear5', name: 'Gear Fifth', dur: 30, mods: { damage: 3, defMul: 0.45, speedMul: 1.4, atkSpeed: 1.4 }, aura: 'rgba(255,255,255,1)', look: { hairColor: '#ffffff', top: '#ffffff', bottom: '#ffffff', nika: true } } }] }),
    ],
  },
  gura: {
    name: 'Gura Gura no Mi', en: 'Tremor-Tremor Fruit', type: 'Paramecia', rarity: 'legendary', color: '#e0f7fa', weight: 0.4,
    desc: 'The power to destroy the world: create quakes in the air, the ground and the sea. Once eaten by Whitebeard.',
    techniques: [
      T(0, { id: 'gura_punch', name: 'Quake Punch', icon: '✊', anim: 'quake', windup: 0.25, recover: 0.3, cd: 4, steps: [{ hit: { shape: 'arc', range: 3.0, arc: 1.2, offset: 0.3, damage: 26, knockback: 10, stun: 0.6, element: 'quake', heavy: true, guardBreak: true, shake: 0.4 }, vfx: 'ring' }] }),
      T(20, { id: 'gura_kaishin', name: 'Kaishin', icon: '🌐', anim: 'quake', windup: 0.45, recover: 0.4, cd: 9, desc: 'Crack the air itself around you.', steps: [{ hit: { shape: 'circle', range: 4.5, damage: 40, knockback: 12, stun: 0.9, element: 'quake', heavy: true, guardBreak: true, impactFrame: true, shake: 0.8, hitShips: true }, vfx: 'ring' }] }),
      T(45, { id: 'gura_wave', name: 'Quake Wave', icon: '🌊', anim: 'quake', windup: 0.5, recover: 0.4, cd: 12, desc: 'A shockwave that rips across the ground (and sea).', steps: [{ hit: { shape: 'line', range: 12, width: 3, damage: 55, knockback: 14, stun: 1, element: 'quake', heavy: true, unblockable: true, shake: 0.7, hitShips: true, shipDamage: 250 }, vfx: 'beam', color: '#e0f7fa' }] }),
      T(75, { id: 'gura_tsunami', name: 'Seaquake', icon: '🌋', anim: 'slam', windup: 0.9, recover: 0.5, cd: 40, desc: 'Tilt the sea. Everything nearby is crushed.', steps: [{ hit: { shape: 'circle', range: 8, damage: 90, knockback: 16, stun: 1.2, element: 'quake', heavy: true, unblockable: true, impactFrame: true, shake: 1.2, hitShips: true, shipDamage: 500 }, vfx: 'ring' }] }),
    ],
  },
  ope: {
    name: 'Ope Ope no Mi', en: 'Op-Op Fruit', type: 'Paramecia', rarity: 'legendary', color: '#81d4fa', weight: 0.4,
    desc: 'Create a ROOM and become a surgeon within it. Its ultimate technique grants eternal youth — at the cost of the user\'s life.',
    techniques: [
      T(0, { id: 'ope_room', name: 'ROOM', icon: '🔵', anim: 'raise', windup: 0.3, recover: 0.2, cd: 20, desc: 'Within your Room, techniques cost less and hit harder.', steps: [{ fx: { ring: 7, color: '#81d4fa' } }, { buff: { id: 'room', name: 'ROOM', dur: 12, mods: { damage: 1.3, cdMul: 0.6 }, aura: 'rgba(129,212,250,0.5)' } }] }),
      T(10, { id: 'ope_shambles', name: 'Shambles', icon: '🔀', anim: 'point', windup: 0.1, recover: 0.1, cd: 3, desc: 'Swap places instantly.', steps: [{ teleport: { dist: 8, color: '#81d4fa' } }] }),
      T(25, { id: 'ope_amputate', name: 'Amputate', icon: '🗡', anim: 'slash', windup: 0.2, recover: 0.3, cd: 5, desc: 'A vast slash that cuts without killing.', steps: [{ hit: { shape: 'arc', range: 4, arc: 2.4, offset: 0.2, damage: 28, knockback: 2, stun: 0.9, slashing: true }, vfx: 'slash', color: '#81d4fa' }] }),
      T(45, { id: 'ope_mes', name: 'Mes', icon: '💙', anim: 'thrust', windup: 0.15, recover: 0.3, cd: 12, desc: 'Remove the target\'s heart in a cube. They freeze in terror.', steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.0, offset: 0.2, damage: 20, stun: 2.5, unblockable: true } }] }),
      T(60, { id: 'ope_counter', name: 'Counter Shock', icon: '⚡', anim: 'palm', windup: 0.2, recover: 0.3, cd: 10, steps: [{ hit: { shape: 'arc', range: 1.5, arc: 1.2, offset: 0.2, damage: 45, stun: 1.2, element: 'lightning', status: { shock: 1.5 } }, vfx: 'ring', color: '#fff176' }] }),
      T(80, { id: 'ope_gamma', name: 'Gamma Knife', icon: '☢', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 18, desc: 'Destroys organs from the inside. Ignores all defences.', steps: [{ hit: { shape: 'line', range: 3, width: 0.8, damage: 85, stun: 1, unblockable: true, trueDamage: true }, vfx: 'beam', color: '#b388ff' }] }),
    ],
  },
  bara: {
    name: 'Bara Bara no Mi', en: 'Chop-Chop Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#ff8a65', weight: 3,
    desc: 'Split your body into pieces. Blades cannot hurt you — but your feet must stay on the ground. (Buggy the Clown\'s fruit.)',
    passive: { immuneSlash: true },
    techniques: [
      T(0, { id: 'bara_cannon', name: 'Chop-Chop Cannon', icon: '🤡', anim: 'cross', windup: 0.15, recover: 0.25, cd: 3, say: 'Bara Bara Ho!', steps: [{ proj: { speed: 20, range: 9, radius: 0.35, damage: 14, sprite: 'barafist', color: '#ffccbc', knockback: 3, stun: 0.3 } }] }),
      T(20, { id: 'bara_festival', name: 'Chop-Chop Festival', icon: '🎪', anim: 'cast', windup: 0.3, recover: 0.4, cd: 10, desc: 'Scatter into a hundred pieces that pummel everything nearby.', steps: [{ hit: { shape: 'circle', range: 3.2, damage: 6, knockback: 1.5, stun: 0.15, duration: 1.2, interval: 0.15 }, vfx: 'ring' }] }),
      T(40, { id: 'bara_escape', name: 'Emergency Escape', icon: '🎈', anim: 'fly', windup: 0.05, recover: 0.1, cd: 8, steps: [{ dash: { dist: 7, time: 0.25, iframes: 0.3, air: true } }] }),
    ],
  },
  bomu: {
    name: 'Bomu Bomu no Mi', en: 'Bomb-Bomb Fruit', type: 'Paramecia', rarity: 'common', color: '#ffab40', weight: 5,
    desc: 'Make any part of your body explode — and survive it. (Mr. 5 of Baroque Works.)',
    passive: { resist: ['explosion'] },
    techniques: [
      T(0, { id: 'bomu_kick', name: 'Kick Bomb', icon: '💣', anim: 'kick', windup: 0.2, recover: 0.3, cd: 3, steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.4, offset: 0.3, damage: 18, knockback: 7, stun: 0.4, element: 'explosion' }, vfx: 'ring', color: '#ffab40' }] }),
      T(15, { id: 'bomu_nose', name: 'Nose Fancy Cannon', icon: '👃', anim: 'flick', windup: 0.25, recover: 0.3, cd: 5, desc: 'Flick an explosive... bogey. Disgusting and effective.', steps: [{ proj: { speed: 18, range: 12, radius: 0.2, damage: 6, sprite: 'orb', color: '#aed581', explode: { range: 2, damage: 24 } } }] }),
      T(40, { id: 'bomu_breeze', name: 'Breeze Breath Bomb', icon: '🌬', anim: 'breath', windup: 0.35, recover: 0.3, cd: 9, steps: [{ hit: { shape: 'arc', range: 4, arc: 1.2, offset: 0.2, damage: 32, knockback: 8, stun: 0.6, element: 'explosion', heavy: true }, vfx: 'ring', color: '#ffab40' }] }),
    ],
  },
  hana: {
    name: 'Hana Hana no Mi', en: 'Flower-Flower Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#f48fb1', weight: 2.5,
    desc: 'Sprout copies of your body parts on any surface — including your enemies. (Nico Robin.)',
    techniques: [
      T(0, { id: 'hana_clutch', name: 'Clutch', icon: '🌸', anim: 'hana', windup: 0.25, recover: 0.3, cd: 5, say: 'Seis Fleur... Clutch!', desc: 'Sprout arms on the target and bend them backwards.', steps: [{ zone: { range: 1.2, duration: 0.3, interval: 0.3, damage: 24, color: '#f48fb1', atTarget: true, kind: 'arms', status: { root: 1.2 } } }] }),
      T(20, { id: 'hana_mil', name: 'Mil Fleur', icon: '🌺', anim: 'hana', windup: 0.4, recover: 0.4, cd: 10, desc: 'A thousand arms bloom around you and strike.', steps: [{ hit: { shape: 'circle', range: 3.6, damage: 7, knockback: 1, stun: 0.3, duration: 1.0, interval: 0.14 }, vfx: 'ring', color: '#f48fb1' }] }),
      T(50, { id: 'hana_gigante', name: 'Gigantesco Mano', icon: '✋', anim: 'hana', windup: 0.5, recover: 0.4, cd: 14, desc: 'Two giant sprouted hands slam down.', steps: [{ zone: { range: 2.6, duration: 0.3, interval: 0.3, damage: 60, color: '#f48fb1', atTarget: true, kind: 'arms', status: { root: 1.5 } } }] }),
    ],
  },
  ito: {
    name: 'Ito Ito no Mi', en: 'String-String Fruit', type: 'Paramecia', rarity: 'legendary', color: '#f8bbd0', weight: 0.5,
    desc: 'Create strings sharp enough to cut steel and strong enough to puppet people. (Donquixote Doflamingo.)',
    techniques: [
      T(0, { id: 'ito_overheat', name: 'Overheat', icon: '🧵', anim: 'point', windup: 0.3, recover: 0.3, cd: 5, steps: [{ hit: { shape: 'line', range: 9, width: 0.6, damage: 24, knockback: 4, stun: 0.4, slashing: true, element: 'fire' }, vfx: 'beam', color: '#ff8a80' }] }),
      T(15, { id: 'ito_parasite', name: 'Parasite', icon: '🎭', anim: 'point', windup: 0.25, recover: 0.3, cd: 12, desc: 'Puppet strings freeze your target in place.', steps: [{ proj: { speed: 22, range: 10, radius: 0.4, damage: 8, sprite: 'string', status: { root: 2.5 }, stun: 0.5 } }] }),
      T(35, { id: 'ito_fivecolor', name: 'Five Color Strings', icon: '🖐', anim: 'claw', windup: 0.25, recover: 0.3, cd: 7, steps: [{ hit: { shape: 'arc', range: 3.4, arc: 1.4, offset: 0.2, damage: 34, knockback: 3, stun: 0.5, slashing: true }, vfx: 'slash', color: '#f8bbd0' }] }),
      T(70, { id: 'ito_birdcage', name: 'Birdcage', icon: '🕸', anim: 'summon', windup: 0.8, recover: 0.4, cd: 45, desc: 'A cage of cutting strings that closes around the area.', steps: [{ zone: { range: 6, duration: 6, interval: 0.4, damage: 10, color: '#f8bbd0', kind: 'cage' } }] }),
    ],
  },
  mochi: {
    name: 'Mochi Mochi no Mi', en: 'Mochi-Mochi Fruit', type: 'Special Paramecia', rarity: 'legendary', color: '#fff8e1', weight: 0.5,
    desc: 'A special Paramecia that behaves like a Logia: turn your body into mochi. (Charlotte Katakuri.)',
    passive: { logiaLike: true, intangible: 0.5, weakTo: ['fire'] },
    techniques: [
      T(0, { id: 'mochi_tsuki', name: 'Mochi Tsuki', icon: '🍡', anim: 'punch', windup: 0.25, recover: 0.3, cd: 4, steps: [{ proj: { speed: 18, range: 8, radius: 0.6, damage: 22, sprite: 'mochi', color: '#fff8e1', knockback: 6, stun: 0.5, size: 1.5 } }] }),
      T(20, { id: 'mochi_zangiri', name: 'Zan Giri Mochi', icon: '🔱', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 7, steps: [{ hit: { shape: 'line', range: 4.5, width: 1.2, damage: 36, knockback: 5, stun: 0.6, slashing: true }, vfx: 'beam', color: '#fff8e1' }] }),
      T(50, { id: 'mochi_chikara', name: 'Chikara Mochi', icon: '💪', anim: 'slam', windup: 0.45, recover: 0.4, cd: 12, desc: 'Giant mochi fists rain down.', steps: [{ zone: { range: 3, duration: 1.2, interval: 0.2, damage: 18, color: '#fff8e1', atTarget: true, kind: 'fists' } }] }),
    ],
  },
  horo: {
    name: 'Horo Horo no Mi', en: 'Hollow-Hollow Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#ce93d8', weight: 3,
    desc: 'Create ghosts. Negative Hollows drain the will to live from anyone they pass through. (Perona.)',
    techniques: [
      T(0, { id: 'horo_negative', name: 'Negative Hollow', icon: '👻', anim: 'point', windup: 0.3, recover: 0.3, cd: 8, desc: '"I\'m so sorry I was born..." The target collapses in despair.', steps: [{ proj: { speed: 10, range: 12, radius: 0.5, damage: 4, sprite: 'ghost', color: '#e1bee7', homing: 3, status: { despair: 3 }, stun: 2.2, unblockable: true } }] }),
      T(20, { id: 'horo_mini', name: 'Mini Hollows', icon: '💫', anim: 'cast', windup: 0.3, recover: 0.3, cd: 7, steps: [{ proj: { speed: 11, range: 10, radius: 0.3, damage: 6, count: 4, spread: 0.9, sprite: 'ghost', size: 0.7, color: '#e1bee7', homing: 4, explode: { range: 1.2, damage: 12, colors: ['#e1bee7', '#fff'] } } }] }),
    ],
  },
  kage: {
    name: 'Kage Kage no Mi', en: 'Shadow-Shadow Fruit', type: 'Paramecia', rarity: 'rare', color: '#455a64', weight: 1.2,
    desc: 'Manipulate shadows, steal them, and fight with a living shadow double. (Gecko Moria.)',
    techniques: [
      T(0, { id: 'kage_brickbat', name: 'Brick Bat', icon: '🦇', anim: 'cast', windup: 0.25, recover: 0.3, cd: 4, steps: [{ proj: { speed: 14, range: 11, radius: 0.3, damage: 7, count: 5, spread: 0.6, sprite: 'bat', color: '#263238', homing: 2 } }] }),
      T(20, { id: 'kage_steal', name: 'Shadow Steal', icon: '🌑', anim: 'grab', windup: 0.35, recover: 0.3, cd: 16, desc: 'Cut away the target\'s shadow: they weaken badly (and would burn in sunlight...).', steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.0, offset: 0.2, damage: 18, stun: 0.8, status: { shadowless: 12 }, unblockable: true } }] }),
      T(40, { id: 'kage_doppelman', name: 'Doppelman', icon: '👤', anim: 'cast', windup: 0.3, recover: 0.2, cd: 30, desc: 'Your shadow fights beside you as a second body.', steps: [{ buff: { id: 'doppel', name: 'Doppelman', dur: 18, mods: { damage: 1.4, extraHit: 1 }, aura: 'rgba(38,50,56,0.6)' } }] }),
    ],
  },
  doku: {
    name: 'Doku Doku no Mi', en: 'Venom-Venom Fruit', type: 'Paramecia', rarity: 'rare', color: '#8e24aa', weight: 1.2,
    desc: 'Produce and control lethal poison. (Magellan, chief warden of Impel Down.)',
    passive: { resist: ['poison'] },
    techniques: [
      T(0, { id: 'doku_fist', name: 'Poison Fist', icon: '☠', anim: 'punch', windup: 0.15, recover: 0.25, cd: 3, steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 12, knockback: 3, stun: 0.3, element: 'poison', status: { poison: 5 } } }] }),
      T(20, { id: 'doku_hydra', name: 'Hydra', icon: '🐍', anim: 'cast', windup: 0.4, recover: 0.4, cd: 9, say: 'Hydra!', steps: [{ proj: { speed: 13, range: 12, radius: 0.7, damage: 26, count: 3, spread: 0.4, sprite: 'hydra', element: 'poison', status: { poison: 6 }, homing: 1.5, trail: { color: '#8e24aa', kind: 'smoke' } } }] }),
      T(50, { id: 'doku_venom', name: 'Venom Demon', icon: '👹', anim: 'cast', windup: 0.8, recover: 0.5, cd: 40, steps: [{ zone: { range: 4.5, duration: 8, interval: 0.5, damage: 12, element: 'poison', status: { poison: 4 }, color: '#8e24aa', kind: 'field' } }] }),
    ],
  },
  noro: {
    name: 'Noro Noro no Mi', en: 'Slow-Slow Fruit', type: 'Paramecia', rarity: 'common', color: '#80deea', weight: 5,
    desc: 'Fire Noro Noro photons that slow anything they hit to a crawl. (Foxy the Silver Fox.)',
    techniques: [
      T(0, { id: 'noro_beam', name: 'Noro Noro Beam', icon: '🐌', anim: 'point', windup: 0.25, recover: 0.3, cd: 8, steps: [{ hit: { shape: 'line', range: 9, width: 1.2, damage: 4, stun: 0.1, status: { slowmo: 4 } }, vfx: 'beam', color: '#80deea' }] }),
      T(30, { id: 'noro_mirror', name: 'Noro Noro Beam Sword', icon: '🪞', anim: 'slash', windup: 0.2, recover: 0.3, cd: 10, steps: [{ hit: { shape: 'arc', range: 2.4, arc: 2.2, offset: 0.2, damage: 10, stun: 0.2, status: { slowmo: 3 } }, vfx: 'slash', color: '#80deea' }] }),
    ],
  },
  bari: {
    name: 'Bari Bari no Mi', en: 'Barrier-Barrier Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#b3e5fc', weight: 2.5,
    desc: 'Create unbreakable barriers. (Bartolomeo.)',
    techniques: [
      T(0, { id: 'bari_barrier', name: 'Barrier', icon: '🛡', anim: 'block', windup: 0.05, recover: 0.1, cd: 10, desc: 'Block everything for a moment.', steps: [{ buff: { id: 'barrier', name: 'Barrier', dur: 2.5, mods: { defMul: 0.05 }, aura: 'rgba(179,229,252,0.8)' } }] }),
      T(20, { id: 'bari_crash', name: 'Barrier Crash', icon: '🧱', anim: 'thrust', windup: 0.2, recover: 0.3, cd: 7, steps: [{ dash: { dist: 7, time: 0.25, iframes: 0.3, hit: { damage: 30, knockback: 9, stun: 0.6, heavy: true, guardBreak: true } } }] }),
    ],
  },
  suke: {
    name: 'Suke Suke no Mi', en: 'Clear-Clear Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#eceff1', weight: 3,
    desc: 'Turn yourself (and what you touch) invisible. (Absalom, then Shiliew.)',
    techniques: [
      T(0, { id: 'suke_vanish', name: 'Clear Body', icon: '👁', anim: 'cast', windup: 0.2, recover: 0.1, cd: 16, desc: 'Become invisible: enemies lose track of you and your first hit is a critical.', steps: [{ buff: { id: 'invisible', name: 'Invisible', dur: 8, mods: { stealth: 1, crit: 0.6 }, alpha: 0.12 } }] }),
    ],
  },
  sube: {
    name: 'Sube Sube no Mi', en: 'Slip-Slip Fruit', type: 'Paramecia', rarity: 'common', color: '#fce4ec', weight: 5,
    desc: 'Your skin becomes perfectly slippery. Attacks slide right off. (Alvida.)',
    passive: { slippery: 0.3 },
    techniques: [
      T(0, { id: 'sube_slide', name: 'Slip Slide', icon: '⛸', anim: 'thrust', windup: 0.05, recover: 0.1, cd: 3, steps: [{ dash: { dist: 6, time: 0.25, iframes: 0.25, hit: { damage: 8, knockback: 3 } } }] }),
      T(25, { id: 'sube_mace', name: 'Mace Swing', icon: '🔨', anim: 'heavy', windup: 0.35, recover: 0.35, cd: 5, steps: [{ hit: { shape: 'arc', range: 2.2, arc: 2, offset: 0.2, damage: 22, knockback: 7, stun: 0.5, heavy: true } }] }),
    ],
  },
  doru: {
    name: 'Doru Doru no Mi', en: 'Wax-Wax Fruit', type: 'Paramecia', rarity: 'common', color: '#fff8e1', weight: 5,
    desc: 'Produce wax as hard as steel. Weak to fire. (Mr. 3 of Baroque Works.)',
    passive: { weakTo: ['fire'] },
    techniques: [
      T(0, { id: 'doru_arrow', name: 'Candle Arrows', icon: '🕯', anim: 'shoot', windup: 0.2, recover: 0.3, cd: 4, steps: [{ proj: { speed: 18, range: 11, radius: 0.25, damage: 9, count: 3, spread: 0.25, sprite: 'iceshard', color: '#fff8e1' } }] }),
      T(20, { id: 'doru_lock', name: 'Candle Lock', icon: '🔒', anim: 'cast', windup: 0.3, recover: 0.3, cd: 11, steps: [{ zone: { range: 1.5, duration: 0.4, interval: 0.4, damage: 10, color: '#fff8e1', atTarget: true, status: { root: 2.5 } } }] }),
      T(40, { id: 'doru_armor', name: 'Candle Champion', icon: '🗿', anim: 'cast', windup: 0.4, recover: 0.2, cd: 30, steps: [{ buff: { id: 'waxarmor', name: 'Wax Armour', dur: 12, mods: { defMul: 0.55, damage: 1.2 }, aura: 'rgba(255,248,225,0.8)' } }] }),
    ],
  },
  supa: {
    name: 'Supa Supa no Mi', en: 'Dice-Dice Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#b0bec5', weight: 3,
    desc: 'Turn any part of your body into a steel blade. Blades can\'t hurt you. (Daz Bonez, Mr. 1.)',
    passive: { immuneSlash: true },
    techniques: [
      T(0, { id: 'supa_sparkling', name: 'Sparkling Daisy', icon: '✴', anim: 'slash3', windup: 0.25, recover: 0.3, cd: 5, steps: [{ hit: { shape: 'arc', range: 2.4, arc: 2.6, offset: 0.2, damage: 26, knockback: 4, stun: 0.5, slashing: true }, vfx: 'slash', color: '#eceff1' }] }),
      T(25, { id: 'supa_spider', name: 'Spider', icon: '🕷', anim: 'block', windup: 0.05, recover: 0.1, cd: 12, desc: 'Harden your whole body into steel.', steps: [{ buff: { id: 'steel', name: 'Steel Body', dur: 4, mods: { defMul: 0.3 }, aura: 'rgba(176,190,197,0.9)' } }] }),
    ],
  },
  nikyu: {
    name: 'Nikyu Nikyu no Mi', en: 'Paw-Paw Fruit', type: 'Paramecia', rarity: 'legendary', color: '#fff', weight: 0.4,
    desc: 'Paw pads that repel anything — even pain, even people across the world. (Bartholomew Kuma.)',
    techniques: [
      T(0, { id: 'nikyu_paw', name: 'Pad Ho', icon: '🐾', anim: 'palm', windup: 0.25, recover: 0.3, cd: 4, steps: [{ proj: { speed: 24, range: 12, radius: 0.5, damage: 20, sprite: 'paw', pierce: true, knockback: 8, stun: 0.4 } }] }),
      T(20, { id: 'nikyu_repel', name: 'Repel', icon: '✋', anim: 'spread', windup: 0.02, recover: 0.1, cd: 8, desc: 'Deflect everything around you.', steps: [{ hit: { shape: 'circle', range: 2.2, damage: 10, knockback: 12, stun: 0.4 }, vfx: 'ring', color: '#ffffff' }, { self: { iframes: 0.4 } }] }),
      T(45, { id: 'nikyu_travel', name: 'Tabi Tabi', icon: '✈', anim: 'cast', windup: 0.2, recover: 0.1, cd: 6, desc: 'Repel yourself through the air.', steps: [{ teleport: { dist: 12, color: '#ffffff' } }] }),
      T(70, { id: 'nikyu_ursus', name: 'Ursus Shock', icon: '💣', anim: 'cast', windup: 1.0, recover: 0.5, cd: 30, desc: 'Compress the air into a paw-shaped bomb.', steps: [{ proj: { speed: 7, range: 9, radius: 1.2, damage: 20, sprite: 'paw', size: 2.5, pierce: true, explode: { range: 4.5, damage: 110, colors: ['#ffffff', '#e0f7fa', '#b2ebf2'] } } }] }),
    ],
  },
  mane: {
    name: 'Mane Mane no Mi', en: 'Clone-Clone Fruit', type: 'Paramecia', rarity: 'common', color: '#f06292', weight: 4,
    desc: 'Touch a face with your right hand and copy it perfectly. Marines won\'t recognise you. (Bon Clay.)',
    passive: { disguise: true },
    techniques: [
      T(0, { id: 'mane_disguise', name: 'Mimicry', icon: '🎭', anim: 'pray', windup: 0.4, recover: 0.2, cd: 60, desc: 'Disguise yourself: Marines and bounty hunters ignore you until you attack.', steps: [{ buff: { id: 'disguise', name: 'Disguised', dur: 90, mods: { stealth: 0.5 }, disguise: true } }] }),
      T(20, { id: 'mane_memoir', name: 'Memoir Strike', icon: '💭', anim: 'kick', windup: 0.2, recover: 0.3, cd: 8, desc: 'Take a friend\'s face — the enemy hesitates to strike.', steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.4, offset: 0.2, damage: 20, knockback: 5, stun: 1.4 } }] }),
    ],
  },
  zushi: {
    name: 'Zushi Zushi no Mi', en: 'Press-Press Fruit', type: 'Paramecia', rarity: 'legendary', color: '#9575cd', weight: 0.4,
    desc: 'Control gravity. Pull meteors down from space. (Admiral Fujitora.)',
    techniques: [
      T(0, { id: 'zushi_press', name: 'Gravity Press', icon: '⬇', anim: 'cast', windup: 0.3, recover: 0.3, cd: 6, steps: [{ zone: { range: 2.8, duration: 2, interval: 0.25, damage: 6, color: '#9575cd', atTarget: true, slow: 0.25, kind: 'gravity' } }] }),
      T(25, { id: 'zushi_blade', name: 'Gravity Blade: Raging Tiger', icon: '🐯', anim: 'slash', windup: 0.4, recover: 0.4, cd: 10, steps: [{ hit: { shape: 'line', range: 10, width: 2.2, damage: 48, knockback: 6, stun: 0.8, heavy: true }, vfx: 'beam', color: '#9575cd' }] }),
      T(70, { id: 'zushi_meteor', name: 'Meteor', icon: '☄', anim: 'raise', windup: 1.2, recover: 0.5, cd: 45, desc: 'Call down a meteor from the heavens.', steps: [{ zone: { range: 4, duration: 1.3, interval: 1.2, damage: 140, color: '#ff7043', atTarget: true, kind: 'meteor', element: 'explosion' } }] }),
    ],
  },

  // ------------------------------------------------------------------ ZOAN
  hito: {
    name: 'Hito Hito no Mi', en: 'Human-Human Fruit', type: 'Zoan', rarity: 'uncommon', color: '#f8bbd0', weight: 2.5,
    desc: 'Grants the intelligence and form of a human. Tony Tony Chopper ate it as a reindeer.',
    techniques: [
      T(0, { id: 'hito_heavy', name: 'Heavy Point', icon: '💪', anim: 'flex', windup: 0.4, recover: 0.1, cd: 25, steps: [{ buff: { id: 'heavy_point', name: 'Heavy Point', dur: 15, mods: { damage: 1.4, defMul: 0.8, scale: 1.3 }, look: { hat: 'antlers', bulk: 1.3 } } }] }),
      T(20, { id: 'hito_horn', name: 'Horn Point: Kokutei Roseo', icon: '🦌', anim: 'thrust', windup: 0.25, recover: 0.3, cd: 7, steps: [{ dash: { dist: 5, time: 0.22, hit: { damage: 28, knockback: 6, stun: 0.6 } } }] }),
      T(50, { id: 'hito_monster', name: 'Monster Point', icon: '👹', anim: 'flex', windup: 0.8, recover: 0.1, cd: 90, desc: 'A Rumble Ball overdose: enormous power, barely controllable.', steps: [{ buff: { id: 'monster', name: 'Monster Point', dur: 20, mods: { damage: 2.2, defMul: 0.5, scale: 1.8, speedMul: 1.1 }, aura: 'rgba(121,85,72,0.8)', look: { hat: 'antlers', bulk: 1.45, sleeve: '#8d6e63' } } }] }),
    ],
  },
  neko_leopard: {
    name: 'Neko Neko no Mi, Model: Leopard', en: 'Cat-Cat Fruit, Leopard', type: 'Zoan', rarity: 'rare', color: '#ffb74d', weight: 1.2,
    desc: 'Become a leopard or a half-leopard warrior. Rob Lucci\'s ferocious fruit.',
    techniques: [
      T(0, { id: 'neko_hybrid', name: 'Hybrid Form', icon: '🐆', anim: 'flex', windup: 0.4, recover: 0.1, cd: 30, steps: [{ buff: { id: 'leopard', name: 'Leopard Form', dur: 20, mods: { damage: 1.45, speedMul: 1.2, defMul: 0.85 }, aura: 'rgba(255,183,77,0.6)', look: { spots: true, ears: 'round', tail: 'thin', fur: '#ffb74d', hand: '#ffb74d' } } }] }),
      T(20, { id: 'neko_claw', name: 'Leopard Claw', icon: '🐾', anim: 'claw', windup: 0.15, recover: 0.25, cd: 3, steps: [{ hit: { shape: 'arc', range: 1.9, arc: 1.8, offset: 0.2, damage: 22, knockback: 3, stun: 0.4, slashing: true, status: { bleed: 4 } }, vfx: 'slash', color: '#ffb74d' }] }),
      T(50, { id: 'neko_pounce', name: 'Hunting Pounce', icon: '🐅', anim: 'thrust', windup: 0.25, recover: 0.3, cd: 7, steps: [{ dash: { dist: 8, time: 0.25, iframes: 0.2, hit: { damage: 40, knockback: 5, stun: 0.8, heavy: true } } }] }),
    ],
  },
  tori_phoenix: {
    name: 'Tori Tori no Mi, Model: Phoenix', en: 'Bird-Bird Fruit, Phoenix', type: 'Mythical Zoan', rarity: 'mythical', color: '#4dd0e1', weight: 0.4,
    desc: 'Blue flames of resurrection. Wounds heal as fast as they are dealt. (Marco the Phoenix.)',
    passive: { regen: 3 },
    techniques: [
      T(0, { id: 'phoenix_flame', name: 'Flames of Restoration', icon: '💙', anim: 'cast', windup: 0.3, recover: 0.2, cd: 12, steps: [{ heal: 45, color: '#4dd0e1' }] }),
      T(15, { id: 'phoenix_fly', name: 'Phoenix Flight', icon: '🕊', anim: 'cast', windup: 0.05, recover: 0.1, cd: 3, steps: [{ dash: { dist: 10, time: 0.35, iframes: 0.3, air: true, trail: '#4dd0e1' } }] }),
      T(35, { id: 'phoenix_brand', name: 'Phoenix Brand', icon: '🔥', anim: 'kick', windup: 0.3, recover: 0.3, cd: 7, steps: [{ dash: { dist: 6, time: 0.22, iframes: 0.2, air: true, hit: { damage: 38, knockback: 8, stun: 0.6, element: 'fire', heavy: true } } }] }),
      T(70, { id: 'phoenix_rebirth', name: 'Blue Rebirth', icon: '♾', anim: 'cast', windup: 0.6, recover: 0.2, cd: 120, desc: 'Burn away all harm: full heal and a burst of blue fire.', steps: [{ heal: 400, color: '#4dd0e1' }, { hit: { shape: 'circle', range: 3, damage: 30, knockback: 6, element: 'fire' }, vfx: 'ring', color: '#4dd0e1' }, { self: { cleanse: true } }] }),
    ],
  },
  uo_seiryu: {
    name: 'Uo Uo no Mi, Model: Seiryu', en: 'Fish-Fish Fruit, Azure Dragon', type: 'Mythical Zoan', rarity: 'mythical', color: '#42a5f5', weight: 0.3,
    desc: 'Become the Azure Dragon of legend. Kaido, strongest creature in the world, ate this fruit.',
    techniques: [
      T(0, { id: 'seiryu_bolo', name: 'Bolo Breath', icon: '🐉', anim: 'breath', windup: 0.5, recover: 0.4, cd: 7, say: 'Bolo Breath!', steps: [{ hit: { shape: 'line', range: 11, width: 1.8, damage: 44, knockback: 6, stun: 0.5, element: 'fire', status: { burn: 3 }, heavy: true, hitShips: true }, vfx: 'beam', color: '#ff7043' }] }),
      T(25, { id: 'seiryu_kaifu', name: 'Kaifu', icon: '🌬', anim: 'breath', windup: 0.35, recover: 0.3, cd: 6, desc: 'Wind blades from the dragon\'s whiskers.', steps: [{ proj: { speed: 18, range: 12, radius: 0.5, damage: 18, count: 3, spread: 0.5, sprite: 'airslash', slashing: true, pierce: true } }] }),
      T(50, { id: 'seiryu_raimei', name: 'Raimei Hakke', icon: '⚡', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 14, desc: 'Thunder Bagua: a club blow that shakes the heavens.', steps: [{ hit: { shape: 'arc', range: 3, arc: 1.4, offset: 0.4, damage: 95, knockback: 16, stun: 1.2, heavy: true, guardBreak: true, element: 'lightning', impactFrame: true, shake: 0.9 } }] }),
      T(80, { id: 'seiryu_form', name: 'Dragon Form', icon: '🐲', anim: 'cast', windup: 1.0, recover: 0.1, cd: 120, steps: [{ buff: { id: 'dragon', name: 'Azure Dragon', dur: 25, mods: { damage: 2, defMul: 0.4, scale: 1.6 }, aura: 'rgba(66,165,245,0.8)', look: { dragonForm: true } } }] }),
    ],
  },

  // ----------------------------------------------------------------- LOGIA
  mera: {
    name: 'Mera Mera no Mi', en: 'Flame-Flame Fruit', type: 'Logia', rarity: 'rare', color: '#ff7043', weight: 1,
    desc: 'Become fire itself. Portgas D. Ace\'s fruit — later the Colosseum prize of Dressrosa.',
    passive: { logia: true, element: 'fire', resist: ['fire'], weakTo: ['magma', 'water'] },
    techniques: [
      T(0, { id: 'mera_hiken', name: 'Hiken', icon: '🔥', anim: 'punch', windup: 0.3, recover: 0.3, cd: 4, say: 'Hiken!', desc: 'Fire Fist.', steps: [{ proj: { speed: 16, range: 12, radius: 0.8, damage: 26, sprite: 'firefist', element: 'fire', pierce: true, status: { burn: 3 }, knockback: 5, trail: { color: ['#ff7043', '#ffca28'] } } }] }),
      T(15, { id: 'mera_hidaruma', name: 'Hidaruma', icon: '🎆', anim: 'cast', windup: 0.25, recover: 0.3, cd: 6, desc: 'Fireflies of flame that ignite everything they touch.', steps: [{ proj: { speed: 9, range: 10, radius: 0.3, damage: 8, count: 6, spread: 1.2, sprite: 'fireball', element: 'fire', status: { burn: 2 }, homing: 2 } }] }),
      T(35, { id: 'mera_enkai', name: 'Enkai: Hibashira', icon: '🌋', anim: 'cast', windup: 0.4, recover: 0.4, cd: 10, desc: 'A pillar of flame erupts around you.', steps: [{ hit: { shape: 'circle', range: 3, damage: 36, knockback: 8, stun: 0.5, element: 'fire', status: { burn: 3 }, heavy: true }, vfx: 'ring' }] }),
      T(70, { id: 'mera_entei', name: 'Dai Enkai: Entei', icon: '☀', anim: 'raise', windup: 1.1, recover: 0.5, cd: 40, desc: 'A second sun, hurled.', say: 'Dai Enkai... ENTEI!', steps: [{ proj: { speed: 9, range: 13, radius: 2.2, damage: 40, size: 4, sprite: 'fireball', element: 'fire', pierce: true, status: { burn: 5 }, explode: { range: 4.5, damage: 100, element: 'fire' } } }] }),
    ],
  },
  hie: {
    name: 'Hie Hie no Mi', en: 'Ice-Ice Fruit', type: 'Logia', rarity: 'rare', color: '#81d4fa', weight: 1,
    desc: 'Become ice. Freeze anything — even the sea. (Admiral Aokiji.)',
    passive: { logia: true, element: 'ice', resist: ['ice'], weakTo: ['magma'] },
    techniques: [
      T(0, { id: 'hie_saber', name: 'Ice Saber', icon: '🗡', anim: 'slash', windup: 0.15, recover: 0.25, cd: 3, steps: [{ hit: { shape: 'arc', range: 2, arc: 1.8, offset: 0.2, damage: 18, knockback: 3, stun: 0.3, slashing: true, element: 'ice', status: { chill: 3 } }, vfx: 'slash', color: '#b3e5fc' }] }),
      T(15, { id: 'hie_pheasant', name: 'Pheasant Beak', icon: '🐦', anim: 'cast', windup: 0.35, recover: 0.3, cd: 6, say: 'Pheasant Beak!', steps: [{ proj: { speed: 15, range: 12, radius: 0.8, damage: 28, sprite: 'bird', color: '#b3e5fc', element: 'ice', status: { freeze: 1.4 }, pierce: true } }] }),
      T(35, { id: 'hie_ageand', name: 'Ice Age', icon: '❄', anim: 'kneel', windup: 0.6, recover: 0.4, cd: 14, desc: 'Freeze everything around you — even water becomes a road of ice.', say: 'Ice Age!', steps: [{ hit: { shape: 'circle', range: 5, damage: 30, knockback: 1, stun: 0.3, element: 'ice', status: { freeze: 2.5 }, heavy: true }, vfx: 'ring', color: '#e1f5fe' }, { zone: { range: 5, duration: 6, interval: 1, damage: 0, color: '#e1f5fe', kind: 'ice', slow: 0.5 } }] }),
      T(65, { id: 'hie_time', name: 'Ice Time Capsule', icon: '🧊', anim: 'cast', windup: 0.7, recover: 0.4, cd: 25, steps: [{ hit: { shape: 'line', range: 10, width: 2.5, damage: 60, knockback: 2, element: 'ice', status: { freeze: 3.5 }, heavy: true, unblockable: true }, vfx: 'beam', color: '#e1f5fe' }] }),
    ],
  },
  goro: {
    name: 'Goro Goro no Mi', en: 'Rumble-Rumble Fruit', type: 'Logia', rarity: 'legendary', color: '#fff176', weight: 0.6,
    desc: 'Become lightning. The self-proclaimed God Enel\'s fruit. Useless against rubber.',
    passive: { logia: true, element: 'lightning', resist: ['lightning'], weakTo: ['rubber'] },
    techniques: [
      T(0, { id: 'goro_vari', name: 'Vari', icon: '⚡', anim: 'point', windup: 0.2, recover: 0.25, cd: 3, steps: [{ hit: { shape: 'line', range: 8, width: 0.8, damage: 22, knockback: 2, stun: 0.5, element: 'lightning', status: { shock: 1 } }, vfx: 'beam', color: '#fff176' }] }),
      T(15, { id: 'goro_sango', name: 'Sango', icon: '🐉', anim: 'cast', windup: 0.4, recover: 0.3, cd: 8, desc: 'A lightning dragon.', steps: [{ proj: { speed: 20, range: 14, radius: 0.9, damage: 34, sprite: 'thunder', size: 2, element: 'lightning', pierce: true, status: { shock: 1.2 } } }] }),
      T(35, { id: 'goro_elthor', name: 'El Thor', icon: '🌩', anim: 'raise', windup: 0.7, recover: 0.4, cd: 14, desc: 'A pillar of divine lightning from the sky.', say: 'El Thor!', steps: [{ zone: { range: 2.8, duration: 0.8, interval: 0.4, damage: 45, element: 'lightning', status: { shock: 1.5 }, color: '#fff176', atTarget: true, kind: 'thunder' } }] }),
      T(55, { id: 'goro_amaru', name: '200 Million Volt Amaru', icon: '👺', anim: 'cast', windup: 0.8, recover: 0.2, cd: 60, steps: [{ buff: { id: 'amaru', name: 'Amaru', dur: 18, mods: { damage: 1.9, speedMul: 1.25, scale: 1.3 }, element: 'lightning', aura: 'rgba(255,241,118,0.9)', look: { drums: true } } }] }),
      T(85, { id: 'goro_raigo', name: 'Raigo', icon: '🌑', anim: 'summon', windup: 1.4, recover: 0.6, cd: 90, desc: 'A thundercloud large enough to erase an island.', steps: [{ zone: { range: 7, duration: 3, interval: 0.3, damage: 22, element: 'lightning', status: { shock: 0.5 }, color: '#fff176', kind: 'thunder' } }] }),
    ],
  },
  suna: {
    name: 'Suna Suna no Mi', en: 'Sand-Sand Fruit', type: 'Logia', rarity: 'rare', color: '#e1c16e', weight: 1,
    desc: 'Become sand and drain the moisture from anything you touch. Water is its weakness. (Sir Crocodile.)',
    passive: { logia: true, element: 'sand', weakTo: ['water'] },
    techniques: [
      T(0, { id: 'suna_barjan', name: 'Barjan', icon: '🌙', anim: 'slash', windup: 0.2, recover: 0.3, cd: 3, steps: [{ proj: { speed: 17, range: 10, radius: 0.5, damage: 18, sprite: 'sandblade', element: 'sand', slashing: true, pierce: true } }] }),
      T(15, { id: 'suna_sables', name: 'Sables', icon: '🌪', anim: 'cast', windup: 0.4, recover: 0.3, cd: 9, desc: 'A sandstorm.', steps: [{ zone: { range: 3, duration: 3.5, interval: 0.3, damage: 7, element: 'sand', color: '#e1c16e', kind: 'storm', atTarget: true, pull: 2 } }] }),
      T(35, { id: 'suna_spada', name: 'Desert Spada', icon: '🗡', anim: 'grab', windup: 0.3, recover: 0.35, cd: 8, desc: 'Blades of sand rip through the ground.', steps: [{ hit: { shape: 'line', range: 11, width: 1.2, damage: 40, knockback: 4, stun: 0.5, element: 'sand', slashing: true }, vfx: 'beam', color: '#e1c16e' }] }),
      T(60, { id: 'suna_dry', name: 'Ground Death', icon: '🏜', anim: 'kneel', windup: 0.7, recover: 0.4, cd: 30, desc: 'Drain all moisture from the land around you.', steps: [{ zone: { range: 6, duration: 5, interval: 0.4, damage: 12, element: 'sand', color: '#d7b56d', kind: 'field', status: { dry: 2 } } }] }),
    ],
  },
  moku: {
    name: 'Moku Moku no Mi', en: 'Plume-Plume Fruit', type: 'Logia', rarity: 'rare', color: '#cfd8dc', weight: 1,
    desc: 'Become smoke. Smoker "the White Hunter" pairs it with a Seastone jitte.',
    passive: { logia: true, element: 'smoke' },
    techniques: [
      T(0, { id: 'moku_blow', name: 'White Blow', icon: '☁', anim: 'punch', windup: 0.2, recover: 0.3, cd: 3, steps: [{ proj: { speed: 16, range: 10, radius: 0.6, damage: 18, sprite: 'smokefist', element: 'smoke', knockback: 5, stun: 0.4 } }] }),
      T(15, { id: 'moku_snake', name: 'White Snake', icon: '🐍', anim: 'grab', windup: 0.25, recover: 0.3, cd: 7, desc: 'Smoke tendrils bind the target.', steps: [{ proj: { speed: 14, range: 11, radius: 0.5, damage: 12, sprite: 'smokesnake', element: 'smoke', status: { root: 2 }, homing: 2 } }] }),
      T(35, { id: 'moku_out', name: 'White Out', icon: '🌫', anim: 'cast', windup: 0.4, recover: 0.3, cd: 12, steps: [{ zone: { range: 4, duration: 5, interval: 0.5, damage: 6, element: 'smoke', color: '#eceff1', kind: 'storm', slow: 0.45, status: { root: 0.4 } } }] }),
      T(60, { id: 'moku_launcher', name: 'White Launcher', icon: '🚀', anim: 'thrust', windup: 0.2, recover: 0.3, cd: 6, steps: [{ dash: { dist: 10, time: 0.3, iframes: 0.3, air: true, trail: '#eceff1', hit: { damage: 36, knockback: 8, stun: 0.6, element: 'smoke' } } }] }),
    ],
  },
  pika: {
    name: 'Pika Pika no Mi', en: 'Glint-Glint Fruit', type: 'Logia', rarity: 'legendary', color: '#fff9c4', weight: 0.6,
    desc: 'Become light. Move at the speed of light and kick with its weight. (Admiral Kizaru.)',
    passive: { logia: true, element: 'light' },
    techniques: [
      T(0, { id: 'pika_yasakani', name: 'Yasakani no Magatama', icon: '✨', anim: 'cast', windup: 0.35, recover: 0.4, cd: 6, desc: 'A rain of light bullets.', steps: [{ proj: { speed: 30, range: 12, radius: 0.25, damage: 8, count: 9, spread: 1.0, sprite: 'lightorb', element: 'light' } }] }),
      T(15, { id: 'pika_yata', name: 'Yata no Kagami', icon: '🪞', anim: 'cast', windup: 0.05, recover: 0.05, cd: 2, desc: 'Travel at the speed of light.', steps: [{ teleport: { dist: 12, color: '#fff9c4' } }] }),
      T(35, { id: 'pika_murakumo', name: 'Ama no Murakumo', icon: '⚔', anim: 'slash', windup: 0.2, recover: 0.3, cd: 5, desc: 'A sword of light.', steps: [{ hit: { shape: 'arc', range: 2.6, arc: 2.2, offset: 0.2, damage: 40, knockback: 4, stun: 0.5, slashing: true, element: 'light' }, vfx: 'slash', color: '#fff9c4' }] }),
      T(60, { id: 'pika_amaterasu', name: 'Amaterasu', icon: '☀', anim: 'cast', windup: 0.8, recover: 0.4, cd: 25, steps: [{ hit: { shape: 'line', range: 16, width: 1.6, damage: 90, knockback: 8, stun: 0.8, element: 'light', heavy: true, impactFrame: true, hitShips: true, shipDamage: 300 }, vfx: 'beam', color: '#fff59d' }] }),
    ],
  },
  magu: {
    name: 'Magu Magu no Mi', en: 'Magma-Magma Fruit', type: 'Logia', rarity: 'legendary', color: '#ff5722', weight: 0.6,
    desc: 'Become magma — hotter than fire itself. (Admiral, then Fleet Admiral, Akainu.)',
    passive: { logia: true, element: 'magma', resist: ['fire', 'magma'] },
    techniques: [
      T(0, { id: 'magu_daifunka', name: 'Dai Funka', icon: '🌋', anim: 'punch', windup: 0.3, recover: 0.35, cd: 4, say: 'Dai Funka!', desc: 'Great Eruption.', steps: [{ proj: { speed: 15, range: 11, radius: 0.9, damage: 34, sprite: 'magmafist', size: 1.5, element: 'magma', pierce: true, status: { burn: 4 }, knockback: 6, trail: { color: ['#bf360c', '#ff6f00'], kind: 'fire' } } }] }),
      T(20, { id: 'magu_meigo', name: 'Meigo', icon: '👊', anim: 'thrust', windup: 0.3, recover: 0.35, cd: 8, desc: 'Hell Hound: a magma fist that pierces through.', steps: [{ dash: { dist: 5, time: 0.22, hit: { damage: 55, knockback: 6, stun: 0.8, element: 'magma', status: { burn: 4 }, heavy: true, guardBreak: true } } }] }),
      T(50, { id: 'magu_ryusei', name: 'Ryusei Kazan', icon: '☄', anim: 'summon', windup: 1.0, recover: 0.5, cd: 35, desc: 'Meteor Volcano: a rain of magma fists.', steps: [{ zone: { range: 6, duration: 2.5, interval: 0.2, damage: 24, element: 'magma', color: '#ff5722', kind: 'meteor', status: { burn: 3 } } }] }),
    ],
  },
  yami: {
    name: 'Yami Yami no Mi', en: 'Dark-Dark Fruit', type: 'Logia', rarity: 'legendary', color: '#311b92', weight: 0.5,
    desc: 'Darkness that swallows everything — even other Devil Fruit powers. Unlike other Logia, it cannot become intangible. (Marshall D. Teach.)',
    passive: { element: 'dark', noIntangible: true, damageTaken: 1.15 },
    techniques: [
      T(0, { id: 'yami_kurouzu', name: 'Kurouzu', icon: '🕳', anim: 'grab', windup: 0.3, recover: 0.3, cd: 6, desc: 'Black Vortex: drag your enemy to you.', steps: [{ pull: { range: 8, strength: 14, stun: 0.6 } }] }),
      T(15, { id: 'yami_blackhole', name: 'Black Hole', icon: '⚫', anim: 'cast', windup: 0.5, recover: 0.4, cd: 14, steps: [{ zone: { range: 4, duration: 4, interval: 0.4, damage: 10, element: 'dark', color: '#311b92', kind: 'dark', pull: 4, slow: 0.4 } }] }),
      T(35, { id: 'yami_nullify', name: 'Dark Hand', icon: '✋', anim: 'grab', windup: 0.2, recover: 0.3, cd: 18, desc: 'Touch an enemy to nullify their Devil Fruit.', steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.2, offset: 0.2, damage: 15, stun: 0.8, status: { seastone: 8 }, unblockable: true } }] }),
      T(60, { id: 'yami_liberation', name: 'Liberation', icon: '💥', anim: 'cast', windup: 0.7, recover: 0.4, cd: 25, desc: 'Release everything the darkness swallowed.', steps: [{ hit: { shape: 'circle', range: 5, damage: 70, knockback: 12, stun: 0.8, element: 'dark', heavy: true, impactFrame: true }, vfx: 'ring', color: '#7e57c2' }] }),
    ],
  },
};

export const FRUIT_IDS = Object.keys(FRUITS);

for (const [fid, f] of Object.entries(FRUITS)) {
  registerAbilities(f.techniques.map((t) => ({ ...t, source: 'fruit:' + fid, fruit: fid })), 'fruit:' + fid);
  // derive runtime passive flags
  f.logia = !!(f.passive && f.passive.logia);
  f.rubber = !!(f.passive && f.passive.rubber);
  f.resist = f.passive?.resist || [];
  f.weakTo = f.passive?.weakTo || [];
}

export const FRUIT_RARITY = {
  common: { label: 'Common', color: '#b2bec3' },
  uncommon: { label: 'Uncommon', color: '#55efc4' },
  rare: { label: 'Rare', color: '#74b9ff' },
  legendary: { label: 'Legendary', color: '#fdcb6e' },
  mythical: { label: 'Mythical', color: '#ff7675' },
};

export function unlockedFruitTechniques(fruitId, mastery) {
  const f = FRUITS[fruitId];
  if (!f) return [];
  return f.techniques.filter((t) => mastery >= t.mastery).map((t) => t.id);
}
