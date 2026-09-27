// World checks: collisions and placements.
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);
const window_step = async (page, dt) => { await page.evaluate((dt) => window.OP.step(dt), dt); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); };
export const scenarios = {
  // third person: free mouse, then shift lock (crosshair, over the shoulder)
  camctl: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); g.view3d.rig.pitch = -0.1; });
      for (let i = 0; i < 12; i++) await step(page, 0.1);
      await frames(page, 2);
      const st = () => page.evaluate(() => { const g = window.OP.game, r = g.view3d.rig; return { shiftLock: r.shiftLock, freeMouse: r.freeMouse, crosshair: !document.querySelector('.crosshair').classList.contains('hidden'), hint: document.querySelector('.look-hint')?.textContent }; });
      console.log('free', JSON.stringify(await st()));
      await snap('free');
      await page.evaluate(() => window.OP.key('Shift', true)); await step(page, 0.05);
      await page.evaluate(() => window.OP.key('Shift', false)); await step(page, 0.4); await frames(page, 2);
      console.log('locked', JSON.stringify(await st()));
      await snap('shiftlock');
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      await page.evaluate(() => window.OP.key('W', false));
      const face = await page.evaluate(() => { const g = window.OP.game; return { facing: +g.player.facing.toFixed(2), yaw: +g.view3d.rig.yaw.toFixed(2) }; });
      console.log('facing', JSON.stringify(face));
      // and first person while sprinting
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); window.OP.key('W', true); window.OP.key('Shift', true); });
      for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('fp-sprint');
      await step(page, 0.14); await frames(page, 1);
      await snap('fp-sprint2');
      await page.evaluate(() => { window.OP.key('W', false); window.OP.key('Shift', false); });
    },
  },
  // first-person hands: relaxed, walking, sprinting, in a fight, reaching out
  fphands: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.05; });
      for (let i = 0; i < 20; i++) await step(page, 0.1);
      await frames(page, 2); await snap('idle');
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('walk');
      await page.evaluate(() => window.OP.key('Shift', true));
      for (let i = 0; i < 9; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('sprint');
      await step(page, 0.13); await frames(page, 1);
      await snap('sprint2');
      await page.evaluate(() => { window.OP.key('Shift', false); window.OP.key('W', false); });
      await step(page, 0.3);
      await page.evaluate(() => { const g = window.OP.game; g.player.tryM1(g); });
      await step(page, 0.12); await frames(page, 1);
      await snap('punch');
      await step(page, 0.8); await frames(page, 1);
      await snap('guard');
      await page.evaluate(() => { const g = window.OP.game; g.player._lastActT = -99; g.combatT = 0; });
      await step(page, 2.8); await frames(page, 1);
      await page.evaluate(() => { window.OP.game.player.reachT = 0.45; });
      await step(page, 0.2); await frames(page, 1);
      await snap('reach');
    },
  },
  // First-person fingers: every grip up close (guard pose), then the hands in motion.
  fingers: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.05; document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 12; i++) await step(page, 0.1);
      // a jab brings the hands up into a guard; then force each grip on both hands
      await page.evaluate(() => { const g = window.OP.game; g.player.tryM1(g); });
      await step(page, 0.9); await frames(page, 2);
      await page.evaluate(() => {
        const vm = window.OP.game.view3d.vm;
        window.__shape = null;
        const wrap = () => {
          const m = vm.model;
          if (!m || m.__wrapped) return;
          const orig = m.pose.bind(m);
          m.pose = (P, o) => orig(window.__shape ? { ...P, hand: window.__shape, handB: window.__shape } : P, o);
          m.__wrapped = true;
        };
        wrap();
        vm.root.position.set(0, 0.07, 0.1); // (a little closer, for the close-up)
      });
      for (const sh of String(args.shapes || 'fist,relaxed,palm,flat,claw,grab,finger').split(',')) {
        await page.evaluate((sh) => { window.__shape = sh; const g = window.OP.game; g.combatT = 5; }, sh);
        for (let i = 0; i < 6; i++) { await step(page, 0.08); await frames(page, 1); }
        await snap('grip-' + sh);
      }
      // fingers in motion: sprinting (relaxed hands), a few frames apart
      await page.evaluate(() => { window.__shape = null; window.OP.game.view3d.vm.root.position.set(0, 0, 0); const g = window.OP.game; g.player._lastActT = -99; g.combatT = 0; });
      await step(page, 2.5);
      await page.evaluate(() => { window.OP.key('W', true); window.OP.key('Shift', true); });
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
      for (let j = 0; j < 3; j++) { await step(page, 0.12); await frames(page, 1); await snap('sprint-' + j); }
      await page.evaluate(() => { window.OP.key('W', false); window.OP.key('Shift', false); });
      await step(page, 1);
      // reach out and take hold
      await page.evaluate(() => { window.OP.game.player.reachT = 0.45; });
      await step(page, 0.14); await frames(page, 1); await snap('reach-open');
      await step(page, 0.16); await frames(page, 1); await snap('reach-grab');
      // finger angles over time (they should drift a little even at rest)
      const trace = await page.evaluate(async () => {
        const m = window.OP.game.view3d.vm.model, out = [];
        for (let i = 0; i < 5; i++) { window.OP.step(0.25); await new Promise((r) => requestAnimationFrame(() => r())); out.push(m.fing[0].a.map((x) => +x.toFixed(3)).join(' ')); }
        return out;
      });
      console.log('index..little knuckle bends over 1s:\n' + trace.join('\n'));
    },
  },
  // Your own hands in third person, close up: loose at rest, swinging on a run, fists to fight.
  hands3p: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 10; i++) await step(page, 0.1);
      // somewhere open, then the camera low and close, in front and to the right
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        for (let r = 4; r < 40; r += 1) for (let k = 0; k < 24; k++) {
          const a = k / 24 * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          let ok = true;
          for (let dx = -3; dx <= 3 && ok; dx++) for (let dy = -3; dy <= 3 && ok; dy++) if (!w.walkable(x + dx, y + dy) || w.isBlocked(x + dx, y + dy) || w.hitsProp(x + dx, y + dy, 0.5)) ok = false;
          if (ok) { window.OP.teleport(x, y); return; }
        }
      });
      const cam = (yawOff) => page.evaluate((yo) => { const g = window.OP.game, r = g.view3d.rig; r.tp.dist = 2.1; r.tp.height = 0.05; r.yaw = (((g.player.facing || 0) + yo) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); r.pitch = -0.12; }, yawOff);
      await cam(Math.PI * 0.8);
      for (let i = 0; i < 6; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('idle');
      await page.evaluate(() => window.OP.key('W', true));
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      await cam(Math.PI * 0.8);
      await step(page, 0.05); await frames(page, 1);
      await snap('run');
      await page.evaluate(() => window.OP.key('W', false));
      await step(page, 0.5);
      await page.evaluate(() => { const g = window.OP.game; g.player.tryM1(g); });
      await step(page, 0.6);
      await cam(Math.PI * 0.8);
      await step(page, 0.05); await frames(page, 1);
      await snap('guard');
    },
  },
  // Rain and snow in the world: falling past houses, stopped by roofs, splashing, ringing the sea.
  weather: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      const storm = (k, clock) => page.evaluate(([k, clock]) => { const e = window.OP.game.env; e.stormTarget = k; e.storm = k; e.weatherTimer = 1e9; e.clock = clock; e.fog = 0; }, [k, clock]);
      await storm(0.85, 11);
      // stand in a street with houses around (on a warm island, where it rains rather than snows)
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => i.id === 'dawn_island');
        const hs = w.objects.near(isl.x, isl.y, isl.radius * 1.2, (o) => o.enterable && o.hgt && o.role === 'house');
        const b = hs[0];
        if (b) { window.OP.teleport(b.x + 0.5, b.y + 3.2); g.player.facing = -Math.PI / 2; }
        g.view3d.rig.yaw = (Math.PI * 1.5 + 0.35) % (Math.PI * 2); g.view3d.rig.pitch = -0.02;
        window.__house = b ? { x: b.x, y: b.y, fd: b.fd } : null;
      });
      for (let i = 0; i < 12; i++) { await window_step(page, 0.1); }
      await snap('rain-street');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.35; });
      for (let i = 0; i < 4; i++) await window_step(page, 0.1);
      await snap('rain-ground');
      // from inside a house, looking out of the door
      const inside = await page.evaluate(() => {
        const g = window.OP.game, b = window.__house;
        if (!b) return false;
        window.OP.teleport(b.x + 0.3, b.y - 1.1);
        g.view3d.rig.yaw = Math.PI / 2; g.view3d.rig.pitch = -0.1;
        return !!g.world.interiorAt(g.player.x, g.player.y);
      });
      console.log('inside', inside);
      for (let i = 0; i < 6; i++) await window_step(page, 0.1);
      await snap('rain-from-inside');
      // at night
      await page.evaluate(() => { const g = window.OP.game, b = window.__house; g.settings.view = 'third'; g.applySettings(); window.OP.teleport(b.x + 0.5, b.y + 3.2); g.view3d.rig.yaw = (Math.PI * 1.5 + 0.35) % (Math.PI * 2); g.view3d.rig.pitch = -0.05; });
      await storm(0.85, 21.5);
      for (let i = 0; i < 8; i++) await window_step(page, 0.1);
      await snap('rain-night');
      // the sea: rings on the water
      await storm(0.85, 12);
      const sea = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        for (let r = 6; r < 80; r++) for (let k = 0; k < 32; k++) {
          const a = k / 32 * Math.PI * 2, x = Math.floor(p.x + Math.cos(a) * r) + 0.5, y = Math.floor(p.y + Math.sin(a) * r) + 0.5;
          if (w.sd(x, y) > 0.5 && w.sd(x, y) < 1.5 && w.walkable(x, y) && !w.isBlocked(x, y)) {
            // on the shore, looking out to sea
            let bx = 0, by = 0;
            for (let t = 0; t < 16; t++) { const aa = t / 16 * Math.PI * 2; if (w.isLiquid(x + Math.cos(aa) * 6, y + Math.sin(aa) * 6)) { bx += Math.cos(aa); by += Math.sin(aa); } }
            if (!bx && !by) continue;
            window.OP.teleport(x, y);
            g.settings.view = 'first'; g.applySettings();
            g.view3d.rig.yaw = (Math.atan2(by, bx) + Math.PI * 2) % (Math.PI * 2); g.view3d.rig.pitch = -0.3;
            return true;
          }
        }
        return false;
      });
      console.log('shore', sea);
      for (let i = 0; i < 8; i++) await window_step(page, 0.1);
      await snap('rain-sea');
      // lightning
      await page.evaluate(() => { const g = window.OP.game; g.view3d.rig.pitch = 0.05; g.env.lightning = 1; });
      await window_step(page, 0.05);
      await snap('lightning');
      // snow on a cold island
      const cold = await page.evaluate(() => {
        const g = window.OP.game, w = g.world;
        const isl = w.islands.find((i) => w.climate(i.x, i.y) === 3 && w.walkable(i.x, i.y));
        if (!isl) return null;
        // an open spot near its town
        let spot = null;
        for (let r = 4; r < 60 && !spot; r++) for (let k = 0; k < 24 && !spot; k++) {
          const a = k / 24 * Math.PI * 2, x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
          let ok = true;
          for (let dx = -4; dx <= 4 && ok; dx++) for (let dy = -4; dy <= 4 && ok; dy++) if (!w.walkable(x + dx, y + dy) || w.isBlocked(x + dx, y + dy) || w.hitsProp(x + dx, y + dy, 0.6)) ok = false;
          if (ok) spot = [x, y];
        }
        window.OP.teleport(...(spot || [isl.x, isl.y]));
        g.settings.view = 'first'; g.applySettings();
        g.view3d.rig.pitch = 0.02;
        return isl.name || isl.id;
      });
      console.log('cold island', cold);
      await storm(0.5, 11);
      for (let i = 0; i < 14; i++) await window_step(page, 0.1);
      await snap('snow');
      const st = await page.evaluate(() => { const e = window.OP.game.env, pr = window.OP.game.view3d.precip; return { rain: +e.rain.toFixed(2), snow: +e.snow.toFixed(2), rainOn: pr.rain.visible, snowOn: pr.snow.visible, drops: pr.rain.geometry.instanceCount, flakes: pr.snow.geometry.instanceCount }; });
      console.log(JSON.stringify(st));
    },
  },
  raindbg: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      await page.evaluate(() => { const g = window.OP.game, w = g.world, isl = w.islands.find((i) => i.id === 'dawn_island'); window.OP.teleport(isl.x, isl.y); const e = g.env; e.stormTarget = 0.85; e.storm = 0.85; e.weatherTimer = 1e9; e.clock = 11; g.view3d.rig.pitch = 0; });
      for (let i = 0; i < 8; i++) await window_step(page, 0.1);
      await snap('normal');
      await page.evaluate(() => { const m = window.OP.game.view3d.precip.rain.material; window.__rainVS = m.vertexShader; window.__rainFS = m.fragmentShader; });
      const info = await page.evaluate(() => { const pr = window.OP.game.view3d.precip, u = pr.rain.material.uniforms; u.uAlpha.value = 1; return { vis: pr.rain.visible, n: pr.rain.geometry.instanceCount, so: [u.uShelterO.value.x, u.uShelterO.value.y], orig: [u.uOrig.value.x, u.uOrig.value.y], col: u.uColor.value.toArray(), cam: window.OP.game.view3d.rig.camera.position.toArray(), sh: pr.shelter.data.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4) }; });
      console.log(JSON.stringify(info));
      await page.evaluate(() => { const pr = window.OP.game.view3d.precip; pr._dbg = true; const u = pr.rain.material.uniforms; const orig = pr.update.bind(pr); pr.update = (e, c, d) => { orig(e, c, d); u.uAlpha.value = 1; u.uColor.value.setRGB(1, 0, 0); u.uWidth.value = 0.04; }; });
      for (let i = 0; i < 2; i++) await window_step(page, 0.1);
      await snap('red');
      await page.evaluate(() => { const pr = window.OP.game.view3d.precip; const u = pr.rain.material.uniforms; const orig = pr.update; pr.update = (e, c, d) => { orig(e, c, d); u.uShelterO.value.set(-1e5, -1e5); u.uWidth.value = 0.3; }; pr.rain.material.depthTest = false; pr.rain.material.transparent = false; });
      for (let i = 0; i < 2; i++) await window_step(page, 0.1);
      await snap('red-noshelter');
      const dbg = await page.evaluate(() => {
        const g = window.OP.game, v = g.view3d, pr = v.precip, r = v.renderer;
        let inScene = false; v.scene.traverse((o) => { if (o === pr.rain) inScene = true; });
        const prog = r.info.programs.map((p) => p.name).filter((n) => /Shader/i.test(n));
        return { inScene, parent: pr.rain.parent && pr.rain.parent.type, programs: r.info.programs.length, prog, calls: r.info.render.calls, geoIC: pr.rain.geometry.instanceCount, max: pr.rain.geometry._maxInstanceCount, attrs: Object.keys(pr.rain.geometry.attributes) };
      });
      console.log(JSON.stringify(dbg));
      const tri = await page.evaluate(async () => {
        const g = window.OP.game, v = g.view3d, pr = v.precip, r = v.renderer;
        const out = {};
        for (const on of [false, true]) {
          const orig = pr.update;
          pr.update = (e, c, d) => { orig(e, c, d); pr.rain.visible = on; };
          window.OP.step(0.05);
          await new Promise((res) => requestAnimationFrame(() => res()));
          out[on ? 'on' : 'off'] = { tri: r.info.render.triangles, calls: r.info.render.calls };
          pr.update = orig;
        }
        const gl = r.getContext();
        out.err = gl.getError();
        const prog = r.properties.get(pr.rain.material);
        out.hasProgram = !!(prog && prog.currentProgram);
        out.diag = prog && prog.currentProgram && prog.currentProgram.diagnostics ? JSON.stringify(prog.currentProgram.diagnostics).slice(0, 400) : null;
        return out;
      });
      console.log(JSON.stringify(tri));
      const cpu = await page.evaluate(() => {
        const g = window.OP.game, v = g.view3d, pr = v.precip, cam = v.rig.camera, T = v.ctx.THREE;
        const u = pr.rain.material.uniforms, seeds = pr.rain.geometry.attributes.aSeed.array;
        const mod = (a, b) => a - b * Math.floor(a / b);
        cam.updateMatrixWorld();
        const cp = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
        let onScreen = 0, behind = 0, off = 0;
        const samples = [];
        for (let i = 0; i < 400; i++) {
          const sx = seeds[i * 4], sy = seeds[i * 4 + 1], sz = seeds[i * 4 + 2], sw = seeds[i * 4 + 3];
          const k = 0.85 + 0.3 * sw, fall = u.uFall.value * k, B = u.uBox.value, t = u.uTime.value;
          const rx = mod(sx * B + u.uWind.value.x * t - u.uOrig.value.x - cp.x + B / 2, B) - B / 2;
          const rz = mod(sy * B + u.uWind.value.y * t - u.uOrig.value.y - cp.z + B / 2, B) - B / 2;
          const base = cp.y - u.uBelow.value;
          const y = base + mod(sz * u.uTall.value - fall * t - base, u.uTall.value);
          const p = new T.Vector3(cp.x + rx, y, cp.z + rz).project(cam);
          if (p.z > 1) behind++; else if (Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1) onScreen++; else off++;
          if (i < 3) samples.push([+(cp.x + rx).toFixed(2), +y.toFixed(2), +(cp.z + rz).toFixed(2), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(3)]);
        }
        return { onScreen, behind, off, samples, t: u.uTime.value, cp: cp.toArray(), near: cam.near, far: cam.far };
      });
      console.log(JSON.stringify(cpu));
      // a fixed quad in front of the camera, through the same material
      await page.evaluate(() => {
        const pr = window.OP.game.view3d.precip, m = pr.rain.material;
        m.vertexShader = m.vertexShader.replace('gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);', 'vA = 1.0; gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0); if (aSeed.x < 0.01) { vec3 f = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); gl_Position = projectionMatrix * viewMatrix * vec4(cameraPosition - f * 3.0 + vec3(position.x * 0.3, position.y * 0.6, 0.0), 1.0); }');
        m.needsUpdate = true;
      });
      for (let i = 0; i < 2; i++) await window_step(page, 0.1);
      await snap('fixed-quad');
      await page.evaluate(() => {
        const pr = window.OP.game.view3d.precip, m = pr.rain.material;
        m.vertexShader = 'attribute vec4 aSeed; void main() { gl_Position = vec4(position.x * 0.2, position.y * 0.2, 0.0, 1.0); }';
        m.fragmentShader = 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }';
        m.needsUpdate = true;
      });
      for (let i = 0; i < 2; i++) await window_step(page, 0.1);
      await snap('ndc-quad');
      // real vertex shader, solid fragment
      await page.evaluate(() => {
        const pr = window.OP.game.view3d.precip, m = pr.rain.material;
        m.vertexShader = window.__rainVS; m.fragmentShader = 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'; m.needsUpdate = true;
      });
      for (let i = 0; i < 2; i++) await window_step(page, 0.1);
      await snap('real-vs');
      // NDC vertex, real fragment
      await page.evaluate(() => {
        const pr = window.OP.game.view3d.precip, m = pr.rain.material;
        m.vertexShader = 'attribute vec4 aSeed; varying float vA; varying vec2 vC; void main() { vA = 1.0; vC = position.xy; gl_Position = vec4(position.x * 0.2, position.y * 0.2, 0.0, 1.0); }';
        m.fragmentShader = window.__rainFS; m.needsUpdate = true;
      });
      for (let i = 0; i < 2; i++) await window_step(page, 0.1);
      await snap('real-fs');
      const glu = await page.evaluate(async () => {
        const v = window.OP.game.view3d, pr = v.precip, r = v.renderer, gl = r.getContext();
        const m = pr.rain.material;
        m.vertexShader = window.__rainVS; m.fragmentShader = window.__rainFS; m.needsUpdate = true;
        window.OP.step(0.05);
        await new Promise((res) => requestAnimationFrame(() => res()));
        const prog = r.properties.get(m).currentProgram;
        const P = prog.program;
        const out = {};
        for (const n of ['uTime', 'uBox', 'uTall', 'uBelow', 'uFall', 'uWind', 'uOrig', 'uShelterO', 'uLen', 'uWidth', 'cameraPosition']) {
          const loc = gl.getUniformLocation(P, n);
          const val = loc ? gl.getUniform(P, loc) : null;
          out[n] = !loc ? 'no-loc' : typeof val === 'number' ? [+val.toFixed(3)] : Array.from(val).map((x) => +x.toFixed(3));
        }
        out.js = { uTime: m.uniforms.uTime.value, uOrig: m.uniforms.uOrig.value.toArray(), keys: Object.keys(m.uniforms) };
        out.list = (r.properties.get(m).uniformsList || []).map((u) => u.id);
        return out;
      });
      console.log(JSON.stringify(glu));
      const tests = {
        A: 'attribute vec4 aSeed; void main() { gl_Position = projectionMatrix * vec4(position.x * 0.3, position.y * 0.6, -3.0, 1.0); }',
        B: 'attribute vec4 aSeed; void main() { gl_Position = projectionMatrix * (viewMatrix * vec4(cameraPosition, 1.0) + vec4(position.x * 0.3, position.y * 0.6, -3.0, 0.0)); }',
        C: 'attribute vec4 aSeed; void main() { gl_Position = projectionMatrix * vec4(position.x * 0.3 + aSeed.x, position.y * 0.6 + aSeed.y, -3.0, 1.0); }',
        D: '__COMMON__ void main() { vec3 p = dropAt(uFall, vec2(0.0)); gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(position.x * 0.1, position.y * 0.3, 0.0), 1.0); }',
        E: '__COMMON__ void main() { vec3 p = dropAt(uFall, vec2(0.0)); if (sheltered(p)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; } gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(position.x * 0.1, position.y * 0.3, 0.0), 1.0); }',
        H: '__COMMON__ void main() { vec3 p = cameraPosition + vec3(aSeed.x * 10.0 - 5.0, aSeed.y * 4.0 - 2.0, 6.0); gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(position.x * 0.1, position.y * 0.3, 0.0), 1.0); }',
        I: '__COMMON__ void main() { vec2 rel = mod(aSeed.xy * uBox + uWind * uTime - uOrig - cameraPosition.xz + uBox * 0.5, uBox) - uBox * 0.5; vec3 p = vec3(cameraPosition.x + rel.x, cameraPosition.y + aSeed.z * 2.0 - 1.0, cameraPosition.z + rel.y); gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(position.x * 0.1, position.y * 0.3, 0.0), 1.0); }',
        J: '__COMMON__ void main() { float base = cameraPosition.y - uBelow; float y = base + mod(aSeed.z * uTall - uFall * uTime - base, uTall); vec3 p = cameraPosition + vec3(aSeed.x * 10.0 - 5.0, y - cameraPosition.y, 6.0); gl_Position = projectionMatrix * viewMatrix * vec4(p + vec3(position.x * 0.1, position.y * 0.3, 0.0), 1.0); }',
        G: '__COMMON__ void main() { float ok = (uBox > 30.0 && uBox < 40.0 ? 1.0 : 0.0) + (uTall > 15.0 && uTall < 25.0 ? 2.0 : 0.0) + (uFall > 5.0 && uFall < 15.0 ? 4.0 : 0.0) + (uTime > 0.5 ? 8.0 : 0.0) + (abs(uOrig.x) < 100.0 ? 16.0 : 0.0) + (cameraPosition.y > 0.1 ? 32.0 : 0.0); gl_Position = projectionMatrix * vec4(position.x * 0.02 + (ok / 64.0 - 0.5) * 2.0, position.y * 0.6, -3.0, 1.0); }',
        F: '__COMMON__ uniform float uLen, uWidth; void main() { vec3 p = dropAt(uFall, vec2(0.0)); vec3 v = normalize(vec3(uWind.x, -uFall, uWind.y)); vec3 toCam = cameraPosition - p; float dist = length(toCam); vec3 side = normalize(cross(v, toCam / dist)); vec3 q = p - v * (position.y * uLen) + side * (position.x * 0.05); gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0); }',
      };
      const common = await page.evaluate(() => { const vs = window.__rainVS; return vs.slice(0, vs.indexOf('uniform float uLen')); });
      for (const k of Object.keys(tests)) tests[k] = tests[k].replace('__COMMON__', common);
      for (const [k, vs] of Object.entries(tests)) {
        await page.evaluate((vs) => { const m = window.OP.game.view3d.precip.rain.material; m.vertexShader = vs; m.fragmentShader = 'void main() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }'; m.needsUpdate = true; }, vs);
        for (let i = 0; i < 2; i++) await window_step(page, 0.1);
        await snap('test-' + k);
      }
      const st = await page.evaluate(() => { const pr = window.OP.game.view3d.precip; return { vis: pr.rain.visible, ic: pr.rain.geometry.instanceCount, layers: pr.rain.layers.mask, camLayers: window.OP.game.view3d.rig.camera.layers.mask }; });
      console.log(JSON.stringify(st));
    },
  },
  // Town layouts: a tile diagram (streets, squares, buildings with their fronts marked), then aerial and street views.
  townview: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); g.env.clock = 11; g.env.stormTarget = 0; g.env.storm = 0; g.env.weatherTimer = 1e9; });
      const towns = String(args.towns || 'foosha,goa').split(',');
      for (const id of towns) {
        const info = await page.evaluate((id) => {
          const g = window.OP.game, w = g.world;
          let town = null;
          for (const i of w.islands) for (const t of i.towns || []) if (t.id === id || t.style === id) { town = town || t; }
          if (!town) return null;
          window.__town = town;
          // the diagram
          const M = 6, k = 7, W = (town.w + M * 2) * k, H = (town.h + M * 2) * k;
          const c = document.createElement('canvas'); c.width = W; c.height = H; c.id = 'townmap';
          c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#222;max-width:100vw;max-height:100vh';
          const cx = c.getContext('2d');
          const X0 = town.x0 - M, Y0 = town.y0 - M;
          const pal = { road: '#9e8f7a', grass: '#5f8f4e', water: '#3a6ea5', farm: '#8a6d3b', other: '#6f7f5f' };
          for (let y = Y0; y < Y0 + town.h + M * 2; y++) for (let x = X0; x < X0 + town.w + M * 2; x++) {
            const t = w.type(x, y);
            let col = pal.other;
            if (w.isLiquid(x, y)) col = pal.water;
            else if (t === town.roadTile) col = pal.road;
            else if (t === w.type(town.plaza.x, town.plaza.y) ) col = '#c9b89a';
            cx.fillStyle = col; cx.fillRect((x - X0) * k, (y - Y0) * k, k, k);
          }
          const D = window.OP.debug;
          for (const b of town.buildings) {
            const r = [D.bw(b, -b.fw / 2, -b.fd), D.bw(b, b.fw / 2, 0)];
            const bx0 = Math.min(r[0].x, r[1].x), bx1 = Math.max(r[0].x, r[1].x), by0 = Math.min(r[0].y, r[1].y), by1 = Math.max(r[0].y, r[1].y);
            cx.fillStyle = b.role === 'house' ? (b.hgt >= 3 ? '#d98c5f' : '#e8c9a0') : '#e05050';
            cx.fillRect((bx0 - X0) * k + 1, (by0 - Y0) * k + 1, (bx1 - bx0) * k - 2, (by1 - by0) * k - 2);
            // the front edge and the door
            const f0 = D.bw(b, -b.fw / 2, 0), f1 = D.bw(b, b.fw / 2, 0);
            cx.strokeStyle = '#222'; cx.lineWidth = 2; cx.beginPath(); cx.moveTo((f0.x - X0) * k, (f0.y - Y0) * k); cx.lineTo((f1.x - X0) * k, (f1.y - Y0) * k); cx.stroke();
            const d = D.bw(b, b.doorX || 0, 0);
            cx.fillStyle = '#1565c0'; cx.fillRect((d.x - X0) * k - 3, (d.y - Y0) * k - 3, 6, 6);
          }
          for (const o of w.objects.near(town.x, town.y, Math.max(town.w, town.h))) {
            if (o.kind === 'building') continue;
            cx.fillStyle = o.kind === 'lamp' || o.kind === 'lantern' ? '#ffd54f' : o.kind === 'tree' ? '#2e7d32' : '#fff';
            cx.beginPath(); cx.arc((o.x - X0) * k, (o.y - Y0) * k, 2.5, 0, Math.PI * 2); cx.fill();
          }
          document.body.appendChild(c);
          const rots = [0, 0, 0, 0]; for (const b of town.buildings) rots[b.rot || 0]++;
          return { name: town.name, style: town.style, w: town.w, h: town.h, buildings: town.buildings.length, rots, attached: town.buildings.filter((b) => b.attach && (b.attach.left || b.attach.right)).length, streets: (town.streets || []).length, storeys: town.buildings.map((b) => b.hgt).join('') };
        }, id);
        console.log('town', JSON.stringify(info));
        if (!info) continue;
        await snap(id + '-map');
        await page.evaluate(() => document.getElementById('townmap')?.remove());
        // aerial
        await page.evaluate(() => {
          const g = window.OP.game, t = window.__town;
          window.OP.teleport(t.plaza.x + 0.5, t.plaza.y + 3.5);
          const r = g.view3d.rig; r.tp.dist = 26; r.tp.height = 22; r.yaw = Math.PI * 0.5 - 0.5; r.pitch = -0.2;
        });
        for (let i = 0; i < 16; i++) await window_step(page, 0.1);
        await snap(id + '-aerial');
        // street level
        for (const [k, yaw] of [['east', 0.15], ['north', -Math.PI / 2 + 0.2]]) {
          await page.evaluate((yaw) => { const g = window.OP.game, r = g.view3d.rig; g.settings.view = 'first'; g.applySettings(); r.yaw = (yaw + Math.PI * 2) % (Math.PI * 2); r.pitch = 0.02; }, yaw);
          for (let i = 0; i < 6; i++) await window_step(page, 0.1);
          await snap(id + '-street-' + k);
        }
        await page.evaluate(() => { const g = window.OP.game, r = g.view3d.rig; g.settings.view = 'third'; g.applySettings(); r.tp.dist = 4.2; r.tp.height = 1.4; });
      }
    },
  },
  // Quality check of terraces: close-ups of the seams between attached houses (front and roofline).
  seams: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); g.env.clock = 11; g.env.stormTarget = 0; g.env.storm = 0; g.env.weatherTimer = 1e9; });
      const styles = String(args.styles || 'noble,town,city,port').split(',');
      for (const st of styles) {
        const pairs = await page.evaluate((st) => {
          const g = window.OP.game, w = g.world, D = window.OP.debug;
          let town = null;
          for (const i of w.islands) for (const t of i.towns || []) if (!town && t.style === st && t.buildings.length > 12) town = t;
          if (!town) return [];
          window.__seamTown = town;
          // attached pairs: a building with a right-hand neighbour
          const out = [];
          for (const b of town.buildings) {
            if (!b.attach?.right) continue;
            const p = D.bw(b, b.fw / 2, 0);
            out.push({ x: p.x, y: p.y, rot: b.rot || 0, hgt: b.hgt, name: town.name });
            if (out.length >= 3) break;
          }
          return out;
        }, st);
        console.log(st, JSON.stringify(pairs));
        let i = 0;
        for (const q of pairs) {
          i++;
          await page.evaluate((q) => {
            const g = window.OP.game, f = [[0, 1], [1, 0], [0, -1], [-1, 0]][q.rot];
            // (the building's local +x in the world: along the facade)
            const a = [[1, 0], [0, -1], [-1, 0], [0, 1]][q.rot];
            // stand in the street a little out from the fronts and along one of them, looking back at the seam
            const px = q.x + f[0] * 1.6 - a[0] * 3.2, py = q.y + f[1] * 1.6 - a[1] * 3.2;
            window.OP.teleport(px, py);
            g.settings.view = 'first'; g.applySettings();
            const r = g.view3d.rig; r.yaw = (Math.atan2(q.y - py, q.x - px) + Math.PI * 2) % (Math.PI * 2); r.pitch = 0.3;
          }, q);
          for (let k = 0; k < 6; k++) await window_step(page, 0.1);
          await snap(`${st}-${i}-front`);
          await page.evaluate(() => { const r = window.OP.game.view3d.rig; r.pitch = 0.75; });
          for (let k = 0; k < 2; k++) await window_step(page, 0.1);
          await snap(`${st}-${i}-roof`);
        }
      }
    },
  },
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
        const d = g.buildings.doorPts(shop), D = window.OP.debug;
        const o = D.bw(shop, d.lx, 2.35), f = D.bfront(shop);
        window.OP.teleport(o.x, o.y);
        const v = g.view3d; v.rig.yaw = (Math.atan2(-f.y, -f.x) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = -0.02;
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
        if (await page.evaluate(() => { const b = window.__shop, p = window.OP.game.player; return window.OP.debug.bl(b, p.x, p.y).lz < -0.9; })) break;
      }
      await page.evaluate(() => window.OP.key('W', false));
      await step(page, 0.3); await frames(page, 3);
      const inside = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, b = window.__shop, D = window.OP.debug;
        const d = g.buildings.doorPts(b);
        const at = (lx, lz) => D.bw(b, lx, lz);
        const q = D.bl(b, p.x, p.y), out = at(d.lx, 1.75);
        const occ = (pt) => p.canOccupy(w, pt.x, pt.y);
        return {
          inside: w.interiorAt(p.x, p.y) === b, pos: [+q.lx.toFixed(2), +q.lz.toFixed(2)], doorOpen: b.doorOpen, rot: b.rot || 0,
          people: g.actors.filter((a) => a.homeB === b).map((a) => a.name),
          floor: +(g.view3d.ground(p.x, p.y) - g.view3d.ground(out.x, out.y)).toFixed(2),
          walls: {
            back: occ(at(0, -b.fd + 0.12)), left: occ(at(-b.fw / 2 + 0.12, -b.fd / 2)),
            frontBesideDoor: occ(at(d.lx - d.dw / 2 - 0.3, -0.1)), doorway: occ(d.mid),
          },
        };
      });
      console.log('inside', JSON.stringify(inside));
      await snap('inside');
      await page.evaluate(() => { const v = window.OP.game.view3d, f = window.OP.debug.bfront(window.__shop); v.rig.yaw = (Math.atan2(-f.y, -f.x) + 1.0 + Math.PI * 2) % (Math.PI * 2); });
      await step(page, 0.1); await frames(page, 2); await snap('inside-left');
      await page.evaluate(() => { const v = window.OP.game.view3d, f = window.OP.debug.bfront(window.__shop); v.rig.yaw = (Math.atan2(f.y, f.x) + Math.PI * 2) % (Math.PI * 2); });
      await step(page, 0.1); await frames(page, 2); await snap('inside-door');
      // a house: locked, then kicked in
      const kick = await page.evaluate(() => {
        const g = window.OP.game, B = g.buildings, w = g.world, p = g.player;
        const isl = w.islandAt(p.x, p.y) || w.nearestIsland(p.x, p.y, 60);
        const house = isl.towns.flatMap((t) => t.buildings).find((b) => b.enterable && (b.role || 'house') === 'house' && !b.npc && !b.pirate);
        if (!house) return null;
        window.__house = house;
        const d = B.doorPts(house), D = window.OP.debug, f = D.bfront(house);
        const st = D.bw(house, d.lx, 1.15);
        window.OP.teleport(st.x, st.y);
        B.t = 0; B.update(0.016);
        const before = { locked: house.doorLocked, open: !!house.doorOpen, blocked: !p.canOccupy(w, d.mid.x, d.mid.y), bounty: g.state.char.bounty };
        B.breakDoor(house);
        B.update(0.016);
        const after = { open: house.doorOpen, broken: house.doorBroken, walkIn: p.canOccupy(w, d.mid.x, d.mid.y), bounty: g.state.char.bounty };
        const v = g.view3d; v.rig.yaw = (Math.atan2(-f.y, -f.x) + Math.PI * 2) % (Math.PI * 2); v.rig.pitch = -0.1;
        const back = D.bw(house, d.lx + 0.3, 2.55);
        window.OP.teleport(back.x, back.y);
        return { before, after };
      });
      console.log('kick', JSON.stringify(kick));
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('kicked');
      // a bandit follows you in through the doorway (and doesn't walk into the wall)
      await page.evaluate(() => {
        const g = window.OP.game, p = g.player, house = window.__house;
        if (!house) return;
        const d = g.buildings.doorPts(house), D = window.OP.debug;
        p.invulnerable = true;
        const inn = D.bw(house, d.lx + 0.5, -house.fd + 0.9), from = D.bw(house, d.lx + 3.5, 3.25);
        window.OP.teleport(inn.x, inn.y);
        const e = window.OP.debug.makeNPC({ id: 'test_bandit', name: 'Test Bandit', level: 3, hostile: true, faction: 'bandit' }, from.x, from.y);
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
          const own = w.objects.near(x + 0.5, y + 0.5, 14).some((o) => {
            if (!o.block || o.soft) return false;
            const w0 = o.fw || 1, d0 = o.fd || 1;
            // (buildings turn to face their street: their footprint turns with them)
            const a = window.OP.debug.bw(o, -w0 / 2, -d0), b = window.OP.debug.bw(o, w0 / 2, 0);
            const x0 = Math.floor(Math.min(a.x, b.x) + 0.001), x1 = Math.ceil(Math.max(a.x, b.x) - 0.001), y0 = Math.floor(Math.min(a.y, b.y) + 0.001), y1 = Math.ceil(Math.max(a.y, b.y) - 0.001);
            return x >= x0 && x < x1 && y >= y0 && y < y1;
          });
          if (!own) { stray++; if (where.length < 6) where.push([x, y]); }
        }
        for (const k of Object.values(kinds)) { k.min = +k.min.toFixed(2); k.max = +k.max.toFixed(2); }
        return { town: t.name, kinds, stray, where, colliderCells: w.colliders.size };
      }, args.island || 'dawn_island');
      console.log('barriers', JSON.stringify(rep));
    },
  },

  // wanted: Marines recognise a wanted face (not a petty thief's), unless it's under a hood
  wanted: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 10; i++) await step(page, 0.1);
      const trial = async (label, bounty, hood, dist) => {
        const r = await page.evaluate(([bounty, hood, dist]) => {
          const g = window.OP.game, p = g.player, c = g.state.char;
          c.bounty = bounty;
          for (const a of g.actors) if (a.testMarine) a.alive = false;
          if (hood) { window.OP.debug.addItem(g, 'traveller_hood', 1); c.equipped.hat = 'traveller_hood'; } else c.equipped.hat = null;
          p.hoodBlownT = 0;
          // a Marine on patrol, a few steps away
          let x = p.x + dist, y = p.y;
          const m = window.OP.debug.makeNPC({ name: 'Marine', faction: 'marine', style: 'ittoryu', weapon: 'sword', look: { top: '#ffffff', bottom: '#1b4f72', hat: 'marine' }, level: 8, ai: 'wander' }, x, y);
          m.testMarine = true;
          g.addActor(m);
          return { tier: g.wanted.tier(), hooded: g.wanted.hooded() };
        }, [bounty, hood, dist]);
        for (let i = 0; i < 40; i++) await step(page, 0.1);
        const out = await page.evaluate(() => { const g = window.OP.game, m = g.actors.find((a) => a.testMarine); return { suspect: +(m.suspect || 0).toFixed(2), provoked: !!m.provoked }; });
        console.log(label, JSON.stringify({ ...r, ...out }));
        return out;
      };
      await trial('small fry (500k), 3m', 500000, false, 3);
      await trial('wanted (12M), 6m', 12000000, false, 6);
      await trial('wanted (12M), hooded, 6m', 12000000, true, 6);
      await trial('wanted (12M), hooded, 1.5m', 12000000, true, 1.5);
      await page.evaluate(() => { const g = window.OP.game; g.view3d.rig.pitch = -0.1; });
      await trial('notorious (60M), 13m', 60000000, false, 13);
      await frames(page, 3);
      await snap('recognised');
      // the hood on the model
      await page.evaluate(() => { const g = window.OP.game, c = g.state.char; for (const a of g.actors) if (a.testMarine) a.alive = false; c.equipped.hat = 'traveller_hood'; window.OP.debug.refresh?.(); g.player.look = { ...g.player.look, hat: 'hood', hatColor: '#6a5643' }; g.view3d.rig.yaw = g.player.facing + Math.PI; g.view3d.rig.pitch = 0.05; g.view3d.rig.tp.dist = 2.6; });
      for (let i = 0; i < 5; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('hood');
      await page.evaluate(() => { const g = window.OP.game; g.view3d.rig.yaw = g.player.facing + Math.PI * 0.6; });
      await step(page, 0.1); await frames(page, 2);
      await snap('hood-side');
    },
  },

  // NPCs go round houses instead of into them, and don't heal up when you run off
  npcpath: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 10; i++) await step(page, 0.1);
      const setup = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        // a big house with open ground in front of it and behind it
        const bs = w.objects.near(p.x, p.y, 90).filter((o) => o.kind === 'building' && (o.fw || 3) >= 4);
        for (const b of bs) {
          const fd = b.fd || 3;
          const back = { x: b.x + 0.3, y: b.y - fd - 1.6 }, front = { x: b.x - 0.2, y: b.y + 2.4 };
          const ok = (q) => w.walkable(q.x, q.y) && !w.isBlocked(q.x, q.y) && !w.hitsProp(q.x, q.y, 0.4);
          if (!ok(back) || !ok(front)) continue;
          p.x = back.x; p.y = back.y; p.hp = 1e6; p.d.maxHp = 1e6;
          const m = window.OP.debug.makeNPC({ name: 'Bandit', faction: 'bandit', style: 'brawler', level: 6, hostile: true, aggroRange: 14 }, front.x, front.y);
          m.testB = true;
          g.addActor(m);
          m.controller.target = p; m.controller.state = 'chase';
          return { b: b.name || b.role, fw: b.fw, fd, back, front };
        }
        return null;
      });
      console.log('setup', JSON.stringify(setup));
      const trail = [];
      let stuck = 0;
      let last = null;
      for (let i = 0; i < 40; i++) {
        await step(page, 0.25);
        const st = await page.evaluate(() => { const g = window.OP.game, m = g.actors.find((a) => a.testB), p = g.player, c = m.controller; return { d: +g.world.distance(m.x, m.y, p.x, p.y).toFixed(2), x: m.x, y: m.y, st: c.state, tgt: !!c.target, path: c.path ? c.path.pts.map((q) => [+(q.x - m.x).toFixed(1), +(q.y - m.y).toFixed(1)]).slice(0, 4) : null, i: c.path?.i, lineOk: c.lineOk, act: !!m.action, block: c.blockT > 0 }; });
        if (i < 8 || i % 5 === 0) console.log(i, JSON.stringify(st));
        trail.push(st.d);
        if (last && Math.hypot(st.x - last.x, st.y - last.y) < 0.03 && st.d > 2) stuck++;
        last = st;
        if (st.d < 1.8) break;
      }
      console.log('bandit distance', JSON.stringify(trail), 'stuck ticks', stuck);
      await frames(page, 2);
      await snap('reached');
      // hurt it, run far away, and see what it's like when it gets home
      const hurt = await page.evaluate(() => { const g = window.OP.game, m = g.actors.find((a) => a.testB); m.hp = Math.round(m.d.maxHp * 0.4); m.lastHitT = g.time; const home = m.controller.home; window.OP.teleport(g.player.x + 60, g.player.y); return { hp: m.hp, max: m.d.maxHp, home: !!home }; });
      for (let i = 0; i < 40; i++) await step(page, 0.5);
      const after = await page.evaluate(() => { const g = window.OP.game, m = g.actors.find((a) => a.testB); return { hp: Math.round(m.hp), state: m.controller.state }; });
      console.log('hurt', JSON.stringify(hurt), 'after running off 20s', JSON.stringify(after));
    },
  },

  // search a knocked-out foe (E), take their things, and the body is cleared away later
  loot: {
    async run(page, snap) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 10; i++) await step(page, 0.1);
      const made = await page.evaluate(() => {
        const g = window.OP.game, p = g.player;
        const mk = (name, faction, weapon, dx) => {
          const a = window.OP.debug.makeNPC({ name, faction, style: weapon === 'sword' ? 'ittoryu' : 'brawler', weapon, level: 12, hostile: faction !== 'civilian' }, p.x + dx, p.y + 1.2);
          a.test = true; g.addActor(a);
          a.hp = 0; a.knockOut(g, p);
          return a;
        };
        const a = mk('Pirate Grunt', 'pirate', 'sword', 1.0);
        const b = mk('Wild Boar', 'beast', null, -2.5);
        g.view3d.rig.yaw = Math.PI / 2; g.view3d.rig.pitch = -0.35;
        return { pocketA: a.pocket, pocketB: b.pocket };
      });
      console.log('pockets', JSON.stringify(made));
      for (let i = 0; i < 4; i++) await step(page, 0.1);
      const label = await page.evaluate(() => window.OP.game.player.controller.interaction?.label || null);
      console.log('prompt:', label);
      await frames(page, 2);
      await snap('bodies');
      await page.evaluate(() => { window.OP.key('E', true); }); await step(page, 0.05); await page.evaluate(() => { window.OP.key('E', false); }); await step(page, 0.1);
      await frames(page, 2);
      await snap('search-panel');
      const before = await page.evaluate(() => ({ berries: window.OP.game.state.char.berries, inv: window.OP.game.state.char.inventory.map((i) => i.id + 'x' + i.qty).join(',') }));
      await page.evaluate(() => { const b = [...document.querySelectorAll('.loot button.btn.gold')].find((x) => /Take all/.test(x.textContent)); b?.click(); });
      await step(page, 0.1);
      const after = await page.evaluate(() => ({ berries: window.OP.game.state.char.berries, inv: window.OP.game.state.char.inventory.map((i) => i.id + 'x' + i.qty).join(','), panel: !!document.querySelector('.loot') }));
      console.log('before', JSON.stringify(before), 'after', JSON.stringify(after));
      // the emptied body goes after ~25 s; the other after ~2 minutes
      await page.evaluate(() => { const g = window.OP.game; g.ui.closeAll?.(); g.paused = false; });
      for (let i = 0; i < 30; i++) await step(page, 1);
      const mid = await page.evaluate(() => window.OP.game.actors.filter((a) => a.test).map((a) => a.name + ':' + (a.fadeAlpha ?? 1).toFixed(2)));
      console.log('after 30s', JSON.stringify(mid));
      for (let i = 0; i < 100; i++) await step(page, 1);
      const late = await page.evaluate(() => window.OP.game.actors.filter((a) => a.test).map((a) => a.name));
      console.log('after 130s', JSON.stringify(late));
    },
  },

  // one of each kind of home, from the inside
  homes: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate((isl) => { window.OP.quickStart(isl || 'human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'first'; g.applySettings(); document.querySelector('.look-hint')?.remove(); }, args.race);
      for (let i = 0; i < 10; i++) await step(page, 0.1);
      const found = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        const out = {};
        for (const b of w.objects.near(p.x, p.y, 220, (o) => o.enterable && (o.role || 'house') === 'house' && !o.pirate)) {
          const L = window.OP.debug.layoutOf(b);
          const k = L.kind || 'family';
          if (!out[k]) out[k] = { x: b.x, y: b.y, fw: b.fw, fd: b.fd, items: L.items.map((i) => i.k).join(','), use: L.use.map((u) => u.label) };
        }
        return out;
      });
      console.log('kinds', Object.keys(found).join(', '));
      for (const [k, b] of Object.entries(found)) {
        console.log(k, JSON.stringify({ size: `${b.fw}x${b.fd}`, items: b.items, search: b.use }));
        await page.evaluate((b) => {
          const g = window.OP.game, c = g.state.char, w = g.world;
          const bb = w.objects.near(b.x, b.y, 1, (o) => o.enterable)[0];
          c.flags['invited_' + g.buildings.key(bb)] = g.env.day;
          window.OP.teleport(b.x, b.y - 0.55);
          const v = g.view3d; v.rig.yaw = -Math.PI / 2; v.rig.pitch = -0.28;
        }, b);
        for (let i = 0; i < 12; i++) { await step(page, 0.1); await frames(page, 1); }
        await snap('home-' + k);
      }
    },
  },

  // the stride from the side: a jog and a sprint through one cycle, and a slow walk
  gait: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.settings.shiftLock = false; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      // an open stretch of ground
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        for (let r = 4; r < 120; r += 2) for (let a = 0; a < 6.28; a += 0.3) {
          const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
          let ok = true;
          for (let d = -14; d <= 14 && ok; d += 1) if (!w.walkable(x + d, y) || w.isBlocked(x + d, y) || w.hitsProp(x + d, y, 0.8)) ok = false;
          if (ok) { window.OP.teleport(x - 12, y); return; }
        }
      });
      for (let i = 0; i < 6; i++) await step(page, 0.1);
      const cyc = async (label, keys, n = 6) => {
        await page.evaluate((keys) => { const g = window.OP.game; g.view3d.rig.yaw = -Math.PI / 2; g.view3d.rig.pitch = -0.05; g.view3d.rig.tp.dist = 3.4; for (const k of keys) window.OP.key(k, true); }, keys);
        for (let i = 0; i < 12; i++) await step(page, 0.1);
        const info = await page.evaluate(() => { const p = window.OP.game.player; return { speed: +(p.speed || 0).toFixed(2), walk: +p.walk.toFixed(2) }; });
        const per = await page.evaluate(() => { const p = window.OP.game.player; return 1; });
        void per;
        console.log(label, JSON.stringify(info));
        for (let i = 0; i < n; i++) {
          await step(page, 0.06); await frames(page, 1);
          await snap(`${label}-${i}`);
        }
        await page.evaluate((keys) => { for (const k of keys) window.OP.key(k, false); }, keys);
        for (let i = 0; i < 8; i++) await step(page, 0.1);
        await page.evaluate(() => { const g = window.OP.game; window.OP.teleport(g.player.x - 6, g.player.y); });
      };
      await cyc('jog', ['D']);
      await cyc('sprint', ['D', 'Shift']);
    },
  },

  // a town at night: lamps pooling light on the street, lit windows, a room lit by its lamp
  night: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate((race) => { window.OP.quickStart(race || 'human'); const g = window.OP.game; g.env.clock = Number(22); g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); }, args.race);
      for (let i = 0; i < 10; i++) await step(page, 0.1);
      // stand near a street lamp
      const lamp = await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player;
        const L = w.objects.near(p.x, p.y, 150, (o) => o.kind === 'lamp' || o.kind === 'lantern').sort((a, b) => w.distance(a.x, a.y, p.x, p.y) - w.distance(b.x, b.y, p.x, p.y))[0];
        if (!L) return null;
        for (let r = 2; r < 6; r += 0.5) for (let a = 0; a < 6.28; a += 0.4) {
          const x = L.x + Math.cos(a) * r, y = L.y + Math.sin(a) * r;
          if (w.walkable(x, y) && !w.isBlocked(x, y) && !w.hitsProp(x, y, 0.4)) { window.OP.teleport(x, y); g.view3d.rig.yaw = Math.atan2(L.y - y, g.world.dx(x, L.x)) + 0.3; g.view3d.rig.pitch = -0.12; return { kind: L.kind, x: L.x, y: L.y }; }
        }
        return null;
      });
      console.log('lamp', JSON.stringify(lamp));
      for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('street');
      await page.evaluate(() => { const g = window.OP.game; g.settings.view = 'first'; g.applySettings(); g.view3d.rig.pitch = -0.2; });
      await step(page, 0.1); await frames(page, 3);
      await snap('street-first');
      await page.evaluate(() => { const g = window.OP.game; g.env.clock = 19.2; });
      for (let i = 0; i < 4; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('dusk');
      // inside a home at night
      await page.evaluate(() => {
        const g = window.OP.game, w = g.world, p = g.player, c = g.state.char;
        g.env.clock = 22.5;
        const b = w.objects.near(p.x, p.y, 120, (o) => o.enterable && (o.role || 'house') === 'house' && !o.pirate)[0];
        c.flags['invited_' + g.buildings.key(b)] = g.env.day;
        window.OP.teleport(b.x, b.y - 0.55);
        g.view3d.rig.yaw = -Math.PI / 2; g.view3d.rig.pitch = -0.25;
      });
      for (let i = 0; i < 10; i++) { await step(page, 0.1); await frames(page, 1); }
      await snap('room');
      const perf = await page.evaluate(() => { const v = window.OP.game.view3d, i = v.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, pools: v.lampLight?.pools.count }; });
      console.log('perf', JSON.stringify(perf));
    },
  },

  // where a dock meets the shore
  dock: {
    async run(page, snap, args) {
      await page.evaluate(() => localStorage.clear());
      await page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout: 240000, polling: 250 });
      await page.evaluate(() => { window.OP.quickStart('human'); const g = window.OP.game; g.env.clock = 11; g.settings.view = 'third'; g.applySettings(); document.querySelector('.look-hint')?.remove(); });
      for (let i = 0; i < 6; i++) await step(page, 0.1);
      const islId = args.island || null;
      const dk = await page.evaluate((islId) => {
        const g = window.OP.game, w = g.world, p = g.player;
        const isl = islId ? w.islands.find((i) => i.id === islId) : w.islands.filter((i) => i.docks?.length).sort((a, b) => w.distance(a.x, a.y, p.x, p.y) - w.distance(b.x, b.y, p.x, p.y))[0];
        const d = isl.docks[0];
        return { isl: isl.name, ...d };
      }, islId);
      console.log('dock', JSON.stringify(dk));
      const view = async (name, at, yaw, pitch, dist = 5) => {
        await page.evaluate(([at, yaw, pitch, dist]) => { const g = window.OP.game; window.OP.teleport(at.x, at.y); g.view3d.rig.yaw = yaw; g.view3d.rig.pitch = pitch; g.view3d.rig.tp.dist = dist; }, [at, yaw, pitch, dist]);
        for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 1); }
        await snap(name);
      };
      const out = Math.atan2(dk.dirY, dk.dirX);
      // standing on the shore at the foot of the pier, looking out along it
      await view('shore-end', { x: dk.land.x + dk.dirX * 1.5, y: dk.land.y + dk.dirY * 1.5 }, out, -0.25, 5);
      // from the side, where the planks meet the land
      const side = { x: dk.land.x + dk.dirX * 3 + -dk.dirY * 0.2, y: dk.land.y + dk.dirY * 3 + dk.dirX * 0.2 };
      await view('side', side, out + Math.PI / 2, -0.15, 7);
      await view('side-2', side, out - Math.PI / 2, -0.15, 7);
      // looking back at the land from the end of the pier
      await view('from-end', { x: dk.end.x, y: dk.end.y }, out + Math.PI, -0.2, 6);
    },
  },
};
