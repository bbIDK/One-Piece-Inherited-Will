// The 2D layers under and over the 3D view: a WebGL canvas that paints the
// world chart (M), and a Canvas2D overlay for effects, weather and labels.
// (The game itself is drawn in 3D; see src/render3d.)
import { TerrainRenderer } from './terrain.js';

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
    // first/third person: where the crosshair (or the free mouse) points
    if (this.view3d?.active && !this.view3d.game.ui?.mapOpen) return this.view3d.aimWorld(sx, sy);
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
}
