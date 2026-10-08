import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videoSchema } from '../src/lib/schemas';
import { sortVideos, thumbSrc, type VideoEntry } from '../src/lib/videos';

const DIR = 'src/content/videos';
const entries: VideoEntry[] = readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()
  .map((f) => ({ id: f.replace(/\.json$/, ''), data: videoSchema.parse(JSON.parse(readFileSync(join(DIR, f), 'utf8'))) }));

const EXPECTED: [string, number | undefined][] = [
  ['AmPrGRv563Q', 1], ['HwTmiZlZmBU', undefined], ['ZBUM-xj2Vs8', undefined], ['pTQ6rJVZUBg', undefined],
  ['ZbzkntEhhYE', 495], ['CAKXpEXAP-w', 259], ['A8If9j6QMwc', 3], ['FGTpBHQcf3k', 9], ['1J6epsuIRW4', undefined],
  ['HGEw-FAOrMk', 8], ['kEFFskXTYJk', 1], ['OeJb9VTvOa4', 1], ['Rp5MezetLvQ', 486],
];

describe('videos content', () => {
  it('has the 13 videos in the order supplied, with their start offsets', () => {
    expect(sortVideos(entries).map((e) => [e.data.youtubeId, e.data.start])).toEqual(EXPECTED);
  });
  it('has unique ids and orders', () => {
    expect(new Set(entries.map((e) => e.data.youtubeId)).size).toBe(13);
    expect(new Set(entries.map((e) => e.data.order)).size).toBe(13);
  });
  it('has a committed self-hosted thumbnail for every video', () => {
    for (const e of entries) expect(existsSync(join('public', thumbSrc(e.data.youtubeId))), e.data.youtubeId).toBe(true);
  });
  it('keeps titles verbatim (no leading or trailing whitespace added)', () => {
    for (const e of entries) expect(e.data.title, e.id).toBe(e.data.title.trim());
  });
});
