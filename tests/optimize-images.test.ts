import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
// @ts-ignore plain JS module
import { optimizeImages, CONTENT_SIZES } from '../scripts/optimize-images.mjs';

const read = (p: string) => readFileSync(p, 'utf8');
// Random pixels: incompressible as PNG, so the lossy WebP edition is reliably the smaller file.
const noisy = (width: number, height: number) => sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } });

async function site() {
  const dir = mkdtempSync(join(tmpdir(), 'optimize-'));
  mkdirSync(join(dir, 'img'));
  mkdirSync(join(dir, 'thumb'));
  await noisy(1200, 600).png().toFile(join(dir, 'img', 'shot.png'));
  await noisy(1200, 600).webp({ quality: 60 }).toFile(join(dir, 'thumb', 'shot-full.webp'));
  await noisy(640, 320).webp().toFile(join(dir, 'thumb', 'shot.webp'));
  await noisy(320, 160).webp().toFile(join(dir, 'thumb', 'shot-320.webp'));
  return dir;
}

describe('optimize-images', () => {
  it('shows a PNG as its WebP edition with a srcset for the reading column, and leaves links and meta tags alone', async () => {
    const dir = await site();
    writeFileSync(join(dir, 'index.html'), '<meta property="og:image" content="/img/shot.png"><a href="/img/shot.png"><img src="/img/shot.png" alt="Shot"></a>');
    const s = await optimizeImages(dir);
    const html = read(join(dir, 'index.html'));
    const img = html.match(/<img[^>]*>/)![0];
    expect(img).toContain('src="/thumb/shot-full.webp"');
    expect(img).toContain('srcset="/thumb/shot-320.webp 320w, /thumb/shot.webp 640w, /thumb/shot-full.webp 1200w"');
    expect(img).toContain(`sizes="${CONTENT_SIZES}"`);
    expect(img).toContain('alt="Shot"');
    expect(html).toContain('content="/img/shot.png"');
    expect(html).toContain('<a href="/img/shot.png">');
    expect(s).toMatchObject({ webp: 1, srcset: 1, pages: 1 });
  });

  it('keeps an image that already has a srcset as it is', async () => {
    const dir = await site();
    const tag = '<img src="/img/shot.png" srcset="/a.webp 1w" alt="">';
    writeFileSync(join(dir, 'index.html'), tag);
    await optimizeImages(dir);
    expect(read(join(dir, 'index.html'))).toContain('srcset="/a.webp 1w"');
  });

  it('writes a large inline data: image out to /img as WebP', async () => {
    const dir = await site();
    const png = (await noisy(200, 100).png().toBuffer()).toString('base64');
    writeFileSync(join(dir, 'index.html'), `<p><img src="data:image/png;base64,${png}" alt="Chart"></p>`);
    const s = await optimizeImages(dir);
    const html = read(join(dir, 'index.html'));
    expect(html).not.toContain('data:image');
    const src = html.match(/src="(\/img\/inline-[0-9a-f]{16}\.webp)"/)![1];
    expect(existsSync(join(dir, src))).toBe(true);
    expect(html).toContain('alt="Chart"');
    expect(s.inlined).toBe(1);
  });

  it('caps an oversized original kept only for feeds, but never one a page links to as evidence', async () => {
    const dir = await site();
    await noisy(1700, 240).png({ compressionLevel: 0 }).toFile(join(dir, 'img', 'big.png'));
    await noisy(1700, 240).png({ compressionLevel: 0 }).toFile(join(dir, 'img', 'evidence.png'));
    writeFileSync(join(dir, 'index.html'), '<a href="/img/evidence.png">evidence</a><a href="/img/shot.png">shot</a>');
    const before = statSync(join(dir, 'img', 'evidence.png')).size;
    expect(before).toBeGreaterThan(1_000_000);
    const s = await optimizeImages(dir);
    expect(s.capped).toBe(1);
    expect((await sharp(join(dir, 'img', 'big.png')).metadata()).width).toBe(1600);
    expect(statSync(join(dir, 'img', 'evidence.png')).size).toBe(before);
    expect(readdirSync(join(dir, 'img')).sort()).toEqual(['big.png', 'evidence.png', 'shot.png']);
  }, 30_000);
});

describe('build pipeline order', () => {
  it('optimizes images after the Astro build and before pruning and sizing', () => {
    const build = JSON.parse(read('package.json')).scripts.build as string;
    const at = (s: string) => build.indexOf(s);
    expect(at('astro build')).toBeLessThan(at('optimize-images.mjs'));
    expect(at('optimize-images.mjs')).toBeLessThan(at('prune-images.mjs'));
    expect(at('prune-images.mjs')).toBeLessThan(at('size-images.mjs'));
  });
  it('makes the capped WebP edition of every PNG/JPG and srcset steps for heavy images', () => {
    const js = read('scripts/make-thumbs.mjs');
    expect(js).toContain('-full.webp');
    expect(js).toMatch(/FULL_MAX_WIDTH = 1600/);
    expect(js).toMatch(/FULL_QUALITY = 80/);
  });
});
