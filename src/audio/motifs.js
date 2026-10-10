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
//
// Where a recording sells it better (a flame's roar, ice breaking, glass
// shattering, the ground shaking), a recorded layer (`v.sample`, see
// samples.js) goes under the synthesis — and is simply left out while it
// isn't decoded yet.
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * A flame catching and roaring, as fire is recorded: the low FWOOMP of the
 * air catching (its energy at 60–150 Hz, not up in the hiss), the roar
 * fluttering as the flame flickers, the rush of it, embers crackling on top.
 */
export function flame(v, t, s = 1, { dur = 0.5, low = 380, high = 1400 } = {}) {
  const q = Math.sqrt(s), L = dur * s;
  v.thump(t, { f0: 95, f1: 42, dur: 0.18 * q + 0.08, gain: 0.3 * q });
  v.noise(t, L + 0.12, { color: 'brown', type: 'lowpass', freq: 280, sweep: 140, gain: 0.5 * q, attack: 0.03, am: { rate: rnd(8, 13), depth: 0.45 } });
  v.noise(t + 0.01, L, { color: 'pink', type: 'lowpass', freq: 1200, sweep: 450, gain: 0.42 * q, attack: 0.03, am: { rate: rnd(11, 16), depth: 0.5 } });
  v.whoosh(t, 0.1 * s + 0.12, { f0: low, f1: high, q: 0.7, gain: 0.24 * s, peak: 0.3, color: 'pink' });
  v.crackle(t + 0.04, L * 0.9, Math.round(10 * s), { freq: 2600, gain: 0.06, q: 3 });
  v.noise(t + 0.03, L * 0.8, { type: 'highpass', freq: 5000, gain: 0.02, attack: 0.05 });
  // (a real flame's roar under it: a short burst for a small one, the long roar for a big one)
  v.sample(t, L > 0.7 ? 'fire_1' : 'fire', { gain: 0.36 * q, rate: 1.1 - 0.12 * Math.min(1.5, s), dur: L + 0.35, fade: 0.3 });
}

/** Magma: a heavy roar, thick low bubbles, the sizzle of what it touches (JUUU). */
export function lava(v, t, s = 1, dur = 0.6) {
  v.noise(t, dur * s, { color: 'brown', type: 'lowpass', freq: 700, sweep: 150, gain: 0.42 * s, attack: 0.03 });
  v.bubbles(t + 0.05, dur * 0.8 * s, Math.round(8 * s), { f: 140, spread: 0.8, rise: 1.4, gain: 0.11, dur: 0.1 });
  v.noise(t + 0.04, dur * s, { type: 'highpass', freq: 4500, gain: 0.025, attack: 0.05 });
  v.noise(t + 0.02, dur * s * 0.8, { freq: 900, q: 0.8, gain: 0.08, attack: 0.04 });
  v.crackle(t + 0.05, dur * s * 0.9, Math.round(12 * s), { freq: 3200, gain: 0.025, q: 3 });
  // (recorded: the roar slowed to a heavy churn, and molten rock boiling)
  v.sample(t, 'fire_roar', { gain: 0.42 * s, rate: 0.72, dur: dur * s + 0.4, fade: 0.35, lp: 2400 });
  v.sample(t + 0.04, 'boil', { gain: 0.25 * s, rate: 0.8, dur: dur * s + 0.3, fade: 0.3 });
}

/**
 * Ice forming and cracking (PAKIN), as ice breaking is recorded: a hard
 * crack and a crunch of crystals under it, then the freeze spreading — a
 * crackle dense at first and thinning out ("pakiki"), a frosty hiss — and a
 * crystal ring over it.
 */
