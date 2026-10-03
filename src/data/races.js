// Playable races. Rolled at character creation (Rogue Lineage style) with
// rarity weights. Race decides which Blue you are born in.
//
// Canon homelands of most non-human races sit in the Grand Line, so each race
// is born in a Blue with a thematic link (called out in `origin`).
import { RNG } from '../core/rng.js';

export const RARITY = {
  common: { label: 'Common', color: '#b2bec3' },
  uncommon: { label: 'Uncommon', color: '#55efc4' },
  rare: { label: 'Rare', color: '#74b9ff' },
  epic: { label: 'Epic', color: '#a29bfe' },
  legendary: { label: 'Legendary', color: '#fdcb6e' },
};

// jump: take-off speed (m/s); charge: how much faster a fully charged jump
// springs; leap: how hard you spring out of the water. flight: a people who
// fly (see game/flight.js: style, gauge in seconds, speeds in m/s, ceiling
// in m, ×drain over the open sea, seconds to refill). What the traits do in
// a fight is game/racial.js (and abilities.js / combat.js where noted).
export const RACES = {
  human: {
    name: 'Human', rarity: 'common', weight: 52,
    desc: 'The most numerous people of the Blue Planet. Adaptable, stubborn, and capable of anything — the Pirate King himself was human.',
    origin: 'Born on any island of the four Blues.',
    stats: { str: 0, agi: 0, end: 0, vit: 0, wil: 1 },
    lives: 3,
    traits: ['Adaptable: trainers teach you 15% cheaper', 'Stubborn Will: +1 Willpower'],
    spawnSeas: ['east_blue', 'north_blue', 'west_blue', 'south_blue'],
    swim: 1, hpMul: 1,
    jump: 7.6, charge: 1.45, leap: 1,
  },
  fishman: {
    name: 'Fish-Man', rarity: 'uncommon', weight: 13,
    desc: 'Born with ten times the strength of a human and the sea in their blood. Many followed Arlong to the East Blue.',
    origin: 'Born in the Conomi Islands (East Blue), in the shadow of Arlong Park.',
    stats: { str: 4, agi: 0, end: 2, vit: 1, wil: 0 },
    lives: 3,
    traits: ['Gills: breathe underwater — never drown (unless a Devil Fruit user)', 'Swims 3× faster', 'Fish-Man Karate affinity: learns it 30% faster', 'Dolphin leap: springs far out of the water — and, swimming hard, on forward like a dolphin'],
    spawnSeas: ['east_blue'], spawnTowns: ['cocoyasi'],
    swim: 3, hpMul: 1.1, gills: true,
    jump: 7.4, charge: 1.4, leap: 1.35,
  },
  mink: {
    name: 'Mink', rarity: 'uncommon', weight: 12,
    desc: 'The Warrior Beast Tribe. Every Mink is born a fighter and can channel Electro through their fur.',
    origin: 'Born among wandering Mink traders who settled in the wilds of the South Blue.',
    stats: { str: 1, agi: 4, end: 1, vit: 0, wil: 0 },
    lives: 3,
    traits: ['Electro: bare-handed basic attacks crackle, and now and then shock (innate)', 'Keen senses: a dodge leaves you untouchable a little longer', 'Sulong: in a fight under the full moon, at night, you become a battle beast (hidden)', 'Springy: jumps high, and a charged leap goes higher still'],
    spawnSeas: ['south_blue'], spawnTowns: ['torino_village', 'karate_dojo_town'],
    swim: 1, hpMul: 1, electro: true,
    jump: 8.6, charge: 1.65, leap: 1,
  },
  skypiean: {
    name: 'Skypiean', rarity: 'uncommon', weight: 10,
    desc: 'A winged people of the White Sea. You fell from the clouds as a child and washed ashore at Lvneel, homeland of Noland the Liar.',
    origin: 'Fell from a sky island; raised in Lvneel (North Blue).',
    stats: { str: 0, agi: 2, end: 0, vit: 0, wil: 3 },
    lives: 3,
    traits: ['Mantra: once their sixth sense awakens, it grows twice as fast', 'Light-footed: dodge travels 30% further', 'Dial-savvy: dials hit 25% harder', 'Little wings: not for flying — no Skypiean can'],
    spawnSeas: ['north_blue'], spawnTowns: ['lvneel_town'],
    swim: 0.9, hpMul: 0.95,
    jump: 8.6, charge: 1.5, leap: 1,
  },
  longarm: {
    name: 'Longarm Tribe', rarity: 'rare', weight: 5,
    desc: 'Two elbows on each arm — the "Friend Elbow" and the "Lover Elbow". Your reach is feared across the North Blue.',
    origin: 'Born in a Longarm enclave at Notice (North Blue).',
    stats: { str: 3, agi: 0, end: 1, vit: 0, wil: 0 },
    lives: 3,
    traits: ['Long reach: +45% melee range', 'Double-jointed: bare-handed basic strikes snap back 20% quicker'],
    spawnSeas: ['north_blue'], spawnTowns: ['notice_town'],
    swim: 1, hpMul: 1, reach: 1.45,
    jump: 7.6, charge: 1.45, leap: 1,
  },
  longleg: {
    name: 'Longleg Tribe', rarity: 'rare', weight: 5,
    desc: 'From the Asshina Gainone Kingdom. Legs like steel whips — the Colosseum fighters fear their kicks.',
    origin: 'Born in the Asshina Gainone Kingdom (West Blue).',
    stats: { str: 1, agi: 3, end: 0, vit: 0, wil: 0 },
    lives: 3,
    traits: ['Long stride: +18% move speed', 'Whip legs: kicks deal +30% damage'],
    spawnSeas: ['west_blue'], spawnTowns: ['asshina_town'],
    swim: 1, hpMul: 1, stride: 1.18,
    jump: 9.2, charge: 1.6, leap: 1,
  },
  buccaneer: {
    name: 'Buccaneer', rarity: 'epic', weight: 2.2,
    desc: 'A giant-framed race hunted almost to extinction. Bartholomew Kuma was born to your people in the South Blue.',
    origin: 'Born in the Sorbet Kingdom (South Blue).',
    stats: { str: 5, agi: -2, end: 5, vit: 4, wil: 0 },
    lives: 3,
    traits: ['Huge frame: +35% HP', 'Unshakable: light blows can\'t stagger you, and knockback barely moves you', 'Slow: -8% move speed'],
    spawnSeas: ['south_blue'], spawnTowns: ['sorbet_town'],
    swim: 0.9, hpMul: 1.35, scale: 1.3,
    jump: 6.6, charge: 1.55, leap: 1,
  },
  three_eye: {
    name: 'Three-Eye Tribe', rarity: 'legendary', weight: 0.8,
    desc: 'A vanishingly rare people whose third eye may one day hear the Voice of All Things.',
    origin: 'Born among the scholars sheltering in the ruins of Ohara (West Blue).',
    stats: { str: 0, agi: 1, end: 0, vit: 0, wil: 6 },
    lives: 3,
    traits: ['Third Eye: Observation Haki from birth', 'Voice of All Things: can read Poneglyphs without an archaeologist'],
    spawnSeas: ['west_blue'], spawnTowns: ['ohara_camp'],
    swim: 1, hpMul: 1,
    jump: 7.4, charge: 1.4, leap: 1,
  },
  lunarian: {
    name: 'Lunarian', rarity: 'legendary', weight: 0.5,
    desc: 'A people of the "Land of Gods" atop the Red Line, believed extinct. Black wings, white hair, and a flame that never goes out.',
    origin: 'Washed up alone on an uncharted islet in one of the Blues.',
    stats: { str: 2, agi: 1, end: 5, vit: 5, wil: 2 },
    lives: 4,
    traits: ['Ignition: bare blows can set foes alight, and while the flame on your back burns, harm done to you is halved — the sea puts it out, and it lights again once you\'re dry', 'Tremendous vitality: +1 life', 'Wings: fly (Space again in the air) — and a dodge is a wing-beat that carries you further, even over water'],
    spawnSeas: ['east_blue', 'north_blue', 'west_blue', 'south_blue'], spawnIslet: true,
    swim: 1, hpMul: 1.15,
    jump: 8.2, charge: 1.55, leap: 1,
    flight: { style: 'wings', gauge: 22, speed: 10, climb: 6, ceiling: 40, sea: 3.5, refill: 6, color: '#ff7043' },
  },
};

