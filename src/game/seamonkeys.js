// Sea Monkeys (Umi Zaru): a troop of giant monkeys out on the Grand Line,
// shoulder-deep in the sea and playing — slapping the water, ducking under
// and bobbing up, grinning — and every time one slaps the sea a great wave
// rolls out across it. They mean no harm; it's their game. But a wave that
// reaches your ship heels her right over and sends spray across the deck,
// and the troop drifts along with you for a while before they lose interest
// and swim off. (You can't fight them — they're out of reach and they're not
// trying to hurt anyone. Sail away from them, or ride it out.)
//
// One actor for the whole troop; `monkeys` (where each is, relative to the
// troop, and when it last slapped) for the 3D view
// (render3d/chars/seamonkey.js).
import { Actor } from './actor.js';

const TAU = Math.PI * 2;
const WAVE_SPEED = 14; // m/s, the wave rolling out over the sea

export function makeSeaMonkeys(game, x, y) {
  const k = new Actor({
    x, y, name: 'Sea Monkeys', title: 'Giants at play', faction: 'beast',
    look: { race: 'seamonkey' }, attrs: { str: 40, agi: 10, end: 60, vit: 60, wil: 5 }, hpMul: 20,
  });
  k.game = game;
  k.r = 6;
  k.swimmer = true;
  k.invulnerable = true; // (far too big, and out of reach)
  k.noTarget = true;
  k.passable = (w, px, py) => w.isLiquid(px, py) && !w.isOverlay(px, py);
  k.canOccupy = function (w, px, py) { return this.passable(w, px, py); };
  k.updateWater = () => {};
  const n = 3;
  k.monkeys = Array.from({ length: n }, (_, i) => ({ dx: Math.cos((i / n) * TAU) * 15, dy: Math.sin((i / n) * TAU) * 15, slapT: -9, duck: 0, seed: i * 2.3 + Math.random() }));
  k.controller = new MonkeyBrain();
  k.showName = false;
  return k;
}

class MonkeyBrain {
  constructor() { this.t = 0; this.slapT = 3; this.waves = []; this.life = 50 + Math.random() * 20; }
  update(k, dt, game) {
    const p = game.player, w = game.world;
    this.t += dt;
    k.intent.mx = 0; k.intent.my = 0;
    const d = w.distance(k.x, k.y, p.x, p.y);
    const leaving = this.t > this.life;
    if (d > 140 || (leaving && d > 80)) { k.alive = false; return; }
    // keep company with you some 30-40 m off — or, tired of it, swim off
    const dx = w.dx(k.x, p.x), dy = p.y - k.y;
    if (leaving) { k.intent.mx = -dx / d; k.intent.my = -dy / d; }
    else if (d > 58) { k.intent.mx = (dx / d) * 0.9; k.intent.my = (dy / d) * 0.9; }
    else if (d < 40) { k.intent.mx = (-dx / d) * 0.6; k.intent.my = (-dy / d) * 0.6; }
    k.facing = Math.atan2(dy, dx);
    for (const m of k.monkeys) m.duck = Math.max(0, m.duck - dt);
    // a slap: the water thrown up, and a wave rolling out from it
    this.slapT -= dt;
    if (this.slapT <= 0 && !leaving) {
      this.slapT = 4.5 + Math.random() * 3;
      const m = k.monkeys[Math.floor(Math.random() * k.monkeys.length)];
      m.slapT = game.time;
      const sx = w.wx(k.x + m.dx), sy = k.y + m.dy;
      setTimeout(() => {
        if (!k.alive) return;
        game.fx.burst(sx, sy, 50, { color: ['#e1f5fe', '#ffffff', '#81d4fa'], speed: 9, vz: 10, g: 12, life: 1.3, size: 0.35 });
        game.fx.ring(sx, sy, 2, 90, 'rgba(225,245,254,0.85)', 90 / WAVE_SPEED, 1.6, { flat: 0.6 });
        game.audio?.sfx('splash_big', { x: sx, y: sy });
        this.waves.push({ x: sx, y: sy, t: 0, hit: false });
        if (Math.random() < 0.35) { const o = k.monkeys[Math.floor(Math.random() * k.monkeys.length)]; o.duck = 1.6; }
      }, 450);
    }
    // the waves rolling out: the one that reaches her heels her over
    const s = p.mode === 'sail' && p.ship && !p.ship.sunk ? p.ship : p.deck?.ship || null;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.t += dt;
      const R = wv.t * WAVE_SPEED;
      if (R > 95) { this.waves.splice(i, 1); continue; }
      if (wv.hit) continue;
      if (s) {
        const sd = w.distance(wv.x, wv.y, s.x, s.y);
        if (R >= sd - (s.def.beam || 4) * 0.5) {
          wv.hit = true;
          const dir = Math.atan2(s.y - wv.y, w.dx(wv.x, s.x));
          const k2 = Math.max(0.05, 0.24 * (1 - sd / 110)) * (s.def.length >= 30 ? 0.6 : 1);
          s.waveHit(dir, k2);
          game.fx.burst(s.x, s.y, 36, { color: ['#e1f5fe', '#ffffff'], speed: 5, vz: 7, g: 12, life: 1, size: 0.25 });
          game.fx.shake(0.35);
          game.audio?.sfx('hull_slap', { x: s.x, y: s.y });
          if (!this.told) { this.told = true; game.log('A wave from the Sea Monkeys\' game slams into the ship! Steer clear of them, or hold on tight!', '#81d4fa'); }
        }
      } else if (p.inWater && w.distance(wv.x, wv.y, p.x, p.y) <= R) {
        // a swimmer: tumbled away in it
        wv.hit = true;
        const a = Math.atan2(p.y - wv.y, w.dx(wv.x, p.x));
        p.vx = (p.vx || 0) + Math.cos(a) * 6; p.vy = (p.vy || 0) + Math.sin(a) * 6;
        game.fx.shake(0.25);
      }
    }
  }
}
