import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/sky/rng';
import { arrowArc, groundHeight } from '../src/lib/bowobharata/stage-math';
import { dist, forward, polylineDist, rightOf, type XZ } from '../src/lib/bowobharata-game/geom';
import { initChariot, type ChariotState } from '../src/lib/bowobharata-game/drive';
import {
  ANCHORS,
  POSTS,
  RECORD_CIRCLE,
  SPAWN,
  ZONES,
  clearance,
  distToCollider,
  inArea,
  inPlay,
  staticColliders,
  type Collider,
} from '../src/lib/bowobharata-game/world';
import { hullClearance } from '../src/lib/bowobharata-game/collide';
import { buildNav, routeTo } from '../src/lib/bowobharata-game/route';
import { missionFor } from '../src/lib/bowobharata-game/missions';
import { VOLLEY } from '../src/lib/bowobharata-game/tuning';
import {
  arrowOffsets,
  arrowPoint,
  inCloud,
  landingOk,
  planVolley,
  scriptedVolley,
  stepVolleys,
  telegraphAt,
  volleySources,
  type Cloud,
  type Volley,
  type VolleyWorld,
} from '../src/lib/bowobharata-game/volley';

type Box = Extract<Collider, { kind: 'box' }>;

const COLS = staticColliders();
const ARMIES = COLS.filter((c) => c.figure);
const TALL = COLS.filter((c) => c.tall);
const SHELTERS = ZONES.filter((z) => z.role === 'shelter');
const W: VolleyWorld = { colliders: COLS, zones: ZONES, mobile: false };
const PHONE: VolleyWorld = { ...W, mobile: true };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const EPS = 1e-9;
const xz = (x: number, z: number): XZ => ({ x, z });
const OPTS = { decoy: true, cloud: false, id: 1, route: null };

/** A chariot at (x, z) facing yaw, moving `speed` m/s along its heading. */
function carAt(x: number, z: number, yaw: number, speed = 0): ChariotState {
  const f = forward(yaw);
  return { ...initChariot(x, z, yaw), vx: f.x * speed, vz: f.z * speed };
}

const least = (cols: readonly Collider[], p: XZ): number => Math.min(...cols.map((c) => distToCollider(p, c)));
const nearestSource = (p: XZ): XZ => volleySources().reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a));

/** Each arrow's flight at s = 0, 0.02, … 1. */
function flights(v: Volley): { x: number; y: number; z: number }[][] {
  return Array.from({ length: v.arrows }, (_, k) => Array.from({ length: 51 }, (_, j) => arrowPoint(v, k, j / 50, groundHeight)));
}

/** n car poses from mulberry32(99), kept when 15 m inside the play disc with hull clearance ≥ 0.5: speed 0–17 along the heading. */
function poses(n: number): ChariotState[] {
  const rnd = mulberry32(99);
  const out: ChariotState[] = [];
  while (out.length < n) {
    const x = -150 + 300 * rnd();
    const z = -160 + 300 * rnd();
    const yaw = 2 * Math.PI * rnd();
    const speed = 17 * rnd();
    if (inPlay({ x, z }, 15) && hullClearance(x, z, yaw, COLS) >= 0.5) out.push(carAt(x, z, yaw, speed));
  }
  return out;
}

interface Survey {
  volleys: { car: ChariotState; v: Volley }[];
  /** The least distance from an arrow's landing to an army zone. */
  landArmy: number;
  /** The least distance from an arrow below 6 m above the ground to an army zone, and to a tall collider. */
  lowArmy: number;
  lowTall: number;
  /** The least distance from a landing centre to car + velocity·2.6 + forward·1.6. */
  hullGap: number;
}

let survey: Survey | undefined;
/** 1000 seeded plans (rng 1000 + i), built on first use. */
function surveyed(): Survey {
  if (survey) return survey;
  const volleys = poses(1000).flatMap((car, i) => {
    const { volley } = planVolley(car, 100, 1000 + i, W, { ...OPTS, id: i });
    return volley ? [{ car, v: volley }] : [];
  });
  let landArmy = Infinity;
  let lowArmy = Infinity;
  let lowTall = Infinity;
  let hullGap = Infinity;
  for (const { car, v } of volleys) {
    const f = forward(car.yaw);
    hullGap = Math.min(hullGap, dist(v.to, { x: car.x + car.vx * 2.6 + f.x * 1.6, z: car.z + car.vz * 2.6 + f.z * 1.6 }));
    for (const path of flights(v)) {
      landArmy = Math.min(landArmy, least(ARMIES, path[path.length - 1]));
      for (const p of path) {
        if (p.y - groundHeight(p.x, p.z) >= VOLLEY.lowHeight) continue;
        lowArmy = Math.min(lowArmy, least(ARMIES, p));
        lowTall = Math.min(lowTall, least(TALL, p));
      }
    }
  }
  return (survey = { volleys, landArmy, lowArmy, lowTall, hullGap });
}

