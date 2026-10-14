// The packed model format shared by tools/glb2prop.mjs and the game
// (render3d/chars/generated.js): positions quantised to 16 bits over the
// model's bounding box (`q` = [x0, y0, z0, step x, step y, step z]), one
// colour per face (the faces are flat-coloured), and no normals (the game
// recomputes the flat face normals). About a quarter the size of raw floats.
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

/** `pos`: 9 floats a face; `faceCol`: 3 bytes a face. */
export function pack(pos, faceCol) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], pos[i]); hi[k] = Math.max(hi[k], pos[i]); }
  const step = lo.map((l, k) => (hi[k] - l) / 65535 || 1e-6);
  const q = new Uint16Array(pos.length);
  for (let i = 0; i < pos.length; i++) { const k = i % 3; q[i] = Math.round((pos[i] - lo[k]) / step[k]); }
  return { faces: pos.length / 9, q: [...lo, ...step].map((v) => +v.toPrecision(9)), pos: b64(q), col: b64(faceCol) };
}
export const packText = (p) => `export default { faces: ${p.faces}, q: ${JSON.stringify(p.q)}, pos: '${p.pos}', col: '${p.col}' };\n`;
