# Handoff — Script Snapshot & Restore Supabase Cloud

> Dokumen ini adalah spesifikasi lengkap untuk diteruskan ke agent/model lain
> agar bisa menyelesaikan tugas tanpa harus menyelidiki ulang. Semua fakta di
> bawah sudah diverifikasi pada saat handoff.

## Tujuan

Owner ingin bisa **"checkpoint"** database Supabase cloud sehingga jika terjadi
kesalahan saat menginput data dev yang sudah mirip data asli, owner tinggal
memuat ulang (restore) ke snapshot tersimpan. Dibuat **dua npm script**:

- `npm run db:snapshot` — simpan snapshot (aman, hanya baca)
- `npm run db:restore` — pilih snapshot lalu wipe + replay

---

## Fakta proyek (sudah diverifikasi — jangan diselidiki ulang)

- **Project root:** `/home/gemi/Projects/gemiprintaio`
- **Supabase project ref (PRODUKSI):** `fugdoghnorlkfrpadfdl`
- **Node:** v22.22.2 (`--env-file` didukung)
- **OS:** CachyOS Linux (berbasis Arch; `pacman`; **passwordless sudo bekerja**)
- **Library `pg`:** sudah ada di `devDependencies` (dipakai script yang ada)
- **`.env.local`:** ada, berisi `DATABASE_URL` dan/atau `DIRECT_URL` (connection
  string Postgres Supabase). **Jangan cetak nilai variabel ini** (berisi password).
- **`pg_dump` / `psql`: BELUM terinstall** ← satu-satunya dependensi yang kurang.
- **Keputusan scope:** dump hanya schema `public` (semua data bisnis, RLS, RPC
  function, enum, sequence). JANGAN sentuh `auth`, `storage`, atau schema sistem
  lain. Ini cocok dengan scope script wipe yang sudah ada.

---

## ⚠️ Satu hal yang gagal: install client tools

Nama paket `postgresql-tools` **tidak valid** di Arch
(`error: target not found`).

**Solusinya:** di Arch, `pg_dump`/`psql` ada di paket utama `postgresql`:

```sh
sudo pacman -S --noconfirm postgresql      # menyediakan pg_dump + psql
# lalu verifikasi:
pg_dump --version && psql --version
```

Jika ragu nama paketnya, konfirmasi dengan `pacman -Ss '^postgresql$'`
atau `sudo pacman -Fy && pacman -F pg_dump`.

**Catatan versi:** Arch menyediakan PG 17/18; Supabase cloud pakai PG 15/17 —
`pg_dump` yang lebih baru terhadap server yang lebih lama didukung penuh.

**Pakai `pg_dump` asli**, BUKAN dumper Node murni — schema ini punya RLS policy,
RPC function (`create_sale_with_inventory`), enum, dan sequence yang hanya bisa
ditangkap secara akurat oleh `pg_dump`.

---

## File yang harus dibaca dulu (untuk pola)

| File | Untuk apa |
|---|---|
| `gemiprintaio/scripts/_lib/guard.mjs` | `confirmOrExit`, `isProdHost`, `getHost`. Pakai ulang untuk konfirmasi. |
| `gemiprintaio/scripts/wipe-supabase-public.mjs` | Pola koneksi `pg.Client` (`ssl: { rejectUnauthorized: false }`). |
| `gemiprintaio/scripts/wipe-public-schema.sql` | SQL wipe (`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ...`). Pakai sebagai **langkah 1 restore**. |
| `gemiprintaio/package.json` | Tambahkan script dekat entri `supabase:*` lain. |
| `gemiprintaio/.gitignore` | Tambahkan folder snapshots. |

---

## File yang harus DIBUAT

### 1) `gemiprintaio/scripts/snapshot-supabase.mjs` → `npm run db:snapshot`

Hanya-baca dan aman (tidak perlu prod guard). Perilaku:

- `node --env-file=.env.local` (atur di `package.json`; jangan load dotenv manual).
- `const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;` → error ramah jika hilang.
- Deteksi `pg_dump` (`command -v pg_dump`); jika tidak ada, cetak perintah install lalu `exit(1)`.
- Parse conn dengan `new URL(conn)` → set env untuk child process: `PGUSER`,
  `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSLMODE=require`
  (menjaga password tetap di luar argv; Supabase mewajibkan SSL).
- Pastikan folder `snapshots/` ada, dianchor ke project root:
  `path.resolve(dirname(fileURLToPath(import.meta.url)), "..", "snapshots")`.
- Nama file: `snapshot-YYYY-MM-DDTHH-MM-SS.sql` (pakai dash; titik dua ilegal
  di beberapa filesystem). Label opsional dari `process.argv[2]` → append `-${label}`.
- Spawn `pg_dump` dengan argumen:
  - `--schema=public`
  - `--no-owner`
  - `--no-privileges`
  - `-f <filepath>`
  - (Format plain-text SQL — bisa dibaca, di-diff, dan di-restore oleh psql.)
