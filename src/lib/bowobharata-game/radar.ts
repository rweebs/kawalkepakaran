// The radar: the field round the chariot for the HUD, heading-up. Every place is a point on a square `px` wide (the
// radar's SVG viewBox): the chariot at its centre, the way it faces up, its right to the right, and radarRange(v) m out
// at the inner radius px/2 − RIM. A place farther out is clamped to that radius, along its bearing.
// It shows the ranks and the shelters, the route ahead, the copies (only in Krishna's sight, and never in roam), the
// tower, and what the lakon leads to: the marker in roam, the open records, the real gates of the next GATE_DAYS days
// of a course (and any ridden past and still open), the next two lap posts, and the Hastinapura gate while the letter
// is carried. At a Riuh level with radar static, nothing shows beyond (1 − static) of the inner radius unless sight is
// on: what lies there is left out, and the route and the ranks' outlines are cut there. The range follows the speed
// through a 1 s lag (easeRange, carried from one HUD snapshot to the next), so the edge moves smoothly: a place at it
// crosses it once as the speed ramps, and a wobbling speed barely moves it. Given the last snapshot's items, a place
// that was not shown appears only HOLD m within the edge, while one that was shown stays up to it: what grazes the edge
// does not flicker, and nothing ever shows past it. Positions, kinds and metres only: no text. Pure: no clock, no
// randomness.
import { clamp, dist, forward, rightOf, type XZ } from './geom';
import { speedOf } from './drive';
import { openTargets, type RunState } from './mission-run';
import { across } from './missions';
import { levelEffects, riuhLevel } from './riuh';
import { pointAt, projectOnPath } from './route';
import { ANCHORS, distToCollider, type Area, type Collider } from './world';
import type { GameState, World } from './engine';

export type RadarKind = 'marker' | 'replay' | 'record' | 'gate' | 'tower' | 'shelter' | 'ranks' | 'route' | 'decoy' | 'post';

/** One thing on the radar, in px on its square. */
export interface RadarItem {
  kind: RadarKind;
  /**
   * Where it lies, clamped to the inner radius. The ranks: their block's nearest point to the chariot (the chariot's own
   * place inside the block), always within the radius shown, never clamped. The route: where its line ends.
   */
  x: number;
  y: number;
  /** Beyond the range, so drawn at the inner radius; for the route, its line is cut short of its end. */
  clamped: boolean;
  /** Metres from the chariot: to the ranks' block (0 inside it), to the route's end. */
  dist: number;
  /**
   * The ranks: their block's outline as a closed polygon, cut to the radius shown (the static's inner edge,
   * (px/2 − 8)·(1 − static), while the static shows and sight is off; else the inner radius px/2 − 8), following that
   * circle in arcs of at most 15° where the block runs past it: every point lies within it. Its four corners when the
   * block lies wholly within; fewer than 3 points only when the block just touches the edge. The route: its line, within
   * the same radius.
   */
  points?: { x: number; y: number }[];
  /**
   * What it is, the same from one snapshot to the next: its kind and the lakon's id for it (`record:A`, `gate:D3L`,
   * `post:P2-1`, `decoy:7`, `shelter:camp`, `ranks:army-dharma`), or just `tower`, `marker` or `route`.
   */
  key?: string;
}

/** The radar's square (px): its SVG viewBox; CSS may scale it. */
export const RADAR_PX = 148;
/** The band (px) between the inner radius and the square's edge. */
const RIM = 8;
/** The route shows at most this many points. */
export const ROUTE_POINTS = 12;
/** A course shows the real gates of this many days ahead. */
export const GATE_DAYS = 3;
/** The most copies shown: as many as the scene draws. */
const MAX_COPIES = 64;
/** The range at rest (m), and what each m/s of speed either way adds. */
const RANGE = { rest: 70, perSpeed: 2.2 } as const;
/** The time constant (s) of the lag the range shown follows the speed's range with. */
export const RANGE_LAG = 1;
/** A place not shown in the last snapshot appears this far (m) within the edge; one shown stays up to the edge. */
export const HOLD = 1;
/** A cut outline follows the circle in arcs of at most this (radians). */
const ARC_STEP = Math.PI / 12;
/** A move this far (px) or farther is a change to the eye. */
const SHOWN_MOVE = 1;

