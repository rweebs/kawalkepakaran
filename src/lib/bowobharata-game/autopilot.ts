// The bot driver and the steering assist. The bot runs pure pursuit along the engine's cached route toward the first
// open target, at a speed that drops for sharp turns and for the circles where the chariot must stop. It is a pure
// function of the state, except for the reaction delay: that queue lives with the options object it is given.
// Units are metres and seconds; steer +1 turns right, so yaw decreases.
import { angleDiff, clamp, dist, yawOf, type XZ } from './geom';
import { NO_INPUT, speedOf, turnRadius, type ChariotInput } from './drive';
import { hullMid } from './collide';
import { openTargets, type RunState } from './mission-run';
import type { MissionDef } from './missions';
import { pathLength } from './route';
import { DRIVE, MISSION_TIMING } from './tuning';
import type { FrameInput, GameState, World } from './engine';

export interface AutoOpts {
  /** The share of the top speed (17 m/s) the bot drives at most. */
  speedCap: number;
  /** Real seconds between a decision and the input that carries it out. */
  reaction: number;
}

const DEFAULT_OPTS: AutoOpts = { speedCap: 1, reaction: 0 };
const ASPECT = 16 / 9;
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
/** At or below this forward speed (m/s) the chariot counts as at rest: a brake held longer would start the reverse. */
const REST = 0.05;

type Target = ReturnType<typeof openTargets>[number];

/** Pure pursuit's lookahead (m) at forward speed v. */
export function lookahead(v: number): number {
  return clamp(4 + 0.5 * v, 5, 14);
}

/** The arc length along the polyline at its point nearest to p, and the distance from p to it. */
export function projectOnPath(path: readonly XZ[], p: XZ): { along: number; off: number } {
  if (path.length === 1) return { along: 0, off: dist(p, path[0]) };
  let best = { along: 0, off: Infinity };
  let start = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1];
    const dx = path[k].x - a.x;
    const dz = path[k].z - a.z;
    const len = Math.hypot(dx, dz);
    const t = len > 0 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len), 0, 1) : 0;
    const off = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    if (off < best.off) best = { along: start + t * len, off };
    start += len;
  }
  return best;
}

/** The point at arc length `along` on the polyline, held at its ends. */
export function pointAt(path: readonly XZ[], along: number): XZ {
  let left = Math.max(0, along);
  for (let k = 1; k < path.length; k++) {
    const len = dist(path[k - 1], path[k]);
    if (left <= len && len > 0) {
      const t = left / len;
      return { x: path[k - 1].x + (path[k].x - path[k - 1].x) * t, z: path[k - 1].z + (path[k].z - path[k - 1].z) * t };
    }
    left -= len;
  }
  return path[path.length - 1];
}

/** The polyline's corners after arc length `along`: each one's distance ahead, its signed turn (radians) and place. */
export function turnsAhead(path: readonly XZ[], along: number): { ahead: number; turn: number; at: XZ }[] {
  // A point within a millimetre of the last one kept adds no direction of its own.
  const pts: XZ[] = [];
  for (const p of path) if (pts.length === 0 || dist(p, pts[pts.length - 1]) > 1e-3) pts.push(p);
  const corners: { ahead: number; turn: number; at: XZ }[] = [];
  let at = 0;
  for (let k = 1; k + 1 < pts.length; k++) {
    at += dist(pts[k - 1], pts[k]);
    if (at <= along) continue;
    const into = yawOf({ x: pts[k].x - pts[k - 1].x, z: pts[k].z - pts[k - 1].z });
    const onward = yawOf({ x: pts[k + 1].x - pts[k].x, z: pts[k + 1].z - pts[k].z });
    corners.push({ ahead: at - along, turn: angleDiff(onward, into), at: pts[k] });
  }
  return corners;
}

/** Whether the chariot is under the player's control: roaming, or in the active part of a lakon. */
export function drivable(run: RunState): boolean {
  return run.phase === 'roam' || run.phase === 'active';
}

/** The path the bot follows: the engine's cached route when it leads to `target`, else the straight line to it. */
function pathTo(s: GameState, target: Target): readonly XZ[] {
  const r = s.route;
  return r && r.target === target.id && r.points.length > 1 ? r.points : [{ x: s.car.x, z: s.car.z }, target.at];
}

interface Pursuit {
  path: readonly XZ[];
  along: number;
  look: XZ;
  /** The bearing of the lookahead point off the heading, radians, positive to the left. */
  alpha: number;
}

function pursue(s: GameState, target: Target): Pursuit {
  const path = pathTo(s, target);
  const { along } = projectOnPath(path, s.car);
  const look = pointAt(path, along + lookahead(Math.max(0, speedOf(s.car))));
  const near = dist(s.car, look) < 1e-6;
  const alpha = near ? 0 : angleDiff(yawOf({ x: look.x - s.car.x, z: look.z - s.car.z }), s.car.yaw);
  return { path, along, look, alpha };
}

