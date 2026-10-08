import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore plain JS module
import { referencedImages, pruneImages } from '../scripts/prune-images.mjs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'prune-'));
  mkdirSync(join(dir, 'img'));
  for (const f of ['used.png', 'unused.png', 'css.png']) writeFileSync(join(dir, 'img', f), 'x');
  writeFileSync(join(dir, 'index.html'), '<img src="/img/used.png"><style>.a{background:url(/img/css.png)}</style>');
});

describe('prune-images', () => {
  it('collects referenced images from html', () => {
    expect([...referencedImages(dir)].sort()).toEqual(['css.png', 'used.png']);
  });
  it('removes unreferenced images and keeps referenced ones', () => {
    const r = pruneImages(dir);
    expect(r).toEqual({ kept: 2, removed: 1 });
    expect(existsSync(join(dir, 'img', 'unused.png'))).toBe(false);
    expect(existsSync(join(dir, 'img', 'used.png'))).toBe(true);
  });
  it('does nothing when there is no img directory', () => {
    const empty = mkdtempSync(join(tmpdir(), 'prune-empty-'));
    expect(pruneImages(empty)).toEqual({ kept: 0, removed: 0 });
  });
});

describe('prune-images with an adapter-style dist/client layout', () => {
  it('prunes inside dist/client', () => {
    const root = mkdtempSync(join(tmpdir(), 'prune-adapter-'));
    const client = join(root, 'client');
    mkdirSync(join(client, 'img'), { recursive: true });
    for (const f of ['used.png', 'unused.png']) writeFileSync(join(client, 'img', f), 'x');
    writeFileSync(join(client, 'index.html'), '<img src="/img/used.png">');
    expect(pruneImages(root)).toEqual({ kept: 1, removed: 1 });
    expect(existsSync(join(client, 'img', 'unused.png'))).toBe(false);
  });
});

describe('prune-images also prunes /thumb', () => {
  it('keeps referenced thumbs and removes the rest', () => {
    const root = mkdtempSync(join(tmpdir(), 'prune-thumb-'));
    mkdirSync(join(root, 'thumb'), { recursive: true });
    for (const f of ['a.webp', 'b.webp']) writeFileSync(join(root, 'thumb', f), 'x');
    writeFileSync(join(root, 'index.html'), '<img src="/thumb/a.webp">');
    expect(pruneImages(root)).toEqual({ kept: 1, removed: 1 });
    expect(existsSync(join(root, 'thumb', 'b.webp'))).toBe(false);
  });
});

