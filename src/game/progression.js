// How characters grow — without grinding.
//  * Mastery (style / fruit) grows when you land hits on opponents who are a
//    real threat to you (threatFactor). Beating up weaklings teaches nothing.
//  * Defeating named foes and bosses grants BREAKTHROUGHS: attribute points
//    you spend in the Character screen.
//  * Trainers and sparring grant mastery and attributes (limited per day).
//  * Haki levels rise with use against worthy foes and with training.
//  * Pirates earn bounties for defeating Marines and notorious people.
import { threatFactor, ATTR_CAP } from './stats.js';
import { unlockedFruitTechniques, FRUITS } from '../data/fruits.js';
import { getAbility } from './abilities.js';
import { STYLES } from '../data/styles.js';
import { persist, refreshPlayer } from './lineage.js';
import { earn } from './inventory.js';
import { formatBerries } from '../core/math.js';
import { DREAMS } from '../data/dreams.js';

export class Progression {
  constructor(game) {
    this.game = game;
    game.on('playerHit', (target, dmg) => this.onPlayerHit(target, dmg));
    game.on('knockout', (a, att) => this.onKnockout(a, att));
  }

  get char() { return this.game.state?.char; }

  onPlayerHit(target, dmg) {
    const g = this.game, p = g.player, c = this.char;
    if (!c || !target.d) return;
    const tf = threatFactor(target.power(), p.power());
    if (tf <= 0) {
      if (!this.weakNote) { this.weakNote = true; g.hint('weak', 'Beating up weak opponents teaches you nothing. Grow by training, by fighting people stronger than you, and by overcoming the great foes of each island.'); }
      return;
    }
    const frac = Math.min(0.3, dmg / target.d.maxHp);
    const src = p.action?.def?.source || '';
    let gain = frac * tf * 6;
    if (c.traits.includes('born_fighter')) gain *= 1.15;
    if (src.startsWith('fruit') && c.fruit) {
      this.addFruitMastery(gain * 0.9);
    } else if (src.startsWith('haki') || p.armament) {
      this.addHaki(p.armament ? 'armament' : (getAbility(p.action?.def?.id)?.hakiType || 'armament'), gain * 0.5);
      if (!src.startsWith('haki')) this.addStyleMastery(p.style, gain * 0.6);
    } else {
      let m = gain;
      if (c.dream === 'swordsman' && STYLES[p.style]?.weapon === 'sword') m *= 1.2;
      this.addStyleMastery(p.style, m);
    }
    if (p.observation) this.addHaki('observation', gain * 0.3);
  }

  addStyleMastery(style, amt) {
    const p = this.game.player;
    const before = p.masteries[style] || 0;
    const after = Math.min(100, before + amt);
    p.masteries[style] = after;
    if (Math.floor(after / 5) > Math.floor(before / 5)) this.game.log(`${STYLES[style]?.name || style} mastery: ${Math.floor(after)}`, '#90caf9');
  }

  addFruitMastery(amt) {
    const g = this.game, p = g.player, c = this.char;
    const before = p.fruitMastery;
    const after = Math.min(100, before + amt);
    p.fruitMastery = after;
    c.fruitMastery = after;
    const had = new Set(unlockedFruitTechniques(c.fruit, before));
    for (const id of unlockedFruitTechniques(c.fruit, after)) {
      if (had.has(id)) continue;
      if (!c.techniques.includes(id)) c.techniques.push(id);
      const d = getAbility(id);
      g.ui.toast('NEW TECHNIQUE', `${d.icon || ''} ${d.name}`, '#ffab91');
      g.log(`Your mastery of the ${FRUITS[c.fruit].name} reveals a new technique: ${d.name}. Assign it in Skills (K).`, '#ffab91');
      const empty = c.hotbar.findIndex((x) => !x);
      if (empty >= 0) c.hotbar[empty] = id; else if (c.hotbar.length < 6) c.hotbar.push(id);
    }
  }

  addHaki(type, amt, cap = 100) {
    const g = this.game, c = this.char;
    if (!c.haki[type]) return; // must be awakened first
    const mul = 1 + (g.state.legacy?.perks?.haki || 0) * 0.25 * (c.race === 'skypiean' && type === 'observation' ? 2 : 1);
    const before = c.haki[type];
    c.haki[type] = Math.min(cap, before + amt * mul);
    if (Math.floor(c.haki[type] / 10) > Math.floor(before / 10)) g.log(`${type[0].toUpperCase() + type.slice(1)} Haki: level ${Math.floor(c.haki[type])}`, '#ce93d8');
  }

