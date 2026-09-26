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
};
