// Insights over the recorded rahmatwibowo.net sitemap for the /pantau dashboard. Pure and browser-safe.
// Each function returns null (or an empty list) when the data cannot support a statement, so the page never
// shows a number it cannot back. Facts are counts read from the sitemap; anything about why is left to the
// caller to label as an inference.
import type { Row } from './sitemap-watch';

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(t(d) + n * DAY);

/** Rows with a slug date inside [from, to], both inclusive. */
const datedIn = (rows: readonly Row[], from: string, to: string) => rows.filter((r) => r.idDate && r.idDate >= from && r.idDate <= to);

export interface Velocity { current: number; prior: number; perWeek: number; changePct: number | null; from: string; to: string }

/** Items by slug date in the `days` days ending at `end` against the `days` before that. */
export function velocity(rows: readonly Row[], end: string, days = 30): Velocity | null {
  if (!end) return null;
  const from = addDays(end, -(days - 1));
  const current = datedIn(rows, from, end).length;
  const prior = datedIn(rows, addDays(from, -days), addDays(from, -1)).length;
  if (current + prior === 0) return null;
  return {
    current, prior, from, to: end,
    perWeek: Math.round((current / days) * 7 * 10) / 10,
    changePct: prior > 0 ? Math.round(((current - prior) / prior) * 100) : null,
  };
}

export interface Cadence { busiest: { date: string; count: number }; streak: { from: string; to: string; days: number }; activeDays: number }

/** Busiest slug date and the longest run of consecutive days with at least one dated item. */
export function cadence(rows: readonly Row[]): Cadence | null {
  const byDay = new Map<string, number>();
  for (const r of rows) if (r.idDate) byDay.set(r.idDate, (byDay.get(r.idDate) ?? 0) + 1);
  if (byDay.size === 0) return null;
  const days = [...byDay.keys()].sort();
  let busiest = { date: days[0], count: byDay.get(days[0])! };
  for (const d of days) if (byDay.get(d)! > busiest.count) busiest = { date: d, count: byDay.get(d)! };
  let best = { from: days[0], to: days[0], days: 1 };
  let run = { from: days[0], to: days[0], days: 1 };
  for (let i = 1; i < days.length; i++) {
    run = addDays(days[i - 1], 1) === days[i] ? { from: run.from, to: days[i], days: run.days + 1 } : { from: days[i], to: days[i], days: 1 };
    if (run.days > best.days) best = run;
  }
  return { busiest, streak: best, activeDays: days.length };
}

export interface SeqGap { prefix: string; date: string; missing: number[]; max: number }
export interface SeqGaps { totalMissing: number; datesWithGaps: number; series: number; gaps: SeqGap[] }

const SEQ = /\/([a-z]+)-(\d{8})-(\d{3,})(?:-|\/|$)/;

/**
 * Numbered series (ev-20260607-001, -002, …): numbers below a series' highest that the sitemap does not list.
 * Computed over `all` rows so a text filter never invents a gap; `scope` (the filtered rows) limits which series are
 * reported. A missing number is a fact about the sitemap; why it is missing is not known.
 */
export function sequenceGaps(all: readonly Row[], scope: readonly Row[] = all): SeqGaps | null {
  const series = new Map<string, Set<number>>();
  for (const r of all) {
    const m = r.path.match(SEQ);
    if (!m) continue;
    const key = `${m[1]}|${m[2]}`;
    if (!series.has(key)) series.set(key, new Set());
    series.get(key)!.add(Number(m[3]));
  }
  if (series.size === 0) return null;
  const inScope = new Set(scope.map((r) => r.path.match(SEQ)).filter((m): m is RegExpMatchArray => !!m).map((m) => `${m[1]}|${m[2]}`));
  const gaps: SeqGap[] = [];
  for (const [key, nums] of series) {
    if (!inScope.has(key)) continue;
    const max = Math.max(...nums);
    const missing: number[] = [];
    for (let n = 1; n < max; n++) if (!nums.has(n)) missing.push(n);
    if (missing.length) {
      const [prefix, d] = key.split('|');
      gaps.push({ prefix, date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, missing, max });
    }
  }
  gaps.sort((a, b) => b.missing.length - a.missing.length || b.date.localeCompare(a.date));
  return { totalMissing: gaps.reduce((n, g) => n + g.missing.length, 0), datesWithGaps: gaps.length, series: inScope.size, gaps };
}

