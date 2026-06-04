# Panduan Bahasa Gemiprint

Dokumen ini adalah sumber acuan untuk menyeragamkan bahasa aplikasi. Aturan ini berlaku untuk pekerjaan baru dan untuk migrasi bertahap dari kode lama.

## Keputusan standar

Gemiprint memakai standar **Indonesia-first** untuk semua artefak milik aplikasi:

- UI: label, tombol, placeholder, toast, dialog, validasi, empty state, report, print/PDF, dan error yang dibaca pengguna.
- Struktur domain: folder route, nama API milik aplikasi, nama komponen, nama service/domain, dan nama script internal.
- Dokumentasi internal di `docs/`.
- Komentar/JSDoc application-owned di `src/`, `flutter/lib/`, `scripts/`, dan `src-tauri/src/`.
- Tabel/kolom database domain dan migration baru.

English hanya boleh untuk hal yang memang bukan milik domain aplikasi:

- Framework/library/protokol: `src`, `page.tsx`, `route.ts`, React props, SQL keywords, npm package names, HTTP method names, generated/vendor code.
- Tipe bawaan bahasa/framework: `string`, `number`, `Promise`, `Record`, `Map`, `Error`, `Request`, `Response`.
- Migrasi lama yang sudah pernah diterapkan. Jangan edit migration lama hanya untuk mengganti bahasa.

## Prinsip penting

- UI selalu Bahasa Indonesia karena dipakai oleh staf operasional.
- Nama baru harus konsisten satu bahasa. Jangan membuat nama campur seperti `PurchaseKategoriModal`.
- Kontrak deployed tidak boleh di-rename langsung. Buat alias kompatibilitas, update consumer, verifikasi, lalu hapus alias lama setelah aman.
- Rename database harus lewat migration baru dan harus sinkron dengan Supabase, SQLite template, runtime migration, sync config, service query, API, web, Tauri, dan Flutter.
- Kalau ragu antara istilah teknis English dan Indonesia, pilih istilah Indonesia yang paling jelas untuk operator toko.

## Glossary utama

| English lama | Standar Indonesia | Catatan |
|---|---|---|
| Dashboard | Beranda | UI dan route baru. |
| Customer | Pelanggan | Tipe/komponen/API/domain. |
| Material | Barang | UI sudah dominan "Data Barang". |
| Vendor | Vendor | Dipakai sebagai istilah bisnis Indonesia; jangan campur dengan `supplier` kecuali ada keputusan baru. |
| Purchase | Pembelian | Transaksi pembelian. |
| Purchase Order | Pesanan Pembelian | Jangan disingkat "PO" di UI utama. |
| Sale | Penjualan | Termasuk invoice dan POS. |
| Sales Return | Retur Penjualan | Route/domain baru. |
| Purchase Return | Retur Pembelian | Route/domain baru. |
| Debt | Hutang | Untuk hutang pembelian/vendor. |
| Receivable | Piutang | Untuk piutang penjualan/pelanggan. |
| Inventory | Inventori | Boleh "Stok" jika konteksnya jumlah barang. |
| Stock Adjustment | Penyesuaian Stok | UI/menu. |
| Stock Opname | Opname Stok | Istilah operasional umum. |
| Movement Ledger | Riwayat Mutasi Stok | UI/menu. |
| Finance | Keuangan | Modul kas/buku kas. |
| Cashbook | Buku Kas | UI dan docs. |
| Reports | Laporan | Semua report user-facing. |
| Settings | Pengaturan | UI/route/domain baru. |
| User | Pengguna | UI dan domain user management. |
| Auth | Autentikasi | UI boleh "Login" karena umum. |
| Sync | Sinkronisasi | UI/docs; nama protokol internal lama dimigrasi bertahap. |
| Audit Log | Log Audit | UI/menu. |
| Production | Produksi | Domain SPK/produksi. |
| Quotation | Penawaran | Domain penawaran. |
| Finishing | Finishing | Istilah produksi yang umum dipakai staf; tetap konsisten. |
| Walk-in / Walk-in Customer | Pelanggan Umum | Tabel sempit boleh disingkat "Umum". |
| Invoice | Faktur | UI dan template cetak. Field DB `nomor_invoice` belum di-rename (Fase 5). |
| Draft (UI label) | Draf | Hanya tampilan UI; nilai enum DRAFT di DB tetap. |
| Override | Penggantian / Diganti manual | Hindari "di-override". |
| Import | Impor | UI dan toast. |
| Export | Ekspor | UI dan toast. |
| Range | Rentang | Konteks rentang nomor/tanggal. |
| Upload | Unggah | UI dan instruksi. |
| Download | Unduh | UI dan instruksi. |
| Refresh | Muat Ulang | Tombol dan tooltip. |
| Reset to Default | Kembali ke Bawaan | Tombol pengaturan. |
| Default | Bawaan | UI umum. Khusus "default unit/option" pakai "Utama". |
| Preview | Pratinjau | UI tombol/tooltip. |
| Floating window | Jendela mengambang | Tooltip/aria-label. |
| Generate | Buat | Tombol dan toast. |
| Generating... | Membuat... | State loading tombol. |
| Draft | Draf | Sudah baku KBBI; jangan pakai "draft". |
| Manager | Manajer | Role/jabatan UI. |
| Staff | Staf | Role/jabatan UI. |
| User (role) | Pengguna | Pilihan role di form. |
| All-in-One Management System | Sistem Manajemen Terpadu | Footer/marketing. |
| Professional Printing Services | Layanan Percetakan Profesional | Header cetak/PDF. |
| Toggle ON | Aktifkan otomatis | Form pengaturan. |
| Window (UI) | Jendela | Tombol "Tutup Jendela", judul jendela. |

