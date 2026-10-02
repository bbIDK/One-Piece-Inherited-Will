// Entry point: boot the world, show the title, run the loop.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { PROF, prof, profFrame, profReset } from './core/prof.js';
import { Renderer3D } from './render3d/index.js';
import { VIEWS, PROP_BUILDERS } from './render3d/registry.js';
import './render3d/pickups3d.js';
import './render3d/groundcover.js';
import './render3d/ripples3d.js';
import './render3d/seabed.js';
import './render3d/rmCanals3d.js';
import './render3d/sealife3d.js';
import './render3d/lamplight.js';
import './render3d/precip3d.js';
import { renderPortrait } from './ui/preview3d.js';
import { generateWorld } from './world/worldgen.js';
import { ALL_ISLANDS } from './data/islands/index.js';
import { Input } from './core/input.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';
import './data/styles.js';
import './data/fruits.js';
import './data/haki.js';
import { loadChar, loadLegacy, loadSettings, saveSettings, clearChar, saveLegacy, setSlot, slotInfo, clearSlot, defaultLegacy, SLOT_COUNT, renderChunks } from './game/save.js';
import { titleScreen, creationScreen, hallScreen, helpContent, legacyShopScreen } from './ui/screens.js';
import { installSession, startNewCharacter, resumeCharacter } from './game/session.js';
import { LivesSystem } from './game/lives.js';
import { Progression } from './game/progression.js';
import { Dialogue } from './game/dialogue.js';
import { Quests, allQuests } from './game/quests.js';
import { Services } from './game/services.js';
import { Interactions, npcBuilder, npcDef, makeNPC, allNpcDefs, standingHeight } from './game/npcs.js';
import { installMap } from './ui/mapUI.js';
import { openInventory, openCharacter, openSkills, openJournal, openMenu, openSettings, confirmEat } from './ui/panels.js';
import { openCreative } from './ui/creativePanel.js';
import { persist, endLineage, setDrawn } from './game/lineage.js';
import { addItem, useItem } from './game/inventory.js';
import { ITEMS } from './data/items.js';
import { installReputation } from './game/reputation.js';
import { installBuildings } from './game/buildings.js';
import { installTownLife } from './game/townlife.js';
import { installSeaLife } from './game/sealife.js';
import { clamAt } from './world/seabed.js';
import { regionAt } from './world/constants.js';
import { layoutOf } from './world/interiors.js';
import { installForaging } from './game/forage.js';
import { fruitOf, fruitPicked } from './world/fruitTrees.js';
import { installContent } from './content/index.js';
import { Audio } from './audio/audio.js';
import { installSea } from './game/sea.js';
import { installDecks, hatchSpot, helmSpot, placeOnDeck } from './game/decks.js';
import { deckToWorld, shipDims } from './world/hull.js';
import { installTraffic } from './game/traffic.js';
import { installFleet, launchShip } from './game/fleet.js';
import { shipwrightBuilder } from './game/shipwrights.js';
import { openShipwright } from './ui/shipwrightPanel.js';
import { installWanted } from './game/wanted.js';
import { installLoot } from './game/loot.js';
import { installContainers } from './game/containers.js';
import { installCreative } from './game/creative.js';
import { installZones } from './game/zones.js';
import { Crew } from './game/crew.js';
import { openCrew } from './ui/crewPanel.js';
import { openQuests } from './ui/questsPanel.js';
import { installFactions } from './game/factions.js';
import { installLegends } from './game/legends.js';
import { installWorld } from './game/news.js';
import { installTouch } from './ui/touch.js';
import { IS_LIQUID } from './world/tiles.js';
import { bw, bl, bfront } from './world/bframe.js';

const root = document.createElement('div');
root.id = 'game';
root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#0b1622';
document.body.appendChild(root);
const boot = document.getElementById('boot');

