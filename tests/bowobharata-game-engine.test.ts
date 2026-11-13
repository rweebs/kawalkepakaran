import { describe, expect, it } from 'vitest';
import { NO_INPUT, initChariot, type ChariotInput, type Guard } from '../src/lib/bowobharata-game/drive';
import { hullClearance, hullMid } from '../src/lib/bowobharata-game/collide';
import { chaseView } from '../src/lib/bowobharata-game/chase';
import { dist, yawOf, angleDiff } from '../src/lib/bowobharata-game/geom';
import { missionFor, type MissionDef } from '../src/lib/bowobharata-game/missions';
import { timeLeft, type GameEvent, type HintKey } from '../src/lib/bowobharata-game/mission-run';
import { ANCHORS, PLAY, RECORD_CIRCLE, TOWER_EXIT } from '../src/lib/bowobharata-game/world';
import { GUARD, MISSION_TIMING } from '../src/lib/bowobharata-game/tuning';
import {
  HINT_MIN,
  advance,
  createWorld,
  mixOf,
  retryFromCheckpoint,
  skipToRecord,
  startChapter,
  teleportToMarker,
  timeScaleOf,
  viewOf,
  type FrameInput,
  type GameState,
  type World,
} from '../src/lib/bowobharata-game/engine';
import { assistSteer, autopilot, createBot, type AutoOpts } from '../src/lib/bowobharata-game/autopilot';
import { HINT_SECONDS, hudOf, sameHud } from '../src/lib/bowobharata-game/hud';

const DT = 1 / 30;
const SEEDS = [1, 2, 3];
const CHAPTERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SLUGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const RECORDS = [0, 2, 2, 4, 9, 1, 2, 2, 2];
const BOT_TIMEOUT = 30_000;
const ASPECT = 16 / 9;

const defOf = (ch: number): MissionDef => missionFor(ch, ch === 0 ? [] : SLUGS.slice(0, RECORDS[ch]));
const desktop = createWorld({ mobile: false });

const IDLE: FrameInput = { drive: NO_INPUT, sight: false, skip: false, assist: false, aspect: ASPECT };
function input(drive: Partial<ChariotInput> = {}, rest: Partial<Omit<FrameInput, 'drive'>> = {}): FrameInput {
  return { ...IDLE, ...rest, drive: { ...NO_INPUT, ...drive } };
}
const types = (events: readonly GameEvent[]) => events.map((e) => e.type);
const hintKeys = (events: readonly GameEvent[]) => events.flatMap((e) => (e.type === 'hint' ? [e.key] : []));
const figureGap = (s: GameState, w: World) => hullClearance(s.car.x, s.car.z, s.car.yaw, w.figures);

/** One frame; the events of every frame run so far are appended to `log`. */
function step(s: GameState, i: FrameInput, w: World = desktop, log?: GameEvent[]): GameState {
  const r = advance(s, i, DT, w);
  log?.push(...r.events);
  return r.state;
}

/** From def.start through the intro (skipped once it allows) to the first active frame. */
function toActive(ch: number, w: World = desktop, seed = 1, log?: GameEvent[]): GameState {
  const def = defOf(ch);
  let s = startChapter(def, def.start, seed, w);
  for (let k = 0; k < 300 && s.run.phase !== 'active'; k++) s = step(s, input({}, { skip: true }), w, log);
  expect(s.run.phase).toBe('active');
  return s;
}

interface BotRun {
  state: GameState;
  done: boolean;
  time: number;
  events: GameEvent[];
  leastFigureGap: number;
}

/** A bot from def.start until `done` or `limit` seconds of world time: one bot per run. */
function runBot(ch: number, seed: number, w: World, opts: Partial<AutoOpts> | undefined, limit: number): BotRun {
  const def = defOf(ch);
  let s = startChapter(def, def.start, seed, w);
  const bot = createBot(opts);
  const events: GameEvent[] = [];
  let time = 0;
  let leastFigureGap = Infinity;
  while (time < limit + 1) {
    const r = advance(s, bot(s, w), DT, w);
    s = r.state;
    time += DT;
    events.push(...r.events);
    leastFigureGap = Math.min(leastFigureGap, figureGap(s, w));
    if (r.events.some((e) => e.type === 'done')) return { state: s, done: true, time, events, leastFigureGap };
  }
  return { state: s, done: false, time, events, leastFigureGap };
}

function expectWon(r: BotRun, limit: number) {
  const { run, car } = r.state;
  const where = `ended in ${run.phase} at step ${run.step}, car (${car.x.toFixed(1)}, ${car.z.toFixed(1)})`;
  expect(r.done, where).toBe(true);
  expect(r.time).toBeLessThanOrEqual(limit);
  expect(r.events.filter((e) => e.type === 'bump')).toEqual([]);
  expect(r.leastFigureGap).toBeGreaterThanOrEqual(GUARD.stop - 0.01);
}

const hasFunction = (v: unknown): boolean =>
  typeof v === 'function' || (typeof v === 'object' && v !== null && Object.values(v).some(hasFunction));

describe('F3: standing still', () => {
  it.each(CHAPTERS)('chapter %i never fails while run.t < 45', (ch) => {
    for (const seed of SEEDS) {
      const def = defOf(ch);
      let s = startChapter(def, def.start, seed, desktop);
      let time = 0;
      let early = 0;
      while (time < 0.8 + 50) {
        const r = advance(s, input({}, { skip: time >= 0.8 }), DT, desktop);
        time += DT;
        if (r.events.some((e) => e.type === 'failed') && r.state.run.t < MISSION_TIMING.grace) early++;
        s = r.state;
      }
      expect(s.run.t).toBeGreaterThan(MISSION_TIMING.grace);
      expect(early).toBe(0);
    }
  });
});

