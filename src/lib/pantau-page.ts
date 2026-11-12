// Page-level numbers and small derived datasets for /pantau: the hero strip, the harm-vs-response chart, the operator's
// most-written-about terlapor, harm categories, and the site-section evidence views (removals, images, slug-date gaps,
// archive coverage). Pure and browser-safe; every function takes the already-loaded datasets.
import { ATTACK, daysBetween, monthRange, slugify, streamDates, type CrossInput, type Stream } from './cross-insights';
import type { Row, WatchSnapshot } from './sitemap-watch';
import type { Terlapor } from './perkara';

// ---------- hero ----------

export interface Hero {
  siteUrls: number; fomoPosts: number; fomoThreads: number; terlapor: number; reportsOwn: number; reportsAgainst: number;
  firstHarm: string | null; lastHarm: string | null; daysTargeted: number | null; firstFomo: string | null;
}

/** The headline numbers about Rahmat as the target of three sources, and how long it has gone on. */
export function hero(x: CrossInput & { siteTotal: number; fomoThreads: number }, asOf: string): Hero {
  const d = streamDates(x);
  const harm = ATTACK.flatMap((s) => d[s]).sort();
  const firstHarm = harm[0] ?? null;
  return {
    siteUrls: x.siteTotal, fomoPosts: x.fomo.length, fomoThreads: x.fomoThreads, terlapor: x.terlapor.length,
    reportsOwn: x.laporan.filter((l) => l.arah === 'oleh-pelapor').length,
    reportsAgainst: x.laporan.filter((l) => l.arah === 'terhadap-pelapor').length,
    firstHarm, lastHarm: harm.at(-1) ?? null, daysTargeted: firstHarm ? daysBetween(firstHarm, asOf) : null,
    firstFomo: [...d.fomo].sort()[0] ?? null,
  };
}

/** "3 tahun 2 bulan" from a day count (calendar-free: 365.25-day years, 30.44-day months). */
export function yearsMonths(days: number): { years: number; months: number } {
  const months = Math.floor(days / 30.44);
  return { years: Math.floor(months / 12), months: months % 12 };
}

// ---------- harm vs response ----------

export interface HarmResponse { months: string[]; harm: number[]; response: number[]; waves: { from: string; to: string; harm: number; response: number }[] }

/**
 * Content aimed at Rahmat per month (site + Fomo + alleged acts, all counted as items) against his own somasi and aduan
 * per month, on one month axis and one count scale (same unit), plus the stretches of consecutive non-empty harm months.
 */
export function harmVsResponse(x: CrossInput): HarmResponse | null {
  const d = streamDates(x);
  const harmDates = ATTACK.flatMap((s: Stream) => d[s]);
  const all = [...harmDates, ...d.respons].sort();
  if (!all.length) return null;
  const months = monthRange(all[0], all.at(-1)!);
  const idx = new Map(months.map((m, i) => [m, i]));
  const harm = months.map(() => 0);
  const response = months.map(() => 0);
  for (const s of harmDates) harm[idx.get(s.slice(0, 7))!] += 1;
  for (const s of d.respons) response[idx.get(s.slice(0, 7))!] += 1;
  const waves: HarmResponse['waves'] = [];
  let start = -1;
  for (let i = 0; i <= months.length; i++) {
    const on = i < months.length && harm[i] > 0;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      const sum = (a: number[]) => a.slice(start, i).reduce((p, c) => p + c, 0);
      if (sum(harm) >= 20) waves.push({ from: months[start], to: months[i - 1], harm: sum(harm), response: sum(response) });
      start = -1;
    }
  }
  return { months, harm, response, waves };
}

// ---------- the operator's focus ----------

/**
 * Terlapor the hostile site writes about most: how many of its /evidence/ slugs contain the terlapor's full name as a
 * slug (exact, so two different people are never merged). Only terlapor with at least one match are returned.
 */
