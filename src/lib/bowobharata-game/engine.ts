// One frame of the game as plain data. advance() runs Krishna's sight on real time, scales the world's dt, blends the
// steering assist, drives the chariot (the guard keeps it off the ranks), applies the soft wall, resolves contacts,
// reports the guard holding the chariot, steps the lakon rules, moves the camera and gives the hints, in that order.
// Pure: no three.js, no DOM, no clock, no randomness; GameState holds no closures. `clock` counts real seconds, each
// frame capped at DRIVE.maxDt as the drive is; the world runs at half speed while sight is on. Units are metres.
// The engine imports nothing from the bot: the assist blends in pure pursuit along the same route the bot follows.
import { groundHeight, type Pose } from '../bowobharata/stage-math';
import { angleDiff, clamp, dist, forward, polylineDist, yawOf, type XZ } from './geom';
import {
  NO_INPUT,
  REST_SPEED,
  initChariot,
  speedOf,
  stepChariot,
  type ChariotInput,
  type ChariotState,
  type Guard,
} from './drive';
import { GAME_WARRIORS, PLAY, ZONES, softWallAccel, staticColliders, type Collider, type Zone } from './world';
import { figureGuard, hullMid, resolveContacts } from './collide';
import {
  bump,
  chaseView,
  failShot,
  initChase,
  introShots,
  outroShot,
  shotAt,
  stepChase,
  type ChaseCam,
  type ChaseOpts,
  type Shot,
} from './chase';
import { buildNav, projectOnPath, pursuit, routeTo, turnsAhead, type NavGrid } from './route';
import { objectivePoints, reachCircles, type MissionDef } from './missions';
import { initSight, stepSight, worldScale, type Sight } from './sight';
import {
  autoRecord,
  drivable,
  openTargets,
  restore,
  startRun,
  stepRun,
  totalReal,
  type Decoy,
  type GameEvent,
  type HintKey,
  type Phase,
  type RunState,
} from './mission-run';
import { CHASE, DRIVE, MISSION_TIMING } from './tuning';

export interface FrameInput {
  drive: ChariotInput;
  sight: boolean;
  skip: boolean;
  assist: boolean;
  aspect: number;
}

export interface World {
  colliders: readonly Collider[];
  figures: readonly Collider[];
  tall: readonly Collider[];
  zones: readonly Zone[];
  guard: Guard;
  nav: NavGrid;
  ground: (x: number, z: number) => number;
  mobile: boolean;
  warriors: number;
}

export type ShotKind = 'intro' | 'outro' | 'fail';

export interface GameState {
  /** Real seconds since the chapter started, each frame capped at DRIVE.maxDt (a longer frame slows the world). */
  clock: number;
  car: ChariotState;
  cam: ChaseCam;
  run: RunState;
  sight: Sight;
  decoys: Decoy[];
  /** The shot playing: the intro's three, the outro or the fail; `t` in world seconds since it started. */
  shot: { kind: ShotKind; shots: Shot[]; t: number } | null;
  /** The route to the first open target (by id), kept until the target changes or the car strays far from it. */
  route: { target: string; points: XZ[] } | null;
  hintsShown: HintKey[];
  /** Hints whose moment came while another was still within HINT_MIN; they fire in order, cleared at 'done'. */
  hintQueue: HintKey[];
  /** When the last hint, held and wall events fired (clock seconds; −Infinity before the first). */
  hintAt: number;
  heldAt: number;
  wallAt: number;
  /** The id the next copy (Decoy) or volley gets. */
  nextId: number;
}

/** A held event needs the guard to change the velocity by more than this (m/s) in one call: braking, not grazing. */
export const HELD_MIN = 0.05;
/** Real seconds from one held event to the next, and from one wall event to the next. */
export const EVENT_GAP = 6;
/** Real seconds a hint stays on the HUD before another may replace it. */
export const HINT_MIN = 1.5;
/** The outro's opening slow motion, for the scene's time scale. */
const OUTRO_SLOW = { seconds: 1.2, scale: 0.35 } as const;
/** Parva 8's dawn: the mix it starts from. */
const DAWN_FROM = 0.6;
/** A cached route is replaced when the car is farther than this (m) from it. */
const REROUTE_OFF = 20;
/** The aspect where no screen is known: the bot's input, and camera state that does not depend on the screen. */
export const DEFAULT_ASPECT = 16 / 9;
const DEG = Math.PI / 180;

