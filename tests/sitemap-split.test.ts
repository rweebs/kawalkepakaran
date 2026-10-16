import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSitemapIndex, createGitDates, derivedLastmod, newestDay, sitemapFile, sitemapUrls, SITEMAP_GROUPS } from '../src/lib/sitemap';

const SITE = 'https://kawalkepakaran.org';
const read = (p: string) => readFileSync(p, 'utf8');

describe('sitemap index', () => {
  it('lists each child sitemap with its lastmod', () => {
    const xml = buildSitemapIndex(SITEMAP_GROUPS.map((g) => ({ path: sitemapFile(g), lastmod: g === 'pages' ? '2026-10-11' : undefined })), SITE);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<sitemap><loc>${SITE}/sitemap-pages.xml</loc><lastmod>2026-10-11</lastmod></sitemap>`);
    expect(xml).toContain(`<sitemap><loc>${SITE}/sitemap-claims.xml</loc></sitemap>`);
    expect(xml).toContain(`<sitemap><loc>${SITE}/sitemap-articles.xml</loc></sitemap>`);
    expect(xml).not.toContain('<urlset');
  });
  it('rejects a malformed lastmod', () => {
    expect(() => buildSitemapIndex([{ path: '/sitemap-pages.xml', lastmod: '2026-10' }], SITE)).toThrow(/lastmod/);
  });
  it('gives the flat URL list, deduplicated and unescaped', () => {
    expect(sitemapUrls([{ path: '/b' }, { path: '/' }, { path: '/b' }, { path: '/a?x=1&y=2' }], SITE)).toEqual([`${SITE}/`, `${SITE}/a?x=1&y=2`, `${SITE}/b`]);
  });
  it('splits pages, experts and claims, and articles and timeline events into the child sitemaps', () => {
    const src = read('src/lib/sitemap-entries.ts');
    expect(src).toMatch(/path: `\/pakar\/\$\{p\.id\}`[^\n]*group: 'claims'/);
    expect(src).toMatch(/path: `\/en\/claims\/\$\{k\.id\}`[^\n]*group: 'claims'/);
    expect(src).toMatch(/path: eventUrl\(e\)[^\n]*group: 'articles'/);
    expect(src).toMatch(/artikel\/\$\{p\.id\}`[^\n]*group: 'articles'/);
    expect(read('src/pages/sitemap-[group].xml.ts')).toContain('SITEMAP_GROUPS.map');
  });
  it('serves /sitemap.xml as a <sitemapindex> now that check-dist, indexnow and the monitor read an index', () => {
    expect(read('src/pages/sitemap.xml.ts')).toContain('export const SITEMAP_AS_INDEX = true;');
  });
  it('serves every sitemap file as XML and keeps it out of the search index', () => {
    const headers = read('public/_headers');
    for (const f of ['/sitemap.xml', ...SITEMAP_GROUPS.map(sitemapFile)]) {
      const block = headers.split(/\n\n+/).find((b) => b.startsWith(`${f}\n`)) ?? '';
      expect(block, f).toContain('Content-Type: application/xml; charset=utf-8');
      expect(block, f).toContain('X-Robots-Tag: noindex');
    }
  });
});

describe('lastmod derivation', () => {
  it('picks the newest of dates and YYYY-MM-DD strings, ignoring the rest', () => {
    expect(newestDay([new Date('2026-10-05T10:00:00Z'), '2026-10-07', undefined, null, 'nope', new Date('x')])).toBe('2026-10-07');
    expect(newestDay([])).toBeUndefined();
  });
  it('uses git dates only in a full clone, memoised per file list', () => {
    const calls: string[][] = [];
    const git = createGitDates((args) => { calls.push(args); return args[0] === 'rev-parse' ? 'false\n' : '2026-10-12\n'; });
    expect(git(['src/pages/metode.astro'])).toBe('2026-10-12');
    expect(git(['src/pages/metode.astro'])).toBe('2026-10-12');
    expect(calls).toEqual([['rev-parse', '--is-shallow-repository'], ['log', '-1', '--format=%cs', '--', 'src/pages/metode.astro']]);
    expect(git([])).toBeUndefined();
  });
  it('ignores git in a shallow clone, where every file would get the latest commit date', () => {
    const git = createGitDates((args) => (args[0] === 'rev-parse' ? 'true' : '2026-10-16'));
    expect(git(['src/pages/metode.astro'])).toBeUndefined();
  });
  it('ignores git when it is missing or prints something other than a date', () => {
    expect(createGitDates(() => { throw new Error('ENOENT'); })(['a'])).toBeUndefined();
    expect(createGitDates((args) => (args[0] === 'rev-parse' ? 'false' : ''))(['untracked'])).toBeUndefined();
    expect(createGitDates((args) => (args[0] === 'rev-parse' ? 'false' : '16/10/2026'))(['a'])).toBeUndefined();
  });
  it('treats the hand-kept date as fallback and floor', () => {
    expect(derivedLastmod(['a'], '2026-10-04', () => '2026-10-10')).toBe('2026-10-10');
    expect(derivedLastmod(['a'], '2026-10-10', () => '2026-10-04')).toBe('2026-10-10');
    expect(derivedLastmod(['a'], '2026-10-04', () => undefined)).toBe('2026-10-04');
  });
  it('dates static pages from git, experts from their claims, and the home page from claims as well as posts', () => {
    const src = read('src/lib/sitemap-entries.ts');
    expect(src).toContain("execFileSync('git'");
    expect(src).toContain("{ path: '/metode', lastmod: pageLastmod('/metode') }");
    expect(src).toMatch(/expertLastmod = [\s\S]*k\.data\.pakar === p\.id[\s\S]*\?\? pageLastmod\('\/pakar'\)/);
    expect(src).toContain('path: `/en/experts/${p.id}`, lastmod: expertLastmod(p)');
    expect(src).toContain("{ path: '/', lastmod: newestDay([latest, claimsLastmod]) }");
    expect(src).toContain('const claimDates = (k: Klaim) => [k.data.reviewedAt, k.data.reply?.receivedAt]');
    expect(src).not.toContain("lastmod: PAGE_LASTMOD['/pakar']");
  });
});
