// Quest engine. Definitions live in the content packs. Progress is stored on
// the character: char.quests[id] = { stage, done, day }.
// Auto-tracked goals: defeat (npcId), reach (island [+ spot]), item, flag,
// event, quest (another quest done), weapon (carry one), ship ({ grandLine }),
// crew (n aboard), faction, bounty (at least n), reachXY, days.
// "talk" goals are advanced by the NPC's own dialogue (ctx.stage / ctx.complete).
// Quests of kind 'main' are the main story (see content/mainStory.js): one
// at a time, and they can't be abandoned; any other quest can.
import { addItem, earn, count } from './inventory.js';
import { npcDef } from './npcs.js';
import { persist } from './lineage.js';
import { ITEMS } from '../data/items.js';
import { ownsShip } from './fleet.js';

/** Does the character carry (or wield) a weapon? */
export function hasWeapon(c) {
  if ((c.equipped?.weapons || []).length) return true;
  return (c.inventory || []).some((it) => ITEMS[it.id]?.type === 'weapon');
}

const DEFS = new Map();
// goals that are a state of things (checked now and then), not something that happens
const STATE_GOALS = new Set(['flag', 'item', 'quest', 'weapon', 'ship', 'crew', 'faction', 'bounty', 'counter', 'check']);
export function registerQuests(list) { for (const q of list) DEFS.set(q.id, q); }
export const questDef = (id) => DEFS.get(id);
export const allQuests = () => [...DEFS.values()];

export class Quests {
  constructor(game) {
    this.game = game;
    game.quests = this;
    game.on('knockout', (a, att) => { if (a.npcId) this.event('defeat', a.npcId, { att }); });
    game.on('enterIsland', (isl) => this.event('reach', isl.id));
    game.on('itemGained', (id) => this.event('item', id));
    game.on('questEvent', (name, arg) => this.event('event', name, arg));
    game.on('tick', (dt) => this.tick(dt));
    this.t = 0;
  }

