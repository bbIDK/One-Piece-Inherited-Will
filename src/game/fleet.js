// Your fleet: every ship you own, wherever she lies. A ship is either afloat
// somewhere (moored at a pier, at anchor, at sea, up in a zone) or laid up in
// the yards, and the shipwright on any harbour's pier can bring any of them
// round to that pier (see shipwrights.js). There is only ever one of each
// afloat: bringing her round takes her from wherever she was. New ships are
// bought from those same shipwrights (a ship the Navy assigns you waits in
// the yards until one of them brings her round).
//
// char.fleet: [{ uid, type, name, upgrades, coated, shot, from? }]. Where each
// one is afloat is saved with the world, in char.ships (see lineage.js snapshot).
import { SHIPS, shipStats } from '../data/ships.js';

let uidCounter = 0;

export const fleetOf = (c) => (c.fleet ||= []);

const record = (s) => ({ uid: s.uid, type: s.type, name: s.name, upgrades: (s.upgrades || []).slice(), coated: !!s.coated, shot: s.shot, paint: s.paint || null });

/** Keep the record of a ship you own up to date (a new one joins the fleet). */
export function recordShip(c, s) {
  if (!c || !s?.uid || !SHIPS[s.type]) return null;
  const f = fleetOf(c);
  const e = f.find((x) => x.uid === s.uid);
  if (!e) { const r = record(s); f.push(r); return r; }
  return Object.assign(e, record(s));
}

/** She's gone to the bottom: no longer yours. */
export function dropShip(c, uid) {
  if (!c?.fleet) return;
  c.fleet = c.fleet.filter((x) => x.uid !== uid);
  if (c.activeShip === uid) c.activeShip = null;
}

/** Old saves: whatever ships they had (at sea, or left behind in a zone) become the ships they own. */
export function upgradeFleet(c) {
  if (Array.isArray(c.fleet)) return c;
  c.fleet = [];
  for (const s of [...(c.ships || []), ...(c.zoneShips || [])]) {
    if (!s || !SHIPS[s.type]) continue;
    s.uid = s.uid || `s${Date.now().toString(36)}o${uidCounter++}`;
    if (!c.fleet.some((x) => x.uid === s.uid)) c.fleet.push(record(s));
  }
  return c;
}

/** Your ships afloat right now (in this world, or waiting on the surface while you're in a zone). */
export function liveShips(game) {
  const all = game.stashedShips ? [...game.ships, ...game.stashedShips()] : game.ships;
  return all.filter((s) => s.owner === 'player' && !s.sunk && s.alive !== false);
}
export const liveShip = (game, uid) => liveShips(game).find((s) => s.uid === uid) || null;

/** Do you own a ship like that (pred gets her class, fitted out), afloat or laid up? */
export function ownsShip(game, pred = () => true) {
  const f = game.state?.char?.fleet;
  if (f?.length) return f.some((e) => SHIPS[e.type] && pred(shipStats(e.type, e.upgrades)));
  return (game.ships || []).some((s) => s.owner === 'player' && !s.sunk && pred(s.def));
}

/**
 * A quest that would hand you a ship of `type`: only if every ship you own
 * is worse (by her worth: what a shipwright asks for her). With one as good
 * or better you're told so and given nothing. Returns true when she's yours to take.
 */
export function shipRewardWanted(game, type, giver = 'They') {
  const want = SHIPS[type]?.price || 0;
  const f = game.state?.char?.fleet || [];
  const best = Math.max(0, ...f.map((e) => SHIPS[e.type]?.price || 0), ...(game.ships || []).filter((s) => s.owner === 'player' && !s.sunk).map((s) => s.def?.price || 0));
  if (best < want) return true;
  game.ui?.toast('NO NEW SHIP', `${giver} would have given you a ${SHIPS[type]?.name || type} — but the ship you have is as good or better.`, '#b0bec5');
  return false;
}

/** Is the player aboard her (at the helm or the oars, or anywhere on her decks)? */
export const aboard = (p, s) => !!p && !!s && ((p.mode === 'sail' && p.ship === s) || p.deck?.ship === s);

