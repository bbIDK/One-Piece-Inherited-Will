// A Kung-Fu Dugong in 3D (game/dugongs.js), as the anime draws them: a
// little round sea-cow standing up on its tail, sandy-tan with a pale belly,
// a domed green shell on its back like a turtle's, a round face with big
// black eyes, a whiskered muzzle and a tiny mouth, and two stubby flippers
// it holds up in a kung-fu guard. It sways in its stance, practises its
// forms, bows (to a challenger, to its master), chops and spins its tail
// round to kick, flips back out of reach, and copies its master's moves.
import * as THREE from 'three';
import { toon, addOutline } from '../materials.js';
import { Label } from './fx.js';

const SPH = new THREE.SphereGeometry(1, 18, 12);

function part(geo, mat, s, p, parent, outline = 0.025, r = null) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(...s);
  m.position.set(...p);
  if (r) m.rotation.set(...r);
  m.castShadow = true;
  if (outline) addOutline(m, outline);
  parent.add(m);
  return m;
}

const easeTo = (cur, to, k, dt) => cur + (to - cur) * Math.min(1, dt * k);

export class DugongView {
  constructor(a) {
    this.a = a;
    const tan = toon('#c9a57a'), belly = toon('#f1dfc2'), shell = toon('#5c8f3e'), shellDk = toon('#3f6a2a'), shellRim = toon('#8fb86a');
    const black = toon('#1a1210'), white = toon('#ffffff'), nose = toon('#6d4a3a'), blush = toon('#e8a08a');
    this.root = new THREE.Group();
    this.yaw = new THREE.Group();
    this.root.add(this.yaw);
    this.body = new THREE.Group();
    this.yaw.add(this.body);
    // the tail it stands on, curled forward under it like a seat
    part(SPH, tan, [0.34, 0.16, 0.3], [0.12, 0.1, 0], this.body, 0.025);
    part(SPH, tan, [0.18, 0.08, 0.32], [0.38, 0.06, 0], this.body, 0.02, [0, 0, 0.2]);
    // the body: a round, upright pear
    part(SPH, tan, [0.36, 0.5, 0.36], [0, 0.6, 0], this.body, 0.03);
    part(SPH, belly, [0.26, 0.4, 0.3], [0.13, 0.58, 0], this.body, 0);
    // the shell on its back: a dome with plates and a pale rim
    part(SPH, shellRim, [0.3, 0.48, 0.4], [-0.16, 0.62, 0], this.body, 0.03);
    part(SPH, shell, [0.3, 0.44, 0.37], [-0.2, 0.64, 0], this.body, 0.02);
    for (const [y, z] of [[0.82, 0], [0.55, 0.16], [0.55, -0.16], [0.4, 0]]) part(SPH, shellDk, [0.06, 0.1, 0.1], [-0.47, y, z], this.body, 0);
    // the head
    this.head = new THREE.Group();
    this.head.position.set(0.04, 1.12, 0);
    this.body.add(this.head);
    part(SPH, tan, [0.3, 0.27, 0.3], [0, 0, 0], this.head, 0.03);
    part(SPH, belly, [0.16, 0.13, 0.2], [0.22, -0.08, 0], this.head, 0.02); // the muzzle
    part(SPH, nose, [0.05, 0.035, 0.08], [0.37, -0.03, 0], this.head, 0);
    for (const s of [-1, 1]) {
      part(SPH, black, [0.075, 0.095, 0.07], [0.22, 0.07, s * 0.13], this.head, 0.012);
      part(SPH, white, [0.022, 0.026, 0.022], [0.28, 0.1, s * 0.15], this.head, 0);
      part(SPH, blush, [0.03, 0.025, 0.05], [0.25, -0.05, s * 0.2], this.head, 0);
      for (let w = 0; w < 3; w++) part(SPH, nose, [0.012, 0.012, 0.012], [0.33, -0.08 + w * 0.025, s * (0.06 + w * 0.012)], this.head, 0);
    }
    // the flippers, held up in a guard
    this.flips = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.position.set(0.05, 0.85, s * 0.3);
      this.body.add(g);
      part(SPH, tan, [0.1, 0.24, 0.07], [0.08, -0.12, s * 0.02], g, 0.02, [0, 0, -0.5]);
      return { g, s };
    });
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.bow = 0; this.chop = 0; this.spin = 0; this.flip = 0; this.kata = 0; this.lastT = null; this.spinA = 0;
  }

  update(a, env, ctx) {
    const t = env.time + (a.seed || 0) * 5;
    const dt = Math.min(0.2, Math.max(0, env.time - (this.lastT ?? env.time - 1 / 60)));
    this.lastT = env.time;
    const game = a.game, now = game?.time ?? 0;
    this.yaw.rotation.y = -(a.facing || 0);
    const act = a.action, kind = act?.def?.dugong;
    let chop = 0, spin = 0;
    if (act) {
      const w = act.def.windup || 0.3, p = act.t < w ? act.t / w : 1, post = Math.max(0, act.t - w);
      if (kind === 'spin') spin = p < 1 ? p * 0.3 : Math.min(1, 0.3 + post * 4);
      else chop = act.t < w ? -p : Math.max(0, 1 - post / 0.3);
    }
    const knocked = a.state === 'knocked' || a.state === 'dead';
    this.bow = easeTo(this.bow, (a.bowT || 0) > 0.15 ? 1 : 0, 8, dt);
    this.chop = easeTo(this.chop, chop, 18, dt);
    this.spin = spin;
    const kata = (a.kataT || 0) > 0 ? Math.sin((now - (a.mimic || 0)) * 9) : 0;
    this.kata = easeTo(this.kata, kata, 12, dt);
    const flipT = now - (a.flipT ?? -9), flip = flipT < 0.45 ? flipT / 0.45 : 0;
    // the stance: a little sway and bounce on its tail
    const sway = Math.sin(t * 2.4) * 0.05, bounce = Math.abs(Math.sin(t * 4.8)) * 0.04 * (a.moving ? 2 : 1);
    this.body.position.y = bounce + Math.sin(flip * Math.PI) * 0.6;
    this.body.rotation.z = -this.bow * 0.7 + sway * 0.4 + this.chop * 0.2 + flip * Math.PI * 2 + (knocked ? -1.4 : 0);
    // the spinning tail kick: round it goes, once
    this.spinA = spin > 0 && spin < 1 ? spin * Math.PI * 2 : 0;
    this.body.rotation.y = this.spinA;
    this.head.rotation.set(0, sway * 0.5, this.bow * 0.3 + sway * 0.3);
    for (const F of this.flips) {
      // guard: up in front; chop: the near one swung down hard; bow: tucked to the chest; kata: pumping
      const lead = F.s > 0;
      const guard = 0.9 + Math.sin(t * 2.4 + F.s) * 0.1;
      const z = guard - this.bow * 0.9 + (lead ? this.chop * 1.6 : -this.chop * 0.3) + this.kata * (lead ? 0.6 : -0.6) - (knocked ? 1 : 0);
      F.g.rotation.set(F.s * 0.2, 0, z);
    }
    const showBar = a.damageShown > 0 && a.state === 'idle' && !a.disciple;
    this.label.set(showBar ? a.name : null, '#fff', showBar ? Math.max(0, a.hp / a.d.maxHp) : null, '#ef5350', showBar ? `${Math.max(0, Math.ceil(a.hp))} / ${Math.round(a.d.maxHp)}` : null);
    this.label.sprite.position.set(0, 1.7, 0);
    const cam = ctx.camera;
    const dist = cam ? cam.position.distanceTo(this.root.position) : 10;
    const k = Math.min(2.4, Math.max(0.5, dist / 8));
    this.label.sprite.scale.set(1.6 * k, 1.6 * k * 40 / 256, 1);
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}
