// Crew menu: found your own pirate crew (name + Jolly Roger), the roster of
// companions ("nakama"), and — for Marines — the fleet under your command.
import { h, clear, add } from './dom.js';
import { CREW_ROLES } from '../game/crew.js';
import { drawJollyRoger, drawMarineEmblem } from '../render/ship.js';
import { persist } from '../game/lineage.js';
import { uiImg } from './icon.js';

const JR_OPTS = {
  skull: [['classic', 'Classic'], ['grin', 'Grinning'], ['eyepatch', 'Scarred']],
  bones: [['cross', 'Crossbones'], ['swords', 'Crossed swords'], ['anchor', 'Anchor']],
  accessory: [['none', 'None'], ['strawhat', 'Straw hat'], ['bandana', 'Bandana'], ['tricorne', 'Tricorne'], ['horns', 'Horns'], ['crown', 'Crown'], ['flames', 'Flames'], ['halo', 'Halo']],
  color: [['#f5f6fa', 'White'], ['#efe2c4', 'Bone'], ['#e53935', 'Red'], ['#f1c40f', 'Gold'], ['#64b5f6', 'Sky']],
};

/** A canvas showing a flag (Jolly Roger, or the Marine emblem). */
export function flagCanvas(jr, w = 180, hgt = 130, marine = false) {
  const cv = h('canvas.flag', { width: w * 2, height: hgt * 2, style: { width: w + 'px', height: hgt + 'px' } });
  const g = cv.getContext('2d');
  g.fillStyle = marine ? '#f5f6fa' : '#111';
  g.fillRect(0, 0, w * 2, hgt * 2);
  g.setTransform(hgt * 1.7, 0, 0, hgt * 1.7, w, hgt * 1.08);
  if (marine) drawMarineEmblem(g, 1); else drawJollyRoger(g, jr || {}, 1, '#111');
  return cv;
}

function designer(state, onChange) {
  const row = (label, key) => h('div.opt-row', h('div.opt-label', label),
    h('div.swatches', JR_OPTS[key].map(([v, name]) => key === 'color'
      ? h('button' + (state.jr[key] === v ? '.on' : ''), { title: name, style: { background: v }, on: { click: () => { state.jr[key] = v; onChange(); } } })
      : h('button.chip' + (state.jr[key] === v ? '.on' : ''), { on: { click: () => { state.jr[key] = v; onChange(); } } }, name))));
  return h('div.jr-designer', flagCanvas(state.jr, 220, 150),
    h('div', row('Skull', 'skull'), row('Behind it', 'bones'), row('On its head', 'accessory'), row('Colour', 'color')));
}

/** Apply the flag to every ship you own. */
function hoist(game) {
  const c = game.state.char;
  for (const s of game.ships) if (s.owner === 'player') s.jr = c.jr;
}

export function openCrew(game) {
  const body = h('div.crew');
  const entry = game.ui.openPanel(body, { wide: true, id: 'crew' });
  if (!entry) return;
  const c = game.state.char;
  const found = { name: '', jr: { skull: 'classic', bones: 'cross', accessory: 'none', color: '#f5f6fa' } };
  const render = () => {
    clear(body);
    if (c.faction === 'marine') {
      add(body, h('div.crew-head', flagCanvas(null, 120, 86, true), h('div',
        h('h2', `${c.marineRank} ${c.name}`),
        h('p', 'You sail under the flag of the World Government. Marines cannot found a pirate crew — resign first if the sea calls you another way.'),
        fleetInfo(game))));
    } else if (!c.crewName) {
      if (!found.name) found.name = `${c.name.split(' ')[0]} Pirates`;
      const input = h('input.name', { value: found.name, maxLength: 28, spellcheck: false, on: { input: (e) => { found.name = e.target.value; } } });
      add(body, h('h2', 'Crew'),
        h('div.card.found',
          h('h3', 'Found a pirate crew'),
          h('p', 'Every great pirate started with a name and a flag. Choose your crew\'s name and design your Jolly Roger — it will fly from the sails of every ship you own.'),
          h('p.muted', 'Raising a Jolly Roger makes you a pirate in the eyes of the world. The Marines won\'t take a pirate captain, and a pirate with a bounty is hunted.'),
          h('div.opt-row', h('div.opt-label', 'Crew name'), input),
          designer(found, render),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '10px' } },
            h('button.btn.red.big', { on: { click: async () => {
              const name = (found.name || '').trim().slice(0, 28);
              if (!name) return;
              if (!(await game.ui.ask({ title: `Raise the flag of the ${name}?`, text: 'From now on you sail as a pirate captain.', ok: 'Raise the flag' }))) return;
              c.crewName = name;
              c.jr = { ...found.jr, name };
              if (c.faction === 'civilian') c.faction = 'pirate';
              hoist(game);
              game.ui.toast('A NEW PIRATE CREW', `The ${name} set sail!`, '#ffd54f');
              game.log(`You founded the ${name}. Your Jolly Roger flies from your ship.`, '#ffe082');
              game.emit('crewFounded', name);
              persist(game);
              render();
            } } }, 'Raise the flag'))));
    } else {
      add(body, h('div.crew-head', flagCanvas(c.jr, 120, 86), h('div',
        h('h2', `The ${c.crewName}`),
        h('p.muted', `Captain ${c.name} · ${game.crew.count() + 1} aboard`),
        h('button.btn', { on: { click: () => openJollyRoger(game) } }, uiImg('jolly_roger', 18), 'Redesign the Jolly Roger'))));
    }
    roster(game, body, render);
  };
  render();
}

