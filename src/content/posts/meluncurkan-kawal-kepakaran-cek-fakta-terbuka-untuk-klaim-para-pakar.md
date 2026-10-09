---
title: "Meluncurkan Kawal Kepakaran: Cek Fakta Terbuka untuk Klaim Para Pakar"
originalTitle: "Launching Kawal Kepakaran: An Open Fact-Check of Expert Claims"
author: "Rahmat Wibowo"
translationDate: 2026-10-09
classification: pendapat
subjects: ["Kawal Kepakaran"]
translationStatus: final
---
*Pada 9 Oktober 2026 saya meluncurkan [kawalkepakaran.org](https://kawalkepakaran.org). Situs ini tumbuh dari "Kawal Abil Sudarman", dan kini menguji klaim para pakar secara umum: kredensial diperiksa, bukti dibuka, dan setiap pakar yang disebut berhak menjawab. Isinya adalah catatan dan pendapat saya, bukan putusan pengadilan.*

## Mengapa berganti nama

Situs pertama saya berpusat pada satu orang. Itu keliru sebagai bentuk jangka panjang: yang layak diuji adalah **klaim**, bukan seseorang. Maka namanya menjadi Kawal Kepakaran, dan kasus Abil Sudarman menjadi **Kasus 001**, kasus pertama dari yang mungkin menyusul. Artikel, bukti, linimasa, dan halaman Bowobharata dari masa awal tetap ada di sana.

## Apa yang ada di situs

- **[Pakar](/pakar).** Satu profil per pakar: kredensial yang diperiksa, klaim yang diuji, dan tanggapannya.
- **[Cek klaim](/klaim).** Setiap klaim diberi salah satu dari empat putusan (dikonfirmasi, sebagian, tidak terbukti, belum bisa diverifikasi), tingkat keyakinan, bukti, dan satu bagian wajib: **yang tidak dibuktikan**.
- **[Metode](/metode).** Lima langkah yang saya pakai, termasuk arti tiap putusan. "Tidak terbukti" bukan pernyataan bahwa suatu klaim pasti salah.
- **[Manifesto](/manifesto).** Pernyataan saya tentang mengapa akuntabilitas harus terbuka, bersumber, dan bisa dijawab, berlawanan dengan daftar hitam yang disimpan diam-diam.
- **[Kasus 001](/kasus/abil-sudarman).** Termasuk [linimasa Abil Sudarman](/kasus/abil-sudarman/linimasa-abil), yang hanya memuat apa yang sudah ada di artikel dan bukti situs ini. Entri yang tidak punya tanggal pada sumbernya tidak saya beri tanggal.
- **[Hak jawab](/hak-jawab).** Berlaku bagi setiap pakar yang disebut. Jawaban dimuat apa adanya, tanpa disunting.

Saat peluncuran, situs memuat satu pakar dan lima klaim. **Kelimanya berstatus "belum bisa diverifikasi".** Itu sengaja: saya hanya menaikkan sebuah klaim bila ada konfirmasi dari penerbit kredensialnya atau dari sumber primer.

## Cara membangunnya

Kodenya terbuka di [github.com/rweebs/kawalkepakaran](https://github.com/rweebs/kawalkepakaran) dengan lisensi MIT. Tulisan aslinya berlisensi CC BY 4.0; materi pihak ketiga seperti tangkapan layar bukti tetap tunduk pada ketentuan pemiliknya. Situs ini statis, dibangun dengan Astro, dan disajikan lewat Cloudflare.

Siapa pun boleh mengirim bukti, baik yang memperkuat maupun yang membantah sebuah klaim, lewat formulir di GitHub. Tolong tutup data pribadi, sertakan sumber yang dapat diperiksa, dan tulis apa yang ditunjukkan bukti dan apa yang tidak dibuktikannya.

## Hasil pengukuran

Saya mengukur beranda situs yang sudah tayang dengan simulasi ponsel (jaringan Slow 4G, CPU empat kali lebih lambat):

- **Largest Contentful Paint 765 ms** dan **Cumulative Layout Shift 0,00**.
- Skor Lighthouse seluler **100** untuk Accessibility, Best Practices, dan SEO.

Sebelum satu perbaikan, LCP beranda 1.331 ms. Penyebabnya logo di bagian atas halaman yang baru diminta browser setelah CSS inline selesai dibaca; setelah logo itu saya sematkan langsung di HTML, angkanya turun ke kisaran 780 ms pada uji lokal.

## Batasan tulisan ini

- Angka di atas berasal dari satu kali uji lab pada beranda. Saya tidak menjalankan PageSpeed Insights untuk skor Performance, dan angkanya bisa berbeda di jaringan dan perangkat lain.
- Kelima klaim di situs berstatus "belum bisa diverifikasi". Tidak satu pun merupakan temuan bahwa seseorang melakukan sesuatu yang melanggar hukum.
- Saya adalah pihak dalam sengketa yang tercatat di Kasus 001. Saya menyatakannya agar pembaca dapat menimbangnya, dan tiap halaman menyertakan hak jawab.
- Jika ada yang ingin mengoreksi atau menjawab apa pun di situs atau di tulisan ini, saya akan menerbitkan jawabannya secara utuh berdampingan dengan tulisan ini.
- Ini adalah pendapat dan penuturan saya. Saya bukan pengacara, dan tulisan ini bukan nasihat hukum.
