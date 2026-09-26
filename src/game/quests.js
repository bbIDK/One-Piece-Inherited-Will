// Quest engine. Definitions live in data/quests/*.js. Progress is stored on
// the character: char.quests[id] = { stage, done, day }.
// Auto-tracked goals: defeat (npcId), reach (island [+ spot]), item, flag, event.
// "talk" goals are advanced by the NPC's own dialogue (ctx.stage / ctx.complete).
import { addItem, earn, count } from './inventory.js';
import { persist } from './lineage.js';

const DEFS = new Map();
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
  active() { return Object.entries(this.char?.quests || {}).filter(([, s]) => !s.done).map(([id, s]) => ({ id, s, def: DEFS.get(id) })).filter((x) => x.def); }
  isActive(id) { const s = this.state(id); return !!s && !s.done; }
  isDone(id) { return !!this.state(id)?.done; }
  stageId(id) { const s = this.state(id), d = DEFS.get(id); return s && d && !s.done ? d.stages[s.stage]?.id : null; }

  ctx() { return this.game.dialogue ? this.game.dialogue.ctx(null) : { game: this.game }; }

  start(id) {
    const d = DEFS.get(id);
    const c = this.char;
    if (!d || c.quests[id]) return false;
    c.quests[id] = { stage: 0, done: false, day: this.game.env.day };
    this.game.ui.toast('NEW QUEST', d.name, '#90caf9');
    this.game.log(`Quest started: ${d.name} — ${d.stages[0]?.desc || ''}`, '#90caf9');
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
    const g = this.game;
    const r = d.rewards || {};
    g.ui.toast('QUEST COMPLETE', d.name, '#a5d6a7');
    if (r.berries) earn(g, r.berries, d.name);
    for (const [it, n] of r.items || []) addItem(g, it, n || 1);
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
    if (goal.type === 'item' && count(this.char, goal.item) >= (goal.n || 1)) this.next(id);
    if (goal.type === 'flag' && this.char.flags[goal.flag]) this.next(id);
    if (goal.type === 'reach' && !goal.spot && this.game.currentIsland?.id === goal.island) this.next(id);
  }

  tick(dt) {
    this.t -= dt;
    if (this.t > 0 || !this.char) return;
    this.t = 0.5;
    const g = this.game, p = g.player;
    for (const { id, s, def } of this.active()) {
      const goal = def.stages[s.stage]?.goal;
      if (!goal) continue;
      if (goal.type === 'flag' && this.char.flags[goal.flag]) this.next(id);
      else if (goal.type === 'reach' && goal.spot) {
        const pos = this.spotPos(goal.island, goal.spot);
        if (pos && g.world.distance(p.x, p.y, pos.x, pos.y) < (goal.r || 4)) this.next(id);
      } else if (goal.type === 'reachXY') {
        if (g.world.distance(p.x, p.y, goal.x, goal.y) < (goal.r || 6)) this.next(id);
      }
    }
  }

  spotPos(islandId, spotId) {
    const isl = this.game.surface.islands.find((i) => i.id === islandId) || (this.game.world.islands || []).find((i) => i.id === islandId);
    return isl?.spots?.[spotId] || null;
  }

  /** Where the current objective of a quest is, for the map. */
  marker(id) {
    const s = this.state(id), d = DEFS.get(id);
    if (!s || s.done) return null;
    const st = d.stages[s.stage];
    const g = st?.goal || {};
    const island = g.island || st?.island || d.island;
    const isl = island && this.game.surface.islands.find((i) => i.id === island);
    if (g.spot && isl?.spots?.[g.spot]) return { ...isl.spots[g.spot], label: d.name };
    if (g.type === 'reachXY') return { x: g.x, y: g.y, label: d.name };
    if (isl) return { x: isl.x, y: isl.y, label: d.name };
    return null;
  }
}
