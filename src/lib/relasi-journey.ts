// The "museum" layer of the 3D relationship map (src/components/RelasiGraph3D.tsx): every dated item of the three sources
// tied to the graph nodes it concerns, grouped into half-year rooms with a few featured exhibits each. Pure and
// browser-safe; the page builds it at build time and serves it as /pantau-data/journey.json.
//
// Nothing here is a finding. Events are dated entries of the Pelapor's case file, Fomo posts and rahmatwibowo.net pages,
// exactly as the other /pantau views list them; "act" events are the Pelapor's allegations.
import type { GNode } from './relasi';
import { KINDS, dayOf, type Kind, type StageInput } from './pantau-3d';

export interface JEvent {
  /** YYYY-MM-DD (month-only dates sit on the 15th) */
  d: string; k: Kind;
  /** group label (company, section, terlapor, ...) */
  g: string;
  /** short title */
  t: string;
  /** body text, clipped */
  x: string;
  /** graph nodes this event concerns (not including the Pelapor, who is in all of them) */
  nodes: string[];
}
export interface JChapter {
  id: number; from: string; to: string;
  counts: Record<Kind, number>;
  newTerlapor: number; newAkun: number;
  /** featured exhibits: indices into Journey.events, oldest first */
  highlights: number[];
  /** index range of this chapter's events in Journey.events */
  first: number; last: number;
}
export interface Journey { events: JEvent[]; chapters: JChapter[]; nodeDay: Record<string, string>; start: string; end: string }

const MAX = { fomo: 260, act: 420, resp: 420, against: 200 } as const;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const PLACEHOLDER = /^(deleteduser|\[deleted\]|pengguna|anonymous|anonim|user)$/i;
const SECTIONS = ['evidence', 'targets', 'documents'];
/** Featured exhibits per room and kind. */
const QUOTA: Record<Kind, number> = { against: 2, resp: 3, act: 2, fomo: 1, site: 1 };

/** `n` items spread evenly across `arr` (all of it when shorter). */
function spread<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(((i + 0.5) * arr.length) / n)]);
}

const half = (d: string) => `${d.slice(0, 4)}-${Number(d.slice(5, 7)) <= 6 ? 1 : 2}`;

