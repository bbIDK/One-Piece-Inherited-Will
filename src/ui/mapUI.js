// Full-screen world chart (M). The planet is the terrain shader's parchment
// "map mode"; zoomed in, the islands you know are charted in detail over it
// (chartDetail.js), with their towns, harbours and the places you'd look for
// named; you're an arrow the way you face, with a scale bar and a compass
// rose to read it by.
import { uiImg } from './icon.js';
import { h, clear } from './dom.js';
import { W, H, EQ, RM_X, GL_TOP, GL_BOTTOM, chart } from '../world/constants.js';
import { ChartDetail } from './chartDetail.js';

// what a town's buildings are marked with on the chart, close up (and their names: what they are)
// the places in a town the chart marks, by the building's role: [icon, name] (the minimap marks them too)
export const POI = {
  inn: ['inn', 'Inn'], tavern: ['bar', 'Tavern'], bar: ['bar', 'Bar'], restaurant: ['food', 'Restaurant'], cafe: ['food', 'Cafe'],
  shop: ['shop', 'Shop'], market: ['shop', 'Market'], weapons: ['sword', 'Weapons'], doctor: ['doctor', 'Doctor'],
  shipwright: ['shipwright', 'Shipwright'], dojo: ['trainer', 'Dojo'], trainer: ['trainer', 'Trainer'],
  marine_base: ['marine', 'Marine base'], bounty: ['bounty', 'Bounty office'], library: ['library', 'Library'],
};
// round lengths for the scale bar (m)
const SCALES = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const SEA_LABELS = [
  { name: 'EAST BLUE', x: chart(3070), y: chart(390) },
  { name: 'NORTH BLUE', x: chart(1020), y: chart(390) },
  { name: 'WEST BLUE', x: chart(1020), y: chart(1660) },
  { name: 'SOUTH BLUE', x: chart(3070), y: chart(1660) },
  { name: 'PARADISE', x: chart(3070), y: EQ + chart(150) },
  { name: 'NEW WORLD', x: chart(1020), y: EQ + chart(150) },
  { name: 'GRAND LINE', x: chart(2560), y: GL_TOP + chart(28) },
  { name: 'GRAND LINE', x: chart(1530), y: GL_TOP + chart(28) },
  { name: 'CALM BELT', x: chart(2900), y: GL_TOP - chart(36) },
  { name: 'CALM BELT', x: chart(2900), y: GL_BOTTOM + chart(36) },
  { name: 'RED LINE', x: RM_X, y: chart(300), vertical: true },
  { name: 'RED LINE', x: chart(12), y: chart(300), vertical: true },
];

