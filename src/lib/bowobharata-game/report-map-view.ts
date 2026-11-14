// The record map's view, pure: its colours and sizes, which nodes show and which are bright, the still picture's
// projection, the selection's links, and the parva rail's steps. ReportMap.tsx draws the still SVG from it, and passes
// its numbers to the 3D scene in world/report-map.ts. No clock and no randomness: the same graph and props give the same
// picture on the server and in the browser.
import type { MapGraph, MapLinkKind, MapNode } from './report-types';

/** Node colour by source, as on /pantau: the Pelapor gold, perkara purple, laporan silver. */
export const NODE_HEX: Readonly<Record<MapNode['source'], string>> = { rw: '#e3b341', perkara: '#9085e9', laporan: '#c3c2b7' };
/** Link colour by kind, as on /pantau. */
export const LINK_HEX: Readonly<Record<MapLinkKind, string>> = { 'in-allegation': '#f0a27c', 'out-response': '#3987e5', against: '#c9d1dc', member: '#475569' };
/** The fill of a shown node outside the focus. */
export const DIM_HEX = '#1f2a44';
/** The map's background, /pantau's dark navy. */
export const BG_HEX = '#0b1020';

export const MAP_SOURCES: readonly MapNode['source'][] = ['rw', 'perkara', 'laporan'];
export const MAP_LINK_KINDS: readonly MapLinkKind[] = ['in-allegation', 'out-response', 'against', 'member'];

/** The still picture's box, in SVG units. */
export const SVG_W = 640;
export const SVG_H = 400;
/** The largest dot's radius in the still picture. */
const MAX_DOT = 9;
/** The walk shows each chapter this long, in ms. */
export const WALK_MS = 5200;

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Compares two strings by code point: the same order in every locale and engine. */
function byCodePoint(a: string, b: string): number {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!;
    const y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1;
    j += y > 0xffff ? 2 : 1;
  }
  return (i < a.length ? 1 : 0) - (j < b.length ? 1 : 0);
}

/** The number of links at each node, every link counted at both ends. */
export function degrees(g: MapGraph): number[] {
  const d = new Array<number>(g.nodes.length).fill(0);
  for (const l of g.links) {
    d[l.a]++;
    d[l.b]++;
  }
  return d;
}

/** A node's radius from its degree, as on /pantau: the square root, so 100 links are not 100 times wider. */
export const radiusFor = (d: number): number => Math.min(4.5, 0.35 + 0.3 * Math.sqrt(d));

/** The nodes on the map up to chapter `upTo`: those that first appear in it or before. */
export function shownUpTo(g: MapGraph, upTo: number): boolean[] {
  return g.nodes.map((n) => n.chapter <= upTo);
}

/**
 * The bright nodes. With no focus, every shown node. With a focus, the Pelapor, the focus chapter's terlapor
 * (`tl:{id}` for each id in `chapterIds[focus]`), the perkara categories they are members of, and the police reports
 * linked to them: each only if shown. Everything else shown is dim.
 */
export function brightFor(g: MapGraph, chapterIds: readonly (readonly string[])[], focus: number | null, shown: readonly boolean[]): boolean[] {
  if (focus === null) return g.nodes.map((_, i) => !!shown[i]);
  const ids = new Set((chapterIds[focus] ?? []).map((id) => `tl:${id}`));
  const terlapor = new Set<number>();
  const on = new Set<number>();
  g.nodes.forEach((n, i) => {
    if (n.kind === 'center') on.add(i);
    if (ids.has(n.id)) {
      on.add(i);
      terlapor.add(i);
    }
  });
  for (const l of g.links) {
    for (const [t, o] of [[l.a, l.b], [l.b, l.a]]) {
      if (!terlapor.has(t)) continue;
      const other = g.nodes[o];
      if (l.kind === 'member' && other.kind === 'cluster' && other.source === 'perkara') on.add(o);
      if (other.kind === 'member' && other.source === 'laporan') on.add(o);
    }
  }
  return g.nodes.map((_, i) => on.has(i) && !!shown[i]);
}

