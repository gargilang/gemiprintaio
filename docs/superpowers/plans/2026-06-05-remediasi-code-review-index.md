# Remediasi Code Review gemiprint — Index Master

> **Untuk agentic workers:** Setiap fase di bawah adalah plan terpisah yang bisa di-ship sendiri. WAJIB gunakan skill superpowers:subagent-driven-development atau superpowers:executing-plans untuk eksekusi task demi task. Semua step pakai sintaks checkbox (`- [ ]`).

**Sumber:** `docs/superpowers/specs/2026-06-04-codebase-review.md` (review 4 reviewer paralel, 2026-06-04).

**Tujuan:** Menutup semua temuan Critical/Important dari code review dan menaikkan codebase ke level produksi.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres, SQLite (better-sqlite3), Tailwind CSS 4, SWR, Jest.

---

## Cara membaca plan ini

Review menghasilkan ~60 temuan di 4 area (Keamanan/API, Database/Service, React UI, Testing/Deps/Ops). Karena temuan menyentuh subsistem independen, plan dipecah jadi 5 fase. Setiap fase = satu file plan, bisa dikerjakan dan di-merge sendiri tanpa menunggu fase lain.

Urutan eksekusi mengikuti prioritas review (Ringkasan Eksekutif, urut dari paling berdampak):

| Fase | File plan | Isi | Temuan ditutup |
| ---- | --------- | --- | -------------- |
| 1 | `2026-06-05-fase1-keamanan.md` | Tutup lubang otorisasi, vault, backdoor, Zod, hardening | S-C1..S-C5, S-I1..S-I9, minor security |
| 2 | `2026-06-05-fase2-integritas-data.md` | Aktifkan RPC atomik, fix payload_hash, item ordering, normalizeRecord, N+1, error PG → Bahasa Indonesia | D-C1..D-C4, D-I1..D-I8, minor DB |
| 3 | `2026-06-05-fase3-cicd-ops.md` | CI workflow, husky, guard script destruktif, Tauri SQL allowlist, deps cleanup, observability | O-C1..O-C4, O-I1..O-I9, minor ops |
| 4 | `2026-06-05-fase4-testing.md` | Test API route (supertest), jsdom project, test komponen | O-C4, O-I1 (detail), coverage |
| 5 | `2026-06-05-fase5-refactor-ui.md` | Context per domain, pecah monolit, error/loading.tsx, ARIA, focus trap, virtualization | U-C2..U-C5, U-I1..U-I8, minor UI |

**Catatan:** S-C1/U-C1 (backdoor Ctrl+Shift+L) ditutup di Fase 1 karena diklasifikasikan sebagai isu keamanan. U-C5 (error.tsx/loading.tsx) ada di Fase 5.

---

## Rekomendasi urutan kerja

1. **Fase 1 dulu, selalu.** Lubang privilege-escalation (S-C3, S-C4) bisa dieksploitasi user biasa hari ini. Kerjakan dan merge sebelum yang lain.
2. **Fase 2 dan Fase 3 paralel.** Beda orang/sesi: Fase 2 menyentuh service layer + migrasi SQL; Fase 3 menyentuh CI/scripts/config. Konflik minimal.
3. **Fase 4 setelah Fase 1-3.** Test API butuh route yang sudah pakai guard (Fase 1) dan service yang sudah stabil (Fase 2). Test jadi safety-net sebelum Fase 5.
4. **Fase 5 terakhir.** Refactor UI monolit paling berisiko regresi; lebih aman setelah ada test (Fase 4) sebagai jaring pengaman.

```
Fase 1 ──► Fase 4 ──► Fase 5
   │
   ├─► Fase 2 ─┘
   └─► Fase 3 ─┘
```

---

## Verifikasi global (jalankan di akhir tiap fase)

Sesuai `.cursorrules` iron rule #10:

```bash
npm run type-check   # 0 errors
npm run lint         # tidak boleh menambah warning baru
npm run build        # sukses
npm test             # semua test pass
```

UI-only change boleh skip `npm test`, tetap wajib type-check + build.

---

## Definisi selesai keseluruhan

Semua tercapai ketika:

- Tidak ada lagi temuan Critical/Important yang terbuka di `docs/superpowers/specs/2026-06-04-codebase-review.md`.
- CI hijau di pull_request (lint + type-check + test + build).
- Coverage API route minimal untuk 3 hot path (auth/login, pos/sales POST, sync/auto).
- 0 file komponen di atas ~800 baris untuk file yang masuk daftar U-I1, atau punya sub-plan tersendiri yang sudah dieksekusi.

*Dibuat: 2026-06-05*
