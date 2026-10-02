// The close-up charts of the islands, for the world map (M). The chart of
// the whole planet is a painting eight metres to the pixel: from a distance
// that's what a chart looks like, but zoom in on an island and it's a blur.
// So every island you've set foot on is charted properly as well — once,
// tile by tile, two pixels to the metre, in the chart's own inks: the coast
// inked, the shallows washed pale with the depth lines a surveyor draws round
// a shore, the land in its colours with the hills shaded and the slopes
// contoured, paving and piers where they are, and every tree drawn where it
// stands — and kept (as many as fit in some sixty megabytes). The buildings go on top every
// frame as clean outlines in their roofs' colours, sharp at any zoom.
//
// Built a slice at a time (the map waits while it's open, so a few
// milliseconds a frame are free), the island you're on first.
import { T, PALETTE, IS_LIQUID, OVERLAY, MANMADE } from '../world/tiles.js';
import { footprint } from '../world/objects.js';
import { hexToRgb } from '../core/math.js';

const PX = 2; // pixels to the metre
const MAX_PIXELS = 0.9e6; // the biggest islands are drawn at fewer pixels to the metre (Alabasta: ~1.4)
const MARGIN = 30; // m of sea charted round the land (the shallows, and cover for the painting's blur)
const KEEP_PX = 16e6; // pixels of island charts kept at once (~64 MB): the ones longest out of view go first
const BUDGET = 9; // ms a frame spent charting

// ------------------------------------------------------------- the inks
const PARCH = [240, 226, 190];
const SEPIA = [74, 52, 32];
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
// the land's colours: the world's own, a little toward the parchment — and
// the common grounds picked out the way a chart-maker would
const LAND = [];
for (let t = 16; t < 256; t++) LAND[t] = PALETTE[t] ? mixc(hexToRgb(PALETTE[t][0]), PARCH, 0.22) : [214, 200, 160];
Object.assign(LAND, {
  [T.GRASS]: [128, 170, 96], [T.LAWN]: [134, 180, 100], [T.FLOWERS]: [138, 176, 100], [T.SAKURA]: [150, 184, 122],
  [T.FOREST]: [104, 150, 86], [T.JUNGLE]: [92, 142, 80], [T.MANGROVE]: [124, 146, 86],
  [T.SAND]: [236, 220, 170], [T.DESERT]: [228, 200, 140], [T.DIRT]: [184, 152, 106], [T.MUD]: [140, 122, 84], [T.FARM]: [186, 168, 102],
  [T.ROCK]: [166, 158, 144], [T.MOUNTAIN]: [152, 140, 124], [T.CLIFF]: [136, 124, 108], [T.SNOWROCK]: [206, 208, 210], [T.RED_ROCK]: [170, 92, 66],
  [T.SNOW]: [244, 246, 248], [T.ICE]: [212, 232, 240], [T.PACK_ICE]: [226, 240, 246],
  [T.COBBLE]: [190, 180, 164], [T.STONE]: [206, 198, 184], [T.MARBLE]: [234, 230, 220], [T.GRAVEL]: [184, 176, 162],
  [T.PLANK]: [156, 112, 70], [T.BRIDGE]: [150, 106, 64], [T.RAIL]: [128, 108, 88],
});
// liquids that aren't water
const LIQ = { [T.LAVA]: [226, 96, 44], [T.ACID]: [140, 186, 80], [T.CLOUD_SEA]: [240, 244, 250] };
const WASH = [104, 164, 186]; // the shallows
const DEPTHS = [3, 7, 12]; // m off the coast: the depth lines
// trees: [crown, shadow] by kind
const TREE = {
  palm: [[112, 156, 80], [70, 104, 52]], pine: [[74, 116, 74], [46, 76, 48]], snowpine: [[98, 128, 104], [64, 88, 72]],
  jungle: [[78, 132, 70], [46, 86, 44]], sakura: [[236, 168, 192], [178, 108, 134]], dead: [[140, 120, 92], [96, 80, 60]],
};
const TREE_DEFAULT = [[96, 146, 78], [58, 98, 50]];

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a cheap value noise for the parchment's mottling (read once per tile: see work)
const hash = (x, y) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/** The colour the world chart paints the sea round (x, y), as the map's shader finishes it (see terrainShader.js mapColor). */
function chartSea(world, x, y) {
  const m = world.map;
  if (!m) return [168, 196, 196];
  const sx = world.width / m.w, sy = world.height / m.h;
  const i = Math.max(0, Math.min(m.w - 1, Math.floor(world.wx(x) / sx))), j = Math.max(0, Math.min(m.h - 1, Math.floor(y / sy)));
  const o = (j * m.w + i) * 4;
  const mc = [m.data[o], m.data[o + 1], m.data[o + 2]];
  const parch = [228, 213, 177], fog = [223, 205, 163];
  return mixc(mixc(parch, mc, 0.62), fog, 0.15);
}

