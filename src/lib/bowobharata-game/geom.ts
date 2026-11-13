// Ground-plane helpers for the open-world game. Units are metres; east is +x and north is −z.
// Yaw is measured from east toward north: forward(yaw) = (cos yaw, −sin yaw), rightOf(yaw) = (sin yaw, cos yaw).
import { mulberry32 } from '../sky/rng';

export interface XZ {
  x: number;
  z: number;
}

export function dist(a: XZ, b: XZ): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Distance from p to the segment ab (to a when the segment has no length). */
export function segPointDist(p: XZ, a: XZ, b: XZ): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Distance from p to the nearest segment of the polyline; a single point counts as a line; Infinity when empty. */
export function polylineDist(p: XZ, line: readonly XZ[]): number {
  if (line.length === 1) return dist(p, line[0]);
  let best = Infinity;
  for (let k = 1; k < line.length; k++) best = Math.min(best, segPointDist(p, line[k - 1], line[k]));
  return best;
}

/** a − b wrapped to (−π, π]. */
export function angleDiff(a: number, b: number): number {
  const d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) return d - 2 * Math.PI;
  if (d <= -Math.PI) return d + 2 * Math.PI;
  return d;
}

export function forward(yaw: number): XZ {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

export function rightOf(yaw: number): XZ {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** The yaw that faces along d: the inverse of forward. */
export function yawOf(d: XZ): number {
  return Math.atan2(-d.z, d.x);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * One mulberry32 step on a stored state: v is the value mulberry32 gives next, and a the state to store.
 * A fresh mulberry32(a) makes exactly that step first, and its state advances by the same constant.
 */
export function nextRand(a: number): { v: number; a: number } {
  return { v: mulberry32(a)(), a: ((a >>> 0) + 0x6d2b79f5) >>> 0 };
}
