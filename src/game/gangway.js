// Gangways. Lie your ship alongside another — a Marine's, one you're
// fighting, a merchantman that's struck to you — both of you stopped, and
// your crew run a plank across from your rail to hers: steps up from your
// deck, across the water at the height of the rails, and down onto hers,
// with a rope along each side. It's walked like a deck — by you, your crew
// and hers — and it's hauled in again once either ship gets under way or
// they drift apart. (game.planks; game.deckAt finds them: see decks.js.)
import { shipDims, deckPoint, deckToWorld, hbAt, topAt, floorAt, shipLift, xAt } from '../world/hull.js';
import { angleDiff } from '../core/math.js';

/** A gangway's width (it fits between two guns' carriages), and the run of the steps at each end, from the deck up to the rail. */
export const PLANK_W = 0.8, PLANK_RAMP = 1.5;
// (stopped: barely moving, no sail set, nobody rowing; under way again past this)
const STOPPED = 0.35, UNDERWAY = 0.75;

const stopped = (s, v = STOPPED) => Math.abs(s.speed || 0) < v && (s.sailSet || 0) < (v === STOPPED ? 0.25 : 0.45) && !s.rowing;

/** The main deck of a big ship, along her length: from the foot of the stairs up to her quarterdeck to the forecastle's. */
function mainSpan(d) {
  const qs = d.stairs.find((s) => s.la === 'quarter' && s.lb === 'main'), fs = d.stairs.find((s) => s.lb === 'fore');
  return [qs ? qs.tb : d.tq, fs ? fs.ta : 0.84];
}

/** (x, y) in a ship's own frame: { u along, v across }. */
function frame(w, s, x, y) {
  const c = Math.cos(s.heading), sn = Math.sin(s.heading), dx = w.dx(s.x, x), dy = y - s.y;
  return { u: dx * c + dy * sn, v: -dx * sn + dy * c };
}

/** Is the deck of `s` along a stretch (from p0, `len` along n, as wide as a plank) her main deck, with nothing on it? */
function clearRun(w, s, p0, n, len) {
  const m = { x: -n.y, y: n.x };
  for (let f = 0; f <= 1.0001; f += 0.25) {
    for (const o of [-PLANK_W / 2, 0, PLANK_W / 2]) {
      const x = w.wx(p0.x + n.x * len * f + m.x * o), y = p0.y + n.y * len * f + m.y * o;
      const dp = deckPoint(s, w.dx(s.x, x), y - s.y, 0.05);
      if (!dp || dp.lvl !== 'main' || dp.solid) return false;
    }
  }
  return true;
}

/**
 * A plank laid from ship `a` (yours) to ship `b`. Its ends are fixed in each
 * ship's own frame — the foot of the steps on each deck, and where it comes
 * over each rail — so it rides with both of them as they lie there.
 */
export class Plank {
  constructor(game, a, b, ends) {
    this.game = game; this.a = a; this.b = b;
    Object.assign(this, ends);
    this.len0 = this.pts().len;
  }

  /** Where it lies just now: its axis (from a's end, `dir` toward b's) and the heights of its four points (the two ends on deck, the two rails), at distances `s` along it. */
  pts() {
    const g = this.game, time = g.env?.time || 0;
    if (this.cache && this.cache.time === time && this.cache.ax === this.a.x && this.cache.bx === this.b.x) return this.cache;
    const w = g.world, A = this.a, B = this.b, dA = shipDims(A.def), dB = shipDims(B.def);
    const at = (s, f) => deckToWorld(s, (f.u + shipDims(s.def).L / 2) / shipDims(s.def).L, f.v);
    const EA = at(A, this.aE), RA = at(A, this.aR), RB = at(B, this.bR), EB = at(B, this.bE);
    const dx = w.dx(EA.x, EB.x), dy = EB.y - EA.y, len = Math.hypot(dx, dy) || 1, dir = { x: dx / len, y: dy / len };
    const along = (p) => w.dx(EA.x, p.x) * dir.x + (p.y - EA.y) * dir.y;
    const tt = (d, f) => (f.u + d.L / 2) / d.L;
    this.cache = {
      time, ax: A.x, bx: B.x, x: EA.x, y: EA.y, dir, len,
      s: [0, along(RA), along(RB), len],
      h: [shipLift(A, time, this.aE.u, this.aE.v, floorAt(dA, tt(dA, this.aE), this.aE.v)), shipLift(A, time, this.aR.u, this.aR.v, topAt(dA, tt(dA, this.aR)) + 0.06),
        shipLift(B, time, this.bR.u, this.bR.v, topAt(dB, tt(dB, this.bR)) + 0.06), shipLift(B, time, this.bE.u, this.bE.v, floorAt(dB, tt(dB, this.bE), this.bE.v))],
    };
    return this.cache;
  }

