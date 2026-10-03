// The creative panel (F1, or the pause menu, while creative mode is on):
// everything there is to try out, a click away. Hand yourself any Devil Fruit
// (it goes in your bag, to be eaten the usual way) or any item, be someone of
// another race, set your Haki, attributes, bounty and reputation, call up
// foes, bosses, ships and sea life, and move about the world and its weather.
// The work is done in game/creative.js; this is the parchment over it.
import { h, clear, add } from './dom.js';
import { itemImg, uiImg } from './icon.js';
import { portrait } from './screens.js';
import { statLine } from './panels.js';
import { fmtDist } from './compass.js';
import { ITEMS } from '../data/items.js';
import { FRUITS, FRUIT_RARITY } from '../data/fruits.js';
import { RACES, RARITY, MINK_KINDS, FISHMAN_KINDS, raceLabel } from '../data/races.js';
import { HAKI } from '../data/haki.js';
import { SHIPS } from '../data/ships.js';
import { ZONES } from '../data/zones/index.js';
import { ATTRS, ATTR_KEYS, ATTR_CAP } from '../game/stats.js';
import { equippedLook } from '../game/lineage.js';
import { count } from '../game/inventory.js';
import { ARCHETYPES, allNpcDefs } from '../game/npcs.js';
import { fruitWhere } from '../game/creative.js';
import { FISH } from '../game/sealife.js';
import { repTier } from '../game/reputation.js';
import { regionAt, REGION_INFO } from '../world/constants.js';
import { formatBerries } from '../core/math.js';

const TABS = [
  { id: 'fruits', name: 'Devil Fruits', icon: 'fruit' },
  { id: 'items', name: 'Items', icon: 'inventory' },
  { id: 'char', name: 'Character', icon: 'character' },
  { id: 'spawn', name: 'Spawn', icon: 'combat' },
  { id: 'world', name: 'World', icon: 'map' },
];
const FRUIT_TYPE = { Paramecia: '#7b4a9e', Zoan: '#2e7d32', Logia: '#1565c0' };
// (a Special Paramecia is a Paramecia, a Mythical Zoan a Zoan)
const baseType = (t) => Object.keys(FRUIT_TYPE).find((k) => t.includes(k)) || 'Paramecia';
const ITEM_CATS = [
  ['all', 'All'], ['weapon', 'Weapons'], ['hat', 'Headgear'], ['coat', 'Body'], ['accessory', 'Accessories'], ['food', 'Food'], ['medicine', 'Medicine'],
  ['dial', 'Dials'], ['pose', 'Poses'], ['key', 'Key items'], ['treasure', 'Treasure'], ['material', 'Materials'],
];
const TYPE_NAME = { weapon: 'Weapon', hat: 'Headgear', coat: 'Body', accessory: 'Accessory', food: 'Food', medicine: 'Medicine', dial: 'Dial', pose: 'Pose', key: 'Key item', treasure: 'Treasure', material: 'Material' };
// foes by who they fight for
const FACTION_GROUP = { pirate: 'Pirates', marine: 'Marines & the Government', cp: 'Marines & the Government', bandit: 'Bandits, gangs & rivals', baroque: 'Bandits, gangs & rivals', rival: 'Bandits, gangs & rivals', zombie: 'Bandits, gangs & rivals', civilian: 'Bandits, gangs & rivals', beast: 'Beasts' };
const SHIP_KINDS = [['pirate', 'Pirate'], ['marine', 'Marine'], ['merchant', 'Merchant'], ['fishing', 'Fishing boat']];
const SEA_HUNTERS = [
  ['seaking', 'Sea King', 'A monster of the Calm Belt: it goes for your ship, or for you in the water.'],
  ['seacow', 'Sea Cow', 'Hunts swimmers in the Blues — hurt it badly and it bolts.'],
  ['fightfish', 'Fighting Fish', 'Charges swimmers horn-first in the Grand Line.'],
];
const SEA_LIFE = {
  reef: 'Bright reef fish (grab one with an attack, swimming)', sardine: 'A wheeling shoal of sardines', flying: 'Flying fish that leap and glide',
  elephant: 'The giant tuna with a trunk: the finest eating in the sea', seaking_fry: 'A string of baby Sea Kings', seacat: 'A Sea Cat paddling along', yagara: 'A Yagara Bull, grazing the shallows',
};
// a jump's height (m) from its take-off speed (actor.js: gravity 22 m/s²)
const jumpM = (v) => (v * v) / 44;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// where you left the panel (its tab, searches and choices), for next time
const S = { tab: 'fruits', fq: '', ftype: 'all', iq: '', icat: 'all', n: 1, sub: 'foes', lvl: 10, foes: 1, bq: '', kind: 'pirate', type: 'caravel', hostile: false, wq: '', berries: 100000 };

