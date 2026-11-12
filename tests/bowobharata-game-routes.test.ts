import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { routePath, alternatesForPath } from '../src/i18n';
import { PAGE_LASTMOD } from '../src/lib/site';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';

const read = (f: string) => readFileSync(f, 'utf8');

describe('bowobharata game routes', () => {
  it('routes live under Monitor in both languages', () => {
    expect(routePath('bowobharataGame', 'id')).toBe('/pantau/bowobharata');
    expect(routePath('bowobharataGame', 'en')).toBe('/en/monitor/bowobharata');
    expect(alternatesForPath('/pantau/bowobharata')).toEqual({ id: '/pantau/bowobharata', en: '/en/monitor/bowobharata' });
  });
  it('both pages mount the island client:only with the matching locale', () => {
    const id = read('src/pages/pantau/bowobharata.astro');
    expect(id).toMatch(/<BowobharataGame client:only="react" locale=\{locale\}/);
    expect(id).toMatch(/locale = 'id'/);
    const en = read('src/pages/en/monitor/bowobharata.astro');
    expect(en).toMatch(/<Page locale="en" \/>/);
    expect(en).toContain('pantau/bowobharata.astro');
  });
  it('has a lastmod and sitemap sources, and the entry is listed', () => {
    expect(PAGE_LASTMOD['/pantau/bowobharata']).toMatch(/^2026-11-1[23]$/);
    const sm = read('src/lib/sitemap-entries.ts');
    expect(sm).toMatch(/'\/pantau\/bowobharata': \[[^\]]*BowobharataGame\.tsx[^\]]*bowobharata-game[^\]]*perkara\.json/);
    expect(sm).toContain('ROUTES.bowobharataGame.id');
  });
  it('/pantau links to the game and the case page does too, via copy', () => {
    for (const f of ['src/pages/pantau.astro', 'src/pages/kasus/abil-sudarman/bowobharata.astro']) {
      const t = read(f);
      expect(t, f).toContain("routePath('bowobharataGame', locale)");
      expect(t, f).toContain('GAME_COPY[locale].entryLink');
    }
  });
  it('copy has the link label in both languages', () => {
    for (const l of ['id', 'en'] as const) {
      expect(GAME_COPY[l].entryLink.length).toBeGreaterThan(0);
      expect(GAME_COPY[l].description.length).toBeGreaterThan(0);
    }
  });
  it('Monitor pages still exist beside the subpage', () => {
    expect(existsSync('src/pages/pantau.astro') && existsSync('src/pages/en/monitor.astro')).toBe(true);
  });
});
