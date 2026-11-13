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
  /**
   * The look's yaw, eased toward lookDir's direction at CHASE.lookRate: a contact that knocks the velocity aside for a
   * few frames (a scrape along a tent or a tree) does not swing the view with it.
   */
  look: number;
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

/** Above this forward speed (m/s) the camera's yaw turns halfway into a slide, and its look starts toward the velocity. */
const SLIP_FROM = 2;
/** The look has turned fully to the velocity's direction at this forward speed (m/s). */
const LOOK_FULL = 4;
/** The speed blend runs from 0 at 8 m/s to 1 at 17 m/s (top speed). */
const BLEND_FROM = 8;
const BLEND_SPAN = 9;
const DEG = Math.PI / 180;

/** The lakon shots and the orbits: seconds, metres, radians and rad/s. */
const SHOTS = {
  wide: { seconds: 1.2, up: 40, from: 30, to: 24 },
  /** Swings from `swing` rad one side of the line to the chariot to `swing` rad the other side while closing in. */
  dolly: { seconds: 1.2, up: 2.5, from: 14, to: 8, swing: 0.35 },
  descend: { seconds: 1.1, back: 20, up: 8 },
  outro: { seconds: 2.5, out: 7, up: 2 },
  fail: { seconds: 1.2, back: 6, up: 12 },
  /**
   * Looks at the centre `look` m up, so the ring of lamps round the tower and the tower above it share the frame. Round
   * the chariot the radius eases in over `ease` rad of turn before a tall thing and back out after it, reading the sight
   * lines at fixed angles every `grid` rad (see orbitRadius).
   */
  orbit: { radius: 14, up: 6, rate: 0.08, look: 3, ease: Math.PI / 3, grid: Math.PI / 360 },
  /** The shots look at a record or the chariot this high over its ground. */
  look: 1,
} as const;

/** |v|, the speed over the ground; drive's speedOf is the signed speed along the heading. */
const groundSpeed = (car: ChariotState) => Math.hypot(car.vx, car.vz);

/**
 * Where the camera looks ahead: the heading turned toward the direction of travel by w = smoothstep(2, 4, vF), so the
 * look never snaps as vF passes 2 m/s with the chariot sliding sideways (as when the guard holds it at the ranks).
 * w = 0, the heading, at 2 m/s or less and in reverse; w = 1, the velocity's direction, from 4 m/s.
 */
function lookDir(car: ChariotState): XZ {
  const h = forward(car.yaw);
  const w = smoothstep(SLIP_FROM, LOOK_FULL, speedOf(car));
  if (w === 0) return h;
  const v = groundSpeed(car);
  const x = (1 - w) * h.x + (w * car.vx) / v;
  const z = (1 - w) * h.z + (w * car.vz) / v;
  const l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
}

/** The yaw, boom length, height and FOV the camera settles to behind this chariot with this much Laju. */
function settled(car: ChariotState, boostK: number): Pick<ChaseCam, 'yaw' | 'dist' | 'height' | 'fov'> {
  const s = clamp((groundSpeed(car) - BLEND_FROM) / BLEND_SPAN, 0, 1);
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
  return { ...aim, boostK, shake: 0, boom: boomLength(car, aim.yaw, aim.dist, o.tall), look: yawOf(lookDir(car)) };
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
    look: angleDiff(cam.look + angleDiff(yawOf(lookDir(car)), cam.look) * (1 - Math.exp(-CHASE.lookRate * h)), 0),
  };
}

/** A stretch of the line o + d·t, from t = enter to t = leave. */
type Span = readonly [enter: number, leave: number];

/**
 * The stretch the span helpers below found last. They write it here rather than return a pair, so that the orbit, which
 * reads hundreds of sight lines when it starts on a new centre and a few every frame, allocates nothing for them.
 */
const span = { enter: 0, leave: 0 };

/** Whether the line (ox, oz) + (dx, dz)·t (|d| = 1) runs inside the circle; if so, where is left in `span`. */
function discSpan(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): boolean {
  const px = ox - cx;
  const pz = oz - cz;
  const b = px * dx + pz * dz;
  const disc = b * b - (px * px + pz * pz - r * r);
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  span.enter = -b - s;
  span.leave = -b + s;
  return true;
}

