import { describe, expect, it } from 'vitest';
import { initChariot } from '../src/lib/bowobharata-game/drive';
import { missionFor, realTargets, type StepDef } from '../src/lib/bowobharata-game/missions';
import {
  autoRecord, checkpoint, openTargets, restore, SCORE, timeLeft, startRun, stepRun, totalReal,
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
    for (let i = 0; i < 400 && s.on; i++) { t += DT; s = stepSight(s, true, DT); }
    expect(s.on).toBe(false);
    expect(Math.abs(t - 4)).toBeLessThanOrEqual(1 / 60 + 1e-9);
    expect(stepSight(s, true, DT).on).toBe(false);
  });
  it('cannot turn on below 0.15 and recharges in 10 s', () => {
    expect(stepSight({ charge: 0.14, on: false, latch: false }, true, DT).on).toBe(false);
    expect(stepSight({ charge: 0.15, on: false, latch: false }, true, DT).on).toBe(true);
    let s = { charge: 0, on: false, latch: false };
    for (let i = 0; i < 300; i++) s = stepSight(s, false, DT);
    expect(s.charge).toBeCloseTo(0.5, 6);
    for (let i = 300; i < 590; i++) s = stepSight(s, false, DT);
    expect(s.charge).toBeLessThan(1);
    for (let i = 590; i < 600; i++) s = stepSight(s, false, DT);
    expect(s.charge).toBeCloseTo(1, 6);
  });
  it('needs a release before it turns on again', () => {
    let s = initSight();
    for (let i = 0; i < 300 && !(s.latch); i++) s = stepSight(s, true, DT);
    expect(s.latch).toBe(true);
    for (let i = 0; i < 800; i++) s = stepSight(s, true, DT);
    expect(s.charge).toBe(1);
    expect(s.on).toBe(false);
    s = stepSight(s, false, DT);
    expect(s.latch).toBe(false);
    expect(stepSight(s, true, DT).on).toBe(true);
  });
  it('treats a bad dt as zero', () => {
    const s = { charge: 0.5, on: true, latch: false };
    expect(stepSight(s, true, NaN).charge).toBe(0.5);
    expect(stepSight(s, true, -1).charge).toBe(0.5);
  });
  it('scales the world', () => {
    expect(worldScale({ charge: 1, on: true, latch: false })).toBe(0.5);
    expect(worldScale({ charge: 1, on: false, latch: false })).toBe(1);
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
  it('stays in roam at 12 m/s sideways and 5.1 m from the marker', () => {
    const side = frame({ at: m });
    side.car = { ...side.car, vx: 0, vz: 12 };
    expect(stepRun(startRun(def(1)), side).run.phase).toBe('roam');
    expect(stepRun(startRun(def(1)), frame({ at: { x: m.x + 5.1, z: m.z }, speed: 2 })).run.phase).toBe('roam');
    expect(stepRun(startRun(def(1)), frame({ at: { x: m.x + 4.9, z: m.z }, speed: 2 })).run.phase).toBe('intro');
  });
  it('ignores an early skip, honours a late one, and times out at 3.5 s', () => {
    const intro = (phaseT: number): RunState => ({ ...startRun(def(1)), phase: 'intro', phaseT });
    expect(stepRun(intro(0.5), frame({ skip: true })).run.phase).toBe('intro');
    const late = stepRun(intro(0.9), frame({ skip: true }));
    expect(late.run.phase).toBe('active');
    expect(types(late.events)).toEqual(['introEnd', 'checkpoint']);
    let r = intro(0);
    let n = 0;
    while (r.phase === 'intro' && n < 400) { r = stepRun(r, frame()).run; n++; }
    expect(r.phase).toBe('active');
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
  it('does not count 6 m/s sideways toward the stop', () => {
    const f = frame({ at: t });
    f.car = { ...f.car, vx: 0, vz: 6 };
    expect(stepRun(ready(), f).run.stopT).toBe(0);
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
  it('takes a copy 2.1 m off a fast segment and not 2.3 m', () => {
    const seg = { prev: { x: -20, z: 0 }, at: { x: 20, z: 0 } };
    expect(stepRun(active(1), frame({ ...seg, decoys: [decoy(1, 0, 2.1)] })).events).toEqual([{ type: 'rewriteTaken' }]);
    expect(stepRun(active(1), frame({ ...seg, decoys: [decoy(1, 0, 2.3)] })).events).toEqual([]);
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

describe('the grace before t 45', () => {
  const soft = (n: number): RunState => ({ ...active(1), def: { ...def(1), softTime: n } });
  it('softTime 30 fails only from t 45', () => {
    expect(stepRun({ ...soft(30), t: 44.9 - DT }, frame()).run.phase).toBe('active');
    const r = stepRun({ ...soft(30), t: 45.1 }, frame());
    expect(r.events).toContainEqual({ type: 'failed', reason: 'time' });
  });
  it('a full decoy count fails only from t 45', () => {
    const base = active(1, { decoysTaken: 3 });
    expect(stepRun({ ...base, t: 44.9 - DT }, frame()).run.phase).toBe('active');
    expect(stepRun({ ...base, t: 45.1 }, frame()).events).toContainEqual({ type: 'failed', reason: 'muddied' });
  });
  it('a leg limit fails only from t 45', () => {
    const d = { ...def(1), softTime: null, legTimes: [{ fromStep: 0, seconds: 10 }] };
    const base: RunState = { ...active(1), def: d, legT: 20 };
    expect(stepRun({ ...base, t: 30 }, frame()).run.phase).toBe('active');
    expect(stepRun({ ...base, t: 45.1 }, frame()).events).toContainEqual({ type: 'failed', reason: 'time' });
  });
  it('legs: a leg spanning two steps is not reset by the middle step', () => {
    const d = { ...def(2), legTimes: [{ fromStep: 0, seconds: 100 }, { fromStep: 2, seconds: 100 }] };
    const items = (d.steps[0] as { items: { id: string; at: { x: number; z: number } }[] }).items;
    const run: RunState = { ...active(2), def: d, legT: 30, extraTime: 5 };
    const two: RunState = { ...run, recorded: [items[0].id] };
    const r = stepRun(two, frame({ at: items[1].at }));
    expect(r.run.step).toBe(1);
    expect(r.run.legT).toBeGreaterThan(30);
    expect(r.run.leg).toBe(0);
    const third = stepRun({ ...r.run, step: 1 }, frame());
    expect(third.run.leg).toBe(0);
  });
  it('a new leg resets the leg clock and extra time', () => {
    const d = { ...def(2), steps: [def(2).steps[1], def(2).steps[1], def(2).steps[1]], legTimes: [{ fromStep: 0, seconds: 100 }, { fromStep: 2, seconds: 100 }] };
    const run: RunState = { ...active(2), def: d, step: 1, legT: 30, extraTime: 5 };
    const r = stepRun({ ...run, stopT: 5 }, frame({ at: ANCHORS.tower, speed: 1 }));
    expect(r.run.step).toBe(2);
    expect(r.run.legT).toBe(0);
    expect(r.run.leg).toBe(1);
    expect(r.run.extraTime).toBe(0);
  });
});

describe('restore', () => {
  it('puts the car at the checkpoint and keeps what was recorded and scored', () => {
    const car = { ...initChariot(10, 20, 1.2), vx: 4 };
    const a = realTargets(def(1))[0];
    const item = (def(1).steps[0] as { items: { id: string; at: { x: number; z: number } }[] }).items.find((i) => i.id === a.id)!;
    let run = checkpoint(active(1, { t: 100, fails: 1 }), car, 4);
    run = stepRun(run, frame({ at: item.at })).run;
    expect(run.recorded).toEqual([a.id]);
    const score = run.score;
    run = { ...run, phase: 'failed', decoysTaken: 3, filed: 2 };
    const r = restore(run);
    expect(r.car).toEqual({ x: 10, z: 20, yaw: 1.2 });
    expect(r.riuh).toBeLessThanOrEqual(1);
    expect(r.run.phase).toBe('active');
    expect(r.run.recorded).toEqual([a.id]);
    expect(r.run.score).toBe(score);
    expect(r.run.filed).toBe(2);
    expect(r.run.decoysTaken).toBe(0);
    expect(r.run.fails).toBe(1);
    expect(timeLeft(r.run)!).toBeGreaterThanOrEqual(60);
    expect(r.run.def.softTime).toBe(120);
    expect(stepRun(r.run, frame({ at: item.at })).run.score).toBe(score);
  });
  it('leaves at least 60 s on the leg', () => {
    const d = { ...def(2), softTime: null, legTimes: [{ fromStep: 0, seconds: 100 }] };
    const run = checkpoint({ ...active(2), def: d, legT: 90, t: 90 }, initChariot(0, 0, 0), 0);
    expect(timeLeft(restore(run).run)!).toBeGreaterThanOrEqual(60);
  });
  it('keeps the par after a restore', () => {
    const run = checkpoint(active(1, { t: 110, step: 1, recorded: ['A', 'B'] }), initChariot(0, 0, 0), 0);
    const r = restore(run).run;
    expect(r.extraTime).toBeGreaterThan(0);
    const out = stepRun({ ...r, t: 10, stopT: 1.19 }, frame({ at: ANCHORS.tower, speed: 1, riuh: 3 }));
    expect(out.run.score).toBe(Math.floor(SCORE.perSecond * (SCORE.par * 120 - (10 + DT))));
  });
  it('keeps a calm riuh as it was', () => {
    const run = checkpoint(active(1), initChariot(0, 0, 0), 0.4);
    expect(restore(run).riuh).toBe(0.4);
  });
  it('has no timer to extend without limits', () => {
    expect(timeLeft(active(0))).toBeNull();
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
  const withCopy = (r: RunState, sight: boolean, id: number) => stepRun(r, frame({ sight, decoys: [decoy(id, 0, 0)] })).run;
  it('2 records + 1 filed + 1 taken = 200, in either order', () => {
    const items = (def(1).steps[0] as { items: { at: { x: number; z: number } }[] }).items;
    for (const filedFirst of [true, false]) {
      let r = active(1);
      r = stepRun(r, frame({ at: items[0].at })).run;
      r = withCopy(r, filedFirst, 1);
      r = withCopy(r, !filedFirst, 2);
      expect(r.score).toBe(100);
      r = stepRun(r, frame({ at: items[1].at })).run;
      expect(r.score).toBe(200);
    }
  });
  it('adds the calm bonus at riuh <= 1 only', () => {
    const rec = { recorded: ['A', 'B'], score: 200, t: 100 };
    const calm = deliver(rec as RunState, 1);
    const loud = deliver(rec as RunState, 2);
    expect(calm - loud).toBe(SCORE.calm);
    expect(loud).toBeGreaterThanOrEqual(200);
  });
  it('clamps only the delivered score at 0', () => {
    const r = withCopy(active(1), false, 1);
    expect(r.score).toBe(SCORE.rewrite);
    expect(deliver({ recorded: ['A', 'B'], score: -500, t: 100 } as RunState, 3)).toBe(0);
  });
  it('does not end before the outro is over', () => {
    let r: RunState = { ...active(1), phase: 'outro', phaseT: 0 };
    let seen: string[] = [];
    for (let i = 0; i < 100; i++) { const s = stepRun(r, frame()); r = s.run; seen = seen.concat(types(s.events)); }
    expect(seen).not.toContain('done');
    expect(r.phase).toBe('outro');
  });
  it('autoRecord clears a failure', () => {
    const a = autoRecord(active(1, { phase: 'failed', failReason: 'time' }));
    expect(a.run.failReason).toBeNull();
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
    const laps = { ...def(1), steps: [{ kind: 'laps' as const, posts: [], then: (def(1).steps[0] as Extract<StepDef, { kind: 'collect' }>).items[0] }] };
    expect(() => stepRun({ ...startRun(laps), phase: 'active' }, frame())).toThrow();
  });
  it('treats a bad dt as zero', () => {
    const run = active(1, { t: 5 });
    expect(stepRun(run, { ...frame(), dt: NaN }).run.t).toBe(5);
    expect(stepRun(run, { ...frame(), dt: -1 }).run.t).toBe(5);
  });
});
