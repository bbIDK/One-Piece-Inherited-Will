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
    const lim = { punch: 0.04, slash_hit: 0.04, block: 0.05, whoosh: 0.05, splash: 0.2, splash_big: 0.3, wade: 0.2, choke: 0.5, gasp: 1, thunder_small: 0.15, coin: 0.05 }[name] ?? 0.02;
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
      case 'splash_big': this.noise(t, 0.75, { freq: 950, q: 0.4, gain: 0.45, type: 'lowpass', sweep: 140 }); this.tone(t, 0.3, { freq: 90, to: 42, gain: 0.3 }); this.noise(t + 0.05, 0.4, { freq: 2600, q: 0.6, gain: 0.1, sweep: 900 }); break;
      case 'splash_out': this.noise(t, 0.35, { freq: 1300, q: 0.5, gain: 0.26, sweep: 420 }); this.tone(t + 0.04, 0.12, { freq: 300, to: 620, gain: 0.08 }); break;
      case 'wade': this.noise(t, 0.2, { freq: 1400 * r(), q: 0.8, gain: 0.06, sweep: 600 }); break;
      case 'jump': this.noise(t, 0.12, { freq: 1100 * r(), q: 0.7, gain: 0.08, sweep: 2400 }); break;
      case 'jump_big': this.tone(t, 0.18, { freq: 120, to: 60, gain: 0.25 }); this.noise(t, 0.32, { freq: 900, q: 0.6, gain: 0.15, sweep: 3200 }); break;
      case 'land_heavy': this.noise(t, 0.18, { freq: 260, gain: 0.45, type: 'lowpass' }); this.tone(t, 0.16, { freq: 110, to: 48, gain: 0.35 }); break;
      // breaking the surface out of breath: a long gulp of air
      case 'gasp': this.noise(t, 0.5, { freq: 800, q: 0.9, gain: 0.2, attack: 0.1, sweep: 2300 }); this.noise(t + 0.55, 0.3, { freq: 600, q: 0.7, gain: 0.08, attack: 0.05, sweep: 300 }); break;
      // out of air under water: the last bubbles gurgling out
      case 'choke': for (let i = 0; i < 5; i++) this.tone(t + i * 0.07 * r(), 0.08, { freq: 170 + Math.random() * 140, to: 420 + Math.random() * 200, gain: 0.13 }); this.noise(t, 0.35, { freq: 380, gain: 0.12, type: 'lowpass' }); break;
      case 'cannon': this.tone(t, 0.5, { freq: 90, to: 35, type: 'sine', gain: 0.8 }); this.noise(t, 0.6, { freq: 400, gain: 0.6, type: 'lowpass', sweep: 80 }); break;
      case 'explosion': this.tone(t, 0.7, { freq: 70, to: 30, type: 'sine', gain: 0.8 }); this.noise(t, 0.9, { freq: 800, gain: 0.7, type: 'lowpass', sweep: 60 }); break;
      case 'crash': this.noise(t, 0.5, { freq: 300, gain: 0.6, type: 'lowpass' }); this.tone(t, 0.3, { freq: 100, to: 50, gain: 0.4 }); break;
      case 'thunder': this.noise(t, 2.2, { freq: 200, gain: 0.7, type: 'lowpass', attack: 0.02, sweep: 40 }); break;
      case 'thunder_small': case 'lightning': this.noise(t, 0.5, { freq: 2500, gain: 0.3, sweep: 300 }); this.tone(t, 0.3, { freq: 60, gain: 0.3 }); break;
      case 'fire': this.noise(t, 0.4, { freq: 1200, q: 0.4, gain: 0.25, sweep: 400 }); break;
      case 'ice': this.tone(t, 0.3, { freq: 2400, to: 3200, type: 'triangle', gain: 0.1 }); this.noise(t, 0.2, { freq: 5000, gain: 0.15 }); break;
      case 'haki': this.tone(t, 0.4, { freq: 80, to: 160, type: 'sawtooth', gain: 0.15 }); break;
      case 'haki_obs': this.tone(t, 0.6, { freq: 880, to: 1320, type: 'sine', gain: 0.1 }); break;
      case 'knock': [0, 0.17, 0.34].forEach((d) => { this.noise(t + d, 0.07, { freq: 260 * r(), q: 1.6, gain: 0.55 }); this.tone(t + d, 0.08, { freq: 130, to: 80, gain: 0.25 }); }); break;
      case 'door': this.tone(t, 0.4, { freq: 170 * r(), to: 250, type: 'sawtooth', gain: 0.025, attack: 0.05 }); this.noise(t, 0.3, { freq: 900, q: 0.6, gain: 0.05 }); break;
      case 'doorshut': this.noise(t, 0.12, { freq: 220, gain: 0.35, type: 'lowpass' }); this.tone(t, 0.12, { freq: 95, to: 60, gain: 0.3 }); break;
      case 'doorbreak': this.noise(t, 0.6, { freq: 320, gain: 0.7, type: 'lowpass' }); this.noise(t, 0.35, { freq: 2600, gain: 0.3, sweep: 700 }); this.tone(t, 0.3, { freq: 110, to: 45, gain: 0.5 }); break;
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
