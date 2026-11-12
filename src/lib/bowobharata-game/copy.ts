// Every player-facing string of the BOWOBHARATA game, in Indonesian and English. Same voice and limits as the page
// (src/lib/bowobharata.ts): allegory and the author's opinion, no new facts, no verdict on anyone. The arrows and the
// Kurawa army are the campaign; Sanjaya only reports what the dossier alleges, always under the allegation line.
import type { Locale } from '../../i18n';
import type { Totals } from './record';

export interface GameCopy {
  title: string;
  kicker: string;
  gateTitle: string;
  gateStart: string;
  allegation: string;
  reply: string;
  prologueTitle: string;
  prologueIntro: string;
  sanjayaTitle: string;
  sanjayaIntro: string;
  /** Sanjaya's line for a chapter that brings no new names into the record. */
  sanjayaNone: string;
  nameOnly: string;
  fields: { dugaan: string; pasal: string; laporan: string; rows: string };
  /** One guide line per chapter id: 'prologue', each parva id, 'finale'. */
  krishnaLine: Record<string, string>;
  hud: { caught: string; missed: string; decoys: string; sight: string; pause: string };
  catchSource: string;
  lost: string;
  retry: string;
  controls: string[];
  fallbackNote: string;
  /** People and events, reports by direction, the excluded cases, then the label of the link to the full dossier. */
  finaleTotals: (t: Totals) => string[];
  finaleClose: string;
}

