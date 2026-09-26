// Entry point: boot the world, show the title, run the loop.
import { Renderer } from './render/renderer.js';
import { generateWorld } from './world/worldgen.js';
import { ALL_ISLANDS } from './data/islands/index.js';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import './data/styles.js';
import './data/fruits.js';
import './data/haki.js';
import { loadChar, loadLegacy, loadSettings, saveSettings, clearChar } from './game/save.js';
import { titleScreen, creationScreen, hallScreen, helpContent } from './ui/screens.js';
import { installSession, startNewCharacter, resumeCharacter } from './game/session.js';
import { LivesSystem } from './game/lives.js';
import { Progression } from './game/progression.js';
import { Dialogue } from './game/dialogue.js';
import { Quests } from './game/quests.js';
import { Services } from './game/services.js';
import { Interactions, npcBuilder } from './game/npcs.js';
import { installMap } from './ui/mapUI.js';
import { openInventory, openCharacter, openSkills, openJournal, openMenu, openSettings } from './ui/panels.js';
import { persist, endLineage } from './game/lineage.js';
import { installContent } from './content/index.js';
import { Audio } from './audio/audio.js';
import { installSea } from './game/sea.js';
import { installZones } from './game/zones.js';
import { Crew } from './game/crew.js';
import { openCrew } from './ui/crewPanel.js';
import { installFactions } from './game/factions.js';
import { installLegends } from './game/legends.js';
import { RACES } from './data/races.js';

const root = document.createElement('div');
root.id = 'game';
root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#0b1622';
document.body.appendChild(root);
const boot = document.getElementById('boot');

const debug = { ready: false };
window.OP = debug;

async function start() {
  let renderer;
  try {
    renderer = new Renderer(root);
  } catch (e) {
    boot.textContent = e.message;
    throw e;
  }
  const input = new Input(root);
  const ui = new UI(document.body);
  const settings = loadSettings();
  const audio = new Audio(settings);
  const world = await generateWorld({
    seed: 'blue-planet',
    islands: ALL_ISLANDS,
    onProgress: (p, msg) => { boot.textContent = `${msg}… ${Math.round(p * 100)}%`; },
  });
  boot.style.display = 'none';
  const game = new Game({ renderer, input, ui, audio, world });
  game.settings = settings;
  game.applySettings = (save) => { audio.apply(settings); game.shakeMul = settings.shake; if (save) saveSettings(settings); };
  game.applySettings();
  ui.game = game;
  game.setWorld(world);
  game.lives = new LivesSystem(game);
  game.progression = new Progression(game);
  game.dialogue = new Dialogue(game);
  new Quests(game);
  new Services(game);
  game.interactions = new Interactions(game);
  game.spawner.addBuilder(npcBuilder);
  installMap(game);
  installSea(game);
  installZones(game);
  new Crew(game);
  installFactions(game);
  installLegends(game);
  installContent(game);

  const toTitle = (afterDeath) => {
    if (!afterDeath && game.player && game.state?.char && !game.state.char.dead) persist(game);
    game.player = null;
    game.actors = [];
    game.ships = [];
    game.state = null;
    ui.closeAll();
    if (ui.dialogueEl) game.dialogue.close();
    if (ui.mapOpen) game.closeMap();
    ui.setHudVisible(false);
    game.paused = false;
    showTitle();
  };
  installSession(game, { onReturnToTitle: toTitle });

  // global shortcuts while playing
  const playing = () => !!game.player && !ui.screenEl;
  ui.keyHandlers.push(
    { key: 'I', when: playing, fn: () => openInventory(game) },
    { key: 'Tab', when: playing, fn: () => openInventory(game) },
    { key: 'C', when: playing, fn: () => openCharacter(game) },
    { key: 'K', when: playing, fn: () => openSkills(game) },
    { key: 'J', when: playing, fn: () => openJournal(game) },
    { key: 'H', when: playing, fn: () => ui.openPanel(helpContent(), { wide: true, id: 'help' }) },
    { key: 'U', when: playing, fn: () => openCrew(game) },
  );
  ui.openMenu = () => {
    if (!playing()) return;
    openMenu(game, {
      onQuit: () => toTitle(false),
      onRetire: () => {
        const will = endLineage(game, `Retired as a living legend. ${game.state.char.name}'s dream came true.`);
        game.emit('lineageEnded', { cause: 'Retired as a legend.', will });
      },
    });
  };

  const showTitle = () => {
    const legacy = loadLegacy();
    const saved = loadChar();
    titleScreen(ui, {
      legacy, hasSave: !!saved,
      saveInfo: saved ? `${saved.name} (${RACES[saved.race]?.name}, day ${saved.world?.day || 1})` : '',
      onContinue: () => { ui.hideScreen(); resumeCharacter(game, saved); audio.music('sea'); },
      onNew: () => {
        if (saved && !confirm(`Abandon ${saved.name}? Their journey will be lost (no Inherited Will is earned for abandoning).`)) return;
        if (saved) clearChar();
        creationScreen(ui, loadLegacy(), {
          onBack: showTitle,
          onDone: (birth, choices) => { ui.hideScreen(); startNewCharacter(game, birth, choices); audio.music('sea'); },
        });
      },
      onHall: () => hallScreen(ui, legacy, { onBack: showTitle }),
      onHelp: () => { ui.hideScreen(); const e = ui.openPanel(helpContent(), { wide: true, onClose: showTitle }); void e; },
      onSettings: () => { ui.hideScreen(); openSettings(game); const s = ui.stack[ui.stack.length - 1]; if (s) s.onClose = () => { game.applySettings(true); showTitle(); }; },
    });
    audio.music('title');
  };

  // attract-mode camera for the title screen
  const attract = { x: 3790, y: 330, t: 0 };
  renderer.cam.x = attract.x; renderer.cam.y = attract.y; renderer.cam.zoom = 9;

  Object.assign(debug, {
    world, renderer, game, input, ui,
    get player() { return game.player; },
    get env() { return game.env; },
    setCam(x, y, zoom) { renderer.cam.x = x; renderer.cam.y = y; if (zoom) renderer.cam.zoom = zoom; },
    teleport(x, y) { game.player.x = x; game.player.y = y; game.snapCamera(); },
    key(k, down) { input.simKey(k, down); },
    step(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) { game.update(dt); } game.render(); },
    quickStart(race = 'human', opts = {}) {
      const birth = { race, traits: opts.traits || ['lucky'], seed: opts.seed || 12345 };
      ui.hideScreen();
      startNewCharacter(game, birth, { name: opts.name || 'Test Pirate', dream: opts.dream || 'king', look: null, jr: { skull: 'classic', bones: 'cross', accessory: 'strawhat', color: '#fff' } });
      return game.player;
    },
    ready: true,
  });

  showTitle();

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.player) {
      game.update(dt);
      if (ui.mapOpen) game.renderMap();
      else game.render();
    } else {
      attract.t += dt;
      renderer.cam.x = world.wx(attract.x + attract.t * 3);
      renderer.cam.y = attract.y + Math.sin(attract.t * 0.1) * 20;
      game.env.update(dt, game);
      renderer.renderTerrain(world, game.env);
      renderer.renderWorld(world, [], game.env);
      ui.update(dt);
      input.endFrame();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
