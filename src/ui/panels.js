// Modal panels: inventory & equipment, character, skills, journal, pause
// menu, settings, shops, trainers, inns, doctors, shipyards.
import { h, clear, add } from './dom.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { STYLES } from '../data/styles.js';
import { FRUITS, FRUIT_RARITY } from '../data/fruits.js';
import { HAKI } from '../data/haki.js';
import { HAKI_HOW, charSignature, colourName, armamentReach, RYOU, FUTURE_SIGHT } from '../game/haki.js';
import { LEGENDS, LEGEND_IDS } from '../data/dreams.js';
import { RACES, raceLabel } from '../data/races.js';
import { TRAITS, refreshPlayer, persist, computeWill, hakiKnown, needsHaki, dChance, equippedLook, armorOf } from '../game/lineage.js';
import { ATTRS, ATTR_KEYS, ATTR_CAP } from '../game/stats.js';
import { getAbility } from '../game/abilities.js';
import { count, equip, useItem, addItem, removeItem, pay, earn, isEquipped, unequipSlot, slotKind, ACC_SLOTS } from '../game/inventory.js';
import { stockFor, priceOf } from '../data/shops.js';
import { SHIP_UPGRADES } from '../data/ships.js';
import { TRAINERS } from '../data/trainers.js';
import { formatBerries, clamp } from '../core/math.js';
import { helpContent, wantedPoster, portrait } from './screens.js';
import { WEAPON_KINDS } from '../game/progression.js';
import { repTier, stealFromShop, bannedFromShop } from '../game/reputation.js';
import { itemImg, skillImg, uiImg } from './icon.js';
import { openJollyRoger } from './crewPanel.js';
import { HOTBAR_SIZE, HOTBAR_KEYS } from '../game/hotbar.js';
import { RENDER_DIST, renderChunks } from '../game/save.js';
import { openShipwright } from './shipwrightPanel.js';
import { fmtDist } from './compass.js';
import { storyChoice } from './questsPanel.js';

const berriesLine = (c) => h('div.berries', uiImg('berries', 20), ` ${formatBerries(c.berries)}`);
const HOTBAR = HOTBAR_SIZE;
const USABLE = new Set(['food', 'medicine']);
// what can sit on the hotbar: food, medicine and Devil Fruits (taken in hand
// and eaten: see main.js useHotbarItem), weapons (taken in hand)
const ON_HOTBAR = new Set([...USABLE, 'fruit', 'weapon']);
const title = (s) => s[0].toUpperCase() + s.slice(1);

// ============================================================== hotbar editor
/** What a hotbar entry is: a technique id, or `item:<id>`. */
export function hotbarEntry(id, c) {
  if (!id) return null;
  if (id.startsWith('item:')) {
    const iid = id.slice(5), d = ITEMS[iid];
    if (!d) return null;
    return { kind: 'item', id: iid, def: d, name: d.name, qty: count(c, iid), img: (px) => itemImg(iid, px) };
  }
  const d = getAbility(id);
  if (!d) return null;
  return { kind: 'skill', id, def: d, name: d.name, img: (px) => skillImg(d, px) };
}

function ensureHotbar(c) {
  c.hotbar = c.hotbar || [];
  for (let i = 0; i < HOTBAR; i++) if (c.hotbar[i] === undefined) c.hotbar[i] = null;
  c.hotbar.length = HOTBAR;
  return c.hotbar;
}

/** Put something in a hotbar slot (from drag-and-drop or click-to-assign). */
export function assignHotbar(game, slot, payload) {
  const c = game.state.char;
  const hb = ensureHotbar(c);
  if (!payload) return;
  if (payload.startsWith('slot:')) {
    const j = +payload.slice(5);
    if (j === slot || j < 0 || j >= HOTBAR) return;
    [hb[slot], hb[j]] = [hb[j], hb[slot]];
  } else {
    let id = payload;
    if (payload.startsWith('skill:')) id = payload.slice(6);
    else if (payload.startsWith('item:') || payload.startsWith('inv:')) {
      const iid = payload.slice(payload.indexOf(':') + 1);
      const d = ITEMS[iid];
      if (!d || !ON_HOTBAR.has(d.type)) { game.log('Only food, medicine, Devil Fruits and weapons can go on the hotbar.', '#ff8a80'); return; }
      id = 'item:' + iid;
    } else return;
    for (let k = 0; k < HOTBAR; k++) if (hb[k] === id) hb[k] = null;
    hb[slot] = id;
  }
  refreshPlayer(game);
  game.audio?.sfx('equip');
}

/**
 * (The hotbar itself is the one at the bottom of the screen: while this menu
 * is open it takes drops, and clicking a slot puts whatever you've picked
 * there.) A line saying so, or what to do with the thing you've picked.
 */
function hotbarNote(game, what) {
  const pick = game.ui.hotbarPick;
  return h('p.hb-note' + (pick ? '.picking' : ''), pick
    ? `Now click a slot on your hotbar (keys ${HOTBAR_KEYS.join(' ')}) to put ${what || 'it'} there.`
    : 'Drag techniques, food, Devil Fruits and weapons straight onto your hotbar at the bottom of the screen (keys 1-9 and 0) — or click one, then click a slot. Drag slots to rearrange them; right-click one to clear it.');
}

/** Pick something to put on the hotbar with a click (the next hotbar slot clicked takes it). */
function pickForHotbar(game, payload, rerender) {
  const ui = game.ui;
  ui.hotbarPick = ui.hotbarPick === payload ? null : payload;
  ui.onHotbarChange = rerender;
  rerender();
}

/** Make an element a drag source for the hotbar / equipment. */
function dragSource(el, payload) {
  el.draggable = true;
  el.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', payload); ev.dataTransfer.effectAllowed = 'copyMove'; });
  return el;
}

// ============================================================== inventory
const CATS = [
  { id: 'all', name: 'All', icon: 'inventory', types: null },
  { id: 'gear', name: 'Gear', icon: 'sword', types: ['weapon', 'hat', 'coat', 'accessory'] },
  { id: 'food', name: 'Food & Medicine', icon: 'food', types: ['food', 'medicine'] },
  { id: 'fruit', name: 'Devil Fruits', icon: 'fruit', types: ['fruit'] },
  { id: 'other', name: 'Other', icon: 'key', types: ['key', 'dial', 'pose', 'treasure', 'material'] },
];
const TYPE_ORDER = ['weapon', 'hat', 'coat', 'accessory', 'food', 'medicine', 'fruit', 'dial', 'pose', 'key', 'treasure', 'material'];
const TYPE_NAME = { weapon: 'Weapon', hat: 'Headgear', coat: 'Body', accessory: 'Accessory', food: 'Food', medicine: 'Medicine', fruit: 'Devil Fruit', dial: 'Dial', pose: 'Eternal Pose', key: 'Key item', treasure: 'Treasure', material: 'Material' };

