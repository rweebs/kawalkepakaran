import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { findSitemapProblems } from '../scripts/check-dist.mjs';

const SITE = 'https://kawalkepakaran.org';
let dir: string;
const html = (extra = '') => `<html lang="id"><head><title>Judul halaman uji</title>${extra}</head><body></body></html>`;
const sitemap = (paths: string[], lastmod?: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `<url><loc>${SITE}${p}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sitemap-'));
  mkdirSync(join(dir, 'artikel'));
  writeFileSync(join(dir, 'index.html'), html());
  writeFileSync(join(dir, 'artikel.html'), html());
  writeFileSync(join(dir, 'artikel', 'x.html'), html());
  writeFileSync(join(dir, '404.html'), html('<meta name="robots" content="noindex" />'));
});

describe('findSitemapProblems', () => {
  it('passes when the sitemap lists exactly the indexable pages', () => {
    writeFileSync(join(dir, 'sitemap.xml'), sitemap(['/', '/artikel', '/artikel/x'], '2026-10-04'));
    expect(findSitemapProblems(dir)).toEqual([]);
  });
  it('flags a missing sitemap.xml', () => {
    expect(findSitemapProblems(dir).join('\n')).toContain('sitemap.xml');
  });
  it('flags an indexable page missing from the sitemap', () => {
    writeFileSync(join(dir, 'sitemap.xml'), sitemap(['/', '/artikel']));
    expect(findSitemapProblems(dir).join('\n')).toContain('/artikel/x');
  });
  it('flags a sitemap URL that has no page', () => {
    writeFileSync(join(dir, 'sitemap.xml'), sitemap(['/', '/artikel', '/artikel/x', '/hantu']));
    expect(findSitemapProblems(dir).join('\n')).toContain('/hantu');
  });
  it('flags a noindex page listed in the sitemap', () => {
    writeFileSync(join(dir, 'sitemap.xml'), sitemap(['/', '/artikel', '/artikel/x', '/404']));
    expect(findSitemapProblems(dir).join('\n')).toContain('/404');
  });
  it('flags duplicate URLs and a malformed lastmod', () => {
    writeFileSync(join(dir, 'sitemap.xml'), sitemap(['/', '/', '/artikel', '/artikel/x'], '04-10-2026'));
    const out = findSitemapProblems(dir).join('\n');
    expect(out).toContain('duplicate');
    expect(out).toContain('lastmod');
  });
  it('flags a URL on another origin', () => {
    writeFileSync(join(dir, 'sitemap.xml'), `<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url></urlset>`);
    expect(findSitemapProblems(dir).join('\n')).toContain('example.com');
  });
});
