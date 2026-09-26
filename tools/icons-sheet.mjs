// Contact sheet for the procedural icon set (src/render/icons.js).
//
//   node tools/icons-sheet.mjs [--dsf=1] [--only=items,skills,ui]
//
// Bundles a small entry script (icons.js + every item / ability registry,
// content packs included) with esbuild, writes shots/icons-sheet.html and
// screenshots each section into shots/icons-<section>.png with Chromium.
// Nothing here is part of the game bundle. The `icons` scenario in
// tools/scenarios-icons.mjs reuses buildSheet()/shootSheet().
import * as esbuild from 'esbuild';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'shots');

// Items the integrator is adding (accessories, new foods): drawn from
// stand-in defs so the sheet shows them before they exist in ITEMS.
const EXTRA_ITEMS = [
  ['coconut', 'food', 'Coconut'], ['apple', 'food', 'Apple'], ['banana', 'food', 'Banana'],
  ['cherry', 'food', 'Cherries'], ['mango', 'food', 'Mango'], ['mushroom', 'food', 'Mushroom'],
  ['acc_ring', 'accessory', 'Gold Ring'], ['acc_ruby_ring', 'accessory', 'Ruby Ring'],
  ['acc_earrings', 'accessory', 'Pearl Earrings'], ['acc_necklace', 'accessory', 'Shell Necklace'],
  ['acc_bracelet', 'accessory', 'Kairoseki Bracelet'], ['acc_belt', 'accessory', 'Leather Belt'],
  ['acc_gloves', 'accessory', 'Boxing Gloves'], ['acc_charm', 'accessory', 'Lucky Charm'],
  ['acc_goggles', 'accessory', 'Aviator Goggles'], ['acc_amulet', 'accessory', 'Sea Amulet'],
  ['acc_misc', 'accessory', 'Captain\'s Brooch'],
  ['x_unknown', 'weird', 'Mystery Thing'],
];

