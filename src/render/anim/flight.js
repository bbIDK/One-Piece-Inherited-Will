// Flight (see docs/ANIMATION.md, "flight"): how a body hangs in the air and
// carries itself through it, by the way it flies (actor.flightStyle):
//   wings    Lunarian (and bird) wings on the back: big beats to hover, long
//            slow ones cruising, swept back in a dive; the arms along the sides
//   phoenix  the arms ARE the wings (Marco's blue flames): spread wide and
//            beating, the legs drawn up like talons
//   dragon   a serpent's flight (Seiryu): the whole body undulating, the legs
//            trailing together like a tail, the hands out like claws
//   ride     standing on a cloud, a plume of smoke or a drift of sand: knees
//            bent, arms out for balance, surfing round the turns
//   float    weightless (Fuwa Fuwa, the light): upright and easy, toes pointed,
//            drifting
//   geppo    kicking off the air itself: one leg stamps down and back, the
//            other comes up, the arms pumping — stairs nobody else can see
//   (none)   flight with nothing to show for it (creative mode): a hero's
//            flight, upright to hover, laid out flat at speed, a fist out front
//            at full tilt
// Every style hovers, cruises (pitched by the speed, leaning into turns),
// climbs and dives, and takes off and lands the same way: a crouch and a
// spring up into it, and the legs reaching for the ground and soaking up
// the landing out of it.
//
// pose.flight (render/combatfx.js actorVisuals): { style, k (0 → 1 into the
// air), t (seconds aloft), up (seconds since take-off), down (seconds since
// landing, while it lasts), fwd / side (m/s along the facing and to the
// right), climb (m/s up), bank (radians, + leaning right), speed }.
import { mixN, mixP, sm01, clamp, bump, TAU, toXY } from './timing.js';

const CRUISE = 9; // m/s: laid out flat by here

/** How far into cruising (0 hovering … 1 flat out), and the pitch the body takes for it. */
function attitude(F, max) {
  const fwd = Math.max(0, F.fwd || 0);
  const cruise = sm01((fwd - 1.2) / (CRUISE - 1.2));
  const back = sm01((-(F.fwd || 0) - 1) / 5);
  // (climbing stands the body up; diving tips it over past flat)
  const climb = clamp((F.climb || 0) / 6, -1, 1);
  let r = mixN(0.1, max, cruise) - 0.35 * Math.max(0, climb) * (0.4 + cruise) + 0.55 * Math.max(0, -climb) * (0.3 + cruise) - 0.3 * back;
  r = clamp(r, -0.45, 1.9);
  return { cruise, back, climb, r };
}

/**
 * The flight pose. Writes the body's pitch (P.r), lean, legs, arms, the
 * wings (P.ws spread, P.wg beat: −1 up … +1 down, P.wf swept back) and the
 * bank into a turn (P.bk, the rig rolls the whole body about its length).
 */
export function flightPose(P, pose) {
  const F = pose.flight;
  const t = F.t || 0, style = F.style || 'hero';
  const A = attitude(F, style === 'ride' || style === 'float' ? 0.32 : style === 'geppo' ? 0.42 : 1.22);
  const side = clamp((F.side || 0) / 8, -1, 1);
  P.wF = null; P.wB = null;
  P.sm = 0; P.smF = 0; P.smB = 0; P.smfF = 0; P.smfB = 0;
  P.tw = 0; P.hp = 0; P.ls = 0;
  (STYLE[style] || STYLE.hero)(P, F, A, t);
  // pitched by the speed, rolled into the turn (and toward a sideways drift)
  if (style !== 'ride') P.r = (P.r || 0) + A.r;
  P.bk = clamp((F.bank || 0) + side * 0.35, -0.85, 0.85) * (style === 'float' ? 0.5 : 1);
  P.ht = (P.ht || 0) - (P.r || 0) * 0.62; // (the head stays up, looking where it goes)
  P.hand = P.hand || 'fist'; P.handB = P.handB || 'fist';
  takeoffLanding(P, F);
}

