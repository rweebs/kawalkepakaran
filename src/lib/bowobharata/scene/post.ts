import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FX_LAYER } from './effects';
import type { Effects } from './quality';

// The look of the poster: teal in the shadows, gold in the highlights, a soft vignette and a little film grain.
const GRADE = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uMix: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uMix; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadow = vec3(0.9, 1.02, 1.06);
      vec3 high = vec3(1.08, 1.0, 0.88);
      c *= mix(shadow, high, smoothstep(0.08, 0.9, l));
      vec2 d = vUv - 0.5;
      float vig = smoothstep(0.95, 0.3, length(d * vec2(1.0, 0.85)));
      c *= mix(0.84, 1.0, vig);
      float g = fract(sin(dot(vUv * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      c += g * 0.016 * (1.0 - uMix * 0.4);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export interface Post {
  render(): void;
  setSize(w: number, h: number): void;
  setEffects(fx: Effects): void;
  /** Focus distance and blur amount (0..1) for this frame, the clock, and the dharma palette mix. */
  setShot(focus: number, dofAmount: number, time: number, mix: number): void;
  dispose(): void;
}

/** The post-processing chain. Each effect can be switched off on its own, which is how the frame-rate fallback sheds cost. */
export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, fx: Effects): Post {
  const composer = new EffectComposer(renderer);
  const colour = new RenderPass(scene, camera);
  composer.addPass(colour);
  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.55, 0.82);
  composer.addPass(bloom);
  const bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.0006, maxblur: 0.008 });
  composer.addPass(bokeh);
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // Only the colour pass draws glows, blobs, shafts and dust. The occlusion and depth-of-field passes re-render the scene with a
  // flat material, which turns each sprite into a solid, slanted quad, so they render with that layer off.
  const showEffectsIn = (pass: { render: (...args: never[]) => void }, show: boolean) => {
    const render = pass.render.bind(pass) as (...args: unknown[]) => void;
    (pass as unknown as { render: (...args: unknown[]) => void }).render = (...args) => {
      if (show) camera.layers.enable(FX_LAYER);
      else camera.layers.disable(FX_LAYER);
      render(...args);
    };
  };
  showEffectsIn(colour, true);
  showEffectsIn(ao, false);
  showEffectsIn(bokeh, false);

  let wantDof = fx.dof;
  const apply = (e: Effects) => { ao.enabled = e.ao; bloom.enabled = e.bloom; wantDof = e.dof; };
  apply(fx);

  return {
    render: () => composer.render(),
    setSize(w, h) { composer.setSize(w, h); },
    setEffects: apply,
    setShot(focus, dofAmount, time, mix) {
      bokeh.enabled = wantDof && dofAmount > 0.03;
      const u = bokeh.uniforms as Record<string, { value: number }>;
      u.focus.value = focus;
      u.aperture.value = 0.0006 * dofAmount;
      grade.uniforms.uTime.value = time % 100;
      grade.uniforms.uMix.value = mix;
    },
    dispose() {
      ao.dispose();
      bloom.dispose();
      bokeh.dispose();
      composer.dispose();
    },
  };
}
