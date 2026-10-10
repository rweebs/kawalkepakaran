import { getCollection } from 'astro:content';
import { includeDrafts } from './publish';
import { selectVisibleArsip } from './arsip-refs';
import { localizedPath, type Locale } from '../i18n';

const INCLUDE_DRAFTS = includeDrafts(process.env);

async function visible() {
  const [arsip, pihak] = await Promise.all([getCollection('arsip'), getCollection('pihak')]);
  return selectVisibleArsip(arsip, pihak, INCLUDE_DRAFTS);
}

export async function getArsip() {
  return (await visible()).arsip;
}
export async function getPihak() {
  return (await visible()).pihak;
}

export const arsipPath = (id: string, locale: Locale) => `${localizedPath('archive', locale)}/${locale === 'id' ? 'artikel' : 'articles'}/${id}`;
export const pihakPath = (slug: string, locale: Locale) => localizedPath('parties', locale, slug);

export const KIND_LABEL = {
  somasi: { id: 'Somasi', en: 'Legal notice' }, aduan: { id: 'Aduan', en: 'Complaint' }, ringkasan: { id: 'Ringkasan sengketa', en: 'Dispute summary' },
  analisis: { id: 'Analisis', en: 'Analysis' }, catatan: { id: 'Catatan', en: 'Note' },
} as const;
export const STATUS_LABEL = {
  'dikirim': { id: 'Dikirim', en: 'Sent' }, 'diajukan': { id: 'Diajukan', en: 'Filed' }, 'dijawab': { id: 'Dijawab', en: 'Answered' },
  'diputus': { id: 'Diputus', en: 'Decided' }, 'tidak-diketahui': { id: 'Tidak disebut sumber', en: 'Not stated by the source' },
} as const;
export const PIHAK_KIND_LABEL = {
  Company: { id: 'Perusahaan dan organisasi', en: 'Companies and organisations' }, Group: { id: 'Kelompok', en: 'Groups' }, Person: { id: 'Orang', en: 'People' },
} as const;