export function installMap(game) {
  const ui = game.ui;
  const layer = h('div.worldmap-labels.hidden');
  const title = h('div.wm-title', 'Chart of the Blue Planet');
  const help = h('div.wm-help', 'Drag to pan · wheel to zoom · M or Esc to close');
  const close = h('button.wm-close', { title: 'Close the chart (M)', on: { pointerdown: (e) => e.stopPropagation(), click: () => game.closeMap() } }, uiImg('close', 22));
  const scaleBar = h('div.wm-scale', h('i'), h('span'));
  const rose = h('div.wm-rose');
  rose.innerHTML = ROSE_SVG;
  const wrap = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'auto', cursor: 'grab', touchAction: 'none' } }, layer, scaleBar, rose, title, help, close);
  const detail = game.chartDetail = new ChartDetail();
  wrap.classList.add('hidden');
  ui.root.appendChild(wrap);
  const cam = { x: 0, y: 0, zoom: 0.3 };
  // (the chart is W tiles across: all of it fits the screen at the least zoom;
  // at the most, a chart pixel is a few screen pixels)
  const MIN_ZOOM = () => Math.min(0.18, (game.renderer.cw || 1280) / W * 0.9);
  const MAX_ZOOM = 3.2; // (a town's streets fill the screen)
  // drag (mouse or one finger) pans; the wheel or a two-finger pinch zooms
  let drag = null, pinch = null;
  const ptrs = new Map();
  const zoomAt = (sx, sy, f) => {
    const r = game.renderer;
    const wx = cam.x + (sx - r.cw / 2) / cam.zoom, wy = cam.y + (sy - r.ch / 2) / cam.zoom;
    cam.zoom = Math.max(game.world === game.surface ? MIN_ZOOM() : 0.18, Math.min(game.world === game.surface ? MAX_ZOOM : 6, cam.zoom * f));
    cam.x = wx - (sx - r.cw / 2) / cam.zoom;
    cam.y = Math.max(0, Math.min(H, wy - (sy - r.ch / 2) / cam.zoom));
  };
  const startDrag = (x, y) => { drag = { x, y, cx: cam.x, cy: cam.y }; wrap.style.cursor = 'grabbing'; };
  let press = null;
  wrap.addEventListener('pointerdown', (e) => {
    press = ptrs.size ? null : { x: e.clientX, y: e.clientY };
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { wrap.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    if (ptrs.size === 1) startDrag(e.clientX, e.clientY);
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)) };
      drag = null;
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !ui.mapOpen) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
      pinch.d = d;
    } else if (drag) {
      cam.x = drag.cx - (e.clientX - drag.x) / cam.zoom;
      cam.y = Math.max(0, Math.min(H, drag.cy - (e.clientY - drag.y) / cam.zoom));
    }
  });
  const up = (e) => {
    // creative mode: a click (not a drag) on the chart takes you there
    if (press && e.type === 'pointerup' && game.creative?.on && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 6 && game.world === game.surface) {
      const r = game.renderer;
      const wx = cam.x + (e.clientX - r.cw / 2) / cam.zoom, wy = cam.y + (e.clientY - r.ch / 2) / cam.zoom;
      press = null;
      ptrs.clear(); drag = null; pinch = null;
      game.closeMap();
      game.creative.teleport(((wx % W) + W) % W, Math.max(2, Math.min(H - 2, wy)));
      return;
    }
    press = null;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) { drag = null; wrap.style.cursor = 'grab'; } else if (ptrs.size === 1 && !drag) { const [a] = [...ptrs.values()]; startDrag(a.x, a.y); }
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', up);
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.85 : 1.18);
  }, { passive: false });

  game.openMap = () => {
    if (ui.mapOpen) return;
    help.textContent = game.creative?.on ? 'Click anywhere to travel there · drag to pan · wheel to zoom · M or Esc to close' : 'Drag to pan · wheel to zoom · M or Esc to close';
    // (the world goes on while you read the chart: the ship holds her course — see pause.js)
    ui.mapOpen = true;
    const p = game.player;
    const r = game.renderer;
    const isl = game.currentIsland;
    if (isl?.landBox && (game.world !== game.surface || p.mode !== 'sail')) {
      // (ashore: the island you're on, all of it, in detail)
      const B = isl.landBox;
      cam.zoom = Math.max(0.5, Math.min(2.2, Math.min(r.cw / (B.x1 - B.x0 + 60), r.ch / (B.y1 - B.y0 + 60)) * 0.9));
      cam.x = p.x; cam.y = p.y;
    } else if (game.world === game.surface) {
      // (about a quarter of the world across: the sea you're in and its neighbours)
      cam.zoom = Math.max(MIN_ZOOM(), Math.min(r.cw / (W * 0.28), 0.5));
      cam.x = p.x;
      cam.y = Math.max(H * 0.3, Math.min(H * 0.7, p.y));
    } else {
      const zw = game.world;
      cam.zoom = Math.min(r.cw / zw.width, r.ch / zw.height) * 0.92;
      cam.x = zw.width / 2; cam.y = zw.height / 2;
    }
    help.textContent = game.input.touch?.on ? 'Drag to pan · pinch to zoom · tap the cross to close' : 'Drag to pan · wheel to zoom · M or Esc to close';
    wrap.classList.remove('hidden');
    layer.classList.remove('hidden');
    ui.root.classList.add('map-open');
    // the chart gets the whole screen
    ui.hud.classList.add('hidden');
    ui.el.side.classList.add('hidden');
    game.audio?.sfx('page');
  };
  ui.closeMap = game.closeMap = () => {
    ui.mapOpen = false;
    wrap.classList.add('hidden');
    layer.classList.add('hidden');
    ui.root.classList.remove('map-open');
    ui.hud.classList.toggle('hidden', !ui.hudVisible);
    ui.el.side.classList.toggle('hidden', !ui.hudVisible);
    // (the click that closed it isn't a broadside at the sea)
    game.input?.consumeMouse?.(0);
  };
  ui.keyHandlers.push({ key: 'M', fn: () => (ui.mapOpen ? game.closeMap() : game.openMap()) });

  // map rendering hook: called from main loop when the map is open
  game.renderMap = () => {
    const r = game.renderer;
    const saved = { ...r.cam };
    Object.assign(r.cam, { x: cam.x, y: cam.y, zoom: cam.zoom, shakeX: 0, shakeY: 0 });
    const env = game.env;
    const prevMode = env.mapMode;
    env.mapMode = true;
    r.renderTerrain(game.world, env);
    env.mapMode = prevMode;
    const g = r.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, r.canvas.width, r.canvas.height);
    const w = game.world, zone = w !== game.surface, c = game.state.char;
    const discovered = new Set(c.discovered || []);
    const p = game.player;
    const toS = (x, y) => {
      let dx = x - cam.x;
      if (!zone) dx -= W * Math.round(dx / W);
      return [dx * cam.zoom + r.cw / 2, (y - cam.y) * cam.zoom + r.ch / 2];
    };
    // (the islands you've set foot on or sailed close by — all of them down in a zone, or in creative mode)
    detail.draw(g, {
      world: w, dpr: r.dpr, zoom: cam.zoom, cw: r.cw, ch: r.ch, toS, px: p.x, py: p.y,
      known: (isl) => zone || game.creative?.on || discovered.has(isl.id) || isl === game.currentIsland || seenIsland(w, isl),
    });
    drawLabels(game, r, cam, layer);
    drawScale(scaleBar, cam.zoom);
    Object.assign(r.cam, saved);
  };
}

