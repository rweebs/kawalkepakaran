import { describe, expect, it } from 'vitest';
import { groundHeight, PAVILION, type Pose } from '../src/lib/bowobharata/stage-math';
import { mulberry32 } from '../src/lib/sky/rng';
import type { Vec3 } from '../src/lib/sky/states';
import { angleDiff, dist, forward, rightOf, segPointDist, type XZ } from '../src/lib/bowobharata-game/geom';
import {
  NO_INPUT,
  initChariot,
  lateralOf,
  speedOf,
  stepChariot,
  type ChariotState,
  type DriveEnv,
} from '../src/lib/bowobharata-game/drive';
import { ANCHORS, PLAY, SPAWN, TOWER_EXIT, TREES, distToCollider, staticColliders, type Collider } from '../src/lib/bowobharata-game/world';
import { figureGuard, hullClearance, resolveContacts } from '../src/lib/bowobharata-game/collide';
import { CHASE } from '../src/lib/bowobharata-game/tuning';
import {
  CHARIOT_SILHOUETTE,
  boomLength,
  bump,
  chaseView,
  failShot,
  fovForAspect,
  initChase,
  introShots,
  orbitView,
  outroShot,
  projectNdc,
  shotAt,
  silhouetteGap,
  stepChase,
  type ChaseCam,
  type ChaseOpts,
  type Shot,
} from '../src/lib/bowobharata-game/chase';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const flat = () => 0;
/** Flat ground, a 16:9 screen, no Laju and nothing tall. */
const OPTS: ChaseOpts = { aspect: 16 / 9, boosting: false, ground: flat, tall: [] };
const LAJU: ChaseOpts = { ...OPTS, boosting: true };
const COLS = staticColliders();
const TALL = COLS.filter((c) => c.tall);
function byId(id: string): Collider {
  const c = COLS.find((col) => col.id === id);
  if (!c) throw new Error(`no collider ${id}`);
  return c;
}
const TOWER = byId('tower');
const CAM_KEYS = ['yaw', 'dist', 'height', 'fov', 'boostK', 'shake', 'boom'] as const;

/** At (x, z) facing `yaw`, rolling along the heading at v m/s (backward when v < 0). */
function chariot(v: number, yaw = 0, x = 0, z = 0): ChariotState {
  const f = forward(yaw);
  return { ...initChariot(x, z, yaw), vx: v * f.x, vz: v * f.z };
}

/** Steps the camera `frames` frames of 1/60 s behind a chariot held where it is. */
function follow(cam: ChaseCam, car: ChariotState, frames: number, o: ChaseOpts = OPTS): ChaseCam {
  for (let f = 0; f < frames; f++) cam = stepChase(cam, car, DT, o);
  return cam;
}

/** The camera after 180 frames behind a chariot at v m/s, starting from the settled view at rest. */
const steady = (v: number) => follow(initChase(chariot(0), OPTS), chariot(v), 180);
const groundSpeed = (car: ChariotState) => Math.hypot(car.vx, car.vz);
/** The brief's occlusion check: the road 15 m ahead, or 1.2 s of travel ahead when that is further. */
const gap = (cam: ChaseCam, car: ChariotState, o: ChaseOpts = OPTS) =>
  silhouetteGap(chaseView(cam, car, o).pose, car, Math.max(15, 1.2 * groundSpeed(car)));

/** The camera's view direction, look − pos, as a unit vector. */
function viewDir(cam: ChaseCam, car: ChariotState, o: ChaseOpts = OPTS): Vec3 {
  const { pos, look } = chaseView(cam, car, o).pose;
  const d = { x: look.x - pos.x, y: look.y - pos.y, z: look.z - pos.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return { x: d.x / l, y: d.y / l, z: d.z / l };
}
const degreesBetween = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)) / DEG;

/** The least distance from p to any of the colliders' edges (negative inside one). */
const clearanceOf = (p: XZ, cols: readonly Collider[]) => Math.min(...cols.map((c) => distToCollider(p, c)));

/**
 * The chariot at rest heading `yaw`, reversed from `start` until its hull meets a collider: the last pose with
 * hullClearance ≥ 0 against every collider on the field, or null when the start is blocked or nothing is met in 20 m.
 */
