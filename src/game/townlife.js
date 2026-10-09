// Town life: what ordinary people get up to. Instead of milling about at
// random, townsfolk pick something to do and go and do it — lean on a wall
// with their arms folded, sit on a barrel or a doorstep or the rim of the
// well, stop in the street for a chat, stroll from shop window to shop
// window, sweep in front of the shop, mind a market stall, fish off the end
// of the pier. Children play tag. At dusk people drift home through their
// front doors, the streets empty out and a drunk or two wobbles outside the
// tavern; in the morning they come out again.
import { doorOf, isEnterable, doorLocalX, interiorRect } from '../world/interiors.js';
import { bw, bfacing } from '../world/bframe.js';
import { makeLook } from '../data/races.js';
import { civilianOutfit, randomName, townRaces } from './spawner.js';
import { RNG } from '../core/rng.js';

// What people sit on: the height of its top (the props' own: render3d/props), and
// how far forward of its middle they sit — at the front of a barrel's lid or a
// crate's, the knees over its edge and the legs hanging down in front of it, not
// in the middle with their legs through its sides; on a haystack, on its flank
const SEAT_H = { barrel: 0.8, crate: 0.74, haystack: 0.72, well: 0.76, fountain: 0.63, bench: 0.52, step: 0.22, dock: 0.05 };
const SEAT_FWD = { barrel: 0.13, crate: 0.17, haystack: 0.42 };
const KID_STYLES = new Set(['village', 'town', 'port', 'snow', 'desert', 'wano', 'chinese', 'candy', 'fishman', 'mink', 'tribal', 'sky', 'giant']);
const CHATTER = [
  'Did you hear? Pirates were spotted off the coast!', 'The price of fish these days...', 'Ha ha ha! No way!', 'Is that so?!', 'My husband says the Marines are useless.',
  "They say there's a Devil Fruit hidden on this island.", 'Hmm, hmm.', 'And then he fell right in the harbour!', 'Did you see the new wanted posters?', 'What lovely weather.',
  "Business hasn't been the same since the Great Pirate Era began.", "I heard the Grand Line's weather is madness.", 'Oh, stop it, you!', 'Really? The Pirate King?!',
];
const KID_LINES = ["Tag! You're it!", "Can't catch me!", "I'm gonna be King of the Pirates!", 'Gomu Gomu nooo...!', 'No fair!', 'Hee hee!'];
const VEND_LINES = ['Fresh fruit! Get it while it\'s fresh!', 'Fish! Caught this morning!', 'Best prices on the island!', 'Come and look, come and look!'];
const DRUNK_LINES = ['Hic!', '...another round...', 'Binks\' Sake~ ♪', 'I\'m not drunk... hic!'];

// how many people are out, by the hour (a share of the town's crowd)
function outShare(clock) {
  if (clock >= 7 && clock < 18) return 1;
  if (clock >= 18 && clock < 21) return 0.75;
  if (clock >= 5 && clock < 7) return 0.4;
  if (clock >= 21 && clock < 23) return 0.35;
  return 0.15;
}
// How many people are out at the busiest hour: a few for every house in town
// (most are indoors at any one time), and even a big town's streets top out
// at a busy few dozen. (By its houses, not its size: a castle on a big lawn
// isn't a crowd.)
export const crowdOf = (town) => Math.min(44, Math.round(3 + (town.buildings?.length || 0) * 0.35));

export function installTownLife(game) {
  const T = game.townLife = {
    t: 0,
    update: (a, ai, dt) => think(game, a, ai, dt),
    spotsOf: (town, isl) => spotsOf(game, town, isl),
  };
  game.spawner.townsfolk = (town, isl, rng, list, ctx) => populate(game, town, isl, rng, list, ctx);
  game.on('tick', (dt) => {
    if ((T.t -= dt) > 0) return;
    T.t = 3;
    routines(game);
  });
}

// ------------------------------------------------------------ places

