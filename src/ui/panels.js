// Modal panels: inventory, character, skills, journal, menu, shops, trainers,
// inns, doctors, shipyards.
import { h, clear } from './dom.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { STYLES } from '../data/styles.js';
import { FRUITS, FRUIT_RARITY } from '../data/fruits.js';
import { HAKI } from '../data/haki.js';
import { DREAMS } from '../data/dreams.js';
import { RACES, raceLabel } from '../data/races.js';
import { TRAITS, refreshPlayer, persist, perkLevel } from '../game/lineage.js';
import { ATTRS, ATTR_KEYS, ATTR_CAP } from '../game/stats.js';
import { getAbility } from '../game/abilities.js';
import { count, equip, useItem, addItem, removeItem, pay, earn } from '../game/inventory.js';
import { stockFor, priceOf } from '../data/shops.js';
import { SHIPS, SHIP_UPGRADES } from '../data/ships.js';
import { TRAINERS } from '../data/trainers.js';
import { formatBerries } from '../core/math.js';
import { helpContent, wantedPoster } from './screens.js';
import { questDef } from '../game/quests.js';

const berriesLine = (c) => h('div.berries', `${formatBerries(c.berries)}`);

// ------------------------------------------------------------- inventory
export function openInventory(game) {
  const ui = game.ui;
  const c = game.state.char;
  const body = h('div');
  const entry = ui.openPanel(body, { wide: true, id: 'inventory' });
  if (!entry) return;
  const render = () => {
    clear(body);
    const eq = c.equipped;
    const eqRow = (label, id) => {
      const d = ITEMS[id];
      return h('div.row-item', h('span.ico', d ? d.icon : '—'), h('div.grow', h('b', label), h('div.sub', d ? d.name : 'nothing')));
    };
    const weapons = (eq.weapons || []).map((id) => ITEMS[id]?.name).join(' + ') || 'bare hands';
    const left = h('div',
      h('h3', 'Equipped'),
      h('div.list',
        h('div.row-item', h('span.ico', '⚔'), h('div.grow', h('b', 'Weapon'), h('div.sub', weapons))),
        eqRow('Hat', eq.hat), eqRow('Coat', eq.coat)),
      h('p.muted', 'Tip: equip up to three swords for the Two and Three Sword Styles.'),
      h('h3', 'Purse'), berriesLine(c),
      c.fruit ? h('div', h('h3', 'Devil Fruit'), h('p', `${FRUITS[c.fruit].name} — mastery ${Math.floor(c.fruitMastery)}`)) : null,
    );
    const groups = {};
    for (const it of c.inventory) {
      const d = ITEMS[it.id];
      if (!d) continue;
      (groups[d.type] = groups[d.type] || []).push({ it, d });
    }
    const order = ['weapon', 'hat', 'coat', 'food', 'medicine', 'dial', 'fruit', 'key', 'treasure', 'material'];
    const names = { weapon: 'Weapons', hat: 'Hats', coat: 'Coats', food: 'Food', medicine: 'Medicine', dial: 'Dials', fruit: 'Devil Fruits', key: 'Key items', treasure: 'Treasure', material: 'Materials' };
    const right = h('div');
    if (!c.inventory.length) right.appendChild(h('p', 'Your bag is empty.'));
    for (const type of order) {
      if (!groups[type]) continue;
      right.appendChild(h('h3', names[type]));
      const list = h('div.list');
      for (const { it, d } of groups[type]) {
        const isEq = eq.hat === it.id || eq.coat === it.id || (eq.weapons || []).includes(it.id);
        const actions = [];
        if (['weapon', 'hat', 'coat'].includes(d.type)) actions.push(h('button.btn' + (isEq ? '.red' : ''), { on: { click: () => { equip(game, it.id); render(); } } }, isEq ? 'Unequip' : 'Equip'));
        if (d.type === 'food' || d.type === 'medicine') actions.push(h('button.btn.green', { on: { click: () => { useItem(game, it.id); render(); } } }, d.type === 'food' ? 'Eat' : 'Use'));
        if (d.type === 'dial') actions.push(h('button.btn', { on: { click: () => { useItem(game, it.id); render(); } } }, 'Learn'));
        if (d.type === 'fruit') actions.push(h('button.btn.red', { on: { click: () => confirmEat(game, it.id, () => { ui.closePanel(entry); }) } }, 'Eat…'));
        list.appendChild(h('div.row-item', { title: d.desc || '' },
          h('span.ico', d.icon), h('div.grow', h('b', d.name), it.heirloom ? h('span.tag', `heirloom of ${it.from}`) : null, (it.qty || 1) > 1 ? h('span.tag', '×' + it.qty) : null,
            h('div.sub', d.grade ? `${d.grade} · power ×${d.power}` : d.heal ? `+${d.heal} HP` : d.bonus ? Object.entries(d.bonus).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(' ') : (d.desc || '').slice(0, 90))),
          ...actions));
      }
      right.appendChild(list);
    }
    body.appendChild(h('h2', 'Inventory'));
    body.appendChild(h('div.grid2', left, right));
  };
  render();
}

