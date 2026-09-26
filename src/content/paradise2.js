// Paradise, second half & the Calm Belt: Water 7 and the Puffing Tom line,
// Enies Lobby, the Florian Triangle / Thriller Bark, the Sabaody Archipelago,
// Marineford, the islands Kuma scattered the Straw Hats to, Amazon Lily,
// Rusukaina and Impel Down (surface gate + the NPCs of its six levels).
//
// The player is a rival rookie (or a Marine) who arrives as the canon arcs
// happen: the CP9 conspiracy, the Enies Lobby raid, Moria's shadow theft, the
// Celestial Dragon incident, the Impel Down breakout and the Summit War.
import './bossMoves.js';
import { spawnNow, findActor, aggro, despawn, spawnGroup } from './helpers.js';
import { addItem, count, removeItem } from '../game/inventory.js';
import { persist } from '../game/lineage.js';
import { findShore } from '../game/interact.js';

// ------------------------------------------------------------------ helpers
const S = (g, id) => g.quests.stageId(id); // current stage id (or null)
const D = (g, id) => g.quests.isDone(id);
const ON = (g, id) => !!g.quests.state(id) && !g.quests.isDone(id); // started, not finished
const at = (ctx, id, st) => ctx.game.quests.stageId(id) === st;
const beat = (c, id) => (c.bosses || []).includes(id) || !!(c.defeated || {})[id];
const marine = (c) => c.faction === 'marine';
const wanted = (c) => (c.bounty || 0) > 0 && c.faction !== 'marine';
const islandRec = (g, id) => g.surface.islands.find((i) => i.id === id) || null;
const spotOf = (g, islandId, spot) => {
  const isl = islandRec(g, islandId) || (g.world?.islands || []).find((i) => i.id === islandId);
  return isl?.spots?.[spot] || null;
};
const reportMark = (qid, stages = ['report']) => (c, g) => (stages.includes(S(g, qid)) ? '?' : null);
const MARINE_WARN = ' (You serve the Marines: striking down World Government agents will brand you a deserter.)';

/** Carry the player (and, optionally, their nearest ship) to another island. */
function travel(game, islandId, { spot, ship = true, banner, onArrive } = {}) {
  const dest = islandRec(game, islandId);
  const p = game.player;
  if (!dest || !p || game.world !== game.surface) return false;
  const target = (spot && dest.spots[spot]) || dest.docks[0]?.land || { x: dest.x, y: dest.y };
  game.ui.fade(true);
  setTimeout(() => {
    if (ship) {
      const s = game.ships.find((x) => x.owner === 'player' && !x.sunk && game.world.distance(x.x, x.y, p.x, p.y) < 140);
      const moor = dest.docks[0]?.moor;
      if (s && moor) { s.x = moor.x; s.y = moor.y; s.speed = 0; if (!s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world); }
    }
    const st = findShore(game.world, target.x, target.y, 12) || target;
    p.x = st.x; p.y = st.y;
    game.snapCamera();
    game.ui.fade(false);
    if (banner) game.ui.banner(banner[0], banner[1] || '', banner[2] || '', banner[3] || 5);
    onArrive?.(game);
    persist(game);
  }, 800);
  return true;
}

// ---------------------------------------------------------- boss techniques
const abilities = [
  // CP9 and the Six Powers
  { id: 'p2_shigan_oren', name: 'Shigan: Oren', anim: 'punch', windup: 0.3, recover: 0.3, cd: 6, cost: { stamina: 10 }, say: 'Shigan... Oren!',
    steps: [0, 0.08, 0.16, 0.24, 0.32].map((t) => ({ at: 0.3 + t, hit: { shape: 'arc', range: 1.9, arc: 0.9, offset: 0.2, damage: 9, knockback: 1, stun: 0.25, status: { bleed: 2 } } })) },
  { id: 'p2_rankyaku_gaicho', name: 'Rankyaku: Gaicho', anim: 'kick', windup: 0.45, recover: 0.4, cd: 7, cost: { stamina: 12 }, say: 'Rankyaku: Gaicho!',
    steps: [{ proj: { speed: 19, range: 13, radius: 0.7, damage: 30, sprite: 'airslash', size: 1.8, pierce: true, slashing: true, knockback: 5, stun: 0.4 } }] },
  { id: 'p2_amanedachi', name: 'Rankyaku: Amanedachi', anim: 'kick', windup: 0.5, recover: 0.45, cd: 9, cost: { stamina: 14 }, say: 'Rankyaku: Amanedachi!',
    steps: [{ hit: { shape: 'circle', range: 4.2, damage: 9, knockback: 3, stun: 0.25, slashing: true, duration: 0.7, interval: 0.14 }, vfx: 'ring', color: '#eceff1' }] },
  { id: 'p2_kirin_hou', name: 'Kirinhou (Giraffe Cannon)', anim: 'thrust', windup: 0.45, recover: 0.45, cd: 8, cost: { stamina: 12 }, say: 'Kirinhou!',
    steps: [{ dash: { dist: 9, time: 0.28, iframes: 0.15, hit: { damage: 32, knockback: 9, stun: 0.6, heavy: true, guardBreak: true } } }] },
  { id: 'p2_tekkai_kenpo', name: 'Tekkai Kenpo', anim: 'heavy', windup: 0.4, recover: 0.4, cd: 6, cost: { stamina: 12 }, say: 'Tekkai Kenpo!',
    steps: [{ hit: { shape: 'arc', range: 2.2, arc: 1.3, offset: 0.3, damage: 30, knockback: 7, stun: 0.5, heavy: true, guardBreak: true } }, { buff: { id: 'p2_iron_body', name: 'Tekkai', dur: 2.5, mods: { defMul: 0.5 } } }] },
  { id: 'p2_wolf_fang', name: 'Wolf Fang', anim: 'slash', windup: 0.25, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 1.7, offset: 0.2, damage: 18, knockback: 2, stun: 0.3, slashing: true, status: { bleed: 3 } }, vfx: 'slash', color: '#8d6e63' }] },
  { id: 'p2_shishi_kebab', name: 'Shishi Kebab', anim: 'thrust', windup: 0.45, recover: 0.4, cd: 7, cost: { stamina: 10 }, say: 'Shishi... KEBAB! Yoyoi!',
    steps: [{ dash: { dist: 6, time: 0.25, hit: { damage: 28, knockback: 7, stun: 0.5, element: 'fire', status: { burn: 3 }, heavy: true } } }] },
  { id: 'p2_life_return', name: 'Life Return: Hair Bind', anim: 'grab', windup: 0.4, recover: 0.4, cd: 12, cost: { stamina: 12 },
    steps: [{ proj: { speed: 13, range: 10, radius: 0.5, damage: 10, sprite: 'string', color: '#f48fb1', homing: 2, status: { root: 2 } } }, { heal: 40, color: '#f8bbd0' }] },
  { id: 'p2_jugan_ken', name: 'Jugan Ken', anim: 'punch', windup: 0.3, recover: 0.35, cd: 6, cost: { stamina: 10 }, say: 'Chapapa! Jugan Ken!',
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 1.2, offset: 0.2, damage: 6, knockback: 1, stun: 0.2, duration: 0.8, interval: 0.1 }, vfx: 'fist' }] },
  { id: 'p2_golden_awa', name: 'Golden Awa', anim: 'cast', windup: 0.4, recover: 0.35, cd: 10, cost: { stamina: 12 }, say: 'Golden Awa!',
    steps: [{ proj: { speed: 9, range: 10, radius: 0.5, damage: 6, count: 5, spread: 0.9, sprite: 'orb', color: '#fff9c4', homing: 2, status: { slowmo: 3 } } }] },
  { id: 'p2_ibara_road', name: 'Ibara Road', anim: 'slash', windup: 0.35, recover: 0.35, cd: 5, cost: { stamina: 8 }, say: 'Ibara Road!',
    steps: [{ hit: { shape: 'line', range: 5.5, width: 0.9, damage: 20, knockback: 3, stun: 0.35, status: { bleed: 2 } }, vfx: 'beam', color: '#bcaaa4' }] },
  { id: 'p2_air_door', name: 'Air Door', anim: 'cast', windup: 0.25, recover: 0.2, cd: 8, cost: { stamina: 10 },
    steps: [{ teleport: { dist: 8, color: '#90a4ae' } }, { at: 0.4, hit: { shape: 'arc', range: 1.9, arc: 1.4, offset: 0.2, damage: 24, knockback: 6, stun: 0.5, heavy: true } }] },
  { id: 'p2_funkfreed', name: 'Funkfreed!', anim: 'thrust', windup: 0.5, recover: 0.5, cd: 8, cost: { stamina: 8 }, say: 'Go, Funkfreed!',
    steps: [{ dash: { dist: 7, time: 0.35, hit: { damage: 16, knockback: 8, stun: 0.5, slashing: true } } }] },
  // Enies Lobby and Water 7
  { id: 'p2_giant_club', name: 'Giant Club Smash', anim: 'heavy', windup: 0.8, recover: 0.6, cd: 6, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 3.8, arc: 1.4, offset: 0.4, damage: 36, knockback: 11, stun: 0.8, heavy: true, guardBreak: true, shake: 0.6 }, vfx: 'ring', color: '#8d6e63' }] },
  { id: 'p2_verdict', name: 'Guilty! Innocent! Death!', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 8, cost: { stamina: 10 }, say: 'GUILTY!',
    steps: [{ zone: { range: 2.4, duration: 0.8, interval: 0.4, damage: 26, color: '#ffd54f', atTarget: true, kind: 'thunder' } }] },
  { id: 'p2_ramen_kenpo', name: 'Ramen Kenpo', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 7, cost: { stamina: 10 }, say: 'Ramen Kenpo!',
    steps: [{ proj: { speed: 14, range: 10, radius: 0.35, damage: 10, count: 4, spread: 0.6, sprite: 'string', color: '#ffe082', status: { root: 1.2 } } }] },
  { id: 'p2_rope_action', name: 'Rope Action', anim: 'grab', windup: 0.3, recover: 0.3, cd: 7, cost: { stamina: 10 }, say: 'Rope Action!',
    steps: [{ proj: { speed: 16, range: 10, radius: 0.4, damage: 12, sprite: 'string', color: '#d7ccc8', status: { root: 1.8 } } }] },
  { id: 'p2_strong_right', name: 'Strong Right', anim: 'punch', windup: 0.35, recover: 0.4, cd: 6, cost: { stamina: 10 }, say: 'Strong Right!',
    steps: [{ proj: { speed: 22, range: 8, radius: 0.6, damage: 28, sprite: 'gomufist', knockback: 8, stun: 0.5 } }] },
  // Thriller Bark
  { id: 'p2_kage_kakumei', name: 'Kage Kakumei', anim: 'cast', windup: 0.5, recover: 0.4, cd: 9, cost: { stamina: 12 }, say: 'Kage Kakumei!',
    steps: [{ hit: { shape: 'line', range: 9, width: 1.4, damage: 28, knockback: 5, stun: 0.5, heavy: true }, vfx: 'beam', color: '#263238' }] },
  { id: 'p2_tsuno_tokage', name: 'Tsuno-Tokage', anim: 'cast', windup: 0.8, recover: 0.4, cd: 12, cost: { stamina: 16 }, say: 'Tsuno-Tokage!',
    steps: [{ zone: { range: 1.8, duration: 0.6, interval: 0.3, damage: 42, color: '#37474f', atTarget: true, kind: 'field' } }] },
  { id: 'p2_tokuhollow', name: 'Tokuhollow', anim: 'cast', windup: 0.7, recover: 0.4, cd: 14, cost: { stamina: 14 }, say: 'Tokuhollow!',
    steps: [{ proj: { speed: 7, range: 10, radius: 1.0, damage: 10, sprite: 'orb', size: 2.2, color: '#e1bee7', homing: 2.5, explode: { range: 3.2, damage: 40, colors: ['#e1bee7', '#ffffff'] } } }] },
  { id: 'p2_lion_bite', name: "Lion's Jaw", anim: 'grab', windup: 0.3, recover: 0.35, cd: 5, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 1.7, arc: 1.2, offset: 0.2, damage: 26, knockback: 2, stun: 0.7, status: { bleed: 3 } } }] },
  { id: 'p2_scalpel', name: 'Genius Scalpel', anim: 'slash', windup: 0.2, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'arc', range: 1.6, arc: 1.4, offset: 0.2, damage: 14, knockback: 1, stun: 0.2, slashing: true, status: { bleed: 3 } }, vfx: 'slash', color: '#eceff1' }] },
  { id: 'p2_plates', name: "Cindry's Plates", anim: 'shoot', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ proj: { speed: 17, range: 11, radius: 0.35, damage: 11, count: 4, spread: 0.5, sprite: 'star', color: '#fafafa', slashing: true } }] },
  { id: 'p2_oars_smash', name: 'Demon Fist', anim: 'heavy', windup: 0.9, recover: 0.6, cd: 6, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'arc', range: 4.5, arc: 1.3, offset: 0.5, damage: 44, knockback: 12, stun: 0.9, heavy: true, guardBreak: true, shake: 0.8 }, vfx: 'ring', color: '#5d4037' }] },
  { id: 'p2_shishi_sonson', name: 'Shishi Sonson', anim: 'thrust', windup: 0.35, recover: 0.4, cd: 7, cost: { stamina: 12 }, say: 'Shishi Sonson.',
    steps: [{ dash: { dist: 8, time: 0.18, iframes: 0.2, hit: { damage: 38, knockback: 4, stun: 0.5, slashing: true, status: { bleed: 4 } } } }] },
  // Sabaody and the Marines
  { id: 'p2_ashigara_dokkoi', name: 'Ashigara Dokkoi', anim: 'thrust', windup: 0.5, recover: 0.45, cd: 7, cost: { stamina: 12 }, say: 'Ashigara Dokkoi!',
    steps: [{ hit: { shape: 'arc', range: 2.4, arc: 1.0, offset: 0.3, damage: 34, knockback: 12, stun: 0.6, heavy: true, guardBreak: true, haki: true }, vfx: 'ring', color: '#212121' }] },
  { id: 'p2_fist_of_love', name: 'Fist of Love', anim: 'heavy', windup: 0.5, recover: 0.45, cd: 5, cost: { stamina: 10 }, say: 'Fist of LOVE!',
    steps: [{ hit: { shape: 'arc', range: 2.0, arc: 1.1, offset: 0.3, damage: 60, knockback: 14, stun: 1.0, heavy: true, guardBreak: true, haki: true, shake: 0.7, impactFrame: 0.08 } }] },
  { id: 'p2_cannonball_pitch', name: 'Cannonball Pitch', anim: 'shoot', windup: 0.4, recover: 0.35, cd: 6, cost: { stamina: 10 },
    steps: [{ proj: { speed: 20, range: 14, radius: 0.5, damage: 26, count: 3, spread: 0.5, sprite: 'cannonball', size: 1.4, explode: { range: 2, damage: 20 } } }] },
  { id: 'p2_buddha_wave', name: 'Buddha Shockwave', anim: 'punch', windup: 0.7, recover: 0.5, cd: 9, cost: { stamina: 14 }, say: 'Daibutsu!',
    steps: [{ proj: { speed: 13, range: 13, radius: 1.3, damage: 55, sprite: 'shockwave', size: 3, pierce: true, color: '#ffd54f', knockback: 14, stun: 0.8, heavy: true } }] },
  { id: 'p2_daibutsu', name: 'Human-Human Fruit, Model: Daibutsu', anim: 'cast', windup: 0.6, recover: 0.2, cd: 60, cost: { stamina: 20 },
    steps: [{ buff: { id: 'p2_daibutsu', name: 'Great Buddha', dur: 25, mods: { damage: 1.5, defMul: 0.7, scale: 1.6 }, aura: 'rgba(255,213,79,0.7)' } }] },
  { id: 'p2_yoru_slash', name: 'Kokuto: Yoru', anim: 'slash', windup: 0.6, recover: 0.5, cd: 7, cost: { stamina: 14 },
    steps: [{ proj: { speed: 21, range: 16, radius: 1.1, damage: 70, sprite: 'airslash', size: 3, color: '#212121', pierce: true, slashing: true, knockback: 9, stun: 0.6, haki: true, hitShips: true } }] },
  { id: 'p2_pacifista_pad', name: 'Pad Ho (Pacifista)', anim: 'punch', windup: 0.5, recover: 0.4, cd: 7, cost: { stamina: 10 },
    steps: [{ proj: { speed: 18, range: 12, radius: 0.6, damage: 24, sprite: 'paw', size: 1.5, knockback: 9, pierce: true } }] },
  // Amazon Lily (Mero Mero no Mi is not a player fruit here: Hancock's moves live in this pack)
  { id: 'p2_slave_arrow', name: 'Slave Arrow', anim: 'shoot', windup: 0.5, recover: 0.4, cd: 8, cost: { stamina: 12 }, say: 'Slave Arrow!',
    steps: [{ proj: { speed: 18, range: 13, radius: 0.35, damage: 12, count: 7, spread: 0.9, sprite: 'petal', color: '#f48fb1', status: { freeze: 1.1 } } }] },
  { id: 'p2_pistol_kiss', name: 'Pistol Kiss', anim: 'shoot', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 }, say: 'Pistol Kiss!',
    steps: [{ proj: { speed: 26, range: 12, radius: 0.35, damage: 22, sprite: 'petal', color: '#ec407a', status: { freeze: 0.6 } } }] },
  { id: 'p2_mero_mellow', name: 'Mero Mero Mellow', anim: 'cast', windup: 0.8, recover: 0.5, cd: 16, cost: { stamina: 16 }, say: 'Mero Mero... Mellow!',
    steps: [{ hit: { shape: 'arc', range: 7, arc: 1.1, offset: 0.2, damage: 20, stun: 0.2, status: { freeze: 2.2 }, unblockable: true }, vfx: 'beam', color: '#f06292' }] },
  { id: 'p2_perfume_femur', name: 'Perfume Femur', anim: 'kick', windup: 0.35, recover: 0.4, cd: 6, cost: { stamina: 10 }, say: 'Perfume Femur!',
    steps: [{ hit: { shape: 'arc', range: 2.1, arc: 1.3, offset: 0.3, damage: 30, knockback: 8, stun: 0.5, heavy: true, status: { freeze: 0.8 } }, vfx: 'slash', color: '#f8bbd0' }] },
  { id: 'p2_snake_lunge', name: 'Snake Lunge', anim: 'thrust', windup: 0.3, recover: 0.35, cd: 5, cost: { stamina: 10 },
    steps: [{ dash: { dist: 7, time: 0.25, hit: { damage: 24, knockback: 5, stun: 0.5, status: { poison: 3 } } } }] },
  { id: 'p2_coil_crush', name: 'Coil Crush', anim: 'grab', windup: 0.45, recover: 0.4, cd: 9, cost: { stamina: 12 },
    steps: [{ hit: { shape: 'circle', range: 2.8, damage: 26, knockback: 1, stun: 0.3, status: { root: 1.8 } }, vfx: 'ring', color: '#66bb6a' }] },
  // Impel Down
  { id: 'p2_hannyabal_halberd', name: 'Hannyabal Halberd', anim: 'slash', windup: 0.45, recover: 0.4, cd: 5, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 3.0, arc: 2.2, offset: 0.3, damage: 30, knockback: 6, stun: 0.5, slashing: true }, vfx: 'slash', color: '#b0bec5' }] },
  { id: 'p2_red_demon_whip', name: 'Red Demon Whip', anim: 'slash', windup: 0.3, recover: 0.3, cd: 4, cost: { stamina: 8 },
    steps: [{ hit: { shape: 'line', range: 6, width: 0.9, damage: 18, knockback: 3, stun: 0.4, status: { bleed: 2 } }, vfx: 'beam', color: '#e53935' }] },
  { id: 'p2_beast_pounce', name: 'Beast Pounce', anim: 'thrust', windup: 0.45, recover: 0.4, cd: 6, cost: { stamina: 10 },
    steps: [{ dash: { dist: 8, time: 0.3, hit: { damage: 30, knockback: 7, stun: 0.6, heavy: true, status: { bleed: 2 } } } }] },
  { id: 'p2_minotaur_club', name: 'Jailer Club', anim: 'heavy', windup: 0.6, recover: 0.5, cd: 5, cost: { stamina: 10 },
    steps: [{ hit: { shape: 'arc', range: 3.0, arc: 1.5, offset: 0.4, damage: 38, knockback: 10, stun: 0.7, heavy: true, guardBreak: true, shake: 0.5 } }] },
  { id: 'p2_hell_wink', name: 'Hell Wink', anim: 'cast', windup: 0.4, recover: 0.3, cd: 8, cost: { stamina: 12 }, say: 'Hell Wink!',
    steps: [{ hit: { shape: 'arc', range: 5, arc: 0.8, offset: 0.2, damage: 30, knockback: 14, stun: 0.5 }, vfx: 'ring', color: '#f8bbd0' }] },
];

// ---------------------------------------------------------------- items
const items = {
  p2_salt: { name: 'Purifying Salt', icon: '🧂', type: 'material', price: 400, desc: 'Stuff it in a zombie\'s mouth and the stolen shadow inside flies back to its owner. The Thriller Bark Victims\' Association swears by it.' },
  p2_takoyaki: { name: 'Hachi\'s Takoyaki', icon: '🐙', type: 'food', heal: 95, stamina: 70, price: 160, desc: 'Six-armed service at Takoyaki Hachi, Grove 41. The best takoyaki in Sabaody.' },
  p2_gourmet_platter: { name: 'Pucci Gourmet Platter', icon: '🍱', type: 'food', heal: 260, stamina: 130, price: 1500, buff: { id: 'well_fed', name: 'Well Fed', dur: 180, mods: { damage: 1.1 } }, desc: 'The Gourmet City\'s pride. Leaves you Well Fed.' },
  p2_attack_cuisine: { name: 'Attack Cuisine', icon: '🍲', type: 'food', heal: 160, stamina: 110, price: 2500, buff: { id: 'p2_attack_cuisine', name: 'Attack Cuisine', dur: 240, mods: { damage: 1.12, defMul: 0.93 } }, desc: 'One of the Kamabakka Kingdom\'s one hundred Attack Recipes: food that makes you stronger.' },
  p2_kuja_bow: { name: 'Kuja Snake Bow', icon: '🏹', type: 'weapon', kind: 'gun', power: 1.45, price: 180000, grade: 'Kuja', desc: 'A living snake that stiffens into a bow in a Kuja warrior\'s hands. It seems to like you.' },
  p2_shipwright_mallet: { name: 'Galley-La Mallet', icon: '🔨', type: 'weapon', kind: 'axe', power: 1.3, price: 30000, desc: 'A shipwright\'s mallet from Water 7. Galley-La foremen fight off pirates with these.' },
  p2_funkfreed: { name: 'Funkfreed', icon: '🐘', type: 'weapon', kind: 'sword', power: 1.4, price: 0, grade: 'Unranked (it ate a Zoan)', unique: true, desc: 'Spandam\'s sword, which ate the Elephant-Elephant Fruit. It trumpets when swung.' },
  p2_cp9_mask: { name: 'CP9 Mask', icon: '🎭', type: 'hat', look: { hat: 'bandana', hatColor: '#212121' }, bonus: { agi: 2 }, price: 0, desc: 'A black mask worn by the assassins who attacked Galley-La headquarters.' },
  p2_carnival_mask: { name: 'Carnival Mask', icon: '🎭', type: 'hat', look: { hat: 'pinkhat', hatColor: '#8e24aa' }, bonus: { wil: 1 }, price: 2500, desc: 'San Faldo\'s festival never ends. Neither will this mask\'s smile.' },
  p2_sea_train_pass: { name: 'Puffing Tom Pass', icon: '🚂', type: 'key', price: 0, desc: 'A lifetime pass for the sea train that links Water 7, St. Poplar, Pucci and San Faldo. Signed "Iceburg — Nma."' },
  p2_vegapunk_notes: { name: 'Vegapunk\'s Old Notes', icon: '📓', type: 'key', price: 0, desc: 'Schematics from Karakuri Island: an early design for a cyborg soldier with a mouth laser... "Pacifista".' },
  p2_kuja_salve: { name: 'Kuja Herbal Salve', icon: '🌿', type: 'medicine', heal: 140, price: 600, cure: ['poison', 'bleed'], desc: 'Amazon Lily\'s warriors swear by it.' },
  p2_cola_barrel: { name: 'Franky\'s Cola', icon: '🥤', type: 'food', heal: 30, stamina: 160, price: 700, desc: 'The fuel of a cyborg. SUUUPER sweet.' },
};

// ------------------------------------------------------------- trainers
const trainers = {
  p2_heracles: {
    name: 'Heracles (Forest Scholar)', where: 'the Boin Archipelago', styles: { sniper: 4000 }, teaches: ['snipe_explode', 'snipe_firebird', 'snipe_popgreen', 'snipe_kabuto'], train: { agi: 45, wil: 45 },
    spar: { level: 40, style: 'sniper', weapon: 'gun', name: 'Heracles' },
    lines: ['Heraclesun! A sniper who cannot read the forest will be eaten by it.', 'These seeds are Pop Greens. Plant them in your enemy\'s path.'],
  },
  p2_kamabakka: {
    name: 'Kamabakka Candidate Master', where: 'Momoiro Island', styles: { okama_kenpo: 16000, black_leg: 9000 }, teaches: ['okama_pirouette', 'okama_swan_dash', 'bleg_skywalk', 'bleg_concasse'], train: { agi: 50, end: 45 },
    spar: { level: 44, style: 'okama_kenpo', name: 'Kamabakka Candidate' },
    lines: ['Newkama Kenpo! The way of the heart of a maiden and the kick of a warrior!', 'Eat your Attack Cuisine, candy-boy. Then we dance.'],
  },
};

// --------------------------------------------------------------- stock
const stock = {
  p2_w7_market: ['p2_cola_barrel', 'meat', 'fish_stew', 'rice_ball', 'bandage', 'antidote', 'den_den_mushi', 'p2_shipwright_mallet'],
  p2_bull_rental: ['cola', 'p2_cola_barrel', 'rice_ball', 'sake'],
  p2_poplar_timber: ['woodsman_axe', 'p2_shipwright_mallet', 'bandage', 'rice_ball', 'meat'],
  p2_poplar_black_market: ['adam_wood', 'seastone', 'seastone_cuffs', 'cola', 'rumble_ball'],
  p2_pucci_food: ['p2_gourmet_platter', 'sea_king_steak', 'fish_stew', 'meat', 'sake'],
  p2_sabaody_chandler: ['log_pose', 'new_world_log_pose', 'den_den_mushi', 'cola', 'bandage'],
  p2_takoyaki_menu: ['p2_takoyaki', 'fish_stew', 'sake'],
  p2_kuja_market: ['p2_kuja_bow', 'p2_kuja_salve', 'meat', 'fish_stew', 'antidote'],
  p2_marine_armory: ['marine_saber', 'marine_rifle', 'seastone_cuffs', 'bandage'],
  p2_karakuri_parts: ['cola', 'p2_cola_barrel', 'seastone', 'flintlock', 'marine_rifle'],
  p2_victims_supplies: ['p2_salt', 'bandage', 'antidote', 'rice_ball'],
  p2_attack_menu: ['p2_attack_cuisine', 'meat', 'sake', 'pink_hat'],
  p2_carnival_goods: ['p2_carnival_mask', 'pink_hat', 'tricorne', 'captain_coat', 'red_cloak'],
  p2_newkama_bar: ['sake', 'meat', 'p2_attack_cuisine', 'bandage'],
};

// ------------------------------------------------------- the Puffing Tom line
const TRAIN_STOPS = [['water_7', 'Water 7'], ['st_poplar', 'St. Poplar'], ['pucci', 'Pucci'], ['san_faldo', 'San Faldo']];
const FARE = 3000;
function trainChoices(ctx, here) {
  const free = () => ctx.has('p2_sea_train_pass');
  return TRAIN_STOPS.filter(([id]) => id !== here).map(([id, name]) => ({
    text: () => `Ride the Puffing Tom to ${name} (${free() ? 'pass' : `฿${FARE}`})`,
    do: (c) => {
      if (!free() && !c.pay(FARE)) return;
      travel(c.game, id, { banner: ['PUFFING TOM', name, 'The sea train races across the waves on its hidden rails. Your ship is towed along behind.', 4] });
    },
    end: true,
  }));
}
const stationmaster = (id, name, island, town, building, look) => ({
  id, name, title: 'Sea Train stationmaster', island, at: { town, building }, level: 8,
  look: { hair: 'short', hairColor: '#5d4037', top: '#2e7d32', bottom: '#1b5e20', hat: 'captain', hatColor: '#1b5e20', ...look },
  dialogue: (ctx) => ({ start: 'a', nodes: {
    a: { text: '"All aboard the Puffing Tom! Water 7, St. Poplar, Pucci, San Faldo — a century of trade on a single track. Tom of Tom\'s Workers built it with his own hands, you know. The Government executed him for building the Pirate King\'s ship."',
      choices: [...trainChoices(ctx, island), { text: 'Not today.', end: true }] },
  } }),
});

