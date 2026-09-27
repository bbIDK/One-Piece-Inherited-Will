// Builds the small separate worlds used by zones (Skypiea, Fish-Man Island,
// Impel Down): a flat "sea" of the zone's fill tile with islands from data.
import { World } from './world.js';
import { ObjectIndex } from './objects.js';
import { Noise } from '../core/noise.js';
import { RNG } from '../core/rng.js';
import { generateIsland, placeObject } from './islandgen.js';
import { computeDistanceField, compactDistance, buildMapImage } from './worldgen.js';

const ZONE_KIND = { sky: 1, undersea: 2, prison: 3 };

export function generateZoneWorld(z) {
  const world = new World(z.w, z.h, { wrap: false, zone: ZONE_KIND[z.kind] || 3, id: z.id });
  world.name = z.name;
  world.zoneDef = z;
  world.objects = new ObjectIndex(world);
  world.fillAll(z.fill, 0, 0);
  const noise = new Noise(z.id);
  const rng = new RNG(z.id + ':zone');
  for (const def of z.islands) {
    try {
      const rec = generateIsland(world, def, noise, rng.fork(def.id));
      if (rec) { rec.zone = z.id; world.islands.push(rec); }
    } catch (e) {
      console.error(`zone island ${def.id} failed`, e);
    }
  }
  // stairways / passages between islands of the zone (Impel Down levels)
  for (const [a, sa, b, sb] of z.links || []) {
    const A = world.islands.find((i) => i.id === a), B = world.islands.find((i) => i.id === b);
    const pa = A?.spots[sa], pb = B?.spots[sb];
    if (!pa || !pb) continue;
    placeObject(world, { kind: 'portal', x: pa.x, y: pa.y, block: false, to: { x: pb.x, y: pb.y + 1.5 }, interact: `Take the stairs down to ${B.name}`, use: 'portal' });
    placeObject(world, { kind: 'portal', x: pb.x, y: pb.y, block: false, to: { x: pa.x, y: pa.y + 1.5 }, interact: `Climb the stairs to ${A.name}`, use: 'portal', up: true });
  }
  computeDistanceField(world);
  compactDistance(world);
  world.map = buildMapImage(world);
  return world;
}
