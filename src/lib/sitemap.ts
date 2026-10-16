export interface SitemapEntry { path: string; lastmod?: string; images?: string[]; /** Both language versions of the page, as paths; emitted as hreflang links. */ alternates?: { id: string; en: string }; /** Which child sitemap lists it (default 'pages'). */ group?: SitemapGroup }

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
    const alt = e.alternates
      ? [['id', e.alternates.id], ['en', e.alternates.en], ['x-default', e.alternates.id]]
          .map(([l, p]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${escapeXml(new URL(p, site).toString())}"/>`).join('')
      : '';
    return `  <url><loc>${loc}</loc>${lastmod}${alt}${images}</url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

/** The child sitemaps behind the index: static pages; experts and claims; articles and timeline events. */
export const SITEMAP_GROUPS = ['pages', 'claims', 'articles'] as const;
export type SitemapGroup = (typeof SITEMAP_GROUPS)[number];
export const sitemapFile = (g: SitemapGroup) => `/sitemap-${g}.xml`;

/** A sitemap index pointing at each child sitemap, with the newest lastmod of its entries. */
export function buildSitemapIndex(children: { path: string; lastmod?: string }[], site: string): string {
  const items = children.map((c) => {
    if (c.lastmod !== undefined && !DAY.test(c.lastmod)) throw new Error(`Sitemap lastmod must be YYYY-MM-DD, got "${c.lastmod}" for ${c.path}`);
    return `  <sitemap><loc>${escapeXml(new URL(c.path, site).toString())}</loc>${c.lastmod ? `<lastmod>${c.lastmod}</lastmod>` : ''}</sitemap>`;
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...items, '</sitemapindex>', ''].join('\n');
}

/** Every URL the sitemap lists, absolute, deduplicated and in sitemap order: for tools that want the flat list whatever the file layout. */
export function sitemapUrls(entries: SitemapEntry[], site: string): string[] {
  return [...buildSitemap(entries, site).matchAll(/<url><loc>([^<]*)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The latest of some dates as YYYY-MM-DD (Dates or YYYY-MM-DD strings; anything else is ignored), or undefined when there are none. */
export function newestDay(dates: readonly (Date | string | undefined | null)[]): string | undefined {
  const days = dates.flatMap((d) => {
    if (d instanceof Date) return Number.isNaN(d.getTime()) ? [] : [d.toISOString().slice(0, 10)];
    return typeof d === 'string' && DAY.test(d) ? [d] : [];
  });
  return days.length ? days.sort().at(-1) : undefined;
}

/** Runs git with the given arguments and returns stdout; throws when git is missing or fails. */
export type GitRunner = (args: string[]) => string;

/**
 * Date of the last commit touching some files, from `git log -1 --format=%cs -- <files>`, memoised.
 *
 * In a shallow clone (actions/checkout defaults to fetch-depth 1, and ci.yml does not override it) the one commit
 * present looks like it added every file, so git would date every page to the latest commit. That is more misleading
 * than the hand-kept map, so a shallow clone, or no git at all, yields undefined and callers fall back to the map.
 */
export function createGitDates(run: GitRunner) {
  let usable: boolean | undefined;
  const cache = new Map<string, string | undefined>();
  const ok = () => {
    if (usable === undefined) {
      try { usable = run(['rev-parse', '--is-shallow-repository']).trim() === 'false'; } catch { usable = false; }
    }
    return usable;
  };
  return (files: readonly string[]): string | undefined => {
    if (!files.length || !ok()) return undefined;
    const key = files.join('\0');
    if (!cache.has(key)) {
      let day: string | undefined;
      try { day = run(['log', '-1', '--format=%cs', '--', ...files]).trim(); } catch { day = undefined; }
      cache.set(key, day && DAY.test(day) ? day : undefined);
    }
    return cache.get(key);
  };
}

/**
 * A page's lastmod: the git date of its source files, never older than the hand-kept fallback date. The fallback is a
 * floor as well because a page's text can also change in files its source list misses (shared UI strings, components).
 */
export function derivedLastmod(files: readonly string[], fallback: string | undefined, gitDate: (files: readonly string[]) => string | undefined): string | undefined {
  return newestDay([gitDate(files), fallback]);
}
