import { z } from 'astro/zod';

export const classification = z.enum(['pendapat', 'fakta-dengan-bukti', 'laporan-aduan']);

export const postSchema = z.object({
  title: z.string().min(1),
  originalTitle: z.string().min(1),
  originalUrl: z.string().url().optional(),
  author: z.string().min(1),
  originalDate: z.coerce.date().optional(),
  translationDate: z.coerce.date(),
  classification,
  subjects: z.array(z.string()).default([]),
  translationStatus: z.enum(['draft', 'final']).default('draft'),
  image: z.string().optional(),
});

// English edition of a post: the original English text (the Indonesian post is its translation). Same id as the Indonesian post.
export const postEnSchema = z.object({
  title: z.string().min(1),
  originalUrl: z.string().url().optional(),
  author: z.string().min(1),
  originalDate: z.coerce.date().optional(),
  publishedDate: z.coerce.date(),
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
  sourceUrl: z.string().url().optional(),
  capturedAt: z.coerce.date().optional(),
  order: z.number().int(),
  en: z.object({
    title: z.string().min(1),
    alts: z.array(z.string().min(1)).min(1).max(4),
    shows: z.string().min(1),
    limits: z.string().min(1),
    source: z.string().min(1).optional(),
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
});

export const verdict = z.enum(['dikonfirmasi', 'sebagian', 'tidak-terbukti', 'belum-terverifikasi']);
export const credentialStatus = z.enum(['terverifikasi', 'tidak-ditemukan', 'bertentangan', 'belum-diperiksa']);

export const pakarSchema = z.object({
  name: z.string().min(1),
  field: z.string().min(1),
  summary: z.string().min(1),
  summaryEn: z.string().min(1),
  credentials: z.array(z.object({
    title: z.string().min(1),
    issuer: z.string().min(1),
    status: credentialStatus,
    source: z.string().url().optional(),
    checkedAt: z.coerce.date(),
  })).default([]),
  draft: z.boolean().default(false),
});

export const klaimSchema = z.object({
  pakar: z.string().min(1),
  claim: z.string().min(1),
  claimEn: z.string().min(1),
  /** Unknown for some claims; left out rather than guessed. */
  madeAt: z.coerce.date().optional(),
  venue: z.string().min(1),
  verdict,
  confidence: z.enum(['rendah', 'sedang', 'tinggi']),
  evidence: z.array(z.string()).default([]),
  limits: z.string().min(1),
  limitsEn: z.string().min(1),
  replyStatus: z.enum(['belum-ada', 'diterima', 'dipublikasikan']),
  draft: z.boolean().default(false),
});

export type Verdict = z.infer<typeof verdict>;
export type CredentialStatus = z.infer<typeof credentialStatus>;