/** The pier a ship lies at (the nearest pier head she's alongside), or null. */
export function dockOf(w, s) {
  let best = null, bd = Infinity;
  for (const isl of w.islands || []) {
    const R = (isl.radius || 0) + 80;
    if (!isl.docks?.length || Math.abs(w.dx(isl.x, s.x)) > R || Math.abs(isl.y - s.y) > R) continue;
    for (const dk of isl.docks) {
      const e = dk.end || dk, hh = dk.headHalf ?? 2;
      const d = w.distance(s.x, s.y, e.x + 0.5, e.y + 0.5);
      // (a big ship lies alongside the head, her waist to it — or further out, where the water's shallow: see Ship.berth)
      const reach = Math.max(s.def.length * 0.6 + hh + 6, s.def.big ? Math.hypot(s.def.length * 0.5 + 12, s.def.beam * 0.5 + hh + 3) : 0);
      if (d < reach && d < bd) { bd = d; best = dk; }
    }
  }
  return best;
}

/** Take a ship out of the world (she's still yours: laid up in the yards). */
export function layUp(game, s) {
  const p = game.player;
  recordShip(game.state?.char, s);
  for (const a of s.aboard || []) if (a !== p && a.deck?.ship === s) a.deck = null;
  s.aboard?.clear?.();
  s.captain = null; s.passengers = [];
  s.alive = false;
  game.ships = game.ships.filter((x) => x !== s);
}

/**
 * Put a ship of yours in the water at a pier, ready to board: one you own
 * brought round (taken from wherever she was afloat), or a new one ({ type,
 * name } without a uid: she joins the fleet). Anything of yours already lying
 * at that pier goes into the yard to make room (never the one you're
 * standing on). Returns { ship, laidUp: [names] }, or { why: 'aboard' | 'here', ship }.
 */
export function launchShip(game, rec, dock) {
  const c = game.state.char, p = game.player, w = game.world;
  const old = rec.uid ? liveShip(game, rec.uid) : null;
  if (old && aboard(p, old)) return { why: 'aboard', ship: old };
  if (old && dockOf(w, old) === dock) return { why: 'here', ship: old };
  const laidUp = [];
  // (one boat of yours afloat at a time: bringing one round — or a new one —
  // lays up whichever else is out, wherever she lies, unless you're aboard her)
  for (const o of liveShips(game)) {
    if (o === old || aboard(p, o)) continue;
    layUp(game, o);
    laidUp.push(o.name);
  }
  if (old) layUp(game, old);
  const e = (rec.uid && fleetOf(c).find((x) => x.uid === rec.uid)) || rec;
  const s = game.giveShip(e.type, dock.moor.x, dock.moor.y, e.name, { uid: e.uid, upgrades: (e.upgrades || []).slice(), coated: e.coated, shot: e.shot, paint: e.paint });
  // (a big ship berthed on top of another hull at the pier: out into the roads with her)
  if (s.shipIn(game, s.x, s.y, s.heading)) s.unstick(w, true);
  s.anchored = true; s.speed = 0;
  // (she's your ship now: the one you'll be sailing)
  if (p.mode !== 'sail') p.ship = s;
  c.activeShip = s.uid;
  return { ship: s, laidUp };
}

/** A ship assigned to you (the Navy's): she waits in the yards until a shipwright brings her round. */
export function orderShip(game, type, name, from) {
  const c = game.state?.char;
  if (!c || !SHIPS[type]) return null;
  const e = { uid: `s${Date.now().toString(36)}n${uidCounter++}`, type, name, upgrades: [], coated: false, from };
  fleetOf(c).push(e);
  game.ui?.toast('A SHIP FOR YOU', `${name} (${SHIPS[type].name}): any harbour's shipwright will bring her round`, '#ffe082');
  game.log?.(`${from ? from[0].toUpperCase() + from.slice(1) + ' assigns you' : 'You are assigned'} the ${name}, a ${SHIPS[type].name}. The shipwright on any pier can bring her round (Spawn ship).`, '#ffe082');
  return e;
}

export function installFleet(game) {
  // (with SHIPS_UNBREAKABLE off a ship of yours can still go down, and she's gone for good)
  game.on('shipSunk', (s) => { if (s.owner === 'player' && s.uid) dropShip(game.state?.char, s.uid); });
  game.ownsShip = (pred) => ownsShip(game, pred);
}
