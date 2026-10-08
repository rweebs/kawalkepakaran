import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { NAV, PAGE_LASTMOD } from '../src/lib/site';

describe('bukti wiring', () => {
  it('has Bukti in the menu', () => {
    expect(NAV.filter((n) => n.href === '/kasus/abil-sudarman/bukti')).toHaveLength(1);
    expect(NAV.find((n) => n.href === '/kasus/abil-sudarman/bukti')?.label).toBe('Bukti');
  });
  it('has a YYYY-MM-DD lastmod for the sitemap', () => {
    expect((PAGE_LASTMOD as Record<string, string>)['/kasus/abil-sudarman/bukti']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  describe('uniform card dimensions', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    it('gives every thumbnail the same 4:3 frame', () => {
      expect(rule('.bukti-thumb')).toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
    });
    it('shows each whole screenshot inside the frame (contain, filling the frame) instead of cropping it', () => {
      const img = rule('.bukti-thumb img');
      expect(img).toContain('object-fit: contain');
      expect(img).toMatch(/width:\s*100%/);
      expect(img).toMatch(/height:\s*100%/);
      expect(img).not.toMatch(/max-height/);
    });
    it('stretches cards to equal height per row and pins the source block to the bottom', () => {
      expect(rule('.bukti-grid')).not.toMatch(/align-items:\s*start/);
      expect(rule('.bukti-source')).toMatch(/margin-top:\s*auto/);
    });
  });
  it('the page is a real route and lists /bukti in the sitemap source', () => {
    expect(readFileSync('src/pages/kasus/abil-sudarman/bukti.astro', 'utf8')).toContain('groupBukti');
    expect(readFileSync('src/pages/sitemap.xml.ts', 'utf8')).toContain("path: '/kasus/abil-sudarman/bukti'");
  });
});
