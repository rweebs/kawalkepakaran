import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { findHreflangProblems, findBundleProblems } from '../scripts/check-dist.mjs';

const S = 'https://kawalkepakaran.org';
const page = (alts: string) => `<html><head>${alts}</head><body></body></html>`;
const alt = (l: string, p: string) => `<link rel="alternate" hreflang="${l}" href="${S}${p}">`;

describe('findHreflangProblems', () => {
  it('accepts a reciprocal pair', () => {
    const d = mkdtempSync(join(tmpdir(), 'hl-'));
    mkdirSync(join(d, 'en'));
    writeFileSync(join(d, 'tentang.html'), page(alt('id', '/tentang') + alt('en', '/en/about')));
    writeFileSync(join(d, 'en', 'about.html'), page(alt('id', '/tentang') + alt('en', '/en/about')));
    expect(findHreflangProblems(d)).toEqual([]);
  });
  it('flags a twin that does not exist', () => {
    const d = mkdtempSync(join(tmpdir(), 'hl-'));
    writeFileSync(join(d, 'tentang.html'), page(alt('id', '/tentang') + alt('en', '/en/about')));
    expect(findHreflangProblems(d).join('\n')).toContain('/en/about');
  });
});

describe('findBundleProblems', () => {
  it('flags a chunk over budget', () => {
    const d = mkdtempSync(join(tmpdir(), 'bd-'));
    mkdirSync(join(d, '_astro'));
    writeFileSync(join(d, '_astro', 'big.abc.js'), 'x'.repeat(300_000));
    writeFileSync(join(d, '_astro', 'small.abc.js'), 'x');
    const p = findBundleProblems(d);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('big.abc.js');
  });
});
