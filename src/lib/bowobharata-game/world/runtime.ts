// Drives the scene from the engine, inside the scene's own frame loop: it reads the player's input, steps the engine, draws
// the world's layers and the chariot from the new state, points the camera (the chase view or a lakon shot), sets the
// scene's time scale and dawn, and reports the HUD and the game's events to the island. It also watches the frame rate:
// the pixel ratio steps down on a slow device, and one that stays slow is offered the version without animation. Between
// chapters the camera circles the chariot; in the finale it circles Sanjaya's tower. The engine stays pure (the runtime
// only feeds it), and nothing here draws text: names, titles and facts belong to the island's still screens.
import type { KurukshetraScene } from '../../bowobharata/KurukshetraScene';
import type { XZ } from '../geom';
import { fovForAspect, orbitView } from '../chase';
import {
  DEFAULT_ASPECT,
  advance,
  createWorld,
  mixOf,
  retryFromCheckpoint,
  skipToRecord,
  startChapter,
  teleportToMarker,
  timeScaleOf,
  viewOf,
  worldDtOf,
  type FrameInput,
  type GameState,
} from '../engine';
import { hudOf, type HudSnapshot } from '../hud';
import type { GameEvent } from '../mission-run';
import { missionFor } from '../missions';
import { ANCHORS, SPAWN, TOWER_EXIT } from '../world';
import { bindChariot } from './chariot-bind';
import { createGround } from './ground3d';
import { createLandmarks } from './landmarks3d';
import { progressForMix, watchFrames } from './perf';
import { createPickups } from './pickups3d';
import type { SceneGame } from './types';

export interface RuntimeOpts {
  mobile: boolean;
  /** The canvas's width over its height, read each frame. */
  aspect(): number;
  /** The player's input for this frame; the runtime adds the aspect. */
  readInput(): Omit<FrameInput, 'aspect'>;
  /** The HUD's snapshot while a chapter runs, at least 0.1 s of real time apart. */
  onHud(h: HudSnapshot): void;
  /** A frame's events when there are any; the skip's at once. */
  onEvents(e: readonly GameEvent[]): void;
  /** Called once, on the first error in a frame: the runtime has stopped listening to the scene. */
  onError(): void;
  /** Called once, when the device stays slow at the lowest pixel ratio: the island offers the version without animation. */
  onSlow(): void;
  /** The real clock (ms) that times the frames for the pixel ratio; performance.now by default. */
  now?(): number;
}

export interface Runtime {
  /** A chapter's lakon: the prologue from SPAWN, any other from where the last left the car (TOWER_EXIT before any). */
  start(chapter: number, slugs: readonly string[], seed: number): void;
  /** Holds the chapter and circles the chariot where it stands, until the next start or retry. */
  orbit(): void;
  /** Back to the lakon's last checkpoint, as a failed lakon is retried; nothing before the lakon has one. */
  retry(): void;
  /** Records the rest of the lakon and goes to its outro; its events are sent at once. */
  skip(): void;
  /** In roam, the chariot to the lakon's marker. */
  toMarker(): void;
  /** The finale, with or without a chapter played: the engine rests and the camera circles Sanjaya's tower at full dawn. */
  finale(): void;
  state(): GameState | null;
  dispose(): void;
}

/** Real seconds between HUD snapshots, at least. A start or a retry sends one on its first frame. */
const HUD_EVERY = 0.1;

/** play: the chapter runs. orbit and finale: the camera circles a point while the engine, the layers and the HUD rest. */
type Mode = 'play' | 'orbit' | 'finale';

function gameOf(scene: KurukshetraScene): SceneGame {
  if (!scene.game) throw new Error('createRuntime: the scene was made without game mode');
  return scene.game;
}

