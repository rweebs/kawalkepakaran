// The rules of one lakon as a pure state machine driven by frames: roam to the marker, the intro, then the steps
// (collect, reach, a course of days and gates, laps over posts), the copies, the fail checks, checkpoints and the ending.
// No physics, no clock, no randomness; state is immutable. A gate, a day's line or a post is passed when the hull's
// middle crosses it within the frame.
import { angleDiff, dist, forward, rightOf, yawOf, type XZ } from './geom';
import type { ChariotState } from './drive';
import { sweptHit } from './collide';
import { across, realTargets, type GateDef, type MissionDef, type PickupDef, type StepDef } from './missions';
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
  /** The course's days passed: the next day is days[dayIndex]. */
  dayIndex: number;
  /** The rewrite gates ridden through: each goes into the record once. */
  taken: string[];
  /** The run.t at which the lap under way began at P1; null before P1 is first crossed. */
  lapStart: number | null;
  /** The post to cross next, by index (0 is P1). */
  lapPost: number;
  /** Each finished lap's seconds, in order. */
  laps: number[];
  /** Whether two laps have matched (or the laps ran out): the record after them is open. */
  matched: boolean;
  stopT: number;
  /** Seconds added to the lakon's time limit by a retry; reset when a new leg begins. */
  extraTime: number;
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
/** Coming this near (m) to the centre of the day after the next one passes the next one, if its line was ridden round. */
const DAY_NEAR = 6;
/** On a day of two rewrites the way through is the outer lane, between the gates' outer ends and the line's: its middle. */
const LANE_IN = MISSION_TIMING.gateGap / 2 + MISSION_TIMING.gateWidth;
const LANE = (LANE_IN + MISSION_TIMING.dayLineHalf) / 2;

type Out = { run: RunState; events: GameEvent[] };
/** A frame's outcome. `decoys` is the frame's own list when no copy was touched: no list is rebuilt for nothing. */
type Step = { run: RunState; events: GameEvent[]; decoys: readonly Decoy[] };
type Target = { kind: 'pickup' | 'gate' | 'reach' | 'post' | 'marker'; id: string; at: XZ; real: boolean; heading?: number; width?: number };
type Course = Extract<StepDef, { kind: 'course' }>;
/** A lap course: parva 5's posts, and the record after its laps. */
export type Laps = Extract<StepDef, { kind: 'laps' }>;

export function startRun(def: MissionDef): RunState {
  return {
    def, phase: def.marker ? 'roam' : 'intro', phaseT: 0, t: 0, step: 0, recorded: [], dayIndex: 0, taken: [], lapStart: null,
    lapPost: 0, laps: [], matched: false, stopT: 0, extraTime: 0, legT: 0, leg: 0, decoysTaken: 0, filed: 0, score: 0, fails: 0,
    failReason: null, whole: true, checkpoint: null,
  };
}

/** Whether the chariot is the player's to drive: roaming, or in the active part of a lakon. */
export function drivable(run: RunState): boolean {
  return run.phase === 'roam' || run.phase === 'active';
}

/**
 * Whether a lakon starts at the marker `m` this frame: the hull's middle within markerR of it, the chariot below
 * markerSpeed. The lakon's own marker starts its intro; in roam a finished lakon's marker starts its replay.
 */
export function atMarker(m: XZ, f: Pick<RunFrame, 'mid' | 'car'>): boolean {
  return dist(f.mid, m) <= MISSION_TIMING.markerR && pace(f.car) < MISSION_TIMING.markerSpeed;
}

export function totalReal(def: MissionDef): number {
  return realTargets(def).length;
}

/** The running score is not clamped; only the delivered score is. */
const addScore = (run: RunState, by: number): RunState => ({ ...run, score: run.score + by });

const pace = (car: ChariotState) => Math.hypot(car.vx, car.vz);

