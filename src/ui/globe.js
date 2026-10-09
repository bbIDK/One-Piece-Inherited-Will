// The chart as a globe (M): the Blue Planet as the ball it is, turned and
// zoomed like a virtual globe — drag and the ground under the cursor follows
// it (and carries on spinning when you let go), the wheel or a double-click
// to come down closer, smoothly, from the whole planet down to a town's
// streets, all on the globe itself.
//
// What's on it is the chart itself, the same as the flat one: its parchment,
// ink coastlines, the Grand Line's and Calm Belts' boundaries and hatching,
// the fog over what you haven't sailed, the grid — captured from the chart's
// own renderer — tinted by region (the Grand Line gold, the Calm Belts slate,
// the Blues blue), and the chart's own labels and markers (mapUI.js
// drawLabels) stood on the sphere where they belong. Close up, each island
// you know is laid over it in the chart's full detail (chartDetail.js: its
// coasts, ground, towns, roofs), sharp as you come down to it.
//
// True to shape: the game's world is a flat chart that wraps east–west, every
// row W metres round; on a ball a circle of latitude shrinks with cos(lat),
// so a chart laid straight round a globe squeezes everything east–west away
// from the equator (by 30% at the Blues). So each island, and the Red Line,
// is laid at its own place, widened about its middle by 1/cos(latitude),
// which the ball's curve takes back in: its true shape and size, on the open
// sea between, where there's nothing to squeeze.
import * as THREE from 'three';
import { W, H, RM_X, MG_X, RL_HALF, GL_TOP, GL_BOTTOM, CB_TOP, CB_BOTTOM } from '../world/constants.js';
import { drawBuildings } from './chartDetail.js';

const TEX_W = 4096, TEX_H = 2048; // (the whole planet: about 6 m of it to a pixel)
const R_M = W / (2 * Math.PI); // the planet's radius (m)
const FOV = 30, TANH = Math.tan(FOV / 2 * Math.PI / 180);
const NEAR_D = 1.035, FAR_D = 4.6; // camera distance from the centre (radii): a town's streets, to the whole planet
const DETAIL_Z = 0.12; // (css px to the metre past which islands are laid on in full detail)

const latOf = (y) => (0.5 - Math.max(0, Math.min(1, y / H))) * Math.PI;
/** How much a degree of longitude shrinks at chart row y (never quite to nothing). */
const shrink = (y) => Math.max(0.06, Math.cos(latOf(y)));
const wrapDx = (a, b) => { let d = b - a; d -= W * Math.round(d / W); return d; };

/** The features drawn true to shape, each about its own middle: the islands, and the Red Line's two great arcs. */
function anchorsOf(world) {
  const out = [];
  for (const isl of world.islands || []) {
    const B = isl.landBox;
    if (!B) continue;
    out.push({ x0: B.x0 - 30, y0: B.y0 - 30, x1: B.x1 + 30, y1: B.y1 + 30, xc: (B.x0 + B.x1) / 2 });
  }
  for (const mx of [RM_X, MG_X]) out.push({ x0: mx - RL_HALF - 420, y0: 0, x1: mx + RL_HALF + 420, y1: H, xc: mx, band: true });
  return out;
}

/** Where on the globe's picture a chart point (x, y) is (u in 0..1): about the middle of the island it's on or by. */
export function globeU(x, y, anchors) {
  let u = x / W;
  if (anchors) {
    for (const A of anchors) {
      const dx = wrapDx(A.xc, x);
      if (y < A.y0 - 200 || y > A.y1 + 200 || Math.abs(dx) > (A.x1 - A.x0) / 2 + 200) continue;
      // (inside its box: placed as it's drawn; coming away from it, eased back onto the plain chart)
      const out = Math.max(0, Math.abs(dx) - (A.x1 - A.x0) / 2, A.y0 - y, y - A.y1);
      const k = Math.max(0, 1 - out / 200);
      const uA = (A.xc + dx / shrink(y)) / W;
      u = u + (uA - u) * k;
      break;
    }
  }
  return ((u % 1) + 1) % 1;
}

