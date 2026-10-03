import { h, clear } from './dom.js';
import CSS from './style.css';
import { getAbility } from '../game/abilities.js';
import { formatBerries, clamp } from '../core/math.js';
import { raceLabel } from '../data/races.js';
import { ITEMS } from '../data/items.js';
import { STYLES } from '../data/styles.js';
import { REGION_INFO, regionAt, REGION, RM_X, EQ } from '../world/constants.js';
import { itemImg, skillImg, uiImg } from './icon.js';
import { Compass, fmtDist } from './compass.js';
import { Waypoints } from './waypoints.js';
import { Minimap } from './minimap.js';
import { assignHotbar } from './panels.js';
import { HOTBAR_SIZE, HOTBAR_KEYS } from '../game/hotbar.js';

// the menu buttons on the right of the screen (below the minimap)
const SIDEBAR = [
  { id: 'inventory', label: 'Inventory', key: 'Tab' },
  { id: 'character', label: 'Character', key: 'C' },
  { id: 'skills', label: 'Skills', key: 'K' },
  { id: 'journal', label: 'Journal', key: 'J' },
  { id: 'crew', label: 'Crew', key: 'U' },
  { id: 'quests', label: 'Quests', key: 'L' },
  { id: 'menu', label: 'Menu', key: 'Esc' },
  // on phones: no keyboard, so the map and the camera get buttons too
  { id: 'map', label: 'Map', key: 'M', touch: true },
  { id: 'view', label: 'View', key: 'V', touch: true },
];
const HAKI_TOGGLES = [
  { type: 'armament', key: 'R', name: 'Armament Haki', icon: { id: 'toggle_armament', name: 'Armament', hakiType: 'armament', source: 'haki:armament' } },
  { type: 'observation', key: 'T', name: 'Observation Haki', icon: { id: 'toggle_observation', name: 'Observation', hakiType: 'observation', source: 'haki:observation' } },
  { type: 'conqueror', key: 'G', name: "Conqueror's Haki", icon: { id: 'haki_conqueror', name: "Conqueror's", hakiType: 'conqueror', source: 'haki:conqueror' } },
];

