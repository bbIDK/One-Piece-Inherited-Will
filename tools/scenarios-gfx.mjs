// Quick graphics checks. Run: node tools/shot.mjs gfxpost
const waitReady = (page, timeout = 240000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

export const scenarios = {
  gfxpost: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 2); }
      const info = await page.evaluate(() => {
        const v = window.OP.game.view3d, r = v.renderer, gl = r.getContext();
        return {
          post: !!v.post,
          cbf: !!gl.getExtension('EXT_color_buffer_float'), cbhf: !!gl.getExtension('EXT_color_buffer_half_float'),
          err: gl.getError(),
          status: v.post ? (() => { const rt = v.post.composer.readBuffer; r.setRenderTarget(rt); const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); r.setRenderTarget(null); return st === gl.FRAMEBUFFER_COMPLETE ? 'complete' : st; })() : null,
        };
      });
      console.log('post', JSON.stringify(info));
      await snap('post-town');
      // bisect the chain: enable passes one by one
      const names = await page.evaluate(() => window.OP.game.view3d.post?.composer.passes.map((p) => p.constructor.name) || []);
      console.log('passes', names.join(','));
      for (let k = 1; k <= names.length; k++) {
        const err = await page.evaluate((k) => {
          const v = window.OP.game.view3d, gl = v.renderer.getContext();
          v.post.composer.passes.forEach((p, i) => { p.enabled = i < k; });
          while (gl.getError()) { /* clear */ }
          v.render(window.OP.game);
          return gl.getError();
        }, k);
        await frames(page, 2);
        console.log('first', k, 'passes → gl error', err);
        await snap('post-bisect-' + k);
      }
      await page.evaluate(() => { const v = window.OP.game.view3d; v.rig.yaw = 0; v.rig.pitch = 0.02; window.OP.game.env.clock = 17.8; });
      await step(page, 0.1); await frames(page, 3);
      await snap('post-dusk');
    },
  },
  gfxisland: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      const id = args.island || 'dawn_island';
      await page.evaluate((id) => {
        const g = window.OP.game;
        const isl = g.world.islands.find((i) => i.id === id);
        const t = isl.towns[0];
        window.OP.teleport(t ? t.plaza.x : isl.x, t ? t.plaza.y + 3 : isl.y);
        g.env.clock = 10.5;
      }, id);
      for (let i = 0; i < 14; i++) { await step(page, 0.1); await frames(page, 2); }
      for (const [yaw, name] of [[0, 'e'], [Math.PI / 2, 's'], [Math.PI, 'w'], [-Math.PI / 2, 'n']]) {
        await page.evaluate((yaw) => { const v = window.OP.game.view3d; v.rig.yaw = (yaw + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = -0.04; }, yaw);
        await step(page, 0.1); await frames(page, 3);
        await snap(id + '-' + name);
      }
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d; const i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, chunks: v.terrain.live.size }; });
      console.log('perf', JSON.stringify(perf));
    },
  },
  // a Straw Hat-style crew in an open field at noon (to compare with the World Seeker art)
  lineup: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      const spot = await page.evaluate(() => {
        // Foosha's plaza: the crew stands in front of the well, like a group shot
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        const t = isl.towns[0];
        window.OP.teleport(t.plaza.x, t.plaza.y + 10.5);
        g.env.clock = 11.5; g.env.storm = 0; g.env.fog = 0;
        return [Math.round(t.plaza.x), Math.round(t.plaza.y), t.name];
      });
      console.log('spot', JSON.stringify(spot));
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player;
        g.actors = g.actors.filter((a) => a === p);
        const crew = [
          { name: 'Captain', race: 'human', look: { hair: 'spiky', hairColor: '#1a1a1a', hat: 'straw', top: '#c62828', openShirt: true, bottom: '#1e63b8', sandals: true, skin: '#f1c9a0', eyeShape: 'round', grin: true, scarEye: false } },
          { name: 'Swordsman', race: 'human', look: { hair: 'short', hairColor: '#2e7d32', top: '#f5f5f5', bottom: '#263238', skin: '#e0ac7e', eyeShape: 'sharp', coat: null } },
          { name: 'Navigator', race: 'human', look: { hair: 'long', hairColor: '#ef6c00', top: '#4fc3f7', bottom: '#1e3a8a', skin: '#f9dcc4', eyeShape: 'soft', mouth: 'smile' } },
          { name: 'Sniper', race: 'human', look: { hair: 'curly', hairColor: '#1a1a1a', top: '#fbc02d', bottom: '#f5e6c4', skin: '#a0643a', nose: 'long', eyeShape: 'round', grin: true } },
          { name: 'Cook', race: 'human', look: { hair: 'short', hairColor: '#f2d16b', top: '#212121', bottom: '#212121', skin: '#f1c9a0', eyeShape: 'sharp', mouth: 'flat' } },
          { name: 'Archaeologist', race: 'human', look: { hair: 'long', hairColor: '#111111', top: '#6a1b9a', bottom: '#d84315', skin: '#e0ac7e', eyeShape: 'soft', mouth: 'smile' } },
          { name: 'Shipwright', race: 'buccaneer', look: { hair: 'spiky', hairColor: '#29b6f6', top: '#e53935', openShirt: true, bottom: '#1565c0', skin: '#e0ac7e', bulk: 1.45, eyeShape: 'sharp', grin: true } },
          { name: 'Musician', race: 'human', look: { hair: 'afro', hairColor: '#111111', top: '#212121', bottom: '#212121', skin: '#fafafa', eyeShape: 'round', mouth: 'flat' } },
        ];
        const n = crew.length;
        crew.forEach((c, i) => {
          const x = p.x - 5.6 + i * 1.6, y = p.y - 7 + Math.abs(i - (n - 1) / 2) * 0.35;
          const a = window.OP.debug.makeNPC({ name: c.name, faction: 'civilian', level: 10, race: c.race, look: { race: c.race, seed: i * 7 + 1, ...c.look } }, x, y);
          a.controller = null; a.facing = Math.PI / 2; a.showName = false; a.name = '';
          g.addActor(a);
        });
        const v = g.view3d;
        g.settings.view = 'first'; g.applySettings();
        v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.02;
      });
      for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 2); }
      await snap('crew');
      await page.evaluate(() => { const g = window.OP.game, p = g.player; p.y -= 3.2; g.view3d.rig.pitch = 0.02; });
      await step(page, 0.1); await frames(page, 4);
      await snap('crew-close');
      await page.evaluate(() => { const g = window.OP.game, p = g.player; p.y -= 2.2; p.x -= 0.8; g.view3d.rig.pitch = 0.1; });
      await step(page, 0.1); await frames(page, 4);
      await snap('crew-faces');
    },
  },
  // ground cover: a meadow on Dawn Island, a beach, and the cost of moving through it
  cover: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      const spots = await page.evaluate((id) => {
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => i.id === id);
        // the grassiest open tile and a sandy beach tile on the island
        let best = null, beach = null, bs = -1;
        const G = new Set([17, 32, 47]);
        // (a fixed sequence, so every build looks at the same spots; none right by a tree)
        let seed = 12345;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const clear = (x, y) => !(w.objects?.query(x - 2.5, y - 2.5, x + 3.5, y + 3.5) || []).some((o) => o.kind === 'tree' || o.kind === 'bush' || o.kind === 'rock');
        for (let k = 0; k < 6000; k++) {
          const x = Math.floor(isl.x + (rnd() - 0.5) * 2 * isl.radius), y = Math.floor(isl.y + (rnd() - 0.5) * 2 * isl.radius);
          const t = w.type(x, y);
          if (t === 16 && !beach && w.sd(x, y) > 1.5 && w.sd(x, y) < 4 && !w.isBlocked(x, y)) beach = [x, y];
          if (!G.has(t) || w.isBlocked(x, y) || !clear(x, y)) continue;
          let s = 0;
          for (let j = -6; j <= 6; j += 2) for (let i = -6; i <= 6; i += 2) if (G.has(w.type(x + i, y + j)) && !w.isBlocked(x + i, y + j)) s++;
          if (s > bs) { bs = s; best = [x, y]; }
        }
        g.env.clock = 10.5; g.env.storm = 0; g.env.fog = 0;
        return { best, beach, bs };
      }, args.island || 'dawn_island');
      console.log('spots', JSON.stringify(spots));
      await page.evaluate(([x, y]) => window.OP.teleport(x + 0.5, y + 0.5), spots.best);
      for (let i = 0; i < 20; i++) { await step(page, 0.1); await frames(page, 2); }
      const stat = () => page.evaluate(() => {
        const v = window.OP.game.view3d, c = v.groundCover, i = v.renderer.info;
        // (near and far sets; older builds had one mesh per kind)
        const count = (k) => (c.meshes ? c.meshes[k].count : c.sets[k].count);
        return { counts: c ? Object.fromEntries(['grass', 'flower', 'fern', 'pebble', 'shell', 'rock'].map((k) => [k, count(k)])) : null, cells: c?.cells.size, calls: i.render.calls, tris: i.render.triangles };
      });
      console.log('meadow', JSON.stringify(await stat()));
      for (const [yaw, name] of [[0, 'e'], [Math.PI / 2, 's'], [Math.PI, 'w'], [-Math.PI / 2, 'n']]) {
        await page.evaluate((yaw) => { const v = window.OP.game.view3d; v.rig.yaw = (yaw + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = -0.1; }, yaw);
        await step(page, 0.1); await frames(page, 3);
        await snap('meadow-' + name);
      }
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); });
      await step(page, 0.1); await frames(page, 3);
      await snap('meadow-third');
      // the CPU cost of re-placing the cover as you walk across cells (all cells cached)
      const ms = await page.evaluate(() => {
        const g = window.OP.game, v = g.view3d, c = v.groundCover, w = g.world, p = g.player;
        const out = [];
        for (let k = 0; k < 30; k++) {
          const x = p.x + k * 2;
          const t0 = performance.now();
          if (c.place) c.place(w, Math.floor(w.wx(x) / 16), Math.floor(p.y / 16), 64, false);
          else c.rebuild(v.ctx, w, Math.floor(w.wx(x) / 16), Math.floor(p.y / 16), 64, false);
          out.push(performance.now() - t0);
        }
        out.sort((a, b) => a - b);
        return { median: out[15].toFixed(2), max: out[29].toFixed(2) };
      });
      console.log('rebuild ms', JSON.stringify(ms));
      if (spots.beach) {
        await page.evaluate(([x, y]) => window.OP.teleport(x + 0.5, y + 0.5), spots.beach);
        for (let i = 0; i < 16; i++) { await step(page, 0.1); await frames(page, 2); }
        console.log('beach', JSON.stringify(await stat()));
        await snap('beach');
      }
    },
  },
  // body types and outfits side by side (Foosha's plaza at noon)
  bodies: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        const t = w.islands.find((i) => i.id === 'dawn_island').towns[0];
        window.OP.teleport(t.plaza.x, t.plaza.y + 10.5);
        g.env.clock = 11.5; g.env.storm = 0; g.env.fog = 0;
        g.actors = g.actors.filter((a) => a === p);
        const S = '#f1c9a0';
        const cast = [
          { race: 'human', look: { hair: 'spiky', hairColor: '#1a1a1a', hat: 'straw', top: '#c62828', topStyle: 'vest', bottom: '#1e63b8', bottomStyle: 'shorts', waist: 'sash', waistCol: '#f4c430', shoeStyle: 'sandals', skin: S, muscle: 0.7, grin: true } },
          { race: 'human', look: { hair: 'short', hairColor: '#2e7d32', top: '#f5f5f5', topStyle: 'open', bottom: '#263238', bottomStyle: 'trousers', waist: 'haramaki', waistCol: '#2e7d32', shoeStyle: 'boots', shoes: '#212121', skin: '#e0ac7e', muscle: 1.1, eyeShape: 'sharp' } },
          { race: 'human', look: { fem: true, hair: 'long', hairColor: '#ef6c00', top: '#4fc3f7', topStyle: 'crop', bottom: '#1e3a8a', bottomStyle: 'skirt', shoeStyle: 'sandals', shoes: '#8d6e4a', skin: '#f9dcc4', eyeShape: 'soft', mouth: 'smile' } },
          { race: 'human', look: { hair: 'short', hairColor: '#f2d16b', top: '#212121', topStyle: 'jacket', top2: '#5c8fd6', tie: '#212121', bottom: '#212121', bottomStyle: 'slim', shoeStyle: 'shoes', shoes: '#1a1a1a', skin: S, muscle: 0.4, eyeShape: 'sharp', mouth: 'flat' } },
          { race: 'human', look: { hair: 'short', hairColor: '#111111', hat: 'marine', top: '#f5f5f5', topStyle: 'shirt', bottom: '#1b3a6b', bottomStyle: 'trousers', waist: 'belt', coat: '#fafafa', shoeStyle: 'boots', shoes: '#2d2d2d', skin: '#e0ac7e', muscle: 0.8 } },
          { race: 'human', look: { hair: 'curly', hairColor: '#1a1a1a', hat: 'bandana', hatColor: '#c62828', top: '#1e40af', topStyle: 'striped', top2: '#f5f5f5', bottom: '#6d4c41', bottomStyle: 'baggy', waist: 'sash', waistCol: '#c62828', shoeStyle: 'boots', shoes: '#3b2a1a', skin: '#a0643a', muscle: 0.6, grin: true } },
          { race: 'human', look: { hair: 'topknot', hairColor: '#111111', top: '#5e35b1', topStyle: 'kimono', bottom: '#37474f', bottomStyle: 'hakama', shoeStyle: 'geta', skin: S, muscle: 0.5, eyeShape: 'sharp' } },
          { race: 'human', look: { fem: true, hair: 'ponytail', hairColor: '#3b2a1a', top: '#e57373', topStyle: 'dress', bottomStyle: 'longskirt', shoeStyle: 'shoes', shoes: '#6d4c41', skin: '#f1c9a0', eyeShape: 'round', mouth: 'smile' } },
          { race: 'buccaneer', look: { hair: 'spiky', hairColor: '#29b6f6', top: '#e53935', topStyle: 'open', bottom: '#1565c0', bottomStyle: 'shorts', waist: 'belt', shoeStyle: 'sandals', skin: '#e0ac7e', bulk: 1.3, eyeShape: 'sharp', grin: true } },
        ];
        const n = cast.length;
        cast.forEach((c, i) => {
          const x = p.x - 7.2 + i * 1.8, y = p.y - 7.5;
          const a = window.OP.debug.makeNPC({ name: '', faction: 'civilian', level: 10, race: c.race, look: { race: c.race, seed: i * 7 + 1, ...c.look } }, x, y);
          a.controller = null; a.facing = Math.PI / 2; a.showName = false; a.name = '';
          g.addActor(a);
        });
        g.settings.view = 'first'; g.applySettings();
        const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.05;
        p.y += 3.5;
      });
      for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 2); }
      await snap('all');
      for (const [dx, name] of [[-4.6, 'left'], [0, 'mid'], [4.6, 'right']]) {
        await page.evaluate((dx) => { const g = window.OP.game, p = g.player; p.x = g.actors.find((a) => a !== p).x + 7.2 + dx; p.y = g.actors.find((a) => a !== p).y + 4.2; g.view3d.rig.pitch = -0.02; }, dx);
        await step(page, 0.1); await frames(page, 4);
        await snap('close-' + name);
      }
      // from behind and the side
      await page.evaluate(() => { const g = window.OP.game, p = g.player; const f = g.actors.find((a) => a !== p); p.x = f.x + 7.2; p.y = f.y - 4.4; g.view3d.rig.yaw = Math.PI / 2; });
      await step(page, 0.1); await frames(page, 4);
      await snap('back');
      const tris = await page.evaluate(() => {
        const v = window.OP.game.view3d, out = [];
        for (const [a, view] of v.actorViews || []) { const m = view.model || view.m; if (m?.body?.geo?.index) out.push(m.body.geo.index.count / 3); }
        return out;
      });
      console.log('tris per body', JSON.stringify(tris));
    },
  },
  // outfit sheets: clean 3D portraits of many looks (front 3/4, side, back)
  outfits: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      const S = '#f1c9a0';
      const cast = [
        { hair: 'spiky', hairColor: '#1a1a1a', hat: 'straw', top: '#c62828', topStyle: 'vest', bottom: '#1e63b8', bottomStyle: 'shorts', waist: 'sash', waistCol: '#f4c430', shoeStyle: 'sandals', skin: S, muscle: 0.7, grin: true },
        { hair: 'short', hairColor: '#2e7d32', top: '#f5f5f5', topStyle: 'open', bottom: '#263238', bottomStyle: 'trousers', waist: 'haramaki', waistCol: '#2e7d32', shoeStyle: 'boots', shoes: '#212121', skin: '#e0ac7e', muscle: 1.1, eyeShape: 'sharp' },
        { fem: true, hair: 'long', hairColor: '#ef6c00', top: '#4fc3f7', topStyle: 'crop', bottom: '#1e3a8a', bottomStyle: 'skirt', shoeStyle: 'sandals', shoes: '#8d6e4a', skin: '#f9dcc4', eyeShape: 'soft', mouth: 'smile' },
        { hair: 'short', hairColor: '#f2d16b', top: '#212121', topStyle: 'jacket', top2: '#5c8fd6', tie: '#212121', bottom: '#212121', bottomStyle: 'slim', shoeStyle: 'shoes', shoes: '#1a1a1a', skin: S, muscle: 0.4, eyeShape: 'sharp', mouth: 'flat' },
        { hair: 'short', hairColor: '#111111', hat: 'marine', top: '#f5f5f5', topStyle: 'shirt', bottom: '#1b3a6b', bottomStyle: 'trousers', waist: 'belt', coat: '#fafafa', shoeStyle: 'boots', shoes: '#2d2d2d', skin: '#e0ac7e', muscle: 0.8 },
        { hair: 'curly', hairColor: '#1a1a1a', hat: 'bandana', hatColor: '#c62828', top: '#1e40af', topStyle: 'striped', top2: '#f5f5f5', bottom: '#6d4c41', bottomStyle: 'baggy', waist: 'sash', waistCol: '#c62828', shoeStyle: 'boots', shoes: '#3b2a1a', skin: '#a0643a', muscle: 0.6, grin: true },
        { hair: 'topknot', hairColor: '#111111', top: '#5e35b1', topStyle: 'kimono', bottom: '#37474f', bottomStyle: 'hakama', shoeStyle: 'geta', skin: S, muscle: 0.5, eyeShape: 'sharp' },
        { fem: true, hair: 'ponytail', hairColor: '#3b2a1a', top: '#e57373', topStyle: 'dress', bottomStyle: 'longskirt', shoeStyle: 'shoes', shoes: '#6d4c41', skin: S, eyeShape: 'round', mouth: 'smile' },
        { race: 'buccaneer', hair: 'spiky', hairColor: '#29b6f6', top: '#e53935', topStyle: 'open', bottom: '#1565c0', bottomStyle: 'shorts', waist: 'belt', shoeStyle: 'sandals', skin: '#e0ac7e', bulk: 1.3, eyeShape: 'sharp', grin: true },
        { fem: true, hair: 'long', hairColor: '#111111', top: '#6a1b9a', topStyle: 'coat', coat: '#6a1b9a', top2: '#f5f5f5', bottom: '#4e342e', bottomStyle: 'slim', shoeStyle: 'boots', shoes: '#3e2723', skin: '#e0ac7e', eyeShape: 'soft' },
        { fem: true, hair: 'bun', hairColor: '#d84315', top: '#43a047', topStyle: 'tank', bottom: '#8d6e63', bottomStyle: 'capri', waist: 'belt', shoeStyle: 'shoes', shoes: '#5d4037', skin: '#c68642' },
        { hair: 'buzz', hairColor: '#3b2a1a', top: '#8d6e63', topStyle: 'bare', bottom: '#5d4037', bottomStyle: 'baggy', waist: 'sash', waistCol: '#1e88e5', shoeStyle: 'bare', skin: '#a0643a', muscle: 1.1 },
      ];
      const turns = args.turn ? [Number(args.turn)] : [0, 1.3, 3.14];
      for (const turn of turns) {
        await page.evaluate(({ cast, turn }) => {
          document.getElementById('sheet')?.remove();
          const box = document.createElement('div');
          box.id = 'sheet';
          Object.assign(box.style, { position: 'fixed', inset: '0', background: '#cfd8dc', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', zIndex: 99999, alignItems: 'end' });
          cast.forEach((lk, i) => {
            const c = window.OP.debug.portrait({ race: lk.race || 'human', seed: i * 7 + 1, ...lk }, { w: 210, h: 355, view: 'full', turn });
            if (c) box.appendChild(c);
          });
          document.body.appendChild(box);
        }, { cast, turn });
        await frames(page, 2);
        await snap('sheet-' + turn);
      }
    },
  },
  // heads from every angle: a bald head (the bare skull), then hair styles
  heads: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      const looks = [
        { hair: 'bald', skin: '#f1c9a0', eyeShape: 'round' },
        { hair: 'short', hairColor: '#3b2a1a', skin: '#f1c9a0', eyeShape: 'sharp' },
        { fem: true, hair: 'long', hairColor: '#ef6c00', skin: '#f9dcc4', eyeShape: 'soft', mouth: 'smile' },
        { hair: 'spiky', hairColor: '#1a1a1a', skin: '#e0ac7e', grin: true },
      ];
      const pick = args.look !== undefined ? [looks[Number(args.look)]] : looks;
      const angles = [[0, 0, 'front'], [0.7, 0, '3/4'], [1.5708, 0, 'side'], [2.4, 0, 'back 3/4'], [3.1416, 0, 'back'], [0.4, 0.75, 'above'], [0.4, -0.55, 'below']];
      for (let li = 0; li < pick.length; li++) {
        await page.evaluate(({ lk, angles, li }) => {
          document.getElementById('sheet')?.remove();
          const box = document.createElement('div');
          box.id = 'sheet';
          Object.assign(box.style, { position: 'fixed', inset: '0', background: '#cfd8dc', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', zIndex: 99999, alignItems: 'center', justifyItems: 'center' });
          for (const [turn, elev, name] of angles) {
            const cell = document.createElement('div');
            Object.assign(cell.style, { position: 'relative' });
            const c = window.OP.debug.portrait({ race: 'human', seed: 3 + li, topStyle: 'tee', top: '#90a4ae', ...lk }, { w: 300, h: 330, view: 'head', turn, elev });
            if (c) cell.appendChild(c);
            const t = document.createElement('div');
            t.textContent = name;
            Object.assign(t.style, { position: 'absolute', left: '6px', top: '4px', font: '700 14px sans-serif', color: '#37474f' });
            cell.appendChild(t);
            box.appendChild(cell);
          }
          document.body.appendChild(box);
        }, { lk: pick[li], angles, li });
        await frames(page, 2);
        await snap('head-' + (args.look ?? li));
      }
    },
  },
  // One Piece hit effects: a heavy punch with its sound word, a sword finisher, the impact frame
  hitfx: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        const t = w.islands.find((i) => i.id === 'dawn_island').towns[0];
        window.OP.teleport(t.plaza.x, t.plaza.y + 10.5);
        g.env.clock = 11.5;
        g.actors = g.actors.filter((a) => a === p);
        const e = window.OP.debug.makeNPC({ name: 'Bandit', faction: 'bandit', level: 10, race: 'human' }, p.x, p.y - 2.6);
        e.controller = null; e.facing = Math.PI / 2;
        g.addActor(e);
        window.__e = e;
        const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.05;
      });
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 2); }
      const hit = (o) => page.evaluate((o) => {
        const g = window.OP.game, e = window.__e, p = g.player;
        g.fx.hit(p, e, { def: null, heavy: true, knockback: 1, impactFrame: o.impact, sprite: false }, { final: 40, crit: !!o.crit, el: o.el || 'physical', ang: -Math.PI / 2, playerInvolved: true });
      }, o);
      await hit({ crit: true });
      await step(page, 0.05); await frames(page, 2);
      await snap('heavy-punch');
      await step(page, 0.8);
      await hit({ el: 'fire' });
      await step(page, 0.08); await frames(page, 2);
      await snap('fire-hit');
      await step(page, 0.8);
      await hit({ impact: true });
      await page.evaluate(() => window.OP.game.fx.impactFrame(0.2));
      await frames(page, 2);
      await snap('impact-frame');
      await step(page, 1.2);
      await page.evaluate(() => { const p = window.OP.game.player; p.y += 3; p.dash = { vx: 0, vy: -0.05, t: 6, t0: 0.22, dodge: true }; });
      await frames(page, 2);
      await snap('dash-lines');
    },
  },
  // first-person hands: idle, a jab, a block (Foosha's plaza at noon)
  vmquick: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate(() => window.OP.quickStart('human'));
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world;
        const t = w.islands.find((i) => i.id === 'dawn_island').towns[0];
        window.OP.teleport(t.plaza.x, t.plaza.y + 10.5);
        g.env.clock = 11.5;
        const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.12;
      });
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 2); }
      await snap('vm-idle');
      await page.evaluate(() => { const g = window.OP.game; g.player.tryM1(g); });
      await step(page, 0.08); await frames(page, 2);
      await snap('vm-jab');
      await step(page, 0.8);
      await page.evaluate(() => { window.OP.key('F', true); });
      await step(page, 0.2); await frames(page, 2);
      await snap('vm-block');
      await page.evaluate(() => { window.OP.key('F', false); });
    },
  },
  // The sky and the weather (render3d/sky3d.js, game/weather.js): from the end
  // of Foosha's pier, each kind of weather at its time of day, a lightning
  // strike, a storm coming up (its tower on the horizon first), the night sky
  // and the moon; then each island's own (Drum in snow, Alabasta in dust).
  //   node tools/shot.mjs skyweather [--looks=fair@11:sea,storm@15.5:sea!,...] [--quality=low]
  // A look is kind@clock:view (views: sea, up, town, front — toward the storm —
  // and moon); '!' adds a lightning strike; 'approach' is a storm on its way.
  skyweather: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      await page.evaluate((q) => {
        window.OP.quickStart('human');
        const g = window.OP.game;
        g.settings.view = 'third'; g.settings.shiftLock = false;
        if (q) g.settings.quality = q;
        g.applySettings();
        document.querySelector('.look-hint')?.remove();
        const ui = document.getElementById('ui'); if (ui) ui.style.visibility = 'hidden';
        const w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island'), d = isl.docks[0], t = isl.towns[0];
        const ex = d.end.x + 0.5, ey = d.end.y + 0.5;
        window.__sky = {
          sea: { from: [ex - d.dirX * 4, ey - d.dirY * 4, 4.2], at: [ex + d.dirX * 160 + d.dirY * 30, ey + d.dirY * 160 - d.dirX * 30, 22] },
          up: { from: [ex - d.dirX * 4, ey - d.dirY * 4, 3], at: [ex + d.dirX * 60, ey + d.dirY * 60, 60] },
          town: { from: [ex + d.dirX, ey + d.dirY, 5.5], at: [t.plaza.x, t.plaza.y, 6] },
        };
      }, args.quality || null);
      // a camera set down at (x, y, h) looking at (x, y, h); the player behind it, out of sight
      const view = (name) => page.evaluate((name) => {
        const g = window.OP.game, w = g.world, V = window.__sky;
        let f = V.sea.from, a = V[name]?.at;
        if (name === 'up') f = V.up.from;
        if (name === 'town') f = V.town.from;
        if (name === 'front') { const fa = g.env.frontAngle ?? 0; a = [f[0] + Math.cos(fa) * 160, f[1] + Math.sin(fa) * 160, 26]; }
        if (name === 'moon') { const m = g.view3d.sky.moonDir; a = [f[0] + m.x * 100, f[1] + m.z * 100, f[2] + m.y * 100 - 20]; }
        const dx = w.dx(f[0], a[0]), dy = a[1] - f[1], L = Math.hypot(dx, dy) || 1;
        window.OP.teleport(w.wx(f[0] - dx / L * 6), f[1] - dy / L * 6);
        g.view3d.rig.shot = { from: f, at: a };
      }, name);
      const settle = async (s) => { for (let i = 0; i < 4; i++) { await step(page, s / 4); await frames(page, 2); } };
      const held = async (label) => { await page.evaluate(() => { window.OP.hold = true; }); await frames(page, 3); await snap(label); await page.evaluate(() => { window.OP.hold = false; }); };
      await view('sea');
      await settle(1.2);
      const looks = String(args.looks || 'fair@11:sea,fair@11:town,cloudy@11:sea,rain@11:sea,rain@11:town,storm@15.5:sea!,approach@13:front,fair@18.8:sea,clear@22.5:up,clear@22.5:moon,overcast@22.5:up');
      for (const look of looks.split(',')) {
        const m = look.match(/^([a-z]+)@([0-9.]+):([a-z]+)(!?)$/);
        if (!m) { console.log('bad look', look); continue; }
        const [, kind, clock, at, bolt] = m;
        await page.evaluate(([kind, clock]) => {
          const e = window.OP.game.env;
          e.clock = clock; e.fog = 0;
          if (kind === 'approach') { e.setWeather('fair', { now: true, hold: true }); e.setWeather('storm', { hold: true }); } else e.setWeather(kind, { now: true, hold: true });
        }, [kind, +clock]);
        if (kind === 'approach') await settle(6);
        await view(at);
        await settle(1);
        await held(`${kind}-${clock}-${at}`);
        if (bolt) {
          await page.evaluate(() => { window.OP.hold = true; const g = window.OP.game; g.env.strikeNow({ near: true, angle: g.view3d.rig.yaw + 0.25 }); g.env.update(0.075, g); });
          await frames(page, 3);
          await snap(`${kind}-${clock}-${at}-lightning`);
          await page.evaluate(() => { window.OP.hold = false; });
        }
      }
      // the islands' own climates, from the end of their piers
      for (const [id, kinds] of [['drum_island', ['snow', 'blizzard']], ['alabasta', ['dust', 'sandstorm']]]) {
        if (args.looks) break;
        await page.evaluate((id) => {
          const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === id), d = isl.docks[0];
          const ex = d.end.x + 0.5 + d.dirX * 1.5, ey = d.end.y + 0.5 + d.dirY * 1.5;
          const t = isl.towns.slice().sort((a, b) => w.distance(ex, ey, a.plaza.x, a.plaza.y) - w.distance(ex, ey, b.plaza.x, b.plaza.y))[0];
          window.OP.teleport(ex - d.dirX * 6, ey - d.dirY * 6);
          const h = Math.max(0, g.view3d.ground(ex, ey));
          g.view3d.rig.shot = { from: [ex, ey, h + 5.5], at: [t.plaza.x, t.plaza.y, h + 7] };
        }, id);
        await settle(2);
        for (const k of kinds) {
          await page.evaluate((k) => { const e = window.OP.game.env; e.clock = 11.5; e.setWeather(k, { now: true, hold: true }); }, k);
          await settle(2);
          await held(`${id}-${k}`);
        }
      }
    },
  },
};
