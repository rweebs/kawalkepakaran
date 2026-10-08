import { EVENTS, eventUrl } from '../lib/linimasa';
import type { APIRoute } from 'astro';
import { getBukti, getPosts, getPostsEn } from '../lib/content';
import { ROUTES } from '../i18n';
import { localizedEvents, eventPath } from '../lib/linimasa-locale';
import { firstImage } from '../lib/header-image';
import { buildSitemap, type SitemapEntry } from '../lib/sitemap';
import { PAGE_LASTMOD, SITE } from '../lib/site';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const bukti = await getBukti();
  const postsEn = await getPostsEn();
  const latest = posts.length ? iso(new Date(Math.max(...posts.map((p) => p.data.translationDate.getTime())))) : undefined;

  const entries: SitemapEntry[] = [
    { path: '/', lastmod: latest },
    { path: '/artikel', lastmod: latest },
    { path: '/bukti', lastmod: PAGE_LASTMOD['/bukti'], images: bukti.flatMap((e) => e.data.images.map((i) => i.src)) },
    { path: '/videos', lastmod: PAGE_LASTMOD['/videos'] },
    { path: '/tiktok', lastmod: PAGE_LASTMOD['/tiktok'] },
    { path: '/buku', lastmod: PAGE_LASTMOD['/buku'] },
    { path: '/pagespeed', lastmod: PAGE_LASTMOD['/pagespeed'] },
    { path: '/tentang', lastmod: PAGE_LASTMOD['/tentang'] },
    { path: '/linimasa', lastmod: PAGE_LASTMOD['/linimasa'] },
    { path: '/bowobharata', lastmod: PAGE_LASTMOD['/bowobharata'] },
    ...EVENTS.map((e) => ({ path: eventUrl(e), lastmod: e.date })),
    { path: '/hak-jawab', lastmod: PAGE_LASTMOD['/hak-jawab'] },
    { path: '/disclaimer', lastmod: PAGE_LASTMOD['/disclaimer'] },
    ...posts.map((p) => {
      const header = firstImage(p.body ?? '');
      return { path: `/artikel/${p.id}`, lastmod: iso(p.data.translationDate), images: header ? [header.src] : [] };
    }),
  ];

  // English counterparts: the paired pages, the translated timeline and the translated articles.
  const paired = entries.flatMap((e) => {
    const route = Object.values(ROUTES).find((r) => r.id === e.path);
    return route ? [{ ...e, path: route.en }] : [];
  });
  const english: SitemapEntry[] = [
    ...paired,
    ...localizedEvents('en').map((e) => ({ path: eventPath(e, 'en'), lastmod: e.date })),
    ...postsEn.map((p) => {
      const header = firstImage(p.body ?? '');
      return { path: `/en/articles/${p.id}`, lastmod: iso(p.data.publishedDate), images: header ? [header.src] : [] };
    }),
  ];
  entries.push(...english);

  return new Response(buildSitemap(entries, SITE.url), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
