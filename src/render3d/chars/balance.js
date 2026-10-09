// Keeping your feet on a moving deck. A body standing on a ship is carried
// by her planks but isn't bolted to them: her heave, roll and pitch swing
// the deck under your feet up and down and side to side (a point five metres
// up her side swings half a metre in a few degrees of roll), and when she
// turns or gathers way she pulls them sideways or ahead. Your body lags
// behind (inertia, Newton's first law), and the legs catch it as a
// spring with a damper would: the knees give as the deck rises under you
// and straighten as it falls away, and the hips swing out over the feet and
// back — stance widening and the arms coming out a little when it's rough.
//
// Each body keeps its own state: its hips' offset from where they'd be on a
// still deck (x ahead, s to the right, y up, metres), and how fast that's
// changing. Every frame the deck's acceleration where you stand comes from
// the same motion the ship is drawn with (hull.js shipPoint, by second
// differences), and the offset follows m·x'' = -k·x - c·x' - m·a_deck: a
// damped oscillator driven by the deck's acceleration, ω₀ ≈ 4 rad/s and
// ζ ≈ 0.4 — a person bracing, loose-kneed, as sailors stand.
import { shipPoint, shipLift } from '../../world/hull.js';

const W0 = 4.2, ZETA = 0.42; // natural frequency (rad/s) and damping ratio of the legs' "suspension"
const WY = 6.5, ZY = 0.55; // vertically the knees are stiffer: the weight sits on them
const H = 0.09; // time step of the second differences (s)
const _p0 = [0, 0, 0], _p1 = [0, 0, 0], _p2 = [0, 0, 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Advance a body's balance on ship `s` by dt and fill `o` (the rig options)
 * with the result: o.balF / o.balS / o.balY the hips' offset (model units),
 * o.deckG the deck's slope under the feet [ahead, right] — so each foot
 * stands on the planks where they are — and o.legSpread / o.leanAdd for
 * the stance. `f` is the body's facing, `dx, dy` where it stands from the
 * ship's middle (world metres), `h` its height over her waterline, `sc` the
 * model's scale, `k` how much of it to show (a little in first person).
 */
export function deckBalance(st, s, time, dt, f, dx, dy, h, sc, o, k = 1) {
  const hd = s.heading, ch = Math.cos(hd), sh = Math.sin(hd);
  const u = dx * ch + dy * sh, v = -dx * sh + dy * ch;
  // the deck's acceleration where you stand (world: x east, y up, z = world y)
  shipPoint(s, time - H, u, v, h, _p0);
  shipPoint(s, time, u, v, h, _p1);
  shipPoint(s, time + H, u, v, h, _p2);
  const ih = 1 / (H * H);
  let ax = (_p2[0] - 2 * _p1[0] + _p0[0]) * ih, ay = (_p2[1] - 2 * _p1[1] + _p0[1]) * ih, az = (_p2[2] - 2 * _p1[2] + _p0[2]) * ih;
  // ...and the ship's own: centripetal in a turn (a = v·ω, toward the turn),
  // and along her as she gathers way or loses it (a = dv/dt)
  const sp = s.speed || 0, wr = s.yawRate || 0;
  // (the game's ships gather way far faster than a real one of her tons could:
  // only a share of it is felt, or you'd be leaning back for half a minute)
  const dv = st.sp === undefined || dt <= 0 ? 0 : clamp((sp - st.sp) / dt, -3, 3) * 0.25;
  st.sp = sp;
  const ac = clamp(sp * wr, -2.5, 2.5);
  ax += dv * ch - ac * sh; az += dv * sh + ac * ch;
  // into the body's own frame: ahead, to its right, up
  const cf = Math.cos(f), sf = Math.sin(f);
  const aF = clamp(ax * cf + az * sf, -6, 6), aS = clamp(-ax * sf + az * cf, -6, 6), aY = clamp(ay, -6, 6);
  // integrate (semi-implicit Euler, in small steps so a long frame can't blow it up)
  const n = Math.max(1, Math.ceil(dt / (1 / 60)));
  const t = Math.min(dt, 0.25) / n;
  for (let i = 0; i < n; i++) {
    st.vF += (-W0 * W0 * st.xF - 2 * ZETA * W0 * st.vF - aF) * t; st.xF += st.vF * t;
    st.vS += (-W0 * W0 * st.xS - 2 * ZETA * W0 * st.vS - aS) * t; st.xS += st.vS * t;
    st.vY += (-WY * WY * st.xY - 2 * ZY * WY * st.vY - aY) * t; st.xY += st.vY * t;
  }
  st.xF = clamp(st.xF, -0.12, 0.12); st.xS = clamp(st.xS, -0.12, 0.12); st.xY = clamp(st.xY, -0.07, 0.04);
  // how rough it is underfoot (a slow-moving average of the deck's sway)
  const rough = Math.min(1, Math.hypot(aF, aS) / 1.2 + Math.abs(aY) / 2.5);
  st.rough += (rough - st.rough) * Math.min(1, dt * 1.5);
  // the deck's slope under the feet (from her roll and pitch where you stand)
  const e = 0.25;
  const gU = (shipLift(s, time, u + e, v, h) - shipLift(s, time, u - e, v, h)) / (2 * e);
  const gV = (shipLift(s, time, u, v + e, h) - shipLift(s, time, u, v - e, h)) / (2 * e);
  const gx = gU * ch - gV * sh, gz = gU * sh + gV * ch;
  const is = k / sc;
  o.balF = st.xF * is; o.balS = st.xS * is; o.balY = st.xY * is;
  o.deckG = [clamp(gx * cf + gz * sf, -0.4, 0.4) * k, clamp(-gx * sf + gz * cf, -0.4, 0.4) * k];
  // (sea legs: feet a little wider apart, and the trunk leaning back over them as the hips swing out)
  o.legSpread = (o.legSpread || 0) + 0.035 * st.rough * k;
  o.leanAdd = (o.leanAdd || 0) - st.xF * 0.9 * k;
  o.balLs = -st.xS * 1.6 * k;
  o.balArms = clamp(Math.hypot(st.xF, st.xS) * 2.2 + st.rough * 0.04, 0, 0.14) * k;
}

/** A fresh balance state (hips centred, still). */
export const balanceState = () => ({ xF: 0, vF: 0, xS: 0, vS: 0, xY: 0, vY: 0, rough: 0, sp: undefined });

/** Off the deck: let go of it (no fields left set). */
export function clearBalance(o) { o.balF = 0; o.balS = 0; o.balY = 0; o.deckG = null; o.balLs = 0; o.balArms = 0; }
