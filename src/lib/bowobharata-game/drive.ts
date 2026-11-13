// The chariot's drive model: arcade with weight. Pure: no three.js, no DOM, no clock. Each frame runs equal
// substeps of at most 1/120 s, so frames of 1/120, 1/60 or 0.05 s trace the same path. Units are metres and
// seconds; forward(yaw) is (cos yaw, −sin yaw), and steer +1 turns right, so yaw decreases.
import { clamp, forward, rightOf } from './geom';
import { DRIVE } from './tuning';

export interface ChariotState {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  /** Seconds of Laju (the surge) left. */
  boostT: number;
  /** Seconds until Laju can start again. */
  cooldown: number;
  /** Sliding during the last substep. */
  drifting: boolean;
  /** Seconds the current slide has lasted. */
  driftT: number;
  /** Grip regained since the last slide: 0 is slide grip, 1 full grip. */
  gripK: number;
  /** Seconds left with the throttle cut after a bump. */
  holdOff: number;
  /** Seconds the brake has been held at rest (or rolling back). */
  reverseHold: number;
  /**
   * The largest change of velocity (m/s, |Δv|) the guard made in one substep of the last step: on a single face,
   * the closing speed it removed.
   */
  held: number;
  /** The largest outward speed (m/s) the field's edge took off in one substep of the last step. */
  edgeCut: number;
}

export interface ChariotInput {
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
  boost: boolean;
}

export interface GuardResult {
  vx: number;
  vz: number;
  removed: number;
}

/** Keeps the chariot off the ranks: caps the speed toward them and refuses a turn into them. */
export interface Guard {
  cap(x: number, z: number, yaw: number, vx: number, vz: number): GuardResult;
  blocksTurn(x: number, z: number, fromYaw: number, toYaw: number): boolean;
}

/** Keeps the chariot on the field: caps its speed out across the edge. `h` is the substep's length in seconds. */
export interface Edge {
  cap(x: number, z: number, vx: number, vz: number, h: number): GuardResult;
}

export interface DriveEnv {
  cloud: boolean;
  guard?: Guard;
  edge?: Edge;
}

export const NO_INPUT: Readonly<ChariotInput> = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  boost: false,
});

const CLEAR: DriveEnv = { cloud: false };
/** At or below this forward speed a held brake stops the chariot dead, and holding it counts toward reversing. */
export const REST_SPEED = 0.05;
/** Seconds: a surge the guard or the edge cancels this soon after it starts gets its cooldown back. */
const SURGE_REFUND = 0.2;
/** A pedal or steer reading that is not a finite number counts as 0. */
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

export function initChariot(x: number, z: number, yaw: number): ChariotState {
  return {
    x,
    z,
    yaw,
    vx: 0,
    vz: 0,
    boostT: 0,
    cooldown: 0,
    drifting: false,
    driftT: 0,
    gripK: 1,
    holdOff: 0,
    reverseHold: 0,
    held: 0,
    edgeCut: 0,
  };
}

/** Signed forward speed: negative when rolling backward. */
export function speedOf(s: ChariotState): number {
  const f = forward(s.yaw);
  return s.vx * f.x + s.vz * f.z;
}

/** Sideways speed, positive to the right. */
export function lateralOf(s: ChariotState): number {
  const r = rightOf(s.yaw);
  return s.vx * r.x + s.vz * r.z;
}

export function turnRadius(v: number): number {
  return DRIVE.turnRadiusMin + DRIVE.turnRadiusK * v * v;
}

/** Yaw rate at full steer: the turn circle when moving, a pivot on the spot below 1 m/s. Tightest near 8 m/s. */
export function yawRateFor(vF: number): number {
  const v = Math.abs(vF);
  return Math.max(v / turnRadius(v), DRIVE.pivotRate * Math.max(0, 1 - v));
}

export function refillBoost(s: ChariotState): ChariotState {
  return { ...s, cooldown: 0 };
}

interface ForwardInputs {
  throttle: number;
  brake: number;
  boosting: boolean;
  reversing: boolean;
  sliding: boolean;
  cloud: boolean;
}

/** vF after one substep of engine or surge, overspeed drag, coasting, brake, reverse pull and slide bleed. */
function nextForward(vF: number, h: number, p: ForwardInputs): number {
  // Haze caps a surge too (spec: the speed cap in haze is 9.35 m/s): there the surge curve tops out at the cap.
  const top = p.cloud ? DRIVE.topSpeed * DRIVE.cloudCap : p.boosting ? DRIVE.boostTop : DRIVE.topSpeed;
  let pull = 0; // engine, surge or reverse: may carry vF through zero
  let drag = 0; // friction: opposes vF and stops at zero
  if (vF > top) drag += p.cloud ? DRIVE.cloudDecel : DRIVE.overspeedDrag;
  else pull += p.throttle * (p.boosting ? DRIVE.boostEngine : DRIVE.engine) * (1 - (vF / top) ** 2);
  if (p.throttle === 0 && p.brake === 0) drag += DRIVE.coast + DRIVE.air * vF * vF;
  // The brake and the reverse pull scale with the pedal, as the engine does with the throttle.
  if (p.brake > 0 && vF > REST_SPEED) drag += DRIVE.brake * p.brake;
  if (p.reversing) pull -= DRIVE.reversePull * p.brake * (1 - (vF / -DRIVE.reverseTop) ** 2);
  if (p.sliding) drag += DRIVE.driftBleed;
  const slowed = vF > 0 ? Math.max(0, vF - drag * h) : Math.min(0, vF + drag * h);
  return slowed + pull * h;
}

