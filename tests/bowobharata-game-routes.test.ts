import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { routePath, alternatesForPath } from '../src/i18n';
import { PAGE_LASTMOD } from '../src/lib/site';
import { GAME_DATA_SRC } from '../src/lib/bowobharata-game/data';
import { perkara, islandData, islandSrc, ISLANDS } from '../src/lib/pantau-props';
import { kategoriKey } from '../src/lib/perkara';
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
    expect(PAGE_LASTMOD['/pantau/bowobharata']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
  it('descriptions fit a search snippet', () => {
    for (const l of ['id', 'en'] as const) expect(GAME_COPY[l].description.length).toBeLessThanOrEqual(160);
  });
  it('game data endpoint carries no category E entries and stays small', () => {
    expect(ISLANDS).toContain('bowobharata-game');
    const d = islandData('bowobharata-game') as { chapters: { entries: { id: string }[] }[] };
    const eIds = new Set(perkara.terlapor.filter((t) => kategoriKey(t.kategori) === 'E').map((t) => t.id));
    expect(eIds.size).toBeGreaterThan(0);
    for (const c of d.chapters) for (const e of c.entries) expect(eIds.has(e.id)).toBe(false);
    expect(JSON.stringify(d).length).toBeLessThan(175_000);
  });
  it('the island fetches the endpoint and the page has a server fallback and sized posters', () => {
    expect(read('src/components/BowobharataGame.tsx')).toContain('GAME_DATA_SRC');
    expect(read('src/pages/pantau/bowobharata.astro')).toMatch(/slot="fallback"[\s\S]*routePath\('bowobharata'/);
    expect(read('src/pages/pantau/bowobharata.astro')).toContain("widths: [400, 640]");
  });
  it('/pantau note uses the page\'s own terms, not "dossier"', () => {
    for (const l of ['id', 'en'] as const) expect(GAME_COPY[l].monitorNote).not.toMatch(/dossier|dosir/i);
  });
  it('GAME_DATA_SRC is the endpoint the page serves', () => {
    expect(GAME_DATA_SRC).toBe(islandSrc('bowobharata-game'));
  });
  it('the case page renders entryNote beside the button', () => {
    expect(read('src/pages/kasus/abil-sudarman/bowobharata.astro')).toContain('GAME_COPY[locale].entryNote');
  });
  it('descriptions keep the allegation qualifier and avoid "dossier"', () => {
    expect(GAME_COPY.en.description).toContain('not police findings');
    expect(GAME_COPY.id.description).toContain('bukan temuan polisi');
    for (const l of ['id', 'en'] as const) expect(GAME_COPY[l].description).not.toMatch(/dossier|dosir/i);
  });
});
