// North Blue — the cold "northern sea", top-left quadrant (x 90..1850,
// y 66..700). Reverse Mountain's North Blue canal opens at its south-east
// corner (1898, 706); the sea around it is left open for sailing in.
//
// Canon places (One Piece Wiki, "North Blue"): the Lvneel Kingdom (Noland's
// homeland), Flevance "the White City" (destroyed over Amber Lead), the port
// town of Spider Miles (the Donquixote Pirates' junkyard base), the port town
// of Rakesh (pillaged by the Donquixote officers), Downs (where the gang that
// became the Donquixote Pirates was born), Notice (home of the Bellamy
// Pirates), Kuen Village (Baby 5's birthplace), the Deul Kingdom (King Chap),
// the Whiteland Kingdom (King Iwatobi), the roaming Germa Kingdom, and the
// neighbouring trio Rubeck, Minion and Swallow Islands (Swallow lies south of
// Minion and Rubeck; Minion lies east of Rubeck and north-east of Swallow).
//
// Starter towns (character spawn points): lvneel_town, notice_town,
// spider_miles_port, swallow_town (Pleasure Town), rakesh_port and
// whiteland_town — Flevance's ruined "White Town", now home only to a
// gravekeeper and a few scavengers who came after the fall.
import { T } from '../../world/tiles.js';

