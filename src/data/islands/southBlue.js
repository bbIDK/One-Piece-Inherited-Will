// South Blue — bottom-right quadrant (x 2250..4000, y 1350..1980).
// Reverse Mountain's South Blue canal mouth opens at (2198, 1342): the Briss
// Kingdom, the kingdom of explorers that sent the St. Briss to the Grand Line,
// is the last port before it. The sea grows colder toward the south pole
// (Roshwan, the Evil Black Drum Kingdom) and wilder toward the Red Line in the
// east (Torino, "Treasure Island" of the giant birds).
//
// Canon sources (One Piece Wiki): South Blue, Baterilla, Karate Island,
// Sorbet Kingdom, Solo Revolution, Torino Kingdom, Briss Kingdom / St. Briss,
// Centaurea, Kutsukku Island, Tumi, Evil Black Drum Kingdom, Roshwan Kingdom,
// Samba Kingdom, Taya Kingdom, Vespa Kingdom, Samuwanai Island.
//
// Each island's era is the moment its canon story happens (the game mixes
// eras, like the East Blue's Gray Terminal fire next to Arlong Park).
import { T } from '../../world/tiles.js';

export const SOUTH_BLUE = [
  // ------------------------------------------------------------- Briss Kingdom
  // The St. Briss sailed from here 210 years ago and was condemned to Cloud
  // Drifting in Skypiea. Like its South Blue neighbours, Briss coats its teeth with tar.
  {
    id: 'briss_kingdom', name: 'Briss Kingdom', sea: 'south_blue', x: 2430, y: 1495, w: 170, h: 120,
    climate: 'temperate', rough: 0.22,
    blobs: [[0.05, 0.02, 0.84, 0.82], [-0.6, -0.28, 0.34, 0.3], [0.55, 0.42, 0.34, 0.3]],
    mountains: [{ name: 'Pitch Hills', dx: 0.5, dy: -0.38, r: 0.18, h: 0.5 }],
    areas: [
      { name: 'The Tar Pits', tile: T.MUD, dx: 0.45, dy: -0.08, rx: 0.1, ry: 0.08 },
      { tile: T.FOREST, dx: 0.48, dy: 0.4, rx: 0.2, ry: 0.18 },
      { tile: T.FARM, name: 'Royal barley fields', dx: -0.12, dy: -0.5, rx: 0.2, ry: 0.1 },
    ],
    towns: [{
      id: 'briss_town', name: 'Briss Royal Port', dx: -0.15, dy: 0.12, w: 70, h: 48, style: 'port', dockDir: 's', plaza: 'statue', plazaR: 5,
      buildings: [
        { role: 'inn', name: 'The Tarred Tooth Inn' },
        { role: 'shop', name: 'Briss General Store' },
        { role: 'shop', name: 'Navigator Supplies (Log Poses!)', shop: 'navigator', npc: 'sb_sextant_sal' },
        { role: 'shipwright', name: 'St. Briss Shipyard', npc: 'sb_carvel' },
        { role: 'bar', name: "Explorers' Tavern" },
        { role: 'library', name: 'Royal Archives of Briss', npc: 'sb_briony' },
        { role: 'weapons', name: 'Briss Armory' },
        { role: 'doctor', name: 'Tar-Tooth Dentistry', npc: 'sb_dr_pitch' },
        { role: 'palace', name: 'Briss Castle', w: 12, d: 7, hgt: 4, wall: '#efe6d8', roof: '#1f4e79' },
      ],
    }],
    landmarks: [
      { kind: 'lighthouse', dx: -0.84, dy: -0.32, name: 'Briss Point Lighthouse' },
      { kind: 'statue', dx: -0.66, dy: 0.3, name: 'Memorial of the St. Briss', spot: 'st_briss_memorial' },
      { kind: 'anchor', dx: -0.6, dy: 0.42 },
      { kind: 'boat', dx: -0.52, dy: 0.5 },
      { kind: 'crate', dx: -0.5, dy: 0.36 },
    ],
    spots: [{ id: 'briss_pier', dx: -0.3, dy: 0.5 }],
    danger: 2,
    tagline: 'Two hundred and ten years ago, the St. Briss sailed from this harbour — and never came home.',
    rumors: [
      'Reverse Mountain rises just north-west of Briss. Every South Blue pirate buys their Log Pose here before riding the canal.',
      'The old folk of Briss still coat their teeth in tar. Keeps them strong for a lifetime, they say.',
      'The St. Briss carried our royal crest — a disc ringed with four arrowheads — and a dragon on her prow. Nobody knows what became of her.',
      'A pirate with a steel crab claw for a hand has been prowling the harbour. Crab-Hand Gyro. He wants a ship for the Grand Line.',
    ],
  },

  // ---------------------------------------------------------------- Centaurea
  // Two years before the Straw Hats reached Water 7, the Revolutionary Army
  // fought "an unknown force" for Centaurea and won: another country fell.
  {
    id: 'centaurea', name: 'Centaurea', sea: 'south_blue', x: 2785, y: 1452, w: 220, h: 150,
    climate: 'autumn', rough: 0.22,
    blobs: [[0, 0, 0.86, 0.8], [0.5, 0.42, 0.4, 0.34], [-0.55, -0.35, 0.38, 0.34]],
    mountains: [{ name: 'Knapweed Heights', dx: 0.48, dy: -0.42, r: 0.18, h: 0.6 }],
    areas: [
      { name: 'Cornflower fields', tile: T.FLOWERS, dx: -0.05, dy: 0.5, rx: 0.3, ry: 0.12 },
      { tile: T.FOREST, dx: 0.62, dy: -0.02, rx: 0.22, ry: 0.28 },
      { name: 'The front line', tile: T.ASH, dx: 0.12, dy: 0.02, rx: 0.1, ry: 0.12 },
    ],
    towns: [
      {
        id: 'centaurea_town', name: 'Centaurea City', dx: -0.46, dy: 0.12, w: 58, h: 40, style: 'city', dockDir: 'w', plaza: 'fountain',
        buildings: [
          { role: 'inn', name: 'Blue Bloom Inn' },
          { role: 'shop', name: 'City Provisioner' },
          { role: 'bar', name: 'The Cornflower Tavern', npc: 'sb_gambo' },
          { role: 'doctor', name: 'Centaurea Infirmary' },
          { role: 'weapons', name: 'Back-Street Armory' },
        ],
      },
      {
        id: 'centaurea_fort', name: 'Royal Fortress', dx: 0.1, dy: -0.4, w: 42, h: 30, style: 'noble', walls: true, dockDir: 'n', plaza: 'flagpole',
        buildings: [{ role: 'hall', name: 'Royal Guard Headquarters', npc: 'sb_cyanus', w: 10, d: 6, hgt: 5, wall: '#eceff1', roof: '#283593' }],
        houses: 2,
      },
      {
        id: 'centaurea_camp', name: 'Revolutionary Camp', dx: 0.52, dy: 0.4, w: 36, h: 26, style: 'village', dockDir: 'se', plaza: 'flagpole',
        buildings: [
          { role: 'hall', name: 'South Army Field HQ', npc: 'sb_lindbergh', wall: '#8d6e63', roof: '#b71c1c' },
          { role: 'doctor', name: 'Field Hospital', npc: 'sb_aster' },
        ],
        houses: 1,
      },
    ],
    docks: [
      { near: 'centaurea_town', dir: 'w', name: 'Centaurea City Harbour' },
      { near: 'centaurea_fort', dir: 'n', name: 'Fortress Quay' },
      { near: 'centaurea_camp', dir: 'se', name: 'Rebel Landing' },
    ],
    landmarks: [
      { kind: 'gate', dx: 0.1, dy: -0.1, name: 'Fortress Gate', spot: 'fort_gate' },
      { kind: 'cannon', dx: 0.0, dy: -0.08 },
      { kind: 'cannon', dx: 0.2, dy: -0.08 },
      { kind: 'tent', dx: 0.3, dy: 0.3, v: 1 },
      { kind: 'campfire', dx: 0.34, dy: 0.34 },
    ],
    spots: [{ id: 'camp_road', dx: 0.34, dy: 0.28 }, { id: 'fort_square', dx: 0.1, dy: -0.4 }],
    danger: 3,
    tagline: 'A revolution years in the making. Tonight, the Royal Fortress.',
    rumors: [
      'The crown of Centaurea sold its debtors to slavers to pay the Heavenly Tribute. Now the Revolutionary Army is at the gates.',
      'They say the Revolutionary South Army is led by a cat. A cat with a jetpack. I know how it sounds.',
      'The Royal Guard hired a mercenary with a scar across his face. Suleiman the Beheader — exiled from his own country after the Sea Battle of Dias.',
    ],
  },

  // -------------------------------------------------------------------- Tumi
  // A three-year civil war. The Revolutionary Army was busy with Gray Terminal
  // refugees — so Kuma came alone and destroyed the tower.
  {
    id: 'tumi', name: 'Tumi', sea: 'south_blue', x: 3090, y: 1422, w: 120, h: 90,
    climate: 'autumn', rough: 0.26,
    blobs: [[0, 0, 0.86, 0.82], [0.5, 0.35, 0.34, 0.34]],
    areas: [
      { name: 'Scorched fields', tile: T.DIRT, dx: -0.35, dy: -0.35, rx: 0.25, ry: 0.15 },
      { tile: T.FOREST, dx: 0.5, dy: -0.35, rx: 0.2, ry: 0.2 },
    ],
    towns: [{
      id: 'tumi_town', name: 'Tumi Old Town', dx: -0.18, dy: 0.22, w: 46, h: 30, style: 'town', dockDir: 's', plaza: 'well',
      buildings: [
        { role: 'inn', name: 'Sun Gate Inn' },
        { role: 'shop', name: 'Rebel Quartermaster' },
        { role: 'hall', name: 'Rebel Command', npc: 'sb_inti' },
      ],
    }],
    landmarks: [
      { kind: 'tower', dx: 0.3, dy: -0.18, name: 'Loyalist Tower', spot: 'tumi_tower', fw: 2, fd: 2 },
      { kind: 'fence', dx: 0.18, dy: -0.05 },
      { kind: 'cannon', dx: 0.4, dy: -0.02 },
    ],
    danger: 2,
    tagline: 'Three years of civil war, and the rebels are losing.',
    rumors: [
      'The rebels of Tumi asked the Revolutionary Army for help. The Army\'s busy in the East Blue — some slum a king burned down.',
      'General Huaca holds the tower in the middle of the island. As long as it stands, the loyalists won\'t surrender.',
    ],
  },

  // ------------------------------------------------------------ Karate Island
  // Where people come to master every martial art. Jerry of CP6 trained his
  // boxing here; a young boxer called Foxy lost his licence for bringing a
  // weapon into the ring.
  {
    id: 'karate_island', name: 'Karate Island', sea: 'south_blue', x: 3370, y: 1446, w: 140, h: 110,
    climate: 'tropical', rough: 0.24,
    blobs: [[0, 0.05, 0.86, 0.8], [0.36, -0.48, 0.34, 0.34]],
    mountains: [{ name: 'Thousand-Step Peak', dx: 0.4, dy: -0.5, r: 0.18, h: 0.7 }],
    areas: [
      { tile: T.STONE, name: 'Training grounds', dx: 0.3, dy: -0.12, rx: 0.13, ry: 0.08 },
      { tile: T.JUNGLE, dx: -0.48, dy: -0.32, rx: 0.24, ry: 0.24 },
    ],
    towns: [{
      id: 'karate_dojo_town', name: 'Dojo Town', dx: -0.2, dy: 0.24, w: 58, h: 40, style: 'chinese', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'dojo', name: 'Grand Karate Dojo', npc: 'sb_ippon', trainer: 'karate_master' },
        { role: 'dojo', name: 'Karate Island Boxing Gym', npc: 'sb_jerry' },
        { role: 'inn', name: 'Black Belt Inn' },
        { role: 'shop', name: 'Dojo Town Supplies', shop: 'sb_karate_gear' },
        { role: 'restaurant', name: 'Iron Stomach Noodle House' },
        { role: 'doctor', name: 'Bone-Setter Clinic' },
      ],
    }],
    landmarks: [
      { kind: 'platform', dx: 0.4, dy: 0.28, fw: 3, fd: 2, s: 1.7, name: 'Tournament Ring', spot: 'karate_ring' },
      { kind: 'dummy', dx: 0.24, dy: -0.1 },
      { kind: 'dummy', dx: 0.31, dy: -0.13 },
      { kind: 'dummy', dx: 0.38, dy: -0.09 },
      { kind: 'torii', dx: 0.3, dy: -0.26, name: 'Gate of the Thousand Steps' },
      { kind: 'bell', dx: 0.5, dy: 0.2 },
    ],
    population: [['human', 84], ['mink', 12], ['longarm', 2], ['longleg', 2]],
    danger: 1,
    tagline: 'Every fist in the South Blue comes here to be humbled.',
    rumors: [
      'Boxing, karate, it is all the same on Karate Island: the one who gets up wins.',
      'The boxing champion Jerry is so tall he has to fold his legs behind his head to fight indoors. He calls it yoga.',
      'A young boxer with a fox\'s grin keeps entering the Open. Nobody knows how he wins. Nobody likes how he wins.',
      'Even Minks sail here to learn human karate. They say it\'s the patience they come for.',
    ],
  },

  // ----------------------------------------------------------- Torino Kingdom
  // "Treasure Island": a small island with a huge tree in the middle, ruled by
  // the giant Masukeredomo Goayu birds. The grass-skirted natives own the
  // finest medical library in the South Blue. Wandering Mink traders settled
  // among them generations ago.
  {
    id: 'torino_kingdom', name: 'Torino Kingdom', sea: 'south_blue', x: 3702, y: 1452, w: 124, h: 104,
    climate: 'tropical', rough: 0.28,
    blobs: [[0, 0, 0.86, 0.84], [-0.5, 0.46, 0.32, 0.3]],
    mountains: [{ name: 'Roots of the Great Tree', dx: 0.12, dy: -0.22, r: 0.16, h: 0.3 }],
    areas: [
      { name: 'Great Tree canopy', tile: T.JUNGLE, dx: 0.14, dy: -0.2, rx: 0.34, ry: 0.3 },
      { name: 'Medicinal meadow', tile: T.FLOWERS, dx: 0.5, dy: 0.25, rx: 0.14, ry: 0.12 },
    ],
    towns: [{
      id: 'torino_village', name: 'Torino Village', dx: -0.3, dy: 0.42, w: 50, h: 32, style: 'mink', dockDir: 'sw', plaza: 'well',
      buildings: [
        { role: 'inn', name: 'Grass-Skirt Inn' },
        { role: 'shop', name: 'Mink Trading Post', shop: 'sb_mink_trade', npc: 'sb_calico' },
        { role: 'library', name: 'Torino Library of Healing', npc: 'sb_shanba' },
        { role: 'doctor', name: "Herbalist's Hut" },
        { role: 'trainer', name: "Mink Elders' Longhouse", npc: 'sb_lobo', trainer: 'torino_elder' },
      ],
    }],
    landmarks: [
      { kind: 'tree', sub: 'jungle', s: 4, fw: 3, fd: 2, dx: 0.14, dy: -0.12, name: 'The Great Tree', spot: 'great_tree' },
      { kind: 'totem', dx: -0.08, dy: 0.12 },
      { kind: 'totem', dx: 0.34, dy: 0.1 },
      { kind: 'chest', dx: -0.04, dy: -0.12, item: 'sb_torino_herb', key: 'sb_herb_1', name: 'Herb basket' },
      { kind: 'chest', dx: 0.3, dy: -0.06, item: 'sb_torino_herb', key: 'sb_herb_2', name: 'Herb basket' },
      { kind: 'chest', dx: 0.16, dy: 0.06, item: 'sb_torino_herb', key: 'sb_herb_3', name: 'Herb basket' },
      { kind: 'bones', dx: 0.34, dy: -0.44 },
      { kind: 'chest', dx: 0.26, dy: -0.52, tier: 2, key: 'sb_goayu_nest', name: 'Goayu nest' },
    ],
    spots: [{ id: 'goayu_nest', dx: 0.22, dy: -0.44 }],
    population: [['human', 58], ['mink', 42]],
    danger: 2,
    tagline: 'Some call it Treasure Island. The giant birds call it theirs.',
    rumors: [
      'Don\'t let the grass skirts fool you — the Torino natives have the finest medical library in the South Blue.',
      'The Masukeredomo Goayu Birds nest in the Great Tree. Big enough to carry off a grown man. Some say they rule the island.',
      'The Mink traders on Torino never say where they came from. Only that they followed the scent of rare medicine and stayed.',
      'The birds fear only one thing: lightning. That\'s why they leave the Minks alone.',
    ],
  },

  // --------------------------------------------------------- Kutsukku Island
  // Unaffiliated with the World Government. Four towns ruled by four teenage
  // gang bosses — Kid, Killer, Heat and Wire — until a rival gang murdered
  // their friend Victoria and Kid united them all.
  {
    id: 'kutsukku_island', name: 'Kutsukku Island', sea: 'south_blue', x: 2500, y: 1706, w: 240, h: 170,
    climate: 'autumn', rough: 0.24,
    blobs: [[0, 0, 0.86, 0.84], [-0.52, -0.46, 0.34, 0.3], [0.52, 0.5, 0.34, 0.3]],
    areas: [
      { name: 'The Scrapyard', tile: T.GRAVEL, dx: -0.3, dy: 0.5, rx: 0.14, ry: 0.1 },
      { name: 'Burnt Row', tile: T.ASH, dx: 0.3, dy: -0.06, rx: 0.08, ry: 0.07 },
      { tile: T.ROCK, dx: -0.2, dy: -0.3, rx: 0.14, ry: 0.12 },
      { tile: T.FOREST, dx: 0.3, dy: 0.45, rx: 0.14, ry: 0.14 },
    ],
    towns: [
      {
        id: 'kutsukku_town', name: 'South Town', dx: 0.04, dy: 0.46, w: 62, h: 40, style: 'city', dockDir: 's', plaza: 'well',
        buildings: [
          { role: 'inn', name: 'Rust Bucket Inn' },
          { role: 'shop', name: 'Scrap & Sundries' },
          { role: 'restaurant', name: 'Curry Udon Stand', npc: 'sb_udon_man', shop: 'sb_udon' },
          { role: 'weapons', name: 'Scrap Arms' },
          { role: 'doctor', name: 'Back-Alley Doctor' },
          { role: 'shipwright', name: 'Scrapyard Slipway', npc: 'sb_rivet' },
        ],
      },
      {
        id: 'kutsukku_north', name: 'North Town', dx: -0.02, dy: -0.52, w: 40, h: 28, style: 'city', dockDir: 'n', plaza: 'well',
        buildings: [{ role: 'bar', name: 'The Masked Tavern', npc: 'sb_killer' }],
        houses: 14,
      },
      {
        id: 'kutsukku_east', name: 'East Town', dx: 0.58, dy: -0.1, w: 38, h: 28, style: 'city', dockDir: 'e', plaza: 'well',
        buildings: [{ role: 'bar', name: 'The Furnace', npc: 'sb_heat' }],
        houses: 14,
      },
      {
        id: 'kutsukku_west', name: 'West Town', dx: -0.58, dy: -0.02, w: 38, h: 28, style: 'city', dockDir: 'w', plaza: 'well',
        buildings: [{ role: 'bar', name: 'Trident Pier Tavern', npc: 'sb_wire' }],
        houses: 14,
      },
    ],
    docks: [
      { near: 'kutsukku_town', dir: 's', name: 'South Town Harbour' },
      { near: 'kutsukku_north', dir: 'n', name: 'North Town Pier' },
      { near: 'kutsukku_east', dir: 'e', name: 'East Town Pier' },
      { near: 'kutsukku_west', dir: 'w', name: 'West Town Pier' },
    ],
    landmarks: [
      { kind: 'building', role: 'hall', name: 'Grinder Family Mansion', dx: 0.02, dy: -0.06, fw: 10, fd: 5, hgt: 4, wall: '#5d4037', roof: '#212121', style: 'city', roofType: 'gable' },
      { kind: 'grave', dx: -0.34, dy: 0.24, name: "Victoria's Grave", spot: 'victoria_grave' },
      { kind: 'wheel', dx: -0.36, dy: 0.46 },
      { kind: 'crate', dx: -0.26, dy: 0.44 },
      { kind: 'barrel', dx: -0.3, dy: 0.56 },
      { kind: 'chest', dx: -0.24, dy: 0.56, tier: 1, name: 'Scrap heap' },
    ],
    spots: [{ id: 'grinder_mansion', dx: 0.02, dy: 0.02 }, { id: 'east_square', dx: 0.58, dy: -0.1 }],
    danger: 3,
    tagline: 'No Marines. No king. Just four towns, four gangs — and a grave.',
    rumors: [
      'Kutsukku isn\'t a World Government country. No Marines come here. The Grinder Family runs everything.',
      'Four gangs, four towns: the red-haired kid with the goggles, the masked one who never laughs, the one who breathes fire, the one with the trident.',
      'The Grinder Family shot a girl named Victoria in the street. Those four gang brats have gone very, very quiet.',
      'That red-haired kid can build anything out of scrap. Gears, guns — I saw him make a walking tin man once.',
    ],
  },

  // --------------------------------------------------------------- Baterilla
  // Portgas D. Rouge lived here. Gol D. Roger visited again and again; after
  // his execution the Marines scoured the island for his unborn child. Rouge
  // carried Ace for twenty months to hide him.
  {
    id: 'baterilla', name: 'Baterilla', sea: 'south_blue', x: 2890, y: 1665, w: 150, h: 104,
    climate: 'tropical', rough: 0.26,
    blobs: [[0.02, 0.05, 0.88, 0.8], [0.45, -0.42, 0.36, 0.34], [-0.55, -0.32, 0.3, 0.3]],
    mountains: [{ name: 'Sunset Hill', dx: 0.55, dy: -0.5, r: 0.14, h: 0.35 }],
    areas: [
      { name: 'Hibiscus garden', tile: T.FLOWERS, dx: 0.28, dy: -0.34, rx: 0.1, ry: 0.08 },
      { tile: T.JUNGLE, dx: -0.42, dy: -0.28, rx: 0.24, ry: 0.24 },
    ],
    trees: ['palm', 'palm', 'bush'],
    towns: [
      {
        id: 'baterilla_town', name: 'Baterilla Village', dx: -0.3, dy: 0.22, w: 48, h: 30, style: 'village', dockDir: 's', plaza: 'well',
        buildings: [
          { role: 'inn', name: 'Cabana Inn' },
          { role: 'shop', name: 'Beach Market' },
          { role: 'bar', name: 'Palm Shade Bar' },
          { role: 'doctor', name: "Midwife's House", npc: 'sb_pimienta' },
        ],
      },
      {
        id: 'baterilla_camp', name: 'Marine Search Camp', dx: 0.34, dy: 0.26, w: 28, h: 20, style: 'marine', dockDir: 'e', plaza: 'flagpole',
        buildings: [{ role: 'marine_base', name: 'Search Command Post', w: 9, d: 5, hgt: 3 }],
        houses: 0,
      },
    ],
    docks: [
      { near: 'baterilla_town', dir: 's', name: 'Baterilla Village' },
      { near: 'baterilla_camp', dir: 'e', name: 'Marine Search Camp' },
    ],
    landmarks: [
      { kind: 'building', role: 'hall', name: "Rouge's Cottage", dx: 0.2, dy: -0.4, fw: 5, fd: 3, hgt: 2, wall: '#fff8e1', roof: '#e57373', style: 'village', roofType: 'gable' },
      { kind: 'bench', dx: 0.34, dy: -0.36, name: 'Bench facing the sea', spot: 'rouge_bench' },
      { kind: 'tent', dx: -0.5, dy: 0.68, v: 2 },
      { kind: 'tent', dx: -0.2, dy: 0.72, v: 3 },
      { kind: 'boat', dx: 0.05, dy: 0.76 },
      { kind: 'chest', dx: -0.62, dy: -0.44, tier: 1, name: "Smugglers' cache" },
    ],
    spots: [{ id: 'cottage_path', dx: 0.12, dy: -0.18 }],
    danger: 1,
    tagline: 'Palm trees, cabanas — and Marines at every door.',
    rumors: [
      'The Marines are searching every house on Baterilla. Pregnant women, newborns... They say the Pirate King left a child here.',
      'Gol D. Roger came to Baterilla again and again. Not to plunder. He sat on the hill and watched the sea like any man in love.',
      'Some of the women the Marines took to the search camp never came back. Keep your voice down.',
    ],
  },

  // ----------------------------------------------------------- Sorbet Kingdom
  // Tropical, rough and dessert-themed. Castle Town in the north, the Elderly
  // Village in the south-west, the church of the Buccaneer pastor Bartholomew
  // Kuma in the south-east. Six years before the Straw Hats set sail, King
  // Bekori came back to burn the "deadweight" and Kuma destroyed his palace
  // alone: the Solo Revolution.
  {
    id: 'sorbet_kingdom', name: 'Sorbet Kingdom', sea: 'south_blue', x: 3270, y: 1690, w: 280, h: 200,
    climate: 'tropical', rough: 0.24,
    blobs: [[0, 0.02, 0.86, 0.8], [0, -0.52, 0.52, 0.36], [-0.5, 0.45, 0.4, 0.38], [0.5, 0.45, 0.4, 0.38]],
    mountains: [
      { name: 'The Dividing Ridge', dx: -0.16, dy: 0.06, r: 0.12, h: 0.55 },
      { name: 'Sorbet Highlands', dx: 0.24, dy: -0.02, r: 0.14, h: 0.6 },
    ],
    areas: [
      { tile: T.FOREST, dx: -0.6, dy: -0.12, rx: 0.18, ry: 0.2 },
      { tile: T.FOREST, dx: 0.62, dy: 0.02, rx: 0.18, ry: 0.2 },
      { tile: T.FARM, name: 'Royal orchards', dx: 0.36, dy: -0.36, rx: 0.12, ry: 0.08 },
      { tile: T.GRAVEL, name: 'The southern badlands', dx: 0.02, dy: 0.48, rx: 0.16, ry: 0.1 },
    ],
    towns: [
      {
        id: 'sorbet_town', name: 'Castle Town', dx: -0.06, dy: -0.52, w: 70, h: 46, style: 'town', walls: true, dockDir: 'n', plaza: 'fountain', plazaR: 5,
        buildings: [
          { role: 'palace', name: 'Sorbet Royal Palace', w: 12, d: 8, hgt: 5, wall: '#fce4ec', roof: '#4dd0e1' },
          { role: 'inn', name: 'Popsicle Tower Inn', wall: '#fff3e0', roof: '#f06292' },
          { role: 'shop', name: "Conney's Sherbet Parlor", shop: 'sb_sherbet', npc: 'sb_conney', wall: '#fce4ec', roof: '#ba68c8' },
          { role: 'market', name: "Gyogyo's Fish Stall", shop: 'sb_fish', npc: 'sb_gyogyo' },
          { role: 'doctor', name: 'Castle Town Hospital', npc: 'sb_nurse_mint' },
          { role: 'weapons', name: 'Royal Armory' },
          { role: 'bar', name: 'The Frozen Cone' },
        ],
      },
      {
        id: 'sorbet_elder_village', name: 'Elderly Village', dx: -0.5, dy: 0.5, w: 42, h: 28, style: 'village', dockDir: 'sw', plaza: 'well',
        buildings: [
          { role: 'hall', name: 'Village Meeting Hall', npc: 'sb_granny_nougat' },
          { role: 'shop', name: 'Village Store' },
        ],
        houses: 12,
      },
      {
        id: 'sorbet_church', name: "Kuma's Church", dx: 0.5, dy: 0.5, w: 32, h: 24, style: 'village', dockDir: 'se', plaza: 'well',
        buildings: [{ role: 'church', name: "Kuma's Church", npc: 'sb_kuma', w: 7, d: 5, hgt: 4, wall: '#fff8e1', roof: '#6d4c41' }],
        houses: 1,
      },
    ],
    docks: [
      { near: 'sorbet_town', dir: 'n', name: 'Castle Town Harbour' },
      { near: 'sorbet_elder_village', dir: 'sw', name: 'Elderly Village Jetty' },
      { near: 'sorbet_church', dir: 'se', name: 'Church Cove' },
    ],
    landmarks: [
      { kind: 'grave', dx: 0.66, dy: 0.4, name: "Ginny's Grave", spot: 'ginny_grave' },
      { kind: 'sign', dx: -0.02, dy: 0.2, name: 'Old border post — "Southern Province" (abolished)' },
      { kind: 'boat', dx: 0.16, dy: 0.84 },
    ],
    spots: [
      { id: 'sorbet_south_beach', dx: 0.14, dy: 0.7 },
      { id: 'elder_square', dx: -0.5, dy: 0.5 },
      { id: 'castle_square', dx: -0.06, dy: -0.48 },
    ],
    population: [['human', 97], ['buccaneer', 3]],
    danger: 2,
    tagline: 'A kingdom of popsicle towers — and a king who wants its old folk gone.',
    rumors: [
      'Sixteen years ago the Freedom Fighters chased King Bekori out of Sorbet. Now he\'s back, and he\'s marking doors in the south with red paint.',
      'The pastor at the church in the south-east can take your pain away with his hands. Literally. Then he carries it himself.',
      'Government men used to watch the hospital for babies born too big. Buccaneer babies. They took a whole family once — the church family.',
      'Queen Dowager Conney makes a pizza as big as a cart wheel. And strawberry sherbet — don\'t you dare leave Sorbet without trying it.',
    ],
  },

  // ------------------------------------------------------------ Samba Kingdom
  // King Moqueca's kingdom of drums and carnival. The dancer Pascia, later sold
  // at the Sabaody auction, came from the South Blue.
  {
    id: 'samba_kingdom', name: 'Samba Kingdom', sea: 'south_blue', x: 3650, y: 1665, w: 150, h: 100,
    climate: 'tropical', rough: 0.26,
    blobs: [[0, 0, 0.86, 0.8], [0.52, 0.36, 0.36, 0.34], [-0.5, -0.4, 0.3, 0.3]],
    areas: [
      { tile: T.JUNGLE, dx: 0.4, dy: -0.32, rx: 0.28, ry: 0.28 },
      { tile: T.SAND, name: 'Carnival beach', dx: -0.1, dy: 0.62, rx: 0.3, ry: 0.1 },
    ],
    towns: [{
      id: 'samba_town', name: 'Samba Royal City', dx: -0.22, dy: 0.16, w: 58, h: 40, style: 'town', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'palace', name: 'Palace of King Moqueca', npc: 'sb_moqueca', wall: '#fff59d', roof: '#43a047' },
        { role: 'inn', name: 'Carnival Inn' },
        { role: 'restaurant', name: 'Moqueca Stew House', shop: 'sb_samba_food' },
        { role: 'shop', name: 'Carnival Costume Boutique', shop: 'outfitter' },
        { role: 'bar', name: 'Bateria Bar' },
      ],
    }],
    landmarks: [
      { kind: 'platform', dx: 0.22, dy: 0.42, fw: 3, fd: 2, name: 'Carnival Stage', spot: 'carnival_stage' },
      { kind: 'lantern', dx: 0.14, dy: 0.4, light: true },
      { kind: 'lantern', dx: 0.3, dy: 0.4, light: true },
      { kind: 'stall', dx: 0.1, dy: 0.5 },
      { kind: 'stall', dx: 0.34, dy: 0.5 },
      { kind: 'boat', dx: 0.66, dy: -0.34 },
    ],
    spots: [{ id: 'slaver_cove', dx: 0.62, dy: -0.28 }],
    danger: 1,
    tagline: 'Drums till dawn. Every night is carnival night.',
    rumors: [
      'King Moqueca would rather dance than rule. Nobody has complained yet.',
      'Slaver boats have been seen off the east coast. They sell South Blue dancers to nobles at some auction in the Grand Line.',
      'Moqueca stew — fish, coconut and palm oil. The king named himself after it. Or it after him. Nobody remembers.',
    ],
  },

  // -------------------------------------------------------- Samuwanai Island
  // Birthplace of the giantess Ida, who left for a circus in the Bunt Kingdom
  // and later ran a bar in Elbaf.
  {
    id: 'samuwanai_island', name: 'Samuwanai Island', sea: 'south_blue', x: 3930, y: 1640, w: 46, h: 40,
    climate: 'tropical', rough: 0.3,
    landmarks: [
      { kind: 'ruins', dx: -0.1, dy: -0.1, name: 'Giant-sized cottage' },
      { kind: 'sign', dx: 0.2, dy: 0.1, name: '"Ida was here" (carved very, very high)' },
      { kind: 'chest', dx: 0.25, dy: -0.25, tier: 2, name: 'A giant\'s forgotten sea chest' },
    ],
    danger: 1,
    tagline: 'Not cold. Not crowded. A giant was born here once.',
    rumors: ['Samuwanai Island? Tiny place. They say a giant girl was born there and ran off to join a circus.'],
  },

  // ---------------------------------------------------------- Vespa Kingdom
  // Kuzan (Aokiji) was born in one of its territories and left thirty years
  // before the present.
  {
    id: 'vespa_kingdom', name: 'Vespa Kingdom', sea: 'south_blue', x: 2440, y: 1910, w: 120, h: 80,
    climate: 'temperate', rough: 0.24,
    blobs: [[0, 0, 0.86, 0.8], [0.5, -0.35, 0.34, 0.3]],
    areas: [{ tile: T.FARM, name: 'Vineyards', dx: 0.4, dy: -0.25, rx: 0.2, ry: 0.15 }],
    towns: [{
      id: 'vespa_town', name: 'Vespa', dx: -0.18, dy: 0.12, w: 48, h: 30, style: 'town', dockDir: 'n', plaza: 'fountain',
      buildings: [
        { role: 'inn', name: 'Siesta Inn' },
        { role: 'shop', name: 'Vespa Grocer' },
        { role: 'marine_base', name: 'Marine Recruitment Office', npc: 'sb_vespa_recruiter', w: 9, d: 5, hgt: 3 },
        { role: 'bar', name: 'The Slow Cafe' },
      ],
    }],
    landmarks: [{ kind: 'bench', dx: 0.42, dy: 0.28, name: "The Lazy Boy's Bench", spot: 'lazy_bench' }],
    danger: 1,
    tagline: 'A sleepy kingdom of vineyards. One of its sleepy boys became an Admiral.',
    rumors: [
      'A tall boy from one of Vespa\'s territories used to nap under every tree in the kingdom. Kuzan. They say he\'s high up in the Marines now.',
      'The Marine recruiting office in Vespa takes anyone with a clean record.',
    ],
  },

  // ----------------------------------------------------------- Taya Kingdom
  // Aramaki (Ryokugyu) was a police officer here before he was arrested and
  // drafted into the Marines by the World Government.
  {
    id: 'taya_kingdom', name: 'Taya Kingdom', sea: 'south_blue', x: 2800, y: 1895, w: 140, h: 100,
    climate: 'temperate', rough: 0.24,
    blobs: [[0, 0, 0.86, 0.8], [0.45, -0.35, 0.36, 0.34]],
    areas: [{ name: 'Deep Taya Forest', tile: T.FOREST, dx: 0.32, dy: -0.12, rx: 0.36, ry: 0.4 }],
    towns: [{
      id: 'taya_town', name: 'Taya City', dx: -0.4, dy: 0.2, w: 44, h: 30, style: 'town', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'bounty', name: 'Taya Police Station', npc: 'sb_aramaki' },
        { role: 'inn', name: 'Greenwood Inn' },
        { role: 'shop', name: 'Taya Market' },
        { role: 'doctor', name: 'Taya Clinic' },
      ],
    }],
    landmarks: [
      { kind: 'tent', dx: 0.45, dy: -0.25, spot: 'bandit_camp' },
      { kind: 'campfire', dx: 0.5, dy: -0.2 },
      { kind: 'crate', dx: 0.4, dy: -0.18 },
    ],
    danger: 2,
    tagline: 'The forests of Taya are very, very quiet. The police like it that way.',
    rumors: [
      'Officer Aramaki of the Taya Police is the strongest man in the kingdom. He\'s also the laziest.',
      'A bandit called the Rootcutter robs the lumber carts in the deep forest.',
    ],
  },

  // -------------------------------------------------------- Roshwan Kingdom
  // King Beer VI and his nesting-doll daughters, the Matryo Princesses:
  // Matryosaka, Matryosuka, Matryoseka and the smallest, Matryosoka.
  {
    id: 'roshwan_kingdom', name: 'Roshwan Kingdom', sea: 'south_blue', x: 3190, y: 1900, w: 170, h: 110,
    climate: 'winter', rough: 0.22,
    blobs: [[0, 0, 0.86, 0.82], [0.5, -0.3, 0.36, 0.34]],
    mountains: [{ name: 'Frostfang Ridge', dx: 0.5, dy: -0.34, r: 0.16, h: 0.7 }],
    areas: [{ tile: T.ICE, name: 'The frozen lake', dx: 0.1, dy: 0.36, rx: 0.12, ry: 0.08 }],
    towns: [{
      id: 'roshwan_town', name: 'Roshwan Royal City', dx: -0.3, dy: 0.05, w: 58, h: 40, style: 'snow', dockDir: 'n', plaza: 'fountain',
      buildings: [
        { role: 'palace', name: 'Palace of the Tankards', npc: 'sb_beer_vi', wall: '#b71c1c', roof: '#fdd835' },
        { role: 'inn', name: 'Twin Tankards Inn' },
        { role: 'shop', name: 'Roshwan Furrier', shop: 'sb_furs' },
        { role: 'bar', name: 'The Clinking Tankards' },
        { role: 'doctor', name: 'Royal Physician' },
      ],
    }],
    landmarks: [
      { kind: 'crystal', dx: 0.58, dy: 0.02, name: 'The ice cave', spot: 'frozen_cave' },
      { kind: 'crystal', dx: 0.62, dy: 0.08 },
    ],
    danger: 2,
    tagline: 'Where the tankards clink and the snow never melts.',
    rumors: [
      'King Beer the Sixth has four daughters, each one smaller than the last. The Matryo Princesses.',
      'Snow wolves den in the ice caves east of the royal city. Don\'t go there after dark.',
    ],
  },

  // -------------------------------------------------- Evil Black Drum Kingdom
  // After Wapol Konzern made him rich again, the World Nobles gave Wapol a
  // new kingdom in the South Blue: a huge castle under stormy skies.
  {
    id: 'evil_black_drum', name: 'Evil Black Drum Kingdom', sea: 'south_blue', x: 3620, y: 1895, w: 150, h: 110,
    climate: 'winter', rough: 0.24,
    blobs: [[0, 0, 0.86, 0.82], [0.46, -0.4, 0.34, 0.3]],
    mountains: [{ name: 'Tin-Plate Crag', dx: 0.45, dy: -0.4, r: 0.16, h: 0.75 }],
    areas: [{ tile: T.GRAVEL, name: 'Scrap mounds', dx: 0.35, dy: 0.3, rx: 0.14, ry: 0.1 }],
    towns: [{
      id: 'black_drum_town', name: 'Wapol Castle Town', dx: -0.18, dy: 0.14, w: 60, h: 42, style: 'snow', walls: true, dockDir: 's', plaza: 'statue',
      buildings: [
        { role: 'palace', name: 'Evil Black Drum Castle', npc: 'sb_wapol', w: 12, d: 8, hgt: 6, wall: '#37474f', roof: '#212121' },
        { role: 'shop', name: 'Wapol Konzern Toy Emporium' },
        { role: 'inn', name: 'Tin Crown Inn' },
        { role: 'bar', name: 'Hakowan Tavern' },
        { role: 'hall', name: 'Baku Baku Factory', npc: 'sb_tinker_pim', wall: '#78909c', roof: '#455a64' },
      ],
    }],
    landmarks: [{ kind: 'statue', dx: 0.2, dy: 0.3, name: 'Statue of King Wapol (tin-plated)' }],
    danger: 2,
    tagline: 'A kingdom bought with toys. The king eats whatever he likes — including the kingdom.',
    rumors: [
      'Wapol lost Drum Island, then made a fortune selling toys. The Celestial Dragons gave him a whole new kingdom for it.',
      'King Wapol ate the clock tower because it chimed during his nap. Swallowed it whole.',
    ],
  },
];