// The loading screen: a progress bar and what's being done, a tip, and it
// stays up until the world behind the title has really been drawn (and again,
// briefly, while the seas around your pirate load).
const TIPS = [
  'Hold Space to charge a jump — Minks and Long-Legs spring highest of all.',
  "A Devil Fruit user can't swim. Fall in and thrash back to shore before your strength gives out.",
  'Rest at an inn and that is where you wake if you fall.',
  'Homes are locked: knock, or kick the door in — a crime, unless it is a pirates\' den.',
  'Drag techniques and food straight onto your hotbar from the Inventory or Skills menu.',
  'Tap Ctrl in third person for shift lock; V switches between first and third person.',
  'Out of air under water? Swim for the surface — your lungs will not wait.',
  'Enemies hunt you by sight. Break the line of sight and they will lose you.',
  'Every life that ends passes its Will on to the next generation.',
];
const bootEl = (q) => boot?.querySelector(q);
let tipI = Math.floor(Math.random() * TIPS.length), tipT = -1e9;
function setBoot(p, msg) {
  if (!boot) return;
  const bar = bootEl('.bar i'), m = bootEl('.msg'), tip = bootEl('.tip');
  if (!bar || !m) { if (msg) boot.textContent = msg; return; }
  if (p != null) bar.style.width = Math.round(Math.max(3, Math.min(1, p) * 100)) + '%';
  if (msg) m.textContent = msg;
  if (tip && performance.now() - tipT > 4500) { tipT = performance.now(); tip.textContent = 'Tip: ' + TIPS[tipI++ % TIPS.length]; }
}
function showBoot(msg) {
  if (!boot) return;
  boot.classList.remove('hidden', 'done');
  setBoot(0.05, msg);
}
function hideBoot(now = false) {
  if (!boot || boot.classList.contains('hidden')) return;
  setBoot(1);
  if (now) { boot.classList.add('hidden'); return; }
  boot.classList.add('done');
  setTimeout(() => { if (boot.classList.contains('done')) boot.classList.add('hidden'); }, 850);
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const debug = { ready: false };
window.OP = debug;

async function start() {
  let renderer;
  try {
    renderer = new Renderer(root);
  } catch (e) {
    setBoot(null, e.message);
    throw e;
  }
  const input = new Input(root);
  const ui = new UI(document.body);
  const settings = loadSettings();
  const audio = new Audio(settings);
  const genT0 = performance.now();
  const world = await generateWorld({
    seed: 'blue-planet',
    islands: ALL_ISLANDS,
    onProgress: (p, msg) => setBoot(p * 0.72, `${msg}…`),
  });
  debug.genMs = Math.round(performance.now() - genT0);
  setBoot(0.76, 'Building the 3D world…');
  await nextFrame();
  const game = new Game({ renderer, input, ui, audio, world });
  game.settings = settings;
  // sounds out in the world fade with distance from the player
  audio.ear = () => game.player;
  audio.dxOf = (a, b) => (game.world?.dx ? game.world.dx(a, b) : b - a);
  // phones and tablets start on the fast graphics setting unless the player picked one
  const phone = !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
  if (phone && !settings.qualityPicked) settings.quality = 'low';
  // (automated test browsers draw in software, always slowly: keep their screenshots sharp)
  if (navigator.webdriver) settings.autoRes = false;
  // the 3D view: first person, or third person
  if (settings.view !== 'third') settings.view = 'first';
  let view3d = null;
  try {
    view3d = new Renderer3D(root, renderer, game);
    game.view3d = view3d;
    // how deep the water is (m) at a point, from the 3D sea floor
    game.seaDepth = (x, y) => Math.max(0, -view3d.terrain.terrainAt(x, y));
    renderer.view3d = view3d;
  } catch (e) {
    console.error('3D view unavailable', e);
    showBoot('This game needs 3D graphics (WebGL 2). Please open it in a recent Chrome, Edge, Firefox or Safari, with hardware acceleration turned on.');
    return;
  }
  const applyView = () => {
    if (!view3d) return;
    const on = !!game.player;
    view3d.setMode(settings.view === 'third' ? 'third' : 'first');
    view3d.setActive(on);
  };
  game.applySettings = (save) => {
    audio.apply(settings);
    game.shakeMul = settings.shake;
    if (view3d) {
      view3d.rig.sensitivity = 0.0008 + (settings.sensitivity ?? 0.5) * 0.0032;
      view3d.rig.invertY = !!settings.invertY;
      view3d.rig.baseFov = Math.round(60 + (settings.fov ?? 0.5) * 35);
      view3d.rig.bobOn = settings.bob !== false;
      view3d.rig.shiftLock = !!settings.shiftLock;
      if (view3d.quality !== settings.quality) view3d.setQuality(settings.quality || 'high');
      view3d.setRenderDistance(renderChunks(settings));
      applyView();
    }
    if (save) saveSettings(settings);
  };
  game.cycleView = () => {
    settings.view = settings.view === 'first' ? 'third' : 'first';
    applyView();
    saveSettings(settings);
    // third person without shift lock frees the mouse; first person takes it back
    if (view3d && !input.touch?.on) {
      if (view3d.rig.freeMouse) view3d.rig.releaseLock();
      else if (!view3d.rig.locked && !view3d.rig.lockFailed) view3d.rig.requestLock();
    }
    ui.toast(settings.view === 'first' ? 'FIRST PERSON' : 'THIRD PERSON', input.touch?.on ? 'Tap View to switch' : settings.view === 'third' ? (settings.shiftLock ? 'Shift lock is on (tap Ctrl to free the mouse) · V switches views' : 'Hold the right mouse button to turn the camera · tap Ctrl for shift lock · V switches views') : 'Press V to switch views', '#ffe082', 'view');
  };
  // start looking down the longest clear line of sight (not at a wall)
  const openYaw = (p) => {
    const w = game.world;
    let best = p.facing || 0, bestLen = -1;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      let len = 0;
      for (let d = 1; d <= 40; d++) {
        const x = p.x + cx * d, y = p.y + cy * d;
        if (w.isBlocked(x, y) || (!w.walkable(x, y) && !IS_LIQUID[w.type(x, y)])) break;
        len = d;
      }
      // a little preference for the way the character already faces
      const score = len - Math.abs(Math.atan2(Math.sin(a - (p.facing || 0)), Math.cos(a - (p.facing || 0)))) * 0.8;
      if (score > bestLen) { bestLen = score; best = a; }
    }
    return best;
  };
  game.on('characterStart', () => {
    applyView();
    if (view3d && game.player) {
      const yaw = openYaw(game.player);
      view3d.rig.yaw = yaw;
      view3d.rig.pitch = -0.04;
      game.player.facing = yaw;
    }
  });
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
  // a shipwright on every pier (see game/shipwrights.js)
  game.spawner.addBuilder(shipwrightBuilder);
  installMap(game);
  installSea(game);
  installDecks(game);
  installTraffic(game);
  installFleet(game);
  installWanted(game);
  installLoot(game);
  installContainers(game);
  installCreative(game);
  installZones(game);
  new Crew(game);
  installFactions(game);
  installLegends(game);
  installWorld(game);
  installReputation(game);
  installBuildings(game);
  installTownLife(game);
  installSeaLife(game);
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
    view3d?.setActive(false);
    if (next === 'create') openCreation();
    else showTitle();
  };
  installSession(game, { onReturnToTitle: toTitle });

  // menus: the sidebar buttons and their keyboard shortcuts do the same thing
  // (press again, or Esc, to close; pressing another switches menus)
  const playing = () => !!game.player && !ui.screenEl;
  // until when to capture the mouse again, once the view is back (after a menu,
  // a conversation or the title screen closes: see the frame loop)
  let sail = null; // entering the world: the loading screen stays up until it's drawn
  let bootFrames = 0; // frames of the title backdrop drawn so far
  let relockUntil = 0;
  ui.actions = {
    inventory: () => openInventory(game),
    character: () => openCharacter(game),
    skills: () => openSkills(game),
    journal: () => openJournal(game),
    crew: () => openCrew(game),
    quests: () => openQuests(game),
    menu: () => ui.openMenu(),
    help: () => ui.openPanel(helpContent(game.state?.char), { wide: true, id: 'help' }),
    map: () => game.openMap(),
    view: () => game.cycleView(),
    // (creative mode only: F1, or the pause menu)
    creative: () => openCreative(game),
  };
  const touch = installTouch(game, root);
  ui.keyHandlers.push(
    { key: 'V', when: playing, fn: () => game.cycleView() },
    // draw your weapon, or put it back in its sheath (sheathed, you fight with your fists)
    { key: 'X', when: playing, fn: () => { const p = game.player; if (p?.weapon && p.mode !== 'sail') setDrawn(game, !p.drawn); } },
    { key: 'I', when: playing, fn: () => ui.sideAction('inventory') },
    { key: 'Tab', when: playing, fn: () => ui.sideAction('inventory') },
    { key: 'C', when: () => playing() && !game.player?.inWater, fn: () => ui.sideAction('character') }, // (in the sea, C dives)
    { key: 'K', when: playing, fn: () => ui.sideAction('skills') },
    { key: 'J', when: playing, fn: () => ui.sideAction('journal') },
    { key: 'H', when: playing, fn: () => ui.sideAction('help') },
    { key: 'U', when: playing, fn: () => ui.sideAction('crew') },
    { key: 'L', when: playing, fn: () => ui.sideAction('quests') },
    { key: 'F1', when: () => playing() && !!game.creative?.on, fn: () => ui.sideAction('creative') },
    // the minimap: − zooms it out, + (or =) in
    { key: 'Minus', when: playing, fn: () => ui.minimapZoom(game, 1) },
    { key: 'NumpadSubtract', when: playing, fn: () => ui.minimapZoom(game, 1) },
    { key: 'Equal', when: playing, fn: () => ui.minimapZoom(game, -1) },
    { key: 'NumpadAdd', when: playing, fn: () => ui.minimapZoom(game, -1) },
  );
  game.on('saved', () => ui.savedNote());
  // (at the helm or the oars your hands are on the wheel: the weapon goes back in its sheath)
  game.on('board', () => setDrawn(game, false));
  // (the quest tracker catches up the moment a quest moves on)
  for (const ev of ['questStarted', 'questStage', 'questDone', 'questAbandoned']) game.on(ev, () => { ui.qtT = 0; });
  game.on('playerLanded', (tgt, info) => { if (view3d?.active) ui.hitMarker(info); });
  // food and medicine on the hotbar
  game.useHotbarItem = (id) => {
    const c = game.state?.char;
    if (!c) return false;
    if (!c.inventory.some((i) => i.id === id)) { game.log(`You have no ${ITEMS[id]?.name || id} left.`, '#ff8a80'); return false; }
    // food, medicine and Devil Fruits are taken in hand (hold the right button to
    // eat; again to put it away). On a touch screen they're eaten at once — a
    // Devil Fruit after the same last warning as in the Inventory.
    const d = ITEMS[id], p = game.player;
    if (d?.type === 'fruit' && input.touch?.on) { if (!game.state.char.fruit) confirmEat(game, id); else useItem(game, id); return true; }
    if (d && (d.type === 'food' || d.type === 'medicine' || d.type === 'fruit') && !input.touch?.on && p) {
      if (p.held === id) p.controller?.putAway?.(p);
      else { setDrawn(game, false); p.held = id; p.eating = null; } // (a drawn weapon goes back in its sheath)
      audio.sfx('equip');
      return true;
    }
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
      onDone: (birth, choices) => { showBoot('Setting sail…'); sail = { t0: performance.now(), frames: 0 }; ui.hideScreen(); startNewCharacter(game, birth, choices); audio.music('sea'); relockUntil = performance.now() + 2500; },
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
        showBoot('Setting sail…'); sail = { t0: performance.now(), frames: 0 };
        ui.hideScreen(); resumeCharacter(game, saved); audio.music('sea');
        relockUntil = performance.now() + 2500;
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
  // (the flyover circles Dawn Island, wherever the world put it)
  const dawn = world.islands.find((i) => i.id === 'dawn_island');
  const attract = { x: dawn ? dawn.x : world.width * 0.93, y: dawn ? dawn.y : world.height * 0.15, t: 0 };
  renderer.cam.x = attract.x; renderer.cam.y = attract.y; renderer.cam.zoom = 9;

  Object.assign(debug, {
    get view3d() { return game.view3d; },
    THREE,
    touch,
    world, renderer, game, input, ui,
    get player() { return game.player; },
    get env() { return game.env; },
    setCam(x, y, zoom) { renderer.cam.x = x; renderer.cam.y = y; if (zoom) renderer.cam.zoom = zoom; },
    teleport(x, y) { game.player.x = x; game.player.y = y; game.snapCamera(); },
    key(k, down) { input.simKey(k, down); },
    step(seconds, dt = 1 / 30) { for (let t = 0; t < seconds; t += dt) { game.update(dt); } game.render(); },
    // (carry on a saved character, as Continue does)
    resume(char) { hideBoot(true); sail = null; ui.hideScreen(); return resumeCharacter(game, char); },
    quickStart(race = 'human', opts = {}) {
      const birth = { race, traits: opts.traits || ['lucky'], seed: opts.seed || 12345 };
      hideBoot(true); sail = null;
      ui.hideScreen();
      if (opts.slot) useSlot(opts.slot);
      startNewCharacter(game, birth, { name: opts.name || 'Test Pirate', look: null });
      return game.player;
    },
    prof: { PROF, reset: profReset },
    debug: { persist: () => persist(game), THREE, npcDef, allNpcDefs, standingHeight, allQuests, VIEWS, builders: PROP_BUILDERS, makeNPC, addItem, fruitOf, fruitPicked, clamAt, regionAt, layoutOf, bw, bl, bfront, portrait: renderPortrait, launchShip, openShipwright, deckSpot: (s, which) => { const sp = which === 'hatch' ? hatchSpot(s) : helmSpot(s); return deckToWorld(s, sp.t, sp.v); }, onDeck: (s, t, v = 0) => placeOnDeck(game, game.player, s, t, v), dims: (s) => shipDims(s.def), deckToWorld,
      // stand in one of a ship's rooms ('cabin', 'captain', 'forecastle', 'hold'), f of the way along it
      inRoom: (s, kind, f = 0.5, v = 0) => {
        const r = shipDims(s.def).rooms.find((x) => x.kind === kind);
        if (!r) return null;
        const a = game.player, t = r.t0 + (r.t1 - r.t0) * f;
        placeOnDeck(game, a, s, t, v);
        const dk = game.deckAt(a.x, a.y, 0, r.floor, s);
        if (dk) { a.deck = dk; dk.ship = s; }
        a.z = 0;
        return { h: +a.deck.h.toFixed(2), lvl: typeof a.deck.lvl === 'string' ? a.deck.lvl : 'stair', solid: a.deck.solid || 0 };
      } },
    ready: true,
  });

  showTitle();

  let last = performance.now();
  const frame = (now) => {
    const frameMs = now - last;
    const dt = Math.min(0.05, frameMs / 1000);
    last = now;
    if (game.player) {
      touch.update();
      const t0 = performance.now();
      // (OP.hold: tests stepping the game frame by frame keep the live loop from advancing it)
      if (!debug.hold) game.update(dt);
      prof('sim', t0);
      // menus and dialogue need the mouse back; closing them (a click or a key:
      // the browser allows a capture then) takes it again where the view wants it
      const blocked = ui.blocksInput();
      if (view3d?.rig.locked && blocked) view3d.rig.releaseLock();
      if (blocked) relockUntil = performance.now() + 2500;
      else if (relockUntil && view3d?.rig.wantsLock && !view3d.rig.locked && !ui.mapOpen) {
        if (performance.now() < relockUntil) { view3d.rig.requestLock(); relockUntil = 0; } else relockUntil = 0;
      }
      // the world chart has its own canvas
      view3d.canvas.style.display = ui.mapOpen ? 'none' : 'block';
      renderer.glCanvas.style.display = ui.mapOpen ? 'block' : 'none';
      const t1 = performance.now();
      if (ui.mapOpen) game.renderMap();
      else game.render();
      prof('render', t1);
      if (sail) {
        sail.frames++;
        const waited = performance.now() - sail.t0;
        setBoot(0.3 + 0.7 * Math.min(1, waited / 2500), view3d?.terrain.missing ? 'Charting the waters around you…' : 'Setting sail…');
        if ((sail.frames > 6 && !view3d?.terrain.missing) || waited > 6000) { hideBoot(); sail = null; }
      }
      profFrame();
      if (!ui.mapOpen) view3d?.adapt(frameMs, performance.now() - t0);
    } else {
      attract.t += dt;
      game.env.update(dt, game);
      // a slow 3D flyover of Dawn Island behind the title
      if (!attract.failed) {
        try {
          if (!view3d.active) view3d.setActive(true);
          view3d.renderAttract(game, attract.x, attract.y, attract.t, dawn?.radius);
          if (bootFrames >= 0) {
            bootFrames++;
            setBoot(0.8 + 0.2 * Math.min(1, bootFrames / 30), view3d.terrain.missing ? 'Raising the islands…' : 'Warming up the seas…');
            if ((bootFrames > 12 && !view3d.terrain.missing) || bootFrames > 240) { hideBoot(); bootFrames = -1; }
          }
          const g = renderer.ctx;
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.clearRect(0, 0, renderer.canvas.width, renderer.canvas.height);
        } catch (e) {
          console.error('3D title view failed', e);
          attract.failed = true;
          hideBoot();
        }
      }
      ui.update(dt);
      input.endFrame();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
