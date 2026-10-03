// Audio checks: render the effects and the music offline (no speakers
// needed) through an OfflineAudioContext, measure them, draw spectrograms and
// save WAVs to shots/audio/. The effects and themes are rendered on a small lab
// page that loads src/audio directly (no game to boot, so it's quick); the
// last scenario plays a real game to make sure the director and the foley
// cope with the real thing.
//
//   node tools/shot.mjs sfx [--only=punch,parry] [--reps=3]     every effect, technique and footstep: levels, spectra, variation
//   node tools/shot.mjs music [--theme=sea,town] [--secs=40]     themes: levels, quiet stretches, spectrogram, WAV
//   node tools/shot.mjs director [--secs=110]                   a scripted voyage through the director: what plays when
//   node tools/shot.mjs ambience                                the beds and spots, a few seconds each
//   node tools/shot.mjs game-audio --page=shots/<build>/index.html   a real game: walk, swim, row, fight — no errors
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots', 'audio');

// the lab: the audio modules, the game's data, and the render and measure helpers
const LAB = `<!doctype html><html><head><meta charset="utf-8"><title>Audio lab</title></head><body>
<script type="module">
import { Audio } from '/src/audio/audio.js';
import { SFX } from '/src/audio/sfx.js';
import { THEMES, battleOf, nightOf, placeTheme, islandTheme, ISLAND_THEME } from '/src/audio/themes.js';
import { Deck, STEMS } from '/src/audio/music.js';
import { FRUITS } from '/src/data/fruits.js';
import { STYLES } from '/src/data/styles.js';
import { ALL_ISLANDS } from '/src/data/islands/index.js';

const SR = 44100;
function offline(secs, sr = SR, ch = 2) {
  const off = new OfflineAudioContext(ch, Math.ceil(sr * secs), sr);
  Object.defineProperty(off, 'state', { get: () => 'running', configurable: true });
  return off;
}
function lab(off, settings = { volume: 1, music: 1 }) {
  // (not through the constructor: its page listeners would keep every render's buffers alive)
  const a = Object.create(Audio.prototype);
  Object.assign(a, { settings, last: {}, lastDrawn: false, foot: 1, ctx: off });
  a.build();
  return a;
}
// a clock the engine reads while scheduling ahead of an offline render
function fakeClock(off) {
  let t = 0;
  Object.defineProperty(off, 'currentTime', { get: () => t, configurable: true });
  return { set: (v) => { t = v; }, get: () => t, done: () => { delete off.currentTime; } };
}

// ---------------------------------------------------------------- measuring
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
const N = 2048, HOP = 512;
/** The A-weighting curve as a power ratio (the ear's sensitivity by frequency). */
function aWeight(f) {
  const f2 = f * f;
  const ra = (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194));
  return ra * ra * 1.585;
}
const hann = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
/** Power spectra of a mono signal, frame by frame (N/2 bins each). */
function frames(m, sr) {
  const out = [];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= m.length; s += HOP) {
    for (let i = 0; i < N; i++) { re[i] = m[s + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    const p = new Float32Array(N / 2);
    for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    out.push(p);
  }
  return out;
}
function analyze(buf) {
  const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, n = L.length;
  const m = new Float32Array(n);
  let peak = 0, nan = 0, el = 0, er = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
    m[i] = (l + r) / 2;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    el += l * l; er += r * r;
  }
  // 10 ms envelope
  const W = Math.floor(sr / 100), env = [];
  for (let i = 0; i < n; i += W) { let s = 0; for (let j = i; j < Math.min(n, i + W); j++) s += m[j] * m[j]; env.push(Math.sqrt(s / W)); }
  const emax = Math.max(1e-9, ...env);
  const on = env.findIndex((e) => e > emax * 0.01);
  let off = env.length - 1; while (off > 0 && env[off] < emax * 0.003) off--;
  const s0 = Math.max(0, on) * W, s1 = Math.min(n, (off + 1) * W);
  let ss = 0; for (let i = s0; i < s1; i++) ss += m[i] * m[i];
  const rms = Math.sqrt(ss / Math.max(1, s1 - s0));
  const fr = frames(m.subarray(s0, s1), sr);
  const P = new Float64Array(N / 2);
  for (const p of fr) for (let k = 0; k < N / 2; k++) P[k] += p[k];
  let tot = 0, cen = 0, lo = 0, mid = 0, hi = 0, totA = 0, cenA = 0, loA = 0, midA = 0, hiA = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = k * sr / N, a = aWeight(f) * P[k];
    tot += P[k]; cen += f * P[k]; if (f < 250) lo += P[k]; else if (f < 2000) mid += P[k]; else hi += P[k];
    totA += a; cenA += f * a; if (f < 250) loA += a; else if (f < 2000) midA += a; else hiA += a;
  }
  cen /= tot || 1;
  cenA /= totA || 1;
  let bw = 0; for (let k = 1; k < N / 2; k++) { const f = k * sr / N; bw += (f - cen) * (f - cen) * P[k]; }
  bw = Math.sqrt(bw / (tot || 1));
  const imax = env.indexOf(emax);
  return {
    peak: +peak.toFixed(3), rms: +rms.toFixed(4), crest: +(20 * Math.log10(peak / Math.max(1e-9, rms))).toFixed(1),
    dur: +(((off - Math.max(0, on)) + 1) / 100).toFixed(2), attack: +((imax - Math.max(0, on)) / 100).toFixed(2),
    centroid: Math.round(cen), bw: Math.round(bw), low: +(lo / (tot || 1)).toFixed(2), mid: +(mid / (tot || 1)).toFixed(2), high: +(hi / (tot || 1)).toFixed(2),
    // (as the ear weighs it: the A-weighted centroid and bands — a sub's energy counts for little)
    centroidA: Math.round(cenA), lowA: +(loA / (totA || 1)).toFixed(2), midA: +(midA / (totA || 1)).toFixed(2), highA: +(hiA / (totA || 1)).toFixed(2),
    loud: +(10 * Math.log10(Math.max(1e-12, totA / Math.max(1, fr.length)))).toFixed(1),
    pan: +((Math.sqrt(er) - Math.sqrt(el)) / Math.max(1e-9, Math.sqrt(er) + Math.sqrt(el))).toFixed(2), nan, env,
  };
}
/** Envelope correlation of two renders (1: the same shape). */
function corr(a, b) {
  const n = Math.min(a.length, b.length);
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb || 1);
}
/** A spectrogram tile (log frequency 40 Hz – 16 kHz) of a buffer, with a label. */
function tile(buf, label, w = 220, h = 110, secs = 2.5) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h + 14;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h + 14);
  const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = Math.min(L.length, Math.floor(secs * sr)), m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (L[i] + R[i]) / 2;
  const fr = frames(m, sr);
  for (let x = 0; x < w; x++) {
    const p = fr[Math.floor(x / w * fr.length)];
    if (!p) continue;
    for (let y = 0; y < h; y++) {
      const f = 40 * Math.pow(16000 / 40, 1 - y / (h - 1)), k = Math.min(N / 2 - 1, Math.round(f * N / sr));
      const v = Math.min(1, Math.max(0, (Math.log10(p[k] + 1e-12) + 7) / 6));
      g.fillStyle = 'rgb(' + Math.round(255 * Math.min(1, v * 1.6)) + ',' + Math.round(255 * Math.max(0, v * 1.4 - 0.4)) + ',' + Math.round(255 * Math.max(0, v * 2 - 1.2)) + ')';
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = '#fff'; g.font = '10px sans-serif'; g.fillText(label, 3, h + 11);
  return cv;
}
function sheet(tiles, cols = 6) {
  const w = tiles[0]?.width || 220, h = tiles[0]?.height || 124;
  const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = Math.ceil(tiles.length / cols) * h;
  const g = cv.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
  tiles.forEach((t, i) => g.drawImage(t, (i % cols) * w, Math.floor(i / cols) * h));
  return cv.toDataURL('image/png');
}
function wav(buf, norm = false) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let peak = 0; if (norm) for (const d of data) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const k = norm && peak > 0 ? Math.min(8, 0.8 / peak) : 1;
  const bytes = new ArrayBuffer(44 + n * 2 * ch), v = new DataView(bytes);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2 * ch, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2 * ch, true);
  v.setUint16(32, 2 * ch, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2 * ch, true);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, (data[c][i] || 0) * k)) * 32767, true);
  let bin = ''; const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---------------------------------------------------------------- what to render
/** Every effect, technique and footstep worth hearing, as { id, play(a) }. */
function cases() {
  const out = [];
  for (const name of Object.keys(SFX)) out.push({ id: name, play: (a) => a.sfx(name) });
  // the same blows in their contexts
  const ctx = [
    ['punch@jab', 'punch', { w: 0.22 }], ['punch@kick', 'punch', { w: 0.5, kick: true }], ['punch@haki', 'punch', { w: 0.6, armament: true }], ['punch@counter', 'punch', { w: 1.1, counter: true }],
    ['punch_heavy@kick', 'punch_heavy', { kick: true }], ['slash_hit@haki', 'slash_hit', { armament: true }],
    ['parry@perfect', 'parry', { perfect: true }], ['block@sword', 'block', { sword: true }], ['door@chest', 'door', { chest: true }],
    ['equip@draw', 'equip', { draw: 'sword' }], ['equip@sheathe', 'equip', { draw: 'sheathe' }], ['thunder@near', 'thunder', { far: 0 }], ['thunder@far', 'thunder', { far: 1 }],
    ['jump@sand', 'jump', { surf: 'sand' }], ['jump@wood', 'jump', { surf: 'wood' }], ['land@stone', 'land', { surf: 'stone', s: 0.9 }], ['land@snow', 'land', { surf: 'snow', s: 0.9 }],
  ];
  for (const [id, name, k] of ctx) out.push({ id, play: (a) => a.sfx(name, null, k) });
  // Haki, each in three voices (game/haki.js hakiSignature: the same sound, each character's own way)
  for (const name of ['haki', 'haki_obs', 'foresight', 'conqueror_rise', 'conqueror', 'conqueror_clash', 'haki_out']) {
    for (const voice of [0, 0.5, 1]) out.push({ id: name + '@v' + voice, play: (a) => a.sfx(name, null, { voice }) });
  }
  for (const voice of [0, 0.5, 1]) out.push({ id: 'punch@haki-v' + voice, play: (a) => a.sfx('punch', null, { w: 0.6, armament: true, voice }) });
  out.push({ id: 'punch@ryou', play: (a) => a.sfx('punch', null, { w: 0.8, armament: true, ryou: true }) }, { id: 'punch_heavy@ryou', play: (a) => a.sfx('punch_heavy', null, { armament: true, ryou: true }) });
  // footsteps
  for (const s of ['grass', 'sand', 'dirt', 'gravel', 'mud', 'stone', 'wood', 'snow', 'ice', 'soft', 'metal']) {
    out.push({ id: 'step:' + s, play: (a) => a.step(s, 0.5) });
    out.push({ id: 'step:' + s + '@run', play: (a) => a.step(s, 1) });
  }
  out.push({ id: 'step:wood@deck', play: (a) => { a.game = { player: { deck: {} } }; a.step('wood', 0.6); } });
  out.push({ id: 'step:dirt@wet', play: (a) => { a.foley.wetUntil = 99; a.foley.t = 0; a.step('dirt', 0.6); } });
  // every technique's start
  const techs = [];
  for (const [fid, f] of Object.entries(FRUITS)) for (const t of f.techniques) techs.push({ ...t, fruit: fid, source: 'fruit:' + fid });
  for (const [sid, st] of Object.entries(STYLES)) for (const t of [...(st.m1 || []).slice(0, 1), st.heavy, ...(st.techniques || [])].filter(Boolean)) techs.push({ ...t, source: 'style:' + sid, style: t.style || sid });
  for (const def of techs) out.push({ id: 'tech:' + def.id, play: (a) => a.tech({ x: 0, y: 0, action: { def, t: 0, slow: 1 }, atkSpeed: () => 1, style: def.style, hasWeapon: () => true, weapon: null }) });
  return out;
}

async function renderCase(c, secs = 2.5) {
  const off = offline(secs);
  const a = lab(off, { volume: 1, music: 0 });
  c.play(a);
  const buf = await off.startRendering();
  return buf;
}

window.LAB = {
  THEMES, SFX, ISLAND_THEME, ALL_ISLANDS, STEMS,
  /** Render and measure effects (ids matching \`only\`), \`reps\` times each for the variation. */
  async sfx(only, reps = 3, withWav = true, withSheet = true) {
    const all = cases().filter((c) => !only || only.some((o) => c.id === o || c.id.startsWith(o)));
    const res = [], tiles = [];
    for (const c of all) {
      const secs = /thunder|seaking|anchor|explosion|cannon|conqueror|gear5|tsunami|raigo|entei|ursus|meteor|room|fanfare|death|surf/.test(c.id) ? 4 : 2.5;
      const bufs = [];
      for (let r = 0; r < reps; r++) bufs.push(await renderCase(c, secs));
      const ms = bufs.map(analyze);
      const m = ms[0];
      const cs = ms.map((x) => x.centroid), ds = ms.map((x) => x.dur), ps = ms.map((x) => x.peak);
      const cors = []; for (let i = 1; i < ms.length; i++) cors.push(corr(ms[0].env, ms[i].env));
      const row = { id: c.id, ...m, env: undefined,
        varCentroid: +((Math.max(...cs) - Math.min(...cs)) / Math.max(1, m.centroid)).toFixed(3),
        varPeak: +((Math.max(...ps) - Math.min(...ps)) / Math.max(1e-6, m.peak)).toFixed(3),
        varDur: +(Math.max(...ds) - Math.min(...ds)).toFixed(2),
        envCorr: cors.length ? +Math.min(...cors).toFixed(3) : 1 };
      if (withWav) row.wav = wav(bufs[0]);
      res.push(row);
      if (withSheet) tiles.push(tile(bufs[0], c.id + '  pk ' + m.peak + '  ' + m.centroid + 'Hz', 220, 110, secs));
    }
    return { rows: res, png: withSheet && tiles.length ? sheet(tiles) : null };
  },

  /** Render a theme's piece for \`secs\`: levels by half second, a spectrogram, a WAV. */
  async theme(id, secs = 40, stems = null) {
    const SRm = 22050;
    const off = offline(secs, SRm, 2);
    const clock = fakeClock(off);
    const a = lab(off, { volume: 0, music: 1 });
    const T = id.startsWith('battle:') ? battleOf(THEMES[id.split(':')[1]] || THEMES.sea, id.endsWith(':boss')) : id.startsWith('night:') ? nightOf(THEMES[id.slice(6)]) : id.startsWith('isl:') ? islandTheme(ALL_ISLANDS.find((i) => i.id === id.slice(4)), ALL_ISLANDS.find((i) => i.id === id.slice(4)).sea) : THEMES[id];
    const deck = new Deck(a.mu, T, { at: 0.2, fade: 1.2, loop: !!T.loop || !!T.battle, stems });
    for (let t = 0; t < secs - 0.6; t += 0.06) { clock.set(t); if (!deck.schedule(t)) break; }
    clock.done();
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), win = SRm / 2, env = [];
    let peak = 0, nan = 0;
    for (let i = 0; i < L.length; i += win) {
      let s = 0;
      for (let j = i; j < Math.min(L.length, i + win); j++) { const v = (L[j] + R[j]) / 2; if (!Number.isFinite(v)) nan++; else { s += v * v; peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j])); } }
      env.push(Math.sqrt(s / win));
    }
    const m = analyze(buf);
    return { id, T: { key: T.key, mode: T.mode, bpm: T.bpm, lead: T.lead, arp: T.arp }, peak: +peak.toFixed(3), nan, centroid: m.centroid, low: m.low, mid: m.mid, high: m.high, env: env.map((x) => +x.toFixed(4)), bars: deck.S.bars, barDur: +deck.S.barDur.toFixed(2), wav: wav(buf, true), png: sheet([tile(buf, id, 1200, 160, secs)], 1) };
  },

  /**
   * A voyage scripted through the director, as a fake game: title, the East
   * Blue, an island, a fight (won), night, a dive. What the director chose and
   * when, and how loud the music was each half second.
   */
  async director(secs = 110) {
    const SRm = 22050;
    const off = offline(secs, SRm, 2);
    const clock = fakeClock(off);
    const a = lab(off, { volume: 0, music: 1 });
    const isl = (id) => { const d = ALL_ISLANDS.find((i) => i.id === id); return { id, def: d, towns: [] }; };
    const foes = [];
    const p = { x: 21000, y: 1500, state: 'idle', d: { maxHp: 100 }, hp: 100, mode: 'sail', under: false, inWater: false };
    const env = { daylight: 1, windStrength: 1, storm: 0, rain: 0, time: 0 };
    const game = { player: null, world: { zone: 0, id: 'surface', isLiquid: () => true }, env, currentIsland: null, sea: {}, engaged: false, combatT: 0, actorsNear: () => foes, ui: null, state: null };
    const script = [
      [0, () => { game.player = null; }, 'title'],
      [4, () => { game.player = p; }, 'East Blue sea'],
      [24, () => { game.currentIsland = isl('baratie'); p.mode = 'foot'; }, 'the Baratie'],
      [44, () => { game.engaged = true; game.combatT = 6; foes.push({ alive: true, state: 'idle', controller: { target: p, state: 'attack' } }, { alive: true, state: 'idle', controller: { target: p, state: 'chase' } }); }, 'fight (2 foes)'],
      [52, () => { foes.push({ alive: true, state: 'idle', boss: true, controller: { target: p, state: 'attack' } }); a.director.heat(0.2); }, 'a boss joins'],
      [60, () => { a.director.ko(true); game.engaged = false; game.combatT = 0; foes.length = 0; }, 'won'],
      [74, () => { env.daylight = 0.1; }, 'night falls'],
      [80, () => { game.currentIsland = null; p.mode = 'sail'; }, 'back to sea'],
      [92, () => { p.under = true; p.inWater = true; }, 'dive'],
      [101, () => { p.under = false; }, 'surface'],
    ];
    const log = [];
    let si = 0, lastTheme = null, lastState = null;
    for (let t = 0; t < secs - 0.6; t += 0.06) {
      clock.set(t); env.time = t;
      while (si < script.length && t >= script[si][0]) { script[si][1](); log.push({ t: +t.toFixed(2), event: script[si][2] }); si++; }
      a.director.update(game);
      if (a.director.theme !== lastTheme || a.director.state !== lastState) { lastTheme = a.director.theme; lastState = a.director.state; log.push({ t: +t.toFixed(2), theme: lastTheme, state: lastState, deckAt: a.director.deck ? +a.director.deck.t0.toFixed(2) : null }); }
    }
    clock.done();
    const buf = await off.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), win = SRm / 2, env2 = [];
    let peak = 0;
    for (let i = 0; i < L.length; i += win) { let s = 0; for (let j = i; j < Math.min(L.length, i + win); j++) { const v = (L[j] + R[j]) / 2; s += v * v; peak = Math.max(peak, Math.abs(L[j])); } env2.push(Math.sqrt(s / win)); }
    // the steepest jump in level between neighbouring 10 ms windows (a cut would show as one)
    const W = SRm / 100, e10 = [];
    for (let i = 0; i < L.length; i += W) { let s = 0; for (let j = i; j < Math.min(L.length, i + W); j++) s += L[j] * L[j]; e10.push(Math.sqrt(s / W)); }
    let jump = 0, jumpAt = 0; for (let i = 1; i < e10.length; i++) { const d = Math.abs(e10[i] - e10[i - 1]); if (d > jump) { jump = d; jumpAt = i / 100; } }
    return { log, peak: +peak.toFixed(3), env: env2.map((x) => +x.toFixed(4)), jump: +jump.toFixed(4), jumpAt, wav: wav(buf, true), png: sheet([tile(buf, 'director', 1600, 200, secs)], 1) };
  },

  /**
   * The same effects through the audio as it was before (shots/old-audio.js,
   * written from git by the 'compare' scenario): levels and spectra side by side.
   */
  async old(names, secs = 2.5) {
    const { Audio: Old } = await import('/shots/old-audio.js');
    const rows = [], tiles = [];
    for (const name of names) {
      const off = offline(name === 'thunder' || name === 'explosion' || name === 'cannon' ? 4 : secs);
      const a = new Old({ volume: 1, music: 0 });
      const Real = window.AudioContext;
      window.AudioContext = function () { return off; };
      a.init();
      window.AudioContext = Real;
      clearInterval(a.scheduler);
      a.sfx(name);
      const buf = await off.startRendering();
      const m = analyze(buf);
      rows.push({ id: name, ...m, env: undefined });
      tiles.push(tile(buf, 'OLD ' + name + '  pk ' + m.peak + '  ' + m.centroid + 'Hz'));
    }
    return { rows, png: sheet(tiles) };
  },

  /** The ambience: each bed alone for a few seconds, and a handful of spots. */
  async ambience() {
    const out = [], tiles = [];
    const beds = ['ocean', 'wind', 'howl', 'rain', 'torrent', 'deep', 'town', 'cicada', 'cricket', 'leaves', 'fire', 'sky', 'hull', 'sails'];
    for (const b of beds) {
      const off = offline(4);
      const a = lab(off, { volume: 1, music: 0 });
      a.amb.update({ [b]: 0.7 }, {}, 0.1, 0.3);
      const buf = await off.startRendering();
      const m = analyze(buf);
      out.push({ id: 'bed:' + b, ...m, env: undefined });
      tiles.push(tile(buf, 'bed:' + b + ' rms ' + m.rms, 220, 110, 4));
    }
    for (const s of ['gull', 'bird', 'tropical', 'owl', 'frog', 'voice', 'laugh', 'clink', 'dog', 'moan', 'whale', 'drip', 'chains', 'bubbles', 'embers', 'drops', 'surf']) {
      const off = offline(4);
      const a = lab(off, { volume: 1, music: 0 });
      a.amb.spot(s, { pan: 0, far: 0 });
      const buf = await off.startRendering();
      const m = analyze(buf);
      out.push({ id: 'spot:' + s, ...m, env: undefined });
      tiles.push(tile(buf, 'spot:' + s + ' pk ' + m.peak, 220, 110, 4));
    }
    return { rows: out, png: sheet(tiles) };
  },
};
window.LAB_READY = true;
</script></body></html>`;