/** Whether the line runs inside the box [x0, x1] × [z0, z1] (a slab test); if so, where is left in `span`. */
function slabSpan(ox: number, oz: number, dx: number, dz: number, x0: number, x1: number, z0: number, z1: number): boolean {
  let enter = -Infinity;
  let leave = Infinity;
  if (dx === 0) {
    if (ox < x0 || ox > x1) return false;
  } else {
    const t1 = (x0 - ox) / dx;
    const t2 = (x1 - ox) / dx;
    enter = Math.max(enter, Math.min(t1, t2));
    leave = Math.min(leave, Math.max(t1, t2));
  }
  if (dz === 0) {
    if (oz < z0 || oz > z1) return false;
  } else {
    const t1 = (z0 - oz) / dz;
    const t2 = (z1 - oz) / dz;
    enter = Math.max(enter, Math.min(t1, t2));
    leave = Math.min(leave, Math.max(t1, t2));
  }
  if (!(enter <= leave)) return false;
  span.enter = enter;
  span.leave = leave;
  return true;
}

/**
 * Whether the line (ox, oz) + (dx, dz)·t (|d| = 1) passes within m of the collider, that is where distToCollider < m
 * (with m = 0, where it runs inside it); if so, where is left in `span`. A box grown by m has rounded corners but stays
 * convex, so its stretch runs from the first entry to the last exit over two grown slabs and four corner discs.
 */
function nearInto(ox: number, oz: number, dx: number, dz: number, c: Collider, m: number): boolean {
  if (c.kind === 'circle') return discSpan(ox, oz, dx, dz, c.x, c.z, c.r + m);
  let enter = Infinity;
  let leave = -Infinity;
  // Parts 0 and 1 are the slabs grown along x and along z; 2 to 5 the corner discs, with no margin none.
  for (let k = 0; k < (m > 0 ? 6 : 2); k++) {
    const hit =
      k === 0
        ? slabSpan(ox, oz, dx, dz, c.minX - m, c.maxX + m, c.minZ, c.maxZ)
        : k === 1
          ? slabSpan(ox, oz, dx, dz, c.minX, c.maxX, c.minZ - m, c.maxZ + m)
          : discSpan(ox, oz, dx, dz, k < 4 ? c.minX : c.maxX, k % 2 === 0 ? c.minZ : c.maxZ, m);
    if (hit) {
      enter = Math.min(enter, span.enter);
      leave = Math.max(leave, span.leave);
    }
  }
  if (!(enter <= leave)) return false;
  span.enter = enter;
  span.leave = leave;
  return true;
}

/** nearInto's stretch as a pair, or null: for the boom, which keeps one per collider while it steps in. */
function nearSpan(o: XZ, d: XZ, c: Collider, m: number): Span | null {
  return nearInto(o.x, o.z, d.x, d.z, c, m) ? [span.enter, span.leave] : null;
}

/**
 * The boom behind `car` along −forward(yaw): `dist`, or boomMargin short of the first tall collider on it; then
 * stepped in until the camera is boomMargin clear of every tall collider, as when the boom grazes one or runs along a
 * box face. Never under boomMin, which only keeps the camera off the chariot's own origin.
 */
