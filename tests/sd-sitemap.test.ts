import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/pages/sitemap.xml.ts', 'utf8');

describe('sitemap route', () => {
  it('always lists the /pakar and /klaim hubs (their English twins come from ROUTES)', () => {
    expect(src).toContain("{ path: '/pakar'");
    expect(src).toContain("{ path: '/klaim'");
    expect(src).not.toContain('hasGenerated');
  });
  it('lists the updates page, whose English twin and hreflang pair come from ROUTES', () => {
    expect(src).toContain('{ path: ROUTES.updates.id');
    expect(src).toContain('for (const r of Object.values(ROUTES)) pair.set(r.id, r.en)');
  });
  it('keeps generated claim and pakar detail pages out', () => {
    expect(src).toContain('allPakar.filter((p) => !isGenerated(p))');
    expect(src).toContain('allKlaim.filter((k) => !isGenerated(k))');
  });
});
