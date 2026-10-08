import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { ROUTES, alternatesForPath } from '../src/i18n';

describe('routes', () => {
  it('moves Abil material under the case path in both languages', () => {
    expect(ROUTES.articles.id).toBe('/kasus/abil-sudarman/artikel');
    expect(ROUTES.articles.en).toBe('/en/cases/abil-sudarman/articles');
    expect(ROUTES.caseHome.id).toBe('/kasus/abil-sudarman');
  });
  it('adds the pakar sections', () => {
    expect(ROUTES.experts).toEqual({ id: '/pakar', en: '/en/experts' });
    expect(ROUTES.claims).toEqual({ id: '/klaim', en: '/en/claims' });
    expect(ROUTES.method).toEqual({ id: '/metode', en: '/en/method' });
  });
  it('every route has a page file in both languages', () => {
    for (const [k, r] of Object.entries(ROUTES)) {
      for (const p of [r.id, r.en]) {
        const base = `src/pages${p === '/' ? '/index' : p}`;
        expect(existsSync(`${base}.astro`) || existsSync(`${base}/index.astro`), `${k}: ${p}`).toBe(true);
      }
    }
  });
  it('pairs both languages', () => {
    expect(alternatesForPath('/pakar')).toEqual({ id: '/pakar', en: '/en/experts' });
  });
});
