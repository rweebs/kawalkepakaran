import { describe, expect, it } from 'vitest';
import { PARVAS, parvaEvents } from '../src/lib/bowobharata';
import { PAVILION } from '../src/lib/bowobharata/stage-math';
import { dist, forward, nextRand, polylineDist, rightOf, segPointDist, yawOf, type XZ } from '../src/lib/bowobharata-game/geom';
import {
  ANCHORS,
  GATE_CIRCLE,
  SPAWN,
  TOWER_EXIT,
  clearance,
  distToCollider,
  inPlay,
  staticColliders,
} from '../src/lib/bowobharata-game/world';
import { crossesSegment, hullClearance } from '../src/lib/bowobharata-game/collide';
import { buildNav, pathLength, routeTo } from '../src/lib/bowobharata-game/route';
import {
  CHAPTER_TYPES,
  REAL_DAYS_P4,
  missionFor,
  objectivePoints,
  reachCircles,
  realTargets,
  type DayDef,
  type GateDef,
  type MissionDef,
  type PickupDef,
  type StepDef,
} from '../src/lib/bowobharata-game/missions';
import { MISSION_TIMING } from '../src/lib/bowobharata-game/tuning';

const COLS = staticColliders();
const nav = buildNav(COLS);
const CHAPTERS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const PARVA_CHAPTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const slugsOf = (i: number): string[] => (i === 0 ? [] : parvaEvents(PARVAS[i - 1]).map((e) => e.slug));
const DEFS: MissionDef[] = CHAPTERS.map((i) => missionFor(i, slugsOf(i)));
const xz = (x: number, z: number): XZ => ({ x, z });

function pickups(def: MissionDef): PickupDef[] {
  return def.steps.flatMap((s) => (s.kind === 'collect' ? s.items : s.kind === 'laps' ? [s.then] : []));
}

/** The lakon's course step: its days. */
function daysOf(def: MissionDef): DayDef[] {
  const s = def.steps.find((x): x is Extract<StepDef, { kind: 'course' }> => x.kind === 'course');
  if (!s) throw new Error(`chapter ${def.chapter} has no course`);
  return s.days;
}

/** The lakon's lap step. */
function lapsOf(def: MissionDef): Extract<StepDef, { kind: 'laps' }> {
  const s = def.steps.find((x): x is Extract<StepDef, { kind: 'laps' }> => x.kind === 'laps');
  if (!s) throw new Error(`chapter ${def.chapter} has no laps`);
  return s;
}

/** A gate's ends, or a post's, across `heading` at `at`: `offset` m along rightOf(heading), `width` m wide. */
function ends(at: XZ, heading: number, offset: number, width: number): XZ[] {
  const r = rightOf(heading);
  return [offset - width / 2, offset + width / 2].map((o) => ({ x: at.x + r.x * o, z: at.z + r.z * o }));
}
const gateEnds = (d: DayDef): XZ[] => d.gates.flatMap((g) => ends(d.at, d.heading, g.offset, g.width));

/**
 * The objectives in order: each record of a collect step, each reach centre, each day centre of a course, and a lap
 * course twice round through the post centres back to P1, then the record after it.
 */
function stops(def: MissionDef): XZ[] {
  return def.steps.flatMap((s) => {
    if (s.kind === 'collect') return s.items.map((p) => p.at);
    if (s.kind === 'reach') return [s.at];
    if (s.kind === 'course') return s.days.map((d) => d.at);
    const round = s.posts.map((p) => p.at);
    return [...round, ...round, round[0], s.then.at];
  });
}

interface Leg {
  from: XZ;
  to: XZ;
  path: XZ[] | null;
}

/** The routed legs: from the tower exit (the spawn in the prologue) to the marker, then through the objectives to the tower. */
function legsOf(def: MissionDef): Leg[] {
  const pts: XZ[] = [def.chapter === 0 ? SPAWN : TOWER_EXIT, ...(def.marker ? [def.marker] : []), ...stops(def)];
  return pts.slice(1).map((to, k) => ({ from: pts[k], to, path: routeTo(nav, COLS, pts[k], to) }));
}

const LEGS = new Map<number, Leg[]>();
/** Chapter i's routed legs, built on first use: a step kind stops() cannot route fails only the tests that route. */
function legs(i: number): Leg[] {
  let found = LEGS.get(i);
  if (!found) LEGS.set(i, (found = legsOf(DEFS[i])));
  return found;
}
/** The lakon itself: the legs from the marker on (from the spawn in the prologue). */
const lakonLegs = (i: number): Leg[] => legs(i).slice(DEFS[i].marker ? 1 : 0);
const lakonLength = (i: number): number => lakonLegs(i).reduce((s, l) => s + pathLength(l.path ?? []), 0);
const lakonLine = (i: number): XZ[] => lakonLegs(i).flatMap((l) => l.path ?? []);

/** The least hull clearance at every 0.5 m of a straight 6 m run from the start, on its yaw. */
function straightRun(def: MissionDef): number {
  const f = forward(def.start.yaw);
  let least = Infinity;
  for (let s = 0; s <= 6; s += 0.5) {
    least = Math.min(least, hullClearance(def.start.x + f.x * s, def.start.z + f.z * s, def.start.yaw, COLS));
  }
  return least;
}

