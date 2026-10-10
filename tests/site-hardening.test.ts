import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UI } from '../src/i18n/ui';
import { correctionsFor } from '../src/lib/corrections';
import { buildRss } from '../src/lib/feed';

const read = (p: string) => readFileSync(p, 'utf8');

describe('security.txt', () => {
  it('does not expire within 30 days', () => {
    const m = read('public/.well-known/security.txt').match(/^Expires:\s*(.+)$/m);
    expect(m).toBeTruthy();
    expect(new Date(m![1]).getTime()).toBeGreaterThan(Date.now() + 30 * 86400_000);
  });
});

describe('public/_headers', () => {
  const h = read('public/_headers');
  it('sets a CSP with fallback directives', () => {
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", 'upgrade-insecure-requests']) expect(h).toContain(d);
    // Pages also carry Astro's <meta> CSP, which allows each inline <style> and <script> by hash. Browsers enforce both
    // policies, so the header must not restrict styles or scripts on its own: a bare default-src 'self' blocked every inline
    // stylesheet (inlineStylesheets: 'always') and the site rendered unstyled.
    const csp = h.match(/Content-Security-Policy:([^\n]*)/)?.[1] ?? '';
    expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(read('astro.config.mjs')).toMatch(/security:\s*\{\s*csp:/);
  });
  it('caches the fixed-path files', () => {
    for (const p of ['/klaim.json', '/llms.txt', '/manifest.webmanifest', '/robots.txt', '/.well-known/security.txt']) expect(h).toContain(`\n${p}\n`);
  });
  it('does not cache unhashed models for a week', () => expect(h).not.toMatch(/\/models\/\*\n\s+Cache-Control: public, max-age=604800/));
});

describe('UI strings', () => {
  it('has the same keys in Indonesian and English', () => {
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k]));
    const nav = (l: 'id' | 'en') => Object.keys(UI[l]).sort();
    expect(nav('id')).toEqual(nav('en'));
    expect(keys({ ...UI.id, nav: {} }).sort()).toEqual(keys({ ...UI.en, nav: {} }).sort());
  });
});

describe('corrections', () => {
  it('finds corrections for a path, ignoring a trailing slash', () => {
    const log = [{ date: '2026-10-11', path: '/klaim/x', id: 'a', en: 'b' }];
    expect(correctionsFor('/klaim/x/', log)).toHaveLength(1);
    expect(correctionsFor('/klaim/y', log)).toHaveLength(0);
  });
});

describe('feed', () => {
  it('declares the feed language', () => {
    const xml = buildRss([], { url: 'https://x.org', name: 'n', description: 'd' }, '/en/rss.xml', 'en');
    expect(xml).toContain('<language>en</language>');
    expect(xml).toContain('https://x.org/en/rss.xml');
  });
});

describe('external links', () => {
  function* astro(dir: string): Generator<string> {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) yield* astro(p);
      else if (p.endsWith('.astro')) yield p;
    }
  }
  it('never uses rel="sponsored" and keeps noreferrer on target=_blank', () => {
    for (const f of astro('src')) {
      const src = read(f);
      expect(src, f).not.toMatch(/rel="[^"]*sponsored/);
      for (const m of src.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) expect(m[0], f).toMatch(/noopener/);
    }
  });
});

describe('print and motion', () => {
  const css = read('src/styles/global.css');
  it('turns smooth scrolling off for reduced motion', () => expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*html\s*\{\s*scroll-behavior: auto/));
});

describe('manifest', () => {
  const m = JSON.parse(read('public/manifest.webmanifest'));
  it('is installable', () => {
    expect(m.id).toBe('/');
    expect(m.display).toBe('standalone');
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});
