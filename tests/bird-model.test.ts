import { describe, it, expect } from 'vitest';
import { BIRD_POSITIONS, STONE_LOCAL, STONE_RADIUS } from '../src/lib/sky/bird-model';

describe('bird model (swift with a stone in its claws)', () => {
  it('is a whole number of triangles', () => {
    expect(BIRD_POSITIONS.length % 9).toBe(0);
    expect(BIRD_POSITIONS.length / 9).toBeGreaterThanOrEqual(8);
  });
  it('is left-right symmetric', () => {
    const verts: Array<[number, number, number]> = [];
    for (let i = 0; i < BIRD_POSITIONS.length; i += 3) verts.push([BIRD_POSITIONS[i], BIRD_POSITIONS[i + 1], BIRD_POSITIONS[i + 2]]);
    for (const [x, y, z] of verts) {
      const mirrored = verts.some(([mx, my, mz]) => Math.abs(mx + x) < 1e-9 && my === y && mz === z);
      expect(mirrored).toBe(true);
    }
  });
  it('has long swept wings and a nose in front', () => {
    const xs: number[] = []; const zs: number[] = [];
    for (let i = 0; i < BIRD_POSITIONS.length; i += 3) { xs.push(Math.abs(BIRD_POSITIONS[i])); zs.push(BIRD_POSITIONS[i + 2]); }
    expect(Math.max(...xs)).toBeGreaterThan(0.8);
    expect(Math.max(...zs)).toBeGreaterThan(0.4);
    expect(Math.min(...zs)).toBeLessThan(-0.5);
  });
  it('carries the stone below the body', () => {
    expect(STONE_LOCAL.y).toBeLessThan(0);
    expect(STONE_RADIUS).toBeGreaterThan(0);
  });
});
