import { describe, expect, it } from 'vitest';
import { initChariot } from '../src/lib/bowobharata-game/drive';
import { missionFor, realTargets } from '../src/lib/bowobharata-game/missions';
import {
  autoRecord, checkpoint, openTargets, restore, SCORE, startRun, stepRun, totalReal,
  type Decoy, type RunFrame, type RunState,
} from '../src/lib/bowobharata-game/mission-run';
import { initSight, stepSight, worldScale } from '../src/lib/bowobharata-game/sight';
import { ANCHORS } from '../src/lib/bowobharata-game/world';

const SLUGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const def = (ch: number) => missionFor(ch, ch === 0 ? [] : SLUGS.slice(0, [0, 2, 2, 4, 9, 1, 2, 2, 2][ch]));
const DT = 1 / 60;

function frame(o: { at?: { x: number; z: number }; prev?: { x: number; z: number }; speed?: number } & Partial<RunFrame> = {}): RunFrame {
  const { at = { x: 0, z: 0 }, prev, speed = 0, ...rest } = o;
  const car = { ...initChariot(at.x, at.z, 0), vx: speed, vz: 0 };
  return { car, mid: at, midPrev: prev ?? at, dt: DT, sight: false, skip: false, riuh: 0, decoys: [], ...rest };
}
const active = (ch: number, over: Partial<RunState> = {}): RunState => ({ ...startRun(def(ch)), phase: 'active', ...over });
const decoy = (id: number, x: number, z: number): Decoy => ({ id, at: { x, z }, born: 0, life: null, state: 'open', mimic: false });
const types = (e: { type: string }[]) => e.map((x) => x.type);

describe('sight', () => {
  it('stays on 4 s from full, then turns off', () => {
    let s = initSight();
    let t = 0;
    s = stepSight(s, true, DT);
    expect(s.on).toBe(true);
    while (s.on) { t += DT; s = stepSight(s, true, DT); }
    expect(Math.abs(t - 4)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(stepSight(s, true, DT).on).toBe(false);
  });
  it('cannot turn on below 0.15 and recharges in 10 s', () => {
    expect(stepSight({ charge: 0.14, on: false }, true, DT).on).toBe(false);
    expect(stepSight({ charge: 0.15, on: false }, true, DT).on).toBe(true);
    let s = { charge: 0, on: false };
    for (let i = 0; i < 600; i++) s = stepSight(s, false, DT);
    expect(s.charge).toBeCloseTo(1, 6);
  });
  it('scales the world', () => {
    expect(worldScale({ charge: 1, on: true })).toBe(0.5);
    expect(worldScale({ charge: 1, on: false })).toBe(1);
  });
});

describe('roam and intro', () => {
  const m = def(1).marker!;
  it('starts in roam with a marker, intro without', () => {
    expect(startRun(def(1)).phase).toBe('roam');
    expect(startRun(def(0)).phase).toBe('intro');
  });
  it('enters the intro at the marker below 8 m/s only', () => {
    const slow = stepRun(startRun(def(1)), frame({ at: m, speed: 5 }));
    expect(types(slow.events)).toEqual(['introStart']);
    expect(slow.run.phase).toBe('intro');
    const fast = stepRun(startRun(def(1)), frame({ at: m, speed: 12 }));
    expect(fast.run.phase).toBe('roam');
    expect(fast.events).toEqual([]);
  });
  it('ignores an early skip, honours a late one, and times out at 3.5 s', () => {
    const intro = (phaseT: number): RunState => ({ ...startRun(def(1)), phase: 'intro', phaseT });
    expect(stepRun(intro(0.5), frame({ skip: true })).run.phase).toBe('intro');
    const late = stepRun(intro(0.9), frame({ skip: true }));
    expect(late.run.phase).toBe('active');
    expect(types(late.events)).toEqual(['introEnd', 'checkpoint']);
    let r = intro(0);
    let n = 0;
    while (r.phase === 'intro') { r = stepRun(r, frame()).run; n++; }
    expect(n * DT).toBeGreaterThanOrEqual(3.5);
    expect(n * DT).toBeLessThan(3.5 + 2 * DT);
    expect(r.checkpoint).not.toBeNull();
  });
});

describe('collect', () => {
  it('records at speed along the swept segment', () => {
    const r = stepRun(active(0), frame({ prev: { x: -22, z: 32 }, at: { x: 18, z: 32 } }));
    expect(r.events).toEqual([{ type: 'recorded', id: 'L1', card: 0, n: 1, total: 8 }]);
    expect(r.run.recorded).toEqual(['L1']);
    expect(r.run.score).toBe(SCORE.real);
  });
  it('misses an item 3.1 m off the segment', () => {
    const r = stepRun(active(0), frame({ prev: { x: -22, z: 35.1 }, at: { x: 18, z: 35.1 } }));
    expect(r.run.recorded).toEqual([]);
  });
  it('finishes the step with a checkpoint', () => {
    const d = def(0);
    const all = realTargets(d).map((t) => t.id);
    const r = stepRun(active(0, { recorded: all.slice(0, 7) }), frame({ at: { x: -54, z: 24 } }));
    expect(types(r.events)).toEqual(['recorded', 'stepDone', 'checkpoint']);
    expect(r.run.step).toBe(1);
    expect(r.run.checkpoint?.step).toBe(1);
  });
});

describe('reach', () => {
  const t = ANCHORS.tower;
  const atTower = (run: RunState, seconds: number, speed: number) => {
    let out = { run, events: [] as { type: string }[] };
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const r = stepRun(out.run, frame({ at: t, speed }));
      out = { run: r.run, events: [...out.events, ...r.events] };
    }
    return out;
  };
  const ready = () => active(0, { step: 1, recorded: realTargets(def(0)).map((x) => x.id) });
  it('needs the full stop time', () => {
    expect(types(atTower(ready(), 1.1, 3).events)).toEqual([]);
    const done = types(atTower(ready(), 1.3, 3).events);
    expect(done).toContain('stepDone');
    expect(done).toContain('outroStart');
  });
  it('resets when the car leaves, or speeds', () => {
    const a = atTower(ready(), 1.0, 3);
    const left = stepRun(a.run, frame({ at: { x: t.x + 30, z: t.z }, speed: 3 }));
    expect(left.run.stopT).toBe(0);
    const fast = stepRun(a.run, frame({ at: t, speed: 6 }));
    expect(fast.run.stopT).toBe(0);
  });
});

