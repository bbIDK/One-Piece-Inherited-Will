// 3D view scenarios: first person in a town, looking around, third person,
// sailing from the helm. Run: node tools/shot.mjs fp [--race=human]
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

export const scenarios = {
  // special places in first person: Reverse Mountain, the Red Line, zones, and a fight
  fp2: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      const settle = async () => { for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 2); } };
      // Reverse Mountain from the sea (North Blue canal mouth)
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player;
        const s = g.ships.find((x) => x.owner === 'player');
        s.x = 1860; s.y = 690; s.heading = 0.4;
        p.mode = 'sail'; p.ship = s; p.onShip = true; s.captain = p; p.x = s.x; p.y = s.y;
        g.view3d.rig.yaw = 0.35; g.view3d.rig.pitch = 0.12; g.env.clock = 10;
      });
      await settle();
      await snap('reverse-mountain');
      // a fight in first person
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player;
        p.mode = 'foot'; p.onShip = false; if (p.ship) p.ship.captain = null;
        const { npcDef, makeNPC } = window.OP.debug;
        const def = npcDef('arlong');
        const isl = g.surface.islands.find((i) => i.id === def.island);
        const t = isl.towns[0];
        window.OP.teleport(t.plaza.x, t.plaza.y + 2);
        const a = makeNPC({ ...def, when: undefined }, p.x + 3, p.y);
        g.addActor(a);
        a.provoked = true; a.aggroPlayer = true; a.controller.target = p; a.controller.state = 'chase'; g.bossTarget = a;
        g.view3d.rig.yaw = 0; g.view3d.rig.pitch = -0.05;
      });
      await settle();
      for (let k = 0; k < 6; k++) {
        await page.evaluate(() => { const g = window.OP.game; const b = g.bossTarget; if (b) g.view3d.rig.yaw = (Math.atan2(b.y - g.player.y, g.world.dx(g.player.x, b.x)) + Math.PI * 2) % (Math.PI * 2); window.OP.input.mouse.pressed = [true, false, false]; window.OP.input.mouse.down = [true, false, false]; });
        await step(page, 0.3);
        await page.evaluate(() => { window.OP.input.mouse.down = [false, false, false]; });
        await step(page, 0.2);
        await frames(page, 2);
        if (k === 2) await snap('fight-mid');
      }
      await snap('fight-late');
      // zones
      for (const z of ['skypiea', 'fishman_island', 'impel_down']) {
        await page.evaluate((z) => { const g = window.OP.game; g.actors = g.actors.filter((a) => a === g.player); g.bossTarget = null; g.enterZoneById(z); g.view3d.rig.pitch = 0; }, z);
        await settle();
        await snap('zone-' + z);
        await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = (v.rig.yaw + Math.PI) % (Math.PI * 2); });
        await step(page, 0.1); await frames(page, 3);
        await snap('zone-' + z + '-back');
      }
    },
  },
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
