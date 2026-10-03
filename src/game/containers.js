// Chests, drawers and hoards you open and look into. What's inside is rolled
// once and shown thing by thing; what you take is gone. A home's things come
// back slowly (a new lot every ten days) — a pirates' hoard or a treasure
// chest, never.
//
// A home's drawers hold what people keep at home: some fruit, a meal, a
// bottle, a bandage, a little money — now and then a trinket, an old sword or
// a slingshot. Nothing that would make a fortune.
import { RNG } from '../core/rng.js';
import { ITEMS } from '../data/items.js';
import { earn, addItem } from './inventory.js';
import { persist } from './lineage.js';
import { openLoot } from '../ui/loot.js';

const SEA_TIER = { east_blue: 1, north_blue: 1.2, west_blue: 1.2, south_blue: 1.2, polar: 1.3, paradise: 2.2, calm_belt: 2.2, sky: 2.4, undersea: 2.8, red_line: 3.2, new_world: 4 };
const RESTOCK_DAYS = 10;

// [item, weight]
const HOME = [
  ['apple', 10], ['banana', 8], ['mango', 6], ['tangerine', 5], ['cherry', 5], ['coconut', 3],
  ['rice_ball', 8], ['fresh_fish', 5], ['meat', 5], ['sake', 5], ['bandage', 6], ['antidote', 1.5],
  ['bandana', 1.6], ['headband', 1.4], ['shell_bracelet', 1], ['lucky_charm', 0.8], ['iron_ring', 0.6],
  ['wooden_sword', 1.4], ['slingshot', 1], ['rusty_katana', 0.7], ['gold_coins', 0.5],
];
const HOARD_EXTRA = [['sake', 3], ['meat', 3], ['bandage', 3], ['cutlass', 1], ['flintlock', 0.8], ['rusty_katana', 1.2]];

function weighted(rng, table) {
  let sum = 0;
  for (const [id, w] of table) if (ITEMS[id]) sum += w;
  let r = rng.next() * sum;
  for (const [id, w] of table) { if (!ITEMS[id]) continue; if ((r -= w) <= 0) return id; }
  return table[0][0];
}

function put(items, id, qty = 1) {
  const have = items.find((x) => x.id === id);
  if (have) have.qty += qty; else items.push({ id, qty });
}

/** Roll what's in a container. */
function roll(kind, rng, tier, o = {}) {
  const items = [];
  let berries = 0;
  if (kind === 'home') {
    if (rng.chance(0.55)) berries = Math.round(rng.range(12, 90) * tier);
    const n = rng.chance(0.15) ? 0 : rng.int(1, 3);
    for (let i = 0; i < n; i++) put(items, weighted(rng, HOME));
  } else if (kind === 'hoard') {
    berries = Math.round(rng.range(700, 2000) * tier);
    put(items, rng.pick(['gold_coins', 'gold_coins', 'jewels']));
    if (rng.chance(0.35)) put(items, rng.pick(['jewels', 'gold_coins', 'golden_statue']));
    for (let i = rng.int(1, 2); i > 0; i--) put(items, weighted(rng, HOARD_EXTRA));
  } else if (kind === 'ship') {
    // a ship's hold: her takings (o.berries) and her cargo (o.goods, o.n of them)
    berries = o.berries || 0;
    for (let i = 0; i < (o.n || 2); i++) { const id = rng.pick(o.goods || ['gold_coins']); if (id !== 'seastone' || rng.chance(0.15)) put(items, id); }
  } else {
    // a treasure chest out in the world
    berries = Math.round(rng.range(300, 1200) * (o.tier || 1) * (o.luck || 1));
    if (o.item) put(items, o.item);
    else if (rng.chance(0.35 * (o.luck || 1))) put(items, rng.pick((o.tier || 1) > 2 ? ['jewels', 'gold_coins', 'golden_statue', 'rumble_ball'] : ['gold_coins', 'meat', 'bandage', 'jewels']));
  }
  // now and then, a Devil Fruit (o.devil: the chance; o.rollDevil rolls which,
  // and keeps it for this chest — game.rollFruit marks it found, so nothing
  // else ever rolls it: see the guard in open)
  if (kind !== 'home' && o.rollDevil && rng.chance(o.devil ?? 0.04)) {
    const fid = o.rollDevil(rng);
    if (fid) items.push({ id: 'fruit_' + fid, qty: 1, kept: true });
  }
  return { berries, items };
}
// (a Devil Fruit's chance, by what holds it)
const DEVIL = { treasure: 0.06, hoard: 0.05, ship: 0.04 };

