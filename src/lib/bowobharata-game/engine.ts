// One frame of the game as plain data. advance() runs Krishna's sight on real time, scales the world's dt, blends the
// steering assist, drives the chariot (the guard keeps it off the ranks; the field's edge brakes it to rest at 160 m,
// as the guard does; haze slows it), applies the soft wall, resolves contacts, reports the guard holding the chariot,
// steps the lakon rules, then the clamour and the volleys (copies stay off the route), moves the camera and gives the
// hints, in that order.
// Pure: no three.js, no DOM, no clock; GameState holds no closures. The volleys' only randomness is the stored rng
// state, stepped with nextRand from the chapter's seed. `clock` counts real seconds, each frame capped at DRIVE.maxDt
// as the drive is; the world runs at half speed while sight is on. The clamour, the volleys, the copies and the haze
// run on run.t, the lakon's world seconds, which stand still outside its active part. Units are metres.
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
import { GAME_WARRIORS, PLAY, ZONES, softWallAccel, staticColliders, zonesAt, type Collider, type Zone } from './world';
import { fieldEdge, figureGuard, hullMid, resolveContacts } from './collide';
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
import { initRiuh, kickRiuh, levelEffects, riuhLevel, stepRiuh, type Riuh, type RiuhKick } from './riuh';
import { inCloud, planVolley, scriptedVolley, stepVolleys, type Cloud, type Volley } from './volley';
import { CHASE, DRIVE, MISSION_TIMING, VOLLEY } from './tuning';

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
  decoys: readonly Decoy[];
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
  /** The id the next volley gets (its copy and haze share it); the lakon's own copies and haze are numbered first. */
  nextId: number;
  /** The clamour, on run.t; it moves only while the lakon is active. */
  riuh: Riuh;
  /**
   * Volleys planned and not yet done, on run.t: warned, in the air, or landed and still standing (stepVolleys drops the
   * absorbed and the sunk). They move only while the lakon is active: one still in the air when it ends stays put.
   */
  volleys: readonly Volley[];
  /** Haze: the lakon's own (no life) and what volleys leave from level 3 (VOLLEY.cloudLife s), on run.t. */
  clouds: readonly Cloud[];
  /** The run.t at which the next volley is planned; null while none is due (before 20 s, at level 0, after a retry). */
  nextVolley: number | null;
  /** The volleys' rng state, stepped with nextRand; it starts at the chapter's seed. */
  rng: number;
  /** The clamour's whole level as last reported: a `level` event fires when riuhLevel(riuh.value) differs from it. */
  level: number;
  /** Whether the lakon's scripted volley (scripted.volleyLine) has been planned: it comes once. */
  scriptedPlanned: boolean;
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
/** The play disc's edge, which the drive brakes the chariot against at the guard's deceleration. */
const EDGE = fieldEdge(PLAY);
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

/** The prologue's scripted copy, the Mata lesson: it lies on the path on purpose, so the route never retires it. */
const isLesson = (def: MissionDef, d: Decoy) => def.chapter === 0 && d.life === null;

/**
 * Lures stay off the route: every open copy within VOLLEY.routeClear m of it is retired ('gone', no event), except the
 * prologue's lesson. Copies come out with the lakon, so in roam (with the marker's route) nothing is retired.
 */
function offRoute(decoys: readonly Decoy[], run: RunState, route: GameState['route']): readonly Decoy[] {
  if (!route || run.phase === 'roam') return decoys;
  let any = false;
  for (let k = 0; k < decoys.length && !any; k++) any = onRoute(decoys[k], run.def, route.points);
  if (!any) return decoys;
  return decoys.map((d) => (onRoute(d, run.def, route.points) ? { ...d, state: 'gone' as const } : d));
}

/** An open copy, not the lesson, within VOLLEY.routeClear m of the route. */
const onRoute = (d: Decoy, def: MissionDef, route: readonly XZ[]) =>
  d.state === 'open' && !isLesson(def, d) && polylineDist(d.at, route) < VOLLEY.routeClear;

/** The most volley copies open at once: VOLLEY.maxDecoys, VOLLEY.maxDecoysMobile on phones. */
const copyCap = (w: World) => (w.mobile ? VOLLEY.maxDecoysMobile : VOLLEY.maxDecoys);

