// What a fight does to a town — for a while. Your blows, shots, blasts and
// fields knock pieces off the buildings they reach, and enough of it brings
// one down: it falls to pieces (the 3D view: render3d/debris3d.js), dust
// rolls out, whoever was inside is caught under it, and only a heap of
// rubble is left standing on its plot. The bigger the move — and moves grow
// with their user's mastery, Haki and awakening (abilities.js techScale) —
// the more it wrecks: a novice's punch chips a wall, a master's quake levels
// the street, and Whitebeard's awakened Sky Tilt takes the whole island.
// The town is rebuilt in time (the townsfolk at it), longer the worse it was.
//
// The world's queue `ruinEvents` tells the 3D view what to show:
//   { kind: 'chip', b, x, y, n }      — bits knocked off b near (x, y)
//   { kind: 'fall', b, x, y, power }  — b brought down, from (x, y)
//   { kind: 'restore', b }            — b standing again
import { techScale } from './abilities.js';
import { bfoot } from '../world/bframe.js';

/** Seconds a ruin stands before it's rebuilt (the least of it: bigger blows leave longer ruins). */
export const REBUILD = 300;

/** A building's strength: its size (floor × height), so a shed goes in a blow or two and a fort takes a beating. */
export function buildingHp(b) {
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3), H = 2.6 + Math.max(1, (b.hgt || 2) - 1) * 2.6;
  return Math.round(fw * fd * H * 2.2);
}

/** Can a blow of this owner's wreck buildings? Yours, and what you've summoned. */
export const wrecker = (o) => !!o && (o.isPlayer || o.summonedBy?.isPlayer);

/**
 * How much a hit of `h` does to a building: its damage, ×3 for a Devil Fruit
 * power, ×1.2 for a weapon or style technique, about a third for a plain blow (M1),
 * and grown with the move (techScale²: a bigger blast hits a wall harder too).
 */
export function structPower(h) {
  const def = h.def || h.owner?.action?.def;
  const src = def?.source || '';
  const k = src.startsWith('fruit') ? 3 : def?.m1 ? 0.3 : def ? 1.2 : 0.25;
  const f = h.owner && def ? techScale(h.owner, def) : 1;
  return (h.damage || 0) * k * f * f * (h.blast || h.heavy ? 1.3 : 1);
}

