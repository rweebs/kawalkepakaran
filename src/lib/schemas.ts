import { z } from 'astro/zod';

/** An absolute https URL. Plain `.url()` also accepts `javascript:` and `data:`, which would end up in an href. */
export const httpsUrl = z.string().url().refine((u) => /^https:\/\//i.test(u), 'must be an https:// URL');

export const classification = z.enum(['pendapat', 'fakta-dengan-bukti', 'laporan-aduan']);

export const postSchema = z.object({
  title: z.string().min(1),
  originalTitle: z.string().min(1),
  originalUrl: httpsUrl.optional(),
  author: z.string().min(1),
  originalDate: z.coerce.date().optional(),
  translationDate: z.coerce.date(),
  /** Set when the post is revised after publication; becomes dateModified. */
  updatedDate: z.coerce.date().optional(),
  classification,
  subjects: z.array(z.string()).default([]),
  translationStatus: z.enum(['draft', 'final']).default('draft'),
  image: z.string().optional(),
});

// English edition of a post: the original English text (the Indonesian post is its translation). Same id as the Indonesian post.
export const postEnSchema = z.object({
  title: z.string().min(1),
  originalUrl: httpsUrl.optional(),
  author: z.string().min(1),
  originalDate: z.coerce.date().optional(),
  publishedDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  classification,
  subjects: z.array(z.string()).default([]),
  status: z.enum(['draft', 'final']).default('draft'),
  /** True when the English text is the author's own original; false when it was translated for this site. */
  original: z.boolean().default(true),
});

export type PostData = z.infer<typeof postSchema>;

export const buktiGroup = z.enum(['catatan-resmi', 'klaim-yang-dipublikasikan', 'liputan-pihak-ketiga', 'upaya-verifikasi']);

export const buktiSchema = z.object({
  title: z.string().min(1),
  group: buktiGroup,
  images: z.array(z.object({
    src: z.string().regex(/^\/img\/[^/]+\.(png|jpe?g)$/i),
    alt: z.string().min(1),
  })).min(1).max(4),
  shows: z.string().min(1),
  limits: z.string().min(1),
  source: z.string().min(1).optional(),
  sourceUrl: httpsUrl.optional(),
  capturedAt: z.coerce.date().optional(),
  /** What was cropped or masked in the published image, shown on the card so the edit is disclosed. */
  edited: z.string().min(1).optional(),
  order: z.number().int(),
  en: z.object({
    title: z.string().min(1),
    alts: z.array(z.string().min(1)).min(1).max(4),
    shows: z.string().min(1),
    limits: z.string().min(1),
    source: z.string().min(1).optional(),
    edited: z.string().min(1).optional(),
  }).optional(),
});

export const bukuSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  date: z.coerce.date().optional(),
  version: z.string().min(1).optional(),
  pages: z.number().int().positive(),
  file: z.string().regex(/^\/buku\/[A-Za-z0-9_-][A-Za-z0-9._-]*\.pdf$/),
  cover: z.string().regex(/^\/img\/buku-[A-Za-z0-9_-][A-Za-z0-9._-]*\.jpg$/),
  description: z.string().min(1),
  note: z.string().min(1),
  order: z.number().int(),
  en: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    note: z.string().min(1),
  }).optional(),
});

export const tiktokSchema = z.object({
  tiktokId: z.string().regex(/^\d{10,25}$/),
  title: z.string().min(1),
  order: z.number().int(),
});

