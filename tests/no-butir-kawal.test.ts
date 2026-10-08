import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(p: string): string[] {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p).flatMap((n) => walk(join(p, n)));
}

const SOURCES = ['src/pages', 'src/components', 'src/layouts', 'src/lib', 'src/content.config.ts', 'scripts', 'README.md']
  .flatMap(walk)
  .filter((f) => /\.(astro|ts|tsx|mjs|md)$/.test(f));

describe('butir kawal is removed entirely', () => {
  it('has no butir kawal pages or content', () => {
    expect(existsSync('src/pages/kawal')).toBe(false);
    expect(existsSync('src/content/questions')).toBe(false);
  });
  for (const f of SOURCES) {
    it(`${f} has no butir kawal wiring or delivery address`, () => {
      const text = readFileSync(f, 'utf8');
      const hits = text.match(/butir kawal|questionSchema|getQuestions|isPublishedQuestion|assertEvidencePublished|DeliveryAddress|placeClaimStars|\bPDKI\b|Regensi Melati|StatusBadge|questionEmail/gi) ?? [];
      expect(hits).toEqual([]);
    });
  }
});
