// Skill keys: the keys your skills sit on, and the keys the game keeps.
//
// The number keys (1-9, 0) are the hotbar: things you take out — food, each
// weapon, your Devil Fruit and its forms. The skills of whatever is out (your
// fists, the weapon drawn, the fruit) sit on the *skill keys*, slot by slot:
// the first skill of every moveset is on the first skill key, and so on. The
// Haki techniques have keys of their own, shown with the Haki that's active.
//
// The defaults are keys nothing else uses (GAME_KEYS lists everything the game
// itself keeps — playerController, ui.js, main.js, the map, creative mode):
// the skills sit on Z, X, C and V, the row under your left hand beside WASD
// (as the One Piece games people play put them), B switches the fruit's form
// (the Gears, the awakened set), G (the Haki row: R, T, G), the middle mouse
// button and the two side buttons hold the Haki techniques — G stays
// Conqueror's for a king, whose release always comes first (a mouse without
// side buttons: move those to keys). Every menu is behind Tab, in one place. Any of
// them can be moved to another key: one the game keeps is refused, and one
// another skill has is swapped with it (see rebind).

/** Every key the game itself uses, and what for (a skill can't take these). */
export const GAME_KEYS = [
  ['W', 'move forward'], ['A', 'move left'], ['S', 'move back'], ['D', 'move right'],
  ['ArrowUp', 'turn the camera'], ['ArrowDown', 'turn the camera'], ['ArrowLeft', 'turn the camera'], ['ArrowRight', 'turn the camera'],
  ['Space', 'jump, climb, swim up, fly up'], ['Shift', 'sprint (tap: dodge)'], ['Control', 'shift lock (third person)'],
  ['Alt', 'crouch and sneak (hold, or tap to stay down); dive or fly down'],
  ['Q', 'dodge'], ['F', 'block and parry'], ['E', 'talk, use, take the helm'],
  ['R', 'Armament Haki'], ['T', 'Observation Haki'],
  ['H', 'draw or sheathe your weapon'], ['P', 'first or third person'],
  ['Tab', 'the menu (inventory, character, skills, journal, crew, quests, map)'], ['M', 'world map'],
  ['Enter', 'chat (multiplayer)'], ['NumpadEnter', 'chat (multiplayer)'],
  ['Escape', 'pause menu'], ['F1', 'creative panel'],
  ['Minus', 'minimap out'], ['Equal', 'minimap in'], ['NumpadSubtract', 'minimap out'], ['NumpadAdd', 'minimap in'],
  ['Slash', 'command console'], ['Backquote', 'command console'], ['NumpadDivide', 'command console'],
  ['1', 'hotbar'], ['2', 'hotbar'], ['3', 'hotbar'], ['4', 'hotbar'], ['5', 'hotbar'], ['6', 'hotbar'], ['7', 'hotbar'], ['8', 'hotbar'], ['9', 'hotbar'], ['0', 'hotbar'],
  ['Mouse1', 'attack'], ['Mouse2', 'heavy attack'],
];
const GAME = new Map(GAME_KEYS);
/** What the game uses `key` for, or '' if nothing. */
export const gameUse = (key) => GAME.get(key) || '';

/**
 * The default keys: the moveset's skill slots, the Haki techniques', and the
 * one that switches the fruit's form (B: base → each Gear or form unlocked →
 * the awakened set → base again; entries.js cycleForm).
 */
export const DEFAULT_KEYS = { skills: ['Z', 'X', 'C', 'V'], haki: ['G', 'Mouse3', 'Mouse4', 'Mouse5'], form: ['B'] };
// (the defaults before the skills moved beside WASD: a player still on them moves to the new ones)
const OLD_DEFAULTS = { skills: ['B', 'N', 'Y', 'O'], form: ['Z'] };
/** How many skill slots a moveset can have keys for (past the defaults they start unbound). */
export const SKILL_SLOTS = 8;
export const HAKI_SLOTS = 4;

// keys that can't be bound: the browser's own (or keys the page never sees reliably)
const NEVER = new Set(['Meta', 'OSLeft', 'OSRight', 'ContextMenu', 'F5', 'F11', 'F12', 'CapsLock', 'NumLock', 'ScrollLock', 'Alt', 'Tab']);

