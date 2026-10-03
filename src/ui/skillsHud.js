// The skills panel at the bottom right, and how the hotbar's moveset entries
// look. The panel shows what you have out (moveset.js): its name and
// mastery, each of its skills on its key with its icon and cooldown (the
// ones still to learn, and what opens them), what the mouse does with it,
// the fruit's forms and its awakening, and what opens next — and below it,
// while a Haki is on (always, for a king), the Haki techniques on their own
// keys. Click a key on it to change it (rebind.js).
//
// It keeps clear of everything else at the bottom: level with the hotbar
// where there's room beside it (the hotbar steps left a little if it must),
// above it where there isn't — and the quest tracker moves up out of its way.
// On a touch screen the skills are buttons instead (touch.js); at the helm
// the ship's panel has the corner.
import { h, clear } from './dom.js';
import { itemImg, skillImg } from './icon.js';
import { getAbility } from '../game/abilities.js';
import { STYLES } from '../data/styles.js';
import { FRUITS } from '../data/fruits.js';
import { movesetOf, hakiGroupOf, movesetKind, formBuff } from '../game/moveset.js';
import { formLock } from '../game/entries.js';
import { keysOf, keyLabel, SKILL_SLOTS } from '../game/keys.js';
import { ENTRY, formOfEntry, HOTBAR_KEYS } from '../game/hotbar.js';

/** A fist, for the fists' entry (icons.js draws it from the name). */
const FISTS = { id: 'ms_fists', name: 'Fists', source: 'style:brawler', style: 'brawler' };
/** How many of a moveset's skills still to learn are shown (the rest: Skills, K). */
const LOCKED_SHOWN = 2;

const shortFruit = (f) => f.en.replace(/ Fruit.*$/, '');
const fmt = (t) => (t >= 10 ? String(Math.ceil(t)) : t.toFixed(1));

/** The hotbar key an entry is on, or ''. */
function hotKey(p, id) {
  const i = (p.hotbar || []).indexOf(id);
  return i >= 0 ? HOTBAR_KEYS[i] : '';
}

/**
 * How moveset entry `id` on the hotbar (hotbar.js) looks just now: { key (to
 * redraw it when it changes), img(px), name, tip, on (out just now), dim
 * (can't be taken out yet), cd: { id, max } (its activation's cooldown),
 * left (seconds a form has left) }.
 */
export function entryView(p, id) {
  const kind = movesetKind(p), fb = formBuff(p);
  if (id === ENTRY.fists) {
    return { key: id, img: (px) => skillImg(FISTS, px), name: 'Fists', on: kind === 'fists',
      tip: 'Fists — your bare hands: the weapon back in its sheath, the Devil Fruit put away. Their moves show at the bottom right.' };
  }
  const f = FRUITS[p.fruit];
  if (!f) return { key: id + '|none', img: null, name: '', dim: true, tip: 'No Devil Fruit power — right-click to clear the slot while arranging it.' };
  if (id === ENTRY.fruit) {
    return { key: id + p.fruit, img: (px) => itemImg('fruit_' + p.fruit, px), name: shortFruit(f), on: kind === 'fruit' && !fb, out: kind === 'fruit',
      tip: `${f.name} (${f.en})\nIts powers: its techniques on the skill keys, its blows on the mouse.\nPress to take it out — again to put it away (or, in a form, back to its base set).` };
  }
  const formId = id === ENTRY.awake ? 'awake' : formOfEntry(id);
  const F = formId === 'awake' ? f.awakening : f.forms.find((x) => x.id === formId);
  if (!F) return { key: id + '|none', img: null, name: '?', dim: true, tip: 'Not a form of your fruit.' };
  const def = getAbility(F.activate);
  const on = kind === 'fruit' && fb?.form === formId;
  const lock = formLock(p, formId);
  const tired = !on && p.buffs.some((b) => b.noForms);
  return {
    key: id + p.fruit, img: (px) => (def ? skillImg(def, px) : null), name: F.name, on, dim: !!lock || tired,
    cd: def?.cd ? { id: def.id, max: def.cd } : null, left: on && Number.isFinite(fb.t) ? fb.t : null,
    tip: `${F.name}${formId === 'awake' ? ' — the awakened set' : ''}\n${F.desc || ''}\n\n${lock || (formId === 'awake' ? 'Press to switch it on — again to switch it off.' : 'Press to switch it on — again to switch it off. It runs out by itself.')}`,
  };
}

/** Is any skill or entry `id` on the panel just now (its row, to flash), or null. */
export function panelRow(ui, id) { return ui.spRows?.[id] || null; }

/**
 * Draw the panel (every tenth of a second: redrawn only when something on it
 * changed). `ui.rebindSlot(group, i, name)` starts changing a key. Where the
 * screen is short of room it comes in a compact form (no "next", no locked
 * rows), and if even that won't fit the quest tracker keeps to its titles.
 */