function drawLabels(game, r, cam, layer) {
  const w = game.world;
  const zone = w !== game.surface;
  const c = game.state.char;
  const z = cam.zoom;
  // (the chart doesn't move while it's open unless you move it: the labels are laid out again only then)
  const key = `${w.id}|${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${z.toFixed(4)}|${r.cw}x${r.ch}|${Math.floor(performance.now() / 600)}`;
  if (layer.dataset.key === key) return;
  layer.dataset.key = key;
  clear(layer);
  const toS = (x, y) => {
    let dx = x - cam.x;
    if (!zone) dx -= W * Math.round(dx / W);
    return [dx * z + r.cw / 2, (y - cam.y) * z + r.ch / 2];
  };
  const placed = [];
  const add = (cls, text, x, y, extra = {}, declutter = false) => {
    const [sx, sy] = toS(x, y);
    if (sx < -200 || sy < -50 || sx > r.cw + 200 || sy > r.ch + 50) return null;
    if (declutter) {
      // skip labels that would overlap one already on the chart
      const fs = parseFloat(extra.fontSize) || 13;
      const len = typeof text === 'string' ? text.length : 8;
      const w2 = len * fs * 0.28, h2 = fs * 0.62;
      if (placed.some((b) => Math.abs(b.x - sx) < b.w + w2 && Math.abs(b.y - sy) < b.h + h2)) return null;
      placed.push({ x: sx, y: sy, w: w2, h: h2 });
    }
    const e = h('div.wm-label' + cls, { style: { left: sx + 'px', top: sy + 'px', ...extra } }, text);
    layer.appendChild(e);
    return e;
  };
  // a marker standing exactly on its spot (an icon), with a name beside it
  // (`room`: only where it doesn't land on another icon — and its name only where that's clear of everything)
  const icons = [];
  const fits = (list, sx, sy, w2, h2) => !list.some((b) => Math.abs(b.x - sx) < b.w + w2 && Math.abs(b.y - sy) < b.h + h2);
  const pin = (cls, icon, size, text, x, y, room = false) => {
    const [sx, sy] = toS(x, y);
    if (sx < -100 || sy < -40 || sx > r.cw + 100 || sy > r.ch + 40) return;
    if (room) {
      if (!fits(icons, sx, sy, size * 0.42, size * 0.42)) return;
      icons.push({ x: sx, y: sy, w: size * 0.42, h: size * 0.42 });
      if (text) {
        const w2 = text.length * 3.3, tx = sx + size * 0.4 + w2;
        if (fits(placed, tx, sy, w2, 7) && fits(icons, tx, sy, w2, 7)) placed.push({ x: tx, y: sy, w: w2, h: 7 }); else text = null;
      }
    }
    layer.appendChild(h('div.wm-pin' + cls, { style: { left: sx + 'px', top: sy + 'px' } }, uiImg(icon, size), text ? h('span', text) : null));
  };
  if (zone) add('.sea', w.name, w.width / 2, 14 / z, { fontSize: '26px' });
  // (the seas' names: big from afar, fading as you close in on an island)
  const seaA = (1 - Math.max(0, Math.min(1, (z - 0.45) / 0.5))).toFixed(2);
  if (!zone && seaA > 0) for (const s of SEA_LABELS) add('.sea', s.name, s.x, s.y, s.vertical ? { writingMode: 'vertical-rl', fontSize: Math.max(16, 26 * z / 0.3) + 'px', opacity: seaA } : { fontSize: Math.min(44, Math.max(14, 30 * z / 0.3)) + 'px', opacity: seaA });
  // quests (the main story's objective gold, on top; side quests sky blue — as on the compass and over the world)
  const act = game.quests.active().sort((a, b) => (a.def.kind === 'main') - (b.def.kind === 'main'));
  for (const { id, def } of act) {
    const m = game.quests.marker(id);
    const main = def.kind === 'main';
    if (!m || (m.zone ? m.zone !== w.id : zone)) continue;
    pin(main ? '.quest.main' : '.quest', main ? 'wp_main' : 'wp_side', main ? 30 : 24, m.label, m.x, m.y);
    const [qx, qy] = toS(m.x, m.y);
    placed.push({ x: qx + m.label.length * 3.6, y: qy, w: 14 + m.label.length * 3.8, h: 12 });
  }
  const discovered = new Set(c.discovered || []);
  const known = (isl) => zone || game.creative?.on || discovered.has(isl.id) || isl === game.currentIsland;
  const close = z >= 0.75, closer = z >= 1.15; // (how much of the islands you know is named: towns, then the places in them)
  const byImportance = w.islands.filter((i) => i.name).sort((a, b) => (b.def?.w || 0) * (b.def?.h || 0) - (a.def?.w || 0) * (a.def?.h || 0));
  for (const isl of byImportance) {
    if (isl.def?.hidden && !c.flags.laughTaleRevealed) continue;
    if (!(known(isl) || w.isExplored(isl.x, isl.y))) continue;
    // (charted close up, the island's name goes under it, out of the way of its town; from afar, on it)
    const B = isl.landBox;
    const under = close && B && known(isl);
    add(under ? '.isle' : '', isl.name, isl.x, under ? B.y1 + 8 / z : isl.y + isl.radius * 0.2 + 6 / z, { fontSize: (under ? Math.min(30, 16 + z * 5) : Math.max(11, Math.min(20, 14 * Math.sqrt(z / 0.3)))) + 'px' }, true);
  }
  if (!zone) {
    add('', 'Reverse Mountain', RM_X, EQ - chart(40), { fontSize: '14px' });
    if (discovered.has('mary_geoise') || w.isExplored(0, EQ)) add('', 'Mary Geoise', 4, EQ - chart(70), { fontSize: '13px' });
    // the way down to Fish-Man Island, under the Red Line: where coated ships dive (once you know Sabaody)
    for (const isl of w.islands) {
      const sp = isl.spots?.fishman_dive;
      if (sp && (known(isl) || w.isExplored(sp.x, sp.y))) add('.dive', 'Fish-Man Island · dive here, 10,000 m down', sp.x, sp.y, { fontSize: '13px' });
    }
  }
  // quest givers: who can start your story, and side quests waiting on the islands you know
  if (!zone) {
    for (const p of game.storyPins?.() || []) {
      add(p.main ? '.giver.main' : '.giver', [h('b.pin', { style: { background: p.color } }, '!'), ' ' + p.label], p.x, p.y, { fontSize: p.main ? '15px' : '13px' }, true);
    }
  }
  // where the needle of the pose in your Log Pose slot points (the island, by name if it goes by one)
  const lp = game.logPoseTarget?.();
  if (lp && !zone) pin('.lp', 'log_pose', 26, game.logPoseInfo?.()?.label === '???' ? 'Log Pose' : `Log Pose: ${lp.name}`, lp.x, lp.y);
  // your ships
  for (const s of game.ships) if (s.owner === 'player' && !s.sunk) pin('.ship', 'ship', 24, z >= 1 ? s.name || 'Your ship' : null, s.x, s.y);
  // close up, the islands you know are charted in detail: their towns, harbours and the places in them
  if (close) {
    for (const isl of w.islands) {
      if (!isl.landBox || !known(isl)) continue;
      const B = isl.landBox;
      const [ax, ay] = toS(B.x0, B.y0), [bx, by] = toS(B.x1, B.y1);
      if (bx < -50 || by < -50 || ax > r.cw + 50 || ay > r.ch + 50) continue;
      for (const t of isl.towns || []) {
        if (closer) {
          for (const b of t.buildings || []) {
            const P = POI[b.role];
            if (!P || !b.door) continue;
            pin('.poi', P[0], 20, z >= 2.6 ? b.name || P[1] : null, b.door.x, b.door.y, true);
          }
        }
        // (a district of several parts — a terraced city's levels — is named once)
        if (t.name && t.plaza && !t.def?.noLabel) add('.town', t.name, t.plaza.x, t.plaza.y, { fontSize: Math.min(22, 13 + z * 3) + 'px' }, true);
      }
      for (const d of isl.docks || []) if (d.end) pin('.poi.dock', 'anchor', 18, null, d.end.x, d.end.y);
      // (the places a chart would name — not the notices, posters and curios you can look at)
      if (closer) for (const l of isl.landmarks || []) if (l.name && l.name.length <= 30 && !l.lore && !l.use && l.kind !== 'mountain' && l.kind !== 'building') add('.landmark', l.name, l.x, l.y + 1.5, { fontSize: '12px' }, true);
    }
  }
  // you: an arrow the way you're facing
  const p = game.player;
  const [mx, my] = toS(p.x, p.y);
  const yaw = game.view3d?.rig?.yaw ?? p.facing ?? 0;
  const me = h('div.wm-me', { style: { left: mx + 'px', top: my + 'px' } }, h('i'));
  me.firstChild.style.transform = `rotate(${(yaw + Math.PI / 2).toFixed(3)}rad)`;
  layer.appendChild(me);
}

