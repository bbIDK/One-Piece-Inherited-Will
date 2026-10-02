// Knockdowns and lives. When your health hits zero you are knocked down.
// Mash SPACE to get back up (limited "second winds" per life). If an enemy
// reaches you first they finish you — one vivre card burns. Marines arrest
// wanted pirates instead of killing them. Lose your last life and your
// journey ends; your will passes to the next generation.
import { hostile } from './entity.js';
import { persist, endLineage, snapshot } from './lineage.js';
import { formatBerries, roundBounty } from '../core/math.js';
import { findShore } from './interact.js';
import { conquerorBurst } from './abilities.js';

export class LivesSystem {
  constructor(game) {
    this.game = game;
    this.k = null;
    game.on('knockout', (a, att) => { if (a.isPlayer) this.onKnocked(att); });
    game.on('playerKnockedTick', (dt) => this.tick(dt));
    game.knockInfo = () => this.info();
  }

  onKnocked(att) {
    const g = this.game, p = g.player, c = p.char;
    c.stats.knockdowns = (c.stats.knockdowns || 0) + 1;
    const threat = att && att.power ? att.power() / Math.max(1, p.power()) : 0;
    // King's Disposition: the first real test of your will awakens Conqueror's Haki
    if (c.traits.includes('conqueror') && !c.haki.conqueror && !p.drowned && (threat > 0.65 || att?.boss)) {
      this.awaken();
      return;
    }
    this.k = { t: 0, max: p.drowned ? 2.5 : 6, mash: 0, need: 9 + Math.floor((c.stats.knockdowns || 0) / 3), killer: att, drowned: p.drowned, cause: describe(att, p) };
    g.audio?.sfx('knocked');
    g.fx.impactFrame(0.1);
    if (!att?.spar) g.hint('knocked', "You've been knocked down! Mash SPACE to get back up before an enemy finishes you. Your second winds refill when you rest at an inn.");
  }

  info() {
    const k = this.k, c = this.game.player.char;
    if (!k) return { text: '', frac: 0 };
    if (k.drowned) return { text: this.game.player?.fruit ? 'The sea drags you down... a Devil Fruit user cannot swim.' : 'Your lungs burn... the sea closes over you.', frac: 1 - k.t / k.max };
    const charges = c.getUpCharges || 0;
    const txt = charges > 0 ? `Mash SPACE to get up! (${k.mash}/${k.need}) · Second winds left: ${charges}` : 'No strength left to stand...';
    return { text: txt, frac: 1 - k.t / k.max };
  }

  tick(dt) {
    const k = this.k;
    if (!k) return;
    const g = this.game, p = g.player, c = p.char;
    k.t += dt;
    if (!k.drowned && (c.getUpCharges || 0) > 0 && g.input.wasPressed('Space')) {
      k.mash++;
      g.fx.shake(0.1);
      if (k.mash >= k.need) { this.getUp(); return; }
    }
    // an enemy standing over you finishes you early
    if (!k.drowned && k.t > 2.2) {
      const finisher = g.actorsNear(p.x, p.y, 1.8).find((a) => a !== p && a.state === 'idle' && engaged(a, p) && a.lethal !== false && !a.def?.duel && !a.spar && !(a.faction === 'marine' && c.bounty > 0));
      if (finisher && k.t > 3.5) { this.resolve(finisher); return; }
    }
    if (k.t >= k.max) this.resolve(null);
  }

  getUp() {
    const g = this.game, p = g.player, c = p.char;
    c.getUpCharges = Math.max(0, (c.getUpCharges || 0) - 1);
    this.k = null;
    p.state = 'idle';
    p.hp = Math.round(p.d.maxHp * (0.25 + p.attrs.wil * 0.004));
    p.iframes = 1.4;
    p.hitstun = 0;
    g.fx.text(p.x, p.y - 2, "I'M NOT DONE YET!", '#ffeb3b', 0.55, { life: 1.6 });
    g.fx.ring(p.x, p.y, 0.3, 3, '#ffeb3b', 0.5, 0.2);
    g.fx.shake(0.4);
    g.audio?.sfx('getup');
    c.stats.deathsAvoided = (c.stats.deathsAvoided || 0) + 1;
    g.emit('playerGotUp');
  }