/** The radar's range (m) at forward speed v (m/s), either way: 70 m at rest, 107.4 m at 17 m/s, 125 m at 25 m/s. */
export function radarRange(v: number): number {
  return RANGE.rest + RANGE.perSpeed * (Number.isFinite(v) ? Math.abs(v) : 0);
}

/**
 * The range shown (m) `dt` real seconds after `shown`, easing toward `target` (radarRange of the speed) with the time
 * constant RANGE_LAG: a first-order low-pass. A ramp of speed moves it one way only; a wobble barely moves it. No time
 * passed, no change; `shown` not a number, the target.
 */
export function easeRange(shown: number, target: number, dt: number): number {
  if (!Number.isFinite(shown)) return target;
  if (!(dt > 0)) return shown;
  return shown + (target - shown) * (1 - Math.exp(-dt / RANGE_LAG));
}

type Pose = { x: number; z: number; yaw: number };
type Px = { x: number; y: number };

/** The chariot's frame on the radar: where it stands, its forward and right, the square's centre, the inner radius. */
interface Frame {
  x: number;
  z: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  c: number;
  r: number;
  range: number;
}

function frameOf(car: Pose, range: number, px: number): Frame {
  const f = forward(car.yaw);
  const right = rightOf(car.yaw);
  const c = px / 2;
  return { x: car.x, z: car.z, fx: f.x, fz: f.z, rx: right.x, rz: right.z, c, r: c - RIM, range };
}

/** p on the radar, not clamped. */
function spot(f: Frame, p: XZ): Px {
  const dx = p.x - f.x;
  const dz = p.z - f.z;
  const ahead = dx * f.fx + dz * f.fz;
  const side = dx * f.rx + dz * f.rz;
  return { x: f.c + (side * f.r) / f.range, y: f.c - (ahead * f.r) / f.range };
}

/** p on the radar, clamped to the inner radius. */
function place(f: Frame, p: XZ): Px & { clamped: boolean } {
  const s = spot(f, p);
  const u = s.x - f.c;
  const v = s.y - f.c;
  const len = Math.hypot(u, v);
  if (len <= f.r) return { x: s.x, y: s.y, clamped: false };
  return { x: f.c + (u * f.r) / len, y: f.c + (v * f.r) / len, clamped: true };
}

/** Where p lies on a radar `px` square round `car`, out to `range` m: heading-up, clamped to the inner radius px/2 − 8. */
export function radarPoint(p: XZ, car: Pose, range: number, px: number): { x: number; y: number; clamped: boolean } {
  return place(frameOf(car, range, px), p);
}

const pointItem = (kind: RadarKind, key: string, f: Frame, at: XZ, d: number): RadarItem => {
  const q = place(f, at);
  return { kind, x: q.x, y: q.y, clamped: q.clamped, dist: d, key };
};

function areaMid(a: Area): XZ {
  return a.kind === 'circle' ? { x: a.x, z: a.z } : { x: (a.minX + a.maxX) / 2, z: (a.minZ + a.maxZ) / 2 };
}

/** The collider's nearest point to p, the one distToCollider measures to: p itself inside it. */
function nearestPoint(c: Collider, p: XZ): XZ {
  if (c.kind === 'box') return { x: clamp(p.x, c.minX, c.maxX), z: clamp(p.z, c.minZ, c.maxZ) };
  const d = Math.hypot(p.x - c.x, p.z - c.z);
  if (d <= c.r) return { x: p.x, z: p.z };
  return { x: c.x + ((p.x - c.x) * c.r) / d, z: c.z + ((p.z - c.z) * c.r) / d };
}

/** The way round the polygon runs, from the sign of its area: +1 as angles grow (atan2 on x and y), −1 as they fall. */
function turnOf(poly: readonly Px[]): number {
  let a = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a < 0 ? -1 : 1;
}

/** Whether the convex polygon holds the point (c, c). */
function holdsCentre(poly: readonly Px[], c: number, turn: number): boolean {
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    if (turn * ((q.x - p.x) * (c - p.y) - (q.y - p.y) * (c - p.x)) < 0) return false;
  }
  return true;
}

