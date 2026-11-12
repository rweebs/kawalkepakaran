// Evidence views for the rahmatwibowo.net section of /pantau, all from recorded data only:
// - a "minimum count" coverage note (the sitemap is the operator's own list; a crawl result is shown once one exists);
// - removals: URLs that left the sitemap, by the last snapshot that listed them;
// - archive coverage: what Save Page Now runs actually recorded;
// - images listed per section;
// - slug date vs first-seen date (a real publication lag only for URLs first seen after the first snapshot).
// Build-time only. Empty states say what is missing and how it gets filled; nothing is assumed.
import { fmtDay, fmtN, type Locale } from './InsightPanel';
import type { ArchiveCoverage, SlugGap } from '../lib/pantau-page';

export interface CrawlCoverage { date: string; crawled: number; inSitemap: number; notInSitemap: number }

const T = {
  id: {
    title: 'Bukti dan cakupan',
    min: (n: number) => `Hitungan minimum: ${n} URL yang dicantumkan pengelola di sitemap-nya sendiri. Halaman yang sengaja tidak dicantumkan tidak terlihat di sini.`,
    crawl: (c: CrawlCoverage) => `Perayapan ${c.date}: ${c.crawled} halaman ditemukan, ${c.notInSitemap} di antaranya tidak tercantum di sitemap.`,
    crawlNone: 'Belum ada perayapan pembanding. Bila ada, hasilnya disimpan di src/data/crawl-coverage.json dan ditampilkan di sini.',
    removedH: 'URL yang hilang dari sitemap', removedNone: (n: number) => `Belum ada URL yang hilang: baru ${n} snapshot tercatat. URL yang dihapus pengelola akan muncul di sini, dikelompokkan menurut snapshot terakhir yang masih mencantumkannya.`,
    removedRow: (d: string, n: number) => `Terakhir tercantum ${d}: ${n} URL`,
    archH: 'Cakupan arsip pihak ketiga (Wayback Machine)',
    archNone: 'Belum ada pengiriman ke Wayback Machine yang tercatat. Jalankan WAYBACK=1 npm run snapshot; hasil tiap pengiriman disimpan di snapshot dan dihitung di sini.',
    arch: (a: ArchiveCoverage) => `${a.submitted} URL berhasil dikirim, ${a.failed} gagal, dari ${a.listed} URL tercantum (${a.runs} kali dijalankan, terakhir ${a.lastRun}).`,
    imgH: 'Gambar yang tercantum di sitemap, per bagian', img: 'gambar', urls: 'URL',
    imgNote: 'Hanya jumlah; isi gambar dan hash-nya belum disimpan, jadi gambar yang diganti belum bisa dideteksi.',
    gapH: 'Tanggal di slug dibanding tanggal pertama tercatat',
    gapNote: (b: number, s: string) => `${b} URL bertanggal sudah tercantum pada snapshot pertama (${s}); untuk mereka jeda hanya batas atas dan tidak dihitung.`,
    gapNone: 'Belum ada URL bertanggal yang muncul sesudah snapshot pertama, jadi jeda publikasi yang sebenarnya belum bisa diukur.',
    gapMed: (m: number, n: number) => `${n} URL muncul sesudah snapshot pertama; median jeda dari tanggal di slug ke pertama tercatat: ${m} hari.`,
    days: 'hari',
  },
  en: {
    title: 'Evidence and coverage',
    min: (n: number) => `Minimum count: ${n} URLs the operator lists in their own sitemap. Pages deliberately left out of it are not visible here.`,
    crawl: (c: CrawlCoverage) => `Crawl of ${c.date}: ${c.crawled} pages found, ${c.notInSitemap} of them not in the sitemap.`,
    crawlNone: 'No comparison crawl yet. When one exists, its result is kept in src/data/crawl-coverage.json and shown here.',
    removedH: 'URLs that left the sitemap', removedNone: (n: number) => `No URL has left the sitemap yet: only ${n} snapshot(s) recorded. URLs the operator deletes will appear here, grouped by the last snapshot that still listed them.`,
    removedRow: (d: string, n: number) => `Last listed ${d}: ${n} URLs`,
    archH: 'Third-party archive coverage (Wayback Machine)',
    archNone: 'No Wayback Machine submission recorded yet. Run WAYBACK=1 npm run snapshot; each submission result is stored with the snapshot and counted here.',
    arch: (a: ArchiveCoverage) => `${a.submitted} URLs submitted successfully, ${a.failed} failed, of ${a.listed} listed URLs (${a.runs} runs, last ${a.lastRun}).`,
    imgH: 'Images listed in the sitemap, by section', img: 'images', urls: 'URLs',
    imgNote: 'Counts only; image content and hashes are not stored yet, so a swapped image cannot be detected yet.',
    gapH: 'Slug date against first-recorded date',
    gapNote: (b: number, s: string) => `${b} dated URLs were already listed at the first snapshot (${s}); for them the gap is only an upper bound and is not counted.`,
    gapNone: 'No dated URL has appeared after the first snapshot yet, so the real publication lag cannot be measured yet.',
    gapMed: (m: number, n: number) => `${n} URLs appeared after the first snapshot; median gap from slug date to first recorded: ${m} days.`,
    days: 'days',
  },
};

