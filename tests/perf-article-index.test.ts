import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { imageSize } from '../src/lib/header-image';

describe('article index ordering and pinning', () => {
  const c = readFileSync('src/pages/kasus/abil-sudarman/artikel/index.astro', 'utf8');
  it('pins the explainer through a constant, labelled per language', () => {
    expect(c).toContain("const PINNED_POST = 'investigative-report-unpacking-the-credentials-of-abil-sudarman'");
    expect(c).toContain("start: 'Mulai di sini'");
    expect(c).toContain("start: 'Start here'");
    expect(c).toContain('grid-column: 1 / -1');
  });
  it('sorts newest first by the date of the edition shown, and shows that date', () => {
    expect(c).toMatch(/enDates\.get\(p\.id\)[^;]*p\.data\.translationDate/);
    expect(c).toContain('dateOf(b).getTime() - dateOf(a).getTime()');
    expect(c).toContain('<time datetime=');
  });
});

describe('header image size', () => {
  it('reads intrinsic dimensions of a public /img file', async () => {
    const { readdirSync } = await import('node:fs');
    const file = readdirSync('public/img').find((f) => /\.(png|jpe?g|webp)$/i.test(f));
    if (!file) return;
    const size = await imageSize(`/img/${encodeURIComponent(file)}`);
    expect(size?.width).toBeGreaterThan(0);
    expect(size?.height).toBeGreaterThan(0);
  });
  it('returns null for paths outside /img or missing files', async () => {
    expect(await imageSize('https://example.com/a.png')).toBeNull();
    expect(await imageSize('/img/does-not-exist.png')).toBeNull();
  });
});
