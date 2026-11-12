import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildFomo, FOMO_DIR } from '../scripts/make-fomo-data.mjs';
import { postsPerMonth, companies, filterPosts, badgeOf, DEFAULT_FOMO_FILTER, type Fomo, type FomoPost } from '../src/lib/fomo';

const read = (p: string) => readFileSync(p, 'utf8');

const SRC = {
  akun: {
    _meta: { dibuat: '2026-10-29', catatan: ['perusahaan = teks lencana'] },
    akun: {
      alpha: { perusahaan: 'Tokopedia', folder: ['2', '1'], tag: [], perlu_verifikasi: false },
      beta: { perusahaan: null, folder: ['1'], tag: ['NDER'], perlu_verifikasi: true },
      gamma: { perusahaan: 'Pintu', folder: ['2'], tag: [], perlu_verifikasi: false },
    },
    dikecualikan: [{ folder: '2', akun: 'gamma', perusahaan: 'Pintu' }],
  },
  posts: [
    { perusahaan: 'Tokopedia', akun: 'alpha', tag: [], tanggal: '23 September 2023', kata_kata: 'pertama', url_post: 'https://fomo.id/x/1', bab: 1, folder: '1' },
    { perusahaan: null, akun: 'beta', tag: ['NDER'], tanggal: null, kata_kata: 'tanpa tanggal', url_post: 'https://fomo.id/x/1', bab: 1, folder: '1' },
    { perusahaan: 'Pintu', akun: 'gamma', tag: [], tanggal: '6 Mei 2026', kata_kata: 'dari akun dikecualikan', url_post: 'https://fomo.id/x/2', bab: 2, folder: '2' },
  ],
  gelar: {
    judul: 'Gelar Bukti', objek_kasus: 'objek', catatan: 'verbatim',
    ringkasan_eksekutif: { catatan: ['Tag NDER bukan perusahaan.'], total: { thread: 2 } },
    bab: [
      { bab: 1, url: 'https://fomo.id/x/1', postingan: [{ akun: 'alpha', isi: '\nJudul thread\nisi' }], lampiran: [{ berkas: 'a.png', path: 'source/1/a.png' }] },
      { bab: 2, url: '(URL tidak tercantum — Post #2)', postingan: [], lampiran: [] },
    ],
  },
};

