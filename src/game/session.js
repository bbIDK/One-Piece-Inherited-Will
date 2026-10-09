// Starting, resuming and ending a character's journey.
import { zoneOffset } from './env.js';
import { buildPlayer, resolveSpawn, heldTowns, townAt, persist, decodeFog, createCharacter, refreshPlayer, upgradeChar, migrateWorld } from './lineage.js';
import { allNpcDefs, allGroups } from './npcs.js';
import { ALL_ISLANDS } from '../data/islands/index.js';
import { saveLegacy, loadLegacy, saveChar } from './save.js';
import { board } from './interact.js';
import { standAboard } from './decks.js';
import { lifeLostScreen, lineageEndScreen, legacyShopScreen } from '../ui/screens.js';
import { SEA_IDS, REGION_INFO, regionAt } from '../world/constants.js';
import { RACES } from '../data/races.js';
import { recordShip, liveShips, layUp, aboard } from './fleet.js';

let shipCounter = 0;

/** The pier whose mooring is at (x, y), if any. */
function dockNear(w, x, y) {
  for (const isl of w.islands || []) {
    if (Math.abs(w.dx(isl.x, x)) > 400 || Math.abs(isl.y - y) > 400) continue;
    for (const dk of isl.docks || []) if (dk.moor && w.distance(dk.moor.x, dk.moor.y, x, y) < 6) return dk;
  }
  return null;
}

export function installSession(game, { onReturnToTitle }) {
  const ALIAS = { rowboat: 'dinghy', boat: 'dinghy', brig: 'brigantine', sunny: 'adam_brig', thousand_sunny: 'adam_brig', merry: 'caravel', going_merry: 'caravel', warship: 'marine_warship' };
  game.giveShip = (type, x, y, name, extra = {}) => {
    type = ALIAS[type] || type;
    // (a new ship of yours — bought, given, a reward — is the one you sail:
    // whichever else of yours is afloat goes into the yards, unless you're on
    // her; ships being put back where they were, from a save, keep theirs)
    if (!extra.uid && game.player) for (const o of liveShips(game)) if (!aboard(game.player, o)) layUp(game, o);
    const s = game.addShip({ type, x, y, heading: extra.heading ?? Math.PI / 2, owner: 'player', faction: 'player', name: name || undefined, jr: game.state?.char?.jr, upgrades: extra.upgrades || [], hull: extra.hull, coated: extra.coated, shot: extra.shot, paint: extra.paint || null });
    s.uid = extra.uid || `s${Date.now().toString(36)}${shipCounter++}`;
    // (every ship of yours is in your fleet: see fleet.js)
    recordShip(game.state?.char, s);
    if (!extra.uid && game.state?.char) game.state.char.activeShip = s.uid;
    const dock = extra.heading === undefined ? dockNear(game.world, x, y) : null;
    if (s.def.big && extra.heading === undefined) {
      // a big ship lies alongside the pier head, bow out to sea (or out in the roads if she won't fit)
      if (!(dock && s.placeClear(() => s.berth(game.world, dock)))) {
        // (no berth: out in the roads, bow to the open sea, ready to sail)
        if (dock) s.heading = Math.atan2(dock.dirY ?? 1, dock.dirX ?? 0);
        if (!s.fits(game.world, s.x, s.y, s.heading)) s.placeClear(() => s.unstick(game.world, true));
      }
    } else if (dock && s.placeClear(() => s.moorAlongside(game.world, dock))) {
      // (a small one ties up right alongside it: step down off the pier onto her deck)
    } else if (!s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world, true);
    return s;
  };

  game.on('lifeLost', ({ cause, lives }) => {
    setTimeout(() => {
      // (the world doesn't wait behind the menus: whatever was open goes, for the screen)
      game.ui.closeAll?.();
      if (game.ui.mapOpen) game.closeMap?.();
      if (game.dialogue?.active) game.dialogue.close();
      game.paused = true;
      lifeLostScreen(game.ui, {
        cause, lives,
        onContinue: () => { game.ui.hideScreen(); game.paused = false; game.lives.respawn(); },
      });
    }, 1400);
  });

  game.on('lineageEnded', ({ cause, will }) => {
    setTimeout(() => {
      game.ui.closeAll?.();
      if (game.ui.mapOpen) game.closeMap?.();
      if (game.dialogue?.active) game.dialogue.close();
      game.paused = true;
      const legacy = game.state.legacy;
      lineageEndScreen(game.ui, {
        char: game.state.char, cause, will, legacy,
        onNext: () => {
          saveLegacy(legacy);
          legacyShopScreen(game.ui, legacy, {
            save: () => saveLegacy(legacy),
            onDone: () => { game.ui.hideScreen(); onReturnToTitle(true, 'create'); },
          });
        },
      });
    }, 1800);
  });

  // autosave
  let t = 0;
  game.on('tick', (dt) => {
    t += dt;
    if (game.state?.char) game.state.char.stats.playTime = (game.state.char.stats.playTime || 0) + dt;
    if (t > 45) { t = 0; persist(game); }
  });
  const saveOnLeave = () => { if (game.player && game.player.state !== 'knocked') persist(game); };
  // (closing the tab mid-game — Ctrl+W, say — asks first: the browser's "Leave site?")
  window.addEventListener('beforeunload', (e) => {
    saveOnLeave();
    if (game.player && game.state?.char && !game.net?.leaving) { e.preventDefault(); e.returnValue = ''; }
  });
  // Ctrl+S saves the game (not the page: core/input.js)
  if (game.input) game.input.onSave = () => {
    if (!game.player || !game.state?.char || game.player.state === 'knocked') return;
    persist(game);
    game.ui?.toast?.('GAME SAVED', 'Your progress is saved (it also saves itself as you play).', '#a5d6a7', 'saved');
  };
  window.addEventListener('pagehide', saveOnLeave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveOnLeave(); });
  // milestones are saved right away (a little later, so the moment settles)
  let soon = null;
  const saveSoon = () => { clearTimeout(soon); soon = setTimeout(() => { if (game.player && game.player.state !== 'knocked') persist(game); }, 1200); };
  for (const ev of ['questDone', 'discovered', 'bossDefeated', 'newDay', 'crewJoined', 'hakiAwakened', 'legend', 'fruitEaten', 'shipBought', 'rankUp']) game.on(ev, saveSoon);
}

