import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// One-off: download each video's 1280x720 YouTube thumbnail into public/img so the page
// never contacts YouTube until a visitor presses play. Files are committed.
const DIR = 'src/content/videos';
let fetched = 0;
for (const f of readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
  const { youtubeId } = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const out = `public/img/video-${youtubeId}.jpg`;
  if (existsSync(out)) continue;
  const res = await fetch(`https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`);
  if (!res.ok) throw new Error(`${youtubeId}: HTTP ${res.status}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  fetched += 1;
}
console.log(`video thumbs: ${fetched} downloaded`);
