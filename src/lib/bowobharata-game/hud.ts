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
  /** Whole seconds left (rounded up, never below 0), or null with no timer. */
  timer: number | null;
  speedKmh: number;
  surge: { ready: boolean; frac: number };
  sight: { on: boolean; charge: number };
  hint: HintKey | null;
}

/** Seconds a hint stays on the HUD. */
export const HINT_SECONDS = 3.5;
/** Ring fills closer than this count as the same. */
const RING_STEP = 0.01;

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
    surge: { ready: car.cooldown <= 0, frac: clamp(1 - car.cooldown / DRIVE.boostCooldown, 0, 1) },
    sight: { on: sight.on, charge: sight.charge },
    hint: shown.length > 0 && s.clock - s.hintAt < HINT_SECONDS ? shown[shown.length - 1] : null,
  };
}

/** Whether the two snapshots look the same: equal fields, ring fills within RING_STEP. */
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
    Math.abs(a.surge.frac - b.surge.frac) < RING_STEP &&
    a.sight.on === b.sight.on &&
    Math.abs(a.sight.charge - b.sight.charge) < RING_STEP &&
    a.hint === b.hint
  );
}
