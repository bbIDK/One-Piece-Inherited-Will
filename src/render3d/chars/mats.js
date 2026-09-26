// Materials for the 3D characters.
//  * body: cel-shaded (the shared toon ramp) with vertex colours, one
//    instance per character so it can flash white on a hit, turn the
//    forearms glossy black (Armament Haki) or the shins to fire (Diable
//    Jambe), frost over when frozen, and fade; all instances share one shader.
//  * outline: the anime ink line — back faces pushed out along the normal
//    (after skinning), scaled with view depth so it stays ~2 px wide.
import * as THREE from 'three';
import { toonGradient } from '../materials.js';

const BODY_KEY = 'op-char-body-2';
const INK = 0x24160f;

/** A per-character body material (see the uniforms in `mat.userData.u`). */
export function bodyMaterial(opts = {}) {
  const u = {
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uHaki: { value: new THREE.Vector4() }, uHakiCol: { value: new THREE.Color(0x17151d) },
    uLegFx: { value: new THREE.Vector2() }, uLegFxCol: { value: new THREE.Color(1.0, 0.36, 0.0) },
    uFreeze: { value: 0 },
  };
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), fog: opts.fog ?? true });
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPart;
uniform float uFlash; uniform vec3 uFlashCol; uniform vec4 uHaki; uniform vec3 uHakiCol;
uniform vec2 uLegFx; uniform vec3 uLegFxCol; uniform float uFreeze;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pR = step(0.5, vPart) * step(vPart, 1.5), pL = step(1.5, vPart) * step(vPart, 2.5);
float lR = step(2.5, vPart) * step(vPart, 3.5), lL = step(3.5, vPart);
float hakiK = pR * uHaki.x + pL * uHaki.y + lR * uHaki.z + lL * uHaki.w;
float legK = lR * uLegFx.x + lL * uLegFx.y;
diffuseColor.rgb = mix(diffuseColor.rgb, uHakiCol, hakiK);
diffuseColor.rgb = mix(diffuseColor.rgb, uLegFxCol, legK * 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.88, 1.0), uFreeze * 0.55);
diffuseColor.rgb = mix(diffuseColor.rgb, uFlashCol, uFlash);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += vec3(0.42, 0.28, 0.72) * pow(rim, 2.2) * hakiK * 0.9;
  totalEmissiveRadiance += vec3(0.5, 0.75, 1.0) * pow(rim, 1.6) * uFreeze * 0.35;
  totalEmissiveRadiance += uLegFxCol * legK * 0.85 + uFlashCol * uFlash * 0.8;
}`);
  };
  m.customProgramCacheKey = () => BODY_KEY;
  return m;
}

/** Ink outline for skinned or plain meshes. `width` in metres at ~3 m (scaled by view depth). */
export function outlineMaterial(width = 0.0105, color = INK, opts = {}) {
  const u = { uOutline: { value: width } };
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: opts.fog ?? true });
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = u.uOutline;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
{
#ifdef USE_SKINNING
  vec3 onrm = normalize( objectNormal );
#else
  vec3 onrm = normalize( normal );
#endif
  vec4 mvq = modelViewMatrix * vec4( transformed, 1.0 );
  float sc = length( modelMatrix[ 1 ].xyz );
  transformed += onrm * uOutline * clamp( -mvq.z * 0.34, 0.75, 5.0 ) / max( sc, 0.2 );
}`);
  };
  m.customProgramCacheKey = () => 'op-char-outline-1';
  return m;
}

let SHARED_OUTLINE = null;
/** One outline material for all world characters. */
export function sharedOutline() {
  if (!SHARED_OUTLINE) SHARED_OUTLINE = outlineMaterial();
  return SHARED_OUTLINE;
}

let WEAPON = null;
/** Cel-shaded vertex-coloured material for weapons and props held by characters. */
export function weaponMaterial() {
  if (!WEAPON) WEAPON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  return WEAPON;
}

const GLOW = new Map();
/** Additive glow material for energy (charge-ups, element glows, energy blades). */
export function glowMaterial(color, opacity = 0.85) {
  const key = `${color}|${opacity}`;
  let m = GLOW.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    GLOW.set(key, m);
  }
  return m;
}

export { THREE };