export default function PantauEvidence({ listed, snapshots, firstSnapshot, removed, archive, images, gap, crawl, locale = 'id' }: {
  listed: number; snapshots: number; firstSnapshot: string; removed: { lastSeen: string; paths: string[] }[]; archive: ArchiveCoverage;
  images: { section: string; images: number; urls: number }[]; gap: SlugGap; crawl: CrawlCoverage | null; locale?: Locale;
}) {
  const t = T[locale];
  const maxImg = Math.max(1, ...images.map((i) => i.images));
  const maxGap = Math.max(1, ...gap.buckets.map((b) => b.n));
  return (
    <section className="pe" aria-labelledby="pe-h">
      <h3 id="pe-h">{t.title}</h3>
      <p className="pe-min"><strong>{t.min(listed)}</strong> {crawl ? t.crawl(crawl) : <span className="muted">{t.crawlNone}</span>}</p>
      <div className="pe-grid">
        <div className="pe-card">
          <h4>{t.removedH}</h4>
          {removed.length === 0 ? <p className="viz-empty">{t.removedNone(snapshots)}</p> : (
            <ol className="pe-removed">{removed.map((r) => (
              <li key={r.lastSeen}><details><summary>{t.removedRow(fmtDay(r.lastSeen, locale), r.paths.length)}</summary>
                <ul className="pk-mono">{r.paths.map((p) => <li key={p}>{p}</li>)}</ul></details></li>
            ))}</ol>
          )}
        </div>
        <div className="pe-card">
          <h4>{t.archH}</h4>
          {archive.runs === 0 ? <p className="viz-empty">{t.archNone}</p> : (
            <>
              <svg className="pe-bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={t.arch(archive)}>
                <rect className="pg-bars__bg" x={0} y={0} width={100} height={8} rx={2} />
                <rect className="pe-ok" x={0} y={0} width={(archive.submitted / Math.max(1, archive.listed)) * 100} height={8} rx={2} />
              </svg>
              <p>{t.arch(archive)}</p>
            </>
          )}
        </div>
        <div className="pe-card">
          <h4>{t.imgH}</h4>
          <ol className="pg-bars">{images.map((i) => (
            <li key={i.section}>
              <span className="pg-bars__l pk-mono">{i.section}/</span>
              <svg className="pg-bars__track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect className="pg-bars__bg" x={0} y={0} width={100} height={10} rx={2} /><rect className="pg-bars__fill" x={0} y={0} width={(i.images / maxImg) * 100} height={10} rx={2} /></svg>
              <span className="pg-bars__v">{fmtN(i.images, locale)} {t.img} · {fmtN(i.urls, locale)} {t.urls}</span>
            </li>
          ))}</ol>
          <p className="muted">{t.imgNote}</p>
        </div>
        <div className="pe-card">
          <h4>{t.gapH}</h4>
          {gap.afterBaseline === 0 ? <p className="viz-empty">{t.gapNone}</p> : (
            <>
              <p>{t.gapMed(gap.medianAfter ?? 0, gap.afterBaseline)}</p>
              <ol className="pg-bars">{gap.buckets.map((b) => (
                <li key={b.label}><span className="pg-bars__l">{b.label} {t.days}</span>
                  <svg className="pg-bars__track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect className="pg-bars__bg" x={0} y={0} width={100} height={10} rx={2} /><rect className="pg-bars__fill" x={0} y={0} width={(b.n / maxGap) * 100} height={10} rx={2} /></svg>
                  <span className="pg-bars__v">{b.n}</span></li>
              ))}</ol>
            </>
          )}
          <p className="muted">{t.gapNote(gap.baseline, fmtDay(firstSnapshot, locale))}</p>
        </div>
      </div>
    </section>
  );
}
