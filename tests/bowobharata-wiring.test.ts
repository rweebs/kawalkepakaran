import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');
const page = () => read('src/pages/bowobharata.astro');

describe('bowobharata page', () => {
  it('exists, is in the menu, and has a lastmod for the sitemap', () => {
    expect(existsSync('src/pages/bowobharata.astro')).toBe(true);
    expect(NAV.map((n) => n.href)).toContain('/bowobharata');
    expect(PAGE_LASTMOD['/bowobharata' as keyof typeof PAGE_LASTMOD]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(read('src/pages/sitemap.xml.ts')).toContain("path: '/bowobharata'");
  });
  it('shows the framing note before the posters, with links to the facts and the right of reply', () => {
    const p = page();
    expect(p.indexOf('bb-note')).toBeGreaterThan(-1);
    expect(p.indexOf('bb-note')).toBeLessThan(p.indexOf('bb-hero'));
    for (const key of ['evidence', 'timeline', 'reply']) expect(p, key).toContain(`localizedPath('${key}', locale)`);
  });
  it('serves the wide poster as the prioritised LCP image and the others lazily, all from astro:assets', () => {
    const p = page();
    expect(p).toContain("from 'astro:assets'");
    for (const f of ['poster-wide.jpg', 'krishna.jpg', 'sengkuni.jpg']) expect(existsSync(`src/assets/bowobharata/${f}`), f).toBe(true);
    const hero = p.slice(p.indexOf('src={wide}'), p.indexOf('</figure>'));
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain('fetchpriority="high"');
    expect(hero).toMatch(/widths=\{\[/);
    expect(hero).toMatch(/quality=\{\d+\}/);
    expect(p.slice(p.indexOf('src={krishna}'), p.indexOf('src={krishna}') + 200)).not.toContain('fetchpriority');
  });
  it('mounts the stage without any client directive and wraps every parva in #parvas', () => {
    const p = page();
    expect(p).toMatch(/<BowobharataStage \/>/);
    expect(p).not.toMatch(/client:/);
    expect(p).toContain('id="parvas"');
    expect(p).toContain('PARVAS.map');
  });
  it('links each parva event to its linimasa page', () => {
    expect(page()).toContain('eventUrl(e)');
  });
});

describe('the page makes no heavy imports', () => {
  it('does not import three or motion anywhere in the page or the stage component', () => {
    for (const f of ['src/pages/bowobharata.astro', 'src/components/BowobharataStage.astro']) {
      expect(read(f), f).not.toMatch(/from 'three'|from 'motion'|KurukshetraScene/);
    }
  });
});
