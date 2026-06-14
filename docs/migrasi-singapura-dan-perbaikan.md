# Migrasi Supabase ke Singapura + Perbaikan Skema & Performa

> Catatan kerja per **15 Juni 2026**. Dokumen ini merangkum apa yang sudah
> dikerjakan, tujuannya, apa yang **belum** dikerjakan, dan daftar kandidat
> perbaikan berikutnya (termasuk SQLite/Tauri).

---

## Latar Belakang

Pemicu awal: aplikasi di `app.gemiprint.com` terasa lambat. Setelah ditelusuri,
penyebab utamanya **bukan** Vercel atau Supabase yang lambat, melainkan
kombinasi dua hal:

1. **Jarak geografis server ↔ database.** Database Supabase lama ada di
   **Tokyo** (`ap-northeast-1`), sedangkan region Vercel tidak pernah di-pin
   (default kemungkinan US). Setiap query menyeberang region.
2. **Pola query di codebase.** Beberapa halaman melakukan banyak query
   berurutan / per-baris (N+1), sehingga latency antar-region berlipat ganda.

Karena database masih kosong (hanya data seed), diputuskan **pindah ke
Singapura** sekalian — lebih dekat ke mayoritas user (Indonesia) dan memungkinkan
Vercel di-colocate di Singapura.

Aturan kunci yang dipakai: **dekatkan server ke database.** Perjalanan
server↔database terjadi puluhan kali per halaman; perjalanan user↔server hanya
sekali. Maka Vercel dan Supabase **wajib berada di region yang sama**.

---

## Yang SUDAH Dikerjakan

### 1. Migrasi database ke Supabase Singapura

- Project Supabase baru dibuat di **Singapore** (`ap-southeast-1`),
  ref `fugdoghnorlkfrpadfdl`.
- `.env.local` diarahkan ke project baru. Koneksi memakai **pooler IPv4**
  (`aws-1-ap-southeast-1.pooler.supabase.com`) karena host direct
  (`db.<ref>.supabase.co`) hanya IPv6 dan tidak terjangkau dari mesin IPv4-only.
- Line ending `.env.local` dinormalkan dari CRLF → LF (sempat menyebabkan error
  `\r` pada connection string).
- Skema + data seed dipindahkan dari Tokyo ke Singapura dengan cara dump skema
  asli Tokyo (yang berfungsi) lalu di-apply ke Singapura. Hasil terverifikasi
  identik: **65 tabel, 2 view, 11 function, 70 RLS policy**, plus semua data
  seed/config (akun admin `gemi`, pengaturan toko, kategori, satuan, rumus buku
  kas, finance definitions). **Tidak ada data transaksi.**

### 2. Membereskan migrasi Supabase yang rusak (collapse → baseline)

**Masalah yang ditemukan:** seluruh rantai migrasi (`supabase/migrations/`,
50 file) tidak bisa diputar ulang dari nol karena *forward reference* — file
migrasi lama (mis. Mei) diedit belakangan untuk memakai kolom yang baru dibuat
migrasi Juni. Sementara `supabase/schema.sql` juga sudah kedaluwarsa (ketinggalan
`metric_contributions`, tabel payroll, `surat_jalan`, `audit_log`). Jadi tidak
ada satu pun sumber kebenaran yang bisa membangun DB dari awal.

**Tindakan:**

- 50 migrasi lama dihapus, diganti **satu file baseline**:
  `supabase/migrations/20260615000000_baseline_checkpoint.sql` (dump skema dari
  DB yang sudah benar).
- `supabase/schema.sql` dan `supabase/seed-default-values.sql` di-regenerate agar
  cocok dengan baseline.
- Riwayat migrasi di DB Singapura diperbaiki: 36 baris palsu (sisa percobaan
  `db push` yang gagal) dihapus, disisakan hanya baris baseline.
- Test `src/lib/__tests__/return-finance.test.ts` yang tadinya membaca file
  migrasi yang dihapus, diarahkan ke `seed-default-values.sql` sebagai sumber
  kebenaran baru.

**Verifikasi:**

- `npx supabase db push --dry-run` → **"Remote database is up to date"** (nol drift).
- `npm run type-check` → **0 error**.
- `npm test` → **310 test lolos** (42 suite).

