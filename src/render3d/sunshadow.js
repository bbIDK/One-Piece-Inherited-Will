// The sun's shadows, with clean smooth outlines close up:
//  * one shadow map holding two cascades side by side: a fine one around you
//    (24 m across, a texel to every 1.2 cm) and a coarse one four times as
//    wide, out to 48 m, for everything farther off. Both are centred a little
//    ahead of you, the way you look;
//  * they only ever move by whole texels of the coarse cascade, counted from
//    a fixed point in the world, so each shadow falls on the same texels
//    frame after frame and its edge holds still as you walk (a map that
//    slides with you makes every edge crawl);
//  * each shadow is read through a quadratic B-spline over the 3×3 texels
//    around the point, so its outline is a smooth curve instead of a
//    staircase of blended texels; the fine cascade hands over to the coarse
//    one over its last metre, and the coarse one fades out at its edge.
// The shadow lookup is patched into three.js's shader chunks (like lighting.js)
// before anything compiles.
import * as THREE from 'three';

const SIZE = 2048; // texels across each cascade
const NEAR = 12; // m: half the width of the fine cascade
const RATIO = 4; // the coarse one is this many times wider (a whole number: its texels hold whole fine ones)
const AHEAD = 0.35; // how far ahead of you both are centred (a share of NEAR)
const DIST = 120; // m from the middle of the map up to the light
const DEPTH = 260; // m of depth the map holds, from 1 m in front of the light
const BLEND = 1; // m: the fine cascade hands over to the coarse one over this much of its edge
const FADE = 4; // m: the coarse one fades out over this much of its edge
// how far a surface is taken to lie toward the light before it's tested (m): a
// little more than the fine filter's reach down a steep slope, so a surface
// never shadows itself (in the coarse cascade, RATIO times as much)
const BIAS = 0.06;
const NORMAL_BIAS = 0.02; // m: the point tested is moved this far out along the surface normal

function patch(name, find, fn) {
  const chunk = THREE.ShaderChunk[name];
  const out = fn(chunk);
  if (out === chunk) console.warn(`sunshadow: ${find} not found in ${name}; left as it is`);
  else THREE.ShaderChunk[name] = out;
}

// (the shadow coordinate given is the coarse cascade's: the fine one's is
// RATIO times as far from the middle)
const GLSL = /* glsl */`
	const float SUN_RATIO = ${RATIO.toFixed(1)};
	const float SUN_BLEND = ${(BLEND / (2 * NEAR)).toFixed(5)};
	const float SUN_FADE = ${(FADE / (2 * NEAR * RATIO)).toFixed(5)};

	float sunShadowRead( sampler2D map, vec2 uv, float z ) {
		return step( z, unpackRGBAToDepth( texture2D( map, uv ) ) );
	}

	// One cascade of the sun's map (x0: where it starts across the map, which
	// is two cascades wide), filtered with a quadratic B-spline over the 3×3
	// texels around uv: the shadow's edge becomes a smooth curve ~2 texels wide.
	float sunShadowCascade( sampler2D map, vec2 size, vec2 uv, float z, float x0 ) {
		vec2 p = uv * size - 0.5;
		vec2 c = floor( p + 0.5 );
		vec2 f = p - c;
		vec2 wa = 0.5 * ( 0.5 - f ) * ( 0.5 - f );
		vec2 wb = 0.75 - f * f;
		vec2 wc = 0.5 * ( 0.5 + f ) * ( 0.5 + f );
		vec2 px = vec2( 0.5, 1.0 ) / size;
		vec2 o = vec2( x0, 0.0 ) + ( c + 0.5 ) * px;
		float r0 = wa.x * sunShadowRead( map, o - px, z ) + wb.x * sunShadowRead( map, o + vec2( 0.0, - px.y ), z ) + wc.x * sunShadowRead( map, o + vec2( px.x, - px.y ), z );
		float r1 = wa.x * sunShadowRead( map, o + vec2( - px.x, 0.0 ), z ) + wb.x * sunShadowRead( map, o, z ) + wc.x * sunShadowRead( map, o + vec2( px.x, 0.0 ), z );
		float r2 = wa.x * sunShadowRead( map, o + vec2( - px.x, px.y ), z ) + wb.x * sunShadowRead( map, o + vec2( 0.0, px.y ), z ) + wc.x * sunShadowRead( map, o + px, z );
		return wa.y * r0 + wb.y * r1 + wc.y * r2;
	}

	float getSunShadow( sampler2D map, vec2 size, float intensity, float bias, vec4 coord ) {
		vec3 c = coord.xyz / coord.w;
		vec2 d = abs( c.xy - 0.5 );
		float edge = max( d.x, d.y ); // 0.5 at the coarse cascade's edge
		float margin = 2.0 / size.x; // (the filter reaches 1.5 texels out)
		if ( edge > 0.5 - margin || c.z > 1.0 ) return 1.0;
		float k = smoothstep( 0.5 - SUN_BLEND, 0.5 - margin, edge * SUN_RATIO ); // 0: the fine cascade, 1: the coarse
		float s = 1.0;
		if ( k < 1.0 ) s = sunShadowCascade( map, size, ( c.xy - 0.5 ) * SUN_RATIO + 0.5, c.z + bias, 0.0 );
		if ( k > 0.0 ) s = mix( s, sunShadowCascade( map, size, c.xy, c.z + bias * SUN_RATIO, 0.5 ), k );
		s = mix( s, 1.0, smoothstep( 0.5 - SUN_FADE, 0.5 - margin, edge ) );
		return mix( 1.0, s, intensity );
	}
`;

