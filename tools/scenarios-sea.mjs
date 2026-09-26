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

  // diving: out to deep water, swim down, hold the breath, run out of stamina, tread water
  dive: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((race) => { window.OP.quickStart(race || 'human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; }, args.race);
      // a spot of open sea ~20 m off Dawn Island's shore
      const spot = await page.evaluate((off) => {
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.6 + Math.random() * 1.2);
          const x = Math.floor(isl.x + Math.cos(a) * r), y = Math.floor(isl.y + Math.sin(a) * r);
          const d = w.sd(x, y);
          if (d < -off && d > -off - 1.5) return [x + 0.5, y + 0.5, a + Math.PI];
        }
        return null;
      }, Number(args.off || 18));
      console.log('sea spot', JSON.stringify(spot));
      await page.evaluate(([x, y]) => window.OP.teleport(x, y), spot);
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      const st = () => page.evaluate(() => { const p = window.OP.game.player; return { water: p.inWater, depth: +p.depth.toFixed(2), under: p.under, o2: p.oxygen == null ? null : +p.oxygen.toFixed(1), sta: +p.stamina.toFixed(1), hp: Math.round(p.hp), floor: +(window.OP.game.seaDepth(p.x, p.y)).toFixed(1) }; });
      console.log('afloat', JSON.stringify(await st()));
      await page.evaluate((a) => { const v = window.OP.game.view3d; v.rig.yaw = a; v.rig.pitch = -0.15; }, spot[2]);
      await step(page, 0.2); await frames(page, 3);
      await snap('tread');
      // swim forward (crawl)
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('crawl');
      await page.evaluate(() => window.OP.key('W', false));
      // dive: hold C
      await page.evaluate(() => window.OP.key('C', true));
      for (let i = 0; i < 30; i++) await step(page, 0.1);
      await page.evaluate(() => window.OP.key('C', false));
      console.log('dove 3s', JSON.stringify(await st()));
      await step(page, 0.1); await frames(page, 3);
      await snap('under-third');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.25; });
      await step(page, 0.1); await frames(page, 3);
      await snap('under-first');
      await page.evaluate(() => { window.OP.game.view3d.rig.pitch = 0.9; });
      await step(page, 0.1); await frames(page, 3);
      await snap('under-lookup');
      // keep going to the bottom
      await page.evaluate(() => { window.OP.game.view3d.rig.pitch = -0.3; window.OP.key('C', true); });
      for (let i = 0; i < 60; i++) await step(page, 0.1);
      await page.evaluate(() => window.OP.key('C', false));
      console.log('dove 9s', JSON.stringify(await st()));
      await step(page, 0.1); await frames(page, 3);
      await snap('deep');
      // hold the breath until it runs out
      for (let i = 0; i < 30; i++) await step(page, 0.5);
      console.log('held 15s more', JSON.stringify(await st()));
      // come up for air
      await page.evaluate(() => window.OP.key('Space', true));
      for (let i = 0; i < 80; i++) { await step(page, 0.1); const s = await st(); if (!s.under && s.depth < 0.05) break; }
      await page.evaluate(() => window.OP.key('Space', false));
      console.log('surfaced', JSON.stringify(await st()));
      // exhausted: keep swimming with no stamina → hurt and sinking; then stop and tread
      await page.evaluate(() => { const p = window.OP.game.player; p.stamina = 0; p.oxygen = p.maxOxygen; window.OP.key('W', true); });
      for (let i = 0; i < 20; i++) await step(page, 0.1);
      console.log('spent swimming 2s', JSON.stringify(await st()));
      await page.evaluate(() => window.OP.key('W', false));
      for (let i = 0; i < 40; i++) await step(page, 0.1);
      console.log('treading 4s', JSON.stringify(await st()));
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.view3d.rig.pitch = -0.2; });
      await step(page, 0.1); await frames(page, 3);
      await snap('rest');
    },
  },

  // the swim strokes from the side: tread, crawl, dive, float, a Fish-Man, a Devil Fruit user
  swimside: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((race) => { window.OP.quickStart(race || 'human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; }, args.race);
      const spot = await page.evaluate(() => {
        const w = window.OP.game.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.6 + Math.random() * 1.2);
          const x = Math.floor(isl.x + Math.cos(a) * r), y = Math.floor(isl.y + Math.sin(a) * r);
          const d = w.sd(x, y);
          if (d < -30 && d > -32) return [x + 0.5, y + 0.5, a + Math.PI];
        }
      });
      await page.evaluate(([x, y]) => { window.OP.teleport(x, y); document.querySelector('.look-hint')?.remove(); window.OP.game.view3d.rig.tp.dist = Number(3); }, spot);
      const side = async (name, keys, secs = 1.2, pitch = -0.12) => {
        await page.evaluate(([keys, pitch]) => { const v = window.OP.game.view3d; v.rig.pitch = pitch; for (const k of keys) window.OP.key(k, true); }, [keys, pitch]);
        for (let i = 0; i < secs * 10; i++) { await step(page, 0.1); await frames(page, 1); }
        await snap(name);
        await page.evaluate((keys) => { for (const k of keys) window.OP.key(k, false); }, keys);
      };
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      // treading: turn the camera to see the swimmer side-on
      await page.evaluate(() => { const g = window.OP.game; g.view3d.rig.yaw = g.player.facing + Math.PI / 2; });
      await side('tread', [], 0.6);
      await side('crawl', ['D'], 1.6);
      await side('dive', ['D', 'C'], 2.2, -0.2);
      await side('float', [], 1.2, -0.2);
      await side('rise', ['D', 'Space'], 1.0, -0.2);
      // a Fish-Man under water
      await page.evaluate(() => { const p = window.OP.game.player; p.gills = true; });
      await side('fish-dive', ['D', 'C'], 1.5, -0.2);
      await side('fish', ['D'], 1.2, -0.2);
      await page.evaluate(() => { const p = window.OP.game.player; p.gills = false; p.depth = 0; p.fruit = 'gomu'; });
      await side('struggle', [], 1.0, -0.12);
      const st = await page.evaluate(() => { const p = window.OP.game.player; return { depth: +p.depth.toFixed(2), o2: +p.oxygen.toFixed(1), hp: Math.round(p.hp) }; });
      console.log('df', JSON.stringify(st));
    },
  },

  // a dive on a coral reef (warm sea) or in a kelp forest (--cold)
  reef: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; });
      const spot = await page.evaluate(([cold, off]) => {
        const g = window.OP.game, w = g.world;
        const want = cold ? [3] : [1, 4];
        const isls = w.islands.filter((i) => want.includes(w.climate(i.x, i.y)) && i.radius > 20);
        isls.sort((a, b) => w.distance(a.x, a.y, g.player.x, g.player.y) - w.distance(b.x, b.y, g.player.x, g.player.y));
        for (const isl of isls.slice(0, 12)) {
          for (let k = 0; k < 6000; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius * (0.6 + Math.random() * 1.2);
            const x = Math.floor(isl.x + Math.cos(a) * r), y = Math.floor(isl.y + Math.sin(a) * r);
            const d = w.sd(x, y);
            if (w.type(x, y) === 0 && d < -off && d > -off - 1) return { x: x + 0.5, y: y + 0.5, a: a + Math.PI, isl: isl.name || isl.id };
          }
        }
        return null;
      }, [!!args.cold, Number(args.off || 8)]);
      console.log('spot', JSON.stringify(spot));
      await page.evaluate((s) => { window.OP.teleport(s.x, s.y); document.querySelector('.look-hint')?.remove(); const v = window.OP.game.view3d; v.rig.yaw = s.a + Math.PI; v.rig.pitch = -0.35; }, spot);
      for (let i = 0; i < 20; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('surface');
      // down to the bottom
      await page.evaluate(() => window.OP.key('C', true));
      for (let i = 0; i < 40; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => window.OP.key('C', false));
      const st = await page.evaluate(() => { const p = window.OP.game.player, v = window.OP.game.view3d; return { depth: +p.depth.toFixed(2), floor: +window.OP.game.seaDepth(p.x, p.y).toFixed(1), counts: Object.fromEntries(Object.entries(v.seabed?.meshes || {}).map(([k, m]) => [k, m.count])) }; });
      console.log('bottom', JSON.stringify(st));
      await page.evaluate(() => { window.OP.game.view3d.rig.pitch = -0.15; });
      await step(page, 0.1); await frames(page, 3);
      await snap('reef-third');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.2; });
      await step(page, 0.1); await frames(page, 3);
      await snap('reef-first');
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw += 2.2; v.rig.pitch = 0.05; });
      await step(page, 0.1); await frames(page, 3);
      await snap('reef-first2');
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.pitch = 0.8; });
      await step(page, 0.1); await frames(page, 3);
      await snap('reef-up');
      // swimming along in first person (the arms pull a breaststroke)
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.pitch = -0.05; window.OP.key('W', true); window.OP.key('Space', true); });
      for (let i = 0; i < 14; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => window.OP.key('Space', false));
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('fp-swim');
      await step(page, 0.25); await frames(page, 2);
      await snap('fp-swim2');
      await page.evaluate(() => window.OP.key('W', false));
      for (let i = 0; i < 40; i++) { await step(page, 0.1); await frames(page, 1); const u = await page.evaluate(() => window.OP.game.player.under); if (!u) break; }
      await page.evaluate(() => { window.OP.game.view3d.rig.pitch = -0.1; });
      await step(page, 0.3); await frames(page, 3);
      await snap('fp-tread');
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },

  // sea life: fish schools around a reef, catching one by hand, a shark, a giant clam
  sealife: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; });
      // a warm reef with a giant clam on it
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world;
        const isls = w.islands.filter((i) => [1, 4].includes(w.climate(i.x, i.y)) && i.radius > 20);
        isls.sort((a, b) => w.distance(a.x, a.y, g.player.x, g.player.y) - w.distance(b.x, b.y, g.player.x, g.player.y));
        for (const isl of isls.slice(0, 20)) {
          const R = Math.ceil(isl.radius * 1.8);
          for (let j = -R; j <= R; j += 1) for (let i = -R; i <= R; i += 1) {
            const x = Math.floor(isl.x) + i, y = Math.floor(isl.y) + j;
            if (w.type(x, y) !== 0) continue;
            const d = g.seaDepth(x + 0.5, y + 0.5);
            if (d < 3 || d > 12) continue;
            // (the same test the game uses)
            if (window.OP.debug?.clamAt?.(w, x, y, d)) return { x: x + 0.5, y: y + 0.5, depth: d, isl: isl.name || isl.id };
          }
        }
        return null;
      });
      console.log('clam spot', JSON.stringify(spot));
      await page.evaluate((s) => { window.OP.teleport(s.x + 1.6, s.y + 0.4); document.querySelector('.look-hint')?.remove(); }, spot);
      for (let i = 0; i < 40; i++) { await step(page, 0.1); await frames(page, 1); }
      const schools = await page.evaluate(() => window.OP.game.seaLife.schools.map((s) => `${s.kind}:${s.fish.length}@${s.z.toFixed(1)}`));
      console.log('schools', JSON.stringify(schools));
      // down to the clam
      await page.evaluate(() => window.OP.key('C', true));
      for (let i = 0; i < 60; i++) { await step(page, 0.1); const d = await page.evaluate(() => window.OP.game.player.depth); if (d > 1 && (await page.evaluate(() => { const p = window.OP.game.player; return p.depth >= window.OP.game.seaDepth(p.x, p.y) - 0.5; }))) break; }
      await page.evaluate(() => window.OP.key('C', false));
      const it = await page.evaluate((s) => { const g = window.OP.game, p = g.player; g.view3d.rig.yaw = Math.atan2(s.y - p.y, g.world.dx(p.x, s.x)); g.view3d.rig.pitch = -0.3; return { depth: +p.depth.toFixed(2) }; }, spot);
      await step(page, 0.2); await frames(page, 3);
      const lbl = await page.evaluate(() => window.OP.game.player.controller?.interaction?.label || null);
      console.log('at clam', JSON.stringify(it), 'prompt', lbl);
      await snap('clam');
      await page.evaluate(() => window.OP.key('E', true)); await step(page, 0.05); await page.evaluate(() => window.OP.key('E', false)); await step(page, 0.1);
      const inv = () => page.evaluate(() => Object.fromEntries(window.OP.game.state.char.inventory.filter((i) => /fish|tuna|pearl|shark/.test(i.id)).map((i) => [i.id, i.qty])));
      console.log('after clam', JSON.stringify(await inv()));
      // up a little and look at the fish
      const near = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, S = g.seaLife;
        let best = null;
        for (const s of S.schools) { if (s.def.critter) continue; const d = g.world.distance(s.x, s.y, p.x, p.y); if (!best || d < best.d) best = { s, d }; }
        if (!best) return null;
        const s = best.s;
        p.depth = Math.max(0.5, s.z - 0.3);
        // teleport beside the school, facing it
        const bx = s.x - Math.cos(s.hd) * 3, by = s.y - Math.sin(s.hd) * 3;
        window.OP.teleport(bx, by);
        g.view3d.rig.yaw = s.hd; g.view3d.rig.pitch = -0.05;
        return { kind: s.kind, n: s.fish.length, z: s.z };
      });
      console.log('school', JSON.stringify(near));
      for (let i = 0; i < 3; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('school-third');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
      await step(page, 0.1); await frames(page, 3);
      await snap('school-first');
      // grab a fish: right beside one, facing it
      let caught = 0;
      for (let k = 0; k < 6 && !caught; k++) {
        await page.evaluate(() => {
          const g = window.OP.game, p = g.player, S = g.seaLife, P = { x: 0, y: 0, z: 0 };
          const s = S.schools.find((s) => !s.def.critter && s.fish.some((f) => f.alive));
          if (!s) return;
          const f = s.fish.find((f) => f.alive);
          s.scare = 0;
          S.fishPos(s, f, P);
          p.x = P.x - Math.cos(s.hd) * 0.8; p.y = P.y - Math.sin(s.hd) * 0.8; p.depth = Math.max(0, P.z - 0.35); p.facing = s.hd;
          p.tryM1(g);
        });
        await step(page, 0.3);
        const inv2 = await inv();
        caught = inv2.fresh_fish || inv2.tuna || 0;
      }
      console.log('after grabbing', JSON.stringify(await inv()));
      // a shark comes calling
      await page.evaluate(() => { const g = window.OP.game, p = g.player; g.settings.view = 'third'; g.applySettings(); const k = g.seaLife.shark(p.x + 7, p.y + 2, 10); k.depth = 0.7; g.view3d.rig.pitch = 0.05; g.view3d.rig.yaw = Math.atan2(2, 7); });
      for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('shark');
      const sh = await page.evaluate(() => { const g = window.OP.game, k = g.actors.find((a) => a.shark); return k ? { d: +g.world.distance(k.x, k.y, g.player.x, g.player.y).toFixed(1), depth: +k.depth.toFixed(2), mode: k.controller.mode } : null; });
      console.log('shark', JSON.stringify(sh));
      for (let i = 0; i < 40; i++) { await step(page, 0.1); }
      await frames(page, 2);
      await snap('shark2');
      const hp = await page.evaluate(() => { const g = window.OP.game, k = g.actors.find((a) => a.shark); return { hp: Math.round(g.player.hp), mode: k?.controller.mode, depth: k && +k.depth.toFixed(2) }; });
      console.log('after 4s', JSON.stringify(hp));
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },
};
