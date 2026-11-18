import { beforeAll, describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/react/container-renderer';
import { loadRenderers } from 'astro:container';
import Page from '../src/pages/pantau/bowobharata.astro';
import { BOWO_UI } from '../src/lib/bowobharata-en';
import { CREDITS, CREDITS_EN, MODELS } from '../src/lib/bowobharata/model-credits';

/** Text as Astro escapes it into the page. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Ruling 1 (Task 37): built or rendered, the ID and the EN game page each carry the CC BY credit for MODELS.base. The
// page renders here as each route serves it: /pantau/bowobharata with locale 'id', and /en/monitor/bowobharata, which
// renders the same page with locale="en".
describe('the game page, rendered: the 3D models credited under the stage, in each language', () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
  });

  for (const locale of ['id', 'en'] as const) {
    it(`${locale}: one credits block, after the island and outside it, with the base model's CC BY credit and its source`, async () => {
      const html = await container.renderToString(Page, { props: { locale } });
      const islandEnd = html.lastIndexOf('</astro-island>');
      expect(islandEnd, 'the island').toBeGreaterThan(-1);
      expect(html.split('<section class="bb-credits').length - 1, 'credits blocks').toBe(1);
      const at = html.indexOf('<section class="bb-credits');
      expect(at, 'the credits block comes after the island closes').toBeGreaterThan(islandEnd);
      const block = html.slice(at, html.indexOf('</section>', at) + '</section>'.length);
      // Shown: no hidden attribute and no aria-hidden on the block.
      const open = block.slice(0, block.indexOf('>') + 1);
      expect(open).not.toMatch(/\shidden\b|aria-hidden/);
      expect(block).toContain(`<h2 class="bb-credits__title">${esc(BOWO_UI[locale].credits)}</h2>`);
      const base = (locale === 'en' ? CREDITS_EN : CREDITS).find((c) => c.source === MODELS.base.source)!;
      expect(base.text).toContain('CC BY 3.0');
      expect(block).toContain(esc(base.text));
      expect(block).toContain(`href="${MODELS.base.source}"`);
    });
  }
});