/** The points within the arc of radius r round (c, c) from `from` to `to`, running `turn` (+1 as angles grow). */
function arcBetween(from: Px, to: Px, c: number, r: number, turn: number): Px[] {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 1e-9) return [];
  const a0 = Math.atan2(from.y - c, from.x - c);
  const a1 = Math.atan2(to.y - c, to.x - c);
  let sweep = (turn > 0 ? a1 - a0 : a0 - a1) % (2 * Math.PI);
  if (sweep < 0) sweep += 2 * Math.PI;
  const steps = Math.ceil(sweep / ARC_STEP);
  const out: Px[] = [];
  for (let j = 1; j < steps; j++) {
    const a = a0 + (turn * sweep * j) / steps;
    out.push({ x: c + r * Math.cos(a), y: c + r * Math.sin(a) });
  }
  return out;
}

/** The whole circle of radius r round (c, c), a point every ARC_STEP. */
function ringOf(c: number, r: number): Px[] {
  const n = Math.round((2 * Math.PI) / ARC_STEP);
  return Array.from({ length: n }, (_, j) => {
    const a = (2 * Math.PI * j) / n;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
}

/**
 * The convex polygon cut to the circle of radius r round (c, c): its corners within the circle, the points where its
 * sides cross it, and from each point where it leaves the circle to the next where it comes back in, the circle's own
 * arc. Every point lies within the circle. The whole circle when the polygon holds it; none when they do not meet.
 */
function clipToCircle(poly: readonly Px[], c: number, r: number): Px[] {
  const within = (p: Px) => Math.hypot(p.x - c, p.y - c) <= r;
  const turn = turnOf(poly);
  const marks: { p: Px; leaves: boolean }[] = [];
  let crossings = 0;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const aIn = within(a);
    const bIn = within(b);
    if (aIn) marks.push({ p: a, leaves: false });
    if (aIn && bIn) continue;
    // Where the side a→b, a + t(b − a), meets the circle: the roots of qa·t² + 2qb·t + qc.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ox = a.x - c;
    const oy = a.y - c;
    const qa = dx * dx + dy * dy;
    const qb = ox * dx + oy * dy;
    const qc = ox * ox + oy * oy - r * r;
    const disc = qb * qb - qa * qc;
    if (qa === 0 || disc <= 0) continue;
    const t0 = (-qb - Math.sqrt(disc)) / qa;
    const t1 = (-qb + Math.sqrt(disc)) / qa;
    const on = (t: number): Px => {
      const u = Math.min(1, Math.max(0, t));
      return { x: a.x + dx * u, y: a.y + dy * u };
    };
    if (aIn) marks.push({ p: on(t1), leaves: true });
    else if (bIn) marks.push({ p: on(t0), leaves: false });
    else if (t0 > 0 && t1 < 1) marks.push({ p: on(t0), leaves: false }, { p: on(t1), leaves: true });
    else continue;
    crossings++;
  }
  if (crossings === 0) {
    if (marks.length > 0) return marks.map((m) => m.p);
    return holdsCentre(poly, c, turn) ? ringOf(c, r) : [];
  }
  const out: Px[] = [];
  marks.forEach((m, k) => {
    if (out.length === 0 || Math.hypot(m.p.x - out[out.length - 1].x, m.p.y - out[out.length - 1].y) > 1e-9) out.push(m.p);
    if (m.leaves) out.push(...arcBetween(m.p, marks[(k + 1) % marks.length].p, c, r, turn));
  });
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-9) out.pop();
  return out;
}

/**
 * An army as the radar draws it: anchored at its nearest point to the chariot, its block's outline cut to the circle of
 * `edge` px (a round one is a point).
 */
function ranksItem(f: Frame, c: Collider, key: string, car: XZ, d: number, edge: number): RadarItem {
  const item = pointItem('ranks', key, f, nearestPoint(c, car), d);
  if (c.kind === 'box') {
    const corners = [
      spot(f, { x: c.minX, z: c.minZ }),
      spot(f, { x: c.maxX, z: c.minZ }),
      spot(f, { x: c.maxX, z: c.maxZ }),
      spot(f, { x: c.minX, z: c.maxZ }),
    ];
    item.points = clipToCircle(corners, f.c, edge);
  }
  return item;
}

