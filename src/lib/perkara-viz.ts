// Pure helpers for the Gelar Perkara charts on /pantau (src/components/PerkaraCharts.tsx). Browser-safe.
// Everything here describes the Pelapor's own dossier: terlapor are allegations, not police findings.
import { JENIS, isJenis, kategoriKey, zeroJenis, type Dokumen, type Jenis, type JenisCounts, type Kronologi, type Laporan, type MonthRow, type Terlapor } from './perkara';

// ---------- klaster normalization (item 82) ----------

/** Canonical klaster groups, in display order. The raw string stays available for hover. */
export const KLASTER_GROUPS = [
  'Alumni ITB', 'Kawal Rahmat / @KawalRahmatwi', 'Perundungan & amplifikasi 2023', 'KORIKA', 'Alumni SMA 81',
  'Forum Discord', 'Threads', 'Korporasi & pemberi kerja', 'Lainnya', 'Tanpa klaster',
] as const;
export type KlasterGroup = (typeof KLASTER_GROUPS)[number];

// First matching rule wins; order matters (a string naming both ITB and Kawal Rahmat is an ITB alumnus first).
const KLASTER_RULES: [RegExp, KlasterGroup][] = [
  [/alumni itb|ikatan alumni informatika itb|jejaring alumni itb|; alumni itb/i, 'Alumni ITB'],
  [/kawal ?rahmat|kawalrahmatwi|kawal ibam|dosir kasus/i, 'Kawal Rahmat / @KawalRahmatwi'],
  [/korika/i, 'KORIKA'],
  [/sma ?(negeri )?81/i, 'Alumni SMA 81'],
  [/discord|gen ai labs|ideafest/i, 'Forum Discord'],
  [/threads|jodohthreads/i, 'Threads'],
  [/perundungan x|amplifikasi|tanggapan atas pelapor|viral 2023|oktober 2023|november 2023|@sicupuh|wni di jepang|fhui|iluni/i, 'Perundungan & amplifikasi 2023'],
  [/ecommurz|mrscraper|malaka|xendit|nomnie|liven|amazon|aws|govtech|peruri|pertamina|kilat\.com|assai|konflik kerja sama/i, 'Korporasi & pemberi kerja'],
];

export function klasterGroup(raw: string | null | undefined): KlasterGroup {
  if (!raw || /^\s*(-|tidak ada)\s*$/i.test(raw)) return 'Tanpa klaster';
  for (const [re, g] of KLASTER_RULES) if (re.test(raw)) return g;
  return 'Lainnya';
}

export interface KlasterBubble { group: KlasterGroup; n: number; raw: string[]; kategori: Record<string, number> }

/** Terlapor per canonical klaster, with the raw strings behind each group and its category mix. Largest first. */
export function klasterBubbles(t: readonly Terlapor[]): KlasterBubble[] {
  const m = new Map<KlasterGroup, KlasterBubble>();
  for (const x of t) {
    const g = klasterGroup(x.klaster);
    const b = m.get(g) ?? { group: g, n: 0, raw: [], kategori: {} };
    b.n += 1;
    if (x.klaster && !b.raw.includes(x.klaster)) b.raw.push(x.klaster);
    const k = kategoriKey(x.kategori);
    b.kategori[k] = (b.kategori[k] ?? 0) + 1;
    m.set(g, b);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || KLASTER_GROUPS.indexOf(a.group) - KLASTER_GROUPS.indexOf(b.group));
}

// ---------- month axis with compressed gaps (item 3) ----------

export interface AxisMonth extends MonthRow { gap?: { from: string; to: string; months: number } }

/** Collapse every run of at least `minRun` empty months into one gap bucket, so long quiet stretches don't squeeze the waves. */
export function compressMonths(months: readonly MonthRow[], minRun = 2): AxisMonth[] {
  const out: AxisMonth[] = [];
  const total = (m: MonthRow) => JENIS.reduce((n, j) => n + m.counts[j], 0);
  for (let i = 0; i < months.length;) {
    if (total(months[i]) > 0) { out.push(months[i]); i += 1; continue; }
    let j = i;
    while (j < months.length && total(months[j]) === 0) j += 1;
    const run = months.slice(i, j);
    if (run.length >= minRun) out.push({ key: `gap:${run[0].key}`, counts: zeroJenis(), gap: { from: run[0].key, to: run.at(-1)!.key, months: run.length } });
    else out.push(...run);
    i = j;
  }
  return out;
}

// ---------- pasal labels and statutes (items 21, 49) ----------

export type Statute = 'KUHP' | 'ITE' | 'Lain';
export const statuteOf = (code: string): Statute => (/ KUHP$/.test(code) ? 'KUHP' : / ITE$/.test(code) ? 'ITE' : 'Lain');

