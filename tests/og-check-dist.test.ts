import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { findOgImageProblems, OG_MAX_BYTES } from '../scripts/check-dist.mjs';

let dir: string;
const page = (og: string) => `<html lang="id"><head><meta property="og:image" content="${og}" /></head><body></body></html>`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dist-og-'));
  mkdirSync(join(dir, 'og', 'klaim'), { recursive: true });
  writeFileSync(join(dir, 'og', 'site-id.jpg'), Buffer.alloc(1000));
  writeFileSync(join(dir, 'og', 'klaim', 'big-id.jpg'), Buffer.alloc(OG_MAX_BYTES + 1));
});

describe('findOgImageProblems', () => {
  it('passes a page whose og:image exists and is small', () => {
    writeFileSync(join(dir, 'index.html'), page('https://kawalkepakaran.org/og/site-id.jpg'));
    expect(findOgImageProblems(dir)).toEqual([]);
  });
  it('accepts a root-relative og:image', () => {
    writeFileSync(join(dir, 'index.html'), page('/og/site-id.jpg'));
    expect(findOgImageProblems(dir)).toEqual([]);
  });
  it('flags a missing og:image file', () => {
    writeFileSync(join(dir, 'index.html'), page('https://kawalkepakaran.org/og/klaim/nope-id.jpg'));
    expect(findOgImageProblems(dir).join('\n')).toContain('og:image missing /og/klaim/nope-id.jpg');
  });
  it('flags an og:image over 300 KB', () => {
    writeFileSync(join(dir, 'index.html'), page('https://kawalkepakaran.org/og/klaim/big-id.jpg'));
    expect(findOgImageProblems(dir).join('\n')).toMatch(/big-id\.jpg is \d+ bytes \(max 300000\)/);
  });
  it('ignores images on other origins', () => {
    writeFileSync(join(dir, 'index.html'), page('https://example.com/x.jpg'));
    expect(findOgImageProblems(dir)).toEqual([]);
  });
});
