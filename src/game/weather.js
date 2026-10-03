// The weather by place. Every sea has its own climate, and so does every
// charted island: near one (and on it) its climate takes over from the sea's,
// the way each Grand Line island keeps its own weather whatever the sea round
// it is doing. A climate is a table of how often each kind of weather comes,
// how long it lasts and how hard it blows (like Breath of the Wild's map areas
// tied to climates with their own odds for each weather); the env (env.js)
// rolls from it and eases every field toward what that weather wants, so
// nothing changes at a stroke.
//
//  * East Blue: mild, mostly fair, the odd squall.
//  * North / West / South Blue: greyer and foggier in the north, showery and
//    warm in the south.
//  * Paradise: erratic — sudden storms, sun-showers, snow out of a clear sky.
//  * New World: extreme — violent storms, odd skies (a red sky at noon, dry
//    lightning under violet cloud, the aurora).
//  * Calm Belt: no wind, no waves, a glassy sea.
//  * Winter islands snow, summer islands are hot and clear, desert islands are
//    dry and dusty, autumn ones grey and wet, gloomy ones fogbound.
//  * Sky islands are above the clouds: always clear.
import { regionAt, REGION, isGrandLine } from '../world/constants.js';

/**
 * Each kind of weather and what it wants at full strength (k = 1):
 * cloud (cover, 0..1), rain, snow, storm (wind, waves and thunder), fog,
 * dust (windborne sand), heat (hot clear air), ash, calm (glassy, windless),
 * odd + tint (a strangely coloured sky), aurora, thunder (lightning without a
 * storm), wind (× the climate's own), gate: false — it rains without waiting
 * for the clouds (a sun-shower).
 */
export const KINDS = {
  clear: { cloud: 0.04 },
  fair: { cloud: 0.3 },
  cloudy: { cloud: 0.66 },
  overcast: { cloud: 0.9, wind: 0.95 },
  rain: { cloud: 0.94, rain: 0.62, storm: 0.16 },
  squall: { cloud: 0.9, rain: 0.86, storm: 0.42, wind: 1.25 },
  storm: { cloud: 1, rain: 1, storm: 0.92, wind: 1.2 },
  fog: { cloud: 0.55, fog: 0.6, wind: 0.75 },
  flurries: { cloud: 0.7, snow: 0.3 },
  snow: { cloud: 0.93, snow: 0.66, storm: 0.08 },
  blizzard: { cloud: 1, snow: 1, storm: 0.62, fog: 0.25, wind: 1.3 },
  heat: { cloud: 0.06, heat: 1, wind: 0.8 },
  dust: { cloud: 0.1, dust: 0.55, heat: 0.55, wind: 1.15 },
  sandstorm: { cloud: 0.22, dust: 1, storm: 0.38, wind: 1.4 },
  ash: { cloud: 0.86, ash: 0.7, fog: 0.12 },
  calm: { cloud: 0.12, calm: 1, heat: 0.3, wind: 0 },
  sunshower: { cloud: 0.3, rain: 0.42, gate: false },
  crimson: { cloud: 0.5, odd: 1, tint: [1.0, 0.45, 0.34] },
  violet: { cloud: 0.84, odd: 1, tint: [0.66, 0.48, 1.0], thunder: 0.75, storm: 0.3, wind: 1.1 },
  aurora: { cloud: 0.05, aurora: 1 },
};

/** What the weather is called (env.forecast). */
export const LABELS = {
  clear: 'Clear', fair: 'Fair', cloudy: 'Cloudy', overcast: 'Overcast', rain: 'Rain', squall: 'Squall', storm: 'Storm',
  fog: 'Fog', flurries: 'Flurries', snow: 'Snow', blizzard: 'Blizzard', heat: 'Heatwave', dust: 'Dust', sandstorm: 'Sandstorm',
  ash: 'Ashfall', calm: 'Dead calm', sunshower: 'Sun-shower', crimson: 'Red sky', violet: 'Dry lightning', aurora: 'Aurora',
};

