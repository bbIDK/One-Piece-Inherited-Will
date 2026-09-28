// Procedural audio: every sound effect is synthesised with WebAudio, and the
// music is composed on the fly — calm pieces with quiet between them (no
// recorded assets).
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuf = null;
    this.theme = null;
    this.last = {};
    const unlock = () => { this.init(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfxGain = c.createGain(); this.sfxGain.connect(this.master);
    this.musicGain = c.createGain(); this.musicGain.connect(this.master);
    const len = c.sampleRate * 1.5;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.apply(this.settings);
    this.scheduler = setInterval(() => this.schedule(), 60);
  }

  apply(s) {
    this.settings = s;
    if (!this.ctx) return;
    this.sfxGain.gain.value = s.volume * 0.6;
    this.musicGain.gain.value = s.music * 0.28;
  }

  // ---------------------------------------------------------------- sfx
  // Every effect is a few layers built from the pieces below, in the loud,
  // snappy spirit of an anime fight: a sharp transient to hear it land, a
  // body with some weight (pushed through a soft clipper for grit), and a
  // tail — metal ringing, debris crackling, a touch of shared room echo —
  // each a little different every time.

  /** The echo send and the soft clipper, made once. */
  fxBus() {
    if (this.verb) return;
    const c = this.ctx;
    // a short, dark room: two seconds of decaying noise, a little different in each ear
    const len = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.32) * (t < 0.012 ? t / 0.012 : 1); }
    }
    this.verb = c.createConvolver();
    this.verb.buffer = ir;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    this.verb.connect(lp); lp.connect(this.sfxGain);
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6) / Math.tanh(2.6); }
    this.clipCurve = curve;
  }
  /** Where a sound goes: `out` (its level, and how far off it is), echo `send`, and grit (`drive`). */
  route(out, { send = 0, drive = 0 } = {}) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = out;
    g.connect(this.sfxGain);
    if (send > 0) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.verb); }
    if (!drive) return g;
    const pre = c.createGain(); pre.gain.value = 1 + drive;
    const ws = c.createWaveShaper(); ws.curve = this.clipCurve; ws.oversample = '2x';
    pre.connect(ws); ws.connect(g);
    return pre;
  }
  noise(t, dur, { freq = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, sweep, dest } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone(t, dur, { freq = 440, to, type = 'sine', gain = 0.3, attack = 0.005, dest, vib } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    if (vib) {
      // a wobble in the pitch (rubber, poison, the wail of a Sea King)
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = vib.rate; lg.gain.value = vib.depth;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  /** Struck metal: inharmonic partials over `base`, each dying away at its own pace. */
  ring(t, base, dur, gain, dest, parts = [1, 1.51, 2.29, 3.13, 4.02]) {
    parts.forEach((m, i) => this.tone(t, dur * (1 - i * 0.12), { freq: base * m * (0.99 + Math.random() * 0.02), type: 'sine', gain: gain / (1 + i * 0.6), attack: 0.002, dest }));
  }
  /** Debris, sparks, splinters, bubbles: `n` tiny random pops over `dur`. */
  crackle(t, dur, n, { freq = 3000, gain = 0.12, spread = 0.6, dest } = {}) {
    for (let i = 0; i < n; i++) {
      const at = t + Math.random() * dur, f = freq * (1 - spread / 2 + Math.random() * spread);
      this.noise(at, 0.012 + Math.random() * 0.025, { freq: f, q: 2.2, gain: gain * (0.4 + Math.random() * 0.6), attack: 0.001, dest });
    }
  }

  /**
   * Play an effect. `at`: where it happens ({ x, y }); a hit across the
   * harbour is quieter than one in your face, and one out of earshot silent.
   */
  sfx(name, at = null) {
    if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.ctx.resume(); return; }
    this.fxBus();
    const t = this.ctx.currentTime;
    let vol = 1;
    if (at && this.ear) {
      const e = this.ear();
      if (e) {
        const d = Math.hypot(this.dxOf ? this.dxOf(e.x, at.x) : at.x - e.x, at.y - e.y);
        if (d > 70) return;
        vol = 1 / (1 + Math.max(0, d - 4) / 10);
      }
    }
    // rate-limit spammy sounds
    const lim = { punch: 0.04, punch_heavy: 0.06, slash_hit: 0.04, slash_heavy: 0.06, block: 0.05, whoosh: 0.05, splash: 0.2, splash_big: 0.3, wade: 0.2, choke: 0.5, gasp: 1, thunder_small: 0.15, lightning: 0.12, coin: 0.05, fire: 0.08, water: 0.08, step: 0.08, bite: 0.2 }[name] ?? 0.02;
    if (this.last[name] && t - this.last[name] < lim) return;
    this.last[name] = t;
    const r = () => 0.92 + Math.random() * 0.16;
    const R = (o = {}) => this.route(vol, o);
    let d;
    switch (name) {
      // ---- the fight
      case 'whoosh': d = R({ send: 0.05 }); this.noise(t, 0.17, { freq: 700 * r(), q: 1.3, gain: 0.16, sweep: 2600, dest: d }); this.noise(t + 0.06, 0.1, { freq: 2400, q: 1, gain: 0.06, sweep: 900, dest: d }); break;
      case 'punch': // a hard, snappy THWACK
        d = R({ send: 0.06, drive: 2.2 });
        this.noise(t, 0.016, { freq: 3200 * r(), q: 0.7, type: 'highpass', gain: 0.35, attack: 0.001, dest: d });
        this.tone(t, 0.13, { freq: 165 * r(), to: 48, gain: 0.55, attack: 0.002, dest: d });
        this.noise(t, 0.075, { freq: 1100 * r(), q: 1.3, gain: 0.32, attack: 0.002, dest: d });
        break;
      case 'punch_heavy': // DOGOOM: the ground shakes
        d = R({ send: 0.16, drive: 3.2 });
        this.noise(t, 0.022, { freq: 2600, q: 0.6, type: 'highpass', gain: 0.4, attack: 0.001, dest: d });
        this.tone(t, 0.3, { freq: 120 * r(), to: 32, gain: 0.75, attack: 0.002, dest: d });
        this.noise(t, 0.28, { freq: 520, q: 0.8, type: 'lowpass', gain: 0.45, sweep: 110, dest: d });
        this.noise(t + 0.01, 0.1, { freq: 900, q: 1.1, gain: 0.25, dest: d });
        break;
      case 'slash_hit': // SHING — a clean cut, and the blade singing after it
        d = R({ send: 0.12, drive: 0.8 });
        this.noise(t, 0.09, { freq: 5200 * r(), q: 0.8, type: 'highpass', gain: 0.34, attack: 0.001, sweep: 2600, dest: d });
        this.tone(t, 0.1, { freq: 200, to: 70, gain: 0.3, dest: d });
        this.ring(t + 0.005, 1480 * r(), 0.38, 0.07, d);
        break;
      case 'slash_heavy':
        d = R({ send: 0.2, drive: 1.6 });
        this.noise(t, 0.16, { freq: 4200 * r(), q: 0.7, type: 'highpass', gain: 0.42, attack: 0.001, sweep: 1800, dest: d });
        this.tone(t, 0.24, { freq: 140, to: 40, gain: 0.55, dest: d });
        this.ring(t + 0.01, 1180 * r(), 0.6, 0.09, d);
        break;
      case 'block': d = R({ send: 0.05, drive: 0.6 }); this.noise(t, 0.06, { freq: 620 * r(), q: 2, gain: 0.35, attack: 0.001, dest: d }); this.tone(t, 0.09, { freq: 125, to: 70, gain: 0.28, dest: d }); this.ring(t, 900 * r(), 0.16, 0.035, d, [1, 2.1]); break;
      case 'parry': // KIIN! steel on steel
        d = R({ send: 0.35 });
        this.noise(t, 0.03, { freq: 4000, q: 0.6, type: 'highpass', gain: 0.35, attack: 0.001, dest: d });
        this.ring(t, 1320 * r(), 0.95, 0.14, d, [1, 1.5, 2.25, 3.14, 3.96]);
        this.tone(t + 0.01, 0.4, { freq: 2640, to: 2900, type: 'triangle', gain: 0.05, dest: d });
        break;
      case 'guardbreak': d = R({ send: 0.15, drive: 2.5 }); this.noise(t, 0.26, { freq: 480, type: 'lowpass', gain: 0.5, dest: d }); this.tone(t, 0.32, { freq: 260, to: 65, type: 'sawtooth', gain: 0.3, dest: d }); this.ring(t, 700, 0.3, 0.05, d, [1, 1.7, 2.6]); break;
      case 'dodge': d = R({ send: 0.04 }); this.noise(t, 0.15, { freq: 1200 * r(), q: 0.9, gain: 0.13, sweep: 3200, dest: d }); break;
      case 'ko': // DOON — down and out
        d = R({ send: 0.25, drive: 2 });
        this.tone(t, 0.55, { freq: 95, to: 30, gain: 0.7, dest: d });
        this.noise(t, 0.4, { freq: 380, type: 'lowpass', gain: 0.35, sweep: 90, dest: d });
        this.crackle(t + 0.05, 0.25, 6, { freq: 900, gain: 0.08, dest: d });
        break;
      case 'knocked': d = R({ send: 0.3 }); this.tone(t, 0.95, { freq: 330, to: 105, type: 'sawtooth', gain: 0.1, vib: { rate: 5, depth: 14 }, dest: d }); this.tone(t, 0.9, { freq: 165, to: 52, gain: 0.14, dest: d }); break;
      case 'getup': d = R({ send: 0.25 }); [392, 523, 659].forEach((f, i) => this.tone(t + i * 0.08, 0.28, { freq: f, type: 'triangle', gain: 0.12, dest: d })); break;
      case 'death': d = R({ send: 0.45 }); [330, 311, 294, 220].forEach((f, i) => this.tone(t + i * 0.26, 0.6, { freq: f, type: 'triangle', gain: 0.18, dest: d })); break;
      case 'haki': // Armament: a dark, heavy surge of will
        d = R({ send: 0.3, drive: 2.4 });
        this.tone(t, 0.5, { freq: 62, to: 124, type: 'sawtooth', gain: 0.2, attack: 0.03, dest: d });
        this.tone(t, 0.45, { freq: 46, to: 38, gain: 0.35, attack: 0.02, dest: d });
        this.crackle(t + 0.05, 0.35, 8, { freq: 2400, gain: 0.06, dest: d });
        break;
      case 'haki_obs': d = R({ send: 0.5 }); this.tone(t, 0.7, { freq: 880, to: 1320, gain: 0.1, attack: 0.04, dest: d }); this.tone(t + 0.05, 0.6, { freq: 1760, to: 2200, gain: 0.04, attack: 0.05, dest: d }); break;
      // ---- the elements (a Devil Fruit's blows sound like what they're made of)
      case 'fire': d = R({ send: 0.15, drive: 0.8 }); this.noise(t, 0.45, { freq: 1300 * r(), q: 0.5, type: 'lowpass', gain: 0.4, attack: 0.02, sweep: 380, dest: d }); this.crackle(t, 0.4, 10, { freq: 2600, gain: 0.07, dest: d }); break;
      case 'magma': d = R({ send: 0.2, drive: 2 }); this.tone(t, 0.5, { freq: 70, to: 36, gain: 0.5, dest: d }); this.noise(t, 0.6, { freq: 700, type: 'lowpass', gain: 0.45, attack: 0.03, sweep: 150, dest: d }); this.crackle(t + 0.05, 0.5, 12, { freq: 1500, gain: 0.08, dest: d }); break;
      case 'ice': d = R({ send: 0.3 }); this.noise(t, 0.08, { freq: 5000, type: 'highpass', gain: 0.28, attack: 0.001, dest: d }); this.ring(t, 2400 * r(), 0.45, 0.06, d, [1, 1.34, 1.87, 2.51]); this.crackle(t, 0.15, 6, { freq: 6000, gain: 0.07, dest: d }); break;
      case 'snow': d = R({ send: 0.25 }); this.noise(t, 0.2, { freq: 3000, q: 0.5, gain: 0.14, attack: 0.01, sweep: 1200, dest: d }); this.ring(t, 3100, 0.3, 0.025, d, [1, 1.5]); break;
      case 'lightning': case 'thunder_small': // BZZT — a crack of static
        d = R({ send: 0.2, drive: 1.8 });
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.025, 0.04, { freq: 1600 + Math.random() * 2800, type: 'square', gain: 0.07, attack: 0.001, dest: d });
        this.noise(t, 0.35, { freq: 2800, gain: 0.3, attack: 0.002, sweep: 400, dest: d });
        this.tone(t, 0.3, { freq: 62, gain: 0.3, dest: d });
        break;
      case 'water': d = R({ send: 0.12 }); this.noise(t, 0.32, { freq: 950 * r(), q: 0.6, type: 'lowpass', gain: 0.35, sweep: 280, dest: d }); for (let i = 0; i < 3; i++) this.tone(t + 0.04 + i * 0.05, 0.07, { freq: 300 + Math.random() * 250, to: 700, gain: 0.07, dest: d }); break;
      case 'swamp': d = R({ send: 0.1 }); for (let i = 0; i < 5; i++) this.tone(t + i * 0.07, 0.1, { freq: 110 + Math.random() * 90, to: 260, gain: 0.12, dest: d }); this.noise(t, 0.4, { freq: 300, type: 'lowpass', gain: 0.2, dest: d }); break;
      case 'poison': d = R({ send: 0.12 }); this.noise(t, 0.5, { freq: 6000, q: 0.5, type: 'highpass', gain: 0.1, attack: 0.02, dest: d }); this.tone(t, 0.45, { freq: 180, to: 120, type: 'sawtooth', gain: 0.07, vib: { rate: 9, depth: 18 }, dest: d }); break;
      case 'gas': d = R({ send: 0.1 }); this.noise(t, 0.55, { freq: 4500, q: 0.4, type: 'highpass', gain: 0.12, attack: 0.05, sweep: 2500, dest: d }); break;
      case 'smoke': d = R({ send: 0.15 }); this.noise(t, 0.4, { freq: 650 * r(), q: 0.5, type: 'lowpass', gain: 0.3, attack: 0.03, sweep: 220, dest: d }); break;
      case 'sand': d = R({ send: 0.1 }); this.noise(t, 0.42, { freq: 1900 * r(), q: 0.45, gain: 0.22, attack: 0.02, sweep: 900, dest: d }); this.crackle(t, 0.4, 14, { freq: 4200, gain: 0.05, dest: d }); break;
      case 'light': d = R({ send: 0.45 }); this.tone(t, 0.3, { freq: 1760, to: 3520, gain: 0.12, attack: 0.002, dest: d }); this.ring(t + 0.03, 2640, 0.55, 0.035, d, [1, 1.5, 2]); break;
      case 'dark': d = R({ send: 0.3, drive: 1.5 }); this.noise(t, 0.35, { freq: 380, type: 'lowpass', gain: 0.4, attack: 0.25, dest: d }); this.tone(t, 0.45, { freq: 55, to: 30, gain: 0.45, attack: 0.2, dest: d }); break;
      case 'quake': d = R({ send: 0.3, drive: 2.5 }); this.tone(t, 0.9, { freq: 48, to: 30, gain: 0.7, vib: { rate: 14, depth: 6 }, dest: d }); this.noise(t, 0.9, { freq: 300, type: 'lowpass', gain: 0.5, dest: d }); this.crackle(t + 0.1, 0.7, 10, { freq: 800, gain: 0.1, dest: d }); break;
      case 'string': d = R({ send: 0.15 }); this.tone(t, 0.35, { freq: 440 * r(), to: 400, type: 'sawtooth', gain: 0.1, attack: 0.001, dest: d }); this.noise(t, 0.05, { freq: 3000, gain: 0.15, dest: d }); break;
      case 'explosion': // DOKAAN
        d = R({ send: 0.35, drive: 3 });
        this.noise(t, 0.05, { freq: 1500, type: 'highpass', gain: 0.5, attack: 0.001, dest: d });
        this.tone(t, 0.9, { freq: 72, to: 26, gain: 0.85, dest: d });
        this.noise(t, 1.1, { freq: 900, type: 'lowpass', gain: 0.7, sweep: 55, dest: d });
        this.crackle(t + 0.08, 0.7, 16, { freq: 1800, gain: 0.1, dest: d });
        break;
      case 'cannon': // BOOM — and the echo off the water
        d = R({ send: 0.45, drive: 2.6 });
        this.noise(t, 0.04, { freq: 1600, type: 'highpass', gain: 0.5, attack: 0.001, dest: d });
        this.tone(t, 0.8, { freq: 88, to: 30, gain: 0.85, dest: d });
        this.noise(t, 1.3, { freq: 600, type: 'lowpass', gain: 0.55, sweep: 60, dest: d });
        break;
      case 'crash': d = R({ send: 0.2, drive: 1.5 }); this.noise(t, 0.5, { freq: 320, type: 'lowpass', gain: 0.55, dest: d }); this.tone(t, 0.3, { freq: 100, to: 45, gain: 0.4, dest: d }); this.crackle(t, 0.45, 14, { freq: 1300, gain: 0.12, dest: d }); break;
      case 'thunder': d = R({ send: 0.4, drive: 1 }); this.noise(t, 0.12, { freq: 3000, gain: 0.35, attack: 0.002, sweep: 900, dest: d }); this.noise(t + 0.05, 2.3, { freq: 220, gain: 0.7, type: 'lowpass', attack: 0.03, sweep: 40, dest: d }); break;
      // ---- moving about
      case 'splash': this.noise(t, 0.4, { freq: 700, q: 0.5, gain: 0.3, type: 'lowpass', sweep: 200, dest: R({ send: 0.08 }) }); break;
      case 'splash_big': d = R({ send: 0.15 }); this.noise(t, 0.75, { freq: 950, q: 0.4, gain: 0.45, type: 'lowpass', sweep: 140, dest: d }); this.tone(t, 0.3, { freq: 90, to: 42, gain: 0.3, dest: d }); this.noise(t + 0.05, 0.4, { freq: 2600, q: 0.6, gain: 0.1, sweep: 900, dest: d }); break;
      case 'splash_out': d = R(); this.noise(t, 0.35, { freq: 1300, q: 0.5, gain: 0.26, sweep: 420, dest: d }); this.tone(t + 0.04, 0.12, { freq: 300, to: 620, gain: 0.08, dest: d }); break;
      case 'wade': this.noise(t, 0.2, { freq: 1400 * r(), q: 0.8, gain: 0.06, sweep: 600, dest: R() }); break;
      case 'jump': this.noise(t, 0.12, { freq: 1100 * r(), q: 0.7, gain: 0.08, sweep: 2400, dest: R() }); break;
      case 'jump_big': d = R({ send: 0.08 }); this.tone(t, 0.18, { freq: 120, to: 60, gain: 0.25, dest: d }); this.noise(t, 0.32, { freq: 900, q: 0.6, gain: 0.15, sweep: 3200, dest: d }); break;
      case 'land_heavy': d = R({ send: 0.1, drive: 1.4 }); this.noise(t, 0.18, { freq: 260, gain: 0.45, type: 'lowpass', dest: d }); this.tone(t, 0.16, { freq: 110, to: 48, gain: 0.35, dest: d }); break;
      // breaking the surface out of breath: a long gulp of air
      case 'gasp': d = R(); this.noise(t, 0.5, { freq: 800, q: 0.9, gain: 0.2, attack: 0.1, sweep: 2300, dest: d }); this.noise(t + 0.55, 0.3, { freq: 600, q: 0.7, gain: 0.08, attack: 0.05, sweep: 300, dest: d }); break;
      // out of air under water: the last bubbles gurgling out
      case 'choke': d = R(); for (let i = 0; i < 5; i++) this.tone(t + i * 0.07 * r(), 0.08, { freq: 170 + Math.random() * 140, to: 420 + Math.random() * 200, gain: 0.13, dest: d }); this.noise(t, 0.35, { freq: 380, gain: 0.12, type: 'lowpass', dest: d }); break;
      case 'board': case 'step': d = R(); this.noise(t, 0.1, { freq: 280 * r(), q: 1.2, gain: 0.22, attack: 0.002, dest: d }); this.tone(t, 0.07, { freq: 140, to: 90, gain: 0.1, dest: d }); break;
      // ---- doors, loot and the like
      case 'knock': d = R({ send: 0.12 }); [0, 0.17, 0.34].forEach((k) => { this.noise(t + k, 0.07, { freq: 260 * r(), q: 1.6, gain: 0.55, dest: d }); this.tone(t + k, 0.08, { freq: 130, to: 80, gain: 0.25, dest: d }); }); break;
      case 'door': // the latch clicks, the hinge creaks
        d = R({ send: 0.1 });
        this.noise(t, 0.03, { freq: 2600, q: 2, gain: 0.18, attack: 0.001, dest: d });
        this.tone(t + 0.04, 0.42, { freq: 170 * r(), to: 250, type: 'sawtooth', gain: 0.05, attack: 0.06, vib: { rate: 22, depth: 18 }, dest: d });
        this.noise(t + 0.04, 0.3, { freq: 900, q: 0.6, gain: 0.08, dest: d });
        break;
      case 'doorshut': d = R({ send: 0.12 }); this.noise(t, 0.12, { freq: 220, gain: 0.35, type: 'lowpass', dest: d }); this.tone(t, 0.12, { freq: 95, to: 60, gain: 0.3, dest: d }); break;
      case 'doorbreak': d = R({ send: 0.2, drive: 2 }); this.noise(t, 0.6, { freq: 320, gain: 0.7, type: 'lowpass', dest: d }); this.noise(t, 0.35, { freq: 2600, gain: 0.3, sweep: 700, dest: d }); this.tone(t, 0.3, { freq: 110, to: 45, gain: 0.5, dest: d }); this.crackle(t, 0.4, 12, { freq: 1500, gain: 0.12, dest: d }); break;
      case 'coin': d = R({ send: 0.15 }); this.ring(t, 1568, 0.18, 0.07, d, [1, 2.76]); this.ring(t + 0.07, 2093, 0.3, 0.07, d, [1, 2.76]); break;
      case 'treasure': d = R({ send: 0.3 }); [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 0.35, { freq: f, type: 'triangle', gain: 0.14, dest: d })); this.ring(t + 0.36, 2093, 0.5, 0.04, d, [1, 2.76, 5.4]); break;
      case 'bell': this.ring(t, 196, 3.2, 0.2, R({ send: 0.5 }), [0.5, 1, 1.2, 1.5, 2, 2.6, 3.0]); break;
      case 'eat': d = R(); this.noise(t, 0.08, { freq: 900, gain: 0.2, dest: d }); this.noise(t + 0.12, 0.08, { freq: 800, gain: 0.2, dest: d }); this.tone(t + 0.26, 0.12, { freq: 220, to: 160, gain: 0.08, dest: d }); break;
      case 'bite': // CHOMP: teeth through something crisp, a little crunch after
        d = R({ send: 0.03 });
        this.noise(t, 0.05, { freq: 1800 * r(), q: 1.4, gain: 0.22, attack: 0.002, dest: d });
        this.crackle(t + 0.02, 0.12, 5, { freq: 2600, gain: 0.07, dest: d });
        this.tone(t, 0.07, { freq: 150 * r(), to: 90, gain: 0.12, dest: d });
        break;
      case 'equip': d = R({ send: 0.08 }); this.noise(t, 0.03, { freq: 3500, q: 1.5, gain: 0.2, attack: 0.001, dest: d }); this.ring(t + 0.01, 1900, 0.18, 0.05, d, [1, 1.6]); break;
      case 'page': this.noise(t, 0.2, { freq: 3000, q: 0.5, gain: 0.08, dest: R() }); break;
      case 'reveal': d = R({ send: 0.3 }); [392, 494, 587].forEach((f, i) => this.tone(t + i * 0.1, 0.4, { freq: f, type: 'triangle', gain: 0.16, dest: d })); break;
      case 'fanfare': // ta-ta-ta-DAAA: a brassy run up to a held chord
        d = R({ send: 0.35, drive: 0.4 });
        [523, 659, 784, 1046].forEach((f, i) => { this.tone(t + i * 0.1, 0.24, { freq: f, type: 'sawtooth', gain: 0.06, dest: d }); this.tone(t + i * 0.1, 0.24, { freq: f, type: 'triangle', gain: 0.12, dest: d }); });
        [523, 659, 784, 1046].forEach((f) => this.tone(t + 0.42, 0.95, { freq: f, type: 'triangle', gain: 0.065, attack: 0.02, dest: d }));
        this.ring(t + 0.42, 2093, 0.6, 0.03, d, [1, 2.76]);
        break;
      case 'breakthrough': d = R({ send: 0.35, drive: 0.6 }); [440, 554, 659, 880].forEach((f, i) => this.tone(t + i * 0.07, 0.45, { freq: f, type: 'sawtooth', gain: 0.06, dest: d })); this.tone(t, 0.6, { freq: 55, to: 110, gain: 0.2, dest: d }); break;
      case 'seaking': d = R({ send: 0.5, drive: 1.5 }); this.tone(t, 1.8, { freq: 72, to: 44, type: 'sawtooth', gain: 0.3, attack: 0.3, vib: { rate: 3, depth: 4 }, dest: d }); this.noise(t, 1.6, { freq: 250, gain: 0.3, type: 'lowpass', dest: d }); break;
      default: this.noise(t, 0.05, { freq: 1500, gain: 0.05, dest: R() });
    }
  }

  // --------------------------------------------------------------- music
  // Calm, generative music in the spirit of a Minecraft soundtrack with a One
  // Piece heart: a reverb-soaked piano, soft pads, and a flute, accordion or
  // music-box melody in lilting sea-shanty rhythms. Each piece is composed on
  // the spot from a theme (key, mode, chords, feel, instruments) — a motif
  // stated, answered, varied and brought back — and plays for a minute or two;
  // then there is quiet for a while before the next. Fights get a driving
  // theme of their own with no gaps.
  music(theme) {
    if (this.theme === theme) return;
    const prev = this.theme;
    this.theme = theme;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.fadeSong(prev ? 1.6 : 0.2);
    const T = SONGS[theme];
    // straight into a fight; otherwise a breath before the new mood begins
    this.restUntil = now + (!T ? 0 : T.rest[0] === 0 ? 0.05 : prev ? 2.5 : 0.8);
    this.song = null;
  }

  fadeSong(sec) {
    const b = this.songBus;
    if (!b) return;
    const now = this.ctx.currentTime;
    b.gain.cancelScheduledValues(now);
    b.gain.setValueAtTime(b.gain.value, now);
    b.gain.linearRampToValueAtTime(0.0001, now + sec);
    setTimeout(() => { try { b.disconnect(); } catch { /* gone */ } }, (sec + 6) * 1000);
    this.songBus = null;
  }

  /** The reverb (a generated hall impulse) the music sits in. */
  reverb() {
    if (this.verb) return this.verb;
    const c = this.ctx, len = Math.floor(c.sampleRate * 3.2);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 80 ? i / 80 : 1); }
    }
    const conv = c.createConvolver();
    conv.buffer = ir;
    const wet = c.createGain(); wet.gain.value = 0.42;
    conv.connect(wet); wet.connect(this.musicGain);
    this.verb = conv;
    return conv;
  }

  schedule() {
    if (!this.ctx || !this.theme || this.ctx.state !== 'running') return;
    const T = SONGS[this.theme];
    if (!T) return;
    const now = this.ctx.currentTime;
    if (!this.song) {
      if (now < (this.restUntil || 0)) return;
      this.song = compose(T);
      const bus = this.ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.linearRampToValueAtTime(2.2, now + 1.2);
      bus.connect(this.musicGain);
      bus.connect(this.reverb());
      this.songBus = bus;
      this.songT = now + 0.15;
      this.bar = 0;
    }
    while (this.songT < now + 0.5) {
      const S = this.song;
      if (this.bar >= S.bars) {
        // the piece ends; quiet for a while before the next
        this.song = null;
        this.fadeSong(4);
        this.restUntil = now + T.rest[0] + Math.random() * (T.rest[1] - T.rest[0]);
        return;
      }
      this.playBar(S, this.bar, this.songT);
      this.songT += S.barDur;
      this.bar++;
    }
  }

  playBar(S, bar, t0) {
    const T = S.T, e = S.eighth, n = S.perBar;
    const chord = S.chords[bar % S.chords.length];
    const bus = this.songBus;
    if (!bus) return;
    const last = bar >= S.bars - 2;
    // pad: the chord, swelling slowly
    if (T.pad) {
      const notes = chord.map((d) => S.midi(d, -1));
      for (const m of notes) this.inst('pad', t0, S.barDur * 1.05, m, T.padVol ?? 0.018, bus);
    }
    // bass / left hand: the root on the downbeat, the fifth mid-bar
    if (T.bass) this.inst(T.bass, t0, e * n * 0.9, S.midi(chord[0], -2), 0.09, bus);
    // arpeggio
    if (T.arp) {
      const pat = S.arpPat;
      for (let i = 0; i < n; i++) {
        const k = pat[i % pat.length];
        if (k === null || (i > 0 && Math.random() > T.arpDensity)) continue;
        const d = k < 3 ? chord[k] : chord[k - 3] + 7;
        this.inst(T.arp, t0 + i * e * (T.feel === 'lilt' && i % 3 === 2 ? 1.04 : 1), e * 3, S.midi(d, T.arpOct ?? -1), (i === 0 ? 0.085 : 0.06) * (T.arpVol ?? 1), bus);
      }
    }
    // melody: phrase by phrase, from the piece's motifs
    const ph = S.phrases[Math.floor(bar / 2) % S.phrases.length];
    if (ph && !last) {
      const half = bar % 2;
      let pos = 0;
      for (const note of ph) {
        const len = Math.abs(note.len);
        const start = pos - half * n;
        pos += len;
        if (start < 0 || start >= n || note.len < 0) continue;
        // follow the chord under the note (each motif degree sits on this bar's root)
        const d = note.deg + (T.follow ? chord[0] : 0);
        this.inst(T.lead, t0 + start * e, len * e * (T.legato ?? 0.95), S.midi(d, 0), T.leadVol ?? 0.07, bus);
      }
    }
    // a closing chord to end on
    if (bar === S.bars - 1) for (const d of S.chords[0]) this.inst(T.arp || 'piano', t0 + e * 2, e * n * 2, S.midi(d, 0), 0.05, bus);
    // drums (fights only)
    if (T.drums) {
      for (let i = 0; i < n; i++) {
        if (T.drums.kick[i % T.drums.kick.length]) this.drum(t0 + i * e, 'kick');
        if (T.drums.snare[i % T.drums.snare.length]) this.drum(t0 + i * e, 'snare');
        if (T.drums.hat && i % 2 === 1) this.drum(t0 + i * e, 'hat');
      }
    }
  }

  /** One note on an instrument. */
  inst(kind, t, dur, midi, vol, bus) {
    const c = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = c.createGain();
    g.connect(bus);
    const osc = (type, freq, gain = 1, detune = 0) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      if (gain !== 1) { const og = c.createGain(); og.gain.value = gain; o.connect(og); return [o, og]; }
      return [o, o];
    };
    const out = [];
    let end = t + dur;
    if (kind === 'piano' || kind === 'pluck' || kind === 'musicbox') {
      // struck: a bright attack mellowing as it rings
      const decay = kind === 'pluck' ? Math.min(1.6, dur + 0.5) : kind === 'musicbox' ? 1.8 : Math.max(0.9, Math.min(3.4, 3.6 - (midi - 48) * 0.05));
      end = t + decay + 0.05;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(kind === 'musicbox' ? 6000 : kind === 'pluck' ? 3200 : 2600, t);
      lp.frequency.exponentialRampToValueAtTime(kind === 'pluck' ? 700 : 900, t + decay * 0.6);
      lp.connect(g);
      if (kind === 'musicbox') { out.push(osc('sine', f * 2, 1), osc('sine', f * 4, 0.25), osc('sine', f * 6.01, 0.08)); }
      else if (kind === 'pluck') { out.push(osc('triangle', f, 1), osc('sine', f * 2, 0.35), osc('sawtooth', f, 0.05)); }
      else { out.push(osc('triangle', f, 1, -3), osc('sine', f, 0.7, 4), osc('sine', f * 2, 0.22), osc('sine', f * 3, 0.06)); }
      for (const [, node] of out) node.connect(lp);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(vol * 0.4, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    } else if (kind === 'pad') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.Q.value = 0.3;
      lp.connect(g);
      out.push(osc('sawtooth', f, 0.5, -7), osc('sawtooth', f, 0.5, 7), osc('triangle', f / 2, 0.4));
      for (const [, node] of out) node.connect(lp);
      const att = Math.min(1.4, dur * 0.4);
      end = t + dur + 1.6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + att);
      g.gain.setValueAtTime(vol, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      // blown or squeezed: flute (breathy, vibrato) and accordion (reedy, tremolo)
      const flute = kind === 'flute';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = flute ? 3000 : 1700;
      lp.connect(g);
      if (flute) out.push(osc('sine', f, 1), osc('triangle', f, 0.18), osc('sine', f * 2, 0.08));
      else out.push(osc('square', f, 0.35, -5), osc('sawtooth', f, 0.3, 5), osc('square', f * 2, 0.08));
      for (const [, node] of out) node.connect(lp);
      // vibrato that blooms after the attack
      const lfo = c.createOscillator(); lfo.frequency.value = flute ? 5.2 : 6;
      const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * (flute ? 0.006 : 0.003), t + 0.35);
      lfo.connect(lg);
      for (const [o] of out) lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.6);
      const att = flute ? 0.07 : 0.04;
      end = t + dur + 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + att);
      g.gain.setValueAtTime(vol * 0.85, t + Math.max(att + 0.01, dur * 0.8));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      if (flute) {
        // a breath at the start of each note
        const src = c.createBufferSource(); src.buffer = this.noiseBuf;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
        const bg = c.createGain(); bg.gain.setValueAtTime(vol * 0.35, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        src.connect(bp); bp.connect(bg); bg.connect(bus); src.start(t, Math.random()); src.stop(t + 0.15);
      }
    }
    for (const [o] of out) { o.start(t); o.stop(end + 0.05); }
  }

  drum(t, kind) {
    const c = this.ctx, bus = this.songBus || this.musicGain;
    if (kind === 'kick') {
      // a deep, soft drum (more taiko than techno)
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
    } else {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7500 : 1500;
      const g = c.createGain();
      const dur = kind === 'hat' ? 0.035 : 0.14;
      g.gain.setValueAtTime(kind === 'hat' ? 0.025 : 0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    }
  }
}

