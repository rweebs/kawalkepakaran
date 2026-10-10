import type { APIRoute } from 'astro';
import { getKlaim, getPakar, isGenerated } from '../lib/pakar';
import { getBukti } from '../lib/content';
import { SITE } from '../lib/site';
import { CONTENT_LICENSE } from '../lib/schema-org';

/**
 * Claims that were checked by hand, as JSON, for researchers and other fact-checkers. Claims generated from the archive
 * are left out: their pages are noindex, and a machine-readable list of people named in disputes would defeat that.
 */
export const GET: APIRoute = async () => {
  const pakar = new Map((await getPakar()).map((p) => [p.id, p.data.name]));
  const bukti = new Map((await getBukti()).map((b) => [b.id, b]));
  const claims = (await getKlaim()).filter((k) => !isGenerated(k)).map((k) => ({
    id: k.id,
    url: new URL(`/klaim/${k.id}`, SITE.url).toString(),
    urlEn: new URL(`/en/claims/${k.id}`, SITE.url).toString(),
    expertId: k.data.pakar,
    expert: pakar.get(k.data.pakar) ?? k.data.pakar,
    claim: k.data.claim,
    claimEn: k.data.claimEn,
    venue: k.data.venue,
    madeAt: k.data.madeAt?.toISOString().slice(0, 10) ?? null,
    reviewedAt: k.data.reviewedAt?.toISOString().slice(0, 10) ?? null,
    verdict: k.data.verdict,
    confidence: k.data.confidence,
    replyStatus: k.data.replyStatus,
    limits: k.data.limits,
    limitsEn: k.data.limitsEn,
    evidence: k.data.evidence.flatMap((id) => {
      const b = bukti.get(id);
      return b ? [{ id, title: b.data.title, source: b.data.source ?? null, sourceUrl: b.data.sourceUrl ?? null, image: new URL(b.data.images[0].src, SITE.url).toString() }] : [];
    }),
  }));
  return new Response(JSON.stringify({ site: SITE.url, license: CONTENT_LICENSE, licenseNote: `${SITE.repo}/blob/main/LICENSE-CONTENT.md`, claims }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
