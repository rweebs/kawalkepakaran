// Findings for the Fomo section: how much was posted about Rahmat Wibowo, by how many accounts, in which waves, and how
// concentrated it was. Recomputed from the filtered posts. "DeletedUser" stands for many removed accounts, so it is
// counted apart and never ranked as one poster. A company badge is what Fomo shows, not the company's involvement.
import { useMemo } from 'react';
import { InsightPanel, WeekdayBars, fmtDay, fmtN, type Insight, type Locale } from './InsightPanel';
import { fomoInsight, type FomoPost, type FomoThread } from '../lib/fomo';

const T = {
  id: {
    title: 'Temuan', empty: 'Belum cukup data untuk temuan pada saringan ini.',
    headline: (p: number, a: number, t: number, w: number, last: number | null) =>
      `${p} postingan tentang Rahmat Wibowo dari ${a} akun di ${t} thread${w > 1 && last !== null ? `, dalam ${w} gelombang; gelombang terakhir memuat ${last}% postingan.` : '.'}`,
    waves: 'Gelombang postingan (jeda lebih dari 60 hari memisahkan gelombang):',
    waveRow: (a: string, b: string, n: number, ac: number, th: number, bd: number, pd: string, pn: number) =>
      `${a} – ${b}: ${n} postingan dari ${ac} akun di ${th} thread; ${bd}% berlencana perusahaan; puncak ${pd} (${pn}).`,
    returning: (n: number) => `${n} akun yang sama memposting di lebih dari satu gelombang, terpisah lebih dari dua tahun.`,
    returningWhy: 'Nama akun yang sama kemungkinan besar orang yang sama, tetapi Fomo tidak menjamin satu nama selalu dipakai satu orang.',
    concentration: (s: number, g: number) => `10 akun teraktif menulis ${s}% postingan (Gini antar-akun ${g}; 0 = merata, 1 = satu akun menulis semuanya).`,
    repeat: (n: number, max: number, a: string) => `${n} akun ikut di lebih dari satu thread; terbanyak ${a} di ${max} thread.`,
    deleted: (p: number, t: number) => `${p} postingan dari akun yang sudah dihapus ("DeletedUser", di ${t} thread) dihitung terpisah: satu nama itu mewakili banyak akun.`,
    life: (m: number, s: number, long: number, lt: number) => `Thread biasanya ramai dalam waktu singkat: median durasi ${m} hari, dan ${s}% postingan bertanggal dalam 3 hari pertama thread. Thread terpanjang (#${lt}) berlangsung ${long} hari.`,
    badge: (s: number, h: number, top: number) => `${s}% postingan dari akun berlencana perusahaan. Sebaran perusahaan tidak terpusat (HHI ${h}; perusahaan terbesar ${top}% dari postingan berlencana).`,
    badgeWhy: 'Lencana adalah yang ditampilkan Fomo di sebelah nama akun; itu bukan bukti bahwa perusahaan terlibat atau mengetahui.',
    busiest: (d: string, n: number) => `Hari tersibuk: ${d}, ${n} postingan dalam sehari.`,
    weekday: (day: string, s: number) => `Hari paling ramai dalam sepekan: ${day} (${s}% postingan bertanggal).`,
    words: 'Kata yang paling sering muncul (jumlah postingan yang memuatnya, kutipan apa adanya):',
    days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'], week: 'Postingan per hari dalam sepekan',
  },
  en: {
    title: 'Insights', empty: 'Not enough data for insights under this filter.',
    headline: (p: number, a: number, t: number, w: number, last: number | null) =>
      `${p} posts about Rahmat Wibowo from ${a} accounts in ${t} threads${w > 1 && last !== null ? `, in ${w} waves; the latest wave holds ${last}% of the posts.` : '.'}`,
    waves: 'Waves of posts (a gap of more than 60 days separates waves):',
    waveRow: (a: string, b: string, n: number, ac: number, th: number, bd: number, pd: string, pn: number) =>
      `${a} – ${b}: ${n} posts from ${ac} accounts in ${th} threads; ${bd}% company-badged; peak ${pd} (${pn}).`,
    returning: (n: number) => `${n} of the same accounts posted in more than one wave, more than two years apart.`,
    returningWhy: 'The same account name very likely means the same person, but Fomo does not guarantee that one name is always used by one person.',
    concentration: (s: number, g: number) => `The 10 most active accounts wrote ${s}% of the posts (Gini across accounts ${g}; 0 = even, 1 = one account wrote everything).`,
    repeat: (n: number, max: number, a: string) => `${n} accounts joined more than one thread; the most, ${a}, joined ${max}.`,
    deleted: (p: number, t: number) => `${p} posts from deleted accounts ("DeletedUser", in ${t} threads) are counted apart: that one name stands for many accounts.`,
    life: (m: number, s: number, long: number, lt: number) => `Threads flare up fast: median duration ${m} days, and ${s}% of dated posts fall within a thread's first 3 days. The longest thread (#${lt}) ran ${long} days.`,
    badge: (s: number, h: number, top: number) => `${s}% of posts come from company-badged accounts. The companies are not concentrated (HHI ${h}; the largest holds ${top}% of badged posts).`,
    badgeWhy: 'A badge is what Fomo shows next to an account name; it is not evidence that the company is involved or aware.',
    busiest: (d: string, n: number) => `Busiest day: ${d}, ${n} posts in one day.`,
    weekday: (day: string, s: number) => `Busiest weekday: ${day} (${s}% of dated posts).`,
    words: 'Most frequent words (number of posts containing them, quoted as written):',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], week: 'Posts per weekday',
  },
};

