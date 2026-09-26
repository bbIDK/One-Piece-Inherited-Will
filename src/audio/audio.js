// Procedural audio: every sound effect is synthesised with WebAudio, and the
// music is a small generative shanty engine (no recorded assets).
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.noiseBuf = null;
    this.theme = null;
    this.nextNoteT = 0;
    this.step = 0;
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
  noise(t, dur, { freq = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.005, sweep } = {}) {
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
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone(t, dur, { freq = 440, to, type = 'sine', gain = 0.3, attack = 0.005, dest } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.ctx.resume(); return; }
    const t = this.ctx.currentTime;
    // rate-limit spammy sounds
    const lim = { punch: 0.04, slash_hit: 0.04, block: 0.05, whoosh: 0.05, splash: 0.2, thunder_small: 0.15, coin: 0.05 }[name] ?? 0.02;
    if (this.last[name] && t - this.last[name] < lim) return;
    this.last[name] = t;
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'whoosh': this.noise(t, 0.12, { freq: 1800 * r(), q: 0.8, gain: 0.12, sweep: 600 }); break;
      case 'punch': this.noise(t, 0.09, { freq: 500 * r(), q: 1.2, gain: 0.5 }); this.tone(t, 0.09, { freq: 140, to: 60, type: 'sine', gain: 0.4 }); break;
      case 'slash_hit': this.noise(t, 0.12, { freq: 3500 * r(), q: 2, gain: 0.35, sweep: 1500 }); this.tone(t, 0.06, { freq: 900, to: 300, type: 'sawtooth', gain: 0.06 }); break;
      case 'block': this.tone(t, 0.12, { freq: 620 * r(), type: 'square', gain: 0.08 }); this.noise(t, 0.06, { freq: 2500, gain: 0.2 }); break;
      case 'parry': this.tone(t, 0.25, { freq: 1300, to: 1900, type: 'triangle', gain: 0.25 }); this.tone(t + 0.02, 0.3, { freq: 2600, type: 'sine', gain: 0.12 }); break;
      case 'guardbreak': this.tone(t, 0.3, { freq: 300, to: 80, type: 'sawtooth', gain: 0.2 }); break;
      case 'dodge': this.noise(t, 0.15, { freq: 900, q: 0.6, gain: 0.12, sweep: 2400 }); break;
      case 'ko': this.tone(t, 0.35, { freq: 220, to: 55, type: 'triangle', gain: 0.3 }); this.noise(t, 0.3, { freq: 300, gain: 0.2, type: 'lowpass' }); break;
      case 'knocked': this.tone(t, 0.8, { freq: 330, to: 110, type: 'sawtooth', gain: 0.12 }); break;
      case 'getup': [392, 523, 659].forEach((f, i) => this.tone(t + i * 0.08, 0.25, { freq: f, type: 'square', gain: 0.1 })); break;
      case 'death': [330, 311, 294, 220].forEach((f, i) => this.tone(t + i * 0.25, 0.5, { freq: f, type: 'triangle', gain: 0.18 })); break;
      case 'splash': this.noise(t, 0.4, { freq: 700, q: 0.5, gain: 0.3, type: 'lowpass', sweep: 200 }); break;
      case 'cannon': this.tone(t, 0.5, { freq: 90, to: 35, type: 'sine', gain: 0.8 }); this.noise(t, 0.6, { freq: 400, gain: 0.6, type: 'lowpass', sweep: 80 }); break;
      case 'explosion': this.tone(t, 0.7, { freq: 70, to: 30, type: 'sine', gain: 0.8 }); this.noise(t, 0.9, { freq: 800, gain: 0.7, type: 'lowpass', sweep: 60 }); break;
      case 'crash': this.noise(t, 0.5, { freq: 300, gain: 0.6, type: 'lowpass' }); this.tone(t, 0.3, { freq: 100, to: 50, gain: 0.4 }); break;
      case 'thunder': this.noise(t, 2.2, { freq: 200, gain: 0.7, type: 'lowpass', attack: 0.02, sweep: 40 }); break;
      case 'thunder_small': case 'lightning': this.noise(t, 0.5, { freq: 2500, gain: 0.3, sweep: 300 }); this.tone(t, 0.3, { freq: 60, gain: 0.3 }); break;
      case 'fire': this.noise(t, 0.4, { freq: 1200, q: 0.4, gain: 0.25, sweep: 400 }); break;
      case 'ice': this.tone(t, 0.3, { freq: 2400, to: 3200, type: 'triangle', gain: 0.1 }); this.noise(t, 0.2, { freq: 5000, gain: 0.15 }); break;
      case 'haki': this.tone(t, 0.4, { freq: 80, to: 160, type: 'sawtooth', gain: 0.15 }); break;
      case 'haki_obs': this.tone(t, 0.6, { freq: 880, to: 1320, type: 'sine', gain: 0.1 }); break;
      case 'board': case 'step': this.noise(t, 0.12, { freq: 300, gain: 0.2, type: 'lowpass' }); break;
      case 'coin': this.tone(t, 0.08, { freq: 1568, type: 'square', gain: 0.07 }); this.tone(t + 0.07, 0.18, { freq: 2093, type: 'square', gain: 0.07 }); break;
      case 'treasure': [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 0.3, { freq: f, type: 'triangle', gain: 0.14 })); break;
      case 'eat': this.noise(t, 0.08, { freq: 900, gain: 0.2 }); this.noise(t + 0.12, 0.08, { freq: 800, gain: 0.2 }); break;
      case 'equip': this.tone(t, 0.1, { freq: 700, type: 'square', gain: 0.06 }); break;
      case 'page': this.noise(t, 0.2, { freq: 3000, q: 0.5, gain: 0.08 }); break;
      case 'reveal': [392, 494, 587].forEach((f, i) => this.tone(t + i * 0.1, 0.35, { freq: f, type: 'triangle', gain: 0.12 })); break;
      case 'fanfare': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(t + i * 0.11, 0.3, { freq: f, type: 'square', gain: 0.08 })); break;
      case 'breakthrough': [440, 554, 659, 880].forEach((f, i) => this.tone(t + i * 0.07, 0.4, { freq: f, type: 'sawtooth', gain: 0.06 })); break;
      case 'seaking': this.tone(t, 1.6, { freq: 70, to: 45, type: 'sawtooth', gain: 0.3, attack: 0.3 }); this.noise(t, 1.5, { freq: 250, gain: 0.3, type: 'lowpass' }); break;
      default: this.noise(t, 0.05, { freq: 1500, gain: 0.05 });
    }
  }

  // --------------------------------------------------------------- music
  music(theme) {
    if (this.theme === theme) return;
    this.theme = theme;
    this.step = 0;
    if (this.ctx) this.nextNoteT = this.ctx.currentTime + 0.1;
  }

  schedule() {
    if (!this.ctx || !this.theme || this.ctx.state !== 'running') return;
    const T = THEMES[this.theme];
    if (!T) return;
    const spb = 60 / T.bpm / 2; // eighth notes
    while (this.nextNoteT < this.ctx.currentTime + 0.25) {
      this.playStep(T, this.step, this.nextNoteT, spb);
      this.nextNoteT += spb * (this.step % 2 === 0 ? 1 + T.swing : 1 - T.swing);
      this.step++;
    }
  }

  playStep(T, s, t, spb) {
    const bar = Math.floor(s / 8) % T.chords.length;
    const chord = T.chords[bar];
    const pos = s % 8;
    const root = T.root * Math.pow(2, chord[0] / 12);
    // bass on 1 and 5
    if (pos === 0 || pos === 4) this.voice(t, spb * 1.8, root / 2 * (pos === 4 ? Math.pow(2, 7 / 12) : 1), 'triangle', 0.22);
    // chord stabs (accordion-ish)
    if (pos === 2 || pos === 6) for (const iv of chord) this.voice(t, spb * 0.9, root * Math.pow(2, iv / 12), 'square', 0.035);
    // melody from a seeded pattern over the scale
    const m = T.melody[s % T.melody.length];
    if (m !== null && m !== undefined) {
      const f = T.root * 2 * Math.pow(2, T.scale[((m % T.scale.length) + T.scale.length) % T.scale.length] / 12 + Math.floor(m / T.scale.length));
      this.voice(t, spb * (T.legato || 1.4), f, T.lead || 'sawtooth', 0.05, true);
    }
    // percussion
    if (T.drums) {
      if (pos === 0 || pos === 4) this.drum(t, 'kick');
      if (pos === 2 || pos === 6) this.drum(t, 'snare');
      if (T.hats) this.drum(t, 'hat');
    }
  }

  voice(t, dur, freq, type, gain, vib) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    let lfo;
    if (vib) {
      lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = freq * 0.008;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.1);
  }

  drum(t, kind) {
    const c = this.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.2);
    } else {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
      const g = c.createGain();
      const dur = kind === 'hat' ? 0.04 : 0.12;
      g.gain.setValueAtTime(kind === 'hat' ? 0.05 : 0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    }
  }
}

