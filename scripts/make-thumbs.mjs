import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';

// 640px and 320px-wide WebP thumbnails for the cards; originals stay for the article headers.
const SRC = 'public/img';
const OUT = 'public/thumb';
mkdirSync(OUT, { recursive: true });
let made = 0;
for (const f of readdirSync(SRC).filter((n) => /\.(png|jpe?g)$/i.test(n))) {
  for (const [suffix, width] of [['', 640], ['-320', 320]]) {
    const out = join(OUT, `${parse(f).name}${suffix}.webp`);
    if (existsSync(out)) continue;
    await sharp(join(SRC, f)).resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
    made += 1;
  }
}
console.log(`thumbs: ${made} created`);
