// A ship's windows, seen from outside: not a painted panel but glass with a
// room behind it — floorboards, panelled walls and a ceiling, the far wall
// further off than the near ones, all shifting as you move past ("interior
// mapping": the room is traced in the shader, behind the pane, in the ship's
// own frame). By day it's dim in there behind a sheen of sky on the glass;
// at night a lamp is lit inside and the windows glow warm.
import * as THREE from 'three';

const ROOM = `
vec3 paneRoom(vec3 p, vec3 eye, vec3 n, float floorY, float night) {
  vec3 d = normalize(p - eye);
  // rooms of a cabin's size, their floors on the deck
  vec3 cell = vec3(2.6, 2.0, 2.4);
  vec3 q = p - vec3(0.0, floorY, 0.0) + d * 0.003;
  vec3 id = floor(q / cell);
  vec3 nb = (id + step(vec3(0.0), d)) * cell;
  vec3 t = (nb - q) / d;
  float tm; vec3 col; vec3 h;
  if (t.x < t.y && t.x < t.z) {
    tm = t.x; h = q + d * tm;
    col = vec3(0.47, 0.31, 0.19) * (0.85 + 0.15 * step(0.5, fract(h.z * 2.5)));
  } else if (t.y < t.z) {
    tm = t.y; h = q + d * tm;
    col = d.y < 0.0 ? vec3(0.42, 0.27, 0.15) * (0.82 + 0.18 * step(0.5, fract(h.x * 3.3))) : vec3(0.3, 0.2, 0.13);
  } else {
    tm = t.z; h = q + d * tm;
    col = vec3(0.55, 0.38, 0.24) * (0.85 + 0.15 * step(0.5, fract(h.x * 2.5)));
  }
  // (a dado rail round the walls, and the far corners in shadow)
  col *= 1.0 - 0.18 * smoothstep(0.02, 0.0, abs(fract(h.y / cell.y) - 0.45));
  col *= mix(1.0, 0.5, clamp(tm / 3.5, 0.0, 1.0));
  // lit inside at night: a warm lamp, brightest near the glass
  vec3 day = col * 0.85;
  vec3 lit = col * vec3(1.55, 1.15, 0.7) * (1.0 - 0.35 * clamp(tm / 3.0, 0.0, 1.0)) + vec3(0.1, 0.06, 0.0);
  col = mix(day, lit, night);
  // the glass: the sky caught on it, more so at a glancing look
  float fr = pow(1.0 - abs(dot(d, normalize(n))), 2.5);
  vec3 sky = mix(vec3(0.78, 0.88, 0.96), vec3(0.12, 0.16, 0.26), night);
  // (the colours above are as they look on screen: to the renderer's linear light)
  return pow(mix(col, sky, clamp(0.04 + fr * 0.4, 0.0, 0.5) * (1.0 - night * 0.6)), vec3(2.2));
}`;

/** A pane material for one ship (its own uniforms: the eye and the deck it's set to). */
export function paneMaterial(floorY = 0) {
  const u = { uEye: { value: new THREE.Vector3() }, uFloorY: { value: floorY }, uNight: { value: 0 } };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaneP;\nvarying vec3 vPaneN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaneP = position;\nvPaneN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaneP;\nvarying vec3 vPaneN;\nuniform vec3 uEye;\nuniform float uFloorY;\nuniform float uNight;\n' + ROOM)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( paneRoom(vPaneP, uEye, vPaneN, uFloorY, uNight), opacity );');
  };
  m.customProgramCacheKey = () => 'windowpane';
  m.userData.pane = u;
  return m;
}

const _inv = new THREE.Matrix4();
/** The pane mesh for a hull geometry that has panes (kit.js `pane`), or null. */
export function paneMesh(geo, floorY) {
  const pg = geo?.userData?.panes;
  if (!pg) return null;
  const mat = paneMaterial(floorY);
  const mesh = new THREE.Mesh(pg, mat);
  // (where the eye is, in the ship's own frame, for the rooms to be traced from)
  mesh.onBeforeRender = (r, s, cam) => {
    _inv.copy(mesh.matrixWorld).invert();
    mat.userData.pane.uEye.value.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(_inv);
  };
  return mesh;
}
