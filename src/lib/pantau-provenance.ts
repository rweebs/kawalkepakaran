// Build-time (Node) provenance for /pantau: SHA-256 of each published dataset, when it last changed in git, the data
// changelog from git history, and the redaction ledger and privacy checks computed from the published JSON itself.
// Imported only from the page frontmatter and tests, never from a client island.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

export const sha256File = (path: string): string | null => (existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null);

export type Git = (args: string[]) => string;

export interface DataChange { hash: string; date: string; subject: string; files: string[] }

/**
 * Commits that touched the published datasets, newest first, from `git log`. Empty when the files are not committed yet
 * (the page then says so); never invented.
 */
export function dataChangelog(git: Git, files: readonly string[], limit = 30): DataChange[] {
  let out = '';
  try {
    out = git(['log', `-${limit}`, '--date=short', '--name-only', '--format=@@%h|%ad|%s', '--', ...files]);
  } catch {
    return [];
  }
  return out.split('@@').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [head, ...rest] = c.split('\n');
    const [hash, date, ...subject] = head.split('|');
    return { hash, date, subject: subject.join('|'), files: rest.map((f) => f.trim()).filter((f) => files.includes(f)) };
  });
}

/** The day a file was last committed, or null when it is new / uncommitted. */
export function lastCommitDay(git: Git, file: string): string | null {
  try {
    return git(['log', '-1', '--format=%ad', '--date=short', '--', file]).trim() || null;
  } catch {
    return null;
  }
}

export interface Redaction { maskedNames: number; maskedAddresses: number; lampiranA: number; lampiranC: number; withheldFields: string[] }

/** What the publishing scripts masked or withheld, counted from the published text (so the numbers cannot drift). */
export function redactionLedger(perkaraText: string, fomoText: string, jumlah: Record<string, number>): Redaction {
  const count = (s: string, needle: string) => s.split(needle).length - 1;
  return {
    maskedNames: count(perkaraText, '[nama di lampiran]') + count(fomoText, '[nama di lampiran]'),
    maskedAddresses: count(perkaraText, '[alamat]') + count(fomoText, '[alamat]'),
    lampiranA: jumlah.terlapor_lampiran_a ?? 0,
    lampiranC: jumlah.lampiranC ?? 0,
    withheldFields: ['Identitas dan akun', 'Domisili / afiliasi', 'data_ekstraksi', 'berkas', 'lampiran (tangkapan layar)'],
  };
}

export interface PrivacyCheck { id: string; ok: boolean }

/**
 * The same checks tests/perkara.test.ts and tests/fomo.test.ts enforce, re-run on the shipped data at build time so the
 * page shows their real result: no identity or domicile field, no unmasked street address, no screenshot or local path.
 */
export function privacyChecks(perkaraText: string, fomoText: string): PrivacyCheck[] {
  return [
    { id: 'identitas', ok: !perkaraText.includes('Identitas dan akun') },
    { id: 'domisili', ok: !perkaraText.includes('Domisili / afiliasi') },
    { id: 'alamat', ok: !/\bJl\.\s+(?!\[)/.test(perkaraText) && !/\bJl\.\s+(?!\[)/.test(fomoText) },
    { id: 'ocr', ok: !perkaraText.includes('data_ekstraksi') },
    { id: 'berkas', ok: !/source\/\d+\/|\.png"|\.pdf"/.test(fomoText + perkaraText) },
    { id: 'lokal', ok: !/\/Users\//.test(fomoText + perkaraText) },
  ];
}

/** Optional hand-kept JSON logs (notice log, link checks, crawl coverage): parsed when present, otherwise null. */
export function optionalJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}
