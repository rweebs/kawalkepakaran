// The chase camera and the lakon's camera shots. Pure: no three.js, no DOM, no clock. The camera rides in the chariot's
// frame: its yaw, boom length and height are eased, never its world position, so it never falls further behind at
// speed. Units are metres, seconds and degrees of FOV; forward(yaw) is (cos yaw, −sin yaw).
import type { Pose } from '../bowobharata/stage-math';
import type { Vec3 } from '../sky/states';
import { angleDiff, clamp, forward, smoothstep, yawOf, type XZ } from './geom';
import { speedOf, type ChariotState } from './drive';
import { CHASE } from './tuning';
import { distToCollider, type Collider } from './world';

export interface ChaseCam {
  /** The boom's yaw: the camera sits along −forward(yaw) from the chariot. */
  yaw: number;
  /** The boom length the camera wants, before tall things shorten it. */
  dist: number;
  /** Metres over the ground under the chariot. */
  height: number;
  /** Vertical FOV in degrees, before Laju and the screen's aspect. */
  fov: number;
  /** Laju's weight, 0 to 1. */
  boostK: number;
  /** The shake's amplitude in metres. */
  shake: number;
  /** The boom's length once tall things have shortened it: at most dist. */
  boom: number;
}

export interface ChaseOpts {
  aspect: number;
  boosting: boolean;
  ground: (x: number, z: number) => number;
  tall: readonly Collider[];
}

export interface Shot {
  from: Pose;
  to: Pose;
  seconds: number;
  fovFrom: number;
  fovTo: number;
}

type Ground = ChaseOpts['ground'];

/** The highest points of the drivable chariot's riders, banner and horses: chariot-local metres, x forward, y up from the ground. */
export const CHARIOT_SILHOUETTE: readonly { name: string; x: number; y: number }[] = Object.freeze(
  [
    { name: 'prabha', x: 0.45, y: 3.55 },
    // The feather's top corner, (0.483, 3.680) in chariot.ts, rounded outward.
    { name: 'krishna-feather', x: 0.49, y: 3.68 },
    { name: 'arjuna-crown', x: -0.55, y: 3.52 },
    { name: 'banner', x: -1.05, y: 3.3 },
    { name: 'horse-heads', x: 4.5, y: 2.1 },
  ].map((p) => Object.freeze(p)),
);

/** Above this forward speed (m/s) the camera turns into a slide and looks along the velocity. */
const SLIP_FROM = 2;
/** The speed blend runs from 0 at 8 m/s to 1 at 17 m/s (top speed). */
const BLEND_FROM = 8;
const BLEND_SPAN = 9;
const DEG = Math.PI / 180;

/** The lakon shots and the finale's orbit: seconds, metres, radians and rad/s. */
const SHOTS = {
  wide: { seconds: 1.2, up: 40, from: 30, to: 24 },
  /** Swings from `swing` rad one side of the line to the chariot to `swing` rad the other side while closing in. */
  dolly: { seconds: 1.2, up: 2.5, from: 14, to: 8, swing: 0.35 },
  descend: { seconds: 1.1, back: 20, up: 8 },
  outro: { seconds: 2.5, out: 7, up: 2 },
  fail: { seconds: 1.2, back: 6, up: 12 },
  /** Looks at the centre `look` m up, so the ring of lamps round the tower and the tower above it share the frame. */
  orbit: { radius: 14, up: 6, rate: 0.08, look: 3 },
  /** The shots look at a record or the chariot this high over its ground. */
  look: 1,
} as const;

const speed = (car: ChariotState) => Math.hypot(car.vx, car.vz);

/** The direction of travel: along the velocity when rolling forward faster than 2 m/s, else along the heading. */
function travel(car: ChariotState): XZ {
  if (speedOf(car) <= SLIP_FROM) return forward(car.yaw);
  const v = speed(car);
  return { x: car.vx / v, z: car.vz / v };
}

