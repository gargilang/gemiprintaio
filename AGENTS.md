# gemiprint — Agent Rules

> Panduan kerja untuk semua AI coding agent (OpenCode, Codex, Kiro, Cursor, Claude, dll).
> File ini netral-tool: pakai tool apa pun yang kamu punya (edit file, terminal, search, browser)
> untuk mencapai tujuan di bawah. Ini adalah konversi generik dari `.cursor/rules/project-context.mdc`.

## Owner context

- Pemilik **bukan programmer**. Percayakan keputusan teknis ke agent; jelaskan perubahan secara singkat dalam Bahasa Indonesia sederhana.
- Aplikasi internal, ~2-5 user. Prioritas: cepat, stabil, sesuai kebutuhan bisnis, keamanan wajar (bukan enterprise hardening).
- Berkomunikasi dengan pemilik dalam **Bahasa Indonesia**.

## Workflow

- Perlakukan tiap permintaan sebagai **tujuan yang harus selesai end-to-end**, bukan sekadar pertanyaan. Implementasikan UI + logika + data, perbaiki error kompilasi yang kamu buat, lalu verifikasi.
- Jangan berhenti untuk check-in yang tidak perlu ("lanjut tidak?"). Lanjutkan kecuali benar-benar terhambat.
- Pilih default yang masuk akal untuk ambiguitas kecil; catat asumsi di ringkasan akhir.
- **Berhenti dan tanya hanya jika:** menghapus data produksi / wipe DB, mengubah domain/DNS/billing, aturan uang atau akses yang tidak bisa disimpulkan sendiri, atau perubahan yang sulit di-rollback.

## Skala usaha sesuai ukuran tugas

Beberapa agent punya skill/workflow tambahan (brainstorming, perencanaan, eksekusi terstruktur, TDD, systematic debugging, code review). Skill ini menaikkan kualitas tapi memakan token, jadi sesuaikan dengan ukuran tugas.

**Tugas besar / kompleks** (fitur baru lintas banyak file, perubahan arsitektur, permintaan ambigu atau multi-langkah, refactor berisiko): pakai pendekatan terstruktur meski tidak diminta.
- Intent/desain belum jelas → brainstorm dulu.
- Pekerjaan multi-langkah yang sudah pasti → buat rencana, lalu eksekusi.
- Bug / test gagal / perilaku tak terduga → systematic debugging sebelum mengusulkan fix.
- Fitur/bugfix baru → pakai test-driven development bila ada framework test yang cocok.
- Sebelum menggabungkan pekerjaan besar → minta/lakukan code review.

**Tugas kecil / jelas** (rename, ganti logo/aset, edit teks, ubah satu file, pertanyaan sederhana): kerjakan langsung. Jangan jalankan brainstorm/plan/review untuk tugas trivial — itu memboroskan token.

**Subagent (penjaga biaya penting):** jika memakai subagent, jalankan **satu per satu — jangan pernah menjalankan lebih dari satu subagent bersamaan**. Subagent paralel meledakkan pemakaian token dan sering gagal selesai. Selesaikan/verifikasi satu sebelum memulai berikutnya.

## Tools dan akses (gunakan tanpa bertanya)

- Browser (GitHub, Supabase, Vercel, GoDaddy — asumsikan sudah login bila tersedia).
- Terminal / CLI: Next.js, Flutter, `gh`, Supabase CLI, Vercel CLI, SQLite.
- Baca kode, jalankan perintah, cek deploy/log, test di browser.

## Mengedit file besar / berkarakter khusus

Tool edit/tulis kadang gagal saat konten besar DAN mengandung karakter rumit: backtick, `${...}` template literal, `$$` dollar-quoted SQL, escape backslash (`\s`, `\d`), atau blok JSX besar. Ini batas serialisasi, bukan masalah file. Workaround (urut preferensi):

