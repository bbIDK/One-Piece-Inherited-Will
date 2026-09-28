// Upright camera-facing sprites: the fallback for anything that has no 3D
// model yet. Characters are redrawn every frame from the 2D anime renderer
// (turned to show the side that faces the camera); props use cached sprites.
import * as THREE from 'three';
import { treeSprite, rockSprite, bushSprite, drawProp, propHeight, drawTreeFruit } from '../render/sprites.js';
import { fruitOf, fruitSpots, isPicked, FRUIT_COLORS } from '../world/fruitTrees.js';

const PPU_ACTOR = 64; // texture pixels per tile for characters
const PPU_PROP = 48;

// ------------------------------------------------------------- materials
const matCache = new Map();
function spriteMaterial(key, canvas) {
  let m = matCache.get(key);
  if (m) return m;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.35, side: THREE.DoubleSide, fog: true });
  m.userData.tint = true;
  matCache.set(key, m);
  return m;
}

/** Tint every sprite material with the scene's ambient light (sprites are unlit). */
export function tintSprites(r, g, b) {
  for (const m of matCache.values()) m.color.setRGB(r, g, b);
}

// ---------------------------------------------------------------- props
/** A cached canvas sprite for a static world object, or null. */
export function propSprite(o, worldId, day) {
  if (o.kind === 'tree') {
    const s = treeSprite(o.sub, o.v || 0);
    const fr = fruitOf(o);
    if (fr && !isPicked(worldId, o, day)) {
      // a copy of the tree with its fruit hanging on it
      const key = `tree:${o.sub}:${o.v || 0}:${fr}`;
      let f = propCanvasCache.get(key);
      if (!f) {
        const c = document.createElement('canvas');
        c.width = s.canvas.width; c.height = s.canvas.height;
        const g = c.getContext('2d');
        g.drawImage(s.canvas, 0, 0);
        const ppu = c.width / s.w;
        g.setTransform(ppu, 0, 0, ppu, s.ax * ppu, s.ay * ppu);
        drawTreeFruit(g, o, fr, fruitSpots(o), FRUIT_COLORS[fr]);
        f = { key, canvas: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
        propCanvasCache.set(key, f);
      }
      return f;
    }
    return { key: `tree:${o.sub}:${o.v || 0}`, canvas: s.canvas, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
  }
  if (o.kind === 'rock') { const s = rockSprite(o.v || 0); return { key: `rock:${o.v || 0}`, canvas: s.canvas, w: s.w, h: s.h, ax: s.ax, ay: s.ay }; }
  if (o.kind === 'bush') { const s = bushSprite(o.sub || 'bush', o.v || 0); return { key: `bush:${o.sub}:${o.v || 0}`, canvas: s.canvas, w: s.w, h: s.h, ax: s.ax, ay: s.ay }; }
  if (o.kind === 'building' || o.kind === 'chestOpen') return null;
  const key = `prop:${o.kind}:${o.sub || ''}:${o.v || 0}:${o.opened ? 1 : 0}`;
  let s = propCanvasCache.get(key);
  if (s) return s;
  const hTiles = Math.max(1.6, propHeight(o) + 0.8);
  const wTiles = Math.max(2, (o.fw || 1) + 1.4, hTiles * 0.8);
  const c = document.createElement('canvas');
  c.width = Math.ceil(wTiles * PPU_PROP); c.height = Math.ceil(hTiles * PPU_PROP);
  const g = c.getContext('2d');
  g.setTransform(PPU_PROP, 0, 0, PPU_PROP, c.width / 2, c.height - 0.4 * PPU_PROP);
  try { drawProp(g, { ...o, x: 0, y: 0 }, 1, false); } catch { /* unknown kind */ }
  s = { key, canvas: c, w: wTiles, h: hTiles, ax: wTiles / 2, ay: hTiles - 0.4 };
  propCanvasCache.set(key, s);
  return s;
}
const propCanvasCache = new Map();

const PLANE = new THREE.PlaneGeometry(1, 1);
PLANE.translate(0, 0.5, 0);

/**
 * Instanced upright sprites for many static props (trees, rocks, bushes…).
 * Rebuilt when the set of nearby props changes; re-aimed at the camera every
 * frame (turning around the vertical axis only).
 */
export class SpriteForest {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.batches = new Map(); // key → { mesh, items: [] }
    this.fruit = new THREE.Group();
    this.group.add(this.fruit);
    this.dummy = new THREE.Object3D();
  }

  clear() {
    for (const b of this.batches.values()) { this.group.remove(b.mesh); b.mesh.dispose(); }
    this.batches.clear();
  }

  /** items: [{ o, sprite, x, y (relative), h (ground) }] */
  rebuild(items) {
    this.clear();
    const byKey = new Map();
    for (const it of items) {
      let arr = byKey.get(it.sprite.key);
      if (!arr) byKey.set(it.sprite.key, (arr = []));
      arr.push(it);
    }
    for (const [key, list] of byKey) {
      const s = list[0].sprite;
      const mesh = new THREE.InstancedMesh(PLANE, spriteMaterial(key, s.canvas), list.length);
      mesh.frustumCulled = false;
      this.batches.set(key, { mesh, items: list, sprite: s });
      this.group.add(mesh);
    }
  }

  /** Face every instance towards the camera (items hold positions relative to the group). */
  aim(camYaw3) {
    const d = this.dummy;
    for (const b of this.batches.values()) {
      const s = b.sprite;
      let i = 0;
      for (const it of b.items) {
        const sc = it.o.s || 1;
        // the sprite's foot point sits (h - ay) tiles above its bottom edge
        d.position.set(it.rx, it.h - 0.05 - (s.h - s.ay) * sc, it.rz);
        d.rotation.set(0, camYaw3, 0);
        d.scale.set(s.w * sc, s.h * sc, 1);
        d.updateMatrix();
        b.mesh.setMatrixAt(i++, d.matrix);
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------ characters
/**
 * A per-actor canvas sprite, redrawn from the 2D renderer with the actor
 * turned to show the side that faces the camera.
 */
export class ActorSprite {
  constructor(actor) {
    const s = actor.look?.scale || 1;
    const big = actor.r > 1 || actor.look?.race === 'seaking';
    this.wT = (big ? 7 : 2.6) * Math.max(1, s);
    this.hT = (big ? 5 : 3.2) * Math.max(1, s);
    this.foot = 0.35;
    const c = document.createElement('canvas');
    c.width = Math.ceil(this.wT * PPU_ACTOR);
    c.height = Math.ceil(this.hT * PPU_ACTOR);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.3, side: THREE.DoubleSide, fog: true });
    const geo = new THREE.PlaneGeometry(this.wT, this.hT);
    geo.translate(0, this.hT / 2 - this.foot, 0);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.lastDraw = -1;
  }

  draw(actor, env, camYaw) {
    const g = this.ctx, c = this.canvas;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(PPU_ACTOR, 0, 0, PPU_ACTOR, c.width / 2, c.height - this.foot * PPU_ACTOR);
    // show the side of the actor that faces the camera
    const f = actor.facing;
    actor.facing = f - camYaw - Math.PI / 2;
    try {
      if (actor.draw) actor.draw(g, env);
    } catch { /* keep going */ }
    actor.facing = f;
    this.tex.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.tex.dispose(); }
}

/** A simple glowing projectile — or a cannonball: a round of black iron, catching the light. */
export function projectileMesh(p) {
  if (p.sprite === 'cannonball') {
    const r = p.ownerShip ? 0.13 : Math.max(0.16, Math.min(0.6, (p.radius || 0.3) * 0.8));
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshToonMaterial({ color: '#2a2a2e', fog: true }));
    m.castShadow = true;
    return m;
  }
  const col = new THREE.Color(p.color || '#ffffff');
  const r = Math.max(0.12, Math.min(0.8, (p.radius || 0.3) * 0.8));
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: col, fog: true }));
  return m;
}

export { drawTreeFruit, fruitOf, fruitSpots, isPicked, FRUIT_COLORS };