const TOWER = xz(-46, 52);
const TOWER_REACH = { kind: 'reach', at: TOWER, r: 9, stopFor: 1.2, place: 'tower' };

type Row = [chapter: number, marker: XZ | null, records: XZ[]];
/** The brief's table for the gather-and-deliver lakon: each marker and its records, in order. */
const GATHER: Row[] = [
  [0, null, [xz(-2, 32), xz(-14, 52), xz(-34, 70), xz(-62, 74), xz(-82, 52), xz(-86, 22), xz(-70, 4), xz(-54, 24)]],
  [1, xz(20, 62), [xz(52, 44), xz(62, -50)]],
  [3, xz(-66, -90), [xz(-38, -96), xz(46, -92), xz(82, 8), xz(-8, 86)]],
  [6, xz(60, -62), [xz(100, -62), xz(80, 40)]],
  [8, xz(-34, 64), [xz(-10, 118), xz(58, 98)]],
];
/** Parva 4's 18 days: each centre and heading, as the brief lists them. */
const P4_DAYS: [XZ, number][] = [
  ...[25, 0, -25, -50, -75].map((z): [XZ, number] => [xz(-70, z), Math.PI / 2]),
  ...[-50, -25, 0, 25, 50].map((x): [XZ, number] => [xz(x, -95), 0]),
  ...[-75, -50, -25, 0, 25].map((z): [XZ, number] => [xz(70, z), -Math.PI / 2]),
  ...[50, 25, 0].map((x): [XZ, number] => [xz(x, 40), Math.PI]),
];
/** Parva 5's lap posts, P1 to P5. */
const P5_POSTS = [xz(-92, 18), xz(-128, -6), xz(-116, -48), xz(-80, -56), xz(-66, -22)];
/** Parva 7's storm: days 2 and 4 hold the real gates at the brief's points; days 1 and 3 are placed on the storm's way. */
const P7_DAYS = [xz(93, 12), xz(64, 46), xz(32, 70), xz(0, 72)];
/** Antar, the courses and the laps: each marker and its objectives in order (see stops), before the tower. */
const OTHERS: Row[] = [
  [2, xz(-100, -10), [xz(-100, -10), xz(115, -20), xz(0, -80)]],
  [4, xz(-70, 58), P4_DAYS.map(([at]) => at)],
  [5, xz(-84, -10), [...P5_POSTS, ...P5_POSTS, P5_POSTS[0], xz(-75, 30)]],
  [7, xz(115, -20), P7_DAYS],
];
const PINNED = new Map([...GATHER, ...OTHERS].map(([i, marker, records]) => [i, { marker, records }] as const));

/** A gather-and-deliver lakon: one collect step with these records in order, then the tower. */
function expectGather(def: MissionDef, marker: XZ | null, records: XZ[]): void {
  expect(def.marker).toEqual(marker);
  expect(def.steps).toHaveLength(2);
  expect(def.steps[0].kind).toBe('collect');
  expect(pickups(def).map((p) => p.at)).toEqual(records);
  expect(def.steps[1]).toEqual(TOWER_REACH);
}

/** The start stands on the marker, facing the first record away from it. */
function expectFacingFirstRecord(def: MissionDef): void {
  const m = def.marker!;
  expect([def.start.x, def.start.z]).toEqual([m.x, m.z]);
  const aim = pickups(def).find((p) => dist(p.at, m) > 0)!.at;
  const f = forward(def.start.yaw);
  const d = dist(aim, m);
  expect(f.x).toBeCloseTo((aim.x - m.x) / d, 12);
  expect(f.z).toBeCloseTo((aim.z - m.z) / d, 12);
}

