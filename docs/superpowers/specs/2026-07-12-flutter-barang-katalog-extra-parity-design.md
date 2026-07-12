# Flutter Data Barang dan Katalog Extra Parity Design

## Ringkasan

Spec ini mendesain penyelarasan Flutter setelah commit Flutter terakhir yang ditemukan di git history:

- Commit terakhir yang menyentuh `flutter/`: `cec0a5d152426dc3460a96bc927522cc45e8ae3e`
- Tanggal: `2026-07-04 02:14:00 +1000`
- Judul: `feat: struk/faktur/SPK — qty lembar + ukuran, biaya per item, Sisa/Kembalian dinamis`

Setelah commit itu, perubahan web yang relevan untuk halaman Flutter saat ini adalah:

- `2026-07-04 06:07` memperbesar ukuran font/input di UI web, termasuk Data Barang dan Katalog Extra.
- `2026-07-06 14:16` Data Barang menampilkan error hapus yang ramah saat barang dipakai sebagai komponen rakitan/BOM.
- `2026-07-04 03:45` sampai `2026-07-12 10:31` Katalog Extra dibuat dan disempurnakan: CRUD, kategori, vendor/HPP default, metode bayar `TRANSFER`, pending Vendor/HPP reconcile, popularitas otomatis, dan item berdimensi harga per m2.

Mobile app tetap lite companion. Jadi targetnya bukan menyalin semua aksi web, melainkan membuat halaman Flutter yang sudah ada dan halaman baru Katalog Extra cukup berguna untuk kerja cepat dari ponsel.

## Tujuan

1. Selaraskan halaman Flutter `Data Barang` dengan perubahan web yang berdampak pada halaman mobile yang sudah ada.
2. Tambahkan halaman Flutter `Katalog Extra` dengan CRUD sederhana dan pending Vendor/HPP reconcile.
3. Pertahankan pola Flutter saat ini: Material 3, Riverpod service provider, `ApiClient`, JWT Bearer, list + search + bottom sheet/page form, loading/empty/error state, pull-to-refresh.
4. Hindari fitur berat yang tidak cocok untuk mobile, seperti riwayat stok penuh, adjustment stok, catat rusak, dan konversi roll.

## Non-Tujuan

- Tidak membuat halaman inventori lanjutan di Flutter.
- Tidak menyalin tabel desktop web ke Flutter.
- Tidak mengubah skema database kecuali route API tambahan untuk expose fitur yang sudah ada di service server.
- Tidak mengubah kontrak legacy web route.
- Tidak commit otomatis; dokumen ini dan plan boleh dibuat, eksekusi/commit mengikuti permintaan owner berikutnya.

## Pendekatan yang Dipilih

Pendekatan yang dipilih adalah **parity selektif mobile**:

- Data Barang Flutter tetap satu halaman kartu dengan search, filter ringan, dan form yang sudah ada.
- Katalog Extra Flutter menjadi halaman baru di menu `Penjualan`, memakai list kartu, search, filter kategori/status, form tambah/edit, hapus, dan section pending Vendor/HPP.
- Reconcile pending Vendor/HPP memakai API route baru karena Flutter tidak bisa memanggil Next.js server action.

Alternatif yang ditolak:

- **Full web parity:** terlalu berat untuk mobile dan bertentangan dengan prinsip Flutter lite companion.
- **Read-only Katalog Extra:** tidak cukup karena perubahan web utama adalah admin CRUD dan queue pending Vendor/HPP.
- **Menunda reconcile pending ke web saja:** membuat mobile tidak bisa menyelesaikan workflow maklon yang sengaja ditambahkan ke Katalog Extra.

## Desain Data Barang Flutter

File yang sudah ada:

- `flutter/lib/features/materials/materials_page.dart`
- `flutter/lib/features/materials/material_form_dialog.dart`
- `flutter/lib/models/material_item.dart`
- `flutter/lib/services/materials_service.dart`

Perubahan yang direncanakan:

