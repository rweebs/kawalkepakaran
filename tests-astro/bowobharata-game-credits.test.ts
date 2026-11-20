import { beforeAll, describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/react/container-renderer';
import { loadRenderers } from 'astro:container';
import Page from '../src/pages/pantau/bowobharata.astro';
import { BOWO_UI } from '../src/lib/bowobharata-en';
import { CREDITS, CREDITS_EN, MODELS } from '../src/lib/bowobharata/model-credits';

/** Text as Astro escapes it into the page. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** The opening tags of the elements still open at `at` in `html`: the ancestors of whatever starts there. */
function ancestorsAt(html: string, at: number): string[] {
  const open: { name: string; tag: string }[] = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  for (let m = re.exec(html); m && m.index < at; m = re.exec(html)) {
    if (!m[2]) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      const k = open.map((o) => o.name).lastIndexOf(name);
      if (k >= 0) open.length = k;
    } else if (!m[3] && !VOID.has(name)) open.push({ name, tag: m[0] });
  }
  return open.map((o) => o.tag);
}

// Ruling 1 (Task 37): built or rendered, the ID and the EN game page each carry the CC BY credit for MODELS.base. The
// page renders here as each route serves it: /pantau/bowobharata with no props at all (its locale defaults to 'id'), and
// /en/monitor/bowobharata, which renders the same page with locale="en"; ID with an explicit locale too.
describe('the game page, rendered: the 3D models credited under the stage, in each language', () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
  });

  const cases = [
    { name: 'id, as /pantau/bowobharata serves it (no props)', locale: 'id', props: {} },
    { name: 'id, with its locale given', locale: 'id', props: { locale: 'id' } },
    { name: 'en, as /en/monitor/bowobharata serves it', locale: 'en', props: { locale: 'en' } },
  ] as const;
  for (const { name, locale, props } of cases) {
    it(`${name}: one credits block, after the island and outside it, with the base model's CC BY credit and its source`, async () => {
      const html = await container.renderToString(Page, { props });
      const islandEnd = html.lastIndexOf('</astro-island>');
      expect(islandEnd, 'the island').toBeGreaterThan(-1);
      expect(html.split('<section class="bb-credits').length - 1, 'credits blocks').toBe(1);
      const at = html.indexOf('<section class="bb-credits');
      expect(at, 'the credits block comes after the island closes').toBeGreaterThan(islandEnd);
      const block = html.slice(at, html.indexOf('</section>', at) + '</section>'.length);
      // Shown: no hidden attribute and no aria-hidden on the block, nor on any element it sits in.
      const open = block.slice(0, block.indexOf('>') + 1);
      expect(open).not.toMatch(/\shidden\b|aria-hidden/);
      const ancestors = ancestorsAt(html, at);
      expect(ancestors[0], 'the page root').toMatch(/^<html\b/);
      for (const tag of ancestors) expect(tag, 'an element round the credits').not.toMatch(/\shidden\b|aria-hidden="true"|\sinert\b/);
      expect(block).toContain(`<h2 class="bb-credits__title">${esc(BOWO_UI[locale].credits)}</h2>`);
      const base = (locale === 'en' ? CREDITS_EN : CREDITS).find((c) => c.source === MODELS.base.source)!;
      expect(base.text).toContain('CC BY 3.0');
      expect(block).toContain(esc(base.text));
      expect(block).toContain(`href="${MODELS.base.source}"`);
    });
  }

  it('reads the ancestors of a place in the HTML: void and self-closed tags and comments open nothing, closed ones end', () => {
    const html = '<html><body><div hidden><p>x</p><br><img src="a"><!-- <main> --><span/></div><main aria-hidden="true"><i>y</i><section id="s">';
    expect(ancestorsAt(html, html.indexOf('<section'))).toEqual(['<html>', '<body>', '<main aria-hidden="true">']);
    expect(ancestorsAt(html, html.indexOf('<p>x'))).toEqual(['<html>', '<body>', '<div hidden>']);
  });
});
