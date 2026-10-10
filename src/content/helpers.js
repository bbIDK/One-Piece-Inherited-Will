// Helpers for content packs.
import { makeNPC, npcDef, makeEnemy, placeFor } from '../game/npcs.js';
import { makeSeaKing } from '../game/sea.js';

/** Spawn a registered NPC right now if its island is loaded. */
export function spawnNow(game, id, pos) {
  const def = npcDef(id);
  if (!def) return null;
  const existing = findActor(game, id);
  if (existing) return existing;
  const isl = game.world.islands.find((i) => i.id === def.island);
  const list = game.spawner.populated.get(def.island);
  if (!list && !pos) return null;
  let p = pos;
  const at = typeof def.at === 'function' ? def.at(game.state?.char, game) : def.at;
  if (!p && isl) {
    const s = at?.spot && isl.spots[at.spot];
    // (where they belong — a spot, a town's pier, a doorway, the square — else by you)
    p = s ? game.spawner.findFree(s.x, s.y, 4)
      : at && (at.town || at.dock || at.door || at.building || at.plaza || at.dx !== undefined) ? placeFor(game, isl, def)
        : game.spawner.findFree(game.player.x + 4, game.player.y, 6);
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
  // (out for you — but they have to see you first: no knowing where you are
  // through the houses the moment a quest names them. They wait where they
  // are, and come for you once you're in sight — ai.js findTarget)
  if (a.controller) { a.controller.kind = 'hostile'; a.controller.aggroRange = Math.max(a.controller.aggroRange || 0, 18); if (!a.controller.home) a.controller.home = { x: a.x, y: a.y }; }
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

/** Respawn an island's population right now (new quest stage → new people). */
export function refreshIsland(game, islandId) { return game.spawner.refresh(islandId); }

/** Spawn an enemy group immediately (same format as pack groups). Returns the actors. */
export function spawnGroup(game, grp) {
  const isl = game.world.islands.find((i) => i.id === grp.island);
  if (!isl) return [];
  const base = grp.spot ? isl.spots[grp.spot] : grp.x !== undefined ? { x: grp.x, y: grp.y } : { x: isl.x + (grp.dx || 0) * isl.def.w / 2, y: isl.y + (grp.dy || 0) * isl.def.h / 2 };
  if (!base) return [];
  const out = [];
  const list = game.spawner.populated.get(isl.id);
  for (const e of grp.enemies || []) {
    const [arch, lvl, over] = Array.isArray(e) ? e : [e, grp.level || 6, {}];
    const p = game.spawner.findFree(base.x, base.y, grp.radius || 5) || base;
    const a = makeEnemy(arch, lvl, p.x, p.y, over || {});
    a.game = game;
    if (grp.leash) a.controller.leash = grp.leash;
    if (grp.aggro) aggro(game, a);
    game.addActor(a);
    if (list) list.push(a);
    out.push(a);
  }
  return out;
}
