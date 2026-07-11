-- Barang maklon berdimensi: harga dihitung per m² (lebar × panjang × jumlah).
-- Additive, IF NOT EXISTS, default 0 (flat seperti sebelumnya).
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "butuh_dimensi_status" integer NOT NULL DEFAULT 0;
