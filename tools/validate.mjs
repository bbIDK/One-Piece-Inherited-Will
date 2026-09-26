// Content validator. Bundles the game data for Node, generates the world and
// checks every cross-reference (islands, towns, buildings, spots, NPCs,
// quests, abilities, items, trainers, dialogue trees).
//
//   node tools/validate.mjs            full check (≈30 s: generates the world)
//   node tools/validate.mjs --fast     skip world generation
//   node tools/validate.mjs --pack=paradise1   only report NPC/quest issues of one pack
import { build } from 'esbuild';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = join(tmpdir(), 'op-validate');
mkdirSync(dir, { recursive: true });
const out = join(dir, `validate-${process.pid}-${Date.now()}.mjs`);
await build({
  entryPoints: [join(root, 'tools/validate-entry.js')], bundle: true, platform: 'node', format: 'esm', outfile: out,
  loader: { '.css': 'text', '.glsl': 'text' }, logLevel: 'error',
});
const srcFiles = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcFiles(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []));
const sources = srcFiles(join(root, 'src')).map((f) => readFileSync(f, 'utf8')).join('\n');
const origLog = console.error;
console.error = (...a) => { if (!args.verbose && typeof a[0] === 'string' && a[0].startsWith('island ')) { origLog('[worldgen]', ...a); return; } origLog(...a); };
const mod = await import(pathToFileURL(out).href);
const res = await mod.run({ noWorld: !!args.fast, pack: args.pack || null, sources });
for (const w of res.warns) console.log(`warn: ${w}`);
for (const e of res.errors) console.log(`ERROR: ${e}`);
console.log(`\n${res.islands} islands, ${res.npcs} NPCs, ${res.quests} quests — ${res.errors.length} error(s), ${res.warns.length} warning(s)`);
process.exit(res.errors.length ? 1 : 0);
