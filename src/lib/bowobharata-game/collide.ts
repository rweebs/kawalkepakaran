// Collision for the chariot: its hull as three circles, contact resolution against the field's colliders, and the
// guard that stops it short of the ranks. Pure: no three.js, no DOM, no clock. Axis-aligned boxes and circles only,
// scanned linearly (at most 50 colliders × 3 circles per call).
import { clamp, forward, segPointDist, type XZ } from './geom';
import type { ChariotState, Guard } from './drive';
import { DRIVE, GUARD } from './tuning';
import { distToCollider, type Collider } from './world';

/** The hull: circles of radius r centred `offsets` m along the heading from the chariot's origin, rear to front. */
export const HULL = { offsets: [-0.4, 1.6, 3.6], r: 1.45 } as const;

export interface Circle {
  x: number;
  z: number;
  r: number;
}

type Box = Extract<Collider, { kind: 'box' }>;

/** Share of the speed along a struck surface that the chariot keeps. */
const SCRAPE_KEEP = 0.7;
/** Share of the speed into a struck surface that comes back out of it. */
const BOUNCE = 0.2;

export function hullCircles(x: number, z: number, yaw: number): Circle[] {
  const f = forward(yaw);
  return HULL.offsets.map((o) => ({ x: x + f.x * o, z: z + f.z * o, r: HULL.r }));
}

export function hullMid(s: { x: number; z: number; yaw: number }): XZ {
  const f = forward(s.yaw);
  return { x: s.x + f.x * HULL.offsets[1], z: s.z + f.z * HULL.offsets[1] };
}

/** The smallest gap between the hull and any of the colliders: negative when they overlap. */
export function hullClearance(x: number, z: number, yaw: number, cols: readonly Collider[]): number {
  let least = Infinity;
  for (const c of hullCircles(x, z, yaw)) {
    for (const col of cols) least = Math.min(least, distToCollider(c, col) - c.r);
  }
  return least;
}

/** How deep the circle sits in the collider and the unit normal that pushes it out; null when they do not overlap. */
export function circleContact(c: Circle, col: Collider): { depth: number; nx: number; nz: number } | null {
  if (col.kind === 'circle') {
    const dx = c.x - col.x;
    const dz = c.z - col.z;
    const d = Math.hypot(dx, dz);
    const depth = c.r + col.r - d;
    if (depth <= 0) return null;
    return d > 0 ? { depth, nx: dx / d, nz: dz / d } : { depth, nx: 1, nz: 0 };
  }
  const qx = clamp(c.x, col.minX, col.maxX);
  const qz = clamp(c.z, col.minZ, col.maxZ);
  const d = Math.hypot(c.x - qx, c.z - qz);
  if (d > 0) {
    const depth = c.r - d;
    return depth > 0 ? { depth, nx: (c.x - qx) / d, nz: (c.z - qz) / d } : null;
  }
  const face = nearestFace(c, col);
  return { depth: c.r + face.gap, nx: face.nx, nz: face.nz };
}

/** For a point inside the box: the nearest face, as the point's distance to it and the face's outward normal. */
function nearestFace(p: XZ, b: Box): { gap: number; nx: number; nz: number } {
  const faces = [
    { gap: p.x - b.minX, nx: -1, nz: 0 },
    { gap: b.maxX - p.x, nx: 1, nz: 0 },
    { gap: p.z - b.minZ, nx: 0, nz: -1 },
    { gap: b.maxZ - p.z, nx: 0, nz: 1 },
  ];
  return faces.reduce((a, f) => (f.gap < a.gap ? f : a));
}

export interface Contact {
  id: string;
  figure: boolean;
  /** The inbound speed along the contact normal, m/s (0 when the chariot was already moving out). */
  speed: number;
}

/**
 * Pushes the hull out of every collider it overlaps, in two passes (each pass: rear circle to front, colliders in
 * order). A push that meets an inbound normal speed vn < 0 leaves v = 0.7·v_t − 0.2·vn·n and cuts the throttle for
 * DRIVE.bumpHoldOff. Returns the contact with the largest inbound speed.
 */
