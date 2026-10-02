// A browser just big enough for the 3D builders to run under Node (see
// tools/zfight.mjs): a canvas whose 2D context accepts every call and draws
// nothing, so signs and name boards build without a screen.
const noop = () => {};
const ctx2d = () => {
  const t = {};
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0)) * 4), width: w, height: h });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return () => ({ addColorStop: noop });
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
const element = (tag) => {
  const el = { tagName: String(tag).toUpperCase(), width: 1, height: 1, style: {}, children: [], dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
  el.getContext = () => el._ctx || (el._ctx = Object.assign(ctx2d(), { canvas: el }));
  el.toDataURL = () => 'data:,';
  el.addEventListener = noop; el.removeEventListener = noop;
  el.appendChild = (c) => { el.children.push(c); return c; };
  el.setAttribute = noop; el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1, height: 1 });
  return el;
};
globalThis.window = globalThis;
globalThis.document = { createElement: element, createElementNS: (ns, tag) => element(tag), body: element('body'), head: element('head'), getElementById: () => null, addEventListener: noop };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = () => 0;
globalThis.Image = class { constructor() { this.width = 1; this.height = 1; } addEventListener() {} };
globalThis.OffscreenCanvas = class { constructor(w, h) { return Object.assign(element('canvas'), { width: w, height: h }); } };
globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} roundRect() {} bezierCurveTo() {} quadraticCurveTo() {} ellipse() {} addPath() {} };