  awakenHaki(type, level = 5, how = '') {
    const g = this.game, c = this.char, p = g.player;
    if (c.haki[type]) return false;
    c.haki[type] = level;
    p.hakiSkill = c.haki;
    p.haki = p.d.maxHaki;
    const names = { armament: 'ARMAMENT HAKI', observation: 'OBSERVATION HAKI', conqueror: "CONQUEROR'S HAKI" };
    g.ui.toast(names[type], how || 'Your will takes shape.', type === 'conqueror' ? '#ff5252' : '#ce93d8');
    g.log(`${names[type]} awakened! Toggle it with ${type === 'armament' ? 'R' : type === 'observation' ? 'T' : 'G'}.`, '#ce93d8');
    g.emit('hakiAwakened', type);
    persist(g);
    return true;
  }

  /** Attribute points to spend. */
  breakthrough(points, why) {
    const g = this.game, c = this.char;
    if (c.dream === 'warrior') points += 1;
    c.unspent = (c.unspent || 0) + points;
    g.ui.toast('BREAKTHROUGH!', `${why ? why + ' — ' : ''}+${points} attribute point${points > 1 ? 's' : ''} (open Character: C)`, '#ffd54f');
    g.audio?.sfx('breakthrough');
  }

  raiseAttr(key, amt = 1, silent) {
    const g = this.game, c = this.char;
    c.attrs[key] = Math.min(ATTR_CAP, (c.attrs[key] || 0) + amt);
    if (!silent) g.log(`${key.toUpperCase()} +${amt} (${c.attrs[key]})`, '#a5d6a7');
    refreshPlayer(g);
  }

  addBounty(amount, why) {
    const g = this.game, c = this.char;
    if (c.faction === 'marine') return;
    if (c.dream === 'king') amount *= 1.15;
    amount = Math.round(amount / 1000) * 1000;
    if (amount <= 0) return;
    const first = !c.bounty;
    c.bounty = (c.bounty || 0) + amount;
    if (c.faction !== 'pirate') c.faction = 'pirate';
    g.ui.toast(first ? 'WANTED!' : 'BOUNTY RAISED', `${formatBerries(c.bounty)}${why ? ' — ' + why : ''}`, '#ffd54f');
    g.emit('bountyChanged', c.bounty, first);
  }

  onKnockout(a, att) {
    const g = this.game, p = g.player, c = this.char;
    // the crew's victories (followers, summons) are the captain's victories
    if (att && !att.isPlayer && (att.crewId || att.summonedBy?.isPlayer)) att = p;
    if (!c || !att || !att.isPlayer || a.isPlayer || a.faction === 'player') return;
    c.stats.kills = (c.stats.kills || 0) + 1;
    if (a.npcId) c.defeated[a.npcId] = (c.defeated[a.npcId] || 0) + 1;
    const tf = threatFactor(a.power(), p.power());
    // bounty for attacking the Marines / World Government
    if (a.faction === 'marine' || a.faction === 'cp') {
      const b = a.bountyValue ?? Math.round(4000 * Math.pow(Math.max(1, a.tier), 2.4));
      this.addBounty(b, a.boss ? `defeated ${a.name}` : null);
    }
    if (a.bountyValue && a.faction !== 'marine' && a.faction !== 'cp' && a.infamy) this.addBounty(a.bountyValue, `defeated ${a.name}`);
    if (a.reward) earn(g, a.reward, `from ${a.name}`);
    if (a.boss && !c.bosses.includes(a.npcId || a.name)) {
      c.bosses.push(a.npcId || a.name);
      this.breakthrough(a.breakthrough ?? 3, `Defeated ${a.name}`);
      const style = p.style;
      this.addStyleMastery(style, 4);
      if (c.fruit) this.addFruitMastery(4);
      g.emit('bossDefeated', a);
      this.checkDream();
      persist(g);
    } else if (a.named && tf > 0.3) {
      this.breakthrough(1, `Defeated ${a.name}`);
    } else if (tf > 0.9 && Math.random() < 0.15 * tf) {
      this.breakthrough(1, 'A hard-fought victory');
    }
  }

  checkDream() {
    const g = this.game, c = this.char;
    if (c.dreamDone) return;
    const d = c.dream;
    let done = false;
    if (d === 'warrior' && (c.bosses || []).length >= 12) done = true;
    if (d === 'world_map' && (c.discovered || []).length >= 60) done = true;
    if (d === 'liberation' && (c.liberated || []).length >= 6) done = true;
    if (d === 'true_history' && (c.flags.poneglyphsRead || 0) >= 8) done = true;
    if (d === 'swordsman' && (c.bosses || []).includes('mihawk')) done = true;
    if (d === 'admiral' && c.marineRank === 'Admiral') done = true;
    if (d === 'king' && c.flags.laughTale) done = true;
    if (d === 'all_blue' && c.flags.allBlue) done = true;
    if (done) {
      c.dreamDone = true;
      g.ui.toast('DREAM FULFILLED', `${DREAMS[d].icon} ${DREAMS[d].name}`, '#ffd54f');
      g.log('You have become a legend. You may keep sailing — or retire from the Menu and pass your will on.', '#ffd54f');
      persist(g);
    }
  }
}
