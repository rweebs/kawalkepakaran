// The radar at the HUD's top right: a round, heading-up map of the field round the chariot, the clamour (Riuh) as one
// continuous amber arc on its rim, and a north petal that turns with the heading. It draws the snapshot's kinds and
// positions only (radarItems): no name, title, date or fact, and no word but the copy's north letter and the clamour's
// name. Its colours come from the CSS: the site tokens, amber for the clamour, never red or blue.
// Comfort: nothing changes faster than 2 Hz. A mark fades in or out at one full fade per FADE_MS; the static band, the
// ranks' clip and the arc ease over EASE_MS from wherever they are; the static's grains are drawn anew at most every
// STATIC_MS, and never under reduced motion. The snapshot keeps no memory between frames, so the pure model below does:
// it remembers each mark while it fades, and the component only runs it on the frame clock.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
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
/** The time (ms) the static band, the ranks' clip and the arc take to reach a new value, from wherever they are. */
export const EASE_MS = 500;
/** The static's grains are drawn anew at most this often (ms): twice a second. */
export const STATIC_MS = 500;
/** The clamour's scale, and its arc: 300° clockwise from 210°, leaving 60° open under the chariot. */
const RIUH_MAX = 5;
const ARC = { from: 210, span: 300 } as const;
/** How far (px) an item may move between two snapshots and keep its mark. The route is one line, so it always keeps it. */
const MATCH_PX = 16;
/** The static's tile (px) and the grains on it: large enough that its repeat does not read as a mesh. */
const TILE = 24;
const GRAINS = 60;
/** Kinds draw in radarItems' order; the lakon's targets share the top layer and keep their own order. */
const LAYER: Record<RadarKind, number> = { ranks: 0, shelter: 1, route: 2, decoy: 3, tower: 4, replay: 5, marker: 6, record: 6, gate: 6, post: 6 };

const r2 = (x: number) => Math.round(x * 100) / 100;
const within = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);
/** The bearing of (dx, dy) on the square, in degrees clockwise from the top. */
const bearing = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI;

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

/** The static's grains on one TILE-square tile: the same for the same seed. */
export function noiseGrains(seed: number): { x: number; y: number; s: number }[] {
  const rand = mulberry32(seed);
  return Array.from({ length: GRAINS }, () => ({ x: Math.floor(rand() * TILE), y: Math.floor(rand() * TILE), s: rand() < 0.3 ? 1.5 : 1 }));
}

/** A value on its way from `from` (at `at`, ms) to `to`, which it reaches EASE_MS later at an even pace. */
export interface Eased { from: number; to: number; at: number }

export function easedAt(e: Eased, now: number): number {
  const k = (now - e.at) / EASE_MS;
  return k >= 1 ? e.to : k <= 0 ? e.from : e.from + (e.to - e.from) * k;
}

const settled = (v: number, now: number): Eased => ({ from: v, to: v, at: now });
const retarget = (e: Eased, to: number, now: number): Eased => (e.to === to ? e : { from: easedAt(e, now), to, at: now });

/**
 * An item as the radar draws it: a key that stays with it while it moves, and its fade. From `from` at `at` (ms), its
 * opacity heads for `to` (1 shown, 0 gone) at one full fade per FADE_MS.
 */
export interface RadarMark { key: number; item: RadarItem; from: number; to: 0 | 1; at: number }

export function markOpacity(m: RadarMark, now: number): number {
  const d = Math.max(0, now - m.at) / FADE_MS;
  return m.to === 1 ? Math.min(1, m.from + d) : Math.max(0, m.from - d);
}

/**
 * The marks for a new snapshot at `now`. Each item keeps the nearest mark of its kind within MATCH_PX (the route keeps
 * its one mark), a fading one included, which then fades back from where it is. An item with no mark gets a new key and
 * fades in from 0. A mark left over fades out from where it is, at its last place, and stays until it reaches 0. Items
 * keep their order; the marks on their way out follow them.
 */
export function trackMarks(prev: readonly RadarMark[], items: readonly RadarItem[], now: number, next: number): { marks: RadarMark[]; next: number } {
  const pool = prev.filter((m) => m.to === 1 || markOpacity(m, now) > 0);
  const taken = new Set<RadarMark>();
  const marks: RadarMark[] = [];
  let key = next;
  for (const item of items) {
    let best: RadarMark | null = null;
    let bestD = item.kind === 'route' ? Infinity : MATCH_PX * MATCH_PX;
    for (const m of pool) {
      if (taken.has(m) || m.item.kind !== item.kind) continue;
      const d = (m.item.x - item.x) ** 2 + (m.item.y - item.y) ** 2;
      if (d <= bestD) {
        best = m;
        bestD = d;
      }
    }
    if (!best) marks.push({ key: key++, item, from: 0, to: 1, at: now });
    else {
      taken.add(best);
      marks.push(best.to === 1 ? { ...best, item } : { key: best.key, item, from: markOpacity(best, now), to: 1, at: now });
    }
  }
  for (const m of pool) if (!taken.has(m)) marks.push(m.to === 0 ? m : { ...m, from: markOpacity(m, now), to: 0, at: now });
  return { marks, next: key };
}

