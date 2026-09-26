// West Blue — bottom-left quadrant (x 90..1850, y 1350..1980). The sea of
// scholars, gangsters and lost kingdoms: Ohara (erased from every map),
// Kano Country of the Chinjao Family, the Ilisia Kingdom, the sunken ruins of
// God Valley, Esperia (the Land of Instrument Makers), Toroa, Soja Island,
// Las Camp and the Marine 80th Branch that watches the Reverse Mountain canal
// (its mouth is at (1898, 1342), top-right — that corner is kept open).
//
// Canon timeline at the game's "present" (the year a certain rubber boy set
// sail): the Ohara Incident was 20 years ago, the God Valley Incident 36 years
// ago, Esperia fell 60 years ago.
import { T } from '../../world/tiles.js';

export const WEST_BLUE = [
  // ------------------------------------------------------------------ Ohara
  {
    id: 'ohara', name: 'Ohara', sea: 'west_blue', x: 300, y: 1720, w: 180, h: 130,
    climate: 'temperate', rough: 0.22,
    blobs: [[0, 0, 0.82, 0.78], [-0.5, 0.3, 0.42, 0.45], [0.55, -0.25, 0.4, 0.45]],
    areas: [
      { name: 'Charred ruins of Ohara', tile: T.ASH, dx: 0.08, dy: -0.12, rx: 0.42, ry: 0.42 },
      { name: 'Woods of Ohara', tile: T.FOREST, dx: -0.58, dy: -0.08, rx: 0.26, ry: 0.42 },
      { name: "The scholars' collapsed basement", tile: T.GRAVEL, dx: 0.16, dy: -0.22, rx: 0.07, ry: 0.07 },
      { tile: T.ASH, dx: 0.5, dy: 0.18, rx: 0.12, ry: 0.1 },
    ],
    lakes: [{ dx: 0.4, dy: -0.38, rx: 0.11, ry: 0.1 }], // the Lake of Books
    trees: ['dead', 'oak', 'dead', 'pine'], treeDensity: 0.045, forestTrees: ['oak', 'pine', 'dead'],
    towns: [
      {
        id: 'ohara_camp', name: "Scholars' Camp", dx: -0.12, dy: 0.4, w: 40, h: 24, style: 'village', dockDir: 's', plaza: 'well', houses: 2,
        buildings: [
          { role: 'house', name: "Professor Alfalfa's Hut", npc: 'wb_alfalfa' },
          { role: 'inn', name: 'Lantern Tent Inn' },
          { role: 'shop', name: 'Camp Stores', shop: 'wb_ohara_stores' },
          { role: 'library', name: 'The Reading Tent' },
        ],
      },
    ],
    landmarks: [
      {
        kind: 'building', role: 'library', name: 'Husk of the Tree of Knowledge', dx: 0.02, dy: -0.3, fw: 12, fd: 7, hgt: 6, style: 'ruins', roofType: 'ruin',
        wall: '#4e342e', roof: '#3e2723', interact: 'Step inside the husk of the Tree of Knowledge', use: 'wb_tree_husk', interactRange: 3.2, spot: 'tree_husk',
      },
      { kind: 'poneglyph', poneglyph: 'ohara', name: 'Poneglyph of Ohara', dx: 0.17, dy: -0.2, spot: 'ohara_poneglyph' },
      { kind: 'statue', name: 'Memorial to the Scholars of Ohara', dx: -0.16, dy: -0.04, spot: 'memorial' },
      { kind: 'sign', name: 'The Lake of Books', dx: 0.27, dy: -0.24, spot: 'book_lake' },
      { kind: 'ruins', dx: -0.04, dy: 0.08 }, { kind: 'ruins', dx: 0.26, dy: 0.04 }, { kind: 'ruins', dx: -0.24, dy: -0.26 },
      { kind: 'ruins', dx: 0.36, dy: 0.12 }, { kind: 'ruins', dx: 0.1, dy: 0.1 }, { kind: 'grave', dx: -0.2, dy: 0.02, name: 'A scholar\'s grave' },
      { kind: 'shipwreck', name: 'Wreck of the evacuation ship', dx: 0.46, dy: 0.42, spot: 'evac_wreck' },
      { kind: 'boat', name: 'Where the ice path began', dx: 0.8, dy: -0.3, spot: 'ice_beach' },
      { kind: 'bones', name: "The remains of a giant's raft", dx: -0.78, dy: 0.3, spot: 'saul_beach' },
      { kind: 'tent', dx: 0.26, dy: 0.34, v: 1 }, { kind: 'campfire', dx: 0.3, dy: 0.38 }, { kind: 'tent', dx: 0.36, dy: 0.3, v: 0 },
    ],
    spots: [{ id: 'camp_edge', dx: 0.14, dy: 0.26 }],
    population: [['human', 86], ['three_eye', 6], ['longarm', 4], ['longleg', 4]],
    danger: 2, music: 'night',
    tagline: 'Erased from every map. The ashes still remember.',
    rumors: [
      'Twenty years ago the Marines burned this island with a Buster Call. Ten battleships, five Vice Admirals — against a library.',
      'The scholars threw their books into the lake while the Tree of Knowledge burned. A few months later, giants came and fished them out. Nobody knows where they took them.',
      'There is a stone in the ruins that cannons could not scratch. The scholars died for what is written on it.',
      'The Government says only one child survived. She had a bounty of 79 million on her head at eight years old.',
    ],
  },
  {
    // The unnamed island "far to the northeast of Ohara" where an eight-year-old
    // Nico Robin boarded a passenger ship and was spotted by the Marines.
    id: 'passage_isle', name: 'Passage Island', sea: 'west_blue', x: 560, y: 1560, w: 110, h: 80,
    climate: 'temperate', rough: 0.28,
    blobs: [[0, 0, 0.85, 0.8], [0.4, 0.35, 0.4, 0.4]],
    areas: [{ tile: T.FARM, dx: -0.4, dy: -0.25, rx: 0.2, ry: 0.15, name: 'Potato fields' }, { tile: T.FOREST, dx: 0.3, dy: -0.35, rx: 0.25, ry: 0.25 }],
    towns: [
      {
        id: 'wb_passage_port', name: 'Passage Port', dx: -0.05, dy: 0.15, w: 44, h: 26, style: 'port', dockDir: 'e', plaza: 'well',
        buildings: [
          { role: 'shop', name: 'Kanezenny Pawnshop', npc: 'wb_kanezenny' },
          { role: 'inn', name: 'Ferry House Inn' },
          { role: 'bar', name: "Ferryman's Rest" },
        ],
      },
    ],
    landmarks: [{ kind: 'sign', dx: 0.45, dy: 0.1, name: 'Ferry schedule (faded)', spot: 'ferry_sign' }, { kind: 'boat', dx: 0.62, dy: 0.2 }],
    danger: 1,
    tagline: 'Twenty years ago, a little girl from a burning island boarded a ferry here.',
    rumors: [
      'The Marines spotted the "Devil Child" of Ohara on a ferry from this island. That\'s how they learned she was alive.',
      'Old Kanezenny at the pawnshop buys anything that washes up from the southwest. Anything. Ask him what he pays for burnt books.',
      'Don\'t sail southwest looking for Ohara. It isn\'t on the charts anymore. ...Well. The current will take you there anyway.',
    ],
  },

  // ---------------------------------------------------------- God Valley
  {
    // God Valley sank beneath the sea after the God Valley Incident and was
    // declared never to have existed. Only the broken "praying hands" still
    // break the surface.
    id: 'god_valley', name: 'God Valley', sea: 'west_blue', x: 710, y: 1400, w: 120, h: 80,
    climate: 'rocky', rough: 0.38, archipelago: true,
    blobs: [[-0.4, 0, 0.42, 0.72], [0.4, 0.05, 0.42, 0.66], [0.02, 0.62, 0.16, 0.18], [0.82, -0.62, 0.12, 0.15], [-0.82, 0.58, 0.12, 0.14]],
    mountains: [
      { name: 'The Fallen Hand (west)', dx: -0.48, dy: -0.32, r: 0.2, h: 0.8 },
      { name: 'The Fallen Hand (east)', dx: 0.5, dy: -0.28, r: 0.2, h: 0.8 },
    ],
    paint: [
      { op: 'path', points: [[-0.35, -1.1], [0, 0], [0.35, 1.1]], width: 6, tile: T.REEF },
      { op: 'path', points: [[-0.32, 0.18], [0.32, 0.18]], width: 3, tile: T.BRIDGE },
    ],
    areas: [
      { name: 'Drowned canyon town', tile: T.GRAVEL, dx: 0.36, dy: 0.3, rx: 0.2, ry: 0.2 },
      { name: "The World Nobles' hunting grounds", tile: T.DIRT, dx: -0.4, dy: 0.32, rx: 0.2, ry: 0.2 },
    ],
    trees: ['dead', 'rock', 'pine'], treeDensity: 0.02,
    landmarks: [
      { kind: 'ruins', dx: 0.3, dy: 0.25 }, { kind: 'ruins', dx: 0.44, dy: 0.34 }, { kind: 'ruins', dx: 0.36, dy: 0.44 },
      { kind: 'sign', dx: -0.22, dy: 0.36, name: '"THIS ISLAND DOES NOT EXIST." — by order of the World Government', spot: 'gv_notice' },
      { kind: 'bones', dx: -0.45, dy: 0.26 }, { kind: 'grave', dx: -0.5, dy: 0.42, name: 'Graves of the hunted' }, { kind: 'grave', dx: -0.36, dy: 0.46 },
      { kind: 'shipwreck', dx: 0.52, dy: 0.1, name: 'Wreck of a Rocks Pirates longboat', spot: 'rocks_wreck' },
      { kind: 'tent', dx: -0.52, dy: 0.08, v: 1, spot: 'coyote_camp' }, { kind: 'campfire', dx: -0.46, dy: 0.14 },
    ],
    spots: [
      { id: 'hunting_lodge', dx: -0.38, dy: 0.34 },
      { id: 'canyon_town', dx: 0.38, dy: 0.36 },
      { id: 'valley_deep', dx: 0.02, dy: -1.25 },
    ],
    docks: [{ dx: -0.52, dy: 0.3, dir: 'sw', len: 6, name: 'God Valley landing' }],
    noFruit: true, danger: 3, music: 'night',
    tagline: 'An island that officially never existed.',
    rumors: [
      'Thirty-six years ago the Celestial Dragons held a "Native Hunting Competition" here. Then the Rocks Pirates came, and Roger, and Garp... and the island sank.',
      'The Government says there never was an island called God Valley. Then who are all these graves for?',
      'Something big nests in the drowned ravine. Fishermen who anchor over it don\'t come back.',
    ],
  },

  // ------------------------------------------------------------- Esperia
  {
    // "The Land of Instrument Makers", destroyed by the World Government 60
    // years ago. A few craftsmen have come back to Cello Port.
    id: 'esperia', name: 'Esperia Kingdom', sea: 'west_blue', x: 860, y: 1830, w: 200, h: 120,
    climate: 'autumn', rough: 0.22, archipelago: true,
    blobs: [[-0.16, 0, 0.72, 0.85], [0.8, 0.36, 0.18, 0.28]],
    mountains: [{ name: 'Palace Heights', dx: -0.2, dy: -0.42, r: 0.2, h: 0.4 }],
    paint: [
      { op: 'path', points: [[0.5, 0.32], [0.66, 0.35]], width: 3, tile: T.BRIDGE },
      { op: 'path', points: [[-0.2, -0.22], [0.1, -0.1], [0.3, -0.02]], width: 3, tile: T.COBBLE, onlyLand: true },
    ],
    areas: [
      { name: 'Theater Street', tile: T.COBBLE, dx: 0.14, dy: -0.06, rx: 0.2, ry: 0.06 },
      { name: 'Trash Dump', tile: T.GRAVEL, dx: -0.7, dy: 0.3, rx: 0.12, ry: 0.13 },
      { name: 'Overgrown palace gardens', tile: T.FLOWERS, dx: -0.26, dy: -0.14, rx: 0.13, ry: 0.08 },
    ],
    trees: ['autumn', 'oak', 'dead'], treeDensity: 0.05,
    towns: [
      {
        id: 'esperia_town', name: 'Cello Port', dx: 0.08, dy: 0.46, w: 50, h: 26, style: 'town', dockDir: 's', plaza: 'fountain',
        buildings: [
          { role: 'shop', name: "Instrument Makers' Guild", npc: 'wb_ottavio' },
          { role: 'inn', name: 'Cello Port Inn' },
          { role: 'shop', name: 'Cello Port Chandlery' },
          { role: 'bar', name: 'The Broken String' },
        ],
      },
    ],
    landmarks: [
      {
        kind: 'building', role: 'palace', name: 'Esperia Palace — the Great Harp', dx: -0.2, dy: -0.26, fw: 13, fd: 7, hgt: 5, style: 'ruins', roofType: 'ruin',
        wall: '#e0d6c8', roof: '#a1887f', interact: 'Walk among the ruins of Esperia Palace', use: 'wb_harp', interactRange: 3.2, spot: 'palace',
      },
      { kind: 'pillar', dx: -0.34, dy: -0.18 }, { kind: 'pillar', dx: -0.06, dy: -0.18 },
      {
        kind: 'building', role: 'hall', name: 'Opera House (ruins)', dx: 0.32, dy: -0.12, fw: 9, fd: 6, hgt: 4, style: 'ruins', roofType: 'ruin',
        wall: '#d7ccc8', roof: '#8d6e63', interact: 'Step into the ruined Opera House', use: 'wb_opera', interactRange: 3, spot: 'opera_house',
      },
      { kind: 'building', role: 'house', name: 'The old music school', dx: -0.5, dy: 0.04, fw: 7, fd: 4, hgt: 3, style: 'ruins', roofType: 'ruin', wall: '#bcaaa4', roof: '#795548' },
      { kind: 'statue', dx: 0.12, dy: -0.2, name: 'Statue of Queen Candelle' },
      { kind: 'crate', dx: -0.72, dy: 0.24 }, { kind: 'barrel', dx: -0.66, dy: 0.34 }, { kind: 'bones', dx: -0.76, dy: 0.36 },
      { kind: 'lighthouse', dx: 0.82, dy: 0.3, name: 'Cello Point Light' },
    ],
    spots: [{ id: 'trash_dump', dx: -0.7, dy: 0.3 }, { id: 'theater_street', dx: 0.16, dy: -0.04 }],
    danger: 2,
    tagline: 'The Land of Instrument Makers. Its music stopped sixty years ago.',
    rumors: [
      'Sixty years ago a mist covered Esperia for six months. The instruments rotted, the Queen died, and then the World Government declared war.',
      'The captain of Esperia\'s Battle Convoy was a gangly musician who hummed while he fought. They say he went to sea and never came back.',
      'The Moulon Family has been poking around the Opera House ruins. Mafia men don\'t care about music — only about what old instruments sell for.',
    ],
  },

  // -------------------------------------------------------------- Kano Country
  {
    // 花ノ国, "the Country of Flowers": a Chinese-style kingdom among tall
    // rock spires, home of the Chinjao Family and the Happo Navy.
    id: 'kano_country', name: 'Kano Country', sea: 'west_blue', x: 1080, y: 1590, w: 260, h: 170,
    climate: 'spring', rough: 0.22,
    blobs: [[0, 0, 0.85, 0.8], [-0.55, 0.35, 0.4, 0.4], [0.55, -0.35, 0.38, 0.4]],
    mountains: [
      { name: 'Drill Spire', dx: 0.22, dy: -0.58, r: 0.06, h: 1.35 },
      { name: 'Spire of the Eighth Impact', dx: 0.6, dy: -0.5, r: 0.07, h: 1.4 },
      { name: 'Needle Spire', dx: 0.72, dy: -0.12, r: 0.05, h: 1.3 },
      { name: 'Old Twelve', dx: -0.1, dy: -0.62, r: 0.06, h: 1.3 },
      { dx: -0.72, dy: -0.25, r: 0.05, h: 1.25 },
      { dx: 0.05, dy: 0.62, r: 0.05, h: 1.25 },
    ],
    areas: [
      { name: 'Flower fields of Kano', tile: T.FLOWERS, dx: -0.3, dy: -0.38, rx: 0.18, ry: 0.13 },
      { name: 'Rice terraces', tile: T.FARM, dx: 0.1, dy: 0.28, rx: 0.16, ry: 0.1 },
      { name: 'Hasshoken training ground', tile: T.STONE, dx: 0.4, dy: -0.26, rx: 0.08, ry: 0.07 },
    ],
    rivers: [{ points: [[-0.02, -0.75], [0.0, -0.2], [0.18, 0.2], [0.22, 0.95]], width: 3 }],
    trees: ['blossom', 'bamboo', 'oak', 'bamboo'], treeDensity: 0.05,
    towns: [
      {
        id: 'kano_town', name: 'Kano Royal Capital', dx: -0.4, dy: 0.02, w: 66, h: 46, style: 'chinese', walls: true, dockDir: 'w', plaza: 'statue', plazaR: 5,
        buildings: [
          { role: 'palace', name: 'Palace of King Ramen', npc: 'wb_ramen', w: 12, d: 7 },
          { role: 'dojo', name: 'Chinjao Family Hall', npc: 'wb_chinjao', trainer: 'chinjao_master' },
          { role: 'inn', name: 'Peony Inn' },
          { role: 'shop', name: 'Eight Treasures Market', shop: 'wb_kano_market' },
          { role: 'restaurant', name: 'Noodle House of the Flower Country' },
          { role: 'doctor', name: 'Herbalist of Kano' },
          { role: 'weapons', name: 'Kano Armory' },
        ],
      },
      {
        id: 'wb_happo_harbor', name: 'Happo Navy Harbor', dx: 0.45, dy: 0.3, w: 46, h: 30, style: 'chinese', dockDir: 'e', plaza: 'flagpole',
        buildings: [
          { role: 'hall', name: 'Happo Navy Headquarters', npc: 'wb_sai' },
          { role: 'shipwright', name: 'Happosai Drydock' },
          { role: 'tavern', name: 'Eight Treasures Tavern' },
        ],
      },
    ],
    landmarks: [
      { kind: 'bell', name: 'Bell of the Eight Impacts', dx: 0.44, dy: -0.38, spot: 'spire_bell' },
      { kind: 'dummy', dx: 0.34, dy: -0.22 }, { kind: 'dummy', dx: 0.46, dy: -0.2 },
      { kind: 'pillar', dx: 0.32, dy: -0.32 }, { kind: 'pillar', dx: 0.5, dy: -0.32 },
      { kind: 'gate', dx: 0.4, dy: -0.12, name: 'Gate of the Hasshoken' },
      { kind: 'lantern', dx: -0.02, dy: 0.02, light: true }, { kind: 'lantern', dx: 0.12, dy: 0.12, light: true },
    ],
    spots: [{ id: 'trial_ground', dx: 0.4, dy: -0.24 }],
    danger: 2,
    tagline: 'The Country of Flowers — where fists make armour ring like a bell.',
    rumors: [
      'Old Don Chinjao was worth 542 million in his day. They say his head was as sharp as a drill — until Vice Admiral Garp punched it flat.',
      'The Happo Navy is a thousand strong. Sai is their thirteenth leader; the old man was the twelfth. Look for the number tattooed on them.',
      'The Hasshoken sends vibrations through a shield and into the man behind it. Blocking only makes it hurt more.',
      'Don Chinjao wants Sai to marry the daughter of the Niho Navy\'s leader. Sai says there\'s no need. No need at all!',
    ],
  },
  {
    id: 'ballywood', name: 'Ballywood Kingdom', sea: 'west_blue', x: 1180, y: 1400, w: 170, h: 90,
    climate: 'tropical', rough: 0.22,
    blobs: [[0, 0, 0.85, 0.8], [-0.5, -0.3, 0.35, 0.4]],
    mountains: [{ name: 'Mount Marquee', dx: -0.5, dy: -0.45, r: 0.16, h: 0.55 }],
    areas: [
      { name: 'Studio lots', tile: T.STONE, dx: 0.45, dy: -0.2, rx: 0.16, ry: 0.14 },
      { name: 'Cemetery of the Stars', tile: T.LAWN, dx: -0.55, dy: 0.25, rx: 0.12, ry: 0.14 },
      { tile: T.DESERT, dx: 0.55, dy: 0.35, rx: 0.2, ry: 0.15 },
    ],
    trees: ['palm', 'oak', 'cactus'], treeDensity: 0.03,
    towns: [
      {
        id: 'wb_ballywood_city', name: 'Ballywood', dx: 0.02, dy: 0.08, w: 62, h: 40, style: 'city', dockDir: 's', plaza: 'fountain',
        buildings: [
          { role: 'palace', name: 'Palace of King Ham Burger', npc: 'wb_ham_burger', w: 12, d: 7 },
          { role: 'hall', name: 'Ballywood Grand Theater', npc: 'wb_bernadette' },
          { role: 'inn', name: 'Marquee Hotel' },
          { role: 'shop', name: 'Poster & Costume Shop', shop: 'outfitter' },
          { role: 'cafe', name: 'Silver Screen Café' },
          { role: 'doctor', name: 'Ballywood Clinic' },
        ],
      },
    ],
    landmarks: [
      { kind: 'sign', dx: -0.5, dy: -0.25, name: 'B A L L Y W O O D (giant letters on the hill)' },
      { kind: 'grave', dx: -0.55, dy: 0.2, name: 'Grave of Victoria Cindry', spot: 'cindry_grave' },
      { kind: 'grave', dx: -0.62, dy: 0.28 }, { kind: 'grave', dx: -0.48, dy: 0.3 },
      { kind: 'building', role: 'house', name: "Dr. Hogback's clinic (boarded up)", dx: 0.55, dy: 0.28, fw: 7, fd: 4, hgt: 3, style: 'city', roofType: 'ruin', wall: '#b0bec5', roof: '#546e7a', interact: 'Search the boarded-up clinic', use: 'wb_hogback_clinic', interactRange: 2.6, spot: 'hogback_clinic' },
      { kind: 'lamp', dx: 0.4, dy: -0.1, light: true }, { kind: 'lamp', dx: 0.5, dy: -0.1, light: true },
    ],
    danger: 1,
    tagline: 'The kingdom of the silver screen. Every face here wants to be famous.',
    rumors: [
      'Victoria Cindry was the greatest actress the West Blue ever had. She fell from the stage ten years ago. Her fiancé still leaves flowers on her grave.',
      'The genius surgeon Hogback vanished the same year Miss Cindry died. Some say he was kidnapped. Doctors all over the world are still in an uproar.',
      'King Ham Burger has a hat as tall as a chimney and the patience of a saint. He hopes to chair a Levely one day.',
    ],
  },

  // ---------------------------------------------------------------- Toroa
  {
    // Hometown of Byron, "descended from a long line of musicians".
    id: 'toroa', name: 'Toroa', sea: 'west_blue', x: 1390, y: 1870, w: 140, h: 96,
    climate: 'temperate', rough: 0.25,
    blobs: [[0, 0, 0.85, 0.8], [0.45, -0.35, 0.4, 0.4]],
    areas: [
      { name: 'Toroa vineyards', tile: T.FARM, dx: 0.4, dy: -0.32, rx: 0.26, ry: 0.2 },
      { tile: T.FLOWERS, dx: -0.5, dy: -0.3, rx: 0.15, ry: 0.12 },
    ],
    trees: ['oak', 'bush', 'blossom'],
    towns: [
      {
        id: 'toroa_town', name: 'Toroa', dx: -0.18, dy: 0.18, w: 48, h: 30, style: 'town', dockDir: 's', plaza: 'fountain',
        buildings: [
          { role: 'hall', name: 'Toroa Music Hall', npc: 'wb_byron' },
          { role: 'inn', name: 'The Tuning Fork Inn' },
          { role: 'shop', name: 'Toroa General Store' },
          { role: 'bar', name: 'The Cellar', shop: 'wb_toroa_cellar' },
        ],
      },
    ],
    landmarks: [
      { kind: 'windmill', dx: 0.62, dy: -0.12 },
      { kind: 'barrel', dx: 0.3, dy: -0.12 }, { kind: 'barrel', dx: 0.34, dy: -0.1 }, { kind: 'haystack', dx: 0.52, dy: -0.5 },
      { kind: 'boat', dx: 0.7, dy: -0.55, name: 'A slaver\'s longboat', spot: 'vineyard_cove' },
    ],
    danger: 1,
    tagline: 'Vineyards, violins, and a family of musicians older than the town hall.',
    rumors: [
      'Byron\'s family has made music in Toroa for seven generations. He plays anything with strings — and makes a red wine to cry for.',
      'Strangers have been asking about Byron. Men with nets and very clean hands.',
      'They say at the Sabaody Archipelago you can buy a person. A human shop. I thought it was a story to scare children.',
    ],
  },

  // ----------------------------------------------------------- Soja Island
  {
    // 双蛇島, "Twin Snakes Island": a gambling town. A blind man lost everything
    // at its tables and now guards the house to pay it back.
    id: 'soja_island', name: 'Soja Island', sea: 'west_blue', x: 1620, y: 1690, w: 160, h: 104,
    climate: 'tropical', rough: 0.26,
    blobs: [[-0.45, -0.12, 0.5, 0.36], [0.45, 0.12, 0.5, 0.36], [0, 0, 0.3, 0.5]],
    areas: [{ tile: T.SAND, dx: -0.7, dy: 0.2, rx: 0.12, ry: 0.1 }, { tile: T.FOREST, dx: 0.62, dy: 0.18, rx: 0.2, ry: 0.18 }],
    trees: ['palm', 'jungle', 'bush'],
    towns: [
      {
        id: 'soja_village', name: 'Soja Village', dx: -0.06, dy: -0.02, w: 52, h: 32, style: 'town', dockDir: 'n', plaza: 'fountain',
        buildings: [
          { role: 'bar', name: 'Twin Snakes Gambling House', npc: 'wb_mamba' },
          { role: 'inn', name: 'Snake Eyes Inn' },
          { role: 'shop', name: 'Soja General Store' },
          { role: 'doctor', name: 'Soja Clinic' },
          { role: 'bank', name: 'Twin Snakes Moneylender' },
        ],
      },
    ],
    landmarks: [
      { kind: 'statue', dx: -0.46, dy: -0.36, name: 'The Western Snake' }, { kind: 'statue', dx: 0.46, dy: 0.34, name: 'The Eastern Snake' },
      { kind: 'lantern', dx: -0.3, dy: 0.2, light: true }, { kind: 'lantern', dx: 0.2, dy: -0.28, light: true },
    ],
    spots: [{ id: 'back_alley', dx: 0.22, dy: 0.2 }],
    danger: 2,
    tagline: 'Twin Snakes Island. The house always wins.',
    rumors: [
      'The Twin Snakes Gambling House belongs to Don Mamba — one of the Five Families of the West. Nobody has ever won big there. Nobody.',
      'The house bodyguard is a blind man with a cane. He lost every coin he had at the dice tables, so now he works it off. I saw him cut a flying bottle in half without turning his head.',
      'Men in fine suits from Las Camp have been drinking at the Snake Eyes Inn. Fire Tank men. Somebody\'s going to lose their head.',
    ],
  },

  // --------------------------------------------------------- Ilisia Kingdom
  {
    id: 'ilisia', name: 'Ilisia Kingdom', sea: 'west_blue', x: 1500, y: 1440, w: 220, h: 120,
    climate: 'temperate', rough: 0.2,
    blobs: [[0, 0, 0.85, 0.8], [-0.55, 0.3, 0.4, 0.45], [0.6, -0.2, 0.35, 0.45]],
    mountains: [{ name: 'Castle Hill', dx: -0.02, dy: -0.62, r: 0.1, h: 0.4 }],
    areas: [
      { tile: T.FARM, dx: -0.55, dy: -0.28, rx: 0.18, ry: 0.14, name: 'Royal farms' },
      { tile: T.FOREST, dx: 0.62, dy: -0.25, rx: 0.2, ry: 0.28, name: 'Royal Hunting Forest' },
    ],
    towns: [
      {
        id: 'ilisia_town', name: 'Ilisia Royal Capital', dx: -0.14, dy: -0.06, w: 68, h: 46, style: 'noble', walls: true, dockDir: 'n', plaza: 'fountain', plazaR: 5,
        buildings: [
          { role: 'palace', name: 'Ilisia Palace', npc: 'wb_lucas', w: 12, d: 7 },
          { role: 'inn', name: 'Crown & Anchor Inn' },
          { role: 'shop', name: 'Royal Arcade' },
          { role: 'weapons', name: 'Royal Armory' },
          { role: 'library', name: 'Royal Archive of Ilisia' },
          { role: 'hall', name: 'Royal Guard Barracks', npc: 'wb_gallardo' },
        ],
      },
      {
        id: 'wb_ilisia_harbor', name: 'Ilisia Harbor', dx: 0.42, dy: 0.42, w: 46, h: 26, style: 'port', dockDir: 's', plaza: 'well',
        buildings: [
          { role: 'tavern', name: 'The Salted Crown' },
          { role: 'shipwright', name: 'Ilisia Shipyard' },
          { role: 'bounty', name: 'Harbor Bounty Office' },
          { role: 'house', name: 'Warehouse No. 8', npc: 'wb_refugee' },
        ],
      },
    ],
    landmarks: [{ kind: 'statue', dx: 0.1, dy: 0.3, name: 'Statue of the first King of Ilisia' }, { kind: 'lighthouse', dx: 0.82, dy: 0.2 }],
    spots: [{ id: 'smugglers_cove', dx: 0.72, dy: 0.36 }],
    danger: 2,
    tagline: 'A loyal kingdom of the World Government, and a king who reads the wind.',
    rumors: [
      'Eight years ago at the Levely, our King Lucas showed the whole world a photograph of a man named Dragon. He said that man would be a thorn in the Government\'s side within six years.',
      'Pamphlets keep turning up in the harbour: "The world is not what they tell you." The Royal Guard burns them by the crate.',
      'Refugees from a kingdom that couldn\'t pay the Heavenly Tribute are hiding somewhere in the harbour. The Guard will pay for names.',
    ],
  },

  // --------------------------------------------------- Marine 80th Branch
  {
    id: 'marine_80th', name: 'Marine 80th Branch', sea: 'west_blue', x: 1765, y: 1565, w: 100, h: 70,
    climate: 'temperate', rough: 0.18,
    towns: [
      {
        id: 'wb_marine_80th', name: '80th Branch Base', dx: -0.04, dy: 0.06, w: 48, h: 34, style: 'marine', walls: true, dockDir: 'n', plaza: 'flagpole', houses: 1,
        buildings: [
          { role: 'marine_base', name: '80th Branch HQ', npc: 'wb_burdock', w: 10, d: 6, hgt: 4 },
          { role: 'inn', name: 'Barracks Mess Hall' },
          { role: 'shop', name: 'Quartermaster' },
          { role: 'trainer', name: 'Drill Yard', npc: 'wb_drill_instructor' },
        ],
      },
    ],
    landmarks: [
      { kind: 'lighthouse', dx: 0.72, dy: -0.38, name: 'Canal Watchtower' },
      { kind: 'cannon', dx: 0.62, dy: 0.3 }, { kind: 'cannon', dx: -0.62, dy: 0.3 },
    ],
    danger: 2,
    tagline: 'The Marines of the 80th Branch watch the canal to Reverse Mountain.',
    rumors: [
      'Every pirate in the West Blue who dreams of the Grand Line has to sail past this base to reach Reverse Mountain.',
      'Captain Burdock hasn\'t slept since the Raccoon Pirates started raiding Las Camp.',
    ],
  },

  // -------------------------------------------------------------- Las Camp
  {
    // Las Camp, a stretch of sea in the West Blue plagued by pirates — and the
    // home turf of the Fire Tank Family, one of the Five Families of the West.
    id: 'las_camp', name: 'Las Camp', sea: 'west_blue', x: 1700, y: 1890, w: 170, h: 100,
    climate: 'temperate', rough: 0.28, archipelago: true,
    blobs: [[-0.1, 0, 0.75, 0.8], [0.8, 0.36, 0.16, 0.24], [0.74, -0.52, 0.13, 0.18]],
    areas: [{ tile: T.GRAVEL, dx: 0.48, dy: 0.4, rx: 0.12, ry: 0.1, name: 'Raiders\' landing' }],
    trees: ['oak', 'bush'], treeDensity: 0.03,
    towns: [
      {
        id: 'las_camp_town', name: 'Las Camp', dx: -0.2, dy: -0.02, w: 70, h: 46, style: 'city', dockDir: 'n', plaza: 'fountain', plazaR: 5,
        buildings: [
          { role: 'restaurant', name: 'Ristorante Castello', npc: 'wb_bege' },
          { role: 'bar', name: 'Fire Tank Social Club', npc: 'wb_vito' },
          { role: 'inn', name: 'Hotel Las Camp' },
          { role: 'shop', name: 'Las Camp Emporium' },
          { role: 'shop', name: 'Pinstripe Tailor', shop: 'wb_las_camp_tailor' },
          { role: 'weapons', name: 'Gunsmith Row' },
          { role: 'doctor', name: 'Back-Alley Clinic' },
          { role: 'bounty', name: 'Police Headquarters', npc: 'wb_gordo' },
        ],
      },
    ],
    landmarks: [
      { kind: 'shipwreck', dx: 0.52, dy: 0.46, name: "Raccoon Pirates' landing boat", spot: 'raider_landing' },
      { kind: 'crate', dx: 0.42, dy: 0.34 }, { kind: 'barrel', dx: 0.46, dy: 0.3 },
      { kind: 'statue', dx: 0.3, dy: -0.4, name: 'Monument to the Five Families (defaced)' },
    ],
    danger: 3,
    tagline: 'Five Families, one city, and every one of them wants the others\' heads.',
    rumors: [
      'The Five Families of the West run everything that happens after dark in this sea. Capone Bege\'s Fire Tank Family has already taken down the heads of three of them.',
      'Bege never takes a family\'s turf. He takes the boss\'s head and his treasure, then sits back and watches the rest of them tear each other apart.',
      'This city used to have a sheriff so violent that even the police exiled him from the West Blue. They called him the Demon Sheriff.',
      'The Raccoon Pirates hit the south shore every few nights. Their captain plays dead when he\'s losing. Don\'t fall for it.',
    ],
  },

  // ------------------------------------------------- Asshina Gainone Kingdom
  {
    // Homeland of the Longleg Tribe in this world, famous for its colosseum.
    id: 'asshina', name: 'Asshina Gainone Kingdom', sea: 'west_blue', x: 520, y: 1880, w: 150, h: 100,
    climate: 'tropical', rough: 0.24,
    blobs: [[0, 0, 0.85, 0.8], [-0.4, -0.35, 0.4, 0.4]],
    mountains: [{ dx: -0.5, dy: -0.5, r: 0.14, h: 0.6, name: 'Stilt Mountain' }],
    areas: [{ tile: T.DIRT, dx: 0.4, dy: -0.28, rx: 0.14, ry: 0.12, name: 'Sprinting track' }, { tile: T.FARM, dx: -0.1, dy: -0.3, rx: 0.12, ry: 0.1 }],
    trees: ['palm', 'oak', 'bush'],
    towns: [
      {
        id: 'asshina_town', name: 'Asshina', dx: 0.02, dy: 0.2, w: 52, h: 34, style: 'town', dockDir: 's', plaza: 'statue',
        buildings: [
          { role: 'hall', name: 'Colosseum of the Long Stride', npc: 'wb_colosseum_master' },
          { role: 'dojo', name: 'Stride Dojo', npc: 'wb_stride_master', trainer: 'wb_asshina_kicks' },
          { role: 'inn', name: 'Long Stride Inn' },
          { role: 'shop', name: 'Asshina Market' },
          { role: 'doctor', name: 'Bonesetter' },
        ],
      },
    ],
    landmarks: [{ kind: 'dummy', dx: 0.36, dy: -0.26 }, { kind: 'dummy', dx: 0.44, dy: -0.26 }, { kind: 'flagpole', dx: 0.4, dy: -0.4 }],
    spots: [{ id: 'arena_sands', dx: 0.36, dy: -0.18 }],
    population: [['longleg', 78], ['human', 16], ['longarm', 6]],
    danger: 1,
    tagline: 'The kingdom of the Longleg Tribe. Everything here is built one storey too tall.',
    rumors: [
      'A Longleg kick can snap a mast. Their gladiators fight barefoot so they can feel the sand.',
      'Longarms and Longlegs have been rivals since before anyone can remember. It gets loud at the Colosseum when a Longarm signs up.',
      'The Colosseum champion, "Secretarybird" Serena, kicks snakes to death for breakfast. Or so she says.',
    ],
  },
];
