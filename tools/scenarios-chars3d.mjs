// 3D characters: race / hair / hat line-ups, third-person close-ups, mid-attack
// frames for several styles, the first-person viewmodel (idle, punches,
// swords, block, guns, Devil Fruit techniques) and a Sea King.
//   node tools/shot.mjs chars3d        (everything)
//   node tools/shot.mjs c3q            (quick: races + a punch)
//   node tools/shot.mjs c3vm           (viewmodel only)
const waitReady = (page, timeout = 180000) => page.waitForFunction(() => window.OP && window.OP.ready, null, { timeout, polling: 250 });
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const step = (page, s) => page.evaluate((s) => window.OP.step(s), s);

/** Helpers injected into the page. */
function helpers() {
  const OP = window.OP;
  const TAU = Math.PI * 2;
  window.__C3 = {
    npcs: [],
    clear() {
      const g = OP.game;
      g.actors = g.actors.filter((a) => a === g.player);
      this.npcs = [];
      g.bossTarget = null;
    },
    /** A still NPC at (dx, dy) from the player, facing `face` (default: toward the player). */
    spawn(def, dx, dy, face) {
      const g = OP.game, p = g.player;
      const a = OP.debug.makeNPC({ level: 12, faction: 'civilian', ...def }, p.x + dx, p.y + dy);
      a.controller = null;
      a.facing = face ?? Math.atan2(-dy, -dx);
      a.showName = def.showName ?? true;
      if (def.weapon) a.weapon = { kind: def.weapon, power: 1.2, count: def.count || 1, ids: def.ids || [] };
      g.addActor(a);
      this.npcs.push(a);
      return a;
    },
    view(yaw, pitch, mode = 'first', dist) {
      const g = OP.game, v = g.view3d;
      g.settings.view = mode; g.applySettings();
      v.rig.yaw = ((yaw % TAU) + TAU) % TAU; v.rig.pitch = pitch;
      if (dist) v.rig.tp.dist = dist;
    },
    /** A clear sunny spot: Conomi's town plaza at noon. */
    goSunny() {
      const g = OP.game;
      const def = OP.debug.npcDef('arlong');
      const isl = g.surface.islands.find((i) => i.id === def.island);
      const t = isl.towns[0];
      OP.teleport(t.plaza.x, t.plaza.y + 1);
      g.env.clock = 11.5;
      g.env.rain = 0; g.env.storm = 0; g.env.fog = 0; g.env.snow = 0;
      const p = g.player; p.facing = 0;
    },
    perf() {
      const v = OP.game.view3d, i = v.renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, actors: OP.game.actors.length, views: v.actorViews.size };
    },
    player() { return OP.game.player; },
  };
}

async function boot(page, race = 'human') {
  await page.evaluate(() => localStorage.clear());
  await waitReady(page);
  await page.evaluate((r) => window.OP.quickStart(r), race);
  await page.evaluate(helpers);
  await step(page, 0.3);
  await page.evaluate(() => { window.__C3.goSunny(); window.__C3.clear(); window.__C3.view(0, -0.12); });
  for (let i = 0; i < 8; i++) { await step(page, 0.1); await frames(page, 2); }
}
const settle = async (page, n = 4) => { for (let i = 0; i < n; i++) { await step(page, 0.05); await frames(page, 2); } };

// ------------------------------------------------------------------ line-ups
const RACES = ['human', 'fishman', 'mink', 'skypiean', 'longarm', 'longleg', 'buccaneer', 'three_eye', 'lunarian'];
async function raceLineup(page, snap) {
  await page.evaluate((races) => {
    const C = window.__C3; C.clear();
    races.forEach((r, i) => C.spawn({ name: r, race: r, id: 'lineup_' + r + i }, 5.2, (i - (races.length - 1) / 2) * 1.15));
    C.spawn({ name: 'Mink Rabbit', race: 'mink', id: 'mink_b7', look: { ears: 'long', fur: '#f5f6fa', kind: 'Rabbit', tail: 'fluffy', skin: '#f5f6fa', hairColor: '#f5f6fa', hand: '#f5f6fa' } }, 7.2, -1.8);
    C.spawn({ name: 'Mink Bear', race: 'mink', id: 'mink_c2', look: { ears: 'round', fur: '#6d4c41', kind: 'Bear', muzzle: true, skin: '#6d4c41', hairColor: '#6d4c41', hand: '#6d4c41', furFace: true } }, 7.2, 1.8);
    C.view(0, -0.1);
  }, RACES);
  await settle(page, 6);
  await snap('races');
  await page.evaluate(() => window.__C3.view(0.2, -0.18, 'first'));
  await settle(page, 2);
  await snap('races-right');
}

