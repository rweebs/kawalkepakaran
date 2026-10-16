import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findJsonLdProblems } from '../scripts/check-jsonld.mjs';

const ld = (o: unknown) => `<script type="application/ld+json">${typeof o === 'string' ? o : JSON.stringify(o)}</script>`;
const site = (body: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'jsonld-'));
  writeFileSync(join(dir, 'index.html'), `<!doctype html><html><head>${body}</head></html>`);
  return dir;
};
const ORG = { '@type': 'Organization', '@id': 'https://kawalkepakaran.org/#organization' };

describe('check-jsonld', () => {
  it('passes a page whose publishers all use the site @id', () => {
    expect(findJsonLdProblems(site(ld({ '@type': 'Article', publisher: ORG }) + ld({ '@type': 'WebPage', hasPart: [{ publisher: ORG }] })))).toEqual([]);
  });
  it('flags invalid JSON', () => {
    expect(findJsonLdProblems(site(ld('{oops'))).join('\n')).toContain('invalid JSON-LD');
  });
  it('flags a publisher with another @id or none', () => {
    const other = findJsonLdProblems(site(ld({ publisher: { '@type': 'Organization', '@id': 'https://www.infraloka.co.id/#organization' } })));
    expect(other.join('\n')).toContain('publisher @id');
    expect(findJsonLdProblems(site(ld({ publisher: { '@type': 'Person', name: 'x' } }))).join('\n')).toContain('(missing)');
  });
  it('flags an image the JSON-LD names that is not in dist', () => {
    const out = findJsonLdProblems(site(ld({ '@type': 'VideoObject', thumbnailUrl: 'https://kawalkepakaran.org/img/gone.jpg' })));
    expect(out.join('\n')).toContain('thumbnailUrl not found');
  });
  it('runs after check-dist in the build and in npm run check', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.build).toMatch(/check-dist\.mjs && node scripts\/check-jsonld\.mjs$/);
    expect(pkg.scripts.check).toContain('check-jsonld.mjs');
  });
});