export function operatorFocus(site: readonly Row[], terlapor: readonly Terlapor[]): { id: string; nama: string; evidence: number }[] {
  const ev = site.filter((r) => r.section === 'evidence').map((r) => `-${r.path.split('/').filter(Boolean)[1] ?? ''}-`);
  return terlapor.flatMap((t) => {
    const s = slugify(t.nama);
    // Two words minimum, so a single first name never counts as a match.
    if (s.split('-').length < 2) return [];
    const n = ev.filter((e) => e.includes(`-${s}-`)).length;
    return n ? [{ id: t.id, nama: t.nama, evidence: n }] : [];
  }).sort((a, b) => b.evidence - a.evidence || a.id.localeCompare(b.id));
}

// ---------- harm categories (from the Pelapor's own pasal mapping) ----------

export const HARM = ['pencemaran', 'fitnah', 'penghinaan', 'ancaman', 'bohong', 'data', 'disabilitas', 'lain'] as const;
export type Harm = (typeof HARM)[number];

/**
 * Which harm a mapped pasal names. General provisions (participation, corporate liability, scope: KUHP 3, 20, 21, 45-49,
 * 126) are not a harm and return null. The grouping is this page's reading of the article numbers, not a legal opinion.
 */
export function harmOf(pasal: string): Harm | null {
  const m = pasal.match(/^(\d+[A-Z]?)\s+(.*)$/);
  if (!m) return 'lain';
  const [, n, law] = m;
  if (/KUHP/.test(law)) {
    if (['3', '20', '21', '45', '46', '48', '49', '126'].includes(n)) return null;
    if (['433', '440', '441'].includes(n)) return 'pencemaran';
    if (n === '434') return 'fitnah';
    if (n === '436') return 'penghinaan';
    if (['263', '264'].includes(n)) return 'bohong';
    if (['448', '492', '495'].includes(n)) return 'ancaman';
    return 'lain';
  }
  if (/ITE/.test(law)) {
    if (['27A', '45'].includes(n)) return 'pencemaran';
    if (['29', '45B'].includes(n)) return 'ancaman';
    if (['28', '45A'].includes(n)) return 'bohong';
    return 'lain';
  }
  if (/Data Pribadi/.test(law)) return 'data';
  if (/Disabilitas/.test(law)) return 'disabilitas';
  return 'lain';
}

/** Terlapor per harm category (a terlapor counts once per category, however many of its articles fall there). */
export function harmCategories(terlapor: readonly Terlapor[]): { harm: Harm; terlapor: number; pasal: string[] }[] {
  const by = new Map<Harm, { ids: Set<string>; pasal: Set<string> }>();
  for (const t of terlapor) for (const p of t.pasal) {
    const h = harmOf(p);
    if (!h) continue;
    const e = by.get(h) ?? { ids: new Set<string>(), pasal: new Set<string>() };
    e.ids.add(t.id);
    e.pasal.add(p);
    by.set(h, e);
  }
  return [...by].map(([harm, e]) => ({ harm, terlapor: e.ids.size, pasal: [...e.pasal].sort() })).sort((a, b) => b.terlapor - a.terlapor);
}

export interface Tile { key: string; value: number; x: number; y: number; w: number; h: number }

