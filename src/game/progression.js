// How characters grow — by doing, never by grinding or spending points.
//  * Attributes train themselves from what you do in real fights: landing
//    blows (Strength, or Agility with ranged weapons), slipping past attacks
//    (Agility), blocking (Endurance), taking punishment (Vitality) and getting
//    back up or facing someone stronger (Willpower). Only opponents who are a
//    real threat count — beating up weaklings teaches nothing.
//  * Weapon mastery: the more you fight with fists, legs, swords, guns,
//    staffs or axes, the harder that kind of weapon hits.
//  * Style mastery unlocks techniques. A Devil Fruit's base techniques are
//    all yours on eating it; its mastery makes them stronger and opens up its
//    forms (Gum-Gum's Gears...), and at its height, in a hard fight, its
//    awakening (data/fruitForms.js).
//  * Great victories (bosses, story quests, spars) are BREAKTHROUGHS: your
//    body surges in the directions you have been training.
//  * Haki is never taught to a nobody: Armament stirs in those who have grown
//    strong enough, Observation in those who have learned to read attacks —
//    at a random moment of a hard fight, like in the stories.
//  * Legends: great feats the world remembers.
import { threatFactor, ATTR_CAP, ATTRS } from './stats.js';
import { FRUITS, AWAKEN_MASTERY, unlockedFruitTechniques } from '../data/fruits.js';
import { keysOf, keyLabel } from './keys.js';
import { getAbility, weaponKindOf } from './abilities.js';
import { STYLES } from '../data/styles.js';
import { persist, refreshPlayer, hakiKnown, needsHaki, setDrawn, weaponFromChar, SWORD_FORMS } from './lineage.js';
import { earn } from './inventory.js';
import { formatBerries, roundBounty } from '../core/math.js';
import { bountySea } from './reputation.js';
import { LEGENDS } from '../data/dreams.js';
import { HAKI_HOW } from './haki.js';

/** How far a training dummy can take a style (the basics: past it, only real fights or a master). */
export const DUMMY_CAP = 15;

const KEYS = ['str', 'agi', 'end', 'vit', 'wil'];
/** The key of hotbar slot `i` ('1'...'9', '0'). */
// (the key that switches the fruit's forms: B unless moved)
const formKey = (g) => keyLabel(keysOf(g.settings).form?.[0] || 'B');
export const WEAPON_KINDS = { fists: 'Fists', legs: 'Legs', sword: 'Swords', gun: 'Guns', staff: 'Staffs', axe: 'Axes' };

export class Progression {
  constructor(game) {
    this.game = game;
    game.on('playerHit', (target, dmg) => this.onPlayerHit(target, dmg));
    game.on('knockout', (a, att) => this.onKnockout(a, att));
    game.on('playerEvaded', (att) => this.onEvade(att));
    game.on('playerBlocked', (att) => this.onBlocked(att));
    game.on('parry', (att) => this.onParry(att));
    game.on('playerHurt', (att, n) => this.onHurt(att, n));
    game.on('playerGotUp', () => this.train('wil', 10, true));
    // how each Haki is obtained, told once: when one first wakes in you, or someone else's first presses on you
    game.hintHaki = () => game.hint('haki_how', `HAKI, the power of will. Armament: ${HAKI_HOW.armament} Observation: ${HAKI_HOW.observation} Conqueror's: ${HAKI_HOW.conqueror} (Character menu, C: Haki.)`);
    game.on('hakiAwakened', () => { game.hintHaki(); this.openForms(); });
    game.on('conquerorAwakened', () => { game.hintHaki(); this.openForms(); });
    game.on('questDone', () => this.checkDream());
    let t = 0;
    game.on('tick', (dt) => { if ((t += dt) > 5) { t = 0; this.checkDream(); } });
    // (techniques catch up with mastery — and the sword form with the swords you carry — a few times a second)
    let su = 0, first = true;
    game.on('tick', (dt) => { if ((su += dt) > 0.5) { su = 0; this.syncUnlocks(first); first = false; } });
  }

