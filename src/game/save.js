// Persistence. Three lineage slots; each holds one active character plus the
// lineage (legacy) that outlives it. There is no manual save to reload: the
// game saves itself (and whenever you choose Save), and death is written
// immediately — just like Rogue Lineage.
import { liveRace } from '../data/races.js';

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

export function loadLegacy(s = slot) {
  const L = { ...defaultLegacy(), ...(read(key(s, 'legacy')) || {}) };
  for (const e of L.hall || []) liveRace(e);
  return L;
}
export const saveLegacy = (l, s = slot) => write(key(s, 'legacy'), l);
// (everyone carries the qualities of a king now: a character from before that holds them too)
const kingly = (c) => { if (c?.traits && !c.traits.includes('conqueror')) c.traits.push('conqueror'); return c; };
export const loadChar = (s = slot) => kingly(liveRace(read(key(s, 'char'))));
export const saveChar = (c, s = slot) => write(key(s, 'char'), c);
export const clearChar = (s = slot) => remove(key(s, 'char'));
export function clearSlot(s) { remove(key(s, 'char')); remove(key(s, 'legacy')); remove(key(s, 'net')); }
// A lineage's voyages (multiplayer): the room code it hosts with (the same
// one each time, so friends can come back with it) and the last voyage it
// joined — { hostCode, joined: { code, host, at } }.
export const loadNet = (s = slot) => read(key(s, 'net')) || {};
export const saveNet = (v, s = slot) => write(key(s, 'net'), v);

/** What the title screen shows for a slot. */
export function slotInfo(s) {
  const char = liveRace(read(key(s, 'char')));
  const legacy = read(key(s, 'legacy'));
  return { slot: s, char, legacy: legacy ? { ...defaultLegacy(), ...legacy } : null, empty: !char && !legacy };
}

// (renderDist: null until the player picks one; the graphics preset's default till then)
export const loadSettings = () => ({ volume: 0.7, music: 0.5, shake: 1, showHints: true, survival: true, view: 'first', sensitivity: 0.5, invertY: false, quality: 'high', autoRes: true, fov: 0.5, bob: true, renderDist: null, shadows: 'high', foliage: 'far', bloom: true, resScale: 1, ...(read(KEY_SETTINGS) || {}) });
export const saveSettings = (s) => write(KEY_SETTINGS, s);

/**
 * The render distance, in 32 m chunks like Minecraft's: how far out the world
 * is drawn on foot (the fog closes in there). At sea you see half as far
 * again, since the islands are the view there (see Renderer3D.viewDist).
 */
export const RENDER_DIST = { min: 4, max: 24, high: 12, low: 8 };
export function renderChunks(s) {
  const n = Number(s?.renderDist) || (s?.quality === 'low' ? RENDER_DIST.low : RENDER_DIST.high);
  return Math.max(RENDER_DIST.min, Math.min(RENDER_DIST.max, Math.round(n)));
}
