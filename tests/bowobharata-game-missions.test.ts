import { describe, expect, it } from 'vitest';
import { PARVAS, parvaEvents } from '../src/lib/bowobharata';
import { PAVILION } from '../src/lib/bowobharata/stage-math';
import { dist, forward, polylineDist, type XZ } from '../src/lib/bowobharata-game/geom';
import { ANCHORS, SPAWN, TOWER_EXIT, clearance, inPlay, staticColliders } from '../src/lib/bowobharata-game/world';
import { buildNav, pathLength, routeTo } from '../src/lib/bowobharata-game/route';
import {
  CHAPTER_TYPES,
  REAL_DAYS_P4,
  missionFor,
  objectivePoints,
  reachCircles,
  realTargets,
  type GateDef,
  type MissionDef,
  type PickupDef,
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
  return def.steps.flatMap((s) => (s.kind === 'collect' ? s.items : []));
}

/** The objectives in order: each record of a collect step, then each reach centre. */
function stops(def: MissionDef): XZ[] {
  return def.steps.flatMap((s) => {
    if (s.kind === 'collect') return s.items.map((p) => p.at);
    if (s.kind === 'reach') return [s.at];
    throw new Error(`no ${s.kind} step before Task 31`);
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

const LEGS = DEFS.map(legsOf);
/** The lakon itself: the legs from the marker on (from the spawn in the prologue). */
const lakonLegs = (i: number): Leg[] => LEGS[i].slice(DEFS[i].marker ? 1 : 0);
const lakonLength = (i: number): number => lakonLegs(i).reduce((s, l) => s + pathLength(l.path ?? []), 0);
const lakonLine = (i: number): XZ[] => lakonLegs(i).flatMap((l) => l.path ?? []);

const TOWER_REACH = { kind: 'reach', at: { x: -46, z: 52 }, r: 9, stopFor: 1.2, place: 'tower' };

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

  const TABLE: [number, XZ | null, XZ[]][] = [
    [0, null, [xz(-2, 32), xz(-14, 52), xz(-34, 70), xz(-62, 74), xz(-82, 52), xz(-86, 22), xz(-70, 4), xz(-54, 24)]],
    [1, xz(20, 62), [xz(52, 44), xz(62, -50)]],
    [3, xz(-66, -90), [xz(-38, -96), xz(46, -92), xz(82, 8), xz(-8, 86)]],
    [6, xz(60, -62), [xz(100, -62), xz(80, 40)]],
    [8, xz(-34, 64), [xz(-10, 118), xz(58, 98)]],
  ];

  it.each(TABLE)('chapter %i: its marker, its records in order, then the tower (r 9, stop 1.2 s)', (i, marker, records) => {
    expectGather(DEFS[i], marker, records);
  });

  it('every lakon ends at the tower', () => {
    for (const def of DEFS) expect(def.steps[def.steps.length - 1]).toEqual(TOWER_REACH);
  });

  it('the prologue starts at the spawn; parva 1, 3, 6 and 8 at their markers, facing their first record', () => {
    expect(DEFS[0].start).toEqual({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw });
    for (const i of [1, 3, 6, 8]) expectFacingFirstRecord(DEFS[i]);
  });

  it('places the scripted copies, the haze and the teaching volley', () => {
    const scripted = DEFS.map((d) => d.scripted);
    expect(scripted[0]).toEqual({ decoys: [xz(-66, 12)], clouds: [], volleyNear: { near: xz(-82, 52), r: 10, at: xz(-77, 36) } });
    expect(scripted[1]).toEqual({
      decoys: [xz(62, 22), xz(50, -6), xz(66, -26), xz(68, -40)],
      clouds: [xz(57, 8), xz(60, -30)],
      volleyNear: null,
    });
    expect(scripted[7]).toEqual({
      decoys: [],
      clouds: [xz(103, -3), xz(78, 30), xz(48, 56), xz(16, 69), xz(-20, 66), xz(60, 52)],
      volleyNear: null,
    });
    for (const i of [2, 3, 4, 5, 6, 8]) expect(scripted[i]).toEqual({ decoys: [], clouds: [], volleyNear: null });
  });

  it('is deterministic and hands out fresh data', () => {
    const a = missionFor(1, slugsOf(1));
    const b = missionFor(1, slugsOf(1));
    expect(a).toEqual(b);
    expect(a.steps[0]).not.toBe(b.steps[0]);
    expect(a.scripted.decoys[0]).not.toBe(b.scripted.decoys[0]);
  });
});

describe('real records are exactly the parva events', () => {
  it.each(PARVA_CHAPTERS)('parva %i: one lontar per event slug, carded in the event order', (i) => {
    const slugs = slugsOf(i);
    const def = DEFS[i];
    expect(
      realTargets(def)
        .map((t) => t.slug)
        .sort(),
    ).toEqual([...slugs].sort());
    expect(realTargets(def)).toEqual(expect.arrayContaining(pickups(def).map(({ id, slug }) => ({ id, slug }))));
    expect(new Set(realTargets(def).map((t) => t.id)).size).toBe(slugs.length);
    for (const p of pickups(def)) {
      expect(p.visual).toBe('lontar');
      expect(p.card).toBe(slugs.indexOf(p.slug!));
    }
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

describe('types or stand-ins', () => {
  it('chapters 0, 1, 3, 6 and 8 are their own type', () => {
    for (const i of [0, 1, 3, 6, 8]) {
      expect(DEFS[i].type).toBe(CHAPTER_TYPES[i]);
      expect(DEFS[i].standIn).toBe(false);
    }
  });

  it('chapters 2, 4, 5 and 7 gather and deliver as stand-ins until Task 31', () => {
    for (const i of [2, 4, 5, 7]) {
      expect(DEFS[i].type).toBe('himpun');
      expect(DEFS[i].standIn).toBe(true);
    }
  });

  const STAND_INS: [number, XZ, XZ[]][] = [
    [2, xz(-100, -10), [xz(-100, -10), xz(0, -80)]],
    [
      4,
      xz(-70, 58),
      [xz(-70, 25), xz(-70, -25), xz(-70, -50), xz(-50, -95), xz(0, -95), xz(25, -95), xz(70, -50), xz(70, 0), xz(25, 40)],
    ],
    [5, xz(-84, -10), [xz(-75, 30)]],
    [7, xz(115, -20), [xz(64, 46), xz(0, 72)]],
  ];

  it.each(STAND_INS)('stand-in %i: its own marker, its records in order, then the tower', (i, marker, records) => {
    expectGather(DEFS[i], marker, records);
  });

  it('the stand-ins start at their markers facing the next record: parva 2 past the one at its marker, parva 4 at π/2', () => {
    for (const i of [2, 4, 5, 7]) expectFacingFirstRecord(DEFS[i]);
    expect(DEFS[4].start.yaw).toBeCloseTo(Math.PI / 2, 12);
  });

  it('the stand-ins keep their row: parva 2 rides on 165 s with no leg timers', () => {
    const four = [2, 4, 5, 7].map((i) => DEFS[i]);
    expect(four.map((d) => d.softTime)).toEqual([165, 210, null, 120]);
    expect(four.map((d) => d.legTimes)).toEqual([null, null, null, null]);
    expect(four.map((d) => d.decoyLimit)).toEqual([3, 3, null, 3]);
    for (const d of four) expect(d.riuh).toEqual({ start: 0, frozen: false, volleys: true });
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
    expect(least).toBeGreaterThanOrEqual(1.95);
    // The nearest thing is the tower itself, 2 m from the inner edge.
    expect(least).toBeCloseTo(2, 9);
  });
});

describe('every lakon can be ridden', () => {
  it.each(CHAPTERS)('chapter %i: routes run to the marker, through the objectives in order, to the tower, 2.45 m clear', (i) => {
    const legs = LEGS[i];
    expect(legs).toHaveLength(stops(DEFS[i]).length + (DEFS[i].marker ? 1 : 0));
    for (const leg of legs) {
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
    [6, 250, 315],
    [8, 230, 290],
  ];
  it.each(LENGTHS)('chapter %i: the ride from the marker to the tower is %i–%i m', (i, lo, hi) => {
    const len = lakonLength(i);
    expect(len).toBeGreaterThanOrEqual(lo);
    expect(len).toBeLessThanOrEqual(hi);
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

  it('the teaching volley lands at least 6 m from the prologue route, and is planned near L5', () => {
    const volley = DEFS[0].scripted.volleyNear!;
    expect(volley.near).toEqual(pickups(DEFS[0])[4].at);
    expect(polylineDist(volley.at, lakonLine(0))).toBeGreaterThanOrEqual(6);
  });
});

describe('timers and pressure', () => {
  it('chapters 0, 1, 3, 6 and 8', () => {
    const five = [0, 1, 3, 6, 8].map((i) => DEFS[i]);
    expect(five.map((d) => d.softTime)).toEqual([null, 120, 150, 120, null]);
    expect(five.map((d) => d.decoyLimit)).toEqual([null, 3, 3, 3, null]);
    for (const d of five) expect(d.riuh).toEqual({ start: 0, frozen: false, volleys: true });
    expect(DEFS[8].dawn).toBe(true);
    expect(DEFS[0].scripted.volleyNear).toEqual({ near: { x: -82, z: 52 }, r: 10, at: { x: -77, z: 36 } });
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