const HAIRS = ['short', 'spiky', 'long', 'ponytail', 'buzz', 'curly', 'afro', 'topknot', 'mohawk', 'bald', 'bun', 'pompadour'];
const COLS = ['#1e1e1e', '#6b4423', '#f2d16b', '#c0392b', '#2980b9', '#e67e22', '#2d2d2d', '#dfe6e9', '#2ecc71', '#000', '#e84393', '#3b2a1a'];
async function hairLineup(page, snap) {
  await page.evaluate(([hairs, cols]) => {
    const C = window.__C3; C.clear();
    hairs.forEach((h, i) => C.spawn({ name: h, id: 'hair' + i, look: { hair: h, hairColor: cols[i], hat: null, skin: '#f1c9a0', top: ['#d63031', '#0984e3', '#00b894', '#fdcb6e'][i % 4] } }, 4.4 + (i % 2) * 1.6, (Math.floor(i / 2) - 2.5) * 1.05));
    C.view(0, -0.1);
  }, [HAIRS, COLS]);
  await settle(page, 6);
  await snap('hair');
  // from behind: the back of every style
  await page.evaluate(() => { const C = window.__C3; for (const a of C.npcs) a.facing = 0; });
  await settle(page, 3);
  await snap('hair-back');
}

const HATS = [['straw'], ['captain', '#2c2831'], ['tricorne'], ['cowboy'], ['marine'], ['pinkhat'], ['beanie', '#e74c3c'], ['bandana'], ['headband', '#212121'], ['goggles'], ['horns'], ['crown'], ['halo'], ['antlers'], ['tophat']];
async function hatLineup(page, snap) {
  await page.evaluate((hats) => {
    const C = window.__C3; C.clear();
    hats.forEach(([h, c], i) => C.spawn({ name: h, id: 'hat' + i, look: { hat: h, hatColor: c, hair: ['short', 'spiky', 'long', 'curly', 'ponytail'][i % 5], coat: h === 'marine' ? '#fafafa' : h === 'captain' ? '#1a237e' : null, coatText: h === 'marine' ? 'JUSTICE' : null } }, 4.2 + (i % 3) * 1.4, (Math.floor(i / 3) - 2) * 1.1));
    C.view(0, -0.1);
  }, HATS);
  await settle(page, 6);
  await snap('hats');
  await page.evaluate(() => { const C = window.__C3; for (const a of C.npcs) a.facing = 0; });
  await settle(page, 3);
  await snap('hats-back');
}

// ------------------------------------------------------------------ close-ups
async function closeups(page, snap) {
  await page.evaluate(() => {
    const C = window.__C3; C.clear();
    const g = window.OP.game, p = g.player;
    p.look = { ...p.look, hat: 'straw', hair: 'short', hairColor: '#1e1e1e', top: '#d63031', openShirt: true, bottom: '#1e3799', coat: null };
    p.facing = Math.PI;
    C.view(0, 0.05, 'third', 2.4);
  });
  await settle(page, 4);
  await snap('tp-face');
  await page.evaluate(() => { const p = window.OP.game.player; p.facing = Math.PI * 0.75; });
  await settle(page, 2);
  await snap('tp-three-quarter');
  await page.evaluate(() => { const g = window.OP.game, p = g.player; p.facing = 0; window.__C3.view(0, 0.1, 'third', 3.2); });
  await settle(page, 2);
  await snap('tp-back');
  // walking and running
  await page.evaluate(() => { window.OP.key('W', true); });
  await step(page, 0.6); await frames(page, 2);
  await snap('tp-walk');
  await page.evaluate(() => { window.OP.key('Shift', true); });
  await step(page, 0.5); await frames(page, 2);
  await snap('tp-run');
  await page.evaluate(() => { window.OP.key('W', false); window.OP.key('Shift', false); });
  await step(page, 0.3);
}

