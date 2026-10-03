// The multiplayer screens: the title's Multiplayer pane (host a voyage with
// one of your lineages, or join one with a friend's code), the host's lobby
// with the room code to pass on, looking for a friend's voyage, choosing the
// pirate you bring aboard it, and what went wrong when something did.
// (The voyage itself: net/session.js; in the world: voyageHud.js.)
import { h, clear } from './dom.js';
import { uiImg } from './icon.js';
import { portrait } from './screens.js';
import { RACES } from '../data/races.js';
import { showCode, normalizeCode, CODE_LEN } from '../net/code.js';
import { errorText } from '../net/session.js';
import { MAX_PLAYERS } from '../net/protocol.js';

/** "3 minutes ago" and the like, for the voyages you've been on. */
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400 * 1.5) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** Copy the code (the clipboard where the browser lets us; a selected field where it doesn't). */
export function copyCode(code, btn) {
  const done = (ok) => {
    if (!btn) return;
    const was = btn.dataset.label || btn.textContent;
    btn.dataset.label = was;
    btn.textContent = ok ? 'Copied!' : 'Select it and copy';
    setTimeout(() => { btn.textContent = btn.dataset.label; }, 1600);
  };
  const fallback = () => {
    try {
      const f = h('input', { value: code, style: { position: 'fixed', left: '-999px', top: '0' } });
      document.body.appendChild(f);
      f.select();
      const ok = document.execCommand?.('copy');
      f.remove();
      done(!!ok);
    } catch { done(false); }
  };
  try {
    const p = navigator.clipboard?.writeText(code);
    if (p) p.then(() => done(true), fallback); else fallback();
  } catch { fallback(); }
}

/** The code, large, on a dark plate (two halves), with a Copy button. */
function codePlate(code, small = false) {
  const btn = small ? null : h('button.btn.gold', { title: 'Copy the code to pass it on', on: { click: () => copyCode(code, btn) } }, 'Copy');
  return h('div.code-plate' + (small ? '.small' : ''),
    h('div.code-letters', { title: 'The room code' }, ...code.split('').map((ch, i) => h('span' + (i === 3 ? '.gap' : ''), ch))),
    btn);
}

/** One of your lineages, as a row to pick (a portrait, who, where they are). */
function slotRow(info, button) {
  const c = info.char, last = info.legacy?.hall?.[0];
  const gen = info.legacy?.generation || c?.generation || 1;
  const who = c ? c.name : info.empty ? 'An empty lineage' : `Generation ${gen}`;
  const sub = c ? `${RACES[c.race]?.name || c.race} · Day ${c.world?.day || 1} · Generation ${gen}` : info.empty ? 'A new bloodline, waiting to be born' : last ? `${last.name} fell; the next is ready to be born` : 'Ready to be born';
  return h('div.vy-slot' + (button.disabled ? '.busy' : ''),
    c ? portrait(c.look, 40, 46) : h('div.vy-blank', uiImg('legacy', 22)),
    h('div.vy-who', h('small', `Lineage ${info.slot}`), h('b', who), h('div.sub', sub)),
    button);
}

/**
 * The title's Multiplayer pane. slots: slotInfo for each lineage; recent:
 * [{ code, host, at }] — the voyages you've joined, newest first.
 */
export function multiplayerPane({ slots, recent = [], local = false, onHost, onJoin }) {
  const input = h('input.code-in', { maxLength: CODE_LEN + 2, size: CODE_LEN + 2, placeholder: 'ABCDEF', spellcheck: false, autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'Room code' });
  const hint = h('div.code-hint', '');
  const join = () => {
    const c = normalizeCode(input.value);
    if (!c) { hint.textContent = 'A code is six letters (there\'s no I or O in them).'; input.focus(); return; }
    onJoin(c);
  };
  input.addEventListener('input', () => { input.value = input.value.toUpperCase(); hint.textContent = ''; });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); });
  const host = h('div.vy-card',
    h('div.vy-head', uiImg('jolly_roger', 26), h('span', 'Host a voyage')),
    h('p', 'Your world becomes the shared one: its days, its hours and its weather. Friends join with the code you\'re given, each with a pirate of their own.'),
    h('div.vy-sub', 'Sail with'),
    h('div.vy-slots', ...slots.map((s) => slotRow(s, h('button.btn' + (s.char ? '.gold' : '.red') + '.small', { on: { click: () => onHost(s.slot) } }, s.char ? 'Host' : 'Begin & host')))));
  const card = h('div.vy-card',
    h('div.vy-head', uiImg('crew', 26), h('span', 'Join a voyage')),
    h('p', 'Type in the code your friend\'s game shows them:'),
    h('div.code-row', input, h('button.btn.gold', { on: { click: join } }, 'Join')),
    hint,
    recent.length ? h('div.vy-sub', 'Your recent voyages') : null,
    recent.length ? h('div.vy-recent', ...recent.slice(0, 3).map((r) => h('div.vy-rec',
      h('div', h('b', showCode(r.code)), h('div.sub', `${r.host ? r.host + '\'s voyage' : 'A voyage'} · ${ago(r.at)}`)),
      h('button.btn.small', { on: { click: () => onJoin(r.code) } }, 'Rejoin')))) : null,
    h('p.vy-small', 'You bring a pirate of your own (or begin a new lineage), and they keep their own save. The host\'s world sets the day, the hour and the weather.'));
  return h('div.vy-pane',
    h('div.vy-cards', host, card),
    h('p.vy-foot', local
      ? 'Local test mode (?net=local): voyages reach only other tabs of this browser.'
      : `Up to ${MAX_PLAYERS} players. No account and no server: games find each other through public relays, then talk directly (WebRTC). A few networks (strict firewalls, some mobile ones) don't allow that.`));
}

