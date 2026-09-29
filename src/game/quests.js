// Quest engine. Definitions live in the content packs. Progress is stored on
// the character: char.quests[id] = { stage, done, day }.
// Auto-tracked goals: defeat (npcId), reach (island [+ spot]), item, flag,
// event, quest (another quest done), weapon (carry one), ship ({ grandLine }),
// crew (n aboard), faction, bounty (at least n), reachXY, days.
// "talk" goals are advanced by the NPC's own dialogue (ctx.stage / ctx.complete).
// Quests of kind 'main' are the main story (see content/mainStory.js): one
// at a time, and they can't be abandoned; any other quest can.
import { addItem, earn, count } from './inventory.js';
import { npcDef, whereNPC, allNpcDefs } from './npcs.js';
import { ZONES } from '../data/zones/index.js';
import { persist } from './lineage.js';
import { ITEMS } from '../data/items.js';
import { ownsShip } from './fleet.js';
import { stockFor } from '../data/shops.js';

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
  /**
   * The quest the main story's current step is waiting on ("see the Black
   * Cat's Plot through"), while it's under way: { id, def, s }, or null.
   */
  mainSub() {
    const m = this.main();
    const st = m && m.def.stages[m.s.stage];
    const id = st?.goal?.type === 'quest' ? st.goal.quest : null;
    return id && this.isActive(id) ? this.active().find((q) => q.id === id) || null : null;
  }
  /**
   * The side quests shown on the tracker: the ones pinned, else the two most
   * recent (not the one the main story's step is about: that's shown in the
   * main story's place, not twice).
   */
  tracked() {
    const c = this.char;
    if (!c) return [];
    const sub = this.mainSub()?.id;
    const side = this.side().filter((q) => q.id !== sub);
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

  /**
   * Where the current objective of a quest is, for the compass, the tracker
   * and the map: the place the step is done at (the bell among the spires,
   * the platform in the square); else whoever the step is about (someone to
   * beat or to talk to) where they stand — or, not about yet, where they'll
   * be on the island they live on (which needn't be the quest's); else where
   * what it asks for is had (the shop that sells it, the shipwright on the
   * pier, someone who'd join your crew); else the island (its harbour, when
   * it's an island to sail to). An objective in another world (Skypiea,
   * Fish-Man Island, Impel Down) shows the way there (or out of the one
   * you're in).
   */
  marker(id, depth = 0) {
    const s = this.state(id), d = DEFS.get(id);
    if (!s || s.done) return null;
    const st = d.stages[s.stage];
    const g = st?.goal || {};
    const label = d.name, home = g.island || st?.island || d.island;
    // (another quest to see through: wherever that one's objective is)
    if (g.type === 'quest' && depth < 2 && this.isActive(g.quest)) {
      const m = this.marker(g.quest, depth + 1);
      if (m) return { ...m, label };
    }
    // (a step done somewhere in particular, whoever's there: a bout is in the ring)
    if (st?.pinAt) { const w = st.pinAt(this.game); if (w) return { ...w, label }; }
    // (a step done in a menu is done anywhere: no pin)
    if (st?.pin === false) return null;
    const who = this.whoFor(id, s.stage, st, g, d);
    // (a foe to beat is wherever they are, if they're about)
    const fight = g.type === 'defeat' || !!st?.foes;
    let live = fight && who.length ? this.liveOf(who, label) : null;
    if (live) return live;
    // (a step done at a place of its own: the stage names it, or the event that finishes it happens there)
    const at = st?.at || ((g.type === 'event' || g.type === 'counter') && EVENT_AT.get(g.event));
    if (at) {
      const m = typeof at === 'function' ? at(this.game) : this.placeOf(at.island || home, at, label);
      if (m) return { ...m, label };
    }
    if (!fight && who.length) live = this.liveOf(who, label);
    if (live) return live;
    if (st?.where) { const w = st.where(this.game); if (w) return { ...w, label }; }
    // (something to get: where it's had)
    if (!who.length) {
      if (g.type === 'item') { const m = this.chestFor(g.item, home, label) || this.shopFor(g.item, home, label); if (m) return m; }
      if (g.type === 'ship') return this.shipyardOf(home, label);
      if (g.type === 'crew') return this.recruitFor(label);
    }
    for (const n of who) {
      const q = whereNPC(this.game, n);
      if (!q) continue;
      const m = q.island ? this.placeOf(q.island, null, label) : { ...q, label };
      if (m) return m;
    }
    if (g.type === 'reachXY') return { x: g.x, y: g.y, label, place: g.place };
    // (an island to sail to — or whose story starts as you land: its harbour, where you'll tie up)
    return this.placeOf(home, g.spot || (g.type === 'reach' || g.type === 'quest' ? { dock: true } : null), label);
  }

  /** The nearest chest left on the step's island with the item in it, that still holds it (the herb baskets among the Great Tree's roots). */
  chestFor(item, islandId, label) {
    const g = this.game, w = g.world, p = g.player, c = this.char;
    const isl = c && w.islands?.find((i) => i.id === islandId);
    if (!isl) return null;
    let best = null, bd = Infinity;
    for (const o of isl.landmarks || []) {
      if (o.kind !== 'chest' || o.item !== item) continue;
      // (see npcs.js chest: emptied, or opened and the thing taken out)
      const key = 'chest_' + (o.key || `${Math.round(o.x)}_${Math.round(o.y)}`), e = c.world?.containers?.[key];
      if (c.world?.chests?.[key] || (e && !e.items?.some((x) => x.id === item))) continue;
      const d = p ? w.distance(p.x, p.y, o.x, o.y) : 0;
      if (d < bd) { bd = d; best = { x: o.x, y: o.y, label, place: o.name || isl.name, zone: w === g.surface ? null : w.id }; }
    }
    return best;
  }

  /** The nearest shop that sells an item: on the step's island if one there does, else in its sea, else anywhere in this world. */
  shopFor(item, islandId, label) {
    const g = this.game, w = g.world, p = g.player;
    const C = this.shopC || (this.shopC = new Map());
    const key = `${w.id}:${item}`;
    let list = C.get(key);
    if (!list) {
      // (the shops' doors don't move: worked out once per world and item)
      list = [];
      for (const isl of w.islands || []) {
        for (const t of isl.towns || []) {
          for (const b of t.buildings || []) {
            if (!b.door || !SELLERS.has(b.role)) continue;
            let stock;
            try { stock = stockFor(b, isl); } catch { continue; }
            if (Array.isArray(stock) && stock.includes(item)) list.push({ x: b.door.x, y: b.door.y, island: isl.id, sea: isl.sea, place: b.name ? `${b.name}, ${t.name || isl.name}` : t.name || isl.name });
          }
        }
      }
      C.set(key, list);
    }
    const sea = w.islands?.find((i) => i.id === islandId)?.sea;
    let best = null, bd = Infinity;
    for (const s of list) {
      const dd = (s.island === islandId ? 0 : sea && s.sea === sea ? 1e7 : 2e7) + (p ? w.distance(p.x, p.y, s.x, s.y) : 0);
      if (dd < bd) { bd = dd; best = s; }
    }
    return best ? { x: best.x, y: best.y, label, place: best.place, zone: w === g.surface ? null : w.id } : null;
  }

  /** Where to get a ship: the nearest shipwright on that island's piers (else the pier they work on). */
  shipyardOf(islandId, label) {
    const g = this.game, w = g.world, p = g.player;
    let best = null, bd = Infinity;
    for (const a of g.actors) {
      if (!a.alive || a.shipwright?.island?.id !== islandId) continue;
      const dd = p ? w.distance(p.x, p.y, a.x, a.y) : 0;
      if (dd < bd) { bd = dd; best = a; }
    }
    if (best) return { x: best.x, y: best.y, label, place: best.name, zone: null };
    return this.placeOf(islandId, { dock: 'stand' }, label);
  }

  /** Someone who'd join your crew now: the nearest about, else where the nearest of them is to be found (or null: no one yet). */
  recruitFor(label) {
    const g = this.game, crew = g.crew, c = this.char, w = g.world, p = g.player;
    if (!crew || !c) return null;
    if (!RECRUITS.length) RECRUITS.push(...allNpcDefs().filter((d) => d.recruit));
    const ids = RECRUITS.filter((d) => {
      if (!crew.canRecruit(d)) return false;
      try { return !d.when || d.when(c, g); } catch { return false; }
    }).map((d) => d.id);
    if (!ids.length) return null;
    const live = this.liveOf(ids, label);
    if (live) return live;
    let best = null, bd = Infinity;
    for (const n of ids) {
      const q = whereNPC(g, n);
      const m = q && (q.island ? this.placeOf(q.island, null, label) : { ...q, label });
      if (!m) continue;
      const dd = p ? w.distance(p.x, p.y, m.x, m.y) : 0;
      if (dd < bd) { bd = dd; best = m; }
    }
    return best;
  }

  /** Who a step is about: someone to talk to, the foes to beat (those still to beat), or whoever its words name. */
  whoFor(id, si, st, g, d) {
    if (st?.npc) return [st.npc];
    // (a step finished by beating enough of some foes — its `foes` — however it's counted)
    if (g.type === 'defeat' || st?.foes) {
      const ids = st?.foes || (g.npc ? [g.npc] : g.any || []);
      const c = this.char;
      const left = ids.filter((n) => !(c?.defeated?.[n] > 0) && !c?.bosses?.includes(n));
      return left.length ? left : ids;
    }
    if (g.type === 'reach' || g.type === 'reachXY' || g.type === 'quest') return [];
    const n = this.named(id, si, st, d);
    return n ? [n] : [];
  }

  /**
   * The person a step's words send you to ("Return to Makino at Party's
   * Bar", "Tell Hatchan at Takoyaki Hachi"): a named character in them —
   * by their whole name, or a name of theirs nobody else has — preferring
   * one from the quest's island, one the words send you to ("to X", "tell
   * X"), one not just owning something ("X's"), then the first.
   */
  named(id, si, st, d) {
    const key = `${id}:${si}`;
    const C = this.namedC || (this.namedC = new Map());
    if (C.has(key)) return C.get(key);
    const text = st?.desc || '';
    const home = st?.goal?.island || st?.island || d.island;
    const defs = allNpcDefs();
    if (!NAME_FREQ.size) {
      // (a name counts once however many places the same person turns up; an island's or a town's name isn't a person's)
      for (const n of new Set(defs.map((x) => x.name || ''))) for (const t of n.split(/\s+/)) NAME_FREQ.set(t, (NAME_FREQ.get(t) || 0) + 1);
      for (const isl of this.allIslands()) for (const n of [isl.name, ...(isl.towns || []).map((t) => t.name)]) for (const t of String(n || '').split(/\s+/)) PLACE_WORDS.add(t);
    }
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let best = null;
    for (const def of defs) {
      if (!def.name) continue;
      const parts = [def.name, ...def.name.split(/\s+/).filter((t) => t.length >= 3 && /^[A-Z]/.test(t) && !STOP.has(t) && !PLACE_WORDS.has(t) && NAME_FREQ.get(t) === 1 && t !== def.name)];
      // (the first time the words name them other than as owning something:
      // "Rika's rice ball" isn't about Rika — though "Franky's workshop" is where Franky is)
      let at = Infinity;
      parts.forEach((t, n) => {
        const re = new RegExp(`\\b${esc(t)}\\b`, n === 0 && /\s/.test(t) ? 'gi' : 'g');
        for (let m; (m = re.exec(text));) {
          const rest = text.slice(m.index + t.length);
          if (rest.startsWith("'s") && !THEIR_PLACE.test(rest)) continue;
          if (m.index < at) at = m.index;
          break;
        }
      });
      if (at === Infinity) continue;
      const sent = SEND_TO.test(text.slice(0, at));
      // (someone from another island only if the words send you to them, and
      // name their island or a town on it, or it's in the same sea)
      if (def.island !== home && !(sent && (this.placeNamed(def.island, text) || this.sameSea(def.island, home)))) continue;
      const score = (def.island === home ? 0 : 4e6) + (sent ? 0 : 2e6) + at;
      if (!best || score < best.score) best = { id: def.id, score };
    }
    const v = best ? best.id : null;
    C.set(key, v);
    return v;
  }

  /** Every island, on the surface and in the zones (their records, or their data). */
  allIslands() {
    return [...(this.game.surface?.islands || []), ...Object.values(ZONES).flatMap((z) => z.islands || [])];
  }

  /** Are two islands in the same sea (or the same zone)? */
  sameSea(a, b) {
    const A = this.allIslands().find((i) => i.id === a), B = this.allIslands().find((i) => i.id === b);
    if (!A || !B) return false;
    const za = ZONE_OF.get(a) || null, zb = ZONE_OF.get(b) || null;
    if (za || zb) return za === zb;
    return (A.sea || A.def?.sea) === (B.sea || B.def?.sea);
  }

  /** Do these words name an island (or one of its towns)? */
  placeNamed(islandId, text) {
    const isl = this.allIslands().find((i) => i.id === islandId);
    if (!isl) return false;
    return [isl.name, ...(isl.towns || []).map((t) => t.name)].some((n) => n && text.includes(n));
  }

  /** The nearest of these people about in this world, as a marker (or null). */
  liveOf(ids, label) {
    const g = this.game, w = g.world, p = g.player;
    let best = null, bd = Infinity;
    for (const a of g.actors) {
      if (!a.alive || !a.npcId || !ids.includes(a.npcId)) continue;
      const dd = p ? w.distance(p.x, p.y, a.x, a.y) : 0;
      if (dd < bd) { bd = dd; best = a; }
    }
    return best ? { x: best.x, y: best.y, label, place: best.name, zone: w === g.surface ? null : w.id } : null;
  }

  /**
   * A place on an island, in this world — or the way to the world it's in.
   * `at`: one of its spots ('spire_bell', or { spot }), a town's square
   * ({ town }) or the door of one of its buildings ({ town?, door }: by name
   * or role), a landmark ({ landmark }: by name), its harbour ({ dock: true }:
   * the pier head; 'stand': where the shipwright works) — or nothing: the island.
   */
  placeOf(islandId, at, label) {
    if (!islandId) return null;
    const g = this.game, w = g.world, surf = g.surface;
    const zone = ZONE_OF.get(islandId) || null;
    if (zone ? w.id === zone : w === surf) {
      const isl = w.islands.find((i) => i.id === islandId);
      if (!isl) return null;
      const s = at ? placeIn(isl, at) : null;
      if (s) return { x: s.x, y: s.y, label, place: s.place || isl.name, zone };
      return { x: isl.x, y: isl.y, label, place: isl.name, zone };
    }
    // (out of the world you're in first, then into the one it's in)
    if (w !== surf) {
      const e = ZONES[w.id]?.exits?.[0];
      if (!e) return null;
      if (e.x !== undefined) return { x: e.x, y: e.y, label, place: e.label, zone: w.id };
      const s = w.islands.find((i) => i.id === e.island)?.spots?.[e.spot];
      return s ? { x: s.x, y: s.y, label, place: e.label, zone: w.id } : null;
    }
    const way = WAY_IN[zone];
    if (!way) return null;
    const place = `The way to ${ZONES[zone]?.name || zone}`;
    if (way.spot) for (const isl of surf.islands) { const s = isl.spots?.[way.spot]; if (s) return { x: s.x, y: s.y, label, place, zone: null }; }
    const isl = way.island && surf.islands.find((i) => i.id === way.island);
    return isl ? { x: isl.x, y: isl.y, label, place, zone: null } : null;
  }
}