function confirmEat(game, itemId, done) {
  const c = game.state.char;
  const d = ITEMS[itemId];
  const f = FRUITS[d.fruit];
  const body = h('div', { style: { textAlign: 'center' } },
    h('h2', f.name),
    h('p', h('b', `${f.en} · ${f.type}`), ' ', h('span.tag', { style: { background: FRUIT_RARITY[f.rarity]?.color, color: '#222' } }, FRUIT_RARITY[f.rarity]?.label)),
    h('p', f.desc),
    h('p', 'Techniques: ' + f.techniques.map((t) => `${t.name} (${t.mastery})`).join(', ')),
    c.fruit ? h('p', { style: { color: '#b71c1c', fontWeight: 800 } }, `You already ate the ${FRUITS[c.fruit].name}. Eating a second Devil Fruit will tear your body apart and KILL you.`) : h('p', { style: { color: '#b71c1c', fontWeight: 800 } }, 'You will never swim again. The sea will become your grave if you fall in.'),
    h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } },
      h('button.btn.red', { on: { click: () => { game.ui.closePanel(); useItem(game, itemId); done(); } } }, 'Eat it'),
      h('button.btn', { on: { click: () => game.ui.closePanel() } }, 'Not yet')));
  game.ui.openPanel(body);
}

// ------------------------------------------------------------- character
export function openCharacter(game) {
  const ui = game.ui;
  const c = game.state.char;
  const p = game.player;
  const body = h('div');
  const entry = ui.openPanel(body, { wide: true, id: 'character' });
  if (!entry) return;
  const render = () => {
    clear(body);
    const race = RACES[c.race];
    const attrRows = ATTR_KEYS.map((k) => h('div.stat-row', { title: ATTRS[k].desc },
      h('span.nm', ATTRS[k].name), h('span.val', c.attrs[k]),
      h('div.meter', h('i', { style: { width: (100 * c.attrs[k] / ATTR_CAP) + '%' } })),
      c.unspent > 0 && c.attrs[k] < ATTR_CAP ? h('button.btn.gold', { style: { padding: '1px 8px' }, on: { click: () => { c.unspent--; c.attrs[k]++; refreshPlayer(game); persist(game); render(); } } }, '+') : null));
    const hakiRows = Object.entries(HAKI).map(([k, hk]) => h('div.stat-row', { title: hk.desc },
      h('span.nm', `${hk.icon} ${hk.name.replace(' Haki', '')}`), h('span.val', c.haki[k] ? Math.floor(c.haki[k]) : '—'),
      h('div.meter', h('i', { style: { width: (c.haki[k] || 0) + '%', background: 'linear-gradient(90deg,#4a148c,#ce93d8)' } }))));
    const masteryRows = Object.entries(c.masteries).map(([s, m]) => h('div.stat-row',
      h('span.nm', `${STYLES[s]?.icon || ''} ${STYLES[s]?.name || s}`), h('span.val', Math.floor(m)),
      h('div.meter', h('i', { style: { width: m + '%', background: 'linear-gradient(90deg,#1565c0,#90caf9)' } }))));
    const d = p.d;
    const left = h('div',
      h('h2', c.name),
      h('p', `${raceLabel(c.look)} · generation ${c.generation} · ${c.faction === 'marine' ? 'Marine ' + (c.marineRank || '') : c.faction === 'pirate' ? 'Pirate' : 'Wanderer'}`),
      h('p', h('b', 'Dream: '), `${DREAMS[c.dream].icon} ${DREAMS[c.dream].name}${c.dreamDone ? ' — FULFILLED' : ''}`, h('div.muted', DREAMS[c.dream].goal)),
      h('p', h('b', 'Doriki: '), p.power().toLocaleString(), h('span.muted', '  (CP9 scale: an armed Marine ≈ 10, Rob Lucci ≈ 4000)')),
      h('h3', 'Attributes'), c.unspent ? h('p', { style: { color: '#b8860b', fontWeight: 800 } }, `${c.unspent} breakthrough point${c.unspent > 1 ? 's' : ''} to spend!`) : null,
      ...attrRows,
      h('p.muted', `Health ${d.maxHp} · Stamina ${d.maxStamina} · Haki ${d.maxHaki} · Speed ${d.speed.toFixed(1)} · Damage ×${d.dmg.toFixed(2)} · Defence ${Math.round(d.def * 100)}%`),
      h('h3', 'Haki'), ...hakiRows,
      h('h3', 'Style mastery'), ...masteryRows,
      c.fruit ? h('div', h('h3', 'Devil Fruit'), h('div.stat-row', h('span.nm', FRUITS[c.fruit].name), h('span.val', Math.floor(c.fruitMastery)), h('div.meter', h('i', { style: { width: c.fruitMastery + '%', background: 'linear-gradient(90deg,#bf360c,#ffab91)' } })))) : null,
      h('h3', 'Traits'),
      ...race.traits.map((t) => h('div', '• ' + t)),
      ...c.traits.map((t) => h('div', h('b', TRAITS[t]?.name + ': '), TRAITS[t]?.desc)),
    );
    const right = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' } },
      wantedPoster(c),
      h('p.muted', `Lives ${c.lives}/${c.maxLives} · Second winds ${c.getUpCharges || 0} · ${(c.discovered || []).length} islands charted · ${(c.bosses || []).length} great foes defeated · ${c.world?.day || game.env.day} days at sea`),
    );
    body.appendChild(h('div.grid2', left, right));
  };
  render();
}

