// Creative mode (turned on in the pause menu): fly anywhere (double-tap Space;
// Space rises, C sinks, Shift goes fast, and nothing is solid), come to no
// harm, see the whole chart and travel by clicking it — and a command line
// (press /) for the rest: moving time and weather, handing out things,
// calling up foes to fight. The creative panel (F1, ui/creativePanel.js) does
// it all with a click, and more besides: any Devil Fruit, another race, Haki,
// attributes, bosses, ships and Sea Kings — everything there is to try out.
import { ITEMS } from '../data/items.js';
import { FRUITS, unlockedFruitTechniques } from '../data/fruits.js';
import { RACES, makeLook, MINK_KINDS, FISHMAN_KINDS } from '../data/races.js';
import { HAKI_ABILITIES } from '../data/haki.js';
import { SHIPS } from '../data/ships.js';
import { ATTR_KEYS, ATTR_CAP } from './stats.js';
import { addItem, earn, count } from './inventory.js';
import { makeEnemy, makeNPC, npcDef, allNpcDefs, ARCHETYPES } from './npcs.js';
import { findShore } from './interact.js';
import { refreshPlayer, hakiKnown, needsHaki } from './lineage.js';
import { getAbility } from './abilities.js';
import { addToHotbar } from './hotbar.js';
import { makeSeaKing } from './sea.js';
import { FISH } from './sealife.js';
import { aggro } from '../content/helpers.js';
import { clamp, roundBounty, TAU } from '../core/math.js';
import { h } from '../ui/dom.js';

const HELP = [
  'F1 — the creative panel: fruits, items, races, Haki, foes, ships, the world',
  'fly — take off or land (or double-tap Space)',
  'tp <island> — go to an island (part of its name will do)',
  'tp <x> <y> — go to a spot on the chart',
  'time <0-24> — set the hour',
  'weather clear | rain | storm | snow | fog | heat | dust | sandstorm | calm | … — change the weather',
  'give <item> [how many] — e.g. give meat 5',
  'fruit <name> — a Devil Fruit, e.g. fruit gomu',
  'race <name> — become another race, e.g. race mink',
  'berries <amount>',
  'heal — full health and air',
  'spawn <bandit | pirate | marine | brute> [level] — someone to fight',
  'speed <1-5> — how fast you fly',
  'creative off — back to normal play',
];

const WEATHER = { clear: 0, sun: 0, rain: 0.45, squall: 0.45, storm: 0.95 };

// ------------------------------------------------------------ Devil Fruits
// Every Devil Fruit exists once (content/fruits.js): one handed to you comes
// from wherever it is — out of the ground where it grows, if it's still out
// there in the world — so there's still only the one. A canon user's power
// (Buggy's, Crocodile's) you're given a copy of: theirs is theirs, and the
// fruit is never rolled into the world either way.

/**
 * Where a Devil Fruit is just now: { kind: 'eaten' | 'bag' | 'world' (still
 * growing) | 'picked' (grew, and was taken) | 'npc' (a canon user's) |
 * 'taken' (rolled into a chest or a drop) | 'free', … }.
 */
export function fruitWhere(game, id) {
  const c = game.state?.char;
  if (!c || !FRUITS[id]) return null;
  if (c.fruit === id) return { kind: 'eaten' };
  const n = count(c, 'fruit_' + id);
  if (n) return { kind: 'bag', n };
  const spots = (c.world?.fruitSpawns || []).filter((f) => f.fruit === id);
  const spot = spots.find((f) => !f.taken) || spots[0];
  const island = spot && ((game.surface?.islands || []).find((i) => i.id === spot.island)?.name || 'an island');
  if (spot) return { kind: spot.taken ? 'picked' : 'world', island };
  const user = allNpcDefs().find((d) => d.fruit === id);
  if (user) return { kind: 'npc', name: user.name };
  if ((c.world?.fruitsTaken || []).includes(id)) return { kind: 'taken' };
  return { kind: 'free' };
}

/** Put a Devil Fruit in your bag (eat it from there, or from your hand, the usual way). */
export function giveFruit(game, id) {
  const c = game.state?.char;
  if (!c || !FRUITS[id]) return false;
  // (yours already: in your bag, or in you)
  if (c.fruit === id || count(c, 'fruit_' + id)) return false;
  for (const f of c.world?.fruitSpawns || []) {
    if (f.fruit !== id || f.taken) continue;
    f.taken = true;
    game.groundItems = (game.groundItems || []).filter((it) => it.fruitSpawn !== f);
  }
  return addItem(game, 'fruit_' + id, 1);
}