  /** How high its top is (m above the sea) `k` metres along it from your ship's end. */
  liftAt(k) {
    const P = this.pts(), s = P.s, h = P.h;
    if (k <= s[0]) return h[0];
    for (let i = 0; i < 3; i++) if (k <= s[i + 1]) return h[i] + (h[i + 1] - h[i]) * (k - s[i]) / Math.max(1e-6, s[i + 1] - s[i]);
    return h[3];
  }

  /** The point of it under (x, y) — { k along it, e across it } — if it's on it (`margin` in from its edges), else null. */
  at(x, y, margin = 0) {
    const P = this.pts(), w = this.game.world;
    const dx = w.dx(P.x, x), dy = y - P.y, k = dx * P.dir.x + dy * P.dir.y, e = -dx * P.dir.y + dy * P.dir.x;
    if (k < 0 || k > P.len || Math.abs(e) > PLANK_W / 2 - margin) return null;
    return { k, e };
  }

  /** The foot of its steps on your ship's deck: { t, v, h } (where a save made on it puts you back aboard her: planks aren't kept). */
  footA() {
    const d = shipDims(this.a.def), t = (this.aE.u + d.L / 2) / d.L;
    return { t, v: this.aE.v, h: floorAt(d, t, this.aE.v) };
  }

  /** It's there to be walked: both ships afloat and lying still, as close as when it was laid. */
  holds() {
    const A = this.a, B = this.b;
    if (A.sunk || B.sunk || A.alive === false || B.alive === false || !stopped(A, UNDERWAY) || !stopped(B, UNDERWAY)) return false;
    const P = this.pts(), n = { x: -Math.sin(A.heading) * this.side, y: Math.cos(A.heading) * this.side };
    return Math.abs(P.len - this.len0) < 0.6 && P.dir.x * n.x + P.dir.y * n.y > 0.88;
  }
}

/**
 * Lay a plank from `a` (yours) across to `b` lying alongside: from a stretch
 * of her main deck as near abreast of b's middle as it'll go, to b's, wherever
 * both decks are clear for the steps at its ends (no gun, mast or hatch in the
 * way) and there's open water between — straight across, or a little aslant
 * where the gaps between the two ships' guns don't line up. The plank, or null.
 */
export function layPlank(game, a, b) {
  const w = game.world, dA = shipDims(a.def), dB = shipDims(b.def);
  if (!dA.big || !dB.big) return null;
  // (side by side: as near parallel as makes no odds, either way about)
  const dh = Math.abs(angleDiff(a.heading, b.heading));
  if (Math.min(dh, Math.PI - dh) > 0.35) return null;
  const fb = frame(w, a, b.x, b.y), side = fb.v >= 0 ? 1 : -1;
  const n = { x: -Math.sin(a.heading) * side, y: Math.cos(a.heading) * side };
  const [t0, t1] = mainSpan(dA), mid = Math.max(xAt(dA, t0) + 1.2, Math.min(xAt(dA, t1) - 1.2, fb.u));
  const at = (p, d, l) => ({ x: w.wx(p.x + d.x * l), y: p.y + d.y * l });
  // across to b's rail (the edge of her deck) from a's at RA, heading `d`: how far, and where
  const across = (RA, d) => {
    for (let l = 0.2; l < 7.5; l += 0.1) { const q = at(RA, d, l); if (deckPoint(b, w.dx(b.x, q.x), q.y - b.y, 0)) return { l, ...q }; }
    return null;
  };
  // (a big ship's guns stand along her side every couple of metres: where
  // there's room for the steps between two of hers, and straight across
  // between two of the other's, all along the stretch abreast)
  const okA = [], okB = [];
  for (let u = xAt(dA, t0) + 1.2; u <= xAt(dA, t1) - 1.2; u += 0.2) {
    const t = (u + dA.L / 2) / dA.L, vR = side * hbAt(t, dA.B) * dA.walk;
    const RA = deckToWorld(a, t, vR);
    if (clearRun(w, a, deckToWorld(a, t, vR - side * PLANK_RAMP), n, PLANK_RAMP - 0.25)) okA.push({ u, RA });
    const hit = across(RA, n);
    if (hit && hit.l >= 0.8 && clearRun(w, b, at(hit, n, 0.25), n, PLANK_RAMP - 0.25)) okB.push({ u, hit });
  }
  okA.sort((p, q) => Math.abs(p.u - mid) - Math.abs(q.u - mid));
  for (const A of okA) {
    for (const B of okB.filter((q) => Math.abs(q.u - A.u) <= 1.6).sort((p, q) => Math.abs(p.u - A.u) - Math.abs(q.u - A.u))) {
      // (the plank's line, from her rail to the other's deck there; each end's steps clear along it)
      const dx = w.dx(A.RA.x, B.hit.x), dy = B.hit.y - A.RA.y, dl = Math.hypot(dx, dy), d = { x: dx / dl, y: dy / dl };
      const RB = across(A.RA, d);
      if (!RB || RB.l < 0.8) continue;
      const EA = at(A.RA, d, -PLANK_RAMP), EB = at(RB, d, PLANK_RAMP);
      if (!clearRun(w, a, EA, d, PLANK_RAMP - 0.25) || !clearRun(w, b, at(RB, d, 0.25), d, PLANK_RAMP - 0.25)) continue;
      // (over open water between them, not a pier)
      const m = at(A.RA, d, RB.l / 2);
      if (!w.isLiquid(m.x, m.y) || w.isDock?.(m.x, m.y)) continue;
      return new Plank(game, a, b, { side, aE: frame(w, a, EA.x, EA.y), aR: frame(w, a, A.RA.x, A.RA.y), bR: frame(w, b, RB.x, RB.y), bE: frame(w, b, EB.x, EB.y) });
    }
  }
  return null;
}

