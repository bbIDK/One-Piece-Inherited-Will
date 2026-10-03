// Devil Fruit distribution for a run: a handful of fruits hidden around the
// world, rumoured about in taverns. Also used by bosses, barrels and chests.
import { FRUITS, FRUIT_IDS, unlockedFruitTechniques } from '../data/fruits.js';
import { RNG } from '../core/rng.js';
import { regionAt, REGION_INFO } from '../world/constants.js';
import { placeObject } from '../world/islandgen.js';
import { addItem } from '../game/inventory.js';
import { allNpcDefs } from '../game/npcs.js';
import { getAbility } from '../game/abilities.js';
import { DEVIL, fruitOf, fruitKey, fruitCount, fruitPicked } from '../world/fruitTrees.js';

/**
 * A fruit's techniques as they are now, for a character from before: its
 * whole base set is known (it's all yours on eating now: a technique added to
 * the fruit since, or one that used to open with mastery), and any no longer
 * part of it are gone.
 */
function catchUpFruit(game, c) {
  if (!c?.fruit || !FRUITS[c.fruit]) return;
  const stale = (id) => typeof id === 'string' && /^(gomu|gura|ope|bara|bomu|hana|ito|mochi|horo|kage|doku|noro|bari|suke|sube|doru|supa|nikyu|mane|zushi|hito|neko|phoenix|seiryu|mera|hie|goro|suna|moku|pika|magu|yami)_/.test(id) && !getAbility(id);
  c.techniques = (c.techniques || []).filter((id) => !stale(id));
  c.hotbar = (c.hotbar || []).map((id) => (stale(id) ? null : id));
  const fresh = unlockedFruitTechniques(c.fruit, c.fruitMastery || 0).filter((id) => !c.techniques.includes(id));
  for (const id of fresh) c.techniques.push(id);
  if (fresh.length) game.log?.(`The whole of your ${FRUITS[c.fruit].name}'s base set is yours: ${fresh.map((id) => getAbility(id)?.name).filter(Boolean).join(', ')} — on the skill keys while the fruit is out (its key on the hotbar).`, '#ffab91');
}

/**
 * Every Devil Fruit exists once: fruits already eaten (by you or a canon
 * user), in your bag, or placed somewhere in the world are never rolled again.
 */
function takenFruits(game) {
  const c = game.state?.char;
  const t = new Set(c?.world?.fruitsTaken || []);
  if (c?.fruit) t.add(c.fruit);
  for (const it of c?.inventory || []) if (it.id && it.id.startsWith('fruit_')) t.add(it.id.slice(6));
  for (const d of allNpcDefs()) if (d.fruit && FRUITS[d.fruit]) t.add(d.fruit);
  return t;
}

