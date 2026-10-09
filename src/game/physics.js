// The physics everything that moves shares: Earth's gravity, the densities
// of air and sea water, and the textbook formulas built on them — so a jump,
// a fall, a body skidding to a stop on ice, a ship gathering way and coasting
// to a stop all follow the same laws rather than numbers picked one by one.
//
//   gravity           a = g = 9.81 m/s² (Earth, at sea level)
//   a jump's height   h = v² / 2g, so the take-off speed for a height is v = √(2gh)
//   air drag          F = ½ ρ v² C_d A, against the motion; a = F / m
//   terminal speed    v_t = √(2 m g / ρ C_d A)  (a skydiver, spread out: ~55 m/s)
//   friction          a body's feet can push it at most μ·g (sideways on the ground):
//                     how fast it can speed up, stop or turn is set by the grip
//                     under it — boots on rock, on sand, on a frozen pond
//   buoyancy          F = ρ_water g V_submerged (Archimedes): a body (~985 kg/m³)
//                     floats with its head out; a ship sits where her weight's displaced
//   Newton's 2nd law  F = m a (a heavier body is pushed less far by the same blow)
//
// One concession: a few speeds in the game were first set against a heavier
// "game gravity" (22 m/s²); legacyV turns such a speed into the one that
// reaches the same height under real gravity (h = v²/2g held fixed), so
// every jump still clears what it was meant to clear — it just hangs in the
// air as long as a real one would.

export const G = 9.81; // m/s²
export const RHO_AIR = 1.225; // kg/m³ (sea level, 15 °C)
export const RHO_SEA = 1025; // kg/m³
export const RHO_BODY = 985; // kg/m³ (a human body, lungs half full)
const LEGACY_G = 22;

/** The speed that reaches the same height under real gravity as `v` did under the old 22 m/s². */
export const legacyV = (v) => v * Math.sqrt(G / LEGACY_G);
/** The take-off speed to rise `h` metres: v = √(2gh). */
export const apexV = (h) => Math.sqrt(2 * G * Math.max(0, h));
/** How high a take-off speed `v` carries: h = v² / 2g. */
export const apexH = (v) => (v * v) / (2 * G);

/** A body's mass (kg): a 70 kg adult, scaled by volume (a giant three times as tall weighs 27 times as much). */
export const bodyMass = (scale = 1) => 70 * scale * scale * scale;

/**
 * Quadratic drag's coefficient k = ½ ρ C_d A / m, so that a = -k v|v|.
 * A person: C_d ≈ 1.0, frontal area ≈ 0.7 m² (scaled by the square of their size).
 */
export const dragK = (cd, area, mass, rho = RHO_AIR) => (0.5 * rho * cd * area) / mass;
export const bodyDragK = (scale = 1) => dragK(1.0, 0.7 * scale * scale, bodyMass(scale));
/** Terminal speed for drag coefficient k: v_t = √(g / k). */
export const terminalV = (k) => Math.sqrt(G / k);

/**
 * One step of a vertical velocity under gravity and air drag (semi-implicit:
 * the drag is taken on the new speed, so it can't overshoot past zero).
 */
export function fallStep(vz, dt, k, g = G) {
  const v = vz - g * dt;
  return v / (1 + k * Math.abs(v) * dt);
}

/**
 * The grip under a pair of feet: the friction coefficient μ (static, as a
 * walker's shoe takes it). How hard you can accelerate, brake or turn is
 * μ·g. Rock, paving and grass take a good grip; loose sand and mud less;
 * snow less again; ice almost none — run onto a frozen pond and you slide.
 * (Feet don't skid on dry ground at all: a runner's push is limited by the
 * legs before the grip, so dry ground is set a little over 1.)
 */
const GRIP = new Map([
  ['ice', 0.12], ['pack_ice', 0.18], ['snow', 0.55], ['snowrock', 0.75], ['mud', 0.5], ['sand', 0.75], ['desert', 0.7],
  ['marble', 0.8], ['cloud', 0.6], ['candy', 0.8], ['cake', 0.7], ['ash', 0.8],
]);
export const DRY_GRIP = 1.35;
export function gripOf(name) { return GRIP.get(name) ?? DRY_GRIP; }

/**
 * Change a velocity (vx, vy) toward (tx, ty) as feet with grip μ can, in
 * time dt: by at most μ·g·dt (the friction force's limit, F = μ m g, so
 * a = μ g). Returns the new velocity in `out`.
 */
export function gripStep(vx, vy, tx, ty, mu, dt, out) {
  const dx = tx - vx, dy = ty - vy, d = Math.hypot(dx, dy);
  const max = mu * G * dt;
  if (d <= max || d < 1e-9) { out[0] = tx; out[1] = ty; return out; }
  const k = max / d;
  out[0] = vx + dx * k; out[1] = vy + dy * k;
  return out;
}

/**
 * Hull drag on a ship: R = ½ ρ_sea v² C_t S, with S her wetted surface. In
 * the game a hull's own numbers are her top speed in a fair wind (where the
 * sails' push and the water's drag balance); so the drive is taken as
 * D = R(top)·(target/top)², and her speed obeys m dv/dt = D - R(v). That's
 * what makes a ship gather way slowly and carry it — coasting on long after
 * the sails are struck, slowing faster the faster she goes — instead of
 * easing to a new speed at a fixed rate. `tau` sets how heavy she feels:
 * the time she'd take to lose half her way from full speed with nothing
 * driving her (a real ship's minutes are a game's seconds).
 */
export function hullStep(v, target, top, tau, dt) {
  top = Math.max(0.5, top);
  // with a = -c v|v| from v0, half the speed is lost after t = 1 / (c v0): c = 1 / (tau · top)
  const c = 1 / (Math.max(0.1, tau) * top);
  const drive = c * target * Math.abs(target);
  const n = Math.max(1, Math.ceil(dt / 0.05)), h = dt / n;
  for (let i = 0; i < n; i++) v += (drive - c * v * Math.abs(v)) * h;
  return v;
}
