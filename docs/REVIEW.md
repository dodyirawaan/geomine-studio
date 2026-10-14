# Tutorial: menulis artikel review di GeoMine Studio

Panduan ini menjelaskan langkah demi langkah menulis artikel review — dari memilih metode sampai naskah siap
dikirim ke jurnal Q1 — dengan menu **Reviews** di GeoMine Studio. Label tombol di aplikasi berbahasa Inggris dan
ditulis seperti di layar.

---

## 1. Pilih metode review yang tepat

| Metode | Kapan dipakai | Pedoman pelaporan | Langkah wajib |
|---|---|---|---|
| **Systematic review** | Pertanyaan riset yang fokus (mis. "seberapa akurat model ML memprediksi intensitas rockburst?") dijawab dari *semua* studi yang memenuhi syarat | PRISMA 2020 | Protokol → pencarian → screening judul/abstrak → full text → ekstraksi → penilaian kualitas → sintesis |
| **Scoping review** | Memetakan bidang yang luas atau baru (apa saja yang sudah diteliti, dengan metode apa, di mana celahnya) | PRISMA-ScR + kerangka Arksey & O'Malley | Sama seperti sistematis, tanpa penilaian kualitas |
| **Bibliometric review** | Mengukur perkembangan bidang yang besar: tren publikasi, jurnal utama, karya paling berpengaruh, evolusi tema | Alur *science mapping* (Zupic & Čater) | Pencarian → screening ringan → analisis indikator & tema |
| **Narrative / critical review** | Ulasan pakar *state of the art* tentang mekanisme, metode, dan perdebatan | Pencarian terdokumentasi | Pencarian → seleksi → sintesis kritis |

Tips: untuk jurnal seperti IJMST, TUST, JRMGE, atau IJRMMS, review sistematis atau scoping dengan diagram PRISMA dan
sintesis kritis jauh lebih mudah diterima daripada review naratif murni.

## 2. Mulai dari keyword bank dan saran topik

Di halaman **Reviews** ada dua alat untuk memulai:

- **Suggested review topics** — 14 topik siap pakai (termasuk 6 topik *deep mining*: rockburst + ML di tambang dalam, bahaya panas, creep/deformasi besar roadway dalam, kopling THM, tegangan in-situ, penyangga dinamis). Klik **Check** untuk menghitung langsung di OpenAlex: jumlah artikel 10 tahun terakhir vs jumlah *review* yang sudah ada.
  - **Under-reviewed — good opportunity**: banyak studi primer, sedikit review → peluang terbaik.
  - **Some reviews exist**: perlu sudut pandang baru yang jelas.
  - **Crowded with reviews**: persempit pertanyaannya.
  - Klik **Start this review** untuk membuat proyek dengan string pencarian sudah terisi.
- **Keyword bank** — blok konsep per topik (rockburst, deep mining, penyangga, batubara & air, backfill & CO₂, IR & AE, metode numerik, machine learning), masing-masing berisi sinonim dan variasi ejaan. Centang satu blok per konsep → string Boolean terbentuk otomatis → **Count hits** untuk melihat ukurannya (ideal: ratusan sampai ±3.000). Tambah sinonim sendiri atau buat konsep baru (*Save to my bank*); bank Anda tersimpan di browser.

Contoh: centang *Deep mining* + *Heat hazard* → pada pengecekan Oktober 2026 menghasilkan sekitar 274 artikel dan hanya 1 review.

## 3. Buat proyek review

1. Buka **Reviews** → isi *Working title*.
2. Pilih metode (kartu di bawahnya menjelaskan kapan tiap metode dipakai).
3. Pilih jurnal target (dikelompokkan per topik) → **Create review project**.

## 4. Langkah 1 — Protocol

Protokol adalah "kontrak" review Anda dan harus ditetapkan **sebelum** screening.

1. Tulis **Topic / idea**: topik, ruang lingkup, alasan review ini dibutuhkan sekarang.
2. Klik **Draft protocol with AI**. AI (mode *Review Methodologist*) mengusulkan:
   - 2–4 **pertanyaan riset** (RQ) yang tepat,
   - kerangka **PICO** (sistematis), **PCC** (scoping), atau ruang lingkup (bibliometrik/naratif),
   - **kriteria inklusi (I1, I2, …) dan eksklusi (E1, E2, …)** yang bisa dicek dari judul dan abstrak,
   - 2–4 **string pencarian Boolean**.
