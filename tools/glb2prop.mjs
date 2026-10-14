// Turn a generated GLB model (Meshy / Higgsfield 3D) into a game prop:
//
//   node tools/glb2prop.mjs <in.glb> <name> [--height=1] [--faces=4000]
//   weapons: [--rot=x,y,z (degrees, applied first)] --length=0.95 --grip=0.11
//            (laid along +X, the hilt end at -X, `length` long, the origin `grip` of the way from the hilt end)
//
// The game draws props as merged, instanced, cel-shaded geometry coloured per
// vertex (props/kit.js Mesher) — not textured meshes. So the model's base
// colour texture is baked into flat per-face colours (sampled over each
// triangle, gently posterised toward the anime palette), its size normalised
// (standing on y = 0, centred, `height` tall), and written to
// src/assets/models/<name>.js in the packed format of tools/modelpack.mjs that render3d/chars/generated.js
// turns back into a BufferGeometry. The texture image is decoded in the
// bundled Chromium (no image libraries needed here).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { pack, packText } from './modelpack.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [inPath, name, ...rest] = process.argv.slice(2);
if (!inPath || !name) { console.error('usage: node tools/glb2prop.mjs <in.glb> <name> [--height=1] [--faces=4000]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const HEIGHT = +(opt.height || 1), MAX_FACES = +(opt.faces || 4000);

// ---- read the GLB container
const buf = readFileSync(inPath);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
  const n = SIZE[a.type], start = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || 0;
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const out = new Float64Array(a.count * n);
  const el = T.BYTES_PER_ELEMENT, step = stride || n * el;
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
    const p = start + k * step + c * el;
    out[k * n + c] = el === 4 ? (a.componentType === 5126 ? dv.getFloat32(p, true) : dv.getUint32(p, true)) : el === 2 ? dv.getUint16(p, true) : dv.getUint8(p);
    if (a.normalized && a.componentType !== 5126) out[k * n + c] /= el === 2 ? 65535 : 255;
  }
  return out;
}

// ---- node transforms (meshes may sit under a scaled / rotated node)
const mat4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const prims = [];
function walk(ni, parent) {
  const n = json.nodes[ni], M = mul(parent, trs(n));
  if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) prims.push({ p, M });
  for (const c of n.children || []) walk(c, M);
}
for (const ni of json.scenes[json.scene || 0].nodes) walk(ni, mat4());

// ---- decode every base-colour texture in Chromium
const images = {};
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage();
  for (const { p } of prims) {
    const m = json.materials?.[p.material];
    const ti = m?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (ti === undefined || images[ti]) continue;
    const img = json.images[json.textures[ti].source], bv = json.bufferViews[img.bufferView];
    const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const b64 = Buffer.from(bytes).toString('base64');
    images[ti] = await page.evaluate(async ([b64, mime]) => {
      const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      // (a quarter-size copy is plenty to read a face's colour from)
      const w = Math.max(64, bmp.width >> 2), h = Math.max(64, bmp.height >> 2);
      const cv = new OffscreenCanvas(w, h), cx = cv.getContext('2d');
      cx.drawImage(bmp, 0, 0, w, h);
      return { w, h, data: Array.from(cx.getImageData(0, 0, w, h).data) };
    }, [b64, img.mimeType || 'image/png']);
  }
} finally { await browser.close(); }

