import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import type { KurukshetraScene } from '../src/lib/bowobharata/KurukshetraScene';
import { createContext } from '../src/lib/bowobharata/scene/effects';
import { createDetail } from '../src/lib/bowobharata/scene/materials';
import { gameQuality, qualityFor, type Quality } from '../src/lib/bowobharata/scene/quality';
import { dharmaMix, groundHeight, type Pose } from '../src/lib/bowobharata/stage-math';
import { fovForAspect, orbitView } from '../src/lib/bowobharata-game/chase';
import { NO_INPUT } from '../src/lib/bowobharata-game/drive';
import { angleDiff } from '../src/lib/bowobharata-game/geom';
import { worldDtOf, type FrameInput, type GameState } from '../src/lib/bowobharata-game/engine';
import type { HudSnapshot } from '../src/lib/bowobharata-game/hud';
import { missionFor } from '../src/lib/bowobharata-game/missions';
import type { GameEvent } from '../src/lib/bowobharata-game/mission-run';
import { ANCHORS, SPAWN, TOWER_EXIT } from '../src/lib/bowobharata-game/world';
import { CHASE } from '../src/lib/bowobharata-game/tuning';
import {
  GAP_MS,
  PIXEL_STEPS,
  SCENE_DT_CAP,
  nextPixelRatio,
  progressForMix,
  shouldOfferStill,
  watchFrames,
} from '../src/lib/bowobharata-game/world/perf';
import { createRuntime } from '../src/lib/bowobharata-game/world/runtime';

// No DOM under vitest: a canvas whose 2D context swallows every call, so the texture painters run without drawing.
function stubCanvas() {
  const g: unknown = new Proxy(function () {}, { get: () => g, apply: () => g, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => g }) });
}

beforeEach(stubCanvas);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type FrameListener = (time: number, dt: number) => void;
type Input = Omit<FrameInput, 'aspect'>;

/** Throttle on, and the intro skipped as soon as it allows. */
const DRIVE_ON: Input = { drive: { ...NO_INPUT, throttle: 1 }, sight: false, skip: true, assist: false };
const DESKTOP = gameQuality(qualityFor(false, 2));
const SLUGS_1 = ['a', 'b'];

/** The scene as the runtime sees it, without a renderer: its frame listeners run when the test says. */
function fakeScene(quality: Quality) {
  const ctx = createContext(quality, new THREE.PerspectiveCamera(), createDetail(8));
  const listeners = new Set<FrameListener>();
  /** Every listener ever subscribed, removed or not. */
  const subscribed: FrameListener[] = [];
  const poses: (Pose | null)[] = [];
  const setProgress = vi.fn<(p: number) => void>();
  const game = {
    camera: new THREE.PerspectiveCamera(),
    root: new THREE.Group(),
    setPose: vi.fn((p: Pose | null) => {
      poses.push(p);
    }),
    onFrame: vi.fn((cb: FrameListener) => {
      listeners.add(cb);
      subscribed.push(cb);
      return () => {
        listeners.delete(cb);
      };
    }),
    chariot: { root: new THREE.Group(), setMotion: vi.fn(), pulse: vi.fn() },
    quality,
    textures: { glow: ctx.glow, soft: ctx.soft, shaft: ctx.shaft },
    setTimeScale: vi.fn<(k: number) => void>(),
    setPixelRatio: vi.fn<(r: number) => void>(),
    refreshShadows: vi.fn(),
  };
  const scene: KurukshetraScene = { setProgress, resize: vi.fn(), setPaused: vi.fn(), dispose: vi.fn(), game };
  return { scene, game, setProgress, listeners, subscribed, poses };
}

interface HarnessOpts {
  quality?: Quality;
  input?: () => Input;
  aspect?: number;
  /** Leave out `now`, so the runtime times frames on performance.now. */
  realClock?: boolean;
}

