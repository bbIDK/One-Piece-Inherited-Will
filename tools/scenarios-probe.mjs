// A quick look inside a running game: boots a human, then evaluates the
// script in --js=<file> in the page (the file is a function body; `g` is the
// game and `OP` the debug handle; whatever it returns is printed as JSON).
import { readFileSync } from 'node:fs';
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
export const scenarios = {
  // several views in one run: --js=<file> returns [{ x, y, yaw, pitch, clock?, alt?, name? }, ...]
  // (world tiles, the camera's yaw and pitch); each is shot after a moment to settle
  probeshots: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.2);
      const body = readFileSync(String(args.js), 'utf8');
      const views = await page.evaluate((body) => { const g = window.OP.game, OP = window.OP; return new Function('g', 'OP', body)(g, OP); }, body);
      console.log('views', JSON.stringify(views));
      for (let i = 0; i < (views || []).length; i++) {
        const v = views[i];
        await page.evaluate((v) => {
          const g = window.OP.game, p = g.player, rig = g.view3d?.rig;
          if (v.clock !== undefined) g.env.clock = v.clock;
          p.x = v.x; p.y = v.y;
          // (alt: hover that many metres above the ground, flying, for a look from above)
          if (v.alt !== undefined) {
            const gr = g.view3d?.ground ? g.view3d.ground(v.x, v.y) : 0;
            p.flying = true; p.alt = gr + v.alt; p.z = v.alt;
          }
          g.snapCamera?.();
          if (rig) { rig.yaw = v.yaw; rig.pitch = v.pitch; }
        }, v);
        await step(page, 2.5);
        await page.evaluate((v) => { const rig = window.OP.game.view3d?.rig; if (rig) { rig.yaw = v.yaw; rig.pitch = v.pitch; } }, v);
        await step(page, 0.2);
        await snap(v.name || `view${i + 1}`);
      }
    },
  },
  // a strip of frames, for looking at motion: --js=<file> sets the scene up and
  // returns { frames, dt, keys?, each? } — `each` is a function body run before
  // every frame (g, OP and the frame number i); the frames are shot in a row
  // (lay them out on one sheet to look at them together). The live loop is
  // held meanwhile: a screenshot takes seconds, and the game would run on
  // through it, so the frames wouldn't be dt apart.
  film: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.2);
      const body = readFileSync(String(args.js), 'utf8');
      const cfg = await page.evaluate((body) => { const g = window.OP.game, OP = window.OP; return new Function('g', 'OP', body)(g, OP); }, body);
      console.log('film', JSON.stringify({ frames: cfg.frames, dt: cfg.dt, keys: cfg.keys }));
      await page.evaluate(() => { window.OP.hold = true; });
      for (const k of cfg.keys || []) await page.evaluate((k) => window.OP.key(k, true), k);
      for (let i = 0; i < cfg.frames; i++) {
        const note = await page.evaluate(({ dt, each, i }) => {
          const g = window.OP.game, OP = window.OP;
          const r = each ? new Function('g', 'OP', 'i', each)(g, OP, i) : null;
          OP.step(dt);
          return r;
        }, { dt: cfg.dt, each: cfg.each || null, i });
        if (note) console.log(`f${i}`, typeof note === 'string' ? note : JSON.stringify(note));
        await snap(`f${String(i).padStart(2, '0')}`);
      }
      for (const k of cfg.keys || []) await page.evaluate((k) => window.OP.key(k, false), k);
    },
  },
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
