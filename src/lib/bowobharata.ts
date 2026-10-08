// Bowobharata: the author's own allegory of his linimasa, told as the Mahabharata. It adds no new factual claims: each parva
// only groups existing linimasa events (which carry their own sources) under an episode of the epic. The comparison is the
// author's opinion, and the posters are AI-generated illustrations.
import { EVENTS, getEvent, type TimelineEvent } from './linimasa';

export interface Parva {
  id: string;
  number: number;
  title: string;
  episode: string;
  paragraphs: string[];
  slugs: string[];
}

export const PAGE = {
  title: 'Bowobharata: Rahmat Wibowo vs Abil Sudarman',
  description: 'Bowobharata: Mahabharata sebagai kiasan perjalanan Rahmat Wibowo di Linimasa, Kebenaran vs Pembenaran. Pendapat penulis, ilustrasi AI, sumber di Bukti.',
  kicker: 'Kiasan Mahabharata',
  lead: 'Kebenaran vs Pembenaran. Saya menceritakan ulang perjalanan di Linimasa sebagai perang Kurukshetra: berbeda era, medan yang sama.',
};

export const FRAMING: string[] = [
  'Halaman ini adalah kiasan (alegori) dan pendapat saya, bukan putusan dan bukan pernyataan fakta. Saya memakai kisah Mahabharata untuk menceritakan ulang perjalanan saya di Linimasa.',
  'Poster di halaman ini adalah ilustrasi buatan AI. Cap dan tulisan di dalamnya adalah bagian dari ilustrasi dan pendapat saya; dasar faktualnya ada di Bukti dan Linimasa, lengkap dengan tautan sumber.',
  'Abil Sudarman berhak menjawab lewat hak jawab, dan jawabannya akan saya muat apa adanya.',
];

export const POSTERS = {
  wide: { alt: 'Poster Bowobharata: Rahmat Wibowo sebagai Basudewa Krishna di kiri dan Abil Sudarman sebagai Sengkuni di kanan, ilustrasi AI bertema Mahabharata.' },
  krishna: { alt: 'Ilustrasi AI Rahmat Wibowo sebagai Basudewa Krishna dengan seruling, bendera biru, dan kereta berkuda putih.' },
  sengkuni: { alt: 'Ilustrasi AI Abil Sudarman sebagai Sengkuni dengan dadu, topeng, dan papan permainan.' },
};

