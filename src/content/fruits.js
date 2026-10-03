// Devil Fruit distribution for a run: a handful of fruits hidden around the
// world, rumoured about in taverns. Also used by bosses, barrels and chests.
import { FRUITS, FRUIT_IDS, unlockedFruitTechniques } from '../data/fruits.js';
import { RNG } from '../core/rng.js';
import { regionAt, REGION_INFO } from '../world/constants.js';
import { placeObject } from '../world/islandgen.js';
import { addItem } from '../game/inventory.js';
import { allNpcDefs } from '../game/npcs.js';
import { getAbility } from '../game/abilities.js';

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
  });
  // place fruit pickups when an island is populated
  game.spawner.addBuilder(({ island, game: g, spawner }) => {
    const c = g.state?.char;
    for (const f of c?.world?.fruitSpawns || []) {
      if (f.taken || f.island !== island.id) continue;
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