/** Reset the world's dynamic state before a character enters it. */
function resetGame(game) {
  game.actors = [];
  game.ships = [];
  game.areaZones = [];
  game.combat.hitboxes.length = 0;
  game.combat.projectiles.length = 0;
  game.fx.parts.length = 0; game.fx.shapes.length = 0; game.fx.texts.length = 0;
  game.spawner.populated.clear();
  game.bossTarget = null;
  game.currentIsland = null;
  game.lastIslandName = null;
  game.lastRegion = undefined;
  game.hintsShown = new Set();
  game.groundItems = [];
  if (game.world !== game.surface) game.setWorld(game.surface);
}

export function startNewCharacter(game, birth, choices) {
  const legacy = loadLegacy();
  const char = createCharacter(legacy, birth, choices);
  legacy.heirloom = null; // it has been handed over
  saveLegacy(legacy);
  const world = game.surface;
  // (never in a town held by a crew who'd set on you the moment you woke)
  const spawn = resolveSpawn(world, char, heldTowns(world, allNpcDefs(), allGroups(), char));
  char.spawn = { x: spawn.x, y: spawn.y, name: spawn.name, sea: spawn.sea };
  char.rest = { ...char.spawn };
  char.birthplace = spawn.name;
  resetGame(game);
  world.fog.fill(0);
  game.state = { char, legacy };
  const p = buildPlayer(game, char);
  p.x = spawn.x; p.y = spawn.y;
  p.mode = 'foot';
  game.setPlayer(p);
  // (half past eight in the morning where you're born, whatever the hour elsewhere)
  game.env.day = 1; game.env.zone = zoneOffset(p.x); game.env.clock = 8.5;
  for (const id of char.discovered) revealIsland(game, id);
  // a boat to start the journey
  const isl = spawn.island;
  const shipType = legacy.perks?.ship ? 'sloop' : 'dinghy';
  let placed = false;
  if (isl) {
    // (at the pier nearest where you wake)
    const dock = isl.docks.slice().sort((a, b) => world.distance(a.land.x, a.land.y, spawn.x, spawn.y) - world.distance(b.land.x, b.land.y, spawn.x, spawn.y))[0];
    if (dock) { game.giveShip(shipType, dock.moor.x, dock.moor.y, shipType === 'dinghy' ? 'Little Rowboat' : 'Sea Sparrow'); placed = true; }
  }
  if (!placed) {
    // castaways: their raft afloat just off the beach they wake on, bow out to sea
    const s = game.giveShip(shipType, spawn.x, spawn.y, 'Driftwood Raft', { heading: spawn.seaward ?? Math.PI / 2 });
    if (!s.placeClear(() => s.launchFrom(world, spawn.x, spawn.y, spawn.seaward))) s.placeClear(() => s.unstick(world, true));
  }
  if (isl && isl.id && !char.discovered.includes(isl.id) && isl.name) char.discovered.push(isl.id);
  char.getUpCharges = 1;
  game.snapCamera();
  game.ui.setHudVisible(true);
  const seaName = REGION_INFO[SEA_IDS[spawn.sea]]?.name || '';
  setTimeout(() => game.ui.banner(spawn.town ? spawn.town.name : 'An Uncharted Islet', seaName, `${char.name} begins their journey. The sea is yours to choose.`, 5), 400);
  // (a free sailor isn't sent looking for the people who start the story)
  const story = char.freeSail
    ? 'You\'re sailing your own way, with no main story — if you change your mind, the Quests section of the menu (Tab) can set you looking for a calling.'
    : 'Three people here can start your story — look for the sign over their heads: the Jolly Roger (a pirate), the Marine gull (the Marines) or the bounty sign (a bounty hunter). Or sail your own way (Quests, in the menu).';
  const menus = game.input?.touch?.on
    ? 'The menu button at the top has your Inventory, Character, Skills, Journal, Crew and Quests — and Game, to pause and save.'
    : 'Tab opens the menu (or its button on the left): Inventory, Character, Skills, Journal, Crew and Quests down its side, Tab again to close it. Esc pauses and saves.';
  setTimeout(() => { if (game.state?.char === char) game.hint('menus', `${menus} ${story}`); }, 6500);
  game.emit('characterStart', { char, isNew: true, spawn });
  persist(game);
  return p;
}

