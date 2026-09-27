// The main story. Three roads — Pirate, Marine, Bounty Hunter — from a home
// island in one of the four Blues, over Reverse Mountain, through the Grand
// Line and into the New World:
//
//   Part 1, The Blues: three people on your home island can set you on your
//     road (an old sea dog, the Marine post's officer, a bounty broker). Their
//     first job is simple; then they hand you a Log Pose set for the next
//     island, and three more stops get you ready for the Grand Line — a ship
//     that can take it, a crew or a rank, the last town before the mountain.
//     Part 1 ends when you ride Reverse Mountain.
//   Part 2, The Grand Line: the Log Pose picks one of the seven roads out of
//     Twin Cape and every road is its own adventure. Pirate roads all end at
//     Sabaody, the Marines' at Marineford, the hunters' at Enies Lobby.
//   Part 3, The New World.
//
// The chapters are data (content/main/*.js). This module makes quests and
// people of them and keeps the story going: one chapter at a time (it can't
// be abandoned), the next one starts when one ends, the Log Pose points the
// way, the Grand Line won't let you sail past the island your story is on,
// and if your road changes (a Marine who deserts, a hunter who raises a
// flag) the story follows you.
import { CHAPTERS, PROLOGUES, TARGETS, PLANS, PATHS3 } from './main/define.js';
import './main/blues.js';
import './main/grandLine.js';
import './main/newWorld.js';
import { PATHS, PART_NAMES } from './main/paths.js';
import { questDef } from '../game/quests.js';
import { npcDef, allNpcDefs } from '../game/npcs.js';
import { ISLAND_BY_ID } from '../data/islands/index.js';
import { addItem, count } from '../game/inventory.js';
import { persist } from '../game/lineage.js';
import { spawnNow } from './helpers.js';
import { enlistNow, rankIndex } from '../game/factions.js';
import { regionAt, REGION, isGrandLine } from '../world/constants.js';
import { formatBerries } from '../core/math.js';

export const qidOf = (chId, path) => `mq:${chId}:${path}`;
const parse = (qid) => { const [, ch, path] = String(qid).split(':'); return { ch: CHAPTERS.get(ch), path }; };
const isMain = (qid) => String(qid).startsWith('mq:');
const islName = (id) => ISLAND_BY_ID[id]?.name || '';
const text = (t, ctx) => (typeof t === 'function' ? t(ctx) : t);

// who each person is to the story: npc id → [{ ch, path }]
const CONTACTS = new Map();
// people you're sent to talk to: npc id → [{ qid, stage, lines }]
const TALKS = new Map();
// defeat targets: npc id → [{ qid, stage }]
const HUNTS = new Map();

const contactIdOf = (ch, path) => {
  const ct = ch.v[path]?.contact;
  if (!ct) return null;
  return ct.npc || (ct.key ? `mq_${ct.key}` : `mq_${ch.id}_${path}`);
};
const contactOf = (ch, path) => {
  const ct = ch.v[path]?.contact;
  if (!ct) return null;
  if (ct.npc) { const d = npcDef(ct.npc); return { ...ct, name: ct.name || d?.name || ct.npc, title: ct.title || d?.title }; }
  return ct;
};
const shortName = (n) => String(n || '').replace(/^"[^"]*"\s*/, '');

// ------------------------------------------------------------ rewards
/** The pay for a chapter: grows with how far along the story is (part, and chapter within it). */
export function chapterReward(part, k, path) {
  const b = part === 1 ? 3000 + 1800 * k : part === 2 ? 40000 + 14000 * k : 400000 + 90000 * k;
  const r = { berries: Math.round(b * (path === 'hunter' ? 1.4 : path === 'marine' ? 0.8 : 1) / 100) * 100, points: part };
  if (path === 'marine') { r.merit = part === 1 ? 60 + 45 * k : part === 2 ? 260 + 110 * k : 900 + 220 * k; r.reputation = part * 2 + 1; }
  if (path === 'hunter') r.reputation = part * 2 + 2;
  if (path === 'pirate') r.reputation = 1;
  return r;
}

// ------------------------------------------------------------ build
function prepTask(t, qid) {
  const st = { ...t };
  if (t.goal?.type === 'talk') {
    // done by talking to someone: a flag their conversation sets
    st.goal = { type: 'flag', flag: `mq_t_${qid}_${t.id}` };
    const list = TALKS.get(t.goal.npc) || [];
    list.push({ qid, stage: t.id, lines: t.lines || [], flag: st.goal.flag, choice: t.choice });
    TALKS.set(t.goal.npc, list);
    st.npc = t.goal.npc;
  }
  if (t.goal?.type === 'quest' && t.autoStart) {
    const prev = st.onStart;
    st.onStart = (ctx, g) => { prev?.(ctx, g); if (!g.quests.state(t.goal.quest) && !(t.goal.alt && t.goal.alt(g.state.char, g))) g.quests.start(t.goal.quest); };
  }
  if (t.goal?.type === 'defeat' && TARGETS.some((d) => d.id === t.goal.npc)) {
    const list = HUNTS.get(t.goal.npc) || [];
    list.push({ qid, stage: t.id });
    HUNTS.set(t.goal.npc, list);
    const prev = t.onStart;
    st.onStart = (ctx, g) => { prev?.(ctx, g); spawnNow(g, t.goal.npc); };
    st.npc = st.npc || t.goal.npc;
  }
  return st;
}

