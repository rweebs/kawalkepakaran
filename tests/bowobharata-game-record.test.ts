import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PARVAS } from '../src/lib/bowobharata';
import { kategoriKey, type Perkara, type Terlapor, type TerlaporKronologi } from '../src/lib/perkara';
import { parvaWindow, countedRows, rowInWindow, buildChapters, finaleTotals } from '../src/lib/bowobharata-game/record';

const data = JSON.parse(readFileSync('src/data/perkara.json', 'utf8')) as Perkara;
const row = (jenis: string, iso: string | null, precision: TerlaporKronologi['precision'] = 'day'): TerlaporKronologi =>
  ({ tanggal: iso ?? '', iso, precision, peristiwa: 'x', jenis });
const fx = (o: Partial<Terlapor>): Terlapor => ({
  id: 'T-X', nama: 'X', kategori: 'A. Terlapor Perorangan', klaster: null, statusIdentitas: null, dugaan: '', pasal: [], pasalUraian: [],
  somasi: [], aduan: '', laporan: [], kronologis: [], catatan: [], dokumen: [], ...o,
});

describe('bowobharata-game record', () => {
  it('parvaWindow spans its own events, even when windows overlap', () => {
    expect(parvaWindow(PARVAS[3]).to).toBe('2026-07-02');
    expect(parvaWindow(PARVAS[4]).from).toBe('2026-06-20');
  });
  it('countedRows keeps only dated Perbuatan and Tanggapan', () => {
    const t = fx({ kronologis: [row('Perbuatan', '2026-05-01'), row('Somasi', '2026-05-02'), row('Aduan', '2026-05-03'), row('Tanggapan', null)] });
    expect(countedRows(t).map((r) => r.jenis)).toEqual(['Perbuatan']);
  });
  it('rowInWindow precision', () => {
    const w = { from: '2026-06-20', to: '2026-07-02' };
    expect(rowInWindow(row('Perbuatan', '2026-06', 'month'), w)).toBe(true);
    expect(rowInWindow(row('Perbuatan', '2026-05', 'month'), w)).toBe(false);
    expect(rowInWindow(row('Perbuatan', '2026', 'year'), w)).toBe(true);
  });
  it('real data: every non-E person has exactly one full entry; E never appears', () => {
    const ch = buildChapters(PARVAS, data.terlapor);
    const full = ch.flatMap((c) => c.entries.filter((e) => e.full).map((e) => e.id));
    const nonE = data.terlapor.filter((t) => kategoriKey(t.kategori) !== 'E').map((t) => t.id);
    expect(full.length).toBe(nonE.length);
    expect(new Set(full)).toEqual(new Set(nonE));
    const eIds = new Set(data.terlapor.filter((t) => kategoriKey(t.kategori) === 'E').map((t) => t.id));
    expect(ch.flatMap((c) => c.entries).some((e) => eIds.has(e.id))).toBe(false);
  });
  it('real data: chapters are prologue, 8 parva, finale; the prologue holds exactly the pre-parva-1 people', () => {
    const ch = buildChapters(PARVAS, data.terlapor);
    expect(ch.map((c) => c.id)).toEqual(['prologue', ...PARVAS.map((p) => p.id), 'finale']);
    const from = parvaWindow(PARVAS[0]).from;
    const early = data.terlapor
      .filter((t) => kategoriKey(t.kategori) !== 'E')
      .filter((t) => countedRows(t).some((r) => !rowInWindow(r, { from, to: '9999-12-31' })))
      .map((t) => t.id);
    expect(new Set(ch[0].entries.filter((e) => e.full).map((e) => e.id))).toEqual(new Set(early));
    expect(early.length).toBeGreaterThan(0);
  });
  it('finaleTotals splits reports by direction', () => {
    const t = finaleTotals(data);
    expect(t.reportsBy + t.reportsAgainst).toBe(data.laporan.length);
    expect(t.reportsAgainst).toBe(data.laporan.filter((l) => l.arah === 'terhadap-pelapor').length);
  });
});
