// The shipwright's menus (see game/shipwrights.js), one panel with two tabs:
//   Spawn ship — every ship you own, where she lies, and a button to have her
//                brought round to this pier;
//   Buy ships  — what this yard builds, with her size, hull, speed, guns and
//                shot, crew, hold and price (greyed out when you can't pay).
import { h, clear, add } from './dom.js';
import { uiImg } from './icon.js';
import { SHIPS, SHIPS_UNBREAKABLE, shipStats, shipClassLine, shotCapFor } from '../data/ships.js';
import { fleetOf, liveShip, dockOf, aboard, launchShip } from '../game/fleet.js';
import { pay } from '../game/inventory.js';
import { persist } from '../game/lineage.js';
import { formatBerries } from '../core/math.js';
import { openShipDesigner, paintable } from './shipDesigner.js';

// (what the yard asks to repaint one of your ships and give her a new name)
const REPAINT = 5000;

const THANKS = ['She\'s all yours!', 'Fair winds!', 'Treat her kindly, now.', 'Mind the paint!'];

/** "the Foosha Village pier", "the Back Street Pier". */
export function pierName(dock, island) {
  const n = dock?.name || island?.name || 'harbour';
  return /\b(pier|dock|docks|wharf|quay|harbou?r|port|shipyards?)\b/i.test(n) ? `the ${n}` : `the ${n} pier`;
}

const distText = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Hull, speed, guns and shot, crew and hold of a ship class (fitted out: see shipStats). */
export function shipStatLine(d) {
  const hull = d.maxHull ?? d.hull;
  const guns = d.cannons ? `${d.cannons} cannons · ${shotCapFor(d.cannons)} shot` : 'no guns';
  return `Hull ${hull} · speed ${+d.speed.toFixed(1)}${d.oarsOnly ? ' (oars)' : ''} · ${guns} · crew ${d.crew} · hold ${d.cargo}`;
}

/**
 * Open the shipwright's menus for a pier. tab: 'spawn' (your ships) or 'buy'
 * (ships for sale). npc: the shipwright (who says a word when it's done).
 */