  get char() { return this.game.state?.char; }

  /** How much a fight against this actor is worth (0 = nothing to learn). */
  worth(a) {
    const p = this.game.player;
    if (!a || !a.power || !p) return 0;
    return threatFactor(a.power(), p.power());
  }

  // ------------------------------------------------------------ fighting
  onPlayerHit(target, dmg) {
    const g = this.game, p = g.player, c = this.char;
    if (!c || !target.d) return;
    const tf = this.worth(target);
    if (tf <= 0) {
      if (!this.weakNote) { this.weakNote = true; g.hint('weak', 'Beating up weak opponents teaches you nothing. You grow by training and by fighting people who are a real threat to you.'); }
      return;
    }
    const frac = Math.min(0.3, dmg / target.d.maxHp);
    const def = p.action?.def || {};
    const src = def.source || '';
    let gain = frac * tf * 6;
    if (c.traits.includes('born_fighter')) gain *= 1.15;
    if (src.startsWith('fruit') && c.fruit) {
      this.addFruitMastery(gain * 0.9);
      this.train('wil', frac * tf * 18);
    } else if (src.startsWith('haki')) {
      this.addHaki(getAbility(def.id)?.hakiType || 'armament', gain * 0.5);
      this.train('wil', frac * tf * 20);
    } else {
      // practice goes to the style you fight with; the plain moves of a weapon
      // whose style you never learned train only the weapon (and a technique
      // still trains its own style)
      const style = p.masteries[p.style] !== undefined ? p.style : def.style;
      if (p.masteries[style] !== undefined) this.addStyleMastery(style, gain);
      const kind = weaponKindOf(p, def);
      this.addWeaponMastery(kind, gain * 1.2);
      this.train(kind === 'gun' ? 'agi' : 'str', frac * tf * 40);
      if (p.armament) this.addHaki('armament', gain * 0.5);
      this.maybeAwaken('armament', tf);
    }
    if (p.observation) this.addHaki('observation', gain * 0.3);
  }

  onEvade(att) {
    const tf = this.worth(att);
    if (tf <= 0) return;
    const c = this.char;
    c.stats.evades = (c.stats.evades || 0) + 1;
    this.train('agi', 4 * tf);
    this.maybeAwaken('observation', tf);
  }

  onBlocked(att) {
    const tf = this.worth(att);
    if (tf > 0) this.train('end', 3 * tf);
  }

  onParry(att) {
    const tf = this.worth(att);
    if (tf <= 0) return;
    this.train('agi', 3 * tf);
    this.train('end', 2 * tf);
    this.maybeAwaken('observation', tf * 1.5);
  }

  onHurt(att, n) {
    const p = this.game.player;
    const tf = att ? this.worth(att) : 0.5;
    if (tf <= 0 || !p.d) return;
    this.train('vit', Math.min(0.4, n / p.d.maxHp) * 45 * tf);
    // (a mastered fruit, its user at the edge against a worthy foe: it may awaken)
    if (p.state === 'idle' && p.hp <= p.d.maxHp * 0.25) this.maybeAwakenFruit(att, 'edge');
  }

  // ------------------------------------------------------------ training
  /** Add practice to an attribute; it rises by itself once practice is enough. */
  train(key, amt, silent) {
    const c = this.char;
    if (!c || !(amt > 0)) return;
    c.train = c.train || { str: 0, agi: 0, end: 0, vit: 0, wil: 0 };
    c.train[key] = (c.train[key] || 0) + amt;
    // recent practice also steers where breakthroughs go
    c.recent = c.recent || {};
    c.recent[key] = (c.recent[key] || 0) * 0.995 + amt;
    let need = 14 + c.attrs[key] * 3.5;
    let ups = 0;
    while (c.train[key] >= need && c.attrs[key] < ATTR_CAP) {
      c.train[key] -= need;
      c.attrs[key] += 1;
      ups++;
      need = 14 + c.attrs[key] * 3.5;
    }
    if (ups) {
      refreshPlayer(this.game);
      if (!silent || ups) this.game.log(`${ATTRS[key].name} +${ups} (${c.attrs[key]})`, '#a5d6a7');
    }
  }

