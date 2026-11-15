import { describe, expect, it } from 'vitest';
import { initChariot } from '../src/lib/bowobharata-game/drive';
import { HULL, hullCircles, hullClearance } from '../src/lib/bowobharata-game/collide';
import { angleDiff, forward, rightOf, segPointDist, yawOf, type XZ } from '../src/lib/bowobharata-game/geom';
import { missionFor, realTargets, type DayDef, type MissionDef, type StepDef } from '../src/lib/bowobharata-game/missions';
import {
  autoRecord, checkpoint, openTargets, restore, SCORE, timeLeft, startRun, stepRun, totalReal,
  type Decoy, type RunFrame, type RunState,
} from '../src/lib/bowobharata-game/mission-run';
import { initSight, stepSight, worldScale } from '../src/lib/bowobharata-game/sight';
import { ANCHORS, staticColliders } from '../src/lib/bowobharata-game/world';

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

const daysOf = (d: MissionDef): DayDef[] => (d.steps[0] as Extract<StepDef, { kind: 'course' }>).days;
const lapsOf = (d: MissionDef) => d.steps[0] as Extract<StepDef, { kind: 'laps' }>;
/** The point `lateral` m along rightOf(heading) from the day's or post's centre, and `ahead` m along its heading. */
function across(d: { at: XZ; heading: number }, lateral: number, ahead = 0): XZ {
  const r = rightOf(d.heading);
  const f = forward(d.heading);
  return { x: d.at.x + r.x * lateral + f.x * ahead, z: d.at.z + r.z * lateral + f.z * ahead };
}
/** A frame whose hull middle crosses the line of `d` at `lateral` m, forward along the heading or, with `back`, against it. */
function through(d: { at: XZ; heading: number }, lateral: number, back = false, over: Partial<RunFrame> = {}): RunFrame {
  const [from, to] = back ? [2, -2] : [-2, 2];
  return frame({ prev: across(d, lateral, from), at: across(d, lateral, to), ...over });
}

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
    const d = { ...def(1), legTimes: [{ fromStep: 0, seconds: 100 }, { fromStep: 2, seconds: 100 }] };
    const items = (d.steps[0] as { items: { id: string; at: { x: number; z: number } }[] }).items;
    const run: RunState = { ...active(1), def: d, legT: 30, extraTime: 5 };
    const two: RunState = { ...run, recorded: [items[0].id] };
    const r = stepRun(two, frame({ at: items[1].at }));
    expect(r.run.step).toBe(1);
    expect(r.run.legT).toBeGreaterThan(30);
    expect(r.run.leg).toBe(0);
    const third = stepRun({ ...r.run, step: 1 }, frame());
    expect(third.run.leg).toBe(0);
  });
  it('a new leg resets the leg clock and extra time', () => {
    const d = { ...def(1), steps: [def(1).steps[1], def(1).steps[1], def(1).steps[1]], legTimes: [{ fromStep: 0, seconds: 100 }, { fromStep: 2, seconds: 100 }] };
    const run: RunState = { ...active(1), def: d, step: 1, legT: 30, extraTime: 5 };
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
  it('a course leads to the next day: its real gate’s centre, or the outer lane 9.5 m out on the side the course comes from', () => {
    const d = def(4);
    const days = daysOf(d);
    const open = openTargets(active(4));
    const l1 = days[0].gates.find((g) => g.real)!;
    expect(open[0]).toEqual({ kind: 'gate', id: 'day1', at: across(days[0], l1.offset), real: true, heading: days[0].heading, width: 6 });
    // Day 2 holds two rewrites: the lane on day 1's real gate's side.
    const side = Math.sign(l1.offset);
    expect(open[1]).toEqual({ kind: 'gate', id: 'day2', at: across(days[1], side * 9.5), real: false, heading: days[1].heading, width: 4 });
    expect(open.map((t) => t.id)).toEqual(days.map((_, k) => `day${k + 1}`));
    const all = realTargets(d).map((t) => t.id);
    expect(openTargets(active(4, { dayIndex: 17, recorded: all })).map((t) => t.id)).toEqual(['day18']);
    // A real gate passed by stays open after the days ahead.
    expect(openTargets(active(4, { dayIndex: 17, recorded: all.slice(1) })).map((t) => t.id)).toEqual(['day18', all[0]]);
  });
  it('each day of two rewrites leads through its outer lane on the nearer side, but round a 60° corner on its outside', () => {
    const lane = (ch: number, day: number) => openTargets(active(ch)).find((t) => t.id === `day${day}`)!;
    // Parva 4: days 11 and 16 come round the course's 90° corners, so their lane is on the outside of the turn.
    const P4: [number, -1 | 1][] = [[2, -1], [5, -1], [7, -1], [10, 1], [11, -1], [13, 1], [15, -1], [16, -1], [18, -1]];
    const d4 = daysOf(def(4));
    expect(d4.flatMap((d, k) => (d.gates.some((g) => g.real) ? [] : [k + 1]))).toEqual(P4.map(([day]) => day));
    for (const [day, side] of P4) {
      expect(lane(4, day), `parva 4 day ${day}`).toMatchObject({ real: false, at: across(d4[day - 1], side * 9.5), width: 4 });
    }
    expect(Math.abs(angleDiff(d4[10].heading, d4[9].heading))).toBeCloseTo(Math.PI / 2, 12);
    expect(Math.abs(angleDiff(d4[15].heading, d4[14].heading))).toBeCloseTo(Math.PI / 2, 12);
    // Parva 7 bends gently: both of its days of two rewrites take the nearer, right-hand lane.
    const d7 = daysOf(def(7));
    for (const day of [1, 3]) expect(lane(7, day), `parva 7 day ${day}`).toMatchObject({ at: across(d7[day - 1], 9.5) });
  });
  it('the lane of a course’s first day reads the lakon’s own start', () => {
    const d = def(7);
    const day1 = daysOf(d)[0];
    // From a start far to day 1's left, along its heading, the nearer lane is the left one.
    const from = across(day1, -30, -20);
    const moved: MissionDef = { ...d, start: { x: from.x, z: from.z, yaw: day1.heading } };
    expect(openTargets({ ...startRun(d), phase: 'active' })[0].at).toEqual(across(day1, 9.5));
    expect(openTargets({ ...startRun(moved), phase: 'active' })[0].at).toEqual(across(day1, -9.5));
  });
  it('a lap course leads to the next post, and to the record after it once the laps match', () => {
    const { posts, then } = lapsOf(def(5));
    expect(openTargets(active(5)).map((t) => [t.kind, t.at])).toEqual([['post', posts[0].at], ['post', posts[1].at]]);
    // In lap 2 the next post is P4; ids name the post and its lap, P1 opening each lap.
    const second = openTargets(active(5, { lapStart: 3, lapPost: 3, laps: [50] }));
    expect(second[0]).toEqual({ kind: 'post', id: 'P4-2', at: posts[3].at, real: true, heading: posts[3].heading, width: 8 });
    expect(openTargets(active(5)).map((t) => t.id)).toEqual(['P1-1', 'P2-1']);
    expect(openTargets(active(5, { lapStart: 3, lapPost: 0, laps: [50] })).map((t) => t.id)).toEqual(['P1-3', 'P2-3']);
    expect(openTargets(active(5, { lapStart: 3, lapPost: 1, laps: [50, 52], matched: true }))).toEqual([
      { kind: 'pickup', id: then.id, at: then.at, real: true },
    ]);
  });
  it('treats a bad dt as zero', () => {
    const run = active(1, { t: 5 });
    expect(stepRun(run, { ...frame(), dt: NaN }).run.t).toBe(5);
    expect(stepRun(run, { ...frame(), dt: -1 }).run.t).toBe(5);
  });
});

