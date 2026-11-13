// The drivable chariot's team and wheels, from its speed. Pure: no three.js. Speeds in m/s, angles in radians.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

/** How much of each horse clip plays (the weights sum to 1), and how fast the Walk and Gallop clips run. */
export interface Gait { idle: number; walk: number; gallop: number; walkRate: number; gallopRate: number }

/**
 * The team's gait at speed v, either way: standing below 0.2 m/s, walking by 1.2, galloping from 3.5 to 6.5. The rates scale
 * each clip to the ground it covers (the Walk clip walks 1.6 m/s, the Gallop clip gallops 8), within what still looks natural.
 */
export function gaitAt(v: number): Gait {
  const s = Math.abs(v);
  const idle = 1 - smoothstep(0.2, 1.2, s);
  const gallop = smoothstep(3.5, 6.5, s);
  return { idle, walk: 1 - idle - gallop, gallop, walkRate: clamp(s / 1.6, 0.5, 1.6), gallopRate: clamp(s / 8, 0.7, 2.2) };
}

/** A 0.9 m wheel's turn after rolling at `speed` for dt seconds. */
export function spinWheel(angle: number, speed: number, dt: number): number {
  return angle + (speed * dt) / 0.9;
}
