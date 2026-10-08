// Indonesian translation of "Finding Light in the Quiet", the founder's story at https://www.infraloka.co.id/story
// (source: infraloka/src/app/story/content.tsx). The closing MESSAGE is written for this site.

export interface Chapter {
  id: string;
  eyebrow: string;
  title: string;
  body: string[];
  pullQuote?: string;
  tags?: string[];
}

export const SOURCE_URL = 'https://www.infraloka.co.id/story';
export const LINKEDIN_URL = 'https://www.linkedin.com/in/rahmatwi/';

export const HERO = {
  kicker: 'Kisah Penggagas',
  title: 'Menemukan Cahaya dalam Keheningan',
  badges: ['Pemimpin berbasis AI', 'Pemimpin yang melayani'],
  lead: 'Catatan orang pertama tentang jalan yang ditempuh Rahmat Wibowo hingga mendirikan InfraLoka: perjuangan, data, kesehatan mental, dan upaya yang masih terus berjalan untuk membangun komunitas talenta teknologi Indonesia.',
  photoAlt: 'Rahmat Wibowo, penggagas gerakan Operasi Ababil dan pendiri InfraLoka',
};

export const chapters: Chapter[] = [
  {
    id: 'prolog',
    eyebrow: 'Prolog',
    title: 'Sang Pembelajar di Balik Gelar',
    body: [
      'Jika Anda melihat profil LinkedIn atau CV saya hari ini, Anda akan menemukan daftar sertifikasi, peran rekayasa, dan angka komunitas. Yang tidak ditunjukkan daftar itu adalah bahwa saya tetap, pertama dan terutama, seorang pembelajar biasa: seseorang yang lebih dari sekali tersandung, bersandar pada kebaikan orang lain, dan diberi lebih banyak kesempatan kedua daripada yang bisa saya hitung.',
      'Saya lahir pada 13 Oktober 2001. Perjalanan saya sejak itu melewati beberapa musim yang sulit: kesulitan makan akibat sensori sejak kecil, masa sekitar satu setengah tahun ketika saya nyaris sepenuhnya menarik diri dari dunia, dan, yang baru didiagnosis di usia dewasa, pikiran yang bekerja berbeda dari kebanyakan orang (ADHD dan Spektrum Autisme).',
      'Saya menuliskan kisah ini bukan untuk merayakan capaian, melainkan untuk mendokumentasikannya dengan jujur. Jika ada yang berguna di sini, saya berharap ia menjadi teman dan secercah cahaya kecil bagi siapa pun yang saat ini diam-diam sedang berjuang dengan pertempurannya sendiri.',
    ],
  },
  {
    id: 'nama',
    eyebrow: 'Bab 01',
    title: 'Nama Adalah Sebuah Janji',
    body: [
      'Saya lahir lewat operasi caesar darurat, dan hari-hari pertama hidup saya dihabiskan di inkubator rumah sakit: awal yang kritis, menurut semua cerita keluarga saya. Orang tua saya semula mempertimbangkan nama Azri Hafisuddin: Azri, berarti "penolong", dan Hafisuddin, "penjaga iman". Pada akhirnya mereka memilih Rahmat Wibowo, berpijak pada doa sederhana: agar rahmat, kasih sayang, menandai hidup saya dengan berkah, manfaat, dan kepedulian terhadap sesama.',
      'Doa itu menjadi kompas, terutama ketika tubuh dan pikiran saya bertemu lebih banyak keterbatasan daripada yang dialami kebanyakan anak sejak dini. Sejak bayi hingga sekitar usia enam tahun, saya sungguh-sungguh kesulitan makan, yang kini saya pahami sebagai ARFID (Avoidant/Restrictive Food Intake Disorder), terkait dengan sensitivitas sensori yang kuat. Tubuh saya mudah menolak tekstur padat, dan sementara anak-anak lain menjelajahi dunia rasa, saya bertahan hidup dengan susu dan segelintir makanan lunak yang hambar.',
      'Saya baru mencicipi ayam goreng di kelas tiga SD, mi ayam di semester pertama kuliah, dan baru bisa menghabiskan semangkuk bubur ayam tanpa rasa tidak nyaman di semester tujuh, di sebuah warung kecil di Cisitu, Bandung. Saat itu saya tidak memahaminya, tetapi akarnya adalah perbedaan pemrosesan sensori yang berkaitan dengan ciri spektrum autisme.',
      'Keluarga saya memiliki warisan Jawa yang kuat dari Yogyakarta, dengan garis keturunan yang, menurut penuturan keluarga, ditelusuri hingga masa Kesultanan Demak. Yang penting bagi saya bukan mitos tentang darah bangsawan, melainkan pengingat bahwa setiap keluarga membawa sejarahnya sendiri dan perannya sendiri dalam membentuk siapa kita nantinya.',
    ],
  },
  {
    id: 'itb',
    eyebrow: 'Bab 03',
    title: 'Institut Teknologi Bandung (2019–2023)',
    body: [
      'Diterima di Institut Teknologi Bandung (ITB) terasa seperti amanah yang sangat besar, yang saya merasa berutang usaha terbaik untuk menjaganya. Di antara ribuan mahasiswa berbakat dari seluruh Indonesia, saya berusaha memberikan semua yang saya punya. Pada tahun pertama saya dinobatkan sebagai Mahasiswa Baru Terbaik dengan IPK 4,00, dan pada 2023 saya lulus Cum Laude dengan gelar Sarjana Teknik.',
      'Di balik hasil-hasil itu ada pikiran yang bekerja dalam ledakan-ledakan yang waktu itu belum saya ketahui namanya. Pikiran saya dan suara para dosen sering berputar berjam-jam setelah kuliah, sebuah pola yang berkaitan dengan ciri neurodivergen yang baru saya pahami bertahun-tahun kemudian. Itu membuat saya cepat menyerap materi, tetapi juga membuat pikiran saya jarang beristirahat.',
      'Saya percaya bahwa teori di kelas perlu diuji di dunia nyata sedini mungkin, jadi saya mulai mencari magang dan proyek sampingan di mana pun saya bisa. Pada April 2021, saya mendapat yang pertama: magang fullstack Android di PT Cybertrend Intrabuana, disusul proyek-proyek lepas yang mengasah kemampuan memecahkan masalah dan memberi saya gambaran tentang apa yang sebenarnya dibutuhkan industri perangkat lunak.',
    ],
  },
  {
    id: 'industri',
    eyebrow: 'Bab 04',
    title: 'Belajar dari Industri (2021–2023)',
    body: [
      'Antara 2021 dan 2023, saya beruntung dibentuk oleh para mentor dan rekan satu tim di beberapa organisasi, masing-masing mengajarkan sesuatu yang masih saya bawa hingga kini.',
      'Di Grab (Agu 2021–Feb 2022), sebagai Software Engineer Intern di tim DigitalGoods, saya mendapat kursi barisan depan untuk melihat bagaimana sistem yang melayani jutaan pengguna dibangun dan dirawat: kode yang disiplin, code review yang ketat, dan budaya yang mengutamakan keandalan.',
      'Di Bangkit Academy (Feb–Jul 2022), kolaborasi antara Google, Tokopedia, Gojek, dan Traveloka, tim saya masuk 53 terbaik dari ratusan tim. Di situlah minat saya pada infrastruktur cloud berakar: mengelola REST API dengan Go di Google Cloud Run, bekerja dengan PostgreSQL, dan mengorkestrasi pipeline machine learning sederhana.',
      'Magang singkat sebagai Solutions Architect di Amazon Web Services di Singapura (Jun–Agu 2022) memperluas pandangan saya tentang seperti apa sistem yang dirancang dengan baik, hemat biaya, dan aman secara global, yang saya pelajari langsung dari para praktisi di seluruh kawasan.',
      'Dan di Xendit (Feb 2022–Jul 2023), di bawah bimbingan para senior yang sabar dan cakap, saya menjadi engineer DevOps dan Cloud seperti sekarang: merampingkan infrastruktur AWS demi efisiensi biaya, menulis modul Terraform yang dapat dipakai ulang untuk RDS dan ElastiCache, mengonfigurasi jaringan Amazon EKS dengan Security Group dan kebijakan Calico, menerapkan AWS VPC Endpoint, mempelajari deployment GitOps dengan ArgoCD, serta mendukung kepatuhan PCI DSS dan kesiapan pemulihan bencana. Setiap tonggak di sana adalah kerja tim dan hadiah dari bimbingan yang sabar, bukan sesuatu yang saya bangun sendirian.',
    ],
  },
  {
    id: 'jejaring',
    eyebrow: 'Bab 05',
    title: 'Jejaring yang Dibangun Satu Percakapan demi Satu Percakapan',
    body: [
      'Di suatu titik pada masa itu, saya mulai membentuk kebiasaan: menuliskan apa yang saya pelajari dan membagikannya di LinkedIn. Yang bermula dari lingkaran kecil teman sekelas perlahan tumbuh seiring saya aktif dalam diskusi, menjalani magang, dan menulis tentang pelajaran teknis yang saya dapat.',
      'Bagan di halaman aslinya bagi saya bukan angka untuk pamer: ia adalah catatan ribuan momen ketika seseorang memilih untuk terhubung, membalas, atau membagikan sesuatu yang berguna.',
    ],
    pullQuote: 'Setiap titik pada garis itu adalah seseorang yang murah hati dengan waktunya.',
  },
  {
    id: 'vietnam',
    eyebrow: 'Bab 06',
    title: 'Melangkah ke Tim Regional: Vietnam (2024–2025)',
    body: [
      'Pada 2024, saya mengambil peran Cloud Engineer di Kota Ho Chi Minh, Vietnam (Feb 2024–Agu 2025). Bekerja dalam tim lintas budaya menguji kemampuan komunikasi dan adaptasi saya, dan yang sama pentingnya, kerendahan hati saya dalam memahami bagaimana tim internasional sebenarnya bekerja.',
      'Saya membantu memodernisasi infrastruktur dari AWS CloudFormation ke Terraform, membangun modul Terraform standar agar sesama pengembang dapat melakukan deployment dengan aman, belajar membangun pipeline CI/CD dengan GitHub Actions untuk rilis bertahap, dan memakai Ansible untuk menyederhanakan manajemen konfigurasi rutin.',
      'Di samping pekerjaan, saya menyisihkan waktu untuk menguji pemahaman teori saya lewat ujian sertifikasi, bukan sebagai piala, melainkan sebagai cara disiplin untuk menutup celah pengetahuan yang kalau dibiarkan bisa mengecewakan tim di lapangan.',
    ],
    tags: [
      'AWS Certified Solutions Architect – Associate',
      'AWS Certified Developer – Associate',
      'AWS Certified SysOps Administrator – Associate',
      'Google Cloud Certified – Associate Cloud Engineer',
      'CompTIA Security+',
      'HashiCorp Certified: Terraform Associate',
      'AWS Certified Cloud Practitioner',
      'Cisco Verified – DevNet Associate',
    ],
  },
  {
    id: 'keberagaman',
    eyebrow: 'Bab 07',
    title: 'Yang Diajarkan Jejaring yang Beragam kepada Saya',
    body: [
      'Jejaring profesional, bagi saya, adalah ruang kelas yang luas. Setiap orang yang saya kenal membawa sesuatu yang baru untuk dipelajari: dari para praktisi AWS dan pendiri perusahaan yang menjadi sumber kebijaksanaan, hingga mahasiswa dan lulusan baru yang mengingatkan saya persis dari mana saya memulai.',
      'Memandang jejaring itu, yang membentang dari pendiri dan pimpinan tingkat C hingga peserta magang, tersebar di bidang rekayasa, data, produk, desain, dan manajemen, terus mengubah cara saya memikirkan teknologi: bukan sebagai spesialisasi yang sempit, melainkan sesuatu yang paling baik dipahami lewat banyak sudut pandang sekaligus.',
    ],
  },
  {
    id: 'musim-tersulit',
    eyebrow: 'Bab 08',
    title: 'Musim yang Paling Sulit',
    body: [
      'Karier dan teknologi hanyalah sebagian dari kisah ini. Bagian yang paling mengubah cara saya memandang hidup terjadi ketika saya berada di titik terendah.',
      'Selama kira-kira satu setengah tahun, saya menarik diri hampir sepenuhnya dari dunia luar, masa yang mendekati apa yang di Jepang dikenal sebagai hikikomori. Saya tinggal di rumah, tidak bekerja, dan nyaris tidak bisa berinteraksi dengan siapa pun di luar keluarga inti. Pikiran saya dipenuhi kecemasan berat, ketakutan berlebihan terhadap dunia luar, dan mimpi-mimpi sulit yang berulang yang terkait dengan pengalaman masa lalu.',
      'Saya mencari bantuan medis di Bandung dan mendapat pengobatan yang bertujuan meredakan suasana hati. Itu membantu menenangkan intensitasnya, meskipun untuk beberapa waktu tubuh dan pikiran saya juga terasa melambat, seakan terbungkus kabut tebal.',
      'Atas saran keluarga dan orang-orang terdekat, saya mencari evaluasi yang lebih menyeluruh di RSKD Duren Sawit, Jakarta. Di sana, para psikiater dan tenaga klinis mendengarkan riwayat saya secara utuh: dari perkembangan masa kecil, kesulitan sensori sejak bayi, hingga fokus saya yang mudah teralihkan dan kepekaan emosi yang tinggi.',
      'Setelah evaluasi klinis menyeluruh, saya didiagnosis dengan ADHD dan Gangguan Spektrum Autisme, kondisi yang tidak dikenali selama lebih dari dua dekade. Dengan pengobatan yang tepat dan diawasi dengan cermat, kabut di pikiran saya perlahan mulai terangkat. Untuk pertama kalinya, saya bisa menikmati lebih banyak ragam makanan tanpa rasa tidak nyaman.',
      'Saya belajar memahami bahwa membawa kombinasi ciri tertentu, sisi analitis yang lebih tajam berdampingan dengan kepekaan neurologis yang nyata, bukanlah alasan untuk merasa lebih tinggi atau lebih rendah daripada siapa pun. Itu semata kondisi yang harus dikelola dengan bijak, dengan disiplin, dan dengan rasa syukur.',
      'Membangun kembali kemampuan saya untuk terhubung dengan orang lain membutuhkan kerja yang disengaja, selangkah demi selangkah. Kepercayaan diri dan keterampilan sosial saya sungguh-sungguh terkikis. Sebagai seorang engineer, saya bersandar pada perangkat yang saya kenal: berlatih percakapan sehari-hari dengan chatbot AI dan eksperimen NLP sederhana, bersama sesi rehabilitasi psikososial di rumah sakit.',
    ],
    pullQuote: 'Hampir setiap orang yang kita lewati di jalan mungkin sedang berjuang dalam pertempuran sunyi yang tidak kita ketahui.',
  },
  {
    id: 'melayani-lagi',
    eyebrow: 'Bab 09',
    title: 'Melayani Kembali',
    body: [
      'Begitu kesehatan saya mulai stabil, saya merasakan dorongan yang jelas untuk mengembalikan energi yang saya punya untuk berkontribusi bagi orang lain.',
      'Di Rakamin Academy (Jul 2025), saya berkesempatan membimbing peserta program IT OPS ODP Batch 2 milik BNI, yang mencakup Java Spring Boot, ELK Stack, dasar-dasar keamanan web (OWASP), dan basis data. Mengajar ternyata merupakan ujian terbaik apakah saya benar-benar memahami apa yang saya pelajari sendiri.',
      'Di PT Pertamina Marine Solutions (Agu 2025–Mar 2026), sebagai DevOps dan Software Engineer, saya mendukung tim TI dan berkoordinasi dengan pengembang internal serta mitra vendor: membantu merampingkan biaya cloud Microsoft Azure dan merencanakan Reserved Instances, mendukung aplikasi AI internal yang dibangun dengan .NET, React, dan Azure OpenAI menggunakan pendekatan Retrieval-Augmented Generation untuk dokumentasi internal, menstandarkan konfigurasi infrastructure-as-code dengan Terraform, meningkatkan transparansi tiket Service Desk, dan menyusun usulan peta jalan TI untuk efisiensi jangka panjang.',
      'Pengalaman itu melatih saya berkomunikasi dengan beragam pemangku kepentingan, dari sesama engineer hingga pimpinan senior, dengan bahasa yang tetap santun dan berorientasi pada solusi.',
      'Di luar teknologi, saya juga mulai menjadi relawan agen perjalanan Umrah di Jakarta, membantu para jemaah mempersiapkan perjalanan mereka ke Tanah Suci, ruang pengabdian yang tenang yang terus mengingatkan saya untuk tetap membumi dan memberi dengan tulus.',
    ],
  },
  {
    id: 'momentum',
    eyebrow: 'Bab 10',
    title: 'Momentum Kembali',
    body: [
      'Seiring pulihnya kesehatan fisik dan mental saya, hubungan saya dengan komunitas pun kembali menghangat. Menengok ke belakang pada saat jejaring saya tumbuh paling cepat, masa tersibuk memuncak sekitar September 2023, bukan kebetulan, tetapi terkait langsung dengan musim ketika saya paling aktif belajar, meraih sertifikasi, dan membuka ruang berbagi bersama sesama anggota komunitas.',
      'Meskipun latar belakang saya berakar di cloud dan DevOps, beberapa pertukaran yang paling memuaskan datang dari percakapan dengan orang-orang di bidang data, produk, desain, dan manajemen, yang masing-masing mengasah cara saya melihat masalah teknologi dari lebih dari satu sudut.',
    ],
  },
  {
    id: 'langkah-baru',
    eyebrow: 'Bab 11',
    title: 'Langkah Baru, Jangkauan Lebih Luas (2026–Sekarang)',
    body: [
      'Memasuki 2026, saya berusaha membagi waktu secara sengaja antara pekerjaan profesional, inisiatif komunitas, dan pengabdian kepada sesama.',
      'Sejak April 2026, saya mendukung sebuah tim rekayasa yang berbasis di Bavaria, Jerman, sebagai Senior DevOps Engineer (Konsultan), bekerja di bawah pimpinan rekayasa setempat untuk menjaga keandalan sistem AWS dan Azure, mengoptimalkan beban kerja kontainer di ECS dan Kubernetes, serta mengotomatiskan deployment.',
      'Kolaborasi singkat dengan tim di Liven pada April 2026 memungkinkan saya membantu meninjau praktik penanganan insiden dengan rujukan SRE standar, ikut dalam diskusi AI Guild internal mereka, dan membantu memulai klub berbagi buku sederhana untuk tim.',
      'Dan saya terus menyisihkan waktu untuk melayani para jemaah sebagai agen perjalanan Umrah di Jakarta, pengingat bahwa pengabdian yang bermakna tidak harus berada di dalam sebuah jabatan.',
    ],
  },
  {
    id: 'infraloka',
    eyebrow: 'Bab 12',
    title: 'Mendirikan InfraLoka',
    body: [
      'Karena saya ingat betapa bingungnya saya dulu ketika mencoba menemukan arah sendiri di dunia teknologi, saya mendirikan InfraLoka pada Maret 2026 dari keyakinan sederhana: ia harus menjadi jembatan bagi talenta teknologi Indonesia untuk belajar bersama, bertukar pengalaman, dan menjangkau peluang global.',
      'Selangkah demi selangkah, bersama teman-teman yang memiliki visi yang sama, kami membangun forum diskusi terbuka dan ruang belajar di Discord dan kanal edukasi, inisiatif mentoring dan sesi berbagi pengetahuan bersama para praktisi infrastruktur, jejaring talenta muda yang terus mendalami Cloud, DevOps, dan Platform Engineering, serta konten edukasi berbahasa Indonesia yang ditulis agar benar-benar mudah dipahami.',
      'Misi ini tidak pernah tentang capaian pribadi. Ini tentang bagaimana kita tumbuh lebih jauh, bersama-sama, sebagai satu ekosistem, dan tentang memanfaatkan AI secara sengaja dan sering, agar setiap orang dalam perjalanan itu bisa bergerak lebih cepat dan dilayani lebih baik.',
    ],
  },
  {
    id: 'angka',
    eyebrow: 'Bab 13',
    title: 'Jejaring dalam Angka',
    body: [
      'Jika saya mundur selangkah dan menuangkan beberapa tahun terakhir ke dalam angka, inilah hasil perjalanan hadir, berbagi, dan terhubung itu.',
    ],
    pullQuote: 'Di balik setiap metrik di sini ada orang sungguhan yang meluangkan waktu untuk berbincang, berbagi ilmu, dan menawarkan dukungan.',
  },
  {
    id: 'refleksi',
    eyebrow: 'Bab 14',
    title: 'Refleksi dan Rasa Syukur',
    body: [
      'Jika ada yang bertanya mengapa saya memilih mendokumentasikan perjalanan ini sedemikian rinci, jawaban jujurnya adalah rasa syukur. Setiap orang memulai dari garis yang berbeda, dengan keistimewaan dan pergumulan yang berbeda. Menengok ke belakang, dari anak yang kesulitan makan, menjadi mahasiswa yang bergulat dengan pikirannya sendiri, hingga seseorang yang pernah menarik diri dari dunia selama satu setengah tahun, saya menyadari betapa banyak yang saya utangkan kepada rahmat Tuhan, dukungan keluarga, dan bimbingan para dokter serta sahabat sepanjang jalan.',
      'Secara statistik, menghadapi tantangan kesehatan mental yang serius sambil tetap menyelesaikan studi dan membangun karier bukanlah jalan yang mudah. Tetapi saya tidak melihatnya sebagai bukti bahwa saya istimewa. Saya melihatnya sebagai pengingat bahwa tidak ada keadaan yang benar-benar mustahil untuk dipulihkan, jika kita mau meminta bantuan dan menolak menyerah.',
      'Setiap kesempatan yang diberikan kepada saya (kuliah di ITB, magang di perusahaan teknologi, hingga akhirnya mendirikan InfraLoka) adalah amanah yang harus saya bayar dengan terus membantu siapa pun yang membutuhkan uluran tangan.',
      'Jika membantu untuk merangkum bidang teknis yang terus saya pelajari dan dalami: platform cloud di AWS, Google Cloud, dan Microsoft Azure; infrastructure-as-code dan konfigurasi dengan Terraform dan Ansible; kontainer dan orkestrasi dengan Docker, Kubernetes, dan ArgoCD; observabilitas dengan Datadog, CloudWatch, dan Prometheus/Grafana; bahasa pemrograman termasuk Go, Python, TypeScript, C#, dan Java; kerangka kerja web seperti React, Next.js, .NET, dan Spring Boot; serta basis data meliputi PostgreSQL, Redis, MongoDB, dan MySQL.',
      'Tetapi di atas semua perangkat dalam daftar itu, nilai yang paling saya pelajari dari tahun-tahun tersulit sederhana saja: kerendahan hati untuk terus belajar, keberanian untuk meminta bantuan ketika terasa sakit, dan ketulusan dalam mengulurkan tangan kepada orang lain.',
    ],
  },
  {
    id: 'penutup',
    eyebrow: 'Penutup',
    title: 'Sepatah Kata bagi Siapa Pun yang Sedang Berjuang',
    body: [
      'Jika Anda membaca ini sambil merasa sendirian dalam gelap, tertinggal, atau lelah merawat kesehatan mental Anda sendiri, percayalah: Anda tidak melaluinya sendirian, dan ini tidak akan selalu seberat ini.',
      'Kesehatan, ketenangan pikiran, dan kemampuan untuk tersenyum kembali tidak datang kepada saya dalam semalam. Semuanya dibangun perlahan, satu napas dan satu hari pada satu waktu. Jika hari ini terasa sangat berat, tidak apa-apa untuk beristirahat sejenak, menarik napas dalam-dalam, dan menjangkau bantuan profesional ketika Anda membutuhkannya. Selalu ada harapan, dan hari esok yang lebih cerah masih menunggu di depan.',
    ],
  },
];

