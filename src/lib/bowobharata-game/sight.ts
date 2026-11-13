// Krishna's sight (Mata): a charge that drains in real time while it is on and refills while it is off. Pure.
import { SIGHT } from './tuning';

export interface Sight {
  charge: number;
  on: boolean;
}

export function initSight(): Sight {
  return { charge: 1, on: false };
}

/** One step in real seconds (not world seconds). It turns on only from SIGHT.minStart, and off when the charge is spent. */
export function stepSight(s: Sight, wantOn: boolean, realDt: number): Sight {
  const on = wantOn && (s.on ? s.charge > 1e-9 : s.charge >= SIGHT.minStart);
  const raw = s.charge + (on ? -realDt / SIGHT.seconds : realDt / SIGHT.rechargeSeconds);
  const charge = Math.min(1, Math.max(0, raw));
  return { charge, on: on && charge > 1e-9 };
}

export function worldScale(s: Sight): number {
  return s.on ? SIGHT.worldScale : 1;
}