export function installDestruction(game) {
  const D = {
    /** The rect a building stands on, as world { x0, y0, x1, y1 }. */
    rect(b) { return bfoot(b); },

    /** Buildings standing within r of (x, y) (their footprints, not their middles). */
    near(x, y, r) {
      const w = game.world;
      if (!w?.objects) return [];
      const out = [];
      for (const b of w.objects.near(x, y, r + 14, (o) => o.kind === 'building' && !o.ruined && !o.unbreakable)) {
        const q = bfoot(b);
        const dx = Math.max(0, Math.abs(w.dx((q.x0 + q.x1) / 2, x)) - (q.x1 - q.x0) / 2);
        const dy = Math.max(0, Math.abs(y - (q.y0 + q.y1) / 2) - (q.y1 - q.y0) / 2);
        const d = Math.hypot(dx, dy);
        if (d <= r) out.push([b, d]);
      }
      return out;
    },

    /**
     * A blow's worth of `power` landing round (x, y), reaching r: each building
     * it reaches takes it (less towards the edge); one with nothing left falls.
     */
    strike(x, y, r, power, att, o = {}) {
      if (!(power > 0)) return 0;
      let n = 0;
      for (const [b, d] of D.near(x, y, r)) {
        const k = 1 - 0.5 * (d / Math.max(0.5, r));
        b.hp = (b.hp ?? (b.maxHp = buildingHp(b))) - power * k;
        b.hitT = game.time;
        if (b.hp <= 0) { D.collapse(b, x, y, power, att, o); n++; continue; }
        // (bits of it knocked off, more the harder it's hit)
        D.event({ kind: 'chip', b, x, y, n: Math.min(10, 2 + Math.round(power / 120)) });
        if (Math.random() < 0.5) game.audio?.sfx('wallhit', { x, y });
      }
      return n;
    },

    /** Building b brought down by a blow from (x, y). */
    collapse(b, x, y, power, att, o = {}) {
      const w = game.world;
      if (b.ruined || !w?.objects) return;
      w.objects.ruin(b);
      const q = bfoot(b), cx = (q.x0 + q.x1) / 2, cy = (q.y0 + q.y1) / 2;
      const span = Math.hypot(q.x1 - q.x0, q.y1 - q.y0) / 2;
      // a ruin stands a while: the bigger the blow that did it, the longer
      b.ruinT = game.time;
      b.rebuildAt = game.time + REBUILD * (1 + Math.min(2, power / 2500)) * (o.long || 1);
      (w.ruins ||= []).push(b);
      D.event({ kind: 'fall', b, x, y, power, delay: o.delay || 0 });
      // whoever's under it is caught (from the one who brought it down: a crime on folk who did nothing)
      game.combat?.hitbox({ owner: att || null, x: cx, y: cy, shape: 'circle', range: span + 0.5, damage: 25 + Math.min(220, power * 0.06), knockback: 6, stun: 1, element: 'physical', duration: 0.1, radial: true, heavy: true, blast: true, hitsAll: !att, crush: true });
      // dust rolling out from its feet, the crash
      const fx = game.fx;
      if (fx) {
        fx.burst(cx, cy, 26, { color: ['#d7ccc8', '#bcaaa4', '#efebe9', '#a1887f'], speed: 3 + span * 0.4, spread: Math.PI * 2, z: 0.6, vz: 1.4, g: -0.2, life: 1.8, kind: 'smoke', size: 0.9, grow: 1.6, drag: 1.6, delay: o.delay || 0 });
        const p = game.player;
        if (p && w.distance(p.x, p.y, cx, cy) < 45) fx.shake?.(Math.min(0.7, 0.25 + span * 0.04));
      }
      game.audio?.sfx('collapse', { x: cx, y: cy }, { w: Math.min(1, 0.4 + span / 12) });
      if (att?.isPlayer || att?.summonedBy?.isPlayer) {
        // (the bounty for it, all at once for a street that comes down together: see update)
        if (!b.pirate) D.wrecked.push(b);
        game.emit?.('buildingWrecked', b);
      }
    },

    /** Every building of the island round (x, y) — or in r of it — brought down, a wave rolling out from (x, y) (Whitebeard's awakened Sky Tilt). */
    levelAll(x, y, r, power, att, speed = 40) {
      const w = game.world;
      let n = 0;
      for (const [b, d] of D.near(x, y, r)) {
        D.collapse(b, x, y, power, att, { delay: d / speed, long: 1.5 });
        n++;
      }
      return n;
    },

    event(e) {
      const w = game.world;
      if (!w) return;
      (w.ruinEvents ||= []).push(e);
      if (w.ruinEvents.length > 400) w.ruinEvents.splice(0, w.ruinEvents.length - 400);
      w.ruinRev = (w.ruinRev || 0) + 1;
    },

    wrecked: [],

    /** Rebuild what's stood ruined long enough (not under your nose: once you're a little way off, or it's been a long while). */
    update() {
      const w = game.world, p = game.player;
      if (D.wrecked.length) {
        const n = D.wrecked.length, b = D.wrecked[0];
        D.wrecked.length = 0;
        game.reputation?.crime?.(250000 * n, n > 1 ? `wrecked ${n} buildings` : `wrecked ${b.name ? 'the ' + b.name : 'a house'}`, { quiet: n < 3, rep: Math.min(10, n) });
      }
      if (!w?.ruins?.length) return;
      for (let i = w.ruins.length - 1; i >= 0; i--) {
        const b = w.ruins[i];
        if (!b.ruined) { w.ruins.splice(i, 1); continue; }
        if (game.time < b.rebuildAt) continue;
        if (p && w.distance(p.x, p.y, b.x, b.y) < 30 && game.time < b.rebuildAt + 240) continue;
        if (p && w.distance(p.x, p.y, b.x, b.y) < 3 + Math.hypot(b.fw || 3, b.fd || 3)) continue; // (never rebuilt round you)
        w.objects.restore(b);
        b.hp = undefined;
        w.ruins.splice(i, 1);
        D.event({ kind: 'restore', b });
      }
    },

    /** A hitbox of yours going off: what it reaches of the town takes it (once per building per hitbox). */
    fromHitbox(h) {
      if (!wrecker(h.owner) || h.wrecked || h.crush) return;
      h.wrecked = true;
      const power = structPower(h);
      if (power < 4) return;
      const R = h.range || 1.4;
      if (h.shape === 'line') {
        const ca = Math.cos(h.angle || 0), sa = Math.sin(h.angle || 0), wd = (h.width || 1) / 2 + 0.6;
        for (let d = 0; d <= R; d += Math.max(1.5, wd)) D.strike(h.x + ca * d, h.y + 0.4 + sa * d, wd, power, h.owner);
        return;
      }
      if (h.shape === 'arc' || !h.shape) {
        // (a sweep in front of them: the half of the circle it covers)
        const a = h.angle || 0;
        D.strike(h.x + Math.cos(a) * R * 0.5, h.y + 0.4 + Math.sin(a) * R * 0.5, R * 0.6 + 0.4, power, h.owner);
        return;
      }
      D.strike(h.x, h.y + 0.4, R + 0.3, power, h.owner);
    },

    /** A shot of yours stopped by a wall: the wall takes it. */
    fromShot(p) {
      if (!wrecker(p.owner)) return;
      const power = structPower(p) * 0.8;
      if (power >= 4) D.strike(p.x, p.y, 0.8 + 0.4 * (p.size || 1), power, p.owner);
    },
  };
  game.destruction = D;
  game.on?.('tick', () => D.update());
  return D;
}
