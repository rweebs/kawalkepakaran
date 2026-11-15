// The bot driver. It runs pure pursuit along the engine's route toward the first open target (routeAhead), at a speed
// that drops for sharp turns and for the circles where the chariot must stop. By default it also meets the lures as a
// careful player does: it steers round a rewritten copy in its way and holds Krishna's sight near one, and on a course
// it rides through each day's real gate or its outer lane, where the route leads. autopilot() is the bot's decision for
// this frame, a pure function of its arguments. createBot() adds the reaction delay: its queue lives in the closure it
// returns, one bot per run, never in GameState. Units are metres and seconds; steer +1 turns right, so yaw decreases.
import { angleDiff, clamp, dist, forward, yawOf, type XZ } from './geom';
import { NO_INPUT, REST_SPEED, speedOf, turnRadius, type ChariotInput, type ChariotState } from './drive';
import { HULL, hullClearance, hullMid } from './collide';
import { drivable, openTargets, type Decoy, type RunState } from './mission-run';
import { across } from './missions';
import { pathLength, pursuit, turnsAhead, type Pursuit } from './route';
import { DRIVE, MISSION_TIMING } from './tuning';
import { distToCollider, type Collider } from './world';
import { DEFAULT_ASPECT, routeAhead, type FrameInput, type GameState, type World } from './engine';

/** The steering assist blends this bot's steer into the player's. The engine applies it, so it lives there. */
export { assistSteer } from './engine';

export interface AutoOpts {
  /** The share of the top speed (17 m/s) the bot drives at most. */
  speedCap: number;
  /** Real seconds between a decision and the input that carries it out: only createBot can add it. */
  reaction: number;
  /** Steer round an open copy within DODGE_AHEAD (10) m ahead, passing it DODGE_OFFSET (3.5) m to one side. */
  avoidDecoys: boolean;
  /**
   * Hold Krishna's sight while an open copy in the way lies within SIGHT_NEAR (15) m ahead, so a copy met is filed, not
   * taken.
   */
  useSight: boolean;
  /**
   * On a course, ride through each day's real gate, or its outer lane on a day of two rewrites, as the route leads. Off,
   * the bot rides through whichever of the next day's gates lies nearer the hull's middle, real or not.
   */
  pickReal: boolean;
}

/** autopilot's options: every AutoOpts field but `reaction`, which would need a queue (see createBot). */
export type DecisionOpts = Partial<Omit<AutoOpts, 'reaction'>> & { reaction?: never };

const DEFAULT_OPTS: AutoOpts = { speedCap: 1, reaction: 0, avoidDecoys: true, useSight: true, pickReal: true };
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
/**
 * A day's outer lane is only 4 m wide, and round a corner of a course the next day can lie 15 m on: a gate is crossed at
 * TURN_SPEED when a turn sharper than GATE_TURN (radians) follows it, and at GATE_SPEED (m/s) when one sharper than
 * GATE_SHARP does, so the bot (a first-time player's 0.4 s late too) comes round onto the next day's line in time.
 */
const GATE_TURN = (25 * Math.PI) / 180;
const GATE_SHARP = (40 * Math.PI) / 180;
const GATE_SPEED = 5;
/** Within NEAR_CIRCLE m of the circle where it must stop, the bot rides at CIRCLE_SPEED. */
const NEAR_CIRCLE = 12;
const CIRCLE_SPEED = 3;
/** Once its centre is this far inside that circle, the bot stops. */
const STOP_IN = 1;
/** The deceleration (m/s²) the bot plans with: well under the brake's 15, so it reaches each limit in time. */
const PLAN_DECEL = 6;
/** Above this forward speed (m/s) the chariot closes on what lies ahead; below it the drive pivots it in place. */
const MOVING = 1;
/**
 * The dodge, while the chariot rolls forward. Each steer would hold an arc: the bot looks DODGE_SPAN m along it, every
 * DODGE_STEP m. The copies it minds are open, within DODGE_AHEAD m of the hull's middle and not yet DODGE_BEHIND m
 * behind it. While the route's steer keeps the hull's middle DODGE_OFFSET m from each (or no closer than it already
 * is), the bot keeps it. Otherwise it takes the steer in STEERS nearest the route's that does, keeping the hull
 * DODGE_WALL m off every collider but the ranks (the guard keeps those); failing that, the one that passes widest, at
 * TURN_SPEED, where the chariot turns tightest. DODGE_OFFSET clears the 2.2 m in which the hull's middle takes a copy
 * (decoyR) by 1.3 m.
 */