describe('copies and fails', () => {
  it('files with sight, takes without', () => {
    const d = [decoy(1, 0, 0)];
    const f = stepRun(active(1), frame({ sight: true, decoys: d }));
    expect(types(f.events)).toEqual(['filed']);
    expect(f.run.score).toBe(SCORE.filed);
    expect(f.decoys[0].state).toBe('filed');
    expect(d[0].state).toBe('open');
    const taken = stepRun(active(1, { score: 100 }), frame({ decoys: d }));
    expect(types(taken.events)).toEqual(['rewriteTaken']);
    expect(taken.run.score).toBe(50);
    expect(taken.decoys[0].state).toBe('taken');
  });
  it('does not count rewrites before t 45, and fails muddied after', () => {
    const three = [decoy(1, 0, 0), decoy(2, 0, 0), decoy(3, 0, 0)];
    const early = stepRun(active(1, { t: 30 }), frame({ decoys: three }));
    expect(early.run.decoysTaken).toBe(0);
    expect(early.run.phase).toBe('active');
    const late = stepRun(active(1, { t: 46 }), frame({ decoys: three }));
    expect(late.events).toContainEqual({ type: 'failed', reason: 'muddied' });
    expect(late.run.phase).toBe('failed');
    expect(late.run.failReason).toBe('muddied');
    expect(late.run.fails).toBe(1);
  });
  it('fails on time only from t 45', () => {
    const r = stepRun(active(1, { t: 120.1 }), frame());
    expect(r.events).toContainEqual({ type: 'failed', reason: 'time' });
    expect(r.run.failReason).toBe('time');
    expect(stepRun(active(1, { t: 30 }), frame()).run.phase).toBe('active');
  });
});

describe('restore', () => {
  it('returns to the checkpoint with fairness', () => {
    const car = { ...initChariot(10, 20, 1.2), vx: 4 };
    const run = checkpoint(active(1, { recorded: ['A'], t: 100, step: 0, decoysTaken: 3, fails: 1, phase: 'failed' }), car, 4);
    const r = restore({ ...run, t: 118, decoysTaken: 3 });
    expect(r.car).toEqual({ x: 10, z: 20, yaw: 1.2 });
    expect(r.riuh).toBeLessThanOrEqual(1);
    expect(r.run.phase).toBe('active');
    expect(r.run.recorded).toEqual(['A']);
    expect(r.run.decoysTaken).toBe(0);
    expect(r.run.fails).toBe(1);
    expect(r.run.def.softTime! - r.run.t).toBeGreaterThanOrEqual(60);
  });
  it('keeps a calm riuh as it was', () => {
    const run = checkpoint(active(1), initChariot(0, 0, 0), 0.4);
    expect(restore(run).riuh).toBe(0.4);
  });
});

