// Frame composition: WebGL terrain underneath, a Canvas2D layer on top for
// props, characters, ships and effects, all sharing one camera.
import { TerrainRenderer } from './terrain.js';
import { treeSprite, rockSprite, bushSprite, drawCached, drawBuilding, drawProp, drawTreeFruit } from './sprites.js';
import { fruitOf, fruitSpots, isPicked, FRUIT_COLORS } from '../world/fruitTrees.js';

export class Renderer {
  constructor(root) {
    this.root = root;
    this.glCanvas = document.createElement('canvas');
    this.canvas = document.createElement('canvas');
    for (const c of [this.glCanvas, this.canvas]) {
      c.style.position = 'absolute';
      c.style.left = '0';
      c.style.top = '0';
      c.style.width = '100%';
      c.style.height = '100%';
      root.appendChild(c);
    }
    this.canvas.style.pointerEvents = 'none';
    this.terrain = new TerrainRenderer(this.glCanvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this.cw = 1; this.ch = 1; // css size
    this.cam = { x: 0, y: 0, zoom: 40, shakeX: 0, shakeY: 0 };
    this.visible = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cw = window.innerWidth; this.ch = window.innerHeight;
    const w = Math.round(this.cw * this.dpr), h = Math.round(this.ch * this.dpr);
    // terrain at a slightly lower resolution on high-dpi screens for speed
    const tScale = this.dpr > 1.5 ? 0.75 : 1;
    this.terrain.resize(Math.round(w * tScale), Math.round(h * tScale));
    this.terrainScale = tScale;
    this.canvas.width = w; this.canvas.height = h;
  }

  /** World → CSS pixel coordinates. */
  toScreen(world, x, y) {
    const c = this.cam;
    return [world.dx(c.x, x) * c.zoom + this.cw / 2 + c.shakeX, (y - c.y) * c.zoom + this.ch / 2 + c.shakeY];
  }
  toWorld(world, sx, sy) {
    const c = this.cam;
    return [world.wx(c.x + (sx - this.cw / 2 - c.shakeX) / c.zoom), c.y + (sy - this.ch / 2 - c.shakeY) / c.zoom];
  }
  viewRect() {
    const c = this.cam;
    const hw = this.cw / 2 / c.zoom, hh = this.ch / 2 / c.zoom;
    return { x0: c.x - hw, x1: c.x + hw, y0: c.y - hh, y1: c.y + hh };
  }

  renderTerrain(world, env) {
    const c = this.cam;
    this.terrain.render({
      camX: c.x - c.shakeX / c.zoom, camY: c.y - c.shakeY / c.zoom,
      zoom: c.zoom * this.dpr * this.terrainScale,
      time: env.time, ambient: env.ambient, daylight: env.daylight,
      mapMode: env.mapMode, revealAll: env.revealAll, storm: env.storm, windX: env.windX, windY: env.windY,
      zone: world.zone,
    });
  }

  /**
   * Draw props + dynamic entities, y-sorted.
   * `entities` provide { x, y, drawOrder?, draw(g, r) } in world coords.
   */
  renderWorld(world, entities, env, overlays, underlays) {
    const g = this.ctx;
    const c = this.cam;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (env.mapMode) return;
    if (underlays) { underlays(g, this); g.setTransform(1, 0, 0, 1, 0, 0); }
    const z = c.zoom;
    const v = this.viewRect();
    const pad = 6;
    const list = this.visible;
    list.length = 0;
    const lod = z < 9; // far zoom: skip small props
    if (world.objects && z >= 4) {
      world.objects.query(v.x0 - pad, v.y0 - pad, v.x1 + pad, v.y1 + pad + 6, list);
    }
    for (const e of entities) list.push(e);
    // cull + sort
    const items = [];
    for (const o of list) {
      const dx = world.dx(c.x, o.x);
      if (dx < v.x0 - c.x - pad || dx > v.x1 - c.x + pad) continue;
      if (o.y < v.y0 - 2 || o.y > v.y1 + (o.kind === 'building' ? 12 : 7)) continue;
      if (lod && (o.kind === 'bush' || o.kind === 'barrel' || o.kind === 'crate' || o.kind === 'mooring' || o.kind === 'haystack')) continue;
      items.push(o);
    }
    items.sort((a, b) => (a.sortY ?? a.y) - (b.sortY ?? b.y));

    const dpr = this.dpr;
    const t = env.time;
    const night = env.daylight < 0.45;
    for (const o of items) {
      const sx = world.dx(c.x, o.x) * z + this.cw / 2 + c.shakeX;
      const sy = (o.y - c.y) * z + this.ch / 2 + c.shakeY;
      g.setTransform(dpr * z, 0, 0, dpr * z, sx * dpr, sy * dpr);
      if (o.draw) { o.draw(g, env, this); continue; }
      switch (o.kind) {
        case 'tree': {
          const s = treeSprite(o.sub, o.v || 0);
          const sc = o.s || 1;
          // gentle sway
          if (!lod && o.sub !== 'cactus' && o.sub !== 'dead') {
            const sway = Math.sin(t * 1.3 + o.x * 0.7) * 0.02 * (env.storm ? 3 : 1);
            g.transform(1, 0, sway, 1, 0, 0);
          }
          drawCached(g, s, 0, 0, sc);
          const fr = !lod && fruitOf(o);
          if (fr && !isPicked(world.id, o, env.day)) { g.scale(sc, sc); drawTreeFruit(g, o, fr, fruitSpots(o), FRUIT_COLORS[fr]); }
          break;
        }
        case 'rock': drawCached(g, rockSprite(o.v || 0), 0, 0, o.s || 1); break;
        case 'bush': drawCached(g, bushSprite(o.sub || 'bush', o.v || 0), 0, 0, o.s || 1); break;
        case 'building': drawBuilding(g, o, night, t); break;
        default: drawProp(g, o, t, night);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);

    // tint props for night/storm so they match the shader-lit terrain
    const amb = env.ambient;
    const dark = 1 - (amb[0] + amb[1] + amb[2]) / 3;
    if (dark > 0.02) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(${Math.round(20 * (1 - amb[0]))},${Math.round(30 * (1 - amb[1]))},${Math.round(70 * (1 - amb[2]) + 20)},${Math.min(0.75, dark * 0.95)})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      g.globalCompositeOperation = 'source-over';
    }
    if (overlays) overlays(g, this);
  }
}