/** Seconds left on the tightest timer (softTime, or the current leg's limit), extraTime included; null with no timer. */
export function timeLeft(run: RunState): number | null {
  const { softTime, legTimes } = run.def;
  const leg = legTimes?.filter((l) => l.fromStep <= run.step).at(-1);
  const left = [
    softTime === null ? null : softTime + run.extraTime - run.t,
    leg ? leg.seconds + run.extraTime - run.legT : null,
  ].filter((x): x is number => x !== null);
  return left.length ? Math.min(...left) : null;
}

export function checkpoint(run: RunState, car: { x: number; z: number; yaw: number }, riuh: number): RunState {
  const cp: Checkpoint = {
    car: { x: car.x, z: car.z, yaw: car.yaw }, step: run.step, recorded: [...run.recorded], t: run.t, legT: run.legT,
    leg: run.leg, dayIndex: run.dayIndex, riuh,
  };
  return { ...run, checkpoint: cp };
}

/**
 * Back to the checkpoint's car at the current step, and on a course to the checkpoint's day, so the days ahead of the car
 * are ridden again. What was recorded, scored and filed stays (nothing scores twice), as do the fails and the rewrite
 * gates taken; the copies taken are forgiven, the clamour drops to 1 at most, and the clock gets 60 s if it had less.
 */
export function restore(run: RunState): { run: RunState; car: { x: number; z: number; yaw: number }; riuh: number } {
  const cp = run.checkpoint;
  if (!cp) throw new Error('restore: no checkpoint');
  const base: RunState = { ...run, phase: 'active', phaseT: 0, stopT: 0, decoysTaken: 0, failReason: null, dayIndex: cp.dayIndex };
  const left = timeLeft(base);
  const extraTime = left === null ? base.extraTime : base.extraTime + Math.ceil(Math.max(0, MISSION_TIMING.retryMinSeconds - left) * 1000) / 1000;
  return { run: { ...base, extraTime }, car: { ...cp.car }, riuh: Math.min(cp.riuh, 1) };
}

const stepOf = (run: RunState): StepDef | undefined => run.def.steps[run.step];

/**
 * Closes the current step: a checkpoint, or the outro (with the calm and time bonuses) when it was the last one. The
 * letter is delivered when the step closed was the reach at the gate.
 */
function finishStep(run: RunState, f: RunFrame): Out {
  const closed = stepOf(run);
  const events: GameEvent[] = [{ type: 'stepDone', step: run.step }];
  if (closed?.kind === 'reach' && closed.place === 'gate') events.push({ type: 'letter' });
  const next: RunState = { ...run, step: run.step + 1, stopT: 0 };
  const newLeg = run.def.legTimes?.some((l) => l.fromStep === next.step) ?? false;
  const legged: RunState = newLeg ? { ...next, legT: 0, leg: next.leg + 1, extraTime: 0 } : next;
  if (next.step < run.def.steps.length) {
    return { run: checkpoint(legged, f.car, f.riuh), events: [...events, { type: 'checkpoint' }] };
  }
  // The last step goes straight to the outro without a checkpoint: the outro cannot fail.
  let out = legged;
  if (f.riuh <= 1) out = addScore(out, SCORE.calm);
  const { softTime } = run.def;
  if (softTime !== null) out = addScore(out, Math.floor(SCORE.perSecond * Math.max(0, SCORE.par * softTime - run.t)));
  return { run: { ...out, phase: 'outro', phaseT: 0 }, events: [...events, { type: 'outroStart' }] };
}

/** Records a pickup or a real gate: its event counts it among the lakon's real targets. */
function recordTarget(run: RunState, item: { id: string; card: number }, points: number): { run: RunState; event: GameEvent } {
  const recorded = [...run.recorded, item.id];
  const event: GameEvent = { type: 'recorded', id: item.id, card: item.card, n: recorded.length, total: totalReal(run.def) };
  return { run: addScore({ ...run, recorded }, points), event };
}