  /** Progress (0..1) towards the next point of an attribute, for the UI. */
  trainProgress(key) {
    const c = this.char;
    if (!c) return 0;
    return Math.min(1, (c.train?.[key] || 0) / (14 + c.attrs[key] * 3.5));
  }

  /** The style practice goes to: the one you fight with — or, with a weapon whose style you never learned, the one you picked. */
  styleInUse() {
    const p = this.game.player;
    return p.masteries[p.style] !== undefined ? p.style : this.char?.style || 'brawler';
  }

  /** A blow landed on a training dummy: a little practice, up to the basics. */
  dummyHit(h) {
    const p = this.game.player, c = this.char, g = this.game;
    if (!p || !c) return;
    const style = this.styleInUse();
    const m = p.masteries[style] || 0;
    if (m >= DUMMY_CAP) {
      if (!this.dummyTold || g.time - this.dummyTold > 30) { this.dummyTold = g.time; g.log(`The dummy has taught you all it can (mastery ${DUMMY_CAP}). Find a real opponent — or a master.`, '#b0bec5'); }
      return;
    }
    const gain = h?.final ? 0.35 : 0.18;
    this.addStyleMastery(style, Math.min(gain, DUMMY_CAP - m));
    const kind = p.weapon?.kind || 'fists';
    if ((c.weaponMastery?.[kind] || 0) < DUMMY_CAP) this.addWeaponMastery?.(kind, gain * 0.8);
  }

  addStyleMastery(style, amt) {
    const p = this.game.player;
    const before = p.masteries[style] || 0;
    const after = Math.min(100, before + amt);
    p.masteries[style] = after;
    if (Math.floor(after / 5) > Math.floor(before / 5)) this.game.log(`${STYLES[style]?.name || style} mastery ${Math.floor(after)}`, '#90caf9');
    this.syncUnlocks();
  }

  /**
   * What fighting has opened: every technique of a style you know whose
   * mastery you've reached (a teacher sells the style, not its moves); every
   * move of your fruit its mastery has reached; and the sword form your
   * swords make (one, two, three: Ittoryu, Nitoryu, Santoryu — no teacher
   * needed to hold more blades). `silent`: catching up (a save loaded), no
   * fanfare.
   */
  syncUnlocks(silent = false) {
    const g = this.game, c = this.char, p = g.player;
    if (!c || !p || !c.masteries || !c.techniques) return;
    const fresh = [];
    // the sword form your blades make
    const w = weaponFromChar(c);
    if (w?.kind === 'sword') {
      const form = SWORD_FORMS[Math.min(3, Math.max(1, w.count || 1))];
      if (c.masteries[form] === undefined) {
        c.masteries[form] = 0;
        if (!silent) { g.ui?.toast?.('NEW STYLE', STYLES[form].name, '#90caf9'); g.log(`${w.count > 1 ? `${w.count} swords` : 'A sword'} in hand: you fight ${STYLES[form].name}. Its techniques open as you fight with it.`, '#90caf9'); }
      }
    }
    for (const [sid, m] of Object.entries(c.masteries)) {
      const st = STYLES[sid];
      if (!st) continue;
      for (const t of st.techniques || []) {
        const L = t.learn || {};
        if (c.techniques.includes(t.id) || L.special) continue;
        if ((L.mastery || 0) <= m) { c.techniques.push(t.id); fresh.push(t.id); }
      }
    }
    if (c.fruit) for (const id of unlockedFruitTechniques(c.fruit, c.fruitMastery || 0)) if (!c.techniques.includes(id)) { c.techniques.push(id); fresh.push(id); }
    if (!fresh.length) return;
    p.techniques = c.techniques;
    if (silent) return;
    for (const id of fresh) {
      const d = getAbility(id);
      if (!d) continue;
      g.ui?.toast?.('NEW TECHNIQUE', d.name, '#90caf9');
      g.log(`${d.name}: your ${d.fruit ? FRUITS[d.fruit]?.name : STYLES[d.style]?.name || 'training'} has grown enough for it.`, '#90caf9');
    }
    g.audio?.sfx?.('unlock');
    persist(g);
  }

