// The first-person compass: a strip at the top of the screen with the
// cardinal points, the Log Pose target, the quests under way (the main
// story's gold, side quests' sky blue: the icons of the chart and of the
// markers over the world) and your ship.
import { h } from './dom.js';
import { Waypoints } from './waypoints.js';
import { angleDiff } from '../core/math.js';
import { uiImg } from './icon.js';

// world angles use the game's convention: atan2(dy, dx) with y pointing south
const POINTS = [['E', 0], ['SE', Math.PI / 4], ['S', Math.PI / 2], ['SW', Math.PI * 3 / 4], ['W', Math.PI], ['NW', -Math.PI * 3 / 4], ['N', -Math.PI / 2], ['NE', -Math.PI / 4]];
const SPAN = Math.PI * 0.8; // the angle shown across the strip

/** A distance as the HUD says it everywhere (the compass, the tracker, the markers over the world, the quest log). */
export const fmtDist = (d) => (d >= 1000 ? (d / 1000).toFixed(d >= 10000 ? 0 : 1) + ' km' : d >= 100 ? Math.round(d / 10) * 10 + ' m' : Math.max(1, Math.round(d)) + ' m');

export class Compass {
  constructor(parent) {
    this.el = h('div.compass.hidden');
    this.points = POINTS.map(([t, a]) => {
      const e = h('span.cp' + (t.length === 1 ? '.major' : '') + (t === 'N' ? '.n' : ''), t);
      this.el.appendChild(e);
      return { e, a };
    });
    this.ticks = [];
    for (let k = 0; k < 24; k++) {
      if (k % 3 === 0) continue;
      const e = h('i.tick');
      this.el.appendChild(e);
      this.ticks.push({ e, a: k * Math.PI / 12 });
    }
    this.pins = new Map(); // key → { e, dist }
    this.t = 0;
    parent.appendChild(this.el);
  }

  /** Put an element at world angle `a`; hide it outside the strip. */
  place(e, a, yaw) {
    const x = 0.5 + angleDiff(yaw, a) / SPAN;
    if (x < -0.02 || x > 1.02) { if (e.style.display !== 'none') e.style.display = 'none'; return; }
    if (e.style.display === 'none') e.style.display = '';
    e.style.left = (x * 100).toFixed(2) + '%';
    e.style.opacity = Math.max(0, Math.min(1, (0.5 - Math.abs(x - 0.5)) * 7)).toFixed(2);
  }

  pin(key, kind, icon) {
    let p = this.pins.get(key);
    if (!p) {
      const dist = h('small');
      p = { e: h('div.pin.' + kind, uiImg(icon, kind === 'main' ? 24 : kind === 'side' ? 20 : kind === 'lp' ? 20 : 18), dist), dist, seen: 0 };
      this.el.appendChild(p.e);
      this.pins.set(key, p);
    }
    p.seen = this.t;
    return p;
  }

  update(game, yaw, show) {
    this.el.classList.toggle('hidden', !show);
    if (!show) return;
    this.t++;
    for (const { e, a } of this.points) this.place(e, a, yaw);
    for (const { e, a } of this.ticks) this.place(e, a, yaw);
    const p = game.player, w = game.world;
    const mark = (key, kind, icon, x, y, label) => {
      const pin = this.pin(key, kind, icon);
      const d = w.distance(p.x, p.y, x, y);
      const a = Math.atan2(y - p.y, w.dx(p.x, x));
      this.place(pin.e, a, yaw);
      const txt = d < 4 ? '' : fmtDist(d);
      if (pin.dist.textContent !== txt) pin.dist.textContent = txt;
      if (pin.e.title !== label) pin.e.title = label;
    };
    const surface = w === game.surface;
    // the Log Pose (or Eternal Pose) target
    const lp = surface && game.logPoseTarget && game.logPoseInfo?.() ? game.logPoseTarget() : null;
    if (lp && Number.isFinite(lp.x)) mark('lp', 'lp', 'log_pose', lp.x, lp.y, 'Log Pose');
    // the quests in this world: the main story's always, and the nearest three
    // others (with the icons the chart and the markers over the world use)
    const qs = [];
    for (const { id, def } of game.quests?.active?.() || []) {
      const m = game.quests.marker(id);
      if (!m || !Number.isFinite(m.x)) continue;
      if (m.zone ? m.zone !== w.id : !surface) continue;
      qs.push({ id, m, main: def.kind === 'main', d: w.distance(p.x, p.y, m.x, m.y) });
    }
    qs.sort((a, b) => b.main - a.main || a.d - b.d);
    for (const q of qs.slice(0, 4)) mark('q:' + q.id, q.main ? 'main' : 'side', q.main ? 'wp_main' : 'wp_side', q.m.x, q.m.y, q.m.label);
    // before you've a road: the people who could set you on one, with its sign
    for (const r of Waypoints.roads(game)) mark(r.id, 'main', r.icon, r.m.x, r.m.y, r.m.label);
    // your ship, while you're ashore
    if (p.mode !== 'sail') {
      const s = game.ships.find((x) => x.owner === 'player' && !x.sunk);
      if (s) mark('ship', 'ship', 'ship', s.x, s.y, s.name || 'Your ship');
    }
    // the other players in a multiplayer voyage: who, and how far (to find each other by)
    const mates = game.net?.avatars;
    if (mates) for (const a of mates) {
      const key = 'mate:' + a.id;
      mark(key, 'mate', 'crew', a.x, a.y, a.name);
      const pin = this.pins.get(key), d = w.distance(p.x, p.y, a.x, a.y);
      const txt = d < 4 ? a.name : `${a.name} · ${fmtDist(d)}`;
      if (pin.dist.textContent !== txt) pin.dist.textContent = txt;
    }
    // forget pins that weren't refreshed this frame
    for (const [k, pin] of this.pins) {
      if (pin.seen === this.t) continue;
      pin.e.remove();
      this.pins.delete(k);
    }
  }
}