- **Edit kecil dan fokus menang.** Lebih baik banyak edit kecil daripada satu blok besar. Untuk file besar baru, tulis stub kecil dulu, lalu kembangkan dengan edit-edit kecil bertahap.
- **Marker-splice via Node `fs`** untuk pemindahan/penggantian blok besar: tulis script `node` sekali pakai yang membaca file, mencari start/end via `indexOf`/regex pada baris anchor stabil, splice array, lalu tulis ulang.
- **Hindari regex backslash di argumen tool.** Jika butuh `\s`/`\d`, bangun via Node, atau tulis ulang ke character class tanpa escape (mis. split pada `[,+ ]+` bukan `[,+\s]+`) bila perilakunya setara.
- **File `.md` panjang:** jika gagal, buat file dengan header + penanda `<!-- MARKER -->`, lalu tambahkan section demi section. Jaga code fence berisi backtick tetap pendek per edit.
- **Jangan pernah** menempel secret atau blob SQL `$$ ... $$` ke chat untuk "akal-akalan" — perbaiki via script Node di disk.
- Setelah edit via script/`fs`, baca ulang region yang tersentuh dan jalankan `npm run type-check` (atau `node --check` untuk script) untuk memastikan tidak ada yang rusak. Hapus script sekali pakai setelah selesai.

## Git dan deploy

- Commit perubahan yang sudah terverifikasi. Push ke `main` → Vercel auto-deploy.
- **Hanya commit saat pemilik meminta** (atau jelas mengimplikasikan). Pesan commit yang jelas.
- Jangan pernah commit secret (`.env.local`, key, cert). Jangan `git push --force` ke `main`. Jangan amend commit yang sudah di-push kecuali diminta.
- Migrasi DB: setelah push perubahan schema, jalankan `npm run supabase:db:push` untuk apply ke cloud.

## Arsitektur (satu app, tiga storage backend)

- **Web** (`app.gemiprint.com`, Vercel): React + Next.js API routes → Supabase Postgres via service-role key. Service-role client ada di `src/lib/supabase-admin.ts` (ditandai `server-only`); anon client + `SYNC_TABLES` di `src/lib/supabase.ts`. Jangan pernah impor `getSupabaseAdmin` dari kode client.
- **Desktop** (Tauri + Next standalone): SQLite lokal via `better-sqlite3`, offline-first, sync opsional ke Supabase. Entry: `src-tauri/src/main.rs`; sync engine: `src-tauri/src/sync.rs`.
- **Mobile / mobile-web** (Flutter): hanya bicara ke Next.js API.
- **Unified data layer:** `src/lib/db-unified.ts`. Pakai `db.query/queryOne/insert/update/delete/transaction`. **Jangan pernah impor client Supabase atau SQLite langsung dari kode fitur.**
- **Runtime:** Node.js 22 + npm. Tetap di situ.

### Peta file per concern

- Akses DB (semua backend): `src/lib/db-unified.ts`
- Pergerakan stok + konversi roll: `src/lib/services/inventory-service.ts` (`postInventoryMovement`, `convertRollVariant`)
- Buku kas + AVCO: `src/lib/services/finance-service.ts`
- Auth guard: `src/lib/auth-guard-server.ts` (tipe error di `src/lib/auth-guard-error.ts`)
- Skema input Zod: `src/lib/schemas/` · error PG ramah: `src/lib/pg-error.ts`
- Feature flag: `src/lib/feature-flags.ts` · helper retry/coalesce: `src/lib/retry-utils.ts`, `src/lib/coalesce.ts`
- Normalisasi record (allowlist boolean): `src/lib/normalize-record.ts` · payload hash: `src/lib/payload-hash-util.ts`
- Logging terstruktur: `src/lib/log.ts` · modal focus trap: `src/components/useFocusTrap.ts`
- Tutup periode: `src/lib/services/accounting-periods-service.ts`
- Helper PPN: `src/lib/ppn-helpers.ts`; billing roll: `src/lib/roll-size-utils.ts`
- Hook cache: `src/lib/use-cached-data.ts`; daftar tabel sync: `src/lib/sync-config.ts`
- Menu + breadcrumb: `src/components/menuConfig.tsx`