- Kartu barang menampilkan label produk jual menggunakan `namaProdukJual` jika ada, fallback ke `nama_satuan`, selaras web.
- Kartu barang menampilkan maksimal dua produk jual, lalu teks ringkas `+N produk jual lainnya`.
- Tampilkan HPP per satuan dasar dari `averageCostPerBaseUnit`.
- Tampilkan badge `No Tracking`, badge `Dimensi`, dan badge `Stok Menipis` bila relevan.
- Tambahkan filter chip sederhana: `Semua`, `Dilacak`, `Dimensi`, `Stok Menipis`.
- Saat hapus gagal, tampilkan pesan `ApiException.message` apa adanya. Route web sudah mengembalikan pesan ramah; Flutter cukup tidak menggantinya dengan pesan generik.
- Ukuran teks utama dinaikkan sedikit agar selaras dengan pembesaran font web tanpa mengubah karakter mobile app.

Hal yang tidak dibawa:

- `Riwayat Stok`, `Adjustment Stok`, `Catat Rusak`, dan `Konversi Roll` tidak ditambahkan ke Flutter pada fase ini.

## Desain Katalog Extra Flutter

Halaman baru:

- Route: `/katalog-extra`
- Menu: grup `Penjualan`, setelah `Riwayat Penjualan`
- Label UI: `Katalog Extra`
- Akses: `RoleGroups.fullStaff` untuk halaman; mutasi tetap mengikuti guard API server `requireAdminOrManager` atau `requireOperationalRole`.

Model baru `KatalogMaklon`:

- `id`
- `namaProduk`
- `namaSatuan`
- `hargaJualDefault`
- `biayaSubkontrakDefault`
- `vendorSubkontrakIdDefault`
- `metodeBayarVendorDefault`: `CASH | TRANSFER | NET30`
- `kategori`
- `kategoriId`
- `kategoriNama`
- `populerStatus`
- `butuhDimensiStatus`
- `catatanInternal`
- `isAktif`
- `urutan`
- `dibuatPada`
- `diperbaruiPada`

Service baru `KatalogMaklonService`:

- `getAll({bool includeInactive = true, bool forceRefresh = false})`
- `create(Map<String, dynamic> body)`
- `update(String id, Map<String, dynamic> body)`
- `delete(String id)`
- `getPending({bool forceRefresh = false})`
- `reconcilePending(String itemPenjualanId, Map<String, dynamic> body)`

Halaman list:

- Search berdasarkan `namaProduk`.
- Filter chip: `Semua`, `Aktif`, `Non-Aktif`, `Pending`.
- Filter kategori dari data `kategori` / `kategoriNama`.
- Kartu menampilkan nama produk, kategori, satuan, harga jual, HPP, vendor, metode bayar, badge aktif/nonaktif, badge dimensi, dan badge populer.
- Floating action button untuk tambah item.
- Pull-to-refresh memuat ulang katalog, vendor, kategori, dan pending queue.

Form tambah/edit:

- Nama Produk wajib.
- Checkbox `Butuh dimensi (harga per m2)` tepat di bawah nama produk, sama seperti web terbaru.
- Bila dimensi aktif, `nama_satuan` dikunci ke `m2` untuk payload API; UI boleh menampilkan `m2`.
- Kategori dari `/api/master/categories`.
- Harga Jual, Biaya Subkontrak, Vendor Maklon Bawaan, Metode Bayar Vendor (`CASH`, `TRANSFER`, `NET30`), Catatan Internal, Aktif.
- `Tandai Populer` tidak ditampilkan karena popularitas sudah otomatis dari penjualan/manual backend.

Pending Vendor/HPP:

- Tampil sebagai section ringkas di halaman Katalog Extra, bukan halaman terpisah.
- Jika tidak ada pending: empty state `Tidak ada baris pending`.
- Jika ada pending: kartu berisi faktur, tanggal, pelanggan, pekerjaan, jumlah, subtotal, dan tombol `Isi Vendor & HPP`.
- Bottom sheet reconcile meminta vendor subkontraktor, biaya subkontrak, dan metode bayar.
- Setelah sukses, reload pending queue dan katalog; invalidasi cache path terkait `katalog-maklon`, `pos`, `keuangan`, dan `penjualan`.