/** What the radar remembers between snapshots, at `now` (ms on the frame clock). */
export interface RadarModel {
  now: number;
  items: readonly RadarItem[];
  marks: RadarMark[];
  next: number;
  /** The clamour the arc shows, and the static's share of the inner radius (0 while Mata sees through it). */
  riuh: Eased;
  fog: Eased;
}

/** The first view: its items shown at once, the arc and the static at their values. */
export function radarModel(items: readonly RadarItem[], riuh: number, fog: number, now = 0): RadarModel {
  return {
    now, items, marks: items.map((item, key) => ({ key, item, from: 1, to: 1, at: now })), next: items.length,
    riuh: settled(riuh, now), fog: settled(fog, now),
  };
}

/** A new snapshot, clamour or static at `now`: the items tracked into marks, the arc and the static turned to the new values. */
export function stepModel(m: RadarModel, items: readonly RadarItem[], riuh: number, fog: number, now: number): RadarModel {
  const t = Math.max(now, m.now);
  const tracked = items === m.items ? { marks: m.marks, next: m.next } : trackMarks(m.marks, items, t, m.next);
  return { now: t, items, ...tracked, riuh: retarget(m.riuh, riuh, t), fog: retarget(m.fog, fog, t) };
}

/** A frame at `now`: the clock moves on, never back, and the marks that have faded out leave. */
export function tickModel(m: RadarModel, now: number): RadarModel {
  const t = Math.max(now, m.now);
  const marks = m.marks.filter((k) => k.to === 1 || markOpacity(k, t) > 0);
  return { ...m, now: t, marks: marks.length === m.marks.length ? m.marks : marks };
}

/** Whether anything is still on its way at the model's time: a fade, the arc or the static. */
export function modelBusy(m: RadarModel): boolean {
  const moving = (e: Eased) => easedAt(e, m.now) !== e.to;
  return moving(m.riuh) || moving(m.fog) || m.marks.some((k) => markOpacity(k, m.now) !== k.to);
}

