// Indonesian translation of the "Rahmat, Anak Langit" chapter of https://www.infraloka.co.id/story
// (source: infraloka/src/app/story/anak-langit/content.ts). Numbers live in sky-data.ts and are not translated.
import type { PlanetName } from './sky-data';

export const PLANET_NAMES_ID: Record<PlanetName, string> = {
  Sun: 'Matahari', Moon: 'Bulan', Mercury: 'Merkurius', Venus: 'Venus', Mars: 'Mars',
  Jupiter: 'Jupiter', Saturn: 'Saturnus', Uranus: 'Uranus', Neptune: 'Neptunus', Pluto: 'Pluto',
};

export const SIGN_NAMES_ID = ['Aries', 'Taurus', 'Gemini', 'Kanker', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagitarius', 'Kaprikornus', 'Akuarius', 'Pisces'];

export const LABELS = {
  eyebrow: 'Bab 02',
  title: 'Rahmat, Anak Langit',
  markersHeading: 'Tiga penanda utama: Matahari, Bulan, dan cakrawala',
  methodHeading: 'Cara perhitungannya',
  strengths: 'Kekuatan',
  watch: 'Yang perlu diwaspadai',
  advice: 'Saran dari tradisi-tradisi',
  systems: 'sistem',
  markers: 'penanda',
  agree: (n: number) => `${n} dari 5 sistem sepakat`,
  birthNight: 'malam kelahiran',
  retrograde: '(R)',
  ascendant: 'Ascendant',
  midheaven: 'Midheaven',
};

export const INTRO = {
  kicker: 'Sabtu · 13 Oktober 2001 · setelah Maghrib',
  subtitle: '"Anak dari Langit"',
  paragraphs: [
    'Rahmat lahir tak lama setelah matahari terbenam di atas Jakarta. Langit barat masih jingga, dan Mars bersinar merah hampir tepat di atas kepala.',
    'Menurut kalender Umm al-Qura, malam itu sudah 27 Rajab, malam yang diperingati sebagai Isra Mi\'raj.',
  ],
  badges: ['Libra ♎︎', 'Ular Logam 辛巳', 'Minggu Pon 12', 'Life path 8'],
  bridge:
    'Tradisi-tradisi yang berbeda membaca momen itu dengan caranya masing-masing. Saya tidak memegang satu pun sebagai ramalan. Saya memperlakukannya sebagai cermin: bahasa-bahasa tua yang penuh pertimbangan, yang dibangun berbagai budaya untuk merenungkan siapa kita dan bagaimana kita dapat bertumbuh.',
  portraitAlt: 'Rahmat Wibowo',
};

export const MARKERS = [
  {
    glyph: '☉︎',
    label: 'Matahari',
    value: 'Libra 20°',
    note: 'Timbangan Dewi Astraea. Adil, diplomatis, peka terhadap keindahan, selalu mencari keseimbangan.',
  },
  {
    glyph: '☽︎',
    label: 'Bulan',
    value: 'Virgo 4°',
    note: 'Bulan sabit tua, hanya 16% terang, tiga hari sebelum bulan baru. Perasaan diolah lewat kepedulian dan kerja yang praktis.',
  },
  {
    glyph: '↑',
    label: 'Ascendant',
    value: 'Aries 28°',
    note: 'Saat Maghrib Matahari berada di titik terbenam, sehingga yang terbit di timur adalah rasi yang berseberangan dengan Libra. Kesan pertama: berani, spontan, langsung.',
  },
];

export const SKY_MAP = {
  title: 'Langit saat Rahmat lahir',
  location: 'Jakarta · 18.15 WIB · 6,2° LS',
  howToRead:
    'Peta ini menghadap ke atas, seakan Anda berbaring dan memandang langit: utara di atas, timur di kiri. Tepi lingkaran adalah cakrawala dan pusatnya adalah zenit.',
  notes: [
    {
      title: 'Mars di atas kepala',
      text: 'Satu-satunya planet terang di langit adalah Mars, 71° di atas cakrawala, merah dan terang (magnitudo −0,2). Bulan, Venus, Jupiter, dan Saturnus semuanya berada di bawah cakrawala.',
    },
    {
      title: 'Senja belum gelap',
      text: 'Matahari baru 8° di bawah cakrawala barat, sehingga langit barat masih berpendar. Merkurius menempel pada Matahari dan terbenam bersamanya.',
    },
    {
      title: 'Bintang yang tampak',
      text: 'Altair hampir tepat di zenit, dengan Vega dan Deneb di utara. Di barat daya, Antares, jantung rasi Scorpius, menurun ke arah cakrawala. Di timur, Fomalhaut dan Bujur Sangkar Pegasus sedang terbit.',
    },
  ],
  legend: ['planet', 'bintang', 'ekliptika', 'pola bintang'],
};

export const WHEEL = {
  title: 'Roda zodiak Rahmat',
  caption: 'Peta natal · zodiak tropis · rumah whole-sign',
  intro:
    'Setiap planet diletakkan pada derajat ekliptikanya saat lahir. Garis-garis yang melintasi bagian tengah menandai sudut antarplanet (aspek) yang dibaca astrologi Yunani kuno. Seret roda untuk memutarnya.',
  legend: ['square / oposisi', 'trine / sextile', 'konjungsi'],
  callouts: [
    {
      label: 'Tanda terkuat',
      title: 'Mars di puncak langit',
      text: 'Mars di Kaprikornus 20°, hanya 5° dari Midheaven. Ascendant Aries menjadikan Mars penguasa peta ini. Mars juga berada di penempatan terkuatnya (eksaltasi).',
    },
    {
      label: 'Aspek terketat',
      title: 'Matahari □ Mars 90,3°',
      text: 'Nyaris tepat 90°. Dalam pembacaan klasik: dorongan dan tekad yang besar, tetapi mudah bergesekan dengan orang lain.',
    },
    {
      label: 'Pelindung',
      title: 'Jupiter di Kanker',
      text: 'Jupiter juga berada di eksaltasinya. Dua planet eksaltasi dalam satu peta jarang terjadi.',
    },
  ],
  tableCaption: 'Posisi planet saat lahir',
};

export const ISRA = {
  eyebrow: 'Rajab 1422 H',
  title: 'Lahir pada malam Isra Mi\'raj',
  lead:
    'Dalam kalender Hijriah, hari berganti saat Maghrib, sehingga kelahiran setelah Maghrib jatuh pada tanggal berikutnya. Kalender Umm al-Qura (Arab Saudi) dan kalender pemerintah Indonesia berbeda satu hari pada bulan itu.',
  days: [
    {
      when: 'Sab 13 Okt · setelah Maghrib',
      title: 'Rahmat lahir',
      moon: 'gold' as const,
      calendars: [
        { name: 'Umm al-Qura', value: 'malam 27 Rajab', star: true },
        { name: 'Kalender Indonesia', value: 'malam 26 Rajab' },
      ],
    },
    {
      when: 'Min 14 Okt · setelah Maghrib',
      title: 'Malam Isra Mi\'raj di Indonesia',
      moon: 'silver' as const,
      calendars: [
        { name: 'Umm al-Qura', value: 'malam 28 Rajab' },
        { name: 'Kalender Indonesia', value: 'malam 27 Rajab' },
      ],
    },
    {
      when: 'Sen 15 Okt',
      title: 'Libur Isra Mi\'raj, 1422 H',
      moon: 'dark' as const,
      calendars: [{ name: 'Kalender Indonesia', value: '27 Rajab' }],
    },
  ],
  newMoon: 'Bulan baru: 16 Okt',
  closing: [
    'Menurut Umm al-Qura, Rahmat lahir tepat pada malam 27 Rajab, malam yang diperingati sebagai Isra Mi\'raj. Menurut kalender Indonesia, ia lahir dua malam sebelum peringatan, di pekan yang sama.',
    'Tanggal pasti peristiwa Isra Mi\'raj sendiri masih diperdebatkan para ulama; 27 Rajab adalah tanggal peringatan yang paling umum.',
  ],
};

export const CHARACTER = {
  eyebrow: 'Benang merah lintas tradisi',
  title: 'Watak Rahmat',
  intro:
    'Setiap tradisi membaca kelahiran ini dengan caranya sendiri, tetapi beberapa sifat muncul berulang kali di banyak sistem. Titik-titik pada tiap kartu menunjukkan berapa dari lima sistem yang mendukung sifat itu.',
  summary:
    'Rahmat adalah api yang tahu cara menimbang. Dorongan untuk membangun dan memimpin kuat, tetapi ia menimbang sebelum bergerak, bekerja dengan cermat, dan menyimpan rencananya sampai waktunya tiba. Di balik ketenangan ada bara, dan di balik ambisi ada penghormatan pada akar dan hal yang sakral.',
  traits: [
    {
      glyph: '♂︎',
      title: 'Tekad yang membara',
      systems: 4,
      markers: 5,
      text: 'Sifat terkuat dalam peta ini. Ia punya energi untuk memulai, bertahan, dan menyelesaikan. Ia tidak nyaman diam di tempat dan lebih suka bergerak dan mengambil inisiatif. Begitu memutuskan, ia sulit dibelokkan. Tradisi Jawa dan Barat sama-sama melihat seorang perintis dan pemimpin.',
      evidence: [
        { system: 'Barat', detail: 'Mars di Midheaven, eksaltasi' },
        { system: 'Barat', detail: 'Ascendant Aries' },
        { system: 'Jawa', detail: 'Wuku Mandasiya, dewa api Brahma' },
        { system: 'Pythagoras', detail: 'Angka 8' },
        { system: 'Langit', detail: 'Mars bersinar di atas kepala' },
      ],
    },
    {
      glyph: '♎︎',
      title: 'Penyeimbang yang adil',
      systems: 4,
      text: 'Rahmat peka terhadap keadilan dan suasana di sekitarnya. Ia cenderung menjadi penengah, menghargai keindahan dan keteraturan, dan tidak menyukai konflik yang tidak perlu. Di permukaan ia tampak tenang dan sabar, sementara pikirannya menimbang banyak hal.',
      evidence: [
        { system: 'Barat', detail: 'Matahari di Libra, dewi Venus' },
        { system: 'Tionghoa', detail: 'Day master Tanah Yin' },
        { system: 'Jawa', detail: 'Pasaran Pon, tenang' },
        { system: 'Yunani', detail: 'Timbangan Astraea' },
      ],
    },
    {
      glyph: '☿︎',
      title: 'Pikiran yang teliti',
      systems: 4,
      text: 'Rahmat analitis dan memperhatikan detail. Ia suka memahami cara sesuatu bekerja sebelum memercayainya, dan pandai menyimpan strategi. Perasaannya sering diolah lewat pekerjaan praktis: ketika gelisah, ia cenderung merapikan atau memperbaiki sesuatu.',
      evidence: [
        { system: 'Barat', detail: 'Bulan dan Venus di Virgo' },
        { system: 'India', detail: 'Surya di Kanya' },
        { system: 'Tionghoa', detail: 'Tahun Ular, cerdik' },
        { system: 'Romawi', detail: 'Lahir pada jam Merkurius' },
      ],
    },
    {
      glyph: '♄︎',
      title: 'Pembangun jangka panjang',
      systems: 4,
      text: 'Ambisinya bukan kilatan sesaat. Rahmat ingin membangun sesuatu yang kokoh, tahan lama, dan berguna. Ia cocok dengan pekerjaan yang membutuhkan struktur dan tanggung jawab berat, dan cenderung serius soal karier, keuangan, dan reputasi.',
      evidence: [
        { system: 'Barat', detail: 'Mars di Kaprikornus, dekat MC' },
        { system: 'Pythagoras', detail: 'Angka 8, materi dan kekuasaan' },
        { system: 'Tionghoa', detail: 'Tanah 3 dan Logam 3' },
        { system: 'Jawa', detail: 'Gedhong lumbung (lumbung), wuku Mandasiya' },
      ],
    },
    {
      glyph: '☽︎',
      title: 'Jiwa yang berakar',
      systems: 4,
      text: 'Ada sisi reflektif dan spiritual yang tidak selalu terlihat. Rahmat menghargai keluarga, leluhur, dan tradisi, serta memiliki kepekaan batin yang kuat. Saat-saat sunyi dan malam hari sering menjadi waktu ia berpikir paling jernih.',
      evidence: [
        { system: 'India', detail: 'Chandra di Magha, bintang para leluhur' },
        { system: 'Hijriah', detail: 'Malam 27 Rajab' },
        { system: 'Helenistik', detail: 'Peta malam, dipimpin Bulan' },
        { system: 'Barat', detail: 'Jupiter di Kanker' },
      ],
    },
    {
      glyph: '☉︎',
      title: 'Hangat dan ingin bersinar',
      systems: 3,
      text: 'Rahmat memiliki harga diri yang tinggi dan ingin karyanya terlihat dan dihargai. Ia dermawan kepada orang-orang terdekat dan suka menjadi seseorang yang dapat diandalkan orang lain.',
      evidence: [
        { system: 'Jawa', detail: 'Hari Minggu, harinya matahari' },
        { system: 'India', detail: 'Chandra di Simha' },
        { system: 'Tionghoa', detail: 'Tanah Yin, mengasuh' },
      ],
    },
  ],
  strengths: [
    { title: 'Pemimpin yang berpikir', text: 'Berani mengambil keputusan, tetapi sudah menimbangnya lebih dulu.' },
    { title: 'Tangguh', text: 'Tidak mudah menyerah pada proyek yang berat atau panjang.' },
    { title: 'Rinci dan rapi', text: 'Mutu pekerjaannya dapat diandalkan.' },
    { title: 'Penengah', text: 'Mampu menjembatani orang-orang yang sedang berselisih.' },
  ],
  watchouts: [
    { title: 'Mudah tersulut', text: 'Matahari–Mars 90° dan peringatan wuku Mandasiya tentang kata-kata tajam saat marah.' },
    { title: 'Tarik-menarik batin', text: 'Libra menginginkan damai, Aries menginginkan cepat. Kadang ragu, lalu tiba-tiba bertindak.' },
    { title: 'Perfeksionis', text: 'Bulan di Virgo menetapkan standar tinggi, yang bisa berujung pada berpikir berlebihan.' },
    { title: 'Kurang lentur', text: 'Unsur Kayu yang kosong dalam BaZi, sehingga perubahan mendadak terasa berat.' },
  ],
  advice: [
    { title: 'Salurkan api', text: 'Olahraga, proyek besar, atau tantangan fisik menjaga Mars tetap sehat.' },
    { title: 'Jeda sebelum bicara', text: 'Nasihat primbon untuk Mandasiya: redakan amarah sebelum berucap.' },
    { title: 'Tumbuhkan unsur Kayu', text: 'Dalam BaZi: belajar hal baru, dekat dengan tanaman, dan sisakan ruang untuk perubahan.' },
    { title: 'Rawat akar', text: 'Magha dan malam Rajab: menjaga hubungan dengan keluarga dan mendoakan leluhur membawa ketenangan.' },
  ],
  disclaimer:
    'Watak ini disusun dari tafsir tradisional masing-masing sistem. Bacalah sebagai cermin untuk merenung, bukan vonis takdir. Pilihan dan usaha Rahmat sendiri tetap yang terpenting.',
};

export const TRADITIONS = {
  eyebrow: 'Satu kelahiran, enam cara membacanya',
  title: 'Rahmat dalam berbagai tradisi',
  items: [
    {
      id: 'javanese',
      name: 'Jawa',
      subtitle: 'Primbon · Pawukon · Pranata mangsa',
      headline: 'Minggu Pon, neptu 12, wuku Mandasiya',
      strip: [
        { when: 'Sabtu 13 Okt, siang', weton: 'Sabtu Pahing 18' },
        { when: 'Setelah Maghrib · Rahmat lahir', weton: 'Minggu Pon 12', highlight: true },
        { when: 'Minggu 14 Okt, setelah Maghrib', weton: 'Senin Wage 8' },
      ],
      paragraphs: [
        'Pada saat Maghrib, hari dan pasaran berganti bersamaan. Urutan pasaran adalah Legi → Pahing → Pon → Wage → Kliwon, sehingga setelah Sabtu Pahing datanglah Minggu Pon. Malam Sabtu itu disebut malam Minggu Pon.',
        'Weton: Minggu Pon (5 + 7 = 12), tanggal Jawa 26 Rejeb 1934. Sabtu Pahing sebelumnya memiliki neptu 18, yang tertinggi dari 35 weton.',
        'Wuku Mandasiya, dilindungi Batara Brahma (api). Pohon asam, burung platuk bawang. Jiwa yang berapi-api dan pekerja keras, dengan peringatan tentang kata-kata tajam saat marah.',
        'Mangsa: 13 Oktober adalah hari pertama Mangsa Kalima, awal musim hujan: pancuran emas sumawur ing jagad, pancuran emas yang bertebaran di seluruh dunia.',
      ],
    },
    {
      id: 'chinese',
      name: 'Tionghoa',
      subtitle: 'Shio · BaZi',
      headline: 'Ular Logam, day master Tanah Yin',
      pillars: [
        { label: 'Tahun', han: '辛巳', meaning: 'Ular Logam Yin' },
        { label: 'Bulan', han: '戊戌', meaning: 'Anjing Tanah Yang' },
        { label: 'Hari', han: '己酉', meaning: 'Ayam Tanah Yin' },
        { label: 'Jam', han: '癸酉', meaning: 'Ayam Air Yin' },
      ],
      paragraphs: [
        'Unsur: Tanah 3, Logam 3, Api 1, Air 1, Kayu 0.',
        'Tanah Yin diibaratkan tanah kebun: sabar dan mengasuh orang lain.',
        'Tanggal lunar: hari ke-27 bulan ke-8. Nayin tahun: Logam Lilin Putih.',
        'Pilar jam 癸酉 berlaku untuk kelahiran sebelum pukul 19.00. Jika kelahirannya antara pukul 19.00 dan 21.00, pilar jamnya adalah 甲戌 (Kayu Yang, Anjing).',
      ],
    },
    {
      id: 'greco-roman',
      name: 'Yunani & Romawi',
      subtitle: 'Helenistik · Pythagoras',
      headline: 'Peta malam, dipimpin Bulan',
      paragraphs: [
        'Sekte: lahir setelah matahari terbenam, sehingga peta "nokturnal". Pemimpin sekte adalah Bulan.',
        'Hari Romawi: Dies Saturni. Bangsa Romawi mengganti hari pada tengah malam, sehingga bagi mereka Rahmat lahir pada hari Sabtu, sementara hitungan Jawa dan Hijriah sudah memasuki hari Minggu.',
        'Jam planet: jam pertama setelah matahari terbenam pada hari Sabtu dikuasai Merkurius (urutan Kaldea), kira-kira pukul 17.46–18.46.',
        'Numerologi: 1+3+1+0+2+0+0+1 = 8: ambisi, kepemimpinan, urusan materi.',
      ],
    },
    {
      id: 'indian',
      name: 'India',
      subtitle: 'Jyotisha · sidereal',
      headline: 'Surya di Kanya, Chandra di Magha',
      paragraphs: [
        'Surya (Matahari) di Kanya (Virgo) 26°, nakshatra Chitra.',
        'Chandra (Bulan) di Simha (Leo) 10°, nakshatra Magha, bintang para leluhur dan takhta.',
        'Lagna (ascendant) Vrishabha (Taurus) selama hampir seluruh periode Maghrib.',
        'Zodiak sidereal bergeser sekitar 24° dari zodiak Barat, sehingga Matahari Libra dalam sistem Barat menjadi Kanya di India.',
      ],
    },
    {
      id: 'sundanese',
      name: 'Sunda',
      subtitle: 'Paririmbon',
      headline: 'Minggu Pon, naktu 12',
      paragraphs: [
        'Paririmbon memakai dasar yang sama: hari dan pasaran dijumlahkan menjadi naktu. Nama pasarannya sedikit berbeda (Legi disebut Manis, Kliwon disebut Kaliwon). Hari juga berganti saat Maghrib, sehingga hasilnya sama dengan hitungan Jawa.',
      ],
    },
    {
      id: 'balinese',
      name: 'Bali',
      subtitle: 'Pawukon · Otonan',
      headline: 'Saniscara Pahing, wuku Langkir',
      paragraphs: [
        'Bali memakai 30 wuku yang sama, tetapi hari umumnya dihitung dari matahari terbit. Menurut hitungan Bali, Rahmat tetap lahir pada hari Sabtu.',
        'Otonan, ulang tahun menurut Bali, datang setiap 210 hari.',
      ],
    },
  ],
};

export const METHOD = {
  paragraphs: [
    'Posisi planet dan bintang dihitung dengan PyEphem untuk Jakarta pukul 18.15 WIB. Jika kota atau waktu lahirnya berbeda, ascendant dan susunan langit akan bergeser; posisi planet di zodiak nyaris tidak berubah.',
    'Pembacaan watak diambil dari tradisi populer yang berbeda-beda antarsumber. Perlakukan sebagai warisan budaya, bukan ramalan yang pasti.',
  ],
  sources: [
    { label: 'Ki Demang: 13 Oktober 2001, weton dan wuku', href: 'https://ki-demang.com/almanak/?bl=10&do=watak&tg=13&th=2001' },
    { label: 'Kalender Hijriah 1422: Rajab dan Isra Mi\'raj', href: 'https://kalender-hijriyah-online.blogspot.com/p/1422.html' },
    { label: 'Kaweruh Jawa: Wuku Mandhasiya', href: 'https://kaweruhjawa.com/wuku-mandhasiya/' },
    { label: 'NU Jateng: perbedaan pendapat ulama tentang waktu terjadinya Isra Mi\'raj', href: 'https://jateng.nu.or.id/keislaman/perbedaan-pendapat-ulama-tentang-waktu-terjadinya-isra-mi-raj-FXkTA' },
  ],
};