describe('make-fomo-data', () => {
  const out = buildFomo(SRC);
  it('reads its source folder from FOMO_DIR, never a hard-coded local path', () => {
    expect(FOMO_DIR).not.toMatch(/^\/Users\//);
    expect(read('scripts/make-fomo-data.mjs')).not.toMatch(/\/Users\//);
  });
  it('keeps excluded accounts out of the account table but keeps their posts, unbadged', () => {
    expect(out.accounts.map((a: { akun: string }) => a.akun)).toEqual(['alpha', 'beta']);
    expect(out.posts[2]).toMatchObject({ akun: 'gamma', perusahaan: null, iso: '2026-05-06' });
    expect(out.meta.dikecualikan).toBe(1);
  });
  it('maps badges, NDER tags, verification flags, dates and thread summaries', () => {
    expect(out.accounts[0]).toEqual({ akun: 'alpha', perusahaan: 'Tokopedia', perluVerifikasi: false, lencana: 'gambar', nder: false, thread: [1, 2] });
    expect(out.accounts[1].lencana).toBeNull();
    expect(out.accounts[1]).toMatchObject({ perusahaan: null, nder: true, perluVerifikasi: true });
    expect(out.posts[1]).toMatchObject({ iso: null, precision: 'none', nder: true });
    expect(out.threads[0]).toEqual({ thread: 1, url: 'https://fomo.id/x/1', judul: 'Judul thread', pembuka: 'alpha', posts: 2, akun: 2, mulai: '2023-09-23', akhir: '2023-09-23' });
  });
  it('gives a thread whose source has no URL no link', () => {
    expect(out.threads[1].url).toBeNull();
  });
  it('drops screenshot paths and source file names', () => {
    const s = JSON.stringify(out);
    expect(s).not.toContain('source/1/a.png');
    expect(s).not.toContain('a.png');
    expect(s).not.toContain('folder');
  });
});

const post = (n: number, iso: string | null, perusahaan: string | null, akun = `a${n}`, thread = 1, teks = ''): FomoPost =>
  ({ n, akun, perusahaan, nder: false, tanggal: null, iso, precision: iso ? 'day' : 'none', teks, thread });

describe('fomo aggregations', () => {
  const posts = [post(1, '2023-09-23', 'Tokopedia', 'x'), post(2, '2023-11-02', 'Tokopedia', 'y'), post(3, '2023-11-05', null), post(4, null, 'DANA', 'z', 2, 'kata kunci')];
  it('counts posts per month by badge, keeping empty months and counting undated apart', () => {
    const { months, undated } = postsPerMonth(posts);
    expect(months.map((m) => m.key)).toEqual(['2023-09', '2023-10', '2023-11']);
    expect(months[2].counts).toEqual({ badge: 1, anon: 1 });
    expect(undated).toBe(1);
  });
  it('ranks company badges by posts with distinct accounts', () => {
    expect(companies(posts)).toEqual([{ perusahaan: 'Tokopedia', posts: 2, akun: 2 }, { perusahaan: 'DANA', posts: 1, akun: 1 }]);
    expect(badgeOf({ perusahaan: null })).toBe('anon');
  });
  it('filters by company, thread, month, badge and words, oldest first', () => {
    expect(filterPosts(posts, { ...DEFAULT_FOMO_FILTER, perusahaan: 'Tokopedia' }).map((p) => p.n)).toEqual([1, 2]);
    expect(filterPosts(posts, { ...DEFAULT_FOMO_FILTER, thread: 2 }).map((p) => p.n)).toEqual([4]);
    expect(filterPosts(posts, { ...DEFAULT_FOMO_FILTER, month: '2023-11' }).map((p) => p.n)).toEqual([2, 3]);
    expect(filterPosts(posts, { ...DEFAULT_FOMO_FILTER, badge: 'anon' }).map((p) => p.n)).toEqual([3]);
    expect(filterPosts(posts, { ...DEFAULT_FOMO_FILTER, q: 'KUNCI' }).map((p) => p.n)).toEqual([4]);
    expect(filterPosts(posts, DEFAULT_FOMO_FILTER).map((p) => p.n)).toEqual([1, 2, 3, 4]);
  });
});

describe('fomo section on /pantau', () => {
  const data = JSON.parse(read('src/data/fomo.json')) as Fomo;
  it('ships posts, accounts and threads without file paths', () => {
    expect(data.posts.length).toBeGreaterThan(400);
    expect(data.threads.length).toBeGreaterThan(20);
    const s = JSON.stringify(data);
    expect(s).not.toMatch(/source\/\d+\/|\.png"|\/Users\//);
  });
  it('is the third section, frames badges as display only, and links to Fomo with nofollow', () => {
    const page = read('src/pages/pantau.astro');
    // Hydrated lazily (directly or through a lazy wrapper island); either way the dashboard is server-rendered in #fomo.
    expect(page).toMatch(/<FomoDashboard[\s>]/);
    expect(page).toContain('id="fomo"');
    expect(page).toContain('bukan bukti bahwa perusahaan itu terlibat');
    expect(read('src/components/FomoDashboard.tsx')).toContain('rel="nofollow ugc noopener noreferrer"');
  });
});

import { fomoInsight, topWords, isPlaceholder } from '../src/lib/fomo';

describe('fomo insights', () => {
  const p = (n: number, akun: string, iso: string | null, thread = 1, perusahaan: string | null = null, teks = ''): FomoPost =>
    ({ n, akun, perusahaan, nder: false, tanggal: null, iso, precision: iso ? 'day' : 'none', teks, thread });
  const th = (thread: number, mulai: string, akhir: string) => ({ thread, url: null, judul: '', pembuka: null, posts: 0, akun: 0, mulai, akhir });
  it('treats DeletedUser as a placeholder, counted apart from every per-account figure', () => {
    expect(isPlaceholder('DeletedUser')).toBe(true);
    expect(isPlaceholder('anon.meresahkann')).toBe(false);
    const posts = [p(1, 'DeletedUser', '2023-10-01'), p(2, 'DeletedUser', '2023-10-01', 2), p(3, 'x', '2023-10-01'), p(4, 'x', '2023-10-02', 2)];
    const x = fomoInsight(posts, [th(1, '2023-10-01', '2023-10-01'), th(2, '2023-10-01', '2023-10-02')]);
    expect(x.accounts).toBe(1);
    expect(x.deleted).toEqual({ posts: 2, threads: 2 });
    expect(x.repeat).toEqual({ accounts: 1, maxThreads: 2, maxAccount: 'x' });
  });
  it('finds waves, accounts returning across waves, and thread burstiness', () => {
    const early = Array.from({ length: 10 }, (_, i) => p(i + 1, i < 2 ? 'back' : `e${i}`, '2023-10-0' + (1 + (i % 3)), 1, i % 2 ? 'Tokopedia' : null));
    const late = Array.from({ length: 10 }, (_, i) => p(i + 20, i < 2 ? 'back' : `l${i}`, '2026-05-0' + (1 + (i % 3)), 2));
    const x = fomoInsight([...early, ...late], [th(1, '2023-10-01', '2023-10-03'), th(2, '2026-05-01', '2026-05-03')]);
    expect(x.waves.map((w) => [w.from, w.count, w.badged])).toEqual([['2023-10-01', 10, 50], ['2026-05-01', 10, 0]]);
    expect(x.returning).toBe(1);
    expect(x.threadLife).toEqual({ medianDays: 2, firstThreeDaysShare: 100, longest: { thread: 1, days: 2 } });
  });
  it('counts words once per post and skips function words and the Pelapor\'s name', () => {
    const w = topWords([p(1, 'a', null, 1, null, 'Somasi somasi lagi dari Rahmat'), p(2, 'b', null, 1, null, 'somasi itu')]);
    expect(w[0]).toEqual({ word: 'somasi', posts: 2 });
    expect(w.map((x) => x.word)).not.toContain('rahmat');
  });
});

import {
  splitByGaps, monthlyBy, companyRank, accountThreadMatrix, pareto, severityOf, repostFlags, mentionsOf, masksIn, dossierCheck,
  isGenericHandle, threadAccounts, BADGE as B2,
} from '../src/lib/fomo';

describe('fomo gap fixes (aegis review)', () => {
  const P = (n: number, akun: string, iso: string | null, perusahaan: string | null = null, thread = 1, teks = 'x', lencana: 'teks' | 'gambar' | 'ragu' | null = null): FomoPost =>
    ({ n, akun, perusahaan, lencana, nder: false, tanggal: null, iso, precision: iso ? 'day' : 'none', teks, thread });

  it('records how sure each badge reading is (text, screenshot only, flagged uncertain)', () => {
    const out = buildFomo({ ...SRC, akun: { ...SRC.akun, akun: { ...SRC.akun.akun, alpha: { ...SRC.akun.akun.alpha, sumber: 'teks+tangkapan-layar' }, delta: { perusahaan: 'X', folder: ['1'], tag: [], perlu_verifikasi: true } } } });
    expect(out.accounts.find((a: { akun: string }) => a.akun === 'alpha')!.lencana).toBe('teks');
    expect(out.accounts.find((a: { akun: string }) => a.akun === 'delta')!.lencana).toBe('ragu');
    expect(out.posts[0].lencana).toBe('teks');
  });
  it('cuts long empty stretches out of the month axis and counts undated posts apart (items 2, 87)', () => {
    const posts = [P(1, 'a', '2023-09-01'), P(2, 'b', '2023-10-01'), P(3, 'c', '2026-05-01'), P(4, 'd', null)];
    const m = monthlyBy(posts, B2, () => 'anon' as const);
    expect(m.undated.total).toBe(1);
    const seg = splitByGaps(m.months);
    expect(seg.map((s) => [s.months[0].key, s.months.at(-1)!.key, s.gapBefore])).toEqual([['2023-09', '2023-10', 0], ['2026-05', '2026-05', 30]]);
    // A short gap (under 3 months) stays inside one segment.
    expect(splitByGaps(monthlyBy([P(1, 'a', '2023-01-01'), P(2, 'a', '2023-03-01')], B2, () => 'anon' as const).months)).toHaveLength(1);
  });
  it('ranks companies by distinct accounts, never counts placeholders, and tallies badge confidence (items 61, 81, 85, 93)', () => {
    const posts = [P(1, 'a', null, 'DANA', 1, 'x', 'teks'), P(2, 'a', null, 'DANA'), P(3, 'a', null, 'DANA'), P(4, 'b', null, 'Gojek', 1, 'x', 'gambar'), P(5, 'c', null, 'Gojek', 1, 'x', 'ragu'), P(6, 'DeletedUser', null, 'Gojek')];
    expect(companyRank(posts)).toEqual([
      { perusahaan: 'Gojek', akun: 2, posts: 2, conf: { teks: 0, gambar: 1, ragu: 1 } },
      { perusahaan: 'DANA', akun: 1, posts: 3, conf: { teks: 1, gambar: 0, ragu: 0 } },
    ]);
  });
  it('builds the account x thread matrix for repeat accounts only, without placeholders, flagging generic names (items 40, 86)', () => {
    const posts = [P(1, 'awas', null, null, 1), P(2, 'awas', null, null, 2), P(3, 'solo', null, null, 1), P(4, 'DeletedUser', null, null, 1), P(5, 'DeletedUser', null, null, 3)];
    const m = accountThreadMatrix(posts);
    expect(m.rows.map((r) => [r.akun, r.threads, r.generic])).toEqual([['awas', 2, true]]);
    expect(m.threads).toEqual([1, 2]);
    expect(isGenericHandle('KakakMelihat')).toBe(false);
    expect(threadAccounts(posts, 1)).toBe(2);
  });
  it('computes the Pareto share of posts by accounts (item 41)', () => {
    const posts = [...Array.from({ length: 6 }, (_, i) => P(i, 'top', null)), P(10, 'b', null), P(11, 'c', null), P(12, 'DeletedUser', null)];
    const pa = pareto(posts);
    expect([pa.accounts, pa.posts, pa.oneTimers, pa.halfBy, pa.topTenShare]).toEqual([3, 8, 2, 1, 100]);
    expect(pa.points.at(-1)).toEqual({ accounts: 100, posts: 100 });
  });
  it('classifies severity by the highest matching keyword rule, and leaves look-alikes alone (item 44)', () => {
    expect(severityOf('dasar goblok')).toBe('hinaan');
    expect(severityOf('dia penipu dan goblok')).toBe('tuduhan');
    expect(severityOf('mati aja sana, penipu')).toBe('ancaman');
    expect(severityOf('ini alamat rumahnya, sebarin')).toBe('doxxing');
    expect(severityOf('paling lambat pukul 15.00 WIB')).toBe('lainnya');
    expect(severityOf('dipecat dari kantornya')).toBe('lainnya');
  });
  it('flags reposts by marker or by repeated three-word runs, never short posts (item 96)', () => {
    const a = 'orang ini dipecat dari aws karena ngeshare hal rahasia';
    const flags = repostFlags([P(1, 'a', '2023-01-01', null, 1, a), P(2, 'b', '2023-01-02', null, 1, `${a} wkwk`), P(3, 'c', '2023-01-03', null, 1, 'Forwarded pesan lama'), P(4, 'd', '2023-01-04', null, 1, 'iya')]);
    expect([...flags].sort()).toEqual([2, 3]);
  });
  it('audits mentions of other accounts and masks (item 67)', () => {
    expect(mentionsOf('@budi setuju sama @rahmatwibowo dan @budi')).toEqual(['@budi']);
    expect(masksIn('di [alamat] bersama [nama di lampiran]')).toBe(2);
  });
  it('checks dossier dates against Fomo threads and is empty when the dossier never mentions Fomo (item 98)', () => {
    const threads = [{ thread: 1, url: null, judul: '', pembuka: null, posts: 1, akun: 1, mulai: '2023-09-23', akhir: '2023-09-28' }];
    expect(dossierCheck([{ tanggal: '', iso: '2026-01-01', peristiwa: 'Somasi kepada X' }], threads)).toEqual([]);
    expect(dossierCheck([{ tanggal: '', iso: '2023-10-10', peristiwa: 'Unggahan di Fomo' }], threads)).toEqual([{ peristiwa: 'Unggahan di Fomo', dossier: '2023-10-10', fomo: '2023-09-28', days: 12, thread: 1 }]);
  });
  it('ships the published Fomo data with a badge confidence on every badged account', () => {
    const data = JSON.parse(read('src/data/fomo.json')) as Fomo;
    expect(data.accounts.filter((a) => a.perusahaan).every((a) => ['teks', 'gambar', 'ragu'].includes(a.lencana ?? ''))).toBe(true);
    expect(data.accounts.filter((a) => !a.perusahaan).every((a) => a.lencana === null)).toBe(true);
  });
});
