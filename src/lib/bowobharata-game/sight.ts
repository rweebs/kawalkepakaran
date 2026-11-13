// Krishna's sight (Mata): a charge that drains in real time while it is on and refills while it is off. Pure.
import { SIGHT } from './tuning';

export interface Sight {
  charge: number;
  on: boolean;
  /** Set when the charge ran out while the button was held; the button must be released before it can turn on again. */
  latch: boolean;
}

export function initSight(): Sight {
  return { charge: 1, on: false, latch: false };
}

/** One step in real seconds (not world seconds). It turns on only from SIGHT.minStart and a fresh press, and off when the charge is spent. */
export function stepSight(s: Sight, wantOn: boolean, realDt: number): Sight {
  const dt = Number.isFinite(realDt) && realDt > 0 ? realDt : 0;
  const on = wantOn && !s.latch && (s.on ? s.charge > 1e-9 : s.charge >= SIGHT.minStart);
  const raw = s.charge + (on ? -dt / SIGHT.seconds : dt / SIGHT.rechargeSeconds);
  const charge = Math.min(1, Math.max(0, raw));
  const nextOn = on && charge > 1e-9;
  return { charge, on: nextOn, latch: wantOn && (s.latch || (s.on && !nextOn)) };
}

export function worldScale(s: Sight): number {
  return s.on ? SIGHT.worldScale : 1;
}
