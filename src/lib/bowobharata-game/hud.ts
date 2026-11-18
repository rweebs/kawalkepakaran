// The HUD snapshot: what the island shows while driving, read from the engine state. Counts, timers, speeds, the
// clamour and the radar's positions only: no name, title, date or other fact. Pure.
import { clamp, dist } from './geom';
import { hullMid } from './collide';
import { speedOf } from './drive';
import { leavablePhase, timeLeft, totalReal, type HintKey, type Phase, type RunState } from './mission-run';
import type { MissionType } from './missions';
import { RADAR_PX, bearingOf, easeRange, radarItems, radarRange, sameRadar, type RadarItem } from './radar';
import { levelEffects, riuhLevel } from './riuh';
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
  /** The lap under way while a lap course is ridden, from 1; null otherwise. */
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
  /** The clamour, 0 to 5, as the engine holds it. It moves only in the active lakon: 0 in roam. */
  riuh: number;
  /** Its whole level, 0 to 5. */
  level: number;
  /**
   * The share of the radar's inner radius, in from its edge, that the level's static covers: 0, 0.3 at level 4, 0.45 at
   * level 5. Sight sees through it: with sight on, the radar shows what lies under it.
   */
  staticFrac: number;
  /** What the radar shows, on its RADAR_PX square, in drawing order (radarItems). */
  radar: RadarItem[];
  /**
   * The radar's range in metres, at its inner radius: radarRange of the chariot's forward speed, eased from the last
   * snapshot's with a lag of RANGE_LAG (1 s); the speed's own on a first snapshot. The radar is drawn at it.
   */
  radarM: number;
  /** The chariot's heading as a compass bearing in whole degrees: 0 north, 90 east, clockwise. */
  heading: number;
  /** Whether a finished lakon's replay runs (Task 36), for score only: the HUD says so in place of a hint. */
  replay: boolean;
}

/**
 * Seconds a hint stays on the HUD. The sight lesson stays longer while it follows its copy (GameState.hintCopy, set
 * only while that lesson is the last hint fired): until the chariot meets the copy, and at most SIGHT_LESSON.most s.
 */
export const HINT_SECONDS = 3.5;
/** The clamour changes the snapshot once it moves by more than this. */
const RIUH_SHOWN = 0.05;

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
      // Once two laps match, what is left of the step is its record.
      return run.matched ? 'collect' : 'laps';
  }
}

/** The lap under way (1 before P1 is first crossed) while the laps are ridden, from the intro on; otherwise null. */
function lapOf(run: RunState): number | null {
  if (run.phase !== 'intro' && run.phase !== 'active') return null;
  return run.def.steps[run.step]?.kind === 'laps' && !run.matched ? run.laps.length + 1 : null;
}

/** The time left on the lakon or its leg, from the intro on; none in roam or when there is no timer. */
function timerOf(run: RunState): number | null {
  if (run.phase === 'roam') return null;
  const left = timeLeft(run);
  return left === null ? null : Math.max(0, Math.ceil(left - 1e-9));
}

/**
 * The snapshot of this frame; the world gives the radar its ranks and shelters. `prev` is the snapshot sent before this
 * one and `dt` the real seconds since it: the radar's range eases on from prev's, and a place prev did not show appears
 * only HOLD m within the radar's edge (radarItems). Without prev (the first snapshot of a start or a retry), the range is
 * the speed's and nothing is held.
 */
export function hudOf(s: GameState, w: World, prev?: HudSnapshot, dt = 0): HudSnapshot {
  const { run, car, sight } = s;
  const shown = s.hintsShown;
  const level = riuhLevel(s.riuh.value);
  const target = radarRange(speedOf(car));
  const radarM = prev ? easeRange(prev.radarM, target, dt) : target;
  return {
    phase: run.phase,
    chapter: run.def.chapter,
    type: run.def.type,
    objective: objectiveOf(s),
    done: run.recorded.length,
    total: totalReal(run.def),
    lap: lapOf(run),
    timer: timerOf(run),
    speedKmh: Math.round(Math.hypot(car.vx, car.vz) * 3.6),
    surge: { ready: car.cooldown <= 0, frac: fill(1 - car.cooldown / DRIVE.boostCooldown) },
    sight: { on: sight.on, charge: fill(sight.charge) },
    hint: shown.length > 0 && (s.clock - s.hintAt < HINT_SECONDS || s.hintCopy !== null) ? shown[shown.length - 1] : null,
    riuh: s.riuh.value,
    level,
    staticFrac: levelEffects(level).radarStatic,
    radar: radarItems(s, w, RADAR_PX, radarM, prev?.radar),
    radarM,
    heading: bearingOf(car.yaw),
    replay: s.roam !== null && s.roam.aside !== null,
  };
}

/**
 * Whether the two snapshots look the same, field for field (the fills are already in hundredths): the clamour within
 * RIUH_SHOWN, the radar's range in whole metres, and its items as sameRadar has them (no move of a pixel or more).
 */
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
    a.hint === b.hint &&
    Math.abs(a.riuh - b.riuh) <= RIUH_SHOWN &&
    a.level === b.level &&
    a.staticFrac === b.staticFrac &&
    Math.round(a.radarM) === Math.round(b.radarM) &&
    a.heading === b.heading &&
    a.replay === b.replay &&
    sameRadar(a.radar, b.radar)
  );
}

/**
 * Whether the pause panel offers the way out of a replay (Task 38): only while a replay runs its intro or its active part
 * (`leavablePhase`, which the engine's leaveReplay asks too). The island asks it of the live state as the game pauses,
 * not of its last HUD snapshot: snapshots come at most every 0.1 s, so the last can still show the active part for a few
 * frames into the outro, where a leave would turn the finished score into 0.
 */
export function leaveOffered(s: Pick<GameState, 'run' | 'roam'> | null | undefined): boolean {
  return !!s?.roam?.aside && leavablePhase(s.run.phase);
}

/** Whether the fail shot has run its seconds on the game clock; a paused scene stops the clock, so a paused shot holds. */
export function failShotDone(clock: number, failClock: number | null, seconds: number): boolean {
  return failClock !== null && clock - failClock >= seconds;
}