describe('the lakon table', () => {
  it('names each chapter type, the real days of parva 4 and the mission timings', () => {
    expect(CHAPTER_TYPES).toEqual(['himpun', 'himpun', 'antar', 'himpun', 'lintasan', 'uji', 'himpun', 'lintasan', 'himpun']);
    expect(REAL_DAYS_P4).toEqual([1, 3, 4, 6, 8, 9, 12, 14, 17]);
    expect(MISSION_TIMING).toEqual({
      firstVolley: 20,
      grace: 45,
      markerR: 5,
      markerSpeed: 8,
      stopSpeed: 4,
      stopFor: 1.2,
      gateStopFor: 1.5,
      introSeconds: 3.5,
      introSkipAfter: 0.8,
      outroSeconds: 2.5,
      failSeconds: 1.2,
      pickupR: 3,
      decoyR: 2.2,
      gateWidth: 6,
      gateGap: 3,
      dayLineHalf: 11.5,
      postWidth: 8,
      lapMatch: 0.15,
      maxLaps: 5,
      retryMinSeconds: 60,
    });
  });

  it('has a lakon for chapters 0–8 only', () => {
    expect(() => missionFor(9, [])).toThrow(RangeError);
    expect(() => missionFor(-1, [])).toThrow(RangeError);
    expect(() => missionFor(1.5, [])).toThrow(RangeError);
    expect(DEFS.map((d) => d.chapter)).toEqual(CHAPTERS);
  });

  it.each(GATHER)('chapter %i: its marker, its records in order, then the tower (r 9, stop 1.2 s)', (i, marker, records) => {
    expectGather(DEFS[i], marker, records);
  });

  it('every lakon ends at the tower', () => {
    for (const def of DEFS) expect(def.steps[def.steps.length - 1]).toEqual(TOWER_REACH);
  });

  it('the prologue starts at the spawn; parva 1, 3, 6 and 8 at their markers, facing their first record', () => {
    expect(DEFS[0].start).toEqual({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw });
    for (const i of [1, 3, 6, 8]) expectFacingFirstRecord(DEFS[i]);
  });

  it('parva 2, 4 and 5 start at their markers facing their first objective away from it: the gate, day 1 (π/2), P1', () => {
    for (const [i, aim] of [[2, ANCHORS.gate], [4, xz(-70, 25)], [5, P5_POSTS[0]]] as const) {
      const { start, marker } = DEFS[i];
      expect([start.x, start.z]).toEqual([marker!.x, marker!.z]);
      expect(start.yaw).toBeCloseTo(yawOf({ x: aim.x - marker!.x, z: aim.z - marker!.z }), 12);
    }
    expect(DEFS[4].start.yaw).toBeCloseTo(Math.PI / 2, 12);
  });

  it('parva 7 starts at the gate facing due west, straight out of the opening, 2 m clear', () => {
    const { start } = DEFS[7];
    expect(start).toEqual({ x: 115, z: -20, yaw: Math.PI });
    expect(hullClearance(start.x, start.z, start.yaw, COLS)).toBeGreaterThanOrEqual(2);
    expect(straightRun(DEFS[7])).toBeGreaterThanOrEqual(1.5);
  });

  it.each(CHAPTERS)('chapter %i: no start faces an obstacle; the hull keeps 1 m clear over a straight 6 m run', (i) => {
    expect(straightRun(DEFS[i])).toBeGreaterThanOrEqual(1);
  });

  it('places the scripted copies, the haze and the teaching volley', () => {
    const scripted = DEFS.map((d) => d.scripted);
    const volleyLine = { a: xz(-4, 11), b: xz(4, 11), at: xz(-11, 58) };
    expect(scripted[0]).toEqual({ decoys: [xz(-66, 12)], clouds: [], volleyLine });
    expect(scripted[1]).toEqual({
      decoys: [xz(62, 22), xz(50, -6), xz(66, -26), xz(68, -40)],
      clouds: [xz(57, 8), xz(60, -30)],
      volleyLine: null,
    });
    expect(scripted[7]).toEqual({
      decoys: [],
      clouds: [xz(103, -3), xz(78, 30), xz(48, 56), xz(16, 69), xz(-20, 66), xz(60, 52)],
      volleyLine: null,
    });
    for (const i of [2, 3, 4, 5, 6, 8]) expect(scripted[i]).toEqual({ decoys: [], clouds: [], volleyLine: null });
  });

  it('is deterministic and hands out fresh data', () => {
    const towerAt = (d: MissionDef): XZ => {
      const last = d.steps[d.steps.length - 1];
      if (last.kind !== 'reach') throw new Error('no tower step');
      return last.at;
    };
    const a = missionFor(1, slugsOf(1));
    const b = missionFor(1, slugsOf(1));
    expect(a).toEqual(b);
    expect(a.steps[0]).not.toBe(b.steps[0]);
    expect(a.marker).not.toBe(b.marker);
    expect(pickups(a)[0].at).not.toBe(pickups(b)[0].at);
    expect(towerAt(a)).not.toBe(towerAt(b));
    expect(a.scripted.decoys[0]).not.toBe(b.scripted.decoys[0]);
    expect(a.scripted.clouds[0]).not.toBe(b.scripted.clouds[0]);
    const p = missionFor(0, []);
    const q = missionFor(0, []);
    for (const k of ['a', 'b', 'at'] as const) expect(p.scripted.volleyLine![k]).not.toBe(q.scripted.volleyLine![k]);
    // Scribbling over one result leaves the next call untouched.
    for (const pt of [a.marker!, pickups(a)[0].at, towerAt(a), a.scripted.decoys[0], a.scripted.clouds[0]]) pt.x = 999;
    const vl = p.scripted.volleyLine!;
    for (const pt of [vl.a, vl.b, vl.at, pickups(p)[0].at]) pt.x = 999;
    expect(missionFor(1, slugsOf(1))).toEqual(b);
    expect(missionFor(0, [])).toEqual(q);
  });
});

