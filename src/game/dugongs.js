// The Kung-Fu Dugongs of Alabasta's Sandora shore (the sign on the beach
// warns you): little round sea-cows in turtle shells who stand up on their
// tails and fight like kung-fu masters. Come near and one bows, takes its
// stance and challenges you — flipper chops, a spinning tail kick, a flip
// back out of reach. Beat it and it doesn't go down: it bows to you, and
// now you're its master. The whole troop follows you about the shore after
// that, copying your moves when you fight, and when you leave the island
// they line up at the water's edge and wave you off in floods of tears.
// (Your mastery's remembered: come back and they greet their master.)
import { Actor } from './actor.js';

const TROOP = 5;
const NEAR = 70; // m from the beach: the troop's there while you are

export function installDugongs(game) {
  const D = { troop: [], island: null, farewell: false };
  game.dugongs = D;
  const clear = () => { for (const k of D.troop) k.alive = false; D.troop.length = 0; D.island = null; };
  game.on('characterStart', clear);
  game.on('enterZone', clear);
  game.on('tick', (dt) => {
    const p = game.player, c = game.state?.char;
    if (!p || !c || game.world !== game.surface) return;
    const isl = game.currentIsland;
    const beach = isl?.spots?.dugong_beach;
    D.troop = D.troop.filter((k) => k.alive);
    if (!beach) {
      if (D.troop.length && !D.farewell && c.flags?.dugongMaster) {
        D.farewell = true;
        game.log('Back on the shore, the Kung-Fu Dugongs line up at the water\'s edge, waving their flippers and sobbing as their master sails away.', '#ffe082');
      }
      if (D.troop.length && D.island && game.world.distance(p.x, p.y, D.island.x, D.island.y) > (D.island.radius || 120) + 150) clear();
      return;
    }
    D.farewell = false;
    const d = game.world.distance(p.x, p.y, beach.x, beach.y);
    if (!D.troop.length && d < NEAR + 40) spawnTroop(game, D, isl, beach);
  });
  return D;
}

function spawnTroop(game, D, isl, beach) {
  const w = game.world, c = game.state.char;
  D.island = isl;
  for (let i = 0; i < TROOP; i++) {
    // on the sand round the sign, between it and the water
    let x = beach.x, y = beach.y;
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
      const tx = w.wx(beach.x + Math.cos(a) * r), ty = beach.y + Math.sin(a) * r;
      if (!w.isBlocked(tx, ty) && !w.isLiquid(tx, ty)) { x = tx; y = ty; break; }
    }
    const k = game.addActor(makeDugong(game, x, y, i));
    k.home = { x, y };
    if (c.flags?.dugongMaster) k.disciple = true;
    D.troop.push(k);
  }
}

export function makeDugong(game, x, y, i = 0) {
  const k = new Actor({
    x, y, name: 'Kung-Fu Dugong', title: 'Master of the Sandora shore', faction: 'beast',
    look: { race: 'dugong' }, attrs: { str: 8, agi: 12, end: 6, vit: 6, wil: 3 }, hpMul: 1.4,
  });
  k.game = game;
  k.r = 0.45;
  k.dugong = true;
  k.seed = i * 1.37 + Math.random();
  k.kbResist = 0.8;
  k.controller = new DugongBrain(i);
  k.showName = true;
  k.yieldHp = 1;
  k.onYield = (a, att, g) => becomeMaster(g, a, att);
  return k;
}

/** Beaten: it bows — you're its master, and the troop's. */
function becomeMaster(game, k, att) {
  const c = game.state?.char;
  k.provoked = false; k.challenger = false; k.action = null;
  k.hp = k.d.maxHp;
  k.bowT = 2.2;
  game.combat?.cancelBlows?.(k);
  if (!att?.isPlayer) return;
  if (c) { c.flags ||= {}; c.flags.dugongMaster = true; }
  for (const o of game.dugongs?.troop || []) { o.disciple = true; o.provoked = false; o.challenger = false; o.bowT = 2.2; }
  game.fx.text(k.x, k.y - 1.2, 'MASTER!', '#ffe082', 0.5, { life: 1.6 });
  game.ui?.banner?.('KUNG-FU DUGONGS', '', 'It bows to you — you\'re their master now! The whole troop follows you.', 3);
  game.log('The Kung-Fu Dugong drops its stance and bows low. The whole troop bows with it: you\'re their master now.', '#ffe082');
  game.audio?.sfx('reveal');
}

