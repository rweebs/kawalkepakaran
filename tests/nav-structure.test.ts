import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { NAV, NAV_GROUPS, isActive } from '../src/lib/site';

const read = (p: string) => readFileSync(p, 'utf8');

describe('menu structure', () => {
  it('has seven top-level entries in reading order, with Hak jawab always visible', () => {
    expect(NAV_GROUPS.map((e) => e.label)).toEqual(['Pakar', 'Cek klaim', 'Metode', 'Kasus', 'Media', 'Tentang', 'Hak jawab']);
    const hakJawab = NAV_GROUPS.find((e) => e.label === 'Hak jawab');
    expect(hakJawab && 'href' in hakJawab ? hakJawab.href : null).toBe('/hak-jawab');
  });
  it('groups media and about links, none empty', () => {
    const group = (label: string) => NAV_GROUPS.find((e) => e.label === label) as { items: { href: string }[] };
    expect(group('Media').items.map((i) => i.href)).toEqual(['/videos', '/tiktok', '/buku']);
    expect(group('Kasus').items.map((i) => i.href)).toEqual([
      '/kasus/abil-sudarman/artikel', '/kasus/abil-sudarman/bukti', '/kasus/abil-sudarman/linimasa', '/kasus/abil-sudarman/bowobharata',
    ]);
    expect(group('Tentang').items.map((i) => i.href)).toEqual(['/tentang', '/#kontribusi', '/disclaimer']);
    for (const e of NAV_GROUPS) if ('items' in e) expect(e.items.length, e.label).toBeGreaterThan(0);
  });
  it('lists each page exactly once and every link points at a real page or anchor', () => {
    const hrefs = NAV.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const h of hrefs) {
      if (h === '/#kontribusi') {
        expect(read('src/pages/index.astro')).toContain('id="kontribusi"');
        continue;
      }
      expect(existsSync(`src/pages${h}.astro`) || existsSync(`src/pages${h}/index.astro`), h).toBe(true);
    }
  });
});

describe('active link', () => {
  it('matches the exact path or a child path only', () => {
    expect(isActive('/artikel', '/artikel')).toBe(true);
    expect(isActive('/artikel/some-post', '/artikel')).toBe(true);
    expect(isActive('/linimasa/somasi-pertama', '/linimasa')).toBe(true);
    expect(isActive('/bukti', '/buku')).toBe(false);
    expect(isActive('/tiktok-lain', '/tiktok')).toBe(false);
  });
  it('never marks an anchor link active', () => {
    expect(isActive('/', '/#kontribusi')).toBe(false);
  });
});

describe('menu markup and styles', () => {
  it('renders groups as native details so they work without JavaScript, and marks the active group', () => {
    const layout = read('src/layouts/BaseLayout.astro');
    expect(layout).toContain('navFor(locale)');
    expect(layout).toContain('<details class="nav__group"');
    expect(layout).not.toContain('name="nav-group"');
    expect(layout).toContain("'is-active'");
    expect(layout).toContain('isActive(path');
  });
  it('scopes the hamburger button rules to the direct summary so group buttons are not hidden', () => {
    const css = read('src/styles/global.css');
    expect(css).toMatch(/\.nav__menu > summary \{ display: none;/);
    expect(css).not.toMatch(/\.nav__menu summary \{/);
  });
  it('flattens the groups into headed sections inside the hamburger panel', () => {
    const css = read('src/styles/global.css');
    expect(css).toMatch(/@media \(max-width: 720px\) \{\s*\.nav__group > summary \{[^}]*pointer-events: none/);
    expect(read('src/scripts/nav-menu.ts')).toMatch(/g\.open = narrow\.matches/);
  });
});