describe('real records are exactly the parva events', () => {
  it.each(PARVA_CHAPTERS)('parva %i: one lontar or real gate per event slug, carded in the event order', (i) => {
    const slugs = slugsOf(i);
    const def = DEFS[i];
    expect(
      realTargets(def)
        .map((t) => t.slug)
        .sort(),
    ).toEqual([...slugs].sort());
    const gates = def.steps.flatMap((s) => (s.kind === 'course' ? s.days.flatMap((d) => d.gates) : []));
    const real = gates.filter((g) => g.real);
    expect(realTargets(def)).toEqual(expect.arrayContaining([...pickups(def), ...real].map(({ id, slug }) => ({ id, slug }))));
    expect(new Set(realTargets(def).map((t) => t.id)).size).toBe(slugs.length);
    for (const p of pickups(def)) {
      expect(p.visual).toBe('lontar');
      expect(p.card).toBe(slugs.indexOf(p.slug!));
    }
    for (const g of real) expect(g.card).toBe(slugs.indexOf(g.slug!));
    // A rewrite gate carries no slug and no card.
    for (const g of gates.filter((x) => !x.real)) expect([g.slug, g.card]).toEqual([null, -1]);
  });

  it('counts 2, 2, 4, 9, 1, 2, 2 and 2, and refuses a list of the wrong length', () => {
    expect(PARVA_CHAPTERS.map((i) => realTargets(DEFS[i]).length)).toEqual([2, 2, 4, 9, 1, 2, 2, 2]);
    expect(() => missionFor(1, ['a'])).toThrow();
    expect(() => missionFor(4, slugsOf(4).slice(1))).toThrow();
    expect(() => missionFor(5, [...slugsOf(5), 'b'])).toThrow();
  });

  it('the prologue: 8 slugless arrows, cards 0–7, whatever list it is given', () => {
    const items = pickups(DEFS[0]);
    expect(items).toHaveLength(8);
    items.forEach((p, k) => expect(p).toMatchObject({ visual: 'arrow', slug: null, card: k }));
    expect(new Set(items.map((p) => p.id)).size).toBe(8);
    expect(realTargets(DEFS[0]).map((t) => t.slug)).toEqual(Array(8).fill(null));
    expect(missionFor(0, ['a', 'b', 'c'])).toEqual(DEFS[0]);
  });
});

describe('all chapters', () => {
  it('no def has standIn; each chapter is its own type', () => {
    for (const i of CHAPTERS) {
      expect(Object.keys(DEFS[i])).not.toContain('standIn');
      expect(DEFS[i].type).toBe(CHAPTER_TYPES[i]);
    }
  });

  it('softTime, the legs of chapter 2 and decoyLimit, chapter by chapter', () => {
    expect(DEFS.map((d) => d.softTime)).toEqual([null, 120, null, 150, 210, null, 120, 120, null]);
    expect(DEFS[2].legTimes).toEqual([
      { fromStep: 0, seconds: 75 },
      { fromStep: 2, seconds: 90 },
    ]);
    for (const i of CHAPTERS) if (i !== 2) expect(DEFS[i].legTimes).toBeNull();
    expect(DEFS.map((d) => d.decoyLimit)).toEqual([null, 3, 3, 3, 3, null, 3, 3, null]);
    for (const d of DEFS) expect(d.riuh).toEqual({ start: 0, frozen: false, volleys: true });
  });

  it('parva 2, 4, 5 and 7 hand out fresh data too', () => {
    for (const i of [2, 4, 5, 7]) {
      const a = missionFor(i, slugsOf(i));
      const b = missionFor(i, slugsOf(i));
      expect(a).toEqual(b);
      a.steps.forEach((s, k) => expect(s).not.toBe(b.steps[k]));
      // Scribbling over one result leaves the next call untouched.
      for (const s of a.steps) {
        if (s.kind === 'course') {
          for (const d of s.days) {
            d.at.x = 999;
            d.gates[0].real = !d.gates[0].real;
          }
        }
        if (s.kind === 'laps') {
          s.posts[0].at.x = 999;
          s.then.at.x = 999;
        }
        if (s.kind === 'reach') s.at.x = 999;
        if (s.kind === 'collect') s.items[0].at.x = 999;
      }
      expect(missionFor(i, slugsOf(i))).toEqual(b);
    }
  });
});

describe('parva 2, Antar: the letter to the gate, then the record to the tower', () => {
  const def = DEFS[2];
  const slugs = slugsOf(2);

  it('the letter at the camp marker, the Hastinapura gate (r 5, 1.5 s), the record at the north end, the tower', () => {
    expect(def.marker).toEqual(xz(-100, -10));
    expect(def.steps).toHaveLength(4);
    expect(def.steps[0]).toEqual({
      kind: 'collect',
      items: [{ id: 'A', at: xz(-100, -10), slug: slugs[0], visual: 'lontar', card: 0 }],
    });
    expect(def.steps[1]).toEqual({ kind: 'reach', at: xz(115, -20), r: 5, stopFor: 1.5, place: 'gate' });
    expect(def.steps[1]).toMatchObject({ at: ANCHORS.gate, r: GATE_CIRCLE, stopFor: MISSION_TIMING.gateStopFor });
    expect(def.steps[2]).toEqual({
      kind: 'collect',
      items: [{ id: 'B', at: xz(0, -80), slug: slugs[1], visual: 'lontar', card: 1 }],
    });
    expect(def.steps[3]).toEqual(TOWER_REACH);
  });

  it('the gate stands in the opening of the gate landmark: its circle keeps 5 m from both pylons', () => {
    const pylons = COLS.filter((c) => c.id.startsWith('gate-pylon'));
    expect(pylons).toHaveLength(2);
    expect(clearance(ANCHORS.gate, pylons)).toBeCloseTo(5, 9);
    expect(clearance(ANCHORS.gate, COLS)).toBeCloseTo(5, 9);
  });
});

