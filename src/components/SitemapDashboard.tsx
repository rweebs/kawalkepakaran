// The /pantau dashboard: filters, stat tiles, five charts and the URL table for the recorded rahmatwibowo.net sitemap.
// Server-rendered in full (works without JavaScript), then hydrated so the filters re-scope every chart and the table.
// Charts are plain SVG measured to their container, so text stays at its real size on a phone.
import { useEffect, useMemo, useState } from 'react';
import { Card, EmptyState, HBars, LineChart, Legend, Sparkline, StackedBars, fmtDay, fmtMonth, fmtN, type Marker, type StackDatum } from './viz/charts';
import { useDebounced, useHashState } from './viz/url-state';
import {
  GROUPS, WATCH_ORIGIN, DEFAULT_FILTERS, filterRows, countByGroup, monthly, cumulative, daily, rowsOnDay, snapshotSeries,
  latestChange, toCsv, sum, type Row, type Group, type Filters, type Basis, type WatchSnapshot, type Counts,
} from '../lib/sitemap-watch';
import SitemapInsights from './SitemapInsights';
import type { WatchEvent } from '../lib/sitemap-insights';

type Locale = 'id' | 'en';

const T = {
  id: {
    filters: 'Saring', groups: 'Bagian situs', search: 'Cari di URL', searchPh: 'mis. abil, somasi, linkedin',
    basis: 'Tanggal yang dipakai', range: 'Rentang tanggal', from: 'Dari', to: 'Sampai', status: 'Status', reset: 'Atur ulang',
    basisOpt: { id: 'Tanggal di slug', lastmod: 'Terakhir diubah (lastmod)', firstSeen: 'Pertama tercatat' },
    statusOpt: { all: 'Semua', listed: 'Masih terdaftar', removed: 'Sudah hilang' },
    presets: { all: 'Semua', d30: '30 hari', d90: '90 hari', m6: '6 bulan', y: 'Tahun ini' },
    other: 'lainnya',
    kTotal: 'URL cocok', kOf: (n: number) => `dari ${n} tercatat`, kChange: 'Perubahan snapshot terakhir',
    kChangeNone: (d: string) => `Snapshot pertama ${d}; perubahan muncul mulai snapshot kedua.`,
    kChangeVal: (a: number, r: number) => `+${a} baru · −${r} hilang`, kSpan: 'Rentang tanggal di slug', kImg: 'Gambar di sitemap',
    kSpanNone: 'Tidak ada item bertanggal', kImgSub: 'gambar pada URL yang cocok',
    cSnap: 'Pertumbuhan tercatat (jumlah URL per snapshot)',
    cSnapNote: 'Satu-satunya ukuran pertumbuhan yang sebenarnya: berapa URL yang tercantum di sitemap pada tiap snapshot.',
    cSnapEmpty: (d: string, n: number) => `Baru ada satu snapshot (${d}: ${n} URL). Garis muncul setelah snapshot berikutnya.`,
    cMonth: 'Item per bulan, menurut tanggal di slug',
    cMonthNote: 'Tanggal yang ditulis pengelola situs di slug (ev-20260607-…). Itu tanggal yang ia berikan pada item, bukan bukti kapan halaman tayang. Halaman targets tidak punya tanggal di slug.',
    earlier: 'Sebelumnya', cCum: 'Akumulasi item bertanggal',
    cCumNote: (b: string) => `Total berjalan menurut: ${b}.`,
    cComp: 'Komposisi per bagian', cDaily: 'Perubahan harian, 60 hari terakhir',
    dailyMode: { id: 'Item baru', lastmod: 'Diubah', firstSeen: 'Muncul di sitemap' },
    dailyNote: {
      id: 'Item per hari menurut tanggal di slug: kira-kira kapan pengelola menambah posting.',
      lastmod: 'Halaman per hari menurut lastmod. Lonjakan besar biasanya pembangunan ulang massal, bukan halaman baru.',
      firstSeen: 'URL yang tercantum di sitemap untuk pertama kali pada snapshot hari itu. Snapshot pertama adalah titik awal, jadi tidak dihitung.',
    },
    dailyPick: 'Tekan sebuah batang untuk melihat posting hari itu.', dailyOn: (d: string, n: number) => `${d}: ${n} posting`,
    dailyNone: 'Tidak ada perubahan pada hari ini.', dailyEmpty: 'Belum ada perubahan untuk tampilan ini.', view: 'Tampilan',
    empty: 'Tidak ada data untuk saringan ini.', emptyNone: 'Belum ada data.', clear: 'Hapus saringan', spark: 'Item per bulan menurut tanggal di slug, 12 bulan terakhir', items: 'item', urls: 'URL', total: 'Total',
    table: 'Daftar URL', cols: { path: 'URL', section: 'Bagian', idDate: 'Tanggal slug', lastmod: 'lastmod', firstSeen: 'Pertama tercatat', images: 'Gbr' },
    removed: 'hilang', more: (n: number) => `Tampilkan ${n} lagi`, shown: (a: number, b: number) => `Menampilkan ${a} dari ${b}`,
    csv: 'Unduh CSV', sortBy: 'Urutkan menurut', dataTable: 'Tabel data grafik bulanan', month: 'Bulan', legend: 'Keterangan',
  },
  en: {
    filters: 'Filter', groups: 'Site sections', search: 'Search URLs', searchPh: 'e.g. abil, somasi, linkedin',
    basis: 'Date to use', range: 'Date range', from: 'From', to: 'To', status: 'Status', reset: 'Reset',
    basisOpt: { id: 'Date in the slug', lastmod: 'Last modified (lastmod)', firstSeen: 'First recorded' },
    statusOpt: { all: 'All', listed: 'Still listed', removed: 'Gone' },
    presets: { all: 'All', d30: '30 days', d90: '90 days', m6: '6 months', y: 'This year' },
    other: 'other',
    kTotal: 'Matching URLs', kOf: (n: number) => `of ${n} recorded`, kChange: 'Change at last snapshot',
    kChangeNone: (d: string) => `First snapshot ${d}; changes appear from the second snapshot.`,
    kChangeVal: (a: number, r: number) => `+${a} new · −${r} gone`, kSpan: 'Slug date range', kImg: 'Images in sitemap',
    kSpanNone: 'No dated items', kImgSub: 'images on matching URLs',
    cSnap: 'Recorded growth (URLs per snapshot)',
    cSnapNote: 'The only true growth measure: how many URLs the sitemap listed at each snapshot.',
    cSnapEmpty: (d: string, n: number) => `Only one snapshot so far (${d}: ${n} URLs). The line appears after the next one.`,
    cMonth: 'Items per month, by the date in the slug',
    cMonthNote: "The date the site's operator wrote into the slug (ev-20260607-…). It is the date they gave the item, not proof of when the page went live. Target pages carry no slug date.",
    earlier: 'Earlier', cCum: 'Running total of dated items',
    cCumNote: (b: string) => `Running total by: ${b}.`,
    cComp: 'Composition by section', cDaily: 'Daily changes, last 60 days',
    dailyMode: { id: 'New items', lastmod: 'Edited', firstSeen: 'First in sitemap' },
    dailyNote: {
      id: 'Items per day by the date in the slug: roughly when the operator adds posts.',
      lastmod: 'Pages per day by lastmod. Large spikes are usually bulk rebuilds, not new pages.',
      firstSeen: 'URLs a snapshot listed for the first time that day. The first snapshot is the baseline, so it is not counted.',
    },
    dailyPick: 'Press a bar to see that day\'s posts.', dailyOn: (d: string, n: number) => `${d}: ${n} posts`,
    dailyNone: 'No changes on this day.', dailyEmpty: 'No changes yet for this view.', view: 'View',
    empty: 'No data for this filter.', emptyNone: 'No data yet.', clear: 'Clear filters', spark: 'Items per month by slug date, last 12 months', items: 'items', urls: 'URLs', total: 'Total',
    table: 'URL list', cols: { path: 'URL', section: 'Section', idDate: 'Slug date', lastmod: 'lastmod', firstSeen: 'First recorded', images: 'Img' },
    removed: 'gone', more: (n: number) => `Show ${n} more`, shown: (a: number, b: number) => `Showing ${a} of ${b}`,
    csv: 'Download CSV', sortBy: 'Sort by', dataTable: 'Monthly chart data table', month: 'Month', legend: 'Legend',
  },
} as const;

