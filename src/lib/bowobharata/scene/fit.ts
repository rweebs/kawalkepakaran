import type { Vec3 } from '../../sky/states';

/** The rotation about the y axis that turns a model so the direction from its tail to its head points along +x. */
export function facingAngle(tail: Vec3, head: Vec3): number {
  return Math.atan2(head.z - tail.z, head.x - tail.x);
}

/** The scale that makes a model whose measured size is `size` come out `target` big; 1 for a size that cannot be measured. */
export function fitScale(size: number, target: number): number {
  return Number.isFinite(size) && size > 0 ? target / size : 1;
}