export function ice(v, t, s = 1, spreadDur = 0.35) {
  v.noise(t, 0.012, { type: 'highpass', freq: 1500, gain: 0.95 * s, attack: 0.0006 });
  v.noise(t + 0.002, 0.08, { freq: 2600, q: 0.8, gain: 0.6 * s, attack: 0.002 });
  // (the crunch has a body: a recording of ice breaking is as strong at 500 Hz–1 kHz as up top)
  v.noise(t + 0.002, 0.1, { freq: 850, q: 0.9, gain: 0.85 * s, attack: 0.002 });
  v.crackle(t + 0.01, 0.12, Math.round(8 * s), { freq: 1100, spread: 0.8, q: 2, gain: 0.2 * s });
  v.thump(t, { f0: 190, f1: 95, dur: 0.07, gain: 0.25 * s });
  // (more breaks at first, fewer as the ice spreads)
  for (let i = 0; i < Math.round(22 * s); i++) {
    const k = Math.pow(Math.random(), 1.8);
    v.noise(t + k * spreadDur * s, 0.006 + Math.random() * 0.01, { freq: rnd(2500, 8000), q: 3, gain: 0.13 * (1 - k * 0.6) * s, attack: 0.0006 });
  }
  v.noise(t + 0.01, spreadDur * s + 0.25, { type: 'highpass', freq: 4200, gain: 0.06 * s, attack: 0.05, curve: 'lin' });
  v.ring(t + 0.003, rnd(2250, 2600), 0.45 * s, 0.05, [1, 1.34, 1.87, 2.51]);
  v.fm(t + 0.004, 0.4 * s, { freq: rnd(3100, 3500), ratio: 1.73, index: 1.2, gain: 0.015 });
  // (recorded: ice breaking, and the crisp snap of it)
  v.sample(t, 'ice', { gain: 0.32 * s, rate: 1.05 - 0.1 * Math.min(1.5, s) });
  v.sample(t + 0.004, 'ice_snap', { gain: 0.18 * s });
}

/**
 * Electricity: the crack of a discharge and its sparks spitting, the buzz
 * jumping about, the hiss, a thump of air (BZZZT).
 */
export function zapBurst(v, t, s = 1, dur = 0.3) {
  v.noise(t, 0.008, { type: 'highpass', freq: 1500, gain: 0.6 * s, attack: 0.0005 });
  v.crackle(t, dur * 0.5 * s, Math.round(10 * s), { freq: 3000, spread: 1, gain: 0.22 * s, q: 1.2, len: 0.006 });
  v.zap(t, dur * s, { f0: 60, f1: 600, gain: 0.08 * s, step: 0.01 });
  v.noise(t, dur * s, { type: 'highpass', freq: 4200, gain: 0.08 * s, attack: 0.003 });
  v.thump(t, { f0: 120, f1: 45, dur: 0.15, gain: 0.25 * s });
  // (recorded: a discharge's crack and its sizzle)
  v.sample(t, 'spark', { gain: 0.45 * s });
  v.sample(t, 'zap_1', { gain: 0.38 * s, rate: 1.15, dur: dur * s + 0.25, fade: 0.2 });
}

/**
 * A lightning strike (Goro Goro, a thunderbolt) — not a little ping: the
 * crack of the air torn open (a split second, broadband and loud, then a
 * tearing crackle thinning out over a tenth of a second), the blast of it,
 * the charge sizzling, and the thunder rolling away under it all for `roll`
 * seconds (as a near strike is recorded: the crack, then 63–500 Hz rolling on).
 */
export function strike(v, t, s = 1, roll = 1.6) {
  v.noise(t, 0.006, { type: 'highpass', freq: 1200, gain: 0.85 * s, attack: 0.0004 });
  v.noise(t, 0.03, { freq: 3500, q: 0.6, gain: 0.45 * s, attack: 0.0006 });
  v.crackle(t + 0.004, 0.12, Math.round(16 * s), { freq: 2600, spread: 1.2, gain: 0.4 * s, q: 0.9, len: 0.006 });
  v.thump(t + 0.002, { f0: 115, f1: 38, dur: 0.35, gain: 0.55 * s });
  v.noise(t + 0.002, 0.28, { color: 'pink', type: 'lowpass', freq: 1500, sweep: 220, gain: 0.38 * s });
  v.zap(t + 0.01, 0.16 * s, { f0: 60, f1: 500, gain: 0.05 * s, step: 0.008 });
  v.noise(t + 0.01, 0.5, { type: 'highpass', freq: 5000, gain: 0.07 * s, attack: 0.004 });
  rumble(v, t + 0.1, s, roll, { lp: 230 });
  // (recorded: the bolt's crack and sizzle, and real thunder rolling on under the long ones)
  v.sample(t, 'spark', { gain: 0.55 * s, rate: 0.9 });
  v.sample(t + 0.002, 'zap', { gain: 0.42 * s, rate: 0.95 });
  if (roll >= 1.5) v.sample(t + 0.04, 'thunder', { gain: 0.55 * s, offset: 0.15, dur: roll + 0.6, fade: 0.8, rate: 0.95 });
}

