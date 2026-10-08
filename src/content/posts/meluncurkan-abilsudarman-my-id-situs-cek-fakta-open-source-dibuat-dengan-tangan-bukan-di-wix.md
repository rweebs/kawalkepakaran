---
title: "Meluncurkan abilsudarman.my.id: Situs Cek Fakta Open Source, Dibuat dengan Tangan, Bukan di Wix"
originalTitle: "Launching abilsudarman.my.id: An Open-Source Fact-Check Site, Built by Hand, Not on Wix"
author: "Rahmat Wibowo"
translationDate: 2026-10-05
classification: pendapat
subjects: ["Abil Sudarman"]
translationStatus: final
---
![Ilustrasi header: burung-burung ababil membawa batu di atas halaman utama abilsudarman.my.id](/img/peluncuran-situs-001.png)

*Pada 4 Oktober 2026 saya meluncurkan abilsudarman.my.id, "Kawal Abil Sudarman," sebuah situs publik yang mengumpulkan klaim tentang Abil Sudarman, artikel terjemahan, dan status verifikasinya. Situs ini menyatakan bahwa isinya adalah pendapat saya dan bukan vonis, serta bahwa Bapak Sudarman berhak menjawab setiap entri. Tulisan ini menjelaskan peluncuran dan cara situs dibangun. Tulisan ini bukan temuan tentang siapa pun.*

## Apa yang diluncurkan

Situs ini bernama **Operasi Ababil**. Namanya diambil dari burung ababil yang dalam kisahnya membawa batu-batu kecil satu per satu. Gagasannya sama: mengumpulkan bukti dan artikel terjemahan secara terbuka, satu per satu.

Bagian utamanya:

- **Klaim yang sedang ditinjau.** Daftar klaim tentang Bapak Sudarman yang pernah dipublikasikan atau dikutip, masing-masing dengan status verifikasi. Situs ini menyatakan bahwa "belum ada konfirmasi" tidak berarti suatu klaim salah.
- **Artikel terjemahan.** Artikel tentang beliau, diterjemahkan agar lebih banyak orang dapat membacanya.
- **Halaman hak jawab dan disclaimer.** Keduanya ditautkan dari navigasi utama.
- **Pemutar lagu tema.** Pemutar YouTube pihak ketiga baru dimuat setelah pengunjung menekan tombol "Lagu tema", dan lagunya diputar penuh tanpa perlu login.

Situs ini berbahasa Indonesia. Kunjungi di [abilsudarman.my.id](https://abilsudarman.my.id).

## Cara membangunnya

Kodenya terbuka untuk umum di [github.com/rweebs/abilsudarman](https://github.com/rweebs/abilsudarman). Situs ini adalah situs statis [Astro](https://astro.build) dengan React islands, [Three.js](https://threejs.org) untuk karya seni hero, dan Framer Motion untuk efek muncul dan miring. Situs ini disajikan lewat Cloudflare. Riwayat commit memperlihatkan pengerjaannya: kerangka awal dengan design token, Content Security Policy berbasis hash tanpa inline style, penyempurnaan SEO (judul, deskripsi, skema, breadcrumb), dan pengujian.

![Repositori GitHub publik untuk abilsudarman.my.id](/img/peluncuran-situs-002.png)

Wappalyzer, yang dijalankan pada situs langsung, mendeteksi Astro, React, Framer Motion, Three.js, Cloudflare, HTTP/3, dan Open Graph.

![Wappalyzer menampilkan teknologi yang terdeteksi pada abilsudarman.my.id](/img/peluncuran-situs-003.png)

## Hasil PageSpeed

Saya menjalankan Google PageSpeed Insights pada halaman utama pada 5 Oktober 2026 pukul 00.40. Laporan seluler maupun desktop sama-sama memberi nilai **100** untuk Performance, Accessibility, Best Practices, dan SEO, serta **2/2** untuk Agentic Browsing. Ini adalah hasil uji lab dari satu kali percobaan, dan laporan mencatat bahwa skor bersifat perkiraan dan dapat bervariasi. Google belum memiliki data lapangan dari pengguna nyata untuk situs ini.

![Laporan seluler PageSpeed Insights untuk abilsudarman.my.id](/img/pagespeed-mobile.png)

![Laporan desktop PageSpeed Insights untuk abilsudarman.my.id](/img/peluncuran-situs-004.png)

Anda dapat [menjalankan ulang laporannya sendiri](https://pagespeed.web.dev/analysis/https-abilsudarman-my-id/zlqqztsswy?form_factor=desktop&category=performance&category=accessibility&category=best-practices&category=seo&category=agentic-browsing&hl=id).

## Perbandingan yang menurut saya adil

[Laporan investigasi](/artikel/investigative-report-unpacking-the-credentials-of-abil-sudarman) saya sebelumnya menyatakan bahwa abilsudarman.com, situs pribadi yang digunakan Bapak Sudarman untuk mempromosikan dirinya sebagai "pakar vibe code," dibangun dengan Wix. Laporan itu mengutip Wappalyzer serta catatan domain dan IP sebagai buktinya. Kedua tangkapan layar di bawah ini dipakai ulang dari laporan tersebut.

![Wappalyzer pada abilsudarman.com, menampilkan Wix sebagai CMS, platform blog, dan e-commerce (dari laporan sebelumnya)](/img/48c649137c5b8c518ceb0694.png)

![Pencarian IP untuk abilsudarman.com: IP 185.230.63.171, Ashburn, Virginia, ISP Wix.com Ltd. (dari laporan sebelumnya)](/img/41b21db1ee934226991ba62b.png)

Pencarian IP menunjukkan siapa yang menjadi hosting sebuah situs, bukan siapa yang membuatnya, dan Wappalyzer membaca tanda-tanda teknologi sebuah situs. Keduanya hanya mendukung pernyataan bahwa situs tersebut berjalan di Wix, tidak lebih.

Saya tidak mengatakan bahwa memakai Wix itu salah. Itu pilihan yang wajar bagi banyak orang. Perbandingannya lebih sempit: klaim keahlian rekayasa yang mendalam dan perangkat di balik situs yang memuat klaim itu dapat dicek satu sama lain. Pemeriksaan yang sama berlaku untuk karya saya sendiri, itulah sebabnya kode situs ini dibuka untuk umum, agar Anda dapat memeriksanya, mengujinya, dan memberi tahu saya di mana letak kekurangannya.

## Batasan tulisan ini

- Temuan soal Wix berasal dari laporan saya sebelumnya. Saya belum memverifikasi ulang untuk tulisan ini, dan keadaannya mungkin sudah berubah.
- Skor PageSpeed berasal dari satu kali uji lab dan dapat bervariasi.
- Klaim-klaim di situs berstatus "sedang ditinjau." Tidak satu pun merupakan temuan bahwa Bapak Sudarman melakukan sesuatu yang melanggar hukum.
- Jika Bapak Sudarman ingin mengoreksi atau menjawab apa pun di situs atau dalam tulisan ini, saya akan menerbitkan jawabannya secara utuh berdampingan dengan tulisan ini.
- Ini adalah pendapat dan penuturan saya. Saya bukan pengacara, dan tulisan ini bukan nasihat hukum.
