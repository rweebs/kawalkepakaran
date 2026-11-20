// The radar at the HUD's top right: a round, heading-up map of the field round the chariot, the clamour (Riuh) as one
// continuous amber arc on its rim, and a north petal that turns with the heading. It draws the snapshot's kinds and
// positions only (radarItems): no name, title, date or fact, and no word but the copy's north letter and the clamour's
// name. Its colours come from the CSS: the site tokens, amber for the clamour, never red or blue.
// Comfort: nothing changes faster than 2 Hz, and nothing appears, goes or changes its look in one frame.
// - A mark fades in or out at one full fade per FADE_MS.
// - Each item keeps its own mark, never a neighbour's. One whose look changes (a record or shelter reaching the rim, the
//   next lap post) cross-fades to its new look where it is. The tower's halo, while the tower is the aim, fades alone.
// - radar.ts cuts the ranks' outline and the route at the radius shown. When that radius changes (Mata, a level step),
//   the old shape fades out and the new one in, under a clip that eases with the static's band over EASE_MS: the band
//   wipes what it covers, and what it uncovers comes in with it. The route's clip also holds its end chevron whole.
// - The static's grains are drawn anew at most every STATIC_MS, never under reduced motion.
// The snapshot keeps no memory between frames, so a pure model does. The map (RadarMap) runs it on the frame clock. It
// re-renders on each new snapshot, while a mark or a halo fades or the static eases, and every STATIC_MS while the
// static's grains are drawn anew. The clamour's fill (ClamourFill) eases its one path through a ref on its own frames, so
// the clamour's steady motion re-renders nothing. renderToString pins only the first render; timing is pinned only
// through the pure model; the shell's frames and interval are not tested.
import { memo, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { Locale } from '../../i18n';
import { GAME_COPY } from '../../lib/bowobharata-game/copy';
import type { ObjectiveKey } from '../../lib/bowobharata-game/hud';
import type { RadarItem, RadarKind } from '../../lib/bowobharata-game/radar';
import { riuhLevel } from '../../lib/bowobharata-game/riuh';
import { mulberry32 } from '../../lib/sky/rng';

/** The band (px) between the map's inner radius and the square's edge: radar.ts clamps places to size/2 − RIM. */
const RIM = 8;
/** One full fade of a mark, in or out (ms): no mark's opacity moves faster than this. */
export const FADE_MS = 500;
/** The time (ms) the static band, its clip and the arc take to reach a new value, from wherever they are. */
export const EASE_MS = 500;
/** The static's grains are drawn anew at most this often (ms): twice a second. */
export const STATIC_MS = 500;
/** The clamour's scale, and its arc: 300° clockwise from 210°, leaving 60° open under the chariot. */
const RIUH_MAX = 5;
const ARC = { from: 210, span: 300 } as const;
/** How far (px) an item may move between two snapshots and keep its mark. The route is one line, so it always keeps it. */
const MATCH_PX = 16;
/**
 * How near (px) a point's copy on its way out must lie to come back for it: the point's own place. The cut shapes move
 * with the chariot and have no neighbour of their look to take from: the route's copy comes back at any distance, and so
 * does a ranks block's own copy, by its key (ruling 845: a slow Mata tap in a fast turn moves an outline past MATCH_PX).
 */
const REVIVE_PX = 2;
/** How far (px²) a copy may lie from `item` and still come back for it: a ranks block's only by its key. */
const reviveD2 = (item: RadarItem) =>
  item.kind === 'route' || (item.kind === 'ranks' && item.key !== undefined) ? Infinity : item.kind === 'ranks' ? MATCH_PX * MATCH_PX : REVIVE_PX * REVIVE_PX;
/**
 * How far (px) past the radius shown the route's clip reaches: the route's end chevron reaches 3 px from its end, and
 * its stroke 1 px more, so at rest the chevron and the line's round end are whole. The ranks get no such margin: their
 * outlines are cut in the data.
 */
export const ROUTE_OVERHANG = 4;
/** The static's tile (px) and the grains on it: large enough that its repeat does not read as a mesh. */
const TILE = 24;
const GRAINS = 60;
/**
 * The drawing layers, radarItems' order: the ranks (in the clip that keeps them out of the static), the shelters, the
 * route (in its own clip), the copies, the tower, the replays, then the lakon's targets, which share the top layer and
 * keep their own order.
 */
const LAYER: Record<RadarKind, number> = { ranks: 0, shelter: 1, route: 2, decoy: 3, tower: 4, replay: 5, marker: 6, record: 6, gate: 6, post: 6 };
/** How far in from the inner radius (px) the north petal is widest, where its letter sits. */
const PETAL_MID = 1.5;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const within = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);
/** The bearing of (dx, dy) on the square, in degrees clockwise from the top. */
const bearing = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI;
/** The shapes radar.ts cuts at the radius shown: the ranks' outline and the route. */
const cutAtEdge = (kind: RadarKind) => kind === 'ranks' || kind === 'route';

