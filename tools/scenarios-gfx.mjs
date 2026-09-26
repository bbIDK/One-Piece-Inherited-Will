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
