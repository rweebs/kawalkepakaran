import { describe, it, expect } from 'vitest';
import { PARVA_POSES, cardShift, dharmaMix, parvaProgress, poseAt, viewOffsetX } from '../src/lib/bowobharata/stage-math';

describe('camera path', () => {
  it('has one pose per parva', () => expect(PARVA_POSES).toHaveLength(8));
  it('starts at the first pose and ends at the last, and clamps outside 0..1', () => {
    expect(poseAt(0)).toEqual(PARVA_POSES[0]);
    expect(poseAt(1)).toEqual(PARVA_POSES[7]);
    expect(poseAt(-3)).toEqual(PARVA_POSES[0]);
    expect(poseAt(9)).toEqual(PARVA_POSES[7]);
  });
  it('glides linearly between neighbouring poses', () => {
    const mid = poseAt(0.5 / 7);
    expect(mid.pos.x).toBeCloseTo((PARVA_POSES[0].pos.x + PARVA_POSES[1].pos.x) / 2);
    expect(mid.look.z).toBeCloseTo((PARVA_POSES[0].look.z + PARVA_POSES[1].look.z) / 2);
  });
});

describe('framing around the text cards', () => {
  it('pushes the subject right while the card is on the left, and left while it is on the right, parva by parva', () => {
    // The cards alternate: parva 1 (index 0) sits left, parva 2 right, and so on.
    for (let i = 0; i < PARVA_POSES.length; i++) {
      expect(cardShift(i / (PARVA_POSES.length - 1)), `parva ${i + 1}`).toBeCloseTo(i % 2 === 0 ? 1 : -1, 5);
    }
  });
  it('glides through the middle between neighbouring parvas and stays within -1..1', () => {
    expect(Math.abs(cardShift(0.5 / 7))).toBeLessThan(0.05);
    for (let p = -0.5; p <= 1.5; p += 0.013) expect(Math.abs(cardShift(p))).toBeLessThanOrEqual(1);
  });
  it('turns the shift into a sideways view offset on desktop and none on a phone, where the card fills the width', () => {
    expect(viewOffsetX(2000, 1, false)).toBeLessThan(0); // content moves right
    expect(viewOffsetX(2000, -1, false)).toBeGreaterThan(0);
    expect(Math.abs(viewOffsetX(2000, 1, false))).toBeCloseTo(2000 * 0.17);
    expect(viewOffsetX(390, 1, true)).toBe(0);
    expect(viewOffsetX(0, 1, false)).toBe(0);
  });
});

describe('dharma palette mix', () => {
  it('stays dark until three quarters of the way, then rises smoothly to full light', () => {
    expect(dharmaMix(0)).toBe(0);
    expect(dharmaMix(0.75)).toBe(0);
    expect(dharmaMix(1)).toBe(1);
    expect(dharmaMix(0.875)).toBeGreaterThan(0);
    expect(dharmaMix(0.875)).toBeLessThan(1);
    expect(dharmaMix(0.95)).toBeGreaterThan(dharmaMix(0.9));
  });
});

describe('progress through the parvas', () => {
  // Uneven sections: the viewport centre sits on each section's centre exactly when it is "at" that parva.
  const centers = [400, 1000, 1700, 3600, 4300, 4900, 5400, 6000];
  it('is exactly index / (n - 1) when the viewport centre is on a section centre, however uneven the sections are', () => {
    centers.forEach((c, i) => expect(parvaProgress(centers, c), `parva ${i + 1}`).toBeCloseTo(i / 7, 10));
  });
  it('interpolates between two section centres', () => {
    expect(parvaProgress(centers, 1350)).toBeCloseTo((1 + 0.5) / 7, 10);
    expect(parvaProgress(centers, 2650)).toBeCloseTo((2 + 0.5) / 7, 10);
  });
  it('is 0 above the first parva and 1 below the last', () => {
    expect(parvaProgress(centers, -50)).toBe(0);
    expect(parvaProgress(centers, 99999)).toBe(1);
  });
  it('copes with no sections, one section, and sections that share a centre', () => {
    expect(parvaProgress([], 500)).toBe(0);
    expect(parvaProgress([700], 900)).toBe(0);
    const stacked = [100, 100, 300];
    for (let y = 50; y < 400; y += 25) expect(Number.isFinite(parvaProgress(stacked, y))).toBe(true);
  });
  it('never goes backwards as the page scrolls down', () => {
    let last = -1;
    for (let y = 0; y < 7000; y += 17) {
      const p = parvaProgress(centers, y);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
});
