import { program, texture, fullscreenQuad, FULLSCREEN_VS } from './gl.js';
import { TERRAIN_FS } from './terrainShader.js';
import { PALETTE } from '../world/tiles.js';
import { hexToRgb } from '../core/math.js';

export class TerrainRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is required to play. Please use a recent Chrome, Edge or Firefox.');
    this.gl = gl;
    this.prog = program(gl, FULLSCREEN_VS, TERRAIN_FS);
    this.quad = fullscreenQuad(gl);
    this.lights = new Float32Array(24 * 4);
    this.lightCols = new Float32Array(24 * 3);
    this.numLights = 0;
    this.textures = {};
    this.buildPalette();
  }

  buildPalette() {
    const gl = this.gl;
    const data = new Uint8Array(256 * 2 * 4);
    for (let i = 0; i < 256; i++) {
      const p = PALETTE[i] || ['#ff00ff', '#ff00ff'];
      for (let row = 0; row < 2; row++) {
        const [r, g, b] = hexToRgb(p[row]);
        const o = (row * 256 + i) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
      }
    }
    this.textures.pal = texture(gl, { width: 256, height: 2, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data, wrapS: gl.CLAMP_TO_EDGE });
  }

  /**
   * Upload a tile map. `world` = RGBA8 (type, elevation, climate, variant),
   * `dist` = R8 signed distance, `map` = RGBA8 half-res painted map, `fog` = R8 explored mask.
   */
  setWorld({ width, height, world, dist, map, mapW, mapH, fog, fogW, fogH }) {
    const gl = this.gl;
    for (const k of ['world', 'dist', 'map', 'fog']) if (this.textures[k]) gl.deleteTexture(this.textures[k]);
    this.width = width; this.height = height;
    // The game is drawn in 3D now: this renderer only paints the world chart,
    // which needs the half-resolution map and coastline distance. (Full-size
    // world textures would also exceed phones' 4096-pixel texture limit.)
    void world;
    this.textures.world = texture(gl, { width: 1, height: 1, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: new Uint8Array(4) });
    const half = new Uint8Array(mapW * mapH);
    const sx = width / mapW, sy = height / mapH;
    for (let y = 0; y < mapH; y++) {
      const row = Math.min(height - 1, Math.floor(y * sy)) * width;
      for (let x = 0; x < mapW; x++) half[y * mapW + x] = dist[row + Math.min(width - 1, Math.floor(x * sx))];
    }
    this.textures.dist = texture(gl, { width: mapW, height: mapH, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: half, filter: gl.LINEAR, mipmaps: true });
    this.textures.map = texture(gl, { width: mapW, height: mapH, internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, data: map, filter: gl.LINEAR, mipmaps: true });
    this.fogW = fogW; this.fogH = fogH;
    this.textures.fog = texture(gl, { width: fogW, height: fogH, internal: gl.R8, format: gl.RED, type: gl.UNSIGNED_BYTE, data: fog, filter: gl.LINEAR });
  }

  updateFog(fog) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures.fog);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.fogW, this.fogH, gl.RED, gl.UNSIGNED_BYTE, fog);
  }

  /** Re-upload a rectangle of tiles after the map changed (x0,y0 inclusive, w,h). */
  updateTiles(worldRGBA, dist, x0, y0, w, h, fullW) {
    // (the chart doesn't need tile-accurate updates; the 3D view rebuilds its own chunks)
    if (this.textures.world) return;
    const gl = this.gl;
    const sub = new Uint8Array(w * h * 4);
    const subD = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      sub.set(worldRGBA.subarray(((y0 + y) * fullW + x0) * 4, ((y0 + y) * fullW + x0 + w) * 4), y * w * 4);
      subD.set(dist.subarray((y0 + y) * fullW + x0, (y0 + y) * fullW + x0 + w), y * w);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.world);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, sub);
    gl.bindTexture(gl.TEXTURE_2D, this.textures.dist);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RED, gl.UNSIGNED_BYTE, subD);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  clearLights() { this.numLights = 0; }
  addLight(x, y, radius, intensity, r, g, b) {
    if (this.numLights >= 24) return;
    const i = this.numLights++;
    this.lights.set([x, y, radius, intensity], i * 4);
    this.lightCols.set([r, g, b], i * 3);
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(view) {
    const gl = this.gl;
    const u = this.prog.uniforms;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog.program);
    gl.bindVertexArray(this.quad);
    const bind = (unit, tex, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u[name], unit);
    };
    bind(0, this.textures.world, 'uWorld');
    bind(1, this.textures.dist, 'uDist');
    bind(2, this.textures.pal, 'uPal');
    bind(3, this.textures.map, 'uMap');
    bind(4, this.textures.fog, 'uFog');
    // view.camX/camY in tiles, view.zoom in *device* pixels per tile
    gl.uniform2f(u.uCam, view.camX, view.camY);
    gl.uniform1f(u.uZoom, view.zoom);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, view.time % 3600);
    gl.uniform2f(u.uWorldSize, this.width, this.height);
    gl.uniform3f(u.uAmbient, view.ambient[0], view.ambient[1], view.ambient[2]);
    gl.uniform1f(u.uDay, view.daylight);
    gl.uniform1f(u.uMapMode, view.mapMode ? 1 : 0);
    gl.uniform1f(u.uSurfaceMap, view.revealAll ? 1 : 0);
    gl.uniform1f(u.uStorm, view.storm || 0);
    gl.uniform2f(u.uWind, view.windX || 0.7, view.windY || 0.3);
    gl.uniform1i(u.uZone, view.zone || 0);
    gl.uniform4fv(u.uLights, this.lights);
    gl.uniform3fv(u.uLightCol, this.lightCols);
    gl.uniform1i(u.uNumLights, this.numLights);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