export function drawSkillsHud(ui, game, p) {
  const E = ui.el;
  const show = p.mode !== 'sail' && !game.input?.touch?.on && p.state !== 'knocked' && !ui.dialogueEl && !ui.screenEl && !ui.mapOpen;
  if (!show) { if (ui.cache.skills !== null) { E.skills.classList.add('hidden'); ui.cache.skills = null; ui.spRows = {}; unplace(ui); } return; }
  const K = keysOf(game.settings);
  const ms = movesetOf(p);
  const hg = hakiGroupOf(p);
  const cd = (id) => p.cooldowns?.[id] || 0;
  const all = ms.skills.map((s, i) => ({ ...s, i }));
  const st = STYLES[p.style] || STYLES.brawler;
  const f = FRUITS[p.fruit];
  // the mouse: the chain and the heavy of what's out
  const m1Name = ms.kind === 'fruit' ? `${shortFruit(f)} strikes` : `${st.name} combo`;
  const hv = ms.heavy ? getAbility(ms.heavy) : null;
  const heavyName = hv?.name || st.heavy?.name || 'Heavy blow';
  const heavyCd = cd(hv?.id || st.heavyId);
  const fb = formBuff(p);
  const free = !game.view3d?.active || !game.view3d.rig.locked;
  const capture = ui.capturing ? `${ui.capturing.group}${ui.capturing.slot}` : '';
  const key = JSON.stringify([ms.kind, ms.title, ms.sub, ms.color, all.map((s) => [s.id, s.locked, s.why, K.skills[s.i], Math.ceil(cd(s.id) * 2)]), m1Name, heavyName, Math.ceil(heavyCd * 2),
    ms.forms.map((F) => [F.id, F.open, F.on, hotKey(p, F.entry)]), ms.next, fb ? [fb.form, Math.ceil(fb.t)] : null, hotKey(p, ENTRY.fruit), free, capture,
    hg && [hg.title, hg.rows.map((r) => [r.id, r.slot, r.locked, K.haki[r.slot], Math.ceil(cd(r.id) * 2)]), Math.floor(p.hakiLevel(hg.active || 'conqueror'))]]);
  E.skills.classList.remove('hidden');
  if (key === ui.cache.skills) {
    // (the tracker beside it grew: lay it out afresh next time)
    if (place(ui) > 0) ui.cache.skills = null;
    return;
  }
  ui.cache.skills = key;
  // (a key to click and change; none for a Haki technique still to learn — its key is whichever is free when it comes)
  const badge = (group, i, name, k) => (i < 0 ? h('kbd.sp-key.unbound', '—') : h('kbd.sp-key.interactive' + (capture === group + i ? '.capture' : '') + (k ? '' : '.unbound'), {
    title: `Click, then press the key you want for ${name} (Esc: leave it, Delete: no key)`,
    on: { click: (e) => { e.stopPropagation(); ui.rebindSlot(group, i, name); } },
  }, capture === group + i ? '…' : keyLabel(k)));
  const row = (group, s, i, k) => {
    const c = cd(s.id);
    const el = h('div.sp-row' + (s.locked ? '.locked' : '') + (c > 0 ? '.cd' : '') + (s.why && !s.locked ? '.needs' : ''),
      badge(group, i, s.def.name, k), skillImg(s.def, 20),
      s.locked || s.why ? h('div.sp-t', h('span.sp-n', s.def.name), h('small.sp-why', s.why)) : h('span.sp-n', s.def.name),
      c > 0 ? h('span.sp-cd', fmt(c)) : null);
    el.title = `${s.def.name}${s.def.desc ? '\n' + s.def.desc : ''}${s.def.cd ? `\nCooldown ${s.def.cd}s` : ''}${s.why ? `\n\n${s.why[0].toUpperCase() + s.why.slice(1)}` : ''}`;
    ui.spRows[s.id] = el;
    return el;
  };
  /** The panel, `full` or compact (what opens next, the locked rows and the hints left out). */
  const build = (full) => {
    ui.spRows = {};
    clear(E.skills);
    E.skills.classList.toggle('compact', !full);
    // (the skills still to learn: the next couple of them — or, with nothing learned yet, just the next one)
    const locked = all.filter((s) => s.locked);
    const unlocked = all.filter((s) => !s.locked);
    const lockedShown = new Set(locked.slice(0, full ? LOCKED_SHOWN : unlocked.length ? 0 : 1).map((s) => s.i));
    const shown = all.filter((s) => !s.locked || lockedShown.has(s.i));
    const more = locked.length - lockedShown.size;
    // ---- what's out
    const box = h('div.sp-box', { style: { '--sp-c': ms.color } });
    box.appendChild(h('div.sp-head', h('b', ms.title), h('span', ms.sub)));
    for (const s of shown) box.appendChild(row('skills', s, s.i, K.skills[s.i]));
    if (ms.skills.length > SKILL_SLOTS) box.appendChild(h('div.sp-more', `${ms.skills.length - SKILL_SLOTS} more than there are skill keys: see Skills (K)`));
    if (more > 0) box.appendChild(h('div.sp-more', `+${more} more to learn — Skills (K)`));
    if (!shown.length) box.appendChild(h('div.sp-more', ms.kind === 'weapon' ? 'No techniques for it yet: a trainer teaches them.' : 'No techniques yet: trainers teach them, a Devil Fruit gives them.'));
    box.appendChild(h('div.sp-mouse', h('span', h('kbd', 'LMB'), ' ', m1Name), h('span' + (heavyCd > 0 ? '.cd' : ''), h('kbd', 'RMB'), ' ', heavyName, heavyCd > 0 ? h('i', ' ' + fmt(heavyCd)) : null)));
    if (ms.forms.length) {
      box.appendChild(h('div.sp-forms', ms.forms.map((F) => {
        const k = hotKey(p, F.entry);
        return h('span.sp-chip' + (F.on ? '.on' : '') + (F.open ? '' : '.locked') + (F.awakening ? '.aw' : ''), { title: F.open ? `${F.name}: ${k ? `press ${k}` : 'put it on the hotbar (Skills, K)'} to switch it on and off` : `${F.name}: ${F.why}` },
          k && F.open ? h('b', k) : null, F.short);
      })));
    }
    if (full) for (const n of ms.next) box.appendChild(h('div.sp-next', { title: `${n.name} — ${n.why}` }, h('b', 'Next: '), `${n.name} — ${n.why}`));
    const foot = [];
    if (ms.kind === 'weapon') foot.push(h('span', h('kbd', 'X'), ' sheathes'));
    else if (ms.kind === 'fruit') {
      const k = hotKey(p, ENTRY.fruit);
      if (fb && Number.isFinite(fb.t)) foot.push(h('span', `${Math.ceil(fb.t)}s left`));
      if (k) foot.push(h('span', h('kbd', k), fb ? ' its base set' : ' puts it away'));
    }
    if (free && full) foot.push(h('span.sp-tip', 'click a key to change it'));
    if (foot.length) box.appendChild(h('div.sp-foot', foot));
    E.skills.appendChild(box);
    // ---- the Haki techniques
    if (hg) {
      const hb = h('div.sp-box.sp-haki', { style: { '--sp-c': hg.color } });
      hb.appendChild(h('div.sp-head', h('b', hg.title), h('span', `level ${Math.floor(p.hakiLevel(hg.active || 'conqueror'))}`)));
      let lk = 0;
      for (const r of hg.rows) {
        if (r.locked && (!full || lk++ >= 1)) continue;
        hb.appendChild(row('haki', r, r.locked ? -1 : r.slot, r.locked ? '' : K.haki[r.slot]));
      }
      E.skills.appendChild(hb);
    }
  };
  // full if it fits; compact if not; and the tracker to its titles if even that won't
  E.track.classList.remove('squeezed');
  build(true);
  if (place(ui, true) > 0) {
    build(false);
    if (place(ui, true) > 0) { E.track.classList.add('squeezed'); place(ui, true); }
  }
}

