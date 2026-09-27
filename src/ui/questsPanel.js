// The Quests menu (L): the main story — the chapter you're on, what's left
// of it and the story so far — side quests you can track or give up, and
// everything you've finished. The main story can't be abandoned.
import { h, clear } from './dom.js';
import { uiImg } from './icon.js';
import { questDef } from '../game/quests.js';
import { PATHS } from '../content/main/paths.js';

const add = (el, ...kids) => { for (const k of kids) if (k) el.appendChild(k); return el; };

function stageRows(game, id) {
  const q = game.quests, s = q.state(id), d = questDef(id);
  const rows = h('ol.q-steps');
  d.stages.forEach((st, i) => {
    if (st.hidden && i !== s.stage) return;
    const done = s.done || i < s.stage, cur = !s.done && i === s.stage;
    const pr = cur ? q.progress(id) : null;
    rows.appendChild(h('li' + (done ? '.done' : cur ? '.cur' : ''), done ? uiImg('check', 14) : h('i.dot'), h('span', st.desc, pr ? h('b.qt-n', ` ${pr.n}/${pr.of}`) : null)));
  });
  return rows;
}

function whereLine(game, id) {
  const m = game.quests.marker(id);
  if (!m || !Number.isFinite(m.x)) return null;
  const w = game.world, p = game.player;
  if (m.zone ? m.zone !== w.id : w !== game.surface) return null;
  const d = w.distance(p.x, p.y, m.x, m.y);
  return h('div.q-where', uiImg('map', 14), d < 12 ? ' You are here' : ` ${m.place || m.label} — ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'} away`);
}

export function openQuests(game, first = 'main') {
  const ui = game.ui, c = game.state.char;
  const body = h('div.quests');
  const entry = ui.openPanel(body, { wide: true, id: 'quests' });
  if (!entry) return;
  let tab = first;
  const render = () => {
    clear(body);
    const q = game.quests;
    const side = q.side();
    const tabs = h('div.tabs', ...[['main', 'Main story'], ['side', `Side quests${side.length ? ` (${side.length})` : ''}`], ['done', 'Completed']].map(([k, t]) => h('button' + (tab === k ? '.on' : ''), { on: { click: () => { tab = k; render(); } } }, t)));
    add(body, h('h2', 'Quests'), tabs);
    if (tab === 'main') {
      const main = q.main();
      const path = PATHS[c.main?.path];
      add(body, h('div.q-pathline', path ? h('span.q-path', { style: { background: path.color } }, path.name) : null, h('span.muted', path ? path.tagline : 'Your story hasn\'t begun yet.')));
      if (main) {
        const d = main.def;
        add(body, h('div.card.q-main',
          h('div.q-kicker', d.part ? `Part ${d.part} · ${d.partName || ''}${main.s.ch ? ` · Chapter ${main.s.ch}` : ''}` : 'Main story'),
          h('h3', d.name),
          d.summary ? h('p', d.summary) : null,
          stageRows(game, main.id),
          whereLine(game, main.id),
          h('p.muted.q-note', 'The main story can\'t be abandoned — the sea keeps its promises.')));
      } else if (c.mainIntro) {
        add(body, h('div.card.q-main', h('div.q-kicker', 'Prologue'), h('h3', 'Find your calling'), h('p', c.mainIntro)));
      } else {
        add(body, h('p.muted', 'No chapter under way.'));
      }
      const told = (c.main?.done || []).map((id) => questDef(id)).filter(Boolean).reverse();
      if (told.length) {
        add(body, h('h3', 'The story so far'), h('div.list.compact', ...told.map((d) => h('div.row-item', uiImg('check', 18), h('div.grow', h('b', d.name), h('div.sub', `Part ${d.part} · ${d.partName || ''}${d.islandName ? ` — ${d.islandName}` : ''}`))))));
      }
    } else if (tab === 'side') {
      if (!side.length) add(body, h('p.muted', 'No side quests. People all over the Blue Planet need a hand — look for the ! over their heads.'));
      const tracked = new Set(q.tracked().map((x) => x.id));
      for (const { id, s, def } of side) {
        const isl = def.island && game.surface.islands.find((i) => i.id === def.island);
        add(body, h('div.card.q-side' + (tracked.has(id) ? '.tracked' : ''),
          h('div.q-top', h('h4', uiImg('quest', 18), ' ', def.name, h('span.tag', def.kind || 'side')),
            h('div.q-btns',
              h('button.btn.small' + (tracked.has(id) ? '.gold' : ''), { on: { click: () => { q.track(id, !tracked.has(id)); render(); } } }, tracked.has(id) ? 'Tracked' : 'Track'),
              h('button.btn.small.red', { on: { click: async () => {
                if (!(await ui.ask({ title: `Abandon "${def.name}"?`, text: 'You can take it up again from whoever gave it to you — from the start.', ok: 'Abandon', danger: true }))) return;
                q.abandon(id); render();
              } } }, 'Abandon'))),
          def.summary ? h('p', def.summary) : null,
          stageRows(game, id),
          isl ? h('div.muted', 'Location: ' + isl.name) : null));
        void s;
      }
    } else {
      const done = Object.entries(c.quests).filter(([, s]) => s.done).map(([id, s]) => ({ d: questDef(id), s })).filter((x) => x.d).sort((a, b) => (b.s.doneAt || 0) - (a.s.doneAt || 0));
      if (!done.length) add(body, h('p.muted', 'Nothing finished yet.'));
      else add(body, h('div.list.compact', ...done.map(({ d }) => h('div.row-item', uiImg('check', 18), h('div.grow', h('b', d.name), h('div.sub', d.kind === 'main' ? `Main story, part ${d.part}` : (d.kind || 'side')))))));
    }
  };
  render();
  const t = setInterval(() => { if (!document.body.contains(body)) clearInterval(t); }, 2000);
}