/** Pure pursuit: the arc through the lookahead point, as a share of the tightest turn at this speed. */
function steerFor(s: GameState, p: Pursuit): number {
  if (Math.abs(p.alpha) >= Math.PI / 2) return p.alpha > 0 ? -1 : 1;
  const curvature = (2 * Math.sin(p.alpha)) / Math.max(1, dist(s.car, p.look));
  return clamp(-curvature * turnRadius(Math.max(0, speedOf(s.car))), -1, 1);
}

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
function arrivalLimit(s: GameState, p: Pursuit, target: Target): number {
  if (target.kind !== 'pickup') return Infinity;
  const next = afterTarget(s.run, target);
  const n = p.path.length;
  if (!next || n < 2) return Infinity;
  const into = yawOf({ x: p.path[n - 1].x - p.path[n - 2].x, z: p.path[n - 1].z - p.path[n - 2].z });
  const turn = Math.abs(angleDiff(yawOf({ x: next.x - target.at.x, z: next.z - target.at.z }), into));
  const ahead = pathLength(p.path) - p.along - (MISSION_TIMING.pickupR + 1.6);
  if (turn > TURN_BACK) return easeTo(TURN_BACK_SPEED, ahead);
  return turn > TURN_SHARP ? easeTo(TURN_SPEED, ahead) : Infinity;
}

function targetSpeed(s: GameState, o: AutoOpts, p: Pursuit, target: Target): number {
  const off = Math.abs(p.alpha);
  if (off > TURN_BACK || (off > PIVOT_UNTIL && Math.abs(speedOf(s.car)) < PIVOT_FROM)) return 0;
  let v = Math.min(o.speedCap * DRIVE.topSpeed, arrivalLimit(s, p, target));
  if (off > TURN_SHARP) v = Math.min(v, TURN_SPEED);
  for (const t of turnsAhead(p.path, p.along)) {
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
  if (target <= 0) return { throttle: 0, brake: v > REST ? 1 : 0 };
  if (v < target) return { throttle: clamp((target - v) / 2, 0, 1), brake: 0 };
  if (v > target + 0.5) return { throttle: 0, brake: clamp((v - target) / 3, 0.15, 1) };
  return { throttle: 0, brake: 0 };
}

function decide(s: GameState, o: AutoOpts): FrameInput {
  const base = { sight: false, skip: s.run.phase === 'intro', assist: false, aspect: ASPECT };
  const target = drivable(s.run) ? openTargets(s.run)[0] : undefined;
  if (!target) return { ...base, drive: NO_INPUT };
  const p = pursue(s, target);
  const pedal = pedals(speedOf(s.car), targetSpeed(s, o, p, target));
  const drive: ChariotInput = { ...NO_INPUT, ...pedal, steer: steerFor(s, p) };
  return { ...base, drive };
}

/** The steer the bot would give now, with no delay: what the assist blends in. 0 with nothing to steer for. */
export function autoSteer(s: GameState): number {
  const target = drivable(s.run) ? openTargets(s.run)[0] : undefined;
  return target ? steerFor(s, pursue(s, target)) : 0;
}

/** The player's steer with the bot's added in, less as the player steers harder: none at full lock. */
export function assistSteer(player: number, auto: number): number {
  const p = clamp(Number.isFinite(player) ? player : 0, -1, 1);
  const a = clamp(Number.isFinite(auto) ? auto : 0, -1, 1);
  return clamp(p + 0.7 * a * (1 - Math.abs(p)), -1, 1);
}

interface Delay {
  def: MissionDef;
  clock: number;
  queue: { at: number; input: FrameInput }[];
}
const delays = new WeakMap<object, Delay>();

/**
 * The bot's input for this frame. With `reaction` > 0 it gives the decision it made `reaction` real seconds ago (no
 * input before its first one is due), through a queue kept with the options object: pass the same object every frame
 * of a run. The queue starts over when the lakon changes or the clock goes back. This bot reads only the state; the
 * world is for the options of Tasks 29 and 31.
 */
export function autopilot(s: GameState, w: World, o?: Partial<AutoOpts>): FrameInput {
  const opts: AutoOpts = { ...DEFAULT_OPTS, ...o };
  const now = decide(s, opts);
  if (!o || !(opts.reaction > 0)) return now;
  let d = delays.get(o);
  if (!d || d.def !== s.run.def || s.clock < d.clock) {
    d = { def: s.run.def, clock: s.clock, queue: [] };
    delays.set(o, d);
  }
  d.clock = s.clock;
  d.queue.push({ at: s.clock, input: now });
  const due = s.clock - opts.reaction + 1e-9;
  while (d.queue.length > 1 && d.queue[1].at <= due) d.queue.shift();
  return d.queue[0].at <= due ? d.queue[0].input : { ...now, drive: NO_INPUT, skip: false };
}
