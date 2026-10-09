// The chart as a globe (M): the whole Blue Planet as the ball it is — the
// chart is its surface, east–west round the equator and north–south pole to
// pole — turning under your hand, lit by the sun, with a pin where you are
// (and your ship). Drag to turn it, the wheel to come in closer.
//
// Its picture of the world is painted once per world from the tiles
// themselves (the colour of each kind of ground; the sea shaded by its depth
// near the coasts), onto a canvas laid round the sphere.
import * as THREE from 'three';
import { W, H, RM_X, MG_X, RL_HALF, POLAR } from '../world/constants.js';
import { IS_LIQUID, PALETTE, T } from '../world/tiles.js';

const TEX_W = 4096, TEX_H = 2048; // (about 6 m of the world to a pixel)
const GLOBE_MIN = 1.3; // (closest the camera comes: a sea's width across the view)
const PAINT_MS = 12; // (painted a piece at a time, a few milliseconds a frame: the globe opens at once and fills in)

const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const latOf = (y) => (0.5 - Math.max(0, Math.min(1, y / H))) * Math.PI;
/** How much a degree of longitude shrinks at the latitude of chart row y (never quite to nothing). */
const shrink = (y) => Math.max(0.06, Math.cos(latOf(y)));

/*
 * True to shape. The game's world is a flat chart that wraps east–west: every
 * row is W metres round, at the equator and up by the poles alike. On a ball
 * the circle of latitude shrinks with cos(latitude), so a chart laid straight
 * round a globe squeezes everything east–west the further it is from the
 * equator (by 30% at the Blues' latitude). So the globe isn't the chart
 * stretched round it: each island (and the Red Line) is drawn at its own
 * place, at its true size and shape — the ground about its middle widened
 * by 1/cos(latitude) on the picture, which the ball's curve takes back in —
 * on the open sea between, where there's nothing to squeeze.
 */

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

/** Where on the globe's picture a chart point (x, y) is drawn (texture u in 0..1): about the middle of the island it's on or by. */
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
const wrapDx = (a, b) => { let d = b - a; d -= W * Math.round(d / W); return d; };

