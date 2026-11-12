// Shapes src/data/fomo.json (posts about the Pelapor on the Fomo platform, made by scripts/make-fomo-data.mjs) into what
// the Fomo section of /pantau draws. Pure and browser-safe.
// A company badge is what Fomo displays next to an account name; it is not evidence that the company is involved.

/** How sure a badge reading is: page text + screenshot, screenshot only (I/l, O/0 risk), or flagged uncertain by the source. */
export type Lencana = 'teks' | 'gambar' | 'ragu';
export interface FomoAccount { akun: string; perusahaan: string | null; perluVerifikasi: boolean; lencana?: Lencana | null; nder: boolean; thread: number[] }
export interface FomoPost { n: number; akun: string; perusahaan: string | null; lencana?: Lencana | null; nder: boolean; tanggal: string | null; iso: string | null; precision: string; teks: string; thread: number }
export interface FomoThread { thread: number; url: string | null; judul: string; pembuka: string | null; posts: number; akun: number; mulai: string | null; akhir: string | null }
export interface Fomo {
  meta: { judul: string; objek: string; catatan: string[]; dibuat: string | null; total: Record<string, number>; dikecualikan: number };
  accounts: FomoAccount[]; posts: FomoPost[]; threads: FomoThread[];
}

export const BADGE = ['badge', 'anon'] as const;
export type Badge = (typeof BADGE)[number];
export const badgeOf = (p: { perusahaan: string | null }): Badge => (p.perusahaan ? 'badge' : 'anon');

const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};

/** Posts per month, split by whether Fomo showed a company badge; every month between the first and last is kept. */
export function postsPerMonth(posts: readonly FomoPost[]): { months: { key: string; counts: Record<Badge, number> }[]; undated: number } {
  const dated = posts.filter((p) => p.iso);
  if (!dated.length) return { months: [], undated: posts.length };
  const keys = dated.map((p) => p.iso!.slice(0, 7)).sort();
  const months: { key: string; counts: Record<Badge, number> }[] = [];
  for (let k = keys[0]; k <= keys.at(-1)!; k = addMonths(k, 1)) months.push({ key: k, counts: { badge: 0, anon: 0 } });
  const at = new Map(months.map((m) => [m.key, m]));
  for (const p of dated) at.get(p.iso!.slice(0, 7))!.counts[badgeOf(p)] += 1;
  return { months, undated: posts.length - dated.length };
}

/** Companies by number of posts from badged accounts, with how many distinct accounts carried that badge. */
export function companies(posts: readonly FomoPost[]): { perusahaan: string; posts: number; akun: number }[] {
  const m = new Map<string, { posts: number; akun: Set<string> }>();
  for (const p of posts) {
    if (!p.perusahaan) continue;
    const e = m.get(p.perusahaan) ?? { posts: 0, akun: new Set<string>() };
    e.posts += 1;
    e.akun.add(p.akun);
    m.set(p.perusahaan, e);
  }
  return [...m].map(([perusahaan, e]) => ({ perusahaan, posts: e.posts, akun: e.akun.size }))
    .sort((a, b) => b.posts - a.posts || b.akun - a.akun || a.perusahaan.localeCompare(b.perusahaan));
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export interface FomoFilter { perusahaan: string; thread: number | null; month: string | null; q: string; badge: 'all' | Badge }
export const DEFAULT_FOMO_FILTER: FomoFilter = { perusahaan: '', thread: null, month: null, q: '', badge: 'all' };

/** Posts matching every filter, oldest first (undated last). The search covers the text and the account name. */
export function filterPosts(posts: readonly FomoPost[], f: FomoFilter): FomoPost[] {
  const q = norm(f.q.trim());
  return posts
    .filter((p) => (!f.perusahaan || p.perusahaan === f.perusahaan)
      && (f.thread === null || p.thread === f.thread)
      && (!f.month || p.iso?.startsWith(f.month))
      && (f.badge === 'all' || badgeOf(p) === f.badge)
      && (!q || norm(`${p.akun} ${p.teks}`).includes(q)))
    .sort((a, b) => (a.iso ?? '9999').localeCompare(b.iso ?? '9999') || a.n - b.n);
}

// ---------- insights (recomputed from the filtered posts) ----------
import { gini, hhi, median, pct, topShare, waves, weekdays, daysBetween, type Wave } from './cross-insights';

// Indonesian and English function words, plus the Pelapor's own name, left out of the word counts.
const STOP = new Set(('yang dan di ke dari ini itu dia aja udah ada ga gak nggak ngga tidak bukan juga sama kalo kalau buat untuk dengan '
  + 'jadi apa kok sih deh dong lagi lah nya pun bisa mau aku gue gw lu lo kamu kita kami mereka orang the a an is to of and in it you that '
  + 'this for on are be was with have not but so just like he his i my me rahmat wibowo rw balas suka komentar sudah akan karena pas atau '
  + 'tapi emang kayak gitu gini banget sampe sampai masih pernah terus tau tahu biar kan nih tuh si ya yg dgn utk tp jg gk krn dr aja2 '
  + 'mas bang bro kak sama2 punya bikin dari2 apa2 ada2 ini2 sih2 an mah').split(/\s+/));

/** Most frequent words (not function words, at least 4 letters) across post texts, counted once per post. */
export function topWords(posts: readonly FomoPost[], limit = 12): { word: string; posts: number }[] {
  const m = new Map<string, number>();
  for (const p of posts) {
    const words = new Set(p.teks.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z]{4,}/g) ?? []);
    for (const w of words) if (!STOP.has(w)) m.set(w, (m.get(w) ?? 0) + 1);
  }
  return [...m].map(([word, n]) => ({ word, posts: n })).sort((a, b) => b.posts - a.posts || a.word.localeCompare(b.word)).slice(0, limit);
}