export const STATS = [
  { label: 'Total koneksi', value: '3.114' },
  { label: 'Perusahaan unik', value: '1.851' },
  { label: 'Posisi unik', value: '2.076' },
  { label: 'Tahun aktif', value: '6' },
  { label: 'Rata-rata koneksi baru per bulan', value: '37' },
  { label: 'Perusahaan teratas', value: 'Amazon Web Services' },
  { label: 'Bulan puncak', value: 'Sep 2023' },
  { label: 'Keragaman jejaring', value: '59%' },
];

// Written for this site, in the tone of the author's earlier "Pesan dari Penulis".
export const MESSAGE = {
  title: 'Pesan kepada Abil Sudarman dan Masyarakat Indonesia',
  paragraphs: [
    'Menulis dan membangun situs ini bukan pekerjaan yang ringan, karena ia menuntut saya berdiri di antara dua hal yang sama-sama saya junjung: keberanian mempertanyakan, dan kewajiban untuk adil. Karena itu, izinkan saya menitipkan beberapa pesan, sebagai sesama manusia yang juga bisa keliru, bukan sebagai hakim.',
  ],
  toAbil: {
    title: 'Untuk Abil Sudarman',
    paragraphs: [
      'Situs ini tidak saya bangun untuk menjatuhkan Anda. Setiap klaim di sini berstatus "sedang diperiksa", dan "belum ada konfirmasi" tidak berarti klaim itu salah. Pintu hak jawab terbuka lebar: tanggapan Anda akan saya muat apa adanya, tanpa penyuntingan, bersama tulisan yang bersangkutan.',
      'Jika ada yang keliru, tunjukkan buktinya, dan saya akan memperbaikinya dengan lapang dada serta meminta maaf atas kekeliruan saya. Jika bukti yang Anda miliki menjawab hal-hal yang dipersoalkan di sini, maka terjawabnya kebenaran itulah kemenangan bagi kita berdua dan bagi masyarakat yang selama ini memercayai.',
      'Saya pun diuji dengan ukuran yang sama. Kepentingan saya sudah saya ungkapkan, dan kerangka bukti yang sama saya terapkan pada diri saya sendiri. Kita sama-sama manusia yang dititipi amanah; semoga kita sama-sama dimampukan menjaganya.',
    ],
  },
  toPublic: {
    title: 'Untuk Masyarakat Indonesia',
    paragraphs: [
      'Jangan hanya percaya kepada saya. Periksa sendiri: bukti di halaman Bukti dapat Anda buka, kode situs ini terbuka, dan setiap tulisan menyebut sumbernya. Bila Anda menemukan kekurangan, kabari saya.',
      'Pegang teguh praduga tak bersalah dan hak jawab. Kritislah, tetapi tetap adil: jangan merundung, jangan menyebarkan data pribadi, jangan menambah-nambah kabar yang belum terbukti. Kita memeriksa klaim, bukan menghancurkan seseorang.',
      'Kredensial itu penting karena anak-anak muda kita menaruh harapan dan mempercayakan masa depannya kepada gelar dan jabatan. Menjaganya tetap jujur adalah kepentingan kita bersama.',
    ],
  },
  closing: [
    'Dan bagi siapa pun yang saat ini sedang diuji, entah oleh perkara hukum, nama baik, atau keadaan hidup yang berat: tetaplah semangat. Semua penderitaan yang engkau alami adalah jalan untuk semakin mengenal Tuhan, dan semua kebenaran, cepat atau lambat, akan terungkap pada akhirnya. Tidak ada satu pun perjuangan yang sia-sia.',
    'Jangan jadikan kemenangan sebagai tujuan akhir perjuanganmu, dan jangan jadikan kekalahan sebagai alasan untuk putus asa. Jadikanlah perjuangan sebagai ikhtiar, upaya terbaik yang bisa engkau berikan, lalu berpasrahlah kepada Tuhan sebagai tawakal. Dengan begitu, ketika menang engkau tidak merasa sombong, dan ketika kalah engkau tidak merasa putus asa.',
    'Inilah semangat servant leadership yang saya coba jalani: bahwa kepemimpinan dan perjuangan sejati bukan tentang menang atas orang lain, melainkan tentang melayani kebenaran dan memberi manfaat bagi sesama, sekalipun harus melalui jalan yang berat.',
  ],
  signature: '— Rahmat Wibowo',
};