/** An item's numbers in a line: power, defence, bonuses, healing (also the creative panel's). */
export function statLine(d) {
  const parts = [];
  if (d.type === 'weapon') parts.push(`${title(d.kind || 'weapon')} · power ×${d.power}${d.grade ? ' · ' + d.grade : ''}`);
  if (d.armor) parts.push(`Defence +${Math.round(d.armor * 100)}%`);
  if (d.bonus) parts.push(Object.entries(d.bonus).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${ATTRS[k]?.short || k.toUpperCase()}`).join('  '));
  if (d.heal) parts.push(d.heal > 9999 ? 'Full health' : `+${d.heal} health`);
  if (d.buff) parts.push(`${d.buff.name} for ${d.buff.dur}s`);
  return parts.join(' · ');
}

export function openInventory(game) {
  const ui = game.ui;
  const c = game.state.char;
  const body = h('div.inv');
  const entry = ui.openPanel(body, { wide: true, id: 'inventory' });
  if (!entry) return;
  const st = { cat: 'all', selected: null };
  const render = () => {
    clear(body);
    const eq = c.equipped;
    eq.accessories = eq.accessories || [];
    // ---------------------------------------------------------- paper doll
    const slotBox = (key, label, id, accepts, iconName, disabled) => {
      const d = ITEMS[id];
      const box = h('div.eq-slot' + (d ? '.filled' : '') + (disabled ? '.disabled' : '') + (st.selected === id && d ? '.sel' : ''), {
        title: d ? `${d.name}\n${statLine(d)}\n\nClick for details · right-click to take off` : `${label} — empty`,
        on: {
          click: () => { if (d) { st.selected = id; render(); } },
          contextmenu: (ev) => { ev.preventDefault(); if (d) { unequipSlot(game, key); render(); } },
          dragover: (ev) => { ev.preventDefault(); box.classList.add('over'); },
          dragleave: () => box.classList.remove('over'),
          drop: (ev) => {
            ev.preventDefault();
            const data = ev.dataTransfer.getData('text/plain');
            if (!data.startsWith('inv:')) return;
            const iid = data.slice(4), dd = ITEMS[iid];
            if (slotKind(dd) !== accepts) { game.log(`That doesn't go in the ${label.toLowerCase()} slot.`, '#ff8a80'); render(); return; }
            if (!isEquipped(c, iid) || accepts === 'acc') equip(game, iid, accepts === 'acc' ? { slot: +key.slice(3) } : {});
            st.selected = iid;
            render();
          },
        },
      }, d ? itemImg(id, 40) : uiImg(iconName, 34, '.ghost'), h('span.lbl', d ? d.name : label));
      if (d) dragSource(box, 'eq:' + key);
      return box;
    };
    const ws = eq.weapons || [];
    const swords = ITEMS[ws[0]]?.kind === 'sword';
    const doll = h('div.doll',
      h('div.doll-col',
        slotBox('weapon0', 'Weapon', ws[0], 'weapon', 'weapon_slot'),
        slotBox('weapon1', '2nd sword', ws[1], 'weapon', 'weapon_slot', !swords),
        slotBox('weapon2', '3rd sword', ws[2], 'weapon', 'weapon_slot', !swords),
        slotBox('pose', 'Log Pose', eq.pose, 'pose', 'log_pose')),
      h('div.doll-mid', portrait(equippedLook(c), 104, 130)),
      h('div.doll-col',
        slotBox('head', 'Head', eq.hat, 'head', 'head_slot'),
        slotBox('body', 'Body', eq.coat, 'body', 'body_slot'),
        ...Array.from({ length: ACC_SLOTS }, (_, i) => slotBox('acc' + i, `Accessory ${i + 1}`, eq.accessories[i], 'acc', 'accessory_slot'))),
    );
    const p = game.player, dd = p.d;
    const summary = h('div.eq-summary',
      h('div', h('b', 'Health '), dd.maxHp), h('div', h('b', 'Defence '), `${Math.round(dd.def * 100)}%`, armorOf(c) ? h('span.muted', ` (armour ${Math.round(armorOf(c) * 100)}%)`) : null),
      h('div', h('b', 'Damage '), `×${dd.dmg.toFixed(2)}`), h('div', h('b', 'Speed '), dd.speed.toFixed(1)));
    const fruitNote = c.fruit ? h('div.fruit-note', itemImg('fruit_' + c.fruit, 26), h('div', h('b', FRUITS[c.fruit].name), h('div.sub', `Eaten · mastery ${Math.floor(c.fruitMastery)} · you can never swim again`))) : null;
    const left = h('div.inv-left', doll, summary, fruitNote);

    // -------------------------------------------------------------- grid
    const tabs = h('div.tabs.icon-tabs', CATS.map((k) => h('button' + (st.cat === k.id ? '.on' : ''), { on: { click: () => { st.cat = k.id; render(); } } }, uiImg(k.icon, 16), k.name)));
    const cat = CATS.find((k) => k.id === st.cat);
    const seen = new Map();
    // what's on the hotbar lives there, not in the bag
    const onBar = new Set((c.hotbar || []).filter((x) => typeof x === 'string' && x.startsWith('item:')).map((x) => x.slice(5)));
    for (const it of c.inventory) {
      const d = ITEMS[it.id];
      if (!d || (cat.types && !cat.types.includes(d.type))) continue;
      if (onBar.has(it.id)) continue;
      const ex = seen.get(it.id);
      if (ex) { ex.qty += it.qty || 1; if (it.heirloom) ex.heirloom = it; } else seen.set(it.id, { id: it.id, d, qty: it.qty || 1, heirloom: it.heirloom ? it : null });
    }
    const items = [...seen.values()].sort((a, b) => TYPE_ORDER.indexOf(a.d.type) - TYPE_ORDER.indexOf(b.d.type) || a.d.name.localeCompare(b.d.name));
    const grid = h('div.inv-grid', {
      on: {
        dragover: (ev) => ev.preventDefault(),
        drop: (ev) => {
          ev.preventDefault();
          const data = ev.dataTransfer.getData('text/plain');
          if (data.startsWith('eq:')) { unequipSlot(game, data.slice(3)); render(); }
          else if (data.startsWith('slot:')) {
            // a hotbar slot dragged back into the bag
            const i = +data.slice(5), hb = ensureHotbar(c);
            if (typeof hb[i] === 'string' && hb[i].startsWith('item:')) { hb[i] = null; refreshPlayer(game); game.audio?.sfx('equip'); render(); }
          }
        },
      },
    });
    for (const x of items) {
      const worn = isEquipped(c, x.id);
      const tile = h('div.inv-tile' + (st.selected === x.id ? '.sel' : '') + (worn ? '.worn' : ''), {
        title: `${x.d.name}${statLine(x.d) ? '\n' + statLine(x.d) : ''}`,
        on: {
          click: () => { st.selected = x.id; render(); },
          dblclick: () => { quickUse(x.id); },
        },
      }, itemImg(x.id, 40), x.qty > 1 ? h('span.qty', String(x.qty)) : null, worn ? h('span.worn-tag', 'E') : null, x.heirloom ? h('span.heir') : null);
      dragSource(tile, 'inv:' + x.id); // onto an equipment slot, or (food, weapons) onto the hotbar
      grid.appendChild(tile);
    }
    if (!items.length) grid.appendChild(h('p.muted', { style: { gridColumn: '1 / -1' } }, st.cat === 'all' ? 'Your bag is empty.' : 'Nothing here.'));
    if (onBar.size) grid.appendChild(h('p.muted.inv-onbar', { style: { gridColumn: '1 / -1' } }, `${onBar.size === 1 ? 'One item is' : onBar.size + ' items are'} on your hotbar — drag a slot back here to put it away.`));

    // ----------------------------------------------------------- details
    // (a weapon in hand still shows from its equipment slot)
    if (onBar.has(st.selected) && !isEquipped(c, st.selected)) st.selected = null;
    const sd = ITEMS[st.selected];
    let details;
    if (sd && count(c, st.selected)) {
      const id = st.selected;
      const worn = isEquipped(c, id);
      const acts = [];
      const isPose = slotKind(sd) === 'pose';
      if (slotKind(sd)) acts.push(h('button.btn' + (worn ? '.red' : '.gold'), { on: { click: () => { equip(game, id); render(); } } }, isPose ? (worn ? 'Put away' : 'Follow its needle') : worn ? 'Take off' : 'Equip'));
      if (USABLE.has(sd.type)) acts.push(h('button.btn.green', { on: { click: () => { useItem(game, id); render(); } } }, sd.type === 'food' ? 'Eat' : 'Use'));
      if (ON_HOTBAR.has(sd.type)) acts.push(h('button.btn' + (game.ui.hotbarPick === 'item:' + id ? '.gold' : ''), { on: { click: () => pickForHotbar(game, 'item:' + id, render) } }, game.ui.hotbarPick === 'item:' + id ? 'Now click a hotbar slot…' : 'Put on hotbar'));
      if (sd.type === 'dial') acts.push(h('button.btn', { disabled: c.techniques.includes(sd.ability), on: { click: () => { useItem(game, id); render(); } } }, c.techniques.includes(sd.ability) ? 'Learned' : 'Learn to use'));
      if (sd.type === 'fruit') {
        if (c.fruit) acts.push(h('span.muted', 'You have already eaten a Devil Fruit — a body can only hold one. Keep it, sell it, or give it away.'));
        else acts.push(h('button.btn.red', { on: { click: () => confirmEat(game, id, () => render()) } }, 'Eat…'));
      }
      const heir = c.inventory.find((i) => i.id === id && i.heirloom);
      details = h('div.inv-details',
        h('div.det-head', itemImg(id, 56), h('div', h('h4', sd.name), h('div.sub', `${TYPE_NAME[sd.type] || sd.type}${count(c, id) > 1 ? ' · ×' + count(c, id) : ''}${worn ? ' · equipped' : ''}`), heir ? h('div.sub', `Heirloom of ${heir.from}`) : null)),
        statLine(sd) ? h('div.det-stats', statLine(sd)) : null,
        sd.type === 'fruit' ? fruitInfo(sd) : h('p', sd.desc || ''),
        h('div.det-actions', acts),
        // (the Log Pose you follow: where its needle points, and where else you can set it)
        isPose && sd.logPose && worn ? coursePicker(game, render) : null);
    } else {
      details = h('div.inv-details.empty', h('p.muted', 'Select an item to see it. Drag gear onto the equipment slots, and food, Devil Fruits or weapons onto the hotbar. Double-click to equip or eat. Click your Log Pose in its slot to choose where its needle points.'));
    }
    const right = h('div.inv-right', tabs, grid, details);
    game.ui.onHotbarChange = render;
    add(body, h('div.panel-top', h('h2', 'Inventory'), berriesLine(c)), h('div.inv-cols', left, right), hotbarNote(game, ITEMS[game.ui.hotbarPick?.slice(5)]?.name));
  };
  const quickUse = (id) => {
    const d = ITEMS[id];
    if (slotKind(d)) equip(game, id);
    else if (USABLE.has(d.type)) useItem(game, id);
    else if (d.type === 'fruit' && !c.fruit) { confirmEat(game, id, () => render()); return; }
    st.selected = id;
    render();
  };
  render();
}