// ------------------------------------------------------------------ the styles
const STYLE = {
  // wings on the back; the arms lie along the sides, the legs together
  wings(P, F, A, t) {
    const hz = mixN(2.3, 1.25, A.cruise) + Math.max(0, A.climb) * 0.8;
    const dive = Math.max(0, -A.climb) * A.cruise;
    // (a beat: the downstroke quicker than the upstroke)
    const ph = (t * hz) % 1;
    const beat = ph < 0.42 ? -1 + 2 * sm01(ph / 0.42) : 1 - 2 * sm01((ph - 0.42) / 0.58);
    P.ws = 1; P.wg = beat * (1 - 0.75 * dive) + 0.25 * dive; P.wf = dive * 0.8;
    const lift = ph < 0.42 ? bump(ph, 0, 0.42) : 0;
    P.b = [0, 0.02 - 0.015 * lift];
    P.l = 0.06 * A.cruise;
    P.hF = mixP([0.06, 0.36], [-0.04, 0.39], A.cruise); P.hB = mixP([-0.02, 0.37], [-0.06, 0.39], A.cruise);
    P.zF = 0.06 * (1 - A.cruise); P.zB = 0.06 * (1 - A.cruise); P.eF = 0.4; P.eB = 0.4;
    P.hand = 'relaxed'; P.handB = 'relaxed';
    legs(P, A, t, 0.6);
  },
  // the arms are the wings: spread out to the sides and beating, slow and strong
  phoenix(P, F, A, t) {
    const hz = mixN(1.7, 1.05, A.cruise) + Math.max(0, A.climb) * 0.6;
    const dive = Math.max(0, -A.climb) * A.cruise;
    const ph = (t * hz) % 1;
    const beat = ph < 0.45 ? -1 + 2 * sm01(ph / 0.45) : 1 - 2 * sm01((ph - 0.45) / 0.55);
    // (up: the hands high over the shoulders; down: below them, sweeping forward a little)
    const y = mixN(-0.2, 0.16, (beat + 1) / 2) * (1 - 0.6 * dive) + 0.12 * dive;
    const x = 0.04 + 0.06 * Math.max(0, beat) - 0.12 * dive;
    P.hF = [x, y]; P.hB = [x, y];
    P.zF = 0.48 - 0.2 * dive; P.zB = 0.48 - 0.2 * dive;
    P.eF = 0.25; P.eB = 0.25; P.hand = 'palm'; P.handB = 'palm';
    P.ht = 0.04;
    P.b = [0, 0.02 - 0.02 * Math.max(0, beat)];
    // (the legs drawn up under the body like a bird's)
    P.fF = mixP([0.08, -0.2], [-0.02, -0.12], A.cruise); P.fB = mixP([0.02, -0.24], [-0.08, -0.16], A.cruise);
    P.zfF = 0.02; P.zfB = 0.02;
  },
  // a serpent: the trunk undulating (a wave running from the chest to the hips), the legs a tail
  dragon(P, F, A, t) {
    const w = t * mixN(3.2, 4.6, A.cruise);
    const amp = mixN(0.18, 0.3, A.cruise);
    P.ls = amp * Math.sin(w);
    P.tw = 0.6 * amp * Math.sin(w - 0.9);
    P.hp = -0.8 * amp * Math.sin(w - 1.8);
    P.hy = -0.5 * amp * Math.sin(w + 0.6);
    P.l = 0.05 + 0.04 * Math.sin(w * 2);
    P.hF = [0.3, 0.04 - 0.06 * Math.sin(w)]; P.hB = [0.27, 0.08 + 0.06 * Math.sin(w)];
    P.zF = 0.08; P.zB = 0.08; P.eF = 0.7; P.eB = 0.7;
    P.hand = 'claw'; P.handB = 'claw';
    // (the legs together, the feet sweeping side to side behind like a tail)
    const tail = Math.sin(w - 2.4) * 0.12 * (0.4 + A.cruise);
    P.fF = [-0.02, -0.03]; P.fB = [-0.04, -0.05];
    P.zfF = -0.02 + tail; P.zfB = -0.02 - tail;
    P.b = [0, 0.02];
  },
  // standing on a cloud (or smoke, or sand) and surfing it
  ride(P, F, A, t) {
    const lean = 0.08 + 0.3 * A.cruise + 0.15 * Math.max(0, A.climb) - 0.12 * A.back;
    const bob = Math.sin(t * 2.1) * 0.012;
    P.r = 0;
    P.b = [0.02 * A.cruise, 0.07 + 0.05 * A.cruise + bob];
    P.l = lean;
    P.fF = [0.2, 0]; P.fB = [-0.2, 0]; P.zfF = 0.03; P.zfB = 0.03;
    // arms out for balance once it moves; easy at the sides when it doesn't
    P.hF = mixP([0.06, 0.34], [0.16, 0.05], A.cruise); P.hB = mixP([-0.04, 0.35], [-0.18, 0.1], A.cruise);
    P.zF = 0.05 + 0.22 * A.cruise; P.zB = 0.05 + 0.26 * A.cruise;
    P.eF = 0.6; P.eB = 0.6; P.hand = 'relaxed'; P.handB = 'palm';
    P.tw = 0.18 + 0.1 * A.cruise; P.hp = 0.2;
    P.ht = -lean * 0.4;
  },
  // weightless: upright, easy, drifting
  float(P, F, A, t) {
    const w = t * 1.5;
    P.z = 0.04 * Math.sin(w);
    P.b = [0, 0];
    P.l = 0.04 + 0.08 * A.cruise;
    P.hF = [0.05 + 0.02 * Math.sin(w + 1), 0.35]; P.hB = [-0.04 + 0.02 * Math.sin(w + 2), 0.36];
    P.zF = 0.1; P.zB = 0.1; P.eF = 0.5; P.eB = 0.5; P.hand = 'relaxed'; P.handB = 'relaxed';
    P.fF = [0.03, -0.05 - 0.02 * Math.sin(w + 0.5)]; P.fB = [-0.05, -0.09 + 0.02 * Math.sin(w + 0.5)];
    P.ht = 0.02;
  },
  // stepping on the air: a stamp down and back, the other knee up, arms pumping
  geppo(P, F, A, t) {
    const hz = mixN(1.6, 2.7, Math.max(A.cruise, Math.max(0, A.climb)));
    const ph = (t * hz) % 1, step = ph < 0.5 ? 0 : 1, u = (ph % 0.5) / 0.5;
    // (the stamp: quick down, a held push, the leg drawn back up)
    const kick = u < 0.25 ? sm01(u / 0.25) : 1 - sm01((u - 0.45) / 0.55);
    const tuck = 1 - kick;
    const down = [-0.12 - 0.06 * kick, -0.04 + 0.04 * kick];
    const up = [0.16, -0.3 - 0.04 * tuck];
    const [a, b] = step ? [up, down] : [down, up];
    P.fF = mixP(a, [0.04, -0.2], 0.25 * (1 - kick)); P.fB = mixP(b, [0.04, -0.2], 0.25 * (1 - kick));
    // the arms against the legs
    const swing = step ? 1 : -1;
    P.hF = [0.06 + 0.14 * swing * kick, 0.18 - 0.08 * kick * Math.max(0, swing)]; P.hB = [0.06 - 0.14 * swing * kick, 0.18 - 0.08 * kick * Math.max(0, -swing)];
    P.eF = 1; P.eB = 1;
    P.b = [0, 0.05 + 0.03 * kick];
    P.l = 0.12 + 0.12 * A.cruise;
    P.face = 'fierce';
  },
  // flight with nothing to show for it: a hero's
  hero(P, F, A, t) {
    const w = t * 1.7;
    P.b = [0, 0.01];
    P.l = 0.04 * A.cruise;
    // hovering: easy, a knee bent; at speed: laid out, arms along the sides — at full tilt a fist out front
    const tilt = sm01(((F.fwd || 0) - CRUISE * 1.1) / (CRUISE * 0.8));
    P.hF = mixP(mixP([0.07, 0.34], [-0.02, 0.38], A.cruise), [0.46, -0.1], tilt); P.hB = mixP([-0.02, 0.35], [-0.06, 0.38], A.cruise);
    P.zF = 0.08 * (1 - A.cruise); P.zB = 0.08 * (1 - A.cruise); P.eF = 0.5; P.eB = 0.5;
    P.hand = tilt > 0.5 ? 'fist' : 'relaxed'; P.handB = 'relaxed';
    P.z = 0.02 * Math.sin(w) * (1 - A.cruise);
    legs(P, A, t, 1);
  },
};

