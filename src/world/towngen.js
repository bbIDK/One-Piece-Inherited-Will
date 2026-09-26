// Procedural towns: streets, a plaza, rows of houses (doors face the street
// below them), named special buildings (taverns, shops, dojos, shipwrights…)
// and street props. Returns a record used for NPC placement and interaction.
import { T, IS_LIQUID, WALKABLE, OVERLAY } from './tiles.js';
import { placeObject } from './islandgen.js';

export const TOWN_STYLES = {
  village: { ground: null, road: T.DIRT, plaza: T.DIRT, walls: ['#caa77a', '#b8915f', '#d8c29d', '#c49a6c'], roofs: ['#9c4a2a', '#7d5a3a', '#b5452f', '#6d7a4a'], roof: 'gable', rowStep: 8, lamps: false, fences: true },
  town: { ground: T.COBBLE, road: T.STONE, plaza: T.STONE, walls: ['#f1e3c8', '#e8d5b5', '#e9e4dc', '#f5cba7', '#dbe4e6'], roofs: ['#c0392b', '#d35400', '#a04000', '#2e86c1', '#8e3b2e'], roof: 'gable', rowStep: 8, lamps: true },
  port: { ground: T.COBBLE, road: T.STONE, plaza: T.STONE, walls: ['#d7c4a3', '#c9b08d', '#e5d3b3', '#bfa37f'], roofs: ['#7b241c', '#1f618d', '#6e2c00', '#4d5656'], roof: 'gable', rowStep: 8, lamps: true },
  city: { ground: T.STONE, road: T.COBBLE, plaza: T.STONE, walls: ['#d98c5f', '#c97b4f', '#e4a47a', '#e8b996', '#b8735a'], roofs: ['#8e4430', '#5d6d7e', '#6e2c00', '#7f5539'], roof: 'gable', rowStep: 9, lamps: true, tall: true },
  desert: { ground: T.DESERT, road: T.STONE, plaza: T.STONE, walls: ['#e7c9a0', '#dcb98a', '#f0dcb8', '#e2c290'], roofs: ['#e7c9a0', '#d9b27c', '#f3e0bd'], roof: 'flat', domes: true, rowStep: 8, lamps: false },
  snow: { ground: T.SNOW, road: T.GRAVEL, plaza: T.GRAVEL, walls: ['#8e6e53', '#a1887f', '#795548'], roofs: ['#f4f8fb', '#e8eef3'], roof: 'gable', rowStep: 8, lamps: true },
  wano: { ground: T.DIRT, road: T.GRAVEL, plaza: T.GRAVEL, walls: ['#6d4c41', '#5d4037', '#efebe9', '#d7ccc8'], roofs: ['#37474f', '#263238', '#4e342e', '#455a64'], roof: 'pagoda', rowStep: 8, lamps: true, lantern: true },
  sky: { ground: T.ISLAND_CLOUD, road: T.ISLAND_CLOUD, plaza: T.ISLAND_CLOUD, walls: ['#fdfefe', '#f4f6f7', '#fef9e7'], roofs: ['#aed6f1', '#f9e79f', '#d2b4de'], roof: 'dome', rowStep: 8, lamps: false },
  candy: { ground: T.CANDY, road: T.CAKE, plaza: T.CAKE, walls: ['#fadbd8', '#fcf3cf', '#d6eaf8', '#e8daef'], roofs: ['#e74c3c', '#8e44ad', '#f5b041', '#ec7063'], roof: 'dome', rowStep: 8, lamps: true },
  fishman: { ground: T.CORAL, road: T.MARBLE, plaza: T.MARBLE, walls: ['#f5b7b1', '#aed6f1', '#f9e79f', '#a3e4d7'], roofs: ['#48c9b0', '#5dade2', '#f1948a', '#bb8fce'], roof: 'shell', rowStep: 8, lamps: true },
  marine: { ground: T.STONE, road: T.STONE, plaza: T.STONE, walls: ['#fdfefe', '#f2f3f4'], roofs: ['#2874a6', '#1b4f72', '#2e86c1'], roof: 'flat', rowStep: 9, lamps: true, flags: true },
  noble: { ground: T.MARBLE, road: T.MARBLE, plaza: T.MARBLE, walls: ['#fdfefe', '#fef9e7', '#fbeee6'], roofs: ['#d4ac0d', '#1a5276', '#7d3c98'], roof: 'dome', rowStep: 9, lamps: true },
  spooky: { ground: T.BONE, road: T.GRAVEL, plaza: T.GRAVEL, walls: ['#5b4a6b', '#4a4a5a', '#6c5b7b'], roofs: ['#2c2c3a', '#3b2f4a', '#1c2833'], roof: 'gable', rowStep: 8, lamps: true },
  future: { ground: T.STEEL, road: T.MARBLE, plaza: T.MARBLE, walls: ['#ecf0f1', '#d0ece7', '#fdedec'], roofs: ['#48c9b0', '#f1948a', '#85c1e9'], roof: 'dome', rowStep: 9, lamps: true },
  tribal: { ground: null, road: T.DIRT, plaza: T.DIRT, walls: ['#a1887f', '#8d6e63', '#bcaaa4'], roofs: ['#d4ac0d', '#b7950b', '#c9a227'], roof: 'hut', rowStep: 8, lamps: false },
  chinese: { ground: T.STONE, road: T.COBBLE, plaza: T.STONE, walls: ['#f6ddcc', '#fdebd0', '#e8daef'], roofs: ['#b03a2e', '#1e8449', '#b9770e'], roof: 'pagoda', rowStep: 8, lamps: true, lantern: true },
  mink: { ground: null, road: T.DIRT, plaza: T.DIRT, walls: ['#a0785a', '#8d6e63'], roofs: ['#4e7d3a', '#6b8e23', '#556b2f'], roof: 'hut', rowStep: 8, lamps: true },
  giant: { ground: null, road: T.DIRT, plaza: T.STONE, walls: ['#8d6e63', '#795548'], roofs: ['#5d4037', '#3e2723'], roof: 'gable', rowStep: 14, lamps: false, big: true },
  ruins: { ground: null, road: T.GRAVEL, plaza: T.STONE, walls: ['#9e9e9e', '#bdbdbd', '#a1887f'], roofs: ['#757575'], roof: 'ruin', rowStep: 8, lamps: false },
};