/** The point where the segment from `a` (within `r` of `o`) to `b` (beyond it) crosses the circle of radius r round o. */
function exitPoint(a: XZ, b: XZ, o: XZ, r: number): XZ {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ax = a.x - o.x;
  const az = a.z - o.z;
  const qa = dx * dx + dz * dz;
  const qb = ax * dx + az * dz;
  const qc = ax * ax + az * az - r * r;
  const t = qa > 0 ? (-qb + Math.sqrt(Math.max(0, qb * qb - qa * qc))) / qa : 0;
  const u = Math.min(1, Math.max(0, t));
  return { x: a.x + dx * u, z: a.z + dz * u };
}

/**
 * The route ahead as one item: from the chariot's place along it (the corners behind it left out) to its end, cut where
 * it first goes beyond `reach` m of the chariot and after ROUTE_POINTS points. None when nothing of it lies ahead within
 * reach.
 */
function routeItem(route: readonly XZ[], f: Frame, car: XZ, reach: number): RadarItem | null {
  if (route.length < 2) return null;
  const { along } = projectOnPath(route, car);
  const first = pointAt(route, along);
  if (dist(car, first) > reach) return null;
  const line: XZ[] = [first];
  let cut = false;
  let run = 0;
  for (let k = 1; k < route.length; k++) {
    run += dist(route[k - 1], route[k]);
    if (run <= along) continue;
    if (line.length === ROUTE_POINTS) {
      cut = true;
      break;
    }
    const p = route[k];
    if (dist(car, p) > reach) {
      line.push(exitPoint(line[line.length - 1], p, car, reach));
      cut = true;
      break;
    }
    line.push(p);
  }
  if (line.length < 2) return null;
  const points = line.map((p) => spot(f, p));
  const end = points[points.length - 1];
  return { kind: 'route', x: end.x, y: end.y, clamped: cut, dist: dist(car, route[route.length - 1]), points, key: 'route' };
}

type Show = (kind: RadarKind, key: string, at: XZ) => void;

/**
 * What the lakon leads to, as openTargets has it: the marker in roam; the open records; the next lap posts; the
 * Hastinapura gate while the letter is carried (the tower is always on the radar). A course's aims give way to its real
 * gates: those of the next GATE_DAYS days still open, and any ridden past and still open. A failed run reads as active,
 * as in the scene: its records stay out through the fail shot. Returns the item the route leads to (the first open
 * target's), or null when none is drawn there: a course's lane, or a day whose real gate is already recorded.
 */
function lakonItems(s: GameState, show: Show): { key: string; at: XZ } | null {
  const run: RunState = s.run.phase === 'failed' ? { ...s.run, phase: 'active' } : s.run;
  const step = run.def.steps[run.step];
  const targets = openTargets(run);
  let leads: { key: string; at: XZ } | null = null;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k];
    let kind: RadarKind | null = null;
    if (t.kind === 'marker') kind = 'marker';
    else if (t.kind === 'pickup') kind = 'record';
    else if (t.kind === 'post') kind = 'post';
    else if (t.kind === 'reach' && step?.kind === 'reach' && step.place === 'gate') kind = 'gate';
    else if (t.kind === 'reach' && k === 0) leads = { key: 'tower', at: t.at };
    if (!kind) continue;
    const key = kind === 'marker' ? 'marker' : `${kind}:${t.id}`;
    show(kind, key, t.at);
    if (k === 0) leads = { key, at: t.at };
  }
  if (step?.kind !== 'course' || (run.phase !== 'intro' && run.phase !== 'active')) return leads;
  // The route leads to the first target: the next day's aim, or a gate ridden past. A real gate standing there is it.
  const aim = targets[0]?.at;
  const last = Math.min(run.dayIndex + GATE_DAYS, step.days.length);
  for (let k = 0; k < last; k++) {
    const day = step.days[k];
    for (const g of day.gates) {
      if (!g.real || run.recorded.includes(g.id)) continue;
      const at = across(day.at, day.heading, g.offset);
      show('gate', `gate:${g.id}`, at);
      if (aim && at.x === aim.x && at.z === aim.z) leads = { key: `gate:${g.id}`, at };
    }
  }
  return leads;
}

