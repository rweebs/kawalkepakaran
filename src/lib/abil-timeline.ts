// Timeline of Abil Sudarman, the main figure of Case 001. Unlike the author's own timeline (src/lib/linimasa.ts), the subject
// here is what was claimed, recorded or reported about him. It adds no new facts: every entry rests on an item already on this
// site (a bukti entry or an article) or on a news report that the site already cites, and every entry states its limits.
// Entries without a source-stated date are listed last, never given an invented one.

export type Kind = 'klaim' | 'catatan' | 'liputan' | 'pernyataan' | 'peristiwa';
export type Bilingual = { id: string; en: string };
export type Source = { bukti: string } | { artikel: string } | { url: string; label: Bilingual };

export interface AbilEntry {
  id: string;
  /** `sort` orders the list; `id`/`en` are what the reader sees. */
  when: { sort: string; id: string; en: string };
  kind: Kind;
  /** When set, title, text and limits come from this bukti item (Indonesian and English), so nothing is re-worded here. */
  buktiId?: string;
  title?: Bilingual;
  text?: Bilingual;
  limits?: Bilingual;
  sources: Source[];
}

export const UNDATED_SORT = '9999';
const UNDATED = { sort: UNDATED_SORT, id: 'Tanggal tidak diketahui', en: 'Date unknown' };

export const KIND_LABEL: Record<Kind, Bilingual> = {
  klaim: { id: 'Klaim yang dipublikasikan', en: 'Published claim' },
  catatan: { id: 'Catatan resmi', en: 'Official record' },
  liputan: { id: 'Liputan pihak ketiga', en: 'Third-party coverage' },
  pernyataan: { id: 'Pernyataan pihak ketiga', en: 'Third-party statement' },
  peristiwa: { id: 'Peristiwa', en: 'Event' },
};

const ART_SCRUTINY = 'the-scrutiny-of-youth-influence-credentials-and-the-ai-era-in-indonesia-simmilarities-between-abil-sudarman-and-gibran-rakabuming-raka';
const ART_RESEARCH = 'deep-research-report-rahmat-wibowo-infraloka-vs-abil-sudarman-assai-a-confidence-scored-credential-verification';
const ART_ADUAN = 'aduan-068-abil-sudarman-reported-party-english';
const PEWARTA = 'https://www.pewartanusantara.com/berita/dibungkam-situs-ordal-id-kena-6-000-serangan-siber-usai-bongkar-borok-loker-komdigi/';

const PDDIKTI_LIMITS: Bilingual = {
  id: 'Tidak mencakup pendidikan di tempat lain, termasuk di luar negeri. Tanggal tangkapan layar tidak terlihat, dan atribusi ke PDDikti berasal dari penulis situs ini.',
  en: 'Does not cover education elsewhere, including abroad. The screenshot date is not visible, and the attribution to PDDikti comes from the author of this site.',
};