/** The skill keys from the settings (filled out to their slot counts; '' = unbound). */
export function keysOf(settings) {
  const k = settings?.keys || {};
  if (k.skills && OLD_DEFAULTS.skills.every((x, i) => k.skills[i] === x) && (!k.form || k.form[0] === OLD_DEFAULTS.form[0])) {
    // (an old save's keys as they were by default — B N Y O, the form on Z — move to the new ones; any set past them stay, unless now taken)
    const now = [...DEFAULT_KEYS.skills, ...DEFAULT_KEYS.form];
    k.skills = DEFAULT_KEYS.skills.concat(k.skills.slice(4).map((x) => (now.includes(x) ? '' : x))); k.form = DEFAULT_KEYS.form.slice();
  }
  const fill = (list, def, n) => Array.from({ length: n }, (_, i) => (Array.isArray(list) && list[i] !== undefined ? list[i] || '' : def[i] || ''));
  return { skills: fill(k.skills, DEFAULT_KEYS.skills, SKILL_SLOTS), haki: fill(k.haki, DEFAULT_KEYS.haki, HAKI_SLOTS), form: fill(k.form, DEFAULT_KEYS.form, 1) };
}

/**
 * Put `key` on slot `i` of `group` ('skills' or 'haki'). A key the game keeps
 * is refused; one another slot has is swapped onto this slot's old key (or
 * left unbound if it had none); '' unbinds. Returns { ok, why?, swapped? }
 * — swapped: { group, slot, key } the other slot moved to — and saves it in
 * `settings.keys`.
 */
export function rebind(settings, group, i, key) {
  const K = keysOf(settings);
  if (!K[group] || i < 0 || i >= K[group].length) return { ok: false, why: 'No such skill slot.' };
  key = key || '';
  if (key && NEVER.has(key)) return { ok: false, why: `${keyLabel(key)} can't be used for a skill.` };
  const use = key && gameUse(key);
  if (use) return { ok: false, why: `${keyLabel(key)} is already the game's key to ${use}. Pick another.` };
  const old = K[group][i];
  if (key === old) return { ok: true };
  let swapped = null;
  if (key) {
    for (const g of ['skills', 'haki', 'form']) {
      const j = K[g].indexOf(key);
      if (j >= 0 && !(g === group && j === i)) { K[g][j] = old; swapped = { group: g, slot: j, key: old }; }
    }
  }
  K[group][i] = key;
  settings.keys = { skills: K.skills.slice(), haki: K.haki.slice(), form: K.form.slice() };
  return { ok: true, swapped };
}

/** Back to the default keys. */
export function resetKeys(settings) { delete settings.keys; }

/** Mouse buttons by name (DOM button numbers). Mouse1 and Mouse2 are the game's (attack, heavy). */
export const MOUSE = { Mouse1: 0, Mouse3: 1, Mouse2: 2, Mouse4: 3, Mouse5: 4 };

/** The key's name for an event (as core/input.js names keys), or null for one that can't be a skill key. */
export function keyFromEvent(e) {
  if (e.type === 'mousedown' || e.type === 'pointerdown' || e.type === 'auxclick') {
    const n = ['Mouse1', 'Mouse3', 'Mouse2', 'Mouse4', 'Mouse5'][e.button];
    return n || null;
  }
  const c = e.code || '';
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (c === 'ShiftLeft' || c === 'ShiftRight') return 'Shift';
  if (c === 'ControlLeft' || c === 'ControlRight') return 'Control';
  if (c === 'AltLeft' || c === 'AltRight') return 'Alt';
  return c || e.key || null;
}

/** Short label for a key, as the HUD shows it. */
export function keyLabel(key) {
  if (!key) return '—';
  const L = {
    Mouse1: 'LMB', Mouse2: 'RMB', Mouse3: 'MMB', Mouse4: 'M4', Mouse5: 'M5', Space: 'Space', Escape: 'Esc', Control: 'Ctrl',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: '\'', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', PageUp: 'PgUp', PageDown: 'PgDn', Delete: 'Del', Insert: 'Ins', Backspace: 'Bksp',
  };
  if (L[key]) return L[key];
  if (key.startsWith('Numpad')) return 'Num' + key.slice(6).replace('Decimal', '.').replace('Multiply', '*');
  return key;
}

/** Was `key` pressed this frame (a key or a mouse button)? */
export function pressed(inp, key) {
  if (!key || !inp) return false;
  const m = MOUSE[key];
  if (m !== undefined) return !!(inp.enabled !== false && inp.mouse?.pressed?.[m]);
  return inp.wasPressed(key);
}
