// Scenarios for tools/shot.mjs. Each gets (page, snap, args).

const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

export const scenarios = {
  boot: {
    async run(page, snap) {
      await waitReady(page);
      await frames(page, 5);
      await snap('title');
    },
  },
  create: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await frames(page, 3);
      await page.getByText('Set Sail').first().click();
      await page.waitForTimeout(2500);
      await snap('roll');
      await page.getByText('Accept my fate').click();
      await frames(page, 3);
      await snap('identity');
      await page.getByText('Next: your dream').click();
      await frames(page, 3);
      await snap('dream');
      await page.getByText('Set Sail! ⚓').click();
      await frames(page, 5);
      await step(page, 1);
      await snap('spawned');
      const info = await page.evaluate(() => ({ name: window.OP.game.state.char.name, race: window.OP.game.state.char.race, spawn: window.OP.game.state.char.spawn }));
      console.log('spawn', JSON.stringify(info));
    },
  },
  play: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((race) => window.OP.quickStart(race), args.race || 'human');
      await step(page, 1);
      await snap('spawn');
      await page.evaluate(() => { window.OP.key('D', true); });
      await step(page, 1.2);
      await page.evaluate(() => { window.OP.key('D', false); });
      await step(page, 0.3);
      await snap('walked');
      await page.keyboard.press('KeyI');
      await frames(page, 3);
      await snap('inventory');
      await page.keyboard.press('Escape');
      await page.keyboard.press('KeyC');
      await frames(page, 3);
      await snap('character');
      await page.keyboard.press('Escape');
      await page.keyboard.press('KeyM');
      await frames(page, 4);
      await snap('map');
      await page.keyboard.press('KeyM');
      const shipInfo = await page.evaluate(() => { const g = window.OP.game; const s = g.ships[0]; return s ? { x: s.x, y: s.y, type: s.type } : null; });
      console.log('ship', JSON.stringify(shipInfo));
      if (shipInfo) {
        await page.evaluate(({ x, y }) => { window.OP.teleport(x, y - 2); }, shipInfo);
        await step(page, 0.3);
        await page.evaluate(() => { const i = window.OP.game.player.controller.interaction; if (i) i.run(); });
        await page.evaluate(() => { window.OP.key('W', true); });
        await step(page, 4);
        await page.evaluate(() => { window.OP.key('W', false); });
        await snap('sailing');
      }
    },
  },
};
