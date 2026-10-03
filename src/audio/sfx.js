// The sound library: every effect the game asks for by name, each layered
// from the motifs in motifs.js and the voice's own building blocks (see
// synth.js) — a transient to hear it land, a body with weight, a tail — and
// each a little different every time it plays (round-robin variants, pitch
// and timing jitter). docs/AUDIO.md describes the palette.
//
// An entry: { bus, prio (how much it matters), cd (the least time between two
// of them), max (how many may overlap), send (room echo), drive (grit),
// duck (how far the music dips under it), variants, play(v, k) }. `k` carries
// what the mixer worked out about the moment: `w` the weight of a blow, `rr`
// the variant, `surf` what's underfoot, `armament`, `counter`, `kick`, `blade`,
// `sword` (a guard with a blade), `perfect` (a parry), `wet` (feet)...
import * as M from './motifs.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const r = () => 0.92 + Math.random() * 0.16;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Each character's Haki has a voice (game/haki.js hakiSignature: `k.voice`,
// 0..1, worked out by audio.js from who it is): the same sounds pitched and
// coloured their own way — related, never identical.
const vo = (k) => clamp(k?.voice ?? 0.5, 0, 1);

/**
 * Haki-hardened fists (and a blocked blow off a hardened arm): the GAKIN of
 * struck iron — a hard click, a bright inharmonic ring with a darker one an
 * octave under it (the chorus of iron), a few sparks — in the striker's voice.
 */
function hakiClank(v, t, s = 1, voice = 0.5) {
  const base = (560 + 200 * voice) * rnd(0.97, 1.03);
  v.noise(t, 0.006, { type: 'highpass', freq: 6000, gain: 0.24 * s, attack: 0.0005 });
  v.ring(t + 0.002, base, 0.3 * s, 0.075 * s, [1, 1.47 + 0.06 * voice, 2.31, 2.97]);
  v.ring(t + 0.004, base * 0.503, 0.22 * s, 0.045 * s, [1, 1.52, 2.4]);
  v.crackle(t + 0.01, 0.12, 4, { freq: 2600 + 800 * voice, gain: 0.04 * s });
}

/** Ryou: a master's Haki pushed on into the body — a hollow "dwoom" going through it, a ripple of iron. */
function ryouLayer(v, t, w = 1, voice = 0.5) {
  v.thump(t + 0.01, { f0: 95 + 20 * voice, f1: 32, dur: 0.35, gain: 0.32 * w });
  v.tone(t + 0.02, 0.4, { freq: 180 + 40 * voice, to: 70, type: 'triangle', gain: 0.08, vib: { rate: 22, depth: 18 } });
  v.ring(t + 0.03, 300 + 80 * voice, 0.4, 0.03, [1, 1.5, 2.2]);
}

/** A blade singing after the cut: a pair of slightly detuned rings (the anime's chorus on steel). */
function bladeRing(v, t, base, dur, gain) {
  v.ring(t, base, dur, gain, [1, 2.04, 2.75, 3.6]);
  v.ring(t + 0.003, base * 1.007, dur * 0.8, gain * 0.5, [1, 2.04, 2.75]);
}

/** What a foot scuffs or a body lands on: a short burst of the surface. */
export function surfaceHit(v, t, surf, s = 1) {
  switch (surf) {
    case 'grass': v.noise(t, 0.09, { type: 'lowpass', freq: 1100, sweep: 500, q: 0.6, gain: 0.08 * s, attack: 0.005 }); v.noise(t + 0.01, 0.07, { freq: 3400, q: 0.9, gain: 0.03 * s }); break;
    case 'sand': v.noise(t, 0.13, { freq: 1700, sweep: 700, q: 0.45, gain: 0.09 * s, attack: 0.01 }); v.crackle(t, 0.1, 6, { freq: 4200, gain: 0.02 * s }); break;
    case 'gravel': v.noise(t, 0.09, { freq: 1500, q: 0.6, gain: 0.07 * s }); v.crackle(t, 0.1, 9, { freq: 2800, gain: 0.045 * s }); break;
    case 'mud': v.tone(t + 0.01, 0.09, { freq: 140, to: 320, gain: 0.05 * s, attack: 0.01 }); v.noise(t, 0.12, { type: 'lowpass', freq: 500, q: 0.6, gain: 0.09 * s, attack: 0.01 }); break;
    case 'stone': case 'ice': case 'metal': v.noise(t, 0.016, { type: 'highpass', freq: 3000, q: 0.8, gain: 0.07 * s, attack: 0.001 }); v.noise(t, 0.05, { freq: 900, q: 1.4, gain: 0.06 * s }); break;
    case 'wood': v.tone(t, 0.08, { freq: 215, to: 165, gain: 0.07 * s, attack: 0.002 }); v.noise(t, 0.045, { freq: 1000, q: 1.3, gain: 0.06 * s }); break;
    case 'snow': v.noise(t, 0.14, { freq: 2300, sweep: 1300, q: 0.6, gain: 0.07 * s, attack: 0.015 }); v.crackle(t + 0.01, 0.1, 8, { freq: 5200, gain: 0.025 * s }); break;
    default: v.noise(t, 0.07, { type: 'lowpass', freq: 700, q: 0.7, gain: 0.09 * s, attack: 0.004 });
  }
}

/** The swing of a blow through the air, by what's swung (`kind`) and how big (`s`). */
export function swing(v, t, kind = 'fists', s = 1) {
  switch (kind) {
    case 'sword': // a thin, bright swish
      v.whoosh(t, 0.15 * s, { f0: 2400, f1: 6200, q: 2.2, gain: 0.3 * s, peak: 0.55 });
      v.whoosh(t + 0.01, 0.12 * s, { f0: 900, f1: 1600, q: 0.8, gain: 0.13 * s, peak: 0.5 });
      break;
    case 'legs': // a fuller, lower sweep — and the trouser leg flapping
      v.whoosh(t, 0.2 * s, { f0: 300, f1: 1100, q: 0.9, gain: 0.5 * s, peak: 0.5, color: 'pink', flutter: 24 });
      v.whoosh(t + 0.02, 0.15 * s, { f0: 900, f1: 1800, q: 1, gain: 0.12 * s, peak: 0.5 });
      break;
    case 'heavy': // a big wind-up thrown hard
      v.whoosh(t, 0.3 * s, { f0: 220, f1: 950, q: 0.8, gain: 0.55 * s, peak: 0.6, color: 'pink' });
      v.whoosh(t + 0.08, 0.2 * s, { f0: 1400, f1: 700, q: 0.9, gain: 0.14 * s });
      break;
    case 'staff': // wood through the air: a hollow whirr
      v.whoosh(t, 0.22 * s, { f0: 500, f1: 1500, q: 2.5, gain: 0.34 * s, peak: 0.5 });
      v.whoosh(t + 0.04, 0.16 * s, { f0: 800, f1: 2000, q: 2.5, gain: 0.14 * s, peak: 0.5 });
      break;
    case 'axe': // a great slow weight
      v.whoosh(t, 0.36 * s, { f0: 180, f1: 700, q: 0.9, gain: 0.6 * s, peak: 0.65, color: 'pink' });
      break;
    default: // fists: short and punchy
      v.whoosh(t, 0.15 * s, { f0: 500, f1: 1800, q: 1.1, gain: 0.34 * s, peak: 0.45 });
      v.whoosh(t + 0.03, 0.11 * s, { f0: 1600, f1: 900, q: 0.9, gain: 0.1 * s, peak: 0.5 });
  }
}

/** A gunshot: the crack, the bang, smoke, and the echo coming back. */
function gunshot(v, t, s = 1) {
  v.noise(t, 0.012, { type: 'highpass', freq: 2200, gain: 0.5 * s, attack: 0.0005 });
  v.thump(t, { f0: 200, f1: 60, dur: 0.12, gain: 0.4 * s });
  v.noise(t, 0.3, { type: 'lowpass', freq: 1500, sweep: 300, gain: 0.3 * s, attack: 0.002 });
  const e = v.echo(0.22, 0.25, 1200, 0.35);
  v.noise(t, 0.12, { type: 'lowpass', freq: 1200, gain: 0.25 * s, dest: e });
}

/** A slingshot: the rubber's snap and the shot whistling off. */
function slingshot(v, t, s = 1) {
  v.noise(t, 0.012, { type: 'highpass', freq: 2500, gain: 0.25 * s, attack: 0.0005 });
  v.tone(t, 0.08, { freq: 380, to: 160, type: 'triangle', gain: 0.1 * s });
  v.tone(t + 0.02, 0.25, { freq: 2600, to: 1800, gain: 0.02 * s });
}

// --------------------------------------------------------------- the library
export const SFX = {
  // ---- the fight
  /** The default swing of a blow (a technique's own start sound replaces it: see techStart). */
  whoosh: { prio: 4, cd: 0.04, max: 4, send: 0.04, play: (v, k) => swing(v, 0, k.kind || 'fists', k.s || 1) },
  /** DON, DOGA, BAKI: skin snap, the thwack, the body of the blow (a kick deeper, Haki ringing like iron). */
  punch: {
    prio: 6, cd: 0.03, max: 4, send: 0.06, drive: 2.2, variants: 4,
    play(v, k) {
      const w = clamp(k.w ?? 0.45, 0.15, 1.5);
      const slap = [1300, 1650, 1900, 1150][k.rr];
      // the snap of skin, the THWACK of the slap, a woody knock: the "DON" you hear before you feel it
      v.noise(0, 0.012, { type: 'highpass', freq: 3200 * r(), q: 0.7, gain: 0.3 + 0.1 * w, attack: 0.0008 });
      v.noise(0.001, 0.05 + 0.03 * w, { freq: slap * r(), q: 1.2, gain: k.kick ? 0.3 : 0.42, attack: 0.0015 });
      v.tone(0, 0.05 + 0.04 * w, { freq: (430 - 90 * w) * r(), to: 210, gain: 0.16, attack: 0.001 });
      if (k.kick) {
        // DOKA: the shin and the whole leg behind it
        v.thump(0, { f0: (130 - 25 * w) * r(), f1: 40, dur: 0.12 + 0.09 * w, gain: 0.42 + 0.2 * w });
        v.noise(0, 0.12 + 0.1 * w, { color: 'pink', type: 'lowpass', freq: 450, sweep: 120, gain: 0.22 + 0.12 * w });
      } else {
        v.thump(0, { f0: (175 - 40 * w) * r(), f1: 46, dur: 0.1 + 0.08 * w, gain: 0.34 + 0.18 * w });
        v.noise(0, 0.08 + 0.1 * w, { type: 'lowpass', freq: 620, sweep: 160, q: 0.7, gain: 0.12 + 0.15 * w });
      }
      if (k.armament) hakiClank(v, 0.002, 0.7 + 0.4 * w, vo(k));
      if (k.ryou) ryouLayer(v, 0.004, 0.8 + 0.3 * w, vo(k));
      if (k.counter) { v.noise(0, 0.03, { freq: 2500, q: 2, gain: 0.2 }); v.thump(0.02, { f0: 80, f1: 34, dur: 0.25, gain: 0.35 }); }
    },
  },
  /** DOGOOON: the ground shakes — a boom with a second wave behind it, and debris. */
  punch_heavy: {
    prio: 7, cd: 0.05, max: 3, send: 0.18, drive: 3, duck: 0.35, variants: 3,
    play(v, k) {
      const w = clamp(k.w ?? 0.8, 0.5, 1.5);
      v.noise(0, 0.02, { type: 'highpass', freq: 2600, q: 0.6, gain: 0.42, attack: 0.0008 });
      v.noise(0.001, 0.1, { freq: [1000, 820, 1200][k.rr] * r(), q: 1.1, gain: k.kick ? 0.3 : 0.4 });
      v.tone(0, 0.09, { freq: 360 * r(), to: 150, gain: 0.16, attack: 0.001 });
      v.thump(0, { f0: (k.kick ? 100 : 120) * r(), f1: 30, dur: 0.3 + 0.06 * w, gain: 0.7 });
      v.noise(0, 0.3, { color: 'pink', type: 'lowpass', freq: 700, sweep: 110, gain: 0.4 });
      v.thump(0.045, { f0: 72, f1: 28, dur: 0.45, gain: 0.32 + 0.12 * w });
      v.crackle(0.05, 0.3, 10, { freq: 1400, gain: 0.1 });
      if (k.armament) hakiClank(v, 0.003, 1.2, vo(k));
      if (k.ryou) ryouLayer(v, 0.005, 1.2, vo(k));
      if (k.counter) v.noise(0, 0.04, { freq: 2600, q: 2, gain: 0.22 });
    },
  },
  /** ZAN: a clean cut, and the blade singing after it. */
  slash_hit: {
    prio: 6, cd: 0.03, max: 4, send: 0.12, drive: 0.8, variants: 3,
    play(v, k) {
      v.noise(0, 0.008, { type: 'highpass', freq: 6500, gain: 0.3, attack: 0.0006 });
      v.noise(0.001, 0.085, { freq: 5200 * r(), sweep: 2200, q: 1.6, gain: 0.3, attack: 0.002 });
      v.thump(0, { f0: 230, f1: 80, dur: 0.07, gain: 0.26 });
      bladeRing(v, 0.004, [1480, 1620, 1360][k.rr] * r(), 0.42, 0.06);
      if (k.armament) hakiClank(v, 0.003, 0.7, vo(k));
    },
  },
  /** ZUBAAAN: the air tearing, a deep cut, a long ring. */
  slash_heavy: {
    prio: 7, cd: 0.05, max: 3, send: 0.22, drive: 1.6, duck: 0.25, variants: 3,
    play(v, k) {
      v.whoosh(0, 0.14, { f0: 1800, f1: 7000, q: 1.3, gain: 0.14, peak: 0.25 });
      v.noise(0, 0.012, { type: 'highpass', freq: 5000, gain: 0.38, attack: 0.0006 });
      v.noise(0.002, 0.16, { freq: 4200 * r(), sweep: 1500, q: 1.2, gain: 0.34, attack: 0.002 });
      v.thump(0, { f0: 150, f1: 38, dur: 0.26, gain: 0.55 });
      bladeRing(v, 0.008, [1100, 1220, 980][k.rr] * r(), 0.75, 0.08);
      if (k.armament) hakiClank(v, 0.004, 1, vo(k));
    },
  },
  /** A blow taken on the guard: a dull leather DOFF on an arm, a short GAKIN off a blade. */
  block: {
    prio: 6, cd: 0.04, max: 3, send: 0.05, drive: 0.6, variants: 3,
    play(v, k) {
      if (k.sword) {
        v.noise(0, 0.008, { type: 'highpass', freq: 4000, gain: 0.3, attack: 0.0006 });
        v.ring(0.001, [900, 980, 840][k.rr] * r(), 0.28, 0.07, [1, 1.62, 2.4, 3.3]);
        v.thump(0, { f0: 300, f1: 120, dur: 0.05, gain: 0.2 });
      } else {
        v.noise(0, 0.07, { freq: 620 * r(), q: 2, gain: 0.6, attack: 0.001 });
        v.noise(0, 0.035, { freq: 1500 * r(), q: 1.5, gain: 0.28, attack: 0.001 });
        v.thump(0, { f0: 130, f1: 70, dur: 0.09, gain: 0.3 });
        v.noise(0.004, 0.04, { freq: 2500, q: 1, gain: 0.08 });
      }
      if (k.armament) hakiClank(v, 0.002, 0.6, vo(k));
    },
  },
  /** KIIN! Steel on steel: a hard click, a bright inharmonic ring, a long shimmer (perfect: brighter, longer, a beat of hush). */
  parry: {
    prio: 8, cd: 0.05, max: 2, send: 0.35, duck: 0.3, variants: 3,
    play(v, k) {
      const p = k.perfect ? 1.12 : 1, len = k.perfect ? 1.5 : 1.05;
      const base = [1320, 1400, 1250][k.rr] * p * r();
      v.noise(0, 0.02, { type: 'highpass', freq: 5000, gain: 0.4, attack: 0.0006 });
      v.thump(0, { f0: 420, f1: 160, dur: 0.05, gain: 0.22 });
      v.ring(0, base, len, 0.12, [1, 1.5, 2.25, 3.14, 3.96]);
      v.ring(0.002, base * 1.007, len * 0.8, 0.05, [1, 1.5, 2.25]);
      v.fm(0.001, len, { freq: base * 2.01, ratio: 1.414, index: 2.2, gain: 0.06 });
      v.tone(0.01, len * 0.5, { freq: base * 4, to: base * 4.1, gain: 0.012 });
      if (k.perfect) {
        v.crackle(0.02, 0.4, 10, { freq: 8000, q: 5, gain: 0.03 });
        v.thump(0.01, { f0: 90, f1: 40, dur: 0.35, gain: 0.32 });
        v.fm(0.06, 1.2, { freq: base * 3, ratio: 2.76, index: 0.7, gain: 0.025 });
      }
    },
  },
  /** BAKIN: a guard smashed aside — a crack, shards, the stagger. */
  guardbreak: {
    prio: 8, cd: 0.1, max: 2, send: 0.18, drive: 2.2, duck: 0.3,
    play(v) {
      v.noise(0, 0.02, { type: 'highpass', freq: 3000, gain: 0.5, attack: 0.0006 });
      v.crackle(0, 0.25, 22, { freq: 3500, spread: 1, q: 3, gain: 0.13 });
      v.noise(0.002, 0.1, { freq: 1300, q: 1, gain: 0.3 });
      for (let i = 0; i < 4; i++) v.ring(rnd(0.01, 0.12), rnd(2400, 3200), 0.25, 0.035, [1, 1.7]);
      v.thump(0, { f0: 160, f1: 40, dur: 0.25, gain: 0.45 });
      v.noise(0, 0.26, { type: 'lowpass', freq: 600, gain: 0.3 });
      v.tone(0.02, 0.35, { freq: 300, to: 70, type: 'sawtooth', gain: 0.1 });
    },
  },
  /** A dodge: cloth and air rushing past, a scuff of the feet. */
  dodge: {
    prio: 5, cd: 0.08, max: 2, send: 0.04, variants: 2,
    play(v, k) {
      v.whoosh(0, 0.17, { f0: 700 * r(), f1: 3000, q: 1, gain: 0.14, peak: 0.35, flutter: 26 });
      v.whoosh(0.04, 0.12, { f0: 2600, f1: 1200, q: 0.9, gain: 0.05, peak: 0.4 });
      surfaceHit(v, 0.01, k.surf || 'dirt', 0.5);
    },
  },
  /** DOON: down and out — the body hits the ground, bounces, the dust settles. */
  ko: {
    prio: 7, cd: 0.08, max: 3, send: 0.22, drive: 1.8, duck: 0.3,
    play(v, k) {
      v.thump(0, { f0: 110, f1: 35, dur: 0.4, gain: 0.6 });
      v.noise(0, 0.4, { color: 'pink', type: 'lowpass', freq: 420, sweep: 90, gain: 0.35 });
      v.thump(0.17, { f0: 90, f1: 40, dur: 0.18, gain: 0.22 });
      surfaceHit(v, 0.17, k.surf || 'dirt', 0.8);
      v.crackle(0.05, 0.3, 6, { freq: 1000, gain: 0.07 });
      v.whoosh(0, 0.15, { f0: 1200, f1: 500, gain: 0.05 });
    },
  },
  /** Knocked down: the breath going out of you, a falling wail (the anime's sad trombone, not quite). */
  knocked: {
    prio: 9, cd: 0.5, max: 1, send: 0.3,
    play(v) {
      v.thump(0, { f0: 90, f1: 38, dur: 0.3, gain: 0.4 });
      v.tone(0.05, 0.95, { freq: 330, to: 105, type: 'sawtooth', gain: 0.09, vib: { rate: 5, depth: 14 } });
      v.tone(0.05, 0.9, { freq: 165, to: 52, gain: 0.14 });
    },
  },
  /** Back on your feet: a rising call, and a breath. */
  getup: {
    prio: 8, cd: 0.5, max: 1, send: 0.25,
    play(v) {
      v.whoosh(0, 0.25, { f0: 400, f1: 1400, gain: 0.05, peak: 0.6 });
      [392, 523, 659].forEach((f, i) => v.tone(i * 0.08, 0.28, { freq: f, type: 'triangle', gain: 0.12 }));
    },
  },
  death: {
    prio: 10, cd: 1, max: 1, send: 0.45, bus: 'ui',
    play(v) { [330, 311, 294, 220].forEach((f, i) => v.tone(i * 0.26, 0.6, { freq: f, type: 'triangle', gain: 0.18 })); },
  },
  /**
   * Armament Haki hardening (in the user's voice): the low "vrrmm" of will
   * swelling as the coat spreads up the arm — a growl opening up over a sub —
   * and, as it sets hard at 0.27 s (when the coat has spread: render3d/chars/
   * haki.js), the metallic KSHING: a click, a bright swipe, a struck-iron
   * clank and a dense ringing tail, chorused. (A hit by Haki itself: a
   * Haki-heavy blow.)
   */
  haki: {
    prio: 7, cd: 0.08, max: 2, send: 0.3, drive: 1.2, variants: 3,
    play(v, k) {
      if (k.hit) { SFX.punch_heavy.play(v, { ...k, armament: true }); return; }
      const V = vo(k), f = 44 + 24 * V;
      v.tone(0, 0.42, { freq: f, to: f * 1.9, type: 'sawtooth', gain: 0.12, attack: 0.18, curve: 'lin' });
      v.tone(0, 0.42, { freq: f * 1.012, to: f * 1.93, type: 'square', gain: 0.04, attack: 0.2, curve: 'lin' });
      v.tone(0, 0.5, { freq: f * 0.5, to: f * 0.62, gain: 0.3, attack: 0.15 });
      v.noise(0, 0.36, { color: 'pink', type: 'lowpass', freq: 300, sweep: 1600, q: 1.4, gain: 0.1, attack: 0.25, curve: 'lin' });
      const T = 0.27, base = (420 + 220 * V) * [1, 1.06, 0.95][k.rr];
      v.noise(T, 0.007, { type: 'highpass', freq: 6500, gain: 0.3, attack: 0.0005 });
      v.noise(T, 0.07, { freq: 4200 + 1600 * V, sweep: 8500, q: 2.2, gain: 0.15, attack: 0.002 });
      v.thump(T, { f0: 160, f1: 60, dur: 0.12, gain: 0.22 });
      v.ring(T + 0.002, base, 0.9, 0.08, [1, 1.38 + 0.08 * V, 2.1, 2.9 - 0.12 * V, 3.7]);
      v.ring(T + 0.01, base * 1.004, 1.4, 0.034, [1, 2.02, 2.76]);
      v.ring(T + 0.015, base * 0.497, 1.2, 0.04, [1, 1.5, 2.2]);
      v.crackle(0.05, 0.3, 6, { freq: 2200 + 900 * V, gain: 0.03 });
    },
  },
  /** Armament or Observation let go: a soft breath of air settling. */
  haki_off: { prio: 4, cd: 0.1, max: 1, send: 0.1, play: (v, k) => v.whoosh(0, 0.25, { f0: 1500 + 500 * vo(k), f1: 450, q: 1, gain: 0.05, peak: 0.2 }) },
  /** Haki given out (the spirit spent): a dull clank going flat, the coat fizzling away. */
  haki_out: {
    prio: 6, cd: 0.3, max: 1, send: 0.2,
    play(v, k) {
      const V = vo(k);
      v.ring(0, 300 + 120 * V, 0.25, 0.04, [1, 1.4, 2.1]);
      v.tone(0, 0.4, { freq: 220 + 60 * V, to: 90, type: 'triangle', gain: 0.07 });
      v.noise(0.02, 0.45, { type: 'lowpass', freq: 2400, sweep: 300, gain: 0.08, attack: 0.01 });
      v.crackle(0.03, 0.4, 8, { freq: 1800, gain: 0.03 });
    },
  },
  /**
   * Observation Haki (in the user's voice): the heart's soft "doki-doki",
   * the pulse going out like sonar (a breath of air, a falling sine) and a
   * high crystalline TING with a long shimmering tail, its partials beating
   * slowly against each other.
   */
  haki_obs: {
    prio: 7, cd: 0.2, max: 1, send: 0.55, variants: 3,
    play(v, k) {
      const V = vo(k), f = (2050 + 1300 * V) * [1, 1.03, 0.97][k.rr];
      v.thump(0, { f0: 66 - 8 * V, f1: 44, dur: 0.13, gain: 0.26 });
      v.thump(0.2, { f0: 58 - 6 * V, f1: 40, dur: 0.11, gain: 0.16 });
      v.whoosh(0.02, 0.5, { f0: 3800, f1: 1600, q: 2.5, gain: 0.03, peak: 0.15 });
      v.tone(0.03, 0.35, { freq: f * 0.5, to: f * 0.25, gain: 0.025, attack: 0.004 });
      v.ring(0.04, f, 0.9, 0.07, [1, 2.0, 2.76 + 0.2 * V, 4.07]);
      v.fm(0.04, 1.6, { freq: f * 1.5, ratio: 2.01 + 0.5 * V, index: 0.8, gain: 0.025, indexDur: 1.2 });
      v.tone(0.08, 2.2, { freq: f * 2, gain: 0.012, attack: 0.3, vib: { rate: 5 + 3 * V, depth: f * 0.004 } });
      v.tone(0.1, 2.0, { freq: f * 2 * 1.006, gain: 0.01, attack: 0.35 });
      v.tone(0.12, 1.8, { freq: f * 3.01, gain: 0.006, attack: 0.4, vib: { rate: 3.5, depth: f * 0.006 } });
    },
  },
  /** Foresight (Observation slipping a blow): a whoosh played backwards, swelling out of nothing onto a ting. */
  foresight: {
    prio: 7, cd: 0.15, max: 2, send: 0.4, variants: 2,
    play(v, k) {
      const V = vo(k), f = (2400 + 1200 * V) * [1, 1.04][k.rr];
      v.whoosh(0, 0.22, { f0: 600, f1: 3200, q: 1.2, gain: 0.2, peak: 0.97, color: 'pink' });
      v.whoosh(0.02, 0.2, { f0: 1500, f1: 5000, q: 2, gain: 0.07, peak: 0.95 });
      v.ring(0.22, f, 0.6, 0.05, [1, 2.0, 2.9]);
      v.fm(0.22, 0.8, { freq: f * 1.5, ratio: 2.01, index: 0.6, gain: 0.015 });
    },
  },
  /** Conqueror's Haki gathering (the wind-up): the air going heavy and still, a growl rising under it. */
  conqueror_rise: {
    prio: 8, cd: 0.4, max: 1, send: 0.3,
    play(v, k) {
      const V = vo(k), T = Math.max(0.2, k.rel || 0.45);
      v.noise(0, T, { color: 'brown', type: 'lowpass', freq: 120, sweep: 500, gain: 0.3, attack: T * 0.9, curve: 'lin' });
      v.tone(0, T + 0.05, { freq: 30 + 8 * V, to: 55 + 10 * V, gain: 0.25, attack: T * 0.85, curve: 'lin' });
      v.whoosh(0, T, { f0: 200, f1: 900, q: 0.9, gain: 0.1, peak: 0.9 });
    },
  },
  /**
   * Conqueror's Haki let loose (in the king's voice): the deep rolling DOOON —
   * a crack, a huge sub falling away under a growling body, thunder rolling on
   * — the wind of it rushing out past you, and black lightning crackling
   * (BZZT) through it all.
   */
  conqueror: {
    prio: 9, cd: 0.4, max: 1, send: 0.45, drive: 2.2, duck: 0.7, variants: 3,
    play(v, k) {
      const V = vo(k), f0 = (60 + 22 * V) * [1, 0.94, 1.06][k.rr];
      v.noise(0, 0.02, { type: 'highpass', freq: 2200, gain: 0.35, attack: 0.0008 });
      v.thump(0, { f0: f0 * 1.6, f1: f0 * 0.4, dur: 1.0, gain: 0.85 });
      v.tone(0, 1.4, { freq: f0, to: f0 * 0.62, glide: 1.2, type: 'sawtooth', gain: 0.13, attack: 0.01 });
      v.tone(0.01, 1.3, { freq: f0 * 1.005, to: f0 * 0.6, glide: 1.2, type: 'triangle', gain: 0.18, attack: 0.01 });
      M.rumble(v, 0.08, 1.2, 1.8, { lp: 150 + 60 * V });
      v.whoosh(0.02, 1.4, { f0: 250 + 150 * V, f1: 1100 + 400 * V, q: 0.8, gain: 0.3, peak: 0.25, color: 'pink' });
      v.whoosh(0.3, 1.1, { f0: 1400, f1: 500, q: 0.7, gain: 0.11, peak: 0.3 });
      v.zap(0.03, 0.5, { f0: 50, f1: 900 + 500 * V, gain: 0.1 });
      v.zap(0.35, 0.4, { f0: 60, f1: 700, gain: 0.07 });
      v.crackle(0.02, 1.0, 18, { freq: 2600 + 1400 * V, gain: 0.06 });
      v.noise(0.03, 0.6, { type: 'highpass', freq: 4500, gain: 0.04, attack: 0.01 });
    },
  },
  /**
   * Two Conqueror's clashing: a sustained, thunderous, grinding crackle — the
   * two wills' growls beating against each other over a roar of the deep,
   * black lightning arcing between them the whole while, thunder rolling as
   * the sky splits, and a last boom as both are thrown back.
   */
  conqueror_clash: {
    prio: 10, cd: 0.8, max: 1, send: 0.5, drive: 2.4, duck: 0.85,
    play(v, k) {
      const V = vo(k), L = 2.6;
      v.noise(0, 0.03, { type: 'highpass', freq: 1800, gain: 0.4, attack: 0.0008 });
      v.thump(0, { f0: 110, f1: 26, dur: 1.2, gain: 0.8 });
      v.tone(0, L, { freq: 48 + 10 * V, to: 42, type: 'sawtooth', gain: 0.11, attack: 0.08, hold: L * 0.6 });
      v.tone(0, L, { freq: 51.5 + 10 * V, to: 45, type: 'sawtooth', gain: 0.11, attack: 0.08, hold: L * 0.6 });
      v.noise(0, L, { color: 'brown', type: 'lowpass', freq: 380, q: 0.8, gain: 0.45, attack: 0.1, hold: L * 0.55 });
      for (let i = 0; i < 6; i++) v.zap(0.05 + i * 0.38, 0.4, { f0: 50, f1: 900 + 300 * Math.random(), gain: 0.08 });
      v.crackle(0.02, L * 0.9, 40, { freq: 2400 + 1200 * V, gain: 0.06 });
      v.noise(0.05, L, { type: 'highpass', freq: 5000, gain: 0.045, attack: 0.1, hold: L * 0.5 });
      M.rumble(v, 0.15, 1.4, 2.2, { lp: 200 });
      v.thump(L * 0.8, { f0: 90, f1: 28, dur: 0.8, gain: 0.5 });
    },
  },

  // ---- the elements (a Devil Fruit's blows sound like what they're made of)
  fire: { prio: 6, cd: 0.07, max: 3, send: 0.15, drive: 0.8, play: (v, k) => { v.thump(0, { f0: 140, f1: 70, dur: 0.1, gain: 0.12 + 0.1 * (k.w || 0.5) }); M.flame(v, 0, 0.8 + 0.4 * (k.w || 0.5)); } },
  magma: { prio: 7, cd: 0.08, max: 3, send: 0.2, drive: 2, play: (v) => { v.thump(0, { f0: 90, f1: 30, dur: 0.4, gain: 0.55 }); M.lava(v, 0, 1); } },
  ice: { prio: 6, cd: 0.06, max: 3, send: 0.3, play: (v) => { v.thump(0, { f0: 220, f1: 110, dur: 0.06, gain: 0.2 }); M.ice(v, 0, 1); } },
  snow: {
    prio: 5, cd: 0.06, max: 3, send: 0.25,
    play(v) { v.noise(0, 0.25, { freq: 3000, q: 0.5, sweep: 1200, gain: 0.14, attack: 0.01 }); v.ring(0.01, 3100, 0.3, 0.02, [1, 1.5]); v.crackle(0, 0.2, 6, { freq: 5000, gain: 0.02 }); },
  },
  lightning: { prio: 6, cd: 0.1, max: 3, send: 0.2, drive: 1.8, play: (v) => { M.zapBurst(v, 0, 1, 0.3); v.tone(0, 0.2, { freq: 1800, to: 600, type: 'sawtooth', gain: 0.02 }); M.rumble(v, 0.05, 0.8, 0.7); } },
  thunder_small: { prio: 6, cd: 0.14, max: 3, send: 0.25, drive: 1.6, duck: 0.2, play: (v) => { M.zapBurst(v, 0, 1.1, 0.22); M.rumble(v, 0.02, 1, 0.9); } },
  /**
   * Weather thunder: the flash first, the sound after it (a near strike a
   * sharp clap at once, a far one a dull roll seconds later) — a few strikes
   * close together, then the rolling rumble and its echo off the sea.
   */
  thunder: {
    prio: 5, cd: 1, max: 2, send: 0.4, drive: 1, duck: 0.15,
    play(v, k) {
      const far = k.far ?? Math.random(), d = 0.08 + far * 2.2, s = 1 - far * 0.45;
      if (far < 0.5) for (const [at, g] of [[0, 0.4], [0.03, 0.25], [0.08, 0.3], [0.17, 0.15]]) v.noise(d + at, 0.04, { type: 'highpass', freq: 1500, gain: g * s * (1 - far), attack: 0.001 });
      v.noise(d, 0.15, { freq: 3000 - far * 2000, sweep: 700, gain: 0.25 * s, attack: 0.003 });
      M.rumble(v, d + 0.05, 1.5 * s, 2.4, { lp: 300 - far * 150 });
      const e = v.echo(0.55, 0.3, 400, 0.4);
      v.noise(d + 0.1, 1.2, { color: 'brown', type: 'lowpass', freq: 200, gain: 0.3 * s, dest: e });
    },
  },
  water: { prio: 5, cd: 0.07, max: 3, send: 0.12, play: (v) => { v.thump(0, { f0: 140, f1: 60, dur: 0.08, gain: 0.2 }); M.splash(v, 0, 0.9); } },
  swamp: {
    prio: 5, cd: 0.08, max: 3, send: 0.1,
    play(v) { v.bubbles(0, 0.45, 7, { f: 150, spread: 0.6, rise: 1.6, gain: 0.12, dur: 0.12 }); v.noise(0, 0.4, { type: 'lowpass', freq: 300, gain: 0.2 }); },
  },
  poison: {
    prio: 5, cd: 0.08, max: 3, send: 0.12,
    play(v) {
      M.hiss(v, 0, 0.5, 1, 6000);
      v.crackle(0.02, 0.4, 12, { freq: 5000, gain: 0.035, q: 3 });
      v.bubbles(0.03, 0.35, 5, { f: 700, gain: 0.04 });
      v.tone(0, 0.45, { freq: 180, to: 120, type: 'sawtooth', gain: 0.06, vib: { rate: 9, depth: 18 } });
    },
  },
  gas: { prio: 4, cd: 0.1, max: 2, send: 0.1, play: (v) => { v.noise(0, 0.55, { type: 'highpass', freq: 4500, q: 0.4, sweep: 2500, gain: 0.12, attack: 0.05 }); v.noise(0, 0.3, { type: 'lowpass', freq: 500, gain: 0.08, attack: 0.03 }); } },
  smoke: { prio: 5, cd: 0.07, max: 3, send: 0.15, play: (v) => { v.noise(0, 0.4, { type: 'lowpass', freq: 650 * r(), q: 0.5, sweep: 220, gain: 0.3, attack: 0.03 }); v.whoosh(0, 0.3, { f0: 300, f1: 900, gain: 0.08, color: 'pink' }); } },
  sand: {
    prio: 5, cd: 0.07, max: 3, send: 0.1,
    play(v) {
      v.noise(0, 0.42, { freq: 1900 * r(), q: 0.45, sweep: 900, gain: 0.22, attack: 0.02 });
      v.crackle(0, 0.4, 22, { freq: 4200, gain: 0.045, q: 2.5 });
      v.noise(0.02, 0.3, { type: 'highpass', freq: 3200, gain: 0.05, attack: 0.03 });
    },
  },
  /** PIKA: a bright flash of light that lands with weight (a kick at the speed of light). */
  light: {
    prio: 6, cd: 0.05, max: 3, send: 0.45,
    play(v) {
      v.noise(0, 0.008, { type: 'highpass', freq: 6000, gain: 0.25, attack: 0.0005 });
      v.thump(0, { f0: 160, f1: 60, dur: 0.12, gain: 0.3 });
      v.tone(0, 0.3, { freq: 1760, to: 3520, gain: 0.1, attack: 0.002 });
      v.ring(0.03, 2640, 0.55, 0.03, [1, 1.5, 2]);
      M.shimmer(v, 0.02, 0.8, 0.45);
    },
  },
  /** ZUZUZU: darkness swallowing — a slow swell inward, a sub, grit. */
  dark: {
    prio: 6, cd: 0.08, max: 3, send: 0.3, drive: 1.5,
    play(v) {
      M.suction(v, 0, 0.5, 1);
      v.tone(0, 0.5, { freq: 55, to: 30, gain: 0.42, attack: 0.15 });
      v.crackle(0.05, 0.4, 8, { freq: 900, gain: 0.06, q: 1.5 });
    },
  },
  /** GOGOGO: the air cracks like glass, then the DOGOON and the shaking ground. */
  quake: {
    prio: 8, cd: 0.1, max: 2, send: 0.3, drive: 2.5, duck: 0.5,
    play(v) {
      M.glassCrack(v, 0, 1);
      M.boom(v, 0.01, 1, { f0: 90, f1: 26, dur: 0.7 });
      v.tone(0.05, 0.9, { freq: 48, to: 30, gain: 0.45, vib: { rate: 14, depth: 6 } });
      v.noise(0.05, 0.9, { color: 'brown', type: 'lowpass', freq: 300, gain: 0.4 });
      v.crackle(0.1, 0.7, 10, { freq: 800, gain: 0.08 });
    },
  },
  /** PIN: a wire-thin string — a twang, the whip of it. */
  string: {
    prio: 5, cd: 0.06, max: 3, send: 0.15,
    play(v) {
      v.noise(0, 0.02, { type: 'highpass', freq: 3500, gain: 0.25, attack: 0.0006 });
      v.ring(0, rnd(1500, 1800), 0.32, 0.05, [1, 2.01, 3.03, 4.05], { spread: 0.004 });
      v.whoosh(0, 0.09, { f0: 3000, f1: 6000, q: 2, gain: 0.07, peak: 0.3 });
    },
  },
  /** DOKAAN: crack, boom, the blast rolling away, debris — and the echo of it. */
  explosion: {
    prio: 8, cd: 0.06, max: 3, send: 0.35, drive: 3, duck: 0.6,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.05, { type: 'highpass', freq: 1500, gain: 0.5 * s, attack: 0.0008 });
      v.thump(0, { f0: 72, f1: 26, dur: 0.9, gain: 0.85 * s });
      v.noise(0, 1.1, { color: 'pink', type: 'lowpass', freq: 900, sweep: 55, gain: 0.7 * s });
      v.crackle(0.08, 0.7, 16, { freq: 1800, gain: 0.1 });
      const e = v.echo(0.28, 0.3, 900, 0.32);
      v.noise(0, 0.5, { color: 'pink', type: 'lowpass', freq: 700, gain: 0.4 * s, dest: e });
    },
  },
  /** BOOM — and the echo off the water. */
  cannon: {
    prio: 7, cd: 0.05, max: 3, send: 0.45, drive: 2.6, duck: 0.5, variants: 3,
    play(v, k) {
      v.noise(0, 0.04, { type: 'highpass', freq: 1600, gain: 0.5, attack: 0.0008 });
      v.thump(0, { f0: [88, 80, 96][k.rr] * r(), f1: 30, dur: 0.8, gain: 0.85 });
      v.noise(0, 1.3, { color: 'pink', type: 'lowpass', freq: 600, sweep: 60, gain: 0.55 });
      v.noise(0.05, 0.4, { type: 'highpass', freq: 3000, gain: 0.04, attack: 0.05 });
      const e = v.echo(0.42, 0.32, 700, 0.4);
      v.noise(0, 0.6, { color: 'pink', type: 'lowpass', freq: 500, gain: 0.45, dest: e });
    },
  },
  /** A hull striking rock (or another hull): a crunch of timber, splinters, the groan of it, spray. */
  crash: {
    prio: 7, cd: 0.15, max: 2, send: 0.2, drive: 1.5, duck: 0.3,
    play(v) {
      v.thump(0, { f0: 100, f1: 45, dur: 0.3, gain: 0.42 });
      v.noise(0, 0.5, { type: 'lowpass', freq: 320, gain: 0.5 });
      v.crackle(0, 0.45, 16, { freq: 1300, gain: 0.12, q: 4 });
      v.creak(0.05, 0.6, { rate: 42, rate1: 24, freqs: [180, 310, 520], q: 5, gain: 0.14 });
      v.noise(0.03, 0.4, { type: 'lowpass', freq: 900, sweep: 250, gain: 0.14 });
    },
  },
  /** Out of shot: the hammer falls on nothing. */
  dry: {
    prio: 6, cd: 0.3, max: 1, send: 0.08,
    play(v) {
      v.noise(0, 0.035, { freq: 3200, q: 3, gain: 0.32, attack: 0.001 });
      v.ring(0.001, 2400, 0.08, 0.03, [1, 2.7]);
      v.noise(0.09, 0.03, { freq: 2400, q: 3, gain: 0.2, attack: 0.001 });
    },
  },

  // ---- moving about
  /** A hop: a push-off scuff on what's underfoot and the rustle of clothes going up (not a ping). */
  jump: {
    prio: 5, cd: 0.1, max: 2, variants: 3,
    play(v, k) {
      v.thump(0, { f0: 95, f1: 60, dur: 0.07, gain: 0.12 });
      surfaceHit(v, 0, k.surf || 'dirt', 1.3);
      v.whoosh(0.012, 0.18, { f0: [600, 700, 520][k.rr] * r(), f1: 1800, q: 0.8, gain: 0.13, peak: 0.4, flutter: 22 });
    },
  },
  /** A charged leap: a heavy push, a burst of what's underfoot, air rushing past going up. */
  jump_big: {
    prio: 6, cd: 0.15, max: 2, send: 0.06, variants: 3,
    play(v, k) {
      v.thump(0, { f0: [120, 110, 132][k.rr] * r(), f1: 55, dur: 0.12, gain: 0.3 });
      surfaceHit(v, 0, k.surf || 'dirt', 1.8);
      v.crackle(0.005, 0.1, 5, { freq: 1600, gain: 0.04 });
      v.whoosh(0.01, 0.38, { f0: [400, 480, 360][k.rr], f1: 2600, q: 0.7, gain: 0.17, peak: 0.35, flutter: 18 });
      v.tone(0, 0.12, { freq: 90, to: 140, gain: 0.08 });
    },
  },
  /** Coming down from a jump: both feet on what's underfoot, the clothes settling. */
  land: {
    prio: 5, cd: 0.1, max: 2,
    play(v, k) {
      const s = clamp(k.s ?? 0.8, 0.3, 1.2);
      v.thump(0, { f0: 100, f1: 48, dur: 0.09, gain: 0.22 * s });
      surfaceHit(v, 0, k.surf || 'dirt', s);
      surfaceHit(v, 0.035, k.surf || 'dirt', s * 0.6);
      v.whoosh(0.01, 0.12, { f0: 1500, f1: 600, gain: 0.03 * s, peak: 0.3 });
    },
  },
  /** A hard landing: a heavy thud, debris, dust. */
  land_heavy: {
    prio: 6, cd: 0.15, max: 2, send: 0.1, drive: 1.4, duck: 0.15,
    play(v, k) {
      v.noise(0, 0.18, { type: 'lowpass', freq: 260, gain: 0.42 });
      v.thump(0, { f0: 110, f1: 40, dur: 0.2, gain: 0.45 });
      surfaceHit(v, 0, k.surf || 'dirt', 1.6);
      v.crackle(0.01, 0.15, 5, { freq: 1200, gain: 0.05 });
    },
  },
  /** Into the water: the surface breaks, the plunge, bubbles, spray falling back. */
  splash: { prio: 5, cd: 0.18, max: 2, send: 0.08, play: (v) => M.splash(v, 0, 1) },
  /** Into the water from a height (or something big in it). */
  splash_big: {
    prio: 6, cd: 0.25, max: 2, send: 0.15, duck: 0.15,
    play(v) {
      v.noise(0, 0.75, { type: 'lowpass', freq: 950, q: 0.4, sweep: 140, gain: 0.45 });
      v.thump(0, { f0: 90, f1: 42, dur: 0.3, gain: 0.3 });
      v.noise(0.05, 0.4, { freq: 2600, q: 0.6, sweep: 900, gain: 0.1 });
      v.bubbles(0.05, 0.5, 14, { f: 260, spread: 0.9, gain: 0.07 });
      M.drips(v, 0.2, 0.7, 8, 1.2);
    },
  },
  /** Leaping out of the water: it parts with a bloop, then the drips. */
  splash_out: {
    prio: 5, cd: 0.2, max: 2,
    play(v) {
      v.noise(0, 0.35, { freq: 1300, q: 0.5, sweep: 420, gain: 0.24 });
      v.tone(0.04, 0.12, { freq: 300, to: 620, gain: 0.07 });
      M.drips(v, 0.15, 0.6, 6, 1);
    },
  },
  /** Wading: water sloshing round the legs. */
  wade: {
    prio: 3, cd: 0.18, max: 2, variants: 3,
    play(v, k) {
      v.noise(0, 0.2, { freq: [1400, 1200, 1650][k.rr] * r(), q: 0.8, sweep: 600, gain: 0.09 });
      v.noise(0, 0.16, { type: 'lowpass', freq: 500, gain: 0.08, attack: 0.02 });
      v.bubbles(0.02, 0.12, 2, { f: 700, gain: 0.025 });
    },
  },
  /** Breaking the surface out of breath: a long, hungry gulp of air. */
  gasp: {
    prio: 7, cd: 1, max: 1,
    play(v) {
      v.noise(0, 0.1, { freq: 1200, sweep: 500, gain: 0.12 });
      v.formant(0.03, 0.5, { f1: 800, f2: 1600, to1: 1100, to2: 2300, q: 3, gain: 0.45, attack: 0.08 });
      v.formant(0.6, 0.3, { f1: 700, f2: 1200, to1: 500, to2: 900, q: 3, gain: 0.18, attack: 0.04 });
      M.drips(v, 0.05, 0.5, 4, 0.8);
    },
  },
  /** Out of air under water: the last bubbles gurgling out, a muffled cough. */
  choke: {
    prio: 7, cd: 0.5, max: 1,
    play(v) {
      for (let i = 0; i < 5; i++) v.tone(i * 0.07 * r(), 0.08, { freq: 170 + Math.random() * 140, to: 420 + Math.random() * 200, gain: 0.12 });
      v.noise(0, 0.35, { type: 'lowpass', freq: 380, gain: 0.12 });
      v.formant(0.1, 0.18, { f1: 400, f2: 800, q: 3, gain: 0.3, attack: 0.01 });
    },
  },
  // ---- swimming (played in time with the strokes: see foley.js)
  /** The breaststroke's pull: the arms sweeping the water back, a swirl and a little splash. */
  swim_pull: {
    prio: 4, cd: 0.25, max: 2, variants: 3,
    play(v, k) {
      v.whoosh(0, 0.36, { f0: [520, 460, 600][k.rr], f1: 300, q: 0.8, gain: 0.2, peak: 0.4, color: 'pink' });
      v.noise(0.03, 0.16, { type: 'lowpass', freq: 1600, sweep: 600, gain: 0.08 });
      v.bubbles(0.05, 0.2, 2, { f: 480, gain: 0.03 });
    },
  },
  /** The frog kick: the water shoved back, a splash at the heels. */
  swim_kick: {
    prio: 4, cd: 0.25, max: 2,
    play(v) {
      v.thump(0, { f0: 95, f1: 60, dur: 0.09, gain: 0.07 });
      v.noise(0, 0.22, { type: 'lowpass', freq: 1300, sweep: 400, gain: 0.07, attack: 0.01 });
      M.drips(v, 0.08, 0.25, 2, 0.7);
    },
  },
  /** The breath at the top of the stroke. */
  swim_breath: { prio: 3, cd: 0.6, max: 1, play: (v) => v.formant(0, 0.13, { f1: 700, f2: 1250, to1: 600, to2: 1100, q: 3, gain: 0.15, attack: 0.02 }) },
  /** A stroke under water: a muffled sweep and a few bubbles. */
  swim_under: {
    prio: 4, cd: 0.3, max: 2,
    play(v) { v.whoosh(0, 0.42, { f0: 320, f1: 180, q: 0.7, gain: 0.25, peak: 0.45, color: 'pink' }); v.bubbles(0.05, 0.3, 3, { f: 420, gain: 0.05 }); },
  },
  /** Treading water: a gentle slosh. */
  tread: { prio: 3, cd: 0.6, max: 1, play: (v) => { v.noise(0, 0.26, { type: 'lowpass', freq: 900, sweep: 500, gain: 0.08, attack: 0.04 }); v.bubble(0.08, { f: rnd(400, 600), gain: 0.03 }); } },
  /** Thrashing at the surface (a Devil Fruit user who can't swim). */
  thrash: {
    prio: 5, cd: 0.15, max: 2,
    play(v) { v.noise(0, 0.2, { type: 'lowpass', freq: 2000, sweep: 500, gain: 0.12, attack: 0.004 }); v.bubbles(0.02, 0.15, 3, { f: 450, gain: 0.04 }); M.drips(v, 0.1, 0.3, 3, 1); },
  },
  /** Going under: a gloop, and a burst of bubbles. */
  dive: {
    prio: 6, cd: 0.4, max: 1,
    play(v) {
      v.noise(0, 0.25, { type: 'lowpass', freq: 900, sweep: 300, gain: 0.15 });
      v.thump(0, { f0: 120, f1: 60, dur: 0.12, gain: 0.12 });
      v.bubbles(0.02, 0.35, 8, { f: 480, spread: 0.9, gain: 0.05 });
    },
  },
  /** The head breaking the surface: water running off, a breath out. */
  surface: {
    prio: 5, cd: 0.4, max: 1,
    play(v) {
      v.noise(0, 0.22, { freq: 1500, sweep: 600, q: 0.6, gain: 0.08 });
      M.drips(v, 0.05, 0.4, 4, 0.8);
      v.formant(0.06, 0.16, { f1: 600, f2: 1100, q: 4, gain: 0.15, attack: 0.01 });
    },
  },
  /** A scramble up a ledge: hands slapping on, boots scraping, the clothes. */
  climb: {
    prio: 5, cd: 0.3, max: 1,
    play(v, k) {
      v.thump(0, { f0: 160, f1: 100, dur: 0.05, gain: 0.1 });
      surfaceHit(v, 0.01, k.surf || 'stone', 0.7);
      v.noise(0.12, 0.25, { freq: 1500, q: 0.8, gain: 0.04, attack: 0.03 });
      v.whoosh(0.05, 0.3, { f0: 600, f1: 1600, gain: 0.04, flutter: 20 });
      surfaceHit(v, 0.32, k.surf || 'stone', 0.5);
    },
  },
  /** A step up onto a boat, a plank or a ladder: wood under the boot, the hull answering. */
  board: {
    prio: 5, cd: 0.1, max: 2, send: 0.06,
    play(v) {
      v.noise(0, 0.1, { freq: 280 * r(), q: 1.2, gain: 0.22, attack: 0.002 });
      v.thump(0, { f0: 140, f1: 90, dur: 0.07, gain: 0.12 });
      v.tone(0.01, 0.18, { freq: 110 * r(), to: 96, gain: 0.07 });
      v.creak(0.06, 0.25, { rate: 70, rate1: 50, freqs: [250, 395, 560], gain: 0.05 });
    },
  },
  step: {
    prio: 4, cd: 0.08, max: 2,
    play(v, k) {
      // (a hand on a ladder's rung: a wooden knock)
      v.noise(0, 0.05, { freq: 900 * r(), q: 2.5, gain: 0.12, attack: 0.001 });
      v.tone(0, 0.06, { freq: 240 * r(), to: 190, gain: 0.07 });
      if (k.creak) v.creak(0.02, 0.2, { rate: 80, rate1: 60, freqs: [300, 520, 760], gain: 0.04 });
    },
  },

  // ---- the ship
  /** An oar's blade dipping in at the catch: a plunk and a gulp of water. */
  oar_catch: {
    prio: 4, cd: 0.05, max: 3,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.12, { type: 'lowpass', freq: 900, sweep: 300, gain: 0.12 * s });
      v.bubble(0.004, { f: rnd(230, 300), rise: 1.5, dur: 0.08, gain: 0.08 * s });
      v.bubbles(0.01, 0.08, 3, { f: 520, gain: 0.03 * s });
    },
  },
  /** The drive: water swirling past the blade, the oarlock squeaking under the load. */
  oar_pull: {
    prio: 4, cd: 0.1, max: 3,
    play(v, k) {
      const s = k.s || 1, d = k.dur || 0.45;
      v.whoosh(0, d, { f0: 400, f1: 260, q: 0.8, gain: 0.24 * s, peak: 0.45, color: 'pink' });
      v.bubbles(0.05, d * 0.8, 4, { f: 300, gain: 0.04 * s });
      v.creak(0, 0.18, { rate: 140, rate1: 90, freqs: [600, 950, 1400], q: 8, gain: 0.1 * s });
    },
  },
  /** The blade lifting out: a swish, drips running off it, the oar knocking in its lock on the return. */
  oar_release: {
    prio: 3, cd: 0.1, max: 3,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.15, { freq: 1500, sweep: 800, q: 0.8, gain: 0.05 * s });
      M.drips(v, 0.05, 0.35, 3, s);
      v.thump(0.13, { f0: 320, f1: 200, dur: 0.03, gain: 0.05 * s });
    },
  },
  /** Letting go the anchor: the windlass spinning, the chain running out, the splash. */
  anchor_drop: {
    prio: 5, cd: 1, max: 1, send: 0.1,
    play(v) {
      for (let i = 0; i < 16; i++) v.noise(i * 0.065 * (1 + i * 0.02), 0.006, { freq: 2400, q: 6, gain: 0.05, attack: 0.0005 });
      M.chain(v, 0.02, 1.2, 18, 1);
      M.splash(v, 0.55, 0.9);
    },
  },
  /** Weighing anchor: the windlass clacking round, the chain coming in, water running off it. */
  anchor_weigh: {
    prio: 5, cd: 1, max: 1, send: 0.1,
    play(v) {
      for (let i = 0; i < 9; i++) { v.noise(i * 0.16, 0.012, { freq: 1600, q: 4, gain: 0.07, attack: 0.0006 }); v.thump(i * 0.16, { f0: 260, f1: 180, dur: 0.03, gain: 0.04 }); }
      M.chain(v, 0.05, 1.3, 10, 0.8);
      M.drips(v, 0.2, 1.2, 8, 0.8);
    },
  },
  /** Sails set: canvas unfurling and filling with a flap or two, the halyard squealing through its block. */
  sail_raise: {
    prio: 5, cd: 0.8, max: 1, send: 0.06,
    play(v) {
      v.whoosh(0, 0.7, { f0: 300, f1: 1200, q: 0.6, gain: 0.12, peak: 0.3, flutter: 9, color: 'pink' });
      for (const [t, g] of [[0.15, 0.14], [0.36, 0.1], [0.62, 0.07]]) v.noise(t, 0.08, { type: 'lowpass', freq: 800, gain: g, attack: 0.004 });
      v.creak(0, 0.55, { rate: 220, rate1: 160, freqs: [900, 1500, 2200], q: 9, gain: 0.035 });
    },
  },
  /** Sails struck: the canvas spilling its wind and coming down, the boom thudding home. */
  sail_lower: {
    prio: 5, cd: 0.8, max: 1, send: 0.06,
    play(v) {
      v.whoosh(0, 0.6, { f0: 1100, f1: 300, q: 0.6, gain: 0.1, peak: 0.25, flutter: 7, color: 'pink' });
      v.creak(0.05, 0.4, { rate: 180, rate1: 230, freqs: [900, 1500, 2200], q: 9, gain: 0.03 });
      v.thump(0.55, { f0: 140, f1: 90, dur: 0.08, gain: 0.12 });
    },
  },
  /** The wheel turning: a spoke clicking past the pawl. */
  helm: { prio: 3, cd: 0.05, max: 2, play: (v) => { v.noise(0, 0.015, { freq: 1800 * r(), q: 4, gain: 0.1, attack: 0.0006 }); v.tone(0, 0.025, { freq: 620 * r(), to: 520, gain: 0.04 }); } },
  /** The hull groaning on a swell (stick-slip in the timbers). */
  hull_creak: {
    prio: 2, cd: 0.4, max: 2, send: 0.1,
    play(v, k) {
      const d = rnd(0.5, 1.2) * (k.s || 1);
      v.creak(0, d, { rate: rnd(28, 60), rate1: rnd(22, 70), freqs: [120, 210, 340, 520], q: 5, gain: rnd(0.06, 0.12) * (k.s || 1), attack: rnd(0.3, 0.6) });
    },
  },
  /** Rigging working: a line creaking through a block, the slap of a slack sheet. */
  rigging: {
    prio: 2, cd: 0.4, max: 2, send: 0.08,
    play(v) {
      if (Math.random() < 0.5) v.creak(0, rnd(0.25, 0.5), { rate: rnd(120, 200), rate1: rnd(90, 160), freqs: [500, 800, 1250], q: 8, gain: 0.04 });
      else { v.noise(0, 0.06, { type: 'lowpass', freq: 600, gain: 0.08, attack: 0.003 }); v.noise(0.08, 0.05, { type: 'lowpass', freq: 500, gain: 0.04 }); }
      if (Math.random() < 0.4) v.noise(0.03, 0.012, { freq: 1400, q: 4, gain: 0.05, attack: 0.0006 });
    },
  },
  /** A wave slapping the hull (and the spray off the bow). */
  hull_slap: {
    prio: 2, cd: 0.25, max: 2,
    play(v, k) {
      const s = k.s || 1;
      v.noise(0, 0.22, { type: 'lowpass', freq: 1100, sweep: 300, gain: 0.12 * s, attack: 0.01 });
      v.thump(0, { f0: 120, f1: 70, dur: 0.1, gain: 0.08 * s });
      if (s > 0.8) M.drips(v, 0.08, 0.4, 4, s * 0.8);
    },
  },

  // ---- doors, loot and the like
  knock: {
    prio: 5, cd: 0.4, max: 1, send: 0.12,
    play(v) {
      [0, 0.17, 0.34].forEach((t) => {
        v.noise(t, 0.07, { freq: 900 * r(), q: 3, gain: 0.25 });
        v.noise(t, 0.07, { freq: 260 * r(), q: 1.6, gain: 0.45 });
        v.tone(t, 0.09, { freq: 200 * r(), to: 150, gain: 0.22 });
      });
    },
  },
  /** The latch clicks, the hinges creak (opening a chest: the lid). */
  door: {
    prio: 5, cd: 0.2, max: 2, send: 0.1,
    play(v, k) {
      if (k.chest) {
        v.ring(0, 1800, 0.08, 0.03, [1, 2.4]);
        v.noise(0, 0.015, { freq: 2600, q: 3, gain: 0.15, attack: 0.0006 });
        v.creak(0.04, 0.45, { rate: 50, rate1: 85, freqs: [300, 520, 760], q: 6, gain: 0.08 });
        v.thump(0.42, { f0: 160, f1: 110, dur: 0.07, gain: 0.12 });
        return;
      }
      v.noise(0, 0.03, { freq: 2600, q: 2, gain: 0.2, attack: 0.001 });
      v.ring(0.002, 1500, 0.08, 0.02, [1, 2.3]);
      v.creak(0.04, 0.5, { rate: 70 * r(), rate1: 110, freqs: [400, 650, 900, 1300], q: 7, gain: 0.2 });
      v.noise(0.04, 0.3, { freq: 900, q: 0.6, gain: 0.06 });
    },
  },
  doorshut: {
    prio: 5, cd: 0.2, max: 2, send: 0.12,
    play(v) {
      v.noise(0, 0.12, { type: 'lowpass', freq: 220, gain: 0.32 });
      v.thump(0, { f0: 95, f1: 60, dur: 0.12, gain: 0.3 });
      v.noise(0.04, 0.02, { freq: 2600, q: 3, gain: 0.1, attack: 0.0008 });
    },
  },
  /** BAKOOM: a door kicked in — splintering timber, the crash of it. */
  doorbreak: {
    prio: 7, cd: 0.3, max: 1, send: 0.2, drive: 2, duck: 0.3,
    play(v) {
      v.noise(0, 0.6, { type: 'lowpass', freq: 320, gain: 0.7 });
      v.noise(0, 0.35, { freq: 2600, sweep: 700, gain: 0.3 });
      v.thump(0, { f0: 110, f1: 45, dur: 0.3, gain: 0.5 });
      v.crackle(0, 0.4, 14, { freq: 1500, gain: 0.12, q: 4 });
      v.creak(0.05, 0.3, { rate: 50, rate1: 30, freqs: [200, 340, 520], gain: 0.1 });
    },
  },
  /** Coins: a bright two-note "kaching" over a little clatter. */
  coin: {
    prio: 6, cd: 0.05, max: 2, send: 0.15, bus: 'ui',
    play(v) {
      for (let i = 0; i < 3; i++) v.ring(i * 0.03 + Math.random() * 0.02, rnd(3800, 5200), 0.07, 0.015, [1, 2.4]);
      v.ring(0, 1568, 0.18, 0.07, [1, 2.76]);
      v.ring(0.07, 2093, 0.3, 0.07, [1, 2.76]);
    },
  },
  treasure: {
    prio: 7, cd: 0.3, max: 1, send: 0.3, bus: 'ui', duck: 0.25,
    play(v) {
      [523, 659, 784, 1046].forEach((f, i) => v.tone(i * 0.09, 0.35, { freq: f, type: 'triangle', gain: 0.14 }));
      v.ring(0.36, 2093, 0.5, 0.04, [1, 2.76, 5.4]);
      M.chain(v, 0, 0.3, 5, 0.6);
    },
  },
  bell: { prio: 6, cd: 1, max: 1, send: 0.5, play: (v) => v.ring(0, 196, 3.2, 0.2, [0.5, 1, 1.2, 1.5, 2, 2.6, 3.0]) },
  /** Eating: a few bites and chews, and a gulp. */
  eat: {
    prio: 5, cd: 0.3, max: 1,
    play(v) {
      for (const t of [0, 0.13, 0.24]) { v.noise(t, 0.07, { freq: rnd(900, 1400), q: 1.2, gain: 0.16 }); v.crackle(t, 0.05, 3, { freq: 2600, gain: 0.04 }); }
      v.tone(0.4, 0.12, { freq: 300, to: 120, gain: 0.08 });
      v.formant(0.4, 0.1, { f1: 300, f2: 700, q: 3, gain: 0.15, attack: 0.01 });
    },
  },
  /** CHOMP: teeth through something crisp, a little crunch after. */
  bite: {
    prio: 5, cd: 0.18, max: 1, variants: 3,
    play(v, k) {
      v.noise(0, 0.05, { freq: [1800, 1500, 2100][k.rr] * r(), q: 1.4, gain: 0.22, attack: 0.002 });
      v.crackle(0.02, 0.12, 5, { freq: 2600, gain: 0.07 });
      v.tone(0, 0.07, { freq: 150 * r(), to: 90, gain: 0.12 });
    },
  },
  /** Gear: a leather creak and a buckle's clink (a blade drawn: a "shing"; sheathed: the guard's click). */
  equip: {
    prio: 5, cd: 0.05, max: 2, send: 0.08,
    play(v, k) {
      if (k.draw === 'sword') {
        v.noise(0, 0.25, { freq: 3500, sweep: 6500, q: 3, gain: 0.08, attack: 0.05, curve: 'lin' });
        v.ring(0.22, rnd(2100, 2400), 0.5, 0.03, [1, 2.04, 2.75]);
        return;
      }
      if (k.draw === 'sheathe') {
        v.noise(0, 0.18, { freq: 4000, sweep: 2000, q: 3, gain: 0.06 });
        v.noise(0.19, 0.01, { type: 'highpass', freq: 4000, gain: 0.18, attack: 0.0006 });
        v.ring(0.19, 1900, 0.12, 0.04, [1, 2.3]);
        return;
      }
      if (k.draw === 'gun') { for (const t of [0, 0.09]) { v.noise(t, 0.02, { freq: 3000, q: 3, gain: 0.2, attack: 0.0006 }); v.ring(t, 2200, 0.06, 0.02, [1, 2.7]); } return; }
      v.noise(0, 0.05, { freq: 2000, q: 1, gain: 0.1, attack: 0.004 });
      v.noise(0, 0.03, { freq: 3500, q: 1.5, gain: 0.12, attack: 0.001 });
      v.ring(0.01, 1900, 0.18, 0.045, [1, 1.6]);
    },
  },
  page: {
    prio: 5, cd: 0.1, max: 1, bus: 'ui',
    play(v) {
      v.noise(0, 0.12, { type: 'highpass', freq: 3000, gain: 0.07, attack: 0.01 });
      v.noise(0.08, 0.14, { freq: 4000, q: 0.6, gain: 0.05, attack: 0.02 });
      v.whoosh(0.02, 0.2, { f0: 1500, f1: 3000, gain: 0.02, flutter: 30 });
    },
  },
  reveal: { prio: 7, cd: 0.3, max: 1, send: 0.3, bus: 'ui', play: (v) => [392, 494, 587].forEach((f, i) => v.tone(i * 0.1, 0.4, { freq: f, type: 'triangle', gain: 0.16 })) },
  /** Ta-ta-ta-DAAA: a brassy run up to a held chord. */
  fanfare: {
    prio: 8, cd: 0.5, max: 1, send: 0.35, drive: 0.4, bus: 'ui', duck: 0.5,
    play(v) {
      [523, 659, 784, 1046].forEach((f, i) => { v.tone(i * 0.1, 0.24, { freq: f, type: 'sawtooth', gain: 0.06 }); v.tone(i * 0.1, 0.24, { freq: f, type: 'triangle', gain: 0.12 }); });
      [523, 659, 784, 1046].forEach((f) => v.tone(0.42, 0.95, { freq: f, type: 'triangle', gain: 0.065, attack: 0.02 }));
      v.ring(0.42, 2093, 0.6, 0.03, [1, 2.76]);
    },
  },
  breakthrough: {
    prio: 8, cd: 0.5, max: 1, send: 0.35, drive: 0.6, bus: 'ui', duck: 0.4,
    play(v) {
      [440, 554, 659, 880].forEach((f, i) => v.tone(i * 0.07, 0.45, { freq: f, type: 'sawtooth', gain: 0.06 }));
      v.tone(0, 0.6, { freq: 55, to: 110, gain: 0.2 });
      M.shimmer(v, 0.25, 0.8, 0.6);
    },
  },
  /** A Sea King rising: the water heaving, and its roar. */
  seaking: {
    prio: 8, cd: 1, max: 1, send: 0.5, drive: 1.5, duck: 0.4,
    play(v) {
      v.noise(0, 1.2, { type: 'lowpass', freq: 700, sweep: 200, gain: 0.3, attack: 0.2 });
      M.roar(v, 0.25, 1.2, 1.6, 64);
      v.tone(0.2, 1.8, { freq: 72, to: 44, type: 'sawtooth', gain: 0.2, attack: 0.3, vib: { rate: 3, depth: 4 } });
      M.drips(v, 0.6, 1.2, 10, 1.4);
    },
  },

  // ---- menus and milestones (on the ui bus: never muffled, never far away)
  ui_hover: { prio: 2, cd: 0.04, max: 2, bus: 'ui', play: (v) => { v.noise(0, 0.012, { freq: 4200, q: 3, gain: 0.05, attack: 0.0006 }); v.tone(0, 0.02, { freq: 2400, gain: 0.016 }); } },
  ui_click: { prio: 4, cd: 0.03, max: 2, bus: 'ui', play: (v) => { v.tone(0, 0.035, { freq: 900, to: 700, gain: 0.05 }); v.noise(0, 0.015, { freq: 2500, q: 2, gain: 0.05, attack: 0.0006 }); } },
  ui_open: { prio: 4, cd: 0.08, max: 1, bus: 'ui', play: (v) => { v.whoosh(0, 0.12, { f0: 900, f1: 2400, gain: 0.05, peak: 0.6 }); v.tone(0.05, 0.07, { freq: 520, to: 480, type: 'triangle', gain: 0.04 }); } },
  ui_close: { prio: 4, cd: 0.08, max: 1, bus: 'ui', play: (v) => { v.whoosh(0, 0.1, { f0: 2200, f1: 800, gain: 0.04, peak: 0.3 }); v.tone(0, 0.06, { freq: 440, to: 400, type: 'triangle', gain: 0.035 }); } },
  /** A quest taken on: a scroll unrolled, a two-note horn call. */
  quest_accept: {
    prio: 7, cd: 0.5, max: 1, bus: 'ui', send: 0.2, duck: 0.25,
    play(v) {
      v.noise(0, 0.25, { freq: 3500, q: 0.7, gain: 0.04, attack: 0.03 });
      v.tone(0.08, 0.22, { freq: 392, type: 'triangle', gain: 0.1 });
      v.tone(0.08, 0.22, { freq: 392, type: 'sawtooth', gain: 0.025 });
      v.tone(0.3, 0.5, { freq: 523, type: 'triangle', gain: 0.11, attack: 0.02 });
      v.tone(0.3, 0.5, { freq: 523, type: 'sawtooth', gain: 0.025, attack: 0.02 });
    },
  },
  quest_update: { prio: 6, cd: 0.4, max: 1, bus: 'ui', send: 0.2, play: (v) => { M.chime(v, 0, 0.8, [1568, 2093], 0.6); } },
  /** A quest done: a bright arpeggio and a shimmer. */
  quest_complete: {
    prio: 8, cd: 0.5, max: 1, bus: 'ui', send: 0.3, duck: 0.45,
    play(v) {
      [523, 659, 784, 1046, 1318].forEach((f, i) => v.tone(i * 0.075, 0.5, { freq: f, type: 'triangle', gain: 0.1 }));
      v.tone(0.38, 0.9, { freq: 523, type: 'sawtooth', gain: 0.02, attack: 0.03 });
      M.shimmer(v, 0.3, 0.8, 0.7);
    },
  },
  /** A new technique: a rising sparkle and a ping. */
  unlock: {
    prio: 7, cd: 0.5, max: 1, bus: 'ui', send: 0.3, duck: 0.3,
    play(v) { M.shimmer(v, 0, 1, 0.6); [784, 1175, 1568].forEach((f, i) => v.tone(0.1 + i * 0.06, 0.5, { freq: f, type: 'triangle', gain: 0.07 })); },
  },
  /** Your bounty raised: DON! — and the wanted poster slapped up. */
  bounty: {
    prio: 7, cd: 1, max: 1, bus: 'ui', send: 0.3, duck: 0.4,
    play(v) {
      v.thump(0, { f0: 100, f1: 36, dur: 0.5, gain: 0.5 });
      v.noise(0, 0.4, { color: 'pink', type: 'lowpass', freq: 500, sweep: 90, gain: 0.25 });
      v.noise(0.12, 0.05, { freq: 2200, q: 0.8, gain: 0.12, attack: 0.002 });
      v.noise(0.12, 0.2, { type: 'highpass', freq: 3000, gain: 0.03 });
    },
  },
  /** A wild fruit picked: leaves rustle, the stalk pops. */
  forage: {
    prio: 5, cd: 0.2, max: 1,
    play(v) { v.noise(0, 0.18, { type: 'highpass', freq: 2500, gain: 0.05, attack: 0.02 }); M.pop(v, 0.12, 0.6, 520); },
  },
  /** Something picked up off the ground. */
  pickup: { prio: 5, cd: 0.1, max: 1, play: (v) => { v.noise(0, 0.05, { freq: 1800, q: 1, gain: 0.08 }); v.tone(0.03, 0.08, { freq: 880, to: 1320, type: 'triangle', gain: 0.05 }); } },
  /** A Log Pose needle settling: a small magnetic chime. */
  logset: { prio: 6, cd: 1, max: 1, bus: 'ui', send: 0.3, play: (v) => { v.tone(0, 0.3, { freq: 2200, to: 2600, gain: 0.01 }); M.chime(v, 0.05, 0.7, [1760, 2637], 0.8); } },
  /** A low-health heartbeat (doki... doki...). */
  heartbeat: { prio: 6, cd: 0.4, max: 1, bus: 'ui', play: (v) => { v.thump(0, { f0: 62, f1: 40, dur: 0.11, gain: 0.18 }); v.thump(0.2, { f0: 55, f1: 38, dur: 0.1, gain: 0.12 }); } },
};

