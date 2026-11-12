import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitize, parseTanggal, maskAddresses, withheldNames } from '../scripts/make-perkara-data.mjs';
import {
  perBulan, tahapan, pasalTop, filterTerlapor, filterKronologis, kategoriKey, kategoriLabel, DEFAULT_TERLAPOR_FILTER,
  type Perkara, type Terlapor, type Kronologi, type Laporan,
} from '../src/lib/perkara';
import { NAV } from '../src/lib/site';
import { ROUTES } from '../src/i18n';

const read = (p: string) => readFileSync(p, 'utf8');

describe('make-perkara-data helpers', () => {
  it('parses Indonesian dates with their precision', () => {
    expect(parseTanggal('8 Mei 2026')).toEqual({ iso: '2026-05-08', precision: 'day' });
    expect(parseTanggal('Agustus 2026')).toEqual({ iso: '2026-08', precision: 'month' });
    expect(parseTanggal('Juli sampai Agustus 2025')).toEqual({ iso: '2025-07', precision: 'month' });
    expect(parseTanggal('2023 sampai 2025')).toEqual({ iso: '2023', precision: 'year' });
    expect(parseTanggal('tidak diketahui')).toEqual({ iso: null, precision: 'none' });
  });
  it('masks street addresses but leaves bracketed references', () => {
    expect(maskAddresses('terjadi di Jl. Jenderal Sudirman No. 55, Senayan, Kebayoran')).toBe('terjadi di [alamat], Kebayoran');
    expect(maskAddresses('pukul 15.21 WIB di Jl. [Lampiran D, D-31]')).toBe('pukul 15.21 WIB di Jl. [Lampiran D, D-31]');
  });
});

const SRC = {
  _meta: { dibuat: '2026-11-09', acuan_utama: 'STPL', catatan: ['Data identitas pribadi Pelapor tidak disertakan.', 'Seluruh terlapor adalah dugaan.'], jumlah: { terlapor_lampiran_a: 1 } },
  judul: 'GELAR PERKARA', informasi_dokumen: { Peruntukan: 'Ditressiber' },
  daftar_terlapor: [{ id: 'T-001', kategori: 'A. Terlapor Perorangan' }],
  uraian_terlapor: [{
    id: 'T-001', nama: 'Budi Santoso', kategori: 'A. Terlapor Perorangan',
    data: { 'Identitas dan akun': 'Budi Santoso; X @budis', 'Domisili / afiliasi': 'Kota Bekasi, Jawa Barat', Klaster: 'Tidak ada', 'Status identitas': 'Teridentifikasi (oleh Pelapor)', Somasi: ['No. 1/2026'], 'Aduan / laporan': 'Belum ada' },
    dugaan_perbuatan: 'Mengunggah bersama Siti Rahayu Lestari di Jl. Mawar No. 3, Kel. Melati.',
    kronologis: [{ Tanggal: '3 Oktober 2023', Peristiwa: 'Unggahan', Jenis: 'Perbuatan' }],
    pasal_yang_diduga: [], catatan: [], pasal_dipetakan: ['Pasal 433 UU No. 1 Tahun 2023 (KUHP)', 'Pasal 27A UU No. 1 Tahun 2024 (ITE)'], dokumen_pendukung: ['D-01'],
  }],

  lampiran_a_terlapor_bukti_belum_cukup: [{ id: 'L-01', nama: 'Kelompok akun', data: { 'Identitas dan akun': 'Siti Rahayu Lestari (@sitirl); serta individu lain' } }],
  lampiran_c_alumni_itb: [{ No: '1', Nama: 'Joko Widagdo', Akun: '@jokow' }],
  kronologis_terpadu: [
    { periode: '2023', tanggal: '3 Oktober 2023', terlapor_ids: ['T-001'], peristiwa: 'Unggahan @sitirl', jenis: 'Perbuatan' },
    { periode: '2026', tanggal: 'Mei 2026', terlapor_ids: ['L-01'], peristiwa: 'Joko Widagdo ikut', jenis: 'Somasi' },
  ],
  laporan_polisi: [
    { no: 'LP-01', kunci: '1/2026', stpl: { x: 1 }, pelapor: 'Rahmat Wibowo', terlapor_id: ['T-001'], nomor_lp_tertulis: 'LP/B/1/2026', status_acuan: 'STPL tersedia', dokumen_terkait: [{ tanggal: '2026-05-02', jenis: 'STPL' }] },
    { no: 'LP-02', kunci: '2/2026', stpl: null, pelapor: 'Orang Lain', terlapor_id: [], nomor_lp_tertulis: 'LP/B/2/2026', status_acuan: 'tanpa STPL', dokumen_terkait: [] },
  ],
  dokumen_pendukung: [{ no: 'D-01', berkas: 'rahasia.pdf', kelompok: 'STPL/LP', jenis_dokumen: 'STPL', data_ekstraksi: { alamat: 'x' }, catatan_verifikasi: ['a', 'b'], terlapor_id: ['T-001'] }],
  pasal: { rekapitulasi: [{ pasal: 'Pasal 433 UU No. 1 Tahun 2023 (KUHP)', jumlah_terlapor: 1, terlapor_id: ['T-001'] }] },
};

