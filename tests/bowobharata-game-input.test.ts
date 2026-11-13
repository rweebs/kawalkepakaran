import { describe, it, expect } from 'vitest';
import { NO_INPUT } from '../src/lib/bowobharata-game/drive';
import {
  KEYMAP,
  KEY_ACTIONS,
  STEER_IN,
  STEER_OUT,
  cruiseThrottle,
  keyAction,
  keyboardInput,
  steerToward,
  touchSteer,
  touchInput,
  gamepadInput,
  mergeInputs,
  NO_TOUCH,
} from '../src/lib/bowobharata-game/input';
import { DRIVE } from '../src/lib/bowobharata-game/tuning';

const DT = 1 / 60;
const MANUAL = { on: false, speed: 0 };
const held = (...codes: string[]): ReadonlySet<string> => new Set(codes);
/** The steer after `frames` frames of 1/60 s holding `codes`, starting from `from`. */
function steerAfter(codes: ReadonlySet<string>, frames: number, from = 0): number {
  let steer = from;
  for (let k = 0; k < frames; k++) steer = keyboardInput(codes, steer, DT, MANUAL).drive.steer;
  return steer;
}

describe('input: the key map', () => {
  it('maps each action to its keys by code', () => {
    expect(KEYMAP).toEqual({
      throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      drift: ['Space'], boost: ['ShiftLeft', 'ShiftRight'],
      sight: ['KeyK'], skip: ['Enter', 'KeyE'], pause: ['Escape', 'KeyP'],
    });
    expect(KEY_ACTIONS).toEqual(Object.keys(KEYMAP));
  });

  it('no action name implies violence', () => {
    expect(KEY_ACTIONS).toHaveLength(9);
    for (const a of KEY_ACTIONS) expect(a).not.toMatch(/\b(fire|shoot|attack|aim|throw|strike)\b/i);
  });

  it('keyAction names the action a code drives, and null for any other key', () => {
    for (const a of KEY_ACTIONS) for (const code of KEYMAP[a]) expect(keyAction(code), code).toBe(a);
    for (const code of ['KeyQ', 'Tab', 'w', 'KEYW', 'Digit1', '']) expect(keyAction(code), code).toBeNull();
  });
});

