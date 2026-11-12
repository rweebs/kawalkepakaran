// Extra Gelar Perkara visuals for /pantau (used by PerkaraDashboard.tsx): stage funnel, category bars with honest
// withheld/caveat rows, pasal by statute, klaster bubbles, swimlane, small multiples, response latency, police status
// board, document strip, reply tracker, version log and per-card stage pills and sparklines.
// Every chart that names a party carries a visible "Dugaan" chip: the Pelapor's allegation, not a police finding.
import { useMemo, useState, type ReactNode } from 'react';
import { Card, Legend, StackedBars, fmtMonth, fmtN, useWidth, type Locale } from './viz/charts';
import { JENIS, conversion, kategoriLabel, type Jenis, type Perkara, type Tahap, type Terlapor } from '../lib/perkara';
import {
  DOC_STAGES, KLASTER_GROUPS, ageDays, compressMonths, docChain, docPoints, klasterBubbles, lanes, latencies, monthsByKategori, pasalName,
  statusBoard, statuteOf, policeUnit, type AxisMonth, type DocStage, type KlasterGroup, type Latency, type StagePill, type Statute,
} from '../lib/perkara-viz';

export const JENIS_CLS: Record<Jenis, string> = { Perbuatan: 'pk-fill--perbuatan', Tanggapan: 'pk-fill--tanggapan', Somasi: 'pk-fill--somasi', Aduan: 'pk-fill--aduan', Dokumen: 'pk-fill--dokumen' };
export const JENIS_STROKE: Record<Jenis, string> = { Perbuatan: 'pk-stroke--perbuatan', Tanggapan: 'pk-stroke--tanggapan', Somasi: 'pk-stroke--somasi', Aduan: 'pk-stroke--aduan', Dokumen: 'pk-stroke--dokumen' };

