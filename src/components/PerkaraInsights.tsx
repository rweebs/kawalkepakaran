// Findings for the Gelar Perkara section: how far Rahmat Wibowo's reports have gone, how long after the alleged acts he
// acted, what remains open, and the reports filed against him. Recomputed from the filtered terlapor. Terlapor stay
// "dugaan": counts describe the Pelapor's file, not guilt.
import { useMemo } from 'react';
import { InsightPanel, fmtDay, fmtMonthYear, type Insight, type Locale } from './InsightPanel';
import { perkaraInsight, type Perkara, type Terlapor, type Tahap } from '../lib/perkara';

const T = {
  id: {
    title: 'Temuan', empty: 'Belum cukup data untuk temuan pada saringan ini.',
    stage: { terlapor: 'diuraikan', somasi: 'disomasi', aduan: 'diadukan', laporan: 'laporan polisi', stpl: 'STPL' } as Record<Tahap['key'], string>,
    headline: (n: number, s: number, a: number, l: number, sp: number) =>
      `Rahmat Wibowo menempuh jalur hukum terhadap ${n} terlapor: ${s} disomasi (${sp}%), ${a} diadukan, dan ${l} sampai laporan polisi.`,
    conv: 'Konversi antar-tahap (dari terlapor yang sampai tahap sebelumnya):',
    convRow: (a: string, b: string, r: number) => `${a} → ${b}: ${r}%`,
    lag: (n: number, m: number, lo: number, hi: number) => `Dari perbuatan yang diduga pertama sampai somasi pertama: median ${m} hari (rentang ${lo}–${hi} hari, ${n} terlapor dengan kedua tanggal).`,
    lagWhy: 'Jeda panjang dapat berarti Pelapor baru mengetahui atau menghimpun bukti belakangan; berkas tidak mencatat kapan setiap unggahan diketahui.',
    backlog: (n: number, s: number, k: string, kn: number) => `${n} terlapor (${s}%) belum punya laporan polisi dari Pelapor; terbanyak di kategori ${k} (${kn}).`,
    kat: (k: string, n: number, s: number) => `Kategori terbesar: ${k}, ${n} terlapor (${s}%).`,
    pairs: 'Pasal yang paling sering dipetakan bersama pada satu terlapor:',
    pairRow: (a: string, b: string, n: number) => `${a} + ${b}: ${n} terlapor`,
    identity: (f: number, p: number, n: number) => `Status identitas: ${f} teridentifikasi, ${p} sebagian, ${n} belum teridentifikasi (akun anonim).`,
    identityWhy: 'Akun yang belum teridentifikasi hanya dapat dipastikan lewat permintaan data kepada penyelenggara platform; angka ini bukan kesimpulan tentang siapa pemiliknya.',
    acts: (y23: number, y26: number, t: number) => `Dari ${t} perbuatan yang diduga, ${y23} bertanggal 2023 dan ${y26} bertanggal 2026: serangan datang dalam dua gelombang dengan jeda lebih dari dua tahun.`,
    busiest: (m: string, n: number) => `Bulan tersibuk langkah hukum Pelapor: ${m} (${n} somasi dan aduan).`,
    counter: (a: number, after: number, first: string) => `${a} laporan polisi diajukan pihak lain terhadap Pelapor; ${after} di antaranya bertanggal setelah laporan polisi pertama Pelapor (${first}).`,
    counterWhy: 'Laporan yang datang setelah Pelapor melapor bisa merupakan laporan balik, tetapi berkas tidak memuat alasan pelapornya; ini urutan waktu, bukan maksud.',
    verify: (w: number, d: number) => `${w} dari ${d} dokumen pendukung punya catatan verifikasi (hasil pindai/OCR) yang wajib dicocokkan dengan dokumen asli.`,
  },
  en: {
    title: 'Insights', empty: 'Not enough data for insights under this filter.',
    stage: { terlapor: 'described', somasi: 'somasi', aduan: 'complaint', laporan: 'police report', stpl: 'STPL' } as Record<Tahap['key'], string>,
    headline: (n: number, s: number, a: number, l: number, sp: number) =>
      `Rahmat Wibowo has taken legal steps against ${n} terlapor: ${s} sent a somasi (${sp}%), ${a} complained about, and ${l} taken to a police report.`,
    conv: 'Conversion between stages (of terlapor that reached the previous stage):',
    convRow: (a: string, b: string, r: number) => `${a} → ${b}: ${r}%`,
    lag: (n: number, m: number, lo: number, hi: number) => `From the first alleged act to the first somasi: median ${m} days (range ${lo}–${hi} days, ${n} terlapor with both dates).`,
    lagWhy: 'A long gap may mean the Pelapor only learned of or gathered the evidence later; the file does not record when each post became known.',
    backlog: (n: number, s: number, k: string, kn: number) => `${n} terlapor (${s}%) have no police report from the Pelapor yet; most are in ${k} (${kn}).`,
    kat: (k: string, n: number, s: number) => `Largest category: ${k}, ${n} terlapor (${s}%).`,
    pairs: 'Articles most often mapped together to one terlapor:',
    pairRow: (a: string, b: string, n: number) => `${a} + ${b}: ${n} terlapor`,
    identity: (f: number, p: number, n: number) => `Identity status: ${f} identified, ${p} partly, ${n} not identified (anonymous accounts).`,
    identityWhy: 'Unidentified accounts can only be confirmed through a data request to the platform; this count is not a conclusion about who owns them.',
    acts: (y23: number, y26: number, t: number) => `Of ${t} alleged acts, ${y23} are dated 2023 and ${y26} are dated 2026: the attacks came in two waves more than two years apart.`,
    busiest: (m: string, n: number) => `Busiest month of the Pelapor's legal steps: ${m} (${n} somasi and complaints).`,
    counter: (a: number, after: number, first: string) => `${a} police reports were filed by others against the Pelapor; ${after} of them are dated after his first police report (${first}).`,
    counterWhy: 'Reports that came after the Pelapor reported may be counter-reports, but the file does not hold their filers\' reasons; this is order in time, not intent.',
    verify: (w: number, d: number) => `${w} of ${d} supporting documents carry verification notes (scans/OCR) that must be checked against the originals.`,
  },
};