export class ChartDetail {
  constructor() {
    this.charts = new Map(); // island id → chart (built or being built)
    this.t = 0;
  }

  /** The chart of an island (started if need be): { canvas, x0, y0, px, done, ... }. */
  chart(world, isl) {
    const key = `${world.id}:${isl.id}`;
    let c = this.charts.get(key);
    if (!c) {
      c = start(world, isl);
      this.charts.set(key, c);
    }
    c.used = this.t;
    return c;
  }

  /** Keep within the memory allowed: drop the charts longest out of view (never one in view now). */
  trim() {
    let total = 0;
    for (const c of this.charts.values()) total += c.cw * c.ch;
    if (total <= KEEP_PX) return;
    const old = [...this.charts.entries()].filter(([, c]) => c.used < this.t).sort((a, b) => a[1].used - b[1].used);
    for (const [k, c] of old) {
      if (total <= KEEP_PX) break;
      total -= c.cw * c.ch;
      this.charts.delete(k);
    }
  }

  /**
   * Draw the islands in view that you know, over the world chart: `v` gives
   * the context to draw on (device pixels), dpr, the map's zoom (css pixels
   * to the metre), toS(x, y) → css pixels, the screen size, and which islands
   * are known.
   */
  draw(g, v) {
    this.t++;
    // (v.alpha: how strongly to draw them, if not as the map fades them in as you zoom)
    const a = v.alpha ?? smooth(0.3, 0.7, v.zoom);
    if (a <= 0) return;
    const { world, dpr, zoom } = v;
    const t0 = performance.now();
    const todo = [];
    for (const isl of world.islands) {
      const B = isl.landBox;
      if (!B || !v.known(isl)) continue;
      const [sx0, sy0] = v.toS(B.x0 - MARGIN, B.y0 - MARGIN);
      const sx1 = sx0 + (B.x1 - B.x0 + 2 * MARGIN) * zoom, sy1 = sy0 + (B.y1 - B.y0 + 2 * MARGIN) * zoom;
      if (sx1 < 0 || sy1 < 0 || sx0 > v.cw || sy0 > v.ch) continue;
      const c = this.chart(world, isl);
      if (!c.done) { todo.push(c); continue; }
      g.globalAlpha = a;
      g.imageSmoothingEnabled = true;
      const [cx, cy] = v.toS(c.x0, c.y0);
      g.drawImage(c.canvas, cx * dpr, cy * dpr, c.cw / c.px * zoom * dpr, c.ch / c.px * zoom * dpr);
      if (zoom > 0.45) drawBuildings(g, c, v, a * smooth(0.45, 0.8, zoom));
    }
    // (the nearest first: the island you're on)
    todo.sort((p, q) => Math.hypot(p.mx - v.px, p.my - v.py) - Math.hypot(q.mx - v.px, q.my - v.py));
    for (const c of todo) {
      if (performance.now() - t0 > BUDGET) break;
      work(world, c, t0);
    }
    g.globalAlpha = 1;
    this.trim();
  }
}

/** Set up the chart of an island: what's on its tiles, read once. */
function start(world, isl) {
  const B = isl.landBox;
  const x0 = Math.floor(B.x0 - MARGIN), y0 = Math.floor(B.y0 - MARGIN);
  const tw = Math.ceil(B.x1 + MARGIN) - x0 + 1, th = Math.ceil(B.y1 + MARGIN) - y0 + 1;
  const px = Math.min(PX, Math.sqrt(MAX_PIXELS / (tw * th)));
  const cw = Math.max(1, Math.round(tw * px)), ch = Math.max(1, Math.round(th * px));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  return {
    isl, x0, y0, tw, th, px, cw, ch, canvas, mx: isl.x, my: isl.y,
    stage: 0, row: 0, done: false, used: 0,
    sea: chartSea(world, x0 - 2, y0 - 2),
    // (the tiles, with a tile's border all round, so every pixel has four to blend)
    gw: tw + 2, gh: th + 2, type: null, elev: null, dist: null, img: null, buildings: null,
  };
}

/** Chart some more of an island, until the frame's time is up. */
function work(world, c, t0) {
  const tw0 = performance.now(), st = c.stage;
  workStage(world, c, t0);
  // (how long each stage took, all told: for the tests)
  (c.ms || (c.ms = [0, 0, 0]))[st] += performance.now() - tw0;
}

