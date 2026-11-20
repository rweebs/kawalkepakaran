// The lakon of each chapter as data: its marker, its steps (records to gather, a place to reach, a course of days with
// their gates, or lap posts), its timers, and the scripted copies, haze and teaching volley. Every lakon ends at
// Sanjaya's tower. Points carry no text: a record or a real gate knows its event only by slug and card. Units are metres;
// east is +x and north is −z. Four types: Himpun gathers and delivers; Antar carries the letter to the Hastinapura gate,
// then the record to the tower; Lintasan rides the real gates of a course; Uji ulang rides laps until two match.
import { dist, nextRand, rightOf, yawOf, type XZ } from './geom';
import { MISSION_TIMING } from './tuning';
import { ANCHORS, GATE_CIRCLE, RECORD_CIRCLE, SPAWN } from './world';

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
  marker: XZ | null;
  start: { x: number; z: number; yaw: number };
  steps: StepDef[];
  softTime: number | null;
  legTimes: { fromStep: number; seconds: number }[] | null;
  decoyLimit: number | null;
  riuh: { start: number; frozen: boolean; volleys: boolean };
  /**
   * `volleyLine` plans one volley to land at `at` the first time the chariot's hull middle reaches the line from `a` to
   * `b` while the lakon is active.
   */
  scripted: { decoys: XZ[]; clouds: XZ[]; volleyLine: VolleyLine | null };
  dawn: boolean;
  hints: boolean;
}

/** A line across the path, and where the one volley it plans lands. */
export interface VolleyLine {
  a: XZ;
  b: XZ;
  at: XZ;
}

export const CHAPTER_TYPES = ['himpun', 'himpun', 'antar', 'himpun', 'lintasan', 'uji', 'himpun', 'lintasan', 'himpun'] as const;
/** The days of parva 4's 18 that hold a real gate. */
export const REAL_DAYS_P4 = [1, 3, 4, 6, 8, 9, 12, 14, 17] as const;

const xz = (x: number, z: number): XZ => ({ x, z });
const clonePt = (p: XZ): XZ => ({ x: p.x, z: p.z });

/** A day's two gates stand this far either side of its centre: 6 m wide with the 3 m gap between them. */
const GATE_OFFSET = (MISSION_TIMING.gateWidth + MISSION_TIMING.gateGap) / 2;
/** From this day on, parva 4's rewrite gates mimic gold. */
const P4_MIMIC_FROM = 4;
/** The seed of the draws that put each of parva 4's real gates on its day's left or right. */
const P4_SEED = 404;

/** The point `lateral` m to the right of `at` across `heading`: on a day's or a post's line, `lateral` out from its centre. */
export function across(at: XZ, heading: number, lateral: number): XZ {
  const r = rightOf(heading);
  return { x: at.x + r.x * lateral, z: at.z + r.z * lateral };
}

/** Record k as a lontar: the k-th letter for its id, the chapter's slug k and card k. */
const lontar = (k: number, at: XZ, slugs: readonly string[]): PickupDef => ({
  id: String.fromCharCode(65 + k),
  at: clonePt(at),
  slug: slugs[k],
  visual: 'lontar',
  card: k,
});

/** A gather step: record k at records[k], a lontar of slug k; the prologue's are slugless arrows, L1 to L8. */
const gather =
  (records: readonly XZ[], prologue = false) =>
  (slugs: readonly string[]): StepDef[] => [
    {
      kind: 'collect',
      items: records.map(
        (at, k): PickupDef =>
          prologue ? { id: `L${k + 1}`, at: clonePt(at), slug: null, visual: 'arrow', card: k } : lontar(k, at, slugs),
      ),
    },
  ];

/** Where a day's real gate stands, and what it records; null on a day of two rewrites. */
type RealGate = { side: -1 | 1; slug: string; card: number } | null;

/**
 * Day n of a course: its two gates, left (−) and right (+) of the centre across the heading, the real one where `real`
 * puts it. A rewrite gate carries no slug and card −1, and mimics gold from day `mimicFrom` on (never when null).
 */
function dayOf(n: number, at: XZ, heading: number, real: RealGate, mimicFrom: number | null): DayDef {
  const gates = ([-1, 1] as const).map((side): GateDef => {
    const isReal = real !== null && real.side === side;
    return {
      id: `D${n}${side < 0 ? 'L' : 'R'}`,
      offset: side * GATE_OFFSET,
      width: MISSION_TIMING.gateWidth,
      real: isReal,
      slug: isReal ? real.slug : null,
      mimic: !isReal && mimicFrom !== null && n >= mimicFrom,
      card: isReal ? real.card : -1,
    };
  });
  return { at: clonePt(at), heading, gates };
}

