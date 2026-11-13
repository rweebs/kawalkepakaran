// The HUD snapshot: what the island shows while driving, read from the engine state. Counts, timers and speeds only:
// no name, title, date or other fact. Pure.
import { clamp, dist } from './geom';
import { hullMid } from './collide';
import { timeLeft, totalReal, type HintKey, type Phase, type RunState } from './mission-run';
import type { MissionType } from './missions';
import { DRIVE } from './tuning';
import type { GameState, World } from './engine';

export type ObjectiveKey = 'roam' | 'prologue' | 'collect' | 'tower' | 'gate' | 'course' | 'laps' | 'stop' | 'none';

export interface HudSnapshot {
  phase: Phase;
  chapter: number;
  type: MissionType;
  objective: ObjectiveKey;
  done: number;
  total: number;
  lap: number | null;
  /**
   * Whole seconds left on the lakon or its leg, rounded up (ceil(timeLeft(run) − 1e-9)) and never below 0, from the
   * intro on; null in roam and when the lakon has no timer.
   */
  timer: number | null;
  speedKmh: number;
  /** The ring fills, in hundredths. */
  surge: { ready: boolean; frac: number };
  sight: { on: boolean; charge: number };
  hint: HintKey | null;
}

/** Seconds a hint stays on the HUD. */
export const HINT_SECONDS = 3.5;

/** A ring's fill in hundredths, so equal snapshots compare equal however the fill crept. */
const fill = (x: number) => Math.round(clamp(x, 0, 1) * 100) / 100;

function objectiveOf(s: GameState): ObjectiveKey {
  const { run } = s;
  if (run.phase === 'roam') return 'roam';
  if (run.phase !== 'intro' && run.phase !== 'active') return 'none';
  const step = run.def.steps[run.step];
  if (!step) return 'none';
  switch (step.kind) {
    case 'collect':
      return run.def.chapter === 0 ? 'prologue' : 'collect';
    case 'reach':
      if (dist(hullMid(s.car), step.at) <= step.r) return 'stop';
      return step.place === 'gate' ? 'gate' : 'tower';
    case 'course':
      return 'course';
    case 'laps':
      return 'laps';
  }
}

/** The time left on the lakon or its leg, from the intro on; none in roam or when there is no timer. */
function timerOf(run: RunState): number | null {
  if (run.phase === 'roam') return null;
  const left = timeLeft(run);
  return left === null ? null : Math.max(0, Math.ceil(left - 1e-9));
}

/** The world is unused until the radar (Task 33) reads it. */
export function hudOf(s: GameState, w: World): HudSnapshot {
  const { run, car, sight } = s;
  const shown = s.hintsShown;
  return {
    phase: run.phase,
    chapter: run.def.chapter,
    type: run.def.type,
    objective: objectiveOf(s),
    done: run.recorded.length,
    total: totalReal(run.def),
    lap: null,
    timer: timerOf(run),
    speedKmh: Math.round(Math.hypot(car.vx, car.vz) * 3.6),
    surge: { ready: car.cooldown <= 0, frac: fill(1 - car.cooldown / DRIVE.boostCooldown) },
    sight: { on: sight.on, charge: fill(sight.charge) },
    hint: shown.length > 0 && s.clock - s.hintAt < HINT_SECONDS ? shown[shown.length - 1] : null,
  };
}

/** Whether the two snapshots are the same, field for field (the fills are already in hundredths). */
export function sameHud(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.phase === b.phase &&
    a.chapter === b.chapter &&
    a.type === b.type &&
    a.objective === b.objective &&
    a.done === b.done &&
    a.total === b.total &&
    a.lap === b.lap &&
    a.timer === b.timer &&
    a.speedKmh === b.speedKmh &&
    a.surge.ready === b.surge.ready &&
    a.surge.frac === b.surge.frac &&
    a.sight.on === b.sight.on &&
    a.sight.charge === b.sight.charge &&
    a.hint === b.hint
  );
}

/** Whether the fail shot has run its seconds on the game clock; a paused scene stops the clock, so a paused shot holds. */
export function failShotDone(clock: number, failClock: number | null, seconds: number): boolean {
  return failClock !== null && clock - failClock >= seconds;
}
