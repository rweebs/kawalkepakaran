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
  type Edge,
  type Guard,
} from '../src/lib/bowobharata-game/drive';
import { DRIVE } from '../src/lib/bowobharata-game/tuning';

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

/** Laju requested on the first frame only, with full throttle on every frame. */
function surgeRun(s: ChariotState, frames: number, dt = 1 / 60, env?: DriveEnv): ChariotState[] {
  const first = run(s, { throttle: 1, boost: true }, 1, dt, env);
  return [...first, ...run(first[0], { throttle: 1 }, frames - 1, dt, env)];
}

const last = (states: ChariotState[]) => states[states.length - 1];
/** At the origin facing east (yaw 0), moving east at vx. */
const moving = (vx: number, extra: Partial<ChariotState> = {}): ChariotState => ({ ...initChariot(0, 0, 0), vx, ...extra });
const atRest = (s: ChariotState) => Math.abs(speedOf(s)) <= 1e-9;
const seconds = (frameIndex: number) => (frameIndex + 1) / 60;
const degrees = (rad: number) => (rad * 180) / Math.PI;
const HAZE: DriveEnv = { cloud: true };
const MOTION = ['x', 'z', 'yaw', 'vx', 'vz'] as const;

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

  it('nextRand: 1,000 chained steps match mulberry32 from seeds including 0 and negative ones', () => {
    for (const seed of [0, -1, -404, 404, 2 ** 32 - 1, 123456789]) {
      const reference = mulberry32(seed);
      const fromClosure: number[] = [];
      const fromState: number[] = [];
      let a = seed;
      for (let k = 0; k < 1000; k++) {
        const r = nextRand(a);
        fromState.push(r.v);
        fromClosure.push(reference());
        a = r.a;
      }
      expect(fromState).toEqual(fromClosure);
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

  it('a partial brake still stops dead, rests 0.25 s, then reverses', () => {
    const half = run(moving(17), { brake: 0.5 }, 240);
    const stop = half.findIndex((s) => speedOf(s) === 0);
    const back = half.findIndex((s) => speedOf(s) < 0);
    expect(stop).toBeGreaterThanOrEqual(0);
    expect(back).toBeGreaterThan(stop);
    for (const s of half.slice(0, back)) expect(speedOf(s)).toBeGreaterThanOrEqual(0);
    for (const s of half.slice(stop, back)) expect(Math.abs(speedOf(s))).toBe(0);
    expect(seconds(back) - seconds(stop)).toBeGreaterThanOrEqual(0.25);
    expect(seconds(back) - seconds(stop)).toBeLessThanOrEqual(0.25 + 2 / 60);
    const gentle = run(moving(5), { brake: 0.1 }, 300);
    const rest = gentle.findIndex((s) => speedOf(s) === 0);
    expect(rest).toBeGreaterThanOrEqual(0);
    for (const s of gentle.slice(0, rest)) expect(speedOf(s)).toBeGreaterThan(0);
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
    const states = surgeRun(moving(15), 180);
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
    const states = run(moving(17), { throttle: 1 }, 180, 1 / 60, HAZE);
    for (const s of states.slice(59)) expect(speedOf(s)).toBeLessThanOrEqual(9.55);
    expect(Math.abs(speedOf(states[179]) - 9.35)).toBeLessThanOrEqual(0.05);
  });

  it('haze caps a surge too, approaching 9.35 m/s from below', () => {
    // One substep per frame, so every substep is checked.
    const from9 = surgeRun(moving(9), 240, 1 / 120, HAZE);
    expect(from9.some((s) => s.boostT > 0)).toBe(true);
    expect(Math.max(...from9.map(speedOf))).toBeLessThanOrEqual(9.35 + 1e-9);
    expect(speedOf(last(from9))).toBeGreaterThan(9.3);
    const from17 = surgeRun(moving(17), 180, 1 / 60, HAZE);
    expect(from17.some((s) => s.boostT > 0)).toBe(true);
    for (const s of from17.slice(59)) expect(speedOf(s)).toBeLessThanOrEqual(9.55);
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

  it('a frame a hair longer than whole substeps runs that many substeps', () => {
    const dt = 0.1 - 0.075; // 0.025000000000000008 s: 3.000000000000001 substeps of 1/120 s
    const i = { ...NO_INPUT, throttle: 1, steer: 0.5 };
    const noisy = stepChariot(moving(12), i, dt);
    const exact = stepChariot(moving(12), i, 3 / 120);
    for (const k of MOTION) expect(Math.abs(noisy[k] - exact[k])).toBeLessThanOrEqual(1e-12);
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

  it('a bump cuts the throttle for 0.3 s, then the engine pulls again', () => {
    // One substep per frame: 0.3 s is 36 substeps, and the countdown may take one more.
    const states = run(moving(10, { holdOff: DRIVE.bumpHoldOff }), { throttle: 1 }, 48, 1 / 120);
    const released = states.findIndex((s) => s.holdOff === 0) + 1;
    expect(released).toBeGreaterThanOrEqual(36);
    expect(released).toBeLessThanOrEqual(37);
    // speeds[k] is the speed after substep k: it only coasts while the throttle is cut, then it gains.
    const speeds = [10, ...states.map(speedOf)];
    for (let k = 1; k <= released; k++) expect(speeds[k]).toBeLessThan(speeds[k - 1]);
    for (let k = released + 1; k < speeds.length; k++) expect(speeds[k]).toBeGreaterThan(speeds[k - 1]);
  });

  it('never mutates the state, input or environment it is given', () => {
    const s = Object.freeze(moving(15, { boostT: 1, cooldown: 3, holdOff: 0.1 }));
    const i = Object.freeze({ ...NO_INPUT, throttle: 1, steer: 0.5, drift: true, boost: true });
    const guard: Guard = Object.freeze({
      cap: (_x: number, _z: number, _yaw: number, vx: number, vz: number) => ({ vx: Math.min(vx, 8), vz, removed: Math.max(0, vx - 8) }),
      blocksTurn: () => false,
    });
    const env = Object.freeze({ cloud: true, guard });
    const sBefore = { ...s };
    const iBefore = { ...i };
    expect(() => stepChariot(s, i, 1 / 60, env)).not.toThrow();
    expect(s).toEqual(sBefore);
    expect(i).toEqual(iBefore);
  });

  it('reads a non-finite throttle, brake or steer as 0', () => {
    const s = moving(12);
    const idle = stepChariot(s, NO_INPUT, 1 / 60);
    for (const bad of [NaN, Infinity, -Infinity]) {
      const out = stepChariot(s, { ...NO_INPUT, throttle: bad, brake: bad, steer: bad }, 1 / 60);
      for (const k of MOTION) {
        expect(Number.isFinite(out[k])).toBe(true);
        expect(out[k]).toBe(idle[k]);
      }
    }
  });

  it('NO_INPUT is frozen and spreads into new inputs', () => {
    expect(Object.isFrozen(NO_INPUT)).toBe(true);
    expect({ ...NO_INPUT, throttle: 1 }).toEqual({ throttle: 1, brake: 0, steer: 0, drift: false, boost: false });
  });
});

describe('the guard hook', () => {
  const surge = { ...NO_INPUT, throttle: 1, boost: true };
  const pull = { ...NO_INPUT, throttle: 1 };

  /** The brief's stub: removes all eastward speed and refuses every turn. */
  const fullHold: Guard = {
    cap: (_x, _z, _yaw, vx, vz) => ({ vx: 0, vz, removed: Math.abs(vx) }),
    blocksTurn: () => true,
  };

  /** Caps eastward speed at `limit` (Infinity removes nothing), logging each removal and the yaw `cap` was given. */
  function eastCap(limit: number, blocksTurn = false) {
    const removed: number[] = [];
    const yaws: number[] = [];
    const guard: Guard = {
      cap: (_x, _z, yaw, vx, vz) => {
        yaws.push(yaw);
        removed.push(Math.max(0, vx - limit));
        return { vx: Math.min(vx, limit), vz, removed: removed[removed.length - 1] };
      },
      blocksTurn: () => blocksTurn,
    };
    return { env: { cloud: false, guard }, removed, yaws };
  }

  it('a full hold keeps the heading and position, starts no surge and records the held speed', () => {
    const s = stepChariot(moving(15), { ...surge, steer: 1 }, 1 / 60, { cloud: false, guard: fullHold });
    expect(s.x).toBe(0);
    expect(s.yaw).toBe(0);
    expect(s.boostT).toBe(0);
    expect(s.held).toBeGreaterThanOrEqual(15);
    expect(s.held).toBeLessThanOrEqual(15.1);
  });

  it('blocksTurn keeps the old yaw, and cap is given the yaw it kept', () => {
    const { env, yaws } = eastCap(Infinity, true);
    const s = stepChariot(moving(10), { ...NO_INPUT, steer: 1 }, 1 / 60, env);
    expect(s.yaw).toBe(0);
    expect(yaws).toEqual([0, 0]);
  });

  it('a guard that allows the turn and removes nothing changes nothing', () => {
    const { env } = eastCap(Infinity, false);
    const i = { ...pull, steer: 1 };
    const guarded = stepChariot(moving(10), i, 1 / 60, env);
    expect(guarded).toEqual(stepChariot(moving(10), i, 1 / 60));
    expect(guarded.yaw).toBeLessThan(0);
  });

  it('cap sets the velocity the chariot keeps and moves with', () => {
    const fixed: Guard = { cap: () => ({ vx: 2, vz: -3, removed: 0 }), blocksTurn: () => false };
    const s = stepChariot(moving(15), pull, 1 / 60, { cloud: false, guard: fixed });
    expect([s.vx, s.vz]).toEqual([2, -3]);
    expect(s.x).toBeCloseTo(4 / 120, 12);
    expect(s.z).toBeCloseTo(-6 / 120, 12);
  });

  it('a removal cancels a surge already running', () => {
    const { env } = eastCap(8);
    expect(stepChariot(moving(15, { boostT: 1, cooldown: 5 }), pull, 1 / 60, env).boostT).toBe(0);
  });

  it('held is the largest speed removed during the step, and resets when nothing is removed', () => {
    const { env, removed } = eastCap(8);
    const s = stepChariot(moving(15), pull, 1 / 60, env);
    expect(removed).toHaveLength(2);
    expect(removed[1]).toBeGreaterThan(0);
    expect(s.held).toBe(Math.max(...removed));
    expect(s.held).toBeGreaterThan(removed[1]);
    // Coasting on from the capped 8 m/s, the guard has nothing left to remove.
    expect(stepChariot(s, NO_INPUT, 1 / 60, env).held).toBe(0);
  });

  it('no surge starts from a state the guard held', () => {
    const held = stepChariot(moving(15, { held: 3 }), surge, 1 / 60);
    expect(held.boostT).toBe(0);
    expect(held.held).toBe(0);
    expect(stepChariot(moving(15), surge, 1 / 60).boostT).toBeGreaterThan(0);
  });

  it('a surge requested against a partial hold neither starts nor spends the cooldown', () => {
    const { env } = eastCap(8);
    const s = stepChariot(moving(15), surge, 1 / 60, env);
    expect(s.boostT).toBe(0);
    expect(s.cooldown).toBe(0);
  });

  it('a surge cancelled within 0.2 s of its start is refunded; one cancelled after 1 s keeps its cooldown', () => {
    const { env } = eastCap(8);
    const started = stepChariot(moving(15), surge, 1 / 60);
    expect(started.boostT).toBeGreaterThan(DRIVE.boostTime - 0.2);
    const early = stepChariot(started, pull, 1 / 60, env);
    expect(early.boostT).toBe(0);
    expect(early.cooldown).toBe(0);
    const running = last(run(started, { throttle: 1 }, 59));
    expect(running.boostT).toBeGreaterThan(0);
    const late = stepChariot(running, pull, 1 / 60, env);
    expect(late.boostT).toBe(0);
    expect(late.cooldown).toBeGreaterThan(5.9);
    expect(late.cooldown).toBe(stepChariot(running, pull, 1 / 60).cooldown);
  });
});

describe('the edge hook', () => {
  const surge = { ...NO_INPUT, throttle: 1, boost: true };
  const pull = { ...NO_INPUT, throttle: 1 };

  /** Caps eastward speed at `limit` (Infinity removes nothing), logging each removal and the substep it was given. */
  function eastEdge(limit: number) {
    const removed: number[] = [];
    const steps: number[] = [];
    const edge: Edge = {
      cap: (_x, _z, vx, vz, h) => {
        steps.push(h);
        removed.push(Math.max(0, vx - limit));
        return { vx: Math.min(vx, limit), vz, removed: removed[removed.length - 1] };
      },
    };
    return { env: { cloud: false, edge }, removed, steps };
  }

  it('is given each substep, after the guard, and one that removes nothing changes nothing', () => {
    const { env, steps } = eastEdge(Infinity);
    const i = { ...pull, steer: 1 };
    expect(stepChariot(moving(10), i, 1 / 60, env)).toEqual(stepChariot(moving(10), i, 1 / 60));
    expect(steps).toEqual([1 / 120, 1 / 120]);
    stepChariot(moving(10), i, 0.05, env);
    expect(steps.slice(2)).toEqual(Array(6).fill(0.05 / 6));
    // The guard's capped velocity is what the edge sees.
    const order: string[] = [];
    const guard: Guard = {
      cap: (_x, _z, _yaw, vx, vz) => {
        order.push('guard');
        return { vx: vx / 2, vz, removed: vx / 2 };
      },
      blocksTurn: () => false,
    };
    const seen: number[] = [];
    const edge: Edge = {
      cap: (_x, _z, vx, vz) => {
        order.push('edge');
        seen.push(vx);
        return { vx, vz, removed: 0 };
      },
    };
    stepChariot(moving(16), NO_INPUT, 1 / 120, { cloud: false, guard, edge });
    expect(order).toEqual(['guard', 'edge']);
    expect(seen[0]).toBeLessThan(8.1);
  });

  it('cap sets the velocity the chariot keeps and moves with', () => {
    const fixed: Edge = { cap: () => ({ vx: 2, vz: -3, removed: 0 }) };
    const s = stepChariot(moving(15), pull, 1 / 60, { cloud: false, edge: fixed });
    expect([s.vx, s.vz]).toEqual([2, -3]);
    expect(s.x).toBeCloseTo(4 / 120, 12);
    expect(s.z).toBeCloseTo(-6 / 120, 12);
  });

  it('edgeCut is the largest speed it took off during the step, and held stays 0: the edge is not the ranks', () => {
    const { env, removed } = eastEdge(8);
    const s = stepChariot(moving(15), pull, 1 / 60, env);
    expect(removed).toHaveLength(2);
    expect(s.edgeCut).toBe(Math.max(...removed));
    expect(s.edgeCut).toBeGreaterThan(removed[1]);
    expect(s.held).toBe(0);
    expect(stepChariot(s, NO_INPUT, 1 / 60, env).edgeCut).toBe(0);
    expect(initChariot(0, 0, 0).edgeCut).toBe(0);
  });

  it('a removal cancels a surge already running, as the guard does', () => {
    const { env } = eastEdge(8);
    expect(stepChariot(moving(15, { boostT: 1, cooldown: 5 }), pull, 1 / 60, env).boostT).toBe(0);
  });

  it('no surge starts from a state the edge braked, nor against an edge braking in the same step', () => {
    const braked = stepChariot(moving(15, { edgeCut: 2 }), surge, 1 / 60);
    expect(braked.boostT).toBe(0);
    expect(braked.edgeCut).toBe(0);
    expect(stepChariot(moving(15), surge, 1 / 60).boostT).toBeGreaterThan(0);
    const { env } = eastEdge(8);
    const s = stepChariot(moving(15), surge, 1 / 60, env);
    expect(s.boostT).toBe(0);
    expect(s.cooldown).toBe(0);
  });

  it('a surge cancelled within 0.2 s of its start is refunded; one cancelled after 1 s keeps its cooldown', () => {
    const { env } = eastEdge(8);
    const started = stepChariot(moving(15), surge, 1 / 60);
    expect(started.boostT).toBeGreaterThan(DRIVE.boostTime - 0.2);
    const early = stepChariot(started, pull, 1 / 60, env);
    expect(early.boostT).toBe(0);
    expect(early.cooldown).toBe(0);
    const running = last(run(started, { throttle: 1 }, 59));
    expect(running.boostT).toBeGreaterThan(0);
    const late = stepChariot(running, pull, 1 / 60, env);
    expect(late.boostT).toBe(0);
    expect(late.cooldown).toBeGreaterThan(5.9);
    expect(late.cooldown).toBe(stepChariot(running, pull, 1 / 60).cooldown);
  });
});
