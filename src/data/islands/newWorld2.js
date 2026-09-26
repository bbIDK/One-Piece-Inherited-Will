// New World, second half (x 1030..1868): Wano Country and its sister island
// Onigashima, the three islands that "follow Wano" on the Log Pose (Winner
// Island, Egghead, Elbaph), Pirate Island Hachinosu, the Cross Guild's Karai
// Bari, Lodestar — the last island any Log Pose can reach — and, beyond it, the
// hidden final island Laugh Tale.
//
// Canon geography (One Piece Wiki): Wano lies on the north side of the New
// World, north-west of Egghead, south-west of Winner Island and west of Elbaph;
// Onigashima lay just south of Wano; Elbaph lies east of Wano and north-east of
// Egghead. Hachinosu, Karai Bari, Baltigo, Foodvalten and Gartel have no charted
// position, so they fill the gaps. Laugh Tale sits just before Reverse Mountain
// and is kept clear of the other islands' coasts because an endless storm guards
// it until the Road Poneglyphs are deciphered (see src/game/legends.js).
import { T, CLIMATE } from '../../world/tiles.js';

export const NEW_WORLD_2 = [
  // ------------------------------------------------------------ Foodvalten
  {
    id: 'foodvalten', name: 'Foodvalten', sea: 'new_world', x: 1082, y: 1150, w: 76, h: 60,
    climate: 'spring', rough: 0.28, trees: ['oak', 'bush', 'blossom'],
    blobs: [[0, 0, 0.85, 0.8], [-0.45, -0.35, 0.35, 0.3]],
    areas: [{ tile: T.FARM, name: 'Feather-fields', dx: -0.5, dy: 0.45, rx: 0.2, ry: 0.14 }],
    towns: [{
      id: 'foodvalten_town', name: 'Foodvalten', dx: 0, dy: 0.05, w: 36, h: 26, style: 'tribal', dockDir: 'w', plaza: 'well',
      buildings: [
        { role: 'hall', name: "Chief's Longhouse", npc: 'foodvalten_chief' },
        { role: 'shop', name: 'Feather Market' },
        { role: 'inn', name: 'Foodvalten Guesthouse' },
        { role: 'bar', name: 'Totem Tavern' },
      ],
    }],
    landmarks: [
      { kind: 'flagpole', dx: 0.62, dy: 0.02, name: "Whitebeard's flag (slashed in half)", spot: 'town_gate' },
      { kind: 'totem', dx: -0.62, dy: -0.35 },
      { kind: 'tent', dx: 0.45, dy: -0.5, name: 'Brownbeard Pirates camp', spot: 'brownbeard_camp' },
      { kind: 'campfire', dx: 0.55, dy: -0.42 },
    ],
    logNext: ['wano', 'onigashima', 'baltigo'], logTime: 1,
    danger: 6, tagline: 'Once under Whitebeard\'s flag. Now under nobody\'s.',
  },

  // --------------------------------------------------------- Wano Country
  {
    id: 'wano', name: 'Wano Country', sea: 'new_world', x: 1185, y: 952, w: 290, h: 212,
    climate: 'sakura', rough: 0.18, trees: ['sakura', 'pine', 'bamboo', 'sakura'], treeDensity: 0.06,
    population: [['human', 100]],
    blobs: [
      [0, 0, 0.82, 0.8],
      [-0.62, 0.02, 0.38, 0.52], // Kibi
      [-0.12, -0.55, 0.45, 0.42], // Ringo
      [0.55, -0.42, 0.42, 0.45], // Hakumai
      [0.6, 0.45, 0.4, 0.42], // Udon
      [-0.18, 0.58, 0.55, 0.38], // Kuri
    ],
    mountains: [
      { name: 'Mt. Fuji', dx: 0.18, dy: -0.32, r: 0.12, h: 1.05 },
      { name: 'Oden Castle hill', dx: 0.05, dy: 0.46, r: 0.04, h: 0.35 },
      { name: 'Mt. Atama', dx: -0.52, dy: 0.62, r: 0.035, h: 0.3 },
    ],
    areas: [
      { name: 'Ringo', tile: T.SNOW, climate: CLIMATE.WINTER, dx: -0.14, dy: -0.62, rx: 0.42, ry: 0.3 },
      { name: 'Hakumai', tile: T.GRASS, climate: CLIMATE.AUTUMN, dx: 0.6, dy: -0.45, rx: 0.36, ry: 0.36 },
      { name: 'Forest of Enma Shrine', tile: T.FOREST, climate: CLIMATE.AUTUMN, dx: 0.64, dy: -0.28, rx: 0.12, ry: 0.1 },
      { name: 'Kuri', tile: T.DIRT, dx: -0.18, dy: 0.66, rx: 0.5, ry: 0.28 },
      { name: 'Bamboo forest', tile: T.FOREST, dx: -0.62, dy: 0.42, rx: 0.1, ry: 0.1 },
      { name: 'Udon', tile: T.GRAVEL, dx: 0.62, dy: 0.52, rx: 0.3, ry: 0.3 },
      { name: 'Kibi', tile: T.ROCK, dx: -0.76, dy: -0.02, rx: 0.18, ry: 0.34 },
      { name: 'Flower Capital', tile: T.SAKURA, dx: -0.05, dy: 0.14, rx: 0.3, ry: 0.26 },
      { name: 'Paradise Farm', tile: T.FARM, dx: 0.16, dy: 0.66, rx: 0.07, ry: 0.06 },
    ],
    // the river that splits Wano into its regions, and the Great Bridges over it
    rivers: [
      { points: [[0.0, -0.36], [-0.3, -0.33], [-0.62, -0.38], [-0.98, -0.45]], width: 3 },
      { points: [[0.38, -0.2], [0.55, 0.08], [0.98, 0.18]], width: 3 },
    ],
    paint: [
      { op: 'path', points: [[-0.17, -0.47], [-0.17, -0.2]], width: 3, tile: T.BRIDGE },
      { op: 'path', points: [[0.48, -0.16], [0.48, 0.1]], width: 3, tile: T.BRIDGE },
    ],
    towns: [
      {
        id: 'flower_capital', name: 'Flower Capital', dx: -0.05, dy: 0.14, w: 76, h: 50, style: 'wano', plaza: 'statue', plazaR: 5,
        buildings: [
          { role: 'inn', name: 'Flower Capital Inn' },
          { role: 'restaurant', name: 'Soba Stand' },
          { role: 'weapons', name: 'Capital Swordsmith', shop: 'wano_capital_arms' },
          { role: 'shop', name: 'Capital Market', shop: 'wano_capital_market' },
          { role: 'dojo', name: "Kozuki Retainers' Dojo", trainer: 'kozuki_samurai', npc: 'denjiro_wano' },
          { role: 'cafe', name: "Komurasaki's Teahouse", npc: 'hiyori_wano' },
          { role: 'doctor', name: 'Capital Physician' },
          { role: 'library', name: 'Flower Capital School' },
        ],
      },
      {
        id: 'ebisu_town', name: 'Ebisu Town', dx: -0.36, dy: 0.64, w: 38, h: 26, style: 'wano', plaza: 'well', houses: 4,
        buildings: [
          { role: 'restaurant', name: "Tsuru's Tea House" },
          { role: 'shop', name: 'Leftovers Market' },
          { role: 'inn', name: 'Okobore Lodgings' },
        ],
      },
      {
        id: 'amigasa_village', name: 'Amigasa Village', dx: -0.66, dy: 0.33, w: 30, h: 22, style: 'wano', plaza: 'well', houses: 3,
        buildings: [
          { role: 'weapons', name: "Hitetsu's Forge", npc: 'hitetsu_wano', shop: 'amigasa_forge' },
          { role: 'shop', name: "Tama's Kibi Dango Stand", npc: 'tama_wano', shop: 'amigasa_food' },
        ],
      },
      {
        id: 'udon_mine', name: 'Udon — Prisoner Mine', dx: 0.58, dy: 0.5, w: 46, h: 32, style: 'wano', walls: true, plaza: 'platform', houses: 2,
        buildings: [
          { role: 'hall', name: "Prisoner Mine Warden's Office", npc: 'babanuki' },
          { role: 'dojo', name: 'Cell Block of the Yakuza Bosses', trainer: 'hyogoro', npc: 'hyogoro_wano' },
          { role: 'shop', name: 'Mine Canteen' },
        ],
      },
    ],
    docks: [
      { near: 'ebisu_town', dir: 's', name: 'Kuri Beach' },
      { near: 'udon_mine', dir: 'se', name: 'Tokage Port' },
      { near: 'amigasa_village', dir: 'w', name: 'Neko Port' },
      { dx: 0.72, dy: -0.5, dir: 'ne', name: 'Habu Port' },
      { dx: -0.12, dy: -0.72, dir: 'n', name: 'Kaeru Port' },
    ],
    landmarks: [
      { kind: 'building', role: 'palace', name: 'Shogun Castle', npc: 'momonosuke_wano', fw: 14, fd: 8, hgt: 6, style: 'wano', roofType: 'pagoda', wall: '#efebe9', roof: '#263238', dx: -0.05, dy: -0.11, spot: 'shogun_castle' },
      { kind: 'poneglyph', road: true, dx: 0.3, dy: -0.11, poneglyph: 'road_wano', name: 'Road Poneglyph of Wano (Mt. Fuji cavern)', spot: 'fuji_poneglyph' },
      { kind: 'ruins', dx: 0.05, dy: 0.52, name: 'Ruins of Oden Castle', spot: 'oden_castle' },
      { kind: 'grave', dx: 0.12, dy: 0.53, name: 'Graves of the Kozuki and their retainers' },
      { kind: 'torii', dx: -0.19, dy: 0.64, name: 'Great Torii of Bakura Town' },
      { kind: 'building', role: 'hall', name: "Holdem's Hall", fw: 8, fd: 5, hgt: 3, style: 'wano', roofType: 'pagoda', dx: 0.0, dy: 0.72, spot: 'bakura_town' },
      { kind: 'grave', dx: -0.2, dy: -0.66, name: 'Northern Cemetery' },
      { kind: 'grave', dx: -0.26, dy: -0.62, name: 'Northern Cemetery' },
      { kind: 'grave', dx: -0.12, dy: -0.6, name: 'Grave of Shimotsuki Ryuma', spot: 'ryuma_grave' },
      { kind: 'sign', dx: -0.2, dy: -0.49, name: 'Oihagi Bridge — entrance to Ringo' },
      { kind: 'torii', dx: 0.66, dy: -0.36, name: 'Enma Shrine', spot: 'enma_shrine' },
      { kind: 'lighthouse', dx: 0.74, dy: -0.46, name: 'Habu Port tower' },
      { kind: 'building', role: 'hall', name: 'Weapons Factory of Kibi', fw: 7, fd: 5, hgt: 3, style: 'wano', roofType: 'pagoda', dx: -0.8, dy: -0.12 },
      { kind: 'sign', dx: -0.34, dy: 0.86, name: 'Climbing Koi Waterfall' },
    ],
    spots: [{ id: 'kuri_beach', dx: -0.34, dy: 0.84 }],
    logNext: ['winner_island', 'egghead', 'elbaf'], logTime: 1.5,
    danger: 8, music: 'town',
    tagline: 'A closed country ruled by the Beasts Pirates. The only way in is up the waterfall.',
  },

  // ---------------------------------------------------------- Onigashima
  {
    id: 'onigashima', name: 'Onigashima', sea: 'new_world', x: 1205, y: 1140, w: 110, h: 90,
    climate: 'rocky', rough: 0.22, trees: ['dead', 'pine', 'rock'], treeDensity: 0.02,
    blobs: [[0, 0.05, 0.8, 0.72], [-0.52, -0.62, 0.2, 0.3], [0.52, -0.62, 0.2, 0.3], [0, 0.62, 0.42, 0.3]],
    mountains: [{ name: 'Skull Mountain', dx: 0, dy: -0.45, r: 0.16, h: 0.9 }],
    areas: [{ name: 'Wisteria boardwalk', tile: T.FLOWERS, dx: 0.5, dy: 0.1, rx: 0.2, ry: 0.18 }],
    lakes: [{ dx: 0.52, dy: 0.12, rx: 0.1, ry: 0.08, tile: T.POND }],
    paint: [{ op: 'path', points: [[0, 0.8], [0, 0.1]], width: 3, tile: T.STONE, onlyLand: true }],
    landmarks: [
      { kind: 'building', role: 'palace', name: 'Skull Dome', fw: 16, fd: 8, hgt: 7, style: 'wano', roofType: 'pagoda', wall: '#d7ccc8', roof: '#212121', dx: 0, dy: -0.02, spot: 'skull_dome' },
      { kind: 'torii', dx: 0, dy: 0.78, name: 'The Great Torii of Onigashima', spot: 'torii_gate' },
      { kind: 'pillar', dx: -0.22, dy: 0.6, name: 'Giant katana' },
      { kind: 'lantern', dx: 0.22, dy: 0.6, light: true },
      { kind: 'statue', dx: -0.1, dy: 0.7, name: 'Kitsune statue' },
      { kind: 'statue', dx: 0.1, dy: 0.7, name: 'Kitsune statue' },
      { kind: 'gate', dx: -0.02, dy: 0.42, name: 'Southern Gate', spot: 'southern_gate' },
      { kind: 'poneglyph', dx: -0.45, dy: 0.22, poneglyph: 'onigashima', name: 'Poneglyph of Onigashima' },
      { kind: 'chest', dx: -0.32, dy: -0.02, name: "Kaido's treasure room", spot: 'treasure_room', tier: 3 },
    ],
    spots: [
      { id: 'live_floor', dx: 0, dy: 0.25 },
      { id: 'skull_roof', dx: 0.26, dy: -0.12 },
      { id: 'pleasure_hall', dx: 0.4, dy: -0.12 },
      { id: 'wisteria_pond', dx: 0.5, dy: 0.3 },
    ],
    docks: [{ dx: 0, dy: 0.75, dir: 's', name: 'Front Gate of Onigashima' }],
    logNext: ['winner_island', 'egghead', 'elbaf'], logTime: 1,
    danger: 9, music: 'battle',
    tagline: 'The skull-shaped fortress of Kaido of the Beasts. Whirlpools, thunder — and the Fire Festival.',
  },

  // ---------------------------------------------------------------- Baltigo
  {
    id: 'baltigo', name: 'Baltigo', sea: 'new_world', x: 1317, y: 1150, w: 60, h: 56,
    climate: 'rocky', ground: T.MARBLE, beach: T.SAND, rough: 0.3, trees: ['rock'], treeDensity: 0.004,
    mountains: [
      { dx: -0.5, dy: -0.55, r: 0.1, h: 1.1 },
      { dx: 0.6, dy: -0.5, r: 0.09, h: 1.1 },
      { dx: 0.72, dy: 0.45, r: 0.08, h: 1.0 },
    ],
    towns: [{
      id: 'baltigo_ruins', name: 'Ruins of the Revolutionary HQ', dx: -0.05, dy: 0.12, w: 32, h: 22, style: 'ruins', dockDir: 's', plaza: false, houses: 2,
      buildings: [
        { role: 'dojo', name: 'Revolutionary Training Ground', trainer: 'revolutionary', npc: 'rev_officer_baltigo' },
        { role: 'library', name: 'Burned Archive' },
      ],
    }],
    landmarks: [
      { kind: 'ruins', dx: 0.15, dy: -0.4, name: 'Collapsed vault of the Army', spot: 'burned_archive' },
      { kind: 'ruins', dx: -0.6, dy: 0.1, name: 'Ancient ruins' },
    ],
    spots: [{ id: 'scavenger_camp', dx: -0.45, dy: -0.15 }],
    logNext: ['egghead', 'gartel_island', 'onigashima'], logTime: 1,
    danger: 7, tagline: 'The "Island of White Soil". The Revolutionary Army lived here — until Blackbeard came.',
  },

  // --------------------------------------------------------- Winner Island
  {
    id: 'winner_island', name: 'Winner Island', sea: 'new_world', x: 1405, y: 876, w: 80, h: 60,
    climate: 'rocky', rough: 0.3, trees: ['jungle', 'palm', 'rock'], treeDensity: 0.05,
    mountains: [
      { dx: -0.32, dy: -0.32, r: 0.18, h: 0.85 },
      { dx: 0.28, dy: -0.38, r: 0.2, h: 0.95 },
      { dx: 0.02, dy: -0.08, r: 0.12, h: 0.6 },
    ],
    areas: [{ tile: T.JUNGLE, dx: 0, dy: 0.2, rx: 0.55, ry: 0.3 }],
    landmarks: [
      { kind: 'tent', dx: -0.1, dy: 0.45, name: 'Blackbeard Pirates camp', spot: 'bb_camp' },
      { kind: 'campfire', dx: 0.05, dy: 0.5 },
      { kind: 'boat', dx: 0.5, dy: 0.55, name: 'Abandoned lifeboat', spot: 'heart_boat' },
    ],
    docks: [{ dx: -0.3, dy: 0.6, dir: 's', name: 'Winner Island' }],
    logNext: ['elbaf', 'gartel_island', 'egghead'], logTime: 1,
    danger: 8, tagline: 'Rounded rocks, thick jungle — and the tracks of a battle between Blackbeard and the Heart Pirates.',
  },

  // --------------------------------------------------------- Gartel Island
  {
    id: 'gartel_island', name: 'Gartel Island', sea: 'new_world', x: 1405, y: 983, w: 84, h: 90,
    climate: 'temperate', rough: 0.25, trees: ['oak', 'pine', 'bush'],
    mountains: [{ name: 'Gartel Range', dx: 0.1, dy: -0.5, r: 0.22, h: 0.9 }],
    towns: [{
      id: 'gartel_town', name: 'Gartel Town', dx: -0.05, dy: 0.25, w: 44, h: 32, style: 'port', dockDir: 'w', plaza: 'fountain',
      buildings: [
        { role: 'bar', name: 'Gartel Harbour Tavern' },
        { role: 'shop', name: 'Gartel Market' },
        { role: 'inn', name: 'Red Hair Inn' },
        { role: 'hall', name: "Mayor's Office", npc: 'gartel_mayor' },
        { role: 'shipwright', name: 'Gartel Dockyard' },
      ],
    }],
    landmarks: [{ kind: 'flagpole', dx: 0.28, dy: 0.02, name: "The Red Hair Pirates' flagpole (burned)", spot: 'red_hair_flag' }],
    spots: [{ id: 'gartel_pier', dx: -0.72, dy: 0.32 }],
    logNext: ['elbaf', 'egghead', 'hachinosu'], logTime: 1,
    danger: 6, tagline: 'Under the protection of the Red Hair Pirates. Someone just burned their flag.',
  },

  // --------------------------------------------------------------- Egghead
  {
    id: 'egghead', name: 'Egghead', sea: 'new_world', x: 1440, y: 1110, w: 130, h: 100,
    climate: 'tropical', rough: 0.2, trees: ['palm', 'jungle', 'bush'], treeDensity: 0.04,
    population: [['human', 100]],
    blobs: [[0, 0, 0.85, 0.8], [0.38, -0.38, 0.5, 0.46]],
    towns: [
      {
        id: 'fabriophase', name: 'Fabriophase — Future City', dx: -0.3, dy: 0.3, w: 50, h: 34, style: 'future', dockDir: 'sw', plaza: 'fountain',
        buildings: [
          { role: 'shop', name: 'Automatic Meal Dispensers', shop: 'egghead_store' },
          { role: 'inn', name: "Researchers' Dormitory" },
          { role: 'doctor', name: 'Egghead Medical Pod' },
          { role: 'shipwright', name: 'Central Factory' },
          { role: 'hall', name: 'Hologram Theatre' },
        ],
      },
      {
        id: 'labophase', name: 'Labophase', dx: 0.4, dy: -0.42, w: 46, h: 32, style: 'future', walls: true, dockDir: 'ne', plaza: 'platform',
        buildings: [
          { role: 'palace', name: "Vegapunk's Laboratory", npc: 'vegapunk' },
          { role: 'library', name: 'Punk Records Terminal' },
          { role: 'house', name: "Lilith's Workshop", npc: 'vegapunk_lilith' },
        ],
      },
    ],
    landmarks: [
      { kind: 'building', role: 'hall', name: 'Cloud Plant', fw: 7, fd: 6, hgt: 8, style: 'future', roofType: 'dome', wall: '#e0f7fa', roof: '#80deea', dx: 0.2, dy: 0.2 },
      { kind: 'ruins', dx: -0.55, dy: -0.3, name: 'Scrapyard' },
      { kind: 'statue', dx: -0.66, dy: -0.18, name: 'Emet, the Iron Giant', spot: 'emet' },
    ],
    spots: [
      { id: 'labophase_gate', dx: 0.36, dy: 0.05 },
      { id: 'north_coast', dx: 0.1, dy: -0.72 },
    ],
    docks: [
      { near: 'fabriophase', dir: 'sw', name: 'Fabriophase Harbour' },
      { near: 'labophase', dir: 'ne', name: 'Labophase Pier' },
    ],
    logNext: ['elbaf', 'hachinosu', 'gartel_island'], logTime: 1,
    danger: 8, music: 'town',
    tagline: 'The island of the future — a winter island Vegapunk made tropical.',
  },

  // ------------------------------------------------------------------ Elbaph
  {
    id: 'elbaf', name: 'Elbaph', sea: 'new_world', x: 1600, y: 930, w: 230, h: 190,
    climate: 'temperate', rough: 0.22, trees: ['pine', 'oak', 'pine'], treeDensity: 0.07,
    population: [['human', 100]], // scaled up to giants by the newWorld2 pack
    blobs: [[0, 0, 0.85, 0.85], [-0.55, -0.35, 0.42, 0.45], [0.5, -0.4, 0.45, 0.42], [0, 0.55, 0.7, 0.4]],
    mountains: [
      { name: 'Treasure Tree Adam', dx: 0.05, dy: 0.05, r: 0.13, h: 1.25 },
      { name: "Road's Mountain", dx: 0.52, dy: 0.55, r: 0.08, h: 0.9, snow: true },
      { name: 'Underworld peaks', dx: -0.05, dy: 0.5, r: 0.07, h: 0.85, snow: true },
    ],
    areas: [
      { name: 'Underworld', tile: T.SNOW, climate: CLIMATE.WINTER, dx: 0, dy: 0.58, rx: 0.9, ry: 0.36 },
      { name: 'Forest Sector 2', tile: T.FOREST, dx: 0.18, dy: -0.28, rx: 0.12, ry: 0.12 },
      { name: "Warrior's Spring", tile: T.SAND, dx: -0.2, dy: -0.12, rx: 0.1, ry: 0.08 },
    ],
    lakes: [{ dx: -0.2, dy: -0.12, rx: 0.06, ry: 0.05, tile: T.POND }],
    towns: [
      {
        id: 'western_village', name: 'Western Village', dx: -0.5, dy: -0.38, w: 74, h: 58, style: 'giant', dockDir: 'w', plaza: 'statue',
        buildings: [
          { role: 'dojo', name: 'Hall of Warriors', trainer: 'elbaf_warrior', npc: 'hajrudin_elbaf' },
          { role: 'hall', name: "Elder Jarul's Longhouse", npc: 'jarul' },
          { role: 'trainer', name: "Gaban's Lodge", trainer: 'nw2_gaban', npc: 'gaban_elbaf' },
          { role: 'inn', name: 'Mead Hall' },
          { role: 'shop', name: 'Warland Trading Post', shop: 'elbaf_market' },
          { role: 'weapons', name: 'Giant Axe Smithy', shop: 'elbaf_arms' },
        ],
      },
      {
        id: 'owl_library', name: 'Owl Library & Walrus School', dx: 0.42, dy: -0.45, w: 64, h: 46, style: 'giant', dockDir: 'n', plaza: 'fountain',
        buildings: [
          { role: 'library', name: 'Owl Library', npc: 'saul_elbaf' },
          { role: 'hall', name: 'Walrus School' },
          { role: 'house', name: "Biblo's Reading Room" },
        ],
      },
      {
        id: 'ida_bar', name: 'Underworld Coast', dx: -0.38, dy: 0.72, w: 42, h: 30, style: 'giant', dockDir: 's', plaza: false, houses: 1,
        buildings: [{ role: 'bar', name: "Ida's Bar", npc: 'mato_elbaf', shop: 'elbaf_tavern' }],
      },
    ],
    landmarks: [
      { kind: 'building', role: 'palace', name: 'Aurust Castle (sealed)', fw: 16, fd: 9, hgt: 7, style: 'giant', roofType: 'gable', wall: '#8d6e63', roof: '#3e2723', dx: -0.72, dy: 0.1, spot: 'aurust_castle' },
      { kind: 'pillar', dx: 0.0, dy: 0.3, name: 'Seastone chains at the roots of Adam', spot: 'loki_chains' },
      { kind: 'bones', dx: -0.08, dy: 0.36 },
      { kind: 'bones', dx: 0.1, dy: 0.4 },
      { kind: 'elevator', dx: 0.2, dy: 0.25, name: 'Boat Elevator to the Sun World' },
      { kind: 'pillar', dx: 0.3, dy: 0.05, name: 'The Great Longsword' },
      { kind: 'statue', dx: 0.05, dy: -0.18, name: "Mural on Adam's bark (carved during the Void Century)" },
      { kind: 'ruins', dx: 0.75, dy: -0.05, name: 'Ancient Facility (3,000 years old)' },
      { kind: 'building', role: 'house', name: "Road's Castle", fw: 10, fd: 7, hgt: 6, style: 'giant', roofType: 'gable', wall: '#90a4ae', roof: '#455a64', dx: 0.52, dy: 0.72 },
    ],
    spots: [
      { id: 'walrus_school', dx: 0.42, dy: -0.2 },
      { id: 'underworld_hunt', dx: -0.3, dy: 0.42 },
    ],
    docks: [
      { near: 'western_village', dir: 'w', name: 'Western Village' },
      { near: 'owl_library', dir: 'n', name: 'Owl Library Landing' },
      { near: 'ida_bar', dir: 's', name: 'Underworld Coast' },
    ],
    logNext: ['karai_bari', 'hachinosu', 'lodestar'], logTime: 2,
    danger: 8, music: 'town',
    tagline: 'The Warland, home of the giants — the strongest country in the world.',
  },

  // ------------------------------------------------------------- Hachinosu
  {
    id: 'hachinosu', name: 'Hachinosu', sea: 'new_world', x: 1600, y: 1135, w: 110, h: 90,
    climate: 'rocky', ground: T.ROCK, rough: 0.26, trees: ['palm'], treeDensity: 0.03,
    blobs: [[0, 0, 0.85, 0.8], [0.4, 0.4, 0.4, 0.35]],
    towns: [{
      id: 'hachinosu_town', name: 'Hachinosu', dx: -0.05, dy: 0.3, w: 60, h: 34, style: 'city', dockDir: 's', plaza: 'statue',
      buildings: [
        { role: 'bar', name: "Pirates' Paradise Tavern", npc: 'laffitte_hachinosu' },
        { role: 'shop', name: 'Hachinosu Black Market', shop: 'hachinosu_black' },
        { role: 'inn', name: 'Flophouse of the Rocks' },
        { role: 'weapons', name: 'Rocks-Era Armory' },
        { role: 'house', name: 'Prison Block', npc: 'koby_hachinosu' },
        { role: 'doctor', name: "Doc Q's Clinic" },
      ],
    }],
    landmarks: [
      { kind: 'building', role: 'palace', name: 'Skull Fortress', fw: 16, fd: 10, hgt: 8, style: 'city', roofType: 'dome', wall: '#d4b96a', roof: '#a1887f', dx: 0, dy: -0.38, spot: 'skull_fortress' },
      { kind: 'poneglyph', dx: 0.55, dy: -0.3, poneglyph: 'hachinosu', name: 'Poneglyph of Hachinosu' },
      { kind: 'ruins', dx: -0.6, dy: -0.22, name: "Ruins of Shakuyaku's first bar" },
    ],
    spots: [
      { id: 'captains_yard', dx: -0.28, dy: -0.12 },
      { id: 'hachinosu_pier', dx: -0.08, dy: 0.86 },
    ],
    logNext: ['lodestar', 'karai_bari', 'elbaf'], logTime: 1,
    danger: 9, tagline: 'Pirate Island — where the Rocks Pirates were born. Blackbeard rules it now.',
  },

  // ------------------------------------------------------------ Karai Bari
  // Base of Buggy's Delivery, now the headquarters of the Cross Guild (Buggy,
  // Crocodile and Mihawk), who put bounties on Marines.
  {
    id: 'karai_bari', name: 'Karai Bari Island', sea: 'new_world', x: 1790, y: 876, w: 80, h: 60,
    climate: 'tropical', rough: 0.25, trees: ['palm', 'palm', 'bush'],
    mountains: [{ dx: 0.12, dy: -0.62, r: 0.2, h: 0.9 }, { dx: -0.45, dy: -0.55, r: 0.14, h: 0.7 }],
    towns: [{
      id: 'buggy_town', name: 'Buggy Town', dx: 0, dy: 0.22, w: 44, h: 28, style: 'town', dockDir: 's', plaza: 'platform',
      buildings: [
        { role: 'bounty', name: 'Cross Guild Bounty Office' },
        { role: 'bar', name: 'Big Top Tavern' },
        { role: 'shop', name: "Buggy's Delivery Depot", shop: 'black_market' },
        { role: 'inn', name: 'Circus Tent Inn' },
      ],
    }],
    landmarks: [
      { kind: 'tent', dx: -0.62, dy: 0.1 }, { kind: 'tent', dx: 0.62, dy: 0.05 }, { kind: 'tent', dx: 0.55, dy: 0.5, v: 1 },
      { kind: 'flagpole', dx: -0.1, dy: -0.25, name: 'Flag of the Cross Guild' },
    ],
    logNext: ['lodestar', 'hachinosu', 'elbaf'], logTime: 1,
    danger: 7, tagline: 'Buggy Town — a circus of tents, and the headquarters of the Cross Guild.',
  },

  // --------------------------------------------------------------- Lodestar
  // The last island any Log Pose can reach. It has no `logNext` on purpose:
  // canon says the needles only spin here (the pack's install() clears the log).
  {
    id: 'lodestar', name: 'Lodestar Island', sea: 'new_world', x: 1790, y: 1175, w: 90, h: 60,
    climate: 'rocky', rough: 0.3, trees: ['pine', 'rock'], treeDensity: 0.03,
    areas: [{ tile: T.GRASS, dx: -0.2, dy: 0.1, rx: 0.45, ry: 0.35 }],
    landmarks: [
      { kind: 'statue', dx: -0.08, dy: -0.12, name: 'The Needle Stone', spot: 'needle_stone' },
      { kind: 'tent', dx: -0.45, dy: 0.2, name: "Watcher's tent", spot: 'watcher_tent' },
      { kind: 'campfire', dx: -0.38, dy: 0.3 },
      { kind: 'ruins', dx: 0.2, dy: -0.4, name: 'Camp of the Roger Pirates (39 years old)' },
      { kind: 'poneglyph', road: true, dx: 0.76, dy: 0.1, poneglyph: 'road_4', name: 'The Lost Road Poneglyph', spot: 'road4_cave' },
      { kind: 'shipwreck', dx: 0.9, dy: 0.45, name: 'An all-black ship' },
    ],
    spots: [{ id: 'vortex_bay', dx: 1.35, dy: 0.1 }],
    docks: [{ dx: -0.6, dy: 0.5, dir: 'sw', name: 'Lodestar Anchorage' }],
    danger: 9, tagline: 'Every route of the Grand Line ends here. Your Log Pose\'s needles begin to spin.',
  },

  // ------------------------------------------------------------- Laugh Tale
  {
    id: 'laugh_tale', name: 'Laugh Tale', sea: 'new_world', x: 1795, y: 1025, w: 90, h: 72, hidden: true,
    climate: 'temperate', beach: T.ROCK, rough: 0.35, trees: ['oak', 'pine', 'jungle'], treeDensity: 0.06,
    blobs: [[0, 0, 0.85, 0.8], [0.3, -0.35, 0.4, 0.35]],
    mountains: [
      { name: 'Cliffs of Laugh Tale', dx: -0.25, dy: -0.52, r: 0.14, h: 1.0 },
      { dx: 0.62, dy: 0.32, r: 0.12, h: 0.9 },
    ],
    areas: [{ tile: T.FOREST, dx: -0.2, dy: 0.1, rx: 0.4, ry: 0.35 }],
    paint: [{ op: 'path', points: [[-0.6, 0.55], [-0.2, 0.2], [0.1, -0.1], [0.32, -0.36]], width: 3, tile: T.STONE, onlyLand: true }],
    landmarks: [
      { kind: 'ruins', dx: -0.45, dy: 0.05, name: 'Fortifications of the Great Kingdom' },
      { kind: 'ruins', dx: 0.45, dy: 0.12, name: 'Fallen ramparts' },
      { kind: 'poneglyph', dx: 0.02, dy: -0.2, poneglyph: 'laugh_tale', name: 'The Last Poneglyph', spot: 'last_poneglyph' },
      { kind: 'pillar', dx: 0.2, dy: -0.42, name: "Joy Boy's Message", spot: 'joy_boy_message', interact: "Read Joy Boy's message", use: 'nw2_joyboy', interactRange: 2.4 },
      { kind: 'arch', dx: 0.36, dy: -0.42, name: 'Resting place of the One Piece', spot: 'one_piece' },
    ],
    spots: [
      { id: 'landing', dx: -0.55, dy: 0.5 },
      { id: 'final_duel', dx: -0.35, dy: 0.38 },
    ],
    docks: [{ dx: -0.55, dy: 0.55, dir: 'sw', name: 'Laugh Tale' }],
    danger: 10, music: 'title',
    tagline: 'The final island. Joy Boy\'s treasure has waited here for eight hundred years.',
  },
];