/** A runtime on a fake scene. `frame(dt, realMs)` runs one scene frame: dt real seconds, realMs on the runtime's clock. */
function harness(o: HarnessOpts = {}) {
  const fake = fakeScene(o.quality ?? DESKTOP);
  let ms = 0;
  let time = 0;
  let count = 0;
  /** The frame number of each HUD snapshot. */
  const hudFrames: number[] = [];
  const events: GameEvent[] = [];
  const onHud = vi.fn((_h: HudSnapshot) => {
    hudFrames.push(count);
  });
  const onEvents = vi.fn((e: readonly GameEvent[]) => {
    events.push(...e);
  });
  const onError = vi.fn();
  const onSlow = vi.fn();
  const rt = createRuntime(fake.scene, {
    mobile: false,
    aspect: () => o.aspect ?? 16 / 9,
    readInput: o.input ?? (() => DRIVE_ON),
    onHud,
    onEvents,
    onError,
    onSlow,
    ...(o.realClock ? {} : { now: () => ms }),
  });
  const frame = (dt = 1 / 60, realMs = dt * 1000) => {
    ms += realMs;
    time += dt;
    count++;
    // As the scene does: every listener, in the order they subscribed.
    for (const cb of fake.listeners) cb(time, dt);
  };
  const frames = (n: number, dt?: number, realMs?: number) => {
    for (let k = 0; k < n; k++) frame(dt, realMs);
  };
  /**
   * The scene paused for `gapMs` (a still screen): the clock runs on and no frame comes. On resume the scene restarts its
   * own clock, so the first frame's dt is a short one.
   */
  const pause = (gapMs: number) => {
    ms += gapMs;
    frame(1 / 60);
  };
  return { ...fake, rt, onHud, hudFrames, onEvents, events, onError, onSlow, frame, frames, pause };
}

const xzDist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const poseOf = (car: { x: number; z: number; yaw: number }) => ({ x: car.x, z: car.z, yaw: car.yaw });

describe('perf', () => {
  it('nextPixelRatio steps one step down when the 90-frame average exceeds 36 ms, and never up', () => {
    expect(PIXEL_STEPS).toEqual([1.5, 1.25, 1, 0.85]);
    expect(nextPixelRatio(1.5, 40)).toBe(1.25);
    expect(nextPixelRatio(1.25, 40)).toBe(1);
    expect(nextPixelRatio(1, 40)).toBe(0.85);
    expect(nextPixelRatio(0.85, 40)).toBe(0.85);
    expect(nextPixelRatio(1.25, 20)).toBe(1.25);
    // 36 ms itself holds; a ratio between steps goes to the next below it; one under the lowest stays where it is.
    expect(nextPixelRatio(1.5, 36)).toBe(1.5);
    expect(nextPixelRatio(1.4, 40)).toBe(1.25);
    expect(nextPixelRatio(0.7, 40)).toBe(0.7);
    expect(nextPixelRatio(1.5, NaN)).toBe(1.5);
  });

  it('shouldOfferStill: over 50 ms on average at the lowest pixel ratio', () => {
    expect(shouldOfferStill(55, 0.85)).toBe(true);
    expect(shouldOfferStill(55, 1)).toBe(false);
    expect(shouldOfferStill(45, 0.85)).toBe(false);
    expect(shouldOfferStill(50, 0.85)).toBe(false);
  });

  it('progressForMix inverts dharmaMix: within 1e-6 for every mix from 0 to 1 in steps of 0.05', () => {
    for (let k = 0; k <= 20; k++) {
      const m = k / 20;
      expect(Math.abs(dharmaMix(progressForMix(m)) - m), String(m)).toBeLessThanOrEqual(1e-6);
    }
    expect(progressForMix(1)).toBe(1);
    expect(dharmaMix(progressForMix(2))).toBe(1);
    expect(dharmaMix(progressForMix(-1))).toBe(0);
    expect(dharmaMix(progressForMix(NaN))).toBe(0);
  });
});

