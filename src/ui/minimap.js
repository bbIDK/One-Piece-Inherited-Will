// The minimap (top right): the same chart as the world map (M), round you.
// The planet's painting in the chart's parchment inks, washed out where you
// haven't been, with the Grand Line's and the Calm Belts' edges and the
// survey grid ruled across it; over that, the islands you know charted
// close up with their buildings (chartDetail.js, shared with the map, so
// each island is charted once); then ships, foes and quest folk. − and +
// zoom it out and in (it remembers how far, on foot and at sea apart).
// Over it, upright however it turns, the chart's own icons (pins): the
// inns, shops, doctors, dojos and the rest of the towns you know, their
// harbours, your quests and the Log Pose's island — those three on the rim,
// pointing the way, when they're farther off than it reaches.
import { ChartDetail } from './chartDetail.js';
import { seenIsland, POI } from './mapUI.js';
import { uiIcon } from '../render/icons.js';
import { GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM } from '../world/constants.js';

const ZOOMS = [0.5, 1, 2, 4, 8, 16, 32]; // m to a pixel of the minimap
const DEFAULT = { foot: 1, sea: 2 }; // (indices into ZOOMS)
const CHUNK = 256; // painting pixels a side of each piece of the planet kept drawn
const KEEP = 48; // pieces kept (~12 MB)
const PER_DRAW = 1; // pieces painted at most each time it's drawn (the rest wait as bare parchment, a frame or two)
const RECHECK = 1.5; // s: how often the pieces round you are looked over for newly explored ground
// (css px of chart drawn past its edge all round: between one drawing and the
// next — a fifth of a second — it slides under you that far, every frame)
const MARGIN = 32;
const PARCH = [240, 224, 186];
const BLANK = [PARCH[0] * 0.98, PARCH[1] * 0.96, PARCH[2] * 0.92];
const INK = [71, 51, 31];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const storeKey = 'op-minimap-zoom';

export class Minimap {
  constructor(canvas, overlay = null) {
    this.canvas = canvas;
    this.overlay = overlay; // (the icons: see pins)
    this.chunks = new Map(); // world id:cx:cy → { canvas, sum, used }
    this.t = 0;
    this.check = 0;
    this.zoom = { ...DEFAULT };
    try { Object.assign(this.zoom, JSON.parse(localStorage.getItem(storeKey) || '{}')); } catch { /* none kept */ }
  }

  /** Zoom out (+1) or in (−1) a step: at sea, or on foot. */
  zoomBy(d, sailing) {
    const k = sailing ? 'sea' : 'foot';
    this.zoom[k] = Math.max(0, Math.min(ZOOMS.length - 1, (this.zoom[k] ?? DEFAULT[k]) + d));
    try { localStorage.setItem(storeKey, JSON.stringify(this.zoom)); } catch { /* not kept */ }
    return ZOOMS[this.zoom[k]];
  }

  /** Metres to a pixel of the minimap, now. */
  scale(sailing) { return ZOOMS[this.zoom[sailing ? 'sea' : 'foot']] ?? ZOOMS[DEFAULT.foot]; }

