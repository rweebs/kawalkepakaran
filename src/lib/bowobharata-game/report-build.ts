// Builds the chapter reports' data (GameData.report, the types in report-types.ts) at build time, from the dossier, PARVAS
// and the linimasa. Only data-build.ts imports it. It adds no facts of its own: category E is left out, and the record
// map is the terlapor and police-report part of the /pantau graph, laid out once by /pantau's own layout3d.
import { PARVAS } from '../bowobharata';
import { kategoriKey, tahapan, type Laporan, type Perkara, type Terlapor, type TerlaporKronologi } from '../perkara';
import type { Fomo } from '../fomo';
import { buildGraph, type GEdge, type GNode } from '../relasi';
import { layout3d } from '../relasi-3d';
import type { WatchStore } from '../sitemap-watch';
import { countedRows, parvaWindow, type Chapter } from './record';
import type { Bin, ChapterReport, Count, MapGraph, MapLink, MapLinkKind, MapNode, ReportData, ReportDot } from './report-types';

/** buildGraph reads the rahmatwibowo.net and Fomo stores for nodes the record map drops, so it gets empty ones. */
export const EMPTY_SITE: WatchStore = { source: '', snapshots: [], urls: {} };
export const EMPTY_FOMO: Fomo = {
  meta: { judul: '', objek: '', catatan: [], dibuat: null, total: {}, dikecualikan: 0 },
  accounts: [], posts: [], threads: [],
};

const MAP_LINK_KINDS: readonly MapLinkKind[] = ['in-allegation', 'out-response', 'against', 'member'];
const isLinkKind = (k: string): k is MapLinkKind => (MAP_LINK_KINDS as readonly string[]).includes(k);

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const round2 = (v: number): number => Math.round(v * 100) / 100 + 0;

const lastDayOf = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** Every month key from `from` to `to`, inclusive. */
function monthRange(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) keys.push(k);
  return keys;
}

const isDayOrMonth = (r: TerlaporKronologi): boolean => r.precision === 'day' || r.precision === 'month';

/** One bin per month from the first to the last row dated to a month or day; rows dated more coarsely count in `undated`. */
function monthBins(rows: readonly TerlaporKronologi[], span?: { from: string; to: string }): { bins: Bin[]; undated: number } {
  const dated = rows.filter(isDayOrMonth);
  const undated = rows.length - dated.length;
  if (dated.length === 0 && !span) return { bins: [], undated };
  const keys = dated.map((r) => (r.iso as string).slice(0, 7)).sort();
  const from = span ? span.from.slice(0, 7) : keys[0];
  const to = span ? span.to.slice(0, 7) : keys[keys.length - 1];
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return { bins: monthRange(from, to).map((key) => ({ key, n: counts.get(key) ?? 0 })), undated };
}

/** One bin per day of the window; rows dated to anything but a day count in `undated`. */
function dayBins(rows: readonly TerlaporKronologi[], w: { from: string; to: string }): { bins: Bin[]; undated: number } {
  const counts = new Map<string, number>();
  let undated = 0;
  for (const r of rows) {
    if (r.precision === 'day') counts.set(r.iso as string, (counts.get(r.iso as string) ?? 0) + 1);
    else undated++;
  }
  const bins: Bin[] = [];
  for (let d = w.from; d <= w.to; d = addDays(d, 1)) bins.push({ key: d, n: counts.get(d) ?? 0 });
  return { bins, undated };
}

const byCountThenLabel = (a: Count, b: Count): number => b.n - a.n || cmp(a.label, b.label);

function countPasal(lists: readonly (readonly string[])[]): Count[] {
  const n = new Map<string, number>();
  for (const list of lists) for (const label of list) n.set(label, (n.get(label) ?? 0) + 1);
  return [...n].map(([label, c]) => ({ label, n: c })).sort(byCountThenLabel);
}

function chapterReport(c: Chapter, i: number, p: Perkara, byId: ReadonlyMap<string, Terlapor>): ChapterReport {
  const rows = c.entries.flatMap((e) => e.rows);
  const fresh = c.entries.filter((e) => e.full).length;
  const unit = i >= 1 && i <= PARVAS.length ? 'day' : 'month';
  const { bins, undated } = rows.length === 0 ? { bins: [], undated: 0 }
    : unit === 'day' && c.window ? dayBins(rows, c.window) : monthBins(rows);
  return {
    names: c.entries.length,
    fresh,
    again: c.entries.length - fresh,
    acts: rows.filter((r) => r.jenis === 'Perbuatan').length,
    replies: rows.filter((r) => r.jenis === 'Tanggapan').length,
    pasal: countPasal(c.entries.map((e) => e.pasal)),
    reports: new Set(c.entries.flatMap((e) => e.laporan)).size,
    stages: tahapan(c.entries.map((e) => byId.get(e.id) as Terlapor), p.laporan),
    unit,
    bins,
    undated,
  };
}