describe('never on anyone: 1000 seeded plans', () => {
  it('at least 70% of the plans give a volley', { timeout: 30_000 }, () => {
    expect(surveyed().volleys.length).toBeGreaterThanOrEqual(700);
  });

  it('every arrow lands at least 3 m from both army zones', { timeout: 30_000 }, () => {
    expect(surveyed().landArmy).toBeGreaterThanOrEqual(3);
  });

  it('wherever an arrow flies below 6 m it is at least 3 m from both army zones and 1.5 m from the tall colliders', { timeout: 30_000 }, () => {
    const s = surveyed();
    expect(s.lowArmy).toBeGreaterThanOrEqual(3);
    expect(s.lowTall).toBeGreaterThanOrEqual(1.5);
  });

  it('the landing centre is at least 9 m from car + velocity·2.6 + forward·1.6', { timeout: 30_000 }, () => {
    expect(surveyed().hullGap).toBeGreaterThanOrEqual(9);
  });

  it('every arrow lands outside the shelters and the record circle, and the centre lies 10 m inside the play disc', { timeout: 30_000 }, () => {
    for (const { v } of surveyed().volleys) {
      expect(inPlay(v.to, 10)).toBe(true);
      for (let k = 0; k < v.arrows; k++) {
        const p = arrowPoint(v, k, 1, groundHeight);
        for (const s of SHELTERS) expect(inArea(p, s.area)).toBe(false);
        expect(dist(p, ANCHORS.tower)).toBeGreaterThan(RECORD_CIRCLE);
      }
    }
  });

  it('the origin is 45 m from the landing across the ground and 22 m above the ground there', { timeout: 30_000 }, () => {
    for (const { v } of surveyed().volleys) {
      expect(Math.hypot(v.from.x - v.to.x, v.from.z - v.to.z)).toBeCloseTo(45, 9);
      expect(v.from.y - groundHeight(v.to.x, v.to.z)).toBeCloseTo(22, 9);
    }
  });
});

describe('aims ahead and beside the path', () => {
  // At (−120, −40) facing east at 10 m/s: every aim lies at x −94 + 11…18 and z −40 ± 5…8.
  const car = carAt(-120, -40, 0, 10);

  it('the window holding every aim is clear of colliders by at least 8 m', () => {
    let min = Infinity;
    for (let x = -85; x <= -74; x += 0.5) for (let z = -49; z <= -31; z += 0.5) min = Math.min(min, clearance(xz(x, z), COLS));
    expect(min).toBeGreaterThanOrEqual(8);
  });

  it('lands 37–44 m ahead and 5–8 m to one side, the side drawn from the rng', () => {
    const f = forward(car.yaw);
    const r = rightOf(car.yaw);
    const sides = new Set<number>();
    for (let seed = 0; seed < 50; seed++) {
      const { volley } = planVolley(car, 0, seed, W, OPTS);
      expect(volley).not.toBeNull();
      const d = { x: volley!.to.x - car.x, z: volley!.to.z - car.z };
      const ahead = d.x * f.x + d.z * f.z;
      const side = d.x * r.x + d.z * r.z;
      expect(ahead).toBeGreaterThanOrEqual(37 - EPS);
      expect(ahead).toBeLessThanOrEqual(44 + EPS);
      expect(Math.abs(side)).toBeGreaterThanOrEqual(5 - EPS);
      expect(Math.abs(side)).toBeLessThanOrEqual(8 + EPS);
      sides.add(Math.sign(side));
    }
    expect([...sides].sort()).toEqual([-1, 1]);
  });

  it('leads the chariot by its velocity over the 2.6 s to landing, whatever its heading', () => {
    // Sliding sideways (south) at 6 m/s while facing east: the aim moves 15.6 m south with it, into the same window.
    const sliding = { ...carAt(-94, -55.6, 0), vz: 6 };
    for (let seed = 0; seed < 20; seed++) {
      const v = planVolley(sliding, 0, seed, W, OPTS).volley!;
      const side = v.to.z - (sliding.z + 15.6);
      expect(v.to.x - sliding.x).toBeGreaterThanOrEqual(11 - EPS);
      expect(v.to.x - sliding.x).toBeLessThanOrEqual(18 + EPS);
      expect(Math.abs(side)).toBeGreaterThanOrEqual(5 - EPS);
      expect(Math.abs(side)).toBeLessThanOrEqual(8 + EPS);
    }
  });
});

