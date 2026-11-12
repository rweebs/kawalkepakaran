// The top of /pantau: one answer about Rahmat Wibowo as the target of three sources (hero strip), how long it has gone
// on, and the page's chapters in the order the harm happened. Rendered at build time; no client code.
import { fmtDay, fmtN, type Locale } from './InsightPanel';
import { yearsMonths, type Hero } from '../lib/pantau-page';

const T = {
  id: {
    label: 'Ringkasan',
    answer: 'Rahmat Wibowo disasar dari tiga arah. Ia menjawab lewat jalur hukum.',
    since: (y: number, m: number, d: string) => `${y} tahun ${m} bulan sejak konten pertama yang menyasarnya (${d}).`,
    tiles: {
      site: { v: 'URL', k: 'di rahmatwibowo.net, situs yang memakai namanya', href: '#situs' },
      fomo: { v: 'postingan', k: (t: number) => `tentang dirinya di Fomo, dalam ${t} thread`, href: '#fomo' },
      terlapor: { v: 'terlapor', k: 'yang ia laporkan dalam berkas gelar perkara (dugaan)', href: '#gelar-perkara' },
      reports: { v: 'laporan polisi', k: (a: number) => `oleh Rahmat; ${a} diajukan pihak lain terhadapnya`, href: '#gelar-perkara' },
    },
    unit: 'Satuan dihitung terpisah per sumber: URL (situs), postingan (Fomo), terlapor dan laporan (berkas). Angka-angka ini tidak dijumlahkan.',
    chaptersLabel: 'Bab, menurut urutan kejadian',
    chapters: [
      { href: '#fomo', when: 'Sep 2023 – 2026', title: 'Fomo: gelombang postingan tentang Rahmat' },
      { href: '#situs', when: '2026', title: 'Situs rahmatwibowo.net: dosir yang menyebut Rahmat pelaku' },
      { href: '#gelar-perkara', when: 'Apr 2026 –', title: 'Jawaban hukum: somasi, aduan, laporan polisi' },
      { href: '#relasi', when: 'semua', title: 'Peta hubungan dan temuan lintas sumber' },
    ],
    storyH: 'Cerita singkat dalam lima langkah',
    story: (h: Hero, y: number, m: number, d: (s: string) => string) => [
      `Mulai ${h.firstFomo ? d(h.firstFomo) : '–'}, akun-akun anonim di Fomo menulis tentang Rahmat: ${fmtN(h.fomoPosts, 'id')} postingan dalam ${h.fomoThreads} thread.`,
      `Pada 2026 muncul situs rahmatwibowo.net yang memakai namanya dan kini memuat ${fmtN(h.siteUrls, 'id')} URL; situs itu menyebutnya pelaku pelecehan.`,
      `Rahmat menjawab lewat jalur hukum: somasi, aduan, dan ${h.reportsOwn} laporan polisi terhadap ${h.terlapor} pihak yang ia duga mencemarkan namanya.`,
      `${h.reportsAgainst} laporan polisi diajukan pihak lain terhadap Rahmat; halaman ini tetap menampilkannya.`,
      `Semuanya berlangsung ${y} tahun ${m} bulan. Peta hubungan di bawah menunjukkan bagaimana ketiga sumber saling terkait.`,
    ],
    presume: 'Fakta di atas adalah apa yang tercatat di tiga sumber; siapa pun yang disebut tetap berstatus dugaan.',
  },
  en: {
    label: 'Summary',
    answer: 'Rahmat Wibowo is targeted from three directions. He has answered through legal channels.',
    since: (y: number, m: number, d: string) => `${y} years ${m} months since the first item aimed at him (${d}).`,
    tiles: {
      site: { v: 'URLs', k: 'on rahmatwibowo.net, a site using his name', href: '#situs' },
      fomo: { v: 'posts', k: (t: number) => `about him on Fomo, in ${t} threads`, href: '#fomo' },
      terlapor: { v: 'terlapor', k: 'he reported in his case-review file (alleged)', href: '#gelar-perkara' },
      reports: { v: 'police reports', k: (a: number) => `by Rahmat; ${a} filed by others against him`, href: '#gelar-perkara' },
    },
    unit: 'Each source is counted in its own unit: URLs (site), posts (Fomo), terlapor and reports (case file). These numbers are not added together.',
    chaptersLabel: 'Chapters, in the order things happened',
    chapters: [
      { href: '#fomo', when: 'Sep 2023 – 2026', title: 'Fomo: waves of posts about Rahmat' },
      { href: '#situs', when: '2026', title: 'rahmatwibowo.net: a dossier site calling Rahmat a harasser' },
      { href: '#gelar-perkara', when: 'Apr 2026 –', title: 'Legal response: somasi, complaints, police reports' },
      { href: '#relasi', when: 'all', title: 'Relationship map and cross-source findings' },
    ],
    storyH: 'The short story in five steps',
    story: (h: Hero, y: number, m: number, d: (s: string) => string) => [
      `From ${h.firstFomo ? d(h.firstFomo) : '–'}, anonymous Fomo accounts wrote about Rahmat: ${fmtN(h.fomoPosts, 'en')} posts in ${h.fomoThreads} threads.`,
      `In 2026 the site rahmatwibowo.net appeared, using his name; it now lists ${fmtN(h.siteUrls, 'en')} URLs and calls him a harasser.`,
      `Rahmat answered through legal channels: somasi, complaints and ${h.reportsOwn} police reports against ${h.terlapor} parties he believes defamed him.`,
      `${h.reportsAgainst} police reports were filed by others against Rahmat; this page shows them too.`,
      `All of it spans ${y} years ${m} months. The relationship map below shows how the three sources connect.`,
    ],
    presume: 'The facts above are what the three sources record; anyone named remains an alleged party.',
  },
};

