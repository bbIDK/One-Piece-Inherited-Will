// 3D models for static world objects (trees, rocks, bushes, props, landmarks).
// Every builder registers itself with registerPropBuilder (see registry.js);
// the models live in ./props/:
//   kit.js         merged vertex-coloured geometry from primitives (+ outlines)
//   mats.js        the shared cel material (tint, night glow, wind sway), per-frame tick
//   instancer.js   instanced batches per 32 m cell for the common props
//   vegetation.js  trees (every species, with fruit), bushes, rocks
//   street.js      barrels, crates, lamps, lanterns, stalls, wells, fences, tents…
//   landmarks.js   windmills, flags, fountains, fires, bubbles, wheels, lighthouses,
//                  chests, the Bondola, gates, arches, torii, bells, Poneglyphs…
import './props/vegetation.js';
import './props/street.js';
import './props/landmarks.js';
import './props/baratie.js';
import './props/water7.js';
import './props/elbaf.js';

export { instancerStats } from './props/instancer.js';
