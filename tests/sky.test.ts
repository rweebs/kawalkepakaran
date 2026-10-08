import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/lib/sky/rng';
import { stateForSection, SECTION_STATE, CAMERA_POSES, HOME_SECTIONS, atPageBottom } from '../src/lib/sky/states';
import { makeStars } from '../src/lib/sky/layout';
import { makeFlock, stepFlock, birdTarget, DEFAULT_FLOCK } from '../src/lib/sky/flock';

describe('mulberry32', () => {
  it('is deterministic and in [0,1)', () => {
    const a = mulberry32(5); const b = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('states', () => {
  it('maps every home section to a state', () => {
    expect(stateForSection('operasi')).toBe('circle');
    expect(stateForSection('siapa')).toBe('circle');
    expect(stateForSection('bukti')).toBe('circle');
    expect(stateForSection('jawaban')).toBe('status');
  });
  it('falls back to circle for an unknown section', () => {
    expect(stateForSection('???')).toBe('circle');
  });
  it('knows exactly the four home sections, each with a state and a camera pose', () => {
    expect([...HOME_SECTIONS]).toEqual(['operasi', 'siapa', 'bukti', 'kontribusi', 'jawaban']);
    for (const id of HOME_SECTIONS) expect(CAMERA_POSES[SECTION_STATE[id]]).toBeDefined();
  });
});

describe('atPageBottom', () => {
  it('is true when the viewport bottom touches the page bottom', () => {
    expect(atPageBottom(2057, 841, 2898)).toBe(true);
  });
  it('is true within the tolerance', () => {
    expect(atPageBottom(2050, 841, 2898)).toBe(true);
  });
  it('is false while there is still page below', () => {
    expect(atPageBottom(1000, 841, 2898)).toBe(false);
  });
  it('is false for a page that fits the viewport (nothing to scroll)', () => {
    expect(atPageBottom(0, 900, 900)).toBe(false);
  });
});

describe('layout', () => {
  it('makes a deterministic star dome of the requested size', () => {
    const a = makeStars(100, 7, 40); const b = makeStars(100, 7, 40);
    expect(a).toHaveLength(100);
    expect(a).toEqual(b);
    for (const s of a) expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(40, 5);
  });
});

describe('flock', () => {
  const target = { x: 10, y: 2, z: 0 };
  const targetsFor = (n: number) => Array.from({ length: n }, () => target);

  it('makes the requested number of birds deterministically', () => {
    expect(makeFlock(30, 1)).toHaveLength(30);
    expect(makeFlock(30, 1)).toEqual(makeFlock(30, 1));
  });
  it('does not mutate its input and keeps the count', () => {
    const birds = makeFlock(20, 2);
    const copy = JSON.parse(JSON.stringify(birds));
    const next = stepFlock(birds, targetsFor(20), DEFAULT_FLOCK, 0.016);
    expect(birds).toEqual(copy);
    expect(next).toHaveLength(20);
  });
  it('never exceeds max speed', () => {
    let birds = makeFlock(40, 3);
    for (let i = 0; i < 200; i++) birds = stepFlock(birds, targetsFor(40), DEFAULT_FLOCK, 0.016);
    for (const b of birds) expect(Math.hypot(b.vx, b.vy, b.vz)).toBeLessThanOrEqual(DEFAULT_FLOCK.maxSpeed + 1e-6);
  });
  it('moves the flock toward its target', () => {
    let birds = makeFlock(40, 4);
    const dist = (bs: typeof birds) => bs.reduce((s, b) => s + Math.hypot(b.x - target.x, b.y - target.y, b.z - target.z), 0) / bs.length;
    const before = dist(birds);
    for (let i = 0; i < 300; i++) birds = stepFlock(birds, targetsFor(40), DEFAULT_FLOCK, 0.016);
    expect(dist(birds)).toBeLessThan(before);
  });
  it('stays finite over a long run', () => {
    let birds = makeFlock(40, 5);
    for (let i = 0; i < 1000; i++) birds = stepFlock(birds, targetsFor(40), DEFAULT_FLOCK, 0.016);
    for (const b of birds) for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('birdTarget', () => {
  it('returns finite targets for both states', () => {
    for (const s of ['circle', 'status'] as const) {
      for (let i = 0; i < 12; i++) {
        const t = birdTarget(s, i, 1.5);
        expect(Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)).toBe(true);
      }
    }
  });
  it('spreads the birds around the orbit instead of stacking them', () => {
    const a = birdTarget('circle', 0, 0); const b = birdTarget('circle', 7, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(0.5);
  });
});
