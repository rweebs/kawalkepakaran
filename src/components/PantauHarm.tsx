// Three build-time charts next to the cross-source panel on /pantau:
// - harm vs response: content aimed at Rahmat per month against his own somasi + aduan per month, one axis, one unit,
//   with each wave annotated (the 2023 → 2026 story made explicit);
// - harm categories: a treemap of the Pelapor's mapped articles grouped by the harm they name;
// - the operator's focus: terlapor the hostile site writes about most (exact full-name slug in its evidence pages).
// Each chart carries a "how this is counted" note and a table. No client code.
import { fmtMonthYear, fmtN, type Locale } from './InsightPanel';
import { niceTicks } from './viz/charts';
import { HARM, treemap, type Harm, type HarmResponse } from '../lib/pantau-page';

const T = {
  id: {
    hrTitle: 'Serangan dan jawaban per bulan',
    hrNote: 'Area: konten yang menyasar Rahmat (situs + Fomo + perbuatan yang diduga). Garis: somasi dan aduan Rahmat. Satu sumbu, satuan sama (item per bulan).',
    harm: 'Konten yang menyasar Rahmat', resp: 'Somasi dan aduan Rahmat',
    wave: (h: number, r: number) => `${h} konten · ${r} jawaban`,
    order: 'Urutan waktu, bukan sebab: garis yang naik sesudah area tidak membuktikan yang satu menjawab yang lain.',
    how: 'Cara menghitung',
    hrHow: 'Tanggal di slug untuk situs, tanggal postingan untuk Fomo, tanggal baris kronologis berkas untuk perbuatan, somasi, dan aduan. Hanya tanggal lengkap (hari) yang dihitung. Gelombang = bulan berurutan yang berisi konten, minimal 20 item.',
    table: 'Tabel data', month: 'Bulan',
    tmTitle: 'Jenis dugaan perbuatan, menurut pasal di berkas Pelapor',
    tmNote: 'Luas kotak = jumlah terlapor yang dipetakan ke pasal dengan jenis itu (satu terlapor dihitung sekali per jenis).',
    tmHow: 'Pasal diambil dari pemetaan Pelapor sendiri. Pengelompokan ke jenis adalah pembacaan halaman ini atas nomor pasal, bukan pendapat hukum; pasal umum (penyertaan, korporasi, ruang lingkup) tidak dihitung.',
    harmLabel: {
      pencemaran: 'Pencemaran nama baik', fitnah: 'Fitnah', penghinaan: 'Penghinaan ringan', ancaman: 'Ancaman / gangguan',
      bohong: 'Berita bohong / pemalsuan', data: 'Data pribadi', disabilitas: 'Terkait penyandang disabilitas', lain: 'Lainnya',
    } as Record<Harm, string>,
    terlapor: 'terlapor', pasal: 'Pasal',
    ofTitle: 'Terlapor yang paling sering ditulis situs rahmatwibowo.net',
    ofNote: 'Jumlah halaman /evidence/ di situs itu yang slug-nya memuat nama lengkap terlapor.',
    ofHow: 'Cocok persis: nama lengkap terlapor diubah menjadi slug (huruf kecil, tanda hubung) dan harus muncul utuh di slug halaman evidence. Nama satu kata tidak dihitung.',
    pages: 'halaman', none: 'Tidak ada kecocokan.', dugaan: 'Dugaan',
  },
  en: {
    hrTitle: 'Attacks and answers per month',
    hrNote: "Area: content aimed at Rahmat (site + Fomo + alleged acts). Line: Rahmat's somasi and complaints. One axis, same unit (items per month).",
    harm: 'Content aimed at Rahmat', resp: "Rahmat's somasi and complaints",
    wave: (h: number, r: number) => `${h} items · ${r} answers`,
    order: 'Order in time, not cause: a line rising after the area does not prove one answered the other.',
    how: 'How this is counted',
    hrHow: 'Slug date for the site, post date for Fomo, chronology row date in the case file for acts, somasi and complaints. Only full (day) dates count. A wave = consecutive months with content, at least 20 items.',
    table: 'Data table', month: 'Month',
    tmTitle: "Kinds of alleged acts, by the articles in the Pelapor's file",
    tmNote: 'Box area = terlapor mapped to an article of that kind (one terlapor counts once per kind).',
    tmHow: "Articles come from the Pelapor's own mapping. Grouping them into kinds is this page's reading of the article numbers, not a legal opinion; general provisions (participation, corporate liability, scope) are not counted.",
    harmLabel: {
      pencemaran: 'Defamation', fitnah: 'Slander (fitnah)', penghinaan: 'Minor insult', ancaman: 'Threats / harassment',
      bohong: 'False news / forgery', data: 'Personal data', disabilitas: 'Disability-related', lain: 'Other',
    } as Record<Harm, string>,
    terlapor: 'terlapor', pasal: 'Articles',
    ofTitle: 'Terlapor the rahmatwibowo.net site writes about most',
    ofNote: "Number of that site's /evidence/ pages whose slug contains the terlapor's full name.",
    ofHow: "Exact match: the terlapor's full name is turned into a slug (lower case, hyphens) and must appear whole in the evidence page slug. One-word names are not counted.",
    pages: 'pages', none: 'No matches.', dugaan: 'Alleged',
  },
};

