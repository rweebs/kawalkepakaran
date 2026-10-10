import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { siteRoot } from './site-root.mjs';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** Gives every local /img and /thumb image its width, height and decoding hint, and lazy-loads all but the first one on a page (the likely header). */
export async function sizeImages(distDir) {
  const dist = siteRoot(distDir);
  const dims = new Map();
  const dimsOf = async (src) => {
    if (!dims.has(src)) {
      const file = join(dist, decodeURIComponent(src));
      let d = null;
      if (existsSync(file)) { const m = await sharp(file).metadata(); if (m.width && m.height) d = [m.width, m.height]; }
      dims.set(src, d);
    }
    return dims.get(src);
  };
  let changed = 0;
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    let first = true;
    const parts = [];
    let last = 0;
    for (const m of html.matchAll(/<img\s[^>]*>/g)) {
      let tag = m[0];
      const src = (tag.match(/\ssrc="(\/(?:img|thumb)\/[^"]+)"/) || [])[1];
      if (src) {
        const wasFirst = first;
        first = false;
        const hasW = /\swidth="(\d+)"/.exec(tag);
        const hasH = /\sheight=/.test(tag);
        if (!hasH) {
          const d = await dimsOf(src);
          if (d && !hasW) tag = tag.replace(/<img/, `<img width="${d[0]}" height="${d[1]}"`);
          else if (d) tag = tag.replace(/<img/, `<img height="${Math.round((Number(hasW[1]) * d[1]) / d[0])}"`);
        }
        if (!/\sdecoding=/.test(tag)) tag = tag.replace(/<img/, '<img decoding="async"');
        if (!wasFirst && !/\sloading=/.test(tag)) tag = tag.replace(/<img/, '<img loading="lazy"');
        else if (wasFirst && !/\sfetchpriority=/.test(tag) && /\ssrc="\/img\//.test(tag)) tag = tag.replace(/<img/, '<img fetchpriority="high"');
      }
      parts.push(html.slice(last, m.index), tag);
      last = m.index + m[0].length;
    }
    parts.push(html.slice(last));
    const next = parts.join('');
    if (next !== html) { writeFileSync(file, next); changed += 1; }
  }
  return { changed };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { changed } = await sizeImages(resolve(process.argv[2] ?? 'dist'));
  console.log(`images: sized ${changed} pages`);
}
