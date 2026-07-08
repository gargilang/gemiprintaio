-- Produk jual: pastikan constraint/index unik legacy berdasarkan satuan dihapus.
-- Aturan yang benar: unik berdasarkan nama produk efektif per barang
-- (nama_produk_jual jika diisi, fallback ke nama_satuan).

ALTER TABLE public.harga_barang_satuan
  DROP CONSTRAINT IF EXISTS harga_barang_satuan_barang_id_nama_satuan_key;

DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'harga_barang_satuan'
      AND indexname <> 'idx_harga_barang_satuan_nama_produk_unik'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%barang_id%'
      AND indexdef ILIKE '%nama_satuan%'
      AND indexdef NOT ILIKE '%nama_produk_jual%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_harga_barang_satuan_nama_produk_unik
  ON public.harga_barang_satuan (
    barang_id,
    lower(trim(coalesce(nullif(trim(nama_produk_jual), ''), nama_satuan)))
  );