describe('every lakon can be won', () => {
  it.each(CHAPTERS)('chapter %i: the autopilot finishes within 0.6·softTime with no bump', (ch) => {
    const soft = defOf(ch).softTime;
    const limit = soft === null ? 240 : 0.6 * soft;
    for (const seed of SEEDS) expectWon(runBot(ch, seed, desktop, undefined, limit), limit);
  }, BOT_TIMEOUT);

  it.each(CHAPTERS)('chapter %i: a first-time player finishes within softTime', (ch) => {
    const soft = defOf(ch).softTime;
    const limit = soft ?? 300;
    for (const seed of SEEDS) expectWon(runBot(ch, seed, desktop, { speedCap: 0.6, reaction: 0.4 }, limit), limit);
  }, BOT_TIMEOUT);

  it.each([0, 1])('phones (700 per side): the autopilot finishes chapter %i', (ch) => {
    const phone = createWorld({ mobile: true, warriors: 700 });
    expect(phone.warriors).toBe(700);
    expect(phone.mobile).toBe(true);
    const soft = defOf(ch).softTime;
    const limit = soft === null ? 240 : 0.6 * soft;
    for (const seed of SEEDS) expectWon(runBot(ch, seed, phone, undefined, limit), limit);
  }, BOT_TIMEOUT);
});

describe('hints', () => {
  /**
   * The brief's prologue: the bot's steering throughout; after the 8th record the throttle and brake are scripted so the
   * car comes within 25 m of the tower's centre above 8 m/s, enters the reach circle at 5–7 m/s, then stops. It runs on
   * HINT_SECONDS past the outro's start so the last hint's time on the HUD is complete.
   */
  function scriptedPrologue(seed: number) {
    const w = desktop;
    const def = defOf(0);
    let s = startChapter(def, def.start, seed, w);
    const bot = createBot();
    const copy = def.scripted.decoys[0];
    const log: GameEvent[] = [];
    const fired: { key: HintKey; clock: number; copy: number }[] = [];
    const shown: { clock: number; hint: HintKey | null }[] = [];
    let fastNear = false;
    let entry: number | null = null;
    let end = Infinity;
    for (let k = 0; k < 240 / DT && s.clock < end; k++) {
      const auto = bot(s, w);
      let drive = auto.drive;
      if (s.run.recorded.length === 8 && s.run.phase === 'active') {
        const d = dist(hullMid(s.car), ANCHORS.tower);
        const v = Math.hypot(s.car.vx, s.car.vz);
        if (d > 22) drive = { ...drive, throttle: 1, brake: 0 };
        else if (d > RECORD_CIRCLE) drive = { ...drive, throttle: v < 5.5 ? 1 : 0, brake: v > 6.5 ? 0.5 : 0 };
        else drive = { ...drive, throttle: 0, brake: v > 0.05 ? 1 : 0 };
        if (d <= 25 && v > 8) fastNear = true;
        if (entry === null && d <= RECORD_CIRCLE) entry = v;
      }
      s = step(s, { ...auto, drive }, w, log);
      for (const e of log.splice(0)) {
        if (e.type === 'hint') fired.push({ key: e.key, clock: s.clock, copy: dist(hullMid(s.car), copy) });
        if (e.type === 'outroStart') end = s.clock + HINT_SECONDS;
      }
      shown.push({ clock: s.clock, hint: hudOf(s, w).hint });
    }
    return { s, fired, shown, fastNear, entry };
  }

  it.each(SEEDS)('the prologue teaches ride, steer, rewrites, sight, slow and stop, in order, once each (seed %i)', (seed) => {
    const { s, fired, shown, fastNear, entry } = scriptedPrologue(seed);
    expect(fastNear).toBe(true);
    expect(entry).not.toBeNull();
    expect(entry!).toBeGreaterThanOrEqual(5);
    expect(entry!).toBeLessThanOrEqual(7);
    const order: HintKey[] = ['ride', 'steer', 'rewrites', 'sight', 'slow', 'stop'];
    expect(fired.map((f) => f.key)).toEqual(order);
    expect(s.hintsShown).toEqual(order);
    // Each stays on the HUD until the next replaces it, which is never sooner than HINT_MIN; the last for HINT_SECONDS.
    fired.forEach((f, k) => {
      const until = Math.min(fired[k + 1]?.clock ?? Infinity, f.clock + HINT_SECONDS);
      expect(until - f.clock).toBeGreaterThanOrEqual(HINT_MIN - 1e-9);
      const on = shown.filter((v) => v.clock >= f.clock && v.clock < until - 1e-9);
      expect(on.length).toBeGreaterThan(0);
      for (const v of on) expect(v.hint, `${f.key} at ${v.clock.toFixed(2)}`).toBe(f.key);
    });
    // The copy counts as ahead in the whole front half-plane, so rewrites comes near 30 m out.
    const rewrites = fired.find((f) => f.key === 'rewrites')!;
    expect(rewrites.copy).toBeGreaterThan(28);
    expect(rewrites.copy).toBeLessThanOrEqual(30);
  }, BOT_TIMEOUT);

  it('a hint due within HINT_MIN of the last waits in the queue, then fires even after its moment', () => {
    let s = toActive(0);
    expect(s.hintsShown).toEqual(['ride']);
    const ride = s.hintAt;
    const yaw = s.car.yaw;
    // Turned 60° off L1 for a frame: steer comes due while ride is still within HINT_MIN, so it waits.
    s = step({ ...s, car: { ...s.car, yaw: yaw + Math.PI / 3 } }, IDLE);
    expect(s.hintQueue).toEqual(['steer']);
    expect(hudOf(s, desktop).hint).toBe('ride');
    // Back on line: steer's own moment has passed, but it is a lesson and still fires once ride has had HINT_MIN.
    s = { ...s, car: { ...s.car, yaw } };
    const log: GameEvent[] = [];
    while (hintKeys(log).length === 0 && s.clock - ride < 3) {
      expect(hudOf(s, desktop).hint).toBe('ride');
      s = step(s, IDLE, desktop, log);
    }
    expect(hintKeys(log)).toEqual(['steer']);
    expect(s.hintAt - ride).toBeGreaterThanOrEqual(HINT_MIN - 1e-9);
    expect(s.hintAt - ride).toBeLessThan(HINT_MIN + DT + 1e-9);
    expect(s.hintQueue).toEqual([]);
    expect(hudOf(s, desktop).hint).toBe('steer');
  });

  it('the hint queue is dropped when the lakon ends', () => {
    let s = skipToRecord(toActive(0)).state;
    s = { ...s, run: { ...s.run, phaseT: MISSION_TIMING.outroSeconds - DT / 2 }, hintAt: s.clock, hintQueue: ['steer'] };
    const log: GameEvent[] = [];
    s = step(s, IDLE, desktop, log);
    expect(s.run.phase).toBe('done');
    expect(s.hintQueue).toEqual([]);
    for (let k = 0; k < 3 / DT; k++) s = step(s, IDLE, desktop, log);
    expect(hintKeys(log)).toEqual([]);
  });

  it.each(SEEDS)('a fresh parva 1 fires no ride or steer hint, nor any other prologue lesson (seed %i)', (seed) => {
    const r = runBot(1, seed, desktop, undefined, 120);
    expect(r.done).toBe(true);
    const keys = hintKeys(r.events);
    const lessons: HintKey[] = ['ride', 'steer', 'rewrites', 'sight', 'slow', 'stop'];
    for (const lesson of lessons) expect(keys).not.toContain(lesson);
    expect(new Set(keys).size).toBe(keys.length);
  }, BOT_TIMEOUT);

  it('surge: on the first straight of 60 m or more, from chapter 1 on, never in the prologue', () => {
    const prologue = runBot(0, 1, desktop, undefined, 240);
    expect(hintKeys(prologue.events).filter((k) => k === 'surge' || k === 'drift')).toEqual([]);
    const parva1 = runBot(1, 1, desktop, undefined, 120);
    expect(hintKeys(parva1.events).filter((k) => k === 'surge')).toEqual(['surge']);
    // Its first leg (marker to A, 36.7 m) is too short; the A to B leg (94.5 m) is the first long straight.
    const surge = parva1.events.findIndex((e) => e.type === 'hint' && e.key === 'surge');
    const recordedA = parva1.events.findIndex((e) => e.type === 'recorded' && e.id === 'A');
    expect(surge).toBeGreaterThan(recordedA);
  }, BOT_TIMEOUT);

  it('drift: a turn of more than 60° above 10 m/s, from chapter 1 on', () => {
    // On the start, facing south (+z) while the route to parva 1's first record runs north-east (about 119° away).
    const turning = (ch: number, speed: number) => {
      const s = toActive(ch);
      const car = { ...initChariot(s.car.x, s.car.z, -Math.PI / 2), vx: 0, vz: speed };
      const log: GameEvent[] = [];
      step({ ...s, car }, input({ throttle: 1 }), desktop, log);
      return hintKeys(log);
    };
    expect(turning(1, 12)).toEqual(['drift']);
    expect(turning(1, 9)).toEqual([]);
    expect(turning(0, 12).filter((k) => k === 'drift')).toEqual([]);
  });

  it('a hint carried from an earlier chapter does not fire again', () => {
    const fresh = toActive(0);
    expect(fresh.hintsShown).toEqual(['ride']);
    const def = defOf(0);
    const carried: GameState = { ...startChapter(def, def.start, 1, desktop), hintsShown: ['ride'] };
    const log: GameEvent[] = [];
    let s = carried;
    for (let k = 0; k < 60; k++) s = step(s, input({}, { skip: true }), desktop, log);
    expect(hintKeys(log)).toEqual([]);
  });
});

