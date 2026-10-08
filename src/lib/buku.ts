import type { z } from 'astro/zod';
import type { bukuSchema } from './schemas';

export type BukuData = z.infer<typeof bukuSchema>;
export interface BukuEntry { id: string; data: BukuData }

export const sortBuku = (entries: BukuEntry[]) =>
  [...entries].sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));

export function formatBytes(n: number): string {
  if (n < 1048576) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toFixed(1).replace('.', ',')} MB`;
}

import type { Locale } from '../i18n';

export const formatBytesFor = (n: number, locale: Locale) => (locale === 'id' ? formatBytes(n) : formatBytes(n).replace(',', '.'));

/** A book's text in the given language; English falls back to Indonesian if no translation exists. */
export function bukuText(d: BukuData, locale: Locale) {
  const en = locale === 'en' ? d.en : undefined;
  return { title: en?.title ?? d.title, description: en?.description ?? d.description, note: en?.note ?? d.note };
}
