// People out in the country on a grown island (world/islandgen.js placeCountry):
// a farmer at the farmstead, woodcutters by their camp, and at a camp out in
// the wilds a few bandits round the fire — guarding the chest in the tent.
// Spawned with the rest of the island as you come near (game/spawner.js).
import { makeLook } from '../data/races.js';
import { makeEnemy } from './npcs.js';
import { civilianOutfit, randomName, townRaces } from './spawner.js';

const WORK = {
  farmer: { n: [1, 2], outfit: 'village', label: 'farm' },
  woodcutters: { n: [2, 3], outfit: 'village', label: 'woodcutters\' camp' },
};

export function countryBuilder(ctx) {
  const { island, game, spawner, list, rng } = ctx;
  if (!island.country?.length || !game.state?.char) return;
  const danger = island.def?.danger || 1;
  const races = island.def?.population || townRaces(island);
  for (const site of island.country) {
    if (site.folk === 'bandits') {
      // (a gang of two to four, as tough as the island is dangerous; they stay by their camp)
      const n = rng.int(2, 2 + Math.min(2, danger));
      for (let i = 0; i < n; i++) {
        const p = spawner.findFree(site.x, site.y, 7, rng);
        if (!p) continue;
        const a = makeEnemy('bandit', 2 + danger * 3 + rng.int(0, 2), p.x, p.y, { seed: rng.int(1, 1e9) });
        a.game = game;
        if (a.controller) a.controller.leash = 22;
        // (the camp's: when the last of them is down it's cleared — content/countryQuests.js)
        a.camp = island.id;
        game.addActor(a);
        list.push(a);
      }
      continue;
    }
    const W = WORK[site.folk];
    if (!W) continue;
    for (let i = rng.int(W.n[0], W.n[1]); i > 0; i--) {
      const p = spawner.findFree(site.x, site.y, 8, rng);
      if (!p) continue;
      const race = rng.weighted(races);
      const a = spawner.spawn({
        x: p.x, y: p.y, name: randomName(rng, race), look: makeLook(race, rng.int(1, 1e9), civilianOutfit(W.outfit, rng)),
        race, faction: 'civilian', attrs: { str: 4, agi: 3, end: 4, vit: 4, wil: 3 }, ai: { kind: 'wander' },
      }, list);
      // (they've jobs for you: content/countryQuests.js)
      a.talk = { kind: 'country', folk: site.folk, island: island.id, town: `the ${W.label}`, seed: rng.int(0, 1e6) };
      a.showName = false;
      a.wanderRadius = 6;
    }
  }
}