// -------------------------------------------------------------------- NPCs
const npcs = [
  // ================================================================ WATER 7
  {
    id: 'p2_iceburg', name: 'Iceburg', title: 'Mayor of Water 7, President of Galley-La', island: 'water_7', at: { town: 'w7_main_street', building: 'Galley-La Company Headquarters' },
    look: { hair: 'pompadour', hairColor: '#1e88e5', top: '#fafafa', bottom: '#263238', coat: '#37474f', skin: '#f1c9a0' }, level: 32,
    marker: (c, g) => (['iceburg', 'truth'].includes(S(g, 'p2_cp9_conspiracy')) || S(g, 'p2_enies_lobby') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          const st = ctx.game.quests.stageId('p2_cp9_conspiracy');
          if (at(ctx, 'p2_enies_lobby', 'report')) return '"Nma! You came back from Enies Lobby — through a Buster Call. Franky too, the idiot. (For the first time, the mayor laughs.) Tom would have been proud of every one of you."';
          if (st === 'iceburg') return '"Nma. You are the rookie who handled the Franky Family. (A mouse peeks out of his breast pocket: Tyrannosaurus.) I will be honest. Someone has been sending threats. I do not think they want my life. They want something I do not have."';
          if (st === 'night' || st === 'masks') return '"Nma. Lucci, Kaku, Kalifa — my people are all here tonight. Keep watch on the grounds after dark. Whoever they are, they come at night."';
          if (st === 'truth') return '(Iceburg is bandaged and pale.) "...The masks came off. Lucci. Kaku. Kalifa, my secretary of five years. Blueno the bartender. CP9 — the Government\'s assassins, hidden in my company for five years."';
          if (ctx.game.quests.isDone('p2_enies_lobby')) return '"Nma. Franky is on Scrap Island, building something ridiculous out of Adam wood. The Puffing Tom will always carry you. Galley-La\'s docks are yours."';
          return '"Nma. This is Galley-La, the finest shipwrights in the world. If you want a ship built or repaired, Dock 1 will take care of you. Even pirates — if they pay."';
        },
        choices: [
          { text: 'I\'ll stand guard tonight.', if: () => at(ctx, 'p2_cp9_conspiracy', 'iceburg'), next: 'guard' },
          { text: 'What did CP9 want?', if: () => at(ctx, 'p2_cp9_conspiracy', 'truth'), next: 'pluton' },
          { text: 'We\'re back, Mayor.', if: () => at(ctx, 'p2_enies_lobby', 'report'), next: 'back' },
          { text: 'Galley-La shipyard', do: (c) => c.open('shipwright', {}) },
          { text: 'Goodbye, Mayor.', end: true },
        ],
      },
      guard: { text: () => `"Nma. Then come back after dark and keep your eyes open on the grounds of headquarters. If anything happens... do not die for me. That is an order from a mayor who is not your mayor."${ctx.char.faction === 'marine' ? MARINE_WARN : ''}`, onEnter: (c) => c.stage('p2_cp9_conspiracy', 'night') },
      pluton: { text: '"The blueprints of Pluton, an ancient weapon that can sink islands. My master Tom kept them. Franky had them. They took Franky — and anyone who knows too much — to Enies Lobby on the Puffing Tom. From there, only Impel Down or death."', next: 'rocket' },
      rocket: { text: '"Tonight the Aqua Laguna hits and no train will run... except the Rocketman, Tom\'s failed prototype. Kokoro at Shift Station, on the east shore, is crazy enough to drive it. Nma. I cannot ask you to go. I will not stop you either."', onEnter: (c) => { c.complete('p2_cp9_conspiracy'); c.startQuest('p2_enies_lobby'); } },
      back: { text: '"Take this. (A sea-train pass, signed "Iceburg — Nma.") The Puffing Tom will carry you wherever the rails go, for as long as it runs. Water 7 owes you."', onEnter: (c) => c.complete('p2_enies_lobby') },
    } }),
  },
  {
    id: 'p2_paulie', name: 'Paulie', title: 'Galley-La foreman, Dock 1', island: 'water_7', at: { town: 'w7_main_street', building: 'Galley-La Dock 1' }, trainer: 'galley_la',
    look: { hair: 'short', hairColor: '#fdd835', hat: 'goggles', top: '#1565c0', bottom: '#263238', skin: '#f1c9a0' }, level: 36, style: 'brawler', moves: ['p2_rope_action'],
    marker: (c, g) => (!g.quests.state('p2_cp9_conspiracy') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.game.quests.isDone('p2_cp9_conspiracy')
          ? '"Lucci, Kaku, Kalifa... five years we built ships together. (He bites through his cigar.) Forget it. Dock 1 is open. You want a hull, we build a hull."'
          : '"Oi, rookie. This is Galley-La\'s Dock 1. Pirate or not, if you pay, we fix it. ...And put some trousers on your navigator. HARENCHI! Shameless!"'),
        choices: [
          { text: 'Fix my ship.', do: (c) => c.open('shipwright', {}) },
          { text: 'Train with the shipwrights (strength, endurance)', do: (c) => c.open('trainer', { trainer: 'galley_la' }) },
          { text: 'Anything strange going on in Water 7?', if: () => !ctx.quest('p2_cp9_conspiracy'), next: 'rumor' },
          { text: 'Later.', end: true },
        ],
      },
      rumor: { text: '"Strange? The Franky Family \'dismantled\' the rudder off your ship while you were at the bar, that\'s strange. Those bounty-hunting idiots think every ship left alone is scrap. Their hideout is the Franky House on Back Street, south side of town. Can\'t miss it — it\'s got arms."', choices: [
        { text: 'I\'ll get my rudder back.', do: (c) => c.startQuest('p2_cp9_conspiracy'), end: true },
        { text: 'Not my problem.', end: true },
      ] },
    } }),
  },
  {
    id: 'p2_lucci_w7', name: 'Rob Lucci', title: 'Galley-La shipwright (with Hattori the pigeon)', island: 'water_7', at: { town: 'w7_main_street', building: 'Galley-La Dock 1', ox: 2.6 }, ai: 'idle',
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#37474f', hat: 'captain', hatColor: '#212121', skin: '#f1c9a0' }, level: 40,
    when: (c) => !c.flags.p2_cp9Unmasked,
    dialogue: () => ({ start: 'a', nodes: {
      a: { text: '(Lucci says nothing at all. The white pigeon on his shoulder speaks instead, in a squeaky voice.) "Coo! Hattori here. Lucci says your hull is a disgrace to the sea — poppo! Take it to Paulie before it sinks under you!"' },
    } }),
  },
  {
    id: 'p2_kaku_w7', name: 'Kaku', title: 'Galley-La foreman — "Mountain Wind"', island: 'water_7', at: { town: 'w7_main_street', building: 'Galley-La Dock 1', ox: -1.4 }, ai: 'idle',
    look: { hair: 'short', hairColor: '#8d6e63', nose: 'long', top: '#fafafa', bottom: '#37474f', hat: 'beanie', hatColor: '#1565c0' }, level: 40,
    when: (c) => !c.flags.p2_cp9Unmasked,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => {
        const p = ctx.game.player;
        const s = (ctx.game.ships || []).find((x) => x.owner === 'player' && !x.sunk && ctx.game.world.distance(x.x, x.y, p.x, p.y) < 120);
        if (!s) return '"Kaku, foreman at Dock 1. They call me Mountain Wind — I like high places. Bring your ship into the harbour and I\'ll appraise her for free."';
        const pct = Math.round((s.hull / s.maxHull) * 100);
        return `"Let me have a look at the ${s.name}... (He leaps onto the mast in one jump.) Hull at ${pct}%. ${pct > 80 ? 'She\'s sound. Treat her well and she\'ll outlive you.' : pct > 40 ? 'Cracked planks, a tired keel. Dock 1 can fix it.' : 'Honestly? I\'m amazed she floats. Get her repaired before the Grand Line finishes the job.'}"`;
      } },
    } }),
  },
  {
    id: 'p2_kalifa_w7', name: 'Kalifa', title: 'Secretary to Mayor Iceburg', island: 'water_7', at: { town: 'w7_main_street', building: 'Galley-La Company Headquarters', ox: 2.4 }, ai: 'idle',
    look: { hair: 'long', hairColor: '#fdd835', top: '#212121', bottom: '#212121', skin: '#fdeee4' }, level: 36,
    when: (c) => !c.flags.p2_cp9Unmasked,
    dialogue: () => ({ start: 'a', nodes: {
      a: { text: '"Mayor Iceburg\'s schedule is full until the Aqua Laguna. You may leave a message. (She adjusts her glasses.) ...And please stop staring at me. That\'s sexual harassment."' },
    } }),
  },
  {
    id: 'p2_blueno', name: 'Blueno', title: 'Bartender', island: 'water_7', at: { town: 'w7_downtown', building: "Blueno's Bar" },
    look: { hat: 'horns', hatColor: '#212121', hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#212121', bulk: 1.3 }, bulk: 1.3, level: 38,
    when: (c) => !c.flags.p2_cp9Unmasked,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to Blueno\'s Bar. (He polishes a glass that is already clean.) Most of the gossip in Water 7 starts at this counter. What\'ll it be?"',
        choices: [
          { text: 'Food and drink', do: (c) => c.open('shop', { shop: 'tavern', building: { name: "Blueno's Bar", role: 'bar' } }) },
          { text: 'Heard any gossip?', next: 'gossip' },
          { text: 'Leave', end: true },
        ] },
      gossip: { text: '"Franky buys his cola here by the barrel — he runs on the stuff. And they say the mayor got a threat letter. (He looks at you a moment too long.) Terrible, the things people will do in this city once the Aqua Laguna sends everyone up to high ground."', next: 'a' },
    } }),
  },
  {
    id: 'p2_blueno_mask', name: 'Blueno', title: 'CP9 — unmasked', island: 'water_7', at: { spot: 'galley_la' }, faction: 'cp', level: 40, boss: true, hpMul: 1.1, hostile: true,
    look: { hat: 'horns', hatColor: '#212121', hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#212121', coat: '#212121', bulk: 1.35 }, bulk: 1.35,
    style: 'rokushiki', moves: ['p2_air_door', 'roku_tekkai', 'roku_soru', 'p2_tekkai_kenpo'], skill: 0.55, lethal: false, breakthrough: 2, bounty: 15000000,
    alert: 'You should have stayed at the bar.', barks: ['Air Door.', 'Tekkai.'],
    when: (c, g) => S(g, 'p2_cp9_conspiracy') === 'masks',
  },
  {
    id: 'p2_kalifa_mask', name: 'Kalifa', title: 'CP9 — unmasked', island: 'water_7', at: { spot: 'galley_la' }, faction: 'cp', level: 36, named: true, hostile: true,
    look: { hair: 'long', hairColor: '#fdd835', top: '#212121', bottom: '#212121', coat: '#212121' }, style: 'rokushiki', moves: ['p2_ibara_road', 'p2_golden_awa', 'roku_soru', 'roku_rankyaku'], skill: 0.55, lethal: false,
    alert: 'Protecting the mayor? That\'s sexual harassment.', when: (c, g) => S(g, 'p2_cp9_conspiracy') === 'masks',
  },
  {
    id: 'p2_zambai', name: 'Zambai', title: 'Franky Family — "Dismantler"', island: 'water_7', at: { town: 'w7_back_street', building: 'Franky House' }, faction: 'bandit', level: 32, named: true,
    look: { hair: 'pompadour', hairColor: '#212121', top: '#ff7043', bottom: '#1565c0', goggles: true, skin: '#e0ac7e' }, style: 'brawler', moves: ['brawl_tackle', 'brawl_headbutt'],
    marker: (c, g) => (S(g, 'p2_cp9_conspiracy') === 'franky' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.char.defeated.p2_zambai
          ? '"OW! Okay, okay! Here\'s your rudder. (He hands over a plank.) ...Listen. Big Bro Franky\'s gone into hiding. Men in black suits keep asking about some blueprints. And somebody sent the mayor a death threat. Go tell Iceburg. And don\'t tell him we told you!"'
          : '"AOW! (He strikes a pose.) We\'re the Franky Family, Water 7\'s finest dismantlers! Your ship looked abandoned. Abandoned ships are ours. Now beat it before Big Bro Franky gets back!"'),
        choices: [
          { text: 'Give back my rudder. Now.', if: () => at(ctx, 'p2_cp9_conspiracy', 'franky') && !ctx.char.defeated.p2_zambai, do: (c) => aggro(c.game, findActor(c.game, 'p2_zambai')), end: true },
          { text: 'Who is Franky?', next: 'franky' },
          { text: 'Leave', end: true },
        ],
      },
      franky: { text: '"Big Bro Franky? The greatest man in Water 7! A cyborg! He rebuilt his own body out of ship parts and runs on cola! ...He and the mayor used to be apprentices of the same shipwright, a Fish-Man named Tom. They don\'t talk about it."', next: 'a' },
    } }),
  },
  {
    id: 'p2_kokoro', name: 'Kokoro', title: 'Stationmaster of Shift Station', island: 'water_7', ai: 'idle',
    look: { hair: 'curly', hairColor: '#fafafa', top: '#7b1fa2', bottom: '#4a148c', skin: '#f1c9a0', bulk: 1.5 }, bulk: 1.5, level: 12,
    marker: (c, g) => (S(g, 'p2_enies_lobby') === 'rocketman' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (at(ctx, 'p2_enies_lobby', 'rocketman')
          ? '"Nngaa~ha~ha! (She takes a long swig from her bottle.) The Aqua Laguna\'s coming and you want to chase the Puffing Tom to Enies Lobby? The Rocketman\'s got no brakes and she\'s never been tested. Chimney! Gonbe! We\'re going on a trip!"'
          : ctx.game.quests.isDone('p2_enies_lobby')
            ? '"Nngaa~ha~ha! You rode the Rocketman through the Aqua Laguna and came back alive. Tom would\'ve liked you."'
            : '"Nngaa~ha~ha! Shift Station. The trains out of here don\'t take passengers, dear — only criminals and Government men ride the line to Enies Lobby."'),
        choices: [
          { text: 'Ride the Rocketman to Enies Lobby!', if: () => at(ctx, 'p2_enies_lobby', 'rocketman'), do: (c) => {
            c.game.env.stormTarget = 1;
            travel(c.game, 'enies_lobby', { spot: 'main_gate', banner: ['THE ROCKETMAN', 'Through the Aqua Laguna', 'It leaves the rails twice. It lands on them both times. Enies Lobby rises out of the storm, bathed in endless daylight.', 6] });
          }, end: true },
          { text: 'Tell me about Tom.', next: 'tom' },
          { text: 'Bye, Granny.', end: true },
        ],
      },
      tom: { text: '"Tom was a Fish-Man shipwright — the greatest there ever was. He built the Oro Jackson for Gol D. Roger. The Government let him live long enough to build this sea train, then took him to Enies Lobby anyway. His apprentices were Iceburg and a brat called Cutty Flam."', next: 'a' },
    } }),
  },
  {
    id: 'p2_bushon', name: 'Bushon', title: 'Blue Station clerk', island: 'water_7', at: { town: 'w7_downtown', building: 'Blue Station' },
    look: { hair: 'short', hairColor: '#5d4037', top: '#1565c0', bottom: '#0d47a1', hat: 'captain', hatColor: '#0d47a1' }, level: 6,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (ctx.game.quests.isDone('p2_enies_lobby')
        ? '"Blue Station! The line to Enies Lobby? (He and his colleague Stevie exchange a look.) After the Buster Call there\'s nothing left out there but a hole in the sea. Where else can we take you?"'
        : '"Blue Station, the Puffing Tom\'s home platform! The Enies Lobby run is for Government business only, but the passenger line is open. (He leans closer.) Did you hear? Somebody threatened the mayor..."'),
      choices: [...trainChoices(ctx, 'water_7'), { text: 'Just looking.', end: true }] },
    } }),
  },
  {
    id: 'p2_chisel', name: 'Chisel', title: 'Galley-La apprentice (Dock 3)', island: 'water_7', at: { town: 'w7_main_street', plaza: true, ox: 3.5 },
    look: { hair: 'ponytail', hairColor: '#e65100', top: '#1565c0', bottom: '#8d6e63', hat: 'bandana', hatColor: '#fafafa', skin: '#f1c9a0' }, level: 18, style: 'brawler',
    recruit: { role: 'shipwright', requires: (c, g) => D(g, 'p2_cp9_conspiracy'), pitch: '"Really?! A real voyage beats five more years of sanding decks! (She shoulders a toolbox bigger than she is.) While I\'m aboard, your ship does not sink. That\'s a Galley-La promise."' },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (ctx.game.quests.isDone('p2_cp9_conspiracy')
        ? '"Foremen Lucci and Kaku were CP9 all along... Paulie hasn\'t stopped smoking since. (She kicks a pebble.) Water 7 is the best place in the world to learn ships — and the worst place to see what they\'re for. I want to see the sea."'
        : '"I\'m Chisel, apprentice at Dock 3! Galley-La won\'t let me touch a real keel for another five years. I sand. I sand a LOT."') },
    } }),
  },
  {
    id: 'p2_franky', name: 'Franky', title: 'Cyborg shipwright (formerly Cutty Flam)', island: 'water_7', trainer: 'franky', adam: true, ai: 'idle',
    look: { hair: 'pompadour', hairColor: '#29b6f6', top: '#e53935', bottom: '#1565c0', skin: '#f1c9a0', hand: '#b0bec5', bulk: 1.4, openShirt: true }, bulk: 1.4, level: 45,
    when: (c, g) => D(g, 'p2_enies_lobby'),
    marker: (c, g) => (!g.quests.state('p2_adam_wood') ? '!' : S(g, 'p2_adam_wood') === 'build' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: '"SUUUPER! (He slams his forearms together; the stars on them line up.) I\'m building a dream ship — one that can sail to the end of the sea and back! Know what that takes? ADAM WOOD, bro. The toughest timber in the world."',
        choices: [
          { text: 'Build me a ship out of Adam wood!', if: () => ctx.has('adam_wood'), next: 'build' },
          { text: 'Where do I find Adam wood?', if: () => !ctx.quest('p2_adam_wood'), next: 'where' },
          { text: 'Train with me (cyborg strength)', do: (c) => c.open('trainer', { trainer: 'franky' }) },
          { text: 'Shipyard (repairs and upgrades)', do: (c) => c.open('shipwright', { adam: true }) },
          { text: 'See ya, Franky.', end: true },
        ],
      },
      where: { text: '"The Treasure Tree Adam. Pirates fight over a single plank. The Square Sisters bought mine on the black market in St. Poplar — for a fortune. (He strikes a pose.) Bring me one and I\'ll build you something SUPER."', onEnter: (c) => c.startQuest('p2_adam_wood'), next: 'a' },
      build: { text: '"Ohhh, that\'s the real stuff! (His eyes water. He claims it\'s motor oil.) Give me three days... (Hammers ring out over Scrap Island.) DONE! Paddle wheels, a Coup de Burst, a lion on the bow. Take care of her, and she\'ll take you anywhere!"',
        onEnter: (c) => {
          const g = c.game;
          if (!c.take('adam_wood', 1)) return;
          const isl = islandRec(g, 'water_7');
          const moor = isl?.docks.find((d) => d.name === 'Back Street Pier')?.moor || isl?.docks[0]?.moor || { x: g.player.x, y: g.player.y + 4 };
          const s = g.giveShip('adam_brig', moor.x, moor.y, `${c.char.name}'s Dream`);
          g.ui.toast('A LEGENDARY SHIP', `${s?.name || 'Your new ship'} — an Adam-wood brig with a Coup de Burst!`, '#ffd54f');
          if (g.quests.state('p2_adam_wood') && !g.quests.isDone('p2_adam_wood')) c.complete('p2_adam_wood');
          c.save();
        } },
    } }),
  },

  // ============================================ St. Poplar, Pucci, San Faldo
  stationmaster('p2_poplar_station', 'Tarbo', 'st_poplar', 'st_poplar_town', 'Spring Queen Station'),
  stationmaster('p2_pucci_station', 'Mabel', 'pucci', 'pucci_town', 'Pucci Station', { hair: 'bun', hairColor: '#795548' }),
  stationmaster('p2_faldo_station', 'Orlo', 'san_faldo', 'san_faldo_town', 'San Faldo Station', { hair: 'curly', hairColor: '#212121' }),
  {
    id: 'p2_poplar_dealer', name: 'Ropp', title: 'Back-alley timber dealer', island: 'st_poplar', at: { town: 'st_poplar_town', building: 'Back-Alley Dealer' },
    look: { hair: 'long', hairColor: '#424242', top: '#37474f', bottom: '#212121', hat: 'cowboy', hatColor: '#212121', scarEye: true }, level: 20,
    marker: (c, g) => (D(g, 'p2_enies_lobby') && !g.quests.state('p2_candy_pirates') ? '!' : S(g, 'p2_candy_pirates') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.game.quests.isDone('p2_candy_pirates')
          ? '"You ran the Candy Pirates out of St. Poplar. The town doesn\'t know your name — which is how I like my friends. What do you need?"'
          : '"Timber, stone that makes Devil Fruit users sweat, things that fell off Government ships... (He lowers his voice.) Two girls from the Franky Family bought a plank of Adam wood here once. Two hundred million. Cash."'),
        choices: [
          { text: 'Show me the black market.', do: (c) => c.open('shop', { shop: 'p2_poplar_black_market', building: { name: 'Back-Alley Dealer', role: 'shop' } }) },
          { text: 'You look worried.', if: () => ctx.game.quests.isDone('p2_enies_lobby') && !ctx.quest('p2_candy_pirates'), next: 'candy' },
          { text: 'The Candy Pirates are finished.', if: () => at(ctx, 'p2_candy_pirates', 'report'), next: 'paid' },
          { text: 'Leave', end: true },
        ],
      },
      candy: { text: '"The Candy Pirates raid the harbour every week and take my shipments. The Marines won\'t come — St. Poplar isn\'t worth a warship. There\'s a strange crew of street performers in town who say they can fight... nobody believes them. Drive the Candy Pirates off and I\'ll pay in Adam wood."', choices: [
        { text: 'I\'ll drive them off.', do: (c) => c.startQuest('p2_candy_pirates'), end: true },
        { text: 'Not my fight.', end: true },
      ] },
      paid: { text: '"A deal\'s a deal. (He drags out a plank of pale, dense timber.) Adam wood. Don\'t tell anyone where you got it."', onEnter: (c) => c.complete('p2_candy_pirates') },
    } }),
  },
  {
    id: 'p2_kaku_exile', name: 'Kaku', title: 'Former CP9 agent (in hiding)', island: 'st_poplar', at: { town: 'st_poplar_town', plaza: true, ox: -3 }, trainer: 'cp_defector', faction: 'civilian',
    look: { hair: 'short', hairColor: '#8d6e63', nose: 'long', top: '#6d4c41', bottom: '#3e2723', hat: 'beanie', hatColor: '#3e2723' }, level: 48,
    when: (c, g) => D(g, 'p2_enies_lobby'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.game.quests.isDone('p2_candy_pirates')
          ? '"We are not CP9 anymore. The Government needed someone to blame for Enies Lobby. (He shrugs.) You fought beside us against the Candy Pirates. If you want the Six Powers, I will teach you — for a price. Lucci\'s hospital bills do not pay themselves."'
          : '"...You. From Enies Lobby. (He does not reach for his swords.) We are street performers now, if you can believe it. Lucci is still in the hospital. Leave us be — unless you are here about the Candy Pirates."'),
        choices: [
          { text: 'Teach me Rokushiki.', if: () => ctx.game.quests.isDone('p2_candy_pirates'), do: (c) => c.open('trainer', { trainer: 'cp_defector' }) },
          { text: 'Goodbye.', end: true },
        ],
      },
    } }),
  },
  {
    id: 'p2_candy_captain', name: 'Captain Kandi', title: 'Captain of the Candy Pirates', island: 'st_poplar', at: { spot: 'poplar_harbor' }, faction: 'pirate', level: 40, boss: true, hpMul: 1.1, hostile: true,
    look: { hair: 'curly', hairColor: '#f06292', top: '#ff80ab', bottom: '#6a1b9a', hat: 'tricorne', hatColor: '#ad1457', bulk: 1.3 }, bulk: 1.3,
    style: 'ittoryu', weapon: 'sword', moves: ['itto_whirl', 'itto_pound', 'brawl_tackle'], skill: 0.45, bounty: 36000000, infamy: true, breakthrough: 2,
    alert: 'Sweet! Another sucker for the Candy Pirates!', when: (c, g) => S(g, 'p2_candy_pirates') === 'candy',
  },
  {
    id: 'p2_pucci_chef', name: 'Chef Gourmand', title: 'Gourmet Street Grill', island: 'pucci', at: { town: 'pucci_town', building: 'Gourmet Street Grill' },
    look: { hair: 'short', hairColor: '#fafafa', top: '#fafafa', bottom: '#212121', hat: 'captain', hatColor: '#fafafa', bulk: 1.3 }, level: 10,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to Pucci, the Gourmet City! Every year when the Aqua Laguna floods Water 7, the whole city comes here by sea train to eat. (He beams.) Try the platter. Pirates who eat it fight twice as hard. Or so they tell me, before they leave without paying."',
        choices: [{ text: 'Order food', do: (c) => c.open('shop', { shop: 'p2_pucci_food', building: { name: 'Gourmet Street Grill', role: 'restaurant' } }) }, { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_faldo_barkeep', name: 'Masked Barkeep', title: 'Masquerade Tavern', island: 'san_faldo', at: { town: 'san_faldo_town', building: 'Masquerade Tavern' },
    look: { hair: 'long', hairColor: '#4a148c', top: '#212121', bottom: '#4a148c', hat: 'pinkhat', hatColor: '#8e24aa' }, level: 8,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to San Faldo, where the carnival never ends! Our forges send iron to Water 7 by sea train and our masks go everywhere else. Today\'s theme? A costume party. Everybody\'s somebody else tonight."',
        choices: [
          { text: 'Food and drink', do: (c) => c.open('shop', { shop: 'tavern', building: { name: 'Masquerade Tavern', role: 'bar' } }) },
          { text: 'Buy a mask', do: (c) => c.open('shop', { shop: 'p2_carnival_goods', building: { name: 'Carnival Mask Boutique', role: 'shop' } }) },
          { text: 'Any rumours?', next: 'r' },
          { text: 'Leave', end: true },
        ] },
      r: { text: '"A woman in a wide hat came through last week, asking nothing, buying nothing. Took the Puffing Tom to Water 7. And the Marines say a ghost ship drifts in the Florian Triangle, past Enies Lobby, with a skeleton singing on deck. People say a lot of things at a masquerade."', next: 'a' },
    } }),
  },

  // ============================================================ ENIES LOBBY
  {
    id: 'p2_day_station', name: 'Day Station guard', title: 'Enies Lobby sea-train platform', island: 'enies_lobby', faction: 'civilian', ai: 'idle',
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', hat: 'marine' }, level: 20,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (at(ctx, 'p2_enies_lobby', 'buster_call')
          ? '"THE BUSTER CALL! They\'re shelling their own island! (He points at the rails.) Kokoro brought the Puffing Tom back for the survivors — get on, now!"'
          : ctx.game.quests.isDone('p2_enies_lobby')
            ? '(The platform is scorched. Beyond it, the Judicial Island is a ruin — but the sun still has not set.) "The trains still stop here. Old habits."'
            : '"Day Station, Enies Lobby. The sun never sets on the Judicial Island. You are not on the list. Turn around."'),
        choices: [
          { text: 'Ride back to Water 7', if: () => at(ctx, 'p2_enies_lobby', 'buster_call') || ctx.game.quests.isDone('p2_enies_lobby') || ctx.has('p2_sea_train_pass'), do: (c) => travel(c.game, 'water_7', { banner: ['PUFFING TOM', 'Water 7', 'The sea train pulls away from the Judicial Island.', 4] }), end: true },
          { text: 'Leave', end: true },
        ],
      },
    } }),
  },
  {
    id: 'p2_oimo', name: 'Oimo', title: 'Giant gatekeeper of Enies Lobby', island: 'enies_lobby', at: { spot: 'main_gate' }, faction: 'marine', level: 40, boss: true, hpMul: 1.4, scale: 2.2, bulk: 1.7,
    look: { hair: 'long', hairColor: '#5d4037', hat: 'horns', hatColor: '#9e9e9e', top: '#6d4c41', bottom: '#4e342e', skin: '#e0ac7e' },
    style: 'elbaf', weapon: 'axe', moves: ['p2_giant_club', 'brawl_tackle'], skill: 0.3, lethal: false, breakthrough: 2, bounty: 8000000,
    alert: 'No one passes the Main Gate!',
    when: (c, g) => ON(g, 'p2_enies_lobby') && !c.flags.p2_giantsTruth,
    marker: (c, g) => (S(g, 'p2_enies_lobby') === 'main_gate' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"HALT, TINY ONE! I am Oimo, gatekeeper of Enies Lobby! For fifty years we have served the World Government, so that our captains Dorry and Brogy are released from prison! None shall pass!"',
        choices: [
          { text: '"Dorry and Brogy aren\'t prisoners. They\'re still dueling on Little Garden!"', if: () => at(ctx, 'p2_enies_lobby', 'main_gate') && ctx.char.discovered.includes('little_garden'), next: 'truth' },
          { text: 'Then I\'ll go through you.', if: () => at(ctx, 'p2_enies_lobby', 'main_gate'), do: (c) => { const o = findActor(c.game, 'p2_oimo'); if (o) aggro(c.game, o); }, end: true },
          { text: 'Leave', end: true },
        ] },
      truth: { text: '"...WHAT? (The ground shakes as he kneels.) You have been to Little Garden? They... fight still? Then the Government LIED to us for fifty years! KASHII! We are leaving — and we are taking this gate with us!" (The giants turn their clubs on the Government\'s guards.)',
        onEnter: (c) => { c.setFlag('p2_giantsTruth'); c.stage('p2_enies_lobby', 'courthouse'); } },
    } }),
  },
  {
    id: 'p2_kashii', name: 'Kashii', title: 'Giant gatekeeper of Enies Lobby', island: 'enies_lobby', at: { spot: 'main_gate' }, faction: 'civilian', level: 38, scale: 2.2, bulk: 1.6, ai: 'idle',
    look: { hair: 'long', hairColor: '#8d6e63', hat: 'horns', hatColor: '#9e9e9e', top: '#795548', bottom: '#4e342e', skin: '#e0ac7e' },
    when: (c, g) => !D(g, 'p2_enies_lobby'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (ctx.char.flags.p2_giantsTruth
        ? '"Fifty years... (Kashii wipes his eyes with a hand the size of a boat.) Go, tiny warrior. We will hold the gate open behind you."'
        : '"Oimo does the talking. I do the smashing. Go home, little one."') },
    } }),
  },
  {
    id: 'p2_baskerville', name: 'Baskerville', title: 'Three-headed judge of Enies Lobby', island: 'enies_lobby', at: { town: 'enies_main', building: 'Enies Lobby Courthouse' }, faction: 'marine', level: 42, boss: true, hpMul: 1.2, scale: 1.6, bulk: 1.6,
    look: { hair: 'curly', hairColor: '#fafafa', top: '#1a237e', bottom: '#1a237e', coat: '#212121', skin: '#f1c9a0' },
    style: 'brawler', weapon: 'axe', moves: ['p2_verdict', 'brawl_tackle'], skill: 0.35, lethal: false, breakthrough: 2, bounty: 10000000,
    alert: 'GUILTY! ...Innocent! ...DEATH!', barks: ['Guilty!', 'Innocent!', 'The court finds you... DEAD!'],
    when: (c, g) => ON(g, 'p2_enies_lobby'),
    marker: (c, g) => (S(g, 'p2_enies_lobby') === 'courthouse' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '(Three heads, one robe.) LEFT: "Guilty. Everyone is guilty." RIGHT: "Innocent! Let them go!" MIDDLE: "I am perfectly fair. Execute them!" (The jury box is full of prisoners who want company in Impel Down.)',
        choices: [
          { text: 'I object!', if: () => at(ctx, 'p2_enies_lobby', 'courthouse'), do: (c) => { const b = findActor(c.game, 'p2_baskerville'); if (b) aggro(c.game, b); }, end: true },
          { text: 'Leave', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_wanze', name: 'Wanze', title: 'CP7 agent — Ramen Kenpo', island: 'enies_lobby', at: { spot: 'courtyard' }, faction: 'cp', level: 38, named: true, hostile: true,
    look: { hair: 'topknot', hairColor: '#212121', top: '#ff7043', bottom: '#212121', skin: '#e0ac7e' }, style: 'brawler', moves: ['p2_ramen_kenpo', 'brawl_knee'], skill: 0.4,
    alert: 'Ramen Kenpo! You have been noodled!', when: (c, g) => ['courthouse', 'keys'].includes(S(g, 'p2_enies_lobby')),
  },
  {
    id: 'p2_spandam', name: 'Spandam', title: 'Director of CP9', island: 'enies_lobby', at: { spot: 'tower_of_justice' }, faction: 'cp', level: 30, named: true,
    look: { hair: 'short', hairColor: '#9c27b0', top: '#fafafa', bottom: '#fafafa', coat: '#fafafa', skin: '#f1c9a0' }, style: 'ittoryu', weapon: 'sword', moves: ['p2_funkfreed'], skill: 0.2, lethal: false, bounty: 20000000,
    when: (c, g) => ON(g, 'p2_enies_lobby') && !c.flags.p2_funkfreed,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Wa ha ha ha! A rookie pirate on MY island? Do you know who I am? Spandam, Director of CP9! I have the Golden Den Den Mushi — one call and ten battleships and five Vice Admirals erase this entire island! Justice is on MY side!"',
        choices: [
          { text: '(Punch him.)', do: (c) => { const s = findActor(c.game, 'p2_spandam'); if (s) aggro(c.game, s); }, end: true },
          { text: 'Leave him to his speeches.', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_jabra', name: 'Jabra', title: 'CP9 — Inu Inu no Mi, Model: Wolf', island: 'enies_lobby', at: { spot: 'cp9_jabra' }, faction: 'cp', level: 46, boss: true, hpMul: 1.2, hostile: true,
    look: { hair: 'spiky', hairColor: '#212121', top: '#212121', bottom: '#212121', ears: 'pointy', fur: '#5d4037', tail: 'fluffy' }, style: 'rokushiki', moves: ['p2_tekkai_kenpo', 'p2_wolf_fang', 'roku_soru', 'roku_rankyaku', 'roku_geppo'],
    skill: 0.55, breakthrough: 3, bounty: 25000000, alert: 'Gyahahaha! The Wolf of the Six Powers! Tekkai Kenpo!', barks: ['Tekkai Kenpo!', 'Grrrah!'],
    when: (c, g) => ['keys', 'lucci'].includes(S(g, 'p2_enies_lobby')),
  },
  {
    id: 'p2_kumadori', name: 'Kumadori', title: 'CP9 — master of Life Return', island: 'enies_lobby', at: { spot: 'cp9_kumadori' }, faction: 'cp', level: 45, boss: true, hpMul: 1.25, hostile: true, bulk: 1.4,
    look: { hair: 'long', hairColor: '#f48fb1', top: '#8d6e63', bottom: '#5d4037', skin: '#fafafa' }, style: 'rokushiki', weapon: 'staff', moves: ['p2_shishi_kebab', 'p2_life_return', 'roku_tekkai'],
    skill: 0.5, breakthrough: 3, bounty: 25000000, alert: 'YOYOI! I am Kumadori! I shall atone with my life — after I take yours!', barks: ['Yoyoi!', 'Life Return!'],
    when: (c, g) => ['keys', 'lucci'].includes(S(g, 'p2_enies_lobby')),
  },
  {
    id: 'p2_fukurou', name: 'Fukurou', title: 'CP9 — "Fukurou the Silent"', island: 'enies_lobby', at: { spot: 'cp9_fukurou' }, faction: 'cp', level: 42, boss: true, hpMul: 1.2, hostile: true, bulk: 1.6,
    look: { hair: 'buzz', hairColor: '#212121', top: '#1a237e', bottom: '#1a237e', skin: '#f1c9a0' }, style: 'rokushiki', moves: ['p2_jugan_ken', 'roku_soru', 'roku_tekkai'],
    skill: 0.5, breakthrough: 2, bounty: 20000000, alert: 'Chapapa! Your doriki is... not bad! Don\'t tell anyone I said so. Chapapa!', barks: ['Chapapa!'],
    when: (c, g) => ['keys', 'lucci'].includes(S(g, 'p2_enies_lobby')),
  },
  {
    id: 'p2_kalifa', name: 'Kalifa', title: 'CP9 — Awa Awa no Mi', island: 'enies_lobby', at: { spot: 'cp9_kalifa' }, faction: 'cp', level: 44, boss: true, hpMul: 1.15, hostile: true,
    look: { hair: 'long', hairColor: '#fdd835', top: '#212121', bottom: '#212121', coat: '#212121' }, style: 'rokushiki', moves: ['p2_golden_awa', 'p2_ibara_road', 'roku_soru', 'roku_rankyaku'],
    skill: 0.55, breakthrough: 3, bounty: 25000000, alert: 'Coming all the way to the Tower of Justice? That\'s sexual harassment.',
    when: (c, g) => ['keys', 'lucci'].includes(S(g, 'p2_enies_lobby')),
  },
  {
    id: 'p2_kaku', name: 'Kaku', title: 'CP9 — Ushi Ushi no Mi, Model: Giraffe', island: 'enies_lobby', at: { spot: 'cp9_kaku' }, faction: 'cp', level: 50, boss: true, hpMul: 1.3, hostile: true,
    look: { hair: 'short', hairColor: '#8d6e63', nose: 'long', top: '#212121', bottom: '#212121', hat: 'beanie', hatColor: '#212121', swords: 2 },
    style: 'nitoryu', weapon: 'sword', moves: ['p2_amanedachi', 'p2_kirin_hou', 'roku_rankyaku', 'roku_soru', 'nito_taka'], skill: 0.6, breakthrough: 3, bounty: 30000000,
    alert: 'Four Sword Style. Two blades — and two legs sharp enough to cut a tower.', barks: ['Rankyaku!', 'This is fun!'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'GIRAFFE FORM!', '#ffd54f', 0.6); a.addBuff({ id: 'p2_giraffe', name: 'Giraffe Form', dur: 60, mods: { damage: 1.3, scale: 1.4 } }); } }],
    when: (c, g) => ['keys', 'lucci'].includes(S(g, 'p2_enies_lobby')),
  },
  {
    id: 'p2_lucci', name: 'Rob Lucci', title: 'CP9 — the strongest killer of the World Government', island: 'enies_lobby', at: { spot: 'bridge_of_hesitation' }, faction: 'cp', level: 58, boss: true, hpMul: 1.7, hostile: true,
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#212121', coat: '#212121', hat: 'captain', hatColor: '#212121', skin: '#f1c9a0' },
    style: 'rokushiki', fruit: 'neko_leopard', fruitMastery: 70, moves: ['neko_hybrid', 'neko_claw', 'neko_pounce', 'roku_rokuogan', 'p2_shigan_oren', 'p2_rankyaku_gaicho', 'roku_soru', 'roku_tekkai', 'roku_kamie'],
    skill: 0.7, haki: { observation: 20 }, breakthrough: 5, bounty: 60000000, lethal: true,
    alert: 'Doriki four thousand. The Gates of Justice are opening. You will not reach them.', barks: ['Rokuogan.', 'Justice is cruelty.', 'Kami-e.'],
    phases: [{ at: 0.5, run: (a, g) => { g.fx.text(a.x, a.y - 2.4, 'LEOPARD FORM', '#ffb74d', 0.6); a.addBuff({ id: 'p2_lucci_leopard', name: 'Leopard Form', dur: 90, mods: { damage: 1.4, speedMul: 1.2 }, aura: 'rgba(255,183,77,0.5)' }); } }],
    when: (c, g) => S(g, 'p2_enies_lobby') === 'lucci',
  },
];

// ------------------------------------------------ Thriller Bark, Spa, Sabaody
const TB_Q = 'p2_thriller_bark';
const tbFight = (npcId, stage) => ({ text: 'Fight!', if: (ctx) => ctx.game.quests.stageId(TB_Q) === stage, do: (c) => { const a = findActor(c.game, npcId); if (a) aggro(c.game, a); }, end: true });
const withIf = (choice, ctx) => ({ ...choice, if: choice.if ? () => choice.if(ctx) : undefined });

npcs.push(
  // =========================================================== THRILLER BARK
  {
    id: 'p2_brook', name: 'Brook', title: '"Humming" Brook — the living skeleton', island: 'thriller_bark', at: { spot: 'mouth_gate' }, ai: 'idle',
    look: { skin: '#fafafa', hair: 'afro', hairColor: '#212121', top: '#212121', bottom: '#212121', hat: 'captain', hatColor: '#212121', scale: 1.15 }, level: 45,
    when: (c, g) => !D(g, TB_Q),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Yohohoho! Good evening! Please don\'t be alarmed — I\'m only a skeleton. I died fifty years ago, you see. Skull joke! ...A man named Moria stole my shadow. If the sun touches me, I\'ll vanish. Not that I have any skin left to burn. Yohohoho!"',
        choices: [
          { text: 'Who are you?', next: 'who' },
          { text: 'Play something.', next: 'song' },
          { text: 'Goodbye, Brook.', end: true },
        ] },
      who: { text: '"Musician of the Rumbar Pirates. We all died in the Florian Triangle... I came back alone, thanks to a Devil Fruit. Long ago we left a little whale at Reverse Mountain and promised to return. Laboon. He must be so big now. I have to get my shadow back and keep that promise."', next: 'a' },
      song: { text: '(He tunes a violin that is as old as he is and plays "Bink\'s Sake". Somewhere in the fog, a shadowless crew starts to sing along.) "Yohohoho~ Yohohoho~" (You feel your strength return.)', onEnter: (c) => { const p = c.player; if (p?.d) { p.hp = Math.min(p.d.maxHp, p.hp + p.d.maxHp * 0.25); p.stamina = p.d.maxStamina; } }, next: 'a' },
    } }),
  },
  {
    id: 'p2_lola', name: 'Lola', title: '"Proposal" Lola, captain of the Rolling Pirates', island: 'thriller_bark', at: { spot: 'victims_camp' },
    look: { hair: 'curly', hairColor: '#ffd54f', top: '#f06292', bottom: '#ad1457', skin: '#f1c9a0' }, bulk: 1.5, level: 38, bounty: 24000000,
    marker: (c, g) => (S(g, TB_Q) === 'lola' ? '!' : S(g, TB_Q) === 'dawn' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          if (at(ctx, TB_Q, 'dawn')) return '"The sun is up and nobody burned! (All around the camp, shadowless people are laughing and crying.) Our shadows came home! ...Will you marry me? No? HA! Nobody ever says yes."';
          if (ctx.game.quests.isDone(TB_Q)) return '"Moria\'s gone and we\'ve got our shadows back. The Rolling Pirates sail on! ...Last chance: marry me? No? Ha!"';
          return '"Will you marry me? ...No? Ha, nobody ever says yes. I\'m Lola, captain of the Rolling Pirates. Gecko Moria took our shadows, so we hide in this forest from the sun. (She looks at your feet.) You still have yours. Not for long, if you sleep here."';
        },
        choices: [
          { text: 'How does Moria steal shadows?', if: () => at(ctx, TB_Q, 'lola'), next: 'how' },
          { text: 'It\'s over, Lola.', if: () => at(ctx, TB_Q, 'dawn'), next: 'end' },
          { text: 'Leave', end: true },
        ],
      },
      how: { text: '"At night his zombies drag you to the Mast Mansion. Moria snips your shadow away with giant scissors and Dr. Hogback stuffs it into a corpse — a zombie with your personality. Salt in a zombie\'s mouth sets the shadow free. Take some. Beat the Mysterious Four: Hogback, Absalom, Perona... and Moria."',
        onEnter: (c) => { c.give('p2_salt', 3); c.stage(TB_Q, 'hogback'); } },
      end: { text: '"Thanks, stranger. (She slaps your back hard enough to bruise.) If you ever get married, invite me!"', onEnter: (c) => c.complete(TB_Q) },
    } }),
  },
  {
    id: 'p2_spoil', name: 'Spoil', title: 'Chairman of the Thriller Bark Victims\' Association', island: 'thriller_bark', at: { spot: 'victims_camp' },
    look: { hair: 'bald', skin: '#e0ac7e', top: '#5d4037', bottom: '#3e2723', bulk: 1.2 }, level: 20, doctor: { line: '"Hold still. We\'ve all learned a little medicine, hiding in this forest."' },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"The Victims\' Association. Every one of us lost a shadow to Moria. We can\'t go into the sun, so we trade in the dark: salt, bandages, gossip. (He lowers his voice.) Never fall asleep on Thriller Bark."',
        choices: [
          { text: 'Buy supplies', do: (c) => c.open('shop', { shop: 'p2_victims_supplies', building: { name: 'Victims\' Camp', role: 'shop' } }) },
          { text: 'Patch me up', do: (c) => c.open('doctor', {}) },
          { text: 'Leave', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_nocturne', name: 'Nocturne', title: 'Shadowless violinist of the Victims\' Association', island: 'thriller_bark', at: { spot: 'victims_camp' },
    look: { hair: 'long', hairColor: '#b0bec5', top: '#311b92', bottom: '#1a237e', skin: '#eceff1' }, level: 22,
    recruit: { role: 'musician', requires: (c) => beat(c, 'p2_moria'), pitch: '"You gave me my shadow back — I can stand in the sun again! (She tucks her violin under her chin.) A ship needs a song. Let me be yours."' },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (beat(ctx.char, 'p2_moria')
        ? '"Look — my shadow! It follows me again! (She plays a few bright notes.) I spent three years playing only in the dark. I\'d love to play somewhere with a horizon."'
        : '"Shh. I play for the others at night, so they forget the sun. (Her violin case has no shadow under it — neither does she.) Moria took my shadow three years ago. Somewhere on this ship, a zombie is humming my songs."') },
    } }),
  },
  {
    id: 'p2_hogback', name: 'Dr. Hogback', title: 'The "Genius Surgeon" of the Mysterious Four', island: 'thriller_bark', faction: 'pirate', level: 40, boss: true, hpMul: 1.1,
    look: { hair: 'curly', hairColor: '#212121', top: '#fafafa', bottom: '#5d4037', goggles: true, skin: '#f1c9a0', bulk: 1.3 }, bulk: 1.3,
    style: 'brawler', moves: ['p2_scalpel', 'brawl_tackle'], skill: 0.35, breakthrough: 2, alert: 'Fosfosfos! A fresh body for my research!',
    when: (c, g) => !D(g, TB_Q),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Fosfosfos! The world-famous Genius Surgeon, Dr. Hogback! Cindry-chan, serve our guest a plate. (A pale maid hurls a dinner plate at your head.) Once Moria-sama takes your shadow, I\'ll give your body a much better use."',
        choices: [withIf(tbFight('p2_hogback', 'hogback'), ctx), { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_cindry', name: 'Victoria Cindry', title: 'Zombie maid (Special Zombie)', island: 'thriller_bark', at: { spot: 'mast_hall' }, faction: 'zombie', level: 42, named: true, ai: 'guard',
    look: { hair: 'long', hairColor: '#212121', top: '#212121', bottom: '#fafafa', skin: '#cfd8dc', scar: true }, style: 'brawler', moves: ['p2_plates', 'brawl_knee'], skill: 0.4,
    when: (c, g) => !D(g, TB_Q),
  },
  {
    id: 'p2_absalom', name: 'Absalom', title: '"Graveyard" Absalom of the Mysterious Four', island: 'thriller_bark', at: { spot: 'graveyard' }, faction: 'pirate', level: 46, boss: true, hpMul: 1.2,
    look: { hair: 'long', hairColor: '#ffe082', muzzle: true, top: '#fafafa', bottom: '#5d4037', hat: 'cowboy', hatColor: '#fafafa', bulk: 1.4 }, bulk: 1.4,
    fruit: 'suke', fruitMastery: 60, style: 'brawler', moves: ['suke_vanish', 'p2_lion_bite', 'brawl_tackle'], skill: 0.45, breakthrough: 3,
    alert: 'You can\'t hit what you can\'t see! Gaohahaha!', when: (c, g) => !D(g, TB_Q),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '(A voice from nowhere.) "Over here. No — here. Gaohahaha! Elephant skin, bear muscles, a lion\'s jaw — and the Clear-Clear Fruit. The General Zombies of this graveyard obey me. Want to see my bride? She\'ll be yours to meet at the wedding... after I find her."',
        choices: [withIf(tbFight('p2_absalom', 'absalom'), ctx), { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_perona', name: 'Perona', title: 'The "Ghost Princess" of the Mysterious Four', island: 'thriller_bark', at: { spot: 'wonder_garden' }, faction: 'pirate', level: 45, boss: true, hpMul: 1.1,
    look: { hair: 'long', hairColor: '#f48fb1', top: '#212121', bottom: '#e91e63', hat: 'crown', hatColor: '#ffd54f', scale: 0.92 },
    fruit: 'horo', fruitMastery: 70, moves: ['horo_negative', 'horo_mini', 'p2_tokuhollow'], skill: 0.5, ranged: true, prefRange: 7, breakthrough: 3,
    alert: 'Horohorohoro! Negative Hollow!', barks: ['Horohorohoro!', 'So cute... NOT!'], when: (c, g) => !D(g, TB_Q),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Horohorohoro! Welcome to my Wonder Garden. Kumashi, don\'t talk, you ruin the mood. (A ghost drifts through you — and for a second you want to crawl into a hole.) That\'s a Negative Hollow. Nobody who\'s felt one wants to fight anymore."',
        choices: [withIf(tbFight('p2_perona', 'perona'), ctx), { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_oars', name: 'Oars', title: '"Demon" Oars, ancient giant (Special Zombie)', island: 'thriller_bark', at: { spot: 'oars_freezer' }, faction: 'zombie', level: 54, boss: true, hpMul: 1.8, scale: 2.8, bulk: 2,
    look: { hair: 'spiky', hairColor: '#212121', hat: 'horns', hatColor: '#9e9e9e', top: '#5d4037', bottom: '#3e2723', skin: '#8d6e63', sharpTeeth: true, grin: true },
    style: 'brawler', moves: ['p2_oars_smash', 'brawl_tackle'], skill: 0.3, breakthrough: 4, alert: 'OARS... WANTS... MEAT!',
    when: (c, g) => !D(g, TB_Q),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '(A giant corpse five hundred years old, stitched together by Hogback, towers out of its freezer. The shadow inside it belonged to some loud rookie and will not stop talking about meat.) "OARS... HUNGRY..."',
        choices: [withIf(tbFight('p2_oars', 'oars'), ctx), { text: 'Back away slowly.', end: true }] },
    } }),
  },
  {
    id: 'p2_ryuma', name: 'Ryuma', title: 'General Zombie — the legendary samurai of Wano', island: 'thriller_bark', at: { spot: 'dead_forest' }, faction: 'zombie', level: 52, boss: true, hpMul: 1.3,
    look: { skin: '#e0e0e0', hair: 'topknot', hairColor: '#212121', top: '#37474f', bottom: '#263238', swords: 1 }, style: 'ittoryu', weapon: 'sword', weaponPower: 1.75,
    moves: ['p2_shishi_sonson', 'itto_iai', 'itto_whirl', 'itto_pound'], skill: 0.65, breakthrough: 4, alert: 'Draw.',
    marker: (c, g) => (!g.quests.state('p2_ryuma_duel') && /ittoryu|nitoryu|santoryu/.test(c.style || '') ? '!' : null),
    when: (c, g) => !D(g, 'p2_ryuma_duel'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '(A skeletal samurai sits cross-legged beneath a dead tree, a black blade across his knees. His shadow hums an old sea shanty.) "They call me Ryuma, the King. I cut down a dragon in Wano long ago. Now I am Moria\'s puppet. ...You carry a sword. Draw it."',
        choices: [
          { text: 'I accept your duel.', do: (c) => { if (!c.quest('p2_ryuma_duel')) c.startQuest('p2_ryuma_duel'); const a = findActor(c.game, 'p2_ryuma'); if (a) aggro(c.game, a); }, end: true },
          { text: 'Not today.', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_moria', name: 'Gecko Moria', title: 'Warlord of the Sea, master of Thriller Bark', island: 'thriller_bark', faction: 'pirate', level: 58, boss: true, hpMul: 1.6, scale: 1.9, bulk: 1.5,
    look: { hair: 'spiky', hairColor: '#212121', hat: 'horns', hatColor: '#212121', skin: '#b0bec5', top: '#212121', bottom: '#4a148c', coat: '#6a1b9a', grin: true, sharpTeeth: true },
    fruit: 'kage', fruitMastery: 80, moves: ['kage_brickbat', 'kage_steal', 'kage_doppelman', 'p2_kage_kakumei', 'p2_tsuno_tokage'], skill: 0.55,
    bounty: 320000000, infamy: true, breakthrough: 5, lethal: true,
    alert: 'Kishishishi! Your shadow will make a fine soldier!', barks: ['Kishishishi!', 'Shadows Asgard!', 'Brick Bat!'],
    phases: [{ at: 0.5, run: (a, g) => {
      g.ui.banner("SHADOWS' ASGARD", 'Gecko Moria', 'He swallows a thousand stolen shadows and swells to the size of a mansion.', 4);
      a.addBuff({ id: 'p2_asgard', name: "Shadows' Asgard", dur: 120, mods: { damage: 1.5, defMul: 0.75, scale: 1.4 }, aura: 'rgba(38,50,56,0.8)' });
    } }],
    when: (c, g) => !D(g, TB_Q),
    marker: (c, g) => (S(g, TB_Q) === 'moria' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Kishishishi! A guest in my Mast Mansion. I lost my whole crew in the New World, you know. Kaido. Since then I don\'t keep subordinates who can die. I make them out of corpses and stolen shadows! Why work hard when zombies can make me Pirate King?"',
        choices: [withIf(tbFight('p2_moria', 'moria'), ctx), { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_shadow_zombie', name: 'Zombie (wearing your shadow)', title: 'General Zombie', island: 'thriller_bark', at: { spot: 'graveyard' }, faction: 'zombie', level: 46, named: true, hostile: true,
    look: { hair: 'spiky', hairColor: '#37474f', top: '#4e342e', bottom: '#263238', skin: '#9e9d89', scar: true, bulk: 1.3 }, bulk: 1.3, style: 'brawler', moves: ['brawl_tackle', 'brawl_headbutt', 'brawl_knee'], skill: 0.35,
    alert: 'This body... it moves like you do.', when: (c) => !!c.flags.p2_shadowless,
  },
  {
    id: 'p2_kuma_tb', name: 'Bartholomew Kuma', title: '"The Tyrant", Warlord of the Sea', island: 'thriller_bark', at: { spot: 'mast_hall' }, faction: 'marine', level: 90, ai: 'idle', scale: 1.8, bulk: 1.8,
    look: { hair: 'short', hairColor: '#212121', hat: 'beanie', hatColor: '#263238', ears: 'round', fur: '#263238', top: '#212121', bottom: '#212121', skin: '#8d6e63' },
    fruit: 'nikyu', when: (c, g) => S(g, TB_Q) === 'dawn' && !c.flags.p2_kumaPain,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '(A giant with a Bible and paws for palms stands in the ruins.) "The Government ordered me to erase everyone on this ship. ...I will spare them. But someone must take the pain of this battle in their place." (He pushes a bubble of pure suffering out of a sleeping victim\'s body.)',
        choices: [
          { text: '"Give it to me."', next: 'take' },
          { text: 'Say nothing.', next: 'no' },
        ] },
      take: { text: '(You touch the bubble. Every blow struck on Thriller Bark tonight lands at once. When you can see again, Kuma is gone.) ...Nothing happened. (Your will has been tempered.)',
        onEnter: (c) => { c.setFlag('p2_kumaPain'); const p = c.player; if (p) p.hp = 1; c.progression.raiseAttr('wil', 3); c.progression.breakthrough(1, 'Took the pain of Thriller Bark'); c.save(); } },
      no: { text: '"...Very well." (He opens his paw. The bubble drifts back into the sky and pops. When you look again, he is gone.)', onEnter: (c) => { c.setFlag('p2_kumaPain'); } },
    } }),
  },

  // ============================================================ SPA ISLAND
  {
    id: 'p2_spa_manager', name: 'Doran', title: 'Owner of Spa Island', island: 'spa_island', at: { town: 'spa_resort', building: 'Spa Island Hot Springs' },
    look: { hair: 'short', hairColor: '#ff7043', top: '#ffcc80', bottom: '#8d6e63', bulk: 1.2 }, level: 14,
    marker: (c, g) => (!g.quests.state('p2_spa_foxy') ? '!' : S(g, 'p2_spa_foxy') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (ctx.game.quests.isDone('p2_spa_foxy')
        ? '"Fifty attractions and not a single Silver Fox in any of them! Stay as long as you like — slides, cola baths, the high dive!"'
        : '"Welcome to Spa Island — fifty attractions: slides, pools, a cola bath! ...Though right now, two girls are hiding in my café from Foxy the Silver Fox. He wants their notebook — it explains how to make gems."'),
      choices: [
        { text: 'Rest at the hot springs', do: (c) => c.open('inn', {}) },
        { text: 'I\'ll deal with Foxy.', if: () => !ctx.quest('p2_spa_foxy'), do: (c) => c.startQuest('p2_spa_foxy'), end: true },
        { text: 'Foxy won\'t bother anyone.', if: () => at(ctx, 'p2_spa_foxy', 'report'), do: (c) => c.complete('p2_spa_foxy'), next: 'thx' },
        { text: 'Leave', end: true },
      ] },
      thx: { text: '"Lina and Sayo are safe! They insisted you take one of their gems. (He hands you a glittering stone.) And your next bath is on the house!"' },
    } }),
  },
  {
    id: 'p2_lina', name: 'Lina & Sayo', title: 'Runaways with a notebook', island: 'spa_island', at: { town: 'spa_resort', building: 'Seaside Resort Café' },
    look: { hair: 'ponytail', hairColor: '#8d6e63', top: '#ffcdd2', bottom: '#90caf9', scale: 0.85 }, level: 4,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => (ctx.game.quests.isDone('p2_spa_foxy')
      ? '"Thank you! Our father wrote this notebook — how to make gems from nothing but seawater and time. It\'s not for sale. Not to foxes, anyway."'
      : '"Shh! Foxy the Silver Fox is out by the hot springs with his crew. He wants our father\'s notebook. He challenged everyone to a Davy Back Fight — and when they refused, he started shooting that slow-beam!"') } } }),
  },
  {
    id: 'p2_foxy', name: 'Foxy the Silver Fox', title: 'Captain of the Foxy Pirates', island: 'spa_island', at: { spot: 'hot_springs' }, faction: 'pirate', level: 38, boss: true, hpMul: 1.1, hostile: true,
    look: { hair: 'short', hairColor: '#b0bec5', top: '#212121', bottom: '#5d4037', coat: '#212121', nose: 'long', skin: '#e0ac7e' },
    fruit: 'noro', fruitMastery: 55, moves: ['noro_beam', 'noro_mirror', 'brawl_tackle'], skill: 0.35, bounty: 24000000, infamy: true, breakthrough: 2,
    alert: 'Fehfehfeh! A Davy Back Fight! Loser gives the winner... that notebook!', when: (c, g) => S(g, 'p2_spa_foxy') === 'foxy',
  },

  // ========================================================= SABAODY ARCHIPELAGO
  {
    id: 'p2_shakky', name: 'Shakky', title: 'Owner of Shakky\'s Rip-off Bar', island: 'sabaody', at: { town: 'sabaody_grove13', building: "Shakky's Rip-off Bar" },
    look: { hair: 'short', hairColor: '#212121', top: '#7b1fa2', bottom: '#212121', skin: '#f1c9a0' }, level: 70,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to my Rip-off Bar. (She smiles through a curl of cigarette smoke.) Drinks are expensive, information is more expensive, and pirates who start trouble get their bill doubled. I used to be a pirate myself, you know — a long time ago, on an island where men aren\'t allowed."',
        choices: [
          { text: 'Food and drink (at rip-off prices)', do: (c) => c.open('shop', { shop: 'tavern', building: { name: "Shakky's Rip-off Bar", role: 'bar' } }) },
          { text: 'I need my ship coated for Fish-Man Island.', next: 'coat' },
          { text: 'Where is Rayleigh?', if: () => !ctx.game.quests.isDone('p2_sabaody_auction'), next: 'ray' },
          { text: 'Leave', end: true },
        ] },
      coat: { text: '"Coating takes the resin of these mangroves and three days of work. The shipyards at Groves 50 to 59 will do it for a price. Or... if you can find Ray, he\'ll do it for the fun of it. He\'s the best coater in the archipelago."', next: 'a' },
      ray: { text: '"Rayleigh? He wandered off gambling a week ago. (She sighs.) When he runs out of money, he lets himself get kidnapped and sold at the Human Auctioning House, then breaks out with the money. Try Grove 1."', next: 'a' },
    } }),
  },
  {
    id: 'p2_rayleigh', name: 'Silvers Rayleigh', title: '"Dark King" — former first mate of the Roger Pirates', island: 'sabaody', at: { town: 'sabaody_grove13', building: "Shakky's Rip-off Bar", ox: 2.5 }, trainer: 'rayleigh', ai: 'idle',
    look: { hair: 'long', hairColor: '#fafafa', top: '#fafafa', bottom: '#5d4037', coat: '#8d6e63', scarEye: true, swords: 1, skin: '#f1c9a0' }, level: 90,
    when: (c, g) => D(g, 'p2_sabaody_auction') && !ON(g, 'p2_rusukaina'),
    marker: (c, g) => (D(g, 'p2_summit_war') && !g.quests.state('p2_rusukaina') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Hm? Ah, the young one from the auction. Take it easy. (He pours two glasses.) I coat ships these days. And now and then, I teach a promising pirate what Haki really is — the power of conviction without a shadow of doubt."',
        choices: [
          { text: 'Teach me Haki.', do: (c) => c.open('trainer', { trainer: 'rayleigh' }) },
          { text: 'Coat my ship, please.', do: (c) => { if (!c.quest('p2_coating')) c.startQuest('p2_coating'); c.open('shipwright', { coating: true }); } },
          { text: 'Tell me about Gol D. Roger.', next: 'roger' },
          { text: 'Train me properly. However long it takes.', if: () => ctx.game.quests.isDone('p2_summit_war') && !ctx.quest('p2_rusukaina'), next: 'rk' },
          { text: 'Goodbye.', end: true },
        ] },
      roger: { text: '"Roger laughed at the very end of the world. We found the treasure — and the truth. (He smiles.) I won\'t tell you what it is. The world must find it for itself. Go and see it with your own eyes."', next: 'a' },
      rk: { text: '"You survived the war. Good. Rusukaina, in the Calm Belt north-west of Amazon Lily: forty-eight seasons a year and five hundred beasts you can\'t beat yet. Meet me there. We\'ll start with Armament and Observation — and see what else is sleeping in you."', onEnter: (c) => c.startQuest('p2_rusukaina') },
    } }),
  },
  {
    id: 'p2_rayleigh_slave', name: 'Silvers Rayleigh', title: 'Lot 16 at the Human Auctioning House', island: 'sabaody', at: { spot: 'grove_1', ox: -3 }, ai: 'idle',
    look: { hair: 'long', hairColor: '#fafafa', top: '#fafafa', bottom: '#5d4037', scarEye: true, skin: '#f1c9a0' }, level: 90,
    when: (c, g) => S(g, 'p2_sabaody_auction') === 'charlos',
    dialogue: () => ({ start: 'a', nodes: { a: { text: '(An old man in an explosive slave collar sits calmly among the lots, sipping something he definitely brought in himself.) "Hm? Don\'t mind me. I needed gambling money. ...Though I will say, that mermaid girl up on the stage is a friend of a friend."' } } }),
  },
  {
    id: 'p2_disco', name: 'Disco', title: 'Owner of the Human Auctioning House', island: 'sabaody', at: { town: 'sabaody_grove1', building: 'Human Auctioning House' },
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#212121', coat: '#6a1b9a', skin: '#f1c9a0' }, level: 18, faction: 'civilian',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => (ctx.game.quests.isDone('p2_sabaody_auction')
      ? '"The auction house is... closed for repairs. (His hands shake.) Pirates, admirals, Celestial Dragons... I sell PEOPLE, not trouble!"'
      : '"Welcome, welcome to the Human Auctioning House of Grove 1! Giants, fish-men, a real mermaid tonight — the Celestial Dragons themselves bid here! (He grins.) Pirates are welcome too. Just don\'t make a scene."') } } }),
  },
  {
    id: 'p2_charlos', name: 'Saint Charlos', title: 'World Noble (Celestial Dragon)', island: 'sabaody', at: { spot: 'grove_1', ox: 3 }, faction: 'civilian', level: 5, ai: 'idle',
    look: { hat: 'bubble', hair: 'curly', hairColor: '#fafafa', top: '#fafafa', bottom: '#eceff1', bulk: 1.4, skin: '#fdeee4' }, bulk: 1.4,
    when: (c, g) => S(g, 'p2_sabaody_auction') === 'charlos',
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Five hundred million for the mermaid! I always wanted a fish for my aquarium! (A Fish-Man pushes through the crowd toward the stage. Charlos draws a pistol and shoots him in the chest.) He moved without permission. Kneel, commoner, or you\'re next!"',
        choices: [
          { text: '(Punch the Celestial Dragon.)', do: (c) => {
            const g = c.game;
            c.setFlag('p2_punchedCharlos');
            const a = findActor(g, 'p2_charlos');
            if (a) { a.knock(10, 2); g.fx.impactFrame?.(0.3); }
            g.fx.shake(1);
            g.ui.banner('YOU STRUCK A WORLD NOBLE', 'Grove 1', 'Saint Charlos crashes through three rows of seats. The whole hall falls silent. Someone is calling an Admiral.', 6);
            g.progression.addBounty(100000000, 'Struck a Celestial Dragon');
            if (c.char.faction === 'marine') { c.char.faction = 'pirate'; c.char.marineRank = null; c.char.flags.deserter = true; }
            c.stage('p2_sabaody_auction', 'kizaru');
          }, end: true },
          { text: '(Grit your teeth and look away.)', do: (c) => c.stage('p2_sabaody_auction', 'freed'), end: true },
        ] },
    } }),
  },
  {
    id: 'p2_roswald', name: 'Saint Roswald', title: 'World Noble (Celestial Dragon)', island: 'sabaody', at: { spot: 'grove_1', ox: 5 }, faction: 'civilian', level: 5, ai: 'idle',
    look: { hat: 'bubble', hair: 'short', hairColor: '#e0e0e0', top: '#fafafa', bottom: '#eceff1', bulk: 1.3 },
    when: (c, g) => S(g, 'p2_sabaody_auction') === 'charlos',
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Hm? A commoner breathing near me. (He adjusts his bubble helmet so as not to share the air.) My son buys whatever he wants. That is what the world is for."' } } }),
  },
  {
    id: 'p2_hatchan', name: 'Hatchan', title: 'Takoyaki Hachi — Fish-Man (octopus)', island: 'sabaody', at: { town: 'sabaody_grove41', building: 'Takoyaki Hachi' }, race: 'fishman',
    look: { hair: 'curly', hairColor: '#e53935', skin: '#ef9a9a', top: '#ffeb3b', bottom: '#5d4037' }, level: 30, bounty: 8000000,
    marker: (c, g) => (!g.quests.state('p2_sabaody_auction') ? '!' : S(g, 'p2_sabaody_auction') === 'freed' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          if (at(ctx, 'p2_sabaody_auction', 'freed')) return '"Nyu~! Camie\'s safe! (He wipes his eyes with four hands at once.) I used to be one of Arlong\'s crew, you know. I did bad things. And still you helped us. Takoyaki for life, on the house!"';
          if (ctx.game.quests.isDone('p2_sabaody_auction')) return '"Nyu~! Best takoyaki in Sabaody! Six arms, six times the flavour!"';
          return '"Nyu~! Takoyaki Hachi, best in Sabaody! (His face falls.) ...Have you seen a mermaid? Green hair, pink tail, very excitable? Camie went to deliver takoyaki at Grove 13 and never came back. Fish-Men and mermaids get kidnapped here all the time..."';
        },
        choices: [
          { text: 'Buy takoyaki', do: (c) => c.open('shop', { shop: 'p2_takoyaki_menu', building: { name: 'Takoyaki Hachi', role: 'restaurant' } }) },
          { text: 'I\'ll find Camie.', if: () => !ctx.quest('p2_sabaody_auction'), do: (c) => c.startQuest('p2_sabaody_auction'), end: true },
          { text: 'Camie is safe.', if: () => at(ctx, 'p2_sabaody_auction', 'freed'), do: (c) => c.complete('p2_sabaody_auction'), end: true },
          { text: 'Leave', end: true },
        ],
      },
    } }),
  },
  {
    id: 'p2_camie', name: 'Camie', title: 'Mermaid (kissing gourami)', island: 'sabaody', at: { town: 'sabaody_grove41', building: 'Takoyaki Hachi', ox: 2.2 }, race: 'fishman',
    look: { hair: 'short', hairColor: '#4caf50', top: '#f8bbd0', bottom: '#f06292', skin: '#fdeee4', fin: true }, level: 3,
    when: (c, g) => D(g, 'p2_sabaody_auction'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"You came for me! (She flops forward and hugs you, tail and all.) Pappag says we\'re going home to Fish-Man Island. If you ever dive down, come to the Mermaid Café in Mermaid Cove! Coat your ship first, okay? Or you\'ll be squished!"' } } }),
  },
  {
    id: 'p2_pappag', name: 'Pappag', title: 'Designer of the "Criminal" brand (starfish)', island: 'sabaody', at: { town: 'sabaody_grove41', building: 'Takoyaki Hachi', ox: -1.6 }, race: 'fishman',
    look: { hair: 'bald', skin: '#f48fb1', top: '#f48fb1', bottom: '#f06292', scale: 0.55 }, level: 3, ai: 'idle',
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"I am Pappag, the famous designer! My brand, Criminal, is worn by every fashionable Fish-Man! ...Yes, a starfish can design clothes. Have you seen my hands? No? Exactly. Genius."' } } }),
  },
  {
    id: 'p2_macro', name: 'Macro', title: 'Captain of the Macro Pirates (Fish-Man slavers)', island: 'sabaody', at: { spot: 'grove_13' }, faction: 'pirate', race: 'fishman', level: 36, boss: true, hpMul: 1.1, hostile: true,
    look: { hair: 'bald', skin: '#78909c', top: '#6d4c41', bottom: '#3e2723', fin: true, sharpTeeth: true, bulk: 1.3 }, bulk: 1.3,
    style: 'fishman_karate', moves: ['fmk_uchimizu', 'fmk_arabesque', 'brawl_tackle'], skill: 0.4, bounty: 7000000, infamy: true, breakthrough: 2,
    alert: 'A mermaid sells for seventy million! Stay out of our business!', when: (c, g) => S(g, 'p2_sabaody_auction') === 'macro',
  },
  {
    id: 'p2_coater', name: 'Mangrove Mechanic', title: 'Coating Mechanic, Grove 50', island: 'sabaody', at: { town: 'sabaody_shipyards', building: 'Coating Mechanic' },
    look: { hair: 'short', hairColor: '#795548', top: '#90caf9', bottom: '#455a64', goggles: true }, level: 14,
    marker: (c, g) => (!g.quests.state('p2_coating') ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Coating! The resin of the Yarukiman Mangrove, spread over every plank. Your ship goes down inside a bubble — ten thousand metres to Fish-Man Island. It holds for one voyage. Mess up the descent and the Sea Kings eat you, the currents crush you, or the bubble pops."',
        choices: [
          { text: 'Coat my ship.', do: (c) => { if (!c.quest('p2_coating')) c.startQuest('p2_coating'); c.open('shipwright', { coating: true }); } },
          { text: 'Where do I dive?', next: 'where' },
          { text: 'Leave', end: true },
        ] },
      where: { text: '"Sail east from the archipelago, right up to the foot of the Red Line. You\'ll see the water turn dark — that\'s the downward current. Dive there. And don\'t look at the Sea Kings."', next: 'a' },
    } }),
  },
  {
    id: 'p2_duval', name: 'Duval', title: 'Leader of the Rosy Life Riders', island: 'sabaody', at: { spot: 'grove_13', ox: -4 },
    look: { hair: 'short', hairColor: '#fdd835', top: '#fafafa', bottom: '#1565c0', hat: 'cowboy', hatColor: '#6d4c41' }, level: 34,
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => (at(ctx, 'p2_sabaody_auction', 'macro')
      ? '"The mermaid? The Macro Pirates grabbed her right here in Grove 13 — Fish-Man slavers. They\'ll sell her to Disco\'s auction at Grove 1 if nobody stops them. My Rosy Life Riders will watch the bridges. Handsome, right?"'
      : '"Duval of the Rosy Life Riders. I used to wear an iron mask and hunt a man with my face. Then somebody kicked my face into THIS. (He poses, sparkling.) Handsome, right? Now my boys and I help people. Mostly handsome people."') } } }),
  },
  {
    id: 'p2_gil', name: 'Gil', title: 'Rosy Life Rider (flying-fish pilot)', island: 'sabaody', at: { spot: 'grove_41', ox: 3 },
    look: { hair: 'spiky', hairColor: '#1565c0', top: '#fafafa', bottom: '#1565c0', hat: 'goggles', skin: '#e0ac7e' }, level: 24, style: 'brawler',
    recruit: { role: 'helmsman', requires: (c, g) => D(g, 'p2_sabaody_auction'), pitch: '"Leave the Riders? Duval said if I ever found a captain worth following, I should go. (He grins.) I can steer anything that floats — or flies. Let\'s go!"' },
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => (ctx.game.quests.isDone('p2_sabaody_auction')
      ? '"You punched — or nearly punched — a Celestial Dragon! Sabaody\'s still shaking. I pilot flying fish for Duval, but I\'ve always wanted to steer a real ship through the New World."'
      : '"Gil, Rosy Life Riders. I fly flying fish between the groves. Fastest way around Sabaody — if you don\'t mind the smell."') } } }),
  },
  {
    id: 'p2_kid', name: 'Eustass Kid', title: 'Captain of the Kid Pirates (Supernova)', island: 'sabaody', at: { spot: 'grove_1', ox: -6 }, faction: 'civilian', level: 60, ai: 'idle', bounty: 315000000,
    look: { hair: 'spiky', hairColor: '#e53935', goggles: true, coat: '#212121', top: '#212121', bottom: '#3e2723', skin: '#f1c9a0' },
    when: (c, g) => ['auction', 'charlos'].includes(S(g, 'p2_sabaody_auction')),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Another rookie. There\'s eleven of us Supernovas on this archipelago right now, all heading for the New World. (He sneers at the Celestial Dragons\' box.) Only one of us is going to be Pirate King. Get in my way and I\'ll crush you."' } } }),
  },
  {
    id: 'p2_law', name: 'Trafalgar Law', title: 'Captain of the Heart Pirates (Supernova)', island: 'sabaody', at: { spot: 'grove_1', ox: -8 }, faction: 'civilian', level: 60, ai: 'idle', bounty: 200000000,
    look: { hair: 'short', hairColor: '#212121', hat: 'beanie', hatColor: '#fafafa', top: '#fdd835', bottom: '#5d4037', swords: 1, skin: '#e0ac7e' },
    when: (c, g) => ['auction', 'charlos'].includes(S(g, 'p2_sabaody_auction')),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Trafalgar Law. (He doesn\'t look up from his nodachi.) The Celestial Dragons are sitting in the front row. Someone in this room is going to do something stupid today. I\'d like to watch."' } } }),
  },
  {
    id: 'p2_kizaru', name: 'Admiral Kizaru', title: 'Borsalino — Pika Pika no Mi', island: 'sabaody', at: { spot: 'kizaru_arrival', ox: 6 }, faction: 'marine', level: 110, boss: true, hpMul: 3, ai: 'idle',
    look: { hair: 'short', hairColor: '#6d4c41', goggles: true, top: '#fdd835', bottom: '#fbc02d', coat: '#fafafa', coatText: 'JUSTICE', skin: '#f1c9a0' },
    fruit: 'pika', fruitMastery: 95, moves: ['pika_yasakani', 'pika_yata', 'pika_murakumo', 'pika_amaterasu'], haki: { armament: 70, observation: 70 }, skill: 0.8, lethal: false, breakthrough: 8, bounty: 250000000,
    when: (c, g) => ['kizaru', 'kuma'].includes(S(g, 'p2_sabaody_auction')) && !c.flags.p2_fledKizaru,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Ooh~ how scary~. You\'re the one who punched a World Noble? (He yawns.) I\'m supposed to capture you. But let\'s see if you can survive the Pacifista first~. Have you ever been kicked at the speed of light?"',
        choices: [
          { text: 'Fight the Admiral. (Extremely dangerous)', do: (c) => { const k = findActor(c.game, 'p2_kizaru'); if (k) aggro(c.game, k); }, end: true },
          { text: 'Back away.', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_px4', name: 'Pacifista PX-4', title: 'Human weapon of the World Government', island: 'sabaody', at: { spot: 'kizaru_arrival' }, faction: 'marine', level: 58, boss: true, hpMul: 1.8, hostile: true, scale: 1.7, bulk: 1.7,
    look: { hair: 'short', hairColor: '#212121', hat: 'beanie', hatColor: '#263238', ears: 'round', fur: '#263238', top: '#263238', bottom: '#263238', skin: '#607d8b' },
    style: 'brawler', moves: ['kuma_laser', 'p2_pacifista_pad', 'kuma_paw_npc'], skill: 0.45, lethal: true, breakthrough: 4, bounty: 50000000,
    alert: 'Target identified. Bounty confirmed. Eliminating.', when: (c, g) => S(g, 'p2_sabaody_auction') === 'kizaru',
  },
  {
    id: 'p2_sentomaru', name: 'Sentomaru', title: 'Captain of the Science Unit — "the tightest defence in the world"', island: 'sabaody', at: { spot: 'kizaru_arrival', ox: -5 }, faction: 'marine', level: 55, boss: true, hpMul: 1.5, bulk: 1.8,
    look: { hair: 'short', hairColor: '#212121', hat: 'bandana', hatColor: '#212121', top: '#fafafa', bottom: '#263238', skin: '#e0ac7e' },
    style: 'brawler', weapon: 'axe', moves: ['p2_ashigara_dokkoi', 'brawl_tackle'], haki: { armament: 40 }, skill: 0.5, lethal: false, breakthrough: 3, bounty: 40000000,
    when: (c, g) => S(g, 'p2_sabaody_auction') === 'kizaru',
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Oi oi! Captain of the Science Unit, Sentomaru! I have the tightest defence in the world! (He plants a huge axe.) The Pacifista are Dr. Vegapunk\'s masterpieces. You\'ll never get past them — or me!"',
        choices: [
          { text: 'Test that defence.', do: (c) => { const s = findActor(c.game, 'p2_sentomaru'); if (s) aggro(c.game, s); }, end: true },
          { text: 'Leave', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_kuma_sb', name: 'Bartholomew Kuma', title: '"The Tyrant", Warlord of the Sea', island: 'sabaody', at: { spot: 'kizaru_arrival', ox: 3 }, faction: 'marine', level: 90, ai: 'idle', scale: 1.8, bulk: 1.8,
    look: { hair: 'short', hairColor: '#212121', hat: 'beanie', hatColor: '#263238', ears: 'round', fur: '#263238', top: '#212121', bottom: '#212121', skin: '#8d6e63' },
    fruit: 'nikyu', when: (c, g) => S(g, 'p2_sabaody_auction') === 'kuma',
    marker: () => '!',
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '(The real Kuma steps between you and the Admiral\'s light. He removes one glove, revealing a paw pad.) "...If you could take a trip, where would you like to go?"',
        choices: [
          ...KUMA_TRIPS.map(([id, name, blurb]) => ({ text: name, do: (c) => kumaTrip(c, id, name, blurb), end: true })),
          { text: '"Anywhere but here."', do: (c) => { const [id, name, blurb] = KUMA_TRIPS[Math.floor(Math.random() * KUMA_TRIPS.length)]; kumaTrip(c, id, name, blurb); }, end: true },
          { text: '"I\'ll find my own way off this island."', next: 'run' },
        ] },
      run: { text: '"...Then run." (Kuma turns and walks into the Admiral\'s light. For a moment, Kizaru hesitates — and you are gone into the mangroves.)', onEnter: (c) => { c.setFlag('p2_fledKizaru'); c.complete('p2_sabaody_auction'); } },
    } }),
  },
);

