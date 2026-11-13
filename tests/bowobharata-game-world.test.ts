import { describe, expect, it } from 'vitest';
import { formation } from '../src/lib/bowobharata/stage-math';
import { clamp, forward, yawOf, type XZ } from '../src/lib/bowobharata-game/geom';
import {
  NO_INPUT,
  initChariot,
  speedOf,
  stepChariot,
  type ChariotInput,
  type ChariotState,
  type DriveEnv,
} from '../src/lib/bowobharata-game/drive';
import {
  ANCHORS,
  ARMY_PAD,
  GAME_WARRIORS,
  GATE_CIRCLE,
  PLAY,
  POSTS,
  RECORD_CIRCLE,
  ROCKS,
  SPAWN,
  TENTS,
  TOWER_EXIT,
  TOWER_R,
  TREES,
  ZONES,
  armyZone,
  clearance,
  distToCollider,
  inArea,
  inPlay,
  softWallAccel,
  staticColliders,
  zonesAt,
  type Collider,
} from '../src/lib/bowobharata-game/world';
import {
  HULL,
  circleContact,
  crossesSegment,
  figureGuard,
  guardCap,
  hullCircles,
  hullClearance,
  hullMid,
  resolveContacts,
  sweptHit,
  type Contact,
} from '../src/lib/bowobharata-game/collide';
import { DRIVE, GUARD } from '../src/lib/bowobharata-game/tuning';

type Box = Extract<Collider, { kind: 'box' }>;

const COLS = staticColliders();
const ZONE_BOXES = COLS.filter((c) => c.figure);
const G: DriveEnv = { cloud: false, guard: figureGuard(ZONE_BOXES) };

interface Frame {
  s: ChariotState;
  contact: Contact | null;
}

/**
 * Steps `frames` frames of `input` (unset fields come from NO_INPUT). After each step it resolves contacts
 * against `cols`, as the engine does, unless `cols` is null.
 */
function drive(
  s: ChariotState,
  input: Partial<ChariotInput>,
  frames: number,
  dt: number,
  env: DriveEnv | undefined,
  cols: readonly Collider[] | null,
): Frame[] {
  const i = { ...NO_INPUT, ...input };
  const out: Frame[] = [];
  for (let f = 0; f < frames; f++) {
    s = stepChariot(s, i, dt, env);
    let contact: Contact | null = null;
    if (cols) ({ car: s, contact } = resolveContacts(s, cols));
    out.push({ s, contact });
  }
  return out;
}

const last = <T>(xs: T[]) => xs[xs.length - 1];
const seconds = (frameIndex: number) => (frameIndex + 1) / 60;
/** At (x, z) facing `yaw`, moving forward at `speed`. */
function moving(x: number, z: number, yaw: number, speed: number): ChariotState {
  const f = forward(yaw);
  return { ...initChariot(x, z, yaw), vx: speed * f.x, vz: speed * f.z };
}
const zoneClearance = (s: ChariotState) => hullClearance(s.x, s.z, s.yaw, ZONE_BOXES);
const leastZoneClearance = (frames: Frame[]) => Math.min(...frames.map((f) => zoneClearance(f.s)));
const contacts = (frames: Frame[]) => frames.flatMap((f) => (f.contact ? [f.contact] : []));
const bounds = (b: Box) => [b.minX, b.maxX, b.minZ, b.maxZ];
const byId = (id: string) => COLS.find((c) => c.id === id);

/** Whether the ray from o along (dx, dz) meets the box grown by g on every side. */
function rayMeetsGrown(o: XZ, dx: number, dz: number, b: Box, g: number): boolean {
  let near = 0;
  let far = Infinity;
  for (const [p, d, lo, hi] of [
    [o.x, dx, b.minX - g, b.maxX + g],
    [o.z, dz, b.minZ - g, b.maxZ + g],
  ]) {
    if (d === 0) {
      if (p < lo || p > hi) return false;
      continue;
    }
    near = Math.max(near, Math.min((lo - p) / d, (hi - p) / d));
    far = Math.min(far, Math.max((lo - p) / d, (hi - p) / d));
  }
  return near <= far;
}

/**
 * How much faster than guardCap(d) the hull at (x, z, yaw) moving at (vx, vz) closes on a zone, by the brief's rule:
 * a circle in a zone's x- or z-slab always counts, along the face normal; one in a corner region counts, along the
 * corner's normal, when the ray from it along v meets the zone grown by 1.45 + 0.5 m. At most 0 when none does.
 */
function worstClosingExcess(x: number, z: number, yaw: number, vx: number, vz: number): number {
  let worst = -Infinity;
  for (const c of hullCircles(x, z, yaw)) {
    for (const b of ZONE_BOXES as Box[]) {
      const qx = clamp(c.x, b.minX, b.maxX);
      const qz = clamp(c.z, b.minZ, b.maxZ);
      const gap = Math.hypot(c.x - qx, c.z - qz);
      if (gap === 0 || gap - HULL.r > GUARD.range) continue;
      if (qx !== c.x && qz !== c.z && !rayMeetsGrown(c, vx, vz, b, HULL.r + GUARD.stop)) continue;
      const closing = -(vx * (c.x - qx) + vz * (c.z - qz)) / gap;
      worst = Math.max(worst, closing - guardCap(gap - HULL.r));
    }
  }
  return worst;
}

