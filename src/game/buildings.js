// Enterable buildings at runtime. Doors swing open for whoever walks up —
// unless they're locked: people's homes (knock, or kick the door in) and
// shops outside their opening hours. Keepers stand behind their counters,
// residents are at home (more of them at night), drinkers sit in the
// taverns, and one house in a dozen is a pirates' hideout. NPCs find the
// door instead of walking into walls.
//
// Breaking a door down is a crime (a bounty — or, for a Marine, lost standing)
// unless the house belongs to pirates: nobody reports a burglary on them.
import { layoutOf, doorOf, HOURS, KEEPER, WALL_T, roomOf, interiorRect } from '../world/interiors.js';
import { crime, raiseAlarm, robHouse, seaOf } from './reputation.js';
import { makeLook } from '../data/races.js';
import { makeEnemy } from './npcs.js';
import { civilianOutfit, randomName, townRaces } from './spawner.js';
import { RNG } from '../core/rng.js';
import { earn, addItem } from './inventory.js';
import { persist } from './lineage.js';

const SEA_LEVEL = { east_blue: 5, north_blue: 7, west_blue: 7, south_blue: 7, polar: 8, paradise: 20, calm_belt: 22, sky: 24, undersea: 30, red_line: 34, new_world: 45 };

export function installBuildings(game) {
  const B = {
    near: [],
    t: 0,
    key(b) { return `${game.world.id}:${Math.round(b.x * 2)}:${Math.round(b.y * 2)}`; },
    /** World points of the door: out front, in the doorway, just inside. */
    doorPts(b) {
      const d = doorOf(b);
      const x = game.world.wx(b.x + d.x);
      return { x, out: b.y + 0.75, mid: b.y - WALL_T / 2, in: b.y - WALL_T - 0.75, dw: d.dw };
    },
    isBroken(b) {
      const day = game.state?.char?.world?.doors?.[B.key(b)];
      return day !== undefined && game.env.day - day < 2;
    },
    /** Locked right now? (homes; shops outside their hours; pirate hideouts) */
    isLocked(b) {
      if (B.isBroken(b)) return false;
      const c = game.state?.char;
      const role = b.role || 'house';
      const t = game.env.clock;
      if (b.pirate) return true;
      if (role === 'house') {
        if (b.npc) return !(t >= 6 && t < 22); // a named person's home: callers welcome by day
        return c?.flags?.['invited_' + B.key(b)] !== game.env.day;
      }
      const h = HOURS[role];
      return h ? !(t >= h[0] && t < h[1]) : false;
    },
    opensAt(b) { const h = HOURS[b.role || 'house']; return h ? h[0] : 6; },
    inside(a, b) { return game.world.interiorAt(a.x, a.y) === b; },

    update(dt) {
      const p = game.player, w = game.world;
      if (!p || !w?.objects) return;
      if ((B.t -= dt) <= 0) {
        B.t = 0.5;
        B.near = w.objects.near(p.x, p.y, 45, (o) => o.enterable);
        for (const b of B.near) w.objects.addFurniture(b);
        B.guardBases(p);
      }
      for (const b of B.near) B.door(b, p, dt);
      // walking in and out
      const room = w.interiorAt(p.x, p.y);
      if (room !== B.room) {
        const prev = B.room;
        B.room = room;
        if (room) {
          game.emit('enteredBuilding', room);
          game.hint?.('interiors', 'You can walk into buildings. Talk to the keeper at the counter to trade or rent a room; homes are locked — knock, or kick the door in (a crime, unless it\'s a pirates\' den).');
        } else if (prev) game.emit('leftBuilding', prev);
      }
    },

    /** Open or shut one door (and its collider). */
    door(b, p, dt) {
      const w = game.world;
      const d = B.doorPts(b);
      const broken = B.isBroken(b);
      const locked = !broken && B.isLocked(b);
      let want = broken, blocking = false;
      if (!want) {
        for (const a of game.actorsNear(d.x, d.mid, 2.1)) {
          if (!a.alive || a.state === 'dead' || a.onShip) continue;
          const dx = Math.abs(w.dx(d.x, a.x)), dy = Math.abs(a.y - d.mid);
          if (dx < d.dw / 2 + a.r + 0.05 && dy < WALL_T / 2 + a.r + 0.05) blocking = true; // someone in the doorway
          const allowed = a.isPlayer ? !locked || B.inside(a, b) : !locked || a.homeB === b;
          if (allowed && a.state !== 'knocked' && (dx < 1.2 && dy < 1.5)) want = true;
        }
      }
      if (blocking) want = true;
      if (want !== !!b.doorOpen) {
        b.doorOpen = want;
        if (want && b.doorCol) { w.removeCol(b.doorCol); b.doorCol = null; }
        if (!want && !b.doorCol && b.doorBox) b.doorCol = w.addCol({ ...b.doorBox });
        if (!broken && w.distance(p.x, p.y, d.x, d.mid) < 14) game.audio?.sfx(want ? 'door' : 'doorshut');
      }
      b.doorBroken = broken;
      b.doorLocked = locked;
      if (b.doorShake > 0) b.doorShake = Math.max(0, b.doorShake - dt);
    },

    /** Wanted players who walk into a Marine base get arrested (or fought). */
    guardBases(p) {
      const c = game.state?.char;
      if (!c || game.wanted?.tier() < 2 || p.disguised) return;
      const b = game.world.interiorAt(p.x, p.y);
      if (!b || roomOf(b) !== 'marine') return;
      for (const a of game.actors) {
        if (a.homeB !== b || !a.alive || a.state !== 'idle' || a.faction !== 'marine') continue;
        if (!a.provoked) game.fx.text(a.x, a.y - 2.1, "You're on the wanted list! Seize them!", '#fff', 0.32, { life: 1.8 });
        a.provoked = true; a.aggroPlayer = true;
        if (a.controller) { a.controller.kind = 'hostile'; a.controller.target = p; a.controller.state = 'chase'; }
      }
    },

    /** A player's swing landing on a shut door (doors can be beaten down). */
    strike(h) {
      const p = game.player, w = game.world;
      if (!p || h.owner !== p) return;
      for (const b of B.near) {
        if (b.doorOpen || !b.doorLocked) continue;
        const d = B.doorPts(b);
        const reach = (h.range || 1.2) + 0.8;
        if (w.distance(h.x, h.y, d.x, d.mid + 0.3) > reach || w.distance(p.x, p.y, d.x, d.mid) > 2.6) continue;
        if (p.y < b.y - WALL_T && !B.inside(p, b)) continue;
        b.doorHp = (b.doorHp ?? (b.pirate ? 5 : 3)) - (h.heavy || (h.damage || 0) > 20 ? 2 : 1);
        b.doorShake = 0.35;
        game.fx.burst(d.x, d.mid + 0.1, 6, { color: ['#8d6e4a', '#5a3a22', '#c8a27a'], speed: 3, vz: 2, g: 9, life: 0.5, kind: 'shard', size: 0.1 });
        game.fx.shake(0.15);
        game.audio?.sfx('knock');
        if (b.doorHp <= 0) B.breakDoor(b);
        else if (b.doorHp === 1) game.fx.text(d.x, d.mid - 1.6, 'CRACK!', '#ffcc80', 0.34, { life: 0.8 });
        return;
      }
    },

    /** Kick the door in. */
    breakDoor(b) {
      const c = game.state?.char;
      if (!c) return;
      const d = B.doorPts(b);
      c.world.doors = c.world.doors || {};
      c.world.doors[B.key(b)] = game.env.day;
      b.doorHp = undefined;
      b.doorOpen = true;
      if (b.doorCol) { game.world.removeCol(b.doorCol); b.doorCol = null; }
      game.fx.burst(d.x, d.mid, 22, { color: ['#8d6e4a', '#5a3a22', '#c8a27a', '#3e2723'], speed: 5, vz: 3.5, g: 9, life: 0.8, kind: 'shard', size: 0.14 });
      game.fx.burst(d.x, d.mid, 10, { color: ['#d7ccc8', '#bcaaa4'], speed: 2, vz: 1, g: 0.5, life: 0.9, kind: 'dust', size: 0.3, grow: 0.6 });
      game.fx.sfx?.(d.x, d.mid - 1.2, 'BAKOOM!!', '#ffcc80', 0.5);
      game.fx.shake(0.45);
      game.audio?.sfx('doorbreak');
      const home = game.actors.filter((a) => a.homeB === b && a.alive && a.state === 'idle');
      if (b.pirate) {
        game.log("A pirates' hideout! Nobody here is going to call the Marines — but the crew inside will fight.", '#ffcc80');
        for (const a of home) {
          a.provoked = true; a.aggroPlayer = true;
          if (a.controller) { a.controller.target = game.player; a.controller.state = 'chase'; }
        }
      } else {
        crime(game, 300000, 'broke down a door', { rep: 4 });
        if (home.length) {
          for (const a of home) {
            game.fx.text(a.x, a.y - 2.1, a.keeper ? 'THIEF! GUARDS!' : 'BURGLAR!!', '#ff5252', 0.4, { life: 1.6 });
            if (a.controller && !a.keeper) { a.controller.state = 'flee'; a.controller.fleeFrom = game.player; a.controller.fleeT = 6; }
          }
          raiseAlarm(game, d.x, d.mid, 'Burglar');
        } else if (Math.random() < 0.35) raiseAlarm(game, d.x, d.mid, 'Burglar'); // a neighbour saw
      }
      persist(game);
    },

    /** A pirates' hoard: nobody reports a theft from pirates. */
    lootHideout(b) {
      const c = game.state.char;
      const key = 'hideout_' + B.key(b);
      if (c.world.chests[key]) { game.log('The hoard is empty — you took it all.', '#b0bec5'); return; }
      const guards = game.actors.filter((a) => a.homeB === b && a.alive && a.state === 'idle');
      if (guards.length) { game.log('Not with the crew still standing!', '#ff8a80'); return; }
      c.world.chests[key] = true;
      const rng = new RNG(key + c.runSeed);
      const lvl = SEA_LEVEL[seaOf(game)] || 5;
      earn(game, Math.round(rng.range(900, 2600) * (1 + lvl / 6)), "from the pirates' hoard");
      addItem(game, rng.pick(['jewels', 'gold_coins', 'gold_coins', 'jewels', 'golden_statue']), 1);
      if (rng.chance(0.3)) addItem(game, rng.pick(['rum', 'sake', 'meat', 'bandage']), 1);
      game.audio?.sfx('treasure');
      persist(game);
    },

    /** Where an NPC heading for (tx, ty) should steer to get through a door (or null). */
    route(a, tx, ty) {
      const w = game.world;
      const ba = w.interiorAt(a.x, a.y), bt = w.interiorAt(tx, ty);
      if (ba === bt) return null;
      const b = ba || bt;
      const d = B.doorPts(b);
      const ax = Math.abs(w.dx(d.x, a.x));
      if (ba) {
        // inside: line up with the door, then walk out
        if (ax > 0.3 && a.y < d.in + 0.35) return { x: d.x, y: d.in };
        if (ax > 0.3) return { x: d.x, y: Math.min(a.y, d.in) };
        return { x: d.x, y: d.out };
      }
      // outside: get in front of the door, then walk in
      if (ax > 0.3 || a.y > d.out + 0.4 || a.y < b.y) return { x: d.x, y: d.out };
      return { x: d.x, y: d.in };
    },

    /** "E" things around enterable buildings (for interact.js). */
    candidates(p, out) {
      const w = game.world;
      const inB = w.interiorAt(p.x, p.y);
      for (const b of B.near) {
        const d = B.doorPts(b);
        // a shut, locked door in front of you
        if (!inB && b.doorLocked && !b.doorOpen) {
          const dist = w.distance(p.x, p.y, d.x, d.out - 0.2);
          if (dist < 1.4) {
            const house = (b.role || 'house') === 'house';
            const label = house || b.pirate ? 'Knock on the door' : `${b.name || 'Closed'} — closed until ${B.opensAt(b)}:00`;
            out.push({ d: dist, x: d.x, y: d.mid, label, run: () => game.emit('knockDoor', b) });
          }
        }
        if (inB !== b) continue;
        // things to use inside
        const L = layoutOf(b);
        for (const u of L.use) {
          const ux = b.x + u.x, uy = b.y + u.z;
          const dist = w.distance(p.x, p.y, ux, uy);
          if (dist > 1.25) continue;
          if (u.kind === 'loot') {
            const label = b.pirate ? "Take the pirates' hoard" : `${u.label} (a crime)`;
            out.push({ d: dist, x: ux, y: uy, label, run: () => (b.pirate ? B.lootHideout(b) : B.robInside(b)) });
          } else if (u.kind === 'service') {
            const keeper = game.actors.find((a) => a.homeB === b && (a.keeper || a.npcId) && a.alive && a.state === 'idle');
            if (keeper) continue; // talk to them instead
            out.push({ d: dist + 0.2, x: ux, y: uy, label: `Ring for the ${(KEEPER[L.room] || 'keeper').toLowerCase()}`, run: () => game.emit('enterBuilding', b) });
          } else if (u.kind === 'read') {
            out.push({ d: dist, x: ux, y: uy, label: u.label, run: () => game.interactions?.library(b, w.islandAt(b.x, b.y)) });
          }
        }
      }
    },

    /** Rob a house from the inside (anyone home sees you). */
    robInside(b) {
      const watchers = game.actors.filter((a) => a.homeB === b && a.alive && a.state === 'idle' && !a.keeper);
      robHouse(game, b);
      if (watchers.length) {
        for (const a of watchers) game.fx.text(a.x, a.y - 2.1, 'THIEF!!', '#ff5252', 0.4, { life: 1.4 });
        const d = B.doorPts(b);
        raiseAlarm(game, d.x, d.mid, 'Thief');
        crime(game, 400000, 'caught robbing a home', { rep: 5 });
      }
    },
  };
  game.buildings = B;
  game.on('tick', (dt) => B.update(dt));
  game.on('characterStart', () => { B.near = []; B.t = 0; });
  game.spawner.addBuilder((ctx) => populate(game, ctx));
}

