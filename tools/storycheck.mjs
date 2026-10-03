// Static check of the main story: every chapter, road and person resolves.
//   node tools/storycheck.mjs
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { PACKS } = await import('../src/content/index.js');
const { registerNPCs, npcDef } = await import('../src/game/npcs.js');
const { registerQuests, questDef } = await import('../src/game/quests.js');
const { CHAPTERS, PROLOGUES, PLANS, TARGETS } = await import('../src/content/main/define.js');
const { ALL_ISLANDS, ISLAND_BY_ID } = await import('../src/data/islands/index.js');
const { GL_ROADS } = await import('../src/content/main/grandLine.js');
for (const p of PACKS) { if (p.npcs) registerNPCs(p.npcs); if (p.quests) registerQuests(p.quests); }

let errors = 0, warns = 0;
const err = (m) => { errors++; console.log('ERROR', m); };
const warn = (m) => { warns++; console.log('warn ', m); };
const PATHS = ['pirate', 'marine', 'hunter'];

/** does a placement resolve against the island data? */
function checkAt(who, islandId, at) {
  const isl = ISLAND_BY_ID[islandId];
  if (!isl) { if (islandId !== 'fishman_island') err(`${who}: no island ${islandId}`); return; }
  if (!at || typeof at === 'function') return;
  if (at.spot) { if (!(isl.spots || []).some((s) => s.id === at.spot) && !(isl.landmarks || []).some((l) => l.spot === at.spot)) err(`${who}: no spot ${at.spot} on ${islandId}`); return; }
  if (at.town) {
    const t = (isl.towns || []).find((x) => x.id === at.town);
    if (!t) { err(`${who}: no town ${at.town} on ${islandId}`); return; }
    const key = at.building || at.door;
    if (key && !(t.buildings || []).some((b) => b.name === key || b.role === key)) err(`${who}: no building "${key}" in ${at.town}`);
  }
}