/** Several fighters attacking at once, snapped mid-swing. */
async function attacks(page, snap) {
  await page.evaluate(() => {
    const C = window.__C3; C.clear();
    const g = window.OP.game, p = g.player;
    const defs = [
      { name: 'Brawler', style: 'brawler', look: { hair: 'spiky', hairColor: '#3b2a1a', top: '#d63031' } },
      { name: 'Black Leg', style: 'black_leg', look: { hair: 'short', hairColor: '#f2d16b', top: '#212121', bottom: '#212121' } },
      { name: 'Santoryu', style: 'santoryu', weapon: 'sword', count: 3, look: { hair: 'buzz', hairColor: '#2ecc71', top: '#fafafa', bottom: '#2d3436' } },
      { name: 'Sniper', style: 'sniper', weapon: 'gun', look: { hair: 'curly', hairColor: '#1e1e1e', nose: 'long', top: '#6d4c41' } },
      { name: 'Weather', style: 'weather_science', weapon: 'staff', look: { hair: 'long', hairColor: '#e67e22', top: '#0984e3' } },
      { name: 'Elbaf', style: 'elbaf', weapon: 'axe', bulk: 1.3, look: { hair: 'long', hairColor: '#8d6e63', hat: 'horns', top: '#795548' } },
    ];
    defs.forEach((d, i) => { const a = C.spawn({ ...d, id: 'atk' + i }, 4.6, (i - 2.5) * 1.5, Math.PI / 2 + (i % 2 ? 0.5 : -0.5)); a.masteries = { [d.style]: 50 }; a.stamina = 999; });
    C.view(0, -0.12, 'first');
  });
  await settle(page, 3);
  const swing = async (label, fn, t) => {
    await page.evaluate(fn);
    for (const dt of t) { await step(page, dt); await frames(page, 2); }
    await snap(label);
  };
  await swing('attack-m1', () => { for (const a of window.__C3.npcs) a.tryM1(window.OP.game); }, [0.05, 0.05]);
  await step(page, 0.4);
  await swing('attack-m1b', () => { for (const a of window.__C3.npcs) { a.combo.window = 1; a.combo.step = 1; a.tryM1(window.OP.game); } }, [0.05, 0.04]);
  await step(page, 0.5);
  await swing('attack-heavy', () => { for (const a of window.__C3.npcs) { a.stamina = 999; a.tryHeavy(window.OP.game); } }, [0.05, 0.05, 0.05, 0.05]);
  await step(page, 0.3);
  await swing('attack-heavy-late', () => {}, [0.05, 0.05]);
  await step(page, 1.0);
  // blocking, hurt, knocked down, frozen, dodge
  await page.evaluate(() => {
    const [a, b, c, d, e, f] = window.__C3.npcs;
    const g = window.OP.game;
    a.setBlock(true);
    b.flashT = 0.1; b.hitstun = 0.5;
    c.knockOut(g, null);
    d.addStatus('freeze', 5);
    e.tryDodge(g, 0, 1);
    f.armament = true; f.hakiSkill = { armament: 10 };
  });
  await step(page, 0.12); await frames(page, 2);
  await snap('states');
  await step(page, 0.6); await frames(page, 2);
  await snap('states-late');
}