// the eight points of the compass, round from east (y points south)
const POINTS8 = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/**
 * Where the needle of the Log Pose in your slot points, and the islands you
 * can set it to instead (sea.js logOptions): where the story goes on, the
 * islands the last log can lock onto, and in the Blues the islands you've
 * charted in that sea.
 */
function coursePicker(game, rerender) {
  const c = game.state.char, p = game.player, w = game.surface;
  const opts = game.logPoseOptions?.() || [];
  const cur = c.logPose?.target;
  const rows = opts.map((o) => {
    const d = w.distance(p.x, p.y, o.isl.x, o.isl.y);
    const dir = POINTS8[((Math.round(Math.atan2(o.isl.y - p.y, w.dx(p.x, o.isl.x)) / (Math.PI / 4)) % 8) + 8) % 8];
    const on = o.id === cur;
    const here = game.currentIsland === o.isl;
    const why = { story: 'Where your story goes on', needle: 'A needle of your log', chart: 'Charted', now: 'Where it points now' }[o.why];
    return h('button.lp-opt' + (on ? '.on' : '') + (o.why === 'story' ? '.story' : ''), {
      title: on ? 'The needle points here' : `Set the needle to ${o.known ? o.isl.name : 'this island'}`,
      on: { click: () => { if (!on && game.setLogCourse?.(o.id)) rerender(); } },
    },
    uiImg(o.why === 'story' ? 'wp_main' : o.why === 'chart' ? 'map' : 'log_pose', 22),
    h('span.lp-name', o.known ? o.isl.name : 'An uncharted island', h('small', why)),
    h('span.lp-way', here ? 'here' : `${dir} · ${fmtDist(d)}`),
    on ? h('b.lp-cur', 'Following') : h('span.lp-cur'));
  });
  const none = game.world !== game.surface ? 'Out here the needle has nothing to lock onto. Back at sea, choose where it points.'
    : 'No log yet: stay on an island of the Grand Line until the needle settles, and the islands it can lock onto show here.';
  return h('div.lp-course',
    h('h5', uiImg('log_pose', 18), 'Where the needle points', rows.length > 1 ? h('small', 'click an island to swing it there') : null),
    rows.length ? h('div.lp-opts', rows) : h('p.muted', none));
}

function fruitInfo(d) {
  const f = FRUITS[d.fruit];
  if (!f) return h('p', d.desc || '');
  return h('div',
    h('p', h('b', `${f.en} · ${f.type}`), ' ', h('span.tag', { style: { background: FRUIT_RARITY[f.rarity]?.color, color: '#222' } }, FRUIT_RARITY[f.rarity]?.label)),
    h('p', f.desc));
}

/** Eat a Devil Fruit, after a last warning (from the Inventory — or the hotbar, on a touch screen). */
export function confirmEat(game, itemId, done = () => {}) {
  const c = game.state.char;
  const d = ITEMS[itemId];
  const f = FRUITS[d.fruit];
  if (c.fruit) { game.log('A body can only hold one Devil Fruit.', '#ff8a80'); return; }
  const body = h('div', { style: { textAlign: 'center' } },
    itemImg(itemId, 72),
    h('h2', f.name),
    fruitInfo(d),
    h('p', 'Techniques: ' + f.techniques.map((t) => `${t.name} (mastery ${t.mastery})`).join(', ')),
    h('p', { style: { color: '#b71c1c', fontWeight: 800 } }, 'You will never swim again — the sea becomes your grave if you fall in. And a body can only ever hold ONE Devil Fruit.'),
    h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } },
      h('button.btn.red', { on: { click: () => { game.ui.closePanel(); useItem(game, itemId); done(); } } }, 'Eat it'),
      h('button.btn', { on: { click: () => game.ui.closePanel() } }, 'Not yet')));
  game.ui.openPanel(body);
}

