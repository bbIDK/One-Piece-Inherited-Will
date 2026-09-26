// Headless play-test harness. Boots the game in Chromium (SwiftShader WebGL),
// runs a named scenario from tools/scenarios.mjs, saves screenshots to shots/
// and fails loudly on page errors.
//
//   node tools/shot.mjs <scenario> [--w=1280] [--h=720] [--keep]
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { scenarios as baseScenarios } from './scenarios.mjs';
import { readdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
// every tools/scenarios*.mjs file contributes scenarios
const scenarios = { ...baseScenarios };
for (const f of readdirSync(dirname(fileURLToPath(import.meta.url)))) {
  if (/^scenarios-.+\.mjs$/.test(f)) Object.assign(scenarios, (await import('./' + f)).scenarios || {});
}
const name = process.argv[2] || 'boot';
const scenario = scenarios[name];
if (!scenario) {
  console.error(`unknown scenario "${name}". available: ${Object.keys(scenarios).join(', ')}`);
  process.exit(2);
}

const chromePath = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find((p) => existsSync(p));
const port = 18000 + Math.floor(Math.random() * 2000);
const server = await startServer(port);
const outDir = join(root, 'shots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
// --mobile (or a scenario with mobile: true) emulates a phone held sideways
const mobile = !!(args.mobile || scenario.mobile);
const page = await browser.newPage({
  viewport: { width: Number(args.w || (mobile ? 844 : 1280)), height: Number(args.h || (mobile ? 390 : 720)) },
  ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}),
});
const errors = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || args.verbose) console.log(`[${t}] ${m.text()}`);
  if (t === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => { console.log(`[pageerror] ${e.stack || e.message}`); errors.push(String(e.message)); });

let shotIndex = 0;
const snap = async (label) => {
  const file = join(outDir, `${name}-${String(++shotIndex).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  console.log(`shot → ${file}`);
  return file;
};

const t0 = Date.now();
try {
  await page.goto(`http://localhost:${port}${args.page ? '/' + args.page : scenario.path || '/index.html'}${scenario.query || '?debug=1'}`);
  await scenario.run(page, snap, args);
} catch (e) {
  console.log(`[scenario-error] ${e.stack || e}`);
  errors.push(String(e));
  await snap('error').catch(() => {});
}
console.log(`scenario "${name}" finished in ${((Date.now() - t0) / 1000).toFixed(1)}s with ${errors.length} error(s)`);
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
