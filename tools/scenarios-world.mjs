// World checks: collisions and placements.
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
export const scenarios = {
  // everyday poses in a row, facing the camera
  poses: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      await page.evaluate((list) => {
        const g = window.OP.game, w = g.world, p = g.player;
        g.env.clock = 11;
        g.settings.view = 'first'; g.applySettings();
        // an open, flat spot: walk out from the spawn until there's room
        const kinds = list.split(',');
        const { makeNPC } = window.OP.debug;
        const fx = Math.cos(p.facing || 0), fy = Math.sin(p.facing || 0);
        const x0 = p.x + fx * 3.2, y0 = p.y + fy * 3.2;
        kinds.forEach((k, i) => {
          const off = (i - (kinds.length - 1) / 2) * 1.25;
          const a = makeNPC({ id: 'pose_' + k, name: k, level: 3, faction: 'civilian', ai: 'idle' }, x0 - fy * off, y0 + fx * off);
          a.game = g; g.addActor(a);
          a.facing = Math.atan2(-fy, -fx);
          const [pose, h] = k.split('@');
          a.act3d = { pose, h: +(h || 0), prop: { sweep: 'broom', fish: 'rod', drunk: 'mug' }[pose] || null };
          a.showName = true;
        });
        const v = g.view3d; v.rig.yaw = p.facing || 0; v.rig.pitch = -0.12;
      }, args.kinds || 'sit@0.62,sit@0.22,lean,sweep,vend,fish@0.05,drunk,chat');
      for (let i = 0; i < 12; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => { const v = window.OP.game.view3d; if (v.vm) v.vm.root.visible = false; });
      await frames(page, 2);
      await snap('row');
    },
  },
  // town life: what people are doing, and a look at each kind of activity
  townlife: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      const id = await page.evaluate(({ id, clock }) => {
        const g = window.OP.game, w = g.world, p = g.player;
        const isl = (id && w.islands.find((i) => i.id === id)) || w.islandAt(p.x, p.y) || w.nearestIsland(p.x, p.y, 80);
        g.env.clock = clock;
        const t = isl.towns[0];
        window.OP.teleport(t.plaza.x + 2, t.plaza.y + 3);
        g.spawner.refresh(isl.id);
        return isl.id;
      }, { id: args.island || null, clock: +(args.clock || 11) });
      for (let i = 0; i < 40; i++) await step(page, 0.1);
      const census = await page.evaluate(() => {
        const g = window.OP.game;
        const out = {};
        for (const a of g.actors) if (a.townsfolk && a.alive) { const k = (a.activity?.kind || 'none') + (a.activity?.phase ? ':' + a.activity.phase : ''); out[k] = (out[k] || 0) + 1; }
        return out;
      });
      console.log('townlife', id, JSON.stringify(census));
      await page.evaluate((c) => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); window.__closeup = c; }, !!args.closeup);
      for (const kind of (args.kinds || 'lean,sit,chat,vend,sweep,fish,play,drunk,stroll').split(',')) {
        const ok = await page.evaluate((kind) => {
          const g = window.OP.game, w = g.world, p = g.player;
          const a = g.actors.find((x) => x.townsfolk && x.alive && x.activity?.kind === kind && (x.activity.phase === 'do' || kind === 'stroll' || kind === 'play'));
          if (!a) return false;
          // stand 3.5 m in front of them, looking back at them
          const f = a.facing || 0;
          const R = window.__closeup ? 2.0 : 3.2;
          let best = null;
          for (let k = 0; k < 12 && !best; k++) {
            const ang = f + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
            const x = a.x + Math.cos(ang) * R, y = a.y + Math.sin(ang) * R;
            if (w.walkable(x, y) && !w.isBlocked(x, y) && p.canOccupy(w, x, y)) best = { x, y };
          }
          if (!best) return false;
          window.OP.teleport(best.x, best.y);
          const v = g.view3d;
          v.rig.yaw = Math.atan2(a.y - p.y, w.dx(p.x, a.x));
          v.rig.pitch = -0.18;
          window.__watch = a;
          return true;
        }, kind);
        if (!ok) { console.log('no', kind); continue; }
        for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
        await snap(kind);
      }
    },
  },
  // walk-in buildings: a door that opens, walls that hold, a keeper at the counter, a house door kicked in
  interior: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => window.OP.quickStart('human'));
      const info = await page.evaluate(({ id, role }) => {
        const g = window.OP.game, w = g.world, p0 = g.player;
        // the named island, or the nearest one with a building of that role
        const has = (i) => i.towns.some((t) => t.buildings.some((b) => b.enterable && (role ? b.role === role : (b.role || 'house') !== 'house')));
        const isl = (id && w.islands.find((i) => i.id === id && has(i))) || w.islands.filter(has).sort((a, b) => w.distance(p0.x, p0.y, a.x, a.y) - w.distance(p0.x, p0.y, b.x, b.y))[0];
        const all = isl.towns.flatMap((t) => t.buildings);
        const shop = all.find((b) => b.enterable && (role ? b.role === role : (b.role || 'house') !== 'house'));
        g.env.clock = +(window.__clock || 12);
        g.settings.view = 'first'; g.applySettings();
        g.buildings.t = 0;
        const d = g.buildings.doorPts(shop);
        window.OP.teleport(d.x, d.out + 1.6);
        const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.02;
        window.__shop = shop;
        return { buildings: all.length, enterable: all.filter((b) => b.enterable).length, pirates: all.filter((b) => b.pirate).length, shop: { role: shop.role, name: shop.name, fw: shop.fw, fd: shop.fd, style: shop.style } };
      }, { id: args.island || (args.role ? null : 'dawn_island'), role: args.role || null });
      console.log('interior', JSON.stringify(info));
      await page.evaluate(() => { window.OP.game.spawner.t = 0; });
      await step(page, 0.6);
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('outside');
      // walk in until a step past the doorway
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 30; i++) {
        await step(page, 0.1); await frames(page, 1);
        if (await page.evaluate(() => { const b = window.__shop, p = window.OP.game.player; return p.y < b.y - 0.9; })) break;
      }
      await page.evaluate(() => window.OP.key('W', false));
      await step(page, 0.3); await frames(page, 3);
      const inside = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, b = window.__shop;
        const d = g.buildings.doorPts(b);
        return {
          inside: w.interiorAt(p.x, p.y) === b, pos: [+(p.x - b.x).toFixed(2), +(p.y - b.y).toFixed(2)], doorOpen: b.doorOpen,
          people: g.actors.filter((a) => a.homeB === b).map((a) => a.name),
          floor: +(g.view3d.ground(p.x, p.y) - g.view3d.ground(d.x, d.out + 1)).toFixed(2),
          walls: {
            back: p.canOccupy(w, b.x, b.y - b.fd + 0.12), left: p.canOccupy(w, b.x - b.fw / 2 + 0.12, b.y - b.fd / 2),
            frontBesideDoor: p.canOccupy(w, d.x - d.dw / 2 - 0.3, b.y - 0.1), doorway: p.canOccupy(w, d.x, d.mid),
          },
        };
      });
      console.log('inside', JSON.stringify(inside));
      await snap('inside');
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = -Math.PI / 2 + 1.0; });
      await step(page, 0.1); await frames(page, 2); await snap('inside-left');
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = Math.PI / 2; });
      await step(page, 0.1); await frames(page, 2); await snap('inside-door');
      // a house: locked, then kicked in
      const kick = await page.evaluate(() => {
        const g = window.OP.game, B = g.buildings, w = g.world, p = g.player;
        const isl = w.islandAt(p.x, p.y) || w.nearestIsland(p.x, p.y, 60);
        const house = isl.towns.flatMap((t) => t.buildings).find((b) => b.enterable && (b.role || 'house') === 'house' && !b.npc && !b.pirate);
        if (!house) return null;
        window.__house = house;
        const d = B.doorPts(house);
        window.OP.teleport(d.x, d.out + 0.4);
        B.t = 0; B.update(0.016);
        const before = { locked: house.doorLocked, open: !!house.doorOpen, blocked: !p.canOccupy(w, d.x, d.mid), bounty: g.state.char.bounty };
        B.breakDoor(house);
        B.update(0.016);
        const after = { open: house.doorOpen, broken: house.doorBroken, walkIn: p.canOccupy(w, d.x, d.mid), bounty: g.state.char.bounty };
        const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.1;
        window.OP.teleport(d.x + 0.3, d.out + 1.8);
        return { before, after };
      });
      console.log('kick', JSON.stringify(kick));
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('kicked');
      // a bandit follows you in through the doorway (and doesn't walk into the wall)
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player, house = window.__house;
        if (!house) return;
        const d = g.buildings.doorPts(house);
        p.invulnerable = true;
        window.OP.teleport(d.x + 0.5, house.y - house.fd + 0.9);
        const e = window.OP.debug.makeNPC({ id: 'test_bandit', name: 'Test Bandit', level: 3, hostile: true, faction: 'bandit' }, d.x + 3.5, d.out + 2.5);
        e.game = g; g.addActor(e); e.aggroPlayer = true; e.controller.target = p; e.controller.state = 'chase'; e.controller.leash = 60;
        window.__bandit = e;
      });
      const trail = [];
      for (let i = 0; i < 50; i++) {
        await step(page, 0.1);
        if (i % 5 === 4) trail.push(await page.evaluate(() => { const g = window.OP.game, e = window.__bandit, p = g.player; return e ? +g.world.distance(e.x, e.y, p.x, p.y).toFixed(2) : null; }));
      }
      const got = await page.evaluate(() => { const g = window.OP.game, e = window.__bandit; return e ? { inside: g.world.interiorAt(e.x, e.y) === window.__house, state: e.controller.state } : null; });
      console.log('chase', JSON.stringify({ trail, ...got }));
    },
  },
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
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      // looking away from the fruit: no prompt; looking at one fruit: pick just that one
      const aimAt = (k) => page.evaluate((k) => {
        const g = window.OP.game, w = g.world, p = g.player, v = g.view3d;
        const t = w.objects.near(p.x, p.y, 4, (o) => o.kind === 'tree' && o._fruitPts)[0];
        if (!t) return null;
        if (k < 0) { v.rig.yaw += Math.PI; v.rig.pitch = 0; return { away: true }; }
        const [px, py, pz] = t._fruitPts[k];
        const s = t.s || 1, cy = Math.cos(t._yaw), sy = Math.sin(t._yaw);
        const fx = t.x + (px * cy + pz * sy) * s, fy = t.y + (-px * sy + pz * cy) * s, fh = t._gy + py * s;
        const ray = v.aimRay();
        v.rig.yaw = Math.atan2(fy - ray.y, w.dx(ray.x, fx));
        v.rig.pitch = Math.atan2(fh - ray.h, Math.hypot(w.dx(ray.x, fx), fy - ray.y));
        window.__tree = t;
        return { n: t._fruitPts.length };
      }, k);
      const read = () => page.evaluate(() => {
        const g = window.OP.game, p = g.player, c = g.state.char;
        g.update(1 / 60);
        const it = p.controller?.interaction;
        return { label: it ? it.label : null, bag: c.inventory.map((i) => i.id + 'x' + (i.qty || 1)).join(',') };
      });
      await aimAt(-1); await step(page, 0.1);
      console.log('away', JSON.stringify(await read()));
      console.log('aim', JSON.stringify(await aimAt(0))); await step(page, 0.1);
      const before = await read();
      await page.evaluate(() => { const it = window.OP.game.player.controller?.interaction; if (it) it.run(); });
      const after = await read();
      const state = await page.evaluate(() => {
        const g = window.OP.game, t = window.__tree;
        const { fruitPicked } = window.OP.debug;
        return fruitPicked ? [...Array(t._fruitN).keys()].map((i) => fruitPicked(g.world.id, t, i, g.env.day)) : null;
      });
      console.log('pick', JSON.stringify({ before, after, picked: state }));
      await step(page, 0.2); await frames(page, 3);
      await snap('picked-one');
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
