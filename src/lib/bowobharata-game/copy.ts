// Every player-facing string of the BOWOBHARATA game, in Indonesian and English. Same voice and limits as the page
// (src/lib/bowobharata.ts): allegory and the author's opinion, no new facts, no verdict on anyone. The arrows and the
// Kurawa army are the campaign; Sanjaya only reports what the dossier alleges, always under the allegation line.
// One calm narrator: the player drives, records and delivers, and never strikes, chases or catches anyone. The word
// lists that hold this voice live in tests/bowobharata-game-copy.test.ts; the reference games' names that must stay
// out, in tests/bowobharata-game-brand.ts.
import type { TableLabels } from '../../components/bowobharata-game/charts';
import type { MapLabels } from '../../components/bowobharata-game/ReportMap';
import type { Locale } from '../../i18n';
import type { Tahap } from '../perkara';
import type { HintKey } from './mission-run';
import type { MissionType } from './missions';
import type { Totals } from './record';

/** The chapter-end reports on Tercatat, Sanjaya and the finale: tiles, charts, the record map and their words. */
export interface ReportCopy {
  /** The framed report block's heading and lead line. */
  block: string;
  lead: string;
  /** Sanjaya's stat tiles; `fresh` and `again` qualify the names count. */
  tiles: { names: string; fresh: string; again: string; acts: string; replies: string; pasal: string; reports: string };
  /** The chapter's events by day (a parva) or by month (the prologue and the finale chapter). */
  when: { title: string; day: string; month: string; undated: (o: { n: number }) => string };
  pasal: { title: string; note: string; other: (o: { items: number }) => string };
  stages: { title: string; note: string; steps: Record<Tahap['key'], string> };
  /** Every chart's table twin. */
  table: TableLabels;
  /** Tercatat's strip: where the parva sits in the whole story. */
  strip: {
    title: string; events: string; dates: string;
    stat: (o: { n: number; from: string; to: string; channels: string }) => string;
    statPrologue: (o: { n: number; from: string; to: string }) => string;
  };
  finale: {
    months: string; monthsNote: string; perChapter: string; perChapterNote: string; pasalTop: string; reports: string;
    lanes: { by: string; against: string };
  };
  /** A chapter's short name on the finale's per-part chart. */
  chapterName: { prologue: string; parva: (o: { n: number }) => string; finale: string };
  map: MapLabels;
}

