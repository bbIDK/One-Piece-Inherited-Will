// People are solid to one another: you can't walk through a townsperson, a
// pirate can't stand inside you, a crowd at a doorway jostles rather than
// melting together. Each tick, anyone overlapping someone else near you is
// eased apart along the line between them (through moveBy, so nobody is
// shoved into a wall), the lighter of the two giving way more.
//
// Not solid: the dead and the knocked-down (you step over them), anyone
// mid-dodge (a dash goes past, as in any action game), the seated and the
// sailing, climbers, and the huge (sea beasts, which have their own reach);
// two bodies at very different heights (one jumping or flying over the
// other) don't meet. Friends — you and your crew — give way to each other
// softly, so a crewmate at your heels never blocks a doorway.

const CELL = 2;
const REACH = 60; // m from the player: further off nobody's looking
const _grid = new Map();
const _list = [];

function solid(a) {
  if (!a.alive || a.state === 'dead' || a.state === 'knocked') return false;
  if (a.noBody || a.invulnerable && a.noTarget) return false;
  if ((a.r || 0.3) > 2.5) return false;
  if (a.mode === 'sail' || a.climb || a.rope || a.zip || a.seatOn) return false;
  if (a.dash && a.dash.t > 0) return false;
  return true;
}

/** How hard it is to move (0: not at all). */
function give(a) {
  if (a.act3d && (a.act3d.pose === 'sit' || a.act3d.stance)) return 0;
  if (a.immovable || a.dummy) return 0;
  const r = a.r || 0.3;
  return 1 / (r * r);
}

export function separateBodies(game, dt) {
  const w = game.world, p = game.player;
  if (!w || !p) return;
  _grid.clear(); _list.length = 0;
  const crew = game.crew?.followers;
  for (const a of game.actors) {
    if (a.world && a.world !== w) continue;
    if (a !== p && w.dist2(a.x, a.y, p.x, p.y) > REACH * REACH) continue;
    if (!solid(a)) continue;
    const k = Math.floor(w.wx(a.x) / CELL) * 73856093 ^ Math.floor(a.y / CELL) * 19349663;
    let c = _grid.get(k);
    if (!c) _grid.set(k, (c = []));
    a._sepI = _list.length;
    c.push(a);
    _list.push(a);
  }
  if (_list.length < 2) return;
  const friend = (a) => a === p || a.isPlayer || a.remote || (crew && a.crewId && crew.get(a.crewId) === a) || a.crewMember;
  const k = Math.min(1, (dt || 0.016) * 14); // (eased apart over a few frames, not snapped)
  for (const a of _list) {
    const cx = Math.floor(w.wx(a.x) / CELL), cy = Math.floor(a.y / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const cell = _grid.get(gx * 73856093 ^ gy * 19349663);
        if (!cell) continue;
        for (const b of cell) {
          if (b._sepI <= a._sepI) continue; // (each pair once)
          if (Math.abs((a.z || 0) - (b.z || 0)) > 1.3) continue;
          if (a.onShip !== b.onShip && (a.onShip || b.onShip)) continue;
          const dx = w.dx(a.x, b.x), dy = b.y - a.y;
          const both = friend(a) && friend(b);
          const R = ((a.r || 0.3) + (b.r || 0.3)) * (both ? 0.55 : 0.95);
          const d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          let d = Math.sqrt(d2), nx, ny;
          if (d < 1e-4) { const t = (a.seed || 0.37) * 6.28; nx = Math.cos(t); ny = Math.sin(t); d = 0; } else { nx = dx / d; ny = dy / d; }
          const over = (R - d) * k;
          const ga = give(a), gb = give(b), tot = ga + gb;
          if (tot <= 0) continue;
          if (ga > 0) a.moveBy(w, -nx * over * ga / tot, -ny * over * ga / tot);
          if (gb > 0) b.moveBy(w, nx * over * gb / tot, ny * over * gb / tot);
        }
      }
    }
  }
}
