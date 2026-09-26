// Bundles src/main.js into dist/game.js (classic IIFE script so index.html also
// works when opened straight from disk) and writes dist/onepiece.html, a fully
// self-contained single-file build of the game.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const options = {
  entryPoints: [join(root, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  outfile: join(root, 'dist/game.js'),
  loader: { '.css': 'text', '.glsl': 'text' },
  minify,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

function writeSingleFile() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const js = readFileSync(join(root, 'dist/game.js'), 'utf8');
  // Inline the bundle; escape any "</script" sequences inside the code.
  const inlined = html.replace(
    /<script src="dist\/game\.js"><\/script>/,
    () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
  writeFileSync(join(root, 'dist/onepiece.html'), inlined);
  console.log('wrote dist/onepiece.html');
}

mkdirSync(join(root, 'dist'), { recursive: true });
if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [{ name: 'single-file', setup(b) { b.onEnd((r) => { if (!r.errors.length) writeSingleFile(); }); } }],
  });
  await ctx.watch();
  console.log('watching…');
} else {
  await esbuild.build(options);
  writeSingleFile();
}
