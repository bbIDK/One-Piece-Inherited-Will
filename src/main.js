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
import { loadChar, loadLegacy, loadSettings, saveSettings, clearChar, saveLegacy, setSlot, slotInfo, clearSlot, defaultLegacy, SLOT_COUNT } from './game/save.js';
import { titleScreen, creationScreen, hallScreen, helpContent, legacyShopScreen } from './ui/screens.js';
import { installSession, startNewCharacter, resumeCharacter } from './game/session.js';
import { LivesSystem } from './game/lives.js';
import { Progression } from './game/progression.js';
import { Dialogue } from './game/dialogue.js';
import { Quests } from './game/quests.js';
import { Services } from './game/services.js';
import { Interactions, npcBuilder, npcDef, makeNPC } from './game/npcs.js';
import { installMap } from './ui/mapUI.js';
import { openInventory, openCharacter, openSkills, openJournal, openMenu, openSettings } from './ui/panels.js';
import { persist, endLineage } from './game/lineage.js';
import { addItem, useItem } from './game/inventory.js';
import { ITEMS } from './data/items.js';
import { installReputation } from './game/reputation.js';
import { installForaging } from './game/forage.js';
import { fruitOf } from './world/fruitTrees.js';
import { installContent } from './content/index.js';
import { Audio } from './audio/audio.js';
import { installSea } from './game/sea.js';
import { installZones } from './game/zones.js';
import { Crew } from './game/crew.js';
import { openCrew } from './ui/crewPanel.js';
import { installFactions } from './game/factions.js';
import { installLegends } from './game/legends.js';
import { installWorld } from './game/news.js';

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
  installWorld(game);
  installReputation(game);
  installForaging(game);
  installContent(game);

  const toTitle = (afterDeath, next) => {
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
    if (next === 'create') openCreation();
    else showTitle();
  };
  installSession(game, { onReturnToTitle: toTitle });

  // menus: the sidebar buttons and their keyboard shortcuts do the same thing
  // (press again, or Esc, to close; pressing another switches menus)
  const playing = () => !!game.player && !ui.screenEl;
  ui.actions = {
    inventory: () => openInventory(game),
    character: () => openCharacter(game),
    skills: () => openSkills(game),
    journal: () => openJournal(game),
    crew: () => openCrew(game),
    menu: () => ui.openMenu(),
    help: () => ui.openPanel(helpContent(game.state?.char), { wide: true, id: 'help' }),
  };
  ui.keyHandlers.push(
    { key: 'I', when: playing, fn: () => ui.sideAction('inventory') },
    { key: 'Tab', when: playing, fn: () => ui.sideAction('inventory') },
    { key: 'C', when: playing, fn: () => ui.sideAction('character') },
    { key: 'K', when: playing, fn: () => ui.sideAction('skills') },
    { key: 'J', when: playing, fn: () => ui.sideAction('journal') },
    { key: 'H', when: playing, fn: () => ui.sideAction('help') },
    { key: 'U', when: playing, fn: () => ui.sideAction('crew') },
  );
  game.on('saved', () => ui.savedNote());
  // food and medicine on the hotbar
  game.useHotbarItem = (id) => {
    const c = game.state?.char;
    if (!c) return false;
    if (!c.inventory.some((i) => i.id === id)) { game.log(`You have no ${ITEMS[id]?.name || id} left.`, '#ff8a80'); return false; }
    return useItem(game, id);
  };
  const saveNow = () => {
    const ok = persist(game);
    if (ok) ui.toast('Game saved', `Lineage ${getSlotLabel()}`, '#a5d6a7');
    else ui.toast('Could not save', 'This browser is blocking local storage.', '#ff8a80');
    return ok;
  };
  const getSlotLabel = () => String(game.saveSlot || 1);
  ui.openMenu = () => {
    if (!playing()) return;
    if (ui.stack.some((e) => e.id === 'menu')) { ui.closeAll(); return; }
    ui.closeAll();
    openMenu(game, {
      onSave: saveNow,
      onQuit: () => toTitle(false),
      onRetire: () => {
        const will = endLineage(game, `Retired as a living legend. ${game.state.char.name}'s journey is complete.`);
        game.emit('lineageEnded', { cause: 'Retired as a legend.', will });
      },
    });
  };

  const openCreation = () => {
    creationScreen(ui, loadLegacy(), {
      onBack: showTitle,
      onDone: (birth, choices) => { ui.hideScreen(); startNewCharacter(game, birth, choices); audio.music('sea'); },
    });
  };
  const useSlot = (s) => { setSlot(s); game.saveSlot = s; };

  const showTitle = () => {
    const slots = [];
    for (let s = 1; s <= SLOT_COUNT; s++) slots.push(slotInfo(s));
    titleScreen(ui, {
      slots,
      onPlay: (s) => {
        useSlot(s);
        const saved = loadChar();
        if (!saved) { showTitle(); return; }
        ui.hideScreen(); resumeCharacter(game, saved); audio.music('sea');
      },
      onNew: async (s) => {
        useSlot(s);
        const saved = loadChar();
        if (saved && !(await ui.ask({ title: `Abandon ${saved.name}?`, text: 'Their journey will be lost, and no Inherited Will is earned for abandoning a life.', ok: 'Abandon', cancel: 'Keep them', danger: true }))) return;
        if (saved) clearChar();
        openCreation();
      },
      onDelete: async (s) => {
        const info = slotInfo(s);
        const who = info.char ? `${info.char.name} and the` : 'The';
        if (!(await ui.ask({ title: `Delete lineage ${s}?`, text: `${who} whole bloodline — Inherited Will, perks and the Hall of Legends — will be erased for good.`, ok: 'Delete forever', cancel: 'Keep it', danger: true }))) return;
        clearSlot(s);
        showTitle();
      },
      onHall: (s) => hallScreen(ui, slotInfo(s).legacy || defaultLegacy(), { onBack: showTitle }),
      onWill: (s) => {
        useSlot(s);
        const legacy = loadLegacy();
        legacyShopScreen(ui, legacy, { save: () => saveLegacy(legacy), onDone: showTitle, doneLabel: 'Back' });
      },
      onHelp: () => { ui.hideScreen(); ui.openPanel(helpContent(null), { wide: true, onClose: showTitle }); },
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
      if (opts.slot) useSlot(opts.slot);
      startNewCharacter(game, birth, { name: opts.name || 'Test Pirate', look: null });
      return game.player;
    },
    debug: { npcDef, makeNPC, addItem, fruitOf },
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