describe('watchFrames', () => {
  /**
   * A watch at `ratio`, fed as the scene feeds it: a frame of `ms` real ms has a dt of min(ms / 1000, 0.05) s and moves the
   * clock on by `ms`. Its first frame has no time yet. `steps` holds the frame count at each step.
   */
  function watch(ratio: number) {
    const steps: number[] = [];
    let frames = 0;
    const setPixelRatio = vi.fn<(r: number) => void>(() => {
      steps.push(frames);
    });
    const slow = vi.fn();
    const w = watchFrames(ratio, { setPixelRatio, slow });
    let t = 1000;
    w.frame(0, t);
    const run = (n: number, ms: number) => {
      for (let k = 0; k < n; k++) {
        frames++;
        w.frame(Math.min(ms / 1000, SCENE_DT_CAP), (t += ms));
      }
    };
    /** A paused scene: `ms` on the clock and no frame. The scene restarts its own clock, so the next frame's dt is short. */
    const pause = (ms: number) => {
      t += ms;
      run(1, 16);
    };
    /** A frame that is not counted as one: this dt, with the clock moved by `dMs` (0: stalled; below 0: run back). */
    const raw = (dt: number, dMs: number) => w.frame(dt, (t += dMs));
    return { w, run, pause, raw, steps, setPixelRatio, slow };
  }

  it('takes the scene’s cap on dt: 0.05 s, as its frame clamps it', () => {
    expect(SCENE_DT_CAP).toBe(0.05);
    expect(readFileSync('src/lib/bowobharata/KurukshetraScene.ts', 'utf8')).toContain('const dt = Math.min(ms / 1000 || 0, 0.05);');
  });

  it('steps 1.5 → 1.25 → 1 → 0.85 every 90 frames over 36 ms, then offers the still version once, after 5 s at 0.85', () => {
    const { w, run, setPixelRatio, slow } = watch(1.5);
    run(89, 60);
    expect(setPixelRatio).not.toHaveBeenCalled();
    run(1, 60);
    expect(setPixelRatio.mock.calls).toEqual([[1.25]]);
    run(90, 60);
    run(90, 60);
    expect(setPixelRatio.mock.calls).toEqual([[1.25], [1], [0.85]]);
    expect(w.pixelRatio).toBe(0.85);
    // 5 s of frames at 0.85 (84 of 60 ms) before the offer, not counting any frame from before the last step.
    run(83, 60);
    expect(slow).not.toHaveBeenCalled();
    run(1, 60);
    expect(slow).toHaveBeenCalledTimes(1);
    run(500, 60);
    expect(slow).toHaveBeenCalledTimes(1);
    expect(setPixelRatio).toHaveBeenCalledTimes(3);
  });

  it('never steps on frames of 36 ms or less', () => {
    const { run, setPixelRatio, slow } = watch(1.5);
    run(500, 36);
    expect(setPixelRatio).not.toHaveBeenCalled();
    // The average slides: one slower frame tips it over 36 ms.
    run(1, 45);
    expect(setPixelRatio.mock.calls).toEqual([[1.25]]);
    expect(slow).not.toHaveBeenCalled();
  });

  it('never steps back up once the frames are fast again', () => {
    const { w, run, setPixelRatio, slow } = watch(1.5);
    run(90, 45);
    expect(setPixelRatio.mock.calls).toEqual([[1.25]]);
    run(1000, 10);
    expect(setPixelRatio.mock.calls).toEqual([[1.25]]);
    expect(w.pixelRatio).toBe(1.25);
    expect(slow).not.toHaveBeenCalled();
  });

  it('keeps a pause out of the frame times: a 34 ms device with a 30 s pause never steps', () => {
    const { run, pause, setPixelRatio } = watch(1.5);
    run(300, 34);
    pause(30_000);
    run(300, 34);
    expect(setPixelRatio).not.toHaveBeenCalled();
  });

  it('a 60 ms device still steps down, pause or not', () => {
    const { run, pause, steps, setPixelRatio } = watch(1.5);
    run(89, 60);
    pause(10_000);
    run(100, 60);
    expect(setPixelRatio.mock.calls).toEqual([[1.25], [1]]);
    expect(steps).toEqual([90, 180]);
  });

  it('a 48 ms device at 0.85 that pauses twice within 5 s is not offered the still version', () => {
    const { run, pause, slow } = watch(0.85);
    run(30, 48);
    pause(8000);
    run(30, 48);
    pause(8000);
    run(500, 48);
    expect(slow).not.toHaveBeenCalled();
  });

  it('times a frame that hit the cap by the clock, at most 250 ms: slow frames count in full, a stall as 250 ms', () => {
    expect(GAP_MS).toBe(250);
    const slowDevice = watch(1.5);
    slowDevice.run(90, 120);
    expect(slowDevice.setPixelRatio.mock.calls).toEqual([[1.25]]);
    const stall = watch(1.5);
    stall.run(89, 16);
    stall.run(1, 30_000);
    stall.run(200, 16);
    expect(stall.setPixelRatio).not.toHaveBeenCalled();
  });

  it('skips a frame with no time on its clock, so the steps land as if it were absent', () => {
    const clean = watch(1.5);
    clean.run(89, 40);
    clean.run(95, 40);
    expect(clean.steps).toEqual([90, 180]);
    const noisy = watch(1.5);
    noisy.run(89, 40);
    // Under the cap the dt is the clock: none, or run back.
    for (let k = 0; k < 30; k++) noisy.raw(0, 0);
    noisy.raw(-0.005, -5000);
    noisy.raw(NaN, 40);
    // At the cap the clock's gap is: stalled, or run back.
    for (let k = 0; k < 30; k++) noisy.raw(SCENE_DT_CAP, 0);
    noisy.raw(SCENE_DT_CAP, -5000);
    noisy.run(95, 40);
    expect(noisy.steps).toEqual(clean.steps);
    expect(noisy.setPixelRatio.mock.calls).toEqual([[1.25], [1]]);
  });

  it('never offers the still version to a fast device at the lowest pixel ratio', () => {
    const { run, setPixelRatio, slow } = watch(0.85);
    run(2000, 16);
    expect(setPixelRatio).not.toHaveBeenCalled();
    expect(slow).not.toHaveBeenCalled();
  });

  it('hold(): the next second of frames is not timed, so a stall in it cannot step a 34 ms device', () => {
    const held = watch(1.5);
    held.w.hold();
    held.run(1, 2000);
    held.run(300, 34);
    expect(held.setPixelRatio).not.toHaveBeenCalled();
    const open = watch(1.5);
    open.run(1, 2000);
    open.run(300, 34);
    expect(open.setPixelRatio.mock.calls).toEqual([[1.25]]);
    // A second of 40 ms frames (25) goes untimed; the step then comes on the 90th timed frame.
    const late = watch(1.5);
    late.w.hold();
    late.run(205, 40);
    expect(late.steps).toEqual([115, 205]);
  });
});

