import { getKlaim, isGenerated } from './pakar';
import { verdictBadge } from './badge';
import type { Locale } from '../i18n';

/** Hand-made claims only: generated (archive) entries are noindex and get no badge. */
export async function curatedKlaimPaths() {
  return (await getKlaim()).filter((k) => !isGenerated(k)).map((k) => ({ params: { slug: k.id } }));
}

/** A claim's verdict badge as an SVG response (src/pages/klaim/[slug]/badge.svg.ts and its /en twin). */
export async function badgeResponse(id: string, locale: Locale): Promise<Response> {
  const klaim = (await getKlaim()).find((k) => k.id === id)!;
  return new Response(verdictBadge(klaim.data.verdict, locale).svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
}