/** The yaw, boom length, height and FOV the camera settles to behind this chariot with this much Laju. */
function settled(car: ChariotState, boostK: number): Pick<ChaseCam, 'yaw' | 'dist' | 'height' | 'fov'> {
  const s = clamp((speed(car) - BLEND_FROM) / BLEND_SPAN, 0, 1);
  // Rolling forward faster than 2 m/s: halfway from the heading toward the travel (they part in a slide). Else the heading.
  const slip = speedOf(car) > SLIP_FROM ? angleDiff(yawOf({ x: car.vx, z: car.vz }), car.yaw) : 0;
  return {
    yaw: angleDiff(car.yaw + CHASE.slipFollow * slip, 0),
    dist: CHASE.distance + (CHASE.distanceAtTop - CHASE.distance) * s + CHASE.boostExtra * boostK,
    height: CHASE.height + (CHASE.heightAtTop - CHASE.height) * s + CHASE.boostLift * boostK,
    // Laju's 8° is added in chaseView.
    fov: CHASE.fov + (CHASE.fovAtTop - CHASE.fov) * s,
  };
}

/** `from` moved exponentially toward `to` at `rate` per second for dt seconds. */
const ease = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);
// Weighted form, so k = 0 and k = 1 give the ends exactly.
const lerp = (a: number, b: number, k: number) => a * (1 - k) + b * k;
const lerpVec = (a: Vec3, b: Vec3, k: number): Vec3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });

/** The camera settled behind the chariot: what stepChase converges to with these inputs held. */
export function initChase(car: ChariotState, o: ChaseOpts): ChaseCam {
  const boostK = o.boosting ? 1 : 0;
  const aim = settled(car, boostK);
  return { ...aim, boostK, shake: 0, boom: boomLength(car, aim.yaw, aim.dist, o.tall) };
}

// Readings behind the pinned numbers: Laju's weight ramps linearly before the easing, so this frame's targets carry it;
// every rate eases exponentially (x → target + (x − target)·e^(−rate·dt)); the boom eases out its shortfall from dist,
// so with nothing tall it equals dist and never lags.
export function stepChase(cam: ChaseCam, car: ChariotState, dt: number, o: ChaseOpts): ChaseCam {
  const h = dt > 0 ? dt : 0; // a NaN or negative step counts as no time
  const boostK = o.boosting ? Math.min(1, cam.boostK + h / CHASE.boostIn) : Math.max(0, cam.boostK - h / CHASE.boostOut);
  const aim = settled(car, boostK);
  const yaw = angleDiff(cam.yaw + angleDiff(aim.yaw, cam.yaw) * (1 - Math.exp(-CHASE.yawRate * h)), 0);
  const dist = ease(cam.dist, aim.dist, CHASE.distRate, h);
  const shortfall = Math.max(0, cam.dist - cam.boom) * Math.exp(-CHASE.boomOutRate * h);
  return {
    yaw,
    dist,
    height: ease(cam.height, aim.height, CHASE.heightRate, h),
    fov: ease(cam.fov, aim.fov, CHASE.fovRate, h),
    boostK,
    shake: cam.shake * Math.exp(-CHASE.shakeDecay * h),
    // Snaps in to what the tall things allow; eases back out.
    boom: Math.min(boomLength(car, yaw, dist, o.tall), dist - shortfall),
  };
}

