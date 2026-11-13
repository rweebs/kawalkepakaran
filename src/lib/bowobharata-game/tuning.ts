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