describe('off the route', () => {
  const car = carAt(-120, -40, 0, 10);

  it('lands at least 5 m from a route running 80 m straight ahead, for 50 seeds', () => {
    const f = forward(car.yaw);
    const route = [xz(car.x, car.z), xz(car.x + 80 * f.x, car.z + 80 * f.z)];
    for (let seed = 0; seed < 50; seed++) {
      const { volley } = planVolley(car, 0, seed, W, { ...OPTS, route });
      expect(volley).not.toBeNull();
      expect(polylineDist(volley!.to, route)).toBeGreaterThanOrEqual(5);
    }
  });

  it('a route through the right-hand landing band sends every volley to the left', () => {
    // The right-hand aims lie at z −35 to −32 (rightOf(0) is +z); a route along z −33.5 is within 5 m of them all.
    const route = [xz(-120, -33.5), xz(-40, -33.5)];
    let planned = 0;
    for (let seed = 0; seed < 50; seed++) {
      const { volley } = planVolley(car, 0, seed, W, { ...OPTS, route });
      if (!volley) continue;
      planned++;
      expect(polylineDist(volley.to, route)).toBeGreaterThanOrEqual(5);
      expect(volley.to.z).toBeLessThan(car.z);
    }
    expect(planned).toBeGreaterThanOrEqual(45);
  });
});

describe('planVolley', () => {
  const car = carAt(-120, -40, 0, 10);

  it('is deterministic: the same inputs give the same volley and the same rng', () => {
    const a = planVolley(car, 3, 42, W, OPTS);
    expect(planVolley(car, 3, 42, W, OPTS)).toEqual(a);
    expect(a.volley).not.toBeNull();
    expect(a.rng).not.toBe(42);
    expect(planVolley(car, 3, a.rng, W, OPTS).volley!.to).not.toEqual(a.volley!.to);
  });

  it('gives null after six failed tries, and still advances the rng', () => {
    // At the north edge, racing north: every aim lies beyond the play disc.
    const out = carAt(0, -150, Math.PI / 2, 17);
    const r = planVolley(out, 0, 5, W, OPTS);
    expect(r.volley).toBeNull();
    expect(r.rng).not.toBe(5);
    expect(planVolley(out, 0, 5, W, OPTS)).toEqual(r);
  });

  it('plans a warned volley that lands 2.6 s later, flown from 45 m back toward the nearest source and 22 m up', () => {
    const v = planVolley(car, 50, 7, W, { decoy: false, cloud: true, id: 9, route: null }).volley!;
    expect(v).toMatchObject({ id: 9, planned: 50, t0: 51, flight: 1.6, arrows: 12, state: 'warn', decoy: false, cloud: true });
    const s = nearestSource(v.to);
    const d = dist(s, v.to);
    expect(v.u.x).toBeCloseTo((s.x - v.to.x) / d, 12);
    expect(v.u.z).toBeCloseTo((s.z - v.to.z) / d, 12);
    expect(v.from.x).toBeCloseTo(v.to.x + 45 * v.u.x, 9);
    expect(v.from.z).toBeCloseTo(v.to.z + 45 * v.u.z, 9);
    expect(v.from.y).toBeCloseTo(groundHeight(v.to.x, v.to.z) + 22, 9);
  });

  it('fires 6 arrows a volley on a phone', () => {
    expect(planVolley(car, 0, 7, PHONE, OPTS).volley!.arrows).toBe(6);
  });
});

