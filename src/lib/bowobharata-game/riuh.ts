// Riuh, the clamour: the pressure value that later becomes volleys, clouds and radar static. Pure.
import { RIUH, RIUH_LEVELS } from './tuning';

export interface Riuh {
  value: number;
  /** The time the self-rise floor counts from. */
  floorT: number;
  /** The time of the last rise (a kick or watching; the floor catching up does not count). */
  quietT: number;
  frozen: boolean;
}

export type RiuhKick = 'rewriteTaken' | 'recorded' | 'filed' | 'delivered';

export interface RiuhInput {
  t: number;
  watched: boolean;
  shelter: boolean;
  /** Multiplier on both decay rates; default 1. */
  decayK?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function initRiuh(o: { start?: number; frozen?: boolean; t?: number } = {}): Riuh {
  const t = o.t ?? 0;
  const frozen = !!o.frozen;
  return { value: frozen ? 0 : clamp(o.start ?? 0, 0, RIUH.max), floorT: t, quietT: t, frozen };
}

/** The value the clamour never falls below: it rises on its own once `ambientDelay` has passed since `floorT`. */
export function riuhFloor(r: Riuh, t: number): number {
  return Math.min(RIUH.ambientCap, Math.max(0, (t - r.floorT - RIUH.ambientDelay) / RIUH.ambientPer));
}

/** The floor as the value sees it: during the grace nothing is held above `graceCap`. */
function effectiveFloor(r: Riuh, t: number): number {
  const f = riuhFloor(r, t);
  return t < RIUH.grace ? Math.min(f, RIUH.graceCap) : f;
}

export function kickRiuh(r: Riuh, k: RiuhKick, t: number): Riuh {
  if (r.frozen) return r;
  const next: Riuh = { ...r };
  if (k === 'recorded') next.floorT = r.floorT + RIUH.recordedDelay;
  else if (k === 'delivered') next.floorT = t;
  let v = r.value + RIUH[k];
  if (RIUH[k] > 0 && t < RIUH.grace) v = Math.min(v, Math.max(r.value, RIUH.graceCap));
  v = Math.max(clamp(v, 0, RIUH.max), effectiveFloor(next, t));
  next.value = v;
  if (v > r.value) next.quietT = t;
  return next;
}

/** One step to time `t` (the end of the step), `dt` world seconds long. */
export function stepRiuh(r: Riuh, i: RiuhInput, dt: number): Riuh {
  if (r.frozen) return r;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const k = i.decayK ?? 1;
  const inGrace = i.t < RIUH.grace;
  let v = r.value;
  let quietT = r.quietT;
  if (i.shelter) {
    v -= RIUH.shelterDecay * k * step;
  } else if (i.watched) {
    // Watching is pressure: it rises toward its cap and holds there, so nothing decays meanwhile.
    const cap = inGrace ? Math.min(RIUH.watchedCap, RIUH.graceCap) : RIUH.watchedCap;
    if (v < cap) v = Math.min(cap, v + RIUH.watched * step);
    quietT = i.t;
  } else {
    // Only the part of the step after the quiet delay decays, so the result does not depend on the step size.
    const quiet = Math.max(0, Math.min(step, i.t - (quietT + RIUH.quietDelay)));
    v -= RIUH.decay * k * quiet;
  }
  v = clamp(Math.max(v, effectiveFloor(r, i.t)), 0, RIUH.max);
  return { ...r, value: v, quietT };
}

export function riuhLevel(v: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return clamp(Math.floor(Number.isFinite(v) ? v : 0), 0, 5) as 0 | 1 | 2 | 3 | 4 | 5;
}

export function levelEffects(level: number): { volleyEvery: number | null; clouds: boolean; radarStatic: number } {
  const e = RIUH_LEVELS[clamp(Math.floor(level), 0, RIUH_LEVELS.length - 1)];
  return { volleyEvery: e.volleyEvery, clouds: e.clouds, radarStatic: e.radarStatic };
}