export const NORTH_BLUE = [
  // ------------------------------------------------------------ Downs
  {
    id: 'downs', name: 'Downs', sea: 'north_blue', x: 190, y: 170, w: 90, h: 70,
    climate: 'marsh', rough: 0.3,
    blobs: [[0, 0, 0.85, 0.8], [0.4, 0.35, 0.35, 0.35]],
    areas: [
      { name: 'The Refuse Flats', tile: T.GRAVEL, dx: 0.3, dy: -0.25, rx: 0.3, ry: 0.25 },
      { tile: T.DIRT, dx: -0.3, dy: 0.2, rx: 0.3, ry: 0.25 },
    ],
    trees: ['dead', 'bush'], treeDensity: 0.03,
    towns: [{
      id: 'downs_town', name: 'Downs', dx: -0.22, dy: 0.1, w: 34, h: 24, style: 'ruins', dockDir: 's', plaza: 'well',
      buildings: [
        { role: 'tavern', name: 'The Gutter' },
        { role: 'shop', name: 'Rag-and-Bone Shop' },
        { role: 'library', name: 'Old Newspaper Shack' },
      ],
      houses: 6,
    }],
    landmarks: [
      { kind: 'ruins', dx: 0.35, dy: -0.3, name: 'The shack by the garbage heap', spot: 'kings_heap' },
      { kind: 'bones', dx: 0.45, dy: -0.22 },
      { kind: 'barrel', dx: 0.25, dy: -0.4 },
      { kind: 'crate', dx: 0.2, dy: -0.35 },
      { kind: 'wheel', dx: 0.5, dy: -0.35 },
      { kind: 'chest', dx: 0.55, dy: -0.42, name: 'A rusted strongbox under the junk', key: 'nb_downs_box', tier: 2, item: 'gold_coins' },
    ],
    danger: 2,
    tagline: 'Where the North Blue throws away what it does not want.',
    music: 'night',
    rumors: [
      '"Downs is where the North Blue dumps what it doesn\'t want. People included."',
      '"Fifteen years back, four brats crowned a fifth on a garbage heap out east. Now half the sea knows his name."',
      '"Old Moss has been picking this junk since before you were born. Ask him about the \'king\' of Downs."',
    ],
  },

  // ------------------------------------------------------------ Flevance
  {
    id: 'flevance', name: 'Flevance', sea: 'north_blue', x: 560, y: 190, w: 210, h: 150,
    climate: 'winter', rough: 0.24,
    blobs: [[0, 0, 0.85, 0.8], [-0.55, 0.35, 0.4, 0.4], [0.5, -0.35, 0.45, 0.4]],
    mountains: [{ name: 'Amber Lead Hills', dx: 0.55, dy: -0.45, r: 0.2, h: 0.55 }],
    areas: [
      { name: 'Amber Lead Mine', tile: T.GRAVEL, dx: 0.38, dy: -0.3, rx: 0.1, ry: 0.08 },
      { name: 'The white fields', tile: T.MARBLE, dx: 0.1, dy: -0.25, rx: 0.2, ry: 0.1 },
    ],
    trees: ['deadsnow', 'snowpine'], treeDensity: 0.04,
    towns: [{
      id: 'whiteland_town', name: 'The White Town', dx: 0.05, dy: 0.1, w: 60, h: 42, style: 'ruins', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'inn', name: "Gravekeeper's Lodge", npc: 'nb_konrad' },
        { role: 'shop', name: 'Salvage Stall', npc: 'nb_mervin' },
        { role: 'church', name: 'Chapel of the White Town' },
        { role: 'library', name: 'Academy Reading Room' },
        { role: 'house', name: 'Boarded-up House' },
      ],
    }],
    landmarks: [
      { kind: 'ruins', dx: 0.45, dy: 0.2, name: 'Ruins of the Trafalgar hospital', spot: 'hospital_ruins' },
      { kind: 'grave', dx: 0.52, dy: 0.26, name: 'A small cross in the white: "Lami"' },
      { kind: 'ruins', dx: -0.1, dy: -0.45, name: 'Abandoned Royal Palace of Flevance', spot: 'palace_ruins' },
      { kind: 'pillar', dx: -0.18, dy: -0.42 },
      { kind: 'pillar', dx: -0.02, dy: -0.42 },
      { kind: 'arch', dx: 0.4, dy: -0.28, name: 'Amber Lead Mine', spot: 'amber_mine' },
      { kind: 'chest', dx: 0.46, dy: -0.3, name: 'Abandoned ore cart', key: 'nb_amber_cart', tier: 2, item: 'amber_lead' },
      // the quarantine line of the neighbouring countries, on the west of the island
      { kind: 'fence', dx: -0.5, dy: -0.3 },
      { kind: 'fence', dx: -0.5, dy: -0.12 },
      { kind: 'fence', dx: -0.5, dy: 0.06 },
      { kind: 'sign', dx: -0.46, dy: 0.2, name: 'QUARANTINE LINE — TURN BACK OR BE SHOT', spot: 'border_line' },
      { kind: 'tent', dx: -0.62, dy: 0.25, name: 'Abandoned border post' },
      { kind: 'campfire', dx: -0.6, dy: 0.32 },
      { kind: 'grave', dx: -0.4, dy: 0.42, name: 'Mass grave of the White Town' },
      { kind: 'grave', dx: -0.35, dy: 0.46, name: 'Mass grave of the White Town' },
      { kind: 'bones', dx: -0.43, dy: 0.47 },
    ],
    danger: 2,
    tagline: 'The White City. It looks like snow. It is not.',
    music: 'night',
    rumors: [
      '"The white on the ground isn\'t snow. It\'s Amber Lead. Don\'t lick it."',
      '"The royal family fled on World Government ships the week the quarantine began. The rest of the town wasn\'t so lucky."',
      '"They say one child got out. Hid under the dead and was carried across the border."',
      '"Konrad the gravekeeper stood on the quarantine line, back then. Now he digs. Every day, he digs."',
    ],
  },

  // ----------------------------------------------------- Whiteland Kingdom
  {
    id: 'whiteland', name: 'Whiteland Kingdom', sea: 'north_blue', x: 1000, y: 120, w: 130, h: 80,
    climate: 'winter', rough: 0.25,
    blobs: [[0, 0, 0.85, 0.8], [0.45, 0.3, 0.35, 0.35]],
    mountains: [{ name: 'Penguin Rock', dx: -0.5, dy: -0.3, r: 0.22, h: 0.7 }],
    towns: [{
      id: 'whiteland_castle_town', name: 'Whiteland', dx: 0.1, dy: 0.1, w: 52, h: 34, style: 'snow', walls: true, dockDir: 's', plaza: 'statue',
      buildings: [
        { role: 'palace', name: 'Whiteland Palace', npc: 'nb_iwatobi', w: 12, d: 6, hgt: 4 },
        { role: 'doctor', name: 'Whiteland Royal Hospital', npc: 'nb_abel' },
        { role: 'inn', name: 'Rockhopper Inn' },
        { role: 'shop', name: 'Furs & Provisions' },
      ],
    }],
    landmarks: [
      { kind: 'tent', dx: 0.62, dy: 0.45, name: 'Ice-fishing hut' },
      { kind: 'campfire', dx: 0.66, dy: 0.52 },
    ],
    danger: 2,
    tagline: 'The coldest kingdom that still pays its dues to Mary Geoise.',
    rumors: [
      '"King Iwatobi is short, old and nicer than he looks. Don\'t mention Flevance to him."',
      '"Dr. Abel of the Royal Hospital is the best doctor in the north — and the most frightened."',
    ],
  },

  // ------------------------------------------------------- Lvneel Kingdom
  {
    id: 'lvneel', name: 'Lvneel Kingdom', sea: 'north_blue', x: 960, y: 330, w: 240, h: 160,
    climate: 'temperate', rough: 0.22,
    blobs: [[0, 0, 0.85, 0.8], [-0.55, -0.3, 0.4, 0.45], [0.55, 0.3, 0.4, 0.4]],
    mountains: [{ name: 'Lvneel Hills', dx: -0.55, dy: -0.4, r: 0.18, h: 0.45 }],
    areas: [
      { name: 'Pine woods', tile: T.FOREST, dx: -0.35, dy: -0.35, rx: 0.3, ry: 0.25 },
      { tile: T.FARM, dx: 0.5, dy: -0.3, rx: 0.15, ry: 0.12 },
    ],
    trees: ['pine', 'pine', 'oak', 'bush'],
    towns: [
      {
        id: 'lvneel_town', name: 'Lvneel', dx: 0.0, dy: 0.25, w: 72, h: 46, style: 'town', dockDir: 's', plaza: 'statue', plazaR: 5,
        buildings: [
          { role: 'inn', name: 'The Chestnut Inn' },
          { role: 'shop', name: 'Lvneel Market' },
          { role: 'shop', name: 'Royal Bookshop', npc: 'nb_hedda' },
          { role: 'library', name: 'Royal Archive', npc: 'nb_pell' },
          { role: 'tavern', name: "The Admiral's Rest" },
          { role: 'shipwright', name: 'Royal Dockyard' },
          { role: 'doctor', name: 'Lvneel Clinic' },
          { role: 'dojo', name: 'Royal Fencing Hall', npc: 'nb_ostrander' },
          { role: 'weapons', name: 'Lvneel Armory' },
        ],
      },
      {
        id: 'lvneel_castle', name: 'Lvneel Castle', dx: 0.0, dy: -0.3, w: 46, h: 32, style: 'noble', walls: true, plaza: 'fountain',
        buildings: [
          { role: 'palace', name: 'Lvneel Royal Castle', w: 14, d: 7, hgt: 5 },
          { role: 'hall', name: 'Hall of Admirals' },
        ],
        houses: 2,
      },
    ],
    docks: [{ near: 'lvneel_town', dir: 's', name: 'Lvneel Harbour' }],
    landmarks: [
      { kind: 'platform', dx: 0.47, dy: 0.08, name: 'The execution stand where Noland died', spot: 'noland_stand' },
      { kind: 'statue', dx: 0.4, dy: -0.02, name: 'Statue of the Brave King Aruyutayan V ("slayer of the Sea King", says the plaque)' },
      { kind: 'bench', dx: 0.38, dy: 0.5, name: 'Harbour bench', spot: 'lvneel_bench' },
      { kind: 'lighthouse', dx: 0.72, dy: 0.55, name: 'Lvneel Lighthouse' },
      { kind: 'grave', dx: -0.5, dy: 0.3, name: 'The Montblanc family plot (no flowers)' },
    ],
    spots: [{ id: 'lvneel_seaking', dx: 0.1, dy: 1.45 }],
    danger: 2,
    tagline: 'Homeland of Montblanc Noland — "the Liar".',
    music: 'town',
    rumors: [
      '"\'Liar Noland\' — every child in Lvneel knows it by heart. Lie, and you\'ll end up like Noland!"',
      '"The Crown still polishes the statue of Aruyutayan V. The brave king who slew a Sea King, supposedly."',
      '"Sea Kings still surface off the south coast. Fishermen stay close to the harbour."',
      '"Noland\'s descendants left Lvneel long ago. Folks weren\'t kind to them."',
      '"A giant of a man in a black feather coat has been dragging a sick, white-spotted boy to every clinic in the North Blue. Never says a word. The doctors throw them out."',
    ],
  },

  // ---------------------------------------------------------- Deul Kingdom
  {
    id: 'deul', name: 'Deul Kingdom', sea: 'north_blue', x: 1440, y: 190, w: 190, h: 130,
    climate: 'temperate', rough: 0.24,
    blobs: [[0, 0, 0.85, 0.8], [0.5, 0.35, 0.35, 0.35], [-0.5, -0.35, 0.35, 0.35]],
    mountains: [{ name: 'Eagle Crag', dx: 0.55, dy: -0.45, r: 0.18, h: 0.6 }],
    areas: [{ tile: T.FARM, dx: -0.45, dy: 0.35, rx: 0.2, ry: 0.15 }, { tile: T.FOREST, dx: 0.4, dy: 0.4, rx: 0.2, ry: 0.2 }],
    trees: ['pine', 'oak'],
    towns: [{
      id: 'deul_capital', name: 'Deul', dx: -0.05, dy: 0.08, w: 66, h: 46, style: 'city', walls: true, dockDir: 's', plaza: 'flagpole', plazaR: 5,
      buildings: [
        { role: 'palace', name: 'Deul Palace', npc: 'nb_chap', w: 12, d: 6, hgt: 5 },
        { role: 'marine_base', name: 'North Blue Marine Branch', npc: 'nb_hask', w: 10, d: 6, hgt: 4 },
        { role: 'bounty', name: 'Deul Bounty Office' },
        { role: 'weapons', name: 'Royal Arsenal of Deul' },
        { role: 'inn', name: 'Eagle Barracks Inn' },
        { role: 'shop', name: 'Deul Quartermaster' },
        { role: 'doctor', name: 'Army Hospital' },
      ],
    }],
    landmarks: [
      { kind: 'cannon', dx: 0.35, dy: 0.5 },
      { kind: 'cannon', dx: 0.43, dy: 0.5 },
      { kind: 'flagpole', dx: 0.5, dy: 0.18, name: 'War banner of Deul' },
    ],
    danger: 2,
    tagline: 'A kingdom that likes its neighbours small and frightened.',
    rumors: [
      '"King Chap wears round dark glasses and a soldier\'s cap. He\'s never lost a war — he makes his allies fight them."',
      '"The Marine branch in Deul trains the whole North Blue fleet. Bounty hunters cash their heads in here too."',
    ],
  },

  // -------------------------------------------------------- Germa Kingdom
  // A nation without land: brick platforms built on the shells of giant
  // snail-ships, interlocked around the Vinsmoke Castle. At anchor near the
  // Red Line — Germa's snails can climb it.
  {
    id: 'germa_kingdom', name: 'Germa Kingdom', sea: 'north_blue', x: 1790, y: 330, w: 120, h: 90,
    climate: 'temperate', ground: T.COBBLE, beach: T.PLANK, rough: 0.04, noiseScale: 0.02, elevRate: 0.5, beachWidth: 1,
    archipelago: true,
    blobs: [[0, 0, 0.48, 0.48], [0.62, -0.52, 0.26, 0.3], [0.62, 0.52, 0.26, 0.3], [-0.66, 0.02, 0.28, 0.36]],
    paint: [
      { op: 'path', points: [[0.2, -0.2], [0.55, -0.45]], width: 3, tile: T.BRIDGE },
      { op: 'path', points: [[0.2, 0.2], [0.55, 0.45]], width: 3, tile: T.BRIDGE },
      { op: 'path', points: [[-0.3, 0.02], [-0.55, 0.02]], width: 3, tile: T.BRIDGE },
    ],
    treeDensity: 0.004, trees: ['bush'],
    towns: [{
      id: 'germa_castle', name: 'Vinsmoke Castle', dx: 0, dy: 0.04, w: 46, h: 32, style: 'noble', dockDir: 's', plaza: 'flagpole',
      buildings: [
        { role: 'palace', name: 'Vinsmoke Castle', npc: 'nb_judge', w: 12, d: 6, hgt: 6, wall: '#a1887f', roof: '#b71c1c' },
        { role: 'restaurant', name: 'Royal Kitchen', npc: 'nb_cosette' },
        { role: 'doctor', name: 'Medical Ward', npc: 'nb_eponi' },
        { role: 'hall', name: 'Soldier Stock Depot', wall: '#546e7a', roof: '#263238' },
      ],
      houses: 0,
    }],
    landmarks: [
      { kind: 'building', role: 'hall', name: 'Yonji Castle', dx: 0.62, dy: -0.55, fw: 6, fd: 4, hgt: 5, wall: '#a1887f', roof: '#2e7d32', style: 'noble' },
      { kind: 'flagpole', dx: -0.66, dy: -0.2, name: 'Flag of the Germa Kingdom' },
      { kind: 'cannon', dx: 0.66, dy: 0.44 },
      { kind: 'cannon', dx: 0.56, dy: 0.6 },
      { kind: 'cannon', dx: -0.72, dy: 0.25 },
    ],
    spots: [{ id: 'germa_parade', dx: -0.66, dy: 0.08 }, { id: 'germa_courtyard', dx: 0.62, dy: 0.5 }],
    danger: 3,
    tagline: 'The Kingdom of Science — a nation without land.',
    music: 'battle',
    rumors: [
      '"Every soldier here has the same face. The same dark lenses. Every single one."',
      '"The princes wear suits that come out of a can. And their boots fly."',
      '"Three hundred years ago the Vinsmokes ruled the entire North Blue. The king means to again."',
    ],
  },

  // --------------------------------------------------------- Spider Miles
  {
    id: 'spider_miles', name: 'Spider Miles', sea: 'north_blue', x: 330, y: 420, w: 170, h: 120,
    climate: 'rocky', rough: 0.24,
    blobs: [[0, 0, 0.85, 0.8], [0.5, 0.4, 0.4, 0.35], [-0.5, -0.4, 0.35, 0.35]],
    areas: [
      { name: 'Waste Processing Plant', tile: T.GRAVEL, dx: -0.35, dy: -0.2, rx: 0.36, ry: 0.36 },
      { tile: T.STEEL, dx: -0.4, dy: -0.25, rx: 0.12, ry: 0.1 },
      { tile: T.GRAVEL, dx: 0.3, dy: -0.35, rx: 0.15, ry: 0.12 },
    ],
    trees: ['pine', 'dead', 'rock'], treeDensity: 0.02,
    towns: [
      {
        id: 'spider_miles_port', name: 'Spider Miles', dx: 0.25, dy: 0.25, w: 62, h: 42, style: 'port', dockDir: 's', plaza: 'fountain',
        buildings: [
          { role: 'inn', name: 'The Rust Bucket Inn' },
          { role: 'shop', name: 'Spider Miles General Store' },
          { role: 'market', name: 'Scrap Market', shop: 'nb_scrap_market' },
          { role: 'bar', name: 'The Oil Lamp' },
          { role: 'weapons', name: 'Junk Arms' },
          { role: 'shipwright', name: 'Scrapyard Shipwright', npc: 'nb_gus' },
          { role: 'doctor', name: 'Back-Alley Clinic' },
        ],
      },
      {
        id: 'dq_hideout', name: 'Waste Processing Plant', dx: -0.42, dy: -0.26, w: 42, h: 30, style: 'city', walls: true, plaza: 'flagpole',
        buildings: [
          { role: 'hall', name: 'Donquixote Family Hideout', npc: 'nb_doflamingo', w: 10, d: 6, hgt: 5, wall: '#6d4c41', roof: '#ad1457' },
          { role: 'house', name: 'Incinerator Works', w: 8, d: 5, hgt: 4, wall: '#5d4037', roof: '#37474f' },
        ],
        houses: 3,
      },
    ],
    docks: [{ near: 'spider_miles_port', dir: 's', name: 'Spider Miles Harbour' }],
    landmarks: [
      { kind: 'sign', dx: -0.12, dy: -0.22, name: 'WASTE PROCESSING PLANT — KEEP OUT', spot: 'dq_gate' },
      { kind: 'crate', dx: -0.36, dy: 0.06, name: 'Scrap heap below the hideout window', spot: 'dq_window' },
      { kind: 'barrel', dx: -0.3, dy: 0.08 },
      { kind: 'wheel', dx: -0.08, dy: -0.08 },
      { kind: 'anchor', dx: -0.02, dy: -0.42 },
      { kind: 'shipwreck', dx: -0.72, dy: 0.22, name: 'Mountain of scrap metal' },
      { kind: 'crate', dx: -0.1, dy: -0.36 },
      { kind: 'barrel', dx: -0.05, dy: -0.3 },
      { kind: 'chest', dx: -0.72, dy: -0.46, name: 'Donquixote vault door', spot: 'dq_vault', key: 'nb_dq_vault', tier: 3 },
    ],
    spots: [{ id: 'sm_harbour', dx: 0.28, dy: 0.62 }, { id: 'dq_arena', dx: 0.05, dy: -0.42 }, { id: 'dq_stoneyard', dx: -0.55, dy: 0.28 }],
    danger: 3,
    tagline: 'A port town that lives off what the Donquixote Family throws away.',
    music: 'town',
    rumors: [
      '"Don\'t go near the waste plant. The Donquixote Family lives there, and they don\'t like visitors."',
      '"A boy covered in white spots walked into the plant with grenades strapped to his chest. Crazy kid."',
      '"The tall officer, Corazon, never says a word. They say he hates children."',
      '"The captain wears a pink feather coat and laughs like \'fuffuffu\'. Nobody in this port crosses him."',
    ],
  },

  // --------------------------------------------------------------- Rakesh
  {
    id: 'rakesh', name: 'Rakesh', sea: 'north_blue', x: 200, y: 620, w: 130, h: 95,
    climate: 'autumn', rough: 0.26,
    blobs: [[0, 0, 0.85, 0.8], [0.45, 0.35, 0.4, 0.4], [-0.5, -0.3, 0.35, 0.35]],
    mountains: [{ name: 'Rakesh Heights', dx: -0.55, dy: -0.38, r: 0.2, h: 0.5 }],
    areas: [{ tile: T.FOREST, dx: -0.55, dy: 0.05, rx: 0.25, ry: 0.3 }, { tile: T.FARM, dx: -0.3, dy: 0.5, rx: 0.15, ry: 0.1 }],
    towns: [{
      id: 'rakesh_port', name: 'Rakesh', dx: -0.1, dy: 0.08, w: 56, h: 40, style: 'port', dockDir: 'e', plaza: 'fountain',
      buildings: [
        { role: 'house', name: "Harbourmaster's Office", npc: 'nb_brandt' },
        { role: 'inn', name: 'The Anchor Chain Inn' },
        { role: 'shop', name: 'Rakesh Chandlery' },
        { role: 'shop', name: 'Navigator Supplies (Log Poses)', shop: 'navigator', npc: 'nb_greta' },
        { role: 'bar', name: 'The Broken Oar' },
        { role: 'shipwright', name: 'Rakesh Drydock' },
        { role: 'doctor', name: 'Harbour Clinic' },
      ],
    }],
    landmarks: [
      { kind: 'bell', dx: 0.56, dy: 0.12, name: 'Harbour bell', spot: 'rakesh_bell' },
      { kind: 'crate', dx: 0.6, dy: 0.3 },
      { kind: 'barrel', dx: 0.64, dy: 0.26 },
      { kind: 'building', role: 'house', name: 'Harbour Warehouse No. 3', dx: 0.5, dy: -0.35, fw: 7, fd: 4, hgt: 3, wall: '#8d6e63', roof: '#4e342e', style: 'port', spot: 'rakesh_warehouse' },
      { kind: 'lighthouse', dx: 0.68, dy: -0.12, name: 'Rakesh Light', spot: 'rakesh_light' },
    ],
    spots: [{ id: 'rakesh_harbour', dx: 0.5, dy: 0.22 }],
    danger: 2,
    tagline: 'A port town that made a deal with the Donquixote Family — and broke it.',
    music: 'town',
    rumors: [
      '"Rakesh used to run guns for the Donquixote Family. Then the council signed with another crew. Doflamingo doesn\'t forgive."',
      '"Greta, the harbour pilot, knows every reef between here and Reverse Mountain. She sells Log Poses by the quay."',
      '"Reverse Mountain? South-east corner of the North Blue, where the Red Line meets the sea. Ride the canal UP."',
    ],
  },

  // --------------------------------------------------------------- Notice
  {
    id: 'notice', name: 'Notice', sea: 'north_blue', x: 640, y: 470, w: 140, h: 100,
    climate: 'spring', rough: 0.22,
    blobs: [[0, 0, 0.85, 0.8], [0.5, -0.35, 0.35, 0.35]],
    areas: [
      { name: 'Notice Gardens', tile: T.FLOWERS, dx: -0.5, dy: -0.3, rx: 0.2, ry: 0.15 },
      { tile: T.LAWN, dx: 0.5, dy: 0.4, rx: 0.2, ry: 0.15 },
    ],
    towns: [{
      id: 'notice_town', name: 'Notice', dx: -0.02, dy: 0.05, w: 62, h: 42, style: 'town', dockDir: 's', plaza: 'fountain',
      buildings: [
        { role: 'inn', name: 'Grand Hotel Notice' },
        { role: 'shop', name: 'Notice General Store' },
        { role: 'shop', name: 'Notice Boutique' },
        { role: 'bank', name: 'Bank of Notice' },
        { role: 'bar', name: "The Hyena's Den" },
        { role: 'dojo', name: 'Longarm Boxing Club', npc: 'nb_ulrich' },
        { role: 'cafe', name: 'Café Sora', npc: 'nb_emil' },
      ],
    }],
    landmarks: [
      { kind: 'platform', dx: 0.5, dy: 0.12, name: 'The Notice Cup boxing ring', spot: 'notice_ring' },
      { kind: 'bench', dx: -0.45, dy: 0.25 },
      { kind: 'sign', dx: 0.45, dy: -0.05, name: 'Old WANTED poster: "Bellamy the Hyena" — a Notice boy' },
    ],
    danger: 1,
    tagline: 'The richest — and most boring — town in the North Blue.',
    music: 'town',
    rumors: [
      '"Notice is the richest town in the North Blue. And the most boring, if you ask the young ones."',
      '"The Bellamy boys said this town was boring and sailed off to be pirates. Their mothers still won\'t talk about it."',
      '"The Longarm Quarter runs the boxing club. Two elbows on each arm — you do NOT want to trade punches with them."',
      '"Kids here read \'Sora, Warrior of the Sea\' every week. They swear Germa 66 is real."',
    ],
  },

  // --------------------------------------------------------- Kuen Village
  {
    id: 'kuen', name: 'Kuen Village', sea: 'north_blue', x: 780, y: 640, w: 120, h: 90,
    climate: 'autumn', ground: T.DIRT, rough: 0.26,
    blobs: [[0, 0, 0.85, 0.8], [-0.45, -0.35, 0.4, 0.35]],
    mountains: [{ name: 'Kuen Mountain', dx: -0.55, dy: -0.45, r: 0.2, h: 0.5 }],
    areas: [
      { name: 'Mountain woods', tile: T.FOREST, dx: -0.5, dy: -0.32, rx: 0.22, ry: 0.24 },
      { name: 'Parched fields', tile: T.DESERT, dx: 0.4, dy: 0.3, rx: 0.25, ry: 0.2 },
    ],
    trees: ['dead', 'deadbush'], treeDensity: 0.025,
    towns: [{
      id: 'kuen_village', name: 'Kuen Village', dx: 0.25, dy: 0.12, w: 36, h: 26, style: 'village', dockDir: 's', plaza: 'well',
      buildings: [
        { role: 'house', name: 'A lonely house', npc: 'nb_kuen_mother' },
        { role: 'shop', name: 'Kuen Trading Post', shop: 'nb_kuen_post' },
        { role: 'house', name: "Village Elder's House", npc: 'nb_grom' },
      ],
      houses: 5,
    }],
    landmarks: [
      { kind: 'campfire', dx: -0.2, dy: -0.06, name: 'Cold ashes by a shallow cave', spot: 'kuen_cave' },
      { kind: 'haystack', dx: 0.5, dy: 0.25 },
      { kind: 'well', dx: 0.55, dy: 0.45, name: 'A dry well' },
    ],
    danger: 1,
    tagline: 'A village where the rains stopped.',
    rumors: [
      '"The rains haven\'t come in two years. The wells are dust."',
      '"Nobody talks about the children who went up the mountain."',
    ],
  },

  // -------------------------------------------------------- Rubeck Island
  {
    id: 'rubeck', name: 'Rubeck Island', sea: 'north_blue', x: 1180, y: 480, w: 70, h: 55,
    climate: 'winter', rough: 0.25,
    towns: [{
      id: 'rubeck_camp', name: 'Marine Exchange Camp', dx: 0, dy: 0.1, w: 32, h: 24, style: 'marine', dockDir: 's', plaza: 'flagpole',
      buildings: [{ role: 'marine_base', name: 'Exchange Command Post', npc: 'nb_garrow', w: 9, d: 5, hgt: 3 }],
      houses: 1,
    }],
    landmarks: [
      { kind: 'tent', dx: -0.55, dy: -0.35 },
      { kind: 'tent', dx: -0.38, dy: -0.45 },
      { kind: 'campfire', dx: -0.45, dy: -0.28 },
    ],
    danger: 2,
    tagline: 'Where five billion berries were to change hands.',
    rumors: ['"Marines everywhere. Something big is going to be traded here, and nobody will say what."'],
  },

  // -------------------------------------------------------- Minion Island
  {
    id: 'minion_island', name: 'Minion Island', sea: 'north_blue', x: 1400, y: 440, w: 140, h: 110,
    climate: 'winter', rough: 0.26,
    blobs: [[0, 0, 0.85, 0.8], [0.45, -0.4, 0.35, 0.35], [-0.5, 0.4, 0.35, 0.3]],
    mountains: [{ name: 'Minion Hills', dx: -0.5, dy: -0.35, r: 0.2, h: 0.4 }],
    trees: ['snowpine', 'deadsnow'],
    towns: [{
      id: 'minion_ghost_town', name: 'Minion Ghost Town', dx: 0.15, dy: -0.02, w: 48, h: 32, style: 'ruins', dockDir: 's', plaza: 'fountain',
      buildings: [{ role: 'hall', name: "Barrels' Mansion", npc: 'nb_barrels', w: 10, d: 6, hgt: 4, wall: '#795548', roof: '#3e2723' }],
      houses: 14,
    }],
    landmarks: [
      { kind: 'chest', dx: 0.52, dy: 0.2, name: "The Barrels Pirates' treasure chests", spot: 'treasure_chests', key: 'nb_barrels_chest1', tier: 3, item: 'jewels' },
      { kind: 'chest', dx: 0.56, dy: 0.22, key: 'nb_barrels_chest2', tier: 3 },
      { kind: 'chest', dx: 0.48, dy: 0.23, key: 'nb_barrels_chest3', tier: 3, item: 'golden_statue' },
      { kind: 'ruins', dx: -0.22, dy: 0.38, name: 'A snowed-in hollow', spot: 'law_hideaway' },
      { kind: 'lamp', dx: 0.35, dy: 0.1 },
    ],
    spots: [{ id: 'corazon_last', dx: -0.12, dy: 0.5 }, { id: 'mansion_yard', dx: 0.2, dy: 0.25 }, { id: 'dory_post', dx: -0.15, dy: -0.45 }],
    danger: 3,
    tagline: 'Snow, hills and a ghost town — and a pirate sitting on a very expensive fruit.',
    music: 'night',
    rumors: [
      '"The ghost town on the hill? Pirates live there now. Barrels\'s crew."',
      '"Winter never leaves Minion Island. Neither do the people who get stuck here."',
    ],
  },

  // ------------------------------------------------------- Swallow Island
  // Shaped like a swallow in flight (facing east), with a tree-covered peak
  // in the shape of a swallow at its heart. Heavy winters. Pleasure Town is
  // its town (One Piece novel Law).
  {
    id: 'swallow_island', name: 'Swallow Island', sea: 'north_blue', x: 1300, y: 630, w: 150, h: 110,
    climate: 'winter', rough: 0.2,
    blobs: [
      [0.05, 0, 0.45, 0.36], [0.52, -0.08, 0.22, 0.24],
      [-0.1, -0.52, 0.32, 0.36], [-0.1, 0.52, 0.32, 0.36],
      [-0.6, -0.18, 0.28, 0.15], [-0.6, 0.18, 0.28, 0.15],
    ],
    mountains: [{ name: 'Swallow Peak', dx: -0.15, dy: -0.58, r: 0.16, h: 0.5 }],
    areas: [
      { name: 'Swallow Peak woods', tile: T.FOREST, dx: -0.12, dy: -0.45, rx: 0.28, ry: 0.28 },
      { tile: T.FOREST, dx: -0.12, dy: 0.62, rx: 0.2, ry: 0.2 },
    ],
    trees: ['snowpine', 'snowpine', 'deadsnow'],
    towns: [{
      id: 'swallow_town', name: 'Pleasure Town', dx: 0.12, dy: 0.02, w: 46, h: 30, style: 'snow', dockDir: 'e', plaza: 'well',
      buildings: [
        { role: 'inn', name: 'Pleasure Town Inn' },
        { role: 'shop', name: 'Pleasure Town Market' },
        { role: 'church', name: 'Temple of the Sea God' },
        { role: 'hall', name: 'Pleasure Town Police Station', npc: 'nb_rudd' },
        { role: 'bar', name: 'The Frozen Anchor' },
      ],
    }],
    landmarks: [
      { kind: 'building', role: 'house', name: "Wolf's House", npc: 'nb_wolf', dx: -0.1, dy: 0.42, fw: 6, fd: 4, hgt: 2, wall: '#a1887f', roof: '#5d4037', style: 'village', spot: 'wolf_house' },
      { kind: 'windmill', dx: -0.24, dy: 0.5 },
      { kind: 'arch', dx: -0.3, dy: 0.66, name: "A hatch in the snow (Wolf's secret laboratory)" },
      { kind: 'chest', dx: -0.68, dy: -0.18, name: "Captain Ladoga's last cache", key: 'nb_ladoga_cache', tier: 3, item: 'gold_coins' },
      { kind: 'bench', dx: 0.1, dy: -0.3 },
    ],
    spots: [{ id: 'bepo_field', dx: -0.28, dy: -0.12 }, { id: 'sea_god_temple', dx: 0.16, dy: 0.1 }],
    danger: 2,
    tagline: 'An island shaped like a swallow — and a legend of a swallow that flies under the sea.',
    music: 'town',
    rumors: [
      '"Look at the peak — it\'s shaped like a swallow in flight! The whole island is, if you see it on a chart."',
      '"At night something roars under the waves off the coast. The flying undersea swallow, the old folks call it."',
      '"Old Wolf the inventor lives alone on the south wing. His inventions explode. A lot."',
      '"Captain Ladoga died of a sickness sixty years ago and buried his treasure somewhere on this island. People still dig."',
    ],
  },
];
