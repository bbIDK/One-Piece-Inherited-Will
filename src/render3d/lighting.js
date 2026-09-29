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
    .replace(to, to + '\n\t\t}');
  return chunk.slice(0, a) + gated + chunk.slice(b);
});
