// The building blocks every effect is layered from. A Voice is one sound on
// its way to the mixer (see engine.js): its layers are scheduled at offsets
// from its start — a sharp transient to hear it land, a body with some
// weight, a tail — each a few oscillators or a stretch of filtered noise.
//
// Every frequency in a voice is scaled by its pitch jitter (`pj`), so a sound
// played twice is never quite the same sound, as nothing real ever is.

const minF = (f) => Math.max(20, Math.min(20000, f));

export class Voice {
  constructor(E, input, t0, { name = '', prio = 5, vol = 1, out = null } = {}) {
    this.E = E;
    this.c = E.ctx;
    this.in = input;
    this.t0 = t0;
    this.end = t0 + 0.05;
    this.name = name;
    this.prio = prio;
    this.vol = vol;
    this.out = out;
    this.pj = 1;
  }

  done(t) { if (t > this.end) this.end = t; }
  /** The time of an offset into the sound (never before it starts: a jittered layer can't reach back). */
  at(dt) { return this.t0 + Math.max(0, dt); }

  /** A branch of this voice panned (−1..1) and scaled — an oar on one side, a step on one foot. */
  side(pan, gain = 1) {
    const c = this.c, g = c.createGain();
    g.gain.value = gain;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.in); } else g.connect(this.in);
    return g;
  }

  /**
   * An echo off something far away (the water, a cliff): what goes into the
   * node returned comes back `time` seconds later, duller each time.
   */
  echo(time = 0.3, feedback = 0.35, lp = 1800, wet = 0.5) {
    const c = this.c, inp = c.createGain(), d = c.createDelay(Math.max(1, time + 0.1)), f = c.createBiquadFilter(), fb = c.createGain(), w = c.createGain();
    d.delayTime.value = time; f.type = 'lowpass'; f.frequency.value = lp; fb.gain.value = feedback; w.gain.value = wet;
    inp.connect(d); d.connect(f); f.connect(fb); fb.connect(d); f.connect(w); w.connect(this.in);
    // (the tail rings on till it's a thousandth of what went in)
    this.tail = Math.max(this.tail || 0, time * Math.max(1, Math.log(0.001) / Math.log(Math.max(0.05, feedback))));
    return inp;
  }

  // --------------------------------------------------------------- layers
  /**
   * Filtered noise: `color` white/pink/brown, through a `type` filter at
   * `freq` (sweeping to `sweep`), shaped by an attack, a hold and a decay.
   */
  noise(dt, dur, { color = 'white', type = 'bandpass', freq = 1000, q = 1, sweep, gain = 0.5, attack = 0.005, hold = 0, curve = 'exp', dest, rate = 1 } = {}) {
    const c = this.c, t = this.at(dt);
    const src = c.createBufferSource();
    src.buffer = this.E.noiseBuf(color);
    src.loop = true;
    if (rate !== 1) src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(minF(freq * this.pj), t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(minF(sweep * this.pj), t + dur);
    const g = c.createGain();
    env(g.gain, t, attack, hold, dur, gain, curve);
    src.connect(f); f.connect(g); g.connect(dest || this.in);
    src.start(t, Math.random() * 1.9); src.stop(t + dur + 0.05);
    this.done(t + dur + 0.05);
    return g;
  }

  /** An oscillator: `freq` gliding to `to`, an optional wobble (`vib`: rate, depth in Hz). */
  tone(dt, dur, { freq = 440, to, glide, type = 'sine', gain = 0.3, attack = 0.005, hold = 0, curve = 'exp', dest, vib, detune = 0 } = {}) {
    const c = this.c, t = this.at(dt);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(minF(freq * this.pj), t);
    if (to) o.frequency.exponentialRampToValueAtTime(minF(to * this.pj), t + (glide ?? dur));
    if (detune) o.detune.value = detune;
    if (vib) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = vib.rate; lg.gain.value = vib.depth;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const g = c.createGain();
    env(g.gain, t, attack, hold, dur, gain, curve);
    o.connect(g); g.connect(dest || this.in);
    o.start(t); o.stop(t + dur + 0.05);
    this.done(t + dur + 0.05);
    return o;
  }

  /** Struck metal: inharmonic partials over `base`, the high ones dying first. */
  ring(dt, base, dur, gain, parts = [1, 1.51, 2.29, 3.13, 4.02], { dest, spread = 0.02 } = {}) {
    parts.forEach((m, i) => this.tone(dt, dur * (1 - i * 0.12), { freq: base * m * (1 - spread / 2 + Math.random() * spread), gain: gain / (1 + i * 0.6), attack: 0.002, dest }));
  }

  /** Debris, sparks, splinters, grains: `n` tiny random pops over `dur`. */
  crackle(dt, dur, n, { freq = 3000, gain = 0.12, spread = 0.6, q = 2.2, dest, len = 0.025 } = {}) {
    for (let i = 0; i < n; i++) {
      const at = dt + Math.random() * dur, f = freq * (1 - spread / 2 + Math.random() * spread);
      this.noise(at, 0.01 + Math.random() * len, { freq: f, q, gain: gain * (0.4 + Math.random() * 0.6), attack: 0.001, dest });
    }
  }

  /** The body of a blow: a sine dropping fast from `f0` to `f1`, with a click on top. */
  thump(dt, { f0 = 150, f1 = 45, dur = 0.14, gain = 0.5, click = 0, type = 'sine', dest } = {}) {
    this.tone(dt, dur, { freq: f0, to: f1, glide: dur * 0.55, type, gain, attack: 0.002, dest });
    if (click) this.noise(dt, 0.012, { type: 'highpass', freq: 2800, q: 0.7, gain: click, attack: 0.0008, dest });
  }

  /**
   * Air moving past: band-passed noise that swells and dies (peaking `peak` of
   * the way through), its band sliding from `f0` to `f1`. `flutter` (Hz) adds
   * the flap of cloth.
   */
  whoosh(dt, dur, { f0 = 700, f1 = 2400, q = 1.2, gain = 0.15, color = 'white', peak = 0.4, flutter = 0, dest } = {}) {
    const c = this.c, t = this.at(dt);
    const src = c.createBufferSource();
    src.buffer = this.E.noiseBuf(color); src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(minF(f0 * this.pj), t);
    f.frequency.exponentialRampToValueAtTime(minF(f1 * this.pj), t + dur);
    const g = c.createGain(); g.gain.value = 0;
    const p = Math.max(0.01, dur * peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + p);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g);
    if (flutter) {
      // (cloth flaps: the level trembles)
      const m = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      m.gain.value = 0.6; lfo.type = 'triangle'; lfo.frequency.value = flutter; lg.gain.value = 0.4;
      lfo.connect(lg); lg.connect(m.gain); g.connect(m); m.connect(dest || this.in);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    } else g.connect(dest || this.in);
    src.start(t, Math.random() * 1.9); src.stop(t + dur + 0.05);
    this.done(t + dur + 0.05);
  }

  /**
   * A bubble or a drip: a pure tone rising as it dies (the Minnaert ring of a
   * pocket of air in water), `f` its pitch, `rise` how far it climbs.
   */
  bubble(dt, { f = 600, dur = 0.06, gain = 0.1, rise = 1.6, dest } = {}) {
    this.tone(dt, dur, { freq: f, to: f * rise, gain, attack: 0.0015, dest });
  }
  /** `n` bubbles over `span` seconds, around pitch `f`. */
  bubbles(dt, span, n, { f = 500, spread = 0.7, gain = 0.08, rise = 1.7, dur = 0.07, dest } = {}) {
    for (let i = 0; i < n; i++) this.bubble(dt + Math.random() * span, { f: f * (1 - spread / 2 + Math.random() * spread), dur: dur * (0.6 + Math.random() * 0.8), gain: gain * (0.4 + Math.random() * 0.6), rise: rise * (0.85 + Math.random() * 0.3), dest });
  }

  /**
   * A creak: stick-slip friction (a train of uneven clicks, `rate` to `rate1`
   * a second) ringing through the wood's resonances (`freqs`).
   */
  creak(dt, dur, { rate = 60, rate1, freqs = [250, 395, 560, 790], q = 6, gain = 0.2, attack = 0.35, dest } = {}) {
    const c = this.c, t = this.at(dt);
    const src = c.createBufferSource();
    src.buffer = this.E.creakBuf; src.loop = true;
    src.playbackRate.setValueAtTime(rate / 90, t);
    if (rate1) src.playbackRate.linearRampToValueAtTime(rate1 / 90, t + dur);
    // (the resonances pass only a sliver of each click: made up here so `gain` is about the peak heard)
    const g = c.createGain(), mk = 18;
    g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain * mk, t + dur * attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const fr of freqs) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = minF(fr * this.pj); f.Q.value = q;
      src.connect(f); f.connect(g);
    }
    g.connect(dest || this.in);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
    this.done(t + dur + 0.05);
  }

  /**
   * Electricity: a buzz that jumps about in pitch every few milliseconds
   * between `f0` and `f1`, flickering as it goes.
   */
  zap(dt, dur, { f0 = 70, f1 = 600, gain = 0.12, step = 0.012, type = 'square', hp = 300, dest } = {}) {
    const c = this.c, t = this.at(dt);
    const o = c.createOscillator(); o.type = type;
    const g = c.createGain(); g.gain.value = 0;
    const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k * step < dur; k++) {
      const at = t + k * step * (0.6 + Math.random() * 0.8);
      o.frequency.setValueAtTime(minF((f0 + Math.random() * (f1 - f0)) * this.pj), at);
      const fall = 1 - (k * step) / dur;
      g.gain.setValueAtTime(gain * fall * (Math.random() < 0.25 ? 0.15 : 0.5 + Math.random() * 0.5), at);
    }
    g.gain.setValueAtTime(gain * 0.1, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
    o.connect(h); h.connect(g); g.connect(dest || this.in);
    o.start(t); o.stop(t + dur + 0.06);
    this.done(t + dur + 0.06);
  }

  /**
   * Two-operator FM: a carrier at `freq`, bent by a modulator at `ratio` times
   * it, `index` deep, the index dying away (bright, then dull — a bell, a blade).
   */
  fm(dt, dur, { freq = 800, ratio = 1.4, index = 3, gain = 0.1, attack = 0.002, dest, indexDur } = {}) {
    const c = this.c, t = this.at(dt), f = freq * this.pj;
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = minF(f); mod.frequency.value = minF(f * ratio);
    mg.gain.setValueAtTime(index * f * ratio, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, index * f * ratio * 0.04), t + (indexDur ?? dur * 0.6));
    mod.connect(mg); mg.connect(car.frequency);
    env(g.gain, t, attack, 0, dur, gain, 'exp');
    car.connect(g); g.connect(dest || this.in);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
    this.done(t + dur + 0.05);
  }

  /** A bird's note: a quick sweep `f0` → `f1`, with a flutter of FM. */
  chirp(dt, { f0 = 3000, f1 = 4200, dur = 0.08, gain = 0.05, warble = 0, dest } = {}) {
    const c = this.c, t = this.at(dt);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(minF(f0 * this.pj), t);
    o.frequency.exponentialRampToValueAtTime(minF(f1 * this.pj), t + dur);
    if (warble) {
      const m = c.createOscillator(), mg = c.createGain();
      m.frequency.value = warble; mg.gain.value = f0 * 0.06;
      m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + dur + 0.02);
    }
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.in);
    o.start(t); o.stop(t + dur + 0.03);
    this.done(t + dur + 0.03);
  }

  /** Breath, or a voice far off: noise through two vowel formants (`f1`, `f2`), which may slide. */
  formant(dt, dur, { f1 = 700, f2 = 1200, to1, to2, q = 5, gain = 0.1, attack = 0.04, color = 'pink', dest } = {}) {
    const c = this.c, t = this.at(dt);
    const src = c.createBufferSource(); src.buffer = this.E.noiseBuf(color); src.loop = true;
    const g = c.createGain();
    env(g.gain, t, attack, 0, dur, gain, 'lin');
    for (const [a, b] of [[f1, to1], [f2, to2]]) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(minF(a * this.pj), t);
      if (b) f.frequency.exponentialRampToValueAtTime(minF(b * this.pj), t + dur);
      src.connect(f); f.connect(g);
    }
    g.connect(dest || this.in);
    src.start(t, Math.random() * 1.9); src.stop(t + dur + 0.05);
    this.done(t + dur + 0.05);
  }
}

/** An envelope on gain `p`: up in `attack` (exponential or linear), held, then down to nothing by `dur`. */
export function env(p, t, attack, hold, dur, gain, curve = 'exp') {
  const a = Math.max(0.0008, Math.min(attack, dur * 0.9));
  // (silent until it starts: a gain's default is 1, and a source starting between
  // two samples can slip one frame out before the envelope's first event — a click)
  p.value = 0;
  p.setValueAtTime(0.0001, t);
  if (curve === 'lin') p.linearRampToValueAtTime(gain, t + a);
  else p.exponentialRampToValueAtTime(Math.max(0.00011, gain), t + a);
  if (hold > 0) p.setValueAtTime(Math.max(0.00011, gain), t + a + hold);
  p.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + hold + 0.005));
}
