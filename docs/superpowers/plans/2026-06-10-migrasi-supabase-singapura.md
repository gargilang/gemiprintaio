# Migrasi Supabase ke Project Baru Singapura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ini rencana OPS/MIGRASI (bukan TDD kode): banyak langkah dilakukan lewat browser (dashboard Supabase + Vercel, sudah login) dan CLI di terminal.

**Goal:** Membuat project Supabase baru bernama `gemiprintapp` di region Singapore (latensi minim dari Indonesia), menerapkan seluruh skema + seed ke sana, lalu mengganti semua environment variable & secret (lokal `.env.local` + Vercel) agar aplikasi memakai project baru — menggantikan project lama `gemiprintaio` (Tokyo) yang akan dihapus nanti.

**Architecture:** Project lama (`fufrztzerditoctgzbcn`, Tokyo) saat ini kosong, jadi migrasi praktis tanpa pemindahan data — cukup buat project baru, link CLI ke ref baru, `supabase db push` (menerapkan semua migrasi di `supabase/migrations/`), seed default, lalu tukar kredensial di `.env.local` dan Vercel Environment Variables. Data asli hidup di Tauri SQLite lokal dan akan mengisi cloud lewat sync.

**Tech Stack:** Supabase CLI (`npx supabase`), Vercel CLI (`npx vercel`) + dashboard browser, Next.js env vars, Node.js 22.

---

<!-- M:PRA -->
## Konteks penting & prasyarat (BACA DULU)

**Situasi:**
- Project lama: `gemiprintaio`, ref `fufrztzerditoctgzbcn`, region **Tokyo** (latensi tinggi dari Indonesia). Saat ini KOSONG (tidak ada data produksi penting).
- Tujuan: project baru `gemiprintapp` di region **Singapore (Southeast Asia)**.
- Nanti, setelah project baru 100% jalan: project lama `gemiprintaio` di-delete, lalu `gemiprintapp` di-rename jadi `gemiprintaio`. (Rename TIDAK mengubah ref/URL — aman.)

**Yang sudah login & siap dipakai (per rules):**
- Browser bawaan Cursor: dashboard Supabase (`supabase.com/dashboard`) dan Vercel (`vercel.com`) sudah login.
- Terminal: Supabase CLI, Vercel CLI, Node.js, git tersedia.

