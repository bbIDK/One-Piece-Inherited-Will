// Devil Fruits. Eating one grants its powers and takes away your ability to
// swim — the sea itself rejects you. Eating a second one kills you.
// When a user dies, their fruit is reborn inside an ordinary fruit somewhere
// in the world (canon), which the game tracks as a rumour.
//
// A fruit's base techniques (`techniques`) are all yours the moment you eat
// it, as in the anime. Fighting worthy opponents with it raises its mastery
// (0-100): its blows grow stronger, and it opens up the fruit's forms (Gum-Gum's
// Gears...) and at last its awakening — see data/fruitForms.js. (The number in
// `T(n, ...)` is from when techniques unlocked one by one: it's only an order
// now. `more` holds techniques that aren't part of the base set — a form's
// activation, a heavy — registered all the same, for NPCs who use them too.)
//
// Each fruit plays as the anime shows it: a technique is data (steps of the
// primitives in game/abilities.js), and what goes beyond a blow, a shot or a
// field — a ROOM and the surgeon's techniques in it, ice that makes a road of
// the sea, a cage of strings that closes in, a barrier, shots sent back or
// swallowed, a body flown into the sky — lives in game/room.js, powers.js and
// flight.js. The Logia, Paramecia and Zoan rules (intangibility and what gets
// through it, rubber, blades that can't cut) are in game/combat.js.
import { registerAbilities } from '../game/abilities.js';
import { attachKits, AWAKEN_MASTERY } from './fruitForms.js';

const T = (mastery, a) => ({ ...a, mastery });
// (a look that's all shadow: Moria's Doppelman)
const SHADOW = { skin: '#263238', top: '#263238', bottom: '#212121', hairColor: '#212121', shoes: '#212121', hand: '#263238', hair: 'spiky', eyeColor: '#ff5252' };

