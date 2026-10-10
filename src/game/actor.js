import { Entity } from './entity.js';
import { derive, baseAttrs, doriki } from './stats.js';
import { drawCharacter, drawCharacterTinted, starPath, dir4 } from '../render/character.js';
import { actionClip, stanceFor, STANCES, STANCE_ARMED, gunKind, gaitCadence } from '../render/anims.js';
import { actorVisuals, drawActorExtras } from '../render/combatfx.js';
import { getAbility, canUse, startAbility, updateAbility, ownRoom } from './abilities.js';
import { PARRY, tierOf } from './difficulty.js';
import { flyStep, refill, fall as flightFall, toggleFlight } from './flight.js';
import { updateLift } from './room.js';
import { iceAt, statusFx } from './powers.js';
import { raceTick, kbFrame } from './racial.js';
import { STYLES } from '../data/styles.js';
import { FRUITS } from '../data/fruits.js';
import { RACES } from '../data/races.js';
import { WALKABLE, SWIMMABLE, IS_LIQUID, OVERLAY, T } from '../world/tiles.js';
import { nearDrum } from '../world/drums.js';
import { rideStep, endRide } from './ropeway.js';
import { HIGH_DECK } from '../render3d/height.js';
import { clamp, TAU, angleDiff } from '../core/math.js';
import { shipDims, hbAt, deckToWorld, shipLift, sideAt, topAt, floorAt, xAt, deckLift, deckPoint } from '../world/hull.js';
import { placeOnDeck, RAIL_CLEAR } from './decks.js';
import { anyShips } from './ship.js';
import { plankJoins, PLANK_W } from './gangway.js';
import { bw } from '../world/bframe.js';
import { heightsOf } from '../world/interiors.js';
import { attackSpec, infuse } from './moveset.js';
const GAME_G = 22; // (gravity for jumps and falls: heavier than Earth's, for a snappy hop)
const _sv = [0, 0], _sv2 = [0, 0];
/** How fast a point aboard ship `s` is moving over the world (m/s): her way along her heading, and her turn swinging it round her middle (v = ω × r). */
let _svK = 0;
function shipVelAt(w, s, x, y) {
  const o = (_svK ^= 1) ? _sv : _sv2; // (two answers can be in use at once)
  const h = s.heading || 0, sp = s.speed || 0, om = s.yawRate || 0;
  const rx = w.dx(s.x, x), ry = y - s.y;
  o[0] = Math.cos(h) * sp - om * ry; o[1] = Math.sin(h) * sp + om * rx;
  return o;
}

// what a step sounds like on each kind of ground
const STEP_SOUND = [];
for (const [k, ts] of Object.entries({
  grass: ['GRASS', 'FOREST', 'JUNGLE', 'FARM', 'FLOWERS', 'SAKURA', 'LAWN', 'MANGROVE'],
  sand: ['SAND', 'DESERT', 'ASH', 'CORAL'],
  dirt: ['DIRT', 'SEAFLOOR'],
  gravel: ['GRAVEL'],
  mud: ['MUD'],
  stone: ['STONE', 'COBBLE', 'ROCK', 'MOUNTAIN', 'CLIFF', 'RED_ROCK', 'MARBLE', 'SNOWROCK', 'WALL', 'GOLD', 'BONE'],
  wood: ['PLANK', 'RAIL', 'BRIDGE'],
  snow: ['SNOW'],
  ice: ['ICE', 'PACK_ICE'],
  soft: ['CARPET', 'TATAMI', 'CANDY', 'CAKE', 'ISLAND_CLOUD'],
  metal: ['STEEL'],
})) for (const n of ts) if (T[n] !== undefined) STEP_SOUND[T[n]] = k;

// where a deck point (from deckAt: its ship, u along, v across, h — or a gangway's planks) rides just now
const deckY = (dk, time) => deckLift(dk, time);

const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Up on the roofs (render3d/roofs.js): how far up a roof you walk on at a step
// (a slope, a ridge, the step onto a neighbour's), and how far you can come
// down onto one in the air; how far over your feet you reach for an eave you
// jump at, arms up (×scale).
const ROOF_STEP = 0.55, ROOF_AIR = 0.12, ROOF_REACH = 2.15;

// No stamina: what you can do is paced by cooldowns. A dodge comes back after
// DODGE_CD seconds (less with Agility); a guard broken by a heavy blow can't be
// raised again for a moment; nobody else sprints flat out for more than
// SPRINT_BURST seconds before easing off for SPRINT_REST (you can: you're the hero).
const DODGE_CD = 0.9;
const SPRINT_BURST = 5, SPRINT_REST = 3;

const STATUS_DEFAULTS = {
  burn: { dps: 0.035, color: '#ff7043' }, poison: { dps: 0.03, color: '#8e24aa' }, bleed: { dps: 0.025, color: '#c62828' }, dry: { dps: 0.04, color: '#d7b56d' },
};
// (a body without its shadow, out in the sun, burns: Kage Kage)
const SUNBURN = { dps: 0.03, color: '#ffab91' };

// Helpless: frozen solid, sunk in despair, the heart out of the body in a
// cube (Mes), cut to pieces (Amputate), lifted into the air (Takt), hung on
// strings (Parasite) — no moving, no swinging, no guard. A boss is held
// half as long by the ones a power puts on it; you, never for long (the
// most of each a foe can hold you for, in seconds).
const HELPLESS = ['freeze', 'despair', 'heartless', 'pieces', 'lifted', 'puppet'];
const POWER_HOLDS = new Set(['heartless', 'pieces', 'lifted', 'puppet']);
const PLAYER_CAP = { heartless: 1.8, pieces: 1.6, lifted: 2, puppet: 1.5 };

export class Actor extends Entity {
  constructor(o = {}) {
    super({ ...o, kind: o.kind || 'actor', r: o.r ?? 0.28 });
    this.name = o.name || 'Stranger';
    this.title = o.title || '';
    this.look = o.look || {};
    this.race = o.race || this.look.race || 'human';
    const R = RACES[this.race] || RACES.human;
    this.attrs = { ...baseAttrs(), ...(o.attrs || {}) };
    this.baseMods = { hpMul: (R.hpMul || 1) * (o.hpMul || 1), stride: R.stride || 1, speedMul: (o.speedMul || 1) * (this.race === 'buccaneer' ? 0.92 : 1) };
    this.reach = R.reach || 1;
    this.canSwimRace = R.swim || 1;
    this.gills = !!R.gills;
    this.style = o.style || 'brawler';
    this.weapon = o.weapon || null; // { kind: 'sword'|'gun'|'staff'|'axe', grade, count }
    this.drawn = false; // the weapon taken in hand (from the hotbar): held ready out of a fight too
    this.fruitOut = false; // the Devil Fruit taken out (from the hotbar): its skills on the skill keys, its blows on the mouse (moveset.js)
    this.fruit = o.fruit || null;
    this.fruitMastery = o.fruitMastery || 0;
    this.masteries = o.masteries || {};
    this.hakiSkill = o.hakiSkill || {};
    this.techniques = o.techniques || [];
    this.hotbar = o.hotbar || [];
    this.cooldowns = {};
    this.status = {};
    this.buffs = [];
    this.recalc();
    this.hp = o.hp ?? this.d.maxHp;
    this.haki = this.hakiUnlocked() ? this.d.maxHaki : 0;
    this.facing = o.facing ?? Math.PI / 2;
    this.walk = 0;
    this.moving = false;
    this.intent = { mx: 0, my: 0, mz: 0, sprint: false };
    this.action = null;
    this.combo = { step: 0, window: 0 };
    this.state = 'idle';
    this.iframes = 0;
    this.hitstun = 0;
    this.kb = { x: 0, y: 0 };
    this.dash = null;
    this.blocking = false;
    this.blockTime = 0;
    // the guard: whether the one up now came up on a fresh press of F (only
    // that can parry: see setBlock), and the counter strike a parry earns
    // (counterOn: the foe it's against, counterLeft: seconds left to land it)
    this.guardFresh = false;
    this.counterOn = null;
    this.counterLeft = 0;
    // moments for the animations (on game.env.time; -Infinity: never): when
    // this actor last parried a blow (and whether perfectly), had its own
    // blow parried (reeling, posture broken), had its guard smashed, was hit
    // (hitDir: the world angle the blow pushed it toward, hitW: how heavy it
    // was, ~0..1.5) and landed a counter strike
    this.parryT = -Infinity;
    this.parryPerfect = false;
    this.parriedT = -Infinity;
    this.guardBrokenT = -Infinity;
    this.hitT = -Infinity;
    this.hitDir = 0;
    this.hitW = 0;
    this.counterT = -Infinity;
    this.armament = false;
    this.observation = false;
    this.flashT = 0;
    this.knockT = 0;
    this.inWater = false;
    this.drownT = 0;
    this.depth = 0; // metres below the surface while swimming (diving)
    this.under = false; // head under water
    this.oxygen = null; // seconds of breath left (see maxOxygen)
    this.lastHitBy = null;
    this.lastHitT = 0;
    this.damageShown = 0;
    this.controller = o.controller || null;
    this.boss = !!o.boss;
    this.poise = o.poise ?? this.boss;
    this.tier = o.tier || 1;
    this.lethal = o.lethal ?? true;
    this.onKO = o.onKO || null; // callback when knocked out
    this.dmgOverride = o.dmgMul || null;
    this.defMul = o.defMul || 1;
    this.kbResist = o.kbResist ?? (this.boss ? 0.35 : 1);
    this.stunResist = o.stunResist ?? (this.boss ? 0.5 : 1);
    this.critChance = 0.05;
    this.provoked = false;
    this.aggroPlayer = !!o.aggroPlayer;
    this.npcId = o.npcId || null;
    this.flameLit = this.race === 'lunarian';
    this.seed = Math.random() * 1000;
    this.sortY = this.y;
  }

  get fruitDef() { return this.fruit ? FRUITS[this.fruit] : null; }
  get seastoned() { return !!this.status.seastone; }
  /** Held helpless by something (frozen, despairing, heartless, in pieces, lifted, puppeted)? */
  helpless() { const s = this.status; return !!(s.freeze || s.despair || s.heartless || s.pieces || s.lifted || s.puppet); }
  /**
   * In the Phoenix's hybrid form just now (blue-flame wings for arms): while
   * its form is on, or while its regenerating flames burn (see flight.js for
   * the full bird, flying). The animation reads it.
   */
  get phoenixForm() {
    if (this.fruit !== 'tori_phoenix') return false;
    return this.buffs.some((b) => b.phoenix) || (this.phoenixUntil || 0) > (this.game?.env?.time ?? 0);
  }

  recalc() {
    const mods = { ...this.baseMods };
    let speedMul = mods.speedMul;
    for (const b of this.buffs) if (b.mods?.speedMul) speedMul *= b.mods.speedMul;
    mods.speedMul = speedMul;
    // (you, the hero: half as much life again, and a deeper well of Haki)
    if (this.isPlayer) { mods.heroHp = 1.5; mods.heroHaki = 1.6; }
    const old = this.d;
    this.d = derive(this.attrs, mods);
    if (old && this.hp !== undefined) {
      // keep health ratio when max changes
      this.hp = Math.min(this.hp, this.d.maxHp);
    }
  }

  hakiLevel(type) { return this.hakiSkill[type] || 0; }
  hakiUnlocked() { return !!(this.hakiSkill.armament || this.hakiSkill.observation || this.hakiSkill.conqueror); }
  intangibleOK() {
    const f = this.fruitDef;
    if (!f || !f.logia || f.passive?.noIntangible) return false;
    return this.state !== 'knocked' && !this.inWater && !this.status.freeze;
  }
  styleMastery(s) { return this.masteries[s || this.style] || 0; }
  /** Holding that kind of weapon — and, for swords, as many as `style` (by default your own) needs? */
  hasWeapon(kind, style = this.style) {
    // (your own weapon counts once it's drawn: sheathed, you fight with your fists — H draws it)
    if (!this.weapon || (this.isPlayer && !this.drawn)) return false;
    if (kind === 'sword') return this.weapon.kind === 'sword' && (this.weapon.count || 1) >= (STYLES[style]?.swords || 1);
    return this.weapon.kind === kind;
  }
  weaponMul() { return this.weapon ? (this.weapon.power || 1) : 1; }
  atkSpeed() { return this.d.atkSpeed * this.buffMul('atkSpeed') * (this.status.slowmo ? 0.3 : 1) * (this.status.chill ? 0.75 : 1); }
  buffMul(key) {
    let m = 1;
    for (const b of this.buffs) if (b.mods && b.mods[key] !== undefined) m *= b.mods[key];
    return m;
  }
  hasBuff(id) { return this.buffs.some((b) => b.id === id); }
  power() {
    if (this.fixedPower) return this.fixedPower;
    const best = Math.max(0, ...Object.values(this.masteries));
    const haki = (this.hakiSkill.armament || 0) + (this.hakiSkill.observation || 0) + (this.hakiSkill.conqueror || 0) * 1.5;
    return doriki(this.attrs, { mastery: best, haki, fruit: !!this.fruit, fruitMastery: this.fruitMastery });
  }

  /** Out of the sea (climbing out, or hauled aboard): a Devil Fruit user stays weak for a while. */
  leaveWater(game, out = false) {
    const df = !!this.fruit && !this.gills;
    this.inWater = false;
    this.depth = 0; this.under = false; this.drownT = 0; this.sinking = false; this.lowAir = false; this.plungeV = 0;
    if (df && this.state === 'idle') {
      this.addBuff({ id: 'drenched', name: 'Drenched', dur: 16, mods: { speedMul: 0.7, damage: 0.75 } });
      if (this.isPlayer) game.log(out ? 'Drenched in seawater — your body feels heavy and weak.' : 'Hauled out of the sea, dripping and weak.', '#81d4fa');
    }
  }

  /** Seconds of breath (Fish-Men and merfolk breathe water). */
  get maxOxygen() { return this.gills ? Infinity : 24 + (this.attrs?.end || 0) * 0.35 + (this.attrs?.vit || 0) * 0.1; }

  addBuff(b) {
    this.buffs = this.buffs.filter((x) => x.id !== b.id);
    const buff = { ...b, t: b.dur ?? 10 };
    this.buffs.push(buff);
    if (b.forceArmament) this.armament = true;
    if (b.conquerorInfused) this.conquerorInfused = true;
    this.recalc();
    return buff;
  }

  /**
   * End the form of your fruit that's on (Gear Second..., or the awakened set:
   * data/fruitForms.js): its buff goes — and an Armament it forced on with it
   * — and what it leaves you with comes (`after`: spent, exhausted) unless
   * `spent` is false. True if one was on.
   */
  endForm(spent = true) {
    const b = this.buffs.find((x) => x.form);
    if (!b) return false;
    this.buffs = this.buffs.filter((x) => x !== b);
    if (b.forceArmament) this.armament = false;
    if (spent && b.after) this.addBuff(b.after);
    this.recalc();
    return true;
  }

  addStatus(k, v, src) {
    const cur = this.status[k];
    if (k === 'wet' && this.status.burn) delete this.status.burn;
    if (k === 'burn' && this.status.wet) return;
    if ((k === 'burn' && (this.fruit === 'mera' || this.fruit === 'magu')) || (k === 'poison' && this.fruit === 'doku')) return;
    let dur = typeof v === 'number' ? v : v.t;
    // (a power's hold on a boss is half as long; on you, never long — see HELPLESS)
    if (POWER_HOLDS.has(k)) {
      if (this.boss) dur *= 0.5;
      if (this.isPlayer && PLAYER_CAP[k]) dur = Math.min(dur, PLAYER_CAP[k]);
    }
    if (!cur || cur.t < dur) {
      this.status[k] = { t: dur, src, acc: 0 };
      if (POWER_HOLDS.has(k) || k === 'shadowless') statusFx(this.game, this, k, dur, src);
    }
    if (HELPLESS.includes(k)) { this.action = null; this.blocking = false; this.charging = 0; }
  }

