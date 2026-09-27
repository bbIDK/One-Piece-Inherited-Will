// Building blocks for the main story (see ../mainStory.js, which turns them
// into quests and people).
//
// The story is told in CHAPTERS. A chapter is one island (or one voyage),
// told three ways — as a pirate, a Marine or a bounty hunter:
//
//   chapter(id, { part, island, kind }, { pirate: {…}, marine: {…}, hunter: {…} })
//
// kind: 'start' — the first chapter, on your home island (it begins when you
//                 choose your road there; see PROLOGUES)
//       'stop'  — sail to the island, find your contact, do what they need,
//                 report back
//       'solo'  — no contact: sail there and see it through (Reverse Mountain…)
//
// Each road's telling:
//   name, summary      what the Quests menu shows
//   contact            who you deal with: a new person { name, title, look, at,
//                      level?, race?, faction?, where? } — or someone already
//                      in the world { npc: 'kaya', where? }. Give two roads the
//                      same `key` to share one person.
//   meet: [lines]      what they tell you when you first find them
//   tasks: [stages]    what needs doing (quest stages; see T below)
//   wait               what they say while you're at it
//   done: [lines]      what they say when you report back
//   after              what they say once the chapter is over
//   reward             on top of the usual pay for the chapter ({ items, ship, bounty, flag, … })
//   onDone(game)       anything else that happens when it's over
//   start chapters also have: pitch: [lines] (the offer), accept (the answer),
//   refuse(c) → why this road is closed to you (or null)
// Lines are strings or fns (ctx) → string.

import { ISLAND_BY_ID } from '../../data/islands/index.js';

export const PATHS3 = ['pirate', 'marine', 'hunter'];
export const CHAPTERS = new Map();
/** Home islands: island id → the chapter that starts the story there. */
export const PROLOGUES = new Map();
/** People the story sends you after (defeat targets), as NPC defs. */
export const TARGETS = [];
/**
 * How each part of the story is planned for a character: PLANS[part](c,
 * path, from) → the chapter ids it will go through, in order (`from`: the
 * chapter that starts it, for Part 1 the home island's prologue).
 */
export const PLANS = {};

export function chapter(id, base, variants) {
  const ch = { id, kind: 'stop', ...base, v: {} };
  const all = variants.all || {};
  // (`all` is shared by the roads named; on its own, it's all three)
  const named = PATHS3.filter((p) => variants[p]);
  for (const p of named.length ? named : PATHS3) ch.v[p] = { ...all, ...(variants[p] || {}) };
  if (CHAPTERS.has(id)) throw new Error(`chapter ${id} defined twice`);
  CHAPTERS.set(id, ch);
  if (ch.kind === 'start') PROLOGUES.set(ch.island, id);
  return ch;
}

/** Someone to track down and knock out: a named NPC who only turns up while the story needs them. */
export function target(def) {
  TARGETS.push({ hostile: true, named: true, showName: true, level: 4, ...def });
  return def.id;
}

// ------------------------------------------------------------ tasks
// (quest stages; ids must be unique within a chapter)
export const T = {
  weapon: (desc = 'Get yourself a weapon — buy one, win one or find one.') => ({ id: 'weapon', desc, goal: { type: 'weapon' } }),
  /**
   * Found a pirate crew and raise its Jolly Roger (Crew menu). (The crew
   * itself, not the "pirate" the world calls anyone with a bounty: a price on
   * your head isn't a crew.)
   */
  flag: (desc = 'Raise your own Jolly Roger: found your crew in the Crew menu (U).') => ({ id: 'flag', desc, goal: { type: 'check', fn: (c) => !!c.crewName } }),
  crew: (n = 1, desc = `Recruit ${n > 1 ? n + ' crewmates' : 'a crewmate'} — people who'd follow you anywhere.`) => ({ id: 'crew' + n, desc, goal: { type: 'crew', n } }),
  ship: (desc = 'Get a ship that can survive the Grand Line (a Sloop or bigger).') => ({ id: 'ship', desc, goal: { type: 'ship', grandLine: true } }),
  logPose: (desc = 'Get a Log Pose — no one survives the Grand Line without one.') => ({ id: 'pose', desc, goal: { type: 'item', item: 'log_pose' } }),
  /**
   * See another quest through (it's started by whoever gives it; `npc` is who
   * to see about it). extra.alt(c, game): also done if this is true (the quest
   * can no longer be had some other way); extra.autoStart: start it at once.
   */
  quest: (quest, desc, npc, id = 'q_' + quest, extra = {}) => ({ id, desc, goal: { type: 'quest', quest, alt: extra.alt }, npc, autoStart: !!extra.autoStart }),
  defeat: (npc, desc, id = 'd_' + npc, extra = {}) => ({ id, desc, goal: { type: 'defeat', npc, ...extra } }),
  item: (item, n, desc, id = 'i_' + item) => ({ id, desc, goal: { type: 'item', item, n } }),
  reach: (island, desc, spot, id = 'r_' + island + (spot ? '_' + spot : '')) => ({ id, desc, goal: { type: 'reach', island, spot } }),
  event: (event, desc, id = 'e_' + event, extra = {}) => ({ id, desc, goal: { type: 'event', event }, ...extra }),
  counter: (event, n, label, desc, id = 'c_' + event) => ({ id, desc, goal: { type: 'counter', event, n, label } }),
  /** Anything that can be read off the character: fn(c, game) → true when it's done. */
  check: (id, desc, fn, extra = {}) => ({ id, desc, goal: { type: 'check', fn }, ...extra }),
  /**
   * Go and talk to someone else (an NPC already in the world, or a contact):
   * they say `lines` and the stage is done.
   */
  talk: (npc, desc, lines, id = 't_' + npc, extra = {}) => ({ id, desc, goal: { type: 'talk', npc }, npc, lines, ...extra }),
  days: (n, desc, id = 'days') => ({ id, desc, goal: { type: 'days', n } }),
};

// ------------------------------------------------------------ looks
// (shorthands for the people of the story)
export const LOOK = {
  marine: (o = {}) => ({ top: '#ffffff', bottom: '#1b4f72', hat: 'marine', ...o }),
  officer: (o = {}) => ({ top: '#ffffff', bottom: '#1b4f72', hat: 'marine', coat: '#fafafa', coatText: 'JUSTICE', ...o }),
};

// ------------------------------------------------------------ pointing onward
/** The chapter after the one under way (for "your next stop is…" lines): { ch, v, place } or null. */
export function nextStop(c) {
  const m = c?.main;
  const id = m?.chain?.[m.at + 1];
  const ch = id && CHAPTERS.get(id);
  if (!ch) return null;
  return { ch, v: ch.v[m.path] || {}, place: ch.place || ISLAND_BY_ID[ch.island]?.name || 'the next island' };
}
/** "…set for <island>: <why>" — what a contact says when they hand you on to the next stop. */
export function onward(c, lead = 'I\'ve set the needle for') {
  const n = nextStop(c);
  if (!n) return 'The rest of the way is yours to find.';
  return `${lead} ${n.place}${n.v.lure ? ' — ' + n.v.lure : ''}.`;
}
export const islandName = (id) => ISLAND_BY_ID[id]?.name || id;