// Kuma's paws: the islands he sent the Straw Hats to (plus Amazon Lily).
const KUMA_TRIPS = [
  ['kuraigana', 'Kuraigana Island', 'a gloomy island of ruins, baboons with swords — and a castle.'],
  ['boin', 'the Boin Archipelago', 'a jungle where the plants are hungrier than you are.'],
  ['momoiro', 'Momoiro Island', 'an island where everything is pink. Everyone is running toward you. In dresses.'],
  ['karakuri', 'Karakuri Island', 'a snowbound land of inventors, Future Land Baldimore.'],
  ['namakura', 'Namakura Island', 'an island of tall tales, whose people fear the devil.'],
  ['amazon_lily', 'Amazon Lily', 'the Island of Women, deep in the Calm Belt.'],
];
function kumaTrip(c, id, name, blurb) {
  const g = c.game;
  c.setFlag('p2_kumaTrip', id);
  if (g.quests.stageId('p2_sabaody_auction') === 'kuma') c.complete('p2_sabaody_auction');
  g.fx.burst(g.player.x, g.player.y - 0.5, 30, { color: ['#ffffff', '#e0f7fa'], speed: 8, vz: 8, g: 2, life: 1, kind: 'smoke', size: 0.4 });
  travel(g, id, { banner: ['PAD HO', 'Bartholomew Kuma', `You fly for three days and three nights and land on ${name}: ${blurb} Somehow your ship arrives too.`, 7] });
}

