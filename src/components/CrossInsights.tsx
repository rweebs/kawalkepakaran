// The cross-source panel at the top of /pantau: the three sources read together, with Rahmat Wibowo as the person they
// target. Rendered once at build time (no client directive), so it ships no data to the browser. Counts are facts from
// the three datasets; why things line up in time is labelled an inference. Terlapor stay "dugaan".
import {
  STREAMS, attackWaves, counterAttack, crossSummary, mirroredReports, monthly, overlaps, streamDates, pct,
  type CrossInput, type Stream,
} from '../lib/cross-insights';
import { InsightPanel, fmtDay, fmtMonthYear, fmtN, type Insight, type Locale } from './InsightPanel';

const T = {
  id: {
    title: 'Temuan lintas sumber',
    headline: (y: string, a: string, b: string, n: number, s: number, ad: number, l: number, ag: number) =>
      `Selama ${y} tahun (${a} – ${b}) Rahmat Wibowo menjadi sasaran setidaknya ${n} konten dari tiga sumber. Ia menjawab lewat jalur hukum: ${s} somasi, ${ad} aduan, dan ${l} laporan polisi; ${ag} laporan polisi diajukan pihak lain terhadapnya.`,
    stream: { situs: 'Situs rahmatwibowo.net', fomo: 'Postingan Fomo', perbuatan: 'Perbuatan yang diduga (berkas)', respons: 'Langkah hukum Rahmat' } as Record<Stream, string>,
    chart: 'Empat aliran pada satu sumbu bulan (skala tiap baris sendiri; angka di kanan = total)',
    chartNote: 'Tiga baris atas adalah konten yang menyasar Rahmat; baris bawah adalah somasi dan aduannya.',
    table: 'Tabel data per bulan', month: 'Bulan',
    share: (s: number, f: number, p: number) => `Asal konten yang menyasar Rahmat: ${s}% dari situs rahmatwibowo.net, ${f}% dari Fomo, ${p}% perbuatan lain yang diuraikan di berkasnya.`,
    escalation: (r: number, p: number, x: number) => `Eskalasi: ${r} konten dalam 6 bulan terakhir, dibanding ${p} pada 6 bulan sebelumnya (${x}×).`,
    waves: 'Gelombang serangan (semua sumber; jeda lebih dari 45 hari memisahkan gelombang) dan langkah hukum pertama Rahmat sesudahnya:',
    wavesCols: { wave: 'Gelombang', n: 'Konten', mix: 'Situs / Fomo / perbuatan', peak: 'Puncak', resp: 'Langkah hukum pertama', lag: 'Jeda' },
    days: (n: number) => `${n} hari`, none: '–',
    wavesWhy: 'Gelombang 2023 baru dijawab lewat jalur hukum pada 2026; berkas tidak mencatat mengapa. Jeda bukan bukti bahwa langkah hukum menjawab gelombang tertentu.',
    counter: (c: number, f: number, b: number, a: number, m: number | null) => `Setelah ${c} kelompok langkah hukum Rahmat, ${f} diikuti lebih banyak konten yang menyasarnya dalam 14 hari (total ${b} sebelum, ${a} sesudah).${m !== null ? ` Median jeda dari satu langkah hukum ke konten berikutnya: ${m} hari.` : ''}`,
    counterWhy: 'Ini urutan waktu, bukan sebab: konten bisa bertambah karena alasan lain.',
    overlap: (n: number, t: number) => `${n} terlapor dalam berkas Rahmat juga punya halaman sendiri di bagian /targets/ situs rahmatwibowo.net (cocok persis dengan slug nama; ${t} halaman targets).`,
    overlapWhy: 'Situs itu menampilkan orang-orang yang dilaporkan Rahmat sebagai "korban"-nya, sementara berkas Rahmat mencatat mereka sebagai terlapor. Kecocokan nama tidak menunjukkan siapa yang mengelola situs.',
    mirror: (o: number, od: number, a: number, fo: string, fa: string) => `Laporan polisi: ${o} oleh Rahmat (${od} bertanggal) dan ${a} oleh pihak lain terhadapnya. Laporan pertama terhadap Rahmat bertanggal ${fa}; laporan bertanggal pertama Rahmat ${fo}.`,
    mirrorChart: 'Laporan polisi per bulan: oleh Rahmat (atas) dan terhadap Rahmat (bawah)', own: 'Oleh Rahmat', against: 'Terhadap Rahmat',
    weekday: (d: string, s: number) => `Hari paling ramai untuk konten yang menyasar Rahmat: ${d} (${s}%).`,
    weekdays: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'],
    empty: 'Belum cukup data.',
  },
  en: {
    title: 'Cross-source insights',
    headline: (y: string, a: string, b: string, n: number, s: number, ad: number, l: number, ag: number) =>
      `For ${y} years (${a} – ${b}) Rahmat Wibowo has been the target of at least ${n} items from three sources. He answered through legal channels: ${s} somasi, ${ad} complaints and ${l} police reports; ${ag} police reports were filed by others against him.`,
    stream: { situs: 'rahmatwibowo.net site', fomo: 'Fomo posts', perbuatan: 'Alleged acts (case file)', respons: "Rahmat's legal steps" } as Record<Stream, string>,
    chart: 'Four streams on one month axis (each row has its own scale; number at right = total)',
    chartNote: "The top three rows are content aimed at Rahmat; the bottom row is his somasi and complaints.",
    table: 'Monthly data table', month: 'Month',
    share: (s: number, f: number, p: number) => `Where content aimed at Rahmat came from: ${s}% from rahmatwibowo.net, ${f}% from Fomo, ${p}% other alleged acts described in his file.`,
    escalation: (r: number, p: number, x: number) => `Escalation: ${r} items in the last 6 months against ${p} in the 6 months before (${x}×).`,
    waves: "Waves of attacks (all sources; a gap of more than 45 days separates waves) and Rahmat's first legal step after each:",
    wavesCols: { wave: 'Wave', n: 'Items', mix: 'Site / Fomo / acts', peak: 'Peak', resp: 'First legal step', lag: 'Gap' },
    days: (n: number) => `${n} days`, none: '–',
    wavesWhy: 'The 2023 wave was only answered through legal channels in 2026; the file does not say why. A gap is not proof that a step answered a particular wave.',
    counter: (c: number, f: number, b: number, a: number, m: number | null) => `After ${c} clusters of Rahmat's legal steps, ${f} were followed by more content aimed at him within 14 days (${b} before, ${a} after in total).${m !== null ? ` Median gap from a legal step to the next hostile item: ${m} days.` : ''}`,
    counterWhy: 'Order in time, not cause: content can rise for other reasons.',
    overlap: (n: number, t: number) => `${n} terlapor in Rahmat's file also have their own page under /targets/ on rahmatwibowo.net (exact name-slug match; ${t} target pages).`,
    overlapWhy: "That site presents people Rahmat reported as his \"victims\", while his file lists them as terlapor. A name match does not show who runs the site.",
    mirror: (o: number, od: number, a: number, fo: string, fa: string) => `Police reports: ${o} by Rahmat (${od} dated) and ${a} by others against him. The first report against Rahmat is dated ${fa}; Rahmat's first dated report ${fo}.`,
    mirrorChart: 'Police reports per month: by Rahmat (up) and against Rahmat (down)', own: 'By Rahmat', against: 'Against Rahmat',
    weekday: (d: string, s: number) => `Busiest weekday for content aimed at Rahmat: ${d} (${s}%).`,
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    empty: 'Not enough data.',
  },
};