describe('runtime', () => {
  it('drives the prologue headless: 120 frames with throttle and an intro skip', () => {
    const h = harness();
    expect(h.game.refreshShadows).toHaveBeenCalledTimes(1);
    h.rt.start(0, [], 1);
    h.frame();
    const from = h.game.chariot.root.position.clone();
    expect(xzDist(from, SPAWN)).toBeLessThan(1e-9);
    h.frames(119);

    const s = h.rt.state()!;
    expect(s.run.phase).toBe('active');
    const root = h.game.chariot.root.position;
    const pose = h.poses.at(-1)!;
    const d = Math.hypot(pose.pos.x - root.x, pose.pos.y - root.y, pose.pos.z - root.z);
    expect(d).toBeGreaterThanOrEqual(8);
    expect(d).toBeLessThanOrEqual(13);
    expect(pose.pos.y).toBeGreaterThan(groundHeight(pose.pos.x, pose.pos.z));
    expect(h.onHud.mock.calls.length).toBeGreaterThanOrEqual(19);
    expect(h.onHud.mock.calls.length).toBeLessThanOrEqual(21);
    expect(root.distanceTo(from)).toBeGreaterThanOrEqual(3);
    expect(h.game.refreshShadows).toHaveBeenCalledTimes(1);
  });

  it('builds the landmarks, the ground detail and the targets into the game root, and binds the chariot to the car', () => {
    const h = harness();
    expect(h.game.root.children.map((c) => c.name).sort()).toEqual(['ground-detail', 'landmarks', 'pickups']);
    h.rt.start(0, [], 1);
    h.frames(90);
    const car = h.rt.state()!.car;
    expect(h.game.chariot.root.position.x).toBeCloseTo(car.x, 9);
    expect(h.game.chariot.root.position.z).toBeCloseTo(car.z, 9);
    expect(h.game.chariot.root.position.y).toBeCloseTo(groundHeight(car.x, car.z), 9);
    expect(h.game.chariot.setMotion).toHaveBeenCalledTimes(90);
  });

  it('sends a HUD at most every 0.1 s of real time, and events only when there are some', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    h.frames(120);
    for (let k = 1; k < h.hudFrames.length; k++) {
      expect((h.hudFrames[k] - h.hudFrames[k - 1]) / 60).toBeGreaterThanOrEqual(0.1 - 1e-9);
    }
    expect(h.onEvents.mock.calls.length).toBeGreaterThan(0);
    for (const [e] of h.onEvents.mock.calls) expect(e.length).toBeGreaterThan(0);
    expect(types(h.events)).toContain('introEnd');
    expect(h.events).toContainEqual({ type: 'hint', key: 'ride' });
  });

  it('sets the time scale, the dawn and the camera from the state each frame', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    h.frames(60);
    expect(h.game.setTimeScale).toHaveBeenCalledTimes(60);
    expect(h.game.setTimeScale).toHaveBeenLastCalledWith(1);
    expect(h.setProgress).toHaveBeenCalledTimes(60);
    expect(h.setProgress).toHaveBeenLastCalledWith(progressForMix(0));
    expect(h.poses).toHaveLength(60);
    // The chase view's FOV, kept for the screen's aspect: 55° at rest, widening with speed.
    expect(h.game.camera.fov).toBeGreaterThanOrEqual(CHASE.fov - 0.05);
    expect(h.game.camera.fov).toBeLessThanOrEqual(CHASE.fovMax);
  });

  it('a frame that throws logs once, calls onError once, unsubscribes and stops advancing', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reads = 0;
    const h = harness({
      input: () => {
        if (++reads === 10) throw new Error('a broken frame');
        return DRIVE_ON;
      },
    });
    h.rt.start(0, [], 1);
    const listening = h.listeners.size;
    h.frames(9);
    const clock = h.rt.state()!.clock;
    expect(clock).toBeGreaterThan(0);
    h.frame();
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(h.listeners.size).toBe(listening - 1);
    h.frames(20);
    // Even called directly, the runtime's frame body does nothing more.
    for (const cb of h.subscribed) cb(99, 1 / 60);
    expect(h.rt.state()!.clock).toBe(clock);
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('an onError that disposes the runtime and the scene ends it cleanly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({
      input: () => {
        throw new Error('a broken frame');
      },
    });
    // As the island would: the runtime first, then the scene, from inside the frame.
    h.onError.mockImplementation(() => {
      h.rt.dispose();
      h.scene.dispose();
    });
    h.rt.start(0, [], 1);
    h.frame();
    expect(h.onError).toHaveBeenCalledTimes(1);
    expect(h.scene.dispose).toHaveBeenCalledTimes(1);
    expect(h.listeners.size).toBe(0);
    expect(h.game.root.children).toEqual([]);
    expect(h.rt.state()).toBeNull();
  });

  it('finale() before any start: lamps lit, full dawn, the camera circling the tower 14 m out', () => {
    const h = harness({ realClock: true });
    const project = vi.spyOn(h.game.camera, 'updateProjectionMatrix');
    h.rt.finale();
    h.frames(10);
    // From the camera's 50° to orbitView's 55° on the first frame; the FOV then holds, so the projection is not rebuilt.
    expect(h.game.camera.fov).toBe(55);
    expect(project).toHaveBeenCalledTimes(1);
    expect(h.rt.state()).toBeNull();
    expect(h.setProgress).toHaveBeenLastCalledWith(progressForMix(1));
    expect(h.poses).toHaveLength(10);
    for (const p of h.poses) expect(Math.abs(xzDist(p!.pos, ANCHORS.tower) - 14)).toBeLessThanOrEqual(0.01);
    // t is the real seconds since finale().
    const last = orbitView(ANCHORS.tower, 10 / 60, groundHeight).pose;
    expect(h.poses.at(-1)!.pos.x).toBeCloseTo(last.pos.x, 9);
    expect(h.poses.at(-1)!.pos.z).toBeCloseTo(last.pos.z, 9);
    expect(h.game.root.getObjectByName('finale-lamps')!.visible).toBe(true);
    expect(h.game.root.getObjectByName('pickups-play')!.visible).toBe(false);
    expect(h.onHud).not.toHaveBeenCalled();
    expect(h.game.setTimeScale).toHaveBeenLastCalledWith(1);
  });

  it('finale() after a chapter stops the engine, the HUD and the events, and keeps a portrait screen 45° wide', () => {
    const aspect = 9 / 19.5;
    const h = harness({ aspect });
    h.rt.start(0, [], 1);
    h.frames(120);
    const clock = h.rt.state()!.clock;
    const huds = h.onHud.mock.calls.length;
    const sent = h.onEvents.mock.calls.length;
    h.rt.finale();
    h.frames(10);
    expect(h.rt.state()!.clock).toBe(clock);
    expect(h.onHud.mock.calls.length).toBe(huds);
    expect(h.onEvents.mock.calls.length).toBe(sent);
    for (const p of h.poses.slice(-10)) expect(Math.abs(xzDist(p!.pos, ANCHORS.tower) - 14)).toBeLessThanOrEqual(0.01);
    expect(h.setProgress).toHaveBeenLastCalledWith(progressForMix(1));
    // orbitView's 55° widened for the screen, so the view stays 45° across.
    const fov = fovForAspect(55, aspect);
    expect(fov).toBeGreaterThan(55);
    expect(h.game.camera.fov).toBeCloseTo(fov, 9);
    const hfov = (2 * Math.atan(Math.tan(((fov / 2) * Math.PI) / 180) * aspect) * 180) / Math.PI;
    expect(hfov).toBeCloseTo(45, 6);
  });

  it('carries the hints shown into the next chapter', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    for (let k = 0; k < 300 && !h.rt.state()!.hintsShown.includes('ride'); k++) h.frame();
    expect(h.events).toContainEqual({ type: 'hint', key: 'ride' });
    h.rt.start(1, SLUGS_1, 1);
    const s = h.rt.state()!;
    expect(s.run.def.chapter).toBe(1);
    expect(s.hintsShown).toContain('ride');
  });

  it('starts chapter 0 at SPAWN, a later chapter where the last left the car, or at TOWER_EXIT before any', () => {
    const h = harness();
    h.rt.start(1, SLUGS_1, 1);
    expect(poseOf(h.rt.state()!.car)).toEqual(poseOf(TOWER_EXIT));
    expect(h.rt.state()!.run.phase).toBe('roam');
    h.frames(60);
    const left = poseOf(h.rt.state()!.car);
    expect(xzDist(left, TOWER_EXIT)).toBeGreaterThan(3);
    h.rt.start(2, ['a', 'b'], 1);
    expect(poseOf(h.rt.state()!.car)).toEqual(left);
    expect(h.rt.state()!.run.def.chapter).toBe(2);
    h.rt.start(0, [], 1);
    expect(poseOf(h.rt.state()!.car)).toEqual(poseOf(SPAWN));
  });

  it('start() puts the finale’s lamps out again', () => {
    const h = harness();
    h.rt.finale();
    h.frames(3);
    h.rt.start(0, [], 1);
    expect(h.game.root.getObjectByName('finale-lamps')!.visible).toBe(false);
    expect(h.game.root.getObjectByName('pickups-play')!.visible).toBe(true);
    const clock = h.rt.state()!.clock;
    h.frames(3);
    expect(h.rt.state()!.clock).toBeGreaterThan(clock);
  });

  it('orbit() holds the chapter and circles the chariot where it stands until the next start', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    h.frames(120);
    const clock = h.rt.state()!.clock;
    const huds = h.onHud.mock.calls.length;
    const at = h.game.chariot.root.position.clone();
    h.rt.orbit();
    h.frames(10);
    expect(h.rt.state()!.clock).toBe(clock);
    expect(h.onHud.mock.calls.length).toBe(huds);
    for (const p of h.poses.slice(-10)) expect(Math.abs(xzDist(p!.pos, at) - 14)).toBeLessThanOrEqual(0.01);
    expect(h.game.setTimeScale).toHaveBeenLastCalledWith(1);
    expect(h.game.root.getObjectByName('finale-lamps')!.visible).toBe(false);
    h.rt.start(1, SLUGS_1, 1);
    h.frame();
    expect(h.rt.state()!.clock).toBeGreaterThan(0);
  });

  it('orbit() before any chapter circles the scene’s chariot', () => {
    const h = harness();
    h.game.chariot.root.position.set(-1.5, 0.4, 9);
    h.rt.orbit();
    h.frames(5);
    expect(h.poses).toHaveLength(5);
    for (const p of h.poses) expect(Math.abs(xzDist(p!.pos, { x: -1.5, z: 9 }) - 14)).toBeLessThanOrEqual(0.01);
    expect(h.onHud).not.toHaveBeenCalled();
  });

  it('retry() returns to the checkpoint at rest; skip() records the rest at once; toMarker() takes the car to the marker', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    h.frames(120);
    expect(xzDist(h.rt.state()!.car, SPAWN)).toBeGreaterThan(3);
    h.rt.retry();
    let s = h.rt.state()!;
    expect(s.run.phase).toBe('active');
    expect(poseOf(s.car)).toEqual(poseOf(SPAWN));
    expect(Math.hypot(s.car.vx, s.car.vz)).toBe(0);

    const before = h.events.length;
    h.rt.skip();
    s = h.rt.state()!;
    expect(s.run.phase).toBe('outro');
    expect(s.run.whole).toBe(false);
    const sent = types(h.events.slice(before));
    expect(sent.filter((t) => t === 'recorded')).toHaveLength(8);
    expect(sent.at(-1)).toBe('outroStart');

    h.rt.start(1, SLUGS_1, 1);
    h.rt.toMarker();
    const marker = missionFor(1, SLUGS_1).marker!;
    expect(xzDist(h.rt.state()!.car, marker)).toBeLessThan(1e-9);
    const at = h.events.length;
    h.frame();
    expect(types(h.events.slice(at))).toContain('introStart');
  });

  it('retry(), skip() and toMarker() before any start do nothing', () => {
    const h = harness();
    h.rt.retry();
    h.rt.skip();
    h.rt.toMarker();
    expect(h.rt.state()).toBeNull();
    expect(h.onEvents).not.toHaveBeenCalled();
  });

  it('offers the version without animation once, on a device at 0.85 that stays at 60 ms a frame for 6 s', () => {
    const h = harness({ quality: { ...DESKTOP, pixelRatio: 0.85 } });
    h.frames(100, 0.05, 60);
    expect(h.onSlow).toHaveBeenCalledTimes(1);
    expect(h.game.setPixelRatio).not.toHaveBeenCalled();
  });

  it('after start() the offer waits out the first second, which is not timed', () => {
    const h = harness({ quality: { ...DESKTOP, pixelRatio: 0.85 } });
    h.rt.start(0, [], 1);
    h.frames(100, 0.05, 60);
    expect(h.onSlow).not.toHaveBeenCalled();
    h.frames(10, 0.05, 60);
    expect(h.onSlow).toHaveBeenCalledTimes(1);
  });

  it('a 34 ms device that pauses on a still screen keeps its pixel ratio', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    h.frames(300, 0.034, 34);
    h.pause(30_000);
    h.frames(300, 0.034, 34);
    expect(h.game.setPixelRatio).not.toHaveBeenCalled();
  });

  it('a 48 ms phone at 0.85 that pauses twice within 5 s is not offered the version without animation', () => {
    const h = harness({ quality: { ...DESKTOP, pixelRatio: 0.85 } });
    h.frames(30, 0.048, 48);
    h.pause(8000);
    h.frames(30, 0.048, 48);
    h.pause(8000);
    h.frames(500, 0.048, 48);
    expect(h.onSlow).not.toHaveBeenCalled();
  });

  it('does not time the first second after start(): a shader-compile stall there cannot step a 34 ms device', () => {
    const h = harness();
    h.frames(10, 0.034, 34);
    h.rt.start(0, [], 1);
    h.frame(0.05, 2000);
    h.frames(300, 0.034, 34);
    expect(h.game.setPixelRatio).not.toHaveBeenCalled();
  });

  it('moves the chariot on the engine’s world time: in Mata’s sight its turn rate is per world second', () => {
    const h = harness({
      input: () => ({ drive: { ...NO_INPUT, throttle: 1, steer: 0.6 }, sight: true, skip: true, assist: false }),
    });
    h.rt.start(1, SLUGS_1, 1);
    const states: GameState[] = [];
    for (let k = 0; k < 90; k++) {
      h.frame();
      states.push(h.rt.state()!);
    }
    const rates = h.game.chariot.setMotion.mock.calls.map(([m]) => m.yawRate);
    let seen = 0;
    for (let k = 1; k < states.length; k++) {
      const s = states[k];
      const turned = angleDiff(s.car.yaw, states[k - 1].car.yaw);
      const want = Math.max(-3, Math.min(3, turned / worldDtOf(1 / 60, s.sight)));
      expect(rates[k]).toBeCloseTo(want, 9);
      if (s.sight.on && Math.abs(want) > 0.1) seen++;
    }
    // Mata was on and the chariot turning for most of it, at half the world's speed.
    expect(seen).toBeGreaterThan(30);
    expect(worldDtOf(1 / 60, { charge: 1, on: true, latch: false })).toBeCloseTo(1 / 120, 12);
    expect(worldDtOf(0.2, { charge: 1, on: false, latch: false })).toBe(0.05);
    expect(worldDtOf(-1, { charge: 1, on: false, latch: false })).toBe(0);
  });

  it('steps the scene’s pixel ratio down on a slow desktop, before any chapter too', () => {
    const h = harness();
    h.frames(91, 0.04, 40);
    expect(h.game.setPixelRatio.mock.calls).toEqual([[1.25]]);
    h.frames(400, 1 / 60, 1000 / 60);
    expect(h.game.setPixelRatio.mock.calls).toEqual([[1.25]]);
    expect(h.onSlow).not.toHaveBeenCalled();
  });

  it('dispose() frees the layers, stops listening and hands the camera back', () => {
    const h = harness();
    h.rt.start(0, [], 1);
    h.frames(5);
    h.rt.dispose();
    expect(h.game.root.children).toEqual([]);
    expect(h.listeners.size).toBe(0);
    expect(h.poses.at(-1)).toBeNull();
    expect(h.game.setTimeScale).toHaveBeenLastCalledWith(1);
    expect(h.rt.state()).toBeNull();
    h.rt.start(0, [], 1);
    h.rt.finale();
    h.rt.dispose();
    expect(h.rt.state()).toBeNull();
  });

  it('needs the scene’s game handle', () => {
    const { scene } = fakeScene(DESKTOP);
    const page: KurukshetraScene = { ...scene, game: undefined };
    expect(() =>
      createRuntime(page, {
        mobile: false,
        aspect: () => 1,
        readInput: () => DRIVE_ON,
        onHud: () => {},
        onEvents: () => {},
        onError: () => {},
        onSlow: () => {},
      }),
    ).toThrow();
  });
});

