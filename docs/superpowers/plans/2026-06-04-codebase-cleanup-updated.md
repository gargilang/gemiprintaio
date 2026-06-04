# gemiprint Codebase Cleanup - Master Plan

> **Untuk agentic workers:** WAJIB gunakan skill superpowers:subagent-driven-development atau superpowers:executing-plans untuk mengeksekusi plan ini task demi task. Gunakan sintaks checkbox untuk tracking.

**Tujuan:** Membersihkan, menyederhanakan, dan meningkatkan kualitas seluruh codebase gemiprint.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres, SQLite (better-sqlite3), Tailwind CSS 4, SWR, Jest

---

## Legenda Status

- [x] = Sudah selesai
- [ ] = Belum dikerjakan
- [-] = Di-skip (monolitik tightly-coupled)

---

## Semua Task

- [x] Task 1: Hapus use-async-data.ts (dead code) — commit 3220855
- [x] Task 2: Hapus BagiHasilManageModal.tsx (dead code) — commit 60daf46
- [x] Task 3: Fix N+1 query di getMaterials() — commit d33c295
- [x] Task 4: Bersihkan console.log di 8 file production — commit e4daaf2
- [x] Task 5: Migrasi Flutter endpoint English ke Indonesian — commit 7bba0ec
- [x] Task 6: Hapus 8 folder API shim English di Next.js — commit 4503523
- [x] Task 7: Pecah db-unified.ts menjadi db-supabase.ts + db-sqlite.ts — commit 8f78518
- [x] Task 8: Pecah pos-service.ts menjadi pos-queries + pos-mutations — commit 2ba45c1
- [x] Task 9: Pecah purchases-service.ts menjadi purchases-queries + purchases-mutations — commit 6539ff8
- [x] Task 10: Pecah pengaturan/page.tsx (4458 baris) menjadi 4 tab components — commit 0f7266e
- [-] Task 11: Pecah FormulirPembelian.tsx — monolitik, butuh sesi tersendiri
- [-] Task 12: Pecah ModalTambahBarang.tsx — monolitik, butuh sesi tersendiri
- [-] Task 13: Pecah pos/page.tsx — monolitik, tidak ada tab structure
- [-] Task 14: Pecah keuangan/page.tsx — monolitik, tightly-coupled
- [x] Task 15: Pecah db-sqlite.ts (2490 baris) menjadi schema + migrations — commit 01b7bfd
- [x] Task 16: Tambah role guard ke semua mutation API routes (26 file) — commit 60ff541
- [x] Task 17: Kurangi TypeScript any di pos-mutations + purchases-mutations — commit 3e4c41d
- [-] Task 18: Pecah file page besar lainnya — monolitik, butuh sesi tersendiri
- [x] Task 19: Full verification pass — type-check 0 errors, 199/199 tests pass

---

## Ringkasan Akhir

| Task | Deskripsi | Status |
| ---- | --------- | ------ |
| 1 | Hapus use-async-data.ts | Selesai |
| 2 | Hapus BagiHasilManageModal.tsx | Selesai |
| 3 | Fix N+1 query getMaterials() | Selesai |
| 4 | Bersihkan console.log | Selesai |
| 5 | Migrasi Flutter endpoint | Selesai |
| 6 | Hapus 8 folder API shim | Selesai |
| 7 | Pecah db-unified.ts | Selesai |
| 8 | Pecah pos-service.ts | Selesai |
| 9 | Pecah purchases-service.ts | Selesai |
| 10 | Pecah pengaturan/page.tsx | Selesai |
| 11 | Pecah FormulirPembelian.tsx | Di-skip |
| 12 | Pecah ModalTambahBarang.tsx | Di-skip |
| 13 | Pecah pos/page.tsx | Di-skip |
| 14 | Pecah keuangan/page.tsx | Di-skip |
| 15 | Pecah db-sqlite.ts | Selesai |
| 16 | Role guard mutation API routes | Selesai |
| 17 | Kurangi TypeScript any | Selesai |
| 18 | Pecah file page besar lainnya | Di-skip |
| 19 | Verifikasi akhir | Selesai |

**12 dari 19 task selesai. 7 task di-skip karena komponen UI monolitik tightly-coupled — butuh pendekatan React Context di sesi tersendiri.**

*Terakhir diperbarui: 2026-06-04*

---

## Panduan untuk Agen Berikutnya

### A. Cara Menulis File .md Panjang Tanpa Error