describe('the ranks', () => {
  it('each army zone is the bounding box of its formation, grown by 0.9 m', () => {
    const expected: [Box, number[]][] = [
      [armyZone('adharma'), [2.96, 19.295, -45.396, 15.067]],
      [armyZone('dharma'), [-19.294, -2.952, -45.503, 15.051]],
      [armyZone('adharma', 700), [2.96, 14.539, -45.392, 15.067]],
      [armyZone('dharma', 700), [-14.542, -2.952, -45.503, 15.051]],
    ];
    for (const [zone, values] of expected) bounds(zone).forEach((v, k) => expect(v).toBeCloseTo(values[k], 3));
    expect(armyZone('adharma')).toMatchObject({ kind: 'box', id: 'army-adharma', figure: true, tall: false });
    expect(armyZone('dharma')).toMatchObject({ kind: 'box', id: 'army-dharma', figure: true, tall: false });
    expect(ARMY_PAD).toBe(0.9);
    expect(GAME_WARRIORS).toBe(1024);
  });

  it('every soldier stands at least 0.9 m inside its zone, for 1024 and 700 a side', () => {
    for (const n of [1024, 700]) {
      for (const side of ['dharma', 'adharma'] as const) {
        const zone = armyZone(side, n);
        const inset = Math.min(
          ...formation(n, side, 5).map((p) => Math.min(p.x - zone.minX, zone.maxX - p.x, p.z - zone.minZ, zone.maxZ - p.z)),
        );
        expect(inset).toBeGreaterThanOrEqual(0.9 - 1e-9);
      }
    }
  });

  it('the corridor between them stays at least 2.95 m from both zones, for both counts', () => {
    for (const n of [1024, 700]) {
      const zones = [armyZone('dharma', n), armyZone('adharma', n)];
      let least = Infinity;
      for (let k = 0; k <= 240; k++) least = Math.min(least, clearance({ x: 0, z: -45 + k * 0.25 }, zones));
      expect(least).toBeGreaterThanOrEqual(2.95);
      expect(least).toBeCloseTo(2.952, 3);
    }
  });
});

describe('the field', () => {
  it('has 50 static colliders with unique ids; the figures are exactly the two zones; 21 are tall', () => {
    expect(COLS).toHaveLength(50);
    expect(new Set(COLS.map((c) => c.id)).size).toBe(50);
    expect(ZONE_BOXES).toEqual([armyZone('dharma'), armyZone('adharma')]);
    expect(staticColliders(700).filter((c) => c.figure)).toEqual([armyZone('dharma', 700), armyZone('adharma', 700)]);
    const tall = COLS.filter((c) => c.tall).map((c) => c.id);
    const trees = Array.from({ length: 16 }, (_, k) => `tree-${k}`);
    expect(tall.sort()).toEqual(['tower', 'gate-pylon-n', 'gate-pylon-s', 'gate-wall-n', 'gate-wall-s', ...trees].sort());
  });

  it('places the mound, the tower and the gate', () => {
    expect(byId('mound')).toEqual({ kind: 'circle', id: 'mound', x: 16, z: 16, r: 9.5, figure: false, tall: false });
    expect(TOWER_R).toBe(2.5);
    expect(byId('tower')).toEqual({ kind: 'circle', id: 'tower', ...ANCHORS.tower, r: 2.5, figure: false, tall: true });
    const gate: [string, number[]][] = [
      ['gate-pylon-n', [113, 117, -28, -25]],
      ['gate-pylon-s', [113, 117, -15, -12]],
      ['gate-wall-n', [114, 116, -48, -28]],
      ['gate-wall-s', [114, 116, -12, 8]],
    ];
    for (const [id, b] of gate) {
      const c = byId(id) as Box;
      expect(c).toMatchObject({ kind: 'box', figure: false, tall: true });
      expect(bounds(c)).toEqual(b);
    }
  });

  it('pitches five tents 12 m around the camp, open to the east', () => {
    const expected = [
      [-94, 0.39],
      [-106, 0.39],
      [-112, -10],
      [-106, -20.39],
      [-94, -20.39],
    ];
    expect(TENTS).toHaveLength(5);
    TENTS.forEach((t, k) => {
      expect(t.x).toBeCloseTo(expected[k][0], 2);
      expect(t.z).toBeCloseTo(expected[k][1], 2);
      expect(Math.hypot(t.x - ANCHORS.camp.x, t.z - ANCHORS.camp.z)).toBeCloseTo(12, 9);
      expect(byId(`tent-${k}`)).toEqual({ kind: 'circle', id: `tent-${k}`, x: t.x, z: t.z, r: 2.2, figure: false, tall: false });
    });
  });

  it('plants eight trees around each grove, with a clearing at the centre', () => {
    const offsets = ['-6,-6', '-6,6', '-9,0', '0,-9', '0,9', '6,-6', '6,6', '9,0'];
    expect(TREES).toHaveLength(16);
    [ANCHORS.groveNW, ANCHORS.groveSE].forEach((grove, g) => {
      const mine = TREES.slice(g * 8, g * 8 + 8).map((t) => `${t.x - grove.x},${t.z - grove.z}`);
      expect(mine.sort()).toEqual(offsets);
    });
    TREES.forEach((t, k) => expect(byId(`tree-${k}`)).toEqual({ kind: 'circle', id: `tree-${k}`, x: t.x, z: t.z, r: 0.8, figure: false, tall: true }));
  });

  it('stands six watch posts and five rock clusters', () => {
    expect(POSTS).toEqual([
      { x: 32, z: -20 },
      { x: 32, z: -70 },
      { x: 0, z: -62 },
      { x: 45, z: 18 },
      { x: 95, z: -45 },
      { x: 90, z: 20 },
    ]);
    POSTS.forEach((p, k) => expect(byId(`post-${k}`)).toEqual({ kind: 'circle', id: `post-${k}`, x: p.x, z: p.z, r: 0.5, figure: false, tall: false }));
    const clusters = [
      [-28, 98],
      [30, 100],
      [-120, 50],
      [125, -60],
      [40, -125],
    ];
    const cluster = [
      [0, 0, 1.8],
      [3.5, 1.5, 1.2],
      [-2, 3, 1.0],
    ];
    expect(ROCKS).toEqual(clusters.flatMap(([cx, cz]) => cluster.map(([dx, dz, r]) => ({ at: { x: cx + dx, z: cz + dz }, r }))));
    ROCKS.forEach((rock, k) =>
      expect(byId(`rock-${k}`)).toEqual({ kind: 'circle', id: `rock-${k}`, ...rock.at, r: rock.r, figure: false, tall: false }),
    );
  });
});