const groupLabel = (g: Group, locale: Locale) => (g === 'other' ? T[locale].other : `${g}/`);
const PAGE = 50;

// Chart primitives (StackedBars, LineChart, HBars, Legend, Card, tooltips, focus handling) come from ./viz/charts,
// shared with the Gelar Perkara and Fomo sections, so every chart on /pantau behaves the same way.
const seriesFill = (g: Group) => `viz-fill--${g}`;
const seriesStroke = (g: Group) => `viz-stroke--${g}`;

// ---------- the dashboard ----------
type SortKey = 'path' | 'section' | 'idDate' | 'lastmod' | 'firstSeen' | 'images';

export interface DashboardProps {
  rows: Row[];
  snapshots: WatchSnapshot[];
  locale?: Locale;
  /** Case-timeline events (date, title, link) for the overlays and the event insight. Optional. */
  events?: WatchEvent[];
  /** UTC offset of each row's raw lastmod stamp, in the same order as `rows`. Optional; enables the time-zone insight. */
  offsets?: (string | null)[];
}

export default function SitemapDashboard({ rows, snapshots, locale = 'id', events = [], offsets }: DashboardProps) {
  const markers: Marker[] = events.map((e) => ({ key: e.date, label: e.title }));
  const t = T[locale];
  const latest = snapshots.at(-1)?.date ?? '';
  const [f, setF] = useHashState<Filters>('situs', DEFAULT_FILTERS);
  const [qInput, setQInput] = useState(f.q);
  const qDeb = useDebounced(qInput, 150);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'idDate', desc: true });
  const [limit, setLimit] = useState(PAGE);
  const set = (patch: Partial<Filters>) => { setF((p) => ({ ...p, ...patch })); setLimit(PAGE); };
  // The search box types freely; the filter (and every chart) follows 150ms after typing stops.
  useEffect(() => { if (qDeb !== f.q) set({ q: qDeb }); }, [qDeb]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (f.q !== qInput && f.q !== qDeb) setQInput(f.q); }, [f.q]); // eslint-disable-line react-hooks/exhaustive-deps
  // Legend toggles hide a series in the stacked charts; the last visible one cannot be hidden.
  const toggleSeries = (k: string, visible: readonly string[]) => setHiddenSeries((h) => {
    const next = new Set(h);
    if (next.has(k)) next.delete(k);
    else if (visible.filter((v) => !next.has(v)).length > 1) next.add(k);
    return next;
  });
  const legendItems = (gs: readonly Group[]) => gs.map((g) => ({ key: g, label: groupLabel(g, locale), cls: seriesFill(g) }));

  const shown = useMemo(() => filterRows(rows, f), [rows, f]);
  const counts = useMemo(() => countByGroup(shown), [shown]);
  const months = useMemo(() => monthly(shown), [shown]);
  const cum = useMemo(() => cumulative(shown, f.basis), [shown, f.basis]);
  const [dayMode, setDayMode] = useState<Basis>('id');
  const days = useMemo(() => daily(shown, latest, 60, dayMode, snapshots[0]?.date), [shown, latest, dayMode, snapshots]);
  const lastActive = days.findLastIndex((b) => sum(b.counts) > 0);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const dayIdx = pickedDay ? days.findIndex((b) => b.date === pickedDay) : lastActive;
  const day = dayIdx >= 0 ? days[dayIdx] : null;
  const dayRows = useMemo(() => (day ? rowsOnDay(shown, day.date, dayMode) : []), [shown, day, dayMode])
    .filter((r) => dayMode !== 'firstSeen' || r.firstSeen !== snapshots[0]?.date);
  const snaps = useMemo(() => snapshotSeries(snapshots, f.groups), [snapshots, f.groups]);
  const change = useMemo(() => latestChange(shown, snapshots), [shown, snapshots]);
  const dated = useMemo(() => shown.map((r) => r.idDate).filter((d): d is string => !!d).sort(), [shown]);
  const images = shown.reduce((n, r) => n + r.images, 0);

  const sorted = useMemo(() => {
    const val = (r: Row): string | number => (sort.key === 'images' ? r.images : (r[sort.key] ?? ''));
    return [...shown].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === vb) return a.path.localeCompare(b.path);
      if (va === '') return 1;
      if (vb === '') return -1;
      return (va < vb ? -1 : 1) * (sort.desc ? -1 : 1);
    });
  }, [shown, sort]);

  const preset = (k: keyof typeof t.presets) => {
    if (k === 'all' || !latest) return set({ from: '', to: '' });
    const end = Date.parse(`${latest}T00:00:00Z`);
    const back = { d30: 29, d90: 89, m6: 182 } as const;
    const from = k === 'y' ? `${latest.slice(0, 4)}-01-01` : new Date(end - back[k] * 86_400_000).toISOString().slice(0, 10);
    set({ from, to: latest });
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(sorted)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rahmatwibowo-net-sitemap-${latest}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Chips toggle a group; turning off the last one brings all back rather than showing an empty dashboard.
  const toggleGroup = (g: Group) => {
    const next = f.groups.includes(g) ? f.groups.filter((x) => x !== g) : GROUPS.filter((x) => x === g || f.groups.includes(x));
    set({ groups: next.length ? next : GROUPS });
  };

  const firstMonth = months.find((x) => !x.earlier)?.key;
  const monthData: StackDatum<Group>[] = months.map((b) => ({
    key: b.earlier ? 'earlier' : b.key, counts: b.counts,
    label: b.earlier ? t.earlier : fmtMonth(b.key, locale, b.key.endsWith('-01') || b.key === firstMonth),
    tip: b.earlier ? `${t.earlier} (< ${fmtMonth(b.key, locale, true)})` : fmtMonth(b.key, locale, true),
  }));
  const dayData: StackDatum<Group>[] = days.map((b) => ({
    key: b.date, counts: b.counts, tip: fmtDay(b.date, locale),
    label: b.date.endsWith('-01') ? fmtMonth(b.date.slice(0, 7), locale, false) : '',
  }));
  const datedGroups = f.groups.filter((g) => g !== 'targets');
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);
  const reset = () => { setF(DEFAULT_FILTERS); setQInput(''); setLimit(PAGE); };
  const empty = <EmptyState kind={filtered ? 'filtered' : 'nodata'} text={filtered ? t.empty : t.emptyNone} onClear={reset} clearLabel={t.clear} />;
  const spark = months.filter((b) => !b.earlier).map((b) => sum(b.counts));
  const pct = (n: number) => (shown.length ? `${Math.round((n / shown.length) * 100)}%` : undefined);

  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="viz-sort" aria-label={`${t.sortBy} ${label}`}
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'path' && key !== 'section' }))}>
        {label}<span aria-hidden="true">{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="viz">
      <form className="viz-filters" aria-label={t.filters} onSubmit={(e) => e.preventDefault()}>
        <fieldset className="viz-filters__row">
          <legend>{t.range}</legend>
          {(Object.keys(t.presets) as (keyof typeof t.presets)[]).map((k) => (
            <button key={k} type="button" className="viz-chip" onClick={() => preset(k)}>{t.presets[k]}</button>
          ))}
          <label>{t.from} <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
          <label>{t.to} <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
          <label>{t.basis} <select value={f.basis} onChange={(e) => set({ basis: e.target.value as Basis })}>
            {(Object.keys(t.basisOpt) as Basis[]).map((b) => <option key={b} value={b}>{t.basisOpt[b]}</option>)}
          </select></label>
        </fieldset>
        <fieldset className="viz-filters__row">
          <legend>{t.groups}</legend>
          {GROUPS.map((g) => (
            <button key={g} type="button" className="viz-chip" aria-pressed={f.groups.includes(g)} onClick={() => toggleGroup(g)}>
              <span className={`viz-key viz-fill--${g}`} aria-hidden="true" />{groupLabel(g, locale)}
            </button>
          ))}
          <label>{t.status} <select value={f.status} onChange={(e) => set({ status: e.target.value as Filters['status'] })}>
            {(Object.keys(t.statusOpt) as Filters['status'][]).map((s) => <option key={s} value={s}>{t.statusOpt[s]}</option>)}
          </select></label>
          <label className="viz-search">{t.search} <input type="search" value={qInput} placeholder={t.searchPh} autoComplete="off" onChange={(e) => setQInput(e.target.value)} /></label>
          <button type="button" className="btn viz-reset" disabled={!filtered && !qInput} onClick={reset}>{t.reset}</button>
        </fieldset>
      </form>

      <div className="viz-tiles" aria-live="polite">
        <div className="viz-tile"><p className="viz-tile__k">{t.kTotal}</p><p className="viz-tile__v">{fmtN(shown.length, locale)}</p><p className="viz-tile__s">{t.kOf(rows.length)}</p><Sparkline values={spark} label={t.spark} /></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.kChange}</p>
          {change ? <p className="viz-tile__v viz-tile__v--sm">{t.kChangeVal(change.added, change.removed)}</p> : <p className="viz-tile__s">{t.kChangeNone(fmtDay(latest, locale))}</p>}
        </div>
        <div className="viz-tile"><p className="viz-tile__k">{t.kSpan}</p>
          {dated.length ? <p className="viz-tile__v viz-tile__v--sm">{fmtDay(dated[0], locale)} – {fmtDay(dated.at(-1)!, locale)}</p> : <p className="viz-tile__s">{t.kSpanNone}</p>}
        </div>
        <div className="viz-tile"><p className="viz-tile__k">{t.kImg}</p><p className="viz-tile__v">{fmtN(images, locale)}</p><p className="viz-tile__s">{t.kImgSub}</p></div>
      </div>

      <SitemapInsights rows={rows} shown={shown} latest={latest} locale={locale} events={events} offsets={offsets} />

      <div className="viz-cards">
        <Card title={t.cSnap} note={t.cSnapNote} wide locale={locale}>
          {snaps.length >= 2
            ? <LineChart points={snaps.map((s) => ({ date: s.date, value: s.total }))} locale={locale} unit={t.urls} height={200} />
            : <p className="viz-empty">{t.cSnapEmpty(fmtDay(latest, locale), snaps[0]?.total ?? 0)}</p>}
        </Card>
        <Card title={t.cMonth} note={t.cMonthNote} wide locale={locale}>
          {monthData.length ? <>
            <Legend label={t.legend} items={legendItems(datedGroups)} hidden={hiddenSeries} onToggle={(k) => toggleSeries(k, datedGroups)} />
            <StackedBars data={monthData} series={datedGroups} fill={seriesFill} stroke={seriesStroke} seriesLabel={(g) => groupLabel(g, locale)}
              locale={locale} unit={t.items} hidden={hiddenSeries} compressGaps={3} />
          </> : empty}
          {monthData.length > 0 && (
            <details className="viz-table-view"><summary>{t.dataTable}</summary>
              <div className="viz-scroll"><table>
                <thead><tr><th scope="col">{t.month}</th>{datedGroups.map((g) => <th key={g} scope="col">{groupLabel(g, locale)}</th>)}<th scope="col">{t.total}</th></tr></thead>
                <tbody>{monthData.map((b) => <tr key={b.key}><th scope="row">{b.tip}</th>{datedGroups.map((g) => <td key={g}>{b.counts[g]}</td>)}<td>{sum(b.counts)}</td></tr>)}</tbody>
              </table></div>
            </details>
          )}
        </Card>
        <Card title={t.cCum} note={t.cCumNote(t.basisOpt[f.basis])} locale={locale}>
          {cum.length ? <LineChart points={cum.map((p) => ({ date: p.date, value: p.total, sub: `+${p.added}` }))} locale={locale} unit={t.items} markers={f.basis === 'id' ? markers : []} /> : empty}
        </Card>
        <Card title={t.cComp} locale={locale}>
          {shown.length ? <HBars locale={locale} unit={t.urls} labelWidth={110}
            rows={[...f.groups].sort((a, b) => counts[b] - counts[a]).map((g) => ({ key: g, label: groupLabel(g, locale), n: counts[g], cls: seriesFill(g), sub: pct(counts[g]) }))} /> : empty}
        </Card>
        <Card title={t.cDaily} note={t.dailyNote[dayMode]} wide locale={locale}>
          <div className="viz-seg" role="group" aria-label={t.view}>
            {(Object.keys(t.dailyMode) as Basis[]).map((m) => (
              <button key={m} type="button" className="viz-chip" aria-pressed={dayMode === m} onClick={() => { setDayMode(m); setPickedDay(null); }}>{t.dailyMode[m]}</button>
            ))}
          </div>
          {lastActive < 0 ? <EmptyState kind={filtered ? 'filtered' : 'nodata'} text={t.dailyEmpty} onClear={reset} clearLabel={t.clear} /> : <>
            <Legend label={t.legend} items={legendItems(dayMode === 'id' ? datedGroups : f.groups)} hidden={hiddenSeries} onToggle={(k) => toggleSeries(k, f.groups)} />
            <StackedBars data={dayData} series={f.groups} fill={seriesFill} stroke={seriesStroke} seriesLabel={(g) => groupLabel(g, locale)}
              locale={locale} unit={t.items} height={190} hidden={hiddenSeries} selected={dayIdx} onSelect={(i) => setPickedDay(days[i].date)} markers={markers} />
            <p className="muted viz-day-hint">{t.dailyPick}</p>
            {day && (
              <div className="viz-day" aria-live="polite">
                <h4>{t.dailyOn(fmtDay(day.date, locale), dayRows.length)}</h4>
                {dayRows.length === 0 ? <p className="muted">{t.dailyNone}</p> : (
                  <ul>{dayRows.slice(0, 40).map((r) => (
                    <li key={r.path}><span className={`viz-key viz-fill--${r.group}`} aria-hidden="true" />
                      {r.removed ? <span>{r.path} <span className="viz-gone">{t.removed}</span></span>
                        : <a href={`${WATCH_ORIGIN}${r.path}`} rel="nofollow ugc noopener noreferrer" target="_blank">{r.path}</a>}</li>
                  ))}</ul>
                )}
                {dayRows.length > 40 && <p className="muted">{t.shown(40, dayRows.length)}</p>}
              </div>
            )}
          </>}
        </Card>
      </div>

      <section className="viz-table" aria-labelledby="viz-table-h">
        <div className="viz-table__head">
          <h3 id="viz-table-h">{t.table}</h3>
          <p className="muted" role="status">{t.shown(Math.min(limit, sorted.length), sorted.length)}</p>
          <button type="button" className="btn" onClick={download} disabled={!sorted.length}>{t.csv}</button>
        </div>
        <div className="viz-scroll">
          <table>
            <thead><tr>{th('path', t.cols.path)}{th('section', t.cols.section)}{th('idDate', t.cols.idDate)}{th('lastmod', t.cols.lastmod)}{th('firstSeen', t.cols.firstSeen)}{th('images', t.cols.images)}</tr></thead>
            <tbody>
              {sorted.slice(0, limit).map((r) => (
                <tr key={r.path}>
                  <td className="viz-path">
                    <span className={`viz-key viz-fill--${r.group}`} aria-hidden="true" />
                    {r.removed
                      ? <><span>{r.path}</span> <span className="viz-gone">{t.removed}</span></>
                      : <a href={`${WATCH_ORIGIN}${r.path}`} rel="nofollow ugc noopener noreferrer" target="_blank">{r.path}</a>}
                  </td>
                  <td>{r.section}</td>
                  <td>{r.idDate ? fmtDay(r.idDate, locale) : '–'}</td>
                  <td>{r.lastmod ? fmtDay(r.lastmod, locale) : '–'}</td>
                  <td>{fmtDay(r.firstSeen, locale)}</td>
                  <td>{r.images || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {limit < sorted.length && <button type="button" className="btn viz-more" onClick={() => setLimit((l) => l + PAGE)}>{t.more(Math.min(PAGE, sorted.length - limit))}</button>}
      </section>
    </div>
  );
}
