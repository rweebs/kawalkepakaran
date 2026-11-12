// Builds src/data/perkara.json, the public data behind the Gelar Perkara section of /pantau, from the private case-review file
// (tmp/dokumen-1-data.json, git-ignored). Run by hand after the private file changes; the build never reads tmp/.
//
// What stays private, by design:
// - identity/account and domicile fields of every terlapor (doxxing risk; the dossier is for the police);
// - every name in Lampiran A (filed by the dossier itself as "bukti belum cukup"), B and C (only counts are kept);
// - source file names and raw OCR extractions;
// - street addresses inside narrative text (masked).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SOURCE = 'tmp/dokumen-1-data.json';
export const OUT = 'src/data/perkara.json';
export const PELAPOR = 'Rahmat Wibowo';

const MONTHS = { januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12 };
const MONTH_RE = '(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)';

/** Street addresses ("Jl. Jenderal Sudirman No. 55, Senayan") become "[alamat]"; a "Jl." followed by a bracket is left alone. */
export function maskAddresses(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\b(?:Jl\.|Jalan)\s+(?!\[)[^,;\]\n"]+(?:,\s*(?:No\.|Lt\.|RT|RW|Kel\.|Kec\.|Desa|Senayan|Kuningan|Cisauk)[^,;\]\n"]*)*/g, '[alamat]');
}

/**
 * The first date in an Indonesian date phrase, with its precision:
 * "8 Mei 2026" -> 2026-05-08 (day), "Agustus 2026" -> 2026-08 (month), "2023 sampai 2025" -> 2023 (year).
 */
export function parseTanggal(s) {
  const t = String(s ?? '').toLowerCase();
  const m = t.match(new RegExp(`(?:(\\d{1,2})\\s+)?${MONTH_RE}\\s+(\\d{4})`));
  const range = t.match(new RegExp(`${MONTH_RE}\\s+(?:sampai|hingga|-|–)\\s+\\w+\\s+(\\d{4})`));
  // "Juli sampai Agustus 2025": the year follows the second month; date it by the first.
  if (range && (!m || range.index < m.index)) return { iso: `${range[2]}-${String(MONTHS[range[1]]).padStart(2, '0')}`, precision: 'month' };
  if (m) {
    const mm = String(MONTHS[m[2]]).padStart(2, '0');
    return m[1] ? { iso: `${m[3]}-${mm}-${m[1].padStart(2, '0')}`, precision: 'day' } : { iso: `${m[3]}-${mm}`, precision: 'month' };
  }
  const y = t.match(/\b(20\d{2})\b/);
  return y ? { iso: y[1], precision: 'year' } : { iso: null, precision: 'none' };
}

export const shortPasal = (p) => String(p)
  .replace(/^Pasal\s+/, '')
  .replace(/\s*UU No\. 1 Tahun 2023 \(KUHP\)/, ' KUHP')
  .replace(/\s*UU No\. 1 Tahun 2024 \(ITE\)/, ' ITE')
  .trim();

/**
 * Names and handles of parties kept off the public page (Lampiran A and C), longest first. A party that is also a
 * main terlapor is not masked: the main list names them anyway.
 */
export function withheldNames(d) {
  const main = (d.uraian_terlapor ?? []).map((u) => String(u.nama));
  const protectedName = (n) => main.some((m) => m.includes(n) || n.includes(m)) || /\b(Rahmat|Wibowo|Pelapor|Terlapor)\b/.test(n);
  // A proper name: 2-5 words, each starting with a capital or an initial ("M."), e.g. "Astari Marthaningtyas", "PT Inti Indonesia Makmur".
  const NAME = /^(?:[A-Z][\w.'&-]*)(?:\s+(?:[A-Z][\w.'&-]*|bin|binti|van|de)){1,4}$/;
  const out = new Set();
  const consider = (v) => {
    const n = String(v ?? '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
    if (NAME.test(n) && !protectedName(n)) out.add(n);
  };
  const pieces = (text) => String(text ?? '')
    .split(/;|\s+dan\s+|,(?!\s*(?:S\.|M\.|Sdn|Inc|Ltd|Tbk))/)
    .map((x) => x.split('(')[0]);
  for (const a of d.lampiran_a_terlapor_bukti_belum_cukup ?? []) {
    const fields = [a.nama, ...(String(a.nama).match(/\(([^)]*)\)/g) ?? []).map((x) => x.slice(1, -1)), a.data?.['Identitas dan akun']];
    for (const f of fields) for (const part of pieces(f)) consider(part);
    for (const h of String(a.data?.['Identitas dan akun'] ?? '').match(/@\w{3,}/g) ?? []) out.add(h);
  }
  for (const c of d.lampiran_c_alumni_itb ?? []) {
    consider(c.Nama);
    for (const h of String(c.Akun ?? '').match(/@\w{3,}/g) ?? []) out.add(h);
  }
  // A handle that a main terlapor entry is known by stays visible with that entry.
  const mainText = JSON.stringify((d.uraian_terlapor ?? []).map((u) => [u.nama, u.data?.['Identitas dan akun']]));
  for (const h of [...out]) if (h.startsWith('@') && mainText.includes(h)) out.delete(h);
  return [...out].sort((a, b) => b.length - a.length);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace every withheld name or handle in every string of `obj`, except the keys in `skip`. */