  awaken() {
    const g = this.game, p = g.player, c = p.char;
    c.haki.conqueror = 5;
    p.hakiSkill = c.haki;
    p.state = 'idle';
    p.hp = p.d.maxHp;
    p.haki = p.d.maxHaki;
    p.iframes = 2;
    this.k = null;
    g.ui.toast("CONQUEROR'S HAKI", 'Your will overwhelms everything around you!', '#ff5252');
    g.fx.impactFrame(0.25);
    g.fx.flash = 0.4;
    conquerorBurst(p, g, { range: 12, damage: 20 }, 1);
    g.log("King's Disposition awakened: press G to release Conqueror's Haki.", '#ff8a80');
    g.emit('conquerorAwakened');
    persist(g);
  }

  resolve(finisher) {
    const g = this.game, p = g.player, c = p.char;
    const k = this.k;
    this.k = null;
    if (k.drowned) return this.loseLife(g.player?.fruit ? 'Drowned — the sea swallowed a Devil Fruit user.' : 'Drowned.');
    const threats = g.actorsNear(p.x, p.y, 10).filter((a) => a !== p && a.state === 'idle' && engaged(a, p));
    const marine = threats.find((a) => a.faction === 'marine');
    if (marine && c.bounty > 0) return this.capture(marine);
    const killer = finisher || threats.find((a) => a.lethal !== false && !a.def?.duel && !a.spar);
    if (killer) {
      if (c.traits.includes('will_of_d') && !c.flags.dLuckUsed) {
        c.flags.dLuckUsed = true;
        g.fx.text(p.x, p.y - 2, '...Shishishi.', '#ffffff', 0.5, { life: 2 });
        g.log('As the blow falls you grin — and somehow it misses. Fate is not done with the Will of D. (once per life)', '#ffe082');
        this.k = null;
        p.state = 'idle'; p.hp = Math.round(p.d.maxHp * 0.2); p.iframes = 2;
        return;
      }
      g.fx.impactFrame(0.15);
      return this.loseLife(`Finished off by ${killer.name}${killer.title ? ', ' + killer.title : ''}.`);
    }
    const duelist = k.killer && (k.killer.def?.duel || k.killer.spar);
    if (duelist) {
      g.log(`You lost the bout against ${k.killer.name}. Nothing hurt but your pride.`, '#b0bec5');
    } else if (threats.length) {
      const lost = Math.floor(c.berries * 0.35);
      c.berries -= lost;
      g.log(`You wake up with a splitting headache. Someone took ${formatBerries(lost)} from your purse.`, '#ff8a80');
    } else {
      g.log('You come to after a while. Nobody finished the job.', '#b0bec5');
    }
    p.state = 'idle';
    p.hp = Math.round(p.d.maxHp * 0.2);
    p.iframes = 1.5;
  }

  capture(marine) {
    const g = this.game, p = g.player, c = p.char;
    // already a prisoner: dragged back to the cell
    if (g.world.id === 'impel_down' && c.flags.imprisoned) {
      g.ui.fade(true);
      setTimeout(() => { p.state = 'idle'; p.hp = Math.round(p.d.maxHp * 0.5); p.iframes = 2; this.placeAtRest(); g.ui.fade(false); }, 900);
      return;
    }
    // notorious pirates go to the Great Prison
    if (c.bounty >= 30000000 && g.sendToImpelDown && g.world === g.surface) {
      c.bounty = roundBounty(c.bounty * 1.1);
      g.ui.fade(true);
      setTimeout(() => {
        p.state = 'idle';
        p.hp = Math.round(p.d.maxHp * 0.6);
        p.iframes = 2;
        g.sendToImpelDown(marine);
        g.ui.fade(false);
      }, 900);
      return;
    }
    const lost = Math.floor(c.berries * 0.5);
    c.berries -= lost;
    c.bounty = roundBounty(c.bounty * 1.1);
    g.ui.fade(true);
    setTimeout(() => {
      p.state = 'idle';
      p.hp = Math.round(p.d.maxHp * 0.5);
      g.env.clock += 20;
      this.placeAtRest();
      g.ui.fade(false);
      g.ui.banner('Captured!', 'MARINE BRIG', `${marine.name} arrested you. You escaped two days later — minus ${formatBerries(lost)}. Your bounty went up.`, 6);
      persist(g);
    }, 900);
  }

