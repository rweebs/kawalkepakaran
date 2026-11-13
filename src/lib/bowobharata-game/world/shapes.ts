// The game's procedural shapes, shared by its layers: the arrows and the stamps, and the helpers that bake parts in place
// and merge them into one geometry (one draw call).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Moves a part into place: made non-indexed first, so parts of any kind merge together. */
export function bake(geo: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(m);
  return g;
}
/** A placement at (x, y, z), turned rx about x and then rz about z. */
export const at = (x: number, y: number, z: number, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
export const noUv = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g; };
/** The parts as one geometry, without texture coordinates. */
export const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map(noUv), false);

// Arrows are modelled along +Y (tip up), about one unit long.
export function realShaftGeo() {
  return merge([
    bake(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), at(0, 0, 0)),
    bake(new THREE.ConeGeometry(0.09, 0.22, 4), at(0, -0.42, 0, Math.PI, 0)),
    bake(new THREE.ConeGeometry(0.09, 0.22, 4), at(0, -0.3, 0, Math.PI, 0)),
  ])!;
}
export function realTipGeo() {
  return bake(new THREE.ConeGeometry(0.07, 0.24, 6), at(0, 0.6, 0));
}
/** Frayed: a thin split shaft with splinters poking out, no head. */
export function decoyShaftGeo() {
  return merge([
    bake(new THREE.CylinderGeometry(0.014, 0.022, 1, 5), at(0, 0, 0)),
    bake(new THREE.CylinderGeometry(0.004, 0.012, 0.3, 3), at(0.03, 0.5, 0, 0, -0.5)),
    bake(new THREE.CylinderGeometry(0.004, 0.012, 0.26, 3), at(-0.03, 0.48, 0.01, 0, 0.6)),
    bake(new THREE.CylinderGeometry(0.004, 0.012, 0.22, 3), at(0, 0.47, 0.03, 0.6, 0)),
  ])!;
}
/** Curled fletching: two open arcs wrapped round the tail. */
export function decoyFletchGeo() {
  return merge([
    bake(new THREE.TorusGeometry(0.1, 0.012, 4, 10, Math.PI * 1.3), at(0, -0.42, 0, Math.PI / 2, 0)),
    bake(new THREE.TorusGeometry(0.075, 0.012, 4, 10, Math.PI * 1.1), at(0, -0.33, 0, Math.PI / 2, 0.5)),
  ])!;
}
/** Lotus: five petals round a bud, facing the camera (lies in the XY plane). */
export function lotusGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(bake(new THREE.ConeGeometry(0.06, 0.26, 4), new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a - Math.PI / 2)),
      new THREE.Vector3(1, 1, 1))));
  }
  parts.push(bake(new THREE.SphereGeometry(0.06, 6, 4), at(0, 0, 0)));
  return merge(parts)!;
}
/** Broken ring: a circle with a gap. */
export function brokenRingGeo() {
  return noUv(new THREE.TorusGeometry(0.2, 0.025, 5, 14, Math.PI * 1.55));
}
