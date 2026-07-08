-- Produk jual: unik berdasarkan nama produk efektif per barang, bukan satuan.
-- Nama efektif = trim(nama_produk_jual) jika diisi, fallback ke nama_satuan.

ALTER TABLE public.harga_barang_satuan
  DROP CONSTRAINT IF EXISTS harga_barang_satuan_barang_id_nama_satuan_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_harga_barang_satuan_nama_produk_unik
  ON public.harga_barang_satuan (
    barang_id,
    lower(trim(coalesce(nullif(trim(nama_produk_jual), ''), nama_satuan)))
  );
