# Modul Penggajian (Payroll) Penuh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Jalankan satu subagent saja pada satu waktu (aturan proyek).

**Goal:** Membangun modul Penggajian profesional yang memisahkan dengan benar tiga konsep akuntansi yang selama ini tercampur di gemiprint: **Beban Gaji** (biaya), **Kasbon/Pinjaman Karyawan** (piutang, bukan biaya), dan **Bagi Hasil** (distribusi laba ke pemilik). Mendukung komposisi kompensasi fleksibel per karyawan (Gaji Pokok + Komisi + Bonus + Tunjangan), proses Payroll Run berkala dengan slip gaji, dan pelunasan gaji yang bisa memotong kasbon.

**Architecture:** Next.js App Router + tiga storage backend lewat `db-unified` (Supabase Postgres untuk web, SQLite untuk desktop, API untuk Flutter). Modul payroll dibangun di atas infrastruktur yang sudah ada: tabel `business_actors` (orang), `cashbook_formula` + AST evaluator (mesin hitung buku kas), dan tabel `keuangan` (buku kas / sumber kebenaran arus kas). Payroll TIDAK menggantikan sistem itu — ia menambah lapisan: master komponen kompensasi per karyawan, run penggajian, slip, dan ledger pinjaman karyawan. Setiap mutasi uang tetap mengalir ke `keuangan` dengan token `[REF:<id>]` agar void/revert konsisten.

**Tech Stack:** TypeScript, Next.js 16, React 19, Supabase (Postgres), better-sqlite3, Zod (validasi), Jest (test node + jsdom). Verifikasi: `npm run type-check` → `npm run build` → `npx jest <test>`.

---

## Latar belakang & kondisi saat ini (BACA DULU)

gemiprint adalah aplikasi internal percetakan (~2-5 pengguna, owner bukan programmer, komunikasi Bahasa Indonesia). Owner ingin modul ini cukup profesional untuk kelak dijual ke percetakan lain berkaryawan >10 orang.

**Masalah yang dipecahkan:** Saat ini gemiprint tidak punya konsep "Gaji". Cara membayar karyawan (mis. seorang "Designer") adalah lewat **kasbon**: tiap tarikan dicatat sebagai transaksi `keuangan` kategori `BIAYA` (mengurangi laba), dan kolom `kasbon_<nama>` di buku kas mengakumulasi totalnya. Saat kasbon melebihi gaji, sisanya ditulis manual sebagai "Sisa Kasbon". Ini mencampur tiga hal yang dalam akuntansi profesional berbeda jenis akun (lihat bagian Prinsip Akuntansi).

**Sistem pengurus yang ada sekarang** (`business_actors`): tiap orang punya tiga "rumus" opsional yang dicentang di form (`src/components/finance/pengaturan-keuangan/TabPengurus.tsx`) — Bagi Hasil (% laba), Kasbon (akumulasi dari kategori transaksi), Bonus (% dari omzet/laba). Tiap rumus aktif disinkronkan jadi satu kolom formula di buku kas via `syncFormulasForActor` (`src/lib/services/formula-service.ts`). Form-nya memaparkan mekanisme rumus, bukan konsep bisnis — owner merasa ini "terlalu eksplisit" dan tidak ramah untuk pengguna non-teknis / pembeli profesional.

**Yang TIDAK boleh dirusak:** sistem `business_actors` + `cashbook_formula` + AST evaluator yang sudah jalan untuk Bagi Hasil & Kasbon gaya lama harus tetap berfungsi selama migrasi (jangan big-bang delete). Buku kas (`keuangan`) tetap sumber kebenaran arus kas. Maklon (80-90% omzet) baru saja diperbaiki dan jangan disentuh.

**Prasyarat lingkungan (sudah disiapkan):** `npm run dev` selalu jalan di localhost:3000; Supabase lokal container selalu jalan; admin login `gemi` / `admin`. Graphify knowledge graph tersedia di `graphify-out/graph.json` (4526 node) — pakai `graphify query "<pertanyaan>"` / `graphify path "A" "B"` / `graphify explain "Simbol"` untuk pertanyaan relasional/dampak lintas-file; pakai grep/Read untuk lookup presisi. Setelah mengubah kode, jalankan `graphify update .` (AST-only, tanpa biaya API) agar graf tetap terkini.
## Model konsep (data model target)

Tiga lapisan baru, semua additive (tidak menghapus tabel lama):