export const GAME_COPY: Record<Locale, GameCopy> = {
  id: {
    title: 'BOWOBHARATA',
    kicker: 'Kiasan Mahabharata yang bisa dimainkan',
    gateTitle: 'Sebelum bermain',
    gateStart: 'Mulai bermain',
    allegation: 'Dugaan Pelapor, bukan temuan polisi. Praduga tak bersalah berlaku.',
    reply: 'Hak jawab',
    prologueTitle: 'Sebelum Perang',
    prologueIntro: 'Catatan ini tidak dimulai di Hastinapura. Sebagian sudah tertulis sebelum parva pertama.',
    sanjayaTitle: 'Laporan Sanjaya',
    sanjayaIntro: 'Sanjaya menyaksikan medan perang dari jauh. Ia melaporkan apa yang dicatat dossier untuk bagian ini: siapa, dugaannya, pasal yang dikutip, dan nomor laporannya.',
    sanjayaNone: 'Tidak ada nama baru yang masuk catatan di parva ini.',
    nameOnly: 'muncul lagi',
    fields: { dugaan: 'Dugaan', pasal: 'Pasal yang dikutip', laporan: 'Nomor laporan', rows: 'Peristiwa yang tercatat' },
    krishnaLine: {
      prologue: 'Anak panah sudah dilepas sebelum perang dimulai. Tangkap, jangan membalas.',
      'dadu-di-hastinapura': 'Di sini saya baru bertanya dan menulis. Tangkap yang asli, biarkan tulisan ulang lewat.',
      'duta-perdamaian': 'Krishna datang sebagai duta, bukan sebagai prajurit. Yang datang cukup ditangkap dan dicatat.',
      'sekutu-dan-perbandingan': 'Kedua pihak menimbang kekuatan. Pegang yang bisa diperiksa, lepaskan yang sekadar riuh.',
      'perang-narasi': 'Ini bagian terpanjang. Anak panahnya rapat dan cepat; pakai penglihatan Krishna untuk melihat mana yang asli.',
      'senjata-data': 'Krishna tidak mengangkat senjata. Senjatanya di sini data yang bisa diuji ulang siapa saja.',
      'somasi-kedua': 'Peringatan kedua. Simpan semuanya di satu tempat supaya dokumentasinya utuh.',
      'kurukshetra-digital': 'Medan perang pindah ke linimasa dan kolom komentar. Tetap tangkap satu per satu.',
      'dharma-menemukan-jalannya': 'Akhirnya bukan kemenangan yang dirayakan. Yang tersisa adalah dokumentasi, terbuka untuk dikoreksi.',
      finale: 'Lihat seluruh catatannya. Semua yang dilemparkan kini menjadi bukti.',
    },
    hud: { caught: 'Tertangkap', missed: 'Terlewat', decoys: 'Umpan tertangkap', sight: 'Penglihatan Krishna', pause: 'Jeda' },
    catchSource: 'Lihat peristiwa dan sumbernya',
    lost: 'Terlalu banyak anak panah asli yang lewat, atau terlalu banyak umpan yang tertangkap. Catatan parva ini belum utuh.',
    retry: 'Ulangi parva ini',
    controls: [
      'Ketuk atau klik anak panah untuk menangkapnya.',
      'Anak panah yang ditulis ulang adalah umpan. Biarkan lewat.',
      'Papan ketik: tombol panah menggerakkan bidikan, Spasi menangkap.',
      'Tahan K untuk penglihatan Krishna: waktu melambat dan cap tiap anak panah terlihat.',
      'Esc untuk jeda.',
    ],
    fallbackNote: 'Versi tanpa animasi: parva, peristiwa, dan laporan Sanjaya yang sama, ditampilkan langkah demi langkah.',
    finaleTotals: (t) => [
      `Sanjaya melaporkan ${t.people} nama dan ${t.events} peristiwa.`,
      `${t.reportsBy} laporan dibuat Rahmat Wibowo, ${t.reportsAgainst} laporan terhadapnya.`,
      `${t.excludedE} perkara lain yang bukan pencemaran nama baik terhadap Pelapor tidak dimasukkan ke permainan ini.`,
      'Baca dossier lengkapnya',
    ],
    finaleClose: 'Semua ini diarahkan kepada satu orang: Rahmat Wibowo.',
  },
  en: {
    title: 'BOWOBHARATA',
    kicker: 'A playable Mahabharata allegory',
    gateTitle: 'Before you play',
    gateStart: 'Start playing',
    allegation: "The Pelapor's allegation, not a police finding. The presumption of innocence applies.",
    reply: 'Right of reply',
    prologueTitle: 'Before the War',
    prologueIntro: 'The record does not begin at Hastinapura. Some of it was written before the first parva.',
    sanjayaTitle: "Sanjaya's Report",
    sanjayaIntro: 'Sanjaya watches the battlefield from afar. He reports what the dossier records for this part: who, the allegation, the articles cited and the report numbers.',
    sanjayaNone: 'No new names entered the record in this parva.',
    nameOnly: 'appears again',
    fields: { dugaan: 'Allegation', pasal: 'Articles cited', laporan: 'Report numbers', rows: 'Recorded events' },
    krishnaLine: {
      prologue: 'The arrows were loosed before the war began. Catch them; do not strike back.',
      'dadu-di-hastinapura': 'Here I was only asking and writing. Catch the real ones, let the rewrites pass.',
      'duta-perdamaian': 'Krishna comes as an envoy, not a warrior. What comes at you only needs to be caught and written down.',
      'sekutu-dan-perbandingan': 'Both sides weigh their strength. Hold on to what can be checked, let the noise go.',
      'perang-narasi': "This is the longest part. The arrows come thick and fast; use Krishna's sight to see which ones are real.",
      'senjata-data': 'Krishna does not take up arms. Here the weapon is data anyone can test again.',
      'somasi-kedua': 'A second warning. Keep everything in one place so the record stays whole.',
      'kurukshetra-digital': 'The battlefield moves to the timeline and the comment sections. Keep catching, one at a time.',
      'dharma-menemukan-jalannya': 'The end is not a celebrated victory. What remains is documentation, open to correction.',
      finale: 'Look at the whole record. Everything that was thrown is now evidence.',
    },
    hud: { caught: 'Caught', missed: 'Missed', decoys: 'Decoys caught', sight: "Krishna's sight", pause: 'Pause' },
    catchSource: 'See the event and its sources',
    lost: 'Too many real arrows got past, or too many decoys were caught. The record of this parva is not whole yet.',
    retry: 'Replay this parva',
    controls: [
      'Tap or click an arrow to catch it.',
      'Rewritten arrows are decoys. Let them pass.',
      'Keyboard: the arrow keys move the reticle, Space catches.',
      "Hold K for Krishna's sight: time slows and each arrow's stamp shows.",
      'Esc pauses.',
    ],
    fallbackNote: 'A version without animation: the same parva, events and Sanjaya reports, shown step by step.',
    finaleTotals: (t) => [
      `Sanjaya reported ${t.people} names and ${t.events} events.`,
      `${t.reportsBy} reports filed by Rahmat Wibowo, ${t.reportsAgainst} filed against him.`,
      `${t.excludedE} other cases that are not defamation against the Pelapor are left out of this game.`,
      'Read the full dossier',
    ],
    finaleClose: 'All of it was aimed at one person: Rahmat Wibowo.',
  },
};
