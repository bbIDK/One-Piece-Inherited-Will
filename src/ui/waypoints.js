// The markers over the world: where the main story's objective is, and the
// side quests on the tracker, laid over the 3D view — on the spot when it's
// in view (above the head of whoever you're to see), on a ring round the
// middle of the screen with an arrow when it isn't, faded out as you get
// there (from 22 m in, gone by 10 m: by then you can see it). They wear the same icons as the compass and the chart (render/icons.js wp_main,
// wp_side): gold for the main story, sky blue for a side quest. Look at one
// and it says which quest it is. The island the needle of your Log Pose
// points to has one too (its icon, coral), until you're on it; and before
// you've a road, so do the people who could set you on one (their road's
// sign: the Jolly Roger, the Marines' gull, a bounty poster).
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
// (the roads the people who can start your story would set you on: their sign — render/icons.js — and name)
const ROAD_ICON = { pirate: 'jolly_roger', marine: 'marine', hunter: 'bounty' };
const ROAD_NAME = { pirate: 'Pirate', marine: 'Marine', hunter: 'Bounty Hunter' };


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

  /**
   * The people who could start your story, still to be found — on your home
   * island, before you've taken a road (see content/mainStory.js storyMarker):
   * each with the sign of their road.
   */
  static roads(game) {
    const out = [];
    for (const a of game.actors || []) {
      const qm = a.questMarker;
      if (!qm || qm[0] !== 'R' || !a.alive || a.hidden) continue;
      const road = qm.slice(1);
      out.push({ id: 'road:' + (a.npcId || a.name), kind: 'road', icon: ROAD_ICON[road] || 'wp_main', m: { x: a.x, y: a.y, label: `${a.name} · ${ROAD_NAME[road] || 'your road'}` } });
    }
    return out;
  }

  /** The marker for a quest (kind 'main' or 'side'), the Log Pose ('lp') or a road ('road', with its sign). */
  mark(id, kind, iconName = null) {
    let m = this.marks.get(id);
    if (!m || m.kind !== kind) {
      m?.e.remove();
      const arrow = h('i.wpm-arrow'), dist = h('small.wpm-d'), name = h('b.wpm-name');
      const icon = kind === 'road' ? uiImg(iconName || 'wp_main', 32) : kind === 'main' ? uiImg('wp_main', 34) : kind === 'lp' ? uiImg('log_pose', 26) : uiImg('wp_side', 28);
      const e = h('div.wpm.' + kind, arrow, icon, dist, name);
      this.el.appendChild(e);
      m = { e, arrow, dist, name, kind, seen: 0, txt: '', label: '', cls: '' };
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
    const list = Waypoints.quests(game).map(({ id, main }) => ({ id, kind: main ? 'main' : 'side', m: game.quests.marker(id) }));
    list.push(...Waypoints.roads(game));
    // the Log Pose's island (not once you're on it)
    const lp = w === game.surface && game.logPoseInfo?.() ? game.logPoseTarget?.() : null;
    if (lp && lp !== game.currentIsland && w.distance(p.x, p.y, lp.x, lp.y) > (lp.radius || 0)) list.push({ id: 'lp', kind: 'lp', m: { x: lp.x, y: lp.y, label: game.logPoseInfo()?.label === '???' ? 'Uncharted island' : lp.name } });
    for (const { id, kind, m, icon } of list) {
      if (!m || !Number.isFinite(m.x) || (m.zone ? m.zone !== w.id : kind !== 'road' && w !== game.surface)) continue;
      const d = w.distance(p.x, p.y, m.x, m.y);
      const mk = this.mark(id, kind, icon);
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
      if (cls !== mk.cls) { mk.cls = cls; mk.e.className = 'wpm ' + kind + cls; }
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