function fleetInfo(game) {
  const c = game.state.char;
  // (every ship you own, afloat or laid up in the yards: see game/fleet.js)
  const ships = c.fleet || game.ships.filter((s) => s.owner === 'player' && !s.sunk);
  const escorts = game.ships.filter((s) => s.escortOf && !s.sunk);
  return h('div',
    h('p', `Ships under your command: ${ships.map((s) => s.name).join(', ') || 'none'}${escorts.length ? ` · escorts: ${escorts.length}` : ''}`),
    h('p.muted', c.marineRank && /Captain|Commodore|Admiral/.test(c.marineRank) ? 'Your escort ships sail with you and Marines under your command fight at your side.' : 'From the rank of Captain, escort ships sail with you; officers command Marines who fight beside them.'));
}

function roster(game, body, rerender) {
  const crew = game.crew.members();
  add(body, h('h3', 'Nakama'));
  add(body, h('p.muted', 'Companions you recruit in the world. Look for "Join my crew!" when you talk to people — a navigator, a cook, a doctor… Up to two fighters follow you on land; everyone else stays with the ship and helps from there.'));
  if (!crew.length) add(body, h('p', 'Your crew is just you, for now. Every great pirate started alone.'));
  const list = h('div.list');
  for (const m of crew) {
    const role = CREW_ROLES[m.role] || CREW_ROLES.fighter;
    const actions = [];
    if (m.fighter) {
      actions.push(h('button.btn' + (m.follow ? '.green' : ''), {
        on: { click: () => { if (!game.crew.setFollow(m.id, !m.follow)) game.log('Only two companions can follow you on land at once.', '#ff8a80'); rerender(); } },
      }, m.follow ? 'Following' : 'Stays aboard'));
    }
    actions.push(h('button.btn.red', { on: { click: async () => { if (await game.ui.ask({ title: 'Part ways?', text: `${m.name} will leave the crew and will not come back.`, ok: 'Part ways', danger: true })) { game.crew.dismiss(m.id); rerender(); } } } }, 'Part ways'));
    list.appendChild(h('div.row-item',
      uiImg(role.icon || 'crew', 28),
      h('div.grow', h('b', `${m.name}`), h('div.sub', `${role.name}${m.title ? ' · ' + m.title : ''} · Lv ${Math.round(m.level || 1)} · joined day ${m.joined || 1}`), h('div.sub', role.desc)),
      ...actions));
  }
  body.appendChild(list);
  const mods = game.crewMods;
  const perks = [];
  if (mods.speedMul > 1) perks.push('+10% sailing speed');
  if (mods.logMul > 1) perks.push('Log Pose sets twice as fast');
  if (mods.foodMul > 1) perks.push('+50% healing from food');
  if (mods.seaMeals) perks.push('Hot meals heal you at sea');
  if (mods.doctor) perks.push('Healed after every battle');
  if (mods.repair) perks.push('Ship repairs itself at sea');
  if (mods.cannonMul > 1) perks.push('+30% cannon damage');
  if (mods.cdMul < 1) perks.push('Techniques come back 10% sooner');
  if (mods.poneglyphs) perks.push('Can read Poneglyphs');
  if (mods.turnMul > 1) perks.push('Ship turns 25% faster');
  if (perks.length) add(body, h('h3', 'Crew bonuses'), h('p', perks.join(' · ')));
}

/** The Jolly Roger button (Character menu): your flag, or how to get one. */
export function openJollyRoger(game) {
  const c = game.state.char;
  const body = h('div.jolly');
  const entry = game.ui.openPanel(body, { wide: false, id: 'jolly' });
  if (!entry) return;
  if (c.faction === 'marine') {
    add(body, h('h2', 'Colours'), flagCanvas(null, 220, 150, true), h('p', 'As a Marine you sail under the gull of the World Government.'));
    return;
  }
  if (!c.crewName) {
    add(body, h('h2', 'Jolly Roger'), flagCanvas({ skull: 'classic', bones: 'cross', accessory: 'none', color: '#333' }, 220, 150),
      h('p', 'You have no crew — and no flag — yet. Found a pirate crew from the Crew menu (U) to design your Jolly Roger. It will fly from the sails of your ships.'),
      h('button.btn.gold', { on: { click: () => { game.ui.closePanel(entry); openCrew(game); } } }, uiImg('crew', 18), 'Open the Crew menu'));
    return;
  }
  const state = { jr: { skull: 'classic', bones: 'cross', accessory: 'none', color: '#f5f6fa', ...c.jr } };
  const render = () => {
    clear(body);
    add(body, h('h2', `Flag of the ${c.crewName}`), designer(state, render),
      h('div', { style: { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' } },
        h('button.btn', { on: { click: () => game.ui.closePanel(entry) } }, 'Cancel'),
        h('button.btn.gold', { on: { click: () => { c.jr = { ...state.jr, name: c.crewName }; hoist(game); persist(game); game.ui.closePanel(entry); game.log('Your new Jolly Roger is hoisted.', '#ffe082'); } } }, 'Hoist it')));
  };
  render();
}