export function spotsOf(game, town, isl) {
  if (town._life) return town._life;
  const w = game.world;
  const S = { wall: [], shopfront: [], seat: [], stall: [], street: [], door: [], dock: [], tavern: [] };
  const clear = (x, y, r = 0.3) => w.walkable(x, y) && !w.isBlocked(x, y) && !w.hitsProp(x, y, r);
  for (const b of town.buildings) {
    const fw = Math.max(2, b.fw || 3);
    const d = isEnterable(b) ? doorOf(b) : { x: Math.max(-fw / 2 + 0.9, Math.min(fw / 2 - 0.9, doorLocalX(b))), dw: 1.05 };
    const role = b.role || 'house';
    const face = bfacing(b); // (standing with your back to the wall, looking out)
    // along the front wall, clear of the door and its steps, a good step apart
    // (people lean on a wall in ones and twos, not shoulder to shoulder)
    for (let x = -fw / 2 + 0.6; x <= fw / 2 - 0.6; x += 1.7) {
      if (Math.abs(x - d.x) < d.dw / 2 + 0.85) continue;
      const p = { ...bw(b, x, 0.36), face, b };
      if (!clear(p.x, p.y)) continue;
      S.wall.push(p);
      if (role !== 'house') S.shopfront.push({ ...p, ...bw(b, x, 0.75) });
    }
    // a doorstep to sit on (homes): the end of the low step, beside the door
    // rather than in it (walk-in homes have a flight of steps instead)
    if (role === 'house' && !isEnterable(b)) {
      const p = { ...bw(b, d.x + d.dw / 2 + 0.34, 0.3), face, h: SEAT_H.step, stand: bw(b, d.x + d.dw / 2 + 0.34, 0.95), b };
      if (clear(p.stand.x, p.stand.y) && clear(p.x, p.y, 0.2)) S.seat.push(p);
    }
    const out = { ...bw(b, d.x, 0.95), b };
    if (clear(out.x, out.y)) {
      if (role === 'house') S.door.push(out);
      if (role === 'tavern' || role === 'bar' || role === 'inn') S.tavern.push(out);
    }
  }
  const R = Math.max(town.w, town.h) * 0.75 + 8;
  for (const o of w.objects.near(town.x, town.y, R)) {
    if (o.kind === 'barrel' || o.kind === 'crate' || o.kind === 'haystack') {
      const face = Math.PI / 2;
      const r = (o.col?.r ?? 0.4) + 0.4;
      const stand = { x: o.x + Math.cos(face) * r, y: o.y + Math.sin(face) * r };
      const sc = o.s || 1, fwd = SEAT_FWD[o.kind] * sc;
      if (clear(stand.x, stand.y)) S.seat.push({ x: o.x + Math.cos(face) * fwd, y: o.y + Math.sin(face) * fwd, face, h: SEAT_H[o.kind] * sc, stand, o });
    } else if (o.kind === 'well' || o.kind === 'fountain' || o.kind === 'bench') {
      const sc = o.s || 1, rim = (o.kind === 'well' ? 0.74 : o.kind === 'fountain' ? 1.34 : 0) * sc;
      const n = o.kind === 'bench' ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const a = o.kind === 'bench' ? Math.PI / 2 : i * Math.PI / 2 + 0.5;
        const px = o.kind === 'bench' ? o.x + (i ? 0.35 : -0.35) : o.x + Math.cos(a) * rim, py = o.kind === 'bench' ? o.y : o.y + Math.sin(a) * rim;
        const stand = { x: px + Math.cos(a) * 0.6, y: py + Math.sin(a) * 0.6 };
        if (clear(stand.x, stand.y)) S.seat.push({ x: px, y: py, face: a, h: SEAT_H[o.kind] * sc, stand, o });
      }
    } else if (o.kind === 'stall') {
      // the stall faces the plaza; its keeper stands behind it
      const pl = town.plaza;
      const yaw = Math.atan2(w.dx(o.x, pl.x), pl.y - o.y);
      const x = o.x - Math.sin(yaw) * 0.72, y = o.y - Math.cos(yaw) * 0.72;
      S.stall.push({ x, y, face: Math.atan2(Math.cos(yaw), Math.sin(yaw)), o });
    }
  }
  for (const p of town.streetSpots || []) if (clear(p.x, p.y, 0.4)) S.street.push({ x: p.x, y: p.y, ax: p.ax, across: p.across });
  for (const ry of town.rows || []) {
    for (let x = town.x0 + 2; x < town.x1 - 1; x += 3) if (clear(x + 0.5, ry + 1.1, 0.4)) S.street.push({ x: x + 0.5, y: ry + 1.1 });
  }
  if (town.plaza) S.street.push({ x: town.plaza.x + 1.8, y: town.plaza.y + 1.8 });
  for (const dk of isl?.docks || []) {
    if (!dk.end || w.distance(dk.end.x, dk.end.y, town.x, town.y) > 70) continue;
    const face = Math.atan2(dk.dirY || 0, dk.dirX || 1);
    const x = dk.end.x + 0.5 - Math.cos(face) * 0.4, y = dk.end.y + 0.5 - Math.sin(face) * 0.4;
    S.dock.push({ x, y, face, h: SEAT_H.dock, stand: { x: x - Math.cos(face) * 0.7, y: y - Math.sin(face) * 0.7 } });
  }
  town._life = S;
  return S;
}