/** Beyond the cap the oldest open volley copies (by landing, then id) are retired; the lakon's own never count. */
function capCopies(decoys: readonly Decoy[], cap: number): readonly Decoy[] {
  const open = decoys.filter((d) => d.life !== null && d.state === 'open');
  if (open.length <= cap) return decoys;
  open.sort((a, b) => a.born - b.born || a.id - b.id);
  const retired = new Set(open.slice(0, open.length - cap).map((d) => d.id));
  return decoys.map((d) => (retired.has(d.id) ? { ...d, state: 'gone' as const } : d));
}

/**
 * A chapter's lakon from `from`: in roam when it has a marker, else straight into its intro. The scripted copies and
 * haze are laid out, and the clamour starts at the lakon's start value. `seed` starts the volleys' rng.
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
  const clouds = def.scripted.clouds.map(
    (at, k): Cloud => ({ id: decoys.length + k + 1, at: { x: at.x, z: at.z }, r: VOLLEY.cloudR, born: 0, life: null }),
  );
  const route = routeFor(run, car, null, w);
  const riuh = initRiuh({ start: def.riuh.start, frozen: def.riuh.frozen, t: 0 });
  return {
    clock: 0,
    car,
    cam: initChase(car, chaseOpts(w, DEFAULT_ASPECT, car)),
    run,
    sight: initSight(),
    decoys: offRoute(decoys, run, route),
    shot: null,
    route,
    hintsShown: [],
    hintQueue: [],
    hintAt: -Infinity,
    heldAt: -Infinity,
    wallAt: -Infinity,
    nextId: decoys.length + clouds.length + 1,
    riuh,
    volleys: [],
    clouds,
    nextVolley: null,
    rng: seed >>> 0,
    level: riuhLevel(riuh.value),
    scriptedPlanned: false,
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

/**
 * The soft wall's pull toward the centre, then a hard stop at PLAY.r: back onto the edge, the outward speed removed.
 * The drive's edge has already braked the chariot to rest there; the stop only takes back the hair that straight
 * substeps along the curved edge carry it past.
 */
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

/** The clamour's kicks in a frame's lakon events, in order: delivering is the close of the reach step at the tower. */
function kicksOf(def: MissionDef, events: readonly GameEvent[]): readonly RiuhKick[] {
  let kicks: RiuhKick[] | null = null;
  for (const e of events) {
    if (e.type === 'recorded' || e.type === 'filed' || e.type === 'rewriteTaken') (kicks ??= []).push(e.type);
    if (e.type !== 'stepDone') continue;
    const step = def.steps[e.step];
    if (step?.kind === 'reach' && step.place === 'tower') (kicks ??= []).push('delivered');
  }
  return kicks ?? NO_KICKS;
}
const NO_KICKS: readonly RiuhKick[] = Object.freeze([]);

type Lived = { born: number; life: number | null };
/** Whether a copy or haze still has life left at run.t `t` (the lakon's own have no end). */
const alive = (x: Lived, t: number) => x.life === null || t < x.born + x.life;

/** The list without what is spent at `t`: the same list when nothing is. */
function prune<T extends Lived>(xs: readonly T[], t: number): readonly T[] {
  for (let k = 0; k < xs.length; k++) if (!alive(xs[k], t)) return xs.filter((x) => alive(x, t));
  return xs;
}

/** The side of w from the line uv: positive to its left, 0 on it. */
const side = (u: XZ, v: XZ, w: XZ) => (v.x - u.x) * (w.z - u.z) - (v.z - u.z) * (w.x - u.x);
/** Whether w, known to lie on the line uv, lies between u and v. */
const between = (u: XZ, v: XZ, w: XZ) =>
  Math.min(u.x, v.x) <= w.x && w.x <= Math.max(u.x, v.x) && Math.min(u.z, v.z) <= w.z && w.z <= Math.max(u.z, v.z);
/** Whether w lies on the segment uv. */
const onSegment = (u: XZ, v: XZ, w: XZ) => side(u, v, w) === 0 && between(u, v, w);
/** Whether the path from a to b meets the segment pq, touching included: stopping on a line counts as reaching it. */
function meets(a: XZ, b: XZ, p: XZ, q: XZ): boolean {
  if (side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0) return true;
  return onSegment(p, q, a) || onSegment(p, q, b) || onSegment(a, b, p) || onSegment(a, b, q);
}

