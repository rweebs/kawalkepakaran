import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initChariot } from '../src/lib/bowobharata-game/drive';
import { rightOf, type XZ } from '../src/lib/bowobharata-game/geom';
import { advance, createWorld, startChapter, type GameState } from '../src/lib/bowobharata-game/engine';
import { autopilot } from '../src/lib/bowobharata-game/autopilot';
import { missionFor, type MissionDef, type StepDef } from '../src/lib/bowobharata-game/missions';
import type { Decoy, RunState } from '../src/lib/bowobharata-game/mission-run';
import { ANCHORS, TOWER_EXIT, distToCollider } from '../src/lib/bowobharata-game/world';
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
      if (i.kind !== 'ranks') expect(fromCentre(i), i.kind).toBeLessThanOrEqual(0.7 * R + EPS);
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
    /** Day n's real gate: its id and its centre. */
    const realGate = (n: number) => {
      const d = course.days[n - 1];
      const g = d.gates.find((x) => x.real);
      if (!g) throw new Error(`day ${n} holds no real gate`);
      const r = rightOf(d.heading);
      return { id: g.id, at: { x: d.at.x + r.x * g.offset, z: d.at.z + r.z * g.offset } };
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

  it('the ranks: each army block as its outline, while any of it lies within the range', () => {
    const car: Pose = { x: 0, z: 30, yaw: NORTH };
    const ranks = ofKind(items(stateAt(1, car)), 'ranks');
    expect(w.figures).toHaveLength(2);
    expect(ranks).toHaveLength(2);
    w.figures.forEach((c, k) => {
      if (c.kind !== 'box') throw new Error('an army is a box');
      const corners = [
        { x: c.minX, z: c.minZ },
        { x: c.maxX, z: c.minZ },
        { x: c.maxX, z: c.maxZ },
        { x: c.minX, z: c.maxZ },
      ];
      const pts = ranks[k].points ?? [];
      expect(pts).toHaveLength(4);
      corners.forEach((p, j) => {
        expect(pts[j].x).toBeCloseTo(mapPx(p, car).x, 9);
        expect(pts[j].y).toBeCloseTo(mapPx(p, car).y, 9);
      });
      const mid = mapPx({ x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2 }, car);
      expect(ranks[k].x).toBeCloseTo(mid.x, 9);
      expect(ranks[k].y).toBeCloseTo(mid.y, 9);
      expect(ranks[k].dist).toBeCloseTo(Math.max(0, distToCollider(car, c)), 9);
    });
    // Inside a block's own box the distance is 0; far from both, no ranks.
    expect(ofKind(items(stateAt(1, { x: 11, z: -15, yaw: NORTH })), 'ranks')[1].dist).toBe(0);
    expect(ofKind(items(stateAt(1, { x: -120, z: 50, yaw: NORTH })), 'ranks')).toEqual([]);
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

  it('every lakon, ridden by the autopilot: bounded, inside the radar, copies only in sight, the route at most 12 points', () => {
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
        for (const i of list) {
          if (i.kind !== 'ranks') expect(fromCentre(i), i.kind).toBeLessThanOrEqual(R + EPS);
          expect(i.clamped || i.dist <= radarRange(0) + 2.2 * 25 + EPS).toBe(true);
          if (i.kind === 'route') {
            expect(i.points!.length).toBeLessThanOrEqual(ROUTE_POINTS);
            for (const p of i.points!) expect(fromCentre(p)).toBeLessThanOrEqual(R + EPS);
          }
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
  const moveRoute = (dx: number) =>
    a.map((i, j) => (j === routeAt ? { ...i, points: i.points!.map((p, n) => (n === 1 ? { ...p, x: p.x + dx } : p)) } : i));

  it('holds for the same items, and for any moved less than 1 px', () => {
    expect(routeAt).toBeGreaterThanOrEqual(0);
    expect(sameRadar(a, items(s))).toBe(true);
    expect(sameRadar(a, move(0, 0.6, -0.6))).toBe(true);
    expect(sameRadar(a, move(a.length - 1, -0.99, 0.99))).toBe(true);
    expect(sameRadar(a, moveRoute(0.5))).toBe(true);
    expect(sameRadar(a, a.map((i) => ({ ...i, dist: i.dist + 3 })))).toBe(true);
  });

  it('fails for another count, another kind, a move of 1 px or more, another clamp or another outline', () => {
    expect(sameRadar(a, a.slice(1))).toBe(false);
    expect(sameRadar(a, [...a, a[0]])).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === 0 ? { ...i, kind: 'replay' as const } : i)))).toBe(false);
    expect(sameRadar(a, move(0, 1, 0))).toBe(false);
    expect(sameRadar(a, move(a.length - 1, 0, -1))).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === 0 ? { ...i, clamped: !i.clamped } : i)))).toBe(false);
    expect(sameRadar(a, moveRoute(1))).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === routeAt ? { ...i, points: i.points!.slice(1) } : i)))).toBe(false);
    expect(sameRadar(a, a.map((i, j) => (j === routeAt ? { ...i, points: undefined } : i)))).toBe(false);
  });
});