/** A status line: a coloured dot (or a spinner) and words. */
function statusLine(kind, text) {
  return h('div.vy-status.' + kind, h('i'), h('span', text));
}

function crewList(v) {
  const rows = v.crew().map((m) => h('div.vy-mate' + (m.you ? '.you' : ''),
    h('i.vy-dot' + (m.play ? '.on' : '')),
    h('b', m.name),
    h('span.sub', [m.host ? 'host' : null, m.you ? 'you' : null, m.play ? 'in the world' : m.you || m.host ? 'getting ready' : 'choosing a pirate'].filter(Boolean).join(' · '))));
  return h('div.vy-crew', ...rows);
}

/** Keep a screen's parts up to date with the voyage while it's showing (and stop when it's gone). */
function follow(v, el, render) {
  const offs = [];
  const update = () => { if (!el.isConnected) { for (const off of offs) off(); return; } render(); };
  for (const ev of ['status', 'roster']) offs.push(v.on(ev, update));
  // (time passing: the seconds spent looking, the relays coming up)
  const timer = setInterval(() => { if (!el.isConnected || v.over) { clearInterval(timer); return; } render(); }, 1000);
  render();
}

/** The host's lobby: the code to pass on, the voyage opening, who's aboard; then off to sea. */
export function hostLobby(ui, v, { info, onSail, onNewCode, onBack }) {
  const statusEl = h('div'), crewEl = h('div');
  const sail = h('button.btn.gold.big', { on: { click: () => onSail() } }, info.char ? `Set sail with ${info.char.name}` : 'Set sail (a new pirate)');
  const el = h('div.screen', h('div.panel.vy-lobby',
    h('h2', 'Hosting a voyage'),
    h('p.muted', `Lineage ${info.slot}${info.char ? ` — ${info.char.name}, day ${info.char.world?.day || 1}` : ' — a new pirate'}. Pass this code to your friends:`),
    codePlate(v.code),
    statusEl,
    h('h3', 'Aboard'),
    crewEl,
    h('div.vy-btns', sail, h('button.btn', { title: 'Close this voyage and open one with another code', on: { click: () => onNewCode() } }, 'New code'), h('button.btn', { on: { click: () => onBack() } }, 'Back')),
    h('p.muted.vy-note', 'Friends can come aboard while you play, too: the code is in the pause menu (Esc) and the voyage list (P).')));
  ui.showScreen(el);
  follow(v, el, () => {
    clear(statusEl);
    const r = v.relays;
    if (v.status === 'open') statusEl.appendChild(statusLine('ok', v.kind === 'local' ? 'Open — other tabs of this browser can join.' : `Open — share the code. (${r ? `${r.open} of ${r.all} relays` : 'relays'} reachable)`));
    else if (v.status === 'connecting') statusEl.appendChild(statusLine(v.relayWarned ? 'bad' : 'wait', v.relayWarned ? 'Still can\'t reach any relay — friends won\'t find this voyage until it can. Check your connection.' : `Reaching the meeting place…${r?.all ? ` (${r.open} of ${r.all} relays)` : ''}`));
    else if (v.over) statusEl.appendChild(statusLine('bad', errorText(v.error, { code: showCode(v.code) }).text));
    clear(crewEl);
    crewEl.appendChild(crewList(v));
    sail.disabled = v.over;
  });
}

