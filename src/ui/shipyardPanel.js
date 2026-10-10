// The Shipyard (a section of the menu, Tab): every ship you own — choose the
// one you sail (the ship button in the middle of the hotbar calls her up and
// sets her sails: game/shipcall.js), and fit her out: her name, her paint,
// her sails and her figurehead. Buying ships is still the shipwrights' (on
// any pier).
import { h, clear, add } from './dom.js';
import { uiImg } from './icon.js';
import { SHIPS, shipStats, shipClassLine } from '../data/ships.js';
import { fleetOf, liveShip, aboard } from '../game/fleet.js';
import { persist } from '../game/lineage.js';
import { openShipDesigner, paintable } from './shipDesigner.js';
import { shipStatLine } from './shipwrightPanel.js';
import { chosenShip } from '../game/shipcall.js';

const distText = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`);

export function openShipyard(game) {
  const ui = game.ui, c = game.state.char;
  const body = h('div.shipyard');
  const entry = ui.openPanel(body, { wide: true, id: 'shipyard' });
  if (!entry) return null;

  const where = (e) => {
    const s = liveShip(game, e.uid), p = game.player;
    if (!s) return 'In the yards';
    if (aboard(p, s)) return 'You\'re aboard her';
    return `Afloat · ${distText(game.world.distance(p.x, p.y, s.x, s.y))} away`;
  };

  const choose = (e) => {
    c.activeShip = e.uid;
    persist(game);
    game.audio?.sfx('ui_click');
    render();
  };

  const fitOut = async (e) => {
    const got = await openShipDesigner(game, e.type, { name: e.name, paint: e.paint, title: `Fit out the ${e.name}`, ok: 'Done' });
    if (!got || !entry.el.isConnected) return;
    e.paint = got.paint; e.name = got.name;
    const s = liveShip(game, e.uid);
    if (s) { s.paint = got.paint; s.name = got.name; }
    persist(game);
    render();
  };

  const render = () => {
    clear(body);
    const fleet = fleetOf(c), cur = chosenShip(c);
    add(body, h('div.panel-top', h('h2', 'Shipyard')),
      h('p.muted', 'The ship you choose is the one the ship button (the round one in the middle of your hotbar) calls up onto the water in front of you — press it again to set her sails, and again to take them in. New ships are sold by the shipwright on any pier.'));
    const list = h('div.list');
    for (const e of fleet) {
      if (!SHIPS[e.type]) continue;
      const d = shipStats(e.type, e.upgrades), on = cur === e;
      list.appendChild(h('div.row-item' + (on ? '.here' : ''), uiImg('ship', 34, '.ico'),
        h('div.grow', h('b', e.name), h('span.tag', d.name), on ? h('span.tag.gold', 'Sailing') : null,
          h('div.sub', where(e)), h('div.sub', shipClassLine(d)), h('div.sub', shipStatLine(d))),
        paintable(SHIPS[e.type]) ? h('button.btn', { title: 'Her name, paint, sails and figurehead', on: { click: () => fitOut(e) } }, 'Customise') : null,
        h('button.btn.gold', { disabled: on, on: { click: () => choose(e) } }, on ? 'Chosen' : 'Sail this one')));
    }
    if (!fleet.length) list.appendChild(h('p', 'You don\'t own a ship yet. The shipwright on any pier sells them.'));
    add(body, list);
  };
  render();
  return entry;
}