// ------------------------------------------------------------------ viewmodel
async function viewmodel(page, snap) {
  await page.evaluate(() => {
    const C = window.__C3; C.clear();
    const g = window.OP.game, p = g.player;
    p.style = 'brawler'; p.weapon = null; p.fruit = null; p.stamina = 999;
    C.spawn({ name: 'Training Dummy', id: 'dummy1', look: { hair: 'bald', top: '#8d6e63' } }, 2.2, 0.2);
    C.view(0, -0.05, 'first');
  });
  await settle(page, 3);
  await snap('vm-idle');
  const act = async (label, fn, t) => {
    await page.evaluate(fn);
    for (const dt of t) { await step(page, dt); await frames(page, 2); }
    await snap(label);
    await step(page, 0.8);
  };
  await act('vm-jab', () => { const g = window.OP.game; g.player.tryM1(g); }, [0.05, 0.03]);
  await act('vm-cross', () => { const g = window.OP.game, p = g.player; p.combo.window = 1; p.combo.step = 1; p.tryM1(g); }, [0.05, 0.03]);
  await act('vm-heavy', () => { const g = window.OP.game; g.player.tryHeavy(g); }, [0.05, 0.05, 0.05, 0.05]);
  await page.evaluate(() => { const g = window.OP.game; g.player.setBlock(true); });
  await step(page, 0.15); await frames(page, 2);
  await snap('vm-block');
  await page.evaluate(() => { const g = window.OP.game; g.player.setBlock(false); });
  await step(page, 0.4);
  // black leg kick
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'black_leg'; p.masteries = { black_leg: 30 }; });
  await act('vm-kick', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.04]);
  // three swords
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'santoryu'; p.weapon = { kind: 'sword', count: 3, power: 1.2, ids: [] }; p.masteries = { santoryu: 30 }; });
  await step(page, 0.3); await frames(page, 2);
  await snap('vm-swords-idle');
  await act('vm-slash', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.05]);
  await act('vm-slash2', () => { const g = window.OP.game, p = g.player; p.combo.window = 1; p.combo.step = 1; p.tryM1(g); }, [0.04, 0.04]);
  // armament haki
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'brawler'; p.weapon = null; p.hakiSkill = { armament: 10 }; p.armament = true; p.haki = 999; });
  await act('vm-haki-punch', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.03]);
  await page.evaluate(() => { const p = window.OP.game.player; p.armament = false; });
  // a gun
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'sniper'; p.weapon = { kind: 'gun', count: 1, power: 1.2, ids: ['flintlock'] }; p.masteries = { sniper: 30 }; });
  await act('vm-gun', () => { const g = window.OP.game, p = g.player; p.combo.window = 0; p.tryM1(g); }, [0.05, 0.05, 0.03]);
  // Devil Fruits
  await page.evaluate(() => { const p = window.OP.game.player; p.style = 'brawler'; p.weapon = null; p.fruit = 'gomu'; p.fruitMastery = 100; });
  await act('vm-gomu-pistol', () => { const g = window.OP.game, p = g.player; p.tryTechnique('gomu_pistol', g, window.__C3.npcs[0]); }, [0.1, 0.05, 0.05]);
  await page.evaluate(() => { const p = window.OP.game.player; p.fruit = 'mera'; });
  await act('vm-mera', () => { const g = window.OP.game, p = g.player; p.tryTechnique('mera_fire_fist', g, window.__C3.npcs[0]) || p.tryTechnique(g.player.fruitDef.techniques[0].id, g, window.__C3.npcs[0]); }, [0.1, 0.1, 0.05]);
  await page.evaluate(() => { const p = window.OP.game.player; p.fruit = 'hie'; });
  await act('vm-hie', () => { const g = window.OP.game, p = g.player; const t = p.fruitDef.techniques.find((x) => x.anim === 'cast') || p.fruitDef.techniques[0]; p.tryTechnique(t.id, g, window.__C3.npcs[0]); }, [0.12, 0.1]);
}

// ------------------------------------------------------------------ sea king + crowd
async function seaKing(page, snap) {
  const ok = await page.evaluate(() => {
    const g = window.OP.game, p = g.player, w = g.world;
    window.__C3.clear();
    // find open sea a little way off the coast and stand on the shore facing it
    for (let r = 8; r < 60; r += 2) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = w.wx(p.x + Math.cos(a) * r), y = p.y + Math.sin(a) * r;
        if (w.isLiquid(x, y) && w.isLiquid(x + 3, y) && w.isLiquid(x - 3, y) && w.isLiquid(x, y + 3) && w.isLiquid(x, y - 3)) {
          const s = g.sea;
          const before = g.actors.length;
          for (let n = 0; n < 40 && g.actors.length === before; n++) s.spawnSeaKing({ x: x + (Math.random() - 0.5), y }, 0);
          const k2 = g.actors.find((q) => q.look && q.look.race === 'seaking');
          if (!k2) continue;
          k2.x = x; k2.y = y; k2.controller = null; k2.facing = Math.atan2(p.y - y, w.dx(x, p.x));
          k2.damageShown = 3;
          g.view3d.rig.yaw = (Math.atan2(y - p.y, w.dx(p.x, x)) + Math.PI * 2) % (Math.PI * 2);
          g.view3d.rig.pitch = 0.08;
          window.__C3.king = k2;
          return true;
        }
      }
    }
    return false;
  });
  if (!ok) { console.log('no sea found for the Sea King'); return; }
  await settle(page, 6);
  await snap('seaking');
  await page.evaluate(() => { const k = window.__C3.king; k.action = { def: { anim: 'heavy', steps: [], windup: 0.9, recover: 0.6 }, t: 0, step: 0, total: 1.6, mult: 1, angle: k.facing }; });
  await step(page, 0.6); await frames(page, 2);
  await snap('seaking-rear');
  await step(page, 0.4); await frames(page, 2);
  await snap('seaking-bite');
}

