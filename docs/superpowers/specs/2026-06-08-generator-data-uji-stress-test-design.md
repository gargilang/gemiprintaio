# Spec: Generator Data Uji untuk Stress Test gemiprint

Tanggal: 2026-06-08
Status: Disetujui (menunggu review tertulis)

## Konteks

Toko gemiprint (percetakan, ~2-5 pengguna) selama 2 tahun mencatat keuangan di Google Sheet "Buku Kas": satu sheet per bulan, tiap baris = satu pergerakan kas dengan kolom input `IDTRANS, TANGGAL, KATEGORI, DEBIT, KREDIT, KEPERLUAN` dan kolom rumus turunan (OMZET, SALDO, LABA, bagi hasil, kasbon). Pengisi sheet adalah pegawai dengan kemampuan pembukuan terbatas, sehingga catatan bersifat level-kas dan TIDAK ber-item / tidak per-faktur.

Aplikasi gemiprint sudah di tahap akhir (tinggal poles UI/UX). Pemilik baru me-reset Supabase lokal dan ingin (a) stress test fitur aplikasi, dan (b) kelak memigrasi data Google Sheet.

Analisis 3 sheet (Juni 36 baris, Mei 260, Mar-Apr 426) memastikan: data sumber tidak menyimpan nama pelanggan/rincian item/HPP per penjualan. Contoh "TF Boca Junior" atau "Omset Cash - 01 Mei" tidak bisa direkonstruksi jadi transaksi ber-item tanpa mengarang. Maka:
- **Migrasi nyata** (kelak) = perlakukan buku kas apa adanya -> modul Keuangan (1:1). Bukan ruang lingkup spec ini.
- **Stress test** (spec ini) = butuh volume transaksi ber-item realistis, yang TIDAK harus data asli. Bahan dibuat sintetis.

Pola dagang yang diekstrak untuk realisme generator: dominan OMZET (banner, form, cetakan, neon box, lanyard), SUPPLY campuran maklon (cetak laser, stiker meteran, jilid spiral, albatros) + bahan (nota NCR, lem, blanko) + kurir (Lalamove), BIAYA operasional (bensin, kopi, PAM, internet, kasbon). Maklon = 80-90% omzet.

## Tujuan

Membuat generator data uji (sintetis) yang menjalankan transaksi ber-item lewat jalur produksi aplikasi, untuk stress test fitur dan stabilitas — terutama jalur paling kritis & paling banyak dipakai: maklon, stok roll (banner butuh dimensi), AVCO, dan hutang/piutang NET30.

Kriteria sukses:
- Generator bisa membuat master data uji + sejumlah transaksi (skala kecil ~20 untuk validasi, skala besar ratusan untuk uji performa) tanpa error.
- Semua transaksi lewat endpoint/server action produksi (sama seperti dipakai UI), sehingga bug yang muncul = bug yang akan dialami pengguna nyata.
- Data uji bertanda token unik per-run dan bisa dibersihkan total, mengembalikan DB ke kondisi bersih.
- Hasil deterministik (seed acak tetap) supaya bisa diulang untuk membandingkan.

## Non-goal (di luar ruang lingkup)

- Importer buku kas -> modul Keuangan (Jalur 2 / migrasi nyata). Akan jadi spec terpisah saat pemilik siap migrasi.
- Rekonstruksi transaksi historis nyata dari buku kas (sudah disimpulkan mustahil tanpa mengarang).
- Mengubah fitur legacy "Impor CSV" buku kas dan "Tutup Buku" — dianggap legacy, tidak dipakai, tidak disentuh.
- Perbaikan UI/UX (fokus terpisah).

## Temuan kritis (bug ditemukan sebelum tes berjalan)

Placeholder maklon `barang-jasa-maklon` + harga satuan `harga-jasa-maklon-pcs` di-seed di SQLite (desktop, `src/lib/db-sqlite-migrations.ts` baris ~1756) TAPI TIDAK ada di Supabase. Migrasi `supabase/migrations/20260523230000_maklon_support.sql` baris 106-107 secara eksplisit menghapus placeholder dari seed default ("Create it manually if needed").

