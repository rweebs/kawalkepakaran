// The Bowobharata posters show real people with labels, so every copy the site serves carries a burned-in footer that says
// what it is. The originals in src/assets/bowobharata/ stay untouched; the labelled copies are written to
// src/assets/bowobharata/labelled/ and src/lib/bowobharata.ts points at those. Runs before astro build (idempotent).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SRC_DIR = 'src/assets/bowobharata';
export const OUT_DIR = 'src/assets/bowobharata/labelled';
export const POSTER_FILES = ['poster-wide.jpg', 'krishna.jpg', 'sengkuni.jpg'];
export const FOOTER_LINES = [
  'Alegori dan pendapat penulis, bukan pernyataan fakta · Status klaim: belum bisa diverifikasi',
  'kawalkepakaran.org/kasus/abil-sudarman/bowobharata',
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Footer strip in the site's night palette, sized to the poster's width. */
export function footerSvg(width) {
  const size = Math.max(14, Math.min(24, Math.floor((width - 48) / (FOOTER_LINES[0].length * 0.53))));
  const height = Math.round(size * 3.6);
  return {
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0b1020"/>
  <rect width="${width}" height="3" fill="#e3b341"/>
  <text x="24" y="${Math.round(size * 1.5)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#f1f5f9">${esc(FOOTER_LINES[0])}</text>
  <text x="24" y="${Math.round(size * 2.85)}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" fill="#93c5fd">${esc(FOOTER_LINES[1])}</text>
</svg>`,
  };
}

export async function labelPoster(src, dest) {
  const { width, height } = await sharp(src).metadata();
  const footer = footerSvg(width);
  await sharp(src)
    .extend({ bottom: footer.height, background: '#0b1020' })
    .composite([{ input: Buffer.from(footer.svg), left: 0, top: height }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(dest);
  return { width, height: height + footer.height };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of POSTER_FILES) await labelPoster(`${SRC_DIR}/${f}`, `${OUT_DIR}/${f}`);
  console.log(`labelled ${POSTER_FILES.length} bowobharata posters`);
}
