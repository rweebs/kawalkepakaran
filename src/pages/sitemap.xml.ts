import type { APIRoute } from 'astro';
import { sitemapEntries } from '../lib/sitemap-entries';
import { buildSitemap, buildSitemapIndex, newestDay, sitemapFile, SITEMAP_GROUPS } from '../lib/sitemap';
import { SITE } from '../lib/site';

/**
 * When true, /sitemap.xml is a <sitemapindex> over /sitemap-pages.xml, /sitemap-claims.xml and /sitemap-articles.xml.
 * It stays a flat <urlset> of every URL until the readers of dist/sitemap.xml follow an index: scripts/check-dist.mjs
 * (findSitemapProblems wants <urlset>), scripts/indexnow.mjs (submit reads <url><loc>) and the '<urlset' greps in
 * .github/workflows/monitor.yml. The child sitemaps are published either way, so flipping this is the only change here.
 */
export const SITEMAP_AS_INDEX = false;

export const GET: APIRoute = async () => {
  const entries = await sitemapEntries();
  const xml = SITEMAP_AS_INDEX
    ? buildSitemapIndex(SITEMAP_GROUPS.map((g) => ({
        path: sitemapFile(g),
        lastmod: newestDay(entries.filter((e) => (e.group ?? 'pages') === g).map((e) => e.lastmod)),
      })), SITE.url)
    : buildSitemap(entries, SITE.url);
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
