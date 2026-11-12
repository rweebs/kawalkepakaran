// Builds src/data/fomo.json, the public data behind the Fomo section of /pantau, from the Pelapor's evidence files on
// the Fomo platform. They live outside this repo: point FOMO_DIR at their folder (default tmp/fomo, git-ignored).
// Run by hand; the build never reads them.
//
// Kept: verbatim post text (the evidence itself), pseudonymous Fomo account names, the company badge Fomo displays next
// to each name, dates and thread links. Dropped: screenshot paths and source file names. Accounts the source files
// exclude from the badge mapping ("dikecualikan") stay out of the account and company tables; their posts stay, unbadged.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTanggal, maskAddresses } from './make-perkara-data.mjs';

export const FOMO_DIR = process.env.FOMO_DIR ?? 'tmp/fomo';
export const OUT = 'src/data/fomo.json';
const FILES = { akun: 'akun-perusahaan.json', posts: 'report/perusahaan-akun-kata-kata-url.json', gelar: 'report/Gelar Bukti Pencemaran Nama Baik Rahmat Wibowo.json' };

const firstLine = (s) => String(s ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';

export function buildFomo({ akun, posts, gelar }) {
  const excluded = new Set((akun.dikecualikan ?? []).map((d) => d.akun));
  const nder = (tags) => (tags ?? []).includes('NDER');
  // How sure the badge reading is: 'teks' = read from page text and screenshot (threads 26-34), 'gambar' = screenshot only
  // (threads 1-25: I/l and O/0 can be misread), 'ragu' = flagged uncertain by the source (small or cropped logo).
  const confidence = (v) => (!v?.perusahaan ? null : v.perlu_verifikasi ? 'ragu' : String(v.sumber ?? '').includes('teks') ? 'teks' : 'gambar');

  const accounts = Object.entries(akun.akun ?? {})
    .filter(([name]) => !excluded.has(name))
    .map(([name, v]) => ({ akun: name, perusahaan: v.perusahaan ?? null, perluVerifikasi: !!v.perlu_verifikasi, lencana: confidence(v), nder: nder(v.tag), thread: (v.folder ?? []).map(Number).sort((a, b) => a - b) }))
    .sort((a, b) => a.akun.localeCompare(b.akun));

  const post = (posts ?? []).map((p, i) => ({
    n: i + 1,
    akun: p.akun,
    perusahaan: excluded.has(p.akun) ? null : p.perusahaan ?? null,
    lencana: excluded.has(p.akun) || !p.perusahaan ? null : confidence(akun.akun?.[p.akun] ?? { perusahaan: p.perusahaan }),
    nder: nder(p.tag),
    tanggal: p.tanggal ?? null,
    ...parseTanggal(p.tanggal),
    teks: maskAddresses(p.kata_kata ?? ''),
    thread: Number(p.bab),
  }));

  const threads = (gelar.bab ?? []).map((b) => {
    const mine = post.filter((p) => p.thread === Number(b.bab));
    const dated = mine.filter((p) => p.iso).map((p) => p.iso).sort();
    return {
      // Some threads carry a note such as "(URL tidak tercantum)" instead of a link; those get no link.
      thread: Number(b.bab), url: /^https?:\/\//.test(String(b.url ?? '')) ? b.url : null, judul: firstLine(b.postingan?.[0]?.isi ?? mine[0]?.teks),
      pembuka: b.postingan?.[0]?.akun ?? mine[0]?.akun ?? null, posts: mine.length,
      akun: new Set(mine.map((p) => p.akun)).size, mulai: dated[0] ?? null, akhir: dated.at(-1) ?? null,
    };
  });

  const r = gelar.ringkasan_eksekutif ?? {};
  return {
    meta: {
      judul: gelar.judul, objek: gelar.objek_kasus, catatan: [gelar.catatan, ...(r.catatan ?? []), ...(akun._meta?.catatan ?? [])].filter(Boolean),
      dibuat: akun._meta?.dibuat ?? null, total: r.total ?? {}, dikecualikan: excluded.size,
    },
    accounts, posts: post, threads,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const paths = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, join(FOMO_DIR, f)]));
  if (!Object.values(paths).every((p) => existsSync(p))) {
    console.warn(`make-fomo-data: source files not found under FOMO_DIR (${FOMO_DIR}); keeping ${OUT} as committed`);
    process.exit(0);
  }
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const out = buildFomo({ akun: read(paths.akun), posts: read(paths.posts), gelar: read(paths.gelar) });
  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`make-fomo-data: ${out.posts.length} posts, ${out.accounts.length} accounts, ${out.threads.length} threads -> ${OUT}`);
}
