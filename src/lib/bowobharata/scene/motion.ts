import { mulberry32 } from '../../sky/rng';
import type { Vec3 } from '../../sky/states';

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------ arrows

export type ArrowPhase = { phase: 'flight' | 'stuck' | 'gone'; t: number };

/** Where an arrow is `elapsed` seconds after launch: flying, then standing in the ground for `stick` seconds, then gone. */
export function arrowPhase(elapsed: number, duration: number, stick: number): ArrowPhase {
  if (elapsed < duration) return { phase: 'flight', t: elapsed / duration };
  if (elapsed < duration + stick) return { phase: 'stuck', t: (elapsed - duration) / stick };
  return { phase: 'gone', t: 1 };
}

// ------------------------------------------------------------ camera

/**
 * Moves `current` towards `target` by an exponential ease that depends only on elapsed time, never on how many frames it took:
 * the camera reaches each shot in the same real time on a slow machine as on a fast one.
 */
export function easeToward(current: number, target: number, dt: number, rate: number): number {
  return target + (current - target) * Math.exp(-rate * Math.max(0, dt));
}

/** A few slow, out-of-step sine waves: the slight drift of a camera held by a person. Zero when `amount` is zero. */
export function handheld(time: number, amount = 1): { x: number; y: number; roll: number } {
  if (amount === 0) return { x: 0, y: 0, roll: 0 };
  return {
    x: (Math.sin(time * 0.37) * 0.04 + Math.sin(time * 1.13 + 1.7) * 0.02) * amount,
    y: (Math.sin(time * 0.53 + 0.6) * 0.03 + Math.sin(time * 1.71) * 0.015) * amount,
    roll: (Math.sin(time * 0.29 + 2.1) * 0.005 + Math.sin(time * 0.83) * 0.002) * amount,
  };
}

/** Depth of field: the focus distance is the camera-to-subject distance; the blur only fades in on close shots. */
export function dofFocus(camera: Vec3, subject: Vec3): { focus: number; amount: number } {
  const focus = Math.hypot(camera.x - subject.x, camera.y - subject.y, camera.z - subject.z);
  return { focus, amount: 1 - smoothstep(14, 28, focus) };
}

// ------------------------------------------------------------ shadows

/** A light box that follows what the camera looks at, wider when the camera pulls back, with the light up the sun direction. */
export function shadowFrame(focus: Vec3, camera: Vec3, sun: Vec3): { center: Vec3; halfSize: number; position: Vec3 } {
  const dist = Math.hypot(camera.x - focus.x, camera.y - focus.y, camera.z - focus.z);
  const halfSize = Math.min(48, Math.max(14, dist * 0.7));
  const len = Math.hypot(sun.x, sun.y, sun.z) || 1;
  const k = 80 / len;
  return {
    center: { ...focus },
    halfSize,
    position: { x: focus.x + sun.x * k, y: focus.y + sun.y * k, z: focus.z + sun.z * k },
  };
}

// ------------------------------------------------------------ secondary motion

export interface Spring { angle: number; vel: number }

/** One step of a damped angular spring, returning a new state: the joint chases `target` with lag instead of snapping to it. */
export function springStep(s: Spring, target: number, dt: number, stiffness: number, damping: number): Spring {
  const accel = (target - s.angle) * stiffness - s.vel * damping;
  const vel = s.vel + accel * dt;
  return { angle: s.angle + vel * dt, vel };
}

// ------------------------------------------------------------ the battle

export interface ClashPair { x: number; z: number; gap: number; phase: number }

/** Pairs of fighters locked together on the line between the armies, spaced so no two overlap. */
export function clashLayout(count: number, seed: number): ClashPair[] {
  const rnd = mulberry32(seed);
  const out: ClashPair[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 400) {
    const x = (rnd() - 0.5) * 4.6;
    // The line starts behind Krishna's chariot (which stands at z = 9) and runs away from the camera.
    const z = 4 - rnd() * 44;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 1.0)) continue;
    out.push({ x, z, gap: 0.6 + rnd() * 0.7, phase: rnd() * Math.PI * 2 });
  }
  return out;
}

export interface Lane { x: number; z: number; phase: number }

/** Where each cavalry rider starts its charge: behind the infantry, spread along the field. */
export function cavalryLanes(count: number, side: 'dharma' | 'adharma', seed: number): Lane[] {
  const rnd = mulberry32(seed + (side === 'dharma' ? 31 : 77));
  const sign = side === 'dharma' ? -1 : 1;
  return Array.from({ length: count }, (_, i) => ({
    x: sign * (10 + rnd() * 3),
    z: 12 - ((i + rnd() * 0.6) / count) * 50,
    phase: rnd(),
  }));
}

/** War elephants stand wide of the infantry, evenly spaced along the line. */
export function elephantSlots(count: number, side: 'dharma' | 'adharma'): Lane[] {
  const sign = side === 'dharma' ? -1 : 1;
  return Array.from({ length: count }, (_, i) => ({
    x: sign * (17 + (i % 2) * 2.5),
    z: 8 - i * (44 / Math.max(count, 1)) - 2,
    phase: (i * 0.37) % 1,
  }));
}
