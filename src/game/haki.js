// Haki's rules that more than one system reads: the personal signature every
// character is born with (the colour of their Conqueror's lightning, the tint
// of their Observation, the sheen on their Armament, the voice their Haki
// sounds in), how far a coat of Armament spreads at each level, Ryou, the
// reach of Observation, the odds of a king's birth, how each Haki is
// obtained, and when two Conqueror's clash.
//
// As in the anime, Armament is black for everyone (only a faint sheen on its
// rim is your own); Conqueror's lightning is black-cored too, but its glow is
// as personal as a voice — red is the most common, a few are born violet,
// gold, azure, emerald, white, rose... Nothing here draws or plays anything:
// the renderer (render3d/chars/haki.js, render/combatfx.js) and the audio
// (audio/sfx.js) read it.
import { RNG, hashString } from '../core/rng.js';

/** Conqueror's colours (the glow round the black lightning), with how often each is born (weights). */
export const CONQUEROR_COLOURS = [
  { id: 'crimson', name: 'Crimson', hex: '#ff1a3c', w: 28 },
  { id: 'violet', name: 'Violet', hex: '#a64dff', w: 15 },
  { id: 'gold', name: 'Gold', hex: '#ffc21a', w: 10 },
  { id: 'azure', name: 'Azure', hex: '#2e8bff', w: 10 },
  { id: 'amber', name: 'Amber', hex: '#ff7417', w: 9 },
  { id: 'rose', name: 'Rose', hex: '#ff4fa8', w: 8 },
  { id: 'emerald', name: 'Emerald', hex: '#17e07c', w: 8 },
  { id: 'white', name: 'White', hex: '#eef4ff', w: 6 },
  { id: 'cyan', name: 'Cyan', hex: '#21e3f0', w: 6 },
];
/** Observation's tints: pale, a subtle colour on the sonar pulse and the wills you sense. */
export const OBSERVATION_TINTS = [
  { id: 'lilac', name: 'Lilac', hex: '#d9b8ff' },
  { id: 'ice', name: 'Ice', hex: '#b8ecff' },
  { id: 'mint', name: 'Mint', hex: '#bfffe0' },
  { id: 'pearl', name: 'Pearl', hex: '#f2f0ff' },
  { id: 'blush', name: 'Blush', hex: '#ffc9e2' },
  { id: 'honey', name: 'Honey', hex: '#fff0b8' },
];
/** Armament's sheen: the faint colour of the hard highlight on a black coat. */
export const ARMAMENT_SHEENS = [
  { id: 'violet', name: 'Violet sheen', hex: '#9d8cff' },
  { id: 'steel', name: 'Steel sheen', hex: '#8fb8ff' },
  { id: 'bronze', name: 'Bronze sheen', hex: '#ffc78a' },
  { id: 'jade', name: 'Jade sheen', hex: '#9dffd6' },
  { id: 'silver', name: 'Silver sheen', hex: '#e8ecf5' },
  { id: 'wine', name: 'Wine sheen', hex: '#ff8aa8' },
];

const pickW = (rng, list) => {
  let t = 0;
  for (const c of list) t += c.w || 1;
  let r = rng.next() * t;
  for (const c of list) if ((r -= c.w || 1) < 0) return c;
  return list[list.length - 1];
};

/**
 * A character's Haki signature, from their seed (the same seed always gives
 * the same signature: a new character's from their birth, an old save's the
 * same way from the seed it already has). { conqueror, observation,
 * armament: '#rrggbb', voice: 0..1 (how their Haki sounds) }.
 */
export function hakiSignature(seed) {
  const rng = new RNG(`${seed}:haki`);
  const conqueror = pickW(rng, CONQUEROR_COLOURS).hex;
  const observation = OBSERVATION_TINTS[Math.floor(rng.next() * OBSERVATION_TINTS.length)].hex;
  const armament = ARMAMENT_SHEENS[Math.floor(rng.next() * ARMAMENT_SHEENS.length)].hex;
  const voice = Math.round(rng.next() * 1000) / 1000;
  return { conqueror, observation, armament, voice };
}

/** The signature of a character record: its own, or (an old save) made from its seed. */
export function charSignature(c) {
  if (!c) return hakiSignature('nobody');
  return c.hakiSig || hakiSignature(c.runSeed ?? hashString(String(c.id || c.name || 'nobody')));
}

/**
 * An NPC's signature: its definition's own (`hakiSig`, any of the fields —
 * the Emperors' canonical colours), over one hashed from its id.
 */
export function npcHakiSig(def) {
  const base = hakiSignature(def?.id || def?.name || 'npc');
  return def?.hakiSig ? { ...base, ...def.hakiSig } : base;
}