export const FRUITS = {
  // ------------------------------------------------------------- PARAMECIA
  gomu: {
    name: 'Gomu Gomu no Mi', en: 'Gum-Gum Fruit', type: 'Paramecia', rarity: 'mythical', color: '#e57373', weight: 0.6,
    desc: 'Turns the body into rubber: blunt blows and lightning barely touch it, and its fists land even on a body made of lightning. Or so the World Government would have you believe...',
    passive: { rubber: true }, stretch: true,
    techniques: [
      T(0, { id: 'gomu_pistol', name: 'Gum-Gum Pistol', icon: '👊', anim: 'punch', windup: 0.12, recover: 0.25, cd: 2.5, say: 'Gomu Gomu no... Pistol!', steps: [{ proj: { speed: 26, range: 8, radius: 0.35, damage: 16, sprite: 'gomufist', stretch: true, knockback: 5, stun: 0.3 } }] }),
      T(10, { id: 'gomu_gatling', name: 'Gum-Gum Gatling', icon: '🔫', anim: 'punch', windup: 0.2, recover: 0.3, cd: 6, say: 'Gomu Gomu no... Gatling!', steps: [{ hit: { shape: 'arc', range: 3.2, arc: 0.9, offset: 0.3, damage: 5, knockback: 0.8, stun: 0.15, duration: 0.9, interval: 0.08 }, vfx: 'fist' }] }),
      T(20, { id: 'gomu_rocket', name: 'Gum-Gum Rocket', icon: '🚀', anim: 'thrust', windup: 0.15, recover: 0.2, cd: 4, desc: 'Launch yourself like a slingshot.', steps: [{ dash: { dist: 9, time: 0.3, iframes: 0.25, air: true, hit: { damage: 14, knockback: 6, stun: 0.4 } } }] }),
      T(30, { id: 'gomu_bazooka', name: 'Gum-Gum Bazooka', icon: '💥', anim: 'heavy', windup: 0.35, recover: 0.35, cd: 8, say: 'Gomu Gomu no... BAZOOKA!', steps: [{ hit: { shape: 'arc', range: 2.4, arc: 1.2, offset: 0.4, damage: 36, knockback: 14, stun: 0.8, heavy: true, guardBreak: true, impactFrame: true, hitShips: true } }] }),
      T(15, { id: 'gomu_balloon', name: 'Gum-Gum Balloon', anim: 'flex', windup: 0.1, recover: 0.25, cd: 9, say: 'Gomu Gomu no... Balloon!', desc: 'Blow yourself up like a balloon: bullets and cannonballs bounce off you and fly back the way they came.',
        steps: [{ buff: { id: 'balloon', name: 'Balloon', dur: 1.8, mods: { speedMul: 0.35 }, reflect: 1.8, reflectWord: 'BOING!', look: { bulk: 1.9 } } }] }),
    ],
    // (the Gears: Second and Fourth are switched on by these — see data/fruitForms.js — and so is Third by
    // its own; the old Gear Third and Gear Fifth stay for whoever uses them as single moves)
    more: [
      T(45, { id: 'gomu_gear2', name: 'Gear Second', icon: '♨', anim: 'kneel', windup: 0.4, recover: 0.1, cd: 30, say: 'Gear... Second!', desc: 'Pump blood at high speed: faster and stronger, every move a Jet — at a cost when it wears off.',
        steps: [{ fx: { burst: 20, color: '#ffcdd2', kind: 'smoke' } }, { at: 0.4, buff: { id: 'gear2', form: 'gear2', name: 'Gear Second', dur: 25, mods: { speedMul: 1.35, damage: 1.25, atkSpeed: 1.3 }, aura: 'rgba(255,138,128,0.7)', steam: true, look: { skin: '#f4a39c' }, after: { id: 'gear2_spent', name: 'Spent', dur: 6, mods: { speedMul: 0.85, atkSpeed: 0.85 } } } }] }),
      T(60, { id: 'gomu_gear3', name: 'Gear Third: Gigant Pistol', icon: '🦴', anim: 'pistol', windup: 0.7, recover: 0.5, cd: 18, say: 'Gear Third... Gigant Pistol!', steps: [{ proj: { speed: 16, range: 10, radius: 1.6, damage: 80, sprite: 'gomufist', size: 4, stretch: true, pierce: true, knockback: 14, stun: 1, heavy: true, hitShips: true, shipDamage: 200 } }] }),
      T(80, { id: 'gomu_gear4', name: 'Gear Fourth: Boundman', icon: '🎈', anim: 'cast', windup: 0.8, recover: 0.2, cd: 60, cost: { haki: 40 }, requiresHaki: 'armament', say: 'Gear... FOURTH!', desc: 'Inflate your Haki-hardened muscles and bounce: enormous power for a short time — then you\'re exhausted.',
        steps: [{ fx: { ring: 3, color: '#b71c1c', impact: 0.1 } }, { at: 0.8, buff: { id: 'gear4', form: 'gear4', name: 'Boundman', dur: 22, mods: { damage: 2.2, defMul: 0.6, speedMul: 1.2 }, aura: 'rgba(183,28,28,0.9)', forceArmament: true, look: { bulk: 1.45, boundman: true }, drain: { haki: 1.5 },
          after: { id: 'gear4_spent', name: 'Exhausted', dur: 12, mods: { speedMul: 0.7, atkSpeed: 0.75, damage: 0.8 }, noHaki: true, noForms: true } } }] }),
      T(100, { id: 'gomu_gear5', name: 'Gear Fifth', icon: '☀', anim: 'cast', windup: 1.0, recover: 0.2, cd: 180, cost: { haki: 60 }, requiresHaki: 'conqueror', say: '...Drums of Liberation.', desc: 'The fruit\'s true name is Hito Hito no Mi, Model: Nika. The warrior of liberation, bringer of joy.',
        steps: [{ fx: { ring: 6, color: '#ffffff', flash: 0.6, impact: 0.2, text: 'SUN GOD NIKA' } }, { at: 1.0, buff: { id: 'gear5', name: 'Gear Fifth', dur: 30, mods: { damage: 3, defMul: 0.45, speedMul: 1.4, atkSpeed: 1.4 }, aura: 'rgba(255,255,255,1)', look: { hairColor: '#ffffff', top: '#ffffff', bottom: '#ffffff', nika: true } } }] }),
    ],
  },
  gura: {
    name: 'Gura Gura no Mi', en: 'Tremor-Tremor Fruit', type: 'Paramecia', rarity: 'legendary', color: '#e0f7fa', weight: 0.4,
    desc: 'The power to destroy the world: quakes in the air, the ground and the sea that crack the very sky and throw everything off its feet. Once eaten by Whitebeard.',
    techniques: [
      T(0, { id: 'gura_punch', name: 'Quake Punch', icon: '✊', anim: 'quake', windup: 0.25, recover: 0.3, cd: 4, desc: 'A fist wrapped in a quake bubble: the air in front of it cracks like glass.', steps: [{ hit: { shape: 'arc', range: 3.0, arc: 1.2, offset: 0.3, damage: 26, knockback: 10, stun: 0.6, element: 'quake', heavy: true, guardBreak: true, launch: 3, shake: 0.4 }, vfx: 'ring' }] }),
      T(20, { id: 'gura_kaishin', name: 'Shima Yurashi', icon: '🌐', anim: 'quake', windup: 0.45, recover: 0.4, cd: 9, desc: 'Island Shaker: grab the air and shake it — the ground heaves and everyone around you is thrown off their feet.', steps: [{ hit: { shape: 'circle', range: 4.5, damage: 40, knockback: 12, stun: 0.9, element: 'quake', heavy: true, guardBreak: true, launch: 6, impactFrame: true, shake: 0.8, hitShips: true }, vfx: 'ring' }] }),
      T(45, { id: 'gura_wave', name: 'Gekishin', icon: '🌊', anim: 'quake', windup: 0.5, recover: 0.4, cd: 12, desc: 'Violent Quake: a quake bubble punched into the air sends a shockwave ripping through the air and the ground (and the sea), throwing everything in its path.', steps: [{ hit: { shape: 'line', range: 12, width: 3, damage: 55, knockback: 14, stun: 1, element: 'quake', heavy: true, unblockable: true, launch: 5, shake: 0.7, hitShips: true, shipDamage: 250 }, vfx: 'beam', color: '#e0f7fa' }] }),
      T(75, { id: 'gura_tsunami', name: 'Kaishin', icon: '🌋', anim: 'slam', windup: 0.9, recover: 0.5, cd: 40, desc: 'Seaquake: strike the very air and the sea rises — everything nearby is crushed, ships are swamped, and the ground goes on shaking.',
        steps: [{ hit: { shape: 'circle', range: 8, damage: 90, knockback: 16, stun: 1.2, element: 'quake', heavy: true, unblockable: true, launch: 7, impactFrame: true, shake: 1.2, hitShips: true, shipDamage: 500 }, vfx: 'ring' },
          { zone: { range: 8, duration: 3, interval: 0.5, damage: 5, element: 'quake', color: '#e0f7fa', kind: 'quake', slow: 0.5 } }] }),
    ],
  },
  ope: {
    name: 'Ope Ope no Mi', en: 'Op-Op Fruit', type: 'Paramecia', rarity: 'legendary', color: '#81d4fa', weight: 0.4,
    desc: 'Open a ROOM — a sphere of space that stays where you cast it — and inside it you are a surgeon: you can swap, lift, cut and remove whatever is in it, and your blows pass through any body. Its ultimate technique grants eternal youth, at the cost of the user\'s life.',
    // (ROOM, Shambles, Amputate, Mes and Takt on the first five skill keys; the rest of the surgeon's
    // base on keys of your choosing — the skills panel, or Skills (K))
    techniques: [
      T(0, { id: 'ope_room', name: 'ROOM', icon: '🔵', anim: 'raise', windup: 0.35, recover: 0.25, cd: 18, say: 'ROOM.',
        desc: 'Open a ROOM: a pale blue sphere that stays where you cast it (it grows with your mastery). Your other techniques work inside it — draw the fight in.',
        steps: [{ zone: { kind: 'room', range: 6.5, grow: 0.035, duration: 16, damage: 0, color: '#81d4fa', single: true, whileOwner: true } }, { buff: { id: 'room', name: 'ROOM', dur: 16 } }] }),
      T(10, { id: 'ope_shambles', name: 'Shambles', icon: '🔀', anim: 'point', windup: 0.12, recover: 0.15, cd: 2.5, room: 'need', say: 'Shambles.',
        desc: 'In your Room: change places with whoever you aim at — a foe mid-swing finds themselves somewhere else — or be wherever in it you aim.',
        steps: [{ power: { kind: 'shambles' } }] }),
      T(20, { id: 'ope_amputate', name: 'Amputate', icon: '🗡', anim: 'slash', windup: 0.25, recover: 0.3, cd: 7, room: 'need', say: 'Amputate!',
        desc: 'In your Room: a vast slash through everything in front of you. It cuts without killing — the pieces live, helpless, for a while.',
        steps: [{ hit: { shape: 'arc', range: 4.2, arc: 2.4, offset: 0.2, damage: 22, knockback: 1, stun: 0.3, slashing: true, nonLethal: true, status: { pieces: 2.4 } }, vfx: 'slash', color: '#81d4fa' }] }),
      T(40, { id: 'ope_mes', name: 'Mes', icon: '💙', anim: 'thrust', windup: 0.18, recover: 0.3, cd: 14, room: 'need', say: 'Mes.',
        desc: 'In your Room: push a hand into the target and take their heart out in a cube. Without it they can do nothing for a long while — and every blow lands harder.',
        steps: [{ hit: { shape: 'arc', range: 1.9, arc: 1.0, offset: 0.2, damage: 12, knockback: 0, stun: 0.3, unblockable: true, status: { heartless: 3.5 } } }] }),
      T(30, { id: 'ope_takt', name: 'Takt', anim: 'raise', windup: 0.35, recover: 0.35, cd: 12, room: 'need', say: 'Takt.',
        desc: 'In your Room: raise a finger, and everyone in the Room is lifted into the air, held there helpless — and slammed back down.',
        steps: [{ power: { kind: 'takt', h: 2.6, hold: 1.1, damage: 26, blow: true, unblockable: true } }] }),
      T(65, { id: 'ope_injection', name: 'Injection Shot', anim: 'thrust', windup: 0.25, recover: 0.35, cd: 9, room: 'weak', say: 'Injection Shot!',
        desc: 'Charge in a blur and run the target through with your sword. Half as strong outside your Room.',
        steps: [{ dash: { dist: 7, time: 0.18, iframes: 0.15, hit: { damage: 58, knockback: 7, stun: 0.6, slashing: true, guardBreak: true } } }] }),
      T(75, { id: 'ope_gamma', name: 'Gamma Knife', icon: '☢', anim: 'thrust', windup: 0.35, recover: 0.35, cd: 18, room: 'need', say: 'Gamma Knife.',
        desc: 'In your Room: a blade of gamma rays that destroys the organs from the inside and leaves the body unmarked. Nothing defends against it.',
        steps: [{ hit: { shape: 'line', range: 3.4, width: 0.9, damage: 72, knockback: 1, stun: 1.0, unblockable: true, trueDamage: true, status: { bleed: 4 } }, vfx: 'beam', color: '#b388ff' }] }),
      T(85, { id: 'ope_radio', name: 'Radio Knife', anim: 'slash', windup: 0.4, recover: 0.4, cd: 20, room: 'need', say: 'Radio Knife!',
        desc: 'In your Room: an electrified slash that cuts the target to pieces — and the shock keeps the pieces from coming back together for a long while.',
        steps: [{ hit: { shape: 'arc', range: 4, arc: 2.2, offset: 0.2, damage: 64, knockback: 2, stun: 0.5, slashing: true, status: { pieces: 3, shock: 2 } }, vfx: 'slash', color: '#fff176' }] }),
    ],
    // (Counter Shock is the surgeon's heavy blow; Shock Wille belongs to the awakened K-ROOM)
    more: [
      T(55, { id: 'ope_counter', name: 'Counter Shock', icon: '⚡', anim: 'palm', windup: 0.2, recover: 0.3, cd: 10, room: 'weak', say: 'Counter Shock!',
        desc: 'A hand on the target and a shock like a defibrillator\'s. Half as strong outside your Room.',
        steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 42, knockback: 3, stun: 1.0, element: 'lightning', status: { shock: 1.5 } }, vfx: 'ring', color: '#fff176' }] }),
      T(100, { id: 'ope_shockwille', name: 'K-Room: Shock Wille', anim: 'thrust', windup: 0.5, recover: 0.5, cd: 45, cost: { haki: 35 }, requiresHaki: 'armament', say: 'K-Room... Shock Wille!',
        desc: 'A Room coated in Haki, opened inside the target\'s own body on your sword\'s point — and a shockwave set off within it. Needs no other Room.',
        steps: [{ hit: { shape: 'arc', range: 2.0, arc: 0.9, offset: 0.2, damage: 130, knockback: 12, stun: 1.2, unblockable: true, trueDamage: true, heavy: true, impactFrame: true, shake: 0.7 }, vfx: 'ring', color: '#81d4fa' }] }),
    ],
  },
  bara: {
    name: 'Bara Bara no Mi', en: 'Chop-Chop Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#ff8a65', weight: 3,
    desc: 'Split your body into pieces. Blades cannot hurt you — but your feet must stay on the ground. (Buggy the Clown\'s fruit.)',
    passive: { immuneSlash: true },
    techniques: [
      T(0, { id: 'bara_cannon', name: 'Chop-Chop Cannon', icon: '🤡', anim: 'cross', windup: 0.15, recover: 0.25, cd: 3, say: 'Bara Bara Ho!', steps: [{ proj: { speed: 20, range: 9, radius: 0.35, damage: 14, sprite: 'barafist', color: '#ffccbc', knockback: 3, stun: 0.3 } }] }),
      T(20, { id: 'bara_festival', name: 'Chop-Chop Festival', icon: '🎪', anim: 'cast', windup: 0.3, recover: 0.4, cd: 10, desc: 'Scatter into a hundred pieces that pummel everything nearby.', steps: [{ hit: { shape: 'circle', range: 3.2, damage: 6, knockback: 1.5, stun: 0.15, duration: 1.2, interval: 0.15 }, vfx: 'ring' }] }),
      T(40, { id: 'bara_escape', name: 'Emergency Escape', icon: '🎈', anim: 'fly', windup: 0.05, recover: 0.1, cd: 8, desc: 'Your pieces fly off every which way and come back together somewhere safer.', steps: [{ dash: { dist: 7, time: 0.25, iframes: 0.3, air: true } }] }),
    ],
  },
  bomu: {
    name: 'Bomu Bomu no Mi', en: 'Bomb-Bomb Fruit', type: 'Paramecia', rarity: 'common', color: '#ffab40', weight: 5,
    desc: 'Make any part of your body explode — and survive it. An explosion can be blocked, never parried. (Mr. 5 of Baroque Works.)',
    passive: { resist: ['explosion'] },
    techniques: [
      T(0, { id: 'bomu_kick', name: 'Kick Bomb', icon: '💣', anim: 'kick', windup: 0.2, recover: 0.3, cd: 3, steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.4, offset: 0.3, damage: 18, knockback: 7, stun: 0.4, element: 'explosion', blast: true }, vfx: 'ring', color: '#ffab40' }] }),
      T(15, { id: 'bomu_nose', name: 'Nose Fancy Cannon', icon: '👃', anim: 'flick', windup: 0.25, recover: 0.3, cd: 5, desc: 'Flick an explosive... bogey. Disgusting and effective.', steps: [{ proj: { speed: 18, range: 12, radius: 0.2, damage: 6, sprite: 'orb', color: '#aed581', explode: { range: 2, damage: 24 } } }] }),
      T(40, { id: 'bomu_breeze', name: 'Breeze Breath Bomb', icon: '🌬', anim: 'breath', windup: 0.35, recover: 0.3, cd: 9, steps: [{ hit: { shape: 'arc', range: 4, arc: 1.2, offset: 0.2, damage: 32, knockback: 8, stun: 0.6, element: 'explosion', heavy: true, blast: true }, vfx: 'ring', color: '#ffab40' }] }),
    ],
  },
  hana: {
    name: 'Hana Hana no Mi', en: 'Flower-Flower Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#f48fb1', weight: 2.5,
    desc: 'Sprout copies of your body parts on any surface — including your enemies. (Nico Robin.)',
    techniques: [
      T(0, { id: 'hana_clutch', name: 'Seis Fleur: Clutch', icon: '🌸', anim: 'hana', windup: 0.25, recover: 0.3, cd: 5, say: 'Seis Fleur... Clutch!', desc: 'Sprout arms on the target and bend them backwards.', steps: [{ zone: { range: 1.2, duration: 0.3, interval: 0.3, damage: 24, color: '#f48fb1', atTarget: true, kind: 'arms', status: { root: 1.2 } } }] }),
      T(20, { id: 'hana_mil', name: 'Mil Fleur', icon: '🌺', anim: 'hana', windup: 0.4, recover: 0.4, cd: 10, desc: 'A thousand arms bloom around you and strike.', steps: [{ hit: { shape: 'circle', range: 3.6, damage: 7, knockback: 1, stun: 0.3, duration: 1.0, interval: 0.14 }, vfx: 'ring', color: '#f48fb1' }] }),
      T(50, { id: 'hana_gigante', name: 'Mil Fleur: Gigantesco Mano', icon: '✋', anim: 'hana', windup: 0.5, recover: 0.4, cd: 14, desc: 'A thousand arms bloom into two giant hands that slam down.', steps: [{ zone: { range: 2.6, duration: 0.3, interval: 0.3, damage: 60, color: '#f48fb1', atTarget: true, kind: 'arms', status: { root: 1.5 } } }] }),
    ],
  },
  ito: {
    name: 'Ito Ito no Mi', en: 'String-String Fruit', type: 'Paramecia', rarity: 'legendary', color: '#f8bbd0', weight: 0.5,
    desc: 'Create strings sharp enough to cut steel and strong enough to puppet people — or to hook onto the clouds and walk the sky. (Donquixote Doflamingo.)',
    techniques: [
      T(0, { id: 'ito_overheat', name: 'Overheat', icon: '🧵', anim: 'point', windup: 0.3, recover: 0.3, cd: 5, desc: 'A whip of strings, red-hot, lashed in a straight line.', steps: [{ hit: { shape: 'line', range: 9, width: 0.6, damage: 24, knockback: 4, stun: 0.4, slashing: true, element: 'fire' }, vfx: 'beam', color: '#ff8a80' }] }),
      T(15, { id: 'ito_parasite', name: 'Parasite', icon: '🎭', anim: 'point', windup: 0.25, recover: 0.3, cd: 12, desc: 'Strings into the target\'s nerves: a puppet on your strings, they can neither move nor fight for a while.', steps: [{ proj: { speed: 22, range: 10, radius: 0.4, damage: 8, sprite: 'string', status: { puppet: 2.5 }, stun: 0.5 } }] }),
      T(35, { id: 'ito_fivecolor', name: 'Goshikito', icon: '🖐', anim: 'claw', windup: 0.25, recover: 0.3, cd: 7, desc: 'Five Color String: a string from each fingertip, raked down through whatever is in front of you.', steps: [{ hit: { shape: 'arc', range: 3.4, arc: 1.4, offset: 0.2, damage: 34, knockback: 3, stun: 0.5, slashing: true }, vfx: 'slash', color: '#f8bbd0' }] }),
      T(40, { id: 'ito_skypath', name: 'Sora no Michi', desc: 'Sky Path: hook your strings onto the clouds and walk the sky. Fly — or press Space again in the air.',
        flight: { style: 'float', ride: 'strings', gauge: 16, speed: 10, climb: 6, ceiling: 40, sea: 3.5, color: '#f8bbd0' } }),
      T(70, { id: 'ito_birdcage', name: 'Birdcage', icon: '🕸', anim: 'summon', windup: 0.8, recover: 0.4, cd: 45, desc: 'A cage of strings round the whole area: nobody inside gets out, it closes in — and its strings cut whatever touches them.', steps: [{ zone: { range: 9, duration: 9, interval: 0.4, damage: 14, color: '#f8bbd0', kind: 'cage', cage: true, shrink: 0.55, edge: 1.2 } }] }),
    ],
  },
  mochi: {
    name: 'Mochi Mochi no Mi', en: 'Mochi-Mochi Fruit', type: 'Special Paramecia', rarity: 'legendary', color: '#fff8e1', weight: 0.5,
    desc: 'A special Paramecia that behaves like a Logia: your body is mochi — it stretches, it binds, and blows sometimes pass through a hole you make in it. (Charlotte Katakuri.)',
    passive: { logiaLike: true, intangible: 0.35, weakTo: ['fire'] },
    techniques: [
      T(0, { id: 'mochi_tsuki', name: 'Mochi Tsuki', icon: '🍡', anim: 'punch', windup: 0.25, recover: 0.3, cd: 4, desc: 'Your arm stretches into a great fist of mochi.', steps: [{ proj: { speed: 18, range: 8, radius: 0.6, damage: 22, sprite: 'mochi', color: '#fff8e1', knockback: 6, stun: 0.5, size: 1.5, stretch: true } }] }),
      T(20, { id: 'mochi_zangiri', name: 'Zan Giri Mochi', icon: '🔱', anim: 'thrust', windup: 0.3, recover: 0.3, cd: 7, desc: 'A trident of hardened mochi, thrust straight through.', steps: [{ hit: { shape: 'line', range: 4.5, width: 1.2, damage: 36, knockback: 5, stun: 0.6, slashing: true }, vfx: 'beam', color: '#fff8e1' }] }),
      T(35, { id: 'mochi_bind', name: 'Sticky Mochi', anim: 'grab', windup: 0.35, recover: 0.35, cd: 11, desc: 'The ground under the target turns to sticky mochi: whoever is in it is stuck fast.', steps: [{ zone: { range: 2.2, duration: 3.5, interval: 0.5, damage: 6, color: '#fff8e1', atTarget: true, kind: 'field', slow: 0.3, status: { root: 0.6 } } }] }),
      T(50, { id: 'mochi_chikara', name: 'Chikara Mochi', icon: '💪', anim: 'slam', windup: 0.45, recover: 0.4, cd: 12, desc: 'Giant mochi fists rain down.', steps: [{ zone: { range: 3, duration: 1.2, interval: 0.2, damage: 18, color: '#fff8e1', atTarget: true, kind: 'fists' } }] }),
    ],
  },
  horo: {
    name: 'Horo Horo no Mi', en: 'Hollow-Hollow Fruit', type: 'Paramecia', rarity: 'uncommon', color: '#ce93d8', weight: 3,
    desc: 'Create ghosts. Negative Hollows drift through walls and drain the will to live from anyone they pass through. (Perona.)',
    techniques: [
      T(0, { id: 'horo_negative', name: 'Negative Hollow', icon: '👻', anim: 'point', windup: 0.3, recover: 0.3, cd: 8, desc: '"I\'m so sorry I was born..." A ghost drifts through anything in its way and into the target, who collapses in despair.', steps: [{ proj: { speed: 10, range: 12, radius: 0.5, damage: 4, sprite: 'ghost', color: '#e1bee7', homing: 3, status: { despair: 3 }, stun: 2.2, unblockable: true, passWalls: true } }] }),
      T(20, { id: 'horo_mini', name: 'Mini Hollow', icon: '💫', anim: 'cast', windup: 0.3, recover: 0.3, cd: 7, desc: 'Little ghosts float to the target — and "Ghost Rap": they burst.', steps: [{ proj: { speed: 11, range: 10, radius: 0.3, damage: 6, count: 4, spread: 0.9, sprite: 'ghost', size: 0.7, color: '#e1bee7', homing: 4, passWalls: true, explode: { range: 1.2, damage: 12, colors: ['#e1bee7', '#fff'] } } }] }),
      T(45, { id: 'horo_toku', name: 'Tokuhollow', anim: 'cast', windup: 0.7, recover: 0.4, cd: 16, desc: 'A great ghost that floats after the target and bursts like a bomb.', steps: [{ proj: { speed: 6.5, range: 11, radius: 1.0, damage: 10, sprite: 'ghost', size: 2.2, color: '#e1bee7', homing: 2.5, passWalls: true, explode: { range: 3.2, damage: 44, colors: ['#e1bee7', '#ffffff'] } } }] }),
    ],
  },
  kage: {
    name: 'Kage Kage no Mi', en: 'Shadow-Shadow Fruit', type: 'Paramecia', rarity: 'rare', color: '#455a64', weight: 1.2,
    desc: 'Manipulate shadows, steal them, and fight with a living shadow double. One whose shadow is stolen burns in the sunlight. (Gecko Moria.)',
    techniques: [
      T(0, { id: 'kage_brickbat', name: 'Brick Bat', icon: '🦇', anim: 'cast', windup: 0.25, recover: 0.3, cd: 4, desc: 'Your shadow breaks into a swarm of bats.', steps: [{ proj: { speed: 14, range: 11, radius: 0.3, damage: 7, count: 5, spread: 0.6, sprite: 'bat', color: '#263238', homing: 2 } }] }),
      T(20, { id: 'kage_steal', name: 'Shadow Steal', icon: '🌑', anim: 'grab', windup: 0.35, recover: 0.3, cd: 16, desc: 'Cut away the target\'s shadow: without it they take more harm — and out in the sunlight they burn.', steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.0, offset: 0.2, damage: 18, stun: 0.8, status: { shadowless: 12 }, unblockable: true } }] }),
      T(40, { id: 'kage_doppelman', name: 'Doppelman', icon: '👤', anim: 'cast', windup: 0.3, recover: 0.2, cd: 30, desc: 'Your shadow peels away and fights beside you as a body of its own.',
        steps: [{ summon: { archetype: 'brute', count: 1, name: 'Doppelman', duration: 18, color: '#263238', look: SHADOW, moves: ['brawl_tackle'], hpMul: 0.8 } }, { buff: { id: 'doppel', name: 'Doppelman', dur: 18, mods: { damage: 1.15 }, aura: 'rgba(38,50,56,0.6)' } }] }),
      T(60, { id: 'kage_tsuno', name: 'Tsuno-Tokage', anim: 'cast', windup: 0.6, recover: 0.4, cd: 12, desc: 'Horned Lizard: your shadow runs along the ground to the target and bursts up as a spike under them.', steps: [{ zone: { range: 1.8, duration: 0.6, interval: 0.3, damage: 40, color: '#37474f', atTarget: true, kind: 'field' } }] }),
    ],
  },
  doku: {
    name: 'Doku Doku no Mi', en: 'Venom-Venom Fruit', type: 'Paramecia', rarity: 'rare', color: '#8e24aa', weight: 1.2,
    desc: 'Produce and control lethal poison. (Magellan, chief warden of Impel Down.)',
    passive: { resist: ['poison'] },
    techniques: [
      T(0, { id: 'doku_fist', name: 'Poison Fist', icon: '☠', anim: 'punch', windup: 0.15, recover: 0.25, cd: 3, steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 12, knockback: 3, stun: 0.3, element: 'poison', status: { poison: 5 } } }] }),
      T(20, { id: 'doku_hydra', name: 'Hydra', icon: '🐍', anim: 'cast', windup: 0.4, recover: 0.4, cd: 9, say: 'Hydra!', steps: [{ proj: { speed: 13, range: 12, radius: 0.7, damage: 26, count: 3, spread: 0.4, sprite: 'hydra', element: 'poison', status: { poison: 6 }, homing: 1.5, trail: { color: '#8e24aa', kind: 'smoke' } } }] }),
      T(50, { id: 'doku_venom', name: 'Venom Demon', icon: '👹', anim: 'cast', windup: 0.8, recover: 0.5, cd: 40, desc: 'Venom Demon: Hell\'s Judgement — a giant of poison, and everything around it rots.', steps: [{ zone: { range: 4.5, duration: 8, interval: 0.5, damage: 12, element: 'poison', status: { poison: 4 }, color: '#8e24aa', kind: 'field' } }] }),
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
    desc: 'Create barriers nothing can break: whatever comes at them stops dead. (Bartolomeo.)',
    techniques: [
      T(0, { id: 'bari_barrier', name: 'Barrier', icon: '🛡', anim: 'block', windup: 0.05, recover: 0.1, cd: 10, desc: 'An unbreakable wall in front of you: nothing gets through it from the front — blows, shots, blasts. From behind, you\'re open.',
        steps: [{ buff: { id: 'barrier', name: 'Barrier', dur: 3, barrier: 'front', mods: { speedMul: 0.6 }, aura: 'rgba(179,229,252,0.6)' } }] }),
      T(20, { id: 'bari_crash', name: 'Barrier Crash', icon: '🧱', anim: 'thrust', windup: 0.2, recover: 0.3, cd: 7, desc: 'Charge behind a barrier and ram everything in your way.', steps: [{ dash: { dist: 7, time: 0.25, iframes: 0.3, hit: { damage: 30, knockback: 9, stun: 0.6, heavy: true, guardBreak: true } } }] }),
      T(40, { id: 'bari_ball', name: 'Barrier Ball', anim: 'block', windup: 0.05, recover: 0.1, cd: 20, desc: 'A sphere of barrier all round you: nothing gets in at all — but you can do nothing from inside it either.',
        steps: [{ buff: { id: 'barrier_ball', name: 'Barrier Ball', dur: 3, barrier: 'all', hold: true, mods: { speedMul: 0.05 } } }] }),
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
      T(20, { id: 'doru_lock', name: 'Candle Lock', icon: '🔒', anim: 'cast', windup: 0.3, recover: 0.3, cd: 11, desc: 'Wax hardens round the target\'s feet and locks them in place.', steps: [{ zone: { range: 1.5, duration: 0.4, interval: 0.4, damage: 10, color: '#fff8e1', atTarget: true, status: { root: 2.5 } } }] }),
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
    desc: 'Paw pads that repel anything — blows, shots, the very air, even pain, even people clean across the world. (Bartholomew Kuma.)',
    techniques: [
      T(0, { id: 'nikyu_paw', name: 'Pad Ho', icon: '🐾', anim: 'palm', windup: 0.25, recover: 0.3, cd: 4, desc: 'A paw-shaped shockwave of repelled air.', steps: [{ proj: { speed: 24, range: 12, radius: 0.5, damage: 20, sprite: 'paw', pierce: true, knockback: 8, stun: 0.4 } }] }),
      T(20, { id: 'nikyu_repel', name: 'Repel', icon: '✋', anim: 'spread', windup: 0.02, recover: 0.1, cd: 8, desc: 'Repel everything around you — blows, people, and the shots fired at you, which fly back the way they came.',
        steps: [{ hit: { shape: 'circle', range: 2.2, damage: 10, knockback: 12, stun: 0.4 }, vfx: 'ring', color: '#ffffff' }, { self: { iframes: 0.4 } }, { buff: { id: 'repel', dur: 0.9, reflect: 2.4, reflectWord: 'REPEL!' } }] }),
      T(45, { id: 'nikyu_travel', name: 'Send Flying', icon: '✈', anim: 'palm', windup: 0.3, recover: 0.4, cd: 16, desc: '"If you were to take a trip, where would you go?" A paw on the target, and they\'re repelled clean off the field.',
        steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.0, offset: 0.2, damage: 18, knockback: 4, stun: 1.2, fling: 24 } }] }),
      T(70, { id: 'nikyu_ursus', name: 'Ursus Shock', icon: '💣', anim: 'cast', windup: 1.0, recover: 0.5, cd: 30, desc: 'Compress the air into a paw-shaped bomb.', steps: [{ proj: { speed: 7, range: 9, radius: 1.2, damage: 20, sprite: 'paw', size: 2.5, pierce: true, explode: { range: 4.5, damage: 110, colors: ['#ffffff', '#e0f7fa', '#b2ebf2'] } } }] }),
      T(85, { id: 'nikyu_pain', name: 'Pain Extraction', anim: 'pray', windup: 0.5, recover: 0.3, cd: 75, desc: 'Push the pain and fatigue out of your own body as a paw-shaped bubble: much of your hurt, and every ailment, gone.', steps: [{ heal: 120, color: '#ffffff' }, { self: { cleanse: true } }] }),
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
    desc: 'Control gravity: crush, pull meteors down from space, drag fliers out of the sky — or lift a slab of rubble and ride it. (Admiral Fujitora.)',
    techniques: [
      T(0, { id: 'zushi_press', name: 'Gravity Press', icon: '⬇', anim: 'cast', windup: 0.3, recover: 0.3, cd: 6, desc: 'Gravity crushes down on the target\'s spot: they can barely move, can\'t jump — and anyone flying over it falls out of the sky.',
        steps: [{ zone: { range: 2.8, duration: 2, interval: 0.25, damage: 6, color: '#9575cd', atTarget: true, slow: 0.25, kind: 'gravity', grounds: true, status: { grounded: 0.4 } } }] }),
      T(25, { id: 'zushi_blade', name: 'Gravity Blade: Raging Tiger', icon: '🐯', anim: 'slash', windup: 0.4, recover: 0.4, cd: 10, steps: [{ hit: { shape: 'line', range: 10, width: 2.2, damage: 48, knockback: 6, stun: 0.8, heavy: true }, vfx: 'beam', color: '#9575cd' }] }),
      T(45, { id: 'zushi_ride', name: 'Floating Rubble', desc: 'Lift a slab of rubble with gravity and ride it through the air. Fly — or press Space again in the air.',
        flight: { style: 'ride', ride: 'rock', gauge: 18, speed: 8, climb: 5, ceiling: 35, sea: 3, color: '#9575cd' } }),
      T(70, { id: 'zushi_meteor', name: 'Meteor', icon: '☄', anim: 'raise', windup: 1.2, recover: 0.5, cd: 45, desc: 'Call down a meteor from the heavens.', steps: [{ zone: { range: 4, duration: 1.3, interval: 1.2, damage: 140, color: '#ff7043', atTarget: true, kind: 'meteor', element: 'explosion' } }] }),
    ],
  },

  // ------------------------------------------------------------------ ZOAN
  hito: {
    name: 'Hito Hito no Mi', en: 'Human-Human Fruit', type: 'Zoan', rarity: 'uncommon', color: '#f8bbd0', weight: 2.5,
    desc: 'Grants the intelligence and form of a human. Tony Tony Chopper ate it as a reindeer, and learned to take a different shape for each need.',
    techniques: [
      T(0, { id: 'hito_heavy', name: 'Heavy Point', icon: '💪', anim: 'flex', windup: 0.4, recover: 0.1, cd: 25, steps: [{ buff: { id: 'heavy_point', name: 'Heavy Point', dur: 15, mods: { damage: 1.4, defMul: 0.8, scale: 1.3 }, look: { hat: 'antlers', bulk: 1.3 } } }] }),
      T(10, { id: 'hito_guard', name: 'Guard Point', anim: 'block', windup: 0.1, recover: 0.1, cd: 14, desc: 'Puff up into a great ball of fur: blows bounce off the fluff (but you can hardly move).', steps: [{ buff: { id: 'guard_point', name: 'Guard Point', dur: 3.5, mods: { defMul: 0.25, speedMul: 0.4 }, look: { bulk: 1.9 } } }] }),
      T(20, { id: 'hito_horn', name: 'Horn Point: Kokutei Roseo', icon: '🦌', anim: 'thrust', windup: 0.25, recover: 0.3, cd: 7, steps: [{ dash: { dist: 5, time: 0.22, hit: { damage: 28, knockback: 6, stun: 0.6 } } }] }),
    ],
    // (Monster Point is a form, opened by fighting: data/fruitForms.js)
    more: [
      T(50, { id: 'hito_monster', name: 'Monster Point', icon: '👹', anim: 'flex', windup: 0.8, recover: 0.1, cd: 90, desc: 'A Rumble Ball overdose: enormous power, barely controllable.', steps: [{ buff: { id: 'monster', form: 'monster', name: 'Monster Point', dur: 20, mods: { damage: 2.2, defMul: 0.5, scale: 1.8, speedMul: 1.1 }, aura: 'rgba(121,85,72,0.8)', look: { hat: 'antlers', bulk: 1.45, sleeve: '#8d6e63' } } }] }),
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
    desc: 'Become the Phoenix: wings of blue flame that fly further than any, and flames of resurrection — wounds heal as fast as they are dealt. (Marco the Phoenix.)',
    passive: { regen: 3 },
    techniques: [
      T(0, { id: 'phoenix_flame', name: 'Flames of Restoration', icon: '💙', anim: 'cast', windup: 0.3, recover: 0.2, cd: 12, desc: 'Blue flames of regeneration close your wounds.', steps: [{ heal: 45, color: '#4dd0e1', phoenix: 2.5 }] }),
      T(15, { id: 'phoenix_fly', name: 'Phoenix Flight', icon: '🕊', desc: 'Spread your wings of blue flame and take to the sky — no one stays up longer than the Phoenix. Fly, or land again (or press Space again in the air).',
        flight: { style: 'phoenix', gauge: 30, speed: 12, climb: 7, ceiling: 45, drain: 0.5, sea: 3.5, refill: 4, color: '#4dd0e1' } }),
      T(30, { id: 'phoenix_brand', name: 'Phoenix Brand', icon: '🔥', anim: 'kick', windup: 0.3, recover: 0.3, cd: 7, desc: 'A kick wreathed in blue flame — from the sky, a dive straight down onto the target.', steps: [{ dash: { dist: 7, time: 0.25, iframes: 0.2, air: true, dive: true, hit: { damage: 40, knockback: 8, stun: 0.6, heavy: true } }, phoenix: 0.8 }] }),
      T(45, { id: 'phoenix_form', name: 'Phoenix Hybrid Form', anim: 'flex', windup: 0.35, recover: 0.1, cd: 45, desc: 'Your arms become wings of blue flame: you hit harder, move faster, and the flames heal you as you fight.',
        steps: [{ buff: { id: 'phoenix_form', name: 'Phoenix Form', dur: 20, phoenix: true, regen: 6, mods: { damage: 1.25, speedMul: 1.15 }, aura: 'rgba(77,208,225,0.6)' } }] }),
      T(70, { id: 'phoenix_rebirth', name: 'Rebirth Flames', icon: '♾', anim: 'cast', windup: 0.6, recover: 0.2, cd: 120, desc: 'Burn away all harm: a full heal, every ailment cleansed, and a burst of blue fire.', steps: [{ heal: 400, color: '#4dd0e1', phoenix: 3 }, { hit: { shape: 'circle', range: 3, damage: 30, knockback: 6, element: 'fire' }, vfx: 'ring', color: '#4dd0e1' }, { self: { cleanse: true } }] }),
    ],
  },
  uo_seiryu: {
    name: 'Uo Uo no Mi, Model: Seiryu', en: 'Fish-Fish Fruit, Azure Dragon', type: 'Mythical Zoan', rarity: 'mythical', color: '#42a5f5', weight: 0.3,
    desc: 'Become the Azure Dragon of legend, who flies on the clouds it makes. Kaido, strongest creature in the world, ate this fruit.',
    techniques: [
      T(0, { id: 'seiryu_bolo', name: 'Bolo Breath', icon: '🐉', anim: 'breath', windup: 0.5, recover: 0.4, cd: 7, say: 'Bolo Breath!', steps: [{ hit: { shape: 'line', range: 11, width: 1.8, damage: 44, knockback: 6, stun: 0.5, element: 'fire', status: { burn: 3 }, heavy: true, hitShips: true }, vfx: 'beam', color: '#ff7043' }] }),
      T(25, { id: 'seiryu_kaifu', name: 'Kaifu', icon: '🌬', anim: 'breath', windup: 0.35, recover: 0.3, cd: 6, desc: 'Wind blades from the dragon\'s whiskers.', steps: [{ proj: { speed: 18, range: 12, radius: 0.5, damage: 18, count: 3, spread: 0.5, sprite: 'airslash', slashing: true, pierce: true } }] }),
      T(35, { id: 'seiryu_fly', name: 'Azure Dragon Flight', desc: 'Take the Azure Dragon\'s shape and fly on the clouds it makes. Fly, or land again (or press Space again in the air).',
        flight: { style: 'dragon', ride: 'cloud', gauge: 40, speed: 11, climb: 6, ceiling: 60, drain: 0.6, sea: 3, refill: 6, color: '#90caf9' } }),
      T(50, { id: 'seiryu_raimei', name: 'Raimei Hakke', icon: '⚡', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 14, desc: 'Thunder Bagua: a club blow that shakes the heavens.', steps: [{ hit: { shape: 'arc', range: 3, arc: 1.4, offset: 0.4, damage: 95, knockback: 16, stun: 1.2, heavy: true, guardBreak: true, element: 'lightning', impactFrame: true, shake: 0.9 } }] }),
    ],
    // (the whole Azure Dragon is a form, opened by fighting: data/fruitForms.js)
    more: [
      T(80, { id: 'seiryu_form', name: 'Dragon Form', icon: '🐲', anim: 'cast', windup: 1.0, recover: 0.1, cd: 120, steps: [{ buff: { id: 'dragon', form: 'dragon', name: 'Azure Dragon', dur: 25, mods: { damage: 2, defMul: 0.4, scale: 1.6 }, aura: 'rgba(66,165,245,0.8)', look: { dragonForm: true } } }] }),
    ],
  },

  // ----------------------------------------------------------------- LOGIA
  mera: {
    name: 'Mera Mera no Mi', en: 'Flame-Flame Fruit', type: 'Logia', rarity: 'rare', color: '#ff7043', weight: 1,
    desc: 'Become fire itself: blows pass through you, and whatever you touch burns. Magma burns hotter still. Portgas D. Ace\'s fruit — later the Colosseum prize of Dressrosa.',
    passive: { logia: true, element: 'fire', resist: ['fire'], weakTo: ['magma', 'water'] },
    techniques: [
      T(0, { id: 'mera_hiken', name: 'Hiken', icon: '🔥', anim: 'punch', windup: 0.3, recover: 0.3, cd: 4, say: 'Hiken!', desc: 'Fire Fist: a fist of flame that burns through everything in its path.', steps: [{ proj: { speed: 16, range: 12, radius: 0.8, damage: 26, sprite: 'firefist', element: 'fire', pierce: true, status: { burn: 3 }, knockback: 5, trail: { color: ['#ff7043', '#ffca28'] } } }] }),
      T(15, { id: 'mera_hidaruma', name: 'Hotarubi: Hidaruma', icon: '🎆', anim: 'cast', windup: 0.25, recover: 0.3, cd: 7, desc: 'Fireflies: green lights drift slowly onto the target — then all at once, "Hidaruma", every one bursts into flame.',
        steps: [{ proj: { speed: 6, range: 9, radius: 0.35, damage: 3, count: 5, spread: 1.4, sprite: 'fireball', color: '#aeea00', size: 0.6, element: 'fire', homing: 2.5, explode: { range: 1.3, damage: 9, element: 'fire', status: { burn: 2 }, colors: ['#ff7043', '#ffca28', '#aeea00'] } } }] }),
      T(25, { id: 'mera_higan', name: 'Higan', anim: 'point', windup: 0.2, recover: 0.3, cd: 5, say: 'Higan!', desc: 'Fire Gun: bullets of flame from your fingertips.', steps: [{ proj: { speed: 26, range: 11, radius: 0.18, damage: 6, count: 5, spread: 0.18, sprite: 'fireball', size: 0.5, element: 'fire', status: { burn: 1.5 }, knockback: 1 } }] }),
      T(35, { id: 'mera_enkai', name: 'Enkai: Hibashira', icon: '🌋', anim: 'cast', windup: 0.4, recover: 0.4, cd: 10, desc: 'Flame Commandment, Fire Pillar: a pillar of flame erupts around you.', steps: [{ hit: { shape: 'circle', range: 3, damage: 36, knockback: 8, stun: 0.5, element: 'fire', status: { burn: 3 }, heavy: true }, vfx: 'ring' }] }),
      T(70, { id: 'mera_entei', name: 'Dai Enkai: Entei', icon: '☀', anim: 'raise', windup: 1.1, recover: 0.5, cd: 40, desc: 'Great Flame Commandment: a second sun, hurled.', say: 'Dai Enkai... ENTEI!', steps: [{ proj: { speed: 9, range: 13, radius: 2.2, damage: 40, size: 4, sprite: 'fireball', element: 'fire', pierce: true, status: { burn: 5 }, explode: { range: 4.5, damage: 100, element: 'fire' } } }] }),
    ],
  },
  hie: {
    name: 'Hie Hie no Mi', en: 'Ice-Ice Fruit', type: 'Logia', rarity: 'rare', color: '#81d4fa', weight: 1,
    desc: 'Become ice. Freeze anything solid — even the sea, into a road you can walk. Only magma is hotter than its cold. (Admiral Aokiji.)',
    passive: { logia: true, element: 'ice', resist: ['ice'], weakTo: ['magma'] },
    techniques: [
      T(0, { id: 'hie_saber', name: 'Ice Saber', icon: '🗡', anim: 'slash', windup: 0.15, recover: 0.25, cd: 3, steps: [{ hit: { shape: 'arc', range: 2, arc: 1.8, offset: 0.2, damage: 18, knockback: 3, stun: 0.3, slashing: true, element: 'ice', status: { chill: 3 } }, vfx: 'slash', color: '#b3e5fc' }] }),
      T(15, { id: 'hie_pheasant', name: 'Pheasant Beak', icon: '🐦', anim: 'cast', windup: 0.35, recover: 0.3, cd: 6, say: 'Pheasant Beak!', steps: [{ proj: { speed: 15, range: 12, radius: 0.8, damage: 28, sprite: 'bird', color: '#b3e5fc', element: 'ice', status: { freeze: 1.4 }, pierce: true } }] }),
      T(35, { id: 'hie_ageand', name: 'Ice Age', icon: '❄', anim: 'kneel', windup: 0.6, recover: 0.4, cd: 14, desc: 'Freeze everything around you solid — the ground, and the sea itself, which becomes a road of ice while it lasts.', say: 'Ice Age!',
        steps: [{ hit: { shape: 'circle', range: 5, damage: 30, knockback: 1, stun: 0.3, element: 'ice', status: { freeze: 2.5 }, heavy: true }, vfx: 'ring', color: '#e1f5fe' }, { zone: { range: 6.5, duration: 12, interval: 1, damage: 0, color: '#e1f5fe', kind: 'ice', slow: 0.5, freezeWater: true } }] }),
      T(50, { id: 'hie_iceball', name: 'Ice Ball', anim: 'cast', windup: 0.35, recover: 0.3, cd: 10, desc: 'Encase the target in a ball of ice.', steps: [{ proj: { speed: 14, range: 10, radius: 0.6, damage: 24, sprite: 'iceshard', size: 2, color: '#e1f5fe', element: 'ice', status: { freeze: 2.2 } } }] }),
      T(65, { id: 'hie_time', name: 'Ice Time Capsule', icon: '🧊', anim: 'cast', windup: 0.7, recover: 0.4, cd: 25, desc: 'A wave of ice that freezes everything along its path solid.', steps: [{ hit: { shape: 'line', range: 10, width: 2.5, damage: 60, knockback: 2, element: 'ice', status: { freeze: 3.5 }, heavy: true, unblockable: true }, vfx: 'beam', color: '#e1f5fe' }] }),
    ],
  },
  goro: {
    name: 'Goro Goro no Mi', en: 'Rumble-Rumble Fruit', type: 'Logia', rarity: 'legendary', color: '#fff176', weight: 0.6,
    desc: 'Become lightning, and call it down from the sky. The self-proclaimed God Enel\'s fruit. Useless against rubber.',
    passive: { logia: true, element: 'lightning', resist: ['lightning'], weakTo: ['rubber'] },
    techniques: [
      T(0, { id: 'goro_vari', name: 'Vari', icon: '⚡', anim: 'point', windup: 0.2, recover: 0.25, cd: 3, desc: 'A hundred million volts from your fingertip.', steps: [{ hit: { shape: 'line', range: 8, width: 0.8, damage: 22, knockback: 2, stun: 0.5, element: 'lightning', status: { shock: 1 } }, vfx: 'beam', color: '#fff176' }] }),
      T(15, { id: 'goro_sango', name: 'Sango', icon: '🐉', anim: 'cast', windup: 0.4, recover: 0.3, cd: 8, desc: 'A great bolt in the shape of a dragon.', steps: [{ proj: { speed: 20, range: 14, radius: 0.9, damage: 34, sprite: 'thunder', size: 2, element: 'lightning', pierce: true, status: { shock: 1.2 } } }] }),
      T(35, { id: 'goro_elthor', name: 'El Thor', icon: '🌩', anim: 'raise', windup: 0.7, recover: 0.4, cd: 14, desc: 'A pillar of divine lightning straight down from the sky.', say: 'El Thor!', steps: [{ zone: { range: 2.8, duration: 0.8, interval: 0.4, damage: 45, element: 'lightning', status: { shock: 1.5 }, color: '#fff176', atTarget: true, kind: 'thunder' } }] }),
      T(45, { id: 'goro_mamaragan', name: 'Mamaragan', anim: 'raise', windup: 0.6, recover: 0.4, cd: 16, say: 'Mamaragan!', desc: 'Lightning falls from the sky all around you, again and again.', steps: [{ zone: { range: 6, duration: 1.6, interval: 0.25, damage: 12, element: 'lightning', status: { shock: 0.8 }, color: '#fff176', kind: 'thunder' } }] }),
      T(85, { id: 'goro_raigo', name: 'Raigo', icon: '🌑', anim: 'summon', windup: 1.4, recover: 0.6, cd: 90, desc: 'A thundercloud large enough to erase an island.', steps: [{ zone: { range: 7, duration: 3, interval: 0.3, damage: 22, element: 'lightning', status: { shock: 0.5 }, color: '#fff176', kind: 'thunder' } }] }),
    ],
    // (Amaru is a form, opened by fighting: data/fruitForms.js)
    more: [
      T(55, { id: 'goro_amaru', name: '200 Million Volt Amaru', icon: '👺', anim: 'cast', windup: 0.8, recover: 0.2, cd: 60, steps: [{ buff: { id: 'amaru', form: 'amaru', name: 'Amaru', dur: 18, mods: { damage: 1.9, speedMul: 1.25, scale: 1.3 }, element: 'lightning', aura: 'rgba(255,241,118,0.9)', look: { drums: true } } }] }),
    ],
  },
  suna: {
    name: 'Suna Suna no Mi', en: 'Sand-Sand Fruit', type: 'Logia', rarity: 'rare', color: '#e1c16e', weight: 1,
    desc: 'Become sand: blows pass through you, you ride the wind as a sandstorm, and your hand drains the moisture from anything it touches. Water is its weakness. (Sir Crocodile.)',
    passive: { logia: true, element: 'sand', weakTo: ['water'] },
    techniques: [
      T(0, { id: 'suna_barjan', name: 'Barjan', icon: '🌙', anim: 'slash', windup: 0.2, recover: 0.3, cd: 3, desc: 'A crescent blade of sand.', steps: [{ proj: { speed: 17, range: 10, radius: 0.5, damage: 18, sprite: 'sandblade', element: 'sand', slashing: true, pierce: true } }] }),
      T(15, { id: 'suna_sables', name: 'Sables', icon: '🌪', anim: 'cast', windup: 0.4, recover: 0.3, cd: 9, desc: 'A sandstorm that drags whoever is in it to its heart.', steps: [{ zone: { range: 3, duration: 3.5, interval: 0.3, damage: 7, element: 'sand', color: '#e1c16e', kind: 'storm', atTarget: true, pull: 2 } }] }),
      T(25, { id: 'suna_ride', name: 'Sand Glide', desc: 'Turn into a sandstorm and ride the wind. Fly — or press Space again in the air.',
        flight: { style: 'ride', ride: 'sand', gauge: 12, speed: 10, climb: 5, ceiling: 25, sea: 4, color: '#e1c16e' } }),
      T(35, { id: 'suna_spada', name: 'Desert Spada', icon: '🗡', anim: 'grab', windup: 0.3, recover: 0.35, cd: 8, desc: 'Blades of sand rip through the ground.', steps: [{ hit: { shape: 'line', range: 11, width: 1.2, damage: 40, knockback: 4, stun: 0.5, element: 'sand', slashing: true }, vfx: 'beam', color: '#e1c16e' }] }),
      T(45, { id: 'suna_grip', name: 'Dehydrating Grip', anim: 'grab', windup: 0.3, recover: 0.35, cd: 10, desc: 'Seize the target with your right hand and drain the water from their body: they wither as you hold them.', steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.0, offset: 0.2, damage: 22, knockback: 1, stun: 0.6, element: 'sand', unblockable: true, status: { dry: 5 } } }] }),
      T(60, { id: 'suna_dry', name: 'Ground Death', icon: '🏜', anim: 'kneel', windup: 0.7, recover: 0.4, cd: 30, desc: 'Drain all moisture from the land around you: whoever is on it dries out.', steps: [{ zone: { range: 6, duration: 5, interval: 0.4, damage: 12, element: 'sand', color: '#d7b56d', kind: 'field', status: { dry: 2 } } }] }),
    ],
  },
  moku: {
    name: 'Moku Moku no Mi', en: 'Plume-Plume Fruit', type: 'Logia', rarity: 'rare', color: '#cfd8dc', weight: 1,
    desc: 'Become smoke: blows pass through you, you fly on a column of smoke, and your smoke seizes and holds whatever it wraps. Smoker "the White Hunter" pairs it with a Seastone jitte.',
    passive: { logia: true, element: 'smoke' },
    techniques: [
      T(0, { id: 'moku_blow', name: 'White Blow', icon: '☁', anim: 'punch', windup: 0.2, recover: 0.3, cd: 3, steps: [{ proj: { speed: 16, range: 10, radius: 0.6, damage: 18, sprite: 'smokefist', element: 'smoke', knockback: 5, stun: 0.4 } }] }),
      T(15, { id: 'moku_snake', name: 'White Snake', icon: '🐍', anim: 'grab', windup: 0.25, recover: 0.3, cd: 7, desc: 'Smoke tendrils wrap round the target and hold them.', steps: [{ proj: { speed: 14, range: 11, radius: 0.5, damage: 12, sprite: 'smokesnake', element: 'smoke', status: { root: 2 }, homing: 2 } }] }),
      T(25, { id: 'moku_ride', name: 'Smoke Ride', desc: 'Ride a column of your own smoke through the air. Fly — or press Space again in the air.',
        flight: { style: 'ride', ride: 'smoke', gauge: 14, speed: 10, climb: 5, ceiling: 30, sea: 4, color: '#eceff1' } }),
      T(35, { id: 'moku_out', name: 'White Out', icon: '🌫', anim: 'cast', windup: 0.4, recover: 0.3, cd: 12, desc: 'Fill the area with smoke that seizes whoever is in it: they can barely move.', steps: [{ zone: { range: 4, duration: 5, interval: 0.5, damage: 6, element: 'smoke', color: '#eceff1', kind: 'storm', slow: 0.45, status: { root: 0.4 } } }] }),
      T(60, { id: 'moku_launcher', name: 'White Launcher', icon: '🚀', anim: 'thrust', windup: 0.2, recover: 0.3, cd: 6, desc: 'Turn into smoke and launch yourself at the target.', steps: [{ dash: { dist: 10, time: 0.3, iframes: 0.3, air: true, trail: '#eceff1', hit: { damage: 36, knockback: 8, stun: 0.6, element: 'smoke' } } }] }),
    ],
  },
  pika: {
    name: 'Pika Pika no Mi', en: 'Glint-Glint Fruit', type: 'Logia', rarity: 'legendary', color: '#fff9c4', weight: 0.6,
    desc: 'Become light. Move at the speed of light — and kick with its weight. (Admiral Kizaru.)',
    passive: { logia: true, element: 'light' },
    techniques: [
      T(0, { id: 'pika_yasakani', name: 'Yasakani no Magatama', icon: '✨', anim: 'cast', windup: 0.35, recover: 0.4, cd: 6, desc: 'A rain of light bullets.', steps: [{ proj: { speed: 30, range: 12, radius: 0.25, damage: 8, count: 9, spread: 1.0, sprite: 'lightorb', element: 'light' } }] }),
      T(15, { id: 'pika_yata', name: 'Yata no Kagami', icon: '🪞', anim: 'cast', windup: 0.05, recover: 0.05, cd: 2, desc: 'Travel at the speed of light.', steps: [{ teleport: { dist: 12, color: '#fff9c4' } }] }),
      T(25, { id: 'pika_kick', name: 'Light-Speed Kick', anim: 'kick', windup: 0.2, recover: 0.35, cd: 8, desc: '"Ever been kicked at the speed of light?" Be in front of the target in a flash — and kick.',
        steps: [{ at: 0.2, teleport: { dist: 14, toTarget: true, gap: 1.0, color: '#fff9c4' } }, { at: 0.27, hit: { shape: 'arc', range: 1.9, arc: 1.2, offset: 0.2, damage: 46, knockback: 14, stun: 0.7, element: 'light', heavy: true, guardBreak: true, impactFrame: true } }] }),
      T(35, { id: 'pika_murakumo', name: 'Ama no Murakumo', icon: '⚔', anim: 'slash', windup: 0.2, recover: 0.3, cd: 5, desc: 'A sword of light.', steps: [{ hit: { shape: 'arc', range: 2.6, arc: 2.2, offset: 0.2, damage: 40, knockback: 4, stun: 0.5, slashing: true, element: 'light' }, vfx: 'slash', color: '#fff9c4' }] }),
      T(45, { id: 'pika_fly', name: 'Light Flight', desc: 'Become light and drift through the air, fast — but not for long. Fly — or press Space again in the air.',
        flight: { style: 'float', ride: 'light', gauge: 10, speed: 15, climb: 8, ceiling: 35, sea: 4, color: '#fff59d' } }),
      T(60, { id: 'pika_amaterasu', name: 'Light Laser', icon: '☀', anim: 'cast', windup: 0.8, recover: 0.4, cd: 25, desc: 'A beam of light from your fingertip that blasts through everything in a line.', steps: [{ hit: { shape: 'line', range: 16, width: 1.6, damage: 90, knockback: 8, stun: 0.8, element: 'light', heavy: true, impactFrame: true, hitShips: true, shipDamage: 300 }, vfx: 'beam', color: '#fff59d' }] }),
    ],
  },
  magu: {
    name: 'Magu Magu no Mi', en: 'Magma-Magma Fruit', type: 'Logia', rarity: 'legendary', color: '#ff5722', weight: 0.6,
    desc: 'Become magma — hotter than fire itself: it burns whatever it touches, beats fire and melts ice. (Admiral, then Fleet Admiral, Akainu.)',
    passive: { logia: true, element: 'magma', resist: ['fire', 'magma'] },
    techniques: [
      T(0, { id: 'magu_daifunka', name: 'Dai Funka', icon: '🌋', anim: 'punch', windup: 0.3, recover: 0.35, cd: 4, say: 'Dai Funka!', desc: 'Great Eruption: a fist of magma.', steps: [{ proj: { speed: 15, range: 11, radius: 0.9, damage: 34, sprite: 'magmafist', size: 1.5, element: 'magma', pierce: true, status: { burn: 4 }, knockback: 6, trail: { color: ['#bf360c', '#ff6f00'], kind: 'fire' } } }] }),
      T(20, { id: 'magu_meigo', name: 'Meigo', icon: '👊', anim: 'thrust', windup: 0.3, recover: 0.35, cd: 8, desc: 'Hell Hound: a magma fist that pierces through.', steps: [{ dash: { dist: 5, time: 0.22, hit: { damage: 55, knockback: 6, stun: 0.8, element: 'magma', status: { burn: 4 }, heavy: true, guardBreak: true } } }] }),
      T(35, { id: 'magu_inugami', name: 'Inugami Guren', anim: 'thrust', windup: 0.5, recover: 0.4, cd: 14, desc: 'Dog Bite Crimson Lotus: a giant hound\'s head of magma lunges along the ground and bites down.', steps: [{ hit: { shape: 'line', range: 9, width: 2.2, damage: 60, knockback: 8, stun: 0.7, element: 'magma', status: { burn: 4 }, heavy: true, hitShips: true }, vfx: 'beam', color: '#ff5722' }] }),
      T(50, { id: 'magu_ryusei', name: 'Ryusei Kazan', icon: '☄', anim: 'summon', windup: 1.0, recover: 0.5, cd: 35, desc: 'Meteor Volcano: a rain of magma fists.', steps: [{ zone: { range: 6, duration: 2.5, interval: 0.2, damage: 24, element: 'magma', color: '#ff5722', kind: 'meteor', status: { burn: 3 } } }] }),
    ],
  },
  yami: {
    name: 'Yami Yami no Mi', en: 'Dark-Dark Fruit', type: 'Logia', rarity: 'legendary', color: '#311b92', weight: 0.5,
    desc: 'Darkness that swallows everything — shots, people, even other Devil Fruit powers — and can let it all out again. Unlike other Logia it can\'t let blows through: it draws pain in. (Marshall D. Teach.)',
    passive: { element: 'dark', noIntangible: true, damageTaken: 1.15 },
    techniques: [
      T(0, { id: 'yami_kurouzu', name: 'Kurouzu', icon: '🕳', anim: 'grab', windup: 0.3, recover: 0.3, cd: 6, desc: 'Black Vortex: the darkness drags the target to you — and while it holds them, their Devil Fruit is useless.', steps: [{ pull: { range: 8, strength: 14, stun: 0.6, nullify: 2.5 } }] }),
      T(15, { id: 'yami_blackhole', name: 'Black Hole', icon: '⚫', anim: 'cast', windup: 0.5, recover: 0.4, cd: 14, desc: 'Darkness spreads over the ground and swallows everything: shots fired into it, and the Devil Fruit powers of whoever stands in it.',
        steps: [{ zone: { range: 4, duration: 4, interval: 0.4, damage: 10, element: 'dark', color: '#311b92', kind: 'dark', pull: 4, slow: 0.4, absorb: true, status: { seastone: 1.2 } } }] }),
      T(35, { id: 'yami_nullify', name: 'Nullifying Touch', icon: '✋', anim: 'grab', windup: 0.2, recover: 0.3, cd: 18, desc: 'Grab hold of the target: while the darkness has them, their Devil Fruit power is gone.', steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.2, offset: 0.2, damage: 15, stun: 0.8, status: { seastone: 8 }, unblockable: true } }] }),
      T(60, { id: 'yami_liberation', name: 'Liberation', icon: '💥', anim: 'cast', windup: 0.7, recover: 0.4, cd: 25, desc: 'Release everything the darkness swallowed — and the shots it took in come back out with it.',
        steps: [{ hit: { shape: 'circle', range: 5, damage: 70, knockback: 12, stun: 0.8, element: 'dark', heavy: true, impactFrame: true }, vfx: 'ring', color: '#7e57c2' }, { power: { kind: 'release', range: 5.5, mul: 1.2, cap: 220 } }] }),
    ],
  },
};

export const FRUIT_IDS = Object.keys(FRUITS);

for (const [fid, f] of Object.entries(FRUITS)) {
  registerAbilities([...f.techniques, ...(f.more || [])].map((t) => ({ ...t, source: 'fruit:' + fid, fruit: fid })), 'fruit:' + fid);
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

// every fruit's forms, awakening, heavy and M1 (data/fruitForms.js)
attachKits(FRUITS);

export function unlockedFruitTechniques(fruitId, mastery) {
  const f = FRUITS[fruitId];
  if (!f) return [];
  return f.techniques.filter((t) => mastery >= t.mastery).map((t) => t.id);
}

/** The forms of a fruit its mastery has opened up (and those still to come). */
export function fruitForms(fruitId, mastery = 0) {
  const f = FRUITS[fruitId];
  return (f?.forms || []).map((F) => ({ ...F, open: mastery >= F.mastery }));
}

export { AWAKEN_MASTERY };