/**
 * Thunder rolling off: a low, uneven rumble — the far parts of the bolt
 * arriving later, each roll a swell of its own (several overlapping).
 */
export function rumble(v, t, s = 1, dur = 0.8, { lp = 260 } = {}) {
  v.noise(t, dur * s, { color: 'brown', type: 'lowpass', freq: lp, sweep: lp * 0.45, gain: 0.4 * s, attack: 0.02 });
  for (let i = 0; i < 2 + Math.round(s * 2); i++) v.noise(t + rnd(0.06, dur * 0.65) * s, rnd(0.3, 0.7) * dur * s, { color: 'brown', type: 'lowpass', freq: lp * rnd(0.7, 1.2), gain: rnd(0.14, 0.3) * s, attack: rnd(0.04, 0.16), curve: 'lin' });
}

/** The air cracking like glass (the Gura Gura no Mi): a hard crack, shards, a tinkle. */
export function glassCrack(v, t, s = 1) {
  v.noise(t, 0.018, { type: 'highpass', freq: 4000, gain: 0.45 * s, attack: 0.0006 });
  v.crackle(t, 0.12 * s, Math.round(14 * s), { freq: 5200, spread: 0.9, q: 3, gain: 0.1 });
  for (let i = 0; i < 2; i++) v.ring(t + rnd(0.005, 0.06), rnd(2700, 3500), 0.3 * s, 0.022, [1, 1.62, 2.3]);
  v.sample(t, 'shatter', { gain: 0.3 * s, rate: 1.15, dur: 0.35, fade: 0.15 });
}

/**
 * The sky itself shattering (the Gura Gura no Mi at full strength): a hard
 * white crack, a fan of glassy partials ringing out, shards raining down in
 * a falling spray and a long tinkling tail — far bigger than glassCrack.
 */
export function shatter(v, t, s = 1) {
  v.noise(t, 0.012, { type: 'highpass', freq: 2500, gain: 0.95 * s, attack: 0.0004 });
  v.noise(t, 0.06, { freq: 1800, q: 0.7, gain: 0.55 * s, attack: 0.0008 });
  for (let i = 0; i < 4; i++) v.ring(t + rnd(0, 0.03), rnd(1900, 3600), 0.42 * s, rnd(0.05, 0.12), [1, 1.53, 2.27, 3.1], { spread: 0.006 });
  v.crackle(t + 0.005, 0.3 * s, Math.round(30 * s), { freq: 4800, spread: 1.2, q: 2.5, gain: 0.16 * s, len: 0.008 });
  v.crackle(t + 0.12, 0.7 * s, Math.round(18 * s), { freq: 6500, spread: 0.8, q: 5, gain: 0.06 * s, len: 0.012 });
  // (recorded: the crunch of a thick pane giving way, two breaks over each other, the shards falling)
  v.sample(t, 'glass_crunch', { gain: 0.6 * s, rate: 0.8 });
  v.sample(t, 'shatter_1', { gain: 0.55 * s, rate: 0.92 });
  v.sample(t + 0.012, Math.random() < 0.5 ? 'shatter_2' : 'shatter_3', { gain: 0.4 * s });
  v.sample(t + 0.18, 'glass_tinkle', { gain: 0.28 * s, rate: 0.95 });
}

