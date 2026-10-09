// Zones: Skypiea (via the Knock Up Stream), Fish-Man Island (dive with a
// coated ship at the foot of the Red Line), Impel Down (where the Marines
// send the pirates they capture). Each zone is its own small World; the
// surface state (ships, fog) is kept aside while you are away.
import { ZONES } from '../data/zones/index.js';
import { generateZoneWorld } from '../world/zonegen.js';
import { board } from './interact.js';
import { count } from './inventory.js';
import { persist } from './lineage.js';
import { findShore } from './interact.js';
import { formatBerries } from '../core/math.js';
import { npcDef, allNpcDefs, sizeBuildingsForOccupants } from './npcs.js';
import { inBubble, domeHeight } from '../world/bubble.js';
import { shipDims } from '../world/hull.js';

export function installZones(game) {
  const cache = new Map();
  let stash = null; // surface ships while in a zone

  const zoneWorld = (id) => {
    if (!cache.has(id)) {
      const w = generateZoneWorld(ZONES[id]);
      w.fog.fill(255);
      sizeBuildingsForOccupants(w);
      cache.set(id, w);
    }
    return cache.get(id);
  };
  game.zoneWorld = zoneWorld;
  game.inZone = () => (game.world !== game.surface ? game.world.id : null);
  // (the ships waiting on the surface while you're away: saved with the rest, see lineage.js)
  game.stashedShips = () => stash || [];
  game.on('characterStart', () => { if (game.world === game.surface) stash = null; });

  const spotIn = (world, islandId, spotId) => {
    const isl = world.islands.find((i) => i.id === islandId);
    if (!isl) return null;
    if (spotId && isl.spots[spotId]) return isl.spots[spotId];
    return { x: isl.x, y: isl.y };
  };

  const clearPopulation = () => {
    for (const id of [...game.spawner.populated.keys()]) {
      const isl = game.world.islands.find((i) => i.id === id);
      if (isl) game.spawner.depopulate(isl);
    }
    game.spawner.populated.clear();
    game.actors = game.actors.filter((a) => a === game.player || (a.crewId && a.alive));
    game.combat.hitboxes.length = 0;
    game.combat.projectiles.length = 0;
    game.groundItems = [];
    game.flotsam = [];
    game.bossTarget = null;
  };

  /** Enter a zone. opts: { byShip, x, y } (x/y used when resuming a save). */
  game.enterZoneById = (id, opts = {}, resuming = false) => {
    const z = ZONES[id];
    const p = game.player;
    if (!z || !p) return false;
    if (game.world !== game.surface) game.leaveZone(true);
    const c = game.state.char;
    const carried = opts.byShip && p.ship && !p.ship.sunk ? p.ship : null;
    clearPopulation();
    stash = game.ships.filter((s) => s !== carried);
    game.ships = carried ? [carried] : [];
    const w = zoneWorld(id);
    game.setWorld(w);
    game.renderer.terrain.updateFog(w.fog);
    // where do we appear?
    let pos = null;
    if (resuming && opts.x !== undefined) pos = { x: opts.x, y: opts.y };
    else if (z.arrive.island) pos = spotIn(w, z.arrive.island, z.arrive.spot);
    else pos = { x: z.arrive.x, y: z.arrive.y };
    if (carried) {
      carried.x = pos.x; carried.y = pos.y; carried.heading = z.arrive.heading ?? carried.heading;
      carried.zoneId = id;
      carried.speed = 0;
      if (!carried.fits(w, carried.x, carried.y, carried.heading)) carried.unstick(w);
      p.x = carried.x; p.y = carried.y;
      // (diving in: she comes down out of the deep over the bubble — see diveTick)
      if (opts.dive && carried.diving) {
        carried.diving = { phase: 'down', t: 0, from: diveStart(w, carried.x, carried.y) };
        carried.dive = carried.diving.from;
      } else { carried.diving = null; carried.dive = 0; }
    } else {
      p.mode = 'foot'; p.onShip = false; p.ship = null;
      let s = findShore(w, pos.x, pos.y, 6);
      if (!s) {
        // arriving without a ship: step onto the nearest island's dock
        const isl = w.nearestIsland(pos.x, pos.y);
        const d = isl?.docks?.[0];
        s = (d && findShore(w, d.land.x, d.land.y, 8)) || (isl && findShore(w, isl.x, isl.y, 30)) || pos;
      }
      p.x = s.x; p.y = s.y;
    }
    // ships that were left in this zone (resume)
    if (resuming) {
      for (const sd of c.ships || []) {
        if (sd.zone !== id || game.ships.some((s) => s.uid === sd.uid)) continue;
        const s = game.giveShip(sd.type, sd.x, sd.y, sd.name, sd);
        s.zoneId = id;
        s.hull = sd.hull ?? s.maxHull;
        if (resuming && opts.mode === 'sail' && sd.uid === c.activeShip) board(game, p, s);
      }
    }
    game.currentIsland = null;
    game.lastIslandName = null;
    game.lastRegion = undefined;
    game.snapCamera();
    game.env.zoneKind = z.kind;
    game.emit('enterZone', id);
    if (!resuming) {
      // (diving in, the banner waits till she's down: see diveTick)
      if (!opts.dive) game.ui.banner(z.name, z.altitude || '', z.kind === 'sky' ? 'Above the clouds, the sea is white.' : z.kind === 'undersea' ? '10,000 metres beneath the waves, a bubble of air and light.' : 'The Great Underwater Prison.', 5);
      persist(game);
    }
    return true;
  };

  /** Return to the surface. exit: a zone exit record (surface target). */
  game.leaveZone = (forced = false, exit = null) => {
    if (game.world === game.surface) return;
    const id = game.world.id;
    const z = ZONES[id];
    const p = game.player;
    const carried = p.mode === 'sail' && p.ship && !p.ship.sunk ? p.ship : null;
    clearPopulation();
    // ships left behind in the zone keep their zone tag (saved with the character)
    const left = game.ships.filter((s) => s !== carried && s.owner === 'player');
    game.state.char.zoneShips = left.map((s) => ({ uid: s.uid, type: s.type, name: s.name, upgrades: s.upgrades, hull: s.hull, shot: s.shot, paint: s.paint || null, x: s.x, y: s.y, zone: id }));
    game.ships = (stash || []).concat(carried ? [carried] : []);
    stash = null;
    game.setWorld(game.surface);
    game.renderer.terrain.updateFog(game.surface.fog);
    game.env.zoneKind = null;
    // where on the surface?
    const S = game.surface;
    let target = null;
    const tgt = exit?.surface || z?.exits?.find((e) => e.to === 'surface')?.surface;
    if (tgt?.island) {
      const isl = S.islands.find((i) => i.id === tgt.island);
      if (isl) target = tgt.spot && isl.spots[tgt.spot] ? isl.spots[tgt.spot] : tgt.dock && isl.docks[0] ? isl.docks[0].moor : { x: isl.x, y: isl.y };
    } else if (tgt && tgt.x !== undefined) target = { x: tgt.x, y: tgt.y };
    if (!target || forced) target = game.state.char.rest || game.state.char.spawn;
    if (carried) {
      carried.zoneId = 'surface';
      carried.x = target.x; carried.y = target.y; carried.speed = 0;
      if (!carried.fits(S, carried.x, carried.y, carried.heading)) carried.unstick(S);
      p.x = carried.x; p.y = carried.y;
    } else {
      p.mode = 'foot'; p.onShip = false;
      const s = findShore(S, target.x, target.y, 10) || target;
      p.x = s.x; p.y = s.y;
      if (!S.walkable(p.x, p.y - 0.1)) {
        // came up at sea without a ship: wash up somewhere safe
        const r = game.state.char.rest || game.state.char.spawn;
        p.x = r.x; p.y = r.y;
      }
    }
    game.currentIsland = null;
    game.lastIslandName = null;
    game.lastRegion = undefined;
    game.snapCamera();
    game.emit('leaveZone', id);
    if (!forced) persist(game);
  };

  // ---------------------------------------------------- sea-side triggers
  const surfaceSpot = (spotId) => {
    for (const isl of game.surface.islands) if (isl.spots?.[spotId]) return isl.spots[spotId];
    return null;
  };
  const prevSea = game.seaInteraction;
  game.seaInteraction = (p, s) => {
    const w = game.world;
    const c = game.state.char;
    if (w === game.surface) {
      const ku = surfaceSpot('knock_up_stream');
      if (ku && w.distance(s.x, s.y, ku.x, ku.y) < 14) {
        const knows = count(c, 'south_bird') > 0 || c.flags.knockUpKnown;
        return {
          label: knows ? 'Ride the Knock Up Stream to the sky!' : 'The sea here churns strangely…', key: 'E',
          run: () => {
            if (!knows) { game.log('Something enormous stirs beneath the sea here, but you cannot tell where or when. (A South Bird, or someone who knows these waters, could guide you.)', '#b0bec5'); return; }
            if (!s.def.grandLine) { game.log('Your little boat would be torn apart by the stream. You need a real ship.', '#ff8a80'); return; }
            knockUp(game, s);
          },
        };
      }
      const dive = surfaceSpot('fishman_dive');
      if (dive && w.distance(s.x, s.y, dive.x, dive.y) < 16) {
        return {
          label: s.coated ? 'Dive to Fish-Man Island (10,000 m)' : 'Dive to Fish-Man Island (needs a coated ship)', key: 'E',
          run: () => {
            if (!s.coated) { game.log('Without a resin coating your ship would be crushed by the deep. Sabaody\'s coating mechanics can help — for a price.', '#ff8a80'); return; }
            startDive(game, s);
          },
        };
      }
    } else {
      // leaving a zone by ship through one of its exits
      const z = ZONES[w.id];
      for (const e of z?.exits || []) {
        if (e.island) continue;
        if (w.distance(s.x, s.y, e.x, e.y) < e.r + 4) {
          return { label: e.label || 'Leave', key: 'E', run: () => exitZone(game, e) };
        }
      }
    }
    return prevSea ? prevSea(p, s) : null;
  };

  // on foot: zone exits by spot (Impel Down main gate), stairs portals
  const prevFoot = game.footInteraction;
  game.footInteraction = (p) => {
    const w = game.world;
    if (w !== game.surface) {
      const z = ZONES[w.id];
      for (const e of z?.exits || []) {
        let pos = null;
        if (e.island) pos = spotIn(w, e.island, e.spot);
        else if (w.id === 'skypiea' && e.id === 'cloud_end') continue; // Cloud End is by sea or by jumping (below)
        else pos = { x: e.x, y: e.y };
        if (pos && w.distance(p.x, p.y, pos.x, pos.y) < (e.r || 3)) {
          return { d: 0.5, label: e.label || 'Leave', run: () => {
            const c = game.state.char;
            const beatWarden = (c.bosses || []).some((b) => npcDef(b)?.island?.startsWith('id_'));
            const noWardens = !allNpcDefs().some((d) => d.boss && d.island?.startsWith('id_'));
            const riot = c.flags.imprisonedDay !== undefined && game.env.day - c.flags.imprisonedDay >= 2;
            if (w.id === 'impel_down' && c.flags.imprisoned && !c.flags.impelGateOpen && !beatWarden && !noWardens && !riot) {
              game.log('The Main Gate is sealed with seastone bars. Someone in this prison holds the way out — defeat one of the wardens, or find another way.', '#ff8a80');
              return;
            }
            exitZone(game, e);
          } };
        }
      }
    }
    return prevFoot ? prevFoot(p) : null;
  };
  game.on('useObject', (o) => {
    if (o.kind !== 'portal' || !o.to) return;
    const p = game.player;
    game.ui.fade(true);
    setTimeout(() => {
      p.x = o.to.x; p.y = o.to.y;
      const s = findShore(game.world, p.x, p.y, 4);
      if (s) { p.x = s.x; p.y = s.y; }
      game.snapCamera();
      game.ui.fade(false);
      game.emit('enterIsland', game.world.islandAt(p.x, p.y) || game.world.nearestIsland(p.x, p.y, 80));
    }, 500);
  });

  // the dive under way (see startDive)
  game.on('tick', (dt) => diveTick(game, dt || 1 / 60));

  // falling off the edge of a sky island (Cloud End) or swimming off the
  // edge of the zone takes you back down
  game.on('tick', () => {
    const w = game.world, p = game.player;
    if (!p || w === game.surface || p.state !== 'idle') return;
    if (w.zone === 1 && p.mode === 'foot' && p.inWater) {
      // there is no swimming in the White-White Sea: you sink through the cloud
      if (!p.cloudFallT) p.cloudFallT = 0;
      p.cloudFallT += 1 / 30;
      if (p.cloudFallT > 1.2) {
        p.cloudFallT = 0;
        game.log('You sink through the cloud sea… and fall ten thousand metres.', '#ff8a80');
        const e = ZONES.skypiea.exits[0];
        exitZone(game, e, true);
        p.hp = Math.max(1, Math.round(p.hp * 0.4));
      }
    } else p.cloudFallT = 0;
    // the deep sea outside Fish-Man Island's bubble: only fish-men and merfolk can swim there
    if (w.zone === 2 && p.mode === 'foot' && p.inWater && !inBubble(w, p.x, p.y, -1) && game.state.char.race !== 'fishman') {
      p.deepT = (p.deepT || 0) + 1 / 30;
      if (p.deepT > 1.5) {
        p.deepT = 0;
        const s = findShore(w, p.x, p.y, 20);
        if (s) { p.x = s.x; p.y = s.y; }
        p.hp = Math.max(1, Math.round(p.hp - p.d.maxHp * 0.15));
        game.log('The pressure of the deep sea crushes the air from your lungs — you claw your way back into the bubble.', '#ff8a80');
      }
    } else p.deepT = 0;
  });

  // capture → Impel Down for notorious pirates
  game.sendToImpelDown = (by) => {
    const p = game.player, c = game.state.char;
    if (p.onShip && p.ship) { p.ship.captain = null; p.onShip = false; }
    p.mode = 'foot';
    c.flags.imprisoned = true;
    c.flags.imprisonedDay = game.env.day;
    c.flags.impelDownVisits = (c.flags.impelDownVisits || 0) + 1;
    // your gear is confiscated until you break out
    c.confiscated = { weapons: c.equipped.weapons.slice(), berries: c.berries };
    c.equipped.weapons = [];
    c.berries = 0;
    game.enterZoneById('impel_down');
    game.ui.banner('IMPEL DOWN', 'Level 1 — Crimson Hell', `${by ? by.name + ' handed you over to the Great Prison. ' : ''}Your weapons and berries are confiscated. Find a way out through the Main Gate.`, 7);
    persist(game);
  };
  game.on('newDay', () => {
    const c = game.state?.char;
    if (!c?.flags.imprisoned || game.world.id !== 'impel_down') return;
    if (game.env.day - (c.flags.imprisonedDay ?? game.env.day) >= 2 && !c.flags.impelRiot) {
      c.flags.impelRiot = true;
      game.ui.banner('RIOT!', 'Impel Down', 'The prisoners of Level 1 have overpowered the guards. The Main Gate stands open — go, now!', 6);
    }
  });
  game.on('leaveZone', (id) => {
    const c = game.state?.char;
    if (id !== 'impel_down' || !c?.flags.imprisoned) return;
    c.flags.impelRiot = false;
    delete c.flags.imprisonedDay;
    c.flags.imprisoned = false;
    c.flags.escapedImpelDown = (c.flags.escapedImpelDown || 0) + 1;
    if (c.confiscated) {
      c.equipped.weapons = c.confiscated.weapons || [];
      c.berries += Math.floor((c.confiscated.berries || 0) * 0.6);
      c.confiscated = null;
      game.log('You raid the warden\'s storeroom on the way out and recover your weapons (and some of your berries).', '#a5d6a7');
    }
    game.progression?.addBounty(Math.max(20000000, Math.round((c.bounty || 0) * 0.35)), 'Broke out of Impel Down');
    game.ui.banner('JAILBREAK!', 'Impel Down', 'Nobody breaks out of Impel Down… except you.', 6);
    game.progression?.breakthrough(2, 'Escaped the Great Prison');
  });
}