export function openShipwright(game, { dock, island, npc = null, tab = 'spawn' }) {
  const ui = game.ui, c = game.state.char, S = game.services, w = game.world;
  const body = h('div.shipwright');
  const entry = ui.openPanel(body, { wide: true, id: 'shipwright' });
  if (!entry) return null;
  let mode = tab;
  const say = (text) => { if (npc?.alive) game.fx.text(npc.x, npc.y - 2.2, text, '#ffffff', 0.34, { life: 2.6 }); };

  /** Where one of your ships lies, and whether she can be brought round. */
  const status = (e) => {
    const s = liveShip(game, e.uid), p = game.player;
    if (!s) return { text: e.from ? `Waiting in the yards — from ${e.from}` : 'Laid up in the yards', can: true };
    if (aboard(p, s)) return { text: 'You\'re aboard her', btn: 'Aboard' };
    const dk = dockOf(w, s);
    if (dk === dock) return { text: 'Moored here, at this pier', btn: 'Here', here: true };
    const far = distText(w.distance(s.x, s.y, dock.end.x + 0.5, dock.end.y + 0.5));
    const isl = w.islandAt(s.x, s.y) || w.nearestIsland(s.x, s.y, 150);
    if (dk) return { text: `Moored at ${pierName(dk, isl)}${isl?.name && isl.name !== dk.name ? ', ' + isl.name : ''} · ${far} away`, can: true };
    return { text: `${isl?.name ? 'At anchor off ' + isl.name : 'Out at sea'} · ${far} away`, can: true };
  };

  /** Close up, say so, and save. */
  const finish = (r, head, msg) => {
    ui.closePanel(entry);
    const s = r.ship;
    ui.toast(head, `${s.name} (${s.def.name}) — at ${pierName(dock, island)}`, '#ffe082');
    game.log(msg, '#ffe082');
    if (r.laidUp?.length) game.log(`The ${r.laidUp.join(' and the ')} ${r.laidUp.length > 1 ? 'are' : 'is'} warped into the yard to make room — any shipwright can bring ${r.laidUp.length > 1 ? 'them' : 'her'} round again.`, '#b0bec5');
    say(THANKS[Math.floor(Math.random() * THANKS.length)]);
    persist(game);
  };

  const bring = (e) => {
    const r = launchShip(game, e, dock);
    if (r.why === 'aboard') { say('You\'re standing on her! Step onto the pier first.'); render(); return; }
    if (r.why === 'here') { say('She\'s right here, alongside!'); render(); return; }
    game.audio?.sfx('splash');
    finish(r, 'SHIP READY', `The ${r.ship.name} is brought round and made fast alongside ${pierName(dock, island)}: step aboard, and press E at her ${r.ship.def.oarsOnly ? 'oars' : 'wheel'} to take her out.`);
  };

  const buy = async (type, price) => {
    const d = SHIPS[type];
    // (fit her out first: her name, her paint, her sails, her figurehead — as a body is made in the creator)
    let name, paint = null;
    if (paintable(d)) {
      const got = await openShipDesigner(game, type, { name: d.name, ok: `Buy her (${formatBerries(price)})` });
      if (!got || !entry.el.isConnected) return;
      name = got.name; paint = got.paint;
    } else {
      name = await ui.ask({ title: `Buy a ${d.name}`, text: `Name your new ship (${formatBerries(price)}).`, input: d.name, ok: 'Buy' });
      if (name === null || !entry.el.isConnected) return;
    }
    if (!pay(game, price)) { game.log('Not enough berries.', '#ff8a80'); render(); return; }
    const r = launchShip(game, { type, name: name.slice(0, 24) || d.name, paint }, dock);
    game.emit('shipBought', type);
    game.audio?.sfx('coin');
    finish(r, 'NEW SHIP', `Your new ${d.name}, the ${r.ship.name}, is launched and made fast alongside ${pierName(dock, island)}: step aboard, and press E at her ${d.oarsOnly ? 'oars' : 'wheel'} to take her out.`);
  };

  /** Repaint one of your ships (and rename her): wherever she lies, the yard's painters see to it. */
  const repaint = async (e) => {
    if (c.berries < REPAINT) { say(`A fresh coat's ${formatBerries(REPAINT)} — come back when you've got it.`); return; }
    const got = await openShipDesigner(game, e.type, { name: e.name, paint: e.paint, title: `Repaint the ${e.name}`, ok: `Repaint her (${formatBerries(REPAINT)})` });
    if (!got || !entry.el.isConnected) return;
    if (!pay(game, REPAINT)) return;
    e.paint = got.paint; e.name = got.name;
    const s = liveShip(game, e.uid);
    if (s) { s.paint = got.paint; s.name = got.name; }
    game.audio?.sfx('coin');
    ui.toast('A FRESH COAT', `The ${got.name} is repainted`, '#ffe082');
    persist(game);
    render();
  };

  const yourShips = () => {
    const list = h('div.list');
    const fleet = fleetOf(c);
    for (const e of fleet) {
      const d = shipStats(e.type, e.upgrades), st = status(e);
      list.appendChild(h('div.row-item' + (st.here ? '.here' : ''), uiImg('ship', 34, '.ico'),
        h('div.grow', h('b', e.name), h('span.tag', d.name), h('div.sub', st.text), h('div.sub', shipStatLine(d))),
        paintable(SHIPS[e.type]) ? h('button.btn', { title: `New paint, sails and figurehead, and a new name if you like (${formatBerries(REPAINT)})`, on: { click: () => repaint(e) } }, 'Repaint') : null,
        h('button.btn.gold', { disabled: !st.can, on: { click: () => bring(e) } }, st.can ? 'Bring her here' : st.btn)));
    }
    if (!fleet.length) list.appendChild(h('p', 'You don\'t own a ship. ', h('button.btn.small', { on: { click: () => { mode = 'buy'; render(); } } }, 'Buy ships')));
    return h('div', list, h('p.muted', 'Bringing a ship round takes her from wherever she lies (there\'s only ever one of each afloat). Anything of yours already at this pier goes into the yard to make room.'));
  };

  const forSale = () => {
    const list = h('div.list');
    const fleet = fleetOf(c);
    for (const type of S.shipsFor(island)) {
      const d = SHIPS[type], price = S.shipPrice(type, island), can = c.berries >= price;
      const owned = fleet.filter((e) => e.type === type).length;
      list.appendChild(h('div.row-item' + (can ? '' : '.cant'), uiImg('ship', 34, '.ico'),
        h('div.grow', h('b', d.name), h('span.tag', shipClassLine(d)), owned ? h('span.tag', `you own ${owned}`) : null,
          h('div.sub', shipStatLine(d)), h('div.sub', d.desc), d.grandLine ? null : h('div.sub.warn', 'Not fit for the Grand Line')),
        h('span.price' + (can ? '' : '.short'), formatBerries(price)),
        h('button.btn.gold', { disabled: !can, title: can ? '' : `${formatBerries(price - c.berries)} short`, on: { click: () => buy(type, price) } }, can ? 'Buy' : 'Can\'t afford')));
    }
    const blue = !['paradise', 'new_world'].includes(island?.def?.sea);
    return h('div', list, h('p.muted', `${blue ? 'The big ships are built in the Grand Line\'s yards. ' : ''}A new ship is launched here, at this pier, ready to sail${SHIPS_UNBREAKABLE ? ' — and yours can\'t break' : ''}.`));
  };

  const tabBtn = (k, label) => h('button' + (mode === k ? '.on' : ''), { on: { click: () => { mode = k; render(); } } }, label);
  const render = () => {
    clear(body);
    add(body,
      h('div.sw-head', uiImg('shipwright', 44), h('div', h('h2', npc?.name || 'Shipwright'), h('div.muted', `${cap(pierName(dock, island))}${island?.name && dock.name !== island.name ? ', ' + island.name : ''}`))),
      h('div.shop-top', h('div.tabs', tabBtn('spawn', 'Spawn ship'), tabBtn('buy', 'Buy ships')), h('div.berries', uiImg('berries', 20), ` ${formatBerries(c.berries)}`)),
      mode === 'spawn' ? yourShips() : forSale());
  };
  render();
  return entry;
}
