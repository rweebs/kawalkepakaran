# Contributing / Berkontribusi

[🇬🇧 English](#english) · [🇮🇩 Bahasa Indonesia](#bahasa-indonesia)

<a id="english"></a>

## 🇬🇧 English: contributing evidence and code

The code and content of this site are open. Anyone may send evidence, whether it supports or disputes a claim about Abil
Sudarman. The site publishes notes and opinion, not rulings; every item is shown as a claim that can be checked.

### Rules

1. **Checkable source.** Give a link or the origin of the document, and the date a screenshot was taken.
2. **Mask personal data.** ID numbers, student numbers, phone numbers, home addresses and data of unrelated people must be
   covered before you send anything.
3. **Two statements are required:** what the image shows, and what it does **not** prove.
4. **No rumour, no doxxing.** Only matters tied to a public claim. No baseless accusations.
5. **Right of reply.** Abil Sudarman may respond; replies are published as received.

### How to send

**By issue (easiest):** open <https://github.com/rweebs/abilsudarman/issues/new>, attach the image or link, and fill in the
two statements above.

**By pull request:**

1. Fork the repo and save the masked image in `public/img/`.
2. Add one JSON file in `src/content/bukti/`. Copy an existing entry; the schema is in `src/lib/schemas.ts` (fields `title`,
   `group`, `images`, `shows`, `limits`, `source`, `order`).
3. Run `npm test && npm run build`, then open the PR.

### Code contributions

- Read the [Engineering guide](docs/engineering-guide.md) first (setup, folder map, how to add an article, a timeline entry
  or a page).
- Branch from `master`, keep one logical change per commit, and use messages like `feat(seo): …` or `fix(build): …`.
- Run `npm test && npm run build` before opening the PR. CI runs the same.
- Keep wording about people hedged ("I allege", "in my opinion"). Do not change the disclaimer or right-of-reply text without
  the author's approval.

### Corrections and removals

See the Right of reply page on the site.

---

<a id="bahasa-indonesia"></a>

## 🇮🇩 Bahasa Indonesia: berkontribusi bukti dan kode

Kode dan konten situs ini terbuka. Siapa pun boleh mengirim bukti, baik yang memperkuat maupun yang membantah klaim tentang Abil Sudarman. Situs ini memuat catatan dan pendapat, bukan putusan; setiap bukti dimuat sebagai klaim yang dapat diperiksa.

### Aturan

1. **Sumber dapat diperiksa.** Cantumkan tautan atau asal dokumen dan tanggal pengambilan tangkapan layar.
2. **Tutup data pribadi.** NIK, NIM, nomor telepon, alamat rumah, dan data pribadi pihak yang tidak terkait harus ditutup sebelum dikirim.
3. **Dua keterangan wajib:** apa yang ditunjukkan gambar, dan apa yang **tidak** dibuktikan olehnya.
4. **Tanpa rumor, tanpa doxxing.** Hanya hal yang berkaitan dengan klaim publik. Tidak ada tuduhan tanpa dasar.
5. **Hak jawab.** Abil Sudarman berhak menanggapi; tanggapan dimuat apa adanya.

### Cara mengirim

**Lewat Issue** (paling mudah): buka https://github.com/rweebs/abilsudarman/issues/new, lampirkan gambar atau tautan, dan isi dua keterangan di atas.

**Lewat Pull Request:**
1. Fork repo, lalu simpan gambar yang sudah ditutup datanya di `public/img/`.
2. Tambahkan satu berkas JSON di `src/content/bukti/` (salin format entri yang ada; skema di `src/lib/schemas.ts`, kolom `title`, `group`, `images`, `shows`, `limits`, `source`, `order`).
3. Jalankan `npm test && npm run build`, lalu buka PR.

### Kontribusi kode

- Baca dulu [Panduan engineering](docs/engineering-guide.id.md) (persiapan, peta folder, cara menambah artikel, entri linimasa,
  atau halaman).
- Cabangkan dari `master`, satu perubahan logis per commit, dan pakai pesan seperti `feat(seo): …` atau `fix(build): …`.
- Jalankan `npm test && npm run build` sebelum membuka PR. CI menjalankan hal yang sama.
- Jaga kalimat tentang orang tetap berhati-hati ("saya menduga", "menurut saya"). Jangan mengubah disclaimer atau teks hak
  jawab tanpa persetujuan penulis.

### Koreksi dan penghapusan

Lihat halaman Hak jawab di situs.