// which world each island is in: a zone's id (Skypiea, Fish-Man Island,
// Impel Down), or none for the surface; and where, on the surface, each
// zone is entered
const ZONE_OF = new Map();
for (const z of Object.values(ZONES)) for (const i of z.islands || []) ZONE_OF.set(i.id, z.id);
const WAY_IN = { skypiea: { spot: 'knock_up_stream' }, fishman_island: { spot: 'fishman_dive' }, impel_down: { island: 'impel_down' } };
// (the buildings that sell over the counter: see npcs.js service)
const SELLERS = new Set(['shop', 'market', 'weapons', 'tavern', 'bar', 'restaurant', 'cafe']);
// (everyone who could ever join a crew: listed the first time it's asked)
const RECRUITS = [];
// where the events that finish quest steps happen: event → a place (see
// placeOf; with the island it's on) or fn(game) → { x, y, place } or null
const EVENT_AT = new Map();
/** Content packs name the places their events happen at (their `places`), for the waypoints of the steps they finish. */
export function registerPlaces(map) { for (const [k, v] of Object.entries(map || {})) EVENT_AT.set(k, v); }

/** A place on an island (see Quests.placeOf): { x, y, place? } — or null, if it has no such place. */
function placeIn(isl, at) {
  if (typeof at === 'string') at = { spot: at };
  if (at.spot) {
    const s = isl.spots?.[at.spot];
    return s ? { x: s.x + (at.ox || 0), y: s.y + (at.oy || 0), place: at.place } : null;
  }
  if (at.landmark) {
    const l = isl.landmarks?.find((o) => o.name === at.landmark);
    return l ? { x: l.x, y: l.y, place: l.name } : null;
  }
  if (at.dock) {
    // (the harbour of its first town: the pier head you tie up at, or where its shipwright works)
    const t = isl.towns?.[0], docks = isl.docks || [];
    const d = t ? docks.slice().sort((a, b) => Math.hypot(a.land.x - t.x, a.land.y - t.y) - Math.hypot(b.land.x - t.x, b.land.y - t.y))[0] : docks[0];
    if (!d) return null;
    const p = at.dock === 'stand' ? d.stand || d.land : d.end || d;
    return { x: p.x, y: p.y, place: `${d.name || isl.name} harbour` };
  }
  for (const t of isl.towns || []) {
    if (at.town && t.id !== at.town && t.name !== at.town) continue;
    if (at.door) {
      const b = (t.buildings || []).find((x) => x.name === at.door || x.role === at.door);
      if (b?.door) return { x: b.door.x, y: b.door.y, place: b.name ? `${b.name}, ${t.name}` : t.name };
    } else if (at.town) return { x: t.plaza.x, y: t.plaza.y, place: at.place || t.name };
  }
  return null;
}
// (a title or a word isn't a name: "Captain" alone doesn't send you to
// Captain Morgan, nor "Sail to Reverse Mountain" to Old Sail the fisherman)
const STOP = new Set(['Captain', 'Mayor', 'King', 'Queen', 'Lord', 'Lady', 'Doctor', 'Commodore', 'Admiral', 'Vice', 'Chief', 'Sergeant', 'Colonel', 'Master', 'Prince', 'Princess', 'Sister', 'Brother', 'Grandpa', 'Granny', 'Uncle', 'Aunt', 'Miss', 'Madam', 'Madame', 'General', 'Officer', 'Lieutenant', 'Commander', 'Boss', 'Saint', 'Father', 'Mother', 'Elder', 'Chef', 'Keeper', 'Warden', 'Emperor', 'Young', 'Little', 'Great', 'Marine', 'Marines', 'Pirate', 'Pirates', 'Sensei', 'Shogun', 'Old', 'Big', 'Mad', 'The', 'Don', 'Mister', 'Crewman', 'Guard', 'Village', 'Town', 'City', 'House', 'Island', 'Harbour', 'Port', 'Hall', 'Gate', 'Mountain', 'Reverse', 'Sail', 'Sea', 'Red', 'Black', 'White', 'Blue', 'Green', 'Golden', 'Iron', 'Heart', 'Royal', 'Grand', 'Head', 'First', 'Second', 'Third', 'Man', 'Woman', 'Boy', 'Girl']);
const NAME_FREQ = new Map(), PLACE_WORDS = new Set();
// (words that send you to someone: "Return to", "Tell", "Ask the gatekeeper, …")
const SEND_TO = /(?:\bto|\btell|\bask|\bvisit|\bmeet|\bfind|\bwarn|\bsee|\bwith|\bface|\bbeat|\bdefeat|\bfrom)\s+(?:the\s+)?(?:[\w'.-]+,?\s+)?$/i;
// (someone's place: "Franky's workshop", "Rayleigh's camp")
const THEIR_PLACE = /^'s\s+(?:old\s+|new\s+)?(?:workshop|house|home|camp|church|clinic|castle|hall|bar|shop|hut|tent|grave|lab|laboratory|office|mansion|palace|den|hideout|study|forge|garden|farm|dojo|tower|inn|restaurant|tavern|room)\b/i;