/**
 * The still picture's 2D layout. Each node is turned about y by `yaw` and about x by `pitch`, which puts the viewer where
 * the 3D camera starts (beside +z, a little to +x and above), and projected straight onto the screen. The whole graph is
 * then fitted into the box inside `pad` with one scale for both axes and centred. `depth` grows toward the viewer, `y`
 * grows down, and every value is rounded to 0.1.
 */
export function project2d(g: MapGraph, w: number, h: number, { yaw = 0.6, pitch = 0.35, pad = 16 }: { yaw?: number; pitch?: number; pad?: number } = {}): { x: number; y: number; depth: number }[] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const raw = g.nodes.map((_, i) => {
    const x = g.pos[i * 3] ?? 0;
    const y = g.pos[i * 3 + 1] ?? 0;
    const z = g.pos[i * 3 + 2] ?? 0;
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    return { x: x1, y: -(y * cp - z1 * sp), depth: y * sp + z1 * cp };
  });
  if (raw.length === 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of raw) {
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y);
  }
  const iw = Math.max(0, w - 2 * pad);
  const ih = Math.max(0, h - 2 * pad);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const fit = Math.min(spanX > 0 ? iw / spanX : Infinity, spanY > 0 ? ih / spanY : Infinity);
  // A single node, or nodes on one spot, have nothing to fit: they sit in the middle.
  const k = Number.isFinite(fit) ? fit : 1;
  const ox = pad + (iw - spanX * k) / 2 - minX * k;
  const oy = pad + (ih - spanY * k) / 2 - minY * k;
  return raw.map((r) => ({ x: round1(r.x * k + ox), y: round1(r.y * k + oy), depth: round1(r.depth * k) }));
}

/** Node i's shown links: non-member links first, then membership, each by the other node's label in code-point order. */
export function neighbours(g: MapGraph, i: number, shown: readonly boolean[]): { other: number; kind: MapLinkKind; dir: 'in' | 'out' }[] {
  const out: { other: number; kind: MapLinkKind; dir: 'in' | 'out' }[] = [];
  for (const l of g.links) {
    if (!shown[l.a] || !shown[l.b]) continue;
    if (l.a === i) out.push({ other: l.b, kind: l.kind, dir: 'out' });
    else if (l.b === i) out.push({ other: l.a, kind: l.kind, dir: 'in' });
  }
  const member = (k: MapLinkKind) => (k === 'member' ? 1 : 0);
  return out.sort((x, y) => member(x.kind) - member(y.kind) || byCodePoint(g.nodes[x.other].label, g.nodes[y.other].label) || x.other - y.other);
}

/** A link's opacity in the still picture: faintest when it touches the Pelapor, at most 0.12 when an end is dim. */
export function stillOpacity(kind: MapLinkKind, center: boolean, dim: boolean): number {
  const base = center ? 0.08 : kind === 'member' ? 0.35 : 0.7;
  return dim ? Math.min(base, 0.12) : base;
}

export interface StillLine { key: string; x1: number; y1: number; x2: number; y2: number; color: string; opacity: number }
export interface StillDot { i: number; key: string; cx: number; cy: number; r: number; fill: string; label: string }
export interface StillPicture {
  /** The shown links, in graph order. */
  lines: StillLine[];
  /** The shown nodes, far to near. */
  dots: StillDot[];
  /** The selection's shown links, from the selection out. */
  hot: Omit<StillLine, 'color' | 'opacity'>[];
  /** The ring around the selection. */
  ring: { cx: number; cy: number; r: number } | null;
}

/**
 * The still picture in the SVG box: what ReportMap.tsx draws without the 3D scene. A dot's radius is radiusFor(degree),
 * scaled so the largest node of the whole graph is 9, so sizes stay the same from chapter to chapter.
 */