describe('the ranks only ever stop the chariot', () => {
  it('into the ranks at 17 m/s: one held event, no bump, no contact, no score', () => {
    let s = toActive(1);
    s = { ...s, car: { ...initChariot(40, -10, Math.PI), vx: -17, vz: 0 } };
    const score = s.run.score;
    const log: GameEvent[] = [];
    let least = Infinity;
    for (let k = 0; k < 3 / DT; k++) {
      s = step(s, input({ throttle: 1 }), desktop, log);
      least = Math.min(least, figureGap(s, desktop));
    }
    expect(types(log).filter((t) => t === 'held')).toEqual(['held']);
    expect(types(log)).not.toContain('bump');
    expect(least).toBeGreaterThanOrEqual(GUARD.stop - 0.01);
    expect(s.run.score).toBe(score);
    expect(s.cam.shake).toBe(0);
    expect(Math.hypot(s.car.vx, s.car.vz)).toBeLessThan(0.5);
  });

  it('riding along the face, outside the stop distance, is never held', () => {
    let s = toActive(1);
    const face = desktop.figures.find((c) => c.id === 'army-adharma');
    if (!face || face.kind !== 'box') throw new Error('no Kurawa box');
    const x = face.maxX + 1.45 + 1.0;
    s = { ...s, car: { ...initChariot(x, 0, Math.PI / 2), vx: 0, vz: -17 } };
    const log: GameEvent[] = [];
    let least = Infinity;
    for (let k = 0; k < 3 / DT; k++) {
      s = step(s, input({ throttle: 1 }), desktop, log);
      least = Math.min(least, figureGap(s, desktop));
      expect(s.car.held).toBe(0);
    }
    expect(types(log)).not.toContain('held');
    expect(least).toBeGreaterThan(GUARD.stop);
    expect(s.car.z).toBeLessThan(-45);
  });

  it('a contact with the ranks never shakes or bumps, even with the guard taken away', () => {
    const none: Guard = { cap: (_x, _z, _yaw, vx, vz) => ({ vx, vz, removed: 0 }), blocksTurn: () => false };
    const unguarded: World = { ...desktop, guard: none };
    let s = toActive(1, unguarded);
    const face = unguarded.figures.find((c) => c.id === 'army-adharma');
    if (!face || face.kind !== 'box') throw new Error('no Kurawa box');
    // Facing west, the front hull circle 0.1 m short of the east face, at 10 m/s: the push-out is all that stops it.
    s = { ...s, car: { ...initChariot(face.maxX + 1.45 + 0.1 + 3.6, -10, Math.PI), vx: -10, vz: 0 } };
    const log: GameEvent[] = [];
    s = step(s, IDLE, unguarded, log);
    expect(figureGap(s, unguarded)).toBeGreaterThanOrEqual(-1e-9);
    expect(s.car.holdOff).toBeGreaterThan(0);
    expect(types(log)).not.toContain('bump');
    expect(s.cam.shake).toBe(0);
  });
});

