// A building's own frame. Every building is laid out the same way locally —
// the front wall (street side, with the door) at z = 0 facing +z, the rest
// going back to z = -fd, x from -fw/2 to fw/2 — and turned in the world by
// quarter turns (b.rot) so it can front onto whichever street it stands on:
//
//   rot 0: the front faces +y (south)   rot 1: +x (east)
//   rot 2: -y (north)                   rot 3: -x (west)
//
// (b.x, b.y) is always the middle of the front wall. Everything that turns
// building-local positions into world ones (walls and doors that collide,
// rooms and furniture, where people stand, the 3D model) goes through here.

const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const rotOf = (b) => ((b.rot | 0) % 4 + 4) % 4;

/** Local (lx, lz) → world { x, y } (x unwrapped: wrap with world.wx if needed). */
export function bw(b, lx, lz) {
  switch (rotOf(b)) {
    case 1: return { x: b.x + lz, y: b.y - lx };
    case 2: return { x: b.x - lx, y: b.y - lz };
    case 3: return { x: b.x - lz, y: b.y + lx };
    default: return { x: b.x + lx, y: b.y + lz };
  }
}

/** World (x, y) → local { lx, lz } (dx through world.dx when given, for wrapping worlds). */
export function bl(b, x, y, world = null) {
  const dx = world ? world.dx(b.x, x) : x - b.x, dy = y - b.y;
  switch (rotOf(b)) {
    case 1: return { lx: -dy, lz: dx };
    case 2: return { lx: -dx, lz: -dy };
    case 3: return { lx: dy, lz: -dx };
    default: return { lx: dx, lz: dy };
  }
}

/** A local box [x0, x1] × [z0, z1] as a world rectangle { x0, x1, y0, y1 }. */
export function bbox(b, x0, x1, z0, z1) {
  const a = bw(b, x0, z0), c = bw(b, x1, z1);
  return { x0: Math.min(a.x, c.x), x1: Math.max(a.x, c.x), y0: Math.min(a.y, c.y), y1: Math.max(a.y, c.y) };
}

/** The whole footprint as a world rectangle. */
export function bfoot(b) {
  const fw = Math.max(2, b.fw || 3), fd = Math.max(2, b.fd || 3);
  return bbox(b, -fw / 2, fw / 2, -fd, 0);
}

/** Unit vector out of the front, in the world. */
export function bfront(b) { const f = FRONT[rotOf(b)]; return { x: f[0], y: f[1] }; }

/** The heading (atan2 convention) of someone facing out of the front door. */
export function bfacing(b) { const f = FRONT[rotOf(b)]; return Math.atan2(f[1], f[0]); }

/** Rotation about the vertical for the 3D model (three.js rotation.y). */
export function bangle(b) { return rotOf(b) * Math.PI / 2; }

/** Is the building turned sideways (its width running along world y)? */
export const sideways = (b) => rotOf(b) % 2 === 1;
