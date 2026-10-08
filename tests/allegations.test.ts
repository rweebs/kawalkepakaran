import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { ALLEGATIONS } from '../src/lib/allegations';
import { SITE } from '../src/lib/site';

describe('allegations summary', () => {
  it('every referenced bukti entry exists', () => {
    for (const a of ALLEGATIONS) {
      expect(a.evidence.length, a.id).toBeGreaterThan(0);
      for (const id of a.evidence) expect(existsSync(`src/content/bukti/${id}.json`), `${a.id} -> ${id}`).toBe(true);
    }
  });
  it('ids are unique', () => {
    expect(new Set(ALLEGATIONS.map((a) => a.id)).size).toBe(ALLEGATIONS.length);
  });
  it('wording states claims, never verdicts', () => {
    const text = ALLEGATIONS.map((a) => `${a.claim} ${a.status}`).join(' ');
    expect(text).not.toMatch(/terbukti|penipu|palsu|bohong|pembohong|menipu|ijazah|tidak pernah ada/i);
  });
  it('repo url is the public GitHub repo, and CONTRIBUTING exists', () => {
    expect(SITE.repo).toBe('https://github.com/rweebs/kawalkepakaran');
    expect(existsSync('CONTRIBUTING.md')).toBe(true);
    expect(readFileSync('CONTRIBUTING.md', 'utf8')).toMatch(/src\/content\/bukti/);
  });
});