**1. Komponen Kompensasi** — definisi *berulang* per karyawan (apa yang membentuk gajinya). Tabel baru `komponen_kompensasi`:
- `id`, `actor_id` (FK `business_actors`), `tipe` (`GAJI_POKOK` | `TUNJANGAN` | `KOMISI` | `BONUS`), `nama` (mis. "Gaji Pokok", "Tunjangan Transport", "Komisi Penjualan"), `metode` (`TETAP` = nominal tetap per periode | `PERSEN` = % dari sumber), `nominal` (untuk TETAP), `persen` + `sumber_formula_key` (untuk PERSEN, mis. 5% dari `omzet`), `aktif_status`, sync columns.
- Contoh: marketing = `GAJI_POKOK` TETAP Rp X + `KOMISI` PERSEN 5% omzet. Designer = `GAJI_POKOK` TETAP + `BONUS` PERSEN dari output. Operator = `GAJI_POKOK` TETAP saja.

**2. Payroll Run + Slip** — proses penggajian berkala.
- `payroll_run`: `id`, `periode` (mis. "2026-06"), `tanggal_bayar`, `status` (`DRAFT` | `DIBAYAR` | `VOIDED`), `total_bruto`, `total_potongan_kasbon`, `total_neto`, `catatan`, `dibuat_oleh`, sync columns.
- `payroll_slip`: `id`, `payroll_run_id` (FK), `actor_id` (FK), `bruto` (jumlah semua komponen periode itu), `potongan_kasbon` (berapa kasbon yang dipotong di run ini), `neto` (`bruto - potongan_kasbon`), `metode_bayar` (`CASH` | `TRANSFER`), `keuangan_ref_id` (link ke baris `keuangan` yang dibuat), snapshot komponen (JSON, untuk audit). 1 slip per karyawan per run.

**3. Pinjaman Karyawan (Kasbon sebagai piutang)** — ledger pinjaman, BUKAN biaya.
- `pinjaman_karyawan`: `id`, `actor_id` (FK), `tanggal`, `jumlah`, `jenis` (`TARIK` = karyawan ambil kasbon, menaikkan saldo pinjaman | `POTONG_GAJI` = dipotong saat payroll, menurunkan saldo | `BAYAR_TUNAI` = karyawan kembalikan tunai), `keterangan`, `keuangan_ref_id`, `payroll_run_id` (nullable, diisi saat jenis POTONG_GAJI), sync columns.
- Saldo pinjaman seorang karyawan = Σ(TARIK) − Σ(POTONG_GAJI) − Σ(BAYAR_TUNAI). Inilah "Sisa Kasbon".

Catatan: nama-nama kolom & tabel **baru** harus Bahasa Indonesia (aturan proyek). Tabel lama tetap English.
## Prinsip akuntansi (WAJIB dipahami sebelum koding)

Tiga jenis akun yang selama ini tercampur, dan bagaimana payroll memperlakukannya:

1. **Beban Gaji (BIAYA / expense).** Saat karyawan bekerja satu periode, perusahaan menanggung beban gaji penuh = jumlah komponen kompensasi periode itu. Ini MENGURANGI laba. Di buku kas: saat payroll run dibayar, posting transaksi `keuangan` kategori `GAJI` (kredit = neto yang keluar kas) — tapi beban penuh (bruto) yang diakui sebagai biaya, bukan cuma yang cair.

2. **Kasbon = Pinjaman Karyawan (PIUTANG / asset), BUKAN biaya.** Saat karyawan tarik kasbon, kas keluar tapi diganti tagihan ke karyawan → tidak mengurangi laba. Di buku kas: transaksi `keuangan` kategori baru `PINJAMAN_KARYAWAN` (kredit saat tarik, debit saat dikembalikan) — netral terhadap laba. Ini koreksi utama dari sistem lama yang menaruhnya di `BIAYA`.

3. **Bagi Hasil (distribusi laba / equity).** Pembagian laba ke pemilik, bukan biaya operasional. Sudah ditangani sistem `business_actors` lama (profit_share) — TETAP dipakai, tidak diubah jadi gaji.

**Mekanik "bayar gaji lewat kasbon"** (kebutuhan eksplisit owner): saat payroll run, untuk tiap karyawan hitung `bruto` (Σ komponen). Jika karyawan punya saldo pinjaman, owner bisa memilih memotong sebagian/seluruhnya: `potongan_kasbon = min(saldo_pinjaman, bruto)` (atau nominal pilihan owner). `neto = bruto − potongan_kasbon`. Potongan menghasilkan baris `pinjaman_karyawan` jenis `POTONG_GAJI` (menurunkan saldo) dan TIDAK menambah kas keluar (karena kasnya sudah keluar saat ditarik dulu). Hanya `neto` yang benar-benar keluar kas saat gajian.

