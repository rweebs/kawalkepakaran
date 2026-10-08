import { describe, it, expect } from 'vitest';
import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bukuSchema } from '../src/lib/schemas';
import { sortBuku, type BukuEntry } from '../src/lib/buku';

const DIR = 'src/content/buku';
const entries: BukuEntry[] = readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()
  .map((f) => ({ id: f.replace(/\.json$/, ''), data: bukuSchema.parse(JSON.parse(readFileSync(join(DIR, f), 'utf8'))) }));

// Cloudflare Pages rejects any single file over 25 MiB; keep a safety margin.
const MAX_BYTES = 20 * 1048576;
const EXPECTED_FILES = [
  '/buku/klaim-tuduhan-dan-bukti.pdf',
  '/buku/nama-produk-vs-isi-kurikulum.pdf',
  '/buku/merek-dan-karya-bukan-milik-bersama.pdf',
];

describe('buku content', () => {
  it('has the three documents in the order supplied', () => {
    expect(sortBuku(entries).map((e) => e.data.file)).toEqual(EXPECTED_FILES);
  });
  it('has unique orders and files', () => {
    expect(new Set(entries.map((e) => e.data.order)).size).toBe(3);
    expect(new Set(entries.map((e) => e.data.file)).size).toBe(3);
  });
  it('every pdf exists, is a real pdf, and is small enough for Cloudflare Pages', () => {
    for (const e of entries) {
      const p = join('public', e.data.file);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size, p).toBeLessThan(MAX_BYTES);
      const fd = openSync(p, 'r'); const head = Buffer.alloc(5); readSync(fd, head, 0, 5, 0); closeSync(fd);
      expect(head.toString('latin1'), p).toBe('%PDF-');
    }
  });
  it('every cover exists', () => {
    for (const e of entries) expect(existsSync(join('public', e.data.cover)), e.data.cover).toBe(true);
  });
  it('document 3 says only case study 3 concerns Abil Sudarman', () => {
    const d = entries.find((e) => e.data.file.includes('merek-dan-karya'))!.data;
    expect(d.note).toMatch(/studi kasus 3/i);
    expect(d.note).toMatch(/pihak lain/i);
  });
  it('document 1 note repeats what the report itself says it is not (verdict, criminal accusation, legal advice) and nothing it does not say', () => {
    const d = entries.find((e) => e.data.file.includes('klaim-tuduhan'))!.data;
    expect(d.note).toMatch(/bukan putusan/i);
    expect(d.note).toMatch(/bukan tuduhan pidana/i);
    expect(d.note).toMatch(/bukan nasihat hukum/i);
    expect(d.note).not.toMatch(/penyidikan/i);
    expect(d.note).toMatch(/“penipuan”/);
  });
  it('every note keeps the "not a verdict" framing the documents themselves state', () => {
    for (const e of entries) expect(e.data.note, e.id).toMatch(/bukan (putusan|opini hukum)/i);
  });
});
