// The wider Grand Line: the islands between the old rows. The Grand Line is
// twice as wide as it was (GL_HALF, constants.js), and its seas are filled out
// with the islands of the anime's own arcs and the films (Warship Island,
// Clockwork Island, Crown Island, Omatsuri Island, Mecha Island, Delta
// Island, Little East Blue, the Silver Mine, Gran Tesoro, Firstan…), the
// canon places the story only mentions (Banaro Island, Prodence, Lulusia, God
// Valley, the islands of Totto Land), and islands of the game's own.
//
// Paradise runs east from the Twin Cape (x 2268) to Sabaody (x 3880); the New
// World runs east from the foot of Mary Geoise (x 150) to Laugh Tale (x 1795);
// both between rows 624 and 1424 (chart units, like every island file). The
// rows near the equator are kept clear of Reverse Mountain's exit torrent.
import { T } from '../../world/tiles.js';

/**
 * An island from a short description: one town (`town`: its name, style,
 * dock side and buildings as roles or [role, name] pairs), landmarks
 * (`marks`: [kind, dx, dy, name?]), mountains, lakes and areas as usual.
 */
function isle(o) {
  const { town, marks, ...d } = o;
  const def = { rough: 0.22, logTime: 1, ...d };
  if (town) {
    def.towns = [{
      id: `${o.id}_town`, name: town.name, dx: town.dx ?? -0.1, dy: town.dy ?? 0.1, w: town.w || 34, h: town.h || 22,
      style: town.style || 'town', dockDir: town.dock || 's', plaza: town.plaza ?? 'well',
      buildings: town.buildings.map((b) => (Array.isArray(b) ? { role: b[0], name: b[1], ...(b[2] || {}) } : { role: b })),
      houses: town.houses ?? 3,
    }];
  }
  if (marks) def.landmarks = marks.map(([kind, dx, dy, name, extra]) => ({ kind, dx, dy, ...(name ? { name } : {}), ...(extra || {}) }));
  return def;
}

