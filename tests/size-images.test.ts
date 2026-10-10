import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
// @ts-ignore plain JS module
import { sizeImages } from '../scripts/size-images.mjs';

describe('size-images', () => {
  it('adds dimensions and decoding, and lazy-loads all but the first image', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'size-'));
    mkdirSync(join(dir, 'img'));
    await sharp({ create: { width: 40, height: 20, channels: 3, background: '#fff' } }).png().toFile(join(dir, 'img', 'a.png'));
    writeFileSync(join(dir, 'index.html'), '<img src="/logo.svg" alt="" width="32" height="32"><img src="/img/a.png" alt="x"><img src="/img/a.png" alt="y">');
    await sizeImages(dir);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    const tags = html.match(/<img[^>]*>/g)!;
    expect(tags[0]).not.toContain('loading');
    expect(tags[1]).toContain('width="40" height="20"');
    expect(tags[1]).not.toContain('loading');
    expect(tags[2]).toContain('loading="lazy"');
    expect(tags[2]).toContain('decoding="async"');
  });
  it('adds the matching height when only a width is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'size-'));
    mkdirSync(join(dir, 'img'));
    await sharp({ create: { width: 40, height: 20, channels: 3, background: '#fff' } }).png().toFile(join(dir, 'img', 'a.png'));
    writeFileSync(join(dir, 'index.html'), '<img src="/img/a.png" alt="" width="20">');
    await sizeImages(dir);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).toContain('height="10"');
  });
  it('leaves an image alone when the file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'size-'));
    writeFileSync(join(dir, 'index.html'), '<img src="/img/none.png" alt="">');
    await sizeImages(dir);
    expect(readFileSync(join(dir, 'index.html'), 'utf8')).not.toContain('width=');
  });
});
