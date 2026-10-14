# Status proyek & cara melanjutkan pengembangan

Dokumen serah-terima, ditulis 14 Oktober 2026 saat pengembangan di VPS dihentikan. Seluruh kode ada di repositori
ini; tidak ada data atau konfigurasi yang tertinggal di server.

## Di mana aplikasi berjalan

- **Aplikasi:** <https://dodyirawaan.github.io/geomine-studio/> — dibangun dan di-deploy otomatis oleh GitHub Actions
  ([`deploy.yml`](../.github/workflows/deploy.yml)) setiap ada push ke `main`. Tidak perlu server.
- **Data pengguna** (proyek, library, PDF, review, API key) tersimpan di **browser** masing-masing pengguna
  (IndexedDB), bukan di server. Cadangkan lewat menu sync/backup terenkripsi ke GitHub di dalam aplikasi.
- **AI** dipanggil langsung dari browser ke penyedia (Anthropic, OpenAI, Gemini, OpenRouter) dengan key milik pengguna.

## Status fitur

Lihat tabel fitur di [README](../README.md). Pekerjaan terakhir (commit penutup):

- Screening terprioritas dengan *active learning* di browser (TF-IDF + naive Bayes, gaya ASReview) dengan aturan
  berhenti SAFE dan sampel cek acak — `src/review/prioritise.ts`, `src/pages/review/ScreeningAids.tsx`.
- Ekspor/impor keputusan screening ke ASReview (CSV), Rayyan/Covidence (RIS → CSV) — `src/review/exchange.ts`.
- Methods dan diagram PRISMA melaporkan record yang dihentikan oleh *automation tools*.
- Panduan pengguna: [REVIEW.md](REVIEW.md) (review) dan [VLAB.md](VLAB.md) (machine learning).

## Melanjutkan pengembangan

Pilih salah satu — semuanya tidak butuh VPS:

1. **GitHub Codespaces** (di browser): buka repositori → **Code → Codespaces → Create codespace on main**, lalu
   `npm ci && npm run dev`. Codespaces membuka port 5173 otomatis.
2. **Laptop sendiri:** pasang Node.js 22, lalu
   ```bash
   git clone git@github.com:dodyirawaan/geomine-studio.git
   cd geomine-studio
   npm ci
   npm run dev      # http://localhost:5173/geomine-studio/
   ```
3. **Edit langsung di GitHub** (tekan `.` di halaman repositori untuk github.dev) — cocok untuk perubahan kecil; push
   ke `main` akan di-build dan di-deploy otomatis.

Sebelum push: `npm run lint && npm run build` (keduanya juga dijalankan CI; kalau gagal, situs tidak di-update).
`node_modules/` dan `dist/` tidak disimpan di git — dibuat ulang oleh `npm ci` dan `npm run build`.

## Catatan teknis

- Base path Vite: `/geomine-studio/` (`vite.config.ts`) — ubah bila nama repositori berganti.
- GitHub Pages harus memakai **Settings → Pages → Source: GitHub Actions**.
- Build memberi peringatan chunk > 500 kB (TensorFlow.js, pdf.js, Pyodide loader); tidak memengaruhi fungsi.
  Kandidat perbaikan berikutnya: `import()` dinamis per halaman.
