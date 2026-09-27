// Persistence. Three lineage slots; each holds one active character plus the
// lineage (legacy) that outlives it. There is no manual save to reload: the
// game saves itself (and whenever you choose Save), and death is written
// immediately — just like Rogue Lineage.
const PREFIX = 'op-inherited-will';
const LEGACY_CHAR = `${PREFIX}:char:v1`; // pre-slot saves
const LEGACY_LEGACY = `${PREFIX}:legacy:v1`;
const KEY_SETTINGS = `${PREFIX}:settings:v1`;
const KEY_LAST = `${PREFIX}:lastSlot`;
export const SLOT_COUNT = 3;

let slot = 1;
const key = (s, what) => `${PREFIX}:slot${s}:${what}:v1`;

function read(k) {
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function write(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}
function remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

// move a save from before slots existed into slot 1
(function migrate() {
  const oldChar = read(LEGACY_CHAR), oldLegacy = read(LEGACY_LEGACY);
  if (!oldChar && !oldLegacy) return;
  if (!read(key(1, 'char')) && !read(key(1, 'legacy'))) {
    if (oldChar) write(key(1, 'char'), oldChar);
    if (oldLegacy) write(key(1, 'legacy'), oldLegacy);
  }
  remove(LEGACY_CHAR); remove(LEGACY_LEGACY);
})();

export function defaultLegacy() {
  return { version: 1, generation: 1, will: 0, totalWill: 0, perks: {}, heirloom: null, hall: [], charted: [], reincarnatedFruits: [], unlocks: {} };
}

export function setSlot(n) { slot = Math.max(1, Math.min(SLOT_COUNT, n | 0)); write(KEY_LAST, slot); }
export function getSlot() { return slot; }
export function lastSlot() { const n = read(KEY_LAST); return n >= 1 && n <= SLOT_COUNT ? n : 1; }

export const loadLegacy = (s = slot) => ({ ...defaultLegacy(), ...(read(key(s, 'legacy')) || {}) });
export const saveLegacy = (l, s = slot) => write(key(s, 'legacy'), l);
export const loadChar = (s = slot) => read(key(s, 'char'));
export const saveChar = (c, s = slot) => write(key(s, 'char'), c);
export const clearChar = (s = slot) => remove(key(s, 'char'));
export function clearSlot(s) { remove(key(s, 'char')); remove(key(s, 'legacy')); }

/** What the title screen shows for a slot. */
export function slotInfo(s) {
  const char = read(key(s, 'char'));
  const legacy = read(key(s, 'legacy'));
  return { slot: s, char, legacy: legacy ? { ...defaultLegacy(), ...legacy } : null, empty: !char && !legacy };
}

export const loadSettings = () => ({ volume: 0.7, music: 0.5, shake: 1, showHints: true, view: 'first', sensitivity: 0.5, invertY: false, quality: 'high', autoRes: true, fov: 0.5, bob: true, ...(read(KEY_SETTINGS) || {}) });
export const saveSettings = (s) => write(KEY_SETTINGS, s);
