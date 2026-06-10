# Pisahkan Pengurus & Karyawan — Design Spec

Tanggal: 2026-06-10
Status: Disetujui owner (brainstorming), menunggu rencana implementasi.

## Latar belakang

Pinjaman/kasbon karyawan ternyata sudah ditangani dengan benar oleh modul Penggajian (`/penggajian`) sebagai **piutang** (`pinjaman_karyawan` + kategori `PINJAMAN_KARYAWAN`), bukan biaya. Namun form "Pegawai" lama di Pengaturan Keuangan (`TabPengurus`) masih punya section **Kasbon** dan **Bonus** yang tumpang tindih dengan modul Penggajian (komponen kompensasi tipe KOMISI/BONUS + ledger pinjaman). Dua sistem untuk hal yang sama membingungkan dan rawan salah angka.

Keputusan owner: jadikan **satu sumber kebenaran** per domain. Form lama dipangkas jadi murni **Bagi Hasil** (distribusi laba ke pengurus), dan semua hal gaji karyawan hidup di halaman Penggajian.

## Prinsip pembagian (inti)

Satu orang = satu baris `business_actors` (identitas + jabatan). Tempat tampilnya ditentukan **berdasarkan apa yang ia terima**, bukan label jabatan:

- **Pengurus** (tab di Pengaturan Keuangan): orang dengan **Bagi Hasil aktif** (`profit_share_percent` terisi). Penerima distribusi laba (ekuitas) — pemilik, investor, komisaris, manajer-partner.
- **Karyawan** (halaman Penggajian): orang dengan **komponen gaji** (Gaji Pokok/Tunjangan/Komisi/Bonus) atau saldo/riwayat kasbon. Penerima gaji.
- **Boleh muncul di dua-duanya**: mis. Manager yang dapat bagi hasil sekaligus digaji. Benar dan diinginkan.

**Aturan filter konkret (bebas-bug "orang menghilang"):**
- Pengurus tab tampil bila `profit_share_percent !== null`.
- Penggajian tampil bila `profit_share_percent === null` **ATAU** `jumlah_komponen > 0`. Karyawan baru (tanpa bagi hasil) langsung tampil walau komponen belum diisi; pengurus-murni tidak ikut; manajer-dua-peran tampil di kedua tempat.

Catatan: DB dalam tahap pengembangan dan kosong, jadi tidak ada data lama yang perlu dimigrasi.

## Bagian 1 — Form Pengurus (TabPengurus) dipangkas

- Tab "Pegawai" di Pengaturan Keuangan → **rename "Pengurus"**.
- Hapus section **Kasbon** sepenuhnya: picker kategori (checkbox), input "Keperluan harus mengandung", dan tombol quick-add kategori (`QuickAddCategoryButton`).
- Hapus section **Bonus**.
- Form orang menyisakan: **Nama, Jabatan, Bagi Hasil (%), Catatan**.
- Daftar di tab hanya menampilkan **pengurus** (yang punya bagi hasil aktif), bukan semua orang.
- Konsekuensi: form berhenti mengirim `cash_advance_categories`, `keperluan_keyword`, `bonus_percent`. `syncFormulasForActor` hanya mempertahankan kolom bagi hasil; berhenti membuat kolom kasbon/bonus per-orang di buku kas.

## Bagian 2 — Penggantian istilah "Pegawai" → "Karyawan"

- Semua teks UI yang memakai "Pegawai/pegawai" diganti **"Karyawan"** (label, judul, tombol, placeholder, komentar baru). Identifier kode/route teknis tetap demi keamanan kontrak.
- Tombol & teks di `DynamicActorSummary` ("Buka Pengaturan → Pegawai", "Pegawai Usaha", dst.) disesuaikan ke konteks **Pengurus** (panel itu kini hanya menyangkut bagi hasil pengurus).

## Bagian 3 — Pertanyaan kolom terjawab

- Section Kasbon di screenshot (rencana checkbox→radio + default + "keperluan harus mengandung") **tidak diperbaiki melainkan dihapus**; pinjaman karyawan ditangani halaman Penggajian (model piutang yang benar).
- Kolom yang tetap muncul di Pengaturan Keuangan hanya **Bagi Hasil** milik pengurus. Rincian gaji/komisi/bonus/kasbon karyawan hidup di halaman Penggajian.
- **Di luar lingkup (kandidat fase lanjut):** pinjaman berbunga. Ledger pinjaman saat ini tanpa bunga.

## Bagian 4 — Tambah Karyawan dari halaman Penggajian

- Tambah tombol **"+ Tambah Karyawan"** di header `/penggajian` (dekat "Proses Penggajian"). Empty-state juga memakai tombol ini (bukan mengarahkan ke Pengaturan).
- **Modal baru** `ModalTambahKaryawan` (pakai `ModalFormShell`, tema indigo/emerald):
  - Field: Nama, Jabatan, Catatan (opsional).
  - **Jabatan difilter**: sembunyikan grup `owner` (Pemilik/Investor, Direktur, Komisaris). Tampilkan: Manager, Supervisor, Sales, Karyawan tetap, Designer/Operator, Kasir, Kurir, Lainnya.
  - Modal hanya membuat orang (tanpa bagi hasil).
  - **Setelah simpan → langsung buka "Atur Kompensasi"** untuk karyawan baru, agar ia punya komponen gaji dan langsung tampil di daftar.
