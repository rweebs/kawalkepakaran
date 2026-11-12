// Accountability panels for /pantau, build-time only:
// - RedactionLedger: what the publishing scripts masked or withheld, counted from the published data, plus the privacy
//   checks re-run on that data (the same rules the tests enforce), each with its real pass/fail result;
// - NoticeLog: per named party, whether a notice of publication was sent (from src/data/notice-log.json when it exists);
// - LinkStatus: whether the Fomo thread links still resolve (from src/data/fomo-link-status.json, written by
//   scripts/check-fomo-links.mjs).
// Nothing is invented: a missing log shows an empty state that says how it gets filled.
import { fmtDay, fmtN, type Locale } from './InsightPanel';
import type { PrivacyCheck, Redaction } from '../lib/pantau-provenance';

export interface NoticeEntry { id: string; sent: boolean; date?: string | null; channel?: string | null }
export interface LinkStatusEntry { url: string; status: 'live' | 'gone' | 'login' | 'error'; code?: number | null; checkedAt: string }

const T = {
  id: {
    redH: 'Catatan penyamaran', redNote: 'Dihitung dari data yang diterbitkan, jadi angkanya tidak bisa berbeda dari isi halaman.',
    rows: { maskedNames: 'Nama pihak di lampiran yang disamarkan di teks', maskedAddresses: 'Alamat jalan yang disamarkan', lampiranA: 'Pihak di Lampiran A (hanya jumlah)', lampiranC: 'Nama di Lampiran C (hanya jumlah)' },
    fields: 'Kolom yang tidak diterbitkan sama sekali',
    checksH: 'Pemeriksaan data pribadi (dijalankan ulang saat halaman dibangun)',
    checks: { identitas: 'Tidak ada kolom identitas dan akun terlapor', domisili: 'Tidak ada kolom domisili', alamat: 'Tidak ada alamat jalan yang tidak disamarkan', ocr: 'Tidak ada hasil OCR mentah', berkas: 'Tidak ada nama berkas atau tangkapan layar sumber', lokal: 'Tidak ada path folder lokal' } as Record<string, string>,
    pass: 'lulus', fail: 'GAGAL',
    noticeH: 'Catatan pemberitahuan kepada pihak yang disebut',
    noticeNone: (n: number) => `Belum ada catatan pemberitahuan untuk ${n} terlapor yang namanya diterbitkan. Bila pemberitahuan dikirim, catat di src/data/notice-log.json (id, sent, date, channel) dan halaman ini menampilkannya.`,
    notice: (s: number, n: number) => `${s} dari ${n} terlapor tercatat sudah diberi pemberitahuan.`,
    sent: 'terkirim', notSent: 'belum',
    linkH: 'Status tautan thread Fomo',
    linkNone: 'Belum diperiksa. Jalankan node scripts/check-fomo-links.mjs untuk mencatat apakah tiap thread masih ada (hasil di src/data/fomo-link-status.json).',
    link: (c: Record<string, number>, d: string) => `Diperiksa ${d}: ${c.live ?? 0} masih ada, ${c.login ?? 0} perlu login, ${c.gone ?? 0} hilang, ${c.error ?? 0} gagal diperiksa.`,
    linkLabels: { live: 'masih ada', login: 'perlu login', gone: 'hilang', error: 'gagal diperiksa' } as Record<string, string>,
  },
  en: {
    redH: 'Redaction ledger', redNote: 'Counted from the published data, so the numbers cannot differ from what the page shows.',
    rows: { maskedNames: 'Appendix party names masked in text', maskedAddresses: 'Street addresses masked', lampiranA: 'Appendix A parties (count only)', lampiranC: 'Appendix C names (count only)' },
    fields: 'Fields not published at all',
    checksH: 'Personal-data checks (re-run when the page is built)',
    checks: { identitas: 'No terlapor identity and account field', domisili: 'No domicile field', alamat: 'No unmasked street address', ocr: 'No raw OCR output', berkas: 'No source file or screenshot names', lokal: 'No local folder paths' } as Record<string, string>,
    pass: 'pass', fail: 'FAIL',
    noticeH: 'Notice log for named parties',
    noticeNone: (n: number) => `No notice has been recorded yet for the ${n} terlapor whose names are published. When notices are sent, record them in src/data/notice-log.json (id, sent, date, channel) and this page shows them.`,
    notice: (s: number, n: number) => `${s} of ${n} terlapor recorded as notified.`,
    sent: 'sent', notSent: 'not yet',
    linkH: 'Fomo thread link status',
    linkNone: 'Not checked yet. Run node scripts/check-fomo-links.mjs to record whether each thread still exists (result in src/data/fomo-link-status.json).',
    link: (c: Record<string, number>, d: string) => `Checked ${d}: ${c.live ?? 0} live, ${c.login ?? 0} behind login, ${c.gone ?? 0} gone, ${c.error ?? 0} could not be checked.`,
    linkLabels: { live: 'live', login: 'login wall', gone: 'gone', error: 'check failed' } as Record<string, string>,
  },
};

