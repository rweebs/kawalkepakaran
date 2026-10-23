import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { llmsFull, llmsIndex } from '../src/lib/llms';

const site = { name: 'Kawal Kepakaran', url: 'https://kawalkepakaran.org', description: 'Desc.' };
const claim = {
  id: 'x-gelar', expert: 'Zed', claim: 'Gelar  S3.', claimEn: 'A PhD.', verdict: 'tidak-terbukti' as const, confidence: 'sedang' as const,
  limits: 'Tidak membuktikan niat.', limitsEn: 'Does not prove intent.', reviewedAt: new Date('2026-10-11T00:00:00Z'),
};

describe('llms-full.txt', () => {
  const txt = llmsFull([claim, { ...claim, id: 'a-first', expert: 'Ann', reviewedAt: undefined }], site);
  it('lists each claim in Indonesian with expert, verdict, confidence, limits and URL', () => {
    expect(txt).toContain('### Gelar S3.\n- URL: https://kawalkepakaran.org/klaim/x-gelar\n- Pakar: Zed\n- Putusan: Tidak terbukti\n- Keyakinan: Sedang\n- Ditinjau: 2026-10-11\n- Yang tidak dibuktikan: Tidak membuktikan niat.');
  });
  it('and again in English', () => {
    expect(txt).toContain('### A PhD.\n- URL: https://kawalkepakaran.org/en/claims/x-gelar\n- Expert: Zed\n- Verdict: Not supported\n- Confidence: Medium\n- Reviewed: 2026-10-11\n- What this does not prove: Does not prove intent.');
  });
  it('sorts by expert so the file is stable, and carries the presumption of innocence', () => {
    expect(txt.indexOf('/klaim/a-first')).toBeLessThan(txt.indexOf('/klaim/x-gelar'));
    expect(txt).toMatch(/praduga tak bersalah/);
    expect(txt).toMatch(/presumed innocent/);
  });
  it('the route leaves generated claims out', () => {
    expect(readFileSync('src/pages/llms-full.txt.ts', 'utf8')).toContain('!isGenerated(k)');
  });
  it('llms.txt is generated from the sitemap entries, so every page is listed', () => {
    const idx = llmsIndex([
      { path: '/', label: 'Home', group: 'pages' },
      { path: '/en/cases/abil-sudarman', label: 'Case', group: 'pages' },
      { path: '/klaim/x', label: 'A  claim', group: 'claims' },
      { path: '/klaim/x', label: 'dup', group: 'claims' },
    ], site);
    expect(idx).toContain('- [Home](https://kawalkepakaran.org/)');
    expect(idx).toContain('- [Case](https://kawalkepakaran.org/en/cases/abil-sudarman)');
    expect(idx.match(/\/klaim\/x\)/g)).toHaveLength(1);
    expect(idx).toContain('https://kawalkepakaran.org/llms-full.txt');
    expect(idx).toMatch(/praduga tak bersalah/);
    expect(readFileSync('src/pages/llms.txt.ts', 'utf8')).toContain('sitemapEntries()');
  });
  it('robots.txt names the AI crawlers and allows them', () => {
    const robots = readFileSync('public/robots.txt', 'utf8');
    for (const bot of ['ClaudeBot', 'Claude-SearchBot', 'GPTBot', 'PerplexityBot', 'Google-Extended']) expect(robots).toContain(`User-agent: ${bot}`);
    expect(robots).not.toMatch(/Disallow:\s*\//);
  });
});

describe('_headers for machine-readable files', () => {
  const headers = readFileSync('public/_headers', 'utf8');
  const block = (path: string) => headers.split(/\n\n+/).find((b) => b.startsWith(`${path}\n`)) ?? '';
  it('keeps feeds, JSON, sitemaps and llms files out of the search index', () => {
    for (const p of ['/klaim.json', '/rss.xml', '/en/rss.xml', '/sitemap.xml', '/sitemap-pages.xml', '/sitemap-claims.xml', '/sitemap-articles.xml', '/llms.txt', '/llms-full.txt']) {
      expect(block(p), p).toContain('X-Robots-Tag: noindex');
    }
  });
  it('points the book PDFs at the books page as canonical, without noindex', () => {
    expect(block('/buku/*')).toContain('Link: <https://kawalkepakaran.org/buku>; rel="canonical"');
    expect(block('/buku/*')).not.toContain('X-Robots-Tag');
  });
});
