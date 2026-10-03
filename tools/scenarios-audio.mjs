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
function lab(off, settings = { volume: 1, music: 1 }, chain = false) {
  // (not through the constructor: its page listeners would keep every render's buffers alive)
  const a = Object.create(Audio.prototype);
  Object.assign(a, { settings, last: {}, lastDrawn: false, foot: 1, ctx: off });
  a.build();
  // (measured before the limiter, unless asked: a browser's compressor starts out clamped
  // down and lets go over its release, which would swallow a sound played at once)
  if (!chain) { try { a.E.master.disconnect(); } catch { /* none */ } a.E.master.connect(off.destination); }
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

// ---------------------------------------------------------------- as a listener hears it: bands, envelopes, events
/** Mono mix of a buffer. */
function mono(buf) {
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, m = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) m[i] = (L[i] + R[i]) / 2;
  return m;
}
/** Octave bands (centres) and third-octave bands, 63 Hz – 16 kHz. */
const OCT = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const octOf = (f) => (f < 44.5 || f > 22000 ? -1 : Math.max(0, Math.min(OCT.length - 1, Math.round(Math.log2(f / 63)))));
/**
 * Mean-square power per frequency bin of m[s0..s1] (Welch: Hann frames of n,
 * half overlapping; a window shorter than n is one zero-padded frame). Summing
 * bins gives a band's mean square, so levels are comparable across windows.
 */
function welch(m, s0, s1, n = 4096) {
  const L = Math.max(16, Math.min(n, s1 - s0)), P = new Float64Array(n / 2);
  const w = new Float64Array(L); let wss = 0;
  for (let i = 0; i < L; i++) { w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (L - 1)); wss += w[i] * w[i]; }
  const re = new Float64Array(n), im = new Float64Array(n);
  let fr = 0;
  for (let s = s0; s + L <= Math.max(s1, s0 + L) && s + L <= m.length; s += L >> 1) {
    re.fill(0); im.fill(0);
    for (let i = 0; i < L; i++) re[i] = m[s + i] * w[i];
    fft(re, im);
    for (let k = 1; k < n / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    fr++;
    if (L < n) break;
  }
  const norm = 2 / (Math.max(1, fr) * wss * n);
  for (let k = 0; k < n / 2; k++) P[k] *= norm;
  return P;
}
/** Octave band levels (dB, mean square) from a Welch spectrum. */
function octaves(P, sr, n = 4096) {
  const o = new Float64Array(OCT.length);
  for (let k = 1; k < n / 2; k++) { const b = octOf(k * sr / n); if (b >= 0) o[b] += P[k]; }
  return Array.from(o, (x) => 10 * Math.log10(x + 1e-14));
}
/** Centroid of a spectrum (plain, and as the ear weighs it). */
function centroids(P, sr, n = 4096) {
  let t = 0, c = 0, ta = 0, ca = 0;
  for (let k = 1; k < n / 2; k++) { const f = k * sr / n, a = aWeight(f) * P[k]; t += P[k]; c += f * P[k]; ta += a; ca += f * a; }
  return [Math.round(c / (t || 1)), Math.round(ca / (ta || 1))];
}
/** Energy per short frame (n every hop samples) between f0 and f1 Hz: an envelope of one band. */
function bandEnv(m, sr, f0, f1, n = 512, hop = 128) {
  const k0 = Math.max(1, Math.floor(f0 * n / sr)), k1 = Math.min(n / 2 - 1, Math.ceil(f1 * n / sr));
  const w = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n);
  const out = new Float32Array(Math.max(0, Math.floor((m.length - n) / hop) + 1));
  for (let j = 0; j < out.length; j++) {
    im.fill(0);
    for (let i = 0; i < n; i++) re[i] = m[j * hop + i] * w[i];
    fft(re, im);
    let e = 0; for (let k = k0; k <= k1; k++) e += re[k] * re[k] + im[k] * im[k];
    out[j] = e;
  }
  return out;
}
const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] ?? 0; };
const dB = (x) => 10 * Math.log10(Math.max(1e-14, x));
/**
 * Events in a band (drops, chirps, clicks): frames standing out by \`th\` dB
 * above the band's running median (±0.15 s), each a local peak. Events a
 * second and their median prominence.
 */
function events(m, sr, f0, f1, th = 6) {
  const hop = 128, e = bandEnv(m, sr, f0, f1, 512, hop), fps = sr / hop, R = Math.round(0.15 * fps);
  let n = 0; const prom = [];
  let med = 0;
  for (let j = 2; j < e.length - 2; j++) {
    if (j % 8 === 2) { const a = Math.max(0, j - R), b = Math.min(e.length, j + R); med = pct(e.subarray(a, b), 0.5); }
    const x = e[j];
    if (x > e[j - 1] && x >= e[j + 1] && x > e[j - 2] && x >= e[j + 2] && dB(x) - dB(med) > th) { n++; prom.push(dB(x) - dB(med)); }
  }
  return { perSec: +(n / (m.length / sr)).toFixed(1), prom: +pct(prom, 0.5).toFixed(1) };
}
/**
 * How a band's level moves: the strongest periodic swells and pulses of its
 * envelope (0.05–40 Hz) as [Hz, dB above the median of the modulation spectrum],
 * and how deep its slow swells go (p90 − p10 of a 0.5 s envelope, dB).
 */