## Language standard (Indonesia-first)

Seluruh app dinormalkan ke Bahasa Indonesia. Semua artefak milik aplikasi pakai Bahasa Indonesia: string UI, folder route, API route, nama komponen, komentar/JSDoc, docs internal, script internal, dan tabel/kolom DB baru.

**Bahasa Inggris hanya boleh untuk** istilah framework/library/protokol dan nama tetap: `src`, `page.tsx`, `route.ts`, props React, keyword SQL, nama paket npm, tipe bawaan (`string`, `Promise`, `Record`, ...), kode generated/vendor, dan migrasi yang sudah diterapkan ke cloud.

**Konvensi yang masih berlaku (jangan regres):**

- Komentar/JSDoc baru di kode aplikasi yang disentuh harus Bahasa Indonesia. Saat menyentuh komentar Inggris di dekatnya, terjemahkan (jaga edit tetap terbatas). Jangan terjemahkan komentar framework/generated/vendor.
- Pakai ejaan baku, bukan setengah-Inggris: Impor (bukan Import), Ekspor (bukan Export), Unggah (bukan Upload), Unduh (bukan Download), Muat Ulang (bukan Refresh), Pratinjau (bukan Preview), Penggantian (bukan Override), Bawaan / Utama (bukan Default), Buat (bukan Generate), Draf (bukan Draft), Jendela (bukan Window), Faktur (bukan Invoice), Pelanggan Umum (bukan Walk-in), Manajer/Staf (bukan Manager/Staff).
- Jangan singkat label menu operasional: "PO" → "Pesanan Pembelian", "SJ" → "Surat Jalan". "SPK", "PPN", "NSFP", "POS", "maklon", "finishing", "Vendor" tetap (istilah operasional baku).
- Jangan tambah toggle bilingual (i18n) baru untuk UI internal. Pengecualian yang ada: generator AI design-brief di `src/app/produksi/ai-prompt/page.tsx` (dikonsumsi vendor luar).
- Glosarium: Dashboard→Beranda, Customer→Pelanggan, Material→Barang, Purchase→Pembelian, Sale→Penjualan, Inventory→Inventori, Finance→Keuangan, Reports→Laporan, Settings→Pengaturan, User→Pengguna, Production→Produksi.

**Keamanan deployed-contract:** jangan pernah rename kolom DB / path API yang sudah dideploy secara sembarangan. Buat migrasi baru (additive) atau alias kompat, migrasikan consumer, verifikasi, lalu hapus yang lama. Rename DB harus sinkron di migrasi Supabase, `database/sqlite-schema.sql`, runtime ALTER `src/lib/db-unified.ts`, `src/lib/sync-config.ts`, services, web, Tauri, dan Flutter.

**Pengecualian yang sudah disepakati (sengaja tetap Inggris):**
- Nama file di `src/lib/services/*-service.ts` dan `src/lib/*.ts` boleh tetap Inggris (dibaca programmer; rename memicu churn semua import tanpa nilai untuk user).
- Tabel DB lama yang sudah Inggris (`inventory_movements`, `purchase_orders`, `stock_opnames`, `barang_roll_variants`, `accounting_periods`, ...) tetap — rename tabel berisiko tinggi (banyak FK) untuk nilai rendah. Tabel/kolom baru harus Bahasa Indonesia.
- Folder API lama di `src/app/api/` (mis. `/api/customers`) dijaga sebagai shim re-export tipis yang menunjuk route Indonesia (`/api/pelanggan`) sampai Flutter/Tauri bermigrasi. Route web lama (`/customers`, `/dashboard`, ...) 301-redirect ke route Indonesia via `next.config.ts`.

