-- Seed placeholder barang/harga untuk baris maklon agar FK item_penjualan valid.
-- Baris ini disembunyikan dari UI katalog barang oleh aplikasi.

-- Pastikan kategori 'cat-lain-lain' ada sebelum barang di-insert (migrasi
-- berjalan sebelum seed, jadi tidak bisa mengandalkan seed-default-values.sql).
INSERT INTO public.kategori_barang (id, nama, butuh_spesifikasi_status, urutan_tampilan)
VALUES ('cat-lain-lain', 'Lain-lain', 0, 8)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.barang (
  id,
  nama,
  deskripsi,
  kategori_id,
  satuan_dasar,
  jumlah_stok,
  average_cost_per_base_unit,
  level_stok_minimum,
  lacak_inventori_status,
  butuh_dimensi_status
)
VALUES (
  'barang-jasa-maklon',
  'Jasa Maklon Cetak',
  'Placeholder untuk pekerjaan yang dikerjakan vendor subkontraktor (auto-generated, jangan diedit).',
  'cat-lain-lain',
  'pcs',
  0,
  0,
  0,
  0,
  0
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.harga_barang_satuan (
  id,
  barang_id,
  nama_satuan,
  faktor_konversi,
  harga_beli,
  harga_jual,
  harga_member,
  default_status,
  urutan_tampilan
)
VALUES (
  'harga-jasa-maklon-pcs',
  'barang-jasa-maklon',
  'pcs',
  1,
  0,
  0,
  0,
  1,
  0
)
ON CONFLICT (id) DO NOTHING;