// ------------------------------------------------------------ people

function spawnFolk(game, town, isl, rng, list, at, kid = false) {
  const race = kid ? 'human' : rng.weighted(isl.def.population || townRaces(isl));
  const look = makeLook(race, rng.int(1, 1e9), civilianOutfit(town.style, rng));
  if (kid) { look.scale = 0.66 + rng.next() * 0.08; look.bulk = 0.9; }
  const a = game.spawner.spawn({
    x: at.x, y: at.y, name: kid ? 'Kid' : randomName(rng, race), look, race, faction: 'civilian',
    attrs: { str: 3, agi: kid ? 6 : 4, end: 3, vit: 3, wil: 3 }, ai: { kind: 'townsfolk' },
  }, list);
  a.talk = { kind: 'townsfolk', town: town.name, island: isl.name, seed: rng.int(0, 1e6) };
  a.showName = false;
  a.townsfolk = true;
  a.kid = kid;
  a.town = town;
  a.isl = isl;
  a.rng = new RNG(rng.int(0, 1e9));
  a.wanderRadius = 5;
  return a;
}

function populate(game, town, isl, rng, list, ctx) {
  const S = spotsOf(game, town, isl);
  const clock = game.env.clock;
  const day = clock >= 6 && clock < 19;
  // market stalls and fishing piers are worked by day
  if (day) {
    for (const st of S.stall) if (rng.next() < 0.85) {
      const a = spawnFolk(game, town, isl, rng, list, st);
      start(game, a, { kind: 'vend', spot: st, t: 1e6 }, true);
      a.talk = { kind: 'keeper', building: { role: 'market', name: 'Market Stall', town: town.id, x: st.x, y: st.y } };
      a.showName = true; a.name = 'Stallholder'; a.nameColor = '#ffe082';
    }
    for (const dk of S.dock.slice(0, 2)) if (rng.next() < 0.6) start(game, spawnFolk(game, town, isl, rng, list, dk.stand), { kind: 'fish', spot: dk, t: rng.range(120, 400) }, true);
    // children playing tag
    if (KID_STYLES.has(town.style) && S.street.length && rng.next() < 0.7) {
      const c = rng.pick(S.street);
      const n = 2 + (rng.next() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) start(game, spawnFolk(game, town, isl, rng, list, { x: c.x + i * 0.8, y: c.y }, true), { kind: 'play', center: c, t: rng.range(40, 120) }, true);
    }
  }
  if (!day || clock >= 20) {
    // (beside the door, out front — whichever way the tavern faces)
    for (const t of S.tavern.slice(0, 2)) if (rng.next() < 0.6) start(game, spawnFolk(game, town, isl, rng, list, bw(t.b, doorLocalX(t.b) + 1.4, 1.75)), { kind: 'drunk', t: rng.range(60, 200) }, true);
  }
  const n = Math.round(crowdOf(town) * outShare(clock));
  for (let i = 0; i < n; i++) {
    const at = S.street.length ? acrossOf(game.world, rng.pick(S.street), rng) : town.plaza;
    if (!at) break;
    const a = spawnFolk(game, town, isl, rng, list, { x: at.x, y: at.y });
    const act = pick(game, a);
    if (act) start(game, a, act, true);
    if (ctx?.onTownsfolk) ctx.onTownsfolk(a, town);
  }
}

