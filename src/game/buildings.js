// Enterable buildings at runtime. Doors swing open for whoever walks up —
// unless they're locked: people's homes (knock — and if nobody lets you in,
// you may choose to kick the door in) and shops outside their opening
// hours. Keepers stand behind their counters, residents are at home (more of
// them at night), drinkers sit in the taverns, and one house in a dozen is a
// pirates' hideout. NPCs find the door instead of walking into walls.
//
// Breaking a door down is a crime (a bounty — or, for a Marine, lost standing)
// unless the house belongs to pirates: nobody reports a burglary on them.
// Blows never break a door: kicking it in is always a choice.
import { layoutOf, doorOf, HOURS, KEEPER, WALL_T, roomOf, interiorRect } from '../world/interiors.js';
import { bw, bl } from '../world/bframe.js';
import { crime, raiseAlarm, seaOf } from './reputation.js';
import { makeLook } from '../data/races.js';
import { makeEnemy } from './npcs.js';
import { civilianOutfit, randomName, townRaces } from './spawner.js';
import { RNG } from '../core/rng.js';
import { earn, addItem } from './inventory.js';
import { persist } from './lineage.js';

const SEA_LEVEL = { east_blue: 5, north_blue: 7, west_blue: 7, south_blue: 7, polar: 8, paradise: 20, calm_belt: 22, sky: 24, undersea: 30, red_line: 34, new_world: 45 };

const FLAT = { rug: 1, tatami: 1, mats: 1, lamp: 1, picture: 1, poster: 1, wanted: 1, redcross: 1, board: 1, flag: 1, marineflag: 1 };