// how bad each kind is (a settled climate doesn't jump from one end to the other)
const SEVERITY = {
  clear: 0, heat: 0, calm: 0, aurora: 0, fair: 1, cloudy: 2, fog: 2, sunshower: 2, crimson: 3, overcast: 3, flurries: 3, dust: 3,
  rain: 4, snow: 4, ash: 4, squall: 5, violet: 5, sandstorm: 5, storm: 6, blizzard: 6,
};

/**
 * The climates: w — the odds of each kind; dur — how long one lasts (game
 * seconds); k — how hard it comes; wind — the wind's strength here (× 1 is
 * the open sea's); cold — rain falls as snow; dry — it never rains; erratic —
 * any weather may follow any other (the Grand Line).
 */
export const CLIMATES = {
  // ---- the seas
  east_blue: { w: { clear: 3, fair: 4.5, cloudy: 1.5, overcast: 0.5, rain: 0.8, squall: 0.45, fog: 0.3, storm: 0.15 }, dur: [110, 260], k: [0.55, 0.85], wind: 1 },
  north_blue: { w: { clear: 1.5, fair: 2.5, cloudy: 2.5, overcast: 1.2, rain: 1.2, fog: 1, squall: 0.5, storm: 0.35, flurries: 0.5 }, dur: [100, 240], k: [0.6, 0.9], wind: 1 },
  west_blue: { w: { clear: 2.5, fair: 3.5, cloudy: 1.5, overcast: 0.6, rain: 1, squall: 0.6, fog: 0.4, storm: 0.3 }, dur: [100, 240], k: [0.6, 0.9], wind: 1 },
  south_blue: { w: { clear: 3, fair: 3, heat: 1, cloudy: 1, squall: 1.2, rain: 0.6, storm: 0.35, sunshower: 0.3 }, dur: [100, 220], k: [0.6, 0.9], wind: 1 },
  paradise: { w: { clear: 2, fair: 1.6, cloudy: 1, overcast: 0.5, rain: 1, squall: 1.4, storm: 2, fog: 0.6, heat: 0.7, sunshower: 0.6, flurries: 0.35 }, dur: [25, 80], k: [0.7, 1], wind: 1.05, erratic: true },
  new_world: { w: { clear: 1, fair: 0.9, cloudy: 0.6, rain: 0.7, squall: 1.4, storm: 3.2, fog: 0.5, crimson: 0.7, violet: 0.7, sunshower: 0.4, aurora: 0.5, flurries: 0.3, heat: 0.4 }, dur: [20, 65], k: [0.85, 1], wind: 1.12, erratic: true },
  calm_belt: { w: { calm: 1 }, dur: [400, 800], k: [1, 1], wind: 0 },
  polar: { w: { snow: 3, blizzard: 1.5, overcast: 1, flurries: 1, clear: 0.6, aurora: 0.8 }, dur: [90, 220], k: [0.7, 1], wind: 1.1, cold: true },
  red_line: { w: { clear: 3, fair: 3, cloudy: 1, fog: 0.5 }, dur: [120, 260], k: [0.6, 0.9], wind: 1 },
  // ---- the islands' own
  winter: { w: { snow: 4, flurries: 2, blizzard: 1.3, overcast: 1.2, clear: 1, aurora: 0.3 }, dur: [90, 220], k: [0.6, 1], wind: 0.95, cold: true },
  summer: { w: { heat: 3, clear: 3, fair: 2, squall: 1.2, sunshower: 0.6, storm: 0.4 }, dur: [90, 220], k: [0.6, 0.95], wind: 0.9 },
  desert: { w: { heat: 3, clear: 1.5, dust: 3, sandstorm: 1.1 }, dur: [90, 220], k: [0.6, 1], wind: 1, dry: true },
  spring: { w: { fair: 4, clear: 3, cloudy: 1, rain: 1.2, sunshower: 0.5 }, dur: [100, 240], k: [0.5, 0.8], wind: 0.9 },
  autumn: { w: { fair: 2, cloudy: 3, overcast: 1.2, rain: 2, fog: 1, clear: 1 }, dur: [100, 240], k: [0.55, 0.85], wind: 1 },
  temperate: { w: { clear: 2.5, fair: 4, cloudy: 1.5, overcast: 0.6, rain: 1, fog: 0.4, squall: 0.3 }, dur: [110, 260], k: [0.55, 0.85], wind: 0.95 },
  volcanic: { w: { ash: 3, overcast: 1.2, cloudy: 1, clear: 0.6, heat: 0.6 }, dur: [100, 220], k: [0.6, 1], wind: 0.95 },
  gloom: { w: { fog: 4, overcast: 3, rain: 1 }, dur: [120, 300], k: [0.7, 1], wind: 0.7 },
  candy: { w: { fair: 3, clear: 2.5, sunshower: 1, cloudy: 0.6 }, dur: [100, 240], k: [0.5, 0.8], wind: 0.9 },
  sky: { w: { clear: 1 }, dur: [600, 900], k: [1, 1], wind: 0.8 },
  none: { w: { clear: 1 }, dur: [600, 900], k: [1, 1], wind: 0.5 },
};

