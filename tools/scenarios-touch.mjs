// Phone play-test: a landscape phone with a touch screen (real touch events
// through the DevTools protocol). Run: node tools/shot.mjs touch
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

export const scenarios = {
  touch: {
    mobile: true,
    async run(page, snap) {
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
      const tap = async (x, y) => { await touch('touchStart', [[x, y, 9]]); await frames(page, 1); await touch('touchEnd', []); await frames(page, 2); };
      const center = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; }, sel);
      const tapSel = async (sel) => { const c = await center(sel); if (!c) throw new Error('no visible ' + sel); await tap(c[0], c[1]); };

      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await frames(page, 4);
      await snap('title');
      const on0 = await page.evaluate(() => window.OP.input.touch?.on);
      console.log('touch mode at start:', on0, 'quality:', await page.evaluate(() => window.OP.game.settings.quality));
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 2); }
      await snap('hud');

      // left thumb: push the stick up (forward) and hold
      const g0 = await page.evaluate(() => { const g = window.OP.game, p = g.player; return { x: p.x, y: p.y, yaw: g.view3d.rig.yaw }; });
      await touch('touchStart', [[150, 290, 1]]);
      await frames(page, 1);
      await touch('touchMove', [[150, 250, 1]]);
      await touch('touchMove', [[150, 225, 1]]);
      await frames(page, 2);
      const stickState = await page.evaluate(() => ({ ...window.OP.input.touch }));
      console.log('stick', JSON.stringify(stickState));
      await step(page, 1.2);
      await frames(page, 2);
      await snap('walking');
      // right thumb too: look right while walking
      await touch('touchStart', [[150, 225, 1], [560, 200, 2]]);
      await touch('touchMove', [[150, 225, 1], [620, 200, 2]]);
      await touch('touchMove', [[150, 225, 1], [680, 190, 2]]);
      await frames(page, 2);
      await touch('touchEnd', []);
      await frames(page, 2);
      const g1 = await page.evaluate(() => { const g = window.OP.game, p = g.player; return { x: p.x, y: p.y, yaw: g.view3d.rig.yaw, pitch: g.view3d.rig.pitch, stick: { ...window.OP.input.touch } }; });
      const moved = Math.hypot(g1.x - g0.x, g1.y - g0.y);
      const along = ((g1.x - g0.x) * Math.cos(g0.yaw) + (g1.y - g0.y) * Math.sin(g0.yaw)) / (moved || 1);
      console.log('moved', moved.toFixed(2), 'along view', along.toFixed(2), 'yaw', g0.yaw.toFixed(3), '->', g1.yaw.toFixed(3), 'pitch', g1.pitch.toFixed(3), 'stick after release', JSON.stringify(g1.stick));
      if (moved < 1) throw new Error('the stick did not move the player');
      if (along < 0.8) throw new Error('the stick did not walk where the camera looks');
      if (Math.abs(g1.yaw - g0.yaw) < 0.2) throw new Error('dragging did not turn the view');
      if (g1.stick.mx || g1.stick.my) throw new Error('stick did not reset');

      // the attack button swings
      await tapSel('.t-btn.attack');
      const acted = await page.evaluate(() => { const p = window.OP.game.player; return !!p.action || (p.combo && p.combo.n > 0); });
      await step(page, 0.05); await frames(page, 2);
      const acted2 = await page.evaluate(() => { const p = window.OP.game.player; return { action: p.action?.def?.id || null, combo: p.combo?.n }; });
      console.log('attack button', acted, JSON.stringify(acted2));
      await snap('attack');
      // dodge button
      await tapSel('.t-btn.dodge');
      await step(page, 0.05);
      // top strip: inventory, then map
      await tapSel('.side-btn[title^="Inventory"]');
      await frames(page, 3);
      await snap('inventory');
      const inv = await page.evaluate(() => window.OP.ui.stack.map((e) => e.id));
      console.log('panels', JSON.stringify(inv));
      if (!inv.includes('inventory')) throw new Error('inventory did not open from the strip');
      await tapSel('.side-btn[title^="Map"]');
      await frames(page, 4);
      await snap('map');
      if (!(await page.evaluate(() => window.OP.ui.mapOpen))) throw new Error('map did not open');
      // pinch to zoom in on the chart
      const z0 = await page.evaluate(() => window.OP.game.renderer.cam.zoom);
      await touch('touchStart', [[380, 200, 3], [460, 200, 4]]);
      await touch('touchMove', [[340, 200, 3], [500, 200, 4]]);
      await touch('touchMove', [[300, 200, 3], [540, 200, 4]]);
      await touch('touchEnd', []);
      await frames(page, 3);
      await snap('map-pinched');
      await tapSel('.wm-close');
      await frames(page, 2);
      if (await page.evaluate(() => window.OP.ui.mapOpen)) throw new Error('map did not close');
      void z0;
      // a fight: Use/prompt and the Haki toggles are hidden until relevant
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player;
        const { npcDef, makeNPC } = window.OP.debug;
        const def = npcDef('arlong');
        const a = makeNPC({ ...def, when: undefined }, p.x + Math.cos(g.view3d.rig.yaw) * 3, p.y + Math.sin(g.view3d.rig.yaw) * 3);
        g.addActor(a);
        a.provoked = true; a.aggroPlayer = true; a.controller.target = p; a.controller.state = 'chase'; g.bossTarget = a;
      });
      for (let i = 0; i < 4; i++) { await tapSel('.t-btn.attack'); await step(page, 0.25); await frames(page, 2); }
      await snap('fight');
      // at the helm
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player;
        g.actors = g.actors.filter((a) => a === p); g.bossTarget = null;
        const s = g.ships.find((x) => x.owner === 'player');
        p.mode = 'sail'; p.ship = s; p.onShip = true; s.captain = p; p.x = s.x; p.y = s.y;
        s.sail = 0; s.anchored = false; g.view3d.rig.yaw = s.heading;
      });
      await step(page, 0.2);
      const h0 = await page.evaluate(() => { const s = window.OP.game.player.ship; return { heading: s.heading, sail: s.sail }; });
      await touch('touchStart', [[150, 290, 5]]);
      await touch('touchMove', [[190, 240, 5]]);
      await touch('touchMove', [[205, 230, 5]]);
      await step(page, 1.5);
      await frames(page, 2);
      await snap('sailing');
      await touch('touchEnd', []);
      const h1 = await page.evaluate(() => { const s = window.OP.game.player.ship; return { heading: s.heading, sail: s.sail }; });
      console.log('helm', JSON.stringify(h0), '->', JSON.stringify(h1));
      if (h1.sail <= h0.sail) throw new Error('pushing the stick up did not raise the sails');
      if (Math.abs(h1.heading - h0.heading) < 0.02) throw new Error('pushing the stick right did not steer');
      // pause menu from the strip
      await tapSel('.side-btn[title^="Menu"]');
      await frames(page, 3);
      await snap('menu');
    },
  },
};