/** Parva 4's 18 days, as the brief lists them: four straights round the armies, each day facing along its straight. */
const P4_DAYS: { at: XZ; heading: number }[] = [
  ...[25, 0, -25, -50, -75].map((z) => ({ at: xz(-70, z), heading: Math.PI / 2 })),
  ...[-50, -25, 0, 25, 50].map((x) => ({ at: xz(x, -95), heading: 0 })),
  ...[-75, -50, -25, 0, 25].map((z) => ({ at: xz(70, z), heading: -Math.PI / 2 })),
  ...[50, 25, 0].map((x) => ({ at: xz(x, 40), heading: Math.PI })),
];

/**
 * Parva 4: the days of REAL_DAYS_P4 hold the 9 slugs in timeline order, each real gate's side drawn from seed 404; from
 * day 4 on its rewrite gates mimic gold.
 */
function parva4(slugs: readonly string[]): StepDef[] {
  const realDays: readonly number[] = REAL_DAYS_P4;
  let rng = P4_SEED;
  const days = P4_DAYS.map(({ at, heading }, k) => {
    const card = realDays.indexOf(k + 1);
    if (card < 0) return dayOf(k + 1, at, heading, null, P4_MIMIC_FROM);
    const draw = nextRand(rng);
    rng = draw.a;
    return dayOf(k + 1, at, heading, { side: draw.v < 0.5 ? -1 : 1, slug: slugs[card], card }, P4_MIMIC_FROM);
  });
  return [{ kind: 'course', days }];
}

const P7_MARKER = xz(115, -20);
/**
 * Parva 7, the storm: four days from the gate toward the tower. Days 2 and 4 hold the real gates at the records of the
 * old stand-in; day 1 lies on the storm's line from the marker to day 2, and day 3 between days 2 and 4, placed so the
 * ride keeps inside its 220–250 m. Both real gates stand on the right, the side the storm's line comes from.
 */
const P7_DAYS: { at: XZ; real: { side: -1 | 1; card: number } | null }[] = [
  { at: xz(93, 12), real: null },
  { at: xz(64, 46), real: { side: 1, card: 0 } },
  { at: xz(32, 70), real: null },
  { at: xz(0, 72), real: { side: 1, card: 1 } },
];

/**
 * Parva 7: each day faces from the point before it (the marker for day 1) to the point after it (the tower for day 4).
 * Its rewrite gates stay grey: the mimics are parva 4's.
 */
function parva7(slugs: readonly string[]): StepDef[] {
  const line = [P7_MARKER, ...P7_DAYS.map((d) => d.at), ANCHORS.tower];
  const days = P7_DAYS.map(({ at, real }, k) => {
    const prev = line[k];
    const next = line[k + 2];
    const heading = yawOf({ x: next.x - prev.x, z: next.z - prev.z });
    return dayOf(k + 1, at, heading, real && { side: real.side, slug: slugs[real.card], card: real.card }, null);
  });
  return [{ kind: 'course', days }];
}

/** Parva 5's lap posts round the camp, P1 to P5. */
const P5_POSTS = [xz(-92, 18), xz(-128, -6), xz(-116, -48), xz(-80, -56), xz(-66, -22)];

/** Parva 5: laps over the posts, each facing from the post before it to the post after it; then the lontar by P1. */
function parva5(slugs: readonly string[]): StepDef[] {
  const n = P5_POSTS.length;
  const posts = P5_POSTS.map((at, k) => {
    const prev = P5_POSTS[(k + n - 1) % n];
    const next = P5_POSTS[(k + 1) % n];
    return { at: clonePt(at), heading: yawOf({ x: next.x - prev.x, z: next.z - prev.z }) };
  });
  return [{ kind: 'laps', posts, then: lontar(0, xz(-75, 30), slugs) }];
}

