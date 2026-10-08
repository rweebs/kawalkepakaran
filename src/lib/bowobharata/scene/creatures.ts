import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loft, type Radii } from './anatomy';
import { paint, tagLimb } from './rig';

type P = [number, number, number];
const pts = (a: P[], dx = 0, dy = 0, dz = 0) => a.map((p) => new THREE.Vector3(p[0] + dx, p[1] + dy, p[2] + dz));

/** One painted, limb-tagged part: id 0 is the body; ids 1..5 swing about (px, py). */
function part(geo: THREE.BufferGeometry, color: string, id = 0, px = 0, py = 0): THREE.BufferGeometry {
  return tagLimb(paint(geo, color), id, px, py);
}

function leg(pivot: P, path: P[], radii: Radii[], color: string, hoof: string, id: number, hoofSize: number): THREE.BufferGeometry[] {
  const end = path[path.length - 1];
  return [
    part(loft(pts(path, pivot[0], pivot[1], pivot[2]), radii, 6, 7), color, id, pivot[0], pivot[1]),
    part(new THREE.CylinderGeometry(hoofSize, hoofSize * 1.2, hoofSize * 1.4, 8).translate(end[0] + pivot[0] + 0.02, end[1] + pivot[1] - 0.02, end[2] + pivot[2]), hoof, id, pivot[0], pivot[1]),
  ];
}

/**
 * A mounted lancer as one merged mesh facing +x, hooves on y = 0: horse with four legs on ids 1..4 (so the gallop shader can
 * swing them), and a rider in `armor` and `cloth` carrying a long lance.
 */
export function cavalryGeometry(armor: string, cloth: string): THREE.BufferGeometry {
  const coat = '#6a4d35';
  const dark = '#1d1510';
  const parts: THREE.BufferGeometry[] = [
    part(loft(pts([[-0.95, 1.36, 0], [-0.55, 1.47, 0], [0.05, 1.39, 0], [0.45, 1.5, 0], [0.66, 1.52, 0]]),
      [[0.1, 0.12], [0.3, 0.33], [0.3, 0.34], [0.27, 0.36], [0.2, 0.3]], 8, 9), coat),
    part(loft(pts([[0.6, 1.5, 0], [0.82, 1.78, 0], [1.02, 2.02, 0], [1.14, 2.04, 0], [1.34, 1.72, 0]]),
      [[0.2, 0.28], [0.15, 0.2], [0.11, 0.13], [0.1, 0.12], [0.07, 0.075]], 8, 8), coat),
    part(loft(pts([[0.7, 1.7, 0], [0.9, 1.95, 0], [1.05, 2.12, 0]]), [[0.03, 0.09], [0.03, 0.07], [0.02, 0.04]], 3, 6), dark),
    part(loft(pts([[-0.95, 1.38, 0], [-1.12, 1.2, 0], [-1.22, 0.78, 0]]), [[0.06, 0.07], [0.07, 0.08], [0.02, 0.03]], 4, 6), dark),
  ];
  const fore: P[] = [[0, 0, 0], [0.03, -0.32, 0], [0.02, -0.72, 0], [0.04, -1.02, 0], [0.08, -1.15, 0]];
  const hind: P[] = [[0, 0, 0], [0.1, -0.35, 0], [-0.08, -0.72, 0], [-0.05, -1.05, 0], [-0.02, -1.17, 0]];
  const foreR: Radii[] = [[0.1, 0.12], [0.07, 0.08], [0.05, 0.055], [0.05, 0.055], [0.055, 0.06]];
  const hindR: Radii[] = [[0.13, 0.16], [0.09, 0.11], [0.05, 0.06], [0.05, 0.055], [0.055, 0.06]];
  parts.push(
    ...leg([0.42, 1.22, -0.14], fore, foreR, coat, dark, 1, 0.06),
    ...leg([0.42, 1.22, 0.14], fore, foreR, coat, dark, 2, 0.06),
    ...leg([-0.68, 1.25, -0.15], hind, hindR, coat, dark, 3, 0.06),
    ...leg([-0.68, 1.25, 0.15], hind, hindR, coat, dark, 4, 0.06),
  );
  parts.push(...riderParts(armor, cloth));
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}

/** Torso, helmeted head, an arm holding the lance, the lance itself, and a saddle cloth: the rider, sitting at horse-back height. */
function riderParts(armor: string, cloth: string): THREE.BufferGeometry[] {
  return [
    part(loft(pts([[0.04, 1.66, 0], [0.08, 1.95, 0], [0.12, 2.25, 0]]), [[0.17, 0.11], [0.16, 0.1], [0.14, 0.09]], 3, 7), armor),
    part(new THREE.SphereGeometry(0.1, 8, 6).translate(0.14, 2.42, 0), '#b08560'),
    part(new THREE.ConeGeometry(0.115, 0.22, 7).translate(0.14, 2.58, 0), armor),
    part(loft(pts([[0.12, 2.18, -0.17], [0.3, 2.0, -0.22], [0.5, 2.02, -0.2]]), [[0.045, 0.045], [0.04, 0.04], [0.035, 0.035]], 2, 5), cloth),
    part(new THREE.CylinderGeometry(0.018, 0.018, 3.0, 4).rotateZ(Math.PI / 2 + 0.06).translate(1.0, 2.0, -0.2), '#5a4126'),
    part(new THREE.ConeGeometry(0.05, 0.22, 4).rotateZ(-Math.PI / 2 + 0.06).translate(2.62, 1.84, -0.2), '#c9ced8'),
    part(new THREE.BoxGeometry(0.5, 0.05, 0.7).translate(0.0, 1.78, 0), cloth),
  ];
}