3. **Edit semuanya.** Contoh string pencarian yang baik:
   ```
   (rockburst OR "rock burst" OR strainburst) AND ("machine learning" OR "deep learning" OR "neural network") AND (prediction OR classification)
   ```
   - Pakai `AND`, `OR`, `NOT`, tanda kurung, dan "frasa dalam kutip"; jangan pakai koma.
   - Masukkan sinonim dan variasi ejaan.
   - Satu string sebaiknya menghasilkan ratusan record, bukan puluhan ribu.
4. Atur rentang tahun, batas record per string, bahasa, dan centang *Journal articles and reviews only* bila perlu.
5. Tidak perlu wildcard (`*`): OpenAlex otomatis mencocokkan bentuk kata (rockbolt = rockbolts). Bagian *Build a search string from the keyword bank* membantu menyusun string.

## 5. Langkah 2 — Search

1. Klik **Run search on OpenAlex**. Setiap string dijalankan; hasilnya digabung dan **duplikat dihapus otomatis**
   (berdasarkan DOI, ID OpenAlex, dan judul).
2. Tambahkan paper penting dari *citation chasing* atau saran pakar lewat **Add a record by DOI** (dihitung sebagai
   "other sources" di PRISMA).
3. **Tambahkan basis data lain** (sangat disarankan untuk Q1): jalankan string yang sama di **Scopus** atau **Web of Science**
   lewat akses kampus, ekspor hasilnya sebagai **BibTeX atau RIS (dengan abstrak)**, lalu impor di kartu *Add other databases*.
   Duplikat dengan OpenAlex digabung otomatis, dan setiap basis data muncul terpisah di diagram PRISMA dan teks Methods.
4. Catat tanggal pencarian terakhir — otomatis masuk ke teks Methods. Menjalankan ulang pencarian **tidak menghapus
   keputusan screening** yang sudah ada.

## 6. Langkah 3 — Screening judul & abstrak

1. Untuk setiap record pilih **Include**, **Maybe**, atau **Exclude** dengan kode kriterianya (E1, E2, …).
2. Agar cepat, klik **AI suggestions** — AI membaca judul/abstrak dan mengusulkan keputusan beserta alasannya
   (mis. *"E2: studi beton, bukan batuan"*). Usulan **tidak berlaku sampai Anda menerimanya**.
3. Periksa sampel usulan AI, lalu boleh **Accept AI includes/excludes** secara massal.
4. Pakai keyboard: `I` include, `E` exclude, `M` maybe, `↑`/`↓` pindah record.
5. Selesaikan semua *Maybe* sebelum menulis.

> Di bagian Methods akan tertulis bahwa AI hanya memberi usulan dan semua keputusan dibuat oleh penulis — ini penting
> untuk transparansi dan kebijakan AI jurnal.

## 7. Langkah 4 — Full text (systematic & scoping)

Buka setiap laporan yang lolos (tautan DOI / *open access*), pastikan memenuhi semua kriteria, lalu tandai
**Eligible** atau **Exclude because…** dengan alasan. Alasan eksklusi muncul di diagram PRISMA.

## 8. Langkah 5 — Extraction & quality

1. **Add studies to the library** — studi terinklusi masuk ke Literature Library dengan tag nama review, sehingga
   mendapat *citation key* (mis. `pu2019machine`).
2. Lampirkan PDF di Library bila ada (ekstraksi dari full text lebih lengkap daripada dari abstrak).
3. **Extract with AI** — mengisi tabel: lokasi/kedalaman, batuan & sifatnya, masalah, metode, data, temuan utama,
   keterbatasan. Nilai yang tidak ada di teks ditulis *"not reported"*. **Cek setiap baris dengan paper aslinya.**
4. (Systematic) **Quality appraisal**: beri skor 0/1/2 untuk lima kriteria per studi.

## 9. Langkah 6 — Analysis

- **Diagram alir PRISMA** dengan angka di setiap tahap — unduh **PNG 300 dpi** (untuk Word) atau **SVG** (untuk LaTeX).
- **Bibliometrik**: publikasi per tahun, jurnal utama, istilah paling sering, evolusi tema per periode, paper paling
  banyak dikutip — untuk studi terinklusi atau semua record.
- **Screening log (CSV)** — semua record beserta keputusan dan alasannya, untuk materi suplemen.

## 10. Langkah 7 — Write

