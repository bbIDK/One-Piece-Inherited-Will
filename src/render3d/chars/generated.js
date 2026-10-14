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
import morgan_axe from '../../assets/models/morgan_axe.js';
import sorcery_clima_tact from '../../assets/models/sorcery_clima_tact.js';
import kuro_kabuto from '../../assets/models/kuro_kabuto.js';
import wano_katana from '../../assets/models/wano_katana.js';
import nb_shibireru from '../../assets/models/nb_shibireru.js';
import p2_funkfreed from '../../assets/models/p2_funkfreed.js';

const GEN = {
  cutlass: [cutlass, 0.0348], marine_saber: [marine_saber, 0.0295], fine_katana: [fine_katana, -0.0036], yoru: [yoru, 0.0426],
  wado_ichimonji: [wado_ichimonji, 0.0041], flintlock: [flintlock, 0.0113], woodsman_axe: [woodsman_axe, 0.068], giant_axe: [giant_axe, 0.0142],
  kabuto: [kabuto, -0.0009], sandai_kitetsu: [sandai_kitetsu, 0.0017], shusui: [shusui, 0.002], enma: [enma, 0.0039], kikoku: [kikoku, 0.0887], clima_tact: [clima_tact, -0.0015],
  shigure: [shigure, -0.0022], yubashiri: [yubashiri, -0.0014], rusty_katana: [rusty_katana, 0.0002], wooden_sword: [wooden_sword, 0.0038], bo_staff: [bo_staff, -0.0007], marine_rifle: [marine_rifle, 0.0768], slingshot: [slingshot, 0.0055],
  morgan_axe: [morgan_axe, 0.0976], sorcery_clima_tact: [sorcery_clima_tact, -0.0015], kuro_kabuto: [kuro_kabuto, -0.0004], wano_katana: [wano_katana, 0.0064], nb_shibireru: [nb_shibireru, 0.0019], p2_funkfreed: [p2_funkfreed, 0.014],
};
const CACHE = new Map();
const dec = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
/** A packed model (tools/modelpack.mjs) as flat arrays: 9 position floats and 9 colour floats a face. */
export function unpack(m) {
  const q = new Uint16Array(dec(m.pos).buffer), fc = dec(m.col), [x0, y0, z0, sx, sy, sz] = m.q;
  const pos = new Float32Array(q.length), col = new Float32Array(q.length);
  for (let i = 0; i < q.length; i += 3) {
    pos[i] = x0 + q[i] * sx; pos[i + 1] = y0 + q[i + 1] * sy; pos[i + 2] = z0 + q[i + 2] * sz;
    const f = ((i / 9) | 0) * 3;
    col[i] = fc[f] / 255; col[i + 1] = fc[f + 1] / 255; col[i + 2] = fc[f + 2] / 255;
  }
  return { pos, col };
}
/** The generated model of item `id`, or null if it has none. */
export function generatedGeo(id) {
  const G = GEN[id];
  if (!G) return null;
  let g = CACHE.get(id);
  if (g) return g;
  const [m, dy] = G;
  const { pos, col } = unpack(m);
  for (let i = 1; i < pos.length; i += 3) pos[i] -= dy;
  g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); // (unindexed: each face's own flat normal)
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.shared = true;
  CACHE.set(id, g);
  return g;
}
export const GENERATED_IDS = Object.keys(GEN);