function workStage(world, c, t0) {
  // 1: read the tiles (a row at a time)
  if (c.stage === 0) {
    const n = c.gw * c.gh;
    if (!c.type) { c.type = new Uint8Array(n); c.elev = new Uint8Array(n); c.dist = new Float32Array(n); c.mot = new Float32Array(n); c.read = 0; }
    while (c.read < c.gh) {
      const j = c.read++;
      for (let i = 0; i < c.gw; i++) {
        const x = c.x0 - 1 + i, y = c.y0 - 1 + j, k = j * c.gw + i;
        c.type[k] = world.type(x, y);
        c.elev[k] = world.elev(x, y);
        c.dist[k] = (world.distRaw(x, y) - 128) * 0.25;
        c.mot[k] = vnoise(x * 0.18, y * 0.18);
      }
      if ((c.read & 15) === 0 && performance.now() - t0 > BUDGET) return;
    }
    c.img = c.canvas.getContext('2d').createImageData(c.cw, c.ch);
    c.stage = 1;
  }
  // 2: paint, a row of pixels at a time
  if (c.stage === 1) {
    while (c.row < c.ch) {
      paintRow(c, c.row++);
      if ((c.row & 7) === 0 && performance.now() - t0 > BUDGET) return;
    }
    c.canvas.getContext('2d').putImageData(c.img, 0, 0);
    c.img = null;
    c.stage = 2;
    if (performance.now() - t0 > BUDGET) return;
  }
  // 3: the trees, where they stand; the buildings' outlines (drawn each frame)
  if (c.stage === 2) {
    drawTrees(world, c);
    c.buildings = buildingsOf(world, c);
    c.type = c.elev = c.dist = c.mot = null;
    c.stage = 3;
    c.done = true;
  }
}

// (a land pixel's colour, summed from its tiles: liquids and piers don't count)
const B4 = { r: 0, g: 0, b: 0, w: 0 };
function blend(t, w) {
  if (IS_LIQUID[t] || OVERLAY[t]) return;
  const L = LAND[t];
  B4.r += L[0] * w; B4.g += L[1] * w; B4.b += L[2] * w; B4.w += w;
}

