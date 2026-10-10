// Cheaper lighting in every lit shader, patched into three.js's shader chunks
// before anything compiles (like the fog in fog.js): dark point lights cost
// nothing. The street lamps' point lights stay in the scene all day (so no
// shader has to be rebuilt at dusk), and a lit shader now skips a point light
// whose colour is black. The branch is on a uniform, so a whole draw takes the
// same way and the GPU skips the work. (The sun's shadows: sunshadow.js.)
import * as THREE from 'three';

function patch(name, find, fn) {
  const chunk = THREE.ShaderChunk[name];
  const out = fn(chunk);
  if (out === chunk) console.warn(`lighting: ${find} not found in ${name}; left as it is`);
  else THREE.ShaderChunk[name] = out;
}

patch('lights_fragment_begin', 'the point light loop', (chunk) => {
  const a = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  const b = chunk.indexOf('#pragma unroll_loop_end', a);
  const from = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
  const to = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const body = a >= 0 && b > a ? chunk.slice(a, b) : '';
  if (!body.includes(from) || !body.includes(to)) return chunk;
  const gated = body
    .replace(from, 'if ( pointLight.color.r + pointLight.color.g + pointLight.color.b > 0.0 ) {\n\t\t' + from)
    // (and only on the faces turned toward it: toon shading lights a face
    // turned away at 70% — a lamp in a ship's hold shone through her side
    // onto the hull outside, and up through the deck)
    .replace(from, from + '\n\t\tdirectLight.color *= smoothstep( -0.02, 0.12, dot( geometryNormal, directLight.direction ) );')
    .replace(to, to + '\n\t\t}');
  return chunk.slice(0, a) + gated + chunk.slice(b);
});