function How({ label, text }: { label: string; text: string }) {
  return <details className="pg-how"><summary>{label}</summary><p>{text}</p></details>;
}

export function HarmResponseChart({ data, locale = 'id' }: { data: HarmResponse; locale?: Locale }) {
  const t = T[locale];
  const W = 1000;
  const H = 260;
  const m = { t: 34, r: 12, b: 26, l: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(1, ...data.harm, ...data.response);
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const n = data.months.length;
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const area = `M${x(0)},${y(0)} ${data.harm.map((v, i) => `L${x(i)},${y(v)}`).join(' ')} L${x(n - 1)},${y(0)} Z`;
  const line = data.response.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  const idx = new Map(data.months.map((mo, i) => [mo, i]));
  return (
    <figure className="pg-fig">
      <figcaption><h4>{t.hrTitle}</h4><p className="muted">{t.hrNote}</p></figcaption>
      <ul className="viz-legend viz-legend--sans">
        <li><span className="viz-key pg-fill--harm" aria-hidden="true" />{t.harm}</li>
        <li><span className="pg-key-line" aria-hidden="true" />{t.resp}</li>
      </ul>
      <svg className="pg-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.hrTitle}: ${data.waves.map((w) => `${fmtMonthYear(w.from, locale)} – ${fmtMonthYear(w.to, locale)}: ${t.wave(w.harm, w.response)}`).join('; ')}`}>
        {ticks.map((v) => <g key={v}><line className="viz-grid" x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} /><text className="viz-axis" x={m.l - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
        {data.waves.map((w) => {
          const a = x(idx.get(w.from)!);
          const b = x(idx.get(w.to)!);
          return (
            <g key={w.from}>
              <rect className="pg-wave" x={a - 4} y={m.t - 4} width={Math.max(8, b - a + 8)} height={ih + 4} rx={4} />
              <text className="viz-label viz-label--sans pg-wave__t" x={a} y={m.t - 18}>{`${fmtMonthYear(w.from, locale)} – ${fmtMonthYear(w.to, locale)}`}</text>
              <text className="viz-axis" x={a} y={m.t - 6}>{t.wave(w.harm, w.response)}</text>
            </g>
          );
        })}
        <path className="pg-fill--harm pg-area" d={area} />
        <path className="pg-line" d={line} />
        <line className="viz-baseline" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} />
        {data.months.map((mo, i) => (mo.endsWith('-01') || i === 0 ? <text key={mo} className="viz-axis" x={x(i)} y={H - 6} textAnchor="middle">{mo.slice(0, 4)}</text> : null))}
      </svg>
      <p className="pg-order"><span className="viz-ins__kind viz-ins__kind--inference">{locale === 'en' ? 'Inference' : 'Dugaan'}</span> {t.order}</p>
      <How label={t.how} text={t.hrHow} />
      <details className="viz-table-view"><summary>{t.table}</summary>
        <div className="viz-scroll"><table className="ci-table">
          <thead><tr><th scope="col">{t.month}</th><th scope="col">{t.harm}</th><th scope="col">{t.resp}</th></tr></thead>
          <tbody>{data.months.map((mo, i) => (data.harm[i] || data.response[i]
            ? <tr key={mo}><th scope="row">{fmtMonthYear(mo, locale)}</th><td>{data.harm[i]}</td><td>{data.response[i]}</td></tr> : null))}</tbody>
        </table></div>
      </details>
    </figure>
  );
}

export function HarmTreemap({ cats, locale = 'id' }: { cats: { harm: Harm; terlapor: number; pasal: string[] }[]; locale?: Locale }) {
  const t = T[locale];
  const W = 640;
  const H = 280;
  const tiles = treemap(cats.map((c) => ({ key: c.harm, value: c.terlapor })), W, H);
  const order = new Map(HARM.map((h, i) => [h, i]));
  return (
    <figure className="pg-fig">
      <figcaption><h4>{t.tmTitle} <span className="pg-chip">{t.dugaan}</span></h4><p className="muted">{t.tmNote}</p></figcaption>
      <svg className="pg-svg pg-svg--tm" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.tmTitle}: ${cats.map((c) => `${t.harmLabel[c.harm]} ${c.terlapor}`).join(', ')}`}>
        {tiles.map((tl) => {
          const big = tl.w > 110 && tl.h > 44;
          return (
            <g key={tl.key}>
              <rect className={`pg-tm pg-tm--${order.get(tl.key as Harm)! % 4}`} x={tl.x + 1} y={tl.y + 1} width={Math.max(0, tl.w - 2)} height={Math.max(0, tl.h - 2)} rx={4}>
                <title>{`${t.harmLabel[tl.key as Harm]}: ${tl.value} ${t.terlapor}`}</title>
              </rect>
              {big && <text className="pg-tm__t" x={tl.x + 10} y={tl.y + 22}>{t.harmLabel[tl.key as Harm]}</text>}
              {big && <text className="pg-tm__v" x={tl.x + 10} y={tl.y + 40}>{`${tl.value} ${t.terlapor}`}</text>}
              {!big && tl.w > 30 && tl.h > 18 && <text className="pg-tm__v" x={tl.x + 6} y={tl.y + 15}>{tl.value}</text>}
            </g>
          );
        })}
      </svg>
      <How label={t.how} text={t.tmHow} />
      <details className="viz-table-view" open><summary>{t.table}</summary>
        <div className="viz-scroll"><table className="ci-table">
          <thead><tr><th scope="col">{locale === 'en' ? 'Kind' : 'Jenis'}</th><th scope="col">{t.terlapor}</th><th scope="col">{t.pasal}</th></tr></thead>
          <tbody>{cats.map((c) => <tr key={c.harm}><th scope="row">{t.harmLabel[c.harm]}</th><td>{c.terlapor}</td><td className="pk-mono">{c.pasal.join(', ')}</td></tr>)}</tbody>
        </table></div>
      </details>
    </figure>
  );
}

export function OperatorFocus({ rows, locale = 'id', anchor }: { rows: { id: string; nama: string; evidence: number }[]; locale?: Locale; anchor: (id: string) => string }) {
  const t = T[locale];
  const top = rows.slice(0, 15);
  const max = Math.max(1, ...top.map((r) => r.evidence));
  return (
    <figure className="pg-fig">
      <figcaption><h4>{t.ofTitle} <span className="pg-chip">{t.dugaan}</span></h4><p className="muted">{t.ofNote}</p></figcaption>
      {top.length === 0 ? <p className="viz-empty">{t.none}</p> : (
        <ol className="pg-bars">
          {top.map((r) => (
            <li key={r.id}>
              <span className="pg-bars__l"><span className="pk-mono">{r.id}</span> <a href={anchor(r.id)}>{r.nama}</a></span>
              <svg className="pg-bars__track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect className="pg-bars__bg" x={0} y={0} width={100} height={10} rx={2} /><rect className="pg-bars__fill" x={0} y={0} width={(r.evidence / max) * 100} height={10} rx={2} /></svg>
              <span className="pg-bars__v">{fmtN(r.evidence, locale)} {t.pages}</span>
            </li>
          ))}
        </ol>
      )}
      <How label={t.how} text={t.ofHow} />
    </figure>
  );
}