const ENTRY = `
import { itemIcon, skillIcon, uiIcon, iconURL } from './src/render/icons.js';
import { ITEMS } from './src/data/items.js';
import { FRUITS } from './src/data/fruits.js';
import './src/data/styles.js';
import './src/data/haki.js';
import './src/content/index.js';
import { allAbilities } from './src/game/abilities.js';

const EXTRA = ${JSON.stringify(EXTRA_ITEMS)};
const UI_NAMES = ['inventory','character','skills','journal','crew','jolly_roger','map','settings','help','save','menu',
  'berries','lives','bounty','reputation','marine','haki','log_pose','close','lock','check','warning','quest','ship',
  'trainer','shop','inn','doctor','shipwright','bar','library','weapon_slot','head_slot','body_slot','accessory_slot',
  'offhand_slot','food','medicine','weapon','sword','gun','staff','axe','fruit','treasure','key','dial','material','pose','hat','coat','accessory',
  'plus','minus','heart','star','sound','mute','news','legacy','stats','combat','drop','info','dream','clock','sun','moon','anchor','compass','scroll','ghost_unknown_name'];

const q = new URLSearchParams(location.search);
const only = (q.get('only') || 'items,items24,skills,skills24,npc,ui').split(',');
const report = { fallback: [], generic: [], counts: {} };
const sections = [];

function section(id, title, bg, fg) {
  const s = document.createElement('section');
  s.id = id; s.style.background = bg; s.style.color = fg;
  s.innerHTML = '<h2>' + title + '</h2>';
  const grid = document.createElement('div'); grid.className = 'grid';
  s.appendChild(grid); document.body.appendChild(s); sections.push(id);
  return grid;
}
function cell(grid, canvas, label, w) {
  const d = document.createElement('div'); d.className = 'cell'; if (w) d.style.width = w + 'px';
  d.appendChild(canvas);
  if (label != null) { const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label; d.appendChild(l); }
  if (canvas.dataset.fallback) d.classList.add('fb');
  grid.appendChild(d);
}
// same canvas can live in one place only: clone for the extra grids
function clone(c) { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.style.cssText = c.style.cssText; n.getContext('2d').drawImage(c, 0, 0); n.dataset.fallback = c.dataset.fallback || ''; if (!n.dataset.fallback) delete n.dataset.fallback; return n; }

const itemIds = Object.keys(ITEMS);
const itemList = [...itemIds.map((id) => [id, id]), ...EXTRA.filter(([id]) => !ITEMS[id]).map(([id, type, name]) => [id, { id, type, name }])];
const order = ['food','medicine','weapon','hat','coat','accessory','dial','key','pose','material','treasure','fruit'];
const typeOf = (x) => (typeof x[1] === 'string' ? ITEMS[x[1]]?.type : x[1].type) || 'zzz';
itemList.sort((a, b) => { const ta = order.indexOf(typeOf(a)), tb = order.indexOf(typeOf(b)); return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb); });

const t0 = performance.now();
// focus mode: ?focus=T:food,i:meat,s:gomu_pistol,S:fruit:mera,u:map → one row per icon at many sizes
const focus = q.get('focus');
if (focus) {
  const abilAll = [...allAbilities(), { id: 'toggle_armament', name: 'Armament', hakiType: 'armament', source: 'haki:armament' }, { id: 'toggle_observation', name: 'Observation', hakiType: 'observation', source: 'haki:observation' }];
  const rows = [];
  for (const tok of focus.split(',')) {
    const [k, ...rest] = tok.split(':'); const v = rest.join(':');
    if (k === 'T') for (const x of itemList) { if (typeOf(x) === v) rows.push(['i', x[1], x[0]]); }
    else if (k === 'i') { const x = itemList.find((y) => y[0] === v); rows.push(['i', x ? x[1] : v, v]); }
    else if (k === 's') { const a = abilAll.find((y) => y.id === v); if (a) rows.push(['s', a, v]); }
    else if (k === 'S') for (const a of abilAll) { if ((a.source || '').startsWith(v)) rows.push(['s', a, a.id]); }
    else if (k === 'u') rows.push(['u', v, v]);
  }
  const per = Number(q.get('per') || 6);
  for (let i = 0; i < rows.length; i += per) {
    const g = section('focus' + (i / per), 'Focus ' + (i / per), '#f5e6c4', '#2b1d12');
    g.style.flexDirection = 'column';
    for (const [kind, arg, label] of rows.slice(i, i + per)) {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;align-items:center';
      const mkI = (sz) => (kind === 'i' ? itemIcon(arg, sz) : kind === 's' ? skillIcon(arg, sz) : uiIcon(arg, sz));
      for (const sz of [96, 64, 48, 32, 24]) row.appendChild(mkI(sz));
      const dark = document.createElement('div'); dark.style.cssText = 'display:flex;gap:10px;align-items:center;background:#0e2233;padding:6px;border-radius:8px';
      for (const sz of [48, 32, 24]) dark.appendChild(clone(mkI(sz)));
      row.appendChild(dark);
      const l = document.createElement('div'); l.textContent = label + ' → ' + (mkI(48).dataset.icon || ''); l.style.fontSize = '12px';
      row.appendChild(l);
      g.appendChild(row);
    }
  }
}
if (only.includes('items') && !focus) {
  const g = section('items', 'Items @48 (parchment) — red frame = generic fallback', '#f5e6c4', '#2b1d12');
  for (const [id, arg] of itemList) {
    const c = itemIcon(arg, 48);
    if (c.dataset.fallback) report.fallback.push(id + ' → ' + c.dataset.icon);
    cell(g, c, id, 74);
  }
}
if (only.includes('items24') && !focus) {
  const g1 = section('items24', 'Items @24 on parchment / on navy HUD', '#f5e6c4', '#2b1d12');
  for (const [id, arg] of itemList) cell(g1, itemIcon(arg, 24), null, 28);
  const g2 = section('items24dark', 'Items @24 on HUD navy', '#0e2233', '#f5e6c4');
  for (const [id, arg] of itemList) cell(g2, clone(itemIcon(arg, 24)), null, 28);
  const g3 = section('items64', 'Items @64 (detail)', '#e9d5a9', '#2b1d12');
  for (const [id, arg] of itemList.slice(0, 400)) cell(g3, itemIcon(arg, 64), null, 68);
}
const TOGGLES = [
  { id: 'toggle_armament', name: 'Armament', hakiType: 'armament', source: 'haki:armament' },
  { id: 'toggle_observation', name: 'Observation', hakiType: 'observation', source: 'haki:observation' },
  { id: 'haki_conqueror', name: "Conqueror's", hakiType: 'conqueror', source: 'haki:conqueror' },
];
const abil = [...allAbilities(), ...TOGGLES.slice(0, 2)];
const player = abil.filter((a) => /^(style|fruit|haki)/.test(a.source || ''));
const npc = abil.filter((a) => !/^(style|fruit|haki)/.test(a.source || ''));
if (only.includes('skills') && !focus) {
  const g = section('skills', 'Player skills @48 (styles, fruits, haki) on hotbar navy', '#0e2233', '#f5e6c4');
  for (const a of player) { const c = skillIcon(a, 48); if (c.dataset.icon === 'impact' && !/impact|burst|skull/i.test(a.name)) report.generic.push(a.id); cell(g, c, a.id, 74); }
}
if (only.includes('skills24') && !focus) {
  const g = section('skills24', 'Player skills @24 on parchment', '#f5e6c4', '#2b1d12');
  for (const a of player) cell(g, skillIcon(a, 24), null, 28);
  const g2 = section('skills24dark', 'Player skills @32 on navy', '#0e2233', '#f5e6c4');
  for (const a of player) cell(g2, skillIcon(a, 32), null, 36);
}
if (only.includes('npc') && !focus) {
  const g = section('npc', 'NPC / boss abilities @40 (fallback rules)', '#16324a', '#f5e6c4');
  for (const a of npc) { const c = skillIcon(a, 40); cell(g, c, a.id, 64); }
}
if (only.includes('ui') && !focus) {
  const g = section('ui', 'UI icons @32 on parchment', '#f5e6c4', '#2b1d12');
  for (const n of UI_NAMES) { const c = uiIcon(n, 32); if (c.dataset.fallback) report.fallback.push('ui:' + n); cell(g, c, n, 74); }
  const g2 = section('uidark', 'UI icons @24 / @32 on navy', '#0e2233', '#f5e6c4');
  for (const n of UI_NAMES) cell(g2, uiIcon(n, 24), null, 28);
  for (const n of UI_NAMES) cell(g2, clone(uiIcon(n, 32)), null, 36);
  const g3 = section('ui64', 'UI icons @64', '#e9d5a9', '#2b1d12');
  for (const n of UI_NAMES) cell(g3, uiIcon(n, 64), null, 68);
}
// iconURL smoke test
const u = iconURL(uiIcon('map', 32));
report.urlOk = typeof u === 'string' && u.startsWith('data:image/png') && iconURL(uiIcon('map', 32)) === u;
report.cacheOk = itemIcon('meat', 48) === itemIcon('meat', 48);
report.ms = Math.round(performance.now() - t0);
report.counts = { items: itemList.length, player: player.length, npc: npc.length, ui: UI_NAMES.length };
window.SHEET = { done: true, sections, report };
console.log('SHEET ' + JSON.stringify(report));
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Icon sheet</title>
<style>
body { margin: 0; font: 11px/1.2 'Nunito', system-ui, sans-serif; background: #333; }
section { padding: 10px 12px 14px; }
h2 { margin: 0 0 8px; font-size: 14px; }
.grid { display: flex; flex-wrap: wrap; gap: 4px; }
.cell { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
.cell.fb canvas { outline: 2px solid #d50000; }
.lbl { font-size: 8.5px; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; opacity: .8; margin-top: 1px; }
canvas { display: block; }
</style></head><body><script src="icons-sheet.js"></script></body></html>`;

