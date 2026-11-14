import { describe, it, expect } from 'vitest';
import { dayNumber, monthIndex, monthTicks, niceMax, xOf } from '../src/lib/bowobharata-game/chart-math';

describe('chart math', () => {
  it('counts days since 1970-01-01 UTC', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-01')).toBe(29);
  });
  it('indexes months', () => {
    expect(monthIndex('2024-01')).toBe(2024 * 12);
    expect(monthIndex('2024-12')).toBe(2024 * 12 + 11);
  });
  it('rounds an axis maximum up to 1, 2 or 5 times a power of ten', () => {
    expect([0, 1, 7, 42, 81].map(niceMax)).toEqual([1, 1, 10, 50, 100]);
    expect([2, 3, 5, 11, 20, 21].map(niceMax)).toEqual([2, 5, 5, 20, 20, 50]);
  });
  it('places dates on a span and clamps outside it', () => {
    const span = { from: '2026-01-01', to: '2026-01-11' };
    expect(xOf('2026-01-01', span, 100)).toBe(0);
    expect(xOf('2026-01-11', span, 100)).toBe(100);
    expect(xOf('2026-01-06', span, 100)).toBe(50);
    expect(xOf('2025-06-01', span, 100)).toBe(0);
    expect(xOf('2027-06-01', span, 100)).toBe(100);
    expect(xOf('2026-01-05', { from: '2026-01-05', to: '2026-01-05' }, 100)).toBe(0);
  });
  it('picks at most `max` month ticks, from the first January over a long span', () => {
    const long = monthTicks('2023-09', '2026-10', 8);
    expect(long.length).toBeLessThanOrEqual(8);
    expect(long[0]).toBe('2024-01');
    const short = monthTicks('2026-02', '2026-09', 8);
    expect(short[0]).toBe('2026-02');
    expect(short.length).toBeLessThanOrEqual(8);
    expect(monthTicks('2026-02', '2026-09', 3).length).toBeLessThanOrEqual(3);
    expect(monthTicks('2026-09', '2026-02', 8)).toEqual([]);
  });
});