## API Tambahan untuk Flutter

Route yang sudah ada:

- `GET /api/katalog-maklon`
- `POST /api/katalog-maklon`
- `PUT /api/katalog-maklon/[id]`
- `DELETE /api/katalog-maklon/[id]`

Route yang perlu ditambahkan:

- `GET /api/katalog-maklon/pending`
- `POST /api/katalog-maklon/pending/[id]/reconcile`

Kontrak:

- `GET /pending` mengembalikan `{ pending: PendingMaklonRow[] }`.
- `POST /pending/[id]/reconcile` menerima:
  - `vendor_subkontrak_id`
  - `biaya_subkontrak`
  - `metode_bayar_vendor`
- Route reconcile memakai `requireOperationalRole`, validasi `reconcilePendingMaklonInputSchema`, dan meneruskan `dibuat_oleh` dari `session.uid`.
- Route harus menangani `AuthGuardError` dan mengembalikan status guard.

## Cache dan Invalidasi Flutter

`ApiClient._invalidateRelated` perlu mengenali:

- `/api/katalog-maklon` untuk invalidate katalog.
- `/api/katalog-maklon/pending` untuk invalidate katalog, POS, keuangan, penjualan, produksi.

Ini mengikuti pola cache mobile saat ini dan memastikan list fresh setelah create/update/delete/reconcile.

## Testing

Flutter:

- Model test untuk `KatalogMaklon` dan `PendingMaklon`.
- Widget smoke test untuk `KatalogExtraPage` loading state, search field, filter chips, dan empty state.
- Widget smoke test untuk `KatalogMaklonFormSheet` memastikan field utama, checkbox dimensi, metode `TRANSFER`, dan tombol simpan muncul.
- Widget test untuk `MaterialsPage` filter chips dan label tambahan yang baru.

Next.js/Jest:

- API route test untuk `GET /api/katalog-maklon/pending`.
- API route test untuk `POST /api/katalog-maklon/pending/[id]/reconcile`, termasuk validasi 422 dan AuthGuardError.

Verifikasi akhir:

- `npm run type-check`
- `npm run build`
- `npx jest src/app/api/katalog-maklon/__tests__/pending-route.test.ts`
- `cd flutter && flutter analyze`
- `cd flutter && flutter test test/models/katalog_maklon_model_test.dart test/features/katalog_extra_page_test.dart test/features/katalog_maklon_form_sheet_test.dart test/features/materials_page_test.dart`

## Risiko dan Mitigasi

- Risiko: Flutter memanggil route pending yang belum ada. Mitigasi: tambah route API sebelum service Flutter pending.
- Risiko: role Flutter menampilkan menu tetapi API menolak mutasi. Mitigasi: UI tetap menampilkan pesan server; tombol destructive dapat disembunyikan untuk role non-admin bila role tersedia.
- Risiko: field `m²` memakai karakter non-ASCII. Mitigasi: payload tetap memakai `m2` atau `m²` sesuai kontrak backend; UI Flutter boleh menampilkan `m2` agar ASCII konsisten.
- Risiko: Katalog Extra dan POS cache stale setelah reconcile. Mitigasi: perluasan `_invalidateRelated` dan force refresh setelah sukses.

## Self-Review Spec

- Tidak ada placeholder atau bagian yang belum diputuskan.
- Scope fokus pada Data Barang dan Katalog Extra, sesuai permintaan.
- Katalog Extra mencakup perubahan web setelah commit Flutter terakhir yang relevan untuk mobile.
- Data Barang tidak membawa fitur inventori berat yang tidak ada di Flutter saat ini.
- Route API tambahan eksplisit karena Flutter tidak dapat memakai server action.