describe('determinism and plain data', () => {
  function scripted(k: number, s: GameState, w: World): FrameInput {
    const auto = autopilot(s, w);
    return {
      ...auto,
      drive: {
        ...auto.drive,
        steer: auto.drive.steer + 0.3 * Math.sin(k / 17),
        boost: k % 200 === 120,
        drift: k % 150 > 140,
      },
      sight: k % 300 > 260,
      assist: k % 90 < 30,
    };
  }

  it('the same def, seed and inputs for 600 frames give deep-equal states', () => {
    const run = () => {
      const def = defOf(1);
      let s = startChapter(def, def.start, 2, desktop);
      const states: GameState[] = [];
      for (let k = 0; k < 600; k++) {
        s = advance(s, scripted(k, s, desktop), DT, desktop).state;
        states.push(s);
      }
      return states;
    };
    const a = run();
    const b = run();
    expect(a[599].run.recorded.length).toBeGreaterThan(0);
    for (let k = 0; k < 600; k += 37) expect(b[k]).toEqual(a[k]);
    expect(b[599]).toEqual(a[599]);
  });

  it('keeps GameState plain data, with no closures', () => {
    let s = toActive(0);
    for (let k = 0; k < 120; k++) s = step(s, scripted(k, s, desktop));
    expect(hasFunction(s)).toBe(false);
    expect(structuredClone(s)).toEqual(s);
  });
});

describe('retry and skip', () => {
  function failedAfterBothRecords(): GameState {
    const w = desktop;
    let s = startChapter(defOf(1), defOf(1).start, 1, w);
    for (let k = 0; k < 120 / DT && s.run.step === 0; k++) s = step(s, autopilot(s, w), w);
    expect(s.run.step).toBe(1);
    expect(s.run.recorded).toEqual(['A', 'B']);
    for (let k = 0; k < 30; k++) s = step(s, autopilot(s, w), w);
    const log: GameEvent[] = [];
    s = step({ ...s, run: { ...s.run, t: 121 } }, IDLE, w, log);
    expect(types(log)).toContain('failed');
    expect(s.run.phase).toBe('failed');
    return s;
  }

  it('after a forced fail, retry puts the car at the checkpoint, active, with the score kept', () => {
    const failed = failedAfterBothRecords();
    const cp = failed.run.checkpoint!;
    const s = retryFromCheckpoint(failed, desktop);
    expect(s.run.phase).toBe('active');
    expect({ x: s.car.x, z: s.car.z, yaw: s.car.yaw }).toEqual(cp.car);
    expect(s.car.vx).toBe(0);
    expect(s.car.vz).toBe(0);
    expect(s.run.score).toBe(failed.run.score);
    expect(s.run.score).toBeGreaterThanOrEqual(200);
    expect(s.run.recorded).toEqual(['A', 'B']);
    expect(timeLeft(s.run)!).toBeGreaterThanOrEqual(60);
    expect(s.shot).toBeNull();
    expect(s.route?.target).toBe('reach1');
    const next = advance(s, IDLE, DT, desktop);
    expect(next.state.run.phase).toBe('active');
    const { cam, car, clock } = next.state;
    expect(viewOf(next.state, desktop, ASPECT)).toEqual(chaseView(cam, car, chaseOptsOf(next.state), clock));
  });

  it('skipToRecord gives done {whole: false} within 2.5 s of world time', () => {
    const failed = failedAfterBothRecords();
    const skipped = skipToRecord(failed);
    expect(types(skipped.events)).toContain('outroStart');
    expect(skipped.state.run.phase).toBe('outro');
    let s = skipped.state;
    let time = 0;
    let done: GameEvent | undefined;
    while (!done && time < 5) {
      const r = advance(s, input({ throttle: 1 }), DT, desktop);
      s = r.state;
      time += DT;
      done = r.events.find((e) => e.type === 'done');
    }
    expect(done).toEqual({ type: 'done', score: expect.any(Number), whole: false });
    expect(time).toBeLessThanOrEqual(MISSION_TIMING.outroSeconds + 1e-9);
  });

  it('skipToRecord from a fresh lakon records every target', () => {
    const s = toActive(3);
    const r = skipToRecord(s);
    expect(r.state.run.recorded).toEqual(['A', 'B', 'C', 'D']);
    expect(r.state.run.whole).toBe(false);
    expect(r.state.route).toBeNull();
  });
});

