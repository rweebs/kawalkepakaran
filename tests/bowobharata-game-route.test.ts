import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/sky/rng';
import { dist, type XZ } from '../src/lib/bowobharata-game/geom';
import { ANCHORS, PLAY, SPAWN, TOWER_EXIT, clearance, staticColliders, type Collider } from '../src/lib/bowobharata-game/world';
import { buildNav, pathLength, routeTo } from '../src/lib/bowobharata-game/route';

const cols = staticColliders();
const nav = buildNav(cols);
const CAMP: XZ = { x: -100, z: -10 };
const PAIRS: [string, XZ, XZ][] = [
  ['spawn to (-2,32)', SPAWN, { x: -2, z: 32 }],
  ['tower exit to camp', TOWER_EXIT, CAMP],
  ['camp to (108,-20)', CAMP, { x: 108, z: -20 }],
];

describe('route', () => {
  it.each(PAIRS)('finds a route: %s', (_n, a, b) => {
    const r = routeTo(nav, cols, a, b);
    expect(r).not.toBeNull();
    expect(r![0]).toEqual({ x: a.x, z: a.z });
    expect(r![r!.length - 1]).toEqual({ x: b.x, z: b.z });
  });

  it('knows where the camp is', () => {
    expect(ANCHORS.camp).toEqual(CAMP);
  });

  it.each(PAIRS)('keeps clearance 2.45 along every segment: %s', (_n, a, b) => {
    const r = routeTo(nav, cols, a, b)!;
    for (let k = 1; k < r.length; k++) {
      const p = r[k - 1];
      const q = r[k];
      const len = dist(p, q);
      const steps = Math.ceil(len);
      for (let s = 0; s <= steps; s++) {
        const t = steps ? s / steps : 0;
        const pt = { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
        if (dist(pt, a) <= 12 || dist(pt, b) <= 12) continue;
        expect(clearance(pt, cols)).toBeGreaterThanOrEqual(2.45 - 1e-9);
      }
    }
  });

  const isCentre = (p: XZ): boolean => {
    const u = (p.x - nav.minX) / nav.cell - 0.5;
    const v = (p.z - nav.minZ) / nav.cell - 0.5;
    return Math.abs(u - Math.round(u)) < 1e-9 && Math.abs(v - Math.round(v)) < 1e-9;
  };

  it.each(PAIRS)('keeps clearance 2.45 at every sample outside the snap legs: %s', (_n, a, b) => {
    const r = routeTo(nav, cols, a, b)!;
    let checked = 0;
    for (let k = 1; k < r.length; k++) {
      const p = r[k - 1];
      const q = r[k];
      const snapLeg = (k === 1 && isCentre(q) && dist(p, q) <= 12) || (k === r.length - 1 && isCentre(p) && dist(p, q) <= 12);
      if (snapLeg) continue;
      const steps = Math.max(1, Math.ceil(dist(p, q)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        expect(clearance({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, cols)).toBeGreaterThanOrEqual(2.45 - 1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('enters the camp through its east opening', () => {
    const r = routeTo(nav, cols, TOWER_EXIT, CAMP)!;
    let found: XZ | null = null;
    for (let k = 1; k < r.length && !found; k++) {
      const steps = Math.max(1, Math.ceil(dist(r[k - 1], r[k])));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const pt = { x: r[k - 1].x + (r[k].x - r[k - 1].x) * t, z: r[k - 1].z + (r[k].z - r[k - 1].z) * t };
        if (dist(pt, CAMP) <= 12) {
          found = pt;
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    const bearing = (Math.atan2(found!.z - CAMP.z, found!.x - CAMP.x) * 180) / Math.PI;
    expect(bearing).toBeGreaterThan(-49);
    expect(bearing).toBeLessThan(49);
  });

  it('never cuts through a collider on 200 seeded pairs', () => {
    const rng = mulberry32(14);
    const pick = (): XZ => {
      for (;;) {
        const a = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * PLAY.r;
        const p = { x: PLAY.cx + d * Math.cos(a), z: PLAY.cz + d * Math.sin(a) };
        if (clearance(p, cols) >= 2.45) return p;
      }
    };
    let routed = 0;
    for (let n = 0; n < 200; n++) {
      const a = pick();
      const b = pick();
      const r = routeTo(nav, cols, a, b);
      if (!r) continue;
      routed++;
      for (let k = 1; k < r.length; k++) {
        const p = r[k - 1];
        const q = r[k];
        const snapLeg = (k === 1 && isCentre(q) && dist(p, q) <= 12) || (k === r.length - 1 && isCentre(p) && dist(p, q) <= 12);
        const steps = Math.max(1, Math.ceil(dist(p, q)));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const c = clearance({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t }, cols);
          expect(c).toBeGreaterThan(0);
          if (!snapLeg) expect(c).toBeGreaterThanOrEqual(2.45 - 1e-9);
        }
      }
    }
    expect(routed).toBeGreaterThan(100);
  }, 30_000);

  it('returns null for an enclosed goal and for a start outside the play disc', () => {
    const goal = { x: 60, z: 90 };
    const ring: Collider[] = Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return { kind: 'circle', id: `ring-${k}`, x: goal.x + 14 * Math.cos(a), z: goal.z + 14 * Math.sin(a), r: 4, figure: false, tall: false };
    });
    const ringCols = [...cols, ...ring];
    const ringNav = buildNav(ringCols);
    expect(routeTo(ringNav, ringCols, SPAWN, goal)).toBeNull();
    expect(routeTo(nav, cols, { x: 0, z: 160 }, SPAWN)).toBeNull();
  });

  it('returns null for a goal outside the play disc', () => {
    expect(routeTo(nav, cols, SPAWN, { x: 0, z: 160 })).toBeNull();
  });

  it('is deterministic', () => {
    expect(routeTo(nav, cols, TOWER_EXIT, CAMP)).toEqual(routeTo(nav, cols, TOWER_EXIT, CAMP));
  });

  it('measures a path', () => {
    expect(pathLength([{ x: 0, z: 0 }, { x: 3, z: 4 }, { x: 3, z: 10 }])).toBe(11);
    expect(pathLength([])).toBe(0);
  });

  it('builds the nav and 20 routes in under 2 s', () => {
    const t0 = performance.now();
    const n = buildNav(staticColliders());
    for (let k = 0; k < 20; k++) {
      const [, a, b] = PAIRS[k % 3];
      expect(routeTo(n, cols, a, b)).not.toBeNull();
    }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
