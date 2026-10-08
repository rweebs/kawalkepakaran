import * as THREE from 'three';
import { heightField, normalFromHeight, weaveField } from './texturegen';

/** Tileable normal maps that give flat colours a surface: drawn from noise at runtime, never loaded from a file. */
export interface Detail {
  terrain: THREE.DataTexture;
  cloth: THREE.DataTexture;
  wood: THREE.DataTexture;
  metal: THREE.DataTexture;
}

function normalTexture(field: Float32Array, size: number, strength: number, repeatX: number, repeatY: number, anisotropy: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(normalFromHeight(field, size, strength), size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** `size` is the texture edge in pixels: 256 on desktop, 128 on phones. */
export function createDetail(size: number): Detail {
  const aniso = size >= 256 ? 4 : 2;
  return {
    // Ground: broad undulation plus fine grit, repeated across the field.
    terrain: normalTexture(heightField(size, 11, 4, 5), size, 4.5, 90, 90, aniso),
    cloth: normalTexture(weaveField(size, 24), size, 2.2, 3, 3, aniso),
    // Wood: the grain runs one way, so the noise is stretched by repeating it less along that axis.
    wood: normalTexture(heightField(size, 23, 2, 4), size, 3.2, 1, 6, aniso),
    // Hammered metal: many small, soft dents.
    metal: normalTexture(heightField(size, 37, 10, 2), size, 3.0, 2, 2, aniso),
  };
}
