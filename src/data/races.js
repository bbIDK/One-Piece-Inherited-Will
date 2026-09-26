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
  },
  fishman: {
    name: 'Fish-Man', rarity: 'uncommon', weight: 13,
    desc: 'Born with ten times the strength of a human and the sea in their blood. Many followed Arlong to the East Blue.',
    origin: 'Born near Arlong Park in the Conomi Islands (East Blue).',
    stats: { str: 4, agi: 0, end: 2, vit: 1, wil: 0 },
    lives: 3,
    traits: ['Gills: breathe underwater — never drown (unless a Devil Fruit user)', 'Swims 3× faster, no stamina drain', 'Fish-Man Karate affinity: learns it 30% faster'],
    spawnSeas: ['east_blue'], spawnTowns: ['arlong_park', 'cocoyasi'],
    swim: 3, hpMul: 1.1, gills: true,
  },
  mink: {
    name: 'Mink', rarity: 'uncommon', weight: 12,
    desc: 'The Warrior Beast Tribe. Every Mink is born a fighter and can channel Electro through their fur.',
    origin: 'Born among wandering Mink traders who settled in the wilds of the South Blue.',
    stats: { str: 1, agi: 4, end: 1, vit: 0, wil: 0 },
    lives: 3,
    traits: ['Electro: basic attacks can shock (innate)', 'Keen senses: +10% dodge window', 'Sulong: awakened under the full moon (hidden)'],
    spawnSeas: ['south_blue'], spawnTowns: ['torino_village', 'karate_dojo_town'],
    swim: 1, hpMul: 1, electro: true,
  },
  skypiean: {
    name: 'Skypiean', rarity: 'uncommon', weight: 10,
    desc: 'A winged people of the White Sea. You fell from the clouds as a child and washed ashore at Lvneel, homeland of Noland the Liar.',
    origin: 'Fell from a sky island; raised in Lvneel (North Blue).',
    stats: { str: 0, agi: 2, end: 0, vit: 0, wil: 3 },
    lives: 3,
    traits: ['Mantra: once their sixth sense awakens, it grows twice as fast', 'Light-footed: dodge travels 30% further', 'Dial-savvy: dials are 25% stronger'],
    spawnSeas: ['north_blue'], spawnTowns: ['lvneel_town'],
    swim: 0.9, hpMul: 0.95,
  },
  longarm: {
    name: 'Longarm Tribe', rarity: 'rare', weight: 5,
    desc: 'Two elbows on each arm — the "Friend Elbow" and the "Lover Elbow". Your reach is feared across the North Blue.',
    origin: 'Born in a Longarm enclave at Notice (North Blue).',
    stats: { str: 3, agi: 0, end: 1, vit: 0, wil: 0 },
    lives: 3,
    traits: ['Long reach: +45% melee range', 'Double-jointed: punches hit twice as fast at max reach'],
    spawnSeas: ['north_blue'], spawnTowns: ['notice_town'],
    swim: 1, hpMul: 1, reach: 1.45,
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
  },
  buccaneer: {
    name: 'Buccaneer', rarity: 'epic', weight: 2.2,
    desc: 'A giant-framed race hunted almost to extinction. Bartholomew Kuma was born to your people in the South Blue.',
    origin: 'Born in the Sorbet Kingdom (South Blue).',
    stats: { str: 5, agi: -2, end: 5, vit: 4, wil: 0 },
    lives: 3,
    traits: ['Huge frame: +35% HP', 'Unshakable: cannot be staggered by light attacks', 'Slow: -8% move speed'],
    spawnSeas: ['south_blue'], spawnTowns: ['sorbet_town'],
    swim: 0.9, hpMul: 1.35, scale: 1.3,
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
  },
  lunarian: {
    name: 'Lunarian', rarity: 'legendary', weight: 0.5,
    desc: 'A people of the "Land of Gods" atop the Red Line, believed extinct. Black wings, white hair, and a flame that never goes out.',
    origin: 'Washed up alone on an uncharted islet in one of the Blues.',
    stats: { str: 2, agi: 1, end: 5, vit: 5, wil: 2 },
    lives: 4,
    traits: ['Ignition: attacks can burn; flame on your back halves damage taken while lit', 'Tremendous vitality: +1 life', 'Wings: dodge becomes a short flight'],
    spawnSeas: ['east_blue', 'north_blue', 'west_blue', 'south_blue'], spawnIslet: true,
    swim: 1, hpMul: 1.15,
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
const HAIRSTYLES = ['short', 'spiky', 'long', 'ponytail', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald'];

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
    eyeColor: rng.pick(['#222', '#3b2a1a', '#1e3799', '#27ae60', '#6c5ce7']),
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
  return Object.assign(look, overrides);
}

export function raceLabel(look) {
  const r = RACES[look.race] || RACES.human;
  return look.kind ? `${r.name} (${look.kind})` : r.name;
}