  get char() { return this.game.state?.char; }
  state(id) { return this.char?.quests[id] || null; }
  active() { return Object.entries(this.char?.quests || {}).filter(([, s]) => !s.done && !s.abandoned).map(([id, s]) => ({ id, s, def: DEFS.get(id) })).filter((x) => x.def); }
  /** The main story quest under way (there's only ever one), or null. */
  main() { return this.active().find((q) => q.def.kind === 'main') || null; }
  /** Active quests that aren't the main story. */
  side() { return this.active().filter((q) => q.def.kind !== 'main'); }
  /** The side quests shown on the tracker: the ones pinned, else the two most recent. */
  tracked() {
    const c = this.char;
    if (!c) return [];
    const side = this.side();
    const pinned = (c.trackedQuests || []).map((id) => side.find((q) => q.id === id)).filter(Boolean);
    if (pinned.length) return pinned.slice(0, 2);
    return side.sort((a, b) => (b.s.started || 0) - (a.s.started || 0)).slice(0, 2);
  }
  track(id, on = true) {
    const c = this.char;
    if (!c) return;
    const list = (c.trackedQuests || []).filter((x) => x !== id && this.isActive(x));
    if (on) list.unshift(id);
    c.trackedQuests = list.slice(0, 2);
  }
  /** Give up a quest (never the main story). It can be taken up again from whoever gave it. */
  abandon(id) {
    const d = DEFS.get(id), s = this.state(id);
    if (!d || !s || s.done || d.kind === 'main') return false;
    d.onAbandon?.(this.ctx(), this.game);
    delete this.char.quests[id];
    this.char.trackedQuests = (this.char.trackedQuests || []).filter((x) => x !== id);
    this.game.log(`Quest abandoned: ${d.name}.`, '#b0bec5');
    this.game.emit('questAbandoned', id);
    persist(this.game);
    return true;
  }
  /** How far along the current objective is: { n, of, text } (null if it isn't counted). */
  progress(id) {
    const s = this.state(id), d = DEFS.get(id), c = this.char;
    if (!s || s.done || !d) return null;
    const g = d.stages[s.stage]?.goal;
    if (!g) return null;
    if (g.type === 'defeat' && g.count) return { n: s.n || 0, of: g.count };
    if (g.type === 'item' && (g.n || 1) > 1) return { n: Math.min(g.n, count(c, g.item)), of: g.n };
    if (g.type === 'crew' && g.n > 1) return { n: Math.min(g.n, this.game.crew?.count?.() || 0), of: g.n };
    if (g.type === 'counter') return { n: Math.min(g.n, s.n || 0), of: g.n };
    return null;
  }
  /** Is a goal met right now (for the goals that are states rather than events)? */
  met(g) {
    const c = this.char, game = this.game;
    switch (g.type) {
      case 'flag': return !!c.flags[g.flag];
      case 'item': return count(c, g.item) >= (g.n || 1);
      case 'quest': return !!c.quests[g.quest]?.done || !!(g.alt && g.alt(c, game));
      case 'weapon': return hasWeapon(c);
      // (afloat or laid up in the yards: see fleet.js)
      case 'ship': return ownsShip(game, (d) => (!g.grandLine || d.grandLine) && (!g.cannons || (d.cannons || 0) >= g.cannons));
      case 'crew': return (game.crew?.count?.() || 0) >= (g.n || 1);
      case 'faction': return c.faction === g.faction || (g.faction === 'pirate' && !!c.crewName);
      case 'bounty': return (c.bounty || 0) >= (g.n || 1);
      case 'counter': return (this.state(g.of)?.n || 0) >= g.n;
      // anything else that can be read off the character or the world: { fn(c, game) }
      case 'check': try { return !!g.fn(c, game); } catch (e) { return false; }
      default: return false;
    }
  }
  isActive(id) { const s = this.state(id); return !!s && !s.done; }
  isDone(id) { return !!this.state(id)?.done; }
  stageId(id) { const s = this.state(id), d = DEFS.get(id); return s && d && !s.done ? d.stages[s.stage]?.id : null; }

  ctx() { return this.game.dialogue ? this.game.dialogue.ctx(null) : { game: this.game }; }

  start(id) {
    const d = DEFS.get(id);
    const c = this.char;
    if (!d || c.quests[id]) return false;
    c.quests[id] = { stage: 0, done: false, day: this.game.env.day, started: Date.now() };
    if (d.kind === 'main') this.game.ui.toast(d.part ? `MAIN STORY · PART ${d.part}` : 'MAIN STORY', d.name, '#ffd54f');
    else this.game.ui.toast('NEW QUEST', d.name, '#90caf9');
    this.game.log(`${d.kind === 'main' ? 'Main story' : 'Quest started'}: ${d.name} — ${d.stages[0]?.desc || ''}`, d.kind === 'main' ? '#ffe082' : '#90caf9');
    d.stages[0]?.onStart?.(this.ctx(), this.game);
    this.game.emit('questStarted', id);
    this.checkImmediate(id);
    persist(this.game);
    return true;
  }

  setStage(id, stageId) {
    const d = DEFS.get(id);
    const s = this.state(id);
    if (!d || !s || s.done) return;
    const idx = typeof stageId === 'number' ? stageId : d.stages.findIndex((x) => x.id === stageId);
    if (idx < 0) return;
    const cur = d.stages[s.stage];
    cur?.onComplete?.(this.ctx(), this.game);
    if (idx >= d.stages.length) return this.complete(id);
    s.stage = idx;
    s.stageDay = this.game.env.day;
    const st = d.stages[idx];
    this.game.log(`${d.name}: ${st.desc}`, '#90caf9');
    st.onStart?.(this.ctx(), this.game);
    this.game.emit('questStage', id, st.id);
    this.checkImmediate(id);
  }

