import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MODELS } from '../model-credits';
import { facingAngle, fitScale } from './fit';

export interface LoadedModels { horse: GLTF; base: GLTF; human: GLTF }

/**
 * Fetches the three skinned models from this site. Any failure (offline, blocked, corrupt) gives null, and the scene keeps
 * the procedural shapes it already built, so the battle never depends on these files.
 */
export async function loadModels(): Promise<LoadedModels | null> {
  try {
    const loader = new GLTFLoader();
    const [horse, base, human] = await Promise.all([
      loader.loadAsync(MODELS.horse.url),
      loader.loadAsync(MODELS.base.url),
      loader.loadAsync(MODELS.human.url),
    ]);
    return { horse, base, human };
  } catch {
    return null;
  }
}

/** A skinned model placed in the scene: its own skeleton, a mixer to play its clips, and a lookup for bones and materials. */
export interface Rig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  bone(name: string): THREE.Object3D | undefined;
  /** Replaces each material whose name is in `colors` by a copy with that colour, so one source model can be dressed many ways. */
  tint(colors: Record<string, string>, surface?: { roughness?: number; metalness?: number }): void;
  play(name: string, offset?: number, timeScale?: number): THREE.AnimationAction | undefined;
  dispose(): void;
}

export interface FitOptions {
  /** Final height of the model, from the ground to the top of its bounding box. */
  height: number;
  /** Two bone names (tail, head) used to turn the model so it faces +x. Models without them are left as exported. */
  faceBones?: [string, string];
}

/** A fresh, independently animated copy of a loaded model, scaled to `height`, standing on y = 0 and facing +x. */
export function instantiate(gltf: GLTF, o: FitOptions): Rig {
  const root = new THREE.Group();
  const model = cloneSkinned(gltf.scene);
  root.add(model);
  model.updateMatrixWorld(true);

  if (o.faceBones) {
    const a = model.getObjectByName(o.faceBones[0]);
    const b = model.getObjectByName(o.faceBones[1]);
    if (a && b) {
      model.rotation.y = facingAngle(a.getWorldPosition(new THREE.Vector3()), b.getWorldPosition(new THREE.Vector3()));
      model.updateMatrixWorld(true);
    }
  }
  const box = new THREE.Box3().setFromObject(model);
  model.scale.multiplyScalar(fitScale(box.getSize(new THREE.Vector3()).y, o.height));
  model.updateMatrixWorld(true);
  box.setFromObject(model);
  // Standing on y = 0 and centred over the origin, so it can be placed where a procedural shape stood.
  const centre = box.getCenter(new THREE.Vector3());
  model.position.set(model.position.x - centre.x, model.position.y - box.min.y, model.position.z - centre.z);

  model.traverse((m) => {
    const mesh = m as THREE.SkinnedMesh;
    if (mesh.isMesh) mesh.frustumCulled = false; // the rest-pose bounds are wrong once a clip moves the skeleton
  });

  const clips = new Map(gltf.animations.map((c) => [c.name, c]));
  const mixer = new THREE.AnimationMixer(model);
  const owned: THREE.Material[] = [];
  return {
    root,
    mixer,
    clips,
    bone: (name) => model.getObjectByName(name) ?? undefined,
    tint(colors, surface) {
      model.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const swap = (mat: THREE.Material) => {
          const hex = colors[mat.name];
          if (!hex || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return mat;
          const copy = (mat as THREE.MeshStandardMaterial).clone();
          copy.color.set(hex);
          if (surface?.roughness !== undefined) copy.roughness = surface.roughness;
          if (surface?.metalness !== undefined) copy.metalness = surface.metalness;
          owned.push(copy);
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      });
    },
    play(name, offset = 0, timeScale = 1) {
      const clip = clips.get(name);
      if (!clip) return undefined;
      const action = mixer.clipAction(clip);
      action.time = offset;
      action.timeScale = timeScale;
      action.play();
      return action;
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      owned.forEach((m) => m.dispose());
    },
  };
}
