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

    // movement
    let mx = 0, my = 0;
    if (inp.isDown('W') || inp.isDown('ArrowUp')) my -= 1;
    if (inp.isDown('S') || inp.isDown('ArrowDown')) my += 1;
    if (inp.isDown('A') || inp.isDown('ArrowLeft')) mx -= 1;
    if (inp.isDown('D') || inp.isDown('ArrowRight')) mx += 1;
    const l = Math.hypot(mx, my);
    if (l > 0) { mx /= l; my /= l; }
    p.intent.mx = mx; p.intent.my = my;
    p.intent.sprint = inp.isDown('Shift') && l > 0;

    // aim at the mouse
    const [wx, wy] = game.renderer.toWorld(game.world, inp.mouse.x, inp.mouse.y);
    const aim = Math.atan2(wy - (p.y - 0.5), game.world.dx(p.x, wx));
    this.aimT = Math.max(0, this.aimT - dt);
    const fighting = inp.mouseDown(0) || inp.mouseDown(2) || inp.isDown('F');
    if (fighting) this.aimT = 0.7;
    if (p.action && p.action.def.track !== false && p.action.t < (p.action.def.windup ?? 0.1)) p.facing = aim;
    else if (!p.action) {
      if (this.aimT > 0) p.facing = aim;
      else if (l > 0) p.facing = Math.atan2(my, mx);
    }
    this.mouseWorld = { x: wx, y: wy };

    // combat
    if (inp.mousePressed(0) || (inp.mouseDown(0) && !p.action)) { p.facing = aim; p.tryM1(game); }
    if (inp.mousePressed(2)) { p.facing = aim; p.tryHeavy(game); }
    p.setBlock(inp.isDown('F'));
    if (inp.wasPressed('Space')) p.tryDodge(game, mx, my);
    for (let i = 0; i < 6; i++) {
      if (inp.wasPressed(String(i + 1))) {
        const id = p.hotbar[i];
        if (id) { p.facing = aim; const target = this.aimTarget(p, game, wx, wy); p.tryTechnique(id, game, target || { x: wx, y: wy }); }
      }
    }
    if (inp.wasPressed('R')) this.toggleHaki(p, game, 'armament');
    if (inp.wasPressed('T')) this.toggleHaki(p, game, 'observation');
    if (inp.wasPressed('G')) {
      if (p.hakiLevel('conqueror')) { p.facing = aim; p.tryTechnique('haki_conqueror', game); }
      else game.log('You feel something stir deep inside... but nothing comes out. (Conqueror\'s Haki not awakened)', '#b0bec5');
    }
    if (inp.wasPressed('Q')) game.emit('quickHeal');

    // interaction
    this.interaction = findInteraction(game, p);
    if (inp.wasPressed('E') && this.interaction) {
      inp.consume('E');
      this.interaction.run();
    }
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
    if (!p.hakiLevel(type)) {
      game.log(type === 'armament' ? 'You have not awakened Armament Haki yet. Seek a master in the Grand Line.' : 'You have not awakened Observation Haki yet. The priests of Skypiea call it "Mantra".', '#b0bec5');
      return;
    }
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
    const steer = s.def.turn * (0.35 + 0.65 * clamp(Math.abs(s.speed) / 3, 0, 1));
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
