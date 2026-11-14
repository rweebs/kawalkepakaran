// A structural fingerprint of the page chariot's two riders, part by part in traversal order: what tests/fixtures/
// bowobharata-page-riders.json was recorded with from the unchanged page code, and what the riders test checks it against.
import * as THREE from 'three';
import { createChariot } from '../src/lib/bowobharata/scene/chariot';
import { createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { qualityFor } from '../src/lib/bowobharata/scene/quality';

/** Rounds to 1e-4, with −0 as 0. */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4 + 0;
/** Geometry parameters as plain rounded data: a curve's cached arc lengths are left out. */
const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (k === 'cacheArcLengths' || k === 'needsUpdate' ? undefined : typeof x === 'number' ? r4(x) : x)));

function materialPrint(m: THREE.Material) {
  const s = m as THREE.MeshPhysicalMaterial & { color?: THREE.Color; map?: THREE.Texture | null };
  return {
    type: m.type,
    color: s.color ? s.color.getHexString() : null,
    emissive: s.emissive ? s.emissive.getHexString() : null,
    emissiveIntensity: s.emissiveIntensity ?? null,
    roughness: s.roughness ?? null,
    metalness: s.metalness ?? null,
    sheen: s.sheen ?? null,
    map: !!s.map,
    normalMap: !!s.normalMap,
    alphaMap: !!s.alphaMap,
    side: m.side,
    transparent: m.transparent,
    opacity: r4(m.opacity),
    alphaTest: m.alphaTest,
    blending: m.blending,
    depthWrite: m.depthWrite,
  };
}

/** Every mesh, line and sprite under `rider`, in traversal order: kind, name, geometry, its local shape sums, world matrix, material. */
export function riderPrint(rider: THREE.Object3D) {
  const out: unknown[] = [];
  rider.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh && !(n as THREE.Line).isLine && !(n as THREE.Sprite).isSprite) return;
    const pos = m.geometry.getAttribute('position');
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      sum += x + y + z;
      sq += x * x + y * y + z * z;
    }
    out.push({
      kind: n.type,
      name: n.name,
      geometry: m.geometry.type,
      params: plain((m.geometry as { parameters?: unknown }).parameters),
      vertices: pos.count,
      indices: m.geometry.index ? m.geometry.index.count : null,
      sum: r4(sum),
      sq: r4(sq),
      matrix: n.matrixWorld.elements.map(r4),
      material: ([] as THREE.Material[]).concat(m.material).map(materialPrint),
    });
  });
  return out;
}

/**
 * The page chariot (root at the origin) on a tier: both riders as built, and again after a second of frames with the dharma
 * mix at 0.4, which turns and lifts the chakra, sets the halo and swings the scarf.
 */
export function pagePrint(mobile: boolean) {
  const part = createChariot(createContext(qualityFor(mobile, 1), new THREE.PerspectiveCamera(), createDetail(8)));
  part.object.position.set(0, 0, 0);
  part.object.updateMatrixWorld(true);
  const riders = () => ({ krishna: riderPrint(part.object.getObjectByName('krishna')!), arjuna: riderPrint(part.object.getObjectByName('arjuna')!) });
  const built = riders();
  for (let f = 1; f <= 60; f++) part.update(f / 60, 0.4);
  part.object.updateMatrixWorld(true);
  return { built, moving: riders() };
}