describe('open ground', () => {
  it('names the anchors and the circles around the record and the gate', () => {
    expect(ANCHORS).toEqual({
      tower: { x: -46, z: 52 },
      camp: { x: -100, z: -10 },
      gate: { x: 115, z: -20 },
      groveNW: { x: -84, z: -106 },
      groveSE: { x: 95, z: 65 },
      northEnd: { x: 0, z: -80 },
    });
    expect([RECORD_CIRCLE, GATE_CIRCLE]).toEqual([9, 5]);
  });

  it('the spawn sits 1.5 m clear of the dharma zone and the tower exit at least 5 m from anything', () => {
    expect(SPAWN).toEqual({ x: 0, z: 9, yaw: -Math.PI / 2 });
    expect(TOWER_EXIT).toEqual({ x: -40, z: 60, yaw: 0 });
    expect(Math.abs(hullClearance(SPAWN.x, SPAWN.z, SPAWN.yaw, COLS) - 1.502)).toBeLessThanOrEqual(0.01);
    expect(hullClearance(TOWER_EXIT.x, TOWER_EXIT.z, TOWER_EXIT.yaw, COLS)).toBeGreaterThanOrEqual(5);
  });

  it('SPAWN and TOWER_EXIT are plain poses that one variable can hold', () => {
    // This only typechecks when neither is narrowed to literal types.
    let pose = SPAWN;
    pose = TOWER_EXIT;
    expect(pose).toBe(TOWER_EXIT);
  });

  it('every anchor but the tower is 20 m inside the field with at least 4 m around it', () => {
    for (const [name, p] of Object.entries(ANCHORS)) {
      if (name === 'tower') continue;
      expect(inPlay(p, 20)).toBe(true);
      expect(clearance(p)).toBeGreaterThanOrEqual(4);
    }
    expect(clearance(ANCHORS.groveNW)).toBeCloseTo(7.685, 3);
    expect(clearance(ANCHORS.groveSE)).toBeCloseTo(7.685, 3);
    expect(clearance(ANCHORS.camp)).toBeCloseTo(9.8, 3);
  });

  it('every tent, tree, rock and post stands 10 m inside the field', () => {
    for (const p of [...TENTS, ...TREES, ...ROCKS.map((r) => r.at), ...POSTS]) expect(inPlay(p, 10)).toBe(true);
  });

  it('inPlay measures from the centre of the 160 m disc, less the margin', () => {
    const at = (d: number) => ({ x: PLAY.cx + d * 0.6, z: PLAY.cz - d * 0.8 });
    expect(inPlay(at(159.9))).toBe(true);
    expect(inPlay(at(160.1))).toBe(false);
    expect(inPlay(at(149.9), 10)).toBe(true);
    expect(inPlay(at(150.1), 10)).toBe(false);
  });
});

