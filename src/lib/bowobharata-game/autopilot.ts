// The bot driver. It runs pure pursuit along the engine's route toward the first open target (routeAhead), at a speed
// that drops for sharp turns and for the circles where the chariot must stop. autopilot() is the bot's decision for
// this frame, a pure function of its arguments. createBot() adds the reaction delay: its queue lives in the closure it
// returns, one bot per run, never in GameState. Units are metres and seconds; steer +1 turns right, so yaw decreases.
import { angleDiff, clamp, dist, yawOf, type XZ } from './geom';
import { NO_INPUT, REST_SPEED, speedOf, type ChariotInput } from './drive';
import { hullMid } from './collide';
import { drivable, openTargets, type RunState } from './mission-run';
import { pathLength, pursuit, turnsAhead, type Pursuit } from './route';
import { DRIVE, MISSION_TIMING } from './tuning';
import { DEFAULT_ASPECT, routeAhead, type FrameInput, type GameState, type World } from './engine';

/** The steering assist blends this bot's steer into the player's. The engine applies it, so it lives there. */
export { assistSteer } from './engine';

export interface AutoOpts {
  /** The share of the top speed (17 m/s) the bot drives at most. */
  speedCap: number;
  /** Real seconds between a decision and the input that carries it out: only createBot can add it. */
  reaction: number;
}

/** autopilot's options: every AutoOpts field but `reaction`, which would need a queue (see createBot). */
export type DecisionOpts = Partial<Omit<AutoOpts, 'reaction'>> & { reaction?: never };

const DEFAULT_OPTS: AutoOpts = { speedCap: 1, reaction: 0 };
/** A path turning more than this (radians) is taken at TURN_SPEED. */
const TURN_SHARP = (50 * Math.PI) / 180;
const TURN_SPEED = 8;
/**
 * A turn back past this (radians) is taken from rest: the bot stops and pivots on the spot (the drive turns the chariot
 * in place below 1 m/s), since a loop at speed would carry it far off the route, where nothing is clear.
 */
const TURN_BACK = Math.PI / 2;
/** Below PIVOT_FROM m/s, a bot more than PIVOT_UNTIL (radians) off its line stops and pivots onto it before driving. */
const PIVOT_FROM = 4;
const PIVOT_UNTIL = (20 * Math.PI) / 180;
/** The speed (m/s) the bot comes down to before a target that is followed by a turn back. */
const TURN_BACK_SPEED = 2;
/** Within NEAR_CIRCLE m of the circle where it must stop, the bot rides at CIRCLE_SPEED. */
const NEAR_CIRCLE = 12;
const CIRCLE_SPEED = 3;
/** Once its centre is this far inside that circle, the bot stops. */
const STOP_IN = 1;
/** The deceleration (m/s²) the bot plans with: well under the brake's 15, so it reaches each limit in time. */
const PLAN_DECEL = 6;

type Target = ReturnType<typeof openTargets>[number];

/** The circle where the chariot must stop for this target: the marker's in roam, the reach circle in a lakon. */
function stopCircle(run: RunState, target: Target): { at: XZ; r: number } | null {
  if (target.kind === 'marker') return { at: target.at, r: MISSION_TIMING.markerR };
  const step = run.def.steps[run.step];
  return target.kind === 'reach' && step?.kind === 'reach' ? { at: step.at, r: step.r } : null;
}

/** The highest speed from which PLAN_DECEL still brings the chariot down to `limit` within `ahead` m. */
const easeTo = (limit: number, ahead: number) => Math.sqrt(limit * limit + 2 * PLAN_DECEL * Math.max(0, ahead));

/** Where the lakon goes after `target`: the next open record, else the next step's place; null after the last. */
function afterTarget(run: RunState, target: Target): XZ | null {
  const later = openTargets(run).find((t) => t.id !== target.id);
  if (later) return later.at;
  const next = run.def.steps[run.step + 1];
  if (next?.kind === 'reach') return next.at;
  if (next?.kind === 'collect') return next.items[0]?.at ?? null;
  return null;
}

/**
 * The speed to arrive at a record with: the path ahead does not end there, it turns toward what comes next. A pickup
 * is taken MISSION_TIMING.pickupR m short, by the hull's middle 1.6 m ahead of the origin, so the turn starts early.
 */