describe('shots and the camera', () => {
  it('the intro plays its shots, then the chase view returns', () => {
    const def = defOf(0);
    let s = startChapter(def, def.start, 1, desktop);
    s = step(s, IDLE);
    expect(s.run.phase).toBe('intro');
    expect(s.shot?.kind).toBe('intro');
    expect(s.shot?.shots).toHaveLength(3);
    const high = viewOf(s, desktop, ASPECT);
    expect(high.pose.pos.y).toBeGreaterThan(30);
    for (let k = 0; k < 200 && s.run.phase === 'intro'; k++) s = step(s, IDLE);
    expect(s.run.phase).toBe('active');
    expect(s.shot).toBeNull();
  });

  it('input is ignored during the intro, and the brake never turns into reverse', () => {
    const def = defOf(0);
    let s = startChapter(def, def.start, 1, desktop);
    for (let k = 0; k < 3 / DT; k++) {
      s = step(s, input({ throttle: 1, steer: 1, boost: true }, { sight: true }));
      expect(s.run.phase).toBe('intro');
      expect(Math.hypot(s.car.vx, s.car.vz)).toBe(0);
      expect(s.sight.on).toBe(false);
    }
    expect({ x: s.car.x, z: s.car.z, yaw: s.car.yaw }).toEqual(def.start);
  });

  it('the outro shot starts from the live view and the chariot comes to rest', () => {
    const w = desktop;
    let s = startChapter(defOf(5), defOf(5).start, 1, w);
    let prev = viewOf(s, w, ASPECT);
    for (let k = 0; k < 120 / DT && s.run.phase !== 'outro'; k++) {
      const next = step(s, autopilot(s, w), w);
      if (next.run.phase === 'outro') {
        expect(next.shot?.kind).toBe('outro');
        expect(next.shot?.t).toBe(0);
        expect(viewOf(next, w, ASPECT)).toEqual(viewOf({ ...next, shot: null }, w, ASPECT));
        prev = viewOf(next, w, ASPECT);
      }
      s = next;
    }
    expect(s.run.phase).toBe('outro');
    for (let k = 0; k < 2 / DT; k++) {
      s = step(s, input({ throttle: 1 }), w);
      const v = viewOf(s, w, ASPECT);
      expect(dist({ x: v.pose.pos.x, z: v.pose.pos.z }, { x: prev.pose.pos.x, z: prev.pose.pos.z })).toBeLessThan(0.5);
      prev = v;
    }
    expect(Math.hypot(s.car.vx, s.car.vz)).toBeLessThan(1e-6);
  }, BOT_TIMEOUT);

  it('after a fail the input is ignored: full throttle and steer bring the chariot to rest, and it stays put', () => {
    let s = toActive(1);
    for (let k = 0; k < 90; k++) s = step(s, autopilot(s, desktop));
    expect(Math.hypot(s.car.vx, s.car.vz)).toBeGreaterThan(5);
    s = step({ ...s, run: { ...s.run, t: 121 } }, IDLE);
    expect(s.run.phase).toBe('failed');
    const wild = input({ throttle: 1, steer: 1, boost: true, drift: true }, { sight: true, assist: true });
    for (let k = 0; k < 1 / DT; k++) s = step(s, wild);
    expect(Math.hypot(s.car.vx, s.car.vz)).toBeLessThan(1e-6);
    const rest = { x: s.car.x, z: s.car.z, yaw: s.car.yaw };
    for (let k = 0; k < 1 / DT; k++) {
      s = step(s, wild);
      expect({ x: s.car.x, z: s.car.z, yaw: s.car.yaw }).toEqual(rest);
      expect(s.sight.on).toBe(false);
    }
    expect(s.run.phase).toBe('failed');
  });

  it('the fail shot starts from the live view', () => {
    let s = toActive(1);
    for (let k = 0; k < 60; k++) s = step(s, autopilot(s, desktop));
    const failed = step({ ...s, run: { ...s.run, t: 121 } }, IDLE);
    expect(failed.run.phase).toBe('failed');
    expect(failed.shot?.kind).toBe('fail');
    expect(viewOf(failed, desktop, ASPECT)).toEqual(viewOf({ ...failed, shot: null }, desktop, ASPECT));
    let later = failed;
    for (let k = 0; k < 2 / DT; k++) later = step(later, IDLE);
    expect(viewOf(later, desktop, ASPECT).pose.pos.y).toBeGreaterThan(viewOf(failed, desktop, ASPECT).pose.pos.y + 3);
  });

  it('a soft contact (a post at about 3.5 m/s) is resolved with no bump and no shake', () => {
    let s = toActive(1);
    const post = { x: 32, z: -20 };
    // Facing east, the front hull circle 0.2 m short of the post's west side, at 3.5 m/s.
    s = { ...s, car: { ...initChariot(post.x - 0.5 - 1.45 - 0.2 - 3.6, post.z, 0), vx: 3.5, vz: 0 } };
    const posts = desktop.colliders.filter((c) => c.id.startsWith('post-'));
    const log: GameEvent[] = [];
    let touched = false;
    for (let k = 0; k < 15; k++) {
      s = step(s, input({ throttle: 0.2 }), desktop, log);
      if (s.car.holdOff > 0) touched = true;
      expect(hullClearance(s.car.x, s.car.z, s.car.yaw, posts)).toBeGreaterThanOrEqual(-1e-9);
      expect(s.cam.shake).toBe(0);
    }
    expect(touched).toBe(true);
    expect(types(log)).not.toContain('bump');
  });

  it('a hard contact with the tower shakes the camera and gives a bump; open ground gives none', () => {
    let s = toActive(1);
    s = { ...s, car: { ...initChariot(-30, 52, 0), vx: 14, vz: 0 } };
    const log: GameEvent[] = [];
    for (let k = 0; k < 30; k++) s = step(s, input({ throttle: 1 }), desktop, log);
    expect(types(log)).not.toContain('bump');
    s = { ...s, car: { ...initChariot(-60, 52, 0), vx: 14, vz: 0 } };
    let shaken = 0;
    for (let k = 0; k < 30; k++) {
      const r = advance(s, input({ throttle: 1 }), DT, desktop);
      s = r.state;
      log.push(...r.events);
      if (r.events.some((e) => e.type === 'bump')) shaken = s.cam.shake;
    }
    const hits = log.filter((e) => e.type === 'bump');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toEqual({ type: 'bump', speed: expect.any(Number) });
    expect(hits[0].type === 'bump' && hits[0].speed).toBeGreaterThan(6);
    expect(shaken).toBeGreaterThan(0);
  });
});