export function resolveContacts(car: ChariotState, cols: readonly Collider[]): { car: ChariotState; contact: Contact | null } {
  const f = forward(car.yaw);
  let { x, z, vx, vz, holdOff } = car;
  let contact: Contact | null = null;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of HULL.offsets) {
      for (const col of cols) {
        const hit = circleContact({ x: x + f.x * o, z: z + f.z * o, r: HULL.r }, col);
        if (!hit) continue;
        x += hit.nx * hit.depth;
        z += hit.nz * hit.depth;
        const vn = vx * hit.nx + vz * hit.nz;
        if (vn < 0) {
          const tx = vx - vn * hit.nx;
          const tz = vz - vn * hit.nz;
          vx = SCRAPE_KEEP * tx - BOUNCE * vn * hit.nx;
          vz = SCRAPE_KEEP * tz - BOUNCE * vn * hit.nz;
          holdOff = DRIVE.bumpHoldOff;
        }
        const speed = Math.max(0, -vn);
        if (!contact || speed > contact.speed) contact = { id: col.id, figure: col.figure, speed };
      }
    }
  }
  return { car: contact ? { ...car, x, z, vx, vz, holdOff } : car, contact };
}

/** The closing speed (m/s) from which the guard can still stop the hull GUARD.stop m short, `d` m from a figure. */
export function guardCap(d: number): number {
  return Math.sqrt(2 * GUARD.decel * Math.max(0, d - GUARD.stop));
}

