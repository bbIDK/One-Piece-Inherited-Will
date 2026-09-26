import { Entity } from './entity.js';
import { derive, baseAttrs, doriki } from './stats.js';
import { drawCharacter } from '../render/character.js';
import { getAbility, canUse, startAbility, updateAbility } from './abilities.js';
import { STYLES } from '../data/styles.js';
import { FRUITS } from '../data/fruits.js';
import { RACES } from '../data/races.js';
import { WALKABLE, SWIMMABLE, IS_LIQUID, OVERLAY, T } from '../world/tiles.js';
import { clamp, TAU } from '../core/math.js';

const STATUS_DEFAULTS = {
  burn: { dps: 0.035, color: '#ff7043' }, poison: { dps: 0.03, color: '#8e24aa' }, bleed: { dps: 0.025, color: '#c62828' }, dry: { dps: 0.04, color: '#d7b56d' },
};

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
    this.stamina = this.d.maxStamina;
    this.haki = this.hakiUnlocked() ? this.d.maxHaki : 0;
    this.facing = o.facing ?? Math.PI / 2;
    this.walk = 0;
    this.moving = false;
    this.intent = { mx: 0, my: 0, sprint: false };
    this.action = null;
    this.combo = { step: 0, window: 0 };
    this.state = 'idle';
    this.iframes = 0;
    this.hitstun = 0;
    this.kb = { x: 0, y: 0 };
    this.dash = null;
    this.blocking = false;
    this.blockTime = 0;
    this.armament = false;
    this.observation = false;
    this.flashT = 0;
    this.knockT = 0;
    this.inWater = false;
    this.drownT = 0;
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

  recalc() {
    const mods = { ...this.baseMods };
    let speedMul = mods.speedMul;
    for (const b of this.buffs) if (b.mods?.speedMul) speedMul *= b.mods.speedMul;
    mods.speedMul = speedMul;
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
  hasWeapon(kind) {
    if (!this.weapon) return false;
    if (kind === 'sword') return this.weapon.kind === 'sword' && (this.weapon.count || 1) >= (STYLES[this.style]?.swords || 1);
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

  addBuff(b) {
    this.buffs = this.buffs.filter((x) => x.id !== b.id);
    const buff = { ...b, t: b.dur ?? 10 };
    this.buffs.push(buff);
    if (b.forceArmament) this.armament = true;
    if (b.conquerorInfused) this.conquerorInfused = true;
    this.recalc();
    return buff;
  }

  addStatus(k, v, src) {
    const cur = this.status[k];
    if (k === 'wet' && this.status.burn) delete this.status.burn;
    if (k === 'burn' && this.status.wet) return;
    if ((k === 'burn' && this.fruit === 'mera') || (k === 'poison' && this.fruit === 'doku')) return;
    const dur = typeof v === 'number' ? v : v.t;
    if (!cur || cur.t < dur) this.status[k] = { t: dur, src, acc: 0 };
    if (k === 'freeze') { this.action = null; this.blocking = false; }
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
    if (this.fruitDef?.passive?.damageTaken) n *= this.fruitDef.passive.damageTaken;
    const ev = this.buffs.reduce((a, b) => a + (b.mods?.evade || 0), 0);
    if (ev > 0 && Math.random() < ev && !h?.unblockable) {
      game.fx.text(this.x, this.y - 1.3, 'EVADE', '#e1f5fe', 0.3);
      return;
    }
    this.hp -= n * this.buffMul('defMul');
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
    this.state = 'knocked';
    this.knockT = 0;
    this.action = null;
    this.blocking = false;
    this.dash = null;
    this.buffs = [];
    this.armament = false;
    this.recalc();
    game.fx.burst(this.x, this.y - 0.3, 12, { color: '#d7ccc8', speed: 3, g: 5, life: 0.5, kind: 'smoke', size: 0.25 });
    game.audio?.sfx('ko');
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
    const m = this.kbResist ?? 1;
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
  busy() { return !!this.action || this.hitstun > 0 || this.state !== 'idle' || this.status.freeze || this.status.despair; }

  canAct() { return !this.busy() && !this.blocking; }

  tryM1(game) {
    if (this.state !== 'idle' || this.hitstun > 0 || this.status.freeze || this.status.despair) return false;
    if (this.action) {
      // buffer next combo hit near the end of the current swing
      if (this.action.def.m1Chain && this.action.t > this.action.total * 0.55) this.combo.queued = true;
      return false;
    }
    const style = STYLES[this.style] || STYLES.brawler;
    let chain = style.m1Ids;
    if (style.weapon && !this.hasWeapon(style.weapon)) chain = STYLES.brawler.m1Ids;
    if (this.combo.window <= 0) this.combo.step = 0;
    const id = chain[this.combo.step % chain.length];
    const def = getAbility(id);
    if (!def || this.stamina < 1) return false;
    startAbility(this, { ...def, m1Chain: true }, game);
    this.combo.step = (this.combo.step + 1) % chain.length;
    this.combo.window = 0.55 + (def.recover || 0.2);
    this.applyElementBuff();
    return true;
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
    if (!this.canAct()) return false;
    const style = STYLES[this.style] || STYLES.brawler;
    let def = getAbility(style.heavyId);
    if (style.weapon && !this.hasWeapon(style.weapon)) def = getAbility(STYLES.brawler.heavyId);
    if (!canUse(this, def)) return false;
    startAbility(this, def, game);
    this.applyElementBuff();
    return true;
  }

  tryTechnique(id, game, target) {
    if (!this.canAct()) return false;
    const def = getAbility(id);
    if (!def) return false;
    if (def.requiresHaki && !this.hakiLevel(def.requiresHaki)) { if (this.isPlayer) game.log(`${def.name} requires ${def.requiresHaki} Haki.`, '#ff8a80'); return false; }
    if (def.requiresNight && game.env.daylight > 0.35) { if (this.isPlayer) game.log('Only under the night sky...', '#ff8a80'); return false; }
    if (def.requiresFruit && this.fruit !== def.requiresFruit) { if (this.isPlayer) game.log(`${def.name} needs the ${FRUITS[def.requiresFruit]?.name}.`, '#ff8a80'); return false; }
    if (!canUse(this, def)) {
      if (this.isPlayer) {
        if ((this.cooldowns[def.id] || 0) > 0) game.ui?.flashSlot(id);
        else if (def.source?.startsWith('fruit') && this.inWater) game.log('Your Devil Fruit power is useless in the sea!', '#ff8a80');
        else if (def.weapon && !this.hasWeapon(def.weapon)) game.log(`${def.name} needs ${def.weapon === 'sword' ? `${STYLES[this.style]?.swords || 1} sword(s)` : 'a ' + def.weapon}.`, '#ff8a80');
        else game.log('Not enough ' + ((def.cost?.haki && this.haki < def.cost.haki) ? 'Haki.' : 'stamina.'), '#ff8a80');
      }
      return false;
    }
    startAbility(this, def, game, target);
    if (def.source?.startsWith('style')) this.applyElementBuff();
    return true;
  }

  tryDodge(game, dx, dy) {
    if (this.state !== 'idle' || this.hitstun > 0 || this.status.freeze || this.status.root || this.dodgeCd > 0) return false;
    if (this.action && this.action.t < this.action.total * 0.5 && !this.action.def.m1Chain) return false;
    const cost = 16;
    if (this.stamina < cost * 0.6) return false;
    this.stamina = Math.max(0, this.stamina - cost);
    this.action = null;
    this.blocking = false;
    let len = Math.hypot(dx, dy);
    if (len < 0.1) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); len = 1; }
    const R = RACES[this.race] || {};
    const dist = 3.2 * (this.race === 'skypiean' ? 1.3 : 1) * (this.race === 'lunarian' ? 1.4 : 1) * (this.dashMul || 1);
    const time = 0.22;
    this.dash = { vx: dx / len * dist / time, vy: dy / len * dist / time, t: time, dodge: true, ignoreWater: this.race === 'lunarian' };
    this.iframes = Math.max(this.iframes, 0.2 + (this.race === 'mink' ? 0.05 : 0));
    this.dodgeCd = 0.42 - this.attrs.agi * 0.0015;
    game.fx.burst(this.x, this.y, 6, { color: '#d7ccc8', speed: 2, g: 3, life: 0.3, kind: 'smoke', size: 0.18 });
    game.audio?.sfx('dodge');
    return R;
  }

  setBlock(on) {
    if (on && !this.blocking) {
      if (this.state !== 'idle' || this.action || this.hitstun > 0 || this.status.freeze) return;
      this.blocking = true;
      this.blockTime = 0;
    } else if (!on) this.blocking = false;
  }

  // --- update ------------------------------------------------------------------
  update(dt, game) {
    if (!this.alive) return;
    this.sortY = this.y;
    if (this.state === 'knocked') {
      this.knockT += dt;
      this.updateMovement(dt, game, true);
      if (this.controller && this.controller.whileKnocked) this.controller.whileKnocked(this, dt, game);
      return;
    }
    if (this.state === 'dead') return;

    if (this.onShip) {
      // standing at the helm: no walking physics, but timers and techniques still run
      if (this.controller) this.controller.update(this, dt, game);
      this.iframes = Math.max(0, this.iframes - dt);
      this.hitstun = Math.max(0, this.hitstun - dt);
      for (const k in this.cooldowns) { this.cooldowns[k] -= dt; if (this.cooldowns[k] <= 0) delete this.cooldowns[k]; }
      this.updateStatus(dt, game);
      this.updateBuffs(dt, game);
      this.updateResources(dt, game);
      if (this.action) updateAbility(this, dt, game);
      this.inWater = false;
      this.moving = false;
      return;
    }

    if (this.controller) this.controller.update(this, dt, game);

    // timers
    this.iframes = Math.max(0, this.iframes - dt);
    this.hitstun = Math.max(0, this.hitstun - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.dodgeCd = Math.max(0, (this.dodgeCd || 0) - dt);
    this.combo.window = Math.max(0, this.combo.window - dt);
    this.damageShown = Math.max(0, this.damageShown - dt);
    if (this.forcedWater) this.forcedWater = Math.max(0, this.forcedWater - dt);
    for (const k in this.cooldowns) {
      this.cooldowns[k] -= dt * (this.cdMulBuff ? this.buffMul('cdMul') : 1);
      if (this.cooldowns[k] <= 0) delete this.cooldowns[k];
    }
    if (this.blocking) this.blockTime += dt;

    this.updateStatus(dt, game);
    this.updateBuffs(dt, game);
    this.updateResources(dt, game);

    if (this.action) {
      updateAbility(this, dt, game);
      if (!this.action && this.combo.queued) {
        this.combo.queued = false;
        this.tryM1(game);
      }
    }
    this.updateMovement(dt, game, false);
    this.updateWater(dt, game);

    const sp = Math.hypot(this.vx, this.vy);
    this.moving = sp > 0.4;
    if (this.moving) this.walk += dt * sp * 2.6;
  }

  updateStatus(dt, game) {
    const st = this.status;
    for (const k of Object.keys(st)) {
      const s = st[k];
      s.t -= dt;
      const dot = STATUS_DEFAULTS[k];
      if (dot) {
        s.acc += dt;
        if (s.acc >= 0.5) {
          s.acc -= 0.5;
          const dmg = Math.max(1, Math.round(this.d.maxHp * dot.dps * 0.5 * (this.boss ? 0.25 : 1)));
          this.hp -= dmg;
          game.fx.text(this.x, this.y - 1.1, String(dmg), dot.color, 0.3);
          if (k === 'burn') game.fx.burst(this.x, this.y - 0.6, 4, { color: ['#ff7043', '#ffca28'], speed: 1, vz: 2, g: -2, life: 0.4, kind: 'fire', size: 0.15 });
          if (this.hp <= 0) { this.hp = 0; this.knockOut(game, s.src); return; }
        }
      }
      if (k === 'shock' && Math.random() < dt * 3) { this.hitstun = Math.max(this.hitstun, 0.12); game.fx.burst(this.x, this.y - 0.7, 3, { color: '#fff176', speed: 3, g: 0, life: 0.15, kind: 'line' }); }
      if (s.t <= 0) delete st[k];
    }
    if (st.freeze || st.despair) { this.action = null; this.blocking = false; }
    if (st.seastone && this.armament && this.fruit) { /* seastone doesn't stop haki */ }
  }

  updateBuffs(dt, game) {
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t -= dt;
      if (b.drain) {
        if (b.drain.stamina) this.stamina -= b.drain.stamina * dt;
        if (b.drain.haki) this.haki -= b.drain.haki * dt;
        if (this.stamina < 0 || this.haki < 0) { this.stamina = Math.max(0, this.stamina); this.haki = Math.max(0, this.haki); b.t = 0; }
      }
      if (b.steam && Math.random() < dt * 8) game.fx.particle({ x: this.x + (Math.random() - 0.5) * 0.5, y: this.y, z: 1.2, vx: 0, vy: 0, vz: 1.5, g: -0.5, life: 0.7, size: 0.15, grow: 0.3, color: 'rgba(255,255,255,0.6)', kind: 'smoke' });
      if (b.t <= 0) {
        this.buffs.splice(i, 1);
        changed = true;
        if (b.forceArmament) this.armament = false;
        if (b.conquerorInfused) this.conquerorInfused = false;
        if (this.isPlayer && b.name) game.log(`${b.name} wore off.`, '#b0bec5');
        if (b.id === 'gear2' && this.isPlayer) { this.stamina *= 0.5; }
      }
    }
    if (changed) this.recalc();
    this.cdMulBuff = this.buffs.some((b) => b.mods?.cdMul);
  }

  updateResources(dt) {
    const d = this.d;
    const busy = !!this.action || this.blocking || this.intent.sprint || (this.inWater && !this.gills);
    if (!busy) this.stamina = Math.min(d.maxStamina, this.stamina + d.staminaRegen * dt);
    else if (!this.intent.sprint && !this.inWater) this.stamina = Math.min(d.maxStamina, this.stamina + d.staminaRegen * 0.25 * dt);
    if (this.hakiUnlocked()) {
      if (this.armament) {
        this.haki -= (1.6 - Math.min(1.0, this.hakiLevel('armament') * 0.012)) * dt;
        if (this.haki <= 0) { this.haki = 0; this.armament = false; }
      } else if (this.observation) {
        this.haki -= (1.0 - Math.min(0.7, this.hakiLevel('observation') * 0.008)) * dt;
        if (this.haki <= 0) { this.haki = 0; this.observation = false; }
      } else this.haki = Math.min(d.maxHaki, this.haki + d.hakiRegen * dt);
    }
    const regen = (this.fruitDef?.passive?.regen || 0) + d.hpRegen * (this.inCombat ? 0.2 : 1);
    if (this.hp < d.maxHp && this.state === 'idle') this.hp = Math.min(d.maxHp, this.hp + regen * dt);
  }

  passable(w, x, y) {
    if (w.isBlocked(x, y)) return false;
    const t = w.type(x, y);
    if (WALKABLE[t]) return true;
    if (SWIMMABLE[t]) {
      if (this.dash && this.dash.ignoreWater) return true;
      if (this.forcedWater) return true;
      return this.canEnterWater();
    }
    return false;
  }
  canEnterWater() {
    if (this.fruit && !this.inWater) return false; // Devil Fruit users won't walk into the sea
    return this.swimmer !== false;
  }
  canOccupy(w, x, y) {
    const r = this.r;
    return this.passable(w, x - r, y - 0.05) && this.passable(w, x + r, y - 0.05) && this.passable(w, x - r, y - 0.32) && this.passable(w, x + r, y - 0.32);
  }

  updateMovement(dt, game, knocked) {
    const w = game.world;
    let vx = 0, vy = 0;
    if (!knocked) {
      const i = this.intent;
      let sp = this.d.speed * (w.speedAt(this.x, this.y - 0.1) || 1);
      if (this.inWater) sp *= this.fruit ? 0.12 : 0.55 * this.canSwimRace;
      if (i.sprint && this.stamina > 1 && !this.inWater) { sp *= 1.55; this.stamina -= 9 * dt; }
      if (this.inWater && !this.gills && (i.mx || i.my)) this.stamina -= 3.5 * dt;
      if (this.blocking) sp *= 0.4;
      if (this.action) sp *= this.action.def.moveMul ?? (this.action.def.m1Chain ? 0.55 : 0.25);
      if (this.hitstun > 0 || this.status.root || this.status.freeze || this.status.despair) sp = 0;
      if (this.status.slowmo) sp *= 0.2;
      if (this.status.chill) sp *= 0.6;
      if (this.zoneSlow) sp *= this.zoneSlow;
      const tx = i.mx * sp, ty = i.my * sp;
      const k = Math.min(1, dt * 16);
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
    const decay = Math.exp(-dt * 8);
    this.kb.x *= decay; this.kb.y *= decay;
    if (Math.abs(this.kb.x) < 0.05) this.kb.x = 0;
    if (Math.abs(this.kb.y) < 0.05) this.kb.y = 0;
    this.moveBy(w, vx * dt, vy * dt);
  }

  moveBy(w, dx, dy) {
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.2));
    const sx = dx / n, sy = dy / n;
    let hit = false;
    for (let s = 0; s < n; s++) {
      if (sx) { if (this.canOccupy(w, this.x + sx, this.y)) this.x += sx; else { hit = true; this.kb.x *= -0.3; } }
      if (sy) { if (this.canOccupy(w, this.x, this.y + sy)) this.y += sy; else { hit = true; this.kb.y *= -0.3; } }
    }
    this.x = w.wx(this.x);
    if (this.y < 1) this.y = 1;
    if (this.y > w.height - 1) this.y = w.height - 1;
    return hit;
  }

  updateWater(dt, game) {
    const w = game.world;
    const t = w.type(this.x, this.y - 0.1);
    const was = this.inWater;
    this.inWater = IS_LIQUID[t] === 1 && !OVERLAY[t] && !(this.dash && this.dash.ignoreWater);
    if (this.inWater && !was) {
      game.fx.burst(this.x, this.y, 10, { color: ['#e1f5fe', '#81d4fa'], speed: 3, vz: 3, g: 9, life: 0.5, size: 0.12 });
      game.audio?.sfx('splash');
      if (this.fruit) { this.armament = this.armament && this.hakiUnlocked(); this.buffs = this.buffs.filter((b) => !b.source || !getAbility(b.source)?.source?.startsWith('fruit')); this.recalc(); }
    }
    if (this.inWater) {
      if (t === T.LAVA) { this.takeDamage(this.d.maxHp * 0.25 * dt, null, { element: 'fire' }, game); }
      if (this.fruit) {
        // Devil Fruit users sink.
        this.drownT += dt;
        this.stamina = Math.max(0, this.stamina - 30 * dt);
        if (this.drownT > 1.2) this.hp -= this.d.maxHp * 0.16 * dt;
        if (Math.random() < dt * 6) game.fx.particle({ x: this.x, y: this.y, z: 0.3, vx: 0, vy: 0, vz: 1, g: -0.5, life: 0.6, size: 0.1, color: '#e1f5fe', kind: 'bubble' });
        if (this.hp <= 0) { this.hp = 0; this.drowned = true; this.knockOut(game, null); }
      } else if (!this.gills && this.stamina <= 0) {
        this.drownT += dt;
        this.hp -= this.d.maxHp * 0.06 * dt;
        if (this.hp <= 0) { this.hp = 0; this.drowned = true; this.knockOut(game, null); }
      } else this.drownT = Math.max(0, this.drownT - dt);
    } else this.drownT = 0;
    const dmg = w.damageAt(this.x, this.y - 0.1);
    if (dmg && !this.inWater) this.takeDamage(dmg * dt, null, { element: 'fire' }, game);
  }

  // --- drawing -------------------------------------------------------------------
  draw(g, env) {
    const buffLook = this.buffs.find((b) => b.look);
    let look = buffLook ? { ...this.look, ...buffLook.look } : this.look;
    if (this.armament && this.action) look = { ...look, hand: '#1a1a1a', sleeve: look.sleeve };
    const scaleBuff = this.buffs.find((b) => b.mods?.scale);
    if (scaleBuff) look = { ...look, scale: (look.scale || 1) * scaleBuff.mods.scale };
    const act = this.action;
    const alphaBuff = this.buffs.find((b) => b.alpha !== undefined);
    const aura = this.buffs.find((b) => b.aura)?.aura || (this.armament && !this.isPlayer ? null : null) || (this.conquerorInfused ? 'rgba(0,0,0,0.8)' : null);
    const pose = {
      facing: this.facing, walk: this.walk, moving: this.moving, time: env.time + this.seed,
      action: this.blocking ? 'block' : act ? act.def.anim : null,
      actionT: act ? Math.min(1, act.t / Math.max(0.05, act.total)) : 0,
      state: this.state === 'knocked' ? 'knocked' : this.hitstun > 0.2 ? 'hurt' : this.state,
      swimming: this.inWater, alpha: alphaBuff ? alphaBuff.alpha : this.fadeAlpha, aura,
    };
    if (this.flashT > 0) g.filter = 'brightness(2.4)';
    drawCharacter(g, look, pose);
    if (this.flashT > 0) g.filter = 'none';
    const s = look.scale || 1;
    // status visuals
    if (this.status.freeze) {
      g.fillStyle = 'rgba(179,229,252,0.55)'; g.strokeStyle = 'rgba(225,245,254,0.9)'; g.lineWidth = 0.05;
      g.beginPath(); g.moveTo(-0.5 * s, 0); g.lineTo(-0.55 * s, -1.4 * s); g.lineTo(0, -1.9 * s); g.lineTo(0.55 * s, -1.4 * s); g.lineTo(0.5 * s, 0); g.closePath(); g.fill(); g.stroke();
    }
    if (this.status.root) { g.strokeStyle = '#8d6e63'; g.lineWidth = 0.06; g.beginPath(); g.ellipse(0, -0.2, 0.4, 0.15, 0, 0, TAU); g.stroke(); }
    if (this.status.despair) { g.fillStyle = 'rgba(80,60,120,0.6)'; g.font = 'bold 0.3px sans-serif'; g.textAlign = 'center'; g.fillText('...sorry I was born', 0, -2.0 * s); }
    if (this.hitstun > 0.4 || this.status.shock) {
      for (let k = 0; k < 3; k++) {
        const a = env.time * 6 + k * TAU / 3;
        g.fillStyle = '#ffeb3b'; g.font = '0.26px sans-serif'; g.textAlign = 'center';
        g.fillText('✦', Math.cos(a) * 0.35, -1.75 * s + Math.sin(a) * 0.1);
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
      g.lineWidth = 0.08; g.strokeStyle = '#000'; g.strokeText(this.questMarker, 0, -2.5 * s + bob);
      g.fillStyle = this.questMarker === '!' ? '#ffd54f' : '#90caf9'; g.fillText(this.questMarker, 0, -2.5 * s + bob);
    }
  }
}
