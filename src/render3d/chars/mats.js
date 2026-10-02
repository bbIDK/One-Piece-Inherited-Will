// Materials for the 3D characters.
//  * body: cel-shaded (the shared toon ramp) with vertex colours, one
//    instance per character so it can flash white on a hit, turn the
//    forearms glossy black (Armament Haki) or the shins to fire (Diable
//    Jambe), frost over when frozen, and fade; all instances share one shader.
//  * outline: the anime ink line — back faces pushed out along the normal
//    (after skinning), scaled with view depth so it stays ~2 px wide.
import * as THREE from 'three';
import { FOG } from '../fog.js';
import { sunSelf } from '../sunshadow.js';
import { detailTexture } from './detail.js';

const BODY_KEY = 'op-char-body-5';
const INK = 0x24160f;

let GRAD = null;
/**
 * Characters' cel ramp: anime two-tone, the shadow side clearly darker (so
 * the form reads: the underside of the pecs, the nose's shadow, the far side
 * of an arm), deepening a little where the surface turns right away.
 */
export function charGradient() {
  if (GRAD) return GRAD;
  const v = [128, 132, 138, 150, 255, 255, 255, 255];
  const data = new Uint8Array(v.flatMap((x) => [x, x, x, 255]));
  GRAD = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
  GRAD.minFilter = THREE.NearestFilter;
  GRAD.magFilter = THREE.NearestFilter;
  GRAD.generateMipmaps = false;
  GRAD.needsUpdate = true;
  return GRAD;
}

/**
 * The characters' cel shading: the shadow side of a form takes a warm,
 * slightly rosy tone (anime skin shadows are never grey), the lit side stays
 * clean. Shared by the body and the face decal so they match.
 */
export function celShading(sh) {
  const chunk = THREE.ShaderChunk.lights_toon_pars_fragment;
  const find = 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
  if (!chunk.includes(find)) return;
  // (the light that draws the form comes partly from the sun and partly from a
  // key over the viewer's shoulder, upper left — as the anime-game art is lit —
  // so every character shows a lit side and a shadow side whichever way it faces)
  const toon = chunk.replace(find, `vec3 keyL = normalize( mix( directLight.direction, normalize( vec3( -0.62, 0.5, 0.6 ) ), 0.55 ) );
	vec3 gi = getGradientIrradiance( geometryNormal, keyL );
	vec3 irradiance = gi * mix( vec3( 0.84, 0.7, 0.74 ), vec3( 1.0 ), smoothstep( 0.62, 0.95, gi.r ) ) * directLight.color;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <lights_toon_pars_fragment>', toon);
}

/**
 * How far (m) toward the sun a character's surface ignores what shades it: its
 * own limbs, head and hat (see sunSelf). Your own arms in first person ignore
 * more: the body they're drawn for hangs a little apart from them.
 */
export const SELF_SHADE = 0.3, SELF_SHADE_VM = 0.7;

/** A per-character body material (see the uniforms in `mat.userData.u`). opts.self: see SELF_SHADE. */
export function bodyMaterial(opts = {}) {
  const u = {
    uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) },
    uHaki: { value: new THREE.Vector4() }, uHakiCol: { value: new THREE.Color(0x17151d) },
    uLegFx: { value: new THREE.Vector2() }, uLegFxCol: { value: new THREE.Color(1.0, 0.36, 0.0) },
    uFreeze: { value: 0 },
    // your own body seen from your eyes (first person): nothing above the neck, and no arms while the view's own are up
    uClipY: { value: 1e6 }, uHideArms: { value: 0 }, uHideHead: { value: 0 },
  };
  const m = new THREE.MeshToonMaterial({ vertexColors: true, map: detailTexture(), gradientMap: charGradient(), fog: opts.fog ?? true });
  m.defines = { ...m.defines, SUN_SELF: sunSelf(opts.self ?? SELF_SHADE) };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOG, u);
    celShading(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nvarying float vPart;\nvarying float vObjY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvObjY = transformed.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vPart; varying float vObjY;
uniform float uFlash; uniform vec3 uFlashCol; uniform vec4 uHaki; uniform vec3 uHakiCol;
uniform vec2 uLegFx; uniform vec3 uLegFxCol; uniform float uFreeze; uniform float uClipY; uniform float uHideArms; uniform float uHideHead;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pR = step(0.5, vPart) * step(vPart, 1.5), pL = step(1.5, vPart) * step(vPart, 2.5);
float lR = step(2.5, vPart) * step(vPart, 3.5), lL = step(3.5, vPart) * step(vPart, 4.5), pHead = step(4.5, vPart);
if (vObjY > uClipY || uHideArms * (pR + pL) > 0.5 || uHideHead * pHead > 0.5) discard;
float hakiK = pR * uHaki.x + pL * uHaki.y + lR * uHaki.z + lL * uHaki.w;
float legK = lR * uLegFx.x + lL * uLegFx.y;
diffuseColor.rgb = mix(diffuseColor.rgb, uHakiCol, hakiK);
diffuseColor.rgb = mix(diffuseColor.rgb, uLegFxCol, legK * 0.8);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.88, 1.0), uFreeze * 0.55);
diffuseColor.rgb = mix(diffuseColor.rgb, uFlashCol, uFlash);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  // the anime rim light: a bright edge along the top and sides of the figure
  float rimUp = smoothstep(-0.25, 0.55, normalize(normal).y);
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.96, 0.9) * smoothstep(0.55, 0.9, rim) * rimUp * 0.55 * (1.0 - hakiK);
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
    Object.assign(sh.uniforms, FOG);
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
  m.customProgramCacheKey = () => 'op-char-outline-2';
  return m;
}

const SHARED_OUTLINE = {};
/**
 * One outline material for all world characters' bodies (skinned), and
 * another for what they hold (a material drawn both ways makes the renderer
 * look up its shader afresh every time it switches).
 */
export function sharedOutline(skinned = true) {
  const k = skinned ? 'skin' : 'solid';
  return SHARED_OUTLINE[k] || (SHARED_OUTLINE[k] = outlineMaterial());
}

let WEAPON = null;
/** Cel-shaded vertex-coloured material for weapons and props held by characters. */
export function weaponMaterial() {
  if (!WEAPON) {
    WEAPON = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: charGradient() });
    WEAPON.defines = { ...WEAPON.defines, SUN_SELF: sunSelf(SELF_SHADE) };
  }
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