/** Where on the sphere a picture point (u, v) lies — as three.js's SphereGeometry lays its uv. */
export function uvToSphere(u, v, r = 1, out = new THREE.Vector3()) {
  const phi = u * Math.PI * 2, theta = Math.max(0, Math.min(1, v)) * Math.PI;
  return out.set(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/**
 * The Grand Line's and the Calm Belts' edges inked bold over the chart (the
 * seas' own colours come from the chart's renderer: env.globeTint).
 */
function inkEdges(g) {
  const ty = (y) => y / H * TEX_H;
  g.fillStyle = 'rgba(40, 104, 82, 0.85)';
  for (const y of [GL_TOP, GL_BOTTOM]) g.fillRect(0, ty(y) - 1.5, TEX_W, 3);
  g.fillStyle = 'rgba(70, 88, 96, 0.6)';
  for (const y of [CB_TOP, CB_BOTTOM]) g.fillRect(0, ty(y) - 1, TEX_W, 2);
}

export class GlobeView {
  constructor(parent) {
    this.el = document.createElement('canvas');
    Object.assign(this.el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none', background: 'radial-gradient(ellipse at 50% 45%, #1d2f4f 0%, #0b1324 70%, #060a14 100%)' });
    parent.prepend(this.el);
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.0005, 50);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 0.8);
    this.sun.position.set(-3, 2, 4);
    this.scene.add(this.sun);
    this.spin = new THREE.Group();
    this.scene.add(this.spin);
    this.base = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.spin.add(this.base);
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.03, 64, 48), new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false })));
    // (the ball's rim shaded a little, so it reads round without lighting the chart's colours away)
    this.spin.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(1.0004, 96, 64), new THREE.ShaderMaterial({
      // (no depth test: its coarser facets would dip under the ball's own at the rim)
      transparent: true, depthWrite: false, depthTest: false,
      // (per pixel: worked out at the corners and spread across, the big triangles would show at the rim)
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vP; void main() { float r = 1.0 - max(0.0, dot(normalize(vN), normalize(-vP))); gl_FragColor = vec4(0.04, 0.07, 0.14, pow(r, 2.6) * 0.55); }',
    })), { renderOrder: 2 }));
    this.isles = new Map(); // island id → mesh laid on in detail
    this.yaw = 0; this.tilt = 0; this.dist = 3.2; this.want = 3.2;
    this.vYaw = 0; this.vTilt = 0; this.dragging = false;
    this.baseKey = null;
    this.anchors = null;
    this._v = new THREE.Vector3(); this._c = new THREE.Vector3();
  }

  show(on) { this.el.style.display = on ? 'block' : 'none'; }

  /** css pixels to the metre at the middle of the view (the chart's own measure of zoom: its labels go by it). */
  zoomPx() {
    const ch = this.el.clientHeight || 720;
    return ch / (2 * TANH * Math.max(1e-4, this.dist - 1) * R_M);
  }

  /** Point (x, y) on the chart to the middle of the view, north up. */
  face(x, y) {
    this.yaw = Math.PI / 2 - globeU(x, y, this.anchors) * Math.PI * 2;
    this.tilt = (0.5 - Math.max(0, Math.min(1, y / H))) * Math.PI;
    this.vYaw = this.vTilt = 0;
  }

  /** Set how close: the chart's zoom (css px to the metre) at the middle of the view. */
  zoomTo(z) {
    const ch = this.el.clientHeight || 720;
    this.want = this.dist = Math.max(NEAR_D, Math.min(FAR_D, 1 + ch / (2 * TANH * z * R_M)));
  }

  /** Dragged by (dx, dy) css pixels: the ground under the cursor goes with it. */
  drag(dx, dy) {
    const ch = this.el.clientHeight || 720;
    const k = 2 * TANH * (this.dist - 1) / ch; // (radians of the globe to a pixel, at the middle)
    const dy0 = dy * k, dx0 = dx * k / Math.max(0.15, Math.cos(this.tilt));
    this.yaw += dx0; this.tilt = Math.max(-1.52, Math.min(1.52, this.tilt + dy0));
    // (how fast, for the spin it carries on with when let go)
    this.vYaw = this.vYaw * 0.4 + dx0 * 0.6; this.vTilt = this.vTilt * 0.4 + dy0 * 0.6;
  }

  /** The wheel: closer (f > 1) or further — smoothly, by the height above the ground. */
  zoom(f) { this.want = Math.max(NEAR_D, Math.min(FAR_D, 1 + (this.want - 1) / f)); }

  /** The chart point at the middle of the view. */
  centre() {
    const u = (((Math.PI / 2 - this.yaw) / (Math.PI * 2)) % 1 + 1) % 1, v = 0.5 - this.tilt / Math.PI;
    const y = Math.max(0, Math.min(1, v)) * H;
    let x = u * W;
    for (const A of this.anchors || []) {
      if (A.band || y < A.y0 || y > A.y1) continue;
      const du = wrapDx(A.xc, x), half = (A.x1 - A.x0) / 2 / shrink(y);
      if (Math.abs(du) <= half) { x = A.xc + du * shrink(y); break; }
    }
    return { x: ((x % W) + W) % W, y };
  }

  /**
   * The chart, captured from its own renderer, tinted by region and re-laid
   * true to shape, round the ball — when the globe opens, and again if more
   * of the world has been explored since.
   */
  buildBase(game, r) {
    const w = game.surface, c = game.state?.char;
    if (!this.anchors) this.anchors = anchorsOf(w);
    const key = `${w.id}|${(c?.discovered || []).length}|${Math.floor((game.time || 0) / 30)}|${game.creative?.on ? 1 : 0}`;
    if (key === this.baseKey) return;
    this.baseKey = key;
    // (1) the chart as the map renderer draws it, a screenful at a time
    const A = document.createElement('canvas');
    A.width = TEX_W; A.height = TEX_H;
    const ga = A.getContext('2d');
    const env = game.env, saved = { ...r.cam }, prevMode = env.mapMode;
    env.mapMode = true; env.globeTint = true;
    const scale = r.dpr * (r.terrainScale || 1), zEff = TEX_W / W; // (canvas pixels to the metre)
    const tw = r.glCanvas.width / zEff, th = r.glCanvas.height / zEff;
    for (let Y0 = 0; Y0 < H; Y0 += th) {
      for (let X0 = 0; X0 < W; X0 += tw) {
        Object.assign(r.cam, { x: X0 + tw / 2, y: Y0 + th / 2, zoom: zEff / scale, shakeX: 0, shakeY: 0 });
        r.renderTerrain(w, env);
        ga.drawImage(r.glCanvas, Math.round(X0 * zEff), Math.round(Y0 * zEff));
      }
    }
    env.mapMode = prevMode; env.globeTint = false;
    Object.assign(r.cam, saved);
    // (2) the Grand Line's edges, bold
    inkEdges(ga);
    // (3) true to shape: each feature's rows widened about its middle
    const F = document.createElement('canvas');
    F.width = TEX_W; F.height = TEX_H;
    const gf = F.getContext('2d');
    gf.drawImage(A, 0, 0);
    const pxW = W / TEX_W, pxH = H / TEX_H;
    for (const a of this.anchors) {
      const j0 = Math.max(0, Math.floor(a.y0 / pxH)), j1 = Math.min(TEX_H - 1, Math.ceil(a.y1 / pxH));
      const sw = (a.x1 - a.x0) / pxW, sx0 = (((a.x0 / pxW) % TEX_W) + TEX_W) % TEX_W;
      for (let j = j0; j <= j1; j++) {
        const s = shrink((j + 0.5) * pxH), dw = sw / s, dx = a.xc / pxW - dw / 2;
        for (const off of [-TEX_W, 0, TEX_W]) {
          if (dx + off > TEX_W || dx + off + dw < 0) continue;
          if (sx0 + sw <= TEX_W) gf.drawImage(A, sx0, j, sw, 1, dx + off, j, dw, 1);
          else { const a1 = TEX_W - sx0; gf.drawImage(A, sx0, j, a1, 1, dx + off, j, a1 / s, 1); gf.drawImage(A, 0, j, sw - a1, 1, dx + off + a1 / s, j, (sw - a1) / s, 1); }
        }
      }
    }
    const tex = new THREE.CanvasTexture(F);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.base.material.map?.dispose();
    this.base.material.map = tex;
    this.base.material.needsUpdate = true;
    // (the islands laid on in detail are made again from the new chart as they're wanted)
    for (const m of this.isles.values()) this.dropMesh(m);
    this.isles.clear();
  }

  dropMesh(m) { this.spin.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); }

  /**
   * Close up, the islands round the middle of the view laid over the globe
   * in the chart's full detail (their charts from chartDetail.js, roofs and
   * all), each a mesh true to shape about its middle.
   */
  layIslands(game, detail, known) {
    const z = this.zoomPx(), on = z > DETAIL_Z;
    const fade = Math.max(0, Math.min(1, (z - DETAIL_Z) / DETAIL_Z));
    for (const m of this.isles.values()) { m.visible = on; m.material.opacity = fade; }
    if (!on) return;
    const w = game.surface, cen = this.centre();
    // (the islands within the view, and a little round it)
    const reach = Math.max(this.el.clientWidth || 1280, this.el.clientHeight || 720) / z * 0.75 + 300;
    const near = w.islands.filter((isl) => isl.landBox && known(isl) && Math.hypot(wrapDx(cen.x, isl.x), cen.y - isl.y) < reach);
    // (their charts, drawn a little each frame — on a scratch canvas standing in for the flat chart's screen)
    const scratch = this.scratch || (this.scratch = document.createElement('canvas').getContext('2d'));
    const nearSet = new Set(near);
    detail.draw(scratch, { world: w, dpr: 1, zoom: 0.5, alpha: 0.001, cw: 1e9, ch: 1e9, toS: (x, y) => [wrapDx(cen.x, x) + 5e8, y - cen.y + 5e8], px: cen.x, py: cen.y, known: (isl) => nearSet.has(isl), budget: 8 });
    for (const isl of near) {
      if (this.isles.has(isl.id)) continue;
      const ch = detail.chart(w, isl);
      if (!ch.done) continue;
      const m = this.islandMesh(ch);
      m.material.opacity = fade;
      this.isles.set(isl.id, m);
    }
  }

  islandMesh(ch) {
    // (its chart with the roofs on, its edges faded into the globe's own picture)
    const cv = document.createElement('canvas');
    cv.width = ch.cw; cv.height = ch.ch;
    const g = cv.getContext('2d');
    g.drawImage(ch.canvas, 0, 0);
    drawBuildings(g, ch, { dpr: 1, zoom: ch.px, cw: ch.cw, ch: ch.ch, toS: (x, y) => [(x - ch.x0) * ch.px, (y - ch.y0) * ch.px] }, 1);
    // (each edge rubbed out toward the rim: destination-out keeps to the strip it's drawn in)
    g.globalCompositeOperation = 'destination-out';
    const e = Math.max(4, Math.min(28, ch.cw * 0.08, ch.ch * 0.08));
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, e, 0, 0, 0, e, ch.ch); edge(ch.cw, 0, ch.cw - e, 0, ch.cw - e, 0, e, ch.ch);
    edge(0, 0, 0, e, 0, 0, ch.cw, e); edge(0, ch.ch, 0, ch.ch - e, 0, ch.ch - e, ch.cw, e);
    g.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    // (a grid over the chart's box, each point where the globe puts it)
    const N = 48, pos = [], uv = [], idx = [], v = new THREE.Vector3();
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = ch.x0 + ch.tw * i / N, y = ch.y0 + ch.th * j / N;
        uvToSphere(globeU(x, y, this.anchors), y / H, 1.00015, v);
        pos.push(v.x, v.y, v.z); uv.push(i / N, 1 - j / N);
        if (i < N && j < N) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 1;
    this.spin.add(mesh);
    return mesh;
  }

  /** Chart point → css pixels as the globe stands just now; null round the far side of it. */
  project(x, y) {
    const v = uvToSphere(globeU(x, y, this.anchors), y / H, 1, this._v);
    v.applyMatrix4(this.spin.matrixWorld);
    this._c.copy(this.camera.position).sub(v);
    if (v.dot(this._c) < 0.002) return null; // (round the back of the ball)
    v.project(this.camera);
    if (v.z > 1) return null;
    const cw = this.el.clientWidth || 1280, chh = this.el.clientHeight || 720;
    return [(v.x + 1) / 2 * cw, (1 - v.y) / 2 * chh];
  }

  /** Which way north is on the screen at chart point (x, y) (radians, screen-up = 0), for arrows drawn there. */
  northAt(x, y) {
    const a = this.project(x, y), b = this.project(x, y - 30);
    return a && b ? Math.atan2(b[0] - a[0], -(b[1] - a[1])) : 0;
  }

  /** Turn, settle and draw. */
  update(dt = 1 / 60) {
    // (let go mid-drag, it carries on spinning, slowing)
    if (!this.dragging && (Math.abs(this.vYaw) + Math.abs(this.vTilt)) > 1e-7) {
      this.yaw += this.vYaw; this.tilt = Math.max(-1.52, Math.min(1.52, this.tilt + this.vTilt));
      const f = Math.exp(-dt * 3.5);
      this.vYaw *= f; this.vTilt *= f;
    }
    // (and comes in or goes out smoothly, by the height above the ground)
    this.dist = 1 + (this.dist - 1) * Math.pow((this.want - 1) / (this.dist - 1), Math.min(1, dt * 9));
    const cw = this.el.clientWidth || 1280, ch = this.el.clientHeight || 720;
    this.camera.aspect = cw / ch;
    this.camera.near = Math.max(0.0002, (this.dist - 1) * 0.3);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, this.dist); this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    this.spin.rotation.set(0, 0, 0);
    this.spin.rotateX(this.tilt);
    this.spin.rotateY(this.yaw);
    this.spin.updateMatrixWorld(true);
  }

  render() {
    if (!this.renderer) {
      try { this.renderer = new THREE.WebGLRenderer({ canvas: this.el, antialias: true, alpha: true }); this.renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (e) { return; }
    }
    const cw = this.el.clientWidth || 1280, ch = this.el.clientHeight || 720, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.el.width !== Math.round(cw * dpr) || this.el.height !== Math.round(ch * dpr)) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(cw, ch, false); }
    this.renderer.render(this.scene, this.camera);
  }
}
