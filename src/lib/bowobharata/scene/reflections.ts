import * as THREE from 'three';
import { SKY_FRAGMENT, SKY_VERTEX } from './environment';

export interface Probe {
  /** Re-render the sky into the environment map when the dusk-to-dawn mix has moved on by a step. */
  update(mix: number): void;
  dispose(): void;
}

const STEPS = 6;

/**
 * Lights the scene from the sky itself: the sky shader is rendered once into a cubemap and prefiltered, so gold armour, silver
 * and wet-looking cloth reflect the real sunset (and later the dawn) instead of showing flat colour. It only re-renders when the
 * palette mix has moved by a sixth, so the cost is a handful of small renders over the whole scroll.
 */
export function createProbe(renderer: THREE.WebGLRenderer, scene: THREE.Scene, skyUniforms: Record<string, THREE.IUniform>, size: number): Probe {
  const probeScene = new THREE.Scene();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  probeScene.add(mesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target: THREE.WebGLRenderTarget | undefined;
  let lastStep = -1;
  scene.environmentIntensity = 0.7;

  return {
    update(mix) {
      const step = Math.round(mix * STEPS);
      if (step === lastStep) return;
      lastStep = step;
      const next = pmrem.fromScene(probeScene, 0, 0.1, 400, { size });
      target?.dispose();
      target = next;
      scene.environment = next.texture;
    },
    dispose() {
      scene.environment = null;
      target?.dispose();
      pmrem.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}