/** Keep the streets as busy as the hour says: people come out of their homes, or go back in. */
function routines(game) {
  const clock = game.env.clock;
  for (const [id, list] of game.spawner.populated) {
    const isl = game.world.islands.find((i) => i.id === id);
    if (!isl) continue;
    for (const town of isl.towns || []) {
      const folk = list.filter((a) => a.alive && a.townsfolk && a.town === town && !a.kid && a.activity?.kind !== 'vend');
      const want = Math.round(crowdOf(town) * outShare(clock));
      const S = spotsOf(game, town, isl);
      if (folk.length > want + 1) {
        // someone heads home
        const a = folk.find((x) => x.activity?.kind !== 'goHome' && x.state === 'idle');
        const door = a && nearest(game, S.door, a);
        if (door) { start(game, a, { kind: 'goHome', to: indoors(game, door), t: 90 }); a.homeB = door.b; }
      } else if (folk.length < want - 1 && S.door.length) {
        // someone comes out of their front door
        const rng = new RNG(Math.floor(game.time * 1000) + folk.length);
        const d = rng.pick(S.door);
        if (game.world.distance(d.x, d.y, game.player.x, game.player.y) < 70) {
          // (from just inside: they come out through the door, which opens for them)
          const a = spawnFolk(game, town, isl, rng, list, indoors(game, d));
          a.homeB = d.b;
          const act = pick(game, a);
          if (act) start(game, a, act);
        }
      }
      // stallholders pack up at dusk
      if (clock >= 19 || clock < 6) for (const a of list) if (a.alive && a.town === town && a.activity?.kind === 'vend') { const door = nearest(game, S.door, a); if (door) { start(game, a, { kind: 'goHome', to: indoors(game, door), t: 90 }); a.homeB = door.b; } }
    }
  }
}

/** Somewhere across a street spot's width rather than on the street's middle line. */
function acrossOf(w, s, rng) {
  if (!s.across) return s;
  const [c0, c1] = s.across;
  const c = c0 + 0.5 + rng.next() * Math.max(0, c1 - c0 - 1);
  const p = s.ax ? { x: s.x + rng.range(-1, 1), y: c } : { x: c, y: s.y + rng.range(-1, 1) };
  return w.walkable(p.x, p.y) && !w.isBlocked(p.x, p.y) && !w.hitsProp(p.x, p.y, 0.4) ? p : s;
}

/**
 * Where to stroll next: a short walk down the street, not the far end of
 * town (the way round the houses is only worked out so far, and people
 * spread out instead of all heading for the same places), and somewhere
 * across the street rather than down its middle, so passers-by don't walk
 * in single file.
 */
function streetStop(game, a, S) {
  const w = game.world;
  const near = S.street.filter((s) => { const d = w.distance(s.x, s.y, a.x, a.y); return d > 5 && d < 28; });
  return acrossOf(w, a.rng.pick(near.length ? near : S.street), a.rng);
}

function nearest(game, pts, a) {
  let best = null, bd = Infinity;
  for (const p of pts) { const d = game.world.dist2(p.x, p.y, a.x, a.y); if (d < bd) { bd = d; best = p; } }
  return best;
}

// ------------------------------------------------------------ what to do next

function pick(game, a) {
  const S = spotsOf(game, a.town, a.isl);
  const r = a.rng;
  const clock = game.env.clock;
  const evening = clock >= 18 || clock < 6;
  const free = (list) => list.filter((s) => !s.taken || !s.taken.alive || (s.taken.activity?.spot !== s && !(s.taken._leaning && s.taken.x === s.x && s.taken.y === s.y)));
  const options = [];
  const walls = free(S.wall), seats = free(S.seat), fronts = free(S.shopfront);
  if (walls.length) options.push(['lean', 3]);
  if (seats.length) options.push(['sit', evening ? 4 : 2.5]);
  if (S.street.length) options.push(['stroll', evening ? 1.5 : 4]);
  options.push(['chat', 1.4]); // (a chat takes two)
  if (fronts.length && !evening) options.push(['sweep', 0.8]);
  let kind = r.weighted(options);
  if (kind === 'chat') {
    // find someone to talk to (or just stand about waiting for them)
    const mate = game.actorsNear(a.x, a.y, 14).find((b) => b !== a && b.townsfolk && !b.kid && b.state === 'idle' && (!b.activity || b.activity.kind === 'stroll' || b.activity.kind === 'lean'));
    if (mate) {
      const mx = (a.x + mate.x) / 2, my = (a.y + mate.y) / 2;
      let dx = game.world.dx(a.x, mate.x), dy = mate.y - a.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const pa = { x: mx - dx * 0.55, y: my - dy * 0.55, face: Math.atan2(dy, dx) };
      const pb = { x: mx + dx * 0.55, y: my + dy * 0.55, face: Math.atan2(-dy, -dx) };
      if (game.world.walkable(pa.x, pa.y) && game.world.walkable(pb.x, pb.y)) {
        const t = r.range(15, 40);
        start(game, mate, { kind: 'chat', spot: pb, t, mate: a });
        return { kind: 'chat', spot: pa, t, mate, speaker: true };
      }
    }
    kind = walls.length ? 'lean' : 'stroll';
  }
  if (kind === 'lean') return { kind, spot: r.pick(walls), t: r.range(15, 50) };
  if (kind === 'sit') return { kind, spot: r.pick(seats), t: r.range(20, 70) };
  if (kind === 'sweep') return { kind, spot: r.pick(fronts), t: r.range(20, 45) };
  if (!S.street.length) return null;
  return { kind: 'stroll', to: streetStop(game, a, S), t: r.range(25, 60), legs: 2 + Math.floor(r.next() * 3) };
}