- **Simetri Pengurus:** tombol/modal "Tambah Pengurus" tetap di tab Pengurus untuk penerima bagi hasil. Dua pintu masuk jelas: Pengurus dari Pengaturan, Karyawan dari Penggajian. Orang yang dua-duanya bisa diatur dari kedua sisi (data orang sama).

## Bagian 5 — Penamaan halaman & tombol header

- **Judul halaman**: "PENGGAJIAN" → **"Karyawan"** (kartu judul gradient). Subtitle disesuaikan (mis. "Kelola komponen gaji, kasbon, dan proses penggajian tiap karyawan.").
- **Route tetap `/penggajian`** — tidak di-rename (rename route menyangkut `menuConfig.tsx`, breadcrumb, dan redirect; risiko > nilai). Label menu boleh ikut jadi "Karyawan".
- **Tombol "Proses Penggajian" dipertahankan** — ini fitur inti (jalankan payroll bulanan: hitung gaji, potong kasbon dari gaji, hasilkan slip). Tetap sebagai aksi utama di header.
- **Tombol "Muat Ulang" dihapus** — data sudah pakai SWR (`useCachedData`) yang auto-revalidate; tombol manual tidak diperlukan.

## Bagian 6 — Indonesia-kan `DynamicActorSummary.tsx`

Komponen ini masih penuh komentar/identifier bahasa Inggris. Karena kita menyentuhnya (Bagian 2), sekalian dirapikan:
- **Komentar/JSDoc** diterjemahkan ke Bahasa Indonesia baku.
- **Teks UI** disesuaikan ke konteks Pengurus + istilah baru: "Memuat ringkasan pegawai…" → "Memuat ringkasan pengurus…"; "Pegawai Usaha" → "Pengurus Usaha"; "(N pegawai)" → "(N pengurus)"; "Buka Pengaturan → Pegawai" → "Buka Pengaturan → Pengurus"; tooltip/aria "Pengaturan → Pegawai" → "Pengaturan → Pengurus".
- Empty-state: karena Kasbon & Bonus dihapus dari form, kalimat "centang bagi hasil, kasbon, atau bonus" → "atur bagi hasil" saja.
- Karena form lama tidak lagi membuat kolom kasbon/bonus, kolom **Kasbon** dan **Bonus** di tabel ringkasan ini menjadi mati untuk data baru. Tetap dipertahankan secara defensif (`hasGroup.cash_advance`/`.bonus` → kolom hanya render bila ada datanya), jadi tidak perlu dihapus; cukup biarkan auto-hilang saat tidak ada kolom grup itu.
- Identifier teknis tetap: prop `onOpenPeopleSettings`, tipe `FormulaGroup` nilai `cash_advance`/`bonus`, dll. Hanya string tampilan + komentar yang berubah.

## Catatan identifier teknis (JANGAN diubah)

Rename hanya menyentuh **teks tampilan**. Yang TETAP karena kontrak/identifier: tabel DB `pegawai` & `peran_pegawai`, route `/penggajian` & `/api/business-actors`, tipe/inteface (`PegawaiRow`, `BusinessActor`), prop (`onOpenPeopleSettings`), kode migrasi, dan nilai enum (`cash_advance`, `bonus`, `staff`, dll).

## File terdampak (perkiraan)

- `src/components/finance/pengaturan-keuangan/TabPengurus.tsx` — pangkas Kasbon+Bonus, filter daftar ke pengurus, rename ke "Pengurus", istilah Karyawan.
- `src/components/finance/PengaturanKeuanganModal.tsx` — label tab "Pegawai" → "Pengurus".
- `src/components/finance/DynamicActorSummary.tsx` — teks/tombol ke konteks Pengurus + istilah.
- `src/app/penggajian/page.tsx` — judul "Karyawan", tombol "+ Tambah Karyawan" + empty-state, hapus tombol "Muat Ulang", pertahankan "Proses Penggajian".
- `src/app/penggajian/ModalTambahKaryawan.tsx` — **baru**.
- `src/app/penggajian/actions.ts` — action create karyawan (guarded) bila belum ada.
- `src/lib/services/business-actor-service.ts` / `formula-service.ts` — pastikan create tanpa bagi hasil tidak membuat kolom rumus.
- `src/components/menuConfig.tsx` — label menu "Penggajian" → "Karyawan" (route `/penggajian` tetap).
- Sapuan istilah "Pegawai"→"Karyawan" di komponen terkait.

## Verifikasi

`npm run type-check` (0 error) → `npm run build` → `npx jest` untuk service yang tersentuh. Uji manual di browser: tab Pengurus hanya bagi hasil; tambah karyawan dari Penggajian membuka Atur Kompensasi; buku kas tetap konsisten.
