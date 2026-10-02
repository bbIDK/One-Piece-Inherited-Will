// Z-fighting finder: builds every world object's 3D model as the game does and
// reports faces that lie in (or within a few mm of) the same plane, facing the
// same way and overlapping: the depth buffer can't tell which is in front, so
// they flicker against each other as the camera moves.
//
//   node tools/zfight.mjs                     every building and landmark (≈1-2 min)
//   node tools/zfight.mjs --island=loguetown  one island
//   node tools/zfight.mjs --kinds=building --top=40 --json=out.json
//   node tools/zfight.mjs --ships [--tris]        every ship class's hull and below decks
//   node tools/zfight.mjs --inspect=<object id>   one object's meshes and its worst fights
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = join(tmpdir(), 'op-zfight');
mkdirSync(dir, { recursive: true });
const out = join(dir, `zfight-${process.pid}-${Date.now()}.mjs`);
await build({
  entryPoints: [join(root, 'tools/zfight-entry.js')], bundle: true, platform: 'node', format: 'esm', outfile: out,
  loader: { '.css': 'text', '.glsl': 'text' }, logLevel: 'error',
});
const quiet = console.error;
console.error = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('island ')) return; quiet(...a); };
console.warn = () => {};
const mod = await import(pathToFileURL(out).href);
if (args.ships) {
  const f = mod.ships().filter((x) => (!args.part || x.part === args.part) && (args.sep === undefined || x.sep <= Number(args.sep)));
  const by = {};
  for (const x of f) { const k = x.ship + '/' + x.part; by[k] = (by[k] || 0) + x.area; }
  console.log('ships (m² of faces fighting):', Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +v.toFixed(3)])));
  for (const x of f.slice(0, Number(args.top || 25))) console.log(`  ${x.ship}/${x.part}  ${(x.area * 1e4).toFixed(0).padStart(6)} cm²  sep ${(x.sep * 1000).toFixed(1)} mm  n[${x.n}] at [${x.at}]  ${x.cols.join(' vs ')}${args.tris ? '\n     A ' + JSON.stringify(x.triA) + '\n     B ' + JSON.stringify(x.triB) : ''}`);
  process.exit(0);
}
if (args.inspect) { console.log(JSON.stringify(await mod.inspect(Number(args.inspect)), null, 1)); process.exit(0); }
const t0 = Date.now();
const res = await mod.run({ island: args.island || null, kinds: args.kinds ? String(args.kinds).split(',') : null, limit: args.limit ? Number(args.limit) : Infinity, cross: !args['no-cross'], per: args.per ? Number(args.per) : Infinity });
const top = Number(args.top || 25);
console.log(`${res.objects} objects built in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (Object.keys(res.failed).length) console.log('failed to build:', res.failed);
console.log('\nby kind (objects, with fights, m² exactly coplanar, m² within 6 mm):');
for (const [k, v] of Object.entries(res.byKind).sort((a, b) => (b[1].exact + b[1].near) - (a[1].exact + a[1].near))) {
  if (!v.withFights && !args.all) continue;
  console.log(`  ${k.padEnd(18)} ${String(v.n).padStart(5)} ${String(v.withFights).padStart(5)}  ${v.exact.toFixed(3).padStart(8)}  ${v.near.toFixed(3).padStart(8)}`);
}
const line = (g) => `${g.area.toFixed(2).padStart(8)} m² ${String(g.n).padStart(5)}× in ${String(g.objects).padStart(4)}  ${g.key}\n            e.g. #${g.ex.id}${g.ex.other ? ' vs #' + g.ex.other : ''} ${g.ex.role || ''}${g.ex.otherRole ? '/' + g.ex.otherRole : ''} at (${g.ex.x}, ${g.ex.y}) local [${g.ex.at}] sep ${(g.ex.sep * 1000).toFixed(1)} mm${args.tris ? '\n            A ' + JSON.stringify(g.ex.triA) + '\n            B ' + JSON.stringify(g.ex.triB) : ''}`;
console.log(`\ncauses within one object (top ${top} of ${res.groups.length}):`);
for (const g of res.groups.slice(0, top)) console.log('  ' + line(g));
console.log(`\nbetween neighbouring buildings (top ${top} of ${res.crossGroups.length}):`);
for (const g of res.crossGroups.slice(0, top)) console.log('  ' + line(g));
if (args.json) writeFileSync(String(args.json), JSON.stringify(res, null, 1));
