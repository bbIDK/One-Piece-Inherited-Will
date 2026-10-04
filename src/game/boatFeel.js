// How a ship feels under you: every number that shapes the steering, the
// wheel, the ride on the sea and the speed changes, in one place to tune.
// (Times are seconds; "per metre" values grow with the ship's length, so a
// great galleon answers more slowly than a sloop and a rowboat quickest.)
export const BOAT_FEEL = {
  // ---- steering (the helm you hold with A / D)
  helmIn: 0.32, // s for the helm to go hard over when you steer (eased in and out, no snap)
  helmOut: 0.2, // s for it to come back amidships when you let go
  turnLag: 0.1, // s the hull takes to answer her helm: how long her turn takes to build up, and to die away
  turnLagPerM: 0.0032, // … and that much more per metre of her length (a big ship swings more slowly)
  turnRate: 1, // × each class's top turning rate (1 = as the ship tables have it)

  // ---- the wheel (it turns as you steer and comes back to centre when you let go)
  wheelMax: 2.2, // radians the wheel is turned hard over (about a third of a turn)
  wheelSpeed: 14, // how briskly the wheel follows the helm (a spring's rate, per second: higher is snappier)
  standTilt: 0.5, // how much the helmsman leans with the deck as she rolls and pitches (0 stands bolt upright, 1 tilts with it)
  // (how far round each hand works a spoke before taking the next one: render3d/chars/pose.js HELM_GRIP)

  // ---- riding the sea (how she heaves, pitches and rolls on the swell)
  rideRate: 6.5, // how closely she follows the sea's surface (per second: higher is stiffer, lower floatier)
  rideRatePerM: -0.055, // … less per metre of her length (a long hull is heavier, slower to answer)
  rideDamp: 0.9, // 1 = settles without overshooting; a little under 1 gives a buoyant bob
  rideLead: 1, // how well she keeps up with the swell (1 keeps her waterline on the sea; less lets her lag behind it, floatier)
  pitchMax: 0.22, // radians she pitches at most (bow up or down)
  rollMax: 0.26, // radians she rolls at most

  // ---- speed changes (sails set or taken in, oars, wind round as she turns)
  speedSmooth: 0.45, // s over which a change in her driving force builds up (under sail)
  speedSmoothOars: 0.12, // … under oars (each stroke still surges her on)
};
