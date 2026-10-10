import { EVENTS, eventUrl } from '../lib/linimasa';
import type { APIRoute } from 'astro';
import { getBukti, getPosts, getPostsEn } from '../lib/content';
import { getKlaim, getPakar, isGenerated } from '../lib/pakar';
import { ROUTES } from '../i18n';
import { localizedEvents, localizeEvent, eventPath } from '../lib/linimasa-locale';
import { firstImage } from '../lib/header-image';
import { buildSitemap, type SitemapEntry } from '../lib/sitemap';
import { PAGE_LASTMOD, SITE } from '../lib/site';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const bukti = await getBukti();
  const postsEn = await getPostsEn();
  const allPakar = await getPakar();
  const allKlaim = await getKlaim();
  // Generated entries make the /pakar and /klaim indexes noindex, and a noindex page does not belong in the sitemap.
  const hasGenerated = allPakar.some(isGenerated) || allKlaim.some(isGenerated);
  const pakar = allPakar.filter((p) => !isGenerated(p));
  const klaim = allKlaim.filter((k) => !isGenerated(k));
  const latest = posts.length ? iso(new Date(Math.max(...posts.map((p) => p.data.translationDate.getTime())))) : undefined;

  const entries: SitemapEntry[] = [
    { path: '/', lastmod: latest },
    { path: '/pakar', lastmod: PAGE_LASTMOD['/pakar'] },
    { path: '/klaim', lastmod: PAGE_LASTMOD['/klaim'] },
    { path: '/metode', lastmod: PAGE_LASTMOD['/metode'] },
    { path: '/kasus/abil-sudarman', lastmod: PAGE_LASTMOD['/kasus/abil-sudarman'] },
    ...pakar.map((p) => ({ path: `/pakar/${p.id}`, lastmod: PAGE_LASTMOD['/pakar'] })),
    ...klaim.map((k) => ({ path: `/klaim/${k.id}`, lastmod: PAGE_LASTMOD['/klaim'] })),
    { path: '/kasus/abil-sudarman/artikel', lastmod: latest },
    { path: '/kasus/abil-sudarman/bukti', lastmod: PAGE_LASTMOD['/kasus/abil-sudarman/bukti'], images: bukti.flatMap((e) => e.data.images.map((i) => i.src)) },
    { path: '/videos', lastmod: PAGE_LASTMOD['/videos'] },
    { path: '/tiktok', lastmod: PAGE_LASTMOD['/tiktok'] },
    { path: '/buku', lastmod: PAGE_LASTMOD['/buku'] },
    { path: '/tentang', lastmod: PAGE_LASTMOD['/tentang'] },
    { path: '/manifesto', lastmod: PAGE_LASTMOD['/manifesto'] },
    { path: '/kasus/abil-sudarman/linimasa', lastmod: PAGE_LASTMOD['/kasus/abil-sudarman/linimasa'] },
    { path: '/kasus/abil-sudarman/linimasa-abil', lastmod: PAGE_LASTMOD['/kasus/abil-sudarman/linimasa-abil'] },
    { path: '/kasus/abil-sudarman/bowobharata', lastmod: PAGE_LASTMOD['/kasus/abil-sudarman/bowobharata'] },
    ...EVENTS.map((e) => ({ path: eventUrl(e), lastmod: e.date })),
    { path: '/hak-jawab', lastmod: PAGE_LASTMOD['/hak-jawab'] },
    { path: '/disclaimer', lastmod: PAGE_LASTMOD['/disclaimer'] },
    { path: '/kebijakan', lastmod: PAGE_LASTMOD['/kebijakan'] },
    ...posts.map((p) => {
      const header = firstImage(p.body ?? '');
      return { path: `/kasus/abil-sudarman/artikel/${p.id}`, lastmod: iso(p.data.translationDate), images: header ? [header.src] : [] };
    }),
  ];

  // English counterparts: the paired pages, the translated timeline and the translated articles.
  if (hasGenerated) {
    for (const path of ['/pakar', '/klaim']) {
      const i = entries.findIndex((e) => e.path === path);
      if (i >= 0) entries.splice(i, 1);
    }
  }
  const paired = entries.flatMap((e) => {
    const route = Object.values(ROUTES).find((r) => r.id === e.path);
    return route ? [{ ...e, path: route.en }] : [];
  });
  const english: SitemapEntry[] = [
    ...paired,
    ...pakar.map((p) => ({ path: `/en/experts/${p.id}`, lastmod: PAGE_LASTMOD['/pakar'] })),
    ...klaim.map((k) => ({ path: `/en/claims/${k.id}`, lastmod: PAGE_LASTMOD['/klaim'] })),
    ...localizedEvents('en').map((e) => ({ path: eventPath(e, 'en'), lastmod: e.date })),
    ...postsEn.map((p) => {
      const header = firstImage(p.body ?? '');
      return { path: `/en/cases/abil-sudarman/articles/${p.id}`, lastmod: iso(p.data.publishedDate), images: header ? [header.src] : [] };
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

  return new Response(buildSitemap(entries, SITE.url), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
