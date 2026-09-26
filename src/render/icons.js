// Procedural icons for items, techniques and UI (no emoji, no image files).
// API (stable — the UI depends on it):
//   itemIcon(idOrDef, size = 48)   → HTMLCanvasElement (cached)
//   skillIcon(abilityDef, size = 48) → HTMLCanvasElement (cached)
//   uiIcon(name, size = 32)        → HTMLCanvasElement (cached)
//   iconURL(canvas)                → data: URL (cached) for CSS backgrounds
// This first version draws simple placeholder badges; see the icon pass for the real set.
import { ITEMS } from '../data/items.js';

const cache = new Map();

function badge(key, size, color, letter) {
  const k = `${key}:${size}`;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.beginPath(); g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${Math.round(size * 0.45)}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, size / 2, size / 2 + 1);
  cache.set(k, c);
  return c;
}

const TYPE_COLORS = { food: '#c0703a', medicine: '#43a047', weapon: '#607d8b', hat: '#8d6e63', coat: '#5c6bc0', accessory: '#ab47bc', key: '#b8860b', dial: '#26a69a', fruit: '#e53935', treasure: '#f9a825', material: '#795548', pose: '#0288d1' };

export function itemIcon(idOrDef, size = 48) {
  const d = typeof idOrDef === 'string' ? ITEMS[idOrDef] : idOrDef;
  const id = typeof idOrDef === 'string' ? idOrDef : d?.id || d?.name || '?';
  return badge('item:' + id, size, TYPE_COLORS[d?.type] || '#78909c', (d?.name || '?')[0].toUpperCase());
}

export function skillIcon(def, size = 48) {
  return badge('skill:' + (def?.id || '?'), size, '#37474f', (def?.name || '?')[0].toUpperCase());
}

export function uiIcon(name, size = 32) {
  return badge('ui:' + name, size, '#5d4037', (name || '?')[0].toUpperCase());
}

const urls = new WeakMap();
export function iconURL(canvas) {
  if (!urls.has(canvas)) urls.set(canvas, canvas.toDataURL());
  return urls.get(canvas);
}