// ------------------------------------------------------------------ composing
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
};
// rhythms for a two-bar motif, in eighths (negative = a rest)
const RHYTHMS = {
  straight: [[2, 2, 4, 2, 2, 4], [3, 1, 2, 2, 4, -4], [2, 2, 2, 2, 6, -2], [1, 1, 2, 4, 2, 2, 4], [4, 2, 2, 8]],
  lilt: [[3, 3, 2, 1, 3], [2, 1, 2, 1, 6], [3, 2, 1, 3, -3], [2, 1, 3, 2, 1, 3], [1, 1, 1, 3, 6]],
};
// arpeggio patterns: indices into [root, third, fifth, root+8ve, third+8ve, fifth+8ve]
const ARPS = {
  straight: [[0, 2, 3, 2, 4, 2, 3, 2], [0, 2, 4, 5, 4, 2, 3, 2], [0, null, 2, null, 3, null, 2, null]],
  lilt: [[0, 2, 3, 0, 2, 3], [0, 3, 4, 2, 3, 4], [0, null, 2, 3, null, 2]],
};

const SONGS = {
  title: { key: 50, mode: 'ionian', bpm: 70, feel: 'straight', prog: [[0, 5, 3, 4], [0, 3, 5, 4]], lead: 'piano', arp: 'piano', pad: true, arpDensity: 0.8, bars: [16, 24], rest: [6, 14], melody: 0.85 },
  sea: { key: 55, mode: 'mixolydian', bpm: 58, feel: 'lilt', prog: [[0, 3, 0, 4], [0, 6, 3, 0], [0, 3, 6, 0]], lead: 'flute', arp: 'pluck', pad: true, arpDensity: 0.75, bars: [16, 32], rest: [18, 45], melody: 0.75 },
  town: { key: 57, mode: 'ionian', bpm: 62, feel: 'lilt', prog: [[0, 3, 4, 0], [0, 5, 3, 4]], lead: 'accordion', leadVol: 0.05, arp: 'pluck', bass: 'pluck', pad: false, arpDensity: 0.9, bars: [16, 24], rest: [15, 35], melody: 0.8 },
  night: { key: 52, mode: 'aeolian', bpm: 56, feel: 'straight', prog: [[0, 5, 2, 6], [0, 3, 5, 4]], lead: 'piano', leadVol: 0.06, arp: 'piano', arpVol: 0.8, pad: true, padVol: 0.014, arpDensity: 0.45, bars: [12, 20], rest: [25, 60], melody: 0.55 },
  grandline: { key: 53, mode: 'dorian', bpm: 64, feel: 'straight', prog: [[0, 3, 0, 6], [0, 6, 3, 4]], lead: 'musicbox', leadVol: 0.05, arp: 'piano', pad: true, arpDensity: 0.65, bars: [16, 24], rest: [18, 45], melody: 0.7 },
  underwater: { key: 50, mode: 'lydian', bpm: 50, feel: 'straight', prog: [[0, 1, 0, 1], [0, 4, 1, 0]], lead: 'musicbox', leadVol: 0.045, arp: null, pad: true, padVol: 0.022, bars: [12, 16], rest: [10, 25], melody: 0.6 },
  battle: { key: 45, mode: 'dorian', bpm: 128, feel: 'straight', prog: [[0, 0, 5, 6], [0, 3, 6, 4]], lead: 'pluck', leadVol: 0.07, legato: 0.6, arp: 'pluck', arpVol: 0.8, bass: 'pluck', pad: true, padVol: 0.012, arpDensity: 1, bars: [32, 48], rest: [0, 0], melody: 0.9, follow: true,
    drums: { kick: [1, 0, 0, 1, 0, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: true } },
};

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

/** A two-bar motif: mostly stepwise, the odd leap, ending on a chord tone. */
function motif(T) {
  const rh = pick(RHYTHMS[T.feel]);
  const notes = [];
  let deg = pick([0, 2, 4, 4, 2]);
  rh.forEach((len, i) => {
    if (len < 0) { notes.push({ len, deg }); return; }
    if (i > 0) {
      const r = Math.random();
      deg += r < 0.34 ? 1 : r < 0.62 ? -1 : r < 0.78 ? 2 : r < 0.9 ? -2 : r < 0.95 ? 3 : -3;
      deg = Math.max(-2, Math.min(9, deg));
    }
    // the long last note settles on a chord tone
    if (i === rh.length - 1) deg = [0, 2, 4, 7].reduce((b, x) => (Math.abs(x - deg) < Math.abs(b - deg) ? x : b), 0);
    notes.push({ len, deg });
  });
  return notes;
}

/** Vary a motif: the same rhythm, its tail nudged. */
function vary(m) {
  return m.map((n, i) => (i >= m.length - 2 && n.len > 0 ? { ...n, deg: n.deg + pick([-1, 1, 2, 0]) } : n));
}

/** Compose a piece for a theme: its chords, a motif and its answers, the form. */
function compose(T) {
  const mode = MODES[T.mode];
  const perBar = T.feel === 'lilt' ? 6 : 8;
  const eighth = T.feel === 'lilt' ? 60 / (T.bpm * 3) : 60 / (T.bpm * 2);
  const prog = pick(T.prog);
  const chords = prog.map((r) => [r, r + 2, r + 4]);
  const key = T.key + pick([0, 0, 0, 2, -2, 5]);
  const midi = (d, oct) => {
    const n = mode.length, o = Math.floor(d / n), i = ((d % n) + n) % n;
    return key + 12 + mode[i] + 12 * (o + oct);
  };
  const A = motif(T), B = motif(T), C = motif(T);
  const rest = null;
  // A A' B A — then maybe C B' A, with a bar or two of breathing room
  const form = [A, vary(A), B, A, Math.random() < T.melody ? C : rest, vary(B), A, rest];
  const phrases = form.map((m) => (m && Math.random() < T.melody + 0.2 ? m : null));
  phrases[0] = A;
  const bars = 2 * Math.round((T.bars[0] + Math.random() * (T.bars[1] - T.bars[0])) / 2);
  return { T, chords, midi, perBar, eighth, barDur: eighth * perBar, bars, phrases, arpPat: pick(ARPS[T.feel]) };
}
