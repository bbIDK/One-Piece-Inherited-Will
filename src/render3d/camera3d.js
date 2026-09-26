// First- and third-person camera with mouse look.
//  * Click the game to capture the mouse (pointer lock); Esc releases it.
//  * If the page can't lock the pointer (some embeds), the view turns while
//    the cursor sits near the screen edges, and with the arrow keys.
// The camera works in the renderer's floating-origin space: the player's
// tile position is the origin, so positions are small and the wrap-around
// world just works.
import * as THREE from 'three';
import { interiorRect, heightsOf } from '../world/interiors.js';
import { helmPoint } from './ships3d.js';

const TAU = Math.PI * 2;

export class CameraRig {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 2600);
    this.camera.rotation.order = 'YXZ';
    this.mode = 'first'; // 'first' | 'third'
    this.yaw = 0; // world facing angle (same convention as actor.facing: atan2(dy, dx), y = south)
    this.pitch = 0;
    this.locked = false;
    this.lockFailed = false;
    this.sensitivity = 0.0024;
    this.invertY = false;
    this.baseFov = 75; // settings: 60–95
    this.bobOn = true;
    this.bob = 0;
    this.bobAmp = 0;
    this.roll = 0;
    this.eye = new THREE.Vector3();
    this.tp = { dist: 4.2, height: 1.4 };
    this.shake = new THREE.Vector2();
    this.aimCache = null;
    this.mouse = { x: 0, y: 0 };
    this.hint = null;

    const onMove = (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (!this.locked || !this.active) return;
      this.turn(e.movementX || 0, e.movementY || 0);
    };
    document.addEventListener('mousemove', onMove);
    // the first click on the game captures the mouse (and is not an attack)
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active || this.locked || this.lockFailed) return;
      if (this.game.ui?.blocksInput()) return;
      e.stopPropagation();
      e.preventDefault();
      this.requestLock();
    });
    // the mouse wheel pulls the third-person camera in and out
    canvas.addEventListener('wheel', (e) => {
      if (!this.active || this.mode !== 'third') return;
      this.tp.dist = Math.max(2.2, Math.min(9, this.tp.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      this.locked = false;
      this.onLockChange?.(false);
      this.game.ui?.hint?.('Mouse look is limited in this window: move the cursor to the screen edges (or use the arrow keys) to turn. Opening the game in its own tab gives full mouse look.', 10);
    });
  }

  get active() { return !!this.game.view3d?.active; }

  requestLock() {
    try {
      const r = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (r && typeof r.catch === 'function') r.catch(() => { this.lockFailed = true; this.onLockChange?.(false); });
    } catch {
      this.lockFailed = true;
    }
  }

  releaseLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }

  turn(dx, dy) {
    this.lookBy(dx * this.sensitivity, -dy * this.sensitivity * (this.invertY ? -1 : 1));
  }

  /** Turn by angles (radians): used by mouse look and by touch drags. */
  lookBy(dyaw, dpitch) {
    this.yaw = (((this.yaw + dyaw) % TAU) + TAU) % TAU;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dpitch));
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Forward direction (on the ground plane) in world tile coordinates. */
  forward() { return [Math.cos(this.yaw), Math.sin(this.yaw)]; }

  /**
   * Place the camera for this frame. `ground(x, y)` gives ground heights in
   * world tile coordinates; `p` is the player actor (at the origin).
   */
  update(dt, game, ground) {
    const p = game.player;
    const inp = game.input;
    // edge/arrow turning when the pointer isn't locked
    if (!this.locked && !game.ui?.blocksInput()) {
      let t = 0, l = 0;
      if (inp.isDown('ArrowLeft')) t -= 1;
      if (inp.isDown('ArrowRight')) t += 1;
      if (inp.isDown('ArrowUp')) l += 1;
      if (inp.isDown('ArrowDown')) l -= 1;
      if (this.lockFailed && !inp.touch?.on) {
        const w = window.innerWidth, h = window.innerHeight;
        const ex = (this.mouse.x / w - 0.5) * 2, ey = (this.mouse.y / h - 0.5) * 2;
        if (Math.abs(ex) > 0.55) t += Math.sign(ex) * (Math.abs(ex) - 0.55) / 0.45 * 1.6;
        if (Math.abs(ey) > 0.6) l -= Math.sign(ey) * (Math.abs(ey) - 0.6) / 0.4 * 1.0;
      }
      this.yaw = (((this.yaw + t * 2.4 * dt) % TAU) + TAU) % TAU;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + l * 1.4 * dt));
    }
    const cam = this.camera;
    const sailing = p.mode === 'sail' && p.ship;
    const scale = p.look?.scale || 1;
    let eyeH = 1.72 * scale;
    let gx = 0, gz = 0; // eye position relative to the player (origin)
    // the ground under your feet, smoothed so bumps and steps don't jolt the view
    const g0 = ground(p.x, p.y);
    if (this.smoothG === undefined || Math.abs(g0 - this.smoothG) > 2.5 || p.mode !== this.lastMode) this.smoothG = g0;
    this.smoothG += (g0 - this.smoothG) * Math.min(1, dt * 14);
    this.lastMode = p.mode;
    let gh = this.smoothG + (p.z || 0);
    let rollSea = 0;
    if (sailing) {
      // standing at the helm on the stern deck (your own rigging turns
      // see-through), rising and rolling gently with the ship
      const s = p.ship;
      const hp = helmPoint(s.def);
      gx = Math.cos(s.heading) * hp.x; gz = Math.sin(s.heading) * hp.x;
      const t = (game.env?.time || 0) + (s.seed || 0);
      gh = 0.05 + hp.floor + Math.sin(t * 1.3) * 0.07;
      eyeH = hp.eye - hp.floor + 0.15;
      rollSea = Math.sin(t * 0.9) * 0.03 * Math.cos(this.yaw - s.heading);
    } else if (p.inWater) {
      gh = -0.2; eyeH = 0.55;
    }
    // a small dip when you land from a jump or a fall
    if (!sailing && this.lastZ > 0.3 && !(p.z > 0)) this.dip = Math.min(0.22, 0.05 + this.lastZ * 0.12);
    this.lastZ = p.z || 0;
    this.dip = (this.dip || 0) * Math.max(0, 1 - dt * 7);
    gh -= this.dip;
    // walking bob (faster and deeper when running), a lean into strafes, and
    // a knocked-down camera
    const spd = Math.hypot(p.vx || 0, p.vy || 0);
    const moving = !sailing && !(p.z > 0.05) && (spd > 0.5 || p.moving);
    this.bob += dt * (moving ? 5.5 + Math.min(spd, 9) * 0.9 : 0);
    this.bobAmp += ((moving && this.bobOn ? 0.03 + Math.min(spd, 9) * 0.004 : 0) - this.bobAmp) * Math.min(1, dt * 6);
    const bobY = Math.sin(this.bob) * this.bobAmp;
    const bobX = Math.cos(this.bob * 0.5) * this.bobAmp * 0.6;
    // lateral speed relative to the view: lean a little into it
    const side = !sailing ? ((p.vx || 0) * -Math.sin(this.yaw) + (p.vy || 0) * Math.cos(this.yaw)) : 0;
    let roll = this.bobOn ? -side * 0.006 : 0;
    if (p.state === 'knocked') { eyeH = 0.45; roll = 0.35; }
    this.roll += (roll - this.roll) * Math.min(1, dt * 5);
    // screen shake from the effects system
    const tr = game.fx?.trauma || 0;
    const sh = tr * tr * 0.06;
    this.shake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    const yaw3 = -(this.yaw + Math.PI / 2);
    if (this.mode === 'third' && !sailing) {
      const d = this.tp.dist;
      const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
      const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
      let cx = -fx * d * cp, cz = -fz * d * cp, cy = gh + eyeH * 0.9 + this.tp.height - spch * d * 0.6;
      const w = game.world;
      const room = w?.interiorAt?.(p.x, p.y);
      if (room) {
        // indoors: keep the camera inside the room, under the ceiling
        const r = interiorRect(room);
        cx = Math.max(r.x0 + 0.25, Math.min(r.x1 - 0.25, p.x + cx)) - p.x;
        cz = Math.max(r.y0 + 0.25, Math.min(r.y1 - 0.25, p.y + cz)) - p.y;
        cy = Math.min(cy, ground(p.x, p.y) + heightsOf(room).ceil - 0.3);
      } else if (w) {
        // outdoors: pull in rather than end up inside a building
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          if (w.isBlocked(p.x + cx * t, p.y + cz * t)) { const k = Math.max(0.12, t - 0.16); cx *= k; cz *= k; break; }
        }
      }
      // keep the camera above the ground
      const under = ground(p.x + cx, p.y + cz) + 0.4;
      if (cy < under) cy = under;
      cam.position.set(cx, cy, cz);
      cam.rotation.set(this.pitch * 0.8 - 0.12 + this.shake.y, yaw3 + this.shake.x, 0);
    } else {
      cam.position.set(gx + Math.cos(this.yaw + Math.PI / 2) * bobX, gh + eyeH + bobY, gz + Math.sin(this.yaw + Math.PI / 2) * bobX);
      cam.rotation.set(this.pitch + this.shake.y, yaw3 + this.shake.x, this.roll + rollSea);
    }
    const sprint = !sailing && p.intent?.sprint && moving;
    // a quick widening of the view during dodges and dashes
    const dashing = !!p.dash;
    const fov = this.baseFov + (sprint ? 7 : 0) + (dashing ? 6 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.aimCache = null;
  }

  /**
   * The world point under the crosshair (screen centre), or under the mouse
   * when the pointer is free. Marches the view ray against the ground.
   */
  aimPoint(game, ground, sx, sy) {
    if (this.aimCache && sx === undefined) return this.aimCache;
    const cam = this.camera;
    const ndc = new THREE.Vector2(0, 0);
    if (sx !== undefined) { ndc.set(sx / window.innerWidth * 2 - 1, -(sy / window.innerHeight * 2 - 1)); }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cam);
    const o = ray.ray.origin, d = ray.ray.direction;
    const p = game.player;
    let hit = null;
    let t = 0.5;
    for (let i = 0; i < 160 && t < 90; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const g = ground(p.x + x, p.y + z);
      if (y <= g) { hit = [p.x + x, p.y + z]; break; }
      t += 0.35 + t * 0.04;
    }
    if (!hit) {
      // nothing under the ray: a point straight ahead along the view
      const l = Math.hypot(d.x, d.z) || 1;
      hit = [p.x + d.x / l * 30, p.y + d.z / l * 30];
    }
    const res = [game.world.wx(hit[0]), hit[1]];
    if (sx === undefined) this.aimCache = res;
    return res;
  }
}
