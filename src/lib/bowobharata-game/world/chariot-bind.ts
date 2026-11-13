// Puts the scene's drivable chariot where the engine's car is, each frame: on the ground at (x, z), turned to its yaw and
// tilted with the ground under it, with a little sway of the body from its acceleration; then the motion that rolls its
// wheels and paces its team. The sway runs on world time, as the car does, so it slows with the world in Krishna's sight.
import { groundHeight } from '../../bowobharata/stage-math';
import type { ChariotRig } from '../../bowobharata/scene/chariot';
import { springStep, type Spring } from '../../bowobharata/scene/motion';
import { angleDiff, clamp, forward, rightOf } from '../geom';
import { speedOf, type ChariotState } from '../drive';

/** Where the ground is sampled for the tilt (m): ± `along` on the heading, ± `across` to the sides (the wheels). */
export const TILT = { along: 1.65, across: 1.08 } as const;
/**
 * The body's sway: a damped spring (stiffness, damping) chasing a lean of so many radians per m/s² of acceleration, held
 * within a limit (rad). The nose lifts on the throttle and dips on the brake; the body leans out of a turn.
 */
export const SWAY = { stiffness: 40, damping: 9, pitchPerAccel: 0.004, pitchMax: 0.05, rollPerAccel: 0.0035, rollMax: 0.06 } as const;
/**
 * A frame that moves the car farther than `metres` plus `speed` m/s over its real time, or turns it faster than `turnRate`
 * rad/s, is a jump (a retry, a teleport, a new chapter): the sway and the turn rate start afresh. No drive comes near
 * either: 25 m/s in a surge, and about 1.4 rad/s in a slide.
 */
const JUMP = { metres: 1, speed: 40, turnRate: 3 } as const;
/** The spring takes steps of at most this (s), so a long frame cannot wind it up. */
const SPRING_STEP = 1 / 60;
const AT_REST: Spring = { angle: 0, vel: 0 };

export interface ChariotBinding {
  /** `realDt`: the frame's real seconds; `worldDt`: the world's, the time the engine moved the car by. */
  sync(car: ChariotState, realDt: number, worldDt: number): void;
}

/** A dt that is not a finite positive number counts as 0. */
const seconds = (dt: number) => (Number.isFinite(dt) && dt > 0 ? dt : 0);

export function bindChariot(rig: ChariotRig): ChariotBinding {
  let last: Pick<ChariotState, 'x' | 'z' | 'yaw' | 'vx' | 'vz'> | null = null;
  let pitch = AT_REST;
  let roll = AT_REST;

  return {
    sync(car, realDt, worldDt) {
      const real = seconds(realDt);
      const dt = seconds(worldDt);
      const f = forward(car.yaw);
      const r = rightOf(car.yaw);
      const turned = last ? angleDiff(car.yaw, last.yaw) : 0;
      let yawRate = 0;
      if (!last || Math.hypot(car.x - last.x, car.z - last.z) > JUMP.metres + JUMP.speed * real || Math.abs(turned) > JUMP.turnRate * real) {
        pitch = AT_REST;
        roll = AT_REST;
      } else if (dt > 0) {
        const ax = (car.vx - last.vx) / dt;
        const az = (car.vz - last.vz) / dt;
        const pitchTo = clamp((ax * f.x + az * f.z) * SWAY.pitchPerAccel, -SWAY.pitchMax, SWAY.pitchMax);
        // The sideways acceleration points into the turn, and the body leans the other way.
        const rollTo = clamp(-(ax * r.x + az * r.z) * SWAY.rollPerAccel, -SWAY.rollMax, SWAY.rollMax);
        const n = Math.ceil(dt / SPRING_STEP - 1e-9);
        for (let k = 0; k < n; k++) {
          pitch = springStep(pitch, pitchTo, dt / n, SWAY.stiffness, SWAY.damping);
          roll = springStep(roll, rollTo, dt / n, SWAY.stiffness, SWAY.damping);
        }
        yawRate = clamp(turned / dt, -JUMP.turnRate, JUMP.turnRate);
      }
      last = { x: car.x, z: car.z, yaw: car.yaw, vx: car.vx, vz: car.vz };

      const h = (along: number, across: number) => groundHeight(car.x + f.x * along + r.x * across, car.z + f.z * along + r.z * across);
      // About the chariot's right axis (+z) a positive angle lifts the nose; about its nose (+x), it tips the top to the right.
      const groundPitch = Math.atan2(h(TILT.along, 0) - h(-TILT.along, 0), 2 * TILT.along);
      const groundRoll = Math.atan2(h(0, -TILT.across) - h(0, TILT.across), 2 * TILT.across);
      rig.root.position.set(car.x, groundHeight(car.x, car.z), car.z);
      // Yaw, then pitch about the turned right axis, then roll about the nose: the nose stays on forward(yaw) seen from above.
      rig.root.rotation.set(
        groundRoll + clamp(roll.angle, -SWAY.rollMax, SWAY.rollMax),
        car.yaw,
        groundPitch + clamp(pitch.angle, -SWAY.pitchMax, SWAY.pitchMax),
        'YZX',
      );
      rig.setMotion({ speed: speedOf(car), yawRate, boost: car.boostT > 0 });
    },
  };
}
