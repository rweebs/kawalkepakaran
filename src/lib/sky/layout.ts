import { mulberry32 } from './rng';
import type { Vec3 } from './states';

export function makeStars(count: number, seed: number, radius = 40): Vec3[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const u = rnd() * 2 - 1;
    const phi = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return { x: radius * s * Math.cos(phi), y: radius * u, z: radius * s * Math.sin(phi) };
  });
}
