import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buktiSchema } from '../src/lib/schemas';
import { BUKTI_GROUPS, groupBukti, type BuktiEntry } from '../src/lib/bukti';
import { findPersonalData } from '../src/lib/privacy';

const DIR = 'src/content/bukti';
const files = readdirSync(DIR).filter((n) => n.endsWith('.json')).sort();
const raw = files.map((f) => ({ id: f.replace(/\.json$/, ''), text: readFileSync(join(DIR, f), 'utf8') }));
const entries: BuktiEntry[] = raw.map((r) => ({ id: r.id, data: buktiSchema.parse(JSON.parse(r.text)) }));

// Unredacted PDDikti screenshots (NIM visible), the three-student comparison, and the uncropped UNESCO thread.
const FORBIDDEN = [
  '1c6c4aade50e49fad7991e62.png', '3398001c56c9d2d2f424b420.png', '5accb0be210c2485d8c8d3b5.jpg',
  '61c38a58898b39de0bb25cfb.jpg', 'e5e6eb087c371f40b7a5f231.png', 'd77374a345903b17d342c768.png',
  'c12247bf79a3a6fc7539c591.jpg',
];

describe('bukti content', () => {
  it('has the 16 reviewed entries', () => {
    expect(entries).toHaveLength(16);
  });
  it('every entry validates against the schema (parsing above) and has a unique order', () => {
    expect(new Set(entries.map((e) => e.data.order)).size).toBe(entries.length);
  });
  it('every image file exists in public/img', () => {
    for (const e of entries) for (const im of e.data.images) {
      expect(existsSync(join('public', im.src)), `${e.id}: ${im.src}`).toBe(true);
    }
  });
  it('no entry references an unredacted or uncropped original', () => {
    for (const e of entries) for (const im of e.data.images) {
      expect(FORBIDDEN.some((f) => im.src.endsWith(f)), `${e.id}: ${im.src}`).toBe(false);
    }
  });
  it('contains no long digit run (the NIM is 10 digits) and no personal data', () => {
    const allowed = new Set<string>();
    // readable fields only: image filenames are hex hashes that legitimately contain long digit runs
    for (const e of entries) {
      const prose = [e.data.title, e.data.shows, e.data.limits, e.data.source ?? '', ...e.data.images.map((i) => i.alt)].join('\n');
      expect(prose.match(/\d{8,}/g) ?? [], e.id).toEqual([]);
      expect(findPersonalData(prose, allowed), e.id).toEqual([]);
    }
  });
  it('every group has at least one entry', () => {
    expect(groupBukti(entries).map((g) => g.id)).toEqual(BUKTI_GROUPS.map((g) => g.id));
  });

  // Final-review findings: the page describes a named real person, so wording must not overclaim.
  const byId = (id: string) => entries.find((e) => e.id === id)!.data;
  it('a limit that says something is absent scopes it to the image ("pada gambar")', () => {
    for (const e of entries) {
      if (/tidak ada/i.test(e.data.limits)) expect(e.data.limits, e.id).toMatch(/pada gambar/i);
    }
  });
  it('entry 12 does not present the Abil S. comment as a reply to the forwarded UNESCO statement', () => {
    const d = byId('12-utas-unesco');
    expect(d.shows + d.images[0].alt).not.toMatch(/balasan/i);
    expect(d.shows).toMatch(/komentar akun/i);
    expect(d.limits).toMatch(/44m/);
  });
  it('entry 1 names no source or page heading that the image does not show, and says the attribution is the author\'s', () => {
    const d = byId('01-pddikti');
    expect(d.source).toBeUndefined();
    expect(d.shows).not.toContain('Biodata Mahasiswa');
    expect(d.limits).toMatch(/atribusi ke PDDikti berasal dari penulis/i);
  });
});
