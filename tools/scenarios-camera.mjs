// The third-person camera among trees and props: it swings round the player
// in the densest pine forest there is, past trunks and through canopies, a
// shot per step (nothing should pop out of existence; the camera comes in
// front of trunks; canopies it's inside are faded see-through, never black).
//   node tools/shot.mjs camtrees [--sub=pine | --kind=rock|statue|...] [--gap=1.4] [--steps=16] [--pitch=0] [--dist=4.2] [--fine=1] [--mid=1] [--perf=1] [--tag=name]
//     --gap    how far from the big tree's trunk (or the rock, statue...) you stand (m)
//     --steps  shots round the full circle (from the tree straight behind you)
//     --fine   also sweep closely past its trunk     --mid  a shot one frame into each step too (the fade on its way)
//     --perf   time the camera's collision and fading, and check first person leaves nothing faded
// (the shots are the 3D canvas itself, grabbed right after drawing it: a page
// screenshot takes many times as long under SwiftShader)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'shots');

/**
 * Advance the view n frames of 1/20 s each without drawing them (the camera,
 * props and fades all move on), then draw one and save it as a PNG.
 */
async function grab(page, name, label, n = 8) {
  const url = await page.evaluate((n) => {
    const g = window.OP.game, v = g.view3d;
    quiet(v, n);
    v.lastT = performance.now() - 50;
    v.render(g);
    return v.canvas.toDataURL('image/png');
  }, n);
  mkdirSync(SHOTS, { recursive: true });
  grab.n = (grab.n || 0) + 1;
  const file = join(SHOTS, `${name}-${String(grab.n).padStart(2, '0')}-${label}.png`);
  writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log(`shot → ${file}`);
}

/** What the camera is doing: where it is, how far out along the arm, which props are faded (and how far). */
const camState = (page) => page.evaluate(() => {
  const g = window.OP.game, v = g.view3d, cam = v.rig.camera;
  const r = (x) => Math.round(x * 100) / 100;
  const out = { yaw: r(v.rig.yaw), cam: [r(cam.position.x), r(cam.position.y), r(cam.position.z)], arm: v.rig.arm !== undefined ? r(v.rig.arm) : null };
  const fades = [];
  for (const [view, rec] of v.camFades || []) { const o = view.userData.o; fades.push(`${o?.sub || o?.kind}@${r(rec.f)}`); }
  if (fades.length) out.faded = fades;
  return out;
});

