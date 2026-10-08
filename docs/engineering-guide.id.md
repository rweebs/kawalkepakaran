# Panduan engineering

> [🇬🇧 English](engineering-guide.md) · 🇮🇩 Bahasa Indonesia · [Kembali ke indeks dokumentasi](index.md)

Untuk engineer junior dan baru. Baca dulu [README.id](../README.id.md) untuk persiapan 10 menit. Panduan ini menjelaskan
bagaimana bagian-bagiannya saling terhubung dan cara membuat perubahan umum dengan aman.

**Aturan emas:** jalankan `npm test && npm run build` sebelum mendorong perubahan. Jika keduanya lolos, situs tidak rusak.

## 1. Gambaran besar

```text
 Konten Markdown / JSON ──┐
 Logika TypeScript (lib) ──┼─► Build Astro ─► HTML + CSS + JS biasa di dist/ ─► Cloudflare ─► abilsudarman.my.id
 Templat halaman (.astro) ─┘        │
                                    └─► scripts/check-dist.mjs  (menahan rilis jika ada halaman yang melanggar aturan)
```

- **Situs statis:** tanpa server, tanpa basis data. Setiap URL adalah satu berkas di `dist/`.
- **Astro 7 + TypeScript.** React terpasang tetapi jarang dipakai; sebagian besar halaman adalah templat `.astro`.
- **Dua bahasa:** Indonesia di akar (`/artikel`), Inggris di bawah `/en` (`/en/articles`). Konten sama, halaman berpasangan.
- **Tes:** [Vitest](https://vitest.dev), sekitar 700 tes, dijalankan dengan `npm test`.

## 2. Susunan kode

```text
src/
  pages/           Rute. artikel/index.astro -> /artikel. [slug].astro adalah rute dinamis. en/ berisi halaman Inggris.
  content/         Koleksi konten:
    posts/         Artikel bahasa Indonesia (Markdown)          ─ skema: postSchema
    posts-en/      Artikel Inggris, NAMA BERKAS SAMA dengan versi Indonesia ─ skema: postEnSchema
    bukti/         Butir bukti (JSON, satu per butir)           ─ skema: buktiSchema
    buku/          Buku / laporan (JSON)
    videos/        Video YouTube (JSON)
    tiktok/        Video TikTok (JSON)
  content.config.ts  Mendaftarkan koleksi dan skemanya
  lib/             Logika yang bisa diuji unit:
    schemas.ts       Aturan setiap jenis konten (Zod)
    site.ts          Nama situs, URL, teks disclaimer, menu, tanggal "terakhir diubah" tiap halaman
    seo.ts           Pembuat judul dan deskripsi
    sitemap.ts       Membuat sitemap.xml
    linimasa.ts      Peristiwa linimasa (Indonesia, sumber kebenaran)
    linimasa-en.ts   Teks linimasa Inggris, berkunci slug Indonesia
    bowobharata.ts   Teks halaman Bowobharata (8 bagian = "parva")
    bowobharata/     Adegan 3D (lihat bagian 8)
    privacy.ts       Mendeteksi nomor telepon / NIK di teks (dipakai tes)
    translation.ts   Mendeteksi bahasa Inggris yang belum diterjemahkan di artikel Indonesia (dipakai tes)
  i18n/            index.ts: bahasa dan tabel ROUTES (pasangan URL Indonesia <-> Inggris). ui.ts: teks menu.
  components/      Potongan yang dipakai ulang. LanguageToggle, DisclaimerBanner, Breadcrumbs, ThemeSong, ...
  layouts/BaseLayout.astro   Kerangka semua halaman: tag <head>, header, menu, footer, SEO, hreflang.
  scripts/         JavaScript peramban (menu, modal video, lagu tema, pemuat adegan 3D)
  styles/global.css  Seluruh CSS
public/            Disajikan apa adanya: img/ (gambar), models/ (3D .glb), buku/ (PDF), _headers, robots.txt
scripts/           Pembantu build Node (lihat bagian 6)
tests/             Satu berkas tes per fitur
source/            Naskah asli artikel Inggris untuk membuat kerangka artikel
```

**Model mental:** untuk mengubah *kata-kata* halaman, ubah konten atau `lib/`; untuk mengubah *tata letak*, ubah berkas
`.astro`; untuk mengubah apa yang dimiliki *semua* halaman, ubah `BaseLayout.astro`.

## 3. Pasangan bahasa (penting)

Setiap halaman publik ada dalam dua bahasa dan keduanya **harus saling menunjuk** (hreflang, tombol bahasa, sitemap).
Pasangannya ada di `ROUTES` pada `src/i18n/index.ts`:

```ts
articles: { id: '/artikel', en: '/en/articles' },
```

- Tambahkan halaman baru ke `ROUTES`, kalau tidak tombol bahasa dan hreflang tidak mengenalnya.
- Artikel Inggris memakai **nama berkas yang sama** dengan versi Indonesia (`posts/x.md` ↔ `posts-en/x.md`).
- Peristiwa linimasa dipasangkan lewat **slug Indonesia**.

## 4. Menambah konten

### 4.1 Artikel baru

1. Buat `src/content/posts/<slug>.md` (Indonesia) dengan front matter:

   ```yaml
   ---
   title: "Judul dalam bahasa Indonesia"
   originalTitle: "Original title"
   author: "Rahmat Wibowo"
   translationDate: 2026-10-04
   classification: pendapat        # atau fakta-dengan-bukti, laporan-aduan
   subjects: ["Abil Sudarman"]
   translationStatus: draft         # ubah ke final untuk menerbitkan
   ---
   ```

2. Buat `src/content/posts-en/<slug-yang-sama>.md` dengan `title`, `author`, `publishedDate`, `classification`,
   `status: draft`, `original: true` (atau `false` bila terjemahan).
3. Taruh gambar di `public/img/` dan rujuk sebagai `/img/<berkas>`.
4. Pratinjau dengan `npm run dev` (draf tampil). Setelah disetujui, ubah kedua status menjadi `final`.
5. Tes `translation.test.ts` mengharapkan jumlah artikel yang tepat; ubah angkanya saat menambah artikel. Tes juga gagal bila
   artikel Indonesia memuat paragraf bahasa Inggris yang belum diterjemahkan (pengecualian yang sah dicatat di
   `tests/translation-allow.json` beserta alasannya).
6. Jalankan `npm test && npm run build`.

### 4.2 Butir bukti

Tambahkan `src/content/bukti/NN-nama.json`. Wajib: `title`, `group` (`catatan-resmi`, `klaim-yang-dipublikasikan`,
`liputan-pihak-ketiga`, `upaya-verifikasi`), `images` (1 sampai 4, masing-masing `/img/<berkas>.png|jpg` beserta `alt`),
`shows`, `limits`, `order`. Opsional: `source`, `sourceUrl`, `capturedAt`, dan blok `en` berisi teks Inggris. Tutup data
pribadi pada gambar **sebelum** menambahkannya.

### 4.3 Peristiwa linimasa

1. Tambahkan entri ke `EVENTS` di `src/lib/linimasa.ts` (`slug`, `date` berformat `YYYY-MM-DD`, `title`, `channel`,
   `paragraphs`, `sources`, `related`). Pertahankan kalimat yang berhati-hati: ini catatan penulis, bukan temuan.
2. Tambahkan teks Inggris ke `EVENTS_EN` di `src/lib/linimasa-en.ts`, berkunci slug Indonesia yang sama (`slug` Inggris,
   `title`, `paragraphs`, serta daftar label `src` / `rel` dengan urutan yang sama).
3. Setiap tautan sumber harus `https://`. Tautan terkait harus menunjuk halaman yang ada. Tes menegakkan keduanya.

### 4.4 Halaman baru

1. Buat `src/pages/<nama>.astro` (Indonesia) dan `src/pages/en/<nama>.astro` (Inggris; sering hanya pembungkus tipis yang
   memakai ulang berkas Indonesia dengan `locale="en"`, seperti `en/timeline.astro`).
2. Tambahkan pasangannya ke `ROUTES` di `src/i18n/index.ts`.
3. Tambahkan ke menu di `src/i18n/ui.ts` bila perlu tampil di sana.
4. Tambahkan ke `src/pages/sitemap.xml.ts` dan beri tanggal di `PAGE_LASTMOD` pada `src/lib/site.ts`.
5. Pakai `BaseLayout` dan isi `title`, `description`, `path`, `locale`, dan `breadcrumbs`.

## 5. Aturan SEO yang tertanam di layout

- Judul: paling banyak 60 karakter; `buildTitle` menambahkan nama situs dan memotong judul panjang di batas kata.
- Deskripsi: 70 sampai 160 karakter. Tepat satu `<h1>` per halaman. URL kanonik harus sama dengan URL halaman.
- Pasangan hreflang dan tag `og:` dibuat oleh `BaseLayout`. Jangan menulisnya manual.
- Data terstruktur (JSON-LD) harus JSON yang valid; pemeriksa menguraikannya.
- Bila judul belum menyebut subjeknya, judul panjang diberi akhiran "· Abil Sudarman".

## 6. Build dan pemeriksaan keamanannya

`npm run build` menjalankan, berurutan:

1. `scripts/make-thumbs.mjs` membuat gambar kecil (hasilnya diabaikan git).
2. `astro build` menulis situs ke `dist/`.
3. `scripts/prune-images.mjs` menghapus gambar yang tidak dipakai halaman mana pun.
4. `scripts/check-dist.mjs` memindai setiap halaman. **Build gagal** bila ada aturan yang dilanggar:

| Aturan | Alasannya |
|---|---|
| Banner disclaimer ada di setiap halaman | Hukum: situs harus selalu menyatakan ini pendapat |
| `<html lang>` bernilai `id` (atau `en` di bawah `/en`) | Aksesibilitas dan SEO |
| Judul 10 sampai 65 karakter, deskripsi 70 sampai 170 | Tampilan hasil pencarian |
| Tepat satu `<h1>`, URL kanonik valid | SEO |
| JSON-LD dapat diurai | Mesin pencari mengabaikan data rusak |
| `og:image` ada dan berkasnya ada | Pratinjau tautan |
| Menu seluler terbuka secara bawaan di HTML | Menu harus berfungsi tanpa JavaScript |
| Setiap `href` / `src` internal ada tujuannya | Tidak ada tautan atau gambar rusak |
| Sitemap memuat semua halaman terindeks, tanpa duplikat, tanpa halaman noindex | Penemuan oleh mesin pencari |

Bila gagal, pesannya menyebut berkas dan aturannya. Perbaiki halaman, lalu build ulang.

Skrip lain adalah **alat sekali pakai** (mengambil thumbnail, membuat gambar OG, membuat PDF). Jarang dijalankan; masing-masing
punya komentar di bagian atas yang menjelaskan tujuannya.

## 7. Tes: apa menjaga apa

| Tes | Menjaga dari |
|---|---|
| `schemas`, `*-content`, `*-lib` | Konten buruk (kolom salah, tanggal salah, jalur gambar salah) |
| `translation*` | Bahasa Inggris yang tertinggal di artikel Indonesia |
| `privacy*` | Nomor telepon atau NIK di teks yang terbit |
| `check-dist`, `sitemap*`, `seo`, `jsonld` | Aturan build dan SEO |
| `no-inline-style` | Atribut `style="…"` (situs memakai Content Security Policy ketat; taruh CSS di `global.css`) |
| tes `no-*` | Munculnya kembali fitur yang sudah dihapus atau kata terlarang (juga memindai `README.md`) |
| `bowobharata-*` | Matematika adegan 3D, penyambungan, aturan pemuatan, dan kredit lisensi |
| `nav-structure`, `linimasa`, `*-wiring` | Halaman tersambung ke layout, menu, dan tautan yang benar |

Beberapa tes membaca **kode sumber sebagai teks** untuk memastikan penyambungan (misalnya halaman memakai
`localizedPath('reply', …)`). Jika Anda merefaktor dan tes seperti itu gagal, perbarui tes ke kode baru yang dimaksud; jangan
melemahkannya.

## 8. Halaman 3D Bowobharata

Kisah bergulir dengan medan perang 3D di belakangnya, dibuat dengan three.js dan pustaka `motion`.

- **Sengaja dimuat belakangan.** `src/scripts/bowobharata-stage.ts` menunggu interaksi pertama pengguna (atau 8 detik
  menganggur), lalu mengimpor adegan secara dinamis. Tidak ada kode three.js atau model 3D yang diunduh sebelum itu; inilah
  yang menjaga Lighthouse tetap 100. **Jangan menambah impor yang menarik adegan ke halaman awal.**
- **Kode adegan:** `src/lib/bowobharata/KurukshetraScene.ts` merangkai "bagian" (lingkungan, pasukan, kereta, paviliun, efek,
  hiasan tanah). Tiap bagian ada di `src/lib/bowobharata/scene/`. Matematika murni (bidikan kamera, formasi) ada di
  `stage-math.ts` dan diuji unit.
- **Tingkat kualitas:** `scene/quality.ts` menentukan seberapa banyak yang digambar untuk ponsel, desktop biasa, dan desktop
  lemah, lalu mematikan efek bertahap (ambient occlusion, depth of field, bloom, bayangan) bila frame rate turun.
- **Model:** tiga berkas `.glb` di `public/models/` (kuda, prajurit, karakter dasar). Kredit dan lisensi ada di
  `src/lib/bowobharata/model-credits.ts` dan ditampilkan di halaman; karakter dasar berlisensi **CC BY 3.0, jadi
  kreditnya wajib**. Bila model gagal dimuat, dipakai bentuk prosedural bawaan.
- **Pegangan praktis:** jauhkan `style=""` dari markup, gambar sprite partikel di `FX_LAYER`, dan jalankan ulang Lighthouse
  (seluler dan desktop) setelah perubahan.

## 9. Header keamanan

`public/_headers` menetapkan untuk setiap halaman: tidak boleh di-frame (`X-Frame-Options: DENY`), HSTS, Permissions-Policy
yang ketat, dan Content Security Policy. Hanya YouTube (nocookie) dan TikTok yang boleh disematkan. Astro juga menghasilkan CSP
per halaman untuk skrip (`astro.config.mjs`). Masa simpan cache gambar, model, dan aset ber-hash diatur di berkas yang sama.

<a id="deploy"></a>

## 10. Deploy

- **CI:** `.github/workflows/ci.yml` berjalan di setiap push dan pull request ke `master`: pasang dependensi, `npm test`,
  `npm run build`, unggah `dist/`.
- **Produksi:** situs disajikan Cloudflare sebagai aset statis dari `dist/` (dikonfigurasi di `wrangler.jsonc`) di
  <https://abilsudarman.my.id>. Integrasi build Cloudflare membangun dengan `npm run build` dan men-deploy dengan Wrangler
  saat `master` berubah.
- **Kekurangan yang diketahui:** job "Deploy to Cloudflare" di workflow membutuhkan secret repositori `CLOUDFLARE_API_TOKEN`
  dan `CLOUDFLARE_ACCOUNT_ID`. Selama belum ditambahkan, job itu gagal (job uji-dan-build tetap lolos). Tambahkan secret
  tersebut, atau hapus job deploy dan smoke test lalu andalkan build Cloudflare.
- **Setelah rilis, periksa:** beranda dalam kedua bahasa, `/sitemap.xml`, satu artikel, dan tombol bahasa.
- **Dependabot** membuka pull request untuk pembaruan dependensi dan GitHub Actions. Gabungkan bila CI lolos.

## 11. Mengatasi masalah

| Gejala | Kemungkinan penyebab dan perbaikan |
|---|---|
| `npm run build` gagal di `check-dist` | Baca pesannya: menyebut halaman dan aturan. Umum: judul terlalu panjang, tidak ada `<h1>`, tautan rusak, halaman tidak ada di sitemap |
| `translation.test` bilang "has N posts" | Anda menambah atau menghapus artikel; ubah angka yang diharapkan di tes |
| Halaman tidak tampil di situs | Statusnya masih `draft`, atau belum ada di sitemap / `ROUTES` |
| Tombol bahasa menuju halaman yang salah | Pasangannya belum ada di `ROUTES` |
| `npm test` gagal pada tes "teks sumber" setelah refaktor | Tes menancap pada kode lama; perbarui sesuai maksud baru |
| Skor Lighthouse turun | Ada yang dimuat sebelum interaksi (kode 3D, gambar besar, skrip yang memblokir render) |
| Adegan 3D kosong | Cek konsol peramban; adegan memakai bentuk sederhana bila model gagal, tetapi tidak bila WebGL tidak tersedia |

## 12. Kebiasaan kerja

- Ikuti gaya dan kepadatan komentar kode di sekitarnya. Komentar singkat yang menjelaskan *mengapa*.
- Jaga kalimat tetap berhati-hati pada teks yang menyebut orang ("saya menduga", "menurut saya").
- Satu perubahan logis per commit; pesan commit seperti `feat(seo): …`, `fix(build): …`.
- Jangan pernah meng-commit rahasia. `.env` diabaikan git.
- Tanyakan dulu sebelum mengubah kalimat hukum, disclaimer, atau teks hak jawab.

## 13. Istilah

| Istilah | Arti |
|---|---|
| **Astro** | Kerangka yang mengubah templat dan konten menjadi halaman statis |
| **Koleksi konten** | Folder berkas Markdown/JSON yang diperiksa terhadap skema |
| **Skema (Zod)** | Daftar kolom wajib dan tipenya untuk satu jenis konten |
| **Slug** | Nama halaman yang aman untuk URL (`unmasking-abil-sudarman-ababil`) |
| **hreflang** | Tag yang memberi tahu Google halaman mana kembaran berbahasa lain |
| **CSP** | Content Security Policy: aturan peramban yang membatasi skrip dan frame yang boleh dimuat |
| **Lighthouse** | Audit Google yang menilai Performance, Accessibility, Best Practices, SEO |
| **Parva** | Salah satu dari 8 bab kisah Bowobharata |
| **VAT (vertex animation texture)** | Cara menganimasikan ribuan prajurit 3D dengan murah di GPU |
