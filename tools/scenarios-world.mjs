// World checks: collisions and placements.
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
export const scenarios = {
  // crimes earn a One Piece-style bounty; reputation never goes below zero
  bounty: {
    async run(page) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      const r = await page.evaluate(() => {
        const g = window.OP.game;
        window.OP.quickStart('human');
        const c = g.state.char, R = g.reputation, out = { sea: R.sea() };
        c.bounty = 0; c.faction = 'civilian'; c.reputation = 0;
        R.change(-20, 'test');
        out.floor = c.reputation;
        R.change(30, 'good deeds');
        R.crime(200000, 'picked a pocket', { rep: 3 });
        out.afterPick = { rep: c.reputation, bounty: c.bounty, faction: c.faction };
        for (let i = 0; i < 5; i++) R.crime(800000, 'robbed a house', { rep: 8 });
        out.afterRobs = { rep: c.reputation, bounty: c.bounty };
        // a big pirate's pickpocketing doesn't change the poster
        c.bounty = 150000000; R.crime(200000, 'picked a pocket');
        out.big = c.bounty;
        // old save with negative reputation
        c.bounty = 0; c.faction = 'civilian'; c.reputation = -40;
        g.emit('characterStart', { char: c, isNew: false });
        out.converted = { rep: c.reputation, bounty: c.bounty };
        // a Marine loses standing, then the uniform
        c.bounty = 0; c.faction = 'marine'; c.marineRank = 'Seaman'; c.reputation = 26;
        let n = 0; while (c.faction === 'marine' && n < 20) { R.crime(300000, 'stole from a shop', { rep: 4 }); n++; }
        out.marine = { crimes: n, faction: c.faction, bounty: c.bounty, rep: c.reputation, former: c.flags.formerMarine };
        return out;
      });
      console.log('bounty', JSON.stringify(r));
      const fail = [];
      if (r.floor !== 0) fail.push('reputation went negative');
      if (r.afterPick.bounty !== 200000 * (r.sea === 'east_blue' ? 1 : r.afterPick.bounty / 200000) || r.afterPick.faction !== 'pirate' || r.afterPick.rep !== 27) fail.push('first crime');
      if (!(r.afterRobs.bounty > r.afterPick.bounty) || r.afterRobs.rep !== 0) fail.push('repeat crimes');
      if (r.big !== 150000000) fail.push('big bounty moved');
      if (r.converted.rep !== 0 || r.converted.bounty !== 6000000) fail.push('old save conversion');
      if (r.marine.faction !== 'civilian' || r.marine.bounty !== 0 || r.marine.crimes > 6) fail.push('marine discharge');
      if (fail.length) throw new Error(fail.join('; '));
    },
  },
  // every Devil Fruit exists once in a world
  fruitsunique: {
    async run(page) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      const r = await page.evaluate(() => {
        const g = window.OP.game;
        window.OP.quickStart('human');
        // a fresh world for a lineage whose past users ate the Gomu Gomu three times
        g.state.legacy = { ...(g.state.legacy || {}), reincarnatedFruits: ['gomu', 'gomu', 'mera', 'gomu'] };
        const c = g.state.char;
        c.world = { ...c.world, fruitSpawns: null, fruitsTaken: [] };
        c.runSeed = 'dup-test';
        g.emit('characterStart', { char: c, isNew: true });
        const spawns = c.world.fruitSpawns.map((f) => f.fruit);
        const rolls = [];
        const rng = { weighted: (l) => l[Math.floor(Math.random() * l.length)][0] };
        for (let i = 0; i < 40; i++) { const f = g.rollFruit(rng); if (f) rolls.push(f); }
        const all = [...spawns, ...rolls];
        const dup = all.filter((f, i) => all.indexOf(f) !== i);
        return { spawns, dup, gomu: all.filter((f) => f === 'gomu').length, taken: c.world.fruitsTaken.length };
      });
      console.log('fruits', JSON.stringify(r));
      if (r.dup.length) throw new Error('duplicate fruits: ' + r.dup.join(','));
    },
  },
  // picking fruit from a tree puts it in the bag
  pickfruit: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      const r = await page.evaluate(async () => {
        const g = window.OP.game, w = g.world, p = g.player;
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        const { fruitOf } = window.OP.debug;
        // find a fruit tree on the island
        const trees = w.objects.near(isl.x, isl.y, isl.radius, (o) => o.kind === 'tree');
        const withFruit = trees.filter((o) => window.OP.debug.fruitOf ? window.OP.debug.fruitOf(o) : false);
        const t = withFruit[0];
        if (!t) return { trees: trees.length, fruitTrees: 0 };
        window.OP.teleport(t.x + 0.7, t.y + 0.4);
        return { trees: trees.length, fruitTrees: withFruit.length, at: [t.x, t.y], sub: t.sub };
      });
      console.log('tree', JSON.stringify(r));
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      const res = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, c = g.state.char;
        const before = c.inventory.map((i) => i.id + 'x' + (i.qty || 1)).join(',');
        const it = p.controller?.interaction;
        const label = it ? it.label : null;
        if (it) it.run();
        const after = c.inventory.map((i) => i.id + 'x' + (i.qty || 1)).join(',');
        return { label, before, after };
      });
      console.log('pick', JSON.stringify(res));
    },
  },
  // Otto on the Notice Cup ring (he used to stand inside it)
  otto: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      const s = await page.evaluate(() => {
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => i.id === 'notice');
        const r = isl.spots.notice_ring;
        window.OP.teleport(r.x, r.y + 7);
        g.env.clock = 12;
        return r;
      });
      for (let i = 0; i < 30; i++) { await step(page, 0.1); await frames(page, 1); }
      const info = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, o = g.actors.find((a) => a.npcId === 'nb_otto');
        if (!o) return null;
        const v = g.view3d;
        return { x: o.x, y: o.y, floor: w.floorAt(o.x, o.y), ground: v.ground(o.x, o.y), terrain: v.terrain.terrainAt(o.x, o.y) };
      });
      console.log('otto', JSON.stringify(info));
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.12; });
      await step(page, 0.2); await frames(page, 3);
      await snap('ring');
    },
  },
  // invisible barriers: how close you can stand to each town prop from 8 directions,
  // and blocked tiles in town that no object accounts for
  barriers: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      const rep = await page.evaluate((id) => {
        const g = window.OP.game, w = g.world, p = g.player;
        const isl = w.islands.find((i) => i.id === id);
        const t = isl.towns[0];
        const objs = w.objects.near(t.plaza.x, t.plaza.y, 45);
        const kinds = {};
        for (const o of objs) {
          if (!o.block || o.kind === 'building') continue;
          const k = kinds[o.kind] || (kinds[o.kind] = { n: 0, min: 9, max: 0, r: o.col ? +(o.col.r ?? o.col.hw).toFixed(2) : null });
          for (let a = 0; a < 8; a++) {
            const ca = Math.cos(a * Math.PI / 4), sa = Math.sin(a * Math.PI / 4);
            let d = 0;
            while (d < 2.5 && !p.canOccupy(w, o.x + ca * d, o.y + sa * d)) d += 0.05;
            k.min = Math.min(k.min, d); k.max = Math.max(k.max, d);
          }
          k.n++;
        }
        // blocked tiles near the plaza not covered by any blocking object's footprint
        let stray = 0; const where = [];
        for (let y = Math.floor(t.plaza.y - 30); y < t.plaza.y + 30; y++) for (let x = Math.floor(t.plaza.x - 30); x < t.plaza.x + 30; x++) {
          if (!w.isBlocked(x, y)) continue;
          const own = w.objects.near(x + 0.5, y + 0.5, 14).some((o) => { if (!o.block || o.soft) return false; const w0 = o.fw || 1, d0 = o.fd || 1; const x0 = Math.floor(o.x - w0 / 2 + 0.001), y0 = Math.floor(o.y - d0 + 0.001); return x >= x0 && x < x0 + w0 && y >= y0 && y < y0 + d0; });
          if (!own) { stray++; if (where.length < 6) where.push([x, y]); }
        }
        for (const k of Object.values(kinds)) { k.min = +k.min.toFixed(2); k.max = +k.max.toFixed(2); }
        return { town: t.name, kinds, stray, where, colliderCells: w.colliders.size };
      }, args.island || 'dawn_island');
      console.log('barriers', JSON.stringify(rep));
    },
  },
};
