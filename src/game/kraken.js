// The Kraken: a giant octopus of the Grand Line and the New World, the kind
// that wraps its arms round a ship and drags at her (Surume, the Sunny's
// tangle on the way down to Fish-Man Island). It comes up beside you and
// stays with you; its arms rise out of the sea, hang over the deck and come
// crashing down where you stand; now and then it takes hold of the hull with
// half of them, so she barely moves and her timbers groan, until you've hurt
// it enough to make it let go. Badly hurt it squirts a cloud of ink and sinks
// away.
//
// Its arms are data the 3D view (render3d/chars/kraken.js) follows: `arms`,
// one per arm — mode 'idle' (waving in the swell), 'slam' (a blow: raised
// over the target, then down on it at `strikeT`) or 'grip' (over the
// gunwale, holding on), with the world point it reaches for.
import { Actor } from './actor.js';
import { addItem } from './inventory.js';
import { hullGap } from '../world/hull.js';

const TAU = Math.PI * 2;
export const KRAKEN_ARMS = 8;

export function makeKraken(game, x, y, level, opts = {}) {
  const k = new Actor({
    x, y, name: opts.name || (level > 60 ? 'Great Kraken' : 'Kraken'), title: opts.title || 'Devourer of ships', faction: 'seaking',
    look: { race: 'kraken' }, attrs: { str: level, agi: Math.round(level * 0.4), end: level, vit: level, wil: level * 0.5 }, hpMul: opts.hpMul || 6,
    boss: !!opts.boss, poise: true,
  });
  k.game = game;
  k.r = 2.2;
  k.hurtR = 5.5; // (its arms are all round you: a blow at any of them hurts it)
  k.swimmer = true;
  k.level = level;
  k.bodyColor = opts.color || ['#b0413e', '#8e3b6a', '#c0603a', '#7a4a8e'][Math.floor(Math.random() * 4)];
  k.kbResist = 0;
  k.passable = (w, px, py) => w.isLiquid(px, py) && !w.isOverlay(px, py);
  k.canOccupy = function (w, px, py) { return this.passable(w, px, py); };
  k.updateWater = () => {};
  k.arms = Array.from({ length: KRAKEN_ARMS }, (_, i) => ({ mode: 'idle', x: x, y: y, h: 0, t: 0, strikeT: 1, a: (i / KRAKEN_ARMS) * TAU }));
  k.controller = new KrakenBrain();
  k.showName = true;
  k.lethal = true;
  k.aggroPlayer = true;
  k.onKO = (a, att, g) => {
    g.fx.burst(a.x, a.y, 50, { color: ['#1a1220', '#2b2030', '#3d2f45'], speed: 5, vz: 2, g: 1, life: 2.2, size: 0.5, kind: 'smoke', grow: 2 });
    if (att?.isPlayer || att?.crewId) {
      addItem(g, 'sea_king_steak', 2);
      g.log('The Kraken lets go and sinks into the dark. You hacked off enough of an arm for a feast.', '#ffe082');
    }
    for (const arm of a.arms) arm.mode = 'idle';
    setTimeout(() => { a.alive = false; }, 3000);
  };
  return k;
}

class KrakenBrain {
  constructor() { this.slamT = 2.5; this.gripT = 9 + Math.random() * 5; this.grip = null; this.inked = false; this.fleeing = 0; }

  /** Where it holds station: off the side of your ship, or a little way off a swimmer. */
  anchor(k, game, p) {
    const w = game.world, s = p.mode === 'sail' && p.ship && !p.ship.sunk ? p.ship : p.deck?.ship || null;
    if (s) {
      const side = Math.sign(Math.sin(s.heading - Math.atan2(k.y - s.y, w.dx(s.x, k.x)))) || 1;
      const off = (s.def.beam || 4) * 0.5 + 5.5;
      return { x: w.wx(s.x + Math.cos(s.heading - side * Math.PI / 2) * off), y: s.y + Math.sin(s.heading - side * Math.PI / 2) * off, ship: s };
    }
    const a = Math.atan2(k.y - p.y, w.dx(p.x, k.x));
    return { x: w.wx(p.x + Math.cos(a) * 7), y: p.y + Math.sin(a) * 7, ship: null };
  }