export const scenarios = {
  camtrees: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await waitReady(page);
      // (from here the scenario runs and draws every frame itself: see grab)
      await page.evaluate(() => {
        window.OP.quickStart('human');
        const g = window.OP.game;
        window.OP.hold = true;
        g.render = () => {};
        // n frames of 1/20 s, not drawn
        window.quiet = (v, n) => {
          const draw = v.draw;
          v.draw = () => {};
          try { for (let i = 0; i < n; i++) { v.lastT = performance.now() - 50; v.render(g); } } finally { v.draw = draw; }
        };
      });
      // the densest stand of pines (or --kind: the biggest rock, a statue...), and a spot right beside it
      const spot = await page.evaluate(({ kind, sub, gap }) => {
        const g = window.OP.game, w = g.world;
        const all = [];
        for (const list of w.objects.chunks.values()) for (const o of list) if (o.kind === kind && (kind !== 'tree' || o.sub === sub)) all.push(o);
        const cell = new Map(), key = (x, y) => `${Math.floor(x / 6)},${Math.floor(y / 6)}`;
        for (const o of all) { const k = key(o.x, o.y); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(o); }
        const score = (o) => {
          if (kind !== 'tree') return o.s || 1;
          if ((o.s || 1) < 1.05) return -1;
          let n = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const q of cell.get(key(o.x + i * 6, o.y + j * 6)) || []) if (Math.hypot(q.x - o.x, q.y - o.y) < 7) n++;
          return n;
        };
        const ranked = all.map((o) => [score(o), o]).filter((e) => e[0] >= 0).sort((a, b) => b[0] - a[0]);
        for (const [n, best] of ranked.slice(0, 40)) {
          // stand `gap` m from its middle, on open ground, clear of anything else in the way
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const x = best.x + Math.cos(a) * gap, y = best.y + Math.sin(a) * gap;
            if (!w.walkable(x, y) || w.isLiquid(x, y) || w.hitsProp(x, y, 0.5)) continue;
            return { kind: best.kind, sub: best.sub, name: best.name, tx: best.x, ty: best.y, ts: best.s, x, y, a, n, total: all.length };
          }
        }
        return null;
      }, { kind: args.kind || 'tree', sub: args.sub || 'pine', gap: Number(args.gap ?? 1.4) });
      console.log('spot', JSON.stringify(spot));
      if (!spot) throw new Error('nowhere to stand');
      await page.evaluate(({ x, y }) => {
        const g = window.OP.game;
        g.actors = g.actors.filter((a) => a === g.player);
        window.OP.teleport(x, y);
        g.settings.view = 'third'; g.settings.shiftLock = false; g.settings.autoRes = false; g.applySettings();
        g.env.clock = 11; g.env.storm = 0; g.env.stormTarget = 0; g.env.fog = 0; g.env.weatherTimer = 9999;
        for (const el of document.body.children) if (el.id !== 'game') el.style.visibility = 'hidden';
      }, spot);
      // let the ground and the props stream in round the player
      await page.evaluate(() => {
        const g = window.OP.game, v = g.view3d;
        for (let i = 0; i < 60; i++) { g.update(1 / 30); quiet(v, 1); }
      });
      const pitch = Number(args.pitch ?? 0), dist = Number(args.dist ?? 4.2), name = 'camtrees' + (args.tag ? '-' + args.tag : '');
      // the yaw that puts the tree (rock...) straight behind the player, on the camera's side
      // (you face away from it: the camera sits behind you, facing the way you do)
      const behind = spot.a;
      const shoot = async (yaw, label) => {
        await page.evaluate(({ yaw, pitch, dist }) => { const v = window.OP.game.view3d; v.rig.yaw = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = pitch; v.rig.tp.dist = dist; }, { yaw, pitch, dist });
        if (args.mid) {
          await grab(page, name, label + '-mid', 1);
          console.log(label + '-mid', JSON.stringify(await camState(page)));
        }
        await grab(page, name, label, args.mid ? 6 : 8);
        console.log(label, JSON.stringify(await camState(page)));
      };
      if (args.perf) {
        // what the camera's collision and the fading cost a frame, swinging round in the forest
        const ms = await page.evaluate(() => {
          const g = window.OP.game, v = g.view3d, ground = (x, y) => v.ground(x, y);
          let rig = 0, fade = 0, n = 0;
          for (let i = 0; i < 360; i++) {
            v.rig.yaw = (i / 360) * Math.PI * 2;
            const t0 = performance.now();
            v.rig.update(1 / 60, g, ground);
            const t1 = performance.now();
            v.fadeCameraProps(1 / 60);
            fade += performance.now() - t1; rig += t1 - t0; n++;
          }
          return { rig: (rig / n).toFixed(3), fade: (fade / n).toFixed(3), faded: v.camFades.size };
        });
        console.log('perf ms/frame', JSON.stringify(ms));
        // first person: nothing stays faded (it all comes back over a moment)
        const fp = await page.evaluate(() => {
          const g = window.OP.game, v = g.view3d;
          g.settings.view = 'first'; g.applySettings();
          quiet(v, 12);
          const left = v.camFades.size;
          g.settings.view = 'third'; g.applySettings();
          quiet(v, 12);
          return { mode: 'first', stillFaded: left };
        });
        console.log('first person', JSON.stringify(fp));
      }
      const n = Number(args.steps ?? 16);
      for (let i = 0; i < n; i++) await shoot(behind + (i / n) * Math.PI * 2, `yaw${String(Math.round((i / n) * 360)).padStart(3, '0')}`);
      if (args.fine) {
        // closely past the trunk: from one side of it to the other
        for (let d = -40; d <= 40; d += 10) await shoot(behind + d * Math.PI / 180, `past${d < 0 ? 'm' : 'p'}${Math.abs(d)}`);
      }
    },
  },
};