  addWeaponMastery(kind, amt) {
    const c = this.char;
    c.weaponMastery = c.weaponMastery || {};
    const before = c.weaponMastery[kind] || 0;
    const after = Math.min(100, before + amt);
    c.weaponMastery[kind] = after;
    this.game.player.weaponMastery = c.weaponMastery;
    if (Math.floor(after / 5) > Math.floor(before / 5)) this.game.log(`${WEAPON_KINDS[kind] || kind} mastery ${Math.floor(after)} — your ${(WEAPON_KINDS[kind] || kind).toLowerCase()} hit harder`, '#90caf9');
  }

  /**
   * Fruit mastery: its blows grow stronger (abilities.js powerFor), and at
   * its marks the fruit's forms open up (openForms); at its height it's ready
   * to awaken, the next time a hard fight brings it out (maybeAwakenFruit).
   */
  addFruitMastery(amt) {
    const g = this.game, p = g.player, c = this.char;
    const f = FRUITS[c?.fruit];
    if (!f) return;
    const before = p.fruitMastery;
    const after = Math.min(100, before + amt);
    p.fruitMastery = after;
    c.fruitMastery = after;
    if (Math.floor(after / 10) > Math.floor(before / 10)) { g.log(`${f.name} mastery ${Math.floor(after)}: its power grows.`, '#ffab91'); g.audio?.sfx('unlock'); }
    this.openForms();
    this.syncUnlocks();
    if (before < AWAKEN_MASTERY && after >= AWAKEN_MASTERY && !c.fruitAwakened) {
      g.ui.toast('MASTERED', `The ${f.name} stirs: a hard fight may awaken it`, f.color);
      g.audio?.sfx('breakthrough');
      g.log(`You have mastered the ${f.name}. Something deep in it stirs: the next time a boss, or a foe near your strength, brings you down (or to a quarter of your health) on land, it will awaken — and you'll get back up with its awakened set on.`, '#ffab91');
      g.hint?.('awaken', `The ${f.name} is ready to awaken. Fight a boss or a strong foe: when they bring you down, or to a quarter of your health, it awakens. Afterwards ${formKey(g)} switches the awakened set on and off.`);
    }
  }

  /**
   * The forms of your fruit its mastery has opened (data/fruitForms.js), each
   * told once and put on the hotbar to switch on. One that needs Haki keeps
   * hidden until a Haki wakes (that's when this runs again).
   */
  openForms() {
    const g = this.game, c = this.char;
    const f = FRUITS[c?.fruit];
    if (!f) return;
    c.formsShown = c.formsShown || [];
    for (const F of f.forms || []) {
      if ((c.fruitMastery || 0) < F.mastery || c.formsShown.includes(F.id)) continue;
      if (needsHaki(getAbility(F.activate)) && !hakiKnown(c)) continue;
      c.formsShown.push(F.id);
      g.ui.toast(F.name.toUpperCase(), `A new form of the ${f.name} · ${formKey(g)} switches to it`, f.color);
      g.log(`Your mastery of the ${f.name} opens up ${F.name}. ${F.desc} With the fruit out, press ${formKey(g)} to switch into it (and on through its forms, back to the base set).`, '#ffab91');
      g.audio?.sfx('breakthrough');
    }
  }

