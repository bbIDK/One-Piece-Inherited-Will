// 3D models for static world objects (trees, rocks, bushes, props, landmarks).
// Every builder registers itself with registerPropBuilder (see registry.js);
// the models live in ./props/:
//   kit.js         merged vertex-coloured geometry from primitives (+ outlines)
//   mats.js        the shared cel material (tint, night glow, wind sway), per-frame tick
//   instancer.js   instanced batches per 32 m cell for the common props
//   vegetation.js  trees (every species, with fruit), bushes, rocks
import './props/vegetation.js';

export { tick as tickProps } from './props/mats.js';
export { instancerStats } from './props/instancer.js';