export function installContainers(game) {
  const store = () => {
    const c = game.state.char;
    return (c.world.containers = c.world.containers || {});
  };
  const tierHere = () => SEA_TIER[game.reputation?.sea?.()] || 1;

  /**
   * The contents of container `key` (rolled on first look). kind: 'home' |
   * 'hoard' | 'treasure'.
   */
  function contents(key, kind, o = {}) {
    const c = game.state.char, S = store();
    const period = kind === 'home' ? Math.floor(game.env.day / RESTOCK_DAYS) : 0;
    let e = S[key];
    if (!e || (kind === 'home' && e.p !== period)) {
      const rng = new RNG(`${key}:${period}:${c.runSeed}`);
      e = { ...roll(kind, rng, o.tier ?? tierHere(), { devil: DEVIL[kind], rollDevil: (r) => game.rollFruit?.(r), ...o }), p: period };
      S[key] = e;
    }
    return e;
  }
  const isEmpty = (e) => !e || (!e.berries && !e.items.length);

  /**
   * Open a container: its contents in a panel, a Take button for each thing.
   * `onTake()` runs before the first thing is taken (that's the theft, in
   * somebody's home); `onEmpty()` once it's cleared out.
   */
  function open(key, kind, { title, sub, o, onTake, onEmpty } = {}) {
    const e = contents(key, kind, o);
    let first = true;
    const pocket = { get berries() { return e.berries; }, get items() { return e.items; } };
    game.audio?.sfx('door');
    return openLoot(game, { name: title || 'Chest', pocket }, {
      title, sub: sub || (isEmpty(e) ? '' : 'You lift the lid and look inside…'),
      empty: kind === 'home' ? 'Nothing left worth taking. (People restock their homes in time.)' : 'Empty. You took it all.',
      take(which) {
        if (first) { first = false; if (onTake && onTake() === false) return; }
        if ((which === 'berries' || which === 'all') && e.berries) { earn(game, e.berries, kind === 'home' ? 'stolen' : kind === 'hoard' ? "from the pirates' hoard" : 'treasure'); e.berries = 0; }
        const list = which === 'all' ? e.items.slice() : e.items.filter((x) => x.id === which);
        for (const it of list) {
          // (a Devil Fruit already eaten by someone else has rotted away)
          if (it.id.startsWith('fruit_') && !it.kept && game.fruitTaken?.(it.id.slice(6))) { game.log('The fruit in here has rotted away...', '#b0bec5'); e.items = e.items.filter((x) => x !== it); continue; }
          addItem(game, it.id, it.qty);
          if (it.id.startsWith('fruit_')) {
            game.state.char.world.fruitsTaken = [...new Set([...(game.state.char.world.fruitsTaken || []), it.id.slice(6)])];
            game.ui?.toast?.('A DEVIL FRUIT!', 'A strange swirled fruit, packed away among the rest.', '#ffab91');
          }
          e.items = e.items.filter((x) => x !== it);
        }
        game.audio?.sfx(kind === 'home' ? 'coin' : 'treasure');
        if (isEmpty(e)) onEmpty?.();
        persist(game);
      },
    });
  }

  // (a chest you emptied stays open: the world's chests are made new on loading, shut)
  game.on('characterStart', () => {
    const done = game.state?.char?.world?.chests, objs = game.surface?.objects?.byId;
    if (!done || !objs) return;
    for (const o of objs.values()) if (o.kind === 'chest' && done['chest_' + (o.key || `${Math.round(o.x)}_${Math.round(o.y)}`)]) o.opened = true;
  });

  game.containers = { open, contents, isEmpty: (key, kind, o) => isEmpty(contents(key, kind, o)), forget: (key) => { delete store()[key]; } };
}