/** What a landed volley leaves shares its id, lies at its landing and dates from it. */
const leftBy = (v: Volley) => ({ id: v.id, at: { x: v.to.x, z: v.to.z }, born: v.t0 + v.flight });

/**
 * Step 9, in a frame that began in the active lakon (run.t moved). It fills the clamour and volley fields of `next`,
 * this frame's own new state (not yet handed out), from `prev`, and pushes the events onto `events`. The clamour takes
 * its own step to run.t from the zones the chariot is in, then this frame's kicks; a new whole level gives a `level`
 * event. While the lakon is still active, volleys are planned: from run.t 20 at level 1 or more, the first after half
 * the level's gap, then one each gap, each leaving a copy, and haze from level 3; the scripted volley comes the first
 * time the hull's middle reaches its line. Every volley is stepped: an absorbed one gives an event and leaves nothing;
 * a landed one leaves its copy (VOLLEY.decoyLife s) and its haze. Spent copies and haze go, and beyond the cap the
 * oldest volley copy is retired. With nothing in flight no list is rebuilt: only what is spent goes.
 */
function stepPressure(
  next: GameState,
  prev: GameState,
  ran: readonly GameEvent[],
  dt: number,
  w: World,
  events: GameEvent[],
): void {
  const { run, car, route } = next;
  const { def, t } = run;
  let riuh = stepRiuh(prev.riuh, { t, ...zonesAt(car) }, dt);
  for (const k of kicksOf(def, ran)) riuh = kickRiuh(riuh, k, t);
  const level = riuhLevel(riuh.value);
  if (level !== prev.level) events.push({ type: 'level', level });
  next.riuh = riuh;
  next.level = level;

  const on = run.phase === 'active';
  let planned: Volley[] | null = null;
  const every = on && def.riuh.volleys && t >= MISSION_TIMING.firstVolley ? levelEffects(level).volleyEvery : null;
  if (every === null) next.nextVolley = null;
  else if (prev.nextVolley === null) next.nextVolley = t + 0.5 * every;
  else if (t >= prev.nextVolley) {
    const opts = { decoy: true, cloud: level >= 3, id: prev.nextId, route: route?.points ?? null };
    const plan = planVolley(car, t, prev.rng, w, opts);
    next.rng = plan.rng;
    if (plan.volley) (planned ??= []).push(plan.volley);
    next.nextVolley = t + every;
  }
  const line = def.scripted.volleyLine;
  if (on && line && !prev.scriptedPlanned && meets(hullMid(prev.car), hullMid(car), line.a, line.b)) {
    const id = prev.nextId + (planned?.length ?? 0);
    (planned ??= []).push(scriptedVolley(line.at, t, id, w));
    next.scriptedPlanned = true;
  }
  if (planned) {
    next.nextId = prev.nextId + planned.length;
    for (const v of planned) events.push({ type: 'volley', id: v.id });
  }

  if (!planned && prev.volleys.length === 0) {
    next.decoys = prune(next.decoys, t);
    next.clouds = prune(prev.clouds, t);
    return;
  }
  const out = stepVolleys(planned ? [...prev.volleys, ...planned] : prev.volleys, car, t);
  next.volleys = out.volleys;
  for (let k = 0; k < out.absorbed.length; k++) events.push({ type: 'absorbed' });
  let copies: Decoy[] | null = null;
  let hazes: Cloud[] | null = null;
  for (const v of out.landed) {
    if (v.decoy) (copies ??= []).push({ ...leftBy(v), life: VOLLEY.decoyLife, state: 'open', mimic: false });
    if (v.cloud) (hazes ??= []).push({ ...leftBy(v), r: VOLLEY.cloudR, life: VOLLEY.cloudLife });
  }
  const kept = prune(next.decoys, t);
  next.decoys = copies ? capCopies(offRoute([...kept, ...copies], run, route), copyCap(w)) : kept;
  const live = prune(prev.clouds, t);
  next.clouds = hazes ? [...live, ...hazes] : live;
}

/**
 * Step 10. The chase camera always follows; a phase with a shot plays it. A new outro or fail shot starts from the
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
  /** rewrites and sight: one of the lakon's own copies open this near, in front of the hull's middle (ownCopyAhead). */
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

/**
 * Whether one of the lakon's own copies (no life) lies open within `range` m in front of the hull's middle. A volley's
 * copy has a life and never counts: rewrites and sight teach only about the copies a lakon lays out on purpose (in the
 * prologue, the Mata lesson), never about where a volley happened to come down.
 */