  next(id) {
    const s = this.state(id), d = DEFS.get(id);
    if (!s || s.done) return;
    if (s.stage + 1 >= d.stages.length) this.complete(id);
    else this.setStage(id, s.stage + 1);
  }

  complete(id) {
    const d = DEFS.get(id);
    const s = this.state(id) || (this.char.quests[id] = { stage: 0, day: this.game.env.day });
    if (s.done) return;
    d.stages[s.stage]?.onComplete?.(this.ctx(), this.game);
    s.done = true;
    s.doneAt = Date.now();
    const g = this.game;
    const r = (typeof d.rewards === 'function' ? d.rewards(this.ctx(), g) : d.rewards) || {};
    g.ui.toast(d.kind === 'main' ? 'CHAPTER COMPLETE' : 'QUEST COMPLETE', d.name, d.kind === 'main' ? '#ffd54f' : '#a5d6a7');
    if (r.berries) earn(g, r.berries, d.name);
    for (const [it, n] of r.items || []) addItem(g, it, n || 1);
    if (r.reputation) g.reputation?.change?.(r.reputation, d.name);
    if (r.merit && this.char.faction === 'marine') { this.char.merit = (this.char.merit || 0) + r.merit; g.log(`+${r.merit} merit.`, '#90caf9'); }
    if (r.attrs) for (const [k, v] of Object.entries(r.attrs)) g.progression.raiseAttr(k, v);
    if (r.points) g.progression.breakthrough(r.points, d.name);
    if (r.bounty) g.progression.addBounty(r.bounty, d.name);
    if (r.mastery) for (const [k, v] of Object.entries(r.mastery)) g.progression.addStyleMastery(k, v);
    if (r.haki) for (const [k, v] of Object.entries(r.haki)) { if (!this.char.haki[k]) g.progression.awakenHaki(k, v); else g.progression.addHaki(k, v); }
    if (r.liberate && !this.char.liberated.includes(r.liberate)) { this.char.liberated.push(r.liberate); g.log(`${r.liberate} is free!`, '#a5d6a7'); }
    if (r.flag) this.char.flags[r.flag] = true;
    d.onComplete?.(this.ctx(), g);
    g.emit('questDone', id);
    g.progression.checkDream();
    persist(g);
  }

  event(type, key, arg) {
    for (const { id, s, def } of this.active()) {
      const st = def.stages[s.stage];
      const goal = st?.goal;
      if (!goal) continue;
      // (a counted event: "pick fruit ×10")
      if (goal.type === 'counter' && type === 'event' && goal.event === key) {
        s.n = (s.n || 0) + 1;
        if (s.n < goal.n) { this.game.log(`${def.name}: ${goal.label || 'progress'} ${s.n}/${goal.n}`, '#90caf9'); continue; }
        s.n = 0;
        this.next(id);
        continue;
      }
      if (goal.type === type) {
        if (type === 'defeat' && (goal.npc === key || (goal.any && goal.any.includes(key)))) {
          if (goal.count) { s.n = (s.n || 0) + 1; if (s.n < goal.count) { this.game.log(`${def.name}: ${s.n}/${goal.count}`, '#90caf9'); continue; } s.n = 0; }
          this.next(id);
        } else if (type === 'reach' && goal.island === key && !goal.spot) this.next(id);
        else if (type === 'item' && goal.item === key && count(this.char, key) >= (goal.n || 1)) this.next(id);
        else if (type === 'event' && goal.event === key) this.next(id);
      }
    }
  }

  checkImmediate(id) {
    const s = this.state(id), d = DEFS.get(id);
    if (!s || s.done) return;
    const goal = d.stages[s.stage]?.goal;
    if (!goal) return;
    if (goal.type === 'reach' && !goal.spot && this.game.currentIsland?.id === goal.island) { this.next(id); return; }
    // a foe you've beaten already, who will never turn up again, can't hold a stage up
    if (goal.type === 'defeat') {
      const n = this.beatenFor(goal);
      if (goal.any && goal.count && n) s.n = Math.max(s.n || 0, n);
      if (n >= (goal.any ? goal.count || 1 : 1)) { this.game.log(`${d.name}: already done — you've beaten them before.`, '#90caf9'); this.next(id); return; }
    }
    if (STATE_GOALS.has(goal.type) && goal.type !== 'counter' && this.met(goal)) this.next(id);
  }

