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
  zones: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      for (const z of ['skypiea', 'fishman_island', 'impel_down']) {
        const info = await page.evaluate((z) => { const g = window.OP.game; g.enterZoneById(z); return { world: g.world.id, x: g.player.x, y: g.player.y, islands: g.world.islands.map((i) => i.id) }; }, z);
        console.log('zone', JSON.stringify(info));
        await step(page, 1.5);
        await snap(z);
        const back = await page.evaluate(() => { const g = window.OP.game; g.leaveZone(false); return { world: g.world.id, x: Math.round(g.player.x), y: Math.round(g.player.y) }; });
        console.log('back', JSON.stringify(back));
        await step(page, 0.5);
      }
      await snap('surface-again');
    },
  },
  look: {
    // look at a place: --zone=fishman_island --island=fishman_island (or --x --y on the surface)
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.3);
      const info = await page.evaluate((a) => {
        const g = window.OP.game;
        if (a.zone) g.enterZoneById(a.zone);
        const w = g.world;
        let x = Number(a.x), y = Number(a.y);
        if (a.island) { const i = w.islands.find((k) => k.id === a.island); if (i) { const t = i.towns[0]; x = t ? t.plaza.x : i.x; y = t ? t.plaza.y + 2 : i.y; } }
        if (!isNaN(x)) window.OP.teleport(x, y);
        if (a.clock) g.env.clock = Number(a.clock);
        return { world: w.id, x: g.player.x, y: g.player.y };
      }, args);
      console.log('look', JSON.stringify(info));
      await step(page, Number(args.t || 2));
      if (args.zoom) await page.evaluate((z) => { window.OP.game.zoomBias = Number(z); }, args.zoom);
      await step(page, 1);
      await snap(args.label || 'look');
    },
  },
  systems: {
    // crew recruit, marine enlistment, bounty office, bondola to Mary Geoise
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      // --- crew: Johnny on the Baratie
      const crew = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        const isl = g.surface.islands.find((i) => i.id === 'baratie');
        window.OP.teleport(isl.spots.baratie_deck.x, isl.spots.baratie_deck.y);
        g.spawner.update(1); g.spawner.t = 0; g.spawner.update(1);
        c.flags.yosakuCured = true;
        const j = g.actors.find((a) => a.npcId === 'johnny');
        if (!j) return 'no johnny';
        g.emit('talk', j);
        const labels = g.dialogue.active.choices.map((x) => x.label);
        g.dialogue.choose(0); // join my crew
        g.dialogue.choose(0); // welcome aboard
        return { labels, crew: c.crew.map((m) => m.id), followers: [...g.crew.followers.keys()] };
      });
      console.log('crew', JSON.stringify(crew));
      await step(page, 2);
      await snap('crew');
      // --- marines
      const marine = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        g.emit('marineEnlist', 'test');
        g.dialogue.choose(0); g.dialogue.advance && g.dialogue.close();
        return { faction: c.faction, rank: c.marineRank, hat: c.equipped.hat };
      });
      console.log('marine', JSON.stringify(marine));
      await page.evaluate(() => { const g = window.OP.game; g.state.char.merit = 50; g.emit('marineOffice', { name: 'Test Base' }, null); });
      await frames(page, 30);
      await snap('marine-office');
      await page.evaluate(() => { const g = window.OP.game; g.dialogue.close(); g.emit('bountyBoard', { name: 'Bounty Office' }, null); });
      await frames(page, 10);
      await snap('bounty-office');
      await page.evaluate(() => window.OP.game.ui.closeAll());
      // --- bondola
      const bond = await page.evaluate(() => {
        const g = window.OP.game; const c = g.state.char;
        c.flags.bondolaPass = true;
        const MG = g.world.maryGeoise; const b = MG.portParadise.bondola;
        window.OP.teleport(b.x - 3, b.y + 3);
        const o = g.world.objects.near(b.x, b.y + 1, 3).find((x) => x.use === 'bondola');
        if (!o) return 'no bondola object';
        g.emit('useObject', o);
        g.dialogue.choose(0);
        return 'ok';
      });
      console.log('bondola', bond);
      await page.waitForTimeout(1500);
      await step(page, 2);
      const pos = await page.evaluate(() => { const g = window.OP.game; return { x: g.player.x, y: g.player.y, isl: g.currentIsland?.id }; });
      console.log('mary geoise', JSON.stringify(pos));
      await snap('mary-geoise');
    },
  },
  resume: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      const before = await page.evaluate(() => { const g = window.OP.game; g.enterZoneById('skypiea'); return { world: g.world.id, x: g.player.x, y: g.player.y }; });
      console.log('before', JSON.stringify(before));
      await step(page, 1);
      await page.reload();
      await waitReady(page);
      await frames(page, 5);
      await page.getByText('Continue').first().click();
      await frames(page, 5);
      await step(page, 1);
      const after = await page.evaluate(() => { const g = window.OP.game; return { world: g.world.id, x: g.player.x, y: g.player.y, ships: g.ships.length }; });
      console.log('after', JSON.stringify(after));
      await snap('resumed');
    },
  },
};
