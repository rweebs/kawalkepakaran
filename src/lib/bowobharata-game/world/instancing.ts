// Instanced meshes as the game's layers make them: empty and hidden under a fixed cap until a frame fills them, and a
// fade of their own for each instance. Every layer that fades its instances this way shares one shader program.
import * as THREE from 'three';

/** An instanced mesh of at most `cap` instances under `parent`: it draws none, and is hidden, until a layer sets its count. */
export function instanced(parent: THREE.Object3D, name: string, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.name = name;
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

/** Gives a geometry its per-instance opacity, `aFade` (0 to 1), or another geometry's to share. */
export function fadeOn(geo: THREE.BufferGeometry, cap: number, shared?: THREE.InstancedBufferAttribute): THREE.InstancedBufferAttribute {
  const attr = shared ?? new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  geo.setAttribute('aFade', attr);
  return attr;
}

/** The program cache key of every material `fading` patches: the patch is one, so the programs are shared. */
export const FADE_KEY = 'instance-fade';

/**
 * Lets each instance fade on its own: the geometry's instanced `aFade` (0 to 1) multiplies the material's alpha. Every
 * geometry drawn with such a material carries the attribute (fadeOn).
 */
export function fading<T extends THREE.Material>(mat: T): T {
  mat.transparent = true;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => FADE_KEY;
  return mat;
}
