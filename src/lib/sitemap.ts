export interface SitemapEntry { path: string; lastmod?: string; images?: string[] }

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildSitemap(entries: SitemapEntry[], site: string): string {
  const seen = new Set<string>();
  const unique = entries.filter((e) => (seen.has(e.path) ? false : (seen.add(e.path), true)));
  unique.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)));

  const urls = unique.map((e) => {
    if (e.lastmod !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod)) {
      throw new Error(`Sitemap lastmod must be YYYY-MM-DD, got "${e.lastmod}" for ${e.path}`);
    }
    const loc = escapeXml(new URL(e.path, site).toString());
    const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : '';
    const images = (e.images ?? [])
      .map((img) => `<image:image><image:loc>${escapeXml(new URL(img, site).toString())}</image:loc></image:image>`)
      .join('');
    return `  <url><loc>${loc}</loc>${lastmod}${images}</url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
