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
import { shipBob, pitchRise, rowLean } from '../world/hull.js';
import { waterLevel } from './height.js';

const TAU = Math.PI * 2;

export class CameraRig {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 2600);
    this.camera.rotation.order = 'YXZ';
    this.mode = 'first'; // 'first' | 'third'
    this.shiftLock = false; // third person: Roblox-style shift lock (tap Ctrl)
    this.yaw = 0; // world facing angle (same convention as actor.facing: atan2(dy, dx), y = south)
    this.pitch = 0;
    this.locked = false;
    this.lockFails = 0; // pointer lock requests refused in a row (see lockFailed)
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
      if (!this.active) return;
      // free-mouse third person: hold the right button to turn the camera
      if (this.drag) {
        this.drag.moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
        this.turn(e.movementX || 0, e.movementY || 0);
        return;
      }
      if (!this.locked) return;
      this.turn(e.movementX || 0, e.movementY || 0);
    };
    document.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active || this.game.ui?.blocksInput()) return;
      if (this.freeMouse) {
        // (the left button attacks; the right button turns the camera while held —
        // a quick right-click without dragging is still a heavy attack)
        if (e.button === 2) this.drag = { t: performance.now(), moved: 0 };
        return;
      }
      // first person / shift lock: the first click captures the mouse (and is not an
      // attack). A refusal (browsers refuse for a moment after you let the mouse go)
      // just means trying again on the next click; only a page that never allows it
      // falls back to turning at the screen edges (and clicks attack there).
      if (this.locked) return;
      if (!this.lockFailed) { e.stopPropagation(); e.preventDefault(); }
      this.requestLock();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2 && this.drag) { this.lastDrag = { ...this.drag, end: performance.now() }; this.drag = null; }
    });
    // the mouse wheel pulls the third-person camera in and out
    canvas.addEventListener('wheel', (e) => {
      if (!this.active || this.mode !== 'third') return;
      this.tp.dist = Math.max(2.2, Math.min(9, this.tp.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.lockFails = 0;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.lockRefused());
  }

  lockRefused() {
    // (one refusal can arrive twice: as the error event and as the request's promise)
    const now = performance.now();
    if (now - (this.refusedAt || -1e9) < 250) return;
    this.refusedAt = now;
    this.lockFails++;
    this.locked = false;
    this.onLockChange?.(false);
    if (this.lockFails === 3) this.game.ui?.hint?.('Mouse look is limited in this window: move the cursor to the screen edges (or use the arrow keys) to turn. Opening the game in its own tab gives full mouse look.', 10);
  }

  /** The page won't let the mouse be captured (several refusals in a row): edge turning instead. */
  get lockFailed() { return this.lockFails >= 3; }

  get active() { return !!this.game.view3d?.active; }

  /** Third person without shift lock: the cursor is free (attacks aim at it). */
  get freeMouse() { return this.mode === 'third' && !this.shiftLock && !this.game.input?.touch?.on; }

  /** Roblox-style shift lock: mouse captured, character faces the camera, crosshair, over-the-shoulder view. */
  setShiftLock(on) {
    this.shiftLock = !!on;
    if (this.game.settings) this.game.settings.shiftLock = this.shiftLock;
    if (this.mode !== 'third') return;
    if (this.shiftLock) this.requestLock(); else this.releaseLock();
  }

  /** A right-click that didn't turn the camera (free mouse): heavy attack. */
  takeRightClick() {
    const d = this.lastDrag;
    this.lastDrag = null;
    return !!d && d.moved < 10 && d.end - d.t < 350;
  }

  requestLock() {
    if (this.locked) return;
    try {
      const r = this.canvas.requestPointerLock?.({ unadjustedMovement: false });
      if (r && typeof r.catch === 'function') r.catch(() => this.lockRefused());
    } catch {
      this.lockRefused();
    }
  }

  /** Does the view want the mouse captured now (first person, or third person with shift lock)? */
  get wantsLock() { return this.active && !this.freeMouse && !this.game.input?.touch?.on; }

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
    if (!this.locked && !this.drag && !game.ui?.blocksInput()) {
      let t = 0, l = 0;
      if (inp.isDown('ArrowLeft')) t -= 1;
      if (inp.isDown('ArrowRight')) t += 1;
      if (inp.isDown('ArrowUp')) l += 1;
      if (inp.isDown('ArrowDown')) l -= 1;
      if (this.lockFailed && !inp.touch?.on && !this.freeMouse) {
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
    const time = game.env?.time || 0;
    let eyeH = 1.72 * scale;
    let gx = 0, gz = 0; // eye position relative to the player (origin)
    // where your feet are: on a deck, on the ground (or the bottom of the shallows), in the air
    let gh = p.flying && p.alt != null ? p.alt
      : p.deck ? p.deck.h + shipBob(p.deck.ship, time) + pitchRise(p.deck.ship, (p.deck.t - 0.5) * p.deck.ship.def.length) + (p.z || 0)
        : ground(p.x, p.y) - (p.wading || 0) + (p.z || 0);
    let rollSea = 0;
    if (!sailing) this.seaPitch = 0;
    if (sailing) {
      // standing at the helm on the stern deck (your own rigging turns
      // see-through) or sitting at a rowboat's oars, rising and rolling
      // gently with the ship
      const s = p.ship;
      const hp = helmPoint(s.def);
      // (from her middle: where you are while you've her helm)
      const shipX = game.world ? game.world.dx(p.x, s.x) : 0, shipZ = s.y - p.y;
      gx = shipX + Math.cos(s.heading) * hp.x; gz = shipZ + Math.sin(s.heading) * hp.x;
      const t = time + (s.seed || 0);
      gh = (s.lvl || 0) + 0.05 + hp.floor + Math.sin(t * 1.3) * 0.07 + pitchRise(s, hp.x);
      eyeH = hp.eye - hp.floor + (hp.seated ? 0 : 0.15);
      if (hp.seated && s.oars) {
        // (the rower's head goes with the stroke: forward and down into the drive, back on the recovery)
        const lean = rowLean(s);
        gx += Math.cos(s.heading) * Math.sin(lean) * 0.7; gz += Math.sin(s.heading) * Math.sin(lean) * 0.7;
        eyeH -= (1 - Math.cos(lean)) * 0.7;
      }
      rollSea = Math.sin(t * 0.9) * 0.03 * Math.cos(this.yaw - s.heading);
      // (feel the climb up Reverse Mountain: the view tips with the deck)
      this.seaPitch = (s.pitch || 0) * Math.cos(this.yaw - s.heading);
    } else if (p.inWater) {
      // the head just out of the water — or under it, diving (never through the sea floor)
      gh = waterLevel(game.world, p.x, p.y) - (p.depth || 0) - 0.2; eyeH = 0.55;
      const floor = game.seaDepth ? -game.seaDepth(p.x, p.y) : -99;
      if (gh + eyeH < floor + 0.3) gh = floor + 0.3 - eyeH;
    }
    if (p.state === 'knocked') eyeH = 0.45;
    // The view glides between heights: over steps and bumps, wading out into a
    // swim and back, climbing out onto a pier or aboard a deck, getting knocked
    // down. Jumps, falls and climbs are followed as they happen (they're smooth
    // already) — only a sudden change mid-air (a state switch) is eased.
    const eye = gh + eyeH;
    const air = !sailing && !p.inWater && ((p.z || 0) > 0.05 || !!p.vz || !!p.climb);
    if (this.eyeLast === undefined || Math.abs(eye - this.eyeLast) > 4 || p.mode !== this.lastMode || sailing) this.eyeOff = 0;
    else if (!air || Math.abs(eye - this.eyeLast) > Math.abs(p.vz || 0) * dt * 2 + 0.15) this.eyeOff -= eye - this.eyeLast;
    this.eyeLast = eye;
    this.lastMode = p.mode;
    this.eyeOff *= Math.exp(-dt * 14);
    gh += this.eyeOff;
    // a small dip when you land from a jump or a fall
    if (!sailing && this.lastZ > 0.3 && !(p.z > 0)) this.dip = Math.min(0.22, 0.05 + this.lastZ * 0.12);
    this.lastZ = p.z || 0;
    this.dip = (this.dip || 0) * Math.max(0, 1 - dt * 7);
    gh -= this.dip;
    this.footY = gh;
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
    if (p.state === 'knocked') roll = 0.35;
    // crouching to spring for a charged jump
    this.crouch = (this.crouch || 0) + ((p.charging || 0) - (this.crouch || 0)) * Math.min(1, dt * 12);
    eyeH -= this.crouch * 0.34 * scale;
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
      // shift lock looks over the right shoulder
      this.shoulder = (this.shoulder || 0) + ((this.shiftLock ? 0.7 : 0) - (this.shoulder || 0)) * Math.min(1, dt * 8);
      cx += -fz * this.shoulder; cz += fx * this.shoulder;
      const w = game.world;
      const room = w?.interiorAt?.(p.x, p.y);
      if (room) {
        // indoors: keep the camera inside the room, under the ceiling
        const r = interiorRect(room);
        cx = Math.max(r.x0 + 0.25, Math.min(r.x1 - 0.25, p.x + cx)) - p.x;
        cz = Math.max(r.y0 + 0.25, Math.min(r.y1 - 0.25, p.y + cz)) - p.y;
        cy = Math.min(cy, ground(p.x, p.y) + heightsOf(room).ceil - 0.3);
      } else if (w) {
        // outdoors: pull in rather than end up inside a building (or a ship's cabins and hull)
        const ey = gh + eyeH * 0.9, ships = game.ships?.length && game.shipSolidAt;
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          const bx = p.x + cx * t, bz = p.y + cz * t;
          if (w.isBlocked(bx, bz) || (ships && game.shipSolidAt(bx, bz, ey + (cy - ey) * t))) {
            const k = Math.max(0.12, t - 0.16); cx *= k; cz *= k;
            if (ships) cy = ey + (cy - ey) * k;
            break;
          }
        }
      }
      if (p.inWater && p.under) {
        // follow a diver down: under the surface, over the sea floor
        const floor = game.seaDepth ? -game.seaDepth(p.x + cx, p.y + cz) : -99;
        cy = Math.max(floor + 0.4, Math.min(cy, -0.35));
      } else {
        // keep the camera above the ground
        const under = ground(p.x + cx, p.y + cz) + 0.4;
        if (cy < under) cy = under;
      }
      cam.position.set(cx, cy, cz);
      cam.rotation.set(this.pitch * 0.8 - 0.12 + this.shake.y, yaw3 + this.shake.x, 0);
    } else {
      cam.position.set(gx + Math.cos(this.yaw + Math.PI / 2) * bobX, gh + eyeH + bobY, gz + Math.sin(this.yaw + Math.PI / 2) * bobX);
      cam.rotation.set(this.pitch + this.shake.y + (sailing ? this.seaPitch || 0 : 0), yaw3 + this.shake.x, this.roll + rollSea);
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
    const p = game.player, w = game.world;
    // with the camera under the sea, the surface is no floor (the sea bed is)
    const diving = o.y < -0.05 && game.seaDepth;
    const floor = (x, y) => {
      const g = ground(x, y);
      return diving && g < 0.1 && w.isLiquid(x, y) ? -game.seaDepth(x, y) : g;
    };
    let hit = null;
    // start level with the player: in third person nothing between the camera
    // and them counts (or you'd turn round to face the camera)
    let t = Math.max(0.5, -o.x * d.x + ((this.footY ?? o.y) + 1 - o.y) * d.y - o.z * d.z - 0.3);
    for (let i = 0; i < 160 && t < 90; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const g = floor(p.x + x, p.y + z);
      if (y <= g) { hit = [p.x + x, p.y + z]; break; }
      t += 0.35 + t * 0.04;
    }
    if (!hit) {
      // nothing under the ray: a point straight ahead along the view
      const l = Math.hypot(d.x, d.z) || 1;
      hit = [p.x + d.x / l * 30, p.y + d.z / l * 30];
    } else if (this.mode === 'third' && Math.hypot(hit[0] - p.x, hit[1] - p.y) < 2.5) {
      // looking down at your own feet over the shoulder: straight ahead of the camera
      hit = [p.x + Math.cos(this.yaw) * 2.5, p.y + Math.sin(this.yaw) * 2.5];
    }
    const res = [game.world.wx(hit[0]), hit[1]];
    if (sx === undefined) this.aimCache = res;
    return res;
  }
}