export interface GameCopy {
  title: string;
  /** Page meta description. */
  description: string;
  /** Breadcrumb label of the Monitor page the game sits under. */
  crumbMonitor: string;
  /** Link/button label that leads to the game from /pantau and from the Bowobharata case page. */
  entryLink: string;
  /** Short line next to the link. */
  entryNote: string;
  /** Note beside the link on /pantau, which has no allegory of its own. */
  monitorNote: string;
  /** Server-rendered text shown until the island loads, and the link to the readable case page. */
  noscript: string;
  /** The dossier data did not load: message and the retry button. */
  dataError: { message: string; retry: string };
  readLink: string;
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
  hud: { sight: string; pause: string };
  catchSource: string;
  fallbackNote: string;
  /** People and events, reports by direction, the excluded cases, then the label of the link to the full dossier. */
  finaleTotals: (t: Totals) => string[];
  finaleClose: string;
  /** Button labels: start a chapter's play, go on, resume after a pause, take an event into the record (no-animation
   * version), and start over from the gate. */
  actions: { play: string; next: string; resume: string; take: string; again: string };
  /** What the Kurawa ranks and the rewritten copies stand for; shown on the gate and the pause panel. */
  armyNote: string;
  /** Who the Pelapor is; shown beside armyNote. */
  pelaporNote: string;
  /** The frame line in the HUD's objective panel, shown throughout play. */
  hudFrame: string;
  /** Label of the full-screen button. */
  fullscreen: string;
  /** The chip that names a lakon's type on its card. */
  types: Record<MissionType, string>;
  /** The kicker over a lakon card; `label` names the chapter, e.g. "Parva 1". */
  lakonKicker: (o: { label: string }) => string;
  /** The objective line of the HUD, by objective. */
  objectives: {
    roam: string;
    prologue: (o: { done: number; total: number }) => string;
    collect: (o: { done: number; total: number }) => string;
    tower: string;
    stop: string;
  };
  /** The speed unit, then the names of Krishna's sight (Mata), the surge (Laju) and the clamour (Riuh). */
  ride: { speedUnit: string; sight: string; surge: string; riuh: string };
  /** The touch controls' names (their aria-labels and visible labels): the steer zone, Rem, Laju, Mata and Maju (manual mode). */
  touch: { steer: string; brake: string; surge: string; sight: string; ride: string };
  /** Toasts while driving: counts, dates and channels only, never a name or an event title. */
  toasts: {
    recorded: (o: { n: number; total: number; date: string; channel: string }) => string;
    /** The prologue's records show a count only. */
    recordedPrologue: (o: { n: number; total: number }) => string;
    filed: string; rewrite: string; ranks: string; checkpoint: string; wall: string;
  };
  /** The muted hint line of the objective panel, once per hint, for the keyboard and for touch. */
  hints: Record<HintKey, { keys: string; touch: string }>;
  /** The soft-fail card: its title, the reason (time, muddied), retry, the skip offered after two fails and its note,
   * and the line that points to steering assist. */
  fail: { title: string; time: string; muddied: string; retry: string; skip: string; skipNote: string; assist: string };
  /** The Tercatat screen: its title, the prologue's count line, the heading of the framed prologue dates, and the note
   * shown when the skip filled part of the record in. */
  recordedScreen: { title: string; prologue: (o: { n: number }) => string; dates: string; skipped: string };
  /** The pause panel: the two toggles, retry, the way to the lotus marker, and the version without animation. */
  settings: { title: string; assist: string; easy: string; retry: string; toMarker: string; still: string };
  /** The prompt offered to a device that stays slow. */
  slow: { message: string; useStill: string; keepPlaying: string };
  /** The controls as two titled lists: keyboard, and touch. */
  controlsKeys: string[];
  controlsTouch: string[];
  controlsTitle: { keys: string; touch: string };
  report: ReportCopy;
}