describe('course (parva 4)', () => {
  const days = daysOf(def(4));
  const realOf = (k: number) => days[k].gates.find((g) => g.real)!;

  it('day 1’s real span records it; a span on day 2 takes a rewrite; day 3’s gap records nothing; each advances the day', () => {
    let run = active(4, { t: 30 });
    const one = stepRun(run, through(days[0], realOf(0).offset));
    expect(one.events).toEqual([
      { type: 'gate', real: true, day: 1 },
      { type: 'recorded', id: realOf(0).id, card: 0, n: 1, total: 9 },
    ]);
    expect(one.run.recorded).toEqual([realOf(0).id]);
    expect(one.run.score).toBe(SCORE.real);
    expect(one.run.dayIndex).toBe(1);
    run = one.run;

    const two = stepRun(run, through(days[1], days[1].gates[0].offset));
    expect(two.events).toEqual([{ type: 'gate', real: false, day: 2 }, { type: 'rewriteTaken' }]);
    expect(two.run.decoysTaken).toBe(0);
    expect(two.run.score).toBe(SCORE.real + SCORE.rewrite);
    expect(two.run.dayIndex).toBe(2);
    run = two.run;

    const three = stepRun(run, through(days[2], 0));
    expect(three.events).toEqual([]);
    expect(three.run.recorded).toEqual([realOf(0).id]);
    expect(three.run.dayIndex).toBe(3);

    // The same rewrite crossed at t 46 counts toward the fail.
    const late = stepRun({ ...one.run, t: 46 }, through(days[1], days[1].gates[1].offset));
    expect(late.events).toEqual([{ type: 'gate', real: false, day: 2 }, { type: 'rewriteTaken' }]);
    expect(late.run.decoysTaken).toBe(1);
  });

  it('an open real gate crossed later, from the other side, is recorded: day 3’s, after its gap', () => {
    const passed = stepRun(active(4, { dayIndex: 2, recorded: [realOf(0).id] }), through(days[2], 0)).run;
    expect(passed.dayIndex).toBe(3);
    const back = stepRun(passed, through(days[2], realOf(2).offset, true));
    expect(back.events).toEqual([
      { type: 'gate', real: true, day: 3 },
      { type: 'recorded', id: realOf(2).id, card: 1, n: 2, total: 9 },
    ]);
    // Back over the line it came through: the day does not move again.
    expect(back.run.dayIndex).toBe(3);
  });

  it('a rewrite gate is taken once; three taken from t 45 fail the lakon muddied', () => {
    const r1 = stepRun(active(4, { t: 50 }), through(days[1], -4.5));
    expect(r1.run.decoysTaken).toBe(1);
    const again = stepRun(r1.run, through(days[1], -4.5, true));
    expect(again.events).toEqual([]);
    expect(again.run.decoysTaken).toBe(1);
    // Day 5 holds two rewrites as well, and it is not passed yet.
    expect(days[4].gates.some((g) => g.real)).toBe(false);
    expect(again.run.dayIndex).toBeLessThanOrEqual(4);
    const r2 = stepRun(again.run, through(days[4], 4.5));
    const r3 = stepRun(r2.run, through(days[4], -4.5));
    expect(r3.run.decoysTaken).toBe(3);
    expect(r3.events).toContainEqual({ type: 'failed', reason: 'muddied' });
    expect(r3.run.phase).toBe('failed');
  });

  it('a passed day’s rewrite gates are inert; its real gate stays open from either side; the day being crossed counts', () => {
    const passed = active(4, { dayIndex: 3, t: 50 });
    for (const back of [false, true]) {
      const r = stepRun(passed, through(days[1], days[1].gates[0].offset, back));
      expect(r.events).toEqual([]);
      expect([r.run.decoysTaken, r.run.taken, r.run.score]).toEqual([0, [], 0]);
    }
    expect(types(stepRun(passed, through(days[2], realOf(2).offset, true)).events)).toEqual(['gate', 'recorded']);
    // Day 4's line is the next one: its gates count in the frame that passes it.
    const four = active(4, { dayIndex: 3, t: 50 });
    const rewrite = days[3].gates.find((g) => !g.real)!;
    const r = stepRun(four, through(days[3], rewrite.offset));
    expect(r.events).toEqual([{ type: 'gate', real: false, day: 4 }, { type: 'rewriteTaken' }]);
    expect([r.run.dayIndex, r.run.decoysTaken]).toEqual([4, 1]);
  });

  it('a frame ending exactly on a gate span counts there, once', () => {
    // Day 6 faces due east, so its line lies exactly on x = −50.
    expect(days[5].heading).toBe(0);
    const real = realOf(5);
    const on = stepRun(active(4, { dayIndex: 5 }), frame({ prev: across(days[5], real.offset, -2), at: across(days[5], real.offset, 0) }));
    expect(on.events).toEqual([
      { type: 'gate', real: true, day: 6 },
      { type: 'recorded', id: real.id, card: 3, n: 1, total: 9 },
    ]);
    expect(on.run.dayIndex).toBe(6);
    // On to day 7, and back onto day 6's line from beyond it: nothing more.
    const off = stepRun(on.run, frame({ prev: across(days[5], real.offset, 0), at: across(days[5], real.offset, 2) }));
    expect(off.events).toEqual([]);
    const backOn = stepRun(off.run, frame({ prev: across(days[5], real.offset, 2), at: across(days[5], real.offset, 0) }));
    expect(backOn.events).toEqual([]);
    expect(backOn.run.recorded).toEqual([real.id]);
  });

  it('the line runs 11.5 m each way: past its end the day holds; within 6 m of the following day’s centre it moves on', () => {
    expect(stepRun(active(4), through(days[0], 11.4)).run.dayIndex).toBe(1);
    expect(stepRun(active(4), through(days[0], -11.6)).run.dayIndex).toBe(0);
    const near = stepRun(active(4), frame({ at: across(days[1], 5.9) })).run;
    expect(near.dayIndex).toBe(1);
    expect(stepRun(active(4), frame({ at: across(days[1], 6.1) })).run.dayIndex).toBe(0);
  });

  it('the course ends once every day is passed with every real gate recorded: a checkpoint, then the tower', () => {
    const all = days.flatMap((d) => d.gates.filter((g) => g.real).map((g) => g.id));
    const last = stepRun(active(4, { dayIndex: 17, recorded: all }), through(days[17], 9.5));
    expect(types(last.events)).toEqual(['stepDone', 'checkpoint']);
    expect(last.run.step).toBe(1);
    // A real gate still open after the last day keeps the course going, and leads back to it.
    const missing = stepRun(active(4, { dayIndex: 17, recorded: all.slice(1) }), through(days[17], 9.5)).run;
    expect(missing.step).toBe(0);
    expect(openTargets(missing)).toEqual([
      { kind: 'gate', id: all[0], at: across(days[0], realOf(0).offset), real: true, heading: days[0].heading, width: 6 },
    ]);
  });

  it('a retry rides the course again from the checkpoint’s day; what was recorded and the rewrites taken stay', () => {
    const cp = checkpoint(active(4), initChariot(-70, 58, Math.PI / 2), 0);
    const later: RunState = { ...cp, dayIndex: 9, recorded: [realOf(0).id], taken: ['D2L'], phase: 'failed', t: 100 };
    const r = restore(later).run;
    expect(r.dayIndex).toBe(0);
    expect(r.recorded).toEqual([realOf(0).id]);
    expect(r.taken).toEqual(['D2L']);
    // A rewrite gate counts once: crossed again after the retry, it gives nothing.
    expect(stepRun({ ...r, dayIndex: 1 }, through(days[1], -4.5)).events).toEqual([]);
  });

  it('passing a day leaves a silent checkpoint a few metres past its line, centred, facing the next day, in the clear', () => {
    const cols = staticColliders();
    for (const ch of [4, 7]) {
      const d = def(ch);
      const ds = daysOf(d);
      const spans = ds.flatMap((day) => day.gates.map((g) => [across(day, g.offset - g.width / 2), across(day, g.offset + g.width / 2)]));
      ds.forEach((day, k) => {
        const at = `parva ${ch} day ${k + 1}`;
        // Every real gate recorded: crossing at the gap records nothing, and the last day closes the course.
        const all = realTargets(d).map((t) => t.id);
        const r = stepRun(active(ch, { dayIndex: k, recorded: all }), through(day, 0));
        const cp = r.run.checkpoint!;
        if (k + 1 < ds.length) {
          // Silent: no checkpoint event, so no toast.
          expect(r.events, at).toEqual([]);
          expect(cp.dayIndex, at).toBe(k + 1);
          const f = forward(day.heading);
          const past = (cp.car.x - day.at.x) * f.x + (cp.car.z - day.at.z) * f.z;
          const side = (cp.car.x - day.at.x) * rightOf(day.heading).x + (cp.car.z - day.at.z) * rightOf(day.heading).z;
          expect(past, at).toBeGreaterThanOrEqual(2);
          expect(past, at).toBeLessThanOrEqual(5);
          expect(side, at).toBeCloseTo(0, 9);
          const next = ds[k + 1].at;
          expect(cp.car.yaw, at).toBeCloseTo(yawOf({ x: next.x - cp.car.x, z: next.z - cp.car.z }), 9);
          expect(hullClearance(cp.car.x, cp.car.z, cp.car.yaw, cols), at).toBeGreaterThanOrEqual(1);
          for (const c of hullCircles(cp.car.x, cp.car.z, cp.car.yaw)) {
            for (const [p, q] of spans) expect(segPointDist(c, p, q), at).toBeGreaterThan(HULL.r);
          }
          // The retry resumes there, with the records kept.
          const back = restore({ ...r.run, phase: 'failed', dayIndex: 0 });
          expect([back.car, back.run.dayIndex, back.run.recorded], at).toEqual([cp.car, k + 1, r.run.recorded]);
        } else {
          // The last day closes the course, and the step's own checkpoint follows.
          expect(types(r.events), at).toEqual(['stepDone', 'checkpoint']);
        }
      });
    }
  });

  it('autoRecord records every real gate', () => {
    const a = autoRecord(active(4));
    expect(a.run.recorded).toEqual(realTargets(def(4)).map((t) => t.id));
    expect(a.run.phase).toBe('outro');
  });
});

