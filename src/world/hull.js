// The shape of a ship's hull, shared by the 3D view (which builds it) and the
// game (which lets people walk its decks): the dimensions, the half-beam along
// the length, and the floor heights of the main deck, quarterdeck and
// forecastle. Heights are metres above the waterline; t runs 0 (stern) → 1 (bow).

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Everything the hull, the rig and the camera need to agree on. */
export function shipDims(def) {
  if (def._dims) return def._dims;
  const L = def.length, B = def.beam;
  const open = L < 3.5; // the rowboat is an open boat
  const D = B * 0.42;
  const deckY = open ? 0.14 : 0.25 + B * 0.2;
  const bulH = open ? 0.36 : 0.3 + B * 0.07;
  const castle = L >= 5.5, fore = L >= 6.8;
  const hq = castle ? 0.85 + (L - 5.5) * 0.1 : 0;
  const hf = fore ? 0.5 : 0;
  const tq = castle ? 0.27 : 0, tf = fore ? 0.83 : 1;
  const masts = def.masts || 1;
  const mastH = 1.2 + L * 0.75;
  const helmX = -L * 0.42;
  const d = {
    L, B, D, open, deckY, bulH, castle, fore, hq, hf, tq, tf, masts, mastH, helmX,
    yq: deckY + hq, yf: deckY + hf,
    helmFloor: castle ? deckY + hq : deckY,
  };
  Object.defineProperty(def, '_dims', { value: d, enumerable: false, configurable: true });
  return d;
}

/** Where the helmsman stands: x along the hull (stern < 0) and the floor height above the waterline. */
export function helmPoint(def) {
  const d = shipDims(def);
  return { x: d.helmX, floor: d.helmFloor, eye: d.helmFloor + (d.open ? 1.45 : 1.7) };
}

export function hbAt(t, B) {
  if (t > 0.58) { const k = (t - 0.58) / 0.42; return B / 2 * Math.sqrt(Math.max(0, 1 - Math.pow(k, 2.2))); }
  if (t < 0.14) return B / 2 * (0.74 + 0.26 * Math.sin((t / 0.14) * Math.PI / 2));
  return B / 2;
}

export function topAt(d, t) {
  let y = d.deckY + d.bulH + 0.16 * d.B * Math.pow(Math.abs(t - 0.45) / 0.55, 2);
  if (d.castle) y += d.hq * (1 - smooth(d.tq - 0.015, d.tq + 0.035, t));
  if (d.fore) y += d.hf * smooth(d.tf - 0.035, d.tf + 0.015, t);
  return y;
}

export const xAt = (d, t) => -d.L / 2 + t * d.L;

/** Floor height at t: the quarterdeck, the forecastle or the main deck. */
export function floorAt(d, t) {
  if (d.castle && t < d.tq) return d.yq;
  if (d.fore && t > d.tf) return d.yf;
  return d.deckY;
}

/** The ship's gentle rise and fall on the swell (as the 3D view draws it). */
export function shipBob(ship, time) { return 0.05 + Math.sin((time + (ship.seed || 0)) * 1.3) * 0.07; }

/**
 * The deck under a point (dx, dy = offset from the ship's centre, world tiles):
 * { t (0 stern → 1 bow), v (across, + to starboard), h (floor height), edge
 * (distance in from the rail) } — or null off the deck. `margin` keeps you
 * that far inside the bulwarks.
 */
export function deckPoint(ship, dx, dy, margin = 0.2) {
  const d = shipDims(ship.def);
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  const u = dx * c + dy * s, v = -dx * s + dy * c;
  const t = (u + d.L / 2) / d.L;
  if (t < 0.02 || t > 0.97) return null;
  const hb = hbAt(t, d.B) * 0.94 - margin;
  if (hb <= 0 || Math.abs(v) > hb) return null;
  // the bow narrows to a point: keep off the very tip
  return { t, u, v, h: floorAt(d, t), edge: hb - Math.abs(v) };
}

/** World point of a deck position (t along, v across) of a ship. */
export function deckToWorld(ship, t, v) {
  const d = shipDims(ship.def);
  const u = -d.L / 2 + t * d.L;
  const c = Math.cos(ship.heading), s = Math.sin(ship.heading);
  return { x: ship.x + u * c - v * s, y: ship.y + u * s + v * c, h: floorAt(d, t) };
}
