// Paradise, second half — Water 7 → Sabaody Archipelago — plus the islands of
// the Calm Belts east of Reverse Mountain.
//
// Canon route (One Piece Wiki): Long Ring Long Land → Water 7 (Enies Lobby is
// reached by the Puffing Tom sea train, which also serves St. Poplar, San
// Faldo and Pucci) → the fog of the Florian Triangle, where Thriller Bark
// lurks → the Sabaody Archipelago, a mangrove forest at the foot of the Red
// Line with no magnetic field of its own. Marineford is "next door" to
// Sabaody; Enies Lobby, Impel Down and Marineford triangulate the Tarai
// Current through their Gates of Justice. The islands Bartholomew Kuma sent
// the Straw Hats to (Kuraigana, Boin, Momoiro, Karakuri, Namakura, Amazon
// Lily) lie off the route. Amazon Lily and Rusukaina (north-west of it) sit in
// a Calm Belt; the Great Prison Impel Down rises from the southern one.
import { T } from '../../world/tiles.js';

// ---------------------------------------------------------------- helpers
/** Absolute tile position of a relative (dx, dy) on an island. */
const at = (isl, dx, dy) => ({
  x: isl.x + (Math.abs(dx) <= 1.5 ? (dx * isl.w) / 2 : dx),
  y: isl.y + (Math.abs(dy) <= 1.5 ? (dy * isl.h) / 2 : dy),
});
/** A stand-alone building (outside any town) with a door you can use. */
function hut(isl, dx, dy, spec) {
  const p = at(isl, dx, dy);
  return { kind: 'building', dx, dy, fw: 6, fd: 4, hgt: 3, style: 'town', roofType: 'gable', showName: true, door: { x: p.x, y: p.y + 0.5 }, ...spec };
}
/** Sea-train track: painted over open water only (tile offsets from the island centre). */
const rail = (x0, x1, y0, y1) => ({ op: 'rect', x0, x1, y0, y1, tile: T.RAIL, onlyWater: true });
/** Walkable planks over water only. */
const planks = (x0, x1, y0, y1) => ({ op: 'rect', x0, x1, y0, y1, tile: T.BRIDGE, onlyWater: true });
/** A rope-and-plank bridge between two land blobs (points as fractions of the island). */
function span(isl, a, b, rx, ry) {
  const hw = isl.w / 2, hh = isl.h / 2;
  const ax = a[0] * hw, ay = a[1] * hh, bx = b[0] * hw, by = b[1] * hh;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const ux = dx / d, uy = dy / d;
  const r = 1 / Math.hypot(ux / (rx * hw), uy / (ry * hh)); // ellipse radius along the bridge
  const s = r - 4;
  return { op: 'path', points: [[(ax + ux * s) / hw, (ay + uy * s) / hh], [(bx - ux * s) / hw, (by - uy * s) / hh]], width: 3, tile: T.BRIDGE };
}

// ------------------------------------------------------------ geometry
const W7 = { x: 3300, y: 1000, w: 220, h: 160 };
const EL = { x: 3505, y: 1010, w: 110, h: 100 };
const TB = { x: 3675, y: 1010, w: 160, h: 130 };
const SB = { x: 3880, y: 1060, w: 180, h: 140 };
const MF = { x: 3880, y: 890, w: 150, h: 100 };
const KG = { x: 3610, y: 866, w: 76, h: 56 };
const IDN = { x: 3650, y: 1262, w: 64, h: 48 };
const RU = { x: 3380, y: 776, w: 80, h: 46 };
const SPA = { x: 3620, y: 1170, w: 56, h: 44 };
const BO = { x: 3385, y: 1165, w: 90, h: 70 };

// Sabaody's 79 Yarukiman Mangroves, grouped as the canon districts.
const GROVES = [
  { dx: -0.52, dy: 0.3 }, // Groves 1-9 (lawless; Human Auctioning House)
  { dx: -0.52, dy: -0.3 }, // Groves 10-29 (lawless; Shakky's bar on 13)
  { dx: 0, dy: -0.62 }, // Groves 30-39 (Sabaody Park)
  { dx: 0.52, dy: -0.3 }, // Groves 40-49 (tourist area)
  { dx: 0.52, dy: 0.3 }, // Groves 50-59 (shipping area)
  { dx: 0, dy: 0.62 }, // Groves 60-79 (Marine base, hotels)
];
const GR = [0.22, 0.24];

