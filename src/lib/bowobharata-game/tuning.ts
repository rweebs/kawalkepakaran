export const TUNING = {
  flight: 4.2,
  spacing: 2.6,
  decoyShare: 0.35,
  rampPerChapter: 0.9,
  missLimit: 3,
  decoyLimit: 3,
  sightSlow: 0.35,
  pointsReal: 100,
} as const;

export const DRIVE = {
  topSpeed: 17, cruiseSpeed: 13, boostTop: 25,
  reverseTop: 4, reversePull: 3, reverseEngage: 0.25,
  engine: 7, boostEngine: 17, overspeedDrag: 6,
  coast: 1.2, air: 0.012, brake: 15,
  turnRadiusMin: 4.5, turnRadiusK: 0.055, pivotRate: 0.9,
  grip: 24, driftGrip: 3, driftYaw: 1.4, driftMinSpeed: 8, driftBleed: 2, gripRecover: 0.35,
  boostTime: 1.8, boostCooldown: 7, driftRefillAfter: 0.6,
  cloudCap: 0.55, cloudDecel: 8, cloudGrip: 0.7,
  bumpHoldOff: 0.3, substep: 1 / 120, maxDt: 0.05,
} as const;

/** The guard at the ranks: within `range` m it brakes the chariot at `decel` m/s² so the hull stops `stop` m short. */
export const GUARD = { range: 26, stop: 0.5, decel: 14 } as const;

export const MISSION_TIMING = {
  firstVolley: 20, grace: 45,
  markerR: 5, markerSpeed: 8,
  stopSpeed: 4, stopFor: 1.2, gateStopFor: 1.5,
  introSeconds: 3.5, introSkipAfter: 0.8, outroSeconds: 2.5, failSeconds: 1.2,
  pickupR: 3, decoyR: 2.2,
  gateWidth: 6, gateGap: 3, dayLineHalf: 11.5, postWidth: 8,
  lapMatch: 0.15, maxLaps: 5, retryMinSeconds: 60,
} as const;

/** Krishna's sight: `seconds` of slowed world per full charge, `rechargeSeconds` to refill from empty. */
export const SIGHT = { seconds: 4, rechargeSeconds: 10, minStart: 0.15, worldScale: 0.5 } as const;

/** The chase camera: metres, seconds, rates per second and degrees of FOV. */
export const CHASE = {
  distance: 9.5, distanceAtTop: 11, boostExtra: 1.5,
  height: 7.0, heightAtTop: 6.8, boostLift: 0.6,
  lookAhead: 8, lookAheadPerMs: 0.2, lookAheadMax: 12, lookHeight: 0.8, slipFollow: 0.5,
  yawRate: 4.5, distRate: 3, heightRate: 8, fovRate: 6, boomOutRate: 3,
  fov: 55, fovAtTop: 61, fovBoost: 8, fovMax: 72, hfovMin: 45, fovCap: 90,
  boostIn: 0.15, boostOut: 0.5, groundClear: 1.4, boomMin: 3, boomMargin: 0.5,
  shakeBump: 0.18, shakeDecay: 6, shakeMinImpact: 6,
} as const;
