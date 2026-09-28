// Town services: inns, doctors, shipwrights, shops, trainers, sparring.
import { addToHotbar } from './hotbar.js';
import { TRAINERS } from '../data/trainers.js';
import { STYLES } from '../data/styles.js';
import { SHIPS, SHIP_UPGRADES } from '../data/ships.js';
import { getAbility } from './abilities.js';
import { pay, earn, addItem } from './inventory.js';
import { persist, refreshPlayer } from './lineage.js';
import { Actor } from './actor.js';
import { AIController } from './ai.js';
import { makeLook } from '../data/races.js';
import { findShore } from './interact.js';
import { formatBerries } from '../core/math.js';

export class Services {
  constructor(game) {
    this.game = game;
    game.services = this;
    game.on('knockout', (a, att) => this.onKnockout(a, att));
  }
  get char() { return this.game.state.char; }
  seaMul(island) {
    const sea = island?.def?.sea || 'east_blue';
    return { east_blue: 1, north_blue: 1.2, west_blue: 1.2, south_blue: 1.2, paradise: 3, calm_belt: 4, new_world: 6, red_line: 5 }[sea] || 1;
  }

  // ------------------------------------------------------------- inn
  innPrice(island) { return Math.round(60 * this.seaMul(island)); }
  rest(island, town) {
    const g = this.game, c = this.char, p = g.player;
    const price = this.innPrice(island);
    if (!pay(g, price)) return false;
    c.rest = { x: p.x, y: p.y, name: `${town?.name || island?.name || 'an inn'}`, islandId: island?.id };
    p.hp = p.d.maxHp; p.stamina = p.d.maxStamina; p.haki = p.hakiUnlocked() ? p.d.maxHaki : 0;
    p.status = {};
    c.getUpCharges = 1 + (p.attrs.wil >= 40 ? 1 : 0) + (p.attrs.wil >= 80 ? 1 : 0);
    c.flags.dLuckUsed = false;
    c.trainedToday = 0;
    // sleep until morning
    const env = g.env;
    if (env.clock > 6) { env.day += 1; }
    env.clock = 7;
    g.ui.fade(true);
    setTimeout(() => g.ui.fade(false), 700);
    g.log(`You rest at ${c.rest.name}. This is now where you will wake if you fall. (Second winds restored: ${c.getUpCharges})`, '#a5d6a7');
    g.emit('rested', island);
    persist(g);
    return true;
  }

  // ---------------------------------------------------------- doctor
  healPrice(island) { const p = this.game.player; return Math.round((p.d.maxHp - p.hp) * 0.6 * this.seaMul(island) + 20); }
  heal(island) {
    const g = this.game, p = g.player;
    if (!pay(g, this.healPrice(island))) return false;
    p.hp = p.d.maxHp; p.status = {};
    g.log('The doctor patches you up.', '#a5d6a7');
    return true;
  }
  lifePrice(doc) { return doc.lifePrice ?? 400000; }
  restoreLife(doc) {
    const g = this.game, c = this.char;
    if (c.lives >= c.maxLives) { g.log('Your vivre cards are all whole.', '#b0bec5'); return false; }
    const key = 'lifeRestored_' + doc.id;
    if (c.flags[key]) { g.log(`${doc.name} has already done all they can for you.`, '#b0bec5'); return false; }
    if (!pay(g, this.lifePrice(doc))) return false;
    c.flags[key] = true;
    c.lives += 1;
    g.ui.toast('A VIVRE CARD MENDS', `${doc.name} brought you back from the brink.`, '#a5d6a7');
    persist(g);
    return true;
  }

