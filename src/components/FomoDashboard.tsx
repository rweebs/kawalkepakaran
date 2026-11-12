// The Fomo section of /pantau: posts about the Pelapor on the Fomo platform (src/data/fomo.json), 2023-2026.
// Server-rendered, hydrated for filtering. Post text is verbatim evidence; a company badge is what Fomo displays next to
// an account, not evidence that the company is involved, and accounts stay pseudonymous. Every post is about Rahmat
// Wibowo (a fact); whether a post is defamatory is his allegation. "DeletedUser" stands for many removed accounts and is
// never ranked as one account.
import { useMemo, useState } from 'react';
import { Card, HBars, Legend, fmtMonth, fmtN, type Locale } from './viz/charts';
import {
  BADGE, DEFAULT_FOMO_FILTER, SEVERITY, SEVERITY_RULES, accountThreadMatrix, badgeOf, companyRank, dossierCheck, filterPosts,
  fomoInsight, isGenericHandle, isPlaceholder, masksIn, mentionsOf, monthlyBy, pareto, repostFlags, severityOf, splitByGaps,
  threadAccounts, topWords, type Badge, type DossierRow, type Fomo, type FomoFilter, type Severity,
} from '../lib/fomo';
import FomoInsights from './FomoInsights';
import '../styles/pantau-fomo.css';
import { useDebounced } from './viz/url-state';
import { CompanyRank, InlineBar, LengthSpark, ParetoCurve, RangeBar, SegmentedColumns, ThreadMatrix } from './FomoCharts';

