// New World, first half (x 90..1000). Canon route west → east after rising
// from Fish-Man Island (zone; surfaces at ~(118, 990)): the three islands the
// New World Log Pose points to first (Raijin, Risky Red, Mystoria), the Marine
// bases near the Red Line (New Marineford, G-5), Punk Hazard, Dressrosa and
// Green Bit, Applenine, Sphinx, Zou (a phantom island a Log Pose can't point
// to) and Totto Land (Whole Cake Island, Cacao Island). Wano and the rest of
// the New World (x 1000..1880) live in newWorld2.js.
import { T, CLIMATE } from '../../world/tiles.js';

export const NEW_WORLD = [
  // ------------------------------------------------------------ New Marineford
  {
    id: 'new_marineford', name: 'New Marineford', sea: 'new_world', x: 150, y: 872, w: 76, h: 60,
    climate: 'rocky', rough: 0.2,
    blobs: [[0, 0, 0.85, 0.85], [-0.45, 0.4, 0.35, 0.35]],
    areas: [{ name: 'Parade Ground', tile: T.STONE, dx: 0.05, dy: 0.5, rx: 0.3, ry: 0.12 }],
    towns: [{
      id: 'marine_hq_nw', name: 'Marine Headquarters', dx: 0.05, dy: -0.02, w: 50, h: 38, style: 'marine', walls: true, dockDir: 's', plaza: 'flagpole', plazaR: 5,
      buildings: [
        { role: 'marine_base', name: 'Marine Headquarters', npc: 'nw_sakazuki', w: 12, d: 7, hgt: 6 },
        { role: 'trainer', name: 'HQ Training Grounds', trainer: 'marine_instructor' },
        { role: 'bounty', name: 'Wanted Poster Office' },
        { role: 'doctor', name: 'HQ Infirmary' },
        { role: 'shop', name: 'Navy Supply Depot', shop: 'nw_navy_depot' },
        { role: 'inn', name: "Officers' Barracks" },
      ],
    }],
    landmarks: [
      { kind: 'bubble', dx: -0.55, dy: -0.45 }, { kind: 'bubble', dx: 0.62, dy: -0.35 }, { kind: 'bubble', dx: -0.3, dy: 0.55 },
      { kind: 'cannon', dx: -0.72, dy: 0.15 }, { kind: 'cannon', dx: 0.74, dy: 0.2 },
    ],
    spots: [{ id: 'hq_gate', dx: 0.05, dy: 0.45 }],
    logNext: ['g5_base', 'raijin_island', 'punk_hazard'], logTime: 1,
    danger: 8, music: 'town',
    tagline: 'The new seat of Marine Headquarters, moved to the New World to stare down the Emperors.',
  },

  // ----------------------------------------------------------------- G-5 base
  {
    id: 'g5_base', name: 'Marine Base G-5', sea: 'new_world', x: 150, y: 1160, w: 56, h: 44,
    climate: 'rocky', rough: 0.25,
    towns: [{
      id: 'g5_base_town', name: 'G-5 Base', dx: 0, dy: -0.05, w: 36, h: 26, style: 'marine', walls: true, dockDir: 'n', plaza: 'flagpole',
      buildings: [
        { role: 'marine_base', name: 'G-5 Headquarters', npc: 'nw_vergo_g5', w: 10, d: 6, hgt: 4 },
        { role: 'inn', name: 'G-5 Barracks' },
        { role: 'bar', name: 'G-5 Mess Hall' },
      ],
      houses: 1,
    }],
    landmarks: [{ kind: 'cannon', dx: -0.62, dy: 0.3 }, { kind: 'cannon', dx: 0.62, dy: 0.3 }, { kind: 'anchor', dx: 0.3, dy: 0.55 }],
    spots: [{ id: 'g5_yard', dx: 0.1, dy: 0.4 }],
    logNext: ['punk_hazard', 'risky_red_island', 'new_marineford'], logTime: 1,
    danger: 7,
    tagline: 'G-5: the Marines\' problem branch. Justice here is enforced... loosely.',
  },

  // ------------------------------------------------------------- Raijin Island
  {
    id: 'raijin_island', name: 'Raijin Island', sea: 'new_world', x: 268, y: 868, w: 66, h: 52,
    climate: 'rocky', rough: 0.3,
    areas: [
      { name: 'Scorched Plain', tile: T.ASH, dx: 0.25, dy: -0.2, rx: 0.3, ry: 0.25 },
      { tile: T.GRAVEL, dx: -0.3, dy: -0.3, rx: 0.2, ry: 0.15 },
    ],
    trees: ['dead', 'rock', 'pine'], treeDensity: 0.03,
    towns: [{
      id: 'raijin_hamlet', name: 'Lightning-Rod Hamlet', dx: -0.2, dy: 0.25, w: 28, h: 18, style: 'village', dockDir: 's', plaza: 'well',
      buildings: [
        { role: 'shop', name: "Kasa's Umbrella Stand", npc: 'nw_kasa', shop: 'nw_raijin_stand' },
        { role: 'inn', name: 'Lightning-Rod Inn' },
      ],
    }],
    landmarks: [
      { kind: 'pillar', dx: 0.2, dy: -0.35, name: 'Lightning rod' }, { kind: 'pillar', dx: 0.5, dy: -0.05, name: 'Lightning rod' },
      { kind: 'bones', dx: 0.35, dy: 0.15 },
    ],
    spots: [{ id: 'thunder_plain', dx: 0.28, dy: -0.18 }],
    logNext: ['punk_hazard', 'mystoria_island', 'g5_base'], logTime: 1,
    danger: 7,
    tagline: 'Lightning falls here like rain — hundreds of bolts an hour, day and night.',
  },

  // ---------------------------------------------------------- Risky Red Island
  {
    id: 'risky_red_island', name: 'Risky Red Island', sea: 'new_world', x: 300, y: 1150, w: 74, h: 56,
    climate: 'rocky', ground: T.DIRT, beach: T.GRAVEL, rough: 0.3,
    mountains: [{ name: 'The Red Crags', dx: 0.28, dy: -0.22, r: 0.28, h: 0.85, peak: T.RED_ROCK, cliff: 205 }],
    areas: [{ tile: T.ASH, dx: -0.35, dy: 0.25, rx: 0.2, ry: 0.15 }],
    trees: ['dead', 'pine', 'rock'], treeDensity: 0.03,
    towns: [{
      id: 'crimson_cove', name: 'Crimson Cove', dx: -0.25, dy: 0.2, w: 30, h: 20, style: 'port', dockDir: 'sw', plaza: 'well',
      buildings: [
        { role: 'bar', name: 'The Jiggling Needle' },
        { role: 'shop', name: 'Crag Trading Post' },
        { role: 'inn', name: 'Red Rock Inn' },
      ],
    }],
    landmarks: [{ kind: 'tent', dx: 0.35, dy: 0.25, name: "Hawkins's camp", spot: 'hawkins_camp' }, { kind: 'campfire', dx: 0.4, dy: 0.3 }],
    logNext: ['punk_hazard', 'applenine_island', 'g5_base'], logTime: 1,
    danger: 7,
    tagline: 'The needle that points here jiggles the hardest. Sailors say that is a warning.',
  },

  // ----------------------------------------------------------- Mystoria Island
  {
    id: 'mystoria_island', name: 'Mystoria Island', sea: 'new_world', x: 400, y: 870, w: 64, h: 50,
    climate: 'autumn', rough: 0.3,
    areas: [{ name: 'Misty Wood', tile: T.FOREST, dx: 0.3, dy: -0.2, rx: 0.3, ry: 0.3 }],
    towns: [{
      id: 'mystoria_town', name: 'Mystoria', dx: -0.2, dy: 0.2, w: 32, h: 22, style: 'town', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'shop', name: 'Vivre Card Workshop', npc: 'nw_vivre_maker', shop: 'nw_vivre_shop' },
        { role: 'library', name: 'Mystoria Archive' },
        { role: 'inn', name: 'Mist Inn' },
      ],
    }],
    landmarks: [{ kind: 'ruins', dx: 0.45, dy: 0.3, name: 'Fog-bound ruins' }, { kind: 'lantern', dx: -0.5, dy: -0.1 }],
    logNext: ['punk_hazard', 'green_bit', 'sphinx'], logTime: 1,
    danger: 6,
    tagline: 'A fog-wrapped island of craftsmen. Somewhere in the New World, Vivre Cards are made — here.',
  },

  // --------------------------------------------------------------- Punk Hazard
  // Half fire, half ice: Admirals Akainu and Aokiji fought here for ten days.
  {
    id: 'punk_hazard', name: 'Punk Hazard', sea: 'new_world', x: 290, y: 1005, w: 170, h: 130,
    climate: 'volcanic', rough: 0.22,
    blobs: [[0, 0, 0.82, 0.78], [-0.5, 0.15, 0.45, 0.55], [0.5, -0.1, 0.45, 0.55]],
    mountains: [
      { name: 'Frozen Peaks', dx: -0.62, dy: -0.4, r: 0.2, h: 0.95, snow: true },
      { name: 'Burning Mountain', dx: 0.62, dy: -0.4, r: 0.2, h: 0.95 },
    ],
    areas: [
      { name: 'The Frozen Lands', tile: T.SNOW, climate: CLIMATE.WINTER, dx: -0.52, dy: 0.0, rx: 0.52, ry: 1.2, rough: 0.2, overBeach: true },
      { name: 'The Burning Lands', tile: T.ASH, climate: CLIMATE.VOLCANIC, dx: 0.52, dy: 0.0, rx: 0.5, ry: 1.2, rough: 0.2 },
      { name: 'Frozen Lake', tile: T.ICE, climate: CLIMATE.WINTER, dx: -0.55, dy: 0.42, rx: 0.14, ry: 0.12 },
    ],
    lakes: [{ dx: 0.56, dy: 0.4, rx: 0.1, ry: 0.1, tile: T.LAVA }],
    trees: ['dead', 'snowpine', 'rock'], treeDensity: 0.03,
    towns: [{
      id: 'ph_laboratory', name: "Caesar's Laboratory", dx: 0.0, dy: 0.08, w: 46, h: 32, style: 'future', walls: true, dockDir: 's', plaza: 'platform',
      buildings: [
        { role: 'hall', name: 'Research Building R-66', npc: 'nw_caesar', w: 10, d: 6, hgt: 5, wall: '#eceff1', roof: '#8e24aa' },
        { role: 'hall', name: 'Biscuits Room', npc: 'nw_mocha', w: 8, d: 5, wall: '#fff3e0', roof: '#ffb74d' },
        { role: 'hall', name: 'SAD Production Room', w: 8, d: 5, wall: '#cfd8dc', roof: '#455a64' },
      ],
      houses: 1,
    }],
    landmarks: [
      { kind: 'tent', dx: -0.64, dy: 0.08, name: "Trafalgar Law's camp", spot: 'law_camp' },
      { kind: 'campfire', dx: -0.6, dy: 0.13 },
      { kind: 'tent', dx: 0.42, dy: 0.55, name: 'G-5 field camp', spot: 'g5_camp' },
      { kind: 'shipwreck', dx: -0.78, dy: 0.5, name: 'Wrecked tanker' },
      { kind: 'skull', dx: 0.3, dy: -0.15, name: 'Ruined Government research facility' },
    ],
    spots: [
      { id: 'centaur_patrol', dx: -0.38, dy: -0.25 },
      { id: 'sad_room', dx: 0.12, dy: -0.12 },
      { id: 'lab_gate', dx: 0.0, dy: 0.42 },
    ],
    logNext: ['dressrosa', 'green_bit', 'applenine_island'], logTime: 1,
    danger: 8,
    tagline: 'Half the island burns, half is frozen solid. Something is poisoning the air.',
  },

  // ----------------------------------------------------------------- Dressrosa
  // The Land of Love and Passion. Acacia (SW, the Colosseum), Primula (NW),
  // Carta (E), the King's Plateau in the centre with the Royal Palace on top.
  {
    id: 'dressrosa', name: 'Dressrosa', sea: 'new_world', x: 555, y: 1040, w: 280, h: 196,
    climate: 'spring', rough: 0.2,
    blobs: [[0, 0, 0.88, 0.84], [-0.55, 0.42, 0.4, 0.4], [0.55, 0.38, 0.4, 0.42], [0.0, -0.58, 0.34, 0.34]],
    mountains: [
      { name: "King's Plateau", dx: 0.02, dy: -0.12, r: 0.16, h: 0.75, cliff: 320, slope: T.ROCK, slopeAt: 150 },
      { name: 'Western Crags', dx: -0.88, dy: -0.15, r: 0.1, h: 0.9 },
      { name: 'Eastern Crags', dx: 0.88, dy: -0.25, r: 0.1, h: 0.9 },
    ],
    areas: [
      { name: 'Flower Fields', tile: T.FLOWERS, dx: 0.25, dy: 0.28, rx: 0.2, ry: 0.14 },
      { name: 'Flower Hill', tile: T.FLOWERS, dx: 0.5, dy: -0.12, rx: 0.1, ry: 0.1 },
      { name: 'Carta Forest', tile: T.FOREST, dx: 0.72, dy: 0.3, rx: 0.14, ry: 0.2 },
      { name: 'Olive groves', tile: T.FARM, dx: -0.28, dy: 0.12, rx: 0.14, ry: 0.1 },
    ],
    paint: [
      // the iron bridge to Green Bit (closed for 200 years because of the Fighting Fish)
      { op: 'path', points: [[0.0, -86], [0.0, -150]], width: 4, tile: T.BRIDGE },
    ],
    towns: [
      {
        id: 'acacia', name: 'Acacia', dx: -0.55, dy: 0.45, w: 58, h: 40, style: 'town', dockDir: 'sw', plaza: 'fountain', plazaR: 5,
        buildings: [
          { role: 'hall', name: 'Corrida Colosseum', npc: 'nw_gatz', w: 12, d: 8, hgt: 6, wall: '#e8c39e', roof: '#b03a2e' },
          { role: 'inn', name: 'Acacia Inn' },
          { role: 'shop', name: 'Acacia Market', shop: 'nw_dressrosa_market' },
          { role: 'weapons', name: 'Dressrosa Armory' },
          { role: 'doctor', name: 'Acacia Clinic' },
          { role: 'bar', name: 'Colosseum Tavern' },
        ],
      },
      {
        id: 'royal_palace_dr', name: 'Royal Palace', dx: 0.02, dy: -0.16, w: 36, h: 26, style: 'noble', walls: true, plaza: 'fountain',
        buildings: [{ role: 'palace', name: 'Royal Palace of Dressrosa', w: 12, d: 8, hgt: 6, wall: '#fdfefe', roof: '#e91e63' }],
        houses: 1,
      },
      {
        id: 'primula', name: 'Primula', dx: -0.5, dy: -0.35, w: 34, h: 24, style: 'town', plaza: 'well',
        buildings: [
          { role: 'restaurant', name: 'Café Bar La Baltad' },
          { role: 'shop', name: 'Primula Flower Stall' },
          { role: 'inn', name: "Lovers' Lane Inn" },
        ],
      },
      {
        id: 'carta', name: 'Carta', dx: 0.62, dy: 0.15, w: 34, h: 24, style: 'village', plaza: 'well',
        buildings: [
          { role: 'shop', name: 'Carta General Store' },
          { role: 'doctor', name: 'Carta Healer' },
          { role: 'inn', name: 'Forest Inn' },
        ],
      },
    ],
    docks: [{ near: 'acacia', dir: 'sw', name: 'Acacia Harbour' }, { near: 'primula', dir: 'nw', name: 'Primula Pier' }, { near: 'carta', dir: 'e', name: 'Carta Port' }],
    landmarks: [
      { kind: 'building', role: 'hall', name: 'Toy House', npc: 'nw_sugar', fw: 8, fd: 5, hgt: 4, wall: '#ffcc80', roof: '#e53935', roofType: 'dome', dx: 0.16, dy: 0.04, spot: 'toy_house' },
      { kind: 'gate', dx: -0.44, dy: 0.3, name: 'SMILE Factory (beneath the Colosseum)', spot: 'smile_factory' },
      { kind: 'gate', dx: 0.0, dy: -0.8, name: 'Iron Bridge to Green Bit', spot: 'bridge_gate' },
      { kind: 'bench', dx: 0.5, dy: -0.06, name: 'Flower Hill', spot: 'flower_hill' },
      { kind: 'fountain', dx: 0.25, dy: 0.22 },
    ],
    spots: [
      { id: 'palace_top', dx: 0.02, dy: -0.26 },
      { id: 'colosseum_arena', dx: -0.48, dy: 0.62 },
      { id: 'birdcage_edge', dx: -0.2, dy: 0.2 },
    ],
    logNext: ['green_bit', 'sphinx', 'whole_cake_island'], logTime: 1,
    danger: 9, music: 'town',
    tagline: 'The Land of Love and Passion — flowers, flamenco, a colosseum, and living toys.',
  },

  // ----------------------------------------------------------------- Green Bit
  {
    id: 'green_bit', name: 'Green Bit', sea: 'new_world', x: 555, y: 880, w: 96, h: 60,
    climate: 'jungle', rough: 0.25,
    areas: [{ name: 'Giant Plant Forest', tile: T.JUNGLE, dx: -0.1, dy: -0.15, rx: 0.6, ry: 0.5 }],
    towns: [{
      id: 'tontatta_kingdom', name: 'Tontatta Kingdom', dx: 0.15, dy: 0.12, w: 36, h: 22, style: 'tribal', dockDir: 'e', plaza: 'well',
      buildings: [
        { role: 'hall', name: "King Gancho's Hall", npc: 'nw_gancho' },
        { role: 'doctor', name: "Mansherry's Healing Room", npc: 'nw_mansherry' },
        { role: 'shop', name: 'Tontatta Farm Stall', shop: 'nw_tontatta_stall' },
      ],
      houses: 4,
    }],
    landmarks: [
      { kind: 'shipwreck', dx: -0.62, dy: -0.3, name: 'Crashed Marine warship' },
      { kind: 'gate', dx: 0.0, dy: 0.82, name: 'Iron Bridge (Green Bit end)', spot: 'bridge_end' },
    ],
    spots: [{ id: 'green_bit_woods', dx: -0.35, dy: 0.05 }],
    logNext: ['dressrosa', 'sphinx', 'whole_cake_island'], logTime: 1,
    danger: 8,
    tagline: 'A seemingly uninhabited island of giant plants. Seemingly.',
  },

  // --------------------------------------------------------- Applenine Island
  {
    id: 'applenine_island', name: 'Applenine Island', sea: 'new_world', x: 470, y: 1188, w: 60, h: 44,
    climate: 'winter', rough: 0.25,
    areas: [{ name: 'The Colossal Apple', tile: T.SNOW, dx: 0.28, dy: -0.22, rx: 0.05, ry: 0.05 }],
    paint: [
      { op: 'circle', x: 0.28, y: -0.22, r: 7, tile: T.RED_ROCK, onlyLand: true },
      { op: 'circle', x: 0.44, y: 0.02, r: 2.5, tile: T.RED_ROCK, onlyLand: true },
      { op: 'circle', x: 0.1, y: -0.02, r: 2.5, tile: T.RED_ROCK, onlyLand: true },
    ],
    towns: [{
      id: 'applenine_village', name: 'Applenine Village', dx: -0.25, dy: 0.2, w: 30, h: 20, style: 'snow', dockDir: 'sw', plaza: 'well',
      buildings: [{ role: 'inn', name: 'Apple-Roof Inn' }, { role: 'tavern', name: 'Hot Cider Tavern' }],
    }],
    logNext: ['dressrosa', 'punk_hazard', 'sphinx'], logTime: 1,
    danger: 6,
    tagline: 'Snowbound houses with apple-shaped roofs, huddled beneath a colossal apple.',
  },

  // -------------------------------------------------------------------- Sphinx
  {
    id: 'sphinx', name: 'Sphinx', sea: 'new_world', x: 690, y: 872, w: 64, h: 52,
    climate: 'temperate', rough: 0.28,
    trees: ['pine', 'pine', 'bush'],
    mountains: [{ name: 'Valley Mountains', dx: 0.15, dy: -0.3, r: 0.32, h: 0.9 }],
    rivers: [{ points: [[0.12, -0.35], [0.18, 0.05], [0.1, 0.95]], width: 2.5 }],
    towns: [{
      id: 'sphinx_village', name: 'Hidden Village', dx: 0.4, dy: 0.15, w: 26, h: 18, style: 'village', dockDir: 'e', plaza: 'well',
      buildings: [
        { role: 'doctor', name: "Marco's Clinic", npc: 'nw_marco' },
        { role: 'shop', name: 'Valley Store' },
        { role: 'inn', name: 'Waterfall Inn' },
      ],
    }],
    landmarks: [
      { kind: 'ruins', dx: -0.45, dy: 0.35, name: 'Ruins of the Old Town', spot: 'old_town_ruins' },
      { kind: 'ruins', dx: -0.6, dy: 0.15 },
      { kind: 'arch', dx: 0.22, dy: -0.02, name: 'Waterfall entrance' },
    ],
    logNext: ['whole_cake_island', 'cacao_island', 'wano'], logTime: 1,
    danger: 7,
    tagline: 'Edward Newgate\'s poor home island. The Government abandoned it; Whitebeard never did.',
  },

  // ----------------------------------------------------------------------- Zou
  // The Mokomo Dukedom on the back of the elephant Zunesha. A "phantom
  // island": no Log Pose points here — only a Vivre Card.
  {
    id: 'zou', name: 'Zou', sea: 'new_world', x: 845, y: 878, w: 150, h: 92,
    climate: 'temperate', rough: 0.12,
    population: [['mink', 94], ['human', 6]],
    blobs: [[0, 0, 0.88, 0.85], [0.72, -0.12, 0.24, 0.3]],
    trees: ['jungle', 'oak', 'bush'],
    areas: [
      { name: 'Whale Forest', tile: T.FOREST, dx: 0.5, dy: -0.1, rx: 0.3, ry: 0.45 },
      { name: 'Rightflank Forest', tile: T.FOREST, dx: -0.1, dy: 0.58, rx: 0.3, ry: 0.18 },
      { name: 'Rightrump Forest', tile: T.FOREST, dx: -0.66, dy: 0.35, rx: 0.18, ry: 0.25 },
      { name: 'Hindquarter Swamp', tile: T.MUD, dx: -0.56, dy: -0.12, rx: 0.1, ry: 0.14 },
    ],
    towns: [{
      id: 'kurau_city', name: 'Kurau City', dx: -0.08, dy: 0.0, w: 50, h: 34, style: 'mink', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'hall', name: "Duke Inuarashi's Hall", npc: 'nw_inuarashi' },
        { role: 'doctor', name: 'Kurau City Infirmary', npc: 'nw_miyagi' },
        { role: 'dojo', name: 'Musketeer Training Hall', trainer: 'zou_minks' },
        { role: 'shop', name: 'Mokomo Market', shop: 'nw_mink_market' },
        { role: 'inn', name: 'Mokomo Inn' },
      ],
    }],
    landmarks: [
      { kind: 'building', role: 'hall', name: 'The Whale', npc: 'nw_nekomamushi', fw: 9, fd: 6, hgt: 7, wall: '#6d4c41', roof: '#2e7d32', roofType: 'hut', dx: 0.5, dy: -0.2, spot: 'the_whale' },
      { kind: 'poneglyph', road: true, poneglyph: 'road_zou', name: "Road Poneglyph (in the Whale's tail)", dx: 0.38, dy: -0.34, spot: 'zou_poneglyph' },
      { kind: 'gate', dx: -0.84, dy: 0.02, name: 'Front Gate of the Mokomo Dukedom', spot: 'front_gate' },
    ],
    spots: [{ id: 'whale_forest', dx: 0.42, dy: 0.02 }, { id: 'rightflank', dx: -0.1, dy: 0.56 }],
    logNext: ['whole_cake_island', 'cacao_island', 'wano'], logTime: 1,
    danger: 8,
    tagline: 'A thousand-year-old elephant walking the sea. On its back: the Mokomo Dukedom of the Minks.',
  },

  // --------------------------------------------------------- Whole Cake Island
  // The heart of Totto Land, Big Mom's 35-island nation of all races.
  {
    id: 'whole_cake_island', name: 'Whole Cake Island', sea: 'new_world', x: 846, y: 1062, w: 250, h: 204,
    climate: 'candy', rough: 0.2,
    population: [['human', 40], ['fishman', 12], ['mink', 12], ['longarm', 9], ['longleg', 9], ['buccaneer', 6], ['skypiean', 6], ['three_eye', 3]],
    blobs: [[0, 0, 0.88, 0.84], [-0.45, 0.45, 0.45, 0.4], [0.5, -0.4, 0.4, 0.4]],
    areas: [
      { name: 'Seducing Woods', tile: T.FOREST, dx: -0.48, dy: 0.45, rx: 0.3, ry: 0.3 },
      { name: 'Meringue Coast', tile: T.CAKE, dx: -0.68, dy: 0.72, rx: 0.2, ry: 0.14, overBeach: true },
      { name: 'Room of Treasure', tile: T.CARPET, dx: 0.12, dy: -0.38, rx: 0.05, ry: 0.05, rough: 0.05 },
    ],
    lakes: [{ dx: 0.5, dy: 0.05, rx: 0.1, ry: 0.15 }],
    rivers: [{ points: [[-0.15, 0.05], [-0.32, 0.35], [-0.55, 0.9]], width: 3 }],
    towns: [
      {
        id: 'sweet_city', name: 'Sweet City', dx: 0.0, dy: -0.1, w: 70, h: 48, style: 'candy', dockDir: 'n', plaza: 'fountain', plazaR: 6,
        buildings: [
          { role: 'palace', name: 'Whole Cake Chateau', npc: 'nw_big_mom', w: 14, d: 8, hgt: 7, wall: '#fce4ec', roof: '#f06292' },
          { role: 'cafe', name: 'Sweet City Patisserie', shop: 'nw_totto_sweets' },
          { role: 'shop', name: 'Totto Land Market', shop: 'nw_totto_sweets' },
          { role: 'inn', name: 'Frosting Inn' },
          { role: 'weapons', name: 'Biscuit Armory' },
          { role: 'doctor', name: 'Candy Clinic' },
        ],
      },
      {
        id: 'fire_tank_hideout', name: 'Fire Tank Hideout', dx: -0.62, dy: -0.42, w: 26, h: 18, style: 'port', dockDir: 'nw', plaza: false,
        buildings: [{ role: 'hall', name: 'Fire Tank Pirates Hideout', npc: 'nw_bege' }],
        houses: 1,
      },
    ],
    landmarks: [
      { kind: 'building', role: 'house', name: "Brûlée's House", npc: 'nw_brulee', fw: 6, fd: 4, hgt: 3, wall: '#d7ccc8', roof: '#4a148c', dx: -0.42, dy: 0.52, spot: 'brulee_house' },
      { kind: 'poneglyph', road: true, poneglyph: 'road_wci', name: 'Road Poneglyph (Room of Treasure)', dx: 0.12, dy: -0.38, spot: 'room_of_treasure' },
      { kind: 'pillar', dx: 0.07, dy: -0.4 }, { kind: 'pillar', dx: 0.17, dy: -0.4 },
      { kind: 'chest', dx: 0.16, dy: -0.35, tier: 3 },
      { kind: 'bench', dx: -0.04, dy: -0.34, name: 'Tea party tables', spot: 'tea_party_garden' },
    ],
    docks: [{ near: 'sweet_city', dir: 'n', name: 'Sweet City Port' }, { near: 'fire_tank_hideout', dir: 'nw', name: 'Fire Tank Cove' }],
    spots: [{ id: 'seducing_woods', dx: -0.48, dy: 0.38 }, { id: 'northeast_coast', dx: 0.7, dy: -0.55 }],
    logNext: ['wano', 'cacao_island', 'elbaf'], logTime: 1,
    danger: 9, music: 'town',
    tagline: 'Totto Land: Big Mom\'s utopia of all races, of sweets — and of a monthly tax paid in years of life.',
  },

  // -------------------------------------------------------------- Cacao Island
  {
    id: 'cacao_island', name: 'Cacao Island', sea: 'new_world', x: 660, y: 1188, w: 60, h: 48,
    climate: 'candy', ground: T.DIRT, beach: T.CAKE, rough: 0.25,
    population: [['human', 55], ['fishman', 12], ['mink', 12], ['longleg', 8], ['longarm', 8], ['three_eye', 5]],
    towns: [{
      id: 'chocolat_town', name: 'Chocolat Town', dx: 0.08, dy: 0.0, w: 34, h: 24, style: 'candy', dockDir: 'n', plaza: 'fountain',
      buildings: [
        { role: 'cafe', name: 'Caramel', npc: 'nw_pudding' },
        { role: 'hall', name: 'Sweets Factory', npc: 'nw_chiffon' },
        { role: 'inn', name: 'Chocolat Hot Springs' },
      ],
    }],
    landmarks: [{ kind: 'crystal', dx: -0.55, dy: 0.1, name: 'Great Mirror (to the Mirro-World)', spot: 'mirror_world' }],
    logNext: ['whole_cake_island', 'wano', 'sphinx'], logTime: 1,
    danger: 8,
    tagline: 'Everything in Chocolat Town is chocolate — even the fountains. Eating the roofs is illegal.',
  },
];