function modulation(m, sr, f0, f1) {
  const hop = 441, e = bandEnv(m, sr, f0, f1, 1024, hop), fps = sr / hop;
  const a = Array.from(e, (x) => Math.sqrt(x));
  const mean = a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  let n = 1; while (n < a.length * 2) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < a.length; i++) re[i] = (a[i] - mean) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / Math.max(1, a.length - 1)));
  fft(re, im);
  const mag = []; for (let k = 0; k < n / 2; k++) mag.push(Math.hypot(re[k], im[k]));
  const lo = Math.max(1, Math.ceil(0.05 * n / fps)), hi = Math.min(n / 2 - 2, Math.floor(40 * n / fps));
  const ref = pct(mag.slice(lo, hi), 0.5) || 1e-9, peaks = [];
  for (let k = lo + 1; k < hi; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) peaks.push([k * fps / n, 20 * Math.log10(mag[k] / ref)]);
  peaks.sort((x, y) => y[1] - x[1]);
  // (the slow swell: a 0.5 s envelope's spread)
  const blk = Math.max(1, Math.round(fps / 2)), slow = [];
  for (let i = 0; i + blk <= a.length; i += blk) { let s = 0; for (let j = i; j < i + blk; j++) s += e[j]; slow.push(dB(s / blk)); }
  return { peaks: peaks.slice(0, 3).map(([f, d]) => [+f.toFixed(2), +d.toFixed(1)]), swell: +(pct(slow, 0.9) - pct(slow, 0.1)).toFixed(1) };
}
/**
 * A single impact (the loudest event in the clip): attack, decay to −20 and −40
 * dB, and its parts — transient (0–15 ms), body (15–80), tail (80–300) — as
 * octave levels relative to the whole hit, with centroids; the body's strongest
 * tone below 2 kHz, and how much the tail rings (its spectral peak over its median).
 */