describe('time scale and dawn', () => {
  it('timeScaleOf is 0.35 early in the outro, 0.5 with sight, otherwise 1', () => {
    const s = toActive(1);
    expect(timeScaleOf(s)).toBe(1);
    const sighted = step(s, input({}, { sight: true }));
    expect(sighted.sight.on).toBe(true);
    expect(timeScaleOf(sighted)).toBe(0.5);
    const outro = skipToRecord(s).state;
    expect(timeScaleOf(outro)).toBe(0.35);
    expect(timeScaleOf({ ...outro, run: { ...outro.run, phaseT: 1.19 } })).toBe(0.35);
    expect(timeScaleOf({ ...outro, run: { ...outro.run, phaseT: 1.2 } })).toBe(1);
  });

  it('sight slows the world dt to half', () => {
    const s = toActive(1);
    const plain = step(s, IDLE);
    const sighted = step(s, input({}, { sight: true }));
    expect(plain.run.t - s.run.t).toBeCloseTo(DT, 12);
    expect(sighted.run.t - s.run.t).toBeCloseTo(DT / 2, 12);
    expect(sighted.clock - s.clock).toBeCloseTo(DT, 12);
  });

  it('parva 8: mixOf rises from 0.6 to 1; other chapters give 0', () => {
    const w = desktop;
    const def = defOf(8);
    let s = startChapter(def, def.start, 1, w);
    const mixes = [mixOf(s)];
    let lastOutro = 0;
    for (let k = 0; k < 240 / DT && s.run.phase !== 'done'; k++) {
      s = step(s, autopilot(s, w), w);
      mixes.push(mixOf(s));
      if (s.run.phase === 'outro') lastOutro = mixOf(s);
    }
    expect(s.run.phase).toBe('done');
    expect(mixes[0]).toBeCloseTo(0.6, 12);
    expect(mixes.at(-1)).toBe(1);
    for (let k = 1; k < mixes.length; k++) expect(mixes[k]).toBeGreaterThanOrEqual(mixes[k - 1]);
    // 0.6 + 0.4·done/3 after each record (0.733, 0.867), then the outro carries it on to 1.
    expect(mixes.some((m) => Math.abs(m - (0.6 + 0.4 / 3)) < 1e-9)).toBe(true);
    expect(mixes.some((m) => Math.abs(m - (0.6 + 0.8 / 3)) < 1e-9)).toBe(true);
    expect(lastOutro).toBeGreaterThan(0.99);
    for (const ch of [0, 1, 7]) expect(mixOf(toActive(ch))).toBe(0);
  }, BOT_TIMEOUT);
});

describe('HUD snapshot', () => {
  it('the prologue: objective prologue, 0/8, speed in km/h and no timer', () => {
    let s = toActive(0);
    for (let k = 0; k < 30; k++) s = step(s, input({ throttle: 1 }));
    const h = hudOf(s, desktop);
    expect(h.objective).toBe('prologue');
    expect(h.done).toBe(0);
    expect(h.total).toBe(8);
    expect(h.speedKmh).toBe(Math.round(Math.hypot(s.car.vx, s.car.vz) * 3.6));
    expect(h.speedKmh).toBeGreaterThan(10);
    expect(h.timer).toBeNull();
    expect(h.chapter).toBe(0);
    expect(h.type).toBe('himpun');
    expect(h.phase).toBe('active');
    expect(h.lap).toBeNull();
    const first = startChapter(defOf(0), defOf(0).start, 1, desktop);
    expect(hudOf(first, desktop).objective).toBe('prologue');
  });

  it('parva 1 shows its timer from the intro on, none in roam', () => {
    const def = defOf(1);
    let s = startChapter(def, TOWER_EXIT, 1, desktop);
    expect(s.run.phase).toBe('roam');
    expect(hudOf(s, desktop).timer).toBeNull();
    expect(hudOf(s, desktop).objective).toBe('roam');
    s = startChapter(def, def.start, 1, desktop);
    s = step(s, IDLE);
    expect(s.run.phase).toBe('intro');
    expect(s.run.t).toBe(0);
    expect(hudOf(s, desktop).timer).toBe(120);
    expect(hudOf(s, desktop).objective).toBe('collect');
    for (const ch of [0, 5, 8]) expect(hudOf(toActive(ch), desktop).timer).toBeNull();
    // Whole seconds, rounded up; never below 0.
    const at = (t: number) => hudOf({ ...s, run: { ...s.run, phase: 'active', t } }, desktop).timer;
    expect(at(0.5)).toBe(120);
    expect(at(1)).toBe(119);
    expect(at(119.99)).toBe(1);
    expect(at(120.5)).toBe(0);
  });

  it('objectives follow the lakon: collect, tower, stop, then none', () => {
    const w = desktop;
    let s = startChapter(defOf(6), defOf(6).start, 1, w);
    const seen: string[] = [];
    for (let k = 0; k < 120 / DT && s.run.phase !== 'done'; k++) {
      s = step(s, autopilot(s, w), w);
      const o = hudOf(s, w).objective;
      if (seen.at(-1) !== o) seen.push(o);
    }
    expect(seen).toEqual(['collect', 'tower', 'stop', 'none']);
  }, BOT_TIMEOUT);

  it('a hint shows for 3.5 s, then clears', () => {
    const log: GameEvent[] = [];
    let s = toActive(0, desktop, 1, log);
    expect(hintKeys(log)).toEqual(['ride']);
    const at = s.hintAt;
    expect(at).toBe(s.clock);
    let shown = 0;
    while (s.clock - at < 3.5) {
      expect(hudOf(s, desktop).hint).toBe('ride');
      s = step(s, IDLE, desktop, log);
      shown++;
    }
    expect(shown).toBeGreaterThanOrEqual(Math.floor(3.5 / DT));
    expect(shown).toBeLessThanOrEqual(Math.ceil(3.5 / DT) + 1);
    expect(hudOf(s, desktop).hint).toBeNull();
    s = step(s, IDLE, desktop, log);
    expect(hudOf(s, desktop).hint).toBeNull();
    expect(hintKeys(log)).toEqual(['ride']);
  });

  it('the surge and sight rings', () => {
    let s = toActive(1);
    expect(hudOf(s, desktop).surge).toEqual({ ready: true, frac: 1 });
    expect(hudOf(s, desktop).sight).toEqual({ on: false, charge: 1 });
    for (let k = 0; k < 30; k++) s = step(s, input({ throttle: 1 }));
    s = step(s, input({ throttle: 1, boost: true }, { sight: true }));
    const h = hudOf(s, desktop);
    expect(h.surge.ready).toBe(false);
    expect(h.surge.frac).toBeLessThan(0.05);
    expect(h.sight.on).toBe(true);
    expect(h.sight.charge).toBe(0.99);
    // In hundredths, so a ring refilling a little each frame still changes the snapshot, frame by frame.
    let prev = h;
    let changes = 0;
    for (let k = 0; k < 1 / DT; k++) {
      s = step(s, IDLE);
      const next = hudOf(s, desktop);
      for (const f of [next.surge.frac, next.sight.charge]) expect(Math.round(f * 100)).toBeCloseTo(f * 100, 9);
      if (!sameHud(prev, next)) changes++;
      prev = next;
    }
    expect(changes).toBeGreaterThanOrEqual(10);
  });

  it('sameHud is true for equal snapshots and false when the speed differs', () => {
    let s = toActive(1);
    for (let k = 0; k < 20; k++) s = step(s, input({ throttle: 1 }));
    const a = hudOf(s, desktop);
    expect(sameHud(a, hudOf(s, desktop))).toBe(true);
    expect(sameHud(a, { ...a })).toBe(true);
    expect(sameHud(a, { ...a, speedKmh: a.speedKmh + 1 })).toBe(false);
    expect(sameHud(a, { ...a, timer: 90 })).toBe(false);
    expect(sameHud(a, { ...a, hint: 'surge' })).toBe(false);
    expect(sameHud(a, { ...a, objective: 'tower' })).toBe(false);
    expect(sameHud(a, { ...a, surge: { ...a.surge, frac: 0.42 } })).toBe(false);
    expect(sameHud(a, { ...a, sight: { ...a.sight, charge: 0.98 } })).toBe(false);
  });
});