// ------------------------------------------------------------ techniques
// A technique's start: the wind-up, and (at `rel` seconds, when its first blow
// or shot goes) the release. The fruits sound like themselves; the styles
// like what they swing. Each entry is play(v, k) with k.rel the release time,
// k.def the technique.

const STRETCH = (v, k, s = 1) => { M.stretch(v, 0, Math.max(0.12, k.rel), s); M.snap(v, k.rel, s); };

/** Devil Fruit techniques by fruit (and the signature ones by id). */
export const FRUIT_TECH = {
  gomu: {
    gomu_gatling: (v, k) => { M.stretch(v, 0, Math.max(0.12, k.rel), 0.8); for (let i = 0; i < 11; i++) swing(v, k.rel + i * 0.08 + Math.random() * 0.02, 'fists', 0.8); },
    gomu_rocket: (v, k) => { M.stretch(v, 0, Math.max(0.15, k.rel), 1.1); M.snap(v, k.rel, 1.2); v.whoosh(k.rel, 0.4, { f0: 300, f1: 2400, gain: 0.12 }); },
    gomu_bazooka: (v, k) => { STRETCH(v, k, 1.3); v.thump(k.rel, { f0: 140, f1: 60, dur: 0.1, gain: 0.2 }); },
    gomu_gear2: (v) => { for (let i = 0; i < 4; i++) v.thump(i * 0.11, { f0: 70, f1: 46, dur: 0.09, gain: 0.25 }); M.hiss(v, 0.3, 1.6, 1.2, 3500); v.whoosh(0.4, 0.8, { f0: 2500, f1: 1200, gain: 0.06, color: 'pink' }); },
    gomu_gear3: (v, k) => { v.noise(0, Math.max(0.3, k.rel), { type: 'lowpass', freq: 600, gain: 0.2, attack: 0.3, curve: 'lin' }); v.tone(0, Math.max(0.3, k.rel), { freq: 90, to: 60, type: 'triangle', gain: 0.12, attack: 0.2 }); M.snap(v, k.rel, 1.6); M.boom(v, k.rel + 0.02, 0.6); },
    gomu_gear4: (v) => { M.stretch(v, 0, 0.6, 1.2); v.tone(0.5, 0.4, { freq: 80, to: 130, type: 'triangle', gain: 0.25, vib: { rate: 8, depth: 12 } }); hakiClank(v, 0.75, 1.2); for (let i = 0; i < 3; i++) v.thump(0.8 + i * 0.2, { f0: 90, f1: 120, dur: 0.12, gain: 0.18 }); },
    gomu_gear5: (v) => {
      // the Drums of Liberation: don-don, doko-don
      [0, 0.18, 0.46, 0.56, 0.74].forEach((t, i) => v.thump(t, { f0: i === 4 ? 85 : 70, f1: 42, dur: 0.16, gain: 0.35 }));
      v.tone(0.4, 0.9, { freq: 300, to: 520, gain: 0.05, vib: { rate: 6, depth: 40 } });
      M.shimmer(v, 0.8, 1.4, 0.8);
    },
    default: STRETCH,
  },
  gura: {
    gura_tsunami: (v, k) => { v.noise(0, Math.max(0.4, k.rel), { color: 'brown', type: 'lowpass', freq: 160, gain: 0.35, attack: Math.max(0.3, k.rel) * 0.8, curve: 'lin' }); M.glassCrack(v, k.rel, 1.4); M.boom(v, k.rel, 1.4); },
    default: (v, k) => {
      // the air begins to tremble, then cracks like glass
      v.noise(0, Math.max(0.15, k.rel), { color: 'brown', type: 'lowpass', freq: 200, gain: 0.25, attack: Math.max(0.1, k.rel) * 0.8, curve: 'lin' });
      v.crackle(Math.max(0, k.rel - 0.15), 0.15, 4, { freq: 6000, gain: 0.03, q: 4 });
      M.glassCrack(v, k.rel, 1);
    },
  },
  ope: {
    ope_room: (v) => {
      // ROOM: a translucent dome humming out round you
      v.tone(0, 1, { freq: 110, to: 55, gain: 0.2, attack: 0.05 });
      v.fm(0, 1.3, { freq: 220, ratio: 2, index: 0.6, gain: 0.06, attack: 0.1 });
      v.whoosh(0, 0.8, { f0: 200, f1: 1400, q: 0.7, gain: 0.08, peak: 0.6 });
      [440, 660, 990].forEach((f) => v.tone(0.1, 1.4, { freq: f, gain: 0.014, attack: 0.3, curve: 'lin' }));
    },
    ope_shambles: (v) => { v.whoosh(0, 0.12, { f0: 800, f1: 4000, q: 1.5, gain: 0.1, peak: 0.9 }); M.pop(v, 0.12, 0.8, 480); M.shimmer(v, 0.1, 0.5, 0.3, false); },
    ope_amputate: (v, k) => { swing(v, k.rel, 'sword', 1.5); v.ring(k.rel + 0.1, 1600, 0.5, 0.03, [1, 2.04, 2.75]); },
    ope_mes: (v, k) => { M.pop(v, k.rel, 1, 340); v.fm(k.rel + 0.05, 0.3, { freq: 900, ratio: 1.5, index: 1, gain: 0.04 }); },
    ope_counter: (v, k) => M.zapBurst(v, k.rel, 0.8, 0.25),
    ope_gamma: (v, k) => { v.tone(0, Math.max(0.2, k.rel) + 0.3, { freq: 120, type: 'sawtooth', gain: 0.05, attack: 0.1 }); v.zap(k.rel, 0.3, { f0: 300, f1: 1200, gain: 0.06 }); },
    default: (v, k) => swing(v, k.rel, 'sword', 1),
  },
  bara: { default: (v, k) => { M.pop(v, 0, 1, 300); v.noise(0.01, 0.03, { freq: 1500, q: 3, gain: 0.08 }); swing(v, k.rel, 'fists', 1); }, bara_festival: (v) => { for (let i = 0; i < 8; i++) M.pop(v, i * 0.05, 0.6, rnd(220, 420)); } },
  bomu: { default: (v, k) => { M.hiss(v, 0, Math.max(0.2, k.rel), 1, 5500); v.crackle(0, Math.max(0.2, k.rel), 6, { freq: 4000, gain: 0.03 }); swing(v, k.rel, 'legs', 0.9); } },
  hana: {
    default: (v, k) => {
      // arms sprouting in a bloom of petals: soft slaps and a chime
      for (let i = 0; i < 6; i++) v.noise(Math.random() * Math.max(0.2, k.rel), 0.03, { freq: rnd(1200, 1800), q: 2, gain: 0.06 });
      M.chime(v, 0, 0.6, [1760, 2349, 2637], 0.6);
      v.noise(k.rel, 0.012, { type: 'highpass', freq: 2500, gain: 0.18, attack: 0.0006 });
      v.crackle(k.rel, 0.06, 4, { freq: 900, gain: 0.08 });
    },
  },
  ito: {
    ito_birdcage: (v) => { for (let i = 0; i < 6; i++) v.ring(i * 0.1, rnd(900, 1700), 0.6, 0.025, [1, 2.01, 3.02], { spread: 0.004 }); v.tone(0, 1.2, { freq: 2000, type: 'sawtooth', gain: 0.008, attack: 0.4 }); },
    default: (v, k) => { v.ring(0, rnd(900, 1300), 0.4, 0.035, [1, 2.01, 3.02, 4.03], { spread: 0.004 }); v.whoosh(k.rel, 0.1, { f0: 3000, f1: 7000, q: 2, gain: 0.1, peak: 0.2 }); },
  },
  mochi: { default: (v, k) => { v.tone(0, Math.max(0.15, k.rel), { freq: 150, to: 230, gain: 0.08, vib: { rate: 8, depth: 20 } }); v.noise(0, Math.max(0.15, k.rel), { type: 'lowpass', freq: 400, gain: 0.12, attack: 0.05 }); v.thump(k.rel, { f0: 180, f1: 70, dur: 0.1, gain: 0.2 }); v.bubble(k.rel, { f: 220, rise: 1.8, dur: 0.08, gain: 0.08 }); } },
  horo: { default: (v) => { M.wail(v, 0, 1, 0.8); v.whoosh(0.2, 0.5, { f0: 600, f1: 1500, gain: 0.05, flutter: 6 }); } },
  kage: {
    kage_brickbat: (v, k) => { for (let i = 0; i < 10; i++) v.whoosh(k.rel + Math.random() * 0.25, 0.06, { f0: 900, f1: 1500, q: 1.5, gain: 0.14, flutter: 40 }); },
    kage_steal: (v, k) => { for (const t of [0, 0.08]) { v.noise(k.rel + t, 0.01, { type: 'highpass', freq: 5000, gain: 0.2, attack: 0.0006 }); v.ring(k.rel + t, 3000, 0.08, 0.02, [1, 1.7]); } },
    default: (v) => { M.suction(v, 0, 0.5, 0.6); v.formant(0, 0.5, { f1: 300, f2: 600, q: 6, gain: 0.05 }); },
  },
  doku: { doku_hydra: (v, k) => { M.hiss(v, 0, Math.max(0.3, k.rel) + 0.3, 1.3, 5500); v.bubbles(0, 0.4, 6, { f: 600, gain: 0.04 }); }, default: (v, k) => { M.hiss(v, 0, Math.max(0.2, k.rel), 0.8, 6000); v.bubbles(0, 0.3, 4, { f: 700, gain: 0.04 }); swing(v, k.rel, 'fists', 0.8); } },
  noro: { default: (v, k) => { v.tone(k.rel, 0.8, { freq: 1200, to: 300, gain: 0.06, vib: { rate: 7, depth: 30 } }); v.tone(k.rel, 0.8, { freq: 1800, to: 450, gain: 0.025 }); } },
  bari: { default: (v, k) => { v.fm(k.rel, 0.6, { freq: 1600, ratio: 1.5, index: 1.4, gain: 0.05 }); v.ring(k.rel, 2400, 0.5, 0.03, [1, 1.34, 1.87]); v.tone(k.rel, 0.6, { freq: 220, gain: 0.04, attack: 0.05 }); } },
  suke: { default: (v) => M.shimmer(v, 0, 1, 0.6, false) },
  sube: { default: (v, k) => { v.tone(0, 0.08, { freq: 900, to: 1400, gain: 0.04 }); swing(v, k.rel, 'fists', 1); } },
  doru: { default: (v, k) => { v.noise(0, 0.25, { type: 'lowpass', freq: 500, gain: 0.3, attack: 0.05 }); v.bubble(0.05, { f: 180, rise: 1.6, dur: 0.1, gain: 0.08 }); for (let i = 0; i < 4; i++) v.noise(k.rel + i * 0.05, 0.012, { freq: 2200, q: 4, gain: 0.25, attack: 0.0006 }); } },
  supa: { default: (v, k) => { v.noise(0, 0.2, { freq: 3500, sweep: 6000, q: 3, gain: 0.06, attack: 0.05 }); v.ring(0.15, 2200, 0.4, 0.03, [1, 2.04, 2.75]); swing(v, k.rel, 'sword', 1.2); } },
  nikyu: {
    nikyu_ursus: (v, k) => { v.tone(0, Math.max(0.5, k.rel), { freq: 60, to: 240, gain: 0.14, attack: Math.max(0.4, k.rel) * 0.8, curve: 'lin' }); M.suction(v, 0, Math.max(0.5, k.rel), 0.8); M.pop(v, k.rel, 1.6, 180); },
    default: (v, k) => { M.pop(v, k.rel, 1.1, 210); v.whoosh(k.rel, 0.2, { f0: 400, f1: 1600, gain: 0.08 }); },
  },
  mane: { default: (v) => { M.pop(v, 0.1, 1, 300); v.noise(0.1, 0.3, { type: 'lowpass', freq: 800, gain: 0.08 }); M.shimmer(v, 0.15, 0.4, 0.3); } },
  zushi: {
    zushi_meteor: (v, k) => { v.tone(0, Math.max(0.6, k.rel) + 0.4, { freq: 3200, to: 500, gain: 0.03, attack: 0.2, curve: 'lin' }); v.noise(0, Math.max(0.6, k.rel), { color: 'brown', type: 'lowpass', freq: 200, gain: 0.2, attack: 0.5, curve: 'lin' }); },
    default: (v, k) => { v.tone(0, Math.max(0.3, k.rel) + 0.3, { freq: 42, to: 30, gain: 0.3, attack: 0.08 }); M.suction(v, 0, Math.max(0.3, k.rel) + 0.2, 0.5); },
  },
  hito: { default: (v, k) => { v.crackle(0, 0.1, 4, { freq: 1800, gain: 0.08 }); M.roar(v, 0.05, 0.6, 0.6, 110); if (k.rel > 0.3) swing(v, k.rel, 'heavy', 1); } },
  neko_leopard: { default: (v, k) => { M.roar(v, 0, 0.7, 0.5, 120); swing(v, k.rel, 'fists', 1.2); } },
  tori_phoenix: { default: (v, k) => { M.flame(v, 0, 0.7, { dur: 0.6, low: 500, high: 1800 }); M.chime(v, 0.15, 0.7, [1318, 1760, 2637]); if (k.rel > 0.1) swing(v, k.rel, 'legs', 1); } },
  uo_seiryu: {
    seiryu_bolo: (v, k) => { M.roar(v, 0, 1, Math.max(0.4, k.rel), 80); M.flame(v, k.rel, 1.6, { dur: 0.9 }); },
    seiryu_raimei: (v, k) => { swing(v, 0, 'heavy', 1.3); M.zapBurst(v, k.rel, 1.2, 0.3); },
    default: (v, k) => { M.roar(v, 0, 1, 0.9, 70); v.whoosh(k.rel, 0.4, { f0: 300, f1: 2000, gain: 0.1 }); },
  },
  mera: {
    mera_entei: (v, k) => { v.whoosh(0, Math.max(0.6, k.rel), { f0: 200, f1: 900, q: 0.5, gain: 0.25, peak: 0.95, flutter: 10, color: 'pink' }); M.flame(v, k.rel, 1.8, { dur: 1 }); },
    default: (v, k) => { v.whoosh(0, Math.max(0.15, k.rel), { f0: 300, f1: 1500, q: 0.6, gain: 0.1, peak: 0.9, color: 'pink' }); M.flame(v, k.rel, 1.1); },
  },
  hie: {
    hie_ageand: (v, k) => { v.noise(0, Math.max(0.4, k.rel), { type: 'highpass', freq: 3000, gain: 0.06, attack: 0.3, curve: 'lin' }); M.ice(v, k.rel, 1.5, 1.1); },
    default: (v, k) => { v.noise(0, Math.max(0.15, k.rel), { type: 'highpass', freq: 3500, gain: 0.05, attack: 0.1, curve: 'lin' }); v.crackle(0, Math.max(0.15, k.rel), 5, { freq: 7000, gain: 0.02, q: 5 }); M.ice(v, k.rel, 0.8); },
  },
  goro: {
    goro_elthor: (v, k) => { v.zap(0, Math.max(0.5, k.rel), { f0: 40, f1: 200, gain: 0.04 }); M.rumble(v, 0, 0.6, Math.max(0.5, k.rel), { lp: 180 }); },
    goro_raigo: (v, k) => { M.rumble(v, 0, 1.4, Math.max(1, k.rel) + 1, { lp: 140 }); v.zap(0.3, 1, { f0: 40, f1: 160, gain: 0.03 }); },
    default: (v, k) => {
      // static gathering (the hair on your neck), then VARI
      v.zap(0, Math.max(0.15, k.rel), { f0: 40, f1: 220, gain: 0.03, step: 0.02 });
      v.crackle(0, Math.max(0.15, k.rel), 6, { freq: 5000, gain: 0.025 });
      M.zapBurst(v, k.rel, 1, 0.25);
    },
  },
  suna: { default: (v, k) => { v.whoosh(0, Math.max(0.2, k.rel) + 0.2, { f0: 600, f1: 2200, q: 0.5, gain: 0.12, peak: 0.6 }); v.crackle(0, Math.max(0.2, k.rel) + 0.2, 20, { freq: 4500, gain: 0.03, q: 2.5 }); } },
  moku: { default: (v, k) => { for (let i = 0; i < 3; i++) v.noise(i * 0.08, 0.3, { type: 'lowpass', freq: 600, sweep: 250, gain: 0.25, attack: 0.04 }); v.whoosh(k.rel, 0.3, { f0: 300, f1: 1000, gain: 0.3, color: 'pink' }); } },
  pika: {
    pika_yata: (v) => { M.shimmer(v, 0, 1, 0.25); v.whoosh(0.02, 0.12, { f0: 3000, f1: 8000, q: 1.5, gain: 0.1, peak: 0.2 }); },
    default: (v, k) => {
      // a high whine charging, then PYUN
      v.tone(0, Math.max(0.15, k.rel), { freq: 800, to: 4000, gain: 0.04, attack: Math.max(0.1, k.rel) * 0.9, curve: 'lin' });
      v.noise(k.rel, 0.008, { type: 'highpass', freq: 6000, gain: 0.2, attack: 0.0005 });
      v.tone(k.rel, 0.14, { freq: 4000, to: 1500, gain: 0.07 });
      v.fm(k.rel, 0.2, { freq: 2500, ratio: 1.5, index: 2, gain: 0.03 });
    },
  },
  magu: { default: (v, k) => { v.bubbles(0, Math.max(0.2, k.rel), 6, { f: 130, rise: 1.4, gain: 0.08, dur: 0.1 }); v.noise(0, Math.max(0.2, k.rel), { color: 'brown', type: 'lowpass', freq: 400, gain: 0.2, attack: 0.1 }); v.whoosh(k.rel, 0.4, { f0: 200, f1: 900, q: 0.6, gain: 0.18, color: 'pink' }); M.hiss(v, k.rel, 0.4, 0.8, 5000); } },
  yami: {
    yami_kurouzu: (v) => M.suction(v, 0, 0.9, 1.3),
    default: (v, k) => { M.suction(v, 0, Math.max(0.3, k.rel) + 0.2, 0.9); v.crackle(0, 0.5, 8, { freq: 700, gain: 0.04, q: 1.5 }); },
  },
};