export function RedactionLedger({ r, checks, locale = 'id' }: { r: Redaction; checks: PrivacyCheck[]; locale?: Locale }) {
  const t = T[locale];
  const rows = [['maskedNames', r.maskedNames], ['maskedAddresses', r.maskedAddresses], ['lampiranA', r.lampiranA], ['lampiranC', r.lampiranC]] as const;
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <section className="pl" aria-labelledby="pl-red-h">
      <h3 id="pl-red-h">{t.redH}</h3>
      <p className="muted">{t.redNote}</p>
      <ol className="pg-bars">{rows.map(([k, v]) => (
        <li key={k}><span className="pg-bars__l">{t.rows[k]}</span>
          <svg className="pg-bars__track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect className="pg-bars__bg" x={0} y={0} width={100} height={10} rx={2} /><rect className="pl-fill" x={0} y={0} width={(v / max) * 100} height={10} rx={2} /></svg>
          <span className="pg-bars__v">{fmtN(v, locale)}</span></li>
      ))}</ol>
      <p className="pl-fields"><strong>{t.fields}:</strong> {r.withheldFields.map((f) => <code key={f}>{f}</code>)}</p>
      <h4>{t.checksH}</h4>
      <ul className="pl-checks">{checks.map((c) => (
        <li key={c.id} className={c.ok ? 'pl-ok' : 'pl-bad'}><span aria-hidden="true">{c.ok ? '✓' : '✗'}</span> {t.checks[c.id] ?? c.id} <span className="muted">({c.ok ? t.pass : t.fail})</span></li>
      ))}</ul>
    </section>
  );
}

export function NoticeLog({ entries, named, locale = 'id' }: { entries: NoticeEntry[] | null; named: number; locale?: Locale }) {
  const t = T[locale];
  const sent = entries?.filter((e) => e.sent).length ?? 0;
  return (
    <section className="pl" aria-labelledby="pl-notice-h">
      <h3 id="pl-notice-h">{t.noticeH}</h3>
      {!entries || entries.length === 0 ? <p className="viz-empty">{t.noticeNone(named)}</p> : (
        <>
          <p>{t.notice(sent, named)}</p>
          <div className="viz-scroll"><table className="ci-table"><tbody>{entries.map((e) => (
            <tr key={e.id}><th scope="row" className="pk-mono">{e.id}</th><td>{e.sent ? t.sent : t.notSent}</td><td>{e.date ? fmtDay(e.date, locale) : '–'}</td><td>{e.channel ?? '–'}</td></tr>
          ))}</tbody></table></div>
        </>
      )}
    </section>
  );
}

export function LinkStatus({ entries, locale = 'id' }: { entries: LinkStatusEntry[] | null; locale?: Locale }) {
  const t = T[locale];
  if (!entries || entries.length === 0) return <section className="pl" aria-labelledby="pl-link-h"><h3 id="pl-link-h">{t.linkH}</h3><p className="viz-empty">{t.linkNone}</p></section>;
  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const last = entries.map((e) => e.checkedAt).sort().at(-1)!;
  return (
    <section className="pl" aria-labelledby="pl-link-h">
      <h3 id="pl-link-h">{t.linkH}</h3>
      <p>{t.link(counts, fmtDay(last.slice(0, 10), locale))}</p>
      <div className="viz-scroll"><table className="ci-table"><tbody>{entries.map((e) => (
        <tr key={e.url}><th scope="row" className="pk-mono">{e.url.replace(/^https?:\/\//, '')}</th><td>{t.linkLabels[e.status]}{e.code ? ` (${e.code})` : ''}</td></tr>
      ))}</tbody></table></div>
    </section>
  );
}
