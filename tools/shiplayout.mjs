// The big ships' layouts, checked piece by piece (npm test, and tools/validate.mjs):
// every piece of furniture in every cabin, forecastle and hold stands inside
// its room's walls at every height it stands to, on its floor (or hung where
// it hangs), clear of every other piece, of the doorways and the doors folded
// back beside them, of the windows (if it's tall), of the masts coming
// through, of the foot of the ladder and the guns of a gun deck; it faces the
// right way (chairs and benches to their table, chests, bunks, bookcases,
// stoves and lanterns with their backs to a wall and their fronts to the
// room, a desk with its chair behind it); what you walk round is exactly
// what's drawn (and what's drawn fits its footprint); you can walk in
// through every door (down the ladder, into the hold) and reach every piece;
// and on deck, nothing boxes in a mast or the hatch: you can walk up to every
// mast and step onto the ladder at its head. (Given the hull as it's drawn,
// too: nothing of it — a stair's rail, a gallery, the figurehead — comes
// through into a room.)
//
//   import { checkShipLayout } from './shiplayout.mjs';  checkShipLayout('caravel') → [problems]
import { SHIPS } from '../src/data/ships.js';
import {
  shipDims, footprint, liningAt, liningYs, roomEnds, roomHalf, xAt, hbAt, solidAt, wallDepth, levelAt, stairAt, FURNITURE, gunBox,
} from '../src/world/hull.js';

const TOL = 0.02;       // (a couple of centimetres: outlines, a lock plate, a drawer's handle)
const MARGIN = 0.28 * 0.7; // how far anyone walking keeps from what's in their way (actor.js canMove)
const overlap = (a, b, pad = 0) => a.u0 < b.u1 + pad && a.u1 > b.u0 - pad && a.v0 < b.v1 + pad && a.v1 > b.v0 - pad;
const grow = (a, p) => ({ u0: a.u0 - p, u1: a.u1 + p, v0: a.v0 - p, v1: a.v1 + p });
const inBox = (a, u, v) => u >= a.u0 && u <= a.u1 && v >= a.v0 && v <= a.v1;
const fmt = (x) => +x.toFixed(2);
const WALL_PIECES = new Set(['chest', 'shelf', 'stove', 'bunk', 'lantern', 'barrel', 'barrels', 'crate', 'sacks', 'shot', 'hammock']);
const CARGO = new Set(['barrel', 'barrels', 'crate', 'sacks', 'shot']);
const HANGING = new Set(['hammock', 'lantern']);
// (things stood on a table or a desk, a pot on the stove, may rise above it)
const CLUTTER = { table: 0.14, desk: 0.24, stove: 0.26 };

/** Every big ship class there is. */
export const bigTypes = () => Object.keys(SHIPS).filter((k) => shipDims({ ...SHIPS[k] }).big);

/** The front and back of a piece: which way it faces (unit u, v) and where its front and back edges are. */
function facing(it) {
  const a = it.rot || 0, fu = Math.round(Math.sin(a)), fv = Math.round(Math.cos(a));
  const f = footprint(it), half = Math.abs(fu) ? (f.u1 - f.u0) / 2 : (f.v1 - f.v0) / 2;
  return { fu, fv, front: (k) => [it.u + fu * (half + k), it.v + fv * (half + k)], back: (k) => [it.u - fu * (half + k), it.v - fv * (half + k)] };
}

/**
 * Problems with a big ship's layout (an empty list when there are none).
 * `draw`: the 3D view's pieces, one at a time (see bigship.js furniture) —
 * checked to fit their footprints; `hull`: her hull as the 3D view builds it
 * ({ pos, idx }: see bigship.js bigHull) — checked for anything of it coming
 * through into a room (both need three: pass builders).
 */