describe('sources and the spread', () => {
  it('volleys come from the six posts, the gate and seven points along the Kurawa front', () => {
    const front = Array.from({ length: 7 }, (_, k) => xz(2.96, 15 - 10 * k));
    expect(volleySources()).toEqual([...POSTS, ANCHORS.gate, ...front]);
  });

  it('volleySources gives fresh points', () => {
    volleySources()[0].x = 999;
    expect(volleySources()[0]).toEqual(POSTS[0]);
    expect(POSTS[0].x).not.toBe(999);
  });

  it('arrowOffsets is a golden-angle spiral: radius 2.5·√((k + 0.5)/n) at the yaw k·golden angle', () => {
    for (const n of [12, 6]) {
      const offsets = arrowOffsets(n);
      expect(offsets).toHaveLength(n);
      offsets.forEach((o, k) => {
        const r = VOLLEY.spread * Math.sqrt((k + 0.5) / n);
        const f = forward(k * GOLDEN);
        expect(o.x).toBeCloseTo(r * f.x, 12);
        expect(o.z).toBeCloseTo(r * f.z, 12);
        expect(Math.hypot(o.x, o.z)).toBeLessThan(VOLLEY.spread);
      });
    }
    // Arrow 1 turns 137.5° from east toward north (−z).
    expect(arrowOffsets(12)[1].z).toBeLessThan(0);
  });

  it('arrowPoint flies arrow k from the origin plus its offset to the ground at the landing plus its offset', () => {
    const v = planVolley(carAt(-120, -40, 0, 10), 0, 11, W, OPTS).volley!;
    const offsets = arrowOffsets(v.arrows);
    for (const k of [0, 5, 11]) {
      const o = offsets[k];
      const start = arrowPoint(v, k, 0, groundHeight);
      const end = arrowPoint(v, k, 1, groundHeight);
      const mid = arrowPoint(v, k, 0.5, groundHeight);
      expect(start.x).toBeCloseTo(v.from.x + o.x, 12);
      expect(start.y).toBeCloseTo(v.from.y, 12);
      expect(start.z).toBeCloseTo(v.from.z + o.z, 12);
      expect(end.x).toBeCloseTo(v.to.x + o.x, 12);
      expect(end.y).toBeCloseTo(groundHeight(v.to.x + o.x, v.to.z + o.z), 12);
      expect(end.z).toBeCloseTo(v.to.z + o.z, 12);
      expect(mid.y).toBeCloseTo((start.y + end.y) / 2 + VOLLEY.arcHeight, 9);
      expect(arrowPoint(v, k, 1, () => 0).y).toBe(0);
    }
  });

  it('on flat ground an arrow flies below 6 m only over its last 6.5 m', () => {
    const from = { x: VOLLEY.originBack, y: VOLLEY.originUp, z: 0 };
    const to = { x: 0, y: 0, z: 0 };
    for (let d = VOLLEY.lowTrack; d <= VOLLEY.originBack; d += 0.05) {
      expect(arrowArc(1 - d / VOLLEY.originBack, from, to, VOLLEY.arcHeight).y).toBeGreaterThanOrEqual(VOLLEY.lowHeight);
    }
  });
});

