// The recorded layers: a few dozen short CC0 recordings (assets/sfx — a pane
// of glass shattering, the ground shaking, a flame roaring, ice cracking, a
// spark's crackle, a heavy punch's thud) laid under the synthesised effects
// where a recording sells what synthesis can't quite — never instead of them.
//
// They travel inside the bundle (samples.data.js: base64 MP3s, made by
// tools/sfx-embed.mjs) and are decoded once, in the background, when the sound
// first comes on. Till a layer is decoded — or if it never is (no MP3 decoder,
// a decode refused) — it's simply left out and the effect plays as it always
// did: Voice.sample returns null and nothing else changes.
//
// Names: `fire_1`, `fire_2`… are variants of one sound, asked for as `fire`
// (one picked at random, never the same twice running); `fire_roar` is its own.
import { SAMPLE_DATA } from './samples.data.js';

// (an AudioBuffer isn't tied to the context that decoded it: one bank serves them all)
const BANK = new Map();
const GROUPS = {};
for (const n of Object.keys(SAMPLE_DATA)) {
  const g = n.replace(/_\d+$/, '');
  (GROUPS[g] ||= []).push(n);
  if (g !== n) GROUPS[n] = [n];
}
// (the ones the fights lean on first: they're decoded before the rest)
const FIRST = ['shatter', 'glass_crunch', 'sub_boom', 'boom', 'quake', 'punch', 'rubble', 'glass_tinkle', 'explode', 'fire', 'ice', 'zap', 'spark'];
const last = {};
let loading = null;

/** base64 → bytes (atob in a browser; Buffer under node). */
function bytes(b64) {
  if (typeof atob === 'function') {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  const b = globalThis.Buffer.from(b64, 'base64');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
}

/** decodeAudioData, the promise way or (old Safari) the callback way. */
function decode(ctx, ab) {
  return new Promise((res, rej) => {
    try {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && typeof p.then === 'function') p.then(res, rej);
    } catch (e) { rej(e); }
  });
}

/**
 * The decoder's own lead-in cut off (an MP3 starts with a few dozen ms of
 * silence some browsers leave in): a layer's transient lands on its beat.
 */
function tighten(ctx, buf) {
  const d = buf.getChannelData(0);
  let i = 0;
  while (i < d.length && Math.abs(d[i]) < 0.003) i++;
  i = Math.max(0, i - Math.floor(buf.sampleRate * 0.001));
  if (i < buf.sampleRate * 0.002 || i >= d.length - 64) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, d.length - i, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) out.getChannelData(ch).set(buf.getChannelData(ch).subarray(i));
  return out;
}

/**
 * Decode every sample, one after another (the fights' first), into the bank.
 * Called when the mixer is made; the promise settles when all are done (or
 * given up on) — nothing waits on it but the audio checks.
 */
export function loadSamples(ctx) {
  if (loading) return loading;
  if (!ctx || typeof ctx.decodeAudioData !== 'function') return Promise.resolve(0);
  const names = Object.keys(SAMPLE_DATA);
  const rank = (n) => { const i = FIRST.findIndex((g) => n === g || n.startsWith(g + '_')); return i < 0 ? FIRST.length : i; };
  names.sort((a, b) => rank(a) - rank(b));
  loading = (async () => {
    let n = 0;
    for (const name of names) {
      try { BANK.set(name, tighten(ctx, await decode(ctx, bytes(SAMPLE_DATA[name])))); n++; } catch { /* left out: the synthesis carries on alone */ }
    }
    // (none would decode — a context closed under it: the next one may try again)
    if (!n) loading = null;
    return n;
  })();
  return loading;
}

/** A decoded sample by name or group (a variant at random, not the last one), or null. */
export function pickSample(name) {
  const g = GROUPS[name];
  if (!g) return null;
  const ok = g.filter((n) => BANK.has(n));
  if (!ok.length) return null;
  let k = Math.floor(Math.random() * ok.length);
  if (ok.length > 1 && ok[k] === last[name]) k = (k + 1) % ok.length;
  last[name] = ok[k];
  return BANK.get(ok[k]);
}

/** Every sample name and group (for the tests). */
export const SAMPLE_NAMES = Object.keys(GROUPS);
