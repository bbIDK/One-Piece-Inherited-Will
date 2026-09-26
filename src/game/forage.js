// Foraging: pick coconuts, bananas, mangoes, apples and cherries from the
// trees that bear them (E next to the tree). Fruit grows back in two days.
import { fruitOf, fruitKey, isPicked, PICKED, REGROW_DAYS } from '../world/fruitTrees.js';
import { addItem } from './inventory.js';
import { ITEMS } from '../data/items.js';

const PLURAL = { coconut: 'coconuts', banana: 'bananas', mango: 'mangoes', apple: 'apples', cherry: 'cherries' };

export function installForaging(game) {
  const load = () => {
    PICKED.clear();
    const saved = game.state?.char?.world?.picked || {};
    for (const [k, d] of Object.entries(saved)) PICKED.set(k, d);
  };
  game.on('characterStart', load);
  game.on('newDay', () => {
    // forget trees that have grown back so the save stays small
    const c = game.state?.char;
    if (!c?.world?.picked) return;
    for (const [k, d] of Object.entries(c.world.picked)) if (game.env.day >= d) { delete c.world.picked[k]; PICKED.delete(k); }
  });

  const prevFoot = game.footInteraction;
  game.footInteraction = (p) => {
    const other = prevFoot ? prevFoot(p) : null;
    const w = game.world;
    if (!w.objects || p.mode !== 'foot') return other;
    let best = null, bd = 1.9;
    for (const o of w.objects.near(p.x, p.y, 2.2, (o) => o.kind === 'tree')) {
      const fr = fruitOf(o);
      if (!fr || isPicked(w.id, o, game.env.day)) continue;
      // trees block their base tile: measure to the trunk, a little above the base
      const d = w.distance(p.x, p.y, o.x, o.y - 0.3);
      if (d < bd) { bd = d; best = { o, fr }; }
    }
    if (!best) return other;
    const mine = { d: bd + 0.4, label: `Pick ${PLURAL[best.fr] || best.fr}`, run: () => pick(game, best.o, best.fr) };
    return !other || mine.d < other.d ? mine : other;
  };
}

function pick(game, o, fruit) {
  const c = game.state.char, p = game.player, w = game.world;
  if (isPicked(w.id, o, game.env.day)) return;
  const n = fruit === 'cherry' ? 3 : fruit === 'coconut' ? 1 + (Math.random() < 0.5 ? 1 : 0) : 1 + Math.floor(Math.random() * 2);
  if (!ITEMS[fruit]) return;
  addItem(game, fruit, n, { silent: true });
  game.log(`You pick ${n} ${n > 1 ? PLURAL[fruit] || fruit : ITEMS[fruit].name.toLowerCase()}.`, '#c5e1a5');
  const key = fruitKey(w.id, o);
  const back = game.env.day + REGROW_DAYS;
  PICKED.set(key, back);
  c.world.picked = c.world.picked || {};
  c.world.picked[key] = back;
  p.facing = Math.atan2(o.y - 1.5 - p.y, w.dx(p.x, o.x));
  game.fx.burst(o.x, o.y - 2, 8, { color: ['#7cb342', '#aed581'], speed: 2.5, vz: 1, g: 6, life: 0.6, kind: 'leaf', size: 0.12 });
  game.audio?.sfx('equip');
  game.emit('foraged', fruit, n);
}
