import { describe, expect, it } from 'vitest';
import {
  initRiuh,
  kickRiuh,
  levelEffects,
  riuhFloor,
  riuhLevel,
  stepRiuh,
  type Riuh,
} from '../src/lib/bowobharata-game/riuh';

const DT = 0.1;

/** Steps from `from` to `to` (world seconds), calling `each` after every step. */
function run(
  r0: Riuh,
  from: number,
  to: number,
  opts: { watched?: boolean; shelter?: boolean } = {},
  each?: (r: Riuh, t: number) => void,
): Riuh {
  let r = r0;
  const n = Math.round((to - from) / DT);
  for (let i = 1; i <= n; i++) {
    const t = from + i * DT;
    r = stepRiuh(r, { t, watched: !!opts.watched, shelter: !!opts.shelter }, DT);
    each?.(r, t);
  }
  return r;
}

describe('riuh', () => {
  it('grace: watched from 0 to 45 s never exceeds 2', () => {
    let max = 0;
    run(initRiuh({ t: 0 }), 0, 44.9, { watched: true }, (r) => {
      max = Math.max(max, r.value);
    });
    expect(max).toBeLessThanOrEqual(2);
    expect(max).toBeGreaterThan(1.9);
  });

  it('rises on its own when not watched', () => {
    const at = (t: number) => run(initRiuh({ t: 0 }), 0, t).value;
    expect(at(25)).toBeCloseTo(1, 1);
    expect(Math.abs(at(25) - 1)).toBeLessThanOrEqual(0.01);
    expect(at(40)).toBeCloseTo(2, 2);
    expect(at(44)).toBeCloseTo(2, 2);
    expect(Math.abs(at(45.1) - 2.34)).toBeLessThanOrEqual(0.01);
    expect(at(55)).toBeCloseTo(3, 2);
    expect(at(400)).toBeCloseTo(3, 2);
  });

  it('watching alone never reaches 5', () => {
    let max = 0;
    const r = run(initRiuh({ t: 0 }), 0, 300, { watched: true }, (x) => {
      max = Math.max(max, x.value);
    });
    expect(max).toBeLessThanOrEqual(4);
    expect(r.value).toBeGreaterThanOrEqual(3.99);
  });

  it('decays after 4 quiet seconds', () => {
    const r0 = initRiuh({ start: 3.5, t: 50 });
    expect(Math.abs(run(r0, 50, 54).value - 3.5)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(run(r0, 50, 64).value - 2.0)).toBeLessThanOrEqual(0.02);
  });

  it('decays fast in a shelter and never below the floor', () => {
    const r0 = initRiuh({ start: 3.5, t: 50 });
    expect(Math.abs(run(r0, 50, 52, { shelter: true }).value - 2.3)).toBeLessThanOrEqual(0.02);
    const low = run(r0, 50, 200, { shelter: true });
    expect(low.value).toBeCloseTo(riuhFloor(low, 200), 5);
    expect(low.value).toBeCloseTo(3, 5);
  });

  it('decayK scales the decay rates', () => {
    const r0 = initRiuh({ start: 3.5, t: 50 });
    let r = r0;
    for (let i = 1; i <= 20; i++) r = stepRiuh(r, { t: 50 + i * DT, watched: false, shelter: true, decayK: 0.5 }, DT);
    expect(Math.abs(r.value - 2.9)).toBeLessThanOrEqual(0.02);
  });

  it('documenting calms it', () => {
    const rec = kickRiuh(initRiuh({ start: 2.4, t: 100 }), 'recorded', 100);
    expect(rec.value).toBeCloseTo(1.9, 5);
    expect(rec.floorT).toBeCloseTo(110, 5);
    const del = kickRiuh(initRiuh({ start: 4.2, t: 100 }), 'delivered', 100);
    expect(del.value).toBeCloseTo(1.2, 5);
    expect(riuhFloor(del, 100)).toBe(0);
    const filed = kickRiuh(initRiuh({ start: 2.4, t: 100 }), 'filed', 100);
    expect(filed.value).toBeCloseTo(1.9, 5);
  });

  it('rises from the player actions, clamped at 5', () => {
    const a = kickRiuh(initRiuh({ start: 2, t: 60 }), 'rewriteTaken', 60);
    expect(a.value).toBeCloseTo(3, 5);
    expect(a.quietT).toBe(60);
    const b = kickRiuh(initRiuh({ start: 4.5, t: 60 }), 'rewriteTaken', 60);
    expect(b.value).toBe(5);
  });

  it('does not mutate its input', () => {
    const r0 = initRiuh({ start: 2, t: 60 });
    const snap = { ...r0 };
    kickRiuh(r0, 'rewriteTaken', 61);
    stepRiuh(r0, { t: 61, watched: true, shelter: false }, 1);
    expect(r0).toEqual(snap);
  });

  it('grace covers kicks', () => {
    let r = run(initRiuh({ t: 0 }), 0, 30, { watched: true });
    for (let i = 0; i < 3; i++) r = kickRiuh(r, 'rewriteTaken', 30);
    expect(r.value).toBeLessThanOrEqual(2);
    run(r, 30, 44.9, { watched: true }, (x) => expect(x.value).toBeLessThanOrEqual(2));
  });

  it('levels and effects', () => {
    expect(riuhLevel(2.99)).toBe(2);
    expect(riuhLevel(3)).toBe(3);
    expect(riuhLevel(5.7)).toBe(5);
    expect(riuhLevel(-1)).toBe(0);
    expect(levelEffects(0).volleyEvery).toBeNull();
    expect(levelEffects(1).volleyEvery).toBe(12);
    expect(levelEffects(3).clouds).toBe(true);
    expect(levelEffects(4).radarStatic).toBe(0.3);
    expect(levelEffects(5).volleyEvery).toBe(3.5);
    expect(levelEffects(5).radarStatic).toBe(0.45);
  });

  it('frozen stays at 0 through kicks and steps', () => {
    let r = initRiuh({ frozen: true });
    r = kickRiuh(r, 'rewriteTaken', 100);
    r = stepRiuh(r, { t: 200, watched: true, shelter: false }, 1);
    r = run(r, 200, 300, { watched: true });
    expect(r.value).toBe(0);
  });

  describe('review fixes', () => {
    const stepSpan = (r0: Riuh, from: number, to: number, dt: number, o: { watched: boolean; shelter: boolean; decayK?: number }) => {
      let r = r0;
      const n = Math.round((to - from) / dt);
      for (let i = 1; i <= n; i++) r = stepRiuh(r, { t: from + i * dt, ...o }, dt);
      return r;
    };

    it('is independent of the step size', () => {
      const cases: [Riuh, number, number, { watched: boolean; shelter: boolean }][] = [
        [initRiuh({ start: 3.5, t: 50 }), 50, 62, { watched: false, shelter: false }],
        [initRiuh({ start: 1, t: 50 }), 50, 62, { watched: true, shelter: false }],
        [initRiuh({ start: 4, t: 50 }), 50, 52, { watched: false, shelter: true }],
      ];
      for (const [r0, a, b, o] of cases) {
        const fine = stepSpan(r0, a, b, 1 / 60, o);
        const coarse = stepSpan(r0, a, b, 0.5, o);
        expect(Math.abs(fine.value - coarse.value)).toBeLessThan(1e-9);
      }
    });

    it('ignores bad dt and t', () => {
      const r0 = initRiuh({ start: 3, t: 50 });
      const inp = { t: 60, watched: true, shelter: false };
      for (const dt of [NaN, Infinity, -1]) {
        const r = stepRiuh(r0, inp, dt);
        expect(Number.isFinite(r.value)).toBe(true);
      }
      expect(stepRiuh(r0, { ...inp, t: NaN }, 1)).toEqual(r0);
      expect(kickRiuh(r0, 'rewriteTaken', NaN)).toEqual(r0);
      const r = stepRiuh(r0, { ...inp, t: 60, watched: false, decayK: NaN }, 1);
      expect(Number.isFinite(r.value)).toBe(true);
    });

    it('decayK scales the normal decay and leaves a watched rise alone', () => {
      const r0 = initRiuh({ start: 3.5, t: 50 });
      const half = stepSpan(r0, 50, 64, 0.5, { watched: false, shelter: false, decayK: 0.5 });
      expect(Math.abs(half.value - (3.5 - 0.15 * 0.5 * 10))).toBeLessThan(1e-9);
      const a = stepSpan(initRiuh({ start: 1, t: 50 }), 50, 52, 0.5, { watched: true, shelter: false, decayK: 0.1 });
      const b = stepSpan(initRiuh({ start: 1, t: 50 }), 50, 52, 0.5, { watched: true, shelter: false });
      expect(a.value).toBeCloseTo(b.value, 9);
    });

    it('levelEffects(NaN) does not throw', () => {
      expect(levelEffects(NaN).volleyEvery).toBeNull();
    });

    it('a negative kick that the floor lifts does not reset quietT', () => {
      const r0 = { value: 0.5, floorT: 0, quietT: 10, frozen: false };
      const r = kickRiuh(r0, 'filed', 100);
      expect(r.value).toBeGreaterThan(0.5);
      expect(r.quietT).toBe(10);
    });
  });
});
