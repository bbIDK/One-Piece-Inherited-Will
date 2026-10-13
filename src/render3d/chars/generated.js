// Weapons modelled from concept art: an AI image of each, turned into a 3D
// mesh (image → 3D), then baked to flat cel colours, simplified and laid
// along +X from the grip by tools/glb2prop.mjs. `dy` lifts the grip's axis
// onto y = 0 (measured from each mesh). Used in place of the built models.
import * as THREE from 'three';
import cutlass from '../../assets/models/cutlass.js';
import marine_saber from '../../assets/models/marine_saber.js';
import fine_katana from '../../assets/models/fine_katana.js';
import yoru from '../../assets/models/yoru.js';
import wado_ichimonji from '../../assets/models/wado_ichimonji.js';
import flintlock from '../../assets/models/flintlock.js';
import woodsman_axe from '../../assets/models/woodsman_axe.js';
import giant_axe from '../../assets/models/giant_axe.js';
import kabuto from '../../assets/models/kabuto.js';
import sandai_kitetsu from '../../assets/models/sandai_kitetsu.js';
import shusui from '../../assets/models/shusui.js';
import enma from '../../assets/models/enma.js';
import kikoku from '../../assets/models/kikoku.js';
import clima_tact from '../../assets/models/clima_tact.js';
import shigure from '../../assets/models/shigure.js';
import yubashiri from '../../assets/models/yubashiri.js';
import rusty_katana from '../../assets/models/rusty_katana.js';
import wooden_sword from '../../assets/models/wooden_sword.js';
import bo_staff from '../../assets/models/bo_staff.js';
import marine_rifle from '../../assets/models/marine_rifle.js';
import slingshot from '../../assets/models/slingshot.js';

const GEN = {
  cutlass: [cutlass, 0.0348], marine_saber: [marine_saber, 0.0295], fine_katana: [fine_katana, -0.0036], yoru: [yoru, 0.0426],
  wado_ichimonji: [wado_ichimonji, 0.0041], flintlock: [flintlock, 0.0113], woodsman_axe: [woodsman_axe, 0.068], giant_axe: [giant_axe, 0.0142],
  kabuto: [kabuto, -0.0009], sandai_kitetsu: [sandai_kitetsu, 0.0017], shusui: [shusui, 0.002], enma: [enma, 0.0039], kikoku: [kikoku, 0.0887], clima_tact: [clima_tact, -0.0015],
  shigure: [shigure, -0.0022], yubashiri: [yubashiri, -0.0014], rusty_katana: [rusty_katana, 0.0002], wooden_sword: [wooden_sword, 0.0038], bo_staff: [bo_staff, -0.0007], marine_rifle: [marine_rifle, 0.0768], slingshot: [slingshot, 0.0055],
};
const CACHE = new Map();
const dec = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
/** The generated model of item `id`, or null if it has none. */
export function generatedGeo(id) {
  const G = GEN[id];
  if (!G) return null;
  let g = CACHE.get(id);
  if (g) return g;
  const [m, dy] = G;
  const pos = new Float32Array(dec(m.pos).buffer), nor = new Float32Array(dec(m.nor).buffer), c8 = dec(m.col);
  for (let i = 1; i < pos.length; i += 3) pos[i] -= dy;
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(c8, (v) => v / 255), 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.shared = true;
  CACHE.set(id, g);
  return g;
}
export const GENERATED_IDS = Object.keys(GEN);
