# Kawal Kepakaran

> [🇬🇧 English](README.md) · 🇮🇩 Bahasa Indonesia

**Situs:** <https://kawalkepakaran.org> (Indonesia) · <https://kawalkepakaran.org/en> (Inggris)

Repositori ini berisi kode sumber **Kawal Kepakaran**, situs cek fakta terbuka atas klaim para pakar. Situs ini memeriksa
kredensial, rekam jejak, dan bukti, memberi setiap klaim putusan beserta tingkat keyakinan, dan membuka **hak jawab** bagi
setiap pakar yang disebut. Kasus pertama yang didokumentasikan, **Kasus 001**, adalah Abil Sudarman: artikel, bukti, dan
linimasa bertanggal dari masa awal proyek ("Kawal Abil Sudarman") tetap ada di `/kasus/abil-sudarman`.

Semua isi situs adalah **pendapat dan catatan penulis, bukan putusan pengadilan**. Setiap halaman menyatakannya.

## Mulai dari sini

| Saya adalah… | Baca ini |
|---|---|
| **Pembaca bisnis, penasihat hukum, editor, atau mitra** | [Panduan bisnis](docs/business-guide.id.md): apa itu situs ini, apa yang bukan, aturannya, cara menerbitkan atau mengoreksi |
| **Engineer baru** | [Panduan engineering](docs/engineering-guide.id.md): cara menjalankan, letak berkas, cara menambah konten, apa yang tidak boleh rusak |
| **Punya bukti atau koreksi** | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Mencari semuanya** | [docs/index.md](docs/index.md) |

## Isi situs

| Halaman | Fungsinya |
|---|---|
| Beranda (`/`, `/en`) | Gagasannya dalam satu layar, cek klaim terbaru, pakar yang diperiksa |
| Pakar (`/pakar`, `/en/experts`) | Satu profil per pakar: kredensial yang diperiksa, klaim yang diuji, tanggapan |
| Cek klaim (`/klaim`, `/en/claims`) | Tiap klaim dengan putusan (dikonfirmasi / sebagian / tidak terbukti / belum bisa diverifikasi), tingkat keyakinan, bukti, dan "yang tidak dibuktikan" |
| Metode (`/metode`, `/en/method`) | Cara kredensial dan klaim dinilai |
| Hak jawab (`/hak-jawab`, `/en/right-of-reply`) | Cara setiap pakar yang disebut menanggapi; tanggapan dimuat apa adanya |
| Kasus 001 (`/kasus/abil-sudarman`, `/en/cases/abil-sudarman`) | Artikel, bukti, linimasa, dan kiasan 3D Bowobharata untuk kasus pertama |
| Tentang, video, TikTok, buku, PageSpeed, disclaimer | Halaman pendukung |

## Menambah pakar atau klaim

Buka Issue dengan formulir **Kirim klaim atau bukti pakar** (lihat [CONTRIBUTING.md](CONTRIBUTING.md)), atau kirim pull
request yang menambah satu berkas JSON di `src/content/pakar/` atau `src/content/klaim/` (kolomnya ada di
`src/lib/schemas.ts`). Setiap klaim perlu sumber, "apa yang ditunjukkan bukti", dan "apa yang tidak dibuktikan".

## Menjalankan di komputer Anda (sekitar 10 menit)

Anda butuh **Node.js 22** dan **npm** (cek dengan `node -v`).

```bash
git clone https://github.com/rweebs/kawalkepakaran.git
cd kawalkepakaran
npm ci            # pasang dependensi persis sesuai kunci versi
npm run dev       # pratinjau langsung di http://localhost:4321 (draf ikut tampil)
```

Perintah yang berguna:

| Perintah | Fungsinya |
|---|---|
| `npm run dev` | Pratinjau langsung, **dengan draf** |
| `npm test` | Menjalankan semua tes otomatis (sekitar 700, beberapa detik) |
| `npm run build` | Build produksi ke `dist/`, lalu menjalankan pemeriksaan keamanan. **Draf tidak ikut.** |
| `npm run build:preview` | Build ala produksi yang menyertakan draf |
| `npm run check` | Menjalankan ulang pemeriksaan pada `dist/` yang sudah ada |

Sebelum mendorong perubahan apa pun, jalankan `npm test && npm run build`. Jika keduanya lolos, perubahan aman diterbitkan.

## Cara kerjanya (satu paragraf)

Situs ini **statis**: setiap halaman dibuat lebih dulu menjadi berkas HTML biasa di `dist/`, sehingga tidak ada server atau
basis data yang perlu dijalankan. Situs memakai [Astro](https://astro.build) dengan TypeScript. Adegan perang 3D di halaman
Bowobharata memakai three.js dan baru dimuat setelah pengunjung berinteraksi, supaya semua halaman tetap cepat. Konten
disimpan dalam berkas Markdown dan JSON di `src/content/`.

## Peta folder

```text
src/pages/        Satu berkas per halaman (Indonesia di akar, Inggris di en/)
src/content/      Artikel, bukti, buku, video, entri TikTok (Markdown / JSON)
src/lib/          Logika bersama: pengaturan situs, SEO, sitemap, linimasa, skema, adegan 3D
src/components/   Potongan halaman yang dipakai ulang (banner, tombol bahasa, lagu tema, ...)
src/layouts/      Kerangka halaman (header, menu, footer) yang dipakai semua halaman
src/i18n/         Pengaturan bahasa dan teks menu Indonesia / Inggris
src/styles/       CSS situs
public/           Berkas yang disajikan apa adanya: gambar, model 3D, PDF, robots.txt, header keamanan
scripts/          Pembantu build, termasuk pemeriksa yang menjaga setiap rilis
tests/            Tes otomatis
source/           Naskah asli artikel berbahasa Inggris, disimpan sebagai sumber mentah
docs/             Dokumentasi
```

## Menerbitkan dan deploy

1. Gabungkan ke `main`. GitHub Actions menjalankan tes dan build (`.github/workflows/ci.yml`).
2. Cloudflare membangun dan men-deploy situs ke <https://kawalkepakaran.org> dari repositori yang sama.
3. Rincian, termasuk apa yang dicek setelah rilis, ada di [Panduan engineering](docs/engineering-guide.id.md#deploy).

Sebelum rilis publik klaim baru, minta **penasihat hukum meninjau** tulisannya (UU ITE, KUHP baru, dan UU Pelindungan Data
Pribadi). Lihat [Panduan bisnis](docs/business-guide.id.md#6-aturan-hukum-dan-keamanan).

## Lisensi

Kode: [MIT](LICENSE). Konten tulisan asli: [CC BY 4.0](LICENSE-CONTENT.md) (materi pihak ketiga seperti tangkapan layar bukti
tetap tunduk pada ketentuan pemiliknya). Perpindahan dari domain lama dijelaskan di [docs/redirects.md](docs/redirects.md).

## Kontak

Koreksi, tanggapan, dan bukti: lihat halaman Hak jawab di situs, atau [CONTRIBUTING.md](CONTRIBUTING.md).
