// Touch controls for phones and tablets.
//  * Left thumb: a movement stick that appears wherever you touch. Push it
//    all the way to run. At the helm it steers and sets the sails.
//  * Right thumb: drag anywhere to look around (first / third person).
//  * Buttons: attack, heavy, dodge, block, use and heal. At the helm they
//    become fire, row and Coup de Burst. The Haki toggles on the hotbar are
//    tappable once awakened.
//  * The skills of what you have out (game/moveset.js) — your fists', the
//    weapon's, the Devil Fruit's or its form's — as round buttons left of the
//    pad, each with its cooldown; the Haki techniques after them while a Haki
//    is on (in its colour). The hotbar's slots take things out, as its keys do.
// Touch mode turns on with the first touch (and from the start on phones and
// tablets), and off again as soon as a real mouse clicks.
import { h, clear } from './dom.js';
import { skillImg } from './icon.js';
import { movesetOf, hakiGroupOf } from '../game/moveset.js';

const DEAD = 0.14; // stick dead zone
const RUN = 0.9; // push this far to run
const R = 54; // stick travel in CSS pixels
const SKILL_BTNS = 6, HAKI_BTNS = 3; // skill buttons shown at most (the rest: a keyboard, or Skills)

export function installTouch(game, root) {
  const ui = game.ui, inp = game.input;
  const t = inp.touch = { on: false, mx: 0, my: 0, run: false };
  const coarse = !!window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;

  // --- elements ---------------------------------------------------------------
  const btn = (cls, label) => h('button.t-btn.' + cls, { type: 'button' }, h('b', label));
  const B = {
    attack: btn('attack', 'Attack'),
    heavy: btn('heavy', 'Heavy'),
    jump: btn('jump', 'Jump'),
    dodge: btn('dodge', 'Dodge'),
    block: btn('block', 'Block'),
    use: btn('use', 'Use'),
    heal: btn('heal', 'Heal'),
  };
  const pad = h('div.touch-pad', ...Object.values(B));
  const knob = h('i');
  const stickEl = h('div.t-stick.idle', knob);
  const rotate = h('div.t-rotate.hidden', 'Turn your phone sideways for the best view');
  // the skills of what's out, and the Haki techniques (rebuilt when they change)
  const skillsEl = h('div.t-skills');
  let skillsKey = '', skillBtns = [];
  ui.hud.append(stickEl, pad, skillsEl, rotate);

  // --- input plumbing ----------------------------------------------------------
  const press = (c) => {
    if (c === 'dodge') { game.player?.controller?.requestDodge?.(); return; }
    if (c === 'heal') { game.emit('quickHeal'); return; }
    if (c === 'mouse0' || c === 'mouse2') {
      const b = +c[5], m = inp.mouse;
      if (!m.down[b]) m.pressed[b] = true;
      m.down[b] = true;
    } else inp.simKey(c, true);
  };
  const release = (c) => {
    if (c === 'dodge' || c === 'heal') return;
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
  bind(B.jump, () => 'Space');
  bind(B.dodge, () => (sailing() ? null : 'dodge'));
  bind(B.block, () => (sailing() ? null : 'F'));
  bind(B.use, () => 'E');
  bind(B.heal, () => 'heal');

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

  // --- the skill buttons ---------------------------------------------------------------
  /** The skills of what's out (and the Haki techniques) as buttons: a tap uses one, as its key would. */
  const drawSkills = (p, show) => {
    const list = [];
    if (show) {
      movesetOf(p).skills.forEach((s, i) => { if (!s.locked && list.length < SKILL_BTNS) list.push({ group: 'skills', i, def: s.def }); });
      const hg = hakiGroupOf(p);
      let n = 0;
      for (const r of hg?.rows || []) if (!r.locked && n++ < HAKI_BTNS) list.push({ group: 'haki', i: r.slot, def: r.def, color: hg.color });
    }
    const key = list.map((x) => x.group + x.i + x.def.id).join();
    if (key !== skillsKey) {
      skillsKey = key;
      clear(skillsEl);
      skillBtns = list.map((x) => {
        const cd = h('i.t-cd');
        const el = h('button.t-btn.t-sk' + (x.group === 'haki' ? '.haki' : ''), { type: 'button', title: x.def.name, style: x.color ? { borderColor: x.color } : null }, skillImg(x.def, 30), cd);
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          el.classList.add('on');
          if (x.group === 'haki') ui.useHaki(x.i); else ui.useSkill(x.i);
        });
        const up = () => el.classList.remove('on');
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        skillsEl.appendChild(el);
        return { el, cd, def: x.def };
      });
    }
    // (each greyed from the top down while it's coming back)
    for (const b of skillBtns) {
      const left = p.cooldowns?.[b.def.id] || 0;
      const k = left > 0 && b.def.cd ? Math.min(1, left / (b.def.cd * (p.cdMul ?? 1))) : 0;
      const tf = `scaleY(${k.toFixed(3)})`;
      if (b.cd.style.transform !== tf) b.cd.style.transform = tf;
    }
  };

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
      set(B.jump, knocked ? 'Get up' : sail ? 'Row' : 'Jump');
      B.dodge.classList.toggle('hidden', sail || knocked);
      set(B.heavy, sail ? 'Burst' : 'Heavy');
      B.heavy.classList.toggle('hidden', sail && !p.ship?.def?.coupDeBurst);
      B.block.classList.toggle('hidden', sail);
      B.heal.classList.toggle('hidden', sail);
      B.use.classList.toggle('hidden', !p.controller?.interaction);
      drawSkills(p, playing() && !sail && !knocked);
      if (!hinted && game.view3d?.active) {
        hinted = true;
        ui.hint('Left thumb: move (push all the way to run). Right thumb: drag to look around. Jump, dodge and fight with the buttons. Tap a hotbar slot to take something out — your Devil Fruit, a weapon — and its skills come up as buttons beside the pad.', 10);
      }
    },
  };
}