/** Open the creative panel (or close it, if it's open). Only in creative mode. */
export function openCreative(game, tab) {
  const ui = game.ui, C = game.creative;
  if (!C?.on || !game.player || !game.state?.char) return null;
  if (tab) S.tab = tab;
  const body = h('div.cr');
  // (the world waits while you pick what to try out)
  const entry = ui.openPanel(body, { wide: true, id: 'creative', pause: true });
  if (!entry) return null;
  entry.panel.classList.add('cr-wrap');
  const close = () => ui.closePanel(entry);
  const note = h('div.cr-note', 'F1 or Esc closes the panel. The game waits while it is open.');
  // what the last click did (an empty answer says nothing)
  const say = (msg) => {
    if (!msg) return;
    note.textContent = msg;
    note.classList.remove('flash'); void note.offsetWidth; note.classList.add('flash');
  };
  const tabs = h('div.tabs.icon-tabs.cr-tabs');
  const main = h('div.cr-main');
  add(body, h('div.cr-head', h('h2', uiImg('star', 30), 'Creative'), h('span.muted', 'Everything there is to try out, a click away.')), tabs, main, note);
  // (typing in a field, the game hears no keys: F1 and Esc still close the panel)
  const keys = (e) => { if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); close(); } };
  const ctx = { game, C, say, close, keys, rerender: () => render() };
  let shown = null;
  const render = () => {
    clear(tabs);
    for (const t of TABS) tabs.appendChild(h('button' + (S.tab === t.id ? '.on' : ''), { on: { click: () => { S.tab = t.id; render(); } } }, uiImg(t.icon, 18), t.name));
    // (drawn again after a change, a tab stays scrolled where it was)
    const fresh = shown !== S.tab, top = fresh ? 0 : main.scrollTop;
    shown = S.tab;
    clear(main);
    main.appendChild(({ fruits: fruitsTab, items: itemsTab, char: charTab, spawn: spawnTab, world: worldTab }[S.tab] || fruitsTab)(ctx));
    main.scrollTop = top;
    // (a new tab's search box is ready to type in — not on a touch screen, where it would pop the keyboard up)
    const q = fresh && main.querySelector('input.cr-search');
    if (q && !game.input.touch?.on) setTimeout(() => q.focus({ preventScroll: true }), 0);
  };
  render();
  return entry;
}

// ------------------------------------------------------------- widgets
const search = (ctx, value, placeholder, set) => h('input.cr-search', {
  type: 'search', value, placeholder, spellcheck: false, autocomplete: 'off',
  on: { input: (e) => set(e.target.value), keydown: ctx.keys },
});
/** A row of choices, the current one lit. */
const chips = (opts, cur, pick, cls = '') => h('div.cr-chips' + cls, opts.map(([v, label, style]) => h('button.cr-chip' + (v === cur ? '.on' : ''), { style, on: { click: () => pick(v) } }, label)));
/**
 * A slider with its value, set as it moves (`fmt` shows the value); `done`
 * runs once it's let go.
 */
function slider(name, min, max, step, value, set, { fmt = (v) => v, done = null, title = '' } = {}) {
  const val = h('span.val', String(fmt(value)));
  const input = h('input', { type: 'range', min, max, step, value, on: {
    input: (e) => { const v = Number(e.target.value); set(v); val.textContent = String(fmt(v)); },
    change: () => done?.(),
  } });
  return h('div.cr-slider', { title }, h('span.nm', name), input, val);
}
const section = (icon, title, ...kids) => h('div.cr-sec', h('h4', uiImg(icon, 20), title), ...kids);
const matches = (q, ...texts) => { q = q.trim().toLowerCase(); return !q || texts.some((t) => String(t || '').toLowerCase().includes(q)); };