/** One row of the island's chart. */
function paintRow(c, pj) {
  const { gw, type, elev, dist, mot, px, img, sea } = c;
  const data = img.data;
  const wy = c.y0 + (pj + 0.5) / px; // world y of the row
  const gy = wy - c.y0 + 0.5, j0 = Math.floor(gy), fy = gy - j0;
  const lw = 0.7 / px; // a line ~1.4 px wide, in metres
  for (let pi = 0; pi < c.cw; pi++) {
    const wx = c.x0 + (pi + 0.5) / px;
    const gx = wx - c.x0 + 0.5, i0 = Math.floor(gx), fx = gx - i0;
    const k00 = j0 * gw + i0, k10 = k00 + 1, k01 = k00 + gw, k11 = k01 + 1;
    const sd = (dist[k00] * (1 - fx) + dist[k10] * fx) * (1 - fy) + (dist[k01] * (1 - fx) + dist[k11] * fx) * fy;
    // the tile the pixel is on
    const tk = (Math.floor(wy) - c.y0 + 1) * gw + (Math.floor(wx) - c.x0 + 1);
    const tt = type[tk];
    let r, g, b, a = 255;
    // fading out toward the sides of the chart (into the painting of the sea)
    const edge = Math.min(pi, pj, c.cw - 1 - pi, c.ch - 1 - pj) / px;
    const out = smooth(0, 6, edge) * (1 - smooth(MARGIN - 9, MARGIN - 1, -sd));
    if (OVERLAY[tt]) {
      // piers, bridges and rails: planks across the water
      const L = LAND[tt];
      const plank = ((Math.floor(wx * 2) + Math.floor(wy * 2)) & 1) ? 0.94 : 1.04;
      r = L[0] * plank; g = L[1] * plank; b = L[2] * plank;
    } else if (sd < 0) {
      // the sea: the chart's own colour, the shallows washed pale, depth lines, the coast inked
      const d = -sd;
      const liq = LIQ[tt];
      let cr = sea[0], cg = sea[1], cb = sea[2];
      if (liq) { cr = liq[0]; cg = liq[1]; cb = liq[2]; } else {
        const w = 0.55 * (1 - smooth(0, 16, d));
        cr += (WASH[0] - cr) * w; cg += (WASH[1] - cg) * w; cb += (WASH[2] - cb) * w;
        for (const L of DEPTHS) {
          const ln = (1 - smooth(lw * 0.5, lw * 1.5, Math.abs(d - L))) * 0.32 * (1 - L / 20);
          cr += (60 - cr) * ln; cg += (100 - cg) * ln; cb += (118 - cb) * ln;
        }
      }
      const ink = 1 - smooth(0, lw * 1.6, d);
      r = cr + (SEPIA[0] - cr) * ink; g = cg + (SEPIA[1] - cg) * ink; b = cb + (SEPIA[2] - cb) * ink;
      a = 255 * Math.max(out, ink);
    } else {
      // the land: its four nearest tiles' colours blended (sharpened, so the edges between grounds are crisp)
      const sx = smooth(0.3, 0.7, fx), sy = smooth(0.3, 0.7, fy);
      B4.r = B4.g = B4.b = B4.w = 0;
      blend(type[k00], (1 - sx) * (1 - sy)); blend(type[k10], sx * (1 - sy));
      blend(type[k01], (1 - sx) * sy); blend(type[k11], sx * sy);
      if (B4.w > 0) { r = B4.r / B4.w; g = B4.g / B4.w; b = B4.b / B4.w; } else { r = LAND[T.SAND][0]; g = LAND[T.SAND][1]; b = LAND[T.SAND][2]; }
      // the lie of the land: shaded from the north-west, contoured every 2 m or so
      const e00 = elev[k00], e10 = elev[k10], e01 = elev[k01], e11 = elev[k11];
      const ex = (e10 - e00) * (1 - fy) + (e11 - e01) * fy, ey = (e01 - e00) * (1 - fx) + (e11 - e10) * fx;
      const e = (e00 * (1 - fx) + e10 * fx) * (1 - fy) + (e01 * (1 - fx) + e11 * fx) * fy;
      const steep = MANMADE[tt] ? 0.35 : 1;
      const nx = -ex * 0.09 * steep, ny = -ey * 0.09 * steep, nl = Math.sqrt(nx * nx + ny * ny + 1);
      const lam = (nx * -0.55 + ny * -0.7 + 0.45) / nl;
      let k = 0.86 + 0.32 * lam;
      // paving's stones, a farm's furrows; the parchment showing through
      if (MANMADE[tt] && !OVERLAY[tt]) k *= ((Math.floor(wx) + Math.floor(wy)) & 1) ? 0.97 : 1.02;
      if (tt === T.FARM) k *= (Math.floor(wx / 1.6) & 1) ? 0.92 : 1.05;
      k *= 0.95 + 0.1 * ((mot[k00] * (1 - fx) + mot[k10] * fx) * (1 - fy) + (mot[k01] * (1 - fx) + mot[k11] * fx) * fy);
      r *= k; g *= k; b *= k;
      const grad = Math.sqrt(ex * ex + ey * ey);
      if (grad > 0.6 && !MANMADE[tt]) {
        const cd = Math.abs(e - Math.round(e / 26) * 26) / grad; // tiles to the nearest contour
        const cl = (1 - smooth(lw * 0.4, lw * 1.2, cd)) * 0.22;
        r += (SEPIA[0] - r) * cl; g += (SEPIA[1] - g) * cl; b += (SEPIA[2] - b) * cl;
      }
      const ink = 1 - smooth(lw * 0.3, lw * 1.9, sd);
      r += (SEPIA[0] - r) * ink; g += (SEPIA[1] - g) * ink; b += (SEPIA[2] - b) * ink;
    }
    const o = (pj * c.cw + pi) * 4;
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
  }
}

