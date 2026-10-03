// Paradise, first half — from the foot of Reverse Mountain to Long Ring Long
// Land. Canon route (x increasing): Twin Cape → one of the seven routes
// (Cactus Island / Whisky Peak is the Straw Hats' one) → Little Garden →
// Drum Island → (Nanimonai Island) → Alabasta → Jaya (Knock Up Stream to
// Skypiea, a zone) → Long Ring Long Land → Water 7 (next agent's half).
//
// The seven first islands reachable from Twin Cape: Cactus Island, Kyuka
// Island, Kenzan Island, Foolshout Island and Vira (canon Paradise / Grand Line
// islands), Ruluka Island and Navarone (anime-only). The routes merge again at
// Little Garden and Drum Island.
//
// Kept clear: the canal lane y 1010..1040 for x 2200..2300 (Reverse Mountain's
// exit), x - w/2 > 2228 (Reverse Mountain box), x + w/2 <= 3126.
import { T } from '../../world/tiles.js';

export const PARADISE_1 = [
  // ------------------------------------------------------------ Twin Cape
  // Two capes flank the mouth of the canal down Reverse Mountain; Crocus
  // keeps the northern lighthouse. Laboon floats in the bay to the west,
  // facing the Red Line.
  {
    id: 'twin_cape', name: 'Twin Cape', sea: 'paradise', x: 2268, y: 1025, w: 76, h: 150,
    climate: 'temperate', rough: 0.1, archipelago: true,
    blobs: [[0.04, -0.6, 0.92, 0.29], [-0.45, -0.52, 0.42, 0.2], [0.04, 0.6, 0.92, 0.29], [-0.45, 0.52, 0.42, 0.2]],
    trees: ['palm', 'bush'], treeDensity: 0.03,
    areas: [
      { name: "Crocus' garden", tile: T.FLOWERS, dx: 0.25, dy: -0.66, rx: 0.2, ry: 0.07 },
      { tile: T.GRAVEL, dx: -0.6, dy: -0.5, rx: 0.16, ry: 0.07 },
    ],
    landmarks: [
      { kind: 'lighthouse', dx: -0.62, dy: -0.5, name: "Crocus' Lighthouse", spot: 'lighthouse' },
      { kind: 'lighthouse', dx: -0.62, dy: 0.5, name: 'South Lighthouse' },
      { kind: 'sign', dx: -0.2, dy: -0.58, name: 'The Rumbar Pirates promised to come back', spot: 'rumbar_sign', loreLabel: 'Read the old carving', lore: '(Carved into the post and worn by fifty years of sea spray:) "LABOON — wait for us here. We will sail around the world and come back for you. — The Rumbar Pirates."' },
      { kind: 'bench', dx: 0.05, dy: -0.62 },
      { kind: 'boat', dx: 0.55, dy: -0.72 },
      { kind: 'anchor', dx: -0.3, dy: 0.62 },
    ],
    spots: [
      { id: 'laboon_bay', dx: -58, dy: -0.58 },
      { id: 'harpoon_point', dx: -0.8, dy: -0.62 },
    ],
    docks: [{ dx: 0.62, dy: -0.6, dir: 'e', len: 5, name: 'Twin Cape Pier' }],
    logNext: ['cactus_island', 'kyuka_island', 'kenzan_island', 'foolshout_island', 'ruluka_island', 'navarone', 'vira'], logTime: 1,
    danger: 3, tagline: 'The canal down Reverse Mountain ends here — and a whale still waits for friends who never came back.', music: 'grandline',
  },

  // ------------------------------------------------- the seven routes: 1. Navarone (G-8)
  {
    id: 'navarone', name: 'Navarone', sea: 'paradise', x: 2268, y: 882, w: 58, h: 56,
    climate: 'temperate', rough: 0.18,
    blobs: [[0, 0.05, 0.9, 0.85], [0.55, -0.55, 0.3, 0.3]],
    mountains: [{ name: 'The Hedgehog', dx: 0.4, dy: -0.45, r: 0.2, h: 0.8 }],
    lakes: [{ dx: -0.4, dy: -0.45, rx: 0.14, ry: 0.12 }],
    towns: [{
      id: 'g8_base', name: 'G-8 Marine Base', dx: -0.05, dy: 0.25, w: 42, h: 28, style: 'marine', walls: true, dockDir: 's', plaza: 'flagpole',
      buildings: [
        { role: 'marine_base', name: 'G-8 Headquarters', npc: 'p1_jonathan' },
        { role: 'restaurant', name: "Jessica's Mess Hall", npc: 'p1_jessica' },
        { role: 'doctor', name: 'G-8 Infirmary' },
        { role: 'shipwright', name: 'G-8 Dry Dock' },
      ],
      houses: 2,
    }],
    landmarks: [
      { kind: 'gate', dx: 0, dy: 0.82, name: 'Navarone Main Gate', spot: 'main_gate', lore: '"MARINE BASE G-8 — NAVARONE." One gate, a hundred and eight cannons. Rule one, painted beside the gate: "FINISH YOUR MEAL."' },
      { kind: 'cannon', dx: -0.6, dy: 0.5 }, { kind: 'cannon', dx: 0.6, dy: 0.5 }, { kind: 'cannon', dx: 0.75, dy: 0.1 },
    ],
    logNext: ['little_garden', 'drum_island'], logTime: 1,
    danger: 3, tagline: 'Marine Base G-8, "the Hedgehog" — the most peaceful fortress in the Grand Line.', music: 'town',
  },

  // ------------------------------------------------- 2. Ruluka Island (anime)
  {
    id: 'ruluka_island', name: 'Ruluka Island', sea: 'paradise', x: 2268, y: 1168, w: 58, h: 56,
    climate: 'spring', rough: 0.22,
    towns: [{
      id: 'ruluka_town', name: 'Ruluka', dx: 0, dy: 0.1, w: 40, h: 28, style: 'town', dockDir: 'w', plaza: 'fountain',
      buildings: [
        { role: 'hall', name: "Mayor Wetton's Mansion", npc: 'p1_wetton' },
        { role: 'shipwright', name: "Henzo's Workshop", npc: 'p1_henzo' },
        { role: 'inn', name: 'Rainbow Inn' },
        { role: 'shop', name: 'Ruluka General Store (taxed)' },
      ],
      houses: 16,
    }],
    landmarks: [{ kind: 'tower', dx: 0.55, dy: -0.45, name: 'The Rainbow Tower', spot: 'rainbow_tower' }],
    spots: [{ id: 'rainbow_mist', dx: 52, dy: 0 }],
    logNext: ['drum_island'], logTime: 1,
    danger: 3, tagline: 'A tax on bread, a tax on water, a tax on breathing — and a rainbow mist on the horizon.', music: 'town',
  },

  // ------------------------------------------------- 3. Kenzan Island
  {
    id: 'kenzan_island', name: 'Kenzan Island', sea: 'paradise', x: 2378, y: 948, w: 72, h: 60,
    climate: 'rocky', rough: 0.26, ground: T.GRASS,
    mountains: [
      { name: 'Sword Peak', dx: -0.5, dy: -0.5, r: 0.1, h: 1.3 },
      { dx: -0.2, dy: -0.55, r: 0.08, h: 1.2 }, { dx: 0.5, dy: -0.45, r: 0.09, h: 1.25 }, { dx: 0.72, dy: 0.3, r: 0.08, h: 1.2 },
    ],
    trees: ['pine', 'bamboo', 'bush'],
    population: [['longarm', 85], ['human', 15]],
    towns: [{
      id: 'tehna_gehna', name: 'Tehna Gehna Kingdom', dx: -0.05, dy: 0.2, w: 40, h: 28, style: 'chinese', dockDir: 's', plaza: 'statue',
      buildings: [
        { role: 'hall', name: 'Hall of Long Arms' },
        { role: 'market', name: 'Long-Reach Market' },
        { role: 'inn', name: 'Whirlpool Inn' },
        { role: 'house', name: "Old Tenaga's House", npc: 'p1_tenaga' },
      ],
      houses: 16,
    }],
    spots: [{ id: 'whirlpool', dx: 0, dy: -62 }],
    logNext: ['drum_island'], logTime: 1,
    danger: 3, tagline: 'Sword-shaped peaks, whirlpools all around — home of the Longarm Tribe.', music: 'town',
  },

  // ------------------------------------------------- 4. Foolshout Island
  {
    id: 'foolshout_island', name: 'Foolshout Island', sea: 'paradise', x: 2376, y: 1088, w: 70, h: 58,
    climate: 'tropical', rough: 0.24,
    blobs: [[0, 0, 0.9, 0.85], [-0.6, 0.45, 0.35, 0.3]],
    areas: [{ tile: T.FARM, dx: 0.3, dy: -0.3, rx: 0.2, ry: 0.15 }],
    towns: [{
      id: 'foolshout_village', name: 'Foolshout', dx: 0.1, dy: -0.05, w: 36, h: 24, style: 'village', dockDir: 'e', plaza: 'well',
      buildings: [
        { role: 'house', name: "Koala's Home", npc: 'p1_koala_mother' },
        { role: 'shop', name: 'Foolshout Store' },
        { role: 'inn', name: 'Seaside Lodging' },
      ],
    }],
    landmarks: [
      { kind: 'shipwreck', dx: -0.72, dy: 0.62, name: 'The old anchorage', spot: 'sun_anchorage' },
      { kind: 'grave', dx: -0.45, dy: 0.35, name: 'Stone for the Sun Pirates who fell here', lore: '"For the Sun Pirates, who brought our Koala home, and for their captain, Fisher Tiger." Someone keeps fresh flowers on it.' },
    ],
    logNext: ['drum_island'], logTime: 1,
    danger: 3, tagline: 'Koala\'s hometown, where a fish-man hero brought a slave girl home — and was shot for it.', music: 'town',
  },

  // ------------------------------------------------- 5. Cactus Island (Whisky Peak)
  {
    id: 'cactus_island', name: 'Cactus Island', sea: 'paradise', x: 2508, y: 1012, w: 116, h: 92,
    climate: 'desert', rough: 0.22,
    blobs: [[0, 0, 0.92, 0.85], [0.55, -0.4, 0.4, 0.4]],
    trees: ['cactus', 'deadbush', 'palm'], treeDensity: 0.02,
    mountains: [
      { name: 'Sapoten Graveyard', dx: 0.45, dy: -0.45, r: 0.12, h: 1.2 },
      { dx: 0.7, dy: -0.25, r: 0.1, h: 1.15 }, { dx: 0.22, dy: -0.6, r: 0.09, h: 1.1 }, { dx: -0.55, dy: -0.4, r: 0.1, h: 1.15 },
    ],
    rivers: [{ points: [[-1.1, 0.25], [-0.75, 0.2], [-0.5, 0.18]], width: 6, meander: 0.4 }],
    towns: [{
      id: 'whisky_peak', name: 'Whisky Peak', dx: 0.08, dy: 0.3, w: 56, h: 34, style: 'desert', dockDir: 's', plaza: 'well',
      buildings: [
        { role: 'bar', name: 'Whisky Peak Saloon', npc: 'p1_igaram' },
        { role: 'inn', name: 'Welcome Inn' },
        { role: 'shop', name: 'Whisky Peak Distillery', npc: 'p1_distiller' },
        { role: 'bounty', name: 'Bounty Hunters\' Exchange' },
        { role: 'hall', name: 'Officer Agent Fan Club Office' },
      ],
      houses: 28,
    }],
    landmarks: [
      { kind: 'grave', dx: 0.36, dy: -0.28, name: 'Grave of Mr. Sacrifice', lore: '"Here lies Mr. Sacrifice." The Sapoten Graveyard: so many tombstones on the rock spires that from the sea the mountains look like giant cacti.' },
      { kind: 'grave', dx: 0.52, dy: -0.25 }, { kind: 'grave', dx: 0.3, dy: -0.4 },
      { kind: 'sign', dx: -0.3, dy: 0.05, name: 'Welcome to Whisky Peak! Brave sailors, rejoice!', lore: '"WELCOME TO WHISKY PEAK! Every brave crew that conquers Reverse Mountain drinks for free!" (Someone has scratched underneath: "...once.")' },
    ],
    spots: [{ id: 'sapoten_graveyard', dx: 0.38, dy: -0.25 }, { id: 'wp_outskirts', dx: -0.3, dy: -0.05 }, { id: 'wp_square', dx: 0.08, dy: 0.34 }],
    logNext: ['little_garden'], logTime: 1,
    danger: 3, tagline: 'The town that welcomes pirates… a little too warmly.', music: 'town',
  },

  // ------------------------------------------------- 6. Kyuka Island
  {
    id: 'kyuka_island', name: 'Kyuka Island', sea: 'paradise', x: 2500, y: 880, w: 72, h: 56,
    climate: 'tropical', rough: 0.2,
    mountains: [{ name: 'Umbrella Hill', dx: 0.35, dy: -0.25, r: 0.22, h: 0.55 }],
    lakes: [{ dx: -0.3, dy: -0.35, rx: 0.07, ry: 0.06 }, { dx: -0.12, dy: -0.4, rx: 0.05, ry: 0.05 }],
    trees: ['palm', 'palm', 'bush'],
    towns: [{
      id: 'kyuka_resort', name: 'Kyuka Resort', dx: -0.15, dy: 0.2, w: 40, h: 26, style: 'noble', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'inn', name: 'Hotel Kyuka', npc: 'p1_kyuka_manager' },
        { role: 'cafe', name: 'Ice Cream Parlour', shop: 'p1_kyuka_cafe' },
        { role: 'restaurant', name: 'Poolside Grill' },
        { role: 'shop', name: 'Souvenir Shop' },
      ],
      houses: 3,
    }],
    landmarks: [{ kind: 'tower', dx: 0.35, dy: -0.3, name: 'The Umbrella Tree Lodge', spot: 'umbrella_tree' }, { kind: 'bench', dx: -0.45, dy: -0.2 }],
    logNext: ['little_garden'], logTime: 1,
    danger: 2, tagline: 'Hotels, pools and ice cream. Even Baroque Works takes a holiday here.', music: 'town',
  },

  // ------------------------------------------------- 7. Vira
  {
    id: 'vira', name: 'Vira', sea: 'paradise', x: 2508, y: 1152, w: 78, h: 58,
    climate: 'spring', rough: 0.22,
    areas: [{ name: 'Burnt quarter', tile: T.ASH, dx: 0.45, dy: -0.3, rx: 0.16, ry: 0.14 }, { tile: T.FARM, dx: -0.5, dy: 0.3, rx: 0.18, ry: 0.12 }],
    towns: [{
      id: 'vira_town', name: 'Vira', dx: -0.1, dy: 0.1, w: 44, h: 28, style: 'town', walls: true, dockDir: 'w', plaza: 'statue',
      buildings: [
        { role: 'library', name: 'Vira Harbour Archives', npc: 'p1_vira_archivist' },
        { role: 'hall', name: 'Council of the Revolution' },
        { role: 'inn', name: 'Old Sunny Inn' },
        { role: 'shop', name: 'Vira Market' },
      ],
      houses: 18,
    }],
    landmarks: [{ kind: 'ruins', dx: 0.45, dy: -0.3, name: 'The burnt royal palace', spot: 'old_palace', lore: 'The palace of Vira\'s last king, burnt in the coup two years ago. Revolutionary slogans are painted over the royal crest.' }, { kind: 'ruins', dx: 0.55, dy: -0.2 }],
    logNext: ['drum_island'], logTime: 1,
    danger: 3, tagline: 'Once "a sunny town". Two years ago the Revolutionary Army toppled its king.', music: 'town',
  },

  // ------------------------------------------------------------ Little Garden
  // A prehistoric island: circular, jungle, a volcano whose eruptions start
  // each round of the giants' hundred-year duel. The log takes a YEAR.
  {
    id: 'little_garden', name: 'Little Garden', sea: 'paradise', x: 2692, y: 885, w: 124, h: 92,
    climate: 'prehistoric', rough: 0.2,
    blobs: [[0, 0, 0.92, 0.9]],
    mountains: [{ name: 'The Volcano', dx: 0.02, dy: -0.35, r: 0.17, h: 1.05, peak: T.ROCK }],
    lakes: [{ dx: 0.02, dy: -0.36, rx: 0.035, ry: 0.035, tile: T.LAVA }],
    areas: [{ name: 'The duel ground', tile: T.DIRT, dx: 0.0, dy: 0.12, rx: 0.14, ry: 0.12 }],
    landmarks: [
      { kind: 'skull', dx: -0.62, dy: -0.1, name: 'Sea King skull' },
      { kind: 'skull', dx: 0.62, dy: -0.1, name: 'Sea King skull' },
      { kind: 'bones', dx: -0.5, dy: 0.1 }, { kind: 'bones', dx: 0.5, dy: 0.12 },
      { kind: 'campfire', dx: -0.45, dy: 0.25, spot: 'dorry_camp', name: "Dorry's camp" },
      { kind: 'campfire', dx: 0.45, dy: 0.25, spot: 'brogy_camp', name: "Brogy's camp" },
      { kind: 'building', role: 'house', name: "Mr. 3's Candle House", style: 'village', roofType: 'gable', fw: 6, fd: 4, hgt: 3, wall: '#fff8e1', roof: '#ffe0b2', dx: 0.3, dy: 0.55 },
      { kind: 'statue', dx: -0.2, dy: 0.5, name: 'The Candle Service Set', spot: 'candle_service', lore: 'A wax platform shaped like a giant cake. A spinning pumpkin on top pours wax mist over anyone standing on it, slowly turning them into a statue. Mr. 3 calls it art.' },
    ],
    spots: [{ id: 'duel_ground', dx: 0, dy: 0.12 }, { id: 'wax_house', dx: 0.3, dy: 0.66 }],
    docks: [{ dx: -0.1, dy: 0.7, dir: 's', len: 5, name: 'Little Garden Landing' }],
    logNext: ['drum_island'], logTime: 999,
    danger: 4, tagline: 'Dinosaurs, a volcano, and two giants who have been fighting for a hundred years.', music: 'grandline',
  },

  // ------------------------------------------------------------ Drum Island
  // A winter island of drum-shaped mountains: the Drum Rockies, sheer-sided
  // cylinders of rock standing straight up out of the snow, their flat tops
  // capped white (see world/drums.js). The tallest, Drum Rock, stands in the
  // middle of the island with Drum Castle on its summit, and the Drum
  // Ropeway's cable runs up its face to the castle gate — the only way up,
  // short of climbing the cliff. Bighorn lies by the river where ships dock;
  // Gyasta by its frozen lake.
  {
    id: 'drum_island', name: 'Drum Island', sea: 'paradise', x: 2690, y: 1126, w: 132, h: 112,
    climate: 'winter', rough: 0.2,
    blobs: [[0, 0, 0.92, 0.9], [-0.5, 0.45, 0.4, 0.35]],
    drums: [
      { name: 'Drum Rock', dx: 0.12, dy: -0.2, r: 0.27, h: 72 },
      { name: 'Drum Rockies', dx: 0.5, dy: -0.5, r: 0.1, h: 46 },
      { name: 'Drum Rockies (west)', dx: -0.3, dy: -0.5, r: 0.09, h: 40 },
      { name: 'Drum Rockies (east)', dx: 0.6, dy: 0.0, r: 0.08, h: 37 },
      { name: 'Drum Rockies (Bighorn)', dx: -0.42, dy: -0.12, r: 0.075, h: 33 },
      { name: 'Drum Rockies (north)', dx: 0.32, dy: -0.66, r: 0.07, h: 30 },
      { name: 'Drum Rockies (far west)', dx: -0.62, dy: -0.38, r: 0.06, h: 27 },
    ],
    rivers: [{ points: [[-1.1, 0.15], [-0.6, 0.12], [-0.25, 0.02]], width: 5, meander: 0.5 }],
    lakes: [{ name: 'Gyasta lake', dx: 0.45, dy: 0.5, rx: 0.1, ry: 0.07, tile: T.ICE }],
    towns: [
      {
        id: 'bighorn', name: 'Bighorn', dx: -0.45, dy: 0.38, w: 40, h: 26, style: 'snow', dockDir: 'w', plaza: 'well',
        buildings: [
          { role: 'house', name: "Dalton's House", npc: 'p1_dalton' },
          { role: 'inn', name: 'Bighorn Lodge' },
          { role: 'shop', name: 'Bighorn Provisions' },
        ],
        houses: 12,
      },
      {
        // (on the summit of Drum Rock: up the ropeway, no road)
        id: 'drum_castle', name: 'Drum Castle', dx: 0.12, dy: -0.22, w: 22, h: 16, style: 'snow', walls: true, mainDir: 'v', plaza: 'flagpole', noRoad: true,
        // (an icy-looking castle: pale stone walls, slate-blue roofs, round towers at its corners)
        buildings: [
          { role: 'palace', name: 'Drum Castle', w: 12, d: 7, hgt: 8, style: 'noble', wall: '#dfe9f1', roof: '#4b6b8c', roofType: 'mansard' },
          { role: 'doctor', name: "Dr. Kureha's Clinic", npc: 'p1_kureha', style: 'noble', wall: '#e3ebf2', roof: '#4b6b8c' },
        ],
        houses: 0,
      },
      {
        id: 'gyasta', name: 'Gyasta', dx: 0.45, dy: 0.32, w: 28, h: 18, style: 'snow', dockDir: 'se', plaza: 'well',
        buildings: [{ role: 'tavern', name: 'Skater\'s Rest' }, { role: 'house', name: "Dr. Lapin's Surgery", npc: 'p1_dr_lapin' }],
        houses: 6,
      },
    ],
    ropeways: [{ id: 'drum_ropeway', name: 'Drum Ropeway', drum: 'Drum Rock', from: [0.12, 0.61], top: 'Drum Castle', foot: 'the foot of Drum Rock' }],
    landmarks: [
      { kind: 'flagpole', dx: 0.12, dy: -0.46, name: "Dr. Hiriluk's Jolly Roger", spot: 'hiriluk_flag', lore: '(A skull with a cross of cherry blossoms instead of bones.) Dr. Hiriluk said a pirate\'s flag is a symbol of conviction. "When do you think people die? When they are forgotten."' },
      { kind: 'cannon', dx: 0.04, dy: -0.44 }, { kind: 'cannon', dx: 0.2, dy: -0.44 },
      // Drum Castle's towers, at the corners inside its walls
      // (tall enough to stand up over the rim of Drum Rock, seen from the snowfields and the sea below)
      { kind: 'tower', name: 'Drum Castle tower', h: 24, dx: -0.022, dy: -0.34 }, { kind: 'tower', name: 'Drum Castle tower', h: 24, dx: 0.262, dy: -0.34 },
      { kind: 'tower', name: 'Drum Castle tower', h: 18, dx: -0.022, dy: -0.1 }, { kind: 'tower', name: 'Drum Castle tower', h: 18, dx: 0.262, dy: -0.1 },
      { kind: 'sign', dx: 0.17, dy: 0.66, name: 'Drum Ropeway', spot: 'castle_road', lore: '"DRUM ROPEWAY — to Drum Castle." (Underneath, freshly painted over a royal decree:) "Open to doctors, patients and peasants alike. By order of the people of Drum." The cable climbs straight up the face of Drum Rock, seventy metres of sheer cliff, to the castle gate.' },
    ],
    spots: [{ id: 'castle_gate', dx: 0.12, dy: -0.04 }, { id: 'lapahn_slope', dx: 0.0, dy: 0.5 }],
    docks: [{ near: 'bighorn', dir: 'w', name: 'Bighorn River Mouth' }, { near: 'gyasta', dir: 'se', name: 'Gyasta' }],
    weather: { snow: 0.55 },
    logNext: ['alabasta', 'nanimonai_island'], logTime: 2,
    danger: 4, tagline: 'A kingdom without doctors, snowed under — and a castle on top of a drum-shaped mountain.', music: 'town',
  },

  // ------------------------------------------------------------ Nanimonai Island
  // "Island of Nothing": not an island at all but the droppings of the Island
  // Eater, the giant goldfish of Little Garden's seas.
  {
    id: 'nanimonai_island', name: 'Nanimonai Island', sea: 'paradise', x: 2794, y: 972, w: 32, h: 26,
    climate: 'marsh', rough: 0.3, treeDensity: 0.01, noDock: true,
    landmarks: [{ kind: 'sign', dx: 0, dy: 0, name: 'Nanimonai Island — there is nothing here', spot: 'nothing', lore: '"NANIMONAI ISLAND. There is nothing here." (Underneath, in a giant\'s enormous handwriting:) "DON\'T DIG. — the Giant Warrior Pirates"' }, { kind: 'bones', dx: 0.35, dy: 0.2 }],
    logNext: ['alabasta'], logTime: 1,
    danger: 3, tagline: 'There is nothing here. Nothing at all. (It smells awful.)', music: 'sea',
  },

  // ------------------------------------------------------------ Alabasta
  // Sandy Island, a summer island cut in two by the Sandora River. West bank:
  // Rainbase, Yuba, the Spiders Café, Erumalu. East bank: Alubarna (plateau,
  // palace, Tomb of the Kings), Nanohana (southern port), Katorea (oasis).
  {
    id: 'alabasta', name: 'Alabasta Kingdom', sea: 'paradise', x: 2976, y: 1112, w: 282, h: 200,
    climate: 'desert', rough: 0.16,
    blobs: [[0, 0, 0.95, 0.9], [0.35, 0.55, 0.45, 0.35], [-0.6, -0.45, 0.35, 0.35]],
    trees: ['cactus', 'deadbush', 'palm'], treeDensity: 0.012,
    mountains: [
      { name: 'Alubarna plateau', dx: 0.46, dy: -0.44, r: 0.14, h: 0.45, cliff: 260 },
      { dx: -0.78, dy: 0.05, r: 0.08, h: 0.9 }, { dx: 0.85, dy: -0.08, r: 0.07, h: 0.85 },
    ],
    rivers: [{ name: 'Sandora River', points: [[0.03, -1.15], [0.05, -0.6], [-0.02, -0.1], [0.06, 0.35], [0.02, 1.15]], width: 8, meander: 0.35 }],
    lakes: [
      { name: 'Alubarna oasis', dx: 0.78, dy: -0.45, rx: 0.035, ry: 0.035 },
      { name: 'Katorea oasis', dx: 0.8, dy: 0.12, rx: 0.035, ry: 0.035 },
      { dx: -0.46, dy: 0.02, rx: 0.012, ry: 0.012 },
    ],
    areas: [
      { name: 'Erumalu (the Green City, in ruins)', tile: T.GRAVEL, dx: -0.18, dy: 0.42, rx: 0.1, ry: 0.09 },
      { name: 'Tomb of the Kings', tile: T.STONE, dx: 0.3, dy: -0.75, rx: 0.06, ry: 0.04 },
      { tile: T.ROCK, dx: -0.78, dy: 0.05, rx: 0.1, ry: 0.12 },
    ],
    paint: [
      { op: 'path', points: [[-0.14, -0.3], [0.2, -0.3]], width: 3, tile: T.BRIDGE },
      { op: 'path', points: [[-0.1, 0.3], [0.22, 0.3]], width: 3, tile: T.BRIDGE },
    ],
    towns: [
      {
        id: 'nanohana', name: 'Nanohana', dx: 0.34, dy: 0.68, w: 58, h: 36, style: 'desert', dockDir: 's', plaza: 'fountain',
        buildings: [
          { role: 'market', name: 'Nanohana Bazaar', shop: 'p1_alabasta_bazaar' },
          { role: 'shop', name: 'Perfume Street', shop: 'p1_perfume_stock' },
          { role: 'restaurant', name: 'Nanohana Diner', npc: 'p1_ace_nanohana' },
          { role: 'inn', name: 'Nanohana Inn' },
          { role: 'dojo', name: 'Okama Way Dojo', trainer: 'bon_clay', npc: 'p1_bon_clay' },
          { role: 'doctor', name: 'Nanohana Hospital' },
          { role: 'shipwright', name: 'Nanohana Docks' },
          { role: 'shop', name: 'Desert Navigator', shop: 'navigator_grand' },
        ],
        houses: 36,
      },
      {
        id: 'katorea', name: 'Katorea', dx: 0.7, dy: 0.28, w: 38, h: 26, style: 'desert', dockDir: 'e', plaza: 'well',
        buildings: [
          { role: 'hall', name: 'Rebel Army Headquarters', npc: 'p1_kohza' },
          { role: 'inn', name: 'Oasis Rest' },
          { role: 'shop', name: 'Katorea Water Market' },
        ],
        houses: 14,
      },
      {
        id: 'alubarna', name: 'Alubarna', dx: 0.45, dy: -0.44, w: 66, h: 44, style: 'desert', walls: true, dockDir: 'n', plaza: 'fountain', plazaR: 6,
        buildings: [
          { role: 'palace', name: 'Alubarna Palace', npc: 'p1_cobra', w: 14, d: 7, hgt: 5 },
          { role: 'hall', name: 'Alubarna Clock Tower', w: 6, d: 5, hgt: 6 },
          { role: 'library', name: 'Royal Library of Alubarna' },
          { role: 'market', name: 'Alubarna Market', shop: 'p1_alabasta_bazaar' },
          { role: 'weapons', name: 'Royal Armoury' },
          { role: 'inn', name: 'Palace Guest House' },
          { role: 'doctor', name: 'Palace Infirmary' },
        ],
        houses: 44,
      },
      {
        id: 'rainbase', name: 'Rainbase', dx: -0.55, dy: -0.5, w: 56, h: 38, style: 'desert', dockDir: 'n', plaza: 'fountain',
        buildings: [
          { role: 'hall', name: 'Rain Dinners', w: 10, d: 7, hgt: 5, wall: '#f2d16b', roof: '#c9a227' },
          { role: 'bar', name: 'Golden Slots Casino' },
          { role: 'inn', name: 'City of Dreams Hotel' },
          { role: 'bank', name: 'Coin Banditts Exchange' },
          { role: 'shop', name: 'Rainbase General Store' },
        ],
        houses: 30,
      },
      {
        id: 'yuba', name: 'Yuba', dx: -0.46, dy: 0.1, w: 32, h: 22, style: 'tribal', dockDir: 'w', plaza: false,
        buildings: [{ role: 'house', name: "Toto's Well", npc: 'p1_toto' }, { role: 'inn', name: 'Half-Buried Inn' }],
        houses: 6,
      },
    ],
    landmarks: [
      { kind: 'building', role: 'bar', name: 'Spiders Café', npc: 'p1_paula', style: 'desert', roofType: 'flat', fw: 7, fd: 4, hgt: 3, wall: '#e7c9a0', roof: '#a1887f', dx: -0.7, dy: 0.4 },
      { kind: 'poneglyph', dx: 0.3, dy: -0.76, poneglyph: 'alabasta', name: 'Poneglyph — the Tomb of the Kings', spot: 'tomb_of_kings' },
      { kind: 'pillar', dx: 0.26, dy: -0.78 }, { kind: 'pillar', dx: 0.34, dy: -0.78 },
      { kind: 'statue', dx: 0.22, dy: -0.73, name: 'Statue of the Kings', lore: 'The kings of the Nefertari family, carved in sandstone. Beneath the tomb, a black cube of stone that nobody may read.' },
      { kind: 'ruins', dx: -0.2, dy: 0.4, name: 'Erumalu', spot: 'erumalu' }, { kind: 'ruins', dx: -0.13, dy: 0.46 }, { kind: 'bones', dx: -0.24, dy: 0.47 },
      { kind: 'sign', dx: -0.06, dy: 0.66, name: 'Beware: Kung-Fu Dugongs', spot: 'dugong_beach', lore: '"BEWARE: KUNG-FU DUGONGS. They challenge every traveller who crosses the Sandora River. Whoever beats one becomes its master — and gets a hundred pupils."' },
    ],
    spots: [
      { id: 'spiders_cafe', dx: -0.7, dy: 0.46 },
      { id: 'rain_dinners', dx: -0.55, dy: -0.46 },
      { id: 'yuba_well', dx: -0.46, dy: 0.12 },
      { id: 'alubarna_square', dx: 0.45, dy: -0.38 },
      { id: 'clock_tower', dx: 0.45, dy: -0.42 },
    ],
    docks: [
      { near: 'nanohana', dir: 's', name: 'Nanohana Harbour' },
      { near: 'rainbase', dir: 'n', name: 'Rainbase Landing' },
      { dx: 0.74, dy: -0.28, dir: 'e', len: 6, name: 'Tamarisk' },
    ],
    logNext: ['jaya'], logTime: 2,
    danger: 5, tagline: 'A kingdom of sand on the brink of civil war. It has not rained in three years.', music: 'town',
  },

  // ------------------------------------------------------------ Jaya
  // A jagged "U": the jaw of a skull-shaped island whose top half was blown
  // into the sky 400 years ago. Mock Town on the west coast, Cricket's house
  // on the east. The Knock Up Stream erupts to the south.
  {
    id: 'jaya', name: 'Jaya', sea: 'paradise', x: 2915, y: 877, w: 124, h: 86,
    climate: 'jungle', rough: 0.3,
    blobs: [[-0.55, 0, 0.42, 0.85], [0.1, -0.55, 0.72, 0.32], [0.1, 0.55, 0.72, 0.32]],
    archipelago: false,
    areas: [{ name: 'South Bird woods', tile: T.JUNGLE, dx: 0.3, dy: 0.55, rx: 0.3, ry: 0.2 }],
    towns: [{
      id: 'mock_town', name: 'Mock Town', dx: -0.62, dy: 0.08, w: 36, h: 44, style: 'port', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'bar', name: 'Mock Town Tavern', npc: 'p1_teach_jaya' },
        { role: 'inn', name: 'Hyena\'s Rest Inn' },
        { role: 'weapons', name: 'Mock Town Arms' },
        { role: 'shop', name: 'Mock Town Black Market', shop: 'black_market' },
        { role: 'bounty', name: 'Mock Town Bounty Board' },
      ],
      houses: 26,
    }],
    landmarks: [
      { kind: 'building', role: 'house', name: "Montblanc Cricket's House", npc: 'p1_cricket', style: 'noble', roofType: 'gable', fw: 8, fd: 4, hgt: 4, wall: '#fdfefe', roof: '#d4ac0d', dx: 0.62, dy: -0.52 },
      { kind: 'boat', dx: 0.74, dy: -0.4, name: "Cricket's diving boat" },
      { kind: 'anchor', dx: 0.42, dy: -0.4 },
      { kind: 'sign', dx: 0.5, dy: -0.62, name: 'Saruyama Alliance — Treasure Salvage', lore: '"SARUYAMA ALLIANCE — Treasure Salvage! Anything that sinks near Jaya is OURS!" Signed: Masira, Shoujou, and (smaller) Cricket.' },
    ],
    spots: [
      { id: 'cricket_house', dx: 0.62, dy: -0.44 },
      { id: 'saruyama_camp', dx: 0.5, dy: -0.5 },
      { id: 'south_bird_woods', dx: 0.35, dy: 0.55 },
      { id: 'knock_up_stream', dx: 0, dy: 82 },
    ],
    logNext: ['long_ring_long_land'], logTime: 2,
    danger: 5, tagline: 'A lawless island of pirates who laugh at dreams. Somewhere above the clouds, there is gold.', music: 'town',
  },

  // ------------------------------------------------------------ Long Ring Long Land
  // A chain of long, thin islands in a ring (really one island whose
  // connecting path surfaces once a year). Everything here grows long.
  {
    id: 'long_ring_long_land', name: 'Long Ring Long Land', sea: 'paradise', x: 3064, y: 874, w: 124, h: 68,
    climate: 'temperate', rough: 0.12, archipelago: true,
    blobs: [
      [-0.05, -0.72, 0.62, 0.16], [0.72, -0.2, 0.14, 0.42], [0.1, 0.62, 0.62, 0.3], [-0.72, 0.05, 0.14, 0.45],
    ],
    trees: ['bamboo', 'bamboo', 'oak'], treeDensity: 0.04,
    towns: [{
      id: 'foxy_camp', name: 'Foxy Pirates\' Camp', dx: 0.1, dy: 0.6, w: 40, h: 18, style: 'village', dockDir: 's', plaza: 'platform',
      buildings: [{ role: 'bar', name: 'Foxy\'s Food Stalls' }, { role: 'tavern', name: 'Groggy Ring Grandstand' }],
      houses: 1,
    }],
    landmarks: [
      { kind: 'tent', dx: -0.72, dy: -0.1, name: "Tonjit's tent", spot: 'tonjit_camp' },
      { kind: 'fence', dx: 0.3, dy: 0.55, name: 'The Groggy Ring', spot: 'groggy_ring' },
      { kind: 'flagpole', dx: -0.15, dy: 0.5, name: 'The Foxy Pirates\' Jolly Roger', lore: 'A fox-faced skull. Beneath it hang dozens of flags won in Davy Back Fights — including a toad with fangs.' },
      { kind: 'bench', dx: 0.0, dy: -0.72, spot: 'aokiji_grass', name: 'A long, long meadow' },
      { kind: 'mooring', dx: 0, dy: -0.05, name: 'Donut Race buoy' },
    ],
    spots: [{ id: 'donut_buoy', dx: 0, dy: -0.05 }, { id: 'dbf_beach', dx: 0.1, dy: 0.45 }],
    logNext: ['water_7'], logTime: 1,
    danger: 5, tagline: 'Long horses, long bamboo, long foxes — and a Davy Back Fight.', music: 'town',
  },
];