export function checkShipLayout(type, { draw = null, hull = null } = {}) {
  const def = { ...SHIPS[type] }, d = shipDims(def), out = [];
  const E = (m) => out.push(`${type}: ${m}`);
  if (!d.big) return out;
  const tOf = (u) => (u + d.L / 2) / d.L;
  const name = (it) => `${it.room} ${it.kind}${it.treasure ? ' (treasure)' : ''} at u ${fmt(it.u)} v ${fmt(it.v)}`;

  // ---- the rooms
  for (const r of d.rooms) {
    const items = d.furniture.filter((it) => it.room === r.kind);
    const [ua, ub] = roomEnds(d, r), H = r.ceil - r.floor;
    const top = (it) => (it.pipe ? H - 0.1 : (it.y || 0) + it.h);
    // (the ways in: through its doors, or down the ladder)
    const doorZones = r.doors.map((dr) => {
      const f = r.front.face, u = r.front.u, deep = 1.0;
      return { dr, zone: f > 0 ? { u0: u - 0.07 - deep, u1: u, v0: dr.v - dr.w / 2, v1: dr.v + dr.w / 2 } : { u0: u, u1: u + 0.07 + deep, v0: dr.v - dr.w / 2, v1: dr.v + dr.w / 2 } };
    });
    const cp = d.comp, landing = { u0: cp.u0 - 1.2, u1: cp.u1, v0: -cp.w / 2 - 0.3, v1: cp.w / 2 + 0.3 };
    for (const it of items) {
      const f = footprint(it), y0 = it.y || 0, y1 = top(it);
      // on its floor (or hung up above head height), under the deck overhead
      if (HANGING.has(it.kind) ? y0 < 1.5 : y0 !== 0) E(`${name(it)} ${HANGING.has(it.kind) ? 'hangs too low' : 'is not standing on the floor'} (${fmt(y0)} up)`);
      if (y1 > H + TOL) E(`${name(it)} goes up through the deck (${fmt(y1)} in a room ${fmt(H)} high)`);
      // inside the room: between its end walls, inside the lining at every height it stands to
      if (f.u0 < ua - TOL || f.u1 > ub + TOL) E(`${name(it)} pokes through the room's ${f.u0 < ua - TOL ? 'aft' : 'forward'} wall (${fmt(f.u0)}..${fmt(f.u1)} vs ${fmt(ua)}..${fmt(ub)})`);
      const hs = [y0, y1, ...liningYs(r).filter((y) => y > y0 && y < y1)];
      for (const u of [f.u0, (f.u0 + f.u1) / 2, f.u1]) {
        const w = Math.min(...hs.map((y) => liningAt(d, r, tOf(Math.max(ua, Math.min(ub, u))), y)));
        if (Math.max(-f.v0, f.v1) > w + TOL) { E(`${name(it)} pokes through the ship's side (${fmt(Math.max(-f.v0, f.v1))} out where the lining is ${fmt(w)})`); break; }
      }
      // clear of the other pieces (a rug lies under things; things hang over others)
      for (const o of items) {
        if (o === it || o.kind === 'rug' || it.kind === 'rug') continue;
        if (items.indexOf(o) < items.indexOf(it)) continue;
        const g = footprint(o);
        if (overlap(f, g, -TOL) && y0 < top(o) - TOL && (o.y || 0) < y1 - TOL) E(`${name(it)} overlaps the ${o.kind} at u ${fmt(o.u)} v ${fmt(o.v)}`);
      }
      // the doorways, and the doors folded back inside
      for (const { dr, zone } of doorZones) {
        if (it.kind !== 'rug' && overlap(f, zone, -TOL) && y0 < dr.dh) E(`${name(it)} is in the doorway at v ${fmt(dr.v)}`);
        if (dr.leaf && it.kind !== 'rug' && y0 < dr.dh && overlap(f, { u0: dr.leaf.u - 0.03, u1: dr.leaf.u + 0.03, v0: dr.leaf.v0, v1: dr.leaf.v1 }, -TOL)) E(`${name(it)} is where the door at v ${fmt(dr.v)} folds back`);
      }
      // nothing tall in front of a window
      if (y1 > 0.74 && !HANGING.has(it.kind)) {
        for (const wd of r.windows || []) if (overlap(f, { u0: ua - 1, u1: ua + 0.3, v0: wd.v - wd.w / 2, v1: wd.v + wd.w / 2 }, -TOL)) E(`${name(it)} stands in front of a stern window`);
        for (const zz of r.front?.windows || []) {
          const band = r.front.face > 0 ? { u0: ub - 0.3, u1: ub + 1 } : { u0: ua - 1, u1: ua + 0.3 };
          if (overlap(f, { ...band, v0: zz - 0.31, v1: zz + 0.31 }, -TOL)) E(`${name(it)} stands in front of a window in the ${r.kind}'s front`);
        }
      }
      // the masts coming through
      for (const m of d.mastU) {
        const cu = Math.max(f.u0, Math.min(f.u1, m)), cv = Math.max(f.v0, Math.min(f.v1, 0));
        if (m > ua - 1 && m < ub + 1 && Math.hypot(cu - m, cv) < d.mastR + 0.08 + 0.25) E(`${name(it)} is against the mast at u ${fmt(m)} (no room to walk round)`);
      }
      // the foot of the ladder, and the guns of a gun deck
      if (r.kind === 'hold') {
        if (overlap(f, landing, -TOL)) E(`${name(it)} is on the ladder's landing`);
        for (const gn of d.lowGuns) if (overlap(f, gunBox(gn, d.gunScale), 0.1) && y0 < 1.2) E(`${name(it)} is on top of a gun at u ${fmt(gn.u)}`);
      }
      // facing the right way (a wall behind it where the ship's side comes in closest over its height; the room in front)
      const fc = facing(it), inRoom = ([u, v], y = 0.5, m = 0) => u > ua + m && u < ub - m && Math.abs(v) < liningAt(d, r, tOf(Math.max(ua, Math.min(ub, u))), y) - m;
      const yT = hs.reduce((a, y) => (liningAt(d, r, tOf(Math.max(ua, Math.min(ub, it.u))), y) < liningAt(d, r, tOf(Math.max(ua, Math.min(ub, it.u))), a) ? y : a), y0);
      const against = (p) => !inRoom(p, yT) || items.some((o) => o !== it && CARGO.has(o.kind) && inBox(grow(footprint(o), 0.02), ...p));
      if (it.kind === 'chair' || it.kind === 'bench') {
        const [u, v] = fc.front(0.12);
        if (!items.some((o) => (o.kind === 'table' || o.kind === 'desk') && inBox(grow(footprint(o), 0.02), u, v))) E(`${name(it)} doesn't face a table`);
      } else if (it.kind === 'desk') {
        const [u, v] = fc.back(0.2);
        if (!items.some((o) => o.kind === 'chair' && inBox(grow(footprint(o), 0.02), u, v))) E(`${name(it)} has no chair behind it`);
      } else if (WALL_PIECES.has(it.kind) && !it.treasure && !(it.kind === 'lantern' && !it.wall)) {
        // (somewhere along its back: where the hull curves, a straight piece touches it at one end;
        // cargo may be stowed two deep, its back to the row behind it)
        const along = Math.abs(fc.fu) ? [0] : [-1, 0, 1].map((k) => k * (it.w / 2 - 0.05));
        const backs = along.map((a) => { const [u, v] = fc.back(0.12); return Math.abs(fc.fu) ? [u, v + a] : [u + a, v]; });
        if (!backs.some((p) => (CARGO.has(it.kind) ? against(p) : !inRoom(p, yT)))) E(`${name(it)} doesn't have its back to a wall`);
        if (!inRoom(fc.front(0.3), Math.min(y1, 1.5), 0.05)) E(`${name(it)} faces the wall`);
      } else if (it.treasure) {
        const [u, v] = fc.front(0.35);
        if (!inRoom([u, v]) || items.some((o) => o !== it && o.kind !== 'rug' && !o.ghost && inBox(footprint(o), u, v))) E(`${name(it)} doesn't face into the hold`);
      }
    }
    // what you walk round is what's drawn: a solid for every piece that's in the way, nothing else
    const mine = d.solids.filter((s) => s.lvl === r.kind && s.r === undefined);
    for (const it of items) {
      if (it.ghost) continue;
      const f = footprint(it);
      if (!mine.some((s) => Math.abs(s.u0 - f.u0) + Math.abs(s.u1 - f.u1) + Math.abs(s.v0 - f.v0) + Math.abs(s.v1 - f.v1) < 1e-6)) E(`${name(it)} has nothing to walk round (no solid)`);
    }
    const expect = items.filter((it) => !it.ghost).length + (r.kind === 'hold' ? d.lowGuns.length : 0);
    if (mine.length !== expect) E(`${r.kind}: ${mine.length} solids for ${expect} things in the way (an invisible barrier, or something you walk through)`);
    // walking: in through the doors (down the ladder into the hold), to every piece
    const walk = walkRoom(d, r);
    for (const { dr, zone } of doorZones) {
      const u = r.front.face > 0 ? zone.u0 + 0.2 : zone.u1 - 0.2;
      if (!walk.reach(u, dr.v)) E(`${r.kind}: can't get in through the door at v ${fmt(dr.v)}`);
    }
    if (r.kind === 'hold' && !walk.reach(cp.u0 - 0.5, 0)) E('hold: can\'t step off the foot of the ladder');
    for (const it of items) {
      // (cargo's stowed as it's stowed: two deep, the back row reached by shifting the front)
      if (it.kind === 'rug' || it.kind === 'lantern' || it.kind === 'hammock' || CARGO.has(it.kind)) continue;
      // (up to its front — a chair, a table: to any side of it; the treasure chest: near enough to plunder it)
      const f = footprint(it), fc = facing(it), R = it.treasure ? 1.2 : 0.75;
      const ok = it.treasure ? walk.near(it.u, it.v, R)
        : WALL_PIECES.has(it.kind) ? walk.near(...fc.front(0.25), 0.4)
          : walk.nearBox(f, 0.6);
      if (!ok) E(`${name(it)} can't be reached`);
    }
    if (walk.share < 0.85) E(`${r.kind}: only ${Math.round(walk.share * 100)}% of the floor you can stand on can be walked to from the way in`);
  }

  // ---- on deck
  // the masts: no fife rail boxing one in — you walk right up to it, all the way round
  for (const s of d.solids) if (s.r !== undefined && !s.lvl && Math.abs(s.r - (d.mastR + 0.08)) > 1e-6) E(`a mast at u ${fmt(s.u)} is fenced in (walk-round radius ${fmt(s.r)}, the mast's ${fmt(d.mastR)})`);
  // no walls but the rooms' (nothing round the hatch)
  for (const w of d.walls) {
    const r = d.rooms.find((x) => (w.end ? Math.abs(w.u0 - xAt(d, x.t0)) < 0.1 || Math.abs(w.u0 - xAt(d, x.t1)) < 0.1 : x.front && Math.abs(w.u0 - x.front.u) < 1e-6) && Math.abs(w.y0 - x.floor) < 1e-6);
    if (!r || w.u0 !== w.u1) E(`a wall on deck that isn't a room's (u ${fmt(w.u0)}..${fmt(w.u1)}, v ${fmt(w.v0)}..${fmt(w.v1)})`);
  }
  // the hatch: nothing in its opening, the deck clear at its head, and you can walk to its head and step down
  const cp = d.comp, head = { u0: cp.u1, u1: cp.u1 + 1.2, v0: -cp.w / 2 - 0.3, v1: cp.w / 2 + 0.3 };
  for (const s of d.solids) {
    if (s.lvl && s.lvl !== 'main') continue;
    const b = s.r !== undefined ? { u0: s.u - s.r, u1: s.u + s.r, v0: s.v - s.r, v1: s.v + s.r } : s;
    if (overlap(b, { u0: cp.u0, u1: cp.u1, v0: -cp.w / 2, v1: cp.w / 2 })) E(`something stands in the hatch (u ${fmt(b.u0)}..${fmt(b.u1)})`);
    if (overlap(b, head)) E(`something stands at the head of the ladder (u ${fmt(b.u0)}..${fmt(b.u1)})`);
  }
  const deck = walkDeck(d);
  if (!deck.reach(cp.u1 + 0.35, 0)) E('the head of the ladder can\'t be walked to');
  for (const m of d.mastU) {
    const t = tOf(m);
    if (t <= d.tq || t >= d.tf) continue;
    const r = d.mastR + 0.08 + MARGIN + 0.1;
    const round = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => deck.reach(m + Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r)).length;
    if (round < 6) E(`the mast at u ${fmt(m)} can only be walked up to from ${round} of 8 sides`);
  }
  if (deck.share < 0.9) E(`main deck: only ${Math.round(deck.share * 100)}% of it can be walked to`);
  // the stairs' feet on the main deck: clear to step off onto
  for (const s of d.stairs) {
    if (s.down || !(s.la === 'main' || s.lb === 'main')) continue;
    const footT = s.la === 'main' ? s.ta : s.tb, dir = s.la === 'main' ? -1 : 1;
    const u = xAt(d, footT) + dir * 0.45, v = (s.va + s.vb) / 2;
    if (!deck.reach(u, v)) E(`the foot of the stairs up to the ${s.la === 'main' ? s.lb : s.la} (u ${fmt(u)} v ${fmt(v)}) can't be walked to`);
  }

  // ---- what's drawn fits what you walk round
  if (draw) {
    for (const it of d.furniture) {
      const b = draw(d, it);
      if (!b) continue;
      const f = footprint(it), y0 = it.floor + (it.y || 0), room = d.rooms.find((r) => r.kind === it.room);
      const y1 = it.pipe ? room.ceil + 0.14 : y0 + it.h + (CLUTTER[it.kind] || 0);
      if (b.u0 < f.u0 - TOL || b.u1 > f.u1 + TOL || b.v0 < f.v0 - TOL || b.v1 > f.v1 + TOL) E(`${name(it)} is drawn bigger than it stands (${fmt(b.u0)}..${fmt(b.u1)} × ${fmt(b.v0)}..${fmt(b.v1)} vs ${fmt(f.u0)}..${fmt(f.u1)} × ${fmt(f.v0)}..${fmt(f.v1)})`);
      if (b.y0 < y0 - TOL || b.y1 > y1 + TOL) E(`${name(it)} is drawn from ${fmt(b.y0 - it.floor)} to ${fmt(b.y1 - it.floor)} up, not ${fmt(y0 - it.floor)} to ${fmt(y1 - it.floor)}`);
      // (and fills it: nothing drawn much smaller than you bump into)
      if (it.kind !== 'lantern' && it.kind !== 'hammock' && ((b.u1 - b.u0) < (f.u1 - f.u0) * 0.8 || (b.v1 - b.v0) < (f.v1 - f.v0) * 0.8)) E(`${name(it)} is drawn smaller than what you walk round`);
    }
  }

  // ---- nothing of her hull, her decks or her fittings comes through into a room
  // (a stair's rail through a cabin's front, a gallery through its side, a
  // figurehead through the forecastle: every triangle's edges, 5 cm apart)
  if (hull) {
    const { pos, idx } = hull(def, d), found = new Set();
    const into = (u, y, v) => {
      for (const r of d.rooms) {
        const [ua, ub] = roomEnds(d, r), h = y - r.floor;
        if (u < ua + 0.03 || u > ub - 0.03 || h < 0.03 || h > r.ceil + 0.07 - r.floor) continue;
        // (a room's front, with its doors folded back inside it; the ladder down into the hold)
        if (r.front && Math.abs(u - r.front.u) < 0.3) continue;
        if (r.kind === 'hold' && u > d.comp.u0 - 0.15 && u < d.comp.u1 + 0.15 && Math.abs(v) < d.comp.w / 2 + 0.15) continue;
        if (Math.abs(v) < liningAt(d, r, tOf(u), h) - 0.03) return r;
      }
      return null;
    };
    const at = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    for (let f = 0; f < idx.length && found.size < 6; f += 3) {
      const tri = [at(idx[f]), at(idx[f + 1]), at(idx[f + 2])];
      for (let e = 0; e < 3; e++) {
        const p = tri[e], q = tri[(e + 1) % 3];
        const n = Math.max(1, Math.min(400, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / 0.05)));
        for (let i = 0; i <= n; i++) {
          const u = p[0] + (q[0] - p[0]) * i / n, y = p[1] + (q[1] - p[1]) * i / n, v = p[2] + (q[2] - p[2]) * i / n;
          const r = into(u, y, v), key = r && `${r.kind} ${Math.round(u)}`;
          if (r && !found.has(key)) { found.add(key); E(`the hull comes through into the ${r.kind} at u ${fmt(u)}, ${fmt(y - r.floor)} up, v ${fmt(v)}`); }
        }
      }
    }
  }
  return out;
}