## Pola penamaan

- Komponen React: `ModalReturPembelian`, `TabelSuratJalan`, `PanelLaporanPpn`.
- Hook/helper milik aplikasi: `gunakanDataCache` hanya jika dibuat baru dan benar-benar domain app; hook framework yang sudah mapan seperti `useCachedData` boleh tetap sampai fase rename khusus.
- Route web baru: `/pelanggan`, `/barang`, `/pembelian`, `/retur-pembelian`, `/retur-penjualan`, `/pengaturan`, `/laporan`, `/beranda`.
- API baru: `/api/pelanggan`, `/api/barang`, `/api/pembelian`, `/api/laporan`, `/api/pengguna`.
- Tabel baru: gunakan snake_case Bahasa Indonesia, misalnya `pesanan_pembelian`, `item_pesanan_pembelian`, `mutasi_stok`.
- Kolom baru: gunakan snake_case Bahasa Indonesia, misalnya `dibuat_pada`, `diperbarui_pada`, `jumlah_roll`, `nomor_faktur`.

## Larangan

- Jangan membuat nama campur: `PurchaseKategoriModal`, `MaterialRusakModal`, `CustomerPiutangTable`.
- Jangan mengubah migration lama yang sudah applied hanya untuk rename.
- Jangan mengganti UI Indonesia menjadi English karena nama kode masih English.
- Jangan menghapus route/API lama sebelum semua consumer web, Flutter, Tauri, sync, docs, dan test pindah ke alias baru.
- Jangan membuat mode bilingual baru (i18n) hanya untuk UI. Standar internal adalah Bahasa Indonesia. Mode bilingual hanya boleh ada untuk artefak yang memang dipakai oleh pihak luar (mis. brief generator AI yang dipakai vendor desain).
- Jangan campur ejaan baku Indonesia dengan setengah English: pilih `Impor`, bukan `Import`; `Ekspor`, bukan `Export`; `Pratinjau`, bukan `Preview`; `Unggah`, bukan `Upload`; `Unduh`, bukan `Download`; `Muat Ulang`, bukan `Refresh`.
- Jangan singkat istilah operasional di UI: `PO` selalu jadi `Pesanan Pembelian`, `SJ` jadi `Surat Jalan`, `SPK` boleh tetap karena akronim baku produksi.

## Keputusan tertunda

- (Tidak ada keputusan UI yang tertunda. Standardisasi `Invoice` -> `Faktur` sudah dieksekusi di Fase 1 batch ketiga untuk lapisan UI dan template cetak. Field database `nomor_invoice`, identifier kode (`walkInFaktur`, dll), dan komentar JSDoc Inggris sengaja ditahan untuk Fase 2/3/5 supaya tidak menabrak kontrak deployed.)

## Checklist sebelum selesai

- Jalankan audit awal: `npm run audit:bahasa`.
- Untuk UI: cek menu, breadcrumb, title, tombol, tooltip/title, placeholder, empty state, toast, dialog, print/PDF, dan kolom laporan.
- Untuk kode: cek nama file, komponen, props domain app, service, action, route, API, dan komentar.
- Untuk database: cek Supabase migration baru, `supabase/schema.sql`, `database/sqlite-schema.sql`, `src/lib/db-unified.ts`, `src/lib/sync-config.ts`, dan `src-tauri/src/sync.rs`.
- Update [progres-seragam-bahasa.md](./progres-seragam-bahasa.md) setiap selesai fase atau batch besar.
