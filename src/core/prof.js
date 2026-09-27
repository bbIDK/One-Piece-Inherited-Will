// A tiny frame profiler for the play-test harness: when PROF.on, the main
// loop and the 3D view add up how long each part of a frame takes (JS time,
// in ms), and PROF.frames counts the frames. With PROF.trace set to an array,
// each frame's own breakdown is pushed onto it too (to find the hitches).
// Off, it costs a branch.
export const PROF = { on: false, t: Object.create(null), frames: 0, trace: null, cur: Object.create(null) };

/** Add the time since t0 (performance.now()) to section `name`. */
export function prof(name, t0) {
  if (!PROF.on) return;
  const d = performance.now() - t0;
  PROF.t[name] = (PROF.t[name] || 0) + d;
  if (PROF.trace) PROF.cur[name] = (PROF.cur[name] || 0) + d;
}

/** The end of a frame. */
export function profFrame() {
  if (!PROF.on) return;
  PROF.frames++;
  if (PROF.trace) { PROF.trace.push(PROF.cur); PROF.cur = Object.create(null); }
}

export function profReset() { PROF.t = Object.create(null); PROF.frames = 0; PROF.cur = Object.create(null); if (PROF.trace) PROF.trace = []; }
