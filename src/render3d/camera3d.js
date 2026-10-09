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
import { shipBob, shipLift, shipDims, rowLean, deckLift, deckSwing } from '../world/hull.js';
const _dsw = [0, 0];
import { waterLevel } from './height.js';
import { swellAt } from './swell.js';

// how close the wheel brings the third-person camera (any closer and it's first person)
const TP_MIN = 1.1;

const TAU = Math.PI * 2;

// The solid core of a prop the third-person camera won't pass through: its
// collider (world/objects.js COLLIDE: a tree's trunk, not the crown round it)
// — or a circle this wide, where the model reaches well past that (a boulder,
// a statue's plinth) — up to this height: [height, radius?] in metres, times
// its scale (trees' heights by species). Crowns, bushes and the like it may
// go into: those fade instead (see Renderer3D.fadeCameraProps).
const CAM_SOLID = {
  tree: [5.3], rock: [0.85, 0.75], statue: [4.3, 1], stall: [2.3], tent: [1.7], crystal: [2.3, 0.5], totem: [3.4], haystack: [1, 0.68],
  pillar: [2.9], well: [2.6], fountain: [2], ruins: [1.8], lighthouse: [11], windmill: [7.5],
};
const TREE_H = { pine: 5.8, snowpine: 5.8, jungle: 6.2, palm: 5, bamboo: 4.5, cactus: 2.8, dead: 3.5, deadsnow: 3.5, spooky: 4.7, lollipop: 3.8, candycane: 2.4, coral: 2.3, kelp: 3.1, sakura: 4.2, blossom: 4.2 };
const CAM_R = 0.3; // m the camera keeps clear of a core (its near plane, and a little)
const ARM_MIN = 1.1; // m: a prop never pulls the camera in closer to you than this (it fades instead)

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
        // (once it's a real drag, the cursor's held where it is — captured for the
        // drag alone — so you can keep turning without running off the screen;
        // let go and it's back, just where it was)
        if (this.drag.moved > 6 && !this.drag.lock && !this.lockFailed && !this.locked) {
          this.drag.lock = true; this.dragLocking = true;
          try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => { this.dragLocking = false; }); } catch { this.dragLocking = false; }
        }
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
      if (e.button === 2 && this.drag) {
        this.lastDrag = { ...this.drag, end: performance.now() }; this.drag = null;
        if (this.dragLocking) { this.dragLocking = false; if (document.pointerLockElement === canvas) document.exitPointerLock?.(); }
      }
    });
    // the mouse wheel pulls the third-person camera in and out — in past the
    // closest it goes and you're looking out of your own eyes; out again from
    // there and it's behind you (onZoom: main.js switches the view). A
    // trackpad's little nudges add up to a notch before they switch it.
    canvas.addEventListener('wheel', (e) => {
      if (!this.active) return;
      const now = performance.now();
      if (now - (this.wheelT || 0) > 350) this.wheelAcc = 0;
      this.wheelT = now;
      this.wheelAcc = (this.wheelAcc || 0) + e.deltaY;
      if (this.mode === 'first') {
        if (this.wheelAcc > 60 && this.onZoom) { this.wheelAcc = 0; this.tp.dist = TP_MIN * 1.3; this.onZoom('third'); }
        return;
      }
      if (this.mode !== 'third') return;
      if (e.deltaY < 0 && this.tp.dist <= TP_MIN + 1e-3) {
        if (this.wheelAcc < -60 && this.onZoom) { this.wheelAcc = 0; this.onZoom('first'); }
        return;
      }
      this.tp.dist = Math.max(TP_MIN, Math.min(12, this.tp.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
      if (this.tp.dist <= TP_MIN + 1e-3) this.wheelAcc = 0;
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      // (a lock held just for a right-button drag is no lock of the view's: see onMove)
      if (this.dragLocking || (this.dragLockWas && !document.pointerLockElement)) {
        this.dragLockWas = document.pointerLockElement === this.canvas;
        if (!this.dragLockWas) this.dragLocking = false;
        return;
      }
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.lockFails = 0;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (this.dragLocking) { this.dragLocking = false; return; } this.lockRefused(); });
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
   * How far out along the arm — from (x0, z0) at height y0, by (ux, uz, uy):
   * 0..1 — the camera gets before it's within CAM_R of a prop's solid core
   * (see CAM_SOLID); 1 when nothing's in the way. Each core is an upright
   * cylinder (or box) on its collider, met exactly rather than stepped along.
   */
  propHit(w, ground, x0, z0, y0, ux, uz, uy) {
    if (!w.colliders?.size) return 1;
    const a = ux * ux + uz * uz;
    if (a < 1e-6) return 1;
    let best = 1;
    const M = 3; // (the biggest cores reach this far from their cell)
    for (let gy = Math.floor((Math.min(z0, z0 + uz) - M) / 4); gy <= Math.floor((Math.max(z0, z0 + uz) + M) / 4); gy++) {
      for (let gx = Math.floor((Math.min(x0, x0 + ux) - M) / 4); gx <= Math.floor((Math.max(x0, x0 + ux) + M) / 4); gx++) {
        const list = w.colliders.get(w.colKey(gx, gy));
        if (!list) continue;
        for (const c of list) {
          const o = c.o;
          const S = o && CAM_SOLID[o.kind];
          if (!S) continue;
          const qx = w.dx(x0, c.x), qz = c.y - z0;
          // where the arm goes in and out of it, seen from above
          let t0, t1;
          if (c.r !== undefined) {
            const q2 = qx * qx + qz * qz;
            let R = Math.max(c.r, (S[1] || 0) * (o.s || 1)) + CAM_R;
            // (you're within the wider circle: its collider, then; right up
            // against that where you stand, there's nothing to keep clear of)
            if (q2 <= R * R) R = c.r + CAM_R;
            const b = qx * ux + qz * uz, cc = q2 - R * R;
            if (cc <= 0) continue;
            const disc = b * b - a * cc;
            if (disc <= 0) continue;
            const sq = Math.sqrt(disc);
            t0 = (b - sq) / a; t1 = (b + sq) / a;
          } else {
            // (a box: between its sides in x, and in z)
            const hx = c.hw + CAM_R, hz = c.hd + CAM_R;
            if (Math.abs(qx) < hx && Math.abs(qz) < hz) continue;
            if ((Math.abs(ux) < 1e-9 && Math.abs(qx) >= hx) || (Math.abs(uz) < 1e-9 && Math.abs(qz) >= hz)) continue;
            const xa = Math.abs(ux) < 1e-9 ? -Infinity : (qx - hx) / ux, xb = Math.abs(ux) < 1e-9 ? Infinity : (qx + hx) / ux;
            const za = Math.abs(uz) < 1e-9 ? -Infinity : (qz - hz) / uz, zb = Math.abs(uz) < 1e-9 ? Infinity : (qz + hz) / uz;
            t0 = Math.max(Math.min(xa, xb), Math.min(za, zb));
            t1 = Math.min(Math.max(xa, xb), Math.max(za, zb));
          }
          if (t1 <= 0 || t0 >= best || t0 >= t1) continue;
          // …and over its height (from a little below its foot)
          const h = (o.kind === 'tree' && TREE_H[o.sub]) || S[0];
          const base = ground(o.x, o.y) - 0.3, top = base + 0.3 + h * (o.s || 1) + CAM_R;
          if (Math.abs(uy) > 1e-6) {
            const ta = (base - y0) / uy, tb = (top - y0) / uy;
            t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
          } else if (y0 < base || y0 > top) continue;
          if (t0 < t1 && t1 > 0 && t0 < best) best = Math.max(0, t0);
        }
      }
    }
    return best;
  }

  /**
   * First person: how far out from where you stand (x0, y0), along (ux, uy),
   * up to `reach`, your eyes can go at height `eyeY` before a wall, a tree
   * trunk, a pillar or a rock as tall as that (with a hand's breadth to
   * spare). A bench, a barrel or a table is below them.
   */
  headRoom(w, ground, x0, y0, ux, uy, reach, eyeY) {
    const tall = (x, y) => {
      const list = w.colliders?.get(w.colKey(Math.floor(x / 4), Math.floor(y / 4)));
      if (!list) return false;
      for (const c of list) {
        const dx = w.dx(c.x, x), dy = y - c.y;
        const inside = c.r !== undefined ? dx * dx + dy * dy < (c.r + 0.04) ** 2 : Math.abs(dx) < c.hw + 0.04 && Math.abs(dy) < c.hd + 0.04;
        if (!inside) continue;
        const o = c.o;
        if (c.wall || (o?.kind === 'building' && (o.hut || o.colCols?.includes(c)))) return true;
        const S = o && CAM_SOLID[o.kind];
        if (S && ground(o.x, o.y) + ((o.kind === 'tree' && TREE_H[o.sub]) || S[0]) * (o.s || 1) > eyeY - 0.1) return true;
      }
      return false;
    };
    for (let t = 0.05; t < reach + 0.14; t += 0.05) {
      const x = x0 + ux * t, y = y0 + uy * t;
      if (w.solid(x, y) || tall(x, y)) return Math.min(reach, Math.max(0, t - 0.14));
    }
    return reach;
  }

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
      : p.deck ? deckLift(p.deck, time) + (p.z || 0)
        : (p.belowDeck ? p.groundAt(game, p.x, p.y) : p.roofed && p.lastG != null ? p.lastG : ground(p.x, p.y)) - (p.wading || 0) + (p.z || 0);
    // (aboard, you're drawn swung across with her roll and pitch: the eye goes too — hull.js deckSwing)
    if (p.deck && !sailing) { deckSwing(p.deck, time, _dsw); gx = _dsw[0]; gz = _dsw[1]; }
    let rollSea = 0, hp = null, shipX = 0, shipZ = 0;
    if (!sailing) this.seaPitch = 0;
    if (sailing) {
      // standing at the helm (or sitting at a rowboat's oars), rising and
      // rolling gently with the ship (in first person your own rigging turns see-through)
      const s = p.ship;
      hp = helmPoint(s.def);
      // (from her middle: where you are while you've her helm)
      shipX = game.world ? game.world.dx(p.x, s.x) : 0; shipZ = s.y - p.y;
      gx = shipX + Math.cos(s.heading) * hp.x; gz = shipZ + Math.sin(s.heading) * hp.x;
      const t = time + (s.seed || 0);
      gh = shipLift(s, time, hp.x, 0, hp.floor);
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
      gh = waterLevel(game.world, p.x, p.y) - (p.depth || 0) - 0.2 + swellAt(p.x, p.y) * Math.max(0, 1 - (p.depth || 0) / 1.5); eyeH = 0.55;
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
    // flying, the view leans into a banked turn with you (render/anim/flight.js flightState)
    const fly = p.flying && p._fly ? p._fly : null;
    if (fly) roll = -(fly.bank || 0) * (this.mode === 'first' ? 0.28 : 0.12);
    // crouching to spring for a charged jump
    // (or sneaking: actor.js eases crouchK)
    this.crouch = (this.crouch || 0) + (Math.max(p.charging || 0, (p.crouchK || 0) * 0.7) - (this.crouch || 0)) * Math.min(1, dt * 12);
    eyeH -= this.crouch * 0.34 * scale;
    this.roll += (roll - this.roll) * Math.min(1, dt * 5);
    // screen shake from the effects system
    const tr = game.fx?.trauma || 0;
    const sh = tr * tr * 0.06;
    this.shake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    const yaw3 = -(this.yaw + Math.PI / 2);
    if (this.mode === 'third') {
      // what the camera circles, and how far out: you — or, at the helm or the
      // oars, your ship, from further out the bigger she is (the mouse wheel
      // still pulls it in and out)
      let ox = 0, oz = 0, oy = gh + eyeH * 0.9, d = this.tp.dist, own = null;
      // (flying fast, the camera hangs further back: the speed reads, and so does the body laid out flat)
      if (fly) d *= 1 + 0.3 * Math.min(1, Math.hypot(p.vx || 0, p.vy || 0) / 14);
      if (sailing) {
        const s = p.ship, dd = shipDims(s.def);
        own = s;
        const u = dd.big ? -dd.L * 0.1 : hp.x * 0.4;
        ox = shipX + Math.cos(s.heading) * u; oz = shipZ + Math.sin(s.heading) * u;
        oy = (s.lvl || 0) + 0.05 + Math.sin((time + (s.seed || 0)) * 1.3) * 0.07 + (dd.big ? dd.deckY + 2.5 : hp.floor + 1.1);
        d *= (dd.big ? dd.L * 0.95 + 6 : 2.6 + dd.L * 0.8) / 4.2;
      }
      const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
      const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
      // (from further out, a little higher up too: you look down on her deck)
      let cx = ox - fx * d * cp, cz = oz - fz * d * cp, cy = oy + this.tp.height * Math.max(1, d / 8) - spch * d * 0.6;
      // shift lock looks over the right shoulder
      this.shoulder = (this.shoulder || 0) + ((this.shiftLock && !sailing ? 0.7 : 0) - (this.shoulder || 0)) * Math.min(1, dt * 8);
      cx += -fz * this.shoulder; cz += fx * this.shoulder;
      const w = game.world;
      const room = !sailing && w?.roomOf?.(p);
      this.tilt = 0;
      // (the arm's reach eases back out after something pulled it in: not
      // across a jump to somewhere else, though, or at the helm or indoors)
      const moved = w && this.armAt ? Math.hypot(w.dx(this.armAt.x, p.x), p.y - this.armAt.y) : 0;
      if (sailing || room || !w || moved > 3) this.arm = undefined;
      this.armAt = { x: p.x, y: p.y };
      if (room) {
        // indoors: keep the camera inside the room, under the ceiling
        const r = interiorRect(room);
        cx = Math.max(r.x0 + 0.25, Math.min(r.x1 - 0.25, p.x + cx)) - p.x;
        cz = Math.max(r.y0 + 0.25, Math.min(r.y1 - 0.25, p.y + cz)) - p.y;
        cy = Math.min(cy, ground(p.x, p.y) + heightsOf(room).ceil - 0.3);
      } else if (w) {
        // outdoors: pull in rather than end up inside a building, or a ship's
        // cabins, hull, masts or sails. Circling your own ship from out at sea,
        // the land pulls the camera in (never in among her own sails and
        // rigging), and other ships just pass between — unless the camera
        // would end up inside one: then it comes in to her near side.
        const ships = game.ships?.length && game.shipSolidAt;
        const px = p.x + ox, pz = p.y + oz;
        let ux = cx - ox, uz = cz - oz, uy = cy - oy, k = 1, lift = 0;
        const len = Math.hypot(ux, uz) || 1;
        let kMin = own ? 0.12 : Math.min(0.12, 0.2 / len);
        if (own && game.inShip) {
          // (wheeled in close, it stands off far enough to be clear of her)
          let out = 1;
          while (out < 3 && game.inShip(own, px + ux * out, pz + uz * out, oy + uy * out, true)) out += 0.1;
          if (out > 1) { ux *= out; uz *= out; uy *= out; cx = ox + ux; cz = oz + uz; cy = oy + uy; }
          for (let i = 16; i >= 1; i--) {
            const t = i / 16;
            if (game.inShip(own, px + ux * t, pz + uz * t, oy + uy * t, true)) { kMin = Math.min(1, t + 0.1); break; }
          }
        }
        // the first thing in the way out to the camera (looked for every
        // quarter metre or so), with the camera raised `up`
        const n = Math.min(48, Math.max(16, Math.ceil(len / 0.25)));
        // (a building's in the way only below its roof: up on the roofs, or
        // looking back over a low one, the view goes over the top)
        const roofs = game.view3d?.roofAt ? game.view3d : null;
        const hitAt = (up) => {
          for (let i = 1; i <= n; i++) {
            const t = i / n, bx = px + ux * t, bz = pz + uz * t, by = oy + (uy + up) * t;
            if ((w.isBlocked(bx, bz) && !(roofs && roofs.roofAt(bx, bz)?.h < by - 0.3)) || (ships && !own && game.shipSolidAt(bx, bz, by, true))) return t;
          }
          return 0;
        };
        let hit = hitAt(0);
        if (!own && ships) {
          // (on a deck with a rail or a low cabin behind you, the camera rises
          // to look over it; a wall too high for that, it comes right in behind
          // your head — see chars3d.js: then you're not drawn over the view)
          let want = 0;
          if (hit && hit * len < 2) for (const up of [0.6, 1.2, 1.8]) if (!hitAt(up)) { want = up; break; }
          this.camLift = (this.camLift || 0) + (want - (this.camLift || 0)) * Math.min(1, dt * 6);
          if (this.camLift > 0.01) { lift = this.camLift; uy += lift; cy = oy + uy; hit = hitAt(0); }
        } else this.camLift = 0;
        if (hit) k = Math.max(kMin, hit - 0.3 / len);
        if (own && ships) while (k > kMin && game.shipSolidAt(px + ux * k, pz + uz * k, oy + uy * k, true, own)) k = Math.max(kMin, k - 1 / 16);
        if (!own) {
          // on foot, it comes in front of a tree's trunk, a rock, a statue...
          // in the way too — though never right up to you: that close, the
          // prop fades instead. It comes in quickly (at once for a wall) and
          // eases back out once clear.
          const wall = k;
          const kp = this.propHit(w, ground, px, pz, oy, ux, uz, uy);
          if (kp < k) k = Math.max(kp, Math.min(wall, ARM_MIN / len));
          const a = this.arm ?? k;
          this.arm = k >= a ? a + (k - a) * Math.min(1, dt * 3) : Math.min(wall, a + (k - a) * Math.min(1, dt * 25));
          k = this.arm;
        }
        if (k < 1) {
          // (along the arm, height and all, so you stay where you were in the view)
          cx = ox + ux * k; cz = oz + uz * k; cy = oy + uy * k;
        }
        // (and looks down a little more, to keep you in view)
        this.tilt = Math.atan2(lift, len) * 0.6;
      }
      if (p.inWater && p.under) {
        // follow a diver down: under the surface, over the sea floor
        const floor = game.seaDepth ? -game.seaDepth(p.x + cx, p.y + cz) : -99;
        cy = Math.max(floor + 0.4, Math.min(cy, -0.35));
      } else {
        // keep the camera above the ground — and above a roof you're up on (one below your eyes)
        let under = ground(p.x + cx, p.y + cz) + 0.4;
        const rf = p.roofed ? game.view3d?.roofAt?.(p.x + cx, p.y + cz, oy) : null;
        if (rf && rf.h + 0.4 > under) under = rf.h + 0.4;
        if (cy < under) cy = under;
      }
      cam.position.set(cx, cy, cz);
      cam.rotation.set(this.pitch * 0.8 - 0.12 - this.tilt + this.shake.y, yaw3 + this.shake.x, fly ? this.roll : 0);
    } else {
      let ex = gx + Math.cos(this.yaw + Math.PI / 2) * bobX, ey = gh + eyeH + bobY, ez = gz + Math.sin(this.yaw + Math.PI / 2) * bobX;
      // The eye rides your head (chars3d.js ActorView.eyeOffset), on your
      // feet and at the helm or the oars: leaning into a sprint, lunging into
      // a blow, bowing your head to look down — the view goes where your eyes
      // go, smoothed a little (the head's own sway is the bob). Swimming,
      // flying or knocked flat, it's where it always was. (The eye is placed
      // on the body as it's drawn, just after the camera: it's the last
      // frame's, as long as you were drawn in that one — however long the
      // frame took.)
      const e = p._eye3;
      const fresh = !!e && e.t > (this.rigT || 0);
      const ride = sailing ? (fresh && e.ship === p.ship ? 'helm' : null)
        : fresh && !p.inWater && p.state !== 'knocked' && p.state !== 'dead' && !p.flying ? 'foot' : null;
      // (taking up the ride afresh — or the other one — it starts where the eyes are)
      if (ride !== this.ride) this.headSm = null;
      this.ride = ride;
      if (e) e.held = 0;
      const k = 1 - Math.exp(-dt * 20);
      if (ride === 'helm') {
        // at the helm or the oars: your eyes where they are on her as she is now
        // (leaning into a stroke, bowing your head to look down at the wheel)
        const s = p.ship, c = Math.cos(s.heading), sn = Math.sin(s.heading);
        const hs = this.headSm || (this.headSm = { u: e.u, v: e.v, hy: e.hy });
        hs.u += (e.u - hs.u) * k; hs.v += (e.v - hs.v) * k; hs.hy += (e.hy - hs.hy) * k;
        ex = shipX + c * hs.u - sn * hs.v; ez = shipZ + sn * hs.u + c * hs.v;
        ey = shipBob(s, time) + hs.hy;
      } else if (ride === 'foot') {
        const hs = this.headSm || (this.headSm = { x: e.x, y: e.y, z: e.z });
        hs.x += (e.x - hs.x) * k; hs.y += (e.y - hs.y) * k; hs.z += (e.z - hs.z) * k;
        // (out as far as the head goes — a lunge carries it well forward — but
        // never into a wall, a tree trunk or a big rock: stopped short of it,
        // and while it's held back behind your eyes you're not drawn over the
        // view — see chars3d ownBody)
        let hx = hs.x, hz = hs.z;
        const r = Math.hypot(hx, hz);
        let reach = Math.min(r, 1.2 * scale);
        if (game.world && r > 0.02) reach = this.headRoom(game.world, ground, p.x, p.y, hx / r, hz / r, reach, gh + hs.y);
        if (r > 0.02) { hx *= reach / r; hz *= reach / r; }
        e.held = r - reach;
        ex = gx + hx; ez = gz + hz;
        // (the charged jump's crouch and a landing's dip are in gh and the pose already)
        ey = gh + hs.y;
      }
      cam.position.set(ex, ey, ez);
      cam.rotation.set(this.pitch + this.shake.y + (sailing ? this.seaPitch || 0 : 0), yaw3 + this.shake.x, this.roll + rollSea);
    }
    const sprint = !sailing && p.intent?.sprint && moving;
    // a quick widening of the view during dodges and dashes (and with a flight's speed)
    const dashing = !!p.dash;
    const flyFov = fly ? 9 * Math.min(1, Math.hypot(p.vx || 0, p.vy || 0) / 16) : 0;
    const fov = this.baseFov + (sprint ? 7 : 0) + (dashing ? 6 : 0) + flyFov;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); }
    // (tests: a camera set down anywhere — rig.shot = { from: [x, y, h], at:
    // [x, y, h] }, in world tiles and metres — to look at something closely)
    if (this.shot && game.world) {
      const w = game.world, f = this.shot.from, a = this.shot.at;
      cam.position.set(w.dx(p.x, f[0]), f[2], f[1] - p.y);
      cam.lookAt(w.dx(p.x, a[0]), a[2], a[1] - p.y);
    }
    cam.updateMatrixWorld();
    this.aimCache = null;
    this.rigT = performance.now();
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
