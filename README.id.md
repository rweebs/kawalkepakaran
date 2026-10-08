# Kawal Abil Sudarman

> [🇬🇧 English](README.md) · 🇮🇩 Bahasa Indonesia

**Situs:** <https://abilsudarman.my.id> (Indonesia) · <https://abilsudarman.my.id/en> (Inggris)

Repositori ini berisi kode sumber **Kawal Abil Sudarman** ("Operasi Ababil"), situs cek fakta terbuka. Situs ini memuat
tulisan Rahmat Wibowo tentang klaim publik Abil Sudarman, lengkap dengan bukti, linimasa bertanggal, dan **hak jawab**
bagi pihak yang disebut.

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
| Beranda (`/`, `/en`) | Ringkasan dan tuduhan utama, masing-masing ditandai sebagai tuduhan penulis |
| Artikel (`/artikel`, `/en/articles`) | Tulisan penulis dalam bahasa Indonesia dan Inggris |
| Bukti (`/bukti`, `/en/evidence`) | Tangkapan layar, masing-masing dengan "apa yang terlihat" dan "apa yang tidak dibuktikan" |
| Linimasa (`/linimasa`, `/en/timeline`) | Catatan bertanggal tentang apa yang ditulis, dikirim, dan dilakukan penulis |
| Hak jawab (`/hak-jawab`, `/en/right-of-reply`) | Cara Abil Sudarman atau pihak lain menanggapi; tanggapan dimuat apa adanya |
| Bowobharata (`/bowobharata`) | Kisahnya dituturkan sebagai kiasan Mahabharata, dengan adegan perang 3D |
| Tentang, video, TikTok, buku, PageSpeed, disclaimer | Halaman pendukung |

## Menjalankan di komputer Anda (sekitar 10 menit)

Anda butuh **Node.js 22** dan **npm** (cek dengan `node -v`).

```bash
git clone https://github.com/rweebs/abilsudarman.git
cd abilsudarman
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

1. Gabungkan ke `master`. GitHub Actions menjalankan tes dan build (`.github/workflows/ci.yml`).
2. Cloudflare membangun dan men-deploy situs ke <https://abilsudarman.my.id> dari repositori yang sama.
3. Rincian, termasuk apa yang dicek setelah rilis, ada di [Panduan engineering](docs/engineering-guide.id.md#deploy).

Sebelum rilis publik klaim baru, minta **penasihat hukum meninjau** tulisannya (UU ITE, KUHP baru, dan UU Pelindungan Data
Pribadi). Lihat [Panduan bisnis](docs/business-guide.id.md#6-aturan-hukum-dan-keamanan).

## Kontak

Koreksi, tanggapan, dan bukti: lihat halaman Hak jawab di situs, atau [CONTRIBUTING.md](CONTRIBUTING.md).