// ============================================================== character
export function openCharacter(game) {
  const ui = game.ui;
  const c = game.state.char;
  const p = game.player;
  const body = h('div.charsheet');
  const entry = ui.openPanel(body, { wide: true, id: 'character' });
  if (!entry) return;
  const render = () => {
    clear(body);
    const race = RACES[c.race];
    const legacy = game.state.legacy;
    const tier = repTier(c.reputation || 0);
    const rep = c.reputation || 0;
    const role = c.faction === 'marine' ? `Marine ${c.marineRank || 'Recruit'}` : c.crewName ? `Captain of the ${c.crewName}` : c.faction === 'pirate' ? 'Pirate' : 'Wanderer';
    const hasD = c.traits.includes('will_of_d');
    // ------------------------------------------------------------ header
    const header = h('div.char-head',
      portrait(equippedLook(c), 110, 130),
      h('div.char-id',
        h('h2', c.name),
        h('div', `${raceLabel(c.look)} · ${role} · generation ${c.generation}`),
        c.bounty ? h('div.bounty-line', uiImg('bounty', 18), ` Bounty ${formatBerries(c.bounty)}`) : null,
        h('div.rep', h('span.lbl', uiImg('reputation', 18), ' Reputation'), h('div.rep-bar', h('i', { style: { left: '0', width: clamp(rep, 0, 100) + '%', background: tier.color } })),
          h('span.rep-name', { style: { color: tier.color } }, `${tier.name} (${Math.round(rep)})`)),
        h('div.char-btns',
          h('button.btn', { on: { click: () => openJollyRogerFromMenu(game) } }, uiImg('jolly_roger', 18), 'Jolly Roger'),
          h('button.btn', { on: { click: () => ui.openPanel(h('div', { style: { display: 'grid', placeItems: 'center' } }, wantedPoster(c))) } }, uiImg('bounty', 18), 'Wanted poster'))),
      h('div.will-box',
        h('h4', uiImg('reputation', 18), ' Inherited Will'),
        h('div', h('b', `${legacy?.will || 0}`), ' banked by your lineage'),
        h('div', h('b', `+${computeWill(c)}`), ' if your journey ended today'),
        h('div.sub', 'Earned from islands charted, great foes defeated, days survived, your bounty and the legends you write. Spend it on your bloodline between generations.'),
        h('div.d-line' + (hasD ? '.has' : ''), hasD ? h('span', h('b', 'D.'), ' You carry the Will of D.') : h('span', `No "D." in your name. (${Math.round(dChance(legacy || {}) * 100)}% of births carry it.)`))),
    );
    // -------------------------------------------------------- attributes
    const prog = game.progression;
    const attrRows = ATTR_KEYS.map((k) => h('div.stat-row', { title: `${ATTRS[k].desc}\nTrains by: ${TRAINS_BY[k]}` },
      h('span.nm', ATTRS[k].name), h('span.val', c.attrs[k]),
      h('div.meter.dual', h('i', { style: { width: (100 * c.attrs[k] / ATTR_CAP) + '%' } }), h('u', { style: { width: (100 * (prog?.trainProgress(k) || 0)) + '%' } }))));
    const dd = p.d;
    const derived = h('div.derived', `Health ${dd.maxHp}${hakiKnown(c) ? ' · Spirit ' + dd.maxHaki : ''} · Speed ${dd.speed.toFixed(1)} · Damage ×${dd.dmg.toFixed(2)} · Defence ${Math.round(dd.def * 100)}% · Doriki ${p.power().toLocaleString()}`);
    const wm = c.weaponMastery || {};
    const wmRows = Object.entries(WEAPON_KINDS).map(([k, name]) => h('div.stat-row', { title: `+${((wm[k] || 0) * 0.6).toFixed(0)}% damage with ${name.toLowerCase()}` },
      h('span.nm', name), h('span.val', Math.floor(wm[k] || 0)),
      h('div.meter', h('i', { style: { width: (wm[k] || 0) + '%', background: 'linear-gradient(90deg,#6d4c33,#d4a373)' } }))));
    const masteryRows = Object.entries(c.masteries).filter(([s]) => STYLES[s]).map(([s, m]) => h('div.stat-row',
      h('span.nm', STYLES[s]?.name || s), h('span.val', Math.floor(m)),
      h('div.meter', h('i', { style: { width: m + '%', background: 'linear-gradient(90deg,#1565c0,#90caf9)' } }))));
    const hakiRows = hakiSection(c);
    // (King's Disposition shows once it has woken — or once a Haki master has sensed it in you)
    const traits = c.traits.filter((t) => TRAITS[t] && (!TRAITS[t].hidden || (t === 'conqueror' && (c.haki.conqueror || c.flags?.kingSensed))));
    const left = h('div',
      h('h3', 'Attributes'),
      h('p.muted', 'Attributes grow by themselves as you train and fight worthy opponents. The thin bar shows how close each one is to rising.'),
      ...attrRows, derived,
      h('h3', 'Weapon mastery'), h('p.muted', 'Every kind of weapon grows stronger the more you fight with it.'), ...wmRows);
    const right = h('div',
      h('h3', 'Fighting styles'), ...masteryRows,
      c.fruit ? h('div', h('h3', 'Devil Fruit'), h('div.stat-row', h('span.nm', FRUITS[c.fruit].name), h('span.val', Math.floor(c.fruitMastery)), h('div.meter', h('i', { style: { width: c.fruitMastery + '%', background: 'linear-gradient(90deg,#bf360c,#ffab91)' } })))) : null,
      h('div', h('h3', 'Haki'), ...hakiRows),
      h('h3', 'Traits'),
      ...race.traits.map((t) => h('div.li', t)),
      ...traits.map((t) => h('div.li', h('b', TRAITS[t].name + ': '), t === 'conqueror' && !c.haki.conqueror && TRAITS[t].latent ? TRAITS[t].latent : TRAITS[t].desc)),
      h('p.muted', { style: { marginTop: '10px' } }, `Lives ${c.lives}/${c.maxLives} · Second winds ${c.getUpCharges || 0} · ${(c.discovered || []).length} islands charted · ${(c.bosses || []).length} great foes · day ${game.env.day}`),
    );
    add(body, header, h('div.grid2', left, right));
  };
  render();
}
/**
 * The Character panel's Haki: each of the three — awakened, its level and
 * your own colours (a swatch: Armament's black with its sheen, Observation's
 * tint, Conqueror's colour, named); not yet, how it's obtained.
 */
function hakiSection(c) {
  const sig = charSignature(c);
  const sw = (hex, coat) => h('span.haki-sw' + (coat ? '.coat' : ''), { title: colourName(hex), style: coat ? { '--sw': hex } : { background: hex, '--sw': hex } });
  const rows = [];
  for (const [k, hk] of Object.entries(HAKI)) {
    const lvl = c.haki[k] || 0;
    if (lvl > 0) {
      const what = k === 'armament' ? `Black as iron (${colourName(sig.armament).toLowerCase()}); covers ${armamentReach(lvl) >= 1 ? 'the whole arms' : armamentReach(lvl) > 0.25 ? 'the forearms' : 'the fists'}${lvl >= RYOU.level ? ' — Ryou: your blows push it on through guards and into them' : ` (Ryou at ${RYOU.level})`}.`
        : k === 'observation' ? `Your tint: ${colourName(sig.observation)}.${lvl >= FUTURE_SIGHT ? ' Future Sight: you see the blows before they land.' : ` (Visions of the blows coming at ${FUTURE_SIGHT})`}`
          : `Your colour: ${colourName(sig.conqueror)}.`;
      rows.push(h('div.stat-row', { title: hk.desc },
        h('span.nm', k === 'armament' ? sw(sig.armament, true) : sw(k === 'observation' ? sig.observation : sig.conqueror), ' ', hk.name.replace(' Haki', '')), h('span.val', Math.floor(lvl)),
        h('div.meter', h('i', { style: { width: lvl + '%', background: k === 'conqueror' ? `linear-gradient(90deg,#111,${sig.conqueror})` : 'linear-gradient(90deg,#4a148c,#ce93d8)' } }))));
      rows.push(h('div.haki-how', what));
    } else {
      rows.push(h('div.stat-row.locked', { title: hk.desc }, h('span.nm', hk.name.replace(' Haki', '')), h('span.val', '—'), h('div.meter', h('i', { style: { width: '0%' } }))));
      const sensed = k === 'conqueror' && c.flags?.kingSensed && c.traits.includes('conqueror');
      rows.push(h('div.haki-how', sensed ? 'A Haki master sensed the qualities of a king in you: it will wake the day your will is truly tested.' : HAKI_HOW[k]));
    }
  }
  return rows;
}