/** Whether the ray from o along (dx, dz) meets the box (slab test); a ray starting inside meets it at once. */
function rayMeetsBox(o: XZ, dx: number, dz: number, b: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean {
  let near = 0;
  let far = Infinity;
  for (const [p, d, lo, hi] of [
    [o.x, dx, b.minX, b.maxX],
    [o.z, dz, b.minZ, b.maxZ],
  ]) {
    if (d === 0) {
      if (p < lo || p > hi) return false;
      continue;
    }
    const t1 = (lo - p) / d;
    const t2 = (hi - p) / d;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
  }
  return near <= far;
}

/**
 * The normal (out of the box) and gap d the guard uses for one hull circle, or null when it does not act. In the
 * box's x-slab or z-slab the normal is that face's axis. In a corner region it acts only when the ray along v meets
 * the box grown by the hull radius plus the stop distance (grown square, like the zones), with the normal from the
 * nearest corner.
 */
function guardNormal(c: XZ, b: Box, vx: number, vz: number): { nx: number; nz: number; d: number } | null {
  const inX = c.x >= b.minX && c.x <= b.maxX;
  const inZ = c.z >= b.minZ && c.z <= b.maxZ;
  let nx = 0;
  let nz = 0;
  let gap: number;
  if (inX && inZ) {
    // Inside the box: the nearest face, at a negative gap.
    const face = nearestFace(c, b);
    ({ nx, nz } = face);
    gap = -face.gap;
  } else if (inX) {
    nz = c.z < b.minZ ? -1 : 1;
    gap = nz < 0 ? b.minZ - c.z : c.z - b.maxZ;
  } else if (inZ) {
    nx = c.x < b.minX ? -1 : 1;
    gap = nx < 0 ? b.minX - c.x : c.x - b.maxX;
  } else {
    const qx = c.x < b.minX ? b.minX : b.maxX;
    const qz = c.z < b.minZ ? b.minZ : b.maxZ;
    gap = Math.hypot(c.x - qx, c.z - qz);
    nx = (c.x - qx) / gap;
    nz = (c.z - qz) / gap;
  }
  const d = gap - HULL.r;
  if (d > GUARD.range) return null;
  if (!inX && !inZ) {
    const g = HULL.r + GUARD.stop;
    const grown = { minX: b.minX - g, maxX: b.maxX + g, minZ: b.minZ - g, maxZ: b.maxZ + g };
    if (!rayMeetsBox(c, vx, vz, grown)) return null;
  }
  return { nx, nz, d };
}

/** Passes over the (hull circle, figure) pairs before the guard scales the velocity down instead. */
const GUARD_PASSES = 32;
/** A pass whose largest removal is no more than this (m/s) has settled every pair. */
const SETTLED = 1e-12;

/**
 * One pass over the (hull circle, box) pairs, rear circle to front and boxes in order: each pair's closing speed
 * −v·n above guardCap(d) is removed along n before the next pair is checked. Returns the velocity left and the
 * largest removal.
 */
function settlePass(circles: readonly Circle[], boxes: readonly Box[], vx: number, vz: number) {
  let most = 0;
  for (const c of circles) {
    for (const b of boxes) {
      const g = guardNormal(c, b, vx, vz);
      if (!g) continue;
      const excess = -(vx * g.nx + vz * g.nz) - guardCap(g.d);
      if (excess <= 0) continue;
      most = Math.max(most, excess);
      vx += excess * g.nx;
      vz += excess * g.nz;
    }
  }
  return { vx, vz, most };
}

/**
 * At velocity v, changing nothing: the largest excess of any pair's closing speed over guardCap(d), and λ, the
 * smallest guardCap(d) / closing speed over the pairs in excess (1 when none is). λ·v leaves no pair in excess.
 */
function excessAt(circles: readonly Circle[], boxes: readonly Box[], vx: number, vz: number) {
  let most = 0;
  let lambda = 1;
  for (const c of circles) {
    for (const b of boxes) {
      const g = guardNormal(c, b, vx, vz);
      if (!g) continue;
      const closing = -(vx * g.nx + vz * g.nz);
      const cap = guardCap(g.d);
      if (closing <= cap) continue;
      most = Math.max(most, closing - cap);
      lambda = Math.min(lambda, cap / closing);
    }
  }
  return { most, lambda };
}

/**
 * The guard at the ranks, over the figure boxes.
 * - `cap` limits each hull circle's closing speed −v·n on each box within GUARD.range to guardCap(d), removing the
 *   excess along n. Across the corridor the two armies' normals oppose, so one pair's removal can reopen another's.
 *   So it repeats the pass until no pair removes more than SETTLED, for at most GUARD_PASSES passes. If a pair is
 *   still in excess after that, it scales v by λ (see excessAt); a λ above 0 keeps v's direction and with it every
 *   corner-ray result. Only if a pair is still in excess after that does it stop the chariot (every pair accepts
 *   v = 0, since guardCap ≥ 0). `removed` is the size of the change it made, |v_in − v_out|.
 * - `blocksTurn` refuses a turn that leaves the hull under GUARD.stop from a figure and closer than before.
 * Every figure must be a box: any other shape throws rather than go unguarded.
 */
export function figureGuard(figures: readonly Collider[]): Guard {
  const boxes = figures.map((c): Box => {
    if (c.kind !== 'box') throw new Error(`figureGuard: figure "${c.id}" is a ${c.kind}; the guard covers only boxes`);
    return c;
  });
  return {
    cap(x, z, yaw, vxIn, vzIn) {
      const circles = hullCircles(x, z, yaw);
      const result = (vx: number, vz: number) => ({ vx, vz, removed: Math.hypot(vxIn - vx, vzIn - vz) });
      let vx = vxIn;
      let vz = vzIn;
      for (let pass = 0; pass < GUARD_PASSES; pass++) {
        const p = settlePass(circles, boxes, vx, vz);
        ({ vx, vz } = p);
        if (p.most <= SETTLED) return result(vx, vz);
      }
      const left = excessAt(circles, boxes, vx, vz);
      if (left.most <= SETTLED) return result(vx, vz);
      vx *= left.lambda;
      vz *= left.lambda;
      if (excessAt(circles, boxes, vx, vz).most <= SETTLED) return result(vx, vz);
      return result(0, 0);
    },
    blocksTurn(x, z, fromYaw, toYaw) {
      const after = hullClearance(x, z, toYaw, figures);
      return after < GUARD.stop && after < hullClearance(x, z, fromYaw, figures);
    },
  };
}

/** Whether the path from a to b passes within r of c. */
export function sweptHit(a: XZ, b: XZ, c: XZ, r: number): boolean {
  return segPointDist(c, a, b) <= r;
}

const cross = (o: XZ, a: XZ, b: XZ) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** Whether segment ab crosses segment pq: each one's ends lie strictly on opposite sides of the other. */
export function crossesSegment(a: XZ, b: XZ, p: XZ, q: XZ): boolean {
  return cross(p, q, a) * cross(p, q, b) < 0 && cross(a, b, p) * cross(a, b, q) < 0;
}
