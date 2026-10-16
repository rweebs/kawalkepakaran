// Everything the sitemap lists, built once per build and shared by /sitemap.xml and the /sitemap-<group>.xml children.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { EVENTS, eventUrl } from './linimasa';
import { getBukti, getPosts, getPostsEn } from './content';
import { getKlaim, getPakar, isGenerated } from './pakar';
import { ROUTES } from '../i18n';
import { localizedEvents, localizeEvent, eventPath } from './linimasa-locale';
import { firstImage } from './header-image';
import { createGitDates, derivedLastmod, newestDay, type SitemapEntry } from './sitemap';
import { PAGE_LASTMOD } from './site';

type StaticPage = keyof typeof PAGE_LASTMOD;

/** Files whose text a static page shows besides its own .astro file (the English pages wrap the Indonesian ones). */
const EXTRA_SOURCES: Partial<Record<StaticPage, string[]>> = {
  '/kebijakan': ['src/lib/corrections.ts'],
  '/kasus/abil-sudarman/bukti': ['src/lib/bukti.ts', 'src/content/bukti'],
  '/videos': ['src/lib/videos.ts', 'src/content/videos'],
  '/tiktok': ['src/lib/tiktok.ts', 'src/content/tiktok'],
  '/buku': ['src/lib/buku.ts', 'src/content/buku'],
  '/tentang': ['src/lib/tentang.ts', 'src/lib/tentang-en.ts'],
  '/kasus/abil-sudarman/linimasa': ['src/lib/linimasa.ts', 'src/lib/linimasa-en.ts'],
  '/kasus/abil-sudarman/linimasa-abil': ['src/lib/abil-timeline.ts'],
  '/kasus/abil-sudarman/bowobharata': ['src/lib/bowobharata.ts', 'src/lib/bowobharata-en.ts'],
};

/** The page's .astro file (path.astro or path/index.astro) plus its extra sources, keeping only files that exist. */
export function pageSources(path: string): string[] {
  const own = [`src/pages${path}.astro`, `src/pages${path}/index.astro`];
  return [...own, ...(EXTRA_SOURCES[path as StaticPage] ?? [])].filter((f) => existsSync(f));
}

const gitDate = createGitDates((args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }));

/** A static page's lastmod: git date of its sources, with PAGE_LASTMOD as the floor and the fallback. */
export const pageLastmod = (path: StaticPage): string | undefined => derivedLastmod(pageSources(path), PAGE_LASTMOD[path], gitDate);

const iso = (d: Date) => d.toISOString().slice(0, 10);
type Klaim = Awaited<ReturnType<typeof getKlaim>>[number];
const claimDates = (k: Klaim) => [k.data.reviewedAt, k.data.reply?.receivedAt];

let cached: Promise<SitemapEntry[]> | undefined;

/** All sitemap entries, each tagged with its child sitemap and its hreflang twin. Generated entries are never included. */
export function sitemapEntries(): Promise<SitemapEntry[]> {
  cached ??= collect();
  return cached;
}

