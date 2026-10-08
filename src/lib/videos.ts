import type { z } from 'astro/zod';
import type { videoSchema } from './schemas';

export type VideoData = z.infer<typeof videoSchema>;
export interface VideoEntry { id: string; data: VideoData }

export function embedUrl(id: string, start?: number): string {
  const base = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  return start ? `${base}&start=${start}` : base;
}

export function watchUrl(id: string, start?: number): string {
  const base = `https://www.youtube.com/watch?v=${id}`;
  return start ? `${base}&t=${start}s` : base;
}

export const thumbSrc = (id: string) => `/img/video-${id}.jpg`;

export const sortVideos = (entries: VideoEntry[]) =>
  [...entries].sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
