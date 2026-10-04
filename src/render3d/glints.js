// The glint of a Devil Fruit hanging in a tree: a four-pointed star of light
// on it that twinkles every couple of seconds, tinted the fruit's colour — the
// way a treasure catches the eye in a game, from across the clearing. It's
// drawn a size you can see far off (out to some 90 m; close by, a hand's
// width) and a little in front of the
// fruit, so the leaves round it don't swallow it; it's gone once picked.
// (about 2 degrees of your view at rest, twice that as it twinkles)
import * as THREE from 'three';
import { fruitPicked } from '../world/fruitTrees.js';

const FAR = 90, NEAR = 3;
let TEX = null;

/** The star: two long thin rays crossed, two short ones between, a soft hot core. */
function starTexture() {
  if (TEX) return TEX;
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), m = n / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.12, 'rgba(255,255,255,0.85)');
  glow.addColorStop(0.35, 'rgba(255,255,255,0.18)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, n, n);
  const ray = (ang, len, w) => {
    g.save(); g.translate(m, m); g.rotate(ang);
    const r = g.createLinearGradient(0, -len, 0, len);
    r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.beginPath(); g.moveTo(0, -len); g.lineTo(w, 0); g.lineTo(0, len); g.lineTo(-w, 0); g.closePath(); g.fill();
    g.restore();
  };
  ray(0, m * 0.98, n * 0.035); ray(Math.PI / 2, m * 0.98, n * 0.035);
  ray(Math.PI / 4, m * 0.5, n * 0.025); ray(-Math.PI / 4, m * 0.5, n * 0.025);
  TEX = new THREE.CanvasTexture(c);
  TEX.colorSpace = THREE.SRGBColorSpace;
  return TEX;
}

export class Glints {
  constructor(view) {
    this.view = view;
    this.group = new THREE.Group();
    this.group.name = 'devil-fruit-glints';
    view.scene.add(this.group);
    this.pool = [];
    this.list = [];
    this.scanT = 0;
  }

  /** The trees with a Devil Fruit still on them, among those built round you (looked for twice a second). */
  scan(game) {
    const v = this.view, w = game.world, p = game.player, out = [];
    for (const o of v.built.keys()) {
      if (!(o._devil >= 0) || !o._fruitPts) continue;
      if (w.distance(o.x, o.y, p.x, p.y) > FAR + 10) continue;
      out.push(o);
    }
    this.list = out;
  }

  update(game, cam) {
    const v = this.view, w = game.world, p = game.player, env = game.env;
    if (!w || !p || !cam) { this.group.visible = false; return; }
    if ((this.scanT -= 1 / 60) <= 0) { this.scanT = 0.5; this.scan(game); }
    const t = env.time || 0, day = env.day, dark = 1 - Math.min(1, Math.max(0, env.daylight ?? 1));
    let k = 0;
    for (const o of this.list) {
      const i = o._devil;
      if (!(i >= 0) || fruitPicked(w.id, o, i, day)) continue;
      const [px, py, pz] = o._fruitPts[i];
      const s = o.s || 1, cy = Math.cos(o._yaw || 0), sy = Math.sin(o._yaw || 0);
      const fx = o.x + (px * cy + pz * sy) * s, fy = o.y + (-px * sy + pz * cy) * s, fh = (o._gy || 0) + py * s;
      const sx = w.dx(v.ox, fx), sz = fy - v.oy;
      const dx = sx - cam.position.x, dh = fh - cam.position.y, dz = sz - cam.position.z, d = Math.hypot(dx, dh, dz);
      if (d > FAR || d < 0.6) continue;
      let sp = this.pool[k];
      if (!sp) {
        sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        sp.renderOrder = 5;
        this.group.add(sp);
        this.pool[k] = sp;
      }
      k++;
      // (a twinkle every couple of seconds, each fruit on its own beat; a faint
      // steady glow between them; brighter in the dusk)
      const ph = ((t + (o.x * 0.37 + o.y * 0.61) % 2.3) % 2.3) / 2.3;
      const tw = Math.exp(-Math.pow((ph - 0.12) / 0.045, 2));
      const fade = Math.min(1, (FAR - d) / 20) * Math.min(1, (d - 0.6) / (NEAR - 0.6));
      const size = Math.max(0.5, d * 0.034) * (0.7 + 0.9 * tw);
      // (a little toward you, clear of the leaves round it)
      const back = Math.min(0.35, d * 0.05) / d;
      sp.position.set(sx - dx * back, fh - dh * back, sz - dz * back);
      sp.scale.set(size, size, 1);
      const m = sp.material;
      m.rotation = tw * 0.6 + o.x * 0.1;
      m.opacity = Math.min(1, fade * (0.6 + 0.4 * tw) * (0.9 + 0.3 * dark));
      m.color.set(o._devilColor || '#fff6c8').lerp(WHITE, 0.55);
      // (seen through leaves — another tree's crown in the way, its own —
      // but not through a house or a hillside: looked along the line to it
      // a few times a second)
      if (!sp.userData.t || t - sp.userData.t > 0.25 || sp.userData.o !== o) {
        sp.userData.t = t; sp.userData.o = o;
        m.depthTest = !this.clearLine(game, cam, fx, fy, fh, d, o);
      }
      sp.visible = true;
    }
    for (let j = k; j < this.pool.length; j++) this.pool[j].visible = false;
    this.group.visible = k > 0;
  }

  /** Nothing solid between the camera and (fx, fy, fh): no building, no wall, no rise of the ground. */
  clearLine(game, cam, fx, fy, fh, d, o) {
    const v = this.view, w = game.world;
    const cx = v.ox + cam.position.x, cy = v.oy + cam.position.z, ch = cam.position.y;
    const n = Math.max(4, Math.min(24, Math.ceil(d / 2.5)));
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const x = cx + w.dx(cx, fx) * k, y = cy + (fy - cy) * k, h = ch + (fh - ch) * k;
      if (w.distance(x, y, o.x, o.y) < 3.5 * (o.s || 1)) break; // (the tree's own trunk and crown)
      if (w.interiorAt?.(x, y) || w.isBlocked(x, y)) return false;
      if (v.ground && v.ground(x, y) > h - 0.1) return false;
    }
    return true;
  }

  clear() { this.list = []; for (const sp of this.pool) sp.visible = false; }
}
const WHITE = new THREE.Color(1, 1, 1);