/** The point `r` from the centre (c, c), `deg` degrees clockwise from the top. */
function polar(c: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.sin(a), y: c - r * Math.cos(a) };
}

/** An arc of radius r round (c, c), from `from` degrees clockwise from the top and `sweep` degrees on; a bare move at 0. */
export function arcPath(c: number, r: number, from: number, sweep: number): string {
  const a = polar(c, r, from);
  if (!(sweep > 0)) return `M${r2(a.x)} ${r2(a.y)}`;
  const b = polar(c, r, from + Math.min(sweep, 359.99));
  return `M${r2(a.x)} ${r2(a.y)}A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${r2(b.x)} ${r2(b.y)}`;
}

/** The clamour's sweep in degrees: 300° times the clamour over 5, held to the scale. */
export const arcSweep = (riuh: number) => (ARC.span * within(riuh, 0, RIUH_MAX)) / RIUH_MAX;

/** The static's grains on one TILE-square tile: the same for the same seed. */
export function noiseGrains(seed: number): { x: number; y: number; s: number }[] {
  const rand = mulberry32(seed);
  return Array.from({ length: GRAINS }, () => ({ x: Math.floor(rand() * TILE), y: Math.floor(rand() * TILE), s: rand() < 0.3 ? 1.5 : 1 }));
}

/** Whether the static's grains are drawn anew: only while the static shows, and never under reduced motion. */
export const grainsRun = (on: boolean, reduced: boolean) => on && !reduced;

/** The static shown: the level's share of the inner radius, or none while Mata sees through it. */
export const fogFor = (staticFrac: number, sight: boolean) => (sight ? 0 : within(staticFrac, 0, 1));

/** A value on its way from `from` (at `at`, ms) to `to`, which it reaches EASE_MS later at an even pace. */
export interface Eased { from: number; to: number; at: number }

export function easedAt(e: Eased, now: number): number {
  const k = (now - e.at) / EASE_MS;
  return k >= 1 ? e.to : k <= 0 ? e.from : e.from + (e.to - e.from) * k;
}

/** A value at rest at `v`. */
export const settled = (v: number, now: number): Eased => ({ from: v, to: v, at: now });
/** The value turned to `to` at `now`, from wherever it is then. */
export const retarget = (e: Eased, to: number, now: number): Eased => (e.to === to ? e : { from: easedAt(e, now), to, at: now });
/** Whether an eased value is still on its way at `now`: its next frame is asked for only then. */
export const arcBusy = (e: Eased, now: number) => easedAt(e, now) !== e.to;

/** An opacity on its way from `from` (at `at`, ms) to `to` (1 shown, 0 gone), at one full fade per FADE_MS. */
export interface Fade { from: number; to: 0 | 1; at: number }

export function fadeAt(f: Fade, now: number): number {
  const d = Math.max(0, now - f.at) / FADE_MS;
  return f.to === 1 ? Math.min(1, f.from + d) : Math.max(0, f.from - d);
}