function arrivalLimit(run: RunState, path: readonly XZ[], p: Pursuit, target: Target): number {
  if (target.kind !== 'pickup') return Infinity;
  const next = afterTarget(run, target);
  const n = path.length;
  if (!next || n < 2) return Infinity;
  const into = yawOf({ x: path[n - 1].x - path[n - 2].x, z: path[n - 1].z - path[n - 2].z });
  const turn = Math.abs(angleDiff(yawOf({ x: next.x - target.at.x, z: next.z - target.at.z }), into));
  const ahead = pathLength(path) - p.along - (MISSION_TIMING.pickupR + 1.6);
  if (turn > TURN_BACK) return easeTo(TURN_BACK_SPEED, ahead);
  return turn > TURN_SHARP ? easeTo(TURN_SPEED, ahead) : Infinity;
}

function targetSpeed(s: GameState, speedCap: number, path: readonly XZ[], p: Pursuit, target: Target): number {
  const off = Math.abs(p.alpha);
  if (off > TURN_BACK || (off > PIVOT_UNTIL && Math.abs(speedOf(s.car)) < PIVOT_FROM)) return 0;
  let v = Math.min(speedCap * DRIVE.topSpeed, arrivalLimit(s.run, path, p, target));
  if (off > TURN_SHARP) v = Math.min(v, TURN_SPEED);
  for (const t of turnsAhead(path, p.along)) {
    if (Math.abs(t.turn) > TURN_SHARP) v = Math.min(v, easeTo(TURN_SPEED, t.ahead));
  }
  const circle = stopCircle(s.run, target);
  if (circle) {
    const edge = dist(hullMid(s.car), circle.at) - circle.r;
    if (edge <= -STOP_IN) return 0;
    v = Math.min(v, easeTo(CIRCLE_SPEED, edge - NEAR_CIRCLE));
  }
  return v;
}

/** Throttle up to the target speed, brake well above it, coast in between; at a target of 0, stop and stay stopped. */
function pedals(v: number, target: number): Pick<ChariotInput, 'throttle' | 'brake'> {
  if (target <= 0) return { throttle: 0, brake: v > REST_SPEED ? 1 : 0 };
  if (v < target) return { throttle: clamp((target - v) / 2, 0, 1), brake: 0 };
  if (v > target + 0.5) return { throttle: 0, brake: clamp((v - target) / 3, 0.15, 1) };
  return { throttle: 0, brake: 0 };
}

/**
 * The bot's decision for this frame, with no reaction delay: a pure function of its arguments, so the same state gives
 * the same input whatever came before. This bot reads only the state; the world is for the options of Tasks 29 and 31.
 */
export function autopilot(s: GameState, w: World, o?: DecisionOpts): FrameInput {
  const speedCap = o?.speedCap ?? DEFAULT_OPTS.speedCap;
  const base = { sight: false, skip: s.run.phase === 'intro', assist: false, aspect: DEFAULT_ASPECT };
  const target = drivable(s.run) ? openTargets(s.run)[0] : undefined;
  const path = target ? routeAhead(s) : null;
  if (!target || !path) return { ...base, drive: NO_INPUT };
  const p = pursuit(s.car, path);
  const pedal = pedals(speedOf(s.car), targetSpeed(s, speedCap, path, p, target));
  return { ...base, drive: { ...NO_INPUT, ...pedal, steer: p.steer } };
}

/**
 * One bot for one run. It gives autopilot's decisions `reaction` real seconds after making them (no input before the
 * first one is due), through a queue held in the closure it returns. The options are read once, here; a fresh bot
 * starts with an empty queue. Should one be reused after its run (the clock going back), its queue starts over.
 */
export function createBot(o?: Partial<AutoOpts>): (s: GameState, w: World) => FrameInput {
  const { reaction, ...decision } = { ...DEFAULT_OPTS, ...o };
  if (!(reaction > 0)) return (s, w) => autopilot(s, w, decision);
  let queue: { at: number; input: FrameInput }[] = [];
  return (s, w) => {
    const now = autopilot(s, w, decision);
    if (queue.length > 0 && s.clock < queue[queue.length - 1].at) queue = [];
    queue.push({ at: s.clock, input: now });
    const due = s.clock - reaction + 1e-9;
    while (queue.length > 1 && queue[1].at <= due) queue.shift();
    return queue[0].at <= due ? queue[0].input : { ...now, drive: NO_INPUT, skip: false };
  };
}
