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

function writeSingleFile(code) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const js = code ?? readFileSync(join(root, 'dist/game.js'), 'utf8');
  // Inline the bundle; escape any "</script" sequences inside the code.
  const inlined = html.replace(
    /<script src="dist\/game\.js"><\/script>/,
    () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
  writeFileSync(join(root, 'dist/onepiece.html'), inlined);
  console.log('wrote dist/onepiece.html');
}

/** A page fragment (no <html>/<head>/<body>) for hosts that wrap pages in their own skeleton. */
function writeArtifactPage(code) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const fonts = (html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/) || [''])[0];
  const out = [
    '<title>Inherited Will</title>',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    fonts,
    '<style>html, body { margin: 0; height: 100%; background: #0b1622; color: #f5e6c4; overflow: hidden; } #boot { position: fixed; inset: 0; display: grid; place-items: center; color: #f5e6c4; font: 700 20px \'Nunito\', system-ui, sans-serif; }</style>',
    '<div id="boot">Loading the Blue Planet…</div>',
    `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`,
  ].join('\n');
  writeFileSync(join(root, 'dist/artifact.html'), out);
  console.log('wrote dist/artifact.html');
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
  // the shareable single-file build is minified
  const min = await esbuild.build({ ...options, minify: true, write: false, logLevel: 'silent' });
  writeSingleFile(min.outputFiles[0].text);
  writeArtifactPage(min.outputFiles[0].text);
}