// The dive to Fish-Man Island in a coated ship, as the Straw Hats made it:
// at the foot of the Red Line she goes under in her bubble and sinks out of
// the light; then, 10,000 m down, she comes down out of the dark onto Fish-
// Man Island's great bubble, through its skin — her own coating merging with
// it — and settles on the sea inside. Nobody steers or leaves the helm on
// the way (playerController.js sail); she just goes down (ship.js: `dive`,
// metres above the sea she'd ride at, which everything aboard rides with).
const DIVE = { under: 4.2, dark: 0.9, down: 18 }; // s: going under; the dark; coming down to the island
// (how far she sinks before the dark: masts and all out of sight)
const diveDepth = (s) => (shipDims(s.def).mastH || 8) + 14;

function startDive(game, s) {
  if (s.diving) return;
  s.diving = { phase: 'under', t: 0 };
  s.speed = 0; s.sail = 0; s.rowing = 0;
  game.ui.banner('DOWN TO FISH-MAN ISLAND', 'The coating holds', 'The sea closes over the bubble. Down past the Sea Kings, down the currents, ten thousand metres into the dark…', 5);
  game.audio?.sfx('splash_big');
}

function diveTick(game, dt) {
  const p = game.player, s = p?.ship;
  if (!s?.diving || p.mode !== 'sail') return;
  const d = s.diving;
  d.t += dt;
  s.speed = 0;
  if (d.at) { s.x = d.at.x; s.y = d.at.y; } else d.at = { x: s.x, y: s.y };
  if (d.phase === 'under') {
    // (down under the waves in her bubble, at the foot of the Red Line)
    const k = Math.min(1, d.t / DIVE.under);
    s.dive = -diveDepth(s) * k * k;
    if (d.t >= DIVE.under && !d.dark) { d.dark = true; game.ui.fade(true); }
    if (d.t >= DIVE.under + DIVE.dark) {
      game.enterZoneById('fishman_island', { byShip: true, dive: true });
      game.ui.fade(false);
    }
    return;
  }
  // coming down onto the island's bubble out of the deep, through its skin, onto the sea inside
  const w = game.world, b = w.bubble;
  const u = Math.min(1, d.t / DIVE.down), ease = 1 - Math.pow(1 - u, 2.3);
  s.dive = d.from * (1 - ease);
  const skin = b ? domeHeight(b, s.x, s.y) : 0;
  if (s.coated && s.dive < skin) {
    // (her coating meets the island's bubble, and the two run together)
    s.coated = false;
    game.audio?.sfx('splash_out');
    game.fx?.shake?.(0.35);
    game.log('Her coating touches the island\'s great bubble — and the two run together. You\'re through, into air and light.', '#80deea');
  }
  if (u >= 1) {
    s.dive = 0;
    s.diving = null;
    s.coated = false; // (the coating lasts the one voyage)
    game.audio?.sfx('splash');
    game.fx?.burst?.(s.x, s.y, 40, { color: ['#e0f7fa', '#80deea', '#ffffff'], speed: 6, vz: 6, g: 9, life: 1.1, kind: 'smoke', size: 0.45 });
    game.ui.banner('Fish-Man Island', '10,000 m below', 'A bubble of air and light at the bottom of the sea. The Ryugu Kingdom stands on its hill; Mermaid Cove is off your bow.', 6);
  }
}