describe('distances and contacts', () => {
  const box: Collider = { kind: 'box', id: 'b', minX: 1.5, maxX: 2.5, minZ: -0.5, maxZ: 0.5, figure: false, tall: false };
  const post: Collider = { kind: 'circle', id: 'c', x: 1.5, z: 0, r: 0.8, figure: false, tall: false };

  it('distToCollider is the gap to the shape, negative inside', () => {
    expect(distToCollider({ x: 0, z: 0 }, box)).toBeCloseTo(1.5, 12);
    expect(distToCollider({ x: 3.5, z: 1.5 }, box)).toBeCloseTo(Math.SQRT2, 12);
    expect(distToCollider({ x: 2.3, z: 0 }, box)).toBeCloseTo(-0.2, 12);
    expect(distToCollider({ x: 0, z: 0 }, post)).toBeCloseTo(0.7, 12);
    expect(distToCollider({ x: 1.5, z: 0.3 }, post)).toBeCloseTo(-0.5, 12);
    expect(clearance({ x: 0, z: 0 }, [box, post])).toBeCloseTo(0.7, 12);
  });

  it('a circle against a box face: depth 0.1, pushed west; clear of it, null', () => {
    const hit = circleContact({ x: 0, z: 0, r: 1.6 }, box);
    expect(hit?.depth).toBeCloseTo(0.1, 12);
    expect([hit?.nx, hit?.nz]).toEqual([-1, 0]);
    expect(circleContact({ x: 0, z: 0, r: 1 }, box)).toBeNull();
  });

  it('a circle against a circle: depth 0.3, pushed west', () => {
    const hit = circleContact({ x: 0, z: 0, r: 1 }, post);
    expect(hit?.depth).toBeCloseTo(0.3, 12);
    expect([hit?.nx, hit?.nz]).toEqual([-1, 0]);
  });

  it('a centre inside a box leaves by the nearest face', () => {
    // 0.2 m from the east face, 0.8 from the west and 0.5 from the other two.
    const east = circleContact({ x: 2.3, z: 0, r: 0.5 }, box);
    expect(east?.depth).toBeCloseTo(0.7, 12);
    expect([east?.nx, east?.nz]).toEqual([1, 0]);
    // 0.1 m from the north face (−z).
    const north = circleContact({ x: 2, z: -0.4, r: 0.5 }, box);
    expect(north?.depth).toBeCloseTo(0.6, 12);
    expect([north?.nx, north?.nz]).toEqual([0, -1]);
  });

  it('the hull is three circles of 1.45 m along the heading', () => {
    expect(HULL).toEqual({ offsets: [-0.4, 1.6, 3.6], r: 1.45 });
    const circles = hullCircles(10, 20, Math.PI / 2);
    expect(circles.map((c) => c.r)).toEqual([1.45, 1.45, 1.45]);
    [20.4, 18.4, 16.4].forEach((z, k) => {
      expect(circles[k].x).toBeCloseTo(10, 12);
      expect(circles[k].z).toBeCloseTo(z, 12);
    });
    const mid = hullMid({ x: 10, z: 20, yaw: 0 });
    expect(mid.x).toBeCloseTo(11.6, 12);
    expect(mid.z).toBeCloseTo(20, 12);
  });
});