// -------------------------------------------------------- Devil Fruits
function fruitsTab(ctx) {
  const { game, C, say } = ctx;
  const c = game.state.char;
  const el = h('div');
  const yours = h('div.cr-yours');
  const list = h('div.cr-grid.fruits');
  const drawYours = () => {
    clear(yours);
    const f = FRUITS[c.fruit];
    if (!f) {
      add(yours, uiImg('fruit', 34, '.ghost'), h('div.grow', h('b', 'You haven\'t eaten a Devil Fruit.'),
        h('div.sub', 'Give yourself one below: it goes in your bag. Eat it from the Inventory (Tab) — or put it on your hotbar, take it in hand with its key and hold the right mouse button.')));
      return;
    }
    // (its base set is all yours; mastery opens its forms — on the hotbar as they open)
    const forms = () => {
      const open = (f.forms || []).filter((F) => (c.fruitMastery || 0) >= F.mastery).map((F) => F.name);
      const shut = (f.forms || []).filter((F) => (c.fruitMastery || 0) < F.mastery).map((F) => `${F.name} at ${F.mastery}`);
      return `${f.techniques.length} techniques${open.length ? ' · open: ' + open.join(', ') : ''}${shut.length ? ' · ' + shut.join(', ') : ''}`;
    };
    const techs = h('span.sub', forms());
    const awake = h('button.btn' + (c.fruitAwakened ? '.gold' : ''), {
      title: 'Awaken it now (its awakened set goes on the hotbar, to switch on and off) — or take the awakening away again',
      on: { click: () => { C.setFruitAwakened(!c.fruitAwakened); say(c.fruitAwakened ? `The ${f.name} has awakened: ${f.awakening.name} is on your hotbar.` : `The ${f.name}'s awakening is gone.`); drawYours(); } },
    }, c.fruitAwakened ? `Awakened: ${f.awakening.name}` : 'Awaken it');
    add(yours, itemImg('fruit_' + c.fruit, 44), h('div.grow',
      h('b', `Your power: ${f.name}`), h('span.tag', { style: { background: FRUIT_TYPE[baseType(f.type)] } }, f.type),
      slider('Mastery', 0, 100, 1, Math.floor(c.fruitMastery || 0), (v) => { C.setFruitMastery(v); techs.textContent = forms(); },
        { title: 'Its base techniques are all yours; mastery makes them hit harder and opens its forms (one that needs Haki, once Haki awakens).' }),
      techs),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, awake,
      h('button.btn.red', { title: 'Take the power away, to eat another fruit — or this one again', on: { click: () => { say(C.removeFruit()); drawYours(); drawList(); } } }, 'Remove its power')));
  };
  const drawList = () => {
    clear(list);
    for (const [id, f] of Object.entries(FRUITS)) {
      if (S.ftype !== 'all' && baseType(f.type) !== S.ftype) continue;
      if (!matches(S.fq, f.name, f.en, f.type, id)) continue;
      const where = fruitWhere(game, id) || { kind: 'free' };
      const status = {
        eaten: 'Your power', bag: 'In your bag', world: `Growing on ${where.island} (giving it brings it to you)`,
        picked: `Picked on ${where.island}: it won't grow again`, npc: `${where.name}'s power (you get a copy)`,
        taken: 'Out in the world, or gone', free: 'Not in the world yet',
      }[where.kind];
      const have = where.kind === 'eaten' || where.kind === 'bag';
      const rar = FRUIT_RARITY[f.rarity];
      list.appendChild(h('div.cr-card' + (have ? '.have' : ''), { title: f.desc },
        itemImg('fruit_' + id, 44),
        h('div.grow',
          h('b', f.name), h('div.sub', f.en),
          h('div.tags', h('span.tag', { style: { background: FRUIT_TYPE[baseType(f.type)] } }, f.type), h('span.tag', { style: { background: rar?.color, color: '#222' } }, rar?.label)),
          h('div.sub.where', status)),
        h('button.btn' + (have ? '' : '.gold'), { disabled: have, on: { click: () => { say(C.giveFruit(id)); drawList(); } } }, have ? (where.kind === 'eaten' ? 'Eaten' : 'In bag') : 'Give')));
    }
    if (!list.childNodes.length) list.appendChild(h('p.muted', 'No Devil Fruit like that.'));
  };
  const n = (t) => Object.values(FRUITS).filter((f) => t === 'all' || baseType(f.type) === t).length;
  const types = ['all', ...Object.keys(FRUIT_TYPE)].map((t) => [t, `${t === 'all' ? 'All' : t} ${n(t)}`]);
  const typeChips = h('div');
  const drawTypes = () => { clear(typeChips); typeChips.appendChild(chips(types, S.ftype, (v) => { S.ftype = v; drawTypes(); drawList(); })); };
  drawYours(); drawTypes(); drawList();
  add(el, yours, h('div.cr-bar', search(ctx, S.fq, 'Search fruits — name, English name or type', (v) => { S.fq = v; drawList(); }), typeChips), list);
  return el;
}