describe('landingOk', () => {
  const dharma = ARMIES.find((c) => c.id === 'army-dharma') as Box;
  const east = xz(1, 0);
  const west = xz(-1, 0);
  const open = xz(-80, -40);

  it('takes open ground with nothing near', () => {
    expect(landingOk(open, east, W, null)).toBe(true);
    expect(landingOk(open, east, W, [])).toBe(true);
  });

  it('lands 10 m inside the play disc', () => {
    expect(landingOk(xz(0, -159.9), xz(0, 1), W, null)).toBe(true);
    expect(landingOk(xz(0, -160.1), xz(0, 1), W, null)).toBe(false);
  });

  it('keeps 1.5 + 2.5 m from the colliders that are not figures', () => {
    // Post 2 (r 0.5) at (0, −62).
    expect(landingOk(xz(0, -62 + 4.51), xz(0, -1), W, null)).toBe(true);
    expect(landingOk(xz(0, -62 + 4.49), xz(0, -1), W, null)).toBe(false);
  });

  it('keeps 3 + 2.5 m from the army zones', () => {
    expect(landingOk(xz(dharma.minX - 5.6, -15), west, W, null)).toBe(true);
    expect(landingOk(xz(dharma.minX - 5.4, -15), west, W, null)).toBe(false);
  });

  it('keeps 2.5 m outside the shelters and the record circle', () => {
    // The camp's shelter: r 22 round (−100, −10). The record circle: r 9 round the tower.
    expect(landingOk(xz(-100 + 22 + 2.6, -10), east, W, null)).toBe(true);
    expect(landingOk(xz(-100 + 22 + 2.4, -10), east, W, null)).toBe(false);
    expect(landingOk(xz(ANCHORS.tower.x, ANCHORS.tower.z + RECORD_CIRCLE + 2.6), xz(0, 1), W, null)).toBe(true);
    expect(landingOk(xz(ANCHORS.tower.x, ANCHORS.tower.z + RECORD_CIRCLE + 2.4), xz(0, 1), W, null)).toBe(false);
  });

  it('keeps 5 m from the route', () => {
    expect(landingOk(open, east, W, [xz(-100, -34.9), xz(-60, -34.9)])).toBe(true);
    expect(landingOk(open, east, W, [xz(-100, -35.1), xz(-60, -35.1)])).toBe(false);
    expect(landingOk(open, east, W, [xz(-80, -36)])).toBe(false);
  });

  it('the last 6.5 m toward the origin keeps 3 + 2.5 m from the army zones', () => {
    const at = xz(dharma.minX - 8, -15);
    expect(landingOk(at, west, W, null)).toBe(true);
    expect(landingOk(at, xz(0, 1), W, null)).toBe(true);
    expect(landingOk(at, east, W, null)).toBe(false);
  });

  it('the last 6.5 m toward the origin keeps 1.5 + 2.5 m from the tall colliders', () => {
    // The gate's north wall: x 114–116, z −48 to −28.
    const at = xz(105, -35);
    expect(landingOk(at, west, W, null)).toBe(true);
    expect(landingOk(at, east, W, null)).toBe(false);
  });

  it("passes the prologue's scripted volley at (−77, 36) with the prologue's routed polyline", { timeout: 30_000 }, () => {
    const def = missionFor(0, []);
    const nav = buildNav(COLS);
    const stops = def.steps.flatMap((s) => (s.kind === 'collect' ? s.items.map((p) => p.at) : s.kind === 'reach' ? [s.at] : []));
    const pts: XZ[] = [SPAWN, ...stops];
    const line = pts.slice(1).flatMap((to, k) => routeTo(nav, COLS, pts[k], to)!);
    const at = def.scripted.volleyNear!.at;
    expect(at).toEqual(xz(-77, 36));
    const v = scriptedVolley(at, 0, 1, W);
    expect(landingOk(v.to, v.u, W, line)).toBe(true);
  });
});

describe('scriptedVolley', () => {
  it('lands where it is told, leaving a copy and no haze', () => {
    const at = xz(-77, 36);
    const v = scriptedVolley(at, 12, 4, W);
    expect(v).toMatchObject({ id: 4, to: at, planned: 12, t0: 13, flight: 1.6, arrows: 12, state: 'warn', decoy: true, cloud: false });
    expect(v.to).not.toBe(at);
    const s = nearestSource(at);
    expect(v.u.x).toBeCloseTo((s.x - at.x) / dist(s, at), 12);
    expect(v.u.z).toBeCloseTo((s.z - at.z) / dist(s, at), 12);
    expect(v.from.y).toBeCloseTo(groundHeight(at.x, at.z) + 22, 9);
    expect(scriptedVolley(at, 12, 4, PHONE).arrows).toBe(6);
  });
});

describe('telegraphAt', () => {
  it('shows 1.4 s before landing, or from the moment of planning (2.6 s before) with sight', () => {
    const v = planVolley(carAt(-120, -40, 0, 10), 50, 3, W, OPTS).volley!;
    const landing = v.t0 + v.flight;
    expect(landing).toBeCloseTo(52.6, 12);
    expect(telegraphAt(v, false)).toBeCloseTo(landing - 1.4, 12);
    expect(telegraphAt(v, true)).toBe(50);
    expect(telegraphAt(v, true)).toBeCloseTo(landing - 2.6, 12);
  });
});