// Only meanings the dossier itself states in its own words; other pasal keep their code alone.
const PASAL_NAME: Record<string, string> = {
  '433 KUHP': 'pencemaran', '434 KUHP': 'fitnah', '436 KUHP': 'penghinaan ringan', '263 KUHP': 'berita bohong',
  '264 KUHP': 'berita tidak pasti', '272 KUHP': 'gelar palsu', '492 KUHP': 'penipuan', '466 KUHP': 'penganiayaan',
  '448 KUHP': 'pemaksaan', '20 KUHP': 'penyertaan', '21 KUHP': 'pembantuan', '3 KUHP': 'aturan peralihan',
  '440 KUHP': 'delik aduan', '45 KUHP': 'pertanggungjawaban korporasi',
};
export const pasalName = (code: string): string | null => PASAL_NAME[code] ?? (/Pelindungan Data Pribadi/.test(code) ? 'data pribadi' : null);

// ---------- police units (item 50) ----------

/** The police unit named in a report number ("…/POLRES METRO JAKSEL/POLDA METRO JAYA" -> "Polres Metro Jaksel"). */
export function policeUnit(nomor: string): string {
  // A segment may carry the desk name first ("SPKT Polsek Cilandak", "SPKT.SAT RESKRIM"), so it is stripped before matching.
  const parts = nomor.split('/').map((s) => s.trim().replace(/^spkt[.\s]*/i, ''));
  const unit = parts.find((p) => /^polsek/i.test(p)) ?? parts.find((p) => /^polres/i.test(p)) ?? parts.find((p) => /^polda/i.test(p));
  if (!unit) return 'Tidak tercantum';
  const name = unit.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bSpkt\b.*$/, '').trim();
  // One unit, one name: the short forms used on some forms are expanded.
  return name.replace(/\bJaksel\b/, 'Jakarta Selatan').replace(/\bJakpus\b/, 'Jakarta Pusat').replace(/\bJakbar\b/, 'Jakarta Barat').replace(/\bJaktim\b/, 'Jakarta Timur').replace(/\bJakut\b/, 'Jakarta Utara');
}

// ---------- police status board (item 46) and report→document chains (item 68) ----------

export const DOC_STAGES = ['STPL', 'SP2HP', 'Pemberitahuan', 'Undangan klarifikasi', 'Lainnya'] as const;
export type DocStage = (typeof DOC_STAGES)[number];
export function docStage(jenis: string): DocStage {
  if (/tanda penerimaan laporan|^stpl/i.test(jenis)) return 'STPL';
  if (/sp2hp/i.test(jenis)) return 'SP2HP';
  if (/pemberitahuan/i.test(jenis)) return 'Pemberitahuan';
  if (/undangan/i.test(jenis)) return 'Undangan klarifikasi';
  return 'Lainnya';
}

export interface StatusRow { no: string; arah: Laporan['arah']; unit: string; first: string | null; stages: Record<DocStage, string | null>; ocrNotes: number }

/** One row per police report: the date each kind of police document first appears (null when absent). */
export function statusBoard(laporan: readonly Laporan[]): StatusRow[] {
  return laporan.map((l) => {
    const stages = Object.fromEntries(DOC_STAGES.map((s) => [s, null])) as Record<DocStage, string | null>;
    for (const d of [...l.dokumen].sort((a, b) => (a.tanggal ?? '9').localeCompare(b.tanggal ?? '9'))) {
      const s = docStage(d.jenis);
      if (stages[s] === null) stages[s] = d.tanggal ?? '';
    }
    if (l.adaStpl && stages.STPL === null) stages.STPL = '';
    return { no: l.no, arah: l.arah, unit: policeUnit(l.nomor), first: l.tanggal, stages, ocrNotes: l.dokumen.reduce((n, d) => n + d.verifikasi.length, 0) };
  }).sort((a, b) => (a.first ?? '9999').localeCompare(b.first ?? '9999') || a.no.localeCompare(b.no));
}

/** The documents behind one report in date order, for the mini chain (item 68). */
export const docChain = (l: Laporan) => [...l.dokumen].sort((a, b) => (a.tanggal ?? '9').localeCompare(b.tanggal ?? '9'));

// ---------- per-terlapor stages, sparkline, latency and complaint window (items 36, 38, 65, 73) ----------

const dayOf = (k: { iso: string | null; precision: string }) => (k.iso && k.precision === 'day' ? k.iso : k.iso && k.precision === 'month' ? `${k.iso}-01` : null);
const hasAduan = (x: Terlapor) => !!x.aduan.trim() && !/^(-|belum ada)$/i.test(x.aduan.trim());

export interface StagePill { somasi: boolean; aduan: boolean; laporan: boolean; stpl: boolean }

/** Four dots: sent a somasi, complained about, police report by the Pelapor, report has an STPL. */
export function stagePill(x: Terlapor, laporan: readonly Laporan[]): StagePill {
  const own = laporan.filter((l) => l.arah === 'oleh-pelapor' && l.terlapor.includes(x.id));
  return { somasi: x.somasi.length > 0, aduan: hasAduan(x), laporan: own.length > 0, stpl: own.some((l) => l.adaStpl) };
}

