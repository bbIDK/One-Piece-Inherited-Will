import { h, clear } from './dom.js';
import CSS from './style.css';
import { getAbility } from '../game/abilities.js';
import { formatBerries, clamp } from '../core/math.js';
import { raceLabel } from '../data/races.js';
import { ITEMS } from '../data/items.js';
import { REGION_INFO, regionAt } from '../world/constants.js';
import { itemImg, skillImg, uiImg } from './icon.js';
import { Compass } from './compass.js';

// the menu buttons on the right of the screen (below the minimap)
const SIDEBAR = [
  { id: 'inventory', label: 'Inventory', key: 'Tab' },
  { id: 'character', label: 'Character', key: 'C' },
  { id: 'skills', label: 'Skills', key: 'K' },
  { id: 'journal', label: 'Journal', key: 'J' },
  { id: 'crew', label: 'Crew', key: 'U' },
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
    E.hp = bar('hp'); E.st = bar('st'); E.hk = bar('hk');
    E.lives = h('div.lives');
    E.bounty = h('div.hud-bounty');
    E.buffs = h('div.buffs');
    this.hud.appendChild(h('div.hud-player', E.name, E.sub, E.hp.el, E.st.el, E.hk.el, E.lives, E.bounty, E.buffs));
    // hotbar: click a slot to use it, drag slots to rearrange
    E.hotbar = h('div.hotbar');
    E.slots = [];
    for (let i = 0; i < 6; i++) {
      const s = { el: h('div.slot.interactive'), ico: h('span.ico'), k: h('span.k', String(i + 1)), nm: h('span.nm'), qty: h('span.qty'), cd: h('div.cd'), cdt: h('div.cdt') };
      s.el.append(s.ico, s.k, s.nm, s.qty, s.cd, s.cdt);
      s.el.draggable = true;
      s.el.addEventListener('dragstart', (ev) => { if (!this.game?.player?.hotbar?.[i]) { ev.preventDefault(); return; } ev.dataTransfer.setData('text/plain', 'slot:' + i); });
      s.el.addEventListener('dragover', (ev) => { ev.preventDefault(); s.el.classList.add('over'); });
      s.el.addEventListener('dragleave', () => s.el.classList.remove('over'));
      s.el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        s.el.classList.remove('over');
        const data = ev.dataTransfer.getData('text/plain');
        if (data.startsWith('slot:')) this.swapSlots(+data.slice(5), i);
      });
      s.el.addEventListener('click', () => this.useSlot(i));
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
    this.hud.appendChild(h('div.minimap-wrap', h('div.mm-box', E.mm, E.mmArrow, E.mmNorth), E.logpose, E.loc, E.locSub, E.clock, E.saved));
    this.compass = new Compass(this.hud);
    E.boss = h('div.bossbar.hidden', h('h3'), bar('boss').el);
    this.hud.appendChild(E.boss);
    E.ship = h('div.shiphud.hidden');
    this.hud.appendChild(E.ship);
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

  blocksInput() { return this.stack.length > 0 || !!this.dialogueEl || !!this.screenEl || !!this.mapOpen; }

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

  toast(text, sub = '', color) {
    const el = h('div.toast', text, sub ? h('small', sub) : null);
    if (color) el.style.color = color;
    this.root.appendChild(el);
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
    E.crosshair.classList.toggle('hidden', !free || v3.rig.mode !== 'first' || p.mode === 'sail' && !v3.rig.locked);
    E.lookHint.classList.toggle('hidden', !free || v3.rig.locked || v3.rig.lockFailed || !!game.input.touch?.on);
    this.root.classList.toggle('v3', !!v3);
    this.compass.update(game, v3 ? v3.rig.yaw : 0, !!v3 && !this.mapOpen);
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
    this.set(E.name, 'name', ch.name || p.name);
    const title = ch.title || (ch.faction === 'marine' ? `Marine ${ch.marineRank || 'Recruit'}` : ch.crewName ? `Captain of the ${ch.crewName}` : ch.faction === 'pirate' ? 'Pirate' : 'Wanderer');
    this.set(E.sub, 'sub', `${raceLabel(p.look)} · ${title} · Doriki ${p.power().toLocaleString()}`);
    E.hp.set(p.hp / p.d.maxHp, `${Math.ceil(p.hp)} / ${p.d.maxHp}`);
    E.st.set(p.stamina / p.d.maxStamina, `${Math.ceil(p.stamina)}`);
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
    const bk = `${ch.faction}|${ch.bounty || 0}|${ch.berries || 0}`;
    if (this.cache.bountyKey !== bk) {
      this.cache.bountyKey = bk;
      clear(E.bounty);
      if (ch.faction !== 'marine' && ch.bounty) E.bounty.append(h('span.bty', uiImg('bounty', 16), ` ${formatBerries(ch.bounty)}`));
      E.bounty.append(h('small', uiImg('berries', 14), ` ${formatBerries(ch.berries || 0)}`));
    }
    const buffKey = p.buffs.map((b) => b.name + Math.ceil(b.t)).join(',') + Object.keys(p.status).join(',');
    if (this.cache.buffs !== buffKey) {
      this.cache.buffs = buffKey;
      clear(E.buffs);
      for (const b of p.buffs) if (b.name) E.buffs.appendChild(h('span.buff', `${b.name} ${Math.ceil(b.t)}s`));
      for (const s of Object.keys(p.status)) E.buffs.appendChild(h('span.buff', { style: { borderColor: '#ff8a80' } }, s));
    }
    // hotbar
    for (let i = 0; i < 6; i++) {
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
        s.el.title = def ? `${def.name}\n${def.desc || ''}\n\nClick or press ${i + 1} to use · drag to rearrange` : 'Empty — drag techniques or food here from Skills (K) or Inventory (Tab)';
      }
      if (isItem) {
        const n = (ch.inventory || []).filter((x) => x.id === id.slice(5)).reduce((a, x) => a + (x.qty || 1), 0);
        if (s.qty.textContent !== String(n)) s.qty.textContent = String(n);
        s.el.classList.toggle('none-left', n <= 0);
        s.cd.style.transform = 'scaleY(0)';
        if (s.cdt.textContent) s.cdt.textContent = '';
        continue;
      }
      if (s.qty.textContent) { s.qty.textContent = ''; s.el.classList.remove('none-left'); }
      const cd = def ? p.cooldowns[def.id] || 0 : 0;
      const frac = def && def.cd ? clamp(cd / (def.cd * (p.cdMul ?? 1)), 0, 1) : 0;
      s.cd.style.transform = `scaleY(${frac})`;
      const txt = cd > 0.05 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
      if (s.cdt.textContent !== String(txt)) s.cdt.textContent = txt;
    }
    for (const t of HAKI_TOGGLES) {
      const el = E.toggles[t.type];
      const lvl = p.hakiLevel(t.type);
      el.classList.toggle('hidden', !lvl);
      if (!lvl) continue;
      el.classList.toggle('on', t.type === 'armament' ? p.armament : t.type === 'observation' ? p.observation : !!p.conquerorInfused);
      el.title = `${t.name} — level ${Math.floor(lvl)} (${t.key})`;
    }
    // prompt
    const inter = p.controller?.interaction;
    const pk = inter ? inter.label : '';
    if (this.cache.prompt !== pk) {
      this.cache.prompt = pk;
      E.prompt.classList.toggle('hidden', !inter || this.blocksInput());
      clear(E.prompt);
      if (inter) E.prompt.append(h('kbd', 'E'), inter.label);
    }
    // location
    const isl = game.currentIsland;
    const locName = game.world.zone !== 0 ? game.world.name : isl && isl.name ? isl.name : 'Open Sea';
    this.set(E.loc, 'loc', locName);
    const reg = game.world.zone === 0 ? REGION_INFO[regionAt(p.x, p.y)]?.name || '' : game.world.subtitle || '';
    this.set(E.locSub, 'locSub', reg);
    const env = game.env;
    const wx = env.storm > 0.6 ? 'Storm' : env.storm > 0.25 ? 'Squall' : env.snow ? 'Snow' : env.fog > 0.3 ? 'Fog' : env.daylight < 0.35 ? (env.fullMoon ? 'Full moon' : 'Night') : 'Clear';
    this.set(E.clock, 'clock', `Day ${env.day} · ${env.clockString()} · ${wx}`);
    // minimap
    this.mmT -= 1 / 60;
    if (this.mmT <= 0) { this.mmT = 0.2; this.drawMinimap(game); }
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
    const boss = game.bossTarget;
    E.boss.classList.toggle('hidden', !boss || boss.state !== 'idle');
    if (boss) {
      const h3 = E.boss.children[0];
      const bk2 = boss.name + (boss.title || '');
      if (this.cache.boss !== bk2) { this.cache.boss = bk2; clear(h3); h3.append(h('small', boss.title || ''), boss.name); }
      const bb = E.boss.children[1];
      bb.firstChild.style.width = (100 * clamp(boss.hp / boss.d.maxHp, 0, 1)) + '%';
      bb.children[1].style.width = (100 * clamp(boss.hp / boss.d.maxHp, 0, 1)) + '%';
    }
    // ship hud
    const s = p.mode === 'sail' ? p.ship : null;
    E.ship.classList.toggle('hidden', !s);
    if (s) {
      const html = `<div class="row"><b>${s.name}</b><span>${s.def.name}</span></div>
        <div class="bar hull"><i style="width:${100 * s.hull / s.maxHull}%"></i><span>Hull ${Math.ceil(s.hull)}/${s.maxHull}</span></div>
        <div class="bar sail"><i style="width:${100 * s.sailSet}%"></i><span>Sails ${Math.round(s.sailSet * 100)}%</span></div>
        <div class="row"><span>Speed ${Math.abs(s.speed).toFixed(1)} kn</span><span>Wind <span class="wind" style="transform:rotate(${env.windAngle.toFixed(2)}rad)"><i></i></span> ${game.isCalmAt(p.x, p.y) ? 'none (Calm Belt!)' : Math.round(env.windStrength * 100) + '%'}</span></div>
        <div class="row"><span>Cannons ${s.def.cannons || 0}</span><span>${s.cannonCd > 0 ? 'reloading…' : s.def.cannons ? 'ready' : ''}</span></div>`;
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

  drawMinimap(game) {
    const c = this.el.mm;
    const g = c.getContext('2d');
    const w = game.world;
    const p = game.player;
    const W = c.width, H = c.height;
    const scale = p.mode === 'sail' ? 2.2 : 1; // tiles per pixel
    if (!this.mmImg) this.mmImg = g.createImageData(W, H);
    const img = this.mmImg.data;
    const map = w.map;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const tx = p.x + (i - W / 2) * scale, ty = p.y + (j - H / 2) * scale;
        const o = (j * W + i) * 4;
        if (ty < 0 || ty >= w.height || (!w.wrap && (tx < 0 || tx >= w.width))) { img[o] = 30; img[o + 1] = 40; img[o + 2] = 50; img[o + 3] = 255; continue; }
        const mx = Math.floor(w.wx(tx) / 2) % map.w, my = Math.floor(ty / 2);
        const k = (my * map.w + mx) * 4;
        const explored = w.isExplored(tx, ty);
        const f = explored ? 1 : 0.35;
        img[o] = map.data[k] * f; img[o + 1] = map.data[k + 1] * f; img[o + 2] = map.data[k + 2] * f; img[o + 3] = 255;
      }
    }
    g.putImageData(this.mmImg, 0, 0);
    // clip circle
    g.save();
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.fill();
    g.restore();
    // ships
    for (const s of game.ships) {
      if (s.sunk) continue;
      const dx = w.dx(p.x, s.x) / scale + W / 2, dy = (s.y - p.y) / scale + H / 2;
      if (Math.hypot(dx - W / 2, dy - H / 2) > W / 2 - 4) continue;
      g.fillStyle = s.owner === 'player' ? '#ffeb3b' : s.faction === 'marine' ? '#64b5f6' : '#ef5350';
      g.beginPath(); g.arc(dx, dy, 3, 0, Math.PI * 2); g.fill();
    }
    // hostiles (with observation haki you sense everything)
    for (const a of game.actors) {
      if (a === p || a.state !== 'idle' || a.hidden) continue;
      const hostileNow = a.controller?.target === p || (p.observation && a.faction !== 'civilian');
      if (!hostileNow && !a.questMarker) continue;
      const dx = w.dx(p.x, a.x) / scale + W / 2, dy = (a.y - p.y) / scale + H / 2;
      if (Math.hypot(dx - W / 2, dy - H / 2) > W / 2 - 3) continue;
      g.fillStyle = a.questMarker ? '#ffd54f' : '#ff5252';
      g.fillRect(dx - 1.5, dy - 1.5, 3, 3);
    }
    // player arrow (the 3D view draws a fixed one over the turning map)
    if (game.view3d?.active) return;
    g.save();
    g.translate(W / 2, H / 2);
    g.rotate(p.mode === 'sail' && p.ship ? p.ship.heading : p.facing);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
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