const TRAINS_BY = {
  str: 'landing blows on worthy opponents, masters, breakthroughs',
  agi: 'dodging and parrying attacks, fighting with guns, masters',
  end: 'blocking hits, masters',
  vit: 'taking punishment and surviving, masters',
  wil: 'getting back up, facing stronger foes, Devil Fruit use, masters',
};

function openJollyRogerFromMenu(game) { openJollyRoger(game); }

// ================================================================= skills
export function openSkills(game) {
  const ui = game.ui;
  const c = game.state.char;
  const p = game.player;
  const body = h('div.skills');
  const entry = ui.openPanel(body, { wide: true, id: 'skills' });
  if (!entry) return;
  const render = () => {
    clear(body);
    game.ui.onHotbarChange = render;
    const styles = Object.keys(c.masteries).filter((s) => STYLES[s]);
    const styleBtns = styles.map((s) => h('button' + (c.style === s ? '.on' : ''), { on: { click: () => { c.style = s; refreshPlayer(game); render(); } }, title: STYLES[s].desc },
      `${STYLES[s].name} (${Math.floor(c.masteries[s])})`));
    const cur = STYLES[c.style];
    const needW = cur?.weapon && !p.hasWeapon(cur.weapon, c.style);
    // what you really fight with (the weapon in your hands decides: see lineage.js fightingStyle)
    const using = p.style !== c.style ? STYLES[p.style] : null;
    const w = p.weapon;
    const held = !w ? '' : w.kind === 'sword' ? (w.count > 1 ? `${w.count} swords` : 'a sword') : w.kind === 'axe' ? 'an axe' : `a ${w.kind}`;
    const usingName = using && `${using.name}${c.masteries[p.style] === undefined ? '\'s basic moves' : ''}`;
    const styleNote = needW ? `${cur.name} needs ${cur.weapon === 'sword' ? cur.swords + ' sword(s)' : 'a ' + cur.weapon} equipped — until then you fight ${using && p.style !== 'brawler' ? 'with ' + usingName : 'bare-handed'}.`
      : using ? `With ${held} in hand you fight with ${usingName} — take it off to fight with ${cur.name} again.` : null;
    const techs = c.techniques.map(getAbility).filter((d) => d && (!needsHaki(d) || hakiKnown(c)));
    const byGroup = {};
    for (const d of techs) {
      const src = d.source || '';
      const g = src.startsWith('fruit') ? 'Devil Fruit' : src.startsWith('haki') ? 'Haki' : src.startsWith('style:') ? (STYLES[src.slice(6)]?.name || 'Style') : d.style ? (STYLES[d.style]?.name || 'Style') : 'Other';
      (byGroup[g] = byGroup[g] || []).push(d);
    }
    const lists = Object.entries(byGroup).map(([g, ds]) => h('div',
      h('h4.grp', g),
      h('div.tech-grid', ds.map((d) => {
        const onBar = c.hotbar.includes(d.id);
        const card = h('div.tech' + (game.ui.hotbarPick === 'skill:' + d.id ? '.sel' : '') + (onBar ? '.onbar' : ''), {
          title: 'Drag onto your hotbar, or click and then click a slot on it',
          on: { click: () => pickForHotbar(game, 'skill:' + d.id, render) },
        }, skillImg(d, 40),
        h('div.grow', h('b', d.name), h('div.sub', d.desc || ''),
          h('div.sub.meta', [d.cd ? `cooldown ${d.cd}s` : null, d.cost?.haki && hakiKnown(c) ? `${d.cost.haki} spirit` : null, d.weapon ? `needs ${d.weapon}` : null].filter(Boolean).join(' · '))),
        onBar ? h('span.tag', `key ${HOTBAR_KEYS[c.hotbar.indexOf(d.id)]}`) : null);
        return dragSource(card, 'skill:' + d.id);
      }))));
    add(body, 
      h('h2', 'Skills'),
      h('h3', 'Fighting style'), h('div.tabs', styleBtns),
      styleNote ? h('p', { style: needW ? { color: '#b71c1c' } : null }, styleNote) : null,
      h('p.muted', cur?.desc || ''),
      hotbarNote(game, getAbility(game.ui.hotbarPick?.slice(6))?.name),
      h('h3', 'Techniques'), techs.length ? h('div', lists) : h('p', 'You know no techniques yet. Find a trainer — or a Devil Fruit.'),
      hakiKnown(c) ? h('p.muted', `Haki: ${[c.haki.armament && 'R toggles Armament', c.haki.observation && 'T toggles Observation', c.haki.conqueror && "G releases Conqueror's"].filter(Boolean).join(', ')}. Active Haki drains your spirit bar.`) : null,
    );
  };
  render();
}

// ================================================================ journal
export function openJournal(game) {
  const ui = game.ui;
  const c = game.state.char;
  const body = h('div.journal');
  const entry = ui.openPanel(body, { wide: true, id: 'journal' });
  if (!entry) return;
  // (quests have a menu of their own now: Quests, L) — and your road, with the
  // choice that goes with it: sail your own way, or take a road (up again)
  const road = h('div.journal-road');
  const drawRoad = () => {
    clear(road);
    const ch = storyChoice(game, drawRoad);
    add(road, uiImg(ch.state === 'free' || ch.state === 'shelved' ? 'ship' : 'wp_main', 18), h('span', ch.text), ch.button);
  };
  drawRoad();
  add(body, h('h2', 'Journal'),
    h('div.journal-quests', uiImg('quest', 18), h('span', ' Your main story and side quests are in the Quests menu.'), h('button.btn.small', { on: { click: () => ui.sideAction?.('quests') } }, 'Open Quests (L)')),
    road,
    h('h3', 'Legends'),
    h('p.muted', 'Nobody chooses your destiny. But the sea remembers those who do the impossible — every legend you write adds to your Inherited Will.'));
  const list = h('div.list');
  for (const id of LEGEND_IDS) {
    const L = LEGENDS[id];
    const got = (c.legends || []).includes(id);
    let pr = null;
    try { pr = L.progress ? L.progress(c) : null; } catch { pr = null; }
    list.appendChild(h('div.row-item' + (got ? '.legend-done' : ''),
      uiImg(got ? 'check' : 'journal', 22),
      h('div.grow', h('b', L.name), h('div.sub', L.desc),
        pr && !got ? h('div.stat-row', h('div.meter', h('i', { style: { width: Math.min(100, 100 * pr[0] / pr[1]) + '%' } })), h('span.sub', `${pr[0].toLocaleString()} / ${pr[1].toLocaleString()} ${pr[2]}`)) : null),
      h('span.price', got ? 'Achieved' : `+${L.will} Will`)));
  }
  body.appendChild(list);
}