patch('shadowmap_pars_fragment', 'the directional shadow lookup', (chunk) => {
  const at = chunk.indexOf('\tfloat getShadow(');
  if (at < 0) return chunk;
  return chunk.slice(0, at) + `#if NUM_DIR_LIGHT_SHADOWS > 0\n${GLSL}\n#endif\n\n` + chunk.slice(at);
});

// the sun is the only directional light: its shadow is read the way above
patch('lights_fragment_begin', 'the directional shadow', (chunk) => chunk.replace(
  'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )',
  'getSunShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, vDirectionalShadowCoord[ i ] )',
));

// (three.js doesn't export the class of a directional light's shadow: take it from one)
const DirectionalLightShadow = new THREE.DirectionalLight().shadow.constructor;

/** Keep a coarse-cascade shadow matrix from the fine one's (same view, RATIO times the window). */
function toCoarse(m) {
  const e = m.elements;
  for (const i of [0, 4, 8, 1, 5, 9]) e[i] /= RATIO;
  e[12] = (e[12] - 0.5) / RATIO + 0.5;
  e[13] = (e[13] - 0.5) / RATIO + 0.5;
}

/** The sun's shadow: the two cascades, drawn side by side into one map. */
export class SunShadow extends DirectionalLightShadow {
  constructor() {
    super();
    this.mapSize.set(SIZE, SIZE);
    this._frameExtents.set(2, 1);
    this._viewportCount = 2;
    this._viewports = [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(1, 0, 1, 1)];
    this.camera.near = 1;
    this.camera.far = DEPTH;
    this.bias = -BIAS / (DEPTH - 1);
    this.normalBias = NORMAL_BIAS;
  }

  /** Each cascade is drawn through its own window; the shaders read both through the coarse one's matrix. */
  updateMatrices(light, vp = 0) {
    const r = vp ? NEAR * RATIO : NEAR, cam = this.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.updateProjectionMatrix();
    super.updateMatrices(light);
    if (!vp) toCoarse(this.matrix);
  }

  /**
   * Centres the map a little ahead of (x, y, z) — where you stand, in the
   * view's frame — along (fx, fz), the way you look; then moves it onto whole
   * texels of the coarse cascade, counted in the world (ox, oy: where the
   * view's frame sits in the world), so what's in the world keeps to the
   * same texels however you move. dir: toward the light.
   */
  follow(light, dir, x, y, z, fx, fz, ox, oy) {
    let cx = x + fx * NEAR * AHEAD, cy = y, cz = z + fz * NEAR * AHEAD;
    // the map's axes across the light, as the shadow camera's lookAt makes them
    const h = Math.hypot(dir.x, dir.z) || 1;
    const rx = dir.z / h, rz = -dir.x / h;
    const ux = dir.y * rz, uy = dir.z * rx - dir.x * rz, uz = -dir.y * rx;
    const t = 2 * NEAR * RATIO / SIZE;
    const X = (cx + ox) * rx + (cz + oy) * rz, Y = (cx + ox) * ux + cy * uy + (cz + oy) * uz;
    const dX = Math.round(X / t) * t - X, dY = Math.round(Y / t) * t - Y;
    cx += rx * dX + ux * dY; cy += uy * dY; cz += rz * dX + uz * dY;
    light.target.position.set(cx, cy, cz);
    light.position.set(cx + dir.x * DIST, cy + dir.y * DIST, cz + dir.z * DIST);
  }
}
