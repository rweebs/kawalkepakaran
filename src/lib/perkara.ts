// Shapes src/data/perkara.json (the public subset of the Pelapor's Gelar Perkara Terpadu dossier, made by
// scripts/make-perkara-data.mjs) into what the Gelar Perkara section of /pantau draws. Pure and browser-safe.
// Every terlapor is an allegation by the Pelapor, not a police finding; the page says so wherever it shows one.

export const JENIS = ['Perbuatan', 'Tanggapan', 'Somasi', 'Aduan', 'Dokumen'] as const;
export type Jenis = (typeof JENIS)[number];
export type Precision = 'day' | 'month' | 'year' | 'none';

export interface Kronologi { n: number; tanggal: string; iso: string | null; precision: Precision; periode: string; jenis: string; terlapor: string[]; peristiwa: string; dokumen: string[] }
export interface TerlaporKronologi { tanggal: string; iso: string | null; precision: Precision; peristiwa: string; jenis: string }
export interface Terlapor {
  id: string; nama: string; kategori: string; klaster: string | null; statusIdentitas: string | null; dugaan: string;
  pasal: string[]; pasalUraian: string[]; somasi: string[]; aduan: string; laporan: string[]; kronologis: TerlaporKronologi[];
  catatan: string[]; dokumen: string[];
}
export interface LaporanDok { no: string; jenis: string; nomor: string | null; tanggal: string | null; pihakLain: boolean; ringkasan: string; verifikasi: string[] }
export interface Laporan { no: string; nomor: string; stpl: string; adaStpl: boolean; arah: 'oleh-pelapor' | 'terhadap-pelapor'; pelapor: string | null; terlapor: string[]; tanggal: string | null; dokumen: LaporanDok[] }
export interface Dokumen { no: string; kelompok: string; jenis: string; nomor: string | null; tanggal: string | null; terlapor: string[]; pihakLain: boolean; perluVerifikasi: number; ringkasan: string }
export interface Perkara {
  meta: {
    judul: string; subjudul: string; dibuat: string; peruntukan: string | null; dasarHukum: string | null; acuanUtama: string;
    catatan: string[]; ringkasan: string[]; garisBesar: string[]; keterbatasan: string[]; permohonan: string[];
    jumlah: Record<string, number>;
    versi?: { dibuat: string | null; terlapor: number; ditambah: string[]; dihapus: string[] }[];
    balasan?: { terlapor: string | null; tanggal: string | null; ringkasan: string }[];
  };
  pasal: { pasal: string; jumlah: number; terlapor: string[] }[];
  aduanBukanLp: { nomor: string; tanggal: string; perihal: string; terlapor: string[]; catatan: string }[];
  terlapor: Terlapor[]; kronologis: Kronologi[]; laporan: Laporan[]; dokumen: Dokumen[];
}

/** "A. Terlapor Perorangan" -> "A". */
export const kategoriKey = (k: string): string => k.match(/^([A-Z])\./)?.[1] ?? '?';
export const kategoriLabel = (k: string): string => k.replace(/^[A-Z]\.\s*/, '');
export const isJenis = (j: string): j is Jenis => (JENIS as readonly string[]).includes(j);

export type JenisCounts = Record<Jenis, number>;
export const zeroJenis = (): JenisCounts => ({ Perbuatan: 0, Tanggapan: 0, Somasi: 0, Aduan: 0, Dokumen: 0 });
export const sumJenis = (c: JenisCounts): number => JENIS.reduce((n, j) => n + c[j], 0);

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

export interface MonthRow { key: string; counts: JenisCounts }

/**
 * Chronology rows per month, every month from the first to the last dated one (empty months included, so gaps show).
 * Rows dated only to a year are counted apart in `undated`, never smeared into a month.
 */
export function perBulan(rows: readonly Kronologi[]): { months: MonthRow[]; undated: number } {
  const dated = rows.filter((r) => r.iso && (r.precision === 'day' || r.precision === 'month'));
  const undated = rows.length - dated.length;
  if (!dated.length) return { months: [], undated };
  const keys = dated.map((r) => r.iso!.slice(0, 7)).sort();
  const out: MonthRow[] = [];
  for (let k = keys[0]; k <= keys.at(-1)!; k = addMonths(k, 1)) out.push({ key: k, counts: zeroJenis() });
  const at = new Map(out.map((m) => [m.key, m]));
  for (const r of dated) if (isJenis(r.jenis)) at.get(r.iso!.slice(0, 7))!.counts[r.jenis] += 1;
  return { months: out, undated };
}

export interface Tahap { key: 'terlapor' | 'somasi' | 'aduan' | 'laporan' | 'stpl'; n: number }