/** Every tree on the island, where it stands, as a chart-maker's little crown with its shadow. */
function drawTrees(world, c) {
  const g = c.canvas.getContext('2d');
  const px = c.px;
  const list = world.objects ? world.objects.query(c.x0, c.y0, c.x0 + c.tw, c.y0 + c.th) : [];
  const seen = new Set();
  const trees = [];
  for (const o of list) {
    if (seen.has(o) || (o.kind !== 'tree' && o.kind !== 'rock')) continue;
    seen.add(o);
    const x = world.dx(c.x0, o.x), y = o.y - c.y0;
    if (x < 0 || y < 0 || x > c.tw || y > c.th) continue;
    trees.push(o);
  }
  // (back to front, so crowns overlap the way they would)
  trees.sort((a, b) => a.y - b.y);
  for (const o of trees) {
    const x = world.dx(c.x0, o.x) * px, y = (o.y - 0.5 - c.y0) * px;
    if (o.kind === 'rock') {
      const r = 0.7 * (o.s || 1) * px;
      g.fillStyle = 'rgb(150,140,124)'; g.strokeStyle = 'rgba(74,52,32,.75)'; g.lineWidth = Math.max(0.6, px * 0.3);
      g.beginPath(); g.ellipse(x, y, r * 1.2, r * 0.9, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      continue;
    }
    const [crown, shade] = TREE[o.sub] || TREE_DEFAULT;
    const r = (o.sub === 'palm' ? 1.25 : o.sub === 'pine' || o.sub === 'snowpine' ? 1.1 : 1.45) * (o.s || 1) * px;
    // shadow to the south-east, then the crown, inked, with a lit north-west side
    g.fillStyle = 'rgba(60,44,28,.22)';
    g.beginPath(); g.arc(x + r * 0.35, y + r * 0.35, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgb(${shade[0]},${shade[1]},${shade[2]})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(52,40,26,.7)'; g.lineWidth = Math.max(0.6, px * 0.28); g.stroke();
    g.fillStyle = `rgb(${crown[0]},${crown[1]},${crown[2]})`;
    g.beginPath(); g.arc(x - r * 0.22, y - r * 0.22, r * 0.68, 0, Math.PI * 2); g.fill();
  }
}

/** The island's buildings (and anything else with walls) as rectangles in the world, with the colours of their roofs. */
function buildingsOf(world, c) {
  const out = [];
  const seen = new Set();
  const add = (b) => {
    if (!b || seen.has(b) || !(b.fw > 0 && b.fd > 0)) return;
    seen.add(b);
    const f = footprint(b);
    const roof = b.roof ? hexToRgb(b.roof) : [150, 96, 70];
    // (muted, as a chart colours them: the town reads as a town, and the names and icons on it stand out)
    const fill = mixc(roof, [184, 156, 122], 0.48);
    out.push({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, fill: `rgb(${fill[0] | 0},${fill[1] | 0},${fill[2] | 0})`, ridge: `rgba(${roof[0] * 0.55 | 0},${roof[1] * 0.55 | 0},${roof[2] * 0.55 | 0},.55)`, pub: b.role && b.role !== 'house' });
  };
  for (const t of c.isl.towns || []) for (const b of t.buildings || []) add(b);
  for (const l of c.isl.landmarks || []) if (l.kind === 'building' || l.kind === 'tower' || l.kind === 'hut') add(l);
  return out;
}

/** The buildings, sharp at any zoom: roofs in their colours, a ridge line along the long side, inked outlines (all of a kind in one path). */
function drawBuildings(g, c, v, a) {
  if (!c.buildings?.length || a <= 0) return;
  const { dpr, zoom } = v;
  const shadow = new Path2D(), outline = new Path2D(), fills = new Map(), ridges = new Map();
  let n = 0;
  for (const b of c.buildings) {
    const [sx, sy] = v.toS(b.x0, b.y0);
    const w = (b.x1 - b.x0) * zoom, h = (b.y1 - b.y0) * zoom;
    if (sx + w < 0 || sy + h < 0 || sx > v.cw || sy > v.ch) continue;
    n++;
    const X = sx * dpr, Y = sy * dpr, Wd = w * dpr, Hd = h * dpr;
    shadow.rect(X + Wd * 0.08 + 1, Y + Hd * 0.1 + 1, Wd, Hd);
    let f = fills.get(b.fill);
    if (!f) fills.set(b.fill, (f = new Path2D()));
    f.rect(X, Y, Wd, Hd);
    outline.rect(X, Y, Wd, Hd);
    if (Wd > 6 && Hd > 6) {
      let r = ridges.get(b.ridge);
      if (!r) ridges.set(b.ridge, (r = new Path2D()));
      if (Wd >= Hd) { r.moveTo(X + Hd * 0.3, Y + Hd / 2); r.lineTo(X + Wd - Hd * 0.3, Y + Hd / 2); } else { r.moveTo(X + Wd / 2, Y + Wd * 0.3); r.lineTo(X + Wd / 2, Y + Hd - Wd * 0.3); }
    }
  }
  if (!n) return;
  g.globalAlpha = a;
  g.lineJoin = 'round';
  // a soft shadow to the south-east, the roofs, their ridges, the ink
  g.fillStyle = 'rgba(60,40,24,.25)';
  g.fill(shadow);
  for (const [col, path] of fills) { g.fillStyle = col; g.fill(path); }
  g.lineWidth = Math.max(1, zoom * 0.18) * dpr;
  for (const [col, path] of ridges) { g.strokeStyle = col; g.stroke(path); }
  g.lineWidth = Math.max(1, zoom * 0.22) * dpr;
  g.strokeStyle = 'rgba(58,40,24,.9)';
  g.stroke(outline);
}