/** Has an island been seen (its middle or the middle of a side of it explored, sailing by)? */
export function seenIsland(w, isl) {
  if (w.isExplored(isl.x, isl.y)) return true;
  const B = isl.landBox;
  if (!B) return false;
  const mx = (B.x0 + B.x1) / 2, my = (B.y0 + B.y1) / 2;
  return w.isExplored(B.x0, my) || w.isExplored(B.x1, my) || w.isExplored(mx, B.y0) || w.isExplored(mx, B.y1);
}

/** The scale bar: a round length, as long as it is on the chart. */
function drawScale(el, zoom) {
  const want = 110 / zoom; // m that 110 px stand for
  const m = SCALES.reduce((best, s) => (Math.abs(Math.log(s / want)) < Math.abs(Math.log(best / want)) ? s : best), SCALES[0]);
  el.firstChild.style.width = Math.round(m * zoom) + 'px';
  const txt = m >= 1000 ? m / 1000 + ' km' : m + ' m';
  if (el.lastChild.textContent !== txt) el.lastChild.textContent = txt;
}

// a compass rose for the corner of the chart (north up)
const ROSE_SVG = `<svg viewBox="-60 -60 120 120" width="112" height="112" aria-hidden="true">
  <g fill="none" stroke="#5b4026" stroke-width="1.2" opacity=".85"><circle r="44"/><circle r="40" stroke-width=".6"/><circle r="15" stroke-width=".8"/></g>
  <g stroke="#5b4026" stroke-width=".6" opacity=".7">${Array.from({ length: 32 }, (_, i) => { const a = i * Math.PI / 16, r0 = i % 4 ? 40 : 36; return `<line x1="${(Math.sin(a) * r0).toFixed(1)}" y1="${(-Math.cos(a) * r0).toFixed(1)}" x2="${(Math.sin(a) * 44).toFixed(1)}" y2="${(-Math.cos(a) * 44).toFixed(1)}"/>`; }).join('')}</g>
  <g stroke="#3b2a1a" stroke-width=".8" stroke-linejoin="round">
    <path d="M0 -50 L7 -7 L0 0 Z" fill="#b8402e"/><path d="M0 -50 L-7 -7 L0 0 Z" fill="#e8c9a0"/>
    <path d="M0 50 L7 7 L0 0 Z" fill="#e8c9a0"/><path d="M0 50 L-7 7 L0 0 Z" fill="#5b4026"/>
    <path d="M50 0 L7 7 L0 0 Z" fill="#e8c9a0"/><path d="M50 0 L7 -7 L0 0 Z" fill="#5b4026"/>
    <path d="M-50 0 L-7 -7 L0 0 Z" fill="#e8c9a0"/><path d="M-50 0 L-7 7 L0 0 Z" fill="#5b4026"/>
    <path d="M24 -24 L4 -4 L6 0 Z M24 -24 L0 -6 L4 -4 Z M-24 24 L-4 4 L-6 0 Z M-24 24 L0 6 L-4 4 Z M24 24 L4 4 L0 6 Z M24 24 L6 0 L4 4 Z M-24 -24 L-4 -4 L0 -6 Z M-24 -24 L-6 0 L-4 -4 Z" fill="#c9a77a" opacity=".9"/>
  </g>
  <text y="-52" text-anchor="middle" font-family="'Pirata One', serif" font-size="15" fill="#b8402e">N</text>
</svg>`;