// ---------------------------------------------------------------- Items
function itemsTab(ctx) {
  const { game, C, say } = ctx;
  const c = game.state.char;
  const el = h('div');
  // every item but the Devil Fruits (they have a tab of their own, with their rules)
  const all = Object.entries(ITEMS).filter(([, d]) => d.type !== 'fruit');
  const inCat = (id) => (id === 'all' ? all.length : all.filter(([, d]) => d.type === id).length);
  const cats = ITEM_CATS.filter(([id]) => inCat(id)).map(([id, name]) => [id, `${name} ${inCat(id)}`]);
  const purse = h('b.cr-purse', formatBerries(c.berries));
  const amount = h('input.cr-num', { type: 'number', min: 0, step: 1000, value: S.berries, on: { input: (e) => { S.berries = Math.max(0, Math.round(Number(e.target.value) || 0)); }, keydown: ctx.keys } });
  const money = (fn) => () => { fn(); purse.textContent = formatBerries(c.berries); };
  const berries = h('div.cr-sec.cr-money',
    h('h4', uiImg('berries', 20), 'Berries ', purse),
    h('div.cr-row-wrap',
      ...[10000, 100000, 1000000, 100000000].map((n) => h('button.btn.small', { on: { click: money(() => { c.berries += n; say(`+${formatBerries(n)}.`); }) } }, `+${formatBerries(n)}`)),
      amount,
      h('button.btn.small.gold', { on: { click: money(() => { c.berries += S.berries; say(`+${formatBerries(S.berries)}.`); }) } }, 'Add'),
      h('button.btn.small', { on: { click: money(() => { c.berries = S.berries; say(`Your purse holds ${formatBerries(c.berries)}.`); }) } }, 'Set to')));
  const list = h('div.cr-grid.items');
  const drawList = () => {
    clear(list);
    for (const [id, d] of all) {
      if (S.icat !== 'all' && d.type !== S.icat) continue;
      if (!matches(S.iq, d.name, id, TYPE_NAME[d.type], d.kind, d.grade)) continue;
      const have = count(c, id);
      list.appendChild(h('div.cr-item', { title: d.desc || d.name },
        itemImg(id, 34),
        h('div.grow', h('b', d.name), h('div.sub', [TYPE_NAME[d.type] || d.type, statLine(d)].filter(Boolean).join(' · ')), have ? h('div.sub.where', `You have ${have}`) : null),
        h('button.btn.small.gold', { on: { click: () => { say(C.giveItem(id, S.n)); drawList(); } } }, S.n > 1 ? `Give ${S.n}` : 'Give')));
    }
    if (!list.childNodes.length) list.appendChild(h('p.muted', 'No item like that.'));
  };
  const opts = h('div');
  const drawOpts = () => {
    clear(opts);
    add(opts, chips(cats, S.icat, (v) => { S.icat = v; drawOpts(); drawList(); }),
      h('div.cr-row-wrap', h('span.lbl', 'How many'), chips([1, 5, 10, 25, 99].map((n) => [n, String(n)]), S.n, (v) => { S.n = v; drawOpts(); drawList(); }, '.inline')));
  };
  drawOpts(); drawList();
  add(el, berries, h('div.cr-bar', search(ctx, S.iq, 'Search items — name, kind or grade', (v) => { S.iq = v; drawList(); }), opts), list);
  return el;
}