function reversedUpTo(start: XZ, yaw: number): ChariotState | null {
  const f = forward(yaw);
  const clear = (s: number) => hullClearance(start.x - f.x * s, start.z - f.z * s, yaw, COLS);
  if (clear(0) < 0) return null;
  let lo = 0;
  let hi = NaN;
  for (let s = 0.25; s <= 20; s += 0.25) {
    if (clear(s) < 0) {
      hi = s;
      break;
    }
    lo = s;
  }
  if (Number.isNaN(hi)) return null;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (clear(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return chariot(0, yaw, start.x - f.x * lo, start.z - f.z * lo);
}

/** Height in pixels, on an 800 px tall viewport, of a 6 m column standing 30 m ahead of a chariot at the origin. */
function columnPx(cam: ChaseCam, car: ChariotState, o: ChaseOpts = OPTS): number {
  const { pose, fov } = chaseView(cam, car, o);
  const foot = projectNdc(pose, fov, o.aspect, { x: 30, y: 0, z: 0 });
  const top = projectNdc(pose, fov, o.aspect, { x: 30, y: 6, z: 0 });
  return ((top.y - foot.y) / 2) * 800;
}

function expectNear(actual: number, expected: number, tol: number): void {
  expect(actual).toBeGreaterThanOrEqual(expected - tol);
  expect(actual).toBeLessThanOrEqual(expected + tol);
}

function expectVec(actual: Vec3, expected: Vec3, digits: number): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function expectCam(actual: ChaseCam, expected: ChaseCam): void {
  for (const k of CAM_KEYS) expect(actual[k], k).toBeCloseTo(expected[k], 12);
}

/** A point at a uniformly random place inside the play disc, `margin` m in from its edge. */
function inPlay(rnd: () => number, margin = 1): XZ {
  const r = (PLAY.r - margin) * Math.sqrt(rnd());
  const a = 2 * Math.PI * rnd();
  return { x: PLAY.cx + r * Math.cos(a), z: PLAY.cz + r * Math.sin(a) };
}

describe('a contact does not swing the view', () => {
  it('scraping a camp tent at 8 m/s turns the view under 5° a frame (3.8°; 17.2° with an instant look), while the velocity itself flicks over 10°', () => {
    // The slice check's scrape: due west at 8 m/s, the hull overlapping the tent at 60° (−94, 0.39), r 2.2, by 0.6 m.
    let car: ChariotState = { ...initChariot(-80, 3.44, Math.PI), vx: -8, vz: 0 };
    let cam = initChase(car, OPTS);
    let prev = viewDir(cam, car);
    let worst = 0;
    let flick = 0;
    let hit = false;
    for (let k = 0; k < 150; k++) {
      const throttle = Math.min(1, Math.max(0, (8 - speedOf(car)) * 2));
      const out = resolveContacts(stepChariot(car, { ...NO_INPUT, throttle }, DT), COLS);
      if (out.contact) hit = true;
      if (Math.hypot(car.vx, car.vz) > 1 && Math.hypot(out.car.vx, out.car.vz) > 1) {
        flick = Math.max(flick, Math.abs(angleDiff(Math.atan2(-out.car.vz, out.car.vx), Math.atan2(-car.vz, car.vx))) / DEG);
      }
      car = out.car;
      cam = stepChase(cam, car, DT, OPTS);
      const dir = viewDir(cam, car);
      worst = Math.max(worst, degreesBetween(prev, dir));
      prev = dir;
    }
    expect(hit).toBe(true);
    expect(flick).toBeGreaterThan(10);
    expect(worst).toBeLessThan(5);
  });
});

describe('chase tuning', () => {
  it('holds the CHASE values', () => {
    expect(CHASE).toEqual({
      distance: 9.5, distanceAtTop: 11, boostExtra: 1.5,
      height: 7, heightAtTop: 6.8, boostLift: 0.6,
      lookAhead: 8, lookAheadPerMs: 0.2, lookAheadMax: 12, lookHeight: 0.8, slipFollow: 0.5,
      yawRate: 4.5, lookRate: 12, distRate: 3, heightRate: 8, fovRate: 6, boomOutRate: 3,
      fov: 55, fovAtTop: 61, fovBoost: 8, fovMax: 72, hfovMin: 45, fovCap: 90,
      boostIn: 0.15, boostOut: 0.5, groundClear: 1.4, boomMin: 0.5, boomMargin: 0.5,
      shakeBump: 0.18, shakeDecay: 6, shakeMinImpact: 6,
    });
  });

  it('marks the highest points of the riders, the banner and the horses, frozen', () => {
    expect(CHARIOT_SILHOUETTE).toEqual([
      { name: 'prabha', x: 0.45, y: 3.55 },
      { name: 'krishna-feather', x: 0.49, y: 3.68 },
      { name: 'arjuna-crown', x: -0.55, y: 3.52 },
      { name: 'banner', x: -1.05, y: 3.3 },
      { name: 'horse-heads', x: 4.5, y: 2.1 },
    ]);
    expect(Object.isFrozen(CHARIOT_SILHOUETTE)).toBe(true);
    expect(CHARIOT_SILHOUETTE.every((p) => Object.isFrozen(p))).toBe(true);
  });
});

describe('the chase view', () => {
  it('at rest: 9.5 m behind and 7 m up, looking 8 m ahead at 0.8 m, FOV 55', () => {
    const car = chariot(0);
    const { pose, fov } = chaseView(initChase(car, OPTS), car, OPTS);
    expectVec(pose.pos, { x: -9.5, y: 7, z: 0 }, 3);
    expectVec(pose.look, { x: 8, y: 0.8, z: 0 }, 3);
    expect(fov).toBeCloseTo(55, 3);
  });

  it.each([
    { v: 9, pos: { x: -9.667, y: 6.978, z: 0 }, lookX: 9.8, fov: 55.667 },
    { v: 17, pos: { x: -11, y: 6.8, z: 0 }, lookX: 11.4, fov: 61 },
  ])('settles after 180 frames at $v m/s', ({ v, pos, lookX, fov }) => {
    const view = chaseView(steady(v), chariot(v), OPTS);
    expectVec(view.pose.pos, pos, 3);
    expectVec(view.pose.look, { x: lookX, y: 0.8, z: 0 }, 3);
    expect(view.fov).toBeCloseTo(fov, 3);
  });

  it('initChase is already settled: a step leaves it where it is', () => {
    for (const [v, o] of [
      [0, OPTS],
      [9, OPTS],
      [17, LAJU],
      [-3, OPTS],
    ] as const) {
      const car = chariot(v, 0.7, 5, -3);
      const cam = initChase(car, o);
      expectCam(stepChase(cam, car, DT, o), cam);
    }
  });

  it('rides at its height over the ground under the chariot and looks 0.8 m over it', () => {
    const o: ChaseOpts = { ...OPTS, ground: () => 2.5 };
    const car = chariot(0);
    const { pos, look } = chaseView(initChase(car, o), car, o).pose;
    expect(pos.y).toBeCloseTo(9.5, 12);
    expect(look.y).toBeCloseTo(3.3, 12);
  });

  it('turns halfway into a slide and looks along the travel', () => {
    const slip = -20 * DEG;
    const car: ChariotState = { ...initChariot(0, 0, 0), vx: 12 * Math.cos(slip), vz: -12 * Math.sin(slip) };
    const cam = initChase(car, OPTS);
    expect(cam.yaw).toBeCloseTo(slip / 2, 12);
    const { look } = chaseView(cam, car, OPTS).pose;
    const reach = 8 + 0.2 * 12;
    expect(look.x).toBeCloseTo(reach * Math.cos(slip), 9);
    expect(look.z).toBeCloseTo(-reach * Math.sin(slip), 9);
  });

  it('keeps the heading, and looks along it, at a forward speed of 2 m/s or less', () => {
    // 2 m/s forward while slipping 1 m/s to the right (+z for yaw 0).
    const car: ChariotState = { ...initChariot(0, 0, 0), vx: 2, vz: 1 };
    const cam = initChase(car, OPTS);
    expect(cam.yaw).toBe(0);
    const { look } = chaseView(cam, car, OPTS).pose;
    expect(look.x).toBeCloseTo(8 + 0.2 * Math.hypot(2, 1), 12);
    expect(look.z).toBeCloseTo(0, 12);
  });

  it('looks at most 12 m ahead', () => {
    const car = chariot(25);
    expect(chaseView(initChase(car, OPTS), car, OPTS).pose.look.x).toBeCloseTo(12, 12);
  });
});

describe('the look through 2 m/s', () => {
  it('turns under 2° a frame as vF passes 2 m/s with the chariot sliding 1 m/s sideways', () => {
    const yaw = 0.6;
    const f = forward(yaw);
    const r = rightOf(yaw);
    const sliding = (vF: number): ChariotState => ({ ...initChariot(0, 0, yaw), vx: vF * f.x + r.x, vz: vF * f.z + r.z });
    // Down at the brake's 15 m/s², then up at Laju's 17 m/s²: the hardest the drive pulls either way.
    const speeds: number[] = [];
    for (let k = 0; k <= 16; k++) speeds.push(4.5 - k * (15 / 60));
    for (let k = 0; k <= 14; k++) speeds.push(0.5 + k * (17 / 60));
    let cam = initChase(sliding(speeds[0]), OPTS);
    let prev = viewDir(cam, sliding(speeds[0]));
    let worst = 0;
    for (const vF of speeds) {
      const car = sliding(vF);
      cam = stepChase(cam, car, DT, OPTS);
      const dir = viewDir(cam, car);
      worst = Math.max(worst, degreesBetween(prev, dir));
      prev = dir;
    }
    expect(worst).toBeLessThan(2);
  });

  it('blends the heading toward the velocity by smoothstep(2, 4, vF)', () => {
    // 2.5 m/s forward, sliding 1 m/s to the right: w = smoothstep(2, 4, 2.5) = 0.15625.
    const car: ChariotState = { ...initChariot(0, 0, 0), vx: 2.5, vz: 1 };
    const v = Math.hypot(2.5, 1);
    const w = 0.15625;
    const x = 1 - w + (w * 2.5) / v;
    const z = (w * 1) / v;
    const l = Math.hypot(x, z);
    const reach = 8 + 0.2 * v;
    const { look } = chaseView(initChase(car, OPTS), car, OPTS).pose;
    expect(look.x).toBeCloseTo((reach * x) / l, 12);
    expect(look.z).toBeCloseTo((reach * z) / l, 12);
  });

  it('and while the guard holds the chariot sliding along the ranks', () => {
    const env: DriveEnv = { cloud: false, guard: figureGuard(COLS.filter((c) => c.figure)) };
    let worst = 0;
    for (const deg of [-65, -50, -35, 35, 50, 65]) {
      // Throttle held into the Pandawa ranks' west face at an angle, from 5.7 m out.
      let car = initChariot(-25, 0, deg * DEG);
      let cam = initChase(car, OPTS);
      let prev = viewDir(cam, car);
      let slidThrough = false;
      for (let k = 0; k < 600; k++) {
        const before = speedOf(car);
        car = resolveContacts(stepChariot(car, { ...NO_INPUT, throttle: 1 }, DT, env), COLS).car;
        if ((before - 2) * (speedOf(car) - 2) <= 0 && Math.abs(lateralOf(car)) >= 0.5) slidThrough = true;
        cam = stepChase(cam, car, DT, OPTS);
        const dir = viewDir(cam, car);
        worst = Math.max(worst, degreesBetween(prev, dir));
        prev = dir;
      }
      expect(slidThrough, `${deg}°`).toBe(true);
    }
    expect(worst).toBeLessThan(2);
  });
});

describe('Laju', () => {
  it('1 s at 17 m/s: FOV 69, dist 12.408, height 7.40; 1 s after it ends: FOV 61, dist 11.16', () => {
    const car = chariot(17);
    const surging = follow(initChase(car, OPTS), car, 60, LAJU);
    expectNear(chaseView(surging, car, LAJU).fov, 69, 0.01);
    expectNear(surging.dist, 12.408, 0.01);
    expectNear(surging.height, 7.4, 0.01);
    const after = follow(surging, car, 60, OPTS);
    expectNear(chaseView(after, car, OPTS).fov, 61, 0.01);
    expectNear(after.dist, 11.16, 0.02);
  });

  it('ramps in over 0.15 s and out over 0.5 s', () => {
    const car = chariot(17);
    let cam = follow(initChase(car, OPTS), car, 3, LAJU);
    expect(cam.boostK).toBeCloseTo(3 / 9, 12);
    cam = follow(cam, car, 6, LAJU);
    expect(cam.boostK).toBeCloseTo(1, 12);
    cam = follow(cam, car, 1, LAJU);
    expect(cam.boostK).toBe(1);
    cam = follow(cam, car, 15, OPTS);
    expect(cam.boostK).toBeCloseTo(0.5, 12);
    cam = follow(cam, car, 16, OPTS);
    expect(cam.boostK).toBe(0);
  });

  it('a frame’s targets already carry that frame’s Laju weight', () => {
    const car = chariot(17);
    const cam = stepChase(initChase(car, OPTS), car, DT, LAJU);
    expect(cam.boostK).toBeCloseTo(DT / 0.15, 12);
    expect(cam.dist).toBeCloseTo(11 + 1.5 * (DT / 0.15) * (1 - Math.exp(-3 * DT)), 12);
  });

  it('settles with Laju held: initChase while boosting has the full weight', () => {
    const car = chariot(17);
    const cam = initChase(car, LAJU);
    expect(cam.boostK).toBe(1);
    expect(cam.dist).toBeCloseTo(12.5, 12);
    expect(cam.height).toBeCloseTo(7.4, 12);
    expect(chaseView(cam, car, LAJU).fov).toBeCloseTo(69, 12);
  });

  it('never widens past 72°', () => {
    const car = chariot(17);
    const cam = { ...initChase(car, LAJU), fov: 66 };
    expect(chaseView(cam, car, LAJU).fov).toBe(72);
  });
});

describe('narrow screens', () => {
  it('fovForAspect keeps the horizontal view at least 45°, up to 90° vertical', () => {
    const phone = 360 / 780;
    const vfov = fovForAspect(55, phone);
    expectNear(vfov, 83.81, 0.01);
    expectNear((2 * Math.atan(Math.tan((vfov / 2) * DEG) * phone)) / DEG, 45, 0.05);
    expect(fovForAspect(55, 16 / 9)).toBe(55);
    expect(fovForAspect(55, 780 / 360)).toBe(55);
    expect(fovForAspect(69, 0.3)).toBe(90);
  });

  it('the chase view widens with it', () => {
    const o: ChaseOpts = { ...OPTS, aspect: 360 / 780 };
    const car = chariot(0);
    expect(chaseView(initChase(car, o), car, o).fov).toBe(fovForAspect(55, 360 / 780));
  });
});

describe('turning', () => {
  it('after a 90° change of heading the yaw error at 0.5 s is 9.49° ± 0.05', () => {
    const after = follow(initChase(chariot(9), OPTS), chariot(9, Math.PI / 2), 30);
    expectNear(Math.abs(angleDiff(Math.PI / 2, after.yaw)) / DEG, 9.49, 0.05);
  });

  it('takes the short way round: from 3.1 toward −3.1, one step lands in (3.1, π]', () => {
    const car = chariot(0, -3.1);
    const yaw = stepChase({ ...initChase(car, OPTS), yaw: 3.1 }, car, DT, OPTS).yaw;
    expect(yaw).toBeGreaterThan(3.1);
    expect(yaw).toBeLessThanOrEqual(Math.PI);
  });

  it('keeps the heading in reverse', () => {
    expect(initChase(chariot(-3), OPTS).yaw).toBe(0);
    const car = chariot(-3, 0.5);
    expect(follow(initChase(car, OPTS), car, 60).yaw).toBeCloseTo(0.5, 12);
  });

  it('keeps its yaw in (−π, π] however far the chariot has turned', () => {
    expect(initChase(chariot(0, 7), OPTS).yaw).toBeCloseTo(7 - 2 * Math.PI, 12);
    // Nearly five turns at 3 rad/s, then 2 s holding the last heading (30 rad) to settle on it.
    let cam = initChase(chariot(0), OPTS);
    for (let f = 1; f <= 720; f++) {
      cam = stepChase(cam, chariot(9, Math.min(f, 600) * 0.05), DT, OPTS);
      expect(cam.yaw).toBeGreaterThan(-Math.PI);
      expect(cam.yaw).toBeLessThanOrEqual(Math.PI);
    }
    expect(Math.abs(angleDiff(30, cam.yaw))).toBeLessThan(1e-3);
  });
});

describe('F2: nothing hides the road', () => {
  it.each([0, 9, 17])('the road shows at least 1° above the riders at a steady %d m/s', (v) => {
    expect(gap(steady(v), chariot(v))).toBeGreaterThanOrEqual(1);
  });

  it.each([17, 25])('and after 2 s of Laju at %d m/s', (v) => {
    const car = chariot(v);
    expect(gap(follow(initChase(car, OPTS), car, 120, LAJU), car, LAJU)).toBeGreaterThanOrEqual(1);
  });

  it('the least over steady speeds 0–17 m/s is ≥ 1.35°: 1.406 at 12.5 m/s, set by the feather', () => {
    let least = Infinity;
    let at = NaN;
    for (let k = 0; k <= 68; k++) {
      const car = chariot(k * 0.25);
      const g = gap(initChase(car, OPTS), car);
      if (g < least) {
        least = g;
        at = k * 0.25;
      }
    }
    expect(least).toBeGreaterThanOrEqual(1.35);
    expect(at).toBe(12.5);
    expectNear(least, 1.406, 0.001);
    // The feather's top corner is the highest point: the gap is the road's elevation less the feather's.
    const car = chariot(12.5);
    const { pos } = chaseView(initChase(car, OPTS), car, OPTS).pose;
    const elevation = (x: number, y: number) => Math.atan2(y - pos.y, x - pos.x) / DEG;
    expect(least).toBeCloseTo(elevation(15, 0) - elevation(0.49, 3.68), 12);
  });

  it('measures elevations in the camera’s vertical plane: sideways offsets do not count', () => {
    // A camera looking due east; the chariot turned 0.3 rad, so its points sit off to the side of that plane.
    const pose: Pose = { pos: { x: -10, y: 7, z: 0 }, look: { x: 8, y: 0.8, z: 0 } };
    const car = chariot(0, 0.3);
    const f = forward(0.3);
    const elevation = (along: number, y: number) => Math.atan2(y - 7, along * f.x + 10) / DEG;
    const highest = Math.max(...CHARIOT_SILHOUETTE.map((p) => elevation(p.x, p.y)));
    expect(silhouetteGap(pose, car, 15)).toBeCloseTo(elevation(15, 0) - highest, 12);
  });

  it('measures the same whatever the heading and place', () => {
    const turned = chariot(12.5, 2.2, -30, 45);
    expect(gap(initChase(turned, OPTS), turned)).toBeCloseTo(gap(initChase(chariot(12.5), OPTS), chariot(12.5)), 9);
  });
});

describe('F2: the road ahead is mid-frame', () => {
  it.each([
    { v: 0, y10: -0.008, y25: 0.271 },
    { v: 9, y10: -0.064, y25: 0.207 },
    { v: 17, y10: -0.087, y25: 0.128 },
  ])('at a steady $v m/s the ground 10 m and 25 m ahead sits mid-frame, the chariot below', ({ v, y10, y25 }) => {
    const { pose, fov } = chaseView(steady(v), chariot(v), OPTS);
    const at = (p: Vec3) => projectNdc(pose, fov, OPTS.aspect, p);
    const ahead = [at({ x: 10, y: 0, z: 0 }), at({ x: 25, y: 0, z: 0 })];
    for (const p of ahead) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.2);
      expect(p.y).toBeLessThanOrEqual(0.3);
    }
    expectNear(ahead[0].y, y10, 0.001);
    expectNear(ahead[1].y, y25, 0.001);
    const deck = at({ x: 0, y: 0.9, z: 0 });
    expect(deck.y).toBeGreaterThanOrEqual(-0.55);
    expect(deck.y).toBeLessThanOrEqual(-0.35);
  });

  it('frames it the same way whatever the heading, with the chariot’s right on the right', () => {
    const yaw = 2.2;
    const car = chariot(9, yaw, -30, 45);
    const { pose, fov } = chaseView(initChase(car, OPTS), car, OPTS);
    const f = forward(yaw);
    const r = rightOf(yaw);
    const ahead = { x: -30 + 25 * f.x, y: 0, z: 45 + 25 * f.z };
    const p = projectNdc(pose, fov, OPTS.aspect, ahead);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(1e-9);
    expectNear(p.y, 0.207, 0.001);
    expect(projectNdc(pose, fov, OPTS.aspect, { x: ahead.x + 3 * r.x, y: 0, z: ahead.z + 3 * r.z }).x).toBeGreaterThan(0.05);
  });

  it('projectNdc maps the view edges to ±1 and gives the depth along the view in metres', () => {
    const pose: Pose = { pos: { x: 0, y: 2, z: 0 }, look: { x: 1, y: 2, z: 0 } };
    const t = Math.tan(30 * DEG);
    const corner = projectNdc(pose, 60, 2, { x: 10, y: 2 + 10 * t, z: 10 * t * 2 });
    expect(corner.x).toBeCloseTo(1, 12);
    expect(corner.y).toBeCloseTo(1, 12);
    expect(corner.z).toBeCloseTo(10, 12);
    expect(projectNdc(pose, 60, 2, { x: -5, y: 2, z: 0 }).z).toBeCloseTo(-5, 12);
  });
});