  tick(dt) {
    this.t -= dt;
    if (this.t > 0 || !this.char) return;
    this.t = 0.5;
    const g = this.game, p = g.player;
    for (const { id, s, def } of this.active()) {
      const goal = def.stages[s.stage]?.goal;
      if (!goal) continue;
      if (STATE_GOALS.has(goal.type) && goal.type !== 'counter' && goal.type !== 'item') { if (this.met(goal)) this.next(id); }
      else if (goal.type === 'days' && g.env.day - (s.stageDay ?? s.day ?? g.env.day) >= (goal.n || 1)) this.next(id);
      else if (goal.type === 'reach' && goal.spot) {
        const pos = this.spotPos(goal.island, goal.spot);
        if (pos && g.world.distance(p.x, p.y, pos.x, pos.y) < (goal.r || 4)) this.next(id);
      } else if (goal.type === 'reachXY') {
        if (g.world.distance(p.x, p.y, goal.x, goal.y) < (goal.r || 6)) this.next(id);
      }
    }
  }

  /** How many of a defeat goal's foes are beaten already and gone for good (bosses don't come back; others only if they'd no longer appear). */
  beatenFor(g) {
    const c = this.char, game = this.game;
    const gone = (id) => {
      const d = npcDef(id);
      if (!d || !(c.bosses.includes(id) || c.defeated?.[id] > 0)) return false;
      if (d.boss && c.bosses.includes(id) && !d.respawn) return true;
      try { return !!d.when && !d.when(c, game); } catch (e) { return false; }
    };
    if (g.npc) return gone(g.npc) ? 1 : 0;
    return (g.any || []).filter(gone).length;
  }

  spotPos(islandId, spotId) {
    const w = this.game.world;
    const isl = (w.islands || []).find((i) => i.id === islandId) || (w === this.game.surface ? null : null);
    return isl?.spots?.[spotId] || null;
  }

  /** Where the current objective of a quest is, for the map. */
  marker(id, depth = 0) {
    const s = this.state(id), d = DEFS.get(id);
    if (!s || s.done) return null;
    const st = d.stages[s.stage];
    const g = st?.goal || {};
    // (another quest to see through: wherever that one's objective is)
    if (g.type === 'quest' && depth < 2 && this.isActive(g.quest)) {
      const m = this.marker(g.quest, depth + 1);
      if (m) return { ...m, label: d.name };
    }
    // (someone to talk to: where they stand, once they're about)
    if (st?.npc) {
      const a = this.game.actors.find((x) => x.alive && x.npcId === st.npc);
      if (a) return { x: a.x, y: a.y, label: d.name, place: a.name, zone: this.game.world === this.game.surface ? null : this.game.world.id };
    }
    if (st?.where) { const w = st.where(this.game); if (w) return { ...w, label: d.name }; }
    const island = g.island || st?.island || d.island;
    let isl = island && this.game.surface.islands.find((i) => i.id === island);
    let zone = null;
    if (!isl && island && this.game.world !== this.game.surface) { isl = this.game.world.islands.find((i) => i.id === island); if (isl) zone = this.game.world.id; }
    if (g.spot && isl?.spots?.[g.spot]) return { ...isl.spots[g.spot], label: d.name, place: isl.name, zone };
    if (g.type === 'reachXY') return { x: g.x, y: g.y, label: d.name, place: g.place };
    if (isl) return { x: isl.x, y: isl.y, label: d.name, place: isl.name, zone };
    return null;
  }
}
