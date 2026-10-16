import type { APIRoute, GetStaticPaths } from 'astro';
import { sitemapEntries } from '../lib/sitemap-entries';
import { buildSitemap, SITEMAP_GROUPS, type SitemapGroup } from '../lib/sitemap';
import { SITE } from '../lib/site';

/** The child sitemaps: /sitemap-pages.xml, /sitemap-claims.xml (experts and claims), /sitemap-articles.xml (articles and timeline events). */
export const getStaticPaths = (() => SITEMAP_GROUPS.map((group) => ({ params: { group } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const group = params.group as SitemapGroup;
  const entries = (await sitemapEntries()).filter((e) => (e.group ?? 'pages') === group);
  return new Response(buildSitemap(entries, SITE.url), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