// ---------------------------------------------------------------- skills
export function openSkills(game) {
  const ui = game.ui;
  const c = game.state.char;
  const p = game.player;
  const body = h('div');
  const entry = ui.openPanel(body, { wide: true, id: 'skills' });
  if (!entry) return;
  let picking = null;
  const render = () => {
    clear(body);
    const styles = Object.keys(c.masteries).filter((s) => STYLES[s]);
    const styleBtns = styles.map((s) => h('button.btn' + (c.style === s ? '.red' : ''), { on: { click: () => { c.style = s; refreshPlayer(game); render(); } }, title: STYLES[s].desc },
      `${STYLES[s].icon} ${STYLES[s].name} (${Math.floor(c.masteries[s])})`));
    const cur = STYLES[c.style];
    const needW = cur?.weapon && !p.hasWeapon(cur.weapon);
    const hot = h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, ...Array.from({ length: 6 }, (_, i) => {
      const d = getAbility(c.hotbar[i]);
      return h('div.card', { style: { width: '120px', cursor: 'pointer', outline: picking === i ? '3px solid #c0392b' : 'none' }, on: { click: () => { picking = i; render(); } } },
        h('b', `${i + 1}. `), d ? `${d.icon || ''} ${d.name}` : h('span.muted', 'empty'));
    }));
    const techs = c.techniques.map(getAbility).filter(Boolean);
    const techList = h('div.list', ...techs.map((d) => h('div.row-item',
      h('span.ico', d.icon || '✦'),
      h('div.grow', h('b', d.name), h('div.sub', `${d.desc || ''} ${d.cd ? '· cooldown ' + d.cd + 's' : ''} ${d.cost?.stamina ? '· ' + d.cost.stamina + ' stamina' : ''} ${d.cost?.haki ? '· ' + d.cost.haki + ' haki' : ''} ${d.weapon ? '· needs ' + d.weapon : ''}`)),
      picking !== null ? h('button.btn.gold', { on: { click: () => { c.hotbar[picking] = d.id; for (let k = 0; k < 6; k++) if (k !== picking && c.hotbar[k] === d.id) c.hotbar[k] = null; picking = null; refreshPlayer(game); render(); } } }, `Put in slot ${picking + 1}`) : null)));
    body.append(
      h('h2', 'Skills'),
      h('h3', 'Fighting style'), h('div.tabs', styleBtns),
      needW ? h('p', { style: { color: '#b71c1c' } }, `${cur.name} needs ${cur.weapon === 'sword' ? cur.swords + ' sword(s)' : 'a ' + cur.weapon} equipped — until then you fight bare-handed.`) : null,
      h('p.muted', cur?.desc || ''),
      h('h3', 'Hotbar'), h('p.muted', 'Click a slot, then choose a technique for it.'), hot,
      picking !== null ? h('button.btn', { on: { click: () => { c.hotbar[picking] = null; picking = null; render(); } } }, 'Clear slot') : null,
      h('h3', 'Known techniques'), techs.length ? techList : h('p', 'You know no techniques yet. Find a trainer — or a Devil Fruit.'),
      h('h3', 'Haki'),
      h('p.muted', 'R toggles Armament, T toggles Observation, G releases Conqueror\'s. They drain your Haki bar while active.'),
    );
  };
  render();
}