function buildQuest(ch, path) {
  const v = ch.v[path];
  const qid = qidOf(ch.id, path);
  const ct = contactOf(ch, path);
  const cid = contactIdOf(ch, path);
  const place = ch.place || islName(ch.island);
  const stages = [];
  if (ch.kind !== 'start' && ch.island && !v.noArrive) stages.push({ id: 'arrive', desc: v.arrive || `Sail to ${place}.`, goal: { type: 'reach', island: ch.island }, where: v.arriveWhere });
  // (names of people already in the world are looked up when they're needed: their packs register them later)
  const who = () => shortName(contactOf(ch, path)?.name);
  if (ch.kind !== 'start' && ct) stages.push({ id: 'meet', get desc() { return v.find || `Find ${who()}${ct.where ? ' ' + ct.where : ''}.`; }, goal: { type: 'flag', flag: `mq_met_${ch.id}_${path}` }, npc: cid });
  for (const t of v.tasks || []) stages.push(prepTask(t, qid));
  if (ct && (v.tasks || []).length && !v.noReport) stages.push({ id: 'report', get desc() { return v.report || `Report back to ${who()}${ct.where ? ' ' + ct.where : ''}.`; }, goal: { type: 'flag', flag: `mq_done_${ch.id}_${path}` }, npc: cid });
  if (!stages.length) throw new Error(`chapter ${ch.id} (${path}) has nothing to do`);
  return {
    id: qid, kind: 'main', part: ch.part, partName: PART_NAMES[ch.part], name: v.name, summary: v.summary, island: ch.island, islandName: place, path, chapterId: ch.id, stages,
    rewards: (ctx, g) => {
      const m = g.state.char.main;
      const k = m ? m.at : 0;
      const base = chapterReward(ch.part, k, path);
      const extra = typeof v.reward === 'function' ? v.reward(g) : v.reward || {};
      const r = { ...base, ...extra };
      if (extra.berries) r.berries = base.berries + extra.berries;
      if (extra.merit) r.merit = (base.merit || 0) + extra.merit;
      if (extra.reputation) r.reputation = (base.reputation || 0) + extra.reputation;
      if (path !== 'marine') delete r.merit;
      return r;
    },
    onComplete: (ctx, g) => {
      const extra = typeof v.reward === 'function' ? v.reward(g) : v.reward || {};
      if (extra.ship) giveShip(g, extra.ship, extra.shipName);
      v.onDone?.(g, ctx);
    },
  };
}

function giveShip(g, type, name) {
  const isl = g.currentIsland;
  const dock = isl?.docks?.[0];
  const p = g.player;
  const pos = dock ? dock.moor : { x: p.x, y: p.y + 6 };
  const s = g.giveShip(type, pos.x, pos.y, name);
  s?.unstick?.(g.world);
  g.ui.toast('A NEW SHIP!', `${name || type} is moored ${dock ? 'at the pier' : 'nearby'}.`, '#ffe082');
  return s;
}

// ------------------------------------------------------------ people
function contactNpc(id, ch, path) {
  const ct = ch.v[path].contact;
  return {
    id, name: ct.name, title: ct.title, island: ch.island, at: ct.at || { plaza: true }, look: ct.look, race: ct.race, level: ct.level ?? 10,
    faction: ct.faction || 'civilian', style: ct.style, weapon: ct.weapon, when: ct.when, ai: ct.ai, story: true,
    dialogue: (ctx) => storyTree(ctx, id, null),
  };
}

const QUESTS = [];
const NPCS = [];
for (const ch of CHAPTERS.values()) {
  for (const path of PATHS3) {
    const v = ch.v[path];
    if (!v) continue;
    QUESTS.push(buildQuest(ch, path));
    const id = contactIdOf(ch, path);
    if (!id) continue;
    const list = CONTACTS.get(id) || [];
    list.push({ ch, path });
    CONTACTS.set(id, list);
    if (!v.contact.npc && !NPCS.some((n) => n.id === id)) NPCS.push(contactNpc(id, ch, path));
  }
}
// the people you're sent after only show up while you're after them
for (const d of TARGETS) {
  const uses = HUNTS.get(d.id) || [];
  const prev = d.when;
  NPCS.push({ ...d, when: (c, g) => (!prev || prev(c, g)) && uses.some((u) => g.quests.stageId(u.qid) === u.stage) });
}

