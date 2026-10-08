import { describe, it, expect } from 'vitest';
import { FPS_FLOOR, qualityFor, shouldDropBloom } from '../src/lib/bowobharata/scene/quality';
import { PAVILION, arrowArc, formation, groundHeight } from '../src/lib/bowobharata/stage-math';

describe('quality tiers', () => {
  it('gives phones a lighter scene without bloom and a lower pixel ratio', () => {
    const phone = qualityFor(true, 3);
    const desk = qualityFor(false, 2);
    expect(phone.bloom).toBe(false);
    expect(desk.bloom).toBe(true);
    expect(phone.warriorsPerSide).toBeLessThan(desk.warriorsPerSide);
    expect(phone.arrows).toBeLessThan(desk.arrows);
    expect(phone.pixelRatio).toBe(1.25);
    expect(desk.pixelRatio).toBe(1.5);
    expect(qualityFor(false, 1).pixelRatio).toBe(1);
  });
});

describe('bloom fallback', () => {
  const frames = (ms: number, n = 90) => Array.from({ length: n }, () => ms);
  it('waits for enough frames before judging', () => {
    expect(shouldDropBloom(frames(40, 30))).toBe(false);
  });
  it('drops bloom when the average frame rate is under the floor, keeps it otherwise', () => {
    expect(shouldDropBloom(frames(1000 / (FPS_FLOOR - 10)))).toBe(true);
    expect(shouldDropBloom(frames(1000 / 60))).toBe(false);
  });
});

describe('army formation', () => {
  it('places each army on its own side, behind its front line, deterministically', () => {
    const d = formation(500, 'dharma', 3);
    const a = formation(500, 'adharma', 3);
    expect(formation(500, 'dharma', 3)).toEqual(d);
    expect(d).toHaveLength(500);
    expect(a).toHaveLength(500);
    for (const s of d) expect(s.x).toBeLessThan(-3);
    for (const s of a) expect(s.x).toBeGreaterThan(3);
    for (const s of [...d, ...a]) {
      expect(Number.isFinite(s.z)).toBe(true);
      expect(s.phase).toBeGreaterThanOrEqual(0);
      expect(s.phase).toBeLessThan(Math.PI * 2);
    }
  });
});

describe('terrain', () => {
  it('raises the Sengkuni pavilion on a mound above the open field', () => {
    expect(groundHeight(PAVILION.x, PAVILION.z)).toBeGreaterThan(groundHeight(0, -10) + 1.5);
  });
  it('keeps the battlefield gently rolling and finite', () => {
    for (const [x, z] of [[0, 0], [-15, -20], [20, 5], [-80, 90]]) {
      const h = groundHeight(x, z);
      expect(Number.isFinite(h)).toBe(true);
      expect(Math.abs(h)).toBeLessThan(6);
    }
  });
});

describe('arrow flight', () => {
  const from = { x: -10, y: 1.5, z: 0 };
  const to = { x: 10, y: 1.5, z: -4 };
  it('starts at the archer and lands at the target', () => {
    expect(arrowArc(0, from, to, 6)).toEqual(from);
    const end = arrowArc(1, from, to, 6);
    expect(end.x).toBeCloseTo(to.x);
    expect(end.y).toBeCloseTo(to.y);
    expect(end.z).toBeCloseTo(to.z);
  });
  it('peaks at the given height above the line halfway through', () => {
    const mid = arrowArc(0.5, from, to, 6);
    expect(mid.y).toBeCloseTo(1.5 + 6);
    expect(mid.x).toBeCloseTo(0);
  });
});