/** Chronology rows per month for one terlapor, over a shared month list (for a sparkline that compares across cards). */
export function sparkCounts(x: Terlapor, rows: readonly Kronologi[], months: readonly string[]): number[] {
  const at = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const r of rows) {
    if (!r.terlapor.includes(x.id)) continue;
    const i = r.iso && r.precision !== 'year' ? at.get(r.iso.slice(0, 7)) : undefined;
    if (i !== undefined) out[i] += 1;
  }
  return out;
}

export interface Latency { id: string; nama: string; kategori: string; act: string; somasi: string | null; aduan: string | null; laporan: string | null; windowEnd: string; aduanInWindow: boolean | null }

const addMonthsDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Per terlapor with a dated alleged act: first act, first somasi, first aduan, first police report by the Pelapor.
 * `windowEnd` is act + 6 months, the complaint period the dossier cites for delik aduan (a legal interpretation, so the
 * chart labels it as one); `aduanInWindow` is null when no aduan date is known.
 */
export function latencies(t: readonly Terlapor[], rows: readonly Kronologi[], laporan: readonly Laporan[]): Latency[] {
  return t.flatMap((x) => {
    const mine = rows.filter((r) => r.terlapor.includes(x.id));
    const first = (j: string) => mine.filter((r) => r.jenis === j).map(dayOf).filter((d): d is string => !!d).sort()[0] ?? null;
    const act = first('Perbuatan') ?? x.kronologis.filter((k) => k.jenis === 'Perbuatan').map(dayOf).filter((d): d is string => !!d).sort()[0] ?? null;
    if (!act) return [];
    const after = (d: string | null) => (d && d >= act ? d : null);
    const lp = laporan.filter((l) => l.arah === 'oleh-pelapor' && l.terlapor.includes(x.id) && l.tanggal).map((l) => l.tanggal!).sort()[0] ?? null;
    const aduan = after(first('Aduan'));
    const windowEnd = addMonthsDay(act, 6);
    return [{ id: x.id, nama: x.nama, kategori: kategoriKey(x.kategori), act, somasi: after(first('Somasi')), aduan, laporan: after(lp), windowEnd, aduanInWindow: aduan ? aduan <= windowEnd : null }];
  }).sort((a, b) => a.act.localeCompare(b.act) || a.id.localeCompare(b.id));
}

// ---------- swimlanes and small multiples (items 11, 23) ----------

export interface LaneDot { n: number; month: string; jenis: Jenis; terlapor: string[]; peristiwa: string; iso: string }

/** Dated chronology rows placed on kategori lanes (A–E); rows naming no terlapor go to lane "–". */
export function lanes(rows: readonly Kronologi[], t: readonly Terlapor[]): Record<string, LaneDot[]> {
  const kat = new Map(t.map((x) => [x.id, kategoriKey(x.kategori)]));
  const out: Record<string, LaneDot[]> = {};
  for (const r of rows) {
    if (!r.iso || r.precision === 'year' || r.precision === 'none' || !isJenis(r.jenis)) continue;
    const lane = r.terlapor.map((id) => kat.get(id)).find(Boolean) ?? '–';
    (out[lane] ??= []).push({ n: r.n, month: r.iso.slice(0, 7), jenis: r.jenis, terlapor: r.terlapor, peristiwa: r.peristiwa, iso: r.iso });
  }
  return out;
}

/** Month rows per kategori over one shared month list, so five small charts share an axis and a y scale. */
export function monthsByKategori(rows: readonly Kronologi[], t: readonly Terlapor[], months: readonly string[]): Record<string, MonthRow[]> {
  const kat = new Map(t.map((x) => [x.id, kategoriKey(x.kategori)]));
  const out: Record<string, MonthRow[]> = {};
  for (const k of ['A', 'B', 'C', 'D', 'E']) out[k] = months.map((m) => ({ key: m, counts: zeroJenis() }));
  const idx = new Map(months.map((m, i) => [m, i]));
  for (const r of rows) {
    if (!r.iso || r.precision === 'year' || r.precision === 'none' || !isJenis(r.jenis)) continue;
    const k = r.terlapor.map((id) => kat.get(id)).find(Boolean);
    const i = idx.get(r.iso.slice(0, 7));
    if (k && out[k] && i !== undefined) (out[k][i].counts as JenisCounts)[r.jenis] += 1;
  }
  return out;
}

// ---------- documents (items 53, 62) ----------

export interface DocPoint { no: string; jenis: string; stage: DocStage; tanggal: string | null; notes: number; pihakLain: boolean }
export const docPoints = (d: readonly Dokumen[]): DocPoint[] =>
  d.map((x) => ({ no: x.no, jenis: x.jenis, stage: docStage(x.jenis), tanggal: x.tanggal, notes: x.perluVerifikasi, pihakLain: x.pihakLain }))
    .sort((a, b) => (a.tanggal ?? '9999').localeCompare(b.tanggal ?? '9999') || a.no.localeCompare(b.no));

/** Whole days between two ISO dates. */
export const ageDays = (fromIso: string, toIso: string) => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