  /**
   * The fruit awakens: mastered (AWAKEN_MASTERY), the moment a hard fight
   * against a worthy foe or a boss brings you down ('knocked': lives.js) or
   * to the edge (a quarter of your health left: 'edge'). Back on your feet,
   * the awakened set switched on there and then, and an entry on the hotbar
   * to switch it at will from now on. True if it did.
   */
  maybeAwakenFruit(att, how = 'knocked') {
    const g = this.game, p = g.player, c = this.char;
    const f = FRUITS[c?.fruit];
    if (!f || !p || c.fruitAwakened || (p.fruitMastery || 0) < AWAKEN_MASTERY || !att || att.spar || p.drowned) return false;
    if (p.inWater || p.seastoned) return false;
    const threat = att.power ? att.power() / Math.max(1, p.power()) : 0;
    if (!(threat > 0.65 || att.boss)) return false;
    c.fruitAwakened = true;
    // (back up — a knockdown undone — with the fruit out and its awakened set coming on)
    p.state = 'idle';
    p.hitstun = 0;
    p.action = null;
    p.hp = Math.max(p.hp, p.d.maxHp * (how === 'knocked' ? 0.6 : 0.4));
    p.iframes = Math.max(p.iframes || 0, 2.2);
    p.endForm?.(false);
    if (p.drawn) setDrawn(g, false);
    p.fruitOut = true;
    const aw = f.awakening;
    g.ui.toast('AWAKENING', `${aw.name} — the ${f.name} awakens!`, f.color);
    g.audio?.sfx('conqueror_rise', p);
    g.fx.impactFrame?.(0.25);
    g.fx.flash = 0.45;
    g.fx.ring?.(p.x, p.y, 0.3, 6, f.color, 0.9, 0.3);
    g.fx.burst?.(p.x, p.y - 0.8, 40, { color: [f.color, '#ffffff'], speed: 7, g: 0, life: 0.9, kind: 'star' });
    g.fx.shake?.(0.6);
    p.tryTechnique(aw.activate, g);
    g.log(`The ${f.name} has awakened! ${aw.desc} From now on ${formKey(g)} switches the awakened set on and off (it comes last in the fruit's forms).`, f.color);
    g.emit('fruitAwakened', c.fruit, how);
    persist(g);
    return true;
  }

  // ---------------------------------------------------------------- haki
  /** Armament / Observation stir by themselves in a hard fight, once you're ready. */
  maybeAwaken(type, tf) {
    const c = this.char;
    if (!c || c.haki[type] || tf < 0.6) return;
    const perk = 1 + (this.game.state.legacy?.perks?.haki || 0) * 0.5;
    if (type === 'armament') {
      const wm = Math.max(0, ...Object.values(c.weaponMastery || {}));
      const str = c.attrs.str;
      if (str < 22 && wm < 35) return;
      const sure = str >= 45 || wm >= 80;
      const chance = (0.004 + Math.max(0, str - 22) * 0.0006 + Math.max(0, wm - 35) * 0.0003) * perk;
      if (sure || Math.random() < chance) this.awakenHaki('armament', 3, 'In the middle of the fight your arm turns black as iron. Something in you has hardened.');
    } else if (type === 'observation') {
      const agi = c.attrs.agi;
      if (agi < 22 && (c.stats.evades || 0) < 60) return;
      const sure = agi >= 45 || (c.stats.evades || 0) >= 400;
      const chance = (0.015 + Math.max(0, agi - 22) * 0.002) * perk;
      if (sure || Math.random() < chance) this.awakenHaki('observation', 3, 'For a heartbeat you hear your opponent\'s next move before it happens.');
    }
  }

