import { getCollection } from 'astro:content';
import { includeDrafts } from './publish';
import { assertKlaimRefsPakar, selectVisible } from './pakar-refs';

export { assertKlaimRefsPakar };

const INCLUDE_DRAFTS = includeDrafts(process.env);

async function visible() {
  const [pakar, klaim] = await Promise.all([getCollection('pakar'), getCollection('klaim')]);
  return selectVisible(pakar, klaim, INCLUDE_DRAFTS);
}

/** Pakar that may be shown; throws if a shown claim names a missing or draft pakar. */
export async function getPakar() {
  return (await visible()).pakar;
}

/** Claims that may be shown; throws if a claim names a missing pakar, or a shown claim names a draft pakar. */
export async function getKlaim() {
  return (await visible()).klaim;
}

export async function klaimForPakar(slug: string) {
  return (await getKlaim()).filter((k) => k.data.pakar === slug);
}

/** A profile or claim generated from the archive (not curated by hand): it is noindex and kept out of the home page and the sitemap. */
export const isGenerated = (entry: { data: { source?: string } }): boolean => entry.data.source === 'arsip';
