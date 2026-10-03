// In the world, while there's a voyage: a badge under the clock with the
// room code and how many are aboard (click it, or P, for the voyage list),
// the chat (Enter to say something, Enter again to send it, Esc to think
// better of it), and in the log what's said and who comes and goes. None of
// it exists until a voyage is hosted or joined.
import { h, clear } from './dom.js';
import { uiImg } from './icon.js';
import { copyCode } from './voyage.js';
import { showCode } from '../net/code.js';
import { errorText } from '../net/session.js';
import { MATE_COLOR } from '../net/remote.js';
import { CHAT_MAX, BIT } from '../net/protocol.js';
import { RACES } from '../data/races.js';
import { REGION_INFO, regionAt } from '../world/constants.js';
import { fmtDist } from './compass.js';
import { findShore } from '../game/interact.js';
import { persist } from '../game/lineage.js';

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

export function installVoyageHud(game, ui) {
  let v = null, offs = [], badge = null, box = null, lines = null, input = null;
  const history = []; // the chat (and comings and goings), for the box while it's open

  const build = () => {
    if (badge) return;
    badge = h('button.vy-badge.interactive', { title: 'The voyage (P)', on: { click: (e) => { e.currentTarget.blur(); openList(); } } });
    (ui.el.saved?.parentNode || ui.hud).appendChild(badge);
    lines = h('div.chat-lines');
    input = h('input.chat-in', { type: 'text', maxLength: CHAT_MAX, spellcheck: false, autocomplete: 'off', placeholder: 'Say something to the crew — Enter sends, Esc cancels' });
    box = h('div.chat-box.hidden', lines, input);
    ui.hud.appendChild(box);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); closeChat(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const t = input.value;
      input.value = '';
      if (t.trim()) v?.say(t);
      closeChat();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    input.addEventListener('blur', () => { if (ui.chatOpen) closeChat(); });
  };

  /** A line in the log: who (in their colour) and what they said — or just what happened. */
  const logLine = (name, text, color = '#fff') => {
    const d = name ? h('div', h('b', { style: { color } }, name + ': '), h('span', text)) : h('div', { style: { color } }, text);
    ui.el.log.appendChild(d);
    while (ui.el.log.children.length > 7) ui.el.log.removeChild(ui.el.log.firstChild);
    history.push({ name, text, color });
    if (history.length > 30) history.shift();
    if (ui.chatOpen) drawHistory();
  };

  const drawHistory = () => {
    clear(lines);
    for (const l of history.slice(-10)) lines.appendChild(l.name ? h('div', h('b', { style: { color: l.color } }, l.name + ': '), h('span', l.text)) : h('div.sys', { style: { color: l.color } }, l.text));
  };

  const setBadge = () => {
    if (!badge || !v) return;
    const n = v.crew().length;
    clear(badge);
    badge.append(uiImg('crew', 16), h('span', showCode(v.code)), h('small', `${n} aboard`));
  };

  function openChat() {
    if (!v?.open || !game.player || ui.chatOpen) return;
    build();
    ui.chatOpen = true;
    ui.root.classList.add('chatting');
    box.classList.remove('hidden');
    drawHistory();
    game.view3d?.rig.releaseLock?.();
    setTimeout(() => input.focus(), 0);
  }

  function closeChat() {
    if (!ui.chatOpen) return;
    ui.chatOpen = false;
    ui.root.classList.remove('chatting');
    box?.classList.add('hidden');
    input?.blur();
  }

  /** Where a crewmate is, from you: "1.2 km north-east, Shells Town" (or the zone they're in). */
  const whereOf = (r) => {
    const s = r.now || r.buf.latest();
    if (!s || !game.player) return r.play ? '' : 'getting ready';
    const here = game.inZone?.() || '';
    if (s.w !== here) return s.w ? 'below the sea or above the clouds — in another place' : 'up on the surface';
    const p = game.player, w = game.world;
    const d = w.distance(p.x, p.y, s.x, s.y);
    if (d < 25) return 'right here';
    const a = Math.atan2(s.y - p.y, w.dx(p.x, s.x));
    const isl = w.islandAt?.(s.x, s.y);
    const place = isl?.name || (w.zone === 0 ? REGION_INFO[regionAt(s.x, s.y)]?.name : w.name) || '';
    return `${fmtDist(d)} ${DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]}${place ? ' · ' + place : ''}${s.b & BIT.helm ? ' · at sea' : ''}`;
  };

  /** Go and stand beside a crewmate who's ashore in the same world (a friend far off is a long sail otherwise). */
  const goTo = async (r) => {
    const s = r.now || r.buf.latest(), p = game.player;
    if (!s || !p) return;
    const ashore = !(s.b & (BIT.helm | BIT.water | BIT.flying)) && s.du === undefined;
    if (!ashore) { game.log(`${r.name} is at sea or in the water just now — try when they're ashore.`, '#ffab91'); return; }
    if (p.mode === 'sail') { game.log('Leave the helm first (E).', '#ffab91'); return; }
    const back = (s.f || 0) + Math.PI;
    const spot = findShore(game.world, s.x + Math.cos(back) * 1.5, s.y + Math.sin(back) * 1.5, 4);
    if (!spot) { game.log(`There's no room to stand beside ${r.name} there.`, '#ffab91'); return; }
    if (!(await ui.ask({ title: `Go to ${r.name}?`, text: 'You\'ll be beside them in a moment. Your ship stays where you left her.', ok: 'Go' }))) return;
    ui.closeAll();
    ui.fade(true);
    setTimeout(() => {
      p.leaveWater?.(game); p.deck?.ship.aboard?.delete(p); p.deck = null;
      p.z = 0; p.vz = 0; p.vx = p.vy = 0; p.kb.x = p.kb.y = 0; p.dash = null; p.action = null; p.roofed = false; p.lastG = null;
      p.x = game.world.wx(spot.x); p.y = spot.y;
      p.facing = Math.atan2(s.y - p.y, game.world.dx(p.x, s.x));
      game.snapCamera();
      game.log(`You join ${r.name}.`, MATE_COLOR);
      ui.fade(false);
    }, 450);
  };

  /** A crewmate's row as it is just now: what they are, where, and whether you can go to them. */
  const rowNow = (m) => {
    const r = m.remote, L = r?.info;
    const race = m.you ? RACES[game.state?.char?.race]?.name : L ? RACES[L.race]?.name : '';
    const where = m.you ? 'you' : whereOf(r);
    const can = !m.you && !!r?.play && r.visible && (r.now ? !(r.now.b & (BIT.helm | BIT.water | BIT.flying)) && r.now.du === undefined : false);
    return { sub: [race, where].filter(Boolean).join(' · '), can, on: m.you ? v.inWorld : m.play };
  };

  /** The voyage list (P, the badge, or the pause menu): who's aboard and where, the code, leaving. */
  function openList() {
    if (!v || !game.player) return;
    const body = h('div.vy-list');
    const rows = h('div.list');
    let key = '';
    const refs = new Map(); // crewmate → their row's parts
    const copy = h('button.btn.gold.small', { on: { click: () => copyCode(v.code, copy) } }, 'Copy code');
    // (on a phone there's no Enter: the chat opens from here)
    const chat = h('button.btn.gold', { title: 'Say something to the crew (Enter)', on: { click: () => { ui.closeAll(); openChat(); } } }, 'Say something');
    const leave = h('button.btn.red', { on: { click: async () => {
      const was = v, hosting = was?.role === 'host';
      if (!was) return;
      if (!(await ui.ask({ title: hosting ? 'End the voyage?' : 'Leave the voyage?', text: hosting ? 'Everyone aboard goes on alone, in their own worlds. Your game carries on.' : 'You sail on alone, in your own world. Your pirate is saved.', ok: hosting ? 'End it' : 'Leave', danger: true }))) return;
      ui.closeAll();
      was.close('left');
      persist(game);
      game.log(hosting ? 'The voyage is over: you sail on alone.' : 'You leave the voyage and sail on alone.', '#b0bec5');
    } } }, v.role === 'host' ? 'End the voyage' : 'Leave the voyage');
    body.append(
      h('div.panel-top', h('h2', 'The voyage'), h('div.vy-code-line', h('b', showCode(v.code)), copy)),
      h('p.muted', v.role === 'host' ? 'You\'re hosting: your world\'s days, hours and weather are everyone\'s. Pass the code on and friends can join while you play.' : `You're aboard ${v.hostName || 'the host'}'s voyage: their world sets the day, the hour and the weather. Your pirate and their save are your own.`),
      rows,
      h('div.row-end.vy-btns', chat, leave));
    // the rows are made again only when who's aboard changes; their words and buttons,
    // every second, in place (a button rebuilt under the pointer would miss its click)
    const update = () => {
      if (!v) { clear(body); body.appendChild(h('p', 'The voyage is over.')); return; }
      const crew = v.crew(), k = crew.map((m) => m.id + ':' + m.name + (m.play ? '+' : '-')).join(',');
      if (k !== key) {
        key = k;
        clear(rows); refs.clear();
        for (const m of crew) {
          const now = rowNow(m);
          const dot = h('i.vy-dot' + (now.on ? '.on' : '')), sub = h('div.sub', now.sub);
          const btn = !m.you && m.remote?.play ? h('button.btn.small', { on: { click: () => goTo(m.remote) } }, 'Go to them') : null;
          refs.set(m.id, { m, dot, sub, btn });
          rows.appendChild(h('div.row-item.vy-row', dot, h('div.grow', h('b', m.name), m.host ? h('span.tag', 'host') : null, sub), btn));
        }
      }
      for (const { m, dot, sub, btn } of refs.values()) {
        const now = rowNow(m);
        if (sub.textContent !== now.sub) sub.textContent = now.sub;
        dot.classList.toggle('on', now.on);
        if (btn) {
          btn.disabled = !now.can;
          btn.classList.toggle('gold', now.can);
          btn.title = now.can ? `Go and stand beside ${m.name}` : 'Only while they\'re ashore, in the same world as you';
        }
      }
    };
    update();
    const entry = ui.openPanel(body, { id: 'voyage' });
    if (!entry) return;
    entry.panel.classList.add('vy-panel');
    // (the crew's whereabouts kept up to date while it's open)
    const timer = setInterval(() => { if (!body.isConnected) { clearInterval(timer); return; } update(); }, 1000);
  }

  /** A voyage begins (or ends: null). */
  function attach(voyage) {
    for (const off of offs) off();
    offs = [];
    closeChat();
    v = voyage;
    if (!v) { if (badge) badge.classList.add('hidden'); return; }
    build();
    badge.classList.remove('hidden');
    setBadge();
    offs.push(
      v.on('roster', setBadge),
      v.on('status', setBadge),
      v.on('chat', ({ name, text, color, self }) => {
        if (!game.player) return;
        logLine(name, text, color || '#ffe082');
        if (!self) game.audio?.sfx?.('page');
      }),
      v.on('note', (text, color) => { if (game.player && text) logLine(null, text, color || '#b0bec5'); }),
      v.on('failed', (err) => {
        const { title, text } = errorText(err, { code: showCode(v?.code), host: v?.hostName });
        if (game.player) {
          ui.toast(title.toUpperCase(), text, '#ffab91', 'voyage');
          logLine(null, text, '#ffab91');
          persist(game);
        } else if (!ui.screenEl?.querySelector('.vy-lobby')) {
          // (making a pirate: said over it, and they carry on — alone, once they're done;
          // the lobby screens say it themselves: main.js, voyage.js)
          ui.toast(title.toUpperCase(), text, '#ffab91', 'voyage');
        }
        attach(null);
      }),
      v.on('closed', () => attach(null)),
    );
  }

  return { attach, openChat, closeChat, openList, get voyage() { return v; } };
}