export function createWorld(o: { mobile: boolean; warriors?: number }): World {
  const warriors = o.warriors ?? GAME_WARRIORS;
  const colliders = staticColliders(warriors);
  const figures = colliders.filter((c) => c.figure);
  return {
    colliders,
    figures,
    tall: colliders.filter((c) => c.tall),
    zones: ZONES,
    guard: figureGuard(figures),
    nav: buildNav(colliders),
    ground: groundHeight,
    mobile: o.mobile,
    warriors,
  };
}

function chaseOpts(w: World, aspect: number, car: ChariotState): ChaseOpts {
  return { aspect, boosting: car.boostT > 0, ground: w.ground, tall: w.tall };
}

/** The route to the first open target: the cached one while it still leads there and the car is near it. */
function routeFor(run: RunState, car: ChariotState, cached: GameState['route'], w: World): GameState['route'] {
  const target = openTargets(run)[0];
  if (!target) return null;
  const at = { x: car.x, z: car.z };
  if (cached && cached.target === target.id && polylineDist(at, cached.points) <= REROUTE_OFF) return cached;
  const points = routeTo(w.nav, w.colliders, at, target.at) ?? [at, { x: target.at.x, z: target.at.z }];
  return { target: target.id, points };
}

/**
 * A chapter's lakon from `from`: in roam when it has a marker, else straight into its intro. The scripted copies are
 * laid out. `seed` is kept for the volleys' randomness (Task 29); nothing in this engine is random yet.
 */
export function startChapter(
  def: MissionDef,
  from: { x: number; z: number; yaw: number },
  seed: number,
  w: World,
): GameState {
  const car = initChariot(from.x, from.z, from.yaw);
  const run = startRun(def);
  const decoys = def.scripted.decoys.map(
    (at, k): Decoy => ({ id: k + 1, at: { x: at.x, z: at.z }, born: 0, life: null, state: 'open', mimic: false }),
  );
  return {
    clock: 0,
    car,
    cam: initChase(car, chaseOpts(w, DEFAULT_ASPECT, car)),
    run,
    sight: initSight(),
    decoys,
    shot: null,
    route: routeFor(run, car, null, w),
    hintsShown: [],
    hintQueue: [],
    hintAt: -Infinity,
    heldAt: -Infinity,
    wallAt: -Infinity,
    nextId: decoys.length + 1,
  };
}

/** Real seconds for this frame: finite, not negative, at most DRIVE.maxDt (as the drive caps its own step). */
function frameSeconds(realDt: number): number {
  return Number.isFinite(realDt) && realDt > 0 ? Math.min(realDt, DRIVE.maxDt) : 0;
}

/**
 * The world's seconds in a frame of `realDt` real seconds, with this sight (the frame's, once stepped): the frame capped as
 * frameSeconds caps it, at half speed while Mata is on. advance() moves the car by it, and the runtime sways the chariot by it.
 */
export function worldDtOf(realDt: number, sight: Sight): number {
  return frameSeconds(realDt) * worldScale(sight);
}

/** The brake until the chariot is at rest, then nothing: a brake held at rest would start the reverse. */
function holdStill(car: ChariotState): ChariotInput {
  const v = speedOf(car);
  if (v > REST_SPEED) return { ...NO_INPUT, brake: 1 };
  if (v < -REST_SPEED) return { ...NO_INPUT, throttle: Math.min(1, -v) };
  return NO_INPUT;
}

/**
 * The path the bot follows from here: the cached route when it leads to the first open target, else the straight line
 * to that target; null with none open.
 */