  heal(n, game) {
    if (this.state === 'knocked' || this.state === 'dead') return;
    const before = this.hp;
    this.hp = Math.min(this.d.maxHp, this.hp + n);
    if (game && this.hp - before >= 1) game.fx.text(this.x, this.y - 1.4, '+' + Math.round(this.hp - before), '#69f0ae', 0.4);
  }

  takeDamage(n, att, h, game) {
    if (this.state === 'dead' || n <= 0) return;
    if (this.fruitDef?.passive?.immuneSlash && h?.slashing && !(att?.armament)) {
      game.fx.text(this.x, this.y - 1.3, 'NO EFFECT', '#ffccbc', 0.3);
      return;
    }
    if (this.fruitDef?.passive?.slippery && !h?.unblockable && Math.random() < this.fruitDef.passive.slippery) {
      game.fx.text(this.x, this.y - 1.3, 'SLIPPED!', '#fce4ec', 0.3);
      return;
    }
    if (this.status.shadowless) n *= 1.25;
    // (the heart in the surgeon's hand: every blow lands on a body that can't brace)
    if (this.status.heartless) n *= 1.2;
    if (this.fruitDef?.passive?.damageTaken) n *= this.fruitDef.passive.damageTaken;
    const ev = this.buffs.reduce((a, b) => a + (b.mods?.evade || 0), 0);
    if (ev > 0 && Math.random() < ev && !h?.unblockable) {
      game.fx.text(this.x, this.y - 1.3, 'EVADE', '#e1f5fe', 0.3);
      return;
    }
    this.hp -= n * this.buffMul('defMul');
    // (a cut that doesn't kill: Amputate leaves them in pieces, but alive)
    if (h?.nonLethal && this.hp < 1) this.hp = 1;
    this.flashT = 0.12;
    this.lastHitBy = att;
    this.lastHitT = game.time;
    this.damageShown = 3;
    if (att && att.isPlayer) this.provoked = true;
    if (this.controller && this.controller.onHurt) this.controller.onHurt(this, att, game);
    if (game.onDamage) game.onDamage(this, att, n, h);
    if (this.hp <= 0) {
      this.hp = 0;
      this.knockOut(game, att);
    }
  }

  knockOut(game, att) {
    if (this.state === 'knocked' || this.state === 'dead') return;
    if (this.climb) this.endClimb(game, true);
    // (out of the sky, out of a Takt's hold)
    if (this.flying && this.flight) flightFall(this, game);
    this.lift = null;
    this.state = 'knocked';
    this.knockT = 0;
    this.action = null;
    this.blocking = false;
    this.dash = null;
    this.buffs = [];
    this.armament = false;
    this.recalc();
    // a kick of dust at the feet (the thud when the body lands comes from the fx layer)
    game.fx.burst(this.x, this.y, 8, { color: ['#d7ccc8', '#efebe9'], speed: 2.4, g: 1.2, z: 0.1, vz: 0.6, life: 0.45, kind: 'dust', size: 0.14, grow: 0.3, drag: 3 });
    game.audio?.sfx('ko', this);
    if (this.onKO) this.onKO(this, att, game);
    game.onKnockOut(this, att);
  }

  faint(game) {
    game.fx.text(this.x, this.y - 1.5, 'FAINTED', '#ef9a9a', 0.35);
    this.fainted = true;
    this.hp = 0;
    this.knockOut(game, null);
  }

  knock(vx, vy, forceWater) {
    if (this.state === 'dead') return;
    const m = (this.kbResist ?? 1) * kbFrame(this);
    this.kb.x += vx * m; this.kb.y += vy * m;
    if (forceWater) this.forcedWater = 0.6;
  }

  stagger(t) {
    if (this.state !== 'idle') return;
    this.hitstun = Math.max(this.hitstun, t);
    if (t > 0.3) { this.action = null; this.blocking = false; }
    this.combo.step = 0;
  }

  // --- actions ---------------------------------------------------------------
  // (a Barrier Ball — a power that holds you as much as it shields you — leaves you nothing to do either)
  busy() { return !!this.action || this.hitstun > 0 || this.state !== 'idle' || this.helpless() || !!this.climb || this.buffs.some((b) => b.hold); }

  canAct() { return !this.busy() && !this.blocking; }

  tryM1(game) {
    if (this.state !== 'idle' || this.hitstun > 0 || this.helpless() || this.climb) return false;
    if (this.action) {
      // buffer the next combo hit from partway through the current swing
      const a = this.action;
      if (a.def.m1Chain && a.t > a.total * this.atkSpeed() * 0.3) this.combo.queued = true;
      return false;
    }
    const style = STYLES[this.style] || STYLES.brawler;
    let chain = style.m1Ids;
    if (style.weapon && !this.hasWeapon(style.weapon)) chain = STYLES.brawler.m1Ids;
    if (this.combo.window <= 0) this.combo.step = 0;
    const id = chain[this.combo.step % chain.length];
    let def = getAbility(id);
    if (!def) return false;
    // (the fruit out: the same chain with its power in every blow — it trains the fruit: moveset.js)
    const spec = this.fruitOut ? attackSpec(this) : null;
    if (spec?.m1) def = infuse(def, spec.m1);
    // (swinging lowers your guard; and a foe's follow-up in a combo comes quicker than its opener)
    this.blocking = false;
    startAbility(this, { ...def, m1Chain: true, chained: this.combo.step % chain.length > 0 }, game);
    this.combo.step = (this.combo.step + 1) % chain.length;
    this.combo.window = 0.55 + (def.recover || 0.2);
    this.applyElementBuff();
    this.stepIn(def);
    return true;
  }

  /** A small step into melee swings: basic attacks lunge a few inches (feel only). */
  stepIn(def) {
    const s = def.steps && def.steps[0];
    if (!s || !s.hit || def.lunge === 0 || this.inWater) return;
    const push = def.lunge ?? 1.4; // tiles/s, decays with the knockback damping (~0.17 tiles)
    this.kb.x += Math.cos(this.facing) * push;
    this.kb.y += Math.sin(this.facing) * push;
  }

  applyElementBuff() {
    // buffs like Diable Jambe / Amaru add element + status to basic attacks
    const eb = this.buffs.find((b) => b.element);
    if (eb && this.action) {
      const a = this.action;
      a.def = { ...a.def, steps: a.def.steps.map((s) => (s.hit ? { ...s, hit: { ...s.hit, element: eb.element, status: eb.status || s.hit.status } } : s)) };
    }
  }

  tryHeavy(game) {
    const style = STYLES[this.style] || STYLES.brawler;
    let def = getAbility(style.heavyId);
    if (style.weapon && !this.hasWeapon(style.weapon)) def = getAbility(STYLES.brawler.heavyId);
    // (a weapon's plain moves, its style never learned: no signature heavy)
    else if (style.plainHeavyId && this.masteries[this.style] === undefined) def = getAbility(style.plainHeavyId);
    // (the fruit out: its own heavy, or its form's — and while that's coming back, your fists' with the fruit's power in it)
    const spec = this.fruitOut ? attackSpec(this) : null;
    if (spec) {
      const fh = spec.heavy ? getAbility(spec.heavy) : null;
      def = fh && canUse(this, fh) ? fh : infuse(def, spec.m1);
    }
    // a heavy may cancel the recovery of a basic swing once that swing has landed
    const a = this.action;
    if (a && a.def.m1Chain && a.step >= (a.def.steps || []).length && a.t > (a.def.windup ?? 0.07) + 0.04 && this.state === 'idle' && this.hitstun <= 0 && canUse(this, def)) {
      this.action = null;
      this.combo.queued = false;
    }
    if (!this.canAct()) return false;
    if (!canUse(this, def)) return false;
    startAbility(this, def, game);
    this.applyElementBuff();
    return true;
  }

  tryTechnique(id, game, target) {
    // hotbar slots can also hold items (food, medicine, dials…)
    if (typeof id === 'string' && id.startsWith('item:')) return this.isPlayer && this.state === 'idle' && !!game.useHotbarItem?.(id.slice(5), target);
    const def = getAbility(id);
    if (!def) return false;
    // (a power's own way into the sky: up, or — up there — back down; see flight.js)
    if (def.flight) {
      if (this.state !== 'idle' || (this.cooldowns[def.id] || 0) > 0 || this.helpless()) return false;
      if (def.source?.startsWith('fruit') && (this.inWater || this.seastoned)) { if (this.isPlayer) game.log('Your Devil Fruit power is useless here!', '#ff8a80'); return false; }
      this.cooldowns[def.id] = 0.6;
      return toggleFlight(this, game);
    }
    // (a Haki held on, like Conqueror's Infusion: press again to let it go)
    if (def.toggle) {
      const on = this.buffs.find((b) => b.id === def.toggle);
      if (on) { on.t = 0; if (this.isPlayer) game.audio?.sfx('ui_close', this); return true; }
    }
    if (!this.canAct()) return false;
    if (def.requiresHaki && !this.hakiLevel(def.requiresHaki)) { if (this.isPlayer) game.log(this.hakiUnlocked() ? `${def.name} requires ${def.requiresHaki} Haki.` : `${def.name} is beyond you for now — something in you has yet to awaken.`, '#ff8a80'); return false; }
    if (def.requiresNight && game.env.daylight > 0.35) { if (this.isPlayer) game.log('Only under the night sky...', '#ff8a80'); return false; }
    if (def.requiresFruit && this.fruit !== def.requiresFruit) { if (this.isPlayer) game.log(`${def.name} needs the ${FRUITS[def.requiresFruit]?.name}.`, '#ff8a80'); return false; }
    if (!canUse(this, def)) {
      if (this.isPlayer) {
        if ((this.cooldowns[def.id] || 0) > 0) game.ui?.flashSlot(id);
        else if (def.source?.startsWith('fruit') && this.inWater) game.log('Your Devil Fruit power is useless in the sea!', '#ff8a80');
        else if (def.weapon && this.weapon && !this.drawn && this.weapon.kind === def.weapon) game.log(`Draw your ${this.weapon.kind === 'sword' ? (this.weapon.count > 1 ? 'swords' : 'sword') : 'weapon'} first (X).`, '#ffcc80');
        else if (def.weapon && !this.hasWeapon(def.weapon, def.style)) game.log(`${def.name} needs ${def.weapon === 'sword' ? `${STYLES[def.style || this.style]?.swords || 1} sword(s)` : 'a ' + def.weapon}.`, '#ff8a80');
        else if (def.source?.startsWith('haki') && this.buffs.some((b) => b.noHaki)) game.log('You\'re exhausted: no Haki in you for now.', '#b0bec5');
        else if (def.cost?.haki && this.haki < def.cost.haki) game.log(this.hakiUnlocked() ? 'Not enough Haki.' : 'Not enough strength of will.', '#ff8a80');
        else if (def.room === 'need' && !ownRoom(this, game)) {
          // (a Room technique, out of a Room: the slot flashes, and why)
          game.ui?.flashSlot(id);
          game.log(`${def.name} works only inside your ROOM — cast ROOM, then fight inside it.`, '#81d4fa');
          game.hint('room', 'Ope Ope no Mi: your techniques work inside your ROOM — a sphere that stays where you cast it. Cast ROOM, draw the fight into it, and you are the surgeon there: Shambles, Takt, Amputate, Mes...');
        }
      }
      return false;
    }
    startAbility(this, def, game, target);
    if (def.source?.startsWith('style')) this.applyElementBuff();
    return true;
  }