describe('input: keyboard driving', () => {
  it('KeyW gives throttle 1, KeyS brake 1, and nothing held gives no input', () => {
    const w = keyboardInput(held('KeyW'), 0, DT, MANUAL).drive;
    expect(w.throttle).toBe(1);
    expect(w.brake).toBe(0);
    const s = keyboardInput(held('KeyS'), 0, DT, MANUAL).drive;
    expect(s.brake).toBe(1);
    expect(s.throttle).toBe(0);
    expect(keyboardInput(held('ArrowUp'), 0, DT, MANUAL).drive.throttle).toBe(1);
    expect(keyboardInput(held('ArrowDown'), 0, DT, MANUAL).drive.brake).toBe(1);
    expect(keyboardInput(held(), 0, DT, MANUAL)).toEqual({ drive: { ...NO_INPUT }, sight: false, skip: false });
  });

  it('KeyD steers toward +1 (right) and ArrowLeft toward −1 (left); both together steer back to the centre', () => {
    expect(steerAfter(held('KeyD'), 1)).toBeGreaterThan(0);
    expect(steerAfter(held('KeyD'), 60)).toBe(1);
    expect(steerAfter(held('ArrowRight'), 60)).toBe(1);
    expect(steerAfter(held('ArrowLeft'), 1)).toBeLessThan(0);
    expect(steerAfter(held('ArrowLeft'), 60)).toBe(-1);
    expect(steerAfter(held('KeyA'), 60)).toBe(-1);
    expect(steerAfter(held('KeyA', 'KeyD'), 60, 1)).toBe(0);
  });

  it('ramps in at 5/s: at dt 1/60 the steer is 0.5 after 0.1 s and at full lock after 0.2 s', () => {
    expect(STEER_IN).toBe(5);
    expect(steerAfter(held('KeyD'), 6)).toBeCloseTo(0.5, 9);
    expect(steerAfter(held('ArrowLeft'), 6)).toBeCloseTo(-0.5, 9);
    expect(steerAfter(held('KeyD'), 11)).toBeLessThan(1);
    expect(steerAfter(held('KeyD'), 12)).toBe(1);
    expect(steerAfter(held('ArrowLeft'), 12)).toBe(-1);
  });

  it('ramps out at 7/s: from full lock it returns to 0 within 9 frames (0.15 s), not 8', () => {
    expect(STEER_OUT).toBe(7);
    expect(steerAfter(held(), 8, 1)).toBeGreaterThan(0);
    expect(steerAfter(held(), 9, 1)).toBe(0);
    expect(steerAfter(held(), 8, -1)).toBeLessThan(0);
    expect(steerAfter(held(), 9, -1)).toBe(0);
  });

  it('from one lock to the other: back to the centre at 7/s, then out at 5/s, within one step', () => {
    expect(steerToward(1, -1, 1 / 7)).toBeCloseTo(0, 9);
    expect(steerToward(1, -1, 1 / 7 + 0.1)).toBeCloseTo(-0.5, 9);
    expect(steerToward(-1, 1, 1 / 7 + 0.2)).toBe(1);
    // Toward a smaller lock on the same side, at the out rate, and never past it.
    expect(steerToward(1, 0.3, 0.05)).toBeCloseTo(0.65, 9);
    expect(steerToward(1, 0.3, 1)).toBe(0.3);
  });

  it('steerToward reads a non-finite value as 0, clamps to ±1, and does nothing with no time', () => {
    expect(steerToward(NaN, 1, 0.1)).toBeCloseTo(0.5, 9);
    expect(steerToward(0.4, 1, 0)).toBe(0.4);
    expect(steerToward(0.4, 1, -1)).toBe(0.4);
    expect(steerToward(0.4, 1, NaN)).toBe(0.4);
    expect(steerToward(3, 1, 0)).toBe(1);
    expect(steerToward(0, 5, 1)).toBe(1);
  });

  it('Space pulls the reins, Shift gives Laju, K holds Mata, Enter or E is the skip', () => {
    expect(keyboardInput(held('Space'), 0, DT, MANUAL).drive.drift).toBe(true);
    for (const code of ['ShiftLeft', 'ShiftRight']) expect(keyboardInput(held(code), 0, DT, MANUAL).drive.boost, code).toBe(true);
    expect(keyboardInput(held('KeyK'), 0, DT, MANUAL).sight).toBe(true);
    for (const code of ['Enter', 'KeyE']) expect(keyboardInput(held(code), 0, DT, MANUAL).skip, code).toBe(true);
    const none = keyboardInput(held('KeyW'), 0, DT, MANUAL);
    expect([none.drive.drift, none.drive.boost, none.sight, none.skip]).toEqual([false, false, false, false]);
  });

  it('easy control: the throttle is cruiseThrottle, 1 at 0 m/s and 0 at 13 m/s, whatever W says', () => {
    expect(keyboardInput(held(), 0, DT, { on: true, speed: 0 }).drive.throttle).toBe(1);
    expect(keyboardInput(held(), 0, DT, { on: true, speed: 13 }).drive.throttle).toBe(0);
    expect(keyboardInput(held('KeyW'), 0, DT, { on: true, speed: 13 }).drive.throttle).toBe(0);
    expect(keyboardInput(held(), 0, DT, { on: true, speed: 11.5 }).drive.throttle).toBeCloseTo(0.5, 9);
    // The speed matters only in easy control.
    expect(keyboardInput(held(), 0, DT, { on: false, speed: 0 }).drive.throttle).toBe(0);
  });

  it('easy control: braking cuts the cruise, so the chariot can stop and reverse', () => {
    const d = keyboardInput(held('KeyS'), 0, DT, { on: true, speed: 0 }).drive;
    expect(d.throttle).toBe(0);
    expect(d.brake).toBe(1);
  });

  it('cruiseThrottle is clamp((target − v)/3, 0, 1) with the target at the cruise speed, 13 m/s', () => {
    expect(DRIVE.cruiseSpeed).toBe(13);
    expect(cruiseThrottle(0)).toBe(1);
    expect(cruiseThrottle(10)).toBe(1);
    expect(cruiseThrottle(11.5)).toBeCloseTo(0.5, 9);
    expect(cruiseThrottle(13)).toBe(0);
    expect(cruiseThrottle(20)).toBe(0);
    expect(cruiseThrottle(-3)).toBe(1);
    expect(cruiseThrottle(5, 8)).toBe(1);
    expect(cruiseThrottle(7, 8)).toBeCloseTo(1 / 3, 9);
    expect(cruiseThrottle(NaN)).toBe(0);
  });
});