describe('sanitize: what reaches the public page', () => {
  const out = sanitize(SRC);
  const s = JSON.stringify(out);
  it('drops domicile, identity fields, file names and raw OCR', () => {
    expect(s).not.toContain('Kota Bekasi');
    expect(s).not.toContain('Identitas dan akun');
    expect(s).not.toContain('rahasia.pdf');
    expect(s).not.toContain('data_ekstraksi');
    expect(s).not.toContain('identitas pribadi');
  });
  it('masks Lampiran A/C names and handles everywhere, keeps the main terlapor name', () => {
    expect(withheldNames(SRC)).toEqual(expect.arrayContaining(['Siti Rahayu Lestari', '@sitirl', 'Joko Widagdo', '@jokow']));
    expect(s).not.toMatch(/Siti Rahayu Lestari|@sitirl|Joko Widagdo/);
    expect(out.terlapor[0].nama).toBe('Budi Santoso');
    expect(out.terlapor[0].dugaan).toContain('[alamat]');
    expect(out.kronologis[1].terlapor).toEqual(['Lampiran A']);
  });
  it('shortens pasal, marks report direction, and does not name an outside filer with no terlapor link', () => {
    expect(out.terlapor[0].pasal).toEqual(['433 KUHP', '27A ITE']);
    expect(out.laporan.map((l: Laporan) => [l.arah, l.pelapor, l.adaStpl])).toEqual([['oleh-pelapor', 'Rahmat Wibowo', true], ['terhadap-pelapor', null, false]]);
    expect(out.terlapor[0].laporan).toEqual(['LP-01']);
    expect(out.dokumen[0].perluVerifikasi).toBe(2);
    expect(sanitize({ ...SRC, uraian_terlapor: [{ ...SRC.uraian_terlapor[0], data: { ...SRC.uraian_terlapor[0].data, Somasi: 'Belum ada' } }] }).terlapor[0].somasi).toEqual([]);
  });
});

const tl = (over: Partial<Terlapor>): Terlapor => ({
  id: 'T-1', nama: 'A', kategori: 'A. Terlapor Perorangan', klaster: null, statusIdentitas: 'Teridentifikasi', dugaan: '', pasal: [], pasalUraian: [],
  somasi: [], aduan: '-', laporan: [], kronologis: [], catatan: [], dokumen: [], ...over,
});
const kr = (n: number, iso: string | null, precision: Kronologi['precision'], jenis: string, terlapor: string[] = []): Kronologi =>
  ({ n, tanggal: '', iso, precision, periode: '', jenis, terlapor, peristiwa: `ev ${n}`, dokumen: [] });

