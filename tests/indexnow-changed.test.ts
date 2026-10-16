import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { changedUrls, sitemapEntries, childSitemaps, isSitemapIndex, readSitemap, keyIsLive, optionsFromEnv } from '../scripts/indexnow.mjs';
// @ts-ignore plain JS module
import { waybackTargets, saveUrl } from '../scripts/wayback.mjs';

const S = 'https://kawalkepakaran.org';
const now = new Date('2026-10-16T09:00:00Z');
const entries = [
  { loc: `${S}/`, lastmod: '2026-10-16' },
  { loc: `${S}/a`, lastmod: '2026-10-14' },
  { loc: `${S}/b`, lastmod: '2026-10-13' },
  { loc: `${S}/c`, lastmod: '2026-10-15T23:00:00+07:00' },
  { loc: `${S}/d` },
  { loc: `${S}/e`, lastmod: 'kemarin' },
];

describe('changedUrls', () => {
  it('keeps URLs whose lastmod falls within the last two calendar days', () => {
    expect(changedUrls(entries, { now })).toEqual([`${S}/`, `${S}/a`, `${S}/c`]);
  });
  it('honours a different window', () => {
    expect(changedUrls(entries, { now, days: 0 })).toEqual([`${S}/`]);
    expect(changedUrls(entries, { now, days: 3 })).toContain(`${S}/b`);
  });
  it('returns every URL when all is set, including ones without lastmod', () => {
    expect(changedUrls(entries, { now, all: true })).toHaveLength(entries.length);
  });
  it('reads options from the environment', () => {
    expect(optionsFromEnv({})).toEqual({ all: false, days: 2 });
    expect(optionsFromEnv({ INDEXNOW_ALL: 'true', INDEXNOW_DAYS: '5' })).toEqual({ all: true, days: 5 });
    expect(optionsFromEnv({ INDEXNOW_ALL: 'false', INDEXNOW_DAYS: 'x' })).toEqual({ all: false, days: 2 });
  });
});

describe('sitemap reading', () => {
  const urlset = (rows: string) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`;
  it('parses loc and lastmod per <url>', () => {
    expect(sitemapEntries(urlset(`<url><loc>${S}/x</loc><lastmod>2026-10-01</lastmod></url><url><loc>${S}/y</loc></url>`)))
      .toEqual([{ loc: `${S}/x`, lastmod: '2026-10-01' }, { loc: `${S}/y`, lastmod: undefined }]);
  });
  it('recognises a sitemap index and its children', () => {
    const idx = `<sitemapindex><sitemap><loc>${S}/sitemap-pages.xml</loc><lastmod>2026-10-01</lastmod></sitemap><sitemap><loc>${S}/sitemap-claims.xml</loc></sitemap></sitemapindex>`;
    expect(isSitemapIndex(idx)).toBe(true);
    expect(isSitemapIndex(urlset(''))).toBe(false);
    expect(childSitemaps(idx)).toEqual([`${S}/sitemap-pages.xml`, `${S}/sitemap-claims.xml`]);
  });
  it('reads a single urlset or an index with child files from dist', () => {
    const d = mkdtempSync(join(tmpdir(), 'sm-'));
    writeFileSync(join(d, 'index.html'), '<html></html>');
    writeFileSync(join(d, 'sitemap.xml'), urlset(`<url><loc>${S}/</loc></url>`));
    expect(readSitemap(d).entries).toEqual([{ loc: `${S}/`, lastmod: undefined }]);
    writeFileSync(join(d, 'sitemap.xml'), `<sitemapindex><sitemap><loc>${S}/sitemap-pages.xml</loc></sitemap><sitemap><loc>${S}/sitemap-articles.xml</loc></sitemap></sitemapindex>`);
    writeFileSync(join(d, 'sitemap-pages.xml'), urlset(`<url><loc>${S}/</loc><lastmod>2026-10-16</lastmod></url>`));
    writeFileSync(join(d, 'sitemap-articles.xml'), urlset(`<url><loc>${S}/a</loc></url><url><loc>${S}/</loc></url>`));
    const r = readSitemap(d);
    expect(r.entries.map((e: { loc: string }) => e.loc)).toEqual([`${S}/`, `${S}/a`]);
    expect(r.files).toHaveLength(3);
  });
  it('throws a readable error for a missing child sitemap', () => {
    const d = mkdtempSync(join(tmpdir(), 'sm-'));
    writeFileSync(join(d, 'index.html'), '<html></html>');
    writeFileSync(join(d, 'sitemap.xml'), `<sitemapindex><sitemap><loc>${S}/sitemap-claims.xml</loc></sitemap></sitemapindex>`);
    expect(() => readSitemap(d)).toThrow(/sitemap-claims\.xml/);
  });
});

describe('keyIsLive', () => {
  const fake = (status: number, body: string): any => async () => ({ status, text: async () => body });
  it('is true only when /<key>.txt returns 200 with the key', async () => {
    expect(await keyIsLive('abcd1234', S, fake(200, 'abcd1234\n'))).toBe(true);
    expect(await keyIsLive('abcd1234', S, fake(200, '<html>404</html>'))).toBe(false);
    expect(await keyIsLive('abcd1234', S, fake(404, 'abcd1234'))).toBe(false);
    expect(await keyIsLive('abcd1234', S, (async () => { throw new Error('522'); }) as any)).toBe(false);
  });
});

describe('waybackTargets', () => {
  it('puts / and /en first, drops other origins and duplicates, and caps the list', () => {
    const changed = [`${S}/`, 'https://example.com/x', ...Array.from({ length: 20 }, (_, i) => `${S}/p${i}`)];
    const t = waybackTargets(S, changed);
    expect(t).toHaveLength(10);
    expect(t.slice(0, 3)).toEqual([`${S}/`, `${S}/en`, `${S}/p0`]);
    expect(t.some((u: string) => u.includes('example.com'))).toBe(false);
    expect(waybackTargets(S, [], 10)).toEqual([`${S}/`, `${S}/en`]);
  });
  it('builds the Save Page Now URL', () => {
    expect(saveUrl(`${S}/en`)).toBe(`https://web.archive.org/save/${S}/en`);
  });
});
