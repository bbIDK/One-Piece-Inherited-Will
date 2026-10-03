// Inventory helpers operating on the character record.
import { addToHotbar, ENTRY } from './hotbar.js';
import { ITEMS } from '../data/items.js';
import { FRUITS, unlockedFruitTechniques } from '../data/fruits.js';
import { keysOf, keyLabel } from './keys.js';
import { refreshPlayer, persist, setDrawn } from './lineage.js';

export function count(char, id) {
  return (char.inventory || []).filter((i) => i.id === id).reduce((s, i) => s + (i.qty || 1), 0);
}

export function addItem(game, id, qty = 1, opts = {}) {
  const char = game.state.char;
  const d = ITEMS[id];
  if (!d) return false;
  const stackable = !['weapon', 'hat', 'coat', 'fruit', 'accessory'].includes(d.type) || d.stack;
  const ex = stackable && char.inventory.find((i) => i.id === id);
  if (ex) ex.qty = (ex.qty || 1) + qty;
  else if (stackable) char.inventory.push({ id, qty });
  else for (let k = 0; k < qty; k++) char.inventory.push({ id, qty: 1, ...opts });
  if (!opts.silent) game.log(`Obtained ${d.name}${qty > 1 ? ' ×' + qty : ''}.`, '#ffe082');
  // (your first pose goes straight into the Log Pose slot: its needle shows at once)
  if (slotKind(d) === 'pose' && char.equipped && !char.equipped.pose) { char.equipped.pose = id; game.emit('poseEquipped', id); }
  game.emit('itemGained', id, qty);
  return true;
}

export function removeItem(game, id, qty = 1) {
  const char = game.state.char;
  let left = qty;
  for (let i = char.inventory.length - 1; i >= 0 && left > 0; i--) {
    const it = char.inventory[i];
    if (it.id !== id) continue;
    const take = Math.min(left, it.qty || 1);
    it.qty = (it.qty || 1) - take;
    left -= take;
    if (it.qty <= 0) char.inventory.splice(i, 1);
  }
  // unequip if it was worn
  const eq = char.equipped;
  if (!count(char, id)) {
    if (eq.hat === id) eq.hat = null;
    if (eq.coat === id) eq.coat = null;
    eq.weapons = (eq.weapons || []).filter((w) => w !== id);
    eq.accessories = (eq.accessories || []).filter((w) => w !== id);
    // (another Log Pose you carry takes its place)
    if (eq.pose === id) eq.pose = char.inventory.find((i) => ITEMS[i.id]?.logPose)?.id || null;
    const hb = char.hotbar || [];
    for (let k = 0; k < hb.length; k++) if (hb[k] === 'item:' + id) hb[k] = null;
    refreshPlayer(game);
  }
  return left === 0;
}

export function pay(game, amount) {
  const c = game.state.char;
  if (c.berries < amount) return false;
  c.berries -= amount;
  return true;
}

export function earn(game, amount, why) {
  const c = game.state.char;
  c.berries += Math.round(amount);
  if (why !== false) game.log(`+฿${Math.round(amount).toLocaleString()}${why ? ' — ' + why : ''}`, '#ffd54f');
}

export const ACC_SLOTS = 2;

export function isEquipped(c, id) {
  const eq = c.equipped || {};
  return eq.hat === id || eq.coat === id || eq.pose === id || (eq.weapons || []).includes(id) || (eq.accessories || []).includes(id);
}