export class UI {
  constructor(container) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = h('div#ui');
    container.appendChild(this.root);
    this.game = null;
    this.stack = []; // open modal panels
    this.dialogueEl = null;
    this.screenEl = null;
    this.cache = {};
    this.actions = {}; // sidebar button → handler (set by main.js)
    this.buildHud();
    this.hudVisible = false;
    this.setHudVisible(false);
    this.mmT = 0;
    this.keyHandlers = []; // {key, fn} for global shortcuts
  }

  // --- HUD -----------------------------------------------------------------
  buildHud() {
    const R = this.root;
    this.hud = h('div.hud');
    this.el = {};
    const E = this.el;
    E.name = h('div.hud-name');
    E.sub = h('div.hud-sub');
    E.hp = bar('hp'); E.hk = bar('hk');
    // breath under water: a row of bubbles that pop as it runs out
    E.o2 = h('div.o2.hidden', { title: 'Breath' });
    E.o2b = [];
    for (let i = 0; i < 10; i++) { const b = h('i'); E.o2b.push(b); E.o2.appendChild(b); }
    E.lives = h('div.lives');
    E.bounty = h('div.hud-bounty');
    E.buffs = h('div.buffs');
    this.hud.appendChild(h('div.hud-player', E.name, E.sub, E.hp.el, E.o2, E.hk.el, E.lives, E.bounty, E.buffs));
    // hotbar: ten slots (1-9, 0). Click a slot to use it; drag slots to
    // rearrange them. With the Inventory or Skills open it's where you drop
    // techniques and food (or click a slot to put what you picked there).
    E.hotbar = h('div.hotbar');
    // dodging (Q) and blocking (F), left of the hotbar: no stamina, they come
    // back on cooldowns — a dodge after a moment, a guard smashed aside by a
    // heavy blow after a little longer
    E.acts = {};
    for (const [k, key, name, tip] of [['dodge', 'Q', 'Dodge', 'Dash out of the way, untouchable for an instant. It comes back after a moment.'], ['guard', 'F', 'Block', 'Hold to block (tap just before a hit to parry). A heavy blow smashes a guard aside: it can\'t come up again until this fills.']]) {
      const a = { el: h('div.slot.toggle.act.' + k, { title: `${name} (${key})\n${tip}` }), cd: h('div.cd') };
      a.el.append(h('span.ico', uiImg(k, 28)), h('span.k', key), a.cd);
      if (k === 'dodge') { a.el.classList.add('interactive'); a.el.addEventListener('click', () => { if (!this.blocksInput()) this.game?.player?.controller?.requestDodge?.(); }); }
      E.acts[k] = a;
      E.hotbar.appendChild(a.el);
    }
    E.slots = [];
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = { el: h('div.slot.interactive'), ico: h('span.ico'), k: h('span.k', HOTBAR_KEYS[i]), nm: h('span.nm'), qty: h('span.qty'), cd: h('div.cd'), cdt: h('div.cdt') };
      s.el.append(s.ico, s.k, s.nm, s.qty, s.cd, s.cdt);
      s.el.draggable = true;
      s.el.addEventListener('dragstart', (ev) => { if (!this.game?.player?.hotbar?.[i]) { ev.preventDefault(); return; } ev.dataTransfer.setData('text/plain', 'slot:' + i); ev.dataTransfer.effectAllowed = 'move'; });
      s.el.addEventListener('dragover', (ev) => { ev.preventDefault(); s.el.classList.add('over'); });
      s.el.addEventListener('dragleave', () => s.el.classList.remove('over'));
      s.el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        s.el.classList.remove('over');
        const data = ev.dataTransfer.getData('text/plain');
        if (data.startsWith('slot:')) this.swapSlots(+data.slice(5), i);
        else if (data) this.putOnHotbar(i, data);
      });
      s.el.addEventListener('click', () => {
        if (this.hotbarPick) this.putOnHotbar(i, this.hotbarPick);
        else if (!this.stack.length) this.useSlot(i);
      });
      s.el.addEventListener('contextmenu', (ev) => {
        // (right-click clears a slot while you're arranging it)
        if (!this.root.classList.contains('hb-edit')) return;
        ev.preventDefault();
        this.clearSlot(i);
      });
      E.slots.push(s);
      E.hotbar.appendChild(s.el);
    }
    E.toggles = {};
    for (const t of HAKI_TOGGLES) {
      const el = h('div.slot.toggle.hidden.interactive', h('span.ico', skillImg(t.icon, 28)), h('span.k', t.key));
      el.addEventListener('click', () => { const inp = this.game?.input; if (inp && !this.blocksInput()) { inp.simKey(t.key, true); inp.simKey(t.key, false); } });
      E.toggles[t.type] = el;
      E.hotbar.appendChild(el);
    }
    this.hud.appendChild(E.hotbar);
    // the interaction prompt; tapping it does the same as E
    E.prompt = h('div.prompt.hidden.interactive', { on: { click: () => { const inp = this.game?.input; if (inp && !this.blocksInput()) { inp.simKey('E', true); inp.simKey('E', false); } } } });
    this.hud.appendChild(E.prompt);
    E.log = h('div.log');
    this.hud.appendChild(E.log);
    // minimap
    E.mm = h('canvas.minimap', { width: 190, height: 190 });
    E.mm.addEventListener('click', () => this.sideAction('map')); // (tappable in touch mode)
    E.loc = h('div.loc-name');
    E.locSub = h('div.loc-sub');
    E.clock = h('div.clock');
    E.saved = h('div.saved-note');
    E.logpose = h('div.logpose.hidden', h('i'), h('span'));
    // in the 3D view the minimap turns with you: a fixed arrow and a north mark
    E.mmArrow = h('div.mm-arrow.hidden');
    E.mmArrow.innerHTML = '<svg viewBox="-8 -9 16 18" width="16" height="18"><path d="M0 -7.5 L6 7 L0 3.5 L-6 7 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    E.mmNorth = h('div.mm-north.hidden', 'N');
    // (the chart's icons over it: kept upright as it turns, see minimap.js pins)
    E.mmPins = h('canvas.mm-pins');
    this.hud.appendChild(h('div.minimap-wrap', h('div.mm-box', E.mm, E.mmPins, E.mmArrow, E.mmNorth), E.logpose, E.loc, E.locSub, E.clock, E.saved));
    this.compass = new Compass(this.hud);
    // where the quests on the tracker are, over the world itself
    this.waypoints = new Waypoints(this.hud);
    // under the compass while you're fighting (or being hunted)
    E.combat = h('div.combat-tag.off');
    E.combat.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><g stroke="#fff3e0" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M3 3 L12.5 12.5"/><path d="M13 3 L3.5 12.5"/><path d="M10 14 L14 10"/><path d="M2 10 L6 14"/></g></svg><span>In combat</span>';
    this.hud.appendChild(E.combat);
    // the quest tracker: the main story and up to two side quests, right of centre
    E.track = h('div.qtrack.hidden');
    this.hud.appendChild(E.track);
    E.boss = h('div.bossbar.hidden', h('h3'), bar('boss').el);
    this.hud.appendChild(E.boss);
    E.ship = h('div.shiphud.hidden');
    this.hud.appendChild(E.ship);
    // your weapon's moves and their keys, while it's drawn (X)
    E.skills = h('div.skillpanel.hidden');
    this.hud.appendChild(E.skills);
    E.knocked = h('div.knocked-overlay.hidden', h('div', h('h1', 'KNOCKED DOWN'), h('p.kt', ''), h('div.timer', h('i'))));
    this.hud.appendChild(E.knocked);
    // first person: a crosshair, and a prompt to capture the mouse
    E.crosshair = h('div.crosshair.hidden', h('i'), h('b'));
    // hit marker: flashes when your blows land
    E.hitMark = h('span.hitmark');
    E.hitMark.innerHTML = '<svg viewBox="-20 -20 40 40" width="40" height="40"><path d="M-13 -13 L-6.5 -6.5 M13 -13 L6.5 -6.5 M-13 13 L-6.5 6.5 M13 13 L6.5 6.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
    E.crosshair.appendChild(E.hitMark);
    this.hud.appendChild(E.crosshair);
    E.lookHint = h('div.look-hint.hidden', 'Click to look around', h('small', 'Esc frees the mouse · V switches view'));
    this.hud.appendChild(E.lookHint);
    R.appendChild(this.hud);
    this.bannerEl = h('div.banner', h('h2'), h('h1'), h('p'));
    R.appendChild(this.bannerEl);
    this.hintEl = h('div.hint.hidden');
    R.appendChild(this.hintEl);
    this.fadeEl = h('div.fade-black');
    R.appendChild(this.fadeEl);
    this.panelLayer = h('div');
    R.appendChild(this.panelLayer);
    // the sidebar sits above open panels so you can jump between menus
    E.side = h('div.sidebar.hidden');
    E.sideBtns = {};
    for (const b of SIDEBAR) {
      const el = h('button.side-btn' + (b.touch ? '.t-only' : ''), { title: `${b.label} (${b.key})`, on: { click: (ev) => { ev.currentTarget.blur(); this.sideAction(b.id); } } },
        uiImg(b.id, 22), h('span.lbl', b.label), h('span.key', b.key));
      E.sideBtns[b.id] = el;
      E.side.appendChild(el);
    }
    R.appendChild(E.side);
    this.screenLayer = h('div');
    R.appendChild(this.screenLayer);
    this.modalLayer = h('div');
    R.appendChild(this.modalLayer);
  }

  setHudVisible(v) {
    this.hudVisible = v;
    this.hud.classList.toggle('hidden', !v);
    this.el.side.classList.toggle('hidden', !v);
  }

  /** Sidebar / shortcut: open a menu, or close it if it is already open. */
  sideAction(id) {
    const g = this.game;
    if (!g?.player || this.screenEl) return;
    if (this.dialogueEl) return;
    if (this.mapOpen) { this.closeMap?.(); if (id === 'map') return; }
    const top = this.stack[this.stack.length - 1];
    if (top && top.id === id) { this.closeAll(); return; }
    this.closeAll();
    this.actions[id]?.();
  }

  swapSlots(a, b) {
    const p = this.game?.player;
    if (!p || a === b) return;
    const hb = p.char.hotbar;
    [hb[a], hb[b]] = [hb[b] ?? null, hb[a] ?? null];
    p.hotbar = hb;
    this.cache['slot' + a] = this.cache['slot' + b] = null;
    this.game.audio?.sfx('equip');
    this.onHotbarChange?.();
  }

  /** Put a technique or item (a drag payload) in hotbar slot i. */
  putOnHotbar(i, payload) {
    const g = this.game;
    if (!g?.player) return;
    assignHotbar(g, i, payload);
    this.hotbarPick = null;
    for (let k = 0; k < HOTBAR_SIZE; k++) this.cache['slot' + k] = null;
    this.onHotbarChange?.();
  }

  clearSlot(i) {
    const p = this.game?.player;
    if (!p) return;
    const hb = p.char.hotbar;
    if (!hb[i]) return;
    hb[i] = null;
    p.hotbar = hb;
    this.cache['slot' + i] = null;
    this.game.audio?.sfx('equip');
    this.onHotbarChange?.();
  }

  useSlot(i) {
    const g = this.game, p = g?.player;
    if (!p || this.blocksInput()) return;
    const id = p.hotbar[i];
    if (!id) return;
    // aim where the player is aiming (the crosshair / pointer), at a foe there if any
    const pc = p.controller, mw = pc?.mouseWorld;
    const aim = mw ? Math.atan2(mw.y - (p.y - 0.5), g.world.dx(p.x, mw.x)) : p.facing;
    const target = mw && pc.aimTarget ? pc.aimTarget(p, g, mw.x, mw.y) : null;
    if (p.mode !== 'sail') p.facing = aim;
    p.tryTechnique(id, g, target || (mw ? { x: mw.x, y: mw.y } : { x: p.x + Math.cos(aim) * 4, y: p.y + Math.sin(aim) * 4 }));
  }

  blocksInput() { return this.stack.length > 0 || !!this.dialogueEl || !!this.screenEl || !!this.mapOpen || !!this.consoleOpen || !!this.chatOpen; }

  log(text, color = '#fff') {
    const d = h('div', { style: { color } }, text);
    this.el.log.appendChild(d);
    while (this.el.log.children.length > 7) this.el.log.removeChild(this.el.log.firstChild);
  }

  hint(text, dur = 9) {
    if (this.game?.settings && this.game.settings.showHints === false) return;
    clear(this.hintEl);
    this.hintEl.append(uiImg('journal', 18), h('span', text));
    this.hintEl.classList.remove('hidden');
    this.hintEl.style.opacity = '1';
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { this.hintEl.style.opacity = '0'; setTimeout(() => this.hintEl.classList.add('hidden'), 500); }, dur * 1000);
  }

  banner(title, sub = '', text = '', dur = 4) {
    const [s, t, p] = this.bannerEl.children;
    s.textContent = sub; t.textContent = title; p.textContent = text;
    this.bannerEl.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), dur * 1000);
  }

  /**
   * A big message across the middle of the screen. With a key, it replaces
   * the last one of that kind still showing (switching views quickly shows
   * only the latest); any other messages still up move out of its way.
   */
  toast(text, sub = '', color, key = null) {
    this.toasts = (this.toasts || []).filter((t) => t.el.isConnected);
    if (key) for (const t of this.toasts) if (t.key === key) t.el.remove();
    this.toasts = this.toasts.filter((t) => t.el.isConnected);
    for (const t of this.toasts) {
      t.up = (t.up || 0) + 1;
      t.el.style.marginTop = `${-t.up * 76}px`;
    }
    const el = h('div.toast', text, sub ? h('small', sub) : null);
    if (color) el.style.color = color;
    this.root.appendChild(el);
    this.toasts.push({ el, key });
    setTimeout(() => el.remove(), 2700);
  }

  /** The little "Saved" note under the clock. */
  savedNote() {
    const el = this.el.saved;
    el.textContent = 'Game saved';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  fade(on) { this.fadeEl.classList.toggle('on', on); }

  onPlayerHurt() { this.hurtT = 0.3; }

  /** Flash the crosshair's hit marker (first person). */
  hitMarker({ crit, blocked } = {}) {
    const el = this.el.hitMark;
    el.className = 'hitmark' + (crit ? ' crit' : blocked ? ' blocked' : '');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** Flash the Q (dodge) or F (block) slot: pressed while it's still coming back. */
  flashAct(k) {
    const el = this.el.acts?.[k]?.el;
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  flashSlot(id) {
    const p = this.game?.player;
    if (!p) return;
    const i = p.hotbar.indexOf(id);
    if (i < 0) return;
    const el = this.el.slots[i].el;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  set(el, key, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el[prop] = val;
  }

  update(dt) {
    const g = this.game;
    if (!g) return;
    const inp = g.input;
    // global shortcuts (only while playing)
    if (this.screenEl) return;
    if (inp.wasPressed('Escape')) {
      inp.consume('Escape');
      if (this.mapOpen) { this.closeMap?.(); return; }
      if (this.dialogueEl) { this.onDialogueEscape?.(); return; }
      if (this.stack.length) { this.closePanel(); return; }
      this.openMenu?.();
      return;
    }
    if (this.dialogueEl) { this.dialogueKeys?.(inp); return; }
    for (const kh of this.keyHandlers) {
      if (inp.wasPressed(kh.key)) {
        if (kh.when && !kh.when()) continue;
        inp.consume(kh.key);
        kh.fn();
        return;
      }
    }
  }

  // --- panels -----------------------------------------------------------------
  openPanel(content, { wide = false, onClose, id } = {}) {
    if (id) { const ex = this.stack.find((s) => s.id === id); if (ex) { this.closePanel(ex); return null; } }
    const close = h('button.close', { title: 'Close (Esc)', on: { click: () => this.closePanel(entry) } }, '×');
    const panel = h('div.panel' + (wide ? '.wide' : ''), close, content);
    const bg = h('div.panel-bg' + (this.hudVisible ? '.side-pad' : ''), panel);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) this.closePanel(entry); });
    const entry = { el: bg, onClose, id, panel };
    this.stack.push(entry);
    this.panelLayer.appendChild(bg);
    if (this.game) this.game.paused = true;
    this.markSidebar();
    return entry;
  }

  closePanel(entry) {
    const e = entry || this.stack[this.stack.length - 1];
    if (!e) return;
    this.stack = this.stack.filter((x) => x !== e);
    e.el.remove();
    if (e.onClose) e.onClose();
    if (this.game && !this.stack.length && !this.dialogueEl && !this.mapOpen) this.game.paused = false;
    this.markSidebar();
  }

  closeAll() { while (this.stack.length) this.closePanel(); }

  markSidebar() {
    const top = this.stack[this.stack.length - 1];
    for (const [id, el] of Object.entries(this.el.sideBtns)) el.classList.toggle('on', !!top && top.id === id);
    // the hotbar takes drops while the Inventory or Skills is open
    const edit = !!top && (top.id === 'inventory' || top.id === 'skills');
    this.root.classList.toggle('hb-edit', edit);
    if (!edit) { this.hotbarPick = null; this.onHotbarChange = null; }
  }

  /**
   * In-game replacement for confirm()/prompt() (native dialogs are blocked in
   * some embeds). Resolves to true / the typed text, or null when cancelled.
   */
  ask({ title = '', text = '', input, ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const wasPaused = this.game ? this.game.paused : false;
      const field = input !== undefined ? h('input.ask-input#ask-input', { value: input, maxLength: 24, spellcheck: false }) : null;
      const finish = (v) => {
        if (done) return;
        done = true;
        bg.remove();
        if (this.game && !wasPaused && !this.stack.length && !this.dialogueEl && !this.mapOpen) this.game.paused = false;
        resolve(v);
      };
      const okBtn = h('button.btn' + (danger ? '.red' : '.gold'), { on: { click: () => finish(field ? field.value.trim() || null : true) } }, ok);
      const panel = h('div.panel.ask',
        title ? h('h2', title) : null,
        text ? h('p', text) : null,
        field,
        h('div.ask-row', okBtn, h('button.btn', { on: { click: () => finish(null) } }, cancel)));
      const bg = h('div.panel-bg', panel);
      bg.addEventListener('mousedown', (e) => { if (e.target === bg) finish(null); });
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
        e.stopPropagation();
      });
      this.modalLayer.appendChild(bg);
      if (this.game) this.game.paused = true;
      setTimeout(() => (field || okBtn).focus(), 0);
    });
  }

  showScreen(el) {
    this.hideScreen();
    this.screenEl = el;
    this.screenLayer.appendChild(el);
    this.el.side.classList.add('hidden');
  }
  hideScreen() {
    if (this.screenEl) this.screenEl.remove();
    this.screenEl = null;
    this.el.side.classList.toggle('hidden', !this.hudVisible);
  }

  // --- per-frame HUD ------------------------------------------------------------
  render(game) {
    if (!this.hudVisible) return;
    const p = game.player;
    if (!p) return;
    const E = this.el;
    const ch = p.char || {};
    E.side.classList.toggle('hidden', !!this.mapOpen || !!this.screenEl);
    const v3 = game.view3d?.active ? game.view3d : null;
    const free = !!v3 && !this.blocksInput();
    const aimed = !!v3 && (v3.rig.mode === 'first' || v3.rig.shiftLock);
    E.crosshair.classList.toggle('hidden', !free || !aimed || p.mode === 'sail' && !v3.rig.locked);
    E.lookHint.classList.toggle('hidden', !free || v3.rig.locked || v3.rig.lockFailed || !!game.input.touch?.on || (v3.rig.freeMouse && (this.cache.tpHintT = (this.cache.tpHintT ?? 8) - 1 / 60) < 0));
    const hintKey = !v3 ? '' : v3.rig.freeMouse ? 'free' : 'lock';
    if (this.cache.lookHint !== hintKey) {
      this.cache.lookHint = hintKey;
      clear(E.lookHint);
      if (hintKey === 'free') E.lookHint.append('Hold right mouse to turn the camera', h('small', 'Tap Ctrl for shift lock · V switches view'));
      else E.lookHint.append('Click to look around', h('small', 'Esc frees the mouse · V switches view'));
    }
    this.root.classList.toggle('v3', !!v3);
    this.compass.update(game, v3 ? v3.rig.yaw : 0, !!v3 && !this.mapOpen);
    this.waypoints.update(game, v3, !!v3 && !this.blocksInput());
    const fighting = !!p.inCombat && p.state === 'idle' && !this.mapOpen && E.boss.classList.contains('hidden');
    if (fighting !== this.cache.combat) { this.cache.combat = fighting; E.combat.classList.toggle('off', !fighting); }
    // the minimap turns so that where you look is up
    const up = v3 ? v3.rig.yaw : null;
    if (up !== null) E.mm.style.transform = `rotate(${(-Math.PI / 2 - up).toFixed(4)}rad)`;
    else if (this.cache.mmRot) E.mm.style.transform = '';
    this.cache.mmRot = up !== null;
    E.mmArrow.classList.toggle('hidden', up === null);
    E.mmNorth.classList.toggle('hidden', up === null);
    if (up !== null) {
      const heading = p.mode === 'sail' && p.ship ? p.ship.heading : p.facing;
      E.mmArrow.style.transform = `rotate(${(heading - up).toFixed(4)}rad)`;
      const phi = -Math.PI / 2 - up; // north, measured clockwise from "up"
      E.mmNorth.style.left = (50 + Math.sin(phi) * 44) + '%';
      E.mmNorth.style.top = (50 - Math.cos(phi) * 44) + '%';
    }
    // the chart round you, drawn 5 times a second (every frame while an
    // island's still being charted on it, a little at a time) and slid under
    // you every frame in between; the icons over it
    this.mmT -= 1 / 60;
    if (this.mmT <= 0) { this.drawMinimap(game); this.mmT = this.minimap?.pending ? 0 : 0.2; }
    this.minimap?.present(game);
    this.minimap?.pins(game, up);
    this.set(E.name, 'name', ch.name || p.name);
    const title = ch.title || (ch.faction === 'marine' ? `Marine ${ch.marineRank || 'Recruit'}` : ch.crewName ? `Captain of the ${ch.crewName}` : ch.faction === 'pirate' ? 'Pirate' : 'Wanderer');
    this.set(E.sub, 'sub', `${raceLabel(p.look)} · ${title} · Doriki ${p.power().toLocaleString()}`);
    E.hp.set(p.hp / p.d.maxHp, `${Math.ceil(p.hp)} / ${p.d.maxHp}`);
    // breath — or, for a Devil Fruit user thrashing in the sea, the seconds
    // before it drags them under
    const struggling = p.inWater && p.fruit && !p.gills && !p.sinking && p.struggle != null;
    const o2max = struggling ? p.struggleTime() : p.maxOxygen, o2 = struggling ? Math.max(0, p.struggle) : p.oxygen;
    const showO2 = !p.gills && o2 != null && Number.isFinite(o2max) && (struggling || o2 < o2max - 0.05);
    if (showO2 !== this.cache.o2on) { E.o2.classList.toggle('hidden', !showO2); this.cache.o2on = showO2; }
    if (showO2) {
      const f = (o2 / o2max) * 10;
      const key = Math.ceil(f * 2) + (f < 2.5 ? 'L' : '');
      if (key !== this.cache.o2k) {
        this.cache.o2k = key;
        for (let i = 0; i < 10; i++) E.o2b[i].className = i < Math.floor(f) ? '' : i < f ? 'half' : 'pop';
        E.o2.classList.toggle('low', f < 2.5);
      }
    }
    // the spirit (Haki) bar doesn't exist until Haki awakens
    const hakiOn = p.hakiUnlocked();
    E.hk.el.classList.toggle('hidden', !hakiOn);
    if (hakiOn) E.hk.set(p.haki / p.d.maxHaki, `${Math.ceil(p.haki)}`);
    // lives
    const lives = ch.lives ?? 3, maxLives = ch.maxLives ?? 3;
    const key = lives + '/' + maxLives;
    if (this.cache.lives !== key) {
      const prev = this.cache.livesN;
      this.cache.lives = key;
      this.cache.livesN = lives;
      clear(E.lives);
      for (let i = 0; i < maxLives; i++) {
        const v = h('div.vivre' + (i >= lives ? '.burnt' : ''), { title: 'Vivre Card — a life' });
        if (prev !== undefined && i === lives && prev > lives) v.classList.add('burning');
        E.lives.appendChild(v);
      }
    }
    // how the Marines see you: wanted (recognised on sight), hooded, watched, spotted
    const W = game.wanted;
    const tier = W ? W.tier() : 0;
    const heat = !W || tier < 2 ? '' : W.spotted > 0 ? 'spotted' : W.watched > 0 ? 'watched' : W.hooded() ? 'hooded' : 'wanted';
    const bk = `${ch.faction}|${ch.bounty || 0}|${ch.berries || 0}|${heat}`;
    if (this.cache.bountyKey !== bk) {
      this.cache.bountyKey = bk;
      clear(E.bounty);
      if (ch.faction !== 'marine' && ch.bounty) E.bounty.append(h('span.bty', uiImg('bounty', 16), ` ${formatBerries(ch.bounty)}`));
      E.bounty.append(h('small', uiImg('berries', 14), ` ${formatBerries(ch.berries || 0)}`));
      const TAG = { wanted: ['WANTED', 'Marines who get a good look at you will know your face'], hooded: ['HOODED', 'Your hood hides your face (it slips if you fight or steal)'], watched: ['WATCHED', 'A Marine is looking at you…'], spotted: ['SPOTTED', 'The Marines know who you are!'] };
      if (heat) E.bounty.append(h('span.heat.' + heat, { title: TAG[heat][1] }, TAG[heat][0]));
    }
    const buffKey = p.buffs.map((b) => b.name + Math.ceil(b.t)).join(',') + Object.keys(p.status).join(',');
    if (this.cache.buffs !== buffKey) {
      this.cache.buffs = buffKey;
      clear(E.buffs);
      for (const b of p.buffs) if (b.name) E.buffs.appendChild(h('span.buff', `${b.name} ${Math.ceil(b.t)}s`));
      for (const s of Object.keys(p.status)) E.buffs.appendChild(h('span.buff', { style: { borderColor: '#ff8a80' } }, s));
    }
    // hotbar
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = E.slots[i];
      const id = p.hotbar[i];
      const isItem = typeof id === 'string' && id.startsWith('item:');
      const def = !id ? null : isItem ? ITEMS[id.slice(5)] : getAbility(id);
      const k = 'slot' + i;
      const v = def ? id : '';
      if (this.cache[k] !== v) {
        this.cache[k] = v;
        clear(s.ico);
        if (def) s.ico.appendChild(isItem ? itemImg(id.slice(5), 34) : skillImg(def, 34));
        s.nm.textContent = def ? def.name : '';
        s.el.classList.toggle('empty', !def);
        const use = def?.type === 'weapon' ? 'draw it (again to sheathe it)' : 'use';
        s.el.title = def ? `${def.name}\n${def.desc || ''}\n\nClick or press ${HOTBAR_KEYS[i]} to ${use} · drag to rearrange` : 'Empty — open Skills (K) or Inventory (Tab) and drag techniques, food or weapons here';
      }
      if (isItem) {
        const n = (ch.inventory || []).filter((x) => x.id === id.slice(5)).reduce((a, x) => a + (x.qty || 1), 0);
        // the last one's gone: the slot empties (the item lived in it)
        if (n <= 0) { p.hotbar[i] = null; if (ch.hotbar) ch.hotbar[i] = null; this.cache[k] = null; continue; }
        // (a weapon: lit up while it's drawn)
        const weapon = def.type === 'weapon';
        const qty = weapon && n === 1 ? '' : String(n);
        if (s.qty.textContent !== qty) s.qty.textContent = qty;
        s.el.classList.toggle('held', (weapon && !!p.drawn && (ch.equipped?.weapons || []).includes(id.slice(5))) || p.held === id.slice(5));
        s.el.classList.toggle('none-left', n <= 0);
        // (eating it: the slot empties as it goes down)
        const e = p.eating && p.eating.id === id.slice(5) ? p.eating : null;
        s.cd.style.transform = `scaleY(${e ? clamp(e.t / e.dur, 0, 1) : 0})`;
        if (s.cdt.textContent) s.cdt.textContent = '';
        continue;
      }
      if (s.qty.textContent) { s.qty.textContent = ''; s.el.classList.remove('none-left'); }
      s.el.classList.remove('held');
      const cd = def ? p.cooldowns[def.id] || 0 : 0;
      const frac = def && def.cd ? clamp(cd / (def.cd * (p.cdMul ?? 1)), 0, 1) : 0;
      s.cd.style.transform = `scaleY(${frac})`;
      const txt = cd > 0.05 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
      if (s.cdt.textContent !== String(txt)) s.cdt.textContent = txt;
    }
    // dodge and guard: their cooldowns sweep down like a technique's; the dodge
    // gives a pulse when it's back, the guard lights up while it's raised
    const sea = p.mode === 'sail';
    if (sea !== this.cache.actSea) { this.cache.actSea = sea; for (const a of Object.values(E.acts)) a.el.classList.toggle('hidden', sea); }
    const dodge = E.acts.dodge, guard = E.acts.guard;
    const dcd = p.dodgeCd > 0 ? clamp(p.dodgeCd / (p.dodgeCdMax || 1), 0, 1) : 0;
    if (dcd !== this.cache.dodgeCd) {
      if (!dcd && this.cache.dodgeCd) { dodge.el.classList.remove('ready'); void dodge.el.offsetWidth; dodge.el.classList.add('ready'); }
      this.cache.dodgeCd = dcd;
      dodge.cd.style.transform = `scaleY(${dcd.toFixed(3)})`;
      dodge.el.classList.toggle('wait', dcd > 0);
    }
    const gcd = p.guardCd > 0 ? clamp(p.guardCd / p.guardCooldown(), 0, 1) : 0;
    if (gcd !== this.cache.guardCd) {
      this.cache.guardCd = gcd;
      guard.cd.style.transform = `scaleY(${gcd.toFixed(3)})`;
      guard.el.classList.toggle('broken', gcd > 0);
    }
    if (!!p.blocking !== this.cache.guardOn) { this.cache.guardOn = !!p.blocking; guard.el.classList.toggle('on', !!p.blocking); }
    for (const t of HAKI_TOGGLES) {
      const el = E.toggles[t.type];
      const lvl = p.hakiLevel(t.type);
      el.classList.toggle('hidden', !lvl);
      if (!lvl) continue;
      el.classList.toggle('on', t.type === 'armament' ? p.armament : t.type === 'observation' ? p.observation : !!p.conquerorInfused);
      el.title = `${t.name} — level ${Math.floor(lvl)} (${t.key})`;
    }
    // prompt (with food in hand and nothing to use nearby: how to eat it)
    let inter = p.controller?.interaction, pKey = 'E';
    if (!inter && p.held && ITEMS[p.held]) {
      const it = ITEMS[p.held], free = !!this.game.view3d?.rig.freeMouse;
      const verb = it.type !== 'medicine' ? 'eat' : /bandage/i.test(p.held) ? 'bind your wounds with' : 'take';
      inter = { label: `${free ? verb[0].toUpperCase() + verb.slice(1) : 'Hold to ' + verb} the ${it.name}` };
      pKey = free ? 'Right-click' : 'RMB';
    }
    // (hidden while a conversation or a menu is open: it comes back when they close)
    const pk = inter ? pKey + inter.label + (this.blocksInput() ? '|blocked' : '') : '';
    if (this.cache.prompt !== pk) {
      this.cache.prompt = pk;
      E.prompt.classList.toggle('hidden', !inter || this.blocksInput());
      clear(E.prompt);
      if (inter) E.prompt.append(h('kbd', pKey), inter.label);
    }
    // location
    const isl = game.currentIsland;
    const rmHere = game.world.zone === 0 && !isl?.name && Math.abs(game.world.dx(p.x, RM_X)) < 1000 && Math.abs(p.y - EQ) < 2300 && regionAt(p.x, p.y) === REGION.RED_LINE;
    // (up on the Red Line's rock itself: not the open sea)
    const onRedLine = !isl?.name && game.world.zone === 0 && !p.inWater && p.mode !== 'sail' && regionAt(p.x, p.y) === REGION.RED_LINE && !game.world.isLiquid(p.x, p.y);
    const locName = game.world.zone !== 0 ? game.world.name : isl && isl.name ? isl.name : rmHere ? 'Reverse Mountain' : onRedLine ? 'The Red Line' : 'Open Sea';
    this.set(E.loc, 'loc', locName);
    const reg = game.world.zone === 0 ? REGION_INFO[regionAt(p.x, p.y)]?.name || '' : game.world.subtitle || '';
    this.set(E.locSub, 'locSub', reg);
    const env = game.env;
    const wx = env.storm > 0.6 ? 'Storm' : env.storm > 0.25 ? 'Squall' : env.snow ? 'Snow' : env.fog > 0.3 ? 'Fog' : env.daylight < 0.35 ? (env.fullMoon ? 'Full moon' : 'Night') : 'Clear';
    this.set(E.clock, 'clock', `Day ${env.day} · ${env.clockString()} · ${wx}`);
    // quest tracker
    this.qtT = (this.qtT || 0) - 1 / 60;
    if (this.qtT <= 0) { this.qtT = 0.35; this.drawTracker(game); }
    // log pose
    const lp = game.logPoseInfo ? game.logPoseInfo() : null;
    E.logpose.classList.toggle('hidden', !lp);
    if (lp) {
      const needle = E.logpose.children[0];
      // (in the 3D view the needle is relative to where you look)
      needle.style.transform = `rotate(${v3 ? lp.angle - v3.rig.yaw : lp.angle + Math.PI / 2}rad)`;
      this.set(E.logpose.children[1], 'lpt', lp.label);
    }
    // boss
    // (only while you're in the fight with them, close by: beaten, gone, or
    // you've gone down and woken far away, it goes)
    let boss = game.bossTarget;
    if (boss && (!boss.alive || boss.state === 'dead' || !game.actors.includes(boss))) boss = game.bossTarget = null;
    const inIt = boss && boss.state === 'idle' && p.state !== 'knocked' && game.world.distance(p.x, p.y, boss.x, boss.y) < 40
      && (boss.controller?.target === p || (boss.lastHitBy === p && game.time - (boss.lastHitT || -99) < 15));
    E.boss.classList.toggle('hidden', !inIt);
    if (boss) {
      const h3 = E.boss.children[0];
      const bk2 = boss.name + (boss.title || '');
      if (this.cache.boss !== bk2) { this.cache.boss = bk2; clear(h3); h3.append(h('small', boss.title || ''), boss.name); }
      const bb = E.boss.children[1];
      bb.firstChild.style.width = (100 * clamp(boss.hp / boss.d.maxHp, 0, 1)) + '%';
      bb.children[1].style.width = (100 * clamp(boss.hp / boss.d.maxHp, 0, 1)) + '%';
    }
    // the drawn weapon's moves
    this.spT = (this.spT || 0) - 1 / 60;
    if (this.spT <= 0) { this.spT = 0.1; this.drawSkills(game, p); }
    // ship hud
    const s = p.mode === 'sail' ? p.ship : null;
    E.ship.classList.toggle('hidden', !s);
    if (s) {
      // (a rowboat: no sails and no wind to speak of, just how you're pulling)
      const oars = s.def.oarsOnly ? (s.rowL < 0 || s.rowR < 0 ? 'backing water' : s.rowL && s.rowR ? 'pulling ahead' : s.rowL || s.rowR ? 'pulling one oar' : 'shipped') : null;
      // (a ship of yours can't break: her hull always reads sound, see SHIPS_UNBREAKABLE)
      const hull = s.unbreakable ? 'Hull sound · can\'t break' : `Hull ${Math.ceil(s.hull)}/${s.maxHull}`;
      const html = `<div class="row"><b>${s.name}</b><span>${s.def.name}</span></div>
        <div class="bar hull"><i style="width:${s.unbreakable ? 100 : 100 * s.hull / s.maxHull}%"></i><span>${hull}</span></div>
        ${oars ? `<div class="bar sail"><i style="width:${100 * Math.abs(s.rowPow || 0)}%"></i><span>${(s.rowPow || 0) < -0.03 ? 'Backing water' : (s.rowPow || 0) > 0.03 ? `Oars ${Math.round(s.rowPow * 100)}%` : 'Oars shipped'} · W/S pace</span></div>` : `<div class="bar sail"><i style="width:${100 * s.sailSet}%"></i><span>Sails ${Math.round(s.sailSet * 100)}%</span></div>`}
        <div class="row"><span>Speed ${Math.abs(s.speed).toFixed(1)} kn</span>${oars ? '' : `<span>Wind <span class="wind" style="transform:rotate(${env.windAngle.toFixed(2)}rad)"><i></i></span> ${game.isCalmAt(p.x, p.y) ? 'none (Calm Belt!)' : Math.round(env.windStrength * 100) + '%'}</span>`}</div>
        ${s.def.cannons ? `<div class="row"><span>Cannonballs ${s.shot}/${s.shotCap}</span><span>${s.shot <= 0 ? 'none left!' : s.cannonCd > 0 ? 'reloading…' : 'ready'}</span></div>` : ''}`;
      if (this.cache.shipHtml !== html) { this.cache.shipHtml = html; E.ship.innerHTML = html; }
    }
    // knocked
    const kn = p.state === 'knocked';
    E.knocked.classList.toggle('hidden', !kn);
    if (kn && game.knockInfo) {
      const ki = game.knockInfo();
      this.set(E.knocked.querySelector('.kt'), 'kt', ki.text);
      E.knocked.querySelector('.timer i').style.width = (100 * ki.frac) + '%';
    }
  }

  /**
   * While your weapon is drawn: its style's moves and the keys that do them
   * (the click, the right click, and the skills you've learned for it with
   * their hotbar keys), each greyed with its time left while it's cooling
   * down. Put away, or with no skills learned for it yet, it isn't shown.
   */
  drawSkills(game, p) {
    const E = this.el, c = game.state?.char;
    const st = p.drawn && p.weapon && p.mode !== 'sail' && !game.input?.touch?.on ? STYLES[p.style] : null;
    const learned = st ? (st.techniques || []).filter((t) => (p.techniques || []).includes(t.id)) : [];
    if (!st || !learned.length) { E.skills.classList.add('hidden'); this.cache.skills = null; return; }
    const keyOf = (id) => { const i = (p.hotbar || []).indexOf(id); return i >= 0 ? HOTBAR_KEYS[i] : null; };
    const rows = [['LMB', st.m1?.[0]?.name || 'Strike', 0], ['RMB', st.heavy?.name || 'Heavy blow', p.cooldowns?.[st.heavyId] || 0]];
    for (const t of learned) rows.push([keyOf(t.id), t.name, p.cooldowns?.[t.id] || 0]);
    const names = (c?.equipped?.weapons || []).map((id) => ITEMS[id]?.name).filter(Boolean);
    const key = JSON.stringify([p.style, names, rows.map((r) => [r[0], r[1], Math.ceil(r[2] * 2)])]);
    E.skills.classList.remove('hidden');
    if (key === this.cache.skills) return;
    this.cache.skills = key;
    clear(E.skills);
    E.skills.appendChild(h('div.sp-head', h('b', st.name), h('span', names.join(' · '))));
    for (const [k, name, cd] of rows) {
      E.skills.appendChild(h('div.sp-row' + (cd > 0 ? '.cd' : '') + (k ? '' : '.unbound'),
        h('kbd', k || '—'), h('span.sp-n', name), cd > 0 ? h('span.sp-cd', `${cd.toFixed(1)}s`) : null));
    }
    E.skills.appendChild(h('div.sp-foot', h('kbd', 'X'), ' to sheathe'));
  }

  /** The quest tracker: what to do next in the main story (and where), and the tracked side quests. */
  drawTracker(game) {
    const E = this.el, q = game.quests, c = game.state?.char, p = game.player;
    if (!q || !c || !p) { E.track.classList.add('hidden'); return; }
    const w = game.world;
    const where = (id) => {
      const m = q.marker(id);
      if (!m || !Number.isFinite(m.x) || (m.zone ? m.zone !== w.id : w !== game.surface)) return '';
      const d = w.distance(p.x, p.y, m.x, m.y);
      if (d < 12) return 'here';
      const a = Math.atan2(m.y - p.y, w.dx(p.x, m.x));
      const dir = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
      return `${fmtDist(d)} ${dir}`;
    };
    const card = (qq, main, sub = null) => {
      // (a step that's "see that quest through": what to do in it, here)
      const on = sub || qq;
      const st = on.def.stages[on.s.stage];
      const pr = q.progress(on.id);
      const at = where(qq.id);
      return [
        main ? h('div.qt-head', uiImg('quest', 14), qq.def.part ? `MAIN STORY · PART ${qq.def.part}` : 'MAIN STORY') : null,
        h('div.qt-title', qq.def.name),
        sub ? h('div.qt-sub', sub.def.name) : null,
        h('div.qt-obj', st?.desc || '', pr ? h('span.qt-n', ` ${pr.n}/${pr.of}`) : null),
        at ? h('div.qt-where', at === 'here' ? 'You are here' : at) : null,
      ];
    };
    const main = q.main();
    const sub = q.mainSub();
    const side = q.tracked();
    const key = JSON.stringify([main && [main.id, main.s.stage, q.progress(main.id), where(main.id)], sub && [sub.id, sub.s.stage, q.progress(sub.id)], side.map((x) => [x.id, x.s.stage, q.progress(x.id), where(x.id)]), c.mainIntro || null, (c.stats?.playTime || 0) > 600 && !game.currentIsland]);
    if (key === this.cache.track) return;
    this.cache.track = key;
    clear(E.track);
    if (main) E.track.appendChild(h('div.qt-main', ...card(main, true, sub)));
    else if (c.mainIntro) {
      // (after a while away from home, just a reminder)
      const brief = (c.stats?.playTime || 0) > 600 && !game.currentIsland;
      E.track.appendChild(h('div.qt-main', h('div.qt-head', uiImg('quest', 14), 'MAIN STORY'), h('div.qt-title', 'Find your calling'), h('div.qt-obj', brief ? 'Look for the orange ! — or see Quests (L).' : c.mainIntro)));
    }
    for (const x of side) E.track.appendChild(h('div.qt-side', ...card(x, false)));
    E.track.classList.toggle('hidden', !E.track.childNodes.length);
  }

  /** The minimap: the world chart round you (see minimap.js). */
  drawMinimap(game) {
    (this.minimap ||= new Minimap(this.el.mm, this.el.mmPins)).draw(game, 0.2);
  }

  /** − and +: the minimap a step out (+1) or in (−1), at once, saying how far across it now reaches. */
  minimapZoom(game, d) {
    const mm = this.minimap ||= new Minimap(this.el.mm, this.el.mmPins);
    const sailing = game.player?.mode === 'sail';
    const was = mm.scale(sailing), now = mm.zoomBy(d, sailing);
    if (now === was) return;
    const across = (this.el.mm.clientWidth || 190) * now;
    mm.flash = { text: across >= 1000 ? `${(across / 1000).toFixed(across >= 10000 ? 0 : 1)} km across` : `${Math.round(across)} m across`, until: performance.now() + 1600 };
    this.mmT = 0;
  }
}

function bar(cls) {
  const i = h('i'), b = h('b'), span = h('span');
  const el = h('div.bar.' + cls, b, i, span);
  let last = -1;
  return {
    el,
    set(frac, text) {
      frac = clamp(frac, 0, 1);
      if (Math.abs(frac - last) > 0.002) { i.style.width = (frac * 100) + '%'; b.style.width = (frac * 100) + '%'; last = frac; }
      if (span.textContent !== text) span.textContent = text;
    },
  };
}
