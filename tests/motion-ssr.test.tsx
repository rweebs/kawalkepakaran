import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// The React motion islands (Reveal, TiltCard, ParallaxHeader) were replaced by server-rendered markup plus Motion's DOM API,
// so article pages ship no framework runtime. This guards against them coming back.
const read = (p: string) => readFileSync(p, 'utf8');

describe('article pages without React motion islands', () => {
  it('removed the React motion components', () => {
    for (const f of ['Reveal', 'TiltCard', 'ParallaxHeader']) expect(existsSync(`src/components/motion/${f}.tsx`), f).toBe(false);
  });
  it('renders the article header as a plain, prioritised <img> with its real size and no client directive', () => {
    const c = read('src/components/PostHeader.astro');
    expect(c).not.toMatch(/client:/);
    expect(c).not.toContain('.tsx');
    expect(c).toContain('fetchpriority="high"');
    expect(c).toContain('decoding="async"');
    expect(c).toContain('imageSize(image.src)');
    expect(c).toContain("prefers-reduced-motion: reduce");
    expect(c).toContain("import('motion')");
  });
  it('renders the article index cards as plain links, revealed by the shared script', () => {
    const c = read('src/pages/kasus/abil-sudarman/artikel/index.astro');
    expect(c).not.toMatch(/client:/);
    expect(c).not.toContain('TiltCard');
    expect(c).toContain('class="card card--link card-link"');
    expect(c).toContain('data-reveal');
    expect(c).toContain('data-reveal-item');
  });
});
