# Fase 6 C5 — Audit Cross-Platform (Verifikasi Statik)

> Tanggal: 2026-06-06 · Branch: `fase6-tierc` · Pelaksana: agen Fase 6

## Ringkasan

Fase 6 adalah refactor **murni behavior-preserving** di lapisan UI React
(Next.js). Audit ini memverifikasi bahwa pemecahan komponen di Tier B & C
**tidak merusak** platform desktop (Tauri) dan mobile (Flutter).

**Keputusan ruang lingkup (disepakati dengan owner):** untuk Fase 6 cukup
**verifikasi statik** — bukan uji fungsional klik-UI. Alasannya ada di bawah.

## Kenapa risiko lintas-platform ~nol untuk Fase 6

- **Flutter (mobile + mobile-web)** hanya berkomunikasi lewat **Next.js API**
  (`app.gemiprint.com`). Fase 6 **tidak menyentuh satu pun** file di
  `src/app/api/**`, service, schema Zod, atau auth guard — hanya memindah
  komponen React presentational. Maka payload/contract yang dikonsumsi Flutter
  tidak berubah. **Tidak terdampak.**
- **Tauri desktop** menjalankan bundel Next.js standalone yang sama dengan web.
  Refactor React ikut terbawa, tetapi karena verifikasi web (type-check +
  build + 242 test) hijau, perilaku embedded-web di desktop identik. Kode Rust
  (`src-tauri/`) tidak disentuh Fase 6.

## Hasil verifikasi statik

| Cek | Perintah | Hasil |
| --- | --- | --- |
| Rust (Tauri) | `cargo check --manifest-path src-tauri/Cargo.toml` | ✅ Finished, 0 error |
| Dart (Flutter) | `flutter analyze` | ✅ No issues found |
| Web type-check | `npm run type-check` | ✅ 0 error |
| Web build | `npm run build` | ✅ sukses |
| Web tests | `npx jest` | ✅ 242/242 |
| Lint | `npm run lint` | ✅ 0 error (31 warning pre-existing, money-path, lihat C3) |

Toolchain: cargo 1.95.0 · Flutter 3.41.7 · Dart 3.11.5 · Node 22.

## Catatan & rekomendasi terpisah (BUKAN bagian Fase 6)

1. **Audit kualitas kode Rust & Dart belum pernah dilakukan setara TypeScript.**
   Hardening Fase 1-5 fokus ke web/TS. Rust (`main.rs`, `sync.rs`) dan Dart
   (Flutter app) belum di-review untuk kualitas/keamanan/maintainability yang
   setara. **Rekomendasi: jadikan Fase 7 tersendiri** (review terstruktur Rust
   + Dart) — bukan diselipkan ke Fase 6.

2. **Uji fungsional end-to-end di Tauri & Flutter** (login + transaksi nyata)
   tetap berguna sebagai bagian smoke-test rilis berkala, tetapi tidak wajib
   untuk menutup Fase 6 karena alasan ruang-lingkup di atas.

## Kesimpulan

Fase 6 aman terhadap lintas-platform berdasarkan verifikasi statik. Tidak ada
perubahan kode yang diperlukan untuk Tauri/Flutter. Temuan kualitas Rust/Dart
dialihkan ke usulan Fase 7.
