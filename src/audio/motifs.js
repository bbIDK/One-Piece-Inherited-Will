// Sound motifs shared across the library: the pieces a Devil Fruit, an
// element or a ship is made of (a flame's roar, ice forming, a glass-crack in
// the air, a rubber snap, a stick-slip creak). Each draws into a Voice `v`
// at offset `t` (seconds from the voice's start) with a size `s` (1 = normal).
//
// The sounds are One Piece's as the anime and the games voice them: punches
// land with a DON and a heavy one a DOGOOON, blades go ZAN and ring after,
// a parry is a bright KIIN, Whitebeard's quake cracks the air like glass
// before the boom, Enel's thunder buzzes and rumbles (GORO GORO), Aokiji's ice
// crackles as it forms (PAKIN), Kizaru's light whines up and goes PYUN.
const rnd = (a, b) => a + Math.random() * (b - a);

/** A flame catching and roaring: ignition, a fluttering roar, embers popping. */
export function flame(v, t, s = 1, { dur = 0.5, low = 380, high = 1400 } = {}) {
  v.whoosh(t, 0.12 * s + 0.04, { f0: 380, f1: 2200, q: 0.8, gain: 0.14 * s });
  v.whoosh(t + 0.02, dur * s, { f0: high, f1: low * 1.3, q: 0.6, gain: 0.26 * Math.sqrt(s), peak: 0.15, flutter: rnd(11, 16) });
  v.whoosh(t + 0.02, dur * s * 0.8, { f0: high * 0.6, f1: low, q: 0.6, gain: 0.14 * Math.sqrt(s), peak: 0.2, flutter: rnd(8, 12), color: 'pink' });
  v.crackle(t + 0.03, dur * s * 0.9, Math.round(10 * s), { freq: 2400, gain: 0.05, q: 3 });
}

/** Magma: a heavy roar, thick low bubbles, the sizzle of what it touches (JUUU). */
export function lava(v, t, s = 1, dur = 0.6) {
  v.noise(t, dur * s, { color: 'brown', type: 'lowpass', freq: 700, sweep: 150, gain: 0.42 * s, attack: 0.03 });
  v.bubbles(t + 0.05, dur * 0.8 * s, Math.round(8 * s), { f: 140, spread: 0.8, rise: 1.4, gain: 0.11, dur: 0.1 });
  v.noise(t + 0.04, dur * s, { type: 'highpass', freq: 4500, gain: 0.025, attack: 0.05 });
  v.noise(t + 0.02, dur * s * 0.8, { freq: 900, q: 0.8, gain: 0.08, attack: 0.04 });
  v.crackle(t + 0.05, dur * s * 0.9, Math.round(12 * s), { freq: 3200, gain: 0.025, q: 3 });
}

/** Ice forming and cracking: a sharp crack, crackling "pakiki", a crystal ring. */
export function ice(v, t, s = 1, spreadDur = 0.3) {
  v.noise(t, 0.015, { type: 'highpass', freq: 5200, gain: 0.34 * s, attack: 0.0008 });
  // (more pops at first, thinning out as the ice spreads)
  for (let i = 0; i < Math.round(14 * s); i++) {
    const k = Math.pow(Math.random(), 1.8);
    v.noise(t + k * spreadDur * s, 0.008 + Math.random() * 0.012, { freq: rnd(4500, 8500), q: 4, gain: 0.07 * (1 - k * 0.6), attack: 0.0008 });
  }
  v.ring(t + 0.002, rnd(2250, 2600), 0.5 * s, 0.055, [1, 1.34, 1.87, 2.51]);
  v.fm(t + 0.004, 0.4 * s, { freq: rnd(3100, 3500), ratio: 1.73, index: 1.2, gain: 0.018 });
}

/** Electricity: the crack, the buzz jumping about, the hiss, a rumble under it (BZZZT, GORO GORO). */
export function zapBurst(v, t, s = 1, dur = 0.3) {
  v.noise(t, 0.012, { type: 'highpass', freq: 2500, gain: 0.5 * s, attack: 0.0006 });
  v.zap(t, dur * s, { f0: 70, f1: 800, gain: 0.11 * s, step: 0.01 });
  v.zap(t + 0.01, dur * 0.8 * s, { f0: 900, f1: 2600, gain: 0.03 * s, step: 0.007, type: 'sawtooth', hp: 900 });
  v.noise(t, dur * s, { type: 'highpass', freq: 4200, gain: 0.1 * s, attack: 0.003 });
}

