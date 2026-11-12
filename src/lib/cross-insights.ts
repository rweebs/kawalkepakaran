// Statistics shared by the /pantau insight panels, and the cross-dataset layer that reads the three sources together:
// the rahmatwibowo.net sitemap (content about Rahmat Wibowo), the Fomo posts about him, and his own case-review file
// (what he did in response, and what was alleged against others). Pure and browser-safe; the page computes the cross
// layer at build time. Numbers are counts from the data; why things line up is left for the caller to label an inference.
import type { Row } from './sitemap-watch';
import type { FomoPost } from './fomo';
import type { Kronologi, Laporan, Terlapor } from './perkara';

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.length === 7 ? `${iso}-01` : iso}T00:00:00Z`);
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);

// ---------- generic statistics ----------

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Gini coefficient of non-negative counts: 0 = perfectly even, 1 = one holder has everything. */
export function gini(xs: readonly number[]): number | null {
  const s = xs.filter((x) => x >= 0).sort((a, b) => a - b);
  const total = s.reduce((a, b) => a + b, 0);
  if (s.length < 2 || total === 0) return null;
  let cum = 0;
  for (let i = 0; i < s.length; i++) cum += (i + 1) * s[i];
  return Math.round(((2 * cum) / (s.length * total) - (s.length + 1) / s.length) * 100) / 100;
}

/** Herfindahl-Hirschman index of counts on the usual 0-10,000 scale (>2,500 = highly concentrated). */
export function hhi(xs: readonly number[]): number | null {
  const total = xs.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return Math.round(xs.reduce((a, x) => a + ((x / total) * 100) ** 2, 0));
}

/** Share (0-100) of the total held by the k largest counts. */
export function topShare(xs: readonly number[], k: number): number | null {
  const total = xs.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return Math.round(([...xs].sort((a, b) => b - a).slice(0, k).reduce((a, b) => a + b, 0) / total) * 100);
}

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Counts per ISO weekday (0 = Monday … 6 = Sunday) of day-precision dates. */
export function weekdays(dates: readonly string[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dates) if (d.length === 10) out[(new Date(ms(d)).getUTCDay() + 6) % 7] += 1;
  return out;
}

export interface Wave { from: string; to: string; count: number; peak: { date: string; count: number } }

/**
 * Splits day-precision dates into waves: a gap of more than `gap` days with nothing starts a new wave. Waves smaller
 * than `min` items are dropped, so a stray post never counts as a wave.
 */
export function waves(dates: readonly string[], gap = 45, min = 5): Wave[] {
  const s = dates.filter((d) => d.length === 10).sort();
  const out: Wave[] = [];
  let cur: string[] = [];
  const close = () => {
    if (cur.length >= min) {
      const by = new Map<string, number>();
      for (const d of cur) by.set(d, (by.get(d) ?? 0) + 1);
      let peak = { date: cur[0], count: 0 };
      for (const [d, n] of by) if (n > peak.count || (n === peak.count && d < peak.date)) peak = { date: d, count: n };
      out.push({ from: cur[0], to: cur.at(-1)!, count: cur.length, peak });
    }
    cur = [];
  };
  for (const d of s) {
    if (cur.length && daysBetween(cur.at(-1)!, d) > gap) close();
    cur.push(d);
  }
  close();
  return out;
}

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** Every month from `from` to `to` inclusive ("2023-09" … "2026-11"). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from.slice(0, 7); k <= to.slice(0, 7); k = addMonths(k, 1)) out.push(k);
  return out;
}

/** Lower-case words of a URL slug or a name: "Abigail Aryaputra-Sudarman" -> "abigail-aryaputra-sudarman". */
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---------- the cross-dataset layer ----------

export const STREAMS = ['situs', 'fomo', 'perbuatan', 'respons'] as const;
export type Stream = (typeof STREAMS)[number];
/** The three streams of content aimed at Rahmat, and his own legal steps. */
export const ATTACK: readonly Stream[] = ['situs', 'fomo', 'perbuatan'];

export interface CrossInput { site: readonly Row[]; fomo: readonly FomoPost[]; kronologis: readonly Kronologi[]; laporan: readonly Laporan[]; terlapor: readonly Terlapor[] }

/** Day-precision dates of each stream. Rahmat's response = somasi and aduan rows of his own file. */
export function streamDates(x: CrossInput): Record<Stream, string[]> {
  const day = (d: string | null | undefined): d is string => !!d && d.length === 10;
  return {
    situs: x.site.map((r) => r.idDate).filter(day),
    fomo: x.fomo.map((p) => p.iso).filter(day),
    perbuatan: x.kronologis.filter((k) => k.jenis === 'Perbuatan').map((k) => k.iso).filter(day),
    respons: x.kronologis.filter((k) => k.jenis === 'Somasi' || k.jenis === 'Aduan').map((k) => k.iso).filter(day),
  };
}

export interface MonthlyStreams { months: string[]; series: Record<Stream, number[]> }

/** One shared month axis for all four streams, so they can be drawn as small multiples. */
export function monthly(dates: Record<Stream, string[]>): MonthlyStreams | null {
  const all = STREAMS.flatMap((s) => dates[s]).sort();
  if (!all.length) return null;
  const months = monthRange(all[0], all.at(-1)!);
  const idx = new Map(months.map((m, i) => [m, i]));
  const series = Object.fromEntries(STREAMS.map((s) => {
    const arr = months.map(() => 0);
    for (const d of dates[s]) arr[idx.get(d.slice(0, 7))!] += 1;
    return [s, arr];
  })) as Record<Stream, number[]>;
  return { months, series };
}

export interface WaveResponse { wave: Wave; bySource: Record<Stream, number>; firstResponse: string | null; lagDays: number | null }

/**
 * Waves of content aimed at Rahmat (all three attack streams together) and, for each, the first legal step he took on
 * or after the wave began. The lag is a count of days; that the step answered the wave is an inference.
 */
export function attackWaves(dates: Record<Stream, string[]>, gap = 45, min = 10): WaveResponse[] {
  const tagged = ATTACK.flatMap((s) => dates[s].map((d) => ({ d, s })));
  const ws = waves(tagged.map((x) => x.d), gap, min);
  const resp = [...dates.respons].sort();
  return ws.map((w) => {
    const bySource = { situs: 0, fomo: 0, perbuatan: 0, respons: 0 } as Record<Stream, number>;
    for (const x of tagged) if (x.d >= w.from && x.d <= w.to) bySource[x.s] += 1;
    const firstResponse = resp.find((d) => d >= w.from) ?? null;
    return { wave: w, bySource, firstResponse, lagDays: firstResponse ? daysBetween(w.from, firstResponse) : null };
  });
}

export interface CounterAttack { clusters: number; followedByMore: number; before: number; after: number; medianLag: number | null }

/**
 * After each cluster of Rahmat's legal steps (waves of somasi/aduan), content aimed at him in the 14 days before vs
 * after, and the median days from a step to the next hostile item. Timing only; it cannot show that one caused the other.
 */
export function counterAttack(dates: Record<Stream, string[]>, span = 14): CounterAttack | null {
  const clusters = waves(dates.respons, 10, 3);
  if (!clusters.length) return null;
  const attacks = ATTACK.flatMap((s) => dates[s]).sort();
  let followedByMore = 0;
  let before = 0;
  let after = 0;
  for (const c of clusters) {
    const b = attacks.filter((d) => daysBetween(d, c.from) > 0 && daysBetween(d, c.from) <= span).length;
    const a = attacks.filter((d) => daysBetween(c.to, d) > 0 && daysBetween(c.to, d) <= span).length;
    before += b;
    after += a;
    if (a > b) followedByMore += 1;
  }
  const lags = [...dates.respons].sort().flatMap((r) => {
    const next = attacks.find((d) => d > r);
    return next ? [daysBetween(r, next)] : [];
  });
  return { clusters: clusters.length, followedByMore, before, after, medianLag: median(lags) };
}

export interface Overlap { terlapor: { id: string; nama: string; slug: string }[]; fomoInPerkara: string[] }

/**
 * People the Rahmat file reports who also appear on the hostile site: a terlapor whose name matches a /targets/<slug>/
 * page there (the site lists them as people Rahmat "targets"). And Fomo account names that the case file itself names.
 */
export function overlaps(x: CrossInput): Overlap {
  const targetSlugs = new Set(x.site.filter((r) => r.section === 'targets').map((r) => r.path.split('/').filter(Boolean)[1]).filter(Boolean));
  const terlapor = x.terlapor.flatMap((t) => {
    const s = slugify(t.nama);
    // Exact slug match only: a looser match could pair two different people.
    return targetSlugs.has(s) ? [{ id: t.id, nama: t.nama, slug: s }] : [];
  });
  const caseText = [...x.kronologis.map((k) => k.peristiwa), ...x.terlapor.map((t) => `${t.nama} ${t.dugaan}`)].join(' \n ').toLowerCase();
  // Only an explicit account reference counts ("@name" or "akun … name"), so ordinary words never match an account.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fomoInPerkara = [...new Set(x.fomo.map((p) => p.akun))]
    .filter((a) => a.length >= 4 && new RegExp(`(?:@|\\bakun(?:\\s+\\w+){0,2}\\s+)${esc(a.toLowerCase())}\\b`).test(caseText)).sort();
  return { terlapor, fomoInPerkara };
}

export interface CrossSummary {
  span: { from: string; to: string; days: number } | null;
  totals: Record<Stream, number>;
  attackTotal: number;
  share: Record<'situs' | 'fomo' | 'perbuatan', number>;
  responses: { somasi: number; aduan: number; laporan: number; laporanTerhadap: number };
  escalation: { recent: number; prior: number; ratio: number | null; from: string; to: string } | null;
  weekday: number[];
}

/** Headline numbers: how long, how much and from where content aimed at Rahmat came, and what he did about it. */
export function crossSummary(x: CrossInput, dates = streamDates(x)): CrossSummary {
  const attacks = ATTACK.flatMap((s) => dates[s]).sort();
  const totals = Object.fromEntries(STREAMS.map((s) => [s, dates[s].length])) as Record<Stream, number>;
  const attackTotal = attacks.length;
  const last = attacks.at(-1);
  let escalation: CrossSummary['escalation'] = null;
  if (last) {
    const cut = new Date(ms(last) - 182 * DAY).toISOString().slice(0, 10);
    const cut2 = new Date(ms(last) - 364 * DAY).toISOString().slice(0, 10);
    const recent = attacks.filter((d) => d > cut).length;
    const prior = attacks.filter((d) => d > cut2 && d <= cut).length;
    escalation = { recent, prior, ratio: prior ? Math.round((recent / prior) * 10) / 10 : null, from: cut, to: last };
  }
  return {
    span: attacks.length ? { from: attacks[0], to: last!, days: daysBetween(attacks[0], last!) } : null,
    totals, attackTotal,
    share: { situs: pct(totals.situs, attackTotal), fomo: pct(totals.fomo, attackTotal), perbuatan: pct(totals.perbuatan, attackTotal) },
    responses: {
      somasi: x.kronologis.filter((k) => k.jenis === 'Somasi').length,
      aduan: x.kronologis.filter((k) => k.jenis === 'Aduan').length,
      laporan: x.laporan.filter((l) => l.arah === 'oleh-pelapor').length,
      laporanTerhadap: x.laporan.filter((l) => l.arah === 'terhadap-pelapor').length,
    },
    escalation,
    weekday: weekdays(attacks),
  };
}

export interface MirroredReports {
  months: { key: string; own: number; against: number }[];
  own: number; ownDated: number; against: number; againstDated: number;
  firstOwn: string | null; firstAgainst: string | null;
}

/** Police reports Rahmat filed against reports filed against him, per month of their earliest dated document. */
export function mirroredReports(laporan: readonly Laporan[]): MirroredReports {
  const own = laporan.filter((l) => l.arah === 'oleh-pelapor');
  const against = laporan.filter((l) => l.arah === 'terhadap-pelapor');
  const od = own.map((l) => l.tanggal).filter((d): d is string => !!d).sort();
  const ad = against.map((l) => l.tanggal).filter((d): d is string => !!d).sort();
  const all = [...od, ...ad].sort();
  const months = all.length ? monthRange(all[0], all.at(-1)!).map((key) => ({
    key, own: od.filter((d) => d.startsWith(key)).length, against: ad.filter((d) => d.startsWith(key)).length,
  })) : [];
  return { months, own: own.length, ownDated: od.length, against: against.length, againstDated: ad.length, firstOwn: od[0] ?? null, firstAgainst: ad[0] ?? null };
}
