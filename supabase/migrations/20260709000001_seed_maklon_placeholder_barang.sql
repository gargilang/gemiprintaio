-- Seed placeholder barang/harga untuk baris maklon agar FK item_penjualan valid.
-- Baris ini disembunyikan dari UI katalog barang oleh aplikasi.

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
