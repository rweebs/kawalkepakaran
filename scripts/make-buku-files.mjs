import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// One-off: build public/buku/*.pdf and public/img/buku-*.jpg from the author's originals in tmp/.
// Needs Ghostscript (gs) for compression and Poppler (pdftoppm) for covers. Outputs are committed.
// The first report is 30 MB, over Cloudflare Pages' 25 MiB file limit, so it is compressed;
// the other two are copied unchanged.
const SRC = process.env.BUKU_SRC ?? 'tmp';
const DOCS = [
  { slug: 'klaim-tuduhan-dan-bukti', from: 'Laporan Literasi Verifikasi Klaim Abil Sudarman dan ASSAI.pdf', compress: true },
  { slug: 'nama-produk-vs-isi-kurikulum', from: 'assai-consumer-review.pdf', compress: false },
  { slug: 'merek-dan-karya-bukan-milik-bersama', from: 'kesadaran-hak-cipta-merek-2026.pdf', compress: false },
];

mkdirSync('public/buku', { recursive: true });
for (const { slug, from, compress } of DOCS) {
  const src = `${SRC}/${from}`;
  const out = `public/buku/${slug}.pdf`;
  if (!existsSync(src)) throw new Error(`missing source: ${src}`);
  if (compress) {
    execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6', '-dPDFSETTINGS=/ebook', `-sOutputFile=${out}`, src], { stdio: 'inherit' });
  } else {
    copyFileSync(src, out);
  }
  // page 1 as the cover, 900px wide
  execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=85', '-f', '1', '-l', '1', '-singlefile', '-scale-to-x', '900', '-scale-to-y', '-1', out, `public/img/buku-${slug}`]);
  console.log(`${slug}: ${(statSync(out).size / 1048576).toFixed(1)} MB`);
}