// --------------------------------------------------------------- journal
export function openJournal(game) {
  const ui = game.ui;
  const c = game.state.char;
  const q = game.quests;
  const active = q.active();
  const done = Object.entries(c.quests).filter(([, s]) => s.done).map(([id]) => questDef(id)).filter(Boolean);
  const body = h('div',
    h('h2', 'Journal'),
    h('h3', 'Active'),
    active.length ? h('div.list', ...active.map(({ id, s, def }) => h('div.card',
      h('h4', def.name, h('span.tag', def.kind || 'story')),
      h('div', def.summary || ''),
      h('div', { style: { marginTop: '4px', fontWeight: 800 } }, '➤ ' + (def.stages[s.stage]?.desc || '')),
      def.island ? h('div.muted', 'Location: ' + (game.surface.islands.find((i) => i.id === def.island)?.name || def.island)) : null))) : h('p', 'No active quests. Talk to people — every island has a story.'),
    h('h3', 'Completed'),
    done.length ? h('div.list', ...done.map((d) => h('div.row-item', h('span.ico', '✔'), h('div.grow', h('b', d.name))))) : h('p.muted', 'None yet.'),
    h('h3', 'Dream'),
    h('p', `${DREAMS[c.dream].icon} ${DREAMS[c.dream].name} — ${DREAMS[c.dream].goal}`),
  );
  ui.openPanel(body, { id: 'journal' });
}

// ------------------------------------------------------------------ menu
export function openMenu(game, { onQuit, onRetire }) {
  const ui = game.ui;
  const c = game.state.char;
  const body = h('div', { style: { textAlign: 'center' } },
    h('h2', 'Paused'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' } },
      h('button.btn.gold', { on: { click: () => ui.closePanel() } }, 'Resume'),
      h('button.btn', { on: { click: () => { ui.closePanel(); openInventory(game); } } }, 'Inventory (I)'),
      h('button.btn', { on: { click: () => { ui.closePanel(); openCharacter(game); } } }, 'Character (C)'),
      h('button.btn', { on: { click: () => { ui.closePanel(); openSkills(game); } } }, 'Skills (K)'),
      h('button.btn', { on: { click: () => { ui.closePanel(); openJournal(game); } } }, 'Journal (J)'),
      h('button.btn', { on: { click: () => { ui.closePanel(); game.openMap(); } } }, 'World Map (M)'),
      h('button.btn', { on: { click: () => { ui.closePanel(); ui.openPanel(helpContent(), { wide: true }); } } }, 'How to Play (H)'),
      h('button.btn', { on: { click: () => { ui.closePanel(); openSettings(game); } } }, 'Settings'),
      c.dreamDone ? h('button.btn.gold', { on: { click: () => { ui.closePanel(); onRetire(); } } }, 'Retire as a legend') : null,
      h('button.btn.red', { on: { click: () => { ui.closePanel(); onQuit(); } } }, 'Save & return to title'),
    ),
    h('p.muted', { style: { marginTop: '10px' } }, 'The game saves automatically. Death is permanent once your last vivre card burns.'));
  ui.openPanel(body);
}

export function openSettings(game) {
  const s = game.settings;
  const slider = (label, key) => h('div.stat-row', h('span.nm', label), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], style: { flex: 1 }, on: { input: (e) => { s[key] = Number(e.target.value); game.applySettings(); } } }));
  game.ui.openPanel(h('div', h('h2', 'Settings'),
    slider('Sound effects', 'volume'), slider('Music', 'music'), slider('Screen shake', 'shake'),
    h('p.muted', 'Settings are saved in this browser.')), { onClose: () => game.applySettings(true) });
}