function ownCopyAhead(s: GameState, range: number): boolean {
  const { decoys } = s;
  for (let k = 0; k < decoys.length; k++) {
    const d = decoys[k];
    if (d.life === null && d.state === 'open' && ahead(s.car, d.at, range)) return true;
  }
  return false;
}

/** The prologue's lessons come only in an active lakon that teaches; the surge and the drift from chapter 1 on. */
const lesson = (s: GameState) => s.run.def.hints && s.run.phase === 'active';
const fromChapterOne = (s: GameState) => s.run.def.chapter >= 1 && drivable(s.run);

const HINT_RULES: Readonly<Record<HintKey, (s: GameState) => boolean>> = {
  ride: (s) => lesson(s),
  steer: (s) => lesson(s) && targetOff(s) > HINT.steerOff * DEG,
  rewrites: (s) => lesson(s) && ownCopyAhead(s, HINT.copyNear),
  sight: (s) => lesson(s) && !s.sight.on && ownCopyAhead(s, HINT.copyClose),
  slow: (s) => lesson(s) && reachEdge(s) <= HINT.slowNear && pace(s.car) > HINT.slowSpeed,
  stop: (s) => lesson(s) && reachEdge(s) <= 0 && pace(s.car) > HINT.stopSpeed,
  surge: (s) => fromChapterOne(s) && straightAhead(s) >= HINT.straight,
  drift: (s) => fromChapterOne(s) && pace(s.car) > HINT.turnSpeed && sharpTurnAhead(s),
};
/** The order hints whose moments come in the same frame are queued in. */
const HINT_ORDER: readonly HintKey[] = ['ride', 'steer', 'rewrites', 'sight', 'slow', 'stop', 'surge', 'drift'];

/**
 * Step 11. A hint whose moment has come (not shown this session, not already waiting) joins the queue; the queue's
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
  // 3–4. The assist, then the drive with the guard at the ranks, the brake at the field's edge, and haze once the
  // lakon is out (its haze comes with it, as its copies do).
  const drive = driving ? assisted(s, input) : holdStill(s.car);
  const cloud = s.run.phase === 'active' && inCloud(s.car, s.clouds, s.run.t);
  const driven = stepChariot(s.car, drive, dt, { cloud, guard: w.guard, edge: EDGE });
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
  // 8. The lakon's rules (checkpoints and the calm bonus see the live clamour), then the route to whatever is open now.
  const ran = stepRun(s.run, {
    car,
    mid: hullMid(car),
    midPrev: hullMid(s.car),
    dt,
    sight: sight.on,
    skip: input.skip,
    riuh: s.riuh.value,
    decoys: s.decoys,
  });
  events.push(...ran.events);
  // The frame's new state; step 9 fills in its clamour and volleys before it is handed on to the camera and hints.
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
  // 9. The clamour and the volleys, in a frame that began in the active lakon; then no lure is left on the route.
  if (s.run.phase === 'active') stepPressure(moved, s, ran.events, dt, w, events);
  moved.decoys = offRoute(moved.decoys, moved.run, moved.route);
  // 10–11. The camera, then the hints.
  const hinted = stepHints(stepCamera(moved, s.shot, dt, input.aspect, w));
  if (hinted.event) events.push(hinted.event);
  return { state: hinted.state, events };
}

/**
 * Back to the last checkpoint, active, at rest: what was recorded and scored stays; at least 60 s are left. The clamour
 * starts again from the checkpoint's, at most 1, at the restored run.t (its rise counts from there); the volleys are
 * called off, and the copies and haze they left go. The lakon's own copies and haze stay as they are.
 */
export function retryFromCheckpoint(s: GameState, w: World): GameState {
  const back = restore(s.run);
  const car = initChariot(back.car.x, back.car.z, back.car.yaw);
  const route = routeFor(back.run, car, null, w);
  return {
    ...s,
    car,
    cam: initChase(car, chaseOpts(w, DEFAULT_ASPECT, car)),
    run: back.run,
    shot: null,
    route,
    riuh: initRiuh({ start: back.riuh, frozen: back.run.def.riuh.frozen, t: back.run.t }),
    volleys: [],
    nextVolley: null,
    decoys: offRoute(s.decoys.filter((d) => d.life === null), back.run, route),
    clouds: s.clouds.filter((c) => c.life === null),
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
