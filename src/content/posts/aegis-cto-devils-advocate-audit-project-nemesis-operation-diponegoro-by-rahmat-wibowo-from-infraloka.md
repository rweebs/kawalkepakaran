---
title: "Audit Devil's Advocate CTO AEGIS: Project Nemesis (Operasi Diponegoro) milik Abil Sudarman dari ASSAI Oleh Rahmat Wibowo dari InfraLoka"
originalTitle: "AEGIS CTO Devil's Advocate Audit: Project Nemesis (Operation Diponegoro) Of Abil Sudarman from ASSAI By Rahmat Wibowo From InfraLoka"
author: "Rahmat Wibowo"
translationDate: 2026-10-04
classification: pendapat
subjects: ["Abil Sudarman", "Rahmat Wibowo"]
translationStatus: final
---
![](/img/case-studies-image-fixed.png)

*Audit ketelitian rekayasa atas Nemesis, dasbor anomali warga milik InfraLoka untuk data pengadaan publik, dijalankan melalui persona CTO / Engineering Depth Critic Modul [H] AEGIS dan dibandingkan dengan Google SRE Workbook, dengan skor komposit CTO 2,7/10 dan putusan GAGAL.*

**AEGIS Modul [H] — Panel Devil's Advocate CTO**
**Audit Ketelitian Rekayasa Project Nemesis (Operasi Diponegoro)**
**Dibandingkan dengan Google SRE Workbook**