function impact(m, sr) {
  const W = Math.max(1, Math.round(sr / 1000)), env = [];
  for (let i = 0; i + W <= m.length; i += W) { let s = 0; for (let j = i; j < i + W; j++) s += m[j] * m[j]; env.push(Math.sqrt(s / W)); }
  let im = 0; for (let i = 1; i < env.length; i++) if (env[i] > env[im]) im = i;
  const pk = env[im] || 1e-9;
  let i0 = im; while (i0 > 0 && env[i0 - 1] > pk * 0.1) i0--;
  let i90 = i0; while (i90 < im && env[i90] < pk * 0.9) i90++;
  // (decay on a 10 ms smoothing)
  const sm = (i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 5); j < Math.min(env.length, i + 5); j++) { s += env[j] * env[j]; c++; } return Math.sqrt(s / Math.max(1, c)); };
  const p10 = sm(im);
  let d20 = null, d40 = null;
  for (let i = im; i < env.length; i++) { const l = 20 * Math.log10(sm(i) / p10); if (d20 == null && l < -20) d20 = i - im; if (l < -40) { d40 = i - im; break; } }
  const s0 = i0 * W, at = (ms) => Math.min(m.length, s0 + Math.round(ms * sr / 1000));
  const whole = welch(m, s0, at(1000));
  const ref = Math.max(...octaves(whole, sr));
  const part = (a, b) => { const P = welch(m, at(a), at(b)); const o = octaves(P, sr); const [c, ca] = centroids(P, sr); return { oct: o.map((x) => Math.round(x - ref)), c, ca, lvl: +dB(P.reduce((s, x) => s + x, 0)).toFixed(1) }; };
  const T = part(0, 15), B = part(15, 80), Tl = part(80, 300);
  // the body's tone, and the tail's ring
  const Pb = welch(m, at(15), at(300), 8192);
  let kb = 0, fb = 0; for (let k = Math.ceil(30 * 8192 / sr); k < 2000 * 8192 / sr; k++) if (Pb[k] > (Pb[kb] || 0)) kb = k; fb = Math.round(kb * sr / 8192);
  const Pt = welch(m, at(80), at(400), 8192), band = [];
  for (let k = Math.ceil(300 * 8192 / sr); k < 8000 * 8192 / sr; k++) band.push(Pt[k]);
  const ring = +(dB(Math.max(...band)) - dB(pct(band, 0.5))).toFixed(1);
  return { attack: i90 - i0, d20, d40, trans: T, body: B, tail: Tl, tone: fb, ring };
}
/** What a clip is like: its colour (octaves re its loudest), how it moves, its events, and (a short one) its impact. */
function describe(buf, { secs = 60, skip = 0 } = {}) {
  const sr = buf.sampleRate, all = mono(buf);
  const m = all.subarray(Math.min(all.length, Math.round(skip * sr)), Math.min(all.length, Math.round((skip + secs) * sr)));
  const P = welch(m, 0, m.length);
  const oct = octaves(P, sr), top = Math.max(...oct);
  const [c, ca] = centroids(P, sr);
  // 10 ms envelope (dB re the clip's mean square): how spiky it is
  const W = Math.round(sr / 100), e = [];
  let ms = 0; for (let i = 0; i < m.length; i++) ms += m[i] * m[i]; ms /= Math.max(1, m.length);
  for (let i = 0; i + W <= m.length; i += W) { let s = 0; for (let j = i; j < i + W; j++) s += m[j] * m[j]; e.push(dB(s / W / ms)); }
  return {
    dur: +(m.length / sr).toFixed(1), rmsDb: +dB(ms).toFixed(1), levA: +dB(P.reduce((s, x, k) => s + x * aWeight(k * sr / 4096), 0)).toFixed(1), c, ca, oct: oct.map((x) => Math.round(x - top)),
    env: [0.1, 0.5, 0.9, 0.99].map((q) => +pct(e, q).toFixed(1)),
    drops: events(m, sr, 2000, 10000), patter: events(m, sr, 700, 3000),
    modHi: modulation(m, sr, 3000, 12000), modAll: modulation(m, sr, 60, 12000),
    hit: m.length / sr <= 12 ? impact(m, sr) : null,
    // (a short clip's loudest moment as the ear weighs it: its 23 ms A-weighted peak)
    pkA: m.length / sr <= 12 ? +dB(Math.max(...frameBands(buf, null).A)).toFixed(1) : null,
  };
}
/** A spectrogram tile (log frequency 40 Hz – 16 kHz) of a buffer, with a label. */
function tile(buf, label, w = 220, h = 110, secs = 2.5, norm = false) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h + 14;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h + 14);
  const sr = buf.sampleRate, L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = Math.min(L.length, Math.floor(secs * sr)), m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (L[i] + R[i]) / 2;
  const fr = frames(m, sr);
  // (normalised: the loudest bin at the top of the scale, 60 dB of it shown — a recording and a render side by side)
  let top = -1; if (norm) for (const p of fr) for (let k = 1; k < N / 2; k++) if (p[k] > top) top = p[k];
  const off = norm && top > 0 ? -Math.log10(top) + 6 : 7;
  for (let x = 0; x < w; x++) {
    const p = fr[Math.floor(x / w * fr.length)];
    if (!p) continue;
    for (let y = 0; y < h; y++) {
      const f = 40 * Math.pow(16000 / 40, 1 - y / (h - 1)), k = Math.min(N / 2 - 1, Math.round(f * N / sr));
      const v = Math.min(1, Math.max(0, (Math.log10(p[k] + 1e-12) + off) / 6));
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

async function renderCase(c, secs = 2.5, volume = 1) {
  const off = offline(secs);
  const a = lab(off, { volume, music: 0 });
  c.play(a);
  const buf = await off.startRendering();
  return buf;
}

// ---------------------------------------------------------------- situations: the beds as the foley sets them, the action over them
/** A seeded Math.random (mulberry32), so a situation sounds the same in both of its renders. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** The audio (and the islands) from a source tree: '/src', or an older one checked out under /shots. */
const ROOTS = {};
async function loadRoot(root) {
  if (!ROOTS[root]) {
    const [au, isl, mu, th] = await Promise.all([import(root + '/audio/audio.js'), import(root + '/data/islands/index.js'), import(root + '/audio/music.js'), import(root + '/audio/themes.js')]);
    ROOTS[root] = { Audio: au.Audio, ISL: isl.ALL_ISLANDS, Deck: mu.Deck, THEMES: th.THEMES, battleOf: th.battleOf };
  }
  return ROOTS[root];
}
function labOf(Au, off, settings) {
  const a = Object.create(Au.prototype);
  Object.assign(a, { settings, last: {}, lastDrawn: false, foot: 1, ctx: off });
  a.build();
  return a;
}
/**
 * A make-believe game for the foley to watch: where the player is (an island,
 * a town, at sea, on a deck, at the oars), the weather and the time of day.
 */
function fakeGame(spec, ISL) {
  const isl = spec.island ? ISL.find((i) => i.id === spec.island) : null;
  const p = { x: 0, y: 0, mode: 'foot', deck: null, ship: null, inWater: false, under: false, moving: true, hp: 100, d: { maxHp: 100 }, state: 'idle', climb: null, drawn: false, seed: 0, intent: {}, isPlayer: true, footSurface: () => spec.surface || 'dirt' };
  const env = { rain: 0, storm: 0, snow: 0, windStrength: 1, windAngle: 0, time: 0, daylight: spec.night ? 0.1 : 1, ...(spec.env || {}) };
  const coast = spec.coast ?? 0;
  const world = {
    zone: 0, id: 'surface', climate: () => 0,
    // (the sea round about: this fraction of the compass)
    isLiquid: (x, y) => ((Math.atan2(y - p.y, x - p.x) / (2 * Math.PI) + 1) % 1) < coast - 1e-6,
    interiorAt: () => !!spec.inside,
  };
  const g = { player: p, env, world, view3d: { isUnder: !!spec.below }, time: 0, on() {}, ui: null, state: null, engaged: !!spec.fight, combatT: spec.fight ? 6 : 0, actorsNear: () => [], currentIsland: isl ? { id: isl.id, def: isl, towns: [] } : null, sea: {} };
  if (spec.ship) {
    const row = spec.ship === 'row';
    const s = { def: { oarsOnly: row, length: row ? 5 : 16, speed: row ? 3 : 8 }, heading: 0, speed: spec.speed ?? (row ? 2.6 : 7), rowL: 0, rowR: 0, rowPh: 0, sail: row ? 0 : 1, sailSet: row ? 0 : 1, anchored: false, captain: p, owner: 'player', rowing: 0, sunk: false, x: 0, y: 0 };
    p.ship = s;
    if (spec.onDeck) { p.deck = { ship: s }; } else p.mode = 'sail';
  }
  const w = { zone: 'surface', zoneId: 'surface', night: !!spec.night, under: false, seaId: spec.seaId || 'east_blue' };
  if (isl) { w.island = { id: isl.id, def: isl, sea: isl.sea }; if (spec.town) w.town = { id: spec.town, style: spec.townStyle || 'village' }; }
  return { g, p, w };
}
/**
 * Render a situation: the beds and spots as the foley director sets them for
 * \`spec\` (and a piece of music if it says so), with its action — footsteps at
 * a walking pace, blows, the oars — played over them. Rendered twice from the
 * same seed, the second time with the \`target\` sounds silenced (their voices
 * still taken, everything else the same), so the difference is exactly what
 * the target sounds added and the second render is what they had to cut through.
 * Both before the limiter, so the subtraction is exact.
 */
async function renderSituation(spec, root, muteTargets) {
  const R = await loadRoot(root);
  const real = Math.random;
  Math.random = seeded(spec.seed || 7);
  const secs = spec.secs || 16, off = offline(secs);
  const clock = fakeClock(off);
  const a = labOf(R.Audio, off, { volume: 0.7, music: spec.music ? 0.5 : 0 });
  const E = a.E;
  // (the limiter and clipper are left out: what comes in is what's measured)
  try { E.master.disconnect(); } catch { /* none */ }
  E.master.connect(off.destination);
  // (whose sound it is: the player's own, or another's — only the player's are targets unless the spec says)
  let cur = null;
  const isT = (name) => spec.target.test(name) && (spec.othersToo || !cur || cur.mine);
  const log = [], stolen = [], peak = { sfx: 0, amb: 0 };
  const open0 = E.open.bind(E), steal0 = E.steal.bind(E);
  E.open = (name, o) => {
    const v = open0(name, o);
    log.push({ t: E.now(), name, ok: !!v, prio: o?.prio, target: isT(name) });
    if (v && muteTargets && isT(name)) v.out.gain.value = 0;
    for (const b of ['sfx', 'amb']) peak[b] = Math.max(peak[b], E.count(b));
    return v;
  };
  E.steal = (v, t, list) => { if (v.end > t + 0.03) stolen.push({ t: +t.toFixed(2), name: v.name }); return steal0(v, t, list); };
  const { g, p, w } = fakeGame(spec, R.ISL);
  a.attach(g);
  let deck = null;
  if (spec.music) {
    const T = spec.music.startsWith('battle') ? R.battleOf(R.THEMES[spec.music.split(':')[1] || 'sea'] || R.THEMES.sea) : R.THEMES[spec.music];
    deck = new R.Deck(a.mu, T, { at: 0.3, fade: 0.5, loop: true, stems: spec.music.startsWith('battle') ? { perc: 1, bass: 1, pad: 1, arp: 1, perc2: 1, lead: 1, brass: 0.5 } : null });
  }
  const evs = (spec.events || []).slice().sort((x, y) => x[0] - y[0]);
  let ei = 0, ambT = 0, stepT = spec.walk ? (spec.walk.from ?? 1.5) : Infinity;
  const dt = 1 / 30;
  for (let t = 0; t < secs - 0.4; t += dt) {
    clock.set(t); g.env.time = t; g.time = t;
    // the boat under you: the oars on her own stroke, the sails drawing
    const s = p.ship;
    if (s && spec.row && t >= (spec.row.from ?? 1)) { s.rowL = s.rowR = 1; s.rowPh = (s.rowPh + dt / 1.15) % 1; }
    a.foley.tick(dt);
    ambT += dt;
    if (ambT >= 0.24) { a.foley.ambience(ambT, w); ambT = 0; }
    if (deck) deck.schedule(t);
    // walking: a step every half stride, now and then a pause
    if (t >= stepT && t < (spec.walk.to ?? secs - 1)) {
      cur = { mine: true };
      a.step(spec.walk.surface || spec.surface || 'dirt', spec.walk.loud ?? 0.6);
      stepT = t + (spec.walk.every || 0.5) * (0.96 + Math.random() * 0.08);
    }
    while (ei < evs.length && evs[ei][0] <= t) {
      const [, name, k, at] = evs[ei++];
      // (a blow of the player's lands on a foe beside them; another's is somewhere off to the side)
      const where = at === 'foe' ? { x: 1.4, y: 0.3, lastHitBy: p } : at && at.x != null ? at : null;
      cur = { mine: !(at && at.x != null) };
      a.sfx(name, where, k || null);
    }
    cur = null;
  }
  clock.done();
  if (muteTargets && spec.targetBeds) for (const [n, b] of Object.entries(a.amb.beds || {})) if (spec.targetBeds.test(n)) { try { b.out.disconnect(); } catch { /* gone */ } }
  const buf = await off.startRendering();
  Math.random = real;
  return { buf, log, stolen, peak, beds: Object.keys(a.amb.beds || {}) };
}
/** Octave-band energy (125 Hz – 8 kHz, and A-weighted broadband) of short frames of each channel of a buffer, or of a difference of two. */
const SOCT = [125, 250, 500, 1000, 2000, 4000, 8000];
function frameBands(bufA, bufB, n = 1024, hop = 512) {
  const sr = bufA.sampleRate, nf = Math.floor((bufA.length - n) / hop) + 1;
  // (A: as the ear weighs it; S: the same through a small speaker — a laptop's or a phone's, nothing much under 180 Hz)
  const out = SOCT.map(() => new Float32Array(nf)), A = new Float32Array(nf), S = new Float32Array(nf);
  const w = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n);
  const kb = [], ka = [], ks = [];
  for (let k = 1; k < n / 2; k++) { const f = k * sr / n; kb.push(Math.max(-1, Math.min(SOCT.length - 1, f < 88 || f > 11300 ? -1 : Math.round(Math.log2(f / 125))))); ka.push(aWeight(f)); ks.push(f < 180 ? 0 : aWeight(f)); }
  let wss = 0; for (const x of w) wss += x * x;
  const norm = 2 / (wss * n);
  for (let ch = 0; ch < Math.min(2, bufA.numberOfChannels); ch++) {
    const a = bufA.getChannelData(ch), b = bufB ? bufB.getChannelData(ch) : null;
    for (let j = 0; j < nf; j++) {
      im.fill(0);
      for (let i = 0; i < n; i++) re[i] = (a[j * hop + i] - (b ? b[j * hop + i] : 0)) * w[i];
      fft(re, im);
      for (let k = 1; k < n / 2; k++) {
        const pw = (re[k] * re[k] + im[k] * im[k]) * norm * 0.5;
        const bi = kb[k - 1];
        if (bi >= 0) out[bi][j] += pw;
        A[j] += pw * ka[k - 1];
        S[j] += pw * ks[k - 1];
      }
    }
  }
  return { bands: out, A, S, fps: sr / hop, nf };
}
/**
 * How well each target sound stood clear of what was under it: for each one,
 * its loudest frame in each octave band against the mean of everything else in
 * that band from 0.25 s before to 0.5 s after (dB) — the best band, and as the
 * ear weighs the whole (A-weighted).
 */
function clearance(full, bed, starts) {
  const T = frameBands(full, bed), B = frameBands(bed, null);
  const out = [];
  for (const { t: t0, name } of starts) {
    const j0 = Math.max(0, Math.floor(t0 * T.fps) - 1), j1 = Math.min(T.nf - 1, Math.ceil((t0 + 0.3) * T.fps));
    const b0 = Math.max(0, Math.floor((t0 - 0.25) * T.fps)), b1 = Math.min(T.nf - 1, Math.ceil((t0 + 0.5) * T.fps));
    const mean = (arr) => { let s = 0; for (let j = b0; j <= b1; j++) s += arr[j]; return s / Math.max(1, b1 - b0 + 1); };
    const top = (arr) => { let m = 0; for (let j = j0; j <= j1; j++) m = Math.max(m, arr[j]); return m; };
    let best = -99, bestBand = 0;
    const per = SOCT.map((f, i) => { const d = dB(top(T.bands[i])) - dB(mean(B.bands[i])); if (d > best) { best = d; bestBand = f; } return Math.round(d); });
    out.push({ t: +t0.toFixed(2), name, best: +best.toFixed(1), at: bestBand, A: +(dB(top(T.A)) - dB(mean(B.A))).toFixed(1), S: +(dB(top(T.S)) - dB(mean(B.S))).toFixed(1), level: +dB(top(T.A)).toFixed(1), per });
  }
  return out;
}
const med = (a) => (a.length ? pct(a, 0.5) : null);

window.LAB = {
  THEMES, SFX, ISLAND_THEME, ALL_ISLANDS, STEMS,
  /** A reference recording (shots/ref/: fetched for study, never committed), decoded and described. */
  async ref(url, opts = {}) {
    const ab = await (await fetch(url)).arrayBuffer();
    const buf = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(ab);
    const id = url.split('/').pop().replace(/\\.[a-z0-9]+$/, '');
    const r = { id, ...describe(buf, opts) };
    if (opts.tile) LAB.tiles.push(tile(buf, id, opts.tw || 330, opts.th || 120, Math.min(opts.tileSecs || 6, buf.duration), true));
    return r;
  },
  /** One of the effects (cases() ids) rendered and described the same way. */
  async synth(id, secs = 3, k = null, opts = {}) {
    const c = cases().find((x) => x.id === id) || { id, play: (a) => a.sfx(id, null, k) };
    const buf = await renderCase(c, secs, opts.volume ?? 0.7);
    if (opts.tile) LAB.tiles.push(tile(buf, 'synth:' + id, opts.tw || 330, opts.th || 120, Math.min(opts.tileSecs || 6, secs), true));
    return { id: 'synth:' + id, ...describe(buf) };
  },
  /**
   * A situation (see renderSituation) from the audio in \`root\`: how loud the
   * beds are and what colour, whether each target sound stood clear of them,
   * whether any were refused a voice or cut short, and how many voices it took.
   */
  async situation(spec0, root = '/src', withWav = false) {
    const spec = { ...spec0, target: new RegExp(spec0.target || '^$'), targetBeds: spec0.targetBeds ? new RegExp(spec0.targetBeds) : null };
    const full = await renderSituation(spec, root, false);
    const bed = await renderSituation(spec, root, true);
    const starts = full.log.filter((e) => e.ok && e.target && e.t > 0.8);
    const refused = full.log.filter((e) => !e.ok && e.target).map((e) => e.name);
    const cl = clearance(full.buf, bed.buf, starts);
    // by sound: the median clearance of each kind of target
    const byName = {};
    for (const c of cl) (byName[c.name] = byName[c.name] || []).push(c);
    for (const k of Object.keys(byName)) { const L = byName[k]; byName[k] = { n: L.length, A: +med(L.map((c) => c.A)).toFixed(1), min: +Math.min(...L.map((c) => c.A)).toFixed(1), S: +med(L.map((c) => c.S)).toFixed(1) }; }
    // the bed alone: its loudness as the ear weighs it, and its colour (octaves re its loudest)
    const B = frameBands(bed.buf, null), skip = Math.floor(1.5 * B.fps);
    const avg = (arr) => { let s = 0; for (let j = skip; j < arr.length; j++) s += arr[j]; return s / Math.max(1, arr.length - skip); };
    const oct = B.bands.map((x) => dB(avg(x))), top = Math.max(...oct);
    // how steady the bed is (a hiss doesn't move): spread of its 0.5 s A-weighted level
    const half = [], hb = Math.round(B.fps / 2);
    for (let j = skip; j + hb <= B.nf; j += hb) { let s = 0; for (let i = j; i < j + hb; i++) s += B.A[i]; half.push(dB(s / hb)); }
    let tb = null;
    if (spec.targetBeds) {
      // a bed as the target (the boat's own sound under sail): how far above the rest, band by band
      const T = frameBands(full.buf, bed.buf);
      const per = SOCT.map((f, i) => Math.round(dB(avg(T.bands[i])) - dB(avg(B.bands[i]))));
      tb = { per, A: +(dB(avg(T.A)) - dB(avg(B.A))).toFixed(1) };
    }
    let pk = 0, tpk = 0, bpk = 0;
    let tpkT = 0;
    for (let ch = 0; ch < 2; ch++) { const d = full.buf.getChannelData(ch), b = bed.buf.getChannelData(ch); for (let i = 0; i < d.length; i++) { pk = Math.max(pk, Math.abs(d[i])); if (Math.abs(d[i] - b[i]) > tpk) { tpk = Math.abs(d[i] - b[i]); tpkT = i / 44100; } bpk = Math.max(bpk, Math.abs(b[i])); } }
    const As = cl.map((c) => c.A), bests = cl.map((c) => c.best);
    return {
      id: spec.id, root, n: cl.length, refused, stolen: full.stolen, voices: full.peak, beds: full.beds, byName,
      bedA: +dB(avg(B.A)).toFixed(1), bedOct: oct.map((x) => Math.round(x - top)), bedSwing: +(pct(half, 0.9) - pct(half, 0.1)).toFixed(1),
      marginA: med(As) == null ? null : +med(As).toFixed(1), marginAmin: As.length ? +Math.min(...As).toFixed(1) : null, marginS: cl.length ? +med(cl.map((c) => c.S)).toFixed(1) : null,
      best: med(bests) == null ? null : +med(bests).toFixed(1), clear: As.length ? Math.round(100 * As.filter((x) => x > 6).length / As.length) : null,
      heard: As.length ? Math.round(100 * As.filter((x) => x > 0).length / As.length) : null,
      bandsMed: SOCT.map((f, i) => med(cl.map((c) => c.per[i]))), targetBed: tb, peak: +pk.toFixed(3), tpeak: +tpk.toFixed(3), tpeakT: +tpkT.toFixed(3), bpeak: +bpk.toFixed(3), events: cl,
      wav: withWav ? wav(full.buf) : undefined,
    };
  },
  /**
   * The end of the chain (limiter and clipper) on steady tones and on a burst:
   * the gain at each level (1 below the limiter's threshold: nothing added or
   * taken), and how it lets go after a loud moment (how fast the level comes back).
   */
  async limiter() {
    const out = [];
    for (const amp of [0.05, 0.2, 0.4, 0.6, 0.8, 1.0, 1.4, 2]) {
      const off = offline(1.2), a = lab(off, { volume: 1, music: 0 }, true);
      const o = off.createOscillator(), g = off.createGain();
      o.frequency.value = 997; g.gain.value = amp; o.connect(g); g.connect(a.E.master); o.start(0);
      const buf = await off.startRendering(), d = buf.getChannelData(0);
      let pk = 0; for (let i = Math.floor(0.8 * 44100); i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      out.push({ amp, peak: +pk.toFixed(3), gainDb: +(20 * Math.log10(pk / amp)).toFixed(2) });
    }
    // a 0.3 s burst at 1.6 over a steady 0.1 tone: the tone's level just after (the release)
    const off = offline(2), a = lab(off, { volume: 1, music: 0 }, true);
    const o = off.createOscillator(), g = off.createGain(), o2 = off.createOscillator(), g2 = off.createGain();
    o.frequency.value = 997; g.gain.value = 0.1; o.connect(g); g.connect(a.E.master); o.start(0);
    o2.frequency.value = 160; g2.gain.setValueAtTime(0, 0); g2.gain.setValueAtTime(1.6, 0.5); g2.gain.setValueAtTime(0, 0.8); o2.connect(g2); g2.connect(a.E.master); o2.start(0);
    const buf = await off.startRendering(), d = buf.getChannelData(0);
    const lvl = (t0) => { let s = 0, n = 0; for (let i = Math.floor(t0 * 44100); i < Math.floor((t0 + 0.02) * 44100); i++) { s += d[i] * d[i]; n++; } return 20 * Math.log10(Math.sqrt(s / n) / (0.1 / Math.SQRT2)); };
    const rel = [0.4, 0.82, 0.9, 1.0, 1.1, 1.3, 1.6].map((t) => [t, +lvl(t).toFixed(1)]);
    return { steady: out, release: rel };
  },
  tiles: [],
  /** The tiles drawn so far, as one sheet (and forget them). */
  sheet(cols = 4) { const s = LAB.tiles.length ? sheet(LAB.tiles, cols) : null; LAB.tiles = []; return s; },
  /**
   * Beds (name → level), spots (name → a minute) and rain ({ r, storm, where })
   * for \`secs\` at the game's default volume, described after they've faded in.
   */
  async bed(levels, spots = {}, secs = 14, opts = {}) {
    const off = offline(secs);
    const clock = fakeClock(off);
    const a = lab(off, { volume: 0.7, music: 0 });
    if (opts.shelter) a.E.setShelter(opts.shelter, 0.01);
    for (let t = 0; t < secs - 0.3; t += 0.24) { clock.set(t); a.amb.update(levels, spots, 0.24, 0.3, opts.rain || null); }
    clock.done();
    const buf = await off.startRendering();
    const id = 'bed:' + [...Object.keys(levels), ...(opts.rain ? ['rain ' + opts.rain.where + ' ' + opts.rain.r] : [])].join('+');
    if (opts.tile) LAB.tiles.push(tile(buf, id, opts.tw || 330, opts.th || 120, Math.min(opts.tileSecs || 6, secs - 2), true));
    return { id, ...describe(buf, { skip: 2, secs: secs - 2.5 }), wav: opts.wav ? wav(buf) : undefined };
  },
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
    const beds = ['ocean', 'wind', 'howl', 'torrent', 'deep', 'leaves', 'fire', 'sky', 'hull', 'sails', 'rain:sea', 'rain:deck', 'rain:leaves', 'rain:ground', 'rain:town', 'rain:inside'];
    for (const b of beds) {
      const off = offline(8);
      const clock = fakeClock(off);
      const a = lab(off, { volume: 1, music: 0 });
      const rain = b.startsWith('rain:') ? { r: 0.6, where: b.slice(5) } : null;
      for (let t = 0; t < 7.6; t += 0.24) { clock.set(t); a.amb.update(rain ? {} : { [b]: 0.7 }, {}, 0.24, 0.3, rain); }
      clock.done();
      const buf = await off.startRendering();
      const m = analyze(buf);
      out.push({ id: 'bed:' + b, ...m, env: undefined });
      tiles.push(tile(buf, 'bed:' + b + ' rms ' + m.rms, 220, 110, 8));
    }
    for (const s of ['gull', 'bird', 'tropical', 'cicada', 'cricket', 'owl', 'frog', 'voice', 'laugh', 'clink', 'hammer', 'dog', 'door', 'cart', 'moan', 'whale', 'drip', 'chains', 'bubbles', 'embers', 'gust', 'surf']) {
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
// (the lab's own pieces, for a scratch scenario that wants to try something of its own)
window.LAB.parts = { lab, cases, renderCase, renderSituation, describe, frameBands, offline, fakeClock, wav, tile, sheet, mono, welch, octaves };
window.LAB_READY = true;
</script></body></html>`;

export async function openLab(page) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(root, 'shots', 'audiolab.html'), LAB);
  await page.goto(new URL('/shots/audiolab.html', page.url()).href);
  await page.waitForFunction(() => window.LAB_READY, null, { timeout: 60000, polling: 100 });
}
const save = (name, b64) => writeFileSync(join(outDir, name), Buffer.from(b64, 'base64'));
const savePng = (name, url) => url && writeFileSync(join(outDir, name), Buffer.from(url.split(',')[1], 'base64'));
const fmt = (r) => `${r.id.padEnd(30)} peak ${String(r.peak).padStart(5)}  rms ${String(r.rms).padStart(6)}  crest ${String(r.crest).padStart(5)}dB  dur ${String(r.dur).padStart(5)}s  atk ${String(r.attack).padStart(4)}  cenA ${String(r.centroidA).padStart(5)}Hz  A-L/M/H ${r.lowA}/${r.midA}/${r.highA}  loud ${r.loud}${r.varCentroid != null ? `  var c${r.varCentroid} p${r.varPeak} d${r.varDur} r${r.envCorr}` : ''}${r.nan ? '  NaN ' + r.nan : ''}`;

// ---------------------------------------------------------------- the situations the mix is checked in
// (each: where the player is, as the foley director sees it, and what they do
// there; `target` the sounds that must stand clear of the beds — a regex on the
// voice's name — and `targetBeds` a bed that is itself the point, like the boat's)
const BLOWS = '^(punch|punch_heavy|slash_hit|slash_heavy|block|fire|lightning|ice|quake|explosion)$';
/** A fight's action: the player's blows (and powers) on a foe, swings before them, another fight off to one side. */
function fightEvents(t0 = 2) {
  const ev = [];
  const mine = [[0, 'punch', { w: 0.3 }], [0.35, 'punch', { w: 0.4 }], [0.7, 'punch', { w: 0.6, kick: true }], [1.2, 'punch_heavy', { w: 0.9 }],
    [2.0, 'block', {}], [2.6, 'slash_hit', {}], [3.0, 'slash_hit', {}], [3.6, 'slash_heavy', {}],
    [4.5, 'fire', { w: 0.6 }], [5.5, 'lightning', {}], [6.5, 'ice', {}], [7.5, 'quake', {}], [8.6, 'punch', { w: 0.5, armament: true }], [9.2, 'explosion', {}]];
  for (const [dt, name, k] of mine) {
    if (name !== 'block') ev.push([t0 + dt - 0.12, 'whoosh', { kind: /slash/.test(name) ? 'sword' : 'fists' }]);
    ev.push([t0 + dt, name, k, name === 'block' ? null : 'foe']);
  }
  // (crewmates and foes trading blows six metres off)
  for (const dt of [0.5, 1.6, 2.3, 3.3, 4.1, 5.0, 6.1, 7.0, 8.1]) ev.push([t0 + dt, Math.random() < 0.7 ? 'punch' : 'slash_hit', { w: 0.4 }, { x: 5, y: 4 }]);
  return ev;
}
export const SITUATIONS = {
  town_day: { island: 'organ_islands', town: 'orange_town', townStyle: 'town', coast: 0.15, surface: 'stone', walk: { surface: 'stone', every: 0.5 }, target: '^step$', secs: 16 },
  conomi_town: { island: 'conomi_islands', town: 'cocoyasi', townStyle: 'village', coast: 0.4, surface: 'dirt', walk: { surface: 'dirt', every: 0.5 }, target: '^step$', secs: 16 },
  jungle_day: { island: 'rare_animals', coast: 0.1, surface: 'grass', walk: { surface: 'grass', every: 0.5 }, target: '^step$', secs: 16 },
  forest_night: { island: 'gecko_islands', night: true, coast: 0.05, surface: 'grass', walk: { surface: 'grass', every: 0.52 }, target: '^step$', secs: 16 },
  sea_rain: { ship: 'sail', onDeck: true, env: { rain: 0.5, storm: 0.5, windStrength: 1.05 }, walk: { surface: 'wood', every: 0.5 }, surface: 'wood', target: '^step$', secs: 16 },
  sea_storm: { ship: 'sail', onDeck: true, env: { rain: 0.95, storm: 0.95, windStrength: 1.3 }, walk: { surface: 'wood', every: 0.48, loud: 0.8 }, surface: 'wood', target: '^step$', secs: 16, events: [[5, 'thunder', { far: 0.2 }], [11, 'thunder', { far: 0.7 }]] },
  rowing: { ship: 'row', env: { windStrength: 0.8 }, row: { from: 1 }, target: '^oar_', secs: 16 },
  sailing: { ship: 'sail', onDeck: true, env: { windStrength: 1.1 }, walk: { surface: 'wood', every: 0.5, from: 8 }, surface: 'wood', target: '^step$', targetBeds: '^(hull|sails)$', secs: 16 },
  fight: { island: 'gecko_islands', coast: 0.05, surface: 'grass', fight: true, music: 'battle:sea', walk: { surface: 'grass', every: 0.45, loud: 0.8 }, target: BLOWS, secs: 16, events: fightEvents(2) },
};
const fmtSit = (r) => `${r.id.padEnd(13)} ${(r.root === '/src' ? 'now' : r.root.split('/')[2].replace('old-', '')).padEnd(8)} bed ${String(r.bedA).padStart(6)} dB(A) swing ${String(r.bedSwing).padStart(4)} oct[125..8k]${r.bedOct.map((x) => String(x).padStart(4)).join('')}  | ${r.n} targets: A-margin med ${r.marginA} min ${r.marginAmin} (small speaker ${r.marginS}), best band med ${r.best}, heard ${r.heard}% clear ${r.clear}%` +
  `${r.targetBed ? `  | boat bed over the rest: A ${r.targetBed.A} oct${r.targetBed.per.map((x) => String(x).padStart(4)).join('')}` : ''}  | voices sfx ${r.voices.sfx} amb ${r.voices.amb}, refused ${r.refused.length}${r.refused.length ? ' (' + [...new Set(r.refused)].join(',') + ')' : ''}, cut ${r.stolen.length}${r.stolen.length ? ' (' + [...new Set(r.stolen.map((s) => s.name))].join(',') + ')' : ''}, peak ${r.peak} (targets ${r.tpeak} at ${r.tpeakT}s, rest ${r.bpeak})` +
  (Object.keys(r.byName).length > 1 ? '\n' + ''.padEnd(24) + Object.entries(r.byName).map(([k, v]) => `${k} ${v.A}(${v.min})/${v.S}`).join('  ') : '');

/** One line for a described clip: colour, spikiness, events, motion, and its impact if it's one. */
const fmtRef = (r) => {
  const h = r.hit;
  const o = (a) => a.map((x) => String(x).padStart(3)).join('');
  return `${r.id.slice(0, 26).padEnd(26)} ${String(r.dur).padStart(5)}s ${String(r.levA).padStart(6)}dBA c${String(r.c).padStart(5)} cA${String(r.ca).padStart(5)} oct[63..16k]${o(r.oct)}  env p10/50/90/99 ${r.env.join('/')}  drops ${r.drops.perSec}/s(+${r.drops.prom}) patter ${r.patter.perSec}/s  modHi ${JSON.stringify(r.modHi.peaks)} swell ${r.modHi.swell}/${r.modAll.swell}dB` +
    (h ? `\n${''.padEnd(27)}HIT pkA ${r.pkA} atk ${h.attack}ms d20 ${h.d20}ms d40 ${h.d40}ms tone ${h.tone}Hz ring ${h.ring}dB | trans c${h.trans.c}${o(h.trans.oct)} | body c${h.body.c}${o(h.body.oct)} | tail c${h.tail.c}${o(h.tail.oct)}` : '');
};

export const scenarios = {
  /**
   * The mix in the situations above: how loud and what colour the beds are,
   * and whether footsteps, blows and oars stand clear of them (each target's
   * loudest moment over the bed under it, A-weighted and in its best octave),
   * whether any were refused a voice or cut short, and how many voices it took.
   *   node tools/shot.mjs mix [--only=fight,rowing] [--old=b3007a6 (a commit to compare, checked out under shots/)] [--wav]
   */
  mix: {
    path: '/package.json',
    async run(page, snap, args) {
      const { existsSync } = await import('node:fs');
      const { execSync } = await import('node:child_process');
      await openLab(page);
      const roots = ['/src'];
      for (const sha of args.old ? String(args.old).split(',') : []) {
        const dir = join(root, 'shots', 'old-' + sha);
        if (!existsSync(join(dir, 'src'))) { mkdirSync(dir, { recursive: true }); execSync(`git archive ${sha} src | tar -x -C ${dir}`, { cwd: root }); }
        roots.unshift('/shots/old-' + sha + '/src');
      }
      const only = args.only ? String(args.only).split(',') : Object.keys(SITUATIONS);
      const rows = [];
      for (const id of only) {
        for (const r of roots) {
          const res = await page.evaluate(([spec, rt, w]) => window.LAB.situation(spec, rt, w), [{ id, ...SITUATIONS[id] }, r, !!args.wav]);
          if (res.wav) { save(`mix-${id}-${r === '/src' ? 'now' : r.split('/')[2]}.wav`, res.wav); delete res.wav; }
          rows.push(res); console.log(fmtSit(res));
        }
      }
      writeFileSync(join(outDir, `mix-metrics${args.tag ? '-' + args.tag : ''}.json`), JSON.stringify(rows, null, 1));
    },
  },
  /** The limiter and clipper at the end of the chain: gain by level, and its release after a burst. */
  limiter: {
    path: '/package.json',
    async run(page) {
      await openLab(page);
      const r = await page.evaluate(() => window.LAB.limiter());
      for (const s of r.steady) console.log(`in ${String(s.amp).padStart(4)}  out peak ${String(s.peak).padStart(5)}  gain ${s.gainDb} dB`);
      console.log('a quiet tone after a 0.3 s burst (dB re its own level): ' + r.release.map(([t, l]) => `${t}s ${l}`).join('  '));
    },
  },
  /**
   * Reference recordings (fetched into shots/ref/ for study; never committed or
   * bundled) described as a listener hears them, beside our own effects and beds:
   *   node tools/shot.mjs refs [--only=rain,thunder] [--synth=punch,thunder@near] [--bed=rain:0.5]
   */
  refs: {
    path: '/package.json',
    async run(page, snap, args) {
      const { readdirSync, existsSync } = await import('node:fs');
      await openLab(page);
      const dir = join(root, 'shots', 'ref');
      const only = args.only ? String(args.only).split(',') : null;
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(mp3|ogg|wav|m4a|flac)$/i.test(f) && (!only || only.some((o) => f.startsWith(o)))).sort() : [];
      const rows = [], t = { tile: true, tileSecs: Number(args.secs || 6), tw: Number(args.tw || 330), th: Number(args.th || 120) };
      for (const f of files) {
        const r = await page.evaluate(([u, o]) => window.LAB.ref(u, { secs: 60, ...o }), ['/shots/ref/' + f, t]);
        rows.push(r); console.log(fmtRef(r));
      }
      for (const id of args.synth ? String(args.synth).split(',') : []) {
        const r = await page.evaluate(([i, o]) => window.LAB.synth(i, Math.max(3, o.tileSecs), null, o), [id, t]);
        rows.push(r); console.log(fmtRef(r));
      }
      savePng(`ref-sheet${args.tag ? '-' + args.tag : ''}.png`, await page.evaluate((c) => window.LAB.sheet(c), Number(args.cols || 4)));
      // beds: --bed="ocean:0.5,wind:0.2;hull:0.5"; rain on each surface: --rain="sea:0.3,deck:0.6,inside:0.9"
      for (const spec of args.bed ? String(args.bed).split(';') : []) {
        const levels = Object.fromEntries(spec.split(',').map((x) => { const [k, v] = x.split(':'); return [k, Number(v)]; }));
        const r = await page.evaluate(([l, o]) => window.LAB.bed(l, {}, 14, o), [levels, t]);
        delete r.wav; rows.push(r); console.log(fmtRef(r));
      }
      for (const spec of args.rain ? String(args.rain).split(',') : []) {
        const [where, r0] = spec.split(':'), rr = Number(r0);
        const r = await page.evaluate(([R, o]) => window.LAB.bed({}, {}, 16, { ...o, rain: R }), [{ r: rr, storm: rr > 0.75 ? rr : 0, where, level: 0.9 }, t]);
        delete r.wav; rows.push(r); console.log(fmtRef(r));
      }
      if (args.bed || args.rain) savePng(`ref-sheet${args.tag ? '-' + args.tag : ''}-beds.png`, await page.evaluate((c) => window.LAB.sheet(c), Number(args.cols || 4)));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, `ref-metrics${args.tag ? '-' + args.tag : ''}.json`), JSON.stringify(rows, null, 1));
    },
  },
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