/** A fade at rest at `to`. */
const still = (to: 0 | 1, now: number): Fade => ({ from: to, to, at: now });
/** The fade turned to `to` at `now`, from wherever it is then. */
const turn = (f: Fade, to: 0 | 1, now: number): Fade => (f.to === to ? f : { from: fadeAt(f, now), to, at: now });

/**
 * An item as the radar draws it: a key that stays with it while it moves, its look, and its fade (from, to, at).
 */
export interface RadarMark extends Fade {
  key: number;
  item: RadarItem;
  /** The next lap post (drawn brighter). */
  next: boolean;
  /** For the ranks' outline and the route: the static radar.ts cut them at (0 for every other kind). */
  cut: number;
  /** The tower's halo ring: heading for 1 while the tower is the aim, else for 0 (always 0 for every other kind). */
  halo: Fade;
}

export const markOpacity = (m: RadarMark, now: number): number => fadeAt(m, now);
/** The halo ring's own opacity, under the mark's: it fades alone, so the tower itself never dips. */
export const haloOpacity = (m: RadarMark, now: number): number => fadeAt(m.halo, now);

type Px = { x: number; y: number };

/** Whether two shapes are the same to the eye: as many points, none apart by half a pixel or more. */
function sameShape(a: readonly Px[] | undefined, b: readonly Px[] | undefined): boolean {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((p, k) => Math.hypot(p.x - b[k].x, p.y - b[k].y) < 0.5);
}

/**
 * At most two copies of the route on their way out (Mata tapped fast): the faintest go first. The route is one item, so
 * this is its own cap; its copy of the cut it comes back to comes back at any distance, so the cap meets only copies the
 * route has left behind. The ranks have none: a block's own copy of a cut it comes back to comes back (trackMarks), so a
 * block at rest keeps a mark per cut at most, and every copy leaves only at 0.
 */
function capRoute(marks: RadarMark[], now: number): RadarMark[] {
  const going = marks.filter((m) => m.item.kind === 'route' && m.to === 0);
  if (going.length <= 2) return marks;
  const drop = new Set([...going].sort((a, b) => markOpacity(a, now) - markOpacity(b, now)).slice(0, going.length - 2));
  return marks.filter((m) => !drop.has(m));
}

/**
 * The marks for a new snapshot at `now`, with the static `fog` it was cut at and whether the tower is the aim.
 * - Each item first finds its own mark: a shown mark of its kind (and of its key, where radar.ts gives one) within
 *   MATCH_PX, the route's at any distance. The nearest pairs are taken first, so a neighbour's mark is never taken.
 * - Its look is its clamp and, for a lap post, whether it is the next one; for a cut shape also its cut, though a shape
 *   the new cut left as it was keeps its look. If its own mark has that look, it moves on with the item.
 * - If not, that mark fades out where it is, in its old look, and the item gets a mark of the new look: a copy of that
 *   look on its way out comes back from where it is, or a new key fades in from 0. A point's copy comes back only at its
 *   own place (REVIVE_PX), a ranks block's own copy (by its key) and the route's at any distance (reviveD2): the cut
 *   shapes move with the chariot, and Mata tapped while it turns or drives must not leave their outlines faint. An item
 *   with no mark of its own comes in the same way.
 * - The tower's halo turns to the aim and fades on its own, so aiming never re-keys the tower.
 * - A mark left over fades out from where it is, at its last place and in its last shape, and stays until it reaches 0.
 * - Items keep their order; the marks on their way out follow them.
 */