/** The UTC offset of a sitemap timestamp ('+07:00'; 'Z' reads as '+00:00'), or null when it carries none. */
export function offsetOf(stamp: string | null | undefined): string | null {
  if (!stamp) return null;
  const m = stamp.match(/(Z|[+-]\d{2}:\d{2})$/);
  return m ? (m[1] === 'Z' ? '+00:00' : m[1]) : null;
}

export interface OffsetCount { offset: string; count: number }

/** How many stamps carry each UTC offset, most common first. */
export function offsetBreakdown(offsets: readonly (string | null)[]): OffsetCount[] {
  const c = new Map<string, number>();
  for (const o of offsets) if (o) c.set(o, (c.get(o) ?? 0) + 1);
  return [...c].map(([offset, count]) => ({ offset, count })).sort((a, b) => b.count - a.count || a.offset.localeCompare(b.offset));
}

export interface WatchEvent { date: string; title: string; href?: string }
export interface EventWindow { event: WatchEvent; before: number; sameDay: number; after: number }

/** Dated items in the `span` days before and after each event (the event day counted on its own). */
export function eventWindows(rows: readonly Row[], events: readonly WatchEvent[], span = 7): EventWindow[] {
  return events.map((event) => ({
    event,
    before: datedIn(rows, addDays(event.date, -span), addDays(event.date, -1)).length,
    sameDay: datedIn(rows, event.date, event.date).length,
    after: datedIn(rows, addDays(event.date, 1), addDays(event.date, span)).length,
  })).filter((w) => w.before + w.sameDay + w.after > 0);
}

export interface EventSummary { events: number; rose: number; fell: number; flat: number; top: EventWindow[] }

export function eventSummary(windows: readonly EventWindow[]): EventSummary | null {
  if (windows.length === 0) return null;
  const rose = windows.filter((w) => w.after > w.before).length;
  const fell = windows.filter((w) => w.after < w.before).length;
  const top = [...windows].sort((a, b) => (b.after - b.before) - (a.after - a.before) || b.event.date.localeCompare(a.event.date)).slice(0, 3);
  return { events: windows.length, rose, fell, flat: windows.length - rose - fell, top };
}

const STOP = new Set([
  'rahmat', 'wibowo', 'rahmatwibowo', 'ev', 'doc', 'media', 'the', 'and', 'of', 'to', 'in', 'on', 'for', 'is', 'with', 'by', 'at', 'as', 'an',
  'from', 'his', 'her', 'he', 'she', 'it', 'its', 'not', 'but', 'was', 'are', 'be', 'or', 'via', 'vs', 'no', 'who', 'what', 'how', 'into',
  'dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'ini', 'itu', 'dengan', 'atau', 'pada', 'tidak', 'juga', 'sebagai', 'oleh', 'ada', 'akan',
  'jadi', 'tentang', 'kepada', 'bukan', 'para', 'sang', 'si', 'nya', 'lagi', 'saat', 'soal',
]);

/** Words of a slug's last segment, without stopwords, numbers or one- and two-letter fragments. */
export function slugTerms(path: string): string[] {
  const seg = path.replace(/\/+$/, '').split('/').pop() ?? '';
  return seg.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/\d/.test(w) && !STOP.has(w));
}

export interface TermTrend { term: string; recent: number; earlier: number }