const T = {
  id: {
    tiles: {
      posts: 'Postingan tentang Rahmat', postsSub: (t: number) => `di ${t} thread`,
      akun: 'Akun Fomo', akunSub: (b: number, a: number, d: number) => `${b} berlencana perusahaan, ${a} tanpa lencana${d ? `; ditambah ${d} postingan dari akun terhapus` : ''}`,
      perusahaan: 'Perusahaan pada lencana', perusahaanSub: 'nama perusahaan yang ditampilkan Fomo, bukan pihak terlapor',
      periode: 'Periode', periodeSub: (a: number, b: number) => `${a} postingan 2023, ${b} postingan 2026`,
    },
    chip: 'Bukti Pelapor · dugaan',
    badge: { badge: 'Akun berlencana', anon: 'Tanpa lencana' } as Record<Badge, string>,
    cMonth: 'Postingan tentang Rahmat per bulan', cMonthNote: 'Bulan-bulan kosong yang panjang dipotong (tanda ⫽) agar kedua gelombang terbaca; skala tinggi sama untuk semua panel. Postingan tanpa tanggal ada di batang abu-abu terakhir. Tekan atau pilih (panah lalu Enter) sebuah bulan untuk menyaring.',
    cols: { gap: (n: number) => `${n} bln kosong`, undated: 'tanpa tgl', readout: (title: string, total: number, parts: string) => `${title}: ${total} postingan${parts ? ` (${parts})` : ''}.`, hint: 'Grafik kolom per bulan. Gunakan panah kiri/kanan, Enter untuk menyaring.' },
    cComp: 'Lencana yang ditampilkan Fomo, menurut jumlah akun', cCompNote: 'Lencana adalah nama perusahaan yang ditampilkan Fomo di sebelah nama akun, bukan bukti perusahaan terlibat. Batang = jumlah akun berlencana itu: penuh = terbaca dari teks halaman dan tangkapan layar; garis saja = hanya dari tangkapan layar (huruf I/l, O/0 bisa keliru); arsir = ditandai ragu oleh sumber. Tekan untuk menyaring.',
    sortRule: 'Urutan: jumlah akun, lalu jumlah postingan, lalu nama. Baris abu-abu: hanya satu akun (n=1), terlalu kecil untuk ditafsirkan.',
    conf: { teks: 'teks + tangkapan layar', gambar: 'hanya tangkapan layar', ragu: 'ditandai ragu' },
    akunN: (n: number) => `${n} akun`, postsN: (n: number) => `${n} postingan`, n1: 'n=1',
    showAll: (n: number) => `Tampilkan semua ${n} perusahaan`, showTop: 'Tampilkan 15 teratas',
    panelH: (c: string) => `Lencana ${c}`, panelAccounts: 'Akun', panelThreads: 'Thread', panelSpan: 'Rentang tanggal', panelSamples: 'Contoh kutipan (apa adanya)', panelClose: 'Tutup',
    cPareto: 'Berapa banyak yang ditulis oleh sedikit akun', cParetoNote: (top: number, half: number, all: number, one: number) => `10 akun teraktif menulis ${top}% postingan; ${half} dari ${all} akun sudah menulis separuhnya, sementara ${one} akun hanya memposting sekali. Akun terhapus tidak dihitung.`,
    paretoX: '% akun (dari yang paling aktif)', paretoY: '% postingan', paretoEven: 'Garis rata: setiap akun menulis sama banyak',
    cMatrix: 'Akun yang muncul di lebih dari satu thread', cMatrixNote: (n: number) => `${n} akun (tanpa akun terhapus). Warna lebih terang = lebih banyak postingan di thread itu. Nama bergaris titik adalah nama umum yang mungkin dipakai lebih dari satu orang (dugaan). Tekan nama untuk menampilkan postingannya.`,
    matrixRule: 'Urutan: jumlah thread, lalu jumlah postingan, lalu nama.', generic: 'nama umum; mungkin dipakai lebih dari satu orang (dugaan)',
    cell: (a: string, t: number, n: number) => `${a}, thread ${t}: ${n} postingan`, threadWord: 'thread',
    cTerms: 'Kata yang paling sering dipakai, per gelombang', cTermsNote: 'Jumlah postingan yang memuat kata itu (kata fungsi dan nama Pelapor dibuang). Kutipan apa adanya; bukan penilaian.',
    wave: (a: string, b: string) => `${a} – ${b}`, termsRule: 'Urutan: jumlah postingan, lalu abjad.',
    cSev: 'Tangga keparahan (dugaan, berdasarkan kata kunci)', cSevNote: (cls: number, all: number) => `${cls} dari ${all} postingan cocok dengan aturan kata kunci; yang lain tidak dihitung di grafik. Ini klasifikasi otomatis, bukan penilaian hukum, dan bisa keliru (misalnya kata yang sama dipakai dalam arti lain).`,
    sev: { lainnya: 'Lainnya', hinaan: 'Hinaan', tuduhan: 'Tuduhan', ancaman: 'Ancaman', doxxing: 'Data pribadi (doxxing)' } as Record<Severity, string>,
    rulesH: 'Aturan kata kunci (tingkat tertinggi yang cocok dipakai)',
    repost: (n: number, w: string) => `${w}: ${n}% postingan tampak mengulang atau meneruskan postingan lain.`,
    repostWhy: 'Dugaan: ditandai bila memuat penanda "Forwarded/repost" atau minimal 60% rangkaian tiga katanya sudah ada di postingan sebelumnya. Sebagian besar postingan adalah tulisan sendiri, bukan sekadar repost.',
    cAudit: 'Audit penyamaran dan penyebutan', auditNote: (m: number, k: number, all: number) => `${m} dari ${all} postingan menyebut akun lain (@nama, biasanya balasan antar-pengguna Fomo); ${k} penyamaran ([alamat], [nama di lampiran]) diterapkan saat data disiapkan.`,
    cCheck: 'Konsistensi dengan berkas gelar perkara', checkEmpty: 'Berkas gelar perkara yang dipublikasikan tidak memuat peristiwa tentang Fomo, jadi tanggal tidak bisa dibandingkan. Perkara Fomo diadukan terpisah.',
    checkCols: { peristiwa: 'Peristiwa di berkas', dossier: 'Tanggal berkas', fomo: 'Tanggal Fomo terdekat', days: 'Selisih (hari)', thread: 'Thread' }, checkFlag: 'selisih > 7 hari',
    threadsH: 'Thread', tcols: { no: '#', judul: 'Judul (baris pertama)', pembuka: 'Pembuka', posts: 'Postingan', akun: 'Akun', periode: 'Periode', link: 'Tautan' },
    akunNote: 'Kolom Akun tidak menghitung akun terhapus.', open: 'Buka di Fomo', filterThread: 'Saring',
    postsH: 'Postingan tentang Rahmat (verbatim)', warn: 'Peringatan: kutipan di bawah disalin apa adanya dan memuat hinaan, tuduhan, dan bahasa kasar terhadap Pelapor.',
    company: 'Perusahaan', anyCompany: 'Semua perusahaan', thread: 'Thread', anyThread: 'Semua thread', search: 'Cari kata atau akun',
    badgeSel: 'Lencana', badgeOpt: { all: 'Semua', badge: 'Berlencana', anon: 'Tanpa lencana' }, reset: 'Atur ulang',
    month: (m: string) => `Bulan: ${m}`, clear: 'hapus', shown: (a: number, b: number) => `Menampilkan ${a} dari ${b} postingan`,
    more: (n: number) => `Tampilkan ${n} lagi`, none: 'Tidak ada yang cocok.', noDate: 'tanpa tanggal', items: 'postingan', legend: 'Keterangan', nder: 'tag NDER',
    readMore: 'Baca selengkapnya', readLess: 'Ringkas', len: (n: number) => `${n} karakter`, flagRepost: 'mirip repost (dugaan)', flagMention: (n: number) => `menyebut ${n} akun lain`,
    flagMask: (n: number) => `${n} disamarkan`, confShort: { teks: '', gambar: 'lencana dari tangkapan layar', ragu: 'lencana ragu' }, deleted: 'akun terhapus (banyak akun)',
  },
  en: {
    tiles: {
      posts: 'Posts about Rahmat', postsSub: (t: number) => `in ${t} threads`,
      akun: 'Fomo accounts', akunSub: (b: number, a: number, d: number) => `${b} with a company badge, ${a} without${d ? `; plus ${d} posts from deleted accounts` : ''}`,
      perusahaan: 'Companies on badges', perusahaanSub: 'company names Fomo displays, not parties reported',
      periode: 'Period', periodeSub: (a: number, b: number) => `${a} posts in 2023, ${b} in 2026`,
    },
    chip: "Pelapor's evidence · alleged",
    badge: { badge: 'Badged account', anon: 'No badge' } as Record<Badge, string>,
    cMonth: 'Posts about Rahmat per month', cMonthNote: 'Long runs of empty months are cut out (⫽ marker) so both waves are readable; all panels share one height scale. Undated posts are the last grey bar. Press, or pick with the arrow keys and Enter, a month to filter.',
    cols: { gap: (n: number) => `${n} empty mo`, undated: 'undated', readout: (title: string, total: number, parts: string) => `${title}: ${total} posts${parts ? ` (${parts})` : ''}.`, hint: 'Monthly column chart. Use the left/right arrows, Enter to filter.' },
    cComp: 'Badges shown by Fomo, by number of accounts', cCompNote: 'A badge is the company name Fomo displays next to an account name, not evidence that the company is involved. Bar = accounts carrying that badge: solid = read from page text and screenshot; outline only = screenshot only (I/l, O/0 can be misread); hatched = flagged uncertain by the source. Press to filter.',
    sortRule: 'Order: number of accounts, then posts, then name. Grey rows: a single account (n=1), too small to read into.',
    conf: { teks: 'text + screenshot', gambar: 'screenshot only', ragu: 'flagged uncertain' },
    akunN: (n: number) => `${n} accounts`, postsN: (n: number) => `${n} posts`, n1: 'n=1',
    showAll: (n: number) => `Show all ${n} companies`, showTop: 'Show the top 15',
    panelH: (c: string) => `Badge ${c}`, panelAccounts: 'Accounts', panelThreads: 'Threads', panelSpan: 'Date range', panelSamples: 'Sample quotes (as written)', panelClose: 'Close',
    cPareto: 'How much was written by few accounts', cParetoNote: (top: number, half: number, all: number, one: number) => `The 10 most active accounts wrote ${top}% of the posts; ${half} of ${all} accounts wrote half of them, while ${one} accounts posted only once. Deleted accounts are left out.`,
    paretoX: '% of accounts (most active first)', paretoY: '% of posts', paretoEven: 'Even line: every account writes the same amount',
    cMatrix: 'Accounts that appear in more than one thread', cMatrixNote: (n: number) => `${n} accounts (deleted accounts left out). Lighter = more posts in that thread. A dotted name is a generic name that may be used by more than one person (inference). Press a name to show its posts.`,
    matrixRule: 'Order: number of threads, then posts, then name.', generic: 'generic name; may be used by more than one person (inference)',
    cell: (a: string, t: number, n: number) => `${a}, thread ${t}: ${n} posts`, threadWord: 'threads',
    cTerms: 'Most used words, per wave', cTermsNote: 'Number of posts containing the word (function words and the Pelapor’s name removed). Quoted as written; not a judgement.',
    wave: (a: string, b: string) => `${a} – ${b}`, termsRule: 'Order: number of posts, then alphabetical.',
    cSev: 'Severity ladder (inference, from keywords)', cSevNote: (cls: number, all: number) => `${cls} of ${all} posts match a keyword rule; the rest are not counted in the chart. This is automatic classification, not a legal assessment, and can misfire (the same word can mean something else).`,
    sev: { lainnya: 'Other', hinaan: 'Insult', tuduhan: 'Accusation', ancaman: 'Threat', doxxing: 'Personal data (doxxing)' } as Record<Severity, string>,
    rulesH: 'Keyword rules (the highest matching level is used)',
    repost: (n: number, w: string) => `${w}: ${n}% of posts appear to repeat or forward another post.`,
    repostWhy: 'Inference: flagged when a post carries a "Forwarded/repost" marker or at least 60% of its three-word runs already appear in an earlier post. Most posts are original writing, not mere reposts.',
    cAudit: 'Masking and mention audit', auditNote: (m: number, k: number, all: number) => `${m} of ${all} posts mention another account (@name, usually replies between Fomo users); ${k} masks ([alamat], [nama di lampiran]) were applied when the data was prepared.`,
    cCheck: 'Consistency with the case-review file', checkEmpty: 'The published case-review file has no events about Fomo, so dates cannot be compared. The Fomo matter was reported separately.',
    checkCols: { peristiwa: 'Event in the file', dossier: 'File date', fomo: 'Nearest Fomo date', days: 'Gap (days)', thread: 'Thread' }, checkFlag: 'gap > 7 days',
    threadsH: 'Threads', tcols: { no: '#', judul: 'Title (first line)', pembuka: 'Opened by', posts: 'Posts', akun: 'Accounts', periode: 'Period', link: 'Link' },
    akunNote: 'The Accounts column does not count deleted accounts.', open: 'Open on Fomo', filterThread: 'Filter',
    postsH: 'Posts about Rahmat (verbatim, in Indonesian)', warn: 'Warning: the quotes below are copied as written and contain insults, accusations and abusive language about the Pelapor.',
    company: 'Company', anyCompany: 'All companies', thread: 'Thread', anyThread: 'All threads', search: 'Search words or account',
    badgeSel: 'Badge', badgeOpt: { all: 'All', badge: 'Badged', anon: 'No badge' }, reset: 'Reset',
    month: (m: string) => `Month: ${m}`, clear: 'clear', shown: (a: number, b: number) => `Showing ${a} of ${b} posts`,
    more: (n: number) => `Show ${n} more`, none: 'Nothing matches.', noDate: 'undated', items: 'posts', legend: 'Legend', nder: 'NDER tag',
    readMore: 'Read more', readLess: 'Show less', len: (n: number) => `${n} characters`, flagRepost: 'looks like a repost (inference)', flagMention: (n: number) => `mentions ${n} other accounts`,
    flagMask: (n: number) => `${n} masked`, confShort: { teks: '', gambar: 'badge from screenshot', ragu: 'badge uncertain' }, deleted: 'deleted accounts (many accounts)',
  },
};