async function openLab(page) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(root, 'shots', 'audiolab.html'), LAB);
  await page.goto(new URL('/shots/audiolab.html', page.url()).href);
  await page.waitForFunction(() => window.LAB_READY, null, { timeout: 60000, polling: 100 });
}
const save = (name, b64) => writeFileSync(join(outDir, name), Buffer.from(b64, 'base64'));
const savePng = (name, url) => url && writeFileSync(join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));
const fmt = (r) => `${r.id.padEnd(30)} peak ${String(r.peak).padStart(5)}  rms ${String(r.rms).padStart(6)}  crest ${String(r.crest).padStart(5)}dB  dur ${String(r.dur).padStart(5)}s  atk ${String(r.attack).padStart(4)}  cenA ${String(r.centroidA).padStart(5)}Hz  A-L/M/H ${r.lowA}/${r.midA}/${r.highA}  loud ${r.loud}${r.varCentroid != null ? `  var c${r.varCentroid} p${r.varPeak} d${r.varDur} r${r.envCorr}` : ''}${r.nan ? '  NaN ' + r.nan : ''}`;

export const scenarios = {
  sfx: {
    path: '/package.json',
    async run(page, snap, args) {
      await openLab(page);
      const only = args.only ? String(args.only).split(',') : null;
      const reps = Number(args.reps || 3);
      // (WAVs only for a short list, or asked for: a hundred and more of them is a lot to carry back)
      const withWav = !!args.wav || !!only;
      const res = await page.evaluate(([only, reps, w]) => window.LAB.sfx(only, reps, w, true), [only, reps, withWav]);
      mkdirSync(join(outDir, 'sfx'), { recursive: true });
      const rows = [];
      for (const r of res.rows) {
        if (r.wav) save(join('sfx', r.id.replace(/[^a-z0-9_@:-]/gi, '_').replace(/:/g, '-') + '.wav'), r.wav);
        delete r.wav;
        rows.push(r);
        console.log(fmt(r));
      }
      writeFileSync(join(outDir, `sfx-metrics${args.tag ? '-' + args.tag : ''}.json`), JSON.stringify(rows, null, 1));
      savePng(`sfx-sheet${args.tag ? '-' + args.tag : ''}.png`, res.png);
      const loud = rows.filter((r) => r.peak > 0.98), silent = rows.filter((r) => r.peak < 0.003), same = rows.filter((r) => r.envCorr > 0.995 && r.varCentroid < 0.005);
      console.log(`${rows.length} sounds — clipping: ${loud.map((r) => r.id).join(', ') || 'none'} — silent: ${silent.map((r) => r.id).join(', ') || 'none'} — identical repeats: ${same.map((r) => r.id).join(', ') || 'none'}`);
    },
  },
  music: {
    path: '/package.json',
    async run(page, snap, args) {
      await openLab(page);
      const themes = String(args.theme || 'title,sea,town,night,grandline,underwater,battle').split(',');
      const secs = Number(args.secs || 40);
      for (const theme of themes) {
        const res = await page.evaluate(([t, s]) => window.LAB.theme(t, s), [theme, secs]);
        const quiet = res.env.filter((x) => x < 0.002).length;
        const mean = res.env.reduce((a, b) => a + b, 0) / res.env.length;
        console.log(theme.padEnd(22), JSON.stringify({ ...res.T, peak: res.peak, nan: res.nan, meanRms: +mean.toFixed(4), quietHalfSeconds: quiet, of: res.env.length, bars: res.bars, barDur: res.barDur, centroid: res.centroid }));
        const f = theme.replace(/[^a-z0-9_]/gi, '-');
        save(`music-${f}.wav`, res.wav);
        savePng(`music-${f}-spectrogram.png`, res.png);
      }
    },
  },
  director: {
    path: '/package.json',
    async run(page, snap, args) {
      await openLab(page);
      const res = await page.evaluate((s) => window.LAB.director(s), Number(args.secs || 110));
      for (const l of res.log) console.log(JSON.stringify(l));
      const e = res.env;
      const row = (a, b) => e.slice(a * 2, b * 2).map((x) => x < 0.002 ? '.' : x < 0.01 ? ':' : x < 0.03 ? '|' : '#').join('');
      for (let s = 0; s < e.length / 2; s += 30) console.log(String(s).padStart(4) + 's ' + row(s, s + 30));
      console.log(JSON.stringify({ peak: res.peak, steepestStep: res.jump, at: res.jumpAt }));
      save('director.wav', res.wav);
      savePng('director-spectrogram.png', res.png);
    },
  },
  /** Before and after: the effects the game had, through the old audio.js and the new. */
  compare: {
    path: '/package.json',
    async run(page, snap, args) {
      const { execSync } = await import('node:child_process');
      writeFileSync(join(root, 'shots', 'old-audio.js'), execSync('git show cfa98cc:src/audio/audio.js', { cwd: root }));
      await openLab(page);
      const names = String(args.only || 'whoosh,punch,punch_heavy,slash_hit,slash_heavy,block,parry,guardbreak,dodge,ko,haki,haki_obs,fire,magma,ice,lightning,water,sand,light,dark,quake,explosion,cannon,crash,splash,splash_big,jump,jump_big,land_heavy,door,coin,equip,thunder').split(',');
      const before = await page.evaluate((n) => window.LAB.old(n), names);
      const after = await page.evaluate((n) => window.LAB.sfx(n.map((x) => x), 1, false, true), names);
      const A = Object.fromEntries(after.rows.map((r) => [r.id, r]));
      for (const b of before.rows) {
        const a = A[b.id];
        if (!a) continue;
        console.log(`${b.id.padEnd(14)} peak ${String(b.peak).padStart(5)} -> ${String(a.peak).padStart(5)}   loud ${String(b.loud).padStart(5)} -> ${String(a.loud).padStart(5)}   dur ${String(b.dur).padStart(4)} -> ${String(a.dur).padStart(4)}   centroidA ${String(b.centroidA).padStart(5)} -> ${String(a.centroidA).padStart(5)}   A-L/M/H ${b.lowA}/${b.midA}/${b.highA} -> ${a.lowA}/${a.midA}/${a.highA}`);
      }
      savePng('compare-before.png', before.png);
      savePng('compare-after.png', after.png);
    },
  },
  ambience: {
    path: '/package.json',
    async run(page) {
      await openLab(page);
      const res = await page.evaluate(() => window.LAB.ambience());
      for (const r of res.rows) console.log(fmt(r));
      savePng('ambience-sheet.png', res.png);
    },
  },
  /** A real game with its audio on: the director and the foley meet the real objects (no page errors allowed). */
  'game-audio': {
    async run(page, snap, args) {
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => localStorage.clear());
      await page.evaluate((race) => window.OP.quickStart(race), args.race || 'human');
      const { SFX } = await import('../src/audio/sfx.js');
      const names = Object.keys(SFX);
      const report = await page.evaluate(async (names) => {
        const OP = window.OP, g = OP.game, au = g.audio;
        au.init();
        await au.ctx.resume();
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const note = (what) => out.push({ what, theme: au.theme, state: au.director?.state, place: au.director?.place, voices: au.E.count('sfx'), amb: au.E.count('amb'), beds: Object.keys(au.amb.beds) });
        OP.step(0.5); await wait(400); note('spawned');
        // walk (footsteps), jump (push-off and landing)
        OP.key('W', true); for (let i = 0; i < 20; i++) { OP.step(0.05); await wait(30); } OP.key('W', false);
        note('walked');
        OP.key('Space', true); OP.step(0.05); OP.key('Space', false); for (let i = 0; i < 12; i++) { OP.step(0.05); await wait(30); }
        note('jumped');
        // every effect once, on the player
        for (const n of names) { au.sfx(n, g.player); await wait(15); }
        note('every effect');
        // a fight: the director's battle music
        g.engaged = true; g.combatT = 6;
        for (let i = 0; i < 30; i++) { au.director.update(g); await wait(60); }
        note('fight');
        g.engaged = false; g.combatT = 0;
        for (let i = 0; i < 70; i++) { au.director.update(g); await wait(60); }
        note('after the fight');
        return out;
      }, names);
      for (const r of report) console.log(JSON.stringify(r));
      await snap('game-audio');
    },
  },
};