/** Begin an activity: walk there (or appear there, when the town first fills). */
function start(game, a, act, now = false) {
  stop(a);
  a.activity = act;
  const spot = act.spot;
  if (spot) spot.taken = a;
  if (act.kind === 'play') { act.phase = 'do'; act.t = act.t ?? 60; return; }
  if (act.kind === 'drunk') { act.phase = 'do'; settle(a, act); return; }
  const to = act.to || (spot && (spot.stand || spot));
  if (now && spot) {
    a.x = spot.x; a.y = spot.y;
    act.phase = 'do';
    settle(a, act);
    return;
  }
  act.phase = 'go';
  act.goT = 0;
  act.dest = to;
}

/** Arrived: take up the spot and the pose. */
function settle(a, act) {
  const spot = act.spot;
  if (spot) { a.x = spot.x; a.y = spot.y; if (spot.face !== undefined) a.facing = spot.face; }
  act.phase = 'do';
  const P = { lean: 'lean', sit: 'sit', chat: 'chat', sweep: 'sweep', vend: 'vend', fish: 'fish', drunk: 'drunk' }[act.kind];
  const prop = { sweep: 'broom', fish: 'rod', drunk: 'mug' }[act.kind] || null;
  let h = spot?.h ?? (act.kind === 'sit' ? 0.45 : 0);
  // (on a barrel, a crate or a haystack: on its lid as it's drawn — stood on
  // the ground under its middle — however the ground falls away under you)
  const o = spot?.o, g = a.game;
  if (P === 'sit' && o && SEAT_H[o.kind] && g?.view3d?.ground && a.groundAt) h = SEAT_H[o.kind] * (o.s || 1) + g.view3d.ground(o.x, o.y) - a.groundAt(g, a.x, a.y);
  a.act3d = P ? { pose: P, prop, h } : null;
  a.faceHome = a.facing;
}

/** Home for the night: pottering about their own rooms like anyone living there (see buildings.js resident). */
function atHome(a, ai, b) {
  a.townsfolk = false;
  a.homeB = b;
  a.wanderRadius = 1.2;
  a.wanderBox = interiorRect(b);
  ai.kind = 'wander';
  ai.home = { x: a.x, y: a.y };
  ai.wanderTo = null;
}

/** Just inside a house's front door (a walk-in one; else its doorstep). */
function indoors(game, door) {
  return door.b?.enterable && game.buildings ? game.buildings.doorPts(door.b).in : door;
}

/** Leave whatever you were doing (step off the seat first). */
function stop(a) {
  const act = a.activity;
  if (!act) return;
  if (act.kind === 'goHome') a.homeB = null; // (not going in after all)
  if (act.spot?.taken === a) act.spot.taken = null;
  if (act.phase === 'do' && act.spot?.stand) { a.x = act.spot.stand.x; a.y = act.spot.stand.y; }
  a.activity = null;
  a.act3d = null;
}

