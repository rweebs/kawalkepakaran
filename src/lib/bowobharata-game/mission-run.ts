// The rules of one lakon as a pure state machine driven by frames: roam to the marker, the intro, then the steps
// (collect, reach), the copies, the fail checks, checkpoints and the ending. No physics, no clock, no randomness; state
// is immutable. Course, laps and the letter come with Task 31, until then stepRun throws on those step kinds.
import { dist, type XZ } from './geom';
import { speedOf, type ChariotState } from './drive';
import { sweptHit } from './collide';
import type { MissionDef, PickupDef, StepDef } from './missions';
import { MISSION_TIMING } from './tuning';

export type Phase = 'roam' | 'intro' | 'active' | 'outro' | 'failed' | 'done';
export type FailReason = 'time' | 'muddied';
export type HintKey = 'ride' | 'steer' | 'slow' | 'rewrites' | 'sight' | 'stop' | 'surge' | 'drift';

export interface Decoy {
  id: number;
  at: XZ;
  born: number;
  life: number | null;
  state: 'open' | 'taken' | 'filed' | 'gone';
  mimic: boolean;
}

export interface Checkpoint {
  car: { x: number; z: number; yaw: number };
  step: number;
  recorded: string[];
  t: number;
  legT: number;
  leg: number;
  dayIndex: number;
  riuh: number;
}

export interface RunState {
  def: MissionDef;
  phase: Phase;
  phaseT: number;
  t: number;
  step: number;
  recorded: string[];
  dayIndex: number;
  lapStart: number | null;
  lapPost: number;
  laps: number[];
  matched: boolean;
  stopT: number;
  legT: number;
  leg: number;
  decoysTaken: number;
  filed: number;
  score: number;
  fails: number;
  failReason: FailReason | null;
  whole: boolean;
  checkpoint: Checkpoint | null;
}

export type GameEvent =
  | { type: 'introStart' }
  | { type: 'introEnd' }
  | { type: 'recorded'; id: string; card: number; n: number; total: number }
  | { type: 'gate'; real: boolean; day: number }
  | { type: 'rewriteTaken' }
  | { type: 'filed' }
  | { type: 'bump'; speed: number }
  | { type: 'held' }
  | { type: 'wall' }
  | { type: 'absorbed' }
  | { type: 'checkpoint' }
  | { type: 'stepDone'; step: number }
  | { type: 'lap'; n: number; seconds: number; matched: boolean }
  | { type: 'letter' }
  | { type: 'level'; level: number }
  | { type: 'hint'; key: HintKey }
  | { type: 'volley'; id: number }
  | { type: 'outroStart' }
  | { type: 'failed'; reason: FailReason }
  | { type: 'done'; score: number; whole: boolean }
  | { type: 'replayDone'; chapter: number; score: number; best: number }
  | { type: 'freeLap'; seconds: number; best: number };

export interface RunFrame {
  car: ChariotState;
  mid: XZ;
  midPrev: XZ;
  dt: number;
  sight: boolean;
  skip: boolean;
  riuh: number;
  decoys: readonly Decoy[];
}

export const SCORE = { real: 100, filed: 50, rewrite: -50, calm: 100, perSecond: 2, par: 0.6 } as const;

/** Fail checks wait for this run time (the grace); rewrites taken earlier never count. */
const GRACE = MISSION_TIMING.grace;

type Out = { run: RunState; events: GameEvent[] };
type Step = { run: RunState; events: GameEvent[]; decoys: Decoy[] };
type Target = { kind: 'pickup' | 'gate' | 'reach' | 'post' | 'marker'; id: string; at: XZ; real: boolean; heading?: number; width?: number };

export function startRun(def: MissionDef): RunState {
  return {
    def, phase: def.marker ? 'roam' : 'intro', phaseT: 0, t: 0, step: 0, recorded: [], dayIndex: 0, lapStart: null,
    lapPost: 0, laps: [], matched: false, stopT: 0, legT: 0, leg: 0, decoysTaken: 0, filed: 0, score: 0, fails: 0,
    failReason: null, whole: true, checkpoint: null,
  };
}

export function totalReal(def: MissionDef): number {
  return def.steps.reduce((n, s) => n + (s.kind === 'collect' ? s.items.length : 0), 0);
}

const addScore = (run: RunState, by: number): RunState => ({ ...run, score: Math.max(0, run.score + by) });