// ------------------------------------------------------------ the story's state
function main(g) { return g.state?.char?.main || null; }
/** The chapter under way: { ch, path, qid, s } or null. */
function current(g) {
  const m = main(g);
  if (!m || m.finished) return null;
  const ch = CHAPTERS.get(m.chain[m.at]);
  if (!ch) return null;
  const qid = qidOf(ch.id, m.path);
  return { ch, path: m.path, qid, s: g.state.char.quests[qid] || null };
}
const stageOf = (g, qid) => g.quests.stageId(qid);

/** Does this road still fit who the character is? */
function roadFits(c, path) {
  if (path === 'marine') return c.main?.sworn ? c.faction === 'marine' : c.faction !== 'pirate' && !c.crewName && !(c.bounty > 0) && !c.flags.deserter;
  if (path === 'hunter') return c.faction !== 'marine' && c.faction !== 'pirate' && !c.crewName;
  return c.faction !== 'marine';
}
function roadFor(c) {
  if (c.faction === 'marine') return 'marine';
  if (c.faction === 'pirate' || c.crewName || c.bounty > 0) return 'pirate';
  return 'hunter';
}
/** Why a road can't be taken right now (null if it can). */
export function roadClosed(c, path) {
  if (path === 'marine') {
    if (c.flags.deserter) return 'The Navy doesn\'t take deserters back.';
    if (c.crewName) return `You fly the flag of the ${c.crewName} — the Navy doesn't recruit pirate captains.`;
    if (c.bounty > 0) return `There's a ${formatBerries(c.bounty)} bounty on your head.`;
  }
  if (path === 'hunter') {
    if (c.faction === 'marine') return 'You already serve the Navy.';
    if (c.crewName) return `You're a pirate captain yourself now — the ${c.crewName}.`;
  }
  if (path === 'pirate' && c.faction === 'marine') return 'You wear the Navy\'s cap. Resign first, if the sea calls you another way.';
  return null;
}