function reportDots(laporan: readonly Laporan[]): ReportDot[] {
  const dots = laporan.map((l) => ({ no: l.no, date: l.tanggal, dir: l.arah === 'oleh-pelapor' ? 'by' as const : 'against' as const }));
  const dated = dots.filter((d) => d.date !== null).sort((a, b) => cmp(a.date as string, b.date as string) || cmp(a.no, b.no));
  const undated = dots.filter((d) => d.date === null).sort((a, b) => cmp(a.no, b.no));
  return [...dated, ...undated];
}

function recordMap(p: Perkara, chapters: readonly Chapter[]): MapGraph {
  const graph = buildGraph(EMPTY_SITE, p, EMPTY_FOMO, []);
  const kept: GNode[] = graph.nodes.filter((n) => (n.source === 'rw' || n.source === 'perkara' || n.source === 'laporan')
    && n.id !== 'pk:E' && n.parent !== 'pk:E');
  const keptIds = new Set(kept.map((n) => n.id));
  const keptEdges: GEdge[] = graph.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
  const layout = layout3d(kept, keptEdges, { seed: 7 });

  const last = chapters.length - 1;
  const fullChapter = new Map<string, number>();
  chapters.forEach((c, i) => { for (const e of c.entries) if (e.full) fullChapter.set(`tl:${e.id}`, i); });

  const chapterOf = new Map<string, number>();
  for (const n of kept) if (n.id.startsWith('tl:')) chapterOf.set(n.id, fullChapter.get(n.id) ?? 0);
  for (const n of kept) {
    if (n.source === 'perkara' && n.kind === 'cluster') {
      const members = kept.filter((m) => m.parent === n.id).map((m) => chapterOf.get(m.id) ?? 0);
      chapterOf.set(n.id, members.length ? Math.min(...members) : 0);
    }
  }
  for (const n of kept) {
    if (n.source !== 'laporan' || n.kind !== 'member') continue;
    const linked = keptEdges.flatMap((e) => (e.from === n.id ? [e.to] : e.to === n.id ? [e.from] : []))
      .filter((id) => id.startsWith('tl:')).map((id) => chapterOf.get(id) as number);
    chapterOf.set(n.id, linked.length ? Math.min(...linked) : last);
  }
  const chapterFor = (id: string): number => chapterOf.get(id) ?? 0;

  const nodes: MapNode[] = kept.map((n) => ({ id: n.id, kind: n.kind, source: n.source as MapNode['source'], label: n.label, chapter: chapterFor(n.id) }));
  const links: MapLink[] = layout.links.map((l) => {
    if (!isLinkKind(l.kind)) throw new Error(`record map: unexpected link kind ${l.kind}`);
    return { a: l.a, b: l.b, kind: l.kind, chapter: Math.max(nodes[l.a].chapter, nodes[l.b].chapter) };
  });
  return { nodes, links, pos: Array.from(layout.positions, round2), radius: round2(layout.radius) };
}

export function reportData(p: Perkara, chapters: Chapter[]): ReportData {
  const byId = new Map(p.terlapor.map((t) => [t.id, t]));
  const nonE = p.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E');
  const rows = nonE.flatMap(countedRows);
  const windows = PARVAS.map(parvaWindow);

  const dated = rows.filter(isDayOrMonth);
  const firstMonth = dated.map((r) => (r.iso as string).slice(0, 7)).sort()[0];
  const lastWindowEnd = windows[windows.length - 1]?.to ?? '';
  const rowEnd = (r: TerlaporKronologi): string => (r.precision === 'month' ? lastDayOf(r.iso as string) : (r.iso as string));
  const lastRowEnd = dated.map(rowEnd).sort().pop() ?? '';
  const span = { from: firstMonth ? `${firstMonth}-01` : windows[0]?.from ?? '', to: lastRowEnd > lastWindowEnd ? lastRowEnd : lastWindowEnd };
  const { bins: months, undated } = monthBins(rows, span);

  return {
    span,
    months,
    undated,
    windows,
    chapters: chapters.map((c, i) => chapterReport(c, i, p, byId)),
    fresh: chapters.map((c) => c.entries.filter((e) => e.full).length),
    pasal: countPasal(nonE.map((t) => t.pasal)),
    stages: tahapan(nonE, p.laporan),
    reports: reportDots(p.laporan),
    map: recordMap(p, chapters),
  };
}

/** The first paragraph, trimmed; past 280 characters it is cut at the last space and ends in an ellipsis. */
export function summaryOf(paragraphs: readonly string[]): string {
  const first = (paragraphs[0] ?? '').trim();
  if (first.length <= 280) return first;
  const at = first.lastIndexOf(' ', 279);
  return `${first.slice(0, at > 0 ? at : 279)}…`;
}
