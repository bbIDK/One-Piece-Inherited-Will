// Context-sensitive "E" interactions.
import { WALKABLE } from '../world/tiles.js';

export function findInteraction(game, p) {
  const w = game.world;
  if (p.state !== 'idle') return null;
  if (p.mode === 'sail') {
    const s = p.ship;
    if (!s) return null;
    // custom sea interactions (Knock Up Stream, Fish-Man Island dive, Red Port...)
    const special = game.seaInteraction ? game.seaInteraction(p, s) : null;
    if (special) return special;
    const spot = findShore(w, s.x, s.y, s.def.length * 0.5 + 2.5);
    if (spot && Math.abs(s.speed) < 4.5) {
      const isl = w.islandAt(spot.x, spot.y) || w.nearestIsland(spot.x, spot.y, 40);
      return { label: `Go ashore${isl && isl.name ? ' — ' + isl.name : ''}`, key: 'E', run: () => disembark(game, p, spot) };
    }
    return null;
  }
  // on foot / swimming
  const cands = [];
  for (const s of game.ships) {
    if (s.sunk || s.owner !== 'player') continue;
    const d = w.distance(p.x, p.y, s.x, s.y);
    if (d < s.def.length * 0.55 + 1.6) cands.push({ d: d - 1, label: `Board the ${s.name}`, run: () => board(game, p, s) });
  }
  for (const a of game.actorsNear(p.x, p.y, 2.4)) {
    if (a === p || a.state !== 'idle' || !a.talk) continue;
    if (a.provoked && a.hostileNow) continue;
    const d = w.distance(p.x, p.y, a.x, a.y);
    cands.push({ d, label: `Talk to ${a.name}`, run: () => game.emit('talk', a) });
  }
  for (const a of game.actorsNear(p.x, p.y, 2.2)) {
    if (a === p || a.state !== 'knocked' || !a.canCarry) continue;
    cands.push({ d: w.distance(p.x, p.y, a.x, a.y) + 0.5, label: a.carryLabel || `Carry ${a.name}`, run: () => game.emit('carry', a) });
  }
  if (w.objects) {
    for (const o of w.objects.near(p.x, p.y, 3.2)) {
      if (o.kind === 'building' && o.role && o.role !== 'house' && o.door) {
        const d = w.distance(p.x, p.y, o.door.x, o.door.y + 0.3);
        if (d < 1.6) cands.push({ d, label: o.name ? `Enter ${o.name}` : 'Enter', run: () => game.emit('enterBuilding', o) });
      } else if (o.kind === 'building' && o.role === 'house' && o.door) {
        const d = w.distance(p.x, p.y, o.door.x, o.door.y + 0.3);
        if (d < 1.2) cands.push({ d: d + 0.5, label: 'Knock on the door', run: () => game.emit('knockDoor', o) });
      } else if (o.kind === 'chest' && !o.opened) {
        const d = w.distance(p.x, p.y, o.x, o.y);
        if (d < 1.6) cands.push({ d, label: 'Open the chest', run: () => game.emit('openChest', o) });
      } else if (o.interact) {
        const d = w.distance(p.x, p.y, o.x, o.y);
        if (d < (o.interactRange || 1.8)) cands.push({ d, label: o.interact, run: () => game.emit('useObject', o) });
      } else if (o.kind === 'dummy') {
        const d = w.distance(p.x, p.y, o.x, o.y);
        if (d < 1.8) cands.push({ d: d + 0.3, label: 'Train (strike the dummy)', run: () => game.emit('trainDummy', o) });
      }
    }
  }
  for (const it of game.groundItems || []) {
    const d = w.distance(p.x, p.y, it.x, it.y);
    if (d < 1.4) cands.push({ d: d - 0.2, label: `Pick up ${it.label}`, run: () => game.emit('pickup', it) });
  }
  if (game.footInteraction) { const x = game.footInteraction(p); if (x) cands.push(x); }
  if (!cands.length) return null;
  cands.sort((a, b) => a.d - b.d);
  return cands[0];
}

export function findShore(w, x, y, r) {
  let best = null, bd = Infinity;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r || d >= bd) continue;
      const tx = x + dx, ty = y + dy;
      const t = w.type(tx, ty);
      if (!WALKABLE[t] || w.isBlocked(tx, ty)) continue;
      // need a little standing room
      if (!WALKABLE[w.type(tx, ty - 0.4)] || w.isBlocked(tx, ty - 0.4)) continue;
      bd = d; best = { x: Math.floor(tx) + 0.5, y: Math.floor(ty) + 0.8 };
    }
  }
  return best;
}

export function disembark(game, p, spot) {
  const s = p.ship;
  if (s) { s.captain = null; s.sail = 0; s.rowing = 0; s.anchored = true; s.passengers = s.passengers.filter((x) => x !== p); }
  p.mode = 'foot';
  p.onShip = false;
  p.x = spot.x; p.y = spot.y;
  p.vx = p.vy = 0;
  game.emit('disembark', s, spot);
  game.audio?.sfx('step');
}

export function board(game, p, s) {
  p.mode = 'sail';
  p.ship = s;
  p.onShip = true;
  p.inWater = false;
  s.captain = p;
  p.x = s.x; p.y = s.y;
  p.setBlock(false);
  p.action = null;
  game.emit('board', s);
  game.hint('sailing', 'Sailing: W raises the sails, S lowers them, A/D steer. Hold SPACE to row (works without wind). Left-click fires a broadside toward the mouse. E near land to go ashore.');
  game.audio?.sfx('board');
}