// ------------------------------------------------------------ Character
function charTab(ctx) {
  const { game, C, say } = ctx;
  const c = game.state.char, p = game.player;
  const el = h('div.cr-cols');
  // ------------------------------------------------------------ race
  const race = RACES[c.race] || RACES.human;
  const body = () => {
    const J = p.jumpStats();
    return [`Jumps ${jumpM(J.v).toFixed(1)} m (${jumpM(J.v * J.charge).toFixed(1)} m charged)`, `swims ×${p.canSwimRace}`,
      p.gills ? 'breathes water' : `${Math.round(p.maxOxygen)} s of breath`, p.reach !== 1 ? `reach ×${p.reach}` : null,
      `health ${p.d.maxHp}`, `speed ${p.d.speed.toFixed(1)}`, (p.look.scale || 1) !== 1 ? `${p.look.scale}× size` : null].filter(Boolean).join(' · ');
  };
  const kinds = c.race === 'mink' ? MINK_KINDS : c.race === 'fishman' ? FISHMAN_KINDS : null;
  const raceSec = section('character', 'Race',
    h('div.cr-race',
      portrait(equippedLook(c), 96, 112),
      h('div.grow',
        h('div.cr-race-name', raceLabel(c.look), h('span.tag', { style: { background: RARITY[race.rarity].color, color: '#222' } }, RARITY[race.rarity].label)),
        ...race.traits.map((t) => h('div.li', t)),
        h('div.sub.cr-body', body()))),
    chips(Object.entries(RACES).map(([id, R]) => [id, R.name, { borderColor: RARITY[R.rarity].color }]), c.race, (v) => { say(C.setRace(v)); ctx.rerender(); }),
    kinds ? h('div.cr-row-wrap', h('span.lbl', c.race === 'mink' ? 'Kind of Mink' : 'Kind of Fish-Man'), chips(kinds.map((k) => [k.name, k.name]), c.look.kind, (v) => { C.setKind(v); ctx.rerender(); }, '.inline')) : null,
    h('p.muted', 'Your model, attributes, lives and the race\'s gifts (jumping, swimming, breathing, reach) change at once.'));
  // ------------------------------------------------------------ health
  const lives = h('span', `Lives ${c.lives}/${c.maxLives} · second winds ${c.getUpCharges || 0}`);
  const healSec = section('heart', 'Health',
    h('div.cr-row-wrap',
      h('button.btn.green', { on: { click: () => say(C.heal()) } }, 'Heal: health, air, spirit'),
      h('button.btn', { on: { click: () => { say(C.restoreLives()); lives.textContent = `Lives ${c.lives}/${c.maxLives} · second winds ${c.getUpCharges || 0}`; } } }, uiImg('lives', 18), 'Restore lives'),
      lives));
  // ------------------------------------------------------------ haki
  const hakiSec = section('haki', 'Haki',
    ...Object.entries(HAKI).map(([k, d]) => slider(d.name.replace(' Haki', ''), 0, 100, 1, Math.floor(c.haki[k] || 0), (v) => C.setHaki(k, v),
      { fmt: (v) => (v ? v : 'asleep'), title: d.desc, done: () => ctx.rerender() })),
    h('p.muted', `Above 0 a Haki is awakened (${['R', 'T', 'G'].join(' / ')}), with the techniques its level opens.`));
  // ------------------------------------------------------------ attributes
  const derived = h('div.derived');
  const showDerived = () => { derived.textContent = `Doriki ${p.power().toLocaleString()} · health ${p.d.maxHp} · damage ×${p.d.dmg.toFixed(2)} · defence ${Math.round(p.d.def * 100)}% · speed ${p.d.speed.toFixed(1)}`; };
  showDerived();
  const attrSec = section('stats', 'Attributes',
    ...ATTR_KEYS.map((k) => slider(ATTRS[k].name, 1, ATTR_CAP, 1, c.attrs[k], (v) => { C.setAttr(k, v); showDerived(); }, { title: ATTRS[k].desc })),
    h('div.cr-row-wrap', h('span.lbl', 'All at level'), chips([5, 10, 20, 40, 60, 80, 100].map((n) => [n, String(n)]), null, (v) => { C.setLevel(v); say(`Every attribute at ${v}.`); ctx.rerender(); }, '.inline')),
    derived);
  // ------------------------------------------------------- bounty, reputation
  const tier = h('span.rep-name');
  const showTier = () => { const t = repTier(c.reputation || 0); tier.textContent = t.name; tier.style.color = t.color; };
  showTier();
  const bounty = h('input.cr-num', { type: 'number', min: 0, step: 1000000, value: c.bounty || 0, on: { change: (e) => { C.setBounty(Number(e.target.value)); e.target.value = c.bounty; say(`Bounty ${formatBerries(c.bounty)}.`); }, keydown: ctx.keys } });
  const fameSec = section('bounty', 'Bounty & reputation',
    c.faction === 'marine' ? h('p.muted', 'Marines carry no bounty — desert, or turn pirate, first.') : h('div.cr-row-wrap',
      bounty,
      ...[0, 3000000, 30000000, 300000000, 1500000000].map((n) => h('button.btn.small', { on: { click: () => { C.setBounty(n); bounty.value = c.bounty; say(n ? `Bounty ${formatBerries(c.bounty)}.` : 'No bounty on your head.'); } } }, n ? formatBerries(n) : 'None'))),
    slider('Reputation', 0, 100, 1, Math.round(c.reputation || 0), (v) => { C.setRep(v); showTier(); }),
    h('div.cr-row-wrap', h('span.lbl', 'Standing:'), tier));
  add(el, h('div.cr-col', raceSec, healSec), h('div.cr-col', hakiSec, attrSec, fameSec));
  return el;
}

