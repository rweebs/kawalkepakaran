import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// One-off: resolve the author's TikTok short links through TikTok's public oEmbed endpoint, write one
// src/content/tiktok/NN-<id>.json per video and download each cover into
// public/img, so the page never contacts TikTok until a visitor presses play. Output files are committed.
const LINKS = [
  'ZSb95hxnE', 'ZSb9PKwWu', 'ZSb95N9wY', 'ZSb95hjRW', 'ZSb951NwD', 'ZSb95Y5L9', 'ZSb9PTh6p', 'ZSb9PcDW2',
  'ZSb956fRH', 'ZSb9PchnS', 'ZSb95YdaQ', 'ZSb9PTdKP', 'ZSb958BDD', 'ZSb9PKRW2', 'ZSb95Yoqu', 'ZSb9PTcRY',
  'ZSb95LFUf', 'ZSb95JYP2', 'ZSb95jvqd', 'ZSb95Fm3P', 'ZSb95FpYA', 'ZSb95MVJD', 'ZSb95NqG9', 'ZSb95JeWy',
  'ZSb9PK9jV', 'ZSb95kJDY', 'ZSb95YBdJ', 'ZSb95YAht', 'ZSb95Ry3W', 'ZSb95B77F', 'ZSb95BYMw', 'ZSb95SvWg',
  'ZSb95PQqD', 'ZSb952tvK', 'ZSb95Hmk3', 'ZSb95Q7wR', 'ZSb954YLv', 'ZSb955vmn', 'ZSb95BTJA', 'ZSb95usne',
  'ZSb959PdD', 'ZSb959txM', 'ZSb95VF8D', 'ZSb95H3gr',
];
const DIR = 'src/content/tiktok';
mkdirSync(DIR, { recursive: true });

const seen = new Set();
let order = 0;
for (const code of LINKS) {
  const res = await fetch(`https://vt.tiktok.com/${code}/`, { redirect: 'follow' });
  const id = res.url.match(/\/video\/(\d+)/)?.[1];
  if (!id) throw new Error(`${code}: no video id in ${res.url}`);
  if (seen.has(id)) { console.log(`${code}: duplicate of ${id}, skipped`); continue; }
  seen.add(id);
  order += 1;

  const watch = `https://www.tiktok.com/@rweebs_/video/${id}`;
  const meta = await (await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(watch)}`)).json();
  if (!meta.title || !meta.thumbnail_url) throw new Error(`${code}: incomplete oEmbed for ${id}`);
  // Captions are (almost) identical across the series, so cards are numbered in the author's order;
  // the shared caption is shown once on the page.
  const title = `Operasi Ababil · Video ${order}`;

  const out = `public/img/tiktok-${id}.jpg`;
  if (!existsSync(out)) {
    const img = await fetch(meta.thumbnail_url);
    if (!img.ok) throw new Error(`${code}: cover HTTP ${img.status}`);
    writeFileSync(out, Buffer.from(await img.arrayBuffer()));
  }
  const file = join(DIR, `${String(order).padStart(2, '0')}-${id}.json`);
  writeFileSync(file, JSON.stringify({ tiktokId: id, title, order }, null, 2) + '\n');
  console.log(`${file}: ${title.slice(0, 70)}`);
}
console.log(`tiktok: ${order} videos`);