describe('F2: a light column is readable', () => {
  it.each([
    { v: 0, px: 122.5 },
    { v: 17, px: 101.4 },
  ])('a 6 m column 30 m ahead spans $px px of an 800 px viewport at a steady $v m/s', ({ v, px }) => {
    const h = columnPx(steady(v), chariot(v));
    expect(h).toBeGreaterThanOrEqual(24);
    expectNear(h, px, 0.1);
  });

  it('and at least 24 px at 9 m/s and after 2 s of Laju', () => {
    expect(columnPx(steady(9), chariot(9))).toBeGreaterThanOrEqual(24);
    const car = chariot(17);
    expect(columnPx(follow(initChase(car, OPTS), car, 120, LAJU), car, LAJU)).toBeGreaterThanOrEqual(24);
  });
});

describe('tall things shorten the boom', () => {
  const nearTower: ChaseOpts = { ...OPTS, tall: [TOWER] };
  const byTower = chariot(0, 0, -39, 52);

  it('car at (−39, 52) facing east: boom 4.0, camera at (−43, 52), 3.0 m from the tower centre', () => {
    const cam = initChase(byTower, nearTower);
    expectNear(cam.boom, 4, 0.01);
    const { pos } = chaseView(cam, byTower, nearTower).pose;
    expectNear(pos.x, -43, 0.01);
    expectNear(pos.z, 52, 0.01);
    expect(dist(pos, ANCHORS.tower)).toBeCloseTo(3, 9);
    expect(distToCollider(pos, TOWER)).toBeCloseTo(CHASE.boomMargin, 9);
  });

  it('with nothing tall behind, boom = dist', () => {
    const open = initChase(byTower, OPTS);
    expect(open.boom).toBe(open.dist);
    const towerAhead = initChase(chariot(0, Math.PI, -39, 52), nearTower);
    expect(towerAhead.boom).toBe(towerAhead.dist);
    // The boom follows dist exactly while Laju pulls the camera back: it never lags.
    const car = chariot(17);
    let cam = initChase(car, OPTS);
    for (let f = 0; f < 60; f++) {
      cam = stepChase(cam, car, DT, LAJU);
      expect(cam.boom).toBe(cam.dist);
    }
  });

  it('stops with the camera 0.5 m clear of the gate’s walls, square on and at an angle', () => {
    expect(boomLength({ x: 125, z: 0 }, 0, 9.5, TALL)).toBeCloseTo(8.5, 12);
    // At 45° the along-the-boom margin would leave the camera 0.35 m from the face; it steps in to 0.5 m.
    expect(boomLength({ x: 120, z: 0 }, -Math.PI / 4, 9.5, TALL)).toBeCloseTo(3.5 * Math.SQRT2, 12);
    expect(boomLength({ x: 125, z: 20 }, 0, 9.5, [byId('gate-wall-s')])).toBe(9.5);
  });

  it('never shortens it below 0.5 m, which keeps the camera off the chariot itself, even from inside', () => {
    // Reversed up to the tower (hull 0.05 m clear): its face is 1.9 m behind, so the camera sits 0.5 m clear of it.
    expect(boomLength({ x: -41.6, z: 52 }, 0, 9.5, [TOWER])).toBeCloseTo(1.4, 12);
    expect(boomLength(ANCHORS.tower, 0, 9.5, [TOWER])).toBe(0.5);
  });

  it('steps in until the camera is 0.5 m clear when the boom grazes the tower, even shaking', () => {
    const o: ChaseOpts = { ...OPTS, tall: TALL };
    for (const dz of [2.49, 2.499]) {
      const car = chariot(0, 0, -39, 52 + dz);
      const cam = initChase(car, o);
      // The camera stops where it is 3.0 m from the tower's centre: 0.5 m from its surface.
      expect(cam.boom).toBeCloseTo(7 - Math.sqrt(9 - dz * dz), 9);
      expect(clearanceOf(chaseView(cam, car, o).pose.pos, TALL)).toBeGreaterThanOrEqual(0.5 - 1e-6);
      const shaken = bump(cam, 10);
      for (let k = 0; k < 100; k++) expect(distToCollider(chaseView(shaken, car, o, k * 0.0123).pose.pos, TOWER)).toBeGreaterThan(0.3);
    }
  });

  it('keeps stepping in while each step lands the camera near another tall thing', () => {
    // Two 1 m trunks either side of a 7 m boom, 1.2 m off it: within 0.5 m of b over 5.6–7.4 m, of a over 4.1–5.9 m.
    const trunk = (id: string, x: number, z: number): Collider => ({ kind: 'circle', id, x, z, r: 1, figure: false, tall: true });
    const pair = [trunk('a', -5, 1.2), trunk('b', -6.5, -1.2)];
    const length = boomLength({ x: 0, z: 0 }, 0, 7, pair);
    expect(length).toBeCloseTo(4.1, 12);
    expect(clearanceOf({ x: -length, z: 0 }, pair)).toBeGreaterThanOrEqual(0.5 - 1e-6);
  });

  it('a tall thing the boom only passes near does not pull in a camera that is clear of it', () => {
    // The boom passes 0.3 m from the tower's surface 7 m back; at 9.5 m the camera is 1.25 m clear of it.
    const car = chariot(0, 0, -39, 54.8);
    const cam = initChase(car, { ...OPTS, tall: [TOWER] });
    expect(cam.boom).toBe(9.5);
    expect(distToCollider(chaseView(cam, car, OPTS).pose.pos, TOWER)).toBeCloseTo(Math.hypot(2.5, 2.8) - 2.5, 9);
  });

  it('and when it runs alongside a gate wall’s face', () => {
    // Heading south 6 m past the end of gate-wall-s, 0.05 m east of its face: the full boom would sit 0.05 m from it.
    const o: ChaseOpts = { ...OPTS, tall: TALL };
    const car = chariot(0, -Math.PI / 2, 116.05, 14);
    const cam = initChase(car, o);
    expect(cam.boom).toBeCloseTo(6 - Math.sqrt(0.25 - 0.05 ** 2), 9);
    const { pos } = chaseView(cam, car, o).pose;
    expect(clearanceOf(pos, TALL)).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(dist(pos, { x: 116, z: 8 })).toBeCloseTo(0.5, 9);
  });

  it('reversed up to the tower, any gate part or a grove tree: the camera stays 0.5 m clear and sees the road', () => {
    const o: ChaseOpts = { ...OPTS, tall: TALL };
    const poses: { against: string; car: ChariotState }[] = [];
    const around = (against: string, centre: XZ, out: number, sides: readonly number[]) => {
      for (let k = 0; k < 12; k++) {
        const yaw = (k * Math.PI) / 6;
        const f = forward(yaw);
        const r = rightOf(yaw);
        for (const side of sides) {
          const car = reversedUpTo({ x: centre.x + f.x * out + r.x * side, z: centre.z + f.z * out + r.z * side }, yaw);
          if (car) poses.push({ against, car });
        }
      }
    };
    around('tower', ANCHORS.tower, 12, [-3.5, -2, 0, 2, 3.5]);
    for (const id of ['gate-pylon-n', 'gate-pylon-s', 'gate-wall-n', 'gate-wall-s']) {
      const b = byId(id);
      if (b.kind !== 'box') throw new Error(`${id} is not a box`);
      around(id, { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }, 16, [-3, 0, 3]);
    }
    around('tree-0', TREES[0], 10, [-1.5, 0, 1.5]);
    around('tree-4', TREES[4], 10, [-1.5, 0, 1.5]);
    for (const against of ['tower', 'gate-pylon-n', 'gate-pylon-s', 'gate-wall-n', 'gate-wall-s', 'tree-0', 'tree-4']) {
      expect(poses.filter((p) => p.against === against).length, against).toBeGreaterThanOrEqual(12);
    }
    for (const { against, car } of poses) {
      const where = `${against} (${car.x.toFixed(2)}, ${car.z.toFixed(2)}) yaw ${car.yaw.toFixed(2)}`;
      expect(hullClearance(car.x, car.z, car.yaw, COLS), where).toBeGreaterThanOrEqual(0);
      expect(hullClearance(car.x, car.z, car.yaw, TALL), where).toBeLessThan(0.01);
      const { pose } = chaseView(initChase(car, o), car, o);
      expect(clearanceOf(pose.pos, TALL), where).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(silhouetteGap(pose, car, 15), where).toBeGreaterThanOrEqual(1);
    }
  });

  it('snaps in at once and eases back out at 3/s', () => {
    let cam = initChase(byTower, OPTS);
    expect(cam.boom).toBe(9.5);
    cam = stepChase(cam, byTower, DT, nearTower);
    expect(cam.boom).toBeCloseTo(4, 12);
    cam = stepChase(cam, byTower, DT, OPTS);
    expect(cam.boom).toBeCloseTo(9.5 - 5.5 * Math.exp(-3 * DT), 12);
    cam = follow(cam, byTower, 59, OPTS);
    expect(cam.boom).toBeCloseTo(9.5 - 5.5 * Math.exp(-3), 12);
  });
});