export function routeAhead(s: GameState): readonly XZ[] | null {
  const target = openTargets(s.run)[0];
  if (!target) return null;
  const r = s.route;
  return r && r.target === target.id && r.points.length > 1 ? r.points : [{ x: s.car.x, z: s.car.z }, target.at];
}

/** The player's steer with the bot's added in, less as the player steers harder: none at full lock. */
export function assistSteer(player: number, auto: number): number {
  const p = clamp(Number.isFinite(player) ? player : 0, -1, 1);
  const a = clamp(Number.isFinite(auto) ? auto : 0, -1, 1);
  return clamp(p + 0.7 * a * (1 - Math.abs(p)), -1, 1);
}

/** The player's input, with the bot's steer (pure pursuit along routeAhead) blended in when the assist is on. */
function assisted(s: GameState, i: FrameInput): ChariotInput {
  if (!i.assist) return i.drive;
  const path = routeAhead(s);
  return { ...i.drive, steer: assistSteer(i.drive.steer, path ? pursuit(s.car, path).steer : 0) };
}

/** The soft wall's pull toward the centre, then a hard stop at PLAY.r: back onto the edge, the outward speed removed. */
function softWall(car: ChariotState, dt: number): { car: ChariotState; pushed: boolean } {
  const a = softWallAccel(car);
  const pushed = a.x !== 0 || a.z !== 0;
  let { x, z, vx, vz } = car;
  vx += a.x * dt;
  vz += a.z * dt;
  const dx = x - PLAY.cx;
  const dz = z - PLAY.cz;
  const d = Math.hypot(dx, dz);
  if (d > PLAY.r) {
    const nx = dx / d;
    const nz = dz / d;
    x = PLAY.cx + nx * PLAY.r;
    z = PLAY.cz + nz * PLAY.r;
    const out = vx * nx + vz * nz;
    if (out > 0) {
      vx -= out * nx;
      vz -= out * nz;
    }
  }
  return { car: pushed || d > PLAY.r ? { ...car, x, z, vx, vz } : car, pushed };
}

/** The shot a phase plays: the intro's, the outro's (held through done) or the fail's; none while driving. */
function shotKindOf(phase: Phase): ShotKind | null {
  if (phase === 'intro') return 'intro';
  if (phase === 'outro' || phase === 'done') return 'outro';
  if (phase === 'failed') return 'fail';
  return null;
}

/** The middle of the lakon's ground: the mean of its objective points and reach centres. */
function areaOf(def: MissionDef): XZ {
  const pts = [...objectivePoints(def), ...reachCircles(def).map((c) => c.at)];
  if (pts.length === 0) return { x: PLAY.cx, z: PLAY.cz };
  return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length };
}

/**
 * Step 9. The chase camera always follows; a phase with a shot plays it. A new outro or fail shot starts from the
 * live view (what this frame shows without it), so its first frame does not jump; the intro cuts in.
 */
function stepCamera(s: GameState, before: GameState['shot'], dt: number, aspect: number, w: World): GameState {
  const o = chaseOpts(w, aspect, s.car);
  const cam = stepChase(s.cam, s.car, dt, o);
  const kind = shotKindOf(s.run.phase);
  const running = before && { ...before, t: before.t + dt };
  if (!kind) return { ...s, cam, shot: null };
  if (running && running.kind === kind) return { ...s, cam, shot: running };
  if (kind === 'intro') {
    const first = openTargets(s.run)[0]?.at ?? { x: s.car.x, z: s.car.z };
    return { ...s, cam, shot: { kind, shots: introShots(areaOf(s.run.def), first, s.car, o), t: s.run.phaseT } };
  }
  const live = viewOf({ ...s, cam, shot: running }, w, aspect);
  const shot = kind === 'outro' ? outroShot(s.car, o) : failShot(s.car, o);
  return { ...s, cam, shot: { kind, shots: [{ ...shot, from: live.pose, fovFrom: live.fov }], t: 0 } };
}