/**
 * Take your Devil Fruit's power away again (to eat another, or the same one
 * afresh): its techniques, the buffs they left on you, the hold it had on the
 * sea. (The world's count of fruits is left as it was: one that grew out
 * there is never rolled into the world again — see content/fruits.js.)
 */
export function removeFruit(game) {
  const c = game.state?.char, p = game.player;
  const fid = c?.fruit;
  if (!fid || !p) return null;
  const its = (id) => typeof id === 'string' && getAbility(id)?.fruit === fid;
  c.techniques = c.techniques.filter((id) => !its(id));
  c.hotbar = (c.hotbar || []).map((id) => (its(id) ? null : id));
  c.fruit = null;
  c.fruitMastery = 0;
  c.fruitsEaten = 0;
  p.buffs = p.buffs.filter((b) => !its(b.source));
  refreshPlayer(game);
  return fid;
}

/**
 * Set your Devil Fruit's mastery: you know just the techniques it opens up
 * (those that need Haki come out of hiding once it awakens, as ever).
 */
export function setFruitMastery(game, v) {
  const c = game.state?.char, p = game.player;
  if (!c?.fruit || !p) return 0;
  v = clamp(Math.round(v), 0, 100);
  const open = new Set(unlockedFruitTechniques(c.fruit, v));
  const its = (id) => typeof id === 'string' && getAbility(id)?.fruit === c.fruit;
  c.techniques = c.techniques.filter((id) => !its(id) || open.has(id));
  c.hotbar = (c.hotbar || []).map((id) => (its(id) && !open.has(id) ? null : id));
  for (const id of open) {
    if (c.techniques.includes(id)) continue;
    c.techniques.push(id);
    if (!(needsHaki(getAbility(id)) && !hakiKnown(c))) addToHotbar(c, id);
  }
  c.fruitMastery = p.fruitMastery = v;
  refreshPlayer(game);
  return open.size;
}

// ------------------------------------------------------------------ races
// The parts of a look that come with a race (data/races.js makeLook), and the
// colours a race decides for you: a Mink's fur is its skin and its hair, a
// Fish-Man's skin is his kind's, a Lunarian's hair is white. Changing to or
// from one of those takes the new race's; the rest of you — face, hair, build
// and clothes — stays as it was.
const RACE_PARTS = ['race', 'scale', 'fin', 'gills', 'kind', 'ears', 'fur', 'tail', 'muzzle', 'furFace', 'hand', 'wings', 'arms', 'legs', 'thirdEye', 'backFlame'];
const RACE_COLOURS = { fishman: ['skin', 'hairColor'], mink: ['skin', 'hairColor'], lunarian: ['skin', 'hairColor', 'hair'], three_eye: ['eyeColor'], skypiean: ['hairColor'], buccaneer: ['skin'] };

const seedOf = (s) => { let k = 7; for (const ch of String(s)) k = (k * 31 + ch.charCodeAt(0)) >>> 0; return k; };

/** `look` as someone of `race` (the race's own parts from a look of theirs seeded by `seed`). */
export function raceLook(look, race, seed) {
  const fresh = makeLook(race, seed);
  const out = { ...look };
  for (const k of RACE_PARTS) { delete out[k]; if (fresh[k] !== undefined) out[k] = fresh[k]; }
  for (const k of new Set([...(RACE_COLOURS[look.race] || []), ...(RACE_COLOURS[race] || [])])) if (fresh[k] !== undefined) out[k] = fresh[k];
  // (a body built in the character creator keeps its build on the new frame: see screens.js applyLook)
  delete out.bulk;
  if (look.build !== undefined) out.bulk = +((race === 'buccaneer' ? 1.25 : race === 'fishman' ? 1.1 : 1) * (0.84 + look.build * 0.36)).toFixed(3);
  else if (fresh.bulk !== undefined) out.bulk = fresh.bulk;
  if (race !== 'fishman' && out.eyeShape === 'fish') delete out.eyeShape;
  return out;
}