async function collect(): Promise<SitemapEntry[]> {
  const posts = await getPosts();
  const bukti = await getBukti();
  const postsEn = await getPostsEn();
  const allPakar = await getPakar();
  const allKlaim = await getKlaim();
  // The /pakar and /klaim hubs are indexable (generated entries live elsewhere); generated detail pages stay noindex and out.
  const pakar = allPakar.filter((p) => !isGenerated(p));
  const klaim = allKlaim.filter((k) => !isGenerated(k));
  const latest = newestDay(posts.map((p) => p.data.translationDate));
  // Claim reviews and replies: the home page, the updates page and the hubs all show them.
  const claimsLastmod = newestDay(klaim.flatMap(claimDates));
  // The updates page changes whenever a claim is reviewed or answered, or a post is published.
  const updatesLastmod = newestDay([latest, claimsLastmod]);

  // An expert's profile changes with its own data file and with each review of, or reply to, one of its curated claims.
  const expertLastmod = (p: (typeof pakar)[number]) => {
    const file = p.filePath ? relative(process.cwd(), p.filePath) : undefined;
    return newestDay([...klaim.filter((k) => k.data.pakar === p.id).flatMap(claimDates), file ? gitDate([file]) : undefined]) ?? pageLastmod('/pakar');
  };
  const claimLastmod = (k: Klaim) => newestDay(claimDates(k)) ?? pageLastmod('/klaim');

  const entries: SitemapEntry[] = [
    { path: '/', lastmod: newestDay([latest, claimsLastmod]) },
    { path: '/pakar', lastmod: newestDay([pageLastmod('/pakar'), claimsLastmod]) },
    { path: '/klaim', lastmod: newestDay([pageLastmod('/klaim'), claimsLastmod]) },
    { path: ROUTES.updates.id, lastmod: updatesLastmod },
    { path: '/metode', lastmod: pageLastmod('/metode') },
    { path: '/glosarium', lastmod: pageLastmod('/glosarium') },
    { path: '/kasus/abil-sudarman', lastmod: pageLastmod('/kasus/abil-sudarman') },
    ...pakar.map((p) => ({ path: `/pakar/${p.id}`, lastmod: expertLastmod(p), group: 'claims' as const })),
    ...klaim.map((k) => ({ path: `/klaim/${k.id}`, lastmod: claimLastmod(k), group: 'claims' as const })),
    { path: '/kasus/abil-sudarman/artikel', lastmod: latest },
    { path: '/kasus/abil-sudarman/bukti', lastmod: pageLastmod('/kasus/abil-sudarman/bukti'), images: bukti.flatMap((e) => e.data.images.map((i) => i.src)) },
    { path: '/videos', lastmod: pageLastmod('/videos') },
    { path: '/tiktok', lastmod: pageLastmod('/tiktok') },
    { path: '/buku', lastmod: pageLastmod('/buku') },
    { path: '/tentang', lastmod: pageLastmod('/tentang') },
    { path: '/manifesto', lastmod: pageLastmod('/manifesto') },
    { path: '/kasus/abil-sudarman/linimasa', lastmod: pageLastmod('/kasus/abil-sudarman/linimasa') },
    { path: '/kasus/abil-sudarman/linimasa-abil', lastmod: pageLastmod('/kasus/abil-sudarman/linimasa-abil') },
    { path: '/kasus/abil-sudarman/bowobharata', lastmod: pageLastmod('/kasus/abil-sudarman/bowobharata') },
    ...EVENTS.map((e) => ({ path: eventUrl(e), lastmod: e.date, group: 'articles' as const })),
    { path: '/hak-jawab', lastmod: pageLastmod('/hak-jawab') },
    { path: '/disclaimer', lastmod: pageLastmod('/disclaimer') },
    { path: '/kebijakan', lastmod: pageLastmod('/kebijakan') },
    ...posts.map((p) => {
      const header = firstImage(p.body ?? '');
      return { path: `/kasus/abil-sudarman/artikel/${p.id}`, lastmod: iso(p.data.translationDate), images: header ? [header.src] : [], group: 'articles' as const };
    }),
  ];

  // English counterparts: the paired pages, the translated timeline and the translated articles.
  const paired = entries.flatMap((e) => {
    const route = Object.values(ROUTES).find((r) => r.id === e.path);
    return route ? [{ ...e, path: route.en }] : [];
  });
  const english: SitemapEntry[] = [
    ...paired,
    ...pakar.map((p) => ({ path: `/en/experts/${p.id}`, lastmod: expertLastmod(p), group: 'claims' as const })),
    ...klaim.map((k) => ({ path: `/en/claims/${k.id}`, lastmod: claimLastmod(k), group: 'claims' as const })),
    ...localizedEvents('en').map((e) => ({ path: eventPath(e, 'en'), lastmod: e.date, group: 'articles' as const })),
    ...postsEn.map((p) => {
      const header = firstImage(p.body ?? '');
      return { path: `/en/cases/abil-sudarman/articles/${p.id}`, lastmod: iso(p.data.publishedDate), images: header ? [header.src] : [], group: 'articles' as const };
    }),
  ];
  entries.push(...english);

  // Tie each page to its other-language twin so the sitemap carries hreflang too.
  const pair = new Map<string, string>();
  for (const r of Object.values(ROUTES)) pair.set(r.id, r.en);
  for (const p of pakar) pair.set(`/pakar/${p.id}`, `/en/experts/${p.id}`);
  for (const k of klaim) pair.set(`/klaim/${k.id}`, `/en/claims/${k.id}`);
  for (const e of EVENTS) pair.set(eventUrl(e), eventPath(localizeEvent(e, 'en'), 'en'));
  for (const p of postsEn) pair.set(`/kasus/abil-sudarman/artikel/${p.id}`, `/en/cases/abil-sudarman/articles/${p.id}`);
  const reverse = new Map([...pair].map(([id, en]) => [en, id]));
  for (const e of entries) {
    const en = pair.get(e.path);
    const id = reverse.get(e.path);
    if (en) e.alternates = { id: e.path, en };
    else if (id) e.alternates = { id, en: e.path };
  }
  return entries;
}