/**
 * The plank under (x, y) — one joined to `only`, if given — as a deck point
 * (see decks.js deckAt), or null. `hRef`: the height of the feet asking (over
 * the waterline): from down in the hold under its steps, it's not underfoot.
 */
export function plankDeck(game, x, y, margin = 0, only = null, hRef = null) {
  for (const P of game.planks || []) {
    if (only && P.a !== only && P.b !== only) continue;
    const q = P.at(x, y, margin);
    if (!q) continue;
    const A = P.a, dA = shipDims(A.def), f = frame(game.world, A, x, y), time = game.env?.time || 0;
    const h = P.liftAt(q.k) - shipLift(A, time, f.u, f.v, 0);
    if (hRef !== null && hRef < h - 1.2) continue;
    return { ship: A, plank: P, k: q.k, e: q.e, t: (f.u + dA.L / 2) / dA.L, u: f.u, v: f.v, h, edge: PLANK_W / 2 - Math.abs(q.e), lvl: 'plank' };
  }
  return null;
}

/** Do decks `a` and `b` (deck points) meet across a plank — one of them on it, the other on a ship it's laid to? */
export function plankJoins(a, b) {
  return !!a && !!b && ((a.plank && (a.plank.a === b.ship || a.plank.b === b.ship)) || (b.plank && (b.plank.a === a.ship || b.plank.b === a.ship)));
}

export function installGangways(game) {
  game.planks = [];
  let t = 0;
  // (a pair that had no room for one isn't tried again till one of them has moved, or a while has passed)
  const tried = new Map();
  const clear = () => { game.planks = []; tried.clear(); };
  game.on('characterStart', clear);
  game.on('enterZone', clear);
  game.on('leaveZone', clear);
  game.on('tick', (dt) => {
    if ((t -= dt) > 0) return;
    t = 0.25;
    const p = game.player, w = game.world;
    if (!p || !w) return;
    const near = (P) => w.distance(p.x, p.y, P.a.x, P.a.y) < 80;
    // hauled in once she's under way, or they've drifted apart
    for (let i = game.planks.length - 1; i >= 0; i--) {
      const P = game.planks[i];
      if (P.holds()) continue;
      game.planks.splice(i, 1);
      if (near(P) && !P.a.sunk && !P.b.sunk) game.log(`The plank to the ${P.b.name} is hauled in.`, '#b0bec5');
    }
    // run out when one of your ships lies stopped alongside another
    for (const a of game.ships) {
      if (a.owner !== 'player' || a.sunk || a.alive === false || !stopped(a)) continue;
      for (const b of game.ships) {
        if (b === a || b.owner === 'player' || b.sunk || b.alive === false || !stopped(b)) continue;
        if (w.distance(a.x, a.y, b.x, b.y) > (a.def.length + b.def.length) / 2 + 2 || game.planks.some((P) => P.a === a && P.b === b)) continue;
        const was = tried.get(b), now = game.time || 0;
        if (was && was.a === a && now - was.t < 4 && w.distance(was.ax, was.ay, a.x, a.y) + w.distance(was.bx, was.by, b.x, b.y) < 0.3) continue;
        const P = layPlank(game, a, b);
        if (!P) { tried.set(b, { a, t: now, ax: a.x, ay: a.y, bx: b.x, by: b.y }); continue; }
        tried.delete(b);
        game.planks.push(P);
        if (near(P)) { game.log(`Your crew run a plank across to the ${b.name}.`, '#b0bec5'); game.audio?.sfx('board'); }
      }
    }
  });
}