/** Where on the unit sphere a picture point (u, v) lies — as three.js's SphereGeometry lays its uv. */
export function uvToSphere(u, v, r = 1, out = new THREE.Vector3()) {
  const phi = u * Math.PI * 2, theta = Math.max(0, Math.min(1, v)) * Math.PI;
  return out.set(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

/**
 * The world's surface, painted from its tiles a feature at a time (step()
 * within a few milliseconds' budget): { canvas, anchors, step(), done }.
 */
function painter(world) {
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');
  // the open sea, and the pack ice round the poles
  g.fillStyle = '#184a8c'; g.fillRect(0, 0, TEX_W, TEX_H);
  const cap = Math.round(POLAR / H * TEX_H);
  g.fillStyle = '#e8f1f6'; g.fillRect(0, 0, TEX_W, cap); g.fillRect(0, TEX_H - cap, TEX_W, cap);
  const COL = [];
  for (let t = 0; t < 256; t++) COL[t] = hexRGB((PALETTE[t] || ['#8a8a8a'])[0]);
  const deep = [24, 74, 140], shallow = [58, 150, 196];
  const anchors = anchorsOf(world);
  const P = { canvas: c, anchors, done: false };
  let ai = 0, row = -1, A = null, img = null, rx0 = 0, rw = 0;
  const pxW = W / TEX_W, pxH = H / TEX_H;
  P.step = () => {
    const t0 = performance.now();
    while (performance.now() - t0 < PAINT_MS) {
      if (!A) {
        if (ai >= anchors.length) { P.done = true; return; }
        A = anchors[ai++];
        row = Math.max(0, Math.floor(A.y0 / pxH));
      }
      const j = row, y = (j + 0.5) * pxH;
      if (j >= TEX_H || y > A.y1) { A = null; continue; }
      // (this row of the feature, widened by 1/cos(latitude) about its middle)
      const half = (A.x1 - A.x0) / 2 / shrink(y);
      const uc = A.xc / pxW;
      rx0 = Math.floor(uc - half / pxW); rw = Math.ceil(half * 2 / pxW) + 2;
      if (rw > TEX_W) { rx0 = 0; rw = TEX_W; }
      img = g.getImageData(0, j, TEX_W, 1);
      const d = img.data, s = shrink(y);
      for (let i = 0; i < rw; i++) {
        const u = rx0 + i, x = A.xc + ((u + 0.5) - uc) * pxW * s;
        if (wrapDx(A.xc, x) < A.x0 - A.xc || wrapDx(A.xc, x) > A.x1 - A.xc) continue;
        const wx = ((x % W) + W) % W, t = world.type(wx, y);
        let r, gg, b;
        if (IS_LIQUID[t] === 1 && t !== T.LAVA) {
          // (shoaling water near the coast; the deep sea's left as it is)
          const sd = world.sd ? world.sd(wx, y) : -40;
          if (sd < -24) continue;
          const k = Math.max(0, Math.min(1, 1 + sd / 24));
          r = deep[0] + (shallow[0] - deep[0]) * k; gg = deep[1] + (shallow[1] - deep[1]) * k; b = deep[2] + (shallow[2] - deep[2]) * k;
        } else [r, gg, b] = COL[t];
        const k4 = ((((u % TEX_W) + TEX_W) % TEX_W)) * 4;
        d[k4] = r; d[k4 + 1] = gg; d[k4 + 2] = b; d[k4 + 3] = 255;
      }
      g.putImageData(img, 0, j);
      row++;
    }
  };
  return P;
}

export class GlobeView {
  constructor(parent) {
    this.el = document.createElement('canvas');
    Object.assign(this.el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none', background: 'radial-gradient(ellipse at 50% 45%, #1d2f4f 0%, #0b1324 70%, #060a14 100%)' });
    parent.prepend(this.el);
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.dist = 4.2;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.position.set(-3, 2, 4);
    this.scene.add(this.sun);
    this.spin = new THREE.Group(); // turned by dragging
    this.scene.add(this.spin);
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.spin.add(this.globe);
    // a thin haze of atmosphere round the rim
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 48), new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(halo);
    // the pins: you, and your ship
    const pin = (col) => {
      const gp = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshBasicMaterial({ color: col }));
      head.position.y = 0.07;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 6), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      stem.position.y = 0.035;
      gp.add(head, stem);
      this.spin.add(gp);
      return gp;
    };
    this.youPin = pin(0xe53935);
    this.shipPin = pin(0xf1c40f);
    this.worldId = null;
    this.yaw = 0; this.tilt = 0;
  }

  /** The picture of world `w` (started painting if it's new). */
  prepare(w) {
    if (this.worldId !== w.id) {
      this.worldId = w.id;
      this.paint = painter(w);
      const tex = new THREE.CanvasTexture(this.paint.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      this.globe.material.map?.dispose();
      this.globe.material.map = tex;
      this.globe.material.needsUpdate = true;
    }
  }

  /** Point (x, y) on the chart toward the viewer, north up. */
  face(x, y) {
    this.yaw = Math.PI / 2 - globeU(x, y, this.paint?.anchors) * Math.PI * 2;
    this.tilt = (0.5 - Math.max(0, Math.min(1, y / H))) * Math.PI;
  }

  drag(dx, dy) {
    this.yaw += dx * 0.006 * (this.dist / 4.2);
    this.tilt = Math.max(-1.45, Math.min(1.45, this.tilt + dy * 0.006 * (this.dist / 4.2)));
  }

  /** Come closer (f > 1) or back. False once it's as close as the globe goes (the chart takes over from there). */
  zoom(f) {
    if (f > 1 && this.dist <= GLOBE_MIN + 1e-6) return false;
    this.dist = Math.max(GLOBE_MIN, Math.min(7, this.dist / f));
    return true;
  }

  /** The chart point at the middle of the view (where the flat chart opens, zooming in past the globe). */
  centre() {
    const u = (((Math.PI / 2 - this.yaw) / (Math.PI * 2)) % 1 + 1) % 1, v = 0.5 - this.tilt / Math.PI;
    const y = Math.max(0, Math.min(1, v)) * H;
    let x = u * W;
    // (inside an island's widened picture: back to where on the island that is)
    for (const A of this.paint?.anchors || []) {
      if (A.band || y < A.y0 || y > A.y1) continue;
      const du = wrapDx(A.xc, x), half = (A.x1 - A.x0) / 2 / shrink(y);
      if (Math.abs(du) <= half) { x = A.xc + du * shrink(y); break; }
    }
    return { x: ((x % W) + W) % W, y };
  }

  show(on) { this.el.style.display = on ? 'block' : 'none'; }

  placePin(p, x, y) {
    if (x == null) { p.visible = false; return; }
    p.visible = true;
    const v = uvToSphere(globeU(x, y, this.paint?.anchors), y / H, 1);
    p.position.copy(v);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    // (the same size on the screen however close you've come)
    p.scale.setScalar(Math.max(0.05, Math.min(1, (this.dist - 1) / 3.2)));
  }

  render(game) {
    if (!this.renderer) {
      try { this.renderer = new THREE.WebGLRenderer({ canvas: this.el, antialias: true, alpha: true }); this.renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (e) { return; }
    }
    this.prepare(game.surface || game.world);
    if (this.paint && !this.paint.done) { this.paint.step(); this.globe.material.map.needsUpdate = true; }
    const cw = this.el.clientWidth || 1280, ch = this.el.clientHeight || 720, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.el.width !== Math.round(cw * dpr) || this.el.height !== Math.round(ch * dpr)) { this.renderer.setPixelRatio(dpr); this.renderer.setSize(cw, ch, false); }
    this.camera.aspect = cw / ch; this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, this.dist); this.camera.lookAt(0, 0, 0);
    this.spin.rotation.set(0, 0, 0);
    this.spin.rotateX(this.tilt);
    this.spin.rotateY(this.yaw);
    const p = game.player, onSurface = game.world === game.surface;
    this.placePin(this.youPin, onSurface ? p.x : null, p.y);
    const s = game.ships?.find((o) => !o.sunk && o.owner === 'player' && o !== p.ship);
    this.placePin(this.shipPin, s && onSurface ? s.x : null, s?.y);
    this.renderer.render(this.scene, this.camera);
  }
}
