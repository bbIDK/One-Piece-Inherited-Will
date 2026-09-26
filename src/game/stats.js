// Attribute model. There are no XP levels: attributes rise through training,
// trainers, quests and hard-won fights ("breakthroughs"), never by farming.
import { clamp } from '../core/math.js';

export const ATTRS = {
  str: { name: 'Strength', short: 'STR', desc: 'Physical damage and carrying power.' },
  agi: { name: 'Agility', short: 'AGI', desc: 'Move speed, dodge recovery and attack speed.' },
  end: { name: 'Endurance', short: 'END', desc: 'Stamina pool, defence and stamina regeneration.' },
  vit: { name: 'Vitality', short: 'VIT', desc: 'Maximum health and recovery.' },
  wil: { name: 'Willpower', short: 'WIL', desc: 'Haki pool and potency, resistance to Conqueror\'s Haki, and your chance to get back up.' },
};
export const ATTR_KEYS = Object.keys(ATTRS);
export const ATTR_CAP = 100;

export function baseAttrs() {
  return { str: 5, agi: 5, end: 5, vit: 5, wil: 5 };
}

/** Derived numbers used by combat and movement. */
export function derive(a, mods = {}) {
  const hpMul = mods.hpMul || 1;
  return {
    maxHp: Math.round((90 + a.vit * 9 + a.end * 2) * hpMul),
    maxStamina: Math.round(100 + a.end * 3 + a.agi),
    maxHaki: Math.round(40 + a.wil * 4),
    speed: 4.3 * (1 + a.agi * 0.0045) * (mods.stride || 1) * (mods.speedMul || 1),
    dmg: 1 + a.str * 0.028,
    def: clamp(a.end * 0.0035, 0, 0.4),
    staminaRegen: 16 + a.end * 0.25,
    hpRegen: 0.25 + a.vit * 0.02,
    hakiRegen: 1.5 + a.wil * 0.06,
    atkSpeed: 1 + a.agi * 0.003,
  };
}

/**
 * Doriki — the CP9 strength measurement. A normal armed Marine is ~10;
 * Rob Lucci measured 4000. We map attributes + mastery + haki onto that scale.
 */
export function doriki(a, extra = {}) {
  const sum = a.str * 1.3 + a.agi * 0.9 + a.end * 1.0 + a.vit * 0.8 + a.wil * 0.8;
  const mastery = (extra.mastery || 0) * 0.6;
  const haki = (extra.haki || 0) * 1.2;
  const fruit = extra.fruit ? 60 + (extra.fruitMastery || 0) * 0.8 : 0;
  const p = sum + mastery + haki + fruit;
  return Math.round(Math.pow(p, 1.55) * 0.35);
}

/** Threat factor for anti-grind rewards: enemies much weaker than you give nothing. */
export function threatFactor(enemyPower, playerPower) {
  if (!playerPower) return 1;
  const r = enemyPower / playerPower;
  if (r < 0.55) return 0;
  return clamp((r - 0.55) / 0.45, 0, 1.6);
}