Padahal `src/lib/services/pos-mutations.ts` (~baris 618-620) mematok keras `barang_id: "barang-jasa-maklon"` dan `harga-jasa-maklon-pcs` untuk setiap baris maklon. Akibatnya: di web (Supabase) yang baru di-reset, SETIAP transaksi maklon akan gagal foreign key — dan maklon = 80-90% omzet.

Perbaikan (jadi langkah pertama implementasi): seed placeholder maklon di Supabase, sinkron dengan SQLite. Patuhi iron rule schema: tambahkan ke `supabase/seed-default-values.sql` (atau migrasi additive baru ber-`ON CONFLICT DO NOTHING`), `database/sqlite-schema.sql` bila perlu, dan pastikan konsisten dengan runtime SQLite yang sudah ada. Verifikasi placeholder ada sebelum generator membuat transaksi maklon (fail-fast dengan pesan jelas bila hilang).

## Arsitektur

Titik eksekusi: **mimik produksi**. Generator adalah skrip Node (`scripts/uji/`) yang berbicara ke aplikasi lewat HTTP ke localhost (endpoint/server action yang sama dipakai UI), BUKAN memanggil service layer langsung. Prasyarat: `npm run dev` jalan + Supabase lokal jalan.

Alur:
1. **Login** sekali sebagai admin (`gemi` / kredensial dari `.env.local`), simpan session/JWT (cookie) untuk semua request berikutnya. Auth-guard & `dibuat_oleh` terisi benar — persis seperti browser.
2. **Primitif** = fungsi pembungkus tipis per jenis transaksi, masing-masing menembak satu endpoint produksi:
   - `buatPenjualan(...)` -> POST jalur POS (`/api/pos/sales`)
   - `buatPembelian(...)` -> POST jalur pembelian (`/api/pembelian`)
   - `bayarPiutang(...)`, `bayarHutang(...)` -> endpoint pelunasan terkait
   - master data: `buatPelanggan/Vendor/Barang` -> endpoint masing-masing
   Maklon TIDAK butuh primitif terpisah: ia satu baris item `tipe_item=MAKLON` di dalam `buatPenjualan`, yang otomatis memicu PO vendor di sisi server (sesuai `pos-mutations.ts`).
3. **Skenario** = lapisan yang memilih primitif + parameter realistis (dari pola dagang) untuk menghasilkan transaksi.

Pemisahan primitif (jarang berubah) vs skenario (data) membuat penambahan kasus uji tidak menyentuh kode mesin. Karena lewat endpoint nyata, kalau ada endpoint yang belum ada/!bermasalah, itu temuan stress test yang langsung diperbaiki di aplikasi.

## Master data uji

Setelah reset, seed Supabase hanya: admin, kategori/subkategori barang, satuan, kategori keuangan. Belum ada barang, vendor, pelanggan, varian roll. Urutan generator:

1. Perbaiki + verifikasi placeholder maklon (lihat Temuan).
2. Buat master data uji lewat endpoint produksi (bertoken `[UJI:...]`):
   - Pelanggan: beberapa (mis. 5-10) nama realistis.
   - Vendor SUPPLIER (pemasok bahan) + vendor SUBKONTRAKTOR (percetakan rekanan maklon) — `tipe_vendor` harus benar agar picker maklon menemukannya.
   - Barang: minimal satu banner roll (`butuh_dimensi_status=1`, satuan m2, dengan varian roll), satu barang lembaran biasa (lacak inventori), satu jasa.
3. Baru menghasilkan transaksi.

Master data juga bertoken supaya ikut terhapus saat bersih-bersih.

## Skenario stress test

Menargetkan titik rawan, lewat endpoint produksi:

- **Penjualan maklon** (porsi terbesar, ~80%): banner/lanyard/stiker/nota/jilid -> item `tipe_item=MAKLON` dengan `vendor_subkontrak_id`, `biaya_subkontrak`, `metode_bayar_vendor` CASH & NET30. Verifikasi: PO vendor auto-terbentuk, link balik `pembelian_id_terkait` terisi, hutang NET30 terbentuk, kas/HPP benar.
- **Penjualan banner roll**: item butuh dimensi (input Lebar x Panjang, qty roll integer >=1). Verifikasi pengurangan stok roll via varian + AVCO + `inventory_movements` terisi.
- **Pembelian bahan**: harga beli beragam untuk menguji AVCO bergerak. CASH & NET30 (hutang).
- **Pelunasan piutang & hutang**: `payDebt` / terima piutang, lalu sebagian di-revert untuk menguji jurnal pembalik + sinkronisasi `keuangan` <-> `hutang.sisa_hutang` <-> `pembelian.jumlah_dibayar`.
- **Pembatalan (VOID)**: sebagian penjualan/pembelian di-void untuk menguji jurnal pembalik stok + tampilan VOID (yang baru dibuat).
- **Volume bertingkat**: parameter `--skala kecil|besar`. Kecil ~20 transaksi (validasi fungsional); besar ratusan (uji performa, coalesce recalculation, cache SWR, N+1).