export const videoSchema = z.object({
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1),
  start: z.number().int().min(0).optional(),
  order: z.number().int(),
  /** Upload date on YouTube (YYYY-MM-DD). Needed for the video's VideoObject; a video without one gets none. */
  uploadDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const verdict = z.enum(['dikonfirmasi', 'sebagian', 'tidak-terbukti', 'belum-terverifikasi']);
export const credentialStatus = z.enum(['terverifikasi', 'tidak-ditemukan', 'bertentangan', 'belum-terverifikasi', 'belum-diperiksa']);

export const pakarSchema = z.object({
  name: z.string().min(1),
  field: z.string().min(1),
  summary: z.string().min(1),
  summaryEn: z.string().min(1),
  credentials: z.array(z.object({
    title: z.string().min(1),
    issuer: z.string().min(1),
    status: credentialStatus,
    source: httpsUrl.optional(),
    checkedAt: z.coerce.date(),
    /** The claim check that covers this credential, linked from the expert page. */
    klaim: z.string().min(1).optional(),
  })).default([]),
  /** Set only on profiles generated from the archive (a party named in its posts). Hand-made profiles leave these out. */
  kind: z.enum(['Company', 'Person', 'Group']).optional(),
  source: z.literal('arsip').optional(),
  interest: z.string().min(1).optional(),
  interestEn: z.string().min(1).optional(),
  limits: z.string().min(1).optional(),
  limitsEn: z.string().min(1).optional(),
  draft: z.boolean().default(false),
});

const klaimBase = z.object({
  pakar: z.string().min(1),
  claim: z.string().min(1),
  claimEn: z.string().min(1),
  /** Unknown for some claims; left out rather than guessed. */
  madeAt: z.coerce.date().optional(),
  venue: z.string().min(1),
  /** Where the claim can be seen (an https page or an archived copy); becomes ClaimReview itemReviewed.appearance. */
  venueUrl: httpsUrl.optional(),
  verdict,
  confidence: z.enum(['rendah', 'sedang', 'tinggi']),
  evidence: z.array(z.string()).default([]),
  limits: z.string().min(1),
  limitsEn: z.string().min(1),
  /** One neutral sentence on what the check found. Left out, the page derives one from the verdict, evidence and reply status. */
  finding: z.string().min(1).max(220).optional(),
  findingEn: z.string().min(1).max(220).optional(),
  replyStatus: z.enum(['belum-ada', 'diterima', 'dipublikasikan']),
  /** When the claim was requested for a reply; starts the 14-day clock. */
  replyRequestedAt: z.coerce.date().optional(),
  /** The reply as received, shown unedited. Required once replyStatus is dipublikasikan. */
  reply: z.object({ receivedAt: z.coerce.date(), text: z.string().min(1), textEn: z.string().min(1).optional() }).optional(),
  /** Date the check was first published; ClaimReview datePublished. Falls back to reviewedAt. */
  publishedAt: z.coerce.date().optional(),
  /** Date this check was last reviewed; shown on the page and used as the ClaimReview date. */
  reviewedAt: z.coerce.date().optional(),
  /** Health claims carry an extra not-medical-advice notice. */
  topic: z.enum(['kesehatan']).optional(),
  /** Archive posts the claim is about; set only on claims generated from a document. */
  articles: z.array(z.string()).optional(),
  source: z.literal('arsip').optional(),
  draft: z.boolean().default(false),
});

/** A claim written by hand must say when it was reviewed, and a decided verdict must cite evidence. */
export const klaimSchema = klaimBase.superRefine((k, ctx) => {
  if (k.replyStatus === 'dipublikasikan' && !k.reply) ctx.addIssue({ code: 'custom', path: ['reply'], message: 'replyStatus dipublikasikan needs the reply text' });
  if (k.source === 'arsip') return;
  if (!k.reviewedAt) ctx.addIssue({ code: 'custom', path: ['reviewedAt'], message: 'a hand-made claim needs reviewedAt' });
  if (k.verdict !== 'belum-terverifikasi' && k.evidence.length === 0) ctx.addIssue({ code: 'custom', path: ['evidence'], message: 'a decided verdict needs at least one evidence item' });
});

export const arsipKind = z.enum(['somasi', 'aduan', 'ringkasan', 'analisis', 'catatan']);
export const arsipStatus = z.enum(['dikirim', 'diajukan', 'dijawab', 'diputus', 'tidak-diketahui']);

/** A post copied from the Infraloka blog's Professional Blacklist section. Procedural status only. */
export const arsipSchema = z.object({
  title: z.string().min(1),
  sourceUrl: httpsUrl,
  archivedAt: z.coerce.date(),
  lang: z.enum(['id', 'en']),
  kind: arsipKind,
  status: arsipStatus.default('tidak-diketahui'),
  date: z.coerce.date().optional(),
  parties: z.array(z.string()).default([]),
  trimmed: z.boolean().default(false),
  draft: z.boolean().default(true),
});

export type Verdict = z.infer<typeof verdict>;
export type CredentialStatus = z.infer<typeof credentialStatus>;