describe('the ground', () => {
  it('never under the ground: 400 chariot poses on the field keep the camera 1.4 m over it', () => {
    const rnd = mulberry32(2026);
    let least = Infinity;
    for (let k = 0; k < 400; k++) {
      const at = inPlay(rnd);
      const car = chariot(rnd() * 25, 2 * Math.PI * rnd(), at.x, at.z);
      const o: ChaseOpts = { ...OPTS, ground: groundHeight, tall: TALL, boosting: rnd() < 0.3 };
      const cam = k % 2 ? bump(initChase(car, o), 10) : initChase(car, o);
      const { pos } = chaseView(cam, car, o, k * 0.37).pose;
      least = Math.min(least, pos.y - (groundHeight(pos.x, pos.z) + 1.4));
    }
    expect(least).toBeGreaterThanOrEqual(-1e-9);
  });

  // The field's own ground never makes the lift act (the camera rides 6.8 m up or more), so this is its only guard.
  it('the lift itself: ground climbing 10 m behind the chariot lifts the camera, shaking or not', () => {
    const o: ChaseOpts = { ...OPTS, ground: (x) => (x < -5 ? 10 : 0) };
    const car = chariot(0);
    const cam = initChase(car, o);
    const { pos, look } = chaseView(cam, car, o).pose;
    expect(pos.y).toBeCloseTo(11.4, 12);
    expect(look.y).toBeCloseTo(0.8, 12);
    const shaken = bump(cam, 10);
    for (let k = 0; k < 100; k++) expect(chaseView(shaken, car, o, k * 0.017).pose.pos.y).toBeGreaterThanOrEqual(11.4 - 1e-9);
  });
});

