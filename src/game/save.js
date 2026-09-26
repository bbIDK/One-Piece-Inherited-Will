// Persistence. One active character + the lineage (legacy) that outlives it.
// There is no manual save slot to reload: the game saves itself, and death is
// written immediately — just like Rogue Lineage.
const KEY_CHAR = 'op-inherited-will:char:v1';
const KEY_LEGACY = 'op-inherited-will:legacy:v1';
const KEY_SETTINGS = 'op-inherited-will:settings:v1';

function read(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function defaultLegacy() {
  return { version: 1, generation: 1, will: 0, totalWill: 0, perks: {}, heirloom: null, hall: [], charted: [], reincarnatedFruits: [], unlocks: {} };
}

export const loadLegacy = () => ({ ...defaultLegacy(), ...(read(KEY_LEGACY) || {}) });
export const saveLegacy = (l) => write(KEY_LEGACY, l);
export const loadChar = () => read(KEY_CHAR);
export const saveChar = (c) => write(KEY_CHAR, c);
export const clearChar = () => { try { localStorage.removeItem(KEY_CHAR); } catch { /* ignore */ } };
export const loadSettings = () => ({ volume: 0.7, music: 0.5, shake: 1, showHints: true, ...(read(KEY_SETTINGS) || {}) });
export const saveSettings = (s) => write(KEY_SETTINGS, s);