// ------------------------------------------------------------------ shop
export function openShop(game, building, island) {
  const ui = game.ui;
  const c = game.state.char;
  const body = h('div');
  const stock = stockFor(building, island);
  let tab = 'buy';
  const entry = ui.openPanel(body, { wide: true });
  const render = () => {
    clear(body);
    body.append(h('h2', building.name || 'Shop'), h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('div.tabs', h('button' + (tab === 'buy' ? '.on' : ''), { on: { click: () => { tab = 'buy'; render(); } } }, 'Buy'), h('button' + (tab === 'sell' ? '.on' : ''), { on: { click: () => { tab = 'sell'; render(); } } }, 'Sell')),
      berriesLine(c)));
    const list = h('div.list');
    if (tab === 'buy') {
      for (const id of stock) {
        const d = ITEMS[id];
        if (!d) continue;
        const price = priceOf(id, island, c);
        const owned = count(c, id);
        list.appendChild(h('div.row-item', { title: d.desc || '' }, h('span.ico', d.icon),
          h('div.grow', h('b', d.name), owned ? h('span.tag', `owned ${owned}`) : null, h('div.sub', d.desc || d.grade || (d.heal ? `+${d.heal} HP` : ''))),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: c.berries < price, on: { click: () => { if (pay(game, price)) { addItem(game, id, 1); game.audio?.sfx('coin'); render(); } } } }, 'Buy')));
      }
    } else {
      const seen = new Set();
      for (const it of c.inventory) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        const d = ITEMS[it.id];
        const sp = sellPrice(it.id);
        if (!d || !sp || it.heirloom) continue;
        const isEq = c.equipped.hat === it.id || c.equipped.coat === it.id || (c.equipped.weapons || []).includes(it.id);
        list.appendChild(h('div.row-item', h('span.ico', d.icon), h('div.grow', h('b', d.name), h('span.tag', '×' + count(c, it.id))),
          h('span.price', formatBerries(sp)),
          h('button.btn', { disabled: isEq, on: { click: () => { removeItem(game, it.id, 1); earn(game, sp, false); game.audio?.sfx('coin'); render(); } } }, isEq ? 'Equipped' : 'Sell')));
      }
      if (!list.children.length) list.appendChild(h('p', 'Nothing the shopkeeper wants.'));
    }
    body.appendChild(list);
  };
  render();
  return entry;
}

// ------------------------------------------------------------ inn / doctor
export function openInn(game, building, island, town) {
  const S = game.services;
  const price = S.innPrice(island);
  game.ui.openPanel(h('div', h('h2', building.name || 'Inn'),
    h('p', 'A warm bed, a hot meal and a roof over your head. Resting here also makes this town the place you wake up if you fall in battle, and restores your second winds.'),
    h('p', h('b', 'Price: '), formatBerries(price)),
    h('button.btn.gold', { on: { click: () => { if (S.rest(island, town)) game.ui.closePanel(); } } }, 'Rest until morning')));
}

export function openDoctor(game, building, island, doc) {
  const S = game.services;
  const c = game.state.char;
  const p = game.player;
  const body = h('div');
  const entry = game.ui.openPanel(body);
  const render = () => {
    clear(body);
    body.append(h('h2', doc?.name || building.name || 'Clinic'),
      h('p', doc?.line || 'Let\'s have a look at you.'),
      h('p', `Health ${Math.ceil(p.hp)}/${p.d.maxHp}${Object.keys(p.status).length ? ' · ' + Object.keys(p.status).join(', ') : ''}`),
      h('button.btn.green', { disabled: p.hp >= p.d.maxHp && !Object.keys(p.status).length, on: { click: () => { S.heal(island); render(); } } }, `Treat wounds — ${formatBerries(S.healPrice(island))}`));
    if (doc?.restoresLife) {
      const done = c.flags['lifeRestored_' + doc.id];
      body.append(h('h3', 'Mend a vivre card'),
        h('p', `${doc.name} is one of the few doctors in the world who can pull someone back from the edge. (Restores one lost life, once.)`),
        h('button.btn.gold', { disabled: done || c.lives >= c.maxLives, on: { click: () => { S.restoreLife(doc); render(); } } }, done ? 'Already treated' : c.lives >= c.maxLives ? 'No lives lost' : `Treatment — ${formatBerries(S.lifePrice(doc))}`));
    }
  };
  render();
  return entry;
}