export const PARADISE_3 = [
  // ------------------------------------------------------------ Warship Island (anime)
  isle({
    id: 'warship_island', name: 'Warship Island', sea: 'paradise', x: 2440, y: 1380, w: 84, h: 64, climate: 'tropical',
    mountains: [{ name: 'Dragon\'s Nest', dx: 0.3, dy: -0.3, r: 0.25, h: 0.7 }],
    town: { name: 'Warship Village', style: 'village', dock: 'w', buildings: [['inn', 'The Sennen Inn'], ['doctor', 'Grandpa Boo\'s'], 'shop'] },
    marks: [['ruins', 0.35, -0.35, 'The Lost Island shrine'], ['bones', 0.5, -0.1], ['sign', -0.4, 0.4, 'Warship Island — Marine supply post']],
    logNext: ['clockwork_island', 'hannabal'], danger: 3, music: 'town',
    tagline: 'A girl who hears animals, a thousand-year dragon, and the Marines who want its secret. (Anime tale.)',
  }),
  // ------------------------------------------------------------ Clockwork Island (film)
  isle({
    id: 'clockwork_island', name: 'Clockwork Island', sea: 'paradise', x: 2600, y: 1400, w: 70, h: 70, climate: 'rocky',
    mountains: [{ name: 'The Clock Tower Crag', dx: 0, dy: -0.2, r: 0.3, h: 1, cliff: 200 }],
    town: { name: 'Gearwork Harbour', style: 'city', dock: 's', plaza: 'statue', buildings: [['hall', 'Trump Siblings\' Clock Fortress'], ['weapons', 'Cog & Spring Armoury'], 'inn', 'bar'] },
    marks: [['tower', 0, -0.35, 'The Great Clock'], ['wheel', 0.3, 0.1], ['wheel', -0.3, 0.15]],
    logNext: ['hannabal', 'crown_island'], danger: 4, music: 'town',
    tagline: 'An island wound like a clock, with a fortress on top that strikes the hour. (Film tale.)',
  }),
  // ------------------------------------------------------------ Hannabal (film: the Dead End race)
  isle({
    id: 'hannabal', name: 'Hannabal Harbour', sea: 'paradise', x: 2580, y: 1120, w: 92, h: 60, climate: 'temperate',
    town: { name: 'Hannabal', style: 'port', dock: 'e', w: 44, h: 26, plaza: 'flagpole', buildings: [['bar', 'The Dead End Saloon'], ['bounty', 'Race Office'], ['shipwright', 'Hannabal Slipway'], 'inn', 'shop', ['market', 'Gambler\'s Row']] },
    marks: [['flagpole', 0.4, 0.3, 'The Dead End starting line'], ['boat', 0.5, 0.45], ['boat', 0.55, 0.2]],
    logNext: ['kettle_island', 'drum_island'], danger: 4, music: 'town',
    tagline: 'A smugglers\' port where the deadliest boat race on the Grand Line begins. (Film tale.)',
  }),
  // ------------------------------------------------------------ Crown Island (film)
  isle({
    id: 'crown_island', name: 'Crown Island', sea: 'paradise', x: 2800, y: 1385, w: 110, h: 80, climate: 'jungle',
    mountains: [{ name: 'Crown Peak', dx: 0.1, dy: -0.25, r: 0.25, h: 0.9 }],
    town: { name: 'Animal Kingdom', style: 'tribal', dock: 'w', buildings: [['palace', 'The Antler Throne'], ['doctor', 'Herb Hut'], 'shop'] },
    marks: [['statue', 0.1, -0.35, 'The Antler Crown'], ['totem', -0.3, -0.1], ['totem', 0.4, 0.2]],
    logNext: ['omatsuri_island', 'alabasta'], danger: 4, music: 'town',
    tagline: 'An island of strange animals who need a king — and crowned a reindeer once. (Film tale.)',
  }),
  // ------------------------------------------------------------ Omatsuri Island (film)
  isle({
    id: 'omatsuri_island', name: 'Omatsuri Island', sea: 'paradise', x: 3020, y: 1385, w: 100, h: 72, climate: 'tropical',
    town: { name: 'Festival Resort', style: 'noble', dock: 'n', plaza: 'fountain', buildings: [['hall', 'Baron Omatsuri\'s Trials'], ['restaurant', 'Goldfish Grill'], 'inn', 'bar', ['shop', 'Prize Stall']] },
    marks: [['statue', 0.35, -0.2, 'The Lily Carnation'], ['grave', -0.4, -0.3], ['grave', -0.45, -0.2], ['lantern', 0.1, 0.4]],
    logNext: ['monsoon_key', 'asuka_island'], danger: 5, music: 'night',
    tagline: 'A holiday island of games and prizes. The baron who runs it has lost crews before. (Film tale.)',
  }),
  // ------------------------------------------------------------ Asuka Island (film)
  isle({
    id: 'asuka_island', name: 'Asuka Island', sea: 'paradise', x: 3200, y: 1140, w: 90, h: 70, climate: 'sakura',
    mountains: [{ name: 'Seven Star Hill', dx: 0.3, dy: -0.2, r: 0.22, h: 0.7 }],
    town: { name: 'Asuka Village', style: 'wano', dock: 's', buildings: [['dojo', 'Hall of the Seven Stars'], ['inn', 'Moonlit Inn'], 'shop'] },
    marks: [['torii', 0.3, -0.35, 'Shrine of the Sacred Sword'], ['statue', 0.25, -0.15], ['lantern', -0.2, 0.3]],
    logNext: ['water_7', 'whistle_rock'], danger: 5, music: 'town',
    tagline: 'A quiet island of cherry trees, and the cursed sword Shichiseiken sealed in its shrine. (Film tale.)',
  }),
  // ------------------------------------------------------------ Banaro Island (canon)
  isle({
    id: 'banaro_island', name: 'Banaro Island', sea: 'paradise', x: 3150, y: 860, w: 88, h: 60, climate: 'desert',
    areas: [{ name: 'The scorched quarter', tile: T.ASH, dx: 0.1, dy: 0, rx: 0.28, ry: 0.22 }],
    town: { name: 'Banaro', style: 'desert', dock: 'w', buildings: [['bar', 'The Last Bar'], 'inn', 'shop'] },
    marks: [['ruins', 0.15, 0, 'Where fire met darkness'], ['ruins', 0.3, 0.1], ['ruins', -0.05, -0.15], ['skull', 0.4, -0.3]],
    logNext: ['water_7', 'tumbleweed_island'], danger: 6, music: 'night',
    tagline: 'Half a town, burnt black. Fire Fist Ace fought Blackbeard here — and lost.',
  }),
  // ------------------------------------------------------------ Mecha Island (film)
  isle({
    id: 'mecha_island', name: 'Mecha Island', sea: 'paradise', x: 3460, y: 840, w: 96, h: 76, climate: 'rocky',
    mountains: [{ name: 'Karakuri Castle crag', dx: 0, dy: -0.15, r: 0.3, h: 0.95, cliff: 180 }],
    town: { name: 'Karakuri Town', style: 'future', dock: 's', buildings: [['palace', 'Karakuri Castle'], ['weapons', 'Ratchet\'s Workshop'], 'inn', 'shop'] },
    marks: [['tower', 0, -0.3, 'The Golden Crown tower'], ['wheel', -0.3, 0.1], ['crystal', 0.35, -0.1]],
    logNext: ['enies_lobby', 'mistletoe_island'], danger: 5, music: 'town',
    tagline: 'A castle full of clockwork soldiers, and a lord hunting the treasure of the Golden Crown. (Film tale.)',
  }),
  // ------------------------------------------------------------ Delta Island (film)
  isle({
    id: 'delta_island', name: 'Delta Island', sea: 'paradise', x: 3580, y: 1160, w: 120, h: 80, climate: 'tropical',
    town: { name: 'Pirates Expo', style: 'city', dock: 'w', w: 46, h: 28, plaza: 'platform', buildings: [['hall', 'Festa\'s Expo Hall'], ['market', 'The Grand Fair'], ['bar', 'Expo Tavern'], ['restaurant', 'Pirate Food Court'], 'inn', ['weapons', 'Treasure Hunters\' Supply']] },
    marks: [['flagpole', 0.3, -0.3, 'The Expo flag'], ['stall', 0.1, 0.3], ['stall', -0.2, 0.35], ['tent', 0.4, 0.1]],
    logNext: ['sabaody', 'hammerhead_island'], danger: 6, music: 'town',
    tagline: 'The Pirates Festival: every crew on the sea, one treasure hunt, and a Marine trap waiting. (Film tale.)',
  }),

  // ===================================================== the game's own (Paradise)
  isle({
    id: 'saltpetre_isle', name: 'Saltpetre Isle', sea: 'paradise', x: 2420, y: 660, w: 66, h: 52, climate: 'rocky',
    town: { name: 'Bangtown', style: 'town', dock: 's', buildings: [['shop', 'Firework Works'], ['weapons', 'Powder Merchant'], 'inn'] },
    marks: [['cannon', 0.3, -0.2], ['cannon', 0.35, -0.05], ['barrel', 0.2, 0.2]],
    logNext: ['kyuka_island', 'bellwether_island'], danger: 3, music: 'town',
    tagline: 'Fireworks makers. Every night something goes up; most nights it\'s on purpose.',
  }),
  isle({
    id: 'bellwether_island', name: 'Bellwether Island', sea: 'paradise', x: 2760, y: 650, w: 80, h: 60, climate: 'autumn',
    areas: [{ tile: T.FARM, dx: -0.4, dy: -0.2, rx: 0.2, ry: 0.15 }],
    town: { name: 'Bellwether', style: 'village', dock: 's', buildings: [['inn', 'The Woolly Ram'], 'shop', ['restaurant', 'Mutton Kitchen']] },
    marks: [['windmill', -0.35, 0.25], ['haystack', -0.2, -0.35], ['fence', 0.3, 0.3]],
    logNext: ['little_garden', 'lanternfish_cove'], danger: 3, music: 'town',
    tagline: 'Shepherds and bells. The sheep are the size of houses and the wolves are worse.',
  }),
  isle({
    id: 'kettle_island', name: 'Kettle Island', sea: 'paradise', x: 2760, y: 1060, w: 76, h: 64, climate: 'volcanic',
    mountains: [{ name: 'The Kettle', dx: 0.1, dy: -0.1, r: 0.3, h: 0.9 }],
    lakes: [{ name: 'Boiling spring', dx: -0.35, dy: 0.25, rx: 0.08, ry: 0.07, tile: T.POND }],
    town: { name: 'Steamworks', style: 'town', dock: 'w', buildings: [['weapons', 'Kettle Forge'], ['inn', 'Hot Springs Lodge'], 'shop'] },
    marks: [['crystal', 0.2, -0.3], ['campfire', -0.3, 0.1]],
    logNext: ['mirage_atoll', 'nanimonai_island'], danger: 4, music: 'town',
    tagline: 'Smiths who forge with the volcano\'s own heat, and hot springs that will boil an egg.',
  }),
  isle({
    id: 'gourd_island', name: 'Gourd Island', sea: 'paradise', x: 2590, y: 1290, w: 64, h: 54, climate: 'tropical',
    areas: [{ tile: T.FARM, dx: 0.3, dy: 0.2, rx: 0.2, ry: 0.15 }],
    town: { name: 'Calabash', style: 'village', dock: 'w', buildings: [['bar', 'The Hollow Gourd'], 'shop', 'inn'] },
    marks: [['barrel', 0.1, 0.3], ['barrel', 0.15, 0.35]],
    logNext: ['drum_island', 'crown_island'], danger: 3, music: 'town',
    tagline: 'Gourds for bottles, gourds for boats, gourds for houses. They brew a strong one.',
  }),
  isle({
    id: 'mirage_atoll', name: 'Mirage Atoll', sea: 'paradise', x: 2900, y: 1080, w: 90, h: 70, climate: 'desert',
    lakes: [{ name: 'The lagoon', dx: 0, dy: 0, rx: 0.2, ry: 0.18 }],
    town: { name: 'Shimmer', style: 'desert', dock: 's', dx: 0.3, dy: 0.25, buildings: [['inn', 'Oasis House'], 'shop', ['bar', 'The Mirage']] },
    marks: [['ruins', -0.35, -0.2, 'The town that isn\'t there'], ['pillar', -0.4, 0], ['pillar', -0.3, -0.35]],
    logNext: ['alabasta', 'driftwood_republic'], danger: 4, music: 'sea',
    tagline: 'A ring of sand around a lagoon. Sailors see a city on the far shore. There is no city.',
  }),
  isle({
    id: 'lanternfish_cove', name: 'Lanternfish Cove', sea: 'paradise', x: 3010, y: 650, w: 70, h: 54, climate: 'marsh',
    town: { name: 'Glimmerdock', style: 'port', dock: 'e', buildings: [['restaurant', 'Lantern Grill'], ['inn', 'Deep Glow Inn'], 'shop'] },
    marks: [['lantern', 0.3, 0.2], ['lantern', 0.35, 0.3], ['lantern', 0.25, 0.4], ['boat', 0.5, 0.3]],
    logNext: ['jaya', 'banaro_island'], danger: 4, music: 'night',
    tagline: 'Dark half the year. The fish in the bay give the only light, and the fishermen sell it in jars.',
  }),
  isle({
    id: 'driftwood_republic', name: 'Driftwood Republic', sea: 'paradise', x: 3120, y: 1010, w: 84, h: 66, climate: 'temperate',
    town: { name: 'Flotsam', style: 'port', dock: 'e', w: 40, h: 26, plaza: 'flagpole', buildings: [['hall', 'Parliament of Wrecks'], ['shipwright', 'Salvage Yard'], ['bar', 'The Bilge'], 'inn', 'shop'] },
    marks: [['shipwreck', -0.35, 0.3], ['shipwreck', 0.4, -0.3], ['anchor', 0.1, 0.4]],
    logNext: ['water_7', 'asuka_island'], danger: 4, music: 'town',
    tagline: 'A republic built out of every ship the Grand Line ever wrecked. Everyone gets a vote; nobody agrees.',
  }),
  isle({
    id: 'monsoon_key', name: 'Monsoon Key', sea: 'paradise', x: 3240, y: 1400, w: 70, h: 56, climate: 'jungle',
    town: { name: 'Raintown', style: 'village', dock: 'n', buildings: [['inn', 'The Dry Bed'], 'shop', ['doctor', 'Fever Clinic']] },
    marks: [['lighthouse', 0.4, -0.3, 'Storm Light'], ['boat', -0.4, -0.35]],
    logNext: ['san_faldo', 'boin'], danger: 5, music: 'sea',
    tagline: 'It rains three hundred days a year here, and on the other sixty-five it pours.',
  }),
  isle({
    id: 'whistle_rock', name: 'Whistle Rock', sea: 'paradise', x: 3410, y: 1120, w: 60, h: 56, climate: 'rocky',
    mountains: [{ name: 'The Whistle', dx: 0, dy: 0, r: 0.35, h: 1, cliff: 150 }],
    town: { name: 'Hollow Holm', style: 'village', dock: 's', dx: 0, dy: 0.35, buildings: [['inn', 'The Wind\'s Rest'], 'shop'] },
    marks: [['pillar', 0.3, -0.2], ['pillar', -0.3, -0.25], ['bell', 0, -0.4, 'The Wind Bell']],
    logNext: ['enies_lobby', 'karakuri'], danger: 5, music: 'sea',
    tagline: 'A rock full of holes. When the wind blows it sings — loud enough to steer ships by.',
  }),
  isle({
    id: 'pearl_shoals', name: 'Pearl Shoals', sea: 'paradise', x: 3470, y: 1395, w: 76, h: 50, climate: 'tropical', archipelago: true,
    town: { name: 'Nacre', style: 'port', dock: 'n', buildings: [['market', 'Pearl Exchange'], ['bank', 'Shell Bank'], 'inn'] },
    marks: [['boat', 0.3, -0.3], ['boat', -0.3, -0.35], ['chest', 0.1, 0.2]],
    logNext: ['spa_island', 'karakuri'], danger: 5, music: 'town',
    tagline: 'Divers who hold their breath for ten minutes, and pearls that pay for whole ships.',
  }),
  isle({
    id: 'tumbleweed_island', name: 'Tumbleweed Island', sea: 'paradise', x: 3320, y: 830, w: 70, h: 56, climate: 'desert',
    town: { name: 'Dustwater', style: 'desert', dock: 'e', buildings: [['bar', 'The Dry Gulch'], ['bounty', 'Sheriff\'s Office'], 'inn', 'shop'] },
    marks: [['grave', -0.35, -0.3], ['grave', -0.3, -0.25], ['sign', 0.3, 0.3, 'WANTED: anyone']],
    logNext: ['water_7', 'mecha_island'], danger: 5, music: 'town',
    tagline: 'One street, one saloon, one sheriff, and more bounty hunters than pirates.',
  }),
  isle({
    id: 'mistletoe_island', name: 'Mistletoe Island', sea: 'paradise', x: 3720, y: 860, w: 76, h: 60, climate: 'winter',
    town: { name: 'Hollyhearth', style: 'snow', dock: 's', buildings: [['inn', 'The Warm Hearth'], ['restaurant', 'Mulled Kitchen'], 'shop'] },
    marks: [['lantern', 0.2, 0.2], ['statue', -0.1, -0.3, 'The Snow Saint']],
    logNext: ['marineford', 'thriller_bark'], danger: 5, music: 'town',
    tagline: 'A winter island where it\'s always the night before a holiday, and everyone is kind. Suspiciously kind.',
  }),
  isle({
    id: 'hammerhead_island', name: 'Hammerhead Island', sea: 'paradise', x: 3770, y: 1180, w: 80, h: 56, climate: 'rocky',
    town: { name: 'Breaker\'s Yard', style: 'port', dock: 'w', buildings: [['shipwright', 'Hammerhead Breakers'], ['bar', 'The Rivet'], 'shop'] },
    marks: [['shipwreck', 0.3, -0.2], ['anchor', 0.35, 0.2], ['crate', -0.2, 0.3]],
    logNext: ['sabaody'], danger: 6, music: 'town',
    tagline: 'Where ships that won\'t reach the New World are broken up and sold by the plank.',
  }),
  isle({
    id: 'sundial_island', name: 'Sundial Island', sea: 'paradise', x: 3820, y: 1400, w: 64, h: 56, climate: 'spring',
    town: { name: 'Noonshade', style: 'town', dock: 'n', buildings: [['library', 'Observatory of Hours'], 'inn', 'shop'] },
    marks: [['pillar', 0, -0.2, 'The Great Gnomon'], ['bench', 0.2, 0.1]],
    logNext: ['sabaody'], danger: 5, music: 'town',
    tagline: 'A whole island laid out as a sundial. They keep the Grand Line\'s time — badly.',
  }),
];

