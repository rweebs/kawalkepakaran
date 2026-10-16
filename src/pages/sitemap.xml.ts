import type { APIRoute } from 'astro';
import { sitemapEntries } from '../lib/sitemap-entries';
import { buildSitemap, buildSitemapIndex, newestDay, sitemapFile, SITEMAP_GROUPS } from '../lib/sitemap';
import { SITE } from '../lib/site';

/**
 * When true, /sitemap.xml is a <sitemapindex> over /sitemap-pages.xml, /sitemap-claims.xml and /sitemap-articles.xml.
 * Every reader of dist/sitemap.xml follows an index: scripts/check-dist.mjs (findSitemapProblems), scripts/indexnow.mjs
 * (readSitemap) and the '<urlset|<sitemapindex' greps in the workflows. Set false to go back to one flat <urlset>.
 */
export const SITEMAP_AS_INDEX = true;

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
