import { describe, expect, it } from 'vitest';
import { NO_INPUT, REST_SPEED, initChariot, speedOf, type ChariotInput, type Guard } from '../src/lib/bowobharata-game/drive';
import { HULL, hullCircles, hullClearance, hullMid } from '../src/lib/bowobharata-game/collide';
import { chaseView, initChase, projectNdc, stepChase } from '../src/lib/bowobharata-game/chase';
import { clamp, dist, forward, polylineDist, rightOf, yawOf, angleDiff } from '../src/lib/bowobharata-game/geom';
import { across, missionFor, realTargets, type MissionDef, type StepDef } from '../src/lib/bowobharata-game/missions';
import { startRun, timeLeft, totalReal, type Decoy, type GameEvent, type HintKey } from '../src/lib/bowobharata-game/mission-run';
import { ANCHORS, PLAY, RECORD_CIRCLE, TOWER_EXIT, zonesAt } from '../src/lib/bowobharata-game/world';
import { GUARD, MISSION_TIMING, SIGHT, VOLLEY } from '../src/lib/bowobharata-game/tuning';
import { kickRiuh, riuhLevel, stepRiuh } from '../src/lib/bowobharata-game/riuh';
import { planVolley, scriptedVolley, type Cloud, type Volley } from '../src/lib/bowobharata-game/volley';
import {
  DEFAULT_ASPECT,
  HINT_MIN,
  ROAM_RETURN,
  SIGHT_LESSON,
  advance,
  createWorld,
  leaveReplay,
  mixOf,
  retryFromCheckpoint,
  skipToRecord,
  startChapter,
  teleportToMarker,
  timeScaleOf,
  viewOf,
  type FrameInput,
  type GameState,
  type RoamInput,
  type World,
} from '../src/lib/bowobharata-game/engine';
import { assistSteer, autopilot, createBot, type AutoOpts } from '../src/lib/bowobharata-game/autopilot';
import { HINT_SECONDS, hudOf, sameHud, type HudSnapshot } from '../src/lib/bowobharata-game/hud';
import { NO_TOUCH, keyboardInput, touchInput } from '../src/lib/bowobharata-game/input';
import { RADAR_PX, radarItems, radarRange } from '../src/lib/bowobharata-game/radar';

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
  /** Frames that broke a pressure rule (see pressureFaults), one line each. */
  faults: string[];
  /** Volleys that landed (not absorbed) during the run. */
  landed: number;
}

/** The prologue's scripted copy, the Mata lesson: it lies on the path on purpose. */
const isLesson = (s: GameState, d: Decoy) => s.run.def.chapter === 0 && d.life === null;
const capOf = (w: World) => (w.mobile ? VOLLEY.maxDecoysMobile : VOLLEY.maxDecoys);

/**
 * The pressure rules one frame must keep, each broken rule a line: no open copy but the lesson lies within 5 m of the
 * route (copies come out with the lakon, so roam is left out); every volley that landed this frame left its copy at its
 * landing (born then, for VOLLEY.decoyLife s), open when that lies 5 m or more off the route, and its haze exactly when
 * it carried haze; no more open volley copies than the cap.
 */
function pressureFaults(prev: GameState, next: GameState, w: World): { faults: string[]; landed: number } {
  const faults: string[] = [];
  const at = `chapter ${next.run.def.chapter}, t ${next.run.t.toFixed(2)}`;
  const route = next.run.phase === 'roam' ? null : (next.route?.points ?? null);
  for (const d of next.decoys) {
    if (d.state !== 'open' || isLesson(next, d) || !route) continue;
    const off = polylineDist(d.at, route);
    if (off < VOLLEY.routeClear) faults.push(`${at}: copy ${d.id} is open ${off.toFixed(2)} m from the route`);
  }
  const before = new Map(prev.volleys.map((v) => [v.id, v.state]));
  let landed = 0;
  for (const v of next.volleys) {
    if (v.state !== 'landed' || before.get(v.id) === 'landed') continue;
    landed++;
    const lands = v.t0 + v.flight;
    const copy = next.decoys.find((d) => d.id === v.id);
    const landsAt = (x: { at: { x: number; z: number } }) => x.at.x === v.to.x && x.at.z === v.to.z;
    const placed = copy && landsAt(copy) && copy.born === lands && copy.life === VOLLEY.decoyLife;
    if (v.decoy && !placed) faults.push(`${at}: volley ${v.id} landed without its copy`);
    const offRoute = !route || polylineDist(v.to, route) >= VOLLEY.routeClear;
    if (v.decoy && copy && offRoute && copy.state !== 'open') faults.push(`${at}: volley ${v.id}'s copy is not open`);
    const haze = next.clouds.find((c) => c.id === v.id);
    const hazed = haze && landsAt(haze) && haze.born === lands && haze.life === VOLLEY.cloudLife;
    if (v.cloud !== !!hazed) faults.push(`${at}: volley ${v.id} (cloud ${v.cloud}) left ${haze ? 'haze' : 'no haze'}`);
  }
  const open = next.decoys.filter((d) => d.life !== null && d.state === 'open').length;
  if (open > capOf(w)) faults.push(`${at}: ${open} open volley copies, over the cap of ${capOf(w)}`);
  return { faults, landed };
}

/** One frame of `input`, its pressure faults added to `faults`. */
function checkedStep(s: GameState, input: FrameInput, w: World, faults: string[]): GameState {
  const next = advance(s, input, DT, w).state;
  faults.push(...pressureFaults(s, next, w).faults);
  return next;
}

/**
 * A bot from def.start until `done` or `limit` seconds of frames (DT each): one bot per run. Every frame is checked
 * against the pressure rules; `hold` may then rework the state the next frame starts from, and `each` sees it.
 */
function runBot(
  ch: number,
  seed: number,
  w: World,
  opts: Partial<AutoOpts> | undefined,
  limit: number,
  each?: (s: GameState) => void,
  hold?: (s: GameState) => GameState,
): BotRun {
  const def = defOf(ch);
  let s = startChapter(def, def.start, seed, w);
  const bot = createBot(opts);
  const events: GameEvent[] = [];
  const faults: string[] = [];
  let landed = 0;
  let time = 0;
  let leastFigureGap = Infinity;
  while (time < limit + 1) {
    const r = advance(s, bot(s, w), DT, w);
    const checked = pressureFaults(s, r.state, w);
    faults.push(...checked.faults);
    landed += checked.landed;
    s = hold ? hold(r.state) : r.state;
    each?.(s);
    time += DT;
    events.push(...r.events);
    leastFigureGap = Math.min(leastFigureGap, figureGap(s, w));
    if (r.events.some((e) => e.type === 'done')) break;
  }
  const done = events.some((e) => e.type === 'done');
  return { state: s, done, time, events, leastFigureGap, faults, landed };
}

const count = (events: readonly GameEvent[], type: GameEvent['type']) => events.filter((e) => e.type === type).length;
/** The real gates of a chapter's courses. */
const realGates = (ch: number) =>
  defOf(ch).steps.reduce((n, s) => n + (s.kind === 'course' ? s.days.flatMap((d) => d.gates).filter((g) => g.real).length : 0), 0);

/** A first-time player: slower, a 0.4 s reaction. CARELESS ignores the lures; CAREFUL keeps the dodge and sight. */
const CARELESS: Partial<AutoOpts> = { speedCap: 0.6, reaction: 0.4, useSight: false, avoidDecoys: false };
const CAREFUL: Partial<AutoOpts> = { speedCap: 0.6, reaction: 0.4 };
/** The limits: the autopilot within 0.6·softTime (240 s without one), a first-time player within softTime (300 s). */
const autoLimit = (ch: number) => (defOf(ch).softTime === null ? 240 : 0.6 * defOf(ch).softTime!);
const firstLimit = (ch: number) => defOf(ch).softTime ?? 300;

/**
 * Done within `limit` s with no bump and no fail, the ranks never touched, no rewrite gate crossed and at most one
 * rewrite taken, and every pressure rule kept.
 */