**Fakta teknis terverifikasi dari repo:**
- Env var yang dipakai aplikasi (lihat `src/lib/db-unified.ts`, `db-supabase.ts`, `supabase-admin.ts`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
  - `SESSION_SECRET` (≥32 char, wajib; app fail-fast tanpa ini)
  - `PASSWORD_ENC_SECRET` (wajib di production untuk vault kredensial)
  - `DATABASE_URL` + `DIRECT_URL` (Postgres connection string; dipakai script ops)
  - flag: `SYNC_ENGINE_V2`, `REALTIME_PULL_ENABLED`, `WEB_SERVER_MEDIATED_ONLY`, `SYNC_WAVE`, `NEXT_PUBLIC_DB_MODE`
- `supabase/config.toml`: `project_id = "gemiprintaio"`; seed file = `./seed-default-values.sql`.
- `package.json`: `supabase:link` mematok `--project-ref fufrztzerditoctgzbcn` (HARUS diganti ke ref baru — Task 7).
- `scripts/_lib/guard.mjs`: `PROD_PROJECT_REFS = ["fufrztzerditoctgzbcn"]` (HARUS diganti ke ref baru — Task 7).
- Migrasi cloud diterapkan via `npx supabase db push` (bukan `db reset`). Migrasi terbaru `20260610090000` ber-timestamp lebih awal dari beberapa yang lain, jadi siapkan flag `--include-all` bila diminta.
- `.env.local` saat ini menunjuk ke Supabase LOKAL (`127.0.0.1:54321`) — jangan timpa baris lokal kalau owner masih mau dev lokal; tugas ini fokus ke kredensial CLOUD baru (lihat Task 6 untuk strategi env).

**Aturan keamanan (WAJIB dipatuhi):**
- JANGAN pernah commit `.env.local` atau menaruh secret ke git.
- JANGAN tampilkan service_role key penuh di output chat; cukup sebut "tersimpan".
- JANGAN delete project lama dalam rencana ini (owner lakukan manual nanti setelah yakin).
- Konfirmasi ke owner sebelum aksi tak-bisa-balik di dashboard (mis. set production env di Vercel yang memicu redeploy).

**Definisi "selesai":** aplikasi (lokal `npm run dev` dan/atau Vercel preview) bisa login + baca/tulis ke project Supabase Singapura baru tanpa error, dan log mencetak `🌐 Supabase online - using cloud database`.

<!-- M:PRA -->
<!-- M:T1 -->
### Task 1: Buat project Supabase baru di Singapura (browser)

**Tujuan:** Project `gemiprintapp` region Singapore aktif, dan dapatkan ref + kredensialnya.

- [ ] **Step 1: Buka dashboard & buat project**

Di browser (sudah login), buka `https://supabase.com/dashboard/projects`. Klik "New project".
- Organization: pilih org yang sama dengan project lama.
- Name: `gemiprintapp`
- Database Password: generate password kuat, SIMPAN sementara (dipakai untuk `DATABASE_URL` di Task 6). Jangan tampilkan penuh di chat.
- Region: **Southeast Asia (Singapore)** — WAJIB. Ini inti tugasnya.
- Plan: Free.
Klik "Create new project" dan tunggu provisioning selesai (~2 menit).

- [ ] **Step 2: Catat project ref**

Setelah jadi, buka Project Settings → General. Salin **Reference ID** (format 20 char, mis. `abcdefghijklmnopqrst`). Ini akan dipakai berulang; sebut sebagai `<REF_BARU>` di langkah berikutnya. Konfirmasi ke owner: "Project ref baru = `<REF_BARU>`, region Singapore. Lanjut?".

- [ ] **Step 3: Catat kredensial API**

Buka Project Settings → API. Catat (simpan aman, JANGAN tampilkan penuh di chat):
- Project URL → `https://<REF_BARU>.supabase.co`
- `anon` `public` key → untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` `secret` key → untuk `SUPABASE_SERVICE_ROLE_KEY`

Buka Project Settings → Database → Connection string → mode "URI". Catat connection string (Session/Direct). Untuk `db push` via CLI biasanya tidak perlu, tapi disimpan untuk `DATABASE_URL`/`DIRECT_URL` di Task 6.

<!-- M:T1 -->
<!-- M:T2 -->
### Task 2: Login & link Supabase CLI ke project baru

**Files:**
- Modify: `package.json` (script `supabase:link`, Task 7 — di sini hanya link manual sekali)

- [ ] **Step 1: Pastikan CLI login**

Run: `npx supabase projects list`
Expected: daftar project tampil (artinya sudah login). Jika error auth, jalankan `npx supabase login` dan ikuti alur browser, lalu ulangi `projects list`. Pastikan `gemiprintapp` muncul dengan region `Southeast Asia (Singapore)` dan ref = `<REF_BARU>`.

- [ ] **Step 2: Link working dir ke project baru**

Run: `npx supabase link --project-ref <REF_BARU>`
Saat diminta database password, masukkan password dari Task 1 Step 1.
Expected: "Finished supabase link." Tidak ada error. Ini menulis ulang `supabase/.temp/project-ref` dan file link internal ke ref baru.

- [ ] **Step 3: Verifikasi link**

Run: `npx supabase migration list`
Expected: kolom "Local" memuat semua migrasi dari `supabase/migrations/`, kolom "Remote" KOSONG semua (project baru belum punya migrasi). Ini konfirmasi kita terhubung ke DB baru yang masih kosong.

<!-- M:T2 -->
### Task 3: Terapkan seluruh skema (migrasi) ke project baru

- [ ] **Step 1: Push semua migrasi**

Run: `npx supabase db push`
Expected: CLI mengurutkan dan menerapkan SEMUA file di `supabase/migrations/` ke cloud baru. Jika CLI menolak karena ada migrasi "out of order" (timestamp `20260610090000` lebih awal dari yang sudah ada), jalankan ulang dengan: `npx supabase db push --include-all`.
Pada project KOSONG ini, semua migrasi akan diterapkan dari nol — tidak ada konflik data.

- [ ] **Step 2: Verifikasi migrasi terterap**

Run: `npx supabase migration list`
Expected: setiap baris kini punya timestamp di kolom "Remote" (sama dengan "Local"). Tidak ada yang kosong.

- [ ] **Step 3: Verifikasi tabel inti ada (browser atau CLI)**

Di dashboard project baru → Table Editor, pastikan tabel inti ada: `profil`, `barang`, `penjualan`, `item_penjualan`, `order_produksi`, `item_produksi`, `keuangan`, `pelanggan`, `finance_category_definitions`.
Atau via CLI: `npx supabase db diff --linked` → Expected: "No schema changes found" (skema lokal-template == cloud).

<!-- M:T2 -->
<!-- M:T3 -->
### Task 4: Seed data default ke project baru

**Tujuan:** Mengisi baris default yang aplikasi andalkan (kategori keuangan, pengaturan toko, placeholder maklon `barang-jasa-maklon`, dll) sesuai `supabase/seed-default-values.sql`.

**Files:**
- Reference: `supabase/seed-default-values.sql`

- [ ] **Step 1: Cek apakah seed perlu dijalankan manual**

`supabase db push` TIDAK menjalankan seed (seed hanya jalan saat `db reset` lokal). Jadi seed cloud harus diterapkan manual. Cek dulu apakah ada baris default (mis. placeholder maklon):

Run: `npx supabase db push` sudah selesai (Task 3). Sekarang jalankan query cek via CLI:
`echo "select id from barang where id='barang-jasa-maklon';" | npx supabase db query --linked` 
Jika perintah `db query` tidak tersedia di versi CLI ini, pakai dashboard → SQL Editor dan jalankan `select id from barang where id='barang-jasa-maklon';`.
Expected: kemungkinan 0 baris (belum di-seed).

- [ ] **Step 2: Terapkan seed default ke cloud**

Pakai dashboard SQL Editor (paling andal, sudah login): buka project baru → SQL Editor → New query. Buka file `supabase/seed-default-values.sql` di repo, salin SELURUH isinya ke editor, lalu Run.
Expected: sukses tanpa error. Seed memakai `ON CONFLICT DO UPDATE/NOTHING` jadi idempoten (aman dijalankan ulang).

Alternatif CLI (bila psql tersedia & `DATABASE_URL` baru sudah dikonfigurasi di shell): `psql "<DATABASE_URL_BARU>" -f supabase/seed-default-values.sql`.

- [ ] **Step 3: Verifikasi seed**

Di SQL Editor jalankan:
`select id from barang where id='barang-jasa-maklon'; select count(*) from finance_category_definitions;`
Expected: placeholder maklon ada (1 baris), dan kategori keuangan terisi (>0).

<!-- M:T3 -->
<!-- M:T4 -->
### Task 5: Siapkan secret produksi (SESSION_SECRET & PASSWORD_ENC_SECRET)

**Tujuan:** Project baru butuh secret app yang valid. Kalau pakai secret yang sama dengan yang lama, sesi & vault kredensial tetap kompatibel. Karena cloud lama kosong, aman membuat yang baru — TAPI `PASSWORD_ENC_SECRET` harus konsisten dengan data kredensial tersimpan (di cloud baru belum ada, jadi bebas).

- [ ] **Step 1: Tentukan SESSION_SECRET (≥32 char)**

Pakai nilai yang sudah ada di `.env.local` lokal kalau owner mau konsisten, ATAU generate baru:
Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
Simpan outputnya sebagai `SESSION_SECRET` (sebut `<SESSION_SECRET>`). JANGAN tampilkan ke chat lebih dari sekali; perlakukan sebagai secret.

- [ ] **Step 2: Tentukan PASSWORD_ENC_SECRET**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Simpan sebagai `<PASSWORD_ENC_SECRET>`. Catatan: bila nanti owner mau memindahkan kredensial vault dari instance lain, secret ini harus disamakan; untuk cloud baru yang kosong, nilai baru aman.

<!-- M:T4 -->
### Task 6: Ganti environment variable LOKAL (.env.local)

**Files:**
- Modify: `.env.local` (JANGAN commit — file ini gitignored)

**Strategi:** `.env.local` saat ini menunjuk Supabase LOKAL. Owner ingin aplikasi memakai cloud baru. Tanyakan dulu mode yang diinginkan:
- (A) Lokal `npm run dev` tetap pakai Supabase LOKAL (127.0.0.1) untuk development, cloud baru hanya dipakai Vercel. → JANGAN ubah baris Supabase di `.env.local`; lewati ke Task 7. (Direkomendasikan untuk alur Tauri-first owner.)
- (B) Lokal `npm run dev` ikut pakai cloud baru. → ganti baris Supabase di `.env.local` seperti di bawah.

- [ ] **Step 1: Konfirmasi mode ke owner (A atau B)**

Tanyakan: "Untuk `npm run dev` di laptop, mau tetap pakai Supabase lokal (A) atau langsung ke cloud Singapura baru (B)?" Tunggu jawaban.

- [ ] **Step 2 (hanya bila B): Update `.env.local`**

Ganti tiga baris kredensial Supabase menjadi nilai project baru (sisakan baris lain apa adanya). Gunakan StrReplace pada `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<REF_BARU>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY_BARU>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY_BARU>
```

Dan perbarui `DATABASE_URL` / `DIRECT_URL` ke connection string project baru (dari Task 1 Step 3), serta pastikan `SESSION_SECRET`/`PASSWORD_ENC_SECRET` terisi (Task 5). Contoh bentuk (isi password dari Task 1):

```
DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@db.<REF_BARU>.supabase.co:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres:<DB_PASSWORD>@db.<REF_BARU>.supabase.co:5432/postgres?sslmode=require
PASSWORD_ENC_SECRET=<PASSWORD_ENC_SECRET>
```

- [ ] **Step 3 (hanya bila B): Verifikasi lokal**

Run: `npm run dev` lalu buka aplikasi, login, dan lakukan 1 aksi baca (mis. buka halaman Barang). Cek terminal mencetak `🌐 Supabase online - using cloud database`. Hentikan dev server setelah verifikasi (Ctrl+C). Jika error koneksi, periksa kembali URL/key.

<!-- M:T4 -->
<!-- M:T5 -->
### Task 7: Update referensi project lama di repo (link script + guard)

**Files:**
- Modify: `package.json` (script `supabase:link`)
- Modify: `scripts/_lib/guard.mjs` (`PROD_PROJECT_REFS`)

Kedua tempat ini masih mematok ref lama `fufrztzerditoctgzbcn`. Ganti ke `<REF_BARU>` agar script ops & guard keamanan mengenali project baru sebagai produksi.

- [ ] **Step 1: Update script link di package.json**

StrReplace pada `package.json`:

```
    "supabase:link": "npx supabase link --project-ref <REF_BARU>",
```

(ganti dari `--project-ref fufrztzerditoctgzbcn`).

- [ ] **Step 2: Update guard ref**

StrReplace pada `scripts/_lib/guard.mjs`:

```
const PROD_PROJECT_REFS = ["<REF_BARU>"];
```

(ganti dari `["fufrztzerditoctgzbcn"]`). Catatan: selama transisi, boleh sementara memuat KEDUA ref: `["<REF_BARU>", "fufrztzerditoctgzbcn"]` supaya guard tetap melindungi project lama sampai dihapus. Pilih yang ini bila owner belum delete project lama.

- [ ] **Step 3: Verifikasi tidak ada sisa hardcode ref lama yang relevan**

Run (pakai ripgrep): `rg -n "fufrztzerditoctgzbcn" --glob '!docs/**'`
Expected: hanya muncul di tempat yang memang disengaja (atau kosong). Jika ada di kode aktif lain, evaluasi & ganti.

- [ ] **Step 4: Type-check + commit (hanya file repo, BUKAN .env.local)**

Run: `npm run type-check`
Expected: 0 error.

```bash
git add package.json scripts/_lib/guard.mjs
git commit -m "chore(supabase): arahkan link script + guard ke project baru Singapura"
```

<!-- M:T5 -->
### Task 8: Set Environment Variables di Vercel (browser/CLI) + redeploy

**Tujuan:** Production (Vercel) memakai project Supabase baru.

- [ ] **Step 1: Buka Vercel project env settings**

Di browser (sudah login): `https://vercel.com` → pilih project gemiprint → Settings → Environment Variables. (Atau CLI: `npx vercel env ls`.)

- [ ] **Step 2: Update/replace nilai berikut untuk environment Production (dan Preview bila dipakai)**

Ganti nilai-nilai ini ke project baru:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://<REF_BARU>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<ANON_KEY_BARU>`
- `SUPABASE_SERVICE_ROLE_KEY` = `<SERVICE_ROLE_KEY_BARU>`
- `DATABASE_URL` / `DIRECT_URL` (bila ada) = connection string project baru
- Pastikan `SESSION_SECRET` (≥32 char) dan `PASSWORD_ENC_SECRET` ada (set bila belum) — app fail-fast tanpa keduanya.
- Pastikan flag tetap ada: `SYNC_ENGINE_V2=1`, `REALTIME_PULL_ENABLED=1`, `WEB_SERVER_MEDIATED_ONLY=1`, `SYNC_WAVE=1`.

Cara mengubah via CLI (per variable, ulangi tiap env): hapus lama lalu tambah baru:
`npx vercel env rm NEXT_PUBLIC_SUPABASE_URL production` kemudian `npx vercel env add NEXT_PUBLIC_SUPABASE_URL production` (tempel nilai saat diminta). Ulangi untuk anon key & service role.

KONFIRMASI ke owner sebelum langkah ini, karena mengubah production env memengaruhi situs live.

- [ ] **Step 3: Redeploy production**

Setelah env tersimpan, picu redeploy agar env baru terpakai: di dashboard Deployments → Redeploy deployment terakhir (uncheck "use existing build cache" tidak wajib). Atau CLI: `npx vercel --prod`.
Expected: build sukses.

- [ ] **Step 4: Verifikasi production**

Buka URL production, login, lakukan 1 aksi baca + 1 aksi tulis kecil (mis. tambah lalu hapus transaksi keuangan uji). Cek tidak ada error. Bila ada akses ke log Vercel (Functions/Runtime logs), pastikan muncul `🌐 Supabase online - using cloud database` dan tidak ada error koneksi/`PGRST`/auth.

<!-- M:T5 -->
<!-- M:T6 -->
### Task 9: Verifikasi end-to-end & serah terima

- [ ] **Step 1: Smoke test fungsional**

Pada environment yang dipakai owner (lokal mode B atau Vercel production):
1. Login berhasil.
2. Buka Beranda, Barang, Keuangan, Produksi/SPK — semua memuat tanpa error.
3. Buat 1 transaksi keuangan uji → tampil → hapus lagi. (memastikan tulis/hapus jalan)
4. (Opsional) Buat penjualan kecil di POS → muncul di Riwayat Penjualan.

- [ ] **Step 2: Verifikasi region (latensi)**

Konfirmasi project baru region Singapore: dashboard project → Settings → General → Region = "Southeast Asia (Singapore)". Latensi dari Indonesia mestinya turun signifikan dibanding Tokyo.

- [ ] **Step 3: Ringkasan ke owner**

Laporkan: project baru `gemiprintapp` (ref `<REF_BARU>`, Singapore) aktif, skema+seed terterap, env lokal/Vercel sudah diarahkan ke sana, dan smoke test lolos. Ingatkan langkah manual yang TERSISA untuk owner (JANGAN dilakukan agen):
- Setelah yakin 100% stabil beberapa hari: delete project lama `gemiprintaio` (Tokyo) dari dashboard.
- Lalu rename `gemiprintapp` → `gemiprintaio` di dashboard (rename tidak mengubah ref/URL, jadi tidak perlu ubah env lagi).
- Pertimbangkan rotate anon/service key bila pernah ter-paste di tempat tak aman.

<!-- M:T6 -->
<!-- M:T7 -->
<!-- M:T8 -->
## Catatan & jebakan umum

- **`db push` vs `db reset`:** ke cloud SELALU `db push` (additif). JANGAN `db reset` ke cloud — itu menghapus. `db reset` hanya untuk lokal.
- **Seed tidak ikut `db push`:** harus dijalankan manual (Task 4). Tanpa seed, transaksi maklon & kategori keuangan akan gagal/aneh.
- **Out-of-order migration:** bila `db push` menolak, pakai `--include-all`.
- **`.env.local` jangan di-commit.** Hanya `package.json` & `scripts/_lib/guard.mjs` yang masuk git di rencana ini.
- **Vercel env butuh redeploy** agar berlaku — set env saja tidak cukup.
- **Fail-fast secret:** tanpa `SESSION_SECRET` (≥32) & `PASSWORD_ENC_SECRET`, app menolak start. Pastikan keduanya ada di Vercel.
- **Jangan delete project lama dari dalam rencana ini** — itu keputusan & aksi manual owner.

<!-- M:T7 -->
<!-- M:T8 -->