export default function PerkaraInsights({ shown, data, locale }: { shown: readonly Terlapor[]; data: Perkara; locale: Locale }) {
  const t = T[locale];
  const x = useMemo(() => perkaraInsight(shown, data), [shown, data]);
  const st = Object.fromEntries(x.stages.map((s) => [s.key, s.n])) as Record<Tahap['key'], number>;
  const items: Insight[] = [];
  if (x.conversion.length) items.push({
    id: 'conv', kind: 'fact', text: t.conv,
    detail: <ul className="viz-ins__terms">{x.conversion.map((c) => <li key={c.from}><span>{t.convRow(t.stage[c.from], t.stage[c.to], c.rate)}</span></li>)}</ul>,
  });
  if (x.lag.median !== null) {
    items.push({ id: 'lag', kind: 'fact', text: t.lag(x.lag.n, Math.round(x.lag.median), x.lag.min!, x.lag.max!) });
    items.push({ id: 'lag-why', kind: 'inference', text: t.lagWhy });
  }
  if (x.acts.total) items.push({ id: 'acts', kind: 'fact', text: t.acts(x.acts.y2023, x.acts.y2026, x.acts.total) });
  if (x.backlog.n && x.backlog.topKategori) items.push({ id: 'backlog', kind: 'fact', text: t.backlog(x.backlog.n, x.backlog.share, x.backlog.topKategori.label, x.backlog.topKategori.n) });
  if (x.kategori.top && x.kategori.share !== null) items.push({ id: 'kat', kind: 'fact', text: t.kat(x.kategori.top, x.kategori.topN, x.kategori.share) });
  if (x.pairs.length) items.push({
    id: 'pairs', kind: 'fact', text: t.pairs,
    detail: <ul className="viz-ins__sub">{x.pairs.map((p) => <li key={`${p.a}${p.b}`}>{t.pairRow(p.a, p.b, p.n)}</li>)}</ul>,
  });
  if (shown.length) {
    items.push({ id: 'identity', kind: 'fact', text: t.identity(x.identity.full, x.identity.partial, x.identity.none) });
    if (x.identity.none + x.identity.partial > 0) items.push({ id: 'identity-why', kind: 'inference', text: t.identityWhy });
  }
  if (x.busiestMonth) items.push({ id: 'busiest', kind: 'fact', text: t.busiest(fmtMonthYear(x.busiestMonth.key, locale), x.busiestMonth.n) });
  if (x.counter.against && x.counter.firstOwn) {
    items.push({ id: 'counter', kind: 'fact', text: t.counter(x.counter.against, x.counter.afterFirstOwn, fmtDay(x.counter.firstOwn, locale)) });
    items.push({ id: 'counter-why', kind: 'inference', text: t.counterWhy });
  }
  items.push({ id: 'verify', kind: 'fact', text: t.verify(x.verification.withNotes, x.verification.docs) });
  const headline = shown.length ? t.headline(shown.length, st.somasi, st.aduan, st.laporan, Math.round((st.somasi / shown.length) * 100)) : t.empty;
  return <InsightPanel id="pk-ins-h" title={t.title} headline={headline} items={shown.length ? items : []} locale={locale} empty={t.empty} />;
}