Mulai sekarang repo punya satu sumber kebenaran. Fitur berikutnya tinggal membuat
migrasi baru di atas baseline ini.

### 3. Konfigurasi Vercel (production = Singapura)

- Project `gemiprintaio` di-link via Vercel CLI.
- 5 environment variable Supabase diarahkan ke project Singapura:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.
  - Cakupan environment dipulihkan persis seperti semula (3 var pertama:
    Production + Preview; `DATABASE_URL`/`DIRECT_URL`: Production) lewat Vercel
    REST API.
  - `SESSION_SECRET` dan `PASSWORD_ENC_SECRET` **tidak disentuh** (vault
    kredensial tetap terbaca).
- `vercel.json` dibuat dengan `"regions": ["sin1"]` agar server colocate dengan
  database Singapura.

> **PENTING — deployment belum aktif.** Mengubah env var + menambah `vercel.json`
> **tidak** otomatis mengubah deployment production yang sedang live. Region
> `sin1` dan kredensial Singapura baru berlaku **setelah deployment berikutnya**.
> Sampai redeploy, production masih memakai konfigurasi lama (Tokyo).

---

## Yang BELUM Dikerjakan / Perlu Tindakan Berikutnya

### A. Redeploy production (WAJIB, agar perubahan aktif)

Commit perubahan (`vercel.json`, baseline migration, schema/seed, test) lalu
deploy. Region `sin1` + Supabase Singapura baru aktif setelah ini.

### B. Bug aktif: build template SQLite gagal (perlu diperbaiki)

`npm run db:build-template` **gagal saat ini** dengan:

```
table finance_category_definitions has no column named metric_contributions
```

Penyebab: `database/sqlite-schema.sql` (skema template untuk install desktop
baru) tidak punya kolom `metric_contributions`, tetapi
`database/sqlite-default-values.sql` memasukkan data ke kolom itu. Ini drift yang
sama persis dengan yang dulu menimpa `supabase/schema.sql`. Bug ini **independen**
dari kerjaan migrasi Supabase — sudah ada sebelumnya.

> Catatan: file template `database/gemiprint.db` di-gitignore (tidak ter-track),
> jadi build yang gagal tidak merusak repo. Tapi install desktop baru tidak bisa
> dibangun sampai ini diperbaiki.

### C. Pola N+1 query (perbaikan performa jangka panjang)

Setelah colocate Singapura, efek N+1 nyaris hilang untuk data kecil (tiap query
~1-5ms, bukan ~175ms lintas region). Namun pola ini akan muncul lagi seiring data
tumbuh. Hotspot yang sudah teridentifikasi:

| Jalur | Pola |
|---|---|
| `getPOSInitData` (POS, Dashboard, Penawaran) | N+1: 1 query `harga_barang_satuan` per produk |
| `enrichQuotations` (Penawaran) | N+1: 1 query `barang` per barang_id |
| `/api/keuangan/summary-v2` | Loop **berurutan** 2× per actor (`pinjaman_karyawan` + `komponen_kompensasi`) |

Solusi umum: ganti loop per-baris dengan satu query batch memakai `.in()`
(pola ini sudah dipakai dengan benar di `getSales`). Tambahan: halaman keuangan
`force-dynamic` tanpa caching — pertimbangkan caching ringan.

---

## Kandidat Perbaikan: SQLite / Sinkronisasi Desktop (Tauri)

> Hasil penyelidikan kode. **Ini riset, belum ada perubahan.** Relevan karena
> desktop app (Tauri) memakai SQLite lokal yang sinkron ke Supabase.

### Gambaran arsitektur

- SQLite adalah **sumber kebenaran terpisah** dari Postgres. Ada dua lapis:
  1. **Build-time (install baru):** `database/sqlite-schema.sql` +
     `database/sqlite-default-values.sql` → dibangun jadi `database/gemiprint.db`
     oleh `scripts/build-gemiprint-template-db.mjs`, lalu di-embed ke binary Tauri.
  2. **Runtime (upgrade install lama):** `src/lib/db-sqlite-migrations.ts`
     (`ensureServerSQLiteSyncV2Schema`) jalan tiap koneksi dibuka. Mekanismenya
     bootstrap idempoten (`CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` +
     `ALTER TABLE ADD COLUMN`), **tanpa versioning**. Hanya jalan di server
     (Next.js server / Tauri), di-skip di Vercel/web.
