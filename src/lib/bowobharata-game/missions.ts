// The lakon of each chapter as data: its marker, the records it gathers and where, its timers, and the scripted copies,
// haze and teaching volley. Every lakon ends at Sanjaya's tower. Points carry no text: a record knows its event only by
// slug and card. Units are metres; east is +x and north is −z. Until Task 31, chapters 2, 4, 5 and 7 are
// gather-and-deliver stand-ins (type 'himpun', standIn true) at their own markers.
import { dist, rightOf, yawOf, type XZ } from './geom';
import { MISSION_TIMING } from './tuning';
import { ANCHORS, RECORD_CIRCLE, SPAWN } from './world';

export type MissionType = 'himpun' | 'antar' | 'lintasan' | 'uji';

export interface PickupDef {
  id: string;
  at: XZ;
  slug: string | null;
  visual: 'arrow' | 'lontar';
  card: number;
}

export interface GateDef {
  id: string;
  offset: number;
  width: number;
  real: boolean;
  slug: string | null;
  mimic: boolean;
  card: number;
}

export interface DayDef {
  at: XZ;
  heading: number;
  gates: GateDef[];
}

export type StepDef =
  | { kind: 'collect'; items: PickupDef[] }
  | { kind: 'reach'; at: XZ; r: number; stopFor: number; place: 'tower' | 'gate' }
  | { kind: 'course'; days: DayDef[] }
  | { kind: 'laps'; posts: { at: XZ; heading: number }[]; then: PickupDef };

export interface MissionDef {
  chapter: number;
  type: MissionType;
  /** True only for the gather-and-deliver stand-ins of chapters 2, 4, 5 and 7, until Task 31. */
  standIn: boolean;
  marker: XZ | null;
  start: { x: number; z: number; yaw: number };
  steps: StepDef[];
  softTime: number | null;
  legTimes: { fromStep: number; seconds: number }[] | null;
  decoyLimit: number | null;
  riuh: { start: number; frozen: boolean; volleys: boolean };
  /** `volleyNear` plans one volley to land at `at` the first time the car comes within `r` of `near`. */
  scripted: { decoys: XZ[]; clouds: XZ[]; volleyNear: { near: XZ; r: number; at: XZ } | null };
  dawn: boolean;
  hints: boolean;
}

export const CHAPTER_TYPES = ['himpun', 'himpun', 'antar', 'himpun', 'lintasan', 'uji', 'himpun', 'lintasan', 'himpun'] as const;
/** The days of parva 4's 18 that hold a real gate. */
export const REAL_DAYS_P4 = [1, 3, 4, 6, 8, 9, 12, 14, 17] as const;

const xz = (x: number, z: number): XZ => ({ x, z });

/** One row of the lakon table. `records` are in slug order: record k carries slug k and card k. */
interface Lakon {
  marker: XZ | null;
  records: XZ[];
  standIn: boolean;
  softTime: number | null;
  decoyLimit: number | null;
  decoys: XZ[];
  clouds: XZ[];
  volleyNear: { near: XZ; r: number; at: XZ } | null;
  dawn: boolean;
  hints: boolean;
}

const BASE: Omit<Lakon, 'marker' | 'records' | 'softTime' | 'decoyLimit'> = {
  standIn: false,
  decoys: [],
  clouds: [],
  volleyNear: null,
  dawn: false,
  hints: false,
};

/** Indexed by chapter: the prologue, then parva 1 to 8. */
const LAKON: Lakon[] = [
  // The prologue: eight arrows from the spawn round to the tower. The copy on the L7→L8 line is the Mata lesson, and
  // the volley planned near L5 lands 7.1 m beside the L5→L6 line.
  {
    ...BASE,
    marker: null,
    records: [xz(-2, 32), xz(-14, 52), xz(-34, 70), xz(-62, 74), xz(-82, 52), xz(-86, 22), xz(-70, 4), xz(-54, 24)],
    softTime: null,
    decoyLimit: null,
    decoys: [xz(-66, 12)],
    volleyNear: { near: xz(-82, 52), r: 10, at: xz(-77, 36) },
    hints: true,
  },
  // Parva 1: the lures sit 6.5–7.6 m off the A→B line; the haze lies on it.
  {
    ...BASE,
    marker: xz(20, 62),
    records: [xz(52, 44), xz(62, -50)],
    softTime: 120,
    decoyLimit: 3,
    decoys: [xz(62, 22), xz(50, -6), xz(66, -26), xz(68, -40)],
    clouds: [xz(57, 8), xz(60, -30)],
  },
  // Parva 2, stand-in: the first record lies at the camp marker.
  { ...BASE, marker: xz(-100, -10), records: [xz(-100, -10), xz(0, -80)], standIn: true, softTime: 165, decoyLimit: 3 },
  // Parva 3.
  { ...BASE, marker: xz(-66, -90), records: [xz(-38, -96), xz(46, -92), xz(82, 8), xz(-8, 86)], softTime: 150, decoyLimit: 3 },
  // Parva 4, stand-in: the centres of the nine real days, in order.
  {
    ...BASE,
    marker: xz(-70, 58),
    records: [xz(-70, 25), xz(-70, -25), xz(-70, -50), xz(-50, -95), xz(0, -95), xz(25, -95), xz(70, -50), xz(70, 0), xz(25, 40)],
    standIn: true,
    softTime: 210,
    decoyLimit: 3,
  },
  // Parva 5, stand-in: the marker in the camp's east opening; the lontar lies between P1 and the tower.
  { ...BASE, marker: xz(-84, -10), records: [xz(-75, 30)], standIn: true, softTime: null, decoyLimit: null },
  // Parva 6.
  { ...BASE, marker: xz(60, -62), records: [xz(100, -62), xz(80, 40)], softTime: 120, decoyLimit: 3 },
  // Parva 7, stand-in: the marker at the gate; the records at the real days 2 and 4, with the storm's haze along the way.
  {
    ...BASE,
    marker: xz(115, -20),
    records: [xz(64, 46), xz(0, 72)],
    standIn: true,
    softTime: 120,
    decoyLimit: 3,
    clouds: [xz(103, -3), xz(78, 30), xz(48, 56), xz(16, 69), xz(-20, 66), xz(60, 52)],
  },
  // Parva 8, at dawn.
  { ...BASE, marker: xz(-34, 64), records: [xz(-10, 118), xz(58, 98)], softTime: null, decoyLimit: null, dawn: true },
];

