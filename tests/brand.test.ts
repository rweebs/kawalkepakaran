import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SITE } from '../src/lib/site';
import { UI } from '../src/i18n/ui';

const read = (p: string) => readFileSync(p, 'utf8');

describe('brand', () => {
  it('uses the new name, domain and repo', () => {
    expect(SITE.name).toBe('Kawal Kepakaran');
    expect(SITE.url).toBe('https://kawalkepakaran.org');
    expect(SITE.repo).toBe('https://github.com/rweebs/kawalkepakaran');
    expect(SITE.legacyUrl).toBe('https://abilsudarman.my.id');
  });
  it('config files point at the new domain and name', () => {
    expect(read('astro.config.mjs')).toContain("site: 'https://kawalkepakaran.org'");
    expect(JSON.parse(read('package.json')).name).toBe('kawal-kepakaran');
    expect(read('wrangler.jsonc')).toContain('"name": "kawalkepakaran"');
    expect(read('.github/workflows/ci.yml')).toContain('SITE_URL: https://kawalkepakaran.org');
    expect(read('.github/workflows/ci.yml')).toContain('branches: [main]');
    expect(read('scripts/check-dist.mjs')).toContain("DEFAULT_SITE = 'https://kawalkepakaran.org'");
  });
  it('shared UI strings no longer name a single person as the site subject', () => {
    for (const l of ['id', 'en'] as const) {
      expect(UI[l].siteTagline).not.toMatch(/Ababil/);
      expect(UI[l].siteDescription).toMatch(/pakar|expert/i);
    }
  });
});
