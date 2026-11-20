import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NO_INPUT, initChariot, speedOf, stepChariot, type ChariotInput, type ChariotState } from '../src/lib/bowobharata-game/drive';
import { clamp, forward, rightOf, segPointDist, type XZ } from '../src/lib/bowobharata-game/geom';
import { advance, createWorld, startChapter, type GameState, type RoamInput } from '../src/lib/bowobharata-game/engine';
import { autopilot } from '../src/lib/bowobharata-game/autopilot';
import { fieldEdge, hullClearance } from '../src/lib/bowobharata-game/collide';
import { across, missionFor, type MissionDef, type StepDef } from '../src/lib/bowobharata-game/missions';
import { openTargets, type Decoy, type RunState } from '../src/lib/bowobharata-game/mission-run';
import { ANCHORS, PLAY, TOWER_EXIT, distToCollider, type Collider } from '../src/lib/bowobharata-game/world';
import { levelEffects, riuhLevel } from '../src/lib/bowobharata-game/riuh';
import { routeTo } from '../src/lib/bowobharata-game/route';
import { hudOf, type HudSnapshot } from '../src/lib/bowobharata-game/hud';
import {
  GATE_DAYS,
  RADAR_PX,
  RANGE_LAG,
  ROUTE_POINTS,
  radarItems,
  radarPoint,
  radarRange,
  sameRadar,
  HOLD,
  type RadarItem,
} from '../src/lib/bowobharata-game/radar';

const w = createWorld({ mobile: false });
const SLUGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const RECORDS = [0, 2, 2, 4, 9, 1, 2, 2, 2];
const defOf = (ch: number): MissionDef => missionFor(ch, ch === 0 ? [] : SLUGS.slice(0, RECORDS[ch]));
/** The radar's centre and inner radius on its RADAR_PX square. */
const C = RADAR_PX / 2;
const R = RADAR_PX / 2 - 8;
const EPS = 1e-9;

type Pose = { x: number; z: number; yaw: number };

/** Chapter ch's lakon, active unless `run` says otherwise, the chariot at rest at `at`, no route; `o` replaces the rest. */
function stateAt(ch: number, at: Pose, o: Partial<GameState> = {}, run: Partial<RunState> = {}): GameState {
  const def = defOf(ch);
  const s = startChapter(def, def.start, 1, w);
  return { ...s, car: initChariot(at.x, at.z, at.yaw), route: null, run: { ...s.run, phase: 'active', ...run }, ...o };
}
const items = (s: GameState) => radarItems(s, w, RADAR_PX);
const ofKind = (list: readonly RadarItem[], kind: RadarItem['kind']) => list.filter((i) => i.kind === kind);
const sighted = (s: GameState): GameState => ({ ...s, sight: { ...s.sight, on: true } });
const loud = (s: GameState, value: number): GameState => ({ ...s, riuh: { ...s.riuh, value } });
const fromCentre = (p: { x: number; y: number }) => Math.hypot(p.x - C, p.y - C);

/** Each item at radarPoint of its place, with the chariot at rest (range 70 m), in order. */
function expectAt(list: readonly RadarItem[], places: readonly XZ[], car: Pose) {
  expect(list).toHaveLength(places.length);
  places.forEach((p, k) => {
    const q = radarPoint(p, car, 70, RADAR_PX);
    expect(list[k].x, `item ${k}`).toBeCloseTo(q.x, 9);
    expect(list[k].y, `item ${k}`).toBeCloseTo(q.y, 9);
    expect(list[k].clamped, `item ${k}`).toBe(q.clamped);
    expect(list[k].dist, `item ${k}`).toBeCloseTo(Math.hypot(p.x - car.x, p.z - car.z), 9);
  });
}

/** Facing north the radar reads as a map: a point dx m east and dz m south of the chariot lies at (C + dx·k, C + dz·k). */
const NORTH = Math.PI / 2;
const mapPx = (p: XZ, car: XZ, range = 70) => ({ x: C + ((p.x - car.x) * R) / range, y: C + ((p.z - car.z) * R) / range });

/** Real seconds between HUD snapshots, as the runtime sends them. */
const HUD_DT = 0.1;
/** The state with the chariot moving forward at v m/s where it stands. */
const atSpeed = (s: GameState, v: number): GameState => {
  const f = forward(s.car.yaw);
  return { ...s, car: { ...s.car, vx: f.x * v, vz: f.z * v } };
};

/**
 * Show/hide flicker, counted as the re-review of fix round 1 counted it: each snapshot's items are keyed by their field
 * place (to 0.1 m, read back from the radar at its own range) or, for the ranks, by their block; the route has no key.
 * A cycle is three changes of one key's shown state within 0.5 s: in, out and in again (or out, in, out).
 */
class Flicker {
  cycles = 0;
  changes = 0;
  readonly examples: string[] = [];
  private seen = new Map<string, { on: boolean; at: number[] }>();
  private first = true;
  constructor(private readonly tag: string) {}
  sample(t: number, s: GameState, hud: HudSnapshot) {
    const now = new Set<string>();
    for (const i of hud.radar) {
      const k = keyOf(i, s, hud.radarM);
      if (k) now.add(k);
    }
    for (const k of new Set([...now, ...this.seen.keys()])) {
      const on = now.has(k);
      const rec = this.seen.get(k);
      if (!rec) {
        this.seen.set(k, { on, at: this.first ? [] : [t] });
        if (!this.first) this.changes++;
        continue;
      }
      if (rec.on === on) continue;
      rec.on = on;
      rec.at.push(t);
      this.changes++;
      const n = rec.at.length;
      if (n >= 3 && rec.at[n - 1] - rec.at[n - 3] < 0.5 - 1e-9) {
        this.cycles++;
        if (this.examples.length < 4) this.examples.push(`${this.tag}: ${k} at t ${t.toFixed(1)} s, ${speedOf(s.car).toFixed(2)} m/s`);
      }
    }
    this.first = false;
  }
}

/** An item's identity across snapshots: its kind and field place, read back from the radar at `range`; the ranks' block. */
function keyOf(i: RadarItem, s: GameState, range: number): string | null {
  if (i.kind === 'route') return null;
  if (i.kind === 'ranks') {
    let best = -1;
    let gap = Infinity;
    w.figures.forEach((c, k) => {
      const g = Math.abs(Math.max(0, distToCollider(s.car, c)) - i.dist);
      if (g < gap) {
        gap = g;
        best = k;
      }
    });
    return `ranks#${best}`;
  }
  const side = ((i.x - C) * range) / R;
  const ahead = ((C - i.y) * range) / R;
  const len = Math.hypot(side, ahead);
  const f = forward(s.car.yaw);
  const r = rightOf(s.car.yaw);
  const ux = len > 0 ? (f.x * ahead + r.x * side) / len : 0;
  const uz = len > 0 ? (f.z * ahead + r.z * side) / len : 0;
  const round = (v: number) => (Math.round(v * 10) / 10 + 0).toFixed(1);
  return `${i.kind}@${round(s.car.x + ux * i.dist)},${round(s.car.z + uz * i.dist)}`;
}

describe('radarRange', () => {
  it('is 70 m at rest, 107.4 m at the top speed and 125 m at the surge', () => {
    expect(radarRange(0)).toBe(70);
    expect(radarRange(17)).toBeCloseTo(107.4, 9);
    expect(radarRange(25)).toBeCloseTo(125, 9);
  });

  it('reads a speed backward as forward, and one that is not a number as rest', () => {
    expect(radarRange(-4)).toBeCloseTo(78.8, 9);
    expect(radarRange(Number.NaN)).toBe(70);
    expect(radarRange(Number.POSITIVE_INFINITY)).toBe(70);
  });
});