## Iron rules — data & money (terapkan tanpa diminta)

Pemilik tidak akan ingat untuk meminta; tegakkan secara default.

1. **Fetch data → `useCachedData` (SWR), jangan `useAsyncData`.** Paint instan dari cache + revalidate di background. Cache key stabil per dataset (mis. `"pelanggan"`, atau `` `movement-ledger:${JSON.stringify(filters)}` ``). Bust cache lintas halaman via `useInvalidate("key")`. Referensi: `src/app/barang/page.tsx`, `src/app/vendors/page.tsx`.
2. **Perubahan schema → TIGA tempat sinkron:** (a) `supabase/migrations/<timestamp>_<name>.sql` baru (additive, `IF NOT EXISTS`, default); (b) template fresh-install `database/sqlite-schema.sql`; (c) runtime `ALTER TABLE ADD COLUMN` di `src/lib/db-unified.ts` agar install SQLite lama bermigrasi saat start. Migrasi yang sudah di cloud bersifat immutable — tulis yang baru.
3. **Mutasi inventori → `inventory-service.postInventoryMovement`, jangan raw `db.update("barang", { jumlah_stok })`.** Ledger `inventory_movements` adalah sumber kebenaran stok + AVCO. Potong roll pakai `convertRollVariant`. Rebuild via `rebuildInventoryBalance(barangId)`.
4. **Mutasi uang/buku kas → `keuangan` dengan token `[REF:<id>]` di `keperluan`.** Void/revert mencari token ini. Hutang/piutang mengalir lewat `payDebt` / `revertDebtPayment`; jaga `keuangan`, `hutang.sisa_hutang`, `pembelian.jumlah_dibayar` lock-step. CASH posting ke `keuangan` langsung; NET30/COD membuat `hutang` dan posting hanya saat dibayar.
5. **Mutasi server action → bungkus auth guard** (`src/lib/auth-guard-server.ts`: `requireSession`, `requireAdminOrManager`, `requireProductionInventoryRole`, `requireAdminManagerOrSelf`). Lewatkan `session.uid` sebagai `dibuat_oleh`. Read action boleh tanpa guard.
6. **Barang roll/dimensional (`butuh_dimensi_status = 1`):** `jumlah` (m²) = `jumlah_roll × panjang × lebar` (jangan hanya `panjang × lebar`). Pengurangan pakai panjang roll-width-aligned via `barang_roll_variants` + `linear_delta_m`. Konversi atomik + AVCO-netral. Urutan input **Lebar × Panjang**. Qty roll integer ≥ 1.
7. **Guard periode-tertutup pada mutasi bertanggal.** Apa pun yang menerima `tanggal` harus cek `accounting-periods-service.isDateInClosedPeriod`. Lempar error ramah yang menunjuk periode terbuka; jangan diam-diam membypass.
8. **Kolom sync di setiap tabel synced baru:** `sync_status, last_synced_at, sync_version, updated_at_server, updated_by_device, change_version, is_deleted, deleted_at, client_mutation_id`. Daftarkan di `src/lib/sync-config.ts`.
9. **ID ledger idempoten dari baris sumber:** `mov-${itemId}`, `void-${originalMovementId}`, `${conversionId}-out` / `${conversionId}-in-${i}`. Deterministik dan retry-safe.
10. **Verifikasi sebelum "selesai" (wajib):** `npm run type-check` (0 error) → `npm run build` → `npx jest <test relevan>` untuk service yang disentuh (`src/lib/__tests__/`). Jest menjalankan dua project: `node` (services + test API route di `src/app/**/__tests__/*.test.ts`) dan `jsdom` (test komponen `*.test.tsx`). Perubahan UI-only boleh skip jest, tetap perlu type-check + build. Lint warning baru yang kamu buat wajib diperbaiki. CI (`.github/workflows/ci.yml`) menjalankan ulang lint + type-check + test + build + `check:versions` di tiap PR; husky pre-commit hook menjalankan `lint-staged` (eslint --fix) pada file staged.
11. **`onSuccess` untuk item yang baru dibuat melewatkan `null` sebagai updated item**, jadi parent melakukan `reload()` penuh alih-alih `updateInState` (yang tidak akan pernah menambah baris baru).
12. **SQL seed/default:** verifikasi nama kolom terhadap migrasi aktual (mis. field bank `pengaturan_toko` adalah `bank_nama`, `bank_nomor`, `bank_atas_nama`). Baris setting default pakai `ON CONFLICT DO UPDATE SET`, bukan `DO NOTHING`, agar `supabase:local:reset` memulihkan default.
13. **Kategori keuangan:** tampilkan `display_name` sebagai label utama; `category_code` sekunder (kecil, monospace, amber, dikutip). Di `ExpressionAssistant`, `label` saran = display name, `hint` = `kode: ${code}`, `insert` = `"${code}"`.
14. **Setiap API route/server action mutasi WAJIB role-guarded.** Pakai `requireSession` / `requireAdminOrManager` / `requireProductionInventoryRole` / `requireAdminManagerOrSelf` dari `src/lib/auth-guard-server.ts`, dan tangani `AuthGuardError` di catch (kembalikan `.status`). Read boleh tanpa guard. Jangan percaya `x-session-uid` yang dikirim client; turunkan identitas dari `session.uid` milik guard (middleware menyetel header dari JWT terverifikasi). Jangan regres ini — Fase 1 menutup lubang privilege-escalation di sini.
15. **Validasi input mutasi hot-path dengan Zod** (`src/lib/schemas/`: `pos.ts`, `pembelian.ts`, `inventori.ts`). Pakai `z.coerce.number().finite()` untuk uang/qty (menolak NaN, menerima string numerik dari Flutter), `.passthrough()` agar tidak ada field payload yang diam-diam dibuang, dan `safeParse` → 422 saat gagal. Cocokkan enum dengan nilai nyata (metode bayar: `CASH/TRANSFER/QRIS/DEBIT/DOWN_PAYMENT/NET30`).
16. **Tampilkan error DB via `friendlyPgError(e, table)`** (`src/lib/pg-error.ts`) alih-alih melempar pesan PostgREST mentah ke UI (menghindari bocornya nama constraint + Inggris tak ramah). `payload_hash` untuk mutation registry pakai SHA-256 asli via `hashPayload` (`src/lib/payload-hash-util.ts`), jangan `JSON.stringify(x).length`.
17. **Atomicity mutasi komposit (createSale/createPurchase):** jalur RPC Postgres (`create_sale_with_inventory`, `create_purchase_with_inventory`) bersifat **opt-in** via `usePgCompositeRpc()` (`src/lib/feature-flags.ts`, env `USE_PG_COMPOSITE_RPC=1`, default OFF). Jalur non-RPC default WAJIB menjaga compensating cleanup di catch (`compensateFailedSale` / `compensateFailedPurchase`) — balikkan inventori via `rebuildInventoryBalance`, hapus baris keuangan `[REF:id]`, lepaskan NSFP, hapus header (FK cascade). Tabrakan nomor faktur/PO retry via `withDuplicateNumberRetry` (`src/lib/retry-utils.ts`). RPC sale butuh migrasi `20260605000000` (kolom `nomor_faktur`) diterapkan sebelum diaktifkan.
18. **Konversi boolean `normalizeRecord` pakai allowlist eksplisit** (`src/lib/normalize-record.ts`), jangan heuristik longgar `key.includes("status")` — field enum seperti `status_pembayaran`, `void_status_kode`, `roll_inventory_status`, `sync_status` BUKAN boolean dan tidak boleh dicoerce ke true/false.
19. **Hindari N+1 di jalur baca.** Untuk endpoint list, ambil tabel terkait sekali dan join di memori (Supabase: `.in("fk", ids)`; fallback SQLite: muat tabel terbatas sekali). Referensi: `getSales`, `getProductionOrders`. Recalc berat (`recalculateCashbookIfAvailable`) dikoalisi via `createCoalescedRunner` (`src/lib/coalesce.ts`) — panggil bebas; panggilan konkuren akan digabung.
20. **Secret startup fail-fast:** `SESSION_SECRET` harus ≥32 char dan `PASSWORD_ENC_SECRET` harus diset di produksi (`src/lib/session.ts`, `src/lib/crypto.ts` melempar bila tidak — disengaja). JWT TTL 24 jam. Vault kredensial pakai salt per-record (AES-256-GCM) dengan fallback decrypt format lama. Interpolasi identifier SQL mentah (`db-unified.ts`, Tauri `main.rs`) harus lolos allowlist `^[a-z_][a-z0-9_]*$`.