describe('shake', () => {
  it('a bump above 6 m/s sets it to 0.18 m; one at 6 m/s or less does nothing', () => {
    const cam = initChase(chariot(0), OPTS);
    expect(bump(cam, 6).shake).toBe(0);
    expect(bump(cam, 6.5).shake).toBe(0.18);
  });

  it('adds deterministic noise of at most the shake to the view', () => {
    const car = chariot(9);
    const cam = bump(initChase(car, OPTS), 10);
    const still = chaseView({ ...cam, shake: 0 }, car, OPTS).pose;
    let largest = 0;
    for (let k = 0; k < 300; k++) {
      const t = k * 0.0123;
      const view = chaseView(cam, car, OPTS, t);
      expect(chaseView(cam, car, OPTS, t)).toEqual(view);
      const { pos, look } = view.pose;
      const moved = Math.hypot(pos.x - still.pos.x, pos.y - still.pos.y, pos.z - still.pos.z);
      expect(moved).toBeLessThanOrEqual(0.18 + 1e-12);
      expect(Math.hypot(look.x - still.look.x, look.y - still.look.y, look.z - still.look.z)).toBeLessThanOrEqual(0.18 + 1e-12);
      largest = Math.max(largest, moved);
    }
    expect(largest).toBeGreaterThan(0.09);
  });

  it('decays at 6/s', () => {
    const car = chariot(0);
    const cam = follow(bump(initChase(car, OPTS), 10), car, 60);
    expect(cam.shake).toBeCloseTo(0.18 * Math.exp(-6), 12);
  });
});

