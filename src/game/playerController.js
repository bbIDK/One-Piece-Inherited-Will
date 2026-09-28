// Turns keyboard/mouse input into player actions, on foot, swimming or at
// the helm of a ship.
import { HOTBAR_SIZE, HOTBAR_KEYS } from './hotbar.js';
import { clamp, angleDiff } from '../core/math.js';
import { findInteraction } from './interact.js';
import { ITEMS } from '../data/items.js';
import { count, useItem } from './inventory.js';

// food in hand: how long it takes to get it down (seconds), and between bites
const EAT_TIME = { food: 1.25, medicine: 0.9, fruit: 1.7 };
const BITE = 0.36;

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.aimT = 0;
    this.interaction = null;
  }

  update(p, dt, game) {
    const inp = game.input;
    if (game.ui && game.ui.blocksInput()) {
      p.intent.mx = 0; p.intent.my = 0; p.intent.sprint = false;
      p.setBlock(false);
      return;
    }
    if (p.mode === 'sail') return this.sail(p, dt, game);

    // movement (in first/third person the arrow keys turn the camera instead)
    const v3 = game.view3d?.active ? game.view3d : null;
    let mx = 0, my = 0;
    if (inp.isDown('W') || (!v3 && inp.isDown('ArrowUp'))) my -= 1;
    if (inp.isDown('S') || (!v3 && inp.isDown('ArrowDown'))) my += 1;
    if (inp.isDown('A') || (!v3 && inp.isDown('ArrowLeft'))) mx -= 1;
    if (inp.isDown('D') || (!v3 && inp.isDown('ArrowRight'))) mx += 1;
    let l = Math.hypot(mx, my);
    if (l > 0) { mx /= l; my /= l; }
    // the touch stick (analog: a light push walks slowly)
    const tc = inp.touch?.on && (inp.touch.mx || inp.touch.my) ? inp.touch : null;
    if (tc && !l) { mx = tc.mx; my = tc.my; l = Math.min(1, Math.hypot(mx, my)); }
    const fwdIn = -my;
    if (v3 && l > 0) {
      // W walks where the camera looks, A/D strafe
      const yaw = v3.rig.yaw, fwd = -my, right = mx;
      mx = Math.cos(yaw) * fwd - Math.sin(yaw) * right;
      my = Math.sin(yaw) * fwd + Math.cos(yaw) * right;
    }
    p.intent.mx = mx; p.intent.my = my;
    // swimming: Space rises, C dives — and swimming forward follows the view up or down
    p.intent.mz = 0;
    // creative mode: double-tap Space to take off or land; flying, Space rises and C sinks
    const cr = game.creative;
    if (cr?.on && inp.wasPressed('Space')) {
      const now = game.time || 0;
      if (now - (this.spaceT ?? -9) < 0.3) { cr.fly(); this.spaceT = -9; this.jumpHold = null; p.charging = 0; }
      else this.spaceT = now;
    }
    if (p.flying) p.intent.mz = inp.isDown('Space') ? 1 : inp.isDown('C') ? -1 : 0;
    if (p.inWater) {
      if (inp.isDown('Space')) p.intent.mz = 1;
      else if (inp.isDown('C')) p.intent.mz = -1;
      else if (v3 && fwdIn > 0.3) {
        const pitch = v3.rig.pitch;
        if (pitch < -0.28 || (pitch > 0.2 && p.depth > 0.05)) p.intent.mz = Math.max(-1, Math.min(1, pitch * 1.5)) * fwdIn;
      }
      if (!p.gills && p.under && !this.o2Hint) { this.o2Hint = true; game.hint?.('diving', 'Under water you hold your breath — watch the bubbles under your stamina and come up for air (Space). Look down and swim, or hold C, to dive.'); }
    }
    // Shift: holding it sprints (a quick tap dodges in first person); Q dashes
    if (inp.wasPressed('Shift')) this.shiftT = 0;
    if (inp.isDown('Shift')) this.shiftT = (this.shiftT ?? 0) + dt;
    const tapDodge = inp.wasReleased('Shift') && (this.shiftT ?? 1) < 0.22;
    p.intent.sprint = ((inp.isDown('Shift') && this.shiftT > 0.16) || !!tc?.run) && l > 0;
    // in first person (and with shift lock) you always face where you look
    if (v3 && (v3.rig.mode === 'first' || v3.rig.shiftLock)) this.aimT = Math.max(this.aimT, 0.25);

    // aim at the mouse (melee swings snap onto a foe near that direction)
    let [wx, wy] = game.renderer.toWorld(game.world, inp.mouse.x, inp.mouse.y);
    // touch in the top-down view has no pointer: aim at the nearest foe ahead
    if (inp.touch?.on && !v3) [wx, wy] = this.touchAim(p, game);
    const aim = Math.atan2(wy - (p.y - 0.5), game.world.dx(p.x, wx));
    const melee = p.style !== 'sniper';
    const aimM = melee ? this.assist(p, game, aim) : aim;
    this.aimT = Math.max(0, this.aimT - dt);
    const fighting = inp.mouseDown(0) || (inp.mouseDown(2) && !v3?.rig.freeMouse) || inp.isDown('F');
    if (fighting) this.aimT = 0.7;
    if (p.action && p.action.def.track !== false && p.action.t < (p.action.def.windup ?? 0.1)) p.facing = p.action.def.m1Chain || p.action.def.source?.startsWith('style') ? aimM : aim;
    else if (!p.action) {
      if (this.aimT > 0) p.facing = aim;
      else if (l > 0) p.facing = Math.atan2(my, mx);
    }
    this.mouseWorld = { x: wx, y: wy };

    // combat: presses are buffered for a moment, so a click made slightly
    // early still fires as soon as the current move allows it
    const buf = this.buf || (this.buf = { m1: 0, heavy: 0, dodge: 0, jump: 0 });
    buf.m1 = Math.max(0, buf.m1 - dt); buf.heavy = Math.max(0, buf.heavy - dt); buf.dodge = Math.max(0, buf.dodge - dt); buf.jump = Math.max(0, (buf.jump || 0) - dt);
    if (inp.mousePressed(0)) buf.m1 = 0.22;
    const freeMouse = !!v3?.rig.freeMouse;
    // food in hand (picked on the hotbar): the right button eats it instead of a heavy blow
    const held = this.holding(p, game);
    const rightClick = freeMouse ? inp.mouse.released[2] && v3.rig.takeRightClick() : inp.mousePressed(2);
    if (rightClick && !held) buf.heavy = 0.25;
    if (held) this.eat(p, game, dt, held, rightClick, freeMouse ? null : inp.mouseDown(2));
    if (tapDodge && !(v3 && v3.rig.mode === 'third')) buf.dodge = 0.16;
    // in third person Ctrl toggles shift lock (Shift is for running)
    if (inp.wasPressed('Control') && v3 && v3.rig.mode === 'third' && !inp.touch?.on) {
      v3.rig.setShiftLock(!v3.rig.shiftLock);
      game.applySettings?.(true);
      game.ui.toast(v3.rig.shiftLock ? 'SHIFT LOCK ON' : 'SHIFT LOCK OFF', v3.rig.shiftLock ? 'Your character faces where you look. Tap Ctrl to free the mouse.' : 'Hold the right mouse button to turn the camera. Tap Ctrl to lock it.', '#ffe082', 'shiftlock');
    }
    if (inp.wasPressed('Q')) buf.dodge = 0.16; // Q dashes
    // jumping: a tap hops; holding Space crouches and charges a higher spring (how
    // high, and how much more a charge gives, depends on your race). A press in the
    // air still jumps if you land within a moment.
    if (inp.wasPressed('Space') && !p.flying) { if (p.canJump()) this.jumpHold = { t: 0 }; else buf.jump = 0.14; }
    if (inp.wasPressed('Slash') || inp.wasPressed('NumpadDivide') || inp.wasPressed('Backquote')) game.creative?.openConsole();
    if (buf.dodge > 0 && p.tryDodge(game, mx, my)) { buf.dodge = 0; buf.m1 = 0; }
    if (this.jumpHold) {
      if (!p.canJump()) { this.jumpHold = null; p.charging = 0; }
      else if (inp.isDown('Space')) { this.jumpHold.t += dt; p.charging = clamp((this.jumpHold.t - 0.16) / 0.75, 0, 1); }
      else { p.tryJump(game, p.charging); this.jumpHold = null; p.charging = 0; buf.jump = 0; }
    } else if (buf.jump > 0 && p.tryJump(game, 0)) buf.jump = 0;
    if (buf.heavy > 0) {
      const prev = p.facing;
      p.facing = aimM;
      if (p.tryHeavy(game)) { buf.heavy = 0; buf.m1 = 0; } else if (p.action) p.facing = prev;
    }
    if (p.held && (inp.mousePressed(0) || buf.dodge > 0)) this.putAway(p); // (fists up: the food goes back in your pocket)
    if (buf.m1 > 0 || (inp.mouseDown(0) && !p.action)) {
      if (!p.action) { p.facing = aimM; if (p.tryM1(game)) buf.m1 = 0; }
      else { p.tryM1(game); if (p.combo.queued) buf.m1 = 0; }
    }
    p.setBlock(inp.isDown('F'));
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (inp.wasPressed(HOTBAR_KEYS[i])) {
        const id = p.hotbar[i];
        // (anything else from the hotbar puts the food in your hand away first)
        if (id && p.held && id !== 'item:' + p.held) {
          const it = String(id).startsWith('item:') ? ITEMS[id.slice(5)] : null;
          if (!it || !(it.type === 'food' || it.type === 'medicine' || it.type === 'fruit')) this.putAway(p);
        }
        // (a technique turns you to where you aim; drawing a weapon or taking food doesn't)
        if (id) { if (!String(id).startsWith('item:')) p.facing = aim; const target = this.aimTarget(p, game, wx, wy); p.tryTechnique(id, game, target || { x: wx, y: wy }); }
      }
    }
    if (inp.wasPressed('R')) this.toggleHaki(p, game, 'armament');
    if (inp.wasPressed('T')) this.toggleHaki(p, game, 'observation');
    if (inp.wasPressed('G')) {
      // (nothing happens — and nothing is said — until the power awakens)
      if (p.hakiLevel('conqueror')) { p.facing = aim; p.tryTechnique('haki_conqueror', game); }
    }

    // interaction
    this.interaction = findInteraction(game, p);
    if (inp.wasPressed('E') && this.interaction) {
      inp.consume('E');
      p.reachT = 0.45; // (the first-person hand reaches out)
      this.interaction.run();
    }
  }

  /** The food (or medicine, or Devil Fruit) in your hand, if you still have one. */
  holding(p, game) {
    if (!p.held) return null;
    if (count(game.state.char, p.held) > 0 && ITEMS[p.held]) return p.held;
    this.putAway(p);
    return null;
  }

  putAway(p) { p.held = null; p.eating = null; this.eatAuto = false; }

  /**
   * Eating what you hold: keep the right button down (or, with a free mouse,
   * click it once) and it goes down in a few bites; let go, get hit, swing or
   * dodge and you stop. Only when it's finished does it do you any good.
   */
  eat(p, game, dt, id, click, down) {
    if (down === null) { if (click) this.eatAuto = !this.eatAuto; down = this.eatAuto; }
    const ok = down && p.state === 'idle' && !p.action && !p.blocking && !(p.inWater && !p.gills);
    if (!ok) { p.eating = null; if (!down) this.eatAuto = false; return; }
    const d = ITEMS[id];
    if (!p.eating || p.eating.id !== id) p.eating = { id, t: 0, dur: EAT_TIME[d.type] || 1.25, bites: 0 };
    const e = p.eating;
    e.t += dt;
    const b = Math.floor(e.t / BITE);
    if (b > e.bites && e.t < e.dur - 0.1) { e.bites = b; game.audio?.sfx(d.type === 'medicine' ? 'page' : 'bite', p); }
    if (e.t < e.dur) return;
    p.eating = null;
    this.eatAuto = false;
    useItem(game, id);
    if (!(count(game.state.char, id) > 0)) this.putAway(p);
  }

  onHurt(p) { if (p.eating) { p.eating = null; this.eatAuto = false; } }

  /** A dodge requested from outside the keyboard (the touch pad's Dodge button). */
  requestDodge() { if (this.buf) this.buf.dodge = 0.16; else this.buf = { m1: 0, heavy: 0, dodge: 0.16, jump: 0 }; }

  /** Soft melee aim assist: face a foe that is close and roughly where you aim. */
  assist(p, game, aim) {
    const reach = 2.4 * (p.reach || 1);
    let best = null, bestScore = Infinity;
    for (const a of game.actorsNear(p.x, p.y, reach + 0.6)) {
      if (a === p || a.state !== 'idle' || !game.combat.canHit(p, a, {})) continue;
      const dx = game.world.dx(p.x, a.x), dy = a.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > reach + 0.6) continue;
      const off = Math.abs(angleDiff(aim, Math.atan2(dy, dx)));
      if (off > 0.62) continue;
      const score = d + off * 2.5;
      if (score < bestScore) { bestScore = score; best = Math.atan2(dy, dx); }
    }
    return best === null ? aim : best;
  }

  /** Touch aim for the top-down view: the closest foe in front, else straight ahead. */
  touchAim(p, game) {
    let best = null, bs = Infinity;
    for (const a of game.actorsNear(p.x, p.y, 9)) {
      if (a === p || a.state !== 'idle' || !game.combat.canHit(p, a, {})) continue;
      if (!(a.aggroPlayer || a.provoked || a.controller?.target === p || a === game.bossTarget)) continue;
      const dx = game.world.dx(p.x, a.x), dy = a.y - p.y;
      const d = Math.hypot(dx, dy);
      const off = Math.abs(angleDiff(p.facing, Math.atan2(dy, dx)));
      const score = d + off * 3;
      if (score < bs) { bs = score; best = a; }
    }
    if (best) return [best.x, best.y - 0.5];
    return [p.x + Math.cos(p.facing) * 4, p.y - 0.5 + Math.sin(p.facing) * 4];
  }

  aimTarget(p, game, wx, wy) {
    let best = null, bd = 3.5 * 3.5;
    for (const a of game.actorsNear(wx, wy, 3.5)) {
      if (a === p || a.state !== 'idle' || !game.combat.canHit(p, a, {})) continue;
      const d = game.world.dist2(wx, wy, a.x, a.y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  toggleHaki(p, game, type) {
    if (!p.hakiLevel(type)) return; // hidden until awakened
    if (type === 'armament') {
      p.armament = !p.armament;
      if (p.armament) { p.observation = false; game.fx.burst(p.x, p.y - 0.8, 10, { color: '#212121', speed: 3, g: 0, life: 0.35, kind: 'line' }); game.audio?.sfx('haki'); }
    } else {
      p.observation = !p.observation;
      if (p.observation) { p.armament = false; game.fx.ring(p.x, p.y, 0.5, 8, '#ce93d8', 0.6, 0.08); game.audio?.sfx('haki_obs'); }
    }
  }

  sail(p, dt, game) {
    const inp = game.input;
    const s = p.ship;
    if (!s || s.sunk) return;
    s.captain = p;
    let turn = 0;
    if (inp.isDown('A') || inp.isDown('ArrowLeft')) turn -= 1;
    if (inp.isDown('D') || inp.isDown('ArrowRight')) turn += 1;
    // touch stick: left/right steers, up raises the sails, down lowers them
    const tc = inp.touch?.on ? inp.touch : null;
    if (tc && !turn && Math.abs(tc.mx) > 0.2) turn = clamp(tc.mx * 1.3, -1, 1);
    const ahead = inp.isDown('W') || inp.isDown('ArrowUp') || (tc && tc.my < -0.45) || (s.def.oarsOnly && inp.isDown('Space'));
    const back = inp.isDown('S') || inp.isDown('ArrowDown') || (tc && tc.my > 0.45);
    if (s.def.oarsOnly) {
      // at the oars you set a pace, as you set sails: W (or Space) quickens
      // it, S eases it off to a stop — and, pressed again from a stop, backs
      // water — and she keeps rowing at it with your hands off the keys.
      // A/D pull one oar harder to swing her round.
      if (inp.wasPressed('S') || inp.wasPressed('ArrowDown')) this.backOk = (s.rowPow || 0) <= 0.001;
      if (ahead) s.rowPow = Math.min(1, (s.rowPow || 0) + dt * 1.1);
      else if (back) s.rowPow = Math.max(this.backOk ? -0.6 : 0, (s.rowPow || 0) - dt * 1.4);
      const fwd = Math.abs(s.rowPow || 0) < 0.04 ? 0 : s.rowPow;
      s.rowL = fwd || (turn > 0.2 ? 0.8 : 0);
      s.rowR = fwd || (turn < -0.2 ? 0.8 : 0);
      if (s.rowL || s.rowR) s.anchored = false;
      s.heading += turn * s.def.turn * (game.crewMods?.turnMul || 1) * (fwd ? 0.45 : 0.6) * (0.55 + 0.45 * s.drive) * dt;
      s.sail = 0; s.rowing = 0;
    } else {
      const steer = s.def.turn * (game.crewMods?.turnMul || 1) * (0.35 + 0.65 * clamp(Math.abs(s.speed) / 3, 0, 1));
      s.heading += turn * steer * dt;
      if (ahead) { s.sail = Math.min(1, s.sail + dt * 0.9); s.anchored = false; }
      if (back) s.sail = Math.max(0, s.sail - dt * 1.2);
      s.rowing = inp.isDown('Space') ? 1 : 0;
      if (s.rowing) s.anchored = false;
    }
    let [wx, wy] = game.renderer.toWorld(game.world, inp.mouse.x, inp.mouse.y);
    if (tc && !game.view3d?.active) [wx, wy] = this.touchShipAim(s, game);
    this.mouseWorld = { x: wx, y: wy };
    if (inp.mousePressed(0)) {
      if (!s.fireBroadside(game, wx, wy, p) && !s.def.cannons) game.log('This boat has no cannons.', '#b0bec5');
    }
    if (inp.wasPressed('Shift') && s.def.coupDeBurst) {
      if (s.burstCd <= 0) {
        s.burstCd = 30; s.coupT = 1.2;
        game.fx.burst(s.x, s.y, 30, { color: ['#e1f5fe', '#ffffff'], speed: 6, g: 5, life: 0.8, kind: 'smoke', size: 0.4 });
        game.fx.shake(0.5);
        game.fx.text(s.x, s.y - 2, 'COUP DE BURST!', '#ffeb3b', 0.6);
        game.audio?.sfx('explosion');
      }
    }
    p.x = s.x; p.y = s.y;
    p.facing = s.heading;
    this.interaction = findInteraction(game, p);
    if (inp.wasPressed('E') && this.interaction) {
      inp.consume('E');
      p.reachT = 0.45; // (the first-person hand reaches out)
      this.interaction.run();
    }
    // hotbar still usable for ranged techniques from the deck
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (inp.wasPressed(HOTBAR_KEYS[i])) {
        const id = p.hotbar[i];
        if (id) { p.facing = Math.atan2(wy - p.y, game.world.dx(p.x, wx)); p.tryTechnique(id, game, { x: wx, y: wy }); }
      }
    }
    void angleDiff;
  }

  /** Touch aim at sea in the top-down view: the nearest other ship, else off the starboard side. */
  touchShipAim(s, game) {
    let best = null, bd = 34 * 34;
    for (const o of game.ships) {
      if (o === s || o.sunk || o.owner === 'player') continue;
      const d = game.world.dist2(s.x, s.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) return [best.x, best.y];
    const a = s.heading + Math.PI / 2;
    return [s.x + Math.cos(a) * 10, s.y + Math.sin(a) * 10];
  }

  whileKnocked(p, dt, game) {
    game.emit('playerKnockedTick', dt);
  }
}