/** A style the race is born knowing (lineage.js createCharacter), and its first technique. */
function innateStyle(c, style, mastery, tech) {
  c.masteries[style] = Math.max(c.masteries[style] || 0, mastery);
  if (!c.techniques.includes(tech)) { c.techniques.push(tech); addToHotbar(c, tech); }
}

/**
 * Become someone of another race, there and then: the race's build on your
 * attributes (the old one's comes off), its lives, what it's born with (a
 * Fish-Man's karate, a Mink's Electro, a Three-Eye's Observation Haki), its
 * looks — and the live body: how high you jump, how you swim and breathe,
 * your reach and stride (what actor.js takes from the race at birth), and the
 * model, built afresh.
 */
export function changeRace(game, race) {
  const c = game.state?.char, p = game.player, R = RACES[race];
  if (!c || !p || !R || c.race === race) return false;
  const was = RACES[c.race] || RACES.human;
  for (const k of ATTR_KEYS) c.attrs[k] = clamp(c.attrs[k] - (was.stats[k] || 0) + (R.stats[k] || 0), 1, ATTR_CAP);
  const dl = (R.lives || 3) - (was.lives || 3);
  if (dl) { c.maxLives = clamp(c.maxLives + dl, 1, 5); c.lives = clamp(c.lives + dl, 1, c.maxLives); }
  const spirit = p.hakiUnlocked();
  if (race === 'fishman') innateStyle(c, 'fishman_karate', 8, 'fmk_uchimizu');
  if (race === 'mink') innateStyle(c, 'electro', 5, 'elec_discharge');
  if (race === 'three_eye') c.haki.observation = Math.max(c.haki.observation || 0, 8);
  c.look = raceLook(c.look, race, seedOf(c.id + race));
  c.race = race;
  p.race = race;
  Object.assign(p.baseMods, { hpMul: R.hpMul || 1, stride: R.stride || 1, speedMul: race === 'buccaneer' ? 0.92 : 1 });
  p.reach = R.reach || 1;
  p.canSwimRace = R.swim || 1;
  p.gills = !!R.gills;
  p.flameLit = race === 'lunarian';
  if (p.oxygen != null) p.oxygen = p.maxOxygen;
  // (a new look object: the 3D model and the first-person arms are rebuilt from it)
  refreshPlayer(game);
  if (!spirit && p.hakiUnlocked()) p.haki = p.d.maxHaki;
  return true;
}

/** A Mink's kind of animal, or a Fish-Man's kind of fish (by name). */
export function setKind(game, name) {
  const c = game.state?.char;
  if (!c || !game.player) return false;
  const L = { ...c.look };
  const m = c.race === 'mink' && MINK_KINDS.find((k) => k.name === name);
  const f = c.race === 'fishman' && FISHMAN_KINDS.find((k) => k.name === name);
  if (m) Object.assign(L, { kind: m.name, ears: m.ears, fur: m.fur, tail: m.tail, muzzle: m.muzzle, skin: m.fur, hairColor: m.fur, hand: m.fur });
  else if (f) Object.assign(L, { kind: f.name, skin: f.skin });
  else return false;
  c.look = L;
  refreshPlayer(game);
  return true;
}

// -------------------------------------------------------------- Haki, body
/**
 * Set a Haki to a level (0: not awakened). The techniques that level opens
 * are yours too, as a master would teach them; Conqueror's comes with the
 * King's Disposition it's born of.
 */
export function setHaki(game, type, lvl) {
  const c = game.state?.char, p = game.player;
  if (!c || !p || !['armament', 'observation', 'conqueror'].includes(type)) return false;
  const spirit = p.hakiUnlocked();
  lvl = clamp(Math.round(lvl), 0, 100);
  c.haki[type] = lvl;
  if (type === 'conqueror' && lvl && !c.traits.includes('conqueror')) c.traits.push('conqueror');
  if (!lvl) {
    if (type === 'armament') p.armament = false;
    if (type === 'observation') p.observation = false;
  }
  for (const d of HAKI_ABILITIES) {
    if (d.hakiType !== type || lvl < (d.learn?.level || 1) || c.techniques.includes(d.id)) continue;
    c.techniques.push(d.id);
    if (d.id !== 'haki_conqueror') addToHotbar(c, d.id); // (that one is G)
  }
  refreshPlayer(game);
  if (!spirit && p.hakiUnlocked()) p.haki = p.d.maxHaki;
  if (!p.hakiUnlocked()) p.haki = 0;
  return true;
}

