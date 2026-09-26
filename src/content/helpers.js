// Helpers for content packs.
import { makeNPC, npcDef } from '../game/npcs.js';
import { makeSeaKing } from '../game/sea.js';

/** Spawn a registered NPC right now if its island is loaded. */
export function spawnNow(game, id, pos) {
  const def = npcDef(id);
  if (!def) return null;
  const existing = findActor(game, id);
  if (existing) return existing;
  const isl = game.surface.islands.find((i) => i.id === def.island);
  const list = game.spawner.populated.get(def.island);
  if (!list && !pos) return null;
  let p = pos;
  if (!p && isl) {
    const s = def.at?.spot && isl.spots[def.at.spot];
    p = s ? game.spawner.findFree(s.x, s.y, 4) : game.spawner.findFree(game.player.x + 4, game.player.y, 6);
  }
  if (!p) p = { x: game.player.x + 4, y: game.player.y };
  const a = makeNPC(def, p.x, p.y);
  a.game = game;
  game.addActor(a);
  if (list) list.push(a);
  return a;
}

export function findActor(game, id) {
  return game.actors.find((a) => a.alive && a.npcId === id) || null;
}

export function despawn(game, id) {
  const a = findActor(game, id);
  if (a) a.alive = false;
}

/** Make a boss hostile & aggressive toward the player right away. */
export function aggro(game, a) {
  if (!a) return;
  a.provoked = true;
  a.aggroPlayer = true;
  if (a.controller) { a.controller.kind = 'hostile'; a.controller.target = game.player; a.controller.state = 'chase'; }
  a.stationary = false;
  if (a.boss) game.bossTarget = a;
}

export function seaBoss(game, opts, x, y) {
  const k = makeSeaKing(game, x, y, opts.level, { ...opts, boss: true, hpMul: opts.hpMul || 4 });
  k.boss = true;
  game.addActor(k);
  game.bossTarget = k;
  return k;
}

/** Dialogue tree shorthand: sequence of lines then optional choices. */
export function lines(...texts) {
  const nodes = {};
  texts.forEach((t, i) => { nodes['l' + i] = typeof t === 'object' && !Array.isArray(t) ? { ...t, next: t.next ?? (i + 1 < texts.length ? 'l' + (i + 1) : undefined) } : { text: t, next: i + 1 < texts.length ? 'l' + (i + 1) : undefined }; });
  return { start: 'l0', nodes };
}

export const Q = (game) => game.quests;