/** Equip (or, if already worn, take off) an item. `slot` picks an accessory slot. */
export function equip(game, id, { slot } = {}) {
  const c = game.state.char;
  const d = ITEMS[id];
  if (!d || !count(c, id)) return;
  const eq = c.equipped;
  if (d.type === 'hat') eq.hat = eq.hat === id ? null : id;
  else if (d.type === 'coat') eq.coat = eq.coat === id ? null : id;
  else if (d.type === 'accessory') {
    const acc = (eq.accessories || []).filter(Boolean);
    const worn = acc.filter((x) => x === id).length;
    if (slot !== undefined) {
      if (worn >= count(c, id)) acc.splice(acc.indexOf(id), 1);
      if (slot < acc.length) acc[slot] = id; else acc.push(id);
    } else if (worn && worn >= count(c, id)) acc.splice(acc.indexOf(id), 1);
    else if (acc.length < ACC_SLOTS) acc.push(id);
    else { acc.shift(); acc.push(id); }
    eq.accessories = acc.slice(0, ACC_SLOTS);
  } else if (d.type === 'weapon') {
    const ws = eq.weapons || [];
    if (ws.includes(id) && ws.filter((w) => w === id).length >= count(c, id)) eq.weapons = ws.filter((w) => w !== id);
    else if (d.kind === 'sword' && ws.length && ITEMS[ws[0]]?.kind === 'sword' && ws.length < 3) eq.weapons = [...ws, id];
    else eq.weapons = [id];
    // (on the hotbar, if there's room: its key draws it, and again puts it away)
    if (eq.weapons.includes(id)) addToHotbar(c, 'item:' + id);
    if (eq.weapons.length) game.hint?.('draw', 'X — or the weapon\'s key on the hotbar — draws your weapon, and puts it back in its sheath. Sheathed, you fight with your fists; drawn, its moves and their keys show at the bottom right.');
    if (id === 'sandai_kitetsu' && !c.flags.kitetsuTested) {
      c.flags.kitetsuTested = true;
      game.log('You toss the cursed Kitetsu into the air and hold out your arm… it spins down and misses you by a hair. The blade accepts you.', '#ef9a9a');
    }
  } else if (slotKind(d) === 'pose') {
    // (the pose you follow: its needle is the one on your wrist, and on the charts)
    eq.pose = eq.pose === id ? null : id;
    game.audio?.sfx('equip');
    if (eq.pose) game.emit('poseEquipped', id);
    return;
  } else return;
  refreshPlayer(game);
  game.audio?.sfx('equip');
}

/** Take off whatever is in an equipment slot: head, body, weapon0-2, acc0-1, pose. */
export function unequipSlot(game, slot) {
  const eq = game.state.char.equipped;
  if (slot === 'pose') { eq.pose = null; game.audio?.sfx('equip'); return; }
  if (slot === 'head') eq.hat = null;
  else if (slot === 'body') eq.coat = null;
  else if (slot.startsWith('weapon')) { const i = +slot.slice(6); eq.weapons = (eq.weapons || []).filter((_, k) => k !== i); }
  else if (slot.startsWith('acc')) { const i = +slot.slice(3); eq.accessories = (eq.accessories || []).filter((_, k) => k !== i); }
  refreshPlayer(game);
  game.audio?.sfx('equip');
}

/** Which slot an item goes to, for drag-and-drop checks. */
export function slotKind(d) {
  if (!d) return null;
  return d.type === 'hat' ? 'head' : d.type === 'coat' ? 'body' : d.type === 'weapon' ? 'weapon' : d.type === 'accessory' ? 'acc' : d.type === 'pose' || d.logPose ? 'pose' : null;
}