/** Platform placeholders for removed accounts: many people behind one name, so never ranked as one account. */
export const isPlaceholder = (akun: string) => /^(deleted\s*user|\[deleted\]|deleted|unknown)$/i.test(akun.trim());

export interface FomoWave extends Wave { accounts: number; badged: number; threads: number }

export interface FomoInsight {
  posts: number; accounts: number; threads: number;
  deleted: { posts: number; threads: number };
  top10Share: number | null; giniAccounts: number | null; hhiCompanies: number | null; topCompanyShare: number | null;
  repeat: { accounts: number; maxThreads: number; maxAccount: string | null };
  returning: number;
  waves: FomoWave[];
  threadLife: { medianDays: number | null; firstThreeDaysShare: number | null; longest: { thread: number; days: number } | null };
  badgedShare: number;
  weekday: number[];
  busiestDay: { date: string; count: number } | null;
  words: { word: string; posts: number }[];
}

export function fomoInsight(posts: readonly FomoPost[], threads: readonly FomoThread[]): FomoInsight {
  // Placeholder names ("DeletedUser") stand for many removed accounts: kept out of every per-account figure, counted apart.
  const deleted = posts.filter((p) => isPlaceholder(p.akun));
  const byAccount = new Map<string, FomoPost[]>();
  for (const p of posts) if (!isPlaceholder(p.akun)) byAccount.set(p.akun, [...(byAccount.get(p.akun) ?? []), p]);
  const counts = [...byAccount.values()].map((v) => v.length);
  const companyCounts = companies(posts).map((c) => c.posts);
  const threadsPer = [...byAccount].map(([a, v]) => ({ a, n: new Set(v.map((p) => p.thread)).size })).sort((x, y) => y.n - x.n || x.a.localeCompare(y.a));
  const ws = waves(posts.map((p) => p.iso).filter((d): d is string => !!d), 60, 10).map((w) => {
    const inW = posts.filter((p) => p.iso && p.iso >= w.from && p.iso <= w.to);
    return { ...w, accounts: new Set(inW.filter((p) => !isPlaceholder(p.akun)).map((p) => p.akun)).size, badged: pct(inW.filter((p) => p.perusahaan).length, inW.length), threads: new Set(inW.map((p) => p.thread)).size };
  });
  // Accounts posting in more than one wave: the same names came back.
  const waveOf = (d: string) => ws.findIndex((w) => d >= w.from && d <= w.to);
  const returning = [...byAccount.values()].filter((v) => new Set(v.map((p) => (p.iso ? waveOf(p.iso) : -1)).filter((i) => i >= 0)).size > 1).length;
  const shownThreads = new Set(posts.map((p) => p.thread));
  const life = threads.filter((t) => shownThreads.has(t.thread) && t.mulai && t.akhir).map((t) => ({ thread: t.thread, days: daysBetween(t.mulai!, t.akhir!) }));
  const early = posts.filter((p) => {
    const th = threads.find((t) => t.thread === p.thread);
    return p.iso && th?.mulai ? daysBetween(th.mulai, p.iso) <= 2 : false;
  }).length;
  const datedPosts = posts.filter((p) => p.iso).length;
  const byDay = new Map<string, number>();
  for (const p of posts) if (p.iso) byDay.set(p.iso, (byDay.get(p.iso) ?? 0) + 1);
  let busiestDay: FomoInsight['busiestDay'] = null;
  for (const [date, count] of byDay) if (!busiestDay || count > busiestDay.count || (count === busiestDay.count && date < busiestDay.date)) busiestDay = { date, count };
  return {
    posts: posts.length, accounts: byAccount.size, threads: shownThreads.size,
    deleted: { posts: deleted.length, threads: new Set(deleted.map((p) => p.thread)).size },
    top10Share: topShare(counts, 10), giniAccounts: gini(counts), hhiCompanies: hhi(companyCounts), topCompanyShare: topShare(companyCounts, 1),
    repeat: { accounts: threadsPer.filter((x) => x.n > 1).length, maxThreads: threadsPer[0]?.n ?? 0, maxAccount: threadsPer[0] && threadsPer[0].n > 1 ? threadsPer[0].a : null },
    returning,
    waves: ws,
    threadLife: {
      medianDays: median(life.map((l) => l.days)),
      firstThreeDaysShare: datedPosts ? pct(early, datedPosts) : null,
      longest: life.length ? life.reduce((a, b) => (b.days > a.days ? b : a)) : null,
    },
    badgedShare: pct(posts.filter((p) => p.perusahaan).length, posts.length),
    weekday: weekdays(posts.map((p) => p.iso).filter((d): d is string => !!d)),
    busiestDay,
    words: topWords(posts),
  };
}