// ---------------------------------------------------------------- Spawn
function spawnTab(ctx) {
  const { game, C } = ctx;
  const el = h('div');
  const SUBS = [['foes', 'Foes'], ['bosses', 'Bosses'], ['ships', 'Ships'], ['sea', 'Sea life']];
  const sub = h('div');
  const level = slider('Level', 1, 120, 1, S.lvl, (v) => { S.lvl = v; }, { title: 'How strong (an enemy\'s level is about their attributes)' });
  // (the Clear button counts what's still about)
  const clearBtn = h('button.btn.small.red', { on: { click: () => say(C.clearSpawned()) } });
  const counted = () => { const n = [...C.spawned].filter((o) => o.alive !== false).length; clearBtn.textContent = `Clear all you called up${n ? ` (${n})` : ''}`; clearBtn.disabled = !n; };
  const say = (msg) => { ctx.say(msg); counted(); };
  counted();
  const draw = () => {
    clear(sub);
    if (S.sub === 'foes') {
      const groups = {};
      for (const [id, A] of Object.entries(ARCHETYPES)) (groups[FACTION_GROUP[A.faction] || 'Bandits, gangs & rivals'] ||= []).push([id, A]);
      add(sub, h('div.cr-row-wrap', level, h('span.lbl', 'How many'), chips([1, 2, 3, 5].map((n) => [n, String(n)]), S.foes, (v) => { S.foes = v; draw(); }, '.inline')),
        h('p.muted', 'They appear in front of you and come for you as soon as the panel closes.'));
      for (const g of ['Pirates', 'Marines & the Government', 'Bandits, gangs & rivals', 'Beasts']) {
        if (!groups[g]) continue;
        add(sub, h('h4.grp', g), h('div.cr-grid.foes', groups[g].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, A]) => h('button.cr-foe', {
          title: `${A.name} — ${A.style || 'brawler'}${A.weapon ? ', ' + A.weapon : ''}`,
          on: { click: () => say(C.spawnFoe(id, S.lvl, S.foes)) },
        }, h('b', A.name), h('span.sub', [A.race ? RACES[A.race]?.name : null, A.weapon || A.beast || null, A.ranged ? 'ranged' : null].filter(Boolean).join(' · ') || A.style)))));
      }
    } else if (S.sub === 'bosses') {
      const names = islandNames(game);
      const list = h('div.cr-grid.bosses');
      const bosses = allNpcDefs().filter((d) => d.boss).sort((a, b) => (a.level ?? 6) - (b.level ?? 6) || a.name.localeCompare(b.name));
      const drawList = () => {
        clear(list);
        for (const d of bosses) {
          const isl = names[d.island] || cap(String(d.island || '').replace(/_/g, ' '));
          if (!matches(S.bq, d.name, d.title, isl, d.fruit && FRUITS[d.fruit]?.name)) continue;
          list.appendChild(h('div.cr-item', { title: d.title || '' },
            d.fruit && FRUITS[d.fruit] ? itemImg('fruit_' + d.fruit, 30) : uiImg(d.faction === 'marine' ? 'marine' : 'bounty', 30),
            h('div.grow', h('b', d.name), h('div.sub', [d.title, isl].filter(Boolean).join(' · '))),
            h('span.cr-lv', `Lv ${d.level ?? 6}`),
            h('button.btn.small.red', { on: { click: () => say(C.spawnBoss(d.id)) } }, 'Fight')));
        }
        if (!list.childNodes.length) list.appendChild(h('p.muted', 'No boss like that.'));
      };
      drawList();
      add(sub, h('div.cr-bar', search(ctx, S.bq, 'Search bosses — name, title, island or fruit', (v) => { S.bq = v; drawList(); })),
        h('p.muted', 'A boss comes for you at their own level, with their moves, fruit and Haki. It\'s a stand-in: the real one keeps their place in the story.'), list);
    } else if (S.sub === 'ships') {
      const fighter = S.kind === 'pirate' || S.kind === 'marine';
      add(sub, h('div.cr-row-wrap', level),
        h('div.cr-row-wrap', h('span.lbl', 'Who'), chips(SHIP_KINDS, S.kind, (v) => { S.kind = v; draw(); }, '.inline')),
        h('div.cr-row-wrap', h('span.lbl', 'Ship'), chips(Object.entries(SHIPS).map(([id, d]) => [id, d.name]), S.type, (v) => { S.type = v; draw(); }, '.inline')),
        h('label.check-row' + (fighter ? '' : '.off'), h('input', { type: 'checkbox', checked: S.hostile && fighter, disabled: !fighter, on: { change: (e) => { S.hostile = e.target.checked; } } }),
          'She comes for you (as if you had fired on her) — or else she sails past, as pirates do unless provoked'),
        h('div.cr-row-wrap', h('button.btn.gold', { on: { click: () => say(C.spawnShip(S.kind, S.type, S.lvl, S.hostile && fighter)) } }, uiImg('ship', 18), `Call up a ${SHIP_KINDS.find((k) => k[0] === S.kind)[1].toLowerCase()} ${SHIPS[S.type].name.toLowerCase()}`)),
        h('p.muted', 'She sails into sight on open water near you, her crew on deck. Board her by jumping across from your own deck, or swim to her and climb her side.'));
    } else {
      const rows = SEA_HUNTERS.map(([id, name, desc]) => h('div.cr-item', uiImg(id === 'seaking' ? 'warning' : 'drop', 30),
        h('div.grow', h('b', name), h('div.sub', desc)),
        h('button.btn.small.red', { on: { click: () => say(C.spawnSea(id, S.lvl)) } }, 'Call up')));
      const life = Object.entries(FISH).map(([id, d]) => h('div.cr-item', uiImg('drop', 30),
        h('div.grow', h('b', cap(d.name.replace(/^an? /, ''))), h('div.sub', SEA_LIFE[id] || '')),
        h('button.btn.small', { on: { click: () => say(C.spawnSea(id)) } }, 'Call up')));
      add(sub, h('div.cr-row-wrap', level), h('h4.grp', 'Hunters of the sea'), h('div.cr-grid.sea', rows),
        h('h4.grp', 'Life in the water'), h('div.cr-grid.sea', life),
        h('p.muted', 'They need water deep enough for them near you — the shore, or out at sea.'));
    }
  };
  draw();
  add(el, h('div.cr-bar', chips(SUBS, S.sub, (v) => { S.sub = v; ctx.rerender(); }), clearBtn), sub);
  return el;
}