/** The static's grains: a new seed every STATIC_MS while the static shows, and none under reduced motion. */
function useGrainSeed(on: boolean): number {
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    if (!on) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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

const pointList = (ps: readonly { x: number; y: number }[]) => ps.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');

/** A mark's drawing and where it goes: the ranks and the route at their own coordinates, every other kind at its place. */
function drawing(item: RadarItem, cc: number, aim: boolean): { body: ReactNode; transform?: string } {
  if (item.kind === 'ranks') {
    // radar.ts cuts the outline to the radius shown and anchors the item at the block's nearest point, inside it. The
    // outline is drawn as it comes; one of fewer than 3 points (a block just touching the edge) draws nothing, and a
    // block given no outline at all (a round one) is a spot at its anchor. The ranks' clip still holds every one of them,
    // in depth: at rest it is the radius shown, so it cuts nothing the data shows.
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
  const body = item.kind === 'tower' && aim ? <><circle className="bg-radar__halo" r={7} />{GLYPH.tower}</> : GLYPH[item.kind];
  return { body, transform: item.clamped ? `${at} scale(0.8)` : at };
}

/** How far in from the inner radius (px) the petal is widest, where its letter sits. */
const PETAL_MID = 1.5;

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
  /** The snapshot's radar, in drawing order, in px on the `size` square. */
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
  /** What the lakon leads to: the tower stands out while it is the aim. */
  objective?: ObjectiveKey;
}

/**
 * The radar, heading-up: the map (an img labelled with its range) and the clamour (a meter from 0 to 5, one continuous
 * arc). The ranks are clipped to the visible radius, which the static's band shares, so nothing leaves the disc and no
 * outline shows under the static unless Mata is on.
 */
export function Radar({ locale, items, riuh, staticFrac, size, m, heading, sight, objective }: RadarProps) {
  const c = GAME_COPY[locale].ride;
  const value = within(riuh, 0, RIUH_MAX);
  const fog = sight ? 0 : within(staticFrac, 0, 1);
  const [model, setModel] = useState(() => radarModel(items, value, fog));
  // A new snapshot is taken into the model while rendering, so it shows in this very frame.
  if (model.items !== items || model.riuh.to !== value || model.fog.to !== fog) setModel(stepModel(model, items, value, fog, performance.now()));
  useEffect(() => {
    if (!modelBusy(model)) return;
    const frame = requestAnimationFrame(() => setModel((x) => tickModel(x, performance.now())));
    return () => cancelAnimationFrame(frame);
  }, [model]);
  const shownFog = easedAt(model.fog, model.now);
  const shownRiuh = easedAt(model.riuh, model.now);
  const seed = useGrainSeed(shownFog > 0);
  const grains = useMemo(() => noiseGrains(seed), [seed]);
  const uid = useId();
  const ids = { disc: `${uid}disc`, clear: `${uid}clear`, grain: `${uid}grain` };

  const cc = size / 2;
  const r = cc - RIM;
  const arcR = cc - RIM / 2;
  const sweep = (ARC.span * shownRiuh) / RIUH_MAX;
  const north = polar(cc, r - PETAL_MID, -heading);
  const aim = objective === 'tower' || objective === 'stop';
  const shown = model.marks
    .filter((k) => k.to === 1 || markOpacity(k, model.now) > 0)
    .sort((a, b) => LAYER[a.item.kind] - LAYER[b.item.kind]);
  const nextPost = shown.find((k) => k.item.kind === 'post' && k.to === 1)?.key;
  const mark = (k: RadarMark) => {
    const o = markOpacity(k, model.now);
    const { body, transform } = drawing(k.item, cc, aim);
    return (
      <g
        key={k.key} className="bg-radar__mark" data-kind={k.item.kind} data-clamped={k.item.clamped ? '' : undefined}
        data-next={k.key === nextPost ? '' : undefined} data-aim={aim && k.item.kind === 'tower' ? '' : undefined}
        style={o < 1 ? { opacity: r2(o) } : undefined} transform={transform}
      >
        {body}
      </g>
    );
  };

  return (
    <div className="bg-radar">
      <svg className="bg-radar__map" role="img" aria-label={c.radar({ m })} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <clipPath id={ids.disc}><circle cx={cc} cy={cc} r={r} /></clipPath>
          <clipPath id={ids.clear}><circle cx={cc} cy={cc} r={r2(r * (1 - shownFog))} /></clipPath>
          {shownFog > 0 && (
            <pattern id={ids.grain} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
              <rect className="bg-radar__wash" width={TILE} height={TILE} />
              {grains.map((g, k) => <rect key={k} className="bg-radar__grain" x={g.x} y={g.y} width={g.s} height={g.s} />)}
            </pattern>
          )}
        </defs>
        <circle className="bg-radar__disc" cx={cc} cy={cc} r={r} />
        <circle className="bg-radar__ring" cx={cc} cy={cc} r={r / 2} />
        {/* The static lies under the petal and the marks: the ranks are clipped short of it and no other item stays
            in it (radarItems drops them), so only a mark fading out crosses it, and the letter and the pips stay clear. */}
        {shownFog > 0 && (
          <circle
            className="bg-radar__static" cx={cc} cy={cc} r={r} stroke={`url(#${ids.grain})`} clipPath={`url(#${ids.disc})`}
            style={{ strokeWidth: r2(2 * r * shownFog), opacity: r2(shownFog) }}
          />
        )}
        <g className="bg-radar__north" transform={`rotate(${-heading} ${cc} ${cc})`}>
          <path className="bg-radar__petal" d={petalPath(cc, r)} />
        </g>
        <text className="bg-radar__letter" x={r2(north.x)} y={r2(north.y)} dy="0.35em" textAnchor="middle">{c.north}</text>
        <g className="bg-radar__ranks" clipPath={`url(#${ids.clear})`}>{shown.filter((k) => k.item.kind === 'ranks').map(mark)}</g>
        {shown.filter((k) => k.item.kind !== 'ranks').map(mark)}
        <path className="bg-radar__car" d={`M${cc} ${cc - 6}L${cc + 4.5} ${cc + 5}L${cc} ${cc + 2.5}L${cc - 4.5} ${cc + 5}Z`} />
      </svg>
      <div
        className="bg-riuh" role="meter" aria-label={c.riuh} aria-valuemin={0} aria-valuemax={RIUH_MAX}
        aria-valuenow={Math.round(value * 10) / 10} aria-valuetext={c.riuhLevel({ n: riuhLevel(value) })}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle className="bg-riuh__bed" cx={cc} cy={cc} r={arcR} />
          <path className="bg-riuh__track" d={arcPath(cc, arcR, ARC.from, ARC.span)} />
          <path className="bg-riuh__fill" data-riuh-fill="" data-sweep={Math.round(sweep * 10) / 10} d={arcPath(cc, arcR, ARC.from, sweep)} />
          <text className="bg-riuh__label" x={2} y={size - 3}>{c.riuh}</text>
        </svg>
      </div>
    </div>
  );
}