describe('perkara aggregations', () => {
  it('counts per month with empty months kept and year-only rows apart', () => {
    const { months, undated } = perBulan([kr(1, '2026-01-05', 'day', 'Somasi'), kr(2, '2026-03', 'month', 'Aduan'), kr(3, '2025', 'year', 'Aduan')]);
    expect(months.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(months[2].counts.Aduan).toBe(1);
    expect(undated).toBe(1);
  });
  it('counts how far terlapor have been taken, counting only reports filed by the Pelapor', () => {
    const t = [tl({ id: 'T-1', somasi: ['s'], aduan: '1 (1 diajukan)', laporan: ['LP-1'] }), tl({ id: 'T-2', laporan: ['LP-2'] }), tl({ id: 'T-3' })];
    const lp = [
      { no: 'LP-1', arah: 'oleh-pelapor', adaStpl: true, terlapor: ['T-1'] },
      { no: 'LP-2', arah: 'terhadap-pelapor', adaStpl: true, terlapor: ['T-2'] },
    ] as Laporan[];
    expect(tahapan(t, lp).map((s) => s.n)).toEqual([3, 1, 1, 1, 1]);
  });
  it('filters terlapor by category, report, pasal and words', () => {
    const t = [tl({ id: 'T-1', nama: 'Budi', pasal: ['433 KUHP'], laporan: ['LP-1'] }), tl({ id: 'T-2', nama: 'Ani', kategori: 'C. Korporasi', dugaan: 'somasi kantor' })];
    expect(filterTerlapor(t, { ...DEFAULT_TERLAPOR_FILTER, kategori: ['C'] }).map((x) => x.id)).toEqual(['T-2']);
    expect(filterTerlapor(t, { ...DEFAULT_TERLAPOR_FILTER, laporan: 'with' }).map((x) => x.id)).toEqual(['T-1']);
    expect(filterTerlapor(t, { ...DEFAULT_TERLAPOR_FILTER, pasal: '433 KUHP' }).map((x) => x.id)).toEqual(['T-1']);
    expect(filterTerlapor(t, { ...DEFAULT_TERLAPOR_FILTER, q: 'kantor' }).map((x) => x.id)).toEqual(['T-2']);
    expect(pasalTop([...t, tl({ pasal: ['433 KUHP'] })])).toEqual([{ label: '433 KUHP', n: 2 }]);
    expect([kategoriKey('C. Korporasi'), kategoriLabel('C. Korporasi')]).toEqual(['C', 'Korporasi']);
  });
  it('orders the chronology oldest first with undated rows last, scoped by terlapor and type', () => {
    const rows = [kr(1, null, 'none', 'Aduan', ['T-1']), kr(2, '2026-02-01', 'day', 'Somasi', ['T-1']), kr(3, '2023-10', 'month', 'Perbuatan', ['T-2'])];
    expect(filterKronologis(rows, null, []).map((r) => r.n)).toEqual([3, 2, 1]);
    expect(filterKronologis(rows, new Set(['T-1']), ['Somasi']).map((r) => r.n)).toEqual([2]);
  });
});

describe('gelar perkara page', () => {
  const data = JSON.parse(read('src/data/perkara.json')) as Perkara;
  const s = JSON.stringify(data);
  it('ships no identity, domicile or address fields and no unmasked street address', () => {
    expect(s).not.toContain('Identitas dan akun');
    expect(s).not.toContain('Domisili / afiliasi');
    expect(s).not.toMatch(/\bJl\.\s+(?!\[)/);
    expect(s).not.toContain('data_ekstraksi');
  });
  it('is complete enough to be useful', () => {
    expect(data.terlapor.length).toBeGreaterThan(50);
    expect(data.kronologis.length).toBeGreaterThan(300);
    expect(data.laporan.length).toBeGreaterThan(10);
    expect(data.terlapor.every((x) => x.id && x.nama && x.kategori)).toBe(true);
  });
  it('lives on the Pantau page (no separate route) and states the presumption of innocence', () => {
    expect(NAV.map((n) => n.href)).toContain('/pantau');
    expect(NAV.map((n) => n.href)).not.toContain('/kasus/gelar-perkara');
    expect(Object.keys(ROUTES)).not.toContain('caseReview');
    const page = read('src/pages/pantau.astro');
    // Mounted directly or through the lazy loader; either way it hydrates when scrolled into view.
    expect(page).toMatch(/<PerkaraDashboard\b/);
    expect(page).toMatch(/<PerkaraDashboard client:visible|<PantauLazy client:visible kind="perkara"/);
    expect(page).toContain('id="gelar-perkara"');
    expect(page).toContain('praduga tak bersalah');
    expect(page).toContain("routePath('reply', locale)");
    expect(read('src/components/PerkaraDashboard.tsx')).toContain('pk-presume');
    expect(read('.gitignore')).toMatch(/^tmp\/$/m);
  });
});

import { conversion, actToSomasi, pasalPairs, counterReports, perkaraInsight } from '../src/lib/perkara';

describe('perkara insights', () => {
  const k = (iso: string, jenis: string, precision: 'day' | 'month' = 'day') => ({ tanggal: '', iso, precision, peristiwa: '', jenis });
  it('converts stage counts to rates', () => {
    const s = [{ key: 'terlapor', n: 10 }, { key: 'somasi', n: 8 }, { key: 'aduan', n: 4 }, { key: 'laporan', n: 1 }, { key: 'stpl', n: 1 }] as const;
    expect(conversion([...s])).toEqual([{ from: 'somasi', to: 'aduan', rate: 50 }, { from: 'aduan', to: 'laporan', rate: 25 }, { from: 'laporan', to: 'stpl', rate: 100 }]);
  });
  it('measures days from the first alleged act to the first later somasi, month precision as the 1st', () => {
    const a = tl({ id: 'T-1', kronologis: [k('2023-10-03', 'Perbuatan'), k('2026-04', 'Somasi', 'month'), k('2023-09-01', 'Somasi')] });
    const b = tl({ id: 'T-2', kronologis: [k('2026-05-01', 'Perbuatan'), k('2026-05-11', 'Somasi')] });
    const c = tl({ id: 'T-3', kronologis: [k('2026-05-01', 'Perbuatan')] });
    expect(actToSomasi([a, b, c])).toEqual({ n: 2, median: (911 + 10) / 2, min: 10, max: 911 });
  });
  it('counts pasal pairs once per terlapor', () => {
    const t = [tl({ pasal: ['433 KUHP', '441 KUHP', '433 KUHP'] }), tl({ pasal: ['441 KUHP', '433 KUHP', '27A ITE'] })];
    expect(pasalPairs(t, 2)).toEqual([{ a: '433 KUHP', b: '441 KUHP', n: 2 }, { a: '27A ITE', b: '433 KUHP', n: 1 }]);
  });
  it('counts reports against the Pelapor and those dated after his first own report', () => {
    const l = [
      { no: '1', arah: 'oleh-pelapor', tanggal: '2026-07-28' }, { no: '2', arah: 'terhadap-pelapor', tanggal: '2026-07-05' },
      { no: '3', arah: 'terhadap-pelapor', tanggal: '2026-08-10' }, { no: '4', arah: 'oleh-pelapor', tanggal: null },
    ] as Laporan[];
    expect(counterReports(l)).toEqual({ against: 2, afterFirstOwn: 1, firstOwn: '2026-07-28', againstDates: ['2026-07-05', '2026-08-10'] });
  });
  it('reads concentration from kategori (klaster is free text) and splits identity status', () => {
    const t = [tl({ id: 'T-1', statusIdentitas: 'Teridentifikasi' }), tl({ id: 'T-3', statusIdentitas: 'Teridentifikasi sebagian' }), tl({ id: 'T-2', kategori: 'C. Korporasi', statusIdentitas: 'Akun belum teridentifikasi' })];
    const x = perkaraInsight(t, { laporan: [], kronologis: [], dokumen: [] });
    expect(x.kategori).toEqual({ top: 'Terlapor Perorangan', topN: 2, share: 67 });
    expect(x.identity).toEqual({ full: 1, partial: 1, none: 1 });
    expect(x.backlog).toMatchObject({ n: 3, share: 100 });
  });
});

// ---------- F2 chart helpers (src/lib/perkara-viz.ts) ----------
import {
  KLASTER_GROUPS, klasterGroup, klasterBubbles, compressMonths, statuteOf, pasalName, policeUnit, docStage, statusBoard, stagePill,
  latencies, lanes, monthsByKategori, sparkCounts, ageDays,
} from '../src/lib/perkara-viz';
import { withHistory } from '../scripts/make-perkara-data.mjs';
import { zeroJenis } from '../src/lib/perkara';

describe('klaster normalization (54 raw strings -> ~10 groups)', () => {
  const real = JSON.parse(read('src/data/perkara.json')) as Perkara;
  it('maps the explicit examples to their canonical groups', () => {
    expect(klasterGroup('Alumni ITB (kampanye terkoordinasi; urutan ke-11 pada daftar aduan)')).toBe('Alumni ITB');
    expect(klasterGroup('Amplifikasi unggahan @KawalRahmatwi (Mei 2026)')).toBe('Kawal Rahmat / @KawalRahmatwi');
    expect(klasterGroup('Perundungan X September sampai Oktober 2023')).toBe('Perundungan & amplifikasi 2023');
    expect(klasterGroup('SMA 81')).toBe('Alumni SMA 81');
    expect(klasterGroup('KORIKA (grup WhatsApp profesional)')).toBe('KORIKA');
    expect(klasterGroup('Xendit')).toBe('Korporasi & pemberi kerja');
    expect(klasterGroup(null)).toBe('Tanpa klaster');
    expect(klasterGroup('Tidak ada')).toBe('Tanpa klaster');
  });
  it('folds every real klaster into at most 10 groups, with few left as "Lainnya" and raw strings kept', () => {
    const b = klasterBubbles(real.terlapor);
    expect(b.length).toBeLessThanOrEqual(KLASTER_GROUPS.length);
    expect(b.every((x) => (KLASTER_GROUPS as readonly string[]).includes(x.group))).toBe(true);
    expect(b.reduce((n, x) => n + x.n, 0)).toBe(real.terlapor.length);
    expect(b.find((x) => x.group === 'Lainnya')?.n ?? 0).toBeLessThanOrEqual(5);
    expect(b.flatMap((x) => x.raw).length).toBeGreaterThan(40);
  });
  it('filters terlapor by canonical klaster', () => {
    const itb = filterTerlapor(real.terlapor, { ...DEFAULT_TERLAPOR_FILTER, klaster: 'Alumni ITB' });
    expect(itb.length).toBeGreaterThan(5);
    expect(itb.every((x) => klasterGroup(x.klaster) === 'Alumni ITB')).toBe(true);
  });
});

describe('chart helpers', () => {
  const m = (key: string, n = 0) => ({ key, counts: { ...zeroJenis(), Somasi: n } });
  it('compresses long empty runs into one gap bucket and keeps short ones', () => {
    const out = compressMonths([m('2023-09', 3), m('2023-10'), m('2023-11'), m('2023-12', 1), m('2024-01'), m('2024-02'), m('2024-03'), m('2024-04'), m('2024-05', 2)], 4);
    expect(out.map((x) => x.gap ? `gap:${x.gap.months}` : x.key)).toEqual(['2023-09', '2023-10', '2023-11', '2023-12', 'gap:4', '2024-05']);
  });
  it('groups pasal by statute and only names pasal the dossier explains', () => {
    expect([statuteOf('433 KUHP'), statuteOf('27A ITE'), statuteOf('62 UU No. 8 Tahun 1999 (Perlindungan Konsumen)')]).toEqual(['KUHP', 'ITE', 'Lain']);
    expect(pasalName('434 KUHP')).toBe('fitnah');
    expect(pasalName('441 KUHP')).toBeNull();
  });
  it('names police units consistently', () => {
    expect(policeUnit('LP/B/2814/VII/2026/SPKT/POLRES METRO JAKSEL/POLDA METRO JAYA')).toBe('Polres Metro Jakarta Selatan');
    expect(policeUnit('LP/B/177/VII/2026/SPKT Polsek Cilandak/Polres Metro Jakarta Selatan/Polda Metro Jaya')).toBe('Polsek Cilandak');
    expect(policeUnit('LP/B/5238/VII/2026/SPKT/POLDA METRO JAYA')).toBe('Polda Metro Jaya');
    expect(policeUnit('3004/IV/2026')).toBe('Tidak tercantum');
    expect([docStage('Surat Tanda Penerimaan Laporan'), docStage('SP2HP'), docStage('Undangan Klarifikasi ke-2'), docStage('Surat Kuasa Khusus')]).toEqual(['STPL', 'SP2HP', 'Undangan klarifikasi', 'Lainnya']);
  });
  it('builds the police status board with first dates per document kind', () => {
    const lp = [{ no: 'LP-1', nomor: 'LP/B/1/2026/SPKT/POLDA METRO JAYA', stpl: '', adaStpl: true, arah: 'oleh-pelapor', pelapor: null, terlapor: ['T-1'], tanggal: '2026-07-01',
      dokumen: [{ no: 'D-2', jenis: 'SP2HP', nomor: null, tanggal: '2026-08-01', pihakLain: false, ringkasan: '', verifikasi: ['x'] }, { no: 'D-1', jenis: 'Surat Tanda Penerimaan Laporan', nomor: null, tanggal: '2026-07-01', pihakLain: false, ringkasan: '', verifikasi: [] }] }] as Laporan[];
    const [row] = statusBoard(lp);
    expect(row.stages.STPL).toBe('2026-07-01');
    expect(row.stages.SP2HP).toBe('2026-08-01');
    expect(row.stages['Undangan klarifikasi']).toBeNull();
    expect(row.ocrNotes).toBe(1);
    expect(row.unit).toBe('Polda Metro Jaya');
  });
  it('derives per-terlapor stage pills, latency and the 6-month complaint window', () => {
    const x = tl({ id: 'T-1', somasi: ['s'], aduan: '1 (1 diajukan)', kronologis: [] });
    const rows = [kr(1, '2023-10-03', 'day', 'Perbuatan', ['T-1']), kr(2, '2026-04-13', 'day', 'Somasi', ['T-1']), kr(3, '2026-05-01', 'day', 'Aduan', ['T-1'])];
    const lp = [{ no: 'LP-1', arah: 'oleh-pelapor', adaStpl: false, terlapor: ['T-1'], tanggal: '2026-07-28' }] as Laporan[];
    expect(stagePill(x, lp)).toEqual({ somasi: true, aduan: true, laporan: true, stpl: false });
    const [l] = latencies([x], rows, lp);
    expect(l).toMatchObject({ act: '2023-10-03', somasi: '2026-04-13', aduan: '2026-05-01', laporan: '2026-07-28', windowEnd: '2024-04-03', aduanInWindow: false });
  });
  it('places chronology on category lanes and shared-axis small multiples', () => {
    const t = [tl({ id: 'T-1', kategori: 'A. P' }), tl({ id: 'T-2', kategori: 'E. Lain' })];
    const rows = [kr(1, '2026-01-02', 'day', 'Somasi', ['T-1']), kr(2, '2026-02', 'month', 'Aduan', ['T-2']), kr(3, '2025', 'year', 'Aduan', ['T-1'])];
    const ln = lanes(rows, t);
    expect(Object.keys(ln).sort()).toEqual(['A', 'E']);
    const by = monthsByKategori(rows, t, ['2026-01', '2026-02']);
    expect(by.A[0].counts.Somasi).toBe(1);
    expect(by.E[1].counts.Aduan).toBe(1);
    expect(sparkCounts(t[0], rows, ['2026-01', '2026-02'])).toEqual([1, 0]);
    expect(ageDays('2026-11-09', '2026-11-13')).toBe(4);
  });
});

describe('dossier versions and replies', () => {
  const v = (dibuat: string, ids: string[]) => ({ meta: { dibuat }, terlapor: ids.map((id) => ({ id })) });
  it('starts with one version, then records additions and removals between versions', () => {
    const one = withHistory(null, v('2026-11-09', ['T-1', 'T-2']));
    expect(one.meta.versi).toEqual([{ dibuat: '2026-11-09', terlapor: 2, ditambah: [], dihapus: [] }]);
    expect(withHistory(one, v('2026-11-09', ['T-1', 'T-2'])).meta.versi).toHaveLength(1);
    const two = withHistory(one, v('2026-12-01', ['T-2', 'T-3']));
    expect(two.meta.versi.at(-1)).toEqual({ dibuat: '2026-12-01', terlapor: 2, ditambah: ['T-3'], dihapus: ['T-1'] });
  });
  it('ships a reply list (empty until replies are recorded) and a version log', () => {
    const real = JSON.parse(read('src/data/perkara.json')) as Perkara;
    expect(Array.isArray(real.meta.balasan)).toBe(true);
    expect(real.meta.versi?.length).toBeGreaterThanOrEqual(1);
  });
});