/** The rider alone, to sit on a separately drawn horse. Vertex colours, limb id 0 (no limbs): it only travels and bobs. */
export function riderGeometry(armor: string, cloth: string): THREE.BufferGeometry {
  const parts = riderParts(armor, cloth);
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * A war elephant as one merged mesh facing +x: grey body and head, great ears, ivory tusks, a swinging trunk (id 5), four thick
 * legs (ids 1..4), and a howdah on its back with an archer and a banner pole in the army's colours.
 */
export function elephantGeometry(cloth: string, trim: string): THREE.BufferGeometry {
  const skin = '#6f6a66';
  const ivory = '#e8dcc0';
  const parts: THREE.BufferGeometry[] = [
    part(loft(pts([[-1.2, 2.0, 0], [-0.4, 2.35, 0], [0.5, 2.4, 0], [1.1, 2.2, 0]]), [[0.7, 0.8], [0.85, 0.95], [0.82, 0.95], [0.65, 0.8]], 9, 11), skin),
    part(loft(pts([[1.0, 2.3, 0], [1.5, 2.35, 0], [1.9, 2.1, 0]]), [[0.55, 0.6], [0.5, 0.55], [0.3, 0.35]], 6, 9), skin),
    part(loft(pts([[1.9, 2.05, 0], [2.15, 1.5, 0], [2.2, 0.9, 0], [2.0, 0.4, 0]]), [[0.2, 0.22], [0.16, 0.17], [0.12, 0.13], [0.09, 0.1]], 8, 8), skin, 5, 1.9, 2.05),
    part(loft(pts([[-1.2, 2.0, 0], [-1.45, 1.4, 0], [-1.5, 0.8, 0]]), [[0.06, 0.07], [0.05, 0.06], [0.03, 0.04]], 4, 6), '#4d4947'),
  ];
  for (const z of [-0.82, 0.82]) {
    parts.push(
      part(new THREE.SphereGeometry(1, 8, 6).scale(0.08, 0.55, 0.45).translate(1.25, 2.35, z), '#5f5a57'),
      part(new THREE.ConeGeometry(0.06, 0.95, 6).rotateZ(-Math.PI / 2 - 0.45).translate(2.05, 1.62, z * 0.4), ivory),
    );
  }
  const legPath: P[] = [[0, 0, 0], [0.02, -0.5, 0], [0, -1.05, 0], [0, -1.6, 0]];
  const legR: Radii[] = [[0.3, 0.32], [0.27, 0.28], [0.25, 0.26], [0.26, 0.28]];
  parts.push(
    ...leg([0.8, 1.6, -0.5], legPath, legR, skin, '#bfb6a6', 1, 0.2),
    ...leg([0.8, 1.6, 0.5], legPath, legR, skin, '#bfb6a6', 2, 0.2),
    ...leg([-0.85, 1.6, -0.5], legPath, legR, skin, '#bfb6a6', 3, 0.2),
    ...leg([-0.85, 1.6, 0.5], legPath, legR, skin, '#bfb6a6', 4, 0.2),
  );
  // Howdah, blanket, archer and banner pole.
  parts.push(
    part(new THREE.BoxGeometry(1.6, 0.1, 1.9).translate(0, 2.88, 0), cloth),
    part(new THREE.BoxGeometry(1.2, 0.08, 0.9).translate(0, 3.02, 0), trim),
    ...[-0.45, 0.45].map((z) => part(new THREE.BoxGeometry(1.2, 0.35, 0.05).translate(0, 3.22, z), trim)),
    part(new THREE.BoxGeometry(0.05, 0.35, 0.9).translate(-0.6, 3.22, 0), trim),
    part(loft(pts([[0, 3.06, 0], [0.02, 3.3, 0], [0.04, 3.55, 0]]), [[0.15, 0.1], [0.14, 0.1], [0.12, 0.09]], 3, 7), cloth),
    part(new THREE.SphereGeometry(0.09, 8, 6).translate(0.05, 3.7, 0), '#b08560'),
    part(new THREE.ConeGeometry(0.11, 0.2, 7).translate(0.05, 3.86, 0), trim),
    part(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 5).translate(-0.6, 3.9, 0), '#5a4126'),
  );
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return merged;
}