export function trackMarks(
  prev: readonly RadarMark[], items: readonly RadarItem[], now: number, next: number, fog = 0, aim = false,
): { marks: RadarMark[]; next: number } {
  const firstPost = items.findIndex((i) => i.kind === 'post');
  const pool = prev.filter((m) => m.to === 1 || markOpacity(m, now) > 0);
  const kin = (m: RadarMark, item: RadarItem) =>
    m.item.kind === item.kind && (m.item.key === undefined || item.key === undefined || m.item.key === item.key);
  const apart = (m: RadarMark, item: RadarItem) => (m.item.x - item.x) ** 2 + (m.item.y - item.y) ** 2;
  // Each item's own mark, the nearest pairs first.
  const pairs: { i: number; m: RadarMark; d: number }[] = [];
  items.forEach((item, i) => {
    for (const m of pool) {
      if (m.to !== 1 || !kin(m, item)) continue;
      const d = apart(m, item);
      if (item.kind === 'route' || d <= MATCH_PX * MATCH_PX) pairs.push({ i, m, d });
    }
  });
  pairs.sort((a, b) => a.d - b.d);
  const own = new Map<number, RadarMark>();
  const taken = new Set<RadarMark>();
  for (const p of pairs) {
    if (own.has(p.i) || taken.has(p.m)) continue;
    own.set(p.i, p.m);
    taken.add(p.m);
  }
  const leaving = new Set<RadarMark>();
  const marks: RadarMark[] = [];
  let key = next;
  items.forEach((item, i) => {
    const isNext = i === firstPost;
    const cut = cutAtEdge(item.kind) ? fog : 0;
    const halo = aim && item.kind === 'tower' ? 1 : 0;
    const looks = (m: RadarMark) =>
      m.item.clamped === item.clamped && m.next === isNext && (m.cut === cut || (cutAtEdge(item.kind) && sameShape(m.item.points, item.points)));
    const mine = own.get(i);
    if (mine && looks(mine)) {
      marks.push({ ...mine, item, cut, halo: turn(mine.halo, halo, now) });
      return;
    }
    if (mine) leaving.add(mine);
    let back: RadarMark | null = null;
    let backD = reviveD2(item);
    // At any distance a ranks block takes back only its own copy: the same key, not a copy that has none.
    const byKey = item.kind === 'ranks' && item.key !== undefined;
    for (const m of pool) {
      if (m.to !== 0 || taken.has(m) || !kin(m, item) || !looks(m) || (byKey && m.item.key !== item.key)) continue;
      const d = apart(m, item);
      if (d <= backD) {
        back = m;
        backD = d;
      }
    }
    if (back) {
      taken.add(back);
      marks.push({ ...back, item, cut, from: markOpacity(back, now), to: 1, at: now, halo: turn(back.halo, halo, now) });
    } else marks.push({ key: key++, item, next: isNext, cut, from: 0, to: 1, at: now, halo: still(halo, now) });
  });
  for (const m of pool) {
    if (taken.has(m) && !leaving.has(m)) continue;
    marks.push(m.to === 0 ? m : { ...m, from: markOpacity(m, now), to: 0, at: now });
  }
  return { marks: capRoute(marks, now), next: key };
}

/** What the map remembers between snapshots, at `now` (ms on the frame clock). The clamour is not part of it. */
export interface RadarModel {
  now: number;
  items: readonly RadarItem[];
  marks: RadarMark[];
  next: number;
  /** The static shown, as a share of the inner radius (0 while Mata sees through it): the band and the clip follow it. */
  fog: Eased;
  /** Whether the tower is the aim. */
  aim: boolean;
}

/** The first view: its items shown at once, the static at its value. */
export function radarModel(items: readonly RadarItem[], fog: number, aim: boolean, now = 0): RadarModel {
  const firstPost = items.findIndex((i) => i.kind === 'post');
  const marks = items.map((item, key): RadarMark => ({
    key, item, next: key === firstPost, cut: cutAtEdge(item.kind) ? fog : 0, from: 1, to: 1, at: now,
    halo: still(aim && item.kind === 'tower' ? 1 : 0, now),
  }));
  return { now, items, marks, next: items.length, fog: settled(fog, now), aim };
}

/** A new snapshot, static or aim at `now`: the items tracked into marks, the static turned to its new value. */
export function stepModel(m: RadarModel, items: readonly RadarItem[], fog: number, aim: boolean, now: number): RadarModel {
  const t = Math.max(now, m.now);
  const same = items === m.items && fog === m.fog.to && aim === m.aim;
  const tracked = same ? { marks: m.marks, next: m.next } : trackMarks(m.marks, items, t, m.next, fog, aim);
  return { now: t, items, ...tracked, fog: retarget(m.fog, fog, t), aim };
}