export function boomLength(car: XZ, yaw: number, dist: number, tall: readonly Collider[]): number {
  const f = forward(yaw);
  const back = { x: -f.x, z: -f.z };
  let firstHit = Infinity;
  for (const c of tall) {
    const s = nearSpan(car, back, c, 0);
    if (s && s[1] >= 0) firstHit = Math.min(firstHit, Math.max(0, s[0]));
  }
  // boomMin is applied last: applying it here as well would not change the result.
  let length = Math.min(dist, firstHit - CHASE.boomMargin);
  // The camera moves in to the near end of any span it sits in. It only ever moves in, so each span moves it once.
  const near = tall.map((c) => nearSpan(car, back, c, CHASE.boomMargin));
  for (let moved = true; moved; ) {
    moved = false;
    for (const s of near) {
      if (s && s[0] < length && length < s[1]) {
        length = s[0];
        moved = true;
      }
    }
  }
  return Math.max(CHASE.boomMin, length);
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
 * along cam.look (lookDir eased at CHASE.lookRate). The shake (driven by `t`, in seconds) moves pos and look together,
 * and the ground lift comes after it, so even a shaking camera clears the ground by groundClear.
 */
export function chaseView(cam: ChaseCam, car: ChariotState, o: ChaseOpts, t = 0): { pose: Pose; fov: number } {
  const f = forward(cam.yaw);
  const ahead = forward(cam.look);
  const reach = Math.min(CHASE.lookAheadMax, CHASE.lookAhead + CHASE.lookAheadPerMs * groundSpeed(car));
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

/** No tall colliders: the finale's orbit and orbitView's default, one frozen list so that no frame makes a new one. */
export const NO_TALL: readonly Collider[] = Object.freeze([]);

/**
 * How far from (ax, az) along −forward(yaw), up to `dist`, the line stays boomMargin clear of every tall collider: a
 * camera there has nothing tall between it and that point. 0 when the point itself is that close to one the line runs by.
 */
function clearSight(ax: number, az: number, yaw: number, dist: number, tall: readonly Collider[]): number {
  // −forward(yaw), with forward(yaw) = (cos yaw, −sin yaw).
  const dx = -Math.cos(yaw);
  const dz = Math.sin(yaw);
  let run = dist;
  for (let i = 0; i < tall.length; i++) {
    if (nearInto(ax, az, dx, dz, tall[i], CHASE.boomMargin) && span.leave > 0) run = Math.min(run, Math.max(0, span.enter));
  }
  return run;
}

/**
 * What an orbit round one centre reads from the field, worked out once: the tall colliders within its reach, and how far
 * the sight line at each grid angle k·grid (k from 0 to a full turn) falls short of the full radius.
 */
interface OrbitProfile {
  x: number;
  z: number;
  tall: readonly Collider[];
  near: readonly Collider[];
  shortfall: Float64Array;
}

/** The last centre's profile. An orbit keeps its centre and its tall list for every frame, so all but its first reuse it. */
let lastProfile: OrbitProfile | null = null;

/** The profile for `at` and `tall`: the last one while they stay the same (the same list, not just the same colliders). */
function profileOf(at: XZ, tall: readonly Collider[]): OrbitProfile {
  const p = lastProfile;
  if (p && p.x === at.x && p.z === at.z && p.tall === tall) return p;
  lastProfile = buildProfile(at, tall);
  return lastProfile;
}

/** A new centre's profile: the one place the orbit allocates, once per centre (720 sight lines with something near). */
function buildProfile(at: XZ, tall: readonly Collider[]): OrbitProfile {
  const { radius, grid } = SHOTS.orbit;
  const near = tall.filter((c) => distToCollider(at, c) < radius + CHASE.boomMargin);
  const shortfall = new Float64Array(near.length > 0 ? Math.round((2 * Math.PI) / grid) : 0);
  for (let k = 0; k < shortfall.length; k++) shortfall[k] = radius - clearSight(at.x, at.z, k * grid, radius, near);
  return { x: at.x, z: at.z, tall, near, shortfall };
}

/**
 * The orbit's radius at angle `yaw` round `at`: the full radius less the largest shortfall of clearSight, taken at yaw
 * itself and at the fixed grid angles within `ease` of it, each weighed by 1 − smoothstep(0, ease, the angle between).
 * The term at yaw keeps the camera's sight line to `at` boomMargin clear of everything tall, so it never stands in a tall
 * thing or behind one; the weighed terms bring it in ahead of a tall thing and let it out after, with no snap and no kink
 * (fixed angles, so no term jumps as the orbit turns). The grid's shortfalls come from the centre's profile, so a frame
 * reads one sight line and cached numbers and allocates nothing. With nothing tall within reach it is the full radius.
 */
function orbitRadius(at: XZ, yaw: number, tall: readonly Collider[]): number {
  const { radius, ease, grid } = SHOTS.orbit;
  if (tall.length === 0) return radius;
  const { near, shortfall } = profileOf(at, tall);
  const n = shortfall.length;
  if (n === 0) return radius;
  let most = radius - clearSight(at.x, at.z, yaw, radius, near);
  for (let k = Math.ceil((yaw - ease) / grid); k * grid < yaw + ease; k++) {
    const weight = 1 - smoothstep(0, ease, Math.abs(yaw - k * grid));
    // A shortfall is at most the radius, so a weight that cannot beat the one in hand is skipped.
    if (weight * radius > most) most = Math.max(most, weight * shortfall[((k % n) + n) % n]);
  }
  return Math.max(CHASE.boomMin, radius - most);
}

/**
 * The slow orbit round `at`: 14 m out, 6 m over the ground there, turning at 0.08 rad/s, looking at it. The chapter
 * intro circles the chariot and passes the tall colliders: the radius then comes in, eased, wherever one would stand in
 * or before the camera (orbitRadius), and away from them it is the same orbit. The finale circles the tower itself and
 * passes none.
 */
export function orbitView(
  at: XZ,
  t: number,
  ground: Ground,
  tall: readonly Collider[] = NO_TALL,
): { pose: Pose; fov: number } {
  const { up, rate, look } = SHOTS.orbit;
  const yaw = rate * t;
  const pos = behind(at, yaw, orbitRadius(at, yaw, tall), up, ground);
  return { pose: { pos, look: over(at.x, at.z, look, ground) }, fov: CHASE.fov };
}
