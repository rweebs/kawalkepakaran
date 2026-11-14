// The radar: the field round the chariot for the HUD, heading-up. Every place is a point on a square `px` wide (the
// radar's SVG viewBox): the chariot at its centre, the way it faces up, its right to the right, and radarRange(v) m out
// at the inner radius px/2 − RIM. A place farther out is clamped to that radius, along its bearing.
// It shows the ranks and the shelters, the route ahead, the copies (only in Krishna's sight, and never in roam), the
// tower, and what the lakon leads to: the marker in roam, the open records, the real gates of the next GATE_DAYS days
// of a course (and any ridden past and still open), the next two lap posts, and the Hastinapura gate while the letter
// is carried. At a Riuh level with radar static, what lies beyond (1 − static) of the range is hidden unless sight is
// on, and the route is cut there. Positions, kinds and metres only: no text. Pure: no clock, no randomness.
import { dist, forward, rightOf, type XZ } from './geom';
import { speedOf } from './drive';
import { openTargets, type RunState } from './mission-run';
import { levelEffects, riuhLevel } from './riuh';
import { pointAt, projectOnPath } from './route';
import { ANCHORS, distToCollider, type Area, type Collider } from './world';
import type { GameState, World } from './engine';

export type RadarKind = 'marker' | 'replay' | 'record' | 'gate' | 'tower' | 'shelter' | 'ranks' | 'route' | 'decoy' | 'post';