/** A frame at `now`: the clock moves on, never back, and the marks that have faded out leave. */
export function tickModel(m: RadarModel, now: number): RadarModel {
  const t = Math.max(now, m.now);
  const marks = m.marks.filter((k) => k.to === 1 || markOpacity(k, t) > 0);
  return { ...m, now: t, marks: marks.length === m.marks.length ? m.marks : marks };
}

/** Whether a fade, a halo or the static is still on its way at the model's time: the map's next frame is asked for only then. */
export function modelBusy(m: RadarModel): boolean {
  return easedAt(m.fog, m.now) !== m.fog.to || m.marks.some((k) => markOpacity(k, m.now) !== k.to || haloOpacity(k, m.now) !== k.halo.to);
}

/** A mark as drawn this frame: its opacity, and its halo ring's under it. */
export interface Drawn { mark: RadarMark; opacity: number; halo: number }

/**
 * The marks to draw at the model's time, by layer, none that has faded out. Within a layer they keep the model's order:
 * the snapshot's, with the marks on their way out after it.
 */
export function drawOrder(m: RadarModel): Drawn[] {
  return m.marks
    .map((mark) => ({ mark, opacity: markOpacity(mark, m.now), halo: haloOpacity(mark, m.now) }))
    .filter((d) => d.mark.to === 1 || d.opacity > 0)
    .sort((a, b) => LAYER[a.mark.item.kind] - LAYER[b.mark.item.kind]);
}

/**
 * What the map draws at the model's time on a `size` square: the static shown (`fog`), the clips' radii, the band, and
 * the marks in drawing order, in four runs: the ranks, in the clip at the static's inner edge (so the clip and the band
 * always agree); the shelters; the route, in its clip ROUTE_OVERHANG further out; then every other mark by layer.
 */
export interface MapView {
  fog: number;
  clip: number;
  routeClip: number;
  band: { width: number; opacity: number } | null;
  ranks: Drawn[];
  shelters: Drawn[];
  route: Drawn[];
  points: Drawn[];
}

export function mapView(m: RadarModel, size: number): MapView {
  const r = size / 2 - RIM;
  const fog = easedAt(m.fog, m.now);
  const drawn = drawOrder(m);
  const of = (kind: RadarKind) => drawn.filter((d) => d.mark.item.kind === kind);
  return {
    fog,
    clip: r2(r * (1 - fog)),
    routeClip: r2(r * (1 - fog) + ROUTE_OVERHANG),
    band: fog > 0 ? { width: r2(2 * r * fog), opacity: r2(fog) } : null,
    ranks: of('ranks'),
    shelters: of('shelter'),
    route: of('route'),
    points: drawn.filter((d) => LAYER[d.mark.item.kind] > LAYER.route),
  };
}

/** The static's grains: a new seed every STATIC_MS while grainsRun says so. */
function useGrainSeed(on: boolean): number {
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!grainsRun(on, reduced)) return;
    const id = window.setInterval(() => setSeed((s) => s + 1), STATIC_MS);
    return () => window.clearInterval(id);
  }, [on]);
  return seed;
}

/** Each point kind's drawing round (0, 0); a clamped record turns into a chevron pointing out. */
const GLYPH: Record<Exclude<RadarKind, 'ranks' | 'route'>, ReactNode> = {
  shelter: <rect x={-3} y={-3} width={6} height={6} rx={1.5} />,
  decoy: <circle r={3} />,
  tower: <path d="M0 -4.5L4.5 0L0 4.5L-4.5 0Z" />,
  replay: <circle r={4} />,
  marker: <circle r={4.5} />,
  record: <circle r={3.2} />,
  gate: <path d="M-3.5 3.5V-1A3.5 3.5 0 0 1 3.5 -1V3.5" />,
  post: <circle r={2.6} />,
};
const CHEVRON = <path d="M0 -4.5L3.5 2.5L0 1L-3.5 2.5Z" />;