/** Legs hanging: dangling apart with a knee bent (hovering) → together and trailing (cruising). */
function legs(P, A, t, sway) {
  const s = Math.sin(t * 1.7) * 0.02 * sway * (1 - A.cruise);
  P.fF = mixP([0.07 + s, -0.12], [-0.02, -0.03], A.cruise);
  P.fB = mixP([-0.05 - s, -0.04], [-0.06, -0.06], A.cruise);
  P.zfF = 0.03 * (1 - A.cruise); P.zfB = 0.01;
}

/**
 * Up into the air (F.up seconds since): a crouch, a spring up through the
 * legs with the arms thrown up, easing into the flight pose. Down out of it
 * (F.down seconds since touching down): the knees soak it up and the body
 * rises back to standing.
 */
function takeoffLanding(P, F) {
  const up = F.up ?? Infinity;
  if (up < 0.5) {
    // (the crouch, then the spring: legs straight, arms up, the body upright)
    const crouch = bump(up, -0.02, 0.2), spring = bump(up, 0.1, 0.5);
    const k = 1 - sm01((up - 0.18) / 0.32); // (how much of the take-off is still in the pose)
    P.r = mixN(P.r || 0, 0, k);
    P.bk = mixN(P.bk || 0, 0, k);
    P.b = [P.b[0], mixN(P.b[1], 0.17, crouch) - 0.03 * spring];
    P.l = mixN(P.l || 0, 0.28, crouch);
    P.fF = mixP(mixP(P.fF, [0.12, 0], crouch * k), [0.04, -0.06], spring * 0.7);
    P.fB = mixP(mixP(P.fB, [-0.12, 0], crouch * k), [-0.04, -0.1], spring * 0.7);
    P.hF = mixP(mixP(P.hF, [-0.1, 0.3], crouch * k), [0.14, -0.3], spring * 0.6 * k);
    P.hB = mixP(mixP(P.hB, [-0.14, 0.3], crouch * k), [0.06, -0.26], spring * 0.6 * k);
    if (P.ws !== undefined) { P.wg = mixN(P.wg, -1 + 2 * sm01((up - 0.08) / 0.2), crouch + spring > 0.2 ? 0.9 : 0); P.ws = Math.max(P.ws, spring); }
  }
  const down = F.down;
  if (down !== undefined && down < 0.4) {
    // (touchdown: the knees give, the weight comes down onto them, then up)
    const soak = down < 0.06 ? sm01(down / 0.06) : 1 - sm01((down - 0.12) / 0.28);
    P.r = 0; P.bk = 0;
    P.b = [P.b[0], mixN(P.b[1], 0.16, soak)];
    P.l = mixN(P.l || 0, 0.22, soak);
    P.fF = mixP(P.fF, [0.16, 0], 1); P.fB = mixP(P.fB, [-0.14, 0], 1);
    P.hF = mixP(P.hF, [0.2, 0.18], soak * 0.6); P.hB = mixP(P.hB, [0.1, 0.24], soak * 0.6);
    if (P.ws !== undefined) { P.ws = 1 - sm01(down / 0.3); P.wg = -0.4 * (1 - sm01(down / 0.3)); }
  }
}

