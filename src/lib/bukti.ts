import type { z } from 'astro/zod';
import type { buktiSchema } from './schemas';

export type BuktiData = z.infer<typeof buktiSchema>;
export interface BuktiEntry { id: string; data: BuktiData }

export const BUKTI_GROUPS = [
  { id: 'catatan-resmi', label: 'Catatan resmi' },
  { id: 'klaim-yang-dipublikasikan', label: 'Klaim yang dipublikasikan' },
  { id: 'liputan-pihak-ketiga', label: 'Liputan pihak ketiga' },
  { id: 'upaya-verifikasi', label: 'Upaya verifikasi' },
] as const;

export function groupBukti(entries: BuktiEntry[]) {
  return BUKTI_GROUPS
    .map((g) => ({
      id: g.id as string,
      label: g.label as string,
      items: entries
        .filter((e) => e.data.group === g.id)
        .sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id)),
    }))
    .filter((g) => g.items.length > 0);
}

export const thumbFor = (src: string) => src.replace(/^\/img\/(.+)\.[a-z]+$/i, '/thumb/$1.webp');
export const thumbSrcset = (src: string) => `${thumbFor(src).replace(/\.webp$/, '-320.webp')} 320w, ${thumbFor(src)} 640w`;
export const CARD_THUMB_SIZES = '(min-width: 768px) 300px, 100vw';

const dateFmt = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' });

export function sourceLine(d: { source?: string; capturedAt?: Date }): string {
  const date = d.capturedAt ? dateFmt.format(d.capturedAt) : undefined;
  if (d.source && date) return `Sumber: ${d.source}. Tangkapan layar: ${date}.`;
  if (d.source) return `Sumber: ${d.source}. Tanggal tangkapan layar tidak terlihat.`;
  if (date) return `Tangkapan layar: ${date}. Sumber tidak terlihat.`;
  return 'Sumber dan tanggal tidak terlihat pada gambar.';
}

import type { Locale } from '../i18n';

export const BUKTI_GROUP_LABEL_EN: Record<string, string> = {
  'catatan-resmi': 'Official records',
  'klaim-yang-dipublikasikan': 'Published claims',
  'liputan-pihak-ketiga': 'Third-party coverage',
  'upaya-verifikasi': 'Verification efforts',
};

/** An evidence entry's text in the given language; English falls back to Indonesian if no translation exists. */
export function buktiText(d: BuktiData, locale: Locale) {
  const en = locale === 'en' ? d.en : undefined;
  return {
    title: en?.title ?? d.title,
    shows: en?.shows ?? d.shows,
    limits: en?.limits ?? d.limits,
    source: en?.source ?? d.source,
    alt: (i: number) => en?.alts[i] ?? d.images[i].alt,
  };
}

export function sourceLineFor(d: { source?: string; capturedAt?: Date }, locale: Locale): string {
  if (locale === 'id') return sourceLine(d);
  const date = d.capturedAt ? new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d.capturedAt) : undefined;
  if (d.source && date) return `Source: ${d.source}. Screenshot: ${date}.`;
  if (d.source) return `Source: ${d.source}. Screenshot date not visible.`;
  if (date) return `Screenshot: ${date}. Source not visible.`;
  return 'Source and date are not visible in the image.';
}
