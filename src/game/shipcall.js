// The ship button, in the middle of the hotbar. Press it with your ship
// nowhere near and she's called up: the ship you've chosen (in the Shipyard,
// Tab → Shipyard) comes round onto the water in front of you — only if
// there's sea enough there for all of her, clear of the shore and any other
// hull. Press it with her close by (or with you aboard) and up go her sails,
// all at once; press it again and they come in.
import { Ship } from './ship.js';
import { fleetOf, liveShip, liveShips, aboard, layUp } from './fleet.js';
import { SHIPS } from '../data/ships.js';

/** The ship you sail: chosen in the Shipyard, else the first you own. */
export function chosenShip(c) {
  const f = fleetOf(c);
  return f.find((e) => e.uid === c.activeShip) || f[0] || null;
}

/** How near she has to be for the button to work her sails rather than call her up (m). */
const nearOf = (s) => Math.max(45, s.def.length * 1.6);

/** What the button would do now: { mode: 'none' | 'call' | 'sails', ship?, entry?, on? }. */
export function shipButtonState(game) {
  const c = game.state?.char, p = game.player;
  if (!c || !p) return { mode: 'none' };
  const e = chosenShip(c);
  if (!e || !SHIPS[e.type]) return { mode: 'none' };
  const s = liveShip(game, e.uid);
  // (aboard any ship of yours, it's hers)
  const on = p.mode === 'sail' ? p.ship : p.deck?.ship;
  if (on && on.owner === 'player' && !on.sunk) return { mode: 'sails', ship: on, entry: e, on: on.sail > 0 };
  if (s && game.world.distance(p.x, p.y, s.x, s.y) < nearOf(s)) return { mode: 'sails', ship: s, entry: e, on: s.sail > 0 };
  return { mode: 'call', entry: e };
}

/**
 * Somewhere in front of (x, y), along `h`, where she'd float whole — clear
 * of the shore and every other hull — as near as can be. Null if there's none.
 */
export function berthAhead(game, type, x, y, h, upgrades = []) {
  const w = game.world;
  const probe = new Ship({ type, x, y, heading: h, owner: 'player', faction: 'player', upgrades });
  const L = probe.def.length, B = probe.def.beam;
  const near = L * 0.5 + B * 0.5 + 2.5, far = near + Math.max(18, L * 0.8);
  probe.strict = true;
  try {
    for (let d = near; d <= far; d += 1.5) {
      // (straight ahead first, then a little to either side)
      for (const da of [0, 0.25, -0.25, 0.5, -0.5]) {
        const a = h + da, cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
        // (bow on, the way you're looking: you walk down to her stern... or, alongside, turned across)
        for (const hh of [h, h + Math.PI / 2, h - Math.PI / 2]) {
          if (probe.fits(w, cx, cy, hh) && !probe.shipIn(game, cx, cy, hh)) return { x: cx, y: cy, heading: hh };
        }
      }
    }
  } finally { probe.strict = false; }
  return null;
}

/** Press the ship button. */
export function pressShipButton(game) {
  const st = shipButtonState(game), p = game.player, c = game.state?.char;
  if (st.mode === 'none') {
    game.ui?.toast('NO SHIP', 'You don\'t own a ship yet: the shipwright on any pier sells them.', '#ff8a80');
    return false;
  }
  if (st.mode === 'sails') {
    const s = st.ship;
    // (a rowboat has no sail: the button's blank by her, and does nothing)
    if (s.def.oarsOnly) return false;
    s.setSails(!st.on);
    game.log(st.on ? `Sails in: the ${s.name} slows.` : `All sail set on the ${s.name}!`, '#ffe082');
    return true;
  }
  // calling her up
  if (game.inZone?.()) { game.log('Not here: there\'s no open sea to bring her round on.', '#ff8a80'); return false; }
  if (p.mode === 'sail' || p.deck?.ship) { game.log('You\'re aboard another ship.', '#ff8a80'); return false; }
  const e = st.entry;
  const spot = berthAhead(game, e.type, p.x, p.y, p.facing ?? 0, e.upgrades);
  if (!spot) {
    game.ui?.toast('NO ROOM', `Not enough open water in front of you for the ${e.name}. Face the sea, clear of the shore and other ships.`, '#ff8a80');
    return false;
  }
  // (one ship of yours afloat at a time: the others go into the yards)
  for (const o of liveShips(game)) if (!aboard(p, o)) layUp(game, o);
  const s = game.giveShip(e.type, spot.x, spot.y, e.name, { uid: e.uid, heading: spot.heading, upgrades: (e.upgrades || []).slice(), coated: e.coated, shot: e.shot, paint: e.paint });
  s.anchored = true; s.speed = 0;
  p.ship = s;
  c.activeShip = s.uid;
  game.audio?.sfx('splash', s);
  game.fx?.burst?.(s.x, s.y, 24, { color: ['#e1f5fe', '#ffffff'], speed: 4, g: 5, life: 0.8, kind: 'smoke', size: 0.4 });
  game.log(`The ${s.name} comes round. Climb aboard and take her ${s.def.oarsOnly ? 'oars' : 'wheel'} — press the ship button again to set sail.`, '#ffe082');
  return true;
}
