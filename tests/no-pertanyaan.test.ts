import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/pages', 'src/components', 'src/layouts', 'src/lib', 'src/content/questions', 'public', 'README.md'];

function walk(p: string): string[] {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p).flatMap((n) => walk(join(p, n)));
}

describe('"pertanyaan" is removed completely', () => {
  it('has no /pertanyaan route directory', () => {
    expect(existsSync('src/pages/pertanyaan')).toBe(false);
  });
  for (const f of ROOTS.flatMap(walk).filter((f) => /\.(astro|ts|tsx|md|txt|js|svg|mjs)$|_headers$|_redirects$/.test(f))) {
    it(`${f} does not contain the word`, () => {
      expect(readFileSync(f, 'utf8').match(/pertanyaan/gi) ?? []).toEqual([]);
    });
  }
});
