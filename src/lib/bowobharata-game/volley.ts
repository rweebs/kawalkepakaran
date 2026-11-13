// Volleys: arcs of arrows that land beside the chariot's path as pressure, and never on anyone. A volley is planned
// 2.6 s before it lands (warned 1 s, then 1.6 s in the air) on a 2.5 m patch 11–18 m ahead of where the chariot will
// be and 5–8 m to one side of it. Its arrows fall from 22 m up and 45 m back toward the nearest source: a watch post,
// the gate or the Kurawa front. A landing keeps clear of the ranks, the other colliders, the shelters, the record
// circle and the route; the last 6.5 m of the flight (on flat ground, all of it below 6 m) keeps clear of the ranks
// and the tall colliders. Pure and seeded: the only randomness is the stored rng state, stepped with nextRand. Units
// are metres and seconds; north is −z.
import { arrowArc, groundHeight } from '../bowobharata/stage-math';
import { dist, forward, nextRand, polylineDist, rightOf, segPointDist, type XZ } from './geom';
import { hullCircles, type Circle } from './collide';
import type { ChariotState } from './drive';
import { VOLLEY } from './tuning';
import { ANCHORS, PLAY, POSTS, RECORD_CIRCLE, distToCollider, inPlay, type Area, type Collider, type Zone } from './world';

export interface Volley {
  id: number;
  /** The landing centre. */
  to: XZ;
  /** The unit vector from `to` toward the nearest source: the arrows fly in along −u. */
  u: XZ;
  /** The origin: `to` + u·45, 22 m above the ground at `to`. */
  from: { x: number; y: number; z: number };
  /** When it was planned; with sight on, its telegraph shows from then. */
  planned: number;
  /** When the warning ends and the arrows leave. */
  t0: number;
  /** Seconds in the air: it lands at t0 + flight. */
  flight: number;
  arrows: number;
  state: 'warn' | 'air' | 'landed' | 'absorbed';
  /** Leaves a rewritten copy where it lands. */
  decoy: boolean;
  /** Leaves haze where it lands. */
  cloud: boolean;
}

export interface Cloud {
  id: number;
  at: XZ;
  r: number;
  born: number;
  /** Seconds it lasts; null for haze that stays (the scripted kind). */
  life: number | null;
}

export interface VolleyWorld {
  colliders: readonly Collider[];
  zones: readonly Zone[];
  mobile: boolean;
}

type Box = Extract<Collider, { kind: 'box' }>;

/** The Kurawa front: the west face of its army zone. */
const FRONT_X = 2.96;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Seconds from planning to landing. */
const LEAD = VOLLEY.warn + VOLLEY.flight;
/** A landing stays inside the soft wall, 10 m in from the disc's edge. */
const PLAY_MARGIN = PLAY.r - PLAY.wall;

/** Where volleys come from: the six watch posts, the gate, and (2.96, 15 − 10k) for k = 0…6 along the Kurawa front. */
export function volleySources(): XZ[] {
  const front = Array.from({ length: 7 }, (_, k) => ({ x: FRONT_X, z: 15 - 10 * k }));
  return [...POSTS, ANCHORS.gate, ...front].map((p) => ({ x: p.x, z: p.z }));
}

const SOURCES = volleySources();

