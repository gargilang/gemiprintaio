# Prompt Agen Lanjutan - Seragam Bahasa

Gunakan prompt ini untuk agen AI berikutnya agar bisa melanjutkan pekerjaan normalisasi bahasa tanpa mengulang analisis dari nol.

```text
Kamu bekerja di repo Gemiprint (`C:\Temp\repos\gemiprintaio`). Tujuan besarnya adalah menyeragamkan bahasa aplikasi dengan standar Indonesia-first.

Sebelum menyentuh kode, wajib baca:
- `.cursorrules` (perhatikan rule 22 dan 23)
- `docs/agent-playbook.md`
- `docs/panduan-bahasa.md`
- `docs/progres-seragam-bahasa.md`

Status terakhir (per 2026-05-27):
- Fase 0: selesai. Pondasi aturan + audit.
- Fase 1: selesai. UI Bahasa Indonesia.
- Fase 2: selesai. Komentar/JSDoc Bahasa Indonesia.
- Fase 3: selesai. Identifier kode dalam file (`selectedPelanggan`, `fakturUmum`, dll). Service layer punya alias deprecated.
- Fase 4: **fase berikutnya**. Lanjutkan dari sini.
- Audit terakhir: 1268 kandidat. Verifikasi: type-check, build, jest 199/199 lulus.

Yang harus dikerjakan di Fase 4:

1. **Rename folder route Next.js** (`src/app/`).
   - Folder yang masih English: `customers`, `materials`, `purchases`, `purchase-orders`, `purchase-returns`, `sales-returns`, `production`, `vendors`, `users`, `inventory`, `dashboard`, `finance`, `auth`, `reports`, `settings`, `surat-jalan`, `pos`, `hutang`, `kelola-orang`, `kelola-pengurus`, `laporan-ppn`.
   - Yang sudah Indonesia: `aktivitas`, `penawaran`, `materials` (campur), `surat-jalan`, `hutang`, `kelola-orang`.
   - Strategi: buat folder baru, redirect lama -> baru via `next.config.ts`, update internal Link, hapus folder lama setelah semua link migrasi.
2. **Rename API endpoint** (`src/app/api/`).
   - Tambah endpoint Indonesia (`/api/pelanggan`) yang re-export ke handler lama.
   - Endpoint lama tetap berfungsi untuk Flutter/Tauri yang belum migrasi.
   - Setelah semua consumer pindah, hapus endpoint lama.
3. **Update consumer**:
   - Web: `Link href="/customers"` -> `/pelanggan` di seluruh komponen, terutama `menuConfig.tsx`.
   - Flutter: scan `flutter/lib/` untuk URL hardcoded, update ke endpoint baru.
   - Tauri: cek `src-tauri/src/sync.rs` kalau ada hardcoded path.
4. **Rename file service** kalau aman (mis. `customers-service.ts` -> `pelanggan-service.ts`).
   - Atau biarkan untuk Fase 6 (cleanup) — pilih yang lebih kecil risikonya.

Aturan praktis Fase 4:
- Pakai pendekatan "alias dulu, hapus belakangan". Jangan langsung break kontrak.
- Tiap rename folder route: tambah `redirects()` di `next.config.ts` supaya URL lama otomatis 301 ke URL baru.
- Tiap rename API: bikin file baru yang import dan re-export handler dari yang lama, BUKAN sebaliknya. Lalu update consumer ke endpoint baru, lalu hapus endpoint lama.
- Jangan rename kolom DB (Fase 5).
- Jangan rename script di package.json (Fase 6).

Setelah setiap batch:
- `npm run type-check`
- `npm run build` (penting untuk validasi route Next.js)
- `npx jest`
- `flutter analyze` kalau Flutter disentuh

Update `docs/progres-seragam-bahasa.md` setelah selesai batch besar.

Iron rules wajib (lihat .cursorrules):
- Rule 22: ejaan baku Indonesia.
- Rule 23: ikuti batasan fase. Fase 4 cakupannya route + API, bukan database.

Tantangan khusus Fase 4:
- Halaman dengan ID dinamis seperti `customers/[id]/page.tsx` perlu di-rename keduanya: folder dan dynamic segment.
- Halaman yang merujuk satu sama lain (mis. `pos/page.tsx` link ke `/customers`) perlu update bersamaan supaya tidak ada link 404.
- Beberapa internal link mungkin pakai `pathname` based hint yang merefer dari folder name — cek `usePathname()` consumer.
```

