import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NAV } from '../src/lib/site';

function walk(p: string): string[] {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p).flatMap((n) => walk(join(p, n)));
}

describe('the /kawal list page is removed', () => {
  it('has no src/pages/kawal/index.astro', () => {
    expect(existsSync('src/pages/kawal/index.astro')).toBe(false);
  });
  it('is not in the navigation', () => {
    expect(NAV.some((n) => (n.href as string) === '/kawal')).toBe(false);
  });
  it('is not linked from any page or component', () => {
    const files = ['src/pages', 'src/components', 'src/layouts'].flatMap(walk).filter((f) => /\.(astro|tsx)$/.test(f));
    const offenders = files.filter((f) => /["'`]\/kawal["'`]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
