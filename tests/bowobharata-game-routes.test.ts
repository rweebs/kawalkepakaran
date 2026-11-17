import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { routePath, alternatesForPath } from '../src/i18n';
import { PAGE_LASTMOD } from '../src/lib/site';
import { GAME_DATA_SRC } from '../src/lib/bowobharata-game/data';
import { perkara, islandData, islandSrc, ISLANDS } from '../src/lib/pantau-props';
import { kategoriKey } from '../src/lib/perkara';
import { GAME_COPY } from '../src/lib/bowobharata-game/copy';
import { BOWO_UI } from '../src/lib/bowobharata-en';
import { CREDITS, CREDITS_EN, MODELS } from '../src/lib/bowobharata/model-credits';

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
  it('credits the 3D models under the stage, outside the island: CREDITS or CREDITS_EN by locale, under BOWO_UI[locale].credits', () => {
    const page = read('src/pages/pantau/bowobharata.astro');
    // The texts come from model-credits.ts: imported, never copied into the page.
    expect(page).toContain("import { CREDITS, CREDITS_EN } from '../../lib/bowobharata/model-credits';");
    for (const c of [...CREDITS, ...CREDITS_EN]) expect(page).not.toContain(c.text);
    expect(page).toContain("const credits = locale === 'en' ? CREDITS_EN : CREDITS;");
    // One block, after the island's closing tag: under the stage, never inside the island or its fallback.
    const island = page.indexOf('</BowobharataGame>');
    const at = page.indexOf('<section class="bb-credits muted"');
    expect(island).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(island);
    expect(page.match(/<section class="bb-credits/g)).toHaveLength(1);
    expect(page.match(/credits\.map\(/g)).toHaveLength(1);
    const block = page.slice(at, page.indexOf('</section>', at));
    expect(block).toContain('aria-label={BOWO_UI[locale].creditsLabel}');
    expect(block).toContain('<h2 class="bb-credits__title">{BOWO_UI[locale].credits}</h2>');
    // Each entry renders its text and its source link, as on the case page.
    expect(block).toContain('{credits.map((c) => <li>{c.text} <a href={c.source} rel="noopener noreferrer">{BOWO_UI[locale].source}</a></li>)}');
    // So the ID page and the EN page (which renders this one with locale="en") each name the author and the licence of
    // every model whose licence asks for it: MODELS.base, CC BY 3.0.
    const ccBy = Object.values(MODELS).filter((m) => m.license === 'CC BY 3.0');
    expect(ccBy).toContain(MODELS.base);
    for (const locale of ['id', 'en'] as const) {
      const credits = locale === 'en' ? CREDITS_EN : CREDITS;
      for (const m of ccBy) {
        const credit = credits.find((c) => c.source === m.source);
        expect(credit, `${locale} ${m.source}`).toBeDefined();
        expect(credit!.text).toContain(m.author);
        expect(credit!.text).toContain(m.license);
      }
      expect(BOWO_UI[locale].credits.length).toBeGreaterThan(0);
      expect(BOWO_UI[locale].source.length).toBeGreaterThan(0);
    }
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
