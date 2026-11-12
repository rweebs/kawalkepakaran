// Shapes the recorded rahmatwibowo.net sitemap (src/data/sitemap-watch.json) into what the /pantau dashboard draws.
// Pure and browser-safe: the page computes the rows at build time, the island re-aggregates them as filters change.
//
// Three different dates, never mixed up on the page:
// - idDate: the date the operator wrote into an item's slug (ev-20260607-…). Says when the item is dated, not when it went live.
// - lastmod: the sitemap's last-modified stamp. Bulk rebuilds move hundreds at once, so it measures edits, not growth.
// - firstSeen: the first snapshot that listed the URL. The only true growth measure, and it starts with the first snapshot.

export const WATCH_ORIGIN = 'https://rahmatwibowo.net';

/** Fixed stacking order. Each group keeps its color whatever the filter (validated adjacent-pair order). */
export const GROUPS = ['targets', 'evidence', 'documents', 'other'] as const;
export type Group = (typeof GROUPS)[number];

export interface WatchUrl { firstSeen: string; lastSeen: string; lastmod: string | null; images: number }
/** How a snapshot was fetched: anyone can re-hash source/sitemap-watch/<date>.xml.gz and compare with sha256. */
export interface WatchProvenance {
  fetchedAt: string;
  status: number;
  finalUrl: string;
  bytes: number;
  sha256: string;
  wayback?: { url: string; status?: number; error?: string }[];
}
export interface WatchSnapshot { date: string; total: number; images: number; sections: Record<string, number>; provenance?: WatchProvenance }
export interface WatchStore { source: string; snapshots: WatchSnapshot[]; urls: Record<string, WatchUrl> }

export interface Row {
  path: string;
  group: Group;
  section: string;
  idDate: string | null;
  lastmod: string | null;
  firstSeen: string;
  lastSeen: string;
  removed: boolean;
  images: number;
}

export const sectionOf = (path: string): string => path.replace(/^\/+/, '').split('/')[0] || '(root)';

export function groupOf(section: string): Group {
  return section === 'targets' || section === 'evidence' || section === 'documents' ? section : 'other';
}

/** The date the operator embedded in the slug: /evidence/ev-20260607-007-…/ -> 2026-06-07. Rejects impossible dates. */
export function idDateOf(path: string): string | null {
  const m = path.match(/\/[a-z]+-(\d{4})(\d{2})(\d{2})-\d+/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** A sitemap timestamp as a Jakarta (UTC+7) calendar day, so +00:00 and +07:00 stamps land on the same day. */
export function jakartaDayOf(stamp: string | null): string | null {
  if (!stamp) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
  const t = Date.parse(stamp);
  return Number.isNaN(t) ? null : new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
}

export function toRows(store: WatchStore): Row[] {
  const latest = store.snapshots.at(-1)?.date ?? '';
  return Object.entries(store.urls).map(([path, u]) => {
    const section = sectionOf(path);
    return {
      path, section, group: groupOf(section), idDate: idDateOf(path), lastmod: jakartaDayOf(u.lastmod),
      firstSeen: u.firstSeen, lastSeen: u.lastSeen, removed: u.lastSeen < latest, images: u.images,
    };
  });
}

export type Basis = 'id' | 'lastmod' | 'firstSeen';
export interface Filters {
  groups: readonly Group[];
  q: string;
  basis: Basis;
  from: string;
  to: string;
  status: 'all' | 'listed' | 'removed';
}
export const DEFAULT_FILTERS: Filters = { groups: GROUPS, q: '', basis: 'id', from: '', to: '', status: 'all' };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[-_/]+/g, ' ');
export const dateOn = (r: Row, basis: Basis): string | null => (basis === 'id' ? r.idDate : basis === 'lastmod' ? r.lastmod : r.firstSeen);

/** Rows matching every filter. A date range drops rows that have no date on the chosen basis. */
export function filterRows(rows: readonly Row[], f: Filters): Row[] {
  const q = norm(f.q).trim();
  const groups = new Set(f.groups);
  return rows.filter((r) => {
    if (!groups.has(r.group)) return false;
    if (f.status === 'listed' && r.removed) return false;
    if (f.status === 'removed' && !r.removed) return false;
    if (q && !norm(r.path).includes(q)) return false;
    if (f.from || f.to) {
      const d = dateOn(r, f.basis);
      if (!d || (f.from && d < f.from) || (f.to && d > f.to)) return false;
    }
    return true;
  });
}

export type Counts = Record<Group, number>;
export const zero = (): Counts => ({ targets: 0, evidence: 0, documents: 0, other: 0 });
export const sum = (c: Counts): number => GROUPS.reduce((n, g) => n + c[g], 0);

export function countByGroup(rows: readonly Row[]): Counts {
  const c = zero();
  for (const r of rows) c[r.group] += 1;
  return c;
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export interface MonthBucket { key: string; earlier: boolean; counts: Counts }

/**
 * Items per month of their slug date, over the `span` months ending at the newest dated item. Anything older is folded
 * into one leading "earlier" bucket so a few stray old items don't stretch the axis across empty years.
 */
export function monthly(rows: readonly Row[], span = 12): MonthBucket[] {
  const dated = rows.filter((r) => r.idDate);
  if (dated.length === 0) return [];
  const last = dated.reduce((m, r) => (r.idDate! > m ? r.idDate! : m), '').slice(0, 7);
  const first = addMonths(last, -(span - 1));
  const buckets: MonthBucket[] = Array.from({ length: span }, (_, i) => ({ key: addMonths(first, i), earlier: false, counts: zero() }));
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  const earlier: MonthBucket = { key: first, earlier: true, counts: zero() };
  for (const r of dated) {
    const ym = r.idDate!.slice(0, 7);
    (ym < first ? earlier : byKey.get(ym)!).counts[r.group] += 1;
  }
  return sum(earlier.counts) > 0 ? [earlier, ...buckets] : buckets;
}

export interface CumPoint { date: string; total: number; added: number }

/** Running total of rows by the chosen date, one point per day that added any. Rows without that date are left out. */
export function cumulative(rows: readonly Row[], basis: Basis = 'id'): CumPoint[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = dateOn(r, basis);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  let total = 0;
  return [...byDay.keys()].sort().map((date) => {
    const added = byDay.get(date)!;
    total += added;
    return { date, total, added };
  });
}

export interface DayBucket { date: string; counts: Counts }

/**
 * Rows per day over the `days` days ending at `end` (inclusive), by the chosen date: 'id' = items dated that day,
 * 'lastmod' = pages last edited that day, 'firstSeen' = URLs a snapshot listed for the first time that day.
 * `baseline` (the first snapshot) is skipped for 'firstSeen': everything was "first seen" then, which is not growth.
 */
export function daily(rows: readonly Row[], end: string, days = 60, basis: Basis = 'lastmod', baseline?: string): DayBucket[] {
  const endT = Date.parse(`${end}T00:00:00Z`);
  const out: DayBucket[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(endT - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10), counts: zero(),
  }));
  const idx = new Map(out.map((b, i) => [b.date, i]));
  for (const r of rows) {
    const d = dateOn(r, basis);
    if (basis === 'firstSeen' && d === baseline) continue;
    const i = d ? idx.get(d) : undefined;
    if (i !== undefined) out[i].counts[r.group] += 1;
  }
  return out;
}

