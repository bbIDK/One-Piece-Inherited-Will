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
          { name: 'Musician', race: 'longleg', look: { hair: 'afro', hairColor: '#111111', top: '#212121', bottom: '#212121', skin: '#fafafa', eyeShape: 'round', mouth: 'flat' } },
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
        for (let k = 0; k < 6000; k++) {
          const x = Math.floor(isl.x + (Math.random() - 0.5) * 2 * isl.radius), y = Math.floor(isl.y + (Math.random() - 0.5) * 2 * isl.radius);
          const t = w.type(x, y);
          if (t === 16 && !beach && w.sd(x, y) > 1.5 && w.sd(x, y) < 4 && !w.isBlocked(x, y)) beach = [x, y];
          if (!G.has(t) || w.isBlocked(x, y)) continue;
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
        return { counts: c ? Object.fromEntries(Object.entries(c.meshes).map(([k, m]) => [k, m.count])) : null, cells: c?.cells.size, calls: i.render.calls, tris: i.render.triangles };
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
          c.rebuild(v.ctx, w, Math.floor(w.wx(x) / 16), Math.floor(p.y / 16), 64, false);
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
        g.player.stamina = 999;
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
};
