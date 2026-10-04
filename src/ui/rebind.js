// Changing a skill key (game/keys.js): click its key — on the skills panel
// at the bottom right, in Skills (Tab), or in Settings under Controls — then
// press the key (or mouse button) you want. Esc leaves it as it was; Delete
// or Backspace leaves the slot with no key. A key the game keeps for itself
// is refused (and what it's for, said); one another skill has is swapped
// onto this one's old key. Saved with the settings.
import { h } from './dom.js';
import { rebind, keyFromEvent, keyLabel } from '../game/keys.js';

const slotName = (s) => (s.group === 'haki' ? `Haki technique ${s.slot + 1}` : s.group === 'form' ? 'switching form' : `skill ${s.slot + 1}`);
// (after a mouse button is taken: how long its own click, and the menu a right button opens, go nowhere)
const AFTER_CLICK = 250;

/**
 * Wait for the next key or mouse button and put it on slot `slot` of `group`
 * ('skills' or 'haki'); `what` names it in what's said. `done(result)` after
 * (null if it was left as it was). Game input waits meanwhile.
 */
export function captureKey(game, group, slot, what, done) {
  const ui = game.ui;
  ui.capturing?.cancel();
  const box = h('div.rebind-cap', h('b', `Press a key for ${what}`), h('small', 'Esc leaves it as it is · Delete leaves it with no key · a mouse button will do too'));
  ui.root.appendChild(box);
  ui.asking = (ui.asking || 0) + 1;
  let over = false;
  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
  const MOUSE_EVENTS = ['click', 'auxclick', 'contextmenu'];
  const finish = (key, byMouse = false) => {
    if (over) return;
    over = true;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onMouse, true);
    const release = () => {
      for (const ev of MOUSE_EVENTS) window.removeEventListener(ev, swallow, true);
      ui.asking = Math.max(0, (ui.asking || 1) - 1);
    };
    // (a button taken: its own click, its release and its menu, a moment later, go nowhere — nor to the game)
    if (byMouse) setTimeout(release, AFTER_CLICK); else release();
    box.remove();
    ui.capturing = null;
    ui.cache.skills = null;
    if (key === undefined) { done?.(null); return; }
    const r = rebind(game.settings, group, slot, key);
    if (r.ok) {
      game.applySettings?.(true);
      const moved = r.swapped ? ` ${keyLabel(key)} was on ${slotName(r.swapped)}: that's on ${keyLabel(r.swapped.key)} now.` : '';
      game.log(`${what}: ${key ? keyLabel(key) : 'no key'}.${moved}`, '#a5d6a7');
      game.audio?.sfx('equip');
    } else {
      game.log(r.why, '#ff8a80');
      game.ui?.toast('KEY NOT CHANGED', r.why, '#ff8a80');
    }
    done?.(r);
  };
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.code === 'Escape') return finish(undefined);
    if (e.code === 'Delete' || e.code === 'Backspace') return finish('');
    const k = keyFromEvent(e);
    if (k) finish(k);
  };
  const onMouse = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const k = keyFromEvent(e);
    if (k) finish(k, true);
  };
  window.addEventListener('keydown', onKey, true);
  // (from the next press on: the click that asked for this has been and gone)
  window.addEventListener('mousedown', onMouse, true);
  for (const ev of MOUSE_EVENTS) window.addEventListener(ev, swallow, true);
  ui.capturing = { group, slot, cancel: () => finish(undefined) };
  ui.cache.skills = null;
}
