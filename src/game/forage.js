// Foraging: pick coconuts, bananas, mangoes, apples and cherries from the
// trees that bear them (E next to the tree). Fruit grows back in two days.
import { fruitOf, fruitKey, isPicked, fruitPicked, fruitCount, PICKED, REGROW_DAYS, devilOn } from '../world/fruitTrees.js';
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
    const v3 = game.view3d?.active ? game.view3d : null;
    const ray = v3?.aimRay ? v3.aimRay() : null;
    const day = game.env.day;
    let best = null;
    for (const o of w.objects.near(p.x, p.y, 4, (o) => o.kind === 'tree')) {
      const fr = fruitOf(o);
      if (!fr) continue;
      const reach = w.distance(p.x, p.y, o.x, o.y) - 0.5 * (o.s || 1);
      if (reach > 2.6) continue;
      if (ray && o._fruitPts) {
        // the fruit under the crosshair
        const s = o.s || 1, cy = Math.cos(o._yaw || 0), sy = Math.sin(o._yaw || 0);
        for (let i = 0; i < o._fruitPts.length; i++) {
          if (fruitPicked(w.id, o, i, day)) continue;
          const [px, py, pz] = o._fruitPts[i];
          const fx = o.x + (px * cy + pz * sy) * s, fy = o.y + (-px * sy + pz * cy) * s, fh = (o._gy || 0) + py * s;
          const vx = w.dx(ray.x, fx), vy = fy - ray.y, vh = fh - ray.h;
          const t = vx * ray.dx + vy * ray.dy + vh * ray.dh;
          if (t < 0.2 || t > 9) continue;
          const miss = Math.hypot(vx - ray.dx * t, vy - ray.dy * t, vh - ray.dh * t);
          const tol = 0.2 + t * 0.03;
          if (miss > tol) continue;
          const score = miss / tol;
          if (!best || score < best.score) best = { o, fr, i, score, x: fx, y: fy, h: fh };
        }
      } else if (!ray && !isPicked(w.id, o, day)) {
        // no view to aim with: the nearest laden tree
        const score = reach / 2.6;
        if (!best || score < best.score) best = { o, fr, i: -1, score, x: o.x, y: o.y };
      }
    }
    if (!best) return other;
    const one = best.i >= 0;
    // (the one with the strange swirls)
    const devil = one && best.o._devil === best.i && devilOn(w.id, best.o);
    const label = devil ? `Pick the strange swirled ${SWIRLED[best.fr] || 'fruit'}` : one ? `Pick the ${NAME[best.fr] || best.fr}` : `Pick ${PLURAL[best.fr] || best.fr}`;
    const mine = { d: best.score * 0.4, x: best.x, y: best.y, label, run: () => (devil ? pickDevil(game, best.o, devil, best.i, best.h) : pick(game, best.o, best.fr, best.i, best.h)) };
    return !other || mine.d < other.d ? mine : other;
  };
}

// one fruit — or, for bananas and cherries, one bunch
const NAME = { coconut: 'coconut', banana: 'bunch of bananas', mango: 'mango', apple: 'apple', cherry: 'cherries' };
const SWIRLED = { coconut: 'coconut', banana: 'bananas', mango: 'mango', apple: 'apple', cherry: 'fruit' };

/** Picking the Devil Fruit hanging in a tree: game.devilPicked (content/fruits.js) takes it from there. */
function pickDevil(game, o, df, i, h) {
  const p = game.player, w = game.world;
  if (!game.devilPicked?.(o, df)) return;
  // (its place on the branch is bare until a fruit grows back there)
  const c = game.state.char, back = game.env.day + REGROW_DAYS, key = fruitKey(w.id, o) + '#' + i;
  PICKED.set(key, back);
  (c.world.picked ||= {})[key] = back;
  p.facing = Math.atan2(o.y - 1.5 - p.y, w.dx(p.x, o.x));
  const z = h !== null ? Math.max(0.5, h - (o._gy || 0)) : 2;
  game.fx.burst(o.x, o.y, 14, { z, color: ['#ce93d8', '#fff59d', '#aed581'], speed: 3, vz: 1.4, g: 5, life: 0.8, kind: 'star', size: 0.12 });
  game.audio?.sfx('equip');
}
const YIELD = { banana: 2, cherry: 2 };

function pick(game, o, fruit, i = -1, h = null) {
  const c = game.state.char, p = game.player, w = game.world, day = game.env.day;
  if (!ITEMS[fruit]) return;
  const all = i < 0;
  const which = all ? [...Array(fruitCount(o)).keys()].filter((k) => !fruitPicked(w.id, o, k, day)) : [i];
  if (!which.length || (!all && fruitPicked(w.id, o, i, day))) return;
  const n = which.length * (YIELD[fruit] || 1);
  if (!addItem(game, fruit, n, { silent: true })) return;
  const have = c.inventory.filter((it) => it.id === fruit).reduce((s, it) => s + (it.qty || 1), 0);
  const nm = n > 1 ? PLURAL[fruit] || fruit : ITEMS[fruit].name.toLowerCase();
  game.log(`You pick ${n} ${nm} — ${have} in your bag.`, '#c5e1a5');
  game.fx.text(p.x, p.y, `+${n} ${ITEMS[fruit].name}`, '#c5e1a5', 0.36, { life: 1.3 });
  const back = day + REGROW_DAYS;
  c.world.picked = c.world.picked || {};
  for (const k of which) {
    const key = fruitKey(w.id, o) + '#' + k;
    PICKED.set(key, back);
    c.world.picked[key] = back;
  }
  o._fruitRefresh?.(game.env);
  p.facing = Math.atan2(o.y - 1.5 - p.y, w.dx(p.x, o.x));
  const z = h !== null ? Math.max(0.5, h - (o._gy || 0)) : 2;
  game.fx.burst(o.x, o.y, 8, { z, color: ['#7cb342', '#aed581'], speed: 2.5, vz: 1, g: 6, life: 0.6, kind: 'leaf', size: 0.12 });
  game.audio?.sfx('equip');
  game.emit('foraged', fruit, n);
}