// ------------------------------------------- Marineford, the Kuma islands, Calm Belt
const challenge = (id, label = 'Challenge them. (Extremely dangerous)') => ({ text: label, do: (c) => { const a = findActor(c.game, id); if (a) aggro(c.game, a); }, end: true });
const WAR = 'p2_summit_war';
const warOn = (g, ...st) => st.includes(S(g, WAR));
const ADMIRAL = { lethal: false, skill: 0.85, breakthrough: 8, boss: true, hpMul: 3, faction: 'marine', ai: 'guard' };
const kujaLook = (hair, top) => ({ hair: 'long', hairColor: hair, top, bottom: '#f5f5f5', skin: '#f1c9a0' });

npcs.push(
  // ============================================================ MARINEFORD
  {
    id: 'p2_sengoku', name: 'Fleet Admiral Sengoku', title: '"The Buddha"', island: 'marineford', at: { town: 'marine_hq', building: 'Marine Headquarters' }, ...ADMIRAL, level: 115,
    look: { hair: 'afro', hairColor: '#212121', hat: 'marine', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', bulk: 1.3, skin: '#f1c9a0' },
    style: 'brawler', moves: ['p2_buddha_wave', 'p2_daibutsu', 'brawl_tackle'], haki: { armament: 85, observation: 75 }, bounty: 300000000,
    marker: (c, g) => (marine(c) && !g.quests.state(WAR) && (D(g, 'p2_sabaody_auction') || D(g, 'p2_impel_down')) ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (marine(ctx.char)
          ? `"At ease, ${ctx.char.marineRank || 'sailor'}. (The Fleet Admiral\'s pet goat chews on a report.) The pirates of this era do not stay in their seas. Whitebeard moves. The Supernovas move. And I am told Garp\'s grandson is somewhere in this. Justice must not waver."`
          : wanted(ctx.char)
            ? '"A pirate walks into Marine Headquarters and asks for the Fleet Admiral. (He does not stand up.) Garp\'s grandson would do the same. Leave while I am in a good mood — or do not, and discover why they call me the Buddha."'
            : '"You wish to serve Justice? The Enlistment Office is beside this building. Absolute Justice is a heavy coat to wear."'),
        choices: [
          { text: 'Marine business', if: () => marine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'Marine Headquarters' }), end: true },
          { text: 'Report for duty — the war.', if: () => marine(ctx.char) && !ctx.quest(WAR) && (ctx.game.quests.isDone('p2_sabaody_auction') || ctx.game.quests.isDone('p2_impel_down')), do: (c) => c.startQuest(WAR), end: true },
          { text: 'Enlist in the Marines', if: () => !marine(ctx.char) && !ctx.char.bounty, do: (c) => c.emit('marineEnlist', 'Marineford'), end: true },
          { ...challenge('p2_sengoku', 'Challenge the Fleet Admiral. (Extremely dangerous)'), if: () => wanted(ctx.char) },
          { text: 'Leave', end: true },
        ],
      },
    } }),
  },
  {
    id: 'p2_garp', name: 'Monkey D. Garp', title: 'Vice Admiral — "Garp the Fist", Hero of the Marines', island: 'marineford', at: { town: 'marine_hq', plaza: true, ox: -4 }, ...ADMIRAL, level: 105,
    look: { hair: 'short', hairColor: '#e0e0e0', hat: 'marine', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', bulk: 1.4, scarEye: true, skin: '#e0ac7e' },
    style: 'brawler', moves: ['p2_fist_of_love', 'p2_cannonball_pitch', 'brawl_tackle'], haki: { armament: 90, observation: 70 }, bounty: 200000000,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Bwahahaha! (He is eating rice crackers out of a bag the size of a barrel.) So you\'re the rookie everybody\'s talking about. My grandson is a pirate, my son is a revolutionary, and I\'m a Vice Admiral because they keep trying to make me an Admiral! Want a cracker?"',
        choices: [
          { text: 'Take a cracker.', next: 'cracker' },
          { ...challenge('p2_garp', 'Ask for a "Fist of Love". (Extremely dangerous)') },
          { text: 'Leave', end: true },
        ] },
      cracker: { text: '(It is very hard. Garp crunches his in one bite.) "When I was young, I chased Roger across the Grand Line more times than I can count. He was the worst pirate in the world. ...Best rival a man could want. Bwahahaha!"', next: 'a' },
    } }),
  },
  {
    id: 'p2_akainu', name: 'Admiral Akainu', title: 'Sakazuki — Magu Magu no Mi', island: 'marineford', at: { spot: 'admirals_hall' }, ...ADMIRAL, level: 115,
    look: { hair: 'short', hairColor: '#212121', hat: 'marine', top: '#b71c1c', bottom: '#7f0000', coat: '#fafafa', coatText: 'JUSTICE', bulk: 1.3, skin: '#e0ac7e' },
    fruit: 'magu', fruitMastery: 95, moves: ['magu_daifunka', 'magu_meigo', 'magu_ryusei'], haki: { armament: 85, observation: 70 }, lethal: true, bounty: 300000000,
    when: (c, g) => !warOn(g, 'akainu'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (wanted(ctx.char)
        ? '"Absolute Justice. (Smoke rises from his fist.) A pirate standing in Marine Headquarters. Evil must be eradicated — every last trace of it."'
        : '"Absolute Justice is not a slogan. It is a promise that evil will be erased, whatever it costs. Remember that, if you ever put on the coat."'),
      choices: [{ ...challenge('p2_akainu') }, { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_aokiji', name: 'Admiral Aokiji', title: 'Kuzan — Hie Hie no Mi', island: 'marineford', at: { spot: 'admirals_hall', ox: 3 }, ...ADMIRAL, level: 112, scale: 1.25,
    look: { hair: 'afro', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', skin: '#8d6e63' },
    fruit: 'hie', fruitMastery: 95, moves: ['hie_saber', 'hie_pheasant', 'hie_ageand', 'hie_time'], haki: { armament: 80, observation: 70 }, bounty: 250000000,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Ara ara... (He lifts a sleeping mask off his eyes.) Lazy Justice. That\'s my way. If you\'re not here to cause trouble, I\'m going back to sleep. If you are... well. I\'d rather you didn\'t."',
        choices: [{ ...challenge('p2_aokiji') }, { text: 'Let him sleep.', end: true }] },
    } }),
  },
  {
    id: 'p2_kizaru_mf', name: 'Admiral Kizaru', title: 'Borsalino — Pika Pika no Mi', island: 'marineford', at: { spot: 'admirals_hall', ox: -3 }, ...ADMIRAL, level: 112,
    look: { hair: 'short', hairColor: '#6d4c41', goggles: true, top: '#fdd835', bottom: '#fbc02d', coat: '#fafafa', coatText: 'JUSTICE', skin: '#f1c9a0' },
    fruit: 'pika', fruitMastery: 95, moves: ['pika_yasakani', 'pika_yata', 'pika_murakumo', 'pika_amaterasu'], haki: { armament: 70, observation: 70 }, bounty: 250000000,
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Ooh~ a visitor~. Don\'t mind me. (He is filing his nails.) Unclear Justice, they call mine. I do whatever I\'m told, as fast as light~. Right now nobody\'s told me anything. Isn\'t that nice?"',
        choices: [{ ...challenge('p2_kizaru_mf') }, { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_tsuru', name: 'Vice Admiral Tsuru', title: '"Great Staff Officer"', island: 'marineford', at: { town: 'marine_hq', plaza: true, ox: 4 }, faction: 'marine', level: 90, ai: 'idle',
    look: { hair: 'bun', hairColor: '#e0e0e0', top: '#1a237e', bottom: '#1a237e', coat: '#fafafa', coatText: 'JUSTICE', skin: '#f1c9a0' },
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Garp and Sengoku were boys when I first scolded them. (She sips tea.) Every pirate thinks they are the exception. The Wash-Wash Fruit has cleaned up many exceptions."' } } }),
  },
  {
    id: 'p2_hq_instructor', name: 'Instructor Zephyr\'s Heir', title: 'Marine Drill Hall', island: 'marineford', at: { town: 'marine_hq', building: 'Marine Drill Hall' }, faction: 'marine', level: 60, trainer: 'marine_instructor',
    look: { hair: 'buzz', hairColor: '#9e9e9e', top: '#fafafa', bottom: '#1b4f72', hat: 'marine', bulk: 1.3 },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (marine(ctx.char)
        ? '"Soru! Geppo! Tekkai! Every officer at Headquarters learns the Six Powers in this hall. You\'re late. Start running."'
        : '"This drill hall trains Marines. Enlist first — then I\'ll make you suffer properly."'),
      choices: [
        { text: 'Train (Rokushiki)', if: () => marine(ctx.char), do: (c) => c.open('trainer', { trainer: 'marine_instructor' }) },
        { text: 'Leave', end: true },
      ] },
    } }),
  },
  {
    id: 'p2_hq_recruiter', name: 'Recruiting Officer', title: 'Enlistment Office', island: 'marineford', at: { town: 'marine_hq', building: 'Enlistment Office' }, faction: 'marine', level: 30,
    look: { hair: 'short', hairColor: '#5d4037', top: '#fafafa', bottom: '#1b4f72', hat: 'marine' },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Enlistment Office, Marine Headquarters! Absolute Justice needs strong arms. Clean records only."',
        choices: [
          { text: 'Enlist in the Marines', if: () => !marine(ctx.char), do: (c) => c.emit('marineEnlist', 'Marineford'), end: true },
          { text: 'Marine business', if: () => marine(ctx.char), do: (c) => c.emit('marineOffice', { name: 'Enlistment Office' }), end: true },
          { text: 'Leave', end: true },
        ] },
    } }),
  },
  {
    id: 'p2_mf_veteran', name: 'Old Seaman Gordo', title: 'Veteran of Marineford', island: 'marineford', at: { spot: 'oris_plaza', ox: -6 }, level: 20,
    marker: (c, g) => (!g.quests.state(WAR) && (D(g, 'p2_impel_down') || D(g, 'p2_sabaody_auction')) ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.game.quests.isDone(WAR)
          ? '"I was on this plaza when Whitebeard fell. He died standing, you know. Not a single wound in his back. (The old man points at the great crack across the stone.) He said the One Piece is real. The whole world heard him. A new era started that day."'
          : '"The execution platform, Oris Plaza. They\'re going to execute Portgas D. Ace, Whitebeard\'s second division commander, right up there. Whitebeard will come. Every pirate in the New World knows it. This plaza is going to become a war."'),
        choices: [
          { text: 'I\'ll be here when it starts.', if: () => !ctx.quest(WAR) && (ctx.game.quests.isDone('p2_impel_down') || ctx.game.quests.isDone('p2_sabaody_auction')), do: (c) => c.startQuest(WAR), end: true },
          { text: 'Leave', end: true },
        ],
      },
    } }),
  },
  {
    id: 'p2_momonga', name: 'Vice Admiral Momonga', title: 'Marine Headquarters', island: 'marineford', at: { spot: 'oris_plaza' }, faction: 'marine', level: 60, boss: true, hpMul: 1.5, hostile: true,
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#1b4f72', coat: '#fafafa', coatText: 'JUSTICE', skin: '#f1c9a0' },
    style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'itto_whirl', 'roku_soru', 'roku_rankyaku'], haki: { armament: 40 }, skill: 0.6, lethal: false, breakthrough: 4, bounty: 60000000,
    alert: 'Not one step closer to the platform!', when: (c, g) => warOn(g, 'vice_admiral') && !marine(c),
  },
  {
    id: 'p2_squard', name: 'Squard', title: '"Maelstrom Spider", allied captain of Whitebeard', island: 'marineford', at: { spot: 'oris_plaza' }, faction: 'pirate', level: 58, boss: true, hpMul: 1.4, hostile: true,
    look: { hair: 'long', hairColor: '#212121', top: '#5d4037', bottom: '#3e2723', coat: '#263238', skin: '#e0ac7e', swords: 1 },
    style: 'ittoryu', weapon: 'sword', moves: ['itto_iai', 'itto_pound', 'itto_whirl'], skill: 0.55, bounty: 140000000, infamy: true, breakthrough: 4,
    alert: 'For Pops! For Ace!', when: (c, g) => warOn(g, 'vice_admiral') && marine(c),
  },
  {
    id: 'p2_akainu_war', name: 'Admiral Akainu', title: 'Magma rains on Oris Plaza', island: 'marineford', at: { spot: 'oris_plaza', ox: 4 }, faction: 'marine', level: 115, boss: true, hpMul: 3, hostile: true,
    look: { hair: 'short', hairColor: '#212121', hat: 'marine', top: '#b71c1c', bottom: '#7f0000', coat: '#fafafa', coatText: 'JUSTICE', bulk: 1.3, skin: '#e0ac7e' },
    fruit: 'magu', fruitMastery: 95, moves: ['magu_daifunka', 'magu_meigo', 'magu_ryusei'], haki: { armament: 85, observation: 70 }, skill: 0.85, lethal: true, breakthrough: 8, bounty: 300000000,
    alert: 'Pirates who flee are still pirates. Dai Funka!', when: (c, g) => warOn(g, 'akainu') && !marine(c),
  },

  // =============================================================== KURAIGANA
  {
    id: 'mihawk', name: 'Dracule Mihawk', title: '"Hawk-Eyes" — the World\'s Greatest Swordsman', island: 'kuraigana', trainer: 'mihawk',
    look: { hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#3e2723', coat: '#212121', hat: 'captain', hatColor: '#212121', eyeColor: '#fbc02d', swords: 1, skin: '#f1c9a0' },
    level: 120, boss: true, hpMul: 3, faction: 'rival', ai: 'guard', style: 'ittoryu', weapon: 'sword', weaponPower: 2.3,
    moves: ['p2_yoru_slash', 'itto_iai', 'itto_whirl', 'itto_pound'], haki: { armament: 95, observation: 85 }, skill: 0.95, lethal: false, breakthrough: 10,
    alert: 'Show me the weight of your blade.',
    marker: (c, g) => (!g.quests.state('p2_kuraigana_trial') ? '!' : S(g, 'p2_kuraigana_trial') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.game.quests.isDone('p2_kuraigana_trial')
          ? '"You bowed your head to an enemy to learn his craft. That is not weakness. (He sets his glass of wine down.) The castle training grounds are open to you. Try not to bore me."'
          : '"This is Kuraigana. There was a kingdom here once; the war left ruins and baboons that learned to fight by watching men die. (His hawk eyes rest on you.) Why have you come to my island?"'),
        choices: [
          { text: 'Teach me the way of the sword.', if: () => !ctx.quest('p2_kuraigana_trial'), next: 'ask' },
          { text: 'The Humandrill chieftain is defeated.', if: () => at(ctx, 'p2_kuraigana_trial', 'report'), next: 'done' },
          { text: 'Train with Mihawk', if: () => ctx.game.quests.isDone('p2_kuraigana_trial'), do: (c) => c.open('trainer', { trainer: 'mihawk' }) },
          { ...challenge('mihawk', 'Challenge the World\'s Greatest Swordsman. (Extremely dangerous)') },
          { text: 'Leave', end: true },
        ],
      },
      ask: { text: '"You would ask a stranger to teach you? ...Very well. The Humandrills in the western woods copy every swordsman they have ever watched. Their chieftain fights like an army. Defeat it, and I will consider you."', onEnter: (c) => c.startQuest('p2_kuraigana_trial') },
      done: { text: '"Hm. You defeated an animal that fights like a hundred men, without becoming an animal yourself. I will train you. Come back as often as you like — as long as you surpass what you were the day before."', onEnter: (c) => c.complete('p2_kuraigana_trial'), next: 'a' },
    } }),
  },
  {
    id: 'p2_perona_kg', name: 'Perona', title: 'The Ghost Princess (stranded)', island: 'kuraigana', at: { spot: 'castle_gate', ox: 3 }, ai: 'idle',
    look: { hair: 'long', hairColor: '#f48fb1', top: '#212121', bottom: '#e91e63', hat: 'crown', hatColor: '#ffd54f', scale: 0.92 }, level: 45,
    when: (c, g) => D(g, TB_Q),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Horohorohoro! Some bear-man pushed me across the sea and I landed HERE. It\'s gloomy, it\'s foggy, the castle is full of bats... I LOVE it. (A tiny ghost pats your head.) The owner never talks. The baboons have swords. Don\'t tell him I ate his cake."' } } }),
  },
  {
    id: 'p2_humandrill_king', name: 'Humandrill Chieftain', title: 'The baboon who watched the war', island: 'kuraigana', at: { spot: 'humandrill_woods' }, faction: 'beast', level: 50, boss: true, hpMul: 1.4, hostile: true, bulk: 1.5,
    look: { hair: 'bald', skin: '#795548', fur: '#5d4037', ears: 'round', muzzle: true, furFace: true, top: '#8d6e63', bottom: '#5d4037', swords: 1 },
    style: 'nitoryu', weapon: 'sword', moves: ['nito_taka', 'itto_iai', 'itto_whirl'], skill: 0.55, breakthrough: 3,
    alert: '(It raises a sword in a perfect, stolen stance.)', when: (c, g) => S(g, 'p2_kuraigana_trial') === 'chieftain',
  },

  // =================================================================== BOIN
  {
    id: 'p2_heracles', name: 'Heracles', title: 'Forest Scholar of the Boin Archipelago', island: 'boin', at: { spot: 'heracles_camp' }, trainer: 'p2_heracles',
    look: { hat: 'horns', hatColor: '#4e342e', hair: 'long', hairColor: '#5d4037', top: '#8d6e63', bottom: '#5d4037', bulk: 1.2 }, level: 40,
    marker: (c, g) => (!g.quests.state('p2_gluttony') ? '!' : S(g, 'p2_gluttony') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Heraclesun! I am the Forest Scholar of Boin — the only man who has survived these islands. (He wears a beetle for a helmet.) This is the Forest of Gluttony: a ramen river, trees of meat, and plants that would like to eat you back."',
        choices: [
          { text: 'Teach me to survive here (sniper)', do: (c) => c.open('trainer', { trainer: 'p2_heracles' }) },
          { text: 'Anything I can hunt for you?', if: () => !ctx.quest('p2_gluttony'), next: 'hunt' },
          { text: 'The beetle is dead.', if: () => at(ctx, 'p2_gluttony', 'report'), next: 'done' },
          { text: 'Leave', end: true },
        ] },
      hunt: { text: '"The Greenstone Horned Beetle guards the best fruit on the eastern islet. It has eaten three of my tents. Bring it down and I will show you how to grow Pop Greens — seeds that bloom into weapons."', onEnter: (c) => c.startQuest('p2_gluttony') },
      done: { text: '"Heraclesun! Tonight we feast! (He presses a pouch of strange seeds into your hands.) Plant them in your enemy\'s path. A sniper who can read the forest is never alone."', onEnter: (c) => c.complete('p2_gluttony'), next: 'a' },
    } }),
  },
  {
    id: 'p2_boin_beetle', name: 'Greenstone Horned Beetle', title: 'Beast of the Forest of Gluttony', island: 'boin', at: { spot: 'boin_depths' }, faction: 'beast', level: 44, boss: true, hpMul: 1.5, hostile: true, bulk: 1.8, scale: 1.5,
    look: { hair: 'bald', skin: '#33691e', top: '#1b5e20', bottom: '#33691e', hat: 'horns', hatColor: '#3e2723', fur: '#1b5e20' },
    style: 'brawler', moves: ['p2_beast_pounce', 'brawl_tackle', 'brawl_headbutt'], skill: 0.3, breakthrough: 3,
    when: (c, g) => S(g, 'p2_gluttony') === 'beetle',
  },

  // ================================================================ MOMOIRO
  {
    id: 'p2_kamabakka_master', name: 'Madame Carmen', title: 'Newkama Kenpo master of the Kamabakka Kingdom', island: 'momoiro', at: { town: 'kamabakka', building: 'Newkama Kenpo Dojo' }, trainer: 'p2_kamabakka',
    look: { hair: 'afro', hairColor: '#ec407a', top: '#f8bbd0', bottom: '#ad1457', bulk: 1.4, skin: '#e0ac7e' }, level: 46, style: 'okama_kenpo',
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to the Kamabakka Kingdom, where those with the heart of a maiden gather! (A dozen okama in ballgowns strike a pose.) Newkama Kenpo is the way of the swan — graceful, fabulous and absolutely lethal. Will you dance with us?"',
        choices: [{ text: 'Train Newkama Kenpo', do: (c) => c.open('trainer', { trainer: 'p2_kamabakka' }) }, { text: 'Run away!', end: true }] },
    } }),
  },
  {
    id: 'p2_kamabakka_chef', name: 'Chef Tibany', title: 'Keeper of the 100 Attack Recipes', island: 'momoiro', at: { town: 'kamabakka', building: 'Attack Cuisine Kitchen' },
    look: { hair: 'curly', hairColor: '#ff80ab', top: '#fafafa', bottom: '#f06292', hat: 'captain', hatColor: '#fafafa', bulk: 1.3 }, level: 38,
    marker: (c, g) => (!g.quests.state('p2_kamabakka') ? '!' : S(g, 'p2_kamabakka') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Attack Cuisine! One hundred secret recipes that make a warrior stronger with every bite! (She winks — hard.) The recipes are guarded by the Kamabakka Candidates. Beat them and I\'ll teach you. Lose and you wear a dress for a week."',
        choices: [
          { text: 'Buy Attack Cuisine', do: (c) => c.open('shop', { shop: 'p2_attack_menu', building: { name: 'Attack Cuisine Kitchen', role: 'restaurant' } }) },
          { text: 'I\'ll take on the Candidates.', if: () => !ctx.quest('p2_kamabakka'), do: (c) => c.startQuest('p2_kamabakka'), end: true },
          { text: 'The Candidates are down!', if: () => at(ctx, 'p2_kamabakka', 'report'), do: (c) => c.complete('p2_kamabakka'), next: 'win' },
          { text: 'Leave', end: true },
        ] },
      win: { text: '"Magnificent! No dress for you. (She sounds disappointed.) Here: the first ten Attack Recipes, and a basket to go. Eat well, fight fabulously!"' },
    } }),
  },
  {
    id: 'p2_ivankov', name: 'Emporio Ivankov', title: 'Queen of the Kamabakka Kingdom (Revolutionary Army)', island: 'momoiro', at: { town: 'kamabakka', building: 'Kamabakka Palace' }, trainer: 'ivankov',
    look: { hair: 'afro', hairColor: '#7b1fa2', top: '#ec407a', bottom: '#4a148c', coat: '#311b92', grin: true, scale: 1.25, skin: '#f1c9a0' }, level: 80,
    when: (c, g) => D(g, 'p2_impel_down'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Hee-haw! Candy-boy! You made it out of Impel Down alive — Vanatta! (He poses.) Welcome to my kingdom. Hormones, Newkama Kenpo, Hell Wink — the queen teaches everything to her friends!"',
        choices: [{ text: 'Train with Ivankov', do: (c) => c.open('trainer', { trainer: 'ivankov' }) }, { text: 'Leave', end: true }] },
    } }),
  },

  // =============================================================== KARAKURI
  {
    id: 'p2_baldimore_inventor', name: 'Kitton', title: 'Inventor of Future Land Baldimore', island: 'karakuri', at: { town: 'baldimore', building: 'Baldimore Workshop' },
    look: { hair: 'spiky', hairColor: '#bdbdbd', top: '#607d8b', bottom: '#37474f', goggles: true, skin: '#f1c9a0' }, level: 22,
    marker: (c, g) => (!g.quests.state('p2_baldimore') ? '!' : S(g, 'p2_baldimore') === 'button' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to Future Land Baldimore, birthplace of the genius Dr. Vegapunk! (His goggles steam in the snow.) Everything here is made by hand: cyborg limbs, heated boots, ships that walk. Need repairs? My workshop is open."',
        choices: [
          { text: 'Workshop (ship repairs and upgrades)', do: (c) => c.open('shipwright', {}) },
          { text: 'Tell me about Vegapunk.', if: () => !ctx.quest('p2_baldimore'), next: 'vp' },
          { text: 'I\'ve read the old lab\'s notes.', if: () => at(ctx, 'p2_baldimore', 'button'), next: 'button' },
          { text: 'Leave', end: true },
        ] },
      vp: { text: '"Vegapunk left Karakuri as a boy — but his old laboratory is still here, full of notes nobody can understand. Go and read them. Just... there\'s a big red button in Room 8. Don\'t press the big red button."', onEnter: (c) => c.startQuest('p2_baldimore') },
      button: { text: '"You read them? Then you know: that old lab is a weapon factory waiting to happen. (He hesitates.) ...Did you see the big red button?"',
        choices: [
          { text: 'I pressed it.', next: 'boom' },
          { text: 'I left it alone.', next: 'wise' },
        ] },
      boom: { text: '(Somewhere behind the town, a hill explodes. Snow falls upward for a while.) "...THE NIGHTMARE OF BALDIMORE! AGAIN! (He sighs.) Fine. Keep the notes. At least now nobody can weaponise that lab."',
        onEnter: (c) => { c.game.fx.shake(1.2); c.game.audio?.sfx('explosion'); const p = c.player; if (p) p.hp = Math.max(1, p.hp - p.d.maxHp * 0.3); c.setFlag('p2_pressedButton'); c.complete('p2_baldimore'); } },
      wise: { text: '"Good. Very good. (He relaxes.) Keep the notes — a traveller will use them better than a locked lab ever could."', onEnter: (c) => c.complete('p2_baldimore') },
    } }),
  },

  // =============================================================== NAMAKURA
  {
    id: 'p2_namakura_elder', name: 'Village Elder', title: 'Namakura Island', island: 'namakura', at: { town: 'namakura_village', building: "Village Elder's Hut" },
    look: { hair: 'long', hairColor: '#fafafa', top: '#8d6e63', bottom: '#5d4037', skin: '#a0643a' }, level: 12,
    dialogue: () => ({ start: 'a', nodes: {
      a: { text: '"Traveller! Sit, sit. You have come to the island where the Devil once landed. (He points to the stage in the square.) A skeleton in a top hat fell from the sky. We tied him up to burn him... and then he played music, and we could not stop dancing. Now the whole island sings."',
        choices: [{ text: 'What happened to him?', next: 'b' }, { text: 'Leave', end: true }] },
      b: { text: '"He left one morning, singing about a whale and a promise. They say he tours the world now, as the Soul King. (He smiles.) We never burned anyone again. The devil taught us that much."', next: 'a' },
    } }),
  },

  // ============================================================== RUSUKAINA
  {
    id: 'p2_rayleigh_rk', name: 'Silvers Rayleigh', title: 'Your Haki teacher', island: 'rusukaina', at: { spot: 'rayleigh_camp' }, trainer: 'rayleigh', ai: 'idle',
    look: { hair: 'long', hairColor: '#fafafa', top: '#fafafa', bottom: '#5d4037', coat: '#8d6e63', scarEye: true, swords: 1, skin: '#f1c9a0' }, level: 90,
    when: (c, g) => ON(g, 'p2_rusukaina'),
    marker: (c, g) => (S(g, 'p2_rusukaina') === 'report' ? '?' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (at(ctx, 'p2_rusukaina', 'report')
        ? '"The lord of the plains... fell to you. (He smiles over the campfire.) The beasts will not challenge you now. That is the difference between strength and Haki: they felt it before you struck."'
        : '"Welcome to Rusukaina. Forty-eight seasons a year, five hundred beasts you cannot beat. (He pokes the fire.) Haki is the power of doubt-free will. Go to the plains. Their lord is a monster. Win, and your will has hardened."'),
      choices: [
        { text: 'Train Haki', do: (c) => c.open('trainer', { trainer: 'rayleigh' }) },
        { text: 'It\'s done, Rayleigh.', if: () => at(ctx, 'p2_rusukaina', 'report'), do: (c) => c.complete('p2_rusukaina'), end: true },
        { text: 'Leave', end: true },
      ] },
    } }),
  },
  {
    id: 'p2_rk_king', name: 'Lord of Rusukaina', title: 'The beast that rules the plains', island: 'rusukaina', at: { spot: 'beast_plains' }, faction: 'beast', level: 56, boss: true, hpMul: 1.8, hostile: true, scale: 2.2, bulk: 2,
    look: { hair: 'bald', skin: '#6d4c41', fur: '#4e342e', ears: 'round', muzzle: true, furFace: true, tail: 'fluffy', top: '#5d4037', bottom: '#3e2723', sharpTeeth: true },
    style: 'brawler', moves: ['p2_beast_pounce', 'p2_oars_smash', 'brawl_tackle'], skill: 0.35, breakthrough: 4,
    when: (c, g) => S(g, 'p2_rusukaina') === 'beasts',
  },

  // ============================================================ AMAZON LILY
  {
    id: 'p2_marguerite', name: 'Marguerite', title: 'Kuja warrior', island: 'amazon_lily', at: { town: 'kuja_village', building: 'Kuja Training Grounds' }, trainer: 'kuja',
    look: { ...kujaLook('#fdd835', '#8bc34a'), hair: 'short' }, level: 38, style: 'sniper', weapon: 'gun',
    marker: (c, g) => (S(g, 'p2_amazon_lily') === 'gate' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.char.flags.p2_kujaFriend
          ? '"The Empress favours you! Every Kuja warrior uses Haki — Armament to harden our arrows, Observation to see the enemy\'s next move. I\'ll teach you. Just don\'t laugh at my aim."'
          : at(ctx, 'p2_amazon_lily', 'gate')
            ? '(A blonde warrior aims a snake-bow at your heart.) "Stop right there! No outsider sets foot on Amazon Lily. ...You\'re strange. Are you... a man? We\'ve only read about them in books."'
            : '"Marguerite, Kuja warrior. Amazon Lily is not a place for strangers."'),
        choices: [
          { text: '"I\'m a woman."', if: () => at(ctx, 'p2_amazon_lily', 'gate'), next: 'woman' },
          { text: '"I\'m a man."', if: () => at(ctx, 'p2_amazon_lily', 'gate'), next: 'man' },
          { text: 'Train Haki with the Kuja', if: () => !!ctx.char.flags.p2_kujaFriend, do: (c) => c.open('trainer', { trainer: 'kuja' }) },
          { text: 'Leave', end: true },
        ],
      },
      woman: { text: '"A traveller from outside! (She lowers her bow, delighted.) Then you\'re welcome — mostly. Elder Nyon will want to see you. Her hut is in the village."', onEnter: (c) => { c.setFlag('p2_kujaGuest'); c.stage('p2_amazon_lily', 'nyon'); } },
      man: { text: '"A M-MAN?! (She shrieks. Every bow in the village swings toward you.) Men are forbidden here on pain of death! ...But the law says the Empress judges. You will stand in the Battle Arena!"', onEnter: (c) => { c.setFlag('p2_kujaMan'); c.stage('p2_amazon_lily', 'nyon'); } },
    } }),
  },
  {
    id: 'p2_nyon', name: 'Elder Nyon', title: 'Gloriosa, former Empress of the Kuja', island: 'amazon_lily', at: { town: 'kuja_village', building: "Elder Nyon's Hut" },
    look: { hair: 'bun', hairColor: '#fafafa', top: '#7b1fa2', bottom: '#4a148c', scale: 0.6, skin: '#f1c9a0' }, level: 50,
    marker: (c, g) => (S(g, 'p2_amazon_lily') === 'nyon' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (at(ctx, 'p2_amazon_lily', 'nyon')
          ? '"Nyon. I was Empress once, long ago — before I left to see the world and caught the Love Sickness. (She taps her staff.) The Empress Hancock and her sisters have a secret. They were not always proud. That is all I will say. The Arena waits for you."'
          : '"Nyon. The Kuja have lived on this island in the Calm Belt for centuries. The Sea Kings are our walls. Outsiders bring nothing but trouble — and, now and then, something wonderful."'),
        choices: [
          { text: 'To the Arena.', if: () => at(ctx, 'p2_amazon_lily', 'nyon'), do: (c) => c.stage('p2_amazon_lily', 'arena'), end: true },
          { text: 'Leave', end: true },
        ],
      },
    } }),
  },
  {
    id: 'p2_sandersonia', name: 'Boa Sandersonia', title: 'Gorgon Sister — Hebi Hebi no Mi, Model: Anaconda', island: 'amazon_lily', at: { spot: 'kuja_arena', ox: -2 }, faction: 'pirate', level: 48, boss: true, hpMul: 1.3, hostile: true, scale: 1.25, bulk: 1.3,
    look: { hair: 'long', hairColor: '#43a047', top: '#ffb300', bottom: '#2e7d32', skin: '#f1c9a0', tail: 'thin', fur: '#43a047' },
    style: 'brawler', moves: ['p2_snake_lunge', 'p2_coil_crush', 'brawl_tackle'], haki: { armament: 30, observation: 30 }, skill: 0.5, bounty: 40000000, infamy: true, breakthrough: 3,
    alert: 'Sister, look! An outsider in our arena!', when: (c, g) => S(g, 'p2_amazon_lily') === 'arena',
  },
  {
    id: 'p2_marigold', name: 'Boa Marigold', title: 'Gorgon Sister — Hebi Hebi no Mi, Model: King Cobra', island: 'amazon_lily', at: { spot: 'kuja_arena', ox: 2 }, faction: 'pirate', level: 48, boss: true, hpMul: 1.4, hostile: true, scale: 1.3, bulk: 1.8,
    look: { hair: 'long', hairColor: '#ff8f00', top: '#8e24aa', bottom: '#4a148c', skin: '#f1c9a0', tail: 'thin', fur: '#ff8f00' },
    style: 'brawler', moves: ['p2_snake_lunge', 'p2_coil_crush', 'brawl_headbutt'], haki: { armament: 30, observation: 30 }, skill: 0.45, bounty: 40000000, infamy: true, breakthrough: 3,
    alert: 'You will be turned to stone for your insolence!', when: (c, g) => S(g, 'p2_amazon_lily') === 'arena',
  },
  {
    id: 'p2_hancock', name: 'Boa Hancock', title: '"Pirate Empress" — Warlord of the Sea', island: 'amazon_lily', at: { town: 'kuja_village', building: 'Kuja Castle' }, faction: 'pirate', level: 64, boss: true, hpMul: 1.7, ai: 'guard',
    look: { hair: 'long', hairColor: '#212121', top: '#c62828', bottom: '#fafafa', coat: '#8e0000', skin: '#fdeee4' },
    style: 'black_leg', moves: ['p2_pistol_kiss', 'p2_slave_arrow', 'p2_mero_mellow', 'p2_perfume_femur'], haki: { armament: 60, observation: 55, conqueror: 30 }, skill: 0.7,
    bounty: 80000000, infamy: true, breakthrough: 5, lethal: false, alert: 'Kneel. Even if I insult you, the world will forgive me — because I am beautiful.',
    marker: (c, g) => (S(g, 'p2_amazon_lily') === 'secret' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => {
          if (at(ctx, 'p2_amazon_lily', 'secret')) return '(In the arena, the sisters\' robes tore away... and you saw it on their backs: the Hoof of the Soaring Dragon, the brand of the Celestial Dragons\' slaves. Hancock\'s voice is ice.) "You saw. Every one who has seen it has turned to stone. Why should you be different?"';
          if (ctx.char.flags.p2_kujaFriend) return '"Oh. It\'s you. (She looks away, cheeks faintly pink — or is it the sun?) The Kuja will train you. The ship is at your disposal. ...Do not mistake this for kindness."';
          return '"Who allowed this commoner into my castle? (She leans back so far she is looking down at you from above.) Kneel. Even if I insult you, the world forgives me — because I am beautiful."';
        },
        choices: [
          { text: '"I\'ll never tell a soul. Some things should never have happened to anyone."', if: () => at(ctx, 'p2_amazon_lily', 'secret'), next: 'swear' },
          { text: '"Then turn me to stone — if you can."', if: () => at(ctx, 'p2_amazon_lily', 'secret'), do: (c) => { const h = findActor(c.game, 'p2_hancock'); if (h) aggro(c.game, h); }, end: true },
          { text: 'Take me to Impel Down.', if: () => !!ctx.char.flags.p2_kujaFriend && !ctx.game.quests.isDone('p2_impel_down'), next: 'id' },
          { text: 'Leave', end: true },
        ],
      },
      swear: { text: '(For a long moment nobody breathes. Then Hancock turns away.) "...Marigold. Sandersonia. This one keeps secrets. The Kuja will treat them as a guest." (Later, the sisters tell you everything: the Holy Land, the brands, the Fisher Tiger who set them free.)',
        onEnter: (c) => { c.setFlag('p2_kujaFriend'); c.complete('p2_amazon_lily'); } },
      id: { text: '"Impel Down? The Government summons me to Marineford anyway. (She sighs.) I will take you as far as the Great Prison\'s gate. Hide in my cloak. If anyone asks, you do not exist."',
        onEnter: (c) => { c.setFlag('p2_hancockEscort'); travel(c.game, 'impel_down', { spot: 'surface_gate', banner: ['PERFUME YUDA', 'The Kuja Pirates', 'Two giant sea serpents drag the Empress\'s ship across the Calm Belt. The Sea Kings keep their distance.', 6] }); } },
    } }),
  },
  { id: 'p2_sweet_pea', name: 'Sweet Pea', title: 'Kuja warrior', island: 'amazon_lily', at: { town: 'kuja_village', plaza: true, ox: -3 }, look: kujaLook('#3e2723', '#26a69a'), level: 30, style: 'sniper', weapon: 'gun',
    dialogue: (ctx) => ({ start: 'a', nodes: { a: { text: () => (ctx.char.flags.p2_kujaMan && !ctx.char.flags.p2_kujaFriend ? '"Is it true? Are you really a MAN? Do men have... never mind. Marguerite says we\'re not supposed to talk to you."' : '"Welcome to the Kuja village! Try the snake-meat skewers. The snakes don\'t mind — much."') } } }) },
  { id: 'p2_aphelandra', name: 'Aphelandra', title: 'Kuja warrior (very tall)', island: 'amazon_lily', at: { town: 'kuja_village', plaza: true, ox: 3 }, look: { ...kujaLook('#212121', '#5d4037'), scale: 1.5 }, level: 34, style: 'brawler',
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"..." (Aphelandra is taller than most houses. She looks at you for a long time, then nods once, very seriously.) "Hmn."' } } }) },

  // ========================================================= IMPEL DOWN (surface)
  {
    id: 'p2_id_gate_officer', name: 'Gate Officer', title: 'Impel Down — the Great Prison', island: 'impel_down', faction: 'marine', level: 50, ai: 'idle',
    look: { hair: 'short', hairColor: '#212121', top: '#78909c', bottom: '#37474f', hat: 'marine', hatColor: '#37474f' },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (ctx.char.flags.p2_hancockEscort && !ctx.game.quests.isDone('p2_impel_down')
          ? '(The Empress walks past the gate officer, her long cloak trailing behind her. The officer is too busy staring at her to notice that the cloak has feet.)'
          : '"This is Impel Down, the Great Underwater Prison. Six levels of hell. Nobody gets in without papers — and nobody has ever gotten out." (A Sea King surfaces behind the gate, yawns, and sinks again.)'),
        choices: [
          { text: 'Slip inside under the Empress\'s cloak.', if: () => !!ctx.char.flags.p2_hancockEscort && !ctx.game.quests.isDone('p2_impel_down'), do: (c) => { c.setFlag('p2_infiltrated'); enterPrison(c.game); }, end: true },
          { text: 'Tour the prison (Marine officers only).', if: () => marine(ctx.char), do: (c) => enterPrison(c.game), end: true },
          { text: 'Surrender yourself.', if: () => wanted(ctx.char), next: 'surrender' },
          { text: 'Leave', end: true },
        ],
      },
      surrender: { text: '"You want to be locked up? (He blinks.) With a bounty like yours? ...Guards! Take everything they own. Level One." (Your weapons and berries will be confiscated until you break out.)', choices: [
        { text: 'Walk through the gate.', do: (c) => { if (c.game.sendToImpelDown) c.game.sendToImpelDown(null); }, end: true },
        { text: 'On second thought...', end: true },
      ] },
    } }),
  },

  // =========================================================== IMPEL DOWN (zone)
  {
    id: 'p2_id_buggy', name: 'Buggy the Clown', title: 'Prisoner, Level 1 (Crimson Hell)', island: 'id_level1', at: { spot: 'cell' }, ai: 'idle', bounty: 15000000,
    look: { hair: 'long', hairColor: '#1976d2', nose: 'red', top: '#fafafa', bottom: '#fafafa', skin: '#fafafa', hat: 'captain', hatColor: '#6d4c41' }, level: 30, fruit: 'bara',
    when: (c, g) => !D(g, 'p2_impel_down'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"GYAHAHAHA! Blades can\'t cut me — I\'m a Chop-Chop man! The Blade Forest of Level 1 is a spa for Captain Buggy! (He lowers his voice.) You\'re breaking out? ...Flashy. I know where the hole to Level 2 is. The Blugoris patrol it. Their boss, Saldeath, is tiny and annoying."',
        choices: [{ text: 'Come with me, Buggy.', next: 'b' }, { text: 'Leave him.', end: true }] },
      b: { text: '"Me? Follow YOU? (He looks at the Blugori, then at you.) ...I mean, obviously you\'re following ME. Flashy! Lead on, subordinate!" (Buggy will cause chaos behind you all the way down.)', onEnter: (c) => c.setFlag('p2_buggyFreed') },
    } }),
  },
  {
    id: 'p2_saldeath', name: 'Saldeath', title: 'Chief Guard — commander of the Blugori', island: 'id_level1', at: { spot: 'stairs_down' }, faction: 'marine', level: 42, named: true, hostile: true, scale: 0.75,
    look: { hat: 'horns', hatColor: '#212121', hair: 'short', hairColor: '#212121', top: '#212121', bottom: '#4a148c', skin: '#f1c9a0' }, style: 'brawler', weapon: 'staff', moves: ['brawl_tackle', 'p2_red_demon_whip'], skill: 0.4, lethal: false,
    alert: 'Blugori! Crush the escapee!', when: (c, g) => ON(g, 'p2_impel_down'),
  },
  {
    id: 'p2_id_mr3', name: 'Galdino (Mr. 3)', title: 'Prisoner, Level 2 (Wild Beast Hell)', island: 'id_level2', at: { spot: 'stairs_up' }, ai: 'idle', bounty: 24000000, fruit: 'doru',
    look: { hair: 'spiky', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', skin: '#f1c9a0', goggles: true }, level: 34,
    when: (c, g) => !D(g, 'p2_impel_down'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Hah! A breakout? How ARTISTIC. (He moulds a key out of wax in three seconds flat.) Candle Key. Opens any lock on this level. ...The Sphinx guards the stairs down. It says the names of noodles and it will eat you. Good luck, my canvas."' } } }),
  },
  {
    id: 'p2_basilisk', name: 'Basilisk', title: 'Level 2 guardian (second-in-command)', island: 'id_level2', at: { dx: 0.1, dy: 0 }, faction: 'beast', level: 46, named: true, hostile: true, scale: 2, bulk: 1.6,
    look: { hair: 'bald', skin: '#558b2f', top: '#33691e', bottom: '#827717', fur: '#fbc02d', tail: 'thin', sharpTeeth: true }, style: 'brawler', moves: ['p2_snake_lunge', 'p2_coil_crush'], skill: 0.3,
    when: (c, g) => ON(g, 'p2_impel_down'),
  },
  {
    id: 'p2_sphinx', name: 'Sphinx', title: 'Level 2 guardian — boss of Wild Beast Hell', island: 'id_level2', at: { spot: 'stairs_down' }, faction: 'beast', level: 50, boss: true, hpMul: 1.6, hostile: true, scale: 2.4, bulk: 1.8,
    look: { hair: 'long', hairColor: '#8d6e63', skin: '#f1c9a0', fur: '#fbc02d', ears: 'round', tail: 'fluffy', top: '#fbc02d', bottom: '#f9a825' },
    style: 'brawler', moves: ['p2_beast_pounce', 'p2_oars_smash', 'brawl_tackle'], skill: 0.35, breakthrough: 3,
    alert: 'RAMEN! UDON! ...ITADAKIMASU!', barks: ['Soba!', 'Tanmen!', 'Thanks for the meal!'], when: (c, g) => ON(g, 'p2_impel_down'),
  },
  {
    id: 'p2_id_bon_clay', name: 'Bentham (Mr. 2 Bon Clay)', title: 'Prisoner, Level 3 (Starvation Hell)', island: 'id_level3', at: { spot: 'stairs_up' }, ai: 'idle', fruit: 'mane',
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', skin: '#f1c9a0' }, level: 36,
    when: (c, g) => !D(g, 'p2_impel_down'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Un, deux, trois! A friend breaking out of hell? The way of the okama is the way of friendship! (He strikes a swan pose on one leg, starving.) Listen: prisoners on Level 5 vanish — the guards call it the Oni Sleeve Pull. I think they go somewhere... fabulous."' } } }),
  },
  {
    id: 'p2_minotaurus', name: 'Minotaurus', title: 'Jailer Beast', island: 'id_level3', at: { spot: 'stairs_down' }, faction: 'marine', level: 50, boss: true, hpMul: 1.5, hostile: true, scale: 2, bulk: 1.8,
    look: { hair: 'bald', skin: '#5d4037', hat: 'horns', hatColor: '#efebe9', fur: '#3e2723', ears: 'round', muzzle: true, top: '#4e342e', bottom: '#212121' },
    style: 'brawler', moves: ['p2_minotaur_club', 'brawl_tackle'], skill: 0.35, lethal: false, breakthrough: 3,
    alert: 'MOOOOOO!', when: (c, g) => ON(g, 'p2_impel_down'),
  },
  {
    id: 'p2_magellan', name: 'Chief Warden Magellan', title: 'Doku Doku no Mi — the strongest man in Impel Down', island: 'id_level4', at: { spot: 'warden_office' }, faction: 'marine', level: 98, boss: true, hpMul: 2.6, hostile: true, scale: 1.4, bulk: 1.7,
    look: { hair: 'spiky', hairColor: '#212121', hat: 'horns', hatColor: '#4a148c', top: '#4a148c', bottom: '#311b92', coat: '#212121', skin: '#e0ac7e' },
    fruit: 'doku', fruitMastery: 95, moves: ['doku_fist', 'doku_hydra', 'doku_venom'], haki: { armament: 40 }, skill: 0.6, lethal: false, breakthrough: 8, bounty: 150000000,
    alert: 'Hydra. Nobody escapes Impel Down on my watch.', barks: ['Hydra!', 'Venom Demon: Hell\'s Judgement!', '(He heads off to the toilet for the ninth time today.)'],
    when: (c, g) => ['level4', 'newkama', 'escape'].includes(S(g, 'p2_impel_down')),
  },
  {
    id: 'p2_domino', name: 'Domino', title: 'Head Jailer', island: 'id_level4', at: { spot: 'warden_office', ox: 3 }, faction: 'marine', level: 44, named: true, hostile: true,
    look: { hair: 'long', hairColor: '#fdd835', top: '#212121', bottom: '#212121', goggles: true }, style: 'sniper', weapon: 'gun', moves: ['snipe_explode', 'snipe_tabasco'], skill: 0.5, lethal: false,
    when: (c, g) => ON(g, 'p2_impel_down'),
  },
  {
    id: 'p2_sadi', name: 'Sadi-chan', title: 'Chief Guard — mistress of the Jailer Beasts', island: 'id_level4', at: { spot: 'stairs_down' }, faction: 'marine', level: 48, boss: true, hpMul: 1.2, hostile: true,
    look: { hair: 'long', hairColor: '#212121', hat: 'horns', hatColor: '#212121', top: '#212121', bottom: '#212121', skin: '#fdeee4' },
    style: 'brawler', moves: ['p2_red_demon_whip', 'brawl_knee'], skill: 0.5, lethal: false, breakthrough: 3,
    alert: 'Ahhn~! More prisoners to discipline!', when: (c, g) => ON(g, 'p2_impel_down'),
  },
  {
    id: 'p2_ivankov_id', name: 'Emporio Ivankov', title: 'Queen of Newkama Land (Revolutionary Army)', island: 'id_newkama', at: { town: 'newkama_land', building: "Ivankov's Party Hall" }, trainer: 'ivankov',
    look: { hair: 'afro', hairColor: '#7b1fa2', top: '#ec407a', bottom: '#4a148c', coat: '#311b92', grin: true, scale: 1.25, skin: '#f1c9a0' }, level: 80, style: 'okama_kenpo',
    when: (c, g) => !D(g, 'p2_impel_down'),
    marker: (c, g) => (S(g, 'p2_impel_down') === 'newkama' ? '!' : null),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: {
        text: () => (at(ctx, 'p2_impel_down', 'newkama')
          ? '"Hee-haw! Welcome to Newkama Land, the paradise inside hell! (A spotlight finds you. Two hundred okama cheer.) You came through Magellan\'s poison? Vanatta! Candy-boy, you need Tension Hormones. They save you now... and take ten years off your life later. Hee-haw!"'
          : '"Hee-haw! Candy-boy! Newkama Land welcomes everyone with the heart to party. Train with the queen, or dance!"'),
        choices: [
          { text: 'Give me the Tension Hormones.', if: () => at(ctx, 'p2_impel_down', 'newkama'), next: 'hormones' },
          { text: 'Train with Ivankov (Newkama Kenpo)', do: (c) => c.open('trainer', { trainer: 'ivankov' }) },
          { text: 'Leave', end: true },
        ],
      },
      hormones: { text: '"Take them. (A syringe the size of your arm.) Use them only when death is certain. Now: EVERYONE! We are breaking out! Newkama Land rises! Inazuma, cut us a staircase! To the Main Gate — and to Marineford!" (The breakout begins.)',
        onEnter: (c) => { c.give('tension_hormone', 1); c.stage('p2_impel_down', 'escape'); } },
    } }),
  },
  {
    id: 'p2_inazuma', name: 'Inazuma', title: 'Revolutionary — Choki Choki no Mi', island: 'id_newkama', at: { town: 'newkama_land', plaza: true, ox: 3 }, ai: 'idle',
    look: { hair: 'short', hairColor: '#e53935', top: '#212121', bottom: '#212121', skin: '#f1c9a0' }, level: 55,
    when: (c, g) => !D(g, 'p2_impel_down'),
    dialogue: () => ({ start: 'a', nodes: { a: { text: '(Inazuma snips a stone wall into a neat staircase with a pair of hands that are scissors.) "Iva-san has waited years for someone to start a breakout. Do not disappoint the queen."' } } }),
  },
  {
    id: 'p2_rouge_bonbon', name: 'Rouge Bonbon', title: 'Newkama warrior', island: 'id_newkama', at: { town: 'newkama_land', building: 'Newkama Bar' }, style: 'okama_kenpo',
    look: { hair: 'pompadour', hairColor: '#ff4081', top: '#ce93d8', bottom: '#6a1b9a', bulk: 1.3, skin: '#e0ac7e' }, bulk: 1.3, level: 44,
    recruit: { role: 'fighter', fighter: true, requires: (c, g) => ['escape', 'gate'].includes(S(g, 'p2_impel_down')), pitch: '"A breakout AND a pirate crew? Hee-haw! (She cracks her knuckles in a ballgown.) Newkama Kenpo, at your service, candy-captain!"' },
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: '"Welcome to the Newkama Bar, darling! We steal newspapers from the jailers\' bins and watch them on a stolen snail. (She pours something pink.) Twelve years in hell, and I\'ve never had a better party."',
        choices: [{ text: 'Buy a drink', do: (c) => c.open('shop', { shop: 'p2_newkama_bar', building: { name: 'Newkama Bar', role: 'bar' } }) }, { text: 'Leave', end: true }] },
    } }),
  },
  {
    id: 'p2_hannyabal', name: 'Vice Warden Hannyabal', title: '"I will be Chief Warden!"', island: 'id_level1', at: { spot: 'main_gate' }, faction: 'marine', level: 55, boss: true, hpMul: 1.5, hostile: true,
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#37474f', hat: 'captain', hatColor: '#fafafa', skin: '#e0ac7e', bulk: 1.2 },
    style: 'brawler', weapon: 'staff', moves: ['p2_hannyabal_halberd', 'brawl_tackle'], skill: 0.5, lethal: false, breakthrough: 4, bounty: 30000000,
    alert: 'Over my dead body! This is MY prison! Well — it will be!', when: (c, g) => S(g, 'p2_impel_down') === 'escape',
  },
  {
    id: 'p2_id_jinbe', name: 'Jinbe', title: 'Warlord of the Sea (imprisoned) — "Knight of the Sea"', island: 'id_level6', at: { spot: 'deepest_cell' }, race: 'fishman', ai: 'idle',
    look: { hair: 'long', hairColor: '#212121', skin: '#1565c0', top: '#ff7043', bottom: '#fafafa', bulk: 1.6 }, bulk: 1.6, level: 85,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"I refused to fight Whitebeard, so they took my title and chained me here. (Jinbe sits in perfect stillness beside an empty cell.) Portgas D. Ace was held in this cell until yesterday. They moved him to Marineford for the execution. If you are going there... I will follow."' } } }),
  },
  {
    id: 'p2_id_crocodile', name: 'Sir Crocodile', title: 'Former Warlord (Level 6 prisoner)', island: 'id_level6', at: { spot: 'deepest_cell', ox: 4 }, ai: 'idle', bounty: 81000000,
    look: { hair: 'short', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', skin: '#f1c9a0', scar: true, hand: '#ffd54f' }, level: 80,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '"Kuhahaha. A rookie on Level 6. (The former Warlord doesn\'t get up.) Open this cell and I\'ll show you what a desert does to a prison. Or don\'t — I\'ve got nothing but time down here."' } } }),
  },
  {
    id: 'p2_shiryu', name: 'Shiryu of the Rain', title: 'Former Head Jailer (Level 6 death row)', island: 'id_level6', at: { spot: 'deepest_cell', ox: -4 }, ai: 'idle',
    look: { hair: 'long', hairColor: '#212121', top: '#fafafa', bottom: '#fafafa', skin: '#bcaaa4', swords: 1 }, level: 88,
    dialogue: () => ({ start: 'a', nodes: { a: { text: '(A tall man in prisoner stripes smokes a cigarette he should not have.) "I used to guard this level. Then I got bored and cut down the prisoners. Now I\'m bored in here instead. ...Someone will come for me one day. It won\'t be you."' } } }),
  },
);