export function maskWithheld(obj, names, label = '[nama di lampiran]', skip = new Set(['nama'])) {
  if (!names.length) return obj;
  const re = new RegExp(names.map((n) => (n.startsWith('@') ? `${escapeRe(n)}\\b` : `\\b${escapeRe(n)}\\b`)).join('|'), 'g');
  const walk = (v, key) => {
    if (typeof v === 'string') return skip.has(key) ? v : v.replace(re, label);
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(obj, '');
}

// "Belum ada", "Tidak ada" and "-" are placeholders for none, not entries.
const NONE = /^\s*(-|–|belum ada|tidak ada)\s*\.?\s*$/i;
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => !NONE.test(String(x)));

export function sanitize(d) {
  const lp = d.laporan_polisi ?? [];
  const lpByTerlapor = new Map();
  for (const r of lp) for (const id of r.terlapor_id ?? []) lpByTerlapor.set(id, [...(lpByTerlapor.get(id) ?? []), r.no]);
  const pihakLain = (r) => !!r.pelapor && r.pelapor !== PELAPOR;

  const terlapor = (d.uraian_terlapor ?? []).map((u) => {
    const daftar = (d.daftar_terlapor ?? []).find((x) => x.id === u.id) ?? {};
    return {
      id: u.id,
      nama: u.nama,
      kategori: u.kategori ?? daftar.kategori ?? '',
      klaster: u.data?.Klaster && u.data.Klaster !== 'Tidak ada' ? u.data.Klaster : null,
      statusIdentitas: String(u.data?.['Status identitas'] ?? '').split(' (')[0] || null,
      dugaan: maskAddresses(u.dugaan_perbuatan ?? ''),
      pasal: (u.pasal_dipetakan ?? []).map(shortPasal),
      pasalUraian: (u.pasal_yang_diduga ?? []).map(maskAddresses),
      somasi: list(u.data?.Somasi).map(maskAddresses),
      aduan: maskAddresses(String(u.data?.['Aduan / laporan'] ?? '')),
      laporan: lpByTerlapor.get(u.id) ?? [],
      kronologis: (u.kronologis ?? []).map((k) => ({ tanggal: k.Tanggal, ...parseTanggal(k.Tanggal), peristiwa: maskAddresses(k.Peristiwa), jenis: k.Jenis })),
      catatan: (u.catatan ?? []).map(maskAddresses),
      dokumen: u.dokumen_pendukung ?? [],
    };
  });

  const kronologis = (d.kronologis_terpadu ?? []).map((k, i) => ({
    n: i + 1, tanggal: k.tanggal, ...parseTanggal(k.tanggal), periode: k.periode, jenis: k.jenis,
    // Lampiran A ids (L-xx) are not published; such a row keeps one anonymous marker instead.
    terlapor: [...new Set((k.terlapor_ids ?? (k.terlapor_id ? [k.terlapor_id] : [])).map((id) => (id.startsWith('L-') ? 'Lampiran A' : id)))], peristiwa: maskAddresses(k.peristiwa), dokumen: k.dokumen_pendukung ?? [],
  }));

  const laporan = lp.map((r) => ({
    no: r.no,
    nomor: r.nomor_lp_tertulis ?? r.kunci,
    stpl: r.status_acuan,
    adaStpl: !!r.stpl,
    arah: pihakLain(r) ? 'terhadap-pelapor' : 'oleh-pelapor',
    // The filer is named only when it is the Pelapor or someone already on the terlapor list.
    pelapor: !pihakLain(r) || (r.terlapor_id ?? []).length ? r.pelapor ?? null : null,
    terlapor: r.terlapor_id ?? [],
    tanggal: (r.dokumen_terkait ?? []).map((x) => x.tanggal).filter(Boolean).sort()[0] ?? null,
    dokumen: (r.dokumen_terkait ?? []).map((x) => ({
      no: x.dokumen, jenis: x.jenis, nomor: x.nomor ?? null, tanggal: x.tanggal ?? null, pihakLain: !!x.dokumen_pihak_lain,
      ringkasan: maskAddresses(x.ringkasan ?? ''), verifikasi: (x.catatan_verifikasi ?? []).map(maskAddresses),
    })),
  }));

  const dokumen = (d.dokumen_pendukung ?? []).map((x) => ({
    no: x.no, kelompok: x.kelompok, jenis: x.jenis_dokumen, nomor: x.nomor ?? null, tanggal: x.tanggal_iso ?? null,
    terlapor: x.terlapor_id ?? [], pihakLain: !!x.dokumen_pihak_lain, perluVerifikasi: (x.catatan_verifikasi ?? []).length,
    ringkasan: maskAddresses(x.ringkasan_pada_kronologis ?? ''),
  }));

  const m = d._meta ?? {};
  return maskWithheld({
    meta: {
      judul: d.judul, subjudul: d.subjudul, dibuat: m.dibuat, peruntukan: d.informasi_dokumen?.Peruntukan ?? null,
      dasarHukum: d.informasi_dokumen?.['Dasar hukum'] ?? null, acuanUtama: m.acuan_utama,
      catatan: (m.catatan ?? []).filter((c) => !/terlapor_id|identitas pribadi/i.test(c)),
      ringkasan: d.ringkasan ?? [], garisBesar: d.kronologis_garis_besar ?? [],
      keterbatasan: (d.keterbatasan_dan_catatan ?? []).map(maskAddresses), permohonan: d.permohonan_tindak_lanjut ?? [],
      jumlah: { ...(m.jumlah ?? {}), lampiranC: (d.lampiran_c_alumni_itb ?? []).length },
      // Replies received through the right of reply: copied from the dossier when it records them; none recorded yet.
      balasan: (d.hak_jawab ?? d.balasan ?? []).map((b) => ({ terlapor: b.terlapor_id ?? b.terlapor ?? null, tanggal: b.tanggal ?? null, ringkasan: maskAddresses(b.ringkasan ?? '') })),
    },
    pasal: (d.pasal?.rekapitulasi ?? []).map((p) => ({ pasal: shortPasal(p.pasal), jumlah: p.jumlah_terlapor, terlapor: p.terlapor_id ?? [] })),
    aduanBukanLp: (d.aduan_bukan_lp ?? []).map((a) => ({ nomor: a.nomor_aduan, tanggal: a.tanggal, perihal: a.perihal, terlapor: a.terlapor_id ?? [], catatan: a.catatan })),
    terlapor, kronologis, laporan, dokumen,
  }, withheldNames(d));
}