/**
 * What the radar shows, on a square `px` wide out to `range` m (the range shown: by default the speed's, radarRange;
 * the HUD passes its eased one), in drawing order: the ranks (each army whose block reaches within the radius shown),
 * the shelters, the route ahead, the copies (in sight, outside roam, open and within the radius shown), the tower, then
 * what the lakon leads to. The ranks and copies show only within the radius shown; everything else stays at the inner
 * radius when beyond the range. With static (riuhLevel's radarStatic) and sight off, the radius shown is (1 − static)
 * of the range: nothing beyond it shows. One edge for everything: what shows, the route's cut and the ranks' outlines.
 * Given `prev`, the last snapshot's items, a place within the edge that `prev` did not show appears only from HOLD m
 * within it, by its key: the edge holds still for a place grazing it. A route that is not cut ends on what it leads to,
 * shown. Bounded by the lakon's data and MAX_COPIES; nothing is sorted.
 */
export function radarItems(
  s: GameState,
  w: World,
  px: number,
  range = radarRange(speedOf(s.car)),
  prev?: readonly RadarItem[],
): RadarItem[] {
  const { car } = s;
  const f = frameOf(car, range, px);
  const sight = s.sight.on;
  const fog = sight ? 0 : levelEffects(riuhLevel(s.riuh.value)).radarStatic;
  /** The radius shown (m): the range, or the static's inner edge while the static shows and sight is off. */
  const edge = (1 - fog) * range;
  const was = prev ? new Set(prev.map((i) => i.key)) : null;
  /** Whether a place `d` m off is within the edge: up to it when it was shown before (or nothing was), else HOLD m in. */
  const within = (key: string, d: number) => d <= (was === null || was.has(key) ? edge : edge - HOLD);
  const places: RadarItem[] = [];
  const shown = new Set<string>();
  const show: Show = (kind, key, at) => {
    const d = dist(car, at);
    if (fog > 0 && !within(key, d)) return;
    places.push(pointItem(kind, key, f, at, d));
    shown.add(key);
  };
  show('tower', 'tower', ANCHORS.tower);
  const leads = lakonItems(s, show);

  const out: RadarItem[] = [];
  for (const c of w.figures) {
    const key = `ranks:${c.id}`;
    const d = Math.max(0, distToCollider(car, c));
    if (within(key, d)) out.push(ranksItem(f, c, key, car, d, (1 - fog) * f.r));
  }
  for (const zone of w.zones) {
    if (zone.role !== 'shelter') continue;
    const key = `shelter:${zone.id}`;
    const at = areaMid(zone.area);
    const d = dist(car, at);
    if (fog === 0 || within(key, d)) out.push(pointItem('shelter', key, f, at, d));
  }
  if (s.route) {
    // Where the hold leaves out the place the route leads to, though it lies within the edge, the route stops HOLD m
    // within the edge, short of it: a route that is not cut ends on what it leads to, shown.
    const held = leads !== null && !shown.has(leads.key) && dist(car, leads.at) <= edge;
    const route = routeItem(s.route.points, f, car, held ? edge - HOLD : edge);
    if (route) out.push(route);
  }
  if (sight && s.run.phase !== 'roam') {
    let copies = 0;
    for (const d of s.decoys) {
      if (copies === MAX_COPIES) break;
      if (d.state !== 'open') continue;
      const key = `decoy:${d.id}`;
      const m = dist(car, d.at);
      if (!within(key, m)) continue;
      out.push(pointItem('decoy', key, f, d.at, m));
      copies++;
    }
  }
  out.push(...places);
  return out;
}

const samePx = (a: Px, b: Px) => Math.hypot(a.x - b.x, a.y - b.y) < SHOWN_MOVE;

function samePoints(a: readonly Px[] | undefined, b: readonly Px[] | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (!samePx(a[k], b[k])) return false;
  return true;
}

/**
 * Whether two radars look the same: as many items, in order, of the same kinds and clamps, none moved SHOWN_MOVE px or
 * farther (as a distance, so a diagonal move counts in full), the outlines and lines alike. A move under a pixel is not
 * a change, so a creeping chariot does not redraw the HUD every frame; compared with the snapshot last shown, the moves
 * add up until one is.
 */
export function sameRadar(a: readonly RadarItem[], b: readonly RadarItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) {
    const p = a[k];
    const q = b[k];
    if (p.kind !== q.kind || p.clamped !== q.clamped || !samePx(p, q) || !samePoints(p.points, q.points)) return false;
  }
  return true;
}

/** The chariot's heading as a compass bearing in whole degrees, 0 to 359: 0 north, 90 east, clockwise. */
export function bearingOf(yaw: number): number {
  const deg = Math.round(90 - (yaw * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}
