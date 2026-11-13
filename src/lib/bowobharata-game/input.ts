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

// Touch and gamepad. Both read the same drive input as the keyboard; the island merges the three (mergeInputs).

/** Finger travel (px) inside which the steer stays 0, and at which it reaches full lock. */
export const TOUCH_STEER = { dead: 6, full: 56 } as const;
/** A brake held through a turn at least this sharp, above this speed (m/s), pulls the reins instead of braking. */
const SLIDE = { steer: 0.6, speed: 10 } as const;
const PAD_DEAD = 0.15;

/** The steer for a finger that has slid `dxPx` from where it landed: 0 inside 6 px, linear to ±1 at 56 px. */
export function touchSteer(dxPx: number): number {
  const d = finite(dxPx);
  const m = Math.abs(d);
  if (m <= TOUCH_STEER.dead) return 0;
  return Math.sign(d) * clamp((m - TOUCH_STEER.dead) / (TOUCH_STEER.full - TOUCH_STEER.dead), 0, 1);
}

/** What the fingers hold: the steer finger's travel (null when none), and the buttons. `ride` is the Maju button of manual mode. */
export interface TouchState { steerDx: number | null; brake: boolean; boost: boolean; sight: boolean; ride: boolean }
export const NO_TOUCH: Readonly<TouchState> = Object.freeze({ steerDx: null, brake: false, boost: false, sight: false, ride: false });

/**
 * One frame of the touch controls. In easy control the throttle is `cruiseThrottle` at the forward `speed` (cut while
 * braking); otherwise Maju gives it. A brake held through a sharp turn (|steer| > 0.6) above 10 m/s is a slide: the reins
 * are pulled and the brake is not applied.
 */
export function touchInput(t: TouchState, speed: number, easy: boolean): { drive: ChariotInput; sight: boolean } {
  const steer = t.steerDx === null ? 0 : touchSteer(t.steerDx);
  const slide = t.brake && Math.abs(steer) > SLIDE.steer && finite(speed) > SLIDE.speed;
  const braking = t.brake && !slide;
  const throttle = easy ? (braking ? 0 : cruiseThrottle(speed)) : t.ride ? 1 : 0;
  return { drive: { throttle, brake: braking ? 1 : 0, steer, drift: slide, boost: t.boost }, sight: t.sight };
}

interface PadLike { axes: readonly number[]; buttons: readonly { value: number; pressed: boolean }[] }

/**
 * One frame of a gamepad. Axis 0 steers past a 0.15 dead zone; button 7 is the throttle, 6 the brake, 0 Laju, 2 the
 * reins, 4 and 5 Mata, 9 pause and 1 skip. Missing axes and buttons read as released.
 */
export function gamepadInput(p: PadLike): { drive: ChariotInput; sight: boolean; skip: boolean; pause: boolean } {
  const a = finite(p.axes[0] ?? 0);
  const steer = Math.abs(a) <= PAD_DEAD ? 0 : clamp(Math.sign(a) * ((Math.abs(a) - PAD_DEAD) / (1 - PAD_DEAD)), -1, 1);
  const btn = (i: number) => p.buttons[i];
  const on = (i: number) => btn(i)?.pressed === true;
  const val = (i: number) => {
    const b = btn(i);
    return b ? clamp(finite(b.value) || (b.pressed ? 1 : 0), 0, 1) : 0;
  };
  return {
    drive: { throttle: val(7), brake: val(6), steer, drift: on(2), boost: on(0) },
    sight: on(4) || on(5),
    skip: on(1),
    pause: on(9),
  };
}

export interface InputPart { drive: ChariotInput; sight: boolean; skip?: boolean; pause?: boolean }

/** The inputs as one: the largest throttle, brake and steer (by size), and any held switch. */
export function mergeInputs(...parts: readonly InputPart[]): { drive: ChariotInput; sight: boolean; skip: boolean; pause: boolean } {
  const drive: ChariotInput = { throttle: 0, brake: 0, steer: 0, drift: false, boost: false };
  let sight = false;
  let skip = false;
  let pause = false;
  for (const p of parts) {
    drive.throttle = Math.max(drive.throttle, p.drive.throttle);
    drive.brake = Math.max(drive.brake, p.drive.brake);
    if (Math.abs(p.drive.steer) > Math.abs(drive.steer)) drive.steer = p.drive.steer;
    drive.drift = drive.drift || p.drive.drift;
    drive.boost = drive.boost || p.drive.boost;
    sight = sight || p.sight;
    skip = skip || p.skip === true;
    pause = pause || p.pause === true;
  }
  // A brake cuts the engine, whichever source asked for either; every value stays in range.
  drive.throttle = clamp(finite(drive.throttle), 0, 1);
  drive.brake = clamp(finite(drive.brake), 0, 1);
  drive.steer = clamp(finite(drive.steer), -1, 1);
  if (drive.brake > 0) drive.throttle = 0;
  return { drive, sight, skip, pause };
}

export type TouchControl = 'steer' | 'brake' | 'boost' | 'sight' | 'ride';

/**
 * The pointer each touch control holds, and the TouchState they make. A control takes one pointer at a time and lets go
 * only of that pointer; `onChange` gets the whole state on every change. `clear` lets go of everything.
 */
export function createTouchPointers(onChange: (t: TouchState) => void) {
  const holds: Partial<Record<TouchControl, number>> = {};
  let state: TouchState = { ...NO_TOUCH };
  const emit = (patch: Partial<TouchState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };
  return {
    /** A pointer goes down on a control: false when another pointer already holds it. */
    down(c: TouchControl, id: number): boolean {
      if (holds[c] !== undefined) return false;
      holds[c] = id;
      emit(c === 'steer' ? { steerDx: 0 } : { [c]: true });
      return true;
    },
    /** The steer pointer moves `dx` px from where it landed. */
    move(id: number, dx: number): boolean {
      if (holds.steer !== id) return false;
      emit({ steerDx: dx });
      return true;
    },
    /** A pointer lifts, is cancelled or leaves: true when it was the one the control held. */
    up(c: TouchControl, id: number): boolean {
      if (holds[c] !== id) return false;
      delete holds[c];
      emit(c === 'steer' ? { steerDx: null } : { [c]: false });
      return true;
    },
    /** Lets go of every control. */
    clear() {
      for (const k of Object.keys(holds) as TouchControl[]) delete holds[k];
      state = { ...NO_TOUCH };
      onChange(state);
    },
  };
}
