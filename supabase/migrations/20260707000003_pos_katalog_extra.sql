-- Sub-proyek C: POS & Katalog Extra. Additive, IF NOT EXISTS.
-- C2 + C5: item_penjualan pending + link katalog maklon.
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "pending_vendor_hpp" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."item_penjualan"
  ADD COLUMN IF NOT EXISTS "katalog_maklon_id" text;
ALTER TABLE "public"."item_penjualan"
  DROP CONSTRAINT IF EXISTS "item_penjualan_katalog_maklon_id_fkey";
ALTER TABLE "public"."item_penjualan"
  ADD CONSTRAINT "item_penjualan_katalog_maklon_id_fkey"
  FOREIGN KEY ("katalog_maklon_id") REFERENCES "public"."katalog_maklon"("id")
  ON DELETE SET NULL;

-- C4: lebarkan CHECK metode_bayar_vendor di item_penjualan supaya menerima TRANSFER.
ALTER TABLE "public"."item_penjualan"
  DROP CONSTRAINT IF EXISTS "item_penjualan_metode_bayar_vendor_check";
ALTER TABLE "public"."item_penjualan"
  ADD CONSTRAINT "item_penjualan_metode_bayar_vendor_check"
  CHECK ("metode_bayar_vendor" IS NULL OR "metode_bayar_vendor" IN ('CASH','NET30','TRANSFER'));

-- C4: lebarkan CHECK metode_bayar_vendor_default di katalog_maklon.
ALTER TABLE "public"."katalog_maklon"
  DROP CONSTRAINT IF EXISTS "katalog_maklon_metode_bayar_vendor_default_check";
ALTER TABLE "public"."katalog_maklon"
  ADD CONSTRAINT "katalog_maklon_metode_bayar_vendor_default_check"
  CHECK ("metode_bayar_vendor_default" IN ('CASH','NET30','TRANSFER'));

-- C5: populer_status manual override.
ALTER TABLE "public"."harga_barang_satuan"
  ADD COLUMN IF NOT EXISTS "populer_status" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "populer_status" integer NOT NULL DEFAULT 0;

-- C6: kategori_id FK + migrasi data free-text -> id.
ALTER TABLE "public"."katalog_maklon"
  ADD COLUMN IF NOT EXISTS "kategori_id" text;
ALTER TABLE "public"."katalog_maklon"
  DROP CONSTRAINT IF EXISTS "katalog_maklon_kategori_id_fkey";
ALTER TABLE "public"."katalog_maklon"
  ADD CONSTRAINT "katalog_maklon_kategori_id_fkey"
  FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_barang"("id")
  ON DELETE SET NULL;
UPDATE "public"."katalog_maklon" km
  SET "kategori_id" = kb.id
  FROM "public"."kategori_barang" kb
  WHERE km.kategori = kb.nama AND km.kategori_id IS NULL;