  // -------------------------------------------------------- shipwright
  /** What a yard builds: the small ships everywhere, the big ones in the Grand Line. */
  shipsFor(island) {
    const sea = island?.def?.sea || 'east_blue', id = island?.id || '';
    const list = ['dinghy', 'sloop', 'caravel'];
    if (sea !== 'east_blue') list.push('brigantine');
    // the big ships: a carrack wherever there's real trade, the warships in the Grand Line
    if (sea !== 'east_blue' || id === 'loguetown') list.push('carrack');
    if (sea === 'paradise' || sea === 'new_world') list.push('frigate', 'galleon', 'war_galleon');
    if (sea === 'new_world' || id === 'water_7') list.push('man_o_war');
    if (sea === 'new_world') list.push('great_galleon');
    return list.sort((a, b) => SHIPS[a].price - SHIPS[b].price);
  }
  shipPrice(type, island) { return Math.round(SHIPS[type].price * (1 + (this.seaMul(island) - 1) * 0.3)); }
  // (ships are bought from the shipwright on the pier, who launches them there: see shipwrights.js)
  repairPrice(ship, island) { return Math.round((ship.maxHull - ship.hull) * 8 * this.seaMul(island)); }
  repair(ship, island) {
    const g = this.game;
    if (!pay(g, this.repairPrice(ship, island))) return false;
    ship.hull = ship.maxHull;
    g.log(`${ship.name} is as good as new.`, '#a5d6a7');
    return true;
  }
  /** Cannonballs to fill a ship's hold (60 berries apiece in the Blues). */
  shotPrice(ship, island) { return Math.round(Math.max(0, ship.shotCap - ship.shot) * 60 * this.seaMul(island)); }
  restock(ship, island) {
    const g = this.game;
    if (!(ship.shotCap > ship.shot) || !pay(g, this.shotPrice(ship, island))) return false;
    ship.shot = ship.shotCap;
    g.log(`The ${ship.name}'s hold is stocked with cannonballs (${ship.shot}).`, '#a5d6a7');
    g.audio?.sfx('coin');
    persist(g);
    return true;
  }
  upgradePrice(id, island) { return Math.round(SHIP_UPGRADES[id].price * (1 + (this.seaMul(island) - 1) * 0.2)); }
  upgrade(ship, id, island) {
    const g = this.game;
    if (ship.upgrades.includes(id) && id !== 'coating') return false;
    if (!pay(g, this.upgradePrice(id, island))) return false;
    if (id === 'coating') ship.coated = true;
    else { ship.upgrades.push(id); const frac = ship.hull / ship.maxHull; ship.applyDef(); ship.hull = ship.maxHull * frac; }
    g.log(`${SHIP_UPGRADES[id].name} fitted to the ${ship.name}.`, '#a5d6a7');
    persist(g);
    return true;
  }

