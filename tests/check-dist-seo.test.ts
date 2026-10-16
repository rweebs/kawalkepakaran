import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { findCanonicalProblems, findInternalLinkProblems, findSitemapProblems, findLegalGuardProblems, generatedEntries, isNoindex } from '../scripts/check-dist.mjs';

const S = 'https://kawalkepakaran.org';
const NOINDEX = '<meta name="robots" content="noindex">';
const page = (head = '', body = '') => `<html lang="id"><head><title>Judul halaman uji</title>${head}</head><body>${body}</body></html>`;
const canon = (p: string) => `<link rel="canonical" href="${S}${p}">`;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'seo-'));
  mkdirSync(join(dir, 'artikel'));
  writeFileSync(join(dir, 'index.html'), page(canon('/')));
  writeFileSync(join(dir, 'artikel.html'), page(canon('/artikel')));
  writeFileSync(join(dir, 'artikel', 'x.html'), page(canon('/artikel/x')));
  writeFileSync(join(dir, '404.html'), page(NOINDEX));
});

describe('isNoindex', () => {
  it('reads both self-closing and plain robots metas', () => {
    expect(isNoindex(NOINDEX)).toBe(true);
    expect(isNoindex('<meta name="robots" content="noindex, follow" />')).toBe(true);
    expect(isNoindex('<meta name="robots" content="index">')).toBe(false);
  });
});

describe('findCanonicalProblems', () => {
  it('accepts self-canonicals without a trailing slash or .html, and skips noindex pages', () => {
    expect(findCanonicalProblems(dir)).toEqual([]);
  });
  it('flags a missing canonical', () => {
    writeFileSync(join(dir, 'artikel.html'), page());
    expect(findCanonicalProblems(dir).join('\n')).toContain('found 0');
  });
  it('flags a trailing slash, .html, another origin and a canonical pointing elsewhere', () => {
    writeFileSync(join(dir, 'artikel.html'), page(canon('/artikel/')));
    writeFileSync(join(dir, 'artikel', 'x.html'), page(canon('/artikel/x.html')));
    writeFileSync(join(dir, 'index.html'), page('<link rel="canonical" href="https://www.kawalkepakaran.org/">'));
    const out = findCanonicalProblems(dir).join('\n');
    expect(out).toContain('trailing slash');
    expect(out).toContain('.html');
    expect(out).toContain('is not on https://kawalkepakaran.org');
    writeFileSync(join(dir, 'artikel.html'), page(canon('/')));
    expect(findCanonicalProblems(dir).join('\n')).toContain('is not the page itself');
  });
});

describe('findInternalLinkProblems', () => {
  it('accepts clean internal links, the root, fragments, external and mailto links', () => {
    writeFileSync(join(dir, 'index.html'), page(canon('/'), '<a href="/">r</a><a href="/artikel">a</a><a href="/artikel/x?q=1#t">x</a><a href="#main">m</a><a href="https://example.com/a/">e</a><a href="mailto:a@b.c">m</a><link href="/feed/">'));
    expect(findInternalLinkProblems(dir)).toEqual([]);
  });
  it('flags internal links ending in "/" or ".html", absolute or relative', () => {
    writeFileSync(join(dir, 'index.html'), page(canon('/'), `<a class="x" href="/artikel/">a</a><a href='${S}/artikel/x.html'>b</a><a href="artikel/">c</a>`));
    const out = findInternalLinkProblems(dir);
    expect(out).toHaveLength(3);
    expect(out.join('\n')).toContain('/artikel/x.html');
  });
});