// ------------------------------------------------------------ install
export function installMainStory(game) {
  const S = {
    game,
    pending: 0, // seconds until the next chapter opens
    t: 0,
    driftMsg: 0,
  };
  game.story = S;
  const C = () => game.state?.char;

  // ------------------------------------------------ beginning
  /** Take up a road: from a home island's prologue (Part 1) or later (Crocus at Twin Cape…). */
  S.begin = (chId, path) => {
    const c = C();
    const ch = CHAPTERS.get(chId);
    if (!c || !ch || c.main) return false;
    const part = ch.part;
    c.main = { path, part, chain: PLANS[part](c, path, ch, game), at: 0, done: [], skipped: [], route: null, sworn: false, began: game.env.day, home: ch.kind === 'start' ? ch.island : null };
    if (ch.kind !== 'start' && c.main.chain[0] !== ch.id) c.main.chain.unshift(ch.id);
    c.main.route = c.main.route || c.mainRoute || null;
    c.mainIntro = null;
    game.ui.banner(PATHS[path].name.toUpperCase(), `Part ${part} · ${PART_NAMES[part]}`, PATHS[path].tagline, 5);
    game.log(`You take up the road of the ${PATHS[path].name}.`, PATHS[path].color);
    openChapter();
    persist(game);
    return true;
  };

  function openChapter() {
    const c = C(), m = c?.main;
    if (!m || m.finished) return;
    const chId = m.chain[m.at];
    const qid = qidOf(chId, m.path);
    if (!questDef(qid)) { console.warn('main story: no chapter', qid); m.at++; if (m.at < m.chain.length) openChapter(); else nextPart(); return; }
    if (c.quests[qid]?.done) { advance(qid, true); return; }
    if (!c.quests[qid]) game.quests.start(qid);
    const s = c.quests[qid];
    if (s) s.ch = m.at + 1;
    pointTheWay();
  }

  /** The Log Pose points to the island the story continues on (in the Blues, and once a log is earned in the Grand Line). */
  function pointTheWay() {
    const cur = current(game);
    const c = C();
    if (!cur || !c.logPose || cur.ch.kind === 'start' || !cur.ch.island || cur.ch.noLog) return;
    const isl = ISLAND_BY_ID[cur.ch.island];
    if (!isl || !['east_blue', 'north_blue', 'west_blue', 'south_blue', 'paradise', 'new_world'].includes(isl.sea)) return;
    const st = stageOf(game, cur.qid);
    if (st !== 'arrive') return;
    const lp = c.logPose;
    if (lp.target === isl.id || (lp.eternal && count(c, lp.eternal))) return;
    lp.target = isl.id;
    lp.last = game.currentIsland?.id || lp.last;
    lp.progress = 0;
    lp.setting = null;
    if (count(c, 'log_pose') || count(c, 'new_world_log_pose')) {
      game.ui.toast('LOG SET', `The needle swings toward ${c.discovered.includes(isl.id) ? isl.name : 'an island you haven\'t seen yet'}.`, '#81d4fa');
      game.audio?.sfx('reveal');
    }
  }

  function advance(qid, silent = false) {
    const c = C(), m = c?.main;
    if (!m || m.finished) return;
    const chId = m.chain[m.at];
    if (qidOf(chId, m.path) !== qid) return;
    if (!m.done.includes(qid)) m.done.push(qid);
    m.at++;
    if (m.at >= m.chain.length) { nextPart(silent); return; }
    S.pending = silent ? 0.01 : 2.4;
  }

  function nextPart(silent = false) {
    const c = C(), m = c.main;
    const done = m.part;
    if (!silent) game.ui.banner(`PART ${done} COMPLETE`, PART_NAMES[done], done === 1 ? 'The Blues are behind you. There is no going back.' : done === 2 ? 'Paradise is behind you. The New World waits beyond the Red Line.' : 'Your name will be told for a hundred years.', 6);
    if (!PLANS[done + 1]) { m.finished = true; persist(game); return; }
    m.part = done + 1;
    m.chain = PLANS[m.part](c, m.path, null, game);
    m.at = 0;
    S.pending = silent ? 0.01 : 5;
    persist(game);
  }

  /** Close the chapter under way without finishing it (you sailed on and it's behind you now). */
  function leaveBehind(why) {
    const cur = current(game);
    const c = C(), m = c.main;
    if (cur) {
      if (cur.s && !cur.s.done) { delete c.quests[cur.qid]; m.skipped.push(cur.qid); }
      game.log(`${questDef(cur.qid)?.name || 'A chapter'} is left behind: ${why}`, '#b0bec5');
    }
  }

  /** The story jumps ahead to a later part (crossing Reverse Mountain or the Red Line with chapters unfinished). */
  S.jumpTo = (part, why) => {
    const c = C(), m = c?.main;
    if (!m || m.finished || m.part >= part || !PLANS[part]) return;
    leaveBehind(why);
    m.part = part;
    m.chain = PLANS[part](c, m.path, null, game);
    m.at = 0;
    game.ui.banner(`PART ${part}`, PART_NAMES[part], why, 6);
    S.pending = 3;
    persist(game);
  };

  // ------------------------------------------------ road changes
  function switchRoad(to, why) {
    const c = C(), m = c.main;
    const cur = current(game);
    if (!m || m.path === to) return;
    const from = m.path;
    let stage = null;
    if (cur?.s && !cur.s.done) {
      stage = stageOf(game, cur.qid);
      delete c.quests[cur.qid];
    }
    m.path = to;
    m.sworn = to === 'marine' && c.faction === 'marine';
    // the rest of this part, told the new way (what's done stays done)
    const plan = PLANS[m.part](c, to, null, game);
    const doneCh = new Set(m.done.map((q) => parse(q).ch?.id));
    if (cur && cur.ch.v[to] && (cur.ch.kind !== 'start' || PROLOGUES.get(cur.ch.island) === cur.ch.id)) {
      // (the same island, the other side of it)
      m.chain = [...m.chain.slice(0, m.at), cur.ch.id, ...plan.filter((id) => id !== cur.ch.id && !doneCh.has(id) && CHAPTERS.get(id)?.kind !== 'start')];
    } else {
      m.chain = [...m.chain.slice(0, m.at), ...plan.filter((id) => !doneCh.has(id) && CHAPTERS.get(id)?.kind !== 'start')];
    }
    game.ui.banner('A NEW ROAD', `${PATHS[from].name} → ${PATHS[to].name}`, why, 6);
    game.log(`Your story takes a new turn: you are on the road of the ${PATHS[to].name} now.`, PATHS[to].color);
    openChapter();
    const nq = current(game);
    if (nq && stage === 'arrive' && game.quests.stageId(nq.qid) !== 'arrive') { /* already there */ }
    persist(game);
  }
  function checkRoad() {
    const c = C(), m = c?.main;
    if (!m || m.finished) return;
    if (m.path === 'marine' && !m.sworn && c.faction === 'marine') m.sworn = true;
    if (roadFits(c, m.path)) return;
    const to = roadFor(c);
    const why = m.path === 'marine' ? (c.flags.deserter ? 'You turned on the Navy. There\'s only one road left for a deserter.' : 'You handed in your cap. What you hunt now is your own business.')
      : to === 'marine' ? 'You swore the Navy\'s oath.' : c.crewName ? `You raised the flag of the ${c.crewName}.` : 'With a price on your head, the world calls you a pirate now.';
    switchRoad(to, why);
  }
  game.on('marineRankChanged', () => checkRoad());
  game.on('crewFounded', () => checkRoad());

  // ------------------------------------------------ events
  game.on('questDone', (qid) => { if (isMain(qid)) advance(qid); });
  game.on('characterStart', ({ char, isNew, spawn } = {}) => {
    S.pending = 0;
    const c = char || C();
    if (!c) return;
    if (!c.main && !c.mainIntro) c.mainIntro = introFor(game, c, spawn);
    if (c.main && !c.main.finished) S.pending = 1.5; // (resume: make sure the chapter is open)
    void isNew;
  });
  game.on('tick', (dt) => tick(dt));

  function tick(dt) {
    const c = C();
    if (!c) return;
    if (S.pending > 0) {
      S.pending -= dt;
      if (S.pending <= 0) { S.pending = 0; if (!game.dialogue?.active) openChapter(); else S.pending = 0.5; }
    }
    if ((S.t -= dt) > 0) return;
    S.t = 0.5;
    const m = c.main;
    if (!m || m.finished) return;
    checkRoad();
    // crossings that leave the rest of a part behind
    const p = game.player;
    if (p && game.world === game.surface) {
      const reg = regionAt(p.x, p.y);
      if (m.part === 1 && isGrandLine(reg) && c.flags.enteredGrandLine) {
        const cur = current(game);
        if (!cur || cur.ch.part === 1) {
          if (cur && cur.ch.gate === 'reverse_mountain') { /* the ride finishes the chapter itself */ } else S.jumpTo(2, 'You crossed Reverse Mountain before your business in the Blues was done. The Blues are behind you now.');
        }
      }
      if (m.part === 2 && reg === REGION.NEW_WORLD) S.jumpTo(3, 'You reached the New World before your story in Paradise was done.');
    }
    // a chapter lost somehow (an old save, a changed story): open it again
    const cur = current(game);
    if (cur && !cur.s && !S.pending) openChapter();
    else if (cur?.s?.done && !S.pending) advance(cur.qid, true);
    if (cur) pointTheWay();
  }

  // ------------------------------------------------ the Grand Line keeps you on your road
  // You can't sail on past the island your story is on: without its log the
  // Grand Line's currents turn you round (the needle is set on it, and the
  // story won't let the log settle anywhere else till you're done there).
  S.limit = () => {
    const cur = current(game);
    if (!cur || cur.ch.part !== 2 || !cur.ch.island || cur.ch.free) return null;
    const isl = ISLAND_BY_ID[cur.ch.island];
    if (!isl || isl.sea !== 'paradise') return null;
    return { isl, x: isl.x + 700 };
  };
  game.storyCurrent = (x, y, out, who) => {
    const p = game.player;
    if (!p || game.world !== game.surface || (who !== p.ship && who !== p)) return;
    const L = S.limit();
    if (!L) return;
    const dx = game.world.dx(L.x, x); // (how far past the line, east)
    if (dx <= 0) return;
    const reg = regionAt(x, y);
    if (reg !== REGION.PARADISE) return;
    const f = Math.min(10, 4 + dx / 50);
    const back = Math.atan2(L.isl.y - y, game.world.dx(x, L.isl.x));
    out.x += Math.cos(back) * f;
    out.y += Math.sin(back) * f;
    out.steer = Math.max(out.steer || 0, 0.5);
    if (game.time > S.driftMsg) {
      S.driftMsg = game.time + 25;
      game.ui.banner('LOST WITHOUT A LOG', L.isl.name, `Your Log Pose is locked on ${L.isl.name} — and without its log the Grand Line's currents turn you round. Your story continues there.`, 5);
    }
  };
  /**
   * Should the log hold off on this island? While the story is on an island
   * of the Grand Line it won't settle anywhere else: not on the island itself
   * until you're done there, nor on one you've wandered off to on the way.
   */
  game.storyLogHold = (isl) => {
    const cur = current(game);
    if (!cur || !cur.s || cur.s.done || cur.ch.part < 2 || !cur.ch.island || cur.ch.noLog) return false;
    if (cur.ch.island === isl.id) return true;
    return stageOf(game, cur.qid) === 'arrive';
  };

  // ------------------------------------------------ markers
  game.storyMarker = (a) => {
    const c = C();
    if (!c || !a.npcId) return null;
    const m = c.main;
    const roles = CONTACTS.get(a.npcId);
    if (roles) {
      if (!m) {
        // no road yet: the home islands' three can start you on one
        if (roles.some(({ ch }) => ch.kind === 'start')) return 'M!';
        if (roles.some(({ ch }) => ch.opensStory)) return 'M!';
      } else {
        for (const { ch, path } of roles) {
          if (path !== m.path) continue;
          const qid = qidOf(ch.id, path);
          if (!game.quests.isActive(qid)) continue;
          const st = stageOf(game, qid);
          if (st === 'meet' || st === 'arrive') return 'M!';
          if (st === 'report') return 'M?';
        }
      }
    }
    const talks = TALKS.get(a.npcId);
    if (talks) for (const t of talks) if (stageOf(game, t.qid) === t.stage) return 'M!';
    // (someone who can start the side quest the story needs)
    const cur = current(game);
    if (cur?.s && !cur.s.done) {
      const d = questDef(cur.qid), st = d?.stages[cur.s.stage];
      if (st?.goal?.type === 'quest' && st.npc === a.npcId && !game.quests.state(st.goal.quest)) return 'M!';
    }
    return null;
  };

  /** Pins for the world map: who can start the story, and where the side quests are. */
  game.storyPins = () => {
    const c = C();
    const out = [];
    if (!c) return out;
    const disc = new Set(c.discovered || []);
    if (!c.main) {
      for (const [islId, chId] of PROLOGUES) {
        if (!disc.has(islId)) continue;
        const ch = CHAPTERS.get(chId);
        for (const path of PATHS3) {
          const v = ch.v[path];
          const id = contactIdOf(ch, path);
          const pos = id && approxPos(game, npcDef(id) || { island: ch.island, at: v.contact.at });
          if (pos) out.push({ ...pos, label: `${PATHS[path].name}: ${shortName(contactOf(ch, path).name)}`, color: PATHS[path].color, main: true });
        }
      }
    }
    // side quests ready to be picked up on the islands you know
    for (const d of allNpcDefs()) {
      if (!d.marker || !d.island || !disc.has(d.island) || d.story) continue;
      let mk = null;
      try { mk = d.marker(c, game); } catch (e) { mk = null; }
      if (mk !== '!') continue;
      if (d.when && !safe(() => d.when(c, game))) continue;
      const pos = approxPos(game, d);
      if (pos) out.push({ ...pos, label: shortName(d.name), color: '#ffd54f', side: true });
    }
    return out;
  };

  // ------------------------------------------------ conversations
  game.dialogue.decorators.push((tree, npc, ctx) => decorate(tree, npc, ctx));

  S.current = () => current(game);
  S.qidOf = qidOf;
  return S;
}

