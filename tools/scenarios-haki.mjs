// Haki in the 3D view, third or first person: Armament's coat spreading up
// the arms and the blows it lands, Observation's sonar pulse and the wills it
// senses through a wall, Conqueror's burst (the weak fainting, eyes rolled
// back), Infusion, and two Conqueror's clashing. Contact sheets in shots/.
//
//   node tools/shot.mjs haki-3d [--mode=third|first] [--only=armament,observation,conqueror,infusion,clash]
//        [--colour=#rrggbb (the player's Conqueror's)] [--page=shots/<build>/index.html]
import { boot, sheet } from './scenarios-combat.mjs';

const ALL = ['armament', 'observation', 'conqueror', 'infusion', 'clash'];

export const scenarios = {
  'haki-3d': {
    async run(page, snap, args) {
      await boot(page);
      const mode = args.mode === 'first' ? 'first' : 'third';
      const only = args.only ? String(args.only).split(',') : ALL;
      await page.evaluate(({ mode, colour }) => {
        const L = window.LAB, g = window.OP.game;
        L.view3d = true;
        L.arena();
        if (g.settings) g.settings.view = mode;
        g.view3d.setMode(mode); g.view3d.setActive(true);
        // (frames only between captures: a 3D frame costs a lot under SwiftShader)
        L.run = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); g.render(); };
        // the camera: from `side` radians off the line from the player to (x, y), `dist` back, `pitch`
        L.view = (x, y, side = 0, dist = 0, pitch) => {
          const p = g.player, v = g.view3d;
          const a = Math.atan2(y - p.y, g.world.dx(p.x, x));
          p.facing = a;
          v.rig.yaw = (a + side + Math.PI * 2) % (Math.PI * 2);
          v.rig.pitch = pitch ?? (mode === 'first' ? -0.12 : -0.08);
          if (dist && v.rig.tp) v.rig.tp.dist = dist;
          window.OP.input.mouse.x = window.innerWidth / 2; window.OP.input.mouse.y = window.innerHeight / 2;
        };
        // (a film may take the player's controls away to hold a pose: every new one gives them back)
        const arena0 = L.arena;
        L.arena = () => {
          const p = g.player;
          if (L.ctl) p.controller = L.ctl;
          p.blocking = false; window.OP.key('F', false);
          arena0();
          // (the last film's leftovers die away of themselves — a coat falling, a blow's last words — before the next:
          // cleared all at once, the overlay would keep showing the words it drew last)
          for (let i = 0; i < 80; i++) g.update(1 / 60);
        };
        L.still = () => { const p = g.player; L.ctl = L.ctl || p.controller; p.controller = null; };
        L.haki = (o = {}) => {
          const p = g.player, c = g.state.char;
          // (bare arms in a red vest, so the black of the coat shows against the skin)
          p.look = { ...p.look, topStyle: 'vest', noSleeves: true, top: '#d32f2f' };
          for (const k of ['armament', 'observation', 'conqueror']) { c.haki[k] = o[k] ?? 60; }
          p.hakiSkill = c.haki;
          if (colour) p.hakiSig = c.hakiSig = { ...c.hakiSig, conqueror: colour };
          p.haki = p.d.maxHaki = 999;
          p.cooldowns = {};
        };
      }, { mode, colour: args.colour || null });
      const clip = { x: 0, y: 0, width: 1280, height: 720 };
      const film = async (frames, label, setup, start, times) => {
        await page.evaluate(setup);
        await page.evaluate(() => window.LAB.run(2));
        await page.evaluate(start);
        let t = 0;
        for (const at of times) {
          const n = Math.max(0, Math.round((at - t) * 60));
          await page.evaluate((n) => window.LAB.run(n), n);
          t += n / 60;
          frames.push({ label: `${label} ${t.toFixed(2)}s`, buf: await page.screenshot({ clip, scale: 'css' }) });
        }
      };
      const frames = [];
      const T = mode === 'third';
      // ---- Armament: the coat spreading up from the fingertips, then a blow landed with it
      if (only.includes('armament')) {
        for (const [lvl, tag] of [[12, 'fists'], [70, 'whole arms']]) {
          await film(frames, `Armament (${tag}, lvl ${lvl})`, `(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.haki({ armament: ${lvl} }); L.dummy(2.2, 0, { hpMul: 400 }); L.view(L.target.x, L.target.y, ${T ? 2.55 : 0}, ${T ? 1.7 : 0}, ${T ? -0.3 : -0.32}); L.still(); const p = window.OP.game.player; p.blocking = true; p.blockTime = 1; })()`,
            `(() => { const g = window.OP.game, p = g.player; p.armament = true; g.fx.hakiOn(p, 'armament'); })()`, [0.07, 0.17, 0.32, 0.7]);
        }
        await film(frames, 'Armament: a blow (lvl 70)', `(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.haki({ armament: 70 }); L.dummy(1.5, 0, { hpMul: 400 }); L.view(L.target.x, L.target.y, ${T ? 1.25 : 0}, ${T ? 2.4 : 0}, ${T ? 0 : -0.1}); const g = window.OP.game; g.player.armament = true; })()`,
          `(() => { const g = window.OP.game, p = g.player; window.LAB.run(30); p.tryHeavy(g); })()`, [0.32, 0.4, 0.55]);
        await film(frames, 'Armament: Ryou (lvl 90)', `(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.haki({ armament: 90 }); L.dummy(1.5, 0, { hpMul: 400 }); L.view(L.target.x, L.target.y, ${T ? 1.25 : 0}, ${T ? 2.4 : 0}, ${T ? 0 : -0.1}); const g = window.OP.game; g.player.armament = true; })()`,
          `(() => { const g = window.OP.game, p = g.player; window.LAB.run(30); p.tryHeavy(g); })()`, [0.36, 0.45]);
        await sheet(page, `haki-3d-${mode}-armament.png`, frames.splice(0), 4, `Armament Haki (${mode} person): the coat spreading from the fingertips; blows; Ryou`);
      }
      // ---- Observation: the sonar pulse, then foes sensed through a building's walls
      if (only.includes('observation')) {
        await film(frames, 'Observation: the pulse', `(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.haki({ observation: 60 }); L.dummy(9, 0, { hpMul: 400 }); L.view(L.target.x, L.target.y, ${T ? 0.5 : 0}, ${T ? 5 : 0}, ${T ? -0.42 : -0.25}); })()`,
          `(() => { const g = window.OP.game; g.player.controller.toggleHaki(g.player, g, 'observation'); })()`, [0.1, 0.25, 0.5]);
        await film(frames, 'Observation: sensed through walls', `(() => {
            const L = window.LAB, g = window.OP.game, w = g.world, p = g.player;
            L.arena(); L.equip({ style: 'brawler' }); L.haki({ observation: 60 }); L.props = true;
            // the nearest house: you outside it on one side, three foes outside it on the other
            let best = null, bd = Infinity;
            for (const isl of w.islands) for (const t of isl.towns || []) for (const b of t.buildings || []) {
              if (!b.fw || b.fw < 6 || b.fw > 14) continue;
              const d = Math.abs(w.dx(p.x, b.x)) + Math.abs(b.y - p.y);
              if (d < bd) { bd = d; best = b; }
            }
            const b = best, R = Math.max(b.fw, b.fd) / 2, H = L.home;
            const free = (x, y) => w.walkable(x, y) && !w.solid(x, y) && !w.interiorAt?.(x, y);
            let sp = null;
            for (let i = 0; i < 16 && !sp; i++) {
              const a = i / 16 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
              const q = { px: b.x + c * (R + 6), py: b.y + s * (R + 6), fx: b.x - c * (R + 2.5), fy: b.y - s * (R + 2.5), c, s };
              if (free(q.px, q.py) && free(q.fx, q.fy)) sp = q;
            }
            sp = sp || { px: b.x, py: b.y + R + 6, fx: b.x, fy: b.y - R - 2.5, c: 0, s: 1 };
            p.x = sp.px; p.y = sp.py;
            const foes = [];
            for (const k of [-2.5, 0, 2.5]) { const f = L.spawn({ name: 'Bandit', faction: 'pirate', look: { top: '#5d4037' } }, w.dx(H.x, sp.fx - sp.s * k), sp.fy + sp.c * k - H.y); f.aggroPlayer = true; f.provoked = true; foes.push(f); }
            L.target = foes[1];
            g.player.observation = true;
            L.view(b.x, b.y, 0, ${T ? 5.5 : 0}, ${T ? -0.15 : -0.05});
          })()`, '(() => {})()', [0.2, 0.6]);
        await sheet(page, `haki-3d-${mode}-observation.png`, frames.splice(0), 3, `Observation Haki (${mode} person): the sonar pulse; hostile wills through walls`);
      }
      // ---- Conqueror's: the burst, the weak fainting
      if (only.includes('conqueror')) {
        await film(frames, "Conqueror's burst", `(() => {
            const L = window.LAB, g = window.OP.game; L.arena(); L.equip({ style: 'brawler' }); L.haki({ conqueror: 60 });
            for (const [dx, dy] of [[4, 0], [3.5, 2.5], [3.5, -2.5], [6, 1.2], [6, -1.2]]) { const f = L.spawn({ name: 'Grunt', faction: 'marine', level: 3, hpMul: 1 }, dx, dy); f.hakiSkill = {}; f.aggroPlayer = true; f.recalc(); }
            L.target = g.actors.find((a) => !a.isPlayer);
            L.view(L.target.x, L.target.y, ${T ? 0.7 : 0}, ${T ? 7 : 0}, ${T ? -0.28 : -0.12});
          })()`, `(() => { const g = window.OP.game; g.player.tryTechnique('haki_conqueror', g); })()`, [0.5, 0.6, 0.8, 1.3, 2.4]);
        await sheet(page, `haki-3d-${mode}-conqueror.png`, frames.splice(0), 3, `Conqueror's Haki (${mode} person): the burst in the king's colour; the weak faint`);
      }
      // ---- Infusion: blows wreathed in black lightning
      if (only.includes('infusion')) {
        await film(frames, "Conqueror's Infusion", `(() => { const L = window.LAB; L.arena(); L.equip({ style: 'brawler' }); L.haki({ conqueror: 60, armament: 70 }); L.dummy(2.0, 0, { hpMul: 400 }); L.view(L.target.x, L.target.y, ${T ? 1.25 : 0}, ${T ? 2.6 : 0}); window.OP.game.player.armament = true; })()`,
          `(() => { const g = window.OP.game, p = g.player; p.tryTechnique('haki_infusion', g); window.LAB.run(50); p.tryHeavy(g); })()`, [0.1, 0.36, 0.45]);
        await sheet(page, `haki-3d-${mode}-infusion.png`, frames.splice(0), 3, `Conqueror's Infusion (${mode} person)`);
      }
      // ---- the clash: your Conqueror's meeting a boss's
      if (only.includes('clash')) {
        await film(frames, "Conqueror's clash", `(() => {
            const L = window.LAB, g = window.OP.game; L.arena(); L.equip({ style: 'brawler' }); L.haki({ conqueror: 60 });
            const k = L.spawn({ name: 'Kaido of the Beasts', faction: 'pirate', level: 90, hpMul: 50 }, 6, 0);
            k.boss = true; k.hakiSkill = { armament: 98, observation: 90, conqueror: 95 }; k.hakiSig = { ...k.hakiSig, conqueror: '#2e8bff' }; k.aggroPlayer = true;
            for (const [dx, dy] of [[3, 3], [3, -3]]) { const f = L.spawn({ name: 'Grunt', faction: 'marine', level: 3, hpMul: 1 }, dx, dy); f.hakiSkill = {}; f.aggroPlayer = true; f.recalc(); }
            L.target = k;
            L.view(k.x, k.y, ${T ? 1.45 : 0}, ${T ? 7.5 : 0}, ${T ? 0.12 : 0.18});
          })()`, `(() => { const g = window.OP.game; g.player.tryTechnique('haki_conqueror', g); })()`, [0.5, 0.65, 0.95, 1.5, 2.2]);
        await sheet(page, `haki-3d-${mode}-clash.png`, frames.splice(0), 3, `Conqueror's clash (${mode} person): crimson against azure`);
      }
    },
  },
};
