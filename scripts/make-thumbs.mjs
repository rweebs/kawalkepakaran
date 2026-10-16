import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, parse } from 'node:path';

// Derived WebP files under public/thumb (gitignored, rebuilt when missing):
//   <name>.webp (640px) and <name>-320.webp: card thumbnails, and the srcset steps for content images;
//   <name>-full.webp: the WebP edition of a PNG/JPG content image, capped at FULL_MAX_WIDTH, which pages show instead of the
//   original (scripts/optimize-images.mjs swaps it in after the build; the original stays for links, feeds and the sitemap).
// PNG/JPG get all three. WebP originals get the srcset steps only when they are heavy enough for them to pay off, and a capped
// copy only when they are over FULL_CAP_BYTES.
const SRC = 'public/img';
const OUT = 'public/thumb';
const FULL_MAX_WIDTH = 1600;
const FULL_QUALITY = 80;
const STEP_MIN_BYTES = 120_000;
const FULL_CAP_BYTES = 1_000_000;
mkdirSync(OUT, { recursive: true });

let made = 0;
const make = async (src, out, width, quality) => {
  if (existsSync(out)) return;
  await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(out);
  made += 1;
};

for (const f of readdirSync(SRC).filter((n) => /\.(png|jpe?g|webp)$/i.test(n))) {
  const src = join(SRC, f);
  const { name, ext } = parse(f);
  const bytes = statSync(src).size;
  const raster = ext.toLowerCase() !== '.webp';
  if (raster || bytes > STEP_MIN_BYTES) {
    for (const [suffix, width] of [['', 640], ['-320', 320]]) await make(src, join(OUT, `${name}${suffix}.webp`), width, 72);
  }
  if (raster || bytes > FULL_CAP_BYTES) await make(src, join(OUT, `${name}-full.webp`), FULL_MAX_WIDTH, FULL_QUALITY);
}
console.log(`thumbs: ${made} created`);
