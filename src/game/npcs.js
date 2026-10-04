// Named NPCs, enemy groups and bosses from data, spawned when their island is
// populated. Also the interaction dispatcher for buildings, townsfolk,
// chests and props.
import { robHouse, pickpocket } from './reputation.js';
import { Actor } from './actor.js';
import { AIController } from './ai.js';
import { makeLook } from '../data/races.js';
import { RNG } from '../core/rng.js';
import { openShop, openInn, openDoctor, openShipyard, openTrainer } from '../ui/panels.js';
import { addItem, earn, useItem } from './inventory.js';
import { ITEMS } from '../data/items.js';
import { STYLES } from '../data/styles.js';
import { FRUITS } from '../data/fruits.js';
import { persist } from './lineage.js';
import { rumorFor } from './rumors.js';
import { layoutOf, interiorRect, doorLocalX, styleScale } from '../world/interiors.js';
import { dims } from '../render3d/chars/bones.js';
import { formatBerries } from '../core/math.js';
import { bw } from '../world/bframe.js';
import { npcHakiSig } from './haki.js';

/**
 * Its owner's shadow stood up as a body (Kage Kage's Doppelman): their own
 * shape — build, hair, clothes — all in the dark (and drawn flat black with
 * no face: render3d/chars/forms.js).
 */
function shadowLook(L) {
  const k = '#120c18';
  return { ...L, shadow: true, skin: k, top: k, bottom: k, hairColor: k, shoes: k, hand: k, hatColor: k, belt: k, sleeve: k, eyeColor: k, coat: L.coat ? k : undefined, vest: L.vest ? k : undefined, fur: L.fur ? k : undefined, wings: undefined, backFlame: false };
}

const NPC_DEFS = new Map();
const GROUPS = []; // enemy groups: { island, spot|dx/dy, enemies: [archetype...], when }
export function registerNPCs(list) { for (const n of list) NPC_DEFS.set(n.id, n); }
export function registerGroups(list) { for (const g of list) GROUPS.push(g); }
export const npcDef = (id) => NPC_DEFS.get(id);
export const allNpcDefs = () => [...NPC_DEFS.values()];
export const allGroups = () => GROUPS.slice();