function stepCollect(run: RunState, f: RunFrame, items: readonly { id: string; at: XZ; card: number }[]): Out {
  let cur = run;
  const events: GameEvent[] = [];
  for (const item of items) {
    if (cur.recorded.includes(item.id) || !sweptHit(f.midPrev, f.mid, item.at, MISSION_TIMING.pickupR)) continue;
    const r = recordTarget(cur, item, SCORE.real);
    cur = r.run;
    events.push(r.event);
  }
  if (items.every((i) => cur.recorded.includes(i.id))) {
    const fin = finishStep(cur, f);
    return { run: fin.run, events: [...events, ...fin.events] };
  }
  return { run: cur, events };
}

function stepReach(run: RunState, f: RunFrame, s: Extract<StepDef, { kind: 'reach' }>): Out {
  const holding = dist(f.mid, s.at) <= s.r && pace(f.car) < MISSION_TIMING.stopSpeed;
  const stopT = holding ? run.stopT + f.dt : 0;
  if (stopT >= s.stopFor) return finishStep({ ...run, stopT: 0 }, f);
  return { run: { ...run, stopT }, events: [] };
}

/** A segment across a day's or a post's line: its two ends. */
interface Span {
  a: XZ;
  b: XZ;
}

/**
 * A course worked out once per lakon: each day's line (dayLineHalf m each way) and gate spans; where the course leads on
 * each day (its real gate's centre, or on a day of two rewrites the middle of an outer lane: the line the bot rides, and
 * the route the player is shown); each real gate as a target of its own, for a day ridden past without it; and the pose
 * a retry resumes from once each day is passed.
 */
interface CourseGeom {
  lines: Span[];
  spans: Span[][];
  aims: Target[];
  gates: (Target | null)[][];
  poses: { x: number; z: number; yaw: number }[];
}
/** By lakon, then by course step: the first day's lane reads the lakon's start. */
const COURSES = new WeakMap<MissionDef, WeakMap<Course, CourseGeom>>();
/** A course that turns this much (radians) or more into a day of two rewrites takes the outside of the turn there. */
const CORNER = Math.PI / 3;
/** A retry resumes this far (m) past the line of the last day passed, at its centre. */
const PAST = 3;

/** Where the step after `s` leads first: its first record or its place; null when there is none. */
function placeAfter(def: MissionDef, s: StepDef): XZ | null {
  const next = def.steps[def.steps.indexOf(s) + 1];
  if (next?.kind === 'reach') return next.at;
  if (next?.kind === 'collect') return next.items[0]?.at ?? null;
  return null;
}

function courseGeom(def: MissionDef, s: Course): CourseGeom {
  let byStep = COURSES.get(def);
  if (!byStep) COURSES.set(def, (byStep = new WeakMap()));
  const known = byStep.get(s);
  if (known) return known;
  const half = MISSION_TIMING.dayLineHalf;
  // Where the chariot comes from, and its way: the start, then each day's aim along that day's heading.
  let from: XZ = { x: def.start.x, z: def.start.z };
  let way = def.start.yaw;
  const aims: Target[] = [];
  s.days.forEach((d, k) => {
    const real = d.gates.find((g) => g.real);
    const id = `day${k + 1}`;
    if (real) {
      aims.push({ kind: 'gate', id, at: across(d.at, d.heading, real.offset), real: true, heading: d.heading, width: real.width });
    } else {
      // The outer lane on the nearer side, the side the chariot comes from; but where the course turns CORNER or more
      // into the day, the outside of the turn (a right turn's is on the left), which the chariot can come round to.
      const turn = angleDiff(d.heading, way);
      const r = rightOf(d.heading);
      const nearer = (from.x - d.at.x) * r.x + (from.z - d.at.z) * r.z >= 0 ? 1 : -1;
      const side = Math.abs(turn) >= CORNER ? Math.sign(turn) : nearer;
      aims.push({ kind: 'gate', id, at: across(d.at, d.heading, side * LANE), real: false, heading: d.heading, width: half - LANE_IN });
    }
    from = aims[k].at;
    way = d.heading;
  });
  const after = placeAfter(def, s);
  const poses = s.days.map((d, k) => {
    const f = forward(d.heading);
    const x = d.at.x + f.x * PAST;
    const z = d.at.z + f.z * PAST;
    const next = s.days[k + 1]?.at ?? after;
    return { x, z, yaw: next ? yawOf({ x: next.x - x, z: next.z - z }) : d.heading };
  });
  const geom: CourseGeom = {
    lines: s.days.map((d) => ({ a: across(d.at, d.heading, -half), b: across(d.at, d.heading, half) })),
    spans: s.days.map((d) => d.gates.map((g) => ({ a: across(d.at, d.heading, g.offset - g.width / 2), b: across(d.at, d.heading, g.offset + g.width / 2) }))),
    aims,
    gates: s.days.map((d) =>
      d.gates.map((g: GateDef): Target | null =>
        g.real ? { kind: 'gate', id: g.id, at: across(d.at, d.heading, g.offset), real: true, heading: d.heading, width: g.width } : null,
      ),
    ),
    poses,
  };
  byStep.set(s, geom);
  return geom;
}

