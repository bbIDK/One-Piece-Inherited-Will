// Starting, resuming and ending a character's journey.
import { buildPlayer, resolveSpawn, persist, decodeFog, createCharacter, refreshPlayer, upgradeChar, migrateWorld } from './lineage.js';
import { ALL_ISLANDS } from '../data/islands/index.js';
import { saveLegacy, loadLegacy, saveChar } from './save.js';
import { board } from './interact.js';
import { lifeLostScreen, lineageEndScreen, legacyShopScreen } from '../ui/screens.js';
import { SEA_IDS, REGION_INFO, regionAt } from '../world/constants.js';
import { RACES } from '../data/races.js';

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
    const s = game.addShip({ type, x, y, heading: extra.heading ?? Math.PI / 2, owner: 'player', faction: 'player', name: name || undefined, jr: game.state?.char?.jr, upgrades: extra.upgrades || [], hull: extra.hull, coated: extra.coated });
    s.uid = extra.uid || `s${Date.now().toString(36)}${shipCounter++}`;
    const dock = extra.heading === undefined ? dockNear(game.world, x, y) : null;
    if (s.def.big && extra.heading === undefined) {
      // a big ship lies alongside the pier head, bow out to sea (or out in the roads if she won't fit)
      if (!(dock && s.berth(game.world, dock)) && !s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world, true);
    } else if (dock && s.moorAlongside(game.world, dock)) {
      // (a small one ties up right alongside it: step down off the pier onto her deck)
    } else if (!s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world, !!s.def.big);
    return s;
  };

  game.on('lifeLost', ({ cause, lives }) => {
    setTimeout(() => {
      game.paused = true;
      lifeLostScreen(game.ui, {
        cause, lives,
        onContinue: () => { game.ui.hideScreen(); game.paused = false; game.lives.respawn(); },
      });
    }, 1400);
  });

  game.on('lineageEnded', ({ cause, will }) => {
    setTimeout(() => {
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
  window.addEventListener('beforeunload', saveOnLeave);
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
  const spawn = resolveSpawn(world, char);
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
  game.env.day = 1; game.env.clock = 8.5;
  for (const id of char.discovered) revealIsland(game, id);
  // a boat to start the journey
  const isl = spawn.island;
  const shipType = legacy.perks?.ship ? 'sloop' : 'dinghy';
  let placed = false;
  if (isl) {
    const dock = isl.docks[0];
    if (dock) { game.giveShip(shipType, dock.moor.x, dock.moor.y, shipType === 'dinghy' ? 'Little Rowboat' : 'Sea Sparrow'); placed = true; }
  }
  if (!placed) {
    // washed-up castaways: drag a boat onto the nearest beach
    const s = game.giveShip(shipType, spawn.x, spawn.y + 4, 'Driftwood Raft');
    s.unstick(world);
  }
  if (isl && isl.id && !char.discovered.includes(isl.id) && isl.name) char.discovered.push(isl.id);
  char.getUpCharges = 1;
  game.snapCamera();
  game.ui.setHudVisible(true);
  const seaName = REGION_INFO[SEA_IDS[spawn.sea]]?.name || '';
  setTimeout(() => game.ui.banner(spawn.town ? spawn.town.name : 'An Uncharted Islet', seaName, `${char.name} begins their journey. The sea is yours to choose.`, 5), 400);
  setTimeout(() => { if (game.state?.char === char) game.hint('menus', 'Your menus are on the left: Inventory, Character, Skills, Journal, Crew and Quests (or Tab, C, K, J, U, L). Esc pauses and saves. People with an orange ! over their heads can start your story — as a pirate, a Marine or a bounty hunter.'); }, 6500);
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
  if (char.fogSurface) decodeFog(char.fogSurface, world.fog); else world.fog.fill(0);
  if (moved) for (const id of char.discovered || []) revealIsland(game, id);
  game.renderer.terrain.updateFog(world.fog);
  const p = buildPlayer(game, char);
  const pos = char.pos || char.rest || char.spawn;
  p.x = pos.x; p.y = pos.y;
  p.mode = 'foot';
  game.setPlayer(p);
  game.env.day = char.world?.day || 1;
  game.env.clock = char.world?.clock ?? 8.5;
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

export function revealIsland(game, id) {
  const isl = game.surface.islands.find((i) => i.id === id);
  if (isl) game.surface.reveal(isl.x, isl.y, isl.radius + 12);
}

export { saveChar };