- Exit code non-zero → cetak stderr, `exit(1)`.
- Sukses → cetak: path file, ukuran file (human-readable), jumlah baris
  `CREATE TABLE` dan `COPY` (sanity check), dan pengingat:
  *"Salin folder `snapshots/` ke Google Drive/Dropbox agar aman bila laptop rusak."*

### 2) `gemiprintaio/scripts/restore-supabase.mjs` → `npm run db:restore`

**Destruktif — butuh guard kuat.** Perilaku:

- Load env + conn string sama seperti di atas. Deteksi `psql`.
- Flag `--list` → hanya cetak daftar snapshot lalu exit.
- Daftar `snapshots/*.sql` diurutkan by mtime **descending**. Jika kosong →
  pesan ramah, exit 0.
- Menu bernomor interaktif (`readline`): index, nama file, ukuran, mtime,
  estimasi jumlah baris data (hitung blok `COPY`).
- Setelah dipilih: peringatan keras dalam Bahasa Indonesia —
  *"INI AKAN MENGHAPUS SEMUA DATA di cloud dan menggantinya dengan isi snapshot."*
- **Konfirmasi ganda:** wajib mengetik nama file persis untuk lanjut.
  Dukung mode non-interaktif: `npm run db:restore -- snapshots/snapshot-x.sql --confirm`
  (lewati menu, tetap wajib `--confirm`).
- Saat dikonfirmasi, jalankan berurutan:
  1. **Wipe:** connect via `pg.Client` (mirip `wipe-supabase-public.mjs`) lalu
     eksekusi isi `wipe-public-schema.sql`.
  2. **Replay:** spawn `psql -f <snapshot.sql>` (psql menangani blok `COPY`
     dengan benar — JANGAN pisah SQL di Node secara manual).
  3. **Re-grant (safety):** jalankan ulang blok `GRANT ... ON ALL ... IN SCHEMA public`.
- Cetak sukses + ringkasan (jumlah tabel direstore). Deteksi host produksi →
  peringatkan keras tapi tetap diizinkan (restore cloud adalah tujuannya).

---

## package.json — tambahkan ke `"scripts"`:

```json
"db:snapshot": "node --env-file=.env.local scripts/snapshot-supabase.mjs",
"db:restore": "node --env-file=.env.local scripts/restore-supabase.mjs",
"db:snapshot:list": "node --env-file=.env.local scripts/restore-supabase.mjs --list"
```

## .gitignore — tambahkan (snapshot berisi hash password + data asli — jangan di-commit):

```
# Supabase snapshots (real data + hashes — never commit)
/snapshots/
```

---

## Aturan bahasa (dari AGENTS.md)

Semua comment/JSDoc dan **pesan konsol ke owner HARUS dalam Bahasa Indonesia**
(owner orang Indonesia, non-programmer). Istilah framework (`pg_dump`, `psql`)
tetap dalam Bahasa Inggris.

---

## Verifikasi (wajib sebelum klaim selesai — AGENTS.md rule 10)

1. **Install** `postgresql` (lihat atas) dan konfirmasi `pg_dump --version`.
2. **Jalankan `npm run db:snapshot` untuk sungguhan** — hanya-baca/aman.
   Konfirmasi file `.sql` muncul di `snapshots/` berisi baris `CREATE TABLE` dan `COPY`.
3. **JANGAN jalankan restore ke cloud** (itu wipe). Sebagai gantinya:
   - Syntax check: `node --check scripts/snapshot-supabase.mjs` dan
     `node --check scripts/restore-supabase.mjs`.
   - Jalankan `npm run db:restore`, lalu **cancel** saat prompt — konfirmasi
     guard/menu bekerja dan tidak ada yang tertulis.
   - (Opsional tapi ideal) buktikan restore end-to-end ke **lokal** Supabase:
     `npm run supabase:local:start`, snapshot lokal, restore lokal.
4. `npm run type-check` (0 error) dan `npm run build` sesuai aturan
   (file `.mjs` tidak memengaruhi keduanya, tapi ikuti aturan).

---

## Selesai = owner bisa melakukan

```sh
npm run db:snapshot              # simpan checkpoint
npm run db:snapshot:list         # lihat daftar checkpoint tersimpan
npm run db:restore               # pilih satu untuk rollback
```

---

## Catatan keputusan desain

- **Scope `public` saja** supaya konsisten dengan script wipe dan tidak
  mengganggu schema sistem (`auth`/`storage`). Data bisnis semuanya di `public`.
- **Snapshot disimpan sebagai file `.sql` plain-text** → bisa dibaca, di-diff,
  dan disalin ke cloud storage untuk backup off-machine.
- **Password tidak ditaruh di argv** (pakai env `PG*`) agar tidak terlihat di `ps`.
- **SSL wajib** (`PGSSLMODE=require`) karena Supabase menolak koneksi non-SSL.
- **Restore = wipe dulu** (DROP SCHEMA) lalu replay; oleh karena itu restore
  selalu diawasi konfirmasi ganda dan tidak boleh berjalan otomatis.
