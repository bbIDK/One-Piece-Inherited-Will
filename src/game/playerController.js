// Turns keyboard/mouse input into player actions, on foot, swimming or at
// the helm of a ship.
import { clamp, angleDiff } from '../core/math.js';
import { findInteraction } from './interact.js';

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
    const l = Math.hypot(mx, my);
    if (l > 0) { mx /= l; my /= l; }
    if (v3 && l > 0) {
      // W walks where the camera looks, A/D strafe
      const yaw = v3.rig.yaw, fwd = -my, right = mx;
      mx = Math.cos(yaw) * fwd - Math.sin(yaw) * right;
      my = Math.sin(yaw) * fwd + Math.cos(yaw) * right;
    }
    p.intent.mx = mx; p.intent.my = my;
    p.intent.sprint = inp.isDown('Shift') && l > 0;
    // in first person you always face where you look
    if (v3 && v3.rig.mode === 'first') this.aimT = Math.max(this.aimT, 0.25);

    // aim at the mouse (melee swings snap onto a foe near that direction)
    const [wx, wy] = game.renderer.toWorld(game.world, inp.mouse.x, inp.mouse.y);
    const aim = Math.atan2(wy - (p.y - 0.5), game.world.dx(p.x, wx));
    const melee = p.style !== 'sniper';
    const aimM = melee ? this.assist(p, game, aim) : aim;
    this.aimT = Math.max(0, this.aimT - dt);
    const fighting = inp.mouseDown(0) || inp.mouseDown(2) || inp.isDown('F');
    if (fighting) this.aimT = 0.7;
    if (p.action && p.action.def.track !== false && p.action.t < (p.action.def.windup ?? 0.1)) p.facing = p.action.def.m1Chain || p.action.def.source?.startsWith('style') ? aimM : aim;
    else if (!p.action) {
      if (this.aimT > 0) p.facing = aim;
      else if (l > 0) p.facing = Math.atan2(my, mx);
    }
    this.mouseWorld = { x: wx, y: wy };

    // combat: presses are buffered for a moment, so a click made slightly
    // early still fires as soon as the current move allows it
    const buf = this.buf || (this.buf = { m1: 0, heavy: 0, dodge: 0 });
    buf.m1 = Math.max(0, buf.m1 - dt); buf.heavy = Math.max(0, buf.heavy - dt); buf.dodge = Math.max(0, buf.dodge - dt);
    if (inp.mousePressed(0)) buf.m1 = 0.22;
    if (inp.mousePressed(2)) buf.heavy = 0.25;
    if (inp.wasPressed('Space')) buf.dodge = 0.16;
    if (buf.dodge > 0 && p.tryDodge(game, mx, my)) { buf.dodge = 0; buf.m1 = 0; }
    if (buf.heavy > 0) {
      const prev = p.facing;
      p.facing = aimM;
      if (p.tryHeavy(game)) { buf.heavy = 0; buf.m1 = 0; } else if (p.action) p.facing = prev;
    }
    if (buf.m1 > 0 || (inp.mouseDown(0) && !p.action)) {
      if (!p.action) { p.facing = aimM; if (p.tryM1(game)) buf.m1 = 0; }
      else { p.tryM1(game); if (p.combo.queued) buf.m1 = 0; }
    }
    p.setBlock(inp.isDown('F'));
    for (let i = 0; i < 6; i++) {
      if (inp.wasPressed(String(i + 1))) {
        const id = p.hotbar[i];
        if (id) { p.facing = aim; const target = this.aimTarget(p, game, wx, wy); p.tryTechnique(id, game, target || { x: wx, y: wy }); }
      }
    }
    if (inp.wasPressed('R')) this.toggleHaki(p, game, 'armament');
    if (inp.wasPressed('T')) this.toggleHaki(p, game, 'observation');
    if (inp.wasPressed('G')) {
      // (nothing happens — and nothing is said — until the power awakens)
      if (p.hakiLevel('conqueror')) { p.facing = aim; p.tryTechnique('haki_conqueror', game); }
    }
    if (inp.wasPressed('Q')) game.emit('quickHeal');

    // interaction
    this.interaction = findInteraction(game, p);
    if (inp.wasPressed('E') && this.interaction) {
      inp.consume('E');
      this.interaction.run();
    }
  }

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
    const steer = s.def.turn * (game.crewMods?.turnMul || 1) * (0.35 + 0.65 * clamp(Math.abs(s.speed) / 3, 0, 1));
    s.heading += turn * steer * dt;
    if (inp.isDown('W') || inp.isDown('ArrowUp')) { s.sail = Math.min(1, s.sail + dt * 0.9); s.anchored = false; }
    if (inp.isDown('S') || inp.isDown('ArrowDown')) s.sail = Math.max(0, s.sail - dt * 1.2);
    s.rowing = inp.isDown('Space') ? 1 : 0;
    if (s.rowing) s.anchored = false;
    const [wx, wy] = game.renderer.toWorld(game.world, inp.mouse.x, inp.mouse.y);
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
      this.interaction.run();
    }
    // hotbar still usable for ranged techniques from the deck
    for (let i = 0; i < 6; i++) {
      if (inp.wasPressed(String(i + 1))) {
        const id = p.hotbar[i];
        if (id) { p.facing = Math.atan2(wy - p.y, game.world.dx(p.x, wx)); p.tryTechnique(id, game, { x: wx, y: wy }); }
      }
    }
    void angleDiff;
  }

  whileKnocked(p, dt, game) {
    game.emit('playerKnockedTick', dt);
  }
}