export function checkpoint(run: RunState, car: { x: number; z: number; yaw: number }, riuh: number): RunState {
  const cp: Checkpoint = {
    car: { x: car.x, z: car.z, yaw: car.yaw }, step: run.step, recorded: [...run.recorded], t: run.t, legT: run.legT,
    leg: run.leg, dayIndex: run.dayIndex, riuh,
  };
  return { ...run, checkpoint: cp };
}

/** The lakon's own time limits, extended so that a retry from this checkpoint has at least 60 s left. */
function extendTimes(def: MissionDef, step: number, t: number, legT: number): MissionDef {
  const min = MISSION_TIMING.retryMinSeconds;
  const softTime = def.softTime === null ? null : Math.max(def.softTime, t + min);
  const legTimes = def.legTimes && def.legTimes.map((l) => (l.fromStep <= step ? { ...l, seconds: Math.max(l.seconds, legT + min) } : l));
  return { ...def, softTime, legTimes };
}

export function restore(run: RunState): { run: RunState; car: { x: number; z: number; yaw: number }; riuh: number } {
  const cp = run.checkpoint;
  if (!cp) throw new Error('restore: no checkpoint');
  return {
    run: {
      ...run, def: extendTimes(run.def, cp.step, cp.t, cp.legT), phase: 'active', phaseT: 0, t: cp.t, step: cp.step,
      recorded: [...cp.recorded], dayIndex: cp.dayIndex, stopT: 0, legT: cp.legT, leg: cp.leg, decoysTaken: 0,
      failReason: null,
    },
    car: { ...cp.car },
    riuh: Math.min(cp.riuh, 1),
  };
}

function unsupported(s: StepDef): never {
  throw new Error(`mission-run: step kind '${s.kind}' is not built yet (Task 31)`);
}

const stepOf = (run: RunState): StepDef | undefined => run.def.steps[run.step];

/** Closes the current step: a checkpoint, or the outro (with the calm and time bonuses) when it was the last one. */
function finishStep(run: RunState, f: RunFrame): Out {
  const events: GameEvent[] = [{ type: 'stepDone', step: run.step }];
  const next: RunState = { ...run, step: run.step + 1, stopT: 0, legT: 0, leg: run.leg + 1 };
  if (next.step < run.def.steps.length) {
    return { run: checkpoint(next, f.car, f.riuh), events: [...events, { type: 'checkpoint' }] };
  }
  let out = next;
  if (f.riuh <= 1) out = addScore(out, SCORE.calm);
  const { softTime } = run.def;
  if (softTime !== null) out = addScore(out, Math.floor(SCORE.perSecond * Math.max(0, SCORE.par * softTime - run.t)));
  return { run: { ...out, phase: 'outro', phaseT: 0 }, events: [...events, { type: 'outroStart' }] };
}

function stepCollect(run: RunState, f: RunFrame, items: readonly PickupDef[]): Out {
  let cur = run;
  const events: GameEvent[] = [];
  for (const item of items) {
    if (cur.recorded.includes(item.id) || !sweptHit(f.midPrev, f.mid, item.at, MISSION_TIMING.pickupR)) continue;
    const recorded = [...cur.recorded, item.id];
    cur = addScore({ ...cur, recorded }, SCORE.real);
    events.push({ type: 'recorded', id: item.id, card: item.card, n: recorded.length, total: totalReal(run.def) });
  }
  if (items.every((i) => cur.recorded.includes(i.id))) {
    const fin = finishStep(cur, f);
    return { run: fin.run, events: [...events, ...fin.events] };
  }
  return { run: cur, events };
}

function stepReach(run: RunState, f: RunFrame, s: Extract<StepDef, { kind: 'reach' }>): Out {
  const holding = dist(f.mid, s.at) <= s.r && speedOf(f.car) < MISSION_TIMING.stopSpeed;
  const stopT = holding ? run.stopT + f.dt : 0;
  if (stopT >= s.stopFor) return finishStep({ ...run, stopT: 0 }, f);
  return { run: { ...run, stopT }, events: [] };
}

function stepCopies(run: RunState, f: RunFrame): Step {
  let cur = run;
  const events: GameEvent[] = [];
  const decoys = f.decoys.map((d) => {
    if (d.state !== 'open' || !sweptHit(f.midPrev, f.mid, d.at, MISSION_TIMING.decoyR)) return d;
    if (f.sight) {
      cur = addScore({ ...cur, filed: cur.filed + 1 }, SCORE.filed);
      events.push({ type: 'filed' });
      return { ...d, state: 'filed' as const };
    }
    cur = addScore({ ...cur, decoysTaken: cur.t >= GRACE ? cur.decoysTaken + 1 : cur.decoysTaken }, SCORE.rewrite);
    events.push({ type: 'rewriteTaken' });
    return { ...d, state: 'taken' as const };
  });
  return { run: cur, events, decoys };
}