export function useItem(game, id) {
  const c = game.state.char;
  const p = game.player;
  const d = ITEMS[id];
  if (!d || !count(c, id)) return false;
  if (d.type === 'food' || d.type === 'medicine') {
    if (p.state !== 'idle') return false;
    let heal = d.heal || 0;
    if (d.type === 'food') {
      if (c.traits.includes('iron_stomach')) heal *= 1.3;
      if (c.flags?.allBlue) heal *= 1.25; // a cook who has seen the All Blue
      heal *= game.crewMods?.foodMul || 1;
    }
    if (d.costsLife) {
      if (c.lives <= 1) { game.log('Ivankov refuses: "You don\'t have the years to spare, candy-boy!"', '#ff8a80'); return false; }
      c.lives -= 1;
      game.log('Tension Hormones! Your body screams back to full strength — and your lifespan shortens.', '#ff8a80');
    }
    p.hp = Math.min(p.d.maxHp, p.hp + heal);
    for (const s of d.cure || []) delete p.status[s];
    if (d.buff) p.addBuff({ ...d.buff });
    game.fx.text(p.x, p.y - 1.6, `+${Math.round(heal)}`, '#69f0ae', 0.45);
    game.audio?.sfx('eat');
    removeItem(game, id, 1);
    return true;
  }
  if (d.type === 'fruit') return eatFruit(game, id);
  // a weapon on the hotbar: draw it — putting it on first if you weren't
  // wearing it — or, drawn, put it back in its sheath (it stays on you)
  if (d.type === 'weapon') {
    if (!(c.equipped.weapons || []).includes(id)) { equip(game, id); setDrawn(game, true); }
    else setDrawn(game, !p.drawn);
    return true;
  }
  if (d.type === 'pose' && d.target) {
    // Eternal Pose: always points to one island, no matter where you are —
    // following it is having it in the Log Pose slot
    if (c.equipped.pose !== id) equip(game, id);
    return true;
  }
  // a Dial: learn to use it (the first time), and on the hotbar its key fires it (main.js useHotbarItem)
  if (d.type === 'dial' && d.ability) {
    const learned = c.techniques.includes(d.ability);
    if (!learned) {
      c.techniques.push(d.ability);
      const at = addToHotbar(c, 'item:' + id);
      game.log(`You can use the ${d.name} now${at >= 0 ? ` — its key on the hotbar (${at === 9 ? 0 : at + 1}) fires it` : ' — put it on the hotbar to fire it'}.`, '#80deea');
    }
    return true;
  }
  return false;
}

export function eatFruit(game, itemId) {
  const c = game.state.char;
  const p = game.player;
  const fid = ITEMS[itemId].fruit;
  const f = FRUITS[fid];
  if (c.fruit) {
    // Canon: a body can only hold one Devil Fruit — a second one tears you
    // apart. You can still carry, sell or trade the fruits you find.
    game.log(`You already carry the power of the ${FRUITS[c.fruit]?.name}. A second Devil Fruit would tear your body apart — better to keep it, sell it, or give it to someone worthy.`, '#ff8a80');
    return false;
  }
  removeItem(game, itemId, 1);
  c.fruit = fid;
  c.fruitMastery = 0;
  c.fruitsEaten = 1;
  c.fruitAwakened = false;
  // (the whole base set is yours at once, as in the anime; the fruit gets its entry on the hotbar, and comes out)
  for (const tid of unlockedFruitTechniques(fid, 0)) if (!c.techniques.includes(tid)) c.techniques.push(tid);
  const at = addToHotbar(c, ENTRY.fruit);
  refreshPlayer(game);
  if (p) { if (p.drawn) setDrawn(game, false); p.fruitOut = true; }
  game.ui.toast(f.name.toUpperCase(), `${f.en} — ${f.type}. It tastes horrible.`, '#ffab91');
  game.fx.ring(p.x, p.y, 0.3, 4, f.color, 0.8, 0.25);
  game.fx.burst(p.x, p.y - 0.8, 30, { color: [f.color, '#ffffff'], speed: 5, g: 0, life: 0.8, kind: 'star' });
  const K = keysOf(game.settings).skills.filter(Boolean).slice(0, Math.min(5, f.techniques.length)).map(keyLabel).join(' ');
  game.log(`You ate the ${f.name}! You can never swim again. Its powers are yours: out now, its techniques are on ${K}${at >= 0 ? ` — ${at === 9 ? 0 : at + 1} on the hotbar takes it out or puts it away` : ''}. Fighting worthy foes with it opens up the rest.`, '#ffab91');
  game.emit('fruitEaten', fid);
  persist(game);
  return true;
}