describe('laps (parva 5)', () => {
  const { posts, then } = lapsOf(def(5));
  /** Rides `laps` laps of the given seconds from a fresh active run, crossing P1 first at run.t 10. */
  function ride(laps: number[]): { run: RunState; events: { type: string }[] } {
    let run = active(5, { t: 10 - DT });
    let events: { type: string }[] = [];
    const go = (k: number, t: number) => {
      const r = stepRun({ ...run, t: t - DT }, through(posts[k], 0));
      run = r.run;
      events = [...events, ...r.events];
    };
    go(0, 10);
    let t = 10;
    for (const seconds of laps) {
      for (let k = 1; k < posts.length; k++) go(k, t + (seconds * k) / posts.length);
      t += seconds;
      go(0, t);
    }
    return { run, events };
  }

  it('laps of 50.0 and 56.0 s match: lap {matched: true}, and the record after them opens', () => {
    const { run, events } = ride([50, 56]);
    const laps = events.filter((e) => e.type === 'lap');
    expect(laps).toHaveLength(2);
    expect(laps[0]).toEqual({ type: 'lap', n: 1, seconds: expect.closeTo(50, 6), matched: false });
    expect(laps[1]).toEqual({ type: 'lap', n: 2, seconds: expect.closeTo(56, 6), matched: true });
    expect(run.matched).toBe(true);
    expect(openTargets(run)).toEqual([{ kind: 'pickup', id: then.id, at: then.at, real: true }]);
    const got = stepRun(run, frame({ at: then.at }));
    expect(types(got.events)).toEqual(['recorded', 'stepDone', 'checkpoint']);
    expect(got.run.step).toBe(1);
  });

  it('laps of 50 and 60 s do not match: a third lap is asked for, timed against the second', () => {
    const two = ride([50, 60]);
    expect(two.events.filter((e) => e.type === 'lap').at(-1)).toEqual({ type: 'lap', n: 2, seconds: expect.closeTo(60, 6), matched: false });
    expect(two.run.matched).toBe(false);
    expect(openTargets(two.run)[0]).toMatchObject({ kind: 'post', at: posts[1].at });
    // The record does not open before the laps match.
    expect(stepRun(two.run, frame({ at: then.at })).run.recorded).toEqual([]);
    const three = ride([50, 60, 66]);
    expect(three.events.filter((e) => e.type === 'lap').at(-1)).toMatchObject({ n: 3, matched: true });
  });

  it('after five laps the record opens whatever the times; posts out of order count for nothing', () => {
    expect(ride([40, 60, 40, 60]).run.matched).toBe(false);
    const five = ride([40, 60, 40, 60, 40]);
    expect(five.events.filter((e) => e.type === 'lap').at(-1)).toMatchObject({ n: 5, matched: true });
    // From P1, crossing P3 before P2 leaves the lap where it was.
    const started = stepRun(active(5), through(posts[0], 0)).run;
    expect(started.lapPost).toBe(1);
    expect(stepRun(started, through(posts[2], 0)).run.lapPost).toBe(1);
  });

  it('a post is passed only through its 8 m span', () => {
    expect(stepRun(active(5), through(posts[0], 3.9)).run.lapStart).not.toBeNull();
    expect(stepRun(active(5), through(posts[0], 4.1)).run.lapStart).toBeNull();
  });

  it('autoRecord records the record after the laps', () => {
    expect(autoRecord(active(5)).run.recorded).toEqual([then.id]);
  });
});