Distribusi jenis transaksi mengikuti pola nyata (mayoritas omzet+maklon, sebagian bahan, sedikit biaya/pelunasan).

## Keamanan & idempotensi

- Setiap data uji (master + transaksi) menyimpan token unik per-run di field catatan/keterangan: `[UJI:run-<timestamp>]`. Mudah dicari, difilter, dan dibersihkan.
- Skrip login sebagai admin nyata; kredensial dibaca dari `.env.local` (jangan hardcode, jangan commit). Token/cookie disimpan hanya di memori proses.
- Perintah bersih-bersih (`--bersihkan run-<timestamp>` atau `--bersihkan-semua-uji`): membatalkan/menghapus seluruh data uji satu run lewat jalur void/delete yang benar (bukan DELETE mentah ke tabel) supaya stok & kas ikut konsisten. Mengembalikan DB ke kondisi bersih.
- Seed acak tetap (mis. `--seed 42`) -> hasil deterministik & dapat diulang.
- Hanya dijalankan terhadap localhost + Supabase lokal. Ada guard menolak berjalan bila target bukan localhost (cegah tak sengaja kena cloud).

## Struktur file

```
scripts/
  uji/
    index.mjs           # entry CLI: parse --skala, --seed, --bersihkan; orkestrasi
    klien-http.mjs      # login + wrapper fetch (cookie/JWT, base URL, guard localhost)
    primitif.mjs        # buatPelanggan/Vendor/Barang, buatPenjualan, buatPembelian, bayarPiutang/Hutang
    skenario.mjs        # pilih primitif + parameter realistis dari pola dagang
    pola.mjs            # daftar contoh pekerjaan/nominal hasil ekstrak sheet (banner, maklon, dst)
    bersihkan.mjs       # cari token [UJI:run-...] lalu void/hapus lewat jalur benar
  migrasi/              # SUDAH ADA: skrip baca/ringkas xlsx (referensi, bukan bagian generator)
    data/laporan-keuangan.xlsx
```

Catatan: skrip `scripts/migrasi/*` yang sudah dibuat (baca-sheet, ringkas-bukukas, ringkas-multi) dipertahankan sebagai alat inspeksi & referensi pola; bukan bagian eksekusi generator.

## Risiko & mitigasi

- **Endpoint butuh field yang tak terduga / berbeda dari ekspektasi** -> bangun primitif satu per satu di skala kecil dulu, verifikasi tiap jenis sebelum scale-up. Justru ini tujuan stress test.
- **Placeholder maklon hilang di Supabase** -> diperbaiki di langkah pertama; generator fail-fast bila masih hilang.
- **Tak sengaja kena Supabase cloud** -> guard wajib localhost; kredensial dari `.env.local`.
- **Data uji mengotori DB** -> token per-run + perintah bersih-bersih lewat jalur void/delete yang benar.
- **Period-closed guard menolak tanggal** -> generator pakai tanggal dalam periode terbuka (mayoritas "hari ini"/periode berjalan).
- **Roll/dimensi salah hitung** -> ikuti iron rule: input Lebar x Panjang, qty roll integer >=1, jumlah m2 = roll x panjang x lebar.

## Verifikasi (sebelum "selesai")

`npm run type-check` (0 error) -> `npm run build`. Skrip generator: `node --check` per file. Untuk tiap jenis transaksi yang dibuat, verifikasi efeknya di DB/laporan (stok, AVCO, hutang/piutang, kas, PO maklon terbentuk). Bersih-bersih harus mengembalikan DB bersih (cek saldo & stok kembali ke baseline).