/** The cross product (a − o) × (b − o): its sign is the side of line o→a that b lies on, 0 on it. */
const cross = (o: XZ, a: XZ, b: XZ) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/**
 * Whether the hull's middle crosses the span this frame: from strictly one side of its line to the other side or onto
 * it (so a frame that ends on the line counts once, and the next, starting on it, does not), between its ends.
 */
function crossed(f: Pick<RunFrame, 'mid' | 'midPrev'>, s: Span): boolean {
  const from = cross(s.a, s.b, f.midPrev);
  const to = cross(s.a, s.b, f.mid);
  if (from === 0 || (from > 0 ? to > 0 : to < 0)) return false;
  return cross(f.midPrev, f.mid, s.a) * cross(f.midPrev, f.mid, s.b) < 0;
}

/** Whether every real gate of the course is recorded. */
function allGates(run: RunState, s: Course): boolean {
  for (const d of s.days) for (const g of d.gates) if (g.real && !run.recorded.includes(g.id)) return false;
  return true;
}

/**
 * A course. Any real gate crossed, from either side and on any day, is recorded once. A rewrite gate counts until its day
 * is passed (the day being crossed still counts): crossed, it is taken once, a rewrite into the record that counts toward
 * the fail from the grace on, as a copy taken without sight does; a passed day's rewrite gates are inert. Crossing the
 * next day's line passes it, and so does coming near the centre of the day after it; each day passed leaves a silent
 * checkpoint just past its line. The course is done once every day is passed with every real gate recorded.
 */
function stepCourse(run: RunState, f: RunFrame, s: Course): Out {
  const geom = courseGeom(run.def, s);
  let cur = run;
  const events: GameEvent[] = [];
  for (let k = 0; k < s.days.length; k++) {
    const { gates } = s.days[k];
    for (let j = 0; j < gates.length; j++) {
      const g = gates[j];
      if (!crossed(f, geom.spans[k][j])) continue;
      if (g.real) {
        if (cur.recorded.includes(g.id)) continue;
        const r = recordTarget(cur, g, SCORE.real);
        cur = r.run;
        events.push({ type: 'gate', real: true, day: k + 1 }, r.event);
      } else if (k >= cur.dayIndex && !cur.taken.includes(g.id)) {
        const decoysTaken = cur.t >= GRACE ? cur.decoysTaken + 1 : cur.decoysTaken;
        cur = addScore({ ...cur, taken: [...cur.taken, g.id], decoysTaken }, SCORE.rewrite);
        events.push({ type: 'gate', real: false, day: k + 1 }, { type: 'rewriteTaken' });
      }
    }
  }
  const i = cur.dayIndex;
  const after = s.days[i + 1];
  if ((i < s.days.length && crossed(f, geom.lines[i])) || (after && dist(f.mid, after.at) <= DAY_NEAR)) {
    cur = checkpoint({ ...cur, dayIndex: i + 1 }, geom.poses[i], f.riuh);
  }
  if (cur.dayIndex >= s.days.length && allGates(cur, s)) {
    const fin = finishStep(cur, f);
    return { run: fin.run, events: [...events, ...fin.events] };
  }
  return { run: cur, events };
}

