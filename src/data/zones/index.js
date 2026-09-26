// Zones: places that are not on the surface chart. Each zone is a small
// separate world (non-wrapping) with its own islands, entered and left
// through special events:
//   Skypiea        – ride the Knock Up Stream off Jaya; the White-White Sea is
//                    sailable cloud. Leave by falling from Cloud End.
//   Fish-Man Island– dive with a coated ship at the foot of the Red Line near
//                    Sabaody; surface on the New World side.
//   Impel Down     – the Great Prison under the Calm Belt: where the Marines
//                    send notorious pirates they capture. Escape through the gate.
// Island definitions use the same format as surface islands (see
// docs/CONTENT_GUIDE.md); coordinates are zone tiles.
import { T } from '../../world/tiles.js';

export const ZONES = {
  skypiea: {
    id: 'skypiea', name: 'Skypiea', kind: 'sky', w: 640, h: 480, fill: T.CLOUD_SEA, altitude: '10,000 m',
    arrive: { x: 320, y: 450, heading: -Math.PI / 2 },
    // falling off Cloud End drops you back into the sea near Jaya
    exits: [{ id: 'cloud_end', x: 18, y: 240, r: 14, to: 'surface', surface: { island: 'jaya', spot: 'knock_up_stream' }, label: 'Cloud End — the long fall to the Blue Sea' }],
    islands: [
      {
        id: 'heavens_gate', name: "Heaven's Gate", sea: 'sky', x: 320, y: 405, w: 40, h: 22, climate: 'sky', rough: 0.15,
        landmarks: [{ kind: 'arch', dx: 0, dy: -0.2, name: "Heaven's Gate" }, { kind: 'sign', dx: 0.4, dy: 0.3, spot: 'gate_booth' }],
        docks: [{ dx: 0, dy: 0.6, dir: 's', len: 4, name: "Heaven's Gate" }],
      },
      {
        id: 'angel_island', name: 'Angel Island', sea: 'sky', x: 190, y: 285, w: 160, h: 110, climate: 'sky', rough: 0.25,
        trees: ['cloudtree', 'palm'],
        towns: [{
          id: 'lovely_street', name: 'Lovely Street', dx: 0.05, dy: 0.05, w: 56, h: 38, style: 'sky', dockDir: 's', plaza: 'fountain',
          buildings: [
            { role: 'house', name: "Pagaya's House" },
            { role: 'shop', name: 'Dial Shop', shop: 'skypiea' },
            { role: 'inn', name: 'Cloud Inn' },
            { role: 'cafe', name: 'Angel Beach Café' },
            { role: 'hall', name: 'White Berets Post' },
          ],
        }],
        landmarks: [{ kind: 'sign', dx: -0.55, dy: 0.55, spot: 'angel_beach', name: 'Angel Beach' }],
      },
      {
        id: 'upper_yard', name: 'Upper Yard', sea: 'sky', x: 470, y: 225, w: 190, h: 170, climate: 'jungle', rough: 0.22,
        mountains: [{ name: 'Giant Jack', dx: 0, dy: -0.12, r: 0.12, h: 1.1 }],
        areas: [
          { name: 'Ruins of Shandora', tile: T.STONE, dx: 0.28, dy: 0.28, rx: 0.2, ry: 0.18 },
          { name: 'Forest of Ordeals', tile: T.JUNGLE, dx: -0.3, dy: -0.1, rx: 0.3, ry: 0.35 },
        ],
        landmarks: [
          { kind: 'ruins', dx: 0.28, dy: 0.28, name: 'Shandora' },
          { kind: 'ruins', dx: 0.36, dy: 0.2 },
          { kind: 'bell', dx: 0.02, dy: -0.36, spot: 'golden_bell', name: 'The Golden Bell of Shandora' },
          { kind: 'poneglyph', dx: 0.3, dy: 0.34, poneglyph: 'shandora', name: 'Poneglyph of Shandora' },
          { kind: 'totem', dx: -0.3, dy: 0.32, spot: 'altar', name: 'Sacrificial Altar' },
        ],
        spots: [
          { id: 'ordeal_balls', dx: -0.6, dy: 0.1 }, { id: 'ordeal_swamp', dx: 0.55, dy: -0.3 },
          { id: 'ordeal_iron', dx: -0.2, dy: -0.55 }, { id: 'ordeal_string', dx: 0.6, dy: 0.45 },
          { id: 'god_shrine', dx: 0.05, dy: 0.12 },
        ],
        docks: [{ dx: -0.8, dy: 0.2, dir: 'w', len: 5, name: 'Upper Yard' }],
      },
      {
        id: 'shandia_village', name: 'Hidden Shandian Village', sea: 'sky', x: 95, y: 110, w: 90, h: 64, climate: 'sky', rough: 0.3,
        towns: [{ id: 'shandia_camp', name: 'Shandian Village', dx: 0, dy: 0, w: 34, h: 24, style: 'tribal', dockDir: 's', plaza: 'well',
          buildings: [{ role: 'hall', name: "Chief's Hut" }, { role: 'house', name: "Wyper's Hut" }] }],
      },
      {
        id: 'weatheria', name: 'Weatheria', sea: 'sky', x: 565, y: 60, w: 70, h: 48, climate: 'sky', rough: 0.2,
        towns: [{ id: 'weatheria_town', name: 'Weatheria', dx: 0, dy: 0.05, w: 34, h: 24, style: 'sky', dockDir: 'w', plaza: 'fountain',
          buildings: [{ role: 'library', name: 'Weatheria Library' }, { role: 'trainer', name: 'Weather Laboratory', trainer: 'weatheria_scholar' }] }],
      },
    ],
  },

  fishman_island: {
    id: 'fishman_island', name: 'Fish-Man Island', kind: 'undersea', w: 480, h: 380, fill: T.SEA, altitude: '10,000 m below',
    arrive: { x: 420, y: 200, heading: Math.PI },
    exits: [
      { id: 'new_world', x: 20, y: 60, r: 16, to: 'surface', surface: { x: 118, y: 990 }, label: 'Rise to the New World' },
      { id: 'paradise', x: 462, y: 330, r: 16, to: 'surface', surface: { x: 3985, y: 1070 }, label: 'Rise back to Sabaody' },
    ],
    islands: [
      {
        id: 'fishman_island', name: 'Fish-Man Island', sea: 'undersea', x: 245, y: 195, w: 230, h: 190, climate: 'undersea', rough: 0.2,
        trees: ['coral', 'kelp'],
        towns: [
          { id: 'ryugu_kingdom', name: 'Ryugu Kingdom', dx: 0.0, dy: -0.35, w: 56, h: 34, style: 'fishman', walls: true, dockDir: 'n', plaza: 'fountain',
            buildings: [{ role: 'palace', name: 'Ryugu Palace', w: 14, d: 7, hgt: 5 }, { role: 'hall', name: 'Hard Shell Tower' }] },
          { id: 'mermaid_cove', name: 'Mermaid Cove', dx: 0.5, dy: 0.2, w: 40, h: 28, style: 'fishman', dockDir: 'e', plaza: 'fountain',
            buildings: [{ role: 'cafe', name: 'Mermaid Café' }, { role: 'shop', name: 'Coral Hill Market', shop: 'fishman' }, { role: 'inn', name: 'Bubble Inn' }] },
          { id: 'fishman_district', name: 'Fish-Man District', dx: -0.45, dy: 0.35, w: 40, h: 28, style: 'fishman', dockDir: 'sw', plaza: 'well',
            buildings: [{ role: 'bar', name: 'Noah Tavern' }, { role: 'dojo', name: 'Fish-Man Karate Dojo', trainer: 'jinbe' }] },
        ],
        spots: [{ id: 'gyoncorde_plaza', dx: 0.0, dy: 0.05 }, { id: 'coral_hill', dx: 0.35, dy: 0.45 }],
        landmarks: [{ kind: 'fountain', dx: 0.0, dy: 0.1, name: 'Gyoncorde Plaza' }],
      },
      {
        id: 'sea_forest', name: 'Forest of the Sea', sea: 'undersea', x: 75, y: 320, w: 90, h: 60, climate: 'undersea', rough: 0.3, noDock: false,
        trees: ['kelp', 'coral'],
        landmarks: [
          { kind: 'poneglyph', dx: 0, dy: -0.1, poneglyph: 'apology', name: "Joy Boy's Apology" },
          { kind: 'shipwreck', dx: 0.4, dy: 0.2, name: 'The Ark Noah' },
          { kind: 'grave', dx: -0.3, dy: 0.2, name: "Queen Otohime's grave" },
        ],
      },
    ],
  },

  impel_down: {
    id: 'impel_down', name: 'Impel Down', kind: 'prison', w: 420, h: 520, fill: T.ABYSS, altitude: 'beneath the Calm Belt',
    arrive: { island: 'id_level1', spot: 'cell' },
    exits: [{ id: 'main_gate', island: 'id_level1', spot: 'main_gate', r: 3, to: 'surface', surface: { island: 'impel_down', dock: true }, label: 'The Main Gate' }],
    islands: [
      { id: 'id_level1', name: 'Level 1 — Crimson Hell', sea: 'zone', x: 110, y: 70, w: 150, h: 80, climate: 'autumn', ground: T.DIRT, rough: 0.12, noDock: true,
        areas: [{ name: 'Blade forest', tile: T.FOREST, dx: 0.1, dy: 0, rx: 0.5, ry: 0.5 }],
        spots: [{ id: 'cell', dx: -0.6, dy: 0.2 }, { id: 'main_gate', dx: -0.85, dy: -0.4 }, { id: 'stairs_down', dx: 0.8, dy: 0.4 }] },
      { id: 'id_level2', name: 'Level 2 — Wild Beast Hell', sea: 'zone', x: 300, y: 145, w: 150, h: 80, climate: 'jungle', rough: 0.12, noDock: true,
        spots: [{ id: 'stairs_up', dx: -0.8, dy: -0.4 }, { id: 'stairs_down', dx: 0.8, dy: 0.4 }] },
      { id: 'id_level3', name: 'Level 3 — Starvation Hell', sea: 'zone', x: 110, y: 220, w: 150, h: 80, climate: 'desert', rough: 0.12, noDock: true,
        spots: [{ id: 'stairs_up', dx: 0.8, dy: -0.4 }, { id: 'stairs_down', dx: -0.8, dy: 0.4 }] },
      { id: 'id_level4', name: 'Level 4 — Burning Hell', sea: 'zone', x: 300, y: 295, w: 150, h: 80, climate: 'volcanic', rough: 0.12, noDock: true,
        lakes: [{ dx: 0, dy: 0, rx: 0.2, ry: 0.25, tile: T.LAVA }],
        spots: [{ id: 'stairs_up', dx: -0.8, dy: -0.4 }, { id: 'stairs_down', dx: 0.8, dy: 0.4 }, { id: 'warden_office', dx: 0.4, dy: -0.4 }] },
      { id: 'id_level5', name: 'Level 5 — Freezing Hell', sea: 'zone', x: 110, y: 370, w: 150, h: 80, climate: 'winter', rough: 0.12, noDock: true,
        spots: [{ id: 'stairs_up', dx: 0.8, dy: -0.4 }, { id: 'stairs_down', dx: -0.8, dy: 0.4 }, { id: 'secret_passage', dx: 0.6, dy: 0.45 }] },
      { id: 'id_newkama', name: 'Level 5.5 — Newkama Land', sea: 'zone', x: 320, y: 440, w: 100, h: 60, climate: 'spring', rough: 0.12, noDock: true,
        towns: [{ id: 'newkama_land', name: 'Newkama Land', dx: 0, dy: 0, w: 40, h: 26, style: 'noble', plaza: 'fountain', buildings: [{ role: 'hall', name: "Ivankov's Party Hall", trainer: 'ivankov' }, { role: 'bar', name: 'Newkama Bar' }] }],
        spots: [{ id: 'stairs_up', dx: -0.8, dy: -0.5 }] },
      { id: 'id_level6', name: 'Level 6 — Eternal Hell', sea: 'zone', x: 110, y: 475, w: 150, h: 60, climate: 'rocky', rough: 0.1, noDock: true,
        spots: [{ id: 'stairs_up', dx: -0.8, dy: -0.4 }, { id: 'deepest_cell', dx: 0.6, dy: 0.2 }] },
    ],
    // stairways between levels (portal objects are placed at these spots)
    links: [
      ['id_level1', 'stairs_down', 'id_level2', 'stairs_up'],
      ['id_level2', 'stairs_down', 'id_level3', 'stairs_up'],
      ['id_level3', 'stairs_down', 'id_level4', 'stairs_up'],
      ['id_level4', 'stairs_down', 'id_level5', 'stairs_up'],
      ['id_level5', 'secret_passage', 'id_newkama', 'stairs_up'],
      ['id_level5', 'stairs_down', 'id_level6', 'stairs_up'],
    ],
  },
};

export const ZONE_ISLAND_IDS = new Set(Object.values(ZONES).flatMap((z) => z.islands.map((i) => i.id)));