/** Squarified-enough treemap: items sorted largest first, laid out in rows that keep tiles close to square. */
export function treemap(items: readonly { key: string; value: number }[], W: number, H: number): Tile[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!total) return [];
  const out: Tile[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  let rest = list.slice();
  let remaining = total;
  while (rest.length) {
    const horizontal = w >= h;
    const side = horizontal ? h : w;
    const area = (v: number) => (v / remaining) * w * h;
    let row: typeof rest = [];
    let best = Infinity;
    for (const item of rest) {
      const cand = [...row, item];
      const s = cand.reduce((a, c) => a + area(c.value), 0);
      const thick = s / side;
      const worst = Math.max(...cand.map((c) => { const len = area(c.value) / thick; return Math.max(len / thick, thick / len); }));
      if (worst > best) break;
      best = worst;
      row = cand;
    }
    const rowArea = row.reduce((a, c) => a + area(c.value), 0);
    const thick = rowArea / side;
    let off = 0;
    for (const item of row) {
      const len = area(item.value) / thick;
      out.push(horizontal ? { key: item.key, value: item.value, x, y: y + off, w: thick, h: len } : { key: item.key, value: item.value, x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (horizontal) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    remaining -= row.reduce((a, c) => a + c.value, 0);
    rest = rest.slice(row.length);
  }
  return out;
}

// ---------- site-section evidence views ----------

/** URLs that left the sitemap, grouped by the last snapshot that still listed them. Evidence of deletion over time. */
export function removals(rows: readonly Row[]): { lastSeen: string; paths: string[] }[] {
  const by = new Map<string, string[]>();
  for (const r of rows) if (r.removed) by.set(r.lastSeen, [...(by.get(r.lastSeen) ?? []), r.path]);
  return [...by].map(([lastSeen, paths]) => ({ lastSeen, paths: paths.sort() })).sort((a, b) => a.lastSeen.localeCompare(b.lastSeen));
}

/** Images the sitemap lists, per section, largest first. */
export function imagesBySection(rows: readonly Row[]): { section: string; images: number; urls: number }[] {
  const by = new Map<string, { images: number; urls: number }>();
  for (const r of rows) {
    if (!r.images) continue;
    const e = by.get(r.section) ?? { images: 0, urls: 0 };
    e.images += r.images;
    e.urls += 1;
    by.set(r.section, e);
  }
  return [...by].map(([section, e]) => ({ section, ...e })).sort((a, b) => b.images - a.images);
}

export interface SlugGap { buckets: { label: string; min: number; max: number; n: number }[]; baseline: number; afterBaseline: number; medianAfter: number | null }

/**
 * Days between the date the operator wrote into a slug and the snapshot that first listed the URL. For URLs already
 * listed at the first snapshot that gap is only an upper bound (they may have been live long before), so those are
 * counted apart; only URLs first seen at a later snapshot give a real publication lag.
 */
export function slugVsFirstSeen(rows: readonly Row[], firstSnapshot: string): SlugGap {
  const BUCKETS = [
    { label: '0–7', min: 0, max: 7 }, { label: '8–30', min: 8, max: 30 }, { label: '31–90', min: 31, max: 90 },
    { label: '91–365', min: 91, max: 365 }, { label: '>365', min: 366, max: Infinity },
  ];
  const dated = rows.filter((r) => r.idDate);
  const later = dated.filter((r) => r.firstSeen > firstSnapshot);
  const gaps = later.map((r) => daysBetween(r.idDate!, r.firstSeen)).filter((g) => g >= 0).sort((a, b) => a - b);
  const mid = gaps.length ? (gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2) : null;
  return {
    buckets: BUCKETS.map((b) => ({ ...b, n: gaps.filter((g) => g >= b.min && g <= b.max).length })),
    baseline: dated.length - later.length, afterBaseline: later.length, medianAfter: mid,
  };
}

export interface ArchiveCoverage { submitted: number; failed: number; runs: number; lastRun: string | null; listed: number }

/** What the Save Page Now runs recorded (WAYBACK=1 snapshots); nothing is assumed archived without a recorded result. */
export function archiveCoverage(snapshots: readonly WatchSnapshot[], listed: number): ArchiveCoverage {
  const runs = snapshots.filter((s) => Array.isArray(s.provenance?.wayback));
  const results = runs.flatMap((s) => s.provenance!.wayback!);
  const ok = new Set(results.filter((r) => r.status !== undefined && r.status < 400).map((r) => r.url));
  const bad = new Set(results.filter((r) => !ok.has(r.url)).map((r) => r.url));
  return { submitted: ok.size, failed: bad.size, runs: runs.length, lastRun: runs.at(-1)?.date ?? null, listed };
}
