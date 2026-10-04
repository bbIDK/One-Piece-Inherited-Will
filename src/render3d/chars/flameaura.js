// A fighting aura as the anime draws it (Luffy's blaze against Kaido; the
// flat, flame-edged auras round a fighter in JoJo): the figure's own outline
// grown outward — not a capsule round it — a band of flat colour hugging the
// body, torn at its edge into tongues of flame that lick upward and flicker,
// white-hot where it meets the body, the aura's colour out to a darker rim.
//
// Two inverted hulls on the body (the way its ink line is drawn: the body's
// back faces pushed out along its normals, mats.js outlineMaterial): the outer
// in the aura's colour, its thickness swelling and its edge cut by noise that
// rises with time into flame tongues (taller over the shoulders and head),
// and an inner, thinner one white-hot. Drawn behind the body, so they only
// show round its silhouette — the body itself stays as it is.
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

/** One hull: `inner` the white-hot core (thin, steady), else the coloured flame. */
function flameMaterial(inner) {
  const u = {
    uTime: { value: 0 }, uThick: { value: 0.06 }, uLift: { value: 0.3 }, uCol: { value: new THREE.Color() }, uRim: { value: new THREE.Color() },
    uK: { value: 1 }, uHip: { value: 0.9 }, uBack: { value: 0.7 },
  };
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false });
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uThick, uLift, uK, uHip, uBack;
varying vec3 vFaP;
varying float vFaLift;
${NOISE}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
{
#ifdef USE_SKINNING
  vec3 onrm = normalize( objectNormal );
#else
  vec3 onrm = normalize( normal );
#endif
  vFaP = transformed;
  // a thin band round the body; off whatever faces up (the head, the
  // shoulders, the tops of the arms) the flames rise — most off the head and
  // shoulders — breathing as the noise under them rises
  float up = smoothstep( -0.1, 0.8, onrm.y );
  float hi = smoothstep( uHip * 0.7, uHip * 1.8, transformed.y );
  float sw = faN( transformed * 2.2 + vec3( 0.0, -uTime * 1.8, uTime * 0.3 ) );
  float lift = up * ( 0.3 + 0.7 * hi ) * ( 0.45 + 0.55 * sw );
  vFaLift = lift;
  transformed += onrm * uThick * uK * ( ${inner ? '0.32 + 0.08 * sw' : '0.85 + 0.35 * sw'} );
  transformed.y += uLift * uK * lift * ${inner ? '0.12' : '1.0'};
}`)
      // (back along the line of sight, behind the whole body: the same place
      // on screen, but the body always in front of it — it only ever shows
      // round the figure's outline, never over an arm or across the chest)
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
uniform vec3 uCol, uRim;
varying vec3 vFaP;
varying float vFaLift;
${NOISE}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  // flame tongues: noise stretched upward and rising, cut against a
  // threshold that climbs with height into the flame — so the higher up it
  // is the less survives, and each tongue tapers to a point (a flame's apex)
  // that flickers and breaks off as the noise rises through it
  vec3 q = vec3( vFaP.x * 3.4, vFaP.y * 1.5 - uTime * ${inner ? '2.6' : '3.4'}, vFaP.z * 3.4 );
  float n = faN( q ) * 0.75 + faN( q * 2.2 + 7.1 ) * 0.25;
  float cut = ${inner ? '0.08 + 0.7' : '0.22 + 0.62'} * vFaLift;
  if ( n < cut || uK < 0.01 ) discard;
  ${inner
    ? 'vec4 diffuseColor = vec4( mix( uCol, vec3( 1.0 ), 0.75 ) * 1.1, uK );'
    : 'float edge = step( cut + 0.07, n );\n  vec4 diffuseColor = vec4( mix( uRim, uCol, edge ), uK );'}`);
  };
  m.customProgramCacheKey = () => 'op-flame-aura-3-' + (inner ? 'in' : 'out');
  return m;
}

export class FlameAura {
  /** On a character model (chars/model.js): two hulls sharing its body and skeleton. */
  constructor(model) {
    this.model = model;
    this.outerMat = flameMaterial(false);
    this.innerMat = flameMaterial(true);
    this.outer = new THREE.SkinnedMesh(model.body.geo, this.outerMat);
    this.inner = new THREE.SkinnedMesh(model.body.geo, this.innerMat);
    for (const h of [this.outer, this.inner]) {
      h.bind(model.skeleton, IDENT);
      h.boundingSphere = model.mesh.boundingSphere;
      h.castShadow = false; h.receiveShadow = false;
    }
    // (the core over the blaze, both behind the body: they're back faces)
    this.outer.renderOrder = 1; this.inner.renderOrder = 2;
    model.group.add(this.outer, this.inner);
    this.color = null;
    this.k = 0;
  }

  /** css colour (its alpha how strong), the time, the body's hip height and build (for the size of it). */
  set(color, t, hip, bulk = 1) {
    if (color !== this.color) {
      this.color = color;
      const c = parse(color);
      const U = this.outerMat.userData.u, I = this.innerMat.userData.u;
      U.uCol.value.copy(c.c);
      // (the rim a deeper, more saturated shade of it; near-black auras keep a coloured rim — the king's colour)
      U.uRim.value.copy(c.c).multiplyScalar(c.dark ? 1.8 : 0.55);
      if (c.dark) U.uRim.value.lerp(new THREE.Color(0.85, 0.05, 0.12), 0.5);
      I.uCol.value.copy(c.dark ? new THREE.Color(0.75, 0.1, 0.2) : c.c);
      this.k = Math.min(1, 0.55 + c.a * 0.45);
    }
    for (const m of [this.outerMat, this.innerMat]) {
      const u = m.userData.u;
      u.uTime.value = t; u.uK.value = this.k; u.uHip.value = hip;
      u.uThick.value = 0.06 * Math.max(0.8, bulk);
      u.uLift.value = 0.3 * Math.max(0.8, bulk);
      u.uBack.value = 0.75 * Math.max(0.8, bulk);
    }
  }

  set visible(v) { this.outer.visible = this.inner.visible = v; }
  dispose() { this.model.group.remove(this.outer, this.inner); this.outerMat.dispose(); this.innerMat.dispose(); }
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