const safe = (f) => { try { return f(); } catch (e) { return false; } };

/** Roughly where someone stands (for the map) without them being about. */
function approxPos(game, def) {
  const isl = game.surface.islands.find((i) => i.id === def.island);
  if (!isl) return null;
  const at = (typeof def.at === 'function' ? null : def.at) || {};
  if (at.spot && isl.spots?.[at.spot]) return { x: isl.spots[at.spot].x, y: isl.spots[at.spot].y };
  const town = (at.town && isl.towns.find((t) => t.id === at.town)) || (!at.dx ? isl.towns[0] : null);
  if (town) {
    const key = at.building || at.door;
    const b = key && town.buildings.find((x) => x.name === key || x.role === key || x.npc === def.id);
    if (b) return { x: b.x + (b.w || 0) / 2, y: b.y + (b.h || 0) / 2 };
    return { x: town.plaza.x, y: town.plaza.y };
  }
  if (at.dx !== undefined) return { x: isl.x + at.dx * isl.def.w / 2, y: isl.y + at.dy * isl.def.h / 2 };
  return { x: isl.x, y: isl.y };
}

function introFor(game, c, spawn) {
  const home = spawn?.island?.id || null;
  const chId = home && PROLOGUES.get(home);
  if (chId) {
    const ch = CHAPTERS.get(chId);
    const who = PATHS3.map((p) => `${shortName(contactOf(ch, p).name)} (${PATHS[p].name.toLowerCase()})`);
    return `Three people on ${islName(home)} could set you on your road: ${who[0]}, ${who[1]} and ${who[2]}. Look for the orange !`;
  }
  // (castaways and old saves: the nearest home island in this sea)
  const p = game.player;
  let best = null, bd = Infinity;
  for (const [islId] of PROLOGUES) {
    const isl = game.surface.islands.find((i) => i.id === islId);
    if (!isl || !p) continue;
    const d = game.surface.distance(p.x, p.y, isl.x, isl.y);
    if (d < bd) { bd = d; best = isl; }
  }
  if (c.flags?.enteredGrandLine) return 'Visit Crocus at the Twin Cape lighthouse to take up the main story.';
  return best ? `Sail to ${best.name}: people there could set you on your road — as a pirate, a Marine or a bounty hunter.` : 'Find your road: talk to the people with an orange ! over their heads.';
}

