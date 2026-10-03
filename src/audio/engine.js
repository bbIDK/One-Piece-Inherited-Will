// The mixer: where every sound goes on its way to the speakers, and the rules
// that keep a busy fight from turning to mush. Nothing here is recorded — the
// noise the effects are carved from and the echoes they ring in are generated
// once, when the sound first comes on.
//
//   effects ── sfx bus ───────────────┐
//   beds ───── ambience bus ── shelter ┤── muffle (under water) ── clipper ── speakers
//   music ──── music bus ── duck ──────┘                              │
//   menus ──── ui bus ──────────────────────────────────────────────────┘ (never muffled)
//
// Each effect is a voice (see synth.js): a little chain of oscillators and
// filtered noise with one gain at its end. The mixer counts them, and when it
// is full a new sound either takes the place of a quieter, less important
// one (faded out over a few milliseconds, never cut) or isn't played at all.
import { Voice } from './synth.js';

// how many effects may sound at once (a phone gets fewer)
const CAP = { sfx: 26, amb: 10, ui: 6 };
const CAP_LOW = { sfx: 16, amb: 6, ui: 4 };
// the soft clipper's reach: input up to ±1.4 is rounded into ±0.98
const CLIP_HEAD = 1.4, CEIL = 0.98;

export class Engine {
  constructor(ctx, { low = false } = {}) {
    this.ctx = ctx;
    this.cap = low ? CAP_LOW : CAP;
    const c = ctx;
    // the last stop: a soft clipper that leaves everything below about 0.7
    // alone and rounds off what would otherwise clip (the shaper reads its
    // input as −1..1, so the mix goes in scaled down to its ±1.4 range)
    this.clip = c.createWaveShaper();
    this.clip.curve = softClipCurve();
    // (no oversampling here: its filter rings past the ceiling on the very peaks it's there to catch)
    this.clip.oversample = 'none';
    this.clip.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 1 / CLIP_HEAD;
    this.master.connect(this.clip);
    // under water the whole mix goes dull (see setMuffle)
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.6;
    this.muffle.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.muffle);
    // the beds have a shelter of their own: indoors, or below decks, the sea and the rain outside go muffled
    this.shelter = c.createBiquadFilter();
    this.shelter.type = 'lowpass'; this.shelter.frequency.value = 20000; this.shelter.Q.value = 0.5;
    this.shelter.connect(this.muffle);
    this.amb = c.createGain(); this.amb.connect(this.shelter);
    this.music = c.createGain();
    this.duckGain = c.createGain();
    this.music.connect(this.duckGain); this.duckGain.connect(this.muffle);
    this.ui = c.createGain(); this.ui.connect(this.master);
    this.voices = { sfx: [], amb: [], ui: [] };
    this.rr = {}; // round-robin counters by sound
    this.makeNoise();
    this.makeRooms();
  }

  now() { return this.ctx.currentTime; }

  /** Volumes from the settings: effects (and the beds with them), and music (`sec` 0: at once). */
  setVolumes(sfx, music, sec = 0.05) {
    const t = this.now();
    for (const [p, v] of [[this.sfx.gain, sfx * 0.6], [this.amb.gain, sfx * 0.55], [this.ui.gain, sfx * 0.6], [this.music.gain, music * 0.28]]) {
      if (sec > 0) ramp(p, v, t, sec); else { p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
    }
  }

  /**
   * How muffled the mix is: 0 in the open air, 1 with your head under water
   * (the low-pass sweeps down over a fifth of a second — a plunge, not a switch).
   */
  setMuffle(k, sec = 0.18) {
    const f = k <= 0.001 ? 20000 : 20000 * Math.pow(620 / 20000, Math.min(1, k));
    const p = this.muffle.frequency, t = this.now();
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.exponentialRampToValueAtTime(Math.max(60, f), t + sec);
  }

  /** Indoors (1) the beds outside go dull and the effects ring in the room a little more. */
  setShelter(k, sec = 0.6) {
    const t = this.now();
    const f = 20000 * Math.pow(700 / 20000, Math.min(1, k));
    const p = this.shelter.frequency;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.exponentialRampToValueAtTime(f, t + sec);
    ramp(this.roomRet.gain, 0.8 + 0.7 * k, t, sec);
  }

  /**
   * Duck the music under a big moment (a heavy blow, a cannon, a fanfare):
   * down by `depth` (0..1) almost at once, back over `release` seconds.
   */
  duck(depth = 0.35, hold = 0.12, release = 0.7) {
    const g = this.duckGain.gain, t = this.now();
    const to = Math.max(0.2, 1 - depth);
    // (a deeper duck already under way isn't made shallower)
    if (this.duckUntil > t && this.duckTo <= to) return;
    this.duckUntil = t + hold + release; this.duckTo = to;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + 0.03);
    g.setValueAtTime(to, t + 0.03 + hold);
    g.linearRampToValueAtTime(1, t + 0.03 + hold + release);
  }

  // ------------------------------------------------------------ the material
  /** White, pink and brown noise: two seconds of each, a different stretch read every time. */
  makeNoise() {
    const c = this.ctx, n = Math.floor(c.sampleRate * 2);
    const mk = () => c.createBuffer(1, n, c.sampleRate);
    this.white = mk(); this.pink = mk(); this.brown = mk();
    const w = this.white.getChannelData(0), p = this.pink.getChannelData(0), b = this.brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      // (Paul Kellet's pink filter: equal energy per octave, the sound of surf and rain)
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      // (brown: the rumble under thunder, a torrent, the deep sea)
      br = (br + 0.02 * x) / 1.02; b[i] = br * 3.5;
    }
    // (the buffers loop for the beds: fade the seam so it never clicks)
    for (const d of [w, p, b]) for (let i = 0; i < 256; i++) { const k = i / 256; d[n - 1 - i] = d[n - 1 - i] * k + d[i] * (1 - k); }
    // stick-slip friction for creaks: a train of clicks a little uneven in time
    // and strength (played back faster or slower for the pitch of the groan)
    const cn = Math.floor(c.sampleRate * 1.5);
    this.creakBuf = c.createBuffer(1, cn, c.sampleRate);
    const cd = this.creakBuf.getChannelData(0);
    for (let i = 0; i < cn;) {
      const amp = 0.4 + Math.random() * 0.6;
      for (let j = 0; j < 24 && i + j < cn; j++) cd[i + j] = amp * Math.exp(-j / 5) * (j % 2 ? -1 : 1) * (1 - j / 24);
      i += Math.floor(c.sampleRate / 90 * (0.7 + Math.random() * 0.6));
    }
  }
  noiseBuf(color) { return color === 'pink' ? this.pink : color === 'brown' ? this.brown : this.white; }

  /** The rooms sounds ring in: a short dark one for the effects, a long hall for the music. */
  makeRooms() {
    const c = this.ctx;
    // a short, dark room: decaying noise, a little different in each ear
    this.room = c.createConvolver();
    this.room.buffer = impulse(c, 1.6, (t) => Math.exp(-t / 0.32) * (t < 0.012 ? t / 0.012 : 1));
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    this.roomRet = c.createGain(); this.roomRet.gain.value = 1;
    this.room.connect(lp); lp.connect(this.roomRet); this.roomRet.connect(this.sfx);
    // the music's hall (as it always was: three seconds of soft tail)
    this.hall = c.createConvolver();
    const len = 3.2;
    this.hall.buffer = impulse(c, len, (t) => Math.pow(1 - t / len, 3.2) * (t * c.sampleRate < 80 ? (t * c.sampleRate) / 80 : 1));
    const wet = c.createGain(); wet.gain.value = 0.42;
    this.hall.connect(wet); wet.connect(this.music);
    this.clipCurve = drive();
  }

  // ------------------------------------------------------------ voices
  /**
   * A new voice on `bus` ('sfx', 'amb' or 'ui'): `vol` its level, `pan` −1..1,
   * `lp` a low-pass for a sound far off (the air takes the top off it), `send`
   * how much rings in the room, `drive` grit through the soft clipper. `prio`
   * says how much it matters (a blow on you beats one across the harbour) and
   * `max` how many of the same sound may overlap. Null: the mix is full.
   */
  open(name, { bus = 'sfx', vol = 1, pan = 0, lp = 0, send = 0, drive: drv = 0, prio = 5, max = 4, at = null } = {}) {
    const c = this.ctx, t = at ?? this.now();
    const list = this.voices[bus];
    // (forget the ones that have finished)
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end < t) list.splice(i, 1);
    let same = 0, oldest = null;
    for (const v of list) if (v.name === name) { same++; if (!oldest || v.t0 < oldest.t0) oldest = v; }
    if (same >= max && oldest) this.steal(oldest, t, list);
    if (list.length >= this.cap[bus]) {
      // the least important (and, among equals, the quietest) makes way — or the new one isn't heard
      let worst = null;
      for (const v of list) if (!worst || v.prio < worst.prio || (v.prio === worst.prio && v.vol < worst.vol)) worst = v;
      if (!worst || worst.prio > prio || (worst.prio === prio && worst.vol > vol)) return null;
      this.steal(worst, t, list);
    }
    const out = c.createGain();
    out.gain.value = vol;
    let tail = out;
    if (lp > 0 && lp < 18000) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5;
      tail.connect(f); tail = f;
    }
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(p); tail = p;
    }
    tail.connect(this[bus]);
    if (send > 0 && bus !== 'ui') { const s = c.createGain(); s.gain.value = send; out.connect(s); s.connect(this.room); }
    let input = out;
    if (drv > 0) {
      // (driven hard into the clipper, a blow lands at full weight: the soft
      // clipper at the end of the chain rounds off a pile-up of them)
      const pre = c.createGain(); pre.gain.value = 1 + drv;
      const ws = c.createWaveShaper(); ws.curve = this.clipCurve; ws.oversample = '2x';
      pre.connect(ws); ws.connect(out);
      input = pre;
    }
    const v = new Voice(this, input, t, { name, prio, vol, out });
    list.push(v);
    return v;
  }

  /** Fade a voice out in a few milliseconds (no click) and let it go. */
  steal(v, t, list) {
    const g = v.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.012);
    v.end = t;
    const i = list.indexOf(v);
    if (i >= 0) list.splice(i, 1);
  }

  /**
   * Run `fn` once `sec` more seconds of sound have played (letting go of a
   * faded deck's nodes). An offline render (the audio checks) runs ahead of
   * the wall clock, so there the tidying is left to the end of the render.
   */
  later(fn, sec) {
    if (this.offline) return;
    setTimeout(fn, Math.max(0, sec) * 1000);
  }

  /** The next of `n` variants of a sound, never the one just played. */
  variant(name, n) {
    if (n <= 1) return 0;
    const last = this.rr[name] ?? -1;
    let k = Math.floor(Math.random() * (n - 1));
    if (k >= last) k++;
    this.rr[name] = k;
    return k;
  }

  /** How many voices are sounding now (for the tests and the debug overlay). */
  count(bus = 'sfx') {
    const t = this.now();
    return this.voices[bus].filter((v) => v.end >= t).length;
  }
}

/** Ramp an AudioParam from where it is to `v` over `sec` (never a jump: no clicks). */
export function ramp(p, v, t, sec) {
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(v, t + Math.max(0.005, sec));
}

/** A stereo impulse response: noise shaped by `env(t)` (a little different in each ear). */
function impulse(c, sec, env) {
  const len = Math.floor(c.sampleRate * sec), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * env(i / c.sampleRate);
  }
  return ir;
}

/** The soft clipper at the end of the chain: straight up to 0.7, then rounded off towards 1. */
function softClipCurve() {
  const n = 4096, curve = new Float32Array(n), k = 0.7;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * CLIP_HEAD, a = Math.abs(x);
    curve[i] = a <= k ? x : Math.sign(x) * (k + (CEIL - k) * Math.tanh((a - k) / (CEIL - k)));
  }
  return curve;
}

/** Grit for an impact: a tanh soft clip. */
function drive() {
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); }
  return curve;
}