const L = {
  id: {
    dugaan: 'Dugaan', dugaanTitle: 'Dugaan Pelapor, bukan temuan polisi. Praduga tak bersalah berlaku.',
    table: 'Tabel data', stage: 'Tahap', n: 'Terlapor', drop: 'Lanjut ke tahap berikut', withheld: 'Lampiran A (bukti belum cukup; nama tidak ditampilkan)',
    katE: 'Perkara lain, bukan pencemaran terhadap Pelapor: tidak menambah jumlah sasaran', katCaveat: { C: 'pertanggungjawaban korporasi bersyarat', D: 'pihak berprofesi; perlu kehati-hatian' } as Record<string, string>,
    statute: { KUHP: 'KUHP (UU 1/2023)', ITE: 'UU ITE', Lain: 'UU lain' } as Record<Statute, string>,
    gapTip: (a: string, b: string, n: number) => `${a} – ${b}: ${n} bulan tanpa baris kronologis`,
    lanesNote: 'Satu jalur per kategori terlapor; titik = satu baris kronologis, warna = jenis. Bulan kosong panjang diringkas.',
    lane: (k: string) => (k === '–' ? 'Tanpa terlapor' : `Kategori ${k}`),
    smallNote: 'Lima grafik kecil dengan sumbu dan skala yang sama. Kategori E diarsir: perkara lain, bukan pencemaran terhadap Pelapor.',
    latNote: 'Per terlapor: perbuatan pertama yang diduga → somasi → aduan → laporan polisi. Arsiran = 6 bulan sejak perbuatan, tenggang pengaduan delik aduan yang dicatat berkas (tafsiran hukum, bukan kepastian).',
    inference: 'Dugaan/tafsiran', act: 'Perbuatan (diduga)', somasi: 'Somasi', aduan: 'Aduan', laporan: 'Laporan polisi', window: 'Tenggang 6 bulan',
    inWindow: (a: number, b: number) => `${a} terlapor diadukan dalam 6 bulan sejak perbuatan pertama; ${b} sesudahnya.`, showAll: (n: number) => `Tampilkan semua (${n})`,
    boardNote: 'Dokumen kepolisian per laporan, menurut tanggal pertama muncul. "ada" = STPL tercatat tanpa tanggal.', present: 'ada',
    unitH: 'Satuan kepolisian', ocr: (n: number) => `${n} catatan verifikasi (tulisan tangan/OCR)`, chainH: 'Dokumen di balik laporan terhadap Pelapor',
    docsNote: 'Satu penanda per dokumen menurut tanggal dan jenis. Penanda berongga = ada catatan verifikasi; makin tebal, makin banyak catatan.',
    heat: 'Catatan verifikasi per dokumen', notes: 'catatan', noDate: 'tanpa tanggal',
    replyH: 'Hak jawab yang diterima', replyNone: 'Belum ada balasan tercatat dari pihak yang disebut. Bila ada, balasan ditampilkan di sini dan di kartu terlapor.',
    versiH: 'Versi berkas', versiOne: (d: string, n: number) => `Baru satu versi berkas (${d}, ${n} terlapor). Perubahan antarversi akan tampil di sini.`,
    versiRow: (d: string, n: number, a: number, r: number) => `${d}: ${n} terlapor (+${a}, −${r})`,
    age: (n: number) => (n <= 0 ? 'disusun hari ini' : `disusun ${n} hari lalu`), stale: 'Data berkas mungkin sudah tertinggal; periksa versi terbaru.',
    pill: { somasi: 'Somasi', aduan: 'Aduan', laporan: 'Laporan polisi', stpl: 'STPL' } as Record<keyof StagePill, string>,
    undatedH: 'Baris tanpa bulan', bubblesNote: 'Klaster dinormalisasi dari 54 tulisan berbeda menjadi 10 kelompok; arahkan ke gelembung untuk melihat tulisan aslinya. Tekan untuk menyaring.',
    rawTitle: 'Tulisan klaster asli', kategori: 'Kategori',
  },
  en: {
    dugaan: 'Alleged', dugaanTitle: "The Pelapor's allegation, not a police finding. The presumption of innocence applies.",
    table: 'Data table', stage: 'Stage', n: 'Terlapor', drop: 'Go on to next stage', withheld: 'Appendix A (evidence insufficient; names not shown)',
    katE: 'Other matters, not defamation of the Pelapor: not added to the target count', katCaveat: { C: 'conditional corporate liability', D: 'professionals; treat with care' } as Record<string, string>,
    statute: { KUHP: 'Penal Code (Law 1/2023)', ITE: 'ITE Law', Lain: 'Other laws' } as Record<Statute, string>,
    gapTip: (a: string, b: string, n: number) => `${a} – ${b}: ${n} months without chronology rows`,
    lanesNote: 'One lane per terlapor category; dot = one chronology row, colour = type. Long empty stretches are compressed.',
    lane: (k: string) => (k === '–' ? 'No terlapor' : `Category ${k}`),
    smallNote: 'Five small charts on one shared axis and scale. Category E is hatched: other matters, not defamation of the Pelapor.',
    latNote: "Per terlapor: first alleged act → somasi → complaint → police report. Hatching = 6 months from the act, the complaint period for complaint-based offences the file cites (a legal interpretation, not a certainty).",
    inference: 'Inference', act: 'Act (alleged)', somasi: 'Somasi', aduan: 'Complaint', laporan: 'Police report', window: '6-month window',
    inWindow: (a: number, b: number) => `${a} terlapor were complained about within 6 months of the first act; ${b} later.`, showAll: (n: number) => `Show all (${n})`,
    boardNote: 'Police documents per report, by the date each first appears. "yes" = STPL recorded without a date.', present: 'yes',
    unitH: 'Police unit', ocr: (n: number) => `${n} verification notes (handwriting/OCR)`, chainH: 'Documents behind the reports against the Pelapor',
    docsNote: 'One marker per document by date and type. Hollow marker = verification notes; thicker ring = more notes.',
    heat: 'Verification notes per document', notes: 'notes', noDate: 'undated',
    replyH: 'Replies received (right of reply)', replyNone: 'No reply from a named party has been recorded yet. Replies will appear here and on the terlapor card.',
    versiH: 'File versions', versiOne: (d: string, n: number) => `Only one version of the file so far (${d}, ${n} terlapor). Changes between versions will show here.`,
    versiRow: (d: string, n: number, a: number, r: number) => `${d}: ${n} terlapor (+${a}, −${r})`,
    age: (n: number) => (n <= 0 ? 'prepared today' : `prepared ${n} days ago`), stale: 'The file data may be out of date; check for a newer version.',
    pill: { somasi: 'Somasi', aduan: 'Complaint', laporan: 'Police report', stpl: 'STPL' } as Record<keyof StagePill, string>,
    undatedH: 'Rows without a month', bubblesNote: 'Clusters normalised from 54 different spellings into 10 groups; hover a bubble for the original wording. Press to filter.',
    rawTitle: 'Original cluster wording', kategori: 'Category',
  },
};