describe('radarPoint', () => {
  const origin: Pose = { x: 0, z: 0, yaw: 0 };
  const pin = (p: XZ, car: Pose, range = 70) => radarPoint(p, car, range, RADAR_PX);
  const expectPx = (q: { x: number; y: number; clamped: boolean }, x: number, y: number, clamped = false) => {
    expect(q.x).toBeCloseTo(x, 9);
    expect(q.y).toBeCloseTo(y, 9);
    expect(q.clamped).toBe(clamped);
  };

  it('draws on a 148 px square, heading-up: ahead is up and the right is right, the range at 66 px', () => {
    expect(RADAR_PX).toBe(148);
    expectPx(pin({ x: 35, z: 0 }, origin), 74, 41);
    expectPx(pin({ x: 0, z: 35 }, origin), 107, 74);
    expectPx(pin({ x: 0, z: -35 }, origin), 41, 74);
    expectPx(pin({ x: -35, z: 0 }, origin), 74, 107);
    expectPx(pin({ x: 0, z: 0 }, origin), 74, 74);
  });

  it('clamps what lies beyond the range to the inner radius, along its bearing', () => {
    expectPx(pin({ x: 140, z: 0 }, origin), 74, 8, true);
    // At the range exactly it lies on the inner radius and is not clamped.
    expectPx(pin({ x: 70, z: 0 }, origin), 74, 8);
    // 100 m ahead and 100 m to the right: on the radius, halfway between up and right.
    const q = pin({ x: 100, z: 100 }, origin);
    expect(q.clamped).toBe(true);
    expect(fromCentre(q)).toBeCloseTo(R, 9);
    expect(q.x - C).toBeCloseTo(C - q.y, 9);
    expect(q.x).toBeGreaterThan(C);
  });

  it('turns and moves with the chariot', () => {
    expectPx(pin({ x: 0, z: 35 }, { x: 0, z: 0, yaw: -Math.PI / 2 }), 74, 41);
    expectPx(pin({ x: 35, z: 0 }, { x: 0, z: 0, yaw: NORTH }), 107, 74);
    expectPx(pin({ x: 0, z: -35 }, { x: 0, z: 0, yaw: NORTH }), 74, 41);
    expectPx(pin({ x: 45, z: -5 }, { x: 10, z: -5, yaw: 0 }), 74, 41);
    expectPx(pin({ x: 10, z: -5 }, { x: 10, z: -5, yaw: 1.2 }), 74, 74);
  });

  it('scales with the range', () => {
    expectPx(pin({ x: 35, z: 0 }, origin, 140), 74, 57.5);
    expectPx(pin({ x: 140, z: 0 }, origin, 140), 74, 8);
  });
});