// ---- chapters
for (const ch of CHAPTERS.values()) {
  for (const path of PATHS) {
    const v = ch.v[path];
    if (!v) continue;
    const qid = `mq:${ch.id}:${path}`;
    const d = questDef(qid);
    if (!d) { err(`${qid}: no quest`); continue; }
    if (!v.name) err(`${qid}: no name`);
    if (!v.summary) err(`${qid}: no summary`);
    for (const st of d.stages) {
      if (!st.desc || /undefined|mq_home_|\[object/.test(st.desc)) err(`${qid} stage ${st.id}: bad desc "${st.desc}"`);
      const g = st.goal || {};
      if (g.type === 'quest') {
        const q = questDef(g.quest);
        if (!q) err(`${qid}: nested quest ${g.quest} missing`);
        if (st.npc && !npcDef(st.npc)) err(`${qid}: giver ${st.npc} missing`);
      }
      if (g.type === 'defeat' && g.npc && !npcDef(g.npc)) err(`${qid}: target ${g.npc} missing`);
      if (st.npc && !npcDef(st.npc)) err(`${qid} stage ${st.id}: npc ${st.npc} missing`);
    }
    const ct = v.contact;
    if (ct) {
      const id = ct.npc || (ct.key ? `mq_${ct.key}` : `mq_${ch.id}_${path}`);
      const def = npcDef(id);
      if (!def) err(`${qid}: contact ${id} missing`);
      else {
        if (def.island !== ch.island) err(`${qid}: contact ${id} lives on ${def.island}, chapter is on ${ch.island}`);
        checkAt(`${qid} contact ${id}`, def.island, def.at);
        if (def.boss && !def.invulnerable) warn(`${qid}: contact ${id} is a boss (could be beaten before you meet them)`);
      }
      if (ch.kind !== 'start' && !(v.meet || []).length) err(`${qid}: contact but no meet lines`);
      if ((v.tasks || []).length && !v.noReport && !(v.done || []).length) err(`${qid}: no done lines`);
    }
    if (ch.kind === 'start' && !(v.pitch || []).length) err(`${qid}: no pitch`);
    if (!ch.island && ch.kind !== 'solo') err(`${qid}: no island`);
  }
}
for (const d of TARGETS) checkAt(`target ${d.id}`, d.island, d.at);

// ---- crewmates are offered, never forced: every crew stop and last port of
// the Blues has someone who'd sail with you ask, on every road (and nobody's
// story is held up waiting for a crewmate)
let offers = 0;
for (const ch of CHAPTERS.values()) {
  for (const path of PATHS) {
    const q = questDef(`mq:${ch.id}:${path}`);
    if (!q) continue;
    for (const st of q.stages) {
      if (st.goal?.type === 'crew') err(`${q.id}: step ${st.id} forces a crewmate (make it an offer: T.offer)`);
      if (!st.offer) continue;
      offers++;
      const d = npcDef(st.offer);
      if (!d?.recruit) err(`${q.id}: offer from ${st.offer}, who'd never join (no recruit)`);
      else if (d.island !== ch.island) err(`${q.id}: offer from ${st.offer}, who lives on ${d.island} (the chapter is on ${ch.island})`);
    }
    if (ch.part === 1 && (ch.role === 'crew' || ch.role === 'last') && !q.stages.some((s) => s.offer)) err(`${q.id}: a ${ch.role} stop with no crewmate's offer`);
  }
}

// ---- the plans
const seen = new Set();
const fakeChar = (home) => ({ runSeed: 12345, flags: {}, quests: {}, bosses: [], defeated: {}, main: { home, done: [] } });
for (const [isl, chId] of PROLOGUES) {
  for (const path of PATHS) {
    const c = fakeChar(isl);
    const chain = PLANS[1](c, path, CHAPTERS.get(chId));
    if (chain[0] !== chId) err(`plan1 ${isl}/${path}: doesn't start at home`);
    if (chain.length !== 5) err(`plan1 ${isl}/${path}: ${chain.length} chapters (${chain.join(', ')})`);
    for (const id of chain) {
      const ch = CHAPTERS.get(id);
      if (!ch) { err(`plan1 ${isl}/${path}: no chapter ${id}`); continue; }
      if (!ch.v[path]) err(`plan1 ${isl}/${path}: ${id} has no ${path} telling`);
      if (ch.island === isl && ch.kind !== 'start') err(`plan1 ${isl}/${path}: stop ${id} is on the home island`);
      seen.add(id);
    }
  }
}
for (const path of PATHS) {
  for (const road of GL_ROADS[path]) {
    for (const id of ['gl_twin_cape', ...road.chain]) {
      const ch = CHAPTERS.get(id);
      if (!ch) err(`road ${path}/${road.id}: no chapter ${id}`);
      else if (!ch.v[path]) err(`road ${path}/${road.id}: ${id} has no ${path} telling`);
      seen.add(id);
    }
    // eastward, so the "can't sail past" line never blocks the way on
    let lastX = -Infinity;
    for (const id of road.chain) {
      const x = ISLAND_BY_ID[CHAPTERS.get(id)?.island]?.x;
      if (x !== undefined && x + 700 < lastX) err(`road ${path}/${road.id}: ${id} is west of the one before (x ${x} < ${lastX})`);
      if (x !== undefined) lastX = Math.max(lastX, x);
    }
  }
  const chain3 = PLANS[3]({ runSeed: 1, main: { done: [] } }, path, null, null);
  for (const id of chain3) { const ch = CHAPTERS.get(id); if (!ch?.v[path]) err(`plan3 ${path}: ${id} has no ${path} telling`); seen.add(id); }
}
for (const id of CHAPTERS.keys()) if (!seen.has(id)) warn(`chapter ${id} is on no road`);

// ---- home towns: the three givers can be placed
for (const [isl] of PROLOGUES) {
  const I = ISLAND_BY_ID[isl];
  if (!I) err(`home ${isl}: no island`);
}
console.log(`\n${CHAPTERS.size} chapters, ${PROLOGUES.size} home islands, ${TARGETS.length} targets, ${offers} crewmates' offers — ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);