function expectWon(r: BotRun, limit: number) {
  const { run, car } = r.state;
  const where = `ended in ${run.phase} at step ${run.step}, day ${run.dayIndex}, car (${car.x.toFixed(1)}, ${car.z.toFixed(1)})`;
  expect(r.done, where).toBe(true);
  expect(r.time).toBeLessThanOrEqual(limit);
  expect(r.events.filter((e) => e.type === 'bump')).toEqual([]);
  expect(r.events.filter((e) => e.type === 'failed')).toEqual([]);
  expect(r.events.filter((e) => e.type === 'gate' && !e.real)).toEqual([]);
  expect(count(r.events, 'rewriteTaken')).toBeLessThanOrEqual(1);
  expect(r.leastFigureGap).toBeGreaterThanOrEqual(GUARD.stop - 0.01);
  expect(r.faults).toEqual([]);
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

describe('C1: the clamour is seen', () => {
  // Zero input from def.start, the intro skipped after 0.8 s, as in F3. Chapter 2's letter lies on its marker and is
  // recorded on the first active frame, which holds the rise back 10 s (spec Goals: Riuh).
  it.each(CHAPTERS)('chapter %i: riuh ≥ 1 by run.t 25.1 s (ch. 2: 35.1 s); no volley before 20 s, no fail before 45 s', (ch) => {
    const by = ch === 2 ? 35.1 : 25.1;
    for (const seed of SEEDS) {
      const def = defOf(ch);
      let s = startChapter(def, def.start, seed, desktop);
      let time = 0;
      let seen: number | null = null;
      const early: GameEvent[] = [];
      while (time < 0.8 + 50) {
        const r = advance(s, input({}, { skip: time >= 0.8 }), DT, desktop);
        time += DT;
        for (const e of r.events) {
          if (e.type === 'volley' && r.state.run.t < MISSION_TIMING.firstVolley) early.push(e);
          if (e.type === 'failed' && r.state.run.t < MISSION_TIMING.grace) early.push(e);
        }
        s = r.state;
        if (seen === null && s.run.t >= by) seen = s.riuh.value;
      }
      expect(s.run.t).toBeGreaterThan(MISSION_TIMING.grace);
      expect(seen, `seed ${seed}`).not.toBeNull();
      expect(seen!, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(early).toEqual([]);
    }
  });

  it('the first frame of chapter 2 records its letter, and the clamour is below 1 at 25.1 s', () => {
    const def = defOf(2);
    let s = startChapter(def, def.start, 1, desktop);
    const log: GameEvent[] = [];
    let time = 0;
    while (s.run.t < 25.1) {
      s = step(s, input({}, { skip: time >= 0.8 }), desktop, log);
      time += DT;
    }
    expect(log.find((e) => e.type === 'recorded')).toEqual(expect.objectContaining({ id: 'A' }));
    expect(s.riuh.value).toBeLessThan(1);
  });
});

describe('every lakon can be won under pressure', () => {
  it.each(CHAPTERS)('chapter %i: the autopilot finishes within 0.6·softTime with no bump and at most one rewrite', (ch) => {
    const soft = defOf(ch).softTime;
    const limit = soft === null ? 240 : 0.6 * soft;
    for (const seed of SEEDS) expectWon(runBot(ch, seed, desktop, undefined, limit), limit);
  }, BOT_TIMEOUT);

  it.each(CHAPTERS)('chapter %i: a first-time player who ignores lures finishes within softTime, never muddied', (ch) => {
    for (const seed of SEEDS) {
      const r = runBot(ch, seed, desktop, CARELESS, firstLimit(ch));
      expect(r.events.filter((e) => e.type === 'failed' && e.reason === 'muddied')).toEqual([]);
      expectWon(r, firstLimit(ch));
      // Every real target recorded, a course's through each real gate.
      expect(r.state.run.recorded).toHaveLength(totalReal(defOf(ch)));
      expect(count(r.events, 'gate')).toBe(realGates(ch));
    }
  }, BOT_TIMEOUT);

  it.each(CHAPTERS)('chapter %i: a careful first-time player (the dodge and sight on) finishes within softTime', (ch) => {
    for (const seed of SEEDS) expectWon(runBot(ch, seed, desktop, CAREFUL, firstLimit(ch)), firstLimit(ch));
  }, BOT_TIMEOUT);

  it('with the clamour held at 4.5 (a volley each 4.5 s, with haze) both personas win every lakon, lures off route', () => {
    const held = (s: GameState): GameState =>
      s.run.phase === 'active' && s.riuh.value < 4.5 ? { ...s, riuh: { ...s.riuh, value: 4.5 } } : s;
    let volleys = 0;
    let landed = 0;
    for (const ch of CHAPTERS) {
      for (const seed of [1, 2]) {
        const auto = runBot(ch, seed, desktop, undefined, autoLimit(ch), undefined, held);
        expectWon(auto, autoLimit(ch));
        const first = runBot(ch, seed, desktop, CARELESS, firstLimit(ch), undefined, held);
        expectWon(first, firstLimit(ch));
        volleys += count(auto.events, 'volley') + count(first.events, 'volley');
        landed += auto.landed + first.landed;
      }
    }
    expect(volleys).toBeGreaterThanOrEqual(60);
    expect(landed).toBeGreaterThanOrEqual(40);
  }, BOT_TIMEOUT);

  it.each([0, 1])('phones (700 per side): the autopilot finishes chapter %i', (ch) => {
    const phone = createWorld({ mobile: true, warriors: 700 });
    expect(phone.warriors).toBe(700);
    expect(phone.mobile).toBe(true);
    const soft = defOf(ch).softTime;
    const limit = soft === null ? 240 : 0.6 * soft;
    for (const seed of SEEDS) expectWon(runBot(ch, seed, phone, undefined, limit), limit);
  }, BOT_TIMEOUT);

  it('the bots meet volleys: across chapters 1, 3, 4 and 6 volleys land, each leaving its copy, off the route', () => {
    let landed = 0;
    for (const ch of [1, 3, 4, 6]) {
      for (const seed of SEEDS) {
        const r = runBot(ch, seed, desktop, { speedCap: 0.6, reaction: 0.4, useSight: false, avoidDecoys: false }, 300);
        expect(r.done).toBe(true);
        expect(r.faults).toEqual([]);
        landed += r.landed;
      }
    }
    expect(landed).toBeGreaterThanOrEqual(10);
  }, BOT_TIMEOUT);
});

describe('the gates, the letter and the laps meet the bots', () => {
  it('pickReal off: the bot rides through the gate nearer it, rewrites and all, and from t 45 three fail the lakon', () => {
    // No volleys, so every rewrite taken is a gate; the lakon starts at the end of the grace, so every one counts.
    const def = { ...defOf(4), riuh: { ...defOf(4).riuh, volleys: false } };
    let s = startChapter(def, def.start, 1, desktop);
    for (let k = 0; k < 300 && s.run.phase !== 'active'; k++) s = step(s, input({}, { skip: true }));
    s = { ...s, run: { ...s.run, t: MISSION_TIMING.grace } };
    const bot = createBot({ pickReal: false });
    let rewrites = 0;
    for (let k = 0; k < 120 / DT && s.run.phase === 'active'; k++) {
      const r = advance(s, bot(s, desktop), DT, desktop);
      const gates = r.events.filter((e) => e.type === 'gate' && !e.real);
      expect(count(r.events, 'rewriteTaken')).toBe(gates.length);
      rewrites += gates.length;
      s = r.state;
    }
    expect(rewrites).toBe(3);
    expect([s.run.phase, s.run.failReason, s.run.decoysTaken]).toEqual(['failed', 'muddied', 3]);
    // The default bot picks the real gate or the outer lane: none.
    const picked = runBot(4, 1, desktop, undefined, 240);
    expect(picked.events.filter((e) => e.type === 'gate' && !e.real)).toEqual([]);
  }, BOT_TIMEOUT);

  it.each([
    [4, 14],
    [7, 3],
  ])('chapter %i: a time fail past day %i retries from the last day passed, and the first-time bots finish in the time given', (ch, day) => {
    for (const opts of [CARELESS, CAREFUL]) {
      const def = defOf(ch);
      let s = startChapter(def, def.start, 1, desktop);
      const bot = createBot(opts);
      for (let k = 0; k < 300 / DT && s.run.dayIndex < day; k++) s = advance(s, bot(s, desktop), DT, desktop).state;
      expect(s.run.dayIndex).toBe(day);
      const cp = s.run.checkpoint!;
      expect(cp.dayIndex).toBe(day);
      // The clock runs out; the retry resumes past the last day passed with the least time a retry gives.
      const failed = step({ ...s, run: { ...s.run, t: def.softTime! + 0.1 } }, IDLE);
      expect(failed.run.failReason).toBe('time');
      const back = retryFromCheckpoint(failed, desktop);
      expect([back.car.x, back.car.z, back.car.yaw, back.run.dayIndex]).toEqual([cp.car.x, cp.car.z, cp.car.yaw, day]);
      // The least a retry gives (restore rounds it up to the millisecond).
      const given = timeLeft(back.run)!;
      expect(given).toBeGreaterThanOrEqual(MISSION_TIMING.retryMinSeconds);
      expect(given).toBeLessThan(MISSION_TIMING.retryMinSeconds + 0.01);
      const again = createBot(opts);
      let r = back;
      const events: GameEvent[] = [];
      for (let k = 0; k < (given + 5) / DT && r.run.phase === 'active'; k++) {
        const out = advance(r, again(r, desktop), DT, desktop);
        events.push(...out.events);
        r = out.state;
      }
      expect(r.run.phase, `${opts.useSight === false ? 'careless' : 'careful'}`).toBe('outro');
      expect(events.filter((e) => e.type === 'failed')).toEqual([]);
      expect(r.run.recorded).toHaveLength(totalReal(def));
      expect(r.run.t - back.run.t).toBeLessThan(given);
    }
  }, BOT_TIMEOUT);

  it('the return from day 18 to a missed day-6 gate, and on to day 8, takes no rewrite', () => {
    // No volleys, so a rewrite taken could only be a gate's; the grace is long over.
    const def = { ...defOf(4), riuh: { ...defOf(4).riuh, volleys: false } };
    const days = (def.steps[0] as Extract<StepDef, { kind: 'course' }>).days;
    const missed = [days[5], days[7]].map((d) => d.gates.find((g) => g.real)!.id);
    let s = startChapter(def, def.start, 1, desktop);
    for (let k = 0; k < 300 && s.run.phase !== 'active'; k++) s = step(s, input({}, { skip: true }));
    const recorded = realTargets(def).map((t) => t.id).filter((id) => !missed.includes(id));
    s = { ...s, car: initChariot(-4, 40, Math.PI), run: { ...s.run, dayIndex: 18, recorded, t: 100 } };
    const log: GameEvent[] = [];
    for (let k = 0; k < 150 / DT && s.run.phase !== 'done'; k++) s = step(s, autopilot(s, desktop), desktop, log);
    expect(s.run.phase).toBe('done');
    expect(log.filter((e) => e.type === 'gate')).toEqual([
      { type: 'gate', real: true, day: 6 },
      { type: 'gate', real: true, day: 8 },
    ]);
    expect(count(log, 'rewriteTaken')).toBe(0);
    expect(s.run.recorded).toEqual(expect.arrayContaining(missed));
  }, BOT_TIMEOUT);
});

describe('the autopilot meets the lures', () => {
  /**
   * Chapter 1 at its first active frame, rolling at 8 m/s along its route to A (it starts on it, facing along it), with
   * one open copy `ahead` m in front of the hull's middle and `side` m to its right.
   */
  function copyAt(ahead: number, side = 0, state: Decoy['state'] = 'open'): GameState {
    const s = toActive(1);
    const m = hullMid(s.car);
    const f = forward(s.car.yaw);
    const r = rightOf(s.car.yaw);
    const at = { x: m.x + f.x * ahead + r.x * side, z: m.z + f.z * ahead + r.z * side };
    const car = { ...s.car, vx: 8 * f.x, vz: 8 * f.z };
    return { ...s, car, decoys: [{ id: 99, at, born: 0, life: VOLLEY.decoyLife, state, mimic: false }] };
  }

  it('useSight holds sight while closing on an open copy in the way within 15 m ahead of the hull, and only then', () => {
    expect(autopilot(copyAt(12), desktop).sight).toBe(true);
    // At rest (turning on the spot) it waits.
    const still = copyAt(12);
    expect(autopilot({ ...still, car: { ...still.car, vx: 0, vz: 0 } }, desktop).sight).toBe(false);
    expect(autopilot(copyAt(10, 4.4), desktop).sight).toBe(true);
    expect(autopilot(copyAt(10, -4.4), desktop).sight).toBe(true);
    // 4.6 m aside the copy is out of the way; 16 m ahead it is too far; behind, it is passed.
    expect(autopilot(copyAt(10, 4.6), desktop).sight).toBe(false);
    expect(autopilot(copyAt(16), desktop).sight).toBe(false);
    expect(autopilot(copyAt(-5), desktop).sight).toBe(false);
    expect(autopilot(copyAt(12, 0, 'filed'), desktop).sight).toBe(false);
    expect(autopilot(copyAt(12), desktop, { useSight: false }).sight).toBe(false);
    expect(autopilot({ ...copyAt(12), decoys: [] }, desktop).sight).toBe(false);
  });

  it('avoidDecoys steers away from a copy on its line within 10 m ahead, and ignores one farther off', () => {
    const clear = autopilot({ ...copyAt(8), decoys: [] }, desktop, { useSight: false }).drive.steer;
    const onLine = autopilot(copyAt(8, 0.5), desktop, { useSight: false }).drive.steer;
    const farAhead = autopilot(copyAt(14, 0.5), desktop, { useSight: false }).drive.steer;
    const off = autopilot(copyAt(8, 6), desktop, { useSight: false }).drive.steer;
    // The copy lies 0.5 m right of the line: the bot turns left (its steer drops below the clear line's). It does not
    // turn for a copy 14 m ahead, nor for one 6 m aside, nor with avoidDecoys off.
    expect(onLine).toBeLessThan(clear - 0.05);
    expect(farAhead).toBe(clear);
    expect(off).toBe(clear);
    expect(autopilot(copyAt(8, 0.5), desktop, { useSight: false, avoidDecoys: false }).drive.steer).toBe(clear);
  });

  it('a bot with a reaction delay gives no sight either before its first decision is due', () => {
    const s = copyAt(12);
    expect(autopilot(s, desktop).sight).toBe(true);
    const bot = createBot({ reaction: 0.4 });
    expect(bot(s, desktop)).toEqual({ ...autopilot(s, desktop), drive: NO_INPUT, sight: false, skip: false });
  });

  it('the dodge keeps the hull off the colliders: with a post on the nearer side it passes the copy on the other', () => {
    // Rolling north at 8 m/s on a straight route, a copy 8 m ahead of the hull's middle and 0.5 m right of its line;
    // the north watch post (0, −62) stands 9 m ahead and 3 m to the left.
    const yaw = Math.PI / 2;
    const f = forward(yaw);
    const r = rightOf(yaw);
    const post = { x: 0, z: -62 };
    const mid = { x: post.x - 9 * f.x + 3 * r.x, z: post.z - 9 * f.z + 3 * r.z };
    const car = { ...initChariot(mid.x - 1.6 * f.x, mid.z - 1.6 * f.z, yaw), vx: 8 * f.x, vz: 8 * f.z };
    const copy = { x: mid.x + 8 * f.x + 0.5 * r.x, z: mid.z + 8 * f.z + 0.5 * r.z };
    const s0 = toActive(1);
    const s: GameState = {
      ...s0,
      car,
      route: { target: 'A', points: [{ x: car.x, z: car.z }, { x: car.x + 60 * f.x, z: car.z + 60 * f.z }] },
      decoys: [{ id: 99, at: copy, born: 0, life: VOLLEY.decoyLife, state: 'open', mimic: false }],
    };
    const noPost: World = { ...desktop, colliders: desktop.colliders.filter((c) => c.id !== 'post-2') };
    expect(desktop.colliders.some((c) => c.id === 'post-2' && c.kind === 'circle' && c.x === post.x && c.z === post.z)).toBe(true);
    // Without the post it goes left of the copy, the nearer way round; with it, right.
    expect(autopilot(s, noPost, { useSight: false }).drive.steer).toBeLessThan(0);
    expect(autopilot(s, desktop, { useSight: false }).drive.steer).toBeGreaterThan(0);
  });

  it("the prologue's lesson copy: steered round, filed with sight, taken by a bot with neither", () => {
    const lesson = defOf(0).scripted.decoys[0];
    let least = Infinity;
    const avoid = runBot(0, 1, desktop, { useSight: false }, 240, (s) => {
      least = Math.min(least, dist(hullMid(s.car), lesson));
    });
    expect(avoid.done).toBe(true);
    expect(count(avoid.events, 'rewriteTaken')).toBe(0);
    expect(count(avoid.events, 'filed')).toBe(0);
    expect(least).toBeGreaterThanOrEqual(3);
    const sighted = runBot(0, 1, desktop, { avoidDecoys: false }, 240);
    expect(count(sighted.events, 'filed')).toBe(1);
    expect(count(sighted.events, 'rewriteTaken')).toBe(0);
    const neither = runBot(0, 1, desktop, { avoidDecoys: false, useSight: false }, 240);
    expect(count(neither.events, 'rewriteTaken')).toBe(1);
  }, BOT_TIMEOUT);
});

type P2 = { x: number; z: number };
/** Whether the segment ab meets the segment pq, touching included (a chariot that stops on a line has reached it). */
function meets(a: P2, b: P2, p: P2, q: P2) {
  const side = (o: P2, u: P2, v: P2) => (u.x - o.x) * (v.z - o.z) - (u.z - o.z) * (v.x - o.x);
  const inBox = (u: P2, v: P2, w: P2) =>
    Math.min(u.x, v.x) <= w.x && w.x <= Math.max(u.x, v.x) && Math.min(u.z, v.z) <= w.z && w.z <= Math.max(u.z, v.z);
  const within = (u: P2, v: P2, w: P2) => side(u, v, w) === 0 && inBox(u, v, w);
  if (side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0) return true;
  return within(p, q, a) || within(p, q, b) || within(a, b, p) || within(a, b, q);
}

describe('prologue pacing', () => {
  /**
   * The prologue from its start with one bot, checked frame by frame: no record raises the clamour; the scripted volley
   * is planned once, on the frame the hull's middle first reaches its line (with L1 still open), and lands 2.6 s later
   * at `at` (never absorbed: 8.5 m or more from every hull circle's centre), leaving its open copy; no other volley
   * comes before 20 s; the pressure rules hold throughout.
   */
  function pacing(opts: Partial<AutoOpts> | undefined, seed: number) {
    const w = desktop;
    const def = defOf(0);
    const line = def.scripted.volleyLine!;
    let s = startChapter(def, def.start, seed, w);
    const bot = createBot(opts);
    let reached: number | null = null;
    let openThen = -1;
    let landedAt: number | null = null;
    let gap = NaN;
    const scripted: Volley[] = [];
    const early: GameEvent[] = [];
    const faults: string[] = [];
    let records = 0;
    for (let k = 0; k < 300 / DT && s.run.phase !== 'done'; k++) {
      const r = advance(s, bot(s, w), DT, w);
      const next = r.state;
      faults.push(...pressureFaults(s, next, w).faults);
      for (const e of r.events) {
        if (e.type === 'recorded') {
          records++;
          expect(next.riuh.value, `record ${e.id}`).toBeLessThanOrEqual(s.riuh.value);
        }
        if (e.type !== 'volley') continue;
        const v = next.volleys.find((x) => x.id === e.id)!;
        if (v.to.x === line.at.x && v.to.z === line.at.z) scripted.push(v);
        else if (next.run.t < MISSION_TIMING.firstVolley) early.push(e);
      }
      const active = s.run.phase === 'active' && next.run.phase === 'active';
      if (reached === null && active && meets(hullMid(s.car), hullMid(next.car), line.a, line.b)) {
        reached = next.run.t;
        openThen = next.run.recorded.length;
      }
      const one = scripted[0];
      if (one && landedAt === null && next.run.t >= one.t0 + one.flight) {
        // Its landing frame: landed, not absorbed, well clear of the hull, and its copy is out.
        expect(next.volleys.find((x) => x.id === one.id)?.state).toBe('landed');
        landedAt = next.run.t;
        gap = Math.min(...hullCircles(next.car.x, next.car.z, next.car.yaw).map((c) => dist(c, line.at)));
        expect(next.decoys.find((d) => d.id === one.id)).toEqual({
          id: one.id, at: line.at, born: one.t0 + one.flight, life: VOLLEY.decoyLife, state: 'open', mimic: false,
        });
      }
      s = next;
    }
    expect(s.run.phase).toBe('done');
    expect(records).toBe(8);
    expect(scripted).toHaveLength(1);
    expect(reached).not.toBeNull();
    expect(openThen).toBe(0);
    const v = scripted[0];
    expect(v.planned).toBe(reached);
    expect(v.decoy).toBe(true);
    expect(v.t0 + v.flight - v.planned).toBeCloseTo(2.6, 9);
    expect(landedAt).not.toBeNull();
    expect(landedAt! - reached!).toBeGreaterThanOrEqual(2.6 - 1e-9);
    expect(landedAt! - reached!).toBeLessThan(2.6 + DT);
    expect(gap).toBeGreaterThanOrEqual(VOLLEY.absorbR + 1.5);
    expect(early).toEqual([]);
    expect(faults).toEqual([]);
  }

  const lands = 'the teaching volley lands (never absorbed) 2.6 s after the chariot sets off across its line';

  it.each(SEEDS)(`the autopilot, seed %i: no record raises the clamour; ${lands}; no other volley before 20 s`, (seed) => {
    pacing(undefined, seed);
  }, BOT_TIMEOUT);

  it.each(SEEDS)(`a first-time player who ignores lures, seed %i: ${lands}`, (seed) => pacing(CARELESS, seed), BOT_TIMEOUT);

  it.each([0.3, 0.4, 0.5, 0.6, 0.7, 0.8])(`at speedCap %s, careless and careful: ${lands}`, (speedCap) => {
    pacing({ speedCap, reaction: 0.4, useSight: false, avoidDecoys: false }, 1);
    pacing({ speedCap, reaction: 0.4 }, 1);
  }, BOT_TIMEOUT);
});

/** A driver of the sweep: the bot at a speed share and reaction, careless or careful, with Laju never, always or on
 * straights. */
type Surge = 'none' | 'always' | 'straights';
type Driver = { speedCap: number; reaction: number; careful: boolean; surge: Surge };
const SURGES: readonly Surge[] = ['none', 'always', 'straights'];
const SWEEP: Driver[] = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].flatMap((speedCap) =>
  [0, 0.4, 0.8, 1].flatMap((reaction) =>
    [false, true].flatMap((careful) => SURGES.map((surge) => ({ speedCap, reaction, careful, surge }))),
  ),
);
/** The autopilot, and the first-time player at speedCap 0.3–0.8 (careless and careful), without Laju. */
const firstTime = (d: Driver) => d.reaction === 0.4 && d.speedCap >= 0.3 && d.speedCap <= 0.8;
const theAutopilot = (d: Driver) => d.speedCap === 1 && d.reaction === 0 && d.careful;
const upright = (d: Driver) => d.surge === 'none' && (firstTime(d) || theAutopilot(d));
const name = (d: Driver) =>
  `speedCap ${d.speedCap}, reaction ${d.reaction}, ${d.careful ? 'careful' : 'careless'}, Laju ${d.surge}`;
/** The driver's bot, and its input for a frame: the bot's own, with Laju held as the driver holds it. */
function driverOf(d: Driver) {
  const lures = d.careful ? {} : { useSight: false, avoidDecoys: false };
  const bot = createBot({ speedCap: d.speedCap, reaction: d.reaction, ...lures });
  return (s: GameState, w: World, aspect = DEFAULT_ASPECT): FrameInput => {
    const auto = bot(s, w);
    const straight = Math.abs(auto.drive.steer) < 0.1 && auto.drive.throttle > 0;
    const boost = d.surge === 'always' || (d.surge === 'straights' && straight);
    return { ...auto, aspect, drive: { ...auto.drive, boost } };
  };
}

/** The copy hints, each with the reach in front of the hull's middle at which a copy brings it (m). */
const COPY_HINTS = { rewrites: 30, sight: 15 } as const;
type CopyHint = keyof typeof COPY_HINTS;
const isCopyHint = (key: HintKey): key is CopyHint => key === 'rewrites' || key === 'sight';
/** Whether p lies within `range` m of the hull's middle, in front of it (its bearing within 90° of the heading). */
function inFront(s: GameState, p: { x: number; z: number }, range: number): boolean {
  const m = hullMid(s.car);
  const f = forward(s.car.yaw);
  return dist(m, p) <= range && (p.x - m.x) * f.x + (p.z - m.z) * f.z >= 0;
}
/**
 * The copies whose place makes a copy hint due in `s`, whoever laid them out: open and in front of the hull's middle,
 * within 30 m for rewrites, within 15 m with Mata off for sight. Only the lakon's own (no life) may count.
 */
const hintCopies = (key: CopyHint, s: GameState): Decoy[] =>
  key === 'sight' && s.sight.on ? [] : s.decoys.filter((d) => d.state === 'open' && inFront(s, d.at, COPY_HINTS[key]));
/**
 * The chariot approaches the prologue's lesson copy: it is open, in front of the hull's middle and within the 15 m of
 * the sight hint. A run in which this happens, or the copy is taken or filed, must be told of Mata in time.
 */
function approaching(s: GameState): boolean {
  const copy = s.decoys.find((d) => d.life === null)!;
  return copy.state === 'open' && inFront(s, copy.at, COPY_HINTS.sight);
}
/**
 * Follows a prologue run, frame by frame (`see` each state), to where it reaches the lesson copy: the first frame the
 * copy is taken or filed, else the frame of its closest pass to the hull's middle while open in the active lakon. It
 * keeps that frame's clock and the hint the HUD shows on it.
 */
function lessonReach() {
  let touched: { clock: number; hint: HintKey | null } | null = null;
  let closest = { gap: Infinity, clock: NaN, hint: null as HintKey | null };
  return {
    see(s: GameState) {
      if (touched) return;
      const copy = s.decoys.find((d) => d.life === null)!;
      if (copy.state === 'taken' || copy.state === 'filed') touched = { clock: s.clock, hint: hudOf(s, desktop).hint };
      const gap = dist(hullMid(s.car), copy.at);
      if (!touched && copy.state === 'open' && s.run.phase === 'active' && gap < closest.gap) {
        closest = { gap, clock: s.clock, hint: hudOf(s, desktop).hint };
      }
    },
    touched: () => touched !== null,
    at: () => touched ?? closest,
  };
}

describe("the teaching volley in every driver's hands", () => {
  interface Teaching {
    /** The scripted volley's planning frames, how many records were in by then, and the chariot's speed then (m/s). */
    planned: number;
    recordedThen: number;
    speed: number;
    outcome: 'landed' | 'absorbed' | null;
    /** On the frame it came down: the least distance to a hull circle's centre, and where it showed (NDC). */
    gap: number;
    ndc: { x: number; y: number; z: number };
    /** Frames from its telegraph (1.4 s before it lands) to its landing, and how many of them showed it. */
    shown: number;
    frames: number;
  }

  /** The prologue from its start for one driver, at one screen aspect, until the teaching volley has come down. */
  function teach(d: Driver, aspect: number): Teaching {
    const w = desktop;
    const def = defOf(0);
    const at = def.scripted.volleyLine!.at;
    const spot = { x: at.x, y: w.ground(at.x, at.z), z: at.z };
    let s = startChapter(def, def.start, 1, w);
    const drive = driverOf(d);
    const none = { x: NaN, y: NaN, z: NaN };
    const out: Teaching = {
      planned: 0, recordedThen: -1, speed: NaN, outcome: null, gap: NaN, ndc: none, shown: 0, frames: 0,
    };
    let v: Volley | null = null;
    for (let k = 0; k < 40 / DT && !out.outcome; k++) {
      const r = advance(s, drive(s, w, aspect), DT, w);
      const next = r.state;
      for (const e of r.events) {
        if (e.type !== 'volley') continue;
        const x = next.volleys.find((y) => y.id === e.id)!;
        if (x.to.x !== at.x || x.to.z !== at.z) continue;
        out.planned++;
        out.recordedThen = next.run.recorded.length;
        out.speed = Math.hypot(next.car.vx, next.car.vz);
        v = x;
      }
      if (v) {
        const lands = v.t0 + v.flight;
        const view = viewOf(next, w, aspect);
        const ndc = projectNdc(view.pose, view.fov, aspect, spot);
        if (next.run.t >= lands - VOLLEY.telegraph) {
          out.frames++;
          if (ndc.z > 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) out.shown++;
        }
        if (next.run.t >= lands) {
          const id = v.id;
          const landed = next.volleys.some((y) => y.id === id && y.state === 'landed');
          out.outcome = landed ? 'landed' : r.events.some((e) => e.type === 'absorbed') ? 'absorbed' : null;
          out.gap = Math.min(...hullCircles(next.car.x, next.car.z, next.car.yaw).map((c) => dist(c, at)));
          out.ndc = ndc;
        }
      }
      s = next;
    }
    return out;
  }

  it('every driver of the sweep reaches the line once, with L1 open; without Laju it always lands, 8.5 m clear', () => {
    let absorbedWithLaju = 0;
    let leastWithout = Infinity;
    for (const d of SWEEP) {
      const t = teach(d, DEFAULT_ASPECT);
      expect(t.planned, name(d)).toBe(1);
      expect(t.recordedThen, name(d)).toBe(0);
      // Setting off forward from the spawn, every driver meets the line at much the same pace.
      expect(t.speed, name(d)).toBeGreaterThanOrEqual(2.3);
      expect(t.speed, name(d)).toBeLessThanOrEqual(3.6);
      expect(t.outcome, name(d)).not.toBeNull();
      if (d.surge === 'none') {
        expect(t.outcome, name(d)).toBe('landed');
        expect(t.gap, name(d)).toBeGreaterThanOrEqual(VOLLEY.absorbR + 1.5);
        leastWithout = Math.min(leastWithout, t.gap);
      } else if (t.outcome === 'absorbed') absorbedWithLaju++;
      // On a wide screen it comes down in front of the camera, within 0.9 of the half-width.
      expect(t.ndc.z, name(d)).toBeGreaterThan(0);
      expect(Math.abs(t.ndc.x), name(d)).toBeLessThanOrEqual(0.9);
    }
    expect(SWEEP).toHaveLength(216);
    // The least clearance without Laju, as the prologue's comment states it.
    expect(leastWithout).toBeGreaterThanOrEqual(21.1);
    expect(absorbedWithLaju).toBeLessThanOrEqual(SWEEP.length / 3);
  }, BOT_TIMEOUT);

  it('on an upright phone it comes down inside the width, and shows for at least half of its telegraph', () => {
    const drivers = SWEEP.filter(upright);
    expect(drivers).toHaveLength(13);
    for (const d of drivers) {
      const t = teach(d, 9 / 16);
      expect(t.outcome, name(d)).toBe('landed');
      expect(t.ndc.z, name(d)).toBeGreaterThan(0);
      expect(Math.abs(t.ndc.x), name(d)).toBeLessThanOrEqual(1);
      expect(t.frames, name(d)).toBeGreaterThan(30);
      expect(t.shown / t.frames, name(d)).toBeGreaterThanOrEqual(0.5);
    }
  }, BOT_TIMEOUT);
});

describe("the Mata lesson in every driver's hands", () => {
  /**
   * The sweep's drivers on seeds 1–3 (648 runs), grouped by seed and reaction. The seed places the scheduled volleys,
   * whose copies may lie anywhere near the way. In every run, each copy hint comes due on the lakon's own copy: on the
   * frame rewrites or sight first comes due, the copies that make it due (hintCopies) include one with no life, and that
   * is checked when the hint fires. And every driver who approaches the lesson copy, or takes or files it, is told of
   * Mata at least 0.8 s before reaching it: the frame it is taken or filed, else the frame of its closest pass to the
   * hull's middle. For the attentive drivers (a reaction of 0.4 s or less), the sight lesson is still on the HUD there
   * in 95% of runs or more. Slower hands wander for up to 52 s between the lesson and the copy, past any lesson's stay.
   */
  const GROUPS = SEEDS.flatMap((seed) => [
    [seed, '0 and 0.4', [0, 0.4]] as const,
    [seed, '0.8', [0.8]] as const,
    [seed, '1', [1]] as const,
  ]);
  it.each(GROUPS)(
    "seed %i, reaction %s s: the copy hints come due only on the lakon's own copy; sight leads the reach by 0.8 s",
    (seed, _label, reactions) => {
      const def = defOf(0);
      let met = 0;
      let shown = 0;
      let checked = 0;
      for (const d of SWEEP.filter((x) => (reactions as readonly number[]).includes(x.reaction))) {
        let s = startChapter(def, def.start, seed, desktop);
        const drive = driverOf(d);
        const due = new Map<CopyHint, Decoy[]>();
        const reach = lessonReach();
        let near = false;
        let told = -Infinity;
        for (let k = 0; k < 300 / DT && s.run.phase !== 'done'; k++) {
          const r = advance(s, drive(s, desktop), DT, desktop);
          const next = r.state;
          for (const key of ['rewrites', 'sight'] as const) {
            const known = (x: GameState) => x.hintQueue.includes(key) || x.hintsShown.includes(key);
            if (!known(s) && known(next)) due.set(key, hintCopies(key, next));
          }
          for (const e of r.events) {
            if (e.type !== 'hint' || !isCopyHint(e.key)) continue;
            const on = due.get(e.key) ?? [];
            const what = on.map((x) => `copy ${x.id} (life ${x.life})`).join(', ') || 'no copy';
            expect(on.some((x) => x.life === null), `${name(d)}, seed ${seed}: ${e.key} came due on ${what}`).toBe(true);
            checked++;
            if (e.key === 'sight') told = next.clock;
          }
          if (approaching(next)) near = true;
          reach.see(next);
          s = next;
        }
        expect(s.run.phase, name(d)).toBe('done');
        if (!reach.touched() && !near) continue;
        met++;
        const at = reach.at();
        expect(at.clock - told, `${name(d)}, seed ${seed}`).toBeGreaterThanOrEqual(0.8 - 1e-9);
        if (at.hint === 'sight') shown++;
      }
      expect(met).toBeGreaterThanOrEqual(40 * reactions.length);
      expect(checked).toBeGreaterThanOrEqual(2 * met);
      // The sight lesson is still on the HUD when an attentive driver reaches the lesson copy, in 95% of runs or more.
      if (reactions.every((x) => x <= 0.4)) expect(shown / met, `${shown} of ${met}`).toBeGreaterThanOrEqual(0.95);
    },
    BOT_TIMEOUT,
  );
});

describe('the clamour and the volleys in the engine', () => {
  const phone = createWorld({ mobile: true, warriors: 700 });
  /** Far from parva 1's start, its route and every collider: the corner of the field toward the north-west grove. */
  const FAR = { x: -60, z: -110 };

  it('a frame with nothing in flight rebuilds no volley, copy or haze list: each is kept by reference', () => {
    // Active, at rest on parva 1's start: its four copies and two hazes are out, no volley flies, nothing is taken or spent.
    const s = toActive(1);
    expect(s.volleys).toEqual([]);
    expect([s.decoys.length, s.clouds.length]).toEqual([4, 2]);
    const next = step(s, IDLE);
    expect(next.run.phase).toBe('active');
    expect(next.run.t).toBeGreaterThan(s.run.t);
    expect(next.volleys).toBe(s.volleys);
    expect(next.decoys).toBe(s.decoys);
    expect(next.clouds).toBe(s.clouds);
    // The same while the clamour climbs, and in roam.
    const loud = step({ ...next, run: { ...next.run, t: 30 }, riuh: { ...next.riuh, value: 0.5 } }, IDLE);
    expect(loud.riuh.value).toBeGreaterThan(0.5);
    expect(loud.volleys).toBe(next.volleys);
    expect(loud.decoys).toBe(next.decoys);
    expect(loud.clouds).toBe(next.clouds);
    const roam = startChapter(defOf(1), TOWER_EXIT, 1, desktop);
    const later = step(roam, IDLE);
    expect(later.run.phase).toBe('roam');
    expect(later.volleys).toBe(roam.volleys);
    expect(later.decoys).toBe(roam.decoys);
    expect(later.clouds).toBe(roam.clouds);
  });

  it('a volley that lands within 7 m of the chariot is absorbed: one event, and no copy or haze', () => {
    let s = toActive(1);
    const f = forward(s.car.yaw);
    const front = hullCircles(s.car.x, s.car.z, s.car.yaw)[2];
    const to = { x: front.x + 5 * f.x, z: front.z + 5 * f.z };
    const v: Volley = { ...scriptedVolley(to, s.run.t, s.nextId, desktop), cloud: true };
    s = { ...s, volleys: [v], nextId: v.id + 1 };
    const { decoys, clouds } = s;
    const log: GameEvent[] = [];
    for (let k = 0; k < 3 / DT; k++) s = step(s, IDLE, desktop, log);
    expect(log.filter((e) => e.type === 'absorbed')).toEqual([{ type: 'absorbed' }]);
    expect(s.volleys).toEqual([]);
    expect(s.decoys).toEqual(decoys);
    expect(s.clouds).toEqual(clouds);
  });

  it('a landed volley leaves its copy (and its haze when it carries haze); at the cap the oldest volley copy goes', () => {
    for (const w of [desktop, phone]) {
      let s = toActive(1, w);
      const t = s.run.t;
      const cap = capOf(w);
      const old: Decoy[] = Array.from({ length: cap }, (_, k) => ({
        id: 100 + k,
        at: { x: FAR.x + 6 * k, z: FAR.z - 10 },
        born: t - 5 + k,
        life: VOLLEY.decoyLife,
        state: 'open',
        mimic: false,
      }));
      // Planned 2.6 s less half a frame ago: it lands on the next frame.
      const v: Volley = { ...scriptedVolley(FAR, t - 2.6 + DT / 2, 200, w), cloud: true };
      s = { ...s, decoys: [...s.decoys, ...old], volleys: [v], nextId: 201 };
      const scriptedCopies = s.decoys.filter((d) => d.life === null);
      const next = step(s, IDLE, w);
      expect(next.volleys.find((x) => x.id === 200)?.state).toBe('landed');
      expect(next.decoys.find((d) => d.id === 200)).toEqual({
        id: 200, at: FAR, born: v.t0 + v.flight, life: VOLLEY.decoyLife, state: 'open', mimic: false,
      });
      const born = v.t0 + v.flight;
      const haze = next.clouds.find((c) => c.id === 200);
      expect(haze).toEqual({ id: 200, at: FAR, r: VOLLEY.cloudR, born, life: VOLLEY.cloudLife });
      expect(next.decoys.find((d) => d.id === 100)?.state).toBe('gone');
      for (let k = 1; k < cap; k++) expect(next.decoys.find((d) => d.id === 100 + k)?.state).toBe('open');
      expect(next.decoys.filter((d) => d.life !== null && d.state === 'open')).toHaveLength(cap);
      expect(next.decoys.filter((d) => d.life === null)).toEqual(scriptedCopies);
    }
  });

  it('a volley without haze leaves none; a copy that lands within 5 m of the route is retired, with no event', () => {
    let s = toActive(1);
    const route = s.route!.points;
    const onRoute = { x: (route[0].x + route[1].x) / 2, z: (route[0].z + route[1].z) / 2 };
    const a = scriptedVolley(FAR, s.run.t - 2.6 + DT / 2, 300, desktop);
    const b = scriptedVolley(onRoute, s.run.t - 2.6 + DT / 2, 301, desktop);
    s = { ...s, volleys: [a, b], nextId: 302 };
    const log: GameEvent[] = [];
    const next = step(s, IDLE, desktop, log);
    expect(next.clouds.filter((c) => c.id === 300 || c.id === 301)).toEqual([]);
    expect(next.decoys.find((d) => d.id === 300)?.state).toBe('open');
    expect(next.decoys.find((d) => d.id === 301)?.state ?? 'gone').toBe('gone');
    expect(log.filter((e) => e.type !== 'hint')).toEqual([]);
  });

  it("copies and haze a volley left go when their life runs out; the lakon's own stay", () => {
    let s = toActive(1);
    const t = s.run.t;
    // Each has 0.05 s of life left.
    const copy: Decoy = { id: 90, at: FAR, born: t - 19.95, life: VOLLEY.decoyLife, state: 'open', mimic: false };
    const haze: Cloud = { id: 91, at: FAR, r: VOLLEY.cloudR, born: t - 7.95, life: VOLLEY.cloudLife };
    expect([copy.born + VOLLEY.decoyLife, haze.born + VOLLEY.cloudLife].map((x) => x - t)).toEqual([
      expect.closeTo(0.05, 9),
      expect.closeTo(0.05, 9),
    ]);
    s = { ...s, decoys: [...s.decoys, copy], clouds: [...s.clouds, haze] };
    const scripted = { decoys: s.decoys.filter((d) => d.life === null), clouds: s.clouds.filter((c) => c.life === null) };
    expect(scripted.clouds).toHaveLength(2);
    s = step(s, IDLE);
    expect(s.decoys.some((d) => d.id === 90)).toBe(true);
    expect(s.clouds.some((c) => c.id === 91)).toBe(true);
    s = step(s, IDLE);
    expect(s.run.t).toBeGreaterThanOrEqual(t + 0.05);
    expect(s.decoys).toEqual(scripted.decoys);
    expect(s.clouds).toEqual(scripted.clouds);
  });

  it("haze slows the chariot as the drive's haze does, only while the lakon is active", () => {
    const s0 = toActive(1);
    const f = forward(s0.car.yaw);
    const moving: GameState = { ...s0, car: { ...s0.car, vx: 17 * f.x, vz: 17 * f.z } };
    const ahead = { x: s0.car.x + 4 * f.x, z: s0.car.z + 4 * f.z };
    const haze: Cloud = { id: 77, at: ahead, r: VOLLEY.cloudR, born: s0.run.t, life: VOLLEY.cloudLife };
    const hazed: GameState = { ...moving, clouds: [...moving.clouds, haze] };
    let a = moving;
    let b = hazed;
    for (let k = 0; k < 10; k++) {
      a = step(a, input({ throttle: 1 }));
      b = step(b, input({ throttle: 1 }));
    }
    const speed = (s: GameState) => Math.hypot(s.car.vx, s.car.vz);
    expect(speed(a)).toBeGreaterThan(16.5);
    expect(speed(b)).toBeLessThan(speed(a) - 2);
    // In roam the lakon's haze is not out yet: parva 1's own haze at (57, 8) slows nothing.
    const roam = startChapter(defOf(1), { x: 57 - 4, z: 8, yaw: 0 }, 1, desktop);
    expect(roam.run.phase).toBe('roam');
    let c: GameState = { ...roam, car: { ...roam.car, vx: 17, vz: 0 } };
    for (let k = 0; k < 10; k++) c = step(c, input({ throttle: 1 }));
    expect(speed(c)).toBeGreaterThan(16.5);
  });

  it('meeting the ranks adds nothing: 3 s held leave the clamour to its own watched step', () => {
    let s = toActive(1);
    s = { ...s, car: { ...initChariot(40, -10, Math.PI), vx: -17, vz: 0 } };
    const log: GameEvent[] = [];
    for (let k = 0; k < 3 / DT; k++) {
      const r = advance(s, input({ throttle: 1 }), DT, desktop);
      // No sight: the world's dt is the frame's.
      const own = stepRiuh(s.riuh, { t: r.state.run.t, ...zonesAt(r.state.car) }, DT);
      expect(r.state.riuh).toEqual(own);
      log.push(...r.events);
      s = r.state;
    }
    expect(types(log).filter((t) => t === 'held')).toEqual(['held']);
    expect(s.car.held).toBeGreaterThan(0);
    expect(zonesAt(s.car).watched).toBe(true);
    expect(s.riuh.value).toBeGreaterThan(0.9);
  });

  it('after a time fail at riuh 4 with a volley in the air, a retry calms the clamour and clears what volleys left', () => {
    const w = desktop;
    let s = startChapter(defOf(1), defOf(1).start, 1, w);
    const faults: string[] = [];
    for (let k = 0; k < 120 / DT && s.run.step === 0; k++) s = checkedStep(s, autopilot(s, w), w, faults);
    expect(s.run.step).toBe(1);
    expect(faults).toEqual([]);
    const t = 121;
    const air: Volley = { ...scriptedVolley(FAR, t - 1.5, s.nextId, w), state: 'air' };
    const at = { x: FAR.x, z: FAR.z + 8 };
    const copy: Decoy = { id: air.id + 1, at, born: t - 3, life: VOLLEY.decoyLife, state: 'open', mimic: false };
    const haze: Cloud = { id: air.id + 1, at: copy.at, r: VOLLEY.cloudR, born: t - 3, life: VOLLEY.cloudLife };
    s = {
      ...s,
      run: { ...s.run, t, checkpoint: { ...s.run.checkpoint!, riuh: 4 } },
      riuh: { ...s.riuh, value: 4, quietT: t },
      volleys: [air],
      decoys: [...s.decoys, copy],
      clouds: [...s.clouds, haze],
      nextVolley: t + 2,
      nextId: air.id + 2,
    };
    const log: GameEvent[] = [];
    const failed = step(s, IDLE, w, log);
    expect(log).toContainEqual({ type: 'failed', reason: 'time' });
    expect(failed.riuh.value).toBeGreaterThan(3.9);
    expect(failed.volleys.map((v) => v.state)).toEqual(['air']);
    expect(failed.decoys.some((d) => d.life !== null)).toBe(true);
    const back = retryFromCheckpoint(failed, w);
    expect(back.run.phase).toBe('active');
    expect(back.riuh.value).toBeLessThanOrEqual(1);
    expect(back.riuh.floorT).toBe(failed.run.t);
    expect(back.volleys).toEqual([]);
    expect(back.nextVolley).toBeNull();
    expect(back.decoys.filter((d) => d.life !== null)).toEqual([]);
    expect(back.clouds).toEqual(failed.clouds.filter((c) => c.life === null));
    expect(back.decoys.map((d) => d.id)).toEqual([1, 2, 3, 4]);
    // A retry from the live lakon (before the fail frame called the volleys off) also clears the schedule.
    const live = retryFromCheckpoint(s, w);
    expect(s.nextVolley).not.toBeNull();
    expect(live.nextVolley).toBeNull();
    expect(live.volleys).toEqual([]);
    // The first frame after the retry reports the calmer level.
    const after = advance(back, IDLE, DT, w);
    expect(after.events).toContainEqual({ type: 'level', level: riuhLevel(after.state.riuh.value) });
    expect(after.state.level).toBe(riuhLevel(after.state.riuh.value));
  });

  it('each active frame the clamour takes its own step from the zones the chariot is in, then the kicks of its events', () => {
    // Riuh, from zonesAt(car) and the kicks: recorded, filed, rewriteTaken and delivered (the tower's reach step closing).
    const expected = (prev: GameState, next: GameState, events: readonly GameEvent[]) => {
      if (prev.run.phase !== 'active') return prev.riuh;
      const t = next.run.t;
      let r = stepRiuh(prev.riuh, { t, ...zonesAt(next.car) }, next.sight.on ? DT / 2 : DT);
      for (const e of events) {
        if (e.type === 'recorded' || e.type === 'filed' || e.type === 'rewriteTaken') r = kickRiuh(r, e.type, t);
        const done = e.type === 'stepDone' ? prev.run.def.steps[e.step] : undefined;
        if (done?.kind === 'reach' && done.place === 'tower') r = kickRiuh(r, 'delivered', t);
      }
      return r;
    };
    // Every chapter with the autopilot; the prologue also with sight alone (it files the lesson) and with neither (it
    // takes it), so all four kicks come.
    const runs: [number, Partial<AutoOpts> | undefined][] = [
      ...CHAPTERS.map((ch): [number, undefined] => [ch, undefined]),
      [0, { avoidDecoys: false }],
      [0, { avoidDecoys: false, useSight: false }],
    ];
    const kicks = new Set<string>();
    const faults: string[] = [];
    let checkpoints = 0;
    for (const [ch, opts] of runs) {
      let s = startChapter(defOf(ch), defOf(ch).start, 1, desktop);
      const bot = createBot(opts);
      for (let k = 0; k < 240 / DT && s.run.phase !== 'done'; k++) {
        const out = advance(s, bot(s, desktop), DT, desktop);
        const at = `chapter ${ch}, t ${out.state.run.t.toFixed(2)}`;
        faults.push(...pressureFaults(s, out.state, desktop).faults);
        expect(out.state.riuh, at).toEqual(expected(s, out.state, out.events));
        for (const e of out.events) {
          if (e.type === 'stepDone' && s.run.def.steps[e.step].kind === 'reach') kicks.add('delivered');
          if (e.type === 'recorded' || e.type === 'filed' || e.type === 'rewriteTaken') kicks.add(e.type);
          // A checkpoint inside the lakon sees the live clamour: the value at the start of the frame that takes it.
          if (e.type === 'checkpoint' && s.run.phase === 'active') {
            checkpoints++;
            expect(out.state.run.checkpoint!.riuh, at).toBe(s.riuh.value);
          }
        }
        s = out.state;
      }
      expect(s.run.phase).toBe('done');
    }
    expect([...kicks].sort()).toEqual(['delivered', 'filed', 'recorded', 'rewriteTaken']);
    expect(checkpoints).toBeGreaterThanOrEqual(CHAPTERS.length);
    expect(faults).toEqual([]);
  }, BOT_TIMEOUT);

  it('past the grace, a copy filed takes 0.5 from the clamour and one taken without sight adds 1', () => {
    // Rolling at 5 m/s, a copy 1 m in front of the hull's middle; the clamour at 2.5 with its rise just restarted, so
    // neither its floor nor its decay moves it this frame.
    const s0 = toActive(1);
    const f = forward(s0.car.yaw);
    const m = hullMid(s0.car);
    const base: GameState = {
      ...s0,
      car: { ...s0.car, vx: 5 * f.x, vz: 5 * f.z },
      run: { ...s0.run, t: 50 },
      riuh: { value: 2.5, floorT: 50, quietT: 50, frozen: false },
      level: 2,
      // The copy met comes second in the list: every copy is looked at, not just the first.
      decoys: [
        { id: 98, at: FAR, born: 0, life: null, state: 'open', mimic: false },
        { id: 99, at: { x: m.x + f.x, z: m.z + f.z }, born: 0, life: null, state: 'open', mimic: false },
      ],
    };
    expect(zonesAt(base.car)).toEqual({ watched: false, shelter: false });
    const filed: GameEvent[] = [];
    expect(step(base, input({}, { sight: true }), desktop, filed).riuh.value).toBeCloseTo(2, 12);
    expect(types(filed)).toContain('filed');
    const taken: GameEvent[] = [];
    expect(step(base, IDLE, desktop, taken).riuh.value).toBeCloseTo(3.5, 12);
    expect(types(taken)).toContain('rewriteTaken');
  });

  it("each volley is planVolley's from the stored rng, with the route, a copy and haze from level 3; the rng is kept", () => {
    let planned = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      let s = toActive(1, desktop, seed);
      const f = forward(s.car.yaw);
      const r = rightOf(s.car.yaw);
      const o = { x: s.car.x, z: s.car.z };
      const pt = (a: number, b: number) => ({ x: o.x + a * f.x + b * r.x, z: o.z + a * f.z + b * r.z });
      // A route that zigzags through both landing bands (11–18 m ahead, 5–8 m to a side): the planner must keep off it.
      const route = { target: 'A', points: [o, pt(14, 6.5), pt(22, -6.5), pt(32, 6.5), pt(40, 0)] };
      s = { ...s, route, run: { ...s.run, t: 30 }, riuh: { ...s.riuh, value: 3.5, quietT: 1e9 }, level: 3, nextVolley: 30 };
      const next = step(s, IDLE);
      expect(next.route).toBe(route);
      const want = planVolley(next.car, next.run.t, s.rng, desktop, { decoy: true, cloud: true, id: s.nextId, route: route.points });
      expect(next.rng).toBe(want.rng);
      expect(next.rng).not.toBe(s.rng);
      expect(next.volleys).toEqual(want.volley ? [want.volley] : []);
      expect(next.nextId).toBe(s.nextId + (want.volley ? 1 : 0));
      if (!want.volley) continue;
      planned++;
      expect(polylineDist(want.volley.to, route.points)).toBeGreaterThanOrEqual(VOLLEY.routeClear);
    }
    expect(planned).toBeGreaterThanOrEqual(6);
  });

  it('the calm bonus sees the live clamour: delivered at riuh 1 or less it adds 100, above 1 nothing', () => {
    const w = desktop;
    let s = startChapter(defOf(1), defOf(1).start, 1, w);
    const states: GameState[] = [];
    const faults: string[] = [];
    for (let k = 0; k < 120 / DT && s.run.phase !== 'outro'; k++) {
      states.push(s);
      s = checkedStep(s, autopilot(s, w), w, faults);
    }
    expect(s.run.phase).toBe('outro');
    // Ten frames before the delivery, the clamour set to 1 or to 1.5; both ride on to the outro the same way.
    const from = states[states.length - 10];
    const deliver = (value: number) => {
      let x: GameState = { ...from, riuh: { ...from.riuh, value } };
      while (x.run.phase === 'active') x = checkedStep(x, autopilot(x, w), w, faults);
      return x.run.score;
    };
    expect(deliver(1) - deliver(1.5)).toBe(100);
    expect(faults).toEqual([]);
  });

  it('in roam the clamour stays 0 and no volley comes, even in a watch zone', () => {
    let s = startChapter(defOf(1), { x: 45, z: 30, yaw: 0 }, 1, desktop);
    expect(s.run.phase).toBe('roam');
    expect(zonesAt(s.car).watched).toBe(true);
    const log: GameEvent[] = [];
    for (let k = 0; k < 60 / DT; k++) s = step(s, IDLE, desktop, log);
    expect(s.run.phase).toBe('roam');
    expect(s.riuh.value).toBe(0);
    expect(s.volleys).toEqual([]);
    expect(types(log).filter((t) => t === 'volley' || t === 'level')).toEqual([]);
  });

  it('a level event fires once for each change of the whole level, with the new level', () => {
    // At run.t 54.5 the floor is 2.97: it carries the clamour from 2.95 to its cap of 3 at 55 s, and holds it there.
    let s = toActive(3);
    s = { ...s, run: { ...s.run, t: 54.5 }, riuh: { ...s.riuh, value: 2.95, quietT: 54.5 }, level: 2 };
    const log: GameEvent[] = [];
    for (let k = 0; k < 2 / DT; k++) s = step(s, IDLE, desktop, log);
    const levels = log.flatMap((e) => (e.type === 'level' ? [e.level] : []));
    expect(levels).toEqual([3]);
    expect(s.level).toBe(3);
    expect(s.riuh.value).toBe(3);
  });

  it('volleys follow the level: from run.t 20 the first after half the gap, then one a gap, each off the route', () => {
    let s = toActive(1);
    s = { ...s, run: { ...s.run, t: 19 }, riuh: { ...s.riuh, value: 2.5, quietT: 1e9 } };
    // Each volley as it stands on the frame of its event, with the route it was planned off.
    const log: { t: number; v: Volley; route: readonly { x: number; z: number }[] }[] = [];
    for (let k = 0; k < 20 / DT; k++) {
      const r = advance(s, IDLE, DT, desktop);
      s = r.state;
      for (const e of r.events) {
        if (e.type !== 'volley') continue;
        const v = r.state.volleys.find((y) => y.id === e.id);
        expect(v, `volley ${e.id} on its event frame`).toBeDefined();
        log.push({ t: s.run.t, v: v!, route: s.route!.points });
      }
    }
    // Level 2: a gap of 8 s, the first after 4 s once run.t reaches 20.
    expect(s.level).toBe(2);
    const times = log.map((x) => x.t);
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times[0]).toBeGreaterThanOrEqual(24 - 1e-9);
    expect(times[0]).toBeLessThan(24 + 2 * DT);
    for (let k = 1; k < times.length; k++) {
      expect(times[k] - times[k - 1]).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(times[k] - times[k - 1]).toBeLessThan(8 + 2 * DT);
    }
    for (const { t, v, route } of log) {
      expect(v.planned).toBe(t);
      expect(v.state).toBe('warn');
      expect(v.decoy).toBe(true);
      expect(v.cloud).toBe(false);
      expect(polylineDist(v.to, route)).toBeGreaterThanOrEqual(VOLLEY.routeClear);
    }
  });

  it('when the level falls to 0 the schedule stops; a new rise waits half a gap again', () => {
    let s = toActive(1);
    s = { ...s, run: { ...s.run, t: 30 }, riuh: { ...s.riuh, value: 2.5, quietT: 1e9 }, level: 2 };
    for (let k = 0; k < 6 / DT && s.nextVolley === null; k++) s = step(s, IDLE);
    expect(s.nextVolley).toBeCloseTo(30 + 4, 0);
    // Calmed to 0 (as a delivery or a shelter does): nothing is due any more.
    s = step({ ...s, riuh: { ...s.riuh, value: 0, floorT: s.run.t } }, IDLE);
    expect(s.level).toBe(0);
    expect(s.nextVolley).toBeNull();
    // Back at level 2 well past the old due time: the first volley still waits half the gap (4 s).
    s = step({ ...s, run: { ...s.run, t: 40 }, riuh: { ...s.riuh, value: 2.5, quietT: 1e9 } }, IDLE);
    const from = s.run.t;
    expect(s.nextVolley).toBeCloseTo(from + 4, 9);
    const log: GameEvent[] = [];
    for (let k = 0; k < 3.9 / DT; k++) s = step(s, IDLE, desktop, log);
    expect(types(log)).not.toContain('volley');
  });

  it("a chariot whose hull middle stands on the teaching volley's line has reached it; one just short has not", () => {
    const line = defOf(0).scripted.volleyLine!;
    const s = toActive(0);
    const yaw = s.car.yaw;
    // Facing due south (+z), the hull's middle lies 1.6 m ahead of the origin; the line runs along z = 11.
    const at = (z: number) => ({ ...s, car: initChariot(s.car.x, z - 1.6, yaw) });
    const on = advance(at(line.a.z), IDLE, DT, desktop);
    expect(hullMid(on.state.car).z).toBe(line.a.z);
    expect(on.events.filter((e) => e.type === 'volley')).toHaveLength(1);
    expect(on.state.scriptedPlanned).toBe(true);
    const short = advance(at(line.a.z - 0.01), IDLE, DT, desktop);
    expect(short.events.filter((e) => e.type === 'volley')).toEqual([]);
    expect(short.state.scriptedPlanned).toBe(false);
  });

  it('a scheduled volley and the scripted one on the same frame take the next two ids', () => {
    // The prologue, active at run.t 30 and level 2 with a volley due, the hull's middle 0.1 m short of the teaching
    // volley's line and rolling across it.
    const def = defOf(0);
    const line = def.scripted.volleyLine!;
    let s = toActive(0);
    const yaw = s.car.yaw;
    const f = forward(yaw);
    expect(f.z).toBeCloseTo(1, 12);
    const car = { ...initChariot(s.car.x, line.a.z - 0.1 - 1.6, yaw), vx: 6 * f.x, vz: 6 * f.z };
    s = { ...s, car, run: { ...s.run, t: 30 }, riuh: { ...s.riuh, value: 2.5, quietT: 1e9 }, level: 2, nextVolley: 30 };
    const r = advance(s, IDLE, DT, desktop);
    const ids = r.events.flatMap((e) => (e.type === 'volley' ? [e.id] : []));
    expect(ids).toEqual([s.nextId, s.nextId + 1]);
    expect(r.state.nextId).toBe(s.nextId + 2);
    expect(r.state.scriptedPlanned).toBe(true);
    expect(r.state.volleys.map((v) => v.id)).toEqual(ids);
    // The scheduled one first, then the scripted one at its spot.
    expect(r.state.volleys[1].to).toEqual(line.at);
  });

  it('from level 3 the volleys carry haze', () => {
    let s = toActive(1);
    s = { ...s, run: { ...s.run, t: 50 }, riuh: { ...s.riuh, value: 3.5, quietT: 1e9 } };
    const planned: Volley[] = [];
    for (let k = 0; k < 12 / DT; k++) {
      const r = advance(s, IDLE, DT, desktop);
      s = r.state;
      for (const e of r.events) if (e.type === 'volley') planned.push(s.volleys.find((v) => v.id === e.id)!);
    }
    expect(planned.length).toBeGreaterThanOrEqual(1);
    for (const v of planned) expect(v).toEqual(expect.objectContaining({ decoy: true, cloud: true }));
  });

  it('with the clamour and volleys running, the same def, seed and inputs for 600 frames give deep-equal states', () => {
    const run = (seed: number) => {
      let s = toActive(3, desktop, seed);
      s = { ...s, run: { ...s.run, t: 50 }, riuh: { ...s.riuh, value: 4.2, quietT: 50 } };
      const states: GameState[] = [];
      const planned: Volley[] = [];
      const faults: string[] = [];
      for (let k = 0; k < 600; k++) {
        const auto = autopilot(s, desktop);
        const steer = auto.drive.steer + 0.3 * Math.sin(k / 17);
        const r = advance(s, { ...auto, drive: { ...auto.drive, steer } }, DT, desktop);
        faults.push(...pressureFaults(s, r.state, desktop).faults);
        s = r.state;
        for (const e of r.events) if (e.type === 'volley') planned.push(s.volleys.find((v) => v.id === e.id)!);
        states.push(s);
      }
      return { states, planned, faults };
    };
    const a = run(2);
    const b = run(2);
    expect(a.faults).toEqual([]);
    expect(b.faults).toEqual([]);
    expect(a.planned.length).toBeGreaterThanOrEqual(2);
    for (let k = 0; k < 600; k += 37) expect(b.states[k]).toEqual(a.states[k]);
    expect(b.states[599]).toEqual(a.states[599]);
    // The seed is the volleys' only randomness: another seed lands the first one elsewhere.
    const c = run(3);
    expect(c.faults).toEqual([]);
    expect(c.planned[0].to).not.toEqual(a.planned[0].to);
  });
});

