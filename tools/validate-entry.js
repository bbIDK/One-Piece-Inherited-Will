// Bundled for Node by tools/validate.mjs. Cross-checks every piece of content
// data against the registries and the generated world.
import { ALL_ISLANDS } from '../src/data/islands/index.js';
import { ZONES } from '../src/data/zones/index.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateZoneWorld } from '../src/world/zonegen.js';
import { PACKS } from '../src/content/index.js';
import { getAbility } from '../src/game/abilities.js';
import { STYLES } from '../src/data/styles.js';
import { FRUITS } from '../src/data/fruits.js';
import '../src/data/haki.js';
import '../src/content/bossMoves.js';
import { TRAINERS } from '../src/data/trainers.js';
import { ITEMS } from '../src/data/items.js';
import { STOCK } from '../src/data/shops.js';
import { ARCHETYPES } from '../src/game/npcs.js';
import { RACES } from '../src/data/races.js';
import { CREW_ROLES } from '../src/game/crew.js';
import { TOWN_STYLES } from '../src/world/towngen.js';
import { CLIMATES } from '../src/world/islandgen.js';
import { regionAt, REGION_INFO, W, H, RL_HALF, RM_X, POLAR, EQ } from '../src/world/constants.js';
import { REVERSE_MOUNTAIN, MARY_GEOISE_DEF } from '../src/world/worldgen.js';

const SEAS = new Set(['east_blue', 'north_blue', 'west_blue', 'south_blue', 'paradise', 'new_world', 'calm_belt', 'sky', 'undersea', 'zone']);
const GOALS = new Set(['defeat', 'reach', 'item', 'flag', 'event', 'reachXY', 'days']);
const HAKI = new Set(['armament', 'observation', 'conqueror']);
const WEAPONS = new Set(['sword', 'gun', 'staff', 'axe', 'spear', 'mace', 'claw', 'whip', 'club', 'trident', 'bow']);
const PROP_KINDS = new Set(['tree', 'rock', 'bush', 'building', 'barrel', 'crate', 'haystack', 'lamp', 'lantern', 'well', 'fountain', 'flagpole', 'stall', 'platform', 'statue', 'torii', 'lighthouse', 'mooring', 'grave', 'chest', 'campfire', 'tent', 'cannon', 'bench', 'dummy', 'boat', 'bell', 'pillar', 'bubble', 'sign', 'windmill', 'arch', 'ruins', 'bones', 'anchor', 'fence', 'poneglyph', 'gate', 'shipwreck', 'skull', 'totem', 'tower', 'crystal', 'mushroom', 'palm', 'cactus', 'wheel', 'elevator', 'portal']);

