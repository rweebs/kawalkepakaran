import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initChariot } from '../src/lib/bowobharata-game/drive';
import { clamp, forward, segPointDist, type XZ } from '../src/lib/bowobharata-game/geom';
import { advance, createWorld, startChapter, type GameState } from '../src/lib/bowobharata-game/engine';
import { autopilot } from '../src/lib/bowobharata-game/autopilot';
import { across, missionFor, type MissionDef, type StepDef } from '../src/lib/bowobharata-game/missions';
import { openTargets, type Decoy, type RunState } from '../src/lib/bowobharata-game/mission-run';
import { ANCHORS, TOWER_EXIT, distToCollider, type Collider } from '../src/lib/bowobharata-game/world';
import { levelEffects, riuhLevel } from '../src/lib/bowobharata-game/riuh';
import {
  GATE_DAYS,
  RADAR_PX,
  ROUTE_POINTS,
  radarItems,
  radarPoint,
  radarRange,
  sameRadar,
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

    it('shows nothing of the course in roam, and no record items: its records are its gates', () => {
      expect(gates({ phase: 'roam' })).toEqual([]);
      expect(ofKind(items(stateAt(4, car, {}, { dayIndex: 0 })), 'record')).toEqual([]);
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

  describe('the edge holds while the speed wobbles', () => {
    /** The state with the chariot at `at`, moving forward at v m/s. */
    const moving = (s: GameState, at: Pose, v: number): GameState => {
      const f = forward(at.yaw);
      return { ...s, car: { ...initChariot(at.x, at.z, at.yaw), vx: f.x * v, vz: f.z * v } };
    };
    /** 0 to 2.2 m/s: the range runs from 70 m to 74.84 m. */
    const SPEEDS = Array.from({ length: 23 }, (_, k) => k / 10);

    it('at level 4 a record just past the edge of the static stays hidden, and shows from the next step of range', () => {
      // Record A (52, 44) lies 49.5 m from (52, −5.5): past 70% of 70 m, though within 70% of 74.84 m. B lies 45.6 m off.
      const at: Pose = { x: 52, z: -5.5, yaw: 0 };
      const base = loud(stateAt(1, at), 4.2);
      expect(SPEEDS.map((v) => ofKind(items(moving(base, at, v)), 'record').length)).toEqual(SPEEDS.map(() => 1));
      // From 75 m of range (2.28 m/s) the edge lies at 52.5 m.
      expect(ofKind(items(moving(base, at, 2.4)), 'record')).toHaveLength(2);
      // Nothing shown ever lies past the static's inner edge.
      for (const v of [...SPEEDS, 2.4]) {
        for (const i of items(moving(base, at, v))) {
          expect(fromCentre(i), `${i.kind} at ${v} m/s`).toBeLessThanOrEqual(0.7 * R + EPS);
          for (const p of i.points ?? []) expect(fromCentre(p), `${i.kind} at ${v} m/s`).toBeLessThanOrEqual(0.7 * R + EPS);
        }
      }
    });

    it('at level 4 a block just past the edge of the static stays out', () => {
      // The Kurawa block's east face lies 49.5 m west of (68.8, −15); the Pandawa block lies 71.7 m off.
      const at: Pose = { x: 19.3 + 49.5, z: -15, yaw: Math.PI };
      const base = loud(stateAt(1, at), 4.2);
      expect(SPEEDS.map((v) => ofKind(items(moving(base, at, v)), 'ranks').length)).toEqual(SPEEDS.map(() => 0));
      expect(ofKind(items(moving(base, at, 2.4)), 'ranks')).toHaveLength(1);
    });

    it('in sight, a copy just past the range stays out, and shows from the next step of range', () => {
      const at: Pose = { x: 0, z: 0, yaw: 0 };
      const copy: Decoy = { id: 9, at: { x: 70.5, z: 0 }, born: 0, life: 20, state: 'open', mimic: false };
      const s = { ...sighted(stateAt(1, at)), decoys: [copy] };
      expect(SPEEDS.map((v) => ofKind(items(moving(s, at, v)), 'decoy').length)).toEqual(SPEEDS.map(() => 0));
      expect(ofKind(items(moving(s, at, 2.4)), 'decoy')).toHaveLength(1);
    });
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

  it('every lakon, ridden by the autopilot: bounded, inside the radius shown, copies only in sight, the route at most 12 points', () => {
    let frames = 0;
    let withCopies = 0;
    for (const ch of [0, 1, 2, 4, 5, 7]) {
      let s = startChapter(defOf(ch), defOf(ch).start, 1, w);
      for (let k = 0; k < 75 * 30 && s.run.phase !== 'done'; k++) {
        s = advance(s, autopilot(s, w), 1 / 30, w).state;
        if (k % 5 !== 0) continue;
        frames++;
        const list = items(s);
        // Bounded by the data: the ranks, the shelters, the route, the tower, at most 9 records or gates, and the copies.
        expect(list.length).toBeLessThanOrEqual(2 + 3 + 1 + 1 + 9 + s.decoys.length);
        // The radius shown: the inner radius, or the static's inner edge with sight off.
        const shown = (s.sight.on ? 1 : 1 - levelEffects(riuhLevel(s.riuh.value)).radarStatic) * R;
        for (const i of list) {
          expect(fromCentre(i), i.kind).toBeLessThanOrEqual(shown + EPS);
          for (const p of i.points ?? []) expect(fromCentre(p), `${i.kind} point`).toBeLessThanOrEqual(shown + EPS);
          expect(i.clamped || i.dist <= radarRange(0) + 2.2 * 25 + EPS).toBe(true);
          if (i.kind === 'route') expect(i.points!.length).toBeLessThanOrEqual(ROUTE_POINTS);
        }
        const copies = ofKind(list, 'decoy').length;
        if (!s.sight.on) expect(copies).toBe(0);
        if (copies > 0) withCopies++;
      }
    }
    expect(frames).toBeGreaterThan(1000);
    // The bot uses sight near the copies, so the radar shows some.
    expect(withCopies).toBeGreaterThan(0);
  }, 60_000);

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
