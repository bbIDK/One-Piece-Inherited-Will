// Turns keyboard/mouse input into player actions, on foot, swimming or at
// the helm of a ship. The number keys take out what's on the hotbar (food, a
// weapon, your Devil Fruit and its forms: entries.js); the skill keys use the
// skills of whatever is out, and the Haki keys the Haki techniques (keys.js,
// moveset.js).
import { HOTBAR_SIZE, HOTBAR_KEYS, isMoveset } from './hotbar.js';
import { takeOut, keepEntries, cycleForm } from './entries.js';
import { movesetOf, hakiGroupOf } from './moveset.js';
import { keysOf, pressed } from './keys.js';
import { clamp, angleDiff } from '../core/math.js';
import { findInteraction } from './interact.js';
import { ITEMS } from '../data/items.js';
import { count, useItem } from './inventory.js';
import { flightOf, takeOff, airStep } from './flight.js';

// food in hand: how long it takes to get it down (seconds), and between bites
const EAT_TIME = { food: 1.25, medicine: 0.9, fruit: 1.7 };
const BITE = 0.36;
// how long a skill key pressed a moment early waits for the last move to finish (seconds)
const SKILL_BUFFER = 0.3;

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.aimT = 0;
    this.interaction = null;
  }

  update(p, dt, game) {
    const inp = game.input;
    keepEntries(p);
    if (game.ui && game.ui.blocksInput()) {
      p.intent.mx = 0; p.intent.my = 0; p.intent.sprint = false;
      p.setBlock(false);
      this.skillBuf = null;
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
    // swimming: Space rises, Alt dives — and swimming forward follows the view up or down
    // (Alt, the crouch key, is "down" in the water and the air: not Ctrl, whose
    // Ctrl+W beside the forward key closes the browser's tab)
    p.intent.mz = 0;
    // creative mode: double-tap Space to take off or land; flying, Space rises and Alt sinks
    // (those who fly in earnest — wings, flames, smoke... — take off the same
    // way: Space again in the air; see airPress)
    const cr = game.creative;
    let spaceUsed = false;
    if (cr?.on && inp.wasPressed('Space')) {
      const now = game.time || 0;
      if (now - (this.spaceT ?? -9) < 0.3) { cr.fly(); this.spaceT = -9; this.jumpHold = null; p.charging = 0; }
      else this.spaceT = now;
    } else if (inp.wasPressed('Space')) spaceUsed = this.airPress(p, game);
    if (p.flying) p.intent.mz = inp.isDown('Space') ? 1 : inp.isDown('Alt') ? -1 : 0;
    if (p.inWater) {
      if (inp.isDown('Space')) p.intent.mz = 1;
      else if (inp.isDown('Alt')) p.intent.mz = -1;
      else if (v3 && fwdIn > 0.3) {
        const pitch = v3.rig.pitch;
        if (pitch < -0.28 || (pitch > 0.2 && p.depth > 0.05)) p.intent.mz = Math.max(-1, Math.min(1, pitch * 1.5)) * fwdIn;
      }
      if (!p.gills && p.under && !this.o2Hint) { this.o2Hint = true; game.hint?.('diving', 'Under water you hold your breath — watch the bubbles under your health and come up for air (Space). Look down and swim, or hold Alt, to dive.'); }
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
    // a gun out (not a slingshot): the right button held aims down the sights —
    // the view in close over the shoulder, a slower, steadier step, and the shots
    // faster, truer and harder (abilities.js). Held a moment, the left button
    // fires the gun's heavy shot (Deadly Aim) instead of a plain one.
    const gun = p.weapon?.kind === 'gun' && !(p.weapon.ids || []).some((id) => /sling|kabuto/.test(id));
    const aimNow = gun && !freeMouse && !held && inp.mouseDown(2) && !p.inWater && !p.flying && !p.seat && !p.climb && p.state === 'idle';
    if (aimNow && !p.aiming) game.hint?.('gunaim', 'Aiming: hold the right mouse button to aim down the sights, click to fire. Hold your aim a moment for a heavy shot.');
    p.aiming = aimNow;
    this.aimHold = aimNow ? (this.aimHold || 0) + dt : 0;
    if (rightClick && !held && !(gun && !freeMouse)) buf.heavy = 0.25;
    if (aimNow && this.aimHold >= 0.6 && inp.mousePressed(0) && !p.action) { buf.heavy = 0.25; buf.m1 = 0; this.aimHold = 0; }
    if (held) this.eat(p, game, dt, held, rightClick, freeMouse ? null : inp.mouseDown(2));
    if (tapDodge && !(v3 && v3.rig.mode === 'third')) buf.dodge = 0.16;
    // in third person Ctrl toggles shift lock (Shift is for running)
    if (inp.wasPressed('Control') && !p.flying && !p.inWater && v3 && v3.rig.mode === 'third' && !inp.touch?.on) {
      v3.rig.setShiftLock(!v3.rig.shiftLock);
      game.applySettings?.(true);
      game.ui.toast(v3.rig.shiftLock ? 'SHIFT LOCK ON' : 'SHIFT LOCK OFF', v3.rig.shiftLock ? 'Your character faces where you look. Tap Ctrl to free the mouse.' : 'Hold the right mouse button to turn the camera. Tap Ctrl to lock it.', '#ffe082', 'shiftlock');
    }
    if (inp.wasPressed('Q')) { buf.dodge = 0.16; if (p.dodgeCd > 0.16) game.ui?.flashAct?.('dodge'); } // Q dashes (its slot flashes while it's still coming back)
    // jumping: a tap hops; holding Space crouches and charges a higher spring (how
    // high, and how much more a charge gives, depends on your race). A press in the
    // air still jumps if you land within a moment.
    if (inp.wasPressed('Space') && !p.flying && !spaceUsed) { if (p.canJump()) this.jumpHold = { t: 0 }; else buf.jump = 0.14; }
    if (inp.wasPressed('Slash') || inp.wasPressed('NumpadDivide') || inp.wasPressed('Backquote')) game.creative?.openConsole();
    if (buf.dodge > 0 && p.tryDodge(game, mx, my)) { buf.dodge = 0; buf.m1 = 0; }
    if (this.jumpHold) {
      if (!p.canJump()) { this.jumpHold = null; p.charging = 0; }
      else if (inp.isDown('Space')) { this.jumpHold.t += dt; p.charging = clamp((this.jumpHold.t - 0.16) / 0.75, 0, 1); }
      else {
        // (a body that can fly learns how on its first jump)
        if (p.tryJump(game, p.charging) && flightOf(p)) game.hint?.('takeoff', 'You can fly! Press Space again in the air (a double tap) to take off.');
        this.jumpHold = null; p.charging = 0; buf.jump = 0;
      }
    } else if (buf.jump > 0 && p.tryJump(game, 0)) buf.jump = 0;
    // on a ship's ladder you climb it yourself: W up, S down, Space lets go (actor.js updateClimb)
    if (p.climb?.to?.ladder || p.climb?.mast) {
      p.climbInput = (inp.isDown('W') || inp.isDown('ArrowUp') ? 1 : 0) - (inp.isDown('S') || inp.isDown('ArrowDown') ? 1 : 0);
      p.climbStrafe = (inp.isDown('D') || inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('A') || inp.isDown('ArrowLeft') ? 1 : 0);
      if (inp.wasPressed('Space')) p.letGo = true;
    } else { p.climbInput = 0; p.letGo = false; }
    // Alt crouches: you sneak about (slower, quieter, harder to spot) while it's
    // held — a quick tap keeps you down until the next. Running, jumping, a
    // blow, the water or the air stand you up.
    if (inp.wasPressed('Alt')) {
      if (p.crouch) { p.crouch = false; this.altT = -1; } else { p.crouch = true; this.altT = 0; game.hint?.('sneak', 'Sneaking: slower and quieter. People only notice you up close in front of them, and hardly at all from behind. Tap Alt to stay down, hold it to crouch while held.'); }
    }
    if (this.altT >= 0 && inp.isDown('Alt')) this.altT += dt;
    if (inp.wasReleased('Alt') && this.altT > 0.3) p.crouch = false;
    if (p.crouch && (p.intent.sprint || this.jumpHold || p.vz || p.z > 0.05 || p.action || p.dash || p.inWater || p.flying || p.climb || p.seat || p.state !== 'idle')) p.crouch = false;
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
    if (inp.wasPressed('F') && p.guardCd > 0) game.ui?.flashAct?.('guard');
    p.setBlock(inp.isDown('F'));
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (inp.wasPressed(HOTBAR_KEYS[i])) {
        const id = p.hotbar[i];
        // (anything else from the hotbar puts the food in your hand away first)
        if (id && p.held && id !== 'item:' + p.held) {
          const it = String(id).startsWith('item:') ? ITEMS[id.slice(5)] : null;
          if (!it || !(it.type === 'food' || it.type === 'medicine' || it.type === 'fruit')) this.putAway(p);
        }
        if (id) this.useEntry(p, game, id, aim, wx, wy);
      }
    }
    // the skills of what's out on the skill keys, the Haki techniques on theirs
    // (G, a king's Conqueror's first: hakiGroupOf — nothing at all until a Haki wakes)
    this.skillKeys(p, game, aim, wx, wy, dt);
    if (inp.wasPressed('R')) this.toggleHaki(p, game, 'armament');
    if (inp.wasPressed('T')) this.toggleHaki(p, game, 'observation');

    // interaction
    this.interaction = findInteraction(game, p);
    if (inp.wasPressed('E') && this.interaction) {
      inp.consume('E');
      p.reachT = 0.45; // (the first-person hand reaches out)
      this.interaction.run();
    }
  }

  /**
   * A hotbar entry, used (its key, or a click or tap on it: ui.js useSlot):
   * a moveset taken out (entries.js), an item used — a Dial fired where you
   * aim — or a technique still on an old hotbar, at where you aim.
   */
  useEntry(p, game, id, aim, wx, wy) {
    if (isMoveset(id)) return takeOut(game, p, id);
    const item = String(id).startsWith('item:') ? ITEMS[id.slice(5)] : null;
    // (a technique or a Dial turns you to where you aim; drawing a weapon or taking food doesn't)
    if (!item || item.type === 'dial') p.facing = aim;
    const target = this.aimTarget(p, game, wx, wy);
    return p.tryTechnique(id, game, target || { x: wx, y: wy });
  }

  /**
   * The skill keys and the Haki keys (keys.js). A press a moment early —
   * the last move still finishing — is kept, as a click is, and fires as
   * soon as it can (SKILL_BUFFER seconds at most).
   */
  skillKeys(p, game, aim, wx, wy, dt = 0) {
    const inp = game.input, K = keysOf(game.settings);
    for (let i = 0; i < K.skills.length; i++) if (pressed(inp, K.skills[i])) this.skillBuf = { group: 'skills', i, t: SKILL_BUFFER };
    for (let i = 0; i < K.haki.length; i++) if (pressed(inp, K.haki[i])) this.skillBuf = { group: 'haki', i, t: SKILL_BUFFER };
    // (the fruit's next form: Z — the Gears, the awakened set)
    if (pressed(inp, K.form[0])) cycleForm(game, p);
    const b = this.skillBuf;
    if (!b) return;
    b.t -= dt;
    if (!p.canAct() && b.t > 0) return;
    this.skillBuf = null;
    if (b.group === 'haki') this.useHaki(p, game, b.i, aim, wx, wy);
    else this.useSkill(p, game, b.i, aim, wx, wy);
  }

  /**
   * Skill `i` of whatever is out (moveset.js): used at where you aim — or,
   * one still to learn, what opens it is said.
   */
  useSkill(p, game, i, aim, wx, wy) {
    const s = movesetOf(p).skills[i];
    if (!s) return false;
    if (s.locked) {
      game.ui?.flashSlot?.(s.id);
      game.log(`${s.def.name}: ${s.why ? s.why[0].toUpperCase() + s.why.slice(1) : 'not learned yet'}.`, '#b0bec5');
      return false;
    }
    p.facing = aim;
    const target = this.aimTarget(p, game, wx, wy);
    return p.tryTechnique(s.id, game, target || { x: wx, y: wy });
  }

  /** Haki technique `i` (the Haki group: moveset.js hakiGroupOf), at where you aim. Nothing until a Haki wakes. */
  useHaki(p, game, i, aim, wx, wy) {
    const r = hakiGroupOf(p)?.rows.find((x) => x.slot === i);
    if (!r) return false;
    p.facing = aim;
    const target = this.aimTarget(p, game, wx, wy);
    return p.tryTechnique(r.id, game, target || { x: wx, y: wy });
  }

  /**
   * Space pressed with your feet off the ground (or flying): take off if you
   * can fly (wings, flames, smoke...), or kick off the air if you know Geppo;
   * flying, a double tap comes down to land (holding it climbs). True if the
   * press was spent on that (and isn't a jump).
   */
  airPress(p, game) {
    const now = game.time || 0;
    const dbl = now - (this.airTapT ?? -9) < 0.32;
    this.airTapT = now;
    if (p.flying) {
      if (p.flight && dbl) { p.flight.landing = true; this.airTapT = -9; }
      return true;
    }
    const air = ((p.z || 0) > 0.3 || p.vz > 0.5) && !p.inWater && !p.climb && !p.onShip && p.mode !== 'sail';
    if (!air) return false;
    if (flightOf(p) && takeOff(p, game)) { this.jumpHold = null; p.charging = 0; this.airTapT = -9; return true; }
    return airStep(p, game);
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
    if (!p.eating || p.eating.id !== id) p.eating = { id, t: 0, dur: d.useTime || EAT_TIME[d.type] || 1.25, bites: 0, wrap: d.apply === 'wrap' };
    const e = p.eating;
    e.t += dt;
    const b = Math.floor(e.t / BITE);
    if (e.wrap) { const w = Math.floor(e.t / 0.62); if (w > e.bites && e.t < e.dur - 0.2) { e.bites = w; game.audio?.sfx('wrap', p); } }
    else if (b > e.bites && e.t < e.dur - 0.1) { e.bites = b; game.audio?.sfx(d.type === 'medicine' ? 'page' : 'bite', p); }
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

  /**
   * R / T: Armament or Observation on (the other goes off) or off. On: the
   * coat spreading up the arms with its clank, or the sonar pulse and its
   * ting (combatfx.js hakiOnFx; the sounds in your own voice: audio/sfx.js).
   * With no spirit left, nothing comes — and you're told why.
   */
  toggleHaki(p, game, type) {
    if (!p.hakiLevel(type)) return; // hidden until awakened
    const on = type === 'armament' ? !p.armament : !p.observation;
    // (worn out — Gear Fourth spent: no Haki in you for a while)
    const tired = on && p.buffs.find((b) => b.noHaki);
    if (tired) {
      game.ui?.flashAct?.('haki');
      game.log(`${tired.name || 'Exhausted'}: no Haki in you for ${Math.ceil(tired.t)}s.`, '#b0bec5');
      return;
    }
    if (on && p.haki < 1) {
      game.ui?.flashAct?.('haki');
      game.audio?.sfx('haki_out', p);
      game.log('No spirit left for Haki: let it rest and the bar refills.', '#b0bec5');
      return;
    }
    if (type === 'armament') {
      p.armament = on;
      if (on) p.observation = false;
    } else {
      p.observation = on;
      if (on) p.armament = false;
    }
    if (on) {
      game.fx.hakiOn?.(p, type);
      game.audio?.sfx(type === 'armament' ? 'haki' : 'haki_obs', p);
    } else game.audio?.sfx('haki_off', p, { type });
  }

  sail(p, dt, game) {
    const inp = game.input;
    const s = p.ship;
    if (!s || s.sunk) return;
    s.captain = p;
    // (diving to Fish-Man Island she just goes down: nobody steers, nobody leaves the helm — zones.js)
    if (s.diving) { this.interaction = null; return; }
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
      // (the stroke on one side swings her round: eased in and out like a helm — Ship.steer)
      s.steer(turn, s.def.turn * (game.crewMods?.turnMul || 1) * (fwd ? 0.45 : 0.6) * (0.55 + 0.45 * s.drive), dt);
      s.sail = 0; s.rowing = 0;
    } else {
      // (the helm goes over and back easing in and out, and she answers it a
      // moment later — no snapping round: Ship.steer, tuned in boatFeel.js)
      const steer = s.def.turn * (game.crewMods?.turnMul || 1) * (0.35 + 0.65 * clamp(Math.abs(s.speed) / 3, 0, 1));
      s.steer(turn, steer, dt);
      // sails are up or down, nothing between: W sets them, S takes them in
      // (the canvas still runs up and down the yards, just quickly: Ship.update)
      if (inp.wasPressed('W') || inp.wasPressed('ArrowUp') || (tc && tc.my < -0.45 && s.sail < 1)) s.setSails(true);
      if (inp.wasPressed('S') || inp.wasPressed('ArrowDown') || (tc && tc.my > 0.45 && s.sail > 0)) s.setSails(false);
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
    // the hotbar and the skill keys still work from the helm: a fruit's shots across the water
    const aim = Math.atan2(wy - p.y, game.world.dx(p.x, wx));
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (inp.wasPressed(HOTBAR_KEYS[i])) {
        const id = p.hotbar[i];
        if (id) this.useEntry(p, game, id, aim, wx, wy);
      }
    }
    this.skillKeys(p, game, aim, wx, wy, dt);
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