export const GAME_COPY: Record<Locale, GameCopy> = {
  id: {
    title: 'BOWOBHARATA',
    description: 'Permainan alegori BOWOBHARATA dari berkas Gelar Perkara. Alegori dan opini penulis; isinya dugaan Pelapor, bukan temuan polisi.',
    crumbMonitor: 'Pantau',
    entryLink: 'Main BOWOBHARATA',
    entryNote: 'Versi permainan dari alegori ini. Alegori dan opini penulis.',
    monitorNote: 'Ada juga BOWOBHARATA, permainan alegori Mahabharata yang memakai berkas gelar perkara ini. Alegori dan opini penulis, bukan pernyataan fakta.',
    noscript: 'Memuat permainan… Jika tidak muncul, aktifkan JavaScript atau baca versi halaman.',
    dataError: { message: 'Data permainan gagal dimuat.', retry: 'Coba lagi' },
    readLink: 'Baca kisah Bowobharata',
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
      prologue: 'Anak panah sudah tertancap sebelum perang dimulai. Catat satu per satu; jangan membalas.',
      'dadu-di-hastinapura': 'Di sini baru ada yang ditanyakan dan yang ditulis. Catat keduanya dan bawa ke Sanjaya.',
      'duta-perdamaian': 'Krishna datang sebagai duta, bukan prajurit. Antar suratnya, lalu bawa catatannya ke Sanjaya.',
      'sekutu-dan-perbandingan': 'Kedua pihak menimbang kekuatan. Catat yang bisa diperiksa; biarkan tulisan ulang lewat.',
      'perang-narasi': 'Ini bagian terpanjang, termasuk tulisan yang menurut penulisnya sendiri bisa dikritik. Catat semuanya apa adanya.',
      'senjata-data': 'Krishna tidak mengangkat senjata. Di sini senjatanya data yang bisa diuji ulang siapa saja; catat hasilnya.',
      'somasi-kedua': 'Peringatan kedua. Simpan semuanya di satu tempat supaya catatannya utuh.',
      'kurukshetra-digital': 'Medan pindah ke linimasa dan kolom komentar, termasuk balasan yang diulang-ulang. Catat itu juga.',
      'dharma-menemukan-jalannya': 'Akhirnya bukan kemenangan yang dirayakan. Yang tersisa adalah catatan, terbuka untuk dikoreksi.',
      finale: 'Lihat seluruh catatannya. Setiap catatan tersimpan bersama sumbernya.',
    },
    hud: { sight: 'Penglihatan Krishna', pause: 'Jeda' },
    catchSource: 'Lihat di linimasa, lengkap dengan sumbernya',
    fallbackNote: 'Versi tanpa animasi: parva, peristiwa, dan laporan Sanjaya yang sama, ditampilkan langkah demi langkah.',
    finaleTotals: (t) => [
      `Sanjaya melaporkan ${t.people} nama dan ${t.events} peristiwa.`,
      `${t.reportsBy} laporan dibuat Rahmat Wibowo, ${t.reportsAgainst} laporan terhadapnya.`,
      `${t.excludedE} perkara lain yang bukan pencemaran nama baik terhadap Pelapor tidak dimasukkan ke permainan ini.`,
      'Baca dossier lengkapnya',
    ],
    finaleClose: 'Semua ini diarahkan kepada satu orang: Rahmat Wibowo.',
    actions: { play: 'Mulai', next: 'Lanjut', resume: 'Lanjutkan', take: 'Masukkan ke catatan', again: 'Main lagi dari awal' },
    armyNote: 'Pasukan Kurawa di sini adalah kiasan untuk riuh unggahan, repost, dan komentar yang dicatat Pelapor. Salinan tulisan ulang di medan hanyalah perangkat permainan, bukan halaman tertentu. Tidak ada prajurit yang mewakili orang tertentu, dan tidak ada yang bisa terluka.',
    pelaporNote: 'Pelapor dalam berkas ini adalah Rahmat Wibowo, penulis kiasan ini.',
    hudFrame: 'Kiasan · pendapat penulis',
    fullscreen: 'Layar penuh',
    types: { himpun: 'Himpun', antar: 'Antar', lintasan: 'Lintasan', uji: 'Uji ulang' },
    lakonKicker: ({ label }) => `Lakon · ${label}`,
    objectives: {
      roam: 'Arahkan kereta ke penanda teratai untuk memulai lakon.',
      prologue: ({ done, total }) => `Catat anak panah yang tertancap: ${done}/${total}`,
      collect: ({ done, total }) => `Catat lontar di bawah sinar emas: ${done}/${total}`,
      tower: 'Bawa catatannya ke menara Sanjaya.',
      stop: 'Berhenti sejenak di dalam lingkaran.',
    },
    ride: { speedUnit: 'km/jam', sight: 'Mata', surge: 'Laju', riuh: 'Riuh' },
    touch: { steer: 'Kemudi', brake: 'Rem', surge: 'Laju', sight: 'Mata', ride: 'Maju' },
    toasts: {
      recorded: ({ n, total, date, channel }) => `Tercatat ${n}/${total} · ${date} · ${channel}`,
      recordedPrologue: ({ n, total }) => `Tercatat ${n}/${total}`,
      filed: 'Tulisan ulang disisihkan dari catatan.',
      rewrite: 'Tulisan ulang ikut masuk ke catatan.',
      ranks: 'Barisan tidak bisa diterobos. Kereta berhenti.',
      checkpoint: 'Titik simpan tercapai.',
      wall: 'Ini batas medan. Kereta kembali ke arah tengah.',
    },
    hints: {
      ride: { keys: 'W atau ↑ menjalankan kereta.', touch: 'Geser jari di sisi kiri layar untuk mengarahkan kereta.' },
      steer: { keys: 'A dan D, atau ← dan →, membelokkan kereta.', touch: 'Makin jauh jari digeser, makin tajam kereta berbelok.' },
      slow: { keys: 'Kurangi kecepatan menjelang lingkaran: S atau ↓ mengerem.', touch: 'Kurangi kecepatan menjelang lingkaran: tahan Rem.' },
      rewrites: {
        keys: 'Salinan abu-abu adalah tulisan ulang. Jika dilewati tanpa Mata, salinan itu ikut masuk ke catatan.',
        touch: 'Salinan abu-abu adalah tulisan ulang. Jika dilewati tanpa Mata, salinan itu ikut masuk ke catatan.',
      },
      sight: {
        keys: 'Mata (tahan K) memperlambat waktu dan menyisihkan tulisan ulang yang dilewati.',
        touch: 'Selama tombol Mata ditahan, waktu melambat dan tulisan ulang yang dilewati disisihkan.',
      },
      stop: { keys: 'S atau ↓ mengerem sampai kereta diam.', touch: 'Tahan Rem sampai kereta diam.' },
      surge: { keys: 'Shift memberi Laju, tambahan kecepatan sesaat di jalan lurus.', touch: 'Tombol Laju memberi tambahan kecepatan sesaat di jalan lurus.' },
      drift: {
        keys: 'Spasi menarik tali kekang: kereta menikung lebih tajam dan Laju terisi lebih cepat.',
        touch: 'Rem saat berbelok tajam menarik tali kekang: kereta menikung lebih tajam dan Laju terisi lebih cepat.',
      },
    },
    fail: {
      title: 'Catatan belum utuh',
      time: 'Waktu lakon ini habis sebelum catatannya lengkap.',
      muddied: 'Terlalu banyak tulisan ulang ikut masuk ke catatan.',
      retry: 'Ulangi dari titik simpan',
      skip: 'Lanjutkan cerita',
      skipNote: 'Sisa catatan lakon ini dilengkapi otomatis, lalu cerita berlanjut.',
      assist: 'Bantuan kemudi bisa dinyalakan di panel jeda.',
    },
    recordedScreen: {
      title: 'Tercatat',
      prologue: ({ n }) => `${n} anak panah tercatat. Semuanya bertanggal sebelum parva pertama.`,
      dates: 'Tanggal dalam berkas Pelapor',
      skipped: 'Sebagian catatan ini dilengkapi otomatis.',
    },
    settings: {
      title: 'Pengaturan',
      assist: 'Bantuan kemudi',
      easy: 'Kontrol mudah',
      retry: 'Ulangi dari titik simpan',
      toMarker: 'Langsung ke penanda teratai',
      still: 'Versi tanpa animasi',
    },
    slow: {
      message: 'Adegan 3D berjalan lambat di perangkat ini. Versi tanpa animasi memuat cerita dan catatan yang sama.',
      useStill: 'Pakai versi tanpa animasi',
      keepPlaying: 'Tetap bermain',
    },
    controlsKeys: [
      'W atau ↑: maju. S atau ↓: rem.',
      'A dan D, atau ← dan →: berbelok.',
      'Spasi: tarik tali kekang untuk menikung tajam.',
      'Shift: Laju, tambahan kecepatan sesaat.',
      'Tahan K: Mata. Waktu melambat; catatan asli bertanda teratai, tulisan ulang bertanda cincin retak.',
      'Enter atau E: lewati pembuka lakon.',
      'Esc atau P: jeda.',
    ],
    controlsTouch: [
      'Geser jari di sisi kiri layar untuk mengarahkan kereta.',
      'Dengan kontrol mudah, kereta berjalan sendiri.',
      'Rem: memperlambat. Rem saat berbelok tajam: tarik tali kekang.',
      'Laju: tambahan kecepatan sesaat.',
      'Tahan Mata: waktu melambat; catatan asli bertanda teratai, tulisan ulang bertanda cincin retak.',
      'Ketuk layar untuk melewati pembuka lakon.',
    ],
    controlsTitle: { keys: 'Papan ketik', touch: 'Layar sentuh' },
    report: {
      block: 'Catatan dalam angka dan peta',
      lead: 'Disusun dari berkas yang sama dengan laporan Sanjaya: siapa, kapan, pasal apa, dan sejauh mana penanganannya.',
      tiles: { names: 'Nama tercatat', fresh: 'baru', again: 'muncul lagi', acts: 'Dugaan perbuatan', replies: 'Tanggapan', pasal: 'Pasal dikutip', reports: 'Nomor laporan' },
      when: {
        title: 'Kapan peristiwanya bertanggal',
        day: 'Jumlah peristiwa per hari.',
        month: 'Jumlah peristiwa per bulan.',
        undated: ({ n }) => `${n} peristiwa lain hanya bertanggal bulan atau tahun.`,
      },
      pasal: { title: 'Pasal yang dikutip', note: 'Jumlah nama yang mengutip tiap pasal.', other: ({ items }) => `${items} pasal lain` },
      stages: {
        title: 'Sejauh mana penanganannya',
        note: 'Jumlah nama yang sudah sampai di tiap tahap.',
        steps: { terlapor: 'Tercatat', somasi: 'Somasi', aduan: 'Aduan', laporan: 'Laporan polisi', stpl: 'STPL' },
      },
      table: { show: 'Lihat tabel', key: 'Butir', value: 'Jumlah' },
      strip: {
        title: 'Posisi parva ini dalam cerita',
        events: 'Peristiwa parva ini',
        dates: 'Tanggal sebelum perang',
        stat: ({ n, from, to, channels }) => `${n} peristiwa · ${from} sampai ${to} · ${channels}`,
        statPrologue: ({ n, from, to }) => `${n} tanggal · ${from} sampai ${to}`,
      },
      finale: {
        months: 'Peristiwa per bulan di seluruh catatan',
        monthsNote: 'Pita bernomor menandai rentang tanggal tiap parva.',
        perChapter: 'Nama baru per bagian',
        perChapterNote: 'Nama yang pertama kali masuk catatan di tiap bagian.',
        pasalTop: 'Pasal yang paling sering dikutip',
        reports: 'Laporan polisi menurut waktu',
        lanes: { by: 'oleh Pelapor', against: 'terhadap Pelapor' },
      },
      chapterName: { prologue: 'Prolog', parva: ({ n }) => `Parva ${n}`, finale: 'Akhir' },
      map: {
        title: 'Peta hubungan 3D',
        hint: 'Seret untuk memutar, gulir atau cubit untuk memperbesar, tekan titik untuk melihat hubungannya.',
        still: 'Perangkat ini tidak bisa membuka 3D, jadi peta ditampilkan sebagai gambar diam.',
        aria: 'Peta hubungan antara Pelapor, terlapor, dan laporan polisi yang sudah tercatat',
        sources: { rw: 'Pelapor', perkara: 'Terlapor', laporan: 'Laporan polisi' },
        links: {
          'in-allegation': 'Perbuatan yang diduga Pelapor (dugaan)',
          'out-response': 'Tanggapan hukum Pelapor',
          against: 'Laporan pihak lain terhadap Pelapor',
          member: 'Termasuk dalam kelompok',
        },
        bright: 'Terang: bagian ini',
        dim: 'Redup: bagian sebelumnya',
        size: 'Ukuran titik = jumlah hubungannya.',
        selected: 'Titik terpilih',
        linksTitle: 'Hubungan',
        clear: 'Hapus pilihan',
        entry: 'Lihat entrinya',
        kinds: { center: 'Pelapor', hub: 'sumber', cluster: 'kelompok', member: 'butir' },
        rail: { label: 'Bagian cerita', all: 'Semua', prologue: 'Prolog', finale: 'Akhir', chapter: ({ n }) => `${n}`, walk: 'Putar perjalanan', pause: 'Jeda' },
        names: { perkara: 'Terlapor', laporan: 'Laporan polisi', 'lp:out': 'oleh Pelapor', 'lp:in': 'terhadap Pelapor' },
      },
    },
  },
  en: {
    title: 'BOWOBHARATA',
    description: "BOWOBHARATA, an allegory game on the Gelar Perkara file. Allegory and the author's opinion; the claims are the Pelapor's allegations, not police findings.",
    crumbMonitor: 'Monitor',
    entryLink: 'Play BOWOBHARATA',
    entryNote: "A playable version of this allegory. Allegory and the author's opinion.",
    monitorNote: "There is also BOWOBHARATA, a Mahabharata allegory game that uses this case-review file. Allegory and the author's opinion, not a statement of fact.",
    noscript: 'Loading the game… If it does not appear, enable JavaScript or read the page version.',
    dataError: { message: 'The game data failed to load.', retry: 'Try again' },
    readLink: 'Read the Bowobharata story',
    kicker: 'A playable Mahabharata allegory',
    gateTitle: 'Before you play',
    gateStart: 'Start playing',
    allegation: "The Pelapor's allegation, not a police finding. The presumption of innocence applies.",
    reply: 'Right of reply',
    prologueTitle: 'Before the War',
    prologueIntro: 'The record does not begin at Hastinapura. Some of it was written before the first parva.',
    sanjayaTitle: "Sanjaya's Report",
    sanjayaIntro: 'Sanjaya watches the battlefield from afar and reports what the dossier records for this part: who, the allegation, the articles cited and the report numbers.',
    sanjayaNone: 'No new names entered the record in this parva.',
    nameOnly: 'appears again',
    fields: { dugaan: 'Allegation', pasal: 'Articles cited', laporan: 'Report numbers', rows: 'Recorded events' },
    krishnaLine: {
      prologue: 'The arrows were in the ground before the war began. Record them one by one; do not strike back.',
      'dadu-di-hastinapura': 'Here there are only questions and writing. Record both and bring them to Sanjaya.',
      'duta-perdamaian': 'Krishna comes as an envoy, not a warrior. Deliver the letter, then bring the record to Sanjaya.',
      'sekutu-dan-perbandingan': 'Both sides weigh their strength. Record what can be checked; let the rewrites pass.',
      'perang-narasi': 'This is the longest part, including writing its own author says can be criticised. Record all of it as it was.',
      'senjata-data': 'Krishna does not take up arms. Here the weapon is data that anyone can re-test; record the results.',
      'somasi-kedua': 'A second warning. Keep everything in one place so the record stays whole.',
      'kurukshetra-digital': 'The field moves to the timeline and the comment sections, including the replies sent over and over. Record those too.',
      'dharma-menemukan-jalannya': 'The end is not a celebrated victory. What remains is the record, open to correction.',
      finale: 'Look at the whole record. Every entry is kept with its sources.',
    },
    hud: { sight: "Krishna's sight", pause: 'Pause' },
    catchSource: 'See it on the timeline, with its sources',
    fallbackNote: 'A version without animation: the same parva, events and Sanjaya reports, shown step by step.',
    finaleTotals: (t) => [
      `Sanjaya reported ${t.people} names and ${t.events} events.`,
      `${t.reportsBy} reports filed by Rahmat Wibowo, ${t.reportsAgainst} filed against Rahmat Wibowo.`,
      `${t.excludedE} other cases that are not defamation against the Pelapor are left out of this game.`,
      'Read the full dossier',
    ],
    finaleClose: 'All of it was aimed at one person: Rahmat Wibowo.',
    actions: { play: 'Begin', next: 'Continue', resume: 'Resume', take: 'Take into the record', again: 'Play again from the start' },
    armyNote: 'Here the Kurawa army is an allegory for the clamour of posts, reposts and comments that the Pelapor recorded. The rewritten copies on the field are only a game device, not any particular page. No soldier stands for any particular person, and no one can be hurt.',
    pelaporNote: 'The Pelapor in this file is Rahmat Wibowo, the author of this allegory.',
    hudFrame: "Allegory · the author's opinion",
    fullscreen: 'Full screen',
    types: { himpun: 'Gather', antar: 'Deliver', lintasan: 'Course', uji: 'Re-test' },
    lakonKicker: ({ label }) => `Episode · ${label}`,
    objectives: {
      roam: 'Drive to the lotus marker to begin the episode.',
      prologue: ({ done, total }) => `Record the arrows in the ground: ${done}/${total}`,
      collect: ({ done, total }) => `Record the palm leaves under the gold beams: ${done}/${total}`,
      tower: "Bring the record to Sanjaya's tower.",
      stop: 'Stop inside the circle for a moment.',
    },
    ride: { speedUnit: 'km/h', sight: 'Sight', surge: 'Surge', riuh: 'Clamour' },
    touch: { steer: 'Steer', brake: 'Brake', surge: 'Surge', sight: 'Sight', ride: 'Go' },
    toasts: {
      recorded: ({ n, total, date, channel }) => `Recorded ${n}/${total} · ${date} · ${channel}`,
      recordedPrologue: ({ n, total }) => `Recorded ${n}/${total}`,
      filed: 'The rewrite is kept out of the record.',
      rewrite: 'A rewrite went into the record.',
      ranks: 'The ranks cannot be driven through. The chariot stops.',
      checkpoint: 'Checkpoint reached.',
      wall: 'This is the edge of the field. The chariot turns back toward the centre.',
    },
    hints: {
      ride: { keys: 'W or ↑ drives the chariot forward.', touch: 'Slide a finger on the left of the screen to steer the chariot.' },
      steer: { keys: 'A and D, or ← and →, turn the chariot.', touch: 'The further the finger slides, the sharper the chariot turns.' },
      slow: { keys: 'Ease off before the circle: S or ↓ brakes.', touch: 'Ease off before the circle: hold Brake.' },
      rewrites: {
        keys: 'Grey copies are rewrites. If you ride through one without Sight, it goes into the record.',
        touch: 'Grey copies are rewrites. If you ride through one without Sight, it goes into the record.',
      },
      sight: {
        keys: 'Sight (hold K) slows time and sets aside any rewrite you ride through.',
        touch: 'While the Sight button is held, time slows and any rewrite you ride through is set aside.',
      },
      stop: { keys: 'S or ↓ brakes until the chariot stands still.', touch: 'Hold Brake until the chariot stands still.' },
      surge: { keys: 'Shift gives a Surge, a short gain in speed on a straight.', touch: 'The Surge button gives a short gain in speed on a straight.' },
      drift: {
        keys: 'Space pulls the reins: the chariot slides through the turn and the Surge refills sooner.',
        touch: 'Brake in a sharp turn to pull the reins: the chariot slides through and the Surge refills sooner.',
      },
    },
    fail: {
      title: 'The record is not whole yet',
      time: 'The time for this episode ran out before the record was complete.',
      muddied: 'Too many rewrites went into the record.',
      retry: 'Try again from the checkpoint',
      skip: 'Continue the story',
      skipNote: 'The rest of this episode is recorded automatically, and the story goes on.',
      assist: 'Steering assist can be turned on in the pause panel.',
    },
    recordedScreen: {
      title: 'On record',
      prologue: ({ n }) => `${n} arrows are on record, each dated before the first parva.`,
      dates: "Dates in the Pelapor's file",
      skipped: 'Part of this record was filled in automatically.',
    },
    settings: {
      title: 'Settings',
      assist: 'Steering assist',
      easy: 'Easy control',
      retry: 'Try again from the checkpoint',
      toMarker: 'Go straight to the lotus marker',
      still: 'Version without animation',
    },
    slow: {
      message: 'The 3D scene runs slowly on this device. The version without animation has the same story and records.',
      useStill: 'Use the version without animation',
      keepPlaying: 'Keep playing',
    },
    controlsKeys: [
      'W or ↑: drive. S or ↓: brake.',
      'A and D, or ← and →: steer.',
      'Space: pull the reins to slide through a sharp turn.',
      'Shift: Surge, a short gain in speed.',
      'Hold K: Sight. Time slows; real records show a lotus, rewrites a broken ring.',
      "Enter or E: skip the episode's opening.",
      'Esc or P: pause.',
    ],
    controlsTouch: [
      'Slide a finger on the left of the screen to steer the chariot.',
      'With easy control, the chariot moves on its own.',
      'Brake: slow down. Brake in a sharp turn: pull the reins.',
      'Surge: a short gain in speed.',
      'Hold Sight: time slows; real records show a lotus, rewrites a broken ring.',
      "Tap the screen to skip the episode's opening.",
    ],
    controlsTitle: { keys: 'Keyboard', touch: 'Touch screen' },
    report: {
      block: 'The record in numbers and a map',
      lead: "Drawn from the same file as Sanjaya's report: who, when, which articles, and how far each case has gone.",
      tiles: { names: 'Names on record', fresh: 'new', again: 'seen before', acts: 'Alleged acts', replies: 'Replies', pasal: 'Articles cited', reports: 'Report numbers' },
      when: {
        title: 'When the events are dated',
        day: 'Events per day.',
        month: 'Events per month.',
        undated: ({ n }) => `${n} more events are dated only to a month or year.`,
      },
      pasal: { title: 'Articles cited', note: 'Names citing each article.', other: ({ items }) => `${items} other articles` },
      stages: {
        title: 'How far the handling has gone',
        note: 'Names that have reached each step.',
        steps: { terlapor: 'On record', somasi: 'Somasi', aduan: 'Complaint', laporan: 'Police report', stpl: 'STPL' },
      },
      table: { show: 'Show the table', key: 'Item', value: 'Count' },
      strip: {
        title: 'Where this parva sits in the story',
        events: 'Events of this parva',
        dates: 'Dates before the war',
        stat: ({ n, from, to, channels }) => `${n} events · ${from} to ${to} · ${channels}`,
        statPrologue: ({ n, from, to }) => `${n} dates · ${from} to ${to}`,
      },
      finale: {
        months: 'Events per month across the record',
        monthsNote: "Numbered bands mark each parva's dates.",
        perChapter: 'New names per part',
        perChapterNote: 'Names entering the record in each part.',
        pasalTop: 'Articles cited most often',
        reports: 'Police reports over time',
        lanes: { by: 'by the Pelapor', against: 'against the Pelapor' },
      },
      chapterName: { prologue: 'Prologue', parva: ({ n }) => `Parva ${n}`, finale: 'Finale' },
      map: {
        title: '3D link map',
        hint: 'Drag to turn, scroll or pinch to zoom, press a point to see its links.',
        still: 'This device cannot open 3D, so the map is shown as a still picture.',
        aria: 'Link map of the Pelapor, the terlapor and the police reports on record so far',
        sources: { rw: 'Pelapor', perkara: 'Terlapor', laporan: 'Police reports' },
        links: {
          'in-allegation': 'Act alleged by the Pelapor (allegation)',
          'out-response': "The Pelapor's legal responses",
          against: 'Reports by others against the Pelapor',
          member: 'Belongs to group',
        },
        bright: 'Bright: this part',
        dim: 'Dim: earlier parts',
        size: 'Point size = number of links.',
        selected: 'Selected point',
        linksTitle: 'Links',
        clear: 'Clear selection',
        entry: 'See the entry',
        kinds: { center: 'Pelapor', hub: 'source', cluster: 'group', member: 'item' },
        rail: { label: 'Parts of the story', all: 'All', prologue: 'Prologue', finale: 'Finale', chapter: ({ n }) => `${n}`, walk: 'Play the journey', pause: 'Pause' },
        names: { perkara: 'Terlapor', laporan: 'Police reports', 'lp:out': 'by the Pelapor', 'lp:in': 'against the Pelapor' },
      },
    },
  },
};
