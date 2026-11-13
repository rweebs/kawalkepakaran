import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/sky/rng';
import {
  angleDiff,
  clamp,
  dist,
  forward,
  nextRand,
  polylineDist,
  rightOf,
  segPointDist,
  smoothstep,
  yawOf,
} from '../src/lib/bowobharata-game/geom';
import {
  NO_INPUT,
  initChariot,
  lateralOf,
  refillBoost,
  speedOf,
  stepChariot,
  turnRadius,
  yawRateFor,
  type ChariotInput,
  type ChariotState,
  type DriveEnv,
  type Guard,
} from '../src/lib/bowobharata-game/drive';

/** Steps `frames` frames of `input` (unset fields come from NO_INPUT) and returns the state after each frame. */
function run(s: ChariotState, input: Partial<ChariotInput>, frames: number, dt = 1 / 60, env?: DriveEnv): ChariotState[] {
  const i = { ...NO_INPUT, ...input };
  const states: ChariotState[] = [];
  for (let f = 0; f < frames; f++) {
    s = stepChariot(s, i, dt, env);
    states.push(s);
  }
  return states;
}

const last = (states: ChariotState[]) => states[states.length - 1];
/** At the origin facing east (yaw 0), moving east at vx. */
const moving = (vx: number, extra: Partial<ChariotState> = {}): ChariotState => ({ ...initChariot(0, 0, 0), vx, ...extra });
const atRest = (s: ChariotState) => Math.abs(speedOf(s)) <= 1e-9;
const seconds = (frameIndex: number) => (frameIndex + 1) / 60;
const degrees = (rad: number) => (rad * 180) / Math.PI;

describe('geometry helpers', () => {
  it('measures distances to points, segments and polylines', () => {
    expect(dist({ x: 1, z: 1 }, { x: 4, z: 5 })).toBe(5);
    const a = { x: 0, z: 0 };
    const b = { x: 10, z: 0 };
    expect(segPointDist({ x: 5, z: 3 }, a, b)).toBeCloseTo(3, 12);
    expect(segPointDist({ x: 13, z: 4 }, a, b)).toBeCloseTo(5, 12);
    expect(segPointDist({ x: -3, z: -4 }, a, b)).toBeCloseTo(5, 12);
    expect(segPointDist({ x: 3, z: 4 }, a, a)).toBeCloseTo(5, 12);
    const line = [a, b, { x: 10, z: 10 }];
    expect(polylineDist({ x: 12, z: 6 }, line)).toBeCloseTo(2, 12);
    expect(polylineDist({ x: 5, z: -1 }, line)).toBeCloseTo(1, 12);
    expect(polylineDist({ x: 3, z: 4 }, [a])).toBeCloseTo(5, 12);
  });

  it('wraps angle differences to (−π, π]', () => {
    expect(angleDiff(Math.PI, 0)).toBeCloseTo(Math.PI, 12);
    expect(angleDiff(-Math.PI, 0)).toBeCloseTo(Math.PI, 12);
    expect(angleDiff(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2, 12);
    expect(angleDiff(2 * Math.PI - 0.1, 0.1)).toBeCloseTo(-0.2, 12);
    expect(angleDiff(5 * Math.PI + 0.5, 0)).toBeCloseTo(0.5 - Math.PI, 9);
    expect(angleDiff(-4 * Math.PI - 0.3, 0)).toBeCloseTo(-0.3, 9);
    expect(angleDiff(1, 1)).toBe(0);
  });

  it('follows the axis conventions: north is −z, east is +x', () => {
    expect(forward(0).x).toBeCloseTo(1, 12);
    expect(forward(0).z).toBeCloseTo(0, 12);
    expect(forward(Math.PI / 2).x).toBeCloseTo(0, 12);
    expect(forward(Math.PI / 2).z).toBeCloseTo(-1, 12);
    expect(rightOf(0).x).toBeCloseTo(0, 12);
    expect(rightOf(0).z).toBeCloseTo(1, 12);
    for (const yaw of [-3, -1.2, 0, 0.4, 2.5, Math.PI]) {
      expect(yawOf(forward(yaw))).toBeCloseTo(yaw, 12);
      expect(rightOf(yaw).x).toBeCloseTo(forward(yaw - Math.PI / 2).x, 12);
      expect(rightOf(yaw).z).toBeCloseTo(forward(yaw - Math.PI / 2).z, 12);
    }
  });

  it('clamps and smoothsteps', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(0.3, 0, 1)).toBe(0.3);
    expect(clamp(7, 0, 1)).toBe(1);
    expect(smoothstep(2, 4, 1)).toBe(0);
    expect(smoothstep(2, 4, 3)).toBe(0.5);
    expect(smoothstep(2, 4, 5)).toBe(1);
    expect(smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625, 12);
  });

  it('nextRand: five steps from state 404 match five calls of mulberry32(404)', () => {
    const reference = mulberry32(404);
    let a = 404;
    for (let k = 0; k < 5; k++) {
      const r = nextRand(a);
      expect(r.v).toBe(reference());
      a = r.a;
    }
  });
});