/** Each sea's climate. */
export const SEA_CLIMATE = {
  [REGION.EAST_BLUE]: 'east_blue', [REGION.NORTH_BLUE]: 'north_blue', [REGION.WEST_BLUE]: 'west_blue', [REGION.SOUTH_BLUE]: 'south_blue',
  [REGION.PARADISE]: 'paradise', [REGION.NEW_WORLD]: 'new_world', [REGION.CALM_NORTH]: 'calm_belt', [REGION.CALM_SOUTH]: 'calm_belt',
  [REGION.RED_LINE]: 'red_line', [REGION.POLAR]: 'polar',
};

// an island's climate by its definition's name for it (null: the sea's own,
// or in the Grand Line a steadier temperate one)
const ISLAND_CLIMATE = {
  winter: 'winter', tropical: 'summer', jungle: 'summer', prehistoric: 'summer', desert: 'desert', spring: 'spring', sakura: 'spring',
  autumn: 'autumn', volcanic: 'volcanic', gloom: 'gloom', marsh: 'gloom', candy: 'candy', sky: 'sky', undersea: 'none',
  mangrove: null, temperate: null, rocky: null,
};
// …and by the climate stored in its tiles (world/tiles.js CLIMATE)
const TILE_CLIMATE = [null, 'summer', 'autumn', 'winter', 'desert', 'volcanic', 'sky', 'none', 'spring', 'candy', 'gloom', 'spring'];

/** How far out from its coast (m) a charted island's climate reaches; a little farther to lose it again. */
export const ISLAND_REACH = 230, ISLAND_KEEP = 300;

function islandClimate(isl, region) {
  const c = isl.def?.climate;
  const own = typeof c === 'number' ? TILE_CLIMATE[c] : ISLAND_CLIMATE[c];
  if (own) return own;
  // (a temperate island keeps the sea's weather in the Blues; in the Grand Line its own, steadier)
  return isGrandLine(region) ? 'temperate' : SEA_CLIMATE[region] || 'temperate';
}

/**
 * Where you are, for the weather: { key, climate, island, region }. key
 * changes whenever the place does (a sea, or an island's own air); `prev` is
 * the last key, so an island's climate holds a little farther out on the way
 * back (no flicker at the edge). `land`: the tile climate under you, when
 * you're ashore (one island can have two: Punk Hazard burns on one side and
 * freezes on the other).
 */