const ROLE_SIZES = {
  tavern: [6, 4], inn: [5, 4], shop: [4, 3], weapons: [4, 3], dojo: [7, 5], doctor: [4, 3], shipwright: [7, 4],
  marine_base: [9, 6], bounty: [4, 3], house: [4, 3], hall: [8, 5], palace: [12, 8], church: [5, 5], bank: [5, 4],
  cafe: [5, 3], library: [6, 4], lighthouse: [3, 3], trainer: [5, 4], bar: [5, 4], market: [5, 3], restaurant: [6, 4],
};

export function generateTown(world, town, rng, noise) {
  const S = TOWN_STYLES[town.style] || TOWN_STYLES.village;
  const cx = town.x, cy = town.y;
  const w = Math.max(10, Math.round(town.w)), h = Math.max(8, Math.round(town.h));
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  const x1 = x0 + w, y1 = y0 + h;
  const roadTile = town.road ?? S.road;
  const groundTile = town.ground === undefined ? S.ground : town.ground;
  const plazaTile = town.plazaTile ?? S.plaza;
  const big = !!S.big;

  const okLand = (x, y) => {
    const t = world.type(x, y);
    return !IS_LIQUID[t] && WALKABLE[t] && !OVERLAY[t];
  };

  // ground
  if (groundTile != null) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!okLand(x, y)) continue;
      const ex = (x - cx) / (w / 2), ey = (y - cy) / (h / 2);
      const v = 1.08 - Math.max(Math.abs(ex), Math.abs(ey)) + noise.noise2(x * 0.2, y * 0.2) * 0.08;
      if (v > 0) world.setType(x, y, groundTile);
    }
  }

  // streets: horizontal rows + one main vertical street through the plaza
  const rowStep = town.rowStep ?? S.rowStep;
  const rows = [];
  for (let ry = y0 + rowStep - 1; ry < y1 - 1; ry += rowStep) rows.push(ry);
  if (!rows.length) rows.push(Math.round(cy));
  const mainX = Math.round(cx);
  for (const ry of rows) {
    for (let x = x0; x < x1; x++) for (let k = 0; k < 2; k++) if (okLand(x, ry + k)) world.setType(x, ry + k, roadTile);
  }
  for (let y = y0; y < y1; y++) for (let k = -1; k <= 0; k++) if (okLand(mainX + k, y)) world.setType(mainX + k, y, roadTile);

  // plaza
  const plazaR = town.plazaR ?? (w > 40 ? 5 : 3.5);
  const plazaRow = rows.reduce((a, b) => (Math.abs(b - cy) < Math.abs(a - cy) ? b : a), rows[0]);
  const plaza = { x: mainX, y: plazaRow + 1 };
  if (town.plaza !== false) {
    for (let y = Math.floor(plaza.y - plazaR); y <= plaza.y + plazaR; y++) for (let x = Math.floor(plaza.x - plazaR); x <= plaza.x + plazaR; x++) {
      if ((x + 0.5 - plaza.x) ** 2 + (y + 0.5 - plaza.y) ** 2 <= plazaR * plazaR && okLand(x, y)) world.setType(x, y, plazaTile);
    }
    const feature = town.plaza || (S.flags ? 'flagpole' : town.style === 'desert' ? 'well' : w > 30 ? 'fountain' : 'well');
    placeObject(world, { kind: feature, x: plaza.x, y: plaza.y + 0.8, block: true, fw: feature === 'platform' ? 3 : 1, fd: feature === 'platform' ? 2 : 1, town: town.id });
  }

  // walls around the town
  if (town.walls) {
    for (let x = x0 - 1; x <= x1; x++) for (const y of [y0 - 1, y1]) {
      if (Math.abs(x - mainX) <= 1) continue;
      if (okLand(x, y)) world.setType(x, y, T.WALL);
    }
    for (let y = y0 - 1; y <= y1; y++) for (const x of [x0 - 1, x1]) {
      if (rows.some((r) => y === r || y === r + 1)) continue;
      if (okLand(x, y)) world.setType(x, y, T.WALL);
    }
  }

  // candidate lots on the north side of each street
  const lots = [];
  for (const ry of rows) {
    const maxD = Math.max(2, Math.min(big ? 9 : 5, rowStep - 3));
    let x = x0 + 1;
    while (x < x1 - 3) {
      lots.push({ x, ry, maxD });
      x += 1;
    }
  }
  const buildings = [];
  const specials = (town.buildings || []).slice();
  const occupied = (fx0, fy0, fw, fd) => {
    for (let y = fy0 - 1; y < fy0 + fd; y++) for (let x = fx0 - 1; x < fx0 + fw + 1; x++) {
      if (y < fy0 && (x < fx0 || x >= fx0 + fw)) continue;
      const t = world.type(x, y);
      if (y >= fy0 && (!okLand(x, y) || world.isBlocked(x, y))) return true;
      if (y >= fy0 && (t === roadTile || t === plazaTile) && t !== groundTile) return true;
      if (world.isBlocked(x, y)) return true;
    }
    // keep off the main street
    if (fx0 <= mainX && fx0 + fw >= mainX - 1) return true;
    return false;
  };

  const tryPlace = (spec) => {
    const [dw, dd] = ROLE_SIZES[spec.role] || [rng.int(3, 5), rng.int(2, 3)];
    const fw = spec.w ?? (big ? dw + 3 : dw);
    // sort lots by distance to plaza for specials, random for houses
    const cands = spec.role !== 'house' ? lots.slice().sort((a, b) => Math.hypot(a.x - plaza.x, a.ry - plaza.y) - Math.hypot(b.x - plaza.x, b.ry - plaza.y)) : rng.shuffle(lots.slice());
    for (const lot of cands) {
      const fd = Math.min(spec.d ?? (big ? dd + 3 : dd), lot.maxD + (spec.d ? 2 : 0));
      const fx0 = lot.x, fy0 = lot.ry - fd;
      if (fx0 + fw > x1 - 1) continue;
      if (occupied(fx0, fy0, fw, fd)) continue;
      const colors = {
        wall: spec.wall || rng.pick(S.walls),
        roof: spec.roof || rng.pick(S.roofs),
      };
      const b = placeObject(world, {
        kind: 'building',
        style: spec.style || town.style || 'village',
        roofType: spec.roofType || S.roof,
        x: fx0 + fw / 2,
        y: lot.ry,
        fw, fd,
        hgt: spec.hgt ?? (S.tall ? rng.int(3, 4) : big ? 5 : spec.role === 'house' ? 2 : 3),
        ...colors,
        role: spec.role,
        name: spec.name,
        sign: spec.sign,
        npc: spec.npc,
        door: { x: fx0 + fw / 2, y: lot.ry + 0.5 },
        town: town.id,
        island: town.islandId,
        v: rng.int(0, 7),
        block: true,
      });
      buildings.push(b);
      return b;
    }
    return null;
  };

  for (const spec of specials) tryPlace(spec);
  const houseCount = town.houses ?? Math.round((w * h) / (big ? 160 : 55));
  for (let i = 0; i < houseCount; i++) tryPlace({ role: 'house' });

  // props along streets
  if (S.lamps) {
    for (const ry of rows) for (let x = x0 + 2; x < x1 - 1; x += 7) {
      if (okLand(x, ry + 2) && !world.isBlocked(x, ry + 2) && Math.abs(x - mainX) > 2) {
        placeObject(world, { kind: S.lantern ? 'lantern' : 'lamp', x: x + 0.5, y: ry + 3, block: true, light: true });
      }
    }
  }
  const propKinds = town.style === 'village' || town.style === 'tribal' ? ['barrel', 'crate', 'haystack'] : ['barrel', 'crate', 'barrel'];
  for (const b of buildings) {
    if (rng.next() < 0.4) {
      const px = b.x + (b.fw / 2 + 0.6) * (rng.next() < 0.5 ? -1 : 1), py = b.y - 0.2;
      if (okLand(px, py - 0.5) && !world.isBlocked(px, py - 0.5)) placeObject(world, { kind: rng.pick(propKinds), x: px, y: py, block: true, v: rng.int(0, 3) });
    }
  }
  if (S.fences) {
    // small fenced gardens behind village houses
    for (const b of buildings) {
      if (b.role !== 'house' || rng.next() < 0.5) continue;
      const gy = b.y - b.fd - 1;
      for (let x = Math.floor(b.x - b.fw / 2); x < b.x + b.fw / 2; x++) {
        if (okLand(x, gy) && !world.isBlocked(x, gy)) world.setType(x, gy, T.FARM);
      }
    }
  }
  if (town.stalls !== false && (town.style === 'town' || town.style === 'port' || town.style === 'desert' || town.style === 'city' || town.style === 'wano' || town.style === 'chinese')) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const px = plaza.x + Math.cos(a) * (plazaR + 1.5), py = plaza.y + Math.sin(a) * (plazaR + 1.2);
      if (okLand(px, py - 0.5) && !world.isBlocked(px, py - 0.5)) placeObject(world, { kind: 'stall', x: px, y: py, block: true, v: rng.int(0, 5) });
    }
  }

  // NPC standing spots: in front of doors and along the streets
  const npcSpots = [];
  for (const b of buildings) npcSpots.push({ x: b.door.x, y: b.door.y + 0.6, building: b });
  for (const ry of rows) for (let x = x0 + 3; x < x1 - 2; x += 5) if (okLand(x, ry + 1)) npcSpots.push({ x: x + 0.5, y: ry + 1.5 });

  return {
    id: town.id, name: town.name, x: plaza.x, y: plaza.y + 2, w, h, x0, y0, x1, y1,
    style: town.style, buildings, plaza, npcSpots, roadTile, rows, mainX, def: town,
  };
}
