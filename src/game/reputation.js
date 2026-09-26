// Reputation: how ordinary people see you (the bounty is how the World
// Government sees you). It runs from -100 to +100.
//  * Crimes — robbing shops and houses, picking pockets, beating townsfolk,
//    attacking merchant ships — lower it. Sink to OUTLAW (-25) and the world
//    treats you as a pirate.
//  * Good deeds — finishing quests, freeing islands, defeating pirates — raise
//    it. A good name and a clean record are what the Marines ask of recruits,
//    and every Marine promotion needs a better one.
import { addItem, earn } from './inventory.js';
import { persist } from './lineage.js';
import { threatFactor } from './stats.js';
import { clamp, formatBerries } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { questDef } from './quests.js';

export const REP_TIERS = [
  { min: 75, name: 'Hero of the Seas', color: '#2e7d32' },
  { min: 50, name: 'Honourable', color: '#388e3c' },
  { min: 25, name: 'Respected', color: '#558b2f' },
  { min: 8, name: 'Well-liked', color: '#689f38' },
  { min: -7, name: 'Unknown', color: '#6d4c33' },
  { min: -24, name: 'Suspicious', color: '#e65100' },
  { min: -59, name: 'Outlaw', color: '#c62828' },
  { min: -100, name: 'Villain', color: '#b71c1c' },
];
export const OUTLAW_AT = -25;
export const ENLIST_REP = 25;

export function repTier(rep = 0) { return REP_TIERS.find((t) => rep >= t.min) || REP_TIERS[REP_TIERS.length - 1]; }

const CRIMINALS = new Set(['pirate', 'bandit', 'baroque', 'zombie', 'rival']);
const SEA_TIER = { east_blue: 1, north_blue: 1.2, west_blue: 1.2, south_blue: 1.2, paradise: 3, calm_belt: 3, sky: 3, undersea: 4, red_line: 5, new_world: 6 };

/** Change reputation (and handle what that means). */
export function changeRep(game, delta, why, { quiet = false } = {}) {
  const c = game.state?.char;
  if (!c || !delta) return 0;
  const before = c.reputation || 0;
  c.reputation = clamp(Math.round((before + delta) * 10) / 10, -100, 100);
  const d = Math.round((c.reputation - before) * 10) / 10;
  if (!d) return 0;
  if (!quiet) game.log(`Reputation ${d > 0 ? '+' : ''}${d}${why ? ' — ' + why : ''}`, d > 0 ? '#a5d6a7' : '#ef9a9a');
  const t0 = repTier(before), t1 = repTier(c.reputation);
  if (t0 !== t1 && !quiet) game.ui.toast(t1.name.toUpperCase(), 'Your reputation has changed.', d > 0 ? '#a5d6a7' : '#ef9a9a');
  // falling from grace
  if (c.reputation <= OUTLAW_AT && before > OUTLAW_AT && c.faction === 'civilian') {
    c.faction = 'pirate';
    game.ui.banner('OUTLAW', 'Word of your crimes has spread', 'The world now sees you as a pirate. The Marines will not take you — and some of them will come for you.', 5);
    if (!c.bounty) game.progression?.addBounty(2000000, 'crimes against the people');
  }
  // a Marine who commits crimes is thrown out of the service
  if (c.faction === 'marine' && d < 0 && c.reputation < 0) {
    c.flags.formerMarine = c.marineRank;
    c.faction = 'civilian';
    c.marineRank = null;
    c.marineMission = null;
    game.ui.toast('DISCHARGED', 'The Marines will not tolerate a criminal in their ranks.', '#ff5252');
    game.emit('marineRankChanged', null);
  }
  game.emit('reputationChanged', c.reputation, d);
  return d;
}

/** Nearby Marines and guards hear the shout and come running. */
export function raiseAlarm(game, x, y, crime = 'Thief') {
  const p = game.player;
  let n = 0;
  for (const a of game.actors) {
    if (a === p || a.state !== 'idle' || !a.controller) continue;
    const guard = a.faction === 'marine' || a.faction === 'guard' || a.def?.guard;
    if (!guard || game.world.distance(a.x, a.y, x, y) > 22) continue;
    a.aggroPlayer = true;
    a.provoked = true;
    a.controller.target = p;
    a.controller.state = 'chase';
    n++;
  }
  game.fx.text(x, y - 2.2, `${crime.toUpperCase()}!`, '#ff5252', 0.5, { life: 1.6 });
  return n;
}

function seaTier(game) {
  const sea = game.currentIsland?.def?.sea || game.world?.seaId;
  return SEA_TIER[sea] || 1;
}

function stealChance(game, bonus = 0) {
  const p = game.player;
  const stealth = p.buffs?.some((b) => b.mods?.stealth) ? 0.35 : 0;
  return clamp(0.3 + p.attrs.agi * 0.006 + stealth + bonus, 0.08, 0.92);
}