const CLS: Record<Stream, string> = { situs: 'ci-fill--situs', fomo: 'ci-fill--fomo', perbuatan: 'ci-fill--perbuatan', respons: 'ci-fill--respons' };

/** Small multiples: one row per stream, shared month axis, each row scaled to its own maximum. */
function Multiples({ months, series, labels, locale, title }: { months: string[]; series: Record<Stream, number[]>; labels: Record<Stream, string>; locale: Locale; title: string }) {
  // Each row is its own band: label line on top, then the bars, then a gap, so no label touches the row above.
  const W = 1000;
  const L = 8;
  const R = 64;
  const rowH = 64;
  const labelH = 16;
  const barH = 34;
  const band = (W - L - R) / months.length;
  const H = STREAMS.length * rowH + 22;
  return (
    <div className="viz-scroll ci-scroll">
      <svg className="ci-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${STREAMS.map((s) => `${labels[s]} ${series[s].reduce((a, b) => a + b, 0)}`).join(', ')}`}>
        {STREAMS.map((s, r) => {
          const y0 = r * rowH;
          const base = y0 + labelH + 4 + barH;
          const max = Math.max(1, ...series[s]);
          const total = series[s].reduce((a, b) => a + b, 0);
          return (
            <g key={s}>
              <text className="viz-axis ci-row-label" x={L} y={y0 + labelH - 3}>{labels[s]}</text>
              <line className="viz-baseline" x1={L} x2={W - R} y1={base} y2={base} />
              {series[s].map((v, i) => {
                const h = (v / max) * barH;
                return v ? <rect key={i} className={CLS[s]} x={L + i * band + 0.5} y={base - h} width={Math.max(1.5, band - 1.5)} height={h} rx={1}><title>{`${fmtMonthYear(months[i], locale)}: ${v}`}</title></rect> : null;
              })}
              <text className="viz-label viz-label--strong" x={W - R + 8} y={base - 2}>{fmtN(total, locale)}</text>
            </g>
          );
        })}
        {months.map((m, i) => (m.endsWith('-01') || i === 0 ? <text key={m} className="viz-axis" x={L + i * band} y={H - 4}>{m.slice(0, 4)}</text> : null))}
      </svg>
    </div>
  );
}