export default function FomoInsights({ posts, threads, locale }: { posts: readonly FomoPost[]; threads: readonly FomoThread[]; locale: Locale }) {
  const t = T[locale];
  const x = useMemo(() => fomoInsight(posts, threads), [posts, threads]);
  const d = (s: string) => fmtDay(s, locale);
  const items: Insight[] = [];
  if (x.waves.length) items.push({
    id: 'waves', kind: 'fact', text: t.waves,
    detail: <ul className="viz-ins__sub">{x.waves.map((w) => <li key={w.from}>{t.waveRow(d(w.from), d(w.to), w.count, w.accounts, w.threads, w.badged, d(w.peak.date), w.peak.count)}</li>)}</ul>,
  });
  if (x.returning > 0) {
    items.push({ id: 'returning', kind: 'fact', text: t.returning(x.returning) });
    items.push({ id: 'returning-why', kind: 'inference', text: t.returningWhy });
  }
  if (x.top10Share !== null && x.giniAccounts !== null && x.accounts > 10) items.push({ id: 'conc', kind: 'fact', text: t.concentration(x.top10Share, x.giniAccounts) });
  if (x.repeat.accounts && x.repeat.maxAccount) items.push({ id: 'repeat', kind: 'fact', text: t.repeat(x.repeat.accounts, x.repeat.maxThreads, x.repeat.maxAccount) });
  if (x.deleted.posts) items.push({ id: 'deleted', kind: 'fact', text: t.deleted(x.deleted.posts, x.deleted.threads) });
  if (x.threadLife.medianDays !== null && x.threadLife.firstThreeDaysShare !== null && x.threadLife.longest)
    items.push({ id: 'life', kind: 'fact', text: t.life(x.threadLife.medianDays, x.threadLife.firstThreeDaysShare, x.threadLife.longest.days, x.threadLife.longest.thread) });
  if (x.busiestDay) items.push({ id: 'busiest', kind: 'fact', text: t.busiest(d(x.busiestDay.date), x.busiestDay.count) });
  const wdTotal = x.weekday.reduce((a, b) => a + b, 0);
  if (wdTotal >= 14) {
    const top = x.weekday.indexOf(Math.max(...x.weekday));
    items.push({ id: 'weekday', kind: 'fact', text: t.weekday(t.days[top], Math.round((x.weekday[top] / wdTotal) * 100)), detail: <WeekdayBars counts={x.weekday} labels={t.days} label={t.week} /> });
  }
  if (x.hhiCompanies !== null && x.topCompanyShare !== null) {
    items.push({ id: 'badge', kind: 'fact', text: t.badge(x.badgedShare, x.hhiCompanies, x.topCompanyShare) });
    items.push({ id: 'badge-why', kind: 'inference', text: t.badgeWhy });
  }
  if (x.words.length) items.push({
    id: 'words', kind: 'fact', text: t.words,
    detail: <ul className="viz-ins__terms">{x.words.map((w) => <li key={w.word}><span>{w.word}</span> {fmtN(w.posts, locale)}</li>)}</ul>,
  });
  const last = x.waves.length ? Math.round((x.waves.at(-1)!.count / Math.max(1, posts.filter((p) => p.iso).length)) * 100) : null;
  return <InsightPanel id="fm-ins-h" title={t.title} headline={posts.length ? t.headline(x.posts, x.accounts, x.threads, x.waves.length, last) : t.empty} items={posts.length ? items : []} locale={locale} empty={t.empty} />;
}