  // ---------------------------------------------------------- trainers
  trainer(id) { return TRAINERS[id]; }
  canLearnStyle(tid, style) {
    const t = TRAINERS[tid], c = this.char;
    if (c.masteries[style] !== undefined) return { ok: false, why: 'Already learned' };
    if (t.marineOnly && c.faction !== 'marine') return { ok: false, why: 'Marines only' };
    for (const [s, m] of Object.entries(t.requires?.mastery || {})) if ((c.masteries[s] || 0) < m) return { ok: false, why: `Needs ${STYLES[s].name} mastery ${m}` };
    const st = STYLES[style];
    if (st.weapon === 'sword' && st.swords > 1) {
      const swords = (c.inventory || []).filter((i) => i.id && /sword|katana|cutlass|saber|kitetsu|yubashiri|shigure|wado|shusui|enma|yoru/.test(i.id)).length;
      if (swords < st.swords) return { ok: true, warn: `You will need ${st.swords} swords to use it.` };
    }
    return { ok: true };
  }
  stylePrice(tid, style) {
    const base = TRAINERS[tid].styles[style];
    return Math.round(base * (this.char.race === 'human' ? 0.85 : 1) * (this.char.race === 'fishman' && style === 'fishman_karate' ? 0.5 : 1));
  }
  learnStyle(tid, style) {
    const g = this.game, c = this.char;
    const chk = this.canLearnStyle(tid, style);
    if (!chk.ok) { g.log(chk.why, '#ff8a80'); return false; }
    if (!pay(g, this.stylePrice(tid, style))) return false;
    c.masteries[style] = 0;
    g.player.masteries = c.masteries;
    g.ui.toast('NEW STYLE', STYLES[style].name, '#90caf9');
    g.log(`You can switch to ${STYLES[style].name} in the Skills menu (K).`, '#90caf9');
    persist(g);
    return true;
  }
  techInfo(id) {
    const d = getAbility(id);
    if (!d) return null;
    const style = d.style;
    const learn = d.learn || { mastery: 0, price: 0 };
    return { d, style, learn };
  }
  canLearnTech(id) {
    const c = this.char;
    const info = this.techInfo(id);
    if (!info) return { ok: false, why: '?' };
    if (c.techniques.includes(id)) return { ok: false, why: 'Known' };
    const { d, learn } = info;
    if (d.hakiType) {
      if (!c.haki[d.hakiType]) return { ok: false, why: `Needs ${d.hakiType} Haki` };
      if ((c.haki[d.hakiType] || 0) < (learn.level || 0)) return { ok: false, why: `Needs ${d.hakiType} Haki level ${learn.level}` };
      return { ok: true };
    }
    if (d.style && c.masteries[d.style] === undefined) return { ok: false, why: `Learn ${STYLES[d.style]?.name} first` };
    if ((c.masteries[d.style] || 0) < (learn.mastery || 0)) return { ok: false, why: `Needs ${STYLES[d.style]?.name} mastery ${learn.mastery}` };
    if (learn.special === 'full_moon' && !(this.game.env.fullMoon && this.game.env.isNight)) return { ok: false, why: 'Only under a full moon' };
    return { ok: true };
  }
  techPrice(id) { const i = this.techInfo(id); return Math.round((i?.learn?.price ?? 1000) * (this.char.race === 'human' ? 0.85 : 1)); }
  learnTech(id) {
    const g = this.game, c = this.char;
    const chk = this.canLearnTech(id);
    if (!chk.ok) { g.log(chk.why, '#ff8a80'); return false; }
    if (!pay(g, this.techPrice(id))) return false;
    c.techniques.push(id);
    const d = getAbility(id);
    addToHotbar(c, id);
    refreshPlayer(g);
    g.ui.toast('TECHNIQUE LEARNED', d.name, '#90caf9');
    persist(g);
    return true;
  }
  trainPrice(attr) { return Math.round(120 + (this.char.attrs[attr] || 5) * 90); }
  trainsLeft() { return Math.max(0, 3 - (this.char.trainDay === this.game.env.day ? this.char.trainCount || 0 : 0)); }
  train(tid, attr) {
    const g = this.game, c = this.char, t = TRAINERS[tid];
    const cap = t.train[attr] || 0;
    if ((c.attrs[attr] || 0) >= cap) { g.log(`${t.name} has nothing more to teach you about ${attr.toUpperCase()}. Seek a greater master.`, '#ff8a80'); return false; }
    if (this.trainsLeft() <= 0) { g.log('You are exhausted. Rest and train again tomorrow.', '#ff8a80'); return false; }
    if (!pay(g, this.trainPrice(attr))) return false;
    if (c.trainDay !== g.env.day) { c.trainDay = g.env.day; c.trainCount = 0; }
    c.trainCount++;
    g.progression.raiseAttr(attr, 1);
    g.env.clock += 2;
    g.fx.burst(g.player.x, g.player.y - 0.8, 12, { color: '#fff59d', speed: 3, g: 2, life: 0.5, kind: 'star' });
    persist(g);
    return true;
  }
  hakiTrainPrice(type) { return Math.round((2000 + (this.char.haki[type] || 0) * 1500) * (type === 'conqueror' ? 2 : 1)); }
  hakiTrain(tid, type) {
    const g = this.game, c = this.char, t = TRAINERS[tid];
    const cap = t.haki?.[type] || 0;
    if (type === 'conqueror' && !c.haki.conqueror) { g.log(`${t.name}: "Conqueror's Haki cannot be taught. Either it lives in you or it doesn't."`, '#ff8a80'); return false; }
    if (!c.haki[type]) {
      const need = type === 'armament' ? 18 : 14;
      if (c.attrs.wil < need) { g.log(`${t.name}: "Your will isn't ready. Come back when your Willpower is ${need}."`, '#ff8a80'); return false; }
      if (!pay(g, this.hakiTrainPrice(type) * 3)) return false;
      g.progression.awakenHaki(type, 5, `Trained by ${t.name}`);
      return true;
    }
    if (c.haki[type] >= cap) { g.log(`${t.name} can take your ${type} Haki no further.`, '#ff8a80'); return false; }
    if (this.trainsLeft() <= 0) { g.log('You are exhausted. Rest and train again tomorrow.', '#ff8a80'); return false; }
    if (!pay(g, this.hakiTrainPrice(type))) return false;
    if (c.trainDay !== g.env.day) { c.trainDay = g.env.day; c.trainCount = 0; }
    c.trainCount++;
    g.progression.addHaki(type, 5, cap);
    g.env.clock += 3;
    persist(g);
    return true;
  }

