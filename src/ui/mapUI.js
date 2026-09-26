// Full-screen world chart (M). Uses the terrain shader's parchment "map mode".
import { h, clear } from './dom.js';
import { W, H, EQ, RM_X, GL_TOP, GL_BOTTOM } from '../world/constants.js';

const SEA_LABELS = [
  { name: 'EAST BLUE', x: 3070, y: 390 },
  { name: 'NORTH BLUE', x: 1020, y: 390 },
  { name: 'WEST BLUE', x: 1020, y: 1660 },
  { name: 'SOUTH BLUE', x: 3070, y: 1660 },
  { name: 'PARADISE', x: 3070, y: EQ + 150 },
  { name: 'NEW WORLD', x: 1020, y: EQ + 150 },
  { name: 'GRAND LINE', x: 2560, y: GL_TOP + 28 },
  { name: 'GRAND LINE', x: 1530, y: GL_TOP + 28 },
  { name: 'CALM BELT', x: 2900, y: GL_TOP - 36 },
  { name: 'CALM BELT', x: 2900, y: GL_BOTTOM + 36 },
  { name: 'RED LINE', x: RM_X, y: 300, vertical: true },
  { name: 'RED LINE', x: 12, y: 300, vertical: true },
];

export function installMap(game) {
  const ui = game.ui;
  const layer = h('div.worldmap-labels.hidden');
  const title = h('div.wm-title', 'Chart of the Blue Planet');
  const help = h('div.wm-help', 'Drag to pan · wheel to zoom · M or Esc to close');
  const wrap = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'auto', cursor: 'grab' } }, layer, title, help);
  wrap.classList.add('hidden');
  ui.root.appendChild(wrap);
  const cam = { x: 0, y: 0, zoom: 0.3 };
  let drag = null;
  wrap.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; wrap.style.cursor = 'grabbing'; });
  window.addEventListener('mouseup', () => { drag = null; wrap.style.cursor = 'grab'; });
  window.addEventListener('mousemove', (e) => {
    if (!drag || !ui.mapOpen) return;
    cam.x = drag.cx - (e.clientX - drag.x) / cam.zoom;
    cam.y = Math.max(0, Math.min(H, drag.cy - (e.clientY - drag.y) / cam.zoom));
  });
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 0.85 : 1.18;
    const r = game.renderer;
    const wx = cam.x + (e.clientX - r.cw / 2) / cam.zoom, wy = cam.y + (e.clientY - r.ch / 2) / cam.zoom;
    cam.zoom = Math.max(0.18, Math.min(6, cam.zoom * f));
    cam.x = wx - (e.clientX - r.cw / 2) / cam.zoom;
    cam.y = wy - (e.clientY - r.ch / 2) / cam.zoom;
  }, { passive: false });

  game.openMap = () => {
    if (ui.mapOpen) return;
    ui.mapOpen = true;
    game.paused = true;
    const p = game.player;
    const r = game.renderer;
    if (game.world === game.surface) {
      cam.zoom = Math.max(0.18, Math.min(r.cw / W * 1.02, 0.5));
      cam.x = p.x;
      cam.y = Math.max(H * 0.3, Math.min(H * 0.7, p.y));
    } else {
      const zw = game.world;
      cam.zoom = Math.min(r.cw / zw.width, r.ch / zw.height) * 0.92;
      cam.x = zw.width / 2; cam.y = zw.height / 2;
    }
    wrap.classList.remove('hidden');
    layer.classList.remove('hidden');
    game.audio?.sfx('page');
  };
  ui.closeMap = game.closeMap = () => {
    ui.mapOpen = false;
    wrap.classList.add('hidden');
    layer.classList.add('hidden');
    if (!ui.stack.length && !ui.dialogueEl) game.paused = false;
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
    drawLabels(game, r, cam, layer);
    Object.assign(r.cam, saved);
  };
}

function drawLabels(game, r, cam, layer) {
  clear(layer);
  const w = game.world;
  const zone = w !== game.surface;
  const c = game.state.char;
  const toS = (x, y) => {
    let dx = x - cam.x;
    if (!zone) dx -= W * Math.round(dx / W);
    return [dx * cam.zoom + r.cw / 2, (y - cam.y) * cam.zoom + r.ch / 2];
  };
  const add = (cls, text, x, y, extra = {}) => {
    const [sx, sy] = toS(x, y);
    if (sx < -200 || sy < -50 || sx > r.cw + 200 || sy > r.ch + 50) return;
    layer.appendChild(h('div.wm-label' + cls, { style: { left: sx + 'px', top: sy + 'px', ...extra } }, text));
  };
  if (zone) add('.sea', w.name, w.width / 2, 14 / cam.zoom, { fontSize: '26px' });
  if (!zone) for (const s of SEA_LABELS) add('.sea', s.name, s.x, s.y, s.vertical ? { writingMode: 'vertical-rl', fontSize: Math.max(16, 26 * cam.zoom / 0.3) + 'px' } : { fontSize: Math.max(14, 30 * cam.zoom / 0.3) + 'px' });
  const discovered = new Set(c.discovered || []);
  for (const isl of w.islands) {
    if (!isl.name) continue;
    if (isl.def?.hidden && !c.flags.laughTaleRevealed) continue;
    const known = zone || discovered.has(isl.id) || w.isExplored(isl.x, isl.y);
    if (!known) continue;
    add('', isl.name, isl.x, isl.y + isl.radius * 0.2 + 6 / cam.zoom, { fontSize: Math.max(11, Math.min(20, 14 * Math.sqrt(cam.zoom / 0.3))) + 'px' });
  }
  if (!zone) {
    add('', '⛰ Reverse Mountain', RM_X, EQ - 40, { fontSize: '14px' });
    if (discovered.has('mary_geoise') || w.isExplored(0, EQ)) add('', '🏛 Mary Geoise', 4, EQ - 70, { fontSize: '13px' });
  }
  // quests
  for (const { id } of game.quests.active()) {
    const m = game.quests.marker(id);
    if (m && (!zone || m.zone === w.id)) add('.quest', '❗ ' + m.label, m.x, m.y - 12 / cam.zoom);
  }
  // log pose target
  const lp = game.logPoseTarget?.();
  if (lp && !zone) add('.quest', '🧭', lp.x, lp.y);
  // ships
  for (const s of game.ships) if (s.owner === 'player' && !s.sunk) add('', '⛵', s.x, s.y, { fontSize: '16px' });
  // me
  const p = game.player;
  add('.me', '✖ You', p.x, p.y);
}