export const RACE_IDS = Object.keys(RACES);

export function rollRace(rng, boosts = {}) {
  const list = RACE_IDS.map((id) => [id, RACES[id].weight * (boosts[id] || 1)]);
  return rng.weighted(list);
}

// Appearance palettes
const HUMAN_SKIN = ['#f9dcc4', '#f1c9a0', '#e0ac7e', '#c68642', '#a0643a', '#7a4a2a', '#5c3a21'];
const HAIR = ['#1e1e1e', '#3b2a1a', '#6b4423', '#c69c6d', '#f2d16b', '#e67e22', '#c0392b', '#2ecc71', '#2980b9', '#e84393', '#dfe6e9', '#8e44ad', '#16a085'];
const TOPS = ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#e17055', '#6c5ce7', '#2d3436', '#dfe6e9', '#e84393', '#00cec9', '#b2bec3', '#a0522d'];
const BOTTOMS = ['#2d3436', '#1e3799', '#3b3b98', '#6d4c41', '#636e72', '#0a3d62', '#b8860b', '#2f3542'];
const HAIRSTYLES = ['short', 'short', 'spiky', 'messy', 'crop', 'crop', 'sidefringe', 'slick', 'long', 'ponytail', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald', 'pompadour'];

export const FISHMAN_KINDS = [
  { id: 'shark', name: 'Saw Shark', skin: '#7fa7c9' },
  { id: 'great_white', name: 'Great White Shark', skin: '#9fb4c7' },
  { id: 'whale_shark', name: 'Whale Shark', skin: '#4a69bd' },
  { id: 'octopus', name: 'Octopus', skin: '#e17b77' },
  { id: 'sea_bream', name: 'Sea Bream', skin: '#f3a683' },
  { id: 'manta', name: 'Manta Ray', skin: '#546de5' },
  { id: 'sunfish', name: 'Sunfish', skin: '#c7ecee' },
  { id: 'goldfish', name: 'Goldfish', skin: '#f5b041' },
];

export const MINK_KINDS = [
  { id: 'cat', name: 'Cat', ears: 'pointy', fur: '#f0932b', tail: 'thin' },
  { id: 'dog', name: 'Dog', ears: 'pointy', fur: '#dfe6e9', tail: 'fluffy', muzzle: true },
  { id: 'rabbit', name: 'Rabbit', ears: 'long', fur: '#f5f6fa', tail: 'fluffy' },
  { id: 'bear', name: 'Bear', ears: 'round', fur: '#6d4c41', tail: null, muzzle: true },
  { id: 'fox', name: 'Fox', ears: 'pointy', fur: '#e67e22', tail: 'fluffy', muzzle: true },
  { id: 'lion', name: 'Lion', ears: 'round', fur: '#f6b93b', tail: 'thin', muzzle: true },
  { id: 'panda', name: 'Panda', ears: 'round', fur: '#f5f6fa', tail: null },
  { id: 'jaguar', name: 'Jaguar', ears: 'round', fur: '#e1b12c', tail: 'thin' },
  { id: 'wolf', name: 'Wolf', ears: 'pointy', fur: '#7f8fa6', tail: 'fluffy', muzzle: true },
];

// Outfits by role (see render3d/chars/body.js for what each style looks like).
// Weighted lists [style, weight] for masculine (m) and feminine (f) builds.
const W = (s) => s.split(' ').map((t) => { const [k, w] = t.split(':'); return [k, +w || 1]; });
const DRESS = {
  civilian: {
    m: { top: W('tee:4 shirt:3 open:1 tank:1 striped:1 vest:0.5'), bottom: W('trousers:4 capri:2 shorts:2 baggy:1 slim:1'), waist: W('belt:3 none:3 sash:1'), shoes: W('shoes:3 sandals:3 boots:2') },
    f: { top: W('tee:3 tank:2 shirt:2 dress:3 crop:1'), bottom: W('skirt:3 longskirt:2 trousers:2 capri:1 shorts:1 slim:1'), waist: W('none:3 belt:2 sash:1'), shoes: W('shoes:3 sandals:3 boots:1') },
  },
  pirate: {
    m: { top: W('striped:3 open:3 vest:2 tee:2 bare:1 tank:1'), bottom: W('baggy:4 capri:2 shorts:2 trousers:2'), waist: W('sash:5 belt:3'), shoes: W('boots:5 sandals:2') },
    f: { top: W('crop:3 tank:2 open:1 striped:1 bikini:1'), bottom: W('trousers:2 shorts:2 capri:2 skirt:1 baggy:1'), waist: W('sash:4 belt:3'), shoes: W('boots:5 sandals:2') },
  },
  bandit: {
    m: { top: W('vest:3 open:2 tank:2 bare:1'), bottom: W('baggy:4 trousers:2 capri:1'), waist: W('sash:4 belt:2'), shoes: W('boots:3 sandals:2') },
    f: { top: W('crop:2 tank:2 vest:1'), bottom: W('trousers:2 baggy:2 shorts:1'), waist: W('sash:3 belt:2'), shoes: W('boots:3 sandals:1') },
  },
  marine: {
    m: { top: W('shirt:1'), bottom: W('trousers:1'), waist: W('belt:1'), shoes: W('boots:1') },
    f: { top: W('shirt:1'), bottom: W('trousers:3 skirt:1'), waist: W('belt:1'), shoes: W('boots:1') },
  },
  officer: {
    m: { top: W('jacket:2 shirt:1'), bottom: W('trousers:2 slim:1'), waist: W('belt:1'), shoes: W('boots:1 shoes:1') },
    f: { top: W('jacket:2 shirt:1'), bottom: W('slim:2 skirt:1'), waist: W('belt:1'), shoes: W('boots:1 shoes:1') },
  },
  agent: {
    m: { top: W('jacket:1'), bottom: W('slim:1'), waist: W('belt:1'), shoes: W('shoes:1') },
    f: { top: W('jacket:2 shirt:1'), bottom: W('slim:2 skirt:1'), waist: W('belt:1'), shoes: W('shoes:2 boots:1') },
  },
  swordsman: {
    m: { top: W('kimono:3 open:2 tee:1'), bottom: W('hakama:3 baggy:1 trousers:1'), waist: W('obi:2 sash:2'), shoes: W('geta:2 sandals:2 boots:1') },
    f: { top: W('kimono:3 tank:1'), bottom: W('hakama:2 slim:1'), waist: W('obi:2 sash:1'), shoes: W('geta:1 sandals:2 boots:1') },
  },
  wano: {
    m: { top: W('kimono:6 open:1'), bottom: W('hakama:4 baggy:1 capri:1'), waist: W('obi:4 sash:1'), shoes: W('geta:3 sandals:3') },
    f: { top: W('kimono:6 dress:1'), bottom: W('longskirt:3 hakama:2'), waist: W('obi:4 none:1'), shoes: W('geta:3 sandals:2') },
  },
  desert: {
    m: { top: W('shirt:3 open:2 vest:1 kimono:1'), bottom: W('baggy:4 trousers:2'), waist: W('sash:4 belt:1'), shoes: W('sandals:4 boots:1') },
    f: { top: W('dress:2 crop:2 shirt:1'), bottom: W('longskirt:2 baggy:2 skirt:1'), waist: W('sash:3 none:1'), shoes: W('sandals:4') },
  },
  snow: {
    m: { top: W('coat:3 shirt:2 jacket:1'), bottom: W('trousers:3 baggy:1'), waist: W('belt:2 none:1'), shoes: W('boots:1') },
    f: { top: W('coat:3 shirt:1 dress:1'), bottom: W('trousers:2 longskirt:1 slim:1'), waist: W('belt:1 none:1'), shoes: W('boots:1') },
  },
  sky: {
    m: { top: W('tank:2 tee:2 open:2 vest:1'), bottom: W('baggy:3 shorts:2 capri:1'), waist: W('sash:3 none:1'), shoes: W('sandals:4 bare:1') },
    f: { top: W('dress:2 tank:2 crop:2'), bottom: W('skirt:2 longskirt:2 baggy:1'), waist: W('sash:2 none:2'), shoes: W('sandals:4') },
  },
  fishman: {
    m: { top: W('open:3 tank:2 bare:2 vest:1 shirt:1'), bottom: W('shorts:3 baggy:2 trousers:1'), waist: W('sash:2 belt:2 none:1'), shoes: W('sandals:3 bare:2 boots:1') },
    f: { top: W('crop:2 tank:2 bikini:2 dress:1'), bottom: W('skirt:2 shorts:2 longskirt:1'), waist: W('none:2 sash:1'), shoes: W('sandals:3 bare:1') },
  },
};
const SASH = ['#f4c430', '#c62828', '#1e88e5', '#2e7d32', '#6a1b9a', '#ef6c00', '#fafafa', '#212121'];
const LIGHT = ['#f5f5f5', '#fff8e1', '#e3f2fd', '#fce4ec', '#e8f5e9'];
const STERN = { pirate: 0.55, bandit: 0.6, marine: 0.45, officer: 0.6, agent: 0.7, swordsman: 0.6 };
const FEM_ROLES = { civilian: 0.5, pirate: 0.3, bandit: 0.2, marine: 0.25, officer: 0.2, agent: 0.3, swordsman: 0.25, wano: 0.5, desert: 0.5, snow: 0.5, sky: 0.5, fishman: 0.3 };
// Body frames by role (render3d/chars/bones.js FRAME): a dock hand, a Marine
// and a clerk are built differently. (The frame's muscle tone, as there.)
const FRAME_ROLL = {
  m: {
    civilian: W('average:5 lean:2 slim:2 heavy:2 stocky:2 lanky:1 athletic:1'),
    pirate: W('average:3 lean:2 athletic:2 brawny:2 heavy:2 stocky:2 lanky:1'),
    bandit: W('average:2 lean:2 brawny:2 heavy:2 stocky:2 lanky:1'),
    marine: W('average:3 athletic:4 lean:2 brawny:1 stocky:1'),
    officer: W('average:3 athletic:3 brawny:1 heavy:1 slim:1'),
    agent: W('athletic:3 slim:2 lean:2 average:2'),
    swordsman: W('lean:3 athletic:3 average:2 slim:1 lanky:1'),
    wano: W('average:3 lean:2 athletic:2 stocky:1 heavy:1 brawny:1'),
    desert: W('average:3 lean:3 slim:2 heavy:1 lanky:1'),
    snow: W('average:3 heavy:2 stocky:2 brawny:1 lean:1'),
    sky: W('average:3 slim:2 lean:2 lanky:1'),
    fishman: W('athletic:3 brawny:3 average:2 heavy:1 stocky:1'),
  },
  f: {
    civilian: W('average:4 slim:2 curvy:2 petite:2 heavy:1'),
    fighter: W('average:3 athletic:3 slim:2 curvy:2 petite:1'),
    other: W('average:4 slim:2 curvy:2 petite:1 heavy:1 athletic:1'),
  },
};
const FIGHTERS = new Set(['pirate', 'bandit', 'marine', 'officer', 'agent', 'swordsman']);
const FRAME_MUS = { average: 0.55, lean: 0.75, athletic: 1.0, slim: 0.45, brawny: 1.2, heavy: 0.3, lanky: 0.28, stocky: 0.8 };

/**
 * Pick a body type and clothes for `role` into `look` (only where `over`,
 * the caller's explicit look, leaves them open).
 */
export function dress(look, rng, role = 'civilian', over = {}) {
  if (role === 'beast') {
    Object.assign(look, { fem: false, topStyle: 'bare', bottomStyle: 'slim', waist: 'none', shoeStyle: 'bare', muscle: 0.8 });
    return look;
  }
  const set = DRESS[role] || DRESS.civilian;
  const fem = over.fem ?? rng.chance(FEM_ROLES[role] ?? 0.45);
  const T = set[fem ? 'f' : 'm'];
  look.fem = fem;
  const legacyTop = over.openShirt !== undefined || over.noSleeves || over.sleeve || over.vest;
  if (!over.topStyle && !legacyTop) look.topStyle = rng.weighted(T.top);
  if (!over.bottomStyle) look.bottomStyle = rng.weighted(T.bottom);
  if (!over.waist) look.waist = rng.weighted(T.waist);
  if (!over.shoeStyle && over.sandals === undefined) look.shoeStyle = rng.weighted(T.shoes);
  if (!over.top2) look.top2 = look.topStyle === 'striped' ? rng.pick(LIGHT) : look.topStyle === 'jacket' ? rng.pick(['#f5f5f5', '#f5f5f5', '#90caf9', '#fce4ec']) : undefined;
  if (!over.waistCol && (look.waist === 'sash' || look.waist === 'obi')) look.waistCol = rng.pick(SASH);
  if (look.topStyle === 'jacket' && !over.tie && rng.chance(0.5)) look.tie = rng.pick(['#212121', '#c62828', '#1e3a8a']);
  if (look.topStyle === 'coat' && !over.coat) look.coat = rng.pick(['#5d4037', '#37474f', '#6d4c41', '#1b5e20', '#4a148c', '#263238']);
  // the frame (the big ones — bulk set by hand — keep their own)
  if (over.frame === undefined && !((over.bulk ?? look.bulk ?? 1) > 1.1)) {
    let set = fem ? FRAME_ROLL.f[role === 'civilian' ? 'civilian' : FIGHTERS.has(role) ? 'fighter' : 'other'] : FRAME_ROLL.m[role] || FRAME_ROLL.m.civilian;
    // (long legs are long enough: no lanky or stocky on top)
    if (look.legs > 1.2) set = set.filter(([k]) => k !== 'lanky' && k !== 'stocky' && k !== 'petite');
    look.frame = rng.weighted(set);
  }
  if (fem) {
    if (!over.hair && rng.chance(0.75)) look.hair = rng.pick(['long', 'long', 'wavy', 'ponytail', 'bun', 'bob', 'twintails', 'braid', 'short', 'curly', 'sidefringe']);
    if (!over.eyeShape) look.eyeShape = rng.pick(['soft', 'round', 'round', 'sharp']);
    look.bust = +(0.8 + rng.next() * 0.45).toFixed(2);
  } else if (over.muscle === undefined) {
    // (toned about as the frame is, give or take)
    const m = (FRAME_MUS[look.frame] ?? 0.55) + (rng.next() - 0.5) * 0.4;
    look.muscle = +Math.min(1.2, Math.max(0.15, m)).toFixed(2);
  }
  // fighters wear a harder face
  if (over.frown === undefined && rng.chance(STERN[role] ?? 0.15)) look.frown = true;
  return look;
}

export function makeLook(raceId, seed, overrides = {}) {
  const rng = new RNG(seed);
  const race = RACES[raceId] || RACES.human;
  const look = {
    race: raceId,
    seed: rng.int(0, 1000),
    skin: rng.pick(HUMAN_SKIN),
    hairColor: rng.pick(HAIR),
    hair: rng.pick(HAIRSTYLES),
    top: rng.pick(TOPS),
    bottom: rng.pick(BOTTOMS),
    shoes: rng.pick(['#3b2a1a', '#2d3436', '#8d6e4a', '#c8a878']),
    // (most eyes are dark, as in the manga; a few are coloured)
    eyeColor: rng.pick(['#222', '#222', '#3b2a1a', '#3b2a1a', '#4a3426', '#2b2f3a', '#1e3799', '#27ae60']),
    scale: race.scale || 1,
    hat: null,
    openShirt: rng.chance(0.25),
  };
  if (raceId === 'fishman') {
    const k = rng.pick(FISHMAN_KINDS);
    look.skin = k.skin; look.fin = true; look.gills = true; look.kind = k.name; look.grin = rng.chance(0.5); look.sharpTeeth = true;
    look.hairColor = rng.pick(['#1e1e1e', '#2c3e50', '#16a085', '#8e44ad']);
  } else if (raceId === 'mink') {
    const k = rng.pick(MINK_KINDS);
    look.ears = k.ears; look.fur = k.fur; look.tail = k.tail; look.muzzle = k.muzzle; look.kind = k.name; look.furFace = rng.chance(0.6);
    look.skin = k.fur; look.hairColor = k.fur; look.hand = k.fur;
  } else if (raceId === 'skypiean') {
    look.wings = 'sky'; look.hairColor = rng.pick(['#f5f6fa', '#fdcb6e', '#dfe6e9', '#74b9ff', '#f7d794']); look.top = rng.pick(['#f5f6fa', '#dff9fb', '#f6e58d']);
  } else if (raceId === 'longarm') {
    look.arms = 1.8; look.top = rng.pick(['#c0392b', '#2c3e50', '#27ae60']);
  } else if (raceId === 'longleg') {
    look.legs = 1.9;
  } else if (raceId === 'buccaneer') {
    look.bulk = 1.25; look.skin = rng.pick(['#c68642', '#a0643a', '#7a4a2a']);
  } else if (raceId === 'three_eye') {
    look.thirdEye = true; look.eyeColor = '#8e44ad';
  } else if (raceId === 'lunarian') {
    look.wings = 'lunar'; look.backFlame = true; look.skin = rng.pick(['#7a4a2a', '#5c3a21', '#8d5524']); look.hairColor = '#f5f6fa'; look.hair = rng.pick(['long', 'spiky', 'short']);
  }
  const { role, ...over } = overrides;
  dress(look, rng, role || (raceId === 'fishman' ? 'fishman' : raceId === 'skypiean' ? 'sky' : 'civilian'), over);
  if (look.race === 'buccaneer' || look.race === 'giant') look.fem = over.fem ?? look.fem;
  return Object.assign(look, over);
}

export function raceLabel(look) {
  const r = RACES[look.race] || RACES.human;
  return look.kind ? `${r.name} (${look.kind})` : r.name;
}