/** Bundle the sheet script and write shots/icons-sheet.{html,js}. Returns the page path. */
export async function buildSheet() {
  mkdirSync(outDir, { recursive: true });
  const res = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: root, sourcefile: 'icons-sheet-entry.js', loader: 'js' },
    bundle: true, format: 'iife', target: ['es2020'], write: false,
    loader: { '.css': 'text', '.glsl': 'text' }, logLevel: 'silent',
  });
  writeFileSync(join(outDir, 'icons-sheet.js'), res.outputFiles[0].text);
  writeFileSync(join(outDir, 'icons-sheet.html'), HTML);
  return '/shots/icons-sheet.html';
}

/** Wait for the sheet to render, screenshot every section. Returns the page's report. */
export async function shootSheet(page, snap) {
  await page.waitForFunction(() => window.SHEET && window.SHEET.done, null, { timeout: 120000 });
  const { sections, report } = await page.evaluate(() => window.SHEET);
  const files = [];
  for (const s of sections) {
    const file = join(outDir, `icons-${s}.png`);
    await (await page.$('#' + s)).screenshot({ path: file });
    files.push(file);
  }
  if (snap) await snap('sheet');
  return { report, files };
}

// ------------------------------------------------------------------ CLI
if (process.argv[1] && normalize(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const { chromium } = await import('playwright-core');
  const { startServer } = await import('./serve.mjs');
  const pagePath = await buildSheet();
  const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => existsSync(p));
  const port = 20000 + Math.floor(Math.random() * 2000);
  const server = await startServer(port);
  const browser = await chromium.launch({ executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: Number(args.w || 1400), height: 900 }, deviceScaleFactor: Number(args.dsf || 1) });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[error]', m.text()); } else if (m.text().startsWith('SHEET')) console.log(m.text().slice(0, 4000)); });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.stack || e.message); });
  const qs = new URLSearchParams(); if (args.only) qs.set('only', args.only); if (args.focus) qs.set('focus', args.focus); if (args.per) qs.set('per', args.per);
  await page.goto(`http://localhost:${port}${pagePath}?${qs}`);
  try {
    const { files } = await shootSheet(page);
    for (const f of files) console.log('shot →', f);
  } catch (e) { console.log('[sheet-error]', e.message); errors.push(e.message); }
  await browser.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
}
