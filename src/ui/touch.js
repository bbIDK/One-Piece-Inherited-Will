// Touch controls for phones and tablets.
//  * Left thumb: a movement stick that appears wherever you touch. Push it
//    all the way to run. At the helm it steers and sets the sails.
//  * Right thumb: drag anywhere to look around (first / third person).
//  * Buttons: attack, heavy, dodge, block, use and heal. At the helm they
//    become fire, row and Coup de Burst. The Haki toggles on the hotbar are
//    tappable once awakened.
// Touch mode turns on with the first touch (and from the start on phones and
// tablets), and off again as soon as a real mouse clicks.
import { h } from './dom.js';

const DEAD = 0.14; // stick dead zone
const RUN = 0.9; // push this far to run
const R = 54; // stick travel in CSS pixels

export function installTouch(game, root) {
  const ui = game.ui, inp = game.input;
  const t = inp.touch = { on: false, mx: 0, my: 0, run: false };
  const coarse = !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;

  // --- elements ---------------------------------------------------------------
  const btn = (cls, label) => h('button.t-btn.' + cls, { type: 'button' }, h('b', label));
  const B = {
    attack: btn('attack', 'Attack'),
    heavy: btn('heavy', 'Heavy'),
    dodge: btn('dodge', 'Dodge'),
    block: btn('block', 'Block'),
    use: btn('use', 'Use'),
    heal: btn('heal', 'Heal'),
  };
  const pad = h('div.touch-pad', ...Object.values(B));
  const knob = h('i');
  const stickEl = h('div.t-stick.idle', knob);
  const rotate = h('div.t-rotate.hidden', 'Turn your phone sideways for the best view');
  ui.hud.append(stickEl, pad, rotate);

  // --- input plumbing ----------------------------------------------------------
  const press = (c) => {
    if (c === 'mouse0' || c === 'mouse2') {
      const b = +c[5], m = inp.mouse;
      if (!m.down[b]) m.pressed[b] = true;
      m.down[b] = true;
    } else inp.simKey(c, true);
  };
  const release = (c) => {
    if (c === 'mouse0' || c === 'mouse2') {
      const b = +c[5];
      inp.mouse.down[b] = false;
      inp.mouse.released[b] = true;
    } else inp.simKey(c, false);
  };
  /** A hold button: `pick()` says which key or mouse button it stands for right now. */
  const bind = (el, pick) => {
    let cur = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (cur) return;
      cur = pick();
      if (!cur) return;
      el.classList.add('on');
      press(cur);
      try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    });
    const up = () => {
      if (!cur) return;
      el.classList.remove('on');
      release(cur);
      cur = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };
  const sailing = () => game.player?.mode === 'sail';
  bind(B.attack, () => 'mouse0');
  bind(B.heavy, () => (sailing() ? 'Shift' : 'mouse2'));
  bind(B.dodge, () => 'Space');
  bind(B.block, () => (sailing() ? null : 'F'));
  bind(B.use, () => 'E');
  bind(B.heal, () => 'Q');

  // --- stick and look -------------------------------------------------------------
  const stick = { id: null, ox: 0, oy: 0 };
  const look = { id: null, x: 0, y: 0 };
  const placeStick = (x, y, kx, ky) => {
    stickEl.style.left = x + 'px';
    stickEl.style.top = y + 'px';
    knob.style.transform = `translate(${kx * R}px, ${ky * R}px)`;
  };
  const resetStick = () => {
    stick.id = null;
    t.mx = 0; t.my = 0; t.run = false;
    stickEl.classList.add('idle');
    stickEl.style.left = ''; stickEl.style.top = '';
    knob.style.transform = '';
  };
  const playing = () => !!game.player && !ui.blocksInput() && !ui.screenEl;

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    setOn(true);
    if (!playing()) return;
    // no emulated mouse clicks: those would attack or grab the pointer
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.42) {
      if (stick.id !== null) return;
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY;
      stickEl.classList.remove('idle');
      placeStick(stick.ox, stick.oy, 0, 0);
    } else {
      if (look.id !== null) return;
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    }
    try { root.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  }, { passive: false });

  root.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') return;
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
      const d = Math.hypot(dx, dy);
      // dragging past the rim pulls the stick along with the thumb
      if (d > R) { const k = (d - R) / d; stick.ox += dx * k; stick.oy += dy * k; dx *= R / d; dy *= R / d; }
      const mx = dx / R, my = dy / R, m = Math.hypot(mx, my);
      const s = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD) / m;
      t.mx = mx * s; t.my = my * s;
      t.run = m >= RUN;
      placeStick(stick.ox, stick.oy, mx, my);
    } else if (e.pointerId === look.id) {
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY;
      const v3 = game.view3d;
      if (v3?.active && playing()) {
        const s = game.settings || {};
        const k = 0.0025 + (s.sensitivity ?? 0.5) * 0.005;
        v3.rig.lookBy(dx * k, -dy * k * 0.85 * (s.invertY ? -1 : 1));
      }
    }
  });
  const end = (e) => {
    if (e.pointerId === stick.id) resetStick();
    if (e.pointerId === look.id) look.id = null;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  // --- on / off ------------------------------------------------------------------
  let hinted = false;
  function setOn(v) {
    if (t.on === v) return;
    t.on = v;
    ui.root.classList.toggle('touch', v);
    if (!v) resetStick();
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setOn(true);
    else if (e.pointerType === 'mouse') setOn(false);
  }, true);
  setOn(coarse);

  // --- per frame --------------------------------------------------------------------
  const set = (el, text) => { const b = el.firstChild; if (b.textContent !== text) b.textContent = text; };
  return {
    get on() { return t.on; },
    setOn,
    update() {
      const p = game.player;
      if (!t.on || !p) return;
      if (!playing()) { if (stick.id !== null) resetStick(); look.id = null; }
      pad.classList.toggle('hidden', !playing());
      stickEl.classList.toggle('hidden', !playing());
      rotate.classList.toggle('hidden', window.innerHeight <= window.innerWidth * 1.05);
      const sail = p.mode === 'sail';
      const knocked = p.state === 'knocked';
      set(B.attack, sail ? 'Fire' : 'Attack');
      B.attack.classList.toggle('hidden', sail && !p.ship?.def?.cannons && p.ship?.cannonsOverride === undefined);
      set(B.dodge, knocked ? 'Get up' : sail ? 'Row' : 'Dodge');
      set(B.heavy, sail ? 'Burst' : 'Heavy');
      B.heavy.classList.toggle('hidden', sail && !p.ship?.def?.coupDeBurst);
      B.block.classList.toggle('hidden', sail);
      B.heal.classList.toggle('hidden', sail);
      B.use.classList.toggle('hidden', !p.controller?.interaction);
      if (!hinted && game.view3d?.active) {
        hinted = true;
        ui.hint('Left thumb: move (push all the way to run). Right thumb: drag to look around. The buttons fight; tap a hotbar slot to use a technique.', 10);
      }
    },
  };
}