/** Island ids to names, on the surface and in the zones. */
function islandNames(game) {
  const out = {};
  for (const z of Object.values(ZONES)) for (const i of z.islands || []) if (i.id && i.name) out[i.id] = i.name;
  for (const i of game.surface?.islands || []) if (i.name) out[i.id] = i.name;
  return out;
}

// ---------------------------------------------------------------- World
function worldTab(ctx) {
  const { game, C, say, close } = ctx;
  const w = game.world, p = game.player, env = game.env;
  const el = h('div.cr-cols');
  // ------------------------------------------------------- teleport
  const list = h('div.cr-list');
  const isles = w.islands.filter((i) => i.name).map((i) => ({ i, sea: w === game.surface ? REGION_INFO[regionAt(i.x, i.y)]?.name || '' : w.name, d: w.distance(p.x, p.y, i.x, i.y) }))
    .sort((a, b) => a.i.name.localeCompare(b.i.name));
  const drawList = () => {
    clear(list);
    for (const { i, sea, d } of isles) {
      // (a town's name finds its island, and goes to that town)
      const town = S.wq.trim() && !matches(S.wq, i.name) ? (i.towns || []).find((t) => matches(S.wq, t.name)) : null;
      if (!town && !matches(S.wq, i.name, sea)) continue;
      const here = game.currentIsland === i;
      list.appendChild(h('div.cr-item' + (here ? '.here' : ''),
        h('div.grow', h('b', town ? `${i.name} — ${town.name}` : i.name), h('div.sub', `${sea} · ${here ? 'you are here' : fmtDist(d) + ' away'}`)),
        h('button.btn.small.gold', { on: { click: () => { close(); game.log(C.toIsland(i, town || undefined), '#80deea'); } } }, 'Go')));
    }
    if (!list.childNodes.length) list.appendChild(h('p.muted', 'No island like that.'));
  };
  drawList();
  const zone = game.world !== game.surface ? game.world.id : null;
  const tpSec = section('map', 'Go to an island',
    search(ctx, S.wq, 'Search islands — name, town or sea', (v) => { S.wq = v; drawList(); }), list,
    h('div.cr-row-wrap', h('span.lbl', 'Elsewhere'),
      ...Object.entries(ZONES).map(([id, z]) => h('button.btn.small' + (zone === id ? '.gold' : ''), { disabled: zone === id, on: { click: () => { close(); game.log(C.toZone(id), '#80deea'); } } }, z.name)),
      zone ? h('button.btn.small', { on: { click: () => { close(); game.log(C.toZone(null), '#80deea'); } } }, 'Back to the surface') : null));
  // ------------------------------------------------------- time, weather
  const time = slider('Hour', 0, 23.75, 0.25, Math.floor(env.clock * 4) / 4, (t) => C.setTime(t), { fmt: () => env.clockString() });
  const wx = env.storm > 0.6 ? 'storm' : env.storm > 0.25 ? 'rain' : 'clear';
  const skySec = section('sun', 'Time & weather',
    time,
    h('div.cr-row-wrap', h('span.lbl', `Day ${env.day}`),
      ...[[6, 'Dawn'], [12, 'Noon'], [18.5, 'Sunset'], [0, 'Midnight']].map(([t, name]) => h('button.btn.small', { on: { click: () => { say(C.setTime(t)); ctx.rerender(); } } }, name))),
    h('div.cr-row-wrap', h('span.lbl', 'Weather'), chips([['clear', 'Clear'], ['rain', 'Rain'], ['storm', 'Storm']], wx, (v) => { say(C.setWeather(v)); ctx.rerender(); }, '.inline')));
  // ------------------------------------------------------- flying, the chart
  const flySec = section('view', 'Getting about',
    h('div.cr-row-wrap',
      h('button.btn', { disabled: p.mode !== 'foot', on: { click: () => { C.fly(); ctx.rerender(); } } }, p.flying ? 'Land' : 'Take off'),
      h('span.lbl', 'Flying speed'), chips([1, 2, 3, 5].map((n) => [n, `×${n}`]), C.speed, (v) => { C.speed = v; ctx.rerender(); }, '.inline')),
    h('div.cr-row-wrap',
      h('button.btn', { on: { click: () => { close(); game.openMap?.(); } } }, uiImg('map', 18), 'The chart — click it to travel'),
      h('button.btn', { title: 'Creative mode shows the whole chart already; this keeps it charted once creative mode is off', on: { click: () => say(C.chartAll()) } }, 'Chart every sea for good')));
  add(el, h('div.cr-col', tpSec), h('div.cr-col', skySec, flySec));
  return el;
}