describe('the guard at the ranks', () => {
  it('caps the closing speed so the chariot can stop 0.5 m short at 14 m/s²', () => {
    expect(GUARD).toEqual({ range: 26, stop: 0.5, decel: 14 });
    expect(guardCap(0.3)).toBe(0);
    expect(guardCap(0.5)).toBe(0);
    expect(guardCap(1.5)).toBeCloseTo(Math.sqrt(28), 12);
    expect(guardCap(0.5 + 289 / 28)).toBeCloseTo(17, 12);
  });

  it('guards every figure: they are all boxes, and figureGuard refuses any other shape', () => {
    for (const n of [GAME_WARRIORS, 700]) {
      const figures = staticColliders(n).filter((c) => c.figure);
      expect(figures.map((c) => c.kind)).toEqual(['box', 'box']);
      expect(() => figureGuard(figures)).not.toThrow();
    }
    const ring: Collider = { kind: 'circle', id: 'ring', x: 0, z: 0, r: 2, figure: true, tall: false };
    expect(() => figureGuard([...ZONE_BOXES, ring])).toThrow(/ring/);
  });

  const FIXTURES: [XZ, XZ][] = [
    [{ x: 60, z: -15 }, { x: 19.3, z: -15 }],
    [{ x: -60, z: -15 }, { x: -19.3, z: -15 }],
    [{ x: 11, z: -90 }, { x: 11, z: -45.4 }],
    [{ x: -11, z: -90 }, { x: -11, z: -45.5 }],
    [{ x: 4, z: 50 }, { x: 4, z: 15.07 }],
    [{ x: -50, z: 40 }, { x: -19.3, z: 15.05 }],
    [{ x: 55, z: -80 }, { x: 19.3, z: -45.4 }],
    [{ x: -55, z: -80 }, { x: -19.3, z: -45.5 }],
  ];

  for (const [from, to] of FIXTURES) {
    it(`never lets a charge from (${from.x}, ${from.z}) at (${to.x}, ${to.z}) touch the ranks`, () => {
      const yaw = yawOf({ x: to.x - from.x, z: to.z - from.z });
      for (const speed of [17, 25]) {
        for (const dt of [1 / 60, 0.05]) {
          const frames = drive(moving(from.x, from.z, yaw, speed), { throttle: 1, boost: true }, Math.round(6 / dt), dt, G, COLS);
          const least = leastZoneClearance(frames);
          expect(least).toBeGreaterThanOrEqual(0.49);
          // It did reach the guard: it was held at the stop distance, not short of it.
          expect(least).toBeLessThan(0.55);
          expect(contacts(frames)).toEqual([]);
          expect(last(frames).s.boostT).toBe(0);
        }
      }
    });
  }

  it('wedged diagonally across the south mouth for 15 s, the hull touches nothing (the review reproduction)', () => {
    for (const dt of [1 / 60, 0.05]) {
      for (const input of [{ throttle: 1 }, { throttle: 1, boost: true }]) {
        const frames = drive(moving(5.17, 20.91, 2.2689, 8), input, Math.round(15 / dt), dt, G, COLS);
        expect(contacts(frames)).toEqual([]);
        expect(leastZoneClearance(frames)).toBeGreaterThanOrEqual(0.49);
      }
    }
  });

  it('a sweep of headings into both corridor mouths never lets the hull touch or crowd either army', () => {
    const [dharma, adharma] = ZONE_BOXES as Box[];
    const stopGap = HULL.r + GUARD.stop;
    const lanes = [
      { army: 'dharma', x: dharma.maxX + stopGap, box: dharma },
      { army: 'adharma', x: adharma.minX - stopGap, box: adharma },
    ];
    const northward = Array.from({ length: 15 }, (_, k) => 100 + 5 * k);
    const failures: string[] = [];
    for (const mouth of ['south', 'north'] as const) {
      const headings = [...northward, ...northward.map((d) => 180 - d)].map((d) => (mouth === 'south' ? d : -d));
      for (const deg of headings) {
        for (const lane of lanes) {
          // The front circle's path crosses the army's 0.5 m lane on the mouth's line.
          const aim = { x: lane.x, z: mouth === 'south' ? lane.box.maxZ : lane.box.minZ };
          const yaw = (deg * Math.PI) / 180;
          const f = forward(yaw);
          const startAt = (back: number) => ({ x: aim.x - (back + HULL.offsets[2]) * f.x, z: aim.z - (back + HULL.offsets[2]) * f.z });
          // 6 m back along the heading, or further until the hull stands 1 m clear of every collider.
          let back = 6;
          while (hullClearance(startAt(back).x, startAt(back).z, yaw, COLS) < 1) back += 1;
          const p = startAt(back);
          const frames = drive(moving(p.x, p.z, yaw, 8), { throttle: 1 }, 480, 1 / 60, G, COLS);
          const least = leastZoneClearance(frames);
          const touched = contacts(frames).some((c) => c.figure);
          if (least < 0.49 || touched) failures.push(`${mouth} mouth ${deg}° ${lane.army} lane: least ${least.toFixed(3)}${touched ? ', touched' : ''}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('after one call to cap, no hull circle closes on a zone faster than guardCap allows, in wedged poses', () => {
    interface Moving {
      x: number;
      z: number;
      yaw: number;
      vx: number;
      vz: number;
    }
    const heading = forward(2.2689);
    const wedged: Moving[] = [
      // The review's single call: the rear circle 0.03 m from army-dharma's south-east corner.
      { x: -1.255, z: 15.069, yaw: 0.89, vx: 0.08, vz: -0.49 },
      // The reproduction's start, and its poses under a single-pass cap at 2, 4, 6 and 6.8 s as it crept in.
      { x: 5.17, z: 20.91, yaw: 2.2689, vx: 8 * heading.x, vz: 8 * heading.z },
      { x: 1.3111, z: 15.9956, yaw: 2.2689, vx: 0, vz: -0.0993 },
      { x: 1.3111, z: 15.7667, yaw: 2.2689, vx: 0, vz: -0.134 },
      { x: 1.3111, z: 15.4177, yaw: 2.2689, vx: 0, vz: -0.2395 },
      { x: 1.3111, z: 15.1766, yaw: 2.2689, vx: 0, vz: -0.3861 },
    ];
    // Mirrored across the corridor's axis (x = 0) and to the north mouth (about the zones' middle z).
    const midZ = ((ZONE_BOXES[1] as Box).minZ + (ZONE_BOXES[1] as Box).maxZ) / 2;
    const poses = wedged.flatMap((p) => [
      p,
      { x: -p.x, z: p.z, yaw: Math.PI - p.yaw, vx: -p.vx, vz: p.vz },
      { x: p.x, z: 2 * midZ - p.z, yaw: -p.yaw, vx: p.vx, vz: -p.vz },
      { x: -p.x, z: 2 * midZ - p.z, yaw: p.yaw - Math.PI, vx: -p.vx, vz: -p.vz },
    ]);
    let worst = -Infinity;
    let worstAt = '';
    for (const p of poses) {
      const velocities = [{ vx: p.vx, vz: p.vz }];
      for (let k = 0; k < 24; k++) {
        for (const speed of [2, 8, 17]) velocities.push({ vx: speed * Math.cos((k * Math.PI) / 12), vz: speed * Math.sin((k * Math.PI) / 12) });
      }
      for (const v of velocities) {
        const out = G.guard!.cap(p.x, p.z, p.yaw, v.vx, v.vz);
        const excess = worstClosingExcess(p.x, p.z, p.yaw, out.vx, out.vz);
        if (excess > worst) [worst, worstAt] = [excess, JSON.stringify({ ...p, in: v, out })];
      }
    }
    expect(worst, worstAt).toBeLessThanOrEqual(1e-9);
  });

  it('ramming stops short: held from 0.3 s, at rest with the front circle 0.5 m from the face', () => {
    const frames = drive({ ...initChariot(40, -10, Math.PI), vx: -17 }, { throttle: 1 }, 180, 1 / 60, G, COLS);
    expect(contacts(frames)).toEqual([]);
    const firstHeld = frames.findIndex((f) => f.s.held > 0);
    expect(firstHeld).toBeGreaterThanOrEqual(0);
    expect(Math.abs(seconds(firstHeld) - 0.3)).toBeLessThanOrEqual(0.02);
    const end = last(frames).s;
    expect(Math.abs(speedOf(end))).toBeLessThan(1e-6);
    expect(Math.abs(end.x - 24.85)).toBeLessThanOrEqual(0.02);
    expect(zoneClearance(end)).toBeCloseTo(0.5, 2);
  });

  it('the corridor stays free: nothing is held driving down the middle', () => {
    const frames = drive({ ...initChariot(0, 20, Math.PI / 2), vz: -17 }, { throttle: 1 }, 240, 1 / 60, G, COLS);
    expect(contacts(frames)).toEqual([]);
    expect(frames.every((f) => f.s.held === 0)).toBe(true);
    expect(last(frames).s.z).toBeLessThan(-45);
  });

  it('an off-centre entry is steered, not stopped', () => {
    const frames = drive({ ...initChariot(1.2, 30, Math.PI / 2), vz: -12 }, { throttle: 1 }, 240, 1 / 60, G, COLS);
    expect(contacts(frames)).toEqual([]);
    expect(leastZoneClearance(frames)).toBeGreaterThanOrEqual(0.49);
    const end = last(frames).s;
    expect(end.x).toBeGreaterThanOrEqual(0.8);
    expect(end.x).toBeLessThanOrEqual(1.2);
    expect(end.z).toBeLessThan(-15);
  });

  it('no turning into the ranks: a pivot at the spawn stops at 15.9° and stays there', () => {
    const frames = drive(initChariot(SPAWN.x, SPAWN.z, SPAWN.yaw), { steer: 1 }, 120, 1 / 60, G, null);
    const end = last(frames).s;
    expect(Math.abs(end.yaw - (-Math.PI / 2 - 0.2775))).toBeLessThanOrEqual(0.009);
    for (const f of frames.slice(60)) expect(f.s.yaw).toBe(end.yaw);
    expect(leastZoneClearance(frames)).toBeGreaterThanOrEqual(0.49);
  });

  it('no turning into the ranks: beside them the heading barely moves', () => {
    const frames = drive(initChariot(21.5, -15, Math.PI / 2), { steer: -1 }, 120, 1 / 60, G, null);
    expect(Math.max(...frames.map((f) => Math.abs(f.s.yaw - Math.PI / 2)))).toBeLessThanOrEqual(0.07);
    expect(leastZoneClearance(frames)).toBeGreaterThanOrEqual(0.49);
  });

  it('a Laju requested while the guard holds the chariot neither starts nor spends a charge', () => {
    const zone = armyZone('adharma');
    // Facing west, the front hull circle stops 0.5 m from the zone's east face.
    const stopX = zone.maxX + GUARD.stop + HULL.r + HULL.offsets[2];
    // The guard holds a 2 m/s chariot only within 2²/(2·14) ≈ 0.14 m of that point: 1 m out, guardCap is 5.29 m/s
    // and a surge would start (the guard then cancels and refunds it at 0.13 s). So it starts 0.1 m out.
    const frames = drive({ ...initChariot(stopX + 0.1, -10, Math.PI), vx: -2 }, { throttle: 1, boost: true }, 60, 1 / 60, G, COLS);
    expect(contacts(frames)).toEqual([]);
    for (const f of frames) {
      expect(f.s.held).toBeGreaterThan(0);
      expect(f.s.boostT).toBe(0);
      expect(f.s.cooldown).toBe(0);
    }
  });

  it('held at the east face, then steering either way with throttle for 15 s, it never touches the ranks', () => {
    const rammed = last(drive({ ...initChariot(40, -10, Math.PI), vx: -17 }, { throttle: 1 }, 180, 1 / 60, G, COLS)).s;
    for (const steer of [1, -1]) {
      const frames = drive(rammed, { throttle: 1, steer }, 900, 1 / 60, G, COLS);
      expect(contacts(frames).filter((c) => c.figure)).toEqual([]);
      expect(leastZoneClearance(frames)).toBeGreaterThanOrEqual(0.49);
    }
  });

  it('reversing into the east face with the brake held for 20 s, it stops short', () => {
    const frames = drive(initChariot(30, -10, 0), { brake: 1 }, 1200, 1 / 60, G, COLS);
    expect(contacts(frames).filter((c) => c.figure)).toEqual([]);
    const least = leastZoneClearance(frames);
    expect(least).toBeGreaterThanOrEqual(0.49);
    // It did back up to the stop distance.
    expect(least).toBeLessThan(0.55);
  });

  it('shallow approaches to the east face at 2°, 5°, 10° and 20°, at 17 m/s, never touch the ranks', () => {
    const lane = (ZONE_BOXES[1] as Box).maxX + HULL.r + GUARD.stop;
    for (const deg of [2, 5, 10, 20]) {
      // Southward, turned toward the face; the front circle's path meets the 0.5 m lane at z −40 after 1 s.
      const yaw = -Math.PI / 2 - (deg * Math.PI) / 180;
      const f = forward(yaw);
      const front = { x: lane - 17 * f.x, z: -40 - 17 * f.z };
      const start = moving(front.x - HULL.offsets[2] * f.x, front.z - HULL.offsets[2] * f.z, yaw, 17);
      const frames = drive(start, { throttle: 1 }, 180, 1 / 60, G, COLS);
      expect(contacts(frames).filter((c) => c.figure)).toEqual([]);
      const least = leastZoneClearance(frames);
      expect(least).toBeGreaterThanOrEqual(0.49);
      expect(least).toBeLessThan(0.55);
    }
  });

  it('started 0.05 m inside the 0.5 m buffer at 25 m/s with 0.05 s frames, it gets no closer and touches nothing', () => {
    const face = (ZONE_BOXES[1] as Box).maxX;
    const start = { ...initChariot(face + HULL.r + GUARD.stop - 0.05 + HULL.offsets[2], -10, Math.PI), vx: -25 };
    const from = zoneClearance(start);
    expect(from).toBeCloseTo(0.45, 9);
    const frames = drive(start, { throttle: 1, boost: true }, 40, 0.05, G, COLS);
    expect(contacts(frames)).toEqual([]);
    expect(leastZoneClearance(frames)).toBeGreaterThanOrEqual(from - 1e-9);
  });
});

describe('the backstop without the guard', () => {
  it('bounces the chariot off the ranks at a fifth of its speed, and nothing stays inside a collider', () => {
    const frames = drive({ ...initChariot(40, -10, Math.PI), vx: -17 }, { throttle: 1 }, 180, 1 / 60, undefined, COLS);
    const first = frames.findIndex((f) => f.contact);
    expect(first).toBeGreaterThanOrEqual(0);
    const { s, contact } = frames[first];
    expect(contact).toMatchObject({ id: 'army-adharma', figure: true });
    expect(Math.abs((contact?.speed ?? 0) - 17)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(speedOf(s) - -3.4)).toBeLessThanOrEqual(0.05);
    expect(s.holdOff).toBe(DRIVE.bumpHoldOff);
    let deepest = 0;
    for (const f of frames) {
      for (const c of hullCircles(f.s.x, f.s.z, f.s.yaw)) {
        for (const col of COLS) deepest = Math.max(deepest, circleContact(c, col)?.depth ?? 0);
      }
    }
    expect(deepest).toBeLessThanOrEqual(1e-6);
  });

  it('does not tunnel through a post at 25 m/s with 0.05 s frames', () => {
    const post: Collider = { kind: 'circle', id: 'post', x: 10, z: 0, r: 0.5, figure: false, tall: false };
    const frames = drive({ ...initChariot(0, 0, 0), vx: 25 }, { throttle: 1, boost: true }, 20, 0.05, undefined, [post]);
    const fronts = frames.map((f) => hullCircles(f.s.x, f.s.z, f.s.yaw)[2].x);
    expect(Math.max(...fronts)).toBeLessThanOrEqual(8.05 + 1e-6);
    expect(contacts(frames).some((c) => c.id === 'post')).toBe(true);
  });

  it('never mutates the chariot it resolves', () => {
    const s = Object.freeze({ ...initChariot(21, -10, Math.PI), vx: -5 });
    const before = { ...s };
    const { car, contact } = resolveContacts(s, ZONE_BOXES);
    expect(contact?.id).toBe('army-adharma');
    expect(car).not.toBe(s);
    expect(s).toEqual(before);
  });
});

describe('swept paths', () => {
  it('sweptHit: the path passes within r of the point', () => {
    expect(sweptHit({ x: 0, z: 0 }, { x: 1.25, z: 0 }, { x: 0.6, z: 2.9 }, 3)).toBe(true);
    expect(sweptHit({ x: 0, z: 0 }, { x: 1.25, z: 0 }, { x: 0.6, z: 3.1 }, 3)).toBe(false);
    expect(sweptHit({ x: -20, z: 0 }, { x: 20, z: 0 }, { x: 0, z: 2.9 }, 3)).toBe(true);
  });

  it('crossesSegment: true only when the two segments cross', () => {
    const left = { x: -1, z: 0 };
    const right = { x: 1, z: 0 };
    expect(crossesSegment({ x: 0, z: -1 }, { x: 0, z: 1 }, left, right)).toBe(true);
    expect(crossesSegment({ x: 0, z: 1 }, { x: 0, z: 2 }, left, right)).toBe(false);
    expect(crossesSegment({ x: -1, z: 1 }, { x: 1, z: 1 }, left, right)).toBe(false);
    expect(crossesSegment({ x: -2, z: 0 }, { x: 0, z: 0 }, left, right)).toBe(false);
  });
});

describe('zones', () => {
  it('lists the watch zones and the shelters', () => {
    const zone = (id: string) => ZONES.find((z) => z.id === id);
    POSTS.forEach((p, k) => expect(zone(`post-${k}`)).toEqual({ id: `post-${k}`, role: 'watch', area: { kind: 'circle', x: p.x, z: p.z, r: 28 } }));
    const ranks = armyZone('adharma');
    expect(zone('ranks')).toEqual({
      id: 'ranks',
      role: 'watch',
      area: { kind: 'box', minX: ranks.minX - 10, maxX: ranks.maxX + 10, minZ: ranks.minZ - 10, maxZ: ranks.maxZ + 10 },
    });
    expect(zone('gate')).toEqual({ id: 'gate', role: 'watch', area: { kind: 'circle', ...ANCHORS.gate, r: 25 } });
    expect(zone('camp')).toEqual({ id: 'camp', role: 'shelter', area: { kind: 'circle', ...ANCHORS.camp, r: 22 } });
    expect(zone('groveNW')).toEqual({ id: 'groveNW', role: 'shelter', area: { kind: 'circle', ...ANCHORS.groveNW, r: 18 } });
    expect(zone('groveSE')).toEqual({ id: 'groveSE', role: 'shelter', area: { kind: 'circle', ...ANCHORS.groveSE, r: 18 } });
    expect(ZONES).toHaveLength(11);
  });

  it('inArea covers circles and boxes, edges included', () => {
    expect(inArea({ x: 3, z: 4 }, { kind: 'circle', x: 0, z: 0, r: 5 })).toBe(true);
    expect(inArea({ x: 3, z: 4.01 }, { kind: 'circle', x: 0, z: 0, r: 5 })).toBe(false);
    const b = { kind: 'box', minX: 0, maxX: 2, minZ: -1, maxZ: 1 } as const;
    expect(inArea({ x: 2, z: -1 }, b)).toBe(true);
    expect(inArea({ x: 2.01, z: 0 }, b)).toBe(false);
  });

  it('the camp shelters; a post, the ranks and the gate watch; the tower is neither', () => {
    expect(zonesAt(ANCHORS.camp)).toEqual({ watched: false, shelter: true });
    expect(zonesAt(ANCHORS.groveNW)).toEqual({ watched: false, shelter: true });
    expect(zonesAt({ x: 32, z: -20 }).watched).toBe(true);
    expect(zonesAt(ANCHORS.tower)).toEqual({ watched: false, shelter: false });
    expect(zonesAt({ x: 0, z: 0 })).toEqual({ watched: true, shelter: false });
    expect(zonesAt(ANCHORS.gate).watched).toBe(true);
  });
});

describe('the soft wall', () => {
  it('pushes toward the centre from 150 m, rising to 6 m/s² at 160 m and no further', () => {
    expect(PLAY).toEqual({ cx: 0, cz: -10, r: 160, wall: 150, push: 6 });
    for (const angle of [0, 1, 2.5, -2]) {
      const at = (d: number) => ({ x: PLAY.cx + d * Math.cos(angle), z: PLAY.cz + d * Math.sin(angle) });
      expect(softWallAccel(at(149))).toEqual({ x: 0, z: 0 });
      for (const [d, accel] of [
        [155, 3],
        [160, 6],
        [170, 6],
      ]) {
        const a = softWallAccel(at(d));
        expect(a.x).toBeCloseTo(-accel * Math.cos(angle), 9);
        expect(a.z).toBeCloseTo(-accel * Math.sin(angle), 9);
      }
    }
  });
});
