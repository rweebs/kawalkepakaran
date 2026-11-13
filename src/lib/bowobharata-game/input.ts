// The player's keyboard as the chariot's input. Keys are read by `KeyboardEvent.code`, so the layout (QWERTY, AZERTY)
// does not move them. The steer ramps toward the held direction and back to the centre, so a tap turns a little and a
// held key turns fully; easy control drives at the cruise speed by itself. Pure: no DOM, no clock; the island keeps the
// held keys and the last steer, and passes the frame's real seconds. Steer +1 turns right.
import { clamp } from './geom';
import type { ChariotInput } from './drive';
import { DRIVE } from './tuning';

/** Each action and the keys that drive it, by `KeyboardEvent.code`. */
export const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  drift: ['Space'], boost: ['ShiftLeft', 'ShiftRight'],
  sight: ['KeyK'], skip: ['Enter', 'KeyE'], pause: ['Escape', 'KeyP'],
} as const;

export type KeyAction = keyof typeof KEYMAP;
export const KEY_ACTIONS = Object.keys(KEYMAP) as KeyAction[];

/** Steer per second toward a held direction, and back toward the centre (faster, so the chariot straightens briskly). */
export const STEER_IN = 5;
export const STEER_OUT = 7;

const ACTION_OF: ReadonlyMap<string, KeyAction> = new Map(KEY_ACTIONS.flatMap((a) => KEYMAP[a].map((code) => [code, a] as const)));

/** The action a key drives, or null for a key the game leaves alone. */
export function keyAction(code: string): KeyAction | null {
  return ACTION_OF.get(code) ?? null;
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);
const held = (codes: ReadonlySet<string>, a: KeyAction) => KEYMAP[a].some((code) => codes.has(code));

/**
 * The steer `dt` seconds on from `cur` toward `target`: back toward the centre at STEER_OUT per second (all the way when
 * the target lies on the other side, else down to the target), then out toward the target at STEER_IN, the frame's time
 * split between the two. A value that is not finite counts as 0; both ends are kept within ±1.
 */
export function steerToward(cur: number, target: number, dt: number): number {
  let c = clamp(finite(cur), -1, 1);
  const t = clamp(finite(target), -1, 1);
  let left = Number.isFinite(dt) && dt > 0 ? dt : 0;
  if (c !== 0 && (Math.sign(t) !== Math.sign(c) || Math.abs(t) < Math.abs(c))) {
    const stop = Math.sign(t) === Math.sign(c) ? t : 0;
    const need = Math.abs(c - stop) / STEER_OUT;
    if (left < need - 1e-9) return c - Math.sign(c) * STEER_OUT * left;
    c = stop;
    left = Math.max(0, left - need);
  }
  const need = Math.abs(t - c) / STEER_IN;
  return left >= need - 1e-9 ? t : c + Math.sign(t - c) * STEER_IN * left;
}

/** Easy control's throttle: full below the cruise speed, easing off over the last 3 m/s, none at it or above. A speed
 * that is not finite gives none. */
export function cruiseThrottle(speed: number, target: number = DRIVE.cruiseSpeed): number {
  if (!Number.isFinite(speed)) return 0;
  return clamp((target - speed) / 3, 0, 1);
}

/**
 * One frame of the keyboard: the held codes, the steer of the frame before and the frame's real seconds. In easy control
 * the throttle is `cruiseThrottle` at the chariot's forward speed, cut while the brake is held so the chariot can stop
 * and reverse. `skip` reports a skip key held; the island turns a fresh press into a one-frame skip.
 */
export function keyboardInput(
  codes: ReadonlySet<string>,
  prevSteer: number,
  dt: number,
  easy: { on: boolean; speed: number },
): { drive: ChariotInput; sight: boolean; skip: boolean } {
  const brake = held(codes, 'brake') ? 1 : 0;
  const throttle = easy.on ? (brake ? 0 : cruiseThrottle(easy.speed)) : held(codes, 'throttle') ? 1 : 0;
  const target = (held(codes, 'right') ? 1 : 0) - (held(codes, 'left') ? 1 : 0);
  return {
    drive: {
      throttle,
      brake,
      steer: steerToward(prevSteer, target, dt),
      drift: held(codes, 'drift'),
      boost: held(codes, 'boost'),
    },
    sight: held(codes, 'sight'),
    skip: held(codes, 'skip'),
  };
}