describe('runtime (source)', () => {
  const src = readFileSync('src/lib/bowobharata-game/world/runtime.ts', 'utf8');
  const perf = readFileSync('src/lib/bowobharata-game/world/perf.ts', 'utf8');
  /** A function's text, from its declaration to its closing brace at the same two-space indent. */
  const body = (decl: string) => {
    const from = src.indexOf(decl);
    expect(from, decl).toBeGreaterThan(-1);
    return src.slice(from, src.indexOf('\n  }\n', from));
  };

  it('wraps the frame body in try/catch', () => {
    const frame = body('function frame(');
    expect(frame).toContain('try {');
    expect(frame).toMatch(/\} catch \(/);
  });

  it('runs the steps of a frame in order', () => {
    const play = body('function play(');
    const at = [
      'o.readInput()',
      'advance(',
      'ground.sync(',
      'pickups.sync(',
      'chariot.sync(',
      'game.setPose(',
      'setFov(',
      'game.setTimeScale(timeScaleOf(',
      'scene.setProgress(progressForMix(mixOf(',
      'o.onHud(',
      'o.onEvents(',
    ].map((s) => [s, play.indexOf(s)] as const);
    for (const [s, i] of at) expect(i, s).toBeGreaterThan(-1);
    const positions = at.map(([, i]) => i);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // The perf watch comes last, after the chapter's steps or the orbit.
    const frame = body('function frame(');
    expect(frame.indexOf('watch.frame(dt, now())')).toBeGreaterThan(frame.indexOf('play('));
  });

  it('rebuilds the projection only when the FOV moves by more than 0.05', () => {
    expect(src.match(/updateProjectionMatrix\(\)/g)).toHaveLength(1);
    expect(src).toMatch(/> 0\.05\) \{[^}]*updateProjectionMatrix\(\)/);
  });

  it('sets the scene’s time scale, and builds the world for the scene’s army', () => {
    expect(src).toContain('setTimeScale(');
    expect(src).toContain('createWorld({ mobile: o.mobile, warriors: game.quality.warriorsPerSide })');
  });

  it('imports nothing from ../copy, ../data or ../record', () => {
    for (const file of [src, perf]) {
      for (const s of ['../copy', '../data', '../record']) {
        expect(file).not.toContain(`'${s}'`);
        expect(file).not.toContain(`"${s}"`);
      }
    }
  });
});
