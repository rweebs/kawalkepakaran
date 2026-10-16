import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { siteRoot } from './site-root.mjs';

// Post-build image delivery for every <img> in dist (runs before prune-images and size-images):
//  1. a base64 data: image of more than INLINE_MAX_CHARS is written out to /img/inline-<hash>.webp, so the page stops carrying it;
//  2. a PNG/JPG /img/<name> is shown as /thumb/<name>-full.webp (made by make-thumbs.mjs) when that is smaller; the original
//     file stays wherever else it is referenced (evidence links, sitemap, JSON-LD), so it is only pruned when nothing uses it;
//  3. an image wider than 640px with /thumb/<name>-320.webp and /thumb/<name>.webp steps gets a srcset and sizes for the
//     reading column.
// Only <img> tags are rewritten: meta tags, feeds and structured data keep their URLs.

const INLINE_MAX_CHARS = 4096;
const FULL_MAX_WIDTH = 1600;
/** The reading column is min(70ch, 100% - 2rem): about 40rem on a desktop, the viewport less its gutters on a phone. */
export const CONTENT_SIZES = '(min-width: 42rem) 40rem, calc(100vw - 2rem)';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (!['img', 'thumb', '_astro', 'og', 'models'].includes(name)) out.push(...htmlFiles(p)); }
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const setAttr = (tag, name, value) => (attr(tag, name) !== undefined
  ? tag.replace(new RegExp(`\\s${name}="[^"]*"`), () => ` ${name}="${value}"`)
  : tag.replace(/^<img/, () => `<img ${name}="${value}"`));

export async function optimizeImages(distDir) {
  const dist = siteRoot(distDir);
  const size = (p) => (existsSync(p) ? statSync(p).size : -1);
  const widths = new Map();
  const widthOf = async (p) => {
    if (!widths.has(p)) widths.set(p, existsSync(p) ? (await sharp(p).metadata()).width ?? 0 : 0);
    return widths.get(p);
  };
  const inlined = new Map();
  const stats = { pages: 0, inlined: 0, webp: 0, srcset: 0, capped: 0 };

  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    const parts = [];
    let last = 0;
    for (const m of html.matchAll(/<img\s[^>]*>/g)) {
      let tag = m[0];
      let src = attr(tag, 'src') ?? '';

      const data = src.match(/^data:image\/(?:png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
      if (data && src.length > INLINE_MAX_CHARS) {
        const key = createHash('sha256').update(data[1]).digest('hex').slice(0, 16);
        if (!inlined.has(key)) {
          const out = join(dist, 'img', `inline-${key}.webp`);
          mkdirSync(join(dist, 'img'), { recursive: true });
          await sharp(Buffer.from(data[1], 'base64')).resize({ width: FULL_MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
          inlined.set(key, `/img/inline-${key}.webp`);
          stats.inlined += 1;
        }
        src = inlined.get(key);
        tag = setAttr(tag, 'src', src);
      }

      const local = src.match(/^\/img\/([^"?#]+)\.(png|jpe?g|webp)$/i);
      if (local) {
        const name = decodeURIComponent(local[1]);
        const full = `/thumb/${encodeURIComponent(name)}-full.webp`;
        const fullPath = join(dist, 'thumb', `${name}-full.webp`);
        const origPath = join(dist, 'img', `${name}.${local[2]}`);
        if (size(fullPath) > 0 && (size(origPath) < 0 || size(fullPath) < size(origPath))) {
          src = full;
          tag = setAttr(tag, 'src', src);
          stats.webp += 1;
        }
        const step = (suffix) => join(dist, 'thumb', `${name}${suffix}.webp`);
        const shownPath = src === full ? fullPath : origPath;
        if (attr(tag, 'srcset') === undefined && size(step('')) > 0 && size(step('-320')) > 0) {
          const w = await widthOf(shownPath);
          if (w > 640) {
            const base = `/thumb/${encodeURIComponent(name)}`;
            tag = setAttr(setAttr(tag, 'sizes', CONTENT_SIZES), 'srcset', `${base}-320.webp 320w, ${base}.webp 640w, ${src} ${w}w`);
            stats.srcset += 1;
          }
        }
      }
      parts.push(html.slice(last, m.index), tag);
      last = m.index + m[0].length;
    }
    parts.push(html.slice(last));
    const next = parts.join('');
    if (next !== html) { writeFileSync(file, next); stats.pages += 1; }
  }
  stats.capped = await capOriginals(dist);
  return stats;
}

/**
 * 4. A PNG/JPG original over CAP_BYTES that is still in dist (named by the sitemap, a feed or structured data) is scaled down in
 * place to FULL_MAX_WIDTH, keeping its URL and format. Originals a page links to as a file (evidence opened at full size) are
 * left exactly as published.
 */
const CAP_BYTES = 1_000_000;
export async function capOriginals(dist) {
  const dir = join(dist, 'img');
  if (!existsSync(dir)) return 0;
  const big = readdirSync(dir).filter((n) => /\.(png|jpe?g)$/i.test(n) && statSync(join(dir, n)).size > CAP_BYTES);
  if (big.length === 0) return 0;
  const linked = new Set();
  for (const file of htmlFiles(dist)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/<a\s[^>]*href="\/img\/([^"?#]+)"/g)) linked.add(decodeURIComponent(m[1]));
  }
  let capped = 0;
  for (const name of big.filter((n) => !linked.has(n))) {
    const p = join(dir, name);
    const img = sharp(readFileSync(p)).resize({ width: FULL_MAX_WIDTH, withoutEnlargement: true });
    const out = await (/\.png$/i.test(name) ? img.png({ compressionLevel: 9, palette: true, quality: 80 }) : img.jpeg({ quality: 80, mozjpeg: true })).toBuffer();
    if (out.length < statSync(p).size) { writeFileSync(p, out); capped += 1; }
  }
  return capped;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const s = await optimizeImages(resolve(process.argv[2] ?? 'dist'));
  console.log(`images: ${s.inlined} inline images written out, ${s.webp} shown as WebP, ${s.srcset} given a srcset, on ${s.pages} pages; ${s.capped} oversized originals capped`);
}
