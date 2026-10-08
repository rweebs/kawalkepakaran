import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');

describe('buku wiring', () => {
  it('has Buku in the menu', () => {
    expect(NAV.filter((n) => n.href === '/buku')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/buku')?.label).toBe('Buku');
  });
  it('has a YYYY-MM-DD lastmod and a sitemap entry', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/buku']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: '/buku'");
  });
  it('registers the buku collection', () => {
    expect(read('src/content.config.ts')).toMatch(/buku:\s*defineCollection/);
  });
  it('caches the pdfs like images', () => {
    expect(read('public/_headers')).toMatch(/\/buku\/\*\s*\n\s*Cache-Control:\s*public, max-age=86400, must-revalidate/);
  });
  it('adds no CSP source for pdfs (they open as plain links, not frames)', () => {
    const csp = read('public/_headers').match(/Content-Security-Policy:([^\n]*)/)?.[1] ?? '';
    expect(csp).toMatch(/frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/www\.tiktok\.com(;|$)/);
  });
  it('the page offers Baca and Unduh links and embeds no viewer', () => {
    const page = read('src/pages/buku.astro');
    expect(page).toContain('sortBuku');
    expect(page).toContain('download');
    expect(page).toContain('Baca');
    expect(page).toContain('Unduh');
    expect(page).not.toMatch(/<iframe|<embed|<object/);
  });
  it('gives every cover the same portrait 3:4 frame, showing the whole page', () => {
    const css = read('src/styles/global.css');
    expect(css).toMatch(/\.buku-cover\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*4/);
    expect(css).toMatch(/\.buku-cover img\s*\{[^}]*object-fit:\s*contain/);
  });
  it('stretches cards to equal height and pins the buttons to the bottom', () => {
    const css = read('src/styles/global.css');
    expect(css).not.toMatch(/\.buku-grid\s*\{[^}]*align-items:\s*start/);
    expect(css).toMatch(/\.buku-actions\s*\{[^}]*margin-top:\s*auto/);
  });
});
