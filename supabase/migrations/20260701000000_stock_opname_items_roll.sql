-- supabase/migrations/20260701000000_stock_opname_items_roll.sql
-- Tambah kolom roll ke stock_opname_items untuk opname per variant.
-- Additive, idempotent (gunakan DO block untuk cek existence).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'roll_variant_id') THEN
    ALTER TABLE stock_opname_items ADD COLUMN roll_variant_id TEXT REFERENCES barang_roll_variants(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'roll_width_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN roll_width_m REAL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'system_linear_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN system_linear_m REAL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'counted_linear_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN counted_linear_m REAL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'stock_opname_items' AND column_name = 'delta_linear_m') THEN
    ALTER TABLE stock_opname_items ADD COLUMN delta_linear_m REAL;
  END IF;
END
$$;
