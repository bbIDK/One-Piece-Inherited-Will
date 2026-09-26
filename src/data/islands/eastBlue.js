// East Blue — the "weakest sea", top-right quadrant. Canon route of the
// Straw Hats runs east → west toward Reverse Mountain: Dawn Island, Shells
// Town, Orange Town, Syrup Village, the Baratie, the Conomi Islands, Loguetown.
import { T } from '../../world/tiles.js';

export const EAST_BLUE = [
  {
    id: 'dawn_island', name: 'Dawn Island', sea: 'east_blue', x: 3790, y: 300, w: 210, h: 140,
    climate: 'temperate', rough: 0.22,
    blobs: [[0, 0, 0.85, 0.8], [-0.55, 0.3, 0.45, 0.45], [0.55, -0.2, 0.5, 0.55]],
    mountains: [{ name: 'Mt. Colubo', dx: 0.05, dy: -0.15, r: 0.28, h: 0.9 }],
    areas: [
      { name: 'Mt. Colubo woods', tile: T.FOREST, dx: 0.0, dy: -0.05, rx: 0.45, ry: 0.5 },
      { name: 'Gray Terminal', tile: T.GRAVEL, dx: 0.42, dy: 0.35, rx: 0.16, ry: 0.14 },
      { tile: T.FARM, dx: -0.6, dy: 0.2, rx: 0.12, ry: 0.1 },
    ],
    rivers: [{ points: [[0.05, -0.1], [-0.2, 0.3], [-0.3, 0.9]], width: 2.5 }],
    towns: [
      {
        id: 'foosha', name: 'Foosha Village', dx: -0.62, dy: 0.42, w: 34, h: 22, style: 'village', dockDir: 's', plaza: 'well',
        buildings: [
          { role: 'bar', name: "Party's Bar", npc: 'makino' },
          { role: 'house', name: "Mayor Woop Slap's House", npc: 'woop_slap' },
          { role: 'shop', name: 'Foosha General Store' },
        ],
      },
      {
        id: 'goa', name: 'Goa Kingdom', dx: 0.55, dy: -0.12, w: 52, h: 40, style: 'noble', walls: true, dockDir: 'e', plaza: 'fountain',
        buildings: [
          { role: 'palace', name: 'Goa Palace' },
          { role: 'weapons', name: 'High Town Armory' },
          { role: 'bank', name: 'Goa Treasury' },
          { role: 'marine_base', name: 'Goa Marine Garrison' },
        ],
      },
    ],
    landmarks: [
      { kind: 'windmill', dx: -0.78, dy: 0.3 },
      { kind: 'windmill', dx: -0.5, dy: 0.3 },
      { kind: 'tent', dx: 0.02, dy: 0.1, v: 0, spot: 'dadan_hideout' },
      { kind: 'campfire', dx: 0.06, dy: 0.13 },
    ],
    spots: [{ id: 'colubo_summit', dx: 0.05, dy: -0.35 }],
    danger: 1,
  },
  {
    id: 'goat_island', name: 'Goat Island', sea: 'east_blue', x: 3625, y: 440, w: 44, h: 36, climate: 'tropical', rough: 0.35,
    landmarks: [{ kind: 'tent', dx: 0, dy: 0.1, v: 1 }, { kind: 'campfire', dx: 0.2, dy: 0.2 }, { kind: 'cannon', dx: -0.3, dy: 0.4 }],
    danger: 1,
  },
  {
    id: 'shells_island', name: 'Yotsuba Island', sea: 'east_blue', x: 3450, y: 265, w: 120, h: 90, climate: 'temperate', rough: 0.25,
    blobs: [[0, 0, 0.8, 0.8], [-0.5, -0.5, 0.35, 0.35], [0.5, -0.5, 0.35, 0.35], [0.5, 0.5, 0.35, 0.35]],
    towns: [
      {
        id: 'shells_town', name: 'Shells Town', dx: 0.0, dy: 0.25, w: 46, h: 30, style: 'town', dockDir: 's', plaza: 'fountain',
        buildings: [
          { role: 'restaurant', name: "Rika's Family Restaurant", npc: 'ririka' },
          { role: 'shop', name: 'Shells Town Market' },
          { role: 'inn', name: 'Seagull Inn' },
          { role: 'weapons', name: 'Blacksmith' },
        ],
      },
      {
        id: 'marine_153', name: 'Marine Base 153rd Branch', dx: 0.05, dy: -0.35, w: 34, h: 24, style: 'marine', walls: true, dockDir: 'n', plaza: 'flagpole',
        buildings: [{ role: 'marine_base', name: '153rd Branch HQ', npc: 'morgan', w: 10, d: 6, hgt: 4 }],
        houses: 2,
      },
    ],
    landmarks: [{ kind: 'statue', dx: 0.06, dy: -0.12, name: 'Statue of Captain Morgan' }],
    spots: [{ id: 'execution_yard', dx: -0.18, dy: -0.28 }],
    danger: 1,
  },
  {
    id: 'shimotsuki', name: 'Shimotsuki Village', sea: 'east_blue', x: 3570, y: 130, w: 100, h: 78, climate: 'sakura', rough: 0.25,
    areas: [{ tile: T.FARM, dx: -0.4, dy: 0.25, rx: 0.3, ry: 0.2, name: 'Rice paddies' }, { tile: T.FOREST, dx: 0.4, dy: -0.3, rx: 0.35, ry: 0.3 }],
    towns: [
      {
        id: 'shimotsuki_village', name: 'Shimotsuki Village', dx: 0.05, dy: 0.1, w: 36, h: 24, style: 'wano', dockDir: 's', plaza: 'well',
        buildings: [
          { role: 'dojo', name: 'Isshin Dojo', npc: 'koshiro' },
          { role: 'weapons', name: 'Shimotsuki Swordsmith' },
          { role: 'shop', name: 'Village Store' },
        ],
      },
    ],
    landmarks: [{ kind: 'grave', dx: 0.35, dy: 0.05, name: "Kuina's grave" }, { kind: 'torii', dx: 0.3, dy: -0.1 }],
    danger: 1,
  },
  {
    id: 'organ_islands', name: 'Organ Islands', sea: 'east_blue', x: 3240, y: 350, w: 125, h: 90, climate: 'temperate', rough: 0.3,
    archipelago: true,
    blobs: [[0, 0, 0.7, 0.75], [0.75, 0.45, 0.25, 0.25], [-0.75, -0.5, 0.2, 0.2]],
    towns: [
      {
        id: 'orange_town', name: 'Orange Town', dx: 0.0, dy: 0.1, w: 44, h: 32, style: 'town', dockDir: 'w', plaza: 'fountain',
        buildings: [
          { role: 'shop', name: 'Pet Food Shop', npc: 'chouchou' },
          { role: 'bar', name: 'Buggy Pirates HQ (Tavern)', npc: 'buggy' },
          { role: 'doctor', name: 'Town Clinic', npc: 'boodle' },
          { role: 'inn', name: 'Orange Inn' },
        ],
      },
    ],
    danger: 1,
  },
  {
    id: 'rare_animals', name: 'Island of Rare Animals', sea: 'east_blue', x: 3085, y: 235, w: 48, h: 42, climate: 'jungle', rough: 0.35,
    landmarks: [{ kind: 'chest', dx: 0.1, dy: -0.2, name: "Gaimon's treasure box", spot: 'gaimon' }],
    danger: 1,
  },
  {
    id: 'gecko_islands', name: 'Gecko Islands', sea: 'east_blue', x: 3010, y: 475, w: 145, h: 110, climate: 'temperate', rough: 0.25,
    mountains: [{ dx: 0.3, dy: -0.25, r: 0.25, h: 0.5, name: 'Mansion hill' }],
    areas: [{ tile: T.FOREST, dx: -0.3, dy: -0.3, rx: 0.35, ry: 0.35 }, { tile: T.FARM, dx: 0.1, dy: 0.35, rx: 0.2, ry: 0.12 }],
    towns: [
      {
        id: 'syrup_village', name: 'Syrup Village', dx: -0.05, dy: 0.15, w: 36, h: 24, style: 'village', dockDir: 's', plaza: 'well',
        buildings: [
          { role: 'shop', name: 'Syrup General Store' },
          { role: 'doctor', name: 'Village Doctor' },
          { role: 'bar', name: 'Meat Tavern' },
        ],
      },
      {
        id: 'kaya_mansion', name: "Kaya's Mansion", dx: 0.3, dy: -0.28, w: 24, h: 18, style: 'noble', dockDir: 'e', plaza: 'fountain',
        buildings: [{ role: 'palace', name: "Kaya's Mansion", npc: 'kaya', w: 10, d: 6, hgt: 3 }, { role: 'shipwright', name: "Merry's Boathouse", npc: 'merry' }],
        houses: 0,
      },
    ],
    landmarks: [{ kind: 'sign', dx: -0.4, dy: 0.35, spot: 'north_slope' }, { kind: 'dummy', dx: -0.25, dy: -0.02, spot: 'usopp_target' }],
    danger: 1,
  },
  {
    // The Baratie — a fish-shaped floating restaurant. Built as a wooden
    // "island" of decking over the sea.
    id: 'baratie', name: 'Baratie', sea: 'east_blue', x: 2850, y: 570, w: 20, h: 14, climate: 'temperate',
    ground: T.PLANK, beach: T.PLANK, rough: 0.0, elevRate: 0, noiseScale: 0.01, beachWidth: 0,
    blobs: [[0, 0, 0.9, 0.8], [1.2, 0, 0.35, 0.55]],
    paint: [{ op: 'blob', x: -17, y: 0, rx: 4, ry: 6, tile: T.PLANK, rough: 0 }],
    treeDensity: 0,
    landmarks: [
      { kind: 'building', role: 'restaurant', name: 'Baratie — Sea Restaurant', npc: 'zeff', style: 'port', roofType: 'gable', fw: 10, fd: 4, hgt: 3, wall: '#f5e6c4', roof: '#1f618d', dx: 0, dy: -0.05 },
      { kind: 'lamp', dx: -0.6, dy: 0.5, light: true },
      { kind: 'lamp', dx: 0.6, dy: 0.5, light: true },
    ],
    spots: [{ id: 'baratie_deck', dx: 0, dy: 0.55 }],
    docks: [{ dx: 0, dy: 0.5, dir: 's', len: 4, name: 'Baratie' }],
    danger: 1,
  },
  {
    id: 'conomi_islands', name: 'Conomi Islands', sea: 'east_blue', x: 2660, y: 420, w: 210, h: 150, climate: 'tropical', rough: 0.24,
    blobs: [[0, 0, 0.8, 0.75], [-0.55, 0.35, 0.4, 0.4], [0.6, -0.35, 0.35, 0.4]],
    mountains: [{ dx: 0.1, dy: -0.3, r: 0.22, h: 0.6 }],
    areas: [
      { name: "Bell-mère's tangerine grove", tile: T.FARM, dx: -0.35, dy: 0.05, rx: 0.12, ry: 0.1 },
      { tile: T.FOREST, dx: 0.2, dy: 0.2, rx: 0.3, ry: 0.25 },
    ],
    trees: ['palm', 'oak', 'bush'],
    towns: [
      {
        id: 'cocoyasi', name: 'Cocoyasi Village', dx: -0.45, dy: 0.28, w: 30, h: 22, style: 'village', dockDir: 'sw', plaza: 'well',
        buildings: [{ role: 'house', name: "Nojiko's House", npc: 'nojiko' }, { role: 'doctor', name: "Doctor Nako's", npc: 'nako' }, { role: 'house', name: "Genzo's House", npc: 'genzo' }],
      },
      {
        id: 'arlong_park', name: 'Arlong Park', dx: 0.55, dy: -0.15, w: 30, h: 26, style: 'fishman', walls: true, dockDir: 'e', plaza: 'fountain',
        buildings: [{ role: 'hall', name: 'Arlong Park Tower', npc: 'arlong', w: 10, d: 6, hgt: 5, wall: '#f0e6d2', roof: '#1f4e5f' }],
        houses: 2,
      },
      {
        id: 'gosa', name: 'Gosa Village', dx: 0.1, dy: 0.5, w: 24, h: 18, style: 'village', dockDir: 's', ruined: true,
        buildings: [{ role: 'shop', name: 'Gosa Trading Post' }],
      },
      {
        id: 'marine_16', name: 'Marine 16th Branch', dx: -0.1, dy: -0.45, w: 22, h: 16, style: 'marine', dockDir: 'n', plaza: 'flagpole',
        buildings: [{ role: 'marine_base', name: '16th Branch', npc: 'nezumi', w: 8, d: 5, hgt: 3 }], houses: 0,
      },
    ],
    danger: 2,
  },
  {
    id: 'oykot', name: 'Oykot Kingdom', sea: 'east_blue', x: 3880, y: 610, w: 125, h: 90, climate: 'temperate', rough: 0.25,
    towns: [{ id: 'oykot_castle_town', name: 'Oykot Castle Town', dx: 0, dy: 0.1, w: 44, h: 30, style: 'town', walls: true, dockDir: 'w', plaza: 'statue',
      buildings: [{ role: 'palace', name: 'Oykot Castle' }, { role: 'shop', name: 'Royal Bazaar' }, { role: 'inn', name: 'Crown Inn' }] }],
    danger: 1,
  },
  {
    id: 'polestar_islands', name: 'Polestar Islands', sea: 'east_blue', x: 2385, y: 590, w: 160, h: 115, climate: 'temperate', rough: 0.22,
    blobs: [[0, 0, 0.85, 0.8], [0.6, 0.45, 0.35, 0.3]],
    towns: [
      {
        id: 'loguetown', name: 'Loguetown', dx: 0.0, dy: 0.0, w: 70, h: 50, style: 'port', dockDir: 'w', plaza: 'platform', plazaR: 6,
        buildings: [
          { role: 'weapons', name: "Ipponmatsu's Sword Shop", npc: 'ipponmatsu' },
          { role: 'shop', name: 'Loguetown Outfitters' },
          { role: 'shop', name: 'Navigator Supplies (Log Poses!)', npc: 'navigator_merchant' },
          { role: 'bar', name: "Gold Roger's Last Drink Tavern" },
          { role: 'inn', name: 'Harbor Inn' },
          { role: 'doctor', name: 'Loguetown Clinic' },
          { role: 'marine_base', name: 'Loguetown Marine Base', npc: 'smoker', w: 10, d: 6, hgt: 4 },
          { role: 'bounty', name: 'Bounty Office' },
          { role: 'trainer', name: 'Gunsmith & Range', npc: 'gunsmith_logue' },
        ],
      },
    ],
    landmarks: [{ kind: 'lighthouse', dx: -0.6, dy: 0.45 }],
    danger: 2,
  },
  {
    id: 'mirror_ball', name: 'Mirror Ball Island', sea: 'east_blue', x: 3390, y: 650, w: 72, h: 55, climate: 'spring', rough: 0.25,
    towns: [{ id: 'mirror_ball_town', name: 'Mirror Ball Town', dx: 0, dy: 0, w: 28, h: 20, style: 'town', dockDir: 'n',
      buildings: [{ role: 'shop', name: 'Doskoi Panda Boutique' }, { role: 'bar', name: 'Dance Hall' }] }],
    danger: 1,
  },
  {
    id: 'tequila_wolf', name: 'Tequila Wolf', sea: 'east_blue', x: 3990, y: 170, w: 110, h: 50, climate: 'winter', rough: 0.2,
    blobs: [[-0.7, 0, 0.3, 0.8], [0.7, 0, 0.3, 0.8]],
    archipelago: true,
    paint: [{ op: 'path', points: [[-0.5, 0], [0.5, 0]], width: 4, tile: T.BRIDGE }],
    towns: [{ id: 'tequila_camp', name: 'Bridge Labor Camp', dx: -0.7, dy: 0, w: 22, h: 18, style: 'snow', dockDir: 'w', buildings: [{ role: 'shop', name: 'Camp Canteen' }] }],
    danger: 2,
  },
  {
    id: 'cozia', name: 'Cozia', sea: 'east_blue', x: 3620, y: 660, w: 70, h: 56, climate: 'temperate', rough: 0.3,
    towns: [{ id: 'cozia_town', name: 'Cozia', dx: 0, dy: 0, w: 26, h: 18, style: 'village', buildings: [{ role: 'inn', name: 'Cozia Inn' }] }],
    danger: 1,
  },
  {
    id: 'sixis', name: 'Sixis', sea: 'east_blue', x: 3160, y: 660, w: 52, h: 40, climate: 'tropical', rough: 0.35, danger: 1,
    landmarks: [{ kind: 'boat', dx: 0.2, dy: 0.5 }, { kind: 'campfire', dx: 0, dy: 0.2 }],
  },
  {
    id: 'satsuruzo', name: 'Satsuruzo Kingdom', sea: 'east_blue', x: 2900, y: 160, w: 92, h: 70, climate: 'temperate', rough: 0.28,
    towns: [{ id: 'satsuruzo_town', name: 'Satsuruzo', dx: 0, dy: 0.1, w: 32, h: 22, style: 'town', buildings: [{ role: 'shop', name: 'Satsuruzo Market' }, { role: 'marine_base', name: 'Recruitment Office' }] }],
    danger: 1,
  },
];
