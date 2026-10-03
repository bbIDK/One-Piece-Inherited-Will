// The hotbar: ten slots on keys 1-9 and 0, each something you take out:
//   `item:<id>`       food, medicine, a Dial, a Devil Fruit to eat, a weapon
//                     (its key draws it, and again sheathes it)
//   `ms:fruit`        your Devil Fruit's powers (its skills on the skill keys)
//   `ms:form:<id>`    one of its forms (Gum-Gum's Gears...), once fighting
//                     with the fruit has opened it up
//   `ms:awake`        its awakened set, once it has awakened
//   `ms:fists`        bare hands (pressing what's out again puts it away too)
// Techniques themselves no longer live here: they're on the skill keys (keys.js).
export const HOTBAR_SIZE = 10;
export const HOTBAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const ENTRY = { fists: 'ms:fists', fruit: 'ms:fruit', awake: 'ms:awake', form: (id) => 'ms:form:' + id };
/** Is this hotbar entry a moveset (fists, the fruit, a form, the awakened set)? */
export const isMoveset = (id) => typeof id === 'string' && id.startsWith('ms:');
/** The form id of a form entry, or null. */
export const formOfEntry = (id) => (typeof id === 'string' && id.startsWith('ms:form:') ? id.slice(8) : null);

/** The first empty slot (or -1). */
export function freeSlot(hb) {
  for (let i = 0; i < HOTBAR_SIZE; i++) if (!hb[i]) return i;
  return -1;
}

/** Put an entry in the first free slot, if it isn't there already and there's room. Returns its slot (or -1). */
export function addToHotbar(c, id) {
  c.hotbar = c.hotbar || [];
  const at = c.hotbar.indexOf(id);
  if (at >= 0) return at;
  const i = freeSlot(c.hotbar);
  if (i >= 0) c.hotbar[i] = id;
  return i;
}

/** Take an entry off the hotbar (wherever it is). */
export function dropFromHotbar(c, id) {
  const hb = c.hotbar || [];
  for (let i = 0; i < hb.length; i++) if (hb[i] === id) hb[i] = null;
}
