import { describe, it, expect } from 'vitest';
import { tiltFor } from '../src/lib/tilt';

describe('tiltFor', () => {
  it('is zero at the centre', () => {
    expect(tiltFor(50, 50, 100, 100, 8)).toEqual({ rotateX: 0, rotateY: 0 });
  });
  it('tilts right when the pointer is on the right edge', () => {
    expect(tiltFor(100, 50, 100, 100, 8).rotateY).toBeCloseTo(8);
  });
  it('tilts up when the pointer is near the top', () => {
    expect(tiltFor(50, 0, 100, 100, 8).rotateX).toBeCloseTo(8);
  });
  it('clamps beyond the element', () => {
    const t = tiltFor(500, -500, 100, 100, 8);
    expect(Math.abs(t.rotateX)).toBeLessThanOrEqual(8);
    expect(Math.abs(t.rotateY)).toBeLessThanOrEqual(8);
  });
  it('returns zero for a zero-size box', () => {
    expect(tiltFor(10, 10, 0, 0, 8)).toEqual({ rotateX: 0, rotateY: 0 });
  });
});
