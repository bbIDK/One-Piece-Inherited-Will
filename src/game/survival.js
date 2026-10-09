// Needs: hunger, thirst and the warmth of your body. Food runs down over a
// few days at sea, water faster, faster still in the heat (a desert
// afternoon drinks you dry three times as quick); the air's temperature
// (game/weather.js, env.tempC) pulls your body toward it — out in the polar
// snow you chill, under the desert sun you overheat. Shelter (indoors, below
// decks), a coat or a cloak, a fire in your veins (Mera, Magu) or ice
// (Hie), a Mink's fur or a Lunarian's hide take the edge off.
//
// Run out of food or water, or let your body get too cold or too hot, and
// you stop healing and start to weaken — never all the way: it takes you
// down to your last breath, and a fight does the rest. Eat (fruit, meat,
// stew), drink (a flask, a coconut, milk, from a stream or pond: crouch at
// its edge) and rest at an inn (a meal and a jug come with the bed).
//
// Creative mode, and the setting, turn it off.
import { T } from '../world/tiles.js';
import { ITEMS } from '../data/items.js';

/** Real seconds for a full belly to empty, and a full flask (at a mild 24°C). */
export const FOOD_SECONDS = 2900, WATER_SECONDS = 1900;
const BODY = 37;
// (fresh water you can drink from: not the sea)
const FRESH = new Set([T.RIVER, T.POND, T.CANAL]);

/** How much of a meal (0..1 of a full belly) and of a drink an item is. */
export function nourishment(d) {
  if (!d || (d.type !== 'food' && d.type !== 'drink')) return { food: 0, water: 0 };
  const food = d.food ?? (d.type === 'drink' ? 0 : Math.min(0.6, 0.06 + (d.heal || 0) / 260));
  return { food, water: d.water ?? 0 };
}

/** The temperature your body feels (°C): the air's, through shelter, clothes and nature. */
export function feltTemp(air, { indoors = false, wet = false, coat = false, coldProof = false, heatProof = false, fur = false } = {}) {
  let t = air;
  if (indoors) t += (20 - t) * 0.75;
  if (wet) t = Math.min(t, 18) - 4;
  if (t < 12) { if (coat) t += 7; if (fur) t += 12; }
  if (t > 28 && fur) t += 3;
  if (coldProof) t = Math.max(t, 16);
  if (heatProof) t = Math.min(t, 28);
  return t;
}

/** Where your body's warmth settles at a felt temperature (°C). */
export function bodyTarget(felt) {
  if (felt < 12) return BODY - (12 - felt) * 0.18;
  if (felt > 30) return BODY + (felt - 30) * 0.2;
  return BODY;
}

/** How much faster you thirst: the heat, a fever, hard work. */
export function thirstRate(felt, body, busy = 0) {
  return (1 + Math.max(0, felt - 24) / 9 + Math.max(0, body - 37.5) * 0.6) * (1 + busy * 0.3);
}