// =================================================================== menu
export function openMenu(game, { onQuit, onRetire, onSave, extra = [] }) {
  const ui = game.ui;
  const c = game.state.char;
  const saved = h('p.muted.save-note', c.lastSaved ? `Last saved ${new Date(c.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet');
  const btn = (icon, text, fn, cls = '') => h('button.btn.menu-btn' + cls, { on: { click: fn } }, uiImg(icon, 20), text);
  const body = h('div.pause',
    // (in a multiplayer voyage the world goes on: only your own game waits)
    h('h2', game.net ? 'Menu' : 'Paused'),
    h('div.menu-list',
      btn('check', 'Resume', () => ui.closePanel(), '.gold'),
      ...extra.map((e) => btn(e.icon, e.text, () => { ui.closePanel(); e.fn(); })),
      btn('save', 'Save game', () => { if (onSave()) saved.textContent = `Saved just now (lineage ${game.saveSlot || 1})`; }),
      btn('help', 'How to Play', () => { ui.closePanel(); ui.openPanel(helpContent(c), { wide: true, id: 'help', pause: true }); }),
      btn('settings', 'Settings', () => { ui.closePanel(); openSettings(game); }),
      btn('inn', 'Get unstuck: back to your bed', async () => {
        const p = game.player, r = c.rest || c.spawn;
        if (p.inCombat) { saved.textContent = "Not in the middle of a fight — get clear of it first."; return; }
        if (p.state !== 'idle') return;
        if (!(await ui.ask({ title: 'Back to your bed?', text: `Stuck somewhere? You'll wake up back at ${r?.name || 'where you last rested'}. Your ship stays where you left it.`, ok: 'Go back' }))) return;
        ui.closePanel();
        ui.fade(true);
        setTimeout(() => {
          p.leaveWater?.(game); p.deck?.ship.aboard?.delete(p); p.deck = null;
          p.z = 0; p.vz = 0; p.vx = p.vy = 0; p.kb.x = p.kb.y = 0; p.dash = null; p.action = null;
          game.lives.placeAtRest();
          game.log(`You find your way back to ${r?.name || 'your bed'}.`, '#b0bec5');
          ui.fade(false);
        }, 450);
      }),
      btn('map', game.creative?.on ? 'Creative mode: on — turn off' : 'Creative mode (fly, commands)', async () => {
        const C = game.creative;
        if (!C) return;
        if (!C.on && !(await ui.ask({ title: 'Creative mode?', text: "Fly anywhere (double-tap Space; Space rises, C sinks, Shift goes fast), take no harm, see the whole chart and click it to travel, type commands with / (help lists them) — and open the creative panel (F1, or here) for Devil Fruits, items, races, Haki, foes, ships and the world. Turn it off here any time.", ok: 'Turn it on' }))) return;
        ui.closePanel();
        C.set(!C.on);
      }, game.creative?.on ? '.gold' : ''),
      // (beside it while creative mode is on: the panel with everything to try out)
      game.creative?.on ? btn('star', game.input.touch?.on ? 'Creative panel' : 'Creative panel (F1)', () => { ui.closePanel(); ui.sideAction('creative'); }) : null,
      fullscreenOK() ? btn('fullscreen', fullscreenOn() ? 'Leave full screen' : 'Full screen', () => { ui.closePanel(); toggleFullscreen(); }) : null,
      (c.legends || []).length ? btn('journal', 'Retire as a legend', async () => {
        if (!(await ui.ask({ title: 'Retire?', text: `${c.name} hangs up their hat and becomes a legend. This life ends here and its Inherited Will passes to the next generation.`, ok: 'Retire', danger: true }))) return;
        ui.closePanel(); onRetire();
      }) : null,
      btn('close', 'Save & quit to title', () => { ui.closePanel(); onQuit(); }, '.red'),
    ),
    saved,
    h('p.muted', 'The game also saves by itself every minute, at every milestone, and when you close the page. Death is written immediately.'));
  // (the pause screen: the one menu that stops the world — see pause.js)
  ui.openPanel(body, { id: 'menu', pause: true });
}

const fullscreenOK = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const fullscreenOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFullscreen() {
  try {
    if (fullscreenOn()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    else {
      const el = document.documentElement;
      const r = (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
      if (r && r.catch) r.catch(() => {});
    }
  } catch { /* not allowed here */ }
}

export function openSettings(game) {
  const s = game.settings;
  const body = h('div');
  const slider = (label, key) => {
    // (a function label is re-read as the slider moves)
    const nm = h('span.nm', typeof label === 'function' ? label() : label);
    return h('div.stat-row', nm, h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key] ?? 0.5, style: { flex: 1 }, on: { input: (e) => { s[key] = Number(e.target.value); if (typeof label === 'function') nm.textContent = label(); game.applySettings(); } } }));
  };
  // a slider in whole steps from min to max (its label is re-read as it moves)
  const steps = (label, min, max, get, set) => {
    const nm = h('span.nm', label());
    return h('div.stat-row', nm, h('input', { type: 'range', min, max, step: 1, value: get(), style: { flex: 1 }, on: { input: (e) => { set(Number(e.target.value)); nm.textContent = label(); game.applySettings(); } } }));
  };
  const check = (label, key) => h('label.check-row', h('input', { type: 'checkbox', checked: !!s[key], on: { change: (e) => { s[key] = e.target.checked; game.applySettings(); } } }), label);
  const choice = (label, key, opts) => h('div.set-row', h('span.nm', label), h('div.tabs', { style: { margin: 0 } }, opts.map(([v, name]) => h('button' + (s[key] === v ? '.on' : ''), { on: { click: () => { s[key] = v; if (key === 'quality') s.qualityPicked = true; game.applySettings(); render(); } } }, name))));
  const render = () => {
    clear(body);
    add(body, h('h2', 'Settings'),
      h('h3', 'View'),
      choice('Camera', 'view', [['first', 'First person'], ['third', 'Third person']]),
      slider(game.input.touch?.on ? 'Look sensitivity' : 'Mouse sensitivity', 'sensitivity'),
      check('Invert mouse look', 'invertY'),
      slider(() => `Field of view ${Math.round(60 + (s.fov ?? 0.5) * 35)}°`, 'fov'),
      check('View bobbing while walking', 'bob'),
      choice('Graphics', 'quality', [['high', 'High (shadows)'], ['low', 'Fast']]),
      steps(() => { const n = renderChunks(s); return `Render distance ${n} chunks (${n * 32} m)`; }, RENDER_DIST.min, RENDER_DIST.max, () => renderChunks(s), (n) => { s.renderDist = n; }),
      h('p.muted', 'How far out the world is drawn before the haze closes in. Further looks grander but costs frame rate. At sea you see half as far again.'),
      check('Lower the resolution a little when the game is slow', 'autoRes'),
      h('h3', 'Sound & feel'),
      slider('Sound effects', 'volume'), slider('Music', 'music'), slider('Screen shake', 'shake'),
      check('Show tutorial hints', 'showHints'),
      h('p.muted', 'Press V in game to switch between first and third person. Settings are saved in this browser.'));
  };
  render();
  // (reached from the pause screen, and part of it: the world waits)
  game.ui.openPanel(body, { onClose: () => game.applySettings(true), id: 'settings', pause: true });
}