export function buildJourney(i: StageInput, nodes: readonly GNode[]): Journey {
  const ids = new Set(nodes.map((n) => n.id));
  const keep = (list: string[]) => list.filter((id) => ids.has(id));
  const out: JEvent[] = [];
  for (const r of i.site) {
    if (!r.idDate) continue;
    const slug = r.path.replace(/^\/[^/]+\//, '').replace(/\/$/, '');
    out.push({ d: r.idDate, k: 'site', g: `${r.section}/`, t: clip(slug, 80), x: '', nodes: keep([`site:${SECTIONS.includes(r.section) ? r.section : 'other'}`]) });
  }
  for (const p of i.fomo) {
    if (!p.iso) continue;
    const gone = PLACEHOLDER.test(p.akun);
    out.push({ d: p.iso, k: 'fomo', g: gone ? 'akun terhapus' : p.perusahaan ?? 'tanpa lencana', t: p.akun, x: clip(p.teks, MAX.fomo), nodes: keep([gone ? 'fm:deleted' : `fa:${p.akun}`, `ft:${p.thread}`]) });
  }
  for (const r of i.kronologis) {
    const d = dayOf(r.iso, r.precision);
    if (!d) continue;
    const who = r.terlapor.map((id) => i.terlaporNames[id] ?? id).join(', ');
    const nodeIds = keep(r.terlapor.map((id) => `tl:${id}`));
    if (r.jenis === 'Perbuatan') out.push({ d, k: 'act', g: who || '–', t: who || r.jenis, x: clip(r.peristiwa, MAX.act), nodes: nodeIds });
    else if (r.jenis === 'Somasi' || r.jenis === 'Aduan') out.push({ d, k: 'resp', g: r.jenis, t: `${r.jenis}${who ? `: ${who}` : ''}`, x: clip(r.peristiwa, MAX.resp), nodes: nodeIds });
  }
  for (const l of i.laporan) {
    const d = dayOf(l.tanggal);
    if (!d) continue;
    const who = l.terlapor.map((id) => i.terlaporNames[id] ?? id).join(', ');
    const nodeIds = keep([`lp:${l.no}`, ...l.terlapor.map((id) => `tl:${id}`)]);
    if (l.arah === 'terhadap-pelapor') out.push({ d, k: 'against', g: 'laporan terhadap Pelapor', t: l.nomor, x: clip(`${l.no}${l.pelapor ? ` · ${l.pelapor}` : ''}`, MAX.against), nodes: nodeIds });
    else out.push({ d, k: 'resp', g: 'Laporan polisi', t: l.nomor, x: clip(`${l.no}${who ? ` · ${who}` : ''}`, MAX.resp), nodes: nodeIds });
  }
  const order = new Map(KINDS.map((k, n) => [k, n]));
  const events = out.sort((a, b) => a.d.localeCompare(b.d) || order.get(a.k)! - order.get(b.k)! || a.t.localeCompare(b.t));
  if (!events.length) return { events, chapters: [], nodeDay: {}, start: '', end: '' };
  const start = events[0].d;
  const end = events[events.length - 1].d;

  // First day each node is concerned by an event; groups and sources take the earliest day of their members.
  const nodeDay: Record<string, string> = {};
  for (const e of events) for (const id of e.nodes) if (!nodeDay[id] || e.d < nodeDay[id]) nodeDay[id] = e.d;
  for (let pass = 0; pass < 2; pass++) {
    for (const n of nodes) {
      const own = nodeDay[n.id];
      if (n.parent && own && (!nodeDay[n.parent] || own < nodeDay[n.parent])) nodeDay[n.parent] = own;
    }
  }
  if (ids.has('rw')) nodeDay.rw = start;

  const chapters = periodsFor({ events, nodeDay }, 'room');
  return { events, chapters, nodeDay, start, end };
}

export const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export type Granularity = 'room' | 'month' | 'day';
const keyOf = (d: string, g: Granularity) => (g === 'day' ? d : g === 'month' ? d.slice(0, 7) : half(d));
const PRIORITY: Kind[] = ['against', 'resp', 'act', 'fomo', 'site'];

/**
 * The timeline cut into rooms (half-years), months or single days that have events. Each period carries its counts, how
 * many terlapor and Fomo accounts first appear in it, and its featured exhibits (a day shows all of its events, up to 8).
 */
export function periodsFor(j: Pick<Journey, 'events' | 'nodeDay'>, g: Granularity): JChapter[] {
  const { events, nodeDay } = j;
  const firsts = Object.entries(nodeDay);
  const out: JChapter[] = [];
  let idx = 0;
  while (idx < events.length) {
    const key = keyOf(events[idx].d, g);
    let last = idx;
    while (last + 1 < events.length && keyOf(events[last + 1].d, g) === key) last++;
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
    const byKind = new Map<Kind, number[]>();
    for (let n = idx; n <= last; n++) {
      counts[events[n].k]++;
      byKind.set(events[n].k, [...(byKind.get(events[n].k) ?? []), n]);
    }
    const from = events[idx].d;
    const to = events[last].d;
    const inside = (id: string, prefix: string) => id.startsWith(prefix) && nodeDay[id] >= from && nodeDay[id] <= to;
    const all = Array.from({ length: last - idx + 1 }, (_, i) => idx + i);
    const highlights = g === 'day' ? spread(all, 8) : KINDS.flatMap((k) => spread(byKind.get(k) ?? [], QUOTA[k])).sort((a, b) => a - b);
    out.push({
      id: out.length, from, to, counts, highlights, first: idx, last,
      newTerlapor: firsts.filter(([id]) => inside(id, 'tl:')).length,
      newAkun: firsts.filter(([id]) => inside(id, 'fa:')).length,
    });
    idx = last + 1;
  }
  return out;
}

/** The period a day belongs to: for rooms the last one started by then; for months and days only an exact match (else null). */
export function periodAt(periods: JChapter[], day: string, g: Granularity): JChapter | null {
  if (!periods.length) return null;
  if (g === 'room') {
    let at = periods[0];
    for (const c of periods) if (c.from <= day) at = c;
    return at;
  }
  const k = keyOf(day, g);
  return periods.find((c) => keyOf(c.from, g) === k) ?? null;
}

/** The most telling event of a period: the first of the most serious kind present. */
export function exemplar(j: Pick<Journey, 'events'>, c: JChapter): number {
  for (const k of PRIORITY) for (let n = c.first; n <= c.last; n++) if (j.events[n].k === k) return n;
  return c.first;
}

/** The room a day falls in: the last room that has started by then (the first room before any). */
export function chapterAt(j: Journey, day: string): number {
  return periodAt(j.chapters, day, 'room')?.id ?? 0;
}

/**
 * The stops of the guided walk. Rooms: every featured exhibit. Months and days: one stop per period, its most telling
 * event, so the walk steps month by month or day by day.
 */
export function walkStops(j: Journey, periods: JChapter[] = j.chapters, g: Granularity = 'room'): number[] {
  if (g === 'room') return periods.flatMap((c) => c.highlights).sort((a, b) => a - b);
  return periods.map((c) => exemplar(j, c));
}
