// Fighting styles. Each has an M1 chain, a heavy attack and learnable
// techniques. Techniques are learned from trainers (see data/npcs.js) and
// require style mastery, which only grows by fighting worthy opponents or
// training — never by farming weak enemies.
import { registerAbilities } from '../game/abilities.js';

const m1 = (id, style, anim, dmg, o = {}) => ({
  id, name: o.name || 'Strike', style, anim, windup: o.windup ?? 0.07, recover: o.recover ?? 0.16,
  weapon: o.weapon, telegraph: false,
  steps: [{ hit: { shape: o.shape || 'arc', range: o.range ?? 1.35, arc: o.arc ?? 1.7, offset: o.offset ?? 0.2, damage: dmg, knockback: o.kb ?? 1.2, stun: o.stun ?? 0.22, slashing: o.slashing, element: o.element, status: o.status, width: o.width }, vfx: o.vfx }],
});

export const STYLES = {
  brawler: {
    name: 'Street Brawling', icon: '👊', weapon: null,
    desc: 'Fists, elbows and headbutts. Every fighter starts somewhere.',
    m1: [
      m1('brawl_1', 'brawler', 'jab', 5, { windup: 0.06, recover: 0.13 }),
      m1('brawl_2', 'brawler', 'cross', 5, { windup: 0.06, recover: 0.13 }),
      m1('brawl_3', 'brawler', 'hook', 7, { windup: 0.08, recover: 0.15, stun: 0.28 }),
      m1('brawl_4', 'brawler', 'uppercut', 9, { name: 'Uppercut', windup: 0.09, kb: 3.5, stun: 0.35, recover: 0.3 }),
    ],
    heavy: { id: 'brawl_heavy', name: 'Haymaker', anim: 'haymaker', windup: 0.32, recover: 0.35, cd: 1.3, steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.5, offset: 0.3, damage: 15, knockback: 6, stun: 0.5, heavy: true, guardBreak: true } }] },
    techniques: [
      { id: 'brawl_tackle', name: 'Shoulder Tackle', icon: '🐂', anim: 'thrust', windup: 0.15, recover: 0.3, cd: 5, desc: 'Charge forward, bowling over anyone in your way.',
        steps: [{ dash: { dist: 5, time: 0.25, hit: { damage: 12, knockback: 6, stun: 0.5 } } }], learn: { mastery: 0, price: 300 } },
      { id: 'brawl_knee', name: 'Rising Knee', icon: '🦵', anim: 'knee', windup: 0.12, recover: 0.3, cd: 4, desc: 'A launching knee that stuns.',
        steps: [{ hit: { shape: 'arc', range: 1.3, arc: 1.2, offset: 0.2, damage: 13, knockback: 2, stun: 0.9 } }], learn: { mastery: 10, price: 800 } },
      { id: 'brawl_headbutt', name: 'Iron Skull', icon: '💥', anim: 'headbutt', windup: 0.25, recover: 0.3, cd: 7, desc: 'A skull-cracking headbutt that breaks guards.',
        steps: [{ hit: { shape: 'arc', range: 1.2, arc: 1.0, offset: 0.2, damage: 20, knockback: 5, stun: 0.8, guardBreak: true, heavy: true, impactFrame: true } }], learn: { mastery: 25, price: 2000 } },
    ],
  },

  ittoryu: {
    name: 'One Sword Style', icon: '🗡', weapon: 'sword', swords: 1,
    desc: 'The foundation of every swordsman. Taught at the Isshin Dojo in Shimotsuki Village.',
    m1: [
      m1('itto_1', 'ittoryu', 'slash', 8, { weapon: 'sword', slashing: true, range: 1.7, arc: 2.2 }),
      m1('itto_2', 'ittoryu', 'slash2', 8, { weapon: 'sword', slashing: true, range: 1.7, arc: 2.2 }),
      m1('itto_4', 'ittoryu', 'rise_slash', 9, { name: 'Rising Cut', weapon: 'sword', slashing: true, range: 1.7, arc: 2.0, windup: 0.08, stun: 0.3 }),
      m1('itto_3', 'ittoryu', 'stab', 12, { name: 'Thrust', weapon: 'sword', slashing: true, range: 1.9, arc: 2.4, kb: 3.5, recover: 0.32, vfx: 'stab' }),
    ],
    heavy: { id: 'itto_heavy', name: 'Downward Cleave', anim: 'cleave', weapon: 'sword', windup: 0.34, recover: 0.35, cd: 1.4, steps: [{ hit: { shape: 'line', range: 2.6, width: 1.0, damage: 20, knockback: 5, stun: 0.5, heavy: true, slashing: true, guardBreak: true } }] },
    techniques: [
      { id: 'itto_iai', name: 'Iai: Death Lion Song', icon: '🦁', anim: 'iai', weapon: 'sword', windup: 0.25, recover: 0.35, cd: 6, desc: 'A quick-draw dash cut — sheathe, dash, and the enemy falls behind you.', say: 'Shishi Sonson!',
        steps: [{ dash: { dist: 6, time: 0.18, iframes: 0.2, hit: { damage: 26, knockback: 3, stun: 0.6, slashing: true } } }], learn: { mastery: 10, price: 3000 } },
      { id: 'itto_pound', name: 'Pound Cannon', icon: '🌀', anim: 'slash', weapon: 'sword', windup: 0.3, recover: 0.3, cd: 5, desc: 'A flying slash of compressed air.', say: 'Pound Ho!',
        steps: [{ proj: { speed: 16, range: 11, radius: 0.5, damage: 18, sprite: 'airslash', slashing: true, pierce: true, knockback: 3 } }], learn: { mastery: 25, price: 6000 } },
      { id: 'itto_whirl', name: 'Tatsumaki', icon: '🌪', anim: 'bladespin', weapon: 'sword', windup: 0.35, recover: 0.45, cd: 9, desc: 'Spin into a tornado of blades.', say: 'Tatsumaki!',
        steps: [{ hit: { shape: 'circle', range: 2.6, damage: 9, knockback: 4, stun: 0.3, slashing: true, duration: 0.6, interval: 0.15 }, vfx: 'ring', color: '#b3e5fc' }], learn: { mastery: 45, price: 15000 } },
    ],
  },

  nitoryu: {
    name: 'Two Sword Style', icon: '⚔', weapon: 'sword', swords: 2,
    desc: 'Twice the blades, twice the fury. Requires two swords.',
    m1: [
      m1('nito_1', 'nitoryu', 'dual1', 7, { weapon: 'sword', slashing: true, range: 1.7, arc: 2.2, windup: 0.06, recover: 0.12 }),
      m1('nito_2', 'nitoryu', 'dual2', 7, { weapon: 'sword', slashing: true, range: 1.7, arc: 2.2, windup: 0.06, recover: 0.12 }),
      m1('nito_3', 'nitoryu', 'dual3', 7, { weapon: 'sword', slashing: true, range: 1.7, arc: 2.2, windup: 0.06, recover: 0.12 }),
      m1('nito_4', 'nitoryu', 'dualx', 12, { weapon: 'sword', slashing: true, range: 1.9, arc: 2.6, kb: 4, recover: 0.3 }),
    ],
    heavy: { id: 'nito_heavy', name: 'Rashomon', anim: 'tora', weapon: 'sword', windup: 0.35, recover: 0.35, cd: 1.6, steps: [{ hit: { shape: 'line', range: 3.0, width: 1.2, damage: 24, knockback: 5, stun: 0.5, heavy: true, slashing: true, guardBreak: true } }] },
    techniques: [
      { id: 'nito_taka', name: 'Taka Nami', icon: '🌊', anim: 'dualx', weapon: 'sword', windup: 0.3, recover: 0.35, cd: 7, desc: 'Hawk Wave — a sweeping wave of cuts.', say: 'Taka Nami!',
        steps: [{ hit: { shape: 'arc', range: 3.2, arc: 2.6, damage: 24, knockback: 6, stun: 0.5, slashing: true, heavy: true }, vfx: 'slash' }], learn: { mastery: 15, price: 8000 } },
      { id: 'nito_nigiri', name: 'Nigiri', icon: '🍙', anim: 'iai', weapon: 'sword', windup: 0.2, recover: 0.3, cd: 6, desc: 'A crossing dash-cut.', say: 'Nigiri!',
        steps: [{ dash: { dist: 5, time: 0.18, iframes: 0.18, hit: { damage: 28, stun: 0.6, slashing: true } } }], learn: { mastery: 30, price: 14000 } },
    ],
  },

  santoryu: {
    name: 'Three Sword Style', icon: '👹', weapon: 'sword', swords: 3,
    desc: 'The style of Roronoa Zoro: one blade in each hand and one in the mouth. Requires three swords and a stubborn will.',
    m1: [
      m1('santo_1', 'santoryu', 'dual1', 8, { weapon: 'sword', slashing: true, range: 1.8, arc: 2.4 }),
      m1('santo_2', 'santoryu', 'dual3', 8, { weapon: 'sword', slashing: true, range: 1.8, arc: 2.4 }),
      m1('santo_3', 'santoryu', 'dualx', 15, { weapon: 'sword', slashing: true, range: 2.0, arc: 2.8, kb: 4.5, recover: 0.3 }),
    ],
    heavy: { id: 'santo_heavy', name: 'Tora Gari', anim: 'tora', weapon: 'sword', windup: 0.4, recover: 0.35, cd: 1.6, say: 'Tora Gari!', steps: [{ hit: { shape: 'arc', range: 2.4, arc: 1.6, offset: 0.4, damage: 30, knockback: 6, stun: 0.6, heavy: true, slashing: true, guardBreak: true, impactFrame: true } }] },
    techniques: [
      { id: 'santo_onigiri', name: 'Oni Giri', icon: '👹', anim: 'iai', weapon: 'sword', windup: 0.22, recover: 0.35, cd: 5, desc: 'Demon Slash: a three-blade dash that leaves an X of cuts.', say: 'Oni Giri!',
        steps: [{ dash: { dist: 6.5, time: 0.2, iframes: 0.22, hit: { damage: 34, knockback: 4, stun: 0.7, slashing: true, heavy: true } } }], learn: { mastery: 5, price: 12000 } },
      { id: 'santo_108', name: '108 Pound Phoenix', icon: '🐦', anim: 'dualx', weapon: 'sword', windup: 0.35, recover: 0.35, cd: 7, desc: 'Three flying slashes shaped like a phoenix.', say: 'Hyakuhachi Pound Ho!',
        steps: [{ proj: { speed: 17, range: 13, radius: 0.6, damage: 22, count: 3, spread: 0.35, sprite: 'airslash', slashing: true, pierce: true, knockback: 3 } }], learn: { mastery: 25, price: 30000 } },
      { id: 'santo_sanzen', name: 'Sanzen Sekai', icon: '🌍', anim: 'iai', weapon: 'sword', windup: 0.6, recover: 0.5, cd: 16, desc: 'Three Thousand Worlds: spinning blades like windmills, a dash that cuts through everything.', say: 'Sanzen... Sekai!',
        steps: [{ fx: { ring: 2.2, color: '#e3f2fd' } }, { at: 0.6, dash: { dist: 8, time: 0.22, iframes: 0.3, hit: { damage: 70, knockback: 7, stun: 1.0, slashing: true, heavy: true, guardBreak: true } } }, { at: 0.8, fx: { impact: 0.1, shake: 0.6 } }], learn: { mastery: 60, price: 90000 } },
      { id: 'santo_asura', name: 'Kyutoryu: Asura', icon: '👺', anim: 'will', weapon: 'sword', windup: 0.8, recover: 0.4, cd: 45, cost: { haki: 30 }, desc: 'Nine Sword Style — a demonic spirit with three heads and six arms. Requires Armament Haki.',
        requiresHaki: 'armament',
        steps: [{ fx: { ring: 3, color: '#212121', text: 'ASURA!' } }, { at: 0.8, buff: { id: 'asura', name: 'Asura', dur: 12, mods: { damage: 1.6, atkSpeed: 1.25 }, aura: 'rgba(40,40,40,0.9)', look: { asura: true } } }], learn: { mastery: 85, price: 250000 } },
    ],
  },

  black_leg: {
    name: 'Black Leg Style', icon: '🦵', weapon: null, legs: true,
    desc: 'Taught by "Red Leg" Zeff at the Baratie. A cook\'s hands are for cooking — fight with your legs alone.',
    m1: [
      m1('bleg_1', 'black_leg', 'kick', 7, { range: 1.6 }),
      m1('bleg_2', 'black_leg', 'kick_high', 7, { range: 1.6 }),
      m1('bleg_3', 'black_leg', 'kick_spin', 7, { range: 1.6 }),
      m1('bleg_4', 'black_leg', 'rise_kick', 12, { range: 1.8, kb: 4.5, recover: 0.3, name: 'Collier' }),
    ],
    heavy: { id: 'bleg_heavy', name: 'Mouton Shot', anim: 'mouton', windup: 0.32, recover: 0.35, cd: 1.4, say: 'Mouton Shot!', steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.2, offset: 0.3, damage: 20, knockback: 9, stun: 0.5, heavy: true, guardBreak: true } }] },
    techniques: [
      { id: 'bleg_party', name: 'Party Table Kick Course', icon: '🍽', anim: 'kick', windup: 0.2, recover: 0.4, cd: 6, desc: 'A handstand spin-kick hitting everything around you.', say: 'Party Table Kick Course!',
        steps: [{ hit: { shape: 'circle', range: 2.4, damage: 8, knockback: 3.5, stun: 0.3, duration: 0.5, interval: 0.12 }, vfx: 'ring' }], learn: { mastery: 0, price: 2500 } },
      { id: 'bleg_antimanner', name: 'Anti-Manner Kick Course', icon: '🚀', anim: 'kick', windup: 0.25, recover: 0.35, cd: 7, desc: 'A rising kick that launches the target and stuns them.', say: 'Anti-Manner Kick Course!',
        steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 22, knockback: 2, stun: 1.3, heavy: true } }], learn: { mastery: 15, price: 6000 } },
      { id: 'bleg_concasse', name: 'Concassé', icon: '🔨', anim: 'axe_kick', windup: 0.4, recover: 0.4, cd: 9, desc: 'A crushing heel drop from above that cracks the ground.', say: 'Concassé!',
        steps: [{ dash: { dist: 3, time: 0.2, iframes: 0.2 } }, { at: 0.62, hit: { shape: 'circle', range: 1.9, damage: 30, knockback: 5, stun: 0.7, heavy: true, guardBreak: true, shake: 0.4 }, vfx: 'ring' }], learn: { mastery: 30, price: 14000 } },
      { id: 'bleg_diable', name: 'Diable Jambe', icon: '🔥', anim: 'kick_spin', windup: 0.4, recover: 0.2, cd: 30, desc: 'Spin until your leg is red-hot. Kicks burn for a while.', say: 'Diable Jambe!',
        steps: [{ fx: { burst: 20, color: '#ff7043', kind: 'fire' } }, { at: 0.4, buff: { id: 'diable', name: 'Diable Jambe', dur: 14, mods: { damage: 1.35 }, element: 'fire', status: { burn: 2.5 }, aura: 'rgba(255,112,67,0.9)' } }], learn: { mastery: 50, price: 40000 } },
      { id: 'bleg_skywalk', name: 'Sky Walk', icon: '☁', anim: 'kick', windup: 0.05, recover: 0.15, cd: 3, desc: 'Kick the air to leap far — even over water.',
        steps: [{ dash: { dist: 7, time: 0.3, iframes: 0.2, air: true } }], learn: { mastery: 40, price: 20000 } },
    ],
  },

  fishman_karate: {
    name: 'Fish-Man Karate', icon: '🐟', weapon: null,
    desc: 'Strikes that send shockwaves through the water inside every body. Innate to Fish-Men; others must learn at Fish-Man Island.',
    m1: [
      m1('fmk_1', 'fishman_karate', 'palm', 7, { element: 'water' }),
      m1('fmk_2', 'fishman_karate', 'palm2', 7, { element: 'water' }),
      m1('fmk_3', 'fishman_karate', 'palm_double', 12, { kb: 5, recover: 0.3, element: 'water', stun: 0.4 }),
    ],
    heavy: { id: 'fmk_heavy', name: 'Shark Tile Fist', anim: 'palm_double', windup: 0.3, recover: 0.35, cd: 1.4, steps: [{ hit: { shape: 'arc', range: 1.7, arc: 1.2, offset: 0.3, damage: 18, knockback: 7, stun: 0.5, heavy: true, guardBreak: true, element: 'water' } }] },
    techniques: [
      { id: 'fmk_uchimizu', name: 'Uchimizu', icon: '💧', anim: 'flick', windup: 0.15, recover: 0.25, cd: 3, desc: 'Fish-Man Jujutsu: flick water droplets hard as bullets. Water counters sand Logias!',
        steps: [{ proj: { speed: 22, range: 11, radius: 0.2, damage: 6, count: 5, spread: 0.3, sprite: 'waterdrop', element: 'water', knockback: 1, status: { wet: 6 } } }], learn: { mastery: 0, price: 2500 } },
      { id: 'fmk_arabesque', name: 'Arabesque Brick Fist', icon: '🧱', anim: 'palm', windup: 0.3, recover: 0.35, cd: 6, desc: 'A punch that sends a shockwave through the air.', say: 'Arabesque Brick Fist!',
        steps: [{ proj: { speed: 13, range: 9, radius: 0.7, damage: 24, sprite: 'shockwave', element: 'water', pierce: true, knockback: 6, stun: 0.5, heavy: true } }], learn: { mastery: 15, price: 8000 } },
      { id: 'fmk_5000', name: 'Five Thousand Brick Fist', icon: '💥', anim: 'palm_double', windup: 0.45, recover: 0.4, cd: 10, desc: 'An overwhelming palm strike through the body\'s water.', say: 'Five Thousand Brick Fist!',
        steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.2, offset: 0.3, damage: 45, knockback: 10, stun: 0.9, heavy: true, guardBreak: true, element: 'water', impactFrame: true } }], learn: { mastery: 35, price: 25000 } },
      { id: 'fmk_vagabond', name: 'Vagabond Drill', icon: '🌀', anim: 'thrust', windup: 0.35, recover: 0.4, cd: 12, desc: 'Jinbe\'s spiralling water drill.', say: 'Vagabond Drill!',
        steps: [{ proj: { speed: 15, range: 12, radius: 0.9, damage: 50, sprite: 'shockwave', color: '#4fc3f7', element: 'water', pierce: true, knockback: 8, stun: 0.8, heavy: true, trail: { color: '#81d4fa', kind: 'bubble' } } }], learn: { mastery: 60, price: 70000 } },
    ],
  },

  rokushiki: {
    name: 'Rokushiki (Six Powers)', icon: '🕴', weapon: null,
    desc: 'The superhuman martial art of the Marines and CP9: Soru, Geppo, Tekkai, Shigan, Rankyaku, Kami-e. Taught to Marines — or to anyone who can find an ex-agent willing to teach.',
    m1: [
      m1('roku_1', 'rokushiki', 'shigan', 7, { name: 'Shigan', range: 1.5, arc: 0.9 }),
      m1('roku_2', 'rokushiki', 'shigan2', 7, { name: 'Shigan', range: 1.5, arc: 0.9 }),
      m1('roku_3', 'rokushiki', 'kick_high', 11, { kb: 4, recover: 0.28, name: 'Rankyaku Kick' }),
    ],
    heavy: { id: 'roku_heavy', name: 'Shigan: Bachi', anim: 'shigan', windup: 0.3, recover: 0.3, cd: 1.5, steps: [{ hit: { shape: 'arc', range: 1.6, arc: 0.8, offset: 0.2, damage: 6, knockback: 1, stun: 0.12, duration: 0.45, interval: 0.07, guardBreak: true } }] },
    techniques: [
      { id: 'roku_soru', name: 'Soru', icon: '💨', anim: 'thrust', windup: 0.02, recover: 0.08, cd: 2.2, desc: 'Shave: kick the ground ten times in an instant and vanish.',
        steps: [{ teleport: { dist: 6, color: '#eceff1' } }], learn: { mastery: 0, price: 6000 } },
      { id: 'roku_geppo', name: 'Geppo', icon: '🌙', anim: 'kick', windup: 0.05, recover: 0.12, cd: 3, desc: 'Moon Walk: kick the air to leap — even across water.',
        steps: [{ dash: { dist: 7, time: 0.3, iframes: 0.2, air: true } }], learn: { mastery: 10, price: 9000 } },
      { id: 'roku_tekkai', name: 'Tekkai', icon: '🛡', anim: 'block', windup: 0.05, recover: 0.1, cd: 12, desc: 'Iron Body: harden every muscle. Take 75% less damage but move slowly.',
        steps: [{ buff: { id: 'tekkai', name: 'Tekkai', dur: 3.5, mods: { defMul: 0.25, speedMul: 0.35 }, aura: 'rgba(144,164,174,0.9)' } }], learn: { mastery: 15, price: 10000 } },
      { id: 'roku_rankyaku', name: 'Rankyaku', icon: '🌬', anim: 'kick_high', windup: 0.25, recover: 0.3, cd: 5, desc: 'Storm Leg: kick so fast it launches a cutting blade of air.', say: 'Rankyaku!',
        steps: [{ proj: { speed: 18, range: 12, radius: 0.5, damage: 22, sprite: 'airslash', slashing: true, pierce: true, knockback: 3 } }], learn: { mastery: 25, price: 16000 } },
      { id: 'roku_kamie', name: 'Kami-e', icon: '📄', anim: 'block', windup: 0.05, recover: 0.1, cd: 16, desc: 'Paper Drawing: float like paper on the wind of incoming blows.',
        steps: [{ buff: { id: 'kamie', name: 'Kami-e', dur: 4, mods: { evade: 0.5, speedMul: 1.15 }, aura: 'rgba(255,255,255,0.7)' } }], learn: { mastery: 35, price: 22000 } },
      { id: 'roku_rokuogan', name: 'Rokuogan', icon: '👑', anim: 'palm_double', windup: 0.5, recover: 0.5, cd: 20, desc: 'Six King Gun: the secret technique of those who mastered all six powers. A shockwave that pierces armour.', say: 'Rokuogan!',
        steps: [{ hit: { shape: 'arc', range: 2.6, arc: 1.3, offset: 0.2, damage: 75, knockback: 12, stun: 1.2, heavy: true, guardBreak: true, unblockable: true, impactFrame: true, shake: 0.6 }, vfx: 'ring', color: '#e0f7fa' }], learn: { mastery: 75, price: 160000 } },
    ],
  },

  sniper: {
    name: 'Sniper', icon: '🎯', weapon: 'gun',
    desc: 'Slingshots, pistols and a thousand "stars". Hit from afar and never let them close in.',
    m1: [
      { id: 'snipe_m1', name: 'Lead Star', style: 'sniper', anim: 'shoot', weapon: 'gun', windup: 0.12, recover: 0.28, telegraph: false,
        steps: [{ proj: { speed: 22, range: 13, radius: 0.18, damage: 7, sprite: 'bullet', knockback: 1.2 } }] },
    ],
    heavy: { id: 'snipe_heavy', name: 'Deadly Aim', anim: 'aim', weapon: 'gun', windup: 0.55, recover: 0.3, cd: 1.8, steps: [{ proj: { speed: 32, range: 20, radius: 0.2, damage: 24, sprite: 'bullet', pierce: true, knockback: 3, stun: 0.3 } }] },
    techniques: [
      { id: 'snipe_explode', name: 'Exploding Star', icon: '💣', anim: 'shoot', weapon: 'gun', windup: 0.2, recover: 0.3, cd: 5, desc: 'A pellet that bursts on impact.', say: 'Exploding Star!',
        steps: [{ proj: { speed: 18, range: 12, radius: 0.25, damage: 8, sprite: 'bomb', explode: { range: 1.8, damage: 18 } } }], learn: { mastery: 0, price: 2000 } },
      { id: 'snipe_tabasco', name: 'Tabasco Star', icon: '🌶', anim: 'shoot', weapon: 'gun', windup: 0.15, recover: 0.25, cd: 7, desc: 'Hot sauce to the eyes — the target flails blindly.',
        steps: [{ proj: { speed: 20, range: 12, radius: 0.25, damage: 4, sprite: 'star', color: '#e53935', status: { blind: 3 }, stun: 1.2 } }], learn: { mastery: 10, price: 4000 } },
      { id: 'snipe_firebird', name: 'Firebird Star', icon: '🔥', anim: 'shoot', weapon: 'gun', windup: 0.35, recover: 0.3, cd: 9, desc: 'A flame dial pellet that becomes a bird of fire.', say: 'Hi no Tori Boshi!',
        steps: [{ proj: { speed: 15, range: 14, radius: 0.55, damage: 30, sprite: 'bird', color: '#ff7043', element: 'fire', status: { burn: 3 }, pierce: true, trail: { color: ['#ff7043', '#ffca28'] } } }], learn: { mastery: 25, price: 12000 } },
      { id: 'snipe_popgreen', name: 'Pop Green: Devil', icon: '🌿', anim: 'shoot', weapon: 'gun', windup: 0.3, recover: 0.3, cd: 12, desc: 'A seed that bursts into a carnivorous plant, snaring enemies.',
        steps: [{ zone: { range: 2.2, duration: 4, interval: 0.5, damage: 5, slow: 0.35, color: '#43a047', atTarget: true, kind: 'plant' } }], learn: { mastery: 40, price: 30000 } },
      { id: 'snipe_kabuto', name: 'Sure-Kill Kabuto Barrage', icon: '🎇', anim: 'shoot', weapon: 'gun', windup: 0.3, recover: 0.5, cd: 14, desc: 'Fire a volley of stars in a fan.',
        steps: [{ proj: { speed: 20, range: 13, radius: 0.22, damage: 10, count: 7, spread: 0.9, sprite: 'star', knockback: 2 } }, { at: 0.5, proj: { speed: 20, range: 13, radius: 0.22, damage: 10, count: 7, spread: 0.9, sprite: 'star', knockback: 2 } }], learn: { mastery: 60, price: 60000 } },
    ],
  },

  okama_kenpo: {
    name: 'Okama Kenpo', icon: '🦢', weapon: null, legs: true,
    desc: 'Ballet-based kicking art of the okama. Mr. 2 Bon Clay and Emporio Ivankov are its masters.',
    m1: [
      m1('okama_1', 'okama_kenpo', 'ballet_kick', 7, { range: 1.7 }),
      m1('okama_2', 'okama_kenpo', 'pirouette', 7, { range: 1.7 }),
      m1('okama_3', 'okama_kenpo', 'jete', 13, { range: 1.9, kb: 4, recover: 0.3 }),
    ],
    heavy: { id: 'okama_heavy', name: 'Swan Arabesque', anim: 'arabesque', windup: 0.3, recover: 0.35, cd: 1.4, say: 'Swan Arabesque!', steps: [{ hit: { shape: 'line', range: 2.4, width: 0.8, damage: 20, knockback: 6, stun: 0.5, heavy: true, guardBreak: true } }] },
    techniques: [
      { id: 'okama_pirouette', name: 'Swan Pirouette', icon: '🩰', anim: 'pirouette', windup: 0.2, recover: 0.35, cd: 6, desc: 'A spinning series of kicks.', steps: [{ hit: { shape: 'circle', range: 2.2, damage: 7, knockback: 3, stun: 0.25, duration: 0.5, interval: 0.1 }, vfx: 'ring' }], learn: { mastery: 0, price: 5000 } },
      { id: 'okama_swan_dash', name: 'Bon Kurei', icon: '🦩', anim: 'jete', windup: 0.2, recover: 0.3, cd: 6, desc: 'Charge forward like a swan taking flight.', steps: [{ dash: { dist: 7, time: 0.24, iframes: 0.2, hit: { damage: 24, knockback: 6, stun: 0.5 } } }], learn: { mastery: 15, price: 12000 } },
      { id: 'okama_hell_wink', name: 'Death Wink', icon: '😉', anim: 'point', windup: 0.4, recover: 0.3, cd: 12, desc: 'A wink so powerful it blasts people away. (Ivankov\'s specialty.)', say: 'Death Wink!',
        steps: [{ proj: { speed: 16, range: 11, radius: 0.9, damage: 34, sprite: 'shockwave', color: '#f48fb1', pierce: true, knockback: 10, stun: 0.6, heavy: true } }], learn: { mastery: 40, price: 45000 } },
    ],
  },

  electro: {
    name: 'Electro', icon: '⚡', weapon: null,
    desc: 'Every Mink is born able to channel electricity through their fur.',
    innate: 'mink',
    m1: [
      m1('elec_1', 'electro', 'claw', 6, { element: 'lightning' }),
      m1('elec_2', 'electro', 'claw2', 6, { element: 'lightning' }),
      m1('elec_3', 'electro', 'kick_high', 11, { element: 'lightning', kb: 4, stun: 0.45, recover: 0.28, status: { shock: 0.6 } }),
    ],
    heavy: { id: 'elec_heavy', name: 'Electrical Claw', anim: 'claw_x', windup: 0.3, recover: 0.35, cd: 1.4, steps: [{ hit: { shape: 'arc', range: 1.8, arc: 1.8, offset: 0.2, damage: 17, knockback: 5, stun: 0.6, heavy: true, element: 'lightning', status: { shock: 1 }, slashing: true }, vfx: 'slash', color: '#fff176' }] },
    techniques: [
      { id: 'elec_discharge', name: 'Electro Discharge', icon: '🌩', anim: 'spread', windup: 0.3, recover: 0.35, cd: 7, desc: 'Release all your stored electricity around you.',
        steps: [{ hit: { shape: 'circle', range: 2.6, damage: 20, knockback: 4, stun: 0.8, element: 'lightning', status: { shock: 1.2 } }, vfx: 'ring', color: '#fff176' }], learn: { mastery: 0, price: 0, innate: true } },
      { id: 'elec_garchu', name: 'Electro Lance', icon: '⚡', anim: 'thrust', windup: 0.25, recover: 0.3, cd: 6, desc: 'Launch a bolt of electricity in a straight line.',
        steps: [{ hit: { shape: 'line', range: 7, width: 0.8, damage: 24, knockback: 3, stun: 0.5, element: 'lightning', status: { shock: 0.8 } }, vfx: 'beam', color: '#fff176' }], learn: { mastery: 20, price: 9000 } },
      { id: 'elec_sulong', name: 'Sulong', icon: '🌕', anim: 'cast', windup: 0.8, recover: 0.2, cd: 90, desc: 'Under the full moon, a Mink with the will becomes a white-furred battle beast. Only at night.',
        requiresNight: true,
        steps: [{ fx: { ring: 3, color: '#ffffff', text: 'SULONG!', flash: 0.3 } }, { at: 0.8, buff: { id: 'sulong', name: 'Sulong', dur: 25, mods: { damage: 1.8, speedMul: 1.35, defMul: 0.8, atkSpeed: 1.2 }, aura: 'rgba(255,255,255,0.95)', look: { furWhite: true } } }], learn: { mastery: 70, price: 0, special: 'full_moon' } },
    ],
  },

  hasshoken: {
    name: 'Hasshoken (Eight-Impact Fist)', icon: '🐉', weapon: null,
    desc: 'The vibrating fist of the Chinjao Family of Kano Country. Strikes pass through armour and guards.',
    m1: [
      m1('hassho_1', 'hasshoken', 'jab', 7, { stun: 0.25 }),
      m1('hassho_2', 'hasshoken', 'cross', 7, { stun: 0.25 }),
      m1('hassho_3', 'hasshoken', 'palm', 12, { kb: 4.5, recover: 0.3 }),
    ],
    heavy: { id: 'hassho_heavy', name: 'Vibrating Palm', anim: 'palm_double', windup: 0.35, recover: 0.35, cd: 1.5, steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 20, knockback: 6, stun: 0.6, heavy: true, unblockable: true } }] },
    techniques: [
      { id: 'hassho_bushin', name: 'Bushin Kyuran', icon: '🌀', anim: 'palm', windup: 0.3, recover: 0.3, cd: 7, desc: 'A shockwave that ignores guards.', steps: [{ proj: { speed: 14, range: 9, radius: 0.7, damage: 26, sprite: 'shockwave', pierce: true, knockback: 6, stun: 0.6, unblockable: true } }], learn: { mastery: 10, price: 10000 } },
      { id: 'hassho_drill', name: 'Drill Head', icon: '🦏', anim: 'charge', windup: 0.35, recover: 0.4, cd: 10, desc: 'A spinning head-first charge that bores through anything.', steps: [{ dash: { dist: 7, time: 0.3, iframes: 0.25, hit: { damage: 40, knockback: 8, stun: 0.8, heavy: true, guardBreak: true } } }], learn: { mastery: 35, price: 35000 } },
    ],
  },

  weather_science: {
    name: 'Weather Science (Clima-Tact)', icon: '🌦', weapon: 'staff',
    desc: 'The science of Weatheria, wielded through a Clima-Tact. Summon thunder, mirages and cyclones.',
    m1: [
      m1('clima_1', 'weather_science', 'staff', 6, { weapon: 'staff', range: 1.7 }),
      m1('clima_2', 'weather_science', 'staff2', 6, { weapon: 'staff', range: 1.7 }),
      m1('clima_3', 'weather_science', 'staff_jab', 9, { weapon: 'staff', range: 1.9, kb: 3.5, recover: 0.3 }),
    ],
    heavy: { id: 'clima_heavy', name: 'Heat Egg', anim: 'raise', weapon: 'staff', windup: 0.35, recover: 0.3, cd: 2, steps: [{ proj: { speed: 10, range: 10, radius: 0.35, damage: 15, sprite: 'orb', color: '#ff8a65', element: 'fire', explode: { range: 1.5, damage: 10, element: 'fire' } } }] },
    // (a plain staff swung by someone who never learned the science throws no Heat Egg)
    plainHeavy: { id: 'clima_plain_heavy', name: 'Staff Sweep', anim: 'heavy', weapon: 'staff', windup: 0.32, recover: 0.35, cd: 1.4, steps: [{ hit: { shape: 'arc', range: 2.0, arc: 2.0, offset: 0.2, damage: 16, knockback: 5, stun: 0.45, heavy: true, guardBreak: true } }] },
    techniques: [
      { id: 'clima_thunderbolt', name: 'Thunderbolt Tempo', icon: '⚡', anim: 'raise', weapon: 'staff', windup: 0.55, recover: 0.3, cd: 8, desc: 'Build a thundercloud over your foe — and strike.', say: 'Thunderbolt Tempo!',
        steps: [{ zone: { range: 1.6, duration: 0.6, interval: 0.6, damage: 34, element: 'lightning', status: { shock: 1.2 }, color: '#fff176', atTarget: true, kind: 'thunder' } }], learn: { mastery: 0, price: 12000 } },
      { id: 'clima_cyclone', name: 'Cyclone Tempo', icon: '🌪', anim: 'cast', weapon: 'staff', windup: 0.4, recover: 0.3, cd: 9, desc: 'A small cyclone that blasts enemies away.', steps: [{ proj: { speed: 9, range: 9, radius: 1.0, damage: 16, sprite: 'shockwave', color: '#b3e5fc', pierce: true, knockback: 10, stun: 0.6 } }], learn: { mastery: 15, price: 18000 } },
      { id: 'clima_mirage', name: 'Mirage Tempo', icon: '🌫', anim: 'cast', weapon: 'staff', windup: 0.2, recover: 0.2, cd: 18, desc: 'Bend the light: you become nearly invisible for a while.', steps: [{ buff: { id: 'mirage', name: 'Mirage', dur: 6, mods: { stealth: 1, evade: 0.35 }, alpha: 0.25 } }], learn: { mastery: 30, price: 30000 } },
      { id: 'clima_zeus', name: 'Thunder Lance Tempo', icon: '🌩', anim: 'staff_jab', weapon: 'staff', windup: 0.8, recover: 0.4, cd: 22, desc: 'A spear of lightning from the heavens.', steps: [{ hit: { shape: 'line', range: 12, width: 1.4, damage: 70, knockback: 5, stun: 1, element: 'lightning', status: { shock: 1.5 }, heavy: true, impactFrame: true }, vfx: 'beam', color: '#fff176' }], learn: { mastery: 55, price: 90000 } },
    ],
  },

  elbaf: {
    name: 'Elbaf Warrior Style', icon: '🪓', weapon: 'axe',
    desc: 'The proud battle-art of the giants of Elbaf. Heavy, unstoppable, honourable.',
    m1: [
      m1('elbaf_1', 'elbaf', 'axe', 10, { weapon: 'axe', slashing: true, range: 1.9, arc: 2.2, windup: 0.12, recover: 0.24 }),
      m1('elbaf_2', 'elbaf', 'axe2', 16, { weapon: 'axe', slashing: true, range: 2.1, arc: 2.6, kb: 5, stun: 0.5, windup: 0.15, recover: 0.4 }),
    ],
    heavy: { id: 'elbaf_heavy', name: 'Giant Cleaver', anim: 'axe_slam', weapon: 'axe', windup: 0.5, recover: 0.4, cd: 1.8, steps: [{ hit: { shape: 'circle', range: 2.3, damage: 30, knockback: 7, stun: 0.7, heavy: true, guardBreak: true, shake: 0.35 }, vfx: 'ring' }] },
    techniques: [
      { id: 'elbaf_hakoku', name: 'Hakoku', icon: '🛡', anim: 'heavy', weapon: 'axe', windup: 0.6, recover: 0.5, cd: 12, desc: 'Overlord: the thrust Dorry and Brogy used to split a Sea King in two.', say: 'HAKOKU!',
        steps: [{ hit: { shape: 'line', range: 8, width: 2, damage: 60, knockback: 10, stun: 1, heavy: true, guardBreak: true, impactFrame: true, hitShips: true }, vfx: 'beam', color: '#ffe082' }], learn: { mastery: 20, price: 40000 } },
    ],
  },

  ryusoken: {
    name: 'Ryusoken (Dragon Claw Fist)', icon: '🐲', weapon: null,
    desc: 'The crushing claw style of the Revolutionary Army\'s chief of staff. Grips shatter armour and stone.',
    m1: [
      m1('ryu_1', 'ryusoken', 'grab', 8),
      m1('ryu_2', 'ryusoken', 'grab2', 8),
      m1('ryu_3', 'ryusoken', 'claw_x', 13, { kb: 4, recover: 0.3, stun: 0.5 }),
    ],
    heavy: { id: 'ryu_heavy', name: 'Dragon\'s Breath', anim: 'slam', windup: 0.4, recover: 0.4, cd: 1.6, steps: [{ hit: { shape: 'circle', range: 2.2, damage: 26, knockback: 6, stun: 0.6, heavy: true, guardBreak: true }, vfx: 'ring' }] },
    techniques: [
      { id: 'ryu_claw', name: 'Dragon Claw', icon: '🐉', anim: 'claw', windup: 0.25, recover: 0.35, cd: 7, desc: 'A gripping strike that crushes guards completely.', steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.2, offset: 0.2, damage: 36, knockback: 3, stun: 1.2, unblockable: true, heavy: true } }], learn: { mastery: 15, price: 30000 } },
      { id: 'ryu_hiken', name: 'Fire Fist (Sabo)', icon: '🔥', anim: 'punch', windup: 0.4, recover: 0.35, cd: 14, desc: 'Requires the Mera Mera no Mi... or does it? A flaming dragon claw strike.', requiresFruit: 'mera',
        steps: [{ proj: { speed: 16, range: 12, radius: 0.9, damage: 50, sprite: 'firefist', element: 'fire', pierce: true, status: { burn: 3 } } }], learn: { mastery: 40, price: 60000 } },
    ],
  },
};

export const STYLE_IDS = Object.keys(STYLES);

/**
 * The plainest style for each kind of weapon: whoever holds one their own
 * style doesn't use fights with its basic moves (see lineage.js
 * fightingStyle) — a brawler who picks up a cutlass swings the cutlass.
 */
export const WEAPON_STYLE = { sword: 'ittoryu', gun: 'sniper', staff: 'weather_science', axe: 'elbaf' };

// register everything as abilities
for (const [sid, s] of Object.entries(STYLES)) {
  const list = [...s.m1, s.heavy, ...(s.plainHeavy ? [s.plainHeavy] : []), ...s.techniques].map((a) => ({ ...a, style: sid, source: 'style:' + sid, weapon: a.weapon ?? s.weapon ?? undefined }));
  registerAbilities(list, 'style:' + sid);
  s.m1Ids = s.m1.map((a) => a.id);
  s.heavyId = s.heavy.id;
  s.plainHeavyId = s.plainHeavy?.id;
}

export function styleTechniques(styleId) {
  return (STYLES[styleId]?.techniques || []).map((t) => t.id);
}