// =================================================================== shop
export function openShop(game, building, island) {
  const ui = game.ui;
  const c = game.state.char;
  if (bannedFromShop(game, building)) {
    game.dialogue.open(null, { start: 'a', nodes: { a: { speaker: building.name || 'Shopkeeper', text: '"YOU! Thief! Get out of my shop before I call the Marines again!"' } } });
    return null;
  }
  const body = h('div');
  const stock = stockFor(building, island);
  let tab = 'buy';
  const entry = ui.openPanel(body, { wide: true, id: 'shop' });
  const render = () => {
    clear(body);
    add(body, h('h2', building.name || 'Shop'), h('div.shop-top',
      h('div.tabs', h('button' + (tab === 'buy' ? '.on' : ''), { on: { click: () => { tab = 'buy'; render(); } } }, 'Buy'), h('button' + (tab === 'sell' ? '.on' : ''), { on: { click: () => { tab = 'sell'; render(); } } }, 'Sell')),
      berriesLine(c)));
    const list = h('div.list');
    if (tab === 'buy') {
      for (const id of stock) {
        const d = ITEMS[id];
        if (!d) continue;
        const price = priceOf(id, island, c);
        const owned = count(c, id);
        list.appendChild(h('div.row-item', { title: d.desc || '' }, itemImg(id, 34, '.ico'),
          h('div.grow', h('b', d.name), owned ? h('span.tag', `owned ${owned}`) : null, h('div.sub', statLine(d) || d.desc || d.grade || '')),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: c.berries < price, on: { click: () => { if (pay(game, price)) { addItem(game, id, 1); game.audio?.sfx('coin'); render(); } } } }, 'Buy'),
          !d.unique ? h('button.btn.steal', { title: 'Try to pocket it while nobody is looking. Theft puts a bounty on your head — and if you are caught, the guards come running.', on: { click: () => { const r = stealFromShop(game, id, building, price); if (r === 'caught') ui.closePanel(entry); else render(); } } }, 'Steal') : null));
      }
    } else {
      const seen = new Set();
      for (const it of c.inventory) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        const d = ITEMS[it.id];
        const sp = sellPrice(it.id);
        if (!d || !sp || it.heirloom) continue;
        const worn = isEquipped(c, it.id) && count(c, it.id) <= 1;
        list.appendChild(h('div.row-item', itemImg(it.id, 34, '.ico'), h('div.grow', h('b', d.name), h('span.tag', '×' + count(c, it.id)), d.type === 'fruit' ? h('div.sub', 'Devil Fruits fetch a fortune — the black market always pays.') : null),
          h('span.price', formatBerries(sp)),
          h('button.btn', { disabled: worn, on: { click: async () => {
            if (d.type === 'fruit' && !(await ui.ask({ title: `Sell the ${d.name}?`, text: `The ${d.name} will be gone for good. (${formatBerries(sp)})`, ok: 'Sell' }))) return;
            removeItem(game, it.id, 1); earn(game, sp, false); game.audio?.sfx('coin'); render();
          } } }, worn ? 'Equipped' : 'Sell')));
      }
      if (!list.children.length) list.appendChild(h('p', 'Nothing the shopkeeper wants.'));
    }
    body.appendChild(list);
  };
  render();
  return entry;
}

// ========================================================== inn / doctor
export function openInn(game, building, island, town) {
  const S = game.services;
  const price = S.innPrice(island);
  game.ui.openPanel(h('div', h('h2', building.name || 'Inn'),
    h('p', 'A warm bed, a hot meal and a roof over your head. Resting here also makes this town the place you wake up if you fall in battle, and restores your second winds.'),
    h('p', h('b', 'Price: '), formatBerries(price)),
    h('button.btn.gold', { on: { click: () => { if (S.rest(island, town)) game.ui.closePanel(); } } }, 'Rest until morning')), { id: 'inn' });
}

export function openDoctor(game, building, island, doc) {
  const S = game.services;
  const c = game.state.char;
  const p = game.player;
  const body = h('div');
  const entry = game.ui.openPanel(body, { id: 'doctor' });
  const render = () => {
    clear(body);
    add(body, h('h2', doc?.name || building.name || 'Clinic'),
      h('p', doc?.line || 'Let\'s have a look at you.'),
      h('p', `Health ${Math.ceil(p.hp)}/${p.d.maxHp}${Object.keys(p.status).length ? ' · ' + Object.keys(p.status).join(', ') : ''}`),
      h('button.btn.green', { disabled: p.hp >= p.d.maxHp && !Object.keys(p.status).length, on: { click: () => { S.heal(island); render(); } } }, `Treat wounds — ${formatBerries(S.healPrice(island))}`));
    if (doc?.restoresLife) {
      const done = c.flags['lifeRestored_' + doc.id];
      add(body, h('h3', 'Mend a vivre card'),
        h('p', `${doc.name} is one of the few doctors in the world who can pull someone back from the edge. (Restores one lost life, once.)`),
        h('button.btn.gold', { disabled: done || c.lives >= c.maxLives, on: { click: () => { S.restoreLife(doc); render(); } } }, done ? 'Already treated' : c.lives >= c.maxLives ? 'No lives lost' : `Treatment — ${formatBerries(S.lifePrice(doc))}`));
    }
  };
  render();
  return entry;
}

// ============================================================== shipyard
export function openShipyard(game, building, island, dock) {
  const S = game.services;
  const c = game.state.char;
  const body = h('div');
  const entry = game.ui.openPanel(body, { wide: true, id: 'shipyard' });
  if (!entry) return;
  const myShips = () => game.ships.filter((s) => s.owner === 'player' && !s.sunk);
  // (new ships are sold, and launched, by the shipwright on the pier: see game/shipwrights.js)
  const p = game.player;
  const pier = (island?.docks || []).slice().sort((a, b) => game.world.distance(a.end.x, a.end.y, p.x, p.y) - game.world.distance(b.end.x, b.end.y, p.x, p.y))[0] || dock;
  const render = () => {
    clear(body);
    add(body, h('h2', building.name || 'Shipyard'), berriesLine(c));
    // (up on the surface: a zone's yards don't sell ships)
    const sells = !!pier?.end && game.world === game.surface;
    add(body, h('h3', 'Buy a ship'),
      h('p', sells ? 'New ships are sold by the shipwright on the pier, who launches them there, ready to sail — and brings round any ship you own.' : 'New ships are sold by the shipwrights on the piers of the Blue Sea.'),
      sells ? h('button.btn.gold', { on: { click: () => { game.ui.closePanel(entry); openShipwright(game, { dock: pier, island, tab: 'buy' }); } } }, uiImg('ship', 20), 'Browse the ships for sale') : null);
    const ships = myShips();
    if (ships.length) {
      add(body, h('h3', 'Your ships'));
      for (const s of ships) {
        const near = game.world.distance(s.x, s.y, game.player.x, game.player.y) < 60;
        const rp = S.repairPrice(s, island);
        // (a ship that can't break never needs mending: see SHIPS_UNBREAKABLE)
        const hull = s.unbreakable ? 'Hull sound' : `Hull ${Math.ceil(s.hull)}/${s.maxHull}`;
        const card = h('div.card', h('h4', `${s.name} — ${s.def.name}`), h('div', `${hull}${s.shotCap ? ` · cannonballs ${s.shot}/${s.shotCap}` : ''} · upgrades: ${s.upgrades.map((u) => SHIP_UPGRADES[u]?.name).join(', ') || 'none'}${s.coated ? ' · coated' : ''}`));
        if (!near) card.appendChild(h('p.muted', 'Bring this ship to the harbour to work on it.'));
        else {
          if (!s.unbreakable) card.appendChild(h('button.btn.green', { style: { marginRight: '6px' }, disabled: s.hull >= s.maxHull || c.berries < rp, on: { click: () => { S.repair(s, island); render(); } } }, `Repair — ${formatBerries(rp)}`));
          if (s.shotCap) {
            const sp = S.shotPrice(s, island);
            card.appendChild(h('button.btn', { disabled: s.shot >= s.shotCap || c.berries < sp, on: { click: () => { S.restock(s, island); render(); } } }, s.shot >= s.shotCap ? 'Cannonballs: full' : `Cannonballs (${s.shotCap - s.shot}) — ${formatBerries(sp)}`));
          }
          const ups = h('div.list', { style: { marginTop: '6px' } });
          for (const [id, u] of Object.entries(SHIP_UPGRADES)) {
            if (id === 'coating' && !(building.coating || /sabaody/i.test(island?.id || '') || /coat/i.test(building.name || ''))) continue;
            if (id === 'seastone_keel' && !(building.seastone || island?.def?.sea === 'paradise' || island?.def?.sea === 'new_world')) continue;
            const has = s.upgrades.includes(id) || (id === 'coating' && s.coated);
            const up = S.upgradePrice(id, island);
            ups.appendChild(h('div.row-item', h('div.grow', h('b', u.name), h('div.sub', u.desc)), h('span.price', formatBerries(up)),
              h('button.btn', { disabled: has || c.berries < up, on: { click: () => { S.upgrade(s, id, island); render(); } } }, has ? 'Fitted' : 'Fit')));
          }
          card.appendChild(ups);
          card.appendChild(h('button.btn', { style: { marginTop: '6px' }, on: { click: async () => { const n = await game.ui.ask({ title: 'Rename your ship', input: s.name, ok: 'Rename' }); if (n) { s.name = n.slice(0, 24); persist(game); render(); } } } }, 'Rename'));
        }
        body.appendChild(card);
      }
    }
    if (building.adam && c.inventory.some((i) => i.id === 'adam_wood')) {
      add(body, h('h3', 'A dream ship'), h('p', 'You have Adam wood. The shipwrights\' eyes light up.'),
        h('button.btn.red', { on: { click: () => { removeItem(game, 'adam_wood', 1); const s = game.giveShip('adam_brig', dock?.moor?.x ?? game.player.x, dock?.moor?.y ?? game.player.y + 4, 'Thousand Dreams'); game.ui.toast('A LEGENDARY SHIP', `${s.name} — an Adam-wood brig with Coup de Burst!`, '#ffd54f'); persist(game); render(); } } }, 'Build an Adam-wood brig'));
    }
  };
  render();
}

