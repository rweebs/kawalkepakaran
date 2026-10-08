// The author's own dated record of what he wrote, sent and did about claims concerning Abil Sudarman.
// Compiled from the author's public posts. Each entry says what was done and links the source; it does not repeat
// anyone else's characterisation. Allegations are marked as the author's allegations, not findings.

export interface TimelineLink { label: string; url: string }
export interface TimelineRelated { label: string; href: string }
export interface TimelineEvent {
  slug: string;
  date: string; // YYYY-MM-DD
  title: string;
  channel: 'LinkedIn' | 'Blog InfraLoka' | 'Threads' | 'Situs ini';
  paragraphs: string[];
  sources: TimelineLink[];
  related: TimelineRelated[];
}

const LI = 'https://www.linkedin.com/feed/update/urn:li:activity:';
const PULSE = 'https://www.linkedin.com/pulse/';
const A = '/kasus/abil-sudarman/artikel/';

export const EVENTS: TimelineEvent[] = [
  {
    slug: 'bootcamp-berpakaian-kampus',
    date: '2026-04-26',
    title: 'Saya menulis tentang istilah kampus yang dipakai ASSAI',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menerbitkan analisis kritis tentang cara ASSAI, penyelenggara pelatihan nonformal yang didirikan Abil Sudarman, memakai istilah setingkat perguruan tinggi seperti "School", "Campus", "Cohort", dan "Enrollment", serta tentang cara dukungan dari UNESCO, KORIKA, Microsoft, dan ITB digambarkan dalam materinya.',
      'Tulisan ini adalah pendapat saya tentang pemosisian merek. Saya menganggapnya menyesatkan; itu penilaian saya, bukan putusan.',
    ],
    sources: [{ label: 'Tulisan di LinkedIn', url: PULSE + 'bootcamp-dressed-campus-critical-analysis-assais-academic-wibowo-xvjec' }],
    related: [],
  },
  {
    slug: 'mempertanyakan-gelar-university-of-london',
    date: '2026-05-02',
    title: 'Saya mempertanyakan klaim gelar University of London',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menulis beberapa unggahan yang mempertanyakan klaim gelar Computer Science (AI/ML) dari University of London. Dasarnya adalah catatan publik pendaftaran di program Manajemen BINUS Online yang tercatat mengundurkan diri pada 2022/2023, serta tidak adanya informasi pendukung tentang kredensial University of London itu.',
      'Dalam salah satu unggahan saya menulis tentang dugaan pemalsuan kredensial dan penggunaan logo organisasi besar tanpa izin, dan menyebut bahwa saya telah melaporkannya kepada tim hukum dan kepatuhan Microsoft dan UNESCO.',
    ],
    sources: [
      { label: 'Unggahan 1', url: LI + '7456368129279950848/' },
      { label: 'Unggahan 2', url: LI + '7456232246212071425/' },
      { label: 'Unggahan 3', url: LI + '7456213219469332480/' },
    ],
    related: [{ label: 'Halaman Bukti', href: '/kasus/abil-sudarman/bukti' }],
  },
  {
    slug: 'somasi-pertama',
    date: '2026-05-04',
    title: 'Saya mengajukan somasi resmi dan mengumumkannya',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya mengajukan somasi resmi kepada Abil Sudarman dan Abil Sudarman School of Artificial Intelligence, lalu mengumumkannya secara terbuka. Isi somasi menyebut dugaan klaim gelar universitas yang tidak benar, penggunaan logo tanpa izin, bootcamp tanpa akreditasi dengan merek "School" yang menurut saya menyesatkan, dan tidak adanya pendaftaran merek dagang.',
      'Somasi adalah surat peringatan. Isinya adalah dugaan saya; saya tidak menyatakannya sebagai putusan.',
    ],
    sources: [{ label: 'Pengumuman di LinkedIn', url: LI + '7457171192475574272/' }],
    related: [],
  },
  {
    slug: 'investigasi-rinci-dan-kawal-kepakaran',
    date: '2026-05-06',
    title: 'Saya menerbitkan investigasi dan Kawal Kepakaran',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menerbitkan investigasi rinci. Isinya: peran Executive Director KORIKA yang dikaitkan dengan Abil, padahal menurut penelusuran saya perannya di UNESCO adalah koordinasi di Project Management Office; gelar University of London dan BINUS yang tidak dapat saya verifikasi; dan klaim penghargaan "AI Innovator of the Year" tanpa dokumentasi yang saya anggap kredibel.',
      'Pada hari yang sama saya mengumumkan Kawal Kepakaran, sebuah komunitas verifikasi kredensial. Dalam pengumuman itu saya menyebut hasil penelusuran tentang Abil sebagai contoh, tanpa melampirkan bukti yang dapat diperiksa pihak lain secara mandiri.',
    ],
    sources: [
      { label: 'Investigasi', url: LI + '7457895177781661696/' },
      { label: 'Pengumuman Kawal Kepakaran', url: LI + '7457898104026198017/' },
    ],
    related: [{ label: 'Membuka Topeng Abil Sudarman: Ababil', href: A + 'unmasking-abil-sudarman-ababil' }],
  },
  {
    slug: 'perbandingan-dengan-ibrahim-arief',
    date: '2026-05-20',
    title: 'Saya membandingkan Ibrahim Arief dengan Abil Sudarman',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menulis perbandingan antara Ibrahim Arief, yang saya gambarkan sebagai pemimpin teknologi yang patriotik, dan Abil Sudarman, yang dalam unggahan itu saya kaitkan dengan dugaan kredensial yang dipalsukan dan sekolah AI tanpa akreditasi.',
      'Tujuan yang saya sebut dalam unggahan itu adalah mengkritik ekosistem teknologi yang menurut saya kurang memverifikasi kredensial dan kurang melindungi talenta yang nyata.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7462683042428624897/' }],
    related: [],
  },
  {
    slug: 'menelusuri-riwayat-pendidikan',
    date: '2026-05-27',
    title: 'Saya menelusuri riwayat pendidikan dan mempublikasikannya',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menyelidiki riwayat pendidikan Abil Sudarman dan secara terbuka mempertanyakan klaim lulusan University of London jurusan AI/ML Computer Science, dengan alasan belum adanya bukti verifikasi dan adanya catatan pendaftaran sebelumnya di program Manajemen BINUS Online. Ini keraguan dan penilaian saya berdasarkan bukti yang saya miliki, bukan putusan.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7465237756336582656/' }],
    related: [{ label: 'Halaman Bukti', href: '/kasus/abil-sudarman/bukti' }],
  },
  {
    slug: 'merek-korika-dan-gelar-direktur-eksekutif',
    date: '2026-05-29',
    title: 'Saya mengkritik merek KORIKA dan gelar Direktur Eksekutif',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya mengkritik pemakaian merek KORIKA tanpa izin pada masa lalu dan gelar Direktur Eksekutif yang menurut saya diangkat sendiri padahal berstatus magang. Dalam unggahan itu saya juga membandingkannya dengan cara saya sendiri berkontribusi, yang saya sebut rendah hati.',
      'Penilaian atas status magang dan gelar itu adalah pendapat saya; peran di KORIKA perlu dikonfirmasi oleh KORIKA.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7466006817727459328/' }],
    related: [],
  },
  {
    slug: 'abil-sebagai-instruktur',
    date: '2026-05-30',
    title: 'Saya mempersoalkan pemilihan Abil sebagai instruktur AI',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menulis bahwa Abil Sudarman terdaftar sebagai instruktur sebuah program pelatihan AI padahal berhenti dari program sarjananya pada 2022/2023, dan mempertanyakan standar pemilihan instruktur oleh penyelenggara.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7466588857606524930/' }],
    related: [],
  },
  {
    slug: 'artikel-phantom-ceo-pertama',
    date: '2026-06-01',
    title: 'Saya memposting artikel riset tentang Phantom CEO',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya memposting artikel riset tentang "Phantom CEO" di startup Gen Z. Artikel itu menyebut nama Marchel Shevchenko dan Abil Sudarman sebagai contoh pendiri yang menurut saya mengklaim jabatan secara tidak sah.',
      'Menyebut nama orang sebagai contoh dalam tulisan seperti ini bukan hal ringan. Penilaian dalam artikel itu adalah pendapat saya, dan keduanya berhak menjawab.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7467264517320839168/' }],
    related: [{ label: 'The Phantom CEO: Why Fraud Is Gen Z\'s Fastest Growing Side Hustle', href: A + 'the-phantom-ceo-why-fraud-is-gen-z-s-fastest-growing-side-hustle' }],
  },
  {
    slug: 'rangkaian-artikel-7-juni',
    date: '2026-06-07',
    title: 'Saya menerbitkan tiga artikel dan beberapa unggahan, 7 Juni',
    channel: 'LinkedIn',
    paragraphs: [
      'Pada hari ini saya menerbitkan artikel "The Phantom CEO: Why Fraud Is Gen Z\'s Fastest-Growing Side Hustle", artikel "The Phantom CEO Problem", dan artikel tentang celah verifikasi gelar luar negeri di Indonesia. Dua yang pertama menyebut Abil Sudarman, Marchel Shevchenko, dan Muhammad Alif Ramadhan; yang ketiga menyoroti ketidakkonsistenan klaim gelar luar negeri Abil dan Marchel, tanpa bukti yang telah diverifikasi pihak independen.',
      'Saya juga mempromosikan buletin saya "Professional BlackList", yang memuat ketiganya sebagai studi kasus.',
      'Dalam dua unggahan pendek, saya menyebut nama tiga orang muda yang mengklaim jabatan CEO dan founder, dan dalam salah satunya saya membandingkan mereka dengan seorang pendiri lain yang saya sebut telah dihukum karena penipuan. Perbandingan itu keras dan dapat membuat ketiganya terkait dengan perkara pidana di mata pembaca. Saya mencantumkannya apa adanya.',
    ],
    sources: [
      { label: 'Phantom CEO (artikel 1)', url: PULSE + 'phantom-ceo-why-fraud-gen-zs-fastest-growing-side-hustle-wibowo-z0c4c' },
      { label: 'Phantom CEO Problem (artikel 2)', url: PULSE + 'phantom-ceo-problem-when-gen-z-plays-founder-without-substance-9hlzc' },
      { label: 'Celah gelar luar negeri', url: PULSE + 'indonesias-blind-spot-foreign-degree-loophole-lets-fraud-wibowo-sct8c' },
      { label: 'Promosi buletin', url: LI + '7469522629352275968/' },
      { label: 'Unggahan pendek 1', url: LI + '7469320427425775617/' },
      { label: 'Unggahan pendek 2', url: LI + '7469325718234152960/' },
    ],
    related: [
      { label: 'The Phantom CEO Problem', href: A + 'the-phantom-ceo-problem-when-gen-z-plays-founder-without-the-substance-abil-sudarman-marchel-shevchenko-and-muhammad-alif-ramadhan' },
      { label: 'Titik Buta Indonesia: celah gelar luar negeri', href: A + 'indonesia-s-blind-spot-the-foreign-degree-loophole-that-lets-fraud-thrive-in-plain-sight-abil-sudarman-and-marchel-shevchenko' },
    ],
  },
  {
    slug: 'unggahan-keras-13-juni',
    date: '2026-06-13',
    title: 'Saya menulis unggahan dengan bahasa sangat keras, 13 Juni',
    channel: 'LinkedIn',
    paragraphs: [
      'Pada hari ini saya mengunggah beberapa kiriman tentang Abil Sudarman. Dalam satu unggahan saya menyebut skor ZeroGPT dan IQ saya sendiri, lalu menuduh Abil sebagai drop out BINUS yang mengajukan CV palsu ke KORIKA dan mendesak agar ia dilaporkan. Dalam unggahan lain, saya menandai banyak orang dan lembaga, menuduhnya melakukan kecurangan, pemalsuan kredensial, eksploitasi finansial, dan manipulasi dokumen, dan menyebutnya penipu yang harus disingkirkan dari Indonesia.',
      'Saya juga mempromosikan layanan InfraLoka "Somasi as a Service" sambil mencantumkan hal-hal yang saya tulis tentang Abil, dan menulis bahwa ia munafik karena membangun mereknya dengan mengkritik pendidikan AI lalu memasarkan sekolahnya sendiri.',
      'Bahasa pada hari ini adalah yang paling keras yang pernah saya pakai tentang Abil.',
    ],
    sources: [
      { label: 'Unggahan ZeroGPT/IQ', url: LI + '7471430730737430529/' },
      { label: 'Unggahan peringatan', url: LI + '7471439486082568192/' },
      { label: 'Promosi Somasi as a Service', url: LI + '7471483547787096064/' },
      { label: 'Unggahan tentang kemunafikan', url: LI + '7471506235301818369/' },
    ],
    related: [],
  },
  {
    slug: 'dikeluarkan-dari-grup-korika',
    date: '2026-06-15',
    title: 'Saya dikeluarkan dari grup KORIKA dan menyuarakannya',
    channel: 'LinkedIn',
    paragraphs: [
      'Pada 13 hingga 15 Juni saya mengunggah beberapa kiriman bahwa saya dikeluarkan dari grup WhatsApp dan grup AI KORIKA. Saya menyatakan bahwa pengeluaran itu terjadi karena saya menyuarakan dugaan saya tentang Abil Sudarman, menyebut nama tiga pengurus, mengutip pasal hukum yang menurut saya dilanggar, dan menyatakan akan menempuh jalur pidana dan perdata dalam 14 hari jika saya tidak dipulihkan.',
      'Alasan pengeluaran itu adalah dugaan saya. Saya tidak memiliki pernyataan resmi dari pihak KORIKA tentang alasannya. Bahasa ancaman hukum itu saya pakai di ruang publik; saya mencatatnya di sini.',
    ],
    sources: [
      { label: 'Unggahan 1', url: LI + '7471920759372713984/' },
      { label: 'Unggahan 2', url: LI + '7471921245903671297/' },
      { label: 'Unggahan 3', url: LI + '7471921773983240195/' },
      { label: 'Unggahan 4', url: LI + '7471921947162001408/' },
      { label: 'Unggahan tentang grup WhatsApp', url: LI + '7471445386906320896/' },
      { label: 'Tulisan di LinkedIn', url: PULSE + 'expelled-telling-truth-korika-politics-legal-case-lead-rahmat-wibowo-7uqyc/' },
    ],
    related: [{ label: 'Dikeluarkan karena Mengatakan Kebenaran', href: A + 'expelled-for-telling-the-truth-korika-s-politics-and-legal-case-lead-by-oskar-riandi-suryadiputra-liawatimena-and-indra-kesuma' }],
  },
  {
    slug: 'logo-di-halaman-career-blueprint',
    date: '2026-06-17',
    title: 'Saya menulis soal logo di halaman kursus Career Blueprint',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menulis bahwa halaman landing kursus "Career Blueprint" milik Abil Sudarman menampilkan logo perusahaan tanpa izin yang menurut saya menyiratkan dukungan, dan bahwa saya telah mendokumentasikannya dan akan menindaklanjutinya melalui jalur yang sesuai. Unggahan ini muncul dua kali (17 dan 18 Juni).',
      'Soal ada tidaknya izin adalah hal faktual yang belum saya konfirmasi dengan perusahaan-perusahaan itu.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7473045695290265601/' }],
    related: [],
  },
  {
    slug: 'tembok-kertas-kampus-malaka-dan-assai',
    date: '2026-06-18',
    title: 'Saya menerbitkan analisis regulasi Kampus Malaka dan ASSAI',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menerbitkan analisis regulasi yang berargumen bahwa Kampus Malaka dan ASSAI tidak dapat secara sah menjadi universitas dalam waktu singkat. Analisis itu juga menyebut bahwa para pendirinya, Ferry Irwandi, Sabda PS, dan Abil Sudarman, memiliki kredensial sarjana yang belum terverifikasi atau tidak lengkap menurut penelusuran saya, dengan nada yang mempertanyakan kualifikasi mereka. Artikel ini juga muncul pada 17 Juni.',
    ],
    sources: [{ label: 'Tulisan di LinkedIn', url: PULSE + 'paper-wall-why-university-cant-built-month-case-study-rahmat-wibowo-tw5yc' }],
    related: [{ label: 'The Paper Wall', href: A + 'the-paper-wall-why-a-university-can-t-be-built-in-a-month-case-study-of-abil-sudarman-school-of-artificial-intelligence-and-malaka-campus' }],
  },
  {
    slug: 'laporan-investigasi-dan-sorotan-anak-muda',
    date: '2026-06-18',
    title: 'Saya menerbitkan laporan investigasi dan sorotan anak muda',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menerbitkan laporan investigasi yang meragukan kredensial Abil Sudarman: gelar University of London, peran di UNESCO, dan penghargaan "AI Innovator of the Year" yang belum terverifikasi.',
      'Pada hari yang sama saya menerbitkan analisis yang membandingkan kekuasaan politik warisan Gibran Rakabuming Raka dengan kredensial teknis Abil. Dalam analisis itu saya menepis sebagian rumor tentang Abil sambil meragukan kualifikasi teknis Gibran. Penilaian dalam kedua tulisan itu adalah pendapat saya, bukan putusan.',
    ],
    sources: [
      { label: 'Laporan investigasi', url: PULSE + 'investigative-report-unpacking-credentials-abil-sudarman-wibowo-rni4c/' },
      { label: 'Sorotan atas pengaruh anak muda', url: PULSE + 'scrutiny-youth-influence-credentials-ai-era-indonesia-rahmat-wibowo-s0sqc/' },
    ],
    related: [
      { label: 'Laporan investigasi', href: A + 'investigative-report-unpacking-the-credentials-of-abil-sudarman' },
      { label: 'Sorotan atas Pengaruh Anak Muda', href: A + 'the-scrutiny-of-youth-influence-credentials-and-the-ai-era-in-indonesia-simmilarities-between-abil-sudarman-and-gibran-rakabuming-raka' },
    ],
  },
  {
    slug: 'benchmark-lima-situs',
    date: '2026-06-20',
    title: 'Saya membandingkan lima situs lewat PageSpeed',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menerbitkan perbandingan lima situs produk di Asia Tenggara lewat benchmark PageSpeed, dengan mempersoalkan apakah situs-situs itu benar-benar direkayasa atau hanya dibuat dengan "vibe coding". Dalam tulisan itu saya juga menyebut Abil Sudarman, Marchel Shevchenko, dan Muhammad Alif Ramadhan dan menulis tentang dugaan pemalsuan kredensial mereka.',
      'Perlu saya tegaskan: perbandingan itu juga menempatkan situs InfraLoka milik saya sendiri di samping situs-situs lain. Itu kepentingan saya, dan pembaca berhak mempertimbangkannya.',
    ],
    sources: [
      { label: 'Tulisan di LinkedIn', url: PULSE + 'five-sites-one-question-did-anyone-engineer-just-vibe-rahmat-wibowo-lzewc/' },
      { label: 'Unggahan pengantar', url: LI + '7473992256207605760/' },
    ],
    related: [],
  },
  {
    slug: 'unggahan-22-juni',
    date: '2026-06-22',
    title: 'Saya mengunggah kiriman bernada mengejek pada 22 Juni',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya mengulang penilaian saya tentang kemunafikan Abil Sudarman dan memposting ulang artikel tentang "CEO Hantu" yang menyebut Marchel Shevchenko dan Abil.',
      'Dalam satu unggahan saya menulis dengan nada mengejek bahwa Abil adalah drop out BINUS Online yang mengaku alumnus University of London, pakar UNESCO, dan pemenang penghargaan AI, sambil menyinggung jam tangan mewah yang ia kenakan. Nada ejekan itu pilihan saya dan saya mencatatnya di sini.',
    ],
    sources: [
      { label: 'Tentang kemunafikan', url: LI + '7474785234660511744/' },
      { label: 'Artikel CEO Hantu', url: LI + '7474786094811611136/' },
      { label: 'Unggahan bernada mengejek', url: LI + '7474785459873927168/' },
    ],
    related: [],
  },
  {
    slug: 'argumen-kemunafikan',
    date: '2026-07-02',
    title: 'Saya mengulang argumen soal kemunafikan dan logo',
    channel: 'LinkedIn',
    paragraphs: [
      'Saya menulis kembali argumen bahwa Abil Sudarman membangun mereknya dengan mengkritik pendidikan AI sebelum meluncurkan, melakukan rebranding, dan memasarkan sekolahnya sendiri sebagai lebih cepat daripada sekolah, dan mempertanyakan pemakaian logo perusahaan dalam iklan kursusnya. Saya menyebut ini ketidakkonsistenan yang menguntungkan dirinya; itu penilaian saya.',
    ],
    sources: [{ label: 'Unggahan di LinkedIn', url: LI + '7478271390631219200/' }],
    related: [],
  },
  {
    slug: 'somasi-kedua-kepada-korika',
    date: '2026-07-28',
    title: 'Saya mempublikasikan somasi kedua kepada KORIKA',
    channel: 'Blog InfraLoka',
    paragraphs: [
      'Saya mempublikasikan somasi kedua dan terakhir kepada KORIKA, menyatakan akan melapor ke polisi dan menempuh jalur pidana dan perdata, serta menuntut pemecatan tidak hormat terhadap para admin dan pimpinan, dengan tenggat 21 Juli 2026. Somasi itu terkait dugaan perundungan dan pencemaran nama baik terhadap saya.',
      'Somasi ini ditujukan kepada KORIKA dan pengurusnya, bukan kepada Abil Sudarman, tetapi lahir dari perselisihan yang sama. Isinya adalah posisi hukum saya, bukan putusan.',
    ],
    sources: [{ label: 'Tulisan di blog InfraLoka', url: 'https://www.infraloka.co.id/blog/somasi-kedua-dan-terakhir-study-case-of-korika' }],
    related: [{ label: 'Somasi Kedua dan Terakhir', href: A + 'somasi-kedua-dan-terakhir-study-case-of-korika' }],
  },
  {
    slug: 'artikel-di-blog-infraloka',
    date: '2026-07-28',
    title: 'Saya menerbitkan artikel-artikel saya di blog InfraLoka',
    channel: 'Blog InfraLoka',
    paragraphs: [
      'Saya menerbitkan di blog InfraLoka sejumlah artikel yang sebelumnya terbit di LinkedIn: laporan investigasi tentang kredensial Abil Sudarman, studi kasus Dunning-Kruger yang merinci tindakan hukum yang saya ajukan, tiga artikel "Phantom CEO", artikel tentang celah verifikasi gelar luar negeri, dan analisis Kampus Malaka dan ASSAI.',
      'Dalam salah satu artikel saya juga menyebut Abil dan sesama "phantom CEO" dengan nada mengejek dan membandingkan mereka dengan pembangunan InfraLoka milik saya. Saya mengakui perbandingan itu menguntungkan citra saya sendiri.',
    ],
    sources: [
      { label: 'Laporan investigasi', url: 'https://www.infraloka.co.id/blog/investigative-report-unpacking-the-credentials-of-abil-sudarman' },
      { label: 'Studi kasus Dunning-Kruger', url: 'https://www.infraloka.co.id/blog/the-dunning-kruger-effect-in-edtech-a-case-study-that-should-alarm-us-all' },
      { label: 'The Paper Wall', url: 'https://www.infraloka.co.id/blog/the-paper-wall-why-a-university-can-t-be-built-in-a-month-case-study-of-abil-sudarman-school-of-artificial-intelligence-and-malaka-campus' },
    ],
    related: [
      { label: 'Studi kasus Dunning-Kruger', href: A + 'the-dunning-kruger-effect-in-edtech-a-case-study-that-should-alarm-us-all' },
      { label: 'The Phantom CEO', href: A + 'the-phantom-ceo-why-fraud-is-gen-z-s-fastest-growing-side-hustle-abil-sudarman-muhammad-alif-ramadhan-marchel-shevchenko' },
    ],
  },
  {
    slug: 'balasan-berulang-di-threads',
    date: '2026-10-03',
    title: 'Saya membalas unggahan di Threads dengan kalimat yang sama',
    channel: 'Threads',
    paragraphs: [
      'Saya membalas unggahan beberapa pengguna di Threads, sedikitnya delapan kali, dengan kalimat yang sama: "waduch ada kasus apaan nich wahai terduga ababil??". Balasan itu muncul pada unggahan yang membahas ijazah, gelar, dan materi kelas Abil Sudarman, termasuk satu unggahan Abil sendiri.',
      'Mengirim kalimat yang sama berulang kali, termasuk di unggahan orang yang saya sebut, dapat terasa seperti gangguan. Saya mencatat kejadian ini karena ia memang terjadi, dan saya terbuka pada kritik atasnya.',
    ],
    sources: [],
    related: [],
  },
  {
    slug: 'meluncurkan-kawal-abil-sudarman',
    date: '2026-10-04',
    title: 'Saya meluncurkan situs Kawal Abil Sudarman',
    channel: 'Situs ini',
    paragraphs: [
      'Saya meluncurkan abilsudarman.my.id, situs publik yang mengumpulkan klaim tentang Abil Sudarman, artikel terjemahan, bukti, dan status verifikasinya. Situs ini menyatakan bahwa isinya adalah pendapat saya dan bukan putusan, serta bahwa Abil Sudarman berhak menjawab setiap entri, dan jawaban itu akan saya muat apa adanya.',
      'Kode situs ini terbuka agar siapa pun dapat memeriksa dan mengoreksinya.',
    ],
    sources: [{ label: 'Kode sumber di GitHub', url: 'https://github.com/rweebs/abilsudarman' }],
    related: [
      { label: 'Meluncurkan abilsudarman.my.id', href: A + 'meluncurkan-abilsudarman-my-id-situs-cek-fakta-open-source-dibuat-dengan-tangan-bukan-di-wix' },
      { label: 'Hak jawab', href: '/hak-jawab' },
    ],
  },
  {
    slug: 'menerbitkan-artikel-terjemahan',
    date: '2026-10-04',
    title: 'Saya menerbitkan 14 artikel terjemahan di situs ini',
    channel: 'Situs ini',
    paragraphs: [
      'Bersamaan dengan peluncuran situs, saya menerbitkan 14 artikel dalam terjemahan bahasa Indonesia: laporan investigasi, studi kasus, seri "Phantom CEO", analisis Kampus Malaka dan ASSAI, somasi kedua kepada KORIKA, laporan riset mendalam, audit AEGIS, dan dokumen aduan. Semuanya terbit pada 4 Oktober 2026.',
      'Setiap artikel diberi penanda klasifikasi (pendapat, fakta dengan bukti, atau laporan/aduan) dan keterangan terjemahan, serta mencantumkan judul asli dan penulisnya.',
    ],
    sources: [],
    related: [
      { label: 'Semua artikel', href: '/kasus/abil-sudarman/artikel' },
      { label: 'Laporan investigasi', href: A + 'investigative-report-unpacking-the-credentials-of-abil-sudarman' },
      { label: 'Laporan riset mendalam', href: A + 'deep-research-report-rahmat-wibowo-infraloka-vs-abil-sudarman-assai-a-confidence-scored-credential-verification' },
    ],
  },
  {
    slug: 'artikel-peluncuran-situs',
    date: '2026-10-05',
    title: 'Saya menerbitkan artikel peluncuran dan hasil PageSpeed',
    channel: 'Situs ini',
    paragraphs: [
      'Pada 5 Oktober saya menerbitkan artikel "Meluncurkan abilsudarman.my.id" yang menjelaskan cara situs ini dibangun, hasil PageSpeed (100 untuk Performance, Accessibility, Best Practices, dan SEO, serta 2/2 untuk Agentic Browsing, dari satu kali uji lab), dan perbandingan dengan abilsudarman.com yang menurut laporan saya sebelumnya dibangun di Wix.',
      'Artikel itu mencatat batasannya: temuan soal Wix berasal dari laporan saya sebelumnya dan belum saya verifikasi ulang, dan skor PageSpeed dapat bervariasi.',
    ],
    sources: [],
    related: [
      { label: 'Meluncurkan abilsudarman.my.id', href: A + 'meluncurkan-abilsudarman-my-id-situs-cek-fakta-open-source-dibuat-dengan-tangan-bukan-di-wix' },
    ],
  },
];

export const eventUrl = (e: TimelineEvent) => `/kasus/abil-sudarman/linimasa/${e.slug}`;
export const getEvent = (slug: string) => EVENTS.find((e) => e.slug === slug);

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
export const monthLabel = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** Events are stored oldest first; groups keep that order. */
export function groupByMonth(events: TimelineEvent[] = EVENTS): { label: string; items: TimelineEvent[] }[] {
  const groups: { label: string; items: TimelineEvent[] }[] = [];
  for (const e of events) {
    const label = monthLabel(e.date);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }
  return groups;
}

export function neighbours(slug: string): { prev?: TimelineEvent; next?: TimelineEvent } {
  const i = EVENTS.findIndex((e) => e.slug === slug);
  return { prev: i > 0 ? EVENTS[i - 1] : undefined, next: i >= 0 && i < EVENTS.length - 1 ? EVENTS[i + 1] : undefined };
}
