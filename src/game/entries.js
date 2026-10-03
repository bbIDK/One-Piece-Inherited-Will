// Taking out what a hotbar entry holds (hotbar.js): your fists, your Devil
// Fruit, one of its forms, its awakened set. (A weapon's entry is an item:
// inventory.js useItem draws it — and X — and drawing it puts the fruit away:
// lineage.js setDrawn.) Whatever is out puts its moveset on the skill keys
// and the mouse (moveset.js):
//
//   fists        the weapon back in its sheath, the fruit put away
//   the fruit    its base set; pressed again, put away — or, with a form of
//                it on, back to the base set
//   a form       switched on (its activation: Gear Second...), and pressed
//                again, off — what it leaves you with (spent, exhausted)
//                still comes; it runs out by itself too
//   awakened set on and off at will, once the fruit has awakened
//
// Forms belong to the fruit being out: put it away (fists, a weapon drawn,
// food in hand) and the form ends with it.
import { FRUITS, AWAKEN_MASTERY } from '../data/fruits.js';
import { getAbility, canUse } from './abilities.js';
import { ENTRY, formOfEntry, isMoveset } from './hotbar.js';
import { formBuff, movesetKind } from './moveset.js';
import { setDrawn } from './lineage.js';

export { isMoveset };

/** Put the fruit away (back to your fists): any form of it ends — a form's activation still winding up too. */
export function putFruitAway(p) {
  p.fruitOut = false;
  if (p.action?.def?.formOf) p.action = null;
  p.endForm?.();
}

/** Take the fruit out: the weapon goes back in its sheath, food back in the bag. */
function fruitOut(game, p) {
  if (p.drawn) setDrawn(game, false);
  if (p.held) { p.held = null; p.eating = null; }
  if (!p.fruitOut) game.audio?.sfx('equip');
  p.fruitOut = true;
}

/**
 * Why form `formId` ('awake' for the awakened set) of the fruit isn't open to
 * you yet, or ''.
 */
export function formLock(p, formId) {
  const f = FRUITS[p?.fruit];
  if (!f) return 'You have no Devil Fruit power.';
  const c = p.char || {};
  if (formId === 'awake') {
    if (c.fruitAwakened) return '';
    return (p.fruitMastery || 0) < AWAKEN_MASTERY
      ? `The ${f.name} hasn't awakened. Master it (fruit mastery ${AWAKEN_MASTERY}) — then a hard fight will bring it out.`
      : `The ${f.name} is ready to awaken: a hard fight against a worthy foe will bring it out.`;
  }
  const F = f.forms.find((x) => x.id === formId);
  if (!F) return `The ${f.name} has no such form.`;
  if ((p.fruitMastery || 0) < F.mastery) return `${F.name} opens at fruit mastery ${F.mastery}: fight worthy foes with the ${f.name}.`;
  return '';
}

/**
 * Select moveset entry `id` (fists, the fruit, a form, the awakened set).
 * True if something came out (or went away).
 */
export function takeOut(game, p, id) {
  if (!p || !isMoveset(id)) return false;
  if (id === ENTRY.fists) {
    const was = movesetKind(p);
    if (p.drawn) setDrawn(game, false);
    putFruitAway(p);
    if (was === 'fruit') game.audio?.sfx('equip');
    return true;
  }
  const f = FRUITS[p.fruit];
  if (!f) { game.log('You have no Devil Fruit power.', '#ff8a80'); return false; }
  const kind = movesetKind(p);
  const fb = formBuff(p);
  if (id === ENTRY.fruit) {
    // (out with a form on: back to its base set; out plain: away again)
    if (kind === 'fruit' && fb) p.endForm();
    else if (kind === 'fruit') { putFruitAway(p); game.audio?.sfx('equip'); }
    else fruitOut(game, p);
    return true;
  }
  const formId = id === ENTRY.awake ? 'awake' : formOfEntry(id);
  if (!formId) return false;
  // (pressed again while it's on: off, back to the base set)
  if (kind === 'fruit' && fb?.form === formId) { p.endForm(); return true; }
  const F = formId === 'awake' ? f.awakening : f.forms.find((x) => x.id === formId);
  const why = formLock(p, formId);
  if (why || !F) { game.log(why || 'Nothing there.', '#ffab91'); game.ui?.flashSlot?.(id); return false; }
  if (p.inWater || p.seastoned) { game.log('Your Devil Fruit power is useless here!', '#ff8a80'); return false; }
  const tired = p.buffs.find((b) => b.noForms);
  if (tired) { game.log(`You're exhausted: no ${F.name} until you get your breath back (${Math.ceil(tired.t)}s).`, '#ff8a80'); game.ui?.flashSlot?.(id); return false; }
  const def = getAbility(F.activate);
  if (!def) return false;
  // (it can't be switched on just now — coming back, no Haki for it, busy: the activation says why)
  if (!p.canAct() || !canUse(p, def) || (def.requiresHaki && !p.hakiLevel(def.requiresHaki))) {
    if ((p.cooldowns[def.id] || 0) > 0) game.ui?.flashSlot?.(id);
    return p.tryTechnique(def.id, game);
  }
  fruitOut(game, p);
  // (from one form straight into another: the first ends, and what it leaves you with comes)
  if (fb && fb.form !== formId) p.endForm();
  return p.tryTechnique(def.id, game);
}

/**
 * Each frame: a form of the fruit goes with the fruit being out. One switched
 * on some other way (an old hotbar's technique) takes the fruit out with it —
 * unless there's a weapon in your hands, when it ends.
 */
export function keepEntries(p) {
  if (!p) return;
  const has = !!FRUITS[p.fruit];
  if (p.fruitOut && !has) p.fruitOut = false;
  if (p.fruitOut || !formBuff(p)) return;
  // (the fruit gone — taken away in creative mode — or a weapon in hand: it ends)
  if (!has || (p.drawn && p.weapon)) p.endForm(false);
  else p.fruitOut = true;
}