**Idempotensi & integritas:** ID ledger deterministik (`gaji-<runId>-<actorId>`, `pinjaman-<sumber>`). Setiap mutasi kas ke `keuangan` membawa token `[REF:<id>]` di `keperluan` agar void membersihkannya. Payroll run yang sudah `DIBAYAR` hanya boleh dibatalkan lewat aksi VOID yang membalik semua: hapus baris `keuangan` ber-`[REF]`, balikkan baris `pinjaman_karyawan` POTONG_GAJI, set run & slip `VOIDED`. Hormati period-closed guard (`accounting-periods-service.isDateInClosedPeriod`) pada `tanggal_bayar`.
## Peta file (referensi cepat — pelajari sebelum mulai)

**Konteks orang/pengurus & formula (WAJIB baca):**
- `src/lib/services/business-actor-service.ts` — CRUD actor_roles + business_actors. Interface `BusinessActor`, `ActorRole`, `RoleGroup`.
- `src/components/finance/pengaturan-keuangan/TabPengurus.tsx` — form pengurus saat ini (centang Bagi Hasil/Kasbon/Bonus). Ini yang akan dirombak presentasinya.
- `src/lib/services/formula-service.ts` — `syncFormulasForActor` (baris 205), builder AST (`astProfitShareMinusKasbon`, `astCashAdvanceLedger`, `astPercentageOfFormula`), `getActorFinanceSummary`.
- `src/lib/profit-share-config.ts` — slot bagi hasil & kasbon (PROFIT_SHARE_SLOTS).

**Mesin buku kas (jangan diubah perilakunya, hanya tambah kategori):**
- `src/lib/ast/cashbook-recalc.ts` — engine recalc baris-per-baris. Interface `CashbookRecalcInputRow`.
- `src/lib/services/finance-service.ts` — `recalculateCashbookIfAvailable`, `createFinanceEntry`, AVCO. Coalesced via `createCoalescedRunner`.
- `src/lib/ast/` — evaluator, function-library, dsl-parser. Hanya baca bila perlu paham AST.

**Data layer & integrasi wajib:**
- `src/lib/db-unified.ts` — `db.query/queryOne/insert/update/delete/transaction`. SATU-SATUNYA jalur DB.
- `src/lib/sync-config.ts` — daftar SYNC_TABLES; daftarkan tiap tabel baru.
- `src/lib/auth-guard-server.ts` — `requireSession`, `requireAdminOrManager`, `AuthGuardError`.
- `src/lib/schemas/` — pola Zod (pos.ts, pembelian.ts, inventori.ts). Buat `payroll.ts`.
- `src/lib/pg-error.ts` — `friendlyPgError`. `src/lib/services/accounting-periods-service.ts` — `isDateInClosedPeriod`.

**Schema (3 tempat sinkron — iron rule):**
- `supabase/migrations/<timestamp>_<nama>.sql` (additive, IF NOT EXISTS) — baru.
- `database/sqlite-schema.sql` — template fresh-install.
- `src/lib/db-unified.ts` runtime `ALTER TABLE ADD COLUMN` — agar SQLite lama ikut migrasi.
- Juga: `database/gemiprint.db` adalah template desktop (jangan hapus); `src-tauri/src/main.rs` punya CREATE TABLE untuk desktop.

**UI shell & pola (ikuti persis):**
- `src/app/keuangan/page.tsx` — halaman induk Keuangan; modul payroll kemungkinan tab/section baru di sini atau halaman `/penggajian` baru.
- `src/components/ModalFormShell.tsx`, `src/components/DialogKonfirmasi.tsx` — scaffold modal.
- `src/components/icons/PageIcons.tsx`, `ContentIcons.tsx` — ikon SVG (JANGAN emoji).
- `src/lib/use-cached-data.ts` — SWR `useCachedData` (WAJIB untuk fetch, bukan useAsyncData).
- `src/components/menuConfig.tsx` — menu + breadcrumb bila tambah route.

**Test:**
- `src/lib/__tests__/` — test service (jest node). `*.test.tsx` — komponen (jsdom). Lihat `return-finance.test.ts`, `db-unified.test.ts` sebagai contoh pola.
## Iron rules yang berlaku (dari .cursor/rules — JANGAN dilanggar)

