// The end of /pantau: how each number is counted (one entry per chart family), the data changelog from git history,
// and a print / save-as-PDF control that stamps the printout with the URL (including any filters in it), date and hashes.
// Build-time markup; the print button is wired by a small bundled script in the page.
import { fmtDay, type Locale } from './InsightPanel';
import type { DataChange } from '../lib/pantau-provenance';

const T = {
  id: {
    methodH: 'Cara setiap angka dihitung',
    method: [
      ['Satuan', 'URL = satu alamat di sitemap rahmatwibowo.net; postingan = satu komentar atau unggahan di Fomo; baris kronologis = satu peristiwa di berkas Pelapor; terlapor = satu pihak yang diuraikan. Satuan yang berbeda tidak pernah dijumlahkan, kecuali di grafik "Serangan dan jawaban", yang menghitung item bertanggal dari ketiga sumber.'],
      ['Tanggal', 'Situs: tanggal yang ditulis pengelola di slug (bukan bukti kapan tayang). Fomo: tanggal postingan. Berkas: tanggal baris kronologis. Tanggal yang hanya bulan atau tahun dihitung terpisah.'],
      ['Gelombang', 'Rentang tanggal yang terputus oleh jeda lebih dari 45 hari (panel lintas sumber) atau bulan-bulan berurutan berisi konten (grafik serangan dan jawaban).'],
      ['Kecocokan lintas sumber', 'Nama terlapor diubah menjadi slug dan harus sama persis dengan slug halaman targets atau termuat utuh di slug evidence. Akun anonim Fomo tidak pernah dicocokkan dengan nama orang.'],
      ['Fakta dan dugaan', 'Fakta = hitungan dari data. Dugaan = penjelasan yang mungkin tetapi tidak dibuktikan oleh data; selalu diberi label.'],
      ['Status hukum', 'Setiap terlapor adalah dugaan Pelapor, bukan temuan polisi atau putusan pengadilan.'],
    ],
    logH: 'Riwayat perubahan data',
    logNone: 'Data halaman ini belum pernah di-commit, jadi riwayatnya belum ada. Setiap commit yang mengubah src/data/ akan muncul di sini.',
    printH: 'Cetak atau simpan sebagai PDF',
    printNote: 'Hasil cetak memuat alamat halaman (termasuk saringan yang aktif di alamat itu), tanggal cetak, dan hash data, sehingga bisa dilampirkan. Grafik interaktif dicetak dalam keadaan terakhirnya.',
    print: 'Cetak / simpan PDF',
  },
  en: {
    methodH: 'How each number is counted',
    method: [
      ['Units', 'URL = one address in the rahmatwibowo.net sitemap; post = one Fomo comment or post; chronology row = one event in the Pelapor\'s file; terlapor = one described party. Different units are never added up, except in the "Attacks and answers" chart, which counts dated items from all three sources.'],
      ['Dates', 'Site: the date the operator wrote into the slug (not proof of when it went live). Fomo: post date. Case file: chronology row date. Month- or year-only dates are counted apart.'],
      ['Waves', 'Date ranges broken by a gap of more than 45 days (cross-source panel) or consecutive months with content (attacks and answers chart).'],
      ['Cross-source matches', 'A terlapor name is turned into a slug and must equal a targets page slug exactly, or appear whole in an evidence slug. Anonymous Fomo accounts are never matched to people\'s names.'],
      ['Fact and inference', 'Fact = a count from the data. Inference = a possible explanation the data does not prove; always labelled.'],
      ['Legal status', 'Every terlapor is an allegation by the Pelapor, not a police finding or court ruling.'],
    ],
    logH: 'Data changelog',
    logNone: 'The data on this page has not been committed yet, so there is no history. Every commit that changes src/data/ will appear here.',
    printH: 'Print or save as PDF',
    printNote: 'The printout carries the page address (including any filters in it), the print date and the data hashes, so it can be attached to a filing. Interactive charts print in their current state.',
    print: 'Print / save PDF',
  },
};

export default function PantauMethod({ changes, hashes, locale = 'id' }: { changes: DataChange[]; hashes: { label: string; sha256: string | null }[]; locale?: Locale }) {
  const t = T[locale];
  return (
    <section className="pantau__section pm" id="metode-data" aria-labelledby="pm-h">
      <h2 id="pm-h">{t.methodH}</h2>
      <dl className="pm-method">{t.method.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h3>{t.logH}</h3>
      {changes.length === 0 ? <p className="viz-empty">{t.logNone}</p> : (
        <ol className="pm-log">{changes.map((c) => (
          <li key={c.hash}><time dateTime={c.date}>{fmtDay(c.date, locale)}</time> <code>{c.hash}</code> {c.subject} <span className="muted pk-mono">{c.files.join(', ')}</span></li>
        ))}</ol>
      )}
      <h3>{t.printH}</h3>
      <p className="muted">{t.printNote}</p>
      <button type="button" className="btn" data-pantau-print>{t.print}</button>
      <div className="pm-stamp" aria-hidden="true">
        <p data-pantau-stamp-url />
        <p data-pantau-stamp-date />
        {hashes.map((h) => <p key={h.label}>{h.label}: SHA-256 {h.sha256 ?? '–'}</p>)}
      </div>
    </section>
  );
}