const FILL: Record<Badge, string> = { badge: 'fm-fill--badge', anon: 'fm-fill--anon' };
const SEV_SHOWN = SEVERITY.filter((s) => s !== 'lainnya') as Exclude<Severity, 'lainnya'>[];
const PAGE = 30;
const TOP = 15;
const LONG = 400;

const fmtDay = (iso: string | null, locale: Locale) => (iso && iso.length === 10
  ? new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
  : null);

export interface FomoDashboardProps { data: Fomo; locale?: Locale; dossier?: DossierRow[] }

export default function FomoDashboard({ data, locale = 'id', dossier = [] }: FomoDashboardProps) {
  const t = T[locale];
  const [f, setF] = useState<FomoFilter>(DEFAULT_FOMO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [allCompanies, setAllCompanies] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const set = (patch: Partial<FomoFilter>) => { setF((p) => ({ ...p, ...patch })); setLimit(PAGE); };

  // The search box updates at once; the filtering it drives waits 150ms after the last keystroke.
  const q = useDebounced(f.q, 150);
  const fq = useMemo(() => ({ ...f, q }), [f, q]);
  // Each chart follows every filter except the one it sets itself, so choosing a month or company never empties its own chart.
  const forMonths = useMemo(() => filterPosts(data.posts, { ...fq, month: null }), [data, fq]);
  const forCompanies = useMemo(() => filterPosts(data.posts, { ...fq, perusahaan: '' }), [data, fq]);
  const shown = useMemo(() => filterPosts(data.posts, fq), [data, fq]);
  const byBadge = useMemo(() => monthlyBy(forMonths, BADGE, badgeOf), [forMonths]);
  const badgeSegments = useMemo(() => splitByGaps(byBadge.months), [byBadge]);
  const ranks = useMemo(() => companyRank(forCompanies), [forCompanies]);
  const allComps = useMemo(() => companyRank(data.posts).map((c) => c.perusahaan).sort((a, b) => a.localeCompare(b)), [data]);
  const filtered = JSON.stringify(f) !== JSON.stringify(DEFAULT_FOMO_FILTER);
  const pa = useMemo(() => pareto(shown), [shown]);
  const matrix = useMemo(() => accountThreadMatrix(shown), [shown]);
  const sevMonthly = useMemo(() => {
    const mm = monthlyBy(shown, SEVERITY, (p) => severityOf(p.teks));
    const months = mm.months.map((m) => ({ ...m, total: SEV_SHOWN.reduce((n, k) => n + m.counts[k], 0) }));
    return { segments: splitByGaps(months), undated: SEV_SHOWN.reduce((n, k) => n + mm.undated[k], 0), classified: months.reduce((n, m) => n + m.total, 0) + SEV_SHOWN.reduce((n, k) => n + mm.undated[k], 0) };
  }, [shown]);
  const reposts = useMemo(() => repostFlags(data.posts), [data]);
  const waves = useMemo(() => fomoInsight(shown, data.threads).waves, [shown, data]);
  const termsByWave = useMemo(() => waves.map((w) => ({ w, words: topWords(shown.filter((p) => p.iso && p.iso >= w.from && p.iso <= w.to), 8) })), [waves, shown]);
  const mentionPosts = shown.filter((p) => mentionsOf(p.teks).length > 0).length;
  const maskTotal = shown.reduce((n, p) => n + masksIn(p.teks), 0);
  const checks = useMemo(() => dossierCheck(dossier, data.threads), [dossier, data]);
  const maxLen = Math.max(1, ...data.posts.map((p) => p.teks.length));
  const maxThreadPosts = Math.max(1, ...data.threads.map((th) => th.posts));
  const allDates = data.threads.flatMap((th) => [th.mulai, th.akhir]).filter((d): d is string => !!d).sort();

  // "DeletedUser" is a placeholder for many removed accounts, not one account: left out of the account count.
  const realAccounts = data.accounts.filter((a) => !isPlaceholder(a.akun));
  const deletedPosts = data.posts.filter((p) => isPlaceholder(p.akun)).length;
  const badged = realAccounts.filter((a) => a.perusahaan).length;
  const year = (y: string) => data.posts.filter((p) => p.iso?.startsWith(y)).length;
  const company = f.perusahaan ? ranks.find((r) => r.perusahaan === f.perusahaan) ?? null : null;
  const companyPosts = company ? data.posts.filter((p) => p.perusahaan === company.perusahaan) : [];
  const companyDates = companyPosts.map((p) => p.iso).filter((d): d is string => !!d).sort();
  const toggleOpen = (n: number) => setOpen((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const chip = <span className="fm-chip">{t.chip}</span>;

  return (
    <div className="viz fm">
      <div className="viz-tiles">
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.posts}</p><p className="viz-tile__v">{fmtN(data.posts.length, locale)}</p><p className="viz-tile__s">{t.tiles.postsSub(data.threads.length)}</p></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.akun}</p><p className="viz-tile__v">{fmtN(realAccounts.length, locale)}</p><p className="viz-tile__s">{t.tiles.akunSub(badged, realAccounts.length - badged, deletedPosts)}</p></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.perusahaan}</p><p className="viz-tile__v">{fmtN(allComps.length, locale)}</p><p className="viz-tile__s">{t.tiles.perusahaanSub}</p></div>
        <div className="viz-tile"><p className="viz-tile__k">{t.tiles.periode}</p><p className="viz-tile__v viz-tile__v--sm">2023 – 2026</p><p className="viz-tile__s">{t.tiles.periodeSub(year('2023'), year('2026'))}</p></div>
      </div>

      <FomoInsights posts={shown} threads={data.threads} locale={locale} />

      <div className="viz-cards">
        <Card title={t.cMonth} note={t.cMonthNote} wide>
          <Legend label={t.legend} items={[...BADGE.map((b) => ({ key: b, label: t.badge[b], cls: FILL[b] })), { key: 'u', label: t.cols.undated, cls: 'fm-fill--undated' }]} />
          {byBadge.months.length === 0 && byBadge.undated.total === 0 ? <p className="viz-empty">{t.none}</p> : (
            <SegmentedColumns segments={badgeSegments} undated={byBadge.undated.total} series={BADGE} fill={(b) => FILL[b]} seriesLabel={(b) => t.badge[b]}
              locale={locale} unit={t.items} selected={f.month} onSelect={(k) => set({ month: k })} labels={t.cols} />
          )}
        </Card>

        <Card title={t.cComp} note={<>{chip} {t.cCompNote}</>} wide>
          <Legend label={t.legend} items={[{ key: 'teks', label: t.conf.teks, cls: 'fm-conf--teks' }, { key: 'gambar', label: t.conf.gambar, cls: 'fm-conf--gambar' }, { key: 'ragu', label: t.conf.ragu, cls: 'fm-conf--ragu fm-key-hatch' }]} />
          {ranks.length === 0 ? <p className="viz-empty">{t.none}</p> : (
            <CompanyRank rows={ranks} locale={locale} selected={f.perusahaan || null} limit={allCompanies ? ranks.length : TOP}
              onSelect={(c) => set({ perusahaan: f.perusahaan === c ? '' : c })} labels={{ accounts: t.akunN, posts: t.postsN, n1: t.n1, conf: t.conf }} />
          )}
          {ranks.length > TOP && <button type="button" className="viz-chip" onClick={() => setAllCompanies((v) => !v)} aria-expanded={allCompanies}>{allCompanies ? t.showTop : t.showAll(ranks.length)}</button>}
          <p className="fm-foot">{t.sortRule}</p>
          {company && (
            <div className="fm-panel" aria-live="polite">
              <div className="fm-panel__head"><h4>{t.panelH(company.perusahaan)}</h4><button type="button" className="viz-chip" onClick={() => set({ perusahaan: '' })}>{t.panelClose}</button></div>
              <dl>
                <dt>{t.panelAccounts}</dt><dd>{[...new Set(companyPosts.map((p) => p.akun))].map((a) => <span key={a} className={`pk-badge${isGenericHandle(a) ? ' fm-generic' : ''}`}>{a}</span>)}</dd>
                <dt>{t.panelThreads}</dt><dd>{[...new Set(companyPosts.map((p) => p.thread))].sort((a, b) => a - b).join(', ')}</dd>
                <dt>{t.panelSpan}</dt><dd>{companyDates.length ? `${fmtDay(companyDates[0], locale)} – ${fmtDay(companyDates.at(-1)!, locale)}` : '–'}</dd>
                <dt>{t.panelSamples}</dt><dd><ul>{companyPosts.slice(0, 3).map((p) => <li key={p.n}><span className="pk-mono">{p.akun}</span>: {p.teks.slice(0, 180)}{p.teks.length > 180 ? '…' : ''}</li>)}</ul></dd>
              </dl>
            </div>
          )}
        </Card>

        <Card title={t.cPareto} note={<>{chip} {t.cParetoNote(pa.topTenShare, pa.halfBy, pa.accounts, pa.oneTimers)}</>}>
          {pa.accounts === 0 ? <p className="viz-empty">{t.none}</p> : <ParetoCurve data={pa} locale={locale} labels={{ x: t.paretoX, y: t.paretoY, even: t.paretoEven }} />}
        </Card>

        <Card title={t.cSev} note={t.cSevNote(sevMonthly.classified, shown.length)}>
          <Legend label={t.legend} items={SEV_SHOWN.map((k) => ({ key: k, label: t.sev[k], cls: `fm-sev--${k}` }))} />
          {sevMonthly.classified === 0 ? <p className="viz-empty">{t.none}</p> : (
            <SegmentedColumns segments={sevMonthly.segments} undated={sevMonthly.undated} series={SEV_SHOWN} fill={(k) => `fm-sev--${k}`} seriesLabel={(k) => t.sev[k]}
              locale={locale} unit={t.items} selected={null} height={190} labels={t.cols} />
          )}
          <details className="viz-table-view"><summary>{t.rulesH}</summary>
            <ul className="fm-rules">{(['doxxing', 'ancaman', 'tuduhan', 'hinaan'] as const).map((k) => <li key={k}><strong>{t.sev[k]}:</strong> {SEVERITY_RULES[k].join(', ')}</li>)}</ul>
          </details>
          <ul className="fm-repost">
            {waves.map((w) => {
              const inW = data.posts.filter((p) => p.iso && p.iso >= w.from && p.iso <= w.to);
              const share = inW.length ? Math.round((inW.filter((p) => reposts.has(p.n)).length / inW.length) * 100) : 0;
              return <li key={w.from}>{t.repost(share, t.wave(fmtDay(w.from, locale) ?? w.from, fmtDay(w.to, locale) ?? w.to))}</li>;
            })}
            <li className="muted">{t.repostWhy}</li>
          </ul>
        </Card>

        <Card title={t.cMatrix} note={<>{chip} {t.cMatrixNote(matrix.rows.length)}</>} wide>
          {matrix.rows.length === 0 ? <p className="viz-empty">{t.none}</p> : (
            <ThreadMatrix rows={matrix.rows} threads={matrix.threads} max={matrix.max} locale={locale} onAccount={(a) => { set({ q: a }); document.getElementById('fm-posts')?.scrollIntoView(); }}
              labels={{ generic: t.generic, cell: t.cell, thread: t.threadWord }} />
          )}
          <p className="fm-foot">{t.matrixRule}</p>
        </Card>

        <Card title={t.cTerms} note={t.cTermsNote} wide>
          {termsByWave.length === 0 ? <p className="viz-empty">{t.none}</p> : (
            <div className="fm-terms">
              {termsByWave.map(({ w, words }) => (
                <div key={w.from}>
                  <h4>{t.wave(fmtDay(w.from, locale) ?? w.from, fmtDay(w.to, locale) ?? w.to)}</h4>
                  {words.length ? <HBars locale={locale} unit={t.items} labelWidth={110} rows={words.map((x) => ({ key: x.word, label: x.word, n: x.posts }))} /> : <p className="viz-empty">{t.none}</p>}
                </div>
              ))}
            </div>
          )}
          <p className="fm-foot">{t.termsRule}</p>
        </Card>

        <Card title={t.cAudit}>
          <p>{t.auditNote(mentionPosts, maskTotal, shown.length)}</p>
        </Card>

        <Card title={t.cCheck}>
          {checks.length === 0 ? <p className="viz-empty">{t.checkEmpty}</p> : (
            <div className="viz-scroll"><table>
              <thead><tr><th scope="col">{t.checkCols.peristiwa}</th><th scope="col">{t.checkCols.dossier}</th><th scope="col">{t.checkCols.fomo}</th><th scope="col">{t.checkCols.days}</th><th scope="col">{t.checkCols.thread}</th></tr></thead>
              <tbody>{checks.map((c, i) => (
                <tr key={i} className={c.days !== null && c.days > 7 ? 'fm-row--flag' : undefined}>
                  <td>{c.peristiwa}</td><td>{fmtDay(c.dossier, locale) ?? '–'}</td><td>{fmtDay(c.fomo, locale) ?? '–'}</td>
                  <td>{c.days ?? '–'}{c.days !== null && c.days > 7 ? ` · ${t.checkFlag}` : ''}</td><td>{c.thread ?? '–'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>

      <section className="pk-section" aria-labelledby="fm-threads-h">
        <h3 id="fm-threads-h">{t.threadsH}</h3>
        <p className="fm-foot">{t.akunNote}</p>
        <div className="viz-scroll">
          <table>
            <thead><tr><th scope="col">{t.tcols.no}</th><th scope="col">{t.tcols.judul}</th><th scope="col">{t.tcols.pembuka}</th><th scope="col">{t.tcols.posts}</th><th scope="col">{t.tcols.akun}</th><th scope="col">{t.tcols.periode}</th><th scope="col">{t.tcols.link}</th></tr></thead>
            <tbody>
              {data.threads.map((th) => (
                <tr key={th.thread} className={f.thread === th.thread ? 'fm-row--on' : undefined}>
                  <td>{th.thread}</td>
                  <td className="fm-title">{th.judul}</td>
                  <td className="pk-mono">{th.pembuka ? (isPlaceholder(th.pembuka) ? t.deleted : th.pembuka) : '–'}</td>
                  <td className="fm-num">
                    <button type="button" className="viz-sort" aria-pressed={f.thread === th.thread} aria-label={`${t.filterThread}: ${t.thread} ${th.thread}`}
                      onClick={() => set({ thread: f.thread === th.thread ? null : th.thread })}>{fmtN(th.posts, locale)} ↓</button>
                    <InlineBar value={th.posts} max={maxThreadPosts} label={`${th.posts} ${t.items}`} />
                  </td>
                  <td>{fmtN(threadAccounts(data.posts, th.thread), locale)}</td>
                  <td className="fm-num">{fmtDay(th.mulai, locale) ?? '–'}{th.akhir && th.akhir !== th.mulai ? ` – ${fmtDay(th.akhir, locale)}` : ''}
                    {allDates.length > 0 && <RangeBar from={th.mulai} to={th.akhir} min={allDates[0]} max={allDates.at(-1)!} label={`${th.mulai ?? ''} – ${th.akhir ?? ''}`} />}</td>
                  <td>{th.url ? <a href={th.url} rel="nofollow ugc noopener noreferrer" target="_blank">{t.open}</a> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="pk-section" id="fm-posts" aria-labelledby="fm-posts-h">
        <h3 id="fm-posts-h">{t.postsH}</h3>
        <p className="pk-presume">{t.warn}</p>
        <form className="viz-filters" aria-label={t.filterThread} onSubmit={(e) => e.preventDefault()}>
          <fieldset className="viz-filters__row">
            <legend>{t.filterThread}</legend>
            <label>{t.company} <select value={f.perusahaan} onChange={(e) => set({ perusahaan: e.target.value })}>
              <option value="">{t.anyCompany}</option>{allComps.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></label>
            <label>{t.thread} <select value={f.thread ?? ''} onChange={(e) => set({ thread: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t.anyThread}</option>{data.threads.map((th) => <option key={th.thread} value={th.thread}>{th.thread}. {th.judul.slice(0, 48)}</option>)}
            </select></label>
            <label>{t.badgeSel} <select value={f.badge} onChange={(e) => set({ badge: e.target.value as FomoFilter['badge'] })}>
              {(Object.keys(t.badgeOpt) as FomoFilter['badge'][]).map((b) => <option key={b} value={b}>{t.badgeOpt[b]}</option>)}
            </select></label>
            <label className="viz-search">{t.search} <input type="search" value={f.q} autoComplete="off" onChange={(e) => set({ q: e.target.value })} /></label>
            {f.month && <button type="button" className="viz-chip" aria-pressed="true" onClick={() => set({ month: null })}>{t.month(fmtMonth(f.month, locale, true))} · {t.clear}</button>}
            <button type="button" className="btn viz-reset" disabled={!filtered} onClick={() => set(DEFAULT_FOMO_FILTER)}>{t.reset}</button>
          </fieldset>
        </form>
        <p className="muted" role="status">{t.shown(Math.min(limit, shown.length), shown.length)}</p>
        {shown.length === 0 ? <p className="viz-empty">{t.none}</p> : (
          <ol className="fm-posts">
            {shown.slice(0, limit).map((p) => {
              const long = p.teks.length > LONG;
              const isOpen = open.has(p.n);
              const mentions = mentionsOf(p.teks).length;
              const masks = masksIn(p.teks);
              return (
                <li key={p.n} className="fm-post">
                  <p className="pk-tl__meta">
                    <span className={`viz-key ${FILL[p.perusahaan ? 'badge' : 'anon']}`} aria-hidden="true" />
                    <span className={`pk-mono fm-akun${isGenericHandle(p.akun) ? ' fm-generic' : ''}`} title={isGenericHandle(p.akun) ? t.generic : undefined}>{isPlaceholder(p.akun) ? t.deleted : p.akun}</span>
                    {p.perusahaan && <span className={`pk-badge fm-badge--${p.lencana ?? 'teks'}`} title={p.lencana && p.lencana !== 'teks' ? t.confShort[p.lencana] : undefined}>{p.perusahaan}</span>}
                    {p.nder && <span className="pk-badge">{t.nder}</span>}
                    {' · '}{fmtDay(p.iso, locale) ?? p.tanggal ?? t.noDate}{' · '}{t.thread} {p.thread}
                    <LengthSpark chars={p.teks.length} max={maxLen} label={t.len(p.teks.length)} />
                    {reposts.has(p.n) && <span className="pk-badge fm-flag">{t.flagRepost}</span>}
                    {mentions > 0 && <span className="pk-badge fm-flag">{t.flagMention(mentions)}</span>}
                    {masks > 0 && <span className="pk-badge fm-flag">{t.flagMask(masks)}</span>}
                  </p>
                  <blockquote className={`fm-quote${long && !isOpen ? ' fm-quote--clamp' : ''}`}>{p.teks}</blockquote>
                  {long && <button type="button" className="viz-sort fm-more" aria-expanded={isOpen} onClick={() => toggleOpen(p.n)}>{isOpen ? t.readLess : t.readMore}</button>}
                </li>
              );
            })}
          </ol>
        )}
        {limit < shown.length && <button type="button" className="btn viz-more" onClick={() => setLimit((l) => l + PAGE)}>{t.more(Math.min(PAGE, shown.length - limit))}</button>}
      </section>
    </div>
  );
}