/** Style techniques by id (the rest sound like the weapon they swing: see techStart). */
export const STYLE_TECH = {
  roku_soru: (v) => { v.whoosh(0, 0.08, { f0: 1500, f1: 5000, q: 1, gain: 0.12, peak: 0.2 }); for (let i = 0; i < 4; i++) v.noise(i * 0.012, 0.01, { type: 'lowpass', freq: 600, gain: 0.08 }); },
  roku_geppo: (v) => { M.pop(v, 0, 1, 150); v.whoosh(0, 0.2, { f0: 300, f1: 1400, gain: 0.1 }); },
  roku_rankyaku: (v, k) => { swing(v, 0, 'legs', 1.2); v.whoosh(k.rel, 0.35, { f0: 3000, f1: 1200, q: 2, gain: 0.1, peak: 0.15 }); },
  roku_tekkai: (v) => hakiClank(v, 0, 0.7),
  bleg_diable: (v) => { swing(v, 0, 'legs', 1.2); M.flame(v, 0.25, 1.2, { dur: 0.8 }); },
  bleg_skywalk: (v) => { M.pop(v, 0, 0.9, 160); v.whoosh(0, 0.25, { f0: 300, f1: 1500, gain: 0.1 }); },
  fmk_uchimizu: (v, k) => { v.whoosh(k.rel, 0.12, { f0: 1500, f1: 3500, gain: 0.08 }); M.drips(v, k.rel, 0.15, 4, 1); },
  fmk_vagabond: (v, k) => { v.whoosh(0, Math.max(0.3, k.rel) + 0.3, { f0: 300, f1: 1200, q: 0.7, gain: 0.16, peak: 0.7, flutter: 18, color: 'pink' }); M.splash(v, k.rel, 0.8); },
  elec_discharge: (v, k) => M.zapBurst(v, k.rel, 1, 0.35),
  elec_garchu: (v, k) => M.zapBurst(v, k.rel, 0.8, 0.2),
  clima_thunderbolt: (v, k) => { v.zap(0, Math.max(0.3, k.rel), { f0: 40, f1: 150, gain: 0.03 }); M.zapBurst(v, k.rel, 1.2, 0.3); M.rumble(v, k.rel, 0.8, 0.8); },
  clima_cyclone: (v, k) => v.whoosh(k.rel, 0.9, { f0: 300, f1: 1100, q: 0.6, gain: 0.16, peak: 0.4, flutter: 5, color: 'pink' }),
  clima_mirage: (v) => M.shimmer(v, 0, 0.8, 0.6, false),
  clima_zeus: (v, k) => { M.zapBurst(v, k.rel, 1.3, 0.4); M.rumble(v, k.rel, 1, 1); },
  hassho_bushin: (v, k) => { v.tone(0, Math.max(0.2, k.rel) + 0.2, { freq: 42, gain: 0.25, attack: 0.08, vib: { rate: 18, depth: 6 } }); v.whoosh(k.rel, 0.3, { f0: 200, f1: 900, gain: 0.12, color: 'pink' }); },
  okama_pirouette: (v) => { for (let i = 0; i < 3; i++) swing(v, i * 0.12, 'legs', 0.8); },
  okama_hell_wink: (v, k) => { v.tone(k.rel, 0.3, { freq: 1400, to: 2800, gain: 0.04 }); M.pop(v, k.rel, 0.8, 600); },
  elec_sulong: (v) => { M.roar(v, 0, 1.1, 1, 90); M.shimmer(v, 0.5, 1, 0.8); },
  santo_asura: (v) => { M.rumble(v, 0, 0.8, 1, { lp: 150 }); v.zap(0.2, 0.6, { f0: 40, f1: 300, gain: 0.04 }); v.formant(0.1, 0.8, { f1: 300, f2: 700, q: 5, gain: 0.08 }); },
  snipe_firebird: (v, k) => { slingshot(v, k.rel, 1.1); M.flame(v, k.rel + 0.05, 0.8); },
};