function think(game, a, ai, dt) {
  const w = game.world, p = game.player;
  // (standing inside something solid — a pillar, a cart — step out to clear ground)
  if ((a.unstickT = (a.unstickT ?? Math.random() * 1.5) - dt) <= 0) {
    a.unstickT = 1.5;
    const seated = a.act3d && (a.act3d.pose === 'sit' || a.act3d.pose === 'vend');
    if (!seated && !w.interiorAt(a.x, a.y) && w.hitsProp(a.x, a.y, a.r * 0.5)) {
      const q = game.spawner.findFree(a.x, a.y, 2.5);
      if (q) { a.x = q.x; a.y = q.y; a.vx = a.vy = 0; }
    }
  }
  // hit, or their home broken into: drop everything and get away (a fight
  // that isn't theirs, they leave to the people in it)
  if (ai.state === 'flee') {
    if (a.activity) stop(a);
    return ai.wander(a, dt, game);
  }
  let act = a.activity;
  // (out of their front door: it shuts behind them — it isn't theirs to come and go by)
  if (a.homeB && act?.kind !== 'goHome' && !w.interiorAt(a.x, a.y)) a.homeB = null;
  if (!act) {
    act = pick(game, a);
    if (!act) return ai.wander(a, dt, game);
    start(game, a, act);
  }
  act.t -= dt;
  a.intent.mx = 0; a.intent.my = 0; a.intent.sprint = false;
  if (act.phase === 'go') {
    const d = ai.moveToward(a, act.dest.x, act.dest.y, game);
    a.intent.mx *= 0.45; a.intent.my *= 0.45;
    act.goT += dt;
    if (d < 0.45 || act.goT > 40) {
      if (act.kind === 'goHome') {
        // in through the front door (and out of the story — unless you're in
        // there to see them come home: then they're at home)
        const b = a.homeB;
        if (b && p && w.interiorAt(p.x, p.y) === b) { stop(a); atHome(a, ai, b); } else a.alive = false;
        return;
      }
      if (act.kind === 'stroll') {
        // look in a shop window for a moment, then carry on
        act.phase = 'pause'; act.pauseT = a.rng.range(2, 6);
        const front = nearest(game, spotsOf(game, a.town, a.isl).wall, a);
        if (front && w.distance(front.x, front.y, a.x, a.y) < 4) a.facing = Math.atan2(front.y - 0.36 - a.y, w.dx(a.x, front.x));
        return;
      }
      settle(a, act);
    }
    return;
  }
  if (act.phase === 'pause') {
    act.pauseT -= dt;
    if (act.pauseT <= 0) {
      if (--act.legs <= 0 || act.t <= 0) { stop(a); return; }
      const S = spotsOf(game, a.town, a.isl);
      act.dest = streetStop(game, a, S); act.phase = 'go'; act.goT = 0;
    }
    return;
  }
  // doing it
  switch (act.kind) {
    case 'chat': {
      const m = act.mate;
      if (!m || !m.alive || m.activity?.mate !== a) { stop(a); return; }
      if (m.activity.phase === 'do') a.facing = Math.atan2(m.y - a.y, w.dx(a.x, m.x));
      if (act.speaker && m.activity.phase === 'do' && (act.say = (act.say ?? 2) - dt) <= 0) {
        act.say = a.rng.range(5, 10);
        const who = a.rng.next() < 0.5 ? a : m;
        if (p && w.distance(who.x, who.y, p.x, p.y) < 12) game.fx.text(who.x, who.y - 2.05, a.rng.pick(CHATTER), '#fff', 0.24, { life: 2.6 });
      }
      break;
    }
    case 'play': {
      // tag: run about near where you started
      act.runT = (act.runT ?? 0) - dt;
      if (act.runT <= 0 || !act.dest) {
        act.runT = a.rng.range(1.2, 3);
        const c = act.center;
        act.dest = { x: c.x + a.rng.range(-5, 5), y: c.y + a.rng.range(-2.5, 2.5) };
        if (p && a.rng.next() < 0.12 && w.distance(a.x, a.y, p.x, p.y) < 12) game.fx.text(a.x, a.y - 1.5, a.rng.pick(KID_LINES), '#fff', 0.24, { life: 1.6 });
      }
      if (!w.walkable(act.dest.x, act.dest.y) || w.isBlocked(act.dest.x, act.dest.y)) { act.dest = null; break; }
      ai.moveToward(a, act.dest.x, act.dest.y, game);
      a.intent.sprint = true;
      break;
    }
    case 'vend': {
      if ((act.say = (act.say ?? 4) - dt) <= 0) {
        act.say = a.rng.range(8, 16);
        if (p && w.distance(a.x, a.y, p.x, p.y) < 10) game.fx.text(a.x, a.y - 2.05, a.rng.pick(VEND_LINES), '#fff', 0.26, { life: 2.2 });
      }
      break;
    }
    case 'drunk': {
      // wobble on the spot
      if ((act.say = (act.say ?? 3) - dt) <= 0) {
        act.say = a.rng.range(6, 12);
        if (p && w.distance(a.x, a.y, p.x, p.y) < 9) game.fx.text(a.x, a.y - 2.0, a.rng.pick(DRUNK_LINES), '#fff', 0.24, { life: 1.6 });
      }
      a.facing += Math.sin(game.time * 0.7 + a.seed) * dt * 0.4;
      break;
    }
  }
  if (act.t <= 0 && act.kind !== 'vend') stop(a);
}