export const PARADISE_2 = [
  // ============================================================ WATER 7
  {
    id: 'water_7', name: 'Water 7', sea: 'paradise', ...W7,
    climate: 'temperate', rough: 0.14, ground: T.COBBLE, beach: T.STONE, archipelago: true,
    blobs: [[0, 0, 0.72, 0.8], [-0.8, 0.26, 0.16, 0.12], [0.86, 0.42, 0.12, 0.15]], // Shipbuilding Island, Rocky Cape, Scrap Island
    areas: [
      { name: 'Rocky Cape', tile: T.ROCK, dx: -0.82, dy: 0.26, rx: 0.1, ry: 0.1 },
      { name: 'Scrap Island', tile: T.GRAVEL, dx: 0.86, dy: 0.42, rx: 0.1, ry: 0.13, overBeach: true },
      { name: 'Uptown gardens', tile: T.LAWN, dx: -0.5, dy: -0.35, rx: 0.12, ry: 0.12 },
    ],
    paint: [
      // the canals of the City of Water (bulls pull boats along them)
      { op: 'grid', x0: -46, x1: 46, y0: -36, y1: 36, step: 23, width: 2, tile: T.CANAL, onlyLand: true },
      planks(-50, 50, -25, -23), planks(-50, 50, -2, 0), planks(-50, 50, 21, 23),
      planks(-35, -33, -40, 40), planks(-12, -10, -40, 40), planks(11, 13, -40, 40), planks(34, 36, -40, 40),
      // the large stone bridge to Scrap Island
      planks(60, 92, 30, 34),
      // the Puffing Tom's tracks (they dip under the waves here and there, so ships can cross)
      rail(60, 106, 4, 6), rail(114, 172, 4, 6), // → Enies Lobby (from Shift Station)
      rail(-66, -64, -128, -100), rail(-66, -64, -92, -62), rail(-66, -64, -54, -30), // → St. Poplar
      rail(46, 48, -128, -96), rail(46, 48, -88, -40), // → Pucci
      rail(-38, -36, 44, 86), rail(-38, -36, 94, 150), // → San Faldo
    ],
    towns: [
      {
        id: 'w7_main_street', name: 'Shipbuilding Island — Main Street', dx: 0, dy: -0.56, w: 72, h: 24, style: 'city', plaza: 'fountain',
        buildings: [
          { role: 'hall', name: 'Galley-La Company Headquarters', npc: 'p2_iceburg', w: 9, d: 5, hgt: 4, wall: '#f5e6c4', roof: '#8e4430' },
          { role: 'shipwright', name: 'Galley-La Dock 1', npc: 'p2_paulie', w: 8, d: 4 },
          { role: 'bank', name: 'Berry Cashing' },
        ],
      },
      {
        id: 'w7_downtown', name: 'Water 7 Downtown', dx: 0.05, dy: 0, w: 90, h: 66, style: 'city', plaza: 'fountain', houses: 10,
        buildings: [
          { role: 'hall', name: 'Blue Station', npc: 'p2_bushon', w: 7, d: 4, wall: '#e3f2fd', roof: '#1565c0' },
          { role: 'bar', name: "Blueno's Bar", npc: 'p2_blueno' },
          { role: 'inn', name: 'Chiza Hotel' },
          { role: 'market', name: 'Water 7 Market', shop: 'p2_w7_market' },
          { role: 'shop', name: 'Rental Bull Shop', shop: 'p2_bull_rental' },
        ],
      },
      {
        id: 'w7_back_street', name: 'Back Street', dx: 0.05, dy: 0.56, w: 66, h: 22, style: 'port', plaza: false,
        buildings: [
          { role: 'hall', name: 'Franky House', npc: 'p2_zambai', w: 7, d: 4, wall: '#ffb74d', roof: '#1565c0' },
          { role: 'doctor', name: 'Back Street Clinic' },
          { role: 'weapons', name: 'Shipwright Toolsmith' },
        ],
      },
    ],
    docks: [
      { dx: 0.02, dy: -0.66, dir: 'n', len: 7, name: 'Galley-La Dock 1' },
      { dx: -0.84, dy: 0.26, dir: 'w', len: 6, name: 'Rocky Cape' },
      { dx: 0.1, dy: 0.7, dir: 's', len: 6, name: 'Back Street Pier' },
    ],
    landmarks: [
      hut(W7, 0.6, -0.1, { role: 'hall', name: 'Shift Station', npc: 'p2_kokoro', fw: 6, fd: 3, style: 'port', wall: '#f5e6c4', roof: '#2e7d32' }),
      hut(W7, 0.86, 0.36, { role: 'shipwright', name: "Franky's Workshop (Scrap Island)", npc: 'p2_franky', fw: 7, fd: 4, style: 'port', wall: '#8d6e63', roof: '#455a64' }),
      { kind: 'shipwreck', dx: 0.8, dy: 0.5, name: 'A scrapped galleon' },
      { kind: 'shipwreck', dx: 0.93, dy: 0.47 },
      { kind: 'anchor', dx: 0.84, dy: 0.28 },
      { kind: 'sign', dx: -0.8, dy: 0.18, name: 'Rocky Cape', spot: 'rocky_cape' },
      { kind: 'lamp', dx: 0.52, dy: -0.02, light: true },
    ],
    spots: [
      { id: 'galley_la', dx: 0, dy: -0.6 },
      { id: 'scrap_island', dx: 0.86, dy: 0.46 },
      { id: 'aqua_laguna', dx: 0, dy: 1.25 },
    ],
    logNext: ['enies_lobby', 'thriller_bark'], logTime: 2, danger: 4, music: 'town',
    tagline: 'The City of Water — home of Galley-La, the finest shipwrights in the world.',
  },
  {
    id: 'st_poplar', name: 'St. Poplar', sea: 'paradise', x: 3232, y: 862, w: 64, h: 46, climate: 'spring', rough: 0.2,
    areas: [{ name: 'Poplar timber groves', tile: T.FOREST, dx: 0.45, dy: 0.2, rx: 0.2, ry: 0.3 }],
    towns: [{
      id: 'st_poplar_town', name: 'St. Poplar', dx: -0.05, dy: -0.08, w: 40, h: 26, style: 'town', dockDir: 'w', plaza: 'fountain',
      buildings: [
        { role: 'hall', name: 'Spring Queen Station', npc: 'p2_poplar_station' },
        { role: 'market', name: 'Poplar Timber Market', shop: 'p2_poplar_timber' },
        { role: 'shop', name: 'Back-Alley Dealer', npc: 'p2_poplar_dealer' },
        { role: 'inn', name: 'Spring Queen Inn' },
      ],
    }],
    spots: [{ id: 'poplar_harbor', dx: -0.5, dy: 0.4 }],
    logNext: ['water_7'], logTime: 1, danger: 4, tagline: 'The Town of the Spring Queen — one hour from Water 7 by sea train.',
  },
  {
    id: 'pucci', name: 'Pucci', sea: 'paradise', x: 3345, y: 862, w: 60, h: 44, climate: 'temperate', rough: 0.2,
    areas: [{ name: 'Orchards', tile: T.FARM, dx: -0.45, dy: 0.25, rx: 0.15, ry: 0.15 }],
    towns: [{
      id: 'pucci_town', name: 'Pucci', dx: 0.05, dy: -0.08, w: 38, h: 24, style: 'town', dockDir: 'e', plaza: 'fountain',
      buildings: [
        { role: 'hall', name: 'Pucci Station', npc: 'p2_pucci_station' },
        { role: 'restaurant', name: 'Gourmet Street Grill', npc: 'p2_pucci_chef' },
        { role: 'market', name: 'Pucci Food Market', shop: 'p2_pucci_food' },
        { role: 'inn', name: 'Gourmand Inn' },
      ],
    }],
    logNext: ['water_7'], logTime: 1, danger: 4, tagline: 'The Gourmet City. Every street smells of something delicious.',
  },
  {
    id: 'san_faldo', name: 'San Faldo', sea: 'paradise', x: 3260, y: 1160, w: 76, h: 52, climate: 'temperate', rough: 0.2,
    towns: [{
      id: 'san_faldo_town', name: 'San Faldo', dx: 0.02, dy: 0.06, w: 46, h: 28, style: 'city', dockDir: 's', plaza: 'platform',
      buildings: [
        { role: 'hall', name: 'San Faldo Station', npc: 'p2_faldo_station' },
        { role: 'shop', name: 'Carnival Mask Boutique' },
        { role: 'weapons', name: 'San Faldo Ironworks' },
        { role: 'bar', name: 'Masquerade Tavern', npc: 'p2_faldo_barkeep' },
      ],
    }],
    landmarks: [{ kind: 'lantern', dx: -0.4, dy: -0.1, light: true }, { kind: 'lantern', dx: 0.4, dy: -0.1, light: true }],
    logNext: ['water_7'], logTime: 1, danger: 4, tagline: 'The Carnival Town, where the festival never ends — and the iron for Water 7 is forged.',
  },

  // ======================================================== ENIES LOBBY
  {
    id: 'enies_lobby', name: 'Enies Lobby', sea: 'paradise', ...EL,
    climate: 'temperate', rough: 0.1, ground: T.STONE, beach: T.STONE, treeDensity: 0.01,
    blobs: [[0, 0, 0.8, 0.8]],
    paint: [
      { op: 'ring', x: 0, y: 0, r: 0.56, width: 5, tile: T.ABYSS }, // the Waterfall Ring: the island floats over a hole in the sea
      { op: 'rect', x0: -40, x1: -24, y0: -4, y1: 5, tile: T.STONE }, // Main Island Gate: the one bridge of land
      { op: 'rect', x0: 24, x1: 40, y0: -3, y1: 3, tile: T.BRIDGE }, // the courthouse drawbridge
      planks(40, 62, -2, 2), // the Bridge of Hesitation
      { op: 'circle', x: 67, y: 0, r: 5, tile: T.STONE }, // the landing before the Gates of Justice
    ],
    towns: [{
      id: 'enies_main', name: 'Enies Lobby Main Island', dx: 0.02, dy: 0.04, w: 40, h: 30, style: 'noble', dockDir: 'w', plaza: 'statue',
      buildings: [
        { role: 'hall', name: 'Enies Lobby Courthouse', npc: 'p2_baskerville', w: 8, d: 5, hgt: 4, wall: '#fdfefe', roof: '#1e8449' },
        { role: 'marine_base', name: 'Enies Lobby Garrison', wall: '#fdfefe', roof: '#1e8449' },
        { role: 'library', name: 'Judicial Archives' },
      ],
    }],
    landmarks: [
      hut(EL, -0.66, -0.34, { role: 'hall', name: 'Day Station', npc: 'p2_day_station', fw: 5, fd: 3, style: 'noble', wall: '#fdfefe', roof: '#1e8449' }),
      { kind: 'gate', dx: -0.6, dy: 0.02, name: 'Main Gate', spot: 'main_gate' },
      { kind: 'tower', dx: 0.74, dy: -0.16, name: 'Tower of Justice', spot: 'tower_of_justice' },
      { kind: 'gate', dx: 67, dy: 0, name: 'The Gates of Justice', spot: 'gates_of_justice' },
      { kind: 'flagpole', dx: 0.66, dy: 0.22, name: 'World Government flag' },
    ],
    spots: [
      { id: 'courtyard', dx: 0, dy: 0.22 },
      { id: 'bridge_of_hesitation', dx: 54, dy: 0 },
      { id: 'waterfall', dx: -0.1, dy: -0.62 },
      { id: 'whirlpools', dx: 82, dy: 22 },
    ],
    logNext: ['thriller_bark'], logTime: 1, danger: 5, music: 'battle',
    tagline: 'The Judicial Island, where the sun never sets — and no criminal has ever been found innocent.',
  },

  // ================================================ THRILLER BARK (Florian Triangle)
  {
    id: 'thriller_bark', name: 'Thriller Bark', sea: 'paradise', ...TB,
    climate: 'gloom', rough: 0.12, fog: { r: 120, density: 0.85 },
    blobs: [[0, 0, 0.9, 0.85]],
    areas: [
      { name: 'The Dead Forest', tile: T.FOREST, dx: -0.55, dy: 0.05, rx: 0.3, ry: 0.55 },
      { name: 'Thriller Bark Graveyard', tile: T.GRAVEL, dx: 0.55, dy: 0.3, rx: 0.2, ry: 0.22 },
      { name: 'Mansion grounds', tile: T.COBBLE, dx: 0, dy: 0, rx: 0.3, ry: 0.36 },
      { name: "Perona's Wonder Garden", tile: T.FLOWERS, dx: 0.12, dy: -0.26, rx: 0.08, ry: 0.07 },
    ],
    forestTrees: ['spooky', 'dead'], treeDensity: 0.04,
    paint: [
      { op: 'ring', x: 0, y: 0, r: 0.44, width: 3, tile: T.POND }, // the moat
      { op: 'ring', x: 0, y: 0, r: 0.38, width: 2, tile: T.WALL }, // the old inner wall
      { op: 'rect', x0: -3, x1: 3, y0: 28, y1: 33, tile: T.COBBLE }, planks(-3, 3, 32, 38), // south gate
      { op: 'rect', x0: -3, x1: 3, y0: -32, y1: -28, tile: T.COBBLE }, planks(-3, 3, -38, -32), // north gate
    ],
    landmarks: [
      hut(TB, 0, -0.06, { role: 'palace', name: 'Mast Mansion', npc: 'p2_moria', fw: 12, fd: 7, hgt: 5, style: 'spooky', wall: '#4a4a5a', roof: '#1c2833' }),
      hut(TB, -0.2, 0.22, { role: 'hall', name: 'Thriller Bark Mansion', npc: 'p2_hogback', fw: 9, fd: 5, hgt: 4, style: 'spooky', wall: '#5b4a6b', roof: '#2c2c3a' }),
      { kind: 'grave', dx: 0.5, dy: 0.25 }, { kind: 'grave', dx: 0.58, dy: 0.32 }, { kind: 'grave', dx: 0.5, dy: 0.4 },
      { kind: 'grave', dx: 0.63, dy: 0.22 }, { kind: 'grave', dx: 0.44, dy: 0.34 }, { kind: 'skull', dx: 0.62, dy: 0.4 },
      { kind: 'tent', dx: -0.64, dy: 0.08 }, { kind: 'campfire', dx: -0.58, dy: 0.13, spot: 'victims_camp' },
      { kind: 'gate', dx: 0.02, dy: 0.72, name: 'The Mouth Gate' },
      { kind: 'lantern', dx: -0.06, dy: 0.5, light: true }, { kind: 'lantern', dx: 0.08, dy: 0.5, light: true },
      { kind: 'shipwreck', dx: -1.2, dy: -0.9, name: 'A ghost ship adrift in the fog', spot: 'ghost_ship' },
    ],
    spots: [
      { id: 'wonder_garden', dx: 0.12, dy: -0.26 }, { id: 'graveyard', dx: 0.55, dy: 0.3 },
      { id: 'oars_freezer', dx: -0.14, dy: -0.3 }, { id: 'mast_hall', dx: 0, dy: 0.04 },
      { id: 'dead_forest', dx: -0.55, dy: -0.15 }, { id: 'mouth_gate', dx: 0.12, dy: 0.66 },
    ],
    docks: [{ dx: 0.14, dy: 0.62, dir: 's', len: 6, name: 'The Mouth Gate' }],
    logNext: ['sabaody', 'spa_island'], logTime: 1, danger: 6, music: 'night',
    tagline: 'The world\'s largest ship, lost in the fog of the Florian Triangle. Something here steals shadows.',
  },
  {
    id: 'spa_island', name: 'Spa Island', sea: 'paradise', ...SPA, climate: 'tropical', rough: 0.25,
    lakes: [{ dx: 0.3, dy: -0.25, rx: 0.14, ry: 0.16, tile: T.POND }],
    towns: [{
      id: 'spa_resort', name: 'Spa Island Resort', dx: -0.12, dy: 0.12, w: 30, h: 20, style: 'town', dockDir: 's',
      buildings: [
        { role: 'inn', name: 'Spa Island Hot Springs', npc: 'p2_spa_manager' },
        { role: 'cafe', name: 'Seaside Resort Café' },
        { role: 'shop', name: 'Spa Souvenir Shop' },
      ],
    }],
    landmarks: [{ kind: 'sign', dx: 0.3, dy: 0.05, name: 'Hot springs — open all night!', spot: 'hot_springs' }],
    logNext: ['sabaody'], logTime: 1, danger: 4, tagline: 'A hot-spring resort island. (Anime tale.)',
  },

  // ===================================================== SABAODY ARCHIPELAGO
  {
    id: 'sabaody', name: 'Sabaody Archipelago', sea: 'paradise', ...SB,
    climate: 'mangrove', rough: 0.22, archipelago: true,
    blobs: GROVES.map((g) => [g.dx, g.dy, GR[0], GR[1]]),
    areas: GROVES.map((g) => ({ tile: T.FOREST, dx: g.dx * 1.3, dy: g.dy * 1.3, rx: 0.07, ry: 0.07 })),
    forestTrees: ['jungle'], treeDensity: 0.02,
    paint: GROVES.map((g, i) => span(SB, [g.dx, g.dy], [GROVES[(i + 1) % GROVES.length].dx, GROVES[(i + 1) % GROVES.length].dy], GR[0], GR[1])),
    towns: [
      {
        id: 'sabaody_grove1', name: 'Grove 1', dx: GROVES[0].dx, dy: GROVES[0].dy, w: 30, h: 22, style: 'port', dockDir: 'sw', plaza: false,
        buildings: [
          { role: 'hall', name: 'Human Auctioning House', npc: 'p2_disco', w: 9, d: 5, hgt: 4, wall: '#f5e6c4', roof: '#6d4c41' },
          { role: 'shop', name: 'Grove 1 Curio Shop' },
        ],
      },
      {
        id: 'sabaody_grove13', name: 'Grove 13', dx: GROVES[1].dx, dy: GROVES[1].dy, w: 30, h: 22, style: 'port', dockDir: 'nw', plaza: false,
        buildings: [
          { role: 'bar', name: "Shakky's Rip-off Bar", npc: 'p2_shakky', wall: '#fff3e0', roof: '#5d4037' },
          { role: 'bounty', name: 'Grove 17 Bounty Board' },
          { role: 'inn', name: 'Grove 13 Lodging' },
        ],
      },
      {
        id: 'sabaody_grove41', name: 'Grove 41', dx: GROVES[3].dx, dy: GROVES[3].dy, w: 30, h: 22, style: 'town', dockDir: 'ne', plaza: 'fountain',
        buildings: [
          { role: 'restaurant', name: 'Takoyaki Hachi', npc: 'p2_hatchan' },
          { role: 'shop', name: 'Sabaody Souvenir Stands' },
          { role: 'inn', name: 'Bubble Hotel' },
          { role: 'doctor', name: 'Grove 44 Clinic' },
        ],
      },
      {
        id: 'sabaody_shipyards', name: 'Groves 50-59 (Shipyards)', dx: GROVES[4].dx, dy: GROVES[4].dy, w: 30, h: 22, style: 'port', dockDir: 'se', plaza: false,
        buildings: [
          { role: 'shipwright', name: 'Coating Mechanic', npc: 'p2_coater' },
          { role: 'shop', name: 'Sabaody Ship Chandler', shop: 'p2_sabaody_chandler' },
        ],
      },
    ],
    docks: [
      { near: 'sabaody_shipyards', dir: 'se', name: 'Grove 50 Shipyards' },
      { near: 'sabaody_grove41', dir: 'ne', name: 'Grove 41 Harbour' },
      { near: 'sabaody_grove13', dir: 'nw', name: 'Grove 13 Landing' },
      { near: 'sabaody_grove1', dir: 'sw', name: 'Grove 1 Landing' },
    ],
    landmarks: [
      { kind: 'wheel', dx: 0, dy: -0.7, name: 'Sabaody Park Ferris Wheel', spot: 'sabaody_park' },
      hut(SB, -0.07, 0.6, { role: 'marine_base', name: 'Grove 66 Marine Base', fw: 8, fd: 5, style: 'marine', wall: '#fdfefe', roof: '#1b4f72' }),
      hut(SB, 0.1, 0.7, { role: 'inn', name: 'Grove 72 Hotel', fw: 6, fd: 4, style: 'town', wall: '#e1f5fe', roof: '#0277bd' }),
      { kind: 'sign', dx: -0.4, dy: 0.2, name: 'Grove 1' }, { kind: 'sign', dx: -0.4, dy: -0.4, name: 'Grove 13' },
      { kind: 'sign', dx: 0.1, dy: -0.52, name: 'Grove 33 — Sabaody Park' }, { kind: 'sign', dx: 0.4, dy: -0.42, name: 'Grove 41' },
      { kind: 'sign', dx: 0.4, dy: 0.42, name: 'Grove 50' }, { kind: 'sign', dx: -0.12, dy: 0.52, name: 'Grove 66' },
      ...[[-0.62, 0.42], [-0.44, 0.16], [-0.62, -0.18], [-0.4, -0.36], [-0.1, -0.56], [0.12, -0.72], [0.4, -0.18], [0.62, -0.4], [0.62, 0.18], [0.42, 0.4], [-0.1, 0.72], [0.12, 0.54]]
        .map(([dx, dy]) => ({ kind: 'bubble', dx, dy, block: false })),
    ],
    spots: [
      { id: 'fishman_dive', dx: 115, dy: 0 },
      { id: 'grove_1', dx: -0.52, dy: 0.4 }, { id: 'grove_13', dx: -0.52, dy: -0.22 },
      { id: 'grove_41', dx: 0.52, dy: -0.22 }, { id: 'grove_50', dx: 0.52, dy: 0.4 },
      { id: 'grove_66', dx: 0, dy: 0.55 }, { id: 'kizaru_arrival', dx: -0.36, dy: 0.44 },
    ],
    logNext: [], logTime: 1, danger: 6, music: 'town',
    tagline: 'Seventy-nine giant mangroves at the foot of the Red Line. Bubbles, bounty hunters — and Celestial Dragons.',
  },

  // ========================================================== MARINEFORD
  {
    id: 'marineford', name: 'Marineford', sea: 'paradise', ...MF, climate: 'temperate', rough: 0.14,
    blobs: [[0, -0.12, 0.9, 0.72]],
    lakes: [{ dx: 0, dy: 0.5, rx: 0.34, ry: 0.36, tile: T.SEA }], // the bay that opens onto Oris Plaza
    areas: [
      { name: 'Oris Plaza', tile: T.STONE, dx: 0, dy: 0.1, rx: 0.32, ry: 0.13 },
      { name: 'HQ grounds', tile: T.STONE, dx: 0, dy: -0.45, rx: 0.5, ry: 0.28 },
    ],
    towns: [
      {
        id: 'marine_hq', name: 'Marine Headquarters', dx: 0, dy: -0.5, w: 64, h: 26, style: 'marine', walls: true, dockDir: 'n', plaza: 'flagpole',
        buildings: [
          { role: 'marine_base', name: 'Marine Headquarters', npc: 'p2_sengoku', w: 12, d: 6, hgt: 5 },
          { role: 'dojo', name: 'Marine Drill Hall', npc: 'p2_hq_instructor', trainer: 'marine_instructor' },
          { role: 'marine_base', name: 'Enlistment Office', npc: 'p2_hq_recruiter' },
          { role: 'doctor', name: 'HQ Infirmary' },
          { role: 'weapons', name: 'Marine Armory', shop: 'p2_marine_armory' },
        ],
      },
      {
        id: 'marineford_town', name: 'Marineford Town', dx: -0.6, dy: 0.02, w: 34, h: 22, style: 'town', dockDir: 'w',
        buildings: [
          { role: 'inn', name: 'Marineford Inn' },
          { role: 'shop', name: 'Marineford General Store' },
          { role: 'bounty', name: 'Marineford Bounty Office' },
        ],
      },
    ],
    docks: [{ near: 'marine_hq', dir: 'n', name: 'Marine HQ Docks' }, { near: 'marineford_town', dir: 'w', name: 'Marineford Town Pier' }],
    landmarks: [
      { kind: 'platform', dx: 0, dy: 0.04, name: 'The Execution Platform', spot: 'execution_platform', fw: 3, fd: 2 },
      { kind: 'ruins', dx: 0.26, dy: 0.12, name: "The great fissure left by Whitebeard's quake" },
      { kind: 'cannon', dx: -0.24, dy: 0.2 }, { kind: 'cannon', dx: 0.24, dy: 0.2 }, { kind: 'cannon', dx: -0.4, dy: 0.34 }, { kind: 'cannon', dx: 0.4, dy: 0.34 },
      { kind: 'gate', dx: 0.45, dy: 0.96, name: "Marineford's Gate of Justice", spot: 'mf_gate_of_justice' },
    ],
    spots: [{ id: 'oris_plaza', dx: 0, dy: 0.15 }, { id: 'mf_bay', dx: 0, dy: 0.5 }, { id: 'admirals_hall', dx: 0.12, dy: -0.26 }],
    logNext: ['sabaody'], logTime: 1, danger: 8, music: 'battle',
    tagline: 'Marine Headquarters. The fortress of Absolute Justice, next door to Sabaody and the Holy Land.',
  },

  // ============================================ the islands Kuma sent them to
  {
    id: 'kuraigana', name: 'Kuraigana Island', sea: 'paradise', ...KG, climate: 'gloom', rough: 0.28, fog: { r: 55, density: 0.55 },
    areas: [
      { name: 'Ruins of the Shikkearu Kingdom', tile: T.GRAVEL, dx: 0.1, dy: 0.22, rx: 0.35, ry: 0.28 },
      { name: 'Humandrill woods', tile: T.FOREST, dx: -0.45, dy: -0.05, rx: 0.3, ry: 0.45 },
    ],
    forestTrees: ['spooky', 'dead'],
    landmarks: [
      hut(KG, 0.38, -0.3, { role: 'palace', name: "Mihawk's Castle", npc: 'mihawk', fw: 10, fd: 6, hgt: 5, style: 'spooky', wall: '#4a4a5a', roof: '#1c2833' }),
      { kind: 'ruins', dx: 0.05, dy: 0.2 }, { kind: 'ruins', dx: 0.25, dy: 0.3 }, { kind: 'ruins', dx: -0.1, dy: 0.35 },
      { kind: 'grave', dx: 0.35, dy: 0.12 }, { kind: 'bones', dx: -0.3, dy: 0.25 },
    ],
    spots: [{ id: 'humandrill_woods', dx: -0.45, dy: 0 }, { id: 'castle_gate', dx: 0.38, dy: -0.1 }, { id: 'shikkearu_ruins', dx: 0.12, dy: 0.26 }],
    docks: [{ dx: 0.1, dy: 0.5, dir: 's', len: 5, name: 'Kuraigana Landing' }],
    logNext: ['sabaody'], logTime: 1, danger: 7, music: 'night',
    tagline: 'The ruins of a war-torn kingdom, where baboons learned to fight by watching men — and the world\'s greatest swordsman lives.',
  },
  {
    id: 'namakura', name: 'Namakura Island', sea: 'paradise', x: 3725, y: 862, w: 56, h: 44, climate: 'tropical', rough: 0.3,
    towns: [{
      id: 'namakura_village', name: 'Namakura Village', dx: 0, dy: 0.05, w: 30, h: 20, style: 'tribal', dockDir: 'n', plaza: 'platform',
      buildings: [{ role: 'hall', name: "Village Elder's Hut", npc: 'p2_namakura_elder' }, { role: 'market', name: 'Namakura Market' }],
    }],
    landmarks: [{ kind: 'totem', dx: -0.4, dy: 0.2 }, { kind: 'totem', dx: 0.4, dy: 0.25 }],
    logNext: ['sabaody'], logTime: 1, danger: 5, tagline: 'An island of tall tales, where a talking skeleton was once mistaken for the devil.',
  },
  {
    id: 'karakuri', name: 'Karakuri Island', sea: 'paradise', x: 3520, y: 1150, w: 80, h: 70, climate: 'winter', rough: 0.25,
    towns: [{
      id: 'baldimore', name: 'Future Land Baldimore', dx: 0.05, dy: 0.05, w: 40, h: 26, style: 'future', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'library', name: "Vegapunk's Old Laboratory" },
        { role: 'shipwright', name: 'Baldimore Workshop', npc: 'p2_baldimore_inventor' },
        { role: 'shop', name: 'Karakuri Parts Shop', shop: 'p2_karakuri_parts' },
        { role: 'inn', name: 'Baldimore Inn' },
      ],
    }],
    landmarks: [{ kind: 'crystal', dx: -0.45, dy: -0.3 }, { kind: 'crystal', dx: -0.38, dy: -0.36 }],
    logNext: ['sabaody'], logTime: 1, danger: 5, tagline: 'A snowbound island of inventors — Dr. Vegapunk\'s birthplace of ideas.',
  },
  {
    id: 'boin', name: 'Boin Archipelago', sea: 'paradise', ...BO, climate: 'jungle', rough: 0.3, archipelago: true,
    blobs: [[-0.35, -0.05, 0.5, 0.62], [0.45, -0.25, 0.38, 0.45], [0.4, 0.58, 0.24, 0.26]],
    landmarks: [
      { kind: 'tent', dx: -0.45, dy: 0.1 }, { kind: 'campfire', dx: -0.38, dy: 0.16, spot: 'heracles_camp' },
      { kind: 'bones', dx: 0.45, dy: -0.2 }, { kind: 'mushroom', dx: -0.2, dy: -0.35 }, { kind: 'mushroom', dx: 0.5, dy: -0.4 },
    ],
    spots: [{ id: 'boin_depths', dx: 0.45, dy: -0.25 }],
    docks: [{ dx: -0.4, dy: 0.2, dir: 'sw', len: 5, name: 'Boin Landing' }],
    logNext: ['sabaody'], logTime: 1, danger: 6, tagline: 'A jungle of monstrous plants and insects. Only a Forest Scholar calls it home.',
  },
  {
    id: 'momoiro', name: 'Momoiro Island', sea: 'paradise', x: 3715, y: 1165, w: 76, h: 64, climate: 'sakura', rough: 0.22,
    areas: [{ name: 'Pink meadows', tile: T.FLOWERS, dx: -0.4, dy: -0.35, rx: 0.25, ry: 0.2 }],
    towns: [{
      id: 'kamabakka', name: 'Kamabakka Kingdom', dx: 0.02, dy: 0.05, w: 46, h: 30, style: 'candy', dockDir: 'w', plaza: 'fountain',
      buildings: [
        { role: 'palace', name: 'Kamabakka Palace' },
        { role: 'dojo', name: 'Newkama Kenpo Dojo', npc: 'p2_kamabakka_master', trainer: 'p2_kamabakka' },
        { role: 'restaurant', name: 'Attack Cuisine Kitchen', npc: 'p2_kamabakka_chef' },
        { role: 'shop', name: 'Kamabakka Boutique' },
        { role: 'inn', name: 'Pink Palace Inn' },
      ],
    }],
    logNext: ['sabaody'], logTime: 1, danger: 5, tagline: 'Momoiro Island, the Kamabakka Kingdom. Everything is pink. Everyone is fabulous.',
  },

  // =========================================================== CALM BELT
  {
    id: 'rusukaina', name: 'Rusukaina', sea: 'calm_belt', ...RU, climate: 'jungle', rough: 0.3,
    areas: [
      { name: 'Winter slopes', tile: T.SNOW, dx: -0.42, dy: -0.35, rx: 0.3, ry: 0.35 },
      { name: 'Beast plains', tile: T.GRASS, dx: 0.35, dy: 0.2, rx: 0.3, ry: 0.3 },
    ],
    landmarks: [
      { kind: 'tent', dx: 0.08, dy: 0.08 }, { kind: 'campfire', dx: 0.14, dy: 0.14, spot: 'rayleigh_camp' },
      { kind: 'bones', dx: -0.2, dy: 0.2 }, { kind: 'bones', dx: 0.42, dy: -0.1 },
    ],
    spots: [{ id: 'beast_plains', dx: 0.35, dy: 0.2 }],
    docks: [{ dx: 0.1, dy: 0.4, dir: 's', len: 5, name: 'Rusukaina Shore' }],
    danger: 7, tagline: 'A Calm Belt island of savage beasts, north-west of Amazon Lily. A fine place to train for two years.',
  },
  {
    id: 'amazon_lily', name: 'Amazon Lily', sea: 'calm_belt', x: 3560, y: 784, w: 130, h: 56, climate: 'jungle', rough: 0.18,
    blobs: [[0, 0, 0.95, 0.9]],
    mountains: [{ name: 'Western cliffs', dx: -0.8, dy: -0.1, r: 0.1, h: 0.8 }, { name: 'Eastern cliffs', dx: 0.8, dy: -0.1, r: 0.1, h: 0.8 }],
    towns: [{
      id: 'kuja_village', name: 'Kuja Village', dx: 0, dy: 0.02, w: 72, h: 30, style: 'tribal', dockDir: 's', plaza: 'statue',
      buildings: [
        { role: 'palace', name: 'Kuja Castle', npc: 'p2_hancock', roofType: 'gable', wall: '#f8bbd0', roof: '#ad1457' },
        { role: 'dojo', name: 'Kuja Training Grounds', npc: 'p2_marguerite', trainer: 'kuja' },
        { role: 'hall', name: "Elder Nyon's Hut", npc: 'p2_nyon' },
        { role: 'market', name: 'Kuja Market', shop: 'p2_kuja_market' },
        { role: 'doctor', name: 'Kuja Healers' },
        { role: 'inn', name: 'Kuja Guest Hut' },
      ],
    }],
    landmarks: [
      { kind: 'totem', dx: -0.45, dy: 0.1 }, { kind: 'totem', dx: 0.45, dy: 0.1 },
      { kind: 'boat', dx: 0.32, dy: 1.25, name: 'Perfume Yuda, flagship of the Kuja Pirates' },
    ],
    spots: [{ id: 'kuja_arena', dx: -0.42, dy: -0.28 }, { id: 'perfume_yuda', dx: 0.3, dy: 1.3 }],
    danger: 7, tagline: 'The Island of Women, home of the Kuja. Men are forbidden — on pain of death.',
  },
  {
    id: 'impel_down', name: 'Impel Down', sea: 'calm_belt', ...IDN, climate: 'rocky', rough: 0.12, ground: T.STONE, beach: T.ROCK, treeDensity: 0,
    blobs: [[0, 0, 0.8, 0.75]],
    landmarks: [
      { kind: 'tower', dx: -0.3, dy: -0.12, name: 'Impel Down' }, { kind: 'tower', dx: 0.3, dy: -0.12 },
      { kind: 'gate', dx: 0, dy: -0.34, name: 'The Great Gate of Impel Down', spot: 'surface_gate' },
      hut(IDN, 0, 0.22, { role: 'hall', name: 'Impel Down Gatehouse', npc: 'p2_id_gate_officer', fw: 6, fd: 4, style: 'marine', wall: '#78909c', roof: '#37474f' }),
      { kind: 'gate', dx: 0, dy: -48, name: "Impel Down's Gate of Justice", spot: 'id_gate_of_justice' },
    ],
    docks: [{ dx: 0.12, dy: -0.5, dir: 'n', len: 6, name: 'Impel Down Main Gate' }],
    danger: 9, music: 'night', tagline: 'The Great Underwater Prison. Six levels of hell beneath the Calm Belt.',
  },
];
