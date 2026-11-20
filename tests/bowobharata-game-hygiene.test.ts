import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const read = (f: string) => readFileSync(f, 'utf8');
/** Source with its comments taken out, so a rule names code, not prose. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the pure game modules are deterministic (E-5)', () => {
  // The engine and everything it reads run the same for the same input: no randomness and no clock of their own. The 3D
  // layer (world/) reads the frame clock and is left out. `new Date(…)` built from a given day is a calendar sum, not a
  // clock, so only the bare `new Date()` counts.
  const CLOCK = /Math\.random|Date\.now|performance\.now|new Date\(\s*\)/;
  const DIR = 'src/lib/bowobharata-game';
  const files = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.ts')).map((d) => `${DIR}/${d.name}`);

  it('no top-level module of src/lib/bowobharata-game calls Math.random, Date.now, performance.now or new Date()', () => {
    expect(files.length).toBeGreaterThanOrEqual(25);
    expect(files).toContain(`${DIR}/engine.ts`);
    expect(files.some((f) => f.includes('/world/'))).toBe(false);
    for (const f of files) expect(code(read(f)).match(CLOCK)?.[0] ?? null, f).toBeNull();
  });

  it('the rule finds each call, and passes comments and a date built from a given day', () => {
    for (const bad of ['const r = Math.random();', 'const t = Date.now();', 'const t = performance.now();', 'const d = new Date();']) {
      expect(code(bad), bad).toMatch(CLOCK);
    }
    for (const fine of ['// Math.random() is never used', '/* Date.now */ const x = 1;', 'const d = new Date(Date.UTC(y, m, 0));']) {
      expect(code(fine), fine).not.toMatch(CLOCK);
    }
  });
});

describe('the test scripts (E-4)', () => {
  const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>;
  it('npm test runs both suites through test:unit and test:astro, so `npm run test:unit -- <file>` runs one file', () => {
    expect(scripts['test:unit']).toBe('vitest run');
    expect(scripts['test:astro']).toBe('vitest run -c vitest.astro.config.ts');
    expect(scripts.test).toBe('npm run test:unit && npm run test:astro');
    expect(Object.values(scripts).join('\n')).not.toContain('passWithNoTests');
  });
  it('CONTRIBUTING says how to run one file, in both languages', () => {
    const doc = read('CONTRIBUTING.md');
    expect(doc.split('`npx vitest run <file>` or `npm run test:unit -- <file>`').length - 1).toBe(1);
    expect(doc.split('`npx vitest run <berkas>` atau `npm run test:unit -- <berkas>`').length - 1).toBe(1);
  });
});