const fmtDay = (iso: string | null, locale: Locale) => (iso && iso.length === 10
  ? new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
  : iso || '–');

/** Hatch pattern shared by every SVG on the page (fill: url(#pk-hatch)). Rendered once by the dashboard. */
export const HatchDefs = () => (
  <svg className="pk-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <pattern id="pk-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="pk-hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="pk-hatch-line" /></pattern>
    </defs>
  </svg>
);

export const DugaanChip = ({ locale }: { locale: Locale }) => <span className="pk-dugaan" title={L[locale].dugaanTitle}>{L[locale].dugaan}</span>;

/** A chart note that starts with the Dugaan chip. */
export const DugaanNote = ({ locale, children }: { locale: Locale; children?: ReactNode }) => <><DugaanChip locale={locale} /> {children}</>;

const DataTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) => (
  <details className="viz-table-view"><summary>{caption}</summary>
    <div className="viz-scroll"><table><thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table></div>
  </details>
);

// ---------- 22 + 12: funnel ----------
export function StageFunnel({ stages, labels, locale }: { stages: Tahap[]; labels: Record<Tahap['key'], string>; locale: Locale }) {
  const t = L[locale];
  const conv = conversion(stages);
  const max = Math.max(1, stages[0]?.n ?? 1);
  return (
    <>
      <ol className="pk-funnel">
        {stages.map((s, i) => (
          <li key={s.key}>
            <span className="pk-funnel__label">{labels[s.key]}</span>
            <span className="pk-funnel__track"><span className={`pk-funnel__bar pk-w-${Math.round((s.n / max) * 20) * 5}`} /></span>
            <span className="pk-funnel__n">{fmtN(s.n, locale)}</span>
            {i >= 1 && i < stages.length - 1 && conv[i - 1] && <span className="pk-funnel__drop">↓ {conv[i - 1].rate}%</span>}
          </li>
        ))}
      </ol>
      <DataTable caption={t.table} head={[t.stage, t.n, t.drop]} rows={stages.map((s, i) => [labels[s.key], s.n, i >= 1 && i < stages.length - 1 && conv[i - 1] ? `${conv[i - 1].rate}%` : '–'])} />
    </>
  );
}

// ---------- 70, 72, 48 + 12: category bars ----------
export function KategoriBars({ rows, withheld, selected, onSelect, locale }: {
  rows: { key: string; label: string; n: number }[]; withheld: number; selected: string | null; onSelect: (k: string) => void; locale: Locale;
}) {
  const t = L[locale];
  const max = Math.max(1, withheld, ...rows.map((r) => r.n));
  const all = [...rows, { key: 'LA', label: t.withheld, n: withheld }];
  return (
    <>
      <ul className="pk-kat">
        {all.map((r) => {
          const special = r.key === 'LA' ? 'pk-kat--withheld' : r.key === 'E' ? 'pk-kat--e' : r.key === 'C' || r.key === 'D' ? 'pk-kat--caveat' : '';
          const body = (
            <>
              <span className="pk-kat__label">{r.key !== 'LA' && <b>{r.key}.</b>} {r.label}</span>
              <span className="pk-kat__track"><span className={`pk-kat__bar pk-w-${Math.round((r.n / max) * 20) * 5}`} /></span>
              <span className="pk-kat__n">{fmtN(r.n, locale)}</span>
              {r.key === 'E' && <span className="pk-kat__note">{t.katE}</span>}
              {t.katCaveat[r.key] && <span className="pk-kat__note">{t.katCaveat[r.key]}</span>}
            </>
          );
          return (
            <li key={r.key} className={`${special}${selected && selected !== r.key ? ' viz-dim' : ''}`}>
              {r.key === 'LA' ? <div className="pk-kat__row">{body}</div>
                : <button type="button" className="pk-kat__row" aria-pressed={selected === r.key} onClick={() => onSelect(r.key)}>{body}</button>}
            </li>
          );
        })}
      </ul>
      <DataTable caption={t.table} head={[t.kategori, t.n]} rows={all.map((r) => [r.key === 'LA' ? r.label : `${r.key}. ${r.label}`, r.n])} />
    </>
  );
}