## Navigasi kode — pilih tool termurah (ekonomi token)

Kamu punya grep/file-search dan file read. Tidak ada tool yang wajib. Pilih yang mencapai jawaban dengan **token paling sedikit** untuk tugas yang ada. Jangan grep-chain sepuluh file kalau satu pembacaan terarah sudah cukup.

Panduan kasar (pakai penilaian, bukan dogma):

- **Target lokal / sudah diketahui** (rename string, ganti logo/aset, edit satu file yang diketahui, cari simbol pasti): grep/file-search/read biasanya termurah. Langsung saja.
- **Relasional / dampak / arsitektur** ("apa yang memanggil X dan apa yang rusak jika diubah", "telusuri alur dari POS ke buku kas", "file mana yang menyentuh kolom ini"): mulai dari pencarian terarah, lalu baca file kunci. Jika repo punya knowledge graph (mis. `graphify-out/`), itu bisa mengembalikan subgraph kecil alih-alih banyak pembacaan file penuh — pakai bila tersedia dan termurah.
- **Campuran**: pencarian cepat untuk melokalisasi, lalu read/grep terarah untuk konfirmasi baris pasti, sering jadi jalur gabungan termurah.

## Iron rules — ikon (SVG saja, jangan emoji)

App ini memakai komponen ikon SVG eksplisit. **Jangan pernah pakai emoji sebagai ikon** (tidak ada 🎂, ✅, 🚀, 📦, dll.) di UI, JSX, label, tombol, heading, toast, atau stat card.

