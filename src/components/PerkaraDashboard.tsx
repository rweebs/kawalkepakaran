// The Gelar Perkara dashboard (second section of /pantau): the public subset of the Pelapor's case-review dossier (src/data/perkara.json).
// Server-rendered in full, hydrated for filtering. Every terlapor is an allegation by the Pelapor, not a police finding;
// each card says so and links to the right of reply.
import { useEffect, useMemo, useState } from 'react';
import { Card, HBars, Legend, StackedBars, fmtMonth, fmtN, type Locale } from './viz/charts';
import PerkaraInsights from './PerkaraInsights';
import {
  HatchDefs, DugaanNote, StageFunnel, KategoriBars, PasalBars, KlasterBubbles, Swimlanes, SmallMultiples, LatencyGantt, StatusBoard, DocStrip,
  DossierLedger, StagePills, MiniSpark, compressedMonthData, JENIS_CLS, JENIS_STROKE,
} from './PerkaraCharts';
import { compressMonths, latencies, stagePill, sparkCounts } from '../lib/perkara-viz';
import {
  JENIS, DEFAULT_TERLAPOR_FILTER, perBulan, tahapan, countBy, pasalTop, filterTerlapor, filterKronologis, kategoriKey, kategoriLabel,
  type Perkara, type Jenis, type TerlaporFilter, type Terlapor,
} from '../lib/perkara';

