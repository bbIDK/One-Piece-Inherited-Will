// Populates islands with people as the player approaches, and removes them
// when the player sails away. Named NPCs and bosses come from data; ordinary
// townsfolk are generated. Wilderness enemies are placed sparsely — the world
// is meant to be explored, not farmed.
import { Actor } from './actor.js';
import { AIController } from './ai.js';
import { makeLook } from '../data/races.js';
import { RNG } from '../core/rng.js';
import { WALKABLE, IS_LIQUID } from '../world/tiles.js';

export class Spawner {
  constructor(game) {
    this.game = game;
    this.populated = new Map(); // island id → [actors]
    this.t = 0;
    this.builders = []; // fns(island, spawner) that add content (NPC data, arcs)
  }

  addBuilder(fn) { this.builders.push(fn); }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const game = this.game;
    const p = game.player;
    const w = game.world;
    for (const isl of w.islands) {
      const d = w.distance(p.x, p.y, isl.x, isl.y);
      const near = d < isl.radius + 45;
      const far = d > isl.radius + 95;
      if (near && !this.populated.has(isl.id)) this.populate(isl);
      else if (far && this.populated.has(isl.id)) this.depopulate(isl);
    }
  }

  populate(isl) {
    const game = this.game;
    const list = [];
    this.populated.set(isl.id, list);
    const rng = new RNG(isl.id + ':' + (game.state?.runSeed || 0) + ':' + Math.floor(game.env.day / 3));
    const ctx = { island: isl, rng, list, spawner: this, game };
    for (const b of this.builders) {
      try { b(ctx); } catch (e) { console.error('builder failed for', isl.id, e); }
    }
    if (!ctx.skipTownsfolk) for (const town of isl.towns) this.townsfolk(town, isl, rng, list, ctx);
  }

  /** Re-run an island's builders now (e.g. after a quest stage changes who should be there). */
  refresh(islandId) {
    const isl = this.game.world.islands.find((i) => i.id === islandId);
    if (!isl || !this.populated.has(isl.id)) return false;
    this.depopulate(isl);
    this.populate(isl);
    return true;
  }

  depopulate(isl) {
    const list = this.populated.get(isl.id) || [];
    for (const a of list) {
      if (a.persistent || a.faction === 'player') continue;
      a.alive = false;
    }
    this.populated.delete(isl.id);
    this.game.emit('depopulate', isl);
  }

  /** Spawn an actor and register it with an island's population. */
  spawn(opts, list) {
    const a = new Actor(opts);
    a.game = this.game;
    if (opts.ai) a.controller = new AIController({ home: { x: a.x, y: a.y }, ...opts.ai });
    this.game.addActor(a);
    if (list) list.push(a);
    return a;
  }

  townsfolk(town, isl, rng, list, ctx) {
    const game = this.game;
    const spots = town.npcSpots.slice();
    rng.shuffle(spots);
    const count = Math.min(spots.length, Math.round(4 + town.w * town.h / 90));
    const races = isl.def.population || townRaces(isl);
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      if (s.building && s.building.npcSpawned) continue;
      if (!this.freeSpot(s.x, s.y)) continue;
      const race = rng.weighted(races);
      const look = makeLook(race, rng.int(1, 1e9), civilianOutfit(town.style, rng));
      const name = randomName(rng, race);
      const a = this.spawn({
        x: s.x, y: s.y, name, look, race, faction: 'civilian', attrs: { str: 3, agi: 4, end: 3, vit: 3, wil: 3 },
        ai: { kind: 'wander' },
      }, list);
      a.talk = { kind: 'townsfolk', town: town.name, island: isl.name, seed: rng.int(0, 1e6) };
      a.showName = false;
      a.wanderRadius = 5;
      if (ctx.onTownsfolk) ctx.onTownsfolk(a, town);
    }
  }

  freeSpot(x, y) {
    const w = this.game.world;
    const t = w.type(x, y - 0.1);
    return WALKABLE[t] && !IS_LIQUID[t] && !w.isBlocked(x, y - 0.1) && !w.isBlocked(x, y - 0.35) && !w.hitsProp(x, y, 0.45);
  }

  /** Find a walkable point near (x, y). */
  findFree(x, y, r = 6, rng = Math) {
    for (let k = 0; k < 60; k++) {
      const a = rng.random ? rng.random() * Math.PI * 2 : rng.next() * Math.PI * 2;
      const d = (k / 60) * r;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (this.freeSpot(px, py)) return { x: px, y: py };
    }
    return null;
  }
}

export function townRaces(isl) {
  const sea = isl.def.sea;
  if (sea === 'new_world' || sea === 'paradise') return [['human', 70], ['fishman', 6], ['mink', 6], ['longarm', 4], ['longleg', 4], ['skypiean', 2]];
  return [['human', 94], ['fishman', 2], ['longarm', 2], ['longleg', 2]];
}

export function civilianOutfit(style, rng) {
  if (style === 'wano') return { role: 'wano', top: rng.pick(['#6d4c41', '#37474f', '#8d6e63', '#c62828', '#283593', '#4a148c', '#1b5e20']), bottom: rng.pick(['#3e2723', '#263238', '#37474f']) };
  if (style === 'desert') return { role: 'desert', top: rng.pick(['#f5f5f5', '#efebe9', '#ffe0b2']), bottom: rng.pick(['#d7ccc8', '#bcaaa4']), hat: rng.chance(0.4) ? 'bandana' : null, hatColor: '#fafafa' };
  if (style === 'marine') return { role: 'marine', top: '#ffffff', bottom: '#1b4f72', hat: 'marine' };
  if (style === 'sky') return { role: 'sky', top: rng.pick(['#ffffff', '#fff9c4', '#e1f5fe']), bottom: '#ffffff' };
  if (style === 'snow') return { role: 'snow', top: rng.pick(['#6d4c41', '#5d4037', '#455a64']), bottom: '#3e2723', hat: rng.chance(0.5) ? 'beanie' : null };
  return { role: 'civilian' };
}

const FIRST = ['Ban', 'Kin', 'Mo', 'Ta', 'Ri', 'Su', 'Ko', 'Ha', 'Yo', 'Ma', 'Pe', 'Gi', 'Do', 'Ne', 'Lu', 'Fi', 'Ca', 'Bo', 'Ja', 'Ze', 'Wa', 'Ro', 'Mi', 'Sa'];
const SECOND = ['ji', 'ta', 'ro', 'ko', 'ne', 'mo', 'ra', 'n', 'ki', 'bo', 'la', 'ppo', 'zo', 'ke', 'ri', 'sa', 'ga', 'do'];
const SURN = ['Smith', 'Fisher', 'Baker', 'Porter', 'Cook', 'Miller', 'Tanner', 'Carver', 'Rowe', 'Harbor', 'Salt', 'Reef', 'Gale', 'Brine'];
export function randomName(rng, race) {
  const n = rng.pick(FIRST) + rng.pick(SECOND);
  if (race === 'fishman') return n + ' the ' + rng.pick(['Snapper', 'Eel', 'Grouper', 'Shark', 'Ray']);
  return n + (rng.chance(0.4) ? ' ' + rng.pick(SURN) : '');
}