export function stillPicture(g: MapGraph, shown: readonly boolean[], bright: readonly boolean[], selected: number | null = null): StillPicture {
  const p = project2d(g, SVG_W, SVG_H);
  const radii = degrees(g).map(radiusFor);
  const k = MAX_DOT / radii.reduce((m, r) => Math.max(m, r), 0.35);
  const center = g.nodes.findIndex((n) => n.kind === 'center');
  const lines = g.links
    .filter((l) => shown[l.a] && shown[l.b])
    .map((l) => ({
      key: `${l.a}-${l.b}`,
      x1: p[l.a].x,
      y1: p[l.a].y,
      x2: p[l.b].x,
      y2: p[l.b].y,
      color: LINK_HEX[l.kind],
      opacity: stillOpacity(l.kind, l.a === center || l.b === center, !bright[l.a] || !bright[l.b]),
    }));
  const dots = g.nodes
    .map((_, i) => i)
    .filter((i) => shown[i])
    .sort((a, b) => p[a].depth - p[b].depth)
    .map((i) => ({
      i,
      key: g.nodes[i].id,
      cx: p[i].x,
      cy: p[i].y,
      r: round1(radii[i] * k),
      fill: bright[i] ? NODE_HEX[g.nodes[i].source] : DIM_HEX,
      label: g.nodes[i].label,
    }));
  const sel = selected !== null && shown[selected] ? selected : null;
  if (sel === null) return { lines, dots, hot: [], ring: null };
  const hot = g.links
    .filter((l) => (l.a === sel || l.b === sel) && shown[l.a] && shown[l.b])
    .map((l) => {
      const o = l.a === sel ? l.b : l.a;
      return { key: `${sel}-${o}`, x1: p[sel].x, y1: p[sel].y, x2: p[o].x, y2: p[o].y };
    });
  return { lines, dots, hot, ring: { cx: p[sel].x, cy: p[sel].y, r: round1((radii[sel] * 1.4 + 0.3) * k) } };
}

/** The numbers the 3D scene takes (world/report-map.ts's ReportMapInput): colours as numbers, radii, and the center's links. */
export function sceneInput(g: MapGraph) {
  const center = g.nodes.findIndex((n) => n.kind === 'center');
  return {
    pos: g.pos,
    radius: g.radius,
    colors: g.nodes.map((n) => parseInt(NODE_HEX[n.source].slice(1), 16)),
    radii: degrees(g).map(radiusFor),
    links: g.links.map((l) => ({ a: l.a, b: l.b, kind: l.kind, center: l.a === center || l.b === center })),
  };
}

export interface RailChip { key: string; value: number | null; kind: 'all' | 'prologue' | 'chapter' | 'finale' }

/** The rail's chips: the whole record (no focus), the prologue (0), each parva (1 to last − 1) and the finale (last). */
export function railChips(last: number): RailChip[] {
  const chips: RailChip[] = [{ key: 'all', value: null, kind: 'all' }, { key: '0', value: 0, kind: 'prologue' }];
  for (let n = 1; n < last; n++) chips.push({ key: String(n), value: n, kind: 'chapter' });
  if (last > 0) chips.push({ key: String(last), value: last, kind: 'finale' });
  return chips;
}

/** Where a walk starts: at the prologue, unless it was paused part-way, when it goes on from there. */
export const walkStart = (focus: number | null, last: number): number => (focus === null || focus >= last ? 0 : focus);

/** The walk's next focus, WALK_MS after the last step, or null once it has shown the last chapter. */
export const walkNext = (focus: number | null, last: number): number | null => (focus === null ? 0 : focus >= last ? null : focus + 1);

/** The terlapor id behind node i when its entry is on this screen (in chapterIds[focus ?? upTo]); otherwise null. */
export function entryFor(g: MapGraph, i: number, chapterIds: readonly (readonly string[])[], focus: number | null, upTo: number): string | null {
  const n = g.nodes[i];
  if (!n || !n.id.startsWith('tl:')) return null;
  const id = n.id.slice(3);
  return (chapterIds[focus ?? upTo] ?? []).includes(id) ? id : null;
}