const copy = (p: XZ): XZ => ({ x: p.x, z: p.z });

/** The yaw from the marker toward the first record away from it, or toward the tower when there is none. */
function facing(marker: XZ, records: readonly XZ[]): number {
  const aim = records.find((p) => dist(p, marker) > 0) ?? ANCHORS.tower;
  return yawOf({ x: aim.x - marker.x, z: aim.z - marker.z });
}

/**
 * The lakon of a chapter, 0 (the prologue) to 8. `slugs` are the chapter's event slugs in event order, as many as it
 * has records (2, 2, 4, 9, 1, 2, 2 and 2 for parva 1–8); the prologue takes any list and records slugless arrows.
 */
export function missionFor(chapter: number, slugs: readonly string[]): MissionDef {
  const row = Number.isInteger(chapter) ? LAKON[chapter] : undefined;
  if (!row) throw new RangeError(`missionFor: no chapter ${chapter}`);
  const prologue = chapter === 0;
  if (!prologue && slugs.length !== row.records.length) {
    throw new RangeError(`missionFor: chapter ${chapter} takes ${row.records.length} slugs, not ${slugs.length}`);
  }
  const items: PickupDef[] = row.records.map((at, k) => ({
    id: prologue ? `L${k + 1}` : String.fromCharCode(65 + k),
    at: copy(at),
    slug: prologue ? null : slugs[k],
    visual: prologue ? 'arrow' : 'lontar',
    card: k,
  }));
  const tower: StepDef = { kind: 'reach', at: copy(ANCHORS.tower), r: RECORD_CIRCLE, stopFor: MISSION_TIMING.stopFor, place: 'tower' };
  const { marker } = row;
  return {
    chapter,
    type: row.standIn ? 'himpun' : CHAPTER_TYPES[chapter],
    standIn: row.standIn,
    marker: marker && copy(marker),
    start: marker ? { x: marker.x, z: marker.z, yaw: facing(marker, row.records) } : { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw },
    steps: [{ kind: 'collect', items }, tower],
    softTime: row.softTime,
    legTimes: null,
    decoyLimit: row.decoyLimit,
    riuh: { start: 0, frozen: false, volleys: true },
    scripted: {
      decoys: row.decoys.map(copy),
      clouds: row.clouds.map(copy),
      volleyNear: row.volleyNear && { near: copy(row.volleyNear.near), r: row.volleyNear.r, at: copy(row.volleyNear.at) },
    },
    dawn: row.dawn,
    hints: row.hints,
  };
}

const target = ({ id, slug }: { id: string; slug: string | null }) => ({ id, slug });

/** What the lakon records, in step order: every pickup, every real gate and the record after the laps. */
export function realTargets(def: MissionDef): { id: string; slug: string | null }[] {
  return def.steps.flatMap((s) => {
    if (s.kind === 'collect') return s.items.map(target);
    if (s.kind === 'course') return s.days.flatMap((d) => d.gates.filter((g) => g.real).map(target));
    if (s.kind === 'laps') return [target(s.then)];
    return [];
  });
}

/** The two ends of a span `width` m wide across `heading`, centred `offset` m to the right of `at`. */
function spanEnds(at: XZ, heading: number, offset: number, width: number): XZ[] {
  const r = rightOf(heading);
  return [offset - width / 2, offset + width / 2].map((o) => ({ x: at.x + r.x * o, z: at.z + r.z * o }));
}

/** The points that must stand on open ground: the marker, the pickups, the ends of every gate and post; never a reach centre. */
export function objectivePoints(def: MissionDef): XZ[] {
  const out: XZ[] = def.marker ? [def.marker] : [];
  for (const s of def.steps) {
    if (s.kind === 'collect') out.push(...s.items.map((p) => p.at));
    if (s.kind === 'course') {
      for (const d of s.days) for (const g of d.gates) out.push(...spanEnds(d.at, d.heading, g.offset, g.width));
    }
    if (s.kind === 'laps') {
      for (const p of s.posts) out.push(...spanEnds(p.at, p.heading, 0, MISSION_TIMING.postWidth));
      out.push(s.then.at);
    }
  }
  return out;
}

export function reachCircles(def: MissionDef): { at: XZ; r: number }[] {
  return def.steps.flatMap((s) => (s.kind === 'reach' ? [{ at: s.at, r: s.r }] : []));
}