function enterPrison(game) {
  game.ui.fade(true);
  setTimeout(() => { game.enterZoneById?.('impel_down'); game.ui.fade(false); }, 700);
}

// ------------------------------------------------ a few more NPCs (war, Momoiro)
npcs.push(
  {
    id: 'p2_whitebeard', name: 'Edward Newgate', title: '"Whitebeard" — the Strongest Man in the World', island: 'marineford', at: { spot: 'oris_plaza', ox: 9, oy: 3 }, faction: 'pirate', level: 120, ai: 'idle', invulnerable: true, scale: 2.1, bulk: 1.6,
    look: { hair: 'short', hairColor: '#e0e0e0', top: '#fafafa', bottom: '#1a237e', coat: '#fafafa', skin: '#e0ac7e', scarEye: true },
    when: (c, g) => warOn(g, 'plaza', 'vice_admiral'),
    dialogue: (ctx) => ({ start: 'a', nodes: {
      a: { text: () => (marine(ctx.char)
        ? '"Gurarara... A Marine brat, standing in front of me? (The air itself cracks around his fist.) Ace is my son. Every man who stands between us today is standing in an earthquake. Move."'
        : '"Gurarara! A rookie from Paradise came to my war? (He grins down from twice your height.) Ace is my son. Anyone who helps bring him home is family for a day. Don\'t die before he\'s free, brat!"') },
    } }),
  },
  {
    id: 'p2_ace', name: 'Portgas D. Ace', title: 'Second Division Commander of the Whitebeard Pirates (in chains)', island: 'marineford', at: { spot: 'execution_platform' }, faction: 'pirate', level: 80, ai: 'idle', invulnerable: true,
    look: { hair: 'short', hairColor: '#212121', hat: 'cowboy', hatColor: '#ff7043', top: '#212121', bottom: '#212121', skin: '#e0ac7e' }, fruit: 'mera',
    when: (c, g) => warOn(g, 'plaza', 'vice_admiral'),
    dialogue: () => ({ start: 'a', nodes: {
      a: { text: '(Seastone cuffs, the platform, two executioners with crossed blades. Ace looks down at the plaza full of ships and flags.) "Why did they all come... Pops. Everyone. I\'m a fool." (He sees you.) "You! Whoever you are — don\'t throw your life away for mine!"' },
    } }),
  },
  {
    id: 'p2_candidate_leader', name: 'Champion Lulumina', title: 'Top of the Kamabakka Candidates', island: 'momoiro', at: { town: 'kamabakka', plaza: true, ox: 4 }, faction: 'rival', level: 44, named: true, hostile: true, bulk: 1.4,
    look: { hair: 'pompadour', hairColor: '#f06292', top: '#f8bbd0', bottom: '#ad1457', skin: '#e0ac7e', bulk: 1.4 }, style: 'okama_kenpo', moves: ['okama_pirouette', 'okama_swan_dash', 'okama_hell_wink'], skill: 0.5,
    alert: 'Want the recipes, candy-boy? Dance for them!', barks: ['Swan Arabesque!', 'Fabulous!'],
    when: (c, g) => S(g, 'p2_kamabakka') === 'candidates',
  },
);