/** Parva 2: the letter lies at the camp marker; it goes to the Hastinapura gate, then the record at the north end. */
function parva2(slugs: readonly string[]): StepDef[] {
  return [
    { kind: 'collect', items: [lontar(0, ANCHORS.camp, slugs)] },
    { kind: 'reach', at: clonePt(ANCHORS.gate), r: GATE_CIRCLE, stopFor: MISSION_TIMING.gateStopFor, place: 'gate' },
    { kind: 'collect', items: [lontar(1, ANCHORS.northEnd, slugs)] },
  ];
}

/**
 * One row of the lakon table. `steps` builds the steps before the tower from the chapter's slugs, fresh each call; the
 * chapter takes `slugs` of them (any list for the prologue, null). The start faces the first objective away from the
 * marker unless `yaw` sets it.
 */
interface Lakon {
  marker: XZ | null;
  steps: (slugs: readonly string[]) => StepDef[];
  slugs: number | null;
  yaw: number | null;
  softTime: number | null;
  legTimes: { fromStep: number; seconds: number }[] | null;
  decoyLimit: number | null;
  decoys: XZ[];
  clouds: XZ[];
  volleyLine: VolleyLine | null;
  dawn: boolean;
  hints: boolean;
}

const BASE: Omit<Lakon, 'marker' | 'steps' | 'slugs' | 'softTime' | 'decoyLimit'> = {
  yaw: null,
  legTimes: null,
  decoys: [],
  clouds: [],
  volleyLine: null,
  dawn: false,
  hints: false,
};

/** A gather-and-deliver row: its records in slug order, as many slugs as records. */
const himpun = (records: XZ[]) => ({ steps: gather(records), slugs: records.length });

/** Indexed by chapter: the prologue, then parva 1 to 8. */
const LAKON: Lakon[] = [
  // The prologue: eight arrows from the spawn round to the tower. The copy on the L7→L8 line is the Mata lesson.
  // The teaching volley is planned as the chariot sets off. Its line spans the corridor between the ranks, 0.4 m ahead
  // of the hull's middle at rest on the spawn, with its ends inside both army zones. The volley lands 2.6 s after the
  // line is met, at (−11, 58), 5–8 m beside the route just past L2, on the outside of the gentle right-hand curve from
  // the spawn to L3, ahead of the chariot.
  // The corridor is open at its north mouth, so a chariot that first reverses up it can go round the line (no teaching
  // volley), or come back and cross it fast enough for the volley to be absorbed.
  // Over the tests' 216 bot runs (speedCap 0.2–1, a reaction of 0–1 s, careless and careful, Laju never, always or on
  // straights), every chariot meets the line once, with L1 open. All but 6 of those 216 starts are full throttle; the 6
  // ease off to 0.614 of it, and one of them is the slowest meeting, at 2.3 m/s. They meet it at 2.3–3.6 m/s, and a
  // gentler start meets it slower. Without Laju the volley always lands, 21.1 m or more from every
  // hull circle's centre. On a 16:9 screen it lands within 0.9 of the half-width from the middle; on an upright phone
  // (speedCap 0.3–0.8 at a 0.4 s reaction, and the autopilot) within the half-width, shown for at least half of its
  // telegraph.
  {
    ...BASE,
    marker: null,
    steps: gather([xz(-2, 32), xz(-14, 52), xz(-34, 70), xz(-62, 74), xz(-82, 52), xz(-86, 22), xz(-70, 4), xz(-54, 24)], true),
    slugs: null,
    softTime: null,
    decoyLimit: null,
    decoys: [xz(-66, 12)],
    volleyLine: { a: xz(-4, 11), b: xz(4, 11), at: xz(-11, 58) },
    hints: true,
  },
  // Parva 1: the lures sit 6.5–7.6 m off the A→B line; the haze lies on it.
  {
    ...BASE,
    marker: xz(20, 62),
    ...himpun([xz(52, 44), xz(62, -50)]),
    softTime: 120,
    decoyLimit: 3,
    decoys: [xz(62, 22), xz(50, -6), xz(66, -26), xz(68, -40)],
    clouds: [xz(57, 8), xz(60, -30)],
  },
  // Parva 2, Antar: no lakon clock, a clock for each leg: 75 s to the gate, 90 s from the gate to the tower.
  {
    ...BASE,
    marker: clonePt(ANCHORS.camp),
    steps: parva2,
    slugs: 2,
    softTime: null,
    legTimes: [
      { fromStep: 0, seconds: 75 },
      { fromStep: 2, seconds: 90 },
    ],
    decoyLimit: 3,
  },
  // Parva 3.
  { ...BASE, marker: xz(-66, -90), ...himpun([xz(-38, -96), xz(46, -92), xz(82, 8), xz(-8, 86)]), softTime: 150, decoyLimit: 3 },
  // Parva 4, Lintasan: 18 days, starting north toward day 1.
  { ...BASE, marker: xz(-70, 58), steps: parva4, slugs: 9, softTime: 210, decoyLimit: 3 },
  // Parva 5, Uji ulang: the marker in the camp's east opening; it cannot fail.
  { ...BASE, marker: xz(-84, -10), steps: parva5, slugs: 1, softTime: null, decoyLimit: null },
  // Parva 6.
  { ...BASE, marker: xz(60, -62), ...himpun([xz(100, -62), xz(80, 40)]), softTime: 120, decoyLimit: 3 },
  // Parva 7, Lintasan in the storm: the marker in the gate, its haze along the way.
  {
    ...BASE,
    marker: P7_MARKER,
    steps: parva7,
    slugs: 2,
    yaw: Math.PI, // Due west, straight out of the gate opening: the one start that does not face its first objective.
    softTime: 120,
    decoyLimit: 3,
    clouds: [xz(103, -3), xz(78, 30), xz(48, 56), xz(16, 69), xz(-20, 66), xz(60, 52)],
  },
  // Parva 8, at dawn.
  { ...BASE, marker: xz(-34, 64), ...himpun([xz(-10, 118), xz(58, 98)]), softTime: null, decoyLimit: null, dawn: true },
];