export default function PantauHero({ hero, locale = 'id' }: { hero: Hero; locale?: Locale }) {
  const t = T[locale];
  const d = (s: string) => fmtDay(s, locale);
  const ym = yearsMonths(hero.daysTargeted ?? 0);
  const tile = (key: string, value: number, unit: string, caption: string, href: string) => (
    <a className="ph-tile" href={href} key={key}>
      <span className="ph-tile__v">{fmtN(value, locale)}</span>
      <span className="ph-tile__u">{unit}</span>
      <span className="ph-tile__k">{caption}</span>
    </a>
  );
  return (
    <section className="ph" aria-labelledby="ph-answer">
      <p className="ph-label">{t.label}</p>
      <p id="ph-answer" className="ph-answer">{t.answer}</p>
      {hero.firstHarm && <p className="ph-since"><strong>{t.since(ym.years, ym.months, d(hero.firstHarm))}</strong></p>}
      <div className="ph-tiles">
        {tile('site', hero.siteUrls, t.tiles.site.v, t.tiles.site.k, t.tiles.site.href)}
        {tile('fomo', hero.fomoPosts, t.tiles.fomo.v, t.tiles.fomo.k(hero.fomoThreads), t.tiles.fomo.href)}
        {tile('terlapor', hero.terlapor, t.tiles.terlapor.v, t.tiles.terlapor.k, t.tiles.terlapor.href)}
        {tile('reports', hero.reportsOwn, t.tiles.reports.v, t.tiles.reports.k(hero.reportsAgainst), t.tiles.reports.href)}
      </div>
      <p className="muted ph-unit">{t.unit}</p>
      <nav className="ph-chapters" aria-label={t.chaptersLabel}>
        <p className="ph-label">{t.chaptersLabel}</p>
        <ol>
          {t.chapters.map((c, i) => (
            <li key={c.href}><a href={c.href}><span className="ph-ch__n">{i + 1}</span><span className="ph-ch__when">{c.when}</span><span className="ph-ch__t">{c.title}</span></a></li>
          ))}
        </ol>
      </nav>
      <details className="pantau__how ph-story">
        <summary>{t.storyH}</summary>
        <ol>{t.story(hero, ym.years, ym.months, d).map((s, i) => <li key={i}>{s}</li>)}</ol>
        <p className="muted">{t.presume}</p>
      </details>
    </section>
  );
}