// ------------------------------------------------------------ people inside

function worldPt(b, x, z) { return { x: b.x + x, y: b.y + z }; }

function populate(game, ctx) {
  const { island, rng, list, spawner } = ctx;
  const c = game.state?.char;
  if (!c) return;
  const clock = game.env.clock;
  const night = clock < 6 || clock >= 21;
  const lvl = SEA_LEVEL[island.def?.sea] || 5;
  for (const town of island.towns || []) {
    for (const b of town.buildings) {
      if (!b.enterable) continue;
      game.world.objects?.addFurniture(b);
      const L = layoutOf(b);
      const room = L.room;
      if (b.pirate) { hideout(game, b, L, rng, list, lvl); continue; }
      if (room === 'house') {
        if (b.npcSpawned || ctx.skipTownsfolk) continue;
        const n = night ? 1 + (rng.next() < 0.5 ? 1 : 0) : rng.next() < 0.45 ? 1 : 0;
        for (let i = 0; i < n && i < L.residents.length; i++) resident(game, b, L.residents[i], town, island, rng, list, spawner);
        continue;
      }
      if (L.keeper && !b.npcSpawned) keeper(game, b, L, town, island, rng, list, spawner, room);
      if (ctx.skipTownsfolk) continue;
      if (room === 'tavern' || room === 'inn' || room === 'restaurant') {
        for (const s of L.residents) if (rng.next() < (night ? 0.75 : 0.4)) resident(game, b, s, town, island, rng, list, spawner, true);
      }
      if (room === 'marine') for (const s of L.residents) if (s.guard) guard(game, b, s, rng, list, lvl);
    }
  }
}

