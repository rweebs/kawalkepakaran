import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/lib/bowobharata-game/tuning';
import { buildWave, catchArrow, startRun, step } from '../src/lib/bowobharata-game/rules';

const slugs = ['a', 'b', 'c', 'd', 'e'];

describe('buildWave', () => {
  it('gives one real arrow per slug and no decoy has a slug', () => {
    const w = buildWave(0, slugs, 1);
    const reals = w.arrows.filter((a) => a.kind === 'real');
    expect(reals.map((a) => a.eventSlug).sort()).toEqual([...slugs]);
    const decoys = w.arrows.filter((a) => a.kind === 'decoy');
    expect(decoys.length).toBe(Math.max(2, Math.round((5 * TUNING.decoyShare) / (1 - TUNING.decoyShare))));
    expect(decoys.every((a) => a.eventSlug === null)).toBe(true);
  });
  it('same seed gives the same wave', () => {
    expect(buildWave(1, slugs, 42)).toEqual(buildWave(1, slugs, 42));
    expect(buildWave(1, slugs, 42)).not.toEqual(buildWave(1, slugs, 43));
  });
  it('genericReal adds slugless real arrows', () => {
    const w = buildWave(0, [], 3, 4);
    const reals = w.arrows.filter((a) => a.kind === 'real');
    expect(reals.length).toBe(4);
    expect(reals.every((a) => a.eventSlug === null)).toBe(true);
  });
  it('ramps flight per chapter', () => {
    const w = buildWave(2, slugs, 1);
    expect(w.arrows[0].flight).toBeCloseTo(TUNING.flight * TUNING.rampPerChapter ** 2);
  });
});

describe('step', () => {
  const run = () => startRun(buildWave(0, slugs, 1));
  it('clamps dt', () => {
    expect(step(run(), 5).t).toBeCloseTo(0.1);
  });
  it('sight slows time', () => {
    expect(step({ ...run(), sight: true }, 0.1).t).toBeCloseTo(0.1 * TUNING.sightSlow);
  });
  it('missLimit misses -> lost', () => {
    let r = run();
    for (let i = 0; i < 2000 && r.result === 'playing'; i++) r = step(r, 0.1);
    expect(r.result).toBe('lost');
    expect(r.misses).toBe(TUNING.missLimit);
  });
  it('decoyLimit decoys -> lost', () => {
    let r = run();
    const decoys = r.wave.arrows.filter((a) => a.kind === 'decoy');
    for (const d of decoys.slice(0, TUNING.decoyLimit)) r = catchArrow(r, d.id);
    expect(r.decoysTaken).toBe(TUNING.decoyLimit);
    expect(r.result).toBe('lost');
    expect(catchArrow(r, 0)).toBe(r);
    expect(step(r, 0.1)).toBe(r);
  });
  it('catching every real arrow and letting decoys pass -> won', () => {
    let r = run();
    for (let i = 0; i < 5000 && r.result === 'playing'; i++) {
      for (const a of r.wave.arrows) {
        if (a.kind === 'real' && a.state === 'flying' && r.t >= a.launch) r = catchArrow(r, a.id);
      }
      r = step(r, 0.1);
    }
    expect(r.result).toBe('won');
    expect(r.caught.length).toBe(5);
    expect(r.score).toBe(5 * TUNING.pointsReal);
    expect(r.wave.arrows.filter((a) => a.kind === 'decoy').every((a) => a.state === 'passed')).toBe(true);
  });
  it('catchArrow ignores unknown ids and non-flying arrows', () => {
    const r = run();
    expect(catchArrow(r, 9999)).toBe(r);
    const c = catchArrow(r, r.wave.arrows.find((a) => a.kind === 'real')!.id);
    const id = c.caught[0];
    expect(catchArrow(c, id)).toBe(c);
  });
});
