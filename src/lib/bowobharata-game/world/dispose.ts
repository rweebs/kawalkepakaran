// Frees what a layer made under its group, each thing once: every drawable's geometry, every instanced mesh's own buffers,
// and every material. Never a texture: the scene shares its glow, soft and shaft textures with every layer, and a layer
// frees the textures it painted itself. Never a sprite's quad either, which three shares among all sprites.
import * as THREE from 'three';

export function disposeGroup(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const geometry = (o as { geometry?: THREE.BufferGeometry }).geometry;
    if (geometry && !(o as THREE.Sprite).isSprite) geometries.add(geometry);
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    const material = (o as { material?: THREE.Material | THREE.Material[] }).material;
    if (material) for (const m of Array.isArray(material) ? material : [material]) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