/** Every ship class's problems. */
export function checkAllShips(opts) { return bigTypes().flatMap((t) => checkShipLayout(t, opts)); }

// ---------------------------------------------------------------- walking
/**
 * Where you can stand in a room (on a 10 cm grid: the same tests the game's
 * walking makes — the lining, the walls, what's in the way) and where you
 * can walk to from the way in (its doors; the foot of the hold's ladder).
 */
function walkRoom(d, r) {
  const [ua, ub] = roomEnds(d, r), S = 0.1;
  const ok = (u, v) => {
    const t = (u + d.L / 2) / d.L;
    if (t < r.t0 || t > r.t1) return false;
    if (roomHalf(d, r, t) - Math.abs(v) < MARGIN) return false;
    // (in the hold, the ladder's steps overhead aren't a floor: you step onto its foot, not in under it)
    const st = r.kind === 'hold' ? stairAt(d, t, v) : null;
    if (st && st.ha + (st.hb - st.ha) * (t - st.ta) / (st.tb - st.ta) > r.floor + 0.55) return false;
    return !(solidAt(d, u, v, MARGIN, r.kind) > 0) && !(wallDepth(d, u, v, r.floor, MARGIN) > 0);
  };
  const starts = r.doors.map((dr) => [r.front.face > 0 ? r.front.u - 0.3 : r.front.u + 0.3, dr.v]);
  if (r.kind === 'hold') starts.push([d.comp.u0 - 0.35, 0]);
  return flood(ok, ua - 0.3, ub + 0.3, -d.B / 2, d.B / 2, S, starts);
}