export function placeAt(world, x, y, prev = null) {
  if (!world) return { key: 'sea:east_blue', climate: 'east_blue', island: null, region: REGION.EAST_BLUE };
  const zone = world.zone || 0;
  if (zone === 1) return { key: 'zone:sky', climate: 'sky', island: null, region: REGION.EAST_BLUE };
  if (zone) return { key: 'zone:' + zone, climate: 'none', island: null, region: REGION.EAST_BLUE };
  const region = regionAt(x, y);
  let best = null, bd = Infinity;
  for (const isl of world.islands || []) {
    if (!isl.def?.name || isl.def.islet) continue; // (the little uncharted islets keep the sea's weather)
    const reach = (isl.radius || 0) + (prev && prev.startsWith('isl:' + isl.id + ':') ? ISLAND_KEEP : ISLAND_REACH);
    const dx = world.dx ? world.dx(isl.x, x) : x - isl.x, dy = y - isl.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < reach * reach && d2 < bd) { bd = d2; best = isl; }
  }
  if (!best) return { key: 'sea:' + (SEA_CLIMATE[region] || 'east_blue'), climate: SEA_CLIMATE[region] || 'east_blue', island: null, region };
  let climate = islandClimate(best, region);
  // (ashore, the ground's own climate has the last word where it's a strong one)
  const t = world.climate && world.isLiquid && !world.isLiquid(x, y) ? TILE_CLIMATE[world.climate(x, y)] : null;
  if (t && t !== 'none' && t !== 'sky' && t !== climate && (t === 'winter' || t === 'volcanic' || t === 'desert')) climate = t;
  return { key: `isl:${best.id}:${climate}`, climate, island: best, region };
}

/** Is this kind of weather possible in this climate? */
export const allowed = (climate, kind) => !!(CLIMATES[climate] || CLIMATES.temperate).w[kind];

/**
 * The next weather in a climate: { kind, k (how hard), dur (s) }. `rand` is
 * a 0..1 random source (Math.random, or a seeded one in the tests); `prev`
 * the weather now: a settled climate keeps to it more often and doesn't jump
 * from a clear sky into a storm (the Grand Line does).
 */
export function rollWeather(climate, rand = Math.random, prev = null) {
  const C = CLIMATES[climate] || CLIMATES.temperate;
  let total = 0;
  const opts = [];
  for (const kind in C.w) {
    let w = C.w[kind];
    if (prev && !C.erratic && SEVERITY[prev] !== undefined) {
      if (kind === prev) w *= 1.5;
      if (Math.abs(SEVERITY[kind] - SEVERITY[prev]) >= 4) w *= 0.2;
    }
    opts.push(kind, w);
    total += w;
  }
  let r = rand() * total, kind = opts[opts.length - 2];
  for (let i = 0; i < opts.length; i += 2) if ((r -= opts[i + 1]) <= 0) { kind = opts[i]; break; }
  const k = C.k[0] + (C.k[1] - C.k[0]) * rand();
  const dur = C.dur[0] + (C.dur[1] - C.dur[0]) * rand();
  return { kind, k, dur };
}

const WHITE = [1, 1, 1];

/**
 * What a weather wants of each field, in this climate (out is reused):
 * cloud, rain, snow, storm, fog, dust, heat, ash, calm, odd, tint, aurora,
 * thunder, wind, gate.
 */
export function weatherTargets(kind, k = 1, climate = 'temperate', out = {}) {
  const K = KINDS[kind] || KINDS.clear, C = CLIMATES[climate] || CLIMATES.temperate;
  // (a lighter shower still greys the whole sky; a lighter fair day has fewer clouds)
  out.cloud = Math.min(1, K.cloud * (K.cloud > 0.6 ? 0.85 + 0.15 * k : 0.7 + 0.3 * k));
  out.rain = (K.rain || 0) * k;
  out.snow = (K.snow || 0) * k;
  // rain falls as snow where it's cold, and not at all in a desert
  if (C.cold && out.rain) { out.snow = Math.max(out.snow, out.rain); out.rain = 0; }
  if (C.dry) out.rain = 0;
  out.storm = (K.storm || 0) * k;
  out.fog = (K.fog || 0) * k;
  out.dust = (K.dust || 0) * k;
  out.heat = (K.heat || 0) * Math.max(0.6, k);
  out.ash = (K.ash || 0) * k;
  out.calm = K.calm || 0;
  out.odd = (K.odd || 0) * Math.max(0.7, k);
  out.tint = K.tint || WHITE;
  out.aurora = K.aurora || 0;
  out.thunder = (K.thunder || 0) * k;
  out.wind = C.wind * (K.wind ?? 1);
  out.gate = K.gate !== false;
  return out;
}