/**
 * A Devil Fruit's touch on a blow it lands (over the blow's own sound): the
 * rubber's boing, a body part's "pon", mochi's squelch, steel's ring...
 */
export const FLAVOUR = {
  gomu: (v) => v.tone(0.005, 0.16, { freq: 320, to: 130, type: 'triangle', gain: 0.06, vib: { rate: 24, depth: 22 } }),
  bara: (v) => M.pop(v, 0, 0.5, 340),
  mochi: (v) => { v.bubble(0.01, { f: 200, rise: 1.8, dur: 0.08, gain: 0.07 }); v.noise(0, 0.1, { type: 'lowpass', freq: 500, gain: 0.08 }); },
  supa: (v) => v.ring(0.003, rnd(1900, 2300), 0.3, 0.03, [1, 2.04, 2.75]),
  nikyu: (v) => M.pop(v, 0, 0.7, 220),
  hana: (v) => { v.noise(0.02, 0.012, { type: 'highpass', freq: 2500, gain: 0.12, attack: 0.0006 }); v.crackle(0.02, 0.05, 3, { freq: 900, gain: 0.06 }); },
  ito: (v) => v.ring(0, rnd(1500, 1800), 0.25, 0.025, [1, 2.01, 3.03], { spread: 0.004 }),
  doru: (v) => v.thump(0.005, { f0: 260, f1: 180, dur: 0.05, gain: 0.08 }),
  bari: (v) => v.fm(0, 0.35, { freq: 1600, ratio: 1.5, index: 1, gain: 0.03 }),
  ope: (v) => v.fm(0.01, 0.25, { freq: 900, ratio: 2, index: 0.6, gain: 0.02 }),
  kage: (v) => v.noise(0, 0.2, { type: 'lowpass', freq: 400, gain: 0.08, attack: 0.05 }),
  horo: (v) => v.tone(0, 0.3, { freq: 600, to: 400, gain: 0.02, vib: { rate: 6, depth: 30 } }),
  zushi: (v) => v.tone(0, 0.3, { freq: 45, to: 32, gain: 0.15 }),
  noro: (v) => v.tone(0, 0.4, { freq: 900, to: 300, gain: 0.025 }),
};