// ---------------------------------------------------------- enemy archetypes
// level ~ attribute value; tier gives HP/damage multipliers
export const ARCHETYPES = {
  bandit: { name: 'Mountain Bandit', faction: 'bandit', style: 'brawler', look: { top: '#6d4c41', hat: 'bandana', hatColor: '#8d6e63' }, skill: 0.15, barks: ['Hand over your money!', 'Heh heh heh!'] },
  pirate: { name: 'Pirate Grunt', faction: 'pirate', style: 'ittoryu', weapon: 'sword', look: { top: '#37474f', hat: 'bandana', hatColor: '#b71c1c' }, skill: 0.2, barks: ['Yo-ho!', 'Get \'em!'] },
  pirate_gunner: { name: 'Pirate Gunner', faction: 'pirate', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#5d4037', hat: 'tricorne' }, skill: 0.15 },
  marine: { name: 'Marine', faction: 'marine', style: 'ittoryu', weapon: 'sword', look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine' }, skill: 0.25, lethal: false, barks: ['For Justice!', 'Halt, pirate!'] },
  marine_rifle: { name: 'Marine Rifleman', faction: 'marine', style: 'sniper', weapon: 'gun', ranged: true, look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine' }, skill: 0.2, lethal: false },
  marine_officer: { name: 'Marine Officer', faction: 'marine', style: 'rokushiki', look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine', coat: '#fafafa', coatText: 'JUSTICE' }, skill: 0.5, lethal: false, moves: ['roku_soru', 'roku_rankyaku'] },
  swordsman: { name: 'Wandering Swordsman', faction: 'rival', style: 'nitoryu', weapon: 'sword', look: { top: '#455a64', hat: 'headband', hatColor: '#212121' }, skill: 0.45, moves: ['nito_taka'] },
  brute: { name: 'Brute', faction: 'pirate', style: 'brawler', look: { top: '#795548' }, bulk: 1.35, skill: 0.1, moves: ['brawl_tackle', 'brawl_headbutt'], hpMul: 1.6 },
  fishman_thug: { name: 'Fish-Man Pirate', faction: 'pirate', race: 'fishman', style: 'fishman_karate', look: {}, skill: 0.3, moves: ['fmk_uchimizu'], hpMul: 1.2 },
  baroque: { name: 'Baroque Works Agent', faction: 'baroque', style: 'sniper', weapon: 'gun', look: { top: '#212121', hat: 'cowboy', hatColor: '#212121' }, skill: 0.35, moves: ['snipe_explode'] },
  cp: { name: 'Cipher Pol Agent', faction: 'cp', style: 'rokushiki', look: { top: '#212121', bottom: '#212121' }, skill: 0.6, moves: ['roku_soru', 'roku_rankyaku', 'roku_tekkai'] },
  zombie: { name: 'Zombie', faction: 'zombie', style: 'brawler', look: { top: '#4e342e', skin: '#9e9d89' }, skill: 0.05, barks: ['Uuurgh...'] },
  beast: { name: 'Wild Boar', faction: 'beast', style: 'brawler', beast: 'boar', look: { top: '#6d4c41', skin: '#6d4c41', hair: 'bald', ears: 'round', fur: '#6d4c41', muzzle: true, tail: 'thin' }, skill: 0, hpMul: 1.3 },
  tiger: { name: 'Mountain Tiger', faction: 'beast', style: 'electro', beast: 'tiger', look: { skin: '#f39c12', fur: '#f39c12', hairColor: '#f39c12', ears: 'round', tail: 'thin', muzzle: true, top: '#f39c12', bottom: '#e67e22', hair: 'bald', furFace: true }, skill: 0.2, hpMul: 1.5 },
  dinosaur: { name: 'Dinosaur', faction: 'beast', style: 'brawler', look: { skin: '#558b2f', top: '#558b2f', bottom: '#33691e', hair: 'bald', fin: true, muzzle: true, tail: 'fluffy', fur: '#558b2f' }, bulk: 1.6, scale: 1.5, hpMul: 2.5, skill: 0 },
  gorilla: { name: 'Snow Gorilla', faction: 'beast', style: 'brawler', look: { skin: '#eceff1', fur: '#eceff1', hairColor: '#eceff1', top: '#eceff1', bottom: '#cfd8dc', ears: 'round', furFace: true, muzzle: true, hair: 'bald' }, bulk: 1.4, hpMul: 1.8, skill: 0.1 },
  pacifista: { name: 'Pacifista', faction: 'marine', style: 'brawler', look: { top: '#263238', bottom: '#263238', skin: '#607d8b', hat: 'bandana', hatColor: '#263238' }, bulk: 1.5, scale: 1.4, hpMul: 3, skill: 0.3, moves: ['kuma_laser'], lethal: true },
};

// ------------------------------------------------------------ spawning
// canon women among the named characters (their data predates body types)
const WOMEN = /\b(Makino|Dadan|Alvida|Rika|Kaya|Nojiko|Bell-?m[eè]re|Tashigi|Kuina|Nami|Robin|Vivi|Kureha|Conis|Laki|Aisa|Hina|Isuka|Hancock|Sandersonia|Marigold|Nyon|Perona|Kalifa|Bonney|Shirahoshi|Otohime|Shyarly|Big Mom|Linlin|Pudding|Smoothie|Br[uû]l[eé]e|Galette|Flampe|Praline|Amande|Chiffon|Lola|Viola|Rebecca|Monet|Baby 5|Koala|Carrot|Wanda|Yamato|Hiyori|Kiku|Tama|Ulti|Black Maria|Sugar|Kokoro|Chimney|Shakky|Valentine|Doublefinger|Goldenweek|All ?Sunday|Merry ?Christmas|Paula|Porche|Cindry|Stussy|Lilith|Jewelry|Catarina|Tsuru|Gion|Momousagi|Olvia|Toki|Rouge|Uta|Betty|Hibari|Carina|Mozu|Kiwi|Ishley|Nico)\b/i;
const ROLE_OF = { pirate: 'pirate', bandit: 'bandit', marine: 'marine', cp: 'agent', baroque: 'agent', rival: 'swordsman', beast: 'beast', fishman: 'fishman' };

/** A named NPC's look (the same every time: seeded by their id). */
function npcLook(def) {
  let role = def.role || (def.beast || def.faction === 'beast' ? 'beast' : ROLE_OF[def.faction]) || 'civilian';
  if (role === 'marine' && (def.look?.coat || def.boss || def.named)) role = 'officer';
  const lookOver = { ...(def.look || {}), role };
  if (def.bulk && lookOver.bulk === undefined) lookOver.bulk = def.bulk; // (their own size: no frame rolled on top)
  if (lookOver.fem === undefined && def.name && WOMEN.test(def.name)) lookOver.fem = true;
  if (lookOver.fem === undefined && (def.named || def.boss || def.dialogue)) lookOver.fem = false; // named men stay men
  const look = def.fullLook ? { ...def.fullLook } : makeLook(def.race || 'human', def.seed ?? hashSeed(def.id || def.name), lookOver);
  if (def.bulk) look.bulk = def.bulk;
  if (def.scale) look.scale = def.scale;
  return look;
}

/** How tall someone stands (m), their hair (or hat) on top. */
export function standingHeight(look) {
  const d = dims(look);
  return (d.hip0 + d.chestLen + d.neck + d.hc + d.headR * 1.05) * (look.scale || 1) + 0.12;
}

/** The walk-in building a named NPC keeps (lives or works in), as placeNPC puts them there — not one they stand outside. */
function buildingOf(island, def) {
  if (typeof def.at === 'function') return null; // (placed by a rule of its own)
  const pl = def.at || {};
  if (pl.spot && island.spots[pl.spot]) return null;
  const walkIn = (b) => (b?.enterable ? b : null);
  for (const town of island.towns) {
    if (pl.town && town.id !== pl.town) continue;
    if (pl.dock || pl.door) return null;
    if (pl.building) {
      const b = town.buildings.find((x) => x.name === pl.building || x.npc === def.id || x.role === pl.building);
      if (b) return walkIn(b);
    }
    if (pl.plaza || (!pl.building && !pl.dx && !pl.door) || (pl.town && !pl.dx)) return null;
  }
  for (const town of island.towns) { const b = town.buildings.find((x) => x.npc === def.id); if (b) return walkIn(b); }
  return null;
}

/**
 * Buildings are made for who's in them: one a named character keeps (a boxing
 * coach a head taller than anyone, Kuma in his church, Big Mom in her chateau)
 * stands as much taller as they are — its doors, storeys and the ceiling over
 * their head (world/interiors.js styleScale) — rather than a house they'd
 * stand up through the roof of. Run once a world and the NPCs are known,
 * before anything is drawn.
 */
export function sizeBuildingsForOccupants(world) {
  for (const def of NPC_DEFS.values()) {
    const island = world.islands.find((i) => i.id === def.island);
    const b = island && buildingOf(island, def);
    if (!b) continue;
    // (the ground floor's ceiling is 2.75 m at scale 1, over a head with room to spare)
    const need = (standingHeight(npcLook(def)) + 0.3) / 2.75;
    if (need <= styleScale(b) + 0.01) continue;
    b.tall = Math.round(need * 20) / 20 + 0.05;
    // (the doorway in its walls and the furniture are sized to match)
    delete b._layout;
    if (world.objects) { world.objects.removeInterior(b); world.objects.addInterior(b); }
  }
}

const WANO = new Set(['wano', 'onigashima']);
/**
 * The sword an NPC's kind carries, when their definition names none: a
 * Marine's (or a royal guard's) saber, a samurai's Wano blade, a pirate's
 * cutlass, a katana as fine as they are good — the one they drop when beaten
 * (loot.js). The same for the same NPC every time.
 */
function defaultBlade(def, k) {
  const f = def.faction || 'civilian', lvl = def.level ?? 6, who = `${def.name || ''} ${def.title || ''}`;
  if (f === 'marine' || /guard|knight|fencer|soldier|royal/i.test(who)) return 'marine_saber';
  if (WANO.has(def.island) || /samurai|ronin/i.test(who)) return 'wano_katana';
  if (f === 'beast' || f === 'zombie') return 'rusty_katana';
  const h = hashSeed(def.id || def.name || '') + k;
  if (f === 'pirate' || f === 'bandit') return (lvl >= 40 ? ['cutlass', 'fine_katana'] : ['cutlass', 'cutlass', 'rusty_katana'])[h % (lvl >= 40 ? 2 : 3)];
  return lvl >= 12 ? 'fine_katana' : 'rusty_katana';
}
/**
 * An NPC's weapon: { kind, power, count, ids } — for a swordsman, the swords
 * they carry, each drawn as itself (render3d/chars/swords.js): their own
 * (`blades` in their definition: Mihawk's Yoru, Tashigi's Shigure, Ryuma's
 * Shusui), else what their kind would carry.
 */
export function npcWeapon(def) {
  const count = STYLES[def.style]?.swords || 1;
  const w = { kind: def.weapon, power: def.weaponPower || 1.2, count };
  if (def.weapon === 'sword') w.ids = Array.from({ length: count }, (_, k) => def.blades?.[k] || def.blades?.[0] || defaultBlade(def, k));
  return w;
}

export function makeNPC(def, x, y, extra = {}) {
  const L = def.level ?? 6;
  const look = npcLook(def);
  const attrs = def.attrs || { str: L, agi: L, end: L, vit: L, wil: L };
  const a = new Actor({
    x, y, name: def.name, title: def.title, look, race: def.race || look.race, faction: def.faction || 'civilian', attrs,
    style: def.style || 'brawler', fruit: def.fruit || null, fruitMastery: def.fruitMastery ?? (def.fruit ? 60 : 0),
    weapon: def.weapon ? npcWeapon(def) : null,
    hakiSkill: def.haki || {}, boss: def.boss, hpMul: (def.hpMul || 1) * (def.boss ? 2.2 : 1), lethal: def.lethal ?? true, poise: def.poise,
    dmgMul: def.dmgMul, defMul: def.defMul,
    ...extra,
  });
  a.npcId = def.id || null;
  // their Haki's colours and voice (an Emperor's own, from their definition; anyone else's from who they are)
  a.hakiSig = npcHakiSig(def);
  a.masteries = { [a.style]: def.mastery ?? Math.min(100, L * 1.5) };
  // (a boss born a king lets their Conqueror's loose in a fight: see abilities.js conquerorBurst)
  const moves = def.boss && def.haki?.conqueror > 0 && !(def.moves || []).includes('haki_conqueror') ? [...(def.moves || []), 'haki_conqueror'] : def.moves || [];
  a.techniques = moves;
  a.tier = def.tier || Math.max(1, Math.round(L / 12));
  a.named = !!def.named || !!def.boss;
  a.bountyValue = def.bounty;
  a.infamy = def.infamy;
  a.reward = def.reward;
  a.breakthrough = def.breakthrough;
  a.alertLine = def.alert;
  a.defeatLine = def.defeatLine;
  a.talk = def.dialogue ? { def } : null;
  a.def = def;
  if (def.armament) a.armament = true;
  if (def.invulnerable) a.invulnerable = true;
  // Logia bodies for NPC-only fruits (gas, snow…): { weakTo: ['fire'], color }
  if (def.logia && !a.fruitDef?.logia) a.fakeLogia = { logia: true, weakTo: def.logia.weakTo || [], color: def.logia.color || '#fff' };
  if (def.recover) a.recoverAfter = def.recover;
  if (def.fixedPower) a.fixedPower = def.fixedPower;
  a.showName = def.showName ?? (!!def.dialogue || !!def.boss || !!def.named);
  a.nameColor = def.boss ? '#ff8a80' : def.dialogue ? '#ffe082' : '#fff';
  const kind = def.ai || (def.hostile ? 'hostile' : def.dialogue ? 'guard' : 'wander');
  a.controller = new AIController({
    kind, home: { x, y }, skill: def.skill ?? (def.boss ? 0.55 : 0.25), moves, aggroRange: def.aggroRange ?? (def.boss ? 12 : 8),
    ranged: def.ranged, leash: def.leash ?? (def.boss ? 18 : 16), phases: def.phases, barks: def.barks,
  });
  if (kind === 'guard' || kind === 'idle') { a.stationary = true; a.faceHome = Math.PI / 2; }
  if (def.hostile) a.aggroPlayer = true;
  // (a crew who keep to themselves till you start it, or their story does)
  if (def.calm) a.calm = true;
  return a;
}

function hashSeed(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

export function makeEnemy(arch, level, x, y, over = {}) {
  const A = ARCHETYPES[arch] || ARCHETYPES.bandit;
  // fields left undefined must not wipe the archetype's defaults
  over = Object.fromEntries(Object.entries(over || {}).filter(([, v]) => v !== undefined));
  return makeNPC({
    ...A, level, hostile: true, name: over.name || A.name, look: { ...(A.look || {}), ...(over.look || {}) }, moves: over.moves || A.moves, id: over.id,
    seed: over.seed ?? Math.floor(Math.random() * 1e9), // every grunt looks different
    hpMul: (A.hpMul || 1) * (over.hpMul || 1), skill: over.skill ?? A.skill, ...over,
  }, x, y);
}

/** Spawner builder: named NPCs + enemy groups for an island. */
export function npcBuilder(ctx) {
  const { island, game, spawner, list, rng } = ctx;
  const c = game.state?.char;
  if (!c) return;
  for (const t of island.towns || []) for (const b of t.buildings) { b.npcCount = 0; b.guestCount = 0; }
  for (const def of NPC_DEFS.values()) {
    if (def.island !== island.id) continue;
    if (def.when && !def.when(c, game)) continue;
    if (def.boss && c.bosses.includes(def.id) && !def.respawn) continue;
    if (def.once && c.defeated[def.id]) continue;
    if ((c.crew || []).some((m) => m.id === def.id) || c.flags['leftCrew_' + def.id]) continue;
    const pos = placeNPC(game, island, def, rng, spawner);
    if (!pos) continue;
    const a = makeNPC(def, pos.x, pos.y);
    a.game = game;
    if (pos.inside) {
      a.homeB = pos.building;
      a.facing = a.faceHome = Math.PI / 2;
      a.stationary = true;
      a.wanderBox = interiorRect(pos.building);
    }
    game.addActor(a);
    list.push(a);
    if (pos.building && !pos.guest) pos.building.npcSpawned = true;
  }
  for (const grp of GROUPS) {
    if (grp.island !== island.id) continue;
    if (grp.when && !grp.when(c, game)) continue;
    if (grp.cleared && c.flags[grp.cleared]) continue;
    const base = grp.spot ? island.spots[grp.spot] : { x: island.x + (grp.dx || 0) * island.def.w / 2, y: island.y + (grp.dy || 0) * island.def.h / 2 };
    if (!base) continue;
    for (const e of grp.enemies) {
      const [arch, lvl, over] = Array.isArray(e) ? e : [e, grp.level || 6, {}];
      const p = spawner.findFree(base.x, base.y, grp.radius || 5, rng);
      if (!p) continue;
      const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
      a.game = game;
      if (grp.leash) a.controller.leash = grp.leash;
      if (grp.calm) a.calm = true;
      game.addActor(a);
      list.push(a);
    }
  }
}

/** (x, y) if a person can stand there, else the nearest clear spot around it. */
function clear(spawner, x, y, rng, extra = {}) {
  const p = spawner.freeSpot(x, y) ? { x, y } : spawner.findFree(x, y, 2.5, rng) || spawner.findFree(x, y, 5, rng) || { x, y };
  return { ...p, ...extra };
}

/** Behind the counter (or at home) in a building you can walk into. */
function inside(b, guest = false) {
  if (!b.enterable) return null;
  const L = layoutOf(b);
  // (a guest takes a seat and leaves the counter to whoever keeps the place)
  const spots = guest ? L.residents.slice().reverse() : [L.keeper, ...L.residents].filter(Boolean);
  const k = guest ? (b.guestCount = (b.guestCount || 0) + 1) : (b.npcCount = (b.npcCount || 0) + 1);
  const s = spots[k - 1];
  if (!s) return null;
  return { ...bw(b, s.x, s.z), building: b, inside: true, guest };
}

/**
 * Where a named NPC is to be found, for a quest's waypoint: where they
 * stand if they're about in this world, else where the island they live
 * on puts them (worked out by the same rules as placeNPC, without placing
 * anyone). { x, y, place, zone }, or { island, zone } for someone on an
 * island in another world (a zone), or null.
 */
export function whereNPC(game, id) {
  const def = NPC_DEFS.get(id);
  if (!def) return null;
  const w = game.world;
  const key = `${w.id}:${id}`;
  const now = game.time || 0;
  const C = game._whereNPC || (game._whereNPC = new Map());
  const hit = C.get(key);
  if (hit && now - hit.t < 3) return hit.v;
  let v = null;
  const island = w.islands.find((i) => i.id === def.island);
  if (island) {
    const q = placeGuess(game, island, def);
    if (q) v = { x: q.x, y: q.y, place: def.name, zone: w === game.surface ? null : w.id };
  } else v = { island: def.island };
  C.set(key, { t: now, v });
  return v;
}

/** placeNPC's rules for where someone stands on `island`, with no side effects and no dice. */
export function placeGuess(game, island, def) {
  let pl = {};
  try { pl = (typeof def.at === 'function' ? def.at(game.state?.char, game) : def.at) || {}; } catch (e) { pl = {}; }
  // (in a building: at the counter, or where the first of its people sits)
  const inB = (b) => {
    if (b.enterable) {
      const L = layoutOf(b), s = pl.guest ? L.residents[L.residents.length - 1] : L.keeper || L.residents[0];
      if (s) return bw(b, s.x, s.z);
    }
    return bw(b, doorLocalX(b) + (pl.ox || 0.9), 1.4);
  };
  if (pl.spot && island.spots[pl.spot]) { const s = island.spots[pl.spot]; return { x: s.x + (pl.ox || 0), y: s.y + (pl.oy || 0) }; }
  for (const town of island.towns) {
    if (pl.town && town.id !== pl.town) continue;
    if (pl.dock) {
      const d = island.docks.slice().sort((a, b) => Math.hypot(a.land.x - town.x, a.land.y - town.y) - Math.hypot(b.land.x - town.x, b.land.y - town.y))[0];
      if (d) return { x: d.land.x + (pl.ox || 0), y: d.land.y + (pl.oy || 0) };
    }
    if (pl.door) {
      const b = town.buildings.find((x) => x.name === pl.door || x.role === pl.door);
      if (b) return bw(b, doorLocalX(b) + (pl.ox ?? 1.6), 1.6);
    }
    if (pl.building) {
      const b = town.buildings.find((x) => x.name === pl.building || (def.id && x.npc === def.id) || x.role === pl.building);
      if (b) return inB(b);
    }
    if (pl.plaza || (!pl.building && !pl.dx && !pl.door) || (pl.town && !pl.dx)) return { x: town.plaza.x + (pl.ox || 1.5), y: town.plaza.y + 2.5 + (pl.oy || 0) };
  }
  for (const town of island.towns) { const b = town.buildings.find((x) => (def.id && x.npc === def.id)); if (b) return inB(b); }
  const lm = island.landmarks.find((l) => def.id && l.npc === def.id);
  if (lm) return { x: lm.x + 0.6, y: lm.y + 1.2 };
  if (pl.dx !== undefined) return { x: island.x + pl.dx * island.def.w / 2, y: island.y + pl.dy * island.def.h / 2 };
  return { x: island.x, y: island.y };
}

/** Where a registered NPC stands on their island (the same rules as when the island fills up). */
export function placeFor(game, island, def) {
  return placeNPC(game, island, def, Math, game.spawner);
}

function placeNPC(game, island, def, rng, spawner) {
  const pl = (typeof def.at === 'function' ? def.at(game.state?.char, game) : def.at) || {};
  if (pl.spot && island.spots[pl.spot]) {
    const s = island.spots[pl.spot];
    const x = s.x + (pl.ox || 0), y = s.y + (pl.oy || 0);
    if (spawner.freeSpot(x, y)) return { x, y };
    return spawner.findFree(x, y, 2.5, rng) || spawner.findFree(s.x, s.y, 3, rng) || s;
  }
  for (const town of island.towns) {
    if (pl.town && town.id !== pl.town) continue;
    // by the town's pier
    if (pl.dock) {
      const d = island.docks.slice().sort((a, b) => Math.hypot(a.land.x - town.x, a.land.y - town.y) - Math.hypot(b.land.x - town.x, b.land.y - town.y))[0];
      if (d) return spawner.findFree(d.land.x + (pl.ox || 0), d.land.y + (pl.oy || 0), 4, rng) || spawner.findFree(town.plaza.x, town.plaza.y + 2.5, 4, rng);
    }
    // on the street outside a building (whoever keeps it stays inside)
    if (pl.door) {
      const b = town.buildings.find((x) => x.name === pl.door || x.role === pl.door);
      if (b) { const q = bw(b, doorLocalX(b) + (pl.ox ?? 1.6), 1.6); return clear(spawner, q.x, q.y, rng); }
    }
    if (pl.building) {
      const b = town.buildings.find((x) => x.name === pl.building || x.npc === def.id || x.role === pl.building);
      if (b) { const q = bw(b, doorLocalX(b) + (pl.ox || 0.9), 1.4); return inside(b, pl.guest) || clear(spawner, q.x, q.y, rng, { building: b }); }
    }
    // (the square — also for someone whose building didn't fit in this town)
    if (pl.plaza || (!pl.building && !pl.dx && !pl.door) || (pl.town && !pl.dx)) return spawner.findFree(town.plaza.x + (pl.ox || 1.5), town.plaza.y + 2.5 + (pl.oy || 0), 3, rng);
  }
  // any building that names this NPC
  for (const town of island.towns) {
    const b = town.buildings.find((x) => x.npc === def.id);
    if (b) { const q = bw(b, doorLocalX(b) + 0.9, 1.4); return inside(b) || clear(spawner, q.x, q.y, rng, { building: b }); }
  }
  const lm = island.landmarks.find((l) => l.npc === def.id);
  if (lm) return clear(spawner, lm.x + 0.6, lm.y + 1.2, rng);
  if (pl.dx !== undefined) return spawner.findFree(island.x + pl.dx * island.def.w / 2, island.y + pl.dy * island.def.h / 2, 5, rng);
  return spawner.findFree(island.x, island.y, 10, rng);
}

// --------------------------------------------------------- interactions
export class Interactions {
  constructor(game) {
    this.game = game;
    game.on('talk', (a) => this.talk(a));
    game.on('enterBuilding', (b) => this.building(b));
    game.on('knockDoor', (b) => this.knock(b));
    game.on('openChest', (o) => this.chest(o));
    game.on('trainDummy', (o) => this.dummy(o));
    game.on('openService', (kind, arg, npc) => this.service(kind, arg, npc));
    game.on('quickHeal', () => this.quickHeal());
    this.objectHandlers = {};
    game.on('useObject', (o) => this.objectHandlers[o.use]?.(o, game));
    // `summon` ability steps: call allies to the fight (they leave when it ends)
    game.summon = (owner, spec) => {
      const n = spec.count || 1;
      for (let i = 0; i < n; i++) {
        // (a shadow stands up just behind whoever it belongs to — where it lay on the ground)
        const ang = spec.at === 'shadow' ? (owner.facing || 0) + Math.PI + (i - (n - 1) / 2) * 0.6 : Math.random() * Math.PI * 2;
        const r = spec.at === 'shadow' ? 1.1 : 2;
        const p = game.spawner.findFree(owner.x + Math.cos(ang) * r, owner.y + Math.sin(ang) * r, 3) || { x: owner.x, y: owner.y + 1 };
        const a = makeEnemy(spec.archetype || 'pirate', spec.level || Math.max(3, Math.round((owner.attrs?.str || 8) * 0.8)), p.x, p.y, { name: spec.name, look: typeof spec.look === 'string' ? undefined : spec.look, moves: spec.moves, hpMul: spec.hpMul });
        a.game = game;
        a.bornT = game.env.time;
        if (spec.at === 'shadow') a.facing = owner.facing || 0;
        // (exactly its owner's shape — not an archetype's build on top)
        if (spec.look === 'shadow') a.look = shadowLook(owner.look || {});
        // (a double of its owner, to the last hair — Cuerpo Fleur's body of petals)
        else if (spec.look === 'copy') { a.look = { ...(owner.look || {}) }; a.name = spec.name || owner.name; }
        a.summonColor = spec.look === 'copy' ? spec.color || ['#f48fb1', '#ffffff'] : null;
        a.faction = owner.faction;
        a.summonedBy = owner;
        a.summonT = spec.duration || 30;
        a.aggroPlayer = owner.aggroPlayer || owner.faction !== 'player';
        if (owner.isPlayer || owner.faction === 'player') { a.aggroPlayer = false; a.controller = new AIController({ kind: 'follower', skill: 0.3, moves: spec.moves || [] }); }
        else if (owner.controller?.target) { a.controller.target = owner.controller.target; a.controller.state = 'chase'; }
        game.addActor(a);
        // (a shadow's rise has its own: combatfx.js kage_doppelman)
        if (spec.look === 'copy') game.fx.burst(a.x, a.y - 0.6, 26, { kind: 'petal', color: spec.color || ['#f48fb1', '#ffffff'], speed: 3, z: 0.2, vz: 2.5, g: 1.5, life: 1, size: 0.11 });
        else if (spec.look !== 'shadow') game.fx.burst(a.x, a.y - 0.6, 12, { color: spec.color || '#eeeeee', speed: 3, g: 0, life: 0.4, kind: 'smoke', size: 0.3 });
      }
    };
    game.on('tick', (dt) => {
      for (const a of game.actors) {
        if (!a.summonedBy) continue;
        a.summonT -= dt;
        if (a.summonT <= 0 || !a.summonedBy.alive || a.summonedBy.state === 'knocked') {
          a.alive = false;
          // (a shadow sinks back into the ground — render3d/chars/forms.js — and leaves its dark behind)
          if (a.look?.shadow) game.fx.burst(a.x, a.y, 8, { color: ['#120a1a', '#2a1838'], speed: 1, z: 0.1, vz: 1.2, g: 0, life: 0.5, kind: 'smoke', size: 0.22 });
          else if (a.summonColor) game.fx.burst(a.x, a.y - 0.6, 18, { kind: 'petal', color: Array.isArray(a.summonColor) ? a.summonColor : [a.summonColor, '#ffffff'], speed: 2.5, z: 0.6, vz: 1.5, g: 1, life: 0.9, size: 0.1 });
          else game.fx.burst(a.x, a.y - 0.6, 8, { color: '#eeeeee', speed: 2, g: 0, life: 0.3, kind: 'smoke' });
        }
      }
    });
    this.onObject('lore', (o) => {
      game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: o.name || 'Inscription', text: typeof o.lore === 'function' ? o.lore(game.state.char, game) : o.lore } } });
      if (o.loreEvent) game.emit('questEvent', o.loreEvent, o);
    });
    // quest markers (! / ?) over NPC heads
    let mt = 0;
    game.on('tick', (dt) => {
      if ((mt -= dt) > 0) return;
      mt = 0.5;
      const c = game.state?.char;
      if (!c) return;
      for (const a of game.actors) {
        // duelists and sparring partners get back up after a while
        if (a.recoverAfter && a.state === 'knocked' && a.knockT > a.recoverAfter && a.alive) {
          a.state = 'idle'; a.hp = Math.round(a.d.maxHp * 0.5); a.provoked = false; a.aggroPlayer = !!a.def?.hostile;
          if (a.controller) { a.controller.target = null; a.controller.state = 'return'; }
          if (game.bossTarget === a) game.bossTarget = null;
          game.fx.text(a.x, a.y - 2, a.def?.recoverLine || '...Hah. You win.', '#fff', 0.32);
        }
        const m = a.def?.marker;
        if ((!m && !a.npcId) || !a.alive) continue;
        // (the main story's own marks come first: see content/mainStory.js;
        // then their own; then someone with an offer to sail with you: crew.js)
        try { a.questMarker = game.storyMarker?.(a) || (m ? m(c, game) : null) || game.crew?.marker?.(a) || null; } catch (e) { a.questMarker = null; }
      }
    });
  }

  onObject(id, fn) { this.objectHandlers[id] = fn; }

  islandOf(x, y) { const w = this.game.world; return w.islandAt(x, y) || w.nearestIsland(x, y, 60); }

  talk(a) {
    const g = this.game;
    const def = a.def;
    if (def && def.dialogue) {
      const tree = typeof def.dialogue === 'string' ? def.dialogue : def.dialogue;
      g.dialogue.open(a, tree);
      g.emit('talked', def.id);
      return;
    }
    if (a.talk?.kind === 'keeper') { this.building(a.talk.building); return; }
    if (a.talk?.kind === 'townsfolk') {
      const rng = new RNG(a.talk.seed + g.env.day);
      const isl = this.islandOf(a.x, a.y);
      g.dialogue.open(a, { start: 'a', nodes: {
        a: { text: rumorFor(g, isl, rng, a), choices: [
          { text: 'Thanks. Take care.', end: true },
          { text: 'Pick their pocket while they talk. (a crime)', do: () => { g.dialogue.close(); const r = pickpocket(g, a); if (r === 'caught') g.fx.text(a.x, a.y - 2, 'HEY! THIEF!', '#ff5252', 0.45); }, end: true },
        ] },
      } });
    }
  }

  building(b) {
    const g = this.game;
    const isl = this.islandOf(b.x, b.y);
    const town = isl?.towns.find((t) => t.id === b.town);
    const npc = b.npc && npcDef(b.npc);
    if (npc && npc.dialogue && !(npc.boss && g.state.char.bosses.includes(npc.id))) {
      // talk to the owner (their dialogue offers the services)
      const live = g.actors.find((x) => x.npcId === npc.id && x.state === 'idle');
      if (live) { g.dialogue.open(live, npc.dialogue); return; }
    }
    this.service(b.role, { building: b, island: isl, town });
  }

  service(kind, arg = {}, npc) {
    const g = this.game;
    let { building, island, town } = arg || {};
    if (!island) island = this.islandOf(g.player.x, g.player.y);
    if (!building) building = { name: npc?.def?.shopName || npc?.name, role: kind, shop: arg?.shop };
    const dock = island?.docks?.[0];
    switch (kind) {
      case 'shop': case 'market': case 'weapons': case 'bank':
        openShop(g, { ...building, shop: arg?.shop || building.shop }, island); break;
      case 'tavern': case 'bar': case 'restaurant': case 'cafe':
        this.tavern(building, island); break;
      case 'inn': openInn(g, building, island, town); break;
      case 'doctor': openDoctor(g, building, island, arg?.doc || (npc?.def?.doctor ? { ...npc.def.doctor, id: npc.def.id, name: npc.name } : null)); break;
      case 'shipwright': openShipyard(g, { ...building, adam: arg?.adam || npc?.def?.adam, coating: arg?.coating }, island, dock); break;
      case 'dojo': case 'trainer': openTrainer(g, arg?.trainer || npc?.def?.trainer || building.trainer || 'dojo_generic', npc?.name); break;
      case 'marine_base': g.emit('marineOffice', building, island); break;
      case 'bounty': g.emit('bountyBoard', building, island); break;
      case 'library': this.library(building, island); break;
      case 'palace': case 'hall': case 'church': case 'house': default:
        g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: building.name || 'Door', text: flavorFor(building) } } });
    }
  }

  tavern(building, island) {
    const g = this.game;
    const rng = new RNG(Math.floor(g.time) + (building.id || 0));
    g.dialogue.open(null, {
      start: 'a',
      nodes: {
        a: {
          speaker: building.name || 'Tavern', text: 'The tavern is loud with sailors\' songs. The barkeep polishes a mug. "What\'ll it be?"',
          choices: [
            { text: 'Buy food and drink', do: (c) => { c.open('shop', { building: { ...building, role: 'tavern' }, island }); } },
            { text: 'Buy a round and listen for rumours (฿100)', do: (c) => (c.pay(100) ? 'r' : 'a') },
            { text: `Rent a room upstairs for the night (${formatBerries(g.services.innPrice(island))}) — wake here if you fall`, do: () => { g.dialogue.close(); g.services.rest(island, island?.towns?.find((t) => t.id === building.town)); }, end: true },
            { text: 'Leave', end: true },
          ],
        },
        r: { speaker: 'Sailor at the bar', text: () => rumorFor(g, island, rng, null, true), next: 'a' },
      },
    });
  }

  library(building, island) {
    const g = this.game;
    const c = g.state.char;
    const key = 'read_' + (building.id || building.name);
    const first = !c.flags[key];
    g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: building.name || 'Library', text: () => {
      if (first) { c.flags[key] = true; g.progression.raiseAttr('wil', 1); }
      return (first ? '(+1 Willpower) ' : '') + rumorFor(g, island, new RNG(building.id || 1), null, true, 'lore');
    } } } });
  }

  knock(b) {
    const g = this.game, c = g.state.char;
    const B = g.buildings;
    const rng = new RNG((b.id || 1) * 13 + g.env.day * 7 + Math.floor(g.env.clock));
    g.audio?.sfx('knock');
    // kicking the door down is only ever this choice, made after knocking (blows never break a door)
    const kick = { text: b.pirate ? 'Kick down the door.' : 'Kick down the door. (a crime)', do: () => { g.dialogue.close(); B ? B.breakDoor(b) : robHouse(g, b); }, end: true };
    const leave = { text: 'Leave them be.', end: true };
    if (b.pirate) {
      const line = rng.pick(['"Who\'s there?! Scram before we gut ya!"', '"Password?" ...You don\'t know it. "Then get lost!"', '(Laughter and clinking mugs behind the door. It stops.) "...Who\'s knockin\'?"', '"If yer a Marine, we ain\'t here!"']);
      g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'Behind the door', text: line + ' (A crude Jolly Roger is scratched into the door. Pirates don\'t call the Marines.)', choices: [leave, kick] } } });
      return;
    }
    if ((b.role || 'house') !== 'house') {
      const opens = B ? B.opensAt(b) : 7;
      g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: b.name || 'Door', text: `Nobody answers. A sign hangs on the door: CLOSED — OPEN FROM ${opens}:00.`, choices: [{ text: 'Come back later.', end: true }, kick] } } });
      return;
    }
    const night = g.env.clock < 6 || g.env.clock >= 21;
    const home = g.actors.some((a) => a.homeB === b && a.alive && a.state === 'idle');
    // a named character's home: callers are welcome by day; strangers mostly aren't
    const wanted = (g.wanted?.tier() ?? 0) >= 2;
    const invite = home && !night && !wanted && rng.chance((b.npc ? 0.85 : 0.3) + (c.reputation || 0) / 200);
    const lines = !home ? ['(No answer. Nobody seems to be home.)', '(Silence. The curtains are drawn.)']
      : night ? ['"It\'s the middle of the night! Go away!"', '"We\'re sleeping! Come back in the morning!"', '(A candle is snuffed out behind the window.)']
        : ['"Who\'s there? ...Go away, we don\'t want trouble."', '"Nobody home!" (someone is clearly home)', '"If you\'re a pirate, keep walking!"', '"Shh! The baby is sleeping."', '"Are you the new postman? No? Then shoo."'];
    if (invite) {
      g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'Behind the door', text: rng.pick(['"Oh, a traveller? Come in, come in — mind your head."', '"Well, don\'t just stand there — come in! The kettle\'s on."', `"Aren\'t you the one folk say helped out around here? Come in!"`]), choices: [
        { text: 'Step inside.', do: () => { c.flags['invited_' + (B ? B.key(b) : b.id)] = g.env.day; g.dialogue.close(); if (!c.flags['door_' + b.id]) { c.flags['door_' + b.id] = true; addItem(g, 'rice_ball', 1); } }, end: true },
        leave,
      ] } } });
      return;
    }
    g.dialogue.open(null, { start: 'a', nodes: { a: { speaker: 'Behind the door', text: rng.pick(lines), choices: [leave, kick] } } });
  }

  chest(o) {
    const g = this.game, c = g.state.char;
    const key = 'chest_' + (o.key || `${Math.round(o.x)}_${Math.round(o.y)}`);
    // (chests opened before you could look inside them stay empty)
    if (c.world.chests[key] && !c.world.containers?.[key]) { o.opened = true; g.log('Empty. You took it all.', '#b0bec5'); return; }
    const luck = c.traits.includes('lucky') ? 1.5 : 1;
    const first = !c.world.containers?.[key];
    g.containers.open(key, 'treasure', {
      title: o.tier > 2 ? 'A treasure chest' : 'A chest', sub: 'The lid creaks open…',
      o: { tier: o.tier || 1, luck, item: o.item },
      onEmpty: () => { c.world.chests[key] = true; o.opened = true; },
    });
    if (first) g.fx.burst(o.x, o.y - 0.5, 20, { color: ['#ffd54f', '#fff59d'], speed: 4, vz: 4, g: 8, life: 0.8, kind: 'star' });
  }

  dummy(o) {
    const g = this.game, c = g.state.char;
    if (c.flags.dummyDay === g.env.day) { g.log('Your arms are too tired for more practice today.', '#b0bec5'); return; }
    c.flags.dummyDay = g.env.day;
    const style = g.progression.styleInUse();
    const m = c.masteries[style] || 0;
    g.env.clock += 1;
    if (m < 10) { g.progression.addStyleMastery(style, 2); g.log('You practise your forms on the dummy for an hour. (Dummies only teach the very basics — mastery up to 10.)', '#90caf9'); }
    else g.log('The dummy has nothing left to teach you. Find a real opponent — or a master.', '#b0bec5');
  }

  quickHeal() {
    const g = this.game, c = g.state.char;
    const foods = ['meat', 'fish_stew', 'rice_ball', 'tangerine', 'sea_king_steak', 'baratie_course', 'bandage'];
    const id = foods.find((f) => c.inventory.some((i) => i.id === f));
    if (!id) { g.log('You have nothing to eat!', '#ff8a80'); return; }
    useItem(g, id);
  }
}

function flavorFor(b) {
  switch (b.role) {
    case 'palace': return 'Guards cross their spears in front of the gate. "The palace is closed to commoners."';
    case 'hall': return 'The great doors are shut tight.';
    case 'church': return 'Candles flicker inside. A priest nods at you silently.';
    case 'bank': return 'A clerk counts berries behind iron bars.';
    default: return 'The door is locked.';
  }
}

export { ITEMS, FRUITS };