describe('the soft wall', () => {
  it("chapter 1's roam: from (0, −150) north at 12 m/s, 3 s of throttle give exactly one wall event", () => {
    let s = startChapter(defOf(1), { x: 0, z: -150, yaw: Math.PI / 2 }, 1, desktop);
    expect(s.run.phase).toBe('roam');
    s = { ...s, car: { ...s.car, vx: 0, vz: -12 } };
    const log: GameEvent[] = [];
    let farthest = 0;
    for (let k = 0; k < 3 / DT; k++) {
      s = step(s, input({ throttle: 1 }), desktop, log);
      farthest = Math.max(farthest, Math.hypot(s.car.x - PLAY.cx, s.car.z - PLAY.cz));
    }
    expect(types(log).filter((t) => t === 'wall')).toEqual(['wall']);
    expect(farthest).toBeGreaterThan(PLAY.wall);
    expect(farthest).toBeLessThanOrEqual(PLAY.r + 1e-9);
  });

  it('holds the car at 160 m however hard it drives outward, with no speed left outward; a wall event every 6 s', () => {
    let s = startChapter(defOf(1), { x: 0, z: -160, yaw: Math.PI / 2 }, 1, desktop);
    s = { ...s, car: { ...s.car, vx: 0, vz: -17 } };
    const log: GameEvent[] = [];
    for (let k = 0; k < 13 / DT; k++) {
      s = step(s, input({ throttle: 1, boost: k === 3 }), desktop, log);
      const dx = s.car.x - PLAY.cx;
      const dz = s.car.z - PLAY.cz;
      const d = Math.hypot(dx, dz);
      expect(d).toBeLessThanOrEqual(PLAY.r + 1e-9);
      if (d > PLAY.r - 1e-6) expect((s.car.vx * dx + s.car.vz * dz) / d).toBeLessThanOrEqual(1e-9);
    }
    expect(types(log).filter((t) => t === 'wall')).toEqual(['wall', 'wall', 'wall']);
  });
});