/** How far each terlapor's handling has gone: listed -> sent a somasi -> complained about -> police report -> STPL. */
export function tahapan(t: readonly Terlapor[], laporan: readonly Laporan[]): Tahap[] {
  const own = laporan.filter((l) => l.arah === 'oleh-pelapor');
  const byPelapor = new Set(own.flatMap((l) => l.terlapor));
  const stpl = new Set(own.filter((l) => l.adaStpl).flatMap((l) => l.terlapor));
  const hasAduan = (x: Terlapor) => !!x.aduan.trim() && !/^(-|belum ada)$/i.test(x.aduan.trim());
  return [
    { key: 'terlapor', n: t.length },
    { key: 'somasi', n: t.filter((x) => x.somasi.length > 0).length },
    { key: 'aduan', n: t.filter(hasAduan).length },
    { key: 'laporan', n: t.filter((x) => byPelapor.has(x.id)).length },
    { key: 'stpl', n: t.filter((x) => stpl.has(x.id)).length },
  ];
}

/** Counts of a string field, largest first; ties by label. */
export function countBy<T>(rows: readonly T[], key: (r: T) => string | null | undefined): { label: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/** Pasal by how many of the given terlapor it is mapped to. */
export function pasalTop(t: readonly Terlapor[], limit = 10): { label: string; n: number }[] {
  return countBy(t.flatMap((x) => x.pasal), (p) => p).slice(0, limit);
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** `klaster` filters on a canonical group from klasterGroup() (src/lib/perkara-viz.ts); empty means all. */
export interface TerlaporFilter { kategori: readonly string[]; q: string; laporan: 'all' | 'with' | 'without'; pasal: string; klaster?: string }
export const DEFAULT_TERLAPOR_FILTER: TerlaporFilter = { kategori: [], q: '', laporan: 'all', pasal: '', klaster: '' };

/** Terlapor matching every filter; an empty kategori list means all. The search covers name, id, cluster and the alleged act. */
export function filterTerlapor(t: readonly Terlapor[], f: TerlaporFilter): Terlapor[] {
  const q = norm(f.q.trim());
  const kat = new Set(f.kategori);
  return t.filter((x) => {
    if (kat.size && !kat.has(kategoriKey(x.kategori))) return false;
    if (f.laporan === 'with' && x.laporan.length === 0) return false;
    if (f.laporan === 'without' && x.laporan.length > 0) return false;
    if (f.pasal && !x.pasal.includes(f.pasal)) return false;
    if (f.klaster && klasterGroup(x.klaster) !== f.klaster) return false;
    if (q && !norm(`${x.id} ${x.nama} ${x.klaster ?? ''} ${x.dugaan}`).includes(q)) return false;
    return true;
  });
}

/** Chronology rows for the chosen terlapor ids (null = all) and types (empty = all), oldest first, undated rows last. */
export function filterKronologis(rows: readonly Kronologi[], ids: ReadonlySet<string> | null, jenis: readonly string[], q = ''): Kronologi[] {
  const nq = norm(q.trim());
  const js = new Set(jenis);
  return rows
    .filter((r) => (!ids || r.terlapor.some((i) => ids.has(i))) && (js.size === 0 || js.has(r.jenis)) && (!nq || norm(r.peristiwa).includes(nq)))
    .sort((a, b) => (a.iso ?? '9999').localeCompare(b.iso ?? '9999') || a.n - b.n);
}

// ---------- insights (recomputed from the filtered terlapor) ----------
import { klasterGroup } from './perkara-viz';
import { median, pct, topShare, daysBetween } from './cross-insights';

/** First day of a dated chronology entry: day precision as is, month precision as the 1st, others unusable. */
const dayOf = (k: { iso: string | null; precision: Precision }) =>
  k.iso && k.precision === 'day' ? k.iso : k.iso && k.precision === 'month' ? `${k.iso}-01` : null;

export interface StageRate { from: Tahap['key']; to: Tahap['key']; rate: number }

/** Share of terlapor at one stage that reached the next (somasi -> aduan -> laporan -> STPL). */
export function conversion(stages: readonly Tahap[]): StageRate[] {
  const out: StageRate[] = [];
  for (let i = 1; i < stages.length - 1; i++) out.push({ from: stages[i].key, to: stages[i + 1].key, rate: pct(stages[i + 1].n, stages[i].n) });
  return out;
}

export interface ActToSomasi { n: number; median: number | null; min: number | null; max: number | null }

/** Days from each terlapor's first alleged act to the first somasi sent to them, over terlapor that have both dates. */
export function actToSomasi(t: readonly Terlapor[]): ActToSomasi {
  const lags = t.flatMap((x) => {
    const acts = x.kronologis.filter((k) => k.jenis === 'Perbuatan').map(dayOf).filter((d): d is string => !!d).sort();
    const som = x.kronologis.filter((k) => k.jenis === 'Somasi').map(dayOf).filter((d): d is string => !!d).sort();
    const s = acts[0] ? som.find((d) => d >= acts[0]) : undefined;
    return acts[0] && s ? [daysBetween(acts[0], s)] : [];
  });
  return { n: lags.length, median: median(lags), min: lags.length ? Math.min(...lags) : null, max: lags.length ? Math.max(...lags) : null };
}

/** The most frequent pairs of pasal mapped to the same terlapor. */
export function pasalPairs(t: readonly Terlapor[], limit = 3): { a: string; b: string; n: number }[] {
  const m = new Map<string, number>();
  for (const x of t) {
    const ps = [...new Set(x.pasal)].sort();
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const k = `${ps[i]}|${ps[j]}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
  }
  return [...m].map(([k, n]) => ({ a: k.split('|')[0], b: k.split('|')[1], n })).sort((x, y) => y.n - x.n || x.a.localeCompare(y.a)).slice(0, limit);
}

export interface CounterReports { against: number; afterFirstOwn: number; firstOwn: string | null; againstDates: string[] }

/** Reports filed by others against the Pelapor, and how many came after his own first police report. */
export function counterReports(laporan: readonly Laporan[]): CounterReports {
  const own = laporan.filter((l) => l.arah === 'oleh-pelapor' && l.tanggal).map((l) => l.tanggal!).sort();
  const against = laporan.filter((l) => l.arah === 'terhadap-pelapor');
  const againstDates = against.map((l) => l.tanggal).filter((d): d is string => !!d).sort();
  return { against: against.length, afterFirstOwn: own[0] ? againstDates.filter((d) => d > own[0]).length : 0, firstOwn: own[0] ?? null, againstDates };
}

export interface PerkaraInsight {
  stages: Tahap[]; conversion: StageRate[]; lag: ActToSomasi; pairs: { a: string; b: string; n: number }[];
  backlog: { n: number; share: number; topKategori: { label: string; n: number } | null };
  // klaster is free text (54 strings for 86 terlapor), so concentration is read from the 5 fixed kategori instead.
  kategori: { top: string | null; topN: number; share: number | null };
  identity: { full: number; partial: number; none: number };
  acts: { y2023: number; y2026: number; total: number };
  busiestMonth: { key: string; n: number } | null;
  counter: CounterReports;
  verification: { docs: number; withNotes: number };
}

export function perkaraInsight(shown: readonly Terlapor[], data: Pick<Perkara, 'laporan' | 'kronologis' | 'dokumen'>): PerkaraInsight {
  const ids = new Set(shown.map((x) => x.id));
  const stages = tahapan(shown, data.laporan);
  const ownLp = new Set(data.laporan.filter((l) => l.arah === 'oleh-pelapor').flatMap((l) => l.terlapor));
  const backlog = shown.filter((x) => !ownLp.has(x.id));
  const kats = countBy(shown, (x) => kategoriLabel(x.kategori));
  const rows = data.kronologis.filter((k) => k.terlapor.some((i) => ids.has(i)));
  const acts = rows.filter((k) => k.jenis === 'Perbuatan');
  const responses = rows.filter((k) => (k.jenis === 'Somasi' || k.jenis === 'Aduan') && k.iso && k.precision !== 'year');
  const byMonth = countBy(responses, (k) => k.iso!.slice(0, 7));
  const status = (s: string) => shown.filter((x) => x.statusIdentitas === s).length;
  return {
    stages, conversion: conversion(stages), lag: actToSomasi(shown), pairs: pasalPairs(shown),
    backlog: { n: backlog.length, share: pct(backlog.length, shown.length), topKategori: countBy(backlog, (x) => kategoriLabel(x.kategori))[0] ?? null },
    kategori: { top: kats[0]?.label ?? null, topN: kats[0]?.n ?? 0, share: kats.length ? topShare(kats.map((k) => k.n), 1) : null },
    identity: { full: status('Teridentifikasi'), partial: status('Teridentifikasi sebagian'), none: shown.length - status('Teridentifikasi') - status('Teridentifikasi sebagian') },
    acts: { y2023: acts.filter((k) => k.iso?.startsWith('2023')).length, y2026: acts.filter((k) => k.iso?.startsWith('2026')).length, total: acts.length },
    busiestMonth: byMonth[0] ? { key: byMonth[0].label, n: byMonth[0].n } : null,
    counter: counterReports(data.laporan),
    verification: { docs: data.dokumen.length, withNotes: data.dokumen.filter((d) => d.perluVerifikasi > 0).length },
  };
}