const pointList = (ps: readonly Px[]) => ps.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');

/**
 * A mark's drawing and where it goes: the ranks and the route at their own coordinates, every other kind at its place.
 * The tower's halo ring at `halo` opacity, drawn while above 0.
 */
function drawing(item: RadarItem, cc: number, halo: number): { body: ReactNode; transform?: string } {
  if (item.kind === 'ranks') {
    // radar.ts cuts the outline to the radius shown and anchors the item at the block's nearest point, inside it. The
    // outline is drawn as it comes; one of fewer than 3 points (a block just touching the edge) draws nothing, and a
    // block given no outline at all (a round one) is a spot at its anchor. The clip still holds every one of them, in
    // depth: at rest it is the radius shown, so it cuts nothing the data shows.
    if (item.points) return { body: item.points.length >= 3 ? <polygon points={pointList(item.points)} /> : null };
    return { body: <circle cx={r2(item.x)} cy={r2(item.y)} r={4} /> };
  }
  if (item.kind === 'route') {
    const ps = item.points ?? [];
    const [a, b] = ps.slice(-2);
    // A route cut short goes on beyond the range: a chevron at its end says so.
    const on = item.clamped && a && b ? `translate(${r2(b.x)} ${r2(b.y)}) rotate(${r2(bearing(b.x - a.x, b.y - a.y))})` : null;
    return { body: <><polyline points={pointList(ps)} />{on && <path d="M-3 3L0 0L3 3" transform={on} />}</> };
  }
  const at = `translate(${r2(item.x)} ${r2(item.y)})`;
  if (item.kind === 'record' && item.clamped) return { body: CHEVRON, transform: `${at} rotate(${r2(bearing(item.x - cc, item.y - cc))})` };
  const ring = item.kind === 'tower' && halo > 0 ? <circle className="bg-radar__halo" r={7} style={halo < 1 ? { opacity: r2(halo) } : undefined} /> : null;
  const body = ring ? <>{ring}{GLYPH.tower}</> : GLYPH[item.kind];
  return { body, transform: item.clamped ? `${at} scale(0.8)` : at };
}

/**
 * One mark as drawn: a group with its kind, its flags and its fade, at its place. All of it comes from the mark itself,
 * never from the radar's props: a mark on its way out keeps its own look, aim and halo while the live one changes.
 */
export function drawMark({ mark: k, opacity: o, halo }: Drawn, cc: number): ReactElement {
  const { body, transform } = drawing(k.item, cc, halo);
  return (
    <g
      key={k.key} className="bg-radar__mark" data-kind={k.item.kind} data-clamped={k.item.clamped ? '' : undefined}
      data-next={k.next ? '' : undefined} data-aim={k.halo.to === 1 ? '' : undefined} style={o < 1 ? { opacity: r2(o) } : undefined}
      transform={transform}
    >
      {body}
    </g>
  );
}

/**
 * A lotus petal across the rim, drawn for north at the top (the group round it turns it to north): its tip at the
 * square's edge, widest PETAL_MID px inside the inner radius, its round base 9 px in.
 */
function petalPath(cc: number, r: number): string {
  const tip = cc - (cc - 0.6);
  const mid = cc - (r - PETAL_MID);
  const base = cc - (r - 9);
  const w = 5.5;
  const p = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  return [
    `M${p(cc, tip)}`,
    `C${p(cc + 1.8, tip + 2)} ${p(cc + w, mid - 3.9)} ${p(cc + w, mid)}`,
    `C${p(cc + w, mid + 3.9)} ${p(cc + 3.4, base)} ${p(cc, base)}`,
    `C${p(cc - 3.4, base)} ${p(cc - w, mid + 3.9)} ${p(cc - w, mid)}`,
    `C${p(cc - w, mid - 3.9)} ${p(cc - 1.8, tip + 2)} ${p(cc, tip)}Z`,
  ].join('');
}