describe('skip and score', () => {
  it('autoRecord records everything and ends not whole', () => {
    const a = autoRecord(startRun(def(3)));
    const ids = a.events.filter((e) => e.type === 'recorded').map((e) => (e as { id: string }).id);
    expect(ids).toEqual(realTargets(def(3)).map((x) => x.id));
    expect(a.run.phase).toBe('outro');
    expect(a.run.whole).toBe(false);
    let r = a.run;
    let out: { type: string }[] = [];
    for (let i = 0; i < 160 && r.phase === 'outro'; i++) {
      const s = stepRun(r, frame());
      r = s.run;
      out = out.concat(s.events);
    }
    expect(out).toContainEqual(expect.objectContaining({ type: 'done', whole: false }));
  });
  const deliver = (run: RunState, riuh: number) => {
    const r = active(1, { ...run, step: 1, t: 100 });
    let s = r;
    let ev: { type: string; score?: number }[] = [];
    for (let i = 0; i < 400 && s.phase !== 'done'; i++) {
      const out = stepRun(s, frame({ at: ANCHORS.tower, speed: 1, riuh }));
      s = out.run;
      ev = ev.concat(out.events);
    }
    return ev.find((e) => e.type === 'done')!.score!;
  };
  it('sums records, filed and taken', () => {
    const base = active(1, { recorded: ['A', 'B'] });
    let r = stepRun(base, frame({ sight: true, decoys: [decoy(1, 0, 0)] })).run;
    r = { ...r, score: 200 };
    r = stepRun(r, frame({ sight: true, decoys: [decoy(1, 0, 0)] })).run;
    r = stepRun(r, frame({ decoys: [decoy(2, 0, 0)] })).run;
    expect(r.score).toBe(200);
  });
  it('adds the calm bonus at riuh <= 1 only, and never goes below 0', () => {
    const rec = { recorded: ['A', 'B'], score: 200, t: 100 };
    const calm = deliver(rec as RunState, 1);
    const loud = deliver(rec as RunState, 2);
    expect(calm - loud).toBe(SCORE.calm);
    expect(loud).toBeGreaterThanOrEqual(200);
    expect(stepRun(active(1, { score: 0 }), frame({ decoys: [decoy(1, 0, 0)] })).run.score).toBe(0);
  });
  it('adds time under par', () => {
    const fast = deliver({ recorded: ['A', 'B'], score: 0 } as RunState, 3);
    expect(fast).toBe(0);
    const quick = stepRun(active(1, { step: 1, recorded: ['A', 'B'], t: 10, stopT: 1.19 }), frame({ at: ANCHORS.tower, speed: 1, riuh: 3 }));
    expect(quick.run.score).toBe(Math.floor(SCORE.perSecond * (SCORE.par * 120 - (10 + DT))));
  });
});

describe('openTargets', () => {
  it('lists the prologue pickups, then the tower', () => {
    const open = openTargets(startRun(def(0)));
    expect(open.map((o) => o.kind)).toEqual(Array(8).fill('pickup'));
    const all = realTargets(def(0)).map((x) => x.id);
    const reach = openTargets(active(0, { step: 1, recorded: all }));
    expect(reach).toEqual([expect.objectContaining({ kind: 'reach', real: true, at: ANCHORS.tower })]);
  });
  it('lists the marker in roam', () => {
    expect(openTargets(startRun(def(1)))).toEqual([{ kind: 'marker', id: 'marker', at: def(1).marker, real: true }]);
  });
  it('counts the real targets', () => {
    expect(totalReal(def(0))).toBe(8);
    expect(totalReal(def(4))).toBe(9);
  });
  it('throws on course and laps steps', () => {
    const d = { ...def(1), steps: [{ kind: 'course' as const, days: [] }] };
    expect(() => stepRun({ ...startRun(d), phase: 'active' }, frame())).toThrow();
  });
});