/** Where a ship coming down to a zone starts, metres over the sea (zone entry, below): well above the bubble's skin. */
function diveStart(w, x, y) { return (w.bubble ? domeHeight(w.bubble, x, y) : 0) + 110; }

function exitZone(game, e, falling = false) {
  game.ui.fade(true);
  setTimeout(() => {
    game.leaveZone(false, e);
    game.ui.fade(false);
    if (falling) game.ui.banner('SPLASH!', '', 'You fall out of the sky into the Blue Sea.', 4);
  }, 700);
}

function knockUp(game, ship) {
  const fx = game.fx;
  game.ui.banner('KNOCK UP STREAM', '', 'The sea explodes upward — a pillar of water ten thousand metres high!', 4);
  fx.shake(1.2);
  fx.burst(ship.x, ship.y, 60, { color: ['#e3f2fd', '#90caf9', '#ffffff'], speed: 10, vz: 12, g: 4, life: 1.4, kind: 'smoke', size: 0.5 });
  game.audio?.sfx('explosion');
  game.ui.fade(true);
  setTimeout(() => {
    game.enterZoneById('skypiea', { byShip: true });
    game.ui.fade(false);
    game.log(`The ${ship.name} bursts through the clouds and lands on a sea of white: the Upper Sea. Welcome to Skypiea (entry tax at Heaven's Gate: ${formatBerries(0)} for rookies — they only take extol).`, '#80deea');
  }, 1400);
}