/** One thing on the radar, in px on its square. */
export interface RadarItem {
  kind: RadarKind;
  /** Where it lies, clamped to the inner radius. The ranks: their block's middle. The route: where its line ends. */
  x: number;
  y: number;
  /** Beyond the range, so drawn at the inner radius; for the route, its line is cut short of its end. */
  clamped: boolean;
  /** Metres from the chariot: to the ranks' block (0 inside it), to the route's end. */
  dist: number;
  /** The ranks: their block's four corners, not clamped (clip them to the disc). The route: its line, inside the disc. */
  points?: { x: number; y: number }[];
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
/** A move this large (px) or larger is a change to the eye. */
const SHOWN_MOVE = 1;

/** The radar's range (m) at forward speed v (m/s), either way: 70 m at rest, 107.4 m at 17 m/s, 125 m at 25 m/s. */
export function radarRange(v: number): number {
  return RANGE.rest + RANGE.perSpeed * (Number.isFinite(v) ? Math.abs(v) : 0);
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

const pointItem = (kind: RadarKind, f: Frame, at: XZ, d: number): RadarItem => {
  const q = place(f, at);
  return { kind, x: q.x, y: q.y, clamped: q.clamped, dist: d };
};

function areaMid(a: Area): XZ {
  return a.kind === 'circle' ? { x: a.x, z: a.z } : { x: (a.minX + a.maxX) / 2, z: (a.minZ + a.maxZ) / 2 };
}

/** An army as the radar draws it: its block's outline, or a point for a round one. */
function ranksItem(f: Frame, c: Collider, d: number): RadarItem {
  if (c.kind === 'circle') return pointItem('ranks', f, c, d);
  const item = pointItem('ranks', f, { x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2 }, d);
  item.points = [
    spot(f, { x: c.minX, z: c.minZ }),
    spot(f, { x: c.maxX, z: c.minZ }),
    spot(f, { x: c.maxX, z: c.maxZ }),
    spot(f, { x: c.minX, z: c.maxZ }),
  ];
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
  return { kind: 'route', x: end.x, y: end.y, clamped: cut, dist: dist(car, route[route.length - 1]), points };
}

/** The position of a gate `offset` m to the right of its day's centre, across the day's heading. */
function gateAt(day: { at: XZ; heading: number }, offset: number): XZ {
  const r = rightOf(day.heading);
  return { x: day.at.x + r.x * offset, z: day.at.z + r.z * offset };
}

/**
 * What the lakon leads to, as openTargets has it: the marker in roam; the open records; the next lap posts; the
 * Hastinapura gate while the letter is carried (the tower is always on the radar). A course's aims give way to its real
 * gates: those of the next GATE_DAYS days still open, and any ridden past and still open. A failed run reads as active,
 * as in the scene: its records stay out through the fail shot.
 */
function lakonItems(s: GameState, show: (kind: RadarKind, at: XZ) => void): void {
  const run: RunState = s.run.phase === 'failed' ? { ...s.run, phase: 'active' } : s.run;
  const step = run.def.steps[run.step];
  for (const t of openTargets(run)) {
    if (t.kind === 'marker') show('marker', t.at);
    else if (t.kind === 'pickup') show('record', t.at);
    else if (t.kind === 'post') show('post', t.at);
    else if (t.kind === 'reach' && step?.kind === 'reach' && step.place === 'gate') show('gate', t.at);
  }
  if (step?.kind !== 'course' || (run.phase !== 'intro' && run.phase !== 'active')) return;
  const last = Math.min(run.dayIndex + GATE_DAYS, step.days.length);
  for (let k = 0; k < last; k++) {
    const day = step.days[k];
    for (const g of day.gates) if (g.real && !run.recorded.includes(g.id)) show('gate', gateAt(day, g.offset));
  }
}

/**
 * What the radar shows, on a square `px` wide, in drawing order: the ranks (each army whose block lies within the range),
 * the shelters, the route ahead, the copies (in sight, outside roam, open and within the range), the tower, then what
 * the lakon leads to. The ranks and copies show only within the range; everything else stays at the inner radius when
 * beyond it. With static (riuhLevel's radarStatic) and sight off, nothing beyond (1 − static) of the range shows and the
 * route is cut there. Bounded by the lakon's data and MAX_COPIES; nothing is sorted.
 */
export function radarItems(s: GameState, w: World, px: number): RadarItem[] {
  const { car } = s;
  const range = radarRange(speedOf(car));
  const f = frameOf(car, range, px);
  const sight = s.sight.on;
  const fog = sight ? 0 : levelEffects(riuhLevel(s.riuh.value)).radarStatic;
  /** How far (m) a place may lie and still show: anywhere without static (beyond the range, at the inner radius). */
  const clear = fog > 0 ? (1 - fog) * range : Infinity;
  const near = Math.min(range, clear);
  const out: RadarItem[] = [];
  const show = (kind: RadarKind, at: XZ) => {
    const d = dist(car, at);
    if (d <= clear) out.push(pointItem(kind, f, at, d));
  };

  for (const c of w.figures) {
    const d = Math.max(0, distToCollider(car, c));
    if (d <= near) out.push(ranksItem(f, c, d));
  }
  for (const zone of w.zones) if (zone.role === 'shelter') show('shelter', areaMid(zone.area));
  const route = s.route && routeItem(s.route.points, f, car, near);
  if (route) out.push(route);
  if (sight && s.run.phase !== 'roam') {
    let shown = 0;
    for (const d of s.decoys) {
      if (shown === MAX_COPIES) break;
      if (d.state !== 'open') continue;
      const m = dist(car, d.at);
      if (m > range) continue;
      out.push(pointItem('decoy', f, d.at, m));
      shown++;
    }
  }
  show('tower', ANCHORS.tower);
  lakonItems(s, show);
  return out;
}

const samePx = (a: Px, b: Px) => Math.abs(a.x - b.x) < SHOWN_MOVE && Math.abs(a.y - b.y) < SHOWN_MOVE;

function samePoints(a: readonly Px[] | undefined, b: readonly Px[] | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (!samePx(a[k], b[k])) return false;
  return true;
}

/**
 * Whether two radars look the same: as many items, in order, of the same kinds and clamps, none moved by SHOWN_MOVE px
 * or more on either axis, the outlines and lines alike. A move under a pixel is not a change, so a creeping chariot does
 * not redraw the HUD every frame; compared with the snapshot last shown, the moves add up until one is.
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
