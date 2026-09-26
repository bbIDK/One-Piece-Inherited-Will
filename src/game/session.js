// Starting, resuming and ending a character's journey.
import { buildPlayer, resolveSpawn, persist, decodeFog, createCharacter, refreshPlayer } from './lineage.js';
import { saveLegacy, loadLegacy, saveChar } from './save.js';
import { board } from './interact.js';
import { lifeLostScreen, lineageEndScreen, legacyShopScreen } from '../ui/screens.js';
import { SEA_IDS, REGION_INFO, regionAt } from '../world/constants.js';
import { RACES } from '../data/races.js';

let shipCounter = 0;

export function installSession(game, { onReturnToTitle }) {
  game.giveShip = (type, x, y, name, extra = {}) => {
    const s = game.addShip({ type, x, y, heading: extra.heading ?? Math.PI / 2, owner: 'player', faction: 'player', name: name || undefined, jr: game.state?.char?.jr, upgrades: extra.upgrades || [], hull: extra.hull, coated: extra.coated });
    s.uid = extra.uid || `s${Date.now().toString(36)}${shipCounter++}`;
    if (!s.fits(game.world, s.x, s.y, s.heading)) s.unstick(game.world);
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
            onDone: () => { game.ui.hideScreen(); onReturnToTitle(true); },
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
  window.addEventListener('beforeunload', () => { if (game.player && game.player.state !== 'knocked') persist(game); });
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
  setTimeout(() => game.ui.banner(spawn.town ? spawn.town.name : 'An Uncharted Islet', seaName, `${char.name} begins their journey. Dream: ${choices.dream ? '' : ''}`, 5), 400);
  game.emit('characterStart', { char, isNew: true, spawn });
  persist(game);
  return p;
}

export function resumeCharacter(game, char) {
  const legacy = loadLegacy();
  resetGame(game);
  const world = game.surface;
  game.state = { char, legacy };
  if (char.fogSurface) decodeFog(char.fogSurface, world.fog); else world.fog.fill(0);
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
