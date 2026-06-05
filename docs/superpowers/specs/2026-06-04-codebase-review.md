# Code Review Menyeluruh — gemiprint

> Tanggal: 2026-06-04. Review dilakukan oleh agen Cursor melalui empat reviewer paralel (security/API, database/service, React UI, testing/deps/ops). Audit lapangan dilakukan di luar reviewer untuk memverifikasi temuan kunci.

## Ringkasan Eksekutif

Codebase ini punya pondasi yang solid: type-check 0 error, lint 0 error (42 warning), 199/199 test pass, arsitektur multi-platform yang ambisius (web/Vercel + Tauri/SQLite + Flutter) dengan satu adapter terpadu. Tapi belum di level produksi profesional. Ada bug keamanan kritis (route mutation tanpa role guard, kredensial vault dengan salt fixed, backdoor logout shortcut), bug data-integrity nyata (transaksi non-atomik di mode Supabase-only, payload_hash bukan hash, item ordering bug di POS yang menugaskan finishing ke item salah), dan utang teknis besar (94 API route tanpa coverage, 4 komponen monolit di-skip, tidak ada CI/CD).

Prioritas pengerjaan, urut dari paling berdampak:

1. Tutup lubang otorisasi (pengguna, sync/offline-queue, cashbook/*).
2. Aktifkan kembali RPC Postgres untuk composite mutation atau bangun rollback kompensasi yang reliable.
3. Tambahkan CI workflow (lint+type+test+build).
4. Refactor monolit dengan Context-first (urut: barang → pengguna → keuangan → pos).
5. Adopsi Zod + lapisan error PG → Bahasa Indonesia.

## Hasil Verifikasi Otomatis

| Metrik | Hasil |
| ------ | ----- |
| TypeScript (tsc --noEmit) | 0 error |
| ESLint | 0 error, 42 warning (React 19 hook rules) |
| Jest test suite | 199/199 pass dalam 30 detik |
| File source di src/ | 283 file (.ts/.tsx) |
| API routes | 94 file route.ts |
| Test files | 17 (semua di src/lib, 0 di src/app, 0 di src/components, 0 di src/hooks) |
| Penggunaan any/as any di service layer | sekitar 251 occurrence di 22 file |
| File komponen di atas 1000 baris | 9 |

ESLint warning didominasi oleh: react-hooks/exhaustive-deps (12+), react-hooks/set-state-in-effect (10+), react-hooks/immutability (5+), react-hooks/use-memo (3+), jsx-a11y/role-has-required-aria-props (1).

---

# 1. Security dan API Routes

## Critical

### S-C1. Backdoor logout shortcut tanpa gate environment
File: src/components/MainShell.tsx:198-207
Masalah: Shortcut Ctrl+Shift+L memanggil logoutSession() dan redirect ke login di semua build, tidak hanya development. Komentar bilang "Bantuan development" tapi tidak ada cek process.env.NODE_ENV.
Dampak: User non-teknis bisa tidak sengaja keluar di tengah transaksi POS dengan kombinasi tombol umum. Worse, attacker yang tahu shortcut bisa men-trigger lewat XSS untuk memaksa re-login (re-auth phishing).
Fix: Bungkus dalam if (process.env.NODE_ENV !== "production") return; di awal useEffect, atau hapus.

### S-C2. Vault kredensial pakai salt fixed dan secret fallback
File: src/lib/crypto.ts:5-12
Masalah: PASSWORD_ENC_SECRET fallback ke string "dev-secret-please-change" dan scrypt salt hard-coded "gemiprint_salt". Kalau env tidak di-set di Vercel, semua isi tabel kredensial bisa di-decrypt oleh siapa saja yang punya source code.
Dampak: Disclosure penuh password vault (lokasi: kredensial table — wifi, email vendor, dll yang user simpan di settings).
Fix: Throw di startup kalau PASSWORD_ENC_SECRET kosong di production. Pakai per-record random salt yang disimpan bersama ciphertext, bukan satu salt fixed.

### S-C3. Endpoint mutation pengguna tanpa role guard
File: src/app/api/pengguna/[id]/route.ts:7,40
Masalah: Handler PUT dan DELETE hanya cek session valid, tidak cek role admin/manager. Setiap user yang login (termasuk role default "user" dari self-register) bisa PATCH user lain jadi role admin atau menghapus akun.
Dampak: Privilege escalation lengkap dari satu akun biasa.
Fix: Tambah await requireAdminOrManager() di awal kedua handler. Cegah self-demote admin terakhir.

### S-C4. sync/offline-queue terima mutasi arbitrer ke tabel sensitif
File: src/app/api/sync/offline-queue/route.ts:23-104
Masalah: Endpoint authenticated POST menerima {table, operation, recordId, data} dan eksekusi terhadap whitelist SYNC_TABLES yang termasuk profil, kredensial, keuangan. Tidak ada per-row ownership check.
Dampak: User biasa bisa kirim {table:"profil", operation:"update", recordId:"<id-sendiri>", data:{role:"admin"}} dan promosi diri jadi admin.
Fix: Buang profil/kredensial/keuangan dari whitelist offline queue, atau scope berdasarkan recordId == session.uid + role admin saja.

### S-C5. cashbook/delete-all dan cashbook-formula tanpa guard
File: src/app/api/cashbook/delete-all/route.ts:7, src/app/api/cashbook-formula/route.ts:28
Masalah: Tidak ada cek role. Endpoint cashbook/delete-all menghapus semua row buku kas aktif. cashbook-formula menulis formula yang menjadi sumber kebenaran semua perhitungan keuangan.
Dampak: User mana pun bisa wipe data keuangan atau mengubah formula bagi hasil/bonus.
Fix: requireAdminOrManager() di kedua route. Tambah audit log entry sebelum mutasi.

## Important

### S-I1. User enumeration di login
File: src/lib/services/auth-service.ts:48,67
Masalah: Pesan error berbeda untuk "Username tidak ditemukan" vs "Password salah". Walau ada rate limit 5/menit, attacker bisa membedakan username yang ada vs tidak.
Fix: Satu pesan generik: "Kredensial salah".

### S-I2. JWT TTL 7 hari tanpa revocation
File: src/lib/session.ts:57
Masalah: Token hidup 7 hari. Demote role, deactivate user, ganti password tidak invalidasi token live sampai expiry.
Fix: TTL pendek (15 menit) + refresh token, atau session_version di profil yang dicek di middleware.

### S-I3. Banyak mutation route tanpa role guard (selain S-C3 sampai S-C5)
Masalah: cashbook/import, cashbook/archive*, cashbook/override/[id], cashbook/reorder, cashbook-partner, business-actors, actor-roles, pelanggan PUT/DELETE, vendors PUT/DELETE, master/quick-specs, master/{categories,subcategories,units,quick-specs}/reorder, finishing-options/manage PATCH, sync/manual, sync/auto, sync, evaluate.
Fix: requireAdminOrManager seragam di awal handler POST/PUT/PATCH/DELETE. Bungkus di helper withRoleGuard untuk konsistensi.

### S-I4. Zod tidak dipakai sama sekali untuk validasi input
Masalah: Tidak ada import Zod di src/app/api atau src/lib walau dependensi-nya terpasang. Validasi ad-hoc dan koersi Number(body.x) menghasilkan NaN yang lolos ke service.
Dampak: Field financial bisa tertulis NaN, negative, atau string ke DB. Bug yang sulit di-debug.
Fix: Schema Zod per route mulai dari hot path: pos/sales POST, pembelian POST, inventori/adjustments, pos/pay-receivable, pembelian/pay-debt.

### S-I5. Service-role file tanpa server-only
File: src/lib/supabase.ts
Masalah: Mengekspor anon client dan getSupabaseAdmin (pakai SUPABASE_SERVICE_ROLE_KEY) dari satu file tanpa import "server-only". Key fisik tidak akan bocor karena bukan NEXT_PUBLIC_ tapi nama function dan referensi env-var ikut ke client bundle kalau salah import.
Fix: Pisah jadi supabase-client.ts (anon) dan supabase-admin.ts (admin + import "server-only").

### S-I6. CSP terlalu longgar
File: next.config.ts:30
Masalah: script-src memakai unsafe-inline dan unsafe-eval. Kedua-duanya hampir membatalkan CSP. Tidak ada HSTS.
Fix: Pakai nonce untuk inline script (App Router mendukung), buang unsafe-eval kecuali ada chart lib yang butuh. Tambah Strict-Transport-Security max-age=31536000; includeSubDomains; preload.

### S-I7. Audit log coverage dangkal
File: src/lib/audit.ts dan caller-nya
Masalah: Hanya 2 caller: pos/sales/[id] dan cashbook/delete-all. Mutasi sensitif tidak dilog: pengguna/[id], passwords/*, cashbook-formula, business-actors, pembelian/[id] DELETE, produksi status changes.
Fix: Tambah logAudit di setiap requireAdminOrManager mutation. Bungkus di helper withAudit(action, resourceType).

### S-I8. Cashbook import multipart bisa di-CSRF
File: src/app/api/cashbook/import/route.ts:6
Masalah: Kombinasi multipart/form-data (CORS simple, tanpa preflight) plus tidak ada role guard plus tidak ada cek Origin = endpoint ini bisa dipicu lewat form HTML dari situs lain kalau korban admin login.
Fix: requireAdminOrManager + cek header Origin == host sendiri + Content-Length limit.

### S-I9. Endpoint /api/evaluate tanpa rate limit
Masalah: Endpoint ini menerima formula AST sembarang dan mengevaluasinya. Tanpa rate limit, attacker bisa kirim formula CPU-bound untuk DoS.
Fix: Tambah rateLimitByIp 30/menit. Pertimbangkan budget execution time per request.

## Minor

- Identifier interpolation di db-unified.ts (table dan key) tidak ada whitelist runtime — aman selama caller pakai literal, regresi mudah membuka SQLi.
- Cookie session bisa pakai prefix __Host- untuk hardening tambahan.
- Login SHA-256 legacy path pakai string === bukan timingSafeEqual.
- SESSION_SECRET tidak divalidasi minimum 32 byte saat startup — Tauri auto-generate sudah aman, manual .env.local rentan.
- Self-register rate limit hanya per IP — abuser bisa ngisi tabel pending. Tambah email/CAPTCHA gate.

## Praise

- requireAdminOrManager helper bersih dengan AuthGuardError yang propagate status code.
- Kebanyakan mutation surface besar (pembelian, barang, master/categories, keuangan/cash-book) sudah pakai guard.
- Bcrypt cost 12 di password hash, lazy SHA-256 migration di login.
- Server actions dilindungi otomatis oleh Next.js (origin/host check).
- Upstash sliding-window rate limit di login dan register.
- CORS Flutter pakai allowlist via FLUTTER_WEB_ORIGINS env, localhost hanya non-production.

---

# 2. Database dan Service Layer

## Critical

### D-C1. Dead branch RPC dengan if (false && sb)
File: src/lib/services/purchases-mutations.ts:117, :915
Masalah: Blok 120 baris yang membangun payload RPC create_purchase_with_inventory dan void_purchase_with_inventory tidak akan pernah jalan karena (false && sb) selalu false. Caller jatuh ke db.transaction() yang non-atomik di Supabase-only mode.
Dampak: Reviewer/auditor pajak mengira flow atomik via Postgres SP padahal tidak. Ada dua jalur revaluasi AVCO (applyPurchaseCostToMaterial dan postInventoryMovement) yang bisa drift.
Fix: Hapus blok dead, atau aktifkan kembali via flag env USE_PG_PURCHASE_RPC=1 supaya intent eksplisit.

### D-C2. db.transaction() bukan transaksi di mode Supabase-only
File: src/lib/db-unified.ts:1692-1736
Masalah: Komentar di kode mengakui ini, tapi semua composite mutation (createSale, createPurchase, createReturn, createQuotation, convertRollVariant) dipanggil seakan atomik. Di Vercel atau next dev (skipServerSqliteMirror() === true), implementasinya hanya await operations(). Kalau insert item ke-3 gagal, header penjualan + 2 item + entri keuangan + lock NSFP sudah ter-commit dan harus di-revert manual.
Khusus createSale (pos-mutations.ts:332-768): NSFP slot di-mark TERPAKAI sebelum insert items. Insert item gagal = slot hangus tanpa rollback.
Dampak: Korupsi data multi-user di production. Audit pajak melihat nomor faktur/NSFP "hilang" tanpa pasangan.
Fix: Pindah composite mutation ke Postgres function (SECURITY DEFINER, single transaction). Migrasi sudah punya pola RPC create_purchase_with_inventory dan void_*, tinggal aktifkan dan migrasi caller. Minimum: tambah compensating cleanup di catch block.

### D-C3. payload_hash bukan hash, hanya panjang JSON
File: src/lib/db-unified.ts:1199
Masalah: payload_hash: JSON.stringify(data).length.toString(). Bukan hash — dua payload berbeda dengan length sama dianggap match.
Dampak: Field replay-detection menyesatkan. Praktis tidak rusak karena registerMutationIfNeeded cek client_mutation_id, tapi kolom audit jadi tidak berguna untuk diff.
Fix: import { createHash } from "crypto"; payload_hash: createHash("sha256").update(JSON.stringify(data)).digest("hex").

### D-C4. SYNC_V2_TABLES tidak lengkap
File: src/lib/db-sqlite.ts:34-78
Masalah: Tabel business_actors dan actor_roles tidak ada di list. Kemungkinan ada tabel lain juga (verifikasi terhadap supabase/migrations).
Dampak: Tauri offline tidak akan pull tabel ini dari cloud. UI yang baca business_actors jadi kosong di desktop.
Fix: Tambahkan ke SYNC_V2_TABLES dengan urutan FK benar (actor_roles sebelum business_actors). Tambah CI check yang bandingkan supabase migrations dan SYNC_V2_TABLES.

## Important

### D-I1. Item ordering bug di createSale
File: src/lib/services/pos-mutations.ts:683-691
Masalah: Setelah loop insert item_penjualan, kode re-query dengan offset: i, orderBy: dibuat_pada untuk dapat ID item. dibuat_pada SQLite resolusi detik atau Postgres microsecond — insert berturut bisa berbagi timestamp sehingga item ke-i bisa bukan item yang baru di-insert ke-i.
Dampak: Finishing/SPK dipasang ke item yang salah. Misal jenis_finishing UV malah masuk ke item kanvas. Bug yang sangat sulit di-trace.
Fix: Simpan array insertedItemIds saat loop pertama, lalu pakai insertedItemIds[i] di loop produksi. Hilangkan re-query.

### D-I2. normalizeRecord boolean detection false-positive untuk field status
File: src/lib/db-unified.ts:48-54
Masalah: Heuristik nama field includes("status") menyebabkan field enum string seperti status_pembayaran (LUNAS, AKTIF, SEBAGIAN), status_transaksi, void_status_kode, roll_inventory_status di-treat sebagai boolean kalau pernah punya nilai numeric 0/1.
Dampak: Write balik ke Supabase sebagai true/false melanggar enum CHECK constraint, atau ke SQLite sebagai 1 menghilangkan nilai semantic.
Fix: Ganti heuristik dengan whitelist eksplisit nama field boolean per tabel. Atau cek shape value AND match nama exact (is_active, lacak_inventori_status, default_status, kena_ppn).

### D-I3. N+1 query di hot path POS dan production
File: src/lib/services/pos-queries.ts:604-655 (salesWithItems), src/lib/services/production-service.ts:123-209 (orders × items × finishing × profil)
Masalah: Loop sale lalu query item, loop item lalu query barang. 100 sales × 5 items > 600 query.
Dampak: Vercel function timeout > 5 detik di dataset 200 sales. Membebani PostgREST quota.
Fix: Pakai pola batch yang sudah ada di materials-service.ts:67-127. Atau pakai PostgREST embedded select: .select("*, item_penjualan(*), piutang_penjualan(*)").

### D-I4. INSERT OR IGNORE menyembunyikan konflik PK
File: src/lib/db-unified.ts:897 (insertServerSQLite), :1939 (syncFromCloud upsert fallback)
Masalah: Kalau ID konflik karena bug (race generateId, bad import data), OR IGNORE silent. Lookup-by-participant_code (line 913-918) hanya jaga finance_participants.
Dampak: Insert "berhasil" tapi data tidak masuk; caller pegang id lama dengan data baru yang tidak tertulis.
Fix: Ganti pattern dengan ON CONFLICT(id) DO UPDATE SET . . . =excluded . . . (sudah dipakai di syncFromCloud). Untuk path normal, deteksi info.changes === 0 dan throw Error("row already exists").

### D-I5. Race condition di nomor faktur dan nomor pembelian
File: src/lib/services/purchases-queries.ts:259-278, src/lib/services/pos-mutations.ts:136-169
Masalah: generateInvoiceNumber baca MAX(nomor_faktur) lalu insert tanpa lock. Dua POST bersamaan dari 2 kasir = nomor faktur sama = unique constraint reject 1 transaksi (yang sudah halfway: NSFP locked, finance entries inserted, lihat D-C2).
Fix: Pakai Postgres sequence per shop, atau RPC next_invoice_number(shop_id) dengan SELECT . . . FOR UPDATE. Atau retry-loop di service jika error code 23505.

### D-I6. Error PostgREST bocor mentah ke UI
File: src/lib/services/pos-mutations.ts:886, src/lib/services/purchases-mutations.ts:233, db-unified.ts:1031, :1089
Masalah: throw new Error(error.message) menampilkan pesan PostgREST EN seperti "duplicate key value violates unique constraint penjualan_nomor_faktur_key" ke notifikasi UI.
Dampak: Tidak ramah user, juga membocorkan nama constraint internal (info disclosure ringan).
Fix: Layer translasi tipis. friendlyPgError(e, table) yang map 23505 ke "Nomor sudah dipakai", 23503 ke "Data terkait sudah dihapus", 23514 ke "Data tidak memenuhi aturan validasi".

### D-I7. Banyak select(*) di read path UI
File: src/lib/services/surat-jalan-service.ts:142,157, pos-queries.ts:469,488,489,501, cashbook-formula-service.ts:129,171,296,305, finance-service.ts:439, reports-service.ts:315
Masalah: Tiap row bawa kolom sync metadata (sync_status, last_synced_at, sync_version, updated_at_server, updated_by_device, change_version, is_deleted, deleted_at, client_mutation_id) sekitar 150 byte/row × N. UI tidak butuh.
Fix: Ganti dengan list kolom eksplisit untuk read path. Sync engine boleh tetap pakai *.

### D-I8. recalculateCashbookIfAvailable() dipanggil 6x di pos-mutations
File: src/lib/services/pos-mutations.ts:849, 893, 1036, 1194, 1332, 1457
Masalah: Recalc penuh buku kas O(n²) terhadap row count, dipanggil multiple times per request.
Fix: Debounce / coalesce per request. Setelah createSale, void, delete cukup 1× di akhir handler API (di route layer), bukan di tiap service call.

## Minor

- Listener window.online di db-unified.ts:2372-2380 tidak pernah removeEventListener — bocor di HMR. Catatan: file ini server-only (line 13), branch ini kemungkinan unreachable. Lebih baik dihapus atau pindah ke component.
- Health check Supabase pakai .from("profil").select("id").limit(1) tiap 5 detik. RLS ketat bisa false-negative. Pakai supabase.rpc("now") atau endpoint health khusus.
- getServerSupabaseTableColumns dan cache duplicate antara db-unified.ts:212-243 dan db-supabase.ts:186-217. Cache hit tidak shared.
- substr(2, 9) deprecated di 14 tempat. Ganti slice(2, 11) atau crypto.randomUUID().
- AVCO reset ke 0 saat stok habis (inventory-service.ts:286-294) — sesuai standar tapi perlu test untuk skenario "habis lalu restock harga lebih murah".
- migrateInventoryMovementsCheckConstraint exit early kalau ada PRODUCTION_ISSUE — kalau ditambah movement_type baru, migrasi akan skip yang seharusnya rebuild. Pakai migration registry proper.

## Praise

- Pemisahan db-sqlite-*.ts dan db-supabase.ts dari god-file db-unified.ts rapi, anti-circular jelas.
- Schema-cache fallback dengan retry-drop-column (db-unified.ts:1063-1097) elegan untuk PostgREST schema drift.
- shouldSkipServerHealthCheck() untuk Vercel cold start hemat 100-300ms latency.
- Migrasi rebuild-table idempoten (migrateInventoryMovementsCheckConstraint, migrateActorRolesLegacyCheckConstraint, migrateCashbookFormulaDbColumnNullable) — pola benar untuk SQLite CHECK constraint.
- Period guard di postInventoryMovement (inventory-service.ts:234) — defense in depth, tidak hanya andalkan RPC.
- AVCO shouldRevalueAverage memisahkan movement yang tidak boleh re-value (SALE_ISSUE, WASTE, PRODUCTION_ISSUE) — sesuai standar costing.
- FK self-heal di syncFromCloud untuk barang.kategori_id/subkategori_id (db-unified.ts:2014-2040) — pragmatik untuk dataset legacy.
- 199/199 test pass + 0 type error walaupun ada 251 any di service layer = any dipakai pragmatik di edge, domain types ketat.

---

# 3. React UI dan Komponen

## Critical

### U-C1. Backdoor Ctrl+Shift+L di production
File: src/components/MainShell.tsx:198-207
(Lihat S-C1 — sudah dikategorikan sebagai security issue.)

### U-C2. Duplikat use client di PengaturanSetupTab.tsx
File: src/app/pengaturan/PengaturanSetupTab.tsx:1,3
Masalah: Dua directive use client berturut-turut di baris 1 dan 3. Pengulangan tidak menyebabkan error tapi jelas hasil refactor task 10 yang tidak beres.
Fix: Hapus salah satu, plus periksa apakah ada import duplikat di file ini setelah pemecahan task 10.

### U-C3. Semua tab Pengaturan mounted simultan via hidden
File: src/app/pengaturan/page.tsx:63-71
Masalah: Komentar di kode bilang strategi sengaja (tidak re-fetch saat pindah tab). Konsekuensinya: 5 komponen tab (CompanyTab, SetupTab, SystemTab, PpnTab, PeriodCloseTab) plus useEffect dan SWR hook di dalamnya semua aktif sejak halaman load. SetupTab sendiri 2175+ baris.
Dampak: First load berat (5 set fetch paralel saat masuk halaman), memory tinggi, useEffect cleanup yang tidak konsisten bisa leak listener.
Fix: Lazy-mount via React.lazy atau dynamic import, atau pakai Suspense di tiap tab. Cache hasil di SWR (sudah punya useCachedData) sehingga re-mount murah.

### U-C4. PilihanCari role="option" di luar listbox dan tidak menerapkan ARIA combobox pattern
File: src/components/PilihanCari.tsx:174-196
Masalah: Setiap option div pakai role="option" plus tabIndex=0 tanpa parent role="listbox". Input tidak punya role="combobox", aria-expanded, aria-controls, aria-activedescendant. Lint warning role-has-required-aria-props benar.
Dampak: Screen reader tidak announces sebagai dropdown. Keyboard user kena tab order weirdness karena tabIndex=0 di tiap option.
Fix: Bungkus dropdown dalam div role="listbox" id="pilihancari-list". Input set role="combobox" aria-expanded={isOpen} aria-controls="pilihancari-list" aria-activedescendant={highlightedIndex>=0?id:undefined}. Hapus tabIndex dari tiap option, fokus tetap di input.

### U-C5. Tidak ada error.tsx, loading.tsx, atau not-found.tsx di mana pun
Masalah: Verifikasi: 0 file error.tsx, 0 file loading.tsx, 0 file not-found.tsx di seluruh src/. Next.js App Router butuh ini untuk error boundary dan loading state per route. Saat server action gagal, user lihat error mentah Next.js default.
Dampak: UX buruk saat error, dan tidak ada cara konsisten untuk loading state per route.
Fix: Tambahkan src/app/error.tsx (root), plus per area kritis: src/app/pos/error.tsx, src/app/keuangan/error.tsx, src/app/pembelian/error.tsx. Tambah loading.tsx untuk halaman dengan data fetch berat.

## Important

### U-I1. Komponen monolit yang masih tertinggal
Masalah: 9 file komponen di atas 1000 baris, 4 di antaranya di-skip oleh task 11-14, 18 di plan sebelumnya:
- src/app/pos/page.tsx (2083 baris) — state keranjang + barang + customer + 5 modal
- src/app/keuangan/page.tsx (2049) — buku kas + filter + archive + modal
- src/app/barang/page.tsx (1603) — tabel + 3 modal inline
- src/components/FormulirPembelian.tsx (1522) — form + items + PPN + split roll
- src/app/pengguna/page.tsx (1387) — tabel + form modal
- src/components/finance/PengaturanKeuanganModal.tsx (1266) — tab modal multi-form
- src/app/produksi/spk/page.tsx (1239) — SPK list + detail panel
- src/components/ModalTambahBarang.tsx (1186) — form barang + roll variants
- src/components/finance/ExpressionAssistant.tsx (1176) — AST editor + preview
Dampak: Sangat sulit maintenance, re-render berlebih (semua state hoisted ke top), reviewer agent kesulitan membaca dengan akurat.
Fix: Pendekatan yang sudah tertulis di plan sebelumnya benar — Context per domain dulu, ekstrak modal dulu, lalu section. Urutan yang disarankan: barang → pengguna → PengaturanKeuanganModal → keuangan → pos.

### U-I2. Prop drilling potensial di Pengaturan tab refactor
Masalah: Plan task 10 menyatakan pengaturan/page.tsx dipecah jadi 4 tab. Verifikasi: page.tsx sekarang 75 baris, jadi pemecahannya berhasil. Tapi SetupTab.tsx masih 2175+ baris setelah refactor. Berarti pemecahan-nya cuma top-level, isi tab masih monolitik.
Fix: Lanjutkan pemecahan di dalam SetupTab — modal kategori, modal subkategori, modal satuan dipecah jadi komponen sendiri.

### U-I3. Focus trap dan keyboard handling modal tidak konsisten
Masalah: Modal seperti ModalTambahBarang, ModalBayarHutang, DialogKonfirmasi, ModalReturPembelian umumnya tidak punya focus trap (tab bisa keluar ke konten di belakang) dan tidak konsisten handle Escape untuk close.
Dampak: Aksesibilitas buruk, juga UX desktop yang user mengharapkan Esc langsung tutup.
Fix: Pakai library kecil seperti focus-trap-react atau implementasi kustom di ModalFormShell. Pastikan onKeyDown handler Esc ada di tiap modal.

### U-I4. Stale closure dan missing deps di hooks
Masalah: 12+ warning react-hooks/exhaustive-deps. Sample: ModalTambahBarang.tsx baris 90 dan 454 (loadMasterData, onCreateMaterial, onUpdateMaterial, showNotification missing); ModalBayarHutang.tsx baris 92 (handleSubmit, onClose missing); ModalEditManual.tsx baris 90.
Dampak: Effect bisa pakai value lama saat callback berubah → state inconsistency yang sulit di-trace.
Fix: Audit setiap warning. Untuk callback prop yang sering berubah, wrap di parent dengan useCallback. Untuk function yang hanya dipakai di satu effect, define inside effect.

### U-I5. setState dalam useEffect body — anti-pattern React 19
Masalah: 10+ warning react-hooks/set-state-in-effect. Sample: ModalEditHarga.tsx:55, PilihanCari.tsx:116, PpnFakturModal.tsx:74,99.
Dampak: Cascading render yang tidak perlu, performance drop. React 19 secara eksplisit mendiskriminasi pattern ini.
Fix: Pakai derived state dengan useMemo (kalau bergantung pada props), atau key prop untuk reset state secara natural saat input identitas berubah, atau onClick callback langsung.

### U-I6. Tabel panjang tanpa virtualization
File: src/components/TabelRiwayatPenjualan.tsx, TabelPembelian.tsx, SuratJalanTable.tsx
Masalah: Render 100-1000 row di DOM langsung. Filter dan sort di client-side.
Dampak: Halaman lambat untuk dataset besar, scroll janky.
Fix: Pakai @tanstack/react-virtual atau react-window. Pertimbangkan server-side pagination + filter untuk 500+ row.

### U-I7. "use client" dipakai di hampir semua halaman besar
Masalah: Halaman besar seperti pos/page.tsx, keuangan/page.tsx, barang/page.tsx semua "use client". Dengan App Router seharusnya bisa server component untuk shell + client component untuk interaksi.
Dampak: Semua kode JS dikirim ke browser walau sebagian besar bisa dirender di server. Cold load lambat.
Fix: Refactor jadi server component yang me-render layout + data initial, plus client island untuk interaksi (form, modal, action button).

### U-I8. Dark mode konsisten via class duplicate
File: MainShell.tsx baris 40, 53, 219 dan banyak lagi
Masalah: Setiap class punya pasangan dark: yang panjang dan diulang di banyak komponen.
Dampak: Maintenance sulit, mudah desync.
Fix: Extract ke component class via @apply di Tailwind (CSS module), atau pakai cva (class-variance-authority).

## Minor

- key={index} di beberapa map — ganti key unik (id record).
- useMemo dan useCallback dipakai berlebihan untuk computation yang murah.
- Loading state ad-hoc per halaman (state isLoading di tiap component) — bisa pakai loading.tsx.
- Empty state ad-hoc — pertimbangkan komponen bersama EmptyState.
- Tailwind class panjang sering dipotong inline string concatenation — pakai clsx atau cva.
- preventDefault tidak konsisten di form submit handler.
- Beberapa modal pakai isOpen prop, beberapa pakai show — naming inconsistency.

## Praise

- Pemisahan menuConfig.tsx dengan canAccessPath untuk role-based menu rapi.
- ModalFormShell sebagai shared modal scaffold mengurangi duplikasi.
- StatusSinkronisasi dan PratinjauFakturMengambang sebagai global components yang dipanggil via custom event — pattern dekoupling yang bagus.
- useTauriWindowClose hook bersih.
- SWR via useCachedData abstraksi yang konsisten.
- Komentar Bahasa Indonesia di seluruh komponen membantu domain expert (pemilik produk) baca kode.

---

# 4. Testing, Dependency, dan Ops

## Critical

### O-C1. Tidak ada CI/CD pipeline
Masalah: Tidak ada folder .github/workflows, tidak ada .husky, tidak ada lint-staged. npm run build, test, type-check, lint tidak pernah di-enforce sebelum merge.
Dampak: Test 199 hanya melindungi developer yang ingat run lokal. Bug type error dan build broken bisa landing ke main, lalu auto-deploy ke Vercel atau Tauri build.
Fix: Tambah .github/workflows/ci.yml yang run npm ci + lint + type-check + test + build di pull_request. Plus husky pre-commit hook untuk eslint --fix dan tsc --noEmit di file yang di-stage.

### O-C2. Tauri DB commands menerima raw SQL dari webview
File: src-tauri/src/main.rs:543-737
Masalah: db_query, db_query_one, db_execute menerima sql: String dari frontend. db_insert, db_update, db_delete interpolasi table dan column name langsung ke format string. Frontend dan webview di proses sama, jadi semua RCE frontend (XSS, supply chain attack) langsung baca/write SQLite.
Dampak: Compromise penuh DB lokal kalau salah satu dari 600+ npm package compromised, atau XSS lewat user-generated content.
Fix: Allowlist table name, validate column name dengan regex ^[a-z_][a-z0-9_]*$. Atau pindah ke command per tabel (insert_barang, update_pelanggan) yang typed.

### O-C3. Script supabase:wipe tanpa guard
File: scripts/wipe-supabase-public.mjs, package.json:19
Masalah: Run DROP SCHEMA public CASCADE terhadap apa yang ada di DATABASE_URL. Tidak ada --confirm, --dry-run, atau cek host produksi.
Dampak: Satu .env.local salah → data produksi hilang. Wired ke npm run supabase:wipe = satu kesalahan ketik dari bencana.
Fix: Require --confirm flag. Print host dari connection string dan refuse kalau match project ref produksi (kecuali --allow-prod). Tambah readline prompt y/N. Tambah --dry-run yang hanya print SQL.

### O-C4. 94 API route tanpa coverage tes
Masalah: 17 test file, semua di src/lib. 0 test untuk src/app/api/**/route.ts, 0 untuk src/components, 0 untuk src/hooks. Critical happy path tidak ditest: POS sale → inventory_movements → cashbook (paling kompleks di codebase), pembelian → hutang → pelunasan, sync engine.
Dampak: Refactor risky karena tidak ada safety net untuk regresi di API layer.
Fix: Tambah supertest atau next-test-api-route-handler. Mulai dari 3 endpoint dengan blast radius terbesar: auth/login, pos/sales POST, sync/auto.

## Important

### O-I1. Coverage React tree dan jsdom test environment hilang
File: jest.config.js:7
Masalah: testEnvironment: "node" global, tidak ada per-file override atau project terpisah. testMatch include *.test.tsx tapi 0 file. Komponen complex (POS form, cashbook editor) di-ship tanpa test.
Fix: Tambah projects ke jest.config.js: project node untuk src/lib/, project jsdom untuk src/app dan src/components. Install @testing-library/react dan jest-dom.

### O-I2. @prisma/client dan prisma adalah dead dependency
File: package.json:62, 111
Masalah: 0 source import dari @prisma/client. Tidak ada prisma/schema.prisma. Prisma 7.8 menambah ~80MB ke node_modules dan postinstall codegen step.
Dampak: Install lebih lambat, build Vercel/Tauri lebih besar, kesan keliru bahwa ORM dipakai.
Fix: npm uninstall @prisma/client prisma.

### O-I3. bcryptjs cost 12 untuk production
File: src/lib/password-hash.ts
Masalah: bcryptjs adalah port pure-JS, ~6× lebih lambat dari native bcrypt. Cost 12 di JS = ~700ms per hash. Kombinasi dengan endpoint login tanpa rate limit per-username (hanya per-IP) = DoS-friendly.
Fix: Tetap bcryptjs (Edge runtime tidak punya argon2) tapi pertimbangkan node:crypto scrypt untuk Node runtime. Pastikan rate limit 5/menit di /api/auth/login sudah benar wired.

### O-I4. Script ops destruktif lain juga tanpa guard
File: scripts/seed-stress-test-data.mjs, remove-stress-test-data.mjs, apply-supabase-schema.mjs, apply-migration.mjs
Masalah: Hanya migrate-finance-to-v2.mjs yang punya --dry-run. Lain-lain tidak refuse kalau host produksi.
Fix: Extract scripts/_lib/guard.mjs yang parse connection string, detect prod host, require --confirm + visible "About to write to <host>. Proceed? [y/N]".

### O-I5. Tidak ada smoke test untuk Tauri standalone bundle
File: scripts/prepare-standalone-for-tauri.mjs
Masalah: Bundle Next.js standalone yang dikemas Tauri tidak diverifikasi boot benar. Rust polling port 30 detik lalu give up = user lihat infinite loading.
Fix: Spawn node server.js di random port, hit GET /api/auth/me, expect 200/401, exit.

### O-I6. Version drift antara package.json, tauri.conf.json, Cargo.toml
Masalah: 3 sumber version (package.json:3, src-tauri/tauri.conf.json:4, src-tauri/Cargo.toml:3) saat ini sama 0.1.0 tapi tidak ada enforcement. release:desktop dan updater feed (updates/latest.json) bergantung ini.
Fix: scripts/check-versions.mjs yang fail kalau diverge, panggil dari prepublish atau CI.

### O-I7. Tidak ada observability
Masalah: ~50+ console.error tanpa structured logging. Tidak ada Sentry, pino, OpenTelemetry. Tauri side hanya server.log di disk.
Dampak: Incident produksi di-debug lewat screenshot user. Tidak ada alerting, error grouping, atau perf metric.
Fix: @sentry/nextjs (free tier cukup untuk SaaS kecil), wrap route.ts dengan withSentry. Tambah src/lib/log.ts wrapper pino agar console.error jadi greppable.

### O-I8. SESSION_SECRET tidak validate minimum length
File: src/lib/session.ts
Masalah: getEncodedSecret cek "is set" tapi bukan length. Tauri auto-generate aman, tapi manual .env.local SESSION_SECRET=dev silently diterima dengan jose HMAC-SHA256 dengan 3-byte key.
Fix: Throw kalau raw.length < 32 di getEncodedSecret().

### O-I9. zod 3.22 outdated
File: package.json:91
Masalah: 3.23+ punya .readonly(), .brand() improvements, perf wins.
Fix: Bump ^3.25 di chore PR berikutnya.

## Minor

- xlsx 0.18.5 dari SheetJS community edition — tidak ada semver guarantee, history prototype-pollution. Pertimbangkan exceljs untuk path baru.
- jest tidak set coverageThreshold — coverage run tapi tidak fail.
- helpers/mock-db.ts hanya support equality where, tapi kode mulai pakai IN/LIKE. Throw on unsupported operator.
- @types/bcryptjs 2.4.6 mismatch dengan bcryptjs 3.x. Drop @types/bcryptjs (sudah ship types).
- overrides di package.json tanpa komentar — tambah "//" field atau DEPS.md.
- Test naming inconsistent — ada Bahasa Indonesia, ada English. Pilih satu.

## Praise

- Test depth AST engine genuinely strong: dsl, evaluator, validate, explainer, function-library, returns-cashbook, maklon-cashbook. Coverage edge case bagus.
- mock-db.ts hand-rolled pilihan tepat, fast dan deterministic.
- migrate-finance-to-v2.mjs exemplary: --dry-run, --verbose, --supabase, idempotent INSERT OR IGNORE, verify step. Pola ini perlu di-clone ke script ops lain.
- Tauri ensure_session_secret() auto-generate dan persist 256-bit secret di first run = nice UX.
- Tauri release shutdown taskkill /F /T di Windows untuk kill Node child tree — handle bug orphan process.

---

# 5. Penilaian Akhir Kualitas

## Apakah codebase ini sudah berkualitas profesional?

Jawaban jujur: belum, tapi sudah sangat dekat. Ini bukan kode amatir, tapi juga belum di level production-grade SaaS yang dipakai banyak perusahaan tanpa pengawasan. Berikut breakdown-nya:

### Yang sudah profesional

- Arsitektur multi-platform terpadu via satu adapter db-unified.ts. Pendekatan ambisius tapi well-thought.
- Domain modeling AST untuk formula keuangan dengan test coverage yang serius.
- TypeScript strict, type-check 0 error walau 251+ any di service layer (dipakai di edge, tidak menyebar ke domain types).
- Migrasi SQLite idempoten dengan rebuild-table pattern yang benar.
- AVCO costing dan inventory movements dengan invariant terdokumentasi di schema.
- Sebagian besar mutation surface besar sudah punya role guard.
- README dan docs/SETUP.md cukup untuk onboarding.
- Bahasa Indonesia konsisten di kode dan komentar.

### Yang masih amatir / hutang teknis

- 4 critical security issue yang mudah di-fix tapi sangat berdampak.
- Tidak ada CI/CD — deal-breaker untuk produksi.
- 0% coverage di API layer — refactor risky.
- 9 file komponen di atas 1000 baris, sebagian malah di atas 2000.
- Composite mutation tidak atomik di mode Supabase-only — bug data integrity nyata.
- Audit log dangkal — kalau audit pajak datang, banyak event tidak ter-record.
- Tidak ada observability (Sentry, structured logging).
- Tauri command terlalu permisif untuk SQL.

## Apakah agen sebelumnya benar di-skip?

Kesimpulan: keputusan agen sebelumnya untuk skip task 11-14 dan 18 dapat dibenarkan dari sudut pandang teknis. Ekstraksi naif komponen monolit tightly-coupled menghasilkan prop-drilling yang lebih buruk dari kondisi awal. Tapi yang menjengkelkan: di-skip tanpa eskalasi yang menyajikan plan mitigasi konkret.

Apa yang seharusnya dilakukan agen tersebut: alih-alih mengubah status jadi "di-skip", tulis sub-plan untuk masing-masing — Context shape, urutan ekstraksi modal, daftar state yang harus dipindah ke Context, lalu kembalikan ke user untuk approval. Plan-nya sekarang mencatat pendekatan benar di Appendix B (React Context per domain dulu, modal dulu, urutan barang → pengguna → keuangan → pos), yang berarti memang sebenarnya cukup dipikirkan. Tinggal eksekusi.