/** The nearest fruit tree to (x, y) on the surface within `r` tiles, or null. */
function fruitTreeNear(game, x, y, r, skip) {
  const w = game.surface;
  if (!w?.objects) return null;
  let best = null, bd = Infinity;
  for (const o of w.objects.near(x, y, r, (o) => o.kind === 'tree' && !!fruitOf(o))) {
    if (skip?.has(fruitKey(w.id, o))) continue;
    const d = w.distance(x, y, o.x, o.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * Hang the run's Devil Fruits in the trees: each one not yet found, on the
 * fruit tree nearest where it was rolled to be (recorded in the save, so it's
 * the same tree every time), among that tree's own fruit — a swirled apple,
 * banana or coconut you can pick (forage.js). One with no fruit tree near
 * enough stays on the ground where it fell. Re-drawn on any tree already
 * built.
 */
function hangFruits(game) {
  const c = game.state?.char, w = game.surface;
  DEVIL.clear();
  if (!c || !w) return;
  const used = new Set();
  for (const f of c.world.fruitSpawns || []) {
    if (f.taken) continue;
    if (f.tx === undefined) {
      const o = fruitTreeNear(game, f.x, f.y, 70, used);
      if (o) { f.tx = o.x; f.ty = o.y; f.slot = Math.floor(((o.x * 7.31 + o.y * 3.17) % 1 + 1) % 1 * 97) % Math.max(1, fruitCount(o)); } else f.tx = null;
    }
    if (f.tx === null) continue;
    const key = fruitKey(w.id, { x: f.tx, y: f.ty });
    used.add(key);
    DEVIL.set(key, { fruit: f.fruit, slot: f.slot || 0, spawn: f, color: FRUITS[f.fruit]?.color || '#8e44ad' });
  }
  redraw(game);
}
/** Trees already built are built again, with (or without) their Devil Fruit. */
function redraw(game) {
  const v3 = game.view3d, w = game.surface;
  if (!v3?.built || !w) return;
  for (const [o, v] of v3.built) if (o.kind === 'tree' && (o._devil >= 0) !== !!DEVIL.get(fruitKey(w.id, o))) { v3.dropProp(o, v); v3.propsDirty = true; }
}

export function installFruits(game) {
  game.rollFruit = (rng) => {
    const c = game.state?.char;
    const taken = takenFruits(game);
    const list = FRUIT_IDS.filter((id) => !taken.has(id)).map((id) => [id, FRUITS[id].weight]);
    if (!list.length) return null;
    const id = rng.weighted(list);
    if (c) c.world.fruitsTaken = [...new Set([...(c.world.fruitsTaken || []), id])];
    return id;
  };
  game.fruitTaken = (id) => takenFruits(game).has(id);
  game.fruitRumor = (rng) => {
    const c = game.state?.char;
    const spawns = (c?.world?.fruitSpawns || []).filter((f) => !f.taken);
    if (!spawns.length) return null;
    const f = rng.pick(spawns);
    const isl = game.surface.islands.find((i) => i.id === f.island);
    if (!isl) return null;
    const sea = REGION_INFO[regionAt(isl.x, isl.y)]?.name;
    const precise = (game.state.legacy?.perks?.fruit_sense || 0) > 0 || c.traits.includes('keen_eye');
    return precise ? `"A fruit with strange swirling patterns grows on ${isl.name}. Nobody dares to eat it."` : `"They say a Devil Fruit was spotted somewhere in the ${sea}... ${isl.name.split(' ')[0].slice(0, 2)}-something island, I think."`;
  };
  game.on('characterStart', ({ char, isNew }) => {
    if (!isNew) catchUpFruit(game, char);
    if (!char.world.fruitSpawns) {
      const rng = new RNG(char.runSeed + ':fruits');
      const isles = game.surface.islands.filter((i) => i.name && !i.def.noFruit && i.def.sea);
      const spawns = [];
      // fruits whose users died come back into the world (once each), the rest are rolled
      const canon = new Set(allNpcDefs().filter((d) => d.fruit).map((d) => d.fruit));
      const reborn = [...new Set(game.state.legacy?.reincarnatedFruits || [])].filter((f) => FRUITS[f] && !canon.has(f));
      const n = 7;
      for (let k = 0; k < n; k++) {
        const isl = rng.pick(isles);
        let fid = k < reborn.length ? reborn[reborn.length - 1 - k] : game.rollFruit(rng);
        if (!fid || spawns.some((s0) => s0.fruit === fid)) continue;
        if (!char.world.fruitsTaken?.includes(fid)) char.world.fruitsTaken = [...(char.world.fruitsTaken || []), fid];
        const spot = rng.pick([...isl.towns.map((t) => ({ x: t.x + rng.range(-t.w / 2, t.w / 2), y: t.y + rng.range(-t.h / 2, t.h / 2) })), { x: isl.x + rng.range(-isl.def.w / 3, isl.def.w / 3), y: isl.y + rng.range(-isl.def.h / 3, isl.def.h / 3) }]);
        spawns.push({ island: isl.id, fruit: fid, x: spot.x, y: spot.y, taken: false });
      }
      char.world.fruitSpawns = spawns;
    }
    hangFruits(game);
  });
  game.hangFruits = () => hangFruits(game);
  // a Devil Fruit picked from its tree (forage.js): yours, and the tree's just a tree again
  game.devilPicked = (o, df) => {
    const f = df.spawn;
    if (!f || f.taken) return false;
    if (!addItem(game, 'fruit_' + f.fruit, 1, { silent: true })) return false;
    f.taken = true;
    DEVIL.delete(fruitKey(game.surface.id, o));
    game.ui.toast('A DEVIL FRUIT!', `${FRUITS[f.fruit].name} — hanging among the ordinary fruit, swirled all over.`, '#ffab91');
    game.log('You pick the strange swirled fruit. The patterns on its skin are unmistakable: a Devil Fruit.', '#ffab91');
    redraw(game);
    return true;
  };
  // now and then a fruit tree on an island bears one too: the first time you
  // set foot on an island, a chance one of its trees has a Devil Fruit among
  // its own (the same for the same run)
  game.on('enterIsland', (isl) => {
    const c = game.state?.char;
    if (!c || !isl?.id || game.world !== game.surface || isl.def?.noFruit) return;
    const seen = (c.world.fruitIsles ||= {});
    if (seen[isl.id]) return;
    seen[isl.id] = 1;
    const rng = new RNG(`${c.runSeed}:tree-fruit:${isl.id}`);
    if (!rng.chance(0.18)) return;
    const o = fruitTreeNear(game, isl.x + rng.range(-isl.def.w / 4, isl.def.w / 4), isl.y + rng.range(-isl.def.h / 4, isl.def.h / 4), Math.max(isl.def.w, isl.def.h) / 2);
    if (!o || DEVIL.get(fruitKey(game.surface.id, o)) || fruitPicked(game.surface.id, o, 0, game.env.day)) return;
    const fid = game.rollFruit(rng);
    if (!fid) return;
    (c.world.fruitSpawns ||= []).push({ island: isl.id, fruit: fid, x: o.x, y: o.y, tx: o.x, ty: o.y, slot: 0, taken: false, tree: true });
    hangFruits(game);
  });
  // place fruit pickups when an island is populated
  game.spawner.addBuilder(({ island, game: g, spawner }) => {
    const c = g.state?.char;
    for (const f of c?.world?.fruitSpawns || []) {
      // (one hanging in a tree is picked from it: see hangFruits)
      if (f.taken || f.island !== island.id || f.tx) continue;
      const p = spawner.findFree(f.x, f.y, 8) || { x: f.x, y: f.y };
      g.groundItems = g.groundItems || [];
      if (!g.groundItems.some((it) => it.fruitSpawn === f)) g.groundItems.push({ x: p.x, y: p.y, id: 'fruit_' + f.fruit, label: 'a strange swirled fruit', fruitSpawn: f });
    }
  });
  game.on('pickup', (it) => {
    const g = game;
    g.groundItems = (g.groundItems || []).filter((x) => x !== it);
    // a fruit already found elsewhere (an old save, a second copy) is just a rotten fruit now
    if (it.fruitSpawn && it.fruitSpawn.taken) return;
    addItem(g, it.id, 1);
    if (it.fruitSpawn) { it.fruitSpawn.taken = true; g.ui.toast('A DEVIL FRUIT!', FRUITS[it.fruitSpawn.fruit].name, '#ffab91'); }
  });
  void placeObject;
}
