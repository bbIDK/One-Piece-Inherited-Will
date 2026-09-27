// The hotbar: ten slots on keys 1-9 and 0, each a technique id or
// `item:<id>` (food and medicine).
export const HOTBAR_SIZE = 10;
export const HOTBAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** The first empty slot (or -1). */
export function freeSlot(hb) {
  for (let i = 0; i < HOTBAR_SIZE; i++) if (!hb[i]) return i;
  return -1;
}

/** Put a technique in the first free slot (if there is one). */
export function addToHotbar(c, id) {
  c.hotbar = c.hotbar || [];
  if (c.hotbar.includes(id)) return;
  const i = freeSlot(c.hotbar);
  if (i >= 0) c.hotbar[i] = id;
}