/** Try to steal one item from a shop counter. Returns 'ok' | 'caught'. */
export function stealFromShop(game, itemId, building, price = 0) {
  const c = game.state.char, p = game.player;
  const expensive = price > 20000 ? -0.2 : price > 5000 ? -0.1 : 0;
  const key = shopKey(building);
  if (Math.random() < stealChance(game, expensive)) {
    addItem(game, itemId, 1);
    changeRep(game, -6, 'stole from a shop');
    game.progression?.train('agi', 1.5);
    c.stats.thefts = (c.stats.thefts || 0) + 1;
    game.audio?.sfx('coin');
    return 'ok';
  }
  c.flags['banned_' + key] = game.env.day;
  changeRep(game, -9, 'caught stealing');
  raiseAlarm(game, p.x, p.y, 'Thief');
  game.ui.toast('CAUGHT!', 'The shopkeeper grabs your wrist and screams for the guards.', '#ff5252');
  return 'caught';
}
export const shopKey = (b) => b?.id || b?.name || 'shop';
export const bannedFromShop = (game, b) => game.state.char.flags['banned_' + shopKey(b)] === game.env.day;

/** Force a door and ransack the house. */
export function robHouse(game, b) {
  const c = game.state.char, p = game.player;
  const key = 'robbed_' + (b.id || `${Math.round(b.x)}_${Math.round(b.y)}`);
  if (c.world.chests[key]) { game.log('You already cleaned this place out.', '#b0bec5'); return; }
  c.world.chests[key] = true;
  const rng = new RNG(key + c.runSeed);
  const tier = seaTier(game);
  const berries = Math.round(rng.range(150, 900) * tier);
  earn(game, berries, 'stolen');
  if (rng.chance(0.3)) addItem(game, rng.pick(['meat', 'rice_ball', 'sake', 'gold_coins', 'bandage', 'jewels']), 1);
  changeRep(game, -10, 'robbed a house');
  c.stats.thefts = (c.stats.thefts || 0) + 1;
  if (!rng.chance(stealChance(game))) {
    raiseAlarm(game, p.x, p.y, 'Burglar');
    changeRep(game, -3, 'seen breaking in', { quiet: true });
  }
  game.audio?.sfx('treasure');
  persist(game);
}

/** Lift a purse from a passer-by. */
export function pickpocket(game, a) {
  const c = game.state.char;
  const key = 'pp_' + (a.talk?.seed ?? a.name);
  if (c.flags[key] === game.env.day) { game.log('Their pockets are already empty.', '#b0bec5'); return 'empty'; }
  c.flags[key] = game.env.day;
  if (Math.random() < stealChance(game, 0.1)) {
    const amount = Math.round((20 + Math.random() * 180) * seaTier(game));
    earn(game, amount, `lifted from ${a.name}`);
    changeRep(game, -4, 'picked a pocket');
    game.progression?.train('agi', 1);
    c.stats.thefts = (c.stats.thefts || 0) + 1;
    return 'ok';
  }
  changeRep(game, -6, 'caught picking a pocket');
  raiseAlarm(game, a.x, a.y, 'Pickpocket');
  return 'caught';
}

export function installReputation(game) {
  game.reputation = { change: (d, why, o) => changeRep(game, d, why, o), tier: () => repTier(game.state?.char?.reputation || 0) };
  game.on('questDone', (id) => {
    const d = questDef(id);
    if (!d || d.noRep) return;
    const r = d.rewards || {};
    let amount = d.rep ?? (r.liberate ? 15 : d.kind === 'story' || d.kind === 'main' ? 6 : 4);
    if (amount) changeRep(game, amount, r.liberate ? `freed ${r.liberate}` : d.name);
  });
  game.on('knockout', (a, att) => {
    const c = game.state?.char, p = game.player;
    if (!c || !p || a.isPlayer || a.spar || a.def?.duel) return;
    if (att && !att.isPlayer && (att.crewId || att.summonedBy?.isPlayer)) att = p;
    if (!att?.isPlayer) return;
    if (a.faction === 'civilian' && !a.def?.hostile) changeRep(game, -6, 'beat up an innocent');
    else if ((a.faction === 'marine' || a.faction === 'cp') && c.faction !== 'marine' && !c.bounty) changeRep(game, -3, 'attacked the Marines');
    else if (CRIMINALS.has(a.faction)) {
      const tf = threatFactor(a.power(), p.power());
      if (a.boss || a.named) changeRep(game, a.boss ? 4 : 2, `defeated ${a.name}`);
      else if (tf > 0.3) changeRep(game, 0.5, null, { quiet: true });
    }
  });
  game.on('shipSunk', (s) => {
    if (!s.lastHitBy?.isPlayer) return;
    if (s.faction === 'civilian') changeRep(game, -10, 'sank a merchant ship');
    else if (s.faction === 'pirate') changeRep(game, 2, 'sank a pirate ship', { quiet: true });
  });
  void formatBerries;
}