describe('radarItems', () => {
  it('always shows the tower and the three shelters, in every phase, at the rim when out of range', () => {
    const car: Pose = { ...TOWER_EXIT };
    for (const phase of ['roam', 'intro', 'active', 'outro', 'failed', 'done'] as const) {
      const list = items(stateAt(1, car, {}, { phase }));
      expectAt(ofKind(list, 'tower'), [ANCHORS.tower], car);
      expectAt(ofKind(list, 'shelter'), [ANCHORS.camp, ANCHORS.groveNW, ANCHORS.groveSE], car);
    }
    expect(ofKind(items(stateAt(1, car)), 'shelter').map((i) => i.clamped)).toEqual([true, true, true]);
  });

  it('in roam: the marker and the route to it, the tower, the shelters and the ranks; no copy, even in sight', () => {
    const def = defOf(1);
    const s = sighted(startChapter(def, TOWER_EXIT, 1, w));
    expect(s.run.phase).toBe('roam');
    // The lakon's own copies are laid out from the start, open: they come out with the lakon.
    expect(s.decoys.filter((d) => d.state === 'open')).toHaveLength(4);
    const list = items(s);
    expect(ofKind(list, 'decoy')).toEqual([]);
    expectAt(ofKind(list, 'marker'), [def.marker!], s.car);
    expect(ofKind(list, 'route')).toHaveLength(1);
    expect(ofKind(list, 'ranks')).toHaveLength(2);
    expect(ofKind(list, 'record')).toEqual([]);
    expect(ofKind(list, 'gate')).toEqual([]);
    expect(ofKind(list, 'post')).toEqual([]);
  });

  it('copies show only in sight, open, within the range, and never in roam', () => {
    const car: Pose = { x: 55, z: 0, yaw: NORTH };
    const base = stateAt(1, car);
    // Parva 1's four copies lie 8–42 m off; the first is taken; a volley's copy lies far out of range.
    const far: Decoy = { id: 9, at: { x: -120, z: 60 }, born: 0, life: 20, state: 'open', mimic: false };
    const decoys = [...base.decoys.map((d, k): Decoy => (k === 0 ? { ...d, state: 'taken' } : d)), far];
    const s = { ...base, decoys };
    expect(ofKind(items(s), 'decoy')).toEqual([]);
    expectAt(ofKind(items(sighted(s)), 'decoy'), decoys.slice(1, 4).map((d) => d.at), car);
    expect(ofKind(items(sighted({ ...s, run: { ...s.run, phase: 'roam' } })), 'decoy')).toEqual([]);
  });

  it('at level 4 the static hides what lies past 70% of the range, unless sight is on', () => {
    // Parva 1 at rest at (52, 0), facing east: record A lies 44 m off, record B 51 m off, the tower 111 m off.
    const car: Pose = { x: 52, z: 0, yaw: 0 };
    const s = loud(stateAt(1, car), 4.2);
    const veiled = items(s);
    expect(veiled.length).toBeGreaterThan(0);
    for (const i of veiled) {
      expect(i.dist, i.kind).toBeLessThanOrEqual(0.7 * 70 + EPS);
      expect(fromCentre(i), i.kind).toBeLessThanOrEqual(0.7 * R + EPS);
      for (const p of i.points ?? []) expect(fromCentre(p), `${i.kind} point`).toBeLessThanOrEqual(0.7 * R + EPS);
    }
    expectAt(ofKind(veiled, 'record'), [{ x: 52, z: 44 }], car);
    expect(ofKind(veiled, 'tower')).toEqual([]);
    expect(ofKind(veiled, 'shelter')).toEqual([]);
    // Only the Kurawa block lies within 49 m (33 m off); the Pandawa one lies 55 m off.
    expect(ofKind(veiled, 'ranks')).toHaveLength(1);

    // In sight everything shows, as it does at level 3, where there is no static.
    const seen = items(sighted(s));
    expectAt(ofKind(seen, 'record'), [{ x: 52, z: 44 }, { x: 62, z: -50 }], car);
    expectAt(ofKind(seen, 'tower'), [ANCHORS.tower], car);
    expect(ofKind(seen, 'shelter')).toHaveLength(3);
    expect(ofKind(seen, 'ranks')).toHaveLength(2);
    const calm = items(loud(s, 3.9));
    expect(calm.map((i) => i.kind)).toEqual(seen.filter((i) => i.kind !== 'decoy').map((i) => i.kind));

    // At level 5 the static takes 45%: record A, 44 m off, goes too.
    expect(ofKind(items(loud(s, 5)), 'record')).toEqual([]);
    expect(ofKind(items(sighted(loud(s, 5))), 'record')).toHaveLength(2);
  });

  it('the prologue shows its open records, and drops each one recorded', () => {
    const car: Pose = { x: 0, z: 9, yaw: -Math.PI / 2 };
    const step = defOf(0).steps[0] as Extract<StepDef, { kind: 'collect' }>;
    expectAt(ofKind(items(stateAt(0, car)), 'record'), step.items.map((i) => i.at), car);
    const later = stateAt(0, car, {}, { recorded: ['L1', 'L3'] });
    expectAt(ofKind(items(later), 'record'), step.items.filter((i) => i.id !== 'L1' && i.id !== 'L3').map((i) => i.at), car);
    // From the intro on; a failed run keeps them through the fail shot, as the scene does; none in the outro or after.
    expect(ofKind(items(stateAt(0, car, {}, { phase: 'intro' })), 'record')).toHaveLength(8);
    expect(ofKind(items(stateAt(0, car, {}, { phase: 'failed' })), 'record')).toHaveLength(8);
    for (const phase of ['outro', 'done'] as const) expect(ofKind(items(stateAt(0, car, {}, { phase })), 'record')).toEqual([]);
  });

  it('Antar: the letter, then the Hastinapura gate as a gate, then the record; the tower stays one item', () => {
    const car: Pose = { x: 0, z: 30, yaw: 0 };
    const at = (step: number) => items(stateAt(2, car, {}, { step }));
    expectAt(ofKind(at(0), 'record'), [ANCHORS.camp], car);
    expect(ofKind(at(0), 'gate')).toEqual([]);
    expectAt(ofKind(at(1), 'gate'), [ANCHORS.gate], car);
    expect(ofKind(at(1), 'record')).toEqual([]);
    expectAt(ofKind(at(2), 'record'), [ANCHORS.northEnd], car);
    expect(ofKind(at(3), 'record')).toEqual([]);
    expect(ofKind(at(3), 'gate')).toEqual([]);
    expect(ofKind(at(3), 'tower')).toHaveLength(1);
  });

  describe('a course', () => {
    const course = defOf(4).steps[0] as Extract<StepDef, { kind: 'course' }>;
    /** Day n's real gate: its id and its centre, by the course's own `across`. */
    const realGate = (n: number) => {
      const d = course.days[n - 1];
      const g = d.gates.find((x) => x.real);
      if (!g) throw new Error(`day ${n} holds no real gate`);
      return { id: g.id, at: across(d.at, d.heading, g.offset) };
    };
    const car: Pose = { x: -70, z: 50, yaw: NORTH };
    const gates = (run: Partial<RunState>) => ofKind(items(stateAt(4, car, {}, run)), 'gate');
    const atDays = (days: number[]) => days.map((n) => realGate(n).at);

    it('shows the real gates of the next 3 days, at their centres', () => {
      expect(GATE_DAYS).toBe(3);
      // Days 1–3: real gates on days 1 and 3; day 4's is four days ahead.
      expectAt(gates({ dayIndex: 0 }), atDays([1, 3]), car);
      expectAt(gates({ dayIndex: 2, recorded: [realGate(1).id] }), atDays([3, 4]), car);
      expectAt(gates({ dayIndex: 9, recorded: [1, 3, 4, 6, 8, 9].map((n) => realGate(n).id) }), atDays([12]), car);
    });

    it('drops each recorded gate, and keeps any ridden past while it is still open', () => {
      expect(gates({ dayIndex: 0, recorded: [realGate(1).id, realGate(3).id] })).toEqual([]);
      expectAt(gates({ dayIndex: 1 }), atDays([1, 3, 4]), car);
      const all = [1, 3, 4, 6, 8, 9, 12, 14, 17];
      expectAt(gates({ dayIndex: 18, recorded: all.filter((n) => n !== 6).map((n) => realGate(n).id) }), atDays([6]), car);
    });

    it("puts each gate where the engine's own targets stand: day 1's ridden past, then the aims of days 3 and 4", () => {
      // openTargets lists the aim of every day ahead (a real day's aim is its real gate's centre), then the real gates
      // ridden past and still open, by their own ids.
      const run = stateAt(4, car, {}, { dayIndex: 1 }).run;
      const targets = openTargets(run);
      const target = (id: string) => {
        const t = targets.find((x) => x.id === id);
        if (!t || t.kind !== 'gate' || !t.real) throw new Error(`no real gate target ${id}`);
        return t.at;
      };
      expectAt(gates({ dayIndex: 1 }), [target(realGate(1).id), target('day3'), target('day4')], car);
    });

    it("the route leads to the day's real gate by that gate's key: held back at the edge, the route stops HOLD m short of it", () => {
      // Level 4 at rest: the edge lies at 49 m. Day 1's real gate, the run's first aim, stands 48.5 m due north: within the
      // edge but not HOLD m within it, so a snapshot that did not show it holds it back, and one that showed it keeps it.
      const g = realGate(1);
      expect(openTargets(stateAt(4, car, {}, { dayIndex: 0 }).run)[0].at).toEqual(g.at);
      const at: Pose = { x: g.at.x, z: g.at.z + 48.5, yaw: NORTH };
      const s = loud(stateAt(4, at, { route: { target: 'gate', points: [{ x: at.x, z: at.z }, g.at] } }, { dayIndex: 0 }), 4.2);
      const key = `gate:${g.id}`;
      const shownBefore = radarItems(s, w, RADAR_PX, 70, [{ kind: 'gate', key, x: 0, y: 0, clamped: false, dist: 48.5 }]);
      expect(ofKind(shownBefore, 'gate').map((i) => i.key)).toEqual([key]);
      const reached = ofKind(shownBefore, 'route')[0];
      expect(reached.clamped).toBe(false);
      expect(fromCentre(reached)).toBeCloseTo((48.5 * R) / 70, 9);
      // Not shown before: the gate is held back, and the route, which leads to that gate's key, stops short of it.
      const held = radarItems(s, w, RADAR_PX, 70, []);
      expect(ofKind(held, 'gate')).toEqual([]);
      const route = ofKind(held, 'route')[0];
      expect(route.clamped).toBe(true);
      expect(fromCentre(route)).toBeCloseTo(((49 - HOLD) * R) / 70, 9);
    });

    it('shows nothing of the course in roam, and no record items: its records are its gates', () => {
      expect(gates({ phase: 'roam' })).toEqual([]);
      expect(ofKind(items(stateAt(4, car, {}, { dayIndex: 0 })), 'record')).toEqual([]);
    });
  });

  describe('roam (Task 36)', () => {
    /** Chapter ch's roam with every chapter before it finished, the chariot at rest at `at`. */
    const roamOf = (ch: number, at: Pose, o: Partial<RoamInput> = {}): GameState =>
      startChapter(defOf(ch), at, 1, w, { finished: Array.from({ length: ch }, (_, k) => k), bests: [], bestLap: null, defOf, ...o });
    const posts = (defOf(5).steps[0] as Extract<StepDef, { kind: 'laps' }>).posts.map((p) => p.at);
    const car: Pose = { ...TOWER_EXIT };

    it("a muted replay ring at each finished lakon's marker, then parva 5's next post and the one after, between the tower and the marker", () => {
      const list = items(roamOf(3, car));
      // The prologue has no marker; chapter 3's own is the marker the route leads to.
      expectAt(ofKind(list, 'replay'), [defOf(1).marker!, defOf(2).marker!], car);
      expectAt(ofKind(list, 'post'), [posts[0], posts[1]], car);
      expectAt(ofKind(list, 'marker'), [defOf(3).marker!], car);
      // In drawing order: the tower, the replays, the free laps' posts (the next one first), then the lakon's marker.
      const order = list.filter((i) => ['tower', 'replay', 'post', 'marker'].includes(i.kind)).map((i) => i.kind);
      expect(order).toEqual(['tower', 'replay', 'replay', 'post', 'post', 'marker']);
      // Every item has a key of its own: a ring by its chapter, a post by its place in the free laps.
      const keys = list.map((i) => i.key);
      expect(new Set(keys).size).toBe(list.length);
      expect(keys).toEqual(expect.arrayContaining(['replay:1', 'replay:2', 'post:free-P1', 'post:free-P2']));
      // Bounded: one ring per finished lakon with a marker, at most; chapter 8's roam has seven, the prologue's none.
      expect(ofKind(items(roamOf(8, car)), 'replay')).toHaveLength(7);
    });

    it('the posts follow the free lap: the next post first, then the one after it', () => {
      const s = roamOf(3, car);
      const at = (lapPost: number, lapStart: number | null) => ofKind(items({ ...s, roam: { ...s.roam!, lapPost, lapStart } }), 'post');
      expectAt(at(0, null), [posts[0], posts[1]], car);
      expectAt(at(2, 4), [posts[2], posts[3]], car);
      expectAt(at(4, 4), [posts[4], posts[0]], car);
    });

    it('shows no replay ring and no free lap post outside roam: in a replay, or once the lakon starts', () => {
      const s = roamOf(3, car);
      for (const phase of ['intro', 'active', 'outro', 'failed', 'done'] as const) {
        const list = items({ ...s, run: { ...s.run, phase } });
        expect(ofKind(list, 'replay'), phase).toEqual([]);
        expect(ofKind(list, 'post'), phase).toEqual([]);
      }
      // Without roam's data, roam shows its marker alone.
      const bare = stateAt(3, car, {}, { phase: 'roam' });
      expect(ofKind(items(bare), 'replay')).toEqual([]);
      expect(ofKind(items(bare), 'post')).toEqual([]);
    });
  });

  it('laps show the next post and the one after; once two laps match, the record by P1', () => {
    const laps = defOf(5).steps[0] as Extract<StepDef, { kind: 'laps' }>;
    const posts = laps.posts.map((p) => p.at);
    const car: Pose = { x: -84, z: -10, yaw: 0 };
    const at = (run: Partial<RunState>) => items(stateAt(5, car, {}, run));
    expectAt(ofKind(at({ lapPost: 0 }), 'post'), [posts[0], posts[1]], car);
    expectAt(ofKind(at({ lapStart: 3, lapPost: 3 }), 'post'), [posts[3], posts[4]], car);
    expectAt(ofKind(at({ lapStart: 3, lapPost: 4 }), 'post'), [posts[4], posts[0]], car);
    expect(ofKind(at({ lapPost: 0 }), 'record')).toEqual([]);
    const matched = at({ lapStart: 40, laps: [30, 31], matched: true });
    expect(ofKind(matched, 'post')).toEqual([]);
    expectAt(ofKind(matched, 'record'), [laps.then.at], car);
  });

  describe('the ranks', () => {
    const boxOf = (c: Collider) => {
      if (c.kind !== 'box') throw new Error('an army is a box');
      return c;
    };
    const cornersOf = (c: Collider): XZ[] => {
      const b = boxOf(c);
      return [
        { x: b.minX, z: b.minZ },
        { x: b.maxX, z: b.minZ },
        { x: b.maxX, z: b.maxZ },
        { x: b.minX, z: b.maxZ },
      ];
    };
    /** The block's nearest point to p, as distToCollider measures it: p itself inside the block. */
    const nearestOf = (c: Collider, p: XZ): XZ => {
      const b = boxOf(c);
      return { x: clamp(p.x, b.minX, b.maxX), z: clamp(p.z, b.minZ, b.maxZ) };
    };
    const toXZ = (p: { x: number; y: number }): XZ => ({ x: p.x, z: p.y });
    /** The field point under radar point p, with the chariot at `car` and the radar out to `range` m. */
    const fieldOf = (p: { x: number; y: number }, car: Pose, range = 70): XZ => {
      const f = forward(car.yaw);
      const side = ((p.x - C) * range) / R;
      const ahead = ((C - p.y) * range) / R;
      return { x: car.x + f.z * -side + f.x * ahead, z: car.z + f.x * side + f.z * ahead };
    };
    /** Whether the field point lies in the block, to a micrometre. */
    const inBlock = (c: Collider, q: XZ) => {
      const b = boxOf(c);
      return q.x >= b.minX - 1e-6 && q.x <= b.maxX + 1e-6 && q.z >= b.minZ - 1e-6 && q.z <= b.maxZ + 1e-6;
    };
    /** The polygon's area (px²). */
    const areaOf = (pts: readonly { x: number; y: number }[]) =>
      Math.abs(pts.reduce((a, p, k) => a + p.x * pts[(k + 1) % pts.length].y - pts[(k + 1) % pts.length].x * p.y, 0)) / 2;

    it('a block wholly within the range: its four corners, anchored at its nearest point', () => {
      // Between the blocks, halfway along them: both lie within 36 m.
      const car: Pose = { x: 0, z: -15, yaw: NORTH };
      const ranks = ofKind(items(stateAt(1, car)), 'ranks');
      expect(w.figures).toHaveLength(2);
      expect(ranks).toHaveLength(2);
      w.figures.forEach((c, k) => {
        const pts = ranks[k].points ?? [];
        expect(pts).toHaveLength(4);
        cornersOf(c).forEach((p, j) => {
          expect(pts[j].x).toBeCloseTo(mapPx(p, car).x, 9);
          expect(pts[j].y).toBeCloseTo(mapPx(p, car).y, 9);
        });
        const near = mapPx(nearestOf(c, car), car);
        expect(ranks[k].clamped).toBe(false);
        expect(ranks[k].x).toBeCloseTo(near.x, 9);
        expect(ranks[k].y).toBeCloseTo(near.y, 9);
        expect(ranks[k].dist).toBeCloseTo(distToCollider(car, c), 9);
      });
    });

    it('a block reaching past the radar is cut at the rim: its near corners kept, the rest along the rim', () => {
      // From (0, 40) the blocks' near corners lie 25–32 m off and their far corners 85–88 m off.
      const car: Pose = { x: 0, z: 40, yaw: NORTH };
      const ranks = ofKind(items(stateAt(1, car)), 'ranks');
      expect(ranks).toHaveLength(2);
      w.figures.forEach((c, k) => {
        const pts = ranks[k].points ?? [];
        const corners = cornersOf(c).map((p) => mapPx(p, car));
        let onRim = 0;
        for (const p of pts) {
          expect(fromCentre(p)).toBeLessThanOrEqual(R + EPS);
          const rim = Math.abs(fromCentre(p) - R) < 1e-6;
          const edge = corners.some((a, j) => segPointDist(toXZ(p), toXZ(a), toXZ(corners[(j + 1) % 4])) < 1e-6);
          expect(rim || edge, `(${p.x}, ${p.y})`).toBe(true);
          if (rim) onRim++;
        }
        expect(onRim).toBeGreaterThanOrEqual(2);
        // Every point lies on the block too: the rim is followed the way that stays on it.
        for (const p of pts) expect(inBlock(c, fieldOf(p, car)), `(${p.x}, ${p.y})`).toBe(true);
        // Its area is the block's within the radar, sampled every quarter pixel; the arcs' 15° chords lose under 3%.
        let inside = 0;
        for (let x = 0.125; x < RADAR_PX; x += 0.25) {
          for (let y = 0.125; y < RADAR_PX; y += 0.25) {
            if (Math.hypot(x - C, y - C) <= R && inBlock(c, fieldOf({ x, y }, car))) inside++;
          }
        }
        const exact = inside / 16;
        expect(Math.abs(areaOf(pts) - exact) / exact).toBeLessThan(0.03);
        // The two corners within the range stay; the two beyond it go.
        const kept = corners.filter((q) => pts.some((p) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9));
        expect(kept).toEqual(corners.filter((q) => fromCentre(q) <= R));
        expect(kept).toHaveLength(2);
        expect(ranks[k].x).toBeCloseTo(mapPx(nearestOf(c, car), car).x, 9);
        expect(ranks[k].y).toBeCloseTo(mapPx(nearestOf(c, car), car).y, 9);
      });
    });

    it('the cut follows the rim in arcs: a point between crossings, chords of 15° at most', () => {
      // At level 5 the radius shown is 55% of the inner one, 38.5 m at rest. From 30 m south of the Kurawa block it cuts
      // the 16 m-wide block across, an arc of about 25°, and the Pandawa block's corner, an arc of about 18°.
      const car: Pose = { x: 11, z: 45, yaw: NORTH };
      const radius = 0.55 * R;
      const ranks = ofKind(items(loud(stateAt(1, car), 5)), 'ranks');
      expect(ranks).toHaveLength(2);
      /** The angle (radians) two radar points subtend at the centre. */
      const angle = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.acos(clamp(((p.x - C) * (q.x - C) + (p.y - C) * (q.y - C)) / (fromCentre(p) * fromCentre(q)), -1, 1));
      let chords = 0;
      w.figures.forEach((c, k) => {
        const pts = ranks[k].points ?? [];
        const sides = cornersOf(c).map((p) => mapPx(p, car));
        const onSide = (p: { x: number; y: number }) =>
          sides.some((a, j) => segPointDist(toXZ(p), toXZ(a), toXZ(sides[(j + 1) % 4])) < 1e-6);
        const onRim = (p: { x: number; y: number }) => Math.abs(fromCentre(p) - radius) < 1e-6;
        // A point on the rim and off the block's sides lies on an arc.
        expect(pts.filter((p) => onRim(p) && !onSide(p)).length, `block ${k}`).toBeGreaterThanOrEqual(1);
        pts.forEach((p, j) => {
          const q = pts[(j + 1) % pts.length];
          // Two rim points in a row whose chord is not the block's own side: a chord of the arc.
          if (!onRim(p) || !onRim(q) || onSide({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })) return;
          chords++;
          expect(angle(p, q), `block ${k}, chord ${j}`).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-9);
        });
      });
      expect(chords).toBeGreaterThanOrEqual(4);
    });

    it('inside a block it is anchored at the chariot, 0 m off; far from both blocks there are none', () => {
      const inside = ofKind(items(stateAt(1, { x: 11, z: -15, yaw: 0.3 })), 'ranks')[1];
      expect(inside).toMatchObject({ x: C, y: C, clamped: false, dist: 0 });
      expect(ofKind(items(stateAt(1, { x: -120, z: 50, yaw: NORTH })), 'ranks')).toEqual([]);
    });

    it('over a sweep of chariot places, every anchor and outline point lies within the radius shown', () => {
      // Level 4 with sight off: 70% of the inner radius. In sight, or with no static: all of it. Level 5: 55%.
      const base = stateAt(1, { x: 0, z: 0, yaw: 0 });
      const cases = [
        { riuh: 4.2, on: false, radius: 0.7 * R },
        { riuh: 4.2, on: true, radius: R },
        { riuh: 5, on: false, radius: 0.55 * R },
        { riuh: 0, on: false, radius: R },
      ];
      for (const { riuh, on, radius } of cases) {
        let seen = 0;
        let cut = 0;
        let worst = 0;
        let offAnchor = 0;
        let offBlock = 0;
        for (let i = 0; i <= 60; i++) {
          for (let j = 0; j <= 60; j++) {
            const car = initChariot(-160 + (320 * i) / 60, -170 + (320 * j) / 60, (i * 61 + j) * 0.37);
            const s: GameState = { ...base, car, riuh: { ...base.riuh, value: riuh }, sight: { ...base.sight, on } };
            for (const r of ofKind(items(s), 'ranks')) {
              seen++;
              if (r.clamped) worst = Infinity;
              const pts = r.points ?? [];
              // The anchor and every outline point lie on an army block.
              for (const p of [r, ...pts]) if (!w.figures.some((c) => inBlock(c, fieldOf(p, car)))) offBlock++;
              worst = Math.max(worst, fromCentre(r), ...pts.map(fromCentre));
              // The anchor is the block's nearest point: as far out on the radar as the block is metres off.
              offAnchor = Math.max(offAnchor, Math.abs(fromCentre(r) - (r.dist * R) / 70));
              if (pts.some((p) => fromCentre(p) > radius - 1e-6)) cut++;
            }
          }
        }
        expect(seen, `riuh ${riuh}, sight ${on}`).toBeGreaterThan(500);
        expect(cut, `riuh ${riuh}, sight ${on}`).toBeGreaterThan(100);
        expect(worst, `riuh ${riuh}, sight ${on}`).toBeLessThanOrEqual(radius + EPS);
        expect(offAnchor).toBeLessThan(1e-9);
        expect(offBlock, `riuh ${riuh}, sight ${on}`).toBe(0);
      }
    });
  });

  describe('the range shown eases toward the speed', () => {
    const base = stateAt(1, { x: 0, z: 0, yaw: 0 });
    /** The HUD's snapshots, one each HUD_DT s, each eased from the one before, from the chariot's speed at each. */
    function chain(speeds: readonly number[], at: GameState = base, first?: HudSnapshot): HudSnapshot[] {
      const out: HudSnapshot[] = [];
      let prev = first;
      for (const v of speeds) {
        prev = hudOf(atSpeed(at, v), w, prev, HUD_DT);
        out.push(prev);
      }
      return out;
    }
    /** The times of the snapshots over `seconds` s, from HUD_DT on. */
    const ticks = (seconds: number) => Array.from({ length: Math.round(seconds / HUD_DT) }, (_, k) => (k + 1) * HUD_DT);

    it('follows the target with a first-order lag of 1 s; the first snapshot starts at the target', () => {
      expect(RANGE_LAG).toBe(1);
      const first = hudOf(atSpeed(base, 17), w);
      expect(first.radarM).toBeCloseTo(radarRange(17), 12);
      const next = hudOf(atSpeed(base, 25), w, first, 0.4);
      expect(next.radarM).toBeCloseTo(radarRange(17) + (radarRange(25) - radarRange(17)) * (1 - Math.exp(-0.4)), 12);
      expect(hudOf(atSpeed(base, 25), w, first, 0).radarM).toBe(first.radarM);
      // The radar is drawn at the range shown, not at the speed's.
      expect(next.radar).toEqual(radarItems(atSpeed(base, 25), w, RADAR_PX, next.radarM));
      expect(next.radar).not.toEqual(radarItems(atSpeed(base, 25), w, RADAR_PX));
    });

    it('a monotone ramp of speed gives a monotone range', () => {
      const up = chain(ticks(6).map((t) => Math.min(25, 5 * t)));
      const down = chain(ticks(6).map((t) => Math.max(0, 25 - 6 * t)));
      for (let k = 1; k < up.length; k++) {
        expect(up[k].radarM).toBeGreaterThanOrEqual(up[k - 1].radarM);
        expect(down[k].radarM).toBeLessThanOrEqual(down[k - 1].radarM);
      }
      expect(up.at(-1)!.radarM).toBeGreaterThan(up[0].radarM + 40);
      expect(down.at(-1)!.radarM).toBeLessThan(down[0].radarM - 40);
    });

    it('a ±1 m/s wobble at 3 Hz round 12 m/s moves it by 0.3 m at most', () => {
      const settled = hudOf(atSpeed(base, 12), w);
      const wobble = chain(ticks(10).map((t) => 12 + Math.sin(2 * Math.PI * 3 * t)), base, settled).map((h) => h.radarM);
      // From where it had settled (0.20 m at most), and from crest to trough once the wobble's start has died away
      // (0.26 m; 0.33 m with the abrupt start's own swing).
      expect(Math.max(...wobble.map((m) => Math.abs(m - settled.radarM)))).toBeLessThanOrEqual(0.3);
      const late = wobble.slice(30);
      expect(Math.max(...late) - Math.min(...late)).toBeLessThanOrEqual(0.3);
    });

    it('from rest to 25 m/s it comes within 3 m of the target within 4 s, without a jump', () => {
      const rest = hudOf(base, w);
      expect(rest.radarM).toBe(70);
      const climb = chain(ticks(4).map(() => 25), base, rest);
      expect(climb[0].radarM).toBeLessThan(76);
      expect(Math.abs(climb.at(-1)!.radarM - radarRange(25))).toBeLessThanOrEqual(3);
    });

    it('a place at the edge stays put through small speed changes', () => {
      // At level 4 the edge lies at 70% of the range shown: 67.48 m round 12 m/s. Record A stands 0.25 m past it, then
      // 0.25 m within it, while the speed wobbles ±1 m/s at 3 Hz; record B stays near.
      for (const [off, shown] of [[0.25, 1], [-0.25, 2]] as const) {
        const at = loud(stateAt(1, { x: 52, z: 44 - (0.7 * radarRange(12) + off), yaw: NORTH }), 4.2);
        const counts = chain(
          ticks(5).map((t) => 12 + Math.sin(2 * Math.PI * 3 * t)),
          at,
          hudOf(atSpeed(at, 12), w),
        ).map((h) => ofKind(h.radar, 'record').length);
        expect(counts, `A ${off} m off the edge`).toEqual(counts.map(() => shown));
      }
    });
  });

  describe('the hold at the edge', () => {
    // Level 4 at rest: the edge lies at 49 m. Record A (52, 44) stands 48.5 m from (52, −4.5), within the edge but not
    // HOLD m within it; record B (62, −50) stands 46.6 m off.
    const near: Pose = { x: 52, z: -4.5, yaw: NORTH };
    const base = loud(stateAt(1, near), 4.2);
    const shownA = hudOf(loud(stateAt(1, { x: 52, z: 0, yaw: NORTH }), 4.2), w);
    const hiddenA = hudOf(loud(stateAt(1, { x: 52, z: -9, yaw: NORTH }), 4.2), w);
    const recordKeys = (h: HudSnapshot) => ofKind(h.radar, 'record').map((i) => i.key);

    it('every item has a key of its own, the same from one snapshot to the next', () => {
      expect(HOLD).toBe(1);
      const s = sighted(stateAt(1, { x: 55, z: 0, yaw: NORTH }, { route: { target: 'A', points: [{ x: 55, z: 0 }, { x: 52, z: 44 }] } }));
      const keys = items(s).map((i) => i.key);
      expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toEqual(expect.arrayContaining(['tower', 'route', 'record:A', 'record:B', 'decoy:1', 'shelter:camp', 'ranks:army-adharma']));
      expect(items(atSpeed(s, 3)).map((i) => i.key)).toEqual(keys);
    });

    it('a place the last snapshot did not show appears only HOLD m within the edge; one it showed stays up to the edge', () => {
      // From (52, 0) record A lies 44 m off and B 51 m off; from (52, −9) A lies 53 m off.
      expect(recordKeys(shownA)).toEqual(['record:A']);
      expect(recordKeys(hiddenA)).toEqual(['record:B']);
      expect(recordKeys(hudOf(base, w))).toEqual(['record:A', 'record:B']);
      expect(recordKeys(hudOf(base, w, shownA, HUD_DT))).toEqual(['record:A', 'record:B']);
      expect(recordKeys(hudOf(base, w, hiddenA, HUD_DT))).toEqual(['record:B']);
      // HOLD m within the edge it shows whatever came before.
      const deeper = loud(stateAt(1, { x: 52, z: -3.9, yaw: NORTH }), 4.2);
      expect(recordKeys(hudOf(deeper, w, hiddenA, HUD_DT))).toEqual(['record:A', 'record:B']);
      // Past the edge nothing shows, whatever came before.
      const past = loud(stateAt(1, { x: 52, z: -5.2, yaw: NORTH }), 4.2);
      expect(recordKeys(hudOf(past, w, shownA, HUD_DT))).toEqual(['record:B']);
    });

    it('a route to a place the hold leaves out stops HOLD m within the edge, short of it', () => {
      const route = { target: 'A', points: [{ x: 52, z: -4.5 }, { x: 52, z: 44 }] };
      const held = ofKind(hudOf({ ...base, route }, w, hiddenA, HUD_DT).radar, 'route')[0];
      expect(held.clamped).toBe(true);
      expect(fromCentre(held)).toBeCloseTo(((49 - HOLD) * R) / 70, 9);
      const reached = ofKind(hudOf({ ...base, route }, w, shownA, HUD_DT).radar, 'route')[0];
      expect(reached.clamped).toBe(false);
      expect(fromCentre(reached)).toBeCloseTo((48.5 * R) / 70, 9);
    });
  });

  describe('no place at the edge flickers', () => {
    const FPS = 60;
    const EDGE_OF_FIELD = fieldEdge(PLAY);
    const hold = (v: number, target: number): ChariotInput =>
      v < target - 0.05 ? { ...NO_INPUT, throttle: 1 } : v > target + 0.05 ? { ...NO_INPUT, brake: 0.3 } : NO_INPUT;
    /** The re-review's manoeuvres: each from v0 m/s for `seconds` s; `input` reads the time and the forward speed. */
    const DRIVES: { name: string; v0: number; seconds: number; input: (t: number, v: number) => ChariotInput }[] = [
      { name: 'launch from rest', v0: 0, seconds: 5, input: () => ({ ...NO_INPUT, throttle: 1 }) },
      { name: 'hard brake from 17 m/s', v0: 17, seconds: 1.5, input: () => ({ ...NO_INPUT, brake: 1 }) },
      { name: 'surge at 17 m/s, then the overspeed drag', v0: 17, seconds: 3.5, input: (t) => ({ ...NO_INPUT, throttle: 1, boost: t < 0.05 }) },
      { name: 'coast from 17 m/s', v0: 17, seconds: 5, input: () => NO_INPUT },
      { name: 'hold 1.0 m/s', v0: 1, seconds: 5, input: (_t, v) => hold(v, 1) },
      { name: 'hold 2.27 m/s', v0: 5 / 2.2, seconds: 5, input: (_t, v) => hold(v, 5 / 2.2) },
      { name: 'keyboard taps round 12.6 m/s', v0: 12.6, seconds: 6, input: (t) => ({ ...NO_INPUT, throttle: Math.floor(t / 0.15) % 2 === 0 ? 1 : 0 }) },
    ];
    /** Thirty open copies a lakon's volleys could leave, 40 m apart across the field, for the drives in sight. */
    const COPIES: Decoy[] = [];
    for (let x = -120; x <= 120; x += 40) {
      for (let z = -130; z <= 110; z += 40) {
        if (Math.hypot(x - PLAY.cx, z - PLAY.cz) <= 130) COPIES.push({ id: 100 + COPIES.length, at: { x: x + 7, z: z + 3 }, born: 0, life: null, state: 'open', mimic: false });
      }
    }
    /** How each drive is shown: the clamour forced, sight off or on. */
    const VIEWS = [
      { tag: 'level 4', view: (s: GameState) => loud(s, 4.5) },
      { tag: 'level 5', view: (s: GameState) => loud(s, 5) },
      { tag: 'riuh 0', view: (s: GameState) => loud(s, 0) },
      { tag: 'in sight, with copies', view: (s: GameState) => sighted(loud({ ...s, decoys: COPIES }, 4.5)) },
    ];

    /**
     * Each drive from places 25 m apart within 120 m of the field's centre, at four headings, 3 m clear of everything;
     * a run stops before the guard, the field's edge or a collider would touch it. The HUD is read every HUD_DT s of
     * the 60 fps drive, each snapshot eased from the one before, as the runtime does.
     */
    function flickerOf(drive: (typeof DRIVES)[number]): { flicker: Flicker[]; runs: number } {
      const base = stateAt(0, { x: 0, z: 0, yaw: 0 });
      const flicker = VIEWS.map((v) => new Flicker(`${drive.name}, ${v.tag}`));
      let runs = 0;
      for (let x = -120; x <= 120; x += 25) {
        for (let z = -130; z <= 110; z += 25) {
          if (Math.hypot(x - PLAY.cx, z - PLAY.cz) > 120) continue;
          for (let a = 0; a < 4; a++) {
            const start = initChariot(x, z, (a * Math.PI) / 2 + 0.3);
            if (hullClearance(start.x, start.z, start.yaw, w.colliders) < 3) continue;
            runs++;
            const f = forward(start.yaw);
            let car: ChariotState = { ...start, vx: f.x * drive.v0, vz: f.z * drive.v0 };
            const runFlicker = VIEWS.map((v) => new Flicker(`${drive.name}, ${v.tag}, from (${x}, ${z}) heading ${a}`));
            const prev: (HudSnapshot | undefined)[] = VIEWS.map(() => undefined);
            let since = HUD_DT;
            for (let k = 0; k < drive.seconds * FPS; k++) {
              const t = k / FPS;
              if (since >= HUD_DT - 1e-9) {
                since = 0;
                const s: GameState = { ...base, car };
                VIEWS.forEach((v, j) => {
                  const shown = v.view(s);
                  prev[j] = hudOf(shown, w, prev[j], HUD_DT);
                  runFlicker[j].sample(t, shown, prev[j]!);
                });
              }
              car = stepChariot(car, drive.input(t, speedOf(car)), 1 / FPS, { cloud: false, guard: w.guard, edge: EDGE_OF_FIELD });
              since += 1 / FPS;
              const off = Math.hypot(car.x - PLAY.cx, car.z - PLAY.cz) > 140;
              if (car.held > 0 || car.edgeCut > 0 || off || hullClearance(car.x, car.z, car.yaw, w.colliders) < 1) break;
            }
            runFlicker.forEach((r, j) => {
              flicker[j].cycles += r.cycles;
              flicker[j].changes += r.changes;
              flicker[j].examples.push(...r.examples);
            });
          }
        }
      }
      return { flicker, runs };
    }

    for (const drive of DRIVES) {
      it(`${drive.name}: no show, hide and show again within 0.5 s, at levels 4 and 5, at riuh 0 and in sight`, () => {
        const { flicker, runs } = flickerOf(drive);
        expect(runs).toBeGreaterThan(200);
        // Places do cross the edges: the count is of flicker, not of nothing happening.
        expect(flicker.reduce((a, f) => a + f.changes, 0)).toBeGreaterThan(100);
        for (const f of flicker) expect(f.cycles, f.examples.join('; ')).toBe(0);
      }, 60_000);
    }
  });

  describe('the route', () => {
    const car: Pose = { x: 0, z: 0, yaw: NORTH };
    const routed = (points: XZ[], at: Pose = car, o: (s: GameState) => GameState = (s) => s) =>
      ofKind(items(o({ ...stateAt(1, at), route: { target: 'A', points } })), 'route');
    const expectLine = (item: RadarItem, line: XZ[], at: Pose = car, range = 70) => {
      const pts = item.points ?? [];
      expect(pts).toHaveLength(line.length);
      line.forEach((p, k) => {
        expect(pts[k].x, `point ${k}`).toBeCloseTo(mapPx(p, at, range).x, 9);
        expect(pts[k].y, `point ${k}`).toBeCloseTo(mapPx(p, at, range).y, 9);
      });
      expect(item.x).toBeCloseTo(pts[pts.length - 1].x, 9);
      expect(item.y).toBeCloseTo(pts[pts.length - 1].y, 9);
    };

    it('is one item: the line from the chariot along the route to its end', () => {
      const [r] = routed([{ x: 0, z: 0 }, { x: 0, z: -30 }, { x: 30, z: -30 }]);
      expectLine(r, [{ x: 0, z: 0 }, { x: 0, z: -30 }, { x: 30, z: -30 }]);
      expect(r.clamped).toBe(false);
      expect(r.dist).toBeCloseTo(Math.hypot(30, 30), 9);
    });

    it('starts where the chariot is along it, past the corners behind', () => {
      const at: Pose = { x: 4, z: -10, yaw: NORTH };
      const [r] = routed([{ x: 0, z: 20 }, { x: 0, z: 0 }, { x: 0, z: -30 }, { x: 20, z: -30 }], at);
      expectLine(r, [{ x: 0, z: -10 }, { x: 0, z: -30 }, { x: 20, z: -30 }], at);
    });

    it('is cut where it leaves the range, and marked clamped', () => {
      const [r] = routed([{ x: 0, z: 0 }, { x: 0, z: -40 }, { x: 100, z: -40 }]);
      expectLine(r, [{ x: 0, z: 0 }, { x: 0, z: -40 }, { x: Math.sqrt(70 * 70 - 40 * 40), z: -40 }]);
      expect(r.clamped).toBe(true);
      expect(fromCentre(r)).toBeCloseTo(R, 9);
      expect(r.dist).toBeCloseTo(Math.hypot(100, 40), 9);
    });

    it('keeps at most 12 points', () => {
      expect(ROUTE_POINTS).toBe(12);
      const zigzag = Array.from({ length: 30 }, (_, k) => ({ x: k % 2 === 0 ? 0 : 3, z: -2 * k }));
      const [r] = routed(zigzag);
      expectLine(r, zigzag.slice(0, 12));
      expect(r.clamped).toBe(true);
      const [short] = routed(zigzag.slice(0, 12));
      expectLine(short, zigzag.slice(0, 12));
      expect(short.clamped).toBe(false);
    });

    it('at level 4 it is cut at 70% of the range, unless sight is on', () => {
      const line = [{ x: 0, z: 0 }, { x: 0, z: -200 }];
      const [veiled] = routed(line, car, (s) => loud(s, 4.2));
      expectLine(veiled, [{ x: 0, z: 0 }, { x: 0, z: -49 }]);
      expect(veiled.clamped).toBe(true);
      const [seen] = routed(line, car, (s) => sighted(loud(s, 4.2)));
      expectLine(seen, [{ x: 0, z: 0 }, { x: 0, z: -70 }]);
    });

    it('none without a route, at its end, or with the chariot out of range of it', () => {
      expect(ofKind(items(stateAt(1, car)), 'route')).toEqual([]);
      expect(routed([{ x: 0, z: 0 }])).toEqual([]);
      expect(routed([{ x: 0, z: 30 }, { x: 0, z: 0 }])).toEqual([]);
      expect(routed([{ x: 100, z: 0 }, { x: 100, z: -50 }])).toEqual([]);
    });
  });

  it('is the same for the same state, and leaves the state as it was', () => {
    const s = sighted(loud(stateAt(0, { x: -10, z: 40, yaw: 0.4 }), 2.2));
    const before = JSON.stringify(s);
    expect(items(s)).toEqual(items(s));
    expect(JSON.stringify(s)).toBe(before);
  });

  /**
   * Whether every route item that is not cut ends on an item shown there, unless it leads to a course's lane (a day of two
   * rewrites, which the radar does not mark).
   */
  function routesEndShown(s: GameState, list: readonly RadarItem[]): string[] {
    const first = openTargets(s.run)[0];
    if (first?.kind === 'gate' && !first.real) return [];
    const faults: string[] = [];
    for (const r of list) {
      if (r.kind !== 'route' || r.clamped) continue;
      const end = r.points!.at(-1)!;
      const there = list.some((i) => i.kind !== 'route' && i.kind !== 'ranks' && Math.hypot(i.x - end.x, i.y - end.y) < 1e-6);
      if (!there) faults.push(`a route ends at (${end.x.toFixed(1)}, ${end.y.toFixed(1)}) with nothing shown there`);
    }
    return faults;
  }

  it('every lakon ridden by the autopilot, two seeds each: bounded, within the radius shown, no flicker at levels 4 and 5', () => {
    let samples = 0;
    let withCopies = 0;
    let withReplays = 0;
    let routes = 0;
    const faults: string[] = [];
    const flicker = [new Flicker('level 4'), new Flicker('level 5')];
    for (const ch of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      for (const seed of [1, 2]) {
        // Every chapter before it finished: its roam shows their replay rings and the free laps' posts (Task 36).
        const roam: RoamInput = { finished: Array.from({ length: ch }, (_, k) => k), bests: [], bestLap: null, defOf };
        let s = startChapter(defOf(ch), defOf(ch).start, seed, w, roam);
        // The HUD as the lakon has it, and as levels 4 and 5 with sight off would show it, each eased from its last.
        const views = [(x: GameState) => x, (x: GameState) => loud({ ...x, sight: { ...x.sight, on: false } }, 4.5), (x: GameState) => loud({ ...x, sight: { ...x.sight, on: false } }, 5)];
        const prev: (HudSnapshot | undefined)[] = views.map(() => undefined);
        const runFlicker = [new Flicker(`chapter ${ch}, seed ${seed}, level 4`), new Flicker(`chapter ${ch}, seed ${seed}, level 5`)];
        let since = HUD_DT;
        for (let k = 0; k < 180 * 30 && s.run.phase !== 'done'; k++) {
          const t = k / 30;
          if (since >= HUD_DT - 1e-9) {
            since = 0;
            samples++;
            views.forEach((view, j) => {
              const shownState = view(s);
              const hud = hudOf(shownState, w, prev[j], HUD_DT);
              prev[j] = hud;
              const list = hud.radar;
              // The radius shown: the inner radius, or the static's inner edge with sight off.
              const shown = (shownState.sight.on ? 1 : 1 - levelEffects(riuhLevel(shownState.riuh.value)).radarStatic) * R;
              for (const i of list) {
                if (fromCentre(i) > shown + EPS) faults.push(`${i.kind} at ${fromCentre(i)} px, past ${shown}`);
                for (const p of i.points ?? []) if (fromCentre(p) > shown + EPS) faults.push(`${i.kind} point past ${shown}`);
                if (i.kind === 'ranks' && i.clamped) faults.push('ranks clamped');
                if (i.kind === 'route' && i.points!.length > ROUTE_POINTS) faults.push('route over 12 points');
                if (i.kind === 'route' && !i.clamped) routes++;
              }
              // Bounded by the data: the ranks, the shelters, the route, the tower, at most 9 targets (in roam the marker and
              // the free laps' two posts), the copies, and in roam a ring per finished lakon.
              const replays = shownState.roam?.replays.length ?? 0;
              if (list.length > 2 + 3 + 1 + 1 + 9 + shownState.decoys.length + replays) faults.push(`${list.length} items`);
              if (ofKind(list, 'replay').length > replays) faults.push('a replay ring past the finished lakon');
              if (j === 0 && ofKind(list, 'replay').length > 0) withReplays++;
              const copies = ofKind(list, 'decoy').length;
              if (!shownState.sight.on && copies > 0) faults.push('copies out of sight');
              if (j === 0 && copies > 0) withCopies++;
              faults.push(...routesEndShown(shownState, list));
              if (j > 0) runFlicker[j - 1].sample(t, shownState, hud);
            });
          }
          s = advance(s, autopilot(s, w), 1 / 30, w).state;
          since += 1 / 30;
        }
        runFlicker.forEach((r, j) => {
          flicker[j].cycles += r.cycles;
          flicker[j].changes += r.changes;
          flicker[j].examples.push(...r.examples);
        });
      }
    }
    expect(faults.slice(0, 5)).toEqual([]);
    expect(samples).toBeGreaterThan(5000);
    // The bot uses sight near the copies, so the radar shows some; and it rides routes that end on what they lead to.
    expect(withCopies).toBeGreaterThan(0);
    // Each roam's first snapshot holds its replay rings, as the lakon has it (the loud views' static may hide far ones):
    // chapters 2 to 8, two seeds each.
    expect(withReplays).toBe(7 * 2);
    expect(routes).toBeGreaterThan(1000);
    for (const f of flicker) {
      expect(f.changes, f.examples.join('; ')).toBeGreaterThan(100);
      expect(f.cycles, f.examples.join('; ')).toBe(0);
    }
  }, 120_000);

  it('a route under static never ends past the edge on nothing: it is cut there, or its record shows', () => {
    // The re-review's case: chapter 1 at (52, −5.5) facing east, level 4, record A 49.5 m off, at 0 to 2.2 m/s.
    const at = loud(stateAt(1, { x: 52, z: -5.5, yaw: 0 }), 4.2);
    const target = openTargets(at.run)[0];
    expect(target.id).toBe('A');
    const route = routeTo(w.nav, w.colliders, at.car, target.at);
    expect(route).not.toBeNull();
    for (let v = 0; v <= 2.2 + EPS; v += 0.1) {
      const list = hudOf(atSpeed({ ...at, route: { target: target.id, points: route! } }, v), w).radar;
      const [r] = ofKind(list, 'route');
      expect(r, `${v.toFixed(1)} m/s`).toBeDefined();
      expect(routesEndShown(at, list), `${v.toFixed(1)} m/s`).toEqual([]);
    }
  });

  it('reads no clock and no randomness', () => {
    const src = readFileSync('src/lib/bowobharata-game/radar.ts', 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('sameRadar', () => {
  const s = sighted(stateAt(1, { x: 55, z: 0, yaw: NORTH }, { route: { target: 'A', points: [{ x: 55, z: 0 }, { x: 55, z: -40 }, { x: 70, z: -60 }] } }));
  const a = items(s);
  const move = (k: number, dx: number, dy: number) => a.map((i, j) => (j === k ? { ...i, x: i.x + dx, y: i.y + dy } : i));
  const routeAt = a.findIndex((i) => i.kind === 'route');
  const moveRoute = (dx: number, dy = 0) =>
    a.map((i, j) => (j === routeAt ? { ...i, points: i.points!.map((p, n) => (n === 1 ? { x: p.x + dx, y: p.y + dy } : p)) } : i));

  it('holds for the same items, and for any moved less than 1 px', () => {
    expect(routeAt).toBeGreaterThanOrEqual(0);
    expect(sameRadar(a, items(s))).toBe(true);
    expect(sameRadar(a, move(0, 0.6, -0.6))).toBe(true);
    // 0.99 px along the diagonal.
    expect(sameRadar(a, move(a.length - 1, 0.7, 0.7))).toBe(true);
    expect(sameRadar(a, move(a.length - 1, -0.7, 0.7))).toBe(true);
    expect(sameRadar(a, moveRoute(0.5))).toBe(true);
    expect(sameRadar(a, moveRoute(0.7, -0.7))).toBe(true);
    expect(sameRadar(a, a.map((i) => ({ ...i, dist: i.dist + 3 })))).toBe(true);
  });

  it('fails for another count, another kind, a move of 1 px or more, another clamp or another outline', () => {
    expect(sameRadar(a, a.slice(1))).toBe(false);
    expect(sameRadar(a, [...a, a[0]])).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === 0 ? { ...i, kind: 'replay' as const } : i)))).toBe(false);
    expect(sameRadar(a, move(0, 1, 0))).toBe(false);
    expect(sameRadar(a, move(a.length - 1, 0, -1))).toBe(false);
    // 1.004 px and 1.40 px along the diagonal: a move under a pixel on each axis is still a move of a pixel or more.
    expect(sameRadar(a, move(a.length - 1, 0.71, 0.71))).toBe(false);
    expect(sameRadar(a, move(a.length - 1, -0.99, 0.99))).toBe(false);
    expect(sameRadar(a, moveRoute(0.71, -0.71))).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === 0 ? { ...i, clamped: !i.clamped } : i)))).toBe(false);
    expect(sameRadar(a, moveRoute(1))).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === routeAt ? { ...i, points: i.points!.slice(1) } : i)))).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === routeAt ? { ...i, points: undefined } : i)))).toBe(false);
  });
});
