// Sea Monkeys in 3D (game/seamonkeys.js): giant monkeys shoulder-deep in the
// sea, as the anime draws them — a big round head of brown fur, a pale
// peach face with a wide, toothy grin and little round eyes, round ears out
// to the sides, broad furry shoulders and long arms. They bob in the swell
// and look about, and when one plays it rears up and brings both hands down
// flat on the sea; now and then one ducks right under and pops back up.
import * as THREE from 'three';
import { toon, addOutline } from '../materials.js';
import { Label } from './fx.js';

const SPH = new THREE.SphereGeometry(1, 20, 14);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);

function part(geo, mat, s, p, parent, outline = 0.05, r = null) {
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

export class SeaMonkeyView {
  constructor(a) {
    this.a = a;
    this.root = new THREE.Group();
    const fur = toon('#7a4a2a'), furDk = toon('#5a341c'), face = toon('#f2c7a0'), faceDk = toon('#d9a27a');
    const white = toon('#fbf7ee'), black = toon('#1a1010'), mouth = toon('#7d1f22'), tongue = toon('#e0707a');
    this.mats = [fur, furDk, face, faceDk, white, black, mouth, tongue];
    this.monkeys = a.monkeys.map((m, i) => {
      const g = new THREE.Group();
      const S = 2.3 + (i % 3) * 0.3;
      g.scale.setScalar(S);
      this.root.add(g);
      // shoulders and chest (the waterline cuts across them)
      part(SPH, fur, [3.2, 2.4, 2.4], [0, 0.4, 0], g, 0.08);
      // the head
      const head = new THREE.Group();
      head.position.set(0, 3.4, 0);
      g.add(head);
      part(SPH, fur, [2.0, 1.9, 1.9], [0, 0, 0], head, 0.07);
      part(SPH, furDk, [1.2, 0.5, 1.2], [-0.2, 1.55, 0], head, 0.03); // (a tuft on top)
      // the face: a broad pale mask with the muzzle pushed out
      part(SPH, face, [0.75, 1.25, 1.45], [1.45, -0.05, 0], head, 0.04);
      part(SPH, face, [0.9, 0.75, 1.05], [1.75, -0.55, 0], head, 0.04);
      for (const s of [-1, 1]) {
        part(SPH, white, [0.24, 0.28, 0.22], [2.1, 0.35, s * 0.48], head, 0.03);
        part(SPH, black, [0.1, 0.15, 0.1], [2.3, 0.35, s * 0.5], head, 0);
        part(SPH, faceDk, [0.16, 0.08, 0.36], [2.1, 0.72, s * 0.5], head, 0.02, [s * 0.2, 0, -0.2]); // brows
        part(SPH, faceDk, [0.08, 0.06, 0.08], [2.6, -0.25, s * 0.16], head, 0); // nostrils
        // the round ears, out to the sides
        part(SPH, fur, [0.45, 0.8, 0.3], [0.2, 0.3, s * 2.0], head, 0.04);
        part(SPH, face, [0.3, 0.55, 0.2], [0.3, 0.3, s * 2.12], head, 0);
      }
      // the grin: a wide open mouth, teeth along the top
      const jaw = new THREE.Group();
      jaw.position.set(1.9, -0.75, 0);
      head.add(jaw);
      part(SPH, mouth, [0.55, 0.32, 0.95], [0.35, -0.05, 0], jaw, 0.03);
      part(SPH, tongue, [0.4, 0.14, 0.6], [0.4, -0.2, 0], jaw, 0);
      part(SPH, white, [0.16, 0.1, 0.85], [0.62, 0.15, 0], jaw, 0);
      // the arms: upper arm and forearm, a big flat hand
      const arms = [-1, 1].map((s) => {
        const sh = new THREE.Group();
        sh.position.set(0.3, 1.2, s * 2.6);
        g.add(sh);
        part(CYL, fur, [0.75, 2.6, 0.75], [0, -1.3, 0], sh, 0.05);
        const el = new THREE.Group();
        el.position.set(0, -2.6, 0);
        sh.add(el);
        part(SPH, fur, [0.8, 0.8, 0.8], [0, 0, 0], el, 0.04);
        part(CYL, fur, [0.65, 2.4, 0.65], [0, -1.2, 0], el, 0.05);
        part(SPH, faceDk, [0.95, 0.35, 0.8], [0, -2.5, 0], el, 0.04);
        return { sh, el, s };
      });
      return { g, head, jaw, arms, m, rear: 0, slap: 0, duck: 0, S };
    });
    this.label = new Label();
    this.root.add(this.label.sprite);
    this.lastT = null;
  }

  update(a, env, ctx) {
    const t = env.time;
    const dt = Math.min(0.2, Math.max(0, t - (this.lastT ?? t - 1 / 60)));
    this.lastT = t;
    const game = a.game;
    for (const [i, M] of this.monkeys.entries()) {
      const m = a.monkeys[i];
      if (!m) continue;
      // the slap: up on the wind-up (0-0.45 s), both hands down flat on the sea, back to bobbing
      const since = game ? game.time - m.slapT : 99;
      const rear = since < 0.45 ? since / 0.45 : since < 1.3 ? Math.max(0, 1 - (since - 0.45) / 0.25) : 0;
      const slap = since >= 0.45 && since < 1.4 ? 1 - Math.max(0, since - 0.7) / 0.7 : 0;
      M.rear = easeTo(M.rear, rear, 14, dt); M.slap = easeTo(M.slap, slap, 16, dt);
      M.duck = easeTo(M.duck, m.duck > 0.2 ? 1 : 0, 3, dt);
      const bob = Math.sin(t * 1.1 + m.seed) * 0.35;
      M.g.position.set(m.dx, (-1.6 + bob + M.rear * 1.6 - M.duck * 9) * M.S, m.dy);
      // turned toward you, looking about
      const look = (a.facing || 0) + Math.sin(t * 0.4 + m.seed) * 0.5;
      M.g.rotation.y = -look;
      M.head.rotation.set(Math.sin(t * 0.7 + m.seed) * 0.12, Math.sin(t * 0.5 + m.seed * 2) * 0.25, 0.12 * Math.sin(t * 0.9 + m.seed) - M.rear * 0.25 + M.slap * 0.2);
      // the grin opens wide in its glee
      M.jaw.rotation.z = -(0.15 + 0.2 * Math.max(0, Math.sin(t * 2 + m.seed)) + M.rear * 0.45);
      for (const A of M.arms) {
        // at rest: arms down in the water, paddling; on the wind-up: both up over its head; the slap: down flat in front
        const paddle = Math.sin(t * 1.6 + m.seed + A.s) * 0.25;
        const up = M.rear, down = M.slap;
        A.sh.rotation.set(A.s * (0.25 + up * 0.2), 0, paddle * (1 - up) + up * 2.7 - down * 1.4 + 0.4);
        A.el.rotation.set(0, 0, -0.5 * (1 - up) + up * 0.3 + down * 0.4);
      }
    }
    this.root.visible = true;
    this.label.set(null);
  }

  dispose() {
    this.label.dispose();
    this.root.removeFromParent();
  }
}