const KEEPER_LOOK = {
  doctor: { coat: '#f5f5f5', top: '#90caf9' },
  church: { top: '#263238', bottom: '#263238' },
  tavern: { top: '#fafafa', bottom: '#3e2723' },
  inn: { top: '#fafafa', bottom: '#3e2723' },
  restaurant: { top: '#fafafa', bottom: '#fafafa', hat: 'chef' },
  dojo: { role: 'swordsman', top: '#eceff1', bottom: '#263238' },
  library: { top: '#5d4037' },
  bank: { top: '#263238', bottom: '#263238' },
  bounty: { top: '#37474f', bottom: '#263238' },
};

function keeper(game, b, L, town, island, rng, list, spawner, room) {
  const p = worldPt(b, L.keeper.x, L.keeper.z);
  const marine = room === 'marine';
  const race = rng.weighted(island.def.population || townRaces(island));
  const over = marine ? { role: 'officer', top: '#ffffff', bottom: '#1b4f72', hat: 'marine', coat: '#fafafa', coatText: 'JUSTICE' } : { ...civilianOutfit(town.style, rng), ...(KEEPER_LOOK[room] || {}) };
  const look = makeLook(race, rng.int(1, 1e9), over);
  const a = spawner.spawn({
    x: p.x, y: p.y, name: KEEPER[room] || 'Keeper', look, race, faction: marine ? 'marine' : 'civilian',
    attrs: marine ? { str: 14, agi: 12, end: 14, vit: 14, wil: 12 } : { str: 4, agi: 4, end: 4, vit: 4, wil: 4 },
    ai: { kind: marine ? 'guard' : 'idle' },
  }, list);
  settle(a, b, Math.PI / 2);
  a.keeper = true;
  a.talk = { kind: 'keeper', building: b };
  a.showName = true;
  a.nameColor = '#ffe082';
  if (marine) a.lethal = false;
}