  loseLife(cause) {
    const g = this.game, p = g.player, c = p.char;
    c.lives -= 1;
    c.getUpCharges = 0;
    p.state = 'knocked';
    snapshot(g);
    g.audio?.sfx('death');
    if (c.lives <= 0) {
      const will = endLineage(g, cause);
      g.emit('lineageEnded', { cause, will });
      return;
    }
    // written straight away: no reloading to undo a death
    persist(g);
    g.emit('lifeLost', { cause, lives: c.lives });
  }

  respawn() {
    const g = this.game, p = g.player, c = p.char;
    const lost = Math.floor(c.berries * 0.25);
    c.berries -= lost;
    p.state = 'idle';
    p.hp = p.d.maxHp;
    p.status = {};
    p.buffs = [];
    p.recalc();
    p.iframes = 3;
    p.drowned = false; p.sinking = false; p.lowAir = false; p.oxygen = p.maxOxygen;
    p.getUpCharges = c.getUpCharges = 1 + (p.attrs.wil >= 40 ? 1 : 0);
    c.flags.dLuckUsed = false;
    g.env.clock += 10;
    this.placeAtRest();
    if (lost) g.log(`You recovered, but ${formatBerries(lost)} went on doctors and debts.`, '#b0bec5');
    persist(g);
  }

  placeAtRest() {
    const g = this.game, p = g.player, c = p.char;
    // prisoners wake up back in their cell — getting beaten is not a jailbreak
    if (g.world.id === 'impel_down' && c.flags.imprisoned) {
      const isl = g.world.islands.find((i) => i.id === 'id_level1');
      const cell = isl?.spots?.cell || { x: isl?.x ?? p.x, y: isl?.y ?? p.y };
      p.mode = 'foot'; p.onShip = false;
      p.x = cell.x; p.y = cell.y;
      for (const a of g.actorsNear(p.x, p.y, 16)) if (a.controller?.target === p) { a.controller.target = null; a.controller.state = 'return'; }
      g.snapCamera();
      g.log('You wake up back in your cell on Level 1. The guards laugh through the bars.', '#ff8a80');
      return;
    }
    if (g.world !== g.surface) g.leaveZone?.(true);
    const r = c.rest || c.spawn;
    if (p.onShip && p.ship) { p.ship.captain = null; p.onShip = false; }
    p.mode = 'foot';
    p.x = r.x; p.y = r.y;
    // make sure the player has some way to sail again (a ship laid up in the
    // yards counts: any pier's shipwright can bring her round)
    if (!(c.fleet || []).length && !g.ships.some((s) => s.owner === 'player' && !s.sunk)) {
      const isl = g.world.nearestIsland(r.x, r.y, 200);
      const dock = isl && isl.docks[0];
      if (dock) {
        g.giveShip?.('dinghy', dock.moor.x, dock.moor.y, 'Borrowed Rowboat');
        g.log('A kind fisherman lends you his rowboat.', '#b0bec5');
      }
    }
    // hostile mobs don't camp your bed (and the fight you lost is over)
    for (const a of g.actorsNear(p.x, p.y, 12)) if (a.controller?.target === p) { a.controller.target = null; a.controller.state = 'return'; }
    if (g.bossTarget?.controller?.target === p) { g.bossTarget.controller.target = null; g.bossTarget.controller.state = 'return'; }
    g.bossTarget = null;
    g.snapCamera();
    void findShore;
  }
}

/** Someone actually fighting the player (not a peaceful NPC of a hostile faction standing nearby). */
function engaged(a, p) {
  return hostile(a, p) && (a.aggroPlayer || a.provoked || a.controller?.target === p || a.summonedBy);
}

function describe(att, p) {
  if (!att) return p.inWater ? 'Lost at sea.' : 'Collapsed.';
  return `${att.name}${att.title ? ', ' + att.title : ''}`;
}
