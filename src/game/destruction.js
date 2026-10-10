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
import { floorOf } from '../world/objects.js';

/** Seconds a ruin stands before it's rebuilt (the least of it: bigger blows leave longer ruins). */
export const REBUILD = 300;

const FIRE = new Set(['fire', 'magma', 'bluefire', 'explosion']);
const ICE = new Set(['ice', 'snow']);

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

/**
 * The town's loose things a blow can smash too (trees snapped, stalls and
 * lamps knocked flat, a fountain or a well broken open): how much each takes.
 */
export const SMASH = {
  tree: 70, bush: 6, lamp: 14, barrel: 8, crate: 8, cask: 8, fountain: 140, tent: 30, windmill: 260, campfire: 6,
  well: 70, signboard: 12, stall: 30, statue: 160, bench: 10, cart: 22, fence: 8, haystack: 8, totem: 60, cactus: 18,
  mushroom: 14, mooring: 20, table: 10, scarecrow: 10, crystal: 40, rock: 120, lantern: 8, flag: 10, cannon: 60, waterwheel: 120,
};
const smashable = (o) => SMASH[o.kind] !== undefined && !o.hidden && !o.ruined && !o.far && !o.unbreakable && !o.quest;

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
      const el = o.element || 'physical';
      for (const [b, d] of D.near(x, y, r)) {
        const k = 1 - 0.5 * (d / Math.max(0.5, r));
        // (a house in ice shatters at a blow that isn't ice: the ice and the walls in it, twice over)
        let pw = power;
        if (b.frozen && !ICE.has(el)) { pw *= 2; D.shatter(b, att); if (b.ruined) { n++; continue; } }
        b.hp = (b.hp ?? (b.maxHp = buildingHp(b))) - pw * k;
        if (FIRE.has(el)) D.ignite(b, power, att);
        else if (ICE.has(el)) D.freeze(b, power, att);
        b.hitT = game.time;
        if (!b.damaged) { b.damaged = true; (game.world.damaged ||= []).push(b); }
        if (b.hp <= 0) { D.collapse(b, x, y, pw, att, o); n++; continue; }
        // (it gives a little at a time: its roof breaking up, the walls opening, the whole of it leaning — debris3d.js stage)
        const frac = b.hp / (b.maxHp || buildingHp(b)), st = frac < 0.34 ? 2 : frac < 0.67 ? 1 : 0;
        if (st > (b.stage || 0)) {
          b.stage = st;
          D.event({ kind: 'stage', b, stage: st, x, y });
          const q = bfoot(b);
          game.fx?.burst?.((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, 14, { color: ['#d7ccc8', '#bcaaa4', '#efebe9'], speed: 2.5, spread: Math.PI * 2, z: 2.5, vz: 1, g: -0.2, life: 1.4, kind: 'smoke', size: 0.8, grow: 1.4, drag: 1.6 });
          game.audio?.sfx('collapse', { x, y }, { w: 0.35 });
        }
        // (bits of it knocked off, more the harder it's hit)
        // (and a hole punched in it there, bigger the bigger the blow against how stout it is: debris3d.js hole)
        D.event({ kind: 'chip', b, x, y, n: Math.min(10, 2 + Math.round(pw / 120)), k: Math.min(1.6, 0.25 + (pw * k) / (b.maxHp || buildingHp(b)) * 2.5) });
        if (Math.random() < 0.5) game.audio?.sfx('wallhit', { x, y });
      }
      D.smashNear(x, y, r, power, att);
      return n;
    },

    /** The loose things round (x, y) a blow of `power` reaches: those it's enough for are smashed. */
    smashNear(x, y, r, power, att, o = {}) {
      const w = game.world;
      if (!w?.objects || !(power > 0)) return 0;
      let n = 0;
      for (const p of w.objects.near(x, y, r + 1, smashable)) {
        const d = w.distance(x, y, p.x, p.y);
        if (d > r + 0.6 * (p.s || 1)) continue;
        if (floorOf(p) || /dock|pier|bridge|quay|jetty|plank/.test(p.kind)) continue;
        p.hp = (p.hp ?? SMASH[p.kind] * (p.s || 1)) - power * (1 - 0.5 * d / Math.max(0.5, r));
        if (p.hp > 0) continue;
        D.smash(p, x, y, power, att, { delay: o.speed ? d / o.speed : 0, lite: o.lite, long: o.long });
        n++;
      }
      return n;
    },

    /** One loose thing smashed: gone from the world (its pieces are debris now) until the town's put right. */
    smash(p, x, y, power, att, o = {}) {
      const w = game.world;
      if (p.ruined) return;
      w.objects.ruin(p);
      p.rebuildAt = game.time + REBUILD * (1 + Math.min(2, power / 2500)) * (o.long || 1);
      (w.smashed ||= []).push(p);
      D.event({ kind: 'fixture', o: p });
      D.event({ kind: 'smash', b: p, x, y, power, delay: o.delay || 0, lite: !!o.lite });
      if (!o.delay && Math.random() < 0.5) game.audio?.sfx(p.kind === 'tree' ? 'collapse' : 'wallhit', { x: p.x, y: p.y }, { w: 0.3 });
    },

    /**
     * Fire on a building: it catches and burns a while — flames out of its
     * windows and over its roof, smoke, the walls blackening — taking damage
     * all the while; enough of it and it burns down. A bigger fire burns
     * longer. (Water, ice put it out.)
     */
    ignite(b, power, att) {
      if (b.ruined) return;
      if (b.frozen) { D.thaw(b); return; } // (fire on ice: it melts, and that's all)
      const dur = Math.min(30, 6 + power / 40);
      if (!b.burning) { b.burning = { until: game.time + dur, att, power, acc: 0 }; (game.world.burning ||= []).push(b); D.event({ kind: 'burn', b, on: true }); }
      else b.burning.until = Math.max(b.burning.until, game.time + dur * 0.6);
      b.charred = true;
    },
    /** Ice on a building: frozen solid in a shell of ice, until it shatters (with it, much of the house). */
    freeze(b, power, att) {
      if (b.ruined) return;
      if (b.burning) { D.douse(b); return; } // (ice on a fire: put out)
      const dur = Math.min(20, 5 + power / 60);
      if (!b.frozen) { b.frozen = { until: game.time + dur, att, power }; (game.world.frozen ||= []).push(b); D.event({ kind: 'ice', b, on: true }); game.audio?.sfx('ice', { x: b.x, y: b.y }); }
      else b.frozen.until = Math.max(b.frozen.until, game.time + dur * 0.5);
    },
    douse(b) { if (!b.burning) return; b.burning = null; D.event({ kind: 'burn', b, on: false }); },
    thaw(b) { if (!b.frozen) return; b.frozen = null; D.event({ kind: 'ice', b, on: false, shatter: false }); },
    /** The ice round a building breaks: the shell flies apart, and the walls it held go with it. */
    shatter(b, att) {
      const F = b.frozen;
      if (!F) return;
      b.frozen = null;
      D.event({ kind: 'ice', b, on: false, shatter: true });
      game.audio?.sfx('ice', { x: b.x, y: b.y });
      const q = bfoot(b), cx = (q.x0 + q.x1) / 2, cy = (q.y0 + q.y1) / 2;
      game.fx?.burst?.(cx, cy, 30, { color: ['#e1f5fe', '#b3e5fc', '#ffffff'], speed: 6, spread: Math.PI * 2, z: 1.5, vz: 3, g: 9, life: 1.1, kind: 'shard', size: 0.16, drag: 1 });
      // (as much again as froze it, and half the house besides: a frozen house is a brittle one)
      b.hp = (b.hp ?? (b.maxHp = buildingHp(b))) - (F.power * 1.5 + (b.maxHp || buildingHp(b)) * 0.45);
      if (b.hp <= 0) D.collapse(b, cx, cy, F.power * 2, att || F.att);
      // (and whoever stands by it takes the shards)
      game.combat?.hitbox({ owner: att || F.att || null, x: cx, y: cy, shape: 'circle', range: Math.hypot(q.x1 - q.x0, q.y1 - q.y0) / 2 + 1.5, damage: 20 + F.power * 0.05, knockback: 6, stun: 0.5, element: 'ice', duration: 0.1, radial: true, blast: true, crush: true });
    },
    /** Burning and frozen buildings, as time goes by. */
    elements(dt) {
      const w = game.world, p = game.player;
      if (w?.burning?.length) {
        for (let i = w.burning.length - 1; i >= 0; i--) {
          const b = w.burning[i], B = b.burning;
          if (!B || b.ruined) { if (B) D.douse(b); w.burning.splice(i, 1); continue; }
          // (it burns: an eighth of it a second, and down it comes when there's nothing left)
          b.hp = (b.hp ?? (b.maxHp = buildingHp(b))) - (b.maxHp || buildingHp(b)) * 0.035 * dt;
          b.hitT = game.time;
          const q = bfoot(b), cx = (q.x0 + q.x1) / 2, cy = (q.y0 + q.y1) / 2;
          if (b.hp <= 0) { D.collapse(b, cx, cy, 400, B.att); w.burning.splice(i, 1); continue; }
          if (game.time > B.until) { D.douse(b); w.burning.splice(i, 1); continue; }
          // flames licking up its walls and over its roof, and the smoke (only what you can see)
          if (p && w.distance(p.x, p.y, cx, cy) < 90 && (B.acc = (B.acc || 0) + dt) > 0.12) {
            B.acc = 0;
            const H = 2.6 + Math.max(1, (b.hgt || 2) - 1) * 2.6;
            for (let k = 0; k < 3; k++) {
              const fx0 = q.x0 + Math.random() * (q.x1 - q.x0), fy0 = q.y0 + Math.random() * (q.y1 - q.y0);
              game.fx?.burst?.(fx0, fy0, 3, { color: ['#ff6d00', '#ffab00', '#ffd54f'], speed: 0.6, z: Math.random() * H, vz: 3, g: -3, life: 0.7, kind: 'fire', size: 0.45, grow: 0.6 });
            }
            game.fx?.burst?.(cx, cy, 2, { color: ['#424242', '#616161', '#757575'], speed: 0.4, z: H + 0.5, vz: 2.2, g: -1.5, life: 2.5, kind: 'smoke', size: 0.9, grow: 1.4, drag: 0.6 });
          }
          // (whoever's inside or right against it gets burnt)
          if (Math.random() < dt * 1.5) game.combat?.hitbox({ owner: B.att || null, x: cx, y: cy, shape: 'circle', range: Math.hypot(q.x1 - q.x0, q.y1 - q.y0) / 2 + 0.4, damage: 4, knockback: 0, stun: 0, element: 'fire', status: { burn: 2 }, duration: 0.05, radial: true, crush: true });
        }
      }
      if (w?.frozen?.length) {
        for (let i = w.frozen.length - 1; i >= 0; i--) {
          const b = w.frozen[i], F = b.frozen;
          if (!F || b.ruined) { if (F) D.thaw(b); w.frozen.splice(i, 1); continue; }
          if (game.time > F.until) { w.frozen.splice(i, 1); D.shatter(b, F.att); }
        }
      }
    },

    /** Building b brought down by a blow from (x, y). */
    collapse(b, x, y, power, att, o = {}) {
      const w = game.world;
      if (b.ruined || !w?.objects) return;
      w.objects.ruin(b);
      // (and whatever's fixed to it or stood against it — its sign, its lamps, its awning, the
      // barrels by its wall, its steps — goes with it, and comes back when it's rebuilt)
      const fq = bfoot(b);
      b.fixtures = w.objects.query(fq.x0 - 1.5, fq.y0 - 1.5, fq.x1 + 1.5, fq.y1 + 1.5).filter((o) => {
        if (o === b || o.hidden || o.kind === 'building' || o.kind === 'tree' || o.far || floorOf(o) || /dock|pier|bridge|quay|jetty|plank/.test(o.kind)) return false;
        const ox = w.wx(o.x);
        return ox > fq.x0 - 1.2 && ox < fq.x1 + 1.2 && o.y > fq.y0 - 1.2 && o.y < fq.y1 + 1.2;
      });
      for (const o of b.fixtures) { w.objects.ruin(o); D.event({ kind: 'fixture', o }); }
      if (b.burning) { b.burning = null; D.event({ kind: 'burn', b, on: false }); }
      if (b.frozen) { b.frozen = null; D.event({ kind: 'ice', b, on: false, shatter: true }); }
      const q = bfoot(b), cx = (q.x0 + q.x1) / 2, cy = (q.y0 + q.y1) / 2;
      const span = Math.hypot(q.x1 - q.x0, q.y1 - q.y0) / 2;
      // a ruin stands a while: the bigger the blow that did it, the longer
      b.ruinT = game.time;
      b.rebuildAt = game.time + REBUILD * (1 + Math.min(2, power / 2500)) * (o.long || 1);
      (w.ruins ||= []).push(b);
      D.event({ kind: 'fall', b, x, y, power, delay: o.delay || 0 });
      // (and what stood round it — trees, lamps, a stall — goes down under it)
      D.smashNear(cx, cy, span + 1.5, Math.max(power, 200), att, { lite: o.long > 1 });
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
      // everything else on it flattened with the wave: trees, stalls, the fountain, the well
      n += D.smashNear(x, y, r, 1e6, att, { speed, lite: true, long: 1.5 });
      return n;
    },

    event(e) {
      const w = game.world;
      if (!w) return;
      (w.ruinEvents ||= []).push(e);
      if (w.ruinEvents.length > 12000) w.ruinEvents.splice(0, w.ruinEvents.length - 12000);
      w.ruinRev = (w.ruinRev || 0) + 1;
    },

    wrecked: [],

    /** Rebuild what's stood ruined long enough (not under your nose: once you're a little way off, or it's been a long while). */
    update() {
      const w = game.world, p = game.player;
      // walls holed but still standing are patched up after a while (not while you're beside them)
      if (w?.damaged?.length) {
        for (let i = w.damaged.length - 1; i >= 0; i--) {
          const b = w.damaged[i];
          if (b.ruined) { b.damaged = false; w.damaged.splice(i, 1); continue; }
          if (game.time - (b.hitT || 0) < REBUILD * 0.6 || (p && w.distance(p.x, p.y, b.x, b.y) < 20)) continue;
          b.hp = undefined; b.stage = 0; b.damaged = false; b.charred = false; w.damaged.splice(i, 1);
          D.event({ kind: 'restore', b });
        }
      }
      if (D.wrecked.length) {
        const n = D.wrecked.length, b = D.wrecked[0];
        D.wrecked.length = 0;
        game.reputation?.crime?.(250000 * n, n > 1 ? `wrecked ${n} buildings` : `wrecked ${b.name ? 'the ' + b.name : 'a house'}`, { quiet: n < 3, rep: Math.min(10, n) });
      }
      // smashed trees and stalls back as they were, the same way (not under your nose)
      if (w?.smashed?.length) {
        for (let i = w.smashed.length - 1; i >= 0; i--) {
          const o = w.smashed[i];
          if (!o.ruined) { w.smashed.splice(i, 1); continue; }
          if (game.time < o.rebuildAt || (p && w.distance(p.x, p.y, o.x, o.y) < 25 && game.time < o.rebuildAt + 240)) continue;
          w.objects.restore(o);
          o.hp = undefined;
          w.smashed.splice(i, 1);
          D.event({ kind: 'restore', b: o });
        }
      }
      if (!w?.ruins?.length) return;
      for (let i = w.ruins.length - 1; i >= 0; i--) {
        const b = w.ruins[i];
        if (!b.ruined) { w.ruins.splice(i, 1); continue; }
        if (game.time < b.rebuildAt) continue;
        if (p && w.distance(p.x, p.y, b.x, b.y) < 30 && game.time < b.rebuildAt + 240) continue;
        if (p && w.distance(p.x, p.y, b.x, b.y) < 3 + Math.hypot(b.fw || 3, b.fd || 3)) continue; // (never rebuilt round you)
        w.objects.restore(b);
        for (const o of b.fixtures || []) { w.objects.restore(o); D.event({ kind: 'restore', b: o }); }
        b.fixtures = null;
        b.hp = undefined; b.stage = 0; b.damaged = false; b.charred = false;
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
        for (let d = 0; d <= R; d += Math.max(1.5, wd)) D.strike(h.x + ca * d, h.y + 0.4 + sa * d, wd, power, h.owner, { element: h.element });
        return;
      }
      if (h.shape === 'arc' || !h.shape) {
        // (a sweep in front of them: the half of the circle it covers)
        const a = h.angle || 0;
        D.strike(h.x + Math.cos(a) * R * 0.5, h.y + 0.4 + Math.sin(a) * R * 0.5, R * 0.6 + 0.4, power, h.owner, { element: h.element });
        return;
      }
      D.strike(h.x, h.y + 0.4, R + 0.3, power, h.owner, { element: h.element });
    },

    /** A shot of yours stopped by a wall: the wall takes it. */
    fromShot(p) {
      if (!wrecker(p.owner)) return;
      const power = structPower(p) * 0.8;
      if (power >= 4) D.strike(p.x, p.y, 0.8 + 0.4 * (p.size || 1), power, p.owner, { element: p.element });
    },
  };
  game.destruction = D;
  game.on?.('tick', (dt) => { D.update(); D.elements(dt || 1 / 60); });
  return D;
}