describe('roam, the marker and the assist', () => {
  it('in roam nothing presses: no timer, no clock on the run, no fail', () => {
    let s = startChapter(defOf(1), TOWER_EXIT, 1, desktop);
    const log: GameEvent[] = [];
    for (let k = 0; k < 200 / DT; k++) s = step(s, IDLE, desktop, log);
    expect(s.run.phase).toBe('roam');
    expect(s.run.t).toBe(0);
    expect(types(log)).not.toContain('failed');
  });

  it('teleportToMarker works only in roam, and the intro starts on the next frame', () => {
    const roam = startChapter(defOf(1), TOWER_EXIT, 1, desktop);
    const there = teleportToMarker(roam, desktop);
    expect({ x: there.car.x, z: there.car.z, yaw: there.car.yaw }).toEqual(defOf(1).start);
    const log: GameEvent[] = [];
    step(there, IDLE, desktop, log);
    expect(types(log)).toContain('introStart');
    const active = toActive(1);
    expect(teleportToMarker(active, desktop)).toBe(active);
  });

  it('the autopilot drives from the tower to the marker and starts the lakon', () => {
    let s = startChapter(defOf(1), TOWER_EXIT, 1, desktop);
    const log: GameEvent[] = [];
    for (let k = 0; k < 60 / DT && s.run.phase === 'roam'; k++) s = step(s, autopilot(s, desktop), desktop, log);
    expect(types(log)).toContain('introStart');
    expect(types(log)).not.toContain('bump');
  });

  it('createBot delays the decisions by its reaction, from a queue in its closure', () => {
    const w = desktop;
    const bot = createBot({ reaction: 0.4 });
    let s = toActive(1);
    const now: FrameInput[] = [];
    const late: FrameInput[] = [];
    for (let k = 0; k < 60; k++) {
      now.push(autopilot(s, w));
      late.push(bot(s, w));
      s = step(s, late[k]);
    }
    const lag = Math.round(0.4 / DT);
    expect(now[0].drive.throttle).toBeGreaterThan(0);
    for (let k = 0; k < lag; k++) expect(late[k].drive).toEqual(NO_INPUT);
    for (let k = lag; k < 60; k++) expect(late[k]).toEqual(now[k - lag]);
    expect(hasFunction(s)).toBe(false);
    // Reused after its run (the clock going back), the bot starts its queue over: the new run's first decision comes
    // after the lag, not the old run's.
    let t = toActive(1);
    const now2: FrameInput[] = [];
    const late2: FrameInput[] = [];
    for (let k = 0; k <= lag; k++) {
      now2.push(autopilot(t, w));
      late2.push(bot(t, w));
      t = step(t, late2[k]);
    }
    expect(late2[0].drive).toEqual(NO_INPUT);
    expect(late2[lag]).toEqual(now2[0]);
  });

  it('autopilot() is pure: the same state gives the same input, whatever ran before', () => {
    const w = desktop;
    const s = toActive(1);
    const first = autopilot(s, w, { speedCap: 0.6 });
    let other = toActive(3);
    const bot = createBot({ speedCap: 0.6, reaction: 0.4 });
    for (let k = 0; k < 90; k++) {
      autopilot(other, w, { speedCap: 0.6 });
      other = step(other, bot(other, w));
    }
    expect(autopilot(s, w, { speedCap: 0.6 })).toEqual(first);
    expect(autopilot(structuredClone(s), w, { speedCap: 0.6 })).toEqual(first);
    expect(autopilot(s, w)).toEqual(createBot()(s, w));
    // The reaction delay needs a queue, so only createBot takes it: autopilot() rejects it, even through a variable.
    const firstTime: Partial<AutoOpts> = { speedCap: 0.6, reaction: 0.4 };
    // @ts-expect-error reaction is createBot's option
    autopilot(s, w, { reaction: 0.4 });
    // @ts-expect-error reaction is createBot's option
    autopilot(s, w, firstTime);
  });

  it('two bots built from one options object, stepped in lock step on separate runs, each finish their lakon', () => {
    const o: Partial<AutoOpts> = { speedCap: 0.6, reaction: 0.4 };
    const runs = [
      { s: startChapter(defOf(1), defOf(1).start, 1, desktop), bot: createBot(o), done: false },
      { s: startChapter(defOf(1), TOWER_EXIT, 1, desktop), bot: createBot(o), done: false },
      { s: startChapter(defOf(3), defOf(3).start, 1, desktop), bot: createBot(o), done: false },
    ];
    for (let k = 0; k < 160 / DT && runs.some((r) => !r.done); k++) {
      for (const r of runs) {
        if (r.done) continue;
        const out = advance(r.s, r.bot(r.s, desktop), DT, desktop);
        r.s = out.state;
        r.done = out.events.some((e) => e.type === 'done');
      }
    }
    expect(runs.map((r) => r.done)).toEqual([true, true, true]);
    expect(runs.map((r) => r.s.run.recorded)).toEqual([['A', 'B'], ['A', 'B'], ['A', 'B', 'C', 'D']]);
    // Each matches the same bot run on its own.
    expect(runs[0].s).toEqual(runBot(1, 1, desktop, o, 120).state);
    expect(runs[2].s).toEqual(runBot(3, 1, desktop, o, 150).state);
  }, BOT_TIMEOUT);

  it('a fresh options literal for each run works', () => {
    for (const ch of [1, 5]) {
      let s = startChapter(defOf(ch), defOf(ch).start, 1, desktop);
      const bot = createBot({ speedCap: 0.6, reaction: 0.4 });
      let done = false;
      for (let k = 0; k < 120 / DT && !done; k++) {
        const out = advance(s, bot(s, desktop), DT, desktop);
        s = out.state;
        done = out.events.some((e) => e.type === 'done');
      }
      expect(done).toBe(true);
    }
  }, BOT_TIMEOUT);

  it('assistSteer blends the autopilot into the player steer', () => {
    expect(assistSteer(0, 1)).toBeCloseTo(0.7, 12);
    expect(assistSteer(0, -0.5)).toBeCloseTo(-0.35, 12);
    expect(assistSteer(0.5, 1)).toBeCloseTo(0.85, 12);
    expect(assistSteer(1, -1)).toBe(1);
    expect(assistSteer(-1, 1)).toBe(-1);
    expect(assistSteer(0.9, 1)).toBeLessThanOrEqual(1);
  });

  it('with assist on, a player who only holds the throttle turns toward the route', () => {
    const def = defOf(1);
    const m = def.marker!;
    const off = (s: GameState) => Math.abs(angleDiff(yawOf({ x: m.x - s.car.x, z: m.z - s.car.z }), s.car.yaw));
    let plain = startChapter(def, { x: -40, z: 60, yaw: Math.PI / 2 }, 1, desktop);
    let helped = plain;
    const start = off(plain);
    for (let k = 0; k < 2 / DT; k++) {
      plain = step(plain, input({ throttle: 1 }));
      helped = step(helped, input({ throttle: 1 }, { assist: true }));
    }
    expect(plain.car.yaw).toBe(Math.PI / 2);
    expect(off(helped)).toBeLessThan(start - 0.5);
  });
});

function chaseOptsOf(s: GameState) {
  return { aspect: ASPECT, boosting: s.car.boostT > 0, ground: desktop.ground, tall: desktop.tall };
}