// ---------- 21, 49, 71: pasal by statute ----------
export function PasalBars({ rows, selected, onSelect, locale }: { rows: { label: string; n: number }[]; selected: string | null; onSelect: (k: string) => void; locale: Locale }) {
  const t = L[locale];
  const max = Math.max(1, ...rows.map((r) => r.n));
  const statutes = [...new Set(rows.map((r) => statuteOf(r.label)))];
  return (
    <>
      <ul className="viz-legend viz-legend--sans" aria-label={t.statute.KUHP}>
        {statutes.map((s) => <li key={s}><span className={`viz-key pk-law--${s}`} aria-hidden="true" />{t.statute[s]}</li>)}
      </ul>
      <ul className="pk-kat">
        {rows.map((r) => {
          const s = statuteOf(r.label);
          const name = pasalName(r.label);
          return (
            <li key={r.label} className={selected && selected !== r.label ? 'viz-dim' : undefined}>
              <button type="button" className="pk-kat__row" aria-pressed={selected === r.label} onClick={() => onSelect(r.label)}>
                <span className="pk-kat__label"><b>{r.label}</b>{name && <small> {name}</small>}</span>
                <span className="pk-kat__track"><span className={`pk-kat__bar pk-law--${s} pk-w-${Math.round((r.n / max) * 20) * 5}`} /></span>
                <span className="pk-kat__n">{fmtN(r.n, locale)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------- 39 + 82: klaster bubbles ----------
export function KlasterBubbles({ terlapor, selected, onSelect, locale }: { terlapor: readonly Terlapor[]; selected: string; onSelect: (g: KlasterGroup | '') => void; locale: Locale }) {
  const t = L[locale];
  const b = useMemo(() => klasterBubbles(terlapor), [terlapor]);
  const max = Math.max(1, ...b.map((x) => x.n));
  return (
    <ul className="pk-bubbles">
      {b.map((x) => {
        const size = Math.round(Math.sqrt(x.n / max) * 10) * 10;
        const mix = Object.entries(x.kategori).sort(([a], [c]) => a.localeCompare(c)).map(([k, n]) => `${k}:${n}`).join(' · ');
        return (
          <li key={x.group} className={selected && selected !== x.group ? 'viz-dim' : undefined}>
            <button type="button" className="pk-bubble" aria-pressed={selected === x.group}
              title={x.raw.length ? `${t.rawTitle}:\n${x.raw.join('\n')}` : undefined} onClick={() => onSelect(selected === x.group ? '' : x.group)}>
              <span className={`pk-bubble__dot pk-s-${size}`} aria-hidden="true" />
              <span className="pk-bubble__n">{fmtN(x.n, locale)}</span>
              <span className="pk-bubble__label">{x.group}</span>
              <span className="pk-bubble__mix">{mix}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- 3: compressed month axis for the main stacked chart ----------
export function compressedMonthData(months: AxisMonth[], locale: Locale) {
  const t = L[locale];
  return months.map((m, i) => (m.gap
    ? { key: m.key, counts: m.counts, label: '⋯', tip: t.gapTip(fmtMonth(m.gap.from, locale, true), fmtMonth(m.gap.to, locale, true), m.gap.months) }
    : { key: m.key, counts: m.counts, label: fmtMonth(m.key, locale, i === 0 || m.key.endsWith('-01') || !!months[i - 1]?.gap), tip: fmtMonth(m.key, locale, true) }));
}

// ---------- 11: swimlanes ----------
export function Swimlanes({ data, locale }: { data: Perkara; locale: Locale }) {
  const t = L[locale];
  const [ref, W] = useWidth(640);
  const [hover, setHover] = useState<number | null>(null);
  const axis = useMemo(() => {
    const months = [...new Set(data.kronologis.filter((r) => r.iso && r.precision !== 'year' && r.precision !== 'none').map((r) => r.iso!.slice(0, 7)))].sort();
    const all: { key: string; counts: Record<Jenis, number> }[] = [];
    if (months.length) {
      for (let k = months[0]; k <= months.at(-1)!; ) {
        all.push({ key: k, counts: { Perbuatan: months.includes(k) ? 1 : 0, Tanggapan: 0, Somasi: 0, Aduan: 0, Dokumen: 0 } });
        const [y, m] = k.split('-').map(Number);
        k = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
      }
    }
    return compressMonths(all);
  }, [data]);
  const ln = useMemo(() => lanes(data.kronologis, data.terlapor), [data]);
  const laneKeys = ['A', 'B', 'C', 'D', 'E', '–'].filter((k) => ln[k]?.length);
  const m = { l: 92, r: 8, t: 6, b: 24 };
  const lh = 34;
  const H = m.t + laneKeys.length * lh + m.b;
  const band = (W - m.l - m.r) / Math.max(1, axis.length);
  const col = new Map<string, number>();
  axis.forEach((a, i) => { if (!a.gap) col.set(a.key, i); });
  const all = laneKeys.flatMap((k) => ln[k]);
  const hit = hover !== null ? all.find((d) => d.n === hover) : undefined;
  return (
    <div ref={ref} className="viz-frame">
      <svg width={W} height={H} role="group" aria-label={t.lanesNote}>
        {laneKeys.map((k, li) => {
          const y0 = m.t + li * lh;
          const perMonth = new Map<string, number>();
          return (
            <g key={k}>
              <line className="viz-grid" x1={m.l} x2={W - m.r} y1={y0 + lh - 2} y2={y0 + lh - 2} />
              <text className="viz-label viz-label--sans" x={0} y={y0 + lh / 2 + 4}>{t.lane(k)}</text>
              {ln[k].map((d) => {
                const i = col.get(d.month);
                if (i === undefined) return null;
                const slot = perMonth.get(d.month) ?? 0;
                perMonth.set(d.month, slot + 1);
                const cx = m.l + i * band + band / 2 + (((slot % 5) - 2) * Math.min(4, band / 6));
                const cy = y0 + 6 + (Math.floor(slot / 5) % 5) * 5;
                return <circle key={d.n} cx={cx} cy={cy} r={2.6} className={`${JENIS_CLS[d.jenis]}${hover !== null && hover !== d.n ? ' viz-dim' : ''}`}
                  onPointerEnter={() => setHover(d.n)} onPointerLeave={() => setHover(null)}><title>{`${d.iso} · ${d.jenis} · ${d.terlapor.join(', ')}: ${d.peristiwa.slice(0, 140)}`}</title></circle>;
              })}
            </g>
          );
        })}
        {axis.map((a, i) => (a.gap
          ? <g key={a.key}><rect x={m.l + i * band + 1} y={m.t} width={Math.max(1, band - 2)} height={laneKeys.length * lh - 2} className="pk-gap" /><text className="viz-axis" x={m.l + i * band + band / 2} y={H - 8} textAnchor="middle">⋯</text></g>
          : (i === 0 || a.key.endsWith('-01') || axis[i - 1]?.gap || i % Math.max(1, Math.ceil(48 / band)) === 0)
            ? <text key={a.key} className="viz-axis" x={m.l + i * band + band / 2} y={H - 8} textAnchor="middle">{fmtMonth(a.key, locale, i === 0 || a.key.endsWith('-01') || !!axis[i - 1]?.gap)}</text> : null))}
      </svg>
      {hit && <p className="pk-hover muted">{fmtDay(hit.iso, locale)} · {hit.jenis} · {hit.terlapor.join(', ')}: {hit.peristiwa}</p>}
    </div>
  );
}

// ---------- 23 + 48: small multiples by category ----------
export function SmallMultiples({ data, locale, jenisLabel }: { data: Perkara; locale: Locale; jenisLabel: Record<Jenis, string> }) {
  const months = useMemo(() => [...new Set(data.kronologis.filter((r) => r.iso && r.precision !== 'year' && r.precision !== 'none').map((r) => r.iso!.slice(0, 7)))].sort(), [data]);
  const full = useMemo(() => {
    if (!months.length) return [] as string[];
    const out: string[] = [];
    for (let k = months[0]; k <= months.at(-1)!; ) { out.push(k); const [y, m] = k.split('-').map(Number); k = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7); }
    return out;
  }, [months]);
  const by = useMemo(() => monthsByKategori(data.kronologis, data.terlapor, full), [data, full]);
  const labels = useMemo(() => countByKategori(data.terlapor), [data]);
  // One shared axis: compress on the union, then map every category onto the same buckets.
  const union = useMemo(() => compressMonths(full.map((k, i) => ({ key: k, counts: JENIS.reduce((c, j) => ({ ...c, [j]: ['A', 'B', 'C', 'D', 'E'].reduce((n, kk) => n + (by[kk]?.[i]?.counts[j] ?? 0), 0) }), {} as Record<Jenis, number>) }))), [full, by]);
  const share = (k: string) => union.map((u) => (u.gap ? { ...u, counts: { Perbuatan: 0, Tanggapan: 0, Somasi: 0, Aduan: 0, Dokumen: 0 } } : { ...u, counts: by[k][full.indexOf(u.key)].counts }));
  return (
    <div className="pk-multiples">
      {['A', 'B', 'C', 'D', 'E'].map((k) => (
        <div key={k} className={`pk-multiple${k === 'E' ? ' pk-multiple--e' : ''}`}>
          <p className="pk-multiple__h"><b>{k}.</b> {labels[k] ?? ''}</p>
          <StackedBars data={compressedMonthData(share(k), locale)} series={JENIS} fill={(j) => JENIS_CLS[j]} stroke={(j) => JENIS_STROKE[j]} seriesLabel={(j) => jenisLabel[j]}
            locale={locale} unit={locale === 'id' ? 'baris' : 'rows'} height={120} />
        </div>
      ))}
    </div>
  );
}
const countByKategori = (t: readonly Terlapor[]) => Object.fromEntries(t.map((x) => [x.kategori.slice(0, 1), kategoriLabel(x.kategori)]));

// ---------- 36 + 73: latency gantt ----------
export function LatencyGantt({ rows, locale }: { rows: Latency[]; locale: Locale }) {
  const t = L[locale];
  const [all, setAll] = useState(false);
  const [ref, W] = useWidth(640);
  const shown = all ? rows : rows.slice(0, 25);
  const days = rows.flatMap((r) => [r.act, r.somasi, r.aduan, r.laporan, r.windowEnd].filter((d): d is string => !!d)).sort();
  if (!days.length) return null;
  const t0 = Date.parse(`${days[0]}T00:00:00Z`);
  const t1 = Date.parse(`${days.at(-1)}T00:00:00Z`) + 86_400_000;
  const m = { l: 74, r: 10, t: 18 };
  const x = (d: string) => m.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0)) * (W - m.l - m.r);
  const rh = 16;
  const H = m.t + shown.length * rh + 6;
  const years = [...new Set(days.map((d) => d.slice(0, 4)))];
  const within = rows.filter((r) => r.aduanInWindow === true).length;
  const after = rows.filter((r) => r.aduanInWindow === false).length;
  const mark = (d: string | null, cls: string, label: string, y: number) => (d ? <circle cx={x(d)} cy={y} r={3.5} className={cls}><title>{`${label}: ${d}`}</title></circle> : null);
  return (
    <>
      <p className="muted pk-inference"><span className="pk-dugaan pk-dugaan--inf">{t.inference}</span> {t.inWindow(within, after)}</p>
      <Legend label={t.window} items={[
        { key: 'a', label: t.act, cls: 'pk-fill--perbuatan' }, { key: 's', label: t.somasi, cls: 'pk-fill--somasi' },
        { key: 'd', label: t.aduan, cls: 'pk-fill--aduan' }, { key: 'l', label: t.laporan, cls: 'pk-fill--tanggapan' }, { key: 'w', label: t.window, cls: 'pk-key--hatch' },
      ]} />
      <div ref={ref} className="viz-frame">
        <svg width={W} height={H} role="group" aria-label={t.latNote}>
          {years.map((y) => { const xx = x(`${y}-01-01`); return xx >= m.l ? <g key={y}><line className="viz-grid" x1={xx} x2={xx} y1={m.t - 6} y2={H} /><text className="viz-axis" x={xx + 3} y={10}>{y}</text></g> : null; })}
          {shown.map((r, i) => {
            const y = m.t + i * rh + rh / 2;
            const end = r.laporan ?? r.aduan ?? r.somasi ?? r.act;
            return (
              <g key={r.id}>
                <text className="viz-label viz-label--sans pk-gantt__id" x={0} y={y + 4}><title>{r.nama}</title>{r.id} ({r.kategori})</text>
                <rect x={x(r.act)} y={y - 5} width={Math.max(1, x(r.windowEnd) - x(r.act))} height={10} fill="url(#pk-hatch)" className="pk-window" />
                <line x1={x(r.act)} x2={x(end)} y1={y} y2={y} className="pk-gantt__line" />
                {mark(r.act, 'pk-fill--perbuatan', t.act, y)}{mark(r.somasi, 'pk-fill--somasi', t.somasi, y)}
                {mark(r.aduan, 'pk-fill--aduan', t.aduan, y)}{mark(r.laporan, 'pk-fill--tanggapan', t.laporan, y)}
              </g>
            );
          })}
        </svg>
      </div>
      {rows.length > 25 && <button type="button" className="btn viz-more" onClick={() => setAll((a) => !a)}>{all ? '−' : t.showAll(rows.length)}</button>}
    </>
  );
}

// ---------- 46, 50, 63, 68: police status board ----------
export function StatusBoard({ data, locale, arahLabel, idLink }: { data: Perkara; locale: Locale; arahLabel: Record<string, string>; idLink: (ids: string[]) => ReactNode }) {
  const t = L[locale];
  const rows = useMemo(() => statusBoard(data.laporan), [data]);
  const units = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of data.laporan) { const u = policeUnit(l.nomor); m.set(u, (m.get(u) ?? 0) + 1); }
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data]);
  const maxU = Math.max(1, ...units.map(([, n]) => n));
  const against = data.laporan.filter((l) => l.arah === 'terhadap-pelapor');
  const byNo = new Map(data.laporan.map((l) => [l.no, l]));
  return (
    <>
      <div className="viz-scroll">
        <table className="pk-board">
          <thead><tr><th scope="col">No</th><th scope="col">{t.unitH}</th>{DOC_STAGES.map((s) => <th key={s} scope="col">{s}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.no} className={r.arah === 'terhadap-pelapor' ? 'pk-board--against' : undefined}>
                <th scope="row">{r.no} <span className={`pk-arah pk-arah--${r.arah}`}>{arahLabel[r.arah]}</span>
                  {r.ocrNotes > 0 && <span className="pk-ocr" title={(byNo.get(r.no)?.dokumen ?? []).flatMap((d) => d.verifikasi).join('\n')} aria-label={t.ocr(r.ocrNotes)}>⚠ {r.ocrNotes}</span>}
                  <span className="pk-board__ids"> {idLink(byNo.get(r.no)?.terlapor ?? [])}</span></th>
                <td>{r.unit}</td>
                {DOC_STAGES.map((s: DocStage) => <td key={s} className={r.stages[s] !== null ? 'pk-board__on' : 'pk-board__off'}>{r.stages[s] === null ? '·' : r.stages[s] === '' ? t.present : fmtDay(r.stages[s], locale)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4 className="pk-sub">{t.unitH}</h4>
      <ul className="pk-kat">{units.map(([u, n]) => (
        <li key={u}><div className="pk-kat__row"><span className="pk-kat__label">{u}</span><span className="pk-kat__track"><span className={`pk-kat__bar pk-w-${Math.round((n / maxU) * 20) * 5}`} /></span><span className="pk-kat__n">{n}</span></div></li>
      ))}</ul>
      <h4 className="pk-sub">{t.chainH}</h4>
      <ul className="pk-chains">
        {against.map((l) => (
          <li key={l.no}><b>{l.no}</b>{l.pelapor ? <span className="muted"> ({l.pelapor})</span> : null}
            <ol className="pk-chain">{docChain(l).map((d, i) => <li key={i}><span className="pk-chain__doc">{d.jenis}</span><span className="muted"> {fmtDay(d.tanggal, locale)}</span>{d.verifikasi.length > 0 && <span className="pk-ocr" title={d.verifikasi.join('\n')}>⚠</span>}</li>)}</ol>
          </li>
        ))}
      </ul>
    </>
  );
}

// ---------- 53, 62: document strip + verification heat strip ----------
export function DocStrip({ data, locale }: { data: Perkara; locale: Locale }) {
  const t = L[locale];
  const [ref, W] = useWidth(640);
  const pts = useMemo(() => docPoints(data.dokumen), [data]);
  const dated = pts.filter((p) => p.tanggal);
  const rows: DocStage[] = [...DOC_STAGES];
  if (!dated.length) return null;
  const t0 = Date.parse(`${dated[0].tanggal}T00:00:00Z`);
  const t1 = Math.max(t0 + 86_400_000, Date.parse(`${dated.at(-1)!.tanggal}T00:00:00Z`));
  const m = { l: 120, r: 12, t: 8 };
  const rh = 24;
  const H = m.t + rows.length * rh + 20;
  const x = (d: string) => m.l + ((Date.parse(`${d}T00:00:00Z`) - t0) / (t1 - t0)) * (W - m.l - m.r);
  const months = [...new Set(dated.map((p) => p.tanggal!.slice(0, 7)))];
  return (
    <>
      <div ref={ref} className="viz-frame">
        <svg width={W} height={H} role="group" aria-label={t.docsNote}>
          {rows.map((s, i) => <g key={s}><line className="viz-grid" x1={m.l} x2={W - m.r} y1={m.t + i * rh + rh / 2} y2={m.t + i * rh + rh / 2} /><text className="viz-label viz-label--sans" x={0} y={m.t + i * rh + rh / 2 + 4}>{s}</text></g>)}
          {months.filter((_, i) => i % Math.max(1, Math.ceil(months.length / 6)) === 0).map((mo) => <text key={mo} className="viz-axis" x={x(`${mo}-01`) < m.l ? m.l : x(`${mo}-01`)} y={H - 4}>{fmtMonth(mo, locale, true)}</text>)}
          {dated.map((p, i) => {
            const y = m.t + rows.indexOf(p.stage) * rh + rh / 2 + ((i % 3) - 1) * 4;
            return <circle key={p.no} cx={x(p.tanggal!)} cy={y} r={4.5} className={p.notes > 0 ? `pk-doc pk-doc--hollow pk-doc--n${Math.min(4, p.notes)}` : 'pk-doc'}>
              <title>{`${p.no} · ${p.jenis} · ${p.tanggal} · ${p.notes} ${t.notes}`}</title></circle>;
          })}
        </svg>
      </div>
      <p className="pk-sub muted">{t.heat}</p>
      <ol className="pk-heat" aria-label={t.heat}>
        {pts.map((p) => <li key={p.no} className={`pk-heat__cell pk-heat--${Math.min(4, p.notes)}`} title={`${p.no} · ${p.jenis} · ${p.tanggal ?? t.noDate} · ${p.notes} ${t.notes}`}><span className="sr-only">{`${p.no}: ${p.notes} ${t.notes}`}</span></li>)}
      </ol>
    </>
  );
}

// ---------- 66, 92, 74: reply tracker, version log, staleness ----------
export function DossierLedger({ data, locale, today }: { data: Perkara; locale: Locale; today: string | null }) {
  const t = L[locale];
  const versi = data.meta.versi ?? [];
  const balasan = data.meta.balasan ?? [];
  const age = today && data.meta.dibuat ? ageDays(data.meta.dibuat, today) : null;
  return (
    <div className="pk-ledger">
      <div>
        <h4 className="pk-sub">{t.replyH}</h4>
        {balasan.length === 0 ? <p className="viz-empty">{t.replyNone}</p>
          : <ul>{balasan.map((b, i) => <li key={i}>{b.terlapor ?? '–'} · {fmtDay(b.tanggal, locale)} · {b.ringkasan}</li>)}</ul>}
      </div>
      <div>
        <h4 className="pk-sub">{t.versiH} {age !== null && <span className={`pk-age${age > 30 ? ' pk-age--stale' : ''}`}>{t.age(age)}</span>}</h4>
        {age !== null && age > 30 && <p className="pk-presume">{t.stale}</p>}
        {versi.length <= 1 ? <p className="viz-empty">{t.versiOne(fmtDay(data.meta.dibuat, locale), data.terlapor.length)}</p>
          : <ol>{versi.map((v, i) => <li key={i}>{t.versiRow(fmtDay(v.dibuat, locale), v.terlapor, v.ditambah.length, v.dihapus.length)}</li>)}</ol>}
      </div>
    </div>
  );
}

// ---------- 65, 38: per-card stage pill and sparkline ----------
export function StagePills({ pill, locale }: { pill: StagePill; locale: Locale }) {
  const t = L[locale];
  const keys = ['somasi', 'aduan', 'laporan', 'stpl'] as const;
  return (
    <span className="pk-pill" role="img" aria-label={keys.map((k) => `${t.pill[k]}: ${pill[k] ? '✓' : '–'}`).join(', ')}>
      {keys.map((k) => <span key={k} className={`pk-pill__dot${pill[k] ? ' pk-pill__dot--on' : ''}`} title={t.pill[k]} />)}
    </span>
  );
}

export function MiniSpark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 64;
  const h = 16;
  const step = w / Math.max(1, values.length);
  return (
    <svg className="pk-spark" width={w} height={h} aria-hidden="true">
      {values.map((v, i) => (v > 0 ? <rect key={i} x={i * step} y={h - (v / max) * h} width={Math.max(1, step - 0.5)} height={(v / max) * h} /> : null))}
    </svg>
  );
}

export { KLASTER_GROUPS };