/** The rows behind one day of `daily`, newest path order kept stable. */
export function rowsOnDay(rows: readonly Row[], day: string, basis: Basis): Row[] {
  return rows.filter((r) => dateOn(r, basis) === day).sort((a, b) => a.path.localeCompare(b.path));
}

export interface SnapPoint { date: string; total: number; counts: Counts }

/** URLs listed at each snapshot, limited to the chosen groups. */
export function snapshotSeries(snapshots: readonly WatchSnapshot[], groups: readonly Group[] = GROUPS): SnapPoint[] {
  const keep = new Set(groups);
  return snapshots.map((s) => {
    const counts = zero();
    for (const [section, n] of Object.entries(s.sections)) counts[groupOf(section)] += n;
    for (const g of GROUPS) if (!keep.has(g)) counts[g] = 0;
    return { date: s.date, total: sum(counts), counts };
  });
}

/** Change at the newest snapshot: paths it lists for the first time, and paths the one before listed but it does not. */
export function latestChange(rows: readonly Row[], snapshots: readonly WatchSnapshot[]): { added: number; removed: number } | null {
  if (snapshots.length < 2) return null;
  const latest = snapshots.at(-1)!.date;
  const prev = snapshots.at(-2)!.date;
  return {
    added: rows.filter((r) => r.firstSeen === latest).length,
    removed: rows.filter((r) => r.lastSeen === prev).length,
  };
}

/** Whole days from the newest snapshot to `today` (both YYYY-MM-DD), never negative. */
export function snapshotAgeDays(latest: string, today: string): number {
  const d = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest}T00:00:00Z`)) / 86_400_000);
  return Number.isNaN(d) ? 0 : Math.max(0, d);
}

/** The filtered rows as CSV, for the download button. Cells that a spreadsheet would run as a formula get a leading quote. */
export function toCsv(rows: readonly Row[]): string {
  const head = ['url', 'section', 'slug_date', 'lastmod_day', 'first_seen', 'status', 'images'];
  const esc = (v: string | number | null) => {
    const raw = v === null ? '' : String(v);
    const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(','), ...rows.map((r) => [
    `${WATCH_ORIGIN}${r.path}`, r.section, r.idDate, r.lastmod, r.firstSeen, r.removed ? 'removed' : 'listed', r.images,
  ].map(esc).join(','))].join('\n');
}