describe('Antar (parva 2)', () => {
  const gate = def(2).steps[1] as Extract<StepDef, { kind: 'reach' }>;

  it('reaching the gate gives the letter, then a checkpoint, and the second leg starts its clock', () => {
    let run = active(2, { step: 1, recorded: ['A'], legT: 40, t: 40 });
    let events: { type: string }[] = [];
    for (let k = 0; k < Math.round(1.6 / DT) && run.step === 1; k++) {
      const r = stepRun(run, frame({ at: gate.at, speed: 1 }));
      run = r.run;
      events = [...events, ...r.events];
    }
    expect(types(events)).toEqual(['stepDone', 'letter', 'checkpoint']);
    expect(run.step).toBe(2);
    expect([run.legT, run.leg]).toEqual([0, 1]);
    expect(timeLeft(run)).toBe(90);
    expect(run.checkpoint?.step).toBe(2);
  });

  it('the first leg fails on time past 75 s: legT 75.1 fails with time, 74.9 does not', () => {
    const late = stepRun(active(2, { recorded: ['A'], step: 1, legT: 75.1, t: 80 }), frame());
    expect(late.events).toContainEqual({ type: 'failed', reason: 'time' });
    expect(stepRun(active(2, { recorded: ['A'], step: 1, legT: 74.9 - DT, t: 80 }), frame()).run.phase).toBe('active');
  });

  it('the tower is no letter: delivering at the tower gives none', () => {
    const run = active(2, { step: 3, recorded: ['A', 'B'], stopT: 1.19, leg: 1 });
    expect(types(stepRun(run, frame({ at: ANCHORS.tower, speed: 1 })).events)).not.toContain('letter');
  });
});
