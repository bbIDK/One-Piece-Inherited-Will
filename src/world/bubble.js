// Fish-Man Island's bubble (data/zones fishman_island: bubble): a dome of air
// over the whole of its zone, 10,000 m down. Its foot is an ellipse on the
// sea, a by b m round (x, y); over that it rises h m high in the middle, half
// an ellipsoid. Inside: air, the island and its sea. Outside: the deep sea —
// its tiles are walled off (zonegen.js), there's no sea drawn there
// (water3d.js), and you only pass its skin the way ships come and go
// (zones.js).

/** The bubble's own measure of a point at sea level: 0 in its middle, 1 on its rim. */
export function bubbleR(b, x, y) {
  const ex = (x - b.x) / b.a, ey = (y - b.y) / b.b;
  return Math.sqrt(ex * ex + ey * ey);
}

/** Is (x, y) inside the world's bubble (at least `margin` m in from its rim)? Always, in a world without one. */
export function inBubble(world, x, y, margin = 0) {
  const b = world?.bubble;
  if (!b) return true;
  return bubbleR(b, x, y) < 1 - margin / Math.min(b.a, b.b);
}

/** How high (m above the sea) the dome is over a point: 0 at its rim and past it. */
export function domeHeight(b, x, y) {
  const r = bubbleR(b, x, y);
  return r >= 1 ? 0 : b.h * Math.sqrt(1 - r * r);
}

/**
 * Where a point (h m above the sea) is against the dome: under 1 inside it,
 * over 1 outside, 1 on its skin (the ellipsoid's own measure).
 */
export function domeR(b, x, y, h) {
  const ex = (x - b.x) / b.a, ey = (y - b.y) / b.b, ez = Math.max(0, h) / b.h;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}
