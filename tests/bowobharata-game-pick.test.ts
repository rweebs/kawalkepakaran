import { describe, expect, it } from 'vitest';
import { pickNearest } from '../src/lib/bowobharata-game/pick';

const pts = [
  { id: 1, x: 100, y: 100 },
  { id: 2, x: 130, y: 100 },
  { id: 3, x: 400, y: 300 },
];

describe('pickNearest', () => {
  it('returns the closest point within the radius', () => {
    expect(pickNearest(pts, { x: 120, y: 100 }, 28)).toBe(2);
  });
  it('returns null when none is within the radius', () => {
    expect(pickNearest(pts, { x: 250, y: 200 }, 28)).toBeNull();
    expect(pickNearest([], { x: 0, y: 0 }, 28)).toBeNull();
  });
  it('a tap 27px away catches with radius 28', () => {
    expect(pickNearest([{ id: 7, x: 200, y: 200 }], { x: 227, y: 200 }, 28)).toBe(7);
    expect(pickNearest([{ id: 7, x: 200, y: 200 }], { x: 229, y: 200 }, 28)).toBeNull();
  });
});