export const ABIL_ENTRIES: AbilEntry[] = [
  {
    id: 'pddikti-masuk',
    when: { sort: '2019-09-16', id: '16 September 2019', en: 'September 16, 2019' },
    kind: 'catatan',
    title: {
      id: 'Tercatat masuk program Sarjana PJJ Manajemen, Universitas Bina Nusantara',
      en: 'Recorded as entering the Bachelor of Management (distance learning) programme, Bina Nusantara University',
    },
    text: {
      id: 'Kartu data mahasiswa PDDikti mencatat tanggal masuk 16 September 2019 pada program Sarjana PJJ Manajemen, dengan status awal “Peserta didik baru”.',
      en: 'The PDDikti student data card records an entry date of 16 September 2019 in the Bachelor of Management (distance learning) programme, with the initial status “New student”.',
    },
    limits: PDDIKTI_LIMITS,
    sources: [{ bukti: '01-pddikti' }],
  },
  {
    id: 'pddikti-pengunduran-diri',
    when: { sort: '2022-09', id: 'Semester ganjil 2022/2023', en: 'Odd semester 2022/2023' },
    kind: 'catatan',
    title: {
      id: 'Status terakhir tercatat “Mengajukan pengunduran diri”',
      en: 'Latest status recorded as “Applied to resign”',
    },
    text: {
      id: 'Status terakhir pada kartu data yang sama adalah “Mengajukan pengunduran diri” untuk semester ganjil 2022/2023.',
      en: 'The latest status on the same card is “Applied to resign” for the odd semester 2022/2023.',
    },
    limits: {
      id: 'Tidak mencakup pendidikan di tempat lain, termasuk di luar negeri, dan tidak menyebut alasan pengunduran diri.',
      en: 'Does not cover education elsewhere, including abroad, and does not state a reason for the resignation.',
    },
    sources: [{ bukti: '01-pddikti' }],
  },
  {
    id: 'laporan-serangan-siber',
    when: { sort: '2026-01-31', id: '31 Januari 2026', en: 'January 31, 2026' },
    kind: 'liputan',
    title: {
      id: 'Media memberitakan sekitar 6.000 serangan siber terhadap Ordal.id',
      en: 'Media report about some 6,000 cyberattacks on Ordal.id',
    },
    text: {
      id: 'Pewarta Nusantara memberitakan bahwa Abil Sudarman melaporkan sekitar 6.000 serangan siber terhadap situs Ordal.id setelah mengunggah video tentang Komdigi.',
      en: 'Pewarta Nusantara reported that Abil Sudarman reported about 6,000 cyberattacks on the Ordal.id site after posting a video about Komdigi.',
    },
    limits: {
      id: 'Jumlah dan penyebab serangan berasal dari pernyataan yang dikutip media; situs ini tidak memverifikasinya.',
      en: 'The number and the cause of the attacks come from statements quoted by the media; this site has not verified them.',
    },
    sources: [{ url: PEWARTA, label: { id: 'Pewarta Nusantara, 31 Januari 2026', en: 'Pewarta Nusantara, 31 January 2026' } }],
  },
  {
    id: 'nemesis-assai',
    when: { sort: '2026-04', id: 'April 2026', en: 'April 2026' },
    kind: 'liputan',
    title: {
      id: 'Dasbor pengadaan Nemesis Assai diluncurkan',
      en: 'Procurement dashboard Nemesis Assai launched',
    },
    text: {
      id: 'Menurut tulisan penulis, Abil Sudarman dan timnya meluncurkan Nemesis Assai pada April 2026, dasbor peringatan dini berbasis AI untuk data pengadaan publik. Laporan riset penulis mencatat bahwa alat itu terdokumentasi secara independen oleh media (Kilat.com, Sentrasoft), sehingga keluaran teknisnya dapat diverifikasi.',
      en: 'According to the author’s articles, Abil Sudarman and the team launched Nemesis Assai in April 2026, an AI early-warning dashboard for public procurement data. The author’s research report notes that the tool was documented independently by media (Kilat.com, Sentrasoft), so its technical output can be verified.',
    },
    limits: {
      id: 'Tanggal peluncuran yang tepat tidak tercantum. Mutu dan keamanan alat itu tidak dinilai di sini.',
      en: 'The exact launch date is not stated. The quality and security of the tool are not assessed here.',
    },
    sources: [{ artikel: ART_SCRUTINY }, { artikel: ART_RESEARCH }],
  },
  {
    id: 'liputan-sentrasoft',
    when: { sort: '2026-04-28', id: '28 April 2026', en: 'April 28, 2026' },
    kind: 'liputan',
    buktiId: '09-liputan-sentrasoft',
    sources: [],
  },
  {
    id: 'aduan-068',
    when: { sort: '2026-09-21', id: '21 September 2026', en: 'September 21, 2026' },
    kind: 'peristiwa',
    title: {
      id: 'Dicantumkan sebagai terlapor T-3 dalam aduan penulis ke Polda Metro Jaya',
      en: 'Named as reported party T-3 in the author’s complaint to the Jakarta police',
    },
    text: {
      id: 'Pada 21 September 2026 penulis situs ini mengajukan aduan publik No. 068/ADUAN/RW/09/2026 kepada Polda Metro Jaya dan mencantumkan Abil Sudarman sebagai terlapor T-3, dengan meminta kepolisian memeriksa keterkaitannya. Penelaahan dalam aduan itu sendiri menilai keterkaitan tersebut belum terbukti.',
      en: 'On 21 September 2026 the author of this site filed public complaint No. 068/ADUAN/RW/09/2026 with the Jakarta Metropolitan Police (Polda Metro Jaya) and named Abil Sudarman as reported party T-3, asking the police to examine a possible connection. The review in the complaint itself assesses that connection as not proven.',
    },
    limits: {
      id: 'Aduan bukan temuan kepolisian maupun putusan pengadilan, dan tidak menyatakan bahwa Abil Sudarman bersalah. Keterangan yang menjadi dasar keterkaitan berasal dari penulis yang tidak diketahui, tanpa tanggal.',
      en: 'A complaint is not a police finding or a court ruling, and it does not state that Abil Sudarman is guilty. The statement that forms the basis of the connection comes from an unknown author and is undated.',
    },
    sources: [{ artikel: ART_ADUAN }],
  },
  // From here on the date is not stated in the source.
  { id: 'linkedin-london', when: UNDATED, kind: 'klaim', buktiId: '02-linkedin-pendidikan', sources: [] },
  { id: 'stimson-bio', when: UNDATED, kind: 'klaim', buktiId: '03-stimson', sources: [] },
  { id: 'situs-experiences', when: UNDATED, kind: 'klaim', buktiId: '04-situs-experiences', sources: [] },
  { id: 'tunaya-penghargaan', when: UNDATED, kind: 'klaim', buktiId: '05-tunaya-cto', sources: [] },
  { id: 'kartu-instructor', when: UNDATED, kind: 'klaim', buktiId: '06-kartu-instructor', sources: [] },
  { id: 'kursus-assai', when: UNDATED, kind: 'klaim', buktiId: '07-kursus-assai', sources: [] },
  { id: 'ideafest-2026', when: UNDATED, kind: 'klaim', buktiId: '08-ideafest', sources: [] },
  { id: 'bio-consultant-unesco', when: UNDATED, kind: 'liputan', buktiId: '16-bio-consultant-unesco', sources: [] },
  { id: 'unesdoc-administrasi', when: UNDATED, kind: 'catatan', buktiId: '14-unesdoc-acknowledgements', sources: [] },
  { id: 'komentar-unesco-jakarta', when: UNDATED, kind: 'pernyataan', buktiId: '13-komentar-unesco-jakarta', sources: [] },
];