  tryDodge(game, dx, dy) {
    if (this.state !== 'idle' || this.hitstun > 0 || this.helpless() || this.status.root || this.dodgeCd > 0 || this.climb) return false;
    if (this.action && this.action.t < this.action.total * 0.5 && !this.action.def.m1Chain) return false;
    this.action = null;
    this.blocking = false;
    let len = Math.hypot(dx, dy);
    if (len < 0.1) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); len = 1; }
    const R = RACES[this.race] || {};
    const dist = 3.2 * (this.race === 'skypiean' ? 1.3 : 1) * (this.race === 'lunarian' ? 1.4 : 1) * (this.dashMul || 1);
    const time = 0.22;
    this.dash = { vx: dx / len * dist / time, vy: dy / len * dist / time, t: time, t0: time, dodge: true, ignoreWater: this.race === 'lunarian' };
    this.iframes = Math.max(this.iframes, 0.2 + (this.race === 'mink' ? 0.05 : 0));
    this.dodgeCd = this.dodgeCdMax = this.dodgeCooldown();
    // visuals: a kick of dust where you pushed off (afterimages follow the dash, see fx.js)
    this._ghostTint = this.race === 'lunarian' ? '#ffab91' : this.race === 'skypiean' ? '#ffffff' : '#b3e5fc';
    game.fx.burst(this.x, this.y, 7, { angle: Math.atan2(-dy, -dx), spread: 1.6, color: ['#d7ccc8', '#bcaaa4', '#efebe9'], speed: 2.4, z: 0.08, vz: 0.6, g: 1.2, life: 0.5, kind: 'dust', size: 0.2, grow: 0.45 });
    game.audio?.sfx('dodge', this);
    if (this.isPlayer) game.emit('playerDodge');
    return R;
  }

  /** Seconds before you can dodge again: quicker the more agile you are, and with Quick Feet. */
  dodgeCooldown() {
    const agi = this.attrs?.agi || 0;
    return DODGE_CD * (1 - Math.min(0.25, agi * 0.0025)) * (this.char?.traits?.includes('quick_feet') ? 0.75 : 1);
  }

  /** Seconds a Devil Fruit user keeps their head above water before the sea takes their strength. */
  struggleTime() { return 6 + (this.attrs?.end || 0) * 0.04; }

  /** Seconds a broken guard stays down: shorter the more Endurance you have. */
  guardCooldown() { return 2 - Math.min(0.8, (this.attrs?.end || 0) * 0.008); }

  /** How much of a blow gets through your guard: less the more Endurance you have. */
  guardChip() { return 0.18 * (1 - Math.min(0.4, (this.attrs?.end || 0) * 0.004)); }

  /**
   * Sprinting just now? You can for as long as you like; anyone else (your
   * crew aside, who keep up with you) runs flat out in bursts, easing off
   * between them — so a chase can be won by keeping going.
   */
  sprintOk(dt) {
    if (this.isPlayer || this.crewId) return true;
    if (this.sprintRest > 0) return false;
    this.sprintT = (this.sprintT || 0) + dt;
    if (this.sprintT > SPRINT_BURST) { this.sprintT = 0; this.sprintRest = SPRINT_REST; }
    return true;
  }

  /** Technique cooldowns run this much of their time (a Musician aboard plays you back into it sooner). */
  get cdMul() { return this.isPlayer ? this.game?.crewMods?.cdMul || 1 : 1; }

  /** Take-off speeds for this body: { v (a plain jump), charge (× for a full charge), leap (out of the water) }. */
  jumpStats() {
    const R = RACES[this.race] || RACES.human;
    return { v: (R.jump || 7.6) * (this.jumpMul || 1), charge: R.charge || 1.45, leap: R.leap || 1 };
  }

  /** Can you jump right now: on your feet, or at the surface of the water (not a Devil Fruit user). */
  canJump() {
    if (this.state !== 'idle' || this.hitstun > 0 || this.helpless() || this.status.root || this.status.grounded || this.blocking || this.flying) return false;
    if (this.onShip || this.climb) return false;
    if (this.action && !this.action.def.m1Chain && this.action.t < this.action.total * 0.7) return false;
    if (this.inWater) return !this.under && (this.depth || 0) < 0.15 && !(this.fruit && !this.gills) && this.state === 'idle';
    return !((this.z || 0) > 0.02);
  }

  /**
   * Jump: charge 0 is a hop, 1 a full crouch-and-spring (see the player
   * controller: hold Space to charge). Races change the take-off (see
   * data/races.js: Minks and Skypieans spring higher and charge
   * higher, Buccaneers are heavy but explosive). From the surface of the sea
   * you leap clean out of the water, leaving a ring on it.
   */
  tryJump(game, charge = 0) {
    // (a Devil Fruit user still thrashing at the surface, right at the edge of
    // a pier, a quay or a bank, can haul themselves out — no swimming, no leap)
    if (this.inWater && this.fruit && !this.gills && !this.sinking && !this.under && this.state === 'idle' && !(this.hitstun > 0) && this.climbOut(game)) return true;
    if (!this.canJump()) return false;
    const J = this.jumpStats();
    const k = clamp(charge, 0, 1);
    // swimming against a pier, a quay or a steep bank: up onto it (a ship's
    // side is a wall: a jump out of the water clears a rowboat's low one)
    if ((this.inWater || this.wading) && this.climbOut(game)) return true;
    let v = J.v * (1 + (J.charge - 1) * k);
    const fromWater = this.inWater;
    // (wading, you spring off the bottom: the jump starts where your feet are)
    if (this.wading && !fromWater) { this.z = -this.wading; this.wading = 0; }
    if (fromWater) {
      // up from treading water (the body starts where it floats, so the leap is continuous)
      v *= 1.3 * J.leap;
      const z = -(this.depth || 0) - this.swimSink();
      this.leaveWater(game, true);
      this.leapT = 0.5;
      this.z = z;
      // (a Fish-Man swimming hard springs out of the sea like a dolphin, on the way he was going)
      if (this.gills && this.moving && Math.hypot(this.intent.mx, this.intent.my) > 0.3) {
        const l = Math.hypot(this.intent.mx, this.intent.my);
        this.dash = { vx: this.intent.mx / l * 9, vy: this.intent.my / l * 9, t: 0.35, ignoreWater: true };
        v *= 1.1;
      }
      game.fx.ripple?.(this.x, this.y, 1 + k * 0.6);
      game.fx.burst(this.x, this.y, 12 + Math.round(k * 8), { color: ['#e1f5fe', '#b3e5fc', '#ffffff'], speed: 2.4, z: 0.1, vz: 5 + k * 2, g: 11, life: 0.7, size: 0.1 });
      game.audio?.sfx('splash_out', this);
    } else {
      this.z = Math.min(0, this.z || 0) + 0.001;
      game.fx.burst(this.x, this.y, 6 + Math.round(k * 8), { color: ['#d7ccc8', '#efebe9'], speed: 1.8 + k * 1.6, z: 0.05 + this.liftUnder(game), vz: 0.5, g: 1.2, life: 0.4 + k * 0.2, kind: 'dust', size: 0.16 + k * 0.08, grow: 0.35 });
      game.audio?.sfx(k > 0.5 ? 'jump_big' : 'jump', this);
    }
    this.vz = v;
    this.airT = 0;
    this.jumpK = k;
    if (this.action?.def.m1Chain) this.action = null;
    if (this.isPlayer) game.emit('playerJump', k);
    return true;
  }

  /** How deep the water under you is (m); 0 on land or on a deck. */
  waterUnder(game) {
    if (this.deck || (this.dash && this.dash.ignoreWater)) return 0;
    // (right where you stand — the same spot your height is measured from — not a step ahead)
    const t = game.world.type(this.x, this.y);
    if ((IS_LIQUID[t] !== 1 || OVERLAY[t]) && !this.belowDeck) return 0;
    if (t === T.LAVA || iceAt(game, this.x, this.y)) return 0;
    return game.seaDepth ? game.seaDepth(this.x, this.y) : 3;
  }

  /** Deep enough to swim in (about chest-deep; a little less to stand up again, so shorelines don't flicker). */
  swimDepth(was) { return 1.75 * (this.look?.scale || 1) * (was ? 0.5 : 0.62); }

  /**
   * How far below the surface a swimmer's feet hang (m): stretched along the
   * surface swimming (only the head out, and the shoulders at each breath),
   * upright and in to the neck treading water, lower under it, head and
   * shoulders up for a Devil Fruit user fighting to stay afloat. Eased from
   * one to the next (see updateWater), so setting off, stopping or coming up
   * from a dive never jerks the body up or down.
   */
  swimSink() { return (this.sinkNow ?? this.sinkWant()) * (this.look?.scale || 1); }
  sinkWant() {
    if (this.fruit && !this.gills) return 1.3;
    if (this.under) return 0.95;
    return this.moving ? 1.06 : 1.45;
  }

  /**
   * Gravity for jumps, launches and falls. A fall ends on the ground (a puff
   * of dust), on the bottom of the shallows, or — in deep water — where a
   * swimmer floats: once the feet are in, the sea slows the fall and holds
   * you up, and what's left of it carries you under for a moment before you
   * bob back up (see updateWater), so going in is one smooth plunge (with a
   * splash and a ring on the water as the feet meet it).
   */
  updateVertical(dt, game) {
    if (this.flying) return;
    if (this.leapT > 0) this.leapT -= dt;
    if (!(this.z > 0) && !this.vz) return;
    this.airT = (this.airT || 0) + dt;
    const s = this.look?.scale || 1;
    const wd = this.waterUnder(game);
    const deep = wd > this.swimDepth(false);
    const z0 = this.z;
    let grav = GAME_G;
    if (deep && z0 < 0 && this.vz < 0) {
      // (in up to the chest: drag, and the water takes your weight)
      const sub = clamp(-z0 / (1.3 * s), 0, 1);
      grav *= 1 - sub * 0.8;
      this.vz -= this.vz * Math.min(1, dt * 9 * sub);
    }
    this.vz -= grav * dt;
    this.z += this.vz * dt;
    if (this.vz > 0) { this.underRoof(game); return; } // (still rising: out of the water too)
    const IMP = 1;
    if (wd > 0 && z0 > 0 && this.z <= 0) {
      const impact = -this.vz * IMP;
      game.fx.ripple?.(this.x, this.y, Math.min(2.4, 0.8 + impact * 0.1));
      game.fx.burst(this.x, this.y, Math.min(22, 6 + impact * 1.2), { color: ['#e1f5fe', '#81d4fa', '#ffffff'], speed: 1.6 + impact * 0.22, z: 0.05, vz: 2 + impact * 0.35, g: 11, life: 0.6, size: 0.11 });
      game.audio?.sfx(impact > 9 ? 'splash_big' : 'splash', this);
      this.splashedAt = game.time || 0;
    }
    // (afloat, the body lies where a swimmer's does: stretched out if you came in moving)
    const floor = wd <= 0 ? 0 : deep ? -Math.min(wd - 0.1, (this.moving ? 1.06 : 1.45) * s) : -wd;
    if (this.z <= floor) {
      const impact = -this.vz * IMP;
      // (and floats on from just there: see updateWater)
      this.landSink = deep ? -floor / s : null;
      this.z = 0;
      this.vz = 0;
      this.airT = 0;
      this.leapT = 0;
      this.lastLanded = game.time || 0;
      // what's left of the fall takes you on under for a moment
      if (deep) this.plungeV = Math.min(impact / IMP, Math.max(0, wd - 1.5) * 4);
      else if (impact > 3) {
        game.fx.burst(this.x, this.y, Math.min(14, 4 + impact), { color: wd > 0 ? ['#e1f5fe', '#b3e5fc'] : ['#d7ccc8', '#bcaaa4', '#efebe9'], speed: 1.5 + impact * 0.25, z: 0.05 + this.liftUnder(game), vz: 0.6, g: 1.2, life: 0.45, kind: wd > 0 ? undefined : 'dust', size: 0.18, grow: 0.4 });
        if (impact > 9 && !wd) game.audio?.sfx('land_heavy', this);
        if (this.isPlayer) game.emit('playerLand', impact);
      }
    }
  }

  /**
   * Rising under a roof — an eave out over the street, the roof over a room —
   * your head stops at it; out under an eave and making for the house, with
   * its edge in reach of your hands, you catch hold and haul yourself up
   * onto it instead (see roofs.js).
   */
  underRoof(game) {
    const v3 = game.view3d;
    if (!v3?.roofAt || this.deck || this.inWater || this.climb || this.flying) return;
    const s = this.look?.scale || 1;
    const g = this.lastG ?? this.groundAt(game, this.x, this.y), feet = g + (this.z || 0);
    // (in a room, its ceiling: the floor above, under the roof of a taller house)
    const room = game.world.roomOf(this);
    if (room) {
      const ceil = g + heightsOf(room).ceil;
      if (feet + 1.72 * s > ceil - 0.1) { this.z = Math.max(0, ceil - 0.1 - 1.72 * s - g); this.vz = 0; }
      return;
    }
    const top = v3.roofAt(this.x, this.y);
    if (!top || top.h <= feet + ROOF_AIR) return;
    const head = feet + 1.72 * s;
    if (head < top.h - 0.3) return;
    const w = game.world, b = top.b;
    if (b && !w.roomOf(this) && top.h - feet <= ROOF_REACH * s) {
      // (which way the house is: you have to be going for it)
      const fd = Math.max(2, b.fd || 3), mid = bw(b, 0, -fd / 2);
      const hx = w.dx(this.x, mid.x), hy = mid.y - this.y, hl = Math.hypot(hx, hy) || 1;
      if ((this.intent.mx * hx + this.intent.my * hy) / hl > 0.3 && this.climbOnto(game, { x: this.x, y: this.y, top: top.h, dx: hx / hl, dy: hy / hl, roof: b })) return;
    }
    this.z = Math.max(0, top.h - 0.3 - 1.72 * s - g);
    this.vz = 0;
  }

  /**
   * Flying (creative mode): WASD along where you look, Space up, C down,
   * Shift fast; nothing is solid. The height is kept above the sea, not
   * above the ground, so the view glides level over hills and valleys.
   */
  updateFlight(dt, game) {
    const w = game.world, i = this.intent;
    const fast = (i.sprint ? 3.2 : 1) * (game.creative?.speed || 1);
    const sp = 13 * fast;
    const k = Math.min(1, dt * 7);
    this.vx += (i.mx * sp - this.vx) * k; this.vy += (i.my * sp - this.vy) * k;
    this.x = w.wx(this.x + this.vx * dt);
    this.y += this.vy * dt;
    if (!((this.y < 1 || this.y > w.height - 1) && this.overPole(w))) this.y = clamp(this.y, 1, w.height - 1);
    const gh = game.view3d ? Math.max(0, game.view3d.ground(this.x, this.y)) : 0;
    if (this.alt == null) this.alt = gh + (this.z || 0);
    this.alt = Math.min(this.alt + (i.mz || 0) * 8 * fast * dt, gh + 400);
    if (this.alt < gh) this.alt = gh;
    this.z = this.alt - gh;
    this.vz = 0;
    this.inWater = false; this.under = false; this.depth = 0; this.wading = 0;
    // settling onto dry ground lands you (over the sea you hover)
    if (this.z <= 0.01 && (i.mz || 0) < 0 && !w.isLiquid(this.x, this.y)) { this.flying = false; this.alt = null; }
  }

  /**
   * Guard up (on) or down — the player's controller says every frame whether
   * F is held. A guard only parries if it came up on a fresh press: not one
   * held down (the guard coming back up after a swing), not one pressed again
   * hard on letting go (PARRY.lockout: mashing F gets you nothing), though a
   * press made while the guard can't come up yet (mid-swing) still counts if
   * it comes up within PARRY.buffer of the swing's end. A parry earns the
   * next press a fresh guard however soon it comes. `fresh` (a foe's AI):
   * whether this guard can parry, decided for it.
   */
  setBlock(on, fresh) {
    if (on && !this.guardHeld) {
      this.pressFresh = (this.guardLetGo ?? Infinity) >= PARRY.lockout || !!this.parryEarned;
      this.pressAge = 0;
      this.pressPending = true;
      this.parryEarned = false;
    } else if (!on && this.guardHeld) this.guardLetGo = 0;
    this.guardHeld = !!on;
    if (on && !this.blocking) {
      if (this.state !== 'idle' || this.action || this.hitstun > 0 || this.helpless() || this.climb || this.guardCd > 0) return;
      this.blocking = true;
      this.blockTime = 0;
      this.guardFresh = fresh ?? (!!this.isPlayer && !!this.pressFresh && (this.pressAge ?? Infinity) <= PARRY.buffer);
      this.pressPending = false;
    } else if (!on) this.blocking = false;
  }

  // --- update ------------------------------------------------------------------
  update(dt, game) {
    if (!this.alive) return;
    this.sortY = this.y;
    if (this.state === 'knocked') {
      this.knockT += dt;
      this.updateVertical(dt, game);
      this.updateMovement(dt, game, true);
      this.followGround(game);
      if (this.controller && this.controller.whileKnocked) this.controller.whileKnocked(this, dt, game);
      return;
    }
    if (this.state === 'dead') return;
    // (played out by a scene — a crewmate diving in to save you, say — which places them itself)
    if (this.scripted) { this.moving = !!this.scripted.moving; this.vx = this.vy = 0; return; }

    if (this.onShip || this.climb) {
      // standing at the helm (or hauling yourself up onto a ledge): no walking
      // physics, but timers and techniques still run
      if (this.controller) this.controller.update(this, dt, game);
      this.iframes = Math.max(0, this.iframes - dt);
      this.hitstun = Math.max(0, this.hitstun - dt);
      for (const k in this.cooldowns) { this.cooldowns[k] -= dt; if (this.cooldowns[k] <= 0) delete this.cooldowns[k]; }
      this.updateStatus(dt, game);
      this.updateBuffs(dt, game);
      this.updateResources(dt, game);
      if (this.action) updateAbility(this, dt, game);
      this.moving = false;
      if (this.climb) { this.updateClimb(dt, game); return; }
      this.inWater = false;
      return;
    }

    if (this.controller) this.controller.update(this, dt, game);
    // (a climb begun just now — Space at a pier or a ship's side — runs from the
    // next frame; and taking the helm just now, you're no longer on your feet)
    if (this.climb || this.onShip) return;

    // timers
    this.iframes = Math.max(0, this.iframes - dt);
    this.hitstun = Math.max(0, this.hitstun - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.dodgeCd = Math.max(0, (this.dodgeCd || 0) - dt);
    this.guardCd = Math.max(0, (this.guardCd || 0) - dt);
    if (this.sprintRest > 0) this.sprintRest -= dt;
    else if (this.sprintT > 0 && !this.intent.sprint) this.sprintT = Math.max(0, this.sprintT - dt * 0.5);
    this.combo.window = Math.max(0, this.combo.window - dt);
    this.damageShown = Math.max(0, this.damageShown - dt);
    if (this.forcedWater) this.forcedWater = Math.max(0, this.forcedWater - dt);
    for (const k in this.cooldowns) {
      this.cooldowns[k] -= dt * (this.cdMulBuff ? this.buffMul('cdMul') : 1);
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }
    if (this.blocking) this.blockTime += dt;
    // (the guard's press and let-go, for whether the next one is fresh; the counter a parry earned runs out)
    // (a press made mid-swing waits on the swing, however long it runs, and only then starts to go stale)
    if (this.pressAge !== undefined && !(this.pressPending && this.guardHeld && this.action)) this.pressAge += dt;
    if (this.guardLetGo !== undefined && !this.guardHeld) this.guardLetGo += dt;
    // (a strike begun while the counter was there keeps it until that strike is done)
    if (this.counterLeft > 0 && !this.action?.counter && (this.counterLeft -= dt) <= 0) { this.counterLeft = 0; this.counterOn = null; }

    this.updateStatus(dt, game);
    this.updateBuffs(dt, game);
    this.updateResources(dt, game);
    // (a people's own: a Lunarian's flame, a Mink under the full moon)
    if (this.race === 'lunarian' || this.race === 'mink') raceTick(this, dt, game);

    if (this.action) {
      updateAbility(this, dt, game);
      if (!this.action && this.combo.queued) {
        this.combo.queued = false;
        this.tryM1(game);
      }
    }
    if (this.flying) {
      if (this.flight) {
        // flying on wings (or flames, or smoke...): see flight.js
        flyStep(this, dt, game);
        return;
      }
      // creative-mode flight: straight through anything, at a steady height
      this.updateFlight(dt, game);
      const fs = Math.hypot(this.vx, this.vy);
      this.moving = fs > 0.4; this.speed = fs;
      return;
    }
    // (a flier's gauge fills up again on solid ground)
    if (this.flightGauge < 1) refill(this, dt, game);
    const feet0 = this.bridgeNear(game) ? this.feetH(game) : 0;
    this.roofRef(game);
    this.updateMovement(dt, game, false);
    this.underDeck(game, feet0);
    this.followGround(game);
    // Against a ledge you can reach: in the air (a jump at a pier or a quay)
    // you grab it and haul yourself up at once; swimming or on your feet,
    // pushing on against a pier, a quay or a steep bank for a moment does it
    // (a ship's side is no ledge: you only come aboard over her rail)
    const L = this.ledge;
    const toward = L && (this.intent.mx * L.dx + this.intent.my * L.dy) > 0.4;
    if (toward && ((this.z || 0) > 0.05 || this.vz) && this.climbOnto(game, L)) return;
    if (toward && !L.ship) {
      this.pushT = (this.pushT || 0) + dt;
      if (this.pushT > 0.3 && this.climbOnto(game, L)) { this.pushT = 0; return; }
    } else this.pushT = 0;
    this.updateVertical(dt, game);
    if (this.climb) return;
    // (held up in the air by a Takt, and slammed down: see room.js)
    if (this.lift) updateLift(this, dt, game);
    this.updateDeck(game);
    // (in the air — over water too, or leaping out of it — you haven't splashed down yet)
    if (!this.vz && !(this.z > 0.02)) {
      this.updateWater(dt, game);
      // (feet back on something: the kicks off the air are there to use again)
      if (this.airSteps) this.airSteps = 0;
      if (this.flightStyle === 'geppo') this.flightStyle = null;
    }

    const sp = Math.min(Math.hypot(this.vx, this.vy), this.went ?? Infinity);
    this.moving = sp > 0.4;
    this.speed = sp;
    // (people going about their business look the way they're going — sliding
    // along a wall too, not striding into it)
    if (this.moving && !this.isPlayer && !this.action && !this.controller?.target && !(this.hitstun > 0) && Math.hypot(this.kb.x, this.kb.y) < 0.5 && this.wentDir !== undefined) {
      this.facing += angleDiff(this.facing, this.wentDir) * Math.min(1, dt * 12);
    }
    // the stride cycle keeps pace with the ground (no skating feet): see render/anims.js gait()
    if (this.moving) this.walk += dt * TAU * gaitCadence(sp / (this.look?.scale || 1), this.intent.sprint);
    // your footsteps: a foot comes down every half stride (render/anims.js
    // legAt: touch-down at the start of each half cycle), and sounds of what
    // it lands on
    // (crouched to sneak, easing down and back up: the pose and the camera follow it)
    this.crouchK = (this.crouchK || 0) + ((this.crouch ? 1 : 0) - (this.crouchK || 0)) * Math.min(1, dt * 9);
    if (this.crouchK < 0.002) this.crouchK = 0;
    const stepN = Math.floor(this.walk / Math.PI);
    if (this.isPlayer && stepN !== this.stepN && this.moving && !this.inWater && !this.wading && !this.climb && !this.flying && !this.vz && !(this.z > 0.05) && this.mode !== 'sail') {
      game.audio?.step?.(this.footSurface(game), this.intent.sprint ? 1 : Math.min(1, sp / 7));
    }
    this.stepN = stepN;
  }

  /** What's underfoot, for the sound of a step: a deck, a floor, a pier, or the ground's own kind. */
  footSurface(game) {
    if (this.deck) return 'wood';
    if (this.roofed) return 'stone'; // (up on the tiles)
    const w = game.world, x = this.x, y = this.y;
    const f = w.floorRec ? w.floorRec(x, y) : null;
    if (f && f.interior) {
      const t = w.type(x, y);
      return t === T.CARPET || t === T.TATAMI ? 'soft' : t === T.STONE || t === T.MARBLE ? 'stone' : 'wood';
    }
    if (w.isQuay?.(x, y)) return 'stone';
    return STEP_SOUND[w.type(x, y)] || 'dirt';
  }

  updateStatus(dt, game) {
    const st = this.status;
    for (const k of Object.keys(st)) {
      const s = st[k];
      s.t -= dt;
      const dot = STATUS_DEFAULTS[k] || (k === 'shadowless' && this.sunlit(game) ? SUNBURN : null);
      if (dot) {
        s.acc += dt;
        if (s.acc >= 0.5) {
          s.acc -= 0.5;
          // (a foe's burn or bleed on you and your crew is gentler where fights are: see difficulty.js)
          const src = s.src, foe = src && !src.isPlayer && src.faction !== 'player' && (this.isPlayer || this.faction === 'player');
          const dmg = Math.max(1, Math.round(this.d.maxHp * dot.dps * 0.5 * (this.boss ? 0.25 : 1) * (foe ? tierOf(game, this).dmg : 1)));
          this.hp -= dmg;
          game.fx.text(this.x, this.y - 1.1, String(dmg), dot.color, 0.3);
          if (k === 'burn') game.fx.burst(this.x, this.y - 0.6, 4, { color: ['#ff7043', '#ffca28'], speed: 1, vz: 2, g: -2, life: 0.4, kind: 'fire', size: 0.15 });
          // (no shadow, in the sun: the body smokes)
          if (k === 'shadowless') game.fx.burst(this.x, this.y - 0.6, 5, { color: ['#ffab91', '#eceff1'], speed: 0.8, vz: 1.5, g: -1, life: 0.6, kind: 'smoke', size: 0.2 });
          if (this.hp <= 0) { this.hp = 0; this.knockOut(game, s.src); return; }
        }
      }
      if (k === 'shock' && Math.random() < dt * 3) { this.hitstun = Math.max(this.hitstun, 0.12); game.fx.burst(this.x, this.y - 0.7, 3, { color: '#fff176', speed: 3, g: 0, life: 0.15, kind: 'line' }); }
      if (s.t <= 0) delete st[k];
    }
    if (this.helpless()) { this.action = null; this.blocking = false; }
    if (st.seastone && this.armament && this.fruit) { /* seastone doesn't stop haki */ }
  }

  /** Out in the daylight (not indoors, not under the sea)? — what a body without a shadow can't bear. */
  sunlit(game) {
    if (!game.env || game.env.daylight < 0.45) return false;
    const w = game.world;
    return w.zone !== 2 && w.zone !== 3 && !w.interiorAt?.(this.x, this.y) && !this.inWater;
  }

  updateBuffs(dt, game) {
    let changed = false, spent = null;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t -= dt;
      if (b.drain?.haki) {
        this.haki -= b.drain.haki * dt;
        if (this.haki < 0) { this.haki = 0; b.t = 0; }
      }
      if (b.t <= 0) {
        this.buffs.splice(i, 1);
        changed = true;
        if (b.forceArmament) this.armament = false;
        if (b.conquerorInfused) this.conquerorInfused = false;
        if (this.isPlayer && b.name) game.log(`${b.name} wore off.`, '#b0bec5');
        // (some powers take it out of you: a spell spent afterwards — Gear Second's pumped blood)
        if (b.after) (spent ||= []).push(b.after);
      }
    }
    for (const a of spent || []) this.addBuff(a);
    // (exhausted — Gear Fourth spent: no Haki in you for a while)
    if ((this.armament || this.observation) && this.buffs.some((b) => b.noHaki)) { this.armament = false; this.observation = false; }
    if (changed) this.recalc();
    this.cdMulBuff = this.buffs.some((b) => b.mods?.cdMul);
    // (what comes off a body in a form: Gear Second's steam, Nika's hair, a living shadow's wisps)
    if ((this.buffs.length || this.look?.shadow) && game.fx?.bodyFx) game.fx.bodyFx(this, dt);
  }

  updateResources(dt) {
    const d = this.d;
    if (this.hakiUnlocked()) {
      if (this.armament) {
        this.haki -= (1.6 - Math.min(1.0, this.hakiLevel('armament') * 0.012)) * dt;
        if (this.haki <= 0) { this.haki = 0; this.armament = false; this.hakiSpent('armament'); }
      } else if (this.observation) {
        this.haki -= (1.0 - Math.min(0.7, this.hakiLevel('observation') * 0.008)) * dt;
        if (this.haki <= 0) { this.haki = 0; this.observation = false; this.hakiSpent('observation'); }
      } else this.haki = Math.min(d.maxHaki, this.haki + d.hakiRegen * dt);
    }
    // (you heal back in a minute or two out of a fight, a well-fed body faster still: see survival.js)
    const base = this.isPlayer ? Math.max(d.hpRegen * 2.5, d.maxHp * 0.012) : d.hpRegen;
    let regen = (this.fruitDef?.passive?.regen || 0) + base * (this.inCombat ? 0.2 : 1);
    // (a form that heals as it fights: the Phoenix's)
    regen *= this.regenMul ?? 1;
    for (const b of this.buffs) if (b.regen) regen += b.regen;
    // everyone else only heals once they've been left alone for a good while
    const rested = this.isPlayer || !this.game || (this.game.time || 0) - (this.lastHitT || -999) > 45;
    if (this.hp < d.maxHp && this.state === 'idle' && rested && !this.needsHurt) this.hp = Math.min(d.maxHp, this.hp + regen * dt);
  }

  /**
   * Haki given out, the spirit bar empty: the coat of Armament flakes away,
   * Observation's senses go dull — seen, heard, and (yours) told.
   */
  hakiSpent(type) {
    const g = this.game;
    if (!g) return;
    g.fx?.hakiSpent?.(this, type);
    g.audio?.sfx('haki_out', this);
    if (!this.isPlayer) return;
    g.log(`Your ${type === 'armament' ? 'Armament' : 'Observation'} Haki gives out: your spirit is spent. It refills while you let your Haki rest.`, '#b0bec5');
    g.ui?.flashAct?.('haki');
  }

  passable(w, x, y) {
    if (w.solid(x, y)) return false;
    const t = w.type(x, y);
    // (on the Red Line, ground rising faster than a stair is its face: where a
    // Red Port's quay meets the wall, its last stones ramp up the cliff)
    if (WALKABLE[t]) return !(this.isPlayer && (this.redLineRise(w, x, y) > 0.9 || this.drumRise(w, x, y) > 0.9));
    if ((t === T.RED_ROCK || t === T.SNOWROCK) && this.redLineRise(w, x, y) <= 0.5) return true;
    // (over the edge of one of the Drum Rockies, from its top: you fall — and nobody walks up its face)
    if (t === T.SNOWROCK && this.isPlayer && this.drumRise(w, x, y) <= 0.5) return true;
    if (SWIMMABLE[t]) {
      if (this.dash && this.dash.ignoreWater) return true;
      if (this.forcedWater) return true;
      // (the sea frozen over by an Ice Age: a road while it lasts)
      if (this.game && iceAt(this.game, x, y)) return true;
      if (this.canEnterWater()) return true;
      // (folk with a Devil Fruit keep out of the sea on foot — but nothing
      // stops a jump: over the water between a pier and a ship, on and off a
      // boat; nor is a ship lying right alongside the sea: a step down onto
      // her deck, or a stride across the gap to it, is no walk into the water)
      if ((this.z || 0) > 0.05 || this.vz > 0) return true;
      return !!this.game?.deckAt?.(x, y, -0.6);
    }
    return false;
  }
  /**
   * How far the ground at (x, y) on the Red Line stands over your feet (off
   * it: -Infinity). Up on top of it (from Mary Geoise, the summit of Reverse
   * Mountain, a ledge you climbed) its rock is walked wherever it goes, no
   * steeper than a stair (0.5 m); its sheer sides, from the sea or a beach
   * below, are a cliff, as the mountains are.
   */
  redLineRise(w, x, y) {
    const g = this.game;
    if (!g?.view3d || w !== g.surface || !w.base?.type) return -Infinity;
    const bt = w.base.type(w.wx(Math.floor(x)), Math.floor(y));
    if (bt !== T.RED_ROCK && bt !== T.SNOWROCK) return -Infinity;
    return g.view3d.ground(x, y) - this.feetH(g);
  }

  /**
   * How far the ground at (x, y) by one of the Drum Rockies stands over your
   * feet (away from them: -Infinity): its face is a cliff from below, and its
   * edge a drop from the top.
   */
  drumRise(w, x, y) {
    const g = this.game;
    if (!g?.view3d || w !== g.surface || !w.drums?.length || !nearDrum(w, x, y, 1.5)) return -Infinity;
    return g.view3d.ground(x, y) - this.feetH(g);
  }

  canEnterWater() {
    // (folk with a Devil Fruit keep out of the sea; you're free to walk into
    // it — no invisible wall round every shore — and the sea takes your
    // strength: get out before it drags you down)
    if (this.fruit && !this.inWater && !this.isPlayer) return false;
    return this.swimmer !== false;
  }
  /** The body is a circle around (x, y) (the 3D model stands centred on it). */
  canOccupy(w, x, y) {
    const r = this.r, e = r * 0.85;
    // up on the roofs (or in the air over them): a roof at your feet or below
    // them is somewhere to be, whatever stands in the street under it; one
    // too high (a chimney, a taller house) is a wall — and in the air, an
    // edge within reach to grab (see climbOnto)
    if (this.feetRef != null && this.game?.world === w) {
      const top = this.game.view3d.roofAt(x, y);
      if (top) {
        const air = (this.z || 0) > 0.05 || !!this.vz;
        if (top.h <= this.feetRef + this.roofStep()) return true;
        // (too high to step onto, from up at the height of the roofs — not
        // walking under an eave in the street, or about a room under it — is
        // a wall: the foot of a chimney, a taller house)
        const above = this.roofed || this.upTop || (this.feetRef > this.game.view3d.ground(x, y) + 2.2 && !w.interiorAt(this.x, this.y));
        if (air && !w.roomOf(this) && top.h - this.feetRef <= ROOF_REACH * (this.look?.scale || 1)) {
          const l = Math.hypot(w.dx(this.x, x), y - this.y) || 1;
          this.blocked = { x, y, top: top.h, dx: w.dx(this.x, x) / l, dy: (y - this.y) / l, roof: top.b };
          // (a wall or the solid footprint under it stops you there; an eave over the street, only once you reach it)
          if (above || w.solid(x, y) || w.hitsProp(x, y, r * 0.9, true)) return false;
          this.blocked = null;
        }
        if (above) return false;
      }
    }
    // (crouched to spring — charging a jump — you don't creep off an edge: off
    // a pier, a roof or a bank into the sea; you spring from where you are)
    if (this.charging > 0 && !(this.z > 0.05) && !this.vz && !this.deck && this.game?.view3d && this.game.world === w) {
      const gm = this.game, there = this.groundAt(gm, x, y);
      if (this.groundAt(gm, this.x, this.y) - there > 0.5) return false;
      if (SWIMMABLE[w.type(x, y)] && !WALKABLE[w.type(x, y)] && !gm.deckAt?.(x, y, -0.6) && !iceAt(gm, x, y)) return false;
    }
    // ship decks: walk anywhere on your deck; her bulwark keeps you aboard
    // until you're up over it (it's a low wall: a jump clears it), and nobody
    // swims or walks through a hull
    const g = this.game;
    if (g && g.deckAt && this.deck && anyShips(g)) {
      const ref = this.deckRef(), sh = this.deck.ship;
      const dk = g.deckAt(x, y, r * 0.7, ref, sh) || g.deckAt(x, y, r * 0.7);
      // (her deck — or a gangway laid to or from her, and the deck at its other end)
      if (dk && (dk.ship === sh || plankJoins(dk, this.deck))) {
        // into a mast (or the like) only while already in it and getting out
        if (dk.solid && !((g.deckAt(this.x, this.y, r * 0.7, ref, sh)?.solid || 0) >= dk.solid - 1e-4)) return false;
        return this.deckStep(dk);
      }
      // (come down on a gangway off its middle, by its edge: back in toward its middle)
      if (this.deck.plank) {
        const pk = g.deckAt(x, y, 0, ref, sh);
        if (pk?.plank === this.deck.plank && Math.abs(pk.e) < Math.abs(this.deck.e) - 1e-4) return this.deckStep(pk);
      }
      // (a gangway has a rope along each side: off it, over the water, only with a jump)
      if (this.deck.plank && !(this.z > 0.4)) return false;
      // (off the edge of her deck is her bulwark: over it only with your feet up at its top)
      if (this.feetH(g) < g.railAt(sh, x, y) - RAIL_CLEAR) return false;
    }
    // a ledge too high to step onto: a pier or a quay out of the sea, a ship's
    // side (a wall: you come over her rail from above), the shore from a deck
    if (g && g.world === w) {
      const L = this.ledgeAt(g, x, y);
      if (L) { this.blocked = L; return false; }
      // (up on a high bridge its handrail keeps you on the deck — your body
      // short of the rail, drawn just inside the deck's edge: jump it to dive off)
      if (!this.belowDeck && !(this.z > 0.4) && w.type(this.x, this.y) === T.BRIDGE) {
        const hf = g.view3d?.terrain?.hf;
        if (hf) {
          // (the rails along the sides of the deck tile you'd stand on — or,
          // stepping off onto the land at its end, the one you're leaving:
          // the water beside the land you step onto has no rail of its own)
          const on = w.type(x, y) === T.BRIDGE;
          const tx = Math.floor(on ? x : this.x), ty = Math.floor(on ? y : this.y), m = r + 0.14;
          for (const [px, py] of [[x + m, y], [x - m, y], [x, y + m], [x, y - m]]) {
            const nx = Math.floor(px), ny = Math.floor(py);
            if (Math.abs(nx - tx) + Math.abs(ny - ty) === 1 && w.type(px, py) !== T.BRIDGE && hf.railAt(tx, ty, nx, ny)) return false;
          }
        }
      }
    }
    // (the Baratie's gunwale runs round her deck: you walk up to it, not out
    // over the sea through it — over it only with a jump, to dive off; her
    // gangway to the pier is open)
    if (g && g.world === w && !this.belowDeck && !(this.z > 0.4) && w.dockAt?.(this.x, this.y)?.deck) {
      const m = r + 0.12;
      for (const [px, py] of [[x + m, y], [x - m, y], [x, y + m], [x, y - m]]) if (!w.isDock(px, py)) return false;
    }
    if (!(this.passable(w, x - e, y - e) && this.passable(w, x + e, y - e) && this.passable(w, x - e, y + e) && this.passable(w, x + e, y + e))) return false;
    if (!this.passable(w, x - r, y) || !this.passable(w, x + r, y) || !this.passable(w, x, y - r) || !this.passable(w, x, y + r)) return false;
    // (walls keep a big body its own width off them: a big man's shoulders
    // don't show through the wall of the room he's in — unless he's already
    // that close, and getting clear)
    const body = 0.24 * Math.min(3, this.look?.scale || 1);
    if (body > r * 0.9 && w.hitsProp(x, y, body, true) && !w.hitsProp(this.x, this.y, body, true)) return false;
    return !w.hitsProp(x, y, r * 0.9);
  }

  /**
   * Where feet rest at (x, y) off a deck: the ground, a pier or a quay — over
   * the sea, its surface; up on the roofs, the roof there (one you're at or
   * above, as this step began: see roofRef), not the street under it.
   */
  groundAt(game, x, y) {
    if (!game.view3d) return 0;
    // (under a high bridge the ground is what's under its deck: the water, or the bed of it)
    if (this.belowDeck && game.world.type(x, y) === T.BRIDGE) return Math.max(game.view3d.terrain.terrainAt(x, y), 0);
    const g = game.view3d.ground(x, y);
    if (this.feetRef != null) {
      const r = game.view3d.roofAt?.(x, y, this.feetRef + this.roofStep());
      if (r && r.h > g + 0.01) return r.h;
    }
    return g;
  }

  /**
   * How far over your feet a roof can be and still be somewhere you go onto
   * (not a wall, or an eave over your head): a step on foot, or in the air
   * among the roofs (a jump up the slope you're on, onto a neighbour's a
   * little higher); from the street, coming down onto it.
   */
  roofStep() {
    const air = (this.z || 0) > 0.05 || !!this.vz;
    return air && !this.roofed && !this.upTop ? ROOF_AIR : ROOF_STEP;
  }

  /**
   * How high your feet are as this step begins (m above the sea) — kept only
   * while that could put you up on the roofs: in the air, or already up
   * there. Grounded in the street, the roofs are nothing to you.
   */
  roofRef(game) {
    const air = (this.z || 0) > 0.05 || !!this.vz;
    this.feetRef = (this.roofed || air) && this.lastG != null && !this.deck && !this.inWater && !this.flying && game.view3d?.roofAt ? this.lastG + (this.z || 0) : null;
  }

  /** How far the ground under you stands over the street (on a roof: its height; else 0) — for dust at your feet. */
  liftUnder(game) {
    return this.roofed && this.lastG != null && game.view3d ? Math.max(0, this.lastG - game.view3d.ground(this.x, this.y)) : 0;
  }

  /** The top of a bridge's deck at (x, y) if it stands high over the water there (room to swim under it), else null. */
  highDeck(game, x, y) {
    if (game.world.type(x, y) !== T.BRIDGE) return null;
    const hf = game.view3d?.terrain?.hf;
    const top = hf ? hf.deckAt(x, y) : 0;
    return top > HIGH_DECK ? top : null;
  }

  /** Any bridge tile under or beside you? (the only place the deck-or-under question arises) */
  bridgeNear(game) {
    const w = game.world;
    return w.type(this.x, this.y) === T.BRIDGE || w.type(this.x + 1, this.y) === T.BRIDGE || w.type(this.x - 1, this.y) === T.BRIDGE || w.type(this.x, this.y + 1) === T.BRIDGE || w.type(this.x, this.y - 1) === T.BRIDGE;
  }

  /**
   * On a high bridge's deck, or down under it (swimming, or wading the
   * shallows)? Settled as you come onto its tiles — from below you go under
   * it, from its deck or the bank you walk on it — and kept while you're on
   * them. (feet0: where your feet were before this step.)
   */
  underDeck(game, feet0) {
    if (game.world.type(this.x, this.y) !== T.BRIDGE) { this.belowDeck = false; return; }
    if (this.belowDeck) return;
    const top = this.highDeck(game, this.x, this.y);
    this.belowDeck = top !== null && !this.deck && this.canEnterWater() && feet0 < top - 1.2;
  }

  /**
   * Would a step onto (x, y) take you under a high bridge rather than up onto
   * it? (Not where it comes ashore: a stone pier stands under the deck there.)
   */
  passesUnder(game, x, y) {
    const top = this.highDeck(game, x, y);
    if (top === null || !this.canEnterWater()) return false;
    const w = game.world, tx = Math.floor(x), ty = Math.floor(y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = w.type(tx + dx, ty + dy);
      if (!IS_LIQUID[t] && !OVERLAY[t] && t !== T.WALL) return false;
    }
    return this.belowDeck || this.feetH(game) < top - 1.2;
  }

  /** How high your feet are (m above the sea): on a deck, afloat, wading, standing or in the air. */
  feetH(game) {
    if (this.deck) return deckY(this.deck, game.env?.time || 0) + (this.z || 0);
    const g = this.groundAt(game, this.x, this.y);
    if (this.inWater) return g - (this.depth || 0) - this.swimSink();
    return g - (this.wading || 0) + (this.z || 0);
  }

  /**
   * A ledge in the way at (x, y) — too high to step onto from where your feet
   * are — or null: a ship's side from outside her (below her rail: you come
   * aboard from above it), or, out of the sea or off a deck, a pier, a quay
   * or a bank (slopes, stairs and steps on land are walked).
   * { top (m), dx, dy (the way you were going), ship? } — a ship's side is a
   * wall, nothing to grab and haul yourself up.
   */
  ledgeAt(g, x, y) {
    const w = g.world;
    const air = (this.z || 0) > 0.05 || !!this.vz;
    let feet = null;
    // a hull: her side is solid to anyone outside her, from her keel up to her
    // rail (from a deck, another ship's) — already up against her (where she
    // came alongside you, say), you can still get clear of her
    if (g.hullWall && anyShips(g)) {
      const hk = g.hullWall(this, x, y);
      if (hk) {
        const here = g.hullWall(this, this.x, this.y, hk.ship);
        if (!here || hk.depth > here.depth + 1e-3) return this.blockedBy(x, y, shipLift(hk.ship, g.env?.time || 0, hk.u, hk.v, hk.top), hk);
      } else if (!this.isPlayer && !this.crewId) {
        // (only you and your crew come aboard over a rail: townsfolk on a pier don't wander down onto a boat below it)
        const hb = g.hullAt(x, y, 0.15);
        if (hb && hb.ship !== this.deck?.ship && g.hullAt(this.x, this.y, 0.15)?.ship !== hb.ship) return this.blockedBy(x, y, hb.rail, hb);
      }
    }
    const t = w.type(x, y);
    const high = !IS_LIQUID[t] || OVERLAY[t];
    if (!high) return null;
    // (on under a high bridge: no ledge — it's over your head)
    if (t === T.BRIDGE && this.passesUnder(g, x, y)) return null;
    const here = w.type(this.x, this.y);
    const wet = (IS_LIQUID[here] && !OVERLAY[here]) || !!this.belowDeck;
    // (on land: only up onto a pier or a quay from lower ground — a jump, or a climb)
    if (!wet && !this.deck && !(OVERLAY[t] && !OVERLAY[here]) && !(w.quays.size && w.isQuay(x, y) && !w.isQuay(this.x, this.y))) return null;
    const top = this.groundAt(g, x, y);
    if (this.inWater) return top > this.groundAt(g, this.x, this.y) + 0.35 ? this.blockedBy(x, y, top) : null;
    if (feet === null) feet = this.feetH(g);
    return top > feet + (air ? 0.12 : wet || this.deck ? 0.5 : 0.6) ? this.blockedBy(x, y, top) : null;
  }

  blockedBy(x, y, top, hk = null) {
    const l = Math.hypot(this.game.world.dx(this.x, x), y - this.y) || 1;
    return { x, y, top, dx: this.game.world.dx(this.x, x) / l, dy: (y - this.y) / l, ship: hk ? hk.ship : null };
  }

  /**
   * Can you step to this spot on your own deck? On the big ships the upper
   * decks are a storey up: you climb the stairs (or jump down), and masts and
   * the like are in the way.
   */
  deckStep(dk) {
    const cur = this.deck;
    // (onto a gangway, along it or off it at either end: by how far its planks are above your feet)
    if (dk.plank || cur.plank || dk.ship !== cur.ship) {
      const time = this.game?.env?.time || 0;
      return deckLift(dk, time) <= deckLift(cur, time) + Math.max(0, this.z || 0) + 0.55;
    }
    if (dk.lvl === undefined) return true;
    return dk.h <= cur.h + Math.max(0, this.z || 0) + 0.55;
  }

  /**
   * The height (above her waterline) to find your floor aboard from: in a
   * room, its floor (a jump doesn't take you up through the deck over it);
   * on an open deck, your feet.
   */
  deckRef() {
    const dk = this.deck;
    if (!dk) return null;
    return dk.room ? dk.h : dk.h + Math.max(0, this.z || 0);
  }

  /**
   * z counts from the ground under you, so when that falls away — off the
   * edge of a pier, a quay or a stage, or knocked off one — your height above
   * it grows and you fall, instead of dropping to the water in one frame. In
   * the air, rising ground (a jump up onto a pier) takes height off z the
   * same way. (A big move at once — a door, a teleport — is not a fall.)
   */
  followGround(game) {
    if (this.deck || this.inWater || this.flying || !game.view3d) { this.lastG = null; this.roofed = false; this.upTop = false; return; }
    const g = this.groundAt(game, this.x, this.y), last = this.lastG;
    // (standing on — or come down over — a roof, not the street under it; and
    // in the air off one, still up among them, not in the room under it,
    // until you land somewhere that isn't a roof)
    this.roofed = this.feetRef != null && g > game.view3d.ground(this.x, this.y) + 0.01;
    if (this.roofed) this.upTop = true;
    else if (!((this.z || 0) > 0.05 || this.vz)) this.upTop = false;
    const moved = last == null ? 0 : Math.abs(game.world.dx(this.lastGX, this.x)) + Math.abs(this.y - this.lastGY);
    this.lastG = g; this.lastGX = this.x; this.lastGY = this.y;
    if (last == null || moved > 2) return;
    const drop = last - g, air = (this.z || 0) > 0.02 || !!this.vz;
    if (air) this.z = (this.z || 0) + drop;
    else if (drop > 0.3) { this.z = drop; this.vz = -0.01; this.airT = 0; }
    if (this.z < 0 && !this.overWater(game)) { this.z = 0; if (this.vz < 0) this.vz = 0; }
  }

  /** Over the open water (not a pier, a bridge, dry land — or sea frozen over)? */
  overWater(game) { const t = game.world.type(this.x, this.y); return ((IS_LIQUID[t] === 1 && !OVERLAY[t]) || !!this.belowDeck) && !iceAt(game, this.x, this.y); }

  /** Room to stand at (x, y) on dry ground or a pier (where a climb ends). */
  standsAt(game, x, y) {
    const w = game.world, r = this.r * 0.9;
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const t = w.type(x + ox, y + oy);
      if (!WALKABLE[t] || w.solid(x + ox, y + oy)) return false;
    }
    return !w.hitsProp(x, y, r) && !game.hullAt?.(x, y, 0.1);
  }

  /**
   * Haul yourself up onto a ledge you ran into (see ledgeAt): a pier, a quay
   * or a bank out of the water, or a roof's eave from a jump. Only if it's
   * within reach (from the water you kick up to a pier; on your feet, about
   * chest high) and there's room to stand on top. True if the climb began.
   * (A ship's side isn't one: it's a wall, and you come aboard over her rail
   * from above it, or up her ladder: see ladders.js.)
   */
  climbOnto(game, L) {
    if (L.ship || this.climb || this.state !== 'idle' || this.hitstun > 0 || this.helpless() || this.status.root) return false;
    // (a Devil Fruit user can still grab the edge while they're thrashing at the surface — not once the sea's taken their strength)
    if (this.inWater && ((this.fruit && !this.gills && this.sinking) || this.under)) return false;
    const s = this.look?.scale || 1;
    const air = (this.z || 0) > 0.05 || !!this.vz;
    const from = this.inWater ? this.groundAt(game, this.x, this.y) : this.feetH(game);
    if (L.top - from > (this.inWater ? 2.1 : L.roof && air ? ROOF_REACH : air ? 1.35 : 1.25) * s) return false;
    if (L.roof) {
      // up over the eave (or the edge of the roof you jumped at), onto the roof just inside it
      for (const d of [0.35, 0.55, 0.8, 1.1]) {
        const x = game.world.wx(L.x + L.dx * d), y = L.y + L.dy * d;
        const top = game.view3d?.roofAt?.(x, y, L.top + 0.7);
        if (!top || top.h < L.top - 0.5) continue;
        this.startClimb(game, { x, y, h: top.h, roof: true });
        return true;
      }
      return false;
    }
    for (const d of [0.4, 0.6, 0.85]) {
      const x = game.world.wx(L.x + L.dx * d), y = L.y + L.dy * d;
      const top = this.groundAt(game, x, y);
      if (Math.abs(top - L.top) > 0.45 || !this.standsAt(game, x, y)) continue;
      this.startClimb(game, { x, y, h: top });
      return true;
    }
    return false;
  }

  /**
   * Out of the water onto a pier, a quay or a bank in front of you (Space at
   * the edge; pushing on against it does it too, see update).
   */
  climbOut(game) {
    if (!this.inWater) return false;
    let dx = this.intent.mx, dy = this.intent.my;
    if (Math.hypot(dx, dy) < 0.2) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); }
    const l = Math.hypot(dx, dy) || 1, a0 = Math.atan2(dy / l, dx / l), w = game.world;
    for (const da of [0, 0.5, -0.5, 1, -1]) {
      const ux = Math.cos(a0 + da), uy = Math.sin(a0 + da);
      for (let d = 0.25; d <= 1.1; d += 0.15) {
        const x = w.wx(this.x + ux * d), y = this.y + uy * d;
        const L = this.ledgeAt(game, x, y);
        if (L && !L.ship) { L.dx = ux; L.dy = uy; if (this.climbOnto(game, L)) return true; break; }
        if (!w.isLiquid(x, y) || w.isOverlay(x, y)) break;
      }
    }
    return false;
  }

  /**
   * Start hauling yourself up to `to`: a spot to stand on ({ x, y, h }), or a
   * deck spot ({ ship, t, v }) — up her ladder (`ladder`: hull.js ladders),
   * hand over hand.
   */
  startClimb(game, to) {
    const w = game.world;
    const wet = this.inWater;
    // (from where the body is drawn: afloat, on the bottom, in the air)
    const h0 = wet ? this.groundAt(game, this.x, this.y) - (this.depth || 0) - this.swimSink() : this.feetH(game);
    if (wet) {
      this.leaveWater(game, true);
      game.fx.ripple?.(this.x, this.y, 1);
      game.fx.burst(this.x, this.y, 10, { color: ['#e1f5fe', '#b3e5fc', '#ffffff'], speed: 2, z: 0.1, vz: 3.5, g: 11, life: 0.6, size: 0.1 });
      if (this.isPlayer) game.audio?.sfx('splash_out');
    }
    if (this.deck) { this.deck.ship.aboard?.delete(this); this.deck = null; }
    const c = { t: 0, h0, to, x0: this.x, y0: this.y };
    let tx, ty, th;
    if (to.ship) {
      const sh = to.ship, p = deckToWorld(sh, to.t, to.v);
      tx = p.x; ty = p.y; th = shipLift(sh, game.env?.time || 0, (to.t - 0.5) * sh.def.length, to.v || 0, p.h);
      // (up her side: where you started moves with her as she sails and turns)
      const cs = Math.cos(sh.heading), sn = Math.sin(sh.heading), dx = w.dx(sh.x, this.x), dy = this.y - sh.y;
      c.u0 = dx * cs + dy * sn; c.v0 = -dx * sn + dy * cs;
    } else { tx = to.x; ty = to.y; th = to.h; }
    // (a haul up takes its time: hands on the top, up, a knee over, and onto your feet)
    c.T = 0.42 + 0.3 * clamp(th - h0, 0, 3);
    // (a ladder up a ship's side: the height of her rail at a steady climb)
    if (to.ladder) c.T = 0.6 + 0.3 * Math.max(0, shipLift(to.ship, game.env?.time || 0, to.ladder.u, to.v, topAt(shipDims(to.ship.def), to.ladder.t)) - h0);
    this.climb = c;
    this.vx = 0; this.vy = 0; this.vz = 0; this.kb.x = 0; this.kb.y = 0;
    this.dash = null; this.blocking = false; this.wading = 0; this.charging = 0;
    this.ledge = null; this.pushT = 0; this.lastG = null;
    if (this.action?.def.m1Chain) this.action = null;
    this.facing = Math.atan2(ty - this.y, w.dx(this.x, tx));
    // (from where you are, this very frame)
    this.z = h0 - this.groundAt(game, this.x, this.y);
    if (this.isPlayer) game.emit('playerClimb', to);
  }

  /** Up the side, over the top and onto your feet (the start and the end ride along on a ship). */
  updateClimb(dt, game) {
    // (riding a ropeway's cabin: see ropeway.js)
    if (this.climb.ride) { rideStep(this, dt, game); return; }
    // (up the mainmast to the crow's nest: see masthead.js)
    if (this.climb.mast) return;
    const c = this.climb, w = game.world, to = c.to;
    if (to.ship && (to.ship.sunk || to.ship.alive === false)) { this.endClimb(game, true); return; }
    // (up a ladder yourself: W climbs, S goes back down — off the foot of it
    // you let go — Space lets go anywhere; only the last of it, over her rail,
    // goes on by itself)
    if (to.ladder && this.isPlayer && c.t / c.T < 0.82) {
      if (this.letGo) { this.letGo = false; this.endClimb(game, true); return; }
      c.t += dt * (this.climbInput || 0);
      if (c.t < 0) { this.endClimb(game, true); return; }
    } else c.t += dt;
    const k = Math.min(1, c.t / c.T);
    if (to.ladder) { this.ladderClimb(game, c, k); return; }
    let x0 = c.x0, y0 = c.y0, x1, y1, h1;
    if (to.ship) {
      const sh = to.ship, p = deckToWorld(sh, to.t, to.v), cs = Math.cos(sh.heading), sn = Math.sin(sh.heading);
      x1 = p.x; y1 = p.y; h1 = shipLift(sh, game.env?.time || 0, (to.t - 0.5) * sh.def.length, to.v || 0, p.h);
      x0 = sh.x + c.u0 * cs - c.v0 * sn; y0 = sh.y + c.u0 * sn + c.v0 * cs;
    } else { x1 = to.x; y1 = to.y; h1 = to.h; }
    // (up close against the edge first, then over it: no gliding through the corner)
    const up = smooth01(0.08, 0.68, k), over = smooth01(0.42, 1, k);
    const h = c.h0 + (h1 - c.h0) * up + Math.sin(Math.PI * k) * 0.08;
    this.x = w.wx(x0 + w.dx(x0, x1) * over); this.y = y0 + (y1 - y0) * over;
    // (onto a roof: what you're on, from where you are on the way up)
    if (to.roof) this.feetRef = h;
    const g = this.groundAt(game, this.x, this.y);
    this.z = h - g;
    if (to.roof) { this.lastG = g; this.lastGX = this.x; this.lastGY = this.y; this.roofed = g > (game.view3d?.ground(this.x, this.y) ?? g) + 0.01; }
    this.airT = 0.1;
    if (k >= 1) this.endClimb(game);
  }

  /**
   * Up a ship's ladder (startClimb with `ladder`), all of it in her frame as
   * she rides: a reach for its foot, then hand over hand up her side —
   * against it as it curves in toward her rail — and over the rail onto her
   * deck just inside.
   */
  ladderClimb(game, c, k) {
    const w = game.world, to = c.to, sh = to.ship, l = to.ladder, d = shipDims(sh.def), time = game.env?.time || 0;
    const cs = Math.cos(sh.heading), sn = Math.sin(sh.heading);
    const lift = (u, v, h) => shipLift(sh, time, u, v, h);
    const top = topAt(d, l.t) + 0.12, hb = (h) => l.s * (sideAt(d, l.t, Math.min(h, topAt(d, l.t))) + this.r + 0.06);
    // (the climb from where you are, in her frame: up the rungs to over her rail)
    const h0 = c.h0 - lift(c.u0, c.v0, 0), rise = smooth01(0.12, 0.82, k);
    let u, v, h;
    if (k < 0.82) {
      h = h0 + (top - h0) * rise;
      // (how far up the rungs: what the hands and feet keep time with — not
      // the height over the sea, which heaves with her)
      c.rise = h - h0;
      const g = smooth01(0, 0.12, k);
      u = c.u0 + (l.u - c.u0) * g; v = c.v0 + (hb(h) - c.v0) * g;
    } else {
      const o = smooth01(0.82, 1, k), fl = floorAt(d, to.t, to.v);
      u = l.u + (xAt(d, to.t) - l.u) * o; v = hb(top) + (to.v - hb(top)) * o;
      h = top + (fl - top) * o + Math.sin(Math.PI * o) * 0.12;
    }
    this.x = w.wx(sh.x + u * cs - v * sn); this.y = sh.y + u * sn + v * cs;
    this.z = lift(u, v, h) - this.groundAt(game, this.x, this.y);
    this.facing = sh.heading - l.s * Math.PI / 2;
    this.airT = 0.1;
    if (k >= 1) this.endClimb(game);
  }

  /** On your feet at the top — or, knocked off it, falling back from where you were. */
  endClimb(game, fall = false) {
    if (this.climb?.ride) { endRide(this, game); return; }
    const c = this.climb;
    this.climb = null;
    if (!c) return;
    const f = this.facing;
    if (fall) { this.vz = -0.01; this.lastG = null; return; }
    if (c.to.ship) placeOnDeck(game, this, c.to.ship, c.to.t, c.to.v);
    else if (c.to.roof) {
      // (on your feet on the roof: it's what you stand on from here)
      this.x = game.world.wx(c.to.x); this.y = c.to.y; this.z = 0; this.vz = 0;
      this.lastG = c.to.h; this.lastGX = this.x; this.lastGY = this.y; this.roofed = true;
    } else { this.x = game.world.wx(c.to.x); this.y = c.to.y; this.z = 0; this.vz = 0; this.lastG = null; }
    this.facing = f;
    this.airT = 0;
    this.lastLanded = game.time || 0;
  }

  /**
   * Off any deck, and up against a hull below her rail (see hullWall): come
   * down on her rail on your way in over it and you're on her deck, just
   * inside it; on your way out (or anywhere outside the line of her rail) you
   * go on down her side — kept clear of her timbers all the way to the water
   * as she flares out under you, never in under her. (A swimmer she's come
   * down on is pushed out from under her the same way.) The deck you came
   * down on, if any.
   */
  overSide(game) {
    if (this.climb || this.flying) return null;
    const hk = game.hullWall(this, this.x, this.y);
    if (!hk) return null;
    const s = hk.ship, d = shipDims(s.def), w = game.world;
    const sg = hk.v >= 0 ? 1 : -1, c = Math.cos(s.heading), sn = Math.sin(s.heading), av = Math.abs(hk.v);
    // (the deck's edge, and the outside of her rail at its top)
    const inner = hbAt(hk.t, d.B) * d.walk, face = sideAt(d, hk.t, hk.top);
    const inward = -(this.vx * -sn + this.vy * c) * sg;
    const air = (this.z || 0) > 0.02 || !!this.vz;
    const coming = av < inner || (av < face && (inward > 0.3 || (inward > -0.3 && face - av > av - inner)));
    if (coming && air && !this.inWater && hk.hh >= hk.floor - 0.1) {
      const t = clamp(hk.t, 0.05, 0.95), room = Math.max(0, hbAt(t, d.B) * d.walk - 0.22);
      const p = deckToWorld(s, t, clamp(hk.v, -room, room));
      const dk = game.deckAt(p.x, p.y, 0);
      if (dk && dk.ship === s && !dk.solid) { this.x = w.wx(p.x); this.y = p.y; return dk; }
    }
    // out from her side to clear it at the height you're at
    const dv = sg * (hk.side + this.r + 0.02) - hk.v;
    this.x = w.wx(this.x - sn * dv); this.y += c * dv;
    return null;
  }

  updateMovement(dt, game, knocked) {
    const w = game.world;
    let vx = 0, vy = 0;
    if (!knocked) {
      const i = this.intent;
      let sp = this.d.speed * (w.speedAt(this.x, this.y - 0.1) || 1);
      if (this.inWater) {
        // (a Devil Fruit user thrashes their way along, enough to reach an edge close by)
        if (this.fruit && !this.gills) sp *= this.sinking ? 0.03 : 0.3;
        else sp *= 0.55 * this.canSwimRace * (this.under && !this.gills ? 0.85 : 1);
      }
      else if (this.wading) sp *= 1 - 0.42 * clamp(this.wading / (1.1 * (this.look?.scale || 1)), 0, 1);
      if (this.charging) sp *= 1 - 0.75 * this.charging;
      if (i.sprint && (i.mx || i.my) && !this.eating && (!this.inWater || this.gills) && this.sprintOk(dt)) sp *= this.inWater ? 1.35 : 1.55;
      if (this.eating) sp *= 0.45; // (a slow walk with your mouth full)
      if (this.crouch) sp *= 0.5; // (sneaking)
      if (this.blocking) sp *= 0.4;
      if (this.action) sp *= this.action.def.moveMul ?? (this.action.def.m1Chain ? 0.55 : 0.25);
      if (this.hitstun > 0 || this.status.root || this.helpless()) sp = 0;
      if (this.status.slowmo) sp *= 0.2;
      if (this.status.chill) sp *= 0.6;
      if (this.zoneSlow) sp *= this.zoneSlow;
      const tx = i.mx * sp, ty = i.my * sp;
      // (the water holds you: a swimmer gathers way and loses it over a moment —
      // running in, you glide on and slow down rather than stopping dead)
      const k = Math.min(1, dt * (this.inWater ? 4 : 16));
      this.vx += (tx - this.vx) * k;
      this.vy += (ty - this.vy) * k;
      vx = this.vx; vy = this.vy;
    } else {
      this.vx *= 0.8; this.vy *= 0.8;
    }
    if (this.dash) {
      vx = this.dash.vx; vy = this.dash.vy;
      this.dash.t -= dt;
      if (this.dash.t <= 0) { this.dash = null; this.vx *= 0.3; this.vy *= 0.3; }
    }
    vx += this.kb.x; vy += this.kb.y;
    // (the way a ship had under you, carried on after you've jumped off her
    // deck: kept in the air, lost quickly on your feet or in the water)
    if (this.carryV) {
      vx += this.carryV[0]; vy += this.carryV[1];
      const air = ((this.z || 0) > 0.05 || !!this.vz) && !this.inWater && !this.deck;
      const f = Math.exp(-dt * (air ? 0.15 : this.inWater ? 3 : 7));
      this.carryV[0] *= f; this.carryV[1] *= f;
      if (Math.hypot(this.carryV[0], this.carryV[1]) < 0.05) this.carryV = null;
    }
    const decay = Math.exp(-dt * 8);
    this.kb.x *= decay; this.kb.y *= decay;
    if (Math.abs(this.kb.x) < 0.05) this.kb.x = 0;
    if (Math.abs(this.kb.y) < 0.05) this.kb.y = 0;
    // a swimmer in Reverse Mountain's canals goes where the current goes
    if (this.inWater && w.zone === 0 && game.currentAt) {
      const cur = game.currentAt(this.x, this.y, this);
      if (cur.canal) { vx += cur.x * 0.85; vy += cur.y * 0.85; }
    }
    const x0 = this.x, y0 = this.y;
    this.moveBy(w, vx * dt, vy * dt);
    // (how fast you really went: pushing against a wall you stand still, legs
    // and arms and all — not running on the spot with your hands through it)
    const gx = w.dx(x0, this.x), gy = this.y - y0;
    this.went = dt > 0 ? Math.hypot(gx, gy) / dt : 0;
    if (this.went > 0.3) this.wentDir = Math.atan2(gy, gx);
  }

  /**
   * Over the top of the world: the chart is the planet's surface, so north of
   * the north pole is the far side of it — you come down the other meridian
   * (half way round), now heading south, and the view turns with you. (You,
   * on the open surface: the planet's poles are pack ice — walked or flown
   * over, not sailed.) True if it took you over.
   */
  overPole(w) {
    const g = this.game;
    if (!this.isPlayer || !w.wrap || !g || w !== g.surface) return false;
    const top = this.y < 1;
    this.y = top ? 2 - this.y : 2 * (w.height - 1) - this.y;
    this.x = w.wx(this.x + w.width / 2);
    this.facing += Math.PI; this.vx = -this.vx; this.vy = -this.vy;
    if (this.kb) { this.kb.x = -this.kb.x; this.kb.y = -this.kb.y; }
    const r = g.view3d?.rig;
    if (r) r.yaw += Math.PI;
    g.log?.(top ? 'Over the North Pole: south again, down the far side of the world.' : 'Over the South Pole: north again, up the far side of the world.', '#b3e5fc');
    return true;
  }

  moveBy(w, dx, dy) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2));
    const sx = dx / n, sy = dy / n;
    let hit = false;
    // (a ledge that stopped you: see update — you may climb it)
    this.ledge = null;
    const can = (x, y) => { this.blocked = null; const ok = this.canOccupy(w, x, y); if (!ok && this.blocked && !this.ledge) this.ledge = this.blocked; return ok; };
    for (let s = 0; s < n; s++) {
      if (sx) { if (can(this.x + sx, this.y)) this.x += sx; else { hit = true; this.kb.x *= -0.3; } }
      if (sy) { if (can(this.x, this.y + sy)) this.y += sy; else { hit = true; this.kb.y *= -0.3; } }
    }
    this.x = w.wx(this.x);
    if ((this.y < 1 || this.y > w.height - 1) && this.overPole(w)) return hit;
    if (this.y < 1) this.y = 1;
    if (this.y > w.height - 1) this.y = w.height - 1;
    return hit;
  }

  /**
   * Standing on a ship's deck? Jumping over her rail you fly on (into the sea,
   * onto a pier, across to another deck); coming down over a deck, you land
   * on it. Heights carry over exactly: z counts from the deck aboard, from the
   * ground (or the sea's surface) off it.
   */
  updateDeck(game) {
    const was = this.deck;
    let dk = game.deckAt && anyShips(game) ? (was ? game.deckAt(this.x, this.y, 0, this.deckRef(), was.ship) : null) || game.deckAt(this.x, this.y, was ? 0 : 0.1) : null;
    // (a gangway is only underfoot once your feet come down on it: under it,
    // in the water, it's over your head)
    if (dk?.plank && !was && this.feetH(game) < deckY(dk, game.env?.time || 0) - 0.4) dk = null;
    // (and from the deck at its foot you're up on its steps along their
    // middle, where canOccupy lets you onto them — beside them, still on the deck)
    if (dk?.plank && was && !was.plank && Math.abs(dk.e) > PLANK_W / 2 - this.r * 0.7) {
      const s = was.ship, d = deckPoint(s, game.world.dx(s.x, this.x), this.y - s.y, 0, this.deckRef());
      if (d) { d.ship = s; dk = d; }
    }
    // a hull running over a swimmer doesn't scoop them up onto its deck: it
    // passes overhead of a diver, and shoves someone at the surface aside
    if (dk && !was && this.inWater) {
      if (!this.under) this.shoveFromHull(game, dk.ship);
      dk = null;
    }
    // (come down on a ship's rail, or alongside her below it: onto her deck if
    // you're on your way in over it, else down her side — see overSide)
    if (!dk && !was && game.hullWall && anyShips(game)) dk = this.overSide(game);
    if (dk && was && dk.ship === was.ship) {
      // off the edge of an upper deck: drop to the one below (stairs are gentler than this)
      const drop = was.h - dk.h;
      if (drop > 0.35) { this.z = (this.z || 0) + drop; this.vz = Math.min(this.vz || 0, 0); }
      else if (drop < -0.35) this.z = Math.max(0, (this.z || 0) + drop);
      this.deck = dk;
      // (under a deck — in a cabin, the hold — a jump stops at the beams overhead)
      if (dk.room) {
        const head = dk.room.ceil - dk.h - 1.72 * (this.look?.scale || 1);
        if ((this.z || 0) > Math.max(0, head)) { this.z = Math.max(0, head); if (this.vz > 0) this.vz = 0; }
      }
      return;
    }
    const time = game.env?.time || 0;
    if (was) {
      was.ship.aboard?.delete(this);
      // (off her deck — over her rail in a jump, or a gangway's end — you keep
      // the way she had on her under you, as anything thrown from a moving
      // ship does, and lose it only to the air, the ground's grip or the sea:
      // the deck under you is no longer carrying you, so your own velocity
      // has to carry it now)
      if (!dk && !was.plank) { const sv = shipVelAt(game.world, was.ship, this.x, this.y); this.carryV = [sv[0], sv[1]]; }
      if (!dk) {
        // over the side: on from the deck's height (a jump keeps its lift)
        const g = this.groundAt(game, this.x, this.y);
        this.z = deckY(was, time) + (this.z || 0) - g;
        if (this.z < 0 && !this.overWater(game)) this.z = 0;
        if (!this.vz && this.z > 0) this.vz = -0.01;
        this.lastG = g; this.lastGX = this.x; this.lastGY = this.y;
      }
    }
    if (dk) {
      // (from one ship's deck across to another's, or down onto one, the height changes too)
      const abs = was ? deckY(was, time) + (this.z || 0) : this.groundAt(game, this.x, this.y) - (this.wading || 0) + (this.z || 0);
      this.z = Math.max(0, abs - deckY(dk, time));
      this.wading = 0;
      if (!this.vz && this.z > 0) this.vz = -0.01;
      (dk.ship.aboard || (dk.ship.aboard = new Set())).add(this);
      // (and landing on one, your way is measured against her deck from now on)
      if (!dk.plank && (!was || was.ship !== dk.ship)) this.carryV = null;
    }
    this.deck = dk;
  }

  /** Pushed out sideways from under a ship's hull, with a splash. */
  shoveFromHull(game, ship) {
    const w = game.world;
    const hx = Math.cos(ship.heading), hy = Math.sin(ship.heading);
    const dx = w.dx(ship.x, this.x), dy = this.y - ship.y;
    const side = dx * -hy + dy * hx >= 0 ? 1 : -1;
    const nx = -hy * side, ny = hx * side;
    for (let k = 0; k < 48; k++) {
      this.x = w.wx(this.x + nx * 0.25); this.y += ny * 0.25;
      if (!deckPoint(ship, w.dx(ship.x, this.x), this.y - ship.y, 0.35)) break;
    }
    this.kb.x += nx * 2.5; this.kb.y += ny * 2.5;
    game.fx.ripple?.(this.x, this.y, 0.9);
    if (this.isPlayer) game.audio?.sfx('splash');
  }

  updateWater(dt, game) {
    const w = game.world;
    const t = w.type(this.x, this.y);
    const was = this.inWater, wadeWas = this.wading || 0;
    // (under a high bridge you're in the water it crosses; on an Ice Age's ice, you're not in it at all)
    const liquid = ((IS_LIQUID[t] === 1 && !OVERLAY[t]) || !!this.belowDeck) && !(this.dash && this.dash.ignoreWater) && !this.deck && !iceAt(game, this.x, this.y);
    // shallow water is waded, feet on the bottom; you swim once it's about chest-deep
    // (lava is always "in"). Leaping out of the sea, you're out of it until you come down.
    const wd = liquid ? (t === T.LAVA ? 99 : game.seaDepth ? game.seaDepth(this.x, this.y) : 99) : 0;
    this.inWater = liquid && !(this.leapT > 0) && (t === T.LAVA || this.forcedWater > 0 || wd > this.swimDepth(was));
    this.wading = liquid && !this.inWater && !(this.leapT > 0) && !(this.z > 0.02) ? wd : 0;
    if (this.wading && this.moving) {
      // rings spread round your legs as you wade
      this.wadeT = (this.wadeT || 0) - dt;
      if (this.wadeT <= 0) { this.wadeT = 0.32; game.fx.ripple?.(this.x, this.y, 0.55, 0.7); if (this.isPlayer) game.audio?.sfx('wade'); }
    }
    const df = !!this.fruit && !this.gills; // the sea takes a Devil Fruit user's strength
    if (this.inWater && !was) {
      // (a jump or fall into it has already splashed as the feet met the water)
      if (!(game.time - (this.splashedAt ?? -9) < 0.6)) {
        game.fx.burst(this.x, this.y, 10, { color: ['#e1f5fe', '#81d4fa'], speed: 3, vz: 3, g: 9, life: 0.5, size: 0.12 });
        game.fx.ripple?.(this.x, this.y, 1);
        game.audio?.sfx('splash', this);
      }
      this.depth = 0;
      this.sinking = false;
      this.struggle = this.struggleTime();
      // (floating on from where the feet were: at the bottom of the shallows
      // you waded out from, or as deep as a jump in took them)
      this.sinkNow = this.landSink ?? Math.min(this.sinkWant(), wadeWas / (this.look?.scale || 1));
      this.landSink = null;
      if (df && this.isPlayer) game.log("A Devil Fruit user can't swim! Get out before your strength gives out!", '#ff8a80');
      if (this.fruit) { this.armament = this.armament && this.hakiUnlocked(); this.buffs = this.buffs.filter((b) => !b.source || !getAbility(b.source)?.source?.startsWith('fruit')); this.recalc(); }
    }
    // (swimming along the surface leaves a wake: see render3d/chars3d.js)
    if (!this.inWater && was) this.leaveWater(game, true);
    if (this.inWater) {
      if (t === T.LAVA) { this.takeDamage(this.d.maxHp * 0.25 * dt, null, { element: 'fire' }, game); }
      // up and down: dive (intent.mz < 0) and rise (> 0). Left alone you drift
      // slowly up — barely at all once your lungs are empty, so swim for it.
      const floor = game.seaDepth ? game.seaDepth(this.x, this.y) : 3;
      const bottom = Math.max(0, floor - 0.45);
      const iz = this.intent.mz || 0;
      const maxO2 = this.maxOxygen;
      if (this.oxygen == null || this.oxygen > maxO2) this.oxygen = maxO2;
      const breathless = !this.gills && this.oxygen <= 0;
      // A Devil Fruit user can't swim: they thrash to keep their head up for a
      // few seconds (longer with Endurance), then the sea takes their strength
      // and down they go.
      if (df && !this.sinking) {
        this.struggle = (this.struggle ?? this.struggleTime()) - dt;
        if (this.struggle <= 0) {
          this.sinking = true;
          if (this.isPlayer) game.log('Your strength is gone... the sea is dragging you down!', '#ff8a80');
        }
      }
      let vz;
      if (df) vz = this.sinking ? 1.15 : this.depth > 0.02 ? -0.6 : 0;
      else if (iz) vz = -iz * (this.gills ? 3.4 : 1.7);
      else vz = this.depth > 0.05 && !this.gills ? -(breathless ? 0.12 : 0.35) : 0;
      if (this.plungeV) {
        // in from a jump or a fall: carried on under, slowing, then buoyed
        // back up to the surface (swimming up or down still works meanwhile)
        this.plungeV -= (this.plungeV * 6 + 3.2) * dt;
        if (this.plungeV < -0.55) this.plungeV = -0.55;
        if (this.plungeV < 0 && (this.depth <= 0.02 || iz || this.gills)) this.plungeV = 0;
        vz = (iz || df ? vz : 0) + this.plungeV;
      }
      this.depth = clamp(this.depth + vz * dt, 0, bottom);
      if (this.depth >= bottom && this.plungeV > 0) this.plungeV = 0;
      const wasUnder = this.under;
      this.under = this.depth > 0.35;
      // (coming up from a dive, the water parts round your head as it breaks the surface)
      if (wasUnder && !this.under && !this.lowAir) {
        game.fx.ripple?.(this.x, this.y, 0.75);
        game.fx.burst(this.x, this.y, 4, { color: ['#e1f5fe', '#b3e5fc'], speed: 0.8, vz: 1.4, g: 9, life: 0.3, size: 0.05, kind: 'drop', z: 0.25 });
      }
      // (up quickly — setting off, the body lies out along the surface as it
      // comes up, so the head never ducks under — and settling down gently)
      const sw = this.sinkWant(), sn = this.sinkNow ?? sw;
      this.sinkNow = sn + (sw - sn) * Math.min(1, dt * (sw < sn ? 8 : 4.5));
      // breath: held under water (the sea takes a Devil Fruit user's faster),
      // and back in a few gulps at the surface
      if (!this.gills) {
        if (this.under) {
          this.oxygen = Math.max(0, this.oxygen - dt * (df ? 2.2 : 1) * (this.moving || iz ? 1.2 : 1));
          if (this.oxygen < maxO2 * 0.3) this.lowAir = true;
        } else {
          if (this.lowAir) {
            // breaking the surface after too long down there: a big gasp
            this.lowAir = false;
            game.fx.burst(this.x, this.y, 8, { color: ['#e1f5fe', '#b3e5fc'], speed: 1.6, vz: 2.2, g: 9, life: 0.45, size: 0.09 });
            game.fx.ripple?.(this.x, this.y, 0.7);
            if (this.isPlayer) game.audio?.sfx('gasp');
          }
          this.oxygen = Math.min(maxO2, this.oxygen + dt * 9);
        }
      }
      // out of air: your lungs burn, and you lose health (faster the longer it
      // goes on) until you reach the surface
      if (breathless && this.under) {
        this.drownT += dt;
        const rate = (df ? 0.12 : 0.06) + Math.min(0.12, this.drownT * 0.012);
        this.hp -= this.d.maxHp * rate * dt;
        this.chokeT = (this.chokeT ?? 0) - dt;
        if (this.chokeT <= 0) {
          this.chokeT = 1.2;
          // the last of your air, bubbling out
          for (let i = 0; i < 7; i++) game.fx.particle({ x: this.x + (Math.random() - 0.5) * 0.25, y: this.y, z: 0.25, vx: (Math.random() - 0.5) * 0.4, vy: 0, vz: 1.4 + Math.random(), g: -0.8, life: 0.9, size: 0.06 + Math.random() * 0.06, color: '#e1f5fe', kind: 'bubble', under: this.depth });
          if (this.isPlayer) { game.audio?.sfx('choke'); game.fx.shake(0.06); }
        }
        if (this.isPlayer && !this.drownHint) {
          this.drownHint = true;
          game.log(df ? "Out of air — and a Devil Fruit user can't swim..." : 'Out of air! Swim for the surface (hold Space)!', '#ff8a80');
        }
        if (this.hp <= 0) { this.hp = 0; this.drowned = true; this.knockOut(game, null); }
      } else { this.drownT = 0; this.drownHint = false; }
      if (this.under && Math.random() < dt * (this.gills ? 1.5 : 4)) game.fx.particle({ x: this.x + (Math.random() - 0.5) * 0.3, y: this.y, z: 0.2, vx: 0, vy: 0, vz: 1.2, g: -0.6, life: 0.7, size: 0.07, color: '#e1f5fe', kind: 'bubble', under: this.depth });
    } else {
      this.drownT = 0;
      this.under = false;
      if (this.oxygen != null && !this.gills) this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 9);
    }
    const dmg = w.damageAt(this.x, this.y - 0.1);
    if (dmg && !this.inWater) this.takeDamage(dmg * dt, null, { element: 'fire' }, game);
  }

  // --- drawing -------------------------------------------------------------------
  /**
   * Everything the renderer needs to pose this actor this frame: the
   * technique's clip, the style's stance, eased transitions between clips and
   * states, dodge/hurt/launch/get-up poses and the hit squash. Visual only.
   */
  visualPose(env, look, act, aura, alphaBuff) {
    const now = env.time;
    const vdt = Math.min(0.1, Math.max(0, now - (this._vt ?? now)));
    this._vt = now;
    const wpn = this.weapon ? { kind: this.weapon.kind, count: this.weapon.count || 1, gun: gunKind(this.weapon) } : null;
    const stance = stanceFor(this.style, wpn);
    if (act) this._lastActT = now;
    const ai = this.controller;
    const npcFight = !this.isPlayer && ai && ai.target && ai.state === 'chase';
    const combat = now - (this._lastActT ?? -99) < 2.5 || this.blocking || this.hitstun > 0 || (this.isPlayer ? !!this.inCombat : !!npcFight);
    // (a blade laid over the shoulder while they wait: out of its sheath)
    const drawn = (!!this.drawn || (this.act3d?.pose === 'shoulder' && !this.moving)) && !!wpn && !!STANCE_ARMED[stance];
    const hurt = this.state === 'idle' && this.hitstun > 0.2 && !act;
    const dodging = !!(this.dash && this.dash.dodge);
    let anim = null;
    if (act) {
      if (!act.clip) act.clip = actionClip(act.def, this, stance);
      anim = act.clip;
      anim.t = act.t;
    }
    // ease between clips, stances and states instead of snapping
    const busy = this.act3d && !act && !combat && !this.moving && this.state === 'idle' ? this.act3d : null;
    // how you're swimming: treading water, a breaststroke along the surface or
    // under it (a Fish-Man's too — quicker, in step with his first-person
    // arms), hanging in the water, or a Devil Fruit user's struggle and sinking
    const swim = !this.inWater ? null
      : this.fruit && !this.gills ? (this.sinking ? 'sink' : 'struggle')
        : this.under ? (this.moving || this.intent.mz ? 'dive' : 'float')
          : this.moving ? 'crawl' : 'tread';
    // in the air from a jump (not a knock-back launch): up with the knees, then reaching for the ground
    // (hauling yourself up onto a ledge: knees up, arms reaching over the top)
    const air = this.climb ? null : !swim && !act && (this.z || 0) > 0.3 && this.airT > 0.05 && !(this.kb.x || this.kb.y) ? (this.vz > 0 ? 'up' : 'down') : null;
    // at a ship's station: rowing a rowboat, or at the wheel
    const st = !act ? this.station() : null;
    const mode = act || `${this.state}${drawn ? 'w' : ''}${this.blocking ? 'b' : ''}${dodging ? 'd' : ''}${hurt ? 'h' : ''}${this.moving ? 'm' : ''}${combat ? 'c' : ''}${this.intent.sprint ? 's' : ''}${swim || ''}${busy ? busy.pose : ''}${this.charging > 0 ? 'k' : ''}${air || ''}${st ? st.kind : ''}`;
    if (mode !== this._mode) {
      this._blendFrom = this._lastP || null;
      this._blendT = 0;
      // settling into (or getting up from) a seat or a lean takes a moment
      const slow = busy || swim || st || (this._mode && /(lean|sit|sweep|vend|fish|drunk|chat|fold|hips|attention|shoulder|fistpalm|think|tread|crawl|dive|float|struggle|row|helm)$/.test(this._mode));
      this._blendDur = act ? Math.min(0.06, (act.def.windup ?? 0.1) * 0.45) : hurt ? 0.05 : slow ? 0.45 : 0.12;
      this._mode = mode;
    }
    this._blendT = (this._blendT || 0) + vdt;
    // getting back up after a knockdown
    if (this._wasDown && this.state === 'idle') this._getUpT = 0.5;
    this._wasDown = this.state === 'knocked';
    if (this._getUpT > 0) this._getUpT -= vdt;
    const pose = {
      facing: this.facing, walk: this.walk, moving: this.moving, speed: (this.speed || 0) / (this.look?.scale || 1), time: now + this.seed,
      state: this.state === 'knocked' ? 'knocked' : hurt ? 'hurt' : this.state,
      swimming: this.inWater, swim, swimDir: this.intent.mz || 0, swimRate: this.gills ? 5.5 / 3.6 : 1, alpha: alphaBuff ? alphaBuff.alpha : this.fadeAlpha, aura,
      anim, stanceP: STANCES[stance], combat, sprint: !!(this.intent.sprint && this.moving), fainted: !!this.fainted,
      weapon: wpn, armed: !!wpn && (drawn || (combat && !!STANCE_ARMED[stance]) || !!(anim && anim.weapon)), drawn, armament: this.armament,
      knockT: this.knockT,
      activity: busy ? busy.pose : null, prop: busy ? busy.prop : null, seatH: busy ? busy.h : 0, station: st,
    };
    // combat moments, as seconds since (Infinity: never): a parry made (perfect
    // or not), a blow of its own parried (reeling), its guard smashed, a hit
    // taken (the way it pushed, relative to where it faces: 0 shoved forward,
    // ±π straight back; and how heavy) and a counter strike landed
    pose.parryAge = now - this.parryT;
    pose.parryPerfect = !!this.parryPerfect;
    pose.parriedAge = now - this.parriedT;
    pose.guardBrokenAge = now - this.guardBrokenT;
    pose.hitAge = now - this.hitT;
    pose.hitDirRel = angleDiff(this.facing, this.hitDir);
    pose.hitW = this.hitW;
    pose.counterAge = now - this.counterT;
    if (this.charging > 0 && !act && !swim) pose.charge = this.charging;
    if (this.crouchK > 0 && !act && !swim && !air && !busy) pose.crouch = this.crouchK;
    if (air) pose.air = { up: air === 'up', k: this.jumpK || 0 };
    // hauling yourself up a ledge, or hand over hand up a ladder (render/anim/move.js climbPose)
    const cl = this.climb;
    if (cl && !cl.ride && !act) pose.climb = { k: Math.min(1, cl.t / (cl.T || 1)), ladder: !!cl.to?.ladder, rise: cl.rise ?? (this.z || 0) };
    if (this.blocking) { pose.block = this.blockTime; pose.armedBlock = pose.armed; }
    if (dodging && !act) {
      const d = this.dash;
      pose.dodge = Math.min(1, Math.max(0, 1 - d.t / (d.t0 || 0.22)));
      const dl = Math.hypot(d.vx, d.vy) || 1;
      const view = dir4(this.facing);
      pose.dodgeDir = view === 'left' || view === 'right' ? (d.vx * Math.cos(this.facing) + d.vy * Math.sin(this.facing)) / dl : 0;
    }
    if (hurt) pose.hurtK = Math.min(1, this.hitstun / 0.35);
    const kbm = Math.hypot(this.kb.x, this.kb.y);
    if (kbm > 6 && this.hitstun > 0 && !act && this.state === 'idle') { pose.launch = Math.min(1, (kbm - 6) / 10); pose.z = 0.25 * pose.launch; }
    if (this._getUpT > 0 && this.state === 'idle' && !act) pose.getUp = 1 - this._getUpT / 0.5;
    if (this._blendFrom && this._blendT < this._blendDur && this.state === 'idle') pose.blend = { P: this._blendFrom, k: this._blendT / this._blendDur };
    // squash on a landed hit
    const hf = this.hitFx;
    if (hf) {
      const hk = (now - hf.t0) / 0.18;
      if (hk >= 0 && hk < 1) pose.squash = 1 - 0.14 * Math.min(1, hf.w) * Math.sin(hk * Math.PI);
    }
    Object.assign(pose, actorVisuals(this, act, anim));
    return pose;
  }

  /**
   * Where you're working a ship: at a rowboat's oars ({ kind: 'row', ship }) —
   * you at the oars, or her hand rowing her — or at the wheel ({ kind: 'helm',
   * ship }); else null.
   */
  station() {
    const s = this.mode === 'sail' ? this.ship : this.crewOf;
    if (!s || s.sunk) return null;
    if (this.mode === 'sail') return { kind: s.def.oarsOnly ? 'row' : 'helm', ship: s };
    if (s.rower === this && s.oars && this.deck?.ship === s && this.state === 'idle' && !this.moving && !this.provoked) return { kind: 'row', ship: s };
    return null;
  }

  draw(g, env) {
    const buffLook = this.buffs.find((b) => b.look);
    let look = buffLook ? { ...this.look, ...buffLook.look } : this.look;
    if (this.armament && this.action) look = { ...look, hand: '#1a1a1a', sleeve: look.sleeve };
    const scaleBuff = this.buffs.find((b) => b.mods?.scale);
    if (scaleBuff) look = { ...look, scale: (look.scale || 1) * scaleBuff.mods.scale };
    const act = this.action;
    const alphaBuff = this.buffs.find((b) => b.alpha !== undefined);
    const aura = this.buffs.find((b) => b.aura)?.aura || (this.conquerorInfused ? 'rgba(0,0,0,0.8)' : null);
    const pose = this.visualPose(env, look, act, aura, alphaBuff);
    // a quick shiver while the hit-stop holds the frame
    const hf = this.hitFx;
    const shiver = hf ? (env.time - hf.t0) / 0.14 : 1;
    g.save();
    if (shiver >= 0 && shiver < 1 && this.state === 'idle') g.translate(Math.sin(env.time * 170) * 0.045 * Math.min(1, hf.w) * (1 - shiver), 0);
    drawActorExtras(g, this, look, pose, env, 'back');
    // hit flash: the body washed white for a few frames, then fading back. The hit's
    // weight decides how white (a jab tints, a heavy blanks the body) and rapid
    // multi-hits stay readable
    if (this.flashT > 0) {
      const fk = this.flashT / 0.12;
      const rapid = hf && hf.t0 - (hf.prev ?? -9) < 0.2;
      const peak = rapid ? 0.5 : 0.52 + 0.36 * Math.min(1, hf ? hf.w : 0.5);
      drawCharacterTinted(g, look, pose, '#ffffff', fk > 0.5 ? peak : fk / 0.5 * peak);
    } else drawCharacter(g, look, pose);
    drawActorExtras(g, this, look, pose, env, 'front');
    g.restore();
    this._lastP = pose.P; this._lastPose = pose; this._lastLook = look;
    const s = look.scale || 1;
    // status visuals
    if (this.status.freeze) {
      g.fillStyle = 'rgba(179,229,252,0.55)'; g.strokeStyle = 'rgba(225,245,254,0.9)'; g.lineWidth = 0.05;
      g.beginPath(); g.moveTo(-0.5 * s, 0); g.lineTo(-0.55 * s, -1.4 * s); g.lineTo(0, -1.9 * s); g.lineTo(0.55 * s, -1.4 * s); g.lineTo(0.5 * s, 0); g.closePath(); g.fill(); g.stroke();
    }
    if (this.status.root) { g.strokeStyle = '#8d6e63'; g.lineWidth = 0.06; g.beginPath(); g.ellipse(0, -0.2, 0.4, 0.15, 0, 0, TAU); g.stroke(); }
    if (this.status.despair) { g.fillStyle = 'rgba(80,60,120,0.6)'; g.font = 'bold 0.3px sans-serif'; g.textAlign = 'center'; g.fillText('...sorry I was born', 0, -2.0 * s); }
    if (this.hitstun > 0.4 || this.status.shock) {
      // dazed: little drawn stars circling the head
      g.lineWidth = 0.018; g.strokeStyle = 'rgba(90,60,0,0.85)';
      for (let k = 0; k < 3; k++) {
        const a = env.time * 6 + k * TAU / 3;
        g.fillStyle = k % 2 ? '#fff59d' : '#ffeb3b';
        starPath(g, Math.cos(a) * 0.36, -1.78 * s + Math.sin(a) * 0.1, 0.085 * (0.85 + 0.15 * Math.sin(a * 2)), 4, 0.42, a);
        g.fill(); g.stroke();
      }
    }
    if (this.armament) {
      g.strokeStyle = 'rgba(20,20,20,0.5)'; g.lineWidth = 0.05;
      const ph = (env.time * 2) % 1;
      g.beginPath(); g.ellipse(0, -0.8 * s, 0.45 * s + ph * 0.2, 0.9 * s + ph * 0.2, 0, 0, TAU); g.globalAlpha = 1 - ph; g.stroke(); g.globalAlpha = 1;
    }
    if (this.inWater && this.fruit) {
      g.fillStyle = '#e1f5fe'; g.font = 'bold 0.3px Nunito, sans-serif'; g.textAlign = 'center';
      g.fillText('HELP!', 0, -1.2);
    }
    // health bar for NPCs that are fighting
    if (!this.isPlayer && (this.damageShown > 0 || this.boss) && this.state === 'idle' && !this.hideBar) {
      const w = this.boss ? 0 : 1.1;
      if (w) {
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(-w / 2, -2.05 * s, w, 0.12);
        g.fillStyle = this.faction === 'player' ? '#66bb6a' : '#ef5350'; g.fillRect(-w / 2, -2.05 * s, w * clamp(this.hp / this.d.maxHp, 0, 1), 0.12);
      }
    }
    if (this.showName && this.state === 'idle') {
      g.font = 'bold 0.26px Nunito, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 0.06; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(this.name, 0, -2.2 * s);
      g.fillStyle = this.nameColor || '#fff'; g.fillText(this.name, 0, -2.2 * s);
    }
    if (this.questMarker) {
      const bob = Math.sin(env.time * 4) * 0.08;
      g.font = 'bold 0.5px Bangers, sans-serif'; g.textAlign = 'center';
      // (a road's sign, 'R…', is a main-story '!' here)
      const main = this.questMarker[0] === 'M' || this.questMarker[0] === 'R', qm = this.questMarker[0] === 'R' ? '!' : this.questMarker.replace(/^M/, '');
      g.lineWidth = 0.08; g.strokeStyle = '#000'; g.strokeText(qm, 0, -2.5 * s + bob);
      g.fillStyle = main ? '#ff9100' : qm === '!' ? '#ffd54f' : '#90caf9'; g.fillText(qm, 0, -2.5 * s + bob);
    }
  }
}