/** A lap course worked out once: the posts' spans, postWidth m wide across each post's heading, and its record as a list. */
const LAPS = new WeakMap<Laps, { spans: Span[]; then: readonly PickupDef[] }>();
function lapsGeom(s: Laps): { spans: Span[]; then: readonly PickupDef[] } {
  let geom = LAPS.get(s);
  if (!geom) {
    const half = MISSION_TIMING.postWidth / 2;
    geom = { spans: s.posts.map((p) => ({ a: across(p.at, p.heading, -half), b: across(p.at, p.heading, half) })), then: [s.then] };
    LAPS.set(s, geom);
  }
  return geom;
}

/**
 * One frame round a lap course at time `now`: the posts are crossed in order, each by the crossing rule over its span;
 * P1 starts the first lap and closes each one. `post` is the post to cross next (0 is P1) and `start` the time the lap
 * under way began at P1 (null before P1 is first crossed). Null when this frame crosses no post in order; else the post
 * to cross next, the lap's start, and the seconds of the lap this frame closed (null when it closed none). The lakon's
 * laps ride it on run.t, and roam's free laps on parva 5's posts on their own clock.
 */
export function rideLaps(
  s: Laps,
  post: number,
  start: number | null,
  now: number,
  f: Pick<RunFrame, 'mid' | 'midPrev'>,
): { post: number; start: number | null; seconds: number | null } | null {
  if (!crossed(f, lapsGeom(s).spans[post])) return null;
  const next = (post + 1) % s.posts.length;
  if (post !== 0) return { post: next, start, seconds: null };
  return { post: next, start: now, seconds: start === null ? null : now - start };
}

/**
 * Laps, ridden on run.t (rideLaps). A lap matches the one before it when they differ by lapMatch of the one before at
 * most; after maxLaps laps they match whatever the times. Once they match, the record after them is open, and recording
 * it closes the step.
 */
function stepLaps(run: RunState, f: RunFrame, s: Laps): Out {
  if (run.matched) return stepCollect(run, f, lapsGeom(s).then);
  const lap = rideLaps(s, run.lapPost, run.lapStart, run.t, f);
  if (!lap) return { run, events: [] };
  const rode: RunState = { ...run, lapPost: lap.post, lapStart: lap.start };
  if (lap.seconds === null) return { run: rode, events: [] };
  const { seconds } = lap;
  const before = run.laps.at(-1);
  const laps = [...run.laps, seconds];
  const matched =
    (before !== undefined && Math.abs(seconds - before) <= MISSION_TIMING.lapMatch * before) || laps.length >= MISSION_TIMING.maxLaps;
  return { run: { ...rode, laps, matched }, events: [{ type: 'lap', n: laps.length, seconds, matched }] };
}

/** Whether the hull's middle passes within decoyR of this open copy this frame. */
const touched = (d: Decoy, f: RunFrame) =>
  d.state === 'open' && sweptHit(f.midPrev, f.mid, d.at, MISSION_TIMING.decoyR);