describe('hints', () => {
  /**
   * The brief's prologue for one driver: the bot's steering throughout; after the 8th record the throttle and brake are
   * scripted so the car comes within 25 m of the tower's centre above 8 m/s, enters the reach circle at 5–7 m/s, then
   * stops. It runs on HINT_SECONDS past the outro's start so the last hint's time on the HUD is complete. Each fired
   * hint notes the copies that make it due then (hintCopies), each planned volley its landing, each frame the hint on
   * the HUD and whether the chariot is approaching the lesson copy, and `reach` where it reaches that copy. The clamour
   * of these drivers may reach level 1, but it falls back before a scheduled volley is due: the only volley is the
   * teaching one (the order test asserts it), so a run does not depend on its seed, and drivers, not seeds, vary.
   */
  function scriptedPrologue(d: Driver) {
    const w = desktop;
    const def = defOf(0);
    let s = startChapter(def, def.start, 1, w);
    const drive = driverOf(d);
    const log: GameEvent[] = [];
    const fired: { key: HintKey; clock: number; on: Decoy[] }[] = [];
    const volleys: { x: number; z: number }[] = [];
    const frames: { clock: number; hint: HintKey | null; approach: boolean }[] = [];
    const reach = lessonReach();
    let fastNear = false;
    let entry: number | null = null;
    let end = Infinity;
    for (let k = 0; k < 240 / DT && s.clock < end; k++) {
      const auto = drive(s, w);
      let pedals = auto.drive;
      if (s.run.recorded.length === 8 && s.run.phase === 'active') {
        const dd = dist(hullMid(s.car), ANCHORS.tower);
        const v = Math.hypot(s.car.vx, s.car.vz);
        if (dd > 22) pedals = { ...pedals, throttle: 1, brake: 0 };
        else if (dd > RECORD_CIRCLE) pedals = { ...pedals, throttle: v < 5.5 ? 1 : 0, brake: v > 6.5 ? 0.5 : 0 };
        else pedals = { ...pedals, throttle: 0, brake: v > 0.05 ? 1 : 0 };
        if (dd <= 25 && v > 8) fastNear = true;
        if (entry === null && dd <= RECORD_CIRCLE) entry = v;
      }
      s = step(s, { ...auto, drive: pedals }, w, log);
      for (const e of log.splice(0)) {
        if (e.type === 'hint') fired.push({ key: e.key, clock: s.clock, on: isCopyHint(e.key) ? hintCopies(e.key, s) : [] });
        if (e.type === 'volley') volleys.push(s.volleys.find((v) => v.id === e.id)!.to);
        if (e.type === 'outroStart') end = s.clock + HINT_SECONDS;
      }
      frames.push({ clock: s.clock, hint: hudOf(s, w).hint, approach: approaching(s) });
      reach.see(s);
    }
    return { s, fired, volleys, frames, reach: reach.at(), fastNear, entry };
  }

  /** The drivers the order is pinned for: the autopilot, and the first-time player at speedCap 0.3–0.8 either way. */
  const TAUGHT = SWEEP.filter(upright);

  it.each(TAUGHT.map((d) => [name(d), d] as const))(
    '%s: the prologue teaches ride, steer, rewrites, sight, slow and stop in order, once each, steer for its full time',
    (_name, d) => {
      const { s, fired, volleys, frames, reach, fastNear, entry } = scriptedPrologue(d);
      expect(fastNear).toBe(true);
      expect(entry).not.toBeNull();
      expect(entry!).toBeGreaterThanOrEqual(5);
      expect(entry!).toBeLessThanOrEqual(7);
      // The only volley is the teaching one: no scheduled volley comes for these drivers.
      expect(volleys).toEqual([defOf(0).scripted.volleyLine!.at]);
      // A volley's copy never brings a copy hint, so the teaching copy brings none: only the lesson copy does.
      const order: HintKey[] = ['ride', 'steer', 'rewrites', 'sight', 'slow', 'stop'];
      expect(fired.map((f) => f.key)).toEqual(order);
      expect(s.hintsShown).toEqual(order);
      // The sight lesson is still on the HUD when the chariot reaches the lesson copy: no other hint has replaced it.
      expect(reach.hint, `at ${reach.clock.toFixed(2)}, sight fired at ${fired[3].clock.toFixed(2)}`).toBe('sight');
      // Each stays on the HUD until the next replaces it, which is never sooner than HINT_MIN; the last for HINT_SECONDS.
      fired.forEach((f, k) => {
        const until = Math.min(fired[k + 1]?.clock ?? Infinity, f.clock + HINT_SECONDS);
        expect(until - f.clock).toBeGreaterThanOrEqual(HINT_MIN - 1e-9);
        const on = frames.filter((v) => v.clock >= f.clock && v.clock < until - 1e-9);
        expect(on.length).toBeGreaterThan(0);
        for (const v of on) expect(v.hint, `${f.key} at ${v.clock.toFixed(2)}`).toBe(f.key);
      });
      // Nothing cuts steer short: the next hint comes after its full HINT_SECONDS.
      const steer = fired.findIndex((f) => f.key === 'steer');
      expect(fired[steer + 1].clock - fired[steer].clock).toBeGreaterThanOrEqual(HINT_SECONDS - 1e-9);
    },
    BOT_TIMEOUT,
  );

  it.each(
    TAUGHT.filter((d) => theAutopilot(d) || d.speedCap === 0.6).map((d) => [name(d), d] as const),
  )('%s: rewrites before the lesson copy is approached; sight on the lesson copy, 2 s of it shown on the approach', (_name, d) => {
    const def = defOf(0);
    const { fired, frames } = scriptedPrologue(d);
    const near = frames.filter((f) => f.approach);
    expect(near.length).toBeGreaterThan(0);
    // rewrites on the lesson copy, the lakon's own, within 30 m in front, before the chariot first approaches it.
    const own = (f: (typeof fired)[number]) => f.on.filter((x) => x.life === null).map((x) => x.at);
    const rewrites = fired.find((f) => f.key === 'rewrites')!;
    expect(own(rewrites)).toEqual([def.scripted.decoys[0]]);
    expect(rewrites.clock).toBeLessThan(near[0].clock);
    // sight on the lesson copy, within 15 m in front.
    const sight = fired.find((f) => f.key === 'sight')!;
    expect(own(sight)).toEqual([def.scripted.decoys[0]]);
    // Frame by frame, sight on the HUD while the chariot approaches the lesson copy: 2 s or more.
    const shown = frames.filter((f) => f.hint === 'sight' && f.approach).length * DT;
    expect(shown).toBeGreaterThanOrEqual(2);
  }, BOT_TIMEOUT);

  /**
   * The prologue at its first active frame with the chariot at rest, heading along L7→L8 (clear ground), the lesson copy
   * `ahead` m in front of the hull's middle and `side` m to its right. The lessons shown are `shown`, the last fired
   * `age` s ago; when that is sight, it follows the lesson copy (hintCopy).
   */
  function lessonScene(
    ahead: number,
    side: number,
    age: number,
    shown: HintKey[] = ['ride', 'steer', 'rewrites', 'sight'],
  ): GameState {
    const s = toActive(0);
    const copy = s.decoys.find((d) => d.life === null)!;
    const yaw = yawOf({ x: 16, z: 20 });
    const f = forward(yaw);
    const r = rightOf(yaw);
    const mid = { x: copy.at.x - ahead * f.x - side * r.x, z: copy.at.z - ahead * f.z - side * r.z };
    const car = initChariot(mid.x - HULL.offsets[1] * f.x, mid.z - HULL.offsets[1] * f.z, yaw);
    const hintCopy = shown.at(-1) === 'sight' ? copy.id : null;
    return { ...s, car, hintsShown: shown, hintQueue: [], hintAt: s.clock - age, hintCopy };
  }
  const lessonCopy = (s: GameState) => s.decoys.find((d) => d.life === null)!;

  it('the sight lesson stays past 3.5 s while its copy is ahead, and ends the frame after the copy is taken or filed', () => {
    for (const mata of [false, true]) {
      let s = lessonScene(6, 0, 4);
      expect(hudOf(s, desktop).hint).toBe('sight');
      for (let k = 0; k < 8 / DT && lessonCopy(s).state === 'open'; k++) {
        s = step(s, input({ throttle: 0.4 }, { sight: mata }));
        // Still ahead, or met on this very frame.
        expect(hudOf(s, desktop).hint, `frame ${k}`).toBe('sight');
      }
      expect(lessonCopy(s).state).toBe(mata ? 'filed' : 'taken');
      expect(s.clock - s.hintAt).toBeGreaterThan(HINT_SECONDS);
      expect(s.clock - s.hintAt).toBeLessThan(SIGHT_LESSON.most);
      const after = step(s, IDLE);
      expect(hudOf(after, desktop).hint).toBeNull();
      expect(sameHud(hudOf(s, desktop), hudOf(after, desktop))).toBe(false);
    }
  });

  it('the sight lesson shows for HINT_SECONDS at least, even when its copy is met sooner', () => {
    let s = lessonScene(3, 0, 0);
    const from = s.hintAt;
    for (let k = 0; k < 2 / DT && lessonCopy(s).state === 'open'; k++) s = step(s, input({ throttle: 0.4 }));
    expect(lessonCopy(s).state).toBe('taken');
    expect(s.clock - from).toBeLessThan(HINT_SECONDS - 1);
    while (s.clock - from < HINT_SECONDS) {
      expect(hudOf(s, desktop).hint).toBe('sight');
      s = step(s, IDLE);
    }
    expect(hudOf(s, desktop).hint).toBeNull();
  });

  it('beside or behind the hull its copy is not yet passed; 20 m off it is, and the lesson ends then for good', () => {
    // Driving past the copy 4 m to its side: it goes beside the hull, then behind it, and the lesson stays.
    let s = lessonScene(6, 4, 4);
    let behind = 0;
    let gap = dist(hullMid(s.car), lessonCopy(s).at);
    for (let k = 0; k < 8 / DT && gap <= SIGHT_LESSON.passed; k++) {
      s = step(s, input({ throttle: 0.4 }));
      gap = dist(hullMid(s.car), lessonCopy(s).at);
      if (!inFront(s, lessonCopy(s).at, SIGHT_LESSON.passed)) behind++;
      // Within 20 m until now, or passed on this very frame.
      expect(hudOf(s, desktop).hint, `frame ${k}, ${gap.toFixed(2)} m`).toBe('sight');
    }
    expect(behind).toBeGreaterThan(1 / DT);
    expect(gap).toBeGreaterThan(SIGHT_LESSON.passed);
    expect(lessonCopy(s).state).toBe('open');
    expect(s.clock - s.hintAt).toBeLessThan(SIGHT_LESSON.most);
    s = step(s, IDLE);
    expect(hudOf(s, desktop).hint).toBeNull();
    // Turned round and back within 20 m of it, facing it: the lesson is over and does not come back.
    const yaw = s.car.yaw + Math.PI;
    const back = initChariot(s.car.x - 6 * Math.cos(s.car.yaw), s.car.z + 6 * Math.sin(s.car.yaw), yaw);
    s = step({ ...s, car: back }, IDLE);
    expect(inFront(s, lessonCopy(s).at, SIGHT_LESSON.passed)).toBe(true);
    expect(hudOf(s, desktop).hint).toBeNull();
  });

  it('the sight lesson ends when its copy lies more than 20 m off', () => {
    expect(SIGHT_LESSON.passed).toBe(20);
    expect(hudOf(step(lessonScene(19.5, 0, 4), IDLE), desktop).hint).toBe('sight');
    expect(hudOf(step(lessonScene(20.5, 0, 4), IDLE), desktop).hint).toBeNull();
  });

  it('stopped beside its copy, the chariot keeps the sight lesson until 12 s after it fired, no longer', () => {
    expect(SIGHT_LESSON.most).toBe(12);
    let s = lessonScene(0.5, 3, 0);
    const from = s.hintAt;
    while (s.clock - from < SIGHT_LESSON.most) {
      expect(hudOf(s, desktop).hint, `at ${(s.clock - from).toFixed(2)} s`).toBe('sight');
      s = step(s, IDLE);
    }
    expect(s.clock - from).toBeLessThan(SIGHT_LESSON.most + DT);
    expect(hudOf(s, desktop).hint).toBeNull();
    expect(lessonCopy(s).state).toBe('open');
    expect(inFront(s, lessonCopy(s).at, 4)).toBe(true);
  });

  it('the sight lesson ends with the active phase: a skip to the record right after it fires does not keep it through the outro (L748)', () => {
    // Stopped beside its copy, which would keep the lesson for 12 s; HINT_SECONDS have passed since it fired.
    const s = lessonScene(0.5, 3, HINT_SECONDS + 0.5);
    expect(hudOf(s, desktop).hint).toBe('sight');
    let t = skipToRecord(s).state;
    expect(t.run.phase).not.toBe('active');
    t = step(t, IDLE);
    expect(t.hintCopy).toBeNull();
    expect(hudOf(t, desktop).hint).toBeNull();
    expect(lessonCopy(t).state).toBe('open');
    // The same scene without the skip keeps the lesson: the phase, not the copy, let it go.
    const kept = step(s, IDLE);
    expect(kept.hintCopy).not.toBeNull();
    expect(hudOf(kept, desktop).hint).toBe('sight');
  });

  it('a hint that comes due meanwhile replaces the sight lesson under the queue rules, and sight does not come back', () => {
    // steer not yet shown: 31° off the way to L1 it comes due at once, and the lesson has been up for HINT_MIN.
    let s = lessonScene(6, 0, 4, ['ride', 'rewrites', 'sight']);
    expect(hudOf(s, desktop).hint).toBe('sight');
    const log: GameEvent[] = [];
    s = step(s, IDLE, desktop, log);
    expect(hintKeys(log)).toEqual(['steer']);
    expect(hudOf(s, desktop).hint).toBe('steer');
    expect(s.hintCopy).toBeNull();
    while (s.clock - s.hintAt < HINT_SECONDS) s = step(s, IDLE);
    expect(inFront(s, lessonCopy(s).at, COPY_HINTS.sight)).toBe(true);
    expect(hudOf(s, desktop).hint).toBeNull();
  });

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

  /** The objective (and the lap) after every frame of an autopilot run of chapter `ch`, each change once. */
  function objectivesOf(ch: number): string[] {
    const w = desktop;
    let s = startChapter(defOf(ch), defOf(ch).start, 1, w);
    const seen: string[] = [];
    for (let k = 0; k < 240 / DT && s.run.phase !== 'done'; k++) {
      s = step(s, autopilot(s, w), w);
      const h = hudOf(s, w);
      const o = h.lap === null ? h.objective : `${h.objective} ${h.lap}`;
      if (seen.at(-1) !== o) seen.push(o);
    }
    expect(s.run.phase).toBe('done');
    return seen;
  }

  it('parva 2: the gate while the letter is carried, stop in its circle; each leg shows its own timer', () => {
    expect(objectivesOf(2)).toEqual(['collect', 'gate', 'stop', 'collect', 'tower', 'stop', 'none']);
    const w = desktop;
    // The letter lies on the marker: the first active frame records it.
    let s = step(toActive(2), IDLE);
    expect(hudOf(s, w)).toMatchObject({ type: 'antar', objective: 'gate', done: 1, total: 2, lap: null });
    expect(hudOf(s, w).timer).toBeLessThanOrEqual(75);
    for (let k = 0; k < 120 / DT && s.run.step < 2; k++) s = step(s, autopilot(s, w), w);
    expect(s.run.step).toBe(2);
    expect(hudOf(s, w)).toMatchObject({ objective: 'collect', timer: 90 });
  }, BOT_TIMEOUT);

  it('parva 4: the course, done/total counting the real gates recorded of 9', () => {
    const w = desktop;
    let s = toActive(4);
    expect(hudOf(s, w)).toMatchObject({ type: 'lintasan', objective: 'course', done: 0, total: 9, lap: null });
    const log: GameEvent[] = [];
    for (let k = 0; k < 60 / DT && s.run.recorded.length < 2; k++) s = step(s, autopilot(s, w), w, log);
    expect(hudOf(s, w)).toMatchObject({ objective: 'course', done: 2, total: 9 });
    expect(log.filter((e) => e.type === 'gate')).toEqual([
      { type: 'gate', real: true, day: 1 },
      { type: 'gate', real: true, day: 3 },
    ]);
  }, BOT_TIMEOUT);

  it('parva 5: the laps with the lap number, then the record once two laps match, then the tower', () => {
    expect(objectivesOf(5)).toEqual(['laps 1', 'laps 2', 'collect', 'tower', 'stop', 'none']);
    expect(hudOf(toActive(5), desktop)).toMatchObject({ type: 'uji', objective: 'laps', lap: 1, done: 0, total: 1 });
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

  /** The state with the clamour at `value`. */
  const loud = (s: GameState, value: number): GameState => ({ ...s, riuh: { ...s.riuh, value } });

  it('the clamour, its whole level and the static of that level; none in roam', () => {
    const s = toActive(1);
    expect(hudOf(s, desktop)).toMatchObject({ riuh: 0, level: 0, staticFrac: 0 });
    expect(hudOf(loud(s, 2.5), desktop)).toMatchObject({ riuh: 2.5, level: 2, staticFrac: 0 });
    expect(hudOf(loud(s, 3.99), desktop)).toMatchObject({ riuh: 3.99, level: 3, staticFrac: 0 });
    expect(hudOf(loud(s, 4.2), desktop)).toMatchObject({ riuh: 4.2, level: 4, staticFrac: 0.3 });
    expect(hudOf(loud(s, 5), desktop)).toMatchObject({ riuh: 5, level: 5, staticFrac: 0.45 });
    // A real rise: at rest in the ranks' watch zone, 7 m clear of the Kurawa block, the snapshot follows the engine
    // up to the grace's cap of 2.
    let r = step({ ...s, car: initChariot(24, 20, 0) }, IDLE);
    expect(zonesAt(r.car).watched).toBe(true);
    for (let k = 0; k < 20 / DT && r.riuh.value < 2; k++) r = step(r, IDLE);
    expect(hudOf(r, desktop)).toMatchObject({ riuh: r.riuh.value, level: 2, staticFrac: 0 });
    const roam = startChapter(defOf(1), TOWER_EXIT, 1, desktop);
    expect(roam.run.phase).toBe('roam');
    expect(hudOf(roam, desktop)).toMatchObject({ riuh: 0, level: 0, staticFrac: 0 });
  });

  it('the radar: its items, its range from the forward speed, and the heading as a compass bearing', () => {
    let s = toActive(1);
    expect(hudOf(s, desktop).radarM).toBe(70);
    for (let k = 0; k < 60; k++) s = step(s, input({ throttle: 1 }));
    const h = hudOf(s, desktop);
    expect(RADAR_PX).toBe(148);
    expect(h.radar).toEqual(radarItems(s, desktop, RADAR_PX));
    expect(h.radar.filter((i) => i.kind === 'record')).toHaveLength(2);
    expect(h.radar.filter((i) => i.kind === 'tower')).toHaveLength(1);
    expect(h.radarM).toBe(radarRange(speedOf(s.car)));
    expect(h.radarM).toBeGreaterThan(90);
    // Whole degrees from north, clockwise; the drive does not wrap the yaw.
    const facing = (yaw: number) => hudOf({ ...s, car: { ...s.car, yaw } }, desktop).heading;
    expect(facing(Math.PI / 2)).toBe(0);
    expect(facing(0)).toBe(90);
    expect(facing(-Math.PI / 2)).toBe(180);
    expect(facing(Math.PI)).toBe(270);
    expect(facing(Math.PI / 2 - (30 * Math.PI) / 180)).toBe(30);
    expect(facing(Math.PI / 2 + (0.3 * Math.PI) / 180)).toBe(0);
    expect(facing(Math.PI / 2 + (0.7 * Math.PI) / 180)).toBe(359);
    expect(facing(-4 * Math.PI)).toBe(90);
    expect(facing(5 * Math.PI)).toBe(270);
  });

  it('sameHud: false when the clamour moves by more than 0.05, the level, the static, the radar, its metres or the heading change', () => {
    const s = loud(toActive(1), 2.5);
    const a = hudOf(s, desktop);
    expect(sameHud(a, hudOf(s, desktop))).toBe(true);
    expect(sameHud(a, { ...a, riuh: 2.54 })).toBe(true);
    expect(sameHud(a, { ...a, riuh: 2.46 })).toBe(true);
    expect(sameHud(a, { ...a, riuh: 2.56 })).toBe(false);
    expect(sameHud(a, { ...a, riuh: 2.44 })).toBe(false);
    expect(sameHud(a, { ...a, level: 3 })).toBe(false);
    expect(sameHud(a, { ...a, staticFrac: 0.3 })).toBe(false);
    expect(sameHud(a, { ...a, heading: (a.heading + 1) % 360 })).toBe(false);
    expect(sameHud(a, { ...a, radarM: a.radarM + 0.2 })).toBe(true);
    expect(sameHud(a, { ...a, radarM: a.radarM + 1 })).toBe(false);
    // The radar: its count, a kind, a position by 1 px or more, but not less.
    const moved = (dx: number, dy: number): HudSnapshot => ({ ...a, radar: a.radar.map((i, k) => (k === 0 ? { ...i, x: i.x + dx, y: i.y + dy } : i)) });
    expect(sameHud(a, moved(0.5, -0.5))).toBe(true);
    expect(sameHud(a, moved(0.7, 0.7))).toBe(true);
    expect(sameHud(a, moved(0.71, 0.71))).toBe(false);
    expect(sameHud(a, moved(1, 0))).toBe(false);
    expect(sameHud(a, moved(0, -1.5))).toBe(false);
    expect(sameHud(a, { ...a, radar: a.radar.slice(1) })).toBe(false);
    expect(sameHud(a, { ...a, radar: a.radar.map((i, k) => (k === a.radar.length - 1 ? { ...i, kind: 'post' as const } : i)) })).toBe(false);
  });

  it('a creeping chariot moves the radar now and then, not every frame, and the radar never freezes', () => {
    // 1 cm a frame for 600 frames: 6 m, about 5.7 px at rest (the rim points of a cut outline slide a little faster), and
    // on the way the tower leaves the range and a shelter comes into it. The island keeps the snapshot shown while
    // sameHud holds.
    const base = toActive(1);
    let shown = hudOf(base, desktop);
    let renders = 0;
    let last = shown;
    for (let k = 1; k <= 600; k++) {
      last = hudOf({ ...base, car: { ...base.car, x: base.car.x + 0.01 * k } }, desktop);
      if (sameHud(shown, last)) continue;
      renders++;
      shown = last;
    }
    expect(renders).toBeGreaterThanOrEqual(4);
    expect(renders).toBeLessThanOrEqual(10);
    expect(shown.radar.map((i) => i.kind)).toEqual(last.radar.map((i) => i.kind));
    shown.radar.forEach((i, k) => {
      expect(Math.abs(i.x - last.radar[k].x)).toBeLessThan(1);
      expect(Math.abs(i.y - last.radar[k].y)).toBeLessThan(1);
    });
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

describe('the edge brakes like the guard', () => {
  const FRAME = 1 / 60;
  const A = GUARD.decel;
  /** 120 m due north of the field's centre, where outward is −z: chapter 1's roam, open ground out to the edge. */
  const START = { x: PLAY.cx, z: PLAY.cz - 120 };

  interface EdgeFrame {
    r: number;
    /** Speed out along the radius (negative inward) and along the edge, m/s. */
    out: number;
    along: number;
    speed: number;
    yaw: number;
    boostT: number;
    edgeCut: number;
  }

  function measure(s: GameState): EdgeFrame {
    const dx = s.car.x - PLAY.cx;
    const dz = s.car.z - PLAY.cz;
    const r = Math.hypot(dx, dz);
    return {
      r,
      out: (s.car.vx * dx + s.car.vz * dz) / r,
      along: (s.car.vz * dx - s.car.vx * dz) / r,
      speed: Math.hypot(s.car.vx, s.car.vz),
      yaw: s.car.yaw,
      boostT: s.car.boostT,
      edgeCut: s.car.edgeCut,
    };
  }

  /** `seconds` of 1/60 s frames of `drive` from `from`; frames[0] is the start. */
  function ride(from: GameState, drive: (s: GameState) => Partial<ChariotInput>, seconds: number, dt = FRAME) {
    let s = from;
    const frames = [measure(s)];
    const log: GameEvent[] = [];
    for (let k = 0; k < Math.round(seconds / dt); k++) {
      const r = advance(s, input(drive(s)), dt, desktop);
      s = r.state;
      log.push(...r.events);
      frames.push(measure(s));
    }
    return { end: s, frames, log };
  }

  /** From START heading `yaw` at `speed` m/s. */
  function outward(yaw: number, speed: number): GameState {
    const s = startChapter(defOf(1), { ...START, yaw }, 1, desktop);
    expect(s.run.phase).toBe('roam');
    const f = forward(yaw);
    return { ...s, car: { ...s.car, vx: speed * f.x, vz: speed * f.z } };
  }

  /** The brief's checks on one run: no dead stop, never past 160 m, at rest out along the radius within 2 s of braking. */
  function expectBraked(frames: EdgeFrame[], log: GameEvent[]) {
    const onset = frames.findIndex((f) => f.edgeCut > 0);
    expect(onset).toBeGreaterThan(0);
    expect(frames[onset].r).toBeLessThan(PLAY.r - 1);
    let worst = 0;
    for (let k = 1; k < frames.length; k++) {
      expect(frames[k].r).toBeLessThanOrEqual(PLAY.r + 1e-9);
      worst = Math.max(worst, (frames[k - 1].out - frames[k].out) / FRAME);
    }
    expect(worst).toBeLessThanOrEqual(A + 1);
    const rest = frames.findIndex((f, k) => k >= onset && f.out <= REST_SPEED);
    expect(rest).toBeGreaterThan(onset);
    expect((rest - onset) * FRAME).toBeLessThanOrEqual(2);
    // It stays at rest on the edge, held there: it neither creeps out nor falls back in.
    for (const f of frames.slice(rest)) {
      expect(f.out).toBeLessThanOrEqual(REST_SPEED);
      expect(f.r).toBeGreaterThan(PLAY.r - 0.05);
    }
    // Like the guard: no shake, no bump, no held message; the wall's own message as before.
    expect(types(log)).not.toContain('bump');
    expect(types(log)).not.toContain('held');
    expect(types(log).filter((t) => t === 'wall')).toEqual(['wall']);
    return { onset, rest, worst };
  }

  it('straight out at 17 m/s: braked at 14 m/s² to rest on the edge, not stopped dead', () => {
    const { frames, log, end } = ride(outward(Math.PI / 2, 17), () => ({ throttle: 1 }), 5);
    const { onset } = expectBraked(frames, log);
    for (let k = 1; k < frames.length; k++) expect((frames[k - 1].speed - frames[k].speed) / FRAME).toBeLessThanOrEqual(A + 1);
    // The braking starts where 17 m/s needs about 10.3 m: from about 149.7 m.
    expect(frames[onset].r).toBeGreaterThan(149);
    expect(end.cam.shake).toBe(0);
    expect(end.car.held).toBe(0);
  });

  it('at 25 m/s with Laju held: Laju is cancelled as the braking starts, and its cooldown stands', () => {
    const { frames, log, end } = ride(outward(Math.PI / 2, 25), () => ({ throttle: 1, boost: true }), 5);
    const { onset } = expectBraked(frames, log);
    for (let k = 1; k < frames.length; k++) expect((frames[k - 1].speed - frames[k].speed) / FRAME).toBeLessThanOrEqual(A + 1);
    // 25 m/s needs about 22.3 m: the braking starts near 137.7 m, with the surge still running.
    expect(frames[onset].r).toBeLessThan(139);
    expect(frames[onset - 1].boostT).toBeGreaterThan(0);
    expect(frames[onset - 1].speed).toBeGreaterThan(24.9);
    // The cooldown alone keeps it off for the rest of this run; the run along the edge, below, shows the edge doing so.
    for (const f of frames.slice(onset)) expect(f.boostT).toBe(0);
    // It ran 0.7 s before the edge cancelled it, so its cooldown stands.
    expect(end.car.cooldown).toBeGreaterThan(0);
  });

  it('at 17 m/s at 45° to the radius: braked out along the radius only, and it keeps moving along the edge', () => {
    const { frames, log } = ride(outward(Math.PI / 4, 17), () => ({ throttle: 1 }), 6);
    const { onset, rest } = expectBraked(frames, log);
    expect(Math.abs(frames[onset].along)).toBeGreaterThan(8);
    // The 2 s after it comes to rest out along the radius: still sliding along the edge, every frame.
    const after = frames.slice(rest, rest + 2 / FRAME);
    expect(after).toHaveLength(2 / FRAME);
    for (const f of after) expect(Math.abs(f.along)).toBeGreaterThan(0.15);
    expect(after.reduce((m, f) => m + Math.abs(f.along) * FRAME, 0)).toBeGreaterThan(0.3);
  });

  it('Laju held 9 s while it runs on along the edge: one surge, which the edge cancels, and none while the edge brakes', () => {
    // On the edge due north of the centre, heading 0.2 rad out from the edge line (east), the reins holding that angle.
    const ALONG = 0.2;
    const alongEdge = (s: GameState): Partial<ChariotInput> => {
      const dx = s.car.x - PLAY.cx;
      const dz = s.car.z - PLAY.cz;
      const r = Math.hypot(dx, dz);
      const want = yawOf({
        x: Math.cos(ALONG) * (-dz / r) + Math.sin(ALONG) * (dx / r),
        z: Math.cos(ALONG) * (dx / r) + Math.sin(ALONG) * (dz / r),
      });
      return { throttle: 1, boost: true, steer: clamp(4 * angleDiff(s.car.yaw, want), -1, 1) };
    };
    // From 0.5 m inside the edge it brakes within 0.2 s of the surge's start, so the surge is refunded at once. From 3 m
    // inside the surge runs 0.57 s and keeps its cooldown, which runs out at 7 s.
    for (const [inside, refunded, readyFor] of [
      [0.5, true, 500],
      [3, false, 100],
    ] as const) {
      const from = startChapter(defOf(1), { x: PLAY.cx, z: PLAY.cz - (PLAY.r - inside), yaw: ALONG }, 1, desktop);
      const f = forward(ALONG);
      let s: GameState = { ...from, car: { ...from.car, vx: 17 * f.x, vz: 17 * f.z } };
      let starts = 0;
      let surgingBraked = 0;
      let ready = 0;
      let cancelledAt: number | null = null;
      for (let k = 0; k < 9 / FRAME; k++) {
        const prev = s.car;
        s = advance(s, input(alongEdge(s)), FRAME, desktop).state;
        const c = s.car;
        if (c.cooldown > prev.cooldown) starts++;
        if (cancelledAt === null && prev.boostT > 0 && c.boostT === 0) cancelledAt = c.cooldown;
        if (c.edgeCut > 0 && c.boostT > 0) surgingBraked++;
        // Every other thing a surge needs holds: its cooldown run out and the chariot moving on at over 1 m/s.
        if (c.edgeCut > 0 && c.cooldown === 0 && speedOf(c) > 1) ready++;
      }
      const where = `${inside} m inside`;
      expect(starts, where).toBe(1);
      expect(surgingBraked, where).toBe(0);
      expect(cancelledAt, where).not.toBeNull();
      if (refunded) expect(cancelledAt, where).toBe(0);
      else expect(cancelledAt, where).toBeGreaterThan(6);
      // So for frames on end only the edge braking keeps a new surge from starting.
      expect(ready, where).toBeGreaterThan(readyFor);
      expect(measure(s).r, where).toBeGreaterThan(PLAY.r - 0.05);
    }
  });

  it('with uneven frames (1/50, 1/70, 1/90 and 1/45 s in turn) it brakes at most 17 m/s² a frame and stays inside 160 m', () => {
    // Uneven frames take different substeps, and the soft wall's push at each frame's end no longer evens out: about
    // 16.4 m/s² here, against 14.2 at an even 1/60 s (the guard reads 16.9 head-on).
    const DTS = [1 / 50, 1 / 70, 1 / 90, 1 / 45];
    for (const [yaw, speed, drive] of [
      [Math.PI / 2, 17, { throttle: 1 }],
      [Math.PI / 2, 25, { throttle: 1, boost: true }],
      [Math.PI / 4, 17, { throttle: 1 }],
    ] as const) {
      let s = outward(yaw, speed);
      let prev = measure(s);
      let worst = 0;
      for (let k = 0; k < 400; k++) {
        const dt = DTS[k % DTS.length];
        s = advance(s, input(drive), dt, desktop).state;
        const now = measure(s);
        expect(now.r).toBeLessThanOrEqual(PLAY.r + 1e-9);
        worst = Math.max(worst, (prev.out - now.out) / dt);
        prev = now;
      }
      expect(worst).toBeLessThanOrEqual(17);
      expect(worst).toBeGreaterThan(14);
      expect(prev.out).toBeLessThanOrEqual(REST_SPEED);
      expect(prev.r).toBeGreaterThan(PLAY.r - 0.05);
    }
  });

  it('with 0.05 s frames too, it brakes at most a + 1 a frame and stays inside 160 m', () => {
    for (const [yaw, speed, drive] of [
      [Math.PI / 2, 17, { throttle: 1 }],
      [Math.PI / 2, 25, { throttle: 1, boost: true }],
      [Math.PI / 4, 17, { throttle: 1 }],
    ] as const) {
      const { frames } = ride(outward(yaw, speed), () => drive, 6, 0.05);
      for (let k = 1; k < frames.length; k++) {
        expect(frames[k].r).toBeLessThanOrEqual(PLAY.r + 1e-9);
        expect((frames[k - 1].out - frames[k].out) / 0.05).toBeLessThanOrEqual(A + 1);
      }
      expect(frames.some((f) => f.edgeCut > 0)).toBe(true);
    }
  });

  it('steering back inward is never blocked: from rest on the edge it turns round and drives back in', () => {
    const atEdge = ride(outward(Math.PI / 2, 17), () => ({ throttle: 1 }), 4).end;
    expect(measure(atEdge).r).toBeGreaterThan(PLAY.r - 0.05);
    // Full right rein until the heading is within 0.3 rad of straight in, then straight on.
    const inward = (s: GameState) => yawOf({ x: PLAY.cx - s.car.x, z: PLAY.cz - s.car.z });
    const back = ride(atEdge, (s) => ({ throttle: 1, steer: Math.abs(angleDiff(s.car.yaw, inward(s))) > 0.3 ? 1 : 0 }), 8);
    const facing = back.frames.findIndex((f) => Math.abs(angleDiff(f.yaw, inward(atEdge))) <= 0.35);
    expect(facing).toBeGreaterThan(0);
    expect(facing * FRAME).toBeLessThan(5);
    expect(Math.min(...back.frames.map((f) => f.out))).toBeLessThan(-10);
    expect(measure(back.end).r).toBeLessThan(PLAY.wall);
    // Once it has turned to move inward, the edge takes nothing off.
    const turned = back.frames.findIndex((f) => f.out < -1);
    expect(turned).toBeGreaterThan(0);
    for (const f of back.frames.slice(turned)) expect(f.edgeCut).toBe(0);
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

describe('roam: replays and free laps (Task 36)', () => {
  /** Chapter 3's roam, with the prologue, parva 1 and parva 2 finished, the chariot at `at`. */
  const roam3 = (at: { x: number; z: number; yaw: number }, o: Partial<RoamInput> = {}): GameState =>
    startChapter(defOf(3), at, 1, desktop, { finished: [0, 1, 2], bests: [], bestLap: null, defOf, ...o });
  const M1 = defOf(1).marker!;
  /** 14 m west of parva 1's marker, facing it. */
  const WEST_OF_M1 = { x: M1.x - 14, z: M1.z, yaw: 0 };
  const poseOf = (c: { x: number; z: number; yaw: number }) => ({ x: c.x, z: c.z, yaw: c.yaw });
  /** Drives east at up to 6 m/s, at most `seconds`, until the lakon changes. */
  function driveIn(s: GameState, log: GameEvent[], seconds = 10): GameState {
    const def = s.run.def;
    for (let k = 0; k < seconds / DT && s.run.def === def; k++) s = step(s, input({ throttle: speedOf(s.car) < 6 ? 1 : 0 }), desktop, log);
    return s;
  }
  const LAPS = defOf(5).steps[0] as Extract<StepDef, { kind: 'laps' }>;
  const POSTS = LAPS.posts;
  type ReplayDone = Extract<GameEvent, { type: 'replayDone' }>;
  type FreeLap = Extract<GameEvent, { type: 'freeLap' }>;
  /** A lakon's own part of the state: what a replay sets aside and its return brings back. */
  const LAKON_KEYS = ['run', 'decoys', 'clouds', 'riuh', 'level', 'volleys', 'nextVolley', 'rng', 'nextId', 'scriptedPlanned'] as const;

  it("lays out the finished lakon that have a marker, each once and never the chapter's own, and parva 5's posts, as plain data", () => {
    const given: RoamInput = { finished: [2, 0, 1, 1, 3], bests: [0, 250], bestLap: 41.5, defOf };
    const s = startChapter(defOf(3), TOWER_EXIT, 1, desktop, given);
    const roam = s.roam!;
    // The prologue has no marker, and chapter 3 is the one being played.
    expect(roam.replays.map((d) => d.chapter)).toEqual([1, 2]);
    expect(roam.replays.map((d) => d.marker)).toEqual([defOf(1).marker, defOf(2).marker]);
    expect(roam.laps).toEqual(LAPS);
    expect(roam.bests).toEqual([0, 250]);
    expect(roam.bests).not.toBe(given.bests);
    expect(roam.bestLap).toBe(41.5);
    expect(roam).toMatchObject({ aside: null, lapPost: 0, lapStart: null, t: 0 });
    // The lakon are laid out at the start, as data: GameState keeps no function, and clones whole.
    expect(hasFunction(s)).toBe(false);
    expect(structuredClone(s)).toEqual(s);
    // Without roam's data there is no roam.
    expect(startChapter(defOf(3), TOWER_EXIT, 1, desktop).roam).toBeNull();
    // Parva 5's posts are one course whoever lays them out: its own lakon's in chapter 5, its replay's after it.
    const five = startChapter(defOf(5), TOWER_EXIT, 1, desktop, { finished: [0, 1, 2, 3, 4], bests: [], bestLap: null, defOf });
    expect(five.roam!.laps).toBe(five.run.def.steps[0]);
    const six = startChapter(defOf(6), TOWER_EXIT, 1, desktop, { finished: [0, 1, 2, 3, 4, 5], bests: [], bestLap: null, defOf });
    expect(six.roam!.laps).toBe(six.roam!.replays.find((d) => d.chapter === 5)!.steps[0]);
  });

  it("in chapter 3's roam, driving into parva 1's marker starts its replay at the cut into its intro; the autopilot finishes it with replayDone for chapter 1, never done, and chapter 3's roam resumes at ROAM_RETURN", () => {
    const log: GameEvent[] = [];
    const roam = roam3(WEST_OF_M1, { bests: [0, 120] });
    let s = driveIn(roam, log);
    // Parva 1's lakon, by its own marker rule: in its intro, the camera cut to the intro's first shot.
    expect(s.run.def.chapter).toBe(1);
    expect(s.run.phase).toBe('intro');
    expect(types(log)).toContain('introStart');
    expect(s.shot).toMatchObject({ kind: 'intro', t: 0 });
    // The chariot is not moved: it stands where it drove in, facing east, not on the lakon's start pose.
    expect(dist(hullMid(s.car), M1)).toBeLessThanOrEqual(MISSION_TIMING.markerR);
    expect(s.car.yaw).toBe(0);
    expect(poseOf(s.car)).not.toEqual(defOf(1).start);
    // Chapter 3's lakon waits aside as it was; the replay brings its own copies and haze, and its clamour from its start.
    const aside = s.roam!.aside!;
    for (const k of LAKON_KEYS) expect(aside[k], k).toEqual(roam[k]);
    expect(aside.run).toBe(roam.run);
    expect(s.decoys.map((d) => d.at)).toEqual(defOf(1).scripted.decoys);
    expect(s.clouds.map((c) => c.at)).toEqual(defOf(1).scripted.clouds);
    expect(s.riuh.value).toBe(defOf(1).riuh.start);
    // The autopilot rides it to the end, under the lakon's own pressure: its clamour moves, its levels and volleys come.
    const bot = createBot();
    const from = log.length;
    let moved = false;
    for (let k = 0; k < 150 / DT && s.run.def.chapter === 1; k++) {
      s = step(s, bot(s, desktop), desktop, log);
      if (s.roam!.aside && s.riuh.value !== defOf(1).riuh.start) moved = true;
    }
    expect(moved).toBe(true);
    expect(types(log.slice(from))).toContain('level');
    expect(types(log.slice(from))).toContain('volley');
    expect(types(log)).not.toContain('done');
    expect(types(log)).not.toContain('failed');
    const ends = log.filter((e): e is ReplayDone => e.type === 'replayDone');
    expect(ends).toHaveLength(1);
    expect(ends[0].chapter).toBe(1);
    expect(ends[0].score).toBeGreaterThan(0);
    expect(ends[0].best).toBe(Math.max(120, ends[0].score));
    // Back in chapter 3's roam with its own lakon as it was set aside, the chariot at rest at ROAM_RETURN (TOWER_EXIT's
    // place, turned north: Task 38), the camera cut to a fresh chase view behind it.
    for (const k of LAKON_KEYS) expect(s[k], k).toBe(aside[k]);
    expect(poseOf(s.car)).toEqual(ROAM_RETURN);
    expect(speedOf(s.car)).toBe(0);
    expect(s.shot).toBeNull();
    const o = chaseOptsOf(s);
    expect(s.cam).toEqual(stepChase(initChase(s.car, o), s.car, DT, o));
    expect(s.route?.target).toBe('marker');
    expect(s.hintQueue).toEqual([]);
    expect(s.roam).toMatchObject({ aside: null, bests: [0, ends[0].best] });
  }, BOT_TIMEOUT);

  it("a replay that fails plays its fail shot for 1.2 s, then chapter 3's roam resumes at ROAM_RETURN with replayDone at score 0 and the best unchanged; its failed is never passed on (ruling 10)", () => {
    for (const bests of [[0, 120], []]) {
      const log: GameEvent[] = [];
      const roam = roam3(WEST_OF_M1, { bests });
      let s = driveIn(roam, log);
      for (let k = 0; k < 300 && s.run.phase !== 'active'; k++) s = step(s, input({}, { skip: true }), desktop, log);
      expect(s.run.def.chapter).toBe(1);
      expect(s.run.phase).toBe('active');
      // Parva 1's 120 s run out: its fail shot plays.
      s = step({ ...s, run: { ...s.run, t: 121 } }, IDLE, desktop, log);
      expect(s.run.phase).toBe('failed');
      expect(s.shot?.kind).toBe('fail');
      let frames = 0;
      for (; frames < 5 / DT && s.run.def.chapter === 1; frames++) s = step(s, IDLE, desktop, log);
      expect(types(log)).not.toContain('failed');
      expect(types(log)).not.toContain('done');
      expect(log.filter((e) => e.type === 'replayDone')).toEqual([{ type: 'replayDone', chapter: 1, score: 0, best: bests[1] ?? 0 }]);
      // The shot ran its 1.2 s on its own clock, then the cut.
      expect(frames * DT).toBeGreaterThanOrEqual(MISSION_TIMING.failSeconds);
      expect(frames * DT).toBeLessThanOrEqual(MISSION_TIMING.failSeconds + 2 * DT);
      expect(s.run).toBe(roam.run);
      expect(poseOf(s.car)).toEqual(ROAM_RETURN);
      expect(s.shot).toBeNull();
      expect(s.roam!.aside).toBeNull();
      expect(s.roam!.bests[1] ?? 0).toBe(bests[1] ?? 0);
    }
  });

  it('free laps: a scripted ride through P1…P5 and back to P1 gives one freeLap with the seconds ridden; the clamour never rises and no volley comes', () => {
    for (const bestLap of [null, 1]) {
      // 15 m before P1 on its line, facing along it: the first post crossed is P1.
      const f1 = forward(POSTS[0].heading);
      let s = roam3({ x: POSTS[0].at.x - f1.x * 15, z: POSTS[0].at.z - f1.z * 15, yaw: POSTS[0].heading }, { bestLap });
      const { decoys, clouds, riuh } = s;
      // The ride is the autopilot's round parva 5's posts: it steers as that lakon would, at the free lap's next post.
      const lakon5 = { ...startRun(defOf(5)), phase: 'active' as const };
      const ride = (x: GameState) =>
        autopilot({ ...x, route: null, run: { ...lakon5, lapPost: x.roam!.lapPost, lapStart: x.roam!.lapStart } }, desktop);
      // The frames in which the hull's middle meets P1's 8 m, by the test's own geometry.
      const span = [across(POSTS[0].at, POSTS[0].heading, -4), across(POSTS[0].at, POSTS[0].heading, 4)];
      const p1: number[] = [];
      const log: GameEvent[] = [];
      // 25 s: the lap round the posts and on into the next. A lakon's own clocks (the clamour's rise from 10 s, the first
      // volley at 20 s) run on run.t, which stands still in roam, so no pressure is read by its value: the clamour is read
      // by identity, since any step of it, even one that changes nothing, makes a new one.
      for (let k = 0; k < 25 / DT; k++) {
        const before = hullMid(s.car);
        s = step(s, ride(s), desktop, log);
        if (meets(before, hullMid(s.car), span[0], span[1])) p1.push(k);
        // A lap is under way from P1 on, and only then.
        expect(s.roam!.lapStart === null, `frame ${k}`).toBe(p1.length === 0);
        // No pressure in roam: the clamour is never stepped, no volley is scheduled, no copy or haze comes.
        expect(s.riuh, `frame ${k}`).toBe(riuh);
        expect(s.riuh.value).toBe(0);
        expect(s.volleys).toEqual([]);
        expect(s.nextVolley).toBeNull();
        expect(s.decoys).toBe(decoys);
        expect(s.clouds).toBe(clouds);
      }
      const laps = log.filter((e): e is FreeLap => e.type === 'freeLap');
      expect(laps).toHaveLength(1);
      expect(p1).toHaveLength(2);
      expect(Math.abs(laps[0].seconds - (p1[1] - p1[0]) * DT)).toBeLessThanOrEqual(DT);
      expect(laps[0].best).toBe(bestLap === null ? laps[0].seconds : Math.min(bestLap, laps[0].seconds));
      expect(s.roam!.bestLap).toBe(laps[0].best);
      for (const t of ['volley', 'level', 'introStart', 'replayDone'] as const) expect(types(log), t).not.toContain(t);
      expect(s.run.phase).toBe('roam');
      // The next lap is under way, from the P1 that closed the first.
      expect(s.roam!.lapStart).not.toBeNull();
      expect(s.roam!.lapPost).not.toBe(0);
    }
  }, BOT_TIMEOUT);

  it("a free lap crosses a post by the lakon's own rule: within its 8 m, never past its ends", () => {
    const p = POSTS[0];
    const f = forward(p.heading);
    const r = rightOf(p.heading);
    /** One frame at 10 m/s along P1's heading, the hull's middle 0.2 m short of its line and `side` m off its centre. */
    const at = (s: GameState, side: number): GameState => {
      const x = p.at.x + r.x * side - f.x * (0.2 + HULL.offsets[1]);
      const z = p.at.z + r.z * side - f.z * (0.2 + HULL.offsets[1]);
      return { ...s, car: { ...initChariot(x, z, p.heading), vx: f.x * 10, vz: f.z * 10 } };
    };
    const lakon = toActive(5);
    const roam = roam3(TOWER_EXIT);
    for (const [side, counts] of [[0, true], [3.9, true], [-3.9, true], [4.1, false], [-4.1, false]] as const) {
      const ofLakon = step(at(lakon, side), IDLE).run.lapStart !== null;
      const ofRoam = step(at(roam, side), IDLE).roam!.lapStart !== null;
      expect([ofLakon, ofRoam], `${side} m off`).toEqual([counts, counts]);
    }
  });

  it("a replay starts by a lakon's own marker rule: within 5 m of its marker below 8 m/s (ruling 11, decision 7)", () => {
    /** The hull's middle `off` m west of parva 1's marker, driving east at `speed` m/s. */
    const at = (s: GameState, off: number, speed: number): GameState => {
      const x = M1.x - off - HULL.offsets[1];
      return { ...s, car: { ...initChariot(x, M1.z, 0), vx: speed, vz: 0 } };
    };
    // The same marker as parva 1's own lakon's, in its own roam, and as a replay's, in chapter 3's.
    const own = startChapter(defOf(1), TOWER_EXIT, 1, desktop);
    const roam = roam3(TOWER_EXIT);
    const cases = [[0, 0, true], [4.5, 2, true], [5.5, 2, false], [2, 7.5, true], [2, 8.5, false]] as const;
    for (const [off, speed, starts] of cases) {
      const lakon = step(at(own, off, speed), IDLE).run.phase === 'intro';
      const replay = step(at(roam, off, speed), IDLE).run.def.chapter === 1;
      expect([lakon, replay], `${off} m off at ${speed} m/s`).toEqual([starts, starts]);
    }
  });

  it("the free laps are timed on roam's own world seconds: in Mata's sight that clock runs at the world's half speed, as a lakon's run.t does (ruling 11, decision 3)", () => {
    let s = roam3(TOWER_EXIT);
    for (let k = 0; k < 30; k++) s = step(s, input({}, { sight: true }));
    expect(s.sight.on).toBe(true);
    expect(s.roam!.t).toBeCloseTo(30 * DT * SIGHT.worldScale, 9);
    expect(s.clock).toBeCloseTo(30 * DT, 9);
    // The lakon's own run.t stands still in roam.
    expect(s.run.t).toBe(0);
  });

  it("a free lap under way is dropped when a replay or the chapter's own lakon starts", () => {
    const underWay = (s: GameState): GameState => ({ ...s, roam: { ...s.roam!, lapPost: 3, lapStart: 2.5 } });
    const log: GameEvent[] = [];
    const replay = driveIn(underWay(roam3(WEST_OF_M1)), log);
    expect(replay.run.def.chapter).toBe(1);
    expect(replay.roam).toMatchObject({ lapPost: 0, lapStart: null });
    const own = step(teleportToMarker(underWay(roam3(TOWER_EXIT)), desktop), IDLE, desktop, log);
    expect(own.run).toMatchObject({ phase: 'intro' });
    expect(own.run.def.chapter).toBe(3);
    expect(own.roam).toMatchObject({ lapPost: 0, lapStart: null });
    expect(types(log)).not.toContain('freeLap');
  });

  it('no roam or replay meets the sight lesson, so ruling 8 does not apply (ruling 11, decision 9)', () => {
    // Only the prologue teaches, and it has no marker: it is never replayed, and it never roams.
    for (const ch of CHAPTERS) expect(defOf(ch).hints, `chapter ${ch}`).toBe(ch === 0);
    expect(defOf(0).marker).toBeNull();
    expect(startChapter(defOf(0), defOf(0).start, 1, desktop, { finished: [], bests: [], bestLap: null, defOf }).run.phase).toBe('intro');
    const s = startChapter(defOf(8), TOWER_EXIT, 1, desktop, { finished: [0, 1, 2, 3, 4, 5, 6, 7], bests: [], bestLap: null, defOf });
    expect(s.roam!.replays.map((d) => d.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.roam!.replays.some((d) => d.hints)).toBe(false);
    expect(s.hintCopy).toBeNull();
  });

  it("a replay teaches nothing: a restored session's ride into parva 1's ring and through its replay fires no hint there, and surge comes after, where the HUD shows it (fix round 1, F1)", () => {
    // A session resumed at chapter 3: no hint shown yet, roam's data as the island passes it. A resumed session starts at
    // ROAM_RETURN, facing north; here the chariot stands at TOWER_EXIT's place facing east, parva 1's ring dead ahead.
    let s = roam3(TOWER_EXIT);
    expect(s.hintsShown).toEqual([]);
    // Straight east at up to 7 m/s, into parva 1's ring 60 m dead ahead.
    for (let k = 0; k < 30 / DT && s.run.def.chapter === 3; k++) s = step(s, input({ throttle: speedOf(s.car) < 7 ? 1 : 0 }));
    expect(s.run.def.chapter).toBe(1);
    // The autopilot rides the replay to its end: no hint fires in any frame that ends in the replay.
    const bot = createBot();
    let replayFrames = 0;
    for (let k = 0; k < 150 / DT && s.run.def.chapter === 1; k++) {
      const r = advance(s, bot(s, desktop), DT, desktop);
      s = r.state;
      if (!hudOf(s, desktop).replay) continue;
      replayFrames++;
      expect(hintKeys(r.events), `replay frame ${k}`).toEqual([]);
    }
    expect(s.run.def.chapter).toBe(3);
    expect(replayFrames * DT).toBeGreaterThan(30);
    expect(s.hintsShown).not.toContain('surge');
    // On in chapter 3, in roam and then its own lakon: the surge lesson comes, on a HUD that shows it.
    let surged = false;
    for (let k = 0; k < 200 / DT && !surged; k++) {
      const r = advance(s, bot(s, desktop), DT, desktop);
      s = r.state;
      if (!hintKeys(r.events).includes('surge')) continue;
      surged = true;
      expect(hudOf(s, desktop)).toMatchObject({ replay: false, hint: 'surge' });
    }
    expect(surged).toBe(true);
  }, BOT_TIMEOUT);

  it('a drift moment inside a replay fires nothing, and the same moment outside one fires drift (fix round 1, F1)', () => {
    let s = driveIn(roam3(WEST_OF_M1), []);
    for (let k = 0; k < 300 && s.run.phase !== 'active'; k++) s = step(s, input({}, { skip: true }));
    expect(s.run).toMatchObject({ phase: 'active' });
    expect(s.hintsShown).toEqual([]);
    // At 12 m/s, facing back from where its route leads: a turn sharper than 60° ahead, above 10 m/s.
    const mid = hullMid(s.car);
    const to = s.route!.points[1];
    const away = yawOf({ x: mid.x - to.x, z: mid.z - to.z });
    const f = forward(away);
    const fast = (x: GameState): GameState => ({ ...x, car: { ...initChariot(s.car.x, s.car.z, away), vx: f.x * 12, vz: f.z * 12 } });
    const inReplay = advance(fast(s), input({ throttle: 1 }), DT, desktop);
    expect(hudOf(inReplay.state, desktop).replay).toBe(true);
    expect(hintKeys(inReplay.events)).toEqual([]);
    expect(inReplay.state.hintsShown).toEqual([]);
    // The same frame with no lakon set aside: the drift lesson.
    const outside = advance(fast({ ...s, roam: { ...s.roam!, aside: null } }), input({ throttle: 1 }), DT, desktop);
    expect(hintKeys(outside.events)).toEqual(['drift']);
  });

  it("each chapter's own lakon rides the same with roam's data as without, pressure and all (fix round 1, F2)", () => {
    for (const ch of CHAPTERS) {
      const def = defOf(ch);
      /** The autopilot's ride of the lakon from its start, seed 1, until it is done (300 s at most). */
      const ride = (roam?: RoamInput) => {
        let s = startChapter(def, def.start, 1, desktop, roam);
        const bot = createBot();
        const events: GameEvent[] = [];
        for (let k = 0; k < 300 / DT && !events.some((e) => e.type === 'done'); k++) s = step(s, bot(s, desktop), desktop, events);
        return { s, events };
      };
      const plain = ride();
      // As the island starts it: every chapter before it finished, the bests the session holds, no lap yet.
      const roamed = ride({ finished: Array.from({ length: ch }, (_, k) => k), bests: Array.from({ length: ch }, (_, k) => 100 * k), bestLap: null, defOf });
      expect(types(plain.events), `chapter ${ch}`).toContain('done');
      expect(roamed.events, `chapter ${ch}`).toEqual(plain.events);
      expect({ ...roamed.s, roam: null }, `chapter ${ch}`).toEqual({ ...plain.s, roam: null });
    }
  }, BOT_TIMEOUT);

  it("a finished lakon's marker does nothing outside roam: not in the chapter's own intro, active part, outro or fail shot (fix round 1, F4)", () => {
    const roam = roam3(TOWER_EXIT);
    // At rest on parva 1's marker, the hull's middle at its centre.
    const onM1 = initChariot(M1.x - HULL.offsets[1], M1.z, 0);
    for (const phase of ['intro', 'active', 'outro', 'failed'] as const) {
      const log: GameEvent[] = [];
      const s = step({ ...roam, car: onM1, run: { ...roam.run, phase } }, IDLE, desktop, log);
      expect(s.run.def.chapter, phase).toBe(3);
      expect(s.roam!.aside, phase).toBeNull();
      expect(types(log), phase).not.toContain('introStart');
      expect(types(log), phase).not.toContain('replayDone');
    }
  });

  it("a replay is not skipped to its record nor retried from its checkpoint: both leave it as it is, and it still ends by roam; its intro's own skip still works (fix round 1, F7)", () => {
    const roam = roam3(WEST_OF_M1);
    let s = driveIn(roam, []);
    expect(s.run).toMatchObject({ phase: 'intro' });
    // The fail card's skip, in the replay's intro: nothing recorded, nothing sent.
    const skipped = skipToRecord(s);
    expect(skipped.state).toBe(s);
    expect(skipped.events).toEqual([]);
    // The intro's own skip, from the frame's input, still cuts it short.
    const log: GameEvent[] = [];
    let frames = 0;
    for (; frames < 300 && s.run.phase !== 'active'; frames++) s = step(s, input({}, { skip: true }), desktop, log);
    expect(s.run).toMatchObject({ phase: 'active' });
    expect(types(log)).toContain('introEnd');
    expect(frames * DT).toBeLessThan(MISSION_TIMING.introSeconds);
    expect(s.run.checkpoint).not.toBeNull();
    // Its fail shot: retry leaves it failing, and it still ends by roam, at score 0.
    let failing = step({ ...s, run: { ...s.run, t: 121 } }, IDLE, desktop, log);
    expect(failing.run.phase).toBe('failed');
    for (let k = 0; k < 10; k++) failing = step(failing, IDLE, desktop, log);
    expect(retryFromCheckpoint(failing, desktop)).toBe(failing);
    expect(skipToRecord(failing)).toEqual({ state: failing, events: [] });
    for (let k = 0; k < 5 / DT && failing.run.def.chapter === 1; k++) failing = step(failing, IDLE, desktop, log);
    expect(failing.run).toBe(roam.run);
    expect(log.filter((e) => e.type === 'replayDone')).toEqual([{ type: 'replayDone', chapter: 1, score: 0, best: 0 }]);
    // Its outro: retry leaves it closing, and it still ends by roam, with its score.
    let closing: GameState = { ...s, run: { ...s.run, phase: 'outro', phaseT: 0, score: 230 } };
    expect(retryFromCheckpoint(closing, desktop)).toBe(closing);
    const ends: GameEvent[] = [];
    for (let k = 0; k < 5 / DT && closing.run.def.chapter === 1; k++) closing = step(closing, IDLE, desktop, ends);
    expect(closing.run).toBe(roam.run);
    expect(ends.filter((e) => e.type === 'replayDone')).toEqual([{ type: 'replayDone', chapter: 1, score: 230, best: 230 }]);
  });

  it('the HUD flags a replay while it runs, and sameHud tells the two apart', () => {
    const roam = roam3(WEST_OF_M1);
    expect(hudOf(roam, desktop).replay).toBe(false);
    const s = driveIn(roam, []);
    const h = hudOf(s, desktop);
    expect(h).toMatchObject({ replay: true, chapter: 1, phase: 'intro', type: 'himpun' });
    expect(sameHud(h, { ...h, replay: false })).toBe(false);
    expect(hudOf(toActive(1), desktop).replay).toBe(false);
  });
});

describe("a replay's return and its way out (Task 38)", () => {
  /** Chapter `ch`'s roam with every chapter before it finished, the chariot at `at`. */
  const roamIn = (ch: number, at: { x: number; z: number; yaw: number }, o: Partial<RoamInput> = {}): GameState =>
    startChapter(defOf(ch), at, 1, desktop, { finished: CHAPTERS.slice(0, ch), bests: [], bestLap: null, defOf, ...o });
  const M1 = defOf(1).marker!;
  /** 14 m west of parva 1's marker, facing it. */
  const WEST_OF_M1 = { x: M1.x - 14, z: M1.z, yaw: 0 };
  const poseOf = (c: { x: number; z: number; yaw: number }) => ({ x: c.x, z: c.z, yaw: c.yaw });
  /** Drives east at up to 6 m/s, at most 10 s, until the lakon changes: into parva 1's ring from WEST_OF_M1. */
  function intoRing(s: GameState, log: GameEvent[]): GameState {
    const def = s.run.def;
    for (let k = 0; k < 10 / DT && s.run.def === def; k++) s = step(s, input({ throttle: speedOf(s.car) < 6 ? 1 : 0 }), desktop, log);
    return s;
  }
  const FULL = input({ throttle: 1 });
  const LAKON_KEYS = ['run', 'decoys', 'clouds', 'riuh', 'level', 'volleys', 'nextVolley', 'rng', 'nextId', 'scriptedPlanned'] as const;

  it("a replay's return leaves the chariot at TOWER_EXIT's place turned north, so in chapter 8, whose marker lies 7.2 m from TOWER_EXIT, a throttle held from the return starts no lakon", () => {
    expect(ROAM_RETURN).toEqual({ x: TOWER_EXIT.x, z: TOWER_EXIT.z, yaw: Math.PI / 2 });
    expect(dist(TOWER_EXIT, defOf(8).marker!)).toBeLessThan(7.3);
    const log: GameEvent[] = [];
    let s = intoRing(roamIn(8, WEST_OF_M1), log);
    expect(s.run.def.chapter).toBe(1);
    // The replay rides on to its own end, the throttle held through its outro and past the return (or touch's cruise).
    const bot = createBot();
    for (let k = 0; k < 150 / DT && s.roam!.aside; k++) s = step(s, s.run.phase === 'outro' ? FULL : bot(s, desktop), desktop, log);
    expect(s.roam!.aside).toBeNull();
    expect(poseOf(s.car)).toEqual(ROAM_RETURN);
    const from = log.length;
    for (let k = 0; k < 4 / DT; k++) s = step(s, FULL, desktop, log);
    expect(types(log.slice(from))).not.toContain('introStart');
    expect(s.run.def.chapter).toBe(8);
    expect(s.run.phase).toBe('roam');
    expect(s.roam!.aside).toBeNull();
    // It did drive off: past markerSpeed, so no marker it meets later could start anything either.
    expect(speedOf(s.car)).toBeGreaterThan(MISSION_TIMING.markerSpeed);
  }, BOT_TIMEOUT);

  it("from ROAM_RETURN (a replay's return, a resumed chapter's start), 8 s of touch's cruise, the keyboard's easy cruise, full throttle or nothing, in the desktop's world and the phone's, start no lakon and no replay in any chapter, and meet no guard, contact, wall or lap post (Task 38, fix round 1, F2)", () => {
    const phoneWorld = createWorld({ mobile: true, warriors: 700 });
    const D = 1 / 60;
    type Mode = 'touch cruise' | 'keyboard easy cruise' | 'keyboard full throttle' | 'no input';
    /** The frame's drive under each input, as the island reads it: the touch layer with nothing touched and easy control
     * on (its default on touch); the keyboard with nothing held, easy control on; W held; nothing at all. */
    const driveOf = (mode: Mode, s: GameState, steer: { v: number }): ChariotInput => {
      const v = speedOf(s.car);
      if (mode === 'touch cruise') return touchInput(NO_TOUCH, v, true).drive;
      if (mode === 'no input') return NO_INPUT;
      const k = keyboardInput(new Set(mode === 'keyboard full throttle' ? ['KeyW'] : []), steer.v, D, { on: mode === 'keyboard easy cruise', speed: v });
      steer.v = k.drive.steer;
      return k.drive;
    };
    let runs = 0;
    for (const ch of CHAPTERS.slice(1)) {
      for (const [wn, w] of [['desktop', desktop], ['phone', phoneWorld]] as const) {
        for (const mode of ['touch cruise', 'keyboard easy cruise', 'keyboard full throttle', 'no input'] as const) {
          // Every lakon before the chapter finished, so all their grey rings are live.
          let s = startChapter(defOf(ch), ROAM_RETURN, 1, w, { finished: CHAPTERS.slice(0, ch), bests: [], bestLap: null, defOf });
          const steer = { v: 0 };
          const seen = new Set<string>();
          for (let k = 0; k < 8 / D; k++) {
            const prev = s;
            const r = advance(s, { drive: driveOf(mode, s, steer), sight: false, skip: false, assist: false, aspect: ASPECT }, D, w);
            s = r.state;
            for (const e of r.events) seen.add(e.type);
            if (s.roam!.aside) seen.add('replay');
            if (s.roam!.lapPost !== prev.roam!.lapPost || (s.roam!.lapStart !== null && prev.roam!.lapStart === null)) seen.add('lap post');
          }
          const where = `chapter ${ch}, ${wn}, ${mode}`;
          // Must: no lakon and no replay starts.
          expect.soft([...seen].filter((e) => e === 'introStart' || e === 'replay'), where).toEqual([]);
          expect.soft(s.run.phase, where).toBe('roam');
          // And the heading chosen meets the prefer as well: no guard, no contact, no wall and no lap post.
          expect.soft([...seen].filter((e) => ['held', 'bump', 'wall', 'lap post'].includes(e)), where).toEqual([]);
          runs++;
        }
      }
    }
    expect(runs).toBe(64);
  }, 120_000);

  it("leaveReplay ends a replay at once by the failed replay's return: replayDone at score 0, the best kept, the chapter's own lakon back, the chariot at rest at ROAM_RETURN; outside a replay it changes nothing", () => {
    for (const bests of [[0, 120], []]) {
      const log: GameEvent[] = [];
      const roam = roamIn(3, WEST_OF_M1, { bests });
      let s = intoRing(roam, log);
      expect(s.roam!.aside).not.toBeNull();
      // Left in its intro, whose shot is live: the leave takes the shot too, so roam's first frame is the chase view's
      // (fix round 2, R2-2).
      expect(s.run.phase).toBe('intro');
      expect(s.shot).not.toBeNull();
      const fromIntro = leaveReplay(s, desktop);
      expect(types(fromIntro.events)).toEqual(['replayDone']);
      expect(fromIntro.state.shot).toBeNull();
      expect(fromIntro.state.roam!.aside).toBeNull();
      // Into the replay's active part, with a record taken, so its own score is not 0.
      const bot = createBot();
      for (let k = 0; k < 60 / DT && s.run.recorded.length === 0; k++) s = step(s, bot(s, desktop), desktop, log);
      expect(s.run.def.chapter).toBe(1);
      expect(s.run.score).toBeGreaterThan(0);
      const aside = s.roam!.aside!;
      // A hint waiting and the sight lesson's copy, as a replay's state could hold them: the leave drops both.
      s = { ...s, hintQueue: ['steer'], hintCopy: 1 };
      const out = leaveReplay(s, desktop);
      expect(out.events).toEqual([{ type: 'replayDone', chapter: 1, score: 0, best: bests[1] ?? 0 }]);
      const t = out.state;
      for (const k of LAKON_KEYS) expect(t[k], k).toBe(aside[k]);
      expect(poseOf(t.car)).toEqual(ROAM_RETURN);
      expect(speedOf(t.car)).toBe(0);
      expect(t.shot).toBeNull();
      expect(t.roam!.aside).toBeNull();
      expect(t.roam!.bests[1] ?? 0).toBe(bests[1] ?? 0);
      expect(t.hintQueue).toEqual([]);
      expect(t.hintCopy).toBeNull();
      const o = chaseOptsOf(t);
      expect(t.cam).toEqual(initChase(t.car, { ...o, aspect: DEFAULT_ASPECT }));
      // The next frame is roam's: nothing of the replay is passed on.
      const next: GameEvent[] = [];
      step(t, IDLE, desktop, next);
      expect(types(next)).not.toContain('done');
      expect(types(next)).not.toContain('replayDone');
      // Outside a replay (roam, a chapter's own lakon, a chapter with nothing to replay) the state comes back as it is.
      for (const x of [roam, toActive(3), roamIn(1, ROAM_RETURN)]) {
        const back = leaveReplay(x, desktop);
        expect(back.state).toBe(x);
        expect(back.events).toEqual([]);
      }
    }
  }, BOT_TIMEOUT);

  it("a replay can be left only in its intro and its active part, at score 0 with replayDone; in its outro or its fail shot the state comes back as it is, with no events, and the replay's own end keeps its score (Task 38, fix round 2, R2-1)", () => {
    const roam = roamIn(3, WEST_OF_M1);
    const s = intoRing(roam, []);
    expect(s.run.phase).toBe('intro');
    for (const phase of ['intro', 'active'] as const) {
      const x: GameState = { ...s, run: { ...s.run, phase, phaseT: 0, score: 280 } };
      const out = leaveReplay(x, desktop);
      expect(out.events, phase).toEqual([{ type: 'replayDone', chapter: 1, score: 0, best: 0 }]);
      expect(out.state.run, phase).toBe(roam.run);
    }
    for (const phase of ['outro', 'failed'] as const) {
      const x: GameState = { ...s, run: { ...s.run, phase, phaseT: 0, score: 280 } };
      const out = leaveReplay(x, desktop);
      expect(out.state, phase).toBe(x);
      expect(out.events, phase).toEqual([]);
    }
    // Ridden by the autopilot into its outro: a leave at the outro's first frame changes nothing, and the outro ends by
    // itself with the score the replay earned.
    let r = intoRing(roamIn(3, WEST_OF_M1), []);
    const bot = createBot();
    for (let k = 0; k < 200 / DT && r.run.phase !== 'outro'; k++) r = step(r, bot(r, desktop), desktop, []);
    expect(r.run.phase).toBe('outro');
    expect(r.roam!.aside).not.toBeNull();
    const earned = r.run.score;
    expect(earned).toBeGreaterThan(0);
    const atOutro = leaveReplay(r, desktop);
    expect(atOutro.state).toBe(r);
    expect(atOutro.events).toEqual([]);
    const after: GameEvent[] = [];
    for (let k = 0; k < 10 / DT && r.roam!.aside; k++) r = step(r, IDLE, desktop, after);
    expect(after.filter((e) => e.type === 'replayDone')).toEqual([{ type: 'replayDone', chapter: 1, score: earned, best: earned }]);
  }, BOT_TIMEOUT);
});

function chaseOptsOf(s: GameState) {
  return { aspect: ASPECT, boosting: s.car.boostT > 0, ground: desktop.ground, tall: desktop.tall };
}