// =============================================================== trainer
export function openTrainer(game, tid, npcName) {
  const S = game.services;
  const t = TRAINERS[tid];
  const c = game.state.char;
  const body = h('div');
  game.ui.openPanel(body, { wide: true, id: 'trainer' });
  let tab = 'styles';
  const render = () => {
    clear(body);
    const tabs = ['styles', 'techniques', 'training'];
    const hakiTypes = Object.keys(t.haki || {});
    if (hakiTypes.length) tabs.push('haki');
    tabs.push('spar');
    add(body, h('h2', npcName || t.name), h('p', h('i', `"${t.lines?.[0] || 'Let\'s see what you\'ve got.'}"`)),
      h('div.shop-top',
        h('div.tabs', ...tabs.map((k) => h('button' + (tab === k ? '.on' : ''), { on: { click: () => { tab = k; render(); } } }, title(k)))),
        berriesLine(c)));
    const list = h('div.list');
    if (tab === 'styles') {
      const styles = Object.keys(t.styles || {});
      if (!styles.length) list.appendChild(h('p', `${t.name} doesn't teach a fighting style — but can train your body.`));
      for (const s of styles) {
        const st = STYLES[s];
        const chk = S.canLearnStyle(tid, s);
        const price = S.stylePrice(tid, s);
        list.appendChild(h('div.row-item', uiImg('skills', 30), h('div.grow', h('b', st.name), h('div.sub', st.desc), chk.warn ? h('div.sub', { style: { color: '#b71c1c' } }, chk.warn) : null),
          h('span.price', price ? formatBerries(price) : 'free'),
          h('button.btn.gold', { disabled: !chk.ok || c.berries < price, on: { click: () => { S.learnStyle(tid, s); render(); } } }, chk.ok ? 'Learn' : chk.why)));
      }
    } else if (tab === 'techniques') {
      for (const id of t.teaches || []) {
        const d = getAbility(id);
        if (!d || (needsHaki(d) && !hakiKnown(c))) continue;
        const chk = S.canLearnTech(id);
        const price = S.techPrice(id);
        list.appendChild(h('div.row-item', skillImg(d, 34, '.ico'),
          h('div.grow', h('b', d.name), h('span.tag', STYLES[d.style]?.name || (d.hakiType ? title(d.hakiType) + ' Haki' : '')), h('div.sub', d.desc || ''), h('div.sub', `Requires: ${d.learn?.mastery ? STYLES[d.style]?.name + ' mastery ' + d.learn.mastery : d.learn?.level ? title(d.hakiType) + ' Haki ' + d.learn.level : '—'}`)),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: !chk.ok || c.berries < price, on: { click: () => { S.learnTech(id); render(); } } }, chk.ok ? 'Learn' : chk.why)));
      }
      if (!list.children.length) list.appendChild(h('p', 'No techniques to teach you yet.'));
    } else if (tab === 'training') {
      list.appendChild(h('p.muted', `A master pushes your body further than fighting alone. Training sessions left today: ${S.trainsLeft()} (rest at an inn to recover). ${t.name} can train you up to the levels shown.`));
      for (const [k, cap] of Object.entries(t.train || {})) {
        const price = S.trainPrice(k);
        const maxed = c.attrs[k] >= cap;
        list.appendChild(h('div.row-item', uiImg('trainer', 30), h('div.grow', h('b', ATTRS[k].name), h('div.sub', `${c.attrs[k]} / ${cap} with this master · ${ATTRS[k].desc}`)),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: maxed || S.trainsLeft() <= 0 || c.berries < price, on: { click: () => { S.train(tid, k); render(); } } }, maxed ? 'Mastered' : 'Train')));
      }
    } else if (tab === 'haki') {
      for (const k of hakiTypes) {
        const cap = t.haki[k];
        const lvl = c.haki[k] || 0;
        if (k === 'conqueror' && !lvl) {
          // (it can't be taught — but a master can tell whether it's in you)
          list.appendChild(h('div.row-item', uiImg('haki', 30), h('div.grow', h('b', HAKI[k].name), h('div.sub', HAKI_HOW.conqueror)),
            h('button.btn', { on: { click: () => { S.hakiSense(tid); render(); } } }, 'Ask them to sense it')));
          continue;
        }
        const price = lvl ? S.hakiTrainPrice(k) : S.hakiTrainPrice(k) * 3;
        list.appendChild(h('div.row-item', uiImg('haki', 30), h('div.grow', h('b', HAKI[k].name), h('div.sub', HAKI[k].desc),
          h('div.sub', lvl ? `Level ${Math.floor(lvl)} / ${cap} with this master` : `Not awakened. ${t.name} can awaken it in you (Willpower ${k === 'armament' ? 18 : 14}) — or: ${HAKI_HOW[k]}`)),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: c.berries < price || (lvl >= cap), on: { click: () => { S.hakiTrain(tid, k); render(); } } }, lvl ? 'Train' : 'Awaken')));
      }
    } else if (tab === 'spar') {
      const chk = S.canSpar(tid);
      list.appendChild(h('p', `A real duel against ${t.spar.name} (level ${t.spar.level}). Nobody dies in a spar. Win to gain mastery and possibly a breakthrough — beating someone stronger than you is how warriors grow. Once per day.`));
      list.appendChild(h('button.btn.red', { disabled: !chk.ok, on: { click: () => { game.ui.closePanel(); S.startSpar(tid); } } }, chk.ok ? 'Begin the spar' : chk.why));
    }
    body.appendChild(list);
  };
  render();
}
