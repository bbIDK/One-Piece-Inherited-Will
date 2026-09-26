// Post-processing for the anime look (on 'high' quality):
//  * ink: dark outlines where depth jumps (silhouettes of hills, trees,
//    houses and people against what's behind them), fading with distance;
//  * grading: a little more saturation and contrast, warm highlights and
//    cool shadows, a soft vignette;
//  * bloom on the brightest things (the sun, glints on the sea, fire, lamps);
//  * FXAA to smooth the edges.
// 'low' quality (phones) skips all of this and renders straight to screen.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const InkGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.08 },
    uFar: { value: 2600 },
    uInk: { value: 1 },
    uInkColor: { value: new THREE.Color(0.16, 0.1, 0.08) },
    uSat: { value: 1.12 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.28 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uRes;
    uniform float uNear, uFar, uInk, uSat, uContrast, uVignette;
    uniform vec3 uInkColor;
    varying vec2 vUv;
    float linDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // ink where the depth jumps, relative to how far away it is
      vec2 px = 1.0 / uRes;
      float d = linDepth(vUv);
      float dl = linDepth(vUv - vec2(px.x, 0.0)), dr = linDepth(vUv + vec2(px.x, 0.0));
      float du = linDepth(vUv + vec2(0.0, px.y)), dd = linDepth(vUv - vec2(0.0, px.y));
      float near = min(min(dl, dr), min(du, dd));
      // only the far side of an edge is inked, so lines hug the nearer object
      float edge = max(0.0, d - near) / max(near, 0.35);
      // …and only where the surface bends or breaks: across a plane 1/depth
      // changes linearly on screen, so its second difference is ~0
      float iz = 1.0 / d;
      float lap = max(abs(1.0 / dl + 1.0 / dr - 2.0 * iz), abs(1.0 / du + 1.0 / dd - 2.0 * iz)) / iz;
      float ink = smoothstep(0.1, 0.35, edge) * smoothstep(0.04, 0.12, lap) * (1.0 - smoothstep(45.0, 160.0, near)) * uInk;
      c.rgb = mix(c.rgb, uInkColor * (0.3 + 0.2 * c.rgb), ink * 0.85);
      // grading (linear light): saturation, contrast, cool shadows / warm highlights
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = max((c.rgb - 0.18) * uContrast + 0.18, 0.0);
      c.rgb *= mix(vec3(0.95, 0.98, 1.05), vec3(1.05, 1.01, 0.95), smoothstep(0.03, 0.5, l));
      // vignette
      vec2 q = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * dot(q, q) * 1.6;
      gl_FragColor = c;
    }
  `,
};

/**
 * Renders the scene into its own target (colour + depth), then draws the
 * inked, graded image into the composer's chain. Keeping the depth texture on
 * a private target avoids feedback loops with the ping-pong buffers.
 */
class SceneInkPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(InkGradeShader.uniforms),
      vertexShader: InkGradeShader.vertexShader,
      fragmentShader: InkGradeShader.fragmentShader,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    this.rt.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
  }

  render(renderer, writeBuffer) {
    const u = this.material.uniforms;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    u.tDiffuse.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() { this.rt.dispose(); this.material.dispose(); this.quad.dispose(); }
}

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.scenePass = new SceneInkPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this.setSize();
  }

  setSize() {
    const r = this.renderer;
    const dpr = r.getPixelRatio();
    const w = r.domElement.clientWidth || window.innerWidth, h = r.domElement.clientHeight || window.innerHeight;
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    this.fxaa.material.uniforms.resolution.value.set(1 / bw, 1 / bh);
  }

  render(camera) {
    this.scenePass.camera = camera;
    this.composer.render();
  }

  dispose() { this.composer.dispose(); }
}