// ------------------------------------------------------------ dialogue
function chain(prefix, lines, speaker, last) {
  // lines → nodes prefix0..prefixN, the last one finished off by `last` ({ choices } / { next } / onEnter…)
  const nodes = {};
  const L = lines.length ? lines : [''];
  L.forEach((t, i) => {
    const node = { text: t, speaker };
    if (i < L.length - 1) node.next = prefix + (i + 1);
    else Object.assign(node, last || {});
    nodes[prefix + i] = node;
  });
  return nodes;
}
const say = (t, ctx) => {
  const s = text(t, ctx);
  return s && !/^["(*]/.test(s) ? `"${s}"` : s;
};

/** Meeting a contact: the stage moves on (and the chapter's tasks begin). */
function meetDone(g, ch, path, x) {
  const qid = qidOf(ch.id, path);
  if (stageOf(g, qid) === 'arrive') g.quests.next(qid);
  if (stageOf(g, qid) === 'meet') { x.setFlag(`mq_met_${ch.id}_${path}`); g.quests.next(qid); }
}

/**
 * The story's part of a conversation with someone: { kind, nodes, start }.
 * kind: 'meet' | 'report' | 'wait' | 'offer' | 'talk' | 'idle'.
 */
function storyNodes(ctx, npcId) {
  const g = ctx.game, c = ctx.char, m = c.main;
  const roles = CONTACTS.get(npcId) || [];
  const nodes = {};
  const S = g.story;
  const live = m && roles.find(({ ch, path }) => path === m.path && g.quests.isActive(qidOf(ch.id, path)));
  if (live) {
    const { ch, path } = live;
    const v = ch.v[path];
    const qid = qidOf(ch.id, path);
    const st = stageOf(g, qid);
    const d = questDef(qid);
    if (st === 'meet' || st === 'arrive') {
      const tasks = (v.tasks || []).length > 0;
      Object.assign(nodes, chain('mq_m', (v.meet || ['So you\'re the one.']).map((t) => () => say(t, ctx)), undefined, {
        onEnter: (x) => meetDone(g, ch, path, x),
        choices: [{ text: tasks ? 'Leave it to me.' : 'Thank you.', end: true }],
      }));
      return { kind: 'meet', nodes, start: 'mq_m0' };
    }
    if (st === 'report') {
      // (written now, before the chapter closes: "your next stop is…" must mean the next one)
      Object.assign(nodes, chain('mq_r', (v.done || ['Well done.']).map((t) => { const line = say(t, ctx); return () => line; }), undefined, {
        onEnter: (x) => {
          if (!g.quests.isActive(qid)) return;
          v.onReport?.(g, x);
          x.setFlag(`mq_done_${ch.id}_${path}`);
          g.quests.complete(qid);
        },
        choices: [{ text: 'Farewell.', end: true }],
      }));
      return { kind: 'report', nodes, start: 'mq_r0' };
    }
    const obj = () => d?.stages[g.quests.state(qid)?.stage]?.desc || '';
    nodes.mq_w = { text: () => say(v.wait || 'Well? The sea won\'t wait for you.', ctx), choices: [
      { text: 'What was it you needed again?', next: 'mq_w2' },
      ...extraChoices(v.contact, 'mq_w'),
      { text: 'I\'m on it.', end: true },
    ] };
    nodes.mq_w2 = { text: () => `(${obj()})`, next: 'mq_w' };
    return { kind: 'wait', nodes, start: 'mq_w', label: d?.name };
  }
  // a road on offer (no road chosen yet): the home island's three, or Crocus for latecomers
  const offers = !m ? roles.filter(({ ch }) => ch.kind === 'start' || ch.opensStory) : [];
  if (offers.length) {
    const { ch, path } = offers[0];
    const v = ch.v[path];
    const mine = new Set(offers.map((o) => o.path));
    const others = ch.kind === 'start' ? PATHS3.filter((p) => !mine.has(p) && ch.v[p]?.contact).map((p) => `${shortName(contactOf(ch, p).name)}${ch.v[p].contact.where ? ' ' + ch.v[p].contact.where : ''} (${PATHS[p].name.toLowerCase()})`) : [];
    const pitchEnd = `mq_p${Math.max(0, (v.pitch || []).length - 1)}`;
    Object.assign(nodes, chain('mq_p', (v.pitch || ['Looking for a road to walk?']).map((t) => () => say(t, ctx)), undefined, {
      choices: [
        ...offers.map((o) => ({ text: o.ch.v[o.path].accept || `I'll take the road of the ${PATHS[o.path].name}.`, if: () => !roadClosed(c, o.path), next: 'mq_ok_' + o.path })),
        ...offers.map((o) => ({ text: () => `(The road of the ${PATHS[o.path].name} is closed to you: ${roadClosed(c, o.path)})`, if: () => !!roadClosed(c, o.path), next: pitchEnd })),
        { text: 'Are there other roads?', if: () => others.length > 0, next: 'mq_o' },
        ...extraChoices(v.contact, 'mq_p0'),
        { text: 'Not yet.', end: true },
      ],
    }));
    nodes.mq_o = { text: `(You could also find ${others.join(' or ')}. You can only walk one road — choose one, and the others close.)`, next: pitchEnd };
    for (const o of offers) {
      const ov = o.ch.v[o.path];
      nodes['mq_ok_' + o.path] = { text: '', onEnter: () => S.begin(o.ch.id, o.path), redirect: 'mq_s_' + o.path + '0' };
      Object.assign(nodes, chain('mq_s_' + o.path, (ov.meet?.length ? ov.meet : ['Then let\'s begin.']).map((t) => () => say(t, ctx)), undefined, {
        onEnter: (x) => { if (o.ch.kind !== 'start') meetDone(g, o.ch, o.path, x); },
        choices: [{ text: 'Leave it to me.', end: true }],
      }));
    }
    return { kind: 'offer', nodes, start: 'mq_p0' };
  }
  // someone you're sent to talk to
  for (const t of TALKS.get(npcId) || []) {
    if (stageOf(g, t.qid) !== t.stage) continue;
    Object.assign(nodes, chain('mq_t', t.lines.map((l) => () => say(l, ctx)), undefined, {
      onEnter: (x) => { x.setFlag(t.flag); if (stageOf(g, t.qid) === t.stage) g.quests.next(t.qid); },
      choices: [{ text: 'Thank you.', end: true }],
    }));
    return { kind: 'talk', nodes, start: 'mq_t0', label: t.choice };
  }
  // a contact whose chapter is over, or not come yet
  if (roles.length) {
    const r = (m && roles.find(({ path }) => path === m.path)) || roles[0];
    const v = r.ch.v[r.path];
    const qid = qidOf(r.ch.id, r.path);
    const line = g.quests.isDone(qid) ? v.after : m && m.path !== r.path ? v.other || otherRoad(r.path, m.path) : v.idle;
    nodes.mq_i = { text: () => say(line || v.idle || 'Mm? Can I help you?', ctx), choices: [...extraChoices(v.contact, 'mq_i'), { text: 'Goodbye.', end: true }] };
    return { kind: 'idle', nodes, start: 'mq_i' };
  }
  return null;
}

function extraChoices(ct, back) {
  return (ct?.choices || []).map((ch) => ({ ...ch, next: ch.next || (ch.end ? undefined : back) }));
}

function otherRoad(mine, theirs) {
  if (mine === 'marine') return theirs === 'pirate' ? '"A pirate. Hmph. Mind your manners in my town — I\'ll be watching you."' : '"Hunting pirates for money, are you? Just remember who the law is around here."';
  if (mine === 'pirate') return theirs === 'marine' ? '"Look at you in that Navy cap. Well — every sea needs someone to chase us."' : '"A bounty hunter. Heh. Just don\'t go looking for my old poster."';
  return theirs === 'marine' ? '"A Marine. Don\'t worry — I only hunt the ones with a price on their heads."' : '"A pirate, eh? Keep your poster low and your head lower. Nothing personal."';
}

function storyTree(ctx, npcId) {
  const r = storyNodes(ctx, npcId);
  if (!r) return { start: 'a', nodes: { a: { text: '"..."' } } };
  return { start: r.start, nodes: r.nodes };
}

/** Add the story to someone's own conversation (a character already in the world who is a contact, or someone you're sent to see). */
function decorate(tree, npc, ctx) {
  const id = npc?.npcId;
  if (!id || !tree?.nodes || npc.def?.story) return tree;
  if (!CONTACTS.has(id) && !TALKS.has(id)) return tree;
  const r = storyNodes(ctx, id);
  if (!r || r.kind === 'idle') return tree;
  const home = tree.start || 'start';
  const nodes = { ...tree.nodes, ...r.nodes };
  if (r.kind === 'wait') {
    // their usual talk, with a word about the job
    const s0 = nodes[home];
    if (s0) nodes[home] = { ...s0, choices: [{ text: `(${r.label || 'The story'}) What was it you needed again?`, next: 'mq_w2' }, ...(s0.choices || [])] };
    nodes.mq_w2 = { ...nodes.mq_w2, next: home };
    return { ...tree, nodes };
  }
  // the story comes first; then their usual talk (whatever else they're here for: a shop, a doctor, a story)
  for (const k of Object.keys(r.nodes)) {
    const n = nodes[k];
    if (!n.choices?.length || !n.choices.some((ch) => ch.end) || n.choices.some((ch) => ch.next === home)) continue;
    const i = n.choices.findIndex((ch) => ch.end);
    n.choices = [...n.choices.slice(0, i), { text: 'About something else...', next: home }, ...n.choices.slice(i)];
  }
  return { ...tree, nodes, start: r.start };
}

export default {
  id: 'main',
  npcs: NPCS,
  quests: QUESTS,
  items: {
    court_permit: { name: 'Court Travel Permit', icon: '📜', type: 'key', price: 0, desc: 'Sealed by the Bounty Court of Enies Lobby: the bearer and their ship may ride the Bondola over the Red Line.' },
  },
  install: (game) => installMainStory(game),
};

export { CHAPTERS, PROLOGUES, rankIndex, addItem, enlistNow };