export function installSurvival(game) {
  const S = { sipT: 0, warned: {} };
  game.survival = S;
  const needs = () => {
    const c = game.state?.char;
    if (!c) return null;
    return c.needs || (c.needs = { food: 1, water: 1, body: BODY });
  };
  S.needs = needs;
  S.enabled = () => game.settings?.survival !== false && !game.creative?.on && !game.zoneRules?.noNeeds;

  /** Eaten or drunk: fill up. */
  S.consume = (id) => {
    const n = needs(), d = ITEMS[id];
    if (!n || !d) return;
    const { food, water } = nourishment(d);
    n.food = Math.min(1, n.food + food);
    n.water = Math.min(1, n.water + water);
    // (something hot warms you through; something cold cools you down)
    if (d.warm) n.body = Math.min(BODY, n.body + d.warm);
    if (d.cool) n.body = Math.max(BODY, n.body - d.cool);
  };

  // a night at an inn (or in your own bunk): a meal and a jug with the bed
  game.on('rested', () => { const n = needs(); if (n) { n.food = Math.max(n.food, 0.9); n.water = Math.max(n.water, 0.9); n.body = BODY; } });

  const warn = (key, on, text, color) => {
    if (on && !S.warned[key]) { S.warned[key] = 1; game.log(text, color); }
    else if (!on) S.warned[key] = 0;
  };

  game.on('tick', (dt) => {
    const p = game.player, n = needs(), w = game.world, env = game.env;
    if (!p || !n || !w || !env || p.dead || p.state === 'dead') return;
    if (!S.enabled() || dt <= 0) { p.needsHurt = false; S.felt = env.tempC; return; }
    dt = Math.min(dt, 0.25);
    const c = game.state.char;
    const eq = Object.values(c.equipped || {}).flat().filter(Boolean).join(' ');
    const fruit = p.fruit || c.fruit || '';
    const rec = w.floorRec?.(p.x, p.y);
    const air = env.tempC ?? 20;
    const felt = feltTemp(air, {
      indoors: !!(rec?.interior || p.belowDeck || game.zone?.indoors),
      wet: !!p.inWater,
      coat: /coat|cloak|hood|jerkin|haramaki/.test(eq),
      coldProof: fruit === 'mera' || fruit === 'magu' || fruit === 'hie' || c.race === 'lunarian',
      heatProof: fruit === 'mera' || fruit === 'magu' || c.race === 'lunarian',
      fur: c.race === 'mink',
    });
    S.felt = felt;
    // the body follows the air, over a couple of minutes
    const target = bodyTarget(felt);
    n.body += (target - n.body) * Math.min(1, dt / 150);
    const busy = (p.sprinting || p.inCombat || p.action ? 1 : 0) + (p.inWater && !p.gills ? 0.5 : 0);
    const fishy = c.race === 'fishman' && p.inWater ? 0.2 : 1;
    n.water = Math.max(0, n.water - dt / WATER_SECONDS * thirstRate(felt, n.body, busy) * fishy);
    n.food = Math.max(0, n.food - dt / FOOD_SECONDS * (1 + Math.max(0, BODY - n.body) * 0.4) * (1 + busy * 0.25));

    // drinking: crouched at (or in) a stream, a pond, a canal
    S.sipT -= dt;
    const fresh = FRESH.has(w.type(p.x, p.y)) || [0, 1.6, 3.2, 4.8].some((a) => FRESH.has(w.type(p.x + Math.cos(a) * 1.2, p.y + Math.sin(a) * 1.2)));
    S.canDrink = fresh && n.water < 0.98;
    if (S.canDrink && p.crouch && p.state === 'idle' && !p.action) {
      n.water = Math.min(1, n.water + dt * 0.12);
      if (S.sipT <= 0) { S.sipT = 0.7; game.audio?.sfx('sip', p); }
      game.hint?.('drink_stream', 'Crouched at fresh water (Alt), you drink your fill.');
    } else if (fresh && n.water < 0.6) game.hint?.('drink_here', 'Fresh water: crouch here (Alt) to drink.');

    // in need: no healing, and slowly weaker (never past your last breath)
    let hurt = 0;
    if (n.food <= 0) hurt += 0.35;
    if (n.water <= 0) hurt += 0.7;
    if (n.body < 35) hurt += (35 - n.body) * 0.6;
    if (n.body > 39) hurt += (n.body - 39) * 0.8;
    p.needsHurt = hurt > 0;
    if (hurt > 0 && p.hp > 1) p.hp = Math.max(1, p.hp - hurt * dt * (p.d.maxHp / 150));

    warn('food', n.food < 0.2, n.food <= 0 ? 'You are starving: eat something, or you will keep weakening.' : 'You\'re getting hungry.', '#ffcc80');
    warn('water', n.water < 0.2, 'You\'re thirsty. Drink: a flask, a coconut, or crouch at a stream.', '#81d4fa');
    warn('cold', n.body < 35.6, 'You\'re freezing. Get indoors, or put on a coat or a cloak.', '#b3e5fc');
    warn('hot', n.body > 38.6, 'You\'re overheating. Get into the shade, indoors, or drink.', '#ffab91');
  });
  return S;
}