  update(k, dt, game) {
    const p = game.player, w = game.world;
    k.intent.mx = 0; k.intent.my = 0;
    for (const arm of k.arms) arm.t += dt;
    if (k.state !== 'idle') return;
    const d = w.distance(k.x, k.y, p.x, p.y);
    if (d > 80) { k.alive = false; return; }
    // badly hurt: a cloud of ink, and down it goes
    if (!this.inked && k.hp < k.d.maxHp * 0.3) {
      this.inked = true; this.fleeing = 4;
      this.release(k, game);
      game.fx.burst(k.x, k.y, 60, { color: ['#120c18', '#231a2b', '#35283f'], speed: 4, vz: 1.5, g: 0.5, life: 3, size: 0.6, kind: 'smoke', grow: 2.4 });
      game.log('The Kraken squirts a cloud of black ink and sinks away!', '#b39ddb');
      for (const arm of k.arms) arm.mode = 'idle';
    }
    if (this.fleeing > 0) {
      this.fleeing -= dt;
      k.submerged = true;
      if (this.fleeing <= 0) k.alive = false;
      return;
    }
    const A = this.anchor(k, game, p);
    k.facing = Math.atan2(p.y - k.y, w.dx(k.x, p.x));
    const ax = w.dx(k.x, A.x), ay = A.y - k.y, ad = Math.hypot(ax, ay);
    if (this.grip) {
      // holding on: it goes where she goes
      k.x = w.wx(k.x + ax * Math.min(1, dt * 3)); k.y += ay * Math.min(1, dt * 3);
    } else if (ad > 1) { const sp = Math.min(1.6, ad / 3); k.intent.mx = (ax / ad) * sp; k.intent.my = (ay / ad) * sp; }
    // the arms with nothing to do wave over the water round it
    const free = k.arms.filter((a) => a.mode === 'idle');
    for (const [i, arm] of k.arms.entries()) if (arm.mode === 'idle') { arm.x = k.x; arm.y = k.y; arm.a = (i / KRAKEN_ARMS) * TAU + Math.sin(game.time * 0.3 + i) * 0.2; }
    // a blow: an arm up over you, then down
    this.slamT -= dt;
    if (this.slamT <= 0 && d < 22 && free.length) {
      this.slamT = (this.grip ? 1.6 : 2.6) + Math.random() * 1.4;
      const arm = free[Math.floor(Math.random() * free.length)];
      const tx = w.wx(p.x + (Math.random() - 0.5) * 0.8), ty = p.y + (Math.random() - 0.5) * 0.8;
      const th = p.feetH ? p.feetH(game) : (p.z || 0);
      Object.assign(arm, { mode: 'slam', x: tx, y: ty, h: th, t: 0, strikeT: 1.15 });
      game.fx.telegraph(tx, ty, 'circle', { r: 2.2, life: 1.15, color: 'rgba(255,40,40,1)' });
      const ship = A.ship;
      setTimeout(() => {
        if (!k.alive || k.state !== 'idle' || arm.mode !== 'slam') return;
        const dmg = 50 * (1 + k.attrs.str / 25);
        game.combat.hitbox({ owner: k, x: tx, y: ty - 0.3, shape: 'circle', range: 2.2, damage: dmg * 0.45, knockback: 11, stun: 0.6, heavy: true, duration: 0.12, radial: true });
        if (ship && hullGap(ship, w.dx(ship.x, tx), ty - ship.y) < 1.5) ship.damage(dmg * 0.6, k);
        game.fx.burst(tx, ty, 26, { color: ['#e1f5fe', '#ffffff', '#81d4fa'], speed: 6, vz: 6, g: 12, life: 0.8, size: 0.2 });
        game.fx.shake(0.55);
        game.audio?.sfx('crash', { x: tx, y: ty });
      }, 1150);
      setTimeout(() => { if (arm.mode === 'slam') arm.mode = 'idle'; }, 2300);
    }
    // the grip: half its arms over her gunwales — she's held fast till it's hurt enough to let go
    if (A.ship && !this.grip) {
      this.gripT -= dt;
      if (this.gripT <= 0 && w.distance(k.x, k.y, A.x, A.y) < 4) this.take(k, game, A.ship);
    }
    if (this.grip) {
      const G = this.grip, s = G.ship;
      G.t += dt;
      s.speed *= Math.max(0, 1 - dt * 3);
      // its arms ride the hull along with her
      for (const [j, arm] of G.arms.entries()) {
        const u = (j / Math.max(1, G.arms.length - 1) - 0.5) * (s.def.length || 12) * 0.5;
        const c = Math.cos(s.heading), sn = Math.sin(s.heading);
        arm.x = w.wx(s.x + c * u - sn * G.side * (s.def.beam || 4) * 0.15); arm.y = s.y + sn * u + c * G.side * (s.def.beam || 4) * 0.15;
        arm.h = G.deckH;
      }
      if (G.t > G.tick) { G.tick += 1.5; s.damage(8 * (1 + k.attrs.str / 40), k); game.fx.shake(0.25); game.audio?.sfx('hull_creak', { x: s.x, y: s.y }); }
      // hurt it enough, or it's held on long enough: it lets go
      if (k.hp < G.hp0 - k.d.maxHp * 0.12 || G.t > 9 || s.sunk) this.release(k, game, k.hp < G.hp0 - k.d.maxHp * 0.12);
    }
  }

  take(k, game, s) {
    const w = game.world, p = game.player;
    const arms = k.arms.filter((a) => a.mode === 'idle').slice(0, 4);
    if (arms.length < 2) return;
    const side = Math.sign(Math.sin(Math.atan2(k.y - s.y, w.dx(s.x, k.x)) - s.heading)) || 1;
    const deckH = p.deck?.ship === s && p.feetH ? p.feetH(game) : 2.2;
    for (const a of arms) Object.assign(a, { mode: 'grip', t: 0 });
    this.grip = { ship: s, arms, t: 0, tick: 1, hp0: k.hp, side, deckH };
    game.fx.shake(0.6);
    game.log('The Kraken wraps its arms round the hull! She\'s held fast — hurt it to make it let go!', '#ff8a80');
    game.audio?.sfx('crash', { x: s.x, y: s.y });
  }

  release(k, game, hurt = false) {
    if (!this.grip) return;
    for (const a of this.grip.arms) a.mode = 'idle';
    this.grip = null;
    this.gripT = 12 + Math.random() * 6;
    if (hurt) game.log('The Kraken lets go of the hull!', '#ffe082');
  }
}