- Setiap migrasi Postgres harus **diimplementasikan ulang manual** di SQLite
  (komentar di `db-sqlite-migrations.ts` merujuk nama file migrasi Supabase).
  **Inilah sumber drift.**

### Perilaku sync engine (Rust, `src-tauri/src/sync.rs`)

Engine bersifat **dinamis, digerakkan nama kolom** — tidak ada mapping layer.
Mengasumsikan nama tabel & kolom SQLite **identik** dengan Postgres.

- **Push:** POST/PATCH ke `{url}/rest/v1/{table}` memakai nama tabel/kolom apa
  adanya dari payload lokal.
- **Pull:** membangun `INSERT OR REPLACE INTO {table} ({cols})` di mana `{cols}`
  adalah key JSON dari Supabase.
- **Konflik:** Last-Write-Wins berdasarkan `updated_at_server` lalu
  `updated_by_device`.

### Risiko utama (urut dari paling berbahaya)

1. **Silent data loss saat pull (paling berbahaya).** Jika Postgres punya kolom
   yang **tidak ada** di tabel SQLite, maka `INSERT` untuk baris itu gagal dan
   **seluruh baris di-skip diam-diam** (bukan sebagian) — error ditelan di
   `pull_table_since_cursor`. Artinya setiap kolom yang ditambah/di-rename di
   Postgres **harus** ada juga di kedua lapis SQLite, atau data desktop hilang
   tanpa peringatan.
2. **Build template rusak** (lihat bagian B di atas) — `metric_contributions`
   ada di seed tapi tidak di schema SQLite.
3. **Dua salinan DDL yang sudah menyimpang.** Tabel payroll di
   `sqlite-schema.sql` memakai `change_version ... DEFAULT 1`, sedangkan versi
   runtime di `db-sqlite-migrations.ts` memakai `DEFAULT 0`. Ini bukti kedua file
   dipelihara manual dan sudah beda.
4. **Tell-tale drift lain:** baris seed `PIUTANG` ganda (aman karena
   `INSERT OR IGNORE`), kolom sync di-inline di tengah statement (pola
   manual-append yang dulu merusak skema Postgres).

### Status parity fitur terbaru (Postgres vs SQLite)

| Fitur | Template `sqlite-schema.sql` | Runtime migrations |
|---|---|---|
| `metric_contributions` | **HILANG** dari CREATE | ditambah via ALTER |
| `surat_jalan` / `item_surat_jalan` | ada | **tidak dibuat** di runtime |
| `komponen_kompensasi` | ada | dibuat |
| `proses_gaji` / `slip_gaji` | ada | dibuat |
| `pinjaman_karyawan` | ada | dibuat |
| `nomor_faktur` (rename) | benar | n/a |
| money → double precision | N/A (SQLite pakai `REAL`) | n/a |
| `audit_log` | tidak ada (OK, tidak ikut sync) | tidak ada (OK) |

### Rekomendasi untuk SQLite/Tauri

1. **Segera:** perbaiki bug build template (tambah `metric_contributions` ke
   `database/sqlite-schema.sql`) agar `npm run db:build-template` jalan lagi.
2. **Jangka menengah:** jadikan `sqlite-schema.sql` ter-regenerate dari satu
   sumber, bukan diedit tangan — sama seperti yang baru dilakukan ke
   `supabase/schema.sql`. Idealnya satu proses yang menjaga parity Postgres↔SQLite.
3. **Audit parity** sebelum rilis desktop berikutnya: pastikan tiap tabel di
   `SYNC_V2_TABLES` punya kolom yang sama di SQLite dan Postgres, agar tidak ada
   silent drop saat pull.
4. **Uji `tauri:dev` + siklus sync** dengan DB Singapura baru sebelum rilis
   (desktop sudah lama tidak disentuh).

> Catatan: collapse migrasi Supabase **tidak** menyentuh SQLite, dan sync engine
> tidak akan crash karena beda skema (ia skip/drop diam-diam). Risiko nyata ada di
> build template yang sudah rusak dan potensi silent data loss bila parity tidak
> dijaga.