export interface RadarProps {
  locale: Locale;
  /**
   * The snapshot's radar, in px on the `size` square, in radarItems' drawing order: the ranks, the shelters, the route,
   * the copies, the tower, then what the lakon leads to. The map keeps that order by layer (LAYER), with the marks on
   * their way out.
   */
  items: readonly RadarItem[];
  /** The clamour, 0 to 5. */
  riuh: number;
  /** The outer share of the inner radius that the level's static covers: 0, 0.3 or 0.45. */
  staticFrac: number;
  /** The square's side in px (RADAR_PX): the viewBox the items are placed on. CSS may scale it. */
  size: number;
  /** The range at the inner radius, in whole metres, for the label. */
  m: number;
  /** The chariot's heading as a compass bearing in degrees (0 north, clockwise): the north petal turns by it. */
  heading: number;
  /** Mata, Krishna's sight, is on: it sees through the static. */
  sight: boolean;
  /** What the lakon leads to: the tower stands out only while it is the aim ('tower'; a stop may be at another place). */
  objective?: ObjectiveKey;
}

type MapProps = Omit<RadarProps, 'riuh'>;

/**
 * The map: an img labelled with its range. Its model takes each new snapshot while rendering, so it shows in the same
 * frame, and asks for the next frame only while a mark or a halo fades or the static eases. The ranks sit in a clip at
 * the static's inner edge, so nothing of them leaves the disc or shows under the static unless Mata is on; the route in
 * one ROUTE_OVERHANG further out, which holds its end chevron whole.
 */
const RadarMap = memo(function RadarMap({ locale, items, staticFrac, size, m, heading, sight, objective }: MapProps) {
  const c = GAME_COPY[locale].ride;
  const fog = fogFor(staticFrac, sight);
  const aim = objective === 'tower';
  const [model, setModel] = useState(() => radarModel(items, fog, aim));
  if (model.items !== items || model.fog.to !== fog || model.aim !== aim) setModel(stepModel(model, items, fog, aim, performance.now()));
  useEffect(() => {
    if (!modelBusy(model)) return;
    const frame = requestAnimationFrame(() => setModel((x) => tickModel(x, performance.now())));
    return () => cancelAnimationFrame(frame);
  }, [model]);
  const view = mapView(model, size);
  const seed = useGrainSeed(view.fog > 0);
  const uid = useId();
  const ids = { disc: `${uid}disc`, clear: `${uid}clear`, route: `${uid}route`, grain: `${uid}grain` };
  const grains = useMemo(() => noiseGrains(seed), [seed]);
  const pattern = useMemo(
    () => (
      <pattern id={ids.grain} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
        <rect className="bg-radar__wash" width={TILE} height={TILE} />
        {grains.map((g, k) => <rect key={k} className="bg-radar__grain" x={g.x} y={g.y} width={g.s} height={g.s} />)}
      </pattern>
    ),
    [grains, ids.grain],
  );

  const cc = size / 2;
  const r = cc - RIM;
  const north = polar(cc, r - PETAL_MID, -heading);
  const mark = (d: Drawn) => drawMark(d, cc);

  return (
    <svg className="bg-radar__map" role="img" aria-label={c.radar({ m })} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <clipPath id={ids.disc}><circle cx={cc} cy={cc} r={r} /></clipPath>
        <clipPath id={ids.clear}><circle cx={cc} cy={cc} r={view.clip} /></clipPath>
        <clipPath id={ids.route}><circle cx={cc} cy={cc} r={view.routeClip} /></clipPath>
        {view.band && pattern}
      </defs>
      <circle className="bg-radar__disc" cx={cc} cy={cc} r={r} />
      <circle className="bg-radar__ring" cx={cc} cy={cc} r={r / 2} />
      {/* The static lies under the petal and the marks: the ranks and the route are clipped short of it (the route's end
          chevron reaches ROUTE_OVERHANG in) and no other item stays in it (radarItems drops them), so only a mark fading
          out crosses it, and the letter and the pips stay clear. */}
      {view.band && (
        <circle
          className="bg-radar__static" cx={cc} cy={cc} r={r} stroke={`url(#${ids.grain})`} clipPath={`url(#${ids.disc})`}
          style={{ strokeWidth: view.band.width, opacity: view.band.opacity }}
        />
      )}
      <g className="bg-radar__north" transform={`rotate(${-heading} ${cc} ${cc})`}>
        <path className="bg-radar__petal" d={petalPath(cc, r)} />
      </g>
      <text className="bg-radar__letter" x={r2(north.x)} y={r2(north.y)} dy="0.35em" textAnchor="middle">{c.north}</text>
      <g className="bg-radar__edge" clipPath={`url(#${ids.clear})`}>{view.ranks.map(mark)}</g>
      {view.shelters.map(mark)}
      <g className="bg-radar__route" clipPath={`url(#${ids.route})`}>{view.route.map(mark)}</g>
      {view.points.map(mark)}
      <path className="bg-radar__car" d={`M${cc} ${cc - 6}L${cc + 4.5} ${cc + 5}L${cc} ${cc + 2.5}L${cc - 4.5} ${cc + 5}Z`} />
    </svg>
  );
});

