import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');

describe('pagespeed wiring', () => {
  it('has Hasil PageSpeed in the menu', () => {
    expect(NAV.filter((n) => n.href === '/pagespeed')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/pagespeed')?.label).toBe('Hasil PageSpeed');
  });
  it('has a YYYY-MM-DD lastmod and a sitemap entry', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/pagespeed']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: '/pagespeed'");
  });
  it('shows both the mobile and the desktop report', () => {
    const page = read('src/pages/pagespeed.astro');
    expect(page).toContain('/img/pagespeed-mobile.png');
    expect(page).toContain('/img/peluncuran-situs-004.png');
    expect(read('src/content/posts/meluncurkan-abilsudarman-my-id-situs-cek-fakta-open-source-dibuat-dengan-tangan-bukan-di-wix.md')).toContain('/img/pagespeed-mobile.png');
  });
  it('states the limits and links the source post', () => {
    const page = read('src/pages/pagespeed.astro');
    expect(page).toContain('Batasan');
    expect(page).toContain('/artikel/meluncurkan-abilsudarman-my-id');
  });
});
