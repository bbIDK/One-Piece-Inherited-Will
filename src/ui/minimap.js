// The minimap (top right): the same chart as the world map (M), round you.
// The planet's painting in the chart's parchment inks, washed out where you
// haven't been, with the Grand Line's and the Calm Belts' edges and the
// survey grid ruled across it; over that, the islands you know charted
// close up with their buildings (chartDetail.js, shared with the map, so
// each island is charted once); then ships, foes and quest folk. − and +
// zoom it out and in (it remembers how far, on foot and at sea apart).
import { ChartDetail } from './chartDetail.js';
import { seenIsland } from './mapUI.js';
import { GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM } from '../world/constants.js';

const ZOOMS = [0.5, 1, 2, 4, 8, 16, 32]; // m to a pixel of the minimap
const DEFAULT = { foot: 1, sea: 2 }; // (indices into ZOOMS)
const CHUNK = 256; // painting pixels a side of each piece of the planet kept drawn
const KEEP = 48; // pieces kept (~12 MB)
const PER_DRAW = 3; // pieces painted at most each time it's drawn (the rest wait as bare parchment)
const RECHECK = 1.5; // s: how often the pieces round you are looked over for newly explored ground
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
  constructor(canvas) {
    this.canvas = canvas;
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

  draw(game, dt = 0.2) {
    const c = this.canvas, w = game.world, p = game.player;
    if (!w || !p || !w.map) return;
    // (as sharp as the screen: the canvas is drawn at the screen's pixel density)
    const css = c.clientWidth || 190, dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(css * dpr);
    if (c.width !== size) { c.width = size; c.height = size; }
    const g = c.getContext('2d');
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
    let painted = 0;
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
          if (painted >= PER_DRAW) continue;
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
    detail.draw(g, {
      // (solid until the painting alone can show an island: a few metres to the pixel)
      world: w, dpr, zoom: z, cw: css, ch: css, toS, px: p.x, py: p.y, alpha: smooth(0.07, 0.2, z),
      known: (isl) => zone || game.creative?.on || discovered.has(isl.id) || isl === game.currentIsland || seenIsland(w, isl),
    });
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 3. the chart's rules: the survey grid, and the edges of the Grand Line and the Calm Belts
    rules(g, w, p, z, css, zone);
    // 4. ships, foes and quest folk
    for (const s of game.ships) {
      if (s.sunk) continue;
      const [dx, dy] = toS(s.x, s.y);
      if (Math.hypot(dx - css / 2, dy - css / 2) > css / 2 - 4) continue;
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
      const [dx, dy] = toS(a.x, a.y);
      if (Math.hypot(dx - css / 2, dy - css / 2) > css / 2 - 3) continue;
      g.fillStyle = a.questMarker ? (a.questMarker[0] === 'M' ? '#ff9100' : '#ffd54f') : '#e53935';
      g.strokeStyle = 'rgba(40,26,14,.9)'; g.lineWidth = 1;
      g.beginPath(); g.arc(dx, dy, a.questMarker ? 3.2 : 2.4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // (just after − or +: how far across it reaches now)
    if (this.flash && performance.now() < this.flash.until) {
      g.font = '600 11px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const tw = g.measureText(this.flash.text).width + 12;
      g.fillStyle = 'rgba(40,28,16,.78)';
      g.fillRect(css / 2 - tw / 2, css - 30, tw, 16);
      g.fillStyle = '#f6ead0';
      g.fillText(this.flash.text, css / 2, css - 22);
    }
    // the round frame
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    // you (the 3D view keeps a fixed arrow over the turning map instead)
    if (game.view3d?.active) return;
    g.setTransform(dpr, 0, 0, dpr, css / 2 * dpr, css / 2 * dpr);
    g.rotate(sailing && p.ship ? p.ship.heading : p.facing);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-2, 0); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.setTransform(1, 0, 0, 1, 0, 0);
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