export const PARVAS: Parva[] = [
  {
    id: 'dadu-di-hastinapura', number: 1, title: 'Dadu di Hastinapura',
    episode: 'Permainan dadu Sengkuni di Hastinapura, tempat kemenangan ditentukan oleh dadu yang tidak jujur.',
    paragraphs: [
      'Dalam kiasan ini, permainan dadu adalah soal gelar, istilah kampus, dan citra yang saya pertanyakan: apakah yang ditampilkan sesuai dengan catatan publiknya.',
      'Pada tahap ini saya baru bertanya dan menulis. Isinya pendapat dan keraguan saya, bukan putusan.',
    ],
    slugs: ['bootcamp-berpakaian-kampus', 'mempertanyakan-gelar-university-of-london'],
  },
  {
    id: 'duta-perdamaian', number: 2, title: 'Duta Perdamaian',
    episode: 'Krishna datang ke Hastinapura sebagai duta sebelum perang, meminta penyelesaian tanpa pertempuran.',
    paragraphs: [
      'Sebelum memperpanjang perdebatan, saya memilih jalur yang tertib: somasi resmi dan investigasi terbuka dengan sumber yang bisa diperiksa.',
      'Somasi adalah surat peringatan. Isinya dugaan saya, bukan putusan.',
    ],
    slugs: ['somasi-pertama', 'investigasi-rinci-dan-kawal-kepakaran'],
  },
  {
    id: 'sekutu-dan-perbandingan', number: 3, title: 'Sekutu dan Perbandingan',
    episode: 'Kedua pihak mengumpulkan sekutu dan menimbang kekuatan sebelum Kurukshetra.',
    paragraphs: [
      'Saya membandingkan, menelusuri riwayat, dan mempersoalkan merek serta jabatan yang menurut saya perlu dijelaskan.',
      'Pembandingan ini adalah penilaian saya dan terbuka untuk dikoreksi.',
    ],
    slugs: ['perbandingan-dengan-ibrahim-arief', 'menelusuri-riwayat-pendidikan', 'merek-korika-dan-gelar-direktur-eksekutif', 'abil-sebagai-instruktur'],
  },
  {
    id: 'perang-narasi', number: 4, title: 'Perang Narasi',
    episode: 'Delapan belas hari Kurukshetra: perang panjang tempat kata dan strategi diuji.',
    paragraphs: [
      'Ini bagian terpanjang dan paling tidak rapi dari catatan saya: artikel riset, unggahan yang bahasanya keras, dan juga kiriman bernada mengejek. Saya mencatatnya apa adanya, termasuk yang menurut saya sendiri bisa dikritik.',
      'Kiasan perang tidak membenarkan bahasa yang keras; ia hanya menggambarkan lamanya perdebatan.',
    ],
    slugs: [
      'artikel-phantom-ceo-pertama', 'rangkaian-artikel-7-juni', 'unggahan-keras-13-juni', 'dikeluarkan-dari-grup-korika',
      'logo-di-halaman-career-blueprint', 'tembok-kertas-kampus-malaka-dan-assai', 'laporan-investigasi-dan-sorotan-anak-muda',
      'unggahan-22-juni', 'argumen-kemunafikan',
    ],
  },
  {
    id: 'senjata-data', number: 5, title: 'Senjata Data',
    episode: 'Krishna tidak mengangkat senjata, ia mengarahkan; di sini senjatanya data yang bisa diuji.',
    paragraphs: ['Saya membandingkan lima situs lewat PageSpeed supaya ukurannya berupa angka yang bisa diulang orang lain, bukan sekadar pendapat.'],
    slugs: ['benchmark-lima-situs'],
  },
  {
    id: 'somasi-kedua', number: 6, title: 'Somasi Kedua',
    episode: 'Peringatan kedua sebelum pertempuran berlanjut.',
    paragraphs: ['Saya mempublikasikan somasi kedua dan menerbitkan artikel-artikel saya di blog InfraLoka agar dokumentasinya tersimpan di satu tempat.'],
    slugs: ['somasi-kedua-kepada-korika', 'artikel-di-blog-infraloka'],
  },
  {
    id: 'kurukshetra-digital', number: 7, title: 'Kurukshetra Digital',
    episode: 'Medan perang berpindah ke linimasa dan kolom komentar.',
    paragraphs: ['Saya membalas kiriman di Threads dengan kalimat yang sama berulang kali, yang bisa terasa mengganggu, lalu meluncurkan situs Kawal Abil Sudarman agar pembahasannya berpindah ke tempat yang lebih tertib.'],
    slugs: ['balasan-berulang-di-threads', 'meluncurkan-kawal-abil-sudarman'],
  },
  {
    id: 'dharma-menemukan-jalannya', number: 8, title: 'Dharma Menemukan Jalannya',
    episode: 'Akhir Mahabharata bukan kemenangan yang dirayakan, melainkan pelajaran tentang dharma.',
    paragraphs: [
      'Sejauh ini hasilnya adalah dokumentasi: artikel diterjemahkan, hasil PageSpeed dipublikasikan, dan semuanya terbuka untuk dikoreksi.',
      'Tidak ada putusan di sini. Abil Sudarman berhak menjawab lewat hak jawab, dan jawabannya akan saya muat apa adanya.',
    ],
    slugs: ['menerbitkan-artikel-terjemahan', 'artikel-peluncuran-situs'],
  },
];

/** The events of a parva, in the order of the linimasa. */
export function parvaEvents(p: Parva): TimelineEvent[] {
  const order = new Map(EVENTS.map((e, i) => [e.slug, i]));
  return p.slugs
    .map((s) => getEvent(s))
    .filter((e): e is TimelineEvent => e !== undefined)
    .sort((a, b) => (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0));
}
