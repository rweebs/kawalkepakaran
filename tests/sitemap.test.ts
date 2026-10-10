import { describe, it, expect } from 'vitest';
import { buildSitemap } from '../src/lib/sitemap';

const SITE = 'https://kawalkepakaran.org';

describe('buildSitemap', () => {
  it('writes the XML header, urlset and image namespace', () => {
    const xml = buildSitemap([{ path: '/' }], SITE);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
  });
  it('makes absolute URLs and keeps the home page first', () => {
    const xml = buildSitemap([{ path: '/disclaimer' }, { path: '/' }, { path: '/artikel' }], SITE);
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${SITE}/`, `${SITE}/artikel`, `${SITE}/disclaimer`]);
  });
  it('includes lastmod only when given, in YYYY-MM-DD form', () => {
    const xml = buildSitemap([{ path: '/a', lastmod: '2026-10-04' }, { path: '/b' }], SITE);
    expect(xml).toContain('<lastmod>2026-10-04</lastmod>');
    expect((xml.match(/<lastmod>/g) ?? []).length).toBe(1);
  });
  it('rejects a malformed lastmod', () => {
    expect(() => buildSitemap([{ path: '/a', lastmod: '04/10/2026' }], SITE)).toThrow(/lastmod/);
  });
  it('lists page images as absolute URLs', () => {
    const xml = buildSitemap([{ path: '/artikel/x', images: ['/img/a.png'] }], SITE);
    expect(xml).toContain(`<image:image><image:loc>${SITE}/img/a.png</image:loc></image:image>`);
  });
  it('escapes XML special characters', () => {
    const xml = buildSitemap([{ path: '/a?x=1&y=2' }], SITE);
    expect(xml).toContain('/a?x=1&amp;y=2');
    expect(xml).not.toContain('&y=2');
  });
  it('drops duplicate paths', () => {
    const xml = buildSitemap([{ path: '/a' }, { path: '/a' }], SITE);
    expect((xml.match(/<url>/g) ?? []).length).toBe(1);
  });
  it('adds hreflang links when a page has a twin', () => {
    const xml = buildSitemap([{ path: '/tentang', alternates: { id: '/tentang', en: '/en/about' } }], SITE);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${SITE}/en/about"/>`);
    expect(xml).toContain(`hreflang="x-default" href="${SITE}/tentang"`);
  });
});
