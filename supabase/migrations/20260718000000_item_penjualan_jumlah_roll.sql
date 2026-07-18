-- Simpan jumlah lembar asli barang berdimensi agar cetak ulang tidak menebak
-- kuantitas dari luas roll yang ditagihkan (yang dapat mencakup area terbuang).
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "jumlah_roll" integer;

ALTER TABLE "public"."item_penjualan"
  DROP CONSTRAINT IF EXISTS "item_penjualan_jumlah_roll_check";

ALTER TABLE "public"."item_penjualan"
  ADD CONSTRAINT "item_penjualan_jumlah_roll_check"
  CHECK ("jumlah_roll" IS NULL OR "jumlah_roll" >= 1);