describe('findSitemapProblems with a sitemap index', () => {
  const urlset = (paths: string[]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${S}${p}</loc><lastmod>2026-10-15</lastmod></url>`).join('')}</urlset>`;
  const index = (children: string[]) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${children.map((c) => `<sitemap><loc>${S}${c}</loc></sitemap>`).join('')}</sitemapindex>`;
  it('reads the child sitemaps from dist', () => {
    writeFileSync(join(dir, 'sitemap.xml'), index(['/sitemap-pages.xml', '/sitemap-articles.xml']));
    writeFileSync(join(dir, 'sitemap-pages.xml'), urlset(['/', '/artikel']));
    writeFileSync(join(dir, 'sitemap-articles.xml'), urlset(['/artikel/x']));
    expect(findSitemapProblems(dir)).toEqual([]);
  });
  it('flags a missing child, a page left out, and a noindex page listed in a child', () => {
    writeFileSync(join(dir, 'sitemap.xml'), index(['/sitemap-pages.xml', '/sitemap-claims.xml']));
    writeFileSync(join(dir, 'sitemap-pages.xml'), urlset(['/', '/404']));
    const out = findSitemapProblems(dir).join('\n');
    expect(out).toContain('child sitemap missing /sitemap-claims.xml');
    expect(out).toContain('indexable page not in sitemap /artikel');
    expect(out).toContain('noindex page listed /404');
  });
  it('does not require the 404 pages, even if one lost its noindex', () => {
    mkdirSync(join(dir, 'en'));
    writeFileSync(join(dir, 'en', '404.html'), page());
    writeFileSync(join(dir, 'sitemap.xml'), urlset(['/', '/artikel', '/artikel/x']));
    expect(findSitemapProblems(dir)).toEqual([]);
  });
  it('rejects a sitemap that is neither a urlset nor an index', () => {
    writeFileSync(join(dir, 'sitemap.xml'), '<rss></rss>');
    expect(findSitemapProblems(dir).join('\n')).toContain('neither');
  });
});

describe('findLegalGuardProblems', () => {
  let content: string;
  const entry = (coll: string, id: string, data: object, sub = 'generated') => {
    mkdirSync(join(content, coll, sub), { recursive: true });
    writeFileSync(join(content, coll, sub, `${id}.json`), JSON.stringify(data));
  };
  const write = (rel: string, html: string) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), html);
  };
  beforeEach(() => {
    content = mkdtempSync(join(tmpdir(), 'content-'));
    entry('pakar', 'orang-a', { name: 'A', source: 'arsip' });
    entry('pakar', 'pakar-asli', { name: 'B' }, '.');
    entry('klaim', 'orang-a--dok', { pakar: 'orang-a', source: 'arsip' });
    write('pakar/orang-a.html', page(NOINDEX));
    write('en/experts/orang-a.html', page(NOINDEX));
    write('klaim/orang-a--dok.html', page(NOINDEX));
    write('en/claims/orang-a--dok.html', page(NOINDEX));
    write('pakar/pakar-asli.html', page(canon('/pakar/pakar-asli')));
    write('arsip.html', page(NOINDEX));
    write('arsip/artikel/x.html', page(NOINDEX));
    write('en/archive.html', page(NOINDEX));
  });
  it('lists only entries with "source": "arsip", with their id and both locales', () => {
    const g = generatedEntries(content);
    expect(g.map((e: { id: string }) => e.id).sort()).toEqual(['orang-a', 'orang-a--dok']);
    expect(g.find((e: { id: string }) => e.id === 'orang-a')?.paths).toEqual(['/pakar/orang-a', '/en/experts/orang-a']);
  });
  it('passes when every generated and archive page is noindex (curated pages may be indexable)', () => {
    expect(findLegalGuardProblems(dir, content)).toEqual([]);
  });
  it('fails loudly when a generated profile or claim becomes indexable', () => {
    write('en/experts/orang-a.html', page(canon('/en/experts/orang-a')));
    write('klaim/orang-a--dok.html', page(canon('/klaim/orang-a--dok')));
    const out = findLegalGuardProblems(dir, content);
    expect(out).toHaveLength(2);
    expect(out.every((p: string) => p.startsWith('LEGAL GUARD'))).toBe(true);
  });
  it('fails when an archive page becomes indexable', () => {
    write('arsip/artikel/x.html', page(canon('/arsip/artikel/x')));
    write('en/archive.html', page(canon('/en/archive')));
    expect(findLegalGuardProblems(dir, content).join('\n')).toMatch(/\/arsip\/artikel\/x[\s\S]*\/en\/archive|\/en\/archive[\s\S]*\/arsip\/artikel\/x/);
  });
  it('fails when a published generated entry has no page to check', () => {
    entry('pakar', 'orang-b', { name: 'C', source: 'arsip' });
    entry('pakar', 'orang-c', { name: 'D', source: 'arsip', draft: true });
    const out = findLegalGuardProblems(dir, content).join('\n');
    expect(out).toContain('/pakar/orang-b');
    expect(out).not.toContain('orang-c');
  });
});
