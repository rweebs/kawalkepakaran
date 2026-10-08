import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findEnglishBlocks } from '../src/lib/translation';

const DIR = 'src/content/posts';
const allow: Array<{ contains: string; reason: string }> = JSON.parse(readFileSync('tests/translation-allow.json', 'utf8'));

describe('translations are Indonesian (per paragraph)', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  it('has 15 posts', () => expect(files.length).toBe(15));
  for (const f of files) {
    it(`${f} has no untranslated English block`, () => {
      const blocks = findEnglishBlocks(readFileSync(join(DIR, f), 'utf8'))
        .filter((b) => !allow.some((a) => b.includes(a.contains)));
      expect(blocks).toEqual([]);
    });
  }
});
