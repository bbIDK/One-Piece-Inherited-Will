// Smooth motion for the other players. Their states come in a dozen times a
// second, a little irregularly (the network is never quite even); each player
// is drawn a short moment in the past, in between the two states either side
// of that moment, so they glide rather than jump — and are guessed ahead
// only briefly, along their way, when the next state is late. Pure: the
// times are passed in (ms, our clock), so it runs the same in the tests.
import { angleDiff } from '../core/math.js';

// how each field of a state (see protocol.js readState) is drawn in between two
const LIN = ['y', 'z', 'vx', 'vy', 'vz', 'sp', 'd', 'wd', 'g', 'du', 'dv', 'dh', 'sy', 'ss', 'sl', 'lv', 'pi', 'c', 'hs', 'mz', 'rl', 'rr'];
const WRAP = ['x', 'sx']; // east-west: the world wraps round
const ANG = ['f', 'sh']; // angles: the short way round

export class SnapBuffer {
  /**
   * width: the world's width (it wraps east-west; 0 for none). Delays (ms):
   * between minDelay and maxDelay, as the states arrive; ahead: the longest
   * guess past the newest state; jump: metres between two states beyond
   * which it's a leap (a journey to a friend, a zone), not slid across.
   */
  constructor({ width = 0, minDelay = 90, maxDelay = 450, ahead = 220, jump = 30 } = {}) {
    Object.assign(this, { width, minDelay, maxDelay, ahead, jump });
    this.reset();
  }

  reset() {
    this.buf = [];
    this.offs = []; // [when it came, our clock − theirs]
    this.gaps = []; // ms between states while things were happening
    this.offset = null;
    this.delay = this.minDelay * 1.4;
    this.lastRecv = -Infinity;
  }

  /** b − a east-west, the short way round the world. */
  dx(a, b) {
    const W = this.width, d = b - a;
    return W ? ((((d + W / 2) % W) + W) % W) - W / 2 : d;
  }
  wrap(x) { const W = this.width; return W ? ((x % W) + W) % W : x; }

  /** A state (readState) that came in at `now`; false if it's one we already have, or older. */
  push(s, now) {
    let prev = this.buf[this.buf.length - 1];
    if (prev && s.t <= prev.t) {
      // (their page started over — its clock counts from nought again: so do we)
      if (s.t < prev.t - 3000) { this.reset(); prev = null; } else return false;
    }
    // continuous east-west places and angles, so the in-betweens go the short way
    for (const k of WRAP) if (s[k] !== undefined) s['_' + k] = prev && prev[k] !== undefined ? prev['_' + k] + this.dx(prev[k], s[k]) : s[k];
    for (const k of ANG) if (s[k] !== undefined) s['_' + k] = prev && prev[k] !== undefined ? prev['_' + k] + angleDiff(prev[k], s[k]) : s[k];
    // a leap (a journey across the world, into a zone, onto another ship): not slid across
    if (prev && (s.w !== prev.w || (s.si || '') !== (prev.si || '') || Math.hypot(s._x - prev._x, s.y - prev.y) > this.jump)) s.cut = true;
    // their clock against ours: the quickest arrival is the truest (it waited least on the way)
    const est = now - s.t;
    this.offs.push([now, est]);
    while (this.offs.length > 2 && this.offs[0][0] < now - 4000) this.offs.shift();
    let off = Infinity, worst = -Infinity;
    for (const o of this.offs) { if (o[1] < off) off = o[1]; if (o[1] > worst) worst = o[1]; }
    this.offset = off;
    // how far apart they come while something's going on (an "all quiet" state
    // every half second says nothing about that), and how unevenly: the delay
    // covers both, with a little to spare
    if (prev && !s.hb && !s.cut) {
      this.gaps.push(s.t - prev.t);
      if (this.gaps.length > 10) this.gaps.shift();
    }
    const gap = this.gaps.length ? Math.max(...this.gaps) : 1000 / 12;
    const want = Math.min(this.maxDelay, Math.max(this.minDelay, gap + (worst - off) + 20));
    this.delay += (want - this.delay) * 0.15;
    this.buf.push(s);
    this.lastRecv = now;
    return true;
  }

  /** The newest state there is (where they are now, near enough), or null. */
  latest() { return this.buf[this.buf.length - 1] || null; }

  /**
   * What to draw at `now` (our clock): a fresh object with the state's fields,
   * the moving ones in between the two states either side of that moment
   * (`lag`: seconds of their time since the earlier one) — or the newest
   * held, guessed a little way ahead along its motion when the next is late.
   */
  sample(now) {
    const B = this.buf;
    if (!B.length) return null;
    const T = now - this.offset - this.delay;
    // (the ones from well before that moment aren't needed any more)
    while (B.length > 2 && B[1].t < T - 250) B.shift();
    let i = B.length - 1;
    while (i > 0 && B[i].t > T) i--;
    const a = B[i], b = B[i + 1] && a.t <= T ? B[i + 1] : null;
    const out = { ...a };
    out.lag = Math.max(0, (T - a.t) / 1000);
    if (b && !b.cut) {
      const k = Math.min(1, Math.max(0, (T - a.t) / (b.t - a.t)));
      for (const f of LIN) if (a[f] !== undefined && b[f] !== undefined) out[f] = a[f] + (b[f] - a[f]) * k;
      for (const f of WRAP) if (a[f] !== undefined && b[f] !== undefined) out[f] = this.wrap(a['_' + f] + (b['_' + f] - a['_' + f]) * k);
      for (const f of ANG) if (a[f] !== undefined && b[f] !== undefined) out[f] = a['_' + f] + (b['_' + f] - a['_' + f]) * k;
      out.k = k;
    } else if (!b && T > a.t) {
      // late: on along their way for a moment, then held where the last one left them
      const s = Math.min(T - a.t, this.ahead) / 1000;
      if (a.vx || a.vy) { out.x = this.wrap(a.x + (a.vx || 0) * s); out.y = a.y + (a.vy || 0) * s; }
      if (a.ss && a.sh !== undefined) { out.sx = this.wrap(a.sx + Math.cos(a.sh) * a.ss * s); out.sy = a.sy + Math.sin(a.sh) * a.ss * s; }
      out.late = T - a.t;
    }
    for (const f of ['_x', '_sx', '_f', '_sh', 'cut']) delete out[f];
    out.T = T;
    return out;
  }
}
