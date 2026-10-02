// Bundles src/main.js into dist/game.js (classic IIFE script so index.html also
// works when opened straight from disk) and writes dist/onepiece.html, a fully
// self-contained single-file build of the game.
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    /<script src="dist\/game\.js[^"]*"><\/script>/,
    () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  );
  writeFileSync(join(root, 'dist/onepiece.html'), inlined);
  console.log('wrote dist/onepiece.html');
}

/**
 * index.html asks for dist/game.js?v=<a hash of the bundle>: a new build has
 * a new address, so browsers (and GitHub Pages' ten-minute cache) load it on
 * a plain reload instead of running the old one.
 */
function stampIndex() {
  const js = readFileSync(join(root, 'dist/game.js'));
  const v = createHash('sha1').update(js).digest('hex').slice(0, 10);
  const file = join(root, 'index.html');
  const html = readFileSync(file, 'utf8');
  const out = html.replace(/<script src="dist\/game\.js[^"]*"><\/script>/, `<script src="dist/game.js?v=${v}"></script>`);
  if (out !== html) writeFileSync(file, out);
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
    '<style>html, body { margin: 0; height: 100%; background: #0b1622; color: #f5e6c4; overflow: hidden; }</style>',
    // the loading screen, as in index.html
    (html.match(/<style id="boot-css">[\s\S]*?<\/style>/) || [''])[0],
    (html.match(/<div id="boot">[\s\S]*?<!--\/boot-->/) || ['<div id="boot">Loading the Blue Planet…</div>'])[0],
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
  stampIndex();
  // the shareable single-file build is minified
  const min = await esbuild.build({ ...options, minify: true, write: false, logLevel: 'silent' });
  writeSingleFile(min.outputFiles[0].text);
  writeArtifactPage(min.outputFiles[0].text);
}