const FALLBACK = new WeakMap();
/** Anyone's signature: theirs, or one made (once) from who they are. */
export function sigOf(a) {
  if (!a) return hakiSignature('nobody');
  if (a.hakiSig) return a.hakiSig;
  let s = FALLBACK.get(a);
  if (!s) { s = hakiSignature(a.npcId || a.name || 'someone'); FALLBACK.set(a, s); }
  return s;
}

/** The name of a Haki colour (for the Character panel): "Crimson", "Lilac", "Steel sheen"... */
export function colourName(hex) {
  const h = String(hex || '').toLowerCase();
  for (const L of [CONQUEROR_COLOURS, OBSERVATION_TINTS, ARMAMENT_SHEENS]) for (const c of L) if (c.hex === h) return c.name;
  return h;
}

/** The aura of a body wreathed in Conqueror's Infusion: near black, deep in the king's own colour. */
export function infusedAura(a) {
  const h = sigOf(a).conqueror, n = parseInt(h.slice(1), 16);
  return `rgba(${Math.round(((n >> 16) & 255) * 0.32)},${Math.round(((n >> 8) & 255) * 0.32)},${Math.round((n & 255) * 0.32)},0.85)`;
}

// ------------------------------------------------------------------ Armament
/**
 * How far a coat of Armament spreads, 0 (nothing) to 1 (the whole limb), as
 * a fraction of the limb from its tip (fingertips, toes) to the joint it
 * hangs from: a beginner's covers the fists, then the forearms, then
 * (level 70 or so) the whole arms, as the masters' do.
 */
export function armamentReach(lvl) {
  const L = Math.max(0, lvl || 0);
  if (L <= 0) return 0;
  if (L < 15) return 0.2;
  if (L < 40) return 0.2 + (L - 15) / 25 * 0.36;
  return Math.min(1.02, 0.56 + (L - 40) / 30 * 0.46);
}
/** Seconds a coat takes to spread from the fingertips up to its reach (and to fall away). */
export const COAT = { spread: 0.3, fall: 0.16 };
/** Of a blow, how much Armament's hardening takes off while it's on. */
export function hardening(lvl) { return Math.min(0.4, 0.12 + (lvl || 0) * 0.003); }

/**
 * Ryou (emission): from level RYOU.level a master's Armament no longer stops
 * at the skin — a blow pushes it into what it hits: it passes a guard, it
 * reaches a Logia, and a little more of it destroys from the inside.
 */
export const RYOU = { level: 60, internal: 0.15, guard: 0.55 };
/** Does this actor strike with Ryou just now (Armament on, at Ryou's level)? */
export function hasRyou(a) { return !!(a && a.armament && (a.hakiLevel?.('armament') || 0) >= RYOU.level); }

// ------------------------------------------------------------------ Observation
/** How far (m) Observation senses the wills of those about you. */
export function senseRange(lvl) { return 14 + Math.min(100, lvl || 0) * 0.16; }
/** Seconds sooner a foe's wind-up is read (the glint) with Observation on. */
export function readSooner(lvl) { return 0.08 + Math.min(100, lvl || 0) * 0.0012; }
/** From this level of Observation, Future Sight shows a vision of the blow before it lands. */
export const FUTURE_SIGHT = 65;

// ------------------------------------------------------------------ Conqueror's
/**
 * The odds of being born with the qualities of a king: rare, as canon has
 * it, more often among those who carry the Will of D., and the Kingly
 * Bloodline (a legacy perk) multiplies either.
 */
export const KING = { base: 0.04, withD: 0.4, bloodline: 4 };
export function kingChance(hasD, bloodline) { return Math.min(1, (hasD ? KING.withD : KING.base) * (bloodline ? KING.bloodline : 1)); }

/**
 * Does a Conqueror's burst from `a` meet `b`'s and clash, instead of washing
 * over them? Both kings (Conqueror's awakened), foes, within the burst's
 * reach, and at least one of them a boss or the player: the clash of the
 * two wills that splits the sky.
 */
export function clashes(a, b, dist, range) {
  if (!a || !b || a === b) return false;
  if (!((a.hakiLevel?.('conqueror') || 0) > 0 && (b.hakiLevel?.('conqueror') || 0) > 0)) return false;
  if (b.state && b.state !== 'idle') return false;
  if (!(a.isPlayer || a.boss) || !(b.isPlayer || b.boss)) return false;
  return dist <= range;
}

// ------------------------------------------------------------------ how each is obtained
export const HAKI_HOW = {
  armament: 'Hardened in hard fights (Strength 22+, or weapon mastery 35+) — or taught by a Haki master.',
  observation: 'Sharpened by dodging danger (Agility 22+, or many dodges) — or taught.',
  conqueror: 'Cannot be taught. One in millions is born with the qualities of a king; if it\'s in you, it wakes the day your will is truly tested.',
};
