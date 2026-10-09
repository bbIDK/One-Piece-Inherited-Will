// The world is a planet: the chart is its whole surface (24,576 m round the
// equator, wrapping east–west; 12,288 m from pole to pole — the proportions of
// a sphere's map), so the ground falls away from you as it would on a ball
// that size. Everything is drawn bent down by d² / 2R, d its distance across
// the surface from you, R the planet's radius (its circumference / 2π, about
// 3.9 km): a ship sailing off sinks hull-first below the horizon, masts last;
// an island ahead rises out of the sea as you near it.
//
// The bend is put into three.js's shared vertex chunks (as lighting.js and
// sunshadow.js patch theirs), before anything compiles, in world space round
// the view's origin — which is always where you are (the world is drawn about
// a floating origin) — so it's the same in every pass: the shadow map bends
// as the scene does, and shadows land where they're cast. Shaders of our own
// (the sea) apply curveY themselves.
import * as THREE from 'three';
import { W } from '../world/constants.js';

/** The planet's radius (m) and the bend's coefficient: drop = k · d². */
export const PLANET_R = W / (2 * Math.PI);
export const CURVE_K = 1 / (2 * PLANET_R);

/** How far below the flat a point d metres off lies (m). */
export const curveDrop = (d) => d * d * CURVE_K;

/** GLSL: the bend's coefficient, and a statement bending world-space position `p` (relative to the view's origin) down with the planet. */
export const CURVE_K_GLSL = CURVE_K.toExponential(6);
export const curveStmt = (p) => `${p}.y -= dot(${p}.xz, ${p}.xz) * ${CURVE_K_GLSL};`;

function patch(name, find, repl) {
  const chunk = THREE.ShaderChunk[name];
  if (!chunk.includes(find)) { console.warn(`curvature: ${find} not found in ${name}`); return; }
  THREE.ShaderChunk[name] = chunk.replace(find, repl);
}

patch('project_vertex', 'mvPosition = modelViewMatrix * mvPosition;',
  `mvPosition = modelMatrix * mvPosition; ${curveStmt('mvPosition')} mvPosition = viewMatrix * mvPosition;`);
patch('worldpos_vertex', 'worldPosition = modelMatrix * worldPosition;',
  `worldPosition = modelMatrix * worldPosition; ${curveStmt('worldPosition')}`);