export const NEW_WORLD_3 = [
  // ------------------------------------------------------------ Prodence (canon)
  isle({
    id: 'prodence', name: 'Prodence Kingdom', sea: 'new_world', x: 420, y: 880, w: 120, h: 90, climate: 'temperate',
    mountains: [{ dx: 0.4, dy: -0.3, r: 0.2, h: 0.6 }],
    town: { name: 'Prodence', style: 'noble', dock: 'w', w: 44, h: 28, plaza: 'statue', buildings: [['palace', 'King Elizabello\'s Palace'], ['dojo', 'Hall of the King Punch'], 'inn', 'shop', 'bar'] },
    marks: [['statue', 0.1, -0.3, 'The King Punch'], ['flagpole', -0.3, 0.3]],
    logNext: ['dressrosa', 'silver_mine'], danger: 7, music: 'town',
    tagline: 'A warrior king whose one punch takes an hour to wind up — and can knock down a fortress.',
  }),
  // ------------------------------------------------------------ Silver Mine (anime)
  isle({
    id: 'silver_mine', name: 'Silver Mine', sea: 'new_world', x: 250, y: 1140, w: 90, h: 70, climate: 'rocky',
    mountains: [{ name: 'The Mine Mountain', dx: 0, dy: -0.15, r: 0.35, h: 1, cliff: 160 }],
    town: { name: 'Minehead', style: 'ruins', dock: 's', dx: 0, dy: 0.35, buildings: [['hall', 'Byrnndi World\'s Office'], 'shop', 'inn'] },
    marks: [['gate', 0, 0, 'The mine entrance'], ['crate', 0.3, 0.2], ['tent', -0.3, 0.2]],
    logNext: ['dressrosa', 'risky_red_island'], danger: 7, music: 'night',
    tagline: 'Captives dig silver for a pirate who controls the island itself. (Anime tale.)',
  }),
  // ------------------------------------------------------------ Lulusia (canon: erased)
  isle({
    id: 'lulusia', name: 'Lulusia (ruins)', sea: 'new_world', x: 690, y: 880, w: 110, h: 90, climate: 'volcanic', noFruit: true,
    lakes: [{ name: 'The crater', dx: 0, dy: 0, rx: 0.35, ry: 0.3 }],
    marks: [['ruins', 0.4, 0.3, 'What was left of Lulusia'], ['ruins', -0.4, 0.3], ['grave', 0.45, -0.3], ['sign', 0.5, 0.1, 'Lulusia Kingdom — erased from the sky']],
    logNext: ['zou', 'whole_cake_island'], danger: 8, noDock: true, music: 'night',
    tagline: 'A kingdom erased from the map by a light from the sky. Only the crater is left.',
  }),
  // ------------------------------------------------------------ Totto Land
  isle({
    id: 'jam_island', name: 'Jam Island', sea: 'new_world', x: 960, y: 960, w: 70, h: 56, climate: 'candy',
    lakes: [{ name: 'Jam lake', dx: 0.2, dy: -0.2, rx: 0.12, ry: 0.1, tile: T.POND }],
    town: { name: 'Marmalade', style: 'candy', dock: 'w', buildings: [['restaurant', 'Jam Kitchen'], ['inn', 'Sweet Dreams Inn'], 'shop'] },
    marks: [['statue', 0, -0.35, 'Minister of Jam']],
    logNext: ['whole_cake_island', 'nuts_island'], danger: 7, music: 'town',
    tagline: 'Totto Land: the jam runs in rivers, and Big Mom wants her tax in sweets.',
  }),
  isle({
    id: 'nuts_island', name: 'Nuts Island', sea: 'new_world', x: 1000, y: 1120, w: 66, h: 56, climate: 'candy',
    town: { name: 'Hazel Harbour', style: 'candy', dock: 's', buildings: [['shop', 'Nut Roaster'], ['inn', 'The Shell'], 'bar'] },
    marks: [['totem', 0.3, -0.2]],
    logNext: ['whole_cake_island', 'milk_island'], danger: 7, music: 'town',
    tagline: 'Totto Land: trees heavy with nuts the size of cannonballs. Mind your head.',
  }),
  isle({
    id: 'milk_island', name: 'Milk Island', sea: 'new_world', x: 820, y: 1380, w: 70, h: 54, climate: 'candy',
    rivers: [{ name: 'Milk river', points: [[-0.9, 0], [-0.2, 0.05], [0.9, -0.05]], width: 4 }],
    town: { name: 'Creamery', style: 'candy', dock: 'n', buildings: [['cafe', 'Milk Bar'], 'shop', 'inn'] },
    marks: [['arch', 0, 0, 'The milk river crossing']],
    logNext: ['whole_cake_island', 'cacao_island'], danger: 7, music: 'town',
    tagline: 'Totto Land: a river of milk runs through it — a mirror for anyone with the right fruit.',
  }),
  isle({
    id: 'candy_island', name: 'Candy Island', sea: 'new_world', x: 650, y: 1220, w: 66, h: 56, climate: 'candy',
    town: { name: 'Sugarloaf', style: 'candy', dock: 'e', buildings: [['shop', 'Candy Works'], ['restaurant', 'Sweets Hall'], 'inn'] },
    marks: [['statue', 0.2, -0.3, 'Minister of Candy']],
    logNext: ['whole_cake_island', 'cacao_island'], danger: 7, music: 'town',
    tagline: 'Totto Land: candy-glass houses, and everyone smiles — they have to.',
  }),
  // ------------------------------------------------------------ Little East Blue (anime)
  isle({
    id: 'little_east_blue', name: 'Little East Blue', sea: 'new_world', x: 1040, y: 760, w: 90, h: 70, climate: 'spring',
    town: { name: 'Little Foosha', style: 'village', dock: 's', buildings: [['bar', 'Partys Bar (copy)'], ['restaurant', 'Little Baratie'], 'inn', 'shop'] },
    marks: [['windmill', -0.35, -0.2], ['statue', 0.2, -0.3, 'Little Shells Town\'s Marine'], ['boat', 0.4, 0.4]],
    logNext: ['wano', 'zou'], danger: 7, music: 'town',
    tagline: 'A New World island built to look like home for people who left the East Blue. (Anime tale.)',
  }),
  // ------------------------------------------------------------ Gran Tesoro (film)
  isle({
    id: 'gran_tesoro', name: 'Gran Tesoro', sea: 'new_world', x: 1180, y: 1390, w: 110, h: 70, climate: 'tropical',
    town: { name: 'Gran Tesoro', style: 'city', dock: 'n', w: 48, h: 30, plaza: 'fountain', buildings: [['bank', 'Tesoro\'s Treasury'], ['hall', 'The Grand Casino'], ['bar', 'High Rollers'], ['restaurant', 'Golden Buffet'], 'inn', 'shop'] },
    marks: [['statue', 0, -0.35, 'Gild Tesoro in gold'], ['tower', 0.4, -0.2], ['lamp', -0.2, 0.3]],
    logNext: ['egghead', 'baltigo'], danger: 8, music: 'night',
    tagline: 'A city of gold that floats, and a casino where every debt is paid in years. (Film tale.)',
  }),
  // ------------------------------------------------------------ Firstan (film: End Point)
  isle({
    id: 'firstan', name: 'Firstan (End Point)', sea: 'new_world', x: 1480, y: 1380, w: 80, h: 64, climate: 'volcanic',
    mountains: [{ name: 'Dyna Rock vent', dx: 0, dy: -0.1, r: 0.3, h: 0.9 }],
    town: { name: 'Firstan Outpost', style: 'marine', dock: 'w', dy: 0.35, buildings: [['marine_base', 'Abandoned Marine Lab'], 'shop'] },
    marks: [['crystal', 0, -0.3, 'Dyna Stones'], ['cannon', 0.3, 0.2]],
    logNext: ['hachinosu', 'lodestar'], danger: 9, music: 'battle',
    tagline: 'One of three End Points. Blow them all up, said Z, and the New World drowns in magma. (Film tale.)',
  }),
  // ------------------------------------------------------------ Mariners' Grave
  isle({
    id: 'mariners_grave', name: 'Mariners\' Grave', sea: 'new_world', x: 1650, y: 1070, w: 90, h: 76, climate: 'gloom',
    town: { name: 'Last Harbour', style: 'spooky', dock: 'w', buildings: [['church', 'Chapel of the Drowned'], ['bar', 'The Final Round'], 'inn'] },
    marks: [['grave', 0.2, -0.2], ['grave', 0.3, -0.25], ['grave', 0.25, -0.1], ['shipwreck', 0.45, 0.3], ['sign', -0.4, 0.4, 'Every crew that never reached Laugh Tale']],
    logNext: ['laugh_tale', 'lodestar'], danger: 9, music: 'night',
    tagline: 'The last island before the end of the world, where the crews who never made it are buried.',
  }),

  // ===================================================== the game's own (New World)
  isle({
    id: 'thunder_spire', name: 'Thunder Spire', sea: 'new_world', x: 190, y: 1000, w: 60, h: 56, climate: 'rocky',
    mountains: [{ name: 'The Spire', dx: 0, dy: 0, r: 0.3, h: 1, cliff: 220 }],
    town: { name: 'Rodfoot', style: 'village', dock: 'e', dy: 0.35, buildings: [['inn', 'The Grounded Inn'], 'shop'] },
    marks: [['tower', 0, -0.2, 'The lightning rod']],
    logNext: ['punk_hazard', 'prodence'], danger: 7, music: 'sea',
    tagline: 'Lightning strikes the spire every hour. The village runs its forges on it.',
  }),
  isle({
    id: 'obsidian_reach', name: 'Obsidian Reach', sea: 'new_world', x: 420, y: 1240, w: 80, h: 60, climate: 'volcanic',
    town: { name: 'Glassblade', style: 'town', dock: 'n', buildings: [['weapons', 'Black Glass Smithy'], 'inn', 'bar'] },
    marks: [['crystal', 0.3, -0.2], ['crystal', -0.3, 0.2]],
    logNext: ['dressrosa', 'applenine_island'], danger: 7, music: 'town',
    tagline: 'Black glass beaches, and swords that cut sharper than steel — once.',
  }),
  isle({
    id: 'tidewrack', name: 'Tidewrack', sea: 'new_world', x: 160, y: 1395, w: 70, h: 50, climate: 'marsh',
    town: { name: 'Lowwater', style: 'port', dock: 'n', buildings: [['shipwright', 'Wrack Wrights'], 'bar', 'inn'] },
    marks: [['shipwreck', 0.3, 0.2], ['shipwreck', -0.4, -0.1]],
    logNext: ['risky_red_island', 'obsidian_reach'], danger: 7, music: 'sea',
    tagline: 'At low tide the whole bay is wrecks. At high tide, so is anything that\'s anchored wrong.',
  }),
  isle({
    id: 'crimson_atoll', name: 'Crimson Atoll', sea: 'new_world', x: 560, y: 1400, w: 80, h: 56, climate: 'tropical',
    lakes: [{ dx: 0, dy: 0, rx: 0.18, ry: 0.15 }],
    town: { name: 'Redreef', style: 'port', dock: 'n', dx: 0.3, buildings: [['bar', 'Coral Cantina'], 'inn', 'shop'] },
    marks: [['boat', -0.4, 0.3]],
    logNext: ['candy_island', 'cacao_island'], danger: 7, music: 'town',
    tagline: 'Red coral under red water. The pirates say the colour is the coral. The pirates lie.',
  }),
  isle({
    id: 'seabreak_citadel', name: 'Seabreak Citadel', sea: 'new_world', x: 980, y: 660, w: 80, h: 60, climate: 'rocky',
    town: { name: 'Seabreak', style: 'marine', dock: 's', buildings: [['marine_base', 'G-3 Citadel'], ['bounty', 'Bounty Desk'], 'inn', 'shop'] },
    marks: [['cannon', 0.3, -0.2], ['cannon', -0.3, -0.2], ['tower', 0, -0.35, 'The Breakwater Tower']],
    logNext: ['zou', 'little_east_blue'], danger: 7, music: 'town',
    tagline: 'A Marine fortress on the edge of the Calm Belt. Its guns face the New World, not out.',
  }),
  isle({
    id: 'glass_dune', name: 'Glass Dune', sea: 'new_world', x: 1290, y: 660, w: 90, h: 60, climate: 'desert',
    town: { name: 'Prism', style: 'desert', dock: 's', buildings: [['inn', 'The Cool Cellar'], ['market', 'Glass Bazaar'], 'shop'] },
    marks: [['crystal', -0.3, -0.2], ['crystal', 0.35, -0.15], ['ruins', 0.2, 0.3]],
    logNext: ['winner_island', 'wano'], danger: 8, music: 'town',
    tagline: 'A desert of sand melted to glass. At noon it blinds you; at night it rings.',
  }),
  isle({
    id: 'hollow_moon', name: 'Hollow Moon Isle', sea: 'new_world', x: 1560, y: 680, w: 70, h: 56, climate: 'gloom',
    town: { name: 'Crescent', style: 'spooky', dock: 's', buildings: [['library', 'The Moon Archive'], 'inn'] },
    marks: [['ruins', 0, -0.3, 'The crescent arch'], ['crystal', 0.3, 0.1]],
    logNext: ['elbaf', 'karai_bari'], danger: 8, music: 'night',
    tagline: 'Its people say they came from the Moon. Their carvings say the same thing.',
  }),
  isle({
    id: 'krakens_rest', name: 'Kraken\'s Rest', sea: 'new_world', x: 1700, y: 900, w: 80, h: 60, climate: 'tropical',
    town: { name: 'Tentacle Bay', style: 'port', dock: 'w', buildings: [['bar', 'The Ink Pot'], 'inn', 'shop'] },
    marks: [['bones', 0.3, -0.2, 'The kraken\'s beak'], ['bones', 0.4, 0]],
    logNext: ['laugh_tale', 'karai_bari'], danger: 9, music: 'sea',
    tagline: 'Built on the back of a kraken that died here centuries ago. Probably died.',
  }),
  isle({
    id: 'emberfall', name: 'Emberfall', sea: 'new_world', x: 1000, y: 1300, w: 76, h: 60, climate: 'volcanic',
    mountains: [{ name: 'Emberfall Peak', dx: 0.2, dy: -0.2, r: 0.3, h: 1 }],
    town: { name: 'Cinders', style: 'town', dock: 'w', buildings: [['weapons', 'Lava Forge'], 'inn', 'bar'] },
    marks: [['campfire', -0.3, 0.2]],
    logNext: ['foodvalten', 'gran_tesoro'], danger: 8, music: 'town',
    tagline: 'Ash falls like snow here. The smiths say it makes the best steel in the New World.',
  }),
  isle({
    id: 'frostfang', name: 'Frostfang', sea: 'new_world', x: 1440, y: 1060, w: 80, h: 64, climate: 'winter',
    mountains: [{ name: 'The Fang', dx: 0, dy: -0.15, r: 0.3, h: 1, snow: true }],
    town: { name: 'Fanghold', style: 'snow', dock: 's', buildings: [['inn', 'The Bearskin'], ['dojo', 'Ice Hall'], 'shop'] },
    marks: [['statue', 0.3, 0.2, 'The Frozen Admiral']],
    logNext: ['egghead', 'elbaf'], danger: 8, music: 'town',
    tagline: 'Half of it froze in one night when two admirals fought. The other half is still arguing about it.',
  }),
  isle({
    id: 'verdigris_isle', name: 'Verdigris Isle', sea: 'new_world', x: 1300, y: 1060, w: 70, h: 56, climate: 'jungle',
    town: { name: 'Copperton', style: 'ruins', dock: 'w', buildings: [['library', 'Copper Archive'], 'inn'] },
    marks: [['statue', 0.2, -0.3, 'The Green Giant'], ['poneglyph', -0.3, -0.2, null, { spot: 'verdigris_stone' }]],
    logNext: ['egghead', 'frostfang'], danger: 8, music: 'night',
    tagline: 'A jungle grown over a city of green copper statues, all facing the same way.',
  }),
  isle({
    id: 'starfall_crater', name: 'Starfall Crater', sea: 'new_world', x: 1740, y: 1210, w: 80, h: 70, climate: 'rocky',
    lakes: [{ name: 'The crater lake', dx: 0, dy: 0, rx: 0.25, ry: 0.2 }],
    town: { name: 'Skyfall', style: 'village', dock: 'w', dx: -0.35, buildings: [['library', 'Stargazers\' Hall'], 'inn'] },
    marks: [['crystal', 0.3, -0.3, 'The fallen star']],
    logNext: ['lodestar', 'laugh_tale'], danger: 9, music: 'night',
    tagline: 'Something fell from the sky here and made a lake. It still glows on moonless nights.',
  }),
  isle({
    id: 'aurora_isle', name: 'Aurora Isle', sea: 'new_world', x: 310, y: 650, w: 70, h: 52, climate: 'winter',
    town: { name: 'Northlight', style: 'snow', dock: 's', buildings: [['inn', 'The Lantern Lodge'], 'shop'] },
    marks: [['lantern', 0.2, -0.2]],
    logNext: ['green_bit', 'mystoria_island'], danger: 7, music: 'night',
    tagline: 'At the very edge of the Calm Belt, where the sky burns green every night.',
  }),
  isle({
    id: 'wyrmbone_isle', name: 'Wyrmbone Isle', sea: 'new_world', x: 1160, y: 1130, w: 86, h: 60, climate: 'prehistoric',
    town: { name: 'Ribcage', style: 'tribal', dock: 'e', buildings: [['hall', 'The Skull Lodge'], 'shop'] },
    marks: [['bones', 0, -0.1, 'The Wyrm\'s spine'], ['bones', 0.2, -0.05], ['bones', -0.2, -0.15], ['skull', 0.4, -0.1]],
    logNext: ['onigashima', 'verdigris_isle'], danger: 8, music: 'sea',
    tagline: 'The ribs of a dragon bigger than the island, and a tribe that lives between them.',
  }),
  isle({
    id: 'brimstone_key', name: 'Brimstone Key', sea: 'new_world', x: 560, y: 1230, w: 60, h: 50, climate: 'volcanic',
    town: { name: 'Sulphur Steps', style: 'village', dock: 'w', buildings: [['doctor', 'Sulphur Baths'], 'inn'] },
    marks: [['crystal', 0.2, -0.2]],
    logNext: ['candy_island', 'whole_cake_island'], danger: 7, music: 'town',
    tagline: 'It stinks of rotten eggs and cures any rash on the Grand Line.',
  }),
];