  // ------------------------------------------------------------ sparring
  canSpar(tid) {
    const c = this.char;
    const rec = c.trained[tid] || {};
    if (rec.sparDay === this.game.env.day) return { ok: false, why: 'Already sparred today' };
    if (this.game.sparring) return { ok: false, why: 'Already in a spar' };
    return { ok: true };
  }
  startSpar(tid) {
    const g = this.game, c = this.char, p = g.player, t = TRAINERS[tid];
    const chk = this.canSpar(tid);
    if (!chk.ok) { g.log(chk.why, '#ff8a80'); return; }
    c.trained[tid] = { ...(c.trained[tid] || {}), sparDay: g.env.day };
    const sp = t.spar;
    const L = sp.level;
    const spot = findShore(g.world, p.x + 3, p.y, 5) || { x: p.x + 2, y: p.y };
    const opp = new Actor({
      x: spot.x, y: spot.y, name: sp.name, title: `Sparring partner (${t.name})`,
      look: makeLook(sp.race || 'human', L * 97 + tid.length, { top: '#eceff1', bottom: '#37474f', hat: sp.weapon === 'sword' ? 'headband' : null, hatColor: '#c62828', swords: sp.weapon === 'sword' ? 1 : 0, weapon: sp.weapon }),
      faction: 'rival', attrs: { str: L, agi: L, end: L, vit: L, wil: L }, style: sp.style, lethal: false,
      weapon: sp.weapon ? { kind: sp.weapon, power: 1.2, count: STYLES[sp.style]?.swords || 1 } : null,
      hakiSkill: sp.haki ? { armament: Math.min(80, L), observation: Math.min(80, L) } : {},
    });
    opp.masteries = { [sp.style]: Math.min(100, L * 1.3) };
    opp.techniques = [...(STYLES[sp.style]?.techniques || []).slice(0, 3).map((x) => x.id)];
    opp.controller = new AIController({ kind: 'hostile', skill: Math.min(0.85, 0.3 + L / 100), aggroRange: 20, moves: opp.techniques, leash: 0 });
    opp.controller.target = p;
    opp.provoked = true;
    opp.spar = tid;
    opp.showName = true;
    opp.armament = !!sp.haki && p.hakiUnlocked();
    opp.game = g;
    g.addActor(opp);
    g.sparring = { opp, tid, start: g.time };
    g.bossTarget = opp;
    g.ui.banner('SPAR!', t.name, 'A duel with no killing. Knock them down to win.', 3);
    g.audio?.sfx('fanfare');
  }
  onKnockout(a) {
    const g = this.game, s = g.sparring;
    if (!s) return;
    if (a === s.opp) this.endSpar(true);
    else if (a.isPlayer) this.endSpar(false);
  }
  endSpar(won) {
    const g = this.game, s = g.sparring, c = this.char, p = g.player, t = TRAINERS[s.tid];
    g.sparring = null;
    g.bossTarget = null;
    const opp = s.opp;
    const power = opp.power(), mine = p.power();
    const ratio = power / Math.max(1, mine);
    setTimeout(() => { opp.alive = false; }, 1500);
    const style = g.progression.styleInUse();
    if (won) {
      const m = Math.max(2, Math.min(12, 6 * ratio));
      g.progression.addStyleMastery(style, m);
      if (c.fruit) g.progression.addFruitMastery(m * 0.5);
      const keys = Object.keys(t.train).filter((k) => (c.attrs[k] || 0) < t.train[k]);
      if (keys.length) g.progression.raiseAttr(keys[Math.floor(Math.random() * keys.length)], 1);
      if (ratio > 0.9) g.progression.breakthrough(1, `Beat ${opp.name} in a spar`);
      if (t.haki) for (const k of Object.keys(t.haki)) if (c.haki[k]) g.progression.addHaki(k, 2, t.haki[k]);
      g.ui.banner('Victory!', t.name, `"${t.lines?.[1] || 'Well fought.'}"`, 4);
    } else {
      // no life lost in a spar
      g.lives.k = null;
      p.state = 'idle';
      p.hp = Math.round(p.d.maxHp * 0.35);
      p.iframes = 1.5;
      g.progression.addStyleMastery(style, 1.5 * Math.min(2, ratio));
      g.ui.banner('Defeat', t.name, '"Get up. That\'s the lesson." (A spar costs no lives.)', 4);
    }
    persist(g);
  }
}

export { formatBerries, earn, addItem };