/**
 * The clamour's fill: one path that eases to each new value over EASE_MS from wherever it is. It moves through a ref on
 * its own frames, which stop once it is settled, so the clamour's steady motion re-renders nothing. Its first render
 * draws the value as given.
 */
const ClamourFill = memo(function ClamourFill({ value, cc, r }: { value: number; cc: number; r: number }) {
  const path = useRef<SVGPathElement>(null);
  const ease = useRef<Eased | null>(null);
  const first = useRef({ d: arcPath(cc, r, ARC.from, arcSweep(value)), sweep: r1(arcSweep(value)) }).current;
  useEffect(() => {
    const start = performance.now();
    ease.current = ease.current ? retarget(ease.current, value, start) : settled(value, start);
    let frame = 0;
    const draw = () => {
      const now = performance.now();
      const e = ease.current!;
      const sweep = arcSweep(easedAt(e, now));
      path.current?.setAttribute('d', arcPath(cc, r, ARC.from, sweep));
      path.current?.setAttribute('data-sweep', String(r1(sweep)));
      frame = arcBusy(e, now) ? requestAnimationFrame(draw) : 0;
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [value, cc, r]);
  return <path ref={path} className="bg-riuh__fill" data-riuh-fill="" data-sweep={first.sweep} d={first.d} />;
});

/** The clamour: a meter from 0 to 5, one continuous arc on the rim with its name by the arc's start. */
const ClamourMeter = memo(function ClamourMeter({ locale, riuh, size }: { locale: Locale; riuh: number; size: number }) {
  const c = GAME_COPY[locale].ride;
  const value = within(riuh, 0, RIUH_MAX);
  const cc = size / 2;
  const arcR = cc - RIM / 2;
  return (
    <div
      className="bg-riuh" role="meter" aria-label={c.riuh} aria-valuemin={0} aria-valuemax={RIUH_MAX}
      aria-valuenow={Math.round(value * 10) / 10} aria-valuetext={c.riuhLevel({ n: riuhLevel(value) })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="bg-riuh__bed" cx={cc} cy={cc} r={arcR} />
        <path className="bg-riuh__track" d={arcPath(cc, arcR, ARC.from, ARC.span)} />
        <ClamourFill value={value} cc={cc} r={arcR} />
        <text className="bg-riuh__label" x={2} y={size - 3}>{c.riuh}</text>
      </svg>
    </div>
  );
});

/**
 * The radar, heading-up: the map and the clamour, stacked in one square. Each re-renders only on its own props, so a
 * new clamour value never redraws the map and a new snapshot never restarts the arc.
 */
export function Radar({ locale, items, riuh, staticFrac, size, m, heading, sight, objective }: RadarProps) {
  return (
    <div className="bg-radar">
      <RadarMap locale={locale} items={items} staticFrac={staticFrac} size={size} m={m} heading={heading} sight={sight} objective={objective} />
      <ClamourMeter locale={locale} riuh={riuh} size={size} />
    </div>
  );
}