/** The main deck: where you can walk (between the stairs' feet and round everything on it), from the foot of the stairs up to the quarterdeck. */
function walkDeck(d) {
  const S = 0.1;
  const ok = (u, v) => {
    const t = (u + d.L / 2) / d.L;
    if (Math.abs(v) > hbAt(t, d.B) * d.walk - MARGIN) return false;
    if (levelAt(d, t, v, d.deckY) !== 'main') return false;
    return !(solidAt(d, u, v, MARGIN, 'main') > 0) && !(wallDepth(d, u, v, d.deckY, MARGIN) > 0);
  };
  const q = d.stairs.find((s) => s.la === 'quarter' && s.lb === 'main');
  return flood(ok, xAt(d, d.tq), xAt(d, d.fore ? d.tf : 0.97), -d.B / 2, d.B / 2, S, [[xAt(d, q.tb) + 0.45, (q.va + q.vb) / 2], [d.comp.u1 + 0.6, 0]]);
}

function flood(ok, u0, u1, v0, v1, S, starts) {
  const nu = Math.ceil((u1 - u0) / S) + 1, nv = Math.ceil((v1 - v0) / S) + 1;
  const cell = (u, v) => [Math.round((u - u0) / S), Math.round((v - v0) / S)];
  const free = new Uint8Array(nu * nv), seen = new Uint8Array(nu * nv);
  let nFree = 0;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) if (ok(u0 + i * S, v0 + j * S)) { free[i * nv + j] = 1; nFree++; }
  const stack = [];
  for (const [u, v] of starts) {
    // (the nearest place to stand to where you come in)
    let best = null;
    const [ci, cj] = cell(u, v);
    for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) {
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < nu && j < nv && free[i * nv + j] && (!best || di * di + dj * dj < best[2])) best = [i, j, di * di + dj * dj];
    }
    if (best && !seen[best[0] * nv + best[1]]) { seen[best[0] * nv + best[1]] = 1; stack.push(best[0] * nv + best[1]); }
  }
  let n = 0;
  while (stack.length) {
    const c = stack.pop(); n++;
    const i = Math.floor(c / nv), j = c % nv;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + a, jj = j + b, k = ii * nv + jj;
      if (ii < 0 || jj < 0 || ii >= nu || jj >= nv || !free[k] || seen[k]) continue;
      seen[k] = 1; stack.push(k);
    }
  }
  const reached = (i, j) => i >= 0 && j >= 0 && i < nu && j < nv && seen[i * nv + j];
  return {
    share: nFree ? n / nFree : 0,
    reach: (u, v) => { const [i, j] = cell(u, v); for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (reached(i + di, j + dj)) return true; return false; },
    near: (u, v, R) => { const [ci, cj] = cell(u, v), k = Math.ceil(R / S); for (let di = -k; di <= k; di++) for (let dj = -k; dj <= k; dj++) if (di * di + dj * dj <= k * k && reached(ci + di, cj + dj)) return true; return false; },
    nearBox: (f, R) => {
      const [i0, j0] = cell(f.u0 - R, f.v0 - R), [i1, j1] = cell(f.u1 + R, f.v1 + R);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (reached(i, j)) return true;
      return false;
    },
  };
}

/** The furniture's sizes, for the report. */
export { FURNITURE };