describe('drive model', () => {
  it('full throttle: 6.634 m/s at 1 s, 11.518 at 2 s, 16.46 at 5 s, never 17', () => {
    const states = run(initChariot(0, 0, 0), { throttle: 1 }, 480);
    expect(speedOf(states[59])).toBeCloseTo(6.634, 2);
    expect(speedOf(states[119])).toBeCloseTo(11.518, 2);
    expect(speedOf(states[299])).toBeCloseTo(16.46, 2);
    expect(Math.max(...states.map(speedOf))).toBeLessThan(17);
  });

  it('reaches 10 m/s at 1.65 s and 15 m/s at 3.37 s', () => {
    const states = run(initChariot(0, 0, 0), { throttle: 1 }, 300);
    const reached = (v: number) => seconds(states.findIndex((s) => speedOf(s) >= v));
    expect(Math.abs(reached(10) - 1.65)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(reached(15) - 3.37)).toBeLessThanOrEqual(0.02);
  });

  it('brakes from 17 m/s to rest in about 1.13 s over about 9.6 m, without rolling back', () => {
    const states = run(moving(17), { brake: 1 }, 120);
    const stop = states.findIndex(atRest);
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(seconds(stop)).toBeGreaterThanOrEqual(1.11);
    expect(seconds(stop)).toBeLessThanOrEqual(1.15);
    expect(states[stop].x).toBeGreaterThanOrEqual(9.46);
    expect(states[stop].x).toBeLessThanOrEqual(9.66);
    const next = states.slice(stop + 1, stop + 13);
    expect(next).toHaveLength(12);
    for (const s of next) expect(speedOf(s)).toBeGreaterThanOrEqual(0);
  });

  it('coasts from 17 m/s to rest in about 8.65 s over 56–57 m', () => {
    const states = run(moving(17), {}, 600);
    const stop = states.findIndex(atRest);
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(seconds(stop)).toBeGreaterThanOrEqual(8.55);
    expect(seconds(stop)).toBeLessThanOrEqual(8.75);
    expect(states[stop].x).toBeGreaterThanOrEqual(56);
    expect(states[stop].x).toBeLessThanOrEqual(57);
  });

  it('turns hardest near 8 m/s', () => {
    const expected = [
      [2, 0.424],
      [5, 0.851],
      [8, 0.998],
      [12, 0.966],
      [17, 0.834],
      [25, 0.643],
    ];
    for (const [v, rate] of expected) expect(yawRateFor(v)).toBeCloseTo(rate, 3);
    expect(yawRateFor(0)).toBe(0.9);
    expect(turnRadius(17)).toBeCloseTo(20.395, 9);
  });

  it('grips in a turn', () => {
    const end = last(run(moving(15), { throttle: 0.8, steer: 1 }, 60));
    expect(Math.abs(lateralOf(end))).toBeLessThan(0.7);
    expect(Math.abs(degrees(-end.yaw) - 50.4)).toBeLessThanOrEqual(1);
  });

  it('slides when the reins are pulled, then grips again', () => {
    const slid = last(run(moving(15), { throttle: 1, steer: 1, drift: true }, 60));
    expect(Math.abs(lateralOf(slid))).toBeGreaterThanOrEqual(5.06);
    expect(Math.abs(lateralOf(slid))).toBeLessThanOrEqual(5.26);
    expect(speedOf(slid)).toBeGreaterThanOrEqual(10.43);
    expect(speedOf(slid)).toBeLessThanOrEqual(10.63);
    const regrip = run(slid, { throttle: 1 }, 18);
    expect(regrip.findIndex((s) => Math.abs(lateralOf(s)) < 0.5)).toBeGreaterThanOrEqual(0);
  });

  it('Laju: a 1.8 s surge toward 25 m/s, then a 7 s cooldown', () => {
    const first = run(moving(15), { throttle: 1, boost: true }, 1);
    const states = [...first, ...run(first[0], { throttle: 1 }, 179)];
    // 1.8 ± 1/60 s at 60 frames a second is 108 ± 1 frames.
    const boostFrames = states.filter((s) => s.boostT > 0).length;
    expect(boostFrames).toBeGreaterThanOrEqual(107);
    expect(boostFrames).toBeLessThanOrEqual(109);
    const peak = Math.max(...states.map(speedOf));
    expect(peak).toBeGreaterThanOrEqual(23.9);
    expect(peak).toBeLessThanOrEqual(24);
    const at3s = last(states);
    expect(at3s.cooldown).toBeGreaterThanOrEqual(3.98);
    expect(at3s.cooldown).toBeLessThanOrEqual(4.03);
    const surge = { ...NO_INPUT, throttle: 1, boost: true };
    expect(stepChariot(at3s, surge, 1 / 60).boostT).toBe(0);
    expect(refillBoost(at3s).cooldown).toBe(0);
    expect(stepChariot(refillBoost(at3s), surge, 1 / 60).boostT).toBeGreaterThan(0);
  });

  it('a slide refills Laju', () => {
    const slid = last(run(moving(15, { cooldown: 6 }), { throttle: 1, steer: 0.6, drift: true }, 96));
    expect(slid.cooldown).toBeGreaterThanOrEqual(1.92);
    expect(slid.cooldown).toBeLessThanOrEqual(2.02);
    const gripped = last(run(moving(15, { cooldown: 6 }), { throttle: 1, steer: 0.6 }, 96));
    expect(Math.abs(gripped.cooldown - 4.4)).toBeLessThanOrEqual(0.02);
  });

  it('haze caps the speed', () => {
    const states = run(moving(17), { throttle: 1 }, 180, 1 / 60, { cloud: true });
    for (const s of states.slice(59)) expect(speedOf(s)).toBeLessThanOrEqual(9.55);
    expect(Math.abs(speedOf(states[179]) - 9.35)).toBeLessThanOrEqual(0.05);
  });

  it('gives the same result at any frame rate', () => {
    const after2s = (dt: number) => last(run(initChariot(0, 0, 0), { throttle: 1, steer: 0.5 }, Math.round(2 / dt), dt));
    const reference = after2s(1 / 60);
    expect(Math.hypot(reference.x, reference.z)).toBeGreaterThan(5);
    for (const dt of [1 / 120, 0.05]) {
      const s = after2s(dt);
      expect(Math.abs(s.x - reference.x)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(s.z - reference.z)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('clamps a long frame to 0.05 s', () => {
    const s = moving(12);
    const i = { ...NO_INPUT, throttle: 1, steer: 0.5 };
    expect(stepChariot(s, i, 1)).toEqual(stepChariot(s, i, 0.05));
  });

  it('follows the conventions: forward is (cos yaw, −sin yaw), steer +1 turns right', () => {
    const south = last(run(initChariot(0, 0, -Math.PI / 2), { throttle: 1 }, 60));
    expect(south.x).toBeCloseTo(0, 9);
    // Semi-implicit Euler; explicit Euler gives 3.379 here.
    expect(south.z).toBeGreaterThanOrEqual(3.42);
    expect(south.z).toBeLessThanOrEqual(3.45);
    const right = last(run(moving(8), { throttle: 0.5, steer: 1 }, 30));
    expect(right.z).toBeGreaterThan(0.5);
    expect(right.yaw).toBeLessThan(0);
  });

  it('pivots on the spot below 1 m/s', () => {
    const s = last(run(initChariot(0, 0, 0), { steer: 1 }, 60));
    expect(s.yaw).toBeCloseTo(-0.9, 2);
    expect(s.x).toBeCloseTo(0, 9);
    expect(s.z).toBeCloseTo(0, 9);
  });

  it('reverses only after the brake is held 0.25 s at rest, never past 4 m/s', () => {
    const states = run(initChariot(0, 0, 0), { brake: 1 }, 360);
    expect(Math.abs(speedOf(states[13]))).toBe(0);
    expect(Math.abs(speedOf(states[194]) - -3.92)).toBeLessThanOrEqual(0.05);
    expect(Math.min(...states.map(speedOf))).toBeGreaterThanOrEqual(-4);
  });
});

describe('the guard hook', () => {
  const stub: Guard = {
    cap: (_x, _z, _yaw, vx, vz) => ({ vx: 0, vz, removed: Math.abs(vx) }),
    blocksTurn: () => true,
  };

  it('keeps the heading, removes the speed and cancels a surge', () => {
    const s = stepChariot(moving(15), { ...NO_INPUT, throttle: 1, steer: 1, boost: true }, 1 / 60, { cloud: false, guard: stub });
    expect(s.x).toBe(0);
    expect(s.yaw).toBe(0);
    expect(s.boostT).toBe(0);
    expect(s.held).toBeGreaterThanOrEqual(15);
    expect(s.held).toBeLessThanOrEqual(15.1);
  });

  it('no surge starts from a state the guard held', () => {
    const surge = { ...NO_INPUT, throttle: 1, boost: true };
    expect(stepChariot(moving(15, { held: 3 }), surge, 1 / 60).boostT).toBe(0);
    expect(stepChariot(moving(15), surge, 1 / 60).boostT).toBeGreaterThan(0);
  });
});