// ---------- gap fixes (aegis review): ranking, matrix, Pareto, severity, reposts, mentions, consistency ----------

/** Months in order with a value each; runs of `minGap` or more empty months between active months are cut out as gaps. */
export interface Segment<T> { months: T[]; gapBefore: number }
export function splitByGaps<T extends { key: string; total: number }>(months: readonly T[], minGap = 3): Segment<T>[] {
  const out: Segment<T>[] = [];
  let cur: T[] = [];
  let empty: T[] = [];
  let pendingGap = 0;
  for (const m of months) {
    if (m.total > 0) {
      if (cur.length && empty.length >= minGap) {
        out.push({ months: cur, gapBefore: pendingGap });
        pendingGap = empty.length;
        cur = [];
      } else cur.push(...empty);
      empty = [];
      cur.push(m);
    } else if (cur.length) empty.push(m);
  }
  if (cur.length) out.push({ months: cur, gapBefore: pendingGap });
  return out;
}

/** Posts per month for any grouping of posts, every month from first to last dated post, plus the undated count. */
export function monthlyBy<K extends string>(posts: readonly FomoPost[], keys: readonly K[], keyOf: (p: FomoPost) => K): { months: { key: string; counts: Record<K, number>; total: number }[]; undated: Record<K, number> & { total: number } } {
  const zero = () => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  const loose = zero();
  for (const p of posts) if (!p.iso) loose[keyOf(p)] += 1;
  const undated = { ...loose, total: posts.filter((p) => !p.iso).length };
  const dated = posts.filter((p) => p.iso);
  if (!dated.length) return { months: [], undated };
  const sorted = dated.map((p) => p.iso!.slice(0, 7)).sort();
  const months: { key: string; counts: Record<K, number>; total: number }[] = [];
  for (let k = sorted[0]; k <= sorted.at(-1)!; k = addMonths(k, 1)) months.push({ key: k, counts: zero(), total: 0 });
  const at = new Map(months.map((m) => [m.key, m]));
  for (const p of dated) { const m = at.get(p.iso!.slice(0, 7))!; m.counts[keyOf(p)] += 1; m.total += 1; }
  return { months, undated };
}

export interface CompanyRow { perusahaan: string; akun: number; posts: number; conf: Record<Lencana, number> }

/**
 * Company badges ranked by distinct accounts (so one prolific account cannot top the list), then posts, then name.
 * `conf` counts the accounts by how sure their badge reading is. Placeholder names never count as an account.
 */
export function companyRank(posts: readonly FomoPost[]): CompanyRow[] {
  const m = new Map<string, { posts: number; akun: Map<string, Lencana> }>();
  for (const p of posts) {
    if (!p.perusahaan || isPlaceholder(p.akun)) continue;
    const e = m.get(p.perusahaan) ?? { posts: 0, akun: new Map<string, Lencana>() };
    e.posts += 1;
    // An account's confidence comes from its first known reading; a post without one never overwrites it.
    if (p.lencana || !e.akun.has(p.akun)) e.akun.set(p.akun, p.lencana ?? e.akun.get(p.akun) ?? 'gambar');
    m.set(p.perusahaan, e);
  }
  return [...m].map(([perusahaan, e]) => {
    const conf: Record<Lencana, number> = { teks: 0, gambar: 0, ragu: 0 };
    for (const c of e.akun.values()) conf[c] += 1;
    return { perusahaan, akun: e.akun.size, posts: e.posts, conf };
  }).sort((a, b) => b.akun - a.akun || b.posts - a.posts || a.perusahaan.localeCompare(b.perusahaan));
}

