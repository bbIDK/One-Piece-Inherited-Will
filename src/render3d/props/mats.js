// Shared materials and per-frame state for the 3D world objects.
//
// Every model built with the kit uses ONE vertex-coloured cel-shaded material
// (a MeshToonMaterial with a small shader patch):
//   * `tint` (per vertex, 0/1) lets an InstancedMesh recolour only the parts
//     that should vary (leaves, candy, stone) with its instance colour;
//   * `glow` (per vertex, rgb + flicker) is emissive at night: lamp glass,
//     lit windows, lanterns, glowing eyes;
//   * the "sway" variant bends tall vegetation in the wind.
// tick() is called every frame (from buildings3d.setNightWindows) and drives
// the shared uniforms and the animated props (flags, windmills, fires…).
import * as THREE from 'three';
import { toonGradient } from '../materials.js';
import { registerFrameHook } from '../registry.js';

export const U = {
  time: { value: 0 },
  night: { value: 0 },
  wind: { value: 1 },
};

const COLOR_VERTEX = /* glsl */`
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= mix( vec3( 1.0 ), instanceColor.xyz, tint );
#endif
	{
		vec2 gph = modelMatrix[3].xz;
		#ifdef USE_INSTANCING
			gph += instanceMatrix[3].xz;
		#endif
		float fl = 1.0 - glow.a * ( 0.25 + 0.25 * sin( uTime * 11.0 + gph.x * 3.1 ) + 0.18 * sin( uTime * 23.0 + gph.y * 1.7 ) );
		vGlow = glow.rgb * uNight * fl;
	}
`;

const SWAY = /* glsl */`
#include <begin_vertex>
{
	float sh = max( position.y - 1.0, 0.0 );
	vec2 ph = modelMatrix[3].xz;
	#ifdef USE_INSTANCING
		ph += instanceMatrix[3].xz;
	#endif
	float s = sin( uTime * 1.3 + ph.x * 0.37 + ph.y * 0.23 ) + 0.4 * sin( uTime * 2.7 + ph.x * 0.13 - ph.y * 0.31 );
	transformed.x += s * sh * sh * 0.0055 * uWind;
	transformed.z += cos( uTime * 1.05 + ph.y * 0.29 ) * sh * sh * 0.0035 * uWind;
}
`;

const matCache = new Map();

/**
 * The shared vertex-coloured toon material.
 * opts.sway: bend in the wind; opts.side: THREE.DoubleSide for thin sheets;
 * opts.transparent/opacity for see-through things (bubbles, crystals).
 */
export function vcMat(opts = {}) {
  const key = `${opts.sway ? 's' : ''}|${opts.side || 0}|${opts.transparent ? opts.opacity ?? 0.5 : 1}|${opts.depthWrite === false ? 0 : 1}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshToonMaterial({
    vertexColors: true, gradientMap: toonGradient(), side: opts.side || THREE.FrontSide,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite !== false,
  });
  const sway = !!opts.sway;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uNight = U.night;
    sh.uniforms.uWind = U.wind;
    sh.vertexShader = 'attribute float tint;\nattribute vec4 glow;\nvarying vec3 vGlow;\nuniform float uTime;\nuniform float uNight;\nuniform float uWind;\n' + sh.vertexShader
      .replace('#include <color_vertex>', COLOR_VERTEX)
      .replace('#include <begin_vertex>', sway ? SWAY : '#include <begin_vertex>');
    sh.fragmentShader = 'varying vec3 vGlow;\n' + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vGlow;');
  };
  m.customProgramCacheKey = () => 'opvc' + (sway ? '-sway' : '');
  matCache.set(key, m);
  return m;
}

/** An unlit (always bright) material: flames, lamp beams, magic. */
const basicCache = new Map();
export function glowMat(color, opts = {}) {
  const key = `${color}|${opts.opacity ?? 1}|${opts.additive ? 1 : 0}`;
  let m = basicCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color, transparent: opts.opacity !== undefined || !!opts.additive, opacity: opts.opacity ?? 1,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !opts.additive && opts.opacity === undefined,
    fog: true, side: opts.side || THREE.FrontSide,
  });
  basicCache.set(key, m);
  return m;
}

/** A plain mesh with the shared material (the usual one-draw-call model). */
export function meshOf(geo, opts = {}) {
  const m = new THREE.Mesh(geo, opts.material || vcMat(opts));
  m.castShadow = opts.castShadow !== false;
  m.receiveShadow = opts.receiveShadow !== false;
  return m;
}

// ------------------------------------------------------------- frame state
export const STATE = { game: null, ctx: null, t: 0, night: 0, frame: 0, env: null };
const animators = new Set();

/**
 * Attach a per-frame animation to a model: fn(t, env, state) runs every frame
 * while the model is in the scene (from 'added' until 'removed').
 */
export function animate(root, fn) {
  const rec = { root, fn };
  root.addEventListener('added', () => animators.add(rec));
  root.addEventListener('removed', () => animators.delete(rec));
  return root;
}

/** Remember the game (for the clock and the weather) the first time a builder runs. */
export function bindCtx(ctx) {
  if (ctx && !STATE.ctx) { STATE.ctx = ctx; STATE.game = ctx.game; }
}

/** Called every frame with the night factor (0 by day … ~0.9 at night). */
export function tick(night, envArg) {
  const env = envArg || STATE.game?.env;
  STATE.env = env;
  STATE.t = env ? env.time : performance.now() / 1000;
  STATE.night = night;
  STATE.frame++;
  U.time.value = STATE.t;
  U.night.value = night;
  U.wind.value = 1 + (env?.storm || 0) * 2.5;
  for (const a of animators) {
    try { a.fn(STATE.t, env, STATE); } catch (e) { animators.delete(a); console.warn('prop animation failed', e); }
  }
}

// the renderer calls this once per rendered frame
registerFrameHook((env, ctx) => {
  bindCtx(ctx);
  tick(Math.max(0, 0.9 - (env?.daylight ?? 1)), env);
});