describe('input: touch', () => {
  it('touchSteer is 0 inside 6 px and linear to +-1 at 56 px', () => {
    expect(touchSteer(5)).toBe(0);
    expect(touchSteer(-6)).toBe(0);
    expect(touchSteer(31)).toBeCloseTo(0.5, 9);
    expect(touchSteer(56)).toBe(1);
    expect(touchSteer(-80)).toBe(-1);
    expect(touchSteer(NaN)).toBe(0);
  });

  it('easy control cruises: throttle 1 at 0 m/s and 0 at 13 m/s', () => {
    expect(touchInput({ ...NO_TOUCH }, 0, true).drive.throttle).toBe(1);
    expect(touchInput({ ...NO_TOUCH }, 13, true).drive.throttle).toBe(0);
  });

  it('manual: Maju is the throttle; the brake is throttle 0 and brake 1', () => {
    expect(touchInput({ ...NO_TOUCH, ride: true }, 0, false).drive.throttle).toBe(1);
    expect(touchInput({ ...NO_TOUCH }, 0, false).drive.throttle).toBe(0);
    for (const easy of [false, true]) {
      const d = touchInput({ ...NO_TOUCH, brake: true }, 5, easy).drive;
      expect([d.throttle, d.brake, d.drift]).toEqual([0, 1, false]);
    }
  });

  it('brake through a sharp turn above 10 m/s is a slide with no brake', () => {
    const d = touchInput({ ...NO_TOUCH, brake: true, steerDx: 0.8 * 50 + 6 }, 12, false).drive;
    expect(d.steer).toBeCloseTo(0.8, 9);
    expect(d.drift).toBe(true);
    expect(d.brake).toBe(0);
    const slow = touchInput({ ...NO_TOUCH, brake: true, steerDx: 56 }, 8, false).drive;
    expect([slow.drift, slow.brake]).toEqual([false, 1]);
  });

  it('Laju and Mata come from their buttons', () => {
    const t = touchInput({ ...NO_TOUCH, boost: true, sight: true }, 0, false);
    expect([t.drive.boost, t.sight]).toEqual([true, true]);
  });
});

describe('input: gamepad', () => {
  const btns = (over: Record<number, number> = {}) => Array.from({ length: 17 }, (_, i) => ({ value: over[i] ?? 0, pressed: (over[i] ?? 0) > 0.5 }));
  it('axis 0 steers with a 0.15 dead zone', () => {
    expect(gamepadInput({ axes: [0.1], buttons: btns() }).drive.steer).toBe(0);
    expect(gamepadInput({ axes: [-1], buttons: btns() }).drive.steer).toBe(-1);
    expect(gamepadInput({ axes: [1], buttons: btns() }).drive.steer).toBe(1);
  });
  it('buttons: 7 throttle, 6 brake, 0 Laju, 2 reins, 4 and 5 Mata, 9 pause, 1 skip', () => {
    expect(gamepadInput({ axes: [0], buttons: btns({ 7: 0.6 }) }).drive.throttle).toBe(0.6);
    expect(gamepadInput({ axes: [0], buttons: btns({ 6: 1 }) }).drive.brake).toBe(1);
    expect(gamepadInput({ axes: [0], buttons: btns({ 0: 1 }) }).drive.boost).toBe(true);
    expect(gamepadInput({ axes: [0], buttons: btns({ 2: 1 }) }).drive.drift).toBe(true);
    for (const i of [4, 5]) expect(gamepadInput({ axes: [0], buttons: btns({ [i]: 1 }) }).sight).toBe(true);
    expect(gamepadInput({ axes: [0], buttons: btns({ 9: 1 }) }).pause).toBe(true);
    expect(gamepadInput({ axes: [0], buttons: btns({ 1: 1 }) }).skip).toBe(true);
  });
  it('a pad with no axes or buttons gives no input', () => {
    expect(gamepadInput({ axes: [], buttons: [] })).toEqual({ drive: { ...NO_INPUT }, sight: false, skip: false, pause: false });
  });
});

describe('input: mergeInputs', () => {
  it('takes the largest throttle, brake and steer, and any held switch', () => {
    const a = { drive: { throttle: 0.2, brake: 0, steer: -0.3, drift: false, boost: true }, sight: false };
    const b = { drive: { throttle: 0.9, brake: 0.5, steer: 0.7, drift: true, boost: false }, sight: true, skip: true };
    expect(mergeInputs(a, b)).toEqual({ drive: { throttle: 0.9, brake: 0.5, steer: 0.7, drift: true, boost: true }, sight: true, skip: true, pause: false });
    expect(mergeInputs()).toEqual({ drive: { ...NO_INPUT }, sight: false, skip: false, pause: false });
  });
});