**Masalah yang ditemui:** `Write` tool dan `CreatePlan` tool gagal dengan JSON parsing error saat konten panjang mengandung backtick, backslash, atau tanda kutip. Shell heredoc juga gagal jika string mengandung karakter khusus.

**Solusi yang terbukti berhasil: Node.js dengan `appendFileSync` per section**

```
node -e "var fs=require('fs'); fs.writeFileSync('file.md', 'header\n');"
node -e "var fs=require('fs'); fs.appendFileSync('file.md', 'section1\n');"
node -e "var fs=require('fs'); fs.appendFileSync('file.md', 'section2\n');"
```

**Aturan wajib:**

- Jangan gunakan `Write` tool untuk file lebih dari 200 baris
- Jangan gunakan `Write` tool jika konten mengandung backtick atau tanda kutip ganda
- Gunakan `StrReplace` untuk modifikasi file yang sudah ada (paling aman)
- Untuk file baru yang panjang: tulis per section kecil dengan `appendFileSync`
- Pakai `node -e "..."` untuk konten pendek tanpa karakter khusus
- Pakai `node << 'NODESCRIPT' ... NODESCRIPT` untuk konten lebih panjang, tapi HINDARI backtick di dalam heredoc
- Jika heredoc gagal karena karakter khusus, pecah ke beberapa `node -e` calls yang lebih kecil

---

### B. Task yang Di-skip: Detail dan Persyaratan

Semua task berikut di-skip karena komponen UI **monolitik tightly-coupled** — state variables saling bergantung sehingga ekstraksi naif menghasilkan prop-drilling yang tidak maintainable.

**File yang perlu dipecah di sesi berikutnya:**

| File | Baris | Kompleksitas |
| ---- | ----- | ------------ |
| `src/app/pos/page.tsx` | 2083 | Tinggi — state keranjang + barang + customer + 5 modal |
| `src/app/keuangan/page.tsx` | 2049 | Tinggi — state buku kas + filter + archive + modal |
| `src/components/FormulirPembelian.tsx` | 1522 | Tinggi — form + items + PPN + split roll |
| `src/components/ModalTambahBarang.tsx` | 1186 | Sedang — form barang + roll variants + harga satuan |
| `src/app/barang/page.tsx` | 1603 | Sedang — tabel + 3 modal inline |
| `src/app/pengguna/page.tsx` | 1387 | Sedang — tabel + form modal |
| `src/app/produksi/spk/page.tsx` | 1239 | Sedang — SPK list + detail panel |
| `src/components/finance/PengaturanKeuanganModal.tsx` | 1266 | Sedang — tab modal multi-form |
| `src/components/finance/ExpressionAssistant.tsx` | 1176 | Tinggi — AST editor + preview + suggestion |

**Pendekatan yang benar (jangan ulangi cara yang gagal):**

1. **Buat React Context per domain terlebih dahulu** sebelum memecah komponen.
   Contoh: `POSContext` untuk state POS, `KeuanganContext` untuk state keuangan.
   Ini menghilangkan kebutuhan prop-drilling.

2. **Pecah modal dulu, bukan section** — modal adalah unit paling terisolasi.
   Contoh untuk `barang/page.tsx`:
   - Ekstrak `ModalCatatRusak` dengan props `{ material, onClose, onSuccess }`
   - Ekstrak `ModalKonversiRoll` dengan props `{ material, onClose, onSuccess }`
   - Sisakan tabel dan state utama di page.tsx

3. **Urutan yang disarankan (dari termudah ke tersulit):**
   - `barang/page.tsx` — modal-modalnya paling bisa diisolasi
   - `pengguna/page.tsx` — paling sederhana
   - `PengaturanKeuanganModal.tsx` — sudah ada tab structure
   - `keuangan/page.tsx` — setelah KeuanganContext dibuat
   - `pos/page.tsx` — terakhir, paling kompleks

4. **Verifikasi wajib setelah setiap ekstraksi:**
   - `npm run type-check` harus 0 errors
   - `npm run build` harus sukses
   - Test manual di browser: klik semua tombol di komponen yang diubah

**Peringatan keras:** Jangan pernah ekstrak JSX ke file baru tanpa pemetaan state terlebih dahulu. Baca seluruh komponen, identifikasi semua state yang dibutuhkan sub-komponen, baru putuskan interface props atau Context yang tepat.

---

*Appendix ditambahkan: 2026-06-04*

