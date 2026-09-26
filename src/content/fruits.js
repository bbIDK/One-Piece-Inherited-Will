// Devil Fruit distribution for a run: a handful of fruits hidden around the
// world, rumoured about in taverns. Also used by bosses, barrels and chests.
import { FRUITS, FRUIT_IDS } from '../data/fruits.js';
import { RNG } from '../core/rng.js';
import { regionAt, REGION_INFO } from '../world/constants.js';
import { placeObject } from '../world/islandgen.js';
import { addItem } from '../game/inventory.js';

export function installFruits(game) {
  game.rollFruit = (rng) => {
    const c = game.state?.char;
    const taken = new Set(c?.world?.fruitsTaken || []);
    const list = FRUIT_IDS.filter((id) => !taken.has(id)).map((id) => [id, FRUITS[id].weight]);
    if (!list.length) return null;
    const id = rng.weighted(list);
    if (c) c.world.fruitsTaken = [...taken, id];
    return id;
  };
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
    if (!char.world.fruitSpawns) {
      const rng = new RNG(char.runSeed + ':fruits');
      const isles = game.surface.islands.filter((i) => i.name && !i.def.noFruit && i.def.sea);
      const spawns = [];
      const reborn = game.state.legacy?.reincarnatedFruits || [];
      const n = 7;
      for (let k = 0; k < n; k++) {
        const isl = rng.pick(isles);
        let fid = k < reborn.length ? reborn[reborn.length - 1 - k] : game.rollFruit(rng);
        if (!fid) continue;
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
    addItem(g, it.id, 1);
    if (it.fruitSpawn) { it.fruitSpawn.taken = true; g.ui.toast('A DEVIL FRUIT!', FRUITS[it.fruitSpawn.fruit].name, '#ffab91'); }
  });
  void placeObject;
}