// ------------------------------------------------------------------ groups
const ON_TB = (c, g) => ON(g, TB_Q);
const inmate = (c) => !marine(c) || !!c.flags.imprisoned;
const lk = (top, bottom, extra = {}) => ({ top, bottom, ...extra });
const FRANKY_FAMILY = [
  ['bandit', 26, { name: 'Franky Family Dismantler', look: lk('#ff7043', '#1565c0', { hat: 'goggles' }) }],
  ['bandit', 26, { name: 'Franky Family Dismantler', look: lk('#ffb74d', '#1565c0', { hair: 'pompadour', hairColor: '#212121' }) }],
  ['brute', 28, { name: 'Square Sister Kiwi', look: lk('#f06292', '#212121', { hair: 'long', hairColor: '#29b6f6' }) }],
  ['brute', 28, { name: 'Square Sister Mozu', look: lk('#f06292', '#212121', { hair: 'long', hairColor: '#fdd835' }) }],
];
const MASKED = [
  ['cp', 38, { name: 'Masked Assassin', look: lk('#212121', '#212121', { hat: 'bandana', hatColor: '#212121' }) }],
  ['cp', 38, { name: 'Masked Assassin', look: lk('#212121', '#212121', { hat: 'bandana', hatColor: '#212121' }) }],
];
const CANDY = [
  ['pirate', 34, { name: 'Candy Pirate', look: lk('#ff80ab', '#6a1b9a', { hat: 'bandana', hatColor: '#f06292' }) }],
  ['pirate', 34, { name: 'Candy Pirate', look: lk('#f48fb1', '#6a1b9a', { hat: 'bandana', hatColor: '#ad1457' }) }],
  ['pirate_gunner', 34, { name: 'Candy Pirate Gunner', look: lk('#ce93d8', '#4a148c', { hat: 'tricorne' }) }],
];
const EL_GUARDS = [
  ['marine', 36, { name: 'Enies Lobby Guard' }], ['marine', 36, { name: 'Enies Lobby Guard' }], ['marine_rifle', 36, { name: 'Enies Lobby Rifleman' }],
];
const EL_COURT = [
  ['marine', 38, { name: 'Enies Lobby Guard' }], ['marine_officer', 40, { name: 'Enies Lobby Captain' }], ['cp', 40, { name: 'CP Agent' }],
];
const BUSTER = [
  ['marine', 44, { name: 'Buster Call Marine' }], ['marine', 44, { name: 'Buster Call Marine' }],
  ['marine_rifle', 44, { name: 'Buster Call Rifleman' }], ['marine_officer', 48, { name: 'Buster Call Officer' }],
];
const zlook = (top, extra = {}) => ({ top, bottom: '#3e2723', skin: '#9e9d89', scar: true, ...extra });
const FOXY_CREW = [
  ['brute', 34, { name: 'Hamburg', look: lk('#ff7043', '#5d4037', { hair: 'mohawk', hairColor: '#212121' }), bulk: 1.5 }],
  ['pirate', 33, { name: 'Porche', look: lk('#f48fb1', '#f8bbd0', { hair: 'long', hairColor: '#ff8a65' }), style: 'brawler', weapon: null, moves: ['brawl_knee'] }],
  ['pirate', 30, { name: 'Foxy Pirate', look: lk('#212121', '#5d4037', { hat: 'bandana', hatColor: '#212121' }) }],
];
const MACRO_CREW = [
  ['fishman_thug', 32, { name: 'Gyaro', look: { skin: '#90a4ae', fin: true, top: '#6d4c41' } }],
  ['fishman_thug', 32, { name: 'Tansui', look: { skin: '#80cbc4', fin: true, top: '#5d4037' } }],
  ['fishman_thug', 30, { name: 'Macro Pirate', look: { skin: '#78909c', fin: true, top: '#4e342e' } }],
];
const MF_MARINES = [
  ['marine', 50, { name: 'Marine Headquarters Soldier' }], ['marine', 50, { name: 'Marine Headquarters Soldier' }],
  ['marine_rifle', 50, { name: 'Marine Rifleman' }], ['marine_officer', 54, { name: 'Headquarters Captain' }],
];
const MF_PIRATES = [
  ['pirate', 50, { name: 'Whitebeard Pirate', look: lk('#5d4037', '#3e2723', { hat: 'bandana', hatColor: '#1a237e' }) }],
  ['pirate', 50, { name: 'Whitebeard Pirate', look: lk('#6d4c41', '#3e2723', { hat: 'bandana', hatColor: '#1a237e' }) }],
  ['fishman_thug', 50, { name: 'Allied Fish-Man Pirate' }], ['brute', 52, { name: 'Allied New World Captain' }],
];
const HUMANDRILL = (n) => ['gorilla', 44, { name: 'Humandrill', style: 'ittoryu', weapon: 'sword', moves: ['itto_whirl', 'itto_iai'], look: { skin: '#795548', fur: '#5d4037', hairColor: '#5d4037', top: '#6d4c41', bottom: '#5d4037', ears: 'round', furFace: true, muzzle: true, hair: 'bald', swords: 1 }, hpMul: 0.8 + n * 0.05 }];
const CANDIDATES = [
  ['brute', 40, { name: 'Kamabakka Candidate', style: 'okama_kenpo', moves: ['okama_pirouette', 'okama_swan_dash'], look: lk('#f8bbd0', '#ec407a', { hair: 'afro', hairColor: '#ff80ab' }) }],
  ['brute', 40, { name: 'Kamabakka Candidate', style: 'okama_kenpo', moves: ['okama_pirouette', 'okama_swan_dash'], look: lk('#e1bee7', '#8e24aa', { hair: 'pompadour', hairColor: '#ce93d8' }) }],
];