describe('parva 4, Lintasan: 18 days', () => {
  const def = DEFS[4];
  const days = () => daysOf(def);

  it('18 days at the brief’s centres and headings; the days with a real gate are REAL_DAYS_P4', () => {
    expect(days()).toHaveLength(18);
    days().forEach((d, k) => {
      expect(d.at).toEqual(P4_DAYS[k][0]);
      expect(d.heading).toBeCloseTo(P4_DAYS[k][1], 12);
    });
    const real = days().flatMap((d, k) => (d.gates.some((g) => g.real) ? [k + 1] : []));
    expect(real).toEqual([...REAL_DAYS_P4]);
    expect(days()[0].gates.filter((g) => g.real)).toHaveLength(1);
    expect(days()[1].gates.some((g) => g.real)).toBe(false);
  });

  it('two gates a day, 6 m wide at ±4.5 m with a 3 m gap; a real day holds one real gate, the rest two rewrites', () => {
    for (const d of days()) {
      expect(d.gates.map((g) => g.offset)).toEqual([-4.5, 4.5]);
      for (const g of d.gates) expect(g.width).toBe(MISSION_TIMING.gateWidth);
      const [l, r] = d.gates;
      expect(r.offset - r.width / 2 - (l.offset + l.width / 2)).toBeCloseTo(MISSION_TIMING.gateGap, 12);
      expect(d.gates.filter((g) => g.real).length).toBeLessThanOrEqual(1);
    }
  });

  it('the real gates carry the 9 slugs in timeline order; the side of each comes from nextRand, seed 404', () => {
    const slugs = slugsOf(4);
    let a = 404;
    REAL_DAYS_P4.forEach((day, k) => {
      const r = nextRand(a);
      a = r.a;
      const gate = days()[day - 1].gates.find((g) => g.real)!;
      expect(gate.offset).toBe(r.v < 0.5 ? -4.5 : 4.5);
      expect([gate.slug, gate.card, gate.mimic]).toEqual([slugs[k], k, false]);
    });
  });

  it('no rewrite gate mimics gold before day 4; from day 4 on every one does', () => {
    days().forEach((d, k) => {
      for (const g of d.gates) if (!g.real) expect(g.mimic, `day ${k + 1}`).toBe(k + 1 >= 4);
    });
  });

  it('day centres along the course stand at least 22 m apart; every gate end is 20 m inside the field and 2 m clear', () => {
    const ds = days();
    for (let k = 1; k < ds.length; k++) expect(dist(ds[k - 1].at, ds[k].at)).toBeGreaterThanOrEqual(22);
    for (const p of ds.flatMap(gateEnds)) {
      expect(inPlay(p, 20)).toBe(true);
      expect(clearance(p, COLS)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('parva 7, Lintasan: the storm', () => {
  const def = DEFS[7];
  const slugs = slugsOf(7);

  it('4 days and 8 gates, 2 of them real: balasan-berulang-di-threads on day 2, meluncurkan-kawal-abil-sudarman on day 4', () => {
    const days = daysOf(def);
    expect(days).toHaveLength(4);
    expect(days.flatMap((d) => d.gates)).toHaveLength(8);
    expect(days.map((d) => d.gates.filter((g) => g.real).map((g) => g.slug))).toEqual([
      [],
      ['balasan-berulang-di-threads'],
      [],
      ['meluncurkan-kawal-abil-sudarman'],
    ]);
    expect(slugs).toEqual(['balasan-berulang-di-threads', 'meluncurkan-kawal-abil-sudarman']);
    for (const d of days) {
      expect(d.gates.map((g) => g.offset).sort((p, q) => p - q)).toEqual([-4.5, 4.5]);
      for (const g of d.gates) expect(g.width).toBe(MISSION_TIMING.gateWidth);
    }
  });

  it('days 2 and 4 at the stand-in’s records; day 1 on the storm’s line from the marker, day 3 between days 2 and 4', () => {
    const days = daysOf(def).map((d) => d.at);
    expect(days).toEqual(P7_DAYS);
    expect([days[1], days[3]]).toEqual([xz(64, 46), xz(0, 72)]);
    const storm = [def.marker!, xz(103, -3), xz(78, 30), days[1]];
    expect(polylineDist(days[0], storm)).toBeLessThanOrEqual(2);
    for (const k of ['x', 'z'] as const) {
      expect(days[2][k]).toBeGreaterThanOrEqual(Math.min(days[1][k], days[3][k]));
      expect(days[2][k]).toBeLessThanOrEqual(Math.max(days[1][k], days[3][k]));
    }
    const line = [def.marker!, ...days];
    for (let k = 1; k < line.length; k++) expect(dist(line[k - 1], line[k])).toBeGreaterThanOrEqual(22);
  });

  it('each day faces from the point before it to the point after it: the marker first, the tower last', () => {
    const days = daysOf(def);
    const line = [def.marker!, ...days.map((d) => d.at), ANCHORS.tower];
    days.forEach((d, k) => {
      const prev = line[k];
      const next = line[k + 2];
      expect(d.heading).toBeCloseTo(yawOf({ x: next.x - prev.x, z: next.z - prev.z }), 12);
    });
  });

  it('every gate end is 20 m inside the field and 2 m clear; 6 haze points; the clamour starts at 0', () => {
    for (const p of daysOf(def).flatMap(gateEnds)) {
      expect(inPlay(p, 20)).toBe(true);
      expect(clearance(p, COLS)).toBeGreaterThanOrEqual(2);
    }
    expect(def.scripted.clouds).toHaveLength(6);
    expect(def.riuh.start).toBe(0);
  });
});

describe('parva 5, Uji ulang: two laps that match', () => {
  const def = DEFS[5];

  it('5 posts round a loop of 208 ± 10 m, each facing from the post before it to the post after it', () => {
    const { posts } = lapsOf(def);
    expect(posts.map((p) => p.at)).toEqual(P5_POSTS);
    let loop = 0;
    posts.forEach((p, k) => {
      const prev = posts[(k + posts.length - 1) % posts.length].at;
      const next = posts[(k + 1) % posts.length].at;
      expect(p.heading).toBeCloseTo(yawOf({ x: next.x - prev.x, z: next.z - prev.z }), 12);
      loop += dist(p.at, next);
    });
    expect(Math.abs(loop - 208)).toBeLessThanOrEqual(10);
  });

  it('post ends, 8 m apart, keep 2 m clear and stand 20 m inside the field', () => {
    for (const p of lapsOf(def).posts) {
      for (const e of ends(p.at, p.heading, 0, MISSION_TIMING.postWidth)) {
        expect(clearance(e, COLS)).toBeGreaterThanOrEqual(2);
        expect(inPlay(e, 20)).toBe(true);
      }
    }
  });

  it('the record after the laps is benchmark-lima-situs, between P1 and the tower; no timer, no limit, the clamour free', () => {
    expect(lapsOf(def).then).toEqual({ id: 'A', at: xz(-75, 30), slug: 'benchmark-lima-situs', visual: 'lontar', card: 0 });
    expect(def.steps).toHaveLength(2);
    expect(def.steps[1]).toEqual(TOWER_REACH);
    expect(def.riuh.frozen).toBe(false);
    expect([def.softTime, def.decoyLimit]).toEqual([null, null]);
  });
});

describe('rewrites carry nothing', () => {
  it.each(CHAPTERS)('chapter %i: scripted copies and haze are plain points, with no path and no date', (i) => {
    const { decoys, clouds } = DEFS[i].scripted;
    for (const p of [...decoys, ...clouds]) {
      expect(Object.keys(p).sort()).toEqual(['x', 'z']);
      expect([typeof p.x, typeof p.z]).toEqual(['number', 'number']);
    }
    const json = JSON.stringify(DEFS[i].scripted);
    expect(json).not.toMatch(/\//);
    expect(json).not.toMatch(/\d{4}-\d{2}/);
  });
});

describe('open ground', () => {
  it.each(CHAPTERS)('chapter %i: every objective point is 20 m inside the field, 4 m clear and 14 m from the pavilion', (i) => {
    const def = DEFS[i];
    const points = objectivePoints(def);
    for (const p of [...(def.marker ? [def.marker] : []), ...pickups(def).map((q) => q.at)]) expect(points).toContainEqual(p);
    for (const p of points) {
      expect(inPlay(p, 20)).toBe(true);
      expect(clearance(p, COLS)).toBeGreaterThanOrEqual(4);
      expect(dist(p, PAVILION)).toBeGreaterThanOrEqual(14);
    }
  });

  it('the markers of chapters 1–8 stand at least 10 m apart; the closest are parva 2 and 5, 16 m apart', () => {
    let least = Infinity;
    let pair: number[] = [];
    for (const a of PARVA_CHAPTERS) {
      for (const b of PARVA_CHAPTERS) {
        if (b <= a) continue;
        const d = dist(DEFS[a].marker!, DEFS[b].marker!);
        if (d < least) [least, pair] = [d, [a, b]];
      }
    }
    expect(least).toBeGreaterThanOrEqual(10);
    expect(least).toBeCloseTo(16, 9);
    expect(pair).toEqual([2, 5]);
  });

  it.each(CHAPTERS)('chapter %i: scripted copies and haze stand 15 m inside the field, 1 m clear', (i) => {
    for (const p of [...DEFS[i].scripted.decoys, ...DEFS[i].scripted.clouds]) {
      expect(inPlay(p, 15)).toBe(true);
      expect(clearance(p, COLS)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('reach circles', () => {
  it.each(CHAPTERS)('chapter %i: each reach circle has a spot within r − 1.5 of its centre with 1.95 m clear', (i) => {
    const circles = reachCircles(DEFS[i]);
    expect(circles[circles.length - 1]).toEqual({ at: { x: -46, z: 52 }, r: 9 });
    for (const c of circles) {
      const inner = c.r - 1.5;
      let best = -Infinity;
      for (let dx = -inner; dx <= inner; dx += 0.25) {
        for (let dz = -inner; dz <= inner; dz += 0.25) {
          if (Math.hypot(dx, dz) <= inner) best = Math.max(best, clearance({ x: c.at.x + dx, z: c.at.z + dz }, COLS));
        }
      }
      expect(best).toBeGreaterThanOrEqual(1.95);
    }
  });

  it('at the tower, every point 4.5–7.5 m from the centre is at least 1.95 m clear', () => {
    let least = Infinity;
    for (let d = 4.5; d <= 7.5 + 1e-9; d += 0.25) {
      for (let a = 0; a < 360; a += 2) {
        const t = (a * Math.PI) / 180;
        least = Math.min(least, clearance({ x: ANCHORS.tower.x + d * Math.cos(t), z: ANCHORS.tower.z + d * Math.sin(t) }, COLS));
      }
    }
    expect(Number.isFinite(least)).toBe(true);
    expect(least).toBeGreaterThanOrEqual(1.95);
  });
});

describe('every lakon can be ridden', () => {
  it.each(CHAPTERS)('chapter %i: routes run to the marker, through the objectives in order, to the tower, 2.45 m clear', (i) => {
    const { marker, records } = PINNED.get(i)!;
    const seq = [i === 0 ? SPAWN : TOWER_EXIT, ...(marker ? [marker] : []), ...records, TOWER].map(({ x, z }) => xz(x, z));
    const routed = legs(i);
    expect(routed.map(({ from }) => xz(from.x, from.z))).toEqual(seq.slice(0, -1));
    expect(routed.map(({ to }) => xz(to.x, to.z))).toEqual(seq.slice(1));
    for (const leg of routed) {
      expect(leg.path).not.toBeNull();
      const path = leg.path!;
      expect(path[0]).toEqual({ x: leg.from.x, z: leg.from.z });
      expect(path[path.length - 1]).toEqual({ x: leg.to.x, z: leg.to.z });
      let least = Infinity;
      for (let k = 1; k < path.length; k++) {
        const p = path[k - 1];
        const q = path[k];
        const steps = Math.ceil(dist(p, q));
        for (let s = 0; s <= steps; s++) {
          const t = steps ? s / steps : 0;
          const pt = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
          if (dist(pt, leg.from) <= 12 || dist(pt, leg.to) <= 12) continue;
          least = Math.min(least, clearance(pt, COLS));
        }
      }
      expect(least).toBeGreaterThanOrEqual(2.45 - 1e-9);
    }
  });

  const LENGTHS: [number, number, number][] = [
    [0, 220, 270],
    [1, 265, 335],
    [3, 360, 455],
    [4, 490, 560],
    [5, 450, 560],
    [6, 250, 315],
    [7, 220, 250],
    [8, 230, 290],
  ];
  it.each(LENGTHS)('chapter %i: the ride from the marker to the tower is %i–%i m', (i, lo, hi) => {
    const len = lakonLength(i);
    expect(len).toBeGreaterThanOrEqual(lo);
    expect(len).toBeLessThanOrEqual(hi);
  });

  it('parva 2: the letter’s leg, camp to gate, is 195–250 m; the record’s, gate to the north end to the tower, 235–300 m', () => {
    const [toLetter, toGate, toRecord, toTower] = lakonLegs(2).map((l) => pathLength(l.path ?? []));
    expect(toLetter).toBeCloseTo(0, 9);
    expect(toLetter + toGate).toBeGreaterThanOrEqual(195);
    expect(toLetter + toGate).toBeLessThanOrEqual(250);
    expect(toRecord + toTower).toBeGreaterThanOrEqual(235);
    expect(toRecord + toTower).toBeLessThanOrEqual(300);
  });

  it('parva 5 counts the approach, two laps through the post centres back to P1, the record and the tower', () => {
    expect(lakonLegs(5)).toHaveLength(1 + 2 * 5 + 2);
    expect(lakonLegs(5).map((l) => l.to).slice(-2)).toEqual([xz(-75, 30), TOWER]);
  });

  it.each(CHAPTERS)('chapter %i: no lakon goes outside the spec’s 220–560 m', (i) => {
    expect(lakonLength(i)).toBeGreaterThanOrEqual(220);
    expect(lakonLength(i)).toBeLessThanOrEqual(560);
  });
});

describe('lures sit off the route', () => {
  it('each parva 1 copy is at least 6 m from the routed lakon', () => {
    const line = lakonLine(1);
    const gaps = DEFS[1].scripted.decoys.map((d) => polylineDist(d, line));
    expect(gaps).toHaveLength(4);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(6);
  });

  it('the prologue copy is the Mata lesson, within 2.5 m of the L7→L8 route', () => {
    const items = pickups(DEFS[0]);
    const leg = routeTo(nav, COLS, items[6].at, items[7].at)!;
    expect(DEFS[0].scripted.decoys).toHaveLength(1);
    expect(polylineDist(DEFS[0].scripted.decoys[0], leg)).toBeLessThanOrEqual(2.5);
  });

  it("the teaching volley's line spans the corridor between the ranks just ahead of the spawn, met on setting off", () => {
    const { a, b } = DEFS[0].scripted.volleyLine!;
    const line = lakonLine(0);
    // It crosses the routed prologue once, on the first leg, 0.4 m ahead of the hull's middle at rest on the spawn.
    let crossings = 0;
    for (let k = 1; k < line.length; k++) if (crossesSegment(a, b, line[k - 1], line[k])) crossings++;
    expect(crossings).toBe(1);
    expect(crossesSegment(a, b, lakonLegs(0)[0].path![0], pickups(DEFS[0])[0].at)).toBe(true);
    const mid = { x: SPAWN.x + 1.6 * forward(SPAWN.yaw).x, z: SPAWN.z + 1.6 * forward(SPAWN.yaw).z };
    expect(segPointDist(mid, a, b)).toBeCloseTo(0.4, 9);
    // Each end lies inside one of the two army zones, which the guard keeps every chariot out of: a chariot setting off
    // forward from the spawn meets the line. (The corridor is open at its north mouth: one that first reverses up it
    // can go round.)
    const armies = COLS.filter((c) => c.figure);
    for (const end of [a, b]) expect(Math.min(...armies.map((c) => distToCollider(end, c)))).toBeLessThan(0);
  });

  it('the teaching volley lands 5–8 m beside the prologue route, well clear of the Mata lesson', () => {
    const { at } = DEFS[0].scripted.volleyLine!;
    const off = polylineDist(at, lakonLine(0));
    expect(off).toBeGreaterThanOrEqual(5);
    expect(off).toBeLessThanOrEqual(8);
    expect(dist(at, DEFS[0].scripted.decoys[0])).toBeGreaterThan(20);
    // Past L2, on the outside of the gentle right-hand curve from the spawn through L1 and L2 to L3.
    expect(dist(at, pickups(DEFS[0])[1].at)).toBeLessThan(8);
  });
});

describe('timers and pressure', () => {
  it('chapters 0, 1, 3, 6 and 8', () => {
    const five = [0, 1, 3, 6, 8].map((i) => DEFS[i]);
    expect(five.map((d) => d.softTime)).toEqual([null, 120, 150, 120, null]);
    expect(five.map((d) => d.decoyLimit)).toEqual([null, 3, 3, 3, null]);
    for (const d of five) expect(d.riuh).toEqual({ start: 0, frozen: false, volleys: true });
    expect(DEFS[8].dawn).toBe(true);
    expect(DEFS[0].scripted.volleyLine).toEqual({ a: { x: -4, z: 11 }, b: { x: 4, z: 11 }, at: { x: -11, z: 58 } });
  });

  it('no leg timers in these five; dawn only in parva 8; hints only in the prologue', () => {
    expect([0, 1, 3, 6, 8].map((i) => DEFS[i].legTimes)).toEqual([null, null, null, null, null]);
    expect(DEFS.map((d) => d.dawn)).toEqual(CHAPTERS.map((i) => i === 8));
    expect(DEFS.map((d) => d.hints)).toEqual(CHAPTERS.map((i) => i === 0));
  });
});

describe('the helpers read every step kind', () => {
  const gate = (id: string, offset: number, real: boolean): GateDef => ({
    id,
    offset,
    width: 6,
    real,
    slug: real ? 's' : null,
    mimic: false,
    card: 0,
  });
  const then: PickupDef = { id: 'T', at: xz(20, 0), slug: 't', visual: 'lontar', card: 1 };
  const def: MissionDef = {
    ...DEFS[1],
    steps: [
      { kind: 'course', days: [{ at: xz(0, 0), heading: 0, gates: [gate('g1', -4.5, true), gate('g2', 4.5, false)] }] },
      { kind: 'laps', posts: [{ at: xz(10, 0), heading: Math.PI / 2 }], then },
      { kind: 'reach', at: xz(30, 0), r: 5, stopFor: 1.5, place: 'gate' },
    ],
  };

  it('objectivePoints: the marker, both ends of each gate and post, and the record after the laps; never a reach centre', () => {
    const expected = [xz(20, 62), xz(0, -7.5), xz(0, -1.5), xz(0, 1.5), xz(0, 7.5), xz(6, 0), xz(14, 0), xz(20, 0)];
    const points = objectivePoints(def);
    expect(points).toHaveLength(expected.length);
    points.forEach((p, k) => {
      expect(p.x).toBeCloseTo(expected[k].x, 9);
      expect(p.z).toBeCloseTo(expected[k].z, 9);
    });
  });

  it('realTargets: the real gates and the record after the laps; reachCircles: each reach step', () => {
    expect(realTargets(def)).toEqual([
      { id: 'g1', slug: 's' },
      { id: 'T', slug: 't' },
    ]);
    expect(reachCircles(def)).toEqual([{ at: xz(30, 0), r: 5 }]);
  });
});