  /**
   * Draw the chart round you (5 times a second; every frame while there's
   * still charting to do): into a buffer a little bigger than the minimap,
   * which present() slides under you every frame — the chart moves with you
   * smoothly, not in steps.
   */
  draw(game, dt = 0.2) {
    const c = this.canvas, w = game.world, p = game.player;
    if (!w || !p || !w.map) return;
    // (as sharp as the screen: drawn at the screen's pixel density)
    const view = c.clientWidth || 190, dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = view + 2 * MARGIN; // (the buffer's width, css px)
    const size = Math.round(css * dpr);
    const buf = this.buf || (this.buf = document.createElement('canvas'));
    if (buf.width !== size) { buf.width = size; buf.height = size; }
    const g = buf.getContext('2d');
    const sailing = p.mode === 'sail';
    const mpp = this.scale(sailing), z = 1 / mpp; // css pixels to the metre
    const zone = w !== game.surface;
    this.t++;
    this.check -= dt;
    const recheck = this.check <= 0;
    if (recheck) this.check = RECHECK;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = `rgb(${BLANK.map((v) => v | 0)})`;
    g.fillRect(0, 0, size, size);
    // where on the minimap (css pixels) a point of the world is
    const toS = (x, y) => [w.dx(p.x, x) * z + css / 2, (y - p.y) * z + css / 2];
    // 1. the planet's painting, a piece at a time
    const m = w.map, mx = w.width / m.w, my = w.height / m.h; // metres to a painting pixel
    const half = css / 2 / z;
    const cx0 = Math.floor((p.x - half) / mx / CHUNK), cx1 = Math.floor((p.x + half) / mx / CHUNK);
    const cy0 = Math.max(0, Math.floor((p.y - half) / my / CHUNK)), cy1 = Math.min(Math.ceil(m.h / CHUNK) - 1, Math.floor((p.y + half) / my / CHUNK));
    const pcx = Math.floor(w.wx(p.x) / mx / CHUNK), pcy = Math.floor(p.y / my / CHUNK);
    let painted = 0, waiting = false;
    g.imageSmoothingEnabled = true;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cxr = cx0; cxr <= cx1; cxr++) {
        const nx = Math.ceil(m.w / CHUNK);
        let cx = cxr;
        if (w.wrap) cx = ((cxr % nx) + nx) % nx; else if (cxr < 0 || cxr >= nx) continue;
        const key = `${w.id}:${cx}:${cy}`;
        let ch = this.chunks.get(key);
        // (the ground round you is looked over now and then for what you've newly explored)
        const near = Math.abs(cx - pcx) <= 1 && Math.abs(cy - pcy) <= 1;
        if (ch && near && recheck && painted < PER_DRAW && fogSum(w, m, cx, cy) !== ch.sum) { paint(w, m, cx, cy, ch, game.env?.revealAll); painted++; }
        if (!ch) {
          if (painted >= PER_DRAW) { waiting = true; continue; }
          ch = { canvas: document.createElement('canvas'), sum: -1, used: 0 };
          paint(w, m, cx, cy, ch, game.env?.revealAll);
          painted++;
          this.chunks.set(key, ch);
        }
        ch.used = this.t;
        // (toS reckons round the planet the short way: a piece across the date line lands beside you)
        const [sx, sy] = toS(cx * CHUNK * mx, cy * CHUNK * my);
        g.drawImage(ch.canvas, sx * dpr, sy * dpr, ch.canvas.width * mx * z * dpr, ch.canvas.height * my * z * dpr);
      }
    }
    this.trim();
    // 2. the islands you know, charted close up (their buildings too, near enough)
    const detail = game.chartDetail || (game.chartDetail = new ChartDetail());
    const discovered = new Set(game.state?.char?.discovered || []);
    // (a little at a time, every frame while there's charting to do: see ui.js)
    const charting = detail.draw(g, {
      // (solid until the painting alone can show an island: a few metres to the pixel)
      world: w, dpr, zoom: z, cw: css, ch: css, toS, px: p.x, py: p.y, alpha: smooth(0.07, 0.2, z), budget: 3,
      known: (isl) => zone || game.creative?.on || discovered.has(isl.id) || isl === game.currentIsland || seenIsland(w, isl),
    });
    // (still something to chart or paint in view: draw again next frame)
    this.pending = charting > 0 || waiting;
    // the icons over it (drawn every frame by pins, from where you were now)
    this.at = { x: p.x, y: p.y, z, css: view, w };
    this.pinList = gatherPins(game, z, css, (isl) => zone || game.creative?.on || discovered.has(isl.id) || isl === game.currentIsland);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 3. the chart's rules: the survey grid, and the edges of the Grand Line and the Calm Belts
    rules(g, w, p, z, css, zone);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * Every frame: the chart as last drawn, slid along by how far you've come
   * since, in its round frame (and, out of the 3D view, your arrow on it).
   */
  present(game) {
    const c = this.canvas, p = game.player, w = game.world;
    // (come farther since than the chart reaches past the edge — a hitch, a
    // fast ship, a fast travel: it's drawn again now, not left showing bare)
    const was = this.at;
    if (was && was.w === w && p && Math.max(Math.abs(w.dx(was.x, p.x)), Math.abs(p.y - was.y)) * was.z > MARGIN - 2) this.draw(game, 0);
    const at = this.at, buf = this.buf;
    if (!buf || !at || at.w !== w || !p) return;
    const css = c.clientWidth || 190, dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(css * dpr);
    if (c.width !== size) { c.width = size; c.height = size; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgb(${BLANK.map((v) => v | 0)})`;
    g.fillRect(0, 0, size, size);
    const k = css / at.css, bs = buf.width * k; // (the minimap resized since: the chart with it)
    const ox = -w.dx(at.x, p.x) * at.z * k * dpr, oy = -(p.y - at.y) * at.z * k * dpr;
    g.drawImage(buf, (size - bs) / 2 + ox, (size - bs) / 2 + oy, bs, bs);
    // ships, foes and quest folk, where they are now
    const z = at.z * k, r = css / 2 - 2;
    g.setTransform(dpr, 0, 0, dpr, css / 2 * dpr, css / 2 * dpr);
    for (const s of game.ships) {
      if (s.sunk) continue;
      const dx = w.dx(p.x, s.x) * z, dy = (s.y - p.y) * z;
      if (Math.hypot(dx, dy) > r) continue;
      g.fillStyle = s.owner === 'player' ? '#f9d71c' : s.faction === 'marine' ? '#3d8fd6' : '#d6453c';
      g.strokeStyle = 'rgba(58,40,24,.85)'; g.lineWidth = 1;
      // (the big ships show their length)
      g.beginPath(); g.ellipse(dx, dy, Math.max(3, s.def.length * z / 2), Math.max(2.2, s.def.beam * z / 2), s.heading || 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    for (const a of game.actors) {
      if (a === p || a.state !== 'idle' || a.hidden) continue;
      // (with Observation Haki you sense everyone about)
      const hostileNow = a.controller?.target === p || (p.observation && a.faction !== 'civilian');
      if (!hostileNow && !a.questMarker) continue;
      const dx = w.dx(p.x, a.x) * z, dy = (a.y - p.y) * z;
      if (Math.hypot(dx, dy) > r) continue;
      g.fillStyle = a.questMarker ? (a.questMarker[0] === 'M' ? '#ff9100' : '#ffd54f') : '#e53935';
      g.strokeStyle = 'rgba(40,26,14,.9)'; g.lineWidth = 1;
      g.beginPath(); g.arc(dx, dy, a.questMarker ? 3.2 : 2.4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // the round frame
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    // you (the 3D view keeps a fixed arrow over the turning map instead)
    if (game.view3d?.active) return;
    const sailing = p.mode === 'sail';
    g.setTransform(dpr, 0, 0, dpr, css / 2 * dpr, css / 2 * dpr);
    g.rotate(sailing && p.ship ? p.ship.heading : p.facing);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /**
   * The chart's icons over the minimap, every frame: where draw last put
   * them, turned with it (in the 3D view it turns so that where you look is
   * up: `up` is the camera's yaw, null when it doesn't) but each standing
   * upright; the far quests and the Log Pose's island on the rim.
   */
  pins(game, up) {
    const o = this.overlay, mm = this.canvas, at = this.at;
    if (!o) return;
    const css = mm.clientWidth || 190, dpr = Math.min(2, window.devicePixelRatio || 1);
    // (laid exactly over the minimap's face, inside its rim)
    const left = mm.offsetLeft + mm.clientLeft, top = mm.offsetTop + mm.clientTop;
    const key = `${css}:${left}:${top}:${dpr}`;
    if (this.ovKey !== key) {
      this.ovKey = key;
      Object.assign(o.style, { left: left + 'px', top: top + 'px', width: css + 'px', height: css + 'px' });
      o.width = o.height = Math.round(css * dpr);
    }
    const g = o.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, o.width, o.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!at || at.w !== game.world || !this.pinList?.length) { this.flashOver(g, css); return; }
    const th = up == null ? 0 : -Math.PI / 2 - up, cs = Math.cos(th), sn = Math.sin(th);
    const r = css / 2, k = css / at.css, w = at.w, p = game.player;
    // (from where you are now, not where it was last drawn from: they slide with the chart)
    const mx = -w.dx(at.x, p.x) * at.z, my = -(p.y - at.y) * at.z;
    this.flashOver(g, css);
    for (const pin of this.pinList) {
      // (the places in town where gatherPins spread them, the rest where they are)
      const vx = (pin.rim ? w.dx(p.x, pin.x) * at.z : pin.sx + mx) * k, vy = (pin.rim ? (pin.y - p.y) * at.z : pin.sy + my) * k;
      let sx = vx * cs - vy * sn, sy = vx * sn + vy * cs;
      const d = Math.hypot(sx, sy), R = r - (pin.rim ? 11 : 9);
      let edge = false;
      if (d > R) {
        if (!pin.rim) continue;
        sx *= R / d; sy *= R / d; edge = true;
      }
      drawPin(g, r + sx, r + sy, pin, edge ? Math.atan2(sy, sx) : null);
    }
  }

  /** Just after − or +: how far across the minimap reaches now (over it, upright). */
  flashOver(g, css) {
    if (!this.flash || performance.now() > this.flash.until) return;
    g.font = '600 11px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(this.flash.text).width + 12;
    g.fillStyle = 'rgba(40,28,16,.78)';
    g.fillRect(css / 2 - tw / 2, css - 30, tw, 16);
    g.fillStyle = '#f6ead0';
    g.fillText(this.flash.text, css / 2, css - 22);
  }

  /** Keep within the memory allowed: the pieces longest out of view go first. */
  trim() {
    if (this.chunks.size <= KEEP) return;
    const old = [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length - KEEP; i++) this.chunks.delete(old[i][0]);
  }
}

/** How much of a piece of the planet you've explored (to tell when it wants painting again). */
function fogSum(w, m, cx, cy) {
  if (!w.fog) return 0;
  const mx = w.width / m.w, my = w.height / m.h, F = w.fogCell || 8;
  const x0 = cx * CHUNK * mx, y0 = cy * CHUNK * my, x1 = Math.min(w.width, x0 + CHUNK * mx), y1 = Math.min(w.height, y0 + CHUNK * my);
  let s = 0;
  for (let fy = Math.floor(y0 / F); fy < Math.ceil(y1 / F); fy++) {
    const row = fy * w.fogW;
    for (let fx = Math.floor(x0 / F); fx < Math.ceil(x1 / F); fx++) s += w.fog[row + fx];
  }
  return s;
}

/**
 * Paint a piece of the planet as the world chart shows it (the terrain
 * shader's map mode, terrainShader.js mapColor): the painting a little toward
 * the parchment, the coasts inked, what you haven't explored left blank.
 */
function paint(w, m, cx, cy, ch, revealAll) {
  const i0 = cx * CHUNK, j0 = cy * CHUNK;
  const cw = Math.min(CHUNK, m.w - i0), chh = Math.min(CHUNK, m.h - j0);
  const c = ch.canvas;
  if (c.width !== cw || c.height !== chh) { c.width = cw; c.height = chh; }
  const g = c.getContext('2d');
  const img = g.createImageData(cw, chh), d = img.data;
  const mx = w.width / m.w, my = w.height / m.h, F = w.fogCell || 8;
  const seen = revealAll ? 1 : 0.15;
  for (let j = 0; j < chh; j++) {
    const mj = j0 + j, fy = Math.floor((mj + 0.5) * my / F);
    for (let i = 0; i < cw; i++) {
      const mi = i0 + i, o = (mj * m.w + mi) * 4, q = (j * cw + i) * 4;
      // the parchment, mottled
      const n = 0.92 + 0.08 * hash(mi >> 2, mj >> 2);
      let r = PARCH[0] * n, gg = PARCH[1] * n, b = PARCH[2] * n;
      r += (m.data[o] - r) * 0.62; gg += (m.data[o + 1] - gg) * 0.62; b += (m.data[o + 2] - b) * 0.62;
      // the coast inked (where the signed distance to it is about nil)
      if (m.dist) {
        const sd = (m.dist[mj * m.w + mi] - 128) * 0.25;
        const ink = (1 - smooth(0, mx * 0.9 + 0.25, Math.abs(sd))) * 0.85;
        r += (INK[0] - r) * ink; gg += (INK[1] - gg) * ink; b += (INK[2] - b) * ink;
      }
      // what you haven't explored, left blank
      const fog = w.fog ? w.fog[fy * w.fogW + Math.floor((mi + 0.5) * mx / F)] / 255 : 1;
      const k = smooth(0.05, 0.6, fog) * 0.85 + seen;
      const kk = Math.min(1, k);
      d[q] = BLANK[0] + (r - BLANK[0]) * kk; d[q + 1] = BLANK[1] + (gg - BLANK[1]) * kk; d[q + 2] = BLANK[2] + (b - BLANK[2]) * kk; d[q + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  ch.sum = fogSum(w, m, cx, cy);
}

/** The survey grid every 256 m, and the Grand Line's and the Calm Belts' edges like Nami's chart. */
function rules(g, w, p, z, css, zone) {
  const half = css / 2 / z;
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(115,90,56,.14)';
  g.beginPath();
  for (let x = Math.ceil((p.x - half) / 256) * 256; x <= p.x + half; x += 256) { const sx = (x - p.x) * z + css / 2; g.moveTo(sx, 0); g.lineTo(sx, css); }
  for (let y = Math.ceil((p.y - half) / 256) * 256; y <= p.y + half; y += 256) { const sy = (y - p.y) * z + css / 2; g.moveTo(0, sy); g.lineTo(css, sy); }
  g.stroke();
  if (zone) return;
  const line = (y, col, wd) => {
    const sy = (y - p.y) * z + css / 2;
    if (sy < -2 || sy > css + 2) return;
    g.strokeStyle = col; g.lineWidth = wd;
    g.beginPath(); g.moveTo(0, sy); g.lineTo(css, sy); g.stroke();
  };
  line(GL_TOP, 'rgba(51,115,89,.85)', 1.4); line(GL_BOTTOM, 'rgba(51,115,89,.85)', 1.4);
  line(CB_TOP, 'rgba(89,115,128,.5)', 1); line(CB_BOTTOM, 'rgba(89,115,128,.5)', 1);
}

// how each icon is drawn: its size (css px), its disc (fill, ring: none for
// the quests' own markers, which are their own shape) and its pointer's colour on the rim
const PIN_STYLE = {
  poi: { px: 12, disc: 'rgba(246,234,206,.96)', ring: '#5b4026' },
  dock: { px: 12, disc: 'rgba(214,232,240,.96)', ring: '#5b4026' },
  side: { px: 16, arrow: '#a6dcf5' },
  main: { px: 19, arrow: '#ffc940' },
  lp: { px: 14, disc: 'rgba(255,240,236,.97)', ring: '#8e2c1c', arrow: '#ff8a80' },
};

/**
 * The icons the minimap shows, where they are in the world, the ones drawn
 * last on top: the towns' places (close enough in to tell them apart) and
 * the harbours of the islands you know, then your quests and the Log Pose's
 * island (`rim`: on the edge, pointing the way, when they're off it).
 */
function gatherPins(game, z, css, known) {
  const w = game.world, p = game.player, out = [];
  const reach = css / 2 / z + 12; // m from the middle to the edge, and a little beyond
  const near = (x, y) => Math.abs(w.dx(p.x, x)) < reach && Math.abs(y - p.y) < reach;
  if (z >= 0.1) {
    for (const isl of w.islands || []) {
      const rad = isl.radius || 0;
      if (Math.abs(w.dx(p.x, isl.x)) - rad > reach || Math.abs(isl.y - p.y) - rad > reach || !known(isl)) continue;
      // (from too far up the places in a town would be a heap: then only its harbours)
      if (z >= 0.45) {
        for (const t of isl.towns || []) {
          for (const b of t.buildings || []) {
            const P = POI[b.role];
            if (P && b.door && near(b.door.x, b.door.y)) out.push({ x: b.door.x, y: b.door.y, icon: P[0], kind: 'poi' });
          }
        }
      }
      for (const d of isl.docks || []) if (d.end && near(d.end.x, d.end.y)) out.push({ x: d.end.x, y: d.end.y, icon: 'anchor', kind: 'dock' });
    }
  }
  // (a town's inns and shops stand round its square, close together: they're
  // nudged apart until none covers another, and so turn with the chart as one)
  for (const q of out) { q.sx = w.dx(p.x, q.x) * z; q.sy = (q.y - p.y) * z; }
  spread(out, 15);
  // the quests under way: the main story's and those you track wherever they are, any other in sight
  const q = game.quests, tracked = new Set((q?.tracked?.() || []).map((x) => x.id));
  const qs = [];
  for (const { id, def } of q?.active?.() || []) {
    const m = q.marker(id);
    if (!m || !Number.isFinite(m.x) || (m.zone ? m.zone !== w.id : w !== game.surface)) continue;
    const main = def.kind === 'main', rim = main || tracked.has(id);
    if (rim || near(m.x, m.y)) qs.push({ x: m.x, y: m.y, icon: main ? 'wp_main' : 'wp_side', kind: main ? 'main' : 'side', rim, sx: w.dx(p.x, m.x) * z, sy: (m.y - p.y) * z });
  }
  qs.sort((a, b) => (a.kind === 'main') - (b.kind === 'main'));
  out.push(...qs);
  // the island the needle of your Log Pose points to (not when you're on it)
  const lp = w === game.surface && game.logPoseInfo?.() ? game.logPoseTarget?.() : null;
  if (lp && Number.isFinite(lp.x) && lp !== game.currentIsland) out.push({ x: lp.x, y: lp.y, icon: 'log_pose', kind: 'lp', rim: true });
  return out;
}

/** Push apart the icons closer than `D` px (a few rounds, each pair half each way; on the same spot, round a circle). */
function spread(list, D, rounds = 8) {
  for (let it = 0; it < rounds; it++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        let dx = b.sx - a.sx, dy = b.sy - a.sy, d = Math.hypot(dx, dy);
        if (d >= D) continue;
        if (d < 1e-3) { dx = Math.cos(j * 2.4); dy = Math.sin(j * 2.4); d = 1; }
        const k = (D - d) / 2 / d;
        a.sx -= dx * k; a.sy -= dy * k; b.sx += dx * k; b.sy += dy * k;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** One icon at (x, y), upright: on its disc, and with a pointer out at angle `edge` when it's on the rim. */
function drawPin(g, x, y, pin, edge) {
  const st = PIN_STYLE[pin.kind] || PIN_STYLE.poi, px = st.px;
  if (edge !== null && st.arrow) {
    // (a pointer just outside the icon, the way to go)
    const ca = Math.cos(edge), sa = Math.sin(edge), tip = px / 2 + 7, base = px / 2 + 2;
    g.beginPath();
    g.moveTo(x + ca * tip, y + sa * tip);
    g.lineTo(x + ca * base - sa * 4, y + sa * base + ca * 4);
    g.lineTo(x + ca * base + sa * 4, y + sa * base - ca * 4);
    g.closePath();
    g.fillStyle = st.arrow; g.strokeStyle = 'rgba(30,20,10,.9)'; g.lineWidth = 1;
    g.fill(); g.stroke();
  }
  if (st.disc) {
    g.beginPath(); g.arc(x, y, px / 2 + 2.2, 0, Math.PI * 2);
    g.fillStyle = st.disc; g.fill();
    g.lineWidth = 1.3; g.strokeStyle = st.ring; g.stroke();
  }
  const ic = uiIcon(pin.icon, 48);
  if (ic) g.drawImage(ic, x - px / 2, y - px / 2, px, px);
}