/** The unit vector from p toward the nearest source: ties go to the first listed, and a source at p itself is passed over. */
function towardSource(p: XZ): XZ {
  let best = SOURCES[0];
  let bestD = Infinity;
  for (const s of SOURCES) {
    const d = dist(s, p);
    if (d > 0 && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return { x: (best.x - p.x) / bestD, z: (best.z - p.z) / bestD };
}

function offset(k: number, n: number): XZ {
  const r = VOLLEY.spread * Math.sqrt((k + 0.5) / n);
  const f = forward(k * GOLDEN);
  return { x: r * f.x, z: r * f.z };
}

/**
 * Each arrow's offset from the landing centre, a golden-angle spiral: arrow k lies spread·√((k + 0.5)/n) out at the
 * yaw k·137.5° (forward(k·golden), turning from east toward north).
 */
export function arrowOffsets(n: number): XZ[] {
  return Array.from({ length: n }, (_, k) => offset(k, n));
}

/** The clearance a landing centre keeps from the collider: the arrows' own, plus the patch's radius. */
const clearOf = (c: Collider): number => (c.figure ? VOLLEY.figureClear : VOLLEY.colliderClear) + VOLLEY.spread;

/** How far p lies outside the area: negative inside, by the depth to its edge. */
function outside(p: XZ, a: Area): number {
  if (a.kind === 'circle') return dist(p, a) - a.r;
  const dx = Math.max(a.minX - p.x, 0, p.x - a.maxX);
  const dz = Math.max(a.minZ - p.z, 0, p.z - a.maxZ);
  if (dx > 0 || dz > 0) return Math.hypot(dx, dz);
  return -Math.min(p.x - a.minX, a.maxX - p.x, p.z - a.minZ, a.maxZ - p.z);
}

/** Whether the segment ab meets the box: the slab test over t ∈ [0, 1]. */
function segMeetsBox(a: XZ, b: XZ, c: Box): boolean {
  let near = 0;
  let far = 1;
  for (const [p, d, lo, hi] of [
    [a.x, b.x - a.x, c.minX, c.maxX],
    [a.z, b.z - a.z, c.minZ, c.maxZ],
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

/** The least distance from the segment ab to the collider's edge: 0 or less when they meet. */
function segToCollider(a: XZ, b: XZ, c: Collider): number {
  if (c.kind === 'circle') return segPointDist(c, a, b) - c.r;
  if (segMeetsBox(a, b, c)) return 0;
  // Apart, the nearest pair holds an end of the segment or a corner of the box.
  let least = Math.min(distToCollider(a, c), distToCollider(b, c));
  for (const x of [c.minX, c.maxX]) for (const z of [c.minZ, c.maxZ]) least = Math.min(least, segPointDist({ x, z }, a, b));
  return least;
}

/**
 * Whether a volley may land at `to`, flying in from along u. Every arrow lands within the 2.5 m patch, so the centre
 * keeps 2.5 m more than each clearance. True when all hold:
 * - `to` is 10 m inside the play disc;
 * - it is 3 + 2.5 m from the army zones (the figure colliders) and 1.5 + 2.5 m from every other collider;
 * - it is 2.5 m outside every shelter and the record circle;
 * - it is 5 m from the route, when there is one;
 * - the last 6.5 m toward the origin (on flat ground, all the flight below 6 m) keeps 3 + 2.5 m from the army zones
 *   and 1.5 + 2.5 m from the tall colliders.
 */
export function landingOk(to: XZ, u: XZ, w: VolleyWorld, route: readonly XZ[] | null): boolean {
  if (!inPlay(to, PLAY_MARGIN)) return false;
  for (const c of w.colliders) if (distToCollider(to, c) < clearOf(c)) return false;
  for (const z of w.zones) if (z.role === 'shelter' && outside(to, z.area) < VOLLEY.spread) return false;
  if (dist(to, ANCHORS.tower) < RECORD_CIRCLE + VOLLEY.spread) return false;
  if (route && polylineDist(to, route) < VOLLEY.routeClear) return false;
  const low = { x: to.x + u.x * VOLLEY.lowTrack, z: to.z + u.z * VOLLEY.lowTrack };
  for (const c of w.colliders) if ((c.figure || c.tall) && segToCollider(to, low, c) < clearOf(c)) return false;
  return true;
}

function volleyAt(to: XZ, u: XZ, t: number, w: VolleyWorld, o: { id: number; decoy: boolean; cloud: boolean }): Volley {
  return {
    id: o.id,
    to: { x: to.x, z: to.z },
    u,
    from: { x: to.x + u.x * VOLLEY.originBack, y: groundHeight(to.x, to.z) + VOLLEY.originUp, z: to.z + u.z * VOLLEY.originBack },
    planned: t,
    t0: t + VOLLEY.warn,
    flight: VOLLEY.flight,
    arrows: w.mobile ? VOLLEY.arrowsMobile : VOLLEY.arrows,
    state: 'warn',
    decoy: o.decoy,
    cloud: o.cloud,
  };
}

/**
 * Plans a volley at time t to land 2.6 s later beside where the chariot will be: at car + velocity·2.6 +
 * forward·(11–18) + rightOf·side·(5–8). Each of up to 6 tries draws, from the rng in this order, the distance ahead,
 * the side (+1, the right, when the draw is below 0.5; −1 otherwise) and the distance to that side, and keeps the
 * first aim that passes landingOk. Returns null when none does, and the rng state after every draw made.
 */
export function planVolley(
  car: ChariotState,
  t: number,
  rng: number,
  w: VolleyWorld,
  o: { decoy: boolean; cloud: boolean; id: number; route: readonly XZ[] | null },
): { volley: Volley | null; rng: number } {
  const f = forward(car.yaw);
  const r = rightOf(car.yaw);
  const px = car.x + car.vx * LEAD;
  const pz = car.z + car.vz * LEAD;
  let state = rng;
  const draw = (lo: number, hi: number): number => {
    const next = nextRand(state);
    state = next.a;
    return lo + (hi - lo) * next.v;
  };
  for (let k = 0; k < VOLLEY.retries; k++) {
    const ahead = draw(VOLLEY.aheadMin, VOLLEY.aheadMax);
    const side = draw(0, 1) < 0.5 ? 1 : -1;
    const lateral = side * draw(VOLLEY.sideMin, VOLLEY.sideMax);
    const to = { x: px + f.x * ahead + r.x * lateral, z: pz + f.z * ahead + r.z * lateral };
    const u = towardSource(to);
    if (landingOk(to, u, w, o.route)) return { volley: volleyAt(to, u, t, w, o), rng: state };
  }
  return { volley: null, rng: state };
}

/** A volley planned at t to land at `to`, unchecked (the lakon data keeps it clear): it leaves a copy and no haze. */
export function scriptedVolley(to: XZ, t: number, id: number, w: VolleyWorld): Volley {
  return volleyAt(to, towardSource(to), t, w, { id, decoy: true, cloud: false });
}

/** Arrow k of the volley at s (0 at the origin, 1 landed): from + offset_k to (to + offset_k) on the ground, 6 m arc. */
export function arrowPoint(v: Volley, k: number, s: number, ground: (x: number, z: number) => number): { x: number; y: number; z: number } {
  const o = offset(k, v.arrows);
  const x = v.to.x + o.x;
  const z = v.to.z + o.z;
  return arrowArc(s, { x: v.from.x + o.x, y: v.from.y, z: v.from.z + o.z }, { x, y: ground(x, z), z }, VOLLEY.arcHeight);
}

/**
 * The volleys at time t. Each is 'warn' until t0, 'air' until t0 + flight, then 'landed', or 'absorbed' when its
 * landing centre lies within 7 m of a hull circle centre of the car at that step. `launched`, `landed` and `absorbed`
 * hold the volleys that changed so this step (one frame can launch and land a volley). `volleys` keeps the order and
 * drops each volley when it is done: an absorbed one at once, a landed one once its arrows have stood and sunk
 * (t0 + flight + 12 + 0.6).
 */
export function stepVolleys(
  vs: readonly Volley[],
  car: ChariotState,
  t: number,
): { volleys: Volley[]; launched: Volley[]; landed: Volley[]; absorbed: Volley[] } {
  const volleys: Volley[] = [];
  const launched: Volley[] = [];
  const landed: Volley[] = [];
  const absorbed: Volley[] = [];
  let hull: Circle[] | null = null;
  for (const v of vs) {
    const lands = v.t0 + v.flight;
    if (v.state === 'absorbed') continue;
    if (v.state === 'landed') {
      if (t < lands + VOLLEY.stand + VOLLEY.sink) volleys.push(v);
      continue;
    }
    let state: Volley['state'] = v.state === 'warn' && t < v.t0 ? 'warn' : 'air';
    if (t >= lands) {
      hull ??= hullCircles(car.x, car.z, car.yaw);
      state = hull.some((c) => dist(c, v.to) <= VOLLEY.absorbR) ? 'absorbed' : 'landed';
    }
    if (state === v.state) {
      volleys.push(v);
      continue;
    }
    const next: Volley = { ...v, state };
    if (v.state === 'warn') launched.push(next);
    if (state === 'absorbed') absorbed.push(next);
    else volleys.push(next);
    if (state === 'landed') landed.push(next);
  }
  return { volleys, launched, landed, absorbed };
}

/** When the landing's telegraph shows: 1.4 s before it lands, or from the moment it was planned with sight on. */
export function telegraphAt(v: Volley, sight: boolean): number {
  return sight ? v.planned : v.t0 + v.flight - VOLLEY.telegraph;
}

/** Whether p lies within haze at time t: within r of a cloud while born ≤ t < born + life (always, once born, with no life). */
export function inCloud(p: XZ, clouds: readonly Cloud[], t: number): boolean {
  return clouds.some((c) => t >= c.born && (c.life === null || t < c.born + c.life) && dist(p, c.at) <= c.r);
}