/**
 * Terms rising in the last `days` days of slug dates: share of recent slugs using the term minus its share before.
 * A term needs `min` recent uses to count, so one-off words do not top the list.
 */
export function risingTerms(rows: readonly Row[], end: string, days = 30, limit = 8, min = 3): TermTrend[] {
  if (!end) return [];
  const from = addDays(end, -(days - 1));
  const recent = new Map<string, number>();
  const earlier = new Map<string, number>();
  let nRecent = 0;
  let nEarlier = 0;
  for (const r of rows) {
    if (!r.idDate || r.idDate > end) continue;
    const bucket = r.idDate >= from ? recent : earlier;
    if (r.idDate >= from) nRecent += 1; else nEarlier += 1;
    for (const w of new Set(slugTerms(r.path))) bucket.set(w, (bucket.get(w) ?? 0) + 1);
  }
  if (nRecent === 0) return [];
  return [...recent]
    .filter(([, n]) => n >= min)
    .map(([term, n]) => ({ term, recent: n, earlier: earlier.get(term) ?? 0, lift: n / nRecent - (nEarlier ? (earlier.get(term) ?? 0) / nEarlier : 0) }))
    .filter((x) => x.lift > 0)
    .sort((a, b) => b.lift - a.lift || b.recent - a.recent || a.term.localeCompare(b.term))
    .slice(0, limit)
    .map(({ term, recent: r, earlier: e }) => ({ term, recent: r, earlier: e }));
}

export interface BulkReset { date: string; count: number; share: number }

/** lastmod days shared by more than `threshold` of the rows: a mass rebuild, not that many separate edits. */
export function bulkResets(rows: readonly Row[], threshold = 0.2, minRows = 20): BulkReset[] {
  if (rows.length < minRows) return [];
  const c = new Map<string, number>();
  for (const r of rows) if (r.lastmod) c.set(r.lastmod, (c.get(r.lastmod) ?? 0) + 1);
  return [...c]
    .filter(([, n]) => n / rows.length > threshold)
    .map(([date, count]) => ({ date, count, share: Math.round((count / rows.length) * 100) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- deeper insights (fork C) ----------
import { waves, weekdays, pct, type Wave } from './cross-insights';
import { GROUPS, type Group } from './sitemap-watch';

/** How many slugs carry the Pelapor's name ("rahmat-wibowo"), overall and in /evidence/: the site is about him by name. */
export function nameInSlugs(rows: readonly Row[], name = 'rahmat-wibowo'): { n: number; total: number; share: number; evidence: number; evidenceTotal: number } | null {
  if (!rows.length) return null;
  const hit = rows.filter((r) => r.path.toLowerCase().includes(name));
  const ev = rows.filter((r) => r.group === 'evidence');
  return { n: hit.length, total: rows.length, share: pct(hit.length, rows.length), evidence: ev.filter((r) => r.path.toLowerCase().includes(name)).length, evidenceTotal: ev.length };
}

/** Items per weekday of their slug date (0 = Monday). */
export const slugWeekdays = (rows: readonly Row[]) => weekdays(rows.map((r) => r.idDate).filter((d): d is string => !!d));

/** Bursts of dated items: runs separated by more than `gap` quiet days. */
export const slugWaves = (rows: readonly Row[], gap = 21, min = 10): Wave[] => waves(rows.map((r) => r.idDate).filter((d): d is string => !!d), gap, min);

/** Items per group by slug date in the last `days` days ending at `end`, as items per week. */
export function sectionVelocity(rows: readonly Row[], end: string, days = 30): { group: Group; n: number; perWeek: number }[] {
  if (!end) return [];
  const from = addDays(end, -(days - 1));
  return GROUPS.map((g) => {
    const n = rows.filter((r) => r.group === g && r.idDate && r.idDate >= from && r.idDate <= end).length;
    return { group: g, n, perWeek: Math.round((n / days) * 7 * 10) / 10 };
  }).filter((x) => x.n > 0);
}