const groups = [
  // Water 7 and the sea-train towns
  { island: 'water_7', spot: 'franky_house', radius: 6, enemies: FRANKY_FAMILY, when: (c, g) => S(g, 'p2_cp9_conspiracy') === 'franky' },
  { island: 'water_7', spot: 'galley_la', radius: 5, enemies: MASKED, when: (c, g) => S(g, 'p2_cp9_conspiracy') === 'masks' },
  { island: 'st_poplar', spot: 'poplar_harbor', radius: 6, enemies: CANDY, when: (c, g) => S(g, 'p2_candy_pirates') === 'candy' },
  // Enies Lobby
  { island: 'enies_lobby', spot: 'main_gate', radius: 5, enemies: EL_GUARDS, when: (c, g) => S(g, 'p2_enies_lobby') === 'main_gate' && !c.flags.p2_giantsTruth },
  { island: 'enies_lobby', spot: 'courtyard', radius: 7, enemies: EL_COURT, when: (c, g) => ['courthouse', 'keys'].includes(S(g, 'p2_enies_lobby')) },
  { island: 'enies_lobby', spot: 'courtyard', radius: 8, enemies: BUSTER, when: (c, g) => S(g, 'p2_enies_lobby') === 'buster_call' },
  // Thriller Bark: Moria's zombies (while the ship still has a master)
  { island: 'thriller_bark', spot: 'graveyard', radius: 7, when: ON_TB, enemies: [
    ['swordsman', 40, { name: 'General Zombie Jigoro of the Wind', faction: 'zombie', look: zlook('#37474f', { hat: 'headband', hatColor: '#212121', swords: 2 }) }],
    ['zombie', 36, { name: 'Soldier Zombie', look: zlook('#4e342e') }], ['zombie', 36, { name: 'Soldier Zombie', look: zlook('#5d4037') }],
  ] },
  { island: 'thriller_bark', spot: 'wonder_garden', radius: 5, when: ON_TB, enemies: [
    ['zombie', 38, { name: 'Kumashi (zombie teddy bear)', look: { skin: '#f8bbd0', fur: '#f8bbd0', ears: 'round', top: '#f8bbd0', bottom: '#f48fb1', hair: 'bald', muzzle: true }, bulk: 1.3 }],
    ['zombie', 34, { name: 'Surprise Zombie', look: zlook('#6a1b9a') }],
  ] },
  { island: 'thriller_bark', spot: 'dead_forest', radius: 7, when: ON_TB, enemies: [
    ['beast', 40, { name: 'Cerberus (three-headed zombie hound)', faction: 'zombie', look: { skin: '#607d8b', fur: '#455a64', hair: 'bald', ears: 'pointy', muzzle: true, tail: 'fluffy', top: '#455a64', bottom: '#37474f' } }],
    ['zombie', 38, { name: 'General Zombie Tararan', look: zlook('#212121', { hair: 'spiky', hairColor: '#212121' }), moves: ['brawl_tackle', 'brawl_knee'] }],
  ] },
  { island: 'thriller_bark', spot: 'mast_hall', radius: 6, when: ON_TB, enemies: [['zombie', 36, { name: 'Wild Zombie', look: zlook('#3e2723') }], ['zombie', 36, { name: 'Wild Zombie', look: zlook('#263238') }]] },
  // Spa Island and Sabaody
  { island: 'spa_island', spot: 'hot_springs', radius: 5, enemies: FOXY_CREW, when: (c, g) => S(g, 'p2_spa_foxy') === 'foxy' },
  { island: 'sabaody', spot: 'grove_13', radius: 6, enemies: MACRO_CREW, when: (c, g) => S(g, 'p2_sabaody_auction') === 'macro' },
  { island: 'sabaody', spot: 'grove_1', radius: 7, enemies: [['marine', 44, { name: 'Marine (auction house siege)' }], ['marine', 44, { name: 'Marine (auction house siege)' }], ['marine_rifle', 44, { name: 'Marine Rifleman' }]],
    when: (c, g) => S(g, 'p2_sabaody_auction') === 'kizaru' },
  // Marineford: sentries for wanted pirates, and the war itself (by side)
  { island: 'marineford', spot: 'oris_plaza', radius: 8, enemies: MF_MARINES.slice(0, 3), when: (c, g) => wanted(c) && !warOn(g, 'vice_admiral', 'akainu') },
  { island: 'marineford', spot: 'oris_plaza', radius: 10, enemies: MF_MARINES, when: (c, g) => warOn(g, 'vice_admiral', 'akainu') && !marine(c) },
  { island: 'marineford', spot: 'oris_plaza', radius: 10, enemies: MF_PIRATES, when: (c, g) => warOn(g, 'vice_admiral') && marine(c) },
  // the islands Kuma sent them to
  { island: 'kuraigana', spot: 'humandrill_woods', radius: 8, enemies: [HUMANDRILL(0), HUMANDRILL(1), HUMANDRILL(2)], when: (c, g) => !D(g, 'p2_kuraigana_trial') },
  { island: 'boin', spot: 'boin_depths', radius: 8, enemies: [['beast', 40, { name: 'Boin Hunting Boar' }], ['tiger', 42, { name: 'Boin Jungle Tiger' }]] },
  { island: 'momoiro', dx: 0.02, dy: 0.1, radius: 6, enemies: CANDIDATES, when: (c, g) => S(g, 'p2_kamabakka') === 'candidates' },
  { island: 'rusukaina', spot: 'beast_plains', radius: 9, enemies: [['tiger', 50, { name: 'Rusukaina Tiger' }], ['gorilla', 50, { name: 'Rusukaina Ape' }], ['beast', 50, { name: 'Rusukaina Boar', hpMul: 1.5 }]] },
  // Impel Down (zone levels): only for prisoners and intruders, never for a Marine on a tour
  { island: 'id_level1', dx: 0.2, dy: 0, radius: 8, enemies: [['gorilla', 44, { name: 'Blugori', faction: 'marine', look: { skin: '#5c6bc0', fur: '#3949ab', hairColor: '#3949ab', top: '#3949ab', bottom: '#283593', ears: 'round', furFace: true, muzzle: true, hair: 'bald' } }], ['gorilla', 44, { name: 'Blugori', faction: 'marine', look: { skin: '#5c6bc0', fur: '#3949ab', hairColor: '#3949ab', top: '#3949ab', bottom: '#283593', ears: 'round', furFace: true, muzzle: true, hair: 'bald' } }]],
    when: (c, g) => inmate(c) && !D(g, 'p2_impel_down') },
  { island: 'id_level1', spot: 'main_gate', radius: 6, enemies: [['marine', 48, { name: 'Impel Down Jailer', look: lk('#78909c', '#37474f', { hat: 'marine', hatColor: '#37474f' }) }], ['marine', 48, { name: 'Impel Down Jailer', look: lk('#78909c', '#37474f', { hat: 'marine', hatColor: '#37474f' }) }], ['marine_rifle', 48, { name: 'Jailer Rifleman', look: lk('#78909c', '#37474f', { hat: 'marine', hatColor: '#37474f' }) }]],
    when: (c, g) => S(g, 'p2_impel_down') === 'escape' },
  { island: 'id_level2', dx: -0.2, dy: 0.1, radius: 8, enemies: [['tiger', 46, { name: 'Manticore' }], ['beast', 44, { name: 'Puzzle Scorpion', look: { skin: '#8d6e63', fur: '#6d4c41', top: '#5d4037', bottom: '#4e342e', hair: 'bald', tail: 'thin' } }]],
    when: (c, g) => inmate(c) && !D(g, 'p2_impel_down') },
  { island: 'id_level3', dx: 0, dy: 0, radius: 8, enemies: [['marine', 46, { name: 'Impel Down Jailer' }], ['marine_rifle', 46, { name: 'Jailer Rifleman' }]], when: (c, g) => inmate(c) && !D(g, 'p2_impel_down') },
  { island: 'id_level4', dx: -0.1, dy: 0.2, radius: 8, enemies: [
    ['brute', 50, { name: 'Minokoala (Jailer Beast)', faction: 'marine', look: { skin: '#90a4ae', fur: '#78909c', ears: 'round', muzzle: true, hat: 'horns', hatColor: '#efebe9', top: '#607d8b', bottom: '#455a64', hair: 'bald' } }],
    ['brute', 50, { name: 'Minozebra (Jailer Beast)', faction: 'marine', look: { skin: '#eceff1', fur: '#212121', ears: 'round', muzzle: true, hat: 'horns', hatColor: '#efebe9', top: '#eceff1', bottom: '#212121', hair: 'mohawk', hairColor: '#212121' } }],
    ['brute', 50, { name: 'Minorhinoceros (Jailer Beast)', faction: 'marine', look: { skin: '#9e9e9e', ears: 'round', muzzle: true, hat: 'horns', hatColor: '#efebe9', top: '#757575', bottom: '#616161', hair: 'bald' } }],
  ], when: (c, g) => inmate(c) && !D(g, 'p2_impel_down') },
  { island: 'id_level5', dx: 0, dy: 0, radius: 9, enemies: [0, 1, 2].map(() => ['beast', 50, { name: 'Freezing Hell Wolf', look: { skin: '#eceff1', fur: '#fafafa', ears: 'pointy', muzzle: true, tail: 'fluffy', top: '#eceff1', bottom: '#cfd8dc', hair: 'bald' } }]),
    when: (c, g) => inmate(c) && !D(g, 'p2_impel_down') },
];

// ================================================================== quests
const spawnHere = (g, grp) => (g.spawner?.populated.has(grp.island) ? spawnGroup(g, grp) : []);
const summon = (g, id, hostile) => { const a = findActor(g, id) || spawnNow(g, id); if (a && hostile) aggro(g, a); return a; };
const bannerG = (g, t, s, txt, sec = 6) => g.ui.banner(t, s, txt, sec);
/** Stage onStart guard: if this stage's foes were already beaten, move on (deferred, safe inside onStart). */
const skipBeaten = (qid, stageId, ids, n = 1) => (ctx, g) => {
  const c = g.state?.char;
  if (!c || ids.filter((id) => beat(c, id)).length < n) return false;
  setTimeout(() => { if (g.quests.stageId(qid) === stageId) g.quests.next(qid); }, 0);
  return true;
};
const W7_COVERS = ['p2_lucci_w7', 'p2_kaku_w7', 'p2_kalifa_w7', 'p2_blueno'];
const CP9_FIVE = ['p2_jabra', 'p2_kumadori', 'p2_fukurou', 'p2_kalifa', 'p2_kaku'];

