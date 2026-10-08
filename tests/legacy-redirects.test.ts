import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { legacyTarget, LEGACY_MOVES } from '../src/lib/legacy-redirects';
import worker from '../redirect-worker/worker';

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

describe('redirect worker', () => {
  const call = (url: string) => worker.fetch(new Request(url));
  it('301s to the new domain and keeps the query string', () => {
    const res = call('https://abilsudarman.my.id/artikel/x?utm=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://kawalkepakaran.org/kasus/abil-sudarman/artikel/x?utm=1');
  });
  it('sends unknown paths to the same path on the new domain, never a loop', () => {
    const res = call('https://abilsudarman.my.id/nonexistent');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://kawalkepakaran.org/nonexistent');
  });
  it('sends the root to the new root', () => {
    expect(call('https://abilsudarman.my.id/').headers.get('location')).toBe('https://kawalkepakaran.org/');
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
