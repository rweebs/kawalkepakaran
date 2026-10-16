import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { legacyTarget, LEGACY_MOVES } from '../src/lib/legacy-redirects';

describe('legacyTarget', () => {
  it.each([
    ['/artikel', '/kasus/abil-sudarman/artikel'],
    ['/artikel/some-post', '/kasus/abil-sudarman/artikel/some-post'],
    ['/artikel/', '/kasus/abil-sudarman/artikel'],
    ['/en/articles/x', '/en/cases/abil-sudarman/articles/x'],
    ['/linimasa/somasi-pertama', '/kasus/abil-sudarman/linimasa/somasi-pertama'],
    ['/bowobharata', '/kasus/abil-sudarman/bowobharata'],
    ['/hak-jawab', '/hak-jawab'],
    ['/', '/'],
    ['/en', '/en'],
    ['/nonexistent', '/nonexistent'],
  ])('%s -> %s', (from, to) => expect(legacyTarget(from)).toBe(to));
  it('does not match a longer sibling segment', () => {
    expect(legacyTarget('/artikel-lain')).toBe('/artikel-lain');
  });
});

describe('public/_redirects', () => {
  const body = readFileSync('public/_redirects', 'utf8');
  it('contains one splat rule and one exact rule per legacy move', () => {
    for (const [from, to] of LEGACY_MOVES) {
      expect(body, from).toContain(`${from} ${to} 301`);
      expect(body, from).toContain(`${from}/* ${to}/:splat 301`);
    }
  });
  it('keeps the pre-existing rules', () => {
    expect(body).toContain('/sitemap-index.xml /sitemap.xml 301');
  });
});