/** Handles that are ordinary words or generic labels, so one name may be shared by several people. */
const GENERIC = new Set(['awas', 'anon', 'anonim', 'anonymous', 'user', 'admin', 'test', 'orang', 'pengguna', 'hamba', 'rakyat', 'warga', 'netizen', 'manusia', 'someone', 'guest']);
export const isGenericHandle = (akun: string) => GENERIC.has(akun.trim().toLowerCase()) || /^(user|anon|guest)\d*$/i.test(akun.trim());

export interface MatrixRow { akun: string; perThread: Record<number, number>; total: number; threads: number; generic: boolean }

/** Accounts active in at least `minThreads` threads, with their posts per thread; most threads first, then posts, then name. */
export function accountThreadMatrix(posts: readonly FomoPost[], minThreads = 2): { rows: MatrixRow[]; threads: number[]; max: number } {
  const m = new Map<string, Record<number, number>>();
  for (const p of posts) {
    if (isPlaceholder(p.akun)) continue;
    const r = m.get(p.akun) ?? {};
    r[p.thread] = (r[p.thread] ?? 0) + 1;
    m.set(p.akun, r);
  }
  const rows = [...m].map(([akun, perThread]) => ({ akun, perThread, total: Object.values(perThread).reduce((a, b) => a + b, 0), threads: Object.keys(perThread).length, generic: isGenericHandle(akun) }))
    .filter((r) => r.threads >= minThreads)
    .sort((a, b) => b.threads - a.threads || b.total - a.total || a.akun.localeCompare(b.akun));
  const threads = [...new Set(rows.flatMap((r) => Object.keys(r.perThread).map(Number)))].sort((a, b) => a - b);
  const max = Math.max(0, ...rows.flatMap((r) => Object.values(r.perThread)));
  return { rows, threads, max };
}

export interface Pareto { points: { accounts: number; posts: number }[]; accounts: number; posts: number; oneTimers: number; topTenShare: number; halfBy: number }

/** Cumulative share of posts by accounts sorted from most to fewest posts (placeholders left out). Percentages 0-100. */
export function pareto(posts: readonly FomoPost[]): Pareto {
  const c = new Map<string, number>();
  for (const p of posts) if (!isPlaceholder(p.akun)) c.set(p.akun, (c.get(p.akun) ?? 0) + 1);
  const counts = [...c.values()].sort((a, b) => b - a);
  const total = counts.reduce((a, b) => a + b, 0);
  const points = [{ accounts: 0, posts: 0 }];
  let acc = 0;
  let halfBy = 0;
  counts.forEach((n, i) => {
    acc += n;
    points.push({ accounts: ((i + 1) / counts.length) * 100, posts: total ? (acc / total) * 100 : 0 });
    if (!halfBy && total && acc / total >= 0.5) halfBy = i + 1;
  });
  return {
    points, accounts: counts.length, posts: total, oneTimers: counts.filter((n) => n === 1).length,
    topTenShare: total ? Math.round((counts.slice(0, 10).reduce((a, b) => a + b, 0) / total) * 100) : 0, halfBy,
  };
}

/**
 * Severity ladder (an inference: keyword rules, not a legal finding). Highest level wins:
 * doxxing (personal location/identity details) > ancaman (threats) > tuduhan (accusations) > hinaan (insults) > lainnya.
 */
