-- Roll inventory per material width + actual SPK consumption.
-- Keeps the legacy barang.jumlah_stok quantity in m2 while tracking the
-- physical roll length per width in barang_roll_variants.

ALTER TABLE barang
  ADD COLUMN IF NOT EXISTS roll_inventory_status INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS barang_roll_variants (
  id TEXT PRIMARY KEY,
  barang_id TEXT NOT NULL REFERENCES barang(id) ON DELETE CASCADE,
  lebar_m REAL NOT NULL,
  panjang_tersedia_m REAL NOT NULL DEFAULT 0,
  average_cost_per_m2 REAL NOT NULL DEFAULT 0,
  aktif_status INTEGER NOT NULL DEFAULT 1,
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  CONSTRAINT barang_roll_variants_width_positive CHECK(lebar_m > 0),
  CONSTRAINT barang_roll_variants_length_nonnegative CHECK(panjang_tersedia_m >= 0),
  CONSTRAINT barang_roll_variants_unique_width UNIQUE(barang_id, lebar_m)
);

CREATE INDEX IF NOT EXISTS idx_barang_roll_variants_barang
  ON barang_roll_variants(barang_id, aktif_status, lebar_m);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS roll_variant_id TEXT REFERENCES barang_roll_variants(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS roll_width_m REAL;
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS linear_delta_m REAL;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'inventory_movements'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%movement_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.inventory_movements DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK(movement_type IN (
    'OPENING_BALANCE',
    'PURCHASE_RECEIPT',
    'SALE_ISSUE',
    'SALE_VOID',
    'SALE_RETURN',
    'PURCHASE_VOID',
    'PURCHASE_RETURN',
    'ADJUSTMENT',
    'WASTE',
    'ROLL_CONVERSION_OUT',
    'ROLL_CONVERSION_IN',
    'PRODUCTION_ISSUE',
    'PRODUCTION_WASTE'
  ));

CREATE INDEX IF NOT EXISTS idx_inventory_movements_roll_variant
  ON inventory_movements(roll_variant_id, dibuat_pada);

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS billed_panjang REAL;
ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS billed_lebar REAL;
ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS recommended_roll_width_m REAL;
ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS roll_inventory_deferred INTEGER NOT NULL DEFAULT 0;

ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS barang_id TEXT REFERENCES barang(id) ON DELETE SET NULL;
ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS billed_panjang REAL;
ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS billed_lebar REAL;
ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS recommended_roll_width_m REAL;
ALTER TABLE item_produksi
  ADD COLUMN IF NOT EXISTS roll_inventory_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK(roll_inventory_status IN ('NOT_REQUIRED', 'PENDING', 'POSTED', 'VOIDED'));

CREATE TABLE IF NOT EXISTS production_material_consumptions (
  id TEXT PRIMARY KEY,
  item_produksi_id TEXT NOT NULL REFERENCES item_produksi(id) ON DELETE CASCADE,
  item_penjualan_id TEXT NOT NULL REFERENCES item_penjualan(id) ON DELETE CASCADE,
  barang_id TEXT NOT NULL REFERENCES barang(id),
  roll_variant_id TEXT NOT NULL REFERENCES barang_roll_variants(id),
  roll_width_m REAL NOT NULL,
  linear_used_m REAL NOT NULL,
  area_used_m2 REAL NOT NULL,
  billed_area_m2 REAL NOT NULL DEFAULT 0,
  waste_area_m2 REAL NOT NULL DEFAULT 0,
  movement_id TEXT REFERENCES inventory_movements(id),
  waste_movement_id TEXT REFERENCES inventory_movements(id),
  operator_id TEXT REFERENCES profil(id),
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED', 'VOIDED')),
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_production_consumptions_item
  ON production_material_consumptions(item_produksi_id, status);
CREATE INDEX IF NOT EXISTS idx_production_consumptions_roll
  ON production_material_consumptions(roll_variant_id, dibuat_pada);

ALTER TABLE barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE barang_roll_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_material_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_full_access ON barang_roll_variants;
CREATE POLICY anon_full_access ON barang_roll_variants
  FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS anon_full_access ON production_material_consumptions;
CREATE POLICY anon_full_access ON production_material_consumptions
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON barang_roll_variants TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON production_material_consumptions TO anon, authenticated, service_role;