const quests = [
  // ----------------------------------------------------------------- Water 7
  { id: 'p2_cp9_conspiracy', name: 'The Galley-La Assassins', island: 'water_7', kind: 'story',
    summary: 'The Franky Family stole your rudder, someone threatened Mayor Iceburg, and men in black suits are asking about blueprints. Water 7 is hiding something.',
    stages: [
      { id: 'franky', desc: 'Get your rudder back: beat Zambai of the Franky Family at the Franky House on Back Street (south Water 7).', goal: { type: 'defeat', npc: 'p2_zambai' },
        onStart: (ctx, g) => spawnHere(g, { island: 'water_7', spot: 'franky_house', radius: 6, enemies: FRANKY_FAMILY }) },
      { id: 'iceburg', desc: 'Tell Mayor Iceburg at Galley-La Company Headquarters (Main Street) what the Franky Family said.' },
      { id: 'night', desc: 'Keep watch on the grounds of Galley-La headquarters after dark. Whoever threatens the mayor comes at night.', goal: { type: 'event', event: 'p2_w7_assault' } },
      { id: 'masks', desc: 'Masked assassins have broken into Galley-La headquarters! Defeat the two leaders.', goal: { type: 'defeat', any: ['p2_blueno_mask', 'p2_kalifa_mask'], count: 2 },
        onStart: (ctx, g) => {
          bannerG(g, 'NIGHT ASSAULT', 'Galley-La Headquarters', 'Masked figures pour over the walls. A bull-horned giant steps out of thin air; a woman in black trails soap bubbles. Somewhere inside, the mayor has been shot.', 6);
          summon(g, 'p2_blueno_mask', true); summon(g, 'p2_kalifa_mask', true);
          spawnHere(g, { island: 'water_7', spot: 'galley_la', radius: 5, enemies: MASKED, aggro: true });
        },
        onComplete: (ctx, g) => {
          const c = g.state?.char; if (c) c.flags.p2_cp9Unmasked = true;
          for (const id of W7_COVERS) despawn(g, id);
          bannerG(g, 'THE MASKS COME OFF', 'CP9', 'Blueno the bartender. Kalifa the secretary. And behind them, on the roof: Lucci and Kaku — carrying Franky away in chains. "Cipher Pol No. 9. Sorry, Paulie."', 7);
        } },
      { id: 'truth', desc: 'Talk to the wounded Mayor Iceburg at Galley-La headquarters.' },
    ],
    rewards: { berries: 60000, points: 2, items: [['p2_cp9_mask', 1]] } },

  { id: 'p2_enies_lobby', name: 'Declaration of War on Enies Lobby', island: 'enies_lobby', kind: 'story',
    summary: 'CP9 dragged Franky and the Pluton blueprints to Enies Lobby, the Judicial Island. Beyond it: the Gates of Justice, and Impel Down. Stop them first.',
    stages: [
      { id: 'rocketman', island: 'water_7', desc: 'The Aqua Laguna is hitting Water 7. Ride the Rocketman from Kokoro\'s Shift Station (east shore) — or brave the storm and sail — to Enies Lobby.', goal: { type: 'reach', island: 'enies_lobby' },
        onStart: (ctx, g) => bannerG(g, 'AQUA LAGUNA', 'Water 7', 'A tidal wave taller than the city is coming. The whole of Water 7 flees to high ground. The Puffing Tom has already left for Enies Lobby.', 6) },
      { id: 'main_gate', desc: 'Get through the Main Gate on the west side of Enies Lobby, guarded by the giant Oimo. (If you have been to Little Garden, he might listen.)', goal: { type: 'defeat', npc: 'p2_oimo' },
        onStart: (ctx, g) => {
          const c = g.state?.char;
          if (c?.flags.p2_giantsTruth) { setTimeout(() => { if (g.quests.stageId('p2_enies_lobby') === 'main_gate') g.quests.setStage('p2_enies_lobby', 'courthouse'); }, 0); return; }
          if (!skipBeaten('p2_enies_lobby', 'main_gate', ['p2_oimo'])(ctx, g)) spawnHere(g, { island: 'enies_lobby', spot: 'main_gate', radius: 5, enemies: EL_GUARDS });
        } },
      { id: 'courthouse', desc: 'Storm the Courthouse in the middle of the island and defeat the three-headed judge Baskerville.', goal: { type: 'defeat', npc: 'p2_baskerville' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_enies_lobby', 'courthouse', ['p2_baskerville'])(ctx, g)) spawnHere(g, { island: 'enies_lobby', spot: 'courtyard', radius: 7, enemies: EL_COURT }); } },
      { id: 'keys', desc: 'Each CP9 agent carries a key to Franky\'s cuffs. Defeat three of Jabra, Kumadori, Fukurou, Kalifa and Kaku around the Tower of Justice.', goal: { type: 'defeat', any: CP9_FIVE, count: 3 },
        onStart: (ctx, g) => {
          if (skipBeaten('p2_enies_lobby', 'keys', CP9_FIVE, 3)(ctx, g)) return;
          for (const id of CP9_FIVE) summon(g, id);
          bannerG(g, 'CP9', 'The Tower of Justice', '"Doriki... 2,900. 2,200. 820." Five agents who mastered the Six Powers scatter through the island, each holding a key. Spandam laughs from the tower.', 6);
        } },
      { id: 'lucci', desc: 'Rob Lucci is dragging Franky across the Bridge of Hesitation toward the Gates of Justice (east of the Tower). Defeat him.', goal: { type: 'defeat', npc: 'p2_lucci' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_enies_lobby', 'lucci', ['p2_lucci'])(ctx, g)) { summon(g, 'p2_lucci'); bannerG(g, 'THE BRIDGE OF HESITATION', 'Rob Lucci', '"This is where criminals hesitate, one last time, before the Gates of Justice." Spandam presses the Golden Den Den Mushi by mistake. Somewhere, ten battleships turn toward Enies Lobby.', 7); } } },
      { id: 'buster_call', island: 'water_7', desc: 'BUSTER CALL! Five Vice Admirals are shelling Enies Lobby to dust. Escape — take the Puffing Tom from Day Station, or sail — back to Water 7.', goal: { type: 'reach', island: 'water_7' },
        onStart: (ctx, g) => {
          bannerG(g, 'BUSTER CALL', 'Enies Lobby', 'Ten battleships, five Vice Admirals: the island is being erased — with its own soldiers still on it. Run!', 7);
          spawnHere(g, { island: 'enies_lobby', spot: 'courtyard', radius: 8, enemies: BUSTER });
        } },
      { id: 'report', island: 'water_7', desc: 'Return to Mayor Iceburg at Galley-La headquarters.' },
    ],
    rewards: { berries: 150000, points: 3, bounty: 30000000, items: [['p2_sea_train_pass', 1]], flag: 'p2_eniesLobbyFell' } },

  { id: 'p2_adam_wood', name: 'The Dream Ship', island: 'water_7', kind: 'side',
    summary: 'Franky wants to build a ship that can sail to the end of the world. All he needs is a plank of Adam wood.',
    stages: [
      { id: 'wood', desc: 'Find Adam wood — the black market in St. Poplar sells it, and people there might pay in it.', goal: { type: 'item', item: 'adam_wood' } },
      { id: 'build', desc: 'Bring the Adam wood to Franky\'s workshop on Scrap Island (south-east Water 7).' },
    ],
    rewards: { points: 1 } },

  { id: 'p2_candy_pirates', name: 'The Candy Pirates', island: 'st_poplar', kind: 'side',
    summary: 'The Candy Pirates raid St. Poplar\'s harbour every week. A strange troupe of street performers — former CP9 agents — watches from the plaza.',
    stages: [
      { id: 'candy', desc: 'Drive the Candy Pirates out of St. Poplar\'s south-west harbour: defeat Captain Kandi.', goal: { type: 'defeat', npc: 'p2_candy_captain' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_candy_pirates', 'candy', ['p2_candy_captain'])(ctx, g)) { summon(g, 'p2_candy_captain'); spawnHere(g, { island: 'st_poplar', spot: 'poplar_harbor', radius: 6, enemies: CANDY }); } } },
      { id: 'report', desc: 'Tell Ropp at the Back-Alley Dealer.' },
    ],
    rewards: { berries: 30000, points: 1, items: [['adam_wood', 1]] } },

  // ----------------------------------------------------------- Thriller Bark
  { id: TB_Q, name: 'The Shadow Thief of Thriller Bark', island: 'thriller_bark', kind: 'story',
    summary: 'A ship the size of an island drifts in the Florian Triangle. Warlord Gecko Moria steals shadows and sews them into zombies. Never fall asleep here.',
    stages: [
      { id: 'victims', desc: 'Something moves in the fog. Find the survivors hiding from the sun in the dead forest, west of the mansions.', goal: { type: 'reach', island: 'thriller_bark', spot: 'victims_camp', r: 7 } },
      { id: 'lola', desc: 'Talk to Lola, captain of the Rolling Pirates, at the victims\' camp.' },
      { id: 'hogback', desc: 'Defeat the "genius surgeon" Dr. Hogback at the Thriller Bark Mansion, south of the Mast Mansion.', goal: { type: 'defeat', npc: 'p2_hogback' }, onStart: skipBeaten(TB_Q, 'hogback', ['p2_hogback']) },
      { id: 'absalom', desc: 'Defeat "Graveyard" Absalom — the invisible man — among the graves on the east side.', goal: { type: 'defeat', npc: 'p2_absalom' }, onStart: skipBeaten(TB_Q, 'absalom', ['p2_absalom']) },
      { id: 'perona', desc: 'Defeat the Ghost Princess Perona in her Wonder Garden, north of the Mast Mansion.', goal: { type: 'defeat', npc: 'p2_perona' }, onStart: skipBeaten(TB_Q, 'perona', ['p2_perona']) },
      { id: 'oars', desc: 'Oars, a giant dead for five hundred years, has been given a new shadow. Stop him at the freezer hall north-west of the Mast Mansion.', goal: { type: 'defeat', npc: 'p2_oars' },
        onStart: (ctx, g) => { if (!skipBeaten(TB_Q, 'oars', ['p2_oars'])(ctx, g)) bannerG(g, 'OARS', 'Special Zombie', 'The freezer doors burst open. A giant corpse stitched from five-hundred-year-old flesh stands up — and shouts for meat.', 5); } },
      { id: 'moria', desc: 'Storm the Mast Mansion at the heart of the ship and defeat Warlord Gecko Moria.', goal: { type: 'defeat', npc: 'p2_moria' }, onStart: skipBeaten(TB_Q, 'moria', ['p2_moria']) },
      { id: 'dawn', desc: 'The sun rises and the shadows fly home. Return to Lola at the victims\' camp.',
        onStart: (ctx, g) => { summon(g, 'p2_kuma_tb'); bannerG(g, 'DAWN', 'Thriller Bark', 'A thousand shadows pour out of the Mast Mansion and race home across the fog. Then a giant with a Bible steps onto the ruined deck. Bartholomew Kuma.', 7); } },
    ],
    rewards: { berries: 120000, points: 3, attrs: { wil: 1 }, items: [['p2_salt', 3]] } },

  { id: 'p2_ryuma_duel', name: 'The King\'s Shadow', island: 'thriller_bark', kind: 'side',
    summary: 'The zombie of Ryuma, the legendary samurai of Wano, waits in the dead forest with a black blade across his knees.',
    stages: [{ id: 'duel', desc: 'Duel the samurai zombie Ryuma in the dead forest (west Thriller Bark).', goal: { type: 'defeat', npc: 'p2_ryuma' }, onStart: skipBeaten('p2_ryuma_duel', 'duel', ['p2_ryuma']) }],
    rewards: { points: 1, items: [['shusui', 1]], mastery: { ittoryu: 6 } },
    onComplete: (ctx, g) => bannerG(g, 'SHUSUI', 'Ryuma', '"A fine duel." The shadow slips out of the corpse and flies home. The bones hold out the black blade, hilt first. "Take it — and take it further than I did."', 6) },

  { id: 'p2_spa_foxy', name: 'The Silver Fox on Holiday', island: 'spa_island', kind: 'side',
    summary: 'Foxy the Silver Fox has followed two runaway girls to Spa Island. He wants their father\'s notebook on how to make gems.',
    stages: [
      { id: 'foxy', desc: 'Defeat Foxy the Silver Fox by the hot springs on the east side of Spa Island.', goal: { type: 'defeat', npc: 'p2_foxy' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_spa_foxy', 'foxy', ['p2_foxy'])(ctx, g)) { summon(g, 'p2_foxy'); spawnHere(g, { island: 'spa_island', spot: 'hot_springs', radius: 5, enemies: FOXY_CREW }); } } },
      { id: 'report', desc: 'Tell Doran at the Spa Island Hot Springs.' },
    ],
    rewards: { berries: 25000, points: 1, items: [['jewels', 2]] } },

  // ----------------------------------------------------------------- Sabaody
  { id: 'p2_sabaody_auction', name: 'The Human Auctioning House', island: 'sabaody', kind: 'story',
    summary: 'Camie the mermaid has been kidnapped in the lawless groves of Sabaody. Mermaids sell for a fortune — and the Celestial Dragons are in town.',
    stages: [
      { id: 'macro', desc: 'The Macro Pirates — Fish-Man slavers — grabbed Camie in Grove 13 (north-west groves). Beat their captain.', goal: { type: 'defeat', npc: 'p2_macro' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_sabaody_auction', 'macro', ['p2_macro'])(ctx, g)) { summon(g, 'p2_macro'); spawnHere(g, { island: 'sabaody', spot: 'grove_13', radius: 6, enemies: MACRO_CREW }); } } },
      { id: 'auction', desc: 'Camie has already been sold on to the Human Auctioning House in Grove 1 (south-west). Get there before the auction starts!', goal: { type: 'reach', island: 'sabaody', spot: 'grove_1', r: 8 },
        onStart: (ctx, g) => { summon(g, 'p2_kid'); summon(g, 'p2_law'); } },
      { id: 'charlos', desc: 'Saint Charlos, a Celestial Dragon, is bidding on Camie. Face him in front of the auction house.',
        onStart: (ctx, g) => {
          for (const id of ['p2_charlos', 'p2_roswald', 'p2_rayleigh_slave']) summon(g, id);
          bannerG(g, 'LOT 17: A MERMAID', 'The Human Auctioning House', '"Five hundred million berries!" The front row wears bubble helmets. Everyone else kneels. Eleven Supernova captains are watching from the back.', 6);
        } },
      { id: 'kizaru', desc: 'You struck a World Noble. Admiral Kizaru is coming! Break through the Pacifista at the south groves (Grove 60s side).', goal: { type: 'defeat', npc: 'p2_px4' },
        onStart: (ctx, g) => {
          for (const id of ['p2_charlos', 'p2_roswald', 'p2_rayleigh_slave', 'p2_kid', 'p2_law']) despawn(g, id);
          summon(g, 'p2_kizaru'); summon(g, 'p2_sentomaru'); summon(g, 'p2_px4', true);
          spawnHere(g, { island: 'sabaody', spot: 'grove_1', radius: 7, enemies: [['marine', 44, { name: 'Marine (auction house siege)' }], ['marine_rifle', 44, { name: 'Marine Rifleman' }]], aggro: true });
          bannerG(g, 'ADMIRAL KIZARU', 'Sabaody Archipelago', 'A beam of yellow light lands on Grove 1. "Ooh~ how scary. Who hit the World Noble~?" Behind him march Sentomaru and a giant with Kuma\'s face: Pacifista.', 7);
        } },
      { id: 'kuma', desc: 'Bartholomew Kuma steps between you and the Admiral. Talk to him.',
        onStart: (ctx, g) => { summon(g, 'p2_kuma_sb'); bannerG(g, 'BARTHOLOMEW KUMA', 'Warlord of the Sea', 'The real Kuma. He pulls off a glove, revealing a paw.', 5); } },
      { id: 'freed', desc: 'Camie is free. Tell Hatchan at Takoyaki Hachi (Grove 41, north-east).',
        onStart: (ctx, g) => {
          for (const id of ['p2_charlos', 'p2_roswald', 'p2_rayleigh_slave', 'p2_kid', 'p2_law']) despawn(g, id);
          if (!g.state?.char?.flags.p2_punchedCharlos) bannerG(g, 'THE DARK KING', 'Silvers Rayleigh', 'Lot 16, an old man, snaps his own explosive collar. A wave of Conqueror\'s Haki drops every guard in the hall. He lifts Camie\'s cage off the stage. "Sorry. Old habits."', 7);
        } },
    ],
    rewards: { berries: 80000, points: 2 } },

  { id: 'p2_coating', name: 'Ten Thousand Metres Down', island: 'sabaody', kind: 'side',
    summary: 'Pirates cross the Red Line from below: coat the ship in mangrove resin, then dive to Fish-Man Island, 10,000 m beneath the waves.',
    stages: [
      { id: 'coat', desc: 'Have your ship coated: the Coating Mechanic in the Grove 50 shipyards (south-east), or Silvers Rayleigh.', goal: { type: 'flag', flag: 'p2_shipCoated' } },
      { id: 'dive', desc: 'Sail east from Sabaody to the foot of the Red Line and dive where the downward current darkens the sea.', goal: { type: 'event', event: 'p2_dived' } },
    ],
    rewards: { points: 1, attrs: { wil: 1 } } },

  // ---------------------------------------------------------------- Marineford
  { id: WAR, name: 'The Summit War of Marineford', island: 'marineford', kind: 'story',
    summary: 'The Marines will execute Portgas D. Ace, Whitebeard\'s son, at Marineford. Whitebeard is coming. Every pirate and Marine in the world is watching.',
    stages: [
      { id: 'marineford', desc: 'Reach Marineford (north of Sabaody). The Tarai Current through the Gates of Justice leads there from Enies Lobby and Impel Down.', goal: { type: 'reach', island: 'marineford' },
        onStart: (ctx, g) => { const c = g.state?.char; if (c) c.flags.p2_taraiOpen = true; } },
      { id: 'plaza', desc: 'Make your way to Oris Plaza, beneath the execution platform.', goal: { type: 'reach', island: 'marineford', spot: 'oris_plaza', r: 9 },
        onStart: (ctx, g) => { summon(g, 'p2_ace'); summon(g, 'p2_whitebeard'); } },
      { id: 'vice_admiral', desc: 'The war has begun! Fight across Oris Plaza: defeat Vice Admiral Momonga — or, if you wear the coat, the pirate captain Squard.', goal: { type: 'defeat', any: ['p2_momonga', 'p2_squard'], count: 1 },
        onStart: (ctx, g) => {
          const c = g.state?.char;
          summon(g, marine(c) ? 'p2_squard' : 'p2_momonga', true);
          spawnHere(g, { island: 'marineford', spot: 'oris_plaza', radius: 10, enemies: marine(c) ? MF_PIRATES : MF_MARINES, aggro: true });
          bannerG(g, 'THE SUMMIT WAR', 'Marineford', 'Whitebeard\'s fleet surfaces inside the bay. The old man strikes the air and the sea rises into tidal waves. Three Admirals stand up from their chairs.', 7);
        } },
      { id: 'akainu', desc: 'Whitebeard has fallen. Survive until the war ends — or escape Marineford by sea.', goal: { type: 'event', event: 'p2_war_end' },
        onStart: (ctx, g) => {
          const c = g.state?.char;
          despawn(g, 'p2_ace'); despawn(g, 'p2_whitebeard');
          if (!marine(c)) summon(g, 'p2_akainu_war', true);
          bannerG(g, 'THE END OF AN ERA', 'Oris Plaza', 'Ace falls shielding his brother from a magma fist. Whitebeard dies on his feet, without a single wound in his back. "The One Piece... is real!" Magma rains on the plaza.', 8);
        } },
    ],
    rewards: { points: 3, bounty: 50000000, haki: { observation: 8, armament: 8 }, attrs: { wil: 2 } },
    onComplete: (ctx, g) => {
      despawn(g, 'p2_akainu_war');
      const c = g.state?.char; if (c) c.flags.p2_warNews = true;
      bannerG(g, '"THIS WAR IS OVER!"', 'Red-Haired Shanks', 'A Yonko\'s ship sails into the bay and the fighting stops. The Marines keep their plaza. The pirates keep their lives. The world keeps the words of a dying man.', 7);
    } },

  // ------------------------------------------------------------- Impel Down
  { id: 'p2_impel_down', name: 'Breakout from Impel Down', island: 'impel_down', kind: 'story',
    summary: 'Nobody has ever escaped the Great Underwater Prison. Six levels down, a queen throws a party in a secret paradise — and she is waiting for a breakout.',
    stages: [
      { id: 'level1', island: 'id_level1', desc: 'Level 1, Crimson Hell: cross the Blade Forest to the stairs down on the east side.', goal: { type: 'reach', island: 'id_level2' } },
      { id: 'level2', island: 'id_level2', desc: 'Level 2, Wild Beast Hell: defeat the Sphinx guarding the stairs down (south-east).', goal: { type: 'defeat', npc: 'p2_sphinx' }, onStart: skipBeaten('p2_impel_down', 'level2', ['p2_sphinx']) },
      { id: 'level3', island: 'id_level3', desc: 'Level 3, Starvation Hell: defeat the Jailer Beast Minotaurus at the stairs down (south-west).', goal: { type: 'defeat', npc: 'p2_minotaurus' }, onStart: skipBeaten('p2_impel_down', 'level3', ['p2_minotaurus']) },
      { id: 'level4', island: 'id_level4', desc: 'Level 4, Burning Hell, is Chief Warden Magellan\'s level: slip past his office. On Level 5, look for a secret passage to "Newkama Land".', goal: { type: 'reach', island: 'id_newkama' } },
      { id: 'newkama', island: 'id_newkama', desc: 'Newkama Land, the paradise inside hell! Talk to Emporio Ivankov in the Party Hall.' },
      { id: 'escape', island: 'id_level1', desc: 'THE BREAKOUT! Climb back to Level 1 and defeat Vice Warden Hannyabal at the Main Gate (north-west).', goal: { type: 'defeat', npc: 'p2_hannyabal' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_impel_down', 'escape', ['p2_hannyabal'])(ctx, g)) bannerG(g, 'BREAKOUT', 'Impel Down', 'Two hundred okama, a clown, a former Warlord and a fish-man knight storm up the stairwells. Alarms howl on every level. "Hee-haw! To the Main Gate!"', 6); } },
      { id: 'gate', island: 'impel_down', desc: 'The Main Gate is open. Escape to the surface!', goal: { type: 'reach', island: 'impel_down' } },
    ],
    rewards: { points: 3, attrs: { wil: 2 } },
    onComplete: (ctx, g) => {
      const c = g.state?.char;
      if (!c) return;
      const isl = islandRec(g, 'impel_down');
      const moor = isl?.docks?.[0]?.moor;
      const p = g.player;
      const near = (g.ships || []).some((s) => s.owner === 'player' && !s.sunk && p && g.world.distance(s.x, s.y, p.x, p.y) < 80);
      if (moor && !near && g.world === g.surface) { g.giveShip('marine_warship', moor.x, moor.y, 'Stolen Battleship'); g.log('You steal a Marine battleship from the prison docks, just like the escapees in the stories.', '#a5d6a7'); }
      if (!g.quests.state(WAR)) setTimeout(() => { if (g.state?.char && !g.quests.state(WAR)) g.quests.start(WAR); }, 1500);
    } },

  // ------------------------------------------------------------ Amazon Lily
  { id: 'p2_amazon_lily', name: 'The Island of Women', island: 'amazon_lily', kind: 'story',
    summary: 'Amazon Lily, in the Calm Belt, is home to the Kuja — and forbidden to men. Its Empress, the Warlord Boa Hancock, hides a secret on her back.',
    stages: [
      { id: 'gate', desc: 'Kuja warriors have spotted you. Talk to Marguerite at the Kuja Training Grounds in the village.' },
      { id: 'nyon', desc: 'Elder Nyon, a former Empress, wants to see you in her hut in the Kuja village.' },
      { id: 'arena', desc: 'The Empress judges in the Battle Arena (north-west of the village): defeat the Gorgon Sisters Sandersonia and Marigold.', goal: { type: 'defeat', any: ['p2_sandersonia', 'p2_marigold'], count: 2 },
        onStart: (ctx, g) => {
          if (skipBeaten('p2_amazon_lily', 'arena', ['p2_sandersonia', 'p2_marigold'], 2)(ctx, g)) return;
          summon(g, 'p2_sandersonia'); summon(g, 'p2_marigold');
          bannerG(g, 'THE BATTLE ARENA', 'Amazon Lily', 'The whole village packs the stands. Two huge Gorgon sisters shed their robes and become giant snakes. Empress Hancock watches from a throne of pillows, bored.', 6);
        } },
      { id: 'secret', desc: 'In the arena you saw the brand of the Celestial Dragons on the sisters\' backs. Face Empress Boa Hancock at Kuja Castle.',
        onStart: (ctx, g) => bannerG(g, 'THE HOOF OF THE SOARING DRAGON', 'The Gorgon Sisters', 'The sisters\' robes tear in the fight — and on their backs you see a brand. Not the eye of a Gorgon: the mark of the Celestial Dragons\' slaves. The arena falls silent.', 7) },
    ],
    rewards: { berries: 50000, points: 2, items: [['p2_kuja_bow', 1]], flag: 'p2_kujaFriend' } },

  { id: 'p2_rusukaina', name: 'Two Years on Rusukaina', island: 'rusukaina', kind: 'side',
    summary: 'Silvers Rayleigh offers to train you properly on Rusukaina, a Calm Belt island of forty-eight seasons and five hundred beasts.',
    stages: [
      { id: 'go', desc: 'Sail to Rusukaina in the Calm Belt (north-west of Amazon Lily) and find Rayleigh\'s camp.', goal: { type: 'reach', island: 'rusukaina', spot: 'rayleigh_camp', r: 7 } },
      { id: 'beasts', desc: 'Defeat the Lord of Rusukaina, the beast that rules the plains (east of the camp).', goal: { type: 'defeat', npc: 'p2_rk_king' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_rusukaina', 'beasts', ['p2_rk_king'])(ctx, g)) summon(g, 'p2_rk_king'); } },
      { id: 'train', desc: 'Train with Rayleigh until the next day: meditate, spar, hunt (rest at the Kuja Guest Hut on Amazon Lily if you like).', goal: { type: 'days', n: 1 } },
      { id: 'report', desc: 'Return to Rayleigh\'s camp on Rusukaina.' },
    ],
    rewards: { points: 2, haki: { armament: 15, observation: 15 }, attrs: { wil: 2 } } },

  // ------------------------------------------------- the islands Kuma sent them to
  { id: 'p2_kuraigana_trial', name: 'The Swordsman\'s Bow', island: 'kuraigana', kind: 'side',
    summary: 'Dracule Mihawk, the World\'s Greatest Swordsman, might teach someone who dares to ask. First, his island\'s baboons.',
    stages: [
      { id: 'chieftain', desc: 'Defeat the Humandrill chieftain in the western woods of Kuraigana.', goal: { type: 'defeat', npc: 'p2_humandrill_king' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_kuraigana_trial', 'chieftain', ['p2_humandrill_king'])(ctx, g)) summon(g, 'p2_humandrill_king'); } },
      { id: 'report', desc: 'Return to Mihawk at his castle.' },
    ],
    rewards: { points: 2, attrs: { str: 1, wil: 1 } } },

  { id: 'p2_kamabakka', name: 'The Attack Recipes', island: 'momoiro', kind: 'side',
    summary: 'Chef Tibany of the Kamabakka Kingdom will share her Attack Cuisine — if you can beat the Candidates who guard the recipes.',
    stages: [
      { id: 'candidates', desc: 'Defeat Champion Lulumina and the Kamabakka Candidates in the kingdom\'s plaza.', goal: { type: 'defeat', npc: 'p2_candidate_leader' },
        onStart: (ctx, g) => { summon(g, 'p2_candidate_leader', true); spawnHere(g, { island: 'momoiro', dx: 0.02, dy: 0.1, radius: 6, enemies: CANDIDATES }); } },
      { id: 'report', desc: 'Tell Chef Tibany at the Attack Cuisine Kitchen.' },
    ],
    rewards: { points: 1, items: [['p2_attack_cuisine', 5]] } },

  { id: 'p2_baldimore', name: 'Vegapunk\'s Old Lab', island: 'karakuri', kind: 'side',
    summary: 'Dr. Vegapunk grew up on Karakuri Island. His old laboratory in Baldimore is still full of notes — and one big red button.',
    stages: [
      { id: 'lab', desc: 'Read the notes in Vegapunk\'s Old Laboratory in Future Land Baldimore.', goal: { type: 'event', event: 'p2_read_lab' } },
      { id: 'button', desc: 'Tell Kitton at the Baldimore Workshop what you found.' },
    ],
    rewards: { points: 1, attrs: { wil: 1 }, items: [['p2_vegapunk_notes', 1]] } },

  { id: 'p2_gluttony', name: 'The Forest of Gluttony', island: 'boin', kind: 'side',
    summary: 'Heracles, the Forest Scholar of Boin, has lost three tents to a monstrous beetle.',
    stages: [
      { id: 'beetle', desc: 'Hunt the Greenstone Horned Beetle on Boin\'s eastern islet.', goal: { type: 'defeat', npc: 'p2_boin_beetle' },
        onStart: (ctx, g) => { if (!skipBeaten('p2_gluttony', 'beetle', ['p2_boin_beetle'])(ctx, g)) summon(g, 'p2_boin_beetle'); } },
      { id: 'report', desc: 'Return to Heracles at his camp.' },
    ],
    rewards: { berries: 20000, points: 1, mastery: { sniper: 5 } } },
];

// ================================================================== install
// The Tarai Current: Enies Lobby, Impel Down and Marineford are linked by a
// current that runs through their three Gates of Justice.
const GATES = [['enies_lobby', 'gates_of_justice', 'Enies Lobby'], ['impel_down', 'id_gate_of_justice', 'Impel Down'], ['marineford', 'mf_gate_of_justice', 'Marineford']];
const KUJA_NAMES = ['Ran', 'Daisy', 'Belladonna', 'Kikyo', 'Nerine', 'Enishida', 'Cosmos', 'Poppy', 'Rindo', 'Lilac', 'Azalea', 'Camellia', 'Gloxinia', 'Yarrow'];

/** Open water near (x, y) where this ship fits. */
function seaNear(w, s, x, y) {
  for (let r = 2; r < 28; r += 1.5) {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const px = w.wx ? w.wx(x + Math.cos(a) * r) : x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (s.fits(w, px, py, s.heading)) return { x: px, y: py };
    }
  }
  return null;
}

function rideTarai(game, s, dest) {
  const spot = spotOf(game, dest[0], dest[1]);
  if (!spot || !s) return;
  game.ui.fade(true);
  setTimeout(() => {
    const pos = seaNear(game.world, s, spot.x, spot.y + 6);
    if (pos) { s.x = pos.x; s.y = pos.y; s.speed = 0; }
    const p = game.player;
    if (p && p.ship === s) { p.x = s.x; p.y = s.y; }
    game.snapCamera();
    game.ui.fade(false);
    game.ui.banner('THE TARAI CURRENT', dest[2], 'The Gate of Justice grinds open. A current like a waterfall turned on its side carries the ship across the sea in minutes.', 5);
    persist(game);
  }, 900);
}

/** Your shadow comes home. */
function restoreShadow(game, why) {
  const c = game.state?.char;
  if (!c?.flags.p2_shadowless) return false;
  c.flags.p2_shadowless = false;
  const p = game.player;
  if (p?.buffs) { p.buffs = p.buffs.filter((b) => b.id !== 'p2_no_shadow'); p.recalc?.(); }
  despawn(game, 'p2_shadow_zombie');
  game.ui.banner('YOUR SHADOW RETURNS', '', why, 5);
  persist(game);
  return true;
}

function install(game) {
  const char = () => game.state?.char;
  const W = () => game.world;
  let t = 0, nightT = 0, watchT = 0, burnWarn = 0, warT = 0, shellT = 0;
  const shells = []; // pending artillery: { x, y, t, r }

  const hqDoor = () => {
    const isl = islandRec(game, 'water_7');
    const town = isl?.towns?.find((x) => x.id === 'w7_main_street');
    return town?.buildings?.find((b) => b.name === 'Galley-La Company Headquarters')?.door || null;
  };
  const near = (id, extra = 0) => {
    const isl = islandRec(game, id);
    const p = game.player;
    return !!(isl && p && W() === game.surface && W().distance(p.x, p.y, isl.x, isl.y) < (isl.radius || 60) + extra);
  };
  /** Queue a shell landing near the player (Buster Call, the Summit War). */
  const shell = (minR, maxR) => {
    const p = game.player;
    const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
    shells.push({ x, y, t: 0.8, r: 2.2 });
    game.fx.ring(x, y, 0.2, 2.2, '#ff5252', 0.8, 0.12);
  };

  // ------------------------------------------------------------ arrivals
  game.on('enterIsland', (isl) => {
    const c = char();
    if (!c || !isl || W() !== game.surface) return;
    const q = game.quests;
    if (isl.id === 'thriller_bark' && !q.state(TB_Q)) q.start(TB_Q);
    if (isl.id === 'amazon_lily' && !q.state('p2_amazon_lily')) {
      game.ui.banner('AMAZON LILY', 'The Island of Women', 'Sea Kings circle the island like watchdogs. Beyond the cliffs, a village of warrior women — and a law older than the Government: no man leaves this island alive.', 6);
      q.start('p2_amazon_lily');
    }
    if (isl.id === 'enies_lobby' && !c.flags.p2_elSeen) {
      c.flags.p2_elSeen = true;
      game.ui.banner('ENIES LOBBY', 'The Judicial Island', 'An island floating over a hole in the sea, ringed by an endless waterfall. The sun never sets here — and no criminal has ever been found innocent.', 6);
    }
    if (isl.id === 'sabaody' && !c.flags.p2_sbSeen) {
      c.flags.p2_sbSeen = true;
      game.ui.banner('SABAODY ARCHIPELAGO', 'Groves 1–79', 'Giant mangroves breathe bubbles into the sky. Here the Log Pose stops working — the Red Line is next. Coat your ship, and kneel when the Celestial Dragons pass.', 6);
    }
    if (isl.id === 'marineford' && q.isDone(WAR) && !c.flags.p2_mfMemory) {
      c.flags.p2_mfMemory = true;
      game.ui.banner('MARINEFORD', 'After the war', 'The fissure Whitebeard tore across Oris Plaza is still there. The Marines left it as it was — a reminder, some say. A warning, say others.', 6);
    }
  });

  // ------------------------------------------------------------ zones
  game.on('enterZone', (id) => {
    const c = char();
    if (!c) return;
    if (id === 'impel_down' && (c.flags.imprisoned || c.flags.p2_infiltrated) && !game.quests.state('p2_impel_down')) game.quests.start('p2_impel_down');
    if (id === 'fishman_island') game.emit('questEvent', 'p2_dived');
  });
  game.on('leaveZone', (id) => {
    const c = char();
    if (!c || id !== 'impel_down') return;
    c.flags.p2_infiltrated = false;
    const st = game.quests.stageId('p2_impel_down');
    if (st && st !== 'gate') game.quests.setStage('p2_impel_down', 'gate');
  });

  // Vegapunk's old notes
  game.on('enterBuilding', (b) => {
    if (b?.name === "Vegapunk's Old Laboratory" && game.quests.stageId('p2_baldimore') === 'lab') {
      game.log('Blueprints for a man-shaped weapon with a laser mouth, a Bible, and the note "PX-0". In Room 8 there is a big red button labelled "DO NOT PRESS".', '#b3e5fc');
      game.emit('questEvent', 'p2_read_lab');
    }
  });

  // Burning the World Government flag over Enies Lobby (examine the flagpole during the raid)
  game.on('questEvent', (name) => {
    const c = char();
    if (!c || name !== 'p2_wg_flag' || c.flags.p2_flagBurned) return;
    if (!['courthouse', 'keys', 'lucci'].includes(game.quests.stageId('p2_enies_lobby'))) return;
    c.flags.p2_flagBurned = true;
    const p = game.player;
    game.fx.burst(p.x, p.y - 3, 40, { color: ['#ff7043', '#ffca28', '#5d4037'], speed: 5, vz: 6, g: -1, life: 1.4, kind: 'fire', size: 0.4 });
    game.ui.banner('DECLARATION OF WAR', 'The World Government', 'The flag of the World Government burns over Enies Lobby. Every agent on the island saw it. So will every newspaper in the world.', 6);
    if (marine(c)) { c.faction = 'pirate'; c.marineRank = null; c.flags.deserter = true; game.log('A Marine burned the Government\'s flag. You are a deserter now.', '#ff8a80'); }
    game.progression.addBounty(50000000, 'Burned the World Government flag');
  });

  // ------------------------------------------------------------ knockouts
  game.on('knockout', (a) => {
    const c = char();
    if (!c || !a?.npcId) return;
    const q = game.quests;
    if (a.npcId === 'p2_spandam' && !c.flags.p2_funkfreed) {
      c.flags.p2_funkfreed = true;
      addItem(game, 'p2_funkfreed', 1);
      game.log('Spandam drops his sword. It trumpets sadly. (You picked up Funkfreed.)', '#ffd54f');
    }
    if (a.npcId === 'p2_moria') restoreShadow(game, 'Moria falls — and a thousand stolen shadows burst out of his body and race home. Yours finds your feet.');
    if (a.npcId === 'p2_shadow_zombie' && c.flags.p2_shadowless) {
      if (count(c, 'p2_salt') > 0) { removeItem(game, 'p2_salt', 1); restoreShadow(game, 'You stuff salt into the zombie\'s mouth. Your shadow tears itself free and slams back into your feet.'); }
      else game.log('The zombie collapses — but your shadow is still stitched inside it. (You need Purifying Salt: the victims\' camp sells it.)', '#ff8a80');
    }
    if (a.npcId === 'p2_hancock' && q.stageId('p2_amazon_lily') === 'secret') {
      c.flags.p2_kujaFriend = true;
      setTimeout(() => { if (q.stageId('p2_amazon_lily') === 'secret') q.complete('p2_amazon_lily'); }, 1500);
      game.log('"...You defeated me. And you did not look at their backs again." (Hancock turns away.) "The Kuja will treat you as a guest."', '#f8bbd0');
    }
  });

  game.on('questDone', (id) => {
    const c = char();
    if (!c) return;
    if (id === 'p2_enies_lobby') c.flags.p2_elNews = true;
    if (id === 'p2_impel_down') c.flags.p2_idNews = true;
    if (id === TB_Q) restoreShadow(game, 'The sun rises over Thriller Bark and your shadow is where it belongs.');
  });

  // the morning paper
  game.on('newDay', () => {
    const c = char();
    if (!c) return;
    const lines = [];
    if (c.flags.p2_elNews === true) { c.flags.p2_elNews = 'printed'; lines.push('ENIES LOBBY DESTROYED IN BUSTER CALL. Government blames rookie pirates who "declared war on the world". CP9 disbanded.'); }
    if (c.flags.p2_idNews === true) { c.flags.p2_idNews = 'printed'; lines.push('MASS BREAKOUT FROM IMPEL DOWN! 241 prisoners escape the "inescapable" prison. Chief Warden Magellan under investigation.'); }
    if (c.flags.p2_warNews === true) { c.flags.p2_warNews = 'printed'; lines.push('WHITEBEARD DEAD. "The One Piece is real!" — the old pirate\'s last words start a new Great Pirate Era.'); }
    if (lines.length) game.log(`📰 Extra! ${lines.join(' · ')}`, '#e0e0e0');
  });

  // ------------------------------------------------------------ the Tarai Current
  const prevSea = game.seaInteraction;
  game.seaInteraction = (p, s) => {
    const c = char();
    if (c && s && W() === game.surface) {
      for (const gate of GATES) {
        const spot = spotOf(game, gate[0], gate[1]);
        if (!spot || W().distance(s.x, s.y, spot.x, spot.y) > 16) continue;
        const open = marine(c) || !!c.flags.p2_taraiOpen;
        return {
          label: open ? 'Ride the Tarai Current through the Gate of Justice' : 'The Gate of Justice (sealed)', key: 'E',
          run: () => {
            if (!open) { game.log('Only the World Government opens the Gates of Justice. (Marines ride the Tarai Current — and in wartime, so does everyone else.)', '#ff8a80'); return; }
            game.dialogue.open(null, { start: 'a', nodes: { a: {
              speaker: 'The Gate of Justice',
              text: '(The gate groans open. Beyond it, the sea pours sideways into the Tarai Current, the whirlpool road that links the Judicial Island, the Great Prison and Marine Headquarters.)',
              choices: [...GATES.filter((x) => x !== gate).map((d) => ({ text: `Ride the current to ${d[2]}`, do: () => rideTarai(game, s, d), end: true })), { text: 'Stay here.', end: true }],
            } } });
          },
        };
      }
    }
    return prevSea ? prevSea(p, s) : null;
  };

  // ------------------------------------------------------------ Kuja villagers
  game.spawner.addBuilder((ctx) => {
    if (ctx.island?.id !== 'amazon_lily') return;
    const prev = ctx.onTownsfolk;
    ctx.onTownsfolk = (a, town) => {
      if (prev) prev(a, town);
      const r = ctx.rng;
      a.look = { ...a.look, hair: r.pick(['long', 'ponytail', 'bun', 'long']), hairColor: r.pick(['#212121', '#3e2723', '#fdd835', '#8d6e63', '#e65100']), top: r.pick(['#8bc34a', '#26a69a', '#ec407a', '#ffb300', '#7e57c2']), bottom: '#f5f5f5', hat: null, openShirt: false };
      a.name = r.pick(KUJA_NAMES);
    };
  });

  // ------------------------------------------------------------ every frame
  game.on('tick', (dt) => {
    const c = char(), p = game.player;
    if (!c || !p) return;
    const env = game.env;
    // the Judicial Island never sees night
    if (near('enies_lobby', 12) && env.daylight < 0.95) {
      env.daylight = 0.95;
      const k = 1 - (env.storm * 0.35 + env.fog * 0.15);
      env.ambient = [k, k * 0.98, k * 0.94];
    }
    // the Aqua Laguna floods Water 7 the night of the raid
    if (S(game, 'p2_enies_lobby') === 'rocketman' && near('water_7', 20)) { env.storm = Math.max(env.storm, 0.75); env.rain = env.storm; }
    // artillery
    for (let i = shells.length - 1; i >= 0; i--) {
      const sh = shells[i];
      sh.t -= dt;
      if (sh.t > 0) continue;
      shells.splice(i, 1);
      game.fx.burst(sh.x, sh.y, 26, { color: ['#ff7043', '#ffca28', '#5d4037', '#9e9e9e'], speed: 7, vz: 7, g: 9, life: 0.8, kind: 'fire', size: 0.35 });
      game.fx.crack?.(sh.x, sh.y, sh.r);
      game.fx.shake(0.35);
      game.audio?.sfx('explosion');
      if (p.state === 'idle' && p.d && W().distance(p.x, p.y, sh.x, sh.y) < sh.r) {
        p.hp = Math.max(1, p.hp - p.d.maxHp * 0.08);
        game.fx.text(p.x, p.y - 2, 'BOOM!', '#ff7043', 0.5);
      }
    }

    t -= dt;
    if (t > 0) return;
    t = 0.5;
    const q = game.quests;
    const here = game.currentIsland?.id;
    const surface = W() === game.surface;

    // The Florian Triangle
    if (surface && !c.flags.p2_florian && near('thriller_bark', 70)) {
      c.flags.p2_florian = true;
      game.ui.banner('THE FLORIAN TRIANGLE', 'Paradise', 'A sea of fog where a hundred ships a year vanish — and ghost ships drift out again with no one aboard. Somewhere ahead, someone is singing.', 6);
    }

    // CP9's night assault on Galley-La headquarters
    if (S(game, 'p2_cp9_conspiracy') === 'night' && here === 'water_7') {
      const door = hqDoor();
      if (door && W().distance(p.x, p.y, door.x, door.y) < 18) {
        watchT += 0.5;
        if (env.daylight < 0.6 || watchT >= 20) {
          if (env.daylight >= 0.6) { env.clock = 21.5; game.log('You keep watch on the grounds of Galley-La until night falls...', '#b0bec5'); }
          watchT = 0;
          game.emit('questEvent', 'p2_w7_assault');
        }
      } else watchT = 0;
    }

    // Buster Call over Enies Lobby; cannon fire over Oris Plaza
    if (surface && here === 'enies_lobby' && S(game, 'p2_enies_lobby') === 'buster_call') {
      shellT -= 0.5;
      if (shellT <= 0) { shellT = 1; shell(1, 10); shell(4, 14); }
    }
    if (surface && here === 'marineford' && warOn(game, 'vice_admiral', 'akainu')) {
      shellT -= 0.5;
      if (shellT <= 0) { shellT = 2.5; shell(5, 16); }
    }
    // the war ends: Shanks arrives (or you got away)
    if (S(game, WAR) === 'akainu') {
      warT += 0.5;
      if (warT >= 75 || (surface && !near('marineford', 120))) { warT = 0; game.emit('questEvent', 'p2_war_end'); }
    } else warT = 0;

    // a coated ship for the dive
    if (S(game, 'p2_coating') === 'coat' && !c.flags.p2_shipCoated && (game.ships || []).some((s) => s.owner === 'player' && !s.sunk && s.coated)) c.flags.p2_shipCoated = true;

    // Moria's shadow theft: never fall asleep on Thriller Bark
    if (surface && here === 'thriller_bark' && q.isActive(TB_Q) && !c.flags.p2_shadowTaken && !beat(c, 'p2_moria') && env.isNight && p.state === 'idle') {
      nightT += 0.5;
      if (nightT === 15) game.log('Your eyelids are so heavy... (Never fall asleep on Thriller Bark.)', '#b39ddb');
      if (nightT >= 30) {
        nightT = 0;
        c.flags.p2_shadowTaken = true;
        c.flags.p2_shadowless = true;
        game.ui.fade(true);
        setTimeout(() => {
          game.ui.fade(false);
          game.ui.banner('YOUR SHADOW WAS STOLEN', 'Gecko Moria', 'You wake on the cold floor of the Mast Mansion. Giant scissors, a laugh — "Kishishishi!" — and now you cast no shadow. Somewhere, a zombie walks with it. Stay out of the sun!', 8);
          if (game.spawner.populated.has('thriller_bark')) spawnNow(game, 'p2_shadow_zombie');
        }, 900);
      }
    } else if (here !== 'thriller_bark') nightT = 0;

    // life without a shadow: weaker, and the sun burns
    if (c.flags.p2_shadowless) {
      const b = (p.buffs || []).find((x) => x.id === 'p2_no_shadow');
      if (!b || b.t < 2) p.addBuff({ id: 'p2_no_shadow', name: 'Shadowless', dur: 6, mods: { damage: 0.9 } });
      if (surface && env.daylight > 0.85 && env.fog < 0.3 && env.storm < 0.5 && p.state === 'idle' && p.d) {
        const floor = p.d.maxHp * 0.35;
        if (p.hp > floor) {
          p.hp = Math.max(floor, p.hp - p.d.maxHp * 0.004);
          if (Math.random() < 0.5) game.fx.burst(p.x, p.y - 1, 4, { color: ['#fff59d', '#9e9e9e'], speed: 1.5, vz: 2, g: -1, life: 0.6, kind: 'smoke', size: 0.2 });
        }
        burnWarn -= 0.5;
        if (burnWarn <= 0) { burnWarn = 15; game.log('The sun burns your shadowless body! Stay in fog, shade or darkness — or win your shadow back (defeat Moria, or put salt in the mouth of the zombie wearing it).', '#ff8a80'); }
      }
    }
  });
}

export default {
  id: 'paradise2',
  npcs, groups, quests, items, trainers, stock, abilities, install,
  dynamicIds: [],
};