export const SEVERITY = ['lainnya', 'hinaan', 'tuduhan', 'ancaman', 'doxxing'] as const;
export type Severity = (typeof SEVERITY)[number];
export const SEVERITY_RULES: Record<Exclude<Severity, 'lainnya'>, string[]> = {
  doxxing: ['alamat', 'alamatnya', 'alamat rumah', 'rumahnya di', 'nomor hp', 'nomor hpnya', 'no hp', 'nomornya', 'nomor wa', 'nomor wanya', 'ktp', 'nik', 'kontak ibunya', 'kontak keluarganya', 'data pribadi', 'tinggal di'],
  ancaman: ['hajar', 'gebuk', 'habisin', 'abisin', 'gorok', 'tusuk', 'pukulin', 'dipukul', 'tonjok', 'samperin', 'datengin', 'tunggu aja', 'awas lo', 'awas lu', 'mati aja', 'mampus', 'bunuh dia', 'dibunuh', 'menjarain', 'penjarain'],
  tuduhan: ['penipu', 'nipu', 'bohong', 'boong', 'pembohong', 'fitnah', 'maling', 'plagiat', 'pelaku', 'harass', 'pelecehan', 'predator', 'scam', 'manipulatif', 'gaslight', 'playing victim'],
  hinaan: ['goblok', 'goblog', 'bodoh', 'bego', 'tolol', 'gila', 'sinting', 'anjing', 'anjir', 'bangsat', 'sampah', 'idiot', 'cupu', 'norak', 'narsis', 'delusi', 'delusional', 'caper', 'badut', 'clown', 'stres', 'stress', 'kampret', 'tai', 'freak', 'cringe', 'halu'],
};
const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEVERITY_RE = Object.fromEntries(Object.entries(SEVERITY_RULES).map(([k, ws]) => [k, new RegExp(`(^|[^a-z])(${ws.map(escapeRe).join('|')})(?=$|[^a-z])`, 'i')])) as Record<Exclude<Severity, 'lainnya'>, RegExp>;
export function severityOf(text: string): Severity {
  const t = text.toLowerCase();
  for (const k of ['doxxing', 'ancaman', 'tuduhan', 'hinaan'] as const) if (SEVERITY_RE[k].test(t)) return k;
  return 'lainnya';
}

const shingles = (text: string) => {
  const w = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
};

/**
 * Posts that repeat or quote another post (an inference): a "Forwarded"/"repost" marker, or at least 60% of the post's
 * 3-word shingles already present in an earlier post. Short posts (under 6 words) are never counted as reposts.
 */
export function repostFlags(posts: readonly FomoPost[]): Set<number> {
  const seen: Set<string>[] = [];
  const out = new Set<number>();
  const ordered = [...posts].sort((a, b) => (a.iso ?? '9999').localeCompare(b.iso ?? '9999') || a.n - b.n);
  for (const p of ordered) {
    const sh = shingles(p.teks);
    const marker = /\b(forwarded|diteruskan|repost|reposted|regram)\b/i.test(p.teks);
    if (marker) out.add(p.n);
    else if (sh.size >= 4 && seen.some((s) => { let hit = 0; for (const x of sh) if (s.has(x)) hit += 1; return hit / sh.size >= 0.6; })) out.add(p.n);
    if (sh.size) seen.push(sh);
  }
  return out;
}

/** @handles a post mentions, other than the Pelapor's own accounts: third parties named inside the quoted text. */
const OWN = /^@(rahmat|rweebs|rahmatwibowo)/i;
export const mentionsOf = (text: string): string[] => [...new Set((text.match(/@[A-Za-z0-9_.]{3,}/g) ?? []).filter((h) => !OWN.test(h)))];
/** Masks applied when the data was prepared ([alamat], [nama di lampiran]). */
export const masksIn = (text: string): number => (text.match(/\[(alamat|nama di lampiran)\]/g) ?? []).length;

export interface DossierRow { tanggal: string; iso: string | null; peristiwa: string }
export interface Discrepancy { peristiwa: string; dossier: string | null; fomo: string | null; days: number | null; thread: number | null }

/**
 * Dossier chronology rows that mention Fomo, checked against the Fomo thread dates they could refer to (the thread whose
 * first or last post is nearest). Empty when the dossier does not mention Fomo at all.
 */
export function dossierCheck(rows: readonly DossierRow[], threads: readonly FomoThread[]): Discrepancy[] {
  const dayMs = 86_400_000;
  return rows.filter((r) => /fomo/i.test(r.peristiwa)).map((r) => {
    if (!r.iso || r.iso.length !== 10) return { peristiwa: r.peristiwa, dossier: r.iso, fomo: null, days: null, thread: null };
    let best: { thread: number; date: string; d: number } | null = null;
    for (const t of threads) for (const d of [t.mulai, t.akhir]) {
      if (!d) continue;
      const diff = Math.round(Math.abs(Date.parse(`${d}T00:00:00Z`) - Date.parse(`${r.iso}T00:00:00Z`)) / dayMs);
      if (!best || diff < best.d) best = { thread: t.thread, date: d, d: diff };
    }
    return { peristiwa: r.peristiwa, dossier: r.iso, fomo: best?.date ?? null, days: best?.d ?? null, thread: best?.thread ?? null };
  });
}

/** Distinct real accounts in a thread (placeholder names left out, they stand for many accounts). */
export const threadAccounts = (posts: readonly FomoPost[], thread: number) => new Set(posts.filter((p) => p.thread === thread && !isPlaceholder(p.akun)).map((p) => p.akun)).size;
