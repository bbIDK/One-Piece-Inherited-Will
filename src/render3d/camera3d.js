// First- and third-person camera with mouse look.
//  * Click the game to capture the mouse (pointer lock); Esc releases it.
//  * If the page can't lock the pointer (some embeds), the view turns while
//    the cursor sits near the screen edges, and with the arrow keys.
// The camera works in the renderer's floating-origin space: the player's
// tile position is the origin, so positions are small and the wrap-around
// world just works.
import * as THREE from 'three';

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
    this.bob = 0;
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
    let eyeH = 1.62 * scale;
    let gx = 0, gz = 0; // eye position relative to the player (origin)
    let gh = ground(p.x, p.y);
    if (sailing) {
      // at the helm on the stern deck, standing tall enough to see past the rigging
      const s = p.ship;
      const back = -s.def.length * 0.42;
      gx = Math.cos(s.heading) * back; gz = Math.sin(s.heading) * back;
      gh = 0.5 + s.def.length * 0.06;
      eyeH = 2.1 + s.def.length * 0.12;
    } else if (p.inWater) {
      gh = -0.2; eyeH = 0.55;
    }
    // walking bob and a knocked-down camera
    const moving = !sailing && (Math.abs(p.vx || 0) + Math.abs(p.vy || 0) > 0.5 || p.moving);
    this.bob += dt * (moving ? 9 : 0);
    let bobY = moving ? Math.sin(this.bob) * 0.045 : 0;
    let roll = 0;
    if (p.state === 'knocked') { eyeH = 0.45; roll = 0.35; }
    this.roll += (roll - this.roll) * Math.min(1, dt * 4);
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
      // keep the camera above the ground
      const under = ground(p.x + cx, p.y + cz) + 0.4;
      if (cy < under) cy = under;
      cam.position.set(cx, cy, cz);
      cam.rotation.set(this.pitch * 0.8 - 0.12 + this.shake.y, yaw3 + this.shake.x, 0);
    } else {
      cam.position.set(gx, gh + eyeH + bobY, gz);
      cam.rotation.set(this.pitch + this.shake.y, yaw3 + this.shake.x, this.roll);
    }
    const sprint = !sailing && p.intent?.sprint;
    const fov = sprint ? 82 : 75;
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
