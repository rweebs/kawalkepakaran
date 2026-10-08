import { mulberry32 } from '../../sky/rng';
import { PAVILION } from '../stage-math';

/** The rectangle the armies, the chariot, the clash line and their dust occupy; nothing is scattered on it. */
export const FIELD = { minX: -26, maxX: 26, minZ: -46, maxZ: 26 } as const;

export interface DressingSpot { x: number; z: number; scale: number; turn: number }

/**
 * Where grass tufts and rocks go: spread over the terrain outside the field and clear of the pavilion's mound, the same every
 * time for a seed. Rejection sampling, so the count is exact and nothing lands where it should not.
 */
export function dressingLayout(count: number, seed: number): DressingSpot[] {
  const rnd = mulberry32(seed);
  const out: DressingSpot[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 60) {
    const x = (rnd() - 0.5) * 240;
    const z = -120 + rnd() * 178;
    if (x > FIELD.minX && x < FIELD.maxX && z > FIELD.minZ && z < FIELD.maxZ) continue;
    if (Math.hypot(x - PAVILION.x, z - PAVILION.z) < 12) continue;
    out.push({ x, z, scale: 0.6 + rnd() * 1.4, turn: rnd() * Math.PI * 2 });
  }
  return out;
}