/**
 * Keep the panel clear of the rest of the HUD: level with the hotbar if
 * there's room to its right (the hotbar stepping left a little for it, if
 * that's all it takes), else just above it; the quest tracker moved up out
 * of its way, as far as the minimap's names allow. Returns by how much it
 * would still reach into what's above it (0 or less: it fits).
 */
function place(ui, force = false) {
  const E = ui.el;
  const W = window.innerWidth || 1280, H = window.innerHeight || 720;
  const pw = E.skills.offsetWidth || 230, ph = E.skills.offsetHeight || 0;
  const hw = E.hotbar.offsetWidth, hh = E.hotbar.offsetHeight;
  const trackOn = !E.track.classList.contains('hidden');
  const k = [W, H, pw, ph, hw, hh, trackOn && E.track.offsetHeight].join();
  if (!force && ui.cache.spPlace === k) return ui.cache.spOver || 0;
  ui.cache.spPlace = k;
  // (the hotbar is centred, 14 px up: where it is without any shift)
  const left = (W - hw) / 2, right = left + hw, top = H - 14 - hh;
  let shift = Math.max(0, right - (W - 14 - pw - 12));
  // (as far as it may go: never past the left edge, nor more than a quarter of the way across)
  const most = Math.max(0, Math.min(left - 14, W * 0.25));
  let up = 0;
  if (shift > most) { shift = 0; up = H - top + 8; }
  E.hotbar.style.marginLeft = shift ? `${-Math.round(shift)}px` : '';
  E.skills.style.bottom = up ? `${Math.round(up)}px` : '';
  // what's above it on the right: the minimap and its names, and the quest tracker
  E.track.style.marginTop = '';
  const sTop = H - (up || 14) - ph;
  const wrap = E.loc.parentElement.getBoundingClientRect();
  let over = wrap.bottom + 8 - sTop;
  if (trackOn && ph) {
    const t = E.track.getBoundingClientRect();
    if (t.right > W - 14 - pw) {
      const need = t.bottom + 8 - sTop, room = Math.max(0, t.top - (wrap.bottom + 8));
      if (need > 0) E.track.style.marginTop = `${-Math.round(Math.min(need, room))}px`;
      over = Math.max(over, need - room);
    }
  }
  ui.cache.spOver = over;
  return over;
}

function unplace(ui) {
  ui.el.hotbar.style.marginLeft = '';
  ui.el.track.style.marginTop = '';
  ui.el.track.classList.remove('squeezed');
  ui.cache.spPlace = null;
}
