import type { z } from 'astro/zod';
import type { tiktokSchema } from './schemas';

export type TiktokData = z.infer<typeof tiktokSchema>;
export interface TiktokEntry { id: string; data: TiktokData }

export const TIKTOK_AUTHOR = 'rweebs_';
// Caption the author used on the whole series (hashtags omitted).
export const TIKTOK_CAPTION = 'Operasi Ababil - Dugaaan Penipuan Abil Sudarman, Cacat Metodologi ASSAI Pembodohan Massal, Ijazah Palsu, Kedudukan Palsu';

export const embedUrl = (id: string) => `https://www.tiktok.com/embed/v2/${id}`;
export const watchUrl = (id: string) => `https://www.tiktok.com/@${TIKTOK_AUTHOR}/video/${id}`;
export const thumbSrc = (id: string) => `/img/tiktok-${id}.jpg`;

export const sortTiktok = (entries: TiktokEntry[]) =>
  [...entries].sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