1. **Data fetching → `useCachedData` (SWR), bukan `useAsyncData`.** Cache key stabil per dataset (mis. `"payroll-runs"`, `` `pinjaman:${actorId}` ``). Bust via `useInvalidate`.
2. **Schema change → 3 tempat sinkron:** migrasi Supabase additive + `database/sqlite-schema.sql` + runtime ALTER di `db-unified.ts`. Migrasi yang sudah di cloud immutable.
3. **Mutasi uang → tabel `keuangan` dengan token `[REF:<id>]` di `keperluan`.** Void/revert mencari token ini.
4. **Mutasi server action → bungkus auth guard** (`requireAdminOrManager` untuk payroll — sensitif). Pass `session.uid` sebagai `dibuat_oleh`. Read boleh ungated. Jangan percaya `x-session-uid` dari klien.
5. **Validasi input hot-path dengan Zod** (`z.coerce.number().finite()` untuk uang, `.passthrough()`, `safeParse` → 422).
6. **Surface DB error via `friendlyPgError(e, table)`**, jangan lempar PostgREST mentah ke UI.
7. **Period-closed guard** pada apa pun yang menerima tanggal (`tanggal_bayar`).
8. **Sync columns wajib pada tiap tabel baru:** `sync_status, last_synced_at, sync_version, updated_at_server, updated_by_device, change_version, is_deleted, deleted_at, client_mutation_id`. Daftarkan di `sync-config.ts`.
9. **`onSuccess` item baru pass `null`** → parent full `reload()`.
10. **Verifikasi sebelum "selesai":** `npm run type-check` (0 error) → `npm run build` → `npx jest <test terkait>`. Perbaiki lint baru.
11. **Ikon SVG saja, JANGAN emoji** di UI. Reuse dari `src/components/icons/`.
12. **Bentuk halaman/UI:** root `<div className="space-y-6">`, kartu judul gradient, dark mode wajib (`dark:` pair di tiap warna), modal pakai `ModalFormShell` (ESC + backdrop + focus trap). Tema warna domain: payroll cocok indigo/emerald.
13. **Bahasa Indonesia** untuk semua artefak: UI, route folder, nama tabel/kolom baru, komentar/JSDoc. Glossary: Keuangan, Karyawan, Gaji, Pinjaman, Komisi, Tunjangan.
14. **Komentar/JSDoc Bahasa Indonesia baku** (Pratinjau bukan Preview, Unduh bukan Download, dst).
15. **Hindari N+1** di read path; fetch tabel terkait sekali, join di memori (`.in("fk", ids)`).
16. **File besar/special-char:** tulis stub kecil dulu lalu `StrReplace` bertahap; untuk blok besar pakai Node `fs` splice. Hindari regex backslash di argumen tool.
### Task 1: Schema — tabel payroll (3 tempat sinkron)

**Files:**
- Create: `supabase/migrations/<timestamp>_modul_penggajian.sql` (pakai timestamp > migrasi terakhir `20260605000000`)
- Modify: `database/sqlite-schema.sql` (tambah 4 tabel CREATE TABLE IF NOT EXISTS)
- Modify: `src/lib/db-unified.ts` (runtime ALTER/CREATE untuk SQLite lama — ikuti pola yang sudah ada di file ini untuk tabel baru)
- Modify: `src-tauri/src/main.rs` (tambah CREATE TABLE IF NOT EXISTS untuk desktop, ikuti pola tabel lain ~L321+)

- [ ] **Step 1: Pelajari pola tabel tersinkron yang sudah ada**

Run: `graphify query "How are new tables defined across supabase migration, sqlite schema, and db-unified runtime?"` lalu Read satu contoh tabel bersync (mis. `surat_jalan` di ketiga tempat). Konfirmasi 9 sync columns + pola RLS `anon_full_access`.

- [ ] **Step 2: Tulis migrasi Supabase** `komponen_kompensasi`, `pinjaman_karyawan`, `payroll_run`, `payroll_slip`

Buat file migrasi dengan 4 tabel sesuai bagian Model Konsep. Tiap tabel: PK `id TEXT`, FK ke `business_actors(id)` / antar tabel payroll, kolom domain, lalu 9 sync columns (`sync_status TEXT DEFAULT 'pending'`, `last_synced_at TIMESTAMPTZ`, `sync_version INTEGER DEFAULT 1`, `updated_at_server TIMESTAMPTZ`, `updated_by_device TEXT`, `change_version INTEGER DEFAULT 0`, `is_deleted INTEGER DEFAULT 0`, `deleted_at TIMESTAMPTZ`, `client_mutation_id TEXT`), `dibuat_pada`/`diperbarui_pada`. Enable RLS + `anon_full_access` policy (mirror migrasi `business_actors_v2`). CHECK constraints untuk enum (`tipe`, `metode`, `status`, `jenis`). Index pada FK + `actor_id` + `status`.

- [ ] **Step 3: Terapkan & verifikasi migrasi**

Run: `npm run supabase:local:reset`
Expected: selesai tanpa error, 4 tabel terbuat. Verifikasi: `node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);db.from('payroll_run').select('id').limit(1).then(r=>console.log('payroll_run OK',r.error??''))"`

- [ ] **Step 4: Tambah ke `database/sqlite-schema.sql` + runtime ALTER di `db-unified.ts` + `src-tauri/src/main.rs`**