export function resumeCharacter(game, char) {
  upgradeChar(char);
  const legacy = loadLegacy();
  resetGame(game);
  const world = game.surface;
  game.state = { char, legacy };
  // (saved on the old, smaller world: everything moves onto this one)
  const moved = migrateWorld(char, world, ALL_ISLANDS);
  safeStart(world, char);
  if (char.fogSurface) decodeFog(char.fogSurface, world.fog); else world.fog.fill(0);
  if (moved) for (const id of char.discovered || []) revealIsland(game, id);
  game.renderer.terrain.updateFog(world.fog);
  const p = buildPlayer(game, char);
  const pos = char.pos || char.rest || char.spawn;
  p.x = pos.x; p.y = pos.y;
  p.mode = 'foot';
  game.setPlayer(p);
  game.env.day = char.world?.day || 1;
  // (the world clock; an old save kept only the hour, taken as the world's)
  game.env.utc = char.world?.utc ?? char.world?.clock ?? 8.5;
  game.hintsShown = new Set(char.hintsShown || []);
  let active = null;
  for (const sd of char.ships || []) {
    if (sd.zone && sd.zone !== 'surface') continue;
    const s = game.giveShip(sd.type, sd.x, sd.y, sd.name, sd);
    s.hull = sd.hull ?? s.maxHull;
    if (sd.uid === char.activeShip) active = s;
  }
  if (pos.zone && pos.zone !== 'surface' && game.enterZoneById) {
    game.enterZoneById(pos.zone, pos, true);
  } else if (pos.mode === 'sail' && active) {
    board(game, p, active);
  } else if (pos.deck) {
    // on her deck, or below, just where you were — or, she gone, where you'd wake
    if (!standAboard(game, p, game.ships.find((s) => s.uid === pos.deck.uid && !s.sunk), pos.deck)) { const r = char.rest || char.spawn; p.x = r.x; p.y = r.y; }
  } else if (!game.world.walkable(p.x, p.y - 0.1) && !game.world.swimmable(p.x, p.y - 0.1)) {
    const r = char.rest || char.spawn;
    p.x = r.x; p.y = r.y;
  }
  refreshPlayer(game);
  p.hp = p.d.maxHp;
  game.snapCamera();
  game.ui.setHudVisible(true);
  const reg = REGION_INFO[regionAt(p.x, p.y)]?.name || '';
  setTimeout(() => game.ui.banner(char.name, `Generation ${char.generation} · ${RACES[char.race]?.name}`, `${reg} — Day ${game.env.day}`, 4), 300);
  game.emit('characterStart', { char, isNew: false });
  return p;
}

/**
 * A character who started out in a town held by a crew who fight on sight
 * (Fish-Men once woke in Arlong Park, and were set upon before they could
 * stand) starts over somewhere safe: their start, their bed if it was
 * there, and themselves if they never left.
 */
function safeStart(world, char) {
  const held = heldTowns(world, allNpcDefs(), allGroups(), char);
  if (!char.spawn || !townAt(world, char.spawn.x, char.spawn.y, held)) return false;
  const s = resolveSpawn(world, char, held);
  const fresh = { x: s.x, y: s.y, name: s.name, sea: s.sea };
  if (!char.rest || townAt(world, char.rest.x, char.rest.y, held)) char.rest = { ...fresh };
  if (char.pos && (!char.pos.zone || char.pos.zone === 'surface') && char.pos.mode !== 'sail' && townAt(world, char.pos.x, char.pos.y, held)) char.pos = { ...char.pos, x: fresh.x, y: fresh.y };
  if (char.birthplace === char.spawn.name) char.birthplace = fresh.name;
  char.spawn = fresh;
  return true;
}

export function revealIsland(game, id) {
  const isl = game.surface.islands.find((i) => i.id === id);
  if (isl) game.surface.reveal(isl.x, isl.y, isl.radius + 12);
}

export { saveChar };