function failReason(run: RunState): FailReason | null {
  if (run.t < GRACE) return null;
  const { softTime, legTimes, decoyLimit } = run.def;
  if (softTime !== null && run.t > softTime) return 'time';
  const leg = legTimes?.filter((l) => l.fromStep <= run.step).at(-1);
  if (leg && run.legT > leg.seconds) return 'time';
  if (decoyLimit !== null && run.decoysTaken >= decoyLimit) return 'muddied';
  return null;
}

function stepActive(run: RunState, f: RunFrame): Step {
  const copies = stepCopies({ ...run, t: run.t + f.dt, legT: run.legT + f.dt }, f);
  const events = [...copies.events];
  let cur = copies.run;
  const s = stepOf(cur);
  if (s) {
    if (s.kind !== 'collect' && s.kind !== 'reach') unsupported(s);
    const r = s.kind === 'collect' ? stepCollect(cur, f, s.items) : stepReach(cur, f, s);
    cur = r.run;
    events.push(...r.events);
  }
  const reason = cur.phase === 'active' ? failReason(cur) : null;
  if (reason) {
    cur = { ...cur, phase: 'failed', phaseT: 0, failReason: reason, fails: cur.fails + 1 };
    events.push({ type: 'failed', reason });
  }
  return { run: cur, events, decoys: copies.decoys };
}

function stepIntro(run: RunState, f: RunFrame): Out {
  const phaseT = run.phaseT + f.dt;
  const T = MISSION_TIMING;
  if (phaseT >= T.introSeconds || (f.skip && phaseT >= T.introSkipAfter)) {
    const next = checkpoint({ ...run, phase: 'active', phaseT: 0 }, f.car, f.riuh);
    return { run: next, events: [{ type: 'introEnd' }, { type: 'checkpoint' }] };
  }
  return { run: { ...run, phaseT }, events: [] };
}

export function stepRun(run: RunState, f: RunFrame): Step {
  const plain = (o: Out): Step => ({ ...o, decoys: [...f.decoys] });
  switch (run.phase) {
    case 'roam': {
      const m = run.def.marker;
      if (m && dist(f.mid, m) <= MISSION_TIMING.markerR && speedOf(f.car) < MISSION_TIMING.markerSpeed) {
        return plain({ run: { ...run, phase: 'intro', phaseT: 0 }, events: [{ type: 'introStart' }] });
      }
      return plain({ run, events: [] });
    }
    case 'intro':
      return plain(stepIntro(run, f));
    case 'active':
      return stepActive(run, f);
    case 'outro': {
      const phaseT = run.phaseT + f.dt;
      if (phaseT < MISSION_TIMING.outroSeconds) return plain({ run: { ...run, phaseT }, events: [] });
      return plain({ run: { ...run, phase: 'done', phaseT: 0 }, events: [{ type: 'done', score: run.score, whole: run.whole }] });
    }
    default:
      return plain({ run, events: [] });
  }
}

/** The skip: records every open real target and goes to the outro; the run is no longer whole. */
export function autoRecord(run: RunState): Out {
  let cur = run;
  const events: GameEvent[] = [];
  for (const s of run.def.steps) {
    if (s.kind === 'reach') continue;
    if (s.kind !== 'collect') unsupported(s);
    for (const item of s.items) {
      if (cur.recorded.includes(item.id)) continue;
      const recorded = [...cur.recorded, item.id];
      cur = { ...cur, recorded };
      events.push({ type: 'recorded', id: item.id, card: item.card, n: recorded.length, total: totalReal(run.def) });
    }
  }
  events.push({ type: 'outroStart' });
  return { run: { ...cur, step: run.def.steps.length, phase: 'outro', phaseT: 0, whole: false }, events };
}

export function openTargets(run: RunState): Target[] {
  if (run.phase === 'roam') {
    const m = run.def.marker;
    return m ? [{ kind: 'marker', id: 'marker', at: m, real: true }] : [];
  }
  if (run.phase !== 'intro' && run.phase !== 'active') return [];
  const s = stepOf(run);
  if (!s) return [];
  if (s.kind === 'collect') {
    return s.items.filter((i) => !run.recorded.includes(i.id)).map((i) => ({ kind: 'pickup', id: i.id, at: i.at, real: true }));
  }
  if (s.kind === 'reach') return [{ kind: 'reach', id: `reach${run.step}`, at: s.at, real: true }];
  return unsupported(s);
}
