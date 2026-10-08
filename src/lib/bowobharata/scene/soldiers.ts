import * as THREE from 'three';
import { instantiate, type LoadedModels } from './models';
import { bakeVat, vatMaterial, type Bake } from './vat';
import { texelOf } from './vat-math';

/** The clips baked into the soldier, in the order the shader's aClip indexes them. */
export const SOLDIER_CLIPS = ['Walk', 'Idle', 'Punch', 'Run'] as const;
export const CLIP = { walk: 0, idle: 1, punch: 2, run: 3 } as const;
const FRAMES: Record<string, number> = { Walk: 12, Idle: 8, Punch: 12, Run: 12 };

/** Everything needed to draw as many real soldiers as wanted: the baked animation, its material, and a flat, unskinned mesh. */
export interface SoldierKit {
  bake: Bake;
  material: THREE.MeshStandardMaterial;
  geometry: THREE.BufferGeometry;
  dispose(): void;
}

/**
 * Bakes the loaded soldier's Walk, Idle, Punch and Run into textures, once, and builds the unskinned geometry the instanced
 * meshes share (each vertex only needs to know its own index, aVid, to find its place in the textures). Null if the model
 * is not what was expected, in which case the procedural soldiers stay.
 */
export function prepareSoldiers(models: LoadedModels, uTime: { value: number }): SoldierKit | null {
  return prepareKit(models.human, uTime, SOLDIER_SPEC);
}

/** What to bake from one model and how to draw it. */
interface KitSpec {
  clips: readonly string[];
  frames: Record<string, number>;
  height: number;
  /** Tail-to-head (or heel-to-toe) bones that say which way the model faces. */
  faceBones: [string, string];
  skin: boolean;
  travel?: { speed: number; span: number };
  roughness: number;
  metalness: number;
}

const SOLDIER_SPEC: KitSpec = { clips: SOLDIER_CLIPS, frames: FRAMES, height: 1.8, faceBones: ['LeftFoot', 'LeftToeBase'], skin: true, roughness: 0.7, metalness: 0.25 };
// The cavalry's horse gallops in place and charges across a run of twelve units, the same run and speed as its rider.
const HORSE_SPEC: KitSpec = { clips: ['Gallop'], frames: { Gallop: 14 }, height: 2.1, faceBones: ['Tail1', 'Head'], skin: false, travel: { speed: 7, span: 12 }, roughness: 0.6, metalness: 0.05 };

function prepareKit(gltf: LoadedModels['human'], uTime: { value: number }, spec: KitSpec): SoldierKit | null {
  const rig = instantiate(gltf, { height: spec.height, faceBones: spec.faceBones });
  let skinned: THREE.SkinnedMesh | undefined;
  rig.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
  const clips = spec.clips.map((n) => rig.clips.get(n));
  if (!skinned || clips.some((c) => !c)) { rig.dispose(); return null; }
  const mesh: THREE.SkinnedMesh = skinned;

  rig.mixer.stopAllAction();
  const bake = bakeVat(rig.root, mesh, clips as THREE.AnimationClip[], spec.frames);
  rig.dispose();

  const n = bake.vertexCount;
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const vid = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const { x, y } = texelOf(bake.layout, v, 0);
    const i = (y * bake.layout.width + x) * 4;
    position.set([bake.positions[i], bake.positions[i + 1], bake.positions[i + 2]], v * 3);
    normal.set([bake.normals[i], bake.normals[i + 1], bake.normals[i + 2]], v * 3);
    vid[v] = v;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('aVid', new THREE.BufferAttribute(vid, 1));
  const index = mesh.geometry.getIndex();
  if (index) geometry.setIndex(index.clone());

  const { material, textures } = vatMaterial(uTime, bake, spec.clips, { roughness: spec.roughness, metalness: spec.metalness, skin: spec.skin, travel: spec.travel });
  return {
    bake, material, geometry,
    dispose() { material.dispose(); textures.pos.dispose(); textures.nor.dispose(); geometry.dispose(); },
  };
}

const kits = new WeakMap<LoadedModels, SoldierKit | null>();

/** The baked soldier for these loaded models, made the first time anyone asks and shared after that. */
export function getSoldierKit(models: LoadedModels, uTime: { value: number }): SoldierKit | null {
  if (!kits.has(models)) kits.set(models, prepareSoldiers(models, uTime));
  return kits.get(models) ?? null;
}

const horseKits = new WeakMap<LoadedModels, SoldierKit | null>();

/** The baked galloping horse for the cavalry, made on first use and shared after that. Its rider travels in step (see travel.ts). */
export function getHorseKit(models: LoadedModels, uTime: { value: number }): SoldierKit | null {
  if (!horseKits.has(models)) horseKits.set(models, prepareKit(models.horse, uTime, HORSE_SPEC));
  return horseKits.get(models) ?? null;
}

export interface SoldierSpot { x: number; z: number; rotY: number; phase: number; clip: number; color: THREE.Color }

/** One instanced draw call of real soldiers at the given spots, each standing on the ground and out of step with the next. */
export function soldierMesh(kit: SoldierKit, spots: readonly SoldierSpot[], groundAt: (x: number, z: number) => number): THREE.InstancedMesh {
  const geometry = kit.geometry.clone();
  const phase = new Float32Array(spots.length);
  const clip = new Float32Array(spots.length);
  const mesh = new THREE.InstancedMesh(geometry, kit.material, spots.length);
  const d = new THREE.Object3D();
  spots.forEach((s, i) => {
    d.position.set(s.x, groundAt(s.x, s.z), s.z);
    d.rotation.set(0, s.rotY, 0);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, s.color);
    phase[i] = s.phase;
    clip[i] = s.clip;
  });
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geometry.setAttribute('aClip', new THREE.InstancedBufferAttribute(clip, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; // the shader moves the vertices, so the rest-pose bounds mean nothing
  return mesh;
}