1. Pilih **gaya sitasi** sesuai jurnal: Elsevier Harvard, APA 7, Springer, atau bernomor [1].
2. Klik **Write N missing sections + abstract**, atau tulis per bagian:
   - **Review methodology** dan **Overview of the included studies** dibuat *dari data* (tanpa AI): protokol, string
     pencarian, tanggal, angka PRISMA, tabel bukti (*evidence table*) — sehingga semua angka pasti benar.
   - **Overview** juga memuat **tabel statistik bukti** yang dihitung dari tabel ekstraksi: berapa studi memakai tiap
     keluarga metode, sumber data, cross-validation, validasi di situs independen, ketidakpastian, interpretabilitas,
     serta ukuran dataset. Angka-angka ini juga diberikan ke AI, sehingga klaim seperti *"hanya 7 dari 89 studi…"* benar.
   - **Thematic synthesis** ditulis dua tahap: AI merencanakan 4–7 tema (setiap tema dengan daftar studinya), lalu setiap
     tema ditulis mendalam (400–900 kata) dengan tabel perbandingan.
   - **Challenges & future directions** dan **Conclusions** ditulis AI **hanya dengan mengutip studi terinklusi**
     (`[@key]`), tanpa mengarang angka. Klaim yang butuh sumber di luar review ditandai `[VERIFY]`.
   - **Limitations of this review** dibuat dari fakta proyek (basis data, bahasa, screening berbantuan AI, ekstraksi
     dari abstrak vs full text, bias publikasi).
   - **Abstract, highlights, keywords** dibuat terakhir dari isi review.
3. **Edit setiap bagian** — gunakan *Preview* untuk melihat sitasi yang sudah diformat.
4. Periksa panel **Publication readiness**: item *Required* (screening tuntas, ekstraksi lengkap, penilaian kualitas,
   semua bagian ditulis, abstrak ≤ 250 kata, tanpa placeholder, semua sitasi valid) dan *Strongly recommended for Q1*
   (≥ 2 basis data, ekstraksi dari full text, sintesis ≥ 2.500 kata, naskah 6.000–12.000 kata, ≥ 80% studi dikutip,
   review terdahulu dibahas di Introduction). Selesaikan semuanya sebelum submit.

## 11. Langkah 8 — Jadikan manuskrip dan kirim

1. **Create the manuscript** → naskah lengkap dengan section review, daftar pustaka (studi terinklusi + referensi
   metodologi seperti PRISMA 2020), dan gaya sitasi pilihan Anda.
2. Di editor:
   - **References → Verify** untuk mengecek semua referensi ke Crossref,
   - **Workspace → Consistency check** (angka, singkatan, placeholder),
   - **Workspace → Pipeline → Reviewer 2** untuk kritik ala reviewer,
   - **Q1 checklist** sebelum submit.
3. **Export** ke Word (persamaan & sitasi rapi) atau proyek LaTeX template jurnal (elsarticle / sn-jnl dengan gaya
   bibliografi yang sesuai).
4. Sisipkan gambar PRISMA di tempat yang tertulis *Fig. [X]* dan ganti *Table [X]* dengan nomornya.

---

## Tips agar review diterima jurnal Q1

- **Tunjukkan kebaruan** dibanding review sebelumnya — sebutkan review terdahulu dan apa yang tidak mereka bahas.
- **Pencarian harus bisa diulang**: string lengkap, basis data, tanggal, filter.
- **Sintesis harus kritis**, bukan ringkasan paper satu per satu: bandingkan metode, jelaskan kontradiksi, kaitkan
  dengan mekanisme (energi, tegangan, struktur).
- **Celah riset harus didukung bukti** dari studi yang direview, bukan opini.
- **Nyatakan keterbatasan review**: satu basis data, bahasa Inggris saja, bias publikasi.
- **Ungkapkan penggunaan AI** di bagian *Declaration of generative AI* sesuai kebijakan jurnal.

## Gaya sitasi yang tersedia

| Gaya | Di dalam teks | Daftar pustaka |
|---|---|---|
| Elsevier Harvard | (Hoek and Brown, 2019; Cai et al., 2021a) | Hoek, E., Brown, E.T., 2019. Judul. Jurnal 11 (3), 445–463. https://doi.org/… |
| APA 7 | (Hoek & Brown, 2019) | Hoek, E., & Brown, E. T. (2019). Judul. *Jurnal*, *11*(3), 445–463. https://doi.org/… |
| Springer basic | (Hoek and Brown 2019) | Hoek E, Brown ET (2019) Judul. Jurnal 11(3):445–463. https://doi.org/… |
| Bernomor | [1], [2–4] | [1] E. Hoek, E.T. Brown, Judul, Jurnal 11 (2019) 445–463. https://doi.org/… |

Gaya bisa diganti kapan saja di **Manuscript → References → Citation style**; pratinjau dan semua ekspor ikut berubah.