/** The places a lakon's steps lead through, in order: records, reach centres, day centres, lap posts, the record after. */
function places(steps: readonly StepDef[]): XZ[] {
  return steps.flatMap((s) => {
    if (s.kind === 'collect') return s.items.map((p) => p.at);
    if (s.kind === 'reach') return [s.at];
    if (s.kind === 'course') return s.days.map((d) => d.at);
    return [...s.posts.map((p) => p.at), s.then.at];
  });
}

/** The yaw from the marker toward the first place of its steps away from it, or toward the tower when there is none. */
function facing(marker: XZ, steps: readonly StepDef[]): number {
  const aim = places(steps).find((p) => dist(p, marker) > 0) ?? ANCHORS.tower;
  return yawOf({ x: aim.x - marker.x, z: aim.z - marker.z });
}

/**
 * The lakon of a chapter, 0 (the prologue) to 8. `slugs` are the chapter's event slugs in event order, as many as it
 * has records (2, 2, 4, 9, 1, 2, 2 and 2 for parva 1–8); the prologue takes any list and records slugless arrows.
 */
export function missionFor(chapter: number, slugs: readonly string[]): MissionDef {
  const row = Number.isInteger(chapter) ? LAKON[chapter] : undefined;
  if (!row) throw new RangeError(`missionFor: no chapter ${chapter}`);
  if (row.slugs !== null && slugs.length !== row.slugs) {
    throw new RangeError(`missionFor: chapter ${chapter} takes ${row.slugs} slugs, not ${slugs.length}`);
  }
  const steps = row.steps(slugs);
  const tower: StepDef = { kind: 'reach', at: clonePt(ANCHORS.tower), r: RECORD_CIRCLE, stopFor: MISSION_TIMING.stopFor, place: 'tower' };
  const { marker } = row;
  return {
    chapter,
    type: CHAPTER_TYPES[chapter],
    marker: marker && clonePt(marker),
    start: marker
      ? { x: marker.x, z: marker.z, yaw: row.yaw ?? facing(marker, steps) }
      : { x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw },
    steps: [...steps, tower],
    softTime: row.softTime,
    legTimes: row.legTimes && row.legTimes.map((l) => ({ ...l })),
    decoyLimit: row.decoyLimit,
    // The same for every lakon today (ruling SP-08): `frozen` and `volleys` stay in MissionDef on purpose, so a lakon can
    // hold its clamour still or go without volleys again without a change to the engine.
    riuh: { start: 0, frozen: false, volleys: true },
    scripted: {
      decoys: row.decoys.map(clonePt),
      clouds: row.clouds.map(clonePt),
      volleyLine: row.volleyLine && {
        a: clonePt(row.volleyLine.a),
        b: clonePt(row.volleyLine.b),
        at: clonePt(row.volleyLine.at),
      },
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
  return [across(at, heading, offset - width / 2), across(at, heading, offset + width / 2)];
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