/** The hints' moments: angles in degrees, distances in metres, speeds in m/s. */
const HINT = {
  /** steer: the next target's bearing off the heading. */
  steerOff: 25,
  /** rewrites and sight: a copy this near, in front of the hull's middle. */
  copyNear: 30,
  copyClose: 15,
  /** slow and stop: this near the open reach circle's edge, above these speeds. */
  slowNear: 25,
  slowSpeed: 8,
  stopSpeed: MISSION_TIMING.stopSpeed,
  /** surge: a straight this long left on the route's leg, moving along it within `straightAlign` and `straightOff` m. */
  straight: 60,
  straightAlign: 15,
  straightOff: 6,
  /** drift: a turn sharper than this, at the lookahead point or within `turnWithin` m, above `turnSpeed`. */
  turn: 60,
  turnWithin: 15,
  turnSpeed: 10,
} as const;

const pace = (car: ChariotState) => Math.hypot(car.vx, car.vz);

/** Whether p lies within `range` m of the hull's middle, in front of it (bearing within 90° of the heading). */
function ahead(car: ChariotState, p: XZ, range: number): boolean {
  const m = hullMid(car);
  if (dist(m, p) > range) return false;
  const f = forward(car.yaw);
  return (p.x - m.x) * f.x + (p.z - m.z) * f.z >= 0;
}

/** The open reach circle of the active step, if any. */
function openReach(run: RunState): { at: XZ; r: number } | null {
  const step = run.def.steps[run.step];
  return run.phase === 'active' && step?.kind === 'reach' ? { at: step.at, r: step.r } : null;
}

/** Metres from the hull's middle to the edge of the open reach circle (negative inside); Infinity with none. */
function reachEdge(s: GameState): number {
  const c = openReach(s.run);
  return c ? dist(hullMid(s.car), c.at) - c.r : Infinity;
}

/** The bearing of the first open target off the heading, radians (0 when the hull's middle is on it). */
function targetOff(s: GameState): number {
  const target = openTargets(s.run)[0];
  if (!target) return 0;
  const m = hullMid(s.car);
  if (dist(m, target.at) < 1) return 0;
  return Math.abs(angleDiff(yawOf({ x: target.at.x - m.x, z: target.at.z - m.z }), s.car.yaw));
}

/** The straight left on the route's current leg (m), when the car is moving along it on the route; else 0. */
function straightAhead(s: GameState): number {
  const pts = s.route?.points;
  if (!pts || pts.length < 2 || speedOf(s.car) <= 1) return 0;
  const { along, off } = projectOnPath(pts, s.car);
  if (off > HINT.straightOff) return 0;
  let end = 0;
  for (let k = 1; k < pts.length; k++) {
    const len = dist(pts[k - 1], pts[k]);
    end += len;
    if (end < along || len === 0) continue;
    const leg = yawOf({ x: pts[k].x - pts[k - 1].x, z: pts[k].z - pts[k - 1].z });
    return Math.abs(angleDiff(leg, s.car.yaw)) <= HINT.straightAlign * DEG ? end - along : 0;
  }
  return 0;
}

/**
 * Whether the route turns by more than HINT.turn here (toward the lookahead point) or within HINT.turnWithin m ahead,
 * not counting the turn inside the open reach circle, where the chariot stops anyway.
 */
function sharpTurnAhead(s: GameState): boolean {
  const pts = s.route?.points;
  if (!pts || pts.length < 2) return false;
  const reach = openReach(s.run);
  const outside = (p: XZ) => !reach || dist(p, reach.at) > reach.r;
  const p = pursuit(s.car, pts);
  if (Math.abs(p.alpha) > HINT.turn * DEG && outside(p.look)) return true;
  const sharp = (t: { ahead: number; turn: number; at: XZ }) =>
    t.ahead <= HINT.turnWithin && Math.abs(t.turn) > HINT.turn * DEG && outside(t.at);
  return turnsAhead(pts, p.along).some(sharp);
}

