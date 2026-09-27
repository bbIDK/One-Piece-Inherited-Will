// A quick look inside a running game: boots a human, then evaluates the
// script in --js=<file> in the page (the file is a function body; `g` is the
// game and `OP` the debug handle; whatever it returns is printed as JSON).
import { readFileSync } from 'node:fs';
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
export const scenarios = {
  probe: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.2);
      const body = readFileSync(String(args.js), 'utf8');
      const out = await page.evaluate((body) => { const g = window.OP.game, OP = window.OP; return new Function('g', 'OP', body)(g, OP); }, body);
      console.log('probe', JSON.stringify(out, null, 1));
      if (args.snap) await snap('probe');
    },
  },
};
