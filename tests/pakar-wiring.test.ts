import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');

describe('pakar and claim pages', () => {
  it.each(['src/pages/pakar/[slug].astro'])('%s lists claims, credentials and a reply link', (p) => {
    const s = read(p);
    expect(s).toContain('klaimForPakar');
    expect(s).toContain('CredentialList');
    expect(s).toMatch(/routePath\('reply'/);
    expect(s).toContain('getStaticPaths');
  });
  it.each(['src/pages/klaim/[slug].astro'])('%s shows verdict, confidence and limits', (p) => {
    const s = read(p);
    for (const k of ['VerdictBadge', 'confidence', 'limits', 'getStaticPaths']) expect(s).toContain(k);
  });
  it.each(['src/pages/pakar/index.astro', 'src/pages/klaim/index.astro'])('%s renders an empty state when there are no entries', (p) => {
    expect(read(p)).toMatch(/length === 0|\.length\s*\?|!\w+\.length/);
  });
  it.each(['experts/[slug]', 'experts/index', 'claims/[slug]', 'claims/index'])('English twin %s reuses the Indonesian page', (f) => {
    expect(read(`src/pages/en/${f}.astro`)).toContain('locale="en"');
  });
  it('the method page defines all four verdicts in both languages', () => {
    const s = read('src/pages/metode.astro');
    for (const v of ['Dikonfirmasi', 'Sebagian', 'Tidak terbukti', 'Belum bisa diverifikasi']) expect(s).toContain(v);
    for (const v of ['Confirmed', 'Partly', 'Not supported', 'Cannot yet be verified']) expect(s).toContain(v);
  });
});
