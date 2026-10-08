import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('strict CSP: no inline style attributes in source', () => {
  const files = ['src/pages', 'src/components', 'src/layouts'].flatMap(walk)
    .filter((f) => /\.(astro|tsx)$/.test(f));
  for (const f of files) {
    it(`${f} has no style="..." attribute`, () => {
      expect(readFileSync(f, 'utf8').match(/\sstyle="/g) ?? []).toEqual([]);
    });
  }
});
