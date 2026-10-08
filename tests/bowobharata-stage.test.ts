import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('stage markup', () => {
  const c = read('src/components/BowobharataStage.astro');
  it('is decorative, starts in fallback mode, and holds a hidden canvas', () => {
    expect(c).toContain('aria-hidden="true"');
    expect(c).toContain('data-mode="fallback"');
    expect(c).toContain('<canvas class="bb-stage__canvas bb-stage__canvas--hidden"');
    expect(c).toContain("import '../scripts/bowobharata-stage'");
  });
});

describe('stage script: nothing heavy before an interaction', () => {
  const js = read('src/scripts/bowobharata-stage.ts');
  it('imports three.js and motion only dynamically', () => {
    expect(js).toContain("import('../lib/bowobharata/KurukshetraScene')");
    expect(js).toContain("import('motion')");
    expect(js).not.toMatch(/^import .*from 'three'/m);
    expect(js).not.toMatch(/^import .*from 'motion'/m);
    expect(js).not.toMatch(/^import \{[^}]*\} from '\.\.\/lib\/bowobharata\/KurukshetraScene'/m);
  });
  it('reaches the final dawn shot at the bottom of the page, where the viewport centre never passes the last parva', () => {
    expect(js).toContain("import { atPageBottom } from '../lib/sky/states'");
    expect(js).toMatch(/atPageBottom\(window\.scrollY, window\.innerHeight, document\.documentElement\.scrollHeight\) \? 1 :/);
  });
  it('drives the camera from the real section centres, so each parva gets its own shot whatever its height', () => {
    expect(js).toContain("querySelectorAll<HTMLElement>('.bb-parva')");
    expect(js).toContain('parvaProgress(centers, window.scrollY + window.innerHeight / 2)');
    expect(js).not.toContain('scrollProgress');
  });
  it('wakes on the first real interaction or a long idle, like the home sky', () => {
    expect(js).toMatch(/WAKE_EVENTS = \['pointerdown'/);
    expect(js).toMatch(/IDLE_FALLBACK_MS = 8000/);
  });
  it('falls back to the static backdrop on ?nowebgl, errors and a lost context', () => {
    expect(js).toContain("has('nowebgl')");
    expect(js).toContain("root.dataset.mode = 'fallback'");
    expect(js).toContain('onLost');
  });
  it('skips the motion reveals under reduced motion and pauses when hidden or off-screen', () => {
    expect(js).toMatch(/if \(!reduced\) void revealOnScroll\(\)/);
    expect(js).toContain('visibilitychange');
    expect(js).toContain('IntersectionObserver');
  });
});

describe('stage styles', () => {
  const css = read('src/styles/global.css');
  it('shows a gradient backdrop until WebGL runs, then lets the canvas show', () => {
    expect(css).toContain('.bb-stage {');
    expect(css).toContain(".bb-stage[data-mode='webgl']");
    expect(css).toContain('.bb-stage__canvas--hidden { visibility: hidden; }');
  });
});
