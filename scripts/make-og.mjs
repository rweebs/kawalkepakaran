// Renders every social preview card into public/og/ (runs before astro build; see package.json "build").
// Cards follow the contract in src/lib/og.ts: 1200x630 JPEG, each under 300 KB.
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { allCards, siteSvg, MAX_BYTES } from './og-lib.mjs';
// The case timeline is TypeScript without runtime imports; Node 22 strips the types on import.
import { EVENTS } from '../src/lib/linimasa.ts';
import { CHANNEL_EN, EVENTS_EN } from '../src/lib/linimasa-en.ts';

const OUT = 'public';

// kept for backwards compatibility with links already shared
mkdirSync('public/og', { recursive: true });
await sharp(Buffer.from(siteSvg('id'))).png({ compressionLevel: 9 }).toFile('public/og/kawal-og.png');

const timeline = EVENTS.flatMap((e) => [
  { idSlug: e.slug, slug: e.slug, locale: 'id', title: e.title, date: e.date, channel: e.channel },
  { idSlug: e.slug, slug: EVENTS_EN[e.slug].slug, locale: 'en', title: EVENTS_EN[e.slug].title, date: e.date, channel: CHANNEL_EN[e.channel] ?? e.channel },
]);
const cards = allCards('src/content', timeline);
let max = 0;
const tooBig = [];
for (const { file, svg } of cards) {
  const dest = join(OUT, file);
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(Buffer.from(svg)).flatten({ background: '#070a16' }).jpeg({ quality: 82, mozjpeg: true }).toFile(dest);
  const size = statSync(dest).size;
  max = Math.max(max, size);
  if (size > MAX_BYTES) tooBig.push(`${dest}: ${size} bytes`);
}
if (tooBig.length) { console.error(`og cards over ${MAX_BYTES} bytes:\n${tooBig.join('\n')}`); process.exit(1); }
console.log(`wrote ${cards.length} og cards + kawal-og.png (largest ${max} bytes)`);

await sharp('public/logo-kawal.svg', { density: 384 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');