/**
 * Busy in the air (a blow thrown, a technique cast while flying): the clip
 * has the arms and the trunk; the legs hang as the flight has them and the
 * body stays upright enough for the blow to read.
 */
export function flightLegs(P, pose) {
  const F = pose.flight, t = F.t || 0;
  const A = attitude(F, 0.3);
  if (F.style === 'ride') { P.fF = [0.2, 0]; P.fB = [-0.2, 0]; return; }
  const s = Math.sin(t * 1.7) * 0.02;
  P.fF = mixP([0.08 + s, -0.14], [0.0, -0.06], A.cruise);
  P.fB = mixP([-0.04 - s, -0.05], [-0.06, -0.08], A.cruise);
  P.r = (P.r || 0) + Math.min(0.3, A.r * 0.4);
  P.z = (P.z || 0);
  if (F.style === 'wings') { const ph = (t * 2) % 1; P.ws = 1; P.wg = Math.sin(ph * TAU) * 0.7; }
}

/**
 * The flight as the pose sees it (pose.flight), from what the actor keeps:
 * flying, flightStyle, its velocity and altitude (game/actor.js). Remembers
 * a little between frames on the actor (when it took off and landed, how
 * fast it climbs, how hard it banks into a turn), so call it once a frame.
 * Undefined when not flying (and not just landed).
 */