export function createRuntime(scene: KurukshetraScene, o: RuntimeOpts): Runtime {
  const game = gameOf(scene);
  const now = o.now ?? (() => performance.now());
  const world = createWorld({ mobile: o.mobile, warriors: game.quality.warriorsPerSide });
  const landmarks = createLandmarks(game);
  const ground = createGround(game, o.mobile);
  const pickups = createPickups(game);
  const chariot = bindChariot(game.chariot);
  game.refreshShadows();
  const watch = watchFrames(game.quality.pixelRatio, {
    setPixelRatio: (r) => game.setPixelRatio(r),
    slow: () => o.onSlow(),
  });

  let current: GameState | null = null;
  let mode: Mode = 'play';
  /** The point the camera circles in orbit and the finale, and the real seconds it has circled it. */
  let around: XZ = { x: ANCHORS.tower.x, z: ANCHORS.tower.z };
  let circled = 0;
  let sinceHud = Infinity;
  let failed = false;
  let disposed = false;

  /** The screen's aspect, or the engine's default while the canvas has no size. */
  function aspectNow(): number {
    const a = o.aspect();
    return Number.isFinite(a) && a > 0 ? a : DEFAULT_ASPECT;
  }

  /** The camera's FOV, set (and its projection rebuilt) only when it moves by more than 0.05°. */
  function setFov(fov: number): void {
    const cam = game.camera;
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** Steps 1–9: one frame of the chapter, from the input to the events. */
  function play(s: GameState, time: number, real: number): void {
    // 1–2. The input, then the engine.
    const aspect = aspectNow();
    const input = o.readInput();
    const out = advance(s, { ...input, aspect }, real, world);
    const next = out.state;
    current = next;
    // 3–4. The layers on the scene's clock; then the chariot, which the car moved on world time (slowed in Mata's sight).
    ground.sync(next, time);
    pickups.sync(next, time);
    chariot.sync(next.car, real, worldDtOf(real, next.sight));
    // 5. The camera: the chase view or the lakon's shot.
    const view = viewOf(next, world, aspect);
    game.setPose(view.pose);
    setFov(view.fov);
    // 6–7. Mata's and the outro's slow motion, and Parva 8's dawn.
    game.setTimeScale(timeScaleOf(next));
    scene.setProgress(progressForMix(mixOf(next)));
    // 8–9. The HUD, at most every 0.1 s of real time (a hair under, so float sums of the frames' dt still reach it); the events.
    sinceHud += real;
    if (sinceHud >= HUD_EVERY - 1e-9) {
      sinceHud = 0;
      o.onHud(hudOf(next, world));
    }
    if (out.events.length > 0 && !disposed) o.onEvents(out.events);
  }

  /** Orbit and the finale: the camera circles `around`, `circled` real seconds on, widened for a narrow screen. */
  function circle(real: number): void {
    circled += real;
    const view = orbitView(around, circled, world.ground);
    game.setPose(view.pose);
    setFov(fovForAspect(view.fov, aspectNow()));
  }

  /** The frame body, run by the scene before it draws. `dt` is real seconds, which the scene caps at 0.05. */
  function frame(time: number, dt: number): void {
    if (failed || disposed) return;
    try {
      const real = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (mode !== 'play') circle(real);
      else if (current) play(current, time, real);
      // 10. The frame rate: the scene's dt, which leaves its pauses out; the real clock only when that dt hit its 50 ms cap.
      if (!disposed) watch.frame(dt, now());
    } catch (err) {
      fail(err);
    }
  }

  const stopFrames = game.onFrame(frame);

  /** The first error: the frame body stops listening, the error is logged once and the island is told. */
  function fail(err: unknown): void {
    if (failed) return;
    failed = true;
    stopFrames();
    console.error('BOWOBHARATA: the game runtime stopped on an error in a frame.', err);
    o.onError();
  }

  function circleAround(at: XZ, next: Mode): void {
    mode = next;
    around = { x: at.x, z: at.z };
    circled = 0;
    game.setTimeScale(1);
  }

  return {
    start(chapter, slugs, seed) {
      if (disposed) return;
      const def = missionFor(chapter, slugs);
      const from = chapter === 0 ? SPAWN : (current?.car ?? TOWER_EXIT);
      const fresh = startChapter(def, { x: from.x, z: from.z, yaw: from.yaw }, seed, world);
      // Each hint fires once a session: the ones shown so far go on into the new chapter.
      current = current ? { ...fresh, hintsShown: [...current.hintsShown] } : fresh;
      mode = 'play';
      sinceHud = Infinity;
      // The chapter's first second is not timed: the shaders of what it shows compile then.
      watch.hold();
      pickups.setFinale(false);
    },
    orbit() {
      if (disposed) return;
      const p = game.chariot.root.position;
      circleAround({ x: p.x, z: p.z }, 'orbit');
    },
    retry() {
      if (disposed || !current?.run.checkpoint) return;
      current = retryFromCheckpoint(current, world);
      mode = 'play';
      sinceHud = Infinity;
    },
    skip() {
      if (disposed || !current) return;
      const out = skipToRecord(current);
      current = out.state;
      if (out.events.length > 0) o.onEvents(out.events);
    },
    toMarker() {
      if (disposed || !current) return;
      current = teleportToMarker(current, world);
    },
    finale() {
      if (disposed) return;
      circleAround(ANCHORS.tower, 'finale');
      pickups.setFinale(true);
      scene.setProgress(progressForMix(1));
    },
    state: () => current,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopFrames();
      pickups.dispose();
      ground.dispose();
      landmarks.dispose();
      game.setPose(null);
      game.setTimeScale(1);
      current = null;
    },
  };
}
