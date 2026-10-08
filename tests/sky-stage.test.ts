import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('home sky without a framework runtime', () => {
  it('is an Astro component with the static SVG sky and a hidden canvas in the markup', () => {
    const c = read('src/components/SkyStage.astro');
    expect(c).toContain('aria-hidden="true"');
    expect(c).toContain('<svg class="sky-stage__svg"');
    expect(c).toContain('<canvas class="sky-stage__canvas sky-stage__canvas--hidden"');
    expect(c).toContain("import '../scripts/sky-stage'");
  });
  it('is rendered by the home page with no client directive, so React is not loaded for it', () => {
    const home = read('src/pages/index.astro');
    expect(home).toContain("import SkyStage from '../components/SkyStage.astro'");
    expect(home).toMatch(/<SkyStage sectionIds=\{SECTIONS\} \/>/);
    expect(home).not.toMatch(/<SkyStage[^>]*client:/);
  });
  it('removed the React island and its server-render test', () => {
    expect(existsSync('src/components/SkyStage.tsx')).toBe(false);
    expect(existsSync('tests/sky-stage-ssr.test.tsx')).toBe(false);
  });
  it('loads the WebGL scene lazily, only after the first interaction or a long idle', () => {
    const js = read('src/scripts/sky-stage.ts');
    expect(js).toContain("import('../lib/sky/AbabilScene')");
    expect(js).toMatch(/WAKE_EVENTS = \['pointerdown'/);
    expect(js).toMatch(/IDLE_FALLBACK_MS = 8000/);
    expect(js).toContain("root.dataset.mode = 'webgl'");
  });
  it('hides the SVG sky once WebGL is running', () => {
    expect(read('src/styles/global.css')).toContain(".sky-stage[data-mode='webgl'] .sky-stage__svg { display: none; }");
  });
});

describe('home image delivery', () => {
  it('prioritises the hero image and serves it responsively and compressed', () => {
    const home = read('src/pages/index.astro');
    const hero = home.slice(home.indexOf('src={burungAbabil}'), home.indexOf('</figure>'));
    expect(hero).toContain('fetchpriority="high"');
    expect(hero).toContain('widths={[400, 640]}');
    expect(hero).toMatch(/quality=\{\d+\}/);
  });
  it('gives static assets a long cache lifetime', () => {
    const headers = read('public/_headers');
    for (const p of ['/thumb/*', '/og/*', '/logo-kawal.svg', '/favicon.svg', '/apple-touch-icon.png']) {
      expect(headers, p).toMatch(new RegExp(`${p.replace(/[*.]/g, '\\$&')}\\n\\s+Cache-Control: public, max-age=2592000`));
    }
  });
});