/** How far along the unit ray from o it enters the collider: 0 when o is already inside, Infinity when it misses. */
function rayEntry(o: XZ, d: XZ, c: Collider): number {
  if (distToCollider(o, c) <= 0) return 0;
  if (c.kind === 'circle') {
    // |o + d·t − c|² = r² with |d| = 1, o outside: the nearer root, when the circle lies ahead.
    const ox = o.x - c.x;
    const oz = o.z - c.z;
    const b = ox * d.x + oz * d.z;
    const disc = b * b - (ox * ox + oz * oz - c.r * c.r);
    return b < 0 && disc >= 0 ? -b - Math.sqrt(disc) : Infinity;
  }
  let near = 0;
  let far = Infinity;
  for (const [p, dp, lo, hi] of [
    [o.x, d.x, c.minX, c.maxX],
    [o.z, d.z, c.minZ, c.maxZ],
  ]) {
    if (dp === 0) {
      if (p < lo || p > hi) return Infinity;
      continue;
    }
    const t1 = (lo - p) / dp;
    const t2 = (hi - p) / dp;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  return near <= far ? near : Infinity;
}

/** The boom behind `car` along −forward(yaw): `dist`, or boomMargin short of the first tall collider on it, never under boomMin. */
export function boomLength(car: XZ, yaw: number, dist: number, tall: readonly Collider[]): number {
  const f = forward(yaw);
  const back = { x: -f.x, z: -f.z };
  let firstHit = Infinity;
  for (const c of tall) firstHit = Math.min(firstHit, rayEntry(car, back, c));
  return Math.min(dist, Math.max(CHASE.boomMin, firstHit - CHASE.boomMargin));
}

/** The vertical FOV (degrees) for a screen of this aspect: widened so the horizontal view keeps hfovMin, capped at fovCap. */
export function fovForAspect(vfov: number, aspect: number): number {
  const keep = (2 * Math.atan(Math.tan((CHASE.hfovMin / 2) * DEG) / aspect)) / DEG;
  return Math.min(CHASE.fovCap, Math.max(vfov, keep));
}

/** (x, y, z), raised if need be to clear the ground under it by groundClear. */
function lifted(x: number, y: number, z: number, ground: Ground): Vec3 {
  return { x, y: Math.max(y, ground(x, z) + CHASE.groundClear), z };
}

/**
 * Deterministic shake noise: each axis is the mean of two sines (rad/s and phase) times a weight. The weights' squares
 * sum to 0.97, so the offset is never longer than amp.
 */
function shakeAt(t: number, amp: number): Vec3 {
  if (!(amp > 0) || !Number.isFinite(t)) return { x: 0, y: 0, z: 0 };
  const wave = (a: number, b: number, phase: number) => (Math.sin(a * t + phase) + Math.sin(b * t + 2 * phase)) / 2;
  return { x: amp * 0.6 * wave(43, 71, 0.3), y: amp * 0.5 * wave(53, 37, 1.7), z: amp * 0.6 * wave(47, 67, 2.9) };
}

/**
 * The chase view: the camera `boom` m behind along −forward(yaw) at `height` over the chariot's ground, looking ahead
 * along the direction of travel. The shake (driven by `t`, in seconds) moves pos and look together, and the ground lift
 * comes after it, so even a shaking camera clears the ground by groundClear.
 */
export function chaseView(cam: ChaseCam, car: ChariotState, o: ChaseOpts, t = 0): { pose: Pose; fov: number } {
  const f = forward(cam.yaw);
  const ahead = travel(car);
  const reach = Math.min(CHASE.lookAheadMax, CHASE.lookAhead + CHASE.lookAheadPerMs * speed(car));
  const base = o.ground(car.x, car.z);
  const n = shakeAt(t, cam.shake);
  return {
    pose: {
      pos: lifted(car.x - f.x * cam.boom + n.x, base + cam.height + n.y, car.z - f.z * cam.boom + n.z, o.ground),
      look: { x: car.x + ahead.x * reach + n.x, y: base + CHASE.lookHeight + n.y, z: car.z + ahead.z * reach + n.z },
    },
    fov: fovForAspect(Math.min(CHASE.fovMax, cam.fov + CHASE.fovBoost * cam.boostK), o.aspect),
  };
}

/** A contact harder than shakeMinImpact (m/s) shakes the camera. The engine calls it for non-figure contacts only. */
export function bump(cam: ChaseCam, impact: number): ChaseCam {
  return impact > CHASE.shakeMinImpact ? { ...cam, shake: CHASE.shakeBump } : cam;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

/**
 * Where p lands for a camera at `pose` with up +y (as three.js's lookAt) and vertical FOV fovDeg: x and y in NDC, −1
 * to 1 across the view (x to the right, y up), and z the depth in metres along the view axis (negative behind). The
 * pose must not look straight up or down.
 */
export function projectNdc(pose: Pose, fovDeg: number, aspect: number, p: Vec3): { x: number; y: number; z: number } {
  const f = unit(sub(pose.look, pose.pos));
  const right = unit({ x: -f.z, y: 0, z: f.x }); // f × up
  const up = cross(right, f);
  const d = sub(p, pose.pos);
  const depth = dot(d, f);
  const tan = Math.tan((fovDeg / 2) * DEG);
  return { x: dot(d, right) / (depth * tan * aspect), y: dot(d, up) / (depth * tan), z: depth };
}

/**
 * Degrees by which the ground `ahead` m in front of the chariot shows above the highest point of CHARIOT_SILHOUETTE,
 * each taken as an elevation in the camera's vertical plane. Level ground at height 0, as the occlusion tests use.
 */
export function silhouetteGap(pose: Pose, car: ChariotState, ahead: number): number {
  const f = forward(car.yaw);
  const hx = pose.look.x - pose.pos.x;
  const hz = pose.look.z - pose.pos.z;
  const hl = Math.hypot(hx, hz);
  /** The elevation of the point `along` m in front of the chariot and `y` m up, in degrees. */
  const elevation = (along: number, y: number) => {
    const dx = car.x + f.x * along - pose.pos.x;
    const dz = car.z + f.z * along - pose.pos.z;
    return Math.atan2(y - pose.pos.y, (dx * hx + dz * hz) / hl) / DEG;
  };
  return elevation(ahead, 0) - Math.max(...CHARIOT_SILHOUETTE.map((p) => elevation(p.x, p.y)));
}

/** The unit direction from a toward b, or `fallback` where they (nearly) meet. */
function toward(a: XZ, b: XZ, fallback: XZ): XZ {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  return l > 1e-6 ? { x: dx / l, z: dz / l } : fallback;
}

/** The point at (x, z), `up` m over the ground there. */
const over = (x: number, z: number, up: number, ground: Ground): Vec3 => ({ x, y: ground(x, z) + up, z });

/**
 * The highest ground on the straight line from a to b, sampled at least every metre. The field's ground climbs at most
 * about 0.9 m per metre (the mound's flank), so between samples it rises less than half a metre above this.
 */
function highestGround(a: XZ, b: XZ, ground: Ground): number {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
  let top = -Infinity;
  for (let k = 0; k <= n; k++) top = Math.max(top, ground(lerp(a.x, b.x, k / n), lerp(a.z, b.z, k / n)));
  return top;
}

/** `length` m from `at` along −forward(yaw), `up` m over the ground at `at`, lifted to clear the ground under it. */
function behind(at: XZ, yaw: number, length: number, up: number, ground: Ground): Vec3 {
  const f = forward(yaw);
  return lifted(at.x - f.x * length, ground(at.x, at.z) + up, at.z - f.z * length, ground);
}

/** The lakon's opening, 3.5 s: high and wide over the area, low past the first record, then down into the chase view. */
export function introShots(area: XZ, first: XZ, car: ChariotState, o: ChaseOpts): Shot[] {
  const { wide, dolly, descend } = SHOTS;
  const cam = initChase(car, o);
  const chase = chaseView(cam, car, o);
  const fov = fovForAspect(CHASE.fov, o.aspect);
  const f = forward(cam.yaw);
  const back = { x: -f.x, z: -f.z };

  // Over the area from the chariot's side, pushing in.
  const w = toward(area, car, back);
  const wideAt = (r: number): Pose => ({
    pos: over(area.x + w.x * r, area.z + w.z * r, wide.up, o.ground),
    look: over(area.x, area.z, 0, o.ground),
  });

  // Low, swinging past the first record while closing from 14 m to 8 m, facing it. It flies level, 2.5 m over the
  // highest ground on its line, so it never cuts into a rise such as the pavilion's mound.
  const d = toward(first, car, back);
  const dollyXZ = (r: number, turn: number): XZ => {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    return { x: first.x + (d.x * c - d.z * s) * r, z: first.z + (d.x * s + d.z * c) * r };
  };
  const dollyFrom = dollyXZ(dolly.from, -dolly.swing);
  const dollyTo = dollyXZ(dolly.to, dolly.swing);
  const dollyY = highestGround(dollyFrom, dollyTo, o.ground) + dolly.up;
  const dollyAt = (p: XZ): Pose => ({ pos: { x: p.x, y: dollyY, z: p.z }, look: over(first.x, first.z, SHOTS.look, o.ground) });

  // From 20 m behind (shortened by tall things, as the boom is) and 8 m up, down the boom into the chase view.
  const reach = boomLength(car, cam.yaw, descend.back, o.tall);
  return [
    { from: wideAt(wide.from), to: wideAt(wide.to), seconds: wide.seconds, fovFrom: fov, fovTo: fov },
    { from: dollyAt(dollyFrom), to: dollyAt(dollyTo), seconds: dolly.seconds, fovFrom: fov, fovTo: fov },
    {
      from: { pos: behind(car, cam.yaw, reach, descend.up, o.ground), look: { ...chase.pose.look } },
      to: chase.pose,
      seconds: descend.seconds,
      fovFrom: chase.fov,
      fovTo: chase.fov,
    },
  ];
}

/** The lakon's close, 2.5 s: held from the chariot's side, 7 m out and 2 m up, on the side clearer of tall things (right on a tie). */
export function outroShot(car: ChariotState, o: ChaseOpts): Shot {
  const { seconds, out, up } = SHOTS.outro;
  // A boom yawed a quarter turn left of the heading reaches out of the chariot's right side.
  const right = boomLength(car, car.yaw + Math.PI / 2, out, o.tall);
  const left = boomLength(car, car.yaw - Math.PI / 2, out, o.tall);
  const side = right >= left ? car.yaw + Math.PI / 2 : car.yaw - Math.PI / 2;
  const fov = fovForAspect(CHASE.fov, o.aspect);
  const held = (): Pose => ({
    pos: behind(car, side, Math.max(right, left), up, o.ground),
    look: over(car.x, car.z, SHOTS.look, o.ground),
  });
  return { from: held(), to: held(), seconds, fovFrom: fov, fovTo: fov };
}

/** A failed lakon, 1.2 s: from the settled chase view, rising to 12 m up and 6 m behind, looking down on the chariot. */
export function failShot(car: ChariotState, o: ChaseOpts): Shot {
  const { seconds, back, up } = SHOTS.fail;
  const cam = initChase(car, o);
  const chase = chaseView(cam, car, o);
  return {
    from: chase.pose,
    to: {
      pos: behind(car, cam.yaw, boomLength(car, cam.yaw, back, o.tall), up, o.ground),
      look: over(car.x, car.z, SHOTS.look, o.ground),
    },
    seconds,
    fovFrom: chase.fov,
    fovTo: chase.fov,
  };
}

/** The shot's pose and FOV a share k of the way through it. */
function within(shot: Shot, k: number): { pose: Pose; fov: number } {
  return {
    pose: { pos: lerpVec(shot.from.pos, shot.to.pos, k), look: lerpVec(shot.from.look, shot.to.look, k) },
    fov: lerp(shot.fovFrom, shot.fovTo, k),
  };
}

/** The view t s into a run of shots (at least one): smoothstep-eased within each, cut between them, done after the last. */
export function shotAt(shots: readonly Shot[], t: number): { pose: Pose; fov: number; done: boolean } {
  let start = 0;
  for (const shot of shots) {
    const end = start + shot.seconds;
    if (t < end) return { ...within(shot, smoothstep(start, end, t)), done: false };
    start = end;
  }
  return { ...within(shots[shots.length - 1], 1), done: true };
}

/** The finale's slow orbit round `at`: 14 m out, 6 m over the ground there, turning at 0.08 rad/s, looking at it. */
export function orbitView(at: XZ, t: number, ground: Ground): { pose: Pose; fov: number } {
  const { radius, up, rate, look } = SHOTS.orbit;
  return { pose: { pos: behind(at, rate * t, radius, up, ground), look: over(at.x, at.z, look, ground) }, fov: CHASE.fov };
}
