// Boarding by hand (no prompts): come alongside, leave the helm and jump
// across — or swim over and climb her side; the helmsman leaves the wheel to
// fight; a Marine is welcomed aboard a Navy ship; overlapping hulls part.
//   node tools/shot.mjs boarding
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
const key = async (page, k, s = 0.05) => { await page.evaluate((k) => window.OP.key(k, true), k); await step(page, s); await page.evaluate((k) => window.OP.key(k, false), k); };

async function openWater(page) {
  return page.evaluate(() => {
    const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
    for (let k = 0; k < 40000; k++) {
      const a = Math.random() * Math.PI * 2, r = isl.radius * (0.9 + Math.random() * 1.2);
      const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
      if (w.sd(x, y) < -30) {
        let ok = true;
        for (let j = -20; j <= 20 && ok; j += 2) for (let i = -20; i <= 20 && ok; i += 2) if (!w.sailable(x + i, y + j)) ok = false;
        if (ok) return { x, y };
      }
    }
    return null;
  });
}

export const scenarios = {
  boarding: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.stormTarget = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      await step(page, 1);
      const spot = await openWater(page);
      console.log('spot', JSON.stringify(spot));
      // our sloop at the helm, a merchant hove to alongside
      const a = await page.evaluate((s) => {
        const g = window.OP.game, p = g.player;
        const mine = g.giveShip('sloop', s.x, s.y, 'Test Sloop', { heading: 0 });
        const o = g.traffic.spawn({ kind: 'merchant', type: 'caravel', x: s.x, y: s.y + 4.4, heading: 0, level: 6, dest: { x: s.x + 400, y: s.y + 4 } });
        o.traffic.surrender = true;
        window.__mine = mine; window.__o = o;
        p.x = mine.x; p.y = mine.y;
        window.OP.debug && null;
        return { mine: mine.name, other: o?.name };
      }, spot);
      console.log('ships', JSON.stringify(a));
      await page.evaluate(() => { const g = window.OP.game; g.emit('noop'); });
      // take our helm
      await page.evaluate(() => { const g = window.OP.game, p = g.player, s = window.__mine; p.x = s.x + 0.2; p.y = s.y + 1.4; });
      await step(page, 0.3);
      await key(page, 'E'); await step(page, 0.3);
      const helm = await page.evaluate(() => { const g = window.OP.game, p = g.player; return { mode: p.mode, prompt: p.controller.interaction?.label || null }; });
      console.log('at the helm (no boarding prompt expected)', JSON.stringify(helm));
      // leave the helm and jump across onto her deck
      if (helm.prompt && /Leave the helm/.test(helm.prompt)) { await key(page, 'E'); await step(page, 0.3); }
      const jump = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, s = window.__mine, o = window.__o;
        // to our rail on her side, facing her
        const toward = Math.atan2(o.y - s.y, g.world.dx(s.x, o.x));
        p.facing = toward;
        const rig = g.view3d?.rig; if (rig) rig.yaw = -toward + Math.PI / 2;
        return { onDeck: p.deck?.ship?.name || null, mode: p.mode };
      });
      console.log('walking our deck', JSON.stringify(jump));
      // put us at the rail and leap: move toward her while jumping
      const landed = await page.evaluate(async () => {
        const g = window.OP.game, p = g.player, s = window.__mine, o = window.__o;
        const dir = Math.atan2(o.y - s.y, g.world.dx(s.x, o.x));
        // (to the rail)
        p.x = s.x + Math.cos(dir) * 0.55; p.y = s.y + Math.sin(dir) * 0.55;
        p.tryJump(g, 1);
        for (let i = 0; i < 40; i++) { p.x += Math.cos(dir) * 0.12; p.y += Math.sin(dir) * 0.12; window.OP.step(1 / 30); if (p.deck?.ship === o) break; }
        window.OP.step(0.5);
        const tr = o.traffic;
        return { onDeck: p.deck?.ship?.name || null, raided: tr.raided, hostile: (tr.crew || []).filter((x) => x.controller?.kind === 'hostile').length, helmsman: tr.crew?.[0] ? { name: tr.crew[0].name, stationary: !!tr.crew[0].stationary } : null, bounty: g.state.char.bounty };
      });
      console.log('jumped across', JSON.stringify(landed));
      await step(page, 1);
      await snap('boarding-jump');
      // swim to a second merchant and climb her side
      const climb = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, s = window.__mine;
        const o2 = g.traffic.spawn({ kind: 'merchant', type: 'caravel', x: s.x + 30, y: s.y, heading: 0, level: 6, dest: { x: s.x + 400, y: s.y } });
        o2.traffic.surrender = true;
        window.__o2 = o2;
        // into the water beside her hull
        if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
        p.x = o2.x; p.y = o2.y + o2.def.beam * 0.5 + 0.9; p.z = 0;
        window.OP.step(0.6);
        const before = { inWater: p.inWater, dk: !!g.deckAt(p.x, p.y, -1.3), prompt: p.controller.interaction?.label || null };
        const ok = p.tryJump(g, 0);
        window.OP.step(0.5);
        return { before, jumped: ok, onDeck: p.deck?.ship?.name || null, raided: o2.traffic.raided };
      });
      console.log('climbed', JSON.stringify(climb));
      // a Marine aboard a Navy ship
      const navy = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, c = g.state.char, s = window.__mine;
        c.faction = 'marine'; c.marineRank = 'Seaman Recruit'; c.bounty = 0;
        const m = g.traffic.spawn({ kind: 'marine', type: 'brigantine', x: s.x - 40, y: s.y, heading: 0, level: 8, dest: { x: s.x + 400, y: s.y } });
        if (!m) return 'no marine ship';
        window.OP.step(0.5);
        if (p.deck) { p.deck.ship.aboard?.delete(p); p.deck = null; }
        const dk = window.OP.debug.deckSpot(m, 'hatch');
        p.x = dk.x; p.y = dk.y; p.z = 0;
        window.OP.debug.onDeck(m, 0.5, 0);
        window.OP.step(1);
        return { onDeck: p.deck?.ship?.name, raided: !!m.traffic.raided, welcomed: !!m.traffic.welcomed, hostile: (m.traffic.crew || []).filter((x) => x.controller?.kind === 'hostile').length };
      });
      console.log('marine aboard a navy ship', JSON.stringify(navy));
      // two hulls on top of each other part
      const part = await page.evaluate(() => {
        const g = window.OP.game, s = window.__mine;
        const x = s.x - 80, y = s.y;
        const a = g.traffic.spawn({ kind: 'merchant', type: 'caravel', x, y, heading: 0, level: 5, dest: { x: x + 400, y } });
        const b = g.traffic.spawn({ kind: 'merchant', type: 'caravel', x: x + 1, y: y + 0.6, heading: 0.2, level: 5, dest: { x: x + 400, y } });
        if (!a || !b) return 'spawn failed';
        const d0 = g.world.distance(a.x, a.y, b.x, b.y);
        window.OP.step(4);
        const d1 = g.world.distance(a.x, a.y, b.x, b.y);
        return { d0: +d0.toFixed(2), d1: +d1.toFixed(2), beam: a.def.beam };
      });
      console.log('overlap', JSON.stringify(part));
    },
  },
};