/** Thunder rolling off: a low, uneven rumble (several rolls overlapping). */
export function rumble(v, t, s = 1, dur = 0.8, { lp = 260 } = {}) {
  v.noise(t, dur * s, { color: 'brown', type: 'lowpass', freq: lp, sweep: 70, gain: 0.4 * s, attack: 0.02 });
  for (let i = 0; i < 2 + Math.round(s); i++) v.noise(t + rnd(0.05, dur * 0.6) * s, rnd(0.3, 0.7) * dur * s, { color: 'brown', type: 'lowpass', freq: lp * 0.8, gain: rnd(0.12, 0.3) * s, attack: 0.04 });
}

/** The air cracking like glass (the Gura Gura no Mi): a hard crack, shards, a tinkle. */
export function glassCrack(v, t, s = 1) {
  v.noise(t, 0.018, { type: 'highpass', freq: 4000, gain: 0.45 * s, attack: 0.0006 });
  v.crackle(t, 0.12 * s, Math.round(14 * s), { freq: 5200, spread: 0.9, q: 3, gain: 0.1 });
  for (let i = 0; i < 2; i++) v.ring(t + rnd(0.005, 0.06), rnd(2700, 3500), 0.3 * s, 0.022, [1, 1.62, 2.3]);
}

/** A deep boom: the DOGOON under a big blow, a quake, an explosion. */
export function boom(v, t, s = 1, { f0 = 90, f1 = 26, dur = 0.7 } = {}) {
  v.thump(t, { f0, f1, dur: dur * s, gain: 0.8 * Math.min(1.2, s) });
  v.noise(t, dur * 0.9 * s, { color: 'pink', type: 'lowpass', freq: 600, sweep: 90, gain: 0.4 * s, attack: 0.004 });
}

/** Rubber pulled taut (Gomu Gomu): a wobbling rising groan and the squeak of it. */
export function stretch(v, t, dur, s = 1) {
  const d = Math.max(0.12, dur);
  v.tone(t, d, { freq: 170, to: 420, type: 'triangle', gain: 0.07 * s, attack: d * 0.6, curve: 'lin', vib: { rate: 17, depth: 14 } });
  v.creak(t, d, { rate: 90, rate1: 170, freqs: [320, 620, 980], q: 4, gain: 0.07 * s, attack: 0.8 });
}

/** Rubber let go: BOYOING, and the fist (or the body) away with the air behind it. */
export function snap(v, t, s = 1) {
  v.noise(t, 0.01, { type: 'highpass', freq: 3000, gain: 0.25 * s, attack: 0.0006 });
  v.tone(t, 0.2, { freq: 560, to: 150, glide: 0.12, type: 'triangle', gain: 0.12 * s, attack: 0.002, vib: { rate: 26, depth: 30 } });
  v.whoosh(t, 0.18, { f0: 600, f1: 2600, q: 1, gain: 0.14 * s, peak: 0.3 });
}

/** A soft pop (a paw pad, a body splitting into pieces, a puff of smoke). */
export function pop(v, t, s = 1, f = 260) {
  v.bubble(t, { f, rise: 2.2, dur: 0.06, gain: 0.14 * s });
  v.noise(t, 0.05, { type: 'lowpass', freq: 900, gain: 0.12 * s, attack: 0.002 });
}

/** A bright shimmer (light, a barrier, a vanishing). `up` false runs it downward. */
export function shimmer(v, t, s = 1, dur = 0.5, up = true) {
  const f = rnd(2400, 2800);
  v.fm(t, dur, { freq: f, ratio: 1.5, index: 0.8, gain: 0.06 * s });
  v.tone(t, dur, { freq: up ? f * 0.6 : f * 1.4, to: up ? f * 1.4 : f * 0.6, gain: 0.055 * s, attack: dur * 0.3, curve: 'lin' });
  v.crackle(t, dur, Math.round(6 * s), { freq: 7000, gain: 0.045, q: 5 });
}