Replikasi 4 tabel (tipe SQLite: TEXT/REAL/INTEGER, TIMESTAMPTZ→TEXT). Di `db-unified.ts` ikuti pola CREATE TABLE IF NOT EXISTS runtime yang sudah ada untuk tabel baru agar install SQLite lama ikut bermigrasi.

- [ ] **Step 5: Daftarkan di `src/lib/sync-config.ts`**

Tambah keempat nama tabel ke `SYNC_TABLES` (urutan: master dulu `komponen_kompensasi`, lalu `payroll_run`, `payroll_slip`, `pinjaman_karyawan`).

- [ ] **Step 6: Verifikasi**

Run: `npm run type-check`
Expected: 0 error.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations database/sqlite-schema.sql src/lib/db-unified.ts src-tauri/src/main.rs src/lib/sync-config.ts
git commit -m "feat(penggajian): schema tabel payroll (komponen, run, slip, pinjaman)"
```

### Task 2: Kategori keuangan baru (GAJI + PINJAMAN_KARYAWAN)

**Files:**
- Modify: `supabase/seed-default-values.sql` (tambah 2 kategori, pola `ON CONFLICT (category_code) DO NOTHING`)
- Modify: `database/sqlite-default-values.sql` jika ada padanan (cek dulu)

- [ ] **Step 1: Tambah kategori `GAJI` (kredit) dan `PINJAMAN_KARYAWAN` (both)**

Ikuti blok `finance_category_definitions` yang ada (lihat `fin-cat-maklon` sebagai contoh). `GAJI`: direction `kredit`, warna mis. teal. `PINJAMAN_KARYAWAN`: direction `both` (tarik=kredit, kembali=debit), warna mis. cyan. `display_order` setelah yang ada.

- [ ] **Step 2: Terapkan & verifikasi**

Run: `npm run supabase:local:reset`
Expected: 2 kategori muncul. Verifikasi via `/api/keuangan/categories` mengembalikan keduanya.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed-default-values.sql database/sqlite-default-values.sql
git commit -m "feat(penggajian): kategori keuangan GAJI dan PINJAMAN_KARYAWAN"
```

### Task 3: Service — pinjaman karyawan (kasbon sebagai piutang)

**Files:**
- Create: `src/lib/services/pinjaman-karyawan-service.ts`
- Test: `src/lib/__tests__/pinjaman-karyawan-service.test.ts`

- [ ] **Step 1: Tulis test dulu (TDD)** — saldo pinjaman = Σ TARIK − Σ POTONG_GAJI − Σ BAYAR_TUNAI

Test `hitungSaldoPinjaman(actorId)` dengan data: TARIK 500k, TARIK 300k, POTONG_GAJI 400k → saldo 400k. Mock `db` layer mengikuti pola `src/lib/__tests__/return-finance.test.ts`.

- [ ] **Step 2: Jalankan test (gagal)**

Run: `npx jest pinjaman-karyawan-service`
Expected: FAIL (fungsi belum ada).

- [ ] **Step 3: Implementasi service**

Fungsi: `catatTarikPinjaman({actorId, jumlah, tanggal, keterangan, dibuatOleh})` → insert `pinjaman_karyawan` jenis TARIK + posting `keuangan` kategori `PINJAMAN_KARYAWAN` (kredit) dengan `[REF:pinjaman-<id>]`; `hitungSaldoPinjaman(actorId)`; `listPinjaman(actorId?)`; `bayarPinjamanTunai(...)` (jenis BAYAR_TUNAI + keuangan debit); `revertPinjaman(id)` (hapus keuangan ber-REF + tandai is_deleted). Semua mutasi via `db.transaction`. Guard period-closed pada tanggal. Pakai `friendlyPgError`. Panggil `recalculateCashbookIfAvailable()` di akhir.

- [ ] **Step 4: Test hijau**

Run: `npx jest pinjaman-karyawan-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/pinjaman-karyawan-service.ts src/lib/__tests__/pinjaman-karyawan-service.test.ts
git commit -m "feat(penggajian): service pinjaman karyawan (kasbon sebagai piutang)"
```
### Task 4: Service — komponen kompensasi

**Files:**
- Create: `src/lib/services/komponen-kompensasi-service.ts`
- Test: `src/lib/__tests__/komponen-kompensasi-service.test.ts`

- [ ] **Step 1: Tulis test dulu** — `hitungBrutoPeriode(actorId, periodeContext)` menjumlahkan komponen

Test: actor punya GAJI_POKOK TETAP 3jt + KOMISI PERSEN 5% dari `omzet`. Dengan konteks omzet periode = 20jt → bruto = 3jt + 1jt = 4jt. Komponen TETAP langsung; PERSEN = `persen/100 × nilai sumber` (nilai sumber dipasok caller, mis. omzet periode dari ringkasan keuangan).