// -------------------------------------------------------------- shipyard
export function openShipyard(game, building, island, dock) {
  const S = game.services;
  const c = game.state.char;
  const body = h('div');
  game.ui.openPanel(body, { wide: true });
  const myShips = () => game.ships.filter((s) => s.owner === 'player' && !s.sunk);
  const render = () => {
    clear(body);
    body.append(h('h2', building.name || 'Shipyard'), berriesLine(c));
    body.append(h('h3', 'Buy a ship'));
    const list = h('div.list');
    for (const type of S.shipsFor(island)) {
      const d = SHIPS[type];
      const price = S.shipPrice(type, island);
      list.appendChild(h('div.row-item', h('span.ico', '⛵'),
        h('div.grow', h('b', d.name), h('div.sub', `${d.desc} · hull ${d.hull} · speed ${d.speed} · cannons ${d.cannons}${d.grandLine ? '' : ' · NOT fit for the Grand Line'}`)),
        h('span.price', formatBerries(price)),
        h('button.btn.gold', { disabled: c.berries < price, on: { click: () => { const n = prompt('Name your ship:', d.name) || d.name; S.buyShip(type, island, dock, n.slice(0, 24)); render(); } } }, 'Buy')));
    }
    body.appendChild(list);
    const ships = myShips();
    if (ships.length) {
      body.append(h('h3', 'Your ships'));
      for (const s of ships) {
        const near = game.world.distance(s.x, s.y, game.player.x, game.player.y) < 60;
        const rp = S.repairPrice(s, island);
        const card = h('div.card', h('h4', `${s.name} — ${s.def.name}`), h('div', `Hull ${Math.ceil(s.hull)}/${s.maxHull} · upgrades: ${s.upgrades.map((u) => SHIP_UPGRADES[u]?.name).join(', ') || 'none'}${s.coated ? ' · coated' : ''}`));
        if (!near) card.appendChild(h('p.muted', 'Bring this ship to the harbour to work on it.'));
        else {
          card.appendChild(h('button.btn.green', { disabled: s.hull >= s.maxHull || c.berries < rp, on: { click: () => { S.repair(s, island); render(); } } }, `Repair — ${formatBerries(rp)}`));
          const ups = h('div.list', { style: { marginTop: '6px' } });
          for (const [id, u] of Object.entries(SHIP_UPGRADES)) {
            if (id === 'coating' && !(building.coating || island?.id === 'sabaody')) continue;
            if (id === 'seastone_keel' && !(building.seastone || island?.def?.sea === 'paradise' || island?.def?.sea === 'new_world')) continue;
            const has = s.upgrades.includes(id) || (id === 'coating' && s.coated);
            const up = S.upgradePrice(id, island);
            ups.appendChild(h('div.row-item', h('div.grow', h('b', u.name), h('div.sub', u.desc)), h('span.price', formatBerries(up)),
              h('button.btn', { disabled: has || c.berries < up, on: { click: () => { S.upgrade(s, id, island); render(); } } }, has ? 'Fitted' : 'Fit')));
          }
          card.appendChild(ups);
          card.appendChild(h('button.btn', { style: { marginTop: '6px' }, on: { click: () => { const n = prompt('Rename your ship:', s.name); if (n) { s.name = n.slice(0, 24); persist(game); render(); } } } }, 'Rename'));
        }
        body.appendChild(card);
      }
    }
    if (building.adam && c.inventory.some((i) => i.id === 'adam_wood')) {
      body.append(h('h3', 'A dream ship'), h('p', 'You have Adam wood. The shipwrights\' eyes light up.'),
        h('button.btn.red', { on: { click: () => { removeItem(game, 'adam_wood', 1); const s = game.giveShip('adam_brig', dock?.moor?.x ?? game.player.x, dock?.moor?.y ?? game.player.y + 4, 'Thousand Dreams'); game.ui.toast('A LEGENDARY SHIP', `${s.name} — an Adam-wood brig with Coup de Burst!`, '#ffd54f'); persist(game); render(); } } }, 'Build an Adam-wood brig'));
    }
  };
  render();
}