/** The prologue's lessons come only in an active lakon that teaches; the surge and the drift from chapter 1 on. */
const lesson = (s: GameState) => s.run.def.hints && s.run.phase === 'active';
const fromChapterOne = (s: GameState) => s.run.def.chapter >= 1 && drivable(s.run);

const HINT_RULES: Readonly<Record<HintKey, (s: GameState) => boolean>> = {
  ride: (s) => lesson(s),
  steer: (s) => lesson(s) && targetOff(s) > HINT.steerOff * DEG,
  rewrites: (s) => lesson(s) && s.decoys.some((d) => d.state === 'open' && ahead(s.car, d.at, HINT.copyNear)),
  sight: (s) => lesson(s) && !s.sight.on && s.decoys.some((d) => d.state === 'open' && ahead(s.car, d.at, HINT.copyClose)),
  slow: (s) => lesson(s) && reachEdge(s) <= HINT.slowNear && pace(s.car) > HINT.slowSpeed,
  stop: (s) => lesson(s) && reachEdge(s) <= 0 && pace(s.car) > HINT.stopSpeed,
  surge: (s) => fromChapterOne(s) && straightAhead(s) >= HINT.straight,
  drift: (s) => fromChapterOne(s) && pace(s.car) > HINT.turnSpeed && sharpTurnAhead(s),
};
/** The order hints whose moments come in the same frame are queued in. */
const HINT_ORDER: readonly HintKey[] = ['ride', 'steer', 'rewrites', 'sight', 'slow', 'stop', 'surge', 'drift'];

/**
 * Step 10. A hint whose moment has come (not shown this session, not already waiting) joins the queue; the queue's
 * first hint fires once the hint on the HUD has stayed HINT_MIN, even if its own moment has passed (each is a lesson).
 * At most one fires per frame. The queue is dropped when the lakon ends.
 */
function stepHints(s: GameState): { state: GameState; event: GameEvent | null } {
  if (s.run.phase === 'done') return { state: s.hintQueue.length > 0 ? { ...s, hintQueue: [] } : s, event: null };
  const due = HINT_ORDER.filter((k) => !s.hintsShown.includes(k) && !s.hintQueue.includes(k) && HINT_RULES[k](s));
  const queue = due.length > 0 ? [...s.hintQueue, ...due] : s.hintQueue;
  if (queue.length === 0 || s.clock - s.hintAt < HINT_MIN) {
    return { state: queue === s.hintQueue ? s : { ...s, hintQueue: queue }, event: null };
  }
  const [key, ...rest] = queue;
  return {
    state: { ...s, hintsShown: [...s.hintsShown, key], hintQueue: rest, hintAt: s.clock },
    event: { type: 'hint', key },
  };
}

/**
 * One frame. During the intro, the outro, a fail and after the end the input is ignored (except the intro's skip)
 * and the chariot is brought to rest; in roam nothing presses (no timer, no fail).
 */
