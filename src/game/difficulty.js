// How hard a fight is, by where it happens. The four Blues, where every
// pirate starts, are forgiving: foes wind their blows up long and slow and
// take turns at you, leave a gap to punish after a big swing, hit softer and
// never parry; a glint on them shows the moment to parry (yellow: parry it,
// red: it smashes guards — dodge it); a boss's guard-breaking blows come
// seldom and never twice running; and nobody holds you helpless in a flurry
// of blows for long. Paradise asks more of you, the New World everything.
//
// Every number a fight is tuned by lives here, one row per tier (see
// combat.js for the parry rules, abilities.js for wind-ups and the glint,
// ai.js for how foes pace themselves).
import { regionAt, REGION, isBlue } from '../world/constants.js';

export const TIERS = {
  blue: {
    id: 'blue',
    // the parry: how long after the guard comes up a blow can still be parried
    // (s), the start of that which is a perfect parry, and how plain the glint
    // that shows the moment is (1: unmissable; Observation Haki makes it so anywhere)
    parry: 0.3, perfect: 0.09, cue: 1, cueLead: 0.36,
    // foes' wind-ups (s): the first blow of a string at least windupMin, a
    // longer one stretched (× windupMul + windupAdd); a follow-up in a combo at least chainWindup
    windupMin: 0.46, windupMul: 1.15, windupAdd: 0.05, chainWindup: 0.26,
    // pacing: the pause between a foe's attacks (×), how many more blows they
    // may string onto one (at most), the gap they leave after a big move (s),
    // how much less often they guard, and their parries (chance a guard is one)
    think: 1.8, combo: 1, rest: 0.9, block: 0.5, npcParry: 0,
    // what their blows do to you (×), a boss's guard-breaking blows at least this
    // far apart (s), and how close a gunner will still shoot you from (nearer, they back off first)
    dmg: 0.62, breakGap: 6, closeShot: 2.4,
    // a flurry: after this many blows in a row (or this long held stunned) you break free;
    // a smashed guard staggers you this long (s); this many foes may go for you at once
    stunHits: 3, stunCap: 1, gbStun: 0.6, turns: 1,
  },
  paradise: {
    id: 'paradise',
    parry: 0.25, perfect: 0.07, cue: 0.6, cueLead: 0.3,
    windupMin: 0.26, windupMul: 1.08, windupAdd: 0.03, chainWindup: 0.14,
    think: 1.2, combo: 2, rest: 0.5, block: 0.8, npcParry: 0.15,
    dmg: 0.9, breakGap: 3.5, closeShot: 1.6,
    stunHits: 4, stunCap: 1.4, gbStun: 0.85, turns: 2,
  },
  newWorld: {
    id: 'newWorld',
    parry: 0.21, perfect: 0.06, cue: 0.35, cueLead: 0.26,
    windupMin: 0.16, windupMul: 1, windupAdd: 0, chainWindup: 0.07,
    think: 1, combo: 2, rest: 0.25, block: 1, npcParry: 0.3,
    dmg: 1, breakGap: 1.5, closeShot: 0,
    stunHits: 5, stunCap: 1.8, gbStun: 1.1, turns: 3,
  },
};

// The parry's other rules, the same everywhere.
export const PARRY = {
  lockout: 0.35, // s: a guard raised again sooner than this after F was let go has no parry in it (mashing doesn't work)
  buffer: 0.3, // s: a press made while the guard can't come up yet (a basic swing's follow-through) still counts if it comes up this soon
  observation: 0.04, // s more to parry in with Observation Haki on
  reel: 1, // s a parried foe reels, posture broken (a boss for 0.7 of it; a perfect parry adds perfectReel)
  perfectReel: 0.3,
  bossReel: 0.7,
  playerReel: 0.6, // s you reel when a foe parries you
  counterMul: 1.5, perfectCounterMul: 1.8, // the counter strike's damage
  counterStun: 0.5, // s it staggers them (through a boss's poise)
  heal: 0.05, haki: 8, parryHaki: 3, // a perfect parry gives back this much health (of the max) and Haki; a parry, Haki
};

/** The tier of a fight at (x, y): the Blues, Paradise (and the Grand Line's other worlds, the Red Line, the Calm Belts), or the New World. */
export function tierAt(game, x, y) {
  if (!game?.world || (game.surface && game.world !== game.surface)) return TIERS.paradise;
  const r = regionAt(x, y);
  return isBlue(r) ? TIERS.blue : r === REGION.NEW_WORLD ? TIERS.newWorld : TIERS.paradise;
}

/** The tier where an actor stands. */
export const tierOf = (game, a) => tierAt(game, a.x, a.y);

/**
 * How long a foe's blow takes to land (s) once they start it, for a wind-up
 * of `w` seconds: stretched in the gentler seas so it can be read (and the
 * moment to parry it seen coming). `chained`: a follow-up in a combo.
 */
export function stretchWindup(T, w, chained) {
  if (!(w > 0)) return w;
  if (chained) return Math.max(T.chainWindup, w);
  return Math.max(T.windupMin, w * T.windupMul + T.windupAdd);
}