async function crowd(page, snap) {
  const n = await page.evaluate(() => {
    const C = window.__C3; C.clear();
    C.goSunny();
    const races = ['human', 'human', 'fishman', 'mink', 'human', 'skypiean', 'longarm', 'human', 'buccaneer', 'human'];
    let k = 0;
    for (let i = 0; i < 30; i++) {
      const row = Math.floor(i / 6), col = i % 6;
      const a = C.spawn({ name: 'Townsfolk ' + i, race: races[i % races.length], id: 'crowd' + i, showName: i % 4 === 0, style: ['brawler', 'black_leg', 'ittoryu'][i % 3], weapon: i % 3 === 2 ? 'sword' : undefined }, 4 + row * 2.2, (col - 2.5) * 1.6);
      a.intent.mx = 0; k++;
      if (i % 5 === 0) a.questMarker = i % 2 ? '?' : '!';
      if (i % 7 === 0) a.damageShown = 3;
    }
    C.view(0, -0.1, 'first');
    return k;
  });
  await settle(page, 6);
  const perf = await page.evaluate(() => window.__C3.perf());
  console.log('perf-crowd', JSON.stringify({ spawned: n, ...perf }));
  await snap('crowd');
  // everyone moves
  await page.evaluate(() => { for (const a of window.__C3.npcs) { a.intent.mx = Math.cos(a.seed) * 0.6; a.intent.my = Math.sin(a.seed) * 0.6; a.facing = Math.atan2(a.intent.my, a.intent.mx); } });
  await step(page, 0.5); await frames(page, 3);
  const perf2 = await page.evaluate(() => {
    const v = window.OP.game.view3d;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) v.render(window.OP.game);
    return { msPerFrame: (performance.now() - t0) / 10, ...window.__C3.perf() };
  });
  console.log('perf-crowd-moving', JSON.stringify(perf2));
  await snap('crowd-moving');
}

async function vmDebug(page, snap) {
  await page.evaluate(() => { const C = window.__C3; C.clear(); C.spawn({ name: 'Dummy', id: 'dummy1', look: { hair: 'bald' } }, 2.2, 0.2); C.view(0, -0.05, 'first'); });
  await settle(page, 3);
  const dump = () => page.evaluate(() => {
    const v = window.OP.game.view3d, vm = v.vm, m = vm && vm.model;
    if (!m) return 'no vm';
    const cam = v.rig.camera;
    const inv = cam.matrixWorldInverse.elements;
    const tx = (e) => { const x = e[12], y = e[13], z = e[14]; return [inv[0] * x + inv[4] * y + inv[8] * z + inv[12], inv[1] * x + inv[5] * y + inv[9] * z + inv[13], inv[2] * x + inv[6] * y + inv[10] * z + inv[14]].map((q) => +q.toFixed(3)); };
    const out = { visible: vm.root.visible, parent: vm.root.parent && vm.root.parent.type, bodyPos: vm.body.position.toArray().map((q) => +q.toFixed(3)) };
    for (const n of ['uarmR', 'farmR', 'handR', 'handL', 'chest']) { const b = m.bones.find((q) => q.name === n); out[n] = tx(b.matrixWorld.elements); }
    out.meshVisible = m.mesh.visible; out.render = { calls: v.renderer.info.render.calls };
    return out;
  });
  console.log('vm-idle', JSON.stringify(await dump()));
  await snap('dbg-idle');
  await page.evaluate(() => { const g = window.OP.game; g.player.setBlock(true); });
  await step(page, 0.15); await frames(page, 2);
  console.log('vm-block', JSON.stringify(await dump()));
  await snap('dbg-block');
}

export const scenarios = {
  c3dbg: { async run(page, snap) { await boot(page); await vmDebug(page, snap); } },
  chars3d: {
    async run(page, snap) {
      await boot(page);
      await raceLineup(page, snap);
      await hairLineup(page, snap);
      await hatLineup(page, snap);
      await closeups(page, snap);
      await attacks(page, snap);
      await viewmodel(page, snap);
      await crowd(page, snap);
      await seaKing(page, snap);
    },
  },
  c3q: {
    async run(page, snap) {
      await boot(page);
      await raceLineup(page, snap);
      await closeups(page, snap);
    },
  },
  c3hair: { async run(page, snap) { await boot(page); await hairLineup(page, snap); await hatLineup(page, snap); } },
  c3atk: { async run(page, snap) { await boot(page); await attacks(page, snap); } },
  c3vm: { async run(page, snap) { await boot(page); await viewmodel(page, snap); } },
  c3crowd: { async run(page, snap) { await boot(page); await crowd(page, snap); await seaKing(page, snap); } },
};