export function advance(
  s: GameState,
  input: FrameInput,
  realDt: number,
  w: World,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const real = frameSeconds(realDt);
  const clock = s.clock + real;
  const driving = drivable(s.run);
  // 1–2. Sight runs on real time; the world's dt follows it.
  const sight = stepSight(s.sight, driving && input.sight, real);
  const dt = worldDtOf(realDt, sight);
  // 3–4. The assist, then the drive with the guard at the ranks.
  const drive = driving ? assisted(s, input) : holdStill(s.car);
  const driven = stepChariot(s.car, drive, dt, { cloud: false, guard: w.guard });
  // 5. The soft wall.
  const walled = softWall(driven, dt);
  let { wallAt, heldAt } = s;
  if (walled.pushed && clock - wallAt >= EVENT_GAP) {
    events.push({ type: 'wall' });
    wallAt = clock;
  }
  // 6. Contacts: only a hard one with something other than the ranks shakes the camera.
  const hit = resolveContacts(walled.car, w.colliders);
  const car = hit.car;
  let cam = s.cam;
  if (hit.contact && !hit.contact.figure && hit.contact.speed > CHASE.shakeMinImpact) {
    cam = bump(cam, hit.contact.speed);
    events.push({ type: 'bump', speed: hit.contact.speed });
  }
  // 7. The guard holding the chariot short of the ranks: a message, nothing more.
  if (car.held > HELD_MIN && clock - heldAt >= EVENT_GAP) {
    events.push({ type: 'held' });
    heldAt = clock;
  }
  // 8. The lakon's rules, then the route to whatever is open now.
  const ran = stepRun(s.run, {
    car,
    mid: hullMid(car),
    midPrev: hullMid(s.car),
    dt,
    sight: sight.on,
    skip: input.skip,
    riuh: 0,
    decoys: s.decoys,
  });
  events.push(...ran.events);
  const moved: GameState = {
    ...s,
    clock,
    car,
    cam,
    run: ran.run,
    sight,
    decoys: ran.decoys,
    route: routeFor(ran.run, car, s.route, w),
    heldAt,
    wallAt,
  };
  // 9–10. The camera, then the hints.
  const hinted = stepHints(stepCamera(moved, s.shot, dt, input.aspect, w));
  if (hinted.event) events.push(hinted.event);
  return { state: hinted.state, events };
}

/** Back to the last checkpoint, active, at rest: what was recorded and scored stays; at least 60 s are left. */
export function retryFromCheckpoint(s: GameState, w: World): GameState {
  const back = restore(s.run);
  const car = initChariot(back.car.x, back.car.z, back.car.yaw);
  return {
    ...s,
    car,
    cam: initChase(car, chaseOpts(w, DEFAULT_ASPECT, car)),
    run: back.run,
    shot: null,
    route: routeFor(back.run, car, null, w),
  };
}

/** Records every open target and goes to the outro; the run is no longer whole. Its shot starts on the next frame. */
export function skipToRecord(s: GameState): { state: GameState; events: GameEvent[] } {
  const r = autoRecord(s.run);
  return { state: { ...s, run: r.run, route: null }, events: r.events };
}

/** Roam only: the chariot at rest on the marker, facing as the lakon starts; the intro begins on the next frame. */
export function teleportToMarker(s: GameState, w: World): GameState {
  if (s.run.phase !== 'roam' || !s.run.def.marker) return s;
  const { x, z, yaw } = s.run.def.start;
  const car = initChariot(x, z, yaw);
  return { ...s, car, cam: initChase(car, chaseOpts(w, DEFAULT_ASPECT, car)), route: routeFor(s.run, car, null, w) };
}

/** What the camera shows: the shot playing, else the chase view (its shake runs on the clock). */
export function viewOf(s: GameState, w: World, aspect: number): { pose: Pose; fov: number } {
  if (s.shot) {
    const v = shotAt(s.shot.shots, s.shot.t);
    return { pose: v.pose, fov: v.fov };
  }
  return chaseView(s.cam, s.car, chaseOpts(w, aspect, s.car), s.clock);
}

/** The scene's time scale: slow motion early in the outro, half speed with sight, otherwise 1. */
export function timeScaleOf(s: GameState): number {
  if (s.run.phase === 'outro' && s.run.phaseT < OUTRO_SLOW.seconds) return OUTRO_SLOW.scale;
  return worldScale(s.sight);
}

/**
 * The dawn mix for the scene. Parva 8 (the dawn lakon): 0.6 + 0.4·done/(total + 1), the delivery counting as the last
 * share as the outro runs, so it reaches 1. Every other lakon: 0 (the finale's full mix belongs to the runtime).
 */
export function mixOf(s: GameState): number {
  const { def, phase, phaseT, recorded } = s.run;
  if (!def.dawn) return 0;
  if (phase === 'done') return 1;
  const delivered = phase === 'outro' ? Math.min(1, phaseT / MISSION_TIMING.outroSeconds) : 0;
  return DAWN_FROM + ((1 - DAWN_FROM) * (recorded.length + delivered)) / (totalReal(def) + 1);
}