// ---- gather triangles with a colour each
const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const tris = [];
for (const { p, M } of prims) {
  const P = accessor(p.attributes.POSITION), UV = p.attributes.TEXCOORD_0 !== undefined ? accessor(p.attributes.TEXCOORD_0) : null;
  const I = p.indices !== undefined ? accessor(p.indices) : Float64Array.from({ length: P.length / 3 }, (_, i) => i);
  const m = json.materials?.[p.material], pbr = m?.pbrMetallicRoughness || {};
  const fac = pbr.baseColorFactor || [1, 1, 1, 1], tex = images[pbr.baseColorTexture?.index];
  const vtx = (i) => { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; };
  const sample = (u, v) => {
    if (!tex) return [1, 1, 1];
    u -= Math.floor(u); v -= Math.floor(v);
    const x = Math.min(tex.w - 1, Math.floor(u * tex.w)), y = Math.min(tex.h - 1, Math.floor(v * tex.h)), k = (y * tex.w + x) * 4;
    return [tex.data[k] / 255, tex.data[k + 1] / 255, tex.data[k + 2] / 255];
  };
  for (let t = 0; t < I.length; t += 3) {
    const ids = [I[t], I[t + 1], I[t + 2]];
    // (the face's colour: its corners and middle, averaged — a flat cel patch)
    let r = 0, g = 0, b = 0, n = 0;
    if (UV) {
      const uv = ids.map((i) => [UV[i * 2], UV[i * 2 + 1]]);
      const pts = [...uv, [(uv[0][0] + uv[1][0] + uv[2][0]) / 3, (uv[0][1] + uv[1][1] + uv[2][1]) / 3]];
      for (const [u, v] of pts) { const c = sample(u, v); r += c[0]; g += c[1]; b += c[2]; n++; }
    } else { r = g = b = n = 1; }
    tris.push({ v: ids.map(vtx), c: [srgb2lin((r / n) * fac[0]), srgb2lin((g / n) * fac[1]), srgb2lin((b / n) * fac[2])] });
  }
}
// ---- too dense for a prop placed hundreds of times: simplify by clustering
// vertices on a grid (coarser until it fits), dropping the triangles that
// collapse, a face keeping its own colour — the chunky low-poly read the
// cel shading wants anyway
function cluster(src, n) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of src) for (const v of t.v) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / n;
  const cells = new Map(), key = (v) => v.map((x, k) => Math.floor((x - lo[k]) / span)).join(',');
  for (const t of src) for (const v of t.v) { const k = key(v), c = cells.get(k) || [0, 0, 0, 0]; c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; c[3]++; cells.set(k, c); }
  const at = (v) => { const c = cells.get(key(v)); return [c[0] / c[3], c[1] / c[3], c[2] / c[3]]; };
  const out = [], seen = new Set();
  for (const t of src) {
    const ks = t.v.map(key);
    if (ks[0] === ks[1] || ks[1] === ks[2] || ks[0] === ks[2]) continue;
    const id = [...ks].sort().join('|');
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ v: t.v.map(at), c: t.c });
  }
  return out;
}
let simple = tris;
for (let n = +(opt.grid || 64); simple.length > MAX_FACES && n >= 8; n = Math.floor(n * 0.9)) simple = cluster(tris, n);
if (simple.length !== tris.length) console.log(`simplified ${tris.length} → ${simple.length} faces`);
tris.length = 0; tris.push(...simple);

// ---- optional turn first (degrees, XYZ)
if (opt.rot) {
  const [ax, ay, az] = opt.rot.split(',').map((d) => (+d * Math.PI) / 180);
  const rx = ([x, y, z]) => [x, y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
  const ry = ([x, y, z]) => [x * Math.cos(ay) + z * Math.sin(ay), y, -x * Math.sin(ay) + z * Math.cos(ay)];
  const rz = ([x, y, z]) => [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az), z];
  for (const t of tris) t.v = t.v.map((v) => rz(ry(rx(v))));
}
// ---- normalise: standing on y = 0, centred, HEIGHT tall (or, for a weapon, along +X)
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const t of tris) for (const v of t.v) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]); }
const LEN = opt.length ? +opt.length : 0, GRIP = +(opt.grip || 0);
const s = LEN ? LEN / (hi[0] - lo[0]) : HEIGHT / (hi[1] - lo[1]), cx = LEN ? lo[0] + GRIP * (hi[0] - lo[0]) : (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
const cy = LEN ? (+opt.gripy || 0) : lo[1];
const pos = new Float32Array(tris.length * 9), col = new Uint8Array(tris.length * 3);
tris.forEach((t, i) => {
  const v = t.v.map(([x, y, z]) => [(x - cx) * s, (y - cy) * s, (z - cz) * s]);
  for (let k = 0; k < 3; k++) pos.set(v[k], i * 9 + k * 3);
  col.set(t.c.map((c) => Math.round(Math.min(1, c) * 255)), i * 3);
});
const outDir = join(root, 'src/assets/models');
mkdirSync(outDir, { recursive: true });
const text = `// Generated by tools/glb2prop.mjs from ${inPath.split('/').pop()} — ${tris.length} faces, ${HEIGHT} tall. Do not edit.\n` + packText(pack(pos, col));
writeFileSync(join(outDir, `${name}.js`), text);
console.log(`${name}: ${tris.length} faces, ${(text.length / 1024).toFixed(0)} KB`);