/** Looking for a friend's voyage. */
export function joinSearch(ui, v, { onBack }) {
  const statusEl = h('div');
  const el = h('div.screen', h('div.panel.vy-lobby',
    h('h2', 'Joining a voyage'),
    codePlate(v.code, true),
    statusEl,
    h('div.vy-btns', h('button.btn', { on: { click: () => onBack() } }, 'Cancel'))));
  ui.showScreen(el);
  const t0 = performance.now();
  follow(v, el, () => {
    clear(statusEl);
    const s = Math.round((performance.now() - t0) / 1000), r = v.relays;
    const relays = v.kind === 'local' ? '' : r?.all ? ` · ${r.open} of ${r.all} relays reachable` : ' · reaching the relays';
    statusEl.appendChild(statusLine('wait', `Looking for the host… ${s} s${relays}`));
  });
}

/** Aboard (the host has welcomed you): which of your pirates comes along. */
export function joinPick(ui, v, { slots, onBring, onNew, onBack }) {
  const head = h('p.muted'), list = h('div.vy-slots.wide');
  const el = h('div.screen', h('div.panel.vy-lobby',
    h('h2', `Aboard ${v.hostName || 'the host'}'s voyage`),
    head,
    h('h3', 'Which pirate do you bring?'),
    list,
    h('p.muted.vy-note', 'Your pirate keeps their own save: whatever they find, earn and learn is theirs. The host\'s world sets the day, the hour and the weather.'),
    h('div.vy-btns', h('button.btn', { on: { click: () => onBack() } }, 'Leave'))));
  ui.showScreen(el);
  follow(v, el, () => {
    const aboard = v.crew().filter((m) => !m.you).map((m) => m.name + (m.host ? ' (host)' : ''));
    head.textContent = v.hostEnv ? `Day ${v.hostEnv.day} · aboard: ${aboard.join(', ') || 'nobody yet'}` : `Aboard: ${aboard.join(', ')}`;
    if (list.childNodes.length) {
      // (only the "in use in another tab" marks can change)
      const busy = v.busySlots();
      list.querySelectorAll('button[data-slot]').forEach((b) => { const s = +b.dataset.slot; b.disabled = busy.has(s); b.title = busy.has(s) ? 'Being played in another tab of this browser' : ''; });
      return;
    }
    const busy = v.busySlots();
    for (const s of slots) {
      const used = busy.has(s.slot);
      const btn = s.char
        ? h('button.btn.gold.small', { on: { click: () => onBring(s.slot) } }, `Bring ${s.char.name.split(' ')[0]}`)
        : h('button.btn.red.small', { on: { click: () => onNew(s.slot) } }, s.empty ? 'Begin a lineage' : `Begin generation ${s.legacy?.generation || 1}`);
      btn.dataset.slot = String(s.slot);
      btn.disabled = used;
      if (used) btn.title = 'Being played in another tab of this browser';
      list.appendChild(slotRow(s, btn));
    }
  });
}

/** Something went wrong (no voyage with that code, the host left…). */
export function voyageError(ui, err, { code, host, onRetry, onBack }) {
  const { title, text } = errorText(err, { code: showCode(code), host });
  ui.showScreen(h('div.screen', h('div.panel.vy-lobby',
    h('h2', title),
    h('p', text),
    h('div.vy-btns',
      onRetry ? h('button.btn.gold', { on: { click: () => onRetry() } }, 'Try again') : null,
      h('button.btn', { on: { click: () => onBack() } }, 'Back')))));
}
