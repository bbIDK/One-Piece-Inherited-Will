// A fighting aura as the anime draws it (the flat, flame-edged auras round a
// fighter in JoJo — Josuke's, Giorno's — and Luffy's blaze against Kaido):
// the figure's own outline grown outward, a band of flat colour hugging the
// body, bright where it meets the body and the aura's colour out to its
// edge, the edge frayed into small tongues of flame that run up along the
// outline like waves — the shape itself never moves; only the flames do.
//
// Five nested inverted hulls on the body (the way its ink line is drawn:
// the body's back faces pushed out along its normals), each a little
// thicker, drawn outermost first: the inner ones whole and bright, the outer
// ones cut by noise rising up the body, more of each cut away the further
// out it is — so the tongues taper to points and climb. All of them are
// pushed back along the line of sight behind the body, which covers them:
// the aura only shows round the silhouette, never over an arm or the chest.
import * as THREE from 'three';

const IDENT = new THREE.Matrix4();

const NOISE = `
float faH( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float faN( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( faH( i ), faH( i + vec3( 1, 0, 0 ) ), f.x ), mix( faH( i + vec3( 0, 1, 0 ) ), faH( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( faH( i + vec3( 0, 0, 1 ) ), faH( i + vec3( 1, 0, 1 ) ), f.x ), mix( faH( i + vec3( 0, 1, 1 ) ), faH( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`;

// the layers, inside out: how far out (of the aura's full width), how much of it the flames cut away, its shade
// (0: white-hot, 1: light, 2: the colour, 3: its deep edge)
const LAYERS = [
  { out: 0.3, cut: 0.0, shade: 0 },
  { out: 0.48, cut: 0.2, shade: 1 },
  { out: 0.66, cut: 0.4, shade: 2 },
  { out: 0.84, cut: 0.56, shade: 2 },
  { out: 1.0, cut: 0.7, shade: 3 },
];

/** One layer of the aura: thickness `out` of its width, `cut` of it eaten by the rising flame noise. */
function layerMaterial(L) {
  const u = {
    uTime: { value: 0 }, uThick: { value: 0.08 }, uCol: { value: new THREE.Color() }, uK: { value: 1 }, uBack: { value: 0.7 },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
  m.userData.u = u;
  // flame tongues running up the outline: noise long and narrow, rising (the
  // innermost layer whole; each one out from it eaten away more)
  const frag = L.cut > 0 ? `
  vec3 q = vec3( vFaP.x * 7.0, vFaP.y * 2.6 - uTime * 2.2, vFaP.z * 7.0 );
  float n = faN( q ) * 0.7 + faN( q * 2.03 + vec3( 3.1, -uTime * 1.3, 7.7 ) ) * 0.3;
  if ( n < ${L.cut.toFixed(3)} - 0.06 * vFaUp || uK < 0.01 ) discard;
  vec4 diffuseColor = vec4( uCol, uK );` : `
  if ( uK < 0.01 ) discard;
  vec4 diffuseColor = vec4( uCol, uK );`;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uThick, uK, uBack;
varying vec3 vFaP;
varying float vFaUp;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
{
#ifdef USE_SKINNING
  vec3 onrm = normalize( objectNormal );
#else
  vec3 onrm = normalize( normal );
#endif
  vFaP = transformed;
  float up = smoothstep( -0.1, 0.9, onrm.y );
  vFaUp = up;
  // (a steady width, never moving — a little thinner over the head and shoulders, so it doesn't sit on them like a hood)
  transformed += onrm * uThick * uK * ${L.out.toFixed(3)} * ( 1.0 - 0.35 * up );
}`)
      // (back along the line of sight, behind the whole body: the same place
      // on screen, but the body always in front of it)
      .replace('#include <project_vertex>', `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelViewMatrix * mvPosition;
  {
    float zz = max( -mvPosition.z, 0.1 );
    mvPosition.xyz *= ( zz + uBack ) / zz;
  }
  gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uK;
uniform vec3 uCol;
varying vec3 vFaP;
varying float vFaUp;
${NOISE}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', frag);
  };
  m.customProgramCacheKey = () => 'op-aura-layer-' + L.out;
  return m;
}

export class FlameAura {
  /** On a character model (chars/model.js): the layers, sharing its body and skeleton. */
  constructor(model) {
    this.model = model;
    this.mats = LAYERS.map(layerMaterial);
    this.meshes = this.mats.map((mat, i) => {
      const h = new THREE.SkinnedMesh(model.body.geo, mat);
      h.bind(model.skeleton, IDENT);
      h.boundingSphere = model.mesh.boundingSphere;
      h.castShadow = false; h.receiveShadow = false;
      // (outermost first: each layer in from it drawn over it)
      h.renderOrder = 1 + (LAYERS.length - 1 - i) * 0.01;
      return h;
    });
    // draw order: outer layers before inner ones
    this.meshes.slice().reverse().forEach((h, k) => { h.renderOrder = 1 + k * 0.01; });
    model.group.add(...this.meshes);
    this.color = null;
    this.k = 0;
  }

  /** css colour (its alpha how strong), the time, the body's hip height and build (for the width of it). */
  set(color, t, hip, bulk = 1) {
    if (color !== this.color) {
      this.color = color;
      const c = parse(color);
      // the shades, inside out: white-hot, light, the colour, its deep edge (a near-black aura keeps its king's colour inside)
      const base = c.c, white = new THREE.Color(1, 1, 1);
      const inner = c.dark ? new THREE.Color(0.9, 0.12, 0.22) : base.clone().lerp(white, 0.78);
      const light = c.dark ? new THREE.Color(0.45, 0.04, 0.1) : base.clone().lerp(white, 0.4);
      const deep = c.dark ? new THREE.Color(0.01, 0.0, 0.015) : base.clone().multiplyScalar(0.72);
      const shades = [inner, light, base, deep];
      LAYERS.forEach((L, i) => this.mats[i].userData.u.uCol.value.copy(shades[L.shade]));
      this.k = Math.min(1, 0.6 + c.a * 0.4);
    }
    const w = 0.075 * Math.max(0.8, bulk);
    for (const m of this.mats) {
      const u = m.userData.u;
      u.uTime.value = t; u.uK.value = this.k; u.uThick.value = w; u.uBack.value = 0.75 * Math.max(0.8, bulk);
    }
    void hip;
  }

  set visible(v) { for (const h of this.meshes) h.visible = v; }
  dispose() { this.model.group.remove(...this.meshes); for (const m of this.mats) m.dispose(); }
}

/** A css colour ('#rrggbb' or rgba()) → { c (linear), a, dark }. */
function parse(css) {
  let a = 1, c;
  const m = /rgba?\(([^)]+)\)/.exec(css || '');
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    c = new THREE.Color().setRGB(p[0] / 255, p[1] / 255, p[2] / 255, THREE.SRGBColorSpace);
    if (p.length > 3) a = p[3];
  } else c = new THREE.Color(css || '#ffffff');
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return { c, a, dark: lum < 0.03 };
}