- [ ] **Step 2: Jalankan test (gagal)**

Run: `npx jest komponen-kompensasi-service`
Expected: FAIL.

- [ ] **Step 3: Implementasi service**

CRUD: `listKomponen(actorId)`, `createKomponen(input)`, `updateKomponen(id, patch)`, `deleteKomponen(id)` (soft via is_deleted), `hitungBrutoPeriode(actorId, sumberNilai: Record<string, number>)`. Validasi: TETAP wajib `nominal`, PERSEN wajib `persen` + `sumber_formula_key`. Via `db` + `friendlyPgError`.

- [ ] **Step 4: Test hijau**

Run: `npx jest komponen-kompensasi-service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/komponen-kompensasi-service.ts src/lib/__tests__/komponen-kompensasi-service.test.ts
git commit -m "feat(penggajian): service komponen kompensasi"
```

### Task 5: Service — payroll run + slip (inti)

**Files:**
- Create: `src/lib/services/payroll-service.ts`
- Test: `src/lib/__tests__/payroll-service.test.ts`

- [ ] **Step 1: Tulis test dulu** — `hitungDraftPayroll(periode)` dan `bayarPayrollRun(...)`

Test A (draft): 2 karyawan dengan komponen → slip bruto benar; karyawan dengan saldo pinjaman 1jt & bruto 4jt + opsi potong penuh → potongan 1jt, neto 3jt. Test B (bayar): posting `keuangan` kategori GAJI sebesar neto total ber-`[REF:gaji-<runId>]`, baris `pinjaman_karyawan` POTONG_GAJI terbuat, run status DIBAYAR. Test C (void): `voidPayrollRun` membalik semua (keuangan ber-REF terhapus, POTONG_GAJI dibalik, status VOIDED).

- [ ] **Step 2: Jalankan test (gagal)**

Run: `npx jest payroll-service`
Expected: FAIL.

- [ ] **Step 3: Implementasi service**

`hitungDraftPayroll(periode, opsiPotonganPerActor?)` → untuk tiap actor aktif yang punya komponen: bruto via `hitungBrutoPeriode` (sumber nilai omzet/laba diambil dari ringkasan keuangan periode itu), saldo pinjaman via `hitungSaldoPinjaman`, potongan = pilihan owner (default 0, atau min(saldo,bruto)), neto. Kembalikan struktur draft (belum tulis DB). `simpanDraftPayroll` → insert `payroll_run` DRAFT + `payroll_slip`. `bayarPayrollRun(runId, tanggalBayar, metodeBayar)` di `db.transaction`: guard period-closed; posting `keuangan` GAJI (kredit neto total) ber-REF; untuk tiap slip dengan potongan>0 insert `pinjaman_karyawan` POTONG_GAJI (link `payroll_run_id`); set run+slip DIBAYAR + `keuangan_ref_id`; idempoten ID `gaji-<runId>`. `voidPayrollRun(runId)`: balik semua. Panggil `recalculateCashbookIfAvailable()`.

- [ ] **Step 4: Test hijau**

Run: `npx jest payroll-service`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/payroll-service.ts src/lib/__tests__/payroll-service.test.ts
git commit -m "feat(penggajian): service payroll run, slip, dan void"
```

### Task 6: Zod schema + API routes

**Files:**
- Create: `src/lib/schemas/payroll.ts`
- Create: `src/app/api/penggajian/komponen/route.ts` (GET list, POST create/update/delete by action)
- Create: `src/app/api/penggajian/pinjaman/route.ts` (GET list+saldo, POST tarik/bayar/revert)
- Create: `src/app/api/penggajian/run/route.ts` (GET list, POST draft/bayar/void)

- [ ] **Step 1: Tulis Zod schema** untuk komponen, pinjaman, payroll run — pakai `z.coerce.number().finite()` untuk uang, enum cocok nilai nyata, `.passthrough()`.

- [ ] **Step 2: Tulis route komponen** — `requireAdminOrManager()`, `safeParse`→422, panggil service, handle `AuthGuardError` (return `.status`), `friendlyPgError`. Ikuti pola `src/app/api/pembelian/route.ts`.

- [ ] **Step 3: Tulis route pinjaman** — sama; GET ungated (read), POST guarded.

- [ ] **Step 4: Tulis route run** — sama; POST action `draft`/`bayar`/`void` guarded.

- [ ] **Step 5: Verifikasi via curl/login**

Login dapat token, lalu POST komponen + GET list. Expected: 200 + data konsisten. (Pakai pola Bearer+cookie seperti browser bila perlu.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/payroll.ts src/app/api/penggajian
git commit -m "feat(penggajian): Zod schema + API routes komponen, pinjaman, run"
```

