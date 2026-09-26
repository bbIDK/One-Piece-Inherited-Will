// UI scenarios: the sidebar menus, drag-and-drop equipment & hotbar, crew
// founding, foraging, theft and saving. Run: node tools/shot.mjs menus
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
const state = (page) => page.evaluate(() => {
  const c = window.OP.game.state.char;
  return { eq: c.equipped, hotbar: c.hotbar, fruit: c.fruit, rep: c.reputation, crew: c.crewName, jr: !!c.jr, faction: c.faction };
});

export const scenarios = {
  menus: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await step(page, 0.5);
      await page.evaluate(() => { const g = window.OP.game; for (const id of ['cutlass', 'padded_vest', 'iron_ring', 'lucky_charm', 'coconut', 'fruit_mera', 'fruit_hie']) window.OP.debug.addItem(g, id, 1); });
      await frames(page, 3);
      await snap('hud');

      // ---- inventory via the sidebar
      await page.click('.side-btn[title^="Inventory"]');
      await frames(page, 3);
      await snap('inventory');
      await page.locator('.inv-tile[title^="Pirate Cutlass"]').dragTo(page.locator('.eq-slot').first());
      await frames(page, 2);
      await page.locator('.inv-tile[title^="Padded Vest"]').dragTo(page.locator('.eq-slot', { hasText: 'Body' }));
      await frames(page, 2);
      await page.locator('.inv-tile[title^="Iron Ring"]').dragTo(page.locator('.eq-slot', { hasText: 'Accessory 1' }));
      await frames(page, 2);
      await page.locator('.inv-tile[title^="Coconut"]').dragTo(page.locator('.hb-slot').nth(3));
      await frames(page, 2);
      await page.locator('.hb-slot').nth(0).dragTo(page.locator('.hb-slot').nth(5));
      await frames(page, 2);
      console.log('after drags', JSON.stringify(await state(page)));
      await page.locator('.inv-tile[title^="Lucky Charm"]').click();
      await frames(page, 2);
      await snap('inventory-equipped');
      // eat one fruit, then the other can't be eaten
      await page.locator('.inv-tile[title^="Mera Mera"]').click();
      await page.getByRole('button', { name: 'Eat…' }).click();
      await frames(page, 2);
      await snap('eat-confirm');
      await page.getByRole('button', { name: 'Eat it' }).click();
      await frames(page, 2);
      await page.locator('.inv-tile[title^="Hie Hie"]').click();
      await frames(page, 2);
      const canEatSecond = await page.getByRole('button', { name: 'Eat…' }).count();
      console.log('fruit', JSON.stringify({ fruit: (await state(page)).fruit, canEatSecond }));
      await snap('second-fruit');

      // ---- switch menus with the sidebar
      for (const [btn, name] of [['Character', 'character'], ['Skills', 'skills'], ['Journal', 'journal'], ['Crew', 'crew']]) {
        await page.click(`.side-btn[title^="${btn}"]`);
        await frames(page, 3);
        await snap(name);
      }
      // found a crew
      await page.getByRole('button', { name: 'Raise the flag' }).first().click();
      await frames(page, 2);
      await page.locator('.panel.ask .btn.gold').click();
      await frames(page, 3);
      await snap('crew-founded');
      const crew = await page.evaluate(() => { const g = window.OP.game; return { name: g.state.char.crewName, shipsFlying: g.ships.filter((s) => s.owner === 'player' && s.jr).length }; });
      console.log('crew', JSON.stringify(crew));
      // Jolly Roger from the Character menu
      await page.click('.side-btn[title^="Character"]');
      await frames(page, 2);
      await page.getByRole('button', { name: 'Jolly Roger' }).click();
      await frames(page, 2);
      await snap('jolly-roger');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await frames(page, 2);

      // ---- pause menu: no World Map button, Save works
      await page.click('.side-btn[title^="Menu"]');
      await frames(page, 2);
      await snap('pause');
      const hasMap = await page.getByRole('button', { name: /World Map/ }).count();
      await page.getByRole('button', { name: 'Save game' }).click();
      await frames(page, 2);
      const saved = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('op-inherited-will:slot1:char:v1') || 'null'); return { ok: !!s, crew: s?.crewName, eq: s?.equipped }; });
      console.log('pause', JSON.stringify({ hasMap, saved }));
      await page.keyboard.press('Escape');
      await frames(page, 2);

      // ---- hotbar item use (slot 4 holds the coconut)
      const hpBefore = await page.evaluate(() => { const p = window.OP.game.player; p.hp = Math.round(p.d.maxHp * 0.5); return p.hp; });
      await page.evaluate(() => { window.OP.key('4', true); });
      await step(page, 0.1);
      await page.evaluate(() => { window.OP.key('4', false); });
      await step(page, 0.2);
      const hpAfter = await page.evaluate(() => window.OP.game.player.hp);
      console.log('hotbar coconut', JSON.stringify({ hpBefore, hpAfter }));

      // ---- foraging: walk up to a fruit tree and pick it
      const tree = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, w = g.world;
        const trees = w.objects.near(p.x, p.y, 160, (o) => o.kind === 'tree' && window.OP.debug.fruitOf(o));
        trees.sort((a, b) => w.distance(p.x, p.y, a.x, a.y) - w.distance(p.x, p.y, b.x, b.y));
        for (const o of trees) {
          for (const [dx, dy] of [[0, 0.8], [0.9, 0], [-0.9, 0], [0, -1.2]]) {
            const x = o.x + dx, y = o.y + dy;
            if (w.walkable(x, y - 0.1) && !w.isBlocked(x, y - 0.1)) { window.OP.teleport(x, y); return { fruit: window.OP.debug.fruitOf(o), sub: o.sub, at: [Math.round(o.x), Math.round(o.y)] }; }
          }
        }
        return null;
      });
      await step(page, 0.3);
      const label = await page.evaluate(() => window.OP.game.player.controller?.interaction?.label || null);
      await snap('forage-prompt');
      await page.evaluate(() => { window.OP.key('E', true); });
      await step(page, 0.1);
      await page.evaluate(() => { window.OP.key('E', false); });
      await step(page, 0.3);
      const picked = await page.evaluate((f) => { const c = window.OP.game.state.char; return c.inventory.filter((i) => i.id === f).reduce((s, i) => s + (i.qty || 1), 0); }, tree?.fruit || 'coconut');
      console.log('forage', JSON.stringify({ tree, label, picked }));

      // ---- theft lowers reputation
      const repBefore = (await state(page)).rep;
      await page.evaluate(() => window.OP.game.emit('openService', 'shop', { building: { name: 'General Store', role: 'shop', id: 'test_shop' } }));
      await frames(page, 3);
      await snap('shop');
      await page.getByRole('button', { name: 'Steal' }).first().click();
      await frames(page, 2);
      console.log('theft', JSON.stringify({ repBefore, repAfter: (await state(page)).rep }));
    },
  },
};
