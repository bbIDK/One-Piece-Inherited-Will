// The Quests section of the menu (Tab): the main story — the chapter you're on, what's left
// of it and the story so far — side quests you can track or give up, and
// everything you've finished. The main story is never forced: before taking
// a road you can sail your own way instead, and a road under way can be set
// aside and taken up again where it was left (content/mainStory.js).
import { h, clear } from './dom.js';
import { uiImg } from './icon.js';
import { fmtDist } from './compass.js';
import { questDef } from '../game/quests.js';
import { PATHS, OWN_WAY, PART_NAMES } from '../content/main/paths.js';

const add = (el, ...kids) => { for (const k of kids) if (k) el.appendChild(k); return el; };

/**
 * Your road, and the choice that goes with where you are on it (the Quests
 * menu and the Journal both show it): looking for a calling — or sail your
 * own way; sailing your own way — or look for a calling after all; a road
 * set aside — take it up again; a road under way — set it aside.
 * { state, text, button } (the button may be null).
 */
export function storyChoice(game, rerender) {
  const c = game.state.char, S = game.story, ui = game.ui;
  const btn = (cls, label, fn) => h('button.btn' + cls, { on: { click: async () => { if (await fn()) rerender(); } } }, label);
  if (c.main && !c.main.finished) {
    const path = PATHS[c.main.path];
    return { state: 'road', text: `The road of the ${path.name}. Want to sail free for a while? Set the story aside — it waits for you, chapter and all.`,
      button: btn('.small', 'Set the story aside', async () => (await ui.ask({ title: 'Set your story aside?', text: `The road of the ${path.name} stops where it is: no chapter, no markers, nothing steering your Log Pose, and the Grand Line won't hold you to an island. Take it up again here whenever you like — it carries on where you left it.`, ok: 'Set it aside' })) && S?.setAside()) };
  }
  if (c.mainShelf) {
    const sh = c.mainShelf, path = PATHS[sh.main.path];
    const d = sh.quest && questDef(sh.quest.id);
    return { state: 'shelved', text: `The road of the ${path.name} waits where you left it${d ? ` — "${d.name}"` : ''} (Part ${sh.main.part}, ${PART_NAMES[sh.main.part]}).`,
      button: btn('.gold.small', 'Take your story up again', () => S?.takeUp()) };
  }
  if (c.freeSail) {
    return { state: 'free', text: `You're sailing your own way${c.freeSail.day > 1 ? ` (since day ${c.freeSail.day})` : ''}: no main story, just the sea. Changed your mind? Look for a calling — the people who can set you on a road will be marked again.`,
      button: btn('.small', 'Look for a calling after all', () => S?.seekCalling()) };
  }
  if (c.mainIntro || !c.main) {
    return { state: 'calling', text: 'Three roads — Pirate, Marine, Bounty Hunter — or a fourth: sail off into the seas and start your own journey, with no main story at all. Side quests, trainers, shops and bounties are the same either way.',
      button: btn('.small', 'Sail your own way (no main story)', async () => (await ui.ask({ title: 'Sail your own way?', text: 'No road and no main story: no chapters, no orange markers, nothing steering your Log Pose. Side quests, trainers, shops, bounties and the whole sea stay open — and you can still take up a road later, from here or from anyone who could set you on one.', ok: 'Sail my own way' })) && S?.sailFree('quests')) };
  }
  return { state: 'done', text: 'Your story is told.', button: null };
}

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
  return h('div.q-where', uiImg('map', 14), d < 12 ? ' You are here' : ` ${m.place || m.label} — ${fmtDist(d)} away`);
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
      const ch = storyChoice(game, render);
      const path = PATHS[c.main?.path] || (ch.state === 'free' || ch.state === 'shelved' ? OWN_WAY : null);
      add(body, h('div.q-pathline', path ? h('span.q-path', { style: { background: path.color } }, path.name) : null, h('span.muted', path ? path.tagline : 'Your story hasn\'t begun yet.')));
      if (main) {
        const d = main.def;
        add(body, h('div.card.q-main',
          h('div.q-kicker', d.part ? `Part ${d.part} · ${d.partName || ''}${main.s.ch ? ` · Chapter ${main.s.ch}` : ''}` : 'Main story'),
          h('h3', d.name),
          d.summary ? h('p', d.summary) : null,
          stageRows(game, main.id),
          whereLine(game, main.id),
          h('div.q-choice', h('p.muted.q-note', ch.text), ch.button)));
      } else if (ch.state === 'shelved' || ch.state === 'free') {
        add(body, h('div.card.q-main.q-own',
          h('div.q-kicker', ch.state === 'shelved' ? 'The story waits' : 'No main story'),
          h('h3', 'Sailing your own way'),
          h('p', ch.state === 'shelved' ? 'Your road is set aside: no chapter, no story markers, nothing steering your Log Pose. The side quests you take on are below (Side quests), and the whole sea is yours.' : 'No road, no chapters, no story markers — side quests, trainers, shops, bounties, the Marines, a flag of your own and the Grand Line are all still out there.'),
          h('div.q-choice', h('p.muted.q-note', ch.text), ch.button)));
      } else if (c.mainIntro) {
        add(body, h('div.card.q-main', h('div.q-kicker', 'Prologue'), h('h3', 'Find your calling'), h('p', c.mainIntro),
          h('div.q-choice', h('p.muted.q-note', ch.text), ch.button)));
      } else {
        add(body, h('p.muted', 'No chapter under way.'));
      }
      const told = (c.main?.done || c.mainShelf?.main?.done || []).map((id) => questDef(id)).filter(Boolean).reverse();
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
