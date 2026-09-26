// 3D view scenarios: first person in a town, looking around, third person,
// sailing from the helm. Run: node tools/shot.mjs fp [--race=human]
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

export const scenarios = {
  fp: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((race) => window.OP.quickStart(race), args.race || 'human');
      await step(page, 0.5);
      const info = await page.evaluate(() => {
        const g = window.OP.game, v = g.view3d;
        return { active: v?.active, mode: v?.rig.mode, world: g.world.id, x: Math.round(g.player.x), y: Math.round(g.player.y), ground: v?.ground(g.player.x, g.player.y) };
      });
      console.log('3d', JSON.stringify(info));
      // let terrain chunks stream in
      for (let i = 0; i < 12; i++) { await step(page, 0.1); await frames(page, 2); }
      await snap('fp-town');
      for (const [yaw, name] of [[0, 'east'], [Math.PI / 2, 'south'], [Math.PI, 'west'], [-Math.PI / 2, 'north']]) {
        await page.evaluate((yaw) => { const v = window.OP.game.view3d; v.rig.yaw = (yaw + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = -0.08; }, yaw);
        await step(page, 0.1); await frames(page, 3);
        await snap('fp-' + name);
      }
      // walk forward a bit (W is relative to the camera)
      await page.evaluate(() => { window.OP.key('W', true); });
      await step(page, 1.5);
      await page.evaluate(() => { window.OP.key('W', false); });
      await step(page, 0.2); await frames(page, 3);
      await snap('fp-walked');
      // third person
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); });
      await step(page, 0.2); await frames(page, 3);
      await snap('tp');
      // sail
      const ship = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, w = g.world;
        g.settings.view = 'first'; g.applySettings();
        const s = g.ships.find((x) => x.owner === 'player');
        if (!s) return null;
        p.mode = 'sail'; p.ship = s; p.onShip = true; s.captain = p; p.x = s.x; p.y = s.y;
        s.sail = 1; s.anchored = false;
        g.view3d.rig.yaw = s.heading; g.view3d.rig.pitch = -0.05;
        return { x: Math.round(s.x), y: Math.round(s.y), type: s.type };
      });
      console.log('ship', JSON.stringify(ship));
      await step(page, 2);
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 2); }
      await snap('fp-sailing');
      // noon over the sea, looking at the horizon
      await page.evaluate(() => { const g = window.OP.game; g.env.clock = 12; g.view3d.rig.pitch = 0.05; });
      await step(page, 0.1); await frames(page, 3);
      await snap('fp-noon');
      await page.evaluate(() => { const g = window.OP.game; g.env.clock = 22; });
      await step(page, 0.1); await frames(page, 3);
      await snap('fp-night');
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d; const i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, chunks: v.terrain.live.size }; });
      console.log('perf', JSON.stringify(perf));
    },
  },
};