const T = {
  id: {
    tiles: { terlapor: 'Terlapor diuraikan', terlaporSub: (a: number) => `+${a} di Lampiran A (bukti belum cukup; nama tidak ditampilkan)`,
      kronologi: 'Baris kronologis', kronologiSub: (a: number, b: number) => `${a} perbuatan yang diduga, ${b} aduan`,
      laporan: 'Laporan polisi', laporanSub: (a: number, b: number) => `${a} dengan STPL; ${b} diajukan pihak lain terhadap Pelapor`,
      dokumen: 'Dokumen pendukung', dokumenSub: (a: number) => `${a} punya catatan verifikasi (hasil pindai/OCR)` },
    cTahap: 'Sejauh mana tiap terlapor ditangani', cTahapNote: 'Jumlah terlapor yang sudah sampai tiap tahap. Satu terlapor bisa punya beberapa somasi atau laporan.',
    tahap: { terlapor: 'Diuraikan', somasi: 'Disomasi', aduan: 'Diadukan', laporan: 'Laporan polisi oleh Pelapor', stpl: 'Dengan STPL' },
    cBulan: 'Kronologis per bulan, menurut jenis', cBulanNote: (u: number) => `Tekan sebuah bulan untuk menyaring daftar kronologis. ${u} baris hanya bertanggal tahun atau rentang dan tidak dihitung di sini.`,
    jenis: { Perbuatan: 'Perbuatan (diduga)', Tanggapan: 'Tanggapan', Somasi: 'Somasi', Aduan: 'Aduan', Dokumen: 'Dokumen' } as Record<Jenis, string>,
    cKat: 'Terlapor per kategori', cKatNote: 'Tekan sebuah kategori untuk menyaring daftar terlapor.', cPasal: 'Pasal yang diduga Pelapor', cPasalNote: 'Pemetaan pasal adalah dugaan Pelapor, bukan dakwaan. Tekan sebuah pasal untuk menyaring daftar terlapor.',
    cKlaster: 'Klaster terlapor', cLanes: 'Kronologis per kategori (jalur)', cSmall: 'Kronologis per kategori (grafik kecil)', cLat: 'Waktu tanggap per terlapor',
    cBoard: 'Apa yang sudah dilakukan kepolisian', cDocs: 'Dokumen pendukung menurut tanggal', cLedger: 'Hak jawab dan versi berkas',
    klasterChip: (k: string) => `Klaster: ${k}`, replyCard: 'Balasan: belum tercatat', undatedH: 'Baris tanpa bulan (tidak masuk grafik)',
    cStatus: 'Status identitas terlapor',
    terlaporH: 'Daftar terlapor', filter: 'Saring', search: 'Cari nama, klaster, atau perbuatan', kat: 'Kategori',
    lp: 'Laporan polisi', lpOpt: { all: 'Semua', with: 'Ada laporan polisi', without: 'Belum ada laporan polisi' },
    pasal: 'Pasal', anyPasal: 'Semua pasal', reset: 'Atur ulang', shown: (a: number, b: number) => `${a} dari ${b} terlapor`,
    dugaan: 'Dugaan perbuatan', pasalH: 'Pasal yang diduga', somasiH: 'Somasi', aduanH: 'Aduan / laporan', catatanH: 'Catatan',
    status: 'Status identitas', kronologiBtn: (n: number) => `Lihat ${n} baris kronologis`,
    presumption: 'Dugaan Pelapor, bukan temuan polisi. Praduga tak bersalah berlaku.', reply: 'Hak jawab',
    kronH: 'Kronologis terpadu', kronFor: (n: string) => `Kronologis untuk ${n}`, kronMonth: (m: string) => `Bulan: ${m}`, clear: 'hapus',
    kronSearch: 'Cari di peristiwa', more: (n: number) => `Tampilkan ${n} lagi`, kronShown: (a: number, b: number) => `Menampilkan ${a} dari ${b} baris`,
    lpH: 'Laporan polisi dan aduan bernomor', arah: { 'oleh-pelapor': 'Oleh Pelapor', 'terhadap-pelapor': 'Terhadap Pelapor' },
    cols: { no: 'No', nomor: 'Nomor', tanggal: 'Tanggal paling awal', arah: 'Arah', terlapor: 'Terlapor', stpl: 'Acuan', dok: 'Dokumen' },
    verif: (n: number) => `${n} catatan verifikasi`, none: 'Tidak ada yang cocok.', items: 'baris', people: 'terlapor', legend: 'Keterangan',
  },
  en: {
    tiles: { terlapor: 'Terlapor described', terlaporSub: (a: number) => `+${a} in Appendix A (evidence not yet sufficient; names not shown)`,
      kronologi: 'Chronology rows', kronologiSub: (a: number, b: number) => `${a} alleged acts, ${b} complaints`,
      laporan: 'Police reports', laporanSub: (a: number, b: number) => `${a} with an STPL; ${b} filed by others against the Pelapor`,
      dokumen: 'Supporting documents', dokumenSub: (a: number) => `${a} carry verification notes (scans/OCR)` },
    cTahap: 'How far each terlapor has been taken', cTahapNote: 'Number of terlapor that have reached each stage. One terlapor can have several somasi or reports.',
    tahap: { terlapor: 'Described', somasi: 'Sent a somasi', aduan: 'Complained about', laporan: 'Police report by the Pelapor', stpl: 'With an STPL' },
    cBulan: 'Chronology per month, by type', cBulanNote: (u: number) => `Press a month to filter the chronology list. ${u} rows are dated only to a year or a range and are not counted here.`,
    jenis: { Perbuatan: 'Act (alleged)', Tanggapan: 'Response', Somasi: 'Somasi', Aduan: 'Complaint', Dokumen: 'Document' } as Record<Jenis, string>,
    cKat: 'Terlapor by category', cKatNote: 'Press a category to filter the terlapor list.', cPasal: 'Articles alleged by the Pelapor', cPasalNote: "The article mapping is the Pelapor's allegation, not a charge. Press an article to filter the terlapor list.",
    cKlaster: 'Terlapor clusters', cLanes: 'Chronology by category (lanes)', cSmall: 'Chronology by category (small multiples)', cLat: 'Response time per terlapor',
    cBoard: 'What the police have done', cDocs: 'Supporting documents by date', cLedger: 'Right of reply and file versions',
    klasterChip: (k: string) => `Cluster: ${k}`, replyCard: 'Reply: none recorded', undatedH: 'Rows without a month (not in the chart)',
    cStatus: 'Identity status of terlapor',
    terlaporH: 'Terlapor list', filter: 'Filter', search: 'Search name, cluster or act', kat: 'Category',
    lp: 'Police report', lpOpt: { all: 'All', with: 'Has a police report', without: 'No police report yet' },
    pasal: 'Article', anyPasal: 'All articles', reset: 'Reset', shown: (a: number, b: number) => `${a} of ${b} terlapor`,
    dugaan: 'Alleged act', pasalH: 'Articles alleged', somasiH: 'Somasi', aduanH: 'Complaint / report', catatanH: 'Notes',
    status: 'Identity status', kronologiBtn: (n: number) => `See ${n} chronology rows`,
    presumption: "The Pelapor's allegation, not a police finding. The presumption of innocence applies.", reply: 'Right of reply',
    kronH: 'Combined chronology', kronFor: (n: string) => `Chronology for ${n}`, kronMonth: (m: string) => `Month: ${m}`, clear: 'clear',
    kronSearch: 'Search events', more: (n: number) => `Show ${n} more`, kronShown: (a: number, b: number) => `Showing ${a} of ${b} rows`,
    lpH: 'Police reports and numbered complaints', arah: { 'oleh-pelapor': 'By the Pelapor', 'terhadap-pelapor': 'Against the Pelapor' },
    cols: { no: 'No', nomor: 'Number', tanggal: 'Earliest date', arah: 'Direction', terlapor: 'Terlapor', stpl: 'Basis', dok: 'Documents' },
    verif: (n: number) => `${n} verification notes`, none: 'Nothing matches.', items: 'rows', people: 'terlapor', legend: 'Legend',
  },
};

