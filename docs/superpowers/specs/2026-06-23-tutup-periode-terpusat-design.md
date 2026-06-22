# Desain Tutup Periode Terpusat

## Tujuan

Menjadikan `Pengaturan > Umum > Tutup Periode` sebagai satu-satunya workflow resmi untuk tutup bulan, mengikuti praktik akuntansi yang benar: periode lama tetap bisa dilihat lewat laporan dan daftar transaksi berbasis tanggal, tetapi tidak bisa diubah sembarangan setelah ditutup.

Workflow lama `Tutup Buku`, `Pilih Arsip Bulan`, `Restore Arsip`, `Arsip Kas`, dan `Impor CSV` akan dipensiunkan karena berasal dari masa ketika `Keuangan` adalah satu-satunya modul. Workflow lama itu memakai `label_arsip` dan `diarsipkan_pada` untuk menyembunyikan baris kas dari tampilan utama, sedangkan sistem sekarang sudah punya `Laporan`, POS, Pembelian, Inventori, Penggajian, dan `accounting_periods`.

## Keputusan Desain

Pendekatan yang dipilih adalah **periode akuntansi sebagai sumber kebenaran**.

Artinya:

- `Tutup Periode` mengunci bulan melalui tabel `accounting_periods`.
- Data transaksi tidak dihapus, tidak dipindah, dan tidak diarsipkan ulang.
- Riwayat penjualan, pembelian, kas, inventori, hutang, dan piutang tetap dilihat lewat `Laporan` dengan rentang tanggal.
- Halaman `Keuangan` menjadi area kerja bulan berjalan, bukan tempat membuka arsip.
- `Arsip Kas` di `Laporan` dihapus karena duplikat dengan `Laporan Kas` berbasis tanggal.
- `Impor CSV` dihapus dari `Keuangan` karena workflow kas sekarang harus masuk dari transaksi aplikasi, bukan mengganti buku kas massal dari file.

Alternatif yang ditolak:

- **Tetap pakai Tutup Buku dan Tutup Periode bersamaan.** Ini membingungkan karena satu aksi menyembunyikan kas, satu aksi mengunci periode, dan keduanya bisa tidak sinkron.
- **Memindahkan Tutup Buku ke Laporan.** Ini tetap membawa konsep arsip kas lama dan tidak cocok dengan pola akuntansi modern.
- **Menghapus data bulan lama saat tutup bulan.** Ini salah untuk akuntansi, berisiko tinggi, dan membuat audit serta laporan historis rusak.

## Alur Pengguna

Alur akhir bulan yang diinginkan:

1. Owner membuka `Laporan`.
2. Owner memilih rentang tanggal bulan yang akan dicek, misalnya `2026-05-01` sampai `2026-05-31`.
3. Owner meninjau `Laporan Kas`, `Laba Rugi`, `Margin Penjualan`, `Hutang & Piutang`, dan data terkait.
4. Owner membuka `Pengaturan > Umum > Tutup Periode`.
5. Owner memilih bulan dan tahun, menulis catatan bila perlu, lalu menutup periode.
6. Setelah periode tertutup, transaksi bertanggal bulan itu tetap terlihat di laporan, tetapi mutation yang mengubah periode tertutup ditolak oleh guard periode.
7. Bulan baru dipakai seperti biasa. `Keuangan` fokus ke bulan berjalan.

Jika ada koreksi setelah tutup periode, owner/manager harus memakai workflow `Buka kembali` dengan alasan. Ini lebih sesuai dengan praktik audit daripada `Restore Arsip`.

## Perubahan UI

### Halaman Keuangan

Hapus workflow lama dari toolbar:

- `Tutup Buku`
- `Pilih Arsip Bulan`
- `Restore Arsip`
- `Kembali ke Aktif`
- `Impor CSV`

Hapus modal yang hanya dipakai oleh workflow tersebut:

- `ModalTutupBuku`
- `ModalPilihBulan`
- `ModalImporCsv`

`Keuangan` tetap memiliki fungsi harian yang relevan:

- tambah transaksi kas manual
- edit transaksi yang diizinkan
- override manual yang sudah ada
- filter kategori
- pengaturan rumus/kategori/pengurus