  addHaki(type, amt, cap = 100) {
    const g = this.game, c = this.char;
    if (!c.haki[type]) return; // must be awakened first
    const mul = (1 + (g.state.legacy?.perks?.haki || 0) * 0.25) * (c.race === 'skypiean' && type === 'observation' ? 2 : 1);
    const before = c.haki[type];
    c.haki[type] = Math.min(cap, before + amt * mul);
    if (Math.floor(c.haki[type] / 10) > Math.floor(before / 10)) g.log(`${type[0].toUpperCase() + type.slice(1)} Haki level ${Math.floor(c.haki[type])}`, '#ce93d8');
  }

  awakenHaki(type, level = 5, how = '') {
    const g = this.game, c = this.char, p = g.player;
    if (c.haki[type]) return false;
    const first = !c.haki.armament && !c.haki.observation && !c.haki.conqueror;
    c.haki[type] = level;
    p.hakiSkill = c.haki;
    p.haki = p.d.maxHaki;
    const names = { armament: 'ARMAMENT HAKI', observation: 'OBSERVATION HAKI', conqueror: "CONQUEROR'S HAKI" };
    g.ui.toast(names[type], how || 'Your will takes shape.', type === 'conqueror' ? '#ff5252' : '#ce93d8');
    g.audio?.sfx(type === 'conqueror' ? 'conqueror_rise' : 'haki_out', p);
    g.fx.impactFrame?.(0.12);
    const key = type === 'armament' ? 'R' : type === 'observation' ? 'T' : keyLabel(keysOf(g.settings).haki[0]);
    g.log(`${names[type]} awakened. Press ${key} to use it${type === 'conqueror' ? '' : ` — while it's on, its techniques are on the Haki keys (${keysOf(g.settings).haki.filter(Boolean).map(keyLabel).join(', ')})`}.${first ? ' Haki draws on a new spirit bar under your health; it refills when you rest it.' : ''}`, '#ce93d8');
    g.emit('hakiAwakened', type);
    persist(g);
    return true;
  }

  // ---------------------------------------------------------- breakthroughs
  /**
   * A great victory: your body surges. `points` attribute gains go where you
   * have been training lately (no points to spend by hand).
   */
  breakthrough(points, why) {
    const g = this.game, c = this.char;
    if (!c || !(points > 0)) return;
    const recent = c.recent || {};
    const gains = {};
    for (let i = 0; i < points; i++) {
      // weighted by recent practice, with a little of everything
      const weights = KEYS.map((k) => [k, 1 + (recent[k] || 0)]);
      let total = weights.reduce((s, [, w]) => s + w, 0);
      let r = Math.random() * total;
      let pick = 'vit';
      for (const [k, w] of weights) { if ((r -= w) <= 0) { pick = k; break; } }
      if (c.attrs[pick] >= ATTR_CAP) pick = KEYS.find((k) => c.attrs[k] < ATTR_CAP) || pick;
      c.attrs[pick] = Math.min(ATTR_CAP, c.attrs[pick] + 1);
      gains[pick] = (gains[pick] || 0) + 1;
      if (recent[pick]) recent[pick] *= 0.6;
    }
    refreshPlayer(g);
    const txt = Object.entries(gains).map(([k, v]) => `${ATTRS[k].short} +${v}`).join('  ');
    g.ui.toast('BREAKTHROUGH', `${why ? why + ' — ' : ''}${txt}`, '#ffd54f');
    g.log(`Breakthrough${why ? ` (${why})` : ''}: ${txt}`, '#ffd54f');
    g.audio?.sfx('breakthrough');
  }

  raiseAttr(key, amt = 1, silent) {
    const g = this.game, c = this.char;
    c.attrs[key] = Math.min(ATTR_CAP, (c.attrs[key] || 0) + amt);
    if (!silent) g.log(`${ATTRS[key]?.name || key} +${amt} (${c.attrs[key]})`, '#a5d6a7');
    refreshPlayer(g);
  }

  /** Raise the player's bounty (rounded the way posters are). Returns the increase. */
  addBounty(amount, why, { quiet = false } = {}) {
    const g = this.game, c = this.char;
    if (!c || c.faction === 'marine') return 0;
    const before = c.bounty || 0;
    const after = roundBounty(before + Math.max(0, amount));
    if (after <= before) return 0; // too small to change the poster
    c.bounty = after;
    if (c.faction !== 'pirate') c.faction = 'pirate';
    const first = !before, jump = after - before;
    g.log(`Bounty ${formatBerries(after)} (+${formatBerries(jump)})${why ? ' — ' + why : ''}`, '#ffd54f');
    if (first) g.ui.banner('WANTED', formatBerries(after), `${why ? why[0].toUpperCase() + why.slice(1) + '. ' : ''}The World Government has put a price on your head. The Marines will come for you.`, 5);
    else if (!quiet && (jump >= before * 0.1 || jump >= 5000000)) g.ui.toast('BOUNTY RAISED', `${formatBerries(after)}${why ? ' — ' + why : ''}`, '#ffd54f');
    g.emit('bountyChanged', c.bounty, first);
    return jump;
  }

  onKnockout(a, att) {
    const g = this.game, p = g.player, c = this.char;
    // the crew's victories (followers, summons) are the captain's victories
    if (att && !att.isPlayer && (att.crewId || att.summonedBy?.isPlayer)) att = p;
    if (!c || !att || !att.isPlayer || a.isPlayer || a.faction === 'player') return;
    c.stats.kills = (c.stats.kills || 0) + 1;
    if (a.npcId) c.defeated[a.npcId] = (c.defeated[a.npcId] || 0) + 1;
    const tf = threatFactor(a.power(), p.power());
    if (tf > 0.8) this.train('wil', 6 * tf);
    // bounty for attacking the Marines / World Government
    // (One Piece scaling: a grunt is worth a few hundred thousand in the East
    // Blue and millions further on; an officer with a name adds a share of
    // their own worth)
    if ((a.faction === 'marine' || a.faction === 'cp') && !a.spar && !a.def?.duel) {
      const b = a.bountyValue ? a.bountyValue * 0.3 : 400000 * bountySea(g) * (1 + 0.25 * (Math.max(1, a.tier) - 1));
      this.addBounty(b, a.boss || a.named ? `defeated ${a.name}` : 'attacked the Marines', { quiet: !a.boss && !a.named });
    }
    // beating a wanted pirate makes you at least as dangerous as they were
    if (a.bountyValue && a.faction !== 'marine' && a.faction !== 'cp' && a.infamy && c.faction !== 'marine' && c.faction !== 'civilian') {
      const cur = c.bounty || 0;
      this.addBounty(Math.max(cur + a.bountyValue * 0.3, a.bountyValue * 1.2) - cur, `defeated ${a.name}`);
    }
    if (a.reward) earn(g, a.reward, `from ${a.name}`);
    if (a.boss && !c.bosses.includes(a.npcId || a.name)) {
      c.bosses.push(a.npcId || a.name);
      this.breakthrough(a.breakthrough ?? 3, `Defeated ${a.name}`);
      this.addStyleMastery(this.styleInUse(), 4);
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

  // ---------------------------------------------------------------- legends
  /** Check every Legend (the old "dream" hook name is kept for callers). */
  checkDream() {
    const g = this.game, c = this.char;
    if (!c) return;
    c.legends = c.legends || [];
    for (const [id, L] of Object.entries(LEGENDS)) {
      if (c.legends.includes(id)) continue;
      let ok = false;
      try { ok = L.check(c); } catch { ok = false; }
      if (!ok) continue;
      c.legends.push(id);
      g.ui.toast('A NEW LEGEND', L.name, '#ffd54f');
      g.log(`Legend: ${L.name}. The whole sea will remember this. (Journal, Legends)`, '#ffd54f');
      g.emit('legend', id);
      persist(g);
    }
  }
}