/**
 * Carry the version history of the published dossier: one entry per distinct `dibuat` date, with the terlapor ids added
 * and removed since the version before. Re-running on the same version replaces that entry instead of adding one.
 */
export function withHistory(prev, next) {
  const ids = (o) => (o?.terlapor ?? []).map((t) => t.id);
  const history = [...(prev?.meta?.versi ?? (prev ? [{ dibuat: prev.meta?.dibuat ?? null, terlapor: ids(prev).length, ditambah: [], dihapus: [] }] : []))]
    .filter((v) => v.dibuat !== next.meta.dibuat);
  const before = history.length ? (prev && prev.meta?.dibuat !== next.meta.dibuat ? new Set(ids(prev)) : null) : null;
  const now = ids(next);
  history.push({
    dibuat: next.meta.dibuat ?? null, terlapor: now.length,
    ditambah: before ? now.filter((id) => !before.has(id)) : [],
    dihapus: before ? [...before].filter((id) => !now.includes(id)) : [],
  });
  history.sort((a, b) => String(a.dibuat).localeCompare(String(b.dibuat)));
  return { ...next, meta: { ...next.meta, versi: history } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (!existsSync(SOURCE)) {
    console.warn(`make-perkara-data: ${SOURCE} not found; keeping ${OUT} as committed`);
    process.exit(0);
  }
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const out = withHistory(prev, sanitize(JSON.parse(readFileSync(SOURCE, 'utf8'))));
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`make-perkara-data: ${out.terlapor.length} terlapor, ${out.kronologis.length} kronologis rows, ${out.laporan.length} laporan -> ${OUT}`);
}