export function flightState(a, now) {
  const S = a._fly || (a._fly = { on: false, upT: -9, downT: -9, t0: now, h: null, bank: 0, alt: null, climb: 0, last: now, style: null });
  const dt = clamp(now - S.last, 0, 0.1);
  S.last = now;
  const flying = !!a.flying;
  if (flying && !S.on) { S.on = true; S.upT = now; S.t0 = now; S.alt = null; S.bank = 0; S.h = null; }
  if (!flying && S.on) { S.on = false; S.downT = now; }
  if (flying) S.style = a.flightStyle || null;
  const vx = a.vx || 0, vy = a.vy || 0, sp = Math.hypot(vx, vy);
  if (!flying) {
    // (just down: the landing, once the feet are on the ground and while standing)
    const since = now - S.downT;
    if (since >= 0 && since < 0.4 && !(a.z > 0.08) && sp < 1.5) return { style: S.style, t: now - S.t0, down: since, fwd: 0, side: 0, climb: 0, bank: 0, speed: 0 };
    return undefined;
  }
  const f = a.facing || 0, c = Math.cos(f), s = Math.sin(f);
  const alt = a.alt ?? a.z ?? 0;
  if (S.alt !== null && dt > 0) S.climb += ((alt - S.alt) / dt - S.climb) * Math.min(1, dt * 6);
  S.alt = alt;
  // banking: how fast the heading turns, times the speed (the lean a turn needs)
  let want = 0;
  if (sp > 1.5) {
    const h = Math.atan2(vy, vx);
    if (S.h !== null && dt > 0) {
      let dh = h - S.h;
      dh = ((dh + Math.PI) % TAU + TAU) % TAU - Math.PI;
      want = clamp((dh / dt) * Math.min(sp, 14) * 0.045, -0.8, 0.8);
    }
    S.h = h;
  } else S.h = null;
  S.bank += (want - S.bank) * Math.min(1, dt * 4);
  return { style: S.style, t: now - S.t0, up: now - S.upT, fwd: vx * c + vy * s, side: -vx * s + vy * c, climb: S.climb, bank: S.bank, speed: sp };
}

/** A hand target eased toward a flight's (for the first-person arms: see chars/viewmodel.js). */
export const flightHands = (F) => {
  const P = { b: [0, 0], hF: [0.05, 0.4], hB: [-0.03, 0.4] };
  flightPose(P, { flight: F });
  return { hF: toXY(P.hF), hB: toXY(P.hB), zF: P.zF || 0, zB: P.zB || 0, hand: P.hand, handB: P.handB };
};