class DugongBrain {
  constructor(i) { this.i = i; this.t = 1 + Math.random() * 2; this.kata = 0; }
  update(k, dt, game) {
    const p = game.player, w = game.world;
    k.intent.mx = 0; k.intent.my = 0;
    if (k.state !== 'idle') return;
    k.bowT = Math.max(0, (k.bowT || 0) - dt);
    k.kataT = Math.max(0, (k.kataT || 0) - dt);
    const dx = w.dx(k.x, p.x), dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
    if (k.bowT > 0) { k.facing = Math.atan2(dy, dx); return; }
    // a disciple: follows its master about, in a little line behind; copies your moves
    if (k.disciple) {
      const back = p.facing + Math.PI + (this.i - 2) * 0.35, r = 2.2 + this.i * 0.7;
      const tx = p.x + Math.cos(back) * r, ty = p.y + Math.sin(back) * r;
      const ex = w.dx(k.x, tx), ey = ty - k.y, ed = Math.hypot(ex, ey);
      const home = k.home && w.distance(k.x, k.y, k.home.x, k.home.y) > NEAR;
      if (ed > 0.8 && !p.inWater && !home && !p.ship) { k.intent.mx = ex / ed * Math.min(1, ed / 3); k.intent.my = ey / ed * Math.min(1, ed / 3); }
      if (ed < 3) k.facing += (Math.atan2(Math.sin(p.facing - k.facing), Math.cos(p.facing - k.facing))) * Math.min(1, dt * 4);
      else k.facing = Math.atan2(ey, ex);
      if (p.action && !k.kataT) { k.kataT = 0.6; k.mimic = game.time; }
      return;
    }
    // a challenger: you came close — it bows, takes its stance, and fights
    // (hit one first and it takes that as the challenge)
    if (!k.challenger && k.provoked) k.challenger = true;
    if (!k.challenger) {
      // practising its forms on the sand till someone comes along
      this.t -= dt;
      if (this.t <= 0) { this.t = 2 + Math.random() * 3; k.kataT = 1.2; k.mimic = game.time; }
      if (d < 7 && p.state === 'idle' && !p.inWater && !p.ship && game.dugongs?.troop.every((o) => !o.challenger)) {
        k.challenger = true; k.bowT = 1.2; k.provoked = true;
        game.fx.text(k.x, k.y - 1.1, 'HYAAH!', '#ffcc80', 0.42, { life: 1.2 });
        game.log('A Kung-Fu Dugong bows, then drops into a fighting stance. It\'s challenging you!', '#ffcc80');
        game.hint?.('dugong', 'Beat a Kung-Fu Dugong in a fair fight and it becomes your disciple — and so does its whole troop.');
      }
      return;
    }
    if (d > 25 || p.inWater || p.state !== 'idle') { k.challenger = false; k.provoked = false; return; }
    k.facing = Math.atan2(dy, dx);
    if (k.action) return;
    this.t -= dt;
    if (d > 1.6) { k.intent.mx = dx / d; k.intent.my = dy / d; }
    if (this.t <= 0 && d < 2.2) {
      // a flipper chop, or the spinning tail kick
      const spin = Math.random() < 0.35;
      this.t = 1.1 + Math.random() * 0.9;
      const def = { anim: 'light', steps: [], windup: spin ? 0.4 : 0.28, recover: 0.35, dugong: spin ? 'spin' : 'chop' };
      k.action = { def, t: 0, step: 0, total: def.windup + def.recover, mult: 1, angle: k.facing };
      setTimeout(() => {
        if (!k.alive || k.state !== 'idle' || k.disciple || !k.challenger) return;
        const hx = k.x + Math.cos(k.facing) * 0.9, hy = k.y + Math.sin(k.facing) * 0.9;
        game.combat.hitbox({ owner: k, x: spin ? k.x : hx, y: spin ? k.y : hy, shape: 'circle', range: spin ? 1.6 : 1.0, damage: spin ? 9 : 6, knockback: spin ? 6 : 3, stun: 0.25, duration: 0.1, radial: spin });
        game.audio?.sfx('punch', { x: hx, y: hy });
      }, def.windup * 1000);
    } else if (this.t <= 0 && d < 3.5 && Math.random() < 0.02) {
      // a flip back out of reach
      k.dash = { vx: -dx / d * 7, vy: -dy / d * 7, t: 0.25 };
      k.flipT = game.time;
    }
  }
}
