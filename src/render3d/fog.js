// Real-looking atmospheric fog for everything in the 3D view.
//
// three.js's built-in fog is replaced (globally, through its shader chunks)
// with aerial perspective:
//  * exponential height fog: thickest near sea level, thinning with height,
//    integrated along each view ray, so hills rise out of the haze and the
//    far sea melts into the sky;
//  * light scattering: the haze glows warm toward the sun;
//  * a guarantee: the fog is complete at the render distance (scene.fog.far),
//    so terrain, props and ships never visibly pop in or out;
//  * the weather's mists (mist3d.js sets them): a second, much lower layer —
//    windborne sand, blowing snow, the murk of heavy rain — tinted its own
//    colour, thickest at the ground, broken into banks that drift with the
//    wind (two taps of the sky's noise where the ray ends).
//
// Every built-in material with `fog: true` gets it automatically, and so does
// any ShaderMaterial that includes the fog chunks (water, ...). The extra
// uniforms below are shared by all materials through a default
// Material.prototype.onBeforeCompile; a material with its own onBeforeCompile
// still gets the plain distance fog and the render-distance guarantee.
import * as THREE from 'three';

export const FOG = {
  fogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  fogSunColor: { value: new THREE.Color(1, 0.9, 0.75) },
  fogDensity2: { value: 0.0012 }, // extinction per metre at the base height
  fogHeightK: { value: 0.03 }, // how fast it thins with height (per metre)
  fogBase: { value: 0 }, // height of the densest layer (sea level)
  // the weather's mist: x its thickness per metre at the ground, y how fast it
  // thins with height (per metre), z how patchy it is, w how much of it there is
  fogMist: { value: new THREE.Vector4(0, 0.2, 0, 0) },
  fogMistCol: { value: new THREE.Color(0.8, 0.8, 0.8) },
  fogMistBase: { value: 0 }, // the height it lies on (the low ground round you)
  fogMistO: { value: new THREE.Vector4() }, // where the view sits in the world (wrapped), and the drift
  fogNoise: { value: null }, // (the sky's noise: skynoise.js)
};

THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying vec3 vFogRay;
#endif
`;
THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  // the view ray in world orientation (the camera's rotation is orthonormal)
  vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 fogSunDir;
  uniform vec3 fogSunColor;
  uniform float fogDensity2;
  uniform float fogHeightK;
  uniform float fogBase;
  uniform vec4 fogMist;
  uniform vec3 fogMistCol;
  uniform float fogMistBase;
  uniform vec4 fogMistO;
  uniform sampler2D fogNoise;
#endif
`;
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  float fogDist = length(vFogRay);
  vec3 fogDir = vFogRay / max(fogDist, 1e-4);
  // exponential height fog integrated from the eye to this point
  float fogCamH = cameraPosition.y - fogBase;
  float fogKdy = fogHeightK * vFogRay.y;
  float fogHf = abs(fogKdy) > 1e-3 ? (1.0 - exp(-fogKdy)) / fogKdy : 1.0;
  float fogOptical = fogDensity2 * exp(-fogHeightK * max(fogCamH, -40.0)) * fogHf * fogDist;
  float fogFactor = 1.0 - exp(-max(fogOptical, 0.0));
  #ifdef FOG_EXP2
    fogFactor = max(fogFactor, 1.0 - exp(-fogDensity * fogDensity * fogDist * fogDist));
  #else
    // whatever the weather, the edge of the world is always hidden
    fogFactor = max(fogFactor, smoothstep(fogNear, fogFar, fogDist));
  #endif
  // sunlight scattered in the haze
  float fogSun = pow(max(dot(fogDir, fogSunDir), 0.0), 6.0);
  vec3 fogCol = mix(fogColor, fogSunColor, fogSun * 0.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, clamp(fogFactor, 0.0, 1.0));
  // the weather's mist: lying on the low ground round you (fogMistBase),
  // thinning above it, no thicker below it, in drifting banks. Along the ray:
  // the share of it above the floor at its mean density there, the rest at
  // the floor's.
  if (fogMist.w > 0.0) {
    float mH0 = cameraPosition.y - fogMistBase, mH1 = mH0 + vFogRay.y;
    float mA0 = max(mH0, 0.0), mA1 = max(mH1, 0.0);
    float mSpan = abs(mH1 - mH0), mUp = abs(mA1 - mA0);
    float mAbove = mSpan > 1e-3 ? mUp / mSpan : step(0.0, mH0);
    float mMean = mUp > 1e-3 ? (exp(-fogMist.y * min(mA0, mA1)) - exp(-fogMist.y * max(mA0, mA1))) / (fogMist.y * mUp) : exp(-fogMist.y * mA0);
    float mOpt = fogMist.x * (mAbove * mMean + 1.0 - mAbove) * fogDist;
    if (fogMist.z > 0.0) {
      vec2 mP = (cameraPosition.xz + vFogRay.xz + fogMistO.xy) / 96.0 + fogMistO.zw;
      float mN = texture2D(fogNoise, mP).r * 0.6 + texture2D(fogNoise, mP * 3.0 + 0.37).g * 0.4;
      mOpt *= mix(1.0, smoothstep(0.28, 0.72, mN) * 1.9, fogMist.z);
    }
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogMistCol, clamp((1.0 - exp(-mOpt)) * fogMist.w, 0.0, 1.0));
  }
#endif
`;

// share the extra uniforms with every material that doesn't set its own hook
const base = THREE.Material.prototype.onBeforeCompile;
THREE.Material.prototype.onBeforeCompile = function fogUniforms(shader, renderer) {
  if (shader.fragmentShader && shader.fragmentShader.includes('fog_pars_fragment')) Object.assign(shader.uniforms, FOG);
  else if (shader.uniforms && shader.uniforms.fogColor) Object.assign(shader.uniforms, FOG);
  if (base !== fogUniforms) base?.call(this, shader, renderer);
};