function stepCopies(run: RunState, f: RunFrame): Step {
  let cur = run;
  const events: GameEvent[] = [];
  let any = false;
  for (let k = 0; k < f.decoys.length && !any; k++) any = touched(f.decoys[k], f);
  if (!any) return { run: cur, events, decoys: f.decoys };
  const decoys = f.decoys.map((d) => {
    if (!touched(d, f)) return d;
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
  const left = timeLeft(run);
  if (left !== null && left < 0) return 'time';
  const { decoyLimit } = run.def;
  if (decoyLimit !== null && run.decoysTaken >= decoyLimit) return 'muddied';
  return null;
}

/** The open step's rules for this frame. */
function stepStep(run: RunState, f: RunFrame, s: StepDef): Out {
  switch (s.kind) {
    case 'collect':
      return stepCollect(run, f, s.items);
    case 'reach':
      return stepReach(run, f, s);
    case 'course':
      return stepCourse(run, f, s);
    case 'laps':
      return stepLaps(run, f, s);
  }
}

function stepActive(run: RunState, f: RunFrame): Step {
  const copies = stepCopies({ ...run, t: run.t + f.dt, legT: run.legT + f.dt }, f);
  const events = [...copies.events];
  let cur = copies.run;
  const s = stepOf(cur);
  if (s) {
    const r = stepStep(cur, f, s);
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

export function stepRun(run: RunState, frame: RunFrame): Step {
  const f = Number.isFinite(frame.dt) && frame.dt > 0 ? frame : { ...frame, dt: 0 };
  const plain = (o: Out): Step => ({ ...o, decoys: f.decoys });
  switch (run.phase) {
    case 'roam': {
      const m = run.def.marker;
      if (m && atMarker(m, f)) return plain({ run: { ...run, phase: 'intro', phaseT: 0 }, events: [{ type: 'introStart' }] });
      return plain({ run, events: [] });
    }
    case 'intro':
      return plain(stepIntro(run, f));
    case 'active':
      return stepActive(run, f);
    case 'outro': {
      const phaseT = run.phaseT + f.dt;
      if (phaseT < MISSION_TIMING.outroSeconds) return plain({ run: { ...run, phaseT }, events: [] });
      return plain({ run: { ...run, phase: 'done', phaseT: 0 }, events: [{ type: 'done', score: Math.max(0, run.score), whole: run.whole }] });
    }
    default:
      return plain({ run, events: [] });
  }
}

/** What a step records: its pickups, its real gates, or the record after its laps. */
function recordsOf(s: StepDef): readonly { id: string; card: number }[] {
  if (s.kind === 'collect') return s.items;
  if (s.kind === 'course') return s.days.flatMap((d) => d.gates.filter((g) => g.real));
  if (s.kind === 'laps') return [s.then];
  return [];
}

/** The skip: records every open real target and goes to the outro; the run is no longer whole. */
export function autoRecord(run: RunState): Out {
  let cur = run;
  const events: GameEvent[] = [];
  for (const s of run.def.steps) {
    for (const item of recordsOf(s)) {
      if (cur.recorded.includes(item.id)) continue;
      const r = recordTarget(cur, item, 0);
      cur = r.run;
      events.push(r.event);
    }
  }
  events.push({ type: 'outroStart' });
  return { run: { ...cur, step: run.def.steps.length, phase: 'outro', phaseT: 0, whole: false, failReason: null }, events };
}

/**
 * The lap post of the m-th crossing from the lakon's start (1-based): P1 opens each lap, so its id names the lap it
 * opens, and every other post the lap it belongs to.
 */
function postTarget(s: Laps, m: number): Target {
  const n = s.posts.length;
  const k = (m - 1) % n;
  const p = s.posts[k];
  return { kind: 'post', id: `P${k + 1}-${Math.floor((m - 1) / n) + 1}`, at: p.at, real: true, heading: p.heading, width: MISSION_TIMING.postWidth };
}

/**
 * What the lakon leads to now, first the one the route goes to. A course: where it leads on each day ahead, then any real
 * gate ridden past and still open. Laps: the next post and the one after it, then, once the laps match, the record after
 * them.
 */
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
  if (s.kind === 'course') {
    const geom = courseGeom(run.def, s);
    const out = geom.aims.slice(run.dayIndex);
    for (let k = 0; k < Math.min(run.dayIndex, s.days.length); k++) {
      for (const g of geom.gates[k]) if (g && !run.recorded.includes(g.id)) out.push(g);
    }
    return out;
  }
  if (run.matched) return run.recorded.includes(s.then.id) ? [] : [{ kind: 'pickup', id: s.then.id, at: s.then.at, real: true }];
  const n = s.posts.length;
  const done = run.lapStart === null ? 0 : run.laps.length * n + (run.lapPost === 0 ? n : run.lapPost);
  return [postTarget(s, done + 1), postTarget(s, done + 2)];
}
