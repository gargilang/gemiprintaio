-- B2: scope BOM per produk jual + B3: default jumlah_roll = 1.
-- Kolom unit_price_id nullable: NULL = scope barang-level (backwards-compat),
-- non-NULL = scope eksklusif untuk produk jual itu. FK ON DELETE CASCADE supaya
-- hapus produk jual ikut hapus BOM yang scoped ke produk itu.
ALTER TABLE "public"."barang_komponen"
  ADD COLUMN IF NOT EXISTS "unit_price_id" "text";

ALTER TABLE "public"."barang_komponen"
  DROP CONSTRAINT IF EXISTS "barang_komponen_unit_price_id_fkey";
ALTER TABLE "public"."barang_komponen"
  ADD CONSTRAINT "barang_komponen_unit_price_id_fkey"
  FOREIGN KEY ("unit_price_id") REFERENCES "public"."harga_barang_satuan"("id")
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "barang_komponen_unit_price_id_idx"
  ON "public"."barang_komponen" ("unit_price_id")
  WHERE "is_deleted" = 0;

-- B3: jumlah_roll NOT NULL DEFAULT 1 (1 unit produk jual = 1 potong komponen,
-- bukan roll besar). Backfill NULL → 1 sebelum SET NOT NULL.
UPDATE "public"."barang_komponen"
  SET "jumlah_roll" = 1
  WHERE "jumlah_roll" IS NULL;

ALTER TABLE "public"."barang_komponen"
  ALTER COLUMN "jumlah_roll" SET DEFAULT 1;
ALTER TABLE "public"."barang_komponen"
  ALTER COLUMN "jumlah_roll" SET NOT NULL;
