import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('WebGL stages start only when wanted', () => {
  const gate = read('src/scripts/scene-gate.ts');
  it('treats reduced motion and Save-Data as "do not start by yourself"', () => {
    expect(gate).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(gate).toContain('saveData');
    expect(gate).toContain('new IntersectionObserver');
    expect(gate).not.toMatch(/from 'three'/);
  });
  for (const [name, script, component, hook] of [
    ['sky', 'src/scripts/sky-stage.ts', 'src/components/SkyStage.astro', 'data-sky-start'],
    ['bowobharata', 'src/scripts/bowobharata-stage.ts', 'src/components/BowobharataStage.astro', 'data-bb-start'],
  ] as const) {
    it(`${name}: waits for the start button when still, and for the stage to be in view, before importing the scene`, () => {
      const js = read(script);
      const sceneImport = js.search(/import\('\.\.\/lib\/(sky\/AbabilScene|bowobharata\/KurukshetraScene)'\)/);
      expect(sceneImport).toBeGreaterThan(-1);
      for (const call of ['whenStartPressed(', 'whenInView(']) {
        expect(js.indexOf(call), call).toBeGreaterThan(-1);
        expect(js.indexOf(call), call).toBeLessThan(sceneImport);
      }
      expect(js).toContain(`'[${hook}]'`);
    });
    it(`${name}: renders a hidden start button outside the decorative, aria-hidden backdrop`, () => {
      const c = read(component);
      expect(c).toMatch(new RegExp(`<button type="button" class="scene-start" ${hook} hidden>`));
      expect(c.indexOf('<button')).toBeGreaterThan(c.indexOf('</div>'));
    });
  }
});

describe('prefetch', () => {
  it('is opt-in on hover, and the main navigation opts in', () => {
    expect(read('astro.config.mjs')).toContain("prefetch: { prefetchAll: false, defaultStrategy: 'hover' }");
    expect(read('src/layouts/BaseLayout.astro').match(/data-astro-prefetch/g)?.length).toBe(2);
  });
});

describe('LCP image hints', () => {
  it('fetches the article header first and never lazily', () => {
    const c = read('src/components/PostHeader.astro');
    expect(c).toContain('loading="eager" fetchpriority="high"');
  });
  it('fetches the first evidence card first and lazy-loads the rest', () => {
    const c = read('src/pages/kasus/abil-sudarman/bukti.astro');
    expect(c).toContain("loading={lead ? 'eager' : 'lazy'} fetchpriority={lead ? 'high' : undefined}");
  });
});