describe('stepVolleys', () => {
  // Built for the state machine alone: (10, 0) is no landing a plan would choose.
  const v0 = scriptedVolley(xz(10, 0), 0, 1, W);
  const away = carAt(-60, 40, 0);
  const air = stepVolleys([v0], away, 1).volleys;

  it("is 'warn' until t0, 'air' until t0 + 1.6, then 'landed'", () => {
    let r = stepVolleys([v0], away, 0.99);
    expect(r.volleys.map((v) => v.state)).toEqual(['warn']);
    expect([r.launched, r.landed, r.absorbed]).toEqual([[], [], []]);
    r = stepVolleys(r.volleys, away, 1);
    expect(r.volleys.map((v) => v.state)).toEqual(['air']);
    expect(r.launched.map((v) => v.id)).toEqual([1]);
    r = stepVolleys(r.volleys, away, 2.59);
    expect(r.volleys.map((v) => v.state)).toEqual(['air']);
    expect([r.launched, r.landed, r.absorbed]).toEqual([[], [], []]);
    r = stepVolleys(r.volleys, away, 2.6);
    expect(r.volleys.map((v) => v.state)).toEqual(['landed']);
    expect(r.landed.map((v) => [v.id, v.state])).toEqual([[1, 'landed']]);
    expect([r.launched, r.absorbed]).toEqual([[], []]);
  });

  it("a volley landing within 7 m of a hull circle centre is 'absorbed': to (10, 0), the car at (8.4, 0) at rest", () => {
    const r = stepVolleys(air, carAt(8.4, 0, 0), 2.6);
    expect(r.absorbed.map((v) => [v.id, v.state])).toEqual([[1, 'absorbed']]);
    expect(r.landed).toEqual([]);
    expect(r.volleys).toEqual([]);
  });

  it('the 7 m counts from the nearest hull circle centre', () => {
    // Facing east, the front circle sits 3.6 m ahead of the car's origin.
    expect(stepVolleys(air, carAt(10 - 3.6 - 7.1, 0, 0), 2.6).landed).toHaveLength(1);
    expect(stepVolleys(air, carAt(10 - 3.6 - 6.9, 0, 0), 2.6).absorbed).toHaveLength(1);
    // Facing west, the rear circle is the nearest: 0.4 m behind the origin.
    expect(stepVolleys(air, carAt(10 - 0.4 - 7.1, 0, Math.PI), 2.6).landed).toHaveLength(1);
    expect(stepVolleys(air, carAt(10 - 0.4 - 6.9, 0, Math.PI), 2.6).absorbed).toHaveLength(1);
  });

  it('a frame that jumps past the landing launches and lands the volley in one step', () => {
    const r = stepVolleys([v0], away, 3);
    expect(r.launched.map((v) => v.id)).toEqual([1]);
    expect(r.landed.map((v) => v.id)).toEqual([1]);
    expect(r.volleys.map((v) => v.state)).toEqual(['landed']);
  });

  it('keeps a landed volley while its arrows stand 12 s and sink 0.6 s, then drops it', () => {
    const landed = stepVolleys(air, away, 2.6).volleys;
    expect(stepVolleys(landed, away, 2.6 + 12.5).volleys).toHaveLength(1);
    expect(stepVolleys(landed, away, 2.6 + 12.7).volleys).toEqual([]);
  });

  it('steps each volley on its own clock and keeps their order', () => {
    const later = scriptedVolley(xz(-80, -40), 5, 2, W);
    const r = stepVolleys([v0, later], away, 1);
    expect(r.volleys.map((v) => [v.id, v.state])).toEqual([
      [1, 'air'],
      [2, 'warn'],
    ]);
    expect(r.volleys[1]).toBe(later);
  });
});

describe('inCloud', () => {
  const haze: Cloud = { id: 1, at: xz(0, 30), r: VOLLEY.cloudR, born: 10, life: VOLLEY.cloudLife };

  it('is true within r 6 while born ≤ t < born + life', () => {
    expect(inCloud(xz(0, 30), [haze], 9.99)).toBe(false);
    expect(inCloud(xz(0, 30), [haze], 10)).toBe(true);
    expect(inCloud(xz(5.99, 30), [haze], 17.99)).toBe(true);
    expect(inCloud(xz(6.01, 30), [haze], 12)).toBe(false);
    expect(inCloud(xz(0, 30), [haze], 18)).toBe(false);
  });

  it('haze with no life stays; no haze is no cloud', () => {
    const scripted: Cloud = { ...haze, life: null };
    expect(inCloud(xz(0, 33), [haze, scripted], 1e6)).toBe(true);
    expect(inCloud(xz(0, 33), [scripted], 9)).toBe(false);
    expect(inCloud(xz(0, 30), [], 12)).toBe(false);
  });
});

describe('counts', () => {
  it('12 arrows a volley (6 on phones), and at most 6 copies (4 on phones)', () => {
    expect(VOLLEY.arrows).toBe(12);
    expect(VOLLEY.arrowsMobile).toBe(6);
    expect(VOLLEY.maxDecoys).toBe(6);
    expect(VOLLEY.maxDecoysMobile).toBe(4);
  });
});