/** Set one attribute (1 to the cap). */
export function setAttr(game, k, v) {
  const c = game.state?.char;
  if (!c || !game.player || !ATTR_KEYS.includes(k)) return false;
  c.attrs[k] = clamp(Math.round(v), 1, ATTR_CAP);
  refreshPlayer(game);
  return true;
}

export function installCreative(game) {
  const FULL = { fog: null };
  // the whole chart, as creative mode shows it
  const fullFog = () => {
    const n = game.surface?.fog?.length || 0;
    if (!FULL.fog || FULL.fog.length !== n) FULL.fog = new Uint8Array(n).fill(255);
    return FULL.fog;
  };
  const C = {
    on: false,
    speed: 1,
    // what's been called up here (Clear takes it all away again)
    spawned: new Set(),

    /** Turn creative mode on or off. */
    set(on, quiet = false) {
      const p = game.player;
      C.on = !!on;
      if (game.state?.char) game.state.char.creative = C.on;
      if (p) {
        p.invulnerable = C.on;
        if (!C.on && p.flying) C.land();
      }
      // (the panel goes with it)
      if (!C.on) { const e = game.ui?.stack?.find((x) => x.id === 'creative'); if (e) game.ui.closePanel(e); }
      // the chart: all of it, or back to what you've explored (up here: a zone has its own)
      const w = game.surface;
      if (w?.fog && game.renderer?.terrain && game.world === w) game.renderer.terrain.updateFog(C.on ? fullFog() : w.fog);
      const panel = game.input?.touch?.on ? 'The creative panel is in the pause menu' : 'F1 opens the creative panel';
      if (!quiet) game.ui?.toast(C.on ? 'CREATIVE MODE' : 'CREATIVE MODE OFF', C.on ? `${panel} · double-tap Space to fly · / for commands` : 'Back to the game as it is.', '#80deea', 'creative');
    },

    fly() {
      const p = game.player;
      if (!p || !C.on || p.mode !== 'foot') return;
      if (p.flying) { C.land(); return; }
      if (p.inWater) p.leaveWater?.(game);
      if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
      p.flying = true;
      p.alt = null;
      p.vz = 0;
      game.log('Flying. Space rises, C sinks, Shift to go fast. Double-tap Space to land.', '#80deea');
    },
    land() {
      const p = game.player;
      if (!p) return;
      p.flying = false;
      p.alt = null;
      p.vz = -1;
    },

    /** Go to (x, y): onto dry land if there's some nearby. */
    teleport(x, y) {
      const p = game.player, w = game.world;
      if (!p) return;
      if (p.mode === 'sail' && p.ship) { p.ship.captain = null; p.onShip = false; p.mode = 'foot'; }
      const spot = w.walkable(x, y) ? { x, y } : findShore(w, x, y, 12);
      p.x = w.wx(spot ? spot.x : x); p.y = spot ? spot.y : y;
      p.vx = p.vy = 0; p.kb.x = p.kb.y = 0; p.dash = null;
      if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
      if (!spot && !p.flying) C.fly();
      game.snapCamera();
    },

    /** Go to an island: the square of a town of it (its first, unless told), or its middle. */
    toIsland(isl, town = isl.towns?.[0]) {
      const pl = town?.plaza;
      C.teleport(pl ? pl.x + 0.5 : isl.x, pl ? pl.y + 2.5 : isl.y);
      return `Welcome to ${town && town.name !== isl.name ? `${town.name}, ` : ''}${isl.name}.`;
    },

    /** Into a zone (Skypiea, Fish-Man Island, Impel Down), on foot; null: back up to the surface. */
    toZone(id) {
      const p = game.player;
      if (!p) return '';
      if (p.mode === 'sail' && p.ship) { p.ship.captain = null; p.onShip = false; p.mode = 'foot'; }
      if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
      if (!id) { game.leaveZone?.(); return 'Back to the surface.'; }
      return game.enterZoneById?.(id) ? `Welcome to ${game.world.name}.` : '';
    },

    setTime(t) {
      game.env.clock = ((t % 24) + 24) % 24;
      return `It's ${game.env.clockString()}.`;
    },
    setWeather(kind) {
      const env = game.env;
      // (the weather's own kinds: game/weather.js; and the old names)
      const named = kind === 'sun' ? 'clear' : kind;
      if (env.setWeather?.(named, { now: true, dur: 240 })) return `The weather turns: ${env.forecast.toLowerCase()}.`;
      const k = WEATHER[kind];
      if (k === undefined) return '';
      env.stormTarget = k; env.storm = k; env.weatherTimer = 240;
      return `The weather turns: ${kind}.`;
    },

    /** The whole sea charted for good (it stays when creative mode is off). */
    chartAll() {
      const w = game.surface;
      if (!w?.fog) return '';
      w.fog.fill(255);
      // (drawn the next time the chart is, all of it)
      w.fogDirty = true; w.fogRect = null;
      return 'Every sea is charted.';
    },

    heal() {
      const p = game.player;
      if (!p) return '';
      p.hp = p.d.maxHp; p.oxygen = p.maxOxygen; p.status = {};
      if (p.hakiUnlocked()) p.haki = p.d.maxHaki;
      return 'Good as new.';
    },
    /** Every vivre card whole again, and your second winds back. */
    restoreLives() {
      const c = game.state?.char, p = game.player;
      if (!c || !p) return '';
      c.lives = c.maxLives;
      c.getUpCharges = Math.max(c.getUpCharges || 0, 1 + (p.attrs.wil >= 40 ? 1 : 0) + (p.attrs.wil >= 80 ? 1 : 0));
      return `Lives ${c.lives}/${c.maxLives}.`;
    },

    giveItem(id, n = 1) {
      const d = ITEMS[id];
      if (!d || !game.state?.char) return '';
      if (d.type === 'fruit') return C.giveFruit(d.fruit);
      n = clamp(Math.round(n) || 1, 1, 99);
      addItem(game, id, n);
      return `Gave you ${n} × ${d.name}.`;
    },
    giveFruit(id) {
      const f = FRUITS[id];
      if (!f) return '';
      return giveFruit(game, id) ? `The ${f.name} is in your bag.` : `You already have the ${f.name}.`;
    },
    removeFruit() {
      const fid = removeFruit(game);
      if (!fid) return '';
      game.ui?.toast('POWER GONE', `${FRUITS[fid].name} — you could swim again.`, '#80deea');
      return `The ${FRUITS[fid].name}'s power has left you.`;
    },
    setFruitMastery(v) { setFruitMastery(game, v); },
    setRace(race) {
      if (!changeRace(game, race)) return '';
      game.audio?.sfx('reveal');
      return `You are ${/^[aeiou]/i.test(RACES[race].name) ? 'an' : 'a'} ${RACES[race].name} now.`;
    },
    setKind(name) { setKind(game, name); },
    setHaki(type, lvl) { setHaki(game, type, lvl); },
    setAttr(k, v) { setAttr(game, k, v); },
    /** Every attribute at one level (as an enemy's level is their attributes). */
    setLevel(n) {
      const c = game.state?.char;
      if (!c || !game.player) return;
      for (const k of ATTR_KEYS) c.attrs[k] = clamp(Math.round(n), 1, ATTR_CAP);
      refreshPlayer(game);
    },
    setBounty(n) {
      const c = game.state?.char;
      if (!c) return;
      c.bounty = roundBounty(Math.max(0, n || 0));
      // (anyone with a bounty is a pirate in the eyes of the world: see progression.js addBounty)
      if (c.bounty && c.faction === 'civilian') c.faction = 'pirate';
      game.emit('bountyChanged', c.bounty, false);
    },
    setRep(v) {
      const c = game.state?.char;
      if (!c) return;
      const before = c.reputation || 0;
      c.reputation = clamp(Math.round(v), 0, 100);
      game.emit('reputationChanged', c.reputation, c.reputation - before);
    },

    // --- calling things up -------------------------------------------------------
    /** A spot `d` m ahead of you, `turn` radians off to the side. */
    ahead(d, turn = 0) {
      const p = game.player, w = game.world, a = p.facing + turn;
      return { x: w.wx(p.x + Math.cos(a) * d), y: p.y + Math.sin(a) * d };
    },
    /**
     * Open water near you, `need` m deep, `r0`–`r1` m off (looking ahead of
     * you first): where a ship, a Sea King or a school can be. Null if none.
     */
    waterNear(need, r0 = 10, r1 = 40, ok = null) {
      const p = game.player, w = game.world;
      for (let r = r0; r <= r1; r += 5) {
        for (let k = 0; k < 16; k++) {
          const a = p.facing + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 16);
          const x = w.wx(p.x + Math.cos(a) * r), y = p.y + Math.sin(a) * r;
          if (!w.isLiquid(x, y) || w.isOverlay(x, y)) continue;
          if ((game.seaDepth ? game.seaDepth(x, y) : 9) < need) continue;
          if (ok && !ok(x, y)) continue;
          return { x, y, a };
        }
      }
      return null;
    },
    /** Something called up joins the people of the island you're on (they go when it does). */
    keep(a) {
      a.game = game;
      game.addActor(a);
      C.spawned.add(a);
      const list = game.currentIsland && game.spawner.populated.get(game.currentIsland.id);
      if (list) list.push(a);
      return a;
    },

    /** Aboard a ship (at the helm, or on a deck), there's no ground in front of you for anyone to stand on. */
    aboard() {
      const p = game.player;
      return p && (p.mode === 'sail' || p.deck) ? 'Not aboard ship: step ashore first (or into the water).' : '';
    },

    /** `n` foes of an archetype (npcs.js ARCHETYPES), at a level, in front of you. */
    spawnFoe(arch, lvl = 5, n = 1) {
      const p = game.player;
      if (!p || !ARCHETYPES[arch]) return `No foe called "${arch}".`;
      if (C.aboard()) return C.aboard();
      lvl = clamp(Math.round(lvl) || 5, 1, 120);
      n = clamp(Math.round(n) || 1, 1, 8);
      let a = null;
      for (let i = 0; i < n; i++) {
        const at = C.ahead(4 + (i % 3) * 0.6, (i - (n - 1) / 2) * 0.45);
        const s = game.spawner.findFree(at.x, at.y, 3) || at;
        a = C.keep(makeEnemy(arch, lvl, s.x, s.y, {}));
      }
      return n > 1 ? `${n} level ${lvl} ${a.name}s appear!` : `A level ${lvl} ${a.name} appears!`;
    },

    /**
     * A boss to fight, at their own level, with their moves, fruit, Haki and
     * phases — a stand-in: the real one keeps their place in the story (their
     * quests don't hear of this fight, and beating it isn't a great foe beaten).
     */
    spawnBoss(id) {
      const def = npcDef(id);
      if (!game.player || !def?.boss) return '';
      if (C.aboard()) return C.aboard();
      const at = C.ahead(6);
      const s = game.spawner.findFree(at.x, at.y, 4) || at;
      const stand = { ...def, hostile: true, dialogue: null, marker: null, when: null, once: false };
      const a = makeNPC(stand, s.x, s.y);
      a.npcId = null;
      a.def = { ...stand, id: null };
      a.bountyValue = 0; a.infamy = false; a.reward = 0;
      const ko = a.onKO;
      a.onKO = (self, att, g) => { self.boss = false; self.named = false; ko?.(self, att, g); };
      C.keep(a);
      aggro(game, a);
      game.audio?.sfx('reveal');
      return `${def.name}${def.title ? `, ${def.title},` : ''} comes for you!`;
    },

    /**
     * A ship sailing past you, as the traffic at sea sails (traffic.js): a
     * pirate, a Marine patrol, a merchantman or a fishing boat, with her crew
     * on deck. `hostile`: she comes for you (as if you'd fired on her).
     */
    spawnShip(kind, type, lvl = 10, hostile = false) {
      const p = game.player, w = game.world, d = SHIPS[type];
      if (!p || !d) return '';
      if (w !== game.surface || !game.traffic?.spawn) return 'Ships only sail the Blue Sea, not down here.';
      const L = d.length;
      const sea = C.waterNear(4, Math.round(L * 0.6 + 26), Math.round(L * 0.6 + 140), (x, y) => w.sailable(x, y) && w.sd(x, y) < -4 - L * 0.35);
      if (!sea) return 'No open water near you for her — go down to the sea.';
      // (she sails past you, a little off to one side)
      const side = sea.a + Math.PI / 2, off = L * 0.5 + 18;
      const dest = { x: w.wx(p.x + Math.cos(side) * off - Math.cos(sea.a) * 600), y: p.y + Math.sin(side) * off - Math.sin(sea.a) * 600 };
      const heading = Math.atan2(dest.y - sea.y, w.dx(sea.x, dest.x));
      const s = game.traffic.spawn({ kind, type, x: sea.x, y: sea.y, heading, dest, level: clamp(Math.round(lvl) || 10, 1, 120) });
      if (!s) return 'She wouldn\'t fit in the water here — try somewhere more open.';
      if (hostile) s.provoked = true;
      C.spawned.add(s);
      return `The ${s.name} (${d.name}) sails into view${hostile ? ' — and comes about to fight!' : '.'}`;
    },

    /**
     * Life in the sea near you: a Sea King, a Sea Cow or a Fighting Fish (the
     * hunters of swimmers: see sealife.js), or a school of fish (any of FISH).
     */
    spawnSea(kind, lvl = 30) {
      const p = game.player;
      if (!p) return '';
      lvl = clamp(Math.round(lvl) || 30, 1, 120);
      if (kind === 'seaking') {
        const at = C.waterNear(3, 14, 45);
        if (!at) return 'A Sea King needs open water — go down to the sea.';
        const k = C.keep(makeSeaKing(game, at.x, at.y, lvl));
        game.fx.ring(at.x, at.y, 1, 6, '#e1f5fe', 1.2, 0.3);
        game.audio?.sfx('seaking');
        return `A level ${lvl} ${k.name} rises from the depths!`;
      }
      if (kind === 'seacow' || kind === 'fightfish') {
        const at = C.waterNear(3.5, 12, 40);
        if (!at || !game.seaLife) return 'It needs deep water — go out past the shallows.';
        const k = game.seaLife.shark(at.x, at.y, lvl, kind);
        C.spawned.add(k);
        return `A level ${lvl} ${k.name} is hunting in the water!`;
      }
      const def = FISH[kind];
      if (!def || !game.seaLife) return '';
      const at = C.waterNear(def.depth[0] + 0.6, 8, 30);
      if (!at) return `No water deep enough for ${def.name} near you — go out to sea.`;
      const depth = game.seaDepth ? game.seaDepth(at.x, at.y) : 10;
      const z = clamp(def.depth[0] + Math.random() * Math.min(depth - def.depth[0], 8), 0.5, Math.max(0.5, depth - 0.6));
      C.spawned.add(game.seaLife.spawn(kind, at.x, at.y, z, Math.random() * TAU));
      return `${def.name[0].toUpperCase() + def.name.slice(1)} — in the water ahead of you.`;
    },

    /** Take away everything called up here (foes, bosses, ships and their crews, sea life). */
    clearSpawned() {
      let n = 0;
      for (const o of C.spawned) {
        if (o.alive === false) continue;
        n++;
        for (const a of o.traffic?.crew || []) a.alive = false;
        o.alive = false;
        if (game.bossTarget === o) game.bossTarget = null;
      }
      C.spawned.clear();
      return n ? `${n} gone.` : 'Nothing to clear.';
    },

    /** Run a command line; returns what to say back. */
    run(line) {
      const [cmd, ...args] = line.trim().replace(/^\//, '').split(/\s+/);
      const c = game.state?.char, p = game.player, w = game.world;
      if (!cmd) return '';
      if (cmd === 'help') return HELP.join('\n');
      if (cmd === 'creative') { C.set(args[0] !== 'off'); return C.on ? 'Creative mode on.' : 'Creative mode off.'; }
      if (!C.on) return 'Turn on creative mode in the pause menu (Esc) to use commands.';
      if (!p || !c) return 'Start a life first.';
      switch (cmd) {
        case 'fly': C.fly(); return p.flying ? 'Flying.' : 'Landed.';
        case 'tp': {
          if (args.length >= 2 && !isNaN(+args[0]) && !isNaN(+args[1])) { C.teleport(+args[0], +args[1]); return `Off to ${Math.round(p.x)}, ${Math.round(p.y)}.`; }
          const q = args.join(' ').toLowerCase();
          if (!q) return 'tp <island name> — or tp <x> <y>';
          const isl = w.islands.filter((i) => i.name).find((i) => i.name.toLowerCase() === q) || w.islands.find((i) => i.name && i.name.toLowerCase().includes(q));
          if (!isl) return `No island called "${q}".`;
          return C.toIsland(isl);
        }
        case 'time': {
          const t = +args[0];
          if (!(t >= 0 && t <= 24)) return 'time <0-24>';
          return C.setTime(t);
        }
        case 'weather': return C.setWeather(args[0]) || 'weather clear | rain | storm';
        case 'give': {
          const q = (args[0] || '').toLowerCase();
          const id = ITEMS[q] ? q : Object.keys(ITEMS).find((k) => k.includes(q) || ITEMS[k].name.toLowerCase().includes(q.replace(/_/g, ' ')));
          if (!id) return `No item like "${q}".`;
          return C.giveItem(id, parseInt(args[1], 10) || 1);
        }
        case 'fruit': {
          const q = args.join(' ').toLowerCase();
          const id = FRUITS[q] ? q : Object.keys(FRUITS).find((k) => k.includes(q) || FRUITS[k].name.toLowerCase().includes(q) || FRUITS[k].en.toLowerCase().includes(q));
          if (!q || !id) return `No Devil Fruit like "${q}".`;
          return C.giveFruit(id);
        }
        case 'race': {
          const q = args.join(' ').toLowerCase().replace(/[\s-]+/g, '_');
          const id = RACES[q] ? q : Object.keys(RACES).find((k) => k.startsWith(q) || RACES[k].name.toLowerCase().replace(/[\s-]+/g, '_').startsWith(q));
          if (!q || !id) return `race ${Object.keys(RACES).join(' | ')}`;
          return C.setRace(id) || `You are already ${RACES[id].name}.`;
        }
        case 'berries': {
          const n = Math.round(+args[0]);
          if (!(n > 0)) return 'berries <amount>';
          earn(game, n, 'creative');
          return '';
        }
        case 'heal': return C.heal();
        case 'speed': {
          const s = +args[0];
          if (!(s >= 0.5 && s <= 5)) return 'speed <1-5>';
          C.speed = s;
          return `Flying speed ×${s}.`;
        }
        case 'spawn': {
          const arch = { bandit: 'bandit', pirate: 'pirate', marine: 'marine', brute: 'brute', gunner: 'pirate_gunner' }[args[0] || 'bandit'] || args[0];
          return C.spawnFoe(arch, parseInt(args[1], 10) || 5);
        }
        default: return `Unknown command "${cmd}". Type help for the list.`;
      }
    },
  };

  // --- the command line: press / to open it -----------------------------------
  const ui = game.ui;
  const out = h('div.cmd-out');
  const input = h('input.cmd-in', { type: 'text', spellcheck: false, autocomplete: 'off', placeholder: 'Type a command — help for the list' });
  const box = h('div.cmd-box.hidden', out, input);
  ui.root.appendChild(box);
  const history = [];
  let hi = 0;
  C.openConsole = () => {
    if (!game.player || C.consoleOpen) return;
    C.consoleOpen = true;
    box.classList.remove('hidden');
    ui.consoleOpen = true;
    game.view3d?.rig.releaseLock?.();
    input.value = '';
    setTimeout(() => input.focus(), 0);
    if (!out.childNodes.length) out.appendChild(h('div', C.on ? 'Creative commands — type help for the list. Esc closes.' : 'Commands work in creative mode (pause menu, Esc).'));
  };
  C.closeConsole = () => {
    C.consoleOpen = false;
    ui.consoleOpen = false;
    box.classList.add('hidden');
    input.blur();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { C.closeConsole(); return; }
    if (e.key === 'ArrowUp') { if (history.length) { hi = Math.max(0, hi - 1); input.value = history[hi]; } e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { hi = Math.min(history.length, hi + 1); input.value = history[hi] || ''; e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    const line = input.value;
    input.value = '';
    if (!line.trim()) { C.closeConsole(); return; }
    history.push(line); hi = history.length;
    out.appendChild(h('div.me', '> ' + line));
    const res = C.run(line);
    if (res) for (const l of res.split('\n')) out.appendChild(h('div', l));
    while (out.childNodes.length > 14) out.firstChild.remove();
    out.scrollTop = out.scrollHeight;
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());

  game.creative = C;
  game.on('characterStart', () => {
    if (C.consoleOpen) C.closeConsole();
    C.spawned.clear();
    C.set(!!game.state?.char?.creative, true);
  });
  // the chart stays fully drawn while creative mode is on (back up from a zone too)
  C.fullFog = fullFog;
  game.on('leaveZone', () => { if (C.on && game.world === game.surface) game.renderer?.terrain?.updateFog(fullFog()); });
  return C;
}
