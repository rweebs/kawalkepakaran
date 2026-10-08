# Panduan bisnis

> [🇬🇧 English](business-guide.md) · 🇮🇩 Bahasa Indonesia · [Kembali ke indeks dokumentasi](index.md)

Untuk editor, penasihat hukum, mitra, dan siapa pun yang perlu memahami situs ini tanpa membaca kode.

## 1. Apa itu situs ini

**Kawal Kepakaran** (<https://kawalkepakaran.org>) adalah cek fakta terbuka atas klaim para pakar, dijalankan Rahmat Wibowo. Isinya:

- **Profil pakar dan cek klaim**: tiap klaim diberi putusan (dikonfirmasi, sebagian, tidak terbukti, belum bisa diverifikasi), tingkat keyakinan, bukti, dan "yang tidak dibuktikan". Halaman **Metode** menjelaskan caranya.
- **Kasus 001 (Abil Sudarman)**: kasus pertama, dengan artikel penulis (diterjemahkan ke bahasa Indonesia, atau aslinya berbahasa Inggris).
- **Bukti**: tangkapan layar dan catatan, masing-masing dijelaskan.
- **Linimasa**: catatan bertanggal tentang apa yang ditulis, dikirim, dan dilakukan penulis.
- **Hak jawab**: tawaran tetap bagi setiap pakar yang disebut untuk menanggapi.
- **Bowobharata**: kisah yang sama dituturkan sebagai kiasan Mahabharata, dengan adegan 3D. Halaman ini bersifat kreatif dan
  ditandai jelas sebagai kiasan, pendapat, dan ilustrasi buatan AI.

## 2. Apa yang **bukan** situs ini

- **Bukan** putusan pengadilan, temuan polisi, atau kantor berita. Setiap halaman menyatakannya (banner disclaimer).
- **Tidak** menyatakan seseorang bersalah. Tuduhan ditandai sebagai **tuduhan penulis**.
- **Tidak** memuat data pribadi (NIK, nomor telepon, alamat rumah). Bukti ditutup datanya sebelum dimuat, dan tes otomatis
  menggagalkan build bila ada nomor telepon atau NIK di teks yang terbit.

## 3. Cara setiap konten diberi label

Setiap artikel memakai satu dari tiga label yang ditampilkan kepada pembaca:

| Label (nama internal) | Artinya |
|---|---|
| Pendapat (`pendapat`) | Pandangan atau analisis penulis |
| Fakta dengan bukti (`fakta-dengan-bukti`) | Pernyataan faktual yang menunjuk bukti yang dapat diperiksa |
| Laporan aduan (`laporan-aduan`) | Aduan atau surat resmi yang diajukan atau dikirim penulis |

Artikel berstatus **draf** atau **final**. Hanya konten **final** yang terbit. Draf hanya terlihat di komputer pengembang.

## 4. Aturan bukti

Siapa pun boleh mengirim bukti, baik yang mendukung maupun yang membantah klaim. Setiap bukti wajib memiliki:

1. **Sumber yang dapat diperiksa**: tautan atau asal dokumen, dan tanggal tangkapan layar diambil.
2. **Data pribadi ditutup**: NIK, NIM, nomor telepon, alamat rumah, dan data pihak yang tidak terkait.
3. **Dua keterangan**: *apa yang ditunjukkan gambar* dan *apa yang tidak dibuktikan olehnya*.
4. **Tanpa rumor, tanpa doxxing**: hanya hal yang berkaitan dengan klaim publik.

Langkah lengkap bagi kontributor ada di [CONTRIBUTING.md](../CONTRIBUTING.md).

## 5. Hak jawab dan koreksi

- Setiap pakar yang disebut, dan pihak lain yang disebut, boleh menjawab lewat email (alamat ada di halaman Hak jawab).
- Tanggapan dimuat **apa adanya, tanpa penyuntingan**, di akhir artikel terkait di bawah judul *"Tanggapan"* diikuti nama pakar,
  lengkap dengan tanggal diterima.
- Permintaan koreksi atau penghapusan mengikuti halaman yang sama. Penulis memutuskan dan mencatat perubahannya.

## 6. Aturan hukum dan keamanan

- **Sebelum rilis publik klaim baru, minta penasihat hukum meninjau tulisannya.** Undang-undang yang relevan: UU ITE, KUHP
  baru, dan UU Pelindungan Data Pribadi (UU PDP).
- Kalimat tetap berhati-hati ("saya menduga", "menurut saya"). Jangan menghapus kehati-hatian agar klaim terdengar lebih kuat.
- Pemeriksaan otomatis menjaga hal dasar (disclaimer di setiap halaman, tidak ada data pribadi bocor) tetapi **bukan**
  pengganti tinjauan hukum.

## 7. Dari ide sampai tayang

| Langkah | Siapa | Yang terjadi |
|---|---|---|
| 1. Permintaan | Siapa pun | Buka issue di GitHub, atau email penulis |
| 2. Draf | Editor / engineer | Konten ditambahkan sebagai **draf**; hanya terlihat di komputer pengembang |
| 3. Tinjauan | Penulis + penasihat hukum | Teks, bukti, label, dan kehati-hatian diperiksa |
| 4. Finalisasi | Editor / engineer | Draf ditandai **final** |
| 5. Pemeriksaan otomatis | Komputer | Sekitar 700 tes, lalu build dengan pemindaian keamanan setiap halaman |
| 6. Terbit | Engineer | Digabung ke `main`; situs dibangun ulang dan di-deploy otomatis |
| 7. Verifikasi | Editor | Buka halaman tayang dan pastikan terbaca benar dalam kedua bahasa |

Perubahan kecil (memperbaiki satu kalimat) memakan beberapa menit setelah disetujui. Pemeriksaan otomatis sekitar satu menit.

## 8. Siapa memegang apa

| Bidang | Pemegang |
|---|---|
| Keputusan editorial, kata-kata akhir | Penulis, Rahmat Wibowo |
| Tinjauan hukum | Penasihat hukum |
| Kode, build, deploy | Tim engineering (lihat [Panduan engineering](engineering-guide.id.md)) |
| Domain dan akun Cloudflare | Pemilik situs |

## 9. Janji mutu (dan cara menegakkannya)

| Janji | Cara menegakkan |
|---|---|
| Disclaimer di setiap halaman | Build gagal bila halaman tanpa banner |
| Tidak ada tautan atau gambar internal yang rusak | Build memeriksa setiap tautan dan gambar |
| Versi Indonesia dan Inggris tetap berpasangan | Build memeriksa pasangan bahasa dan sitemap |
| Tidak ada data pribadi terbit | Tes otomatis memindai teks yang terbit |
| Situs tetap sangat cepat dan mudah diakses | Tim menargetkan Lighthouse 100 untuk Performance, Accessibility, Best Practices, dan SEO |

## 10. Istilah

| Istilah | Arti sederhana |
|---|---|
| **Situs statis** | Halaman disiapkan lebih dulu sebagai berkas biasa; tidak ada proses server tiap kunjungan |
| **Draf / final** | Belum disetujui terbit / sudah disetujui |
| **Build** | Langkah yang mengubah konten menjadi situs jadi |
| **Deploy** | Menayangkan situs jadi di internet |
| **CI** | Proses uji dan build otomatis yang berjalan saat kode didorong |
| **Lighthouse** | Alat Google yang menilai kecepatan, aksesibilitas, dan SEO halaman dari 100 |
| **SEO** | Membuat halaman mudah dipahami dan didaftar mesin pencari |
| **Sitemap** | Berkas daftar semua halaman agar mesin pencari bisa menemukannya |
| **Hak jawab** | Kesempatan pihak yang disebut untuk menanggapi, dimuat apa adanya |
| **Kiasan** | Kisah yang tokohnya melambangkan orang atau peristiwa nyata |
