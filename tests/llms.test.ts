import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { llmsFull } from '../src/lib/llms';

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
  it('llms.txt links both case hubs, the English case pages and llms-full.txt', () => {
    const idx = readFileSync('public/llms.txt', 'utf8');
    for (const p of ['/kasus/abil-sudarman)', '/en/cases/abil-sudarman)', '/en/cases/abil-sudarman/articles)', '/en/cases/abil-sudarman/evidence)', '/en/cases/abil-sudarman/timeline)', '/llms-full.txt)']) {
      expect(idx, p).toContain(`https://kawalkepakaran.org${p}`);
    }
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
