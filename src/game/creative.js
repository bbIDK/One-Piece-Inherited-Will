// Creative mode (turned on in the pause menu): fly anywhere (double-tap Space;
// Space rises, C sinks, Shift goes fast, and nothing is solid), come to no
// harm, see the whole chart and travel by clicking it — and a command line
// (press /) for the rest: moving time and weather, handing out things,
// calling up foes to fight.
import { ITEMS } from '../data/items.js';
import { addItem, earn } from './inventory.js';
import { makeEnemy } from './npcs.js';
import { findShore } from './interact.js';
import { h } from '../ui/dom.js';

const HELP = [
  'fly — take off or land (or double-tap Space)',
  'tp <island> — go to an island (part of its name will do)',
  'tp <x> <y> — go to a spot on the chart',
  'time <0-24> — set the hour',
  'weather clear | rain | storm — change the weather',
  'give <item> [how many] — e.g. give meat 5',
  'berries <amount>',
  'heal — full health and air',
  'spawn <bandit | pirate | marine | brute> [level] — someone to fight',
  'speed <1-5> — how fast you fly',
  'creative off — back to normal play',
];

export function installCreative(game) {
  const FULL = { fog: null };
  const C = {
    on: false,
    speed: 1,

    /** Turn creative mode on or off. */
    set(on, quiet = false) {
      const p = game.player;
      C.on = !!on;
      if (game.state?.char) game.state.char.creative = C.on;
      if (p) {
        p.invulnerable = C.on;
        if (!C.on && p.flying) C.land();
      }
      // the chart: all of it, or back to what you've explored
      const w = game.surface;
      if (w?.fog && game.renderer?.terrain) {
        if (C.on) {
          if (!FULL.fog || FULL.fog.length !== w.fog.length) FULL.fog = new Uint8Array(w.fog.length).fill(255);
          game.renderer.terrain.updateFog(FULL.fog);
        } else game.renderer.terrain.updateFog(w.fog);
      }
      if (!quiet) game.ui?.toast(C.on ? 'CREATIVE MODE' : 'CREATIVE MODE OFF', C.on ? 'Double-tap Space to fly · / for commands · click the chart (M) to travel' : 'Back to the game as it is.', '#80deea', 'creative');
    },

    fly() {
      const p = game.player;
      if (!p || !C.on || p.mode !== 'foot') return;
      if (p.flying) { C.land(); return; }
      if (p.inWater) p.leaveWater?.(game);
      if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
      p.flying = true;
      p.alt = null;
      p.vz = 0;
      game.log('Flying. Space rises, C sinks, Shift to go fast. Double-tap Space to land.', '#80deea');
    },
    land() {
      const p = game.player;
      if (!p) return;
      p.flying = false;
      p.alt = null;
      p.vz = -1;
    },

    /** Go to (x, y): onto dry land if there's some nearby. */
    teleport(x, y) {
      const p = game.player, w = game.world;
      if (!p) return;
      if (p.mode === 'sail' && p.ship) { p.ship.captain = null; p.onShip = false; p.mode = 'foot'; }
      const spot = w.walkable(x, y) ? { x, y } : findShore(w, x, y, 12);
      p.x = w.wx(spot ? spot.x : x); p.y = spot ? spot.y : y;
      p.vx = p.vy = 0; p.kb.x = p.kb.y = 0; p.dash = null;
      if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
      if (!spot && !p.flying) C.fly();
      game.snapCamera();
    },

    /** Run a command line; returns what to say back. */
    run(line) {
      const [cmd, ...args] = line.trim().replace(/^\//, '').split(/\s+/);
      const c = game.state?.char, p = game.player, w = game.world, env = game.env;
      if (!cmd) return '';
      if (cmd === 'help') return HELP.join('\n');
      if (cmd === 'creative') { C.set(args[0] !== 'off'); return C.on ? 'Creative mode on.' : 'Creative mode off.'; }
      if (!C.on) return 'Turn on creative mode in the pause menu (Esc) to use commands.';
      if (!p || !c) return 'Start a life first.';
      switch (cmd) {
        case 'fly': C.fly(); return p.flying ? 'Flying.' : 'Landed.';
        case 'tp': {
          if (args.length >= 2 && !isNaN(+args[0]) && !isNaN(+args[1])) { C.teleport(+args[0], +args[1]); return `Off to ${Math.round(p.x)}, ${Math.round(p.y)}.`; }
          const q = args.join(' ').toLowerCase();
          if (!q) return 'tp <island name> — or tp <x> <y>';
          const isl = w.islands.filter((i) => i.name).find((i) => i.name.toLowerCase() === q) || w.islands.find((i) => i.name && i.name.toLowerCase().includes(q));
          if (!isl) return `No island called "${q}".`;
          const town = isl.towns?.[0];
          C.teleport(town ? town.x ?? isl.x : isl.x, town ? town.y ?? isl.y : isl.y);
          return `Welcome to ${isl.name}.`;
        }
        case 'time': {
          const t = +args[0];
          if (!(t >= 0 && t <= 24)) return 'time <0-24>';
          env.clock = t % 24;
          return `It's ${env.clockString()}.`;
        }
        case 'weather': {
          const k = { clear: 0, sun: 0, rain: 0.45, squall: 0.45, storm: 0.95 }[args[0]];
          if (k === undefined) return 'weather clear | rain | storm';
          env.stormTarget = k; env.storm = k; env.weatherTimer = 240;
          return `The weather turns: ${args[0]}.`;
        }
        case 'give': {
          const q = (args[0] || '').toLowerCase();
          const id = ITEMS[q] ? q : Object.keys(ITEMS).find((k) => k.includes(q) || ITEMS[k].name.toLowerCase().includes(q.replace(/_/g, ' ')));
          if (!id) return `No item like "${q}".`;
          const n = Math.max(1, Math.min(99, parseInt(args[1], 10) || 1));
          addItem(game, id, n);
          return `Gave you ${n} × ${ITEMS[id].name}.`;
        }
        case 'berries': {
          const n = Math.round(+args[0]);
          if (!(n > 0)) return 'berries <amount>';
          earn(game, n, 'creative');
          return '';
        }
        case 'heal':
          p.hp = p.d.maxHp; p.oxygen = p.maxOxygen; p.status = {};
          return 'Good as new.';
        case 'speed': {
          const s = +args[0];
          if (!(s >= 0.5 && s <= 5)) return 'speed <1-5>';
          C.speed = s;
          return `Flying speed ×${s}.`;
        }
        case 'spawn': {
          const arch = { bandit: 'bandit', pirate: 'pirate', marine: 'marine', brute: 'brute', gunner: 'pirate_gunner' }[args[0] || 'bandit'] || args[0];
          const lvl = Math.max(1, Math.min(90, parseInt(args[1], 10) || 5));
          let a;
          try { a = makeEnemy(arch, lvl, w.wx(p.x + Math.cos(p.facing) * 4), p.y + Math.sin(p.facing) * 4, {}); } catch (e) { return `Can't spawn "${args[0]}".`; }
          a.game = game;
          game.addActor(a);
          return `A level ${lvl} ${a.name} appears!`;
        }
        default: return `Unknown command "${cmd}". Type help for the list.`;
      }
    },
  };

  // --- the command line: press / to open it -----------------------------------
  const ui = game.ui;
  const out = h('div.cmd-out');
  const input = h('input.cmd-in', { type: 'text', spellcheck: false, autocomplete: 'off', placeholder: 'Type a command — help for the list' });
  const box = h('div.cmd-box.hidden', out, input);
  ui.root.appendChild(box);
  const history = [];
  let hi = 0;
  C.openConsole = () => {
    if (!game.player || C.consoleOpen) return;
    C.consoleOpen = true;
    box.classList.remove('hidden');
    ui.consoleOpen = true;
    game.view3d?.rig.releaseLock?.();
    input.value = '';
    setTimeout(() => input.focus(), 0);
    if (!out.childNodes.length) out.appendChild(h('div', C.on ? 'Creative commands — type help for the list. Esc closes.' : 'Commands work in creative mode (pause menu, Esc).'));
  };
  C.closeConsole = () => {
    C.consoleOpen = false;
    ui.consoleOpen = false;
    box.classList.add('hidden');
    input.blur();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { C.closeConsole(); return; }
    if (e.key === 'ArrowUp') { if (history.length) { hi = Math.max(0, hi - 1); input.value = history[hi]; } e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { hi = Math.min(history.length, hi + 1); input.value = history[hi] || ''; e.preventDefault(); return; }
    if (e.key !== 'Enter') return;
    const line = input.value;
    input.value = '';
    if (!line.trim()) { C.closeConsole(); return; }
    history.push(line); hi = history.length;
    out.appendChild(h('div.me', '> ' + line));
    const res = C.run(line);
    if (res) for (const l of res.split('\n')) out.appendChild(h('div', l));
    while (out.childNodes.length > 14) out.firstChild.remove();
    out.scrollTop = out.scrollHeight;
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());

  game.creative = C;
  game.on('characterStart', () => {
    if (C.consoleOpen) C.closeConsole();
    C.set(!!game.state?.char?.creative, true);
  });
  // the chart stays fully drawn while creative mode is on
  C.fullFog = () => FULL.fog;
  return C;
}
