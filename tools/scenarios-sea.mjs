// The sea and sky: a beach, the open sea from a boat, swimming at sea level, dusk and a storm.
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
export const scenarios = {
  sea: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      // a sandy shore on Dawn Island, looking out to sea
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        let best = null;
        for (let k = 0; k < 20000 && !best; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.3 + Math.random() * 0.9);
          const x = Math.floor(isl.x + Math.cos(a) * r), y = Math.floor(isl.y + Math.sin(a) * r);
          if (w.type(x, y) === 16 && w.sd(x, y) > 1 && w.sd(x, y) < 2.5 && !w.isBlocked(x, y)) {
            // the direction to open water
            let bx = 0, by = 0;
            for (let t = 0; t < 32; t++) { const aa = t / 32 * Math.PI * 2; const d = w.sd(x + Math.cos(aa) * 8, y + Math.sin(aa) * 8); if (d < -3) { bx += Math.cos(aa); by += Math.sin(aa); } }
            if (bx || by) best = [x + 0.5, y + 0.5, Math.atan2(by, bx)];
          }
        }
        g.env.clock = 11; g.env.storm = 0; g.env.fog = 0;
        return best;
      });
      console.log('shore', JSON.stringify(spot));
      const look = async (name, yaw, pitch = -0.08) => {
        await page.evaluate(([yaw, pitch]) => { const v = window.OP.game.view3d; v.rig.yaw = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = pitch; }, [yaw, pitch]);
        await step(page, 0.1); await frames(page, 3);
        await snap(name);
      };
      // stand on the wet sand at the water's edge (clear of the palms)
      await page.evaluate(([x, y, a]) => window.OP.teleport(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5), spot);
      for (let i = 0; i < 12; i++) { await step(page, 0.1); await frames(page, 2); }
      await look('shore', spot[2], -0.12);
      await look('shore-sky', spot[2], 0.18);
      // wade into the shallows
      await page.evaluate(([x, y, a]) => window.OP.teleport(x + Math.cos(a) * 5, y + Math.sin(a) * 5), spot);
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 2); }
      await look('shallows', spot[2] + 0.4, -0.3);
      // dusk over the sea
      await page.evaluate(() => { window.OP.game.env.clock = 18.4; });
      for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 2); }
      await look('dusk', spot[2], 0.02);
      // a storm
      await page.evaluate(() => { const e = window.OP.game.env; e.clock = 13; e.storm = 0.9; });
      for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 2); }
      await look('storm', spot[2], 0.0);
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },
};
