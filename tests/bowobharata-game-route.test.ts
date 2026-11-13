import { describe, expect, it } from 'vitest';
import { dist, type XZ } from '../src/lib/bowobharata-game/geom';
import { ANCHORS, SPAWN, TOWER_EXIT, clearance, staticColliders } from '../src/lib/bowobharata-game/world';
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