const KRON_PAGE = 40;

const fmtIso = (iso: string | null, raw: string, locale: Locale) => {
  if (!iso || iso.length !== 10) return raw;
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
};

const IdLinks = ({ ids, known }: { ids: string[]; known: Map<string, Terlapor> }) => (
  <>{ids.map((id, i) => <span key={id}>{i > 0 && ', '}{known.has(id) ? <a href={`#terlapor-${id}`}>{id}</a> : id}</span>)}</>
);

export interface PerkaraDashboardProps { data: Perkara; locale?: Locale; replyHref: string }

export default function PerkaraDashboard({ data, locale = 'id', replyHref }: PerkaraDashboardProps) {
  const t = T[locale];
  const byId = useMemo(() => new Map(data.terlapor.map((x) => [x.id, x])), [data]);
  const [f, setF] = useState<TerlaporFilter>(DEFAULT_TERLAPOR_FILTER);
  const [month, setMonth] = useState<string | null>(null);
  const [jenis, setJenis] = useState<Jenis[]>([]);
  const [kq, setKq] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [kLimit, setKLimit] = useState(KRON_PAGE);
  // Staleness is measured against the reader's today, set after hydration so server and client markup match.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);

  const shown = useMemo(() => filterTerlapor(data.terlapor, f), [data, f]);
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_TERLAPOR_FILTER);
  // The chronology follows the terlapor filter (or one chosen terlapor); rows naming nobody stay only when nothing is filtered.
  const ids = useMemo(() => (focusId ? new Set([focusId]) : filtered ? new Set(shown.map((x) => x.id)) : null), [focusId, filtered, shown]);
  const scoped = useMemo(() => filterKronologis(data.kronologis, ids, jenis, kq), [data, ids, jenis, kq]);
  const kron = useMemo(() => scoped.filter((r) => !month || r.iso?.startsWith(month)), [scoped, month]);
  const bulan = useMemo(() => perBulan(scoped), [scoped]);
  const axis = useMemo(() => compressMonths(bulan.months), [bulan]);
  const undatedRows = useMemo(() => scoped.filter((r) => !r.iso || r.precision === 'year' || r.precision === 'none'), [scoped]);
  const lat = useMemo(() => latencies(shown, data.kronologis, data.laporan), [shown, data]);
  const sparkMonths = useMemo(() => [...new Set(data.kronologis.filter((r) => r.iso && r.precision !== 'year').map((r) => r.iso!.slice(0, 7)))].sort(), [data]);
  const stages = useMemo(() => tahapan(shown, data.laporan), [shown, data]);
  const kategori = useMemo(() => countBy(shown, (x) => x.kategori), [shown]);
  const pasal = useMemo(() => pasalTop(shown, 10), [shown]);
  const status = useMemo(() => countBy(shown, (x) => x.statusIdentitas), [shown]);
  const allPasal = useMemo(() => [...new Set(data.terlapor.flatMap((x) => x.pasal))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)), [data]);
  const kategoriAll = useMemo(() => countBy(data.terlapor, (x) => x.kategori).map((k) => k.label).sort(), [data]);

  const j = data.meta.jumlah;
  const pihakLain = data.laporan.filter((l) => l.arah === 'terhadap-pelapor').length;
  const set = (patch: Partial<TerlaporFilter>) => { setF((p) => ({ ...p, ...patch })); setFocusId(null); setKLimit(KRON_PAGE); };
  const monthIdx = month ? axis.findIndex((m) => m.key === month) : -1;
  // Respect reduced motion: jump instead of animating the scroll.
  const toKronologis = () => {
    const smooth = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('pk-kronologis')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  const terlaporCard = (x: Terlapor) => {
    const rows = data.kronologis.filter((r) => r.terlapor.includes(x.id)).length;
    return (
      <li key={x.id} className={`pk-card pk-card--${x.kategori.slice(0, 1)}`} id={`terlapor-${x.id}`}>
        <details>
          <summary>
            <span className="pk-card__id">{x.id}</span>
            <span className="pk-card__name">{x.nama}</span>
            <span className="pk-card__meta">{kategoriLabel(x.kategori)}{x.klaster ? ` · ${x.klaster}` : ''}</span>
            <span className="pk-card__badges">
              <StagePills pill={stagePill(x, data.laporan)} locale={locale} />
              <MiniSpark values={sparkCounts(x, data.kronologis, sparkMonths)} />
              {x.somasi.length > 0 && <span className="pk-badge">{t.somasiH} {x.somasi.length}</span>}
              {x.laporan.length > 0 && <span className="pk-badge pk-badge--lp">LP {x.laporan.length}</span>}
            </span>
          </summary>
          <div className="pk-card__body">
            <p className="pk-presume">{t.presumption} <a href={replyHref}>{t.reply}</a> · {(data.meta.balasan ?? []).some((b) => b.terlapor === x.id) ? (data.meta.balasan ?? []).filter((b) => b.terlapor === x.id).map((b) => b.tanggal).join(', ') : t.replyCard}</p>
            <dl>
              {x.statusIdentitas && <><dt>{t.status}</dt><dd>{x.statusIdentitas}</dd></>}
              <dt>{t.dugaan}</dt><dd>{x.dugaan}</dd>
              {x.pasalUraian.length > 0 && <><dt>{t.pasalH}</dt><dd><ul>{x.pasalUraian.map((p, i) => <li key={i}>{p}</li>)}</ul></dd></>}
              {x.somasi.length > 0 && <><dt>{t.somasiH}</dt><dd><ul>{x.somasi.map((p, i) => <li key={i}>{p}</li>)}</ul></dd></>}
              {x.aduan && <><dt>{t.aduanH}</dt><dd>{x.aduan}</dd></>}
              {x.catatan.length > 0 && <><dt>{t.catatanH}</dt><dd><ul>{x.catatan.map((p, i) => <li key={i}>{p}</li>)}</ul></dd></>}
            </dl>
            {rows > 0 && <button type="button" className="viz-chip" onClick={() => { setFocusId(x.id); setMonth(null); setKLimit(KRON_PAGE); toKronologis(); }}>{t.kronologiBtn(rows)}</button>}
          </div>
        </details>
      </li>
    );
  };

  return (
    <div className="viz pk">
      <HatchDefs />
      <div className="viz-tiles">
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.terlapor}</p><p className="viz-tile__v">{fmtN(data.terlapor.length, locale)}</p><p className="viz-tile__s">{t.tiles.terlaporSub(j.terlapor_lampiran_a ?? 0)}</p></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.kronologi}</p><p className="viz-tile__v">{fmtN(data.kronologis.length, locale)}</p>
          <p className="viz-tile__s">{t.tiles.kronologiSub(data.kronologis.filter((r) => r.jenis === 'Perbuatan').length, data.kronologis.filter((r) => r.jenis === 'Aduan').length)}</p></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.laporan}</p><p className="viz-tile__v">{fmtN(data.laporan.length, locale)}</p>
          <p className="viz-tile__s">{t.tiles.laporanSub(data.laporan.filter((l) => l.adaStpl).length, pihakLain)}</p></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.dokumen}</p><p className="viz-tile__v">{fmtN(data.dokumen.length, locale)}</p>
          <p className="viz-tile__s">{t.tiles.dokumenSub(data.dokumen.filter((d) => d.perluVerifikasi > 0).length)}</p></div>
      </div>

      <PerkaraInsights shown={shown} data={data} locale={locale} />

      <div className="viz-cards">
        <Card title={t.cBulan} note={t.cBulanNote(bulan.undated)} wide>
          <Legend label={t.legend} items={JENIS.map((k) => ({ key: k, label: t.jenis[k], cls: JENIS_CLS[k] }))} />
          {bulan.months.length === 0 ? <p className="viz-empty">{t.none}</p> : (
            <StackedBars data={compressedMonthData(axis, locale)}
              series={JENIS} fill={(k) => JENIS_CLS[k]} stroke={(k) => JENIS_STROKE[k]} seriesLabel={(k) => t.jenis[k]} locale={locale} unit={t.items}
              selected={monthIdx >= 0 ? monthIdx : null}
              onSelect={(i) => { const a = axis[i]; if (a.gap) return; setMonth((m) => (m === a.key ? null : a.key)); setKLimit(KRON_PAGE); }} />
          )}
          {undatedRows.length > 0 && (
            <details className="viz-table-view"><summary>{t.undatedH} ({undatedRows.length})</summary>
              <ul className="pk-undated">{undatedRows.map((r) => <li key={r.n}><b>{r.tanggal}</b> · {t.jenis[r.jenis as Jenis] ?? r.jenis}{r.terlapor.length > 0 && <> · <IdLinks ids={r.terlapor} known={byId} /></>}: {r.peristiwa}</li>)}</ul>
            </details>
          )}
        </Card>
        <Card title={t.cTahap} note={<DugaanNote locale={locale}>{t.cTahapNote}</DugaanNote>}>
          <StageFunnel stages={stages} labels={t.tahap} locale={locale} />
        </Card>
        <Card title={t.cKat} note={<DugaanNote locale={locale}>{t.cKatNote}</DugaanNote>}>
          <KategoriBars locale={locale} withheld={j.terlapor_lampiran_a ?? 0}
            rows={kategori.map((k) => ({ key: kategoriKey(k.label), label: kategoriLabel(k.label), n: k.n })).sort((a, b) => a.key.localeCompare(b.key))}
            selected={f.kategori.length === 1 ? f.kategori[0] : null}
            onSelect={(k) => set({ kategori: f.kategori.length === 1 && f.kategori[0] === k ? [] : [k] })} />
        </Card>
        <Card title={t.cPasal} note={<DugaanNote locale={locale}>{t.cPasalNote}</DugaanNote>}>
          <PasalBars locale={locale} rows={pasal} selected={f.pasal || null} onSelect={(k) => set({ pasal: f.pasal === k ? '' : k })} />
        </Card>
        <Card title={t.cStatus} note={<DugaanNote locale={locale} />}>
          <HBars locale={locale} unit={t.people} labelWidth={200} rows={status.map((s) => ({ key: s.label, label: s.label, n: s.n }))} />
        </Card>
        <Card title={t.cKlaster} note={<DugaanNote locale={locale} />} wide>
          <KlasterBubbles terlapor={filterTerlapor(data.terlapor, { ...f, klaster: '' })} selected={f.klaster ?? ''} onSelect={(g) => set({ klaster: g })} locale={locale} />
        </Card>
        <Card title={t.cLanes} note={<DugaanNote locale={locale} />} wide>
          <Swimlanes data={data} locale={locale} />
        </Card>
        <Card title={t.cSmall} note={<DugaanNote locale={locale} />} wide>
          <SmallMultiples data={data} locale={locale} jenisLabel={t.jenis} />
        </Card>
        <Card title={t.cLat} note={<DugaanNote locale={locale} />} wide>
          <LatencyGantt rows={lat} locale={locale} />
        </Card>
        <Card title={t.cBoard} note={<DugaanNote locale={locale} />} wide>
          <StatusBoard data={data} locale={locale} arahLabel={t.arah} idLink={(ids) => <IdLinks ids={ids} known={byId} />} />
        </Card>
        <Card title={t.cDocs} wide>
          <DocStrip data={data} locale={locale} />
        </Card>
        <Card title={t.cLedger} wide>
          <DossierLedger data={data} locale={locale} today={today} />
        </Card>
      </div>

      <section className="pk-section" aria-labelledby="pk-terlapor-h">
        <h3 id="pk-terlapor-h">{t.terlaporH}</h3>
        <form className="viz-filters" aria-label={t.filter} onSubmit={(e) => e.preventDefault()}>
          <fieldset className="viz-filters__row">
            <legend>{t.kat}</legend>
            {kategoriAll.map((k) => {
              const key = kategoriKey(k);
              return <button key={key} type="button" className="viz-chip" aria-pressed={f.kategori.includes(key)}
                onClick={() => set({ kategori: f.kategori.includes(key) ? f.kategori.filter((x) => x !== key) : [...f.kategori, key] })}>{key}. {kategoriLabel(k)}</button>;
            })}
          </fieldset>
          <fieldset className="viz-filters__row">
            <legend>{t.filter}</legend>
            <label>{t.lp} <select value={f.laporan} onChange={(e) => set({ laporan: e.target.value as TerlaporFilter['laporan'] })}>
              {(Object.keys(t.lpOpt) as TerlaporFilter['laporan'][]).map((k) => <option key={k} value={k}>{t.lpOpt[k]}</option>)}
            </select></label>
            <label>{t.pasal} <select value={f.pasal} onChange={(e) => set({ pasal: e.target.value })}>
              <option value="">{t.anyPasal}</option>{allPasal.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
            <label className="viz-search">{t.search} <input type="search" value={f.q} autoComplete="off" onChange={(e) => set({ q: e.target.value })} /></label>
            {f.klaster && <button type="button" className="viz-chip" aria-pressed="true" onClick={() => set({ klaster: '' })}>{t.klasterChip(f.klaster)} · {t.clear}</button>}
            <button type="button" className="btn viz-reset" disabled={!filtered && !focusId && !month} onClick={() => { setF(DEFAULT_TERLAPOR_FILTER); setFocusId(null); setMonth(null); }}>{t.reset}</button>
          </fieldset>
        </form>
        <p className="muted" role="status">{t.shown(shown.length, data.terlapor.length)}</p>
        {shown.length === 0 ? <p className="viz-empty">{t.none}</p> : <ul className="pk-list">{shown.map(terlaporCard)}</ul>}
      </section>

      <section className="pk-section" id="pk-kronologis" aria-labelledby="pk-kron-h">
        <h3 id="pk-kron-h">{focusId ? t.kronFor(byId.get(focusId)?.nama ?? focusId) : t.kronH}</h3>
        <div className="viz-filters__row pk-kron-filters">
          {JENIS.map((k) => (
            <button key={k} type="button" className="viz-chip" aria-pressed={jenis.length === 0 || jenis.includes(k)}
              onClick={() => { setJenis((js) => (js.includes(k) ? js.filter((x) => x !== k) : [...js, k])); setKLimit(KRON_PAGE); }}>
              <span className={`viz-key ${JENIS_CLS[k]}`} aria-hidden="true" />{t.jenis[k]}
            </button>
          ))}
          <label className="viz-search">{t.kronSearch} <input type="search" value={kq} autoComplete="off" onChange={(e) => { setKq(e.target.value); setKLimit(KRON_PAGE); }} /></label>
          {month && <button type="button" className="viz-chip" aria-pressed="true" onClick={() => setMonth(null)}>{t.kronMonth(fmtMonth(month, locale, true))} · {t.clear}</button>}
          {focusId && <button type="button" className="viz-chip" aria-pressed="true" onClick={() => setFocusId(null)}>{focusId} · {t.clear}</button>}
        </div>
        <p className="muted" role="status">{t.kronShown(Math.min(kLimit, kron.length), kron.length)}</p>
        {kron.length === 0 ? <p className="viz-empty">{t.none}</p> : (
          <ol className="pk-timeline">
            {kron.slice(0, kLimit).map((r) => (
              <li key={r.n} className="pk-tl">
                <span className={`viz-key ${JENIS_CLS[r.jenis as Jenis] ?? ''}`} aria-hidden="true" />
                <div>
                  <p className="pk-tl__meta"><time dateTime={r.iso ?? undefined}>{fmtIso(r.iso, r.tanggal, locale)}</time> · {t.jenis[r.jenis as Jenis] ?? r.jenis}
                    {r.terlapor.length > 0 && <> · <IdLinks ids={r.terlapor} known={byId} /></>}</p>
                  <p>{r.peristiwa}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {kLimit < kron.length && <button type="button" className="btn viz-more" onClick={() => setKLimit((l) => l + KRON_PAGE)}>{t.more(Math.min(KRON_PAGE, kron.length - kLimit))}</button>}
      </section>

      <section className="pk-section" aria-labelledby="pk-lp-h">
        <h3 id="pk-lp-h">{t.lpH}</h3>
        <div className="viz-scroll">
          <table>
            <thead><tr><th scope="col">{t.cols.no}</th><th scope="col">{t.cols.nomor}</th><th scope="col">{t.cols.tanggal}</th><th scope="col">{t.cols.arah}</th><th scope="col">{t.cols.terlapor}</th><th scope="col">{t.cols.stpl}</th><th scope="col">{t.cols.dok}</th></tr></thead>
            <tbody>
              {data.laporan.map((l) => (
                <tr key={l.no}>
                  <td>{l.no}</td>
                  <td className="pk-mono">{l.nomor}{l.dokumen.some((d) => d.verifikasi.length) && <span className="pk-ocr" title={l.dokumen.flatMap((d) => d.verifikasi).join('\n')}>⚠</span>}</td>
                  <td>{fmtIso(l.tanggal, l.tanggal ?? '–', locale)}</td>
                  <td><span className={`pk-arah pk-arah--${l.arah}`}>{t.arah[l.arah]}</span>{l.arah === 'terhadap-pelapor' && l.pelapor ? <span className="muted"> ({l.pelapor})</span> : null}</td>
                  <td>{l.terlapor.length ? <IdLinks ids={l.terlapor} known={byId} /> : '–'}</td>
                  <td>{l.stpl}</td>
                  <td>{l.dokumen.map((d) => d.jenis).join(', ')}{l.dokumen.some((d) => d.verifikasi.length) ? <span className="muted"> · {t.verif(l.dokumen.reduce((n, d) => n + d.verifikasi.length, 0))}</span> : null}</td>
                </tr>
              ))}
              {data.aduanBukanLp.map((a) => (
                <tr key={a.nomor}>
                  <td>–</td><td className="pk-mono">{a.nomor}</td><td>{fmtIso(a.tanggal, a.tanggal, locale)}</td>
                  <td><span className="pk-arah pk-arah--oleh-pelapor">{t.arah['oleh-pelapor']}</span></td>
                  <td><IdLinks ids={a.terlapor} known={byId} /></td><td>{a.catatan}</td><td>{a.perihal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
