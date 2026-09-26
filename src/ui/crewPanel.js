// Crew roster ("nakama"): roles, who follows you on land, parting ways.
import { h, clear } from './dom.js';
import { CREW_ROLES } from '../game/crew.js';

export function openCrew(game) {
  const body = h('div');
  const entry = game.ui.openPanel(body, { wide: true, id: 'crew' });
  if (!entry) return;
  const render = () => {
    clear(body);
    const crew = game.crew.members();
    body.append(h('h2', `Crew of the ${game.state.char.jr?.name || game.state.char.name}`));
    body.append(h('p.muted', 'Companions you recruit in the world. Look for "Join my crew!" when you talk to people — a navigator, a cook, a doctor… Up to two fighters follow you on land; everyone else stays with the ship and helps from there.'));
    if (!crew.length) body.append(h('p', 'Your crew is just you, for now. Every great pirate started alone.'));
    const list = h('div.list');
    for (const m of crew) {
      const role = CREW_ROLES[m.role] || CREW_ROLES.fighter;
      const actions = [];
      if (m.fighter) {
        actions.push(h('button.btn' + (m.follow ? '.green' : ''), {
          on: { click: () => { if (!game.crew.setFollow(m.id, !m.follow)) game.log('Only two companions can follow you on land at once.', '#ff8a80'); render(); } },
        }, m.follow ? 'Following' : 'Stays aboard'));
      }
      actions.push(h('button.btn.red', { on: { click: () => { if (confirm(`Part ways with ${m.name}? They will not come back.`)) { game.crew.dismiss(m.id); render(); } } } }, 'Part ways'));
      list.appendChild(h('div.row-item',
        h('span.ico', role.icon),
        h('div.grow', h('b', `${m.name}`), h('div.sub', `${role.name}${m.title ? ' · ' + m.title : ''} · Lv ${Math.round(m.level || 1)} · joined day ${m.joined || 1}`), h('div.sub', role.desc)),
        ...actions));
    }
    body.appendChild(list);
    const mods = game.crewMods;
    const perks = [];
    if (mods.speedMul > 1) perks.push('+10% sailing speed');
    if (mods.logMul > 1) perks.push('Log Pose sets twice as fast');
    if (mods.foodMul > 1) perks.push('+50% healing from food');
    if (mods.doctor) perks.push('Healed after every battle');
    if (mods.repair) perks.push('Ship repairs itself at sea');
    if (mods.cannonMul > 1) perks.push('+30% cannon damage');
    if (mods.staminaMul > 1) perks.push('+25% stamina regeneration');
    if (mods.poneglyphs) perks.push('Can read Poneglyphs');
    if (mods.turnMul > 1) perks.push('Ship turns 25% faster');
    if (perks.length) body.append(h('h3', 'Crew bonuses'), h('p', perks.join(' · ')));
  };
  render();
}