export async function run(opts = {}) {
  const errors = [];
  const warns = [];
  const E = (m) => errors.push(m);
  const Wn = (m) => warns.push(m);
  const only = opts.pack || null;
  const log = (m) => { if (!opts.quiet) console.log(m); };

  // --------------------------------------------------------------- islands
  const byId = new Map();
  const townIds = new Map();
  const zoneIslands = [];
  for (const z of Object.values(ZONES)) for (const i of z.islands || []) zoneIslands.push({ ...i, zone: z.id });
  byId.set(MARY_GEOISE_DEF.id, { ...MARY_GEOISE_DEF, zone: 'red_line' });
  for (const t of MARY_GEOISE_DEF.towns) townIds.set(t.id, 'mary_geoise');
  for (const def of [...ALL_ISLANDS, ...zoneIslands]) {
    const where = `island "${def.id}"`;
    if (!def.id || !def.name) E(`${where}: needs id and name`);
    if (byId.has(def.id)) E(`${where}: duplicate island id`);
    byId.set(def.id, def);
    for (const k of ['x', 'y', 'w', 'h']) if (typeof def[k] !== 'number' || !isFinite(def[k])) E(`${where}: ${k} must be a number`);
    if (!SEAS.has(def.sea)) E(`${where}: unknown sea "${def.sea}"`);
    if (def.climate && typeof def.climate === 'string' && !CLIMATES[def.climate]) E(`${where}: unknown climate "${def.climate}" (use one of ${Object.keys(CLIMATES).join(', ')})`);
    if (!def.zone) {
      const reg = REGION_INFO[regionAt(def.x, def.y)]?.id;
      if (def.sea !== reg && !(def.sea === 'calm_belt' && reg === 'calm_belt')) E(`${where}: centre (${def.x},${def.y}) lies in "${reg}" but sea is "${def.sea}"`);
      const hw = def.w / 2, hh = def.h / 2;
      if (def.y - hh < POLAR + 40 || def.y + hh > H - POLAR - 40) E(`${where}: too close to the poles`);
      for (const mx of [RM_X, 0, W]) if (Math.abs(def.x - mx) < RL_HALF + hw + 22) E(`${where}: overlaps the Red Line (x=${mx}); keep |x-${mx}| > ${RL_HALF + 22} + w/2`);
      const RM = REVERSE_MOUNTAIN;
      if (Math.abs(def.x - RM.x) < RM.rx + 40 + hw && Math.abs(def.y - RM.y) < RM.ry + 40 + hh) E(`${where}: overlaps the Reverse Mountain massif (x ${RM.x - RM.rx - 40}..${RM.x + RM.rx + 40}, y ${RM.y - RM.ry - 40}..${RM.y + RM.ry + 40})`);
      if (Math.abs(def.x - W) < 60 + hw && Math.abs(def.y - EQ) < 90 + hh) E(`${where}: too close to the Red Port / Mary Geoise`);
    }
    for (const t of def.towns || []) {
      if (!t.id) E(`${where}: town "${t.name}" needs an id`);
      if (townIds.has(t.id)) E(`${where}: duplicate town id "${t.id}" (also on ${townIds.get(t.id)})`);
      townIds.set(t.id, def.id);
      if (t.style && !TOWN_STYLES[t.style]) E(`${where}: town ${t.id} has unknown style "${t.style}" (use ${Object.keys(TOWN_STYLES).join(', ')})`);
      const tw = Math.abs(t.w ?? 0.4) <= 1.5 ? (t.w ?? 0.4) * def.w : t.w;
      const th = Math.abs(t.h ?? 0.3) <= 1.5 ? (t.h ?? 0.3) * def.h : t.h;
      const area = (t.buildings || []).reduce((s, b) => s + (b.w || 6) * ((b.d || 4) + 3), 0);
      if (area > tw * th * 0.55) Wn(`${where}: town ${t.id} (${Math.round(tw)}x${Math.round(th)}) may be too small for its ${t.buildings.length} buildings`);
    }
    for (const lm of def.landmarks || []) if (lm.kind && !PROP_KINDS.has(lm.kind)) Wn(`${where}: landmark kind "${lm.kind}" has no sprite (known: ${[...PROP_KINDS].join(', ')})`);
  }
  // overlaps between surface islands
  const surf = ALL_ISLANDS;
  for (let i = 0; i < surf.length; i++) for (let j = i + 1; j < surf.length; j++) {
    const a = surf[i], b = surf[j];
    let dx = Math.abs(a.x - b.x); if (dx > W / 2) dx = W - dx;
    const gapX = dx - (a.w + b.w) / 2, gapY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
    if (gapX < 24 && gapY < 24) E(`islands "${a.id}" and "${b.id}" are too close (need a 24-tile channel between their boxes)`);
  }
  for (const def of surf) for (const n of [].concat(def.logNext || [])) if (!byId.has(n)) E(`island "${def.id}": logNext "${n}" is not an island id`);

  // ------------------------------------------------------------- world gen
  let world = null;
  const recs = new Map();
  if (!opts.noWorld) {
    const t0 = Date.now();
    world = await generateWorld({ seed: 'blue-planet', islands: ALL_ISLANDS });
    log(`world generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const r of world.islands) if (r.name) recs.set(r.id, r);
    for (const z of Object.values(ZONES)) {
      const zw = generateZoneWorld(z);
      for (const r of zw.islands) recs.set(r.id, r);
    }
    for (const def of [...ALL_ISLANDS, ...zoneIslands]) {
      const r = recs.get(def.id);
      if (!r) { E(`island "${def.id}" produced no land (is it on top of another island or the Red Line?)`); continue; }
      for (const t of def.towns || []) {
        const tr = r.towns.find((x) => x.id === t.id);
        if (!tr) { E(`island "${def.id}": town "${t.id}" not generated`); continue; }
        for (const b of t.buildings || []) {
          if (!tr.buildings.some((x) => x.name === b.name && x.role === b.role)) E(`island "${def.id}": building "${b.name || b.role}" could not be placed in town "${t.id}" (make the town bigger or the building smaller)`);
        }
      }
      if (!r.docks.length && !def.noDock && !def.zone) Wn(`island "${def.id}": no dock could be built (ships can't moor)`);
    }
  }

  // ---------------------------------------------------------------- content
  const spotsOf = (def) => {
    const s = new Set((def.spots || []).map((x) => x.id));
    for (const lm of def.landmarks || []) if (lm.spot) s.add(lm.spot);
    for (const k of Object.keys(recs.get(def.id)?.spots || {})) s.add(k);
    return s;
  };
  const npcIds = new Map();
  const questIds = new Map();
  const allSource = opts.sources || '';
  for (const p of PACKS) {
    for (const n of p.npcs || []) { if (npcIds.has(n.id)) E(`npc "${n.id}" defined twice (${npcIds.get(n.id)} and ${p.id})`); npcIds.set(n.id, p.id); }
    for (const q of p.quests || []) { if (questIds.has(q.id)) E(`quest "${q.id}" defined twice`); questIds.set(q.id, p.id); }
  }
  const mock = mockCtx();
  for (const p of PACKS) {
    if (only && p.id !== only) continue;
    const dyn = new Set(p.dynamicIds || []);
    for (const n of p.npcs || []) {
      const where = `[${p.id}] npc "${n.id}"`;
      const isl = byId.get(n.island);
      if (!isl) { E(`${where}: unknown island "${n.island}"`); continue; }
      const at = n.at || {};
      if (at.town) {
        const t = (isl.towns || []).find((x) => x.id === at.town);
        if (!t) E(`${where}: island ${n.island} has no town "${at.town}"`);
        else if (at.building && !(t.buildings || []).some((b) => b.name === at.building || b.role === at.building || b.npc === n.id)) E(`${where}: town ${at.town} has no building "${at.building}"`);
      }
      if (at.spot && !spotsOf(isl).has(at.spot)) E(`${where}: island ${n.island} has no spot "${at.spot}" (declare it in spots or on a landmark)`);
      if (n.style && !STYLES[n.style]) E(`${where}: unknown style "${n.style}"`);
      if (n.fruit && !FRUITS[n.fruit]) E(`${where}: unknown fruit "${n.fruit}"`);
      if (n.race && !RACES[n.race]) E(`${where}: unknown race "${n.race}"`);
      if (n.weapon && !WEAPONS.has(n.weapon)) Wn(`${where}: weapon kind "${n.weapon}" is unusual`);
      for (const m of n.moves || []) if (!getAbility(m)) E(`${where}: unknown move "${m}"`);
      if (n.trainer && !TRAINERS[n.trainer]) E(`${where}: unknown trainer "${n.trainer}"`);
      if (n.recruit && !CREW_ROLES[n.recruit.role]) E(`${where}: unknown crew role "${n.recruit.role}" (use ${Object.keys(CREW_ROLES).join(', ')})`);
      for (const [k] of Object.entries(n.haki || {})) if (!HAKI.has(k)) E(`${where}: unknown haki "${k}"`);
      tryRun(E, `${where} when()`, () => n.when?.(mock.char, mock.game));
      tryRun(E, `${where} marker()`, () => n.marker?.(mock.char, mock.game));
      if (n.dialogue) checkDialogue(E, where, n.dialogue, mock);
    }
    for (const [gi, g] of (p.groups || []).entries()) {
      const where = `[${p.id}] group #${gi} on "${g.island}"`;
      const isl = byId.get(g.island);
      if (!isl) { E(`${where}: unknown island`); continue; }
      if (g.spot && !spotsOf(isl).has(g.spot)) E(`${where}: unknown spot "${g.spot}"`);
      for (const e of g.enemies || []) {
        const arch = Array.isArray(e) ? e[0] : e;
        if (!ARCHETYPES[arch]) E(`${where}: unknown archetype "${arch}" (use ${Object.keys(ARCHETYPES).join(', ')})`);
        const over = Array.isArray(e) ? e[2] : null;
        for (const m of over?.moves || []) if (!getAbility(m)) E(`${where}: unknown move "${m}"`);
      }
      tryRun(E, `${where} when()`, () => g.when?.(mock.char, mock.game));
    }
    for (const q of p.quests || []) {
      const where = `[${p.id}] quest "${q.id}"`;
      if (!q.name || !Array.isArray(q.stages) || !q.stages.length) { E(`${where}: needs name and stages`); continue; }
      const sids = new Set();
      for (const st of q.stages) {
        if (!st.id) E(`${where}: every stage needs an id`);
        if (sids.has(st.id)) E(`${where}: duplicate stage id "${st.id}"`);
        sids.add(st.id);
        if (!st.desc) E(`${where}: stage ${st.id} needs desc`);
        const g = st.goal;
        if (!g) continue;
        if (!GOALS.has(g.type)) E(`${where}: stage ${st.id} unknown goal type "${g.type}"`);
        if (g.type === 'defeat') for (const id of [g.npc, ...(g.any || [])].filter(Boolean)) if (!npcIds.has(id) && !dyn.has(id)) E(`${where}: defeat goal names unknown npc "${id}" (add it to npcs, or to the pack's dynamicIds if install() spawns it)`);
        if (g.type === 'reach') {
          const isl = byId.get(g.island);
          if (!isl) E(`${where}: reach goal names unknown island "${g.island}"`);
          else if (g.spot && !spotsOf(isl).has(g.spot)) E(`${where}: reach goal names unknown spot "${g.spot}" on ${g.island}`);
        }
        if (g.type === 'item' && !ITEMS[g.item]) E(`${where}: item goal names unknown item "${g.item}"`);
      }
      const r = q.rewards || {};
      for (const [it] of r.items || []) if (!ITEMS[it]) E(`${where}: reward item "${it}" unknown`);
      for (const k of Object.keys(r.mastery || {})) if (!STYLES[k]) E(`${where}: reward mastery style "${k}" unknown`);
      for (const k of Object.keys(r.haki || {})) if (!HAKI.has(k)) E(`${where}: reward haki "${k}" unknown`);
      for (const k of Object.keys(r.attrs || {})) if (!['str', 'agi', 'end', 'vit', 'wil'].includes(k)) E(`${where}: reward attr "${k}" unknown`);
      if (allSource && !new RegExp(`['"\`]${q.id}['"\`]`).test(allSource.replace(new RegExp(`id: ['"]${q.id}['"]`, 'g'), ''))) Wn(`${where}: nothing seems to start this quest (no startQuest('${q.id}') found)`);
    }
  }
  // trainers & shops
  for (const [id, t] of Object.entries(TRAINERS)) {
    for (const s of Object.keys(t.styles || {})) if (!STYLES[s]) E(`trainer "${id}": unknown style "${s}"`);
    for (const a of t.teaches || []) if (!getAbility(a)) E(`trainer "${id}": unknown technique "${a}"`);
    for (const k of Object.keys(t.haki || {})) if (!HAKI.has(k)) E(`trainer "${id}": unknown haki "${k}"`);
  }
  for (const [id, list] of Object.entries(STOCK)) for (const it of list) if (!ITEMS[it]) E(`shop stock "${id}": unknown item "${it}"`);
  for (const [id, it] of Object.entries(ITEMS)) if (it.ability && !getAbility(it.ability)) E(`item "${id}": unknown ability "${it.ability}"`);
  for (const [id, a] of Object.entries(ARCHETYPES)) for (const m of a.moves || []) if (!getAbility(m)) E(`archetype "${id}": unknown move "${m}"`);

  return { errors, warns, islands: ALL_ISLANDS.length, npcs: npcIds.size, quests: questIds.size };
}

function tryRun(E, where, fn) {
  try { return fn(); } catch (e) { E(`${where} threw: ${e.message}`); return undefined; }
}

function checkDialogue(E, where, dlg, mock) {
  const tree = tryRun(E, `${where} dialogue()`, () => (typeof dlg === 'function' ? dlg(mock.ctx) : dlg));
  if (!tree) return;
  if (!tree.nodes) { E(`${where}: dialogue tree has no nodes`); return; }
  const start = tree.start || 'start';
  if (!tree.nodes[start]) E(`${where}: dialogue start node "${start}" missing`);
  for (const [nid, node] of Object.entries(tree.nodes)) {
    const w = `${where} node "${nid}"`;
    if (typeof node.text === 'function') tryRun(E, `${w} text()`, () => node.text(mock.ctx));
    else if (node.text !== undefined && typeof node.text !== 'string') E(`${w}: text must be a string or function`);
    const nx = typeof node.next === 'function' ? tryRun(E, `${w} next()`, () => node.next(mock.ctx)) : node.next;
    if (typeof nx === 'string' && nx !== 'end' && !tree.nodes[nx]) E(`${w}: next → missing node "${nx}"`);
    if (typeof node.redirect === 'string' && !tree.nodes[node.redirect]) E(`${w}: redirect → missing node "${node.redirect}"`);
    for (const [ci, c] of (node.choices || []).entries()) {
      if (c.if) tryRun(E, `${w} choice ${ci + 1} if()`, () => c.if(mock.ctx));
      if (typeof c.text === 'function') tryRun(E, `${w} choice ${ci + 1} text()`, () => c.text(mock.ctx));
      if (typeof c.next === 'string' && c.next !== 'end' && !tree.nodes[c.next]) E(`${w} choice ${ci + 1}: next → missing node "${c.next}"`);
    }
  }
}

function mockCtx() {
  const char = {
    name: 'Tester', race: 'human', traits: [], dream: 'king', bounty: 0, berries: 1000, faction: 'civilian', marineRank: null, merit: 0,
    attrs: { str: 5, agi: 5, end: 5, vit: 5, wil: 5 }, masteries: { brawler: 0 }, techniques: [], hotbar: [], style: 'brawler', fruit: null, fruitMastery: 0,
    haki: { armament: 0, observation: 0, conqueror: 0 }, inventory: [], equipped: { weapons: [], hat: null, coat: null }, ships: [], crew: [],
    discovered: [], logPose: { has: false, target: null, last: null, progress: 0, needles: 1 }, eternalPoses: [], quests: {}, flags: {}, defeated: {}, bosses: [],
    liberated: [], trained: {}, stats: {}, world: { day: 1, clock: 9, chests: {}, npc: {}, fruitSpawns: [] }, lives: 3, maxLives: 3, generation: 1,
  };
  const quests = { state: () => null, stageId: () => null, isDone: () => false, isActive: () => false, active: () => [], start: () => true, setStage: () => {}, complete: () => {} };
  const noop = () => {};
  const game = {
    state: { char, legacy: { perks: {} } }, quests, env: { day: 1, clock: 9, daylight: 1 }, player: { x: 0, y: 0, hp: 100, d: { maxHp: 100 }, style: 'brawler', masteries: {} },
    surface: { islands: [] }, world: { islands: [], distance: () => 999 }, actors: [], ships: [], ui: { toast: noop, banner: noop, log: noop }, log: noop, emit: noop, on: noop,
    fruitRumor: () => null, currentIsland: null, crew: { has: () => false, count: () => 0, members: () => [] }, marines: { rank: () => null }, progression: { raiseAttr: noop, breakthrough: noop, addBounty: noop, awakenHaki: noop, addHaki: noop, addStyleMastery: noop },
  };
  const ctx = {
    game, npc: null, char, player: game.player, flag: () => false, setFlag: noop, has: () => false, give: noop, take: noop, pay: () => false, earn: noop,
    berries: () => 1000, quest: () => null, startQuest: noop, stage: noop, complete: noop, log: noop, open: noop, goto: noop, save: noop, emit: noop, progression: game.progression,
  };
  return { char, game, ctx };
}