/** A deep boom: the DOGOON under a big blow, a quake, an explosion. */
export function boom(v, t, s = 1, { f0 = 90, f1 = 26, dur = 0.7 } = {}) {
  v.thump(t, { f0, f1, dur: dur * s, gain: 0.8 * Math.min(1.2, s) });
  v.noise(t, dur * 0.9 * s, { color: 'pink', type: 'lowpass', freq: 600, sweep: 90, gain: 0.4 * s, attack: 0.004 });
  // (recorded: a low blast, pitched with the boom)
  v.sample(t, 'boom', { gain: 0.5 * Math.min(1.3, s), rate: clampR(f0 / 90), dur: dur * s + 0.3, fade: 0.3 });
}
const clampR = (x) => Math.max(0.6, Math.min(1.5, x));

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

/**
 * A body going into the water, sized `s` (0.25 a step in … 1 a fall of a few
 * metres … 1.7 off a mast), as such splashes are recorded: a slap you hear
 * land (broadband, strongest at 125 Hz–1 kHz), the plunge rushing down into
 * the hole torn open behind you, its collapse a deep gloop and a burst of
 * bubbles, and the spray thrown up raining back — longer the bigger it was
 * (half a second for a hop in, near two for a big one).
 */
export function plunge(v, t, s = 1) {
  const q = Math.pow(s, 0.75);
  // the slap of the surface
  v.noise(t, 0.012, { type: 'highpass', freq: 700, gain: 0.6 * q, attack: 0.0008 });
  v.noise(t, 0.06 + 0.04 * s, { freq: 700, q: 0.5, gain: 0.8 * q, attack: 0.002 });
  v.thump(t, { f0: 150, f1: 55, dur: 0.12 + 0.1 * s, gain: 0.45 * q });
  // the plunge: the water thrown up and rushing down into the hole behind you (it holds a while: a splash's body is half a second and more)
  const P = 0.5 + 1.0 * s;
  v.noise(t + 0.005, P, { color: 'pink', type: 'lowpass', freq: 2200, sweep: 300, gain: 1.4 * q, attack: 0.008, hold: P * 0.25 });
  v.noise(t + 0.01, P * 0.8, { freq: 1300, q: 0.6, sweep: 600, gain: 0.5 * q, attack: 0.01, hold: P * 0.2 });
  // the hole closing: a deep gloop, and its bubbles
  v.tone(t + 0.08 + 0.06 * s, 0.14, { freq: 140 / q, to: 380 / q, gain: 0.2 * q, attack: 0.01 });
  v.bubbles(t + 0.06, 0.3 + 0.3 * s, Math.round(6 + 12 * s), { f: 520, spread: 1, gain: 0.09 * q, dur: 0.06 });
  // the spray raining back
  const R = 0.3 + 1.1 * s;
  v.noise(t + 0.12, R, { freq: 3000, q: 0.5, sweep: 2200, gain: 0.35 * q, attack: R * 0.2 });
  for (let i = 0, n = Math.round(6 + 24 * s); i < n; i++) v.bubble(t + 0.15 + Math.pow(Math.random(), 1.4) * R, { f: rnd(1300, 3400), rise: rnd(1.3, 2), dur: rnd(0.012, 0.03), gain: rnd(0.03, 0.07) * q });
}

/** A splash: the hit of the surface, the plunge, bubbles, the spray coming down. */
export function splash(v, t, s = 1) {
  v.noise(t, 0.38 * s, { type: 'lowpass', freq: 1800, sweep: 300, gain: 0.3 * s, attack: 0.003 });
  v.noise(t, 0.2 * s, { freq: 2600, sweep: 900, q: 0.7, gain: 0.09 * s, attack: 0.002 });
  v.thump(t, { f0: 160, f1: 60, dur: 0.1, gain: 0.16 * s });
  v.bubbles(t + 0.02, 0.3 * s, Math.round(7 * s), { f: 380, spread: 0.8, gain: 0.06 });
  drips(v, t + 0.12, 0.4 * s, Math.round(4 * s), s);
}