Disiapkan untuk: Rahmat Wibowo, CEO, InfraLoka
Persona panel yang dipanggil: CTO — Engineering Depth Critic (AEGIS Modul [H] v2.0)
Kerangka pembanding: *The Site Reliability Workbook* (Beyer, Murphy, Rensin, Kawahara, Thorne — Google, O'Reilly)
Repositori yang diaudit: `nemesis` (cabang `rahmat-comment`), dasbor publik di assai.id/nemesis
Tanggal: 2026-07-22

---

## 1. Metodologi & Cakupan

Ini adalah penerapan satu persona dari AEGIS Modul [H], yaitu hanya CTO / Engineering Depth Critic, sebagaimana diminta secara eksplisit. Persona CEO, CRO, dan Elite Hacker berada di luar cakupan putaran ini; bila sebuah temuan menyentuh keamanan, temuan itu dilaporkan sebagai kesenjangan disiplin rekayasa, bukan uji penetrasi penuh.

**Dalam cakupan:** `backend/` (API Express 5 + better-sqlite3 dan ETL), `frontend/` (HTML/CSS/JS statis), `README.md`, `backend/.env` / `.env.example`, akar repositori (CI/CD, IaC, kontainerisasi, kebersihan VCS), dan kritik pengguna sendiri dalam `my comments.md`.

**Di luar cakupan:** Model yang di-*fine-tune* yang disebut dalam README ("🟡 Sedang berjalan"), infrastruktur produksi langsung di balik assai.id, dan sistem sumber SIRUP pemerintah itu sendiri.

**Sumber yang ditinjau:** `backend/src/{app,server,config,db,db-transfer,dashboard-repository,seed}.js`, `backend/package.json`, `backend/.env` / `.env.example`, `frontend/index.html`, `frontend/assets/js/{app,map}.js`, `README.md`, `.gitignore`, `git log` / `git ls-files`, dan `the-site-reliability-workbook-next18.pdf` (Google SRE Workbook, Bagian I–IV: Engagements, Processes, Culture, Bab 1–34).

Setiap temuan di bawah ini mengutip berkas dan baris tertentu. Ketika Workbook dipakai sebagai pembanding, bab yang relevan disebutkan namanya; laporan ini tidak memparafrasekan kekayaan intelektual Google, melainkan menerapkan kerangka yang didokumentasikan secara publik (SLO, anggaran galat, empat sinyal emas, toil, canarying, konfigurasi-sebagai-kode) sebagai rubrik evaluasi, sebagaimana persona CTO Modul [H] sudah melakukannya untuk platform NLP/AI.

## 2. Ringkasan Eksekutif

Nemesis adalah misi yang patut dipuji, yaitu mengubah data e-budgeting publik (SIRUP) menjadi dasbor anomali yang dapat dibaca warga, namun mengenakan kerangka rekayasa yang tidak akan lolos dari tinjauan kesiapan produksi (PRR) Google dan, pada sumbu integritas bukti, tidak akan lolos dari Audit Metodologi AEGIS. Kritik awal pengguna sendiri (`my comments.md`) arahnya benar dan, setelah memeriksa kode, terlalu ringan: tidak ada alur data sama sekali dalam repositori ini; seluruh kisah ingesti hanyalah "unduh zip yang dibuat orang lain dan letakkan di sebuah folder" (`README.md:33–46`). Kekhawatiran tentang scraping, legalitas, dan halusinasi yang diajukan adalah nyata, dan audit ini menambahkan sembilan temuan rekayasa lain yang belum diungkap kritik awal, yang paling kritis: berkas lingkungan ter-commit ke kontrol versi (`backend/.env`, tidak tercakup `.gitignore`), tidak ada pengujian otomatis, tidak ada CI/CD, tidak ada kontainer, tidak ada IaC, dan tidak ada SLO, anggaran galat, atau telemetri sinyal emas apa pun untuk alat publik yang seluruh proposisi nilainya adalah cukup tepercaya untuk menyebut nama orang.

**Skor Komposit CTO: 2,7 / 10 — GAGAL** (lihat §7 untuk rubrik; menurut aturan ambang Modul [H], satu temuan integritas data yang kritis saja sudah membatasi sumbu ini, dan ada tiga).

Ini bukan putusan atas misinya. Ini putusan atas apakah basis kode saat ini adalah kendaraan yang semestinya dipakai misi itu untuk meluncur.

## 3. Inventaris Bukti

| # | Artefak | Jenis | Asal-usul |
|---|---|---|---|
| E1 | `backend/src/*.js` (7 berkas) | Kode sumber | Dibaca penuh, sesi ini |
| E2 | `backend/package.json` | Manifes dependensi | Dibaca penuh |
| E3 | `backend/.env`, `backend/.env.example` | Konfigurasi runtime | Dibaca + dibandingkan |
| E4 | `frontend/index.html`, `assets/js/{app,map}.js` (1.685 LOC) | Kode sisi klien | Dibaca penuh |
| E5 | `README.md` | Dokumentasi proyek | Dibaca penuh |
| E6 | `.gitignore`, `git ls-files`, `git log -- backend/.env` | Kebersihan VCS | Pemeriksaan shell |
| E7 | `my comments.md` | Kritik awal pengguna sendiri | Dibaca penuh |
| E8 | Site Reliability Workbook (PDF, 19.173 baris terekstrak) | Kerangka pembanding | Ekstraksi pdftotext, pencarian bab terarah |
| E9 | Hasil pencarian untuk `*.yml`, `*.yaml`, `Dockerfile*`, `*.test.js` | Pemeriksaan ketiadaan bukti | Pencarian seluruh repositori, nol hasil |

## 4. Analisis CTO — Kritik Kedalaman Rekayasa

### 4.1 Temuan CTO-01 (KRITIS): Tidak ada silsilah data — rantai bukti audit itu sendiri tidak dapat diaudit

`README.md:23–27` menautkan dua artefak dataset yang telah diproses sebelumnya yang dijelaskan sebagai "dianalisis oleh GPT-5.4" dan "dianalisis oleh GPT-5.4-mini". `backend/src/seed.js`, satu-satunya kode ETL dalam repositori, tidak melakukan scraping, tidak memanggil LLM, dan tidak memvalidasi asal-usul. Kode itu mengasumsikan berkas `.sqlite` / `.jsonl` yang sudah jadi telah memuat bidang seperti `isMencurigakan` ("mencurigakan"), `isPemborosan` ("boros"), `potensiPemborosan` ("potensi pemborosan"), dan `reason` (alasan) (`seed.js:807–819`), lalu memuatnya secara mekanis.

Artinya, klaim terpenting yang dibuat seluruh produk ini, bahwa paket pemerintah tertentu ini mencurigakan, diproduksi seluruhnya di hulu, oleh proses yang tidak ada dalam repositori ini, tidak dapat direproduksinya, dan tidak dapat diberi versi. Persona CTO Modul [H] memperlakukan pola persis ini sebagai temuan pertama yang wajib untuk setiap alur yang memberi label buatan mesin kepada subjek dunia nyata (lihat Pembelajaran Institusional L1 Modul [H], diadaptasi di sini dari peracunan anotasi menjadi peracunan tuduhan): tidak ada skor kesepakatan antar-penilai/antar-model antara dua dump hasil analisis independen GPT-5.4 dan GPT-5.4-mini, tidak ada set validasi tugas emas, tidak ada kalibrasi keyakinan, dan tidak ada cara melacak lencana "tingkat keparahan absurd" yang ditampilkan pada paket pengadaan kementerian nyata kembali ke prompt, versi model, dan baris sumber mentah yang menghasilkannya.

**Pembanding Google SRE Workbook:** Bab 14 ("Configuration Design, Best Practices, and Techniques") mensyaratkan bahwa setiap keadaan sistem dapat direkonstruksi dari sumber kebenaran yang diberi versi dan dapat diaudit. Di sini, kebenaran dasar itu sendiri, data tuduhan, tidak memiliki versi, tidak memiliki catatan perubahan, tidak ada diff antara artefak "JSONL mentah" dan "SQL GPT-5.4-mini", dan tidak ada pemetaan terdokumentasi dari keluaran LLM kembali ke catatan sumber. Seorang SRE yang meninjau sistem ini untuk PRR (setara Bab 32/34 Workbook) akan memblokir peluncuran hanya karena ini, terlepas dari persoalan infrastruktur.

Menguatkan dan mempertajam `my comments.md` §17–20 (bukti yang dimodifikasi LLM, tidak ada alur data, tidak ada pemberian versi dataset, tidak ada tanggal dataset yang terlihat).

### 4.2 Temuan CTO-02 (KRITIS): Kegagalan kebersihan rahasia — backend/.env ter-commit ke Git

```
$ git ls-files | grep -i "\.env$"
backend/.env
$ git check-ignore -v backend/.env                    → exit 1 (TIDAK diabaikan)
$ diff backend/.env backend/.env.example
< (tidak ada baris AUDIT_DATASET_YEAR)
```

`.gitignore:1–8` hanya mengecualikan `**/node_modules/`, `backend/data/`, `backend/dataset/`, dan `.DS_Store`. Berkas itu tidak mengecualikan `.env`. Dalam snapshot ini `.env` yang ter-commit kebetulan tidak memuat rahasia aktif (`PORT`, `CORS_ORIGIN=*`, jalur SQLite), tetapi itu keberuntungan, bukan rancangan. Pemisahan `.env` / `.env.example` ada justru untuk menjaga satu berkas tetap di luar kontrol versi; di sini keduanya dilacak berdampingan (commit `c829b4b`), artinya konvensi yang biasanya menghentikan kontributor di masa depan dari meng-commit kredensial basis data, token API, atau kunci penandatanganan yang nyata tidak ditegakkan oleh perangkat, hanya oleh disiplin. Inilah kelas kegagalan yang ditandai persona CRO/Hacker di Modul [H] sebagai "env var Vercel sebagai penyimpan rahasia", akar masalah yang sama, lingkungan berbeda.

**Pembanding Google SRE Workbook:** Praktik terbaik manajemen konfigurasi Bab 14 secara eksplisit memisahkan konfigurasi rahasia dari konfigurasi berversi karena alasan ini.

**Perbaikan:** `git rm --cached backend/.env`, tambahkan `.env` (bukan hanya `.env.example`) ke `.gitignore`, putar ulang kredensial apa pun yang pernah menyentuh berkas itu, bahkan di cabang privat.

### 4.3 Temuan CTO-03 (KRITIS): Nol pengujian otomatis, nol CI/CD, nol IaC, nol kontainerisasi

Pencarian di seluruh repositori untuk `*.test.js`, `*spec.js`, `*.yml` / `*.yaml` apa pun, atau `Dockerfile*` tidak menghasilkan apa pun. `backend/package.json:6–14` mendefinisikan `dev`, `start`, dan tiga skrip transfer DB, tidak ada skrip pengujian sama sekali, bahkan sekadar rintisan. Penyebaran secara implisit manual: `README.md:48–66` menginstruksikan manusia untuk menjalankan `npm start` pada backend dan `python3 -m http.server` pada frontend dengan konfigurasi ala laptop, tanpa pengawas proses, tanpa peluncuran yang diperiksa kesehatannya, dan tanpa mekanisme rollback yang dijelaskan di mana pun.

Temuan tunggal ini mencakup tiga keluhan dalam `my comments.md` (#22–23: "rekayasa yang buruk… SDLC berkualitas rendah," "tidak ada CI/CD," "tidak memakai aplikasi terkontainerisasi"), terkonfirmasi persis sebagaimana dituduhkan, tanpa bukti yang meringankan ditemukan di mana pun dalam pohon berkas.

**Pembanding Google SRE Workbook:** Bab 16 ("Canarying Releases") dan Bab 32 (Production Readiness Reviews, dirujuk pada baris PDF 14984) keduanya mengandaikan alur rilis yang dapat menggerbangi, men-canary, dan me-rollback perubahan secara otomatis. Tidak ada artefak dalam repositori ini yang dapat dilekati proses canary atau PRR; tidak ada build, tidak ada image, tidak ada tahap alur untuk digerbangi.

### 4.4 Temuan CTO-04 (TINGGI): Tidak ada observabilitas — tidak satu pun dari empat sinyal emas diinstrumentasi

`backend/src/app.js:1–86` adalah seluruh permukaan HTTP: empat penangan rute dan satu middleware galat penampung semua yang melakukan `console.error(err)` (baris 76) dan mengembalikan 500 generik. Tidak ada pustaka metrik (tanpa klien Prometheus, tanpa OpenTelemetry, tanpa StatsD), tidak ada middleware pencatatan permintaan (tanpa morgan/pino/winston), tidak ada histogram latensi, tidak ada penghitung tingkat galat, dan tidak ada sinyal saturasi (status koneksi DB, lag event-loop, memori). `/api/health` (`app.js:26–28`) tanpa syarat mengembalikan `{status:"ok"}`; ia tidak memeriksa apa pun, termasuk apakah handle SQLite yang dilayaninya bahkan terbuka.

**Pembanding Google SRE Workbook:** Bab 5 ("Alerting on SLOs," baris PDF 3825) dibangun seluruhnya di atas premis bahwa metrik SLI, yaitu latensi, lalu lintas, galat, saturasi, empat sinyal emas dari buku SRE asli, sudah dipancarkan dan merupakan "metrik pertama yang Anda periksa ketika peringatan berbasis SLO terpicu." Nemesis tidak memiliki SLO, maka tidak ada anggaran galat (konsep Bab 3, baris PDF 7068), maka tidak ada peringatan yang mungkin bahkan secara prinsip, karena tidak ada yang dapat diberi peringatan. Untuk alat yang janji intinya adalah akuntabilitas publik dan ketersediaan berkelanjutan bagi para jurnalis, ini adalah titik buta yang sama yang oleh persona CTO ditandai sebagai TINGGI otomatis dalam daftar periksa NLP Modul [H] ("tidak ada tumpukan observabilitas yang terdokumentasi… tidak dapat mengoperasikan API keuangan dalam keadaan buta"), di sini, gantilah dengan "tidak dapat mengoperasikan dasbor integritas publik dalam keadaan buta."

### 4.5 Temuan CTO-05 (TINGGI): Tidak ada pembatasan laju, CORS wildcard, tidak ada header keamanan

`app.js:6–14` menetapkan `CORS_ORIGIN` menjadi `"*"` setiap kali env var bernilai `"*"` (bawaan yang dikirim di `.env` maupun `.env.example`), sehingga asal mana pun dapat memanggil API. Tidak ada middleware pembatasan laju (tanpa `express-rate-limit`, tanpa pembatasan di tingkat gateway), tidak ada helmet atau middleware header keamanan yang setara, dan pengaturan `trust proxy` / batas ukuran badan Express dibiarkan pada bawaan. Mengingat ambisi yang dinyatakan ("menelan jutaan baris… memunculkan anomali… bagi warga, jurnalis, dan pembuat kebijakan"), API ini tidak memiliki pertahanan terhadap di-scrape-ulang, tidak memiliki pertahanan terhadap pola permintaan penghabisan sumber daya terhadap klausa pencarian teks penuh `LIKE '%…%'` (`dashboard-repository.js:377–383`, `412–418`), dan tidak memiliki sinyal kontraktual (melalui header atau ToS) tentang penggunaan yang dapat diterima.

**Pembanding Google SRE Workbook:** Bab 5 dan pembahasan beban operasional Bagian II (PDF ~6432) sama-sama memperlakukan lalu lintas yang tidak termitigasi sebagai risiko keandalan kelas satu, bukan semata keamanan; API publik tanpa pembatasan adalah permukaan DoS yang dibuat sendiri, yang langsung relevan dengan poin #15 `my comments.md` tentang risiko beban scraping, hanya saja diarahkan ke dalam pada API Nemesis sendiri alih-alih ke luar pada SIRUP.

### 4.6 Temuan CTO-06 (TINGGI): SQLite sebagai penyimpan data produksi untuk dataset publik "jutaan baris," tanpa RTO/RPO pemulihan bencana yang ditetapkan

`backend/src/db.js:66–75` membuka satu berkas better-sqlite3 dalam mode WAL, pilihan yang masuk akal untuk beban kerja tertanam yang didominasi pembacaan, dan pujian layak diberikan: `db.js` dan `dashboard-repository.js` menunjukkan kepedulian rekayasa yang tulus (lihat §4.9). Namun cerita operasional di sekitar berkas itu tidak ada: `scripts/export-db.js` / `import-db.js` (`package.json:9–13`) adalah perintah manual yang dipicu manusia, bukan tugas pencadangan terjadwal; tidak ada replika, tidak ada kadens salinan di luar host, dan tidak ada Recovery Time Objective atau Recovery Point Objective yang terdokumentasi di mana pun dalam repositori. `server.js:33–66` akan sekadar menolak boot dan mencetak petunjuk perbaikan ke konsol jika skema hilang atau usang, yang merupakan mode kegagalan yang benar-benar baik untuk pengembangan, tetapi tidak ada bukti bahwa ini ditopang oleh runbook DR otomatis yang teruji untuk produksi.

**Pembanding Google SRE Workbook:** Pemeriksaan wajib persona CTO sendiri dalam Modul [H] ("Berapa RTO dan RPO pemulihan bencana Anda dan apakah pernah diuji?") dipetakan langsung ke materi ketahanan operasional Workbook; "tidak pernah diuji" dan "tidak ditetapkan" secara fungsional merupakan kegagalan yang sama.

### 4.7 Temuan CTO-07 (SEDANG): Tidak ada pencatatan terstruktur atau korelasi permintaan

Satu-satunya pencatatan di seluruh backend adalah `console.log` / `console.error` (`server.js:46,53,63,69,73,80–81,85`; `app.js:76`). Tidak ada ID permintaan, tidak ada format log terstruktur (JSON), dan tidak ada korelasi antara galat yang terlihat klien dan baris log di sisi server. Jika seorang warga yang melaporkan bug berkata "peta rusak untuk provinsi X," tidak ada cara mencari log untuk permintaan itu; tidak ada identitas permintaan untuk dicari.

### 4.8 Temuan CTO-08 (SEDANG): Frontend tanpa sistem build, tanpa keamanan tipe, tanpa harness pengujian

`frontend/index.html` memuat `assets/js/app.js` (1.410 LOC) dan `assets/js/map.js` (237 LOC) langsung sebagai tag `<script>` tanpa bundler, tanpa TypeScript, tanpa konfigurasi linter yang ditemukan di pohon berkas, dan tanpa kerangka komponen, mengonfirmasi poin #5 `my comments.md` persis sebagaimana dinyatakan. Ini pilihan yang sah dan dapat dipertahankan untuk situs statis kecil ("tanpa langkah build" bahkan diiklankan sebagai fitur di `README.md:72`), tetapi pada 1.410 baris dalam satu berkas closure global (`app.js:1`) yang memutasi satu objek keadaan bersama (`app.js:9–26`) tanpa cakupan pengujian, ukurannya sudah melewati titik ketika JS biasa tanpa tipe mulai menyembunyikan bug yang akan ditangkap kompiler atau pemeriksa tipe secara gratis. Ini temuan pertukaran yang dapat dipertahankan, bukan yang kritis, ditandai demi kelengkapan, bukan untuk alarm.

### 4.9 Apa yang sebenarnya dikerjakan dengan baik (untuk kalibrasi — AEGIS tidak pernah menilai hanya berdasarkan kesan)

Agar audit ini jujur dan berbasis bukti, bukan negatif secara refleks:

- **Permukaan injeksi SQL bersih.** Setiap kueri dinamis di `dashboard-repository.js` (mis. `buildPackagesWhereClause`, `buildOwnerPackagesWhereClause`) memparameterkan masukan pengguna dengan benar; satu-satunya pengenal yang diinterpolasi sebagai string (`scopeTable`, `scopeColumn`) adalah konstanta tetap di lokasi pemanggilan, tidak pernah berasal dari permintaan. Nilai pencarian `LIKE` di-escape (`escapeLikePattern`, baris 65–67).
- **Agregat dihitung di muka, bukan dikueri langsung.** `region_metrics` / `province_metrics` / `owner_metrics` dimaterialisasi sekali pada waktu seed (`seed.js:1461–1619`) alih-alih dihitung ulang per permintaan, keputusan yang tepat untuk dasbor yang didominasi pembacaan, dan menunjukkan penilaian rekayasa yang nyata tentang di mana menghabiskan anggaran indeks/komputasi.
- **Graceful shutdown ada.** `server.js:84–97` menangani `SIGINT` / `SIGTERM` dengan pewaktu paksa-keluar yang terbatas, sepotong kematangan operasional kecil tetapi tulus yang dilewati sepenuhnya oleh sebagian besar proyek pada tahap ini.
- **Penyembuhan diri kompatibilitas skema** (`ensureRegionMetricsCompatibility`, `ensureOwnerMetricsCompatibility`, `seed.js:1630–1670`) menunjukkan penulis yang memikirkan nyeri migrasi ke depan, meski tanpa kerangka migrasi yang sesungguhnya.

Tidak satu pun dari ini mengimbangi CTO-01/02/03: kegagalan integritas bukti, kegagalan kebersihan rahasia, dan ketiadaan total CI/pengujian/IaC adalah temuan penghambat terlepas dari kualitas kode di tempat lain, tetapi seorang CTO yang mengabaikan hal di atas tidak akan menjalankan metodologi AEGIS dengan jujur.

## 5. Kerangka Pembanding: Nemesis vs. Pilar Google SRE Workbook

| Pilar SRE Workbook | Persyaratan Workbook (bab) | Keadaan Nemesis Saat Ini | Kesenjangan |
|---|---|---|---|
| SLI / SLO | Mendefinisikan arti "berfungsi" secara kuantitatif (Bab 2) | Tidak ada yang didefinisikan di repositori maupun dokumen | Total |
| Anggaran galat | Menghabiskan anggaran secara sengaja untuk menyeimbangkan kecepatan vs. risiko (Bab 3, PDF 7068) | Tanpa SLO ⇒ anggaran galat bahkan tidak dapat dihitung | Total |
| Pemantauan & peringatan pada SLI | Empat sinyal emas terhubung ke peringatan berbasis SLO (Bab 5, PDF 3825) | Nol instrumentasi metrik; hanya console.error | Total |
| Menghapus toil | Mengotomatiskan pekerjaan operasi yang berulang (Bagian II, pembahasan Bab 6–10, PDF 6432) | Impor/ekspor/reset DB adalah skrip CLI manual yang dijalankan manusia | Parah |
| Konfigurasi sebagai kode | Konfigurasi berversi, dapat ditinjau, dan dapat di-rollback (Bab 14, PDF 12917–13531) | `.env` ter-commit langsung ke Git alih-alih rahasia yang dieksternalisasi/diputar; tidak ada proses tinjauan konfigurasi | Parah |
| Rilis canary | Menahapkan risiko sebelum peluncuran penuh (Bab 16, PDF 13957) | Tidak ada CI/CD untuk di-canary | Total (tidak ada alur untuk di-canary) |
| Production Readiness Review | Gerbang keandalan pra-peluncuran yang terstruktur (Bab 32, PDF 14984) | Tidak ada proses PRR; laporan AEGIS ini adalah tinjauan pertama yang tercatat | Total |
| Penyeimbangan beban / pembentukan lalu lintas | Perlindungan tingkat DNS/LB sebelum permintaan mencapai aplikasi (Bab 19, PDF 9601) | `CORS_ORIGIN=*`, tanpa pembatas laju, tanpa gateway | Parah |
| Pemulihan bencana | RTO/RPO yang teruji | Skrip ekspor manual; tidak ada latihan pemulihan teruji yang terdokumentasi | Parah |

Sembilan dari sembilan pilar pembanding menunjukkan kesenjangan parah hingga total. Ini bukan "startup yang belum sampai pada kematangan SRE"; ini proyek yang belum mencapai garis dasar pra-SRE berupa pengujian + CI + kebersihan rahasia yang menjadi fondasi sebagian besar praktik keandalan.

## 6. Matriks Risiko

| Temuan | Kemungkinan | Dampak | Prioritas |
|---|---|---|---|
| CTO-01 Alur tuduhan yang tidak dapat diaudit (bukti yang dimodifikasi LLM) | Tinggi (sudah terkirim) | Kritis, hukum/reputasi, melemahkan misi inti | P0 |
| CTO-02 .env ter-commit ke Git | Tinggi (sudah benar) | Kritis jika ada rahasia masa depan yang masuk ke sana | P0 |
| CTO-03 Tanpa pengujian / CI-CD / IaC / kontainer | Tinggi | Kritis, setiap penyebaran adalah tindakan manual yang tidak terverifikasi | P0 |
| CTO-04 Tanpa observabilitas / sinyal emas | Tinggi | Tinggi, gangguan tak terlihat sampai pengguna melapor | P1 |
| CTO-05 Tanpa pembatasan laju / CORS wildcard | Sedang–Tinggi | Tinggi, permukaan DoS buatan sendiri, penyalahgunaan scraping | P1 |
| CTO-06 SQLite sebagai penyimpan produksi, tanpa RTO/RPO DR | Sedang | Tinggi, kehilangan data satu berkas tidak dapat dipulihkan tanpa latihan teruji | P1 |
| CTO-07 Tanpa pencatatan terstruktur/berkorelasi | Tinggi | Sedang, memperlambat setiap investigasi insiden di masa depan | P2 |
| CTO-08 Kesenjangan build/keamanan tipe frontend | Sedang | Sedang, utang teknis, bukan risiko gangguan hari ini | P2 |

## 7. Skor Panel (Hanya Sumbu CTO)

Menurut rubrik penilaian CTO Modul [H] v2.0 (1–10): *1–3: Kegagalan arsitektur kritis; tanpa silsilah; tanpa audit dependensi; paparan PII/rahasia.*

| Sub-kriteria | Skor | Alasan |
|---|---|---|
| Silsilah data & integritas bukti | 1/10 | Tidak ada alur dalam repositori sama sekali; kebenaran dasar yang dimodifikasi LLM, tanpa versi |
| Kebersihan rahasia & konfigurasi | 2/10 | `.env` dilacak di Git; tanpa pengelola rahasia |
| Pengujian / CI-CD / IaC | 1/10 | Nol pengujian, nol alur, nol kontainer ditemukan |
| Observabilitas (sinyal emas) | 2/10 | `/api/health` adalah rintisan; tanpa metrik/log/penelusuran |
| Postur keamanan (pembatasan laju, CORS, header) | 3/10 | Lapisan SQL bersih, tetapi CORS wildcard dan tanpa pembatasan |
| Ketahanan operasional penyimpan data (DR) | 4/10 | Rancangan skema/indeks yang sehat; tanpa latihan pencadangan/pemulihan teruji |
| Keahlian rekayasa tingkat kode | 6/10 | Kueri berparameter, agregat dihitung di muka, graceful shutdown |

**Skor Komposit CTO: 2,7 / 10**

Menurut aturan ambang Modul [H] ("Setiap temuan Kritis… membatasi komposit pada 5,5"), dan di sini ada tiga temuan KRITIS yang independen (CTO-01, CTO-02, CTO-03), komposit tidak sekadar dibatasi; ia berada jauh di bawah batas itu pada aritmetikanya sendiri.

**Putusan: GAGAL**, belum siap untuk produksi, kemitraan pemerintah, atau pengutipan pers dalam bentuknya saat ini.

## 8. Peta Jalan Perbaikan

**P0 — sebelum penyegaran data publik berikutnya:**

1. Hapus `backend/.env` dari riwayat Git (`git rm --cached`, tambahkan ke `.gitignore`, putar ulang apa pun yang pernah menyentuhnya).
2. Terbitkan (bahkan secara minimal) alur ETL/scrape → analisis LLM → dataset yang sebenarnya sebagai kode di repositori ini, dengan: tanggal snapshot sumber, versi model yang dipatok, dan pemeriksaan akurasi bersampel yang ditinjau manusia sebelum label "severity: absurd" apa pun sampai ke layar warga.
3. Pasang satu alur kerja CI (lint + satu uji asap pertama yang mengenai `/api/health` dan `/api/bootstrap` terhadap DB uji yang sudah di-seed) sebelum merge berikutnya ke `main`.

**P1 — sebelum kemitraan pemerintah atau pers diumumkan:**

4. Tambahkan `express-rate-limit` (atau pembatasan di tingkat gateway) dan tetapkan `CORS_ORIGIN` ke daftar izin eksplisit.
5. Instrumentasikan empat sinyal emas (bahkan endpoint `/metrics` Prometheus minimal) dan buat `/api/health` benar-benar memeriksa handle DB.
6. Tulis dan jalankan latihan pemulihan dari keluaran `scripts/export-db.js`; dokumentasikan RTO/RPO yang terukur.

**P2 — utang teknis, tangani sewaktu ada kesempatan:**

7. Perkenalkan pencatatan terstruktur dengan ID permintaan.
8. Pertimbangkan adopsi TypeScript bertahap atau setidaknya konfigurasi linter/formatter untuk `frontend/assets/js/`.

Perkiraan skor ulang setelah P0+P1: sekitar 6,0–6,5/10 (LOLOS BERSYARAT — KOREKSI MINOR), bergantung pada perbaikan silsilah data yang nyata dan bukan kosmetik; temuan itu saja yang akan didesak peninjau ini untuk dilihat terselesaikan terlebih dahulu.

## 9. Lampiran: Audit Integritas Sitasi

Setiap sitasi kode dalam laporan ini (`file.js:line`) dibaca langsung dari repositori selama sesi ini; tidak ada nomor baris yang diperkirakan. Sitasi Google SRE Workbook merujuk pada nomor bab dan posisi baris teks hasil ekstraksi perkiraan dari `the-site-reliability-workbook-next18.pdf`, dikonfirmasi melalui ekstraksi teks langsung, bukan diingat dari data pelatihan. `my comments.md` dikutip dengan parafrasa, dengan nomor poin yang sesuai dengan penomoran berkas sumbernya sendiri.

Laporan ini mengikuti metodologi AEGIS Modul [H] v2.0, hanya persona CTO, satu putaran. Tidak ada penilaian CEO, CRO, atau Elite Hacker yang disertakan atau tersirat.

---

**#AuditAEGIS #SiteReliabilityEngineering #DevilsAdvocate #Infraloka #RahmatWibowo**