/** A rush of air dragged inwards (darkness, a vortex, a gravity well). */
export function suction(v, t, dur = 0.6, s = 1) {
  v.whoosh(t, dur, { f0: 2200, f1: 160, q: 0.9, gain: 0.16 * s, peak: 0.85, color: 'pink' });
  v.noise(t, dur, { color: 'brown', type: 'lowpass', freq: 300, gain: 0.3 * s, attack: dur * 0.7, curve: 'lin' });
}

/** A ghost's wail (Perona's Hollows: horo horo horo). */
export function wail(v, t, s = 1, dur = 0.7) {
  v.tone(t, dur, { freq: rnd(620, 720), to: 380, gain: 0.05 * s, attack: 0.15, curve: 'lin', vib: { rate: 5, depth: 40 } });
  v.formant(t, dur, { f1: 500, f2: 900, to1: 380, to2: 700, q: 6, gain: 0.3 * s, attack: 0.12 });
}

/** A beast's roar or growl (a Zoan changing, a dragon, a Sea King). */
export function roar(v, t, s = 1, dur = 0.9, low = 70) {
  v.tone(t, dur, { freq: low, to: low * 0.62, type: 'sawtooth', gain: 0.18 * s, attack: dur * 0.25, curve: 'lin', vib: { rate: 28, depth: low * 0.12 } });
  v.formant(t, dur, { f1: 420, f2: 900, to1: 560, to2: 1100, q: 4, gain: 0.22 * s, attack: dur * 0.2, color: 'pink' });
  v.noise(t, dur, { color: 'brown', type: 'lowpass', freq: 320, gain: 0.3 * s, attack: 0.05 });
}

/** A hiss (gas, a snake, venom, a fuse). */
export function hiss(v, t, dur = 0.5, s = 1, freq = 5000) {
  v.noise(t, dur, { type: 'highpass', freq, gain: 0.1 * s, attack: Math.min(0.05, dur * 0.2) });
}

/** A struck chime (healing, a barrier, the Log Pose setting): a soft bell chord. */
export function chime(v, t, s = 1, notes = [1318, 1760, 2093], dur = 0.9) {
  notes.forEach((f, i) => v.fm(t + i * 0.04, dur, { freq: f, ratio: 3.5, index: 0.6, gain: 0.03 * s }));
}

/** Clinks of chain (an anchor going down or coming up). */
export function chain(v, t, dur, n, s = 1) {
  for (let i = 0; i < n; i++) {
    const at = t + (i / n) * dur + rnd(0, 0.012);
    v.ring(at, rnd(1700, 2700), 0.06, 0.028 * s, [1, 2.7, 4.1], { spread: 0.05 });
    v.noise(at, 0.01, { type: 'highpass', freq: 4500, gain: 0.05 * s, attack: 0.0006 });
  }
}

/** Droplets falling back into the water. */
export function drips(v, t, span, n, s = 1) {
  for (let i = 0; i < n; i++) v.bubble(t + Math.random() * span, { f: rnd(1500, 2900), rise: rnd(1.3, 1.9), dur: rnd(0.018, 0.035), gain: rnd(0.015, 0.035) * s });
}

/** A splash: the hit of the surface, the plunge, bubbles, the spray coming down. */
export function splash(v, t, s = 1) {
  v.noise(t, 0.38 * s, { type: 'lowpass', freq: 1800, sweep: 300, gain: 0.3 * s, attack: 0.003 });
  v.noise(t, 0.2 * s, { freq: 2600, sweep: 900, q: 0.7, gain: 0.09 * s, attack: 0.002 });
  v.thump(t, { f0: 160, f1: 60, dur: 0.1, gain: 0.16 * s });
  v.bubbles(t + 0.02, 0.3 * s, Math.round(7 * s), { f: 380, spread: 0.8, gain: 0.06 });
  drips(v, t + 0.12, 0.4 * s, Math.round(4 * s), s);
}