/** The kind of swing for a technique's motion (`anim`). */
function animKind(anim, weapon) {
  if (weapon === 'sword') return 'sword';
  if (weapon === 'staff') return 'staff';
  if (weapon === 'axe') return 'axe';
  if (/kick|knee|mouton|jete|arabesque|pirouette|rankyaku/.test(anim || '') || weapon === 'legs') return 'legs';
  if (/heavy|haymaker|slam|headbutt|charge|axe_slam|palm_double/.test(anim || '')) return 'heavy';
  return 'fists';
}

/**
 * The start of a technique: its own sound if it has one (a Devil Fruit, a
 * signature move), else the swing of what it's done with — and, timed to the
 * moment the blow lands, the release. `def` the technique, `rel` the seconds
 * to its first blow, `weapon` what it's swung with, `gun` a gun's kind.
 */
export function techStart(v, def, { rel = 0, weapon = 'fists', gun = null, heavy = false, voice } = {}) {
  const k = { rel: Math.max(0, rel), def, voice };
  const fr = def.fruit && FRUIT_TECH[def.fruit];
  if (fr) { (fr[def.id] || fr.default || STRETCH)(v, k); return; }
  if (STYLE_TECH[def.id]) { STYLE_TECH[def.id](v, k); return; }
  // (Conqueror's: the pressure gathering through the wind-up; the DOOON comes with the burst itself — abilities.js)
  if ((def.steps || []).some((s) => s.conqueror)) { SFX.conqueror_rise.play(v, k); return; }
  if (weapon === 'gun') {
    v.noise(0, 0.02, { freq: 3000, q: 3, gain: 0.1, attack: 0.0006 });
    if (gun === 'slingshot') slingshot(v, k.rel, 1); else gunshot(v, k.rel, heavy ? 1.2 : 1);
    return;
  }
  const kind = animKind(def.anim, weapon);
  // (a big wind-up: the swing goes as the blow does)
  swing(v, Math.max(0, k.rel - 0.06), kind, heavy || /heavy|cleave|tora|iai|slam/.test(def.anim || '') ? 1.3 : 1);
  if (weapon === 'sword' && /iai/.test(def.anim || '')) v.ring(k.rel + 0.04, 2300, 0.45, 0.025, [1, 2.04, 2.75]);
}