// D dorian-ish sea shanties. melody numbers index into the scale.
const THEMES = {
  title: { bpm: 96, root: 146.83, swing: 0.1, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 3, 7], [5, 9, 12], [3, 7, 10], [7, 10, 14]], melody: [4, null, 4, 5, 4, 3, 2, null, 0, null, 2, 3, 4, null, null, null, 4, null, 4, 5, 6, 5, 4, null, 3, 2, 3, 4, 0, null, null, null], drums: false, lead: 'triangle', legato: 2 },
  sea: { bpm: 112, root: 146.83, swing: 0.12, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], melody: [0, 2, 4, null, 4, 5, 4, 2, 0, null, 2, 4, 2, null, null, null, 5, 5, 4, 2, 4, null, 2, 0, 1, 2, 0, null, -1, null, 0, null], drums: true, lead: 'square' },
  grandline: { bpm: 126, root: 164.81, swing: 0.08, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 10, 14]], melody: [0, null, 2, 3, 4, null, 3, 2, 3, null, 1, 0, -1, null, 0, null, 4, 5, 6, 5, 4, null, 3, null, 2, 3, 4, 2, 0, null, null, null], drums: true, hats: true, lead: 'sawtooth' },
  battle: { bpm: 150, root: 110, swing: 0, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [0, 3, 7], [8, 12, 15], [7, 10, 14]], melody: [0, 0, 3, 0, 4, 0, 3, 2, 0, 0, 3, 0, 5, 4, 3, 2], drums: true, hats: true, lead: 'sawtooth', legato: 0.9 },
  town: { bpm: 104, root: 196, swing: 0.15, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [0, 4, 7], [7, 11, 14]], melody: [4, 2, 0, 2, 4, 4, 4, null, 2, 2, 2, null, 4, 6, 6, null, 4, 2, 0, 2, 4, 4, 4, 4, 2, 2, 4, 2, 0, null, null, null], drums: false, lead: 'triangle' },
  night: { bpm: 72, root: 130.81, swing: 0, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [7, 10, 14]], melody: [4, null, null, 3, 2, null, null, null, 0, null, 2, null, 3, null, null, null], drums: false, lead: 'sine', legato: 3 },
};