Untuk memberi rasa "bulan baru", daftar kas di `Keuangan` tidak boleh bergantung lagi pada arsip. Endpoint daftar kas perlu mengembalikan transaksi bulan Jakarta berjalan saja, dari tanggal pertama sampai tanggal terakhir bulan itu. Ringkasan kartu tetap memakai metrik sistem saat ini supaya saldo dan nilai kumulatif tidak kehilangan konteks historis.

### Halaman Laporan

Hapus report type `Arsip Kas`.

`Laporan Kas` menjadi jalur resmi untuk melihat kas bulan lama. Pengguna memilih tanggal awal dan akhir, lalu memuat laporan.

Tidak ada lagi alur `label_arsip` atau `diarsipkan_pada` di UI laporan.

### Halaman Pengaturan

`PeriodCloseTab` tetap menjadi pusat close. Copy perlu ditegaskan:

- Tutup periode mengunci mutasi di bulan itu.
- Data lama tetap bisa dilihat lewat `Laporan`.
- Untuk koreksi, gunakan `Buka kembali` dengan alasan.

Desain ini tidak menambahkan wizard/checklist penuh dulu. Checklist month-end yang lebih lengkap bisa dibuat nanti setelah workflow dasar bersih dan tidak ambigu.

## Data dan Backend

Tidak perlu schema baru.

Tetap pakai:

- `accounting_periods`
- `closePeriod`
- `reopenPeriod`
- `isDateInClosedPeriod`
- guard Postgres `assert_period_open`

Kolom lama `label_arsip` dan `diarsipkan_pada` di `keuangan` tidak perlu dihapus sekarang karena itu deployed contract dan bisa masih berisi data lama. Namun workflow baru tidak boleh menulis ke kolom itu lagi.

Kode archive/import yang sudah tidak punya caller dapat dihapus:

- server action archive/import di `src/app/keuangan/actions.ts`
- action arsip di `src/app/laporan/actions.ts`
- service `getArchivedPeriods`, `archiveCashbook`, `restoreArchivedTransactions`, dan `getFinancialReport` bila tidak ada caller tersisa
- API route `/api/cashbook/archive*`
- API route `/api/cashbook/import`
- API route `/api/laporan/financial`
- route print `/laporan/financial/print`
- helper Supabase archive di `src/lib/server-data-supabase.ts`
- CSV import helper di `src/lib/services/finance-service.ts` bila tidak dipakai lagi

Penghapusan tidak boleh menghapus data database.

## Error Handling

Close period yang sudah tertutup tetap menampilkan error ramah.

Mutation bertanggal periode tertutup tetap ditolak lewat guard yang sudah ada. Pesan harus menjelaskan bahwa periode sudah ditutup dan pengguna harus membuka periode dulu atau membuat koreksi di periode berjalan bila workflow itu tersedia.

Jika laporan tidak menemukan data untuk rentang tanggal, tampilkan empty state sebagai laporan kosong, bukan error arsip.

## Testing

Verifikasi minimal:

- `npm run type-check`
- `npm run build`
- tes service laporan yang relevan bila ditambahkan atau diubah

Area yang perlu diuji:

- `Keuangan` tidak lagi mengimpor komponen/modal archive/import.
- Toolbar `Keuangan` tidak lagi menampilkan tombol lama.
- `Laporan` tidak lagi menampilkan `Arsip Kas`.
- `Laporan Kas` tetap bisa memuat transaksi rentang tanggal lama.
- `Tutup Periode` tetap bisa menutup dan membuka kembali periode.
- Route/API yang dihapus tidak meninggalkan import rusak.

## Non-Goal

Pekerjaan ini tidak membuat modul akuntansi lengkap seperti jurnal umum, buku besar formal, neraca saldo, atau checklist rekonsiliasi bank. Itu bisa menjadi fase berikutnya setelah close period tunggal sudah bersih.

Pekerjaan ini juga tidak menghapus kolom lama dari database karena kolom itu adalah kontrak yang sudah pernah dipakai. Cleanup schema bisa dilakukan kemudian dengan migrasi terpisah bila benar-benar diperlukan.