const DODGE_AHEAD = 10;
const DODGE_BEHIND = MISSION_TIMING.decoyR;
const DODGE_OFFSET = 3.5;
const DODGE_SPAN = DODGE_AHEAD + DODGE_OFFSET;
const DODGE_STEP = 0.5;
const DODGE_WALL = 0.5;
const STEERS = Array.from({ length: 21 }, (_, k) => (k - 10) / 10);
/**
 * Sight is held while an open copy in the bot's way lies within SIGHT_NEAR m of the hull's middle, ahead of it or
 * abeam, and the chariot is closing on it. In its way means within SIGHT_SIDE m of the band the hull's middle sweeps
 * between where it is and the route. Sight spent on a copy farther aside, or while turning on the spot, would be gone
 * when the copy in the way comes.
 */
const SIGHT_NEAR = 15;
const SIGHT_SIDE = DODGE_OFFSET + 1;

type Target = ReturnType<typeof openTargets>[number];

/** How far p lies in front of the hull's middle along the heading (negative behind), and its distance from it. */
function bearingOf(s: GameState, p: XZ): { ahead: number; range: number } {
  const m = hullMid(s.car);
  const f = forward(s.car.yaw);
  return { ahead: (p.x - m.x) * f.x + (p.z - m.z) * f.z, range: dist(m, p) };
}

const open = (d: Decoy) => d.state === 'open';

/** p's signed distance from the path, positive to the right of its direction, measured to the nearest segment. */
function sideOf(path: readonly XZ[], p: XZ): number {
  let best = Infinity;
  let side = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1];
    const dx = path[k].x - a.x;
    const dz = path[k].z - a.z;
    const len = Math.hypot(dx, dz);
    if (len === 0) continue;
    const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len), 0, 1);
    const off = Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
    if (off >= best) continue;
    best = off;
    // rightOf(yaw) for this segment's yaw is (−dz, dx)/len.
    side = Math.sign((p.x - a.x) * -dz + (p.z - a.z) * dx) * off;
  }
  return side;
}

/** Whether the chariot closes on an open copy in its way, within SIGHT_NEAR m ahead of the hull's middle or abeam. */
function copyInWay(s: GameState, route: readonly XZ[]): boolean {
  if (speedOf(s.car) <= MOVING) return false;
  const self = sideOf(route, hullMid(s.car));
  const lo = Math.min(self, 0);
  const hi = Math.max(self, 0);
  return s.decoys.some((d) => {
    if (!open(d)) return false;
    const b = bearingOf(s, d.at);
    if (b.range > SIGHT_NEAR || b.ahead < 0) return false;
    const c = sideOf(route, d.at);
    return c >= lo - SIGHT_SIDE && c <= hi + SIGHT_SIDE;
  });
}

/** A copy the dodge minds, and how near the hull's middle must not come: DODGE_OFFSET, or as near as it already is. */
type Minded = { at: XZ; keep: number };

/**
 * How well the arc `steer` holds for DODGE_SPAN m keeps clear, sampled every DODGE_STEP m ahead of the chariot's pose:
 * `slack`, the least of (distance from the hull's middle to a minded copy − its keep), and `wall`, the least gap
 * between the hull and the solid colliders. On the arc the yaw falls by steer/turnRadius(v) a metre, as the drive
 * turns it.
 */