function resident(game, b, s, town, island, rng, list, spawner, patron = false) {
  const p = worldPt(b, s.x, s.z);
  const race = rng.weighted(island.def.population || townRaces(island));
  const look = makeLook(race, rng.int(1, 1e9), civilianOutfit(town.style, rng));
  const a = spawner.spawn({
    x: p.x, y: p.y, name: randomName(rng, race), look, race, faction: 'civilian', attrs: { str: 3, agi: 4, end: 3, vit: 3, wil: 3 },
    ai: { kind: 'wander' },
  }, list);
  settle(a, b, s.face ?? rng.range(0, Math.PI * 2));
  a.stationary = !!s.sit || patron;
  a.wanderRadius = 1.2;
  a.wanderBox = interiorRect(b);
  a.talk = { kind: 'townsfolk', town: town.name, island: island.name, seed: rng.int(0, 1e6) };
  a.showName = false;
}

function guard(game, b, s, rng, list, lvl) {
  const p = worldPt(b, s.x, s.z);
  const a = makeEnemy('marine', Math.max(4, Math.round(lvl * 0.9)), p.x, p.y, { hostile: false, ai: 'guard' });
  a.game = game;
  a.aggroPlayer = false;
  settle(a, b, Math.PI / 2);
  game.addActor(a);
  list.push(a);
}

function hideout(game, b, L, rng, list, lvl) {
  const c = game.state.char;
  if (c.world.chests['hideout_' + game.buildings.key(b)]) return; // already cleaned out
  const spots = L.residents.length ? L.residents : [{ x: 0, z: (L.z0 + L.z1) / 2 }];
  const n = 2 + (rng.next() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const s = spots[i % spots.length];
    const p = worldPt(b, s.x + (i >= spots.length ? 0.5 : 0), s.z);
    const a = makeEnemy(rng.pick(['pirate', 'pirate', 'pirate_gunner', 'brute']), Math.max(3, Math.round(lvl * (0.8 + rng.next() * 0.4))), p.x, p.y, {});
    a.game = game;
    settle(a, b, rng.range(0, Math.PI * 2));
    a.aggroPlayer = true;
    a.controller.aggroRange = 5;
    a.controller.leash = 7;
    game.addActor(a);
    list.push(a);
  }
}

/** Someone who lives or works inside `b`. */
function settle(a, b, face) {
  a.homeB = b;
  a.facing = face;
  a.faceHome = face;
  if (a.controller) a.controller.home = { x: a.x, y: a.y };
}
