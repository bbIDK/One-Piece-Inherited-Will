// Town and landmark audit: generates the world and reports, for every town,
// how much of it is built on, how much paving stands empty, how big its crowd
// is; and for every landmark, whether the ground under it is level and clear.
//
//   node tools/townaudit.mjs              the worst towns and landmarks
//   node tools/townaudit.mjs --all        every town
//   node tools/townaudit.mjs --json=out   everything, as JSON
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = join(tmpdir(), 'op-townaudit');
mkdirSync(dir, { recursive: true });
const out = join(dir, `townaudit-${process.pid}-${Date.now()}.mjs`);
await build({
  entryPoints: [join(root, 'tools/townaudit-entry.js')], bundle: true, platform: 'node', format: 'esm', outfile: out,
  loader: { '.css': 'text', '.glsl': 'text' }, logLevel: 'error',
});
const origErr = console.error;
console.error = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('island ')) return; origErr(...a); };
const mod = await import(pathToFileURL(out).href);
if (args.rock) {
  const r = await mod.rockAudit(Number(args.step || 0.5));
  console.log(`unwalkable ground that looks walkable: ${r.islandWide} tiles island-wide`, JSON.stringify(r.byType));
  for (const t of r.towns.slice(0, 40)) console.log(`  ${t.island.padEnd(22)}${t.town.padEnd(28)}${String(t.n).padEnd(6)}${t.at.join(' | ')}`);
  console.log(`${r.towns.length} towns with some`);
  process.exit(0);
}
if (args.barriers) {
  const kinds = await mod.barriers();
  const rows = Object.entries(kinds).sort((a, b) => b[1].town - a[1].town || b[1].n - a[1].n);
  console.log('solid, tile-stamped objects (kind, count, in towns, footprints, model collider, examples):');
  for (const [k, v] of rows) console.log(`  ${k.padEnd(34)}${String(v.n).padEnd(6)}${String(v.town).padEnd(6)}${Object.entries(v.sizes).map(([s, n]) => `${s}×${n}`).join(' ').slice(0, 60).padEnd(62)}${JSON.stringify(v.collide ?? null).padEnd(12)}${v.at.join(' | ').slice(0, 90)}`);
  process.exit(0);
}
const res = await mod.run();
if (args.json) writeFileSync(args.json, JSON.stringify(res, null, 1));
const pad = (s, n) => String(s).padEnd(n);
const towns = res.towns.slice().sort((a, b) => b.emptyShare - a.emptyShare);
const show = args.all ? towns : towns.filter((t) => t.emptyShare > 0.25 || t.crowd > t.buildings * 1.2 + 6 || t.placedSpecials < t.specials);
console.log(`${pad('town', 26)}${pad('style', 8)}${pad('size', 9)}${pad('bld', 5)}${pad('spec', 6)}${pad('cover', 7)}${pad('paved', 7)}${pad('empty', 7)}crowd`);
for (const t of show) {
  console.log(`${pad(t.town, 26)}${pad(t.style, 8)}${pad(`${t.w}x${t.h}`, 9)}${pad(t.buildings, 5)}${pad(`${t.placedSpecials}/${t.specials}`, 6)}${pad(t.coverage, 7)}${pad(t.paved, 7)}${pad(t.emptyShare, 7)}${t.crowd}`);
}
const tot = res.towns.reduce((s, t) => ({ b: s.b + t.buildings, c: s.c + t.crowd }), { b: 0, c: 0 });
console.log(`\n${res.towns.length} towns (${show.length} flagged), ${tot.b} buildings, ${tot.c} people in all`);
const marks = res.marks.filter((m) => m.float > 0.5 || m.sink > 1.2 || m.trees || m.water).sort((a, b) => b.float - a.float);
console.log(`\nlandmarks floating (> 0.5 m) or sunk (> 1.2 m) at an edge, with trees through them, or in water (${marks.length} of ${res.marks.length}):`);
for (const m of marks.slice(0, args.all ? 999 : 40)) console.log(`  ${pad(m.island, 20)}${pad(m.kind, 11)}${pad(m.name.slice(0, 44), 46)}float ${pad(m.float, 5)} sink ${pad(m.sink, 5)} trees ${m.trees} water ${m.water}`);
console.log(`\nthings standing in one another (${res.overlaps.length}):`);
for (const o of res.overlaps.slice(0, args.all ? 999 : 40)) console.log(`  ${pad(o.island, 20)}${pad(String(o.a).slice(0, 34), 36)}in ${pad(String(o.b).slice(0, 34), 36)}at ${o.x},${o.y}${o.by ? ' by ' + o.by + ' m' : ''}`);
const cut = res.piers.filter((p) => !p.ok);
console.log(`\npiers you can't walk to from their town's square (${cut.length} of ${res.piers.length}):`);
for (const p of cut) console.log(`  ${pad(p.island, 20)}${pad(p.town, 24)}${pad(String(p.dock).slice(0, 26), 28)}stuck ${p.near} m short at ${p.at}\n      ${p.why.join('\n      ')}`);
const round = res.piers.filter((p) => p.ok && p.detour > 1.6 && p.steps > 40);
console.log(`\npiers only reached the long way round (${round.length}):`);
for (const p of round) console.log(`  ${pad(p.island, 20)}${pad(p.town, 24)}${pad(String(p.dock).slice(0, 26), 28)}${p.steps} steps for ${p.crow} (x${p.detour})`);