function arcClearance(car: ChariotState, steer: number, minded: readonly Minded[], solid: readonly Collider[]) {
  const bend = steer / turnRadius(speedOf(car));
  let { x, z, yaw } = car;
  let slack = Infinity;
  let wall = Infinity;
  for (let s = DODGE_STEP; s <= DODGE_SPAN + 1e-9; s += DODGE_STEP) {
    yaw -= bend * DODGE_STEP;
    const f = forward(yaw);
    x += f.x * DODGE_STEP;
    z += f.z * DODGE_STEP;
    const m = hullMid({ x, z, yaw });
    for (const c of minded) slack = Math.min(slack, dist(m, c.at) - c.keep);
    if (solid.length > 0) wall = Math.min(wall, hullClearance(x, z, yaw, solid));
  }
  return { slack, wall };
}

/**
 * The steer that carries the chariot round the copies ahead (see DODGE_*): the route's own while it keeps clear,
 * otherwise the nearest one in STEERS that does, otherwise the one that passes widest, with `slow` set. Ties go to the
 * first in STEERS.
 */
function dodge(s: GameState, w: World, steer: number): { steer: number; slow: boolean } {
  const keep = { steer, slow: false };
  if (speedOf(s.car) <= MOVING) return keep;
  const minded: Minded[] = [];
  for (const d of s.decoys) {
    if (!open(d)) continue;
    const b = bearingOf(s, d.at);
    if (b.range > DODGE_AHEAD || b.ahead < -DODGE_BEHIND) continue;
    minded.push({ at: d.at, keep: Math.min(DODGE_OFFSET, b.range) });
  }
  if (minded.length === 0) return keep;
  // Only colliders the hull can reach on an arc: its front circle's edge lies 5.05 m ahead of the origin.
  const solid = w.colliders.filter((c) => !c.figure && distToCollider(s.car, c) < DODGE_SPAN + 6);
  if (arcClearance(s.car, steer, minded, solid).slack >= 0) return keep;
  let best: { steer: number; slack: number } | null = null;
  let fit: number | null = null;
  for (const k of STEERS) {
    const c = arcClearance(s.car, k, minded, solid);
    if (c.wall < DODGE_WALL) continue;
    if (c.slack >= 0 && (fit === null || Math.abs(k - steer) < Math.abs(fit - steer))) fit = k;
    if (!best || c.slack > best.slack) best = { steer: k, slack: c.slack };
  }
  if (fit !== null) return { steer: fit, slow: false };
  return { steer: best?.steer ?? steer, slow: true };
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

/** How far short of a target the hull's middle, HULL.offsets[1] m ahead of the origin, passes it: null for the circles. */
function passedShort(target: Target): number | null {
  if (target.kind === 'pickup') return MISSION_TIMING.pickupR + HULL.offsets[1];
  return target.kind === 'gate' || target.kind === 'post' ? HULL.offsets[1] : null;
}

/**
 * The speed to arrive at a record, a gate or a post with: the path ahead does not end there, it turns toward what comes
 * next. A pickup is taken MISSION_TIMING.pickupR m short by the hull's middle, a gate or a post as the hull's middle
 * crosses it, so the turn starts early. After a gate the bot slows for gentler turns (see GATE_TURN); a turn back after
 * a gate or a post is taken from rest once across.
 */
function arrivalLimit(run: RunState, path: readonly XZ[], p: Pursuit, target: Target): number {
  const short = passedShort(target);
  if (short === null) return Infinity;
  const next = afterTarget(run, target);
  const n = path.length;
  if (!next || n < 2) return Infinity;
  const into = yawOf({ x: path[n - 1].x - path[n - 2].x, z: path[n - 1].z - path[n - 2].z });
  const turn = Math.abs(angleDiff(yawOf({ x: next.x - target.at.x, z: next.z - target.at.z }), into));
  const ahead = pathLength(path) - p.along - short;
  if (target.kind === 'gate') {
    if (turn > GATE_SHARP) return easeTo(GATE_SPEED, ahead);
    return turn > GATE_TURN ? easeTo(TURN_SPEED, ahead) : Infinity;
  }
  if (target.kind === 'pickup' && turn > TURN_BACK) return easeTo(TURN_BACK_SPEED, ahead);
  return turn > TURN_SHARP ? easeTo(TURN_SPEED, ahead) : Infinity;
}

/**
 * The speed to ride at: 0 to pivot (the route behind, or well off it while slow, unless dodging a copy), then capped by
 * speedCap, the arrival, sharp turns ahead and the circle where the chariot must stop.
 */
function targetSpeed(
  s: GameState,
  speedCap: number,
  path: readonly XZ[],
  p: Pursuit,
  target: Target,
  dodging: boolean,
): number {
  const off = Math.abs(p.alpha);
  if (off > TURN_BACK || (!dodging && off > PIVOT_UNTIL && Math.abs(speedOf(s.car)) < PIVOT_FROM)) return 0;
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
 * The straight line to the centre of the next day's gate nearer the hull's middle, real or not, while a course leads to
 * that day; otherwise null.
 */
function nearerGate(s: GameState, target: Target): XZ[] | null {
  const step = s.run.def.steps[s.run.step];
  const day = step?.kind === 'course' ? step.days[s.run.dayIndex] : undefined;
  if (!day || target.id !== `day${s.run.dayIndex + 1}`) return null;
  const m = hullMid(s.car);
  let best: XZ | null = null;
  for (const g of day.gates) {
    const at = across(day.at, day.heading, g.offset);
    if (!best || dist(m, at) < dist(m, best)) best = at;
  }
  return best && [{ x: s.car.x, z: s.car.z }, best];
}

/**
 * The bot's decision for this frame, with no reaction delay: a pure function of its arguments, so the same state gives
 * the same input whatever came before. It pursues the route (or with pickReal off, on a course, the line to the nearer
 * gate), steers round a copy in its way when avoidDecoys is on (the world gives the dodge its colliders), and holds sight
 * near one when useSight is on.
 */
export function autopilot(s: GameState, w: World, o?: DecisionOpts): FrameInput {
  const speedCap = o?.speedCap ?? DEFAULT_OPTS.speedCap;
  const avoidDecoys = o?.avoidDecoys ?? DEFAULT_OPTS.avoidDecoys;
  const useSight = o?.useSight ?? DEFAULT_OPTS.useSight;
  const pickReal = o?.pickReal ?? DEFAULT_OPTS.pickReal;
  const base = { sight: false, skip: s.run.phase === 'intro', assist: false, aspect: DEFAULT_ASPECT };
  const target = drivable(s.run) ? openTargets(s.run)[0] : undefined;
  const route = target ? ((!pickReal && nearerGate(s, target)) || routeAhead(s)) : null;
  if (!target || !route) return { ...base, drive: NO_INPUT };
  const p = pursuit(s.car, route);
  const d = avoidDecoys ? dodge(s, w, p.steer) : { steer: p.steer, slow: false };
  const dodging = d.steer !== p.steer || d.slow;
  const v = targetSpeed(s, speedCap, route, p, target, dodging);
  const pedal = pedals(speedOf(s.car), d.slow ? Math.min(v, TURN_SPEED) : v);
  return { ...base, sight: useSight && copyInWay(s, route), drive: { ...NO_INPUT, ...pedal, steer: d.steer } };
}

/**
 * One bot for one run. It gives autopilot's decisions `reaction` real seconds after making them (no input, and no
 * sight, before the first one is due), through a queue held in the closure it returns. The options are read once,
 * here; a fresh bot starts with an empty queue. Should one be reused after its run (the clock going back), its queue
 * starts over.
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
    return queue[0].at <= due ? queue[0].input : { ...now, drive: NO_INPUT, sight: false, skip: false };
  };
}