export function installBuildings(game) {
  const B = {
    near: [],
    t: 0,
    key(b) { return `${game.world.id}:${Math.round(b.x * 2)}:${Math.round(b.y * 2)}`; },
    /** World points of the door: out front, in the doorway, just inside (and its local x). */
    doorPts(b) {
      const d = doorOf(b), w = game.world;
      const pt = (z) => { const q = bw(b, d.x, z); return { x: w.wx(q.x), y: q.y }; };
      return { out: pt(0.75), mid: pt(-WALL_T / 2), in: pt(-WALL_T - 0.75), dw: d.dw, lx: d.x };
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
      // homes are private: knock, and wait to be asked in (or break the door down)
      if (role === 'house') return c?.flags?.['invited_' + B.key(b)] !== game.env.day;
      const h = HOURS[role];
      return h ? !(t >= h[0] && t < h[1]) : false;
    },
    opensAt(b) { const h = HOURS[b.role || 'house']; return h ? h[0] : 6; },
    /** Clear floor inside `b` at a world point (not in any furniture, chairs and rugs aside)? */
    freeAt(b, x, y, r = 0.35) {
      const L = layoutOf(b);
      const { lx, lz } = bl(b, x, y, game.world);
      if (lx < L.x0 + r || lx > L.x1 - r || lz < L.z0 + r || lz > L.z1 - r) return false;
      for (const it of L.items) {
        if (FLAT[it.k]) continue;
        // (seats placed as decoration have no rect of their own)
        const hw = (it.w || 0.4) / 2, hd = (it.d || 0.4) / 2;
        const q = it.rect || { x0: it.x - hw, x1: it.x + hw, z0: it.z - hd, z1: it.z + hd };
        if (lx > q.x0 - r && lx < q.x1 + r && lz > q.z0 - r && lz < q.z1 + r) return false;
      }
      return true;
    },
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
          game.hint?.('interiors', 'You can walk into buildings. Talk to the keeper at the counter to trade or rent a room; homes are locked — knock (E), and if nobody lets you in you can choose to kick the door down (a crime, unless it\'s a pirates\' den).');
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
        for (const a of game.actorsNear(d.mid.x, d.mid.y, 2.1)) {
          if (!a.alive || a.state === 'dead' || a.onShip) continue;
          const q = bl(b, a.x, a.y, w);
          const dx = Math.abs(q.lx - d.lx), dy = Math.abs(q.lz + WALL_T / 2);
          // someone standing in the open doorway: don't shut it on them (just
          // leaning on a shut door doesn't count — that's how locks get opened)
          if (b.doorOpen && dx < d.dw / 2 + a.r && dy < WALL_T / 2 + a.r - 0.08) blocking = true;
          // a locked door opens only for whoever lives there, and only as they come and go
          const allowed = a.isPlayer ? !locked || B.inside(a, b) : !locked || (a.homeB === b && a.moving);
          if (allowed && a.state !== 'knocked' && (dx < 1.2 && dy < 1.5)) want = true;
        }
      }
      if (blocking) want = true;
      if (want !== !!b.doorOpen) {
        b.doorOpen = want;
        if (want && b.doorCol) { w.removeCol(b.doorCol); b.doorCol = null; }
        if (!want && !b.doorCol && b.doorBox) b.doorCol = w.addCol({ ...b.doorBox });
        if (!broken && w.distance(p.x, p.y, d.mid.x, d.mid.y) < 14) game.audio?.sfx(want ? 'door' : 'doorshut');
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

    /** Kick the door in (chosen after knocking: see npcs.js knock). */
    breakDoor(b) {
      const c = game.state?.char;
      if (!c) return;
      const d = B.doorPts(b);
      c.world.doors = c.world.doors || {};
      c.world.doors[B.key(b)] = game.env.day;
      b.doorOpen = true;
      if (b.doorCol) { game.world.removeCol(b.doorCol); b.doorCol = null; }
      game.fx.burst(d.mid.x, d.mid.y, 22, { color: ['#8d6e4a', '#5a3a22', '#c8a27a', '#3e2723'], speed: 5, vz: 3.5, g: 9, life: 0.8, kind: 'shard', size: 0.14 });
      game.fx.burst(d.mid.x, d.mid.y, 10, { color: ['#d7ccc8', '#bcaaa4'], speed: 2, vz: 1, g: 0.5, life: 0.9, kind: 'dust', size: 0.3, grow: 0.6 });
      game.fx.sfx?.(d.mid.x, d.mid.y - 1.2, 'BAKOOM!!', '#ffcc80', 0.5);
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
          raiseAlarm(game, d.mid.x, d.mid.y, 'Burglar');
        } else if (Math.random() < 0.35) raiseAlarm(game, d.mid.x, d.mid.y, 'Burglar'); // a neighbour saw
      }
      persist(game);
    },

    /** A pirates' hoard: nobody reports a theft from pirates. */
    lootHideout(b) {
      const c = game.state.char;
      const key = 'hideout_' + B.key(b);
      const guards = game.actors.filter((a) => a.homeB === b && a.alive && a.state === 'idle');
      if (guards.length) { game.log('Not with the crew still standing!', '#ff8a80'); return; }
      const lvl = SEA_LEVEL[seaOf(game)] || 5;
      // (hoards emptied before chests could be looked into stay empty)
      if (c.world.chests[key] && !c.world.containers?.[key]) { game.log('The hoard is empty — you took it all.', '#b0bec5'); return; }
      game.containers.open(key, 'hoard', { title: "The pirates' hoard", sub: 'A sea chest crammed with their plunder.', o: { tier: 1 + lvl / 6 }, onEmpty: () => { c.world.chests[key] = true; } });
    },

    /** Where an NPC heading for (tx, ty) should steer to get through a door (or null). */
    route(a, tx, ty) {
      const w = game.world;
      const ba = w.interiorAt(a.x, a.y), bt = w.interiorAt(tx, ty);
      if (ba === bt) return null;
      const b = ba || bt;
      const d = B.doorPts(b);
      // (worked out in the building's own frame: the door in the front wall at z = 0)
      const q = bl(b, a.x, a.y, w);
      const ax = Math.abs(q.lx - d.lx);
      const zIn = -WALL_T - 0.75, zOut = 0.75;
      const at = (z) => { const r = bw(b, d.lx, z); return { x: w.wx(r.x), y: r.y }; };
      if (ba) {
        // inside: line up with the door, then walk out
        if (ax > 0.3 && q.lz < zIn + 0.35) return at(zIn);
        if (ax > 0.3) return at(Math.min(q.lz, zIn));
        return at(zOut);
      }
      // outside: get in front of the door, then walk in
      if (ax > 0.3 || q.lz > zOut + 0.4 || q.lz < 0) return at(zOut);
      return at(zIn);
    },

    /** "E" things around enterable buildings (for interact.js). */
    candidates(p, out) {
      const w = game.world;
      const inB = w.interiorAt(p.x, p.y);
      for (const b of B.near) {
        const d = B.doorPts(b);
        // a shut, locked door in front of you
        if (!inB && b.doorLocked && !b.doorOpen) {
          const step = bw(b, d.lx, 0.55);
          const dist = w.distance(p.x, p.y, step.x, step.y);
          if (dist < 1.4) {
            const house = (b.role || 'house') === 'house';
            const label = house || b.pirate ? 'Knock on the door' : `${b.name || 'Closed'} — closed until ${B.opensAt(b)}:00`;
            out.push({ d: dist, x: d.mid.x, y: d.mid.y, label, run: () => game.emit('knockDoor', b) });
          }
        }
        if (inB !== b) continue;
        // things to use inside
        const L = layoutOf(b);
        let li = 0;
        for (const u of L.use) {
          const idx = u.kind === 'loot' ? li++ : -1;
          const { x: ux, y: uy } = bw(b, u.x, u.z);
          const dist = w.distance(p.x, p.y, ux, uy);
          if (dist > 1.25) continue;
          if (u.kind === 'loot') {
            const label = b.pirate ? "Open the pirates' hoard" : `${u.label} (a crime)`;
            out.push({ d: dist, x: ux, y: uy, label, run: () => (b.pirate ? B.lootHideout(b) : B.search(b, idx, u.label)) });
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

    /**
     * Search a chest or drawers in somebody's home: look at what's inside, take
     * what you like. The first thing you take is the theft (anyone home sees
     * it; if not, you may still be spotted).
     */
    search(b, idx, label) {
      const key = `home_${B.key(b)}_${idx}`;
      const what = /drawer/i.test(label || '') ? 'drawers' : /chest/i.test(label || '') ? 'chest' : /cupboard/i.test(label || '') ? 'cupboard' : 'chest';
      game.containers.open(key, 'home', {
        title: `Searching the ${what}`,
        sub: 'Someone lives here. Anything you take is stolen.',
        onTake: () => {
          const c = game.state.char, p = game.player;
          const watchers = game.actors.filter((a) => a.homeB === b && a.alive && a.state === 'idle' && !a.keeper);
          c.stats.thefts = (c.stats.thefts || 0) + 1;
          const d = B.doorPts(b);
          if (watchers.length) {
            for (const a of watchers) game.fx.text(a.x, a.y - 2.1, 'THIEF!!', '#ff5252', 0.4, { life: 1.4 });
            raiseAlarm(game, d.mid.x, d.mid.y, 'Thief');
            crime(game, 300000, 'caught robbing a home', { rep: 5 });
          } else {
            crime(game, 120000, 'stole from a home', { rep: 3 });
            if (Math.random() > 0.3 + p.attrs.agi * 0.006) raiseAlarm(game, p.x, p.y, 'Burglar');
          }
        },
      });
    },
  };
  game.buildings = B;
  game.on('tick', (dt) => B.update(dt));
  game.on('characterStart', () => { B.near = []; B.t = 0; });
  game.spawner.addBuilder((ctx) => populate(game, ctx));
}

// ------------------------------------------------------------ people inside

function worldPt(b, x, z) { return bw(b, x, z); }

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
    // (pirates at home don't come looking for a fight: they fight whoever
    // breaks in, or lays a hand on one of them — see breakDoor, ai.js onHurt)
    a.calm = true;
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