describe('robustness', () => {
  it('no NaN at rest: every field of stepChase is finite', () => {
    const car = chariot(0);
    const cam = stepChase(initChase(car, OPTS), car, DT, OPTS);
    for (const k of CAM_KEYS) expect(Number.isFinite(cam[k]), k).toBe(true);
    const { pose, fov } = chaseView(cam, car, OPTS);
    for (const v of [pose.pos.x, pose.pos.y, pose.pos.z, pose.look.x, pose.look.y, pose.look.z, fov]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('a zero, negative or NaN step counts as no time', () => {
    const car = chariot(9);
    const cam = bump(initChase(chariot(0, 0.3), OPTS), 10);
    for (const dt of [0, -1, Number.NaN]) expectCam(stepChase(cam, car, dt, LAJU), cam);
  });

  it('never changes its inputs', () => {
    const car = Object.freeze(chariot(12, 0.4, 3, 4));
    const cam = Object.freeze(bump(initChase(chariot(0), OPTS), 10));
    const o: ChaseOpts = Object.freeze({ ...OPTS, tall: Object.freeze([TOWER]) });
    const before = JSON.stringify([car, cam]);
    stepChase(cam, car, DT, o);
    chaseView(cam, car, o, 1);
    bump(cam, 10);
    introShots({ x: 30, z: -40 }, { x: 20, z: -20 }, car, o);
    outroShot(car, o);
    failShot(car, o);
    expect(JSON.stringify([car, cam])).toBe(before);
  });
});

describe('lakon shots', () => {
  const car = chariot(0);
  const area = { x: 30, z: -40 };
  const first = { x: 20, z: -20 };
  const shots = introShots(area, first, car, OPTS);

  it('the intro is three shots that total 3.5 s', () => {
    expect(shots.map((s) => s.seconds)).toEqual([1.2, 1.2, 1.1]);
    expect(shots.reduce((t, s) => t + s.seconds, 0)).toBeCloseTo(3.5, 12);
  });

  it('shotAt(shots, 3.5) is the chase view of initChase', () => {
    const end = shotAt(shots, 3.5);
    const chase = chaseView(initChase(car, OPTS), car, OPTS);
    for (const k of ['pos', 'look'] as const) {
      for (const a of ['x', 'y', 'z'] as const) expectNear(end.pose[k][a], chase.pose[k][a], 0.01);
    }
    expect(end.fov).toBeCloseTo(chase.fov, 9);
    expect(end.done).toBe(true);
    expect(shotAt(shots, 3.4).done).toBe(false);
  });

  it('sampled every 0.1 s, every intro pose is 1.4 m over the ground', () => {
    for (let k = 0; k <= 35; k++) expect(shotAt(shots, k / 10).pose.pos.y).toBeGreaterThanOrEqual(1.4);
  });

  it('and on the real ground, for intros all over the field and beside the pavilion’s mound', () => {
    const rnd = mulberry32(77);
    let least = Infinity;
    for (let n = 0; n < 80; n++) {
      const at = inPlay(rnd, 10);
      const c = chariot(rnd() * 10, 2 * Math.PI * rnd(), at.x, at.z);
      const a = 2 * Math.PI * rnd();
      const r = 8 + 12 * rnd();
      // Every other intro puts its first record 8–20 m from the pavilion, on or by the mound's slope.
      const record = n % 2 ? { x: PAVILION.x + r * Math.cos(a), z: PAVILION.z + r * Math.sin(a) } : inPlay(rnd, 10);
      const o: ChaseOpts = { ...OPTS, ground: groundHeight, tall: TALL };
      const intro = introShots(inPlay(rnd, 10), record, c, o);
      for (let k = 0; k <= 35; k++) {
        const { pos } = shotAt(intro, k / 10).pose;
        least = Math.min(least, pos.y - (groundHeight(pos.x, pos.z) + 1.4));
      }
    }
    expect(least).toBeGreaterThanOrEqual(-1e-9);
  });

  it('high and wide over the area, low past the first record, then from 20 m behind and 8 m up', () => {
    const [wide, dolly, descend] = shots;
    for (const p of [wide.from, wide.to]) {
      expect(p.pos.y).toBe(40);
      expect(dist(p.pos, area)).toBeLessThanOrEqual(30 + 1e-9);
      expectVec(p.look, { x: area.x, y: 0, z: area.z }, 12);
    }
    expect(dist(dolly.from.pos, first)).toBeCloseTo(14, 9);
    expect(dist(dolly.to.pos, first)).toBeCloseTo(8, 9);
    for (const p of [dolly.from, dolly.to]) {
      expect(p.pos.y).toBe(2.5);
      expect(p.look.x).toBe(first.x);
      expect(p.look.z).toBe(first.z);
    }
    expectVec(descend.from.pos, { x: -20, y: 8, z: 0 }, 9);
    expect(descend.to).toEqual(chaseView(initChase(car, OPTS), car, OPTS).pose);
    for (const s of shots) expect(s.fovFrom).toBe(55);
  });

  it('keeps the shots behind the chariot out of a tall thing behind it', () => {
    const byTower = chariot(0, 0, -39, 52);
    const o: ChaseOpts = { ...OPTS, tall: [TOWER] };
    // 20 m (the descent) and 6 m (a fail) both stop 0.5 m short of the tower: 4.0 m behind.
    expectVec(introShots(area, first, byTower, o)[2].from.pos, { x: -43, y: 8, z: 52 }, 9);
    expectVec(failShot(byTower, o).to.pos, { x: -43, y: 12, z: 52 }, 9);
  });

  it('opens sensibly with the chariot on the area and the record', () => {
    const intro = introShots({ x: 0, z: 0 }, { x: 0, z: 0 }, car, OPTS);
    for (let k = 0; k <= 35; k++) {
      const { pose, fov } = shotAt(intro, k / 10);
      for (const v of [pose.pos.x, pose.pos.y, pose.pos.z, pose.look.x, pose.look.y, pose.look.z, fov]) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
    // With no direction to the chariot, the shots come from behind it (−x for yaw 0).
    expect(intro[0].from.pos.x).toBeCloseTo(-30, 9);
    expect(intro[1].to.pos.x).toBeLessThan(-7);
  });

  it('frames the intro for a narrow screen too', () => {
    const phone: ChaseOpts = { ...OPTS, aspect: 360 / 780 };
    for (const s of introShots(area, first, car, phone)) {
      expect(s.fovFrom).toBe(fovForAspect(55, 360 / 780));
      expect(s.fovTo).toBe(fovForAspect(55, 360 / 780));
    }
  });

  it('eases within each shot with smoothstep, cuts between them and holds the ends', () => {
    const [wide, dolly] = shots;
    const k = 0.15625; // smoothstep at a quarter of the way
    const quarter = shotAt(shots, 0.3).pose;
    for (const a of ['x', 'y', 'z'] as const) {
      expect(quarter.pos[a]).toBeCloseTo(wide.from.pos[a] + (wide.to.pos[a] - wide.from.pos[a]) * k, 9);
    }
    expect(shotAt(shots, 1.2).pose).toEqual(dolly.from);
    expect(shotAt(shots, -1).pose).toEqual(wide.from);
    const late = shotAt(shots, 9);
    expect(late.pose).toEqual(shots[2].to);
    expect(late.done).toBe(true);
    const zoom: Shot = { from: wide.from, to: wide.to, seconds: 2, fovFrom: 50, fovTo: 70 };
    expect(shotAt([zoom], 1).fov).toBe(60);
  });

  it('outroShot: 2.5 s from the side, 7 m out and 2 m up', () => {
    const shot = outroShot(chariot(5, 0, 10, 10), OPTS);
    expect(shot.seconds).toBe(2.5);
    for (const p of [shot.from, shot.to]) {
      expectVec(p.pos, { x: 10, y: 2, z: 17 }, 9);
      expect(p.look.x).toBeCloseTo(10, 9);
      expect(p.look.z).toBeCloseTo(10, 9);
    }
  });

  it('films the outro from the side away from the tower', () => {
    // North of the tower facing east, so the chariot's right side faces it.
    const shot = outroShot(chariot(0, 0, -46, 46), { ...OPTS, tall: [TOWER] });
    expectVec(shot.from.pos, { x: -46, y: 2, z: 39 }, 9);
  });

  it('failShot: 1.2 s from the chase view, rising to 12 m up and 6 m behind', () => {
    const c = chariot(9);
    const shot = failShot(c, OPTS);
    const chase = chaseView(initChase(c, OPTS), c, OPTS);
    expect(shot.seconds).toBe(1.2);
    expect(shot.from).toEqual(chase.pose);
    expect(shot.fovFrom).toBe(chase.fov);
    expectVec(shot.to.pos, { x: -6, y: 12, z: 0 }, 9);
    expect(shot.to.look.x).toBeCloseTo(0, 12);
    expect(shot.to.look.z).toBeCloseTo(0, 12);
  });

  it('orbitView: 14 m out and 6 m up, turning at 0.08 rad/s, looking at the centre', () => {
    const at = ANCHORS.tower;
    for (const t of [0, 1, 7.5, 60]) {
      const { pose, fov } = orbitView(at, t, flat);
      expect(dist(pose.pos, at)).toBeCloseTo(14, 9);
      expect(pose.pos.y).toBeCloseTo(6, 12);
      expect(pose.look.x).toBe(at.x);
      expect(pose.look.z).toBe(at.z);
      expect(fov).toBe(55);
    }
    const bearing = (t: number) => {
      const { pos } = orbitView(at, t, flat).pose;
      return Math.atan2(pos.z - at.z, pos.x - at.x);
    };
    expect(Math.abs(angleDiff(bearing(10), bearing(0)))).toBeCloseTo(0.8, 9);
  });

  it('keeps the orbit 14 m out in xz and 1.4 m over the real ground', () => {
    for (let t = 0; t < 80; t += 0.5) {
      const { pos } = orbitView(ANCHORS.tower, t, groundHeight).pose;
      expect(dist(pos, ANCHORS.tower)).toBeCloseTo(14, 9);
      expect(pos.y).toBeGreaterThanOrEqual(groundHeight(pos.x, pos.z) + 1.4 - 1e-9);
    }
  });
});

describe('the chapter intro’s orbit round the chariot keeps tall things out of the shot', () => {
  /** Frames of a full turn at 0.08 rad/s. */
  const turn = (fps: number) => Math.ceil(((2 * Math.PI) / 0.08) * fps);

  /** The least distance from the segment ab to the collider's edge: 0 or less when the segment meets it. */
  function sightClearance(a: XZ, b: XZ, c: Collider): number {
    if (c.kind === 'circle') return segPointDist(c, a, b) - c.r;
    // Clip ab to the box: whatever is left of it lies inside.
    let t0 = 0;
    let t1 = 1;
    for (const [p, d, lo, hi] of [
      [a.x, b.x - a.x, c.minX, c.maxX],
      [a.z, b.z - a.z, c.minZ, c.maxZ],
    ]) {
      if (d === 0) {
        if (p < lo || p > hi) return Math.min(distToCollider(a, c), distToCollider(b, c), ...boxCorners(c).map((q) => segPointDist(q, a, b)));
        continue;
      }
      t0 = Math.max(t0, Math.min((lo - p) / d, (hi - p) / d));
      t1 = Math.min(t1, Math.max((lo - p) / d, (hi - p) / d));
    }
    if (t0 <= t1) return 0;
    // Apart, a segment and a box are nearest at an end of the one or a corner of the other.
    return Math.min(distToCollider(a, c), distToCollider(b, c), ...boxCorners(c).map((q) => segPointDist(q, a, b)));
  }
  const boxCorners = (c: Extract<Collider, { kind: 'box' }>): XZ[] => [
    { x: c.minX, z: c.minZ },
    { x: c.minX, z: c.maxZ },
    { x: c.maxX, z: c.minZ },
    { x: c.maxX, z: c.maxZ },
  ];

  /** One full turn round `at` at `fps`: the least clearances, the radius's largest step and its largest change of step. */
  function circleOnce(at: XZ, fps: number) {
    const radii: number[] = [];
    let clear = Infinity;
    let sight = Infinity;
    let up = Infinity;
    for (let k = 0; k <= turn(fps); k++) {
      const { pose, fov } = orbitView(at, k / fps, groundHeight, TALL);
      const { pos, look } = pose;
      radii.push(dist(pos, at));
      clear = Math.min(clear, clearanceOf(pos, TALL));
      sight = Math.min(sight, ...TALL.map((c) => sightClearance(at, pos, c)));
      up = Math.min(up, pos.y - groundHeight(pos.x, pos.z));
      expect(look).toEqual(orbitView(at, k / fps, groundHeight).pose.look);
      expect(fov).toBe(55);
    }
    let step = 0;
    let bend = 0;
    for (let k = 1; k < radii.length; k++) step = Math.max(step, Math.abs(radii[k] - radii[k - 1]));
    for (let k = 2; k < radii.length; k++) bend = Math.max(bend, Math.abs(radii[k] - 2 * radii[k - 1] + radii[k - 2]));
    return { clear, sight, up, step, bend, least: Math.min(...radii), most: Math.max(...radii) };
  }

  it('from TOWER_EXIT, a full turn at 60 fps: never in the tower or behind it, the radius eased, 1 m over the ground', () => {
    const o = circleOnce(TOWER_EXIT, 60);
    // Today's orbit stays 1.5 m out of the tower's collider here, but looks at the chariot through its frame.
    expect(o.clear).toBeGreaterThanOrEqual(CHASE.boomMargin - 1e-9);
    expect(o.sight).toBeGreaterThanOrEqual(CHASE.boomMargin - 1e-9);
    expect(o.step).toBeLessThan(0.2);
    expect(o.up).toBeGreaterThanOrEqual(1);
    // It comes in to keep the tower behind it (10 m off, 3 m with the margin: 7 m), eased with no kink, and goes back out.
    expect(o.least).toBeCloseTo(7, 3);
    expect(o.most).toBeCloseTo(14, 9);
    expect(o.step).toBeLessThan(0.02);
    expect(o.bend).toBeLessThan(0.002);
  });

  it('by the tower all round, in the groves and by the gate: never in a tall thing or behind one, never under 1 m over the ground', () => {
    const poses: XZ[] = [ANCHORS.groveNW, ANCHORS.groveSE, { x: 105, z: -20 }, { x: TREES[0].x + 4, z: TREES[0].z + 4 }];
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      for (const r of [6, 12, 15]) poses.push({ x: ANCHORS.tower.x + r * Math.cos(a), z: ANCHORS.tower.z + r * Math.sin(a) });
    }
    let entered = 0;
    for (const at of poses) {
      const where = `(${at.x.toFixed(1)}, ${at.z.toFixed(1)})`;
      const o = circleOnce(at, 15);
      expect(o.clear, where).toBeGreaterThanOrEqual(CHASE.boomMargin - 1e-9);
      expect(o.sight, where).toBeGreaterThanOrEqual(CHASE.boomMargin - 1e-9);
      expect(o.up, where).toBeGreaterThanOrEqual(1);
      // 15 fps: a quarter of the steps a 60 fps turn takes, so four times its bound.
      expect(o.step, where).toBeLessThan(4 * 0.2);
      // How many of these today's 14 m orbit would carry into a tall collider's margin.
      for (let f = 0; f <= turn(15); f++) {
        if (clearanceOf(orbitView(at, f / 15, groundHeight).pose.pos, TALL) < CHASE.boomMargin) {
          entered++;
          break;
        }
      }
    }
    expect(entered).toBeGreaterThanOrEqual(10);
  }, 30_000);

  it('at 60 fps its radius moves under 0.2 m a frame wherever it starts by the tower, in a grove or by the gate', () => {
    for (const at of [{ x: ANCHORS.tower.x - 6, z: ANCHORS.tower.z }, ANCHORS.groveNW, { x: 105, z: -20 }]) {
      expect(circleOnce(at, 60).step, `(${at.x}, ${at.z})`).toBeLessThan(0.2);
    }
  }, 30_000);

  it('away from every tall collider it is today’s orbit, exactly', () => {
    for (const at of [SPAWN, { x: PLAY.cx, z: PLAY.cz }, { x: 60, z: -100 }]) {
      for (let k = 0; k <= turn(4); k++) expect(orbitView(at, k / 4, groundHeight, TALL)).toEqual(orbitView(at, k / 4, groundHeight));
    }
  });
});
