import { h, clear } from './dom.js';
import CSS from './style.css';
import { getAbility } from '../game/abilities.js';
import { formatBerries, clamp } from '../core/math.js';
import { raceLabel } from '../data/races.js';
import { REGION_INFO, regionAt } from '../world/constants.js';

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
    // hotbar
    E.hotbar = h('div.hotbar');
    E.slots = [];
    for (let i = 0; i < 6; i++) {
      const s = { el: h('div.slot'), ico: h('span'), k: h('span.k', String(i + 1)), nm: h('span.nm'), cd: h('div.cd'), cdt: h('div.cdt') };
      s.el.append(s.ico, s.k, s.nm, s.cd, s.cdt);
      E.slots.push(s);
      E.hotbar.appendChild(s.el);
    }
    E.toggles = {};
    for (const [k, ico, key] of [['armament', '🖤', 'R'], ['observation', '👁', 'T'], ['conqueror', '👑', 'G']]) {
      const el = h('div.slot.toggle', h('span', ico), h('span.k', key));
      E.toggles[k] = el;
      E.hotbar.appendChild(el);
    }
    this.hud.appendChild(E.hotbar);
    E.prompt = h('div.prompt.hidden');
    this.hud.appendChild(E.prompt);
    E.log = h('div.log');
    this.hud.appendChild(E.log);
    // minimap
    E.mm = h('canvas.minimap', { width: 190, height: 190 });
    E.loc = h('div.loc-name');
    E.locSub = h('div.loc-sub');
    E.clock = h('div.clock');
    E.logpose = h('div.logpose.hidden', h('i'), h('span'));
    this.hud.appendChild(h('div.minimap-wrap', E.mm, E.logpose, E.loc, E.locSub, E.clock));
    E.boss = h('div.bossbar.hidden', h('h3'), bar('boss').el);
    this.hud.appendChild(E.boss);
    E.ship = h('div.shiphud.hidden');
    this.hud.appendChild(E.ship);
    E.knocked = h('div.knocked-overlay.hidden', h('div', h('h1', 'KNOCKED DOWN'), h('p.kt', ''), h('div.timer', h('i'))));
    this.hud.appendChild(E.knocked);
    R.appendChild(this.hud);
    this.bannerEl = h('div.banner', h('h2'), h('h1'), h('p'));
    R.appendChild(this.bannerEl);
    this.hintEl = h('div.hint.hidden');
    R.appendChild(this.hintEl);
    this.fadeEl = h('div.fade-black');
    R.appendChild(this.fadeEl);
    this.panelLayer = h('div');
    R.appendChild(this.panelLayer);
    this.screenLayer = h('div');
    R.appendChild(this.screenLayer);
    this.modalLayer = h('div');
    R.appendChild(this.modalLayer);
  }

  setHudVisible(v) { this.hudVisible = v; this.hud.classList.toggle('hidden', !v); }

  blocksInput() { return this.stack.length > 0 || !!this.dialogueEl || !!this.screenEl || !!this.mapOpen; }

  log(text, color = '#fff') {
    const d = h('div', { style: { color } }, text);
    this.el.log.appendChild(d);
    while (this.el.log.children.length > 7) this.el.log.removeChild(this.el.log.firstChild);
  }

  hint(text, dur = 9) {
    this.hintEl.textContent = text;
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

  fade(on) { this.fadeEl.classList.toggle('on', on); }

  onPlayerHurt() { this.hurtT = 0.3; }

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
    const close = h('button.close', { on: { click: () => this.closePanel(entry) } }, '✕');
    const panel = h('div.panel' + (wide ? '.wide' : ''), close, content);
    const bg = h('div.panel-bg', panel);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) this.closePanel(entry); });
    const entry = { el: bg, onClose, id, panel };
    this.stack.push(entry);
    this.panelLayer.appendChild(bg);
    if (this.game) this.game.paused = true;
    return entry;
  }

  closePanel(entry) {
    const e = entry || this.stack[this.stack.length - 1];
    if (!e) return;
    this.stack = this.stack.filter((x) => x !== e);
    e.el.remove();
    if (e.onClose) e.onClose();
    if (this.game && !this.stack.length && !this.dialogueEl && !this.mapOpen) this.game.paused = false;
  }

  closeAll() { while (this.stack.length) this.closePanel(); }

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
  }
  hideScreen() {
    if (this.screenEl) this.screenEl.remove();
    this.screenEl = null;
  }

  // --- per-frame HUD ------------------------------------------------------------
  render(game) {
    if (!this.hudVisible) return;
    const p = game.player;
    if (!p) return;
    const E = this.el;
    const ch = p.char || {};
    this.set(E.name, 'name', ch.name || p.name);
    const title = ch.title || (ch.faction === 'marine' ? `Marine ${ch.marineRank || 'Recruit'}` : ch.faction === 'pirate' ? 'Pirate' : 'Wanderer');
    this.set(E.sub, 'sub', `${raceLabel(p.look)} · ${title} · Doriki ${p.power().toLocaleString()}`);
    E.hp.set(p.hp / p.d.maxHp, `${Math.ceil(p.hp)} / ${p.d.maxHp}`);
    E.st.set(p.stamina / p.d.maxStamina, `${Math.ceil(p.stamina)}`);
    const hakiOn = p.hakiUnlocked();
    E.hk.el.classList.toggle('locked', !hakiOn);
    E.hk.set(hakiOn ? p.haki / p.d.maxHaki : 0, hakiOn ? `${Math.ceil(p.haki)}` : 'Haki locked');
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
    const bountyTxt = ch.faction === 'marine' ? `Justice · ${formatBerries(ch.berries || 0)}` : ch.bounty ? `☠ ${formatBerries(ch.bounty)}` : '';
    this.set(E.bounty, 'bounty', '', 'textContent');
    if (this.cache.bountyTxt !== bountyTxt + '|' + (ch.berries || 0)) {
      this.cache.bountyTxt = bountyTxt + '|' + (ch.berries || 0);
      clear(E.bounty);
      E.bounty.append(bountyTxt || '', h('small', ch.faction === 'marine' ? '' : `Purse ${formatBerries(ch.berries || 0)}`));
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
      const def = id ? getAbility(id) : null;
      const k = 'slot' + i;
      const v = def ? def.id : '';
      if (this.cache[k] !== v) {
        this.cache[k] = v;
        s.ico.textContent = def ? def.icon || '✦' : '';
        s.nm.textContent = def ? def.name : '';
        s.el.classList.toggle('empty', !def);
        s.el.title = def ? `${def.name}\n${def.desc || ''}` : 'Empty — assign techniques in the Skills menu (K)';
      }
      const cd = def ? p.cooldowns[def.id] || 0 : 0;
      const frac = def && def.cd ? clamp(cd / (def.cd * (p.cdMul ?? 1)), 0, 1) : 0;
      s.cd.style.transform = `scaleY(${frac})`;
      const txt = cd > 0.05 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
      if (s.cdt.textContent !== String(txt)) s.cdt.textContent = txt;
    }
    for (const [k, el] of Object.entries(E.toggles)) {
      const lvl = p.hakiLevel(k);
      el.classList.toggle('lock', !lvl);
      el.classList.toggle('on', k === 'armament' ? p.armament : k === 'observation' ? p.observation : !!p.conquerorInfused);
      el.title = lvl ? `${k} Haki — level ${Math.floor(lvl)}` : `${k} Haki — not awakened`;
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
    const wx = env.storm > 0.6 ? '⛈ Storm' : env.storm > 0.25 ? '🌧 Squall' : env.snow ? '❄ Snow' : env.fog > 0.3 ? '🌫 Fog' : env.daylight < 0.35 ? (env.fullMoon ? '🌕 Full moon' : '🌙 Night') : '☀ Clear';
    this.set(E.clock, 'clock', `Day ${env.day} · ${env.clockString()} · ${wx}`);
    // minimap
    this.mmT -= 1 / 60;
    if (this.mmT <= 0) { this.mmT = 0.2; this.drawMinimap(game); }
    // log pose
    const lp = game.logPoseInfo ? game.logPoseInfo() : null;
    E.logpose.classList.toggle('hidden', !lp);
    if (lp) {
      const needle = E.logpose.children[0];
      needle.style.transform = `rotate(${lp.angle + Math.PI / 2}rad)`;
      this.set(E.logpose.children[1], 'lpt', lp.label);
    }
    // boss
    const boss = game.bossTarget;
    E.boss.classList.toggle('hidden', !boss || boss.state !== 'idle');
    if (boss) {
      const h3 = E.boss.children[0];
      const bk = boss.name + (boss.title || '');
      if (this.cache.boss !== bk) { this.cache.boss = bk; clear(h3); h3.append(h('small', boss.title || ''), boss.name); }
      const bb = E.boss.children[1];
      bb.firstChild.style.width = (100 * clamp(boss.hp / boss.d.maxHp, 0, 1)) + '%';
      bb.children[1].style.width = (100 * clamp(boss.hp / boss.d.maxHp, 0, 1)) + '%';
    }
    // ship hud
    const s = p.mode === 'sail' ? p.ship : null;
    E.ship.classList.toggle('hidden', !s);
    if (s) {
      const windRel = ((env.windAngle - s.heading) * 180 / Math.PI + 360) % 360;
      const html = `<div class="row"><b>${s.name}</b><span>${s.def.name}</span></div>
        <div class="bar hull"><i style="width:${100 * s.hull / s.maxHull}%"></i><span>Hull ${Math.ceil(s.hull)}/${s.maxHull}</span></div>
        <div class="bar sail"><i style="width:${100 * s.sailSet}%"></i><span>Sails ${Math.round(s.sailSet * 100)}%</span></div>
        <div class="row"><span>Speed ${Math.abs(s.speed).toFixed(1)} kn</span><span>Wind <span class="wind" style="transform:rotate(${env.windAngle}rad)">➜</span> ${game.isCalmAt(p.x, p.y) ? 'none (Calm Belt!)' : Math.round(env.windStrength * 100) + '%'}</span></div>
        <div class="row"><span>Cannons ${s.def.cannons || 0}</span><span>${s.cannonCd > 0 ? 'reloading…' : s.def.cannons ? 'ready' : ''}</span></div>`;
      if (this.cache.shipHtml !== html) { this.cache.shipHtml = html; E.ship.innerHTML = html; void windRel; }
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
    // player arrow
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