- Pakai ulang ikon yang ada dari `src/components/icons/`: `PageIcons.tsx` (judul halaman + navigasi) dan `ContentIcons.tsx` (ikon konten/kategori/badge).
- Jika belum ada ikon yang cocok, tambahkan komponen SVG baru ke file yang tepat mengikuti pola yang ada: `({ className = "", size = N }: IconProps)`, `viewBox="0 0 24 24"`, stroke/fill via `currentColor` agar mewarisi warna teks dan berpasangan dengan dark-mode.
- Impor komponennya (mis. `import { PersonIcon } from "@/components/icons/ContentIcons"`); jangan inline blob `<svg>` mentah di halaman fitur saat komponen reusable cocok.
- Emoji di konteks non-ikon (mis. teks chat ke pemilik) bukan target rule ini — rule ini soal ikon yang dirender di UI produk.

## Iron rules — bentuk halaman/UI baru

- Root halaman adalah `<div className="space-y-6">`, **jangan** `<main>` kedua (shell sudah menyediakan `<main>` dengan padding).
- Setiap halaman dibuka dengan kartu judul gradient: `<div className="bg-gradient-to-br from-X to-Y rounded-2xl shadow-lg p-6 text-white">` dengan ikon, judul kapital, subjudul. Referensi: `src/app/keuangan/page.tsx`, `src/app/surat-jalan/page.tsx`.
- **Dark mode wajib di setiap elemen.** Setiap class warna butuh pasangan `dark:` (`bg-white dark:bg-slate-900`, `text-slate-800 dark:text-slate-100`, `border-slate-200 dark:border-slate-700`). Waspadai token invalid seperti `dark:bg-slate-8000`.
- Ikon stat-card pakai `text-white` di patch `bg-white/20 rounded-lg` — jangan sewarna gradient kartu (ikon tak terlihat).
- Badge/angka dengan teks putih butuh shade solid (`bg-emerald-500`), bukan `-50` (hampir putih, tak terbaca).
- **Modal:** ESC untuk tutup, klik backdrop untuk tutup (`if (e.target === e.currentTarget)`), tombol X di header, aksi utama paling kanan dengan warna brand, batal di kirinya, state disabled saat async ("Menyimpan..."). Warna tema per domain: emerald = barang/inventori, purple = pembelian, indigo = netral, amber = peringatan/manual, rose = destruktif. Shell referensi: `src/components/ModalFormShell.tsx`, `src/components/DialogKonfirmasi.tsx`.
- **`ModalFormShell` adalah scaffold modal yang dianjurkan** — sudah menyediakan Escape (menghormati `allowDismiss`), backdrop dismiss, dan focus trap + focus restore. Untuk modal yang tak bisa pakai shell, panggil `useFocusTrap(ref, isOpen)` (`src/components/useFocusTrap.ts`) langsung; ia hanya menjebak Tab (Escape tetap di host).
- **Boundary error/loading:** setiap area route sebaiknya punya `error.tsx` (client component, pesan Bahasa Indonesia + "Coba Lagi" reset) dan, di mana fetch berat, `loading.tsx`. Root `src/app/error.tsx`, `loading.tsx`, `not-found.tsx` sudah ada; tambah `error.tsx` spesifik area untuk section kritis baru.
- **A11y combobox/dropdown:** input mendapat `role="combobox"` + `aria-expanded`/`aria-controls`/`aria-activedescendant`; daftar opsi mendapat `role="listbox"` dengan id stabil; opsi mendapat `role="option"` + `aria-selected` dan TANPA `tabIndex` per-opsi (navigasi keyboard ada di input). Referensi: `src/components/PilihanCari.tsx`.
- **Stabilkan array turunan SWR:** `const items = useMemo(() => data ?? [], [data])` — `data ?? []` telanjang membuat referensi baru tiap render dan merusak dependency `useMemo`/`useEffect` di hilir (react-hooks/exhaustive-deps).
- **Halaman client besar:** ekstrak modal/section ke file fokus dengan props eksplisit (`{ entity, onClose, onSuccess, showNotification }`); modal memiliki state form + submit sendiri, dan `onSuccess` memicu `reload()` parent. Petakan shared state SEBELUM ekstrak — jangan ekstrak JSX membabi buta (ekstraksi naif memicu prop-drilling). Referensi: `src/app/barang/ModalCatatRusak.tsx`, `src/app/pengguna/FormPenggunaModal.tsx`.

## Saat ambigu

Pilih opsi yang: cocok dengan pola yang ada (cari dulu), meminimalkan infra baru, condong ke keamanan user pada operasi destruktif, dan menghormati semantik kolom/tabel yang ada. Dokumentasikan pilihan non-obvious di ringkasan akhir.

## Referensi setup (dipelihara pemilik, jangan hapus)

- `docs/SETUP.md` — setup developer mesin baru.
- `docs/supabase-local-development.md` — workflow Supabase lokal.
- `docs/migrasi-singapura-dan-perbaikan.md` — migrasi DB ke Singapura, collapse migrasi, konfigurasi Vercel, dan kandidat perbaikan (SQLite/N+1).
- `docs/migrasi-singapura-dan-perbaikan.md` — migrasi DB ke Singapura, collapse migrasi, konfigurasi Vercel, dan kandidat perbaikan (SQLite/N+1).