/** Mirrored bars: Rahmat's own reports up, reports against him down, per month. */
function Mirror({ months, label, locale }: { months: { key: string; own: number; against: number }[]; label: string; locale: Locale }) {
  const W = 360;
  const mid = 70;
  const unit = 13;
  const band = (W - 40) / Math.max(1, months.length);
  return (
    <svg className="ci-mirror" viewBox={`0 0 ${W} 150`} role="img" aria-label={`${label}: ${months.map((m) => `${fmtMonthYear(m.key, locale)} ${m.own}/${m.against}`).join(', ')}`}>
      <line className="viz-baseline" x1={20} x2={W - 20} y1={mid} y2={mid} />
      {months.map((m, i) => {
        const x = 20 + i * band + band * 0.2;
        const w = band * 0.6;
        return (
          <g key={m.key}>
            {m.own > 0 && <rect className="ci-fill--respons" x={x} y={mid - 2 - m.own * unit} width={w} height={m.own * unit} rx={3} />}
            {m.own > 0 && <text className="viz-label viz-label--strong" x={x + w / 2} y={mid - 6 - m.own * unit} textAnchor="middle">{m.own}</text>}
            {m.against > 0 && <rect className="ci-fill--against" x={x} y={mid + 2} width={w} height={m.against * unit} rx={3} />}
            {m.against > 0 && <text className="viz-label viz-label--strong" x={x + w / 2} y={mid + 16 + m.against * unit} textAnchor="middle">{m.against}</text>}
            <text className="viz-axis" x={x + w / 2} y={146} textAnchor="middle">{fmtMonthYear(m.key, locale)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export interface CrossInsightsProps extends CrossInput { locale?: Locale }

export default function CrossInsights({ locale = 'id', ...x }: CrossInsightsProps) {
  const t = T[locale];
  const d = (s: string) => fmtDay(s, locale);
  const dates = streamDates(x);
  const sum = crossSummary(x, dates);
  const m = monthly(dates);
  const ws = attackWaves(dates);
  const ca = counterAttack(dates);
  const ov = overlaps(x);
  const mr = mirroredReports(x.laporan);
  const targets = x.site.filter((r) => r.section === 'targets').length;
  const items: Insight[] = [];

  items.push({ id: 'share', kind: 'fact', text: t.share(sum.share.situs, sum.share.fomo, sum.share.perbuatan) });
  if (sum.escalation && sum.escalation.ratio !== null) items.push({ id: 'esc', kind: 'fact', text: t.escalation(sum.escalation.recent, sum.escalation.prior, sum.escalation.ratio) });
  if (ws.length) {
    items.push({
      id: 'waves', kind: 'fact', text: t.waves,
      detail: (
        <div className="viz-scroll"><table className="ci-table">
          <thead><tr><th scope="col">{t.wavesCols.wave}</th><th scope="col">{t.wavesCols.n}</th><th scope="col">{t.wavesCols.mix}</th><th scope="col">{t.wavesCols.peak}</th><th scope="col">{t.wavesCols.resp}</th><th scope="col">{t.wavesCols.lag}</th></tr></thead>
          <tbody>{ws.map((w) => (
            <tr key={w.wave.from}>
              <td>{d(w.wave.from)} – {d(w.wave.to)}</td><td>{fmtN(w.wave.count, locale)}</td>
              <td>{w.bySource.situs} / {w.bySource.fomo} / {w.bySource.perbuatan}</td>
              <td>{d(w.wave.peak.date)} ({w.wave.peak.count})</td>
              <td>{w.firstResponse ? d(w.firstResponse) : t.none}</td><td>{w.lagDays !== null ? t.days(w.lagDays) : t.none}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ),
    });
    items.push({ id: 'waves-why', kind: 'inference', text: t.wavesWhy });
  }
  if (ca) {
    items.push({ id: 'counter', kind: 'fact', text: t.counter(ca.clusters, ca.followedByMore, ca.before, ca.after, ca.medianLag) });
    items.push({ id: 'counter-why', kind: 'inference', text: t.counterWhy });
  }
  if (ov.terlapor.length) {
    items.push({
      id: 'overlap', kind: 'fact', text: t.overlap(ov.terlapor.length, targets),
      detail: <ul className="viz-ins__terms">{ov.terlapor.map((o) => <li key={o.id}><span>{o.id}</span> {o.nama}</li>)}</ul>,
    });
    items.push({ id: 'overlap-why', kind: 'inference', text: t.overlapWhy });
  }
  if (mr.own + mr.against > 0 && mr.firstOwn && mr.firstAgainst) {
    items.push({
      id: 'mirror', kind: 'fact', text: t.mirror(mr.own, mr.ownDated, mr.against, d(mr.firstOwn), d(mr.firstAgainst)),
      detail: <figure className="ci-mirror-fig"><Mirror months={mr.months} label={t.mirrorChart} locale={locale} />
        <figcaption className="viz-legend viz-legend--sans"><span><span className="viz-key ci-fill--respons" aria-hidden="true" />{t.own}</span> <span><span className="viz-key ci-fill--against" aria-hidden="true" />{t.against}</span></figcaption></figure>,
    });
  }
  const wdTotal = sum.weekday.reduce((a, b) => a + b, 0);
  if (wdTotal >= 14) {
    const top = sum.weekday.indexOf(Math.max(...sum.weekday));
    items.push({ id: 'weekday', kind: 'fact', text: t.weekday(t.weekdays[top], pct(sum.weekday[top], wdTotal)) });
  }

  const years = sum.span ? fmtN(Math.round((sum.span.days / 365.25) * 10) / 10, locale) : '0';
  const headline = sum.span
    ? t.headline(years, d(sum.span.from), d(sum.span.to), sum.attackTotal, sum.responses.somasi, sum.responses.aduan, sum.responses.laporan, sum.responses.laporanTerhadap)
    : t.empty;

  return (
    <InsightPanel id="ci-h" title={t.title} headline={headline} items={items} locale={locale} empty={t.empty}>
      {m && (
        <figure className="ci-figure">
          <figcaption><p className="ci-caption">{t.chart}</p><p className="muted ci-note">{t.chartNote}</p></figcaption>
          <Multiples months={m.months} series={m.series} labels={t.stream} locale={locale} title={t.chart} />
          <details className="viz-table-view"><summary>{t.table}</summary>
            <div className="viz-scroll"><table className="ci-table">
              <thead><tr><th scope="col">{t.month}</th>{STREAMS.map((s) => <th key={s} scope="col">{t.stream[s]}</th>)}</tr></thead>
              <tbody>{m.months.map((mo, i) => STREAMS.some((s) => m.series[s][i]) ? (
                <tr key={mo}><th scope="row">{fmtMonthYear(mo, locale)}</th>{STREAMS.map((s) => <td key={s}>{m.series[s][i]}</td>)}</tr>
              ) : null)}</tbody>
            </table></div>
          </details>
        </figure>
      )}
    </InsightPanel>
  );
}