### Task 7: Server actions (untuk dipakai UI)

**Files:**
- Create: `src/app/penggajian/actions.ts` (atau di bawah keuangan bila jadi tab)

- [ ] **Step 1: Tulis server actions** thin wrapper memanggil service (atau fetch API route), bungkus guard, untuk: list komponen per actor, simpan komponen, list pinjaman+saldo, catat tarik/bayar pinjaman, hitung draft payroll, simpan+bayar run, void run, list run+slip. Pass `session.uid` sebagai `dibuat_oleh`.

- [ ] **Step 2: type-check + commit**

Run: `npm run type-check` → 0 error.
```bash
git add src/app/penggajian/actions.ts
git commit -m "feat(penggajian): server actions payroll"
```
### Task 8: UI — halaman/tab Penggajian (daftar karyawan + komponen)

**Files:**
- Create: `src/app/penggajian/page.tsx` (atau tab di `src/app/keuangan/page.tsx` — putuskan saat eksekusi; rekomendasi: route `/penggajian` baru, daftarkan di `menuConfig.tsx` di bawah grup Administrasi, `allowedRoles: FULL_STAFF`)
- Create: `src/app/penggajian/error.tsx`, `src/app/penggajian/loading.tsx`
- Modify: `src/components/menuConfig.tsx` (tambah item menu + breadcrumb)

- [ ] **Step 1: Scaffold halaman** root `<div className="space-y-6">`, kartu judul gradient (indigo/emerald), `useCachedData` untuk daftar karyawan (dari `business_actors`) + komponen mereka. Dark mode pair di tiap warna. Ikon dari `PageIcons`.

- [ ] **Step 2: Daftar karyawan + ringkasan kompensasi** tabel: nama, jabatan, komponen aktif (chip Gaji Pokok/Komisi/Bonus), saldo pinjaman. Tombol "Atur Kompensasi" per baris.

- [ ] **Step 3: error.tsx + loading.tsx** (client component, pesan Bahasa Indonesia + "Coba Lagi").

- [ ] **Step 4: type-check + commit**

```bash
git add src/app/penggajian src/components/menuConfig.tsx
git commit -m "feat(penggajian): halaman daftar karyawan + kompensasi"
```

### Task 9: UI — modal atur komponen kompensasi (pengganti 'centang rumus')

**Files:**
- Create: `src/app/penggajian/ModalKomponenKompensasi.tsx`

- [ ] **Step 1: Modal berbasis konsep, bukan mekanisme.** Pakai `ModalFormShell`. Alih-alih "centang Bagi Hasil/Kasbon/Bonus", tampilkan daftar komponen kompensasi yang bisa ditambah: pilih tipe (Gaji Pokok / Tunjangan / Komisi / Bonus), lalu metode (Nominal tetap / Persentase dari sumber). Form adaptif: TETAP → input nominal; PERSEN → input persen + dropdown sumber (omzet/laba/dll). Props `{ actor, onClose, onSuccess, showNotification }`; modal punya state+submit sendiri; `onSuccess` → parent `reload()`.

- [ ] **Step 2: Pratinjau** ringkas "Estimasi gaji bulan ini" bila data omzet tersedia (opsional, boleh fase lanjut).

- [ ] **Step 3: type-check + commit**

```bash
git add src/app/penggajian/ModalKomponenKompensasi.tsx
git commit -m "feat(penggajian): modal atur komponen kompensasi"
```

### Task 10: UI — kasbon/pinjaman karyawan

**Files:**
- Create: `src/app/penggajian/ModalPinjamanKaryawan.tsx`

- [ ] **Step 1: Modal pinjaman** tampilkan saldo pinjaman berjalan + riwayat (TARIK/POTONG_GAJI/BAYAR_TUNAI). Aksi: catat tarik baru, catat bayar tunai. Konfirmasi via `DialogKonfirmasi`. Warna domain cyan. `useCachedData` key `` `pinjaman:${actorId}` ``, bust via `useInvalidate`.

- [ ] **Step 2: type-check + commit**

```bash
git add src/app/penggajian/ModalPinjamanKaryawan.tsx
git commit -m "feat(penggajian): modal pinjaman/kasbon karyawan"
```

### Task 11: UI — proses Payroll Run + slip gaji

**Files:**
- Create: `src/app/penggajian/ModalPayrollRun.tsx`
- Create: `src/lib/slip-gaji-print.ts` (cetak slip, ikuti pola `src/lib/faktur-print.ts`)