// --------------------------------------------------------------- trainer
export function openTrainer(game, tid, npcName) {
  const S = game.services;
  const t = TRAINERS[tid];
  const c = game.state.char;
  const body = h('div');
  game.ui.openPanel(body, { wide: true });
  let tab = 'styles';
  const render = () => {
    clear(body);
    const tabs = ['styles', 'techniques', 'training'];
    if (t.haki) tabs.push('haki');
    tabs.push('spar');
    body.append(h('h2', npcName || t.name), h('p', h('i', `"${t.lines?.[0] || 'Let\'s see what you\'ve got.'}"`)),
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('div.tabs', ...tabs.map((k) => h('button' + (tab === k ? '.on' : ''), { on: { click: () => { tab = k; render(); } } }, k[0].toUpperCase() + k.slice(1)))),
        berriesLine(c)));
    const list = h('div.list');
    if (tab === 'styles') {
      const styles = Object.keys(t.styles || {});
      if (!styles.length) list.appendChild(h('p', `${t.name} doesn't teach a fighting style — but can train your body.`));
      for (const s of styles) {
        const st = STYLES[s];
        const chk = S.canLearnStyle(tid, s);
        const price = S.stylePrice(tid, s);
        list.appendChild(h('div.row-item', h('span.ico', st.icon), h('div.grow', h('b', st.name), h('div.sub', st.desc), chk.warn ? h('div.sub', { style: { color: '#b71c1c' } }, chk.warn) : null),
          h('span.price', price ? formatBerries(price) : 'free'),
          h('button.btn.gold', { disabled: !chk.ok || c.berries < price, on: { click: () => { S.learnStyle(tid, s); render(); } } }, chk.ok ? 'Learn' : chk.why)));
      }
    } else if (tab === 'techniques') {
      for (const id of t.teaches || []) {
        const d = getAbility(id);
        if (!d) continue;
        const chk = S.canLearnTech(id);
        const price = S.techPrice(id);
        list.appendChild(h('div.row-item', h('span.ico', d.icon || '✦'),
          h('div.grow', h('b', d.name), h('span.tag', STYLES[d.style]?.name || (d.hakiType ? d.hakiType + ' haki' : '')), h('div.sub', d.desc || ''), h('div.sub', `Requires: ${d.learn?.mastery ? STYLES[d.style]?.name + ' mastery ' + d.learn.mastery : d.learn?.level ? d.hakiType + ' Haki ' + d.learn.level : '—'}`)),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: !chk.ok || c.berries < price, on: { click: () => { S.learnTech(id); render(); } } }, chk.ok ? 'Learn' : chk.why)));
      }
      if (!list.children.length) list.appendChild(h('p', 'No techniques to teach.'));
    } else if (tab === 'training') {
      list.appendChild(h('p.muted', `Training sessions left today: ${S.trainsLeft()} (rest at an inn to recover). ${t.name} can train you up to the levels shown.`));
      for (const [k, cap] of Object.entries(t.train || {})) {
        const price = S.trainPrice(k);
        const maxed = c.attrs[k] >= cap;
        list.appendChild(h('div.row-item', h('span.ico', '🏋'), h('div.grow', h('b', ATTRS[k].name), h('div.sub', `${c.attrs[k]} / ${cap} with this master · ${ATTRS[k].desc}`)),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: maxed || S.trainsLeft() <= 0 || c.berries < price, on: { click: () => { S.train(tid, k); render(); } } }, maxed ? 'Mastered' : 'Train +1')));
      }
    } else if (tab === 'haki') {
      for (const [k, cap] of Object.entries(t.haki)) {
        const lvl = c.haki[k] || 0;
        const price = S.hakiTrainPrice(k) * (lvl ? 1 : 3);
        list.appendChild(h('div.row-item', h('span.ico', HAKI[k].icon), h('div.grow', h('b', HAKI[k].name), h('div.sub', HAKI[k].desc), h('div.sub', lvl ? `Level ${Math.floor(lvl)} / ${cap} with this master` : 'Not awakened')),
          h('span.price', formatBerries(price)),
          h('button.btn.gold', { disabled: c.berries < price || (lvl >= cap), on: { click: () => { S.hakiTrain(tid, k); render(); } } }, lvl ? 'Train' : 'Awaken')));
      }
    } else if (tab === 'spar') {
      const chk = S.canSpar(tid);
      list.appendChild(h('p', `A real duel against ${t.spar.name} (level ${t.spar.level}). Nobody dies in a spar. Win to gain mastery, an attribute point and possibly a breakthrough — beating someone stronger than you is how warriors grow. Once per day.`));
      list.appendChild(h('button.btn.red', { disabled: !chk.ok, on: { click: () => { game.ui.closePanel(); S.startSpar(tid); } } }, chk.ok ? 'Begin the spar' : chk.why));
    }
    body.appendChild(list);
  };
  render();
  void perkLevel; void questDef;
}