// Readings behind the pinned numbers: turn after the grip (velocity trails heading); above top speed the drag replaces the engine; gripK recovers before the grip; a surge starts after the guard and the edge and drives from the next substep.
export function stepChariot(s: ChariotState, i: ChariotInput, dt: number, env: DriveEnv = CLEAR): ChariotState {
  const frame = clamp(dt, 0, DRIVE.maxDt);
  const n = Math.ceil(frame / DRIVE.substep - 1e-9);
  const h = n > 0 ? frame / n : 0;
  const throttleIn = clamp(finite(i.throttle), 0, 1);
  const brake = clamp(finite(i.brake), 0, 1);
  const steer = clamp(finite(i.steer), -1, 1);
  const gripScale = env.cloud ? DRIVE.cloudGrip : 1;
  // No surge starts while the guard holds the chariot or the edge brakes it: in the step before this one (here), or
  // earlier in this one (below).
  const mayBoost = i.boost && s.held === 0 && s.edgeCut === 0;
  let { x, z, yaw, vx, vz, boostT, cooldown, drifting, driftT, gripK, holdOff, reverseHold } = s;
  let held = 0;
  let edgeCut = 0;

  for (let k = 0; k < n; k++) {
    const boosting = boostT > 0;
    if (boosting) boostT = Math.max(0, boostT - h);
    let throttle = boosting ? 1 : throttleIn;
    if (holdOff > 0) {
      throttle = 0;
      holdOff = Math.max(0, holdOff - h);
    }

    const f = forward(yaw);
    const r = rightOf(yaw);
    let vF = vx * f.x + vz * f.z;
    let vL = vx * r.x + vz * r.z;

    drifting = i.drift && vF >= DRIVE.driftMinSpeed;
    driftT = drifting ? driftT + h : 0;
    gripK = drifting ? 0 : Math.min(1, gripK + h / DRIVE.gripRecover);
    reverseHold = brake > 0 && vF <= REST_SPEED ? reverseHold + h : 0;

    const reversing = reverseHold >= DRIVE.reverseEngage;
    vF = nextForward(vF, h, { throttle, brake, boosting, reversing, sliding: drifting, cloud: env.cloud });
    // A held brake leaves no crawl, so the chariot is at rest before reverse can engage.
    if (brake > 0 && !reversing && Math.abs(vF) <= REST_SPEED) vF = 0;
    const grip = (DRIVE.driftGrip + (DRIVE.grip - DRIVE.driftGrip) * gripK) * gripScale;
    vL *= Math.exp(-grip * h);
    vx = vF * f.x + vL * r.x;
    vz = vF * f.z + vL * r.z;

    // Rolling back faster than 1 m/s, the same rein turns the nose the other way.
    const reverseSteer = vF < -1 ? -1 : 1;
    const turned = yaw - steer * yawRateFor(vF) * h * (drifting ? DRIVE.driftYaw : 1) * reverseSteer;
    let braked = false;
    if (env.guard) {
      if (!env.guard.blocksTurn(x, z, yaw, turned)) yaw = turned;
      const capped = env.guard.cap(x, z, yaw, vx, vz);
      vx = capped.vx;
      vz = capped.vz;
      if (capped.removed > 0) {
        braked = true;
        held = Math.max(held, capped.removed);
      }
    } else {
      yaw = turned;
    }
    if (env.edge) {
      const capped = env.edge.cap(x, z, vx, vz, h);
      vx = capped.vx;
      vz = capped.vz;
      if (capped.removed > 0) {
        braked = true;
        edgeCut = Math.max(edgeCut, capped.removed);
      }
    }
    if (braked) {
      // A surge cancelled this soon after its start is refunded; it could only have started at cooldown 0.
      if (boostT > DRIVE.boostTime - SURGE_REFUND) cooldown = 0;
      boostT = 0;
    }

    if (mayBoost && held === 0 && edgeCut === 0 && boostT === 0 && cooldown === 0) {
      const heading = forward(yaw);
      if (vx * heading.x + vz * heading.z > 1) {
        boostT = DRIVE.boostTime;
        cooldown = DRIVE.boostCooldown;
      }
    }
    cooldown = Math.max(0, cooldown - h);
    if (drifting && driftT >= DRIVE.driftRefillAfter) cooldown *= Math.exp(-Math.LN2 * h);

    // Semi-implicit Euler: move with the velocity just updated.
    x += vx * h;
    z += vz * h;
  }

  return { x, z, yaw, vx, vz, boostT, cooldown, drifting, driftT, gripK, holdOff, reverseHold, held, edgeCut };
}
