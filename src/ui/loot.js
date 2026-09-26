// The "search the body" panel: what a knocked-out foe was carrying, one Take
// button per thing and a Take all.
import { h, clear, add } from './dom.js';
import { ITEMS } from '../data/items.js';
import { itemImg, uiImg } from './icon.js';
import { formatBerries } from '../core/math.js';

export function openLoot(game, a, { take }) {
  const ui = game.ui;
  const body = h('div.loot');
  const entry = ui.openPanel(body, { id: 'loot' });
  const render = () => {
    clear(body);
    const pk = a.pocket || { berries: 0, items: [] };
    add(body, h('h2', `Searching ${a.name}`), h('p.muted', a.faction === 'beast' ? 'Good eating, at least.' : 'Out cold. You go through their pockets…'));
    const list = h('div.list');
    if (pk.berries) {
      list.appendChild(h('div.row-item', uiImg('berries', 30, '.ico'), h('div.grow', h('b', 'Berries'), h('div.sub', 'A purse of coins')),
        h('span.price', formatBerries(pk.berries)),
        h('button.btn.gold', { on: { click: () => { take('berries'); after(); } } }, 'Take')));
    }
    for (const it of pk.items) {
      const d = ITEMS[it.id];
      if (!d) continue;
      list.appendChild(h('div.row-item', { title: d.desc || '' }, itemImg(it.id, 34, '.ico'),
        h('div.grow', h('b', d.name), it.qty > 1 ? h('span.tag', '×' + it.qty) : null, h('div.sub', d.desc || d.type || '')),
        h('button.btn', { on: { click: () => { take(it.id); after(); } } }, 'Take')));
    }
    const any = pk.berries || pk.items.length;
    if (!any) list.appendChild(h('p', 'Nothing left worth taking.'));
    add(body, list);
    if (any) add(body, h('div.row-end', h('button.btn.gold', { on: { click: () => { take('all'); after(); } } }, 'Take all')));
  };
  const after = () => {
    const pk = a.pocket;
    if (!pk || (!pk.berries && !pk.items.length)) { if (entry) ui.closePanel(entry); return; }
    render();
  };
  render();
  return entry;
}
