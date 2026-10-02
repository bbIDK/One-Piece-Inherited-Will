// The markers over the world: where the main story's objective is, and the
// side quests on the tracker, laid over the 3D view — on the spot when it's
// in view (above the head of whoever you're to see), on a ring round the
// middle of the screen with an arrow when it isn't, faded out as you get
// there (from 22 m in, gone by 10 m: by then you can see it). They wear the same icons as the compass and the chart (render/icons.js wp_main,
// wp_side): gold for the main story, sky blue for a side quest. Look at one
// and it says which quest it is.
import * as THREE from 'three';
import { h } from './dom.js';
import { uiImg } from './icon.js';
import { fmtDist } from './compass.js';

const V = new THREE.Vector3();
// (a marker for something out of view rides a ring round the middle of the
// screen, pointing the way: clear of the HUD's panels at the sides and corners)
const RING_X = 0.3, RING_Y = 0.36; // the ring's radii, shares of the screen's width and height
const RING_SIDE = 300; // px: however wide the screen, the ring keeps this far in from its sides (the tracker, the menu)
const NEAR = 160; // m: closer than this, a marker stands over the spot; farther, on the horizon
const HEAD = 3.8; // m above the ground: over the head (and the name, and the "!") of whoever it's about


export class Waypoints {
  constructor(parent) {
    this.el = h('div.wpmarks.hidden');
    parent.prepend(this.el); // (under the rest of the HUD)
    this.marks = new Map();
    this.t = 0;
  }

  /** The quests that get a marker over the world: the main story's, then the side quests on the tracker. */
  static quests(game) {
    const q = game.quests;
    if (!q) return [];
    const out = [];
    const main = q.main();
    if (main) out.push({ id: main.id, main: true });
    for (const s of q.tracked()) out.push({ id: s.id, main: false });
    return out;
  }

  mark(id, main) {
    let m = this.marks.get(id);
    if (!m || m.main !== main) {
      m?.e.remove();
      const arrow = h('i.wpm-arrow'), dist = h('small.wpm-d'), name = h('b.wpm-name');
      const e = h('div.wpm' + (main ? '.main' : '.side'), arrow, uiImg(main ? 'wp_main' : 'wp_side', main ? 34 : 28), dist, name);
      this.el.appendChild(e);
      m = { e, arrow, dist, name, main, seen: 0, txt: '', label: '', cls: '' };
      this.marks.set(id, m);
    }
    m.seen = this.t;
    return m;
  }

  update(game, v3, show) {
    const on = !!(show && v3 && game.player);
    this.el.classList.toggle('hidden', !on);
    if (!on) return;
    this.t++;
    const w = game.world, p = game.player, cam = v3.rig.camera;
    const W = v3.r2d.cw, H = v3.r2d.ch, cx = W / 2, cy = H / 2;
    const rx = Math.max(80, Math.min(W * RING_X, cx - RING_SIDE)), ry = H * RING_Y;
    for (const { id, main } of Waypoints.quests(game)) {
      const m = game.quests.marker(id);
      if (!m || !Number.isFinite(m.x) || (m.zone ? m.zone !== w.id : w !== game.surface)) continue;
      const d = w.distance(p.x, p.y, m.x, m.y);
      const mk = this.mark(id, main);
      // (nearly there — where their name and "!" say who it is: out of the way)
      const fade = Math.max(0, Math.min(1, (d - 10) / 12));
      // into the camera's space: over the spot close by, on the horizon far off
      const gy = d < NEAR ? v3.ground(m.x, m.y) + HEAD : cam.position.y;
      V.set(w.dx(v3.ox, m.x), gy, m.y - v3.oy).applyMatrix4(cam.matrixWorldInverse);
      let sx, sy, edge;
      if (V.z < -0.1) {
        V.applyMatrix4(cam.projectionMatrix);
        sx = (V.x + 1) / 2 * W; sy = (1 - V.y) / 2 * H;
        edge = ((sx - cx) / rx) ** 2 + ((sy - cy) / ry) ** 2 > 1;
      } else {
        // behind you: at the side it's nearer to turn to
        sx = cx + (V.x >= 0 ? rx : -rx) * 4; sy = cy;
        edge = true;
      }
      if (edge) {
        // (on the ring, where the line out from the middle of the screen to it crosses)
        const dx = sx - cx, dy = sy - cy, k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
        sx = cx + dx * k; sy = cy + dy * k;
        mk.arrow.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
      }
      // looked at: say which quest it is
      const look = !edge && Math.abs(sx - cx) < 90 && Math.abs(sy - cy) < 70;
      const cls = (edge ? ' edge' : '') + (look ? ' look' : '');
      if (cls !== mk.cls) { mk.cls = cls; mk.e.className = 'wpm ' + (main ? 'main' : 'side') + cls; }
      const txt = fmtDist(d);
      if (txt !== mk.txt) { mk.txt = txt; mk.dist.textContent = txt; }
      const label = m.label || '';
      if (label !== mk.label) { mk.label = label; mk.name.textContent = label; }
      mk.e.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      mk.e.style.opacity = fade.toFixed(2);
    }
    for (const [k, mk] of this.marks) {
      if (mk.seen === this.t) continue;
      mk.e.remove();
      this.marks.delete(k);
    }
  }
}
