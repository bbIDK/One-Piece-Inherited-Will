// The sea and sky: a beach, the open sea from a boat, swimming at sea level, dusk and a storm.
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
export const scenarios = {
  // the third-person breaststroke at the surface, from the side, at a few moments of the stroke
  swim3p: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => {
        window.OP.quickStart('human');
        const g = window.OP.game, w = g.world;
        g.env.clock = 11; g.env.storm = 0; g.env.fog = 0;
        g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings();
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        let spot = null;
        for (let k = 0; k < 4000 && !spot; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (1 + Math.random() * 0.5);
          const x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
          if (w.type(x, y) === 0 && g.seaDepth(x, y) > 3 && g.seaDepth(x, y) < 8) spot = { x, y };
        }
        window.OP.teleport(spot.x, spot.y);
        const st = document.createElement('style');
        st.textContent = '.look-hint{display:none!important}';
        document.head.appendChild(st);
      });
      await step(page, 0.5);
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = 0; v.rig.pitch = -0.38; v.rig.tp.dist = 3.2; window.OP.key('A', true); });
        await step(page, 0.45 + i * 0.12);
        await page.evaluate(() => window.OP.key('A', false));
        await frames(page, 2);
        await snap('stroke-' + i);
      }
    },
  },
  // Wading in the shallows, leaping out of the sea (rings on the water), and a
  // charged jump on the beach — third person, from the side.
  waterjump: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      const line = await page.evaluate(() => {
        window.OP.quickStart('human');
        const g = window.OP.game, w = g.world;
        g.env.clock = 11; g.env.storm = 0; g.env.fog = 0;
        g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings();
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 720; k++) {
          const a = k / 720 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
          for (let r = isl.radius * 0.3; r < isl.radius * 2; r += 0.5) {
            const x = isl.x + dx * r, y = isl.y + dy * r;
            if (w.type(x, y) !== 0 || g.seaDepth(x, y) > 0.3) continue;
            let deep = -1, wade = -1;
            for (let s2 = 0; s2 < 30; s2 += 0.25) {
              const d = g.seaDepth(x + dx * s2, y + dy * s2);
              if (wade < 0 && d > 0.55) wade = s2;
              if (d > 2.2) { deep = s2; break; }
            }
            if (deep > 0 && wade > 0) return { x, y, dx, dy, wade, deep };
            break;
          }
        }
        return null;
      });
      console.log('shore', JSON.stringify(line));
      if (!line) throw new Error('no shore found');
      const side = (d, yawOff = Math.PI / 2) => page.evaluate(({ line, d, yawOff }) => {
        const g = window.OP.game, p = g.player, w = g.world;
        p.x = w.wx(line.x + line.dx * d); p.y = line.y + line.dy * d;
        p.facing = Math.atan2(line.dy, line.dx);
        const v = g.view3d; v.rig.yaw = ((Math.atan2(line.dy, line.dx) + yawOff) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = -0.08; v.rig.tp.dist = 5;
      }, { line, d, yawOff });
      await side(line.wade + 0.5);
      await page.evaluate(() => { window.OP.key('W', true); });
      await step(page, 0.6);
      await page.evaluate(() => { window.OP.key('W', false); });
      await side(line.wade + 0.7);
      await step(page, 0.1); await frames(page, 3);
      console.log('wading', JSON.stringify(await page.evaluate(() => { const p = window.OP.game.player; return { wading: +(p.wading || 0).toFixed(2), inWater: p.inWater }; })));
      await snap('wading');
      await side(line.deep + 1);
      await step(page, 0.6);
      await page.evaluate(() => window.OP.game.player.tryJump(window.OP.game, 0.6));
      await step(page, 0.28); await frames(page, 3);
      console.log('leap', JSON.stringify(await page.evaluate(() => { const p = window.OP.game.player; return { z: +(p.z || 0).toFixed(2), inWater: p.inWater, rings: window.OP.game.view3d.scene.getObjectByName('ripples')?.count }; })));
      await snap('leap');
      await step(page, 0.8); await frames(page, 3);
      await snap('splashdown');
      // a charged jump in the village square
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island'), t = isl.towns[0];
        window.OP.teleport(t.plaza.x + 2.5, t.plaza.y + 3);
        const v = g.view3d; g.player.facing = 0; v.rig.yaw = Math.PI / 2; v.rig.pitch = -0.05; v.rig.tp.dist = 5.5;
      });
      await step(page, 0.3);
      await page.evaluate(() => { window.OP.key('Space', true); });
      await step(page, 0.95); await frames(page, 3);
      console.log('charging', JSON.stringify(await page.evaluate(() => ({ charging: +(window.OP.game.player.charging || 0).toFixed(2) }))));
      await snap('charge');
      await page.evaluate(() => { window.OP.key('Space', false); });
      await step(page, 0.3); await frames(page, 3);
      console.log('jumped', JSON.stringify(await page.evaluate(() => ({ z: +(window.OP.game.player.z || 0).toFixed(2) }))));
      await snap('charged-jump');
    },
  },
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
      const st = await page.evaluate(() => { const p = window.OP.game.player, v = window.OP.game.view3d; return { depth: +p.depth.toFixed(2), floor: +window.OP.game.seaDepth(p.x, p.y).toFixed(1), counts: Object.fromEntries(Object.entries(v.seabed?.sets || v.seabed?.meshes || {}).map(([k, m]) => [k, m.count])) }; });
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

  // sea life: fish schools around a reef, catching one by hand, a Sea Cow or Fighting Fish, a giant clam
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
      const inv = () => page.evaluate(() => Object.fromEntries(window.OP.game.state.char.inventory.filter((i) => /fish|tuna|pearl|horn/.test(i.id)).map((i) => [i.id, i.qty])));
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
        caught = inv2.fresh_fish || inv2.elephant_tuna || 0;
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

  // ships at sea: traffic with crews on deck, a raid, plundering and stealing a ship, walking your own deck
  raid: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 11; g.env.storm = 0; g.env.fog = 0; });
      // open water ~25 m off Dawn Island: our sloop, and a merchant ship hove to beside it
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.7 + Math.random() * 1.2);
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < -22 && w.sd(x, y) > -26) {
            let ok = true;
            for (let j = -14; j <= 14 && ok; j += 2) for (let i = -14; i <= 14 && ok; i += 2) if (!w.sailable(x + i, y + j)) ok = false;
            if (ok) return { x, y, a };
          }
        }
        return null;
      });
      console.log('spot', JSON.stringify(spot));
      const made = await page.evaluate((s) => {
        const g = window.OP.game, p = g.player;
        document.querySelector('.look-hint')?.remove();
        const mine = g.giveShip('sloop', s.x, s.y, 'Test Sloop', { heading: 0 });
        const T = g.traffic;
        const o = T.spawn({ kind: 'merchant', type: 'caravel', x: s.x, y: s.y + 4.2, heading: 0, level: 6, dest: { x: s.x + 400, y: s.y + 4 } });
        o.traffic.surrender = true; // (as if we'd fired a shot across her bows)
        // board our sloop
        const inter = window.OP.debug;
        p.x = mine.x; p.y = mine.y;
        g.emit('noop');
        return { mine: !!mine, other: !!o, ships: g.ships.length };
      }, spot);
      console.log('made', JSON.stringify(made));
      await page.evaluate(() => { const g = window.OP.game, p = g.player, s = g.ships.find((x) => x.name === 'Test Sloop'); window.__board = s; });
      // board through the E prompt
      await page.evaluate(() => { const g = window.OP.game, p = g.player, s = window.__board; p.x = s.x + 0.2; p.y = s.y + 1.6; });
      for (let i = 0; i < 4; i++) await step(page, 0.1);
      const pr0 = await page.evaluate(() => window.OP.game.player.controller.interaction?.label || null);
      console.log('swimming by our ship:', pr0);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.2);
      // the other ship's crew is on its deck?
      for (let i = 0; i < 6; i++) await step(page, 0.1);
      const crew = await page.evaluate(() => { const g = window.OP.game, o = g.traffic.ships[0]; return { mode: g.player.mode, crew: (o.traffic.crew || []).map((a) => ({ n: a.name, deck: !!a.deck, h: a.deck && +a.deck.h.toFixed(2), water: a.inWater })) }; });
      console.log('crew', JSON.stringify(crew));
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = Math.PI / 2; v.rig.pitch = -0.25; v.rig.tp.dist = 7; });
      await step(page, 0.2); await frames(page, 3);
      await snap('alongside');
      // E: board and raid
      const pr1 = await page.evaluate(() => window.OP.game.player.controller.interaction?.label || null);
      console.log('at the helm:', pr1);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.1);
      const st1 = await page.evaluate(() => { const g = window.OP.game, p = g.player, o = g.traffic.ships[0]; return { mode: p.mode, onDeck: p.deck?.ship?.name, raided: o.traffic.raided, bounty: g.state.char.bounty, hostile: o.traffic.crew.filter((a) => a.controller.kind === 'hostile').length }; });
      console.log('raid', JSON.stringify(st1));
      for (let i = 0; i < 12; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.pitch = -0.3; });
      await snap('raid-fight');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
      await step(page, 0.1); await frames(page, 3);
      await snap('raid-first');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); });
      // beat the crew (knock them all out)
      await page.evaluate(() => { const g = window.OP.game, o = g.traffic.ships[0]; for (const a of o.traffic.crew) { a.hp = 0; a.knockOut?.(g, g.player); } });
      for (let i = 0; i < 6; i++) await step(page, 0.1);
      const st2 = await page.evaluate(() => { const g = window.OP.game, o = g.traffic.ships[0]; return { cleared: o.traffic.cleared }; });
      console.log('after the fight', JSON.stringify(st2));
      // walk to the hatch and plunder, then to the helm and steal her
      const go = async (what) => page.evaluate((what) => {
        const g = window.OP.game, p = g.player, o = g.traffic.ships[0] || g.ships.find((s) => s.name && s.owner !== 'player' && !s.sunk);
        return what;
      }, what);
      const res = await page.evaluate(async () => {
        const g = window.OP.game, p = g.player, o = g.traffic.ships[0];
        const out = {};
        const { hatchSpot, helmSpot } = window.OP.debug.decks || {};
        return out;
      });
      void go; void res;
      const pl = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, o = g.traffic.ships[0];
        const hs = window.OP.debug.deckSpot(o, 'hatch');
        p.x = hs.x; p.y = hs.y;
        return hs;
      });
      for (let i = 0; i < 3; i++) await step(page, 0.1);
      const pr2 = await page.evaluate(() => window.OP.game.player.controller.interaction?.label || null);
      console.log('at the hatch:', pr2);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.1);
      await page.evaluate(() => { const g = window.OP.game, p = g.player, o = g.traffic.ships[0]; const hs = window.OP.debug.deckSpot(o, 'helm'); p.x = hs.x; p.y = hs.y; });
      for (let i = 0; i < 3; i++) await step(page, 0.1);
      const pr3 = await page.evaluate(() => window.OP.game.player.controller.interaction?.label || null);
      console.log('at the helm:', pr3);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.3);
      const st3 = await page.evaluate(() => { const g = window.OP.game, p = g.player; return { mode: p.mode, ship: p.ship?.name, owner: p.ship?.owner, bounty: g.state.char.bounty, berries: g.state.char.berries, fleet: g.ships.filter((s) => s.owner === 'player').map((s) => s.name) }; });
      console.log('stolen', JSON.stringify(st3));
      await step(page, 0.2); await frames(page, 3);
      await snap('stolen');
      // leave the helm and walk the deck, jump off, climb back
      const pr4 = await page.evaluate(() => window.OP.game.player.controller.interaction?.label || null);
      console.log('helm prompt:', pr4);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.3);
      const st4 = await page.evaluate(() => { const p = window.OP.game.player; return { mode: p.mode, deck: p.deck?.ship?.name, water: p.inWater }; });
      console.log('left the helm', JSON.stringify(st4));
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = window.OP.game.player.ship.heading + 0.6; v.rig.pitch = -0.2; window.OP.key('W', true); });
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => window.OP.key('W', false));
      const st5 = await page.evaluate(() => { const p = window.OP.game.player; return { deck: p.deck?.ship?.name, water: p.inWater }; });
      console.log('walked (rail holds?)', JSON.stringify(st5));
      await snap('deck-walk');
      // wanted: a Marine sees a 10M face
      await page.evaluate(() => { const g = window.OP.game; g.state.char.bounty = 12000000; });
      const w1 = await page.evaluate(() => ({ tier: window.OP.game.wanted.tier() }));
      console.log('tier', JSON.stringify(w1));
    },
  },

  // traffic: sail for a while and see who else is out on the water
  traffic: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 10; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.8 + Math.random() * 1.5);
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < -28) return { x, y, a };
        }
      });
      // (in the water beside her, not on her deck: from there E boards and takes the helm)
      await page.evaluate((s) => { const g = window.OP.game, p = g.player; const sh = g.giveShip('caravel', s.x, s.y, 'Going Test', { heading: s.a }); const off = sh.def.beam / 2 + 0.8; p.x = sh.x - Math.sin(sh.heading) * off; p.y = sh.y + Math.cos(sh.heading) * off; window.__s = sh; }, spot);
      await step(page, 0.1);
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); });
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 20; i++) await step(page, 0.5);
      await page.evaluate(() => window.OP.key('W', false));
      const list = await page.evaluate(() => { const g = window.OP.game, p = g.player; return { mode: p.mode, ships: g.traffic.ships.map((s) => ({ kind: s.traffic.kind, type: s.type, d: Math.round(g.world.distance(s.x, s.y, p.x, p.y)), crew: s.traffic.crew ? s.traffic.crew.length : 0 })) }; });
      console.log('traffic', JSON.stringify(list));
      // bring the nearest one close for a look
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player, s = g.traffic.ships[0];
        if (!s) return;
        const a = p.ship.heading + 0.5;
        s.x = g.world.wx(p.x + Math.cos(a) * 30); s.y = p.y + Math.sin(a) * 30;
        g.view3d.rig.yaw = a; g.view3d.rig.pitch = -0.08;
      });
      for (let i = 0; i < 6; i++) { await step(page, 0.2); await frames(page, 1); }
      await snap('passing');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); });
      await step(page, 0.1); await frames(page, 3);
      await snap('passing-helm');
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },

  // the sky at the horizon through the day (clouds banks, no balls)
  sky: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.3 + Math.random() * 0.9);
          const x = Math.floor(isl.x + Math.cos(a) * r), y = Math.floor(isl.y + Math.sin(a) * r);
          if (w.type(x, y) === 16 && w.sd(x, y) > 1 && w.sd(x, y) < 2.5 && !w.isBlocked(x, y)) return [x + 0.5, y + 0.5, a];
        }
      });
      await page.evaluate(([x, y]) => window.OP.teleport(x, y), spot);
      const at = async (name, clock, cloud, yawOff = 0) => {
        await page.evaluate(([clock, cloud, a]) => { const g = window.OP.game; g.env.clock = clock; if (cloud != null) g.env.cloud = cloud; g.view3d.rig.yaw = a; g.view3d.rig.pitch = 0.1; }, [clock, cloud, spot[2] + yawOff]);
        for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
        await snap(name);
      };
      await at('noon', 12, null);
      await at('noon-2', 12, null, 1.6);
      await at('afternoon-cloudy', 15, 0.8, -1.2);
      await at('dusk', 18.5, null, 0.4);
      await at('night', 22.5, null, 0.4);
      await at('night-2', 1.5, null, 2.2);
    },
  },

  // a ship under way from astern and the side: the foam wake behind her
  // Shift lock under water: the swimmer must face where the camera looks, never back at it.
  divelock: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.6 + Math.random() * 1.2);
          const x = Math.floor(isl.x + Math.cos(a) * r), y = Math.floor(isl.y + Math.sin(a) * r);
          const d = w.sd(x, y);
          if (d < -18 && d > -19.5) return [x + 0.5, y + 0.5, a + Math.PI];
        }
      });
      await page.evaluate(([x, y]) => window.OP.teleport(x, y), spot);
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      // shift lock on (the harness can't take the pointer: pretend it did)
      await page.evaluate((a) => { const v = window.OP.game.view3d; v.rig.setShiftLock(true); v.rig.locked = true; v.rig.lockFailed = false; v.rig.yaw = a; v.rig.pitch = -0.2; }, spot[2]);
      const st = (tag) => page.evaluate((tag) => {
        const g = window.OP.game, p = g.player, v = g.view3d;
        const d = ((p.facing - v.rig.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        return { tag, depth: +p.depth.toFixed(2), under: p.under, yaw: +v.rig.yaw.toFixed(2), pitch: +v.rig.pitch.toFixed(2), facing: +p.facing.toFixed(2), off: +d.toFixed(2) };
      }, tag);
      const out = [];
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      out.push(await st('surface'));
      await snap('surface');
      await page.evaluate(() => window.OP.key('C', true));
      for (let i = 0; i < 25; i++) await step(page, 0.1);
      await page.evaluate(() => window.OP.key('C', false));
      for (let i = 0; i < 3; i++) { await step(page, 0.1); await frames(page, 1); }
      out.push(await st('under'));
      await snap('under');
      for (const [yawOff, pitch, tag] of [[1.2, -0.2, 'turn-right'], [-1.0, 0.5, 'look-up'], [0.3, -0.9, 'look-down'], [2.8, 0.1, 'about-face']]) {
        await page.evaluate(([o, pt]) => { const v = window.OP.game.view3d; v.rig.yaw = ((v.rig.yaw + o) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = pt; }, [yawOff, pitch]);
        await page.evaluate(() => window.OP.key('W', true));
        for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
        out.push(await st(tag));
        await snap(tag);
        await page.evaluate(() => window.OP.key('W', false));
      }
      for (const o of out) console.log(JSON.stringify(o));
      const bad = out.filter((o) => Math.abs(o.off) > 0.6);
      if (bad.length) console.log('FACING WRONG WAY:', bad.map((o) => o.tag).join(', '));
      else console.log('facing follows the camera everywhere');
    },
  },
  // Shift lock on land: facing follows the camera whether you look ahead, up at the sky or down at your feet.
  landlock: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 12; document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.setShiftLock(true); v.rig.locked = true; v.rig.lockFailed = false; });
      const out = [];
      for (const [yaw, pitch, tag] of [[0.5, -0.1, 'ahead'], [2.0, -1.2, 'feet'], [3.5, 0.9, 'sky'], [5.0, -0.5, 'down']]) {
        await page.evaluate(([y, pt]) => { const v = window.OP.game.view3d; v.rig.yaw = y; v.rig.pitch = pt; }, [yaw, pitch]);
        for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
        out.push(await page.evaluate((tag) => {
          const g = window.OP.game, p = g.player, v = g.view3d;
          const d = ((p.facing - v.rig.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          return { tag, yaw: +v.rig.yaw.toFixed(2), facing: +p.facing.toFixed(2), off: +d.toFixed(2) };
        }, tag));
      }
      await snap('feet');
      for (const o of out) console.log(JSON.stringify(o));
      const bad = out.filter((o) => Math.abs(o.off) > 0.6);
      console.log(bad.length ? 'FACING WRONG WAY: ' + bad.map((o) => o.tag).join(', ') : 'facing follows the camera everywhere');
    },
  },
  // The open ocean, far from any land: the sea floor is there below a diver, and a
  // Fish-Man sees much further and clearer under water than a human.
  abyss: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      const races = String(args.races || 'human,fishman').split(',');
      for (const race of races) {
        await page.evaluate((race) => { window.OP.quickStart(race); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); }, race);
        // a spot in a chunk of open sea (no land in it or next to it)
        const spot = await page.evaluate(() => {
          const g = window.OP.game, w = g.world, t = g.view3d.terrain, isl = w.islands.find((i) => i.id === 'dawn_island');
          for (let k = 0; k < 40000; k++) {
            const a = Math.random() * Math.PI * 2, r = isl.radius + 70 + Math.random() * 120;
            const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
            const cx = Math.floor(w.wx(x) / 32), cy = Math.floor(y / 32);
            if (t.hasLand[cy * t.cw + cx] === 0 && w.isLiquid(x, y)) return [x, y, a];
          }
        });
        await page.evaluate(([x, y]) => window.OP.teleport(x, y), spot);
        for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
        // sink to 8 m above the bottom
        const info = await page.evaluate(() => {
          const g = window.OP.game, p = g.player;
          const floor = g.seaDepth(p.x, p.y);
          p.depth = Math.max(0, floor - 9); p.under = true; p.oxygen = 999;
          return { floor: +floor.toFixed(1), depth: +p.depth.toFixed(1), gills: !!p.gills };
        });
        await page.evaluate((a) => { const v = window.OP.game.view3d; v.rig.yaw = a; v.rig.pitch = -0.45; }, spot[2]);
        for (let i = 0; i < 25; i++) { await step(page, 0.05); await frames(page, 1); }
        const chunks = await page.evaluate(() => { const t = window.OP.game.view3d.terrain; let open = 0; for (const c of t.live.values()) { const cx = Math.floor(c.x0 / 32), cy = Math.floor(c.y0 / 32); if (t.hasLand[cy * t.cw + cx] === 0) open++; } return { open, floorR: t.floorR }; });
        console.log(race, JSON.stringify(info), JSON.stringify(chunks));
        await snap(race + '-floor');
        await page.evaluate(() => { const g = window.OP.game, p = g.player; p.depth = Math.max(0, g.seaDepth(p.x, p.y) * 0.5); g.view3d.rig.pitch = -0.05; });
        for (let i = 0; i < 6; i++) { await step(page, 0.05); await frames(page, 1); }
        await snap(race + '-mid');
        // leave the water: the open-sea floor goes away again
        await page.evaluate(() => { const g = window.OP.game, p = g.player, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island'); p.depth = 0; p.under = false; window.OP.teleport(isl.x, isl.y); });
        for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
        console.log('ashore', JSON.stringify(await page.evaluate(() => { const t = window.OP.game.view3d.terrain; let open = 0; for (const c of t.live.values()) { const cx = Math.floor(c.x0 / 32), cy = Math.floor(c.y0 / 32); if (t.hasLand[cy * t.cw + cx] === 0) open++; } return { open, floorR: t.floorR, inWater: window.OP.game.player.inWater }; })));
      }
    },
  },
  // every kind of One Piece sea life, one at a time in front of the camera, then the two hunters
  oplife: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.env.clock = 12; g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      // open water 14-30 m deep, in the Grand Line (Paradise) if we can find it
      const spot = await page.evaluate((where) => {
        const g = window.OP.game, w = g.world, R = window.OP.debug.regionAt;
        const want = where === 'blue' ? [1] : [5];
        const isls = w.islands.filter((i) => want.includes(R(i.x, i.y)));
        for (let k = 0; k < 60000; k++) {
          const isl = isls[k % isls.length];
          const a = Math.random() * Math.PI * 2, r = isl.radius + 10 + Math.random() * 40;
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (!w.isLiquid(x, y) || w.isOverlay(x, y)) continue;
          const d = g.seaDepth(x, y);
          if (d > 14 && d < 30 && want.includes(R(x, y))) return { x, y, d: +d.toFixed(1), region: R(x, y), isl: isl.id };
        }
        return null;
      }, args.where || 'grand');
      console.log('spot', JSON.stringify(spot));
      await page.evaluate((s) => window.OP.teleport(s.x, s.y), spot);
      for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => { const g = window.OP.game, p = g.player; p.depth = 4; p.under = true; p.oxygen = 999; g.seaLife.schools.length = 0; g.seaLife.spawnT = 1e9; g.seaLife.sharkT = 1e9; });
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
      const kinds = String(args.kinds || 'reef,sardine,flying,elephant,seaking_fry,seacat,yagara').split(',');
      for (const kind of kinds) {
        const info = await page.evaluate((kind) => {
          const g = window.OP.game, p = g.player, S = g.seaLife, v = g.view3d;
          S.schools.length = 0;
          const yaw = v.rig.yaw;
          const big = ['elephant', 'seaking_fry', 'seacat', 'yagara'].includes(kind);
          const d = big ? 4.2 : 2.4;
          if (g.settings.view !== 'first') { g.settings.view = 'first'; g.applySettings(); }
          // side on to the camera, a little below eye level
          const s = S.spawn(kind, p.x + Math.cos(yaw) * d, p.y + Math.sin(yaw) * d, p.depth + 0.4, yaw + Math.PI / 2);
          s.turnT = 1e9;
          v.rig.pitch = -0.08;
          return { kind, n: s.fish.length, size: +s.fish[0].size.toFixed(2) };
        }, kind);
        for (let i = 0; i < 3; i++) { await step(page, 0.05); await frames(page, 1); }
        console.log('school', JSON.stringify(info));
        await snap(kind);
      }
      // flying fish from the surface: they leap clear and glide
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player, S = g.seaLife, v = g.view3d;
        S.schools.length = 0; p.depth = 0; p.under = false;
        g.settings.view = 'third'; g.applySettings();
        const yaw = v.rig.yaw;
        const s = S.spawn('flying', p.x + Math.cos(yaw) * 7, p.y + Math.sin(yaw) * 7, 0.8, yaw + Math.PI / 2);
        s.turnT = 1e9;
        v.rig.pitch = -0.12;
      });
      let leaps = 0;
      for (let i = 0; i < 40; i++) {
        await step(page, 0.1);
        const n = await page.evaluate(() => { const S = window.OP.game.seaLife, P = {}; let n = 0; for (const s of S.schools) for (const f of s.fish) { S.fishPos(s, f, P); if (P.leap > 0.2 && P.leap < 0.8) n++; } return n; });
        if (n >= 1) { leaps = n; break; }
      }
      await frames(page, 2);
      console.log('leaping', leaps);
      await snap('flying-leap');
      // the hunters: a Sea Cow and a Fighting Fish
      await page.evaluate(() => { const p = window.OP.game.player; p.depth = 4; p.under = true; });
      for (const kind of ['seacow', 'fightfish']) {
        const info = await page.evaluate((kind) => {
          const g = window.OP.game, p = g.player, S = g.seaLife, v = g.view3d;
          S.schools.length = 0;
          for (const a of g.actors) if (a.shark) a.alive = false;
          const yaw = v.rig.yaw;
          const k = S.shark(p.x + Math.cos(yaw) * 6, p.y + Math.sin(yaw) * 6, 12, kind);
          k.depth = p.depth + 0.3; k.facing = yaw + Math.PI / 2;
          k.controller.mode = 'circle'; k.controller.t = 99;
          v.rig.pitch = -0.05;
          return { name: k.name, race: k.look.race, hp: Math.round(k.hp) };
        }, kind);
        for (let i = 0; i < 3; i++) { await step(page, 0.05); await frames(page, 1); }
        console.log('hunter', JSON.stringify(info));
        await snap(kind);
      }
      // a hurt Sea Cow bolts; beating a Fighting Fish drops its horn
      const flee = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, S = g.seaLife;
        for (const a of g.actors) if (a.shark) a.alive = false;
        const k = S.shark(p.x + 5, p.y, 12, 'seacow');
        k.hp = k.d.maxHp * 0.3;
        return k.id;
      });
      await step(page, 0.3);
      const fled = await page.evaluate((id) => { const g = window.OP.game, k = g.actors.find((a) => a.id === id); return k ? k.controller.mode : 'gone'; }, flee);
      const loot = await page.evaluate(() => {
        const g = window.OP.game, p = g.player, S = g.seaLife;
        const k = S.shark(p.x + 5, p.y, 12, 'fightfish');
        k.onKO(k, p, g);
        return Object.fromEntries(g.state.char.inventory.filter((i) => /fish|tuna|horn/.test(i.id)).map((i) => [i.id, i.qty]));
      });
      console.log('seacow mode', fled, 'loot', JSON.stringify(loot));
      // what turns up on its own around here
      const census = await page.evaluate(() => {
        const g = window.OP.game, S = g.seaLife, p = g.player;
        for (const a of g.actors) if (a.shark) a.alive = false;
        return p.x;
      });
      await page.evaluate(() => { const g = window.OP.game, S = g.seaLife; S.spawnT = 0; S.schools.length = 0; });
      const seen = {};
      for (let i = 0; i < 30; i++) {
        await step(page, 1.6);
        const ks = await page.evaluate(() => { const S = window.OP.game.seaLife; const out = S.schools.map((s) => s.kind); S.schools.length = 0; return out; });
        for (const k of ks) seen[k] = (seen[k] || 0) + 1;
      }
      console.log('census', JSON.stringify(seen), census ? '' : '');
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles }; });
      console.log('perf', JSON.stringify(perf));
    },
  },
  wake: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); g.env.clock = Number(11); g.env.storm = 0; g.env.fog = 0; document.querySelector('.look-hint')?.remove(); });
      const spot = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island');
        for (let k = 0; k < 40000; k++) {
          const a = Math.random() * Math.PI * 2, r = isl.radius * (0.8 + Math.random() * 1.5);
          const x = Math.floor(isl.x + Math.cos(a) * r) + 0.5, y = Math.floor(isl.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) < -28) return { x, y, a };
        }
      });
      await page.evaluate((s) => { const g = window.OP.game, p = g.player; const sh = g.giveShip('caravel', s.x, s.y, 'Wake Test', { heading: s.a }); const hs = window.OP.debug.deckSpot(sh, 'helm'); p.x = hs.x; p.y = hs.y; }, spot);
      for (let i = 0; i < 3; i++) await step(page, 0.1);
      const how = await page.evaluate(() => { const g = window.OP.game, it = g.player.controller.interaction; const label = it?.label; it?.run(); return { label, mode: g.player.mode }; });
      console.log('boarding', JSON.stringify(how));
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 30; i++) { await step(page, 0.2); await frames(page, 1); }
      await page.evaluate(() => { const g = window.OP.game; g.view3d.rig.yaw = g.player.ship.heading + Math.PI * 0.85; g.view3d.rig.pitch = -0.35; });
      for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('astern');
      await page.evaluate(() => { const g = window.OP.game; g.env.clock = 22; });
      for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('night');
    },
  },
};