- [ ] **Step 1: Wizard payroll run** pilih periode → sistem hitung draft (tabel per karyawan: bruto, saldo pinjaman, input potongan kasbon, neto) → owner sesuaikan potongan → pilih tanggal bayar + metode → konfirmasi "Bayar". Tampilkan total bruto/potongan/neto. Guard period-closed ditampilkan ramah bila tanggal di periode tertutup.

- [ ] **Step 2: Daftar payroll run** (riwayat) dengan status DRAFT/DIBAYAR/VOIDED, aksi void (dengan konfirmasi), cetak slip per karyawan.

- [ ] **Step 3: Cetak slip gaji** `slip-gaji-print.ts` — HTML slip berisi rincian komponen, bruto, potongan kasbon, neto, periode. Ikuti pola faktur-print.

- [ ] **Step 4: type-check + commit**

```bash
git add src/app/penggajian/ModalPayrollRun.tsx src/lib/slip-gaji-print.ts
git commit -m "feat(penggajian): proses payroll run + slip gaji"
```

### Task 12: Verifikasi menyeluruh + jaga konsistensi buku kas

**Files:** (tidak ada file baru; verifikasi end-to-end)

- [ ] **Step 1: Skenario end-to-end via browser** (localhost:3000): buat karyawan + komponen → catat kasbon → jalankan payroll run dengan potong kasbon → cek buku kas: GAJI muncul sebesar neto (kredit), PINJAMAN_KARYAWAN konsisten, laba berkurang sebesar beban gaji (bukan kasbon), saldo kas benar. Void run → semua terbalik bersih.

- [ ] **Step 2: Verifikasi akuntansi** pastikan kasbon TIDAK lagi mengurangi laba (beda dari sistem lama); beban gaji yang mengurangi laba. Cek "Sisa Kasbon" = saldo pinjaman berjalan.

- [ ] **Step 3: Build + test penuh**

Run: `npm run type-check && npm run build && npx jest pinjaman-karyawan-service komponen-kompensasi-service payroll-service`
Expected: 0 error, build sukses, semua test hijau.

- [ ] **Step 4: Update graphify**

Run: `graphify update .`
Expected: graf terkini dengan modul payroll.

- [ ] **Step 5: Commit final bila ada sisa**

```bash
git add -A
git commit -m "test(penggajian): verifikasi end-to-end modul payroll"
```
## Pertanyaan terbuka & keputusan untuk dikonfirmasi ke owner saat eksekusi

Agen baru: tanyakan ini ke owner di titik yang relevan (jangan asal pilih untuk hal yang menyangkut uang/aturan bisnis):

1. **Periode penggajian:** bulanan (default, sesuai pola sheet "2026-06") atau ada mingguan/harian untuk pekerja borongan? Default: bulanan.
2. **Beban gaji vs kas:** apakah owner mau beban gaji penuh (bruto) diakui mengurangi laba saat run dibayar, ATAU cukup yang cair (neto)? Plan ini mengasumsikan **bruto sebagai beban** (akuntansi benar), tapi konfirmasi karena ini mengubah angka laba.
3. **Migrasi data lama:** karyawan/kasbon yang sudah ada di sistem `business_actors` lama — apakah dimigrasikan ke model baru, atau mulai bersih? Rekomendasi: sediakan tombol "konversi" opsional, jangan otomatis.
4. **Nasib sistem lama:** form "centang Bagi Hasil/Kasbon/Bonus" — setelah payroll jalan, apakah Bagi Hasil (pemilik) tetap di sistem lama (disarankan: ya, itu beda domain dari gaji karyawan) dan hanya Kasbon+Gaji yang pindah ke payroll? Plan ini mengasumsikan Bagi Hasil tetap di `business_actors`, payroll fokus ke karyawan.
5. **Pajak/BPJS/PPh21:** di luar lingkup plan ini (fase lanjut). Konfirmasi tidak dibutuhkan untuk v1.

## Catatan penutup untuk agen baru

- Plan ini besar; gunakan superpowers:subagent-driven-development atau executing-plans, satu subagent pada satu waktu.
- Mulai dari Task 1 berurutan — schema dulu adalah fondasi; UI tergantung service; service tergantung schema.
- Untuk pertanyaan "apa yang putus kalau aku ubah X" atau "telusuri alur dari A ke B", pakai graphify (`graphify query/path/explain`). Untuk lookup simbol/baris presisi, pakai grep/Read. Setelah edit kode, `graphify update .`.
- JANGAN sentuh maklon, inventori, atau alur POS yang sudah jalan. Payroll murni additive.
- Verifikasi tiap task (type-check + test) sebelum lanjut. Jangan klaim selesai tanpa bukti.
- Owner non-teknis & berbahasa Indonesia: semua artefak Bahasa Indonesia, jelaskan progres ringkas dalam Bahasa Indonesia.
